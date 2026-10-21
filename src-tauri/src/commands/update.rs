use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Emitter, Manager};

use crate::update::{self, 安装结果, 下载进度, 更新状态};

pub const EVENT_UPDATE_PROGRESS: &str = "nota:update-progress";

static 检查中: AtomicBool = AtomicBool::new(false);
static 安装中: AtomicBool = AtomicBool::new(false);

struct 单飞<'a>(&'a AtomicBool);

impl<'a> 单飞<'a> {
    fn 拿(标志: &'a AtomicBool, 忙话: &str) -> crate::error::Result<Self> {
        标志
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| crate::error::NotaError::other(忙话.to_string()))?;
        Ok(Self(标志))
    }
}

impl Drop for 单飞<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub async fn nota_update_check(app: tauri::AppHandle) -> crate::error::Result<更新状态> {
    let _单飞 = 单飞::拿(&检查中, "正在检查更新，请稍候")?;
    let 替换规则 = 下载规则(&app);
    tauri::async_runtime::spawn_blocking(move || update::检查(&替换规则))
        .await
        .map_err(|e| crate::error::NotaError::other(format!("更新检查线程挂了：{e}")))?
}

#[tauri::command]
pub async fn nota_update_install(app: tauri::AppHandle) -> crate::error::Result<安装结果> {
    let _单飞 = 单飞::拿(&安装中, "更新正在下载或安装，请稍候")?;
    let 替换规则 = 下载规则(&app);
    let 推送 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        update::安装(&替换规则, |进度: 下载进度| {
            let _ = 推送.emit(EVENT_UPDATE_PROGRESS, 进度);
        })
    })
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
