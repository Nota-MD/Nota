use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct General {
    pub language: String,

    pub onboarding_seen: bool,

    pub debug_mode: bool,

    pub extensions_enabled: bool,

    pub element_inspector: bool,

    pub lua_hot_reload: bool,

    pub select_ui_text: bool,

    pub webview_default_shortcuts: bool,

    pub dev_bridge_enabled: bool,

    pub dev_bridge_port: u16,

    pub dev_bridge_whitelist: Vec<String>,
}

impl Default for General {
    fn default() -> Self {
        Self {
            language: crate::distribution_profile::DEFAULT_LANGUAGE.to_owned(),
            onboarding_seen: false,
            debug_mode: false,
            extensions_enabled: true,
            element_inspector: false,
            lua_hot_reload: false,
            select_ui_text: false,
            webview_default_shortcuts: false,
            dev_bridge_enabled: false,
            dev_bridge_port: 17321,
            dev_bridge_whitelist: vec!["127.0.0.1".into(), "::1".into()],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn general_settings_have_no_telemetry_or_server() {
        let text = toml::to_string_pretty(&General::default()).unwrap();
        for forbidden in ["telemetry", "analytics", "usage_data", "server", "license"] {
            assert!(
                !text.to_lowercase().contains(forbidden),
                "General settings must not contain {forbidden}:\n{text}"
            );
        }
    }

    #[test]
    fn debug_mode_is_off_by_default() {
        assert!(!General::default().debug_mode);
    }

    #[test]
    fn onboarding_defaults_to_unseen_and_old_settings_remain_readable() {
        assert!(!General::default().onboarding_seen);
        let old: General = toml::from_str("language = \"auto\"").unwrap();
        assert!(!old.onboarding_seen);
    }

    #[test]
    fn extensions_are_enabled_by_default_and_old_settings_backfill() {
        assert!(General::default().extensions_enabled);
        let old: General = toml::from_str("language = \"auto\"").unwrap();
        assert!(old.extensions_enabled);
    }

    #[test]
    fn developer_features_are_off_by_default_and_old_settings_backfill() {
        assert!(!General::default().element_inspector);
        assert!(!General::default().lua_hot_reload);
        assert!(!General::default().select_ui_text);
        assert!(!General::default().webview_default_shortcuts);
        let old: General = toml::from_str("language = \"auto\"").unwrap();
        assert!(!old.element_inspector);
        assert!(!old.lua_hot_reload);
        assert!(!old.select_ui_text);
        assert!(!old.webview_default_shortcuts);
    }

    #[test]
    fn developer_bridge_defaults_to_loopback_and_disabled() {
        let general = General::default();
        assert!(!general.dev_bridge_enabled);
        assert_eq!(general.dev_bridge_port, 17321);
        assert_eq!(
            general.dev_bridge_whitelist,
            vec!["127.0.0.1".to_owned(), "::1".to_owned()]
        );
        let old: General = toml::from_str("language = \"auto\"").unwrap();
        assert!(!old.dev_bridge_enabled);
        assert_eq!(old.dev_bridge_port, 17321);
    }

    #[test]
    fn language_follows_the_system_by_default() {
        assert_eq!(General::default().language, crate::lang::AUTO);
    }
}
