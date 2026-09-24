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
//! 三条轴的落地形态见 `docs/04-ui-map.md` §外观（含 7 风格 × 2 模式的矩阵）。

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};
use crate::paths;

/// 界面风格。加新风格时**同时**要改：本枚举、`src/styles/theme.css` 里的
/// 风格块（形状 + 两种模式下的强调色）、`src/styles/applyTheme.ts` 的探测表、
/// `docs/04` 的外观一节。四处缺一不可。
///
/// ⚠️ **七种**风格**每一种都要在浅色和深色下成立**。形状写在 `[data-ui-style]`
/// 那一段，颜色写在 `[data-ui-mode]` 那一段，两者相乘（7 × 2 = 14 格）——
/// 别把颜色写进风格块（那样这个风格就没法配暗色了），也别把圆角写进模式块。
///
/// ⚠️ **`YaruBlue` 与 `Yaru` 共用一套形状**（它就是 Yaru），差别只有强调色。
/// 所以 `theme.css` 里形状那一段是**两个选择器并列**的——加第三档变体时
/// 也照这个写法，别去复制一遍圆角。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiStyle {
    /// 跟随当前桌面环境，探不到就用 Adwaita。
    Auto,
    /// GNOME 原生：中等圆角、紧凑。探不出桌面时的兜底。
    Adwaita,
    /// GitHub 的语言：冷灰蓝边框、无阴影、蓝色强调。颜色有自己一套（见 theme.css）。
    Ghub,
    /// macOS：大圆角、控件偏矮、层次靠阴影。
    Macos,
    /// KDE Plasma（Breeze）：方正偏圆、蓝色强调。
    Plasma,
    /// Windows 11：小圆角、直角感、蓝色强调。
    Windows,
    /// Ubuntu Yaru：大圆角、控件更高、橙色强调（Ubuntu 的默认档）。
    Yaru,
    /// Ubuntu Yaru 的**蓝色强调色**档（Yaru 自己就带这一档，不是我们配的）。
    /// 形状与 `Yaru` 一模一样，只有 `--accent` 换成 Yaru 蓝。
    YaruBlue,
}

impl Default for UiStyle {
    fn default() -> Self {
        UiStyle::Auto
    }
}

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

/// 编辑模式。**不是第四条外观轴**——它决定编辑区里摆几个窗格，与
/// `ui_style` / `ui_mode` / `document_theme` 三条轴无关（那三条管"长什么样"，
/// 这条管"怎么编辑"）。
///
/// ⚠️ 加值时同时要改：本枚举、`src/bridge/ipc.ts` 的 `ViewMode`、
/// `src/ui/commands.ts` 的「视图」栏、`docs/04-ui-map.md`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ViewMode {
    /// 所见即所得（Milkdown）。默认。
    Wysiwyg,
    /// Markdown 原文（CodeMirror）。对标 Typora 的 Source Code Mode。
    Source,
    /// 左边原文可编辑、右边预览只读。⚠️ **单向**：预览从不回写，
    /// 理由是编辑器往返会把文本规范化一遍（见 `src/editor/source.ts` 文件头）。
    Split,
}

impl Default for ViewMode {
    fn default() -> Self {
        ViewMode::Wysiwyg
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub ui_style: UiStyle,
    pub ui_mode: UiMode,
    /// 文档主题 **id**（不是显示名），对应 `themes::DocThemeInfo::id`。
    /// 空串表示"无主题"，即 `editor.css` 里那套中性样式。
    ///
    /// ⚠️ 存 id 不存名称：显示名是中文、随时可能改，改了不该让用户的设置失效。
    pub document_theme: String,
    /// 编辑模式。见 `ViewMode`。
    pub view_mode: ViewMode,
    /// 界面字号（px）。文档字号是文档主题的事，不在这里。
    pub ui_font_size: u32,
    /// 内容区宽度上限（px）。Typora 的"正文宽度"。
    pub content_width: u32,
    /// 关闭窗口时若有未保存改动，是否询问。
    pub confirm_unsaved: bool,
    /// 自动保存间隔（秒）。0 表示关闭自动保存。
    pub autosave_seconds: u32,
    /// **严格模式**：按 CommonMark 严格要求 Markdown 的写法。**默认关**。
    ///
    /// 目前它只管一件事：**ATX 标题的井号后面必须有空格**。
    /// 关着（默认）时 `#标题` 也算标题——这是**对标 Typora** 的默认行为
    /// （Typora 的「严格模式」默认也是关的，且开起来要重启才生效；
    /// 位置与两条差异见 `docs/10-typora-parity.md` §11.3）。
    /// 开着时 `#标题` 只是普通段落，`# 标题` 才是标题。
    ///
    /// ⚠️ **宽松不改字**：关着时 `#标题` 只是"按标题显示"，正文与存盘的字节
    /// 一个都不动（用户 2026-09-24 定的「如果关闭，存盘不要自动修复」）。
    ///
    /// ⚠️ **改这个默认值等于改全仓的行为**（后端认标题、前端解析/输入规则/大纲
    /// 一起变），所以只允许在这一处拍板。
    /// ⚠️ Typora 的严格模式还管"列表里的缩进对齐"，我们**没做**（见 `docs/07`）。
    /// ⚠️ 加值时同时要改：`src/bridge/ipc.ts` 的 `Settings`、
    /// `src/ui/settings/panes.tsx` 的 Markdown 那一页、`docs/03-data-structures.md`。
    pub strict_markdown: bool,
    /// **数学公式里的 physics 宏包**（`\qty`、`\dv`、`\braket`…）。**默认关**。
    ///
    /// 数学渲染走的是 KaTeX，而 **KaTeX 官方没有 physics**（它只自带
    /// mhchem 一个数学扩展）。所以这一档**不是"装载一个宏包"**，而是我们
    /// 自己写的一套宏定义在 `src/editor/math-macros.ts` 里，由前端按这个开关
    /// 决定要不要交给 KaTeX（走它的 `macros` 选项）。
    ///
    /// ⚠️ **默认关**，两个理由：① KaTeX 内核本来就不认这些命令，不开时
    /// 打错的宏会**如实报错**，比静默渲染成怪样子好排查；② physics 会
    /// **重定义 `\div`、`\Re`、`\Im`**（physics 自己的文档明说它会
    /// "redefine some latex macros"），一开就改了别人文档里既有公式的
    /// 意思——这种事不该是默认发生的。
    /// ⚠️ 判据与"我们覆盖到哪几条命令"见 `docs/10-typora-parity.md` §12。
    ///
    /// ⚠️ 加值时同时要改：`src/bridge/ipc.ts` 的 `Settings`、
    /// `src/editor/math-macros.ts`、`src/ui/settings/panes.tsx` 的 Markdown 页、
    /// `docs/03-data-structures.md`。
    pub enable_physics: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ui_style: UiStyle::default(),
            ui_mode: UiMode::default(),
            document_theme: String::new(),
            view_mode: ViewMode::default(),
            ui_font_size: 15,
            content_width: 760,
            confirm_unsaved: true,
            autosave_seconds: 0,
            // ⚠️ 宽松是**默认**：Typora 的严格模式默认关着，我们跟它对齐。
            strict_markdown: false,
            // ⚠️ physics 也是**默认关**：开着会重定义 \div \Re \Im，理由见字段上那段。
            enable_physics: false,
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
            Ok(text) => toml::from_str(&text).map_err(|e| NotaError::Config(format!(
                "解析 {} 失败：{e}",
                path.display()
            ))),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 默认设置能往返序列化() {
        let dir = std::env::temp_dir().join("nota-settings-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");

        let mut s = Settings::default();
        s.ui_style = UiStyle::Macos;
        s.ui_mode = UiMode::Dark;
        s.save_to(&path).unwrap();

        let back = Settings::load_from(&path).unwrap();
        assert_eq!(back.ui_style, UiStyle::Macos);
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
        assert_eq!(s.ui_style, UiStyle::Auto);
    }

    #[test]
    fn 枚举落盘用_kebab_风格() {
        // 存法即接口：`ui_style = "macos"`，不是 `"Macos"`。
        let s = Settings {
            ui_style: UiStyle::Macos,
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
    fn 编辑模式也走_kebab_而且默认是所见即所得() {
        // ⚠️ 这一条盯两件事，都是"改了不会有编译错、只会静默变行为"的那类：
        // 1. 落盘名是 `view_mode = "split"` 这种形状（加变体时最容易忘）；
        // 2. **默认值如实是 `wysiwyg`**。默认值错了的症状是"老用户升级后
        //    打开文件发现进了源码模式"——而他的设置文件里根本没有这一项。
        assert_eq!(ViewMode::default(), ViewMode::Wysiwyg);

        let s = Settings {
            view_mode: ViewMode::Split,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&s).unwrap();
        assert!(text.contains(r#"view_mode = "split""#), "实际是：\n{text}");

        // 没写这一项的老设置文件里要能补出默认值（`#[serde(default)]` 在结构体上）。
        let back: Settings = toml::from_str("ui_style = \"macos\"\n").unwrap();
        assert_eq!(back.view_mode, ViewMode::Wysiwyg);
    }
}
