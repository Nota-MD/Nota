use std::path::PathBuf;

use serde_json::json;
use tauri::{Emitter, Manager};

use crate::state::AppState;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct HostOverview {
    pub id: u64,
    pub title: String,

    pub path: Option<String>,

    pub dirty: bool,

    pub revision: u64,

    pub active: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FullDocument {
    pub overview: HostOverview,
    pub body_2: String,
}

pub trait Host: Send + Sync {
    fn app_half_current(&self) -> String;

    fn overview_list(&self) -> Vec<HostOverview>;

    fn read_2(&self, id: Option<u64>) -> Result<FullDocument, String>;

    fn write_2(&self, id: Option<u64>, body_2: &str) -> Result<(u64, u64), String>;

    fn request_request_open(&self, path_3: &str) -> Result<(), String>;
}

pub struct AppHost {
    app: tauri::AppHandle,
}

impl AppHost {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    fn status_2(&self) -> Result<tauri::State<'_, AppState>, String> {
        self.app
            .try_state::<AppState>()
            .ok_or_else(|| "Nota application state is not ready".to_string())
    }
}

fn probe(d: &crate::document::Document, active_dynamic: Option<u64>) -> HostOverview {
    HostOverview {
        id: d.id.0,
        title: d.title.clone(),
        path: d.path_string(),
        dirty: d.dirty,
        revision: d.revision,
        active: active_dynamic == Some(d.id.0),
    }
}

impl Host for AppHost {
    fn app_half_current(&self) -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }

    fn overview_list(&self) -> Vec<HostOverview> {
        let status_2 = match self.status_2() {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let store = status_2.documents.lock().unwrap();
        let active_dynamic = store.active_id().map(|i| i.0);
        let mut out: Vec<HostOverview> = store
            .list()
            .iter()
            .map(|d| probe(d, active_dynamic))
            .collect();

        if let Some(position) = out.iter().position(|g| g.active) {
            let one_part = out.remove(position);
            out.insert(0, one_part);
        }
        out
    }

    fn read_2(&self, id: Option<u64>) -> Result<FullDocument, String> {
        let status_2 = self.status_2()?;
        let store = status_2.documents.lock().unwrap();
        let active_dynamic = store.active_id().map(|i| i.0);
        let document_2 = match id {
            Some(need) => store
                .list()
                .iter()
                .find(|d| d.id.0 == need)
                .ok_or_else(|| {
                    format!("No document has ID {need}; use nota_documents to list open documents")
                })?,
            None => store
                .active()
                .ok_or_else(|| "Nota has no open documents".to_string())?,
        };
        Ok(FullDocument {
            overview: probe(document_2, active_dynamic),
            body_2: document_2.text.clone(),
        })
    }

    fn write_2(&self, id: Option<u64>, body_2: &str) -> Result<(u64, u64), String> {
        let status_2 = self.status_2()?;
        let (document_number, half_current) = {
            let mut store = status_2.documents.lock().unwrap();
            let need = match id {
                Some(need) => crate::document::DocId(need),
                None => store
                    .active_id()
                    .ok_or_else(|| "Nota has no open documents".to_string())?,
            };
            let half_current = store
                .sync(need, body_2.to_string())
                .map_err(|e| e.to_string())?;
            (need.0, half_current)
        };

        let _ = self.app.emit(
            "nota:document-changed",
            json!({ "id": document_number, "text": body_2, "origin": "mcp" }),
        );
        Ok((document_number, half_current))
    }

    fn request_request_open(&self, path_3: &str) -> Result<(), String> {
        let target_2 = PathBuf::from(path_3);
        if !target_2.exists() {
            return Err(format!("Path does not exist: {path_3}"));
        }

        let _ = self.app.emit(
            crate::single_instance::EVENT,
            crate::single_instance::Payload {
                path: Some(path_3.to_string()),
                error: None,
            },
        );
        Ok(())
    }
}
