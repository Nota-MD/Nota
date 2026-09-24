/**
 * IPC 桥：**前端唯一允许直接 `invoke` 的地方**。
 *
 * 别处一律 `import { api } from "@/bridge/ipc"` 再调 `api.doc.save(...)`。
 * 理由不是洁癖：命令名是字符串，散在组件里改一次要全仓搜；集中在这里
 * 还能顺手把返回值的形状标出来（`invoke` 本身是 `any`，等于把类型安全丢在边界上）。
 *
 * 命名对应关系：`api.docSave` ↔ Rust 侧 `nota_doc_save` ↔ `commands::document::nota_doc_save`。
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── 类型（与 Rust 侧的结构体一一对应）──────────────────────────────────────
//
// ⚠️ 改 Rust 侧字段时**必须同批改这里**。两边不一致时 `invoke` 不会报错，
// 只会给你一个少了字段的对象，然后在某个 `.map` 上炸掉。

export type DocId = number;

export interface Document {
  id: DocId;
  path: string | null;
  title: string;
  text: string;
  dirty: boolean;
  revision: number;
}

export interface TreeNode {
  name: string;
  /** 相对工作区根、以 `/` 分隔。可直接喂给 `nota.fs.read`。 */
  path: string;
  is_dir: boolean;
  children: TreeNode[] | null;
}

/**
 * 界面风格。**这是外壳的设计语言**，与文档主题是两回事。
 *
 * ⚠️ 七个具体风格**每一个都要在浅色和深色下成立**（7 × 2 = 14 格）。
 * 加值时同时改：`styles/theme.css`、`src-tauri/src/settings.rs`、
 * `styles/applyTheme.ts` 的探测表、`docs/04-ui-map.md`。
 */
export type UiStyle =
  | "auto"
  | "adwaita"
  | "ghub"
  | "macos"
  | "plasma"
  | "windows"
  | "yaru"
  | "yaru-blue";
export type UiMode = "auto" | "light" | "dark";

/**
 * 编辑模式。**不是外观轴**——它变的是"编辑区里摆几个窗格"，
 * 与 `ui_style` / `ui_mode` / `document_theme` 三条外观轴无关。
 *
 * | 值 | 左边 | 右边 |
 * |---|---|---|
 * | `wysiwyg` | 所见即所得（Milkdown） | — |
 * | `source` | Markdown 原文（CodeMirror） | — |
 * | `split` | 原文（可编辑） | 预览（**只读**） |
 *
 * ⚠️ 加值时同时改：`src-tauri/src/settings.rs` 的枚举、这里、
 * `src/ui/commands.ts` 的「视图」栏条目、`docs/04-ui-map.md`。
 */
export type ViewMode = "wysiwyg" | "source" | "split";

/**
 * 一次 Slidev 预览会话。
 *
 * ⚠️ 与 Rust 侧 `slidev::SlidevInfo` **一一对应**。那边加字段这里要跟着加，
 * 不然前端拿到的是一个少了字段的对象，然后在某个 `.url` 上炸掉。
 */
export interface SlidevInfo {
  port: number;
  /**
   * ⚠️ 是 `localhost` 而**不是** `127.0.0.1`：实测 Slidev 只绑 `[::1]`，
   * 换成一个写死的 v4 地址窗口会打不开。
   */
  url: string;
  /**
   * 我们写出来的**影子入口**（绝对路径）。它通常就写在**文档所在目录**下
   * （`.nota-slidev-<id>.md`），停止预览时删掉——写在那儿是为了让
   * `![](./img.png)` 这类相对路径照旧成立。
   */
  entry: string;
  /** 预览跟着哪份文档走。前端靠它决定"切到别的文档了还要不要继续同步"。 */
  doc_id: DocId;
}

/**
 * 「本机装没装 Slidev」的结论。
 *
 * ⚠️ 它**只决定按钮怎么摆**，具体的话在 `message` 里——判定依据（离线能不能
 * 拿到包、目录里有没有主题、存没存过盘）全在 Rust 侧，翻成枚举让这边拼句子
 * 只会把同一件事写成两份。见 `src-tauri/src/slidev.rs` 的 `ProbeState`。
 */
export type SlidevProbeState =
  /** 现在这一下能跑起来。 */
  | "ready"
  /** 差东西（差什么看 `message`）：给一条去官网安装指南的路。 */
  | "missing"
  /** 探测自己没问出结果（自定义命令超时之类）。**不等于没装**。 */
  | "unknown";

/**
 * 一份探测报告。
 *
 * ⚠️ 与 Rust 侧 `slidev::SlidevProbe` **一一对应**。
 */
export interface SlidevProbe {
  state: SlidevProbeState;
  /** 我们问的是哪条命令（`NOTA_SLIDEV_CMD` 或默认值），原样显示给用户。 */
  command: string;
  /** `--version` 吐出来的那行（拿到了才有）。 */
  version: string | null;
  /** 一句话结论。中文，后端写的。 */
  message: string;
  /** 支撑结论的原文（命令自己的输出）。可能为空。 */
  detail: string;
  /** 拿哪个目录当 Slidev 项目根。`null` = 文档还没存过盘。 */
  project_dir: string | null;
}

export interface Settings {
  ui_style: UiStyle;
  ui_mode: UiMode;
  document_theme: string;
  view_mode: ViewMode;
  ui_font_size: number;
  content_width: number;
  confirm_unsaved: boolean;
  autosave_seconds: number;
  /**
   * **严格模式**：ATX 标题的井号后面必须有空格（`# 标题` 才算，`#标题` 不算）。
   * **默认 `false`**（宽松），对标 Typora 的默认值。
   *
   * ⚠️ 这一项**影响正文怎么解析**，不是一条外观轴：改了之后 `EditorPane` 会把
   * 编辑器整个重建，后端也会重算已打开文档的标题。判据见 `editor/atx.ts`。
   */
  strict_markdown: boolean;
  /**
   * **数学公式里的 physics 宏包**（`\qty` / `\dv` / `\braket` …）。**默认 `false`**。
   *
   * ⚠️ KaTeX **官方没有 physics**，所以这一档不是"加载一个扩展"，而是把
   * `editor/math-macros.ts` 里那套我们自己的宏定义交给 KaTeX（`macros` 选项）。
   * 开着时它会**重定义 `\div` / `\Re` / `\Im`**——这正是 physics 本身的行为，
   * 也是它默认关着的原因。
   *
   * ⚠️ 它**影响正文怎么渲染**，和 `strict_markdown` 同类：改了之后
   * `EditorPane` 会重建编辑器（KaTeX 的宏是在渲染那一刻查表的，已渲染的节点
   * 不会自己回头重画）。
   */
  enable_physics: boolean;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  authors: string[];
  license: string;
  capabilities: string[];
  entry: string;
  dir: string;
  state: "loaded" | "failed" | "disabled";
  error: string | null;
}

/**
 * 插件声明的面板。**拉来的，不是事件推的**——见 `api.plugin.panels` 的说明。
 */
export interface PluginPanel {
  /** 声明它的插件 id。 */
  plugin: string;
  /** 插件内部的 id。**加上 `plugin` 才是全局唯一的键。** */
  id: string;
  title: string;
  icon: string | null;
  /** `right`（右侧插件栏，默认）/ `left`（左侧栏）。 */
  location: string;
}

/**
 * 插件声明的菜单项。
 *
 * ⚠️ **`menu` 字段目前只有 `plugins` 一种去处**（2026-09-24 起菜单栏里多了一栏
 * 「插件」，见 `ui/pluginMenus.ts`）。插件写别的值我们**不拦也不认**——
 * 那一条会出现在界面上并标出它想去哪儿，而不是静默消失。
 */
export interface PluginMenuItem {
  plugin: string;
  label: string;
  /** 点下去要调的**命令名**，配 `plugin.call(plugin, command)` 用。 */
  command: string;
  menu: string;
  accelerator: string | null;
  /**
   * 点之前先问一句？给了就在这里写清问什么。
   *
   * ⚠️ 用它是为了避免插件**自己**弹一个问句——插件在宿主里没有输入框，
   * 它只能靠通知说"请自己调 commit 命令"，那是把活儿推给用户。
   * 声明式的问句走宿主自己的输入框（`ui/PromptDialog.tsx`），与
   * 「格式 → 超链接」用的是同一个。
   */
  prompt: PluginPrompt | null;
}

/**
 * 一个「点之前先问一句」的声明。菜单元和面板按钮共用这一种。
 *
 * ⚠️ 只有**一个字段**。要问两样东西（比如"名字 + 描述"）目前做不到——
 * 真需要时再加，别先造一个通用的表单结构出来没人用。
 */
export interface PluginPrompt {
  /** 用户填的值放进 `args` 的哪个键。 */
  arg: string;
  /** 输入框上面那行说明。 */
  label: string;
  placeholder: string;
  hint: string;
  /**
   * 输入框遮不遮。**给密钥用**。
   *
   * ⚠️ 遮住只是不让人从屏幕上读走（截图、旁边有人）。它**不加密**任何东西：
   * 值最终存在 `plugin-settings/<id>.toml` 里，明文（见 `docs/13`）。
   */
  secret: boolean;
}

/**
 * 一份**文档主题**。对应 Rust 侧 `themes::DocThemeInfo`。
 *
 * ⚠️ 文档主题**只管编辑区**，与界面主题（`ui_style` / `ui_mode`）没有关系。
 * 用户 2026-09-23 划的线，见 `styles/doc-theme.ts` 顶上那段。
 */
export interface DocThemeInfo {
  /** 唯一键。存进 `settings.document_theme` 的就是它，取 CSS 也用它。 */
  id: string;
  /** 显示名（中文）。改了不影响设置——设置里存的是 id。 */
  name: string;
  /** 是不是我们内置的那几套。false 有两种：用户新加的、或用户覆盖了内置的。 */
  builtin: boolean;
}

/**
 * 原生菜单里的一项。字段与 Rust 侧 `native_menu::MenuNode` 一一对应。
 *
 * ⚠️ 改这里必须同批改 `src-tauri/src/native_menu.rs`。两边不一致时 `invoke` 不报错，
 * 只会让 Rust 那边用 `#[serde(default)]` 的值——菜单会**少东西**，不会报错。
 */
export interface NativeMenuNode {
  /** 分隔线。为真时其余字段一律忽略。 */
  sep?: boolean;
  id?: string;
  label?: string;
  /** **显示写法**（`"Ctrl+Shift+S"`）。转成原生写法是 Rust 那边的事。 */
  accel?: string;
  enabled?: boolean;
  /** `true`/`false` 才建可勾选项；`undefined` 是普通项。 */
  checked?: boolean;
  submenu?: NativeMenuNode[];
}

// ── 文档 ──────────────────────────────────────────────────────────────────
export const api = {
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
    save: (id: DocId, path?: string) =>
      invoke<string>("nota_doc_save", { id, path: path ?? null }),
    close: (id: DocId) => invoke<void>("nota_doc_close", { id }),
    setActive: (id: DocId) => invoke<void>("nota_doc_set_active", { id }),
    get: (id: DocId) => invoke<Document>("nota_doc_get", { id }),
    list: () => invoke<Document[]>("nota_doc_list"),
    reload: (id: DocId) => invoke<Document>("nota_doc_reload", { id }),
    hasUnsaved: () => invoke<boolean>("nota_doc_has_unsaved"),
  },

  workspace: {
    open: (path: string) => invoke<string>("nota_workspace_open", { path }),
    close: () => invoke<void>("nota_workspace_close"),
    get: () => invoke<string | null>("nota_workspace_get"),
    tree: (subPath?: string, depth?: number) =>
      invoke<TreeNode[]>("nota_workspace_tree", {
        subPath: subPath ?? null,
        depth: depth ?? 1,
      }),
  },

  settings: {
    get: () => invoke<Settings>("nota_settings_get"),
    set: (settings: Settings) => invoke<void>("nota_settings_set", { settings }),
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
   * "写一份临时文件交给系统默认程序"。别把渲染挪到后端去，那会变成第二套
   * 渲染实现。
   */
  export: {
    /** 写到用户选的路径。返回真实写出去的路径（对话框可能改了它）。 */
    write: (path: string, content: string) =>
      invoke<string>("nota_export_write", { path, content }),
    /**
     * 打印：写成 HTML → 交给系统默认程序（浏览器）打开 → 用户在那边按 `Ctrl+P`。
     *
     * ⚠️ **`docPath` 决定落点**：有文档路径就写在**它所在的目录**里，
     * 这样正文里 `![](./img.png)` 那种相对路径才解析得对；没有就落系统临时目录。
     * 见 `commands/export.rs` 文件头。返回值是那个文件的路径。
     */
    print: (docPath: string | null, title: string, content: string) =>
      invoke<string>("nota_export_print", { docPath, title, content }),
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
    /** 建好并返回我们自己的主题目录，供「打开主题文件夹」用。 */
    dir: () => invoke<string>("nota_doc_themes_dir"),
  },

  plugin: {
    list: () => invoke<PluginInfo[]>("nota_plugins_list"),
    setEnabled: (id: string, enabled: boolean) =>
      invoke<void>("nota_plugin_set_enabled", { id, enabled }),
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
     * 于是面板永远进不了界面（BUG-13）。**别把这条改回事件**：
     * `register_panel` 是在**插件加载时**（`setup()` 阶段）跑的，
     * 那时前端还没挂载，事件发出去没人收而且不报错——必漏，且漏得安静。
     *
     * ⚠️ 什么时候需要重拉：面板清单只在**插件加载**时定，而加载只发生在启动
     * （启用/禁用**不重跑** `on_load`）。所以现在启动拉一次就够。
     * **哪天界面上有了启用/禁用开关，记得在那里也重拉**——`PluginHost::生效的()`
     * 是按"加载成功且没被禁用"筛的，禁用之后面板该从清单里消失。
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

    /** 插件声明的菜单项。范式同 `panels()`。 */
    menus: () => invoke<PluginMenuItem[]>("nota_plugin_menus"),
  },

  /**
   * Slidev 预览。
   *
   * 模型是 **Nota 管生命周期、Slidev 自己画**：它是个前端工具链（Vite 开发服务器
   * ＋主题），我们起它、把它那个 localhost 开成一个窗口、把正文写进它的入口文件，
   * 剩下的（渲染、翻页、热更新）都是它自己的事。
   *
   * ⚠️ `start` **不等端口通**。第一次会下载 Slidev（几百 MB），等几分钟都有可能，
   * 而同步命令跑在主线程上——在后端等就是冻界面。所以拆成
   * `start`（微秒级返回）＋ 前端轮询 `probe`（每次 ≤300ms），见 `App.tsx::openSlidev`。
   */
  slidev: {
    start: (docId: DocId, markdown: string) =>
      invoke<SlidevInfo>("nota_slidev_start", { docId, markdown }),
    /**
     * **本机装没装 Slidev**。点菜单先出面板，就是靠它把话说清楚。
     *
     * ⚠️ 它**不联网**（npm 走 `--offline`）、不改变任何状态，最慢 20 秒
     * （那是"自定义命令挂住了"的上限，正常一两秒）。见 `commands/slidev.rs`。
     */
    probeInstall: (docId: DocId) => invoke<SlidevProbe>("nota_slidev_probe_install", { docId }),
    /** 端口通了没有。**探活两套栈都试**（Slidev 只绑 IPv6 那一条）。 */
    probe: () => invoke<boolean>("nota_slidev_probe"),
    /**
     * 进程输出的最后几行（stdout+stderr 混在一起，只留最后 30 行）。
     * ⚠️ **启动失败时把它整段端给用户**：真正的病因（没装主题、端口被占、
     * node 太老）就写在里面，我们编不出比它更准的话。
     */
    log: () => invoke<string>("nota_slidev_log"),
    /** 当前会话。前端热重载之后靠它把界面状态接回来（服务器还在跑，前端却清零了）。 */
    status: () => invoke<SlidevInfo | null>("nota_slidev_status"),
    /** 把预览窗口开在主窗口右边。已经开着就顶到前面，不会开第二个。 */
    openWindow: () => invoke<void>("nota_slidev_open_window"),
    /** 把正文整份写进入口文件。Slidev 盯到变化就热更新自己。 */
    sync: (markdown: string) => invoke<void>("nota_slidev_sync", { markdown }),
    /** 收摊：杀进程组 + 删入口 + 关窗口。 */
    stop: () => invoke<void>("nota_slidev_stop"),
  },

  /** 前端就绪握手。见 `lib.rs::nota_frontend_ready` 里那段"为什么需要"。 */
  frontendReady: () => invoke<void>("nota_frontend_ready"),
};

// ── 事件 ──────────────────────────────────────────────────────────────────

export interface NotifyPayload {
  plugin: string;
  message: string;
  level: "info" | "warn" | "error" | "success";
}

/** `events.pluginPanel` 的载荷。`id` 为 `null` = 那个插件的面板都该重拉。 */
export interface PanelDirtyPayload {
  plugin: string;
  id: string | null;
}

export interface DocumentChangedPayload {
  id: DocId;
  text: string;
  /** `"plugin"` 表示改动来自插件，前端要**照单全收**覆盖编辑器；
   *  宿主自身的改动前端本来就知道，不会走这条。 */
  origin?: string;
}

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
  notify: "nota:notify",
  documentChanged: "nota:document-changed",
  /**
   * 某个面板的**内容**变了（插件喊了一声 `nota.ui.refresh`）。
   *
   * ⚠️ 这条**没有**违反"声明走拉、发生走推"那条判据（BUG-13），因为它是
   * **"此刻变了"这个动作**，不是"面板长什么样"那份状态。收到它的反应是
   * **去重拉**（`api.plugin.panelContent`），事件里一个字节的内容都没有。
   *
   * ⚠️ 因此它**丢了也不影响正确性**：面板还没打开时这一枪本来就没人收，
   * 而用户打开面板时一定会拉一次。它只是个省一次往返的提示。
   *
   * ⚠️ 频道名在 Rust 侧是 `plugin/mod.rs::EVENT_PANEL_DIRTY`。**两处必须
   * 说同一个字符串**，别只改一边——改了收不到、也不报错（Tauri 对没有
   * 监听者的频道 emit 是静默成功的）。
   */
  pluginPanel: "nota:plugin-panel",
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
   * Slidev 预览停下了，载荷是空。
   *
   * 三种停下都会发：用户在菜单里点了「Slidev 预览」（命令层发的）、
   * 用户把预览窗口叉掉了（`lib.rs` 的窗口事件里发的）、以及起不来被收掉时。
   * 前端收到的意思只有一句：**把菜单上那个勾去掉**。
   *
   * ⚠️ 它是"发生了一件事"，所以走事件；而"预览现在是什么状态"是**状态**，
   * 走 `api.slidev.status()` 拉（BUG-13 那个判据）。
   */
  slidevStopped: "nota:slidev-stopped",
} as const;
