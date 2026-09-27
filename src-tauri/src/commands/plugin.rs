//! 插件相关命令。

use mlua::LuaSerdeExt;
use tauri::{Manager, State};

use crate::error::{NotaError, Result};
use crate::plugin::{PluginInfo, PluginMenuItem, PluginPanel, ReviewState};
use crate::state::AppState;

/// 列出所有插件（含加载失败的，界面上要标红）。
#[tauri::command]
pub fn nota_plugins_list(state: State<'_, AppState>) -> Result<Vec<PluginInfo>> {
    let host = state.plugins.lock().unwrap();
    Ok(host.list_info())
}

/// 启用 / 停用一个插件。
///
/// ⚠️ 为什么是 `async` + `spawn_blocking`（2026-09-25 改的）：启用和停用现在都是
/// **真的装卸**——会跑插件的 `on_load` / `on_unload`，而那里面可能有 git 子进程、
/// HTTP 请求（见 `plugin::PluginHost::set_enabled`）。留在主线程上就是冻界面，
/// 理由与 `nota_plugin_call` 那条一模一样。
///
/// ⚠️ 两个方向都**落盘**（`$XDG_CONFIG_HOME/nota/plugins.toml`），所以重启之后
/// 用户关掉的那个插件不会自己回来。
#[tauri::command]
pub async fn nota_plugin_set_enabled(
    app: tauri::AppHandle,
    id: String,
    enabled: bool,
) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut host = state.plugins.lock().unwrap();
        host.set_enabled(&id, enabled)
    })
    .await
    .map_err(|e| NotaError::other(format!("插件启用/停用的执行线程挂了：{e}")))?
}

/// 从一个插件包（`.nota-plugin` / `.zip`）或目录装一个插件。返回它的 id。
///
/// ⚠️ `path` 由前端用文件对话框问出来（`@tauri-apps/plugin-dialog` 的 `open`），
/// 宿主**不自己弹框**：那是界面的事，而且宿主弹框在无头测试里没法验。
///
/// ⚠️ "未知签名者"**不是**拒装的理由（`plugin::PluginHost::装` 里写明为什么）：
/// 装上、标出来、给一颗「信任」（`nota_plugin_trust`）就完了。硬拒只有
/// "有签名但验不过"那一条。
///
/// ⚠️ 同样 `async` + `spawn_blocking`：装完会**当场加载**这个插件（跑 `on_load`）。
#[tauri::command]
pub async fn nota_plugin_install(app: tauri::AppHandle, path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut host = state.plugins.lock().unwrap();
        host.装(std::path::Path::new(&path))
    })
    .await
    .map_err(|e| NotaError::other(format!("安装插件的执行线程挂了：{e}")))?
}

/// 卸掉一个插件：**磁盘上删掉、内存里拿掉、账本上忘掉**。
/// 内置插件卸不掉（只能停用），见 `plugin::PluginHost::卸`。
///
/// ⚠️ 这套动作**不可逆**（插件目录真的没了），前端必须先问一句。
#[tauri::command]
pub async fn nota_plugin_uninstall(app: tauri::AppHandle, id: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut host = state.plugins.lock().unwrap();
        host.卸(&id)
    })
    .await
    .map_err(|e| NotaError::other(format!("卸载插件的执行线程挂了：{e}")))?
}

/// 信任一个插件的签名者（TOFU + 显式信任）。见 `plugin::PluginHost::信`。
#[tauri::command]
pub fn nota_plugin_trust(state: State<'_, AppState>, id: String) -> Result<()> {
    let mut host = state.plugins.lock().unwrap();
    host.信(&id)
}

/// 信任库里现在有哪几把钥匙。
#[tauri::command]
pub fn nota_plugin_trust_list(state: State<'_, AppState>) -> Result<Vec<crate::plugin::信任记录>> {
    let host = state.plugins.lock().unwrap();
    Ok(host.信任表())
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
///
/// ⚠️ 返回前会过一遍 `填_frame`：插件在自己的 `render` 里放一块
/// `kind = "frame"` 就能嵌自己那场开发服务器，而**地址是这里填的**
/// （插件交不出地址来，见 `lua/api/devserver.rs`）。这一步必须在
/// **plugins 锁放掉之后**做：它要去读 devserver 那把锁，抱着 plugins 去拿
/// 只是多占一会儿，但"锁该拿多久就拿多久"这件事在这里很容易被后人抄坏。
#[tauri::command]
pub async fn nota_plugin_panel_content(
    app: tauri::AppHandle,
    plugin: String,
    id: String,
) -> Result<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value> {
        let state = app.state::<AppState>();
        let mut 内容 = {
            let host = state.plugins.lock().unwrap();
            host.panel_content(&plugin, &id)?
        };
        crate::lua::api::devserver::填_frame(&app, &plugin, &mut 内容);
        Ok(内容)
    })
    .await
    .map_err(|e| NotaError::other(format!("面板渲染的执行线程挂了：{e}")))?
}

/// 编辑区里此刻摊着哪一格（`nota.ui.review` / `nota.ui.review_diff` 放进去的）。
///
/// ⚠️ 属"声明 / 状态"，所以**前端挂载后主动拉一次**，事件（`nota:plugin-review`）
/// 只是"变了，再拉一次"的提示——与 `nota_plugin_panels` 同一条规矩（BUG-13）。
///
/// ⚠️ 只回 `{plugin, kind, ...}`，**面板形态不回标题**：标题在前端手里
/// （它本来就要拉 `nota_plugin_panels` 建右侧面板，按 id 一查就有）。在这里
/// 回标题就得为了一个字符串再去拿 `plugins` 锁——多出来的那次取锁不值。
///
/// ⚠️ **改动预览那一形态的标题是回的**（它不在 `panels` 里，前端查不到）——
/// 那一格自带 `title`，见 `plugin::ReviewKind::Diff`。
///
/// ⚠️ 这一格**不在** `AppState` 里，是单独 `manage` 的（见 `lib.rs`）：
/// 它不是"文档 / 设置"那一路的状态，而是"此刻界面上摊着什么"。
/// 拿它不需要、也不该碰 `plugins` 锁——插件正在跑的时候（宿主握着那把锁）
/// 「回到正文」这个按钮还得能用。
#[tauri::command]
pub fn nota_plugin_review(review: State<'_, ReviewState>) -> Result<Option<PluginReview>> {
    Ok(review
        .current()
        .map(|(plugin, kind)| PluginReview { plugin, kind }))
}

/// 收起编辑区里那一块。**用户可以点「回到正文」/「收起」**——那一下不该绕道
/// 插件（插件可能已经卡住、或者根本没提供"关掉"的命令）。
///
/// ⚠️ **两种形态都收**：这一格是"编辑区里摊着什么"，不是"哪种预览"。
/// 让前端按形态去挑一条命令收，等于把宿主那一格的形状泄漏到界面层。
///
/// ⚠️ 收起来之后事件照发：前端据此把主区切回编辑区，别的窗口（如果以后有）
/// 也能跟上。
#[tauri::command]
pub fn nota_plugin_review_close(app: tauri::AppHandle, plugin: String) -> Result<()> {
    use tauri::Emitter;
    app.state::<ReviewState>().set(&plugin, None);
    app.emit(crate::plugin::EVENT_REVIEW, serde_json::json!({}))
        .map_err(|e| NotaError::other(format!("发预览事件失败：{e}")))?;
    Ok(())
}

/// 编辑区里摊着的那一格：哪个插件 + 那一格是什么。
///
/// ⚠️ `kind` 由 [`ReviewKind`] 自己带出来（`#[serde(flatten)]`）：形态是它的
/// 属性，不是这里另加的一栏——另加一栏就有了两处"形态"的说法，迟早对不齐。
#[derive(serde::Serialize)]
pub struct PluginReview {
    pub plugin: String,
    #[serde(flatten)]
    pub kind: crate::plugin::ReviewKind,
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
