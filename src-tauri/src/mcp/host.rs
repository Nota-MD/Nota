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
    fn app_ban_ben(&self) -> String;

    fn overview_men(&self) -> Vec<HostOverview>;

    fn read_2(&self, id: Option<u64>) -> Result<FullDocument, String>;

    fn write_2(&self, id: Option<u64>, body_2: &str) -> Result<(u64, u64), String>;

    fn qing_qiu_open(&self, path_3: &str) -> Result<(), String>;
}

pub struct AppHost {
    app: tauri::AppHandle,
}

impl AppHost {
    pub fn xin(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    fn status_2(&self) -> Result<tauri::State<'_, AppState>, String> {
        self.app
            .try_state::<AppState>()
            .ok_or_else(|| "Nota application state is not ready".to_string())
    }
}

fn tan(d: &crate::document::Document, huo_dong: Option<u64>) -> HostOverview {
    HostOverview {
        id: d.id.0,
        title: d.title.clone(),
        path: d.path_string(),
        dirty: d.dirty,
        revision: d.revision,
        active: huo_dong == Some(d.id.0),
    }
}

impl Host for AppHost {
    fn app_ban_ben(&self) -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }

    fn overview_men(&self) -> Vec<HostOverview> {
        let status_2 = match self.status_2() {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let cang = status_2.documents.lock().unwrap();
        let huo_dong = cang.active_id().map(|i| i.0);
        let mut chu_de: Vec<HostOverview> = cang.list().iter().map(|d| tan(d, huo_dong)).collect();

        if let Some(wei) = chu_de.iter().position(|g| g.active) {
            let yi_fen = chu_de.remove(wei);
            chu_de.insert(0, yi_fen);
        }
        chu_de
    }

    fn read_2(&self, id: Option<u64>) -> Result<FullDocument, String> {
        let status_2 = self.status_2()?;
        let cang = status_2.documents.lock().unwrap();
        let huo_dong = cang.active_id().map(|i| i.0);
        let document_2 = match id {
            Some(yao) => cang.list().iter().find(|d| d.id.0 == yao).ok_or_else(|| {
                format!("No document has ID {yao}; use nota_documents to list open documents")
            })?,
            None => cang
                .active()
                .ok_or_else(|| "Nota has no open documents".to_string())?,
        };
        Ok(FullDocument {
            overview: tan(document_2, huo_dong),
            body_2: document_2.text.clone(),
        })
    }

    fn write_2(&self, id: Option<u64>, body_2: &str) -> Result<(u64, u64), String> {
        let status_2 = self.status_2()?;
        let (document_hao, ban_ben) = {
            let mut cang = status_2.documents.lock().unwrap();
            let yao = match id {
                Some(yao) => crate::document::DocId(yao),
                None => cang
                    .active_id()
                    .ok_or_else(|| "Nota has no open documents".to_string())?,
            };
            let ban_ben = cang
                .sync(yao, body_2.to_string())
                .map_err(|e| e.to_string())?;
            (yao.0, ban_ben)
        };

        let _ = self.app.emit(
            "nota:document-changed",
            json!({ "id": document_hao, "text": body_2, "origin": "mcp" }),
        );
        Ok((document_hao, ban_ben))
    }

    fn qing_qiu_open(&self, path_3: &str) -> Result<(), String> {
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
