//! 「文档主题」那一页的**可调项**：正文的行距 / 段距 / 字体 / 字号
//! （`docs/10-feature-matrix.md` §4 那两格，2026-09-27）。
//!
//! # ⚠️ 表叫 `[document]`，而界面上的那一页叫「文档主题」
//!
//! 名字差一点是有意的：顶层那个老字段 `document_theme` 回答的是"**用哪一套**
//! 主题"，而这一张表回答的是"那套主题给的默认值里，**哪几项我不听它的**"。
//! 叫 `[doc_theme]` 会让人以为它是 `document_theme` 的另一种写法。
//!
//! # 这四项**不是**第四条外观轴
//!
//! `settings/mod.rs` 顶上那三条轴（界面风格 / 明暗 / 文档主题）之间的边界
//! 是"谁管哪一块"。这四项**一个像素都不出编辑区**，它们只是**文档主题的覆盖值**：
//! 主题给一套默认（`--font-doc` / `--doc-font-size` / `--doc-line-height`），
//! 这里可以逐项盖掉其中四个。所以它们落在**文档主题那一页**，与 `ui_style`
//! 那三条轴不冲突（`docs/04` §外观）。
//!
//! # ⚠️ 为什么每一项都是「开关 ＋ 值」两个字段
//!
//! 因为**默认必须是"跟随主题"**——三套内置主题的行距分别是 1.9 / 1.75 / 1.68
//! （`src/styles/themes/*.css`）。给一个写死的默认数（比如 1.75），就等于
//! 用户什么都没动、主题之间的差异却被抹平了：选「极简」和选「Adwaita」看起来
//! 一样。所以"算不算数"必须是一个**独立的**事实，不能拿 0 之类当哨兵
//! ——段距取 0（段落挨着）是一个**正当的**取值，跟"跟随主题"撞在同一个数上。
//!
//! 这与 `[editor]` 的「段首缩进」（`paragraph_indent` ＋ `paragraph_indent_chars`）
//! 和 `[appearance]` 的「字体大小」（`custom_font_size` ＋ `ui_font_size`）
//! 是**同一个姿势**，别另发明一种。
//!
//! # ⚠️ 这一页的东西**一个字节都不写进文档**
//!
//! 全是显示层排版（同 `[editor]` 的段首缩进）：行距、段距、字体、字号改的是
//! `editor-mount` 上的 CSS 变量，Markdown 源码原样不动——源码模式、别的编辑器、
//! 导出拿到的都还是原来那些字。这是**用户 2026-09-24 定的口径**（「如果关闭，
//! 存盘不要自动修复」）的自然延伸。
//!
//! # 覆盖是怎么落地（以及为什么不能走 `applyTheme.ts` 的内联那一路）
//!
//! 四个值由 `src/styles/doc-typography.ts` 算成 CSS 变量，写在 `.editor-pane`
//! 那一层的**内联 style** 上（`ui/EditorPane.tsx`）。⚠️ **必须写在那一层**：
//! 文档主题是限域到 `.editor-pane` 的一段 CSS（`styles/doc-theme.ts`），
//! 主题里的 `:root { --font-doc: … }` 会被改写成 `.editor-pane { --font-doc: … }`
//! ——也就是**声明在 `.editor-pane` 自己身上**。而 `applyTheme.ts` 那一路把变量
//! 写在 `<html>` 上，靠继承往下传，**继承永远输给声明**：选一套主题之后，
//! 用户在设置里改的行距会被主题静默盖掉（"拨了不生效"）。写在同一个元素上的
//! 内联样式优先级高于任何选择器，才是真的"用户显式盖过主题"。
//! ⚠️ 这也是 `--content-width` 走同一条路的理由（`ui/EditorPane.tsx` 那句
//! `style={{ ["--content-width"]: … }}`）。

use serde::{Deserialize, Serialize};

/// 正文字体的档位（**只给三档，不给任意字体栈**）。
///
/// ⚠️ 为什么不给一个"填 CSS 字体栈"的输入框：字体栈写错了（名字拼错、
/// 少了通用族兜底）**浏览器不会报错**，只会静默往回落——用户看到的是
/// "我明明设了宋体，怎么还是黑体"，而这一页上写着宋体。三档是我们自己配的栈，
/// 每一档都带通用族兜底（`sans-serif` / `serif` / `monospace`），不会静默落空。
///
/// ⚠️ 「跟随主题」**不在这里**——那是 `custom_font` 那个开关的事。这个枚举
/// 的默认值只在开关打开前占个位，**没有任何含义**（同 `line_height` 那几个数）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DocFont {
    /// 无衬线（**默认**，与内置的 Adwaita 主题同族）。
    Sans,
    /// 衬线（与内置的「极简」「LaTeX」同族）。
    Serif,
    /// 等宽。⚠️ 这一档交给**外壳的代码字体**（`--font-mono`），
    /// 所以正文和代码块里是同一个字体——那是选等宽正文的人想要的。
    Mono,
}

impl Default for DocFont {
    fn default() -> Self {
        DocFont::Sans
    }
}

/// 「文档主题」那一页的四个可调项。见文件头。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Document {
    /// 行距：是否覆盖文档主题。**默认关**（跟随主题）。
    pub custom_line_height: bool,
    /// 行距，**百分比**（175 = 1.75 倍）。
    ///
    /// ⚠️ 存整数百分比而不是小数：TOML 里 `1.75` 是浮点，而这一仓的设置全是
    /// 整数（`zoom`、`ui_font_size`、`content_width` 都是）。混进一个浮点会让
    /// 设置页那个 `NumberInput` 也要跟着改一套（步长、显示几位）。
    /// 实际生效值夹在 **100..=300**（`ui/settings/panes/DocThemePane.tsx` 那格同区间）。
    pub line_height: u32,
    /// 段落间距：是否覆盖文档主题。**默认关**。
    pub custom_paragraph_gap: bool,
    /// 段落间距，单位是**百分之一 em**（85 = 0.85em）。
    ///
    /// ⚠️ 用 `em` 不用 `px`：段距是"隔开一段的距离"，正文换字号时它该跟着变
    /// （与「段首缩进」同一条理由）。
    /// 实际生效值夹在 **0..=300**（`0` 是正当取值：段落之间不留空）。
    pub paragraph_gap: u32,
    /// 正文字体：是否覆盖文档主题。**默认关**。
    pub custom_font: bool,
    /// 正文字体的档位。⚠️ 只在 `custom_font` 打开时算数。
    pub font: DocFont,
    /// 正文字号：是否覆盖文档主题。**默认关**。
    pub custom_font_size: bool,
    /// 正文字号，**相对界面字号**的百分比（102 = 1.02 倍）。
    ///
    /// ⚠️ 它是 `em`（相对父层），不是 `px`：文档主题给的就是 `1.02em`
    /// （`src/styles/themes/*.css`），用户在「外观」页调大界面字号时正文跟着
    /// 变大——那是既有的行为，这里不改变它，只让它可以被覆盖。
    /// 实际生效值夹在 **80..=200**。
    pub font_size: u32,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            // ⚠️ 四项**默认全关**：这是 2026-09-27 新加的一页，打开就等于替所有人
            // 改了排版（同一页的「段首缩进」也是这个理由）。
            custom_line_height: false,
            // ⚠️ 下面这三个数（175 / 85 / 102）**必须与 `editor.css` 里那三个
            // 兜底值一致**（`var(--doc-line-height, 1.75)` / `var(--doc-para-gap, 0.85em)`
            // / `var(--doc-font-size, 1.02em)`），也就是"无文档主题"时的中性值：
            // 用户一打开开关、还没动那个数，看到的东西**不该变**。
            // 三处（本文件、`DocThemePane.tsx`、`editor.css`）一起改。
            line_height: 175,
            custom_paragraph_gap: false,
            paragraph_gap: 85,
            custom_font: false,
            font: DocFont::default(),
            custom_font_size: false,
            font_size: 102,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 四项默认都跟随主题() {
        let d = Document::default();
        assert!(!d.custom_line_height);
        assert!(!d.custom_paragraph_gap);
        assert!(!d.custom_font);
        assert!(!d.custom_font_size);
    }

    /// ⚠️ 这一条盯的是"打开开关、什么都还没动，排版就变了"。
    ///
    /// 那三个数是**别处**（`src/styles/editor.css` 的兜底值）的一份副本，
    /// 编译器管不着它们对不对——所以在这里钉住，改动时至少有一条测试会红。
    #[test]
    fn 默认值等于无主题时的兜底值() {
        let d = Document::default();
        assert_eq!(d.line_height, 175, "对 `--doc-line-height` 的兜底 1.75");
        assert_eq!(d.paragraph_gap, 85, "对 `--doc-para-gap` 的兜底 0.85em");
        assert_eq!(d.font_size, 102, "对 `--doc-font-size` 的兜底 1.02em");
    }

    #[test]
    fn 老设置文件缺整张表能补出默认() {
        // 2026-09-26 及以前的 `settings.toml` 里没有 `[document]` 这一段。
        let back: Document = toml::from_str("").unwrap();
        assert_eq!(back, Document::default());
    }

    #[test]
    fn 四项互不串且落盘是_kebab() {
        // ⚠️ 把四个数/档设成**各不相同的**值再落盘：串了谁（比如两个 bool 共用一个
        // 字段、或者 font 被写成 font_size）光看默认值看不出来——默认值里
        // 两个 `custom_*` 都是 false、两个数都是三位数。
        let d = Document {
            custom_line_height: true,
            line_height: 210,
            custom_font: true,
            font: DocFont::Mono,
            ..Default::default()
        };
        let t = toml::to_string_pretty(&d).unwrap();
        assert!(t.contains("custom_line_height = true"), "实际是：\n{t}");
        assert!(t.contains("line_height = 210"), "实际是：\n{t}");
        assert!(t.contains(r#"font = "mono""#), "实际是：\n{t}");
        // 没动过的两项照旧是关的。
        assert!(t.contains("custom_paragraph_gap = false"), "实际是：\n{t}");
        assert!(t.contains("custom_font_size = false"), "实际是：\n{t}");
        assert!(t.contains("paragraph_gap = 85"), "实际是：\n{t}");
        assert!(t.contains("font_size = 102"), "实际是：\n{t}");
    }

    #[test]
    fn 三档字体都能往返且默认是无衬线() {
        assert_eq!(DocFont::default(), DocFont::Sans);
        for (档, 文本) in [
            (DocFont::Sans, r#"font = "sans""#),
            (DocFont::Serif, r#"font = "serif""#),
            (DocFont::Mono, r#"font = "mono""#),
        ] {
            let d = Document {
                font: 档,
                ..Default::default()
            };
            let t = toml::to_string_pretty(&d).unwrap();
            assert!(t.contains(文本), "{档:?} 落盘不对，实际是：\n{t}");
            let back: Document = toml::from_str(&t).unwrap();
            assert_eq!(back.font, 档);
        }
    }

    /// ⚠️ 认不出的档位**要让整份设置读不进来**吗？——不。这里其实测不了
    /// "不报错"（枚举的 `serde` 默认就是报错），所以这条钉的是**当前的口径**：
    /// `font` 写了一个我们不认识的值时，`toml::from_str` **会报错**，
    /// 而 `Settings::load_from` 会把原文件留一份 `.bak` 再退回默认
    /// （`settings/mod.rs` 里那段）。**这是有意的**：与前两条轴不同，
    /// 这一项没有"用户从别处拷来的配置"那种场景，拼错就是拼错。
    #[test]
    fn 认不出的字体档位会报错_而不是静默落默认() {
        let r: Result<Document, _> = toml::from_str(r#"font = "comic""#);
        assert!(r.is_err(), "拼错的档位要报错，不能静默落回无衬线");
    }
}
