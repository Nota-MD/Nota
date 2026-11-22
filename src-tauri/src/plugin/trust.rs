use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedKey {
    #[serde(default)]
    pub name: String,

    pub public_key: String,

    #[serde(default)]
    pub added_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct TrustStoreFile {
    #[serde(default)]
    keys: BTreeMap<String, TrustedKey>,
}

pub struct TrustStore {
    keys: BTreeMap<String, TrustedKey>,
}

impl TrustStore {
    pub fn from_text(text: &str) -> Self {
        let TrustStoreFile { keys } = toml::from_str(text).unwrap_or_default();
        Self { keys }
    }

    pub fn load() -> Self {
        let text = crate::paths::trusted_keys_file()
            .ok()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .unwrap_or_default();
        Self::from_text(&text)
    }

    pub fn to_text(&self) -> Result<String> {
        let store = TrustStoreFile {
            keys: self.keys.clone(),
        };
        toml::to_string_pretty(&store)
            .map_err(|e| NotaError::other(format!("Could not serialize the trust store: {e}")))
    }

    pub fn save(&self) -> Result<()> {
        let path = crate::paths::trusted_keys_file()?;
        if let Some(parent) = path.parent() {
            crate::paths::ensure_dir(parent)?;
        }
        std::fs::write(&path, self.to_text()?).map_err(|source| NotaError::Write { path, source })
    }

    pub fn contains(&self, key_id: &str) -> bool {
        self.keys.contains_key(key_id)
    }

    pub fn len(&self) -> usize {
        self.keys.len()
    }

    pub fn entries(&self) -> Vec<(String, String)> {
        self.keys
            .iter()
            .map(|(k, v)| (k.clone(), v.name.clone()))
            .collect()
    }

    pub fn insert(&mut self, key_id: &str, name: &str, public_key: &str) -> Result<()> {
        self.insert_memory(key_id, name, public_key);
        self.save()
    }

    pub(crate) fn insert_memory(&mut self, key_id: &str, name: &str, public_key: &str) {
        self.keys.insert(
            key_id.to_owned(),
            TrustedKey {
                name: name.to_owned(),
                public_key: public_key.to_owned(),
                added_at: today(),
            },
        );
    }
}

pub fn today() -> String {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (year, month, day) = civil_date((seconds / 86_400) as i64);
    format!("{year:04}-{month:02}-{day:02}")
}

pub(crate) fn civil_date(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
