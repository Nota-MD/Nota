use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct CustomExporter {
    pub id: String,

    pub name: String,

    pub format: String,

    pub args: String,

    pub base_args: String,

    pub style_file: String,

    pub open_after_export: bool,
}

impl CustomExporter {
    fn new(id: &str, name: &str, format: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            format: format.to_string(),
            args: String::new(),
            base_args: String::new(),
            style_file: String::new(),
            open_after_export: false,
        }
    }
}

fn default_exporters() -> Vec<CustomExporter> {
    vec![
        CustomExporter::new("template-docx", "Word (.docx)", "docx"),
        CustomExporter::new("template-odt", "OpenDocument", "odt"),
        CustomExporter::new("template-rtf", "RTF", "rtf"),
        CustomExporter::new("template-epub", "EPUB", "epub"),
        CustomExporter::new("template-latex", "LaTeX", "latex"),
        CustomExporter::new("template-mediawiki", "MediaWiki", "mediawiki"),
        CustomExporter::new("template-rst", "reStructuredText", "rst"),
        CustomExporter::new("template-textile", "Textile", "textile"),
        CustomExporter::new("template-opml", "OPML", "opml"),
    ]
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Export {
    pub default_folder: String,

    pub open_after_export: bool,

    pub pandoc_args: String,

    #[serde(default = "default_exporters")]
    pub custom_exporters: Vec<CustomExporter>,
}

impl Default for Export {
    fn default() -> Self {
        Self {
            default_folder: String::new(),

            open_after_export: false,

            pandoc_args: String::new(),
            custom_exporters: default_exporters(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_folder_means_automatic() {
        let e = Export::default();
        assert_eq!(e.default_folder, "");
        assert!(!e.open_after_export);
    }

    #[test]
    fn pandoc_path_is_not_persisted() {
        let text = toml::to_string_pretty(&Export::default()).unwrap();
        assert!(
            !text.to_lowercase().contains("pandoc_path"),
            "export settings must not persist a Pandoc path:\n{text}"
        );

        assert!(
            text.contains(r#"pandoc_args = """#),
            "the extra-arguments field must remain present even when empty:\n{text}"
        );
    }

    #[test]
    fn extra_arguments_round_trip() {
        let e = Export {
            pandoc_args: "--reference-doc=\u{6211}\u{7684}\u{6a21}\u{677f}.docx --metadata title=\"\u{6211}\u{7684} \u{4e66}\"".to_string(),
            ..Export::default()
        };
        let text = toml::to_string_pretty(&e).unwrap();
        let back: Export = toml::from_str(&text).unwrap();
        assert_eq!(back.pandoc_args, e.pandoc_args);

        let old: Export =
            toml::from_str("default_folder = \"\"\nopen_after_export = false\n").unwrap();
        assert_eq!(old.pandoc_args, "");
    }

    #[test]
    fn default_exporters_are_removable_and_old_settings_backfill() {
        let e = Export::default();
        assert_eq!(e.custom_exporters.len(), 9);
        assert_eq!(e.custom_exporters[0].format, "docx");

        let empty: Export = toml::from_str(
            "default_folder = \"\"\nopen_after_export = false\npandoc_args = \"\"\ncustom_exporters = []\n",
        )
        .unwrap();
        assert!(empty.custom_exporters.is_empty());

        let old: Export = toml::from_str(
            "default_folder = \"\"\nopen_after_export = false\npandoc_args = \"\"\n",
        )
        .unwrap();
        assert_eq!(old.custom_exporters.len(), 9);
    }
}
