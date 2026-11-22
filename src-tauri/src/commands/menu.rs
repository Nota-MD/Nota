//!

use tauri::AppHandle;

use crate::native_menu::{self, MenuNode};

///

///

///

#[tauri::command]
pub fn nota_native_menu_apply(app: AppHandle, nodes: Vec<MenuNode>) -> Result<bool, String> {
    native_menu::apply(&app, &nodes)
}
