//! Nota 宿主库。
//!
//! 启动顺序是**有讲究的**（下面 `run()` 里每一步都注了为什么）：
//!
//! 1. 读设置（读不出来就回默认值并记一笔，**不让应用打不开**）；
//! 2. 探插件目录、加载插件——**必须在 Tauri 起来之后**，因为插件的 `nota.ui.*`
//!    要发事件给前端，而那需要 `AppHandle`；
//! 3. 组装 `AppState` 交给 Tauri 托管。
//!
//! ⚠️ Slidev 预览那套状态**不塞进 `AppState`**：管的是**一个子进程的生死**，
//! 与文档/设置/插件都无关（2026-09-23）。单独 `manage` 一份，见 `slidev.rs`。
//!
//! ⚠️ 那一步"窗口显示后把插件的菜单/面板补发给前端"**已经取消**（BUG-13）：
//! 声明改走 registry **拉**（`nota_plugin_panels` / `nota_plugin_menus`），
//! 不经事件，所以不存在赛跑。`nota_frontend_ready` 只剩"前端能收事件了"这一个含义。

pub mod commands;
pub mod document;
pub mod error;
pub mod lua;
pub mod native_menu;
pub mod paths;
pub mod plugin;
pub mod settings;
pub mod slidev;
pub mod slidev_probe;
pub mod state;
pub mod themes;

use std::sync::{Arc, Mutex};

use lua::HostContext;
use plugin::PluginHost;
use settings::Settings;
use state::AppState;
use tauri::{Emitter, Manager};

/// Linux 上给 WebKitGTK 关掉 DMABUF 渲染器。**这是绕开崩溃，不是性能优化。**
///
/// # 症状（2026-09-24 实测）
///
/// 在容器里接**真显示器**跑（`DISPLAY=:0`，不是无头 Xvfb）时：应用正常起来、
/// 窗口正常画出来、能用，但**一两分钟之后自己退出**——日志最后一行是
///
/// ```text
/// VM 0x7f28ee408000 on pid 139919 received NeedDebuggerBreak trap
/// ```
///
/// 退出码 **0**、没有 core 文件、`journalctl` 里没有段错误。实测两次：
/// 起后 **98 秒**、**165 秒**各死一次；第二次全程没有任何输入（没截图、
/// 没发按键，只每 15 秒看一眼进程），所以**不是"被操作搞崩的"**。
///
/// 判据是**换一个变量之后不再复现**：加上 `WEBKIT_DISABLE_DMABUF_RENDERER=1`
/// 起的第三份活过了前两次的死亡时刻（同一台机器、同一个二进制、同样只看着它）。
/// ⚠️ 「无头 Xvfb 那次活了很久」**不能**当成反证：那条路上本来就走不到
/// DMABUF（`docs/06` §5 那套配方还额外开着 `WEBKIT_DISABLE_COMPOSITING_MODE`）。
///
/// # 为什么写进代码而不是写进文档
///
/// "跑之前记得设这个环境变量"是一条**会丢**的知识：换个终端、换个 `.desktop`
/// 启动、从 IDE 里跑，都不认它。而这个崩溃的表现是"用着用着自己没了"，
/// 用户没法把它跟一个没设的环境变量联系起来。
///
/// ⚠️ **只兜底、不强制**：用户显式设过就一律听用户的（`=0` 能盖回来）。
/// 想验 DMABUF 那条路、或者以后 WebKit 修了想回去，都靠这一点。
/// ⚠️ **只管 Linux**：macOS 走 WKWebView、Windows 走 WebView2，都不经这条路。
fn 兜住_webkit_的_dmabuf_渲染器() {
    if !cfg!(target_os = "linux") {
        return;
    }
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        return;
    }
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    eprintln!(
        "[nota] 已关闭 WebKitGTK 的 DMABUF 渲染器（默认值，可用 \
         WEBKIT_DISABLE_DMABUF_RENDERER=0 覆盖）。理由见 lib.rs 里那段注释。"
    );
}

pub fn run() {
    兜住_webkit_的_dmabuf_渲染器();

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
            // ⚠️ **建仓时就把标题口径传进去**（严格模式）：标签页标题是文档仓
            // 自己从正文算的（`derive_title`），严格与宽松对「这一行算不算标题」
            // 看法不同。⚠️ 这一步 2026-09-24 之前是漏的——会传它的那个构造函数
            // 没人调用（见 `state.rs` 顶上那段），症状是"设置里写着严格、
            // 标签页却按宽松算"：不报错，只是名字不对。
            let documents = Arc::new(Mutex::new(document::DocumentStore::new(
                settings.strict_markdown,
            )));
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
            // Slidev 预览：**单独一份托管状态**，不往 `AppState` 里塞——
            // 它管的是一个子进程的生死，和"文档 / 设置 / 插件"那四把锁无关。
            app.manage(slidev::SlidevState::new());

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
            commands::export::nota_export_write,
            commands::export::nota_export_print,
            commands::workspace::nota_workspace_open,
            commands::workspace::nota_workspace_close,
            commands::workspace::nota_workspace_get,
            commands::workspace::nota_workspace_tree,
            commands::settings::nota_settings_get,
            commands::settings::nota_settings_set,
            commands::theme::nota_doc_themes,
            commands::theme::nota_doc_theme_css,
            commands::theme::nota_doc_themes_dir,
            commands::plugin::nota_plugins_list,
            commands::plugin::nota_plugin_set_enabled,
            commands::plugin::nota_plugin_call,
            commands::plugin::nota_plugin_find_command,
            commands::plugin::nota_plugin_panels,
            commands::plugin::nota_plugin_panel_content,
            commands::plugin::nota_plugin_menus,
            commands::slidev::nota_slidev_start,
            commands::slidev::nota_slidev_probe_install,
            commands::slidev::nota_slidev_probe,
            commands::slidev::nota_slidev_log,
            commands::slidev::nota_slidev_status,
            commands::slidev::nota_slidev_open_window,
            commands::slidev::nota_slidev_sync,
            commands::slidev::nota_slidev_stop,
            commands::menu::nota_native_menu_apply,
            nota_frontend_ready,
        ])
        // 原生菜单被点了（目前只有 macOS 会走到这里）。
        //
        // ⚠️ 这里**不执行任何命令**，只把 id 发回前端——执行的是前端那张
        // `menuHandlers`（`App.tsx`）。在 Rust 里再写一遍"哪个 id 干什么"，
        // 就又成了两个真相源；而且很多命令本来就得前端执行
        // （改 React 状态、动编辑器），Rust 这边根本没有对应的入口。
        .on_menu_event(|app, event| {
            let _ = app.emit("nota:native-menu", event.id().0.clone());
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // ⚠️⚠️ **必须按 label 分派**。2026-09-23 起这个应用会开第二个窗口
                // （Slidev 预览），而下面那段会把**所有**插件都卸掉——不加判据的话，
                // 关掉预览窗就等于把插件全关了，而且一点动静都没有（卸载只记日志）。
                match window.label() {
                    "main" => {
                        // 关窗前给插件一次 on_unload，让它们有机会落盘自己的状态。
                        if let Some(state) = window.try_state::<AppState>() {
                            if let Ok(mut host) = state.plugins.lock() {
                                host.unload_all();
                            }
                        }
                    }
                    "slidev" => {
                        // 预览窗被用户关了 → 服务器跟着收掉，再告诉前端"别勾着了"。
                        // ⚠️ 这条和 `nota_slidev_stop` 会互相触发（那边关窗 → 这里收服务器；
                        // 这边收完 → 前端置空），两边都做成幂等，重复走没有副作用。
                        if let Some(state) = window.try_state::<slidev::SlidevState>() {
                            slidev::stop(&state);
                        }
                        let _ = window.emit("nota:slidev-stopped", ());
                    }
                    _ => {}
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
