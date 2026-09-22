//! 插件相关命令。

use mlua::LuaSerdeExt;
use tauri::State;

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
#[tauri::command]
pub fn nota_plugin_call(
    state: State<'_, AppState>,
    plugin: String,
    command: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    let host = state.plugins.lock().unwrap();

    let plugin = host
        .get(&plugin)
        .ok_or_else(|| NotaError::other(format!("没有这个插件：{plugin}")))?;

    // 先把 JSON 转成 Lua 值。这一步在插件自己的 Lua 状态上做，
    // 因为 mlua 的 `to_value` 需要那个状态的分配器。
    let lua_args = match args {
        Some(v) => plugin
            .lua
            .to_value(&v)
            .map_err(|e| NotaError::other(format!("参数转 Lua 失败：{e}")))?,
        None => mlua::Value::Nil,
    };

    let result = host.call_command(&plugin.manifest.meta.id, &command, lua_args)?;

    plugin
        .lua
        .from_value::<serde_json::Value>(result)
        .map_err(|e| NotaError::other(format!("返回值转 JSON 失败：{e}")))
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
