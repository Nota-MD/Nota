use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Keys {
    pub overrides: BTreeMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::settings::Settings;

    #[test]
    fn shortcut_overrides_are_empty_by_default() {
        assert!(Keys::default().overrides.is_empty());
    }

    #[test]
    fn default_serialization_keeps_the_keys_section() {
        let text = toml::to_string_pretty(&Settings::default()).unwrap();
        assert!(text.contains("[keys"), "\u{8bbe}\u{7f6e}\u{6587}\u{4ef6}\u{91cc}\u{8be5}\u{6709} keys \u{8fd9}\u{4e00}\u{8282}\u{ff1a}\n{text}");
    }

    #[test]
    fn changed_bindings_round_trip() {
        let mut s = Settings::default();
        s.keys
            .overrides
            .insert("file.saveAs".into(), "Ctrl+Alt+S".into());
        let text = toml::to_string_pretty(&s).unwrap();
        let back: Settings = toml::from_str(&text).unwrap();
        assert_eq!(
            back.keys.overrides.get("file.saveAs").map(String::as_str),
            Some("Ctrl+Alt+S")
        );
    }

    #[test]
    fn empty_override_differs_from_a_missing_override() {
        let mut s = Settings::default();
        s.keys
            .overrides
            .insert("view.forceFocus".into(), String::new());
        let text = toml::to_string_pretty(&s).unwrap();
        let back: Settings = toml::from_str(&text).unwrap();

        assert_eq!(
            back.keys.overrides.get("view.forceFocus").map(String::as_str),
            Some(""),
            "\u{7a7a}\u{4e32}\u{8981}\u{80fd}\u{539f}\u{6837}\u{5b58}\u{56de}\u{6765}\u{ff08}\u{5b83}\u{8868}\u{793a}\u{300c}\u{8fd9}\u{6761}\u{4e0d}\u{8981}\u{5feb}\u{6377}\u{952e}\u{300d}\u{ff09}"
        );
        assert_eq!(
            back.keys.overrides.get("file.save"),
            None,
            "\u{6ca1}\u{52a8}\u{8fc7}\u{7684}\u{547d}\u{4ee4}**\u{4e0d}\u{80fd}**\u{51fa}\u{73b0}\u{5728}\u{8868}\u{91cc}\u{ff08}\u{51fa}\u{73b0}\u{5c31}\u{7b49}\u{4e8e}\u{628a}\u{9ed8}\u{8ba4}\u{503c}\u{9489}\u{6b7b}\u{4e86}\u{ff09}"
        );
    }

    #[test]
    fn old_settings_without_the_section_remain_readable() {
        let old = "language = \"zh-CN\"\n";
        let s: Settings = toml::from_str(old).unwrap();
        assert!(s.keys.overrides.is_empty());
    }
}
