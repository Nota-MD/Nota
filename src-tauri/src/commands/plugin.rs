//! 插件相关命令。

use mlua::LuaSerdeExt;
use tauri::{Manager, State};

use crate::error::{NotaError, Result};
use crate::plugin::{PluginInfo, PluginMenuItem, PluginPanel};
use crate::state::AppState;

/// 列出所有插件（含加载失败的，界面上要标红）。
#[tauri::command]
pub fn nota_plugins_list(state: State<'_, AppState>) -> Result<Vec<PluginInfo>> {
    let host = state.plugins.lock().unwrap();
    Ok(host.list_info())
}

/// 启用 / 禁用。
#[tauri::command]
pub fn nota_plugin_set_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<()> {
    let mut host = state.plugins.lock().unwrap();
    host.set_enabled(&id, enabled)
}

/// 调一个插件注册的命令。
///
/// # 为什么参数与返回值直接走 JSON 而不是自定义类型
///
/// 命令的入参出参**由插件自己决定**，宿主不该、也不可能为它们定形。
/// JSON 是这条边界上唯一不需要两边都改的公共语言：Lua 表 ↔ JSON 的转换在
/// `mlua` 的 serde 支持里现成，前端本来也只会说 JSON。
///
/// ⚠️ 前端调这个命令时**必须**走 `nota_plugin_call(owner, name, args)` 的形式，
/// 而 `owner` 从 `nota_plugin_menus` 的返回里带过来（菜单项自带 `plugin` 字段）。
/// **不要让前端凭命令名去猜是哪个插件的**——两个插件重名时猜错就是静默跑到别人家里。
///
/// # ⚠️ 为什么是 `async` + `spawn_blocking`
///
/// Tauri 的**同步**命令跑在主线程上。插件的 Lua 会做两件很慢的事：
/// 起 `git` 子进程、发 HTTP 请求（超时按秒算）。跑在主线程上就是**冻界面**——
/// 窗口不重绘、按钮不响应，看起来就是"卡死了"。所以整段挪到阻塞线程池上。
///
/// mlua 开着 `send` feature（`Cargo.toml`），`Lua` 是 `Send + Sync` 的，
/// 这才搬得动。⚠️ 搬出去之后**锁的语义没变**：仍旧是"跑这个插件的代码时
/// 一直握着 `plugins` 锁"，所以 `docs/03` 的锁序不变量照旧成立。
#[tauri::command]
pub async fn nota_plugin_call(
    app: tauri::AppHandle,
    plugin: String,
    command: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let host = state.plugins.lock().unwrap();

        let plug = host
            .get(&plugin)
            .ok_or_else(|| NotaError::other(format!("没有这个插件：{plugin}")))?;

        // 先把 JSON 转成 Lua 值。这一步在插件自己的 Lua 状态上做，
        // 因为 mlua 的 `to_value` 需要那个状态的分配器。
        let lua_args = match args {
            Some(v) => plug
                .lua
                .to_value(&v)
                .map_err(|e| NotaError::other(format!("参数转 Lua 失败：{e}")))?,
            None => mlua::Value::Nil,
        };

        let result = host.call_command(&plug.manifest.meta.id, &command, lua_args)?;

        plug.lua
            .from_value::<serde_json::Value>(result)
            .map_err(|e| NotaError::other(format!("返回值转 JSON 失败：{e}")))
    })
    .await
    .map_err(|e| NotaError::other(format!("插件命令的执行线程挂了：{e}")))?
}

/// 一个面板**此刻**的内容。
///
/// ⚠️ 与 `nota_plugin_panels`（清单，启动时拉一次）**不是一回事**：
/// 这条现调插件的 `render`，拿到的是"现在长什么样"。前端在**打开面板时**
/// 以及**收到 `nota:plugin-panel`**（插件喊了声 `nota.ui.refresh`）时调它。
/// 判据见 `plugin/mod.rs::panel_content` 与 `docs/12` §面板内容。
///
/// ⚠️ 同样 `async` + `spawn_blocking`：`render` 里常常要起 git 子进程。
#[tauri::command]
pub async fn nota_plugin_panel_content(
    app: tauri::AppHandle,
    plugin: String,
    id: String,
) -> Result<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let host = state.plugins.lock().unwrap();
        host.panel_content(&plugin, &id)
    })
    .await
    .map_err(|e| NotaError::other(format!("面板渲染的执行线程挂了：{e}")))?
}

/// 某个命令是哪个插件注册的。前端收到菜单事件后可以用它对账。
#[tauri::command]
pub fn nota_plugin_find_command(state: State<'_, AppState>, command: String) -> Result<Option<String>> {
    let host = state.plugins.lock().unwrap();
    Ok(host.find_command_owner(&command).map(str::to_owned))
}

/// 插件声明的面板。**前端挂载后主动拉一次。**
///
/// ⚠️ 别改成"等事件推"——注册发生在插件加载时（启动阶段），比前端挂载早，
/// 推必漏且静默。见 `plugin/mod.rs::panels` 与 BUG-13。
#[tauri::command]
pub fn nota_plugin_panels(state: State<'_, AppState>) -> Result<Vec<PluginPanel>> {
    let host = state.plugins.lock().unwrap();
    Ok(host.panels())
}

/// 插件声明的菜单项。范式同 `nota_plugin_panels`。
///
/// 目前**前端还没有菜单栏来接**（`docs/07` 第 40 项），所以这条暂时没有调用者。
/// 留着是刻意的：写入侧已经按最终形态落好了，菜单栏一做就是接上这一根线，
/// 不用回头再改一遍 `ui.rs`。
#[tauri::command]
pub fn nota_plugin_menus(state: State<'_, AppState>) -> Result<Vec<PluginMenuItem>> {
    let host = state.plugins.lock().unwrap();
    Ok(host.menus())
}
