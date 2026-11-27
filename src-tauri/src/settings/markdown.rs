use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HeadingStyle {
    Atx,

    Setext,
}

impl Default for HeadingStyle {
    fn default() -> Self {
        HeadingStyle::Atx
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BulletMark {
    Dash,

    Star,

    Plus,
}

impl Default for BulletMark {
    fn default() -> Self {
        BulletMark::Dash
    }
}

impl BulletMark {
    pub fn symbol(self) -> char {
        match self {
            BulletMark::Dash => '-',
            BulletMark::Star => '*',
            BulletMark::Plus => '+',
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OrderedMark {
    Dot,

    Paren,
}

impl Default for OrderedMark {
    fn default() -> Self {
        OrderedMark::Dot
    }
}

impl OrderedMark {
    pub fn prefix(self, n: usize) -> String {
        match self {
            OrderedMark::Dot => format!("{n}. "),
            OrderedMark::Paren => format!("{n}) "),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SmartPunctuation {
    Off,

    Render,

    Input,
}

impl Default for SmartPunctuation {
    fn default() -> Self {
        SmartPunctuation::Input
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QuoteStyle {
    Curly,

    Straight,
}

impl Default for QuoteStyle {
    fn default() -> Self {
        QuoteStyle::Curly
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DashStyle {
    EnEm,

    Em,
}

impl Default for DashStyle {
    fn default() -> Self {
        DashStyle::EnEm
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AutoLanguage {
    Never,

    OnMarkdownInsert,
}

impl Default for AutoLanguage {
    fn default() -> Self {
        AutoLanguage::OnMarkdownInsert
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EquationNumbering {
    None,

    Ams,
}

impl Default for EquationNumbering {
    fn default() -> Self {
        EquationNumbering::None
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MathOutput {
    Svg,

    Mathml,
}

impl Default for MathOutput {
    fn default() -> Self {
        MathOutput::Svg
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WhitespaceMode {
    Preserve,

    PreserveAll,

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
    pub heading_style: HeadingStyle,

    pub bullet_mark: BulletMark,

    pub ordered_mark: OrderedMark,

    pub autolink: bool,

    pub inline_math: bool,

    pub subscript: bool,

    pub superscript: bool,

    pub highlight: bool,

    pub github_alerts: bool,

    pub diagrams: bool,

    pub smart_punctuation: SmartPunctuation,

    pub smart_quotes: bool,

    pub smart_quotes_double: QuoteStyle,

    pub smart_quotes_single: QuoteStyle,

    pub smart_dashes: bool,

    pub dash_style: DashStyle,

    pub auto_correct: bool,

    pub code_line_numbers: bool,

    pub code_wrap: bool,

    pub code_language_picker: bool,

    pub code_shift_tab_indent: bool,

    pub code_indent: u32,

    pub code_default_language: String,

    pub code_auto_language: AutoLanguage,

    pub latex_delimiters: bool,

    pub code_block_math: bool,

    pub equation_numbering: EquationNumbering,

    pub math_output: MathOutput,

    pub first_line_indent: bool,

    pub show_br: bool,

    pub whitespace_editing: WhitespaceMode,

    pub whitespace_export: WhitespaceMode,
}

impl Default for Markdown {
    fn default() -> Self {
        Self {
            heading_style: HeadingStyle::default(),
            bullet_mark: BulletMark::default(),
            ordered_mark: OrderedMark::default(),

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

            auto_correct: true,

            code_line_numbers: false,
            code_wrap: true,
            code_language_picker: true,
            code_shift_tab_indent: false,
            code_indent: 4,
            code_default_language: String::new(),
            code_auto_language: AutoLanguage::default(),

            latex_delimiters: true,
            code_block_math: true,
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
    fn symbolic_values_serialize_by_name() {
        assert_eq!(BulletMark::default().symbol(), '-');
        assert_eq!(BulletMark::Star.symbol(), '*');
        assert_eq!(OrderedMark::Dot.prefix(3), "3. ");
        assert_eq!(OrderedMark::Paren.prefix(3), "3) ");

        let m = Markdown {
            bullet_mark: BulletMark::Plus,
            ordered_mark: OrderedMark::Paren,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&m).unwrap();
        assert!(
            text.contains(r#"bullet_mark = "plus""#),
            "unexpected TOML:\n{text}"
        );
        assert!(
            text.contains(r#"ordered_mark = "paren""#),
            "unexpected TOML:\n{text}"
        );
    }

    #[test]
    fn smart_punctuation_defaults_to_input_and_round_trips_all_modes() {
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
                "unexpected TOML:\n{text}"
            );
            let back: Markdown = toml::from_str(&text).unwrap();
            assert_eq!(back.smart_punctuation, v);
        }
    }

    #[test]
    fn block_and_paragraph_indentation_are_distinct() {
        let m = Markdown::default();
        assert_eq!(m.code_indent, 4);
        assert_eq!(crate::settings::Editor::default().default_indent, 2);
    }

    #[test]
    fn defaults_match_the_expected_table() {
        let m = Markdown::default();

        assert!(m.autolink && m.inline_math && m.subscript && m.superscript);
        assert!(m.highlight && m.github_alerts && m.diagrams);

        assert!(m.smart_quotes && m.smart_dashes);

        assert!(m.auto_correct);

        assert!(!m.code_line_numbers);
        assert!(m.code_wrap);
        assert!(m.code_language_picker);
        assert!(!m.code_shift_tab_indent);
        assert_eq!(m.code_default_language, "");

        assert!(m.latex_delimiters && m.code_block_math);
        assert_eq!(m.equation_numbering, EquationNumbering::None);

        assert!(!m.first_line_indent && m.show_br);
    }

    #[test]
    fn missing_markdown_fields_backfill_defaults() {
        let back: Markdown = toml::from_str("highlight = false\n").unwrap();
        assert!(!back.highlight);
        assert!(
            back.subscript,
            "missing fields must backfill enabled defaults"
        );
        assert_eq!(back.code_indent, 4);
    }
}
