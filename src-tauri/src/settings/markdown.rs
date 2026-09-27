//! 「Markdown」那一页的设置。**七页里最大的一页**，共六组。
//!
//! 分组与顺序：
//!
//! ```text
//! Markdown 语法偏好   ← 严格模式(顶层) / 标题样式 / 无序列表 / 有序列表
//! Markdown 扩展语法   ← 自动识别链接 / 内联公式 / 下标 / 上标 / 高亮 / 警报框 / 图表
//! 智能标点            ← 模式 / 智能引号 / 智能破折号 / Unicode 标点
//! 代码块              ← 行号 / 自动换行 / Shift+Tab / 缩进 / 默认语言 / 自动加语言
//! 公式                ← 内联公式(同上) / 定界符 / 代码块公式 / physics(顶层) / 兼容 / 编号
//! 空格与换行          ← 首行缩进 / 显示 <br/> / 编辑时 / 导出与打印
//! ```
//!
//! ⚠️ **两项留在顶层，没有搬进来**：`strict_markdown`（严格模式）和
//! `enable_physics`（physics 宏包）。它们早就在 `settings/mod.rs` 的顶层，
//! 搬进 `[markdown]` 表会让**老设置文件里的值静默丢回默认**——用户开了
//! physics、升级之后发现公式全报错，而他的配置文件一个字都没变。
//! 界面照旧把它们画在 Markdown 这一页里（见 `src/ui/settings/panes/MarkdownPane.tsx`）。
//!
//! ⚠️ **「内联公式」在界面上出现两次**（扩展语法组和公式组各一次）。
//! 那是**同一个开关画在两处**，不是两个设置。这里也只有一个 `inline_math`。

use serde::{Deserialize, Serialize};

/// ATX 与 Setext 两种写法。⚠️ 它决定的是**生成**标题时写哪种，不是**识别**哪种——
/// 两种都识别（`src/editor/lax-heading.ts`），这一条只管菜单栏 / 快捷键
/// 新插一个标题时落哪一串字节。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HeadingStyle {
    /// `## 标题`。**默认**。
    Atx,
    /// 下划线式：`标题` 下面跟一行 `===`（一级）或 `---`（二级）。
    /// ⚠️ Setext **只有一级和二级**，没有三级——三级及以上仍然落成 ATX。
    Setext,
}

impl Default for HeadingStyle {
    fn default() -> Self {
        HeadingStyle::Atx
    }
}

/// 无序列表的标记。
///
/// ⚠️ 变体名是**名字**不是符号（`dash` 不是 `-`）。理由见
/// `settings/files.rs` 里那条测试的注释：`-` 在 TOML 里是语法错。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BulletMark {
    /// `-`。**默认**，CommonMark 的惯例。
    Dash,
    /// `*`
    Star,
    /// `+`
    Plus,
}

impl Default for BulletMark {
    fn default() -> Self {
        BulletMark::Dash
    }
}

impl BulletMark {
    /// 真正写进文档的那个字符。
    pub fn 符号(self) -> char {
        match self {
            BulletMark::Dash => '-',
            BulletMark::Star => '*',
            BulletMark::Plus => '+',
        }
    }
}

/// 有序列表的标记。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OrderedMark {
    /// `1. 2. 3.`。**默认**。
    Dot,
    /// `1) 2) 3)`
    Paren,
}

impl Default for OrderedMark {
    fn default() -> Self {
        OrderedMark::Dot
    }
}

impl OrderedMark {
    /// `n` 号条目的前缀（`n` 从 1 起）。
    pub fn 前缀(self, n: usize) -> String {
        match self {
            OrderedMark::Dot => format!("{n}. "),
            OrderedMark::Paren => format!("{n}) "),
        }
    }
}

/// 智能标点在**什么时候**生效。
///
/// ⚠️⚠️ 这一档是整页里最需要说清楚的，因为它直接碰**用户的字节**。
/// Nota 有一条铁律：**不改用户字节**（`docs/10` §11.2 那张「不做的事与理由」表
/// 里，保存时缩进宽度、标记转换都在那儿）。但这一条不违反它，理由分三条：
///
/// 1. `Render`（**仅解析时转换**）**一个字节都不写**——转换只发生在渲染的那一步，
///    存盘的还是用户打的那两个减号。这条永远安全。
/// 2. `Input`（输入时转换）改的是**用户正在打的那几个字符**：他打了 `--`，
///    屏幕上当场变成 `–`。这与输入法的自动更正是一回事——
///    **不是**"打开一个老文件、保存时偷偷把里面的 `--` 全换掉"。
///    铁律挡的是后者。
/// 3. 它**永远不会**回头去改已经存在的文本：只在 `inputRules` 里对
///    **刚敲进去的那一下**生效。老文档打开再保存，字节不动。
///
/// ⚠️ 用户 2026-09-24 明确说了「可以适当引入智能标点等」，所以这一档是**做**的。
/// 默认取 `Input`：它只改刚敲进去的那一下，与输入法的体感一致，且不动已有字节。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SmartPunctuation {
    /// 关闭。
    Off,
    /// 仅解析时转换：渲染时把 `--` 显示成 `–`，**存盘仍是 `--`**。
    Render,
    /// 输入时转换：敲下去当场变。**默认**。
    Input,
}

impl Default for SmartPunctuation {
    fn default() -> Self {
        SmartPunctuation::Input
    }
}

/// 弯引号还是直引号。
///
/// ⚠️ 引号字形按**语区**细分可以有好几档（英文、法文、德文各有各的形状），
/// 这里**只做两档**：弯和直。其余语区的字形尚未实现，属于欠账，
/// 记在 `docs/10` §11.2 的缺口表里。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QuoteStyle {
    /// 弯引号 `“ ”` `‘ ’`。**默认**。
    Curly,
    /// 直引号 `"` `'`（等价于"不转换"）。
    Straight,
}

impl Default for QuoteStyle {
    fn default() -> Self {
        QuoteStyle::Curly
    }
}

/// `--` 变成什么。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DashStyle {
    /// `--` → `–`（en dash），`---` → `—`（em dash）。**默认**。
    EnEm,
    /// `--` 和 `---` 都 → `—`（em dash）。
    Em,
}

impl Default for DashStyle {
    fn default() -> Self {
        DashStyle::EnEm
    }
}

/// 什么时候自动往新代码块里填语言。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AutoLanguage {
    /// 从不。
    Never,
    /// 当通过 Markdown 代码（```` ```语言 ````）插入代码块时。**默认**。
    OnMarkdownInsert,
}

impl Default for AutoLanguage {
    fn default() -> Self {
        AutoLanguage::OnMarkdownInsert
    }
}

/// 公式自动编号。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EquationNumbering {
    /// 不启用。**默认**——绝大多数人的文档里没有编号这回事，
    /// 默认打开会在每个公式右边多出一个 `(1)`。
    None,
    /// AMS 风格（`\begin{equation}` 那种环境才编号）。
    Ams,
}

impl Default for EquationNumbering {
    fn default() -> Self {
        EquationNumbering::None
    }
}

/// 复制 / 导出公式时给什么。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MathOutput {
    /// SVG。**默认**——不依赖接收方的字体，在任何环境下外观一致。
    Svg,
    /// MathML。
    Mathml,
}

impl Default for MathOutput {
    fn default() -> Self {
        MathOutput::Svg
    }
}

/// 连续空格与换行怎么处理。编辑时和导出与打印**各一份**，因为这两个场合
/// 想要的东西经常相反：编辑时想看见自己打的空格，导出时想让它合起来。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WhitespaceMode {
    /// 保留连续的空格与单个换行。**默认**。
    Preserve,
    /// 保留所有空格与换行。
    PreserveAll,
    /// 按 HTML 处理（折叠成单个空格）。
    AsHtml,
}

impl Default for WhitespaceMode {
    fn default() -> Self {
        WhitespaceMode::Preserve
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Markdown {
    // ── Markdown 语法偏好 ────────────────────────────────────────────────
    /// 生成标题时写 ATX 还是 Setext。⚠️ 「严格模式」不在这儿，在顶层。
    pub heading_style: HeadingStyle,
    /// 生成无序列表时用哪个标记。
    pub bullet_mark: BulletMark,
    /// 生成有序列表时用哪个标记。
    pub ordered_mark: OrderedMark,

    // ── Markdown 扩展语法 ────────────────────────────────────────────────
    /// 自动识别链接：`https://example.com` 这种裸地址直接变链接。
    pub autolink: bool,
    /// 内联公式 `$LaTeX$`。⚠️ 界面上在**两处**出现（扩展语法组与公式组），
    /// 这是同一个开关。
    pub inline_math: bool,
    /// 下标 `H~2~O`。
    pub subscript: bool,
    /// 上标 `X^2^`。
    pub superscript: bool,
    /// 高亮 `==key==`。
    pub highlight: bool,
    /// GitHub 风格警报框（`> [!NOTE]` 那套）。
    pub github_alerts: bool,
    /// 图表：序列图、流程图、Mermaid。
    pub diagrams: bool,

    // ── 智能标点 ────────────────────────────────────────────────────────
    /// 什么时候转换。**这一档的取舍见 `SmartPunctuation` 上的长注释。**
    pub smart_punctuation: SmartPunctuation,
    /// 智能引号。
    pub smart_quotes: bool,
    /// 双引号的字形。
    pub smart_quotes_double: QuoteStyle,
    /// 单引号的字形。
    pub smart_quotes_single: QuoteStyle,
    /// 智能破折号。
    pub smart_dashes: bool,
    /// `--` / `---` 变成什么。
    pub dash_style: DashStyle,
    /// 解析 Markdown 时允许并转化 Unicode 标点。
    /// ⚠️ 上面那档选「关闭」时本项在界面上呈灰色：没有转换发生时它无从生效。
    ///
    /// ⚠️⚠️ **本项到 2026-09-27 仍然没有消费者**（同组其余六项那天接上线了，
    /// 见 `docs/07` 第 72 项）。它的说明管的是**解析**侧（"读一份文件时，
    /// 里面的 Unicode 引号算不算 Markdown 标记"），而接线的那六项管的是
    /// **输入**侧，两者不是一回事——所以它没跟着一起落地。缺口记在
    /// `docs/10` §11.2。
    pub unicode_punctuation: bool,

    // ── 自动更正 ────────────────────────────────────────────────────────
    /// **自动更正错拼的英文单词**（`teh` → `the`、`recieve` → `receive` 这一类）。
    ///
    /// ⚠️ 这是**新加的一格**（2026-09-27），此前 `docs/10` §8 只有一行光秃秃的
    /// ⬜、全仓没有一处给过它定义。口径由那天定了，三条：
    ///
    /// 1. **只认一张固定的表**（约三十条最常见的英文错拼，写在
    ///    `src/editor/auto-correct.ts`）。**不做语法检查、不做句首自动大写、
    ///    不碰中文**——那几样要么得带一套词法，要么猜错的代价远大于收益。
    /// 2. **只在敲下词尾空白（空格 / 回车）那一下动手**，也就是只改**刚打完的
    ///    那个词**。既不回头改已有文本，也不改正在输入中、还没定型的词
    ///    （`teh` 打到 `te` 时不能动手，那时用户可能想打 `tell`）。
    /// 3. **必须能撤销**：走的是 `inputRules`，`Ctrl+Z` 一步就能退回原文
    ///    （`prosemirror-inputrules` 会把被替换掉的原文本记在插件状态里）。
    ///    这是"猜错了"的代价上限——一次撤销，不是一次数据损毁。
    ///
    /// ⚠️ **默认开**：理由与同组的 `smart_quotes` / `smart_dashes` 一致——
    /// 它只作用于刚敲的那几个字符，不动已有字节，且撤销一步就回去了。
    pub auto_correct: bool,

    // ── 代码块 ──────────────────────────────────────────────────────────
    // ⚠️⚠️ **这一组的字段全都只作用于所见即所得里的代码块外观**，落地方式是
    // `<html>` 上的 `data-code-*` 属性 + CSS，由 `ui/useCodeBlockPrefs.ts` 写。
    // 三个理由：① 拨开关**不重建编辑器**（重建会丢撤销栈和光标，而这几条是
    // "开着代码块边看边调"的东西）；② 一份 .md 走到别的编辑器里不该因为
    // "Nota 里开着行号"而变样——这些是**本机偏好**，不是文档属性；
    // ③ 导出/打印走的是 Markdown 序列化（`editor/export.ts`），不经过这层 DOM，
    // 所以它们**不影响导出结果**。
    //
    // ⚠️ **`code_line_numbers` 与 `code_wrap` 从 2026-09-22 就写在这里了，
    // 但到 2026-09-26 之前一直是空壳**：界面上有开关、后端有字段、TOML 里存得住，
    // **全仓没有一个消费者**——点了什么都不会发生。用户 2026-09-26 说的原话是
    // 「你在设置中加允许代码行号等内容」，也就是他以为还没有这两条。
    // 📌 教训：一个设置项"存在"不等于"生效"，`docs/07` 那本账要按**消费者**记，
    // 不能按字段记。
    /// 显示行号。
    pub code_line_numbers: bool,
    /// 代码块自动换行。
    ///
    /// ⚠️ 关掉它会让长行横向滚动，而 `pre` 必须有 `overflow-x: auto` 才滚得起来
    /// ——那会**裁掉画在块左外侧的围栏标记**（`.nota-srcmark`，只在「显示当前块的
    /// Markdown 源码」开着时可见）。两件事在那个组合下不能同时成立，取舍写在
    /// `editor.css` 代码块那一段。
    pub code_wrap: bool,
    /// 显示代码块**下面**那条工具栏（折叠 / 复制）。
    ///
    /// ⚠️ 与下面那条是**两个**开关，不合并：只想要其中一个的人两种都有。
    /// 两条都关掉之后代码块里外一件挂件都不剩。
    /// ⚠️ 2026-09-26 新增（用户：「你在设置中加允许代码行号**等内容**」）。
    pub code_toolbar: bool,
    /// 显示代码块**下面**那颗语言选择框（与工具栏同一行，它在右、工具栏在左）。
    ///
    /// ⚠️ 关掉**不等于改不了语言**：语言仍是节点属性，源码模式里改围栏上那串字
    /// 一样生效（所见即所得那侧 `code-block.ts` 的 `syncChrome` 会把闭合状态
    /// 跟过去）。
    pub code_language_picker: bool,
    /// 用 Shift+Tab 自动调整所选代码的缩进。
    pub code_shift_tab_indent: bool,
    /// 代码缩进宽度。
    /// ⚠️ 与「编辑器」页的 `default_indent` 是**两回事**：合并成一个字段，
    /// 改列表缩进就会顺手改掉代码块缩进。
    pub code_indent: u32,
    /// 默认的代码块语言（空串 = 不写）。
    pub code_default_language: String,
    /// 什么时候自动加语言。
    pub code_auto_language: AutoLanguage,

    // ── 公式 ────────────────────────────────────────────────────────────
    /// 认 `\( \)` / `\[ \]` 这对定界符。⚠️ `$…$` 由 `inline_math` 管。
    pub latex_delimiters: bool,
    /// 认 ```` ```math ```` 代码块当公式。
    pub code_block_math: bool,
    /// 用旧版的行内公式解析（兼容模式）。
    /// ⚠️ 默认关：旧解析在 `$` 和数字挨着时（`$5 和 $6`）容易误判，
    /// 打开是为了兼容老文档里的写法。
    pub legacy_inline_math: bool,
    /// 公式自动编号。
    pub equation_numbering: EquationNumbering,
    /// 复制或导出为无格式 HTML 时，公式给 SVG 还是 MathML。
    pub math_output: MathOutput,

    // ── 空格与换行 ──────────────────────────────────────────────────────
    /// 首行缩进。
    pub first_line_indent: bool,
    /// 编辑时显示 `<br/>`。
    pub show_br: bool,
    /// 编辑时的空格处理。
    pub whitespace_editing: WhitespaceMode,
    /// 导出与打印时的空格处理。
    pub whitespace_export: WhitespaceMode,
}

impl Default for Markdown {
    fn default() -> Self {
        Self {
            heading_style: HeadingStyle::default(),
            bullet_mark: BulletMark::default(),
            ordered_mark: OrderedMark::default(),

            // ⚠️ 这一组**全部默认开**。它们是"Markdown 的方言"，默认关掉会让
            // 用户觉得"这编辑器怎么不认我写的公式 / 下标"，而要关的人自己会去关。
            autolink: true,
            inline_math: true,
            subscript: true,
            superscript: true,
            highlight: true,
            github_alerts: true,
            diagrams: true,

            smart_punctuation: SmartPunctuation::default(),
            smart_quotes: true,
            smart_quotes_double: QuoteStyle::default(),
            smart_quotes_single: QuoteStyle::default(),
            smart_dashes: true,
            dash_style: DashStyle::default(),
            // ⚠️ 默认关。⚠️ 本项**尚未接线**：全仓没有解析器读它（只有设置字段与
            // 界面上那个开关），因此"打开后会发生什么"目前没有可观察的结论，
            // 此处不作行为断言。接线之后再把默认值的理由补在这里。
            unicode_punctuation: false,

            // ⚠️ 默认开，理由见字段上那段注释（只改刚打完的那一个词，且可撤销）。
            auto_correct: true,

            // ⚠️ **默认关**（2026-09-26 从 `true` 改下来的，同一天这两条才真的
            // 接上线）。理由：行号会让每个代码块左边多出 40px 的装订线（代码文字
            // 整体右移、正文列看着变窄），而它在三五行的小代码块上是纯噪音。
            // 用户 2026-09-26 那句「代码块有点宽」正是在意块内的占位——
            // 那种偏好下把行号默认打开是拧着的。
            // 📌 这一次改默认值是安全的：**还没发过版**，没有老设置文件需要照顾。
            code_line_numbers: false,
            code_wrap: true,
            code_toolbar: true,
            code_language_picker: true,
            code_shift_tab_indent: false,
            code_indent: 4,
            code_default_language: String::new(),
            code_auto_language: AutoLanguage::default(),

            latex_delimiters: true,
            code_block_math: true,
            legacy_inline_math: false,
            equation_numbering: EquationNumbering::default(),
            math_output: MathOutput::default(),

            first_line_indent: false,
            show_br: true,
            whitespace_editing: WhitespaceMode::default(),
            whitespace_export: WhitespaceMode::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 符号类取值落盘用名字而不是裸符号() {
        assert_eq!(BulletMark::default().符号(), '-');
        assert_eq!(BulletMark::Star.符号(), '*');
        assert_eq!(OrderedMark::Dot.前缀(3), "3. ");
        assert_eq!(OrderedMark::Paren.前缀(3), "3) ");

        let m = Markdown {
            bullet_mark: BulletMark::Plus,
            ordered_mark: OrderedMark::Paren,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&m).unwrap();
        assert!(text.contains(r#"bullet_mark = "plus""#), "实际是：\n{text}");
        assert!(text.contains(r#"ordered_mark = "paren""#), "实际是：\n{text}");
    }

    #[test]
    fn 智能标点默认是输入时转换并且能三档往返() {
        // ⚠️ 默认值取「输入时转换」。**但它的语义是"只改刚敲进去的
        // 那一下"**——见 `SmartPunctuation` 上的长注释。改了默认值就等于改了
        // 用户打字的体感，所以只在这一处定义。
        assert_eq!(SmartPunctuation::default(), SmartPunctuation::Input);

        for (v, s) in [
            (SmartPunctuation::Off, "off"),
            (SmartPunctuation::Render, "render"),
            (SmartPunctuation::Input, "input"),
        ] {
            let m = Markdown {
                smart_punctuation: v,
                ..Default::default()
            };
            let text = toml::to_string_pretty(&m).unwrap();
            assert!(
                text.contains(&format!(r#"smart_punctuation = "{s}""#)),
                "实际是：\n{text}"
            );
            let back: Markdown = toml::from_str(&text).unwrap();
            assert_eq!(back.smart_punctuation, v);
        }
    }

    #[test]
    fn 两个缩进值得分开且默认不同() {
        // 「编辑器」页那个是 2（列表缩进的宽度），这个是 4（代码块的）。
        // 合成一个字段的话，改列表缩进会顺手改掉代码块缩进。
        let m = Markdown::default();
        assert_eq!(m.code_indent, 4);
        assert_eq!(crate::settings::Editor::default().default_indent, 2);
    }

    #[test]
    fn 默认值逐项符合预期() {
        // ⚠️ 这条逐个盯默认值。写错一个的症状是"老用户升级后发现
        // 自己的偏好转了"，而他的设置文件里根本没有这一项。
        let m = Markdown::default();
        // 扩展语法：七项全开。
        assert!(m.autolink && m.inline_math && m.subscript && m.superscript);
        assert!(m.highlight && m.github_alerts && m.diagrams);
        // 智能标点：引号和破折号开，Unicode 标点关。
        assert!(m.smart_quotes && m.smart_dashes);
        assert!(!m.unicode_punctuation);
        // 自动更正：开（2026-09-27 新加的一格）。
        assert!(m.auto_correct);
        // 代码块：行号关、自动换行开、两条挂件开、Shift+Tab 关。
        // ⚠️ 行号那条是 2026-09-26 从 `true` 改下来的（理由在 `Default` 那段）。
        assert!(!m.code_line_numbers);
        assert!(m.code_wrap);
        assert!(m.code_toolbar && m.code_language_picker);
        assert!(!m.code_shift_tab_indent);
        assert_eq!(m.code_default_language, "");
        // 公式：三条开，physics 在顶层且默认关，兼容模式和编号关。
        assert!(m.latex_delimiters && m.code_block_math);
        assert!(!m.legacy_inline_math);
        assert_eq!(m.equation_numbering, EquationNumbering::None);
        // 空格与换行：首行缩进关，显示 <br/> 开。
        assert!(!m.first_line_indent && m.show_br);
    }

    #[test]
    fn 缺项的_markdown_表能补出默认() {
        let back: Markdown = toml::from_str("highlight = false\n").unwrap();
        assert!(!back.highlight);
        assert!(back.subscript, "没写的项要补出默认（开）");
        assert_eq!(back.code_indent, 4);
    }
}
