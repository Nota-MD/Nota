use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::ui_styles::{self, UiStyleInfo};

#[tauri::command]
pub fn nota_ui_styles() -> Vec<UiStyleInfo> {
    ui_styles::discover()
}

#[tauri::command]
pub fn nota_ui_style_css(id: String) -> Result<String> {
    ui_styles::css_of(&id)
}

#[tauri::command]
pub fn nota_ui_styles_open_dir(app: tauri::AppHandle) -> Result<String> {
    let shown = ui_styles::user_styles_dir()?;
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
