//! 插件宿主：**发现 → 加载 → 派发 → 卸载**。
//!
//! # 目录与去重
//!
//! 扫两类目录（`paths::builtin_plugins_dirs` + `paths::user_plugins_dir`），
//! 按**清单里的 `id`** 去重，**用户装的覆盖内置的**。
//!
//! 为什么按 id 而不是按目录名：目录名是文件系统的事，用户可以随便改；
//! `id` 是清单里声明的、插件之间互相引用的名字。用目录名去重会出现
//! "改个文件夹名就多出一份插件"这种事。
//!
//! # 一个插件坏掉不能拖垮启动
//!
//! `LuaPlugin::load` **不返回 `Err`**，坏掉的插件留下一条 `Failed(原因)` 记录，
//! 界面上照常列出并标红。理由很实在：插件是用户自己装的第三方代码，
//! 让一个写错的 Lua 脚本变成"应用打不开"，用户连去禁用它的界面都进不去。

pub mod manifest;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use mlua::Lua;
use serde::Serialize;

use crate::error::{NotaError, Result};
use crate::lua::{HostContext, LuaPlugin, PluginState};
use manifest::{find_manifests, Manifest};

/// 给前端看的插件信息。**只读快照**，不含 `Lua`。
#[derive(Debug, Clone, Serialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub authors: Vec<String>,
    pub license: String,
    pub capabilities: Vec<String>,
    pub entry: String,
    pub dir: String,
    /// `loaded` / `failed` / `disabled`
    pub state: String,
    /// `state == "failed"` 时的原因。
    pub error: Option<String>,
}

/// 插件声明的面板。前端**拉**这个，不是等事件推。理由见下面 `panels()`。
#[derive(Debug, Clone, Serialize)]
pub struct PluginPanel {
    pub plugin: String,
    pub id: String,
    pub title: String,
    pub icon: Option<String>,
    /// `right`（右侧插件栏，**默认**）/ `left`（左侧栏）。
    /// 认不出的值由前端当地址用，宿主不拦——它只是根字符串。
    pub location: String,
}

/// 插件声明的菜单项。同上，是**拉**的。
#[derive(Debug, Clone, Serialize)]
pub struct PluginMenuItem {
    pub plugin: String,
    pub label: String,
    /// 点下去要调的**命令名**。前端拿去配 `nota_plugin_call(plugin, command)`。
    pub command: String,
    /// 挂在哪个菜单下（`plugins` / `file` / `format` …）。
    pub menu: String,
    pub accelerator: Option<String>,
    /// 点之前先问一句？`None` = 直接跑。
    pub prompt: Option<PluginPrompt>,
}

/// 一条「点之前先问一句」的声明。
///
/// ⚠️ **两份实现，字段名必须一样。** 菜单项那一份在这里读（registry 里存的是
/// 一张原表，见 `读提示`）；面板按钮那一份在**前端**收形状
/// （`ui/panel-nodes.ts::提示`）——因为面板内容走的是 `剥成_json`，
/// 那边只保证"是 JSON、有上限"，不认形状。两条路最后都汇进
/// `ui/plugin-prompt.ts::问参数`，所以字段名、默认值不一致的话，
/// 同一个 `prompt` 写在菜单里和写在面板上会是两种表现。
#[derive(Debug, Clone, Serialize)]
pub struct PluginPrompt {
    /// 用户填的值放进 `args` 的哪个键。**没有它这条声明就没用**（问了也送不出去）。
    pub arg: String,
    pub label: String,
    pub placeholder: String,
    pub hint: String,
    /// 输入框画成密码框（API key 那种不该被人从肩膀上看到的）。
    /// ⚠️ 遮的只是**屏幕**，值本身原样存进插件设置文件（明文）。
    pub secret: bool,
}

/// 面板 / 菜单的 registry 名。**只此一处定义。**
///
/// 写的一侧（`lua/api/ui.rs`）和读的一侧（本文件的 `panels()` / `menus()`）
/// 必须说同一个字符串。拆成两处字面量就是又造一对"两处相乘"——
/// 改一处忘一处，症状是界面永远空着且不报错（BUG-13 就是这个形状）。
pub const REG_PANELS: &str = "nota_panels";
pub const REG_MENUS: &str = "nota_menus";

/// 「某个面板的内容变了，去重拉」那条事件的频道名。
///
/// ⚠️ 发射侧在 `lua/api/ui.rs::刷新表`，收侧在 `ipc.ts` 的 `events.pluginPanel`
/// **加 `ui/PluginDock.tsx` 的订阅**。三处必须说同一个字符串，所以它只在这里定一次。
/// 与 `REG_PANELS` 同一个理由：拆成两处字面量就是又造一对"改一处忘一处"。
///
/// ⚠️ 与面板**清单**不同，这条**是事件**（BUG-13 的判据）：
/// 它报的是"此刻变了"这个动作，不是"有哪些面板"那份状态。
pub const EVENT_PANEL_DIRTY: &str = "nota:plugin-panel";

pub struct PluginHost {
    plugins: Vec<LuaPlugin>,
    /// 被用户禁用的插件 id。禁用**不卸载**——只是不派发命令给它，
    /// 这样重新启用时不用重跑一遍 `on_load`（有些插件的 on_load 有副作用）。
    disabled: HashSet<String>,
}

impl PluginHost {
    /// 扫目录、加载全部插件。
    ///
    /// `resource_dir` 是打包后的资源目录（开发时传 `None`）。
    pub fn discover(resource_dir: Option<PathBuf>, base: &HostContext) -> Self {
        let mut seen: HashSet<String> = HashSet::new();
        // 事件通道名 → 已经占了它的那个插件 id。见下面的撞名一节。
        let mut channels: HashMap<String, String> = HashMap::new();
        let mut plugins: Vec<LuaPlugin> = Vec::new();
        let mut errors: Vec<String> = Vec::new();

        // 用户目录**先扫**：先到的进 `seen`，后到的内置同名插件会被跳过，
        // 于是"用户覆盖内置"是这条循环顺序自然的结果，不用额外判。
        let mut roots = vec![crate::paths::user_plugins_dir().unwrap_or_default()];
        roots.extend(crate::paths::builtin_plugins_dirs(resource_dir.as_deref()));

        for root in roots {
            if !root.is_dir() {
                continue;
            }
            for manifest_path in find_manifests(&root) {
                let manifest = match Manifest::load(&manifest_path) {
                    Ok(m) => m,
                    Err(e) => {
                        // 清单都读不了的插件，连 id 都不知道，只好单独记一笔。
                        errors.push(format!("{}：{e}", manifest_path.display()));
                        continue;
                    }
                };

                if !seen.insert(manifest.meta.id.clone()) {
                    continue; // 同名插件，前面那个（用户的）优先
                }

                // ── 事件通道撞名 ─────────────────────────────────────────
                // id 里的 `.` 在通道名里归一成 `-`（见 `manifest::channel_id`），
                // 所以 `nota.git` 与 `nota-git` 这两个**都合法**的 id 会占同一个通道。
                // 撞了事件就分不清是谁发的，而且是"多发一条事件"这种最难查的症状，
                // 所以这里直接拒掉后到的那个，把话说在当面。
                //
                // ⚠️ 只有 `.` 这一类**不合法字符**会被换掉；`-` 与 `_` 本来就在
                // Tauri 事件名的允许集合里，`channel_id` 原样保留（有用例钉着）。
                // 所以官方的 `nota_git` 与 `nota-git` **不撞**——早期的错误信息写成
                // "`.` 与 `_` 都写作 `-`"，那是错的，2026-09-22 核对用例后改掉。
                let channel = manifest::channel_id(&manifest.meta.id);
                if let Some(holder) = channels.insert(channel.clone(), manifest.meta.id.clone()) {
                    let reason = format!(
                        "事件通道 `plugin:{channel}:…` 已被 `{holder}` 占用：\
                         插件 id 里的 `.` 在事件名里写作 `-`，换一个 id"
                    );
                    errors.push(format!("{}：{reason}", manifest.meta.id));
                    plugins.push(LuaPlugin::rejected(manifest, reason));
                    continue;
                }

                let ctx = HostContext {
                    plugin_id: manifest.meta.id.clone(),
                    ..base.clone()
                };
                plugins.push(LuaPlugin::load(manifest, ctx));
            }
        }

        for e in errors {
            eprintln!("[nota] 插件清单读不了：{e}");
        }

        // 排序：先按 id，稳定的顺序让界面上列表不跳。
        plugins.sort_by(|a, b| a.manifest.meta.id.cmp(&b.manifest.meta.id));

        Self {
            plugins,
            disabled: HashSet::new(),
        }
    }

    pub fn list_info(&self) -> Vec<PluginInfo> {
        self.plugins
            .iter()
            .map(|p| {
                let m = &p.manifest.meta;
                let disabled = self.disabled.contains(&m.id);
                let (state, error) = match (&p.state, disabled) {
                    (_, true) => ("disabled", None),
                    (PluginState::Loaded, _) => ("loaded", None),
                    (PluginState::Disabled, _) => ("disabled", None),
                    (PluginState::Failed(e), _) => ("failed", Some(e.clone())),
                };

                PluginInfo {
                    id: m.id.clone(),
                    name: m.name.clone(),
                    version: m.version.clone(),
                    description: m.description.clone(),
                    authors: m.authors.clone(),
                    license: m.license.clone(),
                    capabilities: m.capabilities.clone(),
                    entry: m.entry.clone(),
                    dir: p.manifest.dir.display().to_string(),
                    state: state.to_owned(),
                    error,
                }
            })
            .collect()
    }

    pub fn get(&self, id: &str) -> Option<&LuaPlugin> {
        self.plugins.iter().find(|p| p.manifest.meta.id == id)
    }

    pub fn is_enabled(&self, id: &str) -> bool {
        !self.disabled.contains(id)
    }

    /// 启用/禁用。禁用后命令不再派发过去，但 Lua 状态留着。
    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<()> {
        if self.get(id).is_none() {
            return Err(NotaError::other(format!("没有这个插件：{id}")));
        }
        if enabled {
            self.disabled.remove(id);
        } else {
            self.disabled.insert(id.to_owned());
        }
        Ok(())
    }

    /// 取一个**现在能跑代码**的插件，取不到就说清楚为什么。
    ///
    /// ⚠️ 抽出来的理由是"两处相乘"：派发命令和取面板内容都要过同一道闸
    /// （存在 / 加载成功 / 没被禁用），各写一遍的话，改一处忘一处就会出现
    /// "禁用了还能拉面板"或"加载失败的命令还能搜到"这种半生效状态。
    fn 可调用的(&self, plugin_id: &str) -> Result<&LuaPlugin> {
        let plugin = self
            .get(plugin_id)
            .ok_or_else(|| NotaError::other(format!("没有这个插件：{plugin_id}")))?;

        match &plugin.state {
            // 用户禁用**先于**加载状态判：禁用是用户的显式动作，
            // 说"已被禁用"比说"加载失败"更接近用户看到的事实。
            _ if self.disabled.contains(plugin_id) => {
                Err(NotaError::other(format!("插件 {plugin_id} 已被禁用")))
            }
            PluginState::Loaded => Ok(plugin),
            PluginState::Failed(e) => Err(NotaError::other(format!(
                "插件 {plugin_id} 加载失败，无法执行命令：{e}"
            ))),
            PluginState::Disabled => Err(NotaError::other(format!("插件 {plugin_id} 已被禁用"))),
        }
    }

    /// 派发一个命令到某个插件。
    pub fn call_command(
        &self,
        plugin_id: &str,
        command: &str,
        args: mlua::Value,
    ) -> Result<mlua::Value> {
        self.可调用的(plugin_id)?.call_command(command, args)
    }

    /// 现调一个面板的 `render`，拿到它此刻的内容。
    ///
    /// ⚠️ 这是**拉**（`docs/12` §面板内容）：面板清单只有一份、启动时定；
    /// 内容是"现在长什么样"，每次打开/被 `nota.ui.refresh` 提醒时现取。
    /// ⚠️ 它**会跑插件的 Lua**，所以调用方必须把它放到阻塞线程上去
    /// （`commands/plugin.rs` 里那条 `spawn_blocking`）——`render` 里
    /// 常常要起 git 子进程，跑在主线程上就是冻界面。
    pub fn panel_content(&self, plugin_id: &str, panel_id: &str) -> Result<serde_json::Value> {
        let plugin = self.可调用的(plugin_id)?;
        crate::lua::api::ui::面板内容(&plugin.lua, plugin_id, panel_id)
    }

    /// 正在生效的插件：**加载成功** 且 **用户没禁用**。
    ///
    /// 命令、面板、菜单三处都按这一条筛。抽出来是因为这三处**必须同一套判据**——
    /// 各自写一遍 `is_loaded() && is_enabled()`，改一处忘一处就会出现
    /// "禁用了还列在面板里"或"加载失败的命令还能搜到"这种半生效状态。
    fn 生效的(&self) -> impl Iterator<Item = &LuaPlugin> {
        self.plugins
            .iter()
            .filter(|p| p.is_loaded() && self.is_enabled(&p.manifest.meta.id))
    }

    /// 找一个命令是哪个插件注册的。
    ///
    /// 本轮先做**第一个匹配**。真出现两个插件抢同一个命令名时再说——
    /// 与其现在造一套优先级规则没人用，不如等真有需求时按那时的实际情况定。
    pub fn find_command_owner(&self, command: &str) -> Option<&str> {
        self.生效的()
            .find(|p| {
                p.lua
                    .named_registry_value::<mlua::Table>("nota_commands")
                    .map(|t| t.contains_key(command).unwrap_or(false))
                    .unwrap_or(false)
            })
            .map(|p| p.manifest.meta.id.as_str())
    }

    /// 所有生效插件声明的面板。
    ///
    /// # ⚠️ 为什么是**拉**，不是事件推（BUG-13）
    ///
    /// `nota.ui.register_panel` 在**插件加载时**跑（`setup()` 阶段），
    /// 而前端的 `listen()` 是在**挂载之后**才注册的。推的话必漏，
    /// 而且漏得**安静**：Tauri 对没有监听者的频道 emit 是成功的，
    /// 日志里一点痕迹都没有，界面看着好好的，只是面板永远不出现。
    ///
    /// 早先的打算是"当场发 + 记账 + 前端起来后 `nota_frontend_ready` 重放"
    /// （见 `lib.rs` 那段注释的旧版）。**那个打算是错的**，不是没做完：
    /// 它把面板清单变成**两个真相源**（前端的事件账本、插件自己的注册表），
    /// 重放漏一次或前端不是幂等的，两边就静默分叉——还是同一个病。
    ///
    /// 正确的判据很短：**声明是状态 → 拉；发生是事件 → 推。**
    /// 面板/菜单/命令都是"插件在启动时声明了一次、之后一直成立"的东西，
    /// 所以它们进 registry、宿主按需拉；`nota:notify` 那种"此刻发生了"的才推。
    /// 仓库里 `nota_commands` 一直是这个范式，面板和菜单照抄它就没有赛跑了。
    pub fn panels(&self) -> Vec<PluginPanel> {
        self.生效的()
            .flat_map(|p| 读面板(&p.lua, &p.manifest.meta.id))
            .collect()
    }

    /// 所有生效插件声明的菜单项。范式同 `panels()`。
    pub fn menus(&self) -> Vec<PluginMenuItem> {
        self.生效的()
            .flat_map(|p| 读菜单(&p.lua, &p.manifest.meta.id))
            .collect()
    }

    pub fn count(&self) -> usize {
        self.plugins.len()
    }

    /// 卸载全部（退出时调），给每个插件一次 `on_unload`。
    pub fn unload_all(&mut self) {
        for p in &self.plugins {
            p.unload();
        }
    }
}

/// 从一个 Lua 状态里读出声明的**面板**。
///
/// 剥成纯函数（不收 `&LuaPlugin`）是为了能被用例钉住：BUG-13 的病灶正是
/// **写的一侧和读的一侧对不上**，而 `LuaPlugin` 要先 `load`（要真的 `AppHandle`）
/// 才拿得到。给 `Lua` 就够——写入侧 `lua/api/ui.rs::面板表` 也只收 `Lua`。
pub(crate) fn 读面板(lua: &Lua, plugin_id: &str) -> Vec<PluginPanel> {
    声明的(lua, REG_PANELS)
        .into_iter()
        .map(|s| PluginPanel {
            plugin: plugin_id.to_owned(),
            id: s.get("id").unwrap_or_default(),
            title: s.get("title").unwrap_or_default(),
            icon: s.get("icon").ok(),
            // 默认 `right`。写入侧已经补过一次默认值，这里是**兜底**：
            // 万一将来有人绕过 `register_panel` 直接往 registry 里塞东西。
            // 两处默认值必须一致——不一致就是最难受的那种 bug（看路径决定行为）。
            location: s.get("location").unwrap_or_else(|_| "right".to_owned()),
        })
        .collect()
}

/// 从一个 Lua 状态里读出声明的**菜单项**。理由同 `读面板`。
pub(crate) fn 读菜单(lua: &Lua, plugin_id: &str) -> Vec<PluginMenuItem> {
    声明的(lua, REG_MENUS)
        .into_iter()
        .map(|s| PluginMenuItem {
            plugin: plugin_id.to_owned(),
            label: s.get("label").unwrap_or_default(),
            command: s.get("command").unwrap_or_default(),
            menu: s.get("menu").unwrap_or_else(|_| "plugins".to_owned()),
            accelerator: s.get("accelerator").ok(),
            // 形状**在这一侧收**（写入侧 `菜单表` 原样存）——和 `读面板` 补默认值
            // 是同一个分工：注册函数只负责收下来，读的时候才归一。
            prompt: s.get::<mlua::Table>("prompt").ok().and_then(|p| 读提示(&p)),
        })
        .collect()
}

/// 读一条 `prompt` 声明。**没有 `arg` 就当没写**。
///
/// 没有 `arg` 的话用户填的值没有地方放——问了也送不出去。那时**宁可不问**：
/// 弹一个"填完什么都不会发生"的框，比这条菜单项直接跑掉更让人摸不着头脑。
/// （前端的 `ui/panel-nodes.ts::提示` 是同一条判据，两个地方都得有。）
fn 读提示(t: &mlua::Table) -> Option<PluginPrompt> {
    let arg: String = t.get("arg").ok()?;
    if arg.is_empty() {
        return None;
    }
    Some(PluginPrompt {
        arg,
        label: t
            .get::<String>("label")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "请输入".to_owned()),
        placeholder: t.get::<String>("placeholder").unwrap_or_default(),
        hint: t.get::<String>("hint").unwrap_or_default(),
        secret: t.get::<bool>("secret").unwrap_or(false),
    })
}

/// 读一个 `Lua` 在 `reg` 名下声明的条目（面板 / 菜单）。
///
/// **静默返回空表**：插件没申请那个能力、或 `on_load` 半路失败了，registry 里
/// 就是没有这个键。这不是异常，是正常状态——一个插件可以不声明任何面板。
/// 报错反而会让"装了但不带 UI 的插件"看起来像坏了。
fn 声明的(lua: &Lua, reg: &str) -> Vec<mlua::Table> {
    let Ok(list) = lua.named_registry_value::<mlua::Table>(reg) else {
        return Vec::new();
    };
    (1..=list.raw_len())
        .filter_map(|i| list.raw_get::<mlua::Table>(i).ok())
        .collect()
}
