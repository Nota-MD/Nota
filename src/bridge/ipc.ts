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
 * `bridge/types.ts`（那次是这边 1035 行顶破了硬线）。本文件只管**通道**——
 * `api` 那些 `invoke` 调用、`on` 订阅、`events` 频道名。下面那行 `export *`
 * 让所有类型照旧能从 `@/bridge/ipc` 引到，所以调用点一处都没改。
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  AppLang, Diagnostics, DiffLine, DocId, DocThemeInfo, Document, FocusState, ImagePlaced,
  ImageSourceArg, ImageUploadSettings, ImageUploadSnapshot, ImageUploaded,
  NativeMenuNode, PandocExport, PandocProbe, PluginInfo, PluginMenuItem,
  PluginPanel, PluginReview, Settings, TreeNode, TreeOptions, UiStyleInfo, 信任记录, 导出报告,
  会话, 路径种类,
} from "./types";
// ⚠️ 这一条是**类型专线**：`选区快照` 的家在编辑器那一侧
// （`editor/caret-snapshot.ts`，它的文件头就是这张表的设计说明），
// 不搬进 `bridge/types.ts`——搬过去会让"桥"这个模块变成选区的定义者，
// 而桥对这一格的全部职责只是**转手**（`text`／`empty` 两个字段照抄给 Rust）。
// `import type` 编译后整行消失，所以不会把 ProseMirror 拖进桥里。
import type { 选区快照 } from "@/editor/caret-snapshot";

export * from "./types";

// ── 文档 ──────────────────────────────────────────────────────────────────
export const api = {
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

  doc: {
    create: () => invoke<DocId>("nota_doc_new"),
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
  },
  /**
   * 路径**是什么**（拖放那条路用，`ui/useFileDrop.ts`）。
   *
   * ⚠️ 返回值与入参**一一对应**（同长度、同顺序）：前端是按下标把"是什么"
   * 对回"哪一条路径"的。少一条或者挪一位的症状是**拖进来的名字和打开的东西
   * 对不上**，而那种错没有人会往这个方向查。
   */
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
    /**
     * 打印：写成 HTML → 交给系统默认程序（浏览器）打开 → 用户在那边按 `Ctrl+P`。
     *
     * ⚠️ **`docPath` 决定落点**：有文档路径就写在**它所在的目录**里，
     * 这样正文里 `![](./img.png)` 那种相对路径才解析得对；没有就落系统临时目录。
     * 见 `commands/export.rs` 文件头。返回值是那个文件的路径。
     */
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
   * 表格的**列宽**（用户拖出来的那些）。
   *
   * ⚠️ 它**不写进 Markdown 正文**：列宽是给人看的排版偏好，不是文档内容。
   * 落点是宿主那边的一份侧车文件（`~/.local/share/nota/table-widths.toml`，
   * 形状与理由见 `src-tauri/src/table_width.rs`）。
   *
   * ⚠️ **指纹由前端算**（`editor/table-width.ts`）——宿主只当它是个字符串，
   * 不解释格式。改指纹算法不该动 Rust。
   */
  tableWidths: {
    /** 一份文档里所有表格的列宽，键是指纹。**没拖过就是空对象，不是错误。** */
    get: (path: string) => invoke<Record<string, number[]>>("nota_table_widths_get", { path }),
    /** 记一个表格的列宽。`widths` 给空数组 = 删掉这条记录（拖回自动那档）。 */
    set: (path: string, fingerprint: string, widths: number[]) =>
      invoke<void>("nota_table_widths_set", { path, fingerprint, widths }),
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
   * 界面风格里**用户导入的那一半**（内置那八档由打包好的 CSS 负责）。
   *
   * ⚠️ 与 `theme` 是一对，但**注入方式正好相反**：文档主题取回来的 CSS 必须
   * 限域（只作用编辑区），界面风格取回来的**原样注入**——它要改的就是外壳。
   * 那条差别写在 `styles/ui-style.ts` 顶上。
   */
  uiStyle: {
    /**
     * 列出所有可用的界面风格（内置的 ＋ 用户目录里的）。
     * 目录不存在不算错，内置那八档照样在。
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
     * `path` 由前端用文件对话框问出来（`@tauri-apps/plugin-dialog` 的 `open`）：
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
     * `path` 由前端用**保存对话框**问出来（`@tauri-apps/plugin-dialog` 的 `save`），
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
   * 窗口自身的控制（2026-09-27）。**目前只有一条**。
   *
   * ⚠️ 「窗口置顶」**故意不在这里**：它前端直接用 Tauri 的 JS API
   * （`getCurrentWindow().setAlwaysOnTop()` / `isAlwaysOnTop()`），
   * 与全屏那条路一模一样（见 `ui/useImmersive.ts`）——状态要从**窗口**读回来，
   * 绕一趟 IPC 只多一层转发。而这条没有 JS API 可用：
   * `devtools` feature 只给了 Rust 侧一个 `open_devtools()`。
   */
  window: {
    /** 打开开发者工具。⚠️ 已经开着时是**调到前面**，不是关掉。 */
    openDevtools: () => invoke<void>("nota_window_open_devtools"),
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
  },
};

// ── 事件 ──────────────────────────────────────────────────────────────────


/**
 * 订阅一个宿主事件。返回退订函数——**组件卸载时一定要调**，
 * 不然热重载几轮之后同一个事件会有好几个监听者，一次通知弹好几遍。
 */
export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

/**
 * 宿主事件名。
 *
 * ⚠️ 这里只该有**"此刻发生了一件事"**的事件。**声明类的东西不走事件**——
 * 面板/菜单/命令是"插件启动时声明了一次、之后一直成立"的状态，走
 * `api.plugin.panels()` / `menus()` / `findCommand()` 去**拉**。
 *
 * 曾经这里有 `pluginPanel` / `pluginMenu` 两条，前后端各写好了类型，
 * 却**一个订阅者都没有**——插件在 `setup()` 里注册、前端挂载后才 `listen()`，
 * 时序上必漏，而且 Tauri 对没有监听者的频道 emit 是**静默成功**的，
 * 日志里连痕迹都没有。见 BUG-13。
 */
export const events = {
  /**
   * **强制专注的状态变了**（2026-09-26 加，核心功能，不是插件）。
   *
   * ⚠️ 这是**"发生了一件事"**（余额又过了一秒），不是"声明"——所以走事件是对的
   *（BUG-13 那条判据管的是后者）。载荷是完整的一份 `FocusState`。
   *
   * ⚠️ **它每秒一发**，所以里面的东西要么是绝对量、要么是已经算好的值，
   * **前端不要拿它去累加**（丢一拍就永久错位）。宿主那边就是这么设计的
   *（`focus/mod.rs::快照` 顶上那段）。
   *
   * ⚠️ 频道名在 Rust 侧是 `focus/mod.rs::EVENT_FOCUS`。两处必须是同一个字符串，
   * 改一边不报错、只是收不到（Tauri 对没有监听者的频道 emit 是静默成功的）。
   */
  focusState: "nota:focus-state",
  /**
   * **该出声了**（警报触发）。载荷是空的。
   *
   * ⚠️ 声音为什么不在宿主做：音色、节奏、渐强这些东西在 Web Audio 里
   * 几行就写完了，而在 Rust 里要先合成一个 WAV、写盘、再找个播放器
   *（`focus/alarm.rs::系统提示音` 那条兜底路就是这么走的，它是备用方案）。
   *
   * ⚠️ 与 `focusState` 分工：**状态**走那条（每秒都有），**事件**走这条
   *（只在响的那一下）。别把"该响了"塞进状态里让前端去比——那样一轮里
   * 重连、重放、多窗口都会各响一遍。
   */
  focusBeep: "nota:focus-beep",
  notify: "nota:notify",
  documentChanged: "nota:document-changed",
  /**
   * **插件要在光标处改一笔**（`docs/07` 第 14 项，2026-10-04 加）。
   *
   * ⚠️ 与 `documentChanged` 的分工是这个设计的关键：那条是**"正文已经换了"**
   * （宿主改完镜像再通知，前端整篇 `setMarkdown`），这条是**"请你替我改"**
   * ——宿主**改不动**，因为"在光标处插一段"在 markdown 里**没有对应的偏移**
   * （量测见 `editor/caret-snapshot.ts` 顶上那张表：块边界上按偏移拼会把
   * 结构弄坏）。所以它只递一个**意图**，由编辑器落成一笔真事务。
   *
   * ⚠️ 因此这条事件**不保证被处理**：编辑区没挂载、那条意图瞄的不是当前
   * 文档、或者当前实例是只读的，都会静默丢掉。这是**故意的**——另一条路
   * （宿主按偏移拼字符串）是"看起来成功、存盘之后才发现结构坏了"。
   *
   * ⚠️ 频道名在 Rust 侧是 `lua/api/document.rs::EVENT_EDIT`。两处必须是同一个
   * 字符串，改一边不报错、只是收不到（Tauri 对没有监听者的频道 emit 是静默
   * 成功的）。
   */
  documentEdit: "nota:document-edit",
  /**
   * 某个面板的**内容**变了（插件喊了一声 `nota.ui.refresh`）。
   *
   * ⚠️ 这条**没有**违反"声明走拉、发生走推"那条判据（BUG-13），因为它是
   * **"此刻变了"这个动作**，不是"面板长什么样"那份状态。收到它的反应是
   * **去重拉**（`api.plugin.panelContent`），事件里一个字节的内容都没有。
   *
   * ⚠️ 因此它**丢了也不影响正确性**：面板还没打开时这一次本来就没人收，
   * 而用户打开面板时一定会拉一次。它只是个省一次往返的提示。
   *
   * ⚠️ 频道名在 Rust 侧是 `plugin/mod.rs::EVENT_PANEL_DIRTY`。**两处必须
   * 说同一个字符串**，别只改一边——改了收不到、也不报错（Tauri 对没有
   * 监听者的频道 emit 是静默成功的）。
   */
  pluginPanel: "nota:plugin-panel",
  /**
   * 编辑区里摊的那一块**换了**（插件喊了 `nota.ui.review`，或者用户按了
   * 「回到正文」）。载荷是空的——**收到就重拉**（`api.plugin.review()`）。
   *
   * ⚠️ 同一件事有"拉"和"推"两条路，它们分工不同，别只留一条：
   * **拉**是初始状态（挂载时、切文档回来时都对），**推**是"此刻变了"那一瞬间
   * （插件提了改动，用户正看着编辑区，得当场换成预览）。
   *
   * ⚠️ 频道名在 Rust 侧是 `plugin/mod.rs::EVENT_REVIEW`。两处必须是同一个
   * 字符串，改一边不报错、只是收不到。
   */
  pluginReview: "nota:plugin-review",
  /**
   * **插件正在往外吐字，先画出来**（插件喊了 `nota.ui.stream(text)`，
   * 2026-10-04 加，`docs/07` 第 58 项）。
   *
   * 载荷是 `{plugin, text}`——**这条事件带着内容**。
   *
   * ⚠️ **这是"声明走拉、发生走推"那条判据（BUG-13）唯一的例外，而且是不得不然**
   * ——不是图省事。上面 `pluginPanel` 那条的收法是"收到就去重拉"，但那条路
   * **在长命令跑着的时候根本回不来**：插件命令执行期间宿主一直握着 `plugins`
   * 锁（`commands/plugin.rs::nota_plugin_call`），而 `nota_plugin_panel_content`
   * 要的正是同一把锁。于是"边生成边显示"如果走拉，屏幕上会一直是旧的，
   * 直到那次命令整个跑完——**拉到的东西永远是最终结果**。
   * 完整推演在 `lua/api/ui.rs::实时表` 顶上，那边是这条设计的第一现场。
   *
   * ⚠️ 因此这条**只能装临时显示用的东西**，不许拿它当第二条状态通道：
   * 内容不进面板的任何一份状态，`text` 为空表示**收工**（把这段撤掉）。
   * 插件收工时**必须**另喊一次 `nota.ui.refresh` 去拉那份真内容——不然屏幕上
   * 会一直停在那半截上。
   *
   * ⚠️ 丢了不影响正确性：它本来就只是"正在写的字"，收工之后那份完整内容
   * 走的是拉。宿主那边还只带**最后 8000 个字符**（`ui.rs::实时上限`），
   * 因为这条一秒要发好几次。
   *
   * ⚠️ 频道名在 Rust 侧是 `plugin/mod.rs::EVENT_PANEL_STREAM`。**两处必须说
   * 同一个字符串**，改一边不报错、只是收不到（Tauri 对没有监听者的频道 emit
   * 是静默成功的）。
   */
  pluginStream: "nota:plugin-stream",
  /**
   * 原生菜单被点了，载荷是命令 **id**。
   *
   * ⚠️ 它和上面那个 BUG-13 的教训**不冲突**：那条说的是"**声明**类的东西
   * （面板/菜单长什么样）不许走事件"，因为那要拉。而这条是**"发生了一件事"**
   * ——有人点了一下，就是事件，推是对的。菜单**内容**仍然由前端推给 Rust
   * （`nativeMenu.apply`），方向正好相反，两边没有各存一份。
   */
  nativeMenu: "nota:native-menu",
  /**
   * **磁盘上那份文件被别的程序改了**（2026-09-26 加，非插件）。
   *
   * ⚠️ 这是**"发生了一件事"**，不是"声明"——所以它走事件是对的（BUG-13 那条
   * 判据管的是后者）。载荷只有 `{id, path, hash}`，磁盘正文要用的时候现拉
   *（`api.doc.diskText`）。
   *
   * ⚠️ **宿主那边的"忽略"是零动作**：点过「忽略」之后，宿主手里那个摘要
   * 基准已经挪到磁盘上这一份了，所以**不会**为同一次改动再报一遍。前端不必
   * 记"这个 hash 我忽略过了"——真那样做，两份账本一旦不同步就是"提示再也不
   * 出现"，而那种 bug 没有人会报（安安静静地不工作）。
   *
   * ⚠️ 频道名在 Rust 侧是 `watch.rs::EVENT_FILE_CHANGED`。**两处必须说同一个
   * 字符串**，改一边不报错、只是收不到（Tauri 对没有监听者的频道 emit 是静默成功的）。
   */
  fileChanged: "nota:file-changed",
  /**
   * **用户又启动了一次 Nota**（2026-09-27，单实例那一格）。
   *
   * 第二份进程把"要打开什么"转交给已经在跑的这份（`single_instance.rs`），
   * 宿主收到之后**先把主窗抬起来**（`unminimize` ＋ `set_focus`），再发这条。
   * 所以前端要做的事只剩一件：带路径就照常开一份文档，没带就什么都不做。
   *
   * ⚠️ 这是**"发生了一件事"**（有别的进程来敲过门），不是"声明"——走事件是对的
   *（BUG-13 那条判据管的是后者）。⚠️ 它**丢了也不影响正确性**：窗口已经被
   * 宿主抬起来了，丢的只是"顺手把那份文件也打开"。
   *
   * ⚠️ 频道名在 Rust 侧是 `single_instance.rs::事件`。**两处必须说同一个字符串**，
   * 改一边不报错、只是收不到（Tauri 对没有监听者的频道 emit 是静默成功的）。
   */
  secondInstance: "nota:second-instance",
  /**
   * **宿主从 GTK 捕获阶段截下了一颗格式快捷键**（2026-09-28，非插件）。
   * 载荷是 `"bold"` / `"italic"`。
   *
   * ⚠️ 这条事件**不是**前端偷懒的产物，它是 BUG-49 唯一的出路：WebKitGTK 在
   * 把按键派发给 DOM **之前**就把 `Ctrl+B` / `Ctrl+I` 当成自己的编辑命令吃掉了，
   * 所以 `window` 上那条 `keydown`（`ui/useMenus.ts`）**一次都收不到**。
   * 宿主于是在 `GtkEventControllerKey` 的捕获相位把它们拦下来，转成这条事件。
   * 完整来龙去脉在 `src-tauri/src/format_keys.rs` 的文件头。
   *
   * ⚠️ **它和那条 keydown 是两条互补的路，不是一主一备**：
   * - Linux：走这条（keydown 收不到那两颗键）；
   * - macOS / Windows：走 keydown（`format_keys.rs` 在那些平台上**不装**，
   *   装了会和 keydown 撞成"执行两遍"）。
   *
   * ⚠️ 既然是"发生了一件事"（有人按了一颗键），走事件是对的（BUG-13 那条判据
   * 管的是"声明"类的东西）。
   *
   * ⚠️ 频道名在 Rust 侧是 `format_keys.rs::EVENT`。**两处必须说同一个字符串**，
   * 改一边不报错、只是收不到（Tauri 对没有监听者的频道 emit 是静默成功的）。
   */
  formatKey: "nota:format-key",
  // ⚠️ 这里曾经有两条和"预览窗"绑在一起的事件（`slidevStopped` 等），
  // 2026-09-25 **都删掉了**：预览不再单开窗口，它成了插件面板里的一块
  // `kind = "frame"`（见 `ui/panel-nodes.ts`），而插件和前端之间的往来
  // 走的是**通用**的那两条（`plugin:…` 事件 + `nota_plugin_call` 命令）。
  // 留一条永远不会来的订阅，比没有它更难查。
} as const;
