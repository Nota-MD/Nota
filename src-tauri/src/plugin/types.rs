use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub api: String,
    pub host_api: String,
    pub api_supported: bool,
    pub description: String,
    pub authors: Vec<String>,
    pub license: String,
    pub capabilities: Vec<String>,
    pub entry: String,
    pub dir: String,

    pub state: String,

    pub error: Option<String>,

    pub origin: String,

    pub signature: Option<String>,

    pub key_id: Option<String>,

    pub removable: bool,

    pub langs: Vec<String>,

    #[serde(rename = "lang")]
    pub language: Option<String>,

    #[serde(rename = "lang_ok")]
    pub language_ok: bool,

    pub settings: Vec<PluginSetting>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginSetting {
    pub key: String,

    pub kind: String,

    pub label: String,

    pub help: String,
    pub min: f64,
    pub max: f64,
    pub step: f64,

    pub unit: String,

    pub value: f64,

    pub text: String,

    pub on: bool,

    pub secret: bool,

    pub placeholder: String,

    pub multiline: bool,

    pub options: Vec<PluginSettingOption>,

    pub create_command: String,

    pub rename_command: String,

    pub delete_command: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginSettingOption {
    pub value: String,
    pub label: String,
    pub editable: bool,
    pub deletable: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrustRecord {
    pub key_id: String,

    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginPanel {
    pub plugin: String,
    pub id: String,
    pub title: String,
    pub icon: Option<String>,

    pub location: String,

    pub wide: bool,

    pub live: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PluginMenuItem {
    pub plugin: String,
    pub label: String,

    pub command: String,

    pub menu: String,
    pub accelerator: Option<String>,

    pub prompt: Option<PluginPrompt>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginPrompt {
    pub arg: String,
    pub label: String,
    pub placeholder: String,
    pub hint: String,

    pub secret: bool,

    pub second_arg: String,
    pub second_label: String,
    pub second_placeholder: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReviewKind {
    Panel {
        panel: String,
    },

    Diff {
        title: String,
        text: String,
        accept: Option<ReviewAction>,
        reject: Option<ReviewAction>,
    },
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct ReviewAction {
    pub label: String,
    pub command: String,
}

#[derive(Default)]
pub struct ReviewState(pub Mutex<HashMap<String, ReviewKind>>);

impl ReviewState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, plugin: &str) -> Option<ReviewKind> {
        self.0.lock().unwrap().get(plugin).cloned()
    }

    pub fn set(&self, plugin: &str, entry: Option<ReviewKind>) {
        let mut map = self.0.lock().unwrap();
        match entry {
            Some(entry) => {
                map.clear();
                map.insert(plugin.to_owned(), entry);
            }
            None => {
                if matches!(map.get(plugin), Some(_)) {
                    map.remove(plugin);
                }
            }
        }
    }

    pub fn current(&self) -> Option<(String, ReviewKind)> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .next()
            .map(|(plugin, entry)| (plugin.clone(), entry.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_info_serializes_language_fields_for_the_frontend() {
        let info = PluginInfo {
            id: "nota.test".to_owned(),
            name: "Test".to_owned(),
            version: "0.1.0".to_owned(),
            api: "v2.5".to_owned(),
            host_api: "v2.5".to_owned(),
            api_supported: true,
            description: String::new(),
            authors: Vec::new(),
            license: "BSD-2-Clause".to_owned(),
            capabilities: Vec::new(),
            entry: "main.lua".to_owned(),
            dir: String::new(),
            state: "loaded".to_owned(),
            error: None,
            origin: "builtin".to_owned(),
            signature: None,
            key_id: None,
            removable: false,
            langs: vec!["en".to_owned()],
            language: Some("en".to_owned()),
            language_ok: true,
            settings: Vec::new(),
        };
        let json = serde_json::to_value(info).unwrap();
        assert_eq!(json["lang"], "en");
        assert_eq!(json["lang_ok"], true);
        assert!(json.get("language").is_none());
        assert!(json.get("language_ok").is_none());
    }
}
