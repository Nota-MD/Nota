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
    pub fn shuo_ming(self) -> &'static str {
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
    pub jie: Signature,
    pub key_id: Option<String>,
    pub public_key: Option<String>,
}

impl InstallSource {
    pub fn mei_qian() -> Self {
        Self {
            jie: Signature::Unsigned,
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
    pub fn unrecorded_shi_kai_bu_kai() -> bool {
        cfg!(debug_assertions)
    }

    pub fn cong_text(text: &str, unrecorded: bool) -> Self {
        let PluginArchive { plugins } = toml::from_str(text).unwrap_or_default();
        Self {
            map: plugins,
            unrecorded,
        }
    }

    pub fn cong_text_an_current_dang(text: &str) -> Self {
        Self::cong_text(text, Self::unrecorded_shi_kai_bu_kai())
    }

    pub fn load() -> Self {
        let text = crate::paths::plugin_state_file()
            .ok()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .unwrap_or_default();
        Self::cong_text_an_current_dang(&text)
    }

    pub fn dao_text(&self) -> Result<String> {
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
        if let Some(fu) = path.parent() {
            crate::paths::ensure_dir(fu)?;
        }
        std::fs::write(&path, self.dao_text()?).map_err(|source| NotaError::Write { path, source })
    }

    pub fn is_enabled(&self, id: &str) -> bool {
        self.map
            .get(id)
            .map(|r| r.enabled)
            .unwrap_or(self.unrecorded)
    }

    pub fn ji_guo_mei_you(&self, id: &str) -> bool {
        self.map.contains_key(id)
    }

    pub fn record(&self, id: &str) -> Option<&PluginRecord> {
        self.map.get(id)
    }

    fn qu_huo_jian(&mut self, id: &str) -> &mut PluginRecord {
        let default_2 = self.unrecorded;
        self.map.entry(id.to_owned()).or_insert(PluginRecord {
            enabled: default_2,
            ..Default::default()
        })
    }

    pub fn set_enabled(&mut self, id: &str, on: bool) -> Result<()> {
        let record = self.qu_huo_jian(id);
        record.enabled = on;
        record.removed = false;
        self.save()
    }

    pub fn is_removed(&self, id: &str) -> bool {
        self.map.get(id).is_some_and(|record| record.removed)
    }

    pub fn mark_removed(&mut self, id: &str) -> Result<()> {
        let record = self.qu_huo_jian(id);
        record.enabled = false;
        record.removed = true;
        self.save()
    }

    pub fn ji_lai_lu(&mut self, id: &str, lai_lu: InstallSource) -> Result<()> {
        let r = self.qu_huo_jian(id);
        r.signature = Some(lai_lu.jie);
        r.key_id = lai_lu.key_id;
        r.public_key = lai_lu.public_key;
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

    pub fn forget_diao(&mut self, id: &str) -> Result<()> {
        self.map.remove(id);
        self.save()
    }
}

pub fn gong_yao_fingerprint(public_key: &[u8; 32]) -> String {
    use sha2::{Digest, Sha256};
    let d = Sha256::digest(public_key);
    d.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emit_bu_dang_li_unrecorded_de_plugin_shi_guan_zhe_de() {
        let s = Installed::cong_text("", false);
        assert!(!s.is_enabled("nota.git"));
        assert!(!s.ji_guo_mei_you("nota.git"));
    }

    #[test]
    fn diao_shi_dang_li_unrecorded_de_plugin_shi_kai_zhe_de() {
        let s = Installed::cong_text("", true);
        assert!(s.is_enabled("nota.git"));
    }

    #[test]
    fn ji_guo_de_an_ji_de_lai() {
        let s = Installed::cong_text(
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
    fn gong_yao_fingerprint_zhi_you_gong_yao_jue_ding() {
        let a = [1u8; 32];
        let b = [2u8; 32];
        assert_eq!(gong_yao_fingerprint(&a), gong_yao_fingerprint(&a));
        assert_ne!(gong_yao_fingerprint(&a), gong_yao_fingerprint(&b));
        assert_eq!(
            gong_yao_fingerprint(&a).len(),
            16,
            "\u{6307}\u{7eb9}\u{662f} 8 \u{5b57}\u{8282}\u{7684}\u{5341}\u{516d}\u{8fdb}\u{5236}"
        );
        assert!(gong_yao_fingerprint(&a)
            .chars()
            .all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn cun_le_neng_read_hui_lai() {
        let mut s = Installed::cong_text("", true);
        s.set_enabled("nota.git", false).unwrap();
        s.ji_lai_lu(
            "nota.git",
            InstallSource {
                jie: Signature::Verified,
                key_id: Some("abc123".into()),
                public_key: Some("AAAA".into()),
            },
        )
        .unwrap();
        let text = s.dao_text().unwrap();
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

        let hui_2 = Installed::cong_text(&text, true);
        assert!(!hui_2.is_enabled("nota.git"), "\u{5199}\u{76d8}\u{518d}\u{8bfb}\u{56de}\u{6765}\u{5f00}\u{5173}\u{4e0d}\u{80fd}\u{53d8}");
        assert_eq!(
            hui_2.record("nota.git").and_then(|r| r.signature),
            Some(Signature::Verified)
        );
        assert_eq!(
            hui_2.record("nota.git").and_then(|r| r.key_id.as_deref()),
            Some("abc123")
        );

        assert_eq!(
            hui_2
                .record("nota.git")
                .and_then(|r| r.public_key.as_deref()),
            Some("AAAA")
        );
    }

    #[test]
    fn mei_qian_ming_de_bao_lai_lu_shi_kong_zhe_de() {
        let mut s = Installed::cong_text("", true);
        s.ji_lai_lu("a.b", InstallSource::mei_qian()).unwrap();
        let r = s.record("a.b").unwrap();
        assert_eq!(r.signature, Some(Signature::Unsigned));
        assert!(r.key_id.is_none());
        assert!(r.public_key.is_none());
        let text = s.dao_text().unwrap();
        assert!(!text.contains("key_id"), "\u{5b9e}\u{9645}\u{ff1a}{text}");
    }

    #[test]
    fn forget_diao_shi_lian_enabled_yi_qi_forget() {
        let mut s = Installed::cong_text("", true);
        s.set_enabled("nota.git", false).unwrap();
        s.forget_diao("nota.git").unwrap();
        assert!(!s.ji_guo_mei_you("nota.git"));
        assert!(s.is_enabled("nota.git"), "\u{56de}\u{5230}\u{9ed8}\u{8ba4}\u{503c}\u{ff08}\u{8c03}\u{8bd5}\u{6863}=\u{5f00}\u{7740}\u{ff09}");
    }

    #[test]
    fn read_bu_chu_lai_de_pei_zhi_dang_unrecorded() {
        let s = Installed::cong_text("\u{8fd9}\u{4e0d}\u{662f} TOML {{{", true);
        assert!(s.is_enabled("\u{4efb}\u{4f55}\u{4e1c}\u{897f}"));
    }
}
