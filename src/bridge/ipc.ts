/**
 * IPC 桥：**前端唯一允许直接 `invoke` 的地方**。
 *
 * 别处一律 `import { api } from "@/bridge/ipc"` 再调 `api.doc.save(...)`。
 * 理由不是洁癖：命令名是字符串，散在组件里改一次要全仓搜；集中在这里
 * 还能一并把返回值的形状标出来（`invoke` 本身是 `any`，等于把类型安全丢在边界上）。
 *
 * 命名对应关系：`api.docSave` ↔ Rust 侧 `nota_doc_save` ↔ `commands::document::nota_doc_save`。
 *
 * ⚠️ **形状不在本文件**（2026-09-26 起）：所有 `interface` / `type` 搬去了
 * `bridge/types.ts`（那次是这边 1035 行顶破了硬线）。本文件只管**命令通道**——
 * `api` 那些 `invoke` 调用。事件订阅与频道名 2026-10-17 搬去了
 * `bridge/ipc-events.ts`（新增打印接口后本文件到 1006 行），这里原样再导出，
 * 所以 `import { events, on } from "@/bridge/ipc"` 的调用点一处都没改。
 * `export * from "./types"` 也让所有类型照旧能从本文件引到。
 */

import { invoke } from "@tauri-apps/api/core";

import type {
  AppLang, Diagnostics, DiffLine, DocId, DocThemeInfo, Document, FocusState, ImagePlaced,
  ImageSourceArg, ImageUploadSettings, ImageUploadSnapshot, ImageUploaded,
  NativeMenuNode, PandocExport, PandocImport, PandocProbe, PluginInfo, PluginMenuItem,
  PluginPanel, PluginReview, Settings, TreeNode, TreeOptions, UiStyleInfo, 信任记录, 导出报告,
  PickerEntry, PickerPlace, PluginUpdateInfo, PluginUpdateResult, UpdateInstallResult, UpdateStatus,
  会话, 路径种类, 拼写词典, PrintEnvironment, PrintPreview,
} from "./types";
import type {
  SettingsExportInventory,
  SettingsExportReport,
  SettingsExportRequest,
} from "./types-settings-export";
// ⚠️ 这一条是**类型专线**：`选区快照` 的家在编辑器那一侧
// （`editor/caret-snapshot.ts`，它的文件头就是这张表的设计说明），
// 不搬进 `bridge/types.ts`——搬过去会让"桥"这个模块变成选区的定义者，
// 而桥对这一格的全部职责只是**转手**（`text`／`empty` 两个字段照抄给 Rust）。
// `import type` 编译后整行消失，所以不会把 ProseMirror 拖进桥里。
import type { 选区快照 } from "@/editor/caret-snapshot";

export * from "./types";
export { events, on } from "./ipc-events";

// ── 文档 ──────────────────────────────────────────────────────────────────
export const api = {
  picker: {
    places: () => invoke<PickerPlace[]>("nota_picker_places"),
    list: (path: string, showHidden: boolean) =>
      invoke<PickerEntry[]>("nota_picker_list", { path, showHidden }),
    createDir: (parent: string, name: string) =>
      invoke<string>("nota_picker_create_dir", { parent, name }),
  },

  /**
   * **诊断信息**（「关于 → 故障排除」那一页）。
   *
   * ⚠️ 它起子进程问 `uname` 一类的（见 `src-tauri/src/commands/diagnostics.rs`
   * 那条 `spawn_blocking`），所以**别在渲染里调**——那一页是打开时才拉一次。
   */
  diagnostics: {
    /** 采一份编译信息 ＋ 本机信息。取不到的格子是空串，不报错。 */
    collect: () => invoke<Diagnostics>("nota_diagnostics"),
  },

  /**
   * 实验性应用更新。清单地址固定在宿主，前端不能传入 URL。
   * 宿主按当前安装类型选择 deb、rpm、AppImage、便携 EXE 或安装器 EXE。
   */
  update: {
    check: () => invoke<UpdateStatus>("nota_update_check"),
    install: () => invoke<UpdateInstallResult>("nota_update_install"),
  },

  doc: {
    create: () => invoke<DocId>("nota_doc_new"),
    /** 新建一份带初始正文的未命名文档。导入转换结果走这条。 */
    createWithText: (text: string, titleHint: string | null = null) =>
      invoke<DocId>("nota_doc_new_with_text", { text, titleHint }),
    open: (path: string) => invoke<DocId>("nota_doc_open", { path }),
    /** 前端推文本给后端。返回新 revision。**意思是"用户改了"。** */
    sync: (id: DocId, text: string) => invoke<number>("nota_doc_sync", { id, text }),
    /**
     * 编辑器**装载完之后**把文本交回来认领——**意思是"编辑器把文件规范化成了这样，
     * 用户还没碰"**。与 `sync` 只差一个 `dirty` 的判法，别混用（BUG-12）。
     */
    settle: (id: DocId, text: string) => invoke<number>("nota_doc_settle", { id, text }),
    /**
     * **编辑器报上来的选区快照**（`docs/07` 第 14 项，2026-10-04 加）。
     *
     * ⚠️ 与 `sync` **不是一回事**：`sync` 推的是**正文**（"用户改了"），
     * 这条推的是**光标**（"用户选了什么 / 光标在哪"）。两条路各走各的去抖——
     * 只挪光标不改字的时候**只有这一条会响**。
     *
     * ⚠️ 它是**旁路**：宿主那份只是镜像的一份快照，推丢了不影响正文，
     * 下一笔事务会补上（`ui/EditorPane.tsx` 的 `记快照` 里那条注解）。
     */
    cursor: (id: DocId, 快照: 选区快照) =>
      invoke<void>("nota_doc_cursor", { id, text: 快照.text, empty: 快照.empty }),
    save: (id: DocId, path?: string) =>
      invoke<string>("nota_doc_save", { id, path: path ?? null }),
    /**
     * **重命名 / 移动**（2026-09-27，`docs/10` §2 那一格）。
     *
     * ⚠️ 两个传的都**不是整条路径**：`rename` 收的是**新名字那一段**
     * （`Nota.md`），`move` 收的是**目标目录**。整条路径由宿主从它自己
     * 记着的那份上拼出来——前端手里那个 `path` 是**有损**的
     *（`path_string()`），拿它拼会把非 UTF-8 的目录名拼成 `?` 开头的
     * 另一个目录。理由与 `cli.rs` / `single_instance.rs` 那两处同一条。
     *
     * ⚠️ 返回值是**落点**（给提示条用）。挪失败会抛错，**抛错时盘上什么都
     * 没动**（目标已存在、源不在了、跨设备复制中途失败都会抛）。
     */
    rename: (id: DocId, name: string) =>
      invoke<string>("nota_doc_rename", { id, name }),
    move: (id: DocId, dir: string) => invoke<string>("nota_doc_move", { id, dir }),
    close: (id: DocId) => invoke<void>("nota_doc_close", { id }),
    setActive: (id: DocId) => invoke<void>("nota_doc_set_active", { id }),
    get: (id: DocId) => invoke<Document>("nota_doc_get", { id }),
    list: () => invoke<Document[]>("nota_doc_list"),
    reload: (id: DocId) => invoke<Document>("nota_doc_reload", { id }),
    /**
     * 读**磁盘上**那一份，**不改任何状态**（外部改动提示条的「查看修改」用）。
     *
     * ⚠️ 与 `reload` 是两件事：`reload` 会把内存里那份也换掉，那是「重新载入」
     * 那个按钮干的事。这里只读一眼。
     */
    diskText: (id: DocId) => invoke<string>("nota_doc_disk_text", { id }),
    hasUnsaved: () => invoke<boolean>("nota_doc_has_unsaved"),
  },

  /**
   * **页面引擎（webview）身上的开关**：目前只有拼写检查。
   *
   * ⚠️ 这三条是 `async` 命令（`commands/webview.rs`）：它们要过一次主线程去
   * 问 WebKitGTK，而同步命令**本身就在主线程上**——那样会自己等自己。
   * 前端看不出差别，但改那几条命令时要记得别把 `async` 去掉。
   *
   * ⚠️ `set` 返回的是**引擎读回来的值**，不是"我们请求的那个值"（本仓的老口径：
   * 状态从被改的那个东西身上读回来）。两者不一致时界面要如实说一句。
   */
  webview: {
    /** 拼写检查现在开着没有、真加载着哪几本词典。⚠️ **目前没有调用方**（备用）。 */
    spellcheckGet: () =>
      invoke<{ on: boolean; languages: string[] }>("nota_webview_spellcheck_get"),
    /** 打开 / 关掉拼写检查，返回**改完之后引擎说的值**。 */
    spellcheckSet: (on: boolean) => invoke<boolean>("nota_webview_spellcheck_set", { on }),
    /**
     * 换拼写检查用的语言（`languages` 空数组 = **跟随系统**）。
     *
     * ⚠️ 返回的是**引擎真加载着的那几本词典**，不是我们请求的那几个：
     * 请求了机器上没装的语言时回来的是空的（一本词典都没加载 ⇒ 一个字都不检查）。
     * 前端拿它说那句"这个语言没有词表"。
     */
    spellcheckLanguagesSet: (languages: string[]) =>
      invoke<string[]>("nota_webview_spellcheck_languages_set", { languages }),
    /**
     * **关掉引擎的"平滑滚动"**（触摸板要"硬"的，2026-10-11 用户报的"贝塞尔曲线 + 延迟"）。
     *
     * ⚠️ 用户**没有开关**：这是手感上的抱怨，不是一条偏好——多给一格设置就多一处
     * "这个平台做不到"的解释成本。别的平台（WebView2）没有这个接口，宿主那边是空实现。
     */
    scrollHard: () => invoke<void>("nota_webview_scroll_hard"),
  },
  /**
   * 路径**是什么**（拖放那条路用，`ui/useFileDrop.ts`）。
   *
   * ⚠️ 返回值与入参**一一对应**（同长度、同顺序）：前端是按下标把"是什么"
   * 对回"哪一条路径"的。少一条或者挪一位的症状是**拖进来的名字和打开的东西
   * 对不上**，而那种错没有人会往这个方向查。
   */
  /**
   * **拼写检查**（2026-10-11，走 `src-tauri/src/spell/` 那一层**自己的后端**，
   * 与浏览器内核无关）。⚠️ 三种失败分得很清：后端没装 / 这本词典没有 / 一个都没错
   * ——判据在 `spell/mod.rs` 文件头。
   */
  spell: {
    /** 查一批词，返回**拼错的那几个的下标**（按入参顺序）。 */
    check: (lang: string, words: string[]) =>
      invoke<number[]>("nota_spell_check", { lang, words }),
    /** 给一个词的建议（右键菜单那一列）。拿不到就是空表，不报错。 */
    suggest: (lang: string, word: string) =>
      invoke<string[]>("nota_spell_suggest", { lang, word }),
    /**
     * **这台机器上有哪些词典**（右键菜单、设置页那一格都用它）。
     *
     * ⚠️ 列的是"**我们的引擎读得了的**"（用户目录 ＋ 系统目录里的 `.aff`/`.dic`），
     * 不是"enchant 认哪些标签"——两个问题的答案不一样，理由写在
     * `src-tauri/src/spell/store.rs::列出` 那段。
     */
    dictionaries: () => invoke<拼写词典[]>("nota_spell_dictionaries"),
    /** 用户词典目录（设置页那一行"打开文件夹"用）。 */
    dictDir: () => invoke<string>("nota_spell_dict_dir"),
    /**
     * **在文件管理器里打开用户词典目录**，返回那个目录的路径。
     *
     * ⚠️ "打开"这一步在**宿主**：理由与 `settings.openDir()` 同源（BUG-27，
     * 前端自己开要过 ACL 的 path scope，而本仓的目录口径在 `paths.rs` 的 XDG 里）。
     * 这一处还多一件事——`dictionaries/` **可能还不存在**，宿主会先把它建出来。
     */
    dictReveal: () => invoke<string>("nota_spell_dict_reveal"),
    /**
     * **导入一个 `.zip` 词典包**，返回装进去的语言标签。
     *
     * ⚠️ `path` 由前端用应用内文件选择器问出来：
     * 命令不带路径、宿主调系统选择器那种写法在这里更要命——它会把**选文件**这件
     * 事的失败（用户点了取消）和**装词典**的失败混成一个错误。
     */
    dictImport: (path: string) => invoke<string>("nota_spell_dict_import", { path }),
    /** 「加入词典」：写进用户词表，**以后一直算对**。返回真正写进去的那个词。 */
    wordAdd: (word: string) => invoke<string>("nota_spell_word_add", { word }),
    /**
     * 「忽略」：**只在本次运行里**不再标它（重开软件照旧）。
     *
     * ⚠️ 与 `wordAdd` 分开是**必须的**：一个是"这个词是对的"（落盘），一个是
     * "这一篇里别烦我"（不落盘）。并成一个的话用户点哪一次都是猜。
     */
    wordIgnore: (word: string) => invoke<string>("nota_spell_word_ignore", { word }),
  },
  pathKind: (paths: string[]) =>
    invoke<路径种类[]>("nota_paths_kind", { paths }),
  workspace: {
    open: (path: string) => invoke<string>("nota_workspace_open", { path }),
    close: () => invoke<void>("nota_workspace_close"),
    get: () => invoke<string | null>("nota_workspace_get"),
    /**
     * 取一层（或 `depth` 层）文件树。
     *
     * `opts` 是**这一次**要用的口径（排序 / 过滤 / 隐藏文件），见
     * `ui/tree-options.ts`：那边写了为什么它必须随请求带、而不是让宿主自己
     * 去读设置。⚠️ **不传时宿主回落到 `[files]` 表**，所以这不是必填项。
     */
    tree: (subPath?: string, depth?: number, opts?: TreeOptions) =>
      invoke<TreeNode[]>("nota_workspace_tree", {
        subPath: subPath ?? null,
        depth: depth ?? 1,
        opts: opts ?? null,
      }),
  },

  /**
   * 界面语言。**启动时拉一次**（`App.tsx`），拿到就 `定语言(effective)`
   * （`src/i18n/index.ts`）。
   *
   * ⚠️ `effective` 是**启动时算好的那个**，不是现算的：用户改了设置还没重启
   * 的那段时间里，插件用的仍是旧的那份文案，这里就必须说旧的。
   */
  appLang: () => invoke<AppLang>("nota_app_lang"),

  settings: {
    get: () => invoke<Settings>("nota_settings_get"),
    set: (settings: Settings) => invoke<void>("nota_settings_set", { settings }),
    exportInventory: () =>
      invoke<SettingsExportInventory>("nota_settings_export_inventory"),
    exportPackage: (request: SettingsExportRequest) =>
      invoke<SettingsExportReport>("nota_settings_export", { request }),
    /**
     * 在系统的文件管理器里打开设置文件所在的那个目录（一般是
     * `~/.config/nota`），返回打开的是哪个路径。
     *
     * ⚠️ **"打开"这一步也在后端**（前端只负责说话）。前端拿路径再用
     * plugin-opener 的 `openPath` 去开是**另一条路**，那条要过 Tauri 的 ACL、
     * 得配 path scope，而 scope 跟 `$APPCONFIG` 走、与本仓 `paths.rs` 的口径
     * 不一定同一个目录——2026-09-25 的 BUG-27 就是踩了这个。命令自己取路径
     * 自己开则没有这个错位，也顺带让"前端拼 `~/.config/nota`"变得不可能。
     */
    openDir: () => invoke<string>("nota_settings_open_dir"),
    /**
     * 开机读设置时出的问题，读成功是 `null`。
     *
     * ⚠️ 拉它的地方在 `App.tsx` 启动那一段，拿到非空值就弹一条 error toast。
     * 它的意义只有一个：解析不了 `settings.toml` 时宿主会退回默认值继续跑
     * （这是对的，一份坏文件不该拦着人进界面），**但用户得知道眼前这份
     * 是默认值**——不然就是"我的设置自己变回默认了"。
     */
    problem: () => invoke<string | null>("nota_settings_problem"),
    /**
     * 恢复出厂默认，**返回新的那一份**。
     *
     * ⚠️ 拿返回值去 `setSettings`，别自己再 `get` 一次：中间那一小段窗口里
     * 界面还是旧的，"恢复默认之后有几行没跟着变回去"最不让人信任设置。
     */
    reset: () => invoke<Settings>("nota_settings_reset"),
  },

  /**
   * 原生菜单（macOS）。
   *
   * ⚠️ 返回值是**"挂上了没有"**，前端据此决定藏不藏自绘菜单栏——
   * **不要**改成"按平台判断"。见 `commands/menu.rs` 那段。
   */
  nativeMenu: {
    apply: (nodes: NativeMenuNode[]) => invoke<boolean>("nota_native_menu_apply", { nodes }),
  },

  /**
   * 导出与打印。
   *
   * ⚠️ **HTML 是前端生成的**（`editor/export.ts`：那边才有文档树、文档主题
   * 和 `editor.css`）。这里两条命令只干 IO——"把这段文本写到这个路径"和
   * "写一份临时文件交给系统默认程序"。渲染不挪到后端去——那会变成第二套
   * 渲染实现。
   */
  export: {
    /** 写到用户选的路径。返回真实写出去的路径（对话框可能改了它）。 */
    write: (path: string, content: string) =>
      invoke<string>("nota_export_write", { path, content }),
    /**
     * 写**二进制**（分享图的 PNG）。`base64` 是标准 base64（带不留白的 `=` 补位）。
     *
     * ⚠️ 走 base64 而不是把字节直接塞进 JSON：IPC 那条路是 JSON，字节数组会被
     * 逐个数成十进制再逐个数读回来（一张 1080×1350 的图要几百万个数字），
     * 而 base64 只长 33%，而且两端都有现成的编解码器。前端那头是
     * `share-card.ts::转base64`（用 canvas 的 `toDataURL`，不手写编码）。
     */
    writeBytes: (path: string, base64: string) =>
      invoke<string>("nota_export_write_bytes", { path, base64 }),
    /** 打印的**老路**（非 Linux 兜底）：写 HTML → 交给系统默认程序。⚠️ `docPath` 决定落点（相对图片才解析得对）。 */
    print: (docPath: string | null, title: string, content: string) =>
      invoke<string>("nota_export_print", { docPath, title, content }),
    /**
     * 在文件管理器里**定位**一个文件（选中它，不是打开它）。
     *
     * 导出设置里那条「导出后打开所在目录」用它。**是定位不是打开**：打开会把
     * PDF 塞进某个看图程序里，而用户此刻多半是想把文件拖到别处去。
     */
    reveal: (path: string) => invoke<string>("nota_export_reveal", { path }),
  },

  /** 应用内打印（2026-10-17）：先印 PDF → 拿同一份 PDF 出预览 → 投给打印机。⚠️ 只有 Linux（PDF 靠 WebKitGTK），别处走 `export.print` 老路。 */
  print: {
    /** 有没有应用内打印（Linux 才有）。⚠️ 没有就走 `export.print` 那条老路，**不是**报错。 */
    supported: () => invoke<boolean>("nota_print_supported"),
    /** 这台机器上有哪些打印机。**空数组不是错**：没装 CUPS 的机器上就是没有。 */
    printers: () => invoke<PrintEnvironment>("nota_print_printers"),
    /** 出 PDF ＋ 逐页预览图（data URL）。⚠️ 参数扁平；JS 的 camelCase 由 Tauri 映射到 snake_case。 */
    prepare: (req: {
      html: string;
      baseDir: string | null;
      paper: string;
      landscape: boolean;
      marginMm: number;
    }) =>
      invoke<PrintPreview>("nota_print_prepare", req),
    /** 应用内没有打印机时，直接打开系统打印对话框。 */
    system: (req: {
      html: string;
      baseDir: string | null;
      paper: string;
      landscape: boolean;
      marginMm: number;
    }) => invoke<void>("nota_print_system", req),
    /** 把那份 PDF 投给打印机，返回 CUPS 任务号。 */
    send: (req: {
      pdf: string;
      printer: string;
      copies: number;
      ranges: string | null;
    }) => invoke<string>("nota_print_send", req),
    /** 把预览过的那份 PDF 另存到用户选中的路径。 */
    savePdf: (pdf: string, target: string) =>
      invoke<string>("nota_print_save_pdf", { pdf, target }),
  },

  /**
   * 插入图片：把一张图搬到该去的地方，拿回该写进文档的那条地址。
   *
   * ⚠️ **算式全在宿主**（`src-tauri/src/image.rs`）：五个插入动作、两个适用范围
   * 开关、三个语法偏好都由它一处算出来。前端**不自己拼路径**——拼的话，
   * 复制到 `./assets` 的路径规则就会有两份实现（对话框一份、粘贴一份），
   * 而它们迟早不一样。
   *
   * ⚠️ 这条命令**会碰磁盘、也可能联网**（规则里对网络图片开着时会下载，
   * 最长 30 秒），所以界面上该有个"忙"态。开了自动上传时它还会**多发一次
   * 上传**（最长 60 秒，见 `upload/net.rs`），返回值里的 `upload` 说明那一步
   * 成没成。
   */
  image: {
    place: (docId: DocId | null, source: ImageSourceArg) =>
      invoke<ImagePlaced>("nota_image_place", { docId, source }),
    /** 本地图片 → data URL。用于编辑区显示绝对路径、SVG 与中文路径。 */
    dataUrl: (path: string) => invoke<string>("nota_image_data_url", { path }),
    /**
     * 上传服务器设置（读 / 写 / 手动传一张）。
     *
     * ⚠️ **不走 `settings` 那一套**：它不在 `settings.toml` 里，而是自己一份
     * 0600 的 `~/.config/nota/image-upload.toml`（理由见 `types.ts` 里
     * `ImageSettings` 那条注释的下半段）。所以设置页上这一组是**自己读自己写**
     * 的，不走 `paneWriter`。
     *
     * ⚠️ `get` 要 `docId`：返回值里那个 `willAutoUpload` 是"**这份文档**里插图
     * 会不会自动传"，跟前件有关。`one` 那条**只回地址、不碰文档**
     * （写进去是前端的事，这样撤销栈仍然只有一条路）。
     */
    uploadGet: (docId: DocId | null) =>
      invoke<ImageUploadSnapshot>("nota_image_upload_get", { docId }),
    uploadSet: (settings: ImageUploadSettings) =>
      invoke<void>("nota_image_upload_set", { settings }),
    uploadOne: (docId: DocId | null, source: ImageSourceArg) =>
      invoke<ImageUploaded>("nota_image_upload_one", { docId, source }),
  },

  /**
   * 借**系统里那个 pandoc** 导出（PDF / Word / RTF / EPUB / LaTeX / ODF / OPML）。
   *
   * ⚠️ Nota **不自带** pandoc、也**不下载**它：这里只是探测系统里有没有，
   * 有就借来用。理由与"为什么设置里没有 pandoc 路径"见 `docs/10` §6 与
   * `src-tauri/src/pandoc.rs` 文件头。
   */
  pandoc: {
    /**
     * 本机装没装。⚠️ 它要起一个进程问版本（毫秒级），所以别在渲染里调。
     */
    probe: () => invoke<PandocProbe>("nota_pandoc_probe"),
    /**
     * 导出一次。
     *
     * ⚠️ `docPath` 的**父目录**是相对路径（`![](./img.png)`）的基准：pandoc 要靠它
     * 找到图片，和打印那条路同一个理由。
     *
     * ⚠️ `html` **只有 PDF 用得上**：pandoc 那条路走不通时，后端拿它走 Nota 自带
     * 的排版（WebKit 打印）。返回值里的 `route` 会说明这次到底走了哪条。
     *
     * ⚠️ `themeCss`（2026-10-10 加，`docs/07` 第 112 项）是**当前文档主题的原始
     * CSS**：后端只把它交给**吃得下 CSS 的格式**（今天只有 EPUB），其余几种
     * 的出口是 `pandocArgs` 那一格。空串＝无主题。
     *
     * ⚠️ `pandocArgs` 是用户在「设置 → 导出」里写的**额外参数**（原样搬过去，
     * **前端不解析**——分词只有后端一处实现，见 `pandoc.rs::分词`）。
     */
    export: (args: {
      format: string;
      markdown: string;
      target: string;
      docPath: string | null;
      html: string | null;
      themeCss: string;
      pandocArgs: string;
    }) =>
      invoke<PandocExport>("nota_pandoc_export", {
        format: args.format,
        markdown: args.markdown,
        target: args.target,
        docPath: args.docPath,
        html: args.html,
        themeCss: args.themeCss,
        pandocArgs: args.pandocArgs,
      }),
    /**
     * 把 Word / RTF / LaTeX / EPUB / OpenDocument 转成 Markdown。
     *
     * `source` 是用户在打开对话框里选中的原文件。命令返回正文与警告，不直接建
     * 标签；新文档的生命周期仍由前端 `useDocuments` 统一管理。
     */
    importFile: (format: string, source: string) =>
      invoke<PandocImport>("nota_pandoc_import", { format, source }),
  },

  /**
   * **两段文本的逐行差异**（统一格式，`src-tauri/src/diff.rs`）。
   *
   * 用户 2026-09-26 点的：「**将 diff 预览加入核心库调用吧。调用率挺高**」。
   * 在此之前这件事只有插件能要（`nota.diff.make`），核心自己反而拿不到。
   *
   * ⚠️ 与 `editor/review.ts` 那份前端 LCS **不是一回事**，两边都别想合并：
   * 这一份是**行级**的，产出是"给人看的统一格式"；那一份是**单元级**的
   *（源码模式按行、所见即所得按块，而一个块可以是多行的表格），产出是
   * "装饰该挂在哪儿"。边界写在 `commands/diff.rs` 文件头那张表里。
   */
  diff: {
    /**
     * @param context 每段改动前后**各**露几行没变的（`git diff -U n` 的那个 n）。
     *                不给就是 3（与 `nota.diff.make` 同一个默认值）。
     *
     * ⚠️ 形参是 `before` / `after`，**不是 `old` / `new`**：`new` 是 JS 保留字，
     * 写成形参当场编译不过（TS1359，2026-09-26 踩过）。宿主那边也叫这个名字，
     * 两边一致，中间不必再翻译一次。
     */
    texts: (before: string, after: string, context?: number) =>
      invoke<DiffLine[]>("nota_diff_texts", { before, after, context: context ?? null }),
  },

  /**
   * 会话与最近文件：上次开着哪几份、最近打开过哪些、每份滚到哪儿。
   *
   * ⚠️ 全部是**记忆**，不是文档内容：删掉那份侧车（`~/.local/share/nota/session.toml`）
   * 只会让标签不恢复、最近列表空掉、滚动回到顶上，正文一个字节都不动。
   *
   * ⚠️ 宿主**读的时候会滤掉已经不存在的路径**：`recent` 里拿到的都是现在
   * 点得动的。点了一条已经没有的文件时，除了报错那条提示，还要调
   * `forgetRecent` 把它忘掉——不然它永远点不动、也永远赖在列表里。
   */
  session: {
    /** 取整份会话。**文件不在是正常的**（第一次启动），返回的是空的那一份。 */
    get: () => invoke<会话>("nota_session_get"),
    /**
     * 记下"现在开着哪几份、前台是哪一份"。
     *
     * ⚠️ 前端**去抖**调它（切标签、关标签、开文件之后各一次），与 `doc.sync`
     * 那条 300ms 去抖同理：落盘是整体重写。
     */
    setOpen: (open: string[], active: string | null) =>
      invoke<void>("nota_session_set_open", { open, active }),
    /** 记一份文档的滚动位置。`ratio` 是 **0~1 的比例**，不是像素。 */
    setScroll: (path: string, ratio: number) =>
      invoke<void>("nota_session_set_scroll", { path, ratio }),
    /** 把一条「最近」忘掉（点了一条已经不存在的文件之后）。 */
    forgetRecent: (path: string) => invoke<void>("nota_session_forget_recent", { path }),
    /** 清空整份会话（设置页那颗"忘掉最近打开的文件"）。**不删任何文件。** */
    clear: () => invoke<void>("nota_session_clear"),
    /** 侧车路径（设置页显示"存在哪"）。 */
    file: () => invoke<string | null>("nota_session_file"),
  },

  /**
   * 外部改动监视：**报一遍"现在打开着哪些文件"**。
   *
   * ⚠️ 是**整份报**、不是增删两条（见 `src-tauri/src/watch.rs` 里那段）。
   * 调用点只有一个：文档列表（或它们的路径）变了的时候，`ui/useExternalChanges.ts`。
   *
   * ⚠️ 没存过盘的新文档（没有 `path`）**不要传**——没有文件可盯。
   */
  watch: {
    sync: (docs: Array<{ id: DocId; path: string }>) =>
      invoke<void>("nota_watch_sync", { docs }),
  },

  /**
   * 文档主题。**只作用于编辑区**，与 `settings.ui_style` / `ui_mode` 无关。
   */
  theme: {
    /** 列出所有文档主题（内置的 ＋ 用户目录里的）。目录不存在不算错。 */
    list: () => invoke<DocThemeInfo[]>("nota_doc_themes"),
    /**
     * 取一份文档主题的 **CSS 文本**。限域在前端做（`styles/doc-theme.ts`），
     * 所以这里要的是文本，不是渲染结果——`<link>` 进来的是渲染结果，没法限域，
     * 那正是上一版文档主题会渗进外壳的原因。
     *
     * ⚠️ 入参是 **id 不是路径**：路径由后端自己拼，前端拿不到"读任意文件"的能力。
     */
    css: (id: string) => invoke<string>("nota_doc_theme_css", { id }),
    /**
     * 建好用户主题目录并在系统的文件管理器里打开它，返回打开的是哪个路径。
     *
     * ⚠️ 与 `settings.openDir()` 同源（BUG-27）：**"打开"这一步在后端**，
     * 不让前端拿路径去调 plugin-opener。
     */
    openDir: () => invoke<string>("nota_doc_themes_open_dir"),
  },

  /**
   * 界面风格里**用户导入的那一半**（内置档由打包好的 CSS 负责）。
   *
   * ⚠️ 与 `theme` 是一对，但**注入方式正好相反**：文档主题取回来的 CSS 必须
   * 限域（只作用编辑区），界面风格取回来的**原样注入**——它要改的就是外壳。
   * 那条差别写在 `styles/ui-style.ts` 顶上。
   */
  uiStyle: {
    /**
     * 列出所有可用的界面风格（内置的 ＋ 用户目录里的）。
     * 目录不存在不算错，内置档照样在。
     */
    list: () => invoke<UiStyleInfo[]>("nota_ui_styles"),
    /**
     * 取一份**用户导入的**界面风格的 CSS 文本。
     *
     * ⚠️ **内置那几档没有文件**，对它们调这条会报错——只在 `list()` 报
     * `builtin: false` 时才该调它。
     * ⚠️ 入参是 **id 不是路径**：路径由后端自己拼，前端拿不到"读任意文件"的能力。
     */
    css: (id: string) => invoke<string>("nota_ui_style_css", { id }),
    /** 建好用户风格目录（`~/.config/nota/ui-styles`）并在文件管理器里打开它。 */
    openDir: () => invoke<string>("nota_ui_styles_open_dir"),
  },

  plugin: {
    list: () => invoke<PluginInfo[]>("nota_plugins_list"),
    /**
     * 启用 / 停用一个插件。
     *
     * ⚠️ **两个方向都是真的装卸**：停用会把它的 Lua 状态整个丢掉、启用会重跑一遍
     * `on_load`（见 `plugin/mod.rs::set_enabled`）。所以调完之后**必须重拉三样**
     * （`list` / `panels` / `menus`）——被停用的插件声明的面板和菜单项都该消失。
     *
     * ⚠️ 它**会跑插件代码**（`on_load` 里可能有 git、HTTP），所以后端放在阻塞
     * 线程上、返回可能要等一会儿。按钮该有个"忙"态。
     */
    setEnabled: (id: string, enabled: boolean) =>
      invoke<void>("nota_plugin_set_enabled", { id, enabled }),

    /**
     * 从一个插件包（`.nota-plugin` / `.zip`）或一个目录装一个插件。返回它的 id。
     *
     * `path` 由前端用应用内文件选择器问出来：
     * 宿主不自己弹框——那是界面的事，而且宿主弹框在无头测试里没法验。
     *
     * ⚠️ **只有 `path` 一个参数。** 这里曾经多一个 `trust`，但宿主那条命令根本
     * 没声明它——Tauri 会把多余的字段静静丢掉，所以那个参数从头到尾没起过作用，
     * 只是让读代码的人以为"装的时候能一并信任"。信任是**装完之后**的另一个动作
     * （`trust(id)`，界面上是插件行上那颗「信任」）。
     */
    install: (path: string) => invoke<string>("nota_plugin_install", { path }),

    /**
     * 卸掉一个插件：磁盘上删掉、内存里拿掉、账本上忘掉。
     *
     * ⚠️ **不可逆**（插件目录真的没了），调用方**必须先问一句**。
     * ⚠️ 插件自己的设置文件（`plugin-settings/<id>.toml`，AI 的 API key 在那里）
     * **不删**——那是用户的东西。
     * ⚠️ 内置插件卸不掉（后端会报错让你改用停用）。
     */
    uninstall: (id: string) => invoke<void>("nota_plugin_uninstall", { id }),

    /**
     * 把一个已装的插件导出成一个 `.nota-plugin` 包（2026-09-27 加）。
     *
     * `path` 由前端用**应用内保存选择器**问出来，
     * 默认值拿 [`exportName`]；宿主不自己弹框——与 `install` 是同一个分工。
     *
     * ⚠️ 它**只读**：不碰插件、不碰设置、**不签名**。包里带不带那个签名块由后端按
     * "载荷还是不是签的那一份"判（`plugin/export.rs` 的文件头有两行表）——
     * 用户改过文件的话签名会被**摘掉**，因为带着一个对不上的签名会让收到的人
     * 装不上，而且报的是"这个包被改过"。
     */
    export: (id: string, path: string) =>
      invoke<导出报告>("nota_plugin_export", { id, path }),

    /**
     * 保存对话框里那个默认文件名（`<名字>-<版本>.nota-plugin`）。
     *
     * ⚠️ **别在前端用 `name + version` 自己拼**：清单里的 `name` 是作者写的，
     * 可以带斜杠、可以是个相对路径；拼路径的规则在本仓只该有一份实现
     * （`paths::安全文件名`，后端那条命令里）。
     */
    exportName: (id: string) => invoke<string>("nota_plugin_export_name", { id }),

    /**
     * 建好用户插件目录（`~/.local/share/nota/plugins`）并在文件管理器里打开它。
     * 一个插件都没装过时这个目录还不存在，所以后端会先建。
     */
    openDir: () => invoke<string>("nota_plugins_open_dir"),

    /** 信任这个插件的签名者（TOFU + 显式信任）。见 `plugin/package.rs` 那张表。 */
    trust: (id: string) => invoke<void>("nota_plugin_trust", { id }),

    /**
     * 把插件声明的一格设置写下去（2026-10-04 加：「设置 → 拓展」那一页上的滑杆）。
     *
     * ⚠️ **只有清单里声明过的那几格能写**（`[[settings]]`）：宿主拿 `(plugin, key)`
     * 去清单里对，对不上就拒。这是"前端能写什么"的唯一围栏——见
     * `commands/plugin.rs::nota_plugin_setting_set`。
     *
     * ⚠️ 值由宿主**夹进范围**再写（`SettingDecl::夹紧`），前端传越界的数不会出错，
     * 只是落到边界上。
     *
     * ⚠️ 写完宿主会发一条 `events.pluginPanel`（面板该重拉了）：插件那个面板
     * 读的就是这一格。`live` 的面板本来每秒都拉，那一声是给**不是 live** 的面板的。
     */
    /**
     * 写一格**插件自己声明的设置**（清单里的 `[[settings]]`）。
     *
     * ⚠️ `value` 是三种形状之一（滑杆是数、文本是字符串、开关是布尔），
     * 而**该是哪一种由插件在清单里声明**——宿主那边按 `SettingDecl::收值`
     * 校验（形状不对会报错，不是静默丢弃）。
     */
    setSetting: (plugin: string, key: string, value: string | number | boolean) =>
      invoke<void>("nota_plugin_setting_set", { plugin, key, value }),

    /** 信任库里现在有哪几把钥匙。 */
    trustList: () => invoke<信任记录[]>("nota_plugin_trust_list"),

    /**
     * 检查所有声明了 `[update] manifest` 的插件。
     *
     * 一份清单可以同时描述多个插件；同一地址在一轮检查里只读取一次。
     */
    updates: () => invoke<PluginUpdateInfo[]>("nota_plugin_updates"),

    /**
     * 更新一个插件。宿主重新读取清单、校验 SHA-256、验证签名者连续性，
     * 然后走原有的原子替换流程。
     */
    update: (id: string) => invoke<PluginUpdateResult>("nota_plugin_update", { id }),

    /**
     * 调插件命令。`plugin` **必须**是注册者自己的 id——
     * 别凭命令名去猜（见 `commands/plugin.rs` 里的告诫）。
     */
    call: (plugin: string, command: string, args?: unknown) =>
      invoke<unknown>("nota_plugin_call", { plugin, command, args: args ?? null }),
    findCommand: (command: string) =>
      invoke<string | null>("nota_plugin_find_command", { command }),

    /**
     * 插件声明的面板。**挂载后主动拉一次。**
     *
     * ⚠️ 早先这里配的是 `nota:plugin-panel` 事件，前端一个订阅者都没有，
     * 于是面板永远进不了界面（BUG-13）。**改回事件就会重现这个问题**：
     * `register_panel` 是在**插件加载时**（`setup()` 阶段）跑的，
     * 那时前端还没挂载，事件发出去没人收而且不报错——必漏，且漏得安静。
     *
     * ⚠️ 什么时候需要重拉（2026-09-25 起）：**启用 / 停用 / 装 / 卸之后都要**。
     * 面板清单只在**插件加载**时定，而这四件事都会真的加载或卸载
     * （见 `plugin/mod.rs::set_enabled`——停用是真的把 Lua 状态丢掉）。
     * 实现放在 `ui/usePlugins.ts::动作` 里，那四个动作跑完一律重拉。
     */
    panels: () => invoke<PluginPanel[]>("nota_plugin_panels"),

    /**
     * 一个面板**此刻**的内容。插件在 `register_panel` 里给的那个 `render`
     * 函数，宿主现调一次，把结果剥成 JSON 发过来。
     *
     * ⚠️ **返回类型是 `unknown`，这是刻意的。** 宿主只保证"是 JSON、
     * 有大小上限"（见 `lua/api/ui.rs::面板内容`），**不保证形状**——
     * 形状由 `ui/panel-nodes.ts::normalise` 一处校验并补齐默认值，
     * 之后渲染层拿到的是**全字段的类型**（`PanelNode`）。
     * 在这里标成 `PanelNode[]` 等于对宿主许下一个它没打算兑现的承诺：
     * 插件写错一个 `kind`，类型系统一声不吭。
     *
     * ⚠️ `plugin` 与 `id` **两个都要**：`id` 只在插件内部唯一。
     */
    panelContent: (plugin: string, id: string) =>
      invoke<unknown[]>("nota_plugin_panel_content", { plugin, id }),

    /**
     * 编辑区里此刻摊着哪一块（没有就是 `null`）。**挂载后主动拉一次。**
     *
     * ⚠️ 这里是**宿主的状态，不是插件的**：插件只是喊了一句
     * `nota.ui.review(id)`，宿主记下"现在摊这一格"。所以它**不经过插件代码**——
     * 插件正卡在一次慢调用里（宿主还抱着 `plugins` 锁）时，这个命令照样秒回，
     * 「回到正文」那颗按钮也照样能按。
     */
    review: () => invoke<PluginReview | null>("nota_plugin_review"),

    /**
     * 把编辑区里那一块收起来，切回正文。
     *
     * ⚠️ **前端可以直接收**（不必再调插件一条"关掉预览"的命令）：用户点了
     * 「回到正文」，那一下就该立刻生效。绕道插件的后果是——插件正忙 / 插件
     * 崩了 / 插件根本没写那条命令，三种情况都会让按钮点了没反应。
     *
     * ⚠️ `plugin` 传的是**当前摊着的那个插件**（`review().plugin`）：收起来只收
     * 它自己那一格，别把别的插件的摊子顺手端了（宿主那边 `ReviewState::set` 写明）。
     */
    reviewClose: (plugin: string) => invoke<void>("nota_plugin_review_close", { plugin }),

    /** 插件声明的菜单项。范式同 `panels()`。 */
    menus: () => invoke<PluginMenuItem[]>("nota_plugin_menus"),
  },

  /** 前端就绪握手。见 `lib.rs::nota_frontend_ready` 里那段"为什么需要"。 */
  frontendReady: () => invoke<void>("nota_frontend_ready"),

  /**
   * 启动时命令行带的文件（`nota 笔记.md` / 文件管理器的"用 Nota 打开"）。
   *
   * ⚠️ 宿主**只是把参数转告过来**，打开动作走前端那条既有的 `openPath`
   * （选中标签、报错弹提示条都在那边）。为什么不由宿主直接打开，见
   * `lib.rs::nota_startup_file`。
   *
   * ⚠️ 它**会 reject**（2026-09-25 起）：文件名不是合法 UTF-8 时宿主如实报错，
   * 不会再静默给个 `null`。调用方要自带 `catch`——启动那一段是包在
   * `Promise.all` 里的，一个打不开的文件不该把设置和主题一起掀掉。
   */
  startupFile: () => invoke<string | null>("nota_startup_file"),

  /**
   * **强制专注**（核心功能，不是插件）。
   *
   * ⚠️ 这四条命令**都不做判断**，只是转给宿主那个计时线程、然后广播新状态
   *（`commands/focus.rs` 文件头）。所以界面**不要**拿返回值去更新余额——
   * 以 `events.focusState` 那条事件为准：余额每秒都在变，命令返回的那一份
   * 到手时可能已经过时了。
   */
  focus: {
    /** 此刻的余额与阶段。⚠️ 挂载时拉一次（窗口可能在会话开始之后才建）。 */
    get: () => invoke<FocusState>("nota_focus_get"),
    /** 开始一轮。⚠️ 已经在跑时**不重置**余额（连点两下不会把攒的清掉）。 */
    start: () => invoke<FocusState>("nota_focus_start"),
    /** 停掉这一轮。**不问确认**——这是个"我想停下来"的按钮。 */
    stop: () => invoke<FocusState>("nota_focus_stop"),
    /**
     * 警报上那颗「我回来了」。
     *
     * 关掉警报、回到专注、余额留在 0、带冷却。为什么不留"启动资金"见
     * `focus/mod.rs::确认`——留了就是一个能反复刷的漏洞。
     */
    ack: () => invoke<FocusState>("nota_focus_ack"),
    /**
     * 宿主兜底音。**前端合成不出声音时**才调这一条。
     *
     * ⚠️ 它**不是**"再响一次"的按钮：前端 Web Audio 才是主路径（音色可控），
     * 这条只在 WebKit 的 autoplay 策略把 `AudioContext` 摁住时兜底。
     */
    beep: () => invoke<void>("nota_focus_beep"),
    /** 关掉警报窗（如果有）。⚠️ **不是**"停止专注"，那件事是 `stop`。 */
    closeAlarm: () => invoke<void>("nota_focus_close_alarm"),
  },

  /**
   * 窗口自身的控制（2026-09-27）。开发者工具与诊断信息各一条。
   *
   * ⚠️ 「窗口置顶」**故意不在这里**：它前端直接用 Tauri 的 JS API
   * （`getCurrentWindow().setAlwaysOnTop()` / `isAlwaysOnTop()`），
   * 与全屏那条路一模一样（见 `ui/useImmersive.ts`）——状态要从**窗口**读回来，
   * 绕一趟 IPC 只多一层转发。而这条没有 JS API 可用：
   * `devtools` feature 只给了 Rust 侧一个 `open_devtools()`。
   */
  window: {
    /** 编辑器和界面样式就绪后显示主窗口。 */
    showMain: () => invoke<void>("nota_window_show_main"),
    /** 打开开发者工具。⚠️ 已经开着时是**调到前面**，不是关掉。 */
    openDevtools: () => invoke<void>("nota_window_open_devtools"),
    /** 在独立窗口显示运行诊断信息。重复调用会聚焦已有窗口。 */
    openDebugInfo: () => invoke<void>("nota_window_open_debug_info"),
    /**
     * 把一份文档**在新窗口里打开**（标签页右键那一条，2026-09-27）。
     *
     * ⚠️ **新窗口是另一个进程**，两边文档表 / 工作区 / 插件各自独立——
     * 判据与代价写在 `src-tauri/src/commands/window.rs` 文件头。所以这条命令
     * **不是"搬走一个标签"**：原来那份文档在旧窗口里照旧开着，两边各看各的，
     * 之后谁存盘谁算（这一条**用户明确说了不用管**：「不用考虑拖回来的情况了」）。
     *
     * ⚠️ `path` **必需**：没有路径的标签（新建的、没存过盘的）新进程读不到它的
     * 正文，界面上那一条是**灰的**（`ui/TabBar.tsx`）。
     */
    openNew: (path: string) => invoke<void>("nota_window_open_new", { path }),
    /**
     * **真的退出**（2026-10-16 加）。⚠️ **只在"该问的都问过了、答案是退"时才调**：
     * 它是最后那一下，调完进程就没了，没有任何回调、也没有第二次机会。
     *
     * ⚠️ 为什么要绕回宿主：关窗口这一下**宿主已经先挡回去了**
     *（`lib.rs` 的 `CloseRequested` → `nota:close-requested`），所以前端说"退"
     * 之后得有个动作真把窗口关掉。⚠️ 它走的是 `app.exit(0)`，**不会再触发一次
     * `CloseRequested`**——真会的话就成了"确认过了又问一遍"的死循环。
     */
    quit: () => invoke<void>("nota_quit"),
  },
};
