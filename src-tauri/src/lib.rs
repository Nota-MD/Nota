//! Nota 宿主库。
//!
//! 启动顺序是**有讲究的**（下面 `run()` 里每一步都注了为什么）：
//!
//! 1. 读设置（读不出来就回默认值并记一笔，**不让应用打不开**）；
//! 2. 探插件目录、加载插件——**必须在 Tauri 起来之后**，因为插件的 `nota.ui.*`
//!    要发事件给前端，而那需要 `AppHandle`；
//! 3. 组装 `AppState` 交给 Tauri 托管；
//! 4. 窗口显示后，把"插件已经注册了哪些菜单/面板"补发给前端
//!    （插件加载早于前端就绪，早发的事件没人收——见 `nota_frontend_ready`）。

pub mod commands;
pub mod document;
pub mod error;
pub mod lua;
pub mod paths;
pub mod plugin;
pub mod settings;
pub mod state;
pub mod themes;

use std::sync::{Arc, Mutex};

use lua::HostContext;
use plugin::PluginHost;
use settings::Settings;
use state::AppState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // ── ① 设置 ────────────────────────────────────────────────────
            // 读失败**不回滚启动**：一份坏掉的 settings.toml 不该让人连界面都进不去。
            // 退回默认值 + 在控制台说明，用户至少能打开应用去改回来。
            let settings = match Settings::load() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[nota] 读设置失败，本次用默认值：{e}");
                    Settings::default()
                }
            };

            // ── ② 插件 ────────────────────────────────────────────────────
            let documents = Arc::new(Mutex::new(document::DocumentStore::new()));
            let settings_arc = Arc::new(Mutex::new(settings));
            let workspace = Arc::new(Mutex::new(None));

            let resource_dir = app.path().resource_dir().ok();
            let base = HostContext {
                app: app.handle().clone(),
                documents: documents.clone(),
                settings: settings_arc.clone(),
                workspace: workspace.clone(),
                plugin_id: String::new(), // 每个插件加载时会被换成自己的 id
            };
            let plugins = PluginHost::discover(resource_dir, &base);
            eprintln!("[nota] 载入 {} 个插件", plugins.count());

            // ── ③ 交给 Tauri 托管 ─────────────────────────────────────────
            app.manage(AppState {
                documents,
                settings: settings_arc,
                workspace,
                plugins: Mutex::new(plugins),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::document::nota_doc_new,
            commands::document::nota_doc_open,
            commands::document::nota_doc_sync,
            commands::document::nota_doc_settle,
            commands::document::nota_doc_save,
            commands::document::nota_doc_close,
            commands::document::nota_doc_set_active,
            commands::document::nota_doc_get,
            commands::document::nota_doc_list,
            commands::document::nota_doc_reload,
            commands::document::nota_doc_has_unsaved,
            commands::workspace::nota_workspace_open,
            commands::workspace::nota_workspace_close,
            commands::workspace::nota_workspace_get,
            commands::workspace::nota_workspace_tree,
            commands::settings::nota_settings_get,
            commands::settings::nota_settings_set,
            commands::theme::nota_themes_list,
            commands::theme::nota_theme_read,
            commands::theme::nota_theme_asset,
            commands::theme::nota_themes_dir,
            commands::plugin::nota_plugins_list,
            commands::plugin::nota_plugin_set_enabled,
            commands::plugin::nota_plugin_call,
            commands::plugin::nota_plugin_find_command,
            commands::plugin::nota_plugin_panels,
            commands::plugin::nota_plugin_menus,
            nota_frontend_ready,
        ])
        .on_window_event(|window, event| {
            // 关窗前给插件一次 on_unload，让它们有机会落盘自己的状态。
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<AppState>() {
                    if let Ok(mut host) = state.plugins.lock() {
                        host.unload_all();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Nota 启动失败");
}

/// 前端就绪信号：**此刻起可以安全地往它推事件了。**
///
/// # 曾经想让它干的事，和为什么没干成
///
/// 早先的打算是让它**重放**插件的 UI 注册：插件在 `setup()` 里加载，那一刻
/// `nota.ui.register_menu` 发的 `nota:plugin-menu` 没人收（WebView 里连 `listen()`
/// 都还没注册），而 Tauri 的 emit 对没有监听者的频道是**静默成功**的——
/// 现象会是"插件菜单时有时无"，且日志里一点痕迹都没有。当时的方案是
/// "当场发 + 记账 + 前端起来后调这个命令重放一遍"。
///
/// **那个方案已被推翻**（2026-09-22，BUG-13）：它把面板/菜单清单变成**两个真相源**
/// （前端的事件账本、插件自己的注册表），重放漏一次或前端不是幂等的，两边就静默分叉——
/// 还是同一个病。正确的判据是 **声明是状态 → 拉；发生是事件 → 推**：
/// 面板与菜单改由 `nota_plugin_panels` / `nota_plugin_menus` 去拉，根本不经过事件，
/// 于是不存在赛跑，也就不需要重放。
///
/// # 那它还留着做什么
///
/// 它仍然回答一个真问题：**WebView 什么时候开始能收事件了。** 宿主在启动早期
/// 推的任何东西（插件的 `on_load` 里 `nota.event.emit`、宿主自己的状态通知）
/// 都落在这一枪之前，必然丢失。将来要补"启动期的事件先攒着、这一枪之后补发"，
/// 攒的地方就在这个函数里。
///
/// ⚠️ 明确**不要**再把它当"重放插件 UI 注册"的钩子——那件事已经不需要了。
#[tauri::command]
fn nota_frontend_ready(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app;
    Ok(())
}
