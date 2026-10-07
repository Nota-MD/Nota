//! 用户设置。
//!
//! 三条**互相独立**的外观轴（用户 2026-09-22 与 2026-09-23 两次划死了边界）：
//!
//! 1. `ui_style` —— **界面风格**，是一整套设计语言。换的不只是颜色，还包括
//!    控件形状、圆角、间距、动效、字体栈。⚠️ 它**不是**"主题"的同义词。
//! 2. `ui_mode` —— 明暗。`auto` 时跟随系统（Linux 走 XDG desktop portal 的
//!    `color-scheme`）。这条轴在**任何**风格下都成立。
//! 3. `document_theme` —— **文档主题**，只管编辑区那一块。
//!
//! ⚠️⚠️ **前两条管外壳，第三条只管正文，它们之间没有任何耦合。**
//! 用户 2026-09-23 的原话是「这是文档风格，不是界面风格，不应该影响到UI主题」。
//! 曾经有过一版把文档主题的配色桥接进界面变量，结果选个浅色文档主题、整个
//! 应用的侧栏和菜单跟着变亮，一半亮一半暗——那一整套桥接已拆干净，
//! 守住这条线的机制在 `src/styles/doc-theme.ts`（注入前强制限域）。
//!
//! 三条轴的落地形态见 `docs/04-ui-map.md` §外观（含 8 风格 × 2 模式 = 16 格的矩阵）。
//! ⚠️ 2026-09-26 起 `ui_style` 的取值是**开放的**（用户能导入风格文件），
//! 所以它是 `String` 而不是枚举——理由见 [`DEFAULT_UI_STYLE`] 那一段。
//!
//! # 这个模块为什么是一个目录
//!
//! 2026-09-24 一次性加进来 30 多个设置项。全塞进一个文件会超过 1000 行的上限，
//! 所以按**界面上的页**拆开——一页一个文件，名字和那一页一一对应：
//!
//! | 界面上的页 | 文件 |
//! |---|---|
//! | 文件 | [`files`] |
//! | 编辑器 | [`editor`] |
//! | 图像 | [`image`] |
//! | Markdown | [`markdown`] |
//! | 导出 | [`export`] |
//! | 外观 | [`appearance`] |
//! | 通用 | [`general`] |
//! | 强制专注 | [`focus`] |
//! | 文档主题 | [`document`] —— ⚠️ **表名与页名差一点**，理由见 [`document`] 顶上的文件头 |
//! | 快捷键 | [`keys`] —— ⚠️ 2026-09-27 起**有字段了**（`[keys.overrides]`）。此前这一行写的是"没有文件也没有字段，那是 `src/bridge/` 的事"，**两处都不对**：整张键位表在 `src/ui/commands.ts`，而"用户改过的那几条"需要落盘，否则重启就丢 |
//!
//! ⚠️⚠️ **老的那 10 个字段一个都没挪。** 它们还在这一层的顶层，包括
//! `strict_markdown`（严格模式）和 `enable_physics`（physics 宏包）——
//! 按语义这两个该住进 `[markdown]` 表，但**搬家会让老设置文件里的值静默丢回
//! 默认**：用户开了 physics、升级之后公式全变成红字报错，而他的
//! `settings.toml` 一个字都没变。这种"看着好好的"故障最难排查，
//! 所以宁可在结构上留一点不一致，也不动它们。界面照旧把这两条画在 Markdown
//! 那一页里，用户看不出区别。
//!
//! ⚠️ 新字段一律进 `[页名]` 表。落到用户机器上的形状是：
//!
//! ```toml
//! ui_style = "macos"        # ← 老字段，留在顶层
//! ui_mode = "dark"
//! # …另外 8 个…
//!
//! [markdown]                # ← 新字段，按页分表
//! highlight = true
//! smart_punctuation = "input"
//!
//! [editor]
//! default_indent = 2
//! ```

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};
use crate::paths;

pub mod appearance;
pub mod document;
pub mod editor;
pub mod export;
pub mod files;
pub mod focus;
pub mod general;
pub mod image;
pub mod keys;
pub mod markdown;

pub use appearance::Appearance;
pub use document::{DocFont, Document};
pub use editor::Editor;
pub use export::Export;
pub use files::Files;
pub use focus::Focus;
pub use general::General;
pub use image::Image;
pub use keys::Keys;
pub use markdown::Markdown;

/// 界面风格的**默认值**（`ui_style` 那一格没写时用哪个）。
///
/// ⚠️⚠️ **`ui_style` 是一个 `String`，不是枚举**——这是 2026-09-26 改的口径，
/// 用户原话：「本来主题应该就是拆成多个文件的。加一个就是允许用户导入」。
/// 用户把一个 `<id>.css` 丢进 `~/.config/nota/ui-styles/` 就多出一档风格
/// （`ui_styles.rs`），所以**它能取的值是开放的**，枚举写不下。
/// 这与 `document_theme` 那一格是同一种做法（那一格早就是 `String`）。
///
/// ⚠️ 换成 `String` 的**直接好处**与风险各一条：
/// - 好处：老设置文件里出现一个我们不认识的 id（用户装的风格被删了、
///   或者从别人的机器上拷了配置）时**反序列化不会失败**——用枚举的话
///   整份 `settings.toml` 都会读不进来，用户会看到"我的设置全没了"；
/// - 风险：**拼错的 id 不再有任何编译期或运行期的拦截**。前端**不退回默认档**
///   ——`styles/applyTheme.ts::resolveStyle` 原样返回，`<html>` 上就写着一个
///   没有对应 CSS 的 `data-ui-style`，整个外壳落到 `:root` 的默认样式。
///   这是**故意选的**（与 `document_theme` 同一条口径：用户没选过的东西，
///   我们不许替他改），为此「外观」页把清单里没有的那个 id **补成一条选项**、
///   显示成`（找不到「…」）`（`AppearancePane` 的 `选项`），
///   让"生效的是这个东西、而它找不到"这句话看得见。
///   也就是说：**这里出事是"看得见的破相"，不是"静默换了一档"**——
///   后者会让用户以为设置没保存。
///
/// ⚠️ 内置那几档的 id 清单在 `ui_styles::BUILTIN_IDS`（三份抄本之一，
/// 另两份是 `theme/shape.css` 与前端的 `STYLE_ORDER`，机器判据是
/// `tools/doc-sync-check.sh` ⑦）。
pub const DEFAULT_UI_STYLE: &str = "auto";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiMode {
    Auto,
    Light,
    Dark,
}

impl Default for UiMode {
    fn default() -> Self {
        UiMode::Auto
    }
}

// ⚠️ 编辑模式（`wysiwyg` / `source` / `split`）**2026-10-07 起不在这里**：
// 它是**会话内状态**、不落设置文件——每次启动一律所见即所得（用户原话：
// 「请设置默认启动为 WYSIWYG」）。那条 `useState` 现在住在
// `src/ui/useFileKindMode.ts`；`ViewMode` 这个类型只活在前端
// （`src/bridge/types.ts`），Rust 侧没有对应物了。
// 老设置文件里残留的 `view_mode = "…"` 一律**被忽略**（serde 的默认行为，
// 由下面 `老设置文件里没有那七张表时全是默认值` 那条测试盯着）。

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// 界面风格 **id**（不是显示名、不是枚举）。见 [`DEFAULT_UI_STYLE`] 那一段：
    /// 内置八档的 id 在 `ui_styles::BUILTIN_IDS`，用户导入的是他自己起的文件名。
    pub ui_style: String,
    pub ui_mode: UiMode,
    /// 文档主题 **id**（不是显示名），对应 `themes::DocThemeInfo::id`。
    /// 空串表示"无主题"，即 `editor.css` 里那套中性样式。
    ///
    /// ⚠️ 存 id 不存名称：显示名是中文、随时可能改，改了不该让用户的设置失效。
    pub document_theme: String,
    /// 界面字号（px）。文档字号是文档主题的事，不在这里。
    pub ui_font_size: u32,
    /// 内容区宽度上限（px）。
    pub content_width: u32,
    /// 关闭窗口时若有未保存改动，是否询问。
    pub confirm_unsaved: bool,
    /// 自动保存间隔（秒）。0 表示关闭自动保存。
    pub autosave_seconds: u32,
    /// **严格模式**：按 CommonMark 严格要求 Markdown 的写法。**默认关**。
    ///
    /// 目前它只管一件事：**ATX 标题的井号后面必须有空格**。
    /// 关着（默认）时 `#标题` 也算标题，开着时 `#标题` 只是普通段落、
    /// `# 标题` 才是标题。这一档只有这两个取值，改动立即生效，不需要重启
    /// （位置见 `docs/10-feature-matrix.md`）。
    ///
    /// ⚠️ **宽松不改字**：关着时 `#标题` 只是"按标题显示"，正文与存盘的字节
    /// 一个都不动（用户 2026-09-24 定的「如果关闭，存盘不要自动修复」）。
    ///
    /// ⚠️ **改这个默认值等于改全仓的行为**（后端认标题、前端解析/输入规则/大纲
    /// 一起变），所以只在这一处定义。
    /// ⚠️ "列表里的缩进对齐"不在这一档的作用范围内，尚未实现（见 `docs/07`）。
    /// ⚠️ 加值时同时要改：`src/bridge/ipc.ts` 的 `Settings`、
    /// `src/ui/settings/panes/MarkdownPane.tsx`、`docs/03-data-structures.md`。
    pub strict_markdown: bool,
    /// **数学公式里的 physics 宏包**（`\qty`、`\dv`、`\braket`…）。**默认关**。
    ///
    /// 数学渲染走的是 KaTeX，而 **KaTeX 官方没有 physics**（它只自带
    /// mhchem 一个数学扩展）。所以这一档**不是"装载一个宏包"**，而是一套自写的
    /// 宏定义，在 `src/editor/math-macros.ts` 里，由前端按这个开关
    /// 决定要不要交给 KaTeX（走它的 `macros` 选项）。
    ///
    /// ⚠️ **默认关**，两个理由：① KaTeX 内核本来就不认这些命令，不开时
    /// 打错的宏会**如实报错**，比静默渲染成怪样子好排查；② physics 会
    /// **重定义 `\div`、`\Re`、`\Im`**（physics 自己的文档明说它会
    /// "redefine some latex macros"），一开就改了别人文档里既有公式的
    /// 意思——这种事不该是默认发生的。
    /// ⚠️ 判据与已覆盖的命令清单见 `docs/10-feature-matrix.md`。
    ///
    /// ⚠️ 加值时同时要改：`src/bridge/ipc.ts` 的 `Settings`、
    /// `src/editor/math-macros.ts`、`src/ui/settings/panes/MarkdownPane.tsx`、
    /// `docs/03-data-structures.md`。
    pub enable_physics: bool,

    // ── 以下按界面上的页分表（2026-09-24 起）─────────────────────────────
    //
    // ⚠️ **顺序要紧**：TOML 要求"标量在前、表在后"，所以这些（2026-09-27 起是
    // 九个）必须在上面那些标量**后面**声明。挪到前面去会让 `save()` 直接报
    // `values must be emitted before tables`——而那个错在写盘那一刻才炸。
    /// 「文件」页。见 [`files`]。
    pub files: Files,
    /// 「编辑器」页。见 [`editor`]。
    pub editor: Editor,
    /// 「图像」页。见 [`image`]。
    pub image: Image,
    /// 「Markdown」页。见 [`markdown`]。
    /// ⚠️ 严格模式与 physics **不在**这里面，理由见本文件头部。
    pub markdown: Markdown,
    /// 「导出」页。见 [`export`]。
    pub export: Export,
    /// 「外观」页。见 [`appearance`]。
    /// ⚠️ 三条外观轴（`ui_style` / `ui_mode` / `document_theme`）和
    /// `ui_font_size` **不在**这里面，理由见本文件头部与 `appearance.rs`。
    pub appearance: Appearance,
    /// 「通用」页。见 [`general`]。
    pub general: General,
    /// 「强制专注」页。见 [`focus`]。
    ///
    /// ⚠️ 这一页**不是插件的**（用户 2026-09-26：「这不是插件。这是核心功能」）。
    /// 它要窗口焦点、要开置顶窗、要出声，三样都在插件沙箱之外。
    /// ⚠️ **会话状态（此刻的余额、还剩多久）不在这里**：那份状态活在内存里
    /// （`crate::focus`），重启就没了。落盘的只有"用户偏好"，这是对的——
    /// 用户关了应用再打开，不该发现自己还在一个上一轮的专注会话里。
    pub focus: Focus,
    /// 「文档主题」页里那四个**可调项**（行距 / 段距 / 字体 / 字号）。
    /// 见 [`document`]。
    ///
    /// ⚠️ **"用哪一套主题"**（`document_theme`）在上面那堆顶层标量里，不在这里。
    /// 那一格是老字段，搬家会让老设置文件里的值静默丢回默认。
    pub document: Document,
    /// 「快捷键」页里**用户改过的那几条**。见 [`keys`]。
    ///
    /// ⚠️ **存的是差量，不是整张键位表**：整张表的真相源是前端
    /// `src/ui/commands.ts` 的 `MENUS`。理由（加新命令怎么办、改默认键位怎么办）
    /// 写在 `keys.rs` 头上，动这个字段之前先看那一段。
    pub keys: Keys,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ui_style: DEFAULT_UI_STYLE.to_owned(),
            ui_mode: UiMode::default(),
            document_theme: String::new(),
            ui_font_size: 15,
            content_width: 760,
            confirm_unsaved: true,
            autosave_seconds: 0,
            // ⚠️ 宽松是**默认**：`#标题` 是文档里最常见的写法，
            // 改这个默认值等于改全仓的解析行为。
            strict_markdown: false,
            // ⚠️ physics 也是**默认关**：开着会重定义 \div \Re \Im，理由见字段上那段。
            enable_physics: false,
            files: Files::default(),
            editor: Editor::default(),
            image: Image::default(),
            markdown: Markdown::default(),
            export: Export::default(),
            appearance: Appearance::default(),
            general: General::default(),
            focus: Focus::default(),
            document: Document::default(),
            keys: Keys::default(),
        }
    }
}

impl Settings {
    /// 从磁盘读。文件不存在**不算错误**——首次启动就是这种情况，返回默认值。
    /// 文件存在但解析不了则报错：静默回默认会让人以为设置被吞了。
    pub fn load() -> Result<Self> {
        let path = paths::settings_file()?;
        Self::load_from(&path)
    }

    pub fn load_from(path: &Path) -> Result<Self> {
        match std::fs::read_to_string(path) {
            Ok(text) => toml::from_str(&text).map_err(|e| {
                // ⚠️⚠️ **读不懂的那份先留一个副本**（2026-09-25 加）。
                //
                // 原来这里只报错、不留底：宿主退回默认值继续启动，界面上是一份
                // 出厂设置。用户看不见任何异样，直到**动一下任何一个开关**——
                // 那一下会 `save()`，把这份读不懂的文件**整份覆盖掉**。
                // 于是"我的设置自己变回默认了，还回不去"，而原始文件那时候
                // 已经没了。备份是这条路上唯一的退路。
                //
                // ⚠️ 备份**尽力而为**：拷不动（磁盘满 / 只读挂载）就算了，
                // 但那不能让原先这条错误改变模样——原文件还在，用户自己还能救。
                let 备份 = 留一份备份(path);
                let 尾巴 = match &备份 {
                    Some(b) => format!("（原文件已另存为 {}）", b.display()),
                    None => String::new(),
                };
                NotaError::Config(format!("解析 {} 失败：{e}{尾巴}", path.display()))
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(NotaError::Read {
                path: path.to_path_buf(),
                source: e,
            }),
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = paths::settings_file()?;
        self.save_to(&path)
    }

    pub fn save_to(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            paths::ensure_dir(parent)?;
        }
        let text = toml::to_string_pretty(self)
            .map_err(|e| NotaError::Config(format!("序列化设置失败：{e}")))?;
        std::fs::write(path, text).map_err(|source| NotaError::Write {
            path: path.to_path_buf(),
            source,
        })
    }
}

/// 把读不懂的那份设置拷成 `<文件>.bak`，返回副本路径。
///
/// ⚠️ 已经有一份 `.bak` 时**照旧覆盖**：这两份都是"某一刻读不懂的设置"，
/// 而用户此刻要救的是手上这一份。改名加时间戳会在设置目录里越攒越多，
/// 而设置目录是用户打开"设置文件所在目录"时看到的地方。
///
/// 返回 `None` = 没拷成（权限 / 磁盘满），调用方只负责别把它说成成功。
fn 留一份备份(path: &Path) -> Option<PathBuf> {
    let mut raw = path.as_os_str().to_owned();
    raw.push(".bak");
    let bak = PathBuf::from(raw);
    std::fs::copy(path, &bak).ok()?;
    Some(bak)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ⚠️ **解析失败时原文件要被留一份**（BUG-23）：不留的话，用户第一次动
    /// 设置就会 `save()` 把它整份覆盖掉——"我的设置自己变回默认了，还回不去"。
    #[test]
    fn 读不懂的设置会先留一份备份() {
        let dir = std::env::temp_dir().join("nota-settings-backup-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");
        std::fs::write(&path, "ui_style = [这不是合法的 TOML").unwrap();

        let r = Settings::load_from(&path);
        assert!(r.is_err(), "解析不了要报错，不能静默回默认");

        let bak = dir.join("settings.toml.bak");
        assert!(bak.exists(), "原文件要留一份副本");
        assert_eq!(
            std::fs::read_to_string(&bak).unwrap(),
            "ui_style = [这不是合法的 TOML",
            "副本要和原文件逐字节一致"
        );
        assert!(
            r.unwrap_err().to_string().contains("另存为"),
            "文案要告诉用户副本在哪，否则那句提示等于没说"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 文件不存在**不算错误**（首次启动就是这种情况），而且**不该留下 `.bak`**。
    #[test]
    fn 设置文件不存在时给默认值且不留备份() {
        let dir = std::env::temp_dir().join("nota-settings-absent-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");

        let s = Settings::load_from(&path).unwrap();
        assert_eq!(s.strict_markdown, Settings::default().strict_markdown);
        assert!(!dir.join("settings.toml.bak").exists(), "什么都没读到，没什么可备份");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 默认设置能往返序列化() {
        let dir = std::env::temp_dir().join("nota-settings-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");

        let mut s = Settings::default();
        s.ui_style = "macos".to_owned();
        s.ui_mode = UiMode::Dark;
        s.save_to(&path).unwrap();

        let back = Settings::load_from(&path).unwrap();
        assert_eq!(back.ui_style, "macos");
        // 老设置文件里没有这一项时要能补出默认值（`#[serde(default)]` 在结构体上）。
        assert!(!back.enable_physics);
        assert_eq!(back.ui_mode, UiMode::Dark);
        assert_eq!(back.content_width, 760);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 文件不存在时回默认而不是报错() {
        let path = std::env::temp_dir().join("nota-does-not-exist-xyz/settings.toml");
        let s = Settings::load_from(&path).unwrap();
        assert_eq!(s.ui_style, DEFAULT_UI_STYLE);
    }

    #[test]
    fn 枚举落盘用_kebab_风格() {
        // 存法即接口：`ui_style = "macos"`，不是 `"Macos"`。
        // ⚠️ `ui_style` 2026-09-26 起是 `String`（用户能导入风格），但**内置那几档
        // 的 id 仍然是 kebab-case 的**，所以这条口径没变；`ui_mode` 那个枚举的
        // kebab-case 由下面几行钉着（`view_mode` 2026-10-07 已退休，见上面那段）。
        let s = Settings {
            ui_style: "macos".to_owned(),
            ..Default::default()
        };
        let text = toml::to_string_pretty(&s).unwrap();
        assert!(text.contains(r#"ui_style = "macos""#), "实际是：\n{text}");
    }

    #[test]
    fn physics_默认是关的且能往返() {
        // ⚠️ 这一条盯的是**默认值**：开着的话 \div 会被换成散度算子，
        // 用户文档里既有的公式意思就变了——这种事只能是人主动开的。
        assert!(!Settings::default().enable_physics);

        let s = Settings {
            enable_physics: true,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&s).unwrap();
        assert!(text.contains("enable_physics = true"), "实际是：\n{text}");
        let back: Settings = toml::from_str(&text).unwrap();
        assert!(back.enable_physics);
    }

    #[test]
    fn 七页设置能整份往返() {
        // 挑每一项都改成**非默认**的值再往返——只改一个字段的测试会漏掉
        // "某个表压根没被序列化"这种错。
        let dir = std::env::temp_dir().join("nota-settings-panes-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");

        let mut s = Settings::default();
        s.files.show_hidden = true;
        s.files.startup = files::StartupAction::LastSession;
        s.editor.default_indent = 8;
        s.editor.line_ending = editor::LineEnding::Crlf;
        s.image.insert_action = image::InsertImageAction::CopyToAssets;
        s.markdown.highlight = false;
        s.markdown.smart_punctuation = markdown::SmartPunctuation::Render;
        s.markdown.bullet_mark = markdown::BulletMark::Star;
        s.markdown.code_indent = 2;
        s.export.open_after_export = true;
        s.appearance.zoom = 125;
        s.general.debug_mode = true;
        s.save_to(&path).unwrap();

        let back = Settings::load_from(&path).unwrap();
        assert!(back.files.show_hidden);
        assert_eq!(back.files.startup, files::StartupAction::LastSession);
        assert_eq!(back.editor.default_indent, 8);
        assert_eq!(back.editor.line_ending, editor::LineEnding::Crlf);
        assert_eq!(back.image.insert_action, image::InsertImageAction::CopyToAssets);
        assert!(!back.markdown.highlight);
        assert_eq!(
            back.markdown.smart_punctuation,
            markdown::SmartPunctuation::Render
        );
        assert_eq!(back.markdown.bullet_mark, markdown::BulletMark::Star);
        assert_eq!(back.markdown.code_indent, 2);
        assert!(back.export.open_after_export);
        assert_eq!(back.appearance.zoom, 125);
        assert!(back.general.debug_mode);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 标量写在表前面否则_toml_会拒收() {
        // ⚠️⚠️ **这一条是结构体字段顺序的守门员。**
        // TOML 要求"标量在前、表在后"。`settings/appearance.rs` 那七张表
        // 如果哪天被挪到 `ui_style` 前面，`save()` 会在**写盘那一刻**报
        // `values must be emitted before tables`——而 `load()` 照样能读，
        // 于是一个只在保存路径上炸的 bug。让它在测试里炸。
        let s = Settings::default();
        let text = toml::to_string_pretty(&s).expect("序列化该成功（字段顺序错了就会在这儿炸）");

        // 第一张表的表头出现的位置，必须在最后一个顶层标量**之后**。
        let 第一张表 = text.find("\n[").expect("该有至少一张表");
        let 最后的标量 = text
            .rfind("\nenable_physics = ")
            .expect("enable_physics 该是最后一个顶层标量");
        assert!(
            最后的标量 < 第一张表,
            "标量必须排在所有表之前，实际顺序是：\n{text}"
        );
    }

    #[test]
    fn 老设置文件里没有那七张表时全是默认值() {
        // ⚠️⚠️ **这是整个拆分里最重要的一条：老文件不许被静默改掉。**
        // 用户在 `~/.config/nota/settings.toml` 里存的是 2026-09-24 之前的
        // 形状（只有那十个顶层键）。新版本读它的时候，还认的那几条必须
        // **原样认出来**，七张新表则一律取默认——而不是"解析失败 → 回默认 →
        // 用户的偏好没了"。
        //
        // ⚠️ `view_mode` 2026-10-07 **退休**（模式改成会话内状态、不落盘），
        // 它**故意留在这个样例里**：老文件里残留的那一行必须被**忽略而不是
        // 报错**——这正是"老设置文件照旧能开"这条不变量现在盯的东西。
        let 老文件 = r#"
ui_style = "ghub"
ui_mode = "dark"
document_theme = "night"
view_mode = "split"
ui_font_size = 17
content_width = 900
confirm_unsaved = false
autosave_seconds = 60
strict_markdown = true
enable_physics = true
"#;
        let s: Settings = toml::from_str(老文件).expect("老文件必须仍然能解析");

        // 九条老的一个不少（第十条 `view_mode` 已退休，见上）。
        assert_eq!(s.ui_style, "ghub");
        assert_eq!(s.ui_mode, UiMode::Dark);
        assert_eq!(s.document_theme, "night");
        assert_eq!(s.ui_font_size, 17);
        assert_eq!(s.content_width, 900);
        assert!(!s.confirm_unsaved);
        assert_eq!(s.autosave_seconds, 60);
        assert!(s.strict_markdown, "严格模式被静默关了就是这条要挡的事");
        assert!(s.enable_physics, "physics 被静默关了就是这条要挡的事");

        // 七张新表全是默认。
        assert_eq!(s.markdown, Markdown::default());
        assert_eq!(s.editor, Editor::default());
        assert_eq!(s.files, Files::default());
        assert_eq!(s.appearance, Appearance::default());
    }
}
