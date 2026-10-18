use crate::update::{self, 安装结果, 更新状态};
use tauri::Manager;

#[tauri::command]
pub async fn nota_update_check(app: tauri::AppHandle) -> crate::error::Result<更新状态> {
    let 替换规则 = 下载规则(&app);
    tauri::async_runtime::spawn_blocking(move || update::检查(&替换规则))
        .await
        .map_err(|e| crate::error::NotaError::other(format!("更新检查线程挂了：{e}")))?
}

#[tauri::command]
pub async fn nota_update_install(app: tauri::AppHandle) -> crate::error::Result<安装结果> {
    let 替换规则 = 下载规则(&app);
    tauri::async_runtime::spawn_blocking(move || update::安装(&替换规则))
        .await
        .map_err(|e| crate::error::NotaError::other(format!("更新安装线程挂了：{e}")))?
}

fn 下载规则(app: &tauri::AppHandle) -> String {
    let state = app.state::<crate::state::AppState>();
    state
        .settings
        .lock()
        .map(|s| s.download.replacements.clone())
        .unwrap_or_default()
}
