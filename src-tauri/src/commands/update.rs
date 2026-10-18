use crate::update::{self, 安装结果, 更新状态};

#[tauri::command]
pub fn nota_update_check() -> crate::error::Result<更新状态> {
    update::检查()
}

#[tauri::command]
pub fn nota_update_install() -> crate::error::Result<安装结果> {
    update::安装()
}
