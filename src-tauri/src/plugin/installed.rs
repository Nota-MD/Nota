use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Signature {
    Verified,

    Unknown,

    Unsigned,
}

impl Signature {
    pub fn say_name(self) -> &'static str {
        match self {
            Self::Verified => "Verified",
            Self::Unknown => "Unknown signer",
            Self::Unsigned => "Unsigned",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PluginRecord {
    #[serde(default)]
    pub enabled: bool,

    #[serde(default, skip_serializing_if = "is_false")]
    pub removed: bool,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<Signature>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_id: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub public_key: Option<String>,

    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub setting_backups: BTreeMap<String, bool>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

pub struct InstallSource {
    pub boundary: Signature,
    pub key_id: Option<String>,
    pub public_key: Option<String>,
}

impl InstallSource {
    pub fn each_before() -> Self {
        Self {
            boundary: Signature::Unsigned,
            key_id: None,
            public_key: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PluginArchive {
    #[serde(default)]
    plugins: BTreeMap<String, PluginRecord>,
}

pub struct Installed {
    map: BTreeMap<String, PluginRecord>,

    unrecorded: bool,
}

impl Installed {
    pub fn unrecorded_is_start_not_start() -> bool {
        cfg!(debug_assertions)
    }

    pub fn from_text(text: &str, unrecorded: bool) -> Self {
        let PluginArchive { plugins } = toml::from_str(text).unwrap_or_default();
        Self {
            map: plugins,
            unrecorded,
        }
    }

    pub fn from_text_by_current_when(text: &str) -> Self {
        Self::from_text(text, Self::unrecorded_is_start_not_start())
    }

    pub fn load() -> Self {
        let text = crate::paths::plugin_state_file()
            .ok()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .unwrap_or_default();
        Self::from_text_by_current_when(&text)
    }

    pub fn to_text(&self) -> Result<String> {
        let archive_2 = PluginArchive {
            plugins: self.map.clone(),
        };
        toml::to_string_pretty(&archive_2).map_err(|e| {
            NotaError::other(format!(
                "Could not serialize extension state as TOML (internal error): {e}"
            ))
        })
    }

    pub fn save(&self) -> Result<()> {
        let path = crate::paths::plugin_state_file()?;
        if let Some(service) = path.parent() {
            crate::paths::ensure_dir(service)?;
        }
        std::fs::write(&path, self.to_text()?).map_err(|source| NotaError::Write { path, source })
    }

    pub fn is_enabled(&self, id: &str) -> bool {
        self.map
            .get(id)
            .map(|r| r.enabled)
            .unwrap_or(self.unrecorded)
    }

    pub fn record_passed_each_has(&self, id: &str) -> bool {
        self.map.contains_key(id)
    }

    pub fn record(&self, id: &str) -> Option<&PluginRecord> {
        self.map.get(id)
    }

    fn get_active_check(&mut self, id: &str) -> &mut PluginRecord {
        let default_2 = self.unrecorded;
        self.map.entry(id.to_owned()).or_insert(PluginRecord {
            enabled: default_2,
            ..Default::default()
        })
    }

    pub fn set_enabled(&mut self, id: &str, on: bool) -> Result<()> {
        let record = self.get_active_check(id);
        record.enabled = on;
        record.removed = false;
        self.save()
    }

    pub fn is_removed(&self, id: &str) -> bool {
        self.map.get(id).is_some_and(|record| record.removed)
    }

    pub fn mark_removed(&mut self, id: &str) -> Result<()> {
        let record = self.get_active_check(id);
        record.enabled = false;
        record.removed = true;
        self.save()
    }

    pub fn record_incoming_path(&mut self, id: &str, incoming_path: InstallSource) -> Result<()> {
        let r = self.get_active_check(id);
        r.signature = Some(incoming_path.boundary);
        r.key_id = incoming_path.key_id;
        r.public_key = incoming_path.public_key;
        self.save()
    }

    pub fn needs_setting_backup(&self, id: &str, setting: &str) -> bool {
        !self
            .map
            .get(id)
            .is_some_and(|record| record.setting_backups.contains_key(setting))
    }

    pub fn remember_setting_backup(&mut self, id: &str, setting: &str, value: bool) -> Result<()> {
        let enabled = self.is_enabled(id);
        self.map
            .entry(id.to_owned())
            .or_insert(PluginRecord {
                enabled,
                ..Default::default()
            })
            .setting_backups
            .insert(setting.to_owned(), value);
        self.save()
    }

    pub fn setting_backup(&self, id: &str, setting: &str) -> Option<bool> {
        self.map
            .get(id)
            .and_then(|record| record.setting_backups.get(setting).copied())
    }

    pub fn clear_setting_backup(&mut self, id: &str, setting: &str) -> Result<()> {
        if let Some(record) = self.map.get_mut(id) {
            record.setting_backups.remove(setting);
        }
        self.save()
    }

    pub fn backup_owner(&self, setting: &str) -> Option<&str> {
        self.map.iter().find_map(|(id, record)| {
            record
                .setting_backups
                .contains_key(setting)
                .then_some(id.as_str())
        })
    }

    pub fn setting_backups(&self) -> Vec<(String, String, bool)> {
        self.map
            .iter()
            .flat_map(|(id, record)| {
                record
                    .setting_backups
                    .iter()
                    .map(move |(setting, value)| (id.clone(), setting.clone(), *value))
            })
            .collect()
    }

    pub fn forget_drop(&mut self, id: &str) -> Result<()> {
        self.map.remove(id);
        self.save()
    }
}

pub fn work_need_fingerprint(public_key: &[u8; 32]) -> String {
    use sha2::{Digest, Sha256};
    let d = Sha256::digest(public_key);
    d.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emit_not_when_inner_unrecorded_plugin_is_close() {
        let s = Installed::from_text("", false);
        assert!(!s.is_enabled("nota.git"));
        assert!(!s.record_passed_each_has("nota.git"));
    }

    #[test]
    fn drop_is_when_inner_unrecorded_plugin_is_start() {
        let s = Installed::from_text("", true);
        assert!(s.is_enabled("nota.git"));
    }

    #[test]
    fn record_passed_by_record_incoming() {
        let s = Installed::from_text(
            r#"
[plugins."nota.git"]
enabled = false
"#,
            true,
        );
        assert!(!s.is_enabled("nota.git"));
        assert!(
            s.is_enabled("nota.ai"),
            "\u{522b}\u{7684}\u{62d3}\u{5c55}\u{7167}\u{65e7}\u{8d70}\u{9ed8}\u{8ba4}\u{503c}"
        );
    }

    #[test]
    fn work_need_fingerprint_only_has_work_need_absolute_define() {
        let a = [1u8; 32];
        let b = [2u8; 32];
        assert_eq!(work_need_fingerprint(&a), work_need_fingerprint(&a));
        assert_ne!(work_need_fingerprint(&a), work_need_fingerprint(&b));
        assert_eq!(
            work_need_fingerprint(&a).len(),
            16,
            "\u{6307}\u{7eb9}\u{662f} 8 \u{5b57}\u{8282}\u{7684}\u{5341}\u{516d}\u{8fdb}\u{5236}"
        );
        assert!(work_need_fingerprint(&a)
            .chars()
            .all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn store_can_read_return_incoming() {
        let mut s = Installed::from_text("", true);
        s.set_enabled("nota.git", false).unwrap();
        s.record_incoming_path(
            "nota.git",
            InstallSource {
                boundary: Signature::Verified,
                key_id: Some("abc123".into()),
                public_key: Some("AAAA".into()),
            },
        )
        .unwrap();
        let text = s.to_text().unwrap();
        assert!(
            text.contains("[plugins.\"nota.git\"]"),
            "\u{5b9e}\u{9645}\u{ff1a}{text}"
        );
        assert!(
            text.contains("enabled = false"),
            "\u{5b9e}\u{9645}\u{ff1a}{text}"
        );
        assert!(
            text.contains("signature = \"verified\""),
            "\u{5b9e}\u{9645}\u{ff1a}{text}"
        );

        let return_2 = Installed::from_text(&text, true);
        assert!(!return_2.is_enabled("nota.git"), "\u{5199}\u{76d8}\u{518d}\u{8bfb}\u{56de}\u{6765}\u{5f00}\u{5173}\u{4e0d}\u{80fd}\u{53d8}");
        assert_eq!(
            return_2.record("nota.git").and_then(|r| r.signature),
            Some(Signature::Verified)
        );
        assert_eq!(
            return_2
                .record("nota.git")
                .and_then(|r| r.key_id.as_deref()),
            Some("abc123")
        );

        assert_eq!(
            return_2
                .record("nota.git")
                .and_then(|r| r.public_key.as_deref()),
            Some("AAAA")
        );
    }

    #[test]
    fn each_before_name_package_incoming_path_is_empty() {
        let mut s = Installed::from_text("", true);
        s.record_incoming_path("a.b", InstallSource::each_before())
            .unwrap();
        let r = s.record("a.b").unwrap();
        assert_eq!(r.signature, Some(Signature::Unsigned));
        assert!(r.key_id.is_none());
        assert!(r.public_key.is_none());
        let text = s.to_text().unwrap();
        assert!(!text.contains("key_id"), "\u{5b9e}\u{9645}\u{ff1a}{text}");
    }

    #[test]
    fn forget_drop_is_link_enabled_one_start_forget() {
        let mut s = Installed::from_text("", true);
        s.set_enabled("nota.git", false).unwrap();
        s.forget_drop("nota.git").unwrap();
        assert!(!s.record_passed_each_has("nota.git"));
        assert!(s.is_enabled("nota.git"), "\u{56de}\u{5230}\u{9ed8}\u{8ba4}\u{503c}\u{ff08}\u{8c03}\u{8bd5}\u{6863}=\u{5f00}\u{7740}\u{ff09}");
    }

    #[test]
    fn read_not_out_incoming_match_only_when_unrecorded() {
        let s = Installed::from_text("\u{8fd9}\u{4e0d}\u{662f} TOML {{{", true);
        assert!(s.is_enabled("\u{4efb}\u{4f55}\u{4e1c}\u{897f}"));
    }
}
