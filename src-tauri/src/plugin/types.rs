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

    pub language: Option<String>,

    pub language_ok: bool,

    pub settings: Vec<PluginSetting>,

    pub setting_locks: Vec<String>,
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
