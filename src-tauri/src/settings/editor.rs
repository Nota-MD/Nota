use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LineEnding {
    Lf,

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
    pub default_indent: u32,

    pub paragraph_indent: bool,

    pub paragraph_indent_chars: u32,

    pub auto_pair: bool,

    pub keyboard_experience: bool,

    pub spreadsheet_tables: bool,

    pub emoji_autocomplete: bool,

    pub line_ending: LineEnding,

    pub spellcheck: bool,

    pub spellcheck_langs: Vec<String>,
}

impl Default for Editor {
    fn default() -> Self {
        Self {
            default_indent: 2,

            paragraph_indent: false,
            paragraph_indent_chars: 2,
            auto_pair: false,
            keyboard_experience: false,
            spreadsheet_tables: false,
            emoji_autocomplete: true,
            line_ending: LineEnding::default(),
            spellcheck: true,

            spellcheck_langs: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_and_paragraph_indentation_are_distinct() {
        assert_eq!(Editor::default().default_indent, 2);
        assert_eq!(
            crate::settings::markdown::Markdown::default().code_indent,
            4
        );
    }

    #[test]
    fn paragraph_indent_is_off_by_default_and_width_defaults_to_two() {
        let e = Editor::default();
        assert!(!e.paragraph_indent);
        assert_eq!(e.paragraph_indent_chars, 2);
    }

    #[test]
    fn auto_pair_defaults_off_and_old_settings_fill_it() {
        assert!(!Editor::default().auto_pair);
        let old: Editor = toml::from_str("emoji_autocomplete = false\n").unwrap();
        assert!(!old.auto_pair);
        assert!(!old.keyboard_experience);
    }

    #[test]
    fn keyboard_experience_defaults_off_and_old_settings_fill_it() {
        assert!(!Editor::default().keyboard_experience);
        let old: Editor = toml::from_str("auto_pair = true\n").unwrap();
        assert!(!old.keyboard_experience);

        let enabled = Editor {
            keyboard_experience: true,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&enabled).unwrap();
        assert!(
            text.contains("keyboard_experience = true"),
            "unexpected TOML:\n{text}"
        );
        let back: Editor = toml::from_str(&text).unwrap();
        assert!(
            back.keyboard_experience,
            "toggle did not survive a TOML round trip"
        );
    }

    #[test]
    fn spreadsheet_tables_default_off_and_round_trip() {
        assert!(!Editor::default().spreadsheet_tables);
        let old: Editor = toml::from_str("auto_pair = true\n").unwrap();
        assert!(!old.spreadsheet_tables);

        let enabled = Editor {
            spreadsheet_tables: true,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&enabled).unwrap();
        assert!(
            text.contains("spreadsheet_tables = true"),
            "actual:\n{text}"
        );
        let back: Editor = toml::from_str(&text).unwrap();
        assert!(back.spreadsheet_tables);
    }

    #[test]
    fn the_two_indentation_modes_use_separate_fields() {
        let e = Editor {
            default_indent: 3,
            paragraph_indent_chars: 6,
            ..Default::default()
        };
        let t = toml::to_string_pretty(&e).unwrap();
        assert!(t.contains("default_indent = 3"), "unexpected TOML:\n{t}");
        assert!(
            t.contains("paragraph_indent_chars = 6"),
            "unexpected TOML:\n{t}"
        );
    }

    #[test]
    fn old_settings_backfill_missing_fields() {
        let back: Editor = toml::from_str("line_ending = \"crlf\"\n").unwrap();
        assert_eq!(back.default_indent, 2);
        assert!(!back.paragraph_indent);
        assert_eq!(back.paragraph_indent_chars, 2);
    }

    #[test]
    fn default_line_ending_is_lf_and_serializes_as_kebab_case() {
        assert_eq!(LineEnding::default(), LineEnding::Lf);
        let e = Editor {
            line_ending: LineEnding::Crlf,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&e).unwrap();
        assert!(
            text.contains(r#"line_ending = "crlf""#),
            "unexpected TOML:\n{text}"
        );
    }

    #[test]
    fn missing_editor_fields_backfill_defaults() {
        let back: Editor = toml::from_str("emoji_autocomplete = false\n").unwrap();
        assert!(!back.emoji_autocomplete);
        assert_eq!(back.default_indent, 2);
    }

    #[test]
    fn spellcheck_languages_default_to_system_selection() {
        assert!(Editor::default().spellcheck_langs.is_empty());

        let e = Editor::default();
        let t = toml::to_string_pretty(&e).unwrap();
        let back: Editor = toml::from_str(&t).unwrap();
        assert!(back.spellcheck_langs.is_empty());
    }

    #[test]
    fn spellcheck_languages_preserve_order() {
        let e = Editor {
            spellcheck_langs: vec!["en_GB".to_string(), "zh_CN".to_string()],
            ..Default::default()
        };
        let t = toml::to_string_pretty(&e).unwrap();

        assert!(t.contains("spellcheck_langs = ["), "unexpected TOML:\n{t}");
        let back: Editor = toml::from_str(&t).unwrap();
        assert_eq!(back.spellcheck_langs, vec!["en_GB", "zh_CN"]);

        let old: Editor =
            toml::from_str("spellcheck = false\nspellcheck_lang = \"zh_CN\"\n").unwrap();
        assert!(!old.spellcheck);
        assert!(
            old.spellcheck_langs.is_empty(),
            "the legacy singular field must be ignored so the list falls back to the system"
        );
    }

    #[test]
    fn legacy_symbol_pairing_key_is_ignored() {
        let back: Editor =
            toml::from_str("match_brackets = false\nmatch_markdown = true\nsmart_symbols = true\n")
                .unwrap();
        assert_eq!(
            back,
            Editor::default(),
            "unknown legacy keys must be ignored while other fields keep defaults"
        );
    }
}
