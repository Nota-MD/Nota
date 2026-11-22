use std::collections::HashMap;
use std::path::PathBuf;

use crate::error::Result;

#[tauri::command]
pub fn nota_table_widths_get(path: String) -> Result<HashMap<String, Vec<u32>>> {
    Ok(crate::table_width::get_2(&PathBuf::from(path))
        .into_iter()
        .map(|one| (one.fingerprint_2, one.width_2))
        .collect())
}

#[tauri::command]
pub fn nota_table_widths_set(path: String, fingerprint: String, widths: Vec<u32>) -> Result<()> {
    crate::table_width::record(&PathBuf::from(path), &fingerprint, &widths)
        .map_err(crate::error::NotaError::other)
}

#[tauri::command]
pub fn nota_table_widths_forget(path: String) -> Result<()> {
    crate::table_width::forget(&PathBuf::from(path)).map_err(crate::error::NotaError::other)
}
