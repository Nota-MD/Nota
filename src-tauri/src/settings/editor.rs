//! 「编辑器」那一页的设置。
//!
//! 本文件装 `[editor]` 表下的字段：缩进与对齐 / **段首缩进** / **智能符号补全** /
//! Emoji 补全 / 显示当前块源码 / 复制行为 / 换行符 / 拼写检查 / 打字机模式。
//!
//! ⚠️ 这里头**有两族"缩进"**，别混：「默认缩进 / 对齐缩进」管**写进文件**的空格
//! （列表 / 引用 / 缩进块），「段首缩进」只管**看起来**缩了几格、**不写文件**。
//!
//! ⚠️ 这一页里**没有** 外观那一页的「字体大小 / 缩放」——那两条是外壳的，
//! 归 `settings/appearance.rs`。两个字段在界面上挨得近，不代表归同一页。
//!
//! ⚠️ 「拼写检查」是**一对**：开关（`spellcheck`）＋ 语言（`spellcheck_lang`，2026-10-10）。
//! Nota 的编辑区是 Milkdown/ProseMirror，**浏览器内核的拼写检查**由 WebKitGTK
//! 提供，所以这两格都不是 Nota 自己实现的——它们要落到内核的两个地方上
//! （语言列表 / 元素的语言），接线在 `commands/webview.rs` 与 `ui/useSpellcheck.ts`。
//! 实现范围与"验到哪一步"记在 `docs/10-feature-matrix.md` §11.2。

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
    /// **智能符号补全**：打一颗符号，当场把配对的另一半补上。
    ///
    /// 用户 2026-09-28 原话：「自动补全 `*`、`[` 这种在设置中**搞一个选项**，
    /// **智能符号补全**。**默认为开**。」
    ///
    /// ⚠️ **它管的是编辑器里那一条插件**（`src/editor/auto-pair.ts`，
    /// 由 `ui/EditorPane.tsx` 传进 `createEditor`）：括号与引号那一族
    /// （`(` `{` `（【「『《〈` 与 **`[`**）、**`*` 自配对**、`Tab` 跳出右半边、
    /// 夹在一对空括号里按退格两颗一起删。**关掉它是"这条插件不装"**，
    /// 不是"补得少一点"——四件事一起走，因为它们互相咬着（`Tab` 跳的那颗闭
    /// 括号正是补出来的那一颗）。
    ///
    /// ⚠️⚠️ **它取代了原来的两条死开关 `match_brackets` / `match_markdown`**
    /// （2026-09-28 删）：那两条**存了值，从来没有任何代码读过**——界面上摆着
    /// 两颗能拨的开关、拨了什么都不发生，比没有那两颗更坏。用户这次要的是
    /// **一个**选项，而它们本来就是一件事的两半（用户原话里 `*` 与 `[` 是并列
    /// 举的两个例子）。⚠️ 老设置文件里那两行**留着也不报错**（`#[serde(default)]`
    /// 只认自己认识的键，多余的键被忽略），下次保存时它们自然消失。
    pub smart_symbols: bool,
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
    /// 拼写检查开关。
    pub spellcheck: bool,
    /// **拼写检查用哪种语言**（2026-10-10 用户要的："拼写检查允许设置不同语言"）。
    ///
    /// 写法是 **enchant 那套 `语言_地区`**（`zh_CN` / `en_US` / `ja_JP`…，
    /// **下划线，不是 BCP-47 的连字符**）——`lang_COUNTRY` 正是 WebKitGTK 那个
    /// `spell-checking-languages` 接口要的形式（`commands/webview.rs` 的注释里有
    /// 出处）。写成连字符的 `zh-CN` 找不到词典，而症状是**静默不检查**。
    ///
    /// ⚠️ **空串 = 跟随系统**（出厂值），而且这个"空"是**有含义的一手**、不是省事：
    /// 语言列表为空时 WebKit 会自己去拿系统的默认语言，取不到才退到"装着的第一个
    /// 词典"。所以"跟随系统"不是"什么都不做"，是**把选择权交回给内核**
    /// （`Source/WebCore/platform/text/enchant/TextCheckerEnchant.cpp` 里那个
    /// `languages.isEmpty()` 那一支）。
    ///
    /// ⚠️⚠️ **它不保证画得出红线**：真词典得机器上装过（enchant / hunspell），
    /// Nota 一个词典字节都不带（见 `THIRD-PARTY.md` §7 那条链子）。而"装了词典"
    /// 与"这个语言有词典"是两件事——选了一个没装词典的语言，WebKit 会**一个词典
    /// 都不加载**，于是那个语言下**干脆不划红线**（不是"设置没生效"）。
    /// 前端拿"设完之后读回来的词典列表是不是空的"把这件事说出来（见
    /// `ui/useSpellcheck.ts`）。
    pub spellcheck_lang: String,
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
            // ⚠️ **默认开**（用户 2026-09-28 点名：「默认为开」）。这一条与它
            // 取代的那两条不同（那时是"括号开、Markdown 字符关"）：用户要的是
            // **一个**开关，而 `*` 自配对在 2026-09-28 已经补上了三条"不补"
            // 的判据（段首 / 有选区 / 代码与转义），当年"默认关"的那条理由
            //（"想打粗体时先多出两颗星"）已经不成立了。
            smart_symbols: true,
            emoji_autocomplete: true,
            show_block_source: false,
            copy_markdown_source: true,
            copy_line_when_empty: false,
            line_ending: LineEnding::default(),
            spellcheck: true,
            // ⚠️ 出厂**跟随系统**（空串）：给一个具体语言等于替所有人改了语言，
            // 而绝大多数人是单语的，系统语言就是他要的那个。
            spellcheck_lang: String::new(),
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

    /// ⚠️ 拼写检查**语言**这一格（2026-10-10 加）。
    ///
    /// 三条要一起钉住，因为这一格有三种"空"的含义会被写串：
    /// **出厂是空串**（＝跟随系统）、**空串要能落盘再读回来还是一样的空串**
    /// （不能读成某个默认语言）、**老设置文件里没有这一行也不该报错**。
    #[test]
    fn 拼写语言出厂是空串_也就是跟随系统() {
        assert_eq!(Editor::default().spellcheck_lang, "");
        // ⚠️ 空串必须**原样**活过一个来回：读成 `zh-CN` 之类就等于替用户选了语言，
        // 而它在界面上会显示成一个他从没选过的下拉项（本仓最忌讳的那种假状态）。
        let e = Editor::default();
        let t = toml::to_string_pretty(&e).unwrap();
        let back: Editor = toml::from_str(&t).unwrap();
        assert_eq!(back.spellcheck_lang, "");
        assert!(t.contains(r#"spellcheck_lang = """#), "实际是：\n{t}");
    }

    #[test]
    fn 拼写语言能落盘且老的_editor_表读得进来() {
        let e = Editor {
            spellcheck_lang: "zh_CN".to_string(),
            ..Default::default()
        };
        let t = toml::to_string_pretty(&e).unwrap();
        assert!(t.contains(r#"spellcheck_lang = "zh_CN""#), "实际是：\n{t}");
        assert_eq!(toml::from_str::<Editor>(&t).unwrap().spellcheck_lang, "zh_CN");
        // 老文件里没有这一行：
        let 老: Editor = toml::from_str("spellcheck = false\n").unwrap();
        assert!(!老.spellcheck);
        assert_eq!(老.spellcheck_lang, "");
    }

    /// ⚠️ **老设置文件里那两条死开关不该让整个设置读不出来**（2026-09-28）。
    ///
    /// `match_brackets` / `match_markdown` 已经被 `smart_symbols` 取代，
    /// 而用户 `settings.toml` 里很可能还写着它们（那两条曾经在界面上摆着）。
    /// `#[serde(default)]` 只认自己认识的键、多余的键**忽略**——这一条用例
    /// 就是钉住这个行为：**不许有人后来加上 `deny_unknown_fields`**，
    /// 那会让升级后的第一次启动直接掉进"设置读不出来"的兜底里。
    #[test]
    fn 老的两条配对开关留在文件里也不报错() {
        let back: Editor =
            toml::from_str("match_brackets = false\nmatch_markdown = true\n").unwrap();
        assert!(back.smart_symbols, "缺项时该取默认（开）");
    }
}
