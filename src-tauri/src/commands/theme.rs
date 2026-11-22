use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::themes::{self, DocThemeInfo};

#[tauri::command]
pub async fn nota_theme_import(path: String) -> Result<crate::theme_import::ThemeImportReport> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::theme_import::import_path(std::path::Path::new(&path))
    })
    .await
    .map_err(|error| NotaError::other(format!("Theme import worker failed: {error}")))?
}

#[tauri::command]
pub fn nota_doc_themes() -> Vec<DocThemeInfo> {
    themes::discover()
}

#[tauri::command]
pub fn nota_doc_theme_css(id: String) -> Result<String> {
    themes::css_of(&id)
}

#[tauri::command]
pub fn nota_doc_themes_open_dir(app: tauri::AppHandle) -> Result<String> {
    let shown = themes::user_themes_dir()?;
    if let Err(primary) = app.opener().open_path(shown.clone(), None::<&str>) {
        open::that_detached(&shown).map_err(|fallback| {
            NotaError::other(format!(
                "Could not open the directory with the system opener: {primary}; \
                 fallback opener failed: {fallback}; directory: {shown}"
            ))
        })?;
    }
    Ok(shown)
}
