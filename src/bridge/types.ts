/**
 * 前端这一侧的**协议形状**：与 Rust 侧的结构体、枚举一一对应。
 *
 * 2026-09-26 从 `ipc.ts` 拆出来（那边 1035 行顶破了 1000 行硬线，`docs/09` §4
 * 早写着这条天然的缝就是"类型"与"调用"两半）。这里**只有形状，没有行为**：
 * 不 import `@tauri-apps/api`，所以谁都能安全地 import 它——包括不该碰 IPC 的
 * 纯展示组件与测试。
 *
 * ⚠️ 改 Rust 侧字段时**必须同批改这里**。两边不一致时 `invoke` 不会报错，
 * 只会得到一个少了字段的对象，然后在某个 `.map` 上炸掉。
 *
 * ⚠️ `ipc.ts` 里有一行 `export * from "./types"`：**调用方看不见这次拆分**，
 * `import { type Document } from "@/bridge/ipc"` 这种写法照旧成立。
 */

// ── 类型（与 Rust 侧的结构体一一对应）──────────────────────────────────────
//
// ⚠️ 改 Rust 侧字段时**必须同批改这里**。两边不一致时 `invoke` 不会报错，
// 只会得到一个少了字段的对象，然后在某个 `.map` 上炸掉。

export type DocId = number;

export interface Document {
  id: DocId;
  path: string | null;
  title: string;
  text: string;
  dirty: boolean;
  revision: number;
}

/**
 * 一条路径**是什么**（`commands/path_kind.rs::nota_paths_kind` 回的那种）。
 *
 * ⚠️ 是三个**字符串**不是枚举对象：跨 IPC 的取值一律英文小写，中文只出现在
 * 注释和界面文案里（与 `settings/files.rs` 那几个枚举同一个口径）。
 *
 * ⚠️ **没有"其它"这一档**：只有目录、文件、不在了三种。别把"能不能打开"
 * 也塞进来——那是前端的路由（`ui/useFileDrop.ts`），宿主只回答事实。
 */
export type 路径种类 = "dir" | "file" | "missing";

/**
 * 一本**我们的引擎真读得了**的词典（`spell::nota_spell_dictionaries` 回的那种）。
 *
 * ⚠️ `来源` 是两个英文小写字符串（跨 IPC 的取值一律英文小写，同 [`路径种类`]）：
 * · `user`——用户自己放进 `dictionaries/` 的（导入的 zip 或手拷的）；
 * · `system`——`hunspell-en-US` 那一类系统包装出来的。
 *
 * ⚠️ **安装包不带任何词典**（用户 2026-10-11 拍板），所以没有第三种来源。
 */
export interface 拼写词典 {
  /** 语言标签，`en_US` 这种（文件名去掉后缀）。 */
  tag: string;
  来源: "user" | "system";
  /** 在哪个目录（"打开文件夹"那条路用）。 */
  目录: string;
}

/**
 * 文件树的一格。
 *
 * ⚠️ **它身上没有时间**（既没有 `mtime` 也没有 `ctime`）。"按修改时间排"
 * 那一档完全在宿主那边做（`commands/workspace.rs::read_dir_sorted`）——
 * 前端拿不到时刻，也就**排不了序**，排序逻辑只有宿主一份。
 * 想在前端再排一次之前先想清楚：两份排序迟早会对不上，而对不上的表现是
 * "点一下刷新，顺序变了"。
 */
export interface TreeNode {
  name: string;
  /** 相对工作区根、以 `/` 分隔。可直接喂给 `nota.fs.read`。 */
  path: string;
  is_dir: boolean;
  children: TreeNode[] | null;
}

/**
 * 取文件树时跟着请求一起递过去的**口径**（`commands/workspace.rs::TreeOptions`）。
 *
 * ⚠️ **字段是 camelCase**（`showHidden`）：Tauri 只把命令自己的参数名转成
 * snake_case，结构体里面的字段名 serde 原样用。写成 `show_hidden` 的话宿主
 * 那边收到的是个不认识的键——被静默忽略，症状是"这个开关拨了没用"。
 *
 * ⚠️ **三格都是可选的，而且是逐格回落**：只填一格时另外两格照宿主的设置走。
 * 别为了省事把设置抄一份全填上——抄的那一份会过期（`ui/tree-options.ts`
 * 顶上写了为什么必须随请求带而不是让宿主自己读设置）。
 */
export interface TreeOptions {
  sort?: TreeSort;
  filter?: FileFilter;
  showHidden?: boolean;
}

/**
 * 会话与最近文件（`~/.local/share/nota/session.toml`）。
 *
 * ⚠️ 五样东西都**只是"上次用到哪儿"的记忆**，删掉那份侧车的后果只有"记忆没了"，
 * 文档正文一个字节都不受影响。形状与三条账见 `src-tauri/src/session.rs` 文件头。
 *
 * ⚠️ 宿主**读的时候会把已经不存在的路径滤掉**（但不顺手落盘，见
 * `commands/session.rs`）：所以这里拿到的 `recent` 是"现在点得动的那些"。
 */
export interface 会话 {
  /** 上次开着的那几份（标签顺序），只留现在还存在的。 */
  open: string[];
  /** 上次前台是哪一份。**可能已经不在 `open` 里**（文件没了），兜底由前端做。 */
  active: string | null;
  /** 最近打开过的，只留现在还存在的，**最新在前**。 */
  recent: string[];
  /** 每份滚到哪儿：**比例**（`0.0`~`1.0`），不是像素。理由见宿主那份文件头。 */
  scroll: Record<string, number>;
  /**
   * 上次开着的那个文件夹（工作区根），**只留现在还在的**（宿主按"是不是目录"滤）。
   *
   * ⚠️ 2026-09-27 加，唯一用途是「启动时」第三档（`last-session`）：
   * `ui/useSession.ts::接上会话` 读到这里就把工作区接回去。在那之前工作区只在
   * 宿主内存里，冷启动必是 `null`——第三档无从谈起。
   */
  workspace: string | null;
  /** 侧车在哪。界面上那句"这些记忆存在哪"用它；算不出来时是 `null`。 */
  file: string | null;
}

/**
 * **内置**的界面风格 id。
 *
 * ⚠️ 八个具体风格**每一个都要在浅色和深色下成立**（8 × 2 = 16 格），
 * 每一档的形状在 `styles/theme/shape.css`、颜色在 `theme/color.css`。
 *
 * ⚠️ 这张表是**三份抄本之一**（另两份：`theme/shape.css` 里的
 * `[data-ui-style="…"]` 段、`src-tauri/src/ui_styles.rs` 的 `BUILTIN_IDS`）。
 * `tools/doc-sync-check.sh` 的 ⑦ 查三者一致——改一处就要改三处。
 *
 * ⚠️ 它同时是 `AppearancePane.tsx` 里 `STYLES` 那张表的键类型，
 * 所以**内置档漏一个仍然编译不过**（那正是当初写成 `Record` 的理由）。
 */
export type BuiltinUiStyle =
  | "auto"
  | "adwaita"
  | "ghub"
  | "macos"
  | "plasma"
  | "windows"
  | "windows10"
  | "yaru"
  | "cde";

/**
 * 界面风格。**这是外壳的设计语言**，与文档主题是两回事。
 *
 * ⚠️ 2026-09-26 起它是**开放的字符串**，不再是封闭的联合类型：
 * 用户把一个 `<id>.css` 丢进 `~/.config/nota/ui-styles/` 就多出一档风格
 * （`src-tauri/src/ui_styles.rs`，用户原话「本来主题应该就是拆成多个文件的。
 * 加一个就是允许用户导入」）。这与 `document_theme` 那一格是同一种做法。
 *
 * ⚠️ 写成 `BuiltinUiStyle | (string & {})` 而不是光一个 `string`：后者会让
 * 编辑器**不再给内置 id 的补全**，而漏掉一个内置档是这套东西最容易犯的错。
 * 那个 `& {}` 是 TS 里"保留字面量补全、同时接受任意字符串"的老写法。
 */
export type UiStyle = BuiltinUiStyle | (string & {});

/**
 * 一档可选的界面风格。对应 Rust 侧 `ui_styles::UiStyleInfo`。
 *
 * ⚠️ **只有 id 和"是不是内置"，没有显示名**：显示名要翻译，住在前端
 * （`AppearancePane.tsx` 的 `STYLES` 表）——后端不发中文。
 */
export interface UiStyleInfo {
  /** 唯一键。存进 `settings.ui_style` 的就是它，取 CSS 也用它。 */
  id: string;
  /**
   * 是不是本仓内置的那几档。`false` 有两种：用户新加的、或用户**覆盖了内置的**
   * （放了个同名的 `<id>.css`）。⚠️ 后者要用 `id` 去 `STYLES` 里查中文名，
   * 只当导入档显示的话，用户会看到"Adwaita"变成了"adwaita"。
   */
  builtin: boolean;
}
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
 * ⚠️ **2026-10-07 起它只活在前端、而且只是会话内状态**：不落设置文件，
 * 每次启动从 `wysiwyg` 开始（用户原话「请设置默认启动为 WYSIWYG」）。
 * 形状与理由在 `src/ui/useFileKindMode.ts`（那条 `useState` 就是家）。
 *
 * ⚠️ 加值时同时改：这里、`src/ui/view-modes.ts` 的表（`Record` 会当场报错，
 * 它是这条规矩剩下的**唯一**一处编译期保险）、`src/ui/commands.ts` 的「视图」
 * 栏三条（id / label / 快捷键）、`src/ui/useMenus.ts` 的 `menuChecks` 三条、
 * `docs/04-ui-map.md`。
 */
export type ViewMode = "wysiwyg" | "source" | "split";

/**
 * 「系统里那个 pandoc」的探测结论。
 *
 * 与 Rust 侧 `pandoc::ProbeState` 一一对应。
 *
 * ⚠️ 三档的**字面量**（`ready` / `missing` / `unknown`）和 `nota.devserver.probe`
 * 给插件的那三个词是同一套口径（见 `src-tauri/src/devserver.rs::ProbeState`），
 * 但**两边不共用类型**：一个走 Tauri 命令、一个走 Lua 表，判据也不同。
 */
export type PandocProbeState = "ready" | "missing" | "unknown";

/**
 * 一种借 pandoc 转的格式。**这张表由后端给**（`pandoc.rs` 的 `格式表()`）：
 * 文件对话框要的后缀名必须和 pandoc 真正写出来的那个一致，前端再抄一份
 * 迟早会出现"对话框说 `.tex`、文件却是 `.latex`"。
 */
export interface PandocFormatInfo {
  /** 菜单 id 与 `nota_pandoc_export` 的 `format` 参数。 */
  id: string;
  /** 中文名（"Word 文档"这种），提示语里用。 */
  name: string;
  /** 后缀，**不带点**。LaTeX 那条是 `tex` 不是 `latex`。 */
  extension: string;
}

/** 一份探测报告。⚠️ 与 Rust 侧 `pandoc::PandocProbe` 一一对应。 */
export interface PandocProbe {
  state: PandocProbeState;
  /** 探测用的哪条命令（`NOTA_PANDOC_CMD` 或默认的 `pandoc`）。 */
  command: string;
  /** `--version` 吐出来的第一行（拿到了才有），比如 `pandoc 3.1.11`。 */
  version: string | null;
  /** 一句话结论。中文，**后端写的**（判定依据都在那边）。 */
  message: string;
  /** 支撑结论的原文。可能为空。 */
  detail: string;
  /**
   * PATH 里找到的 PDF 排版引擎。`null` = 没找到。
   *
   * ⚠️ 这**不是**"不能出 PDF"的宣判：引擎可能在非 PATH 的目录里。它只影响
   * 面板上那句话。
   */
  pdf_engine: string | null;
  /** Nota 自带那套 PDF 兜底在这台机器上在不在（只有 Linux 有）。 */
  fallback_pdf: boolean;
  /** 七种格式的 id / 中文名 / 后缀，按该有的顺序。 */
  formats: PandocFormatInfo[];
}

/** 这一份文件是谁排的版。**必须如实回报**，否则两次导出结果不同就成了玄学。 */
export type PandocRoute = "pandoc" | "nota";

/** 一次 pandoc 导出的结果。⚠️ 与 Rust 侧 `pandoc::PandocExport` 一一对应。 */
export interface PandocExport {
  /** 真正写出去的路径。 */
  path: string;
  route: PandocRoute;
  /** 人话：这次走的哪条、为什么。成功时也有。 */
  note: string;
}

// ⚠️ 「分页设置」那一整段（`FilesSettings` / `EditorSettings` / … 直到
// `GeneralSettings`）2026-09-27 搬去了 `./types-settings.ts`（本文件当时 1053 行）。
// 下面 `Settings` 里那九张表仍要从那边**点名 import 一次**：文件末尾那句
// `export *` 是给**外面**的调用方再导出的，它**不会**把名字带进本文件的局部作用域。
import type {
  AppearanceSettings,
  EditorSettings,
  ExportSettings,
  FileFilter,
  FilesSettings,
  GeneralSettings,
  ImageSettings,
  MarkdownSettings,
  TreeSort,
} from "./types-settings";

export interface Settings {
  ui_style: UiStyle;
  ui_mode: UiMode;
  document_theme: string;
  // ⚠️ `view_mode` 2026-10-07 退休：模式改成会话内状态（见 `ViewMode` 顶上那段），
  // 后端结构体里那份也已经删掉——老设置文件里残留的键由 serde 忽略。
  ui_font_size: number;
  content_width: number;
  /**
   * **限制正文宽度**。默认 `false` ＝ 正文列铺满编辑区（两侧各留 56px 装订线）。
   *
   * ⚠️ 只有开着时 `content_width` 才生效。默认关是 2026-10-09 按用户那条
   * 「文字没有完全铺满屏幕……应该两边边距一样」定的——在那之前正文列一律
   * 被 `content_width` 卡住、而且是贴左的，宽窗口里右边会剩一大条空档。
   */
  limit_text_width: boolean;
  confirm_unsaved: boolean;
  autosave_seconds: number;
  /**
   * **严格模式**：ATX 标题的井号后面必须有空格（`# 标题` 才算，`#标题` 不算）。
   * **默认 `false`**（宽松）。
   *
   * ⚠️ 这一项**影响正文怎么解析**，不是一条外观轴：改了之后 `EditorPane` 会把
   * 编辑器整个重建，后端也会重算已打开文档的标题。判据见 `editor/atx.ts`。
   */
  strict_markdown: boolean;
  /**
   * **数学公式里的 physics 宏包**（`\qty` / `\dv` / `\braket` …）。**默认 `false`**。
   *
   * ⚠️ KaTeX **官方没有 physics**，所以这一档不是"加载一个扩展"，而是把
   * `editor/math-macros.ts` 里那套本仓自己的宏定义交给 KaTeX（`macros` 选项）。
   * 开着时它会**重定义 `\div` / `\Re` / `\Im`**——这正是 physics 本身的行为，
   * 也是它默认关着的原因。
   *
   * ⚠️ 它**影响正文怎么渲染**，和 `strict_markdown` 同类：改了之后
   * `EditorPane` 会重建编辑器（KaTeX 的宏是在渲染那一刻查表的，已渲染的节点
   * 不会自己回头重画）。
   */
  enable_physics: boolean;

  /* ── 分页的那几张表（2026-09-27 起九张）───────────────────────────────────────────────────────
   *
   * ⚠️⚠️ **上面那 10 个字段一个都没挪进这七张表，是有意的。**
   * 它们是 2026-09-22 / 09-23 定下来的老字段，已经写进了用户的设置文件。
   * 搬进某张表会让**老设置文件里的值静默丢回默认**——用户选好的界面风格、
   * 打开过的严格模式、装好的 physics，升级之后全没了，而他的配置文件
   * 一个字都没动。所以按"新字段进表、老字段不动"处理。
   *
   * ⚠️ 这几张表（2026-09-27 起是**十张**，最后一张是 `keys`）**与 Rust 侧一一对应**（`src-tauri/src/settings/` 下每页一个
   * 文件，`mod.rs` 里 `pub mod` 一行一个）。字段名一律 snake_case、枚举取值
   * 一律 kebab-case，两边必须逐字相同——TS 这边写错一个字母**不会编译不过**，
   * 只会在运行时拿到 `undefined`，而 `undefined` 传回 Rust 会被 serde 当成
   * "这一项没给"、落回默认值。也就是"改了一下，看着像没生效"。
   *
   * 判据：改这里之前先看一眼 `settings/mod.rs` 顶上那张"哪一页对应哪个文件"的
   * 表，别凭印象。 */
  files: FilesSettings;
  editor: EditorSettings;
  image: ImageSettings;
  markdown: MarkdownSettings;
  export: ExportSettings;
  appearance: AppearanceSettings;
  general: GeneralSettings;
  /** 强制专注。⚠️ 这是**核心功能**的设置，不是插件的。见 `settings/focus.rs`。 */
  focus: FocusSettings;
  /**
   * 「文档主题」那一页里那四个**可调项**（行距 / 段距 / 字体 / 字号）。
   * 见 `settings/document.rs`。
   *
   * ⚠️ **"用哪一套主题"不在这里**——那是顶层的 `document_theme`（老字段，
   * 搬进表里会让老设置文件的值静默丢回默认）。这一张表回答的是"那套主题给的
   * 默认值里，哪几项我不听它的"。
   */
  document: DocumentSettings;
  /**
   * 「快捷键」那一页里**用户改过的那几条**。见 `settings/keys.rs`。
   *
   * ⚠️ **这是差量，不是整张键位表**：整张表的真相源是 `ui/commands.ts` 的
   * `MENUS`（那份是代码，跟着版本走）。没动过的命令**不会**出现在这里——
   * 出现了就等于把当时的默认值钉死，以后改默认键位用户收不到。
   */
  keys: KeysSettings;
}

/**
 * 「快捷键」那一页的设置。与 `src-tauri/src/settings/keys.rs` 逐字对应。
 *
 * ⚠️ 值的两种含义（这是这一节唯一的难点，`keys.rs` 头上有同一张表）：
 * **不在表里** ＝ 用 `commands.ts` 里的默认；**在表里、值为空串** ＝ 这条命令
 * 不要快捷键；**在表里、值非空** ＝ 用这个键位。
 * 空串那一档不能省——省了用户就**改不回默认**了。
 *
 * ⚠️ 键是**命令 id**（`file.saveAs`），值是**键位串**（`Ctrl+Shift+S`），
 * 语法与 `commands.ts` 里 `accel` 字段那一套完全相同（解析走
 * `ui/accel.ts::parseAccel`）。
 */
export interface KeysSettings {
  overrides: Record<string, string>;
}

/** 正文字体的档位。见 `settings/document.rs::DocFont`。 */
export type DocFont = "sans" | "serif" | "mono";

/**
 * 「文档主题」那一页里那四个可调项。与 `src-tauri/src/settings/document.rs`
 * 逐字对应。
 *
 * ⚠️ **每一项都是「开关 ＋ 值」两个字段**，因为默认必须是"跟随主题"：三套内置
 * 主题的行距各不相同（1.9 / 1.75 / 1.68），给一个写死的默认数就等于把主题之间
 * 的差异抹平了。别把 `custom_*` 去掉、拿值的 0 当"跟随主题"——段距取 0
 * 是正当取值，会跟它撞上。
 *
 * ⚠️ 四个值都是**整数百分比**（`175` = 1.75 倍），不是浮点：本仓的设置全是
 * 整数，混一个浮点进来要连带改设置页那个数字输入框的步长与显示。
 */
export interface DocumentSettings {
  /** 行距：是否覆盖文档主题。 */
  custom_line_height: boolean;
  /** 行距，百分比（175 = 1.75 倍）。生效区间 100..=300。 */
  line_height: number;
  /** 段落间距：是否覆盖文档主题。 */
  custom_paragraph_gap: boolean;
  /** 段落间距，**百分之一 em**（85 = 0.85em）。生效区间 0..=300。 */
  paragraph_gap: number;
  /** 正文字体：是否覆盖文档主题。 */
  custom_font: boolean;
  /** 正文字体档位。⚠️ 只在 `custom_font` 打开时算数。 */
  font: DocFont;
  /** 正文字号：是否覆盖文档主题。 */
  custom_font_size: boolean;
  /** 正文字号，**相对界面字号**的百分比（102 = 1.02 倍）。生效区间 80..=200。 */
  font_size: number;
}

/**
 * 「强制专注」那一页。与 `src-tauri/src/settings/focus.rs` 逐字对应。
 *
 * ⚠️ **会话状态（此刻余额多少、还剩多久）不在这里**——那份状态只活在宿主
 * 的内存里，走 `nota:focus-state` 事件推过来。这里只有用户偏好。
 */
export interface FocusSettings {
  /** 余额**上限**（分钟）。"这一轮打算写多久"。 */
  total_minutes: number;
  /** **开局**给多少余额（分钟）。"一上来能摸多久鱼"——这个才是"多久不写就响"。 */
  alarm_minutes: number;
  /** 专注 1 分钟加多少余额（分钟）。 */
  gain_per_minute: number;
  /** 离开 1 分钟扣多少余额（分钟）。 */
  drain_per_minute: number;
  /** 失焦后的免罚宽限（秒）。默认 10。0 = 一失焦就扣。 */
  grace_seconds: number;
  /** 警报响不响。 */
  sound: boolean;
  /** 首次说明弹窗看过了没有。 */
  introduced: boolean;
}

/**
 * 强制专注**此刻**的状态。走 `nota:focus-state` 事件推、或 `nota_focus_get` 拉。
 *
 * ⚠️ 与 `FocusSettings` 是**两回事**：那份是"用户怎么设的"（落盘、很少变），
 * 这份是"现在余额多少"（只在内存、每秒都在变）。
 */
export interface FocusState {
  /** 会话开着没有。`false` 时其余字段都是 0。 */
  running: boolean;
  /** 此刻余额（毫秒）。可以为 0（刚响过），不会为负。 */
  balance_ms: number;
  /** 余额上限（毫秒）。画进度条的分母。 */
  cap_ms: number;
  /**
   * 此刻处在哪一段。
   *
   * - `"focusing"` —— 焦点在编辑器上，余额在涨；
   * - `"away"` —— 失焦了。⚠️ `away_ms < grace_ms` 时**还在免罚宽限里**，一分没扣；
   * - `"alarm"` —— 正在响警报，账本**冻结**。
   */
  phase: "focusing" | "away" | "alarm";
  /** 这一次走神多久了（毫秒）。没走神就是 0。 */
  away_ms: number;
  /** 免罚宽限（毫秒）。 */
  grace_ms: number;
  /** 这一轮从开始到现在（毫秒）。含走神、含宽限、含警报中。 */
  elapsed_ms: number;
  /** 这一轮累计专注（毫秒）。 */
  focused_ms: number;
  /** 这一轮累计**挨了罚**的走神（毫秒，不含宽限）。 */
  away_total_ms: number;
  /** 这一轮响过几次。 */
  alarms: number;
}

/* ── 分页设置：与 `src-tauri/src/settings/*.rs` 一一对应 ─────────────────

   ⚠️ 这一段（382 行）**2026-09-27 搬去了 `./types-settings.ts`**：本文件当时
   1053 行，超了 `docs/09` §4 那条 1000 行的硬线。这里**原样再导出一遍**，
   所以 `@/bridge/ipc`（它 `export * from "./types"`）和全仓那几十处 import
   一处都不用改。理由、切点怎么选的、为什么不会有循环，都写在那个文件头上。

   ⚠️ **别把导出的内容再写回本文件**：那样两边各有一份同名类型，TS 不会报错
   （结构化类型，两份长得一样就能互相赋），但**改了一处另一处不动**——
   症状是「改了设置类型、某一处不生效」，最难查的那一类。 */
export * from "./types-settings";

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
  /**
   * 这个插件是从哪儿来的。
   *
   * ⚠️ 判据是**目录落点**（在用户插件目录下就是 `user`），不是"谁先扫到"。
   * 界面上靠它决定给不给「卸载」——内置插件卸不掉（它在安装包里，
   * 删了下次启动还会回来），只能停用。
   */
  origin: "builtin" | "user";
  /**
   * 装进来时的验签结论。`null` = 这笔账没记过（内置插件、或者早于这套机制的记录）。
   *
   * - `verified`：签名对上了，签名者那把公钥在信任库里；
   * - `unknown`：签名对上了，但签名者不在信任库里（界面上会多一颗「信任」）；
   * - `unsigned`：包里没有签名块（开发态的文件夹插件就是这一档）。
   */
  signature: "verified" | "unknown" | "unsigned" | null;
  /** 签名者指纹（前两档才有）。给人核对用。 */
  key_id: string | null;
  /** 能不能卸（= `origin === "user"`）。 */
  removable: boolean;
  /**
   * 这个插件声明了哪些界面语言（清单里的 `langs`）。
   * **空 = 不参与语言协商**（它只用一种语言写，界面不给它挂那句提示）。
   */
  langs: string[];
  /**
   * **此刻在用哪一份文案表**（`lang/<tag>.toml` 的 tag）。
   * `null` = 没声明 `langs`（用插件代码里写着的原文）。
   */
  lang: string | null;
  /**
   * 协商命中了没有。`langs` 非空且这里是 `false` = 界面上要显示那句
   * 「此插件不支持您的语言」（现在给的是英语那份）。
   *
   * ⚠️ 判据**只看 `langs` 与这一格**，别在前端按 `lang` 再猜一遍：
   * "声明了 zh-CN 但少了那个文件"这种事只有宿主知道（`lua/api/i18n.rs`）。
   */
  lang_ok: boolean;
  /**
   * 这个插件**请宿主画的**那几格设置（清单里的 `[[settings]]`，2026-10-04 加）。
   *
   * ⚠️ 空数组有两种意思，界面上不用分：**没声明**、或者声明了但清单不给画
   * （后者加载时就被挡下了，见 `plugin/manifest.rs::check_settings`）。
   * 插件自己在面板里画设置界面那种（AI 插件）**本来就是一格都不声明**。
   */
  settings: PluginSetting[];
}

/**
 * 插件声明的一格设置 ＋ **此刻的值**，画在「设置 → 拓展」那一页上。
 *
 * ⚠️ **值已经夹好、对齐好了**（Rust 侧的 `SettingDecl::夹紧`）：前端拿到的是
 * "能直接摆到滑杆上的数"，**别在前端再夹一遍**——同一条规则两处实现，
 * 迟早对不上，而对不上的表现是"滑杆显示 5、插件按 999 算"。
 *
 * ⚠️ 值**一定有**：用户还没拖过 = 文件里没这个键 = 宿主给的 `default`。
 * 前端拿不到"没设过"这个中间态，也就不会画出第三种样子。
 *
 * ⚠️ 文案（`label` / `help`）**是宿主翻好的**：清单里写英语原文，译文在插件
 * 自己的 `lang/<tag>.toml` 里（键就是原文）。前端**不要**拿它去查宿主那套
 * i18n——那是两个词表（`pluginText.ts` 顶上那段讲着同一件事）。
 */
export interface PluginSetting {
  /** 进插件设置文件的键。`api.plugin.setSetting` 要用它。 */
  key: string;
  /** 控件类型。前端按它分派（`ui/settings/panes/ExtensionsPane.tsx` 那一处）。 */
  kind: "range" | "text" | "toggle";
  /** 这一格的名字（已翻译）。 */
  label: string;
  /** 名字下面那句小字（已翻译）。空串 = 不画。 */
  help: string;
  min: number;
  max: number;
  step: number;
  /** 读数后面那个单位（`s`）。空串 = 不画。**它不进 i18n**（两门语言写出来一样）。 */
  unit: string;
  /** `range` 此刻的值。⚠️ 别的档位这一格是 `0`（用不上的字段填默认值，见下）。 */
  value: number;
  /** `text` 此刻的值。⚠️ **密钥也在这一个字段里**（`secret = true` 那档）。 */
  text: string;
  /** `toggle` 此刻的值。 */
  on: boolean;
  /** `text`：画成密码框（只管显示，不改存储方式——那份文件是明文的）。 */
  secret: boolean;
  /** `text`：输入框里那句灰字（**已经翻译好的**）。 */
  placeholder: string;
}

/**
 * 界面语言：设置里那一格（`setting`）+ **实际上在用的**（`effective`）。
 *
 * ⚠️ 界面只该用 `effective`。`setting` 是给设置页那个下拉用的——它显示的是
 * **设定**（可能是 `auto`），不是解析结果，否则用户选的「自动」会显示成「中文」。
 */
export interface AppLang {
  /** 设置里存的那一格：`auto` 或 BCP-47 语言标记。 */
  setting: string;
  /** 启动时算好的有效语言（`zh-CN` / `en`）。⚠️ 改了设置要**重启**才变。 */
  effective: string;
  /**
   * 下拉里能选的语言。**由宿主给**（`lang::支持的语言` 那张表），前端不许
   * 自己列一份——漏改的那一处不会报错，只是下拉里少一项。
   * 不含「自动」：那是设置的一个取值（`setting === "auto"`），由界面自己加。
   */
  available: { tag: string; label: string }[];
}

/** 信任库里的一把钥匙。见 `plugin/package.rs` 里信任库那一段。 */
export interface 信任记录 {
  key_id: string;
  /** 记下它时那个插件的名字。**只是给人看的**——信任是按指纹判的。 */
  name: string;
}

/**
 * 导出完了的一份小结（`nota_plugin_export` 的返回值）。见 `plugin/export.rs`。
 *
 * ⚠️ 字段名跟着 Rust 那边走（`files` / `bytes` / `signature`），不汉化：
 * 这是跨进程的线格式，两边同名才好对。
 */
export interface 导出报告 {
  id: string;
  /** 包里装了几个文件（**不含**签名块）。 */
  files: number;
  /** 这些文件一共多少字节（**未压缩**，也就是"解开之后有多大"）。 */
  bytes: number;
  /**
   * 包里那个签名块的去向：
   *
   * - `kept`：原样带上了（载荷还是作者签的那一份，导出没有改动它）；
   * - `dropped`：**验不过，摘掉了**——用户改过文件，带着一个对不上的签名会让
   *   收到包的人**装不上**（那是硬拒路径），所以宁可不带；
   * - `none`：这个插件本来就没签名。
   *
   * ⚠️ 这三档必须在界面上**如实说出来**：用户以为自己发的是一份"已验证"的包，
   * 而它其实是未签名的，这件事只有这里能告诉他。
   */
  signature: "kept" | "dropped" | "none";
  /** 实际写到哪儿了。 */
  path: string;
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
  /**
   * 这一块**属于哪儿**：
   * - `right`（右侧插件栏，默认）——右侧栏一页一块；
   * - `main`（**编辑区**）——不占右侧栏的页签，由插件在需要时喊
   *   `nota.ui.review(id)` 摊到正文那一块（`ui/ReviewPane.tsx`）。
   *   它在「插件」页的清单里挂个名，好让人知道这插件还声明了这一块；
   * - 别的值目前没有落脚处（`ui/PluginDock.tsx` 会如实列出来，不静默丢掉）。
   *
   * ⚠️ 它**不是开关**：`right` 的面板是"这一栏里一直有它"，`main` 的面板是
   * "插件让摊才摊"。搞混的话会写出"声明了 main 却指望它在界面上一直在"这种东西。
   */
  location: string;
  /**
   * 这一页要不要**放宽**（默认 `false`）。
   *
   * ⚠️ 它是**面板自己的声明**，不是外壳按插件名判的：画布类的面板
   * （嵌幻灯片、嵌图表、嵌预览）缩在默认那 260px 里只是个缩略图。
   * 2026-09-25 之前这件事写在外壳里（`活动 === "@slidev"`），
   * 等于把一个插件的名字焊进了宿主——插件换了就失灵。
   */
  wide: boolean;
  /**
   * 这一页要不要**跟着时间自己动**（默认 `false`，2026-09-26 加）。
   *
   * 声明了它的面板，宿主会**每秒**发一次"该重拉了"（`heartbeat.rs`），
   * 于是插件的 `render` 每秒跑一遍——写作统计那种"字/分钟 ＋ s-t 图"
   * 才有实时可言。没声明的照旧是"切过去才拉一次"。
   *
   * ⚠️ 前端拿到这个字段**不是为了自己定时**：定时是宿主的事（那也是它唯一
   * 知道"什么时候该动"的地方）。这一格在这儿，只是因为清单是整份发过来的
   * ——`PluginDock.tsx` 现在**不看**它，重拉仍旧只认那条 `nota:plugin-panel`。
   * 哪天要在界面上标出"这一页是活的"，读的才是它。
   */
  live: boolean;
}

/**
 * 编辑区（中间那一大块）里此刻摊着的那一格。
 *
 * ⚠️ **它是宿主的一格状态，不是前端自己的**——往里放东西的那一下是**插件**做的
 * （`nota.ui.review(id)` 或 `nota.ui.review_diff{...}`）。前端只是照做，而
 * "照做"这件事不能靠事件记住：用户切走再切回来、前端热重载重挂载，事件都不会
 * 重放。所以挂载后**主动拉一次**（`api.plugin.review()`），事件只是"变了，再拉一次"。
 *
 * # 两种形态
 *
 * | `kind` | 谁放的 | 编辑区里长什么样 |
 * |---|---|---|
 * | `"panel"` | `nota.ui.review(id)` | 正文让位，摊那个面板 |
 * | `"diff"` | `nota.ui.review_diff{...}` | 正文原地画 diff，一个字不动 |
 *
 * ⚠️ 前端按 `kind` 分派，**没有默认分支**：加第三种形态时这里与宿主
 * （`plugin/mod.rs::ReviewKind`）必须同批改，漏了会走到"什么都不认识"那一支，
 * 症状是"点了没反应"。
 */
export type PluginReview = PluginReviewPanel | PluginReviewDiff;

/**
 * 摊的是插件的**一个面板**（`nota.ui.review(id)`）。
 *
 * ⚠️ 编辑区里这时**正文让位**（`styles/review.css` 把 `.editor-pane` 藏掉），
 * 摊上来的是那个面板的内容。这是"插件有自己的界面要摊开"那一路。
 */
export interface PluginReviewPanel {
  kind: "panel";
  /** 摊着的是哪个插件。 */
  plugin: string;
  /** 插件内部的**面板** id（不是命令名）。标题去 `PluginPanel.title` 查。 */
  panel: string;
}

/**
 * 在编辑区里**原地**画一份改动（`nota.ui.review_diff{...}`，2026-09-26 加）。
 *
 * ⚠️ 这时**正文不动也不让位**：改动画在正文自己身上（`editor/review.ts`），
 * 顶上只多一条细条（标题 + 两条看法 + 接受/放弃）。
 *
 * ⚠️ `text` 是**目标文本**（改完之后该长什么样），不是补丁。差异由编辑器
 * 那一侧现算——理由写在 `lua/api/ui.rs::预览改动表` 顶上。
 */
export interface PluginReviewDiff {
  kind: "diff";
  plugin: string;
  /** 细条上写什么。插件给的措辞（多半是 `T("改动预览")`）。 */
  title: string;
  /** 目标文本。 */
  text: string;
  /**
   * 「接受」。`null` = 插件没给（那就只能靠 `Esc` 或细条上的「收起」收场）。
   *
   * ⚠️ `command` 是插件自己的命令名，前端原样交给 `api.plugin.call` ——
   * 「接受改动」要干什么只有插件知道（见 `docs/11`）。
   */
  accept: PluginReviewAction | null;
  /** 「放弃」。`null` 同理。 */
  reject: PluginReviewAction | null;
}

/** 改动预览里的一个按钮：措辞 + 要跑的命令。 */
export interface PluginReviewAction {
  /** 按钮上写什么。**措辞归插件**（i18n），前端不认这个字符串。 */
  label: string;
  /** 点下去调的命令名。 */
  command: string;
}

/**
 * 插件声明的菜单项。
 *
 * ⚠️ **`menu` 字段目前只有 `plugins` 一种去处**（2026-09-24 起菜单栏里多了一栏
 * 「插件」，见 `ui/pluginMenus.ts`）。插件写别的值**不拦也不认**——
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
 * **最多两个字段**（2026-09-26 从"只有一个"放宽到两个，为 Git 身份那种
 * "名字 + 邮箱"的场合）。再多就不加了：三个以上的值该是插件自己的设置页，
 * 不是一个越滚越长的对话框。
 *
 * ⚠️ 第二个字段（`secondArg` + `secondLabel`）**两个都给才算数**；只给一个
 * 等于没给，`second*` 三个都是空串。理由和 `arg` 那条一样：缺了键名，
 * 用户填的值没有地方放。判据在 Rust 的 `读提示` 里，这里只是照着读。
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
  /** 第二个值放进 `args` 的哪个键。空串 = 不画第二行。 */
  secondArg: string;
  secondLabel: string;
  secondPlaceholder: string;
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
  /** 是不是本仓内置的那几套。false 有两种：用户新加的、或用户覆盖了内置的。 */
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

// ── 事件载荷 ──────────────────────────────────────────────────────────────
//
// ⚠️ 这一段（`events.*` 的载荷形状）**2026-09-27 搬去了 `payloads.ts`**：
// 本文件那天 1009 行、顶破 1000 行硬线（`docs/09` §4），而这一段自带一条
// 现成的缝——它和上面的**命令返回类型**是两回事。`export *` 这一行让
// 调用方看不见这次搬家。

export * from "./payloads";

/**
 * 统一格式差异里的一行。`api.diff.texts` 的返回元素。
 *
 * ⚠️ 与 `ui/panel-nodes.ts::PanelDiffLine` **同形**，但**不是同一个类型**：
 * 那边多一个 `meta`（`diff --git` / `index` 那几行，是"读一份 diff"才有的），
 * 而这里的生成器（`src-tauri/src/diff.rs`）只会给四个值——它不认识"文件"，
 * 输入只是两段文本。两处都用这套字面量，改一处必须改两处（Rust 那边
 * `diff.rs::一行` 也钉着同样的一句话）。
 */
export interface DiffLine {
  /** `"ctx"` | `"add"` | `"del"` | `"hunk"`。 */
  op: "ctx" | "add" | "del" | "hunk";
  /** 行内容。加/删/上下文**不含行首那个标记**（界面自己补）；段头是整行原样。 */
  text: string;
}

/**
 * 「关于 → 故障排除」要的那一份报告。⚠️ 与 Rust 侧 `diagnostics::诊断` 一一对应。
 *
 * ⚠️ **一律 snake_case，不转 camelCase**（本仓惯例）：两处名字不一样时的表现是
 * "界面上一格永远空着"，而编译器一句话都不会说。加一格就得两边同批加。
 *
 * ⚠️ **值全是原始字符串，没有一句是翻译过的**：`rustc` 那几格本来就长那样，
 * `build_host` 是主机名。标签（"rustc" 前面那个词）归前端，走 `t()`。
 *
 * ⚠️ **可能有空串**——取不到就是空串，不是 `null`（见 Rust 侧那条口径）。
 * 前端统一画成「—」。
 */
export interface Diagnostics {
  // ── 编译信息：这些说的是**打包这台二进制的那台机器**，不是你现在这台 ──
  /** 包版本。与 `getVersion()` 同源，但这条在开发构建里也拿得到。 */
  version: string;
  /** 编译完成那一刻，**Unix 秒**。格式化交给前端（语言与时区在这儿）。 */
  build_time: number;
  build_host: string;
  /** `uname -srm`：编译机器的内核与架构。 */
  build_platform: string;
  /** 目标三元组，比如 `x86_64-unknown-linux-gnu`。 */
  target: string;
  /** `debug` / `release`。 */
  profile: string;
  /** 四条工具链版本（`--version` 的第一行）。 */
  rustc: string;
  cargo: string;
  node: string;
  npm: string;
  /** 编译时锁住的几个关键依赖版本（读自 `Cargo.lock`）。 */
  tauri: string;
  webkit_crate: string;
  gtk_crate: string;
  mlua: string;
  // ── 本机信息：这些说的是**现在跑着它的这台机器** ──
  /** `/etc/os-release` 的 `PRETTY_NAME`。 */
  os_pretty: string;
  kernel: string;
  arch: string;
  /** GTK 的**运行时**版本（链接进来的那个库），例如 `3.24.49`。 */
  gtk_runtime: string;
  webkit_runtime: string;
}

/**
 * **一台打印机**（2026-10-17，应用内打印）。
 *
 * ⚠️ `description` 由 IPP 的 `printer-state` 与 `printer-info` 组成——
 * **不翻译、不改写**："打印机在报什么错"比一句通用的"不可用"有用得多。
 */
export interface PrinterInfo {
  name: string;
  description: string;
  is_default: boolean;
}

/** 打印环境：CUPS 是否可达、IPP 查询错误与打印机列表。 */
export interface PrintEnvironment {
  /** CUPS 服务是否可达（看标准 Unix socket）。 */
  cups_available: boolean;
  /** CUPS 在、但这次 IPP 查询失败时的原因；无错误为 `null`。 */
  problem: string | null;
  printers: PrinterInfo[];
}

/**
 * 打印预览（`nota_print_prepare` 的返回）。
 *
 * ⚠️ `pages` 是**逐页 PNG 的 data URL**（`data:image/png;base64,…`），不是路径：
 * 走 base64 就不必给 asset 协议开临时目录的 scope，也不必担心文件被清掉之后
 * 界面上一片碎图。代价是每页百来 KB，所以宿主那边**只出前 40 页**（`truncated`
 * 为真时界面要如实说"只预览前 N 页"，不然用户以为文档就这么多页）。
 */
export interface PrintPreview {
  /** 那份 PDF 的路径（投递那一步用它）。 */
  pdf: string;
  page_count: number;
  pages: string[];
  truncated: boolean;
}
