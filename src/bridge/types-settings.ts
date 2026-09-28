/**
 * **`types.ts` 那一份的一半**：与 `src-tauri/src/settings/*.rs` 一一对应的
 * 设置类型（2026-09-27 从 `types.ts` 搬出来）。
 *
 * # 为什么搬
 *
 * `types.ts` 顶到了 **1053 行**，超了 `docs/09` §4 那条 1000 行的硬线
 * （`tools/doc-sync-check.sh` ① 会 FAIL）。⚠️ 它在这次搬之前就已经 1010 行了
 * ——上一次拆分（把壳里那些类型从 `ipc.ts` 里分出来）只做到"刚好压线"，
 * 再加任何一件功能都会顶破，所以这不是"顺手重构"，是补上一次没分完的账。
 *
 * ⚠️ **搬法是纯搬家**：这一整段（382 行）**一个字都没改**，只是换了个文件。
 * 上面那份 `types.ts` 在同位置 `export * from "./types-settings"` 再导出一遍，
 * 所以 `@/bridge/ipc`（它 `export * from "./types"`）与全仓那几十处
 * `import { … } from "@/bridge/ipc"` **一处都不用改**。
 *
 * ⚠️ 切点是按"**依赖**"选的，不是按行数凑的：这一段的 382 行里**没有引用过
 * `types.ts` 里任何一个类型**（唯一一处提到 `AppLang` 的是注释），
 * 所以两个文件之间**一条 import 都不需要**，也不会有循环。
 * `Settings` 自己仍留在 `types.ts`（它是那个总形状），它从这边点名 import
 * 那七张表——两边的名字一个都没变。
 *
 * ⚠️ **`DocumentSettings` 与 `FocusSettings` 留在了 `types.ts`**（在这段
 * 分节注释**上面**）：`FocusSettings` 紧挨着 `FocusState`（那是**运行时状态**、
 * 不是设置项，本来就不该进这个文件），拆开它们两个反而更难读；
 * `DocumentSettings` 是 2026-09-27 新加的，就写在 `Settings` 旁边。
 * 也就是说本文件不是"所有设置表"，是"**分页设置**那一段"——
 * 找一张表时两边都看一眼，别只看这一份。
 */

/* ── 分页设置：与 `src-tauri/src/settings/*.rs` 一一对应 ───────────────── */

/**
 * 启动时做什么。**三档是递进的**，见 `settings/files.rs::StartupAction`。
 *
 * ```text
 * new-file      什么都不恢复，开一份空白文档      ← 默认
 * last-file     恢复上次开着的那些标签
 * last-session  恢复标签 **＋** 上次那个文件夹（左侧栏那棵树）
 * ```
 *
 * ⚠️ 第三档 2026-09-27 从 `"folder"` 改名成 `"last-session"`——老名字说的是
 * "只打开文件夹"，而这一档真正干的是"连文件带文件夹一起接上"。宿主那边留了
 * serde 别名，老设置文件读得懂；**这一侧不用留**，前端不读老值。
 */
export type StartupAction = "new-file" | "last-file" | "last-session";

/** 把东西拖进窗口时怎么办。 */
export type DropAction = "open-in-app" | "open-in-file-manager" | "ignore";

/** 拖进来的可导入文件是要"打开"还是"导入"。 */
export type ImportAction = "import-file" | "open-in-file-manager" | "ignore";

/** 侧栏那棵文件树显示哪些文件。 */
export type FileFilter = "supported" | "all";

export interface FilesSettings {
  startup: StartupAction;
  outline_collapsible: boolean;
  /** 新建文档的默认扩展名，**不带点**。 */
  default_extension: string;
  autosave_on_switch: boolean;
  remember_recent: boolean;
  drop_folder: DropAction;
  drop_markdown: DropAction;
  drop_importable: ImportAction;
  show_hidden: boolean;
  tree_filter: FileFilter;
}

/** 新文件的默认换行符。⚠️ 只管**新文件**，老文件照它自己的换行符写回。 */
export type LineEnding = "lf" | "crlf";

export interface EditorSettings {
  /** 列表 / 引用自动生成的缩进宽度。⚠️ 与 `markdown.code_indent` 是两回事。 */
  default_indent: number;
  align_indent: boolean;
  /**
   * **段首缩进**：正文段落的第一行空出来。
   *
   * ⚠️ 纯显示层（CSS `text-indent`），**不往文件里写空格**；与 `default_indent`
   * 那条"自动插几个空格进文件"是两件事（`src-tauri/src/settings/editor.rs` 里
   * 两条字段的注释各写了一遍）。
   */
  paragraph_indent: boolean;
  /** 缩进宽度，单位是**字符**（`em`，不是像素）。实际生效值夹在 1~8。 */
  paragraph_indent_chars: number;
  match_brackets: boolean;
  match_markdown: boolean;
  emoji_autocomplete: boolean;
  show_block_source: boolean;
  copy_markdown_source: boolean;
  copy_line_when_empty: boolean;
  line_ending: LineEnding;
  /** ⚠️ 只有开关，语言跟系统走（WebKitGTK 提供，选不了）。 */
  spellcheck: boolean;
  typewriter_keep_caret_centered: boolean;
}

/**
 * 往文档里插一张图片时做什么。
 *
 * ⚠️ 与 `src-tauri/src/settings/image.rs` 的枚举**逐字对应**（kebab-case 那五个）。
 * 算式只有一处：`src-tauri/src/image.rs`。前端的对话框、剪贴板、拖入三条路都
 * 把这件事交给宿主，自己**不判断**目录该是哪个——那样迟早两边不一致。
 */
export type InsertImageAction =
  | "none"
  | "copy-to-current-dir"
  | "copy-to-assets"
  | "copy-to-doc-assets"
  | "copy-to-custom";

export interface ImageSettings {
  insert_action: InsertImageAction;
  /** 「复制到指定路径」用的那条路径。绝对路径照用；相对按**文档目录**算。 */
  custom_dir: string;
  apply_to_local: boolean;
  apply_to_remote: boolean;
  /**
   * 用户给的**绝对**路径要不要换算成相对文档目录的写法。
   * ⚠️ 只朝一个方向动（绝对 → 相对）；本来就是相对的地址原样保留；
   * 宿主自己复制/下载出来的那一份**总是**相对路径，不看这一项。
   */
  prefer_relative: boolean;
  /** 为相对路径加 `./`。⚠️ 只在最终写出来的是相对路径时才有意义。 */
  add_dot_slash: boolean;
  escape_url: boolean;
  /* ⚠️ **上传服务不在这里**（2026-09-26 加的上传功能）。
   *
   * 它另有一份文件：`~/.config/nota/image-upload.toml`，权限 0600，形状见下面的
   * `ImageUploadSettings`。为什么拆开：这一份是 `settings.toml` 里的一个组，
   * 那个文件是 0644 的普通写盘（`Settings::save_to` 就是 `fs::write`），
   * 而上传配置里坐着用户的 token——同一个文件里放不下两种权限。
   * `settings/image.rs` 有一条测试盯着这件事：这个组里出现 `token` 之类的
   * 字符串就红。 */
}

/**
 * 上传服务器设置（`~/.config/nota/image-upload.toml`）。
 *
 * ⚠️ 字段名**与 Rust 那边逐字对应**（`src-tauri/src/upload.rs` 的 `上传设置`，
 * 那边每个字段一条 `#[serde(rename)]`）。字段名走 IPC，改一处漏一处，
 * 症状是"界面上填的地址没生效"而两边各自都编译得过。
 *
 * ⚠️ 这里**没有服务商预设**（没有 smms / picgo / imgur 这类名字）：只有
 * 「一条地址 + 一个方法 + 若干请求头 + 从回话里哪儿取地址」这四件事。
 */
export interface ImageUploadSettings {
  /** 总开关。默认 `false`：没配服务器的机器上，插入图片这条路与以前一样。 */
  enabled: boolean;
  /**
   * 允许文档自己说要自动上传（YAML 前件里那个键）。
   * ⚠️ 它**不是**总开关：`enabled` 关着的时候这一项没有任何作用。
   */
  auto: boolean;
  /** 服务器地址。**只认 http/https**。 */
  url: string;
  /** `post` = multipart/form-data；`put` = 裸字节。 */
  method: ImageUploadMethod;
  /** `post` 时文件放在哪个字段名里。默认 `file`。 */
  field: string;
  /**
   * 请求头，**多行文本**，一行一条 `名字: 值`。
   * ⚠️ 用户的 token 写在这里（比如 `Authorization: Bearer …`）。
   * 值只允许 ASCII——非 ASCII 会被 HTTP 客户端整条拒绝，报的还是一句英文。
   */
  headers: string;
  /** 从回话的 JSON 里取地址的点路径。默认 `data.url`；**空 = 整段回话就是地址**。 */
  url_path: string;
  /**
   * 网络图片：把**原地址**当普通表单字段发出去，字段名写这儿。
   * ⚠️ **空 = 网络图片不传**（跳过，界面如实说一句）。
   */
  remote_field: string;
}

export type ImageUploadMethod = "post" | "put";

/** `nota_image_upload_get` 的返回值。 */
export interface ImageUploadSnapshot {
  settings: ImageUploadSettings;
  /**
   * 配好了吗（总开关开着、地址也是 http/https）。
   * ⚠️ 由宿主算，前端**不拿 `url` 自己判**——"这条地址算不算服务器地址"
   * 只有一处答案（`image::是网络地址`），前端再判一次就是两份规则。
   */
  canUpload: boolean;
  /**
   * **此刻**在这份文档里插一张本地图片，会不会自动上传——三道闸都算过了。
   * ⚠️ 由宿主算，不让前端自己推：多一个推导点就多一处"界面说会传、实际没传"。
   */
  willAutoUpload: boolean;
}

/** `nota_image_upload_one` 的返回值。 */
export interface ImageUploaded {
  url: string;
}

/**
 * 自动上传那一步的结果。
 *
 * ⚠️ 只有事实，**句子在前端拼**（与 `ImageDid` 同一条口径）。两种情况前端都要
 * 说话：自动上传是"把用户的字节发出去"，静默成功比失败更糟。
 */
export type ImageUploadOutcome =
  | { kind: "ok"; url: string }
  | { kind: "failed"; error: string };

/**
 * 一张图从哪来（`nota_image_place` 的入参）。
 *
 * ⚠️ `base64` 那条**必须落盘**：剪贴板里的图没有"原处"可指，所以哪怕设置是
 * 「无特殊操作」，宿主也会把它写进 `assets/`，并在返回值里的 `action` 说明。
 */
export type ImageSourceArg =
  | { kind: "path"; path: string }
  | { kind: "url"; url: string }
  | { kind: "base64"; data: string; ext?: string | null };

/**
 * 宿主**实际**做了什么。⚠️ 这里只有事实，**句子在前端拼**——宿主不该替界面
 * 决定用哪种语言、怎么说。取值与 `image::做了` 的 `#[serde(rename)]` 对齐。
 */
export type ImageDid = "kept" | "copied" | "downloaded" | "written" | "existing";

/** `nota_image_place` 的返回值。 */
export interface ImagePlaced {
  /** 该写进 Markdown 的那条地址。 */
  src: string;
  /** 磁盘上多出来（或复用）的那份文件。没落盘就是 `null`。 */
  savedTo: string | null;
  did: ImageDid;
  /**
   * 实际生效的动作。
   * ⚠️ 只在一处与设置不同：剪贴板的图必须落盘，所以设置是 `none` 时会变成
   * `copy-to-assets`——界面上要说一句，不然用户以为设置没生效。
   */
  action: InsertImageAction;
  /**
   * 自动上传的结果。**没开自动上传时是 `null`**（绝大多数情况）。
   * ⚠️ `ok` 时上面的 `src` **已经**换成那条 URL 了；`failed` 时 `src` 是本地地址
   * （图没丢），错误在这条里。
   */
  upload: ImageUploadOutcome | null;
}

export type HeadingStyle = "atx" | "setext";
export type BulletMark = "dash" | "star" | "plus";
export type OrderedMark = "dot" | "paren";

/**
 * 智能标点在**什么时候**生效。
 *
 * ⚠️ 三档的区别不是"温和 / 激进"，而是**动不动用户的字节**：
 * `off` 什么都不做；`render` 只在渲染那一步换显示，**存盘仍是 `--`**；
 * `input` 改的是用户**正在打的那几个字符**（像输入法自动更正）。
 * 三档都**不会**回头改已经存在的文本。详见 `settings/markdown.rs`。
 */
export type SmartPunctuation = "off" | "render" | "input";
export type QuoteStyle = "curly" | "straight";
export type DashStyle = "en-em" | "em";
export type AutoLanguage = "never" | "on-markdown-insert";
export type EquationNumbering = "none" | "ams";
export type MathOutput = "svg" | "mathml";
export type WhitespaceMode = "preserve" | "preserve-all" | "as-html";

export interface MarkdownSettings {
  /* Markdown 语法偏好 */
  heading_style: HeadingStyle;
  bullet_mark: BulletMark;
  ordered_mark: OrderedMark;
  /* ⚠️ 「严格模式」不在这儿，在顶层 `strict_markdown`。 */

  /* Markdown 扩展语法 —— 七项默认全开 */
  autolink: boolean;
  /** ⚠️ 界面上画在**两处**（扩展语法、公式），但只有这一个字段。 */
  inline_math: boolean;
  subscript: boolean;
  superscript: boolean;
  highlight: boolean;
  github_alerts: boolean;
  diagrams: boolean;

  /* 智能标点 */
  smart_punctuation: SmartPunctuation;
  smart_quotes: boolean;
  smart_quotes_double: QuoteStyle;
  smart_quotes_single: QuoteStyle;
  smart_dashes: boolean;
  dash_style: DashStyle;
  /** ⚠️ 只有 `smart_punctuation !== "off"` 时才有意义，界面上是灰的。 */
  unicode_punctuation: boolean;

  /* 自动更正（2026-09-27 加的一格） */
  /**
   * 自动更正错拼的英文单词（`teh` → `the` 这一类）。
   *
   * ⚠️ 只认一张固定的表（`src-tauri/src/settings/markdown.rs` 的字段注释里
   * 写了三条口径），**不做语法检查、不做中文**。只在敲下词尾空白时动手，
   * 且 `Ctrl+Z` 一步能撤销。
   */
  auto_correct: boolean;

  /* 代码块 */
  /**
   * 这一组四条**全是所见即所得里代码块的外观**，落地方式是 `<html>` 上的
   * `data-code-*` 属性 + CSS（`ui/useCodeBlockPrefs.ts`），**不进文档、不影响导出**。
   *
   * ⚠️ **四条都只作用于本机**：同一份 .md 在别人机器上长什么样，跟这四条无关。
   * 与表格列宽那类侧车（`~/.local/share/nota/table-widths.toml`）也不是一回事
   * ——那个记的是**某一份文档的某一张表**。
   *
   * ⚠️ **`code_line_numbers` / `code_wrap` 从 2026-09-22 起就是字段，但到
   * 2026-09-26 之前没有任何消费者**（界面上有开关、点了没反应）。那天接线时
   * 才发现，四条一起做完了。
   */
  code_line_numbers: boolean;
  code_wrap: boolean;
  /** 代码块**下面**那条工具栏（折叠 / 复制），在左。 */
  code_toolbar: boolean;
  /** 代码块**下面**那颗语言选择框，在右（与工具栏同一行）。 */
  code_language_picker: boolean;
  code_shift_tab_indent: boolean;
  /** ⚠️ 与 `editor.default_indent` 是两回事（这里默认 4，那里默认 2）。 */
  code_indent: number;
  /** 空串 = 不写语言。 */
  code_default_language: string;
  code_auto_language: AutoLanguage;

  /* 公式 */
  latex_delimiters: boolean;
  code_block_math: boolean;
  legacy_inline_math: boolean;
  equation_numbering: EquationNumbering;
  math_output: MathOutput;
  /* ⚠️ 「physics 宏包」不在这儿，在顶层 `enable_physics`。 */

  /* 空格与换行 —— 编辑时与导出时各一份，两个场合想要的东西常相反 */
  first_line_indent: boolean;
  show_br: boolean;
  whitespace_editing: WhitespaceMode;
  whitespace_export: WhitespaceMode;
}

export interface ExportSettings {
  /** **空串 = 自动**（跟当前文档所在目录走）。 */
  default_folder: string;
  open_after_export: boolean;
  /* ⚠️ **没有 Pandoc 路径**，而且不会有——但理由 2026-09-25 变了：
   * 以前是"不做 Pandoc"，现在是"**每次都现探**"。存下来的路径会过期
   *（换机器、重装、改 PATH），于是"明明装了却报没装"；现探永远是对的，
   * 代价只是每次多起一个进程。`settings/export.rs` 里有测试盯着这一项。 */
}

/**
 * 格式工具栏的三档（`settings.appearance.toolbar`）。
 *
 * ⚠️ 与 Rust 侧 `settings/appearance.rs` 的 `ToolbarMode` **一一对应**，连
 * 落盘的字符串都一致（`always` / `hover` / `never`），那边有一条测试钉着这三个词。
 */
export type ToolbarMode = "always" | "hover" | "never";

/**
 * Ctrl+滚轮**改什么**（2026-09-26）。
 *
 * ⚠️ 与 Rust 侧 `settings/appearance.rs` 的 `CtrlWheelTarget` **一一对应**，
 * 落盘的字符串也一致（`font_size` / `zoom`），那边有一条测试钉着这两个词。
 *
 * ⚠️ 它与 `ctrl_wheel_zoom` 是两个问题：那个布尔回答"生不生效"，
 * 这个回答"生效时改哪个数"。默认`font_size`（**字号**）。
 */
export type CtrlWheelTarget = "font_size" | "zoom";

export interface AppearanceSettings {
  /** 「自定义」界面字号。⚠️ 字号本身是顶层 `ui_font_size`，这个只是"算不算数"。 */
  custom_font_size: boolean;
  /** 整个界面的缩放百分比，100 是原始大小。 */
  zoom: number;
  /** Ctrl+滚轮**生不生效**。⚠️ 名字里的 `zoom` 是老名字，**改什么**看下面那一格。 */
  ctrl_wheel_zoom: boolean;
  /** Ctrl+滚轮改字号还是缩放。⚠️ 默认 `"font_size"`。 */
  ctrl_wheel_target: CtrlWheelTarget;
  show_status_bar: boolean;
  /**
   * 显示**菜单栏**（顶上那条「文件 / 编辑 / 视图 …」）。**默认 `true`**。
   *
   * ⚠️ 与下面的 `toolbar` **默认相反**，那是有意的：菜单栏是命令的总入口
   * （最近打开、导出、插件管理只在它里面），工具栏上那几条在菜单里都找得到。
   *
   * ⚠️ 藏起来之后界面上就没有写着"怎么开回来"的东西了，所以
   * `useChromeVisibility` 在藏下去的那一刻会发一条会自己走掉的提示。
   */
  show_menu_bar: boolean;
  /** 词每分钟，只用来把字数换算成"约几分几秒读完"。 */
  reading_speed: number;
  /** 格式工具栏什么时候露出来。⚠️ 默认 `"never"`（不显示）——见 Rust 侧 `ToolbarMode`。 */
  toolbar: ToolbarMode;
  dark_theme_separate: boolean;
  /** 深色模式用的文档主题 id。空串 = 跟浅色用同一个。 */
  dark_document_theme: string;
  /**
   * 「主题色」（强调色）。**空串 = 跟随当前风格**——那是默认，也是
   * 2026-09-26 之前唯一的行为。
   *
   * ⚠️ 这是**第三条外观轴**（前两条：`ui_style` 形状、`ui_mode` 明暗）。
   * 用户 2026-09-26：「这个主题只包含一个 UI 的设计样式，比如说圆角的半径，
   * 而不包含主题颜色，这样用户可以根据自己的喜好来定制。」
   *
   * ⚠️ 它只覆盖 `--accent` / `--accent-fg` 两个变量，**前景色不存**（按对比度
   * 当场算）。解析、换算、以及"认不出来怎么办"都在 `styles/accent.ts`。
   */
  accent: string;
}

export interface GeneralSettings {
  /**
   * 界面语言。`"auto"`（默认）= 跟系统走，别的值是 BCP-47 的短横线写法。
   *
   * ⚠️ **存的是设定，不是结果**：`auto` 的机器换一个 `LANG` 就该跟着变。
   * 想知道"此刻到底在说哪种语言"要用 `AppLang.effective`
   * （它由宿主算好，理由见 `nota_app_lang` 那段）。
   *
   * ⚠️ **改完要重启才生效**——插件在启动时按那个语言读好了自己的文案表，
   * 运行中换语言得把所有插件重装一遍。理由写在 `settings/general.rs`。
   */
  language: string;
  /** 把内部诊断信息也打到控制台。⚠️ **只加日志，不改行为**。 */
  debug_mode: boolean;
  /* ⚠️ 这里**不会有**遥测、许可证、外部服务器。`settings/general.rs`
   * 里有一条测试盯着这些字符串。 */
}

