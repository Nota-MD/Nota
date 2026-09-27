//! 「编辑器」那一页的设置。
//!
//! 本文件装 `[editor]` 表下的字段：缩进与对齐 / **段首缩进** / 括号与 Markdown
//! 的自动配对 / Emoji 补全 / 显示当前块源码 / 复制行为 / 换行符 / 拼写检查 /
//! 打字机模式。
//!
//! ⚠️ 这里头**有两族"缩进"**，别混：「默认缩进 / 对齐缩进」管**写进文件**的空格
//! （列表 / 引用 / 缩进块），「段首缩进」只管**看起来**缩了几格、**不写文件**。
//!
//! ⚠️ 这一页里**没有** 外观那一页的「字体大小 / 缩放」——那两条是外壳的，
//! 归 `settings/appearance.rs`。两个字段在界面上挨得近，不代表归同一页。
//!
//! ⚠️ 「拼写检查」只存一个**开关**，没有"选语言"这回事：Nota 的编辑区是
//! Milkdown/ProseMirror，**浏览器内核的拼写检查**由 WebKitGTK 提供，语言跟系统走。
//! 实现范围记在 `docs/10-feature-matrix.md` §11.2。

use serde::{Deserialize, Serialize};

/// 新文件的默认换行符。
///
/// ⚠️ 这是**新文件**的事。已经存在的文件**照它自己原来的换行符写回**——
/// 不能因为用户在这儿选了 CRLF，就把一个 LF 的老文件整体改成 CRLF：
/// 那是**改用户字节**，而且是全文件级的 diff 噪音。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LineEnding {
    /// Unix 风格 `\n`。**默认**。
    Lf,
    /// Windows 风格 `\r\n`。
    Crlf,
}

impl Default for LineEnding {
    fn default() -> Self {
        LineEnding::Lf
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Editor {
    /// 默认缩进宽度（空格数）。
    ///
    /// ⚠️ 与 **Markdown 那一页**的「代码缩进」是两回事：这一条管列表 / 引用 /
    /// 缩进块自动生成的缩进（界面上那一格右边的小预览框演示的正是它），
    /// 那一条管代码块里的缩进。两处分开放，是因为两者的合适取值不同。
    pub default_indent: u32,
    /// 「对齐缩进」：让子项的文字与父项首行对齐，而不是固定宽度缩进。
    pub align_indent: bool,
    /// **段首缩进**：正文段落的第一行空出来（用户 2026-09-27 要求）。
    ///
    /// ⚠️⚠️ 它是**显示层**的一件事，**一个空格都不往文件里写**。中文排版里
    /// 「段首空两格」是排版属性，不是内容：真往 Markdown 里塞两个空格，那
    /// ①在源码模式和别的编辑器里是可见的脏字符、②`  - ` 开头还会改变行的
    /// 含义、③用户关掉这个开关之后得逐段删。所以它落在 CSS（`text-indent`）
    /// 上，和「正文宽度」是同一类东西。
    ///
    /// ⚠️ 与上面那条 `default_indent` **不是一件事**：那条管"敲回车/敲 Tab 时
    /// 自动插几个空格"（会写进文件，管列表 / 引用 / 缩进块），这条只管
    /// **看起来**缩了几个字符（不写文件，管正文段落）。界面上挨着，语义不相干。
    pub paragraph_indent: bool,
    /// 段首缩进的宽度，单位是**字符**（中文里就是几个汉字宽）。
    ///
    /// ⚠️ 汉字宽不是像素：`text-indent: 2em` 取的是当前字体的 em，正文换成
    /// 别的字号/字体时缩进跟着变，这正是「几个字符宽」该有的行为。
    /// 实际生效值夹在 **1..=8**（`ui/settings/panes/EditorPane.tsx` 那格同区间）。
    pub paragraph_indent_chars: u32,
    /// 匹配括号和引号（输入 `(` 自动补 `)` 之类）。
    pub match_brackets: bool,
    /// 匹配 Markdown 字符（输入 `**` 自动补 `**`）。
    pub match_markdown: bool,
    /// 开启 Emoji 自动补全（`:sm` → 候选面板）。
    pub emoji_autocomplete: bool,
    /// 显示当前块元素的 Markdown 源码（支持标题等块元素）。
    /// 相当于即时渲染的反向开关：勾上后光标所在块会露出 `##` 这类标记。
    pub show_block_source: bool,
    /// 复制纯文本时，复制的是 Markdown 源码而不是渲染后的文字。
    pub copy_markdown_source: bool,
    /// 复制 / 剪切时若没有选中文字，就整行复制 / 剪切。
    pub copy_line_when_empty: bool,
    /// 新文件的默认换行符。
    pub line_ending: LineEnding,
    /// 拼写检查开关。⚠️ 语言跟随系统，不可选，因此本项只有一个开关而不是语言下拉。
    pub spellcheck: bool,
    /// 打字机模式下让光标始终停在屏幕中间。
    pub typewriter_keep_caret_centered: bool,
}

impl Default for Editor {
    fn default() -> Self {
        Self {
            // 列表 / 引用的自动缩进，2 格。
            default_indent: 2,
            align_indent: false,
            // ⚠️ 段首缩进**默认关**：这是新加的一项，默认打开等于替所有人改
            // 了排版（中文习惯是缩进两格，但 Markdown 写作的人多半已经习惯了
            // 顶格，而且导出/别处都不跟这一条）。宽度先给中文惯例的 2。
            paragraph_indent: false,
            paragraph_indent_chars: 2,
            // 这一对默认值是有意取反的：匹配括号和引号**开**，匹配 Markdown 字符**关**。
            // ⚠️ 「匹配括号」是几乎所有人都想要的，
            // 而自动补出 `**` 会在想打粗体时先多出两个星号，所以默认关。
            match_brackets: true,
            match_markdown: false,
            emoji_autocomplete: true,
            show_block_source: false,
            copy_markdown_source: true,
            copy_line_when_empty: false,
            line_ending: LineEnding::default(),
            spellcheck: true,
            typewriter_keep_caret_centered: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 两个缩进不是同一个东西() {
        // ⚠️ 这一条盯的是**两个"缩进"不能被并成一个字段**。
        // 编辑器的默认缩进是 2，代码块的缩进是 4
        // （在 `settings/markdown.rs`）。合并了的话，改列表缩进会顺手改掉
        // 代码块缩进——那是两个互不相干的偏好。
        assert_eq!(Editor::default().default_indent, 2);
        assert_eq!(crate::settings::markdown::Markdown::default().code_indent, 4);
    }

    #[test]
    fn 段首缩进默认关_宽度默认两格() {
        let e = Editor::default();
        assert!(!e.paragraph_indent);
        assert_eq!(e.paragraph_indent_chars, 2);
    }

    #[test]
    fn 两条缩进是两个字段() {
        // ⚠️ 这一条盯的是一个**巧合**：`default_indent` 与
        // `paragraph_indent_chars` 的默认值都是 2。两者被谁写串了、
        // 或者被并成一个字段，光看默认值**看不出来**——所以这里把两个数
        // 设成**不一样**的值再落盘，两行都得在。
        let e = Editor {
            default_indent: 3,
            paragraph_indent_chars: 6,
            ..Default::default()
        };
        let t = toml::to_string_pretty(&e).unwrap();
        assert!(t.contains("default_indent = 3"), "实际是：\n{t}");
        assert!(t.contains("paragraph_indent_chars = 6"), "实际是：\n{t}");
    }

    #[test]
    fn 老设置文件缺这两个键能补出默认() {
        // 老 `settings.toml` 的 `[editor]` 表里没有这两项，读进来不许报错。
        let back: Editor = toml::from_str("align_indent = true\n").unwrap();
        assert!(back.align_indent);
        assert!(!back.paragraph_indent);
        assert_eq!(back.paragraph_indent_chars, 2);
    }

    #[test]
    fn 默认换行符是_lf_且落盘是_kebab() {
        assert_eq!(LineEnding::default(), LineEnding::Lf);
        let e = Editor {
            line_ending: LineEnding::Crlf,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&e).unwrap();
        assert!(text.contains(r#"line_ending = "crlf""#), "实际是：\n{text}");
    }

    #[test]
    fn 缺项的_editor_表能补出默认() {
        let back: Editor = toml::from_str("emoji_autocomplete = false\n").unwrap();
        assert!(!back.emoji_autocomplete);
        assert_eq!(back.default_indent, 2);
    }
}
