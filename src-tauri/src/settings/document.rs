use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DocFont {
    Sans,

    Serif,

    Mono,
}

impl Default for DocFont {
    fn default() -> Self {
        DocFont::Sans
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Document {
    pub custom_line_height: bool,

    pub line_height: u32,

    pub custom_paragraph_gap: bool,

    pub paragraph_gap: u32,

    pub custom_font: bool,

    pub font: DocFont,

    pub custom_font_size: bool,

    pub font_size: u32,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            custom_line_height: false,

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
    fn all_four_overrides_follow_the_theme_by_default() {
        let d = Document::default();
        assert!(!d.custom_line_height);
        assert!(!d.custom_paragraph_gap);
        assert!(!d.custom_font);
        assert!(!d.custom_font_size);
    }

    #[test]
    fn defaults_match_the_no_theme_fallbacks() {
        let d = Document::default();
        assert_eq!(d.line_height, 175, "fallback for --doc-line-height is 1.75");
        assert_eq!(d.paragraph_gap, 85, "fallback for --doc-para-gap is 0.85em");
        assert_eq!(d.font_size, 102, "fallback for --doc-font-size is 1.02em");
    }

    #[test]
    fn missing_document_section_backfills_defaults() {
        let back: Document = toml::from_str("").unwrap();
        assert_eq!(back, Document::default());
    }

    #[test]
    fn four_overrides_are_independent_and_serialize_as_kebab_case() {
        let d = Document {
            custom_line_height: true,
            line_height: 210,
            custom_font: true,
            font: DocFont::Mono,
            ..Default::default()
        };
        let t = toml::to_string_pretty(&d).unwrap();
        assert!(
            t.contains("custom_line_height = true"),
            "unexpected TOML:\n{t}"
        );
        assert!(t.contains("line_height = 210"), "unexpected TOML:\n{t}");
        assert!(t.contains(r#"font = "mono""#), "unexpected TOML:\n{t}");

        assert!(
            t.contains("custom_paragraph_gap = false"),
            "unexpected TOML:\n{t}"
        );
        assert!(
            t.contains("custom_font_size = false"),
            "unexpected TOML:\n{t}"
        );
        assert!(t.contains("paragraph_gap = 85"), "unexpected TOML:\n{t}");
        assert!(t.contains("font_size = 102"), "unexpected TOML:\n{t}");
    }

    #[test]
    fn all_three_font_families_round_trip_and_default_to_sans() {
        assert_eq!(DocFont::default(), DocFont::Sans);
        for (font, text) in [
            (DocFont::Sans, r#"font = "sans""#),
            (DocFont::Serif, r#"font = "serif""#),
            (DocFont::Mono, r#"font = "mono""#),
        ] {
            let d = Document {
                font,
                ..Default::default()
            };
            let t = toml::to_string_pretty(&d).unwrap();
            assert!(t.contains(text), "{font:?} serialized unexpectedly:\n{t}");
            let back: Document = toml::from_str(&t).unwrap();
            assert_eq!(back.font, font);
        }
    }

    #[test]
    fn unknown_font_family_returns_an_error() {
        let r: Result<Document, _> = toml::from_str(r#"font = "comic""#);
        assert!(
            r.is_err(),
            "an unknown font family must fail instead of falling back silently"
        );
    }
}
