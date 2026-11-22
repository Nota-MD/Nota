use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InsertImageAction {
    None,

    CopyToCurrentDir,

    CopyToAssets,

    CopyToDocAssets,

    CopyToCustom,
}

impl Default for InsertImageAction {
    fn default() -> Self {
        InsertImageAction::None
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Image {
    pub insert_action: InsertImageAction,

    pub custom_dir: String,

    pub apply_to_local: bool,

    pub apply_to_remote: bool,

    pub prefer_relative: bool,

    pub add_dot_slash: bool,

    pub escape_url: bool,
}

impl Default for Image {
    fn default() -> Self {
        Self {
            insert_action: InsertImageAction::default(),
            custom_dir: String::new(),

            apply_to_local: true,
            apply_to_remote: false,
            prefer_relative: false,
            add_dot_slash: false,
            escape_url: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_insertion_does_not_touch_disk_by_default() {
        assert_eq!(InsertImageAction::default(), InsertImageAction::None);
        assert_eq!(Image::default().insert_action, InsertImageAction::None);
        let text = toml::to_string_pretty(&Image::default()).unwrap();
        assert!(
            text.contains(r#"insert_action = "none""#),
            "unexpected TOML:\n{text}"
        );
    }

    #[test]
    fn five_insertion_modes_keep_their_legacy_wire_names() {
        let table = [
            (InsertImageAction::None, "none"),
            (InsertImageAction::CopyToCurrentDir, "copy-to-current-dir"),
            (InsertImageAction::CopyToAssets, "copy-to-assets"),
            (InsertImageAction::CopyToDocAssets, "copy-to-doc-assets"),
            (InsertImageAction::CopyToCustom, "copy-to-custom"),
        ];
        for (value, wire_name) in table {
            let text = format!("insert_action = \"{wire_name}\"\n");
            let round_trip: Image = toml::from_str(&text).unwrap();
            assert_eq!(
                round_trip.insert_action, value,
                "could not read {wire_name}"
            );
            let serialized = toml::to_string_pretty(&Image {
                insert_action: value,
                ..Default::default()
            })
            .unwrap();
            assert!(
                serialized.contains(wire_name),
                "serialized value did not contain {wire_name}:\n{serialized}"
            );
        }
    }

    #[test]
    fn old_settings_backfill_missing_image_fields() {
        let round_trip: Image = toml::from_str("insert_action = \"copy-to-assets\"\n").unwrap();
        assert_eq!(round_trip.custom_dir, "");
        assert!(round_trip.apply_to_local);
        assert!(!round_trip.apply_to_remote);
        assert!(!round_trip.prefer_relative);
    }

    #[test]
    fn image_settings_do_not_contain_upload_or_credentials() {
        let text = toml::to_string_pretty(&Image::default()).unwrap();
        let lowercase = text.to_lowercase();
        for forbidden in [
            "upload",
            "\u{56fe}\u{5e8a}",
            "picgo",
            "smms",
            "imgur",
            "token",
            "secret",
            "password",
            "authorization",
            "api_key",
            "endpoint",
        ] {
            assert!(
                !lowercase.contains(forbidden),
                "image settings must not contain {forbidden}; upload credentials live in \
                 image-upload.toml with mode 0600:\n{text}"
            );
        }
    }
}
