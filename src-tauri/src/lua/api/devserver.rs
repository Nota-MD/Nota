//! `nota.devserver` —— 插件起一个开发服务器，并把它的页面嵌进面板。
//!
//! # 这张表是**通用机制**，不是给某一个插件开的后门
//!
//! 2026-09-25 从 Slidev 里提出来的（见 `src/devserver.rs` 文件头）。判据很简单：
//! "预览当前文档"这件事**不只 Slidev 一家**——Marp、mdBook、VitePress、
//! 甚至一个自己写的静态站点生成器，要的都是同一套：挑端口、把当前文档写成入口、
//! 起进程、等它通、嵌进面板。**机制留宿主，命令与话术归插件。**
//!
//! # 能力放行的是"清单里那一条命令"
//!
//! `process.devserver` 放行的是 `plugin.toml` 的 `[devserver] cmd` 里写死的那条命令。
//! ⚠️ **本文件不收任何"要跑什么"的参数**——`start` 只收"哪份文档"。
//! Lua 这边交不出第二个程序名来，这是设计，不是还没做（同 `nota.git`）。
//!
//! # 拿到什么
//!
//! | 函数 | 干什么 | 会不会等 |
//! |---|---|---|
//! | `probe{root=, need=}` | 这台机器现在能不能跑（不联网、不起服务器） | **不等**：有现成结论就回，没有就回 `state = "checking"` 并在后台探 |
//! | `probe{root=, need=, force=true}` | 同上，但**当场等**这一次探测 | 最多 20 秒 |
//! | `start{doc=}` | 起服务器，**等到端口通** | 最多 180 秒 |
//! | `status()` | 现在这场会话（没在跑就是 `nil`） | 立刻 |
//! | `open_in_browser()` | 把**这场会话**的地址交给系统浏览器 | 立刻 |
//! | `log()` | 进程输出的最后 30 行 | 立刻 |
//! | `stop()` | 收摊（杀整棵进程树 + 删入口文件） | 立刻 |
//!
//! ⚠️ `probe` 的 `state` 因此有**四个**词：`checking` / `ready` / `missing` /
//! `unknown`。前一个不是结论，它只说"后台正在探"（探完宿主会发一条面板刷新
//! 事件，前端重拉那一页就有结论了）。理由见下面「探测缓存」那一节。
//!
//! # `need`：插件要问"这份文档还缺什么"
//!
//! `probe{need = "node_modules/@slidev/theme-default"}` 多问一件事：那个相对路径
//! 在项目根**或它的任一层父目录**里有没有（`need_found`，`nil` = 没问）。
//! 判据写在 `devserver::probe` 那边。
//!
//! ⚠️ **它必须是入参，不能写成清单里的配置**：同一个目录里两份文档可能要不同的
//! 主题包（`theme: seriph` 的文档与没写主题的文档要的不是同一个），而清单是
//! 每个插件一份、不看文档内容。写进清单就必然误判，**误判就等于这个面板不可信**
//!（2026-09-24 那条注释里写着同一条道理）。
//!
//! # ⚠️ `start` 会**阻塞**
//!
//! 它返回时端口一定已经通了，所以**不需要**"每 500ms 问一次通没通"那套轮询
//! （前身 `slidev.rs` 就是那么干的，因为当时它由一条**同步** Tauri 命令调着，
//! 在主线程上等就是冻界面）。现在这条路走的是插件命令
//! （`nota_plugin_call`），它本来就在 `spawn_blocking` 的线程池上，等得起。
//!
//! ⚠️ 代价是：**别在 `on_load` 里 `start`**。插件加载是同步走的，
//! 在那儿等 180 秒会把启动卡住。
//!
//! ⚠️ 还有一条：Lua 调用期间**整个 `plugins` 锁是被持有的**
//! （见 `plugin/mod.rs` 的 `call_command`）。所以 `start` 那 180 秒里，
//! 别的插件命令都得排队——包括用户点「停止」。这与 AI 插件发 30 秒 HTTP 请求
//! 时是同一件事，属于已知代价。
//!
//! # 面板里的画面：`kind = "frame"`
//!
//! 插件在自己的 `render` 里放一块
//!
//! ```lua
//! return { { kind = "frame", height = 520 } }
//! ```
//!
//! 宿主在把面板树交给前端之前，会把它补成 `{kind="frame", url=…, alive=…, port=…}`
//! ——**地址由宿主填，插件交不出来**。这是这一块和"让插件随便嵌网页"的分界：
//! `frame` 块永远只指向**发起它的那个插件自己**这场会话的地址，
//! 换个插件就换一场会话，指向别处是做不到的。见本文件 `填_frame()`。
//!
//! # `open_in_browser`：`frame` 之外的另一条出口，同一条归属判据
//!
//! 演示文稿最后是要**全屏讲**的：浏览器能全屏、能开演讲者视图（双屏，一屏给听众
//! 一屏给自己），嵌在面板里那个 iframe 两样都做不到。所以除了 `frame`，
//! 还得有一条"把这场预览交给浏览器"的路。
//!
//! ⚠️ 它**不收参数**，也就**不可能打开别的地址**：地址是 `devserver::status`
//! 里那个（宿主自己挑端口时拼的），插件连表达"我要打开 X"的机会都没有。
//! 这与 `ui.open_url` 是两条不同的门，别合并：
//! - `ui.open_url` 的边界是**协议**（只放行 `https://`）——它要去的是外站，
//!   判断依据是"这个 scheme 会不会捅出别的事"。
//! - `open_in_browser` 的边界是**归属**（只能是自己这场会话）——它要去的是
//!   `http://localhost:…`，而 `http://` 在 `ui.open_url` 那边是被**故意**
//!   挡住的（见那边文件里的注释）。
//!
//! 所以这里不需要 `ui.open_url` 能力：它申请的是 `process.devserver`，
//! 打开自己那场预览本来就是这件事的一部分。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use mlua::{Lua, Table, Value};
use tauri::{AppHandle, Manager};

use super::{lua_err, mlua_to_nota};
use crate::devserver::{self, DevServerState, Info, Probe, ProbeState};
use crate::document::DocId;
use crate::error::{NotaError, Result as NotaResult};
use crate::lua::HostContext;
use crate::plugin::manifest::{DevServerSpec, Manifest};

// ── 探测缓存：**面板渲染等不起一次 `npx`** ─────────────────────────────────
//
// 2026-09-26 补（`docs/07` BUG-36）。`devserver::probe` 是**同步**的：它要跑一次
// `npx --version`（实测正常 1.3 秒，自定义命令挂住时最多 20 秒）。而面板的
// `render` 是**同步拉**的——插件在渲染里现探一次，那一页在这几秒里就什么都画不
// 出来：没有转圈、没有一句「正在检查」，用户看到的是"点了页签没反应"。
// 2026-09-25 之前这件事是宿主自己干的、界面先画一张「检测中」；拆成插件
// （`plugins/slidev`）时那张画面弄丢了。
//
// ⚠️ **这不是"把 `probe` 改成异步"**：`start` 那条路要的是**此刻**的结论，
// 它必须等得起（插件命令本来就跑在 `spawn_blocking` 上，见 `docs/12`）。
// 所以是**两条路**：
//
// | 调用 | 谁在用 | 行为 |
// |---|---|---|
// | `probe{}` | 面板的 `render` | 有现成结论就回；没有就**开一次后台探测**、当场回 `state = "checking"` |
// | `probe{force=true}` | 起预览前、面板上那颗「重新检测」 | **当场等**，与这个方法本来的脾气一样 |
//
// 后台那次探完，宿主发一条**面板脏了**的事件（`plugin::EVENT_PANEL_DIRTY`，
// 事件名与载荷跟 `ui.rs::刷新表` 那条一模一样）——前端收到就重拉，那一页上
// 那句「正在检查…」于是换成结论。**这一枪由宿主发，插件不需要知道**：
// 它下次被拉的时候，结论已经在缓存里了。
//
// ⚠️ 缓存**不设过期时间**，口径与插件那边原来那条一样（"探过一次就一直用，
// 直到某个用户动作把它顶掉"）。理由也还是那一条：过期的结论**有路可走**
// （面板上那颗按钮），而"多久算久"订一个数只会多出一种界面状态。
pub struct ProbeCache(Mutex<HashMap<String, Slot>>);

/// 一个插件那一格。
struct Slot {
    /// 这份结论是在**哪个项目根**上算出来的。
    ///
    /// ⚠️ 根换了（用户切到别的目录里的文档）就当没有结论、重探一次：不重探的话，
    /// 面板上那句"可以打开预览"指的是**另一个目录**下的项目。
    root: Option<String>,
    /// 这次探的是**哪个额外的东西**（`probe{need=…}`，见 `devserver::probe`）。
    ///
    /// ⚠️ 它也得进键：同一个目录里两份文档可能要不同的主题包
    /// （`theme: seriph` 的文档和没写主题的文档要的不是同一个），
    /// 只按根作键的话，切一下文档就会看到**上一份文档的**结论。
    need: Option<String>,
    /// `None` = **正在探**（后台那次还没回来）。
    result: Option<Probe>,
}

/// [`ProbeCache::取或占位`] 的三种回答。
#[derive(Debug)]
enum Peek {
    /// 有现成结论。
    Ready(Probe),
    /// 这个根上**已经有一条探测在跑**——别再开一条。
    Running,
    /// 没结论、也没人在探：调用者去开一次。
    Go,
}

impl ProbeCache {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    /// 取现成结论，或者问出"该你去开一次探测"。
    ///
    /// ⚠️ 已经有**同根同 need** 的探测在跑时回 `Running`：面板在这儿几秒里会被拉
    /// 好几次（点一下、切个文档、插件自己喊一声「刷新」），每次都 `spawn` 一个
    /// `npx` 出来是白烧几百毫秒的 CPU，而且它们回来还会互相覆盖。
    fn 取或占位(&self, plugin: &str, root: &Option<String>, need: &Option<String>) -> Peek {
        let mut m = self.0.lock().unwrap();
        if let Some(slot) = m.get(plugin) {
            if slot.root == *root && slot.need == *need {
                return match &slot.result {
                    Some(p) => Peek::Ready(p.clone()),
                    None => Peek::Running,
                };
            }
        }
        // 没结论、或者根/need 换了：占个位（`result = None` = 正在探），让后面几次
        // 拉面板都看到"在探"而不是各开一条。
        m.insert(
            plugin.to_owned(),
            Slot {
                root: root.clone(),
                need: need.clone(),
                result: None,
            },
        );
        Peek::Go
    }

    /// 记下一条结论。**`force` 那条路和后台那条路都走这里。**
    ///
    /// ⚠️ **根或 need 对不上就丢掉**：后台那次可能是为**另一个目录／另一份文档
    /// 要的主题**算的（用户在这几秒里切了文档），而槽位已经被换过了。硬塞进去的话，
    /// 面板上会出现一句针对旧目录的结论——正是 `Slot::root` 要防的那件事的另一面。
    fn 收下(&self, plugin: &str, root: &Option<String>, need: &Option<String>, p: Probe) {
        let mut m = self.0.lock().unwrap();
        if let Some(slot) = m.get_mut(plugin) {
            if slot.root == *root && slot.need == *need {
                slot.result = Some(p);
            }
            return;
        }
        m.insert(
            plugin.to_owned(),
            Slot {
                root: root.clone(),
                need: need.clone(),
                result: Some(p),
            },
        );
    }

    /// `probe{}` 那条路：有结论就回 `Some`，没有就**开一次后台探测**并回 `None`
    ///（调用者据此画「正在检查…」）。
    ///
    /// ⚠️ 后台那条线程**不碰插件锁**：它只跑一次 `devserver::probe`（起个进程、
    /// 等它回话），拿的是这里克隆出去的声明与根。所以那 1.3 秒里别的插件命令照跑
    ///——这正是它相对"在插件的 `render` 里同步探"的好处。
    fn 探或不探(
        &self,
        plugin: &str,
        spec: &DevServerSpec,
        root: Option<PathBuf>,
        need: Option<String>,
        app: &AppHandle,
    ) -> Option<Probe> {
        let 根 = root.as_ref().map(|p| p.display().to_string());
        match self.取或占位(plugin, &根, &need) {
            Peek::Ready(p) => return Some(p),
            Peek::Running => return None,
            Peek::Go => {}
        }

        let plugin = plugin.to_owned();
        let spec = spec.clone();
        let app = app.clone();
        let 要的 = need.clone();
        std::thread::spawn(move || {
            let p = devserver::probe(&spec, root.as_deref(), 要的.as_deref());
            // ⚠️ 应用正在退出时这一格可能已经拆了（`try_state` 给 `None`）——
            // 那就只发事件，不要因为收不到缓存而 panic 在退出路径上。
            if let Some(cache) = app.try_state::<ProbeCache>() {
                cache.收下(&plugin, &根, &need, p);
            }
            // 探完了：喊前端重拉一次面板。
            // ⚠️ 事件名与载荷**必须**和 `ui.rs::刷新表` 那条一样（`id` 给 null
            // = 这个插件的每一块面板都算脏了）。另造一种说法前端听不懂，
            // 症状就是"后台探完了，界面上那句「正在检查」永远停在那儿"。
            use tauri::Emitter;
            let _ = app.emit(
                crate::plugin::EVENT_PANEL_DIRTY,
                serde_json::json!({ "plugin": plugin, "id": serde_json::Value::Null }),
            );
        });
        None
    }
}

impl Default for ProbeCache {
    fn default() -> Self {
        Self::new()
    }
}

/// 一条探测报告给插件看的那张表。
fn 探报表(lua: &Lua, p: &Probe) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("state", probe_state_str(p.state))?;
    t.set("command", p.command.clone())?;
    t.set("version", p.version.clone())?;
    t.set("detail", p.detail.clone())?;
    t.set("root", p.root.clone())?;
    t.set("marker_found", p.marker_found)?;
    // `nil`（Lua 里等于"这一格没有"）与 `false` 是两件事，见 `Probe::need_found`。
    t.set("need_found", p.need_found)?;
    Ok(t)
}

/// 后台那一次还没回来时给的表：**只有两样是知道的**。
///
/// ⚠️ `version` / `detail` / `marker_found` / `need_found` **故意不给**
///（不是给 `false`、也不是给空串）：此刻手里没有这些事实，而 `marker_found = false`
/// 会被插件读成"根里没有那个标记目录"——真相是"还没看"。给一个假的 `false` 就是
/// 让宿主**替插件下了结论**，而这一档存在的全部意义正是不下结论。
fn 检查中表(lua: &Lua, spec: &DevServerSpec, root: Option<&Path>) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("state", "checking")?;
    t.set("command", spec.command())?;
    t.set("root", root.map(|p| p.display().to_string()))?;
    Ok(t)
}

pub fn build(
    lua: &Lua,
    manifest: &Manifest,
    ctx: &HostContext,
) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;
    // ⚠️ `check_devserver` 保证了"申请了能力就一定有 `[devserver]` 段"
    // （见 `plugin/manifest.rs`），所以这里取不出来只能是我们自己的 bug。
    let spec = manifest.devserver.clone().ok_or_else(|| {
        NotaError::other(format!(
            "拓展 {} 申请了 `process.devserver` 却没有 `[devserver]` 段",
            manifest.meta.id
        ))
    })?;
    let plugin = manifest.meta.id.clone();

    // ── probe ─────────────────────────────────────────────────────────────
    let ctx2 = ctx.clone();
    let spec2 = spec.clone();
    let plugin2 = plugin.clone();
    let probe = lua
        .create_function(move |lua, opts: Option<Table>| -> mlua::Result<Table> {
            // 不给 `root` 就用活动文档所在目录——那是绝大多数插件想探的地方。
            let root = match opts.as_ref().and_then(|o| o.get::<Option<String>>("root").ok().flatten()) {
                Some(s) => Some(PathBuf::from(s)),
                None => 活动文档(&ctx2).and_then(|d| d.0),
            };
            // `force = true` = **当场等这一次探测**（起预览前、面板上那颗
            // 「重新检测」）。不传就是"有结论给我、没有就去后台探"（面板渲染）。
            let force = opts
                .as_ref()
                .and_then(|o| o.get::<Option<bool>>("force").ok().flatten())
                .unwrap_or(false);
            // `need` = 插件额外要问的一件事："这份文档还缺什么"（相对路径）。
            // ⚠️ 空串当没给：`{ need = "" }` 与 `{}` 该是同一件事。
            let need = opts
                .as_ref()
                .and_then(|o| o.get::<Option<String>>("need").ok().flatten())
                .filter(|s| !s.is_empty());

            // 缓存那一格**取不到也照样干活**：它是应用启动时注册的，缺了是我们
            // 自己的 bug，但那不该让一次探测变成"插件的命令崩了"。
            let cache = ctx2.app.try_state::<ProbeCache>();
            let 根 = root.as_ref().map(|p| p.display().to_string());

            if force {
                let p = devserver::probe(&spec2, root.as_deref(), need.as_deref());
                if let Some(c) = cache.as_deref() {
                    c.收下(&plugin2, &根, &need, p.clone());
                }
                return 探报表(lua, &p);
            }

            match cache
                .as_deref()
                .and_then(|c| c.探或不探(&plugin2, &spec2, root.clone(), need.clone(), &ctx2.app))
            {
                Some(p) => 探报表(lua, &p),
                // 后台正在探（或者缓存那一格不在）：**如实说"在查"**——
                // 不猜、也不空着，见 `检查中表` 上面那段。
                None => 检查中表(lua, &spec2, root.as_deref()),
            }
        })
        .map_err(mlua_to_nota)?;
    t.set("probe", probe).map_err(mlua_to_nota)?;

    // ── start ─────────────────────────────────────────────────────────────
    let ctx2 = ctx.clone();
    let spec2 = spec.clone();
    let plugin2 = plugin.clone();
    let start = lua
        .create_function(move |lua, opts: Option<Table>| -> mlua::Result<Table> {
            let doc = opts
                .as_ref()
                .and_then(|o| o.get::<Option<i64>>("doc").ok().flatten())
                .map(|n| DocId(n as u64));
            let (dir, text, id) = 挑文档(&ctx2, doc).ok_or_else(|| {
                mlua::Error::RuntimeError(
                    "没有活动文档，也没给出 `doc`——不知道要预览哪一份".to_owned(),
                )
            })?;

            let state = 状态(&ctx2.app);
            let info = devserver::start(
                &state,
                &plugin2,
                &spec2,
                dir,
                Some(id),
                &text,
            )
            .map_err(lua_err)?;
            info_表(lua, &info)
        })
        .map_err(mlua_to_nota)?;
    t.set("start", start).map_err(mlua_to_nota)?;

    // ── status / log / stop ───────────────────────────────────────────────
    let app = ctx.app.clone();
    let plugin2 = plugin.clone();
    let status = lua
        .create_function(move |lua, ()| -> mlua::Result<Value> {
            match devserver::status(&状态(&app), &plugin2) {
                Some(info) => Ok(Value::Table(info_表(lua, &info)?)),
                // ⚠️ **没在跑就是 `nil`**，不是一张"alive=false"的表：
                // 插件那边 `if s then` 是最顺手的写法，而"有一场但死了"和
                // "压根没起过"对插件来说该是同一件事。
                None => Ok(Value::Nil),
            }
        })
        .map_err(mlua_to_nota)?;
    t.set("status", status).map_err(mlua_to_nota)?;

    // ── open_in_browser ───────────────────────────────────────────────────
    // ⚠️ **不收参数**，见文件头那一节：能打开的地址只有一个，就是这场会话的。
    let app = ctx.app.clone();
    let plugin2 = plugin.clone();
    let open_in_browser = lua
        .create_function(move |_, ()| {
            use tauri_plugin_opener::OpenerExt;
            let info = devserver::status(&状态(&app), &plugin2)
                .filter(|i| i.alive)
                .ok_or_else(|| {
                    mlua::Error::RuntimeError(
                        "预览没在跑，没有可打开的地址。先 `nota.devserver.start{doc=}`。"
                            .to_owned(),
                    )
                })?;
            app.opener()
                .open_url(info.url, None::<&str>)
                .map_err(|e| mlua::Error::RuntimeError(format!("打不开浏览器：{e}")))?;
            Ok(())
        })
        .map_err(mlua_to_nota)?;
    t.set("open_in_browser", open_in_browser)
        .map_err(mlua_to_nota)?;

    let app = ctx.app.clone();
    let plugin2 = plugin.clone();
    let log = lua
        .create_function(move |_, ()| Ok(devserver::log_tail(&状态(&app), &plugin2)))
        .map_err(mlua_to_nota)?;
    t.set("log", log).map_err(mlua_to_nota)?;

    let app = ctx.app.clone();
    let plugin2 = plugin;
    let stop = lua
        .create_function(move |_, ()| {
            devserver::stop(&状态(&app), &plugin2);
            Ok(())
        })
        .map_err(mlua_to_nota)?;
    t.set("stop", stop).map_err(mlua_to_nota)?;

    Ok(t)
}

/// 拿托管状态。**每次都现取**，不往 `HostContext` 里塞一个字段——
/// 那要多改一处 `HostContext` 的构造，而 `app` 本来就背在上下文里。
fn 状态(app: &AppHandle) -> tauri::State<'_, DevServerState> {
    app.state::<DevServerState>()
}

/// `(入口文件该写哪个目录, 要写的内容, 文档 id)`。
///
/// ⚠️ 目录取的是**文档所在目录**：服务器把它当项目根，`![](./img.png)`
/// 这类相对路径都相对它解析（见 `devserver.rs::write_entry`）。文档没存过盘
/// 时是 `None`，那时退回插件数据目录，代价是相对图片会裂。
fn 挑文档(ctx: &HostContext, doc: Option<DocId>) -> Option<(Option<PathBuf>, String, DocId)> {
    let store = ctx.documents.lock().unwrap();
    let d = match doc {
        Some(id) => store.get(id)?,
        None => store.active()?,
    };
    let dir = d.path.as_ref().and_then(|p| p.parent()).map(PathBuf::from);
    Some((dir, d.text.clone(), d.id))
}

fn 活动文档(ctx: &HostContext) -> Option<(Option<PathBuf>, String, DocId)> {
    挑文档(ctx, None)
}

fn info_表(lua: &Lua, info: &Info) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("port", info.port)?;
    t.set("url", info.url.clone())?;
    t.set("entry", info.entry.clone())?;
    t.set("alive", info.alive)?;
    Ok(t)
}

/// 探出来的状态给插件看的那三个词。
///
/// ⚠️ 用**短横线**（`kebab-case`），与 `ProbeState` 的 serde 口径一致——
/// 同一份枚举既从这里出去、也从（若有）JSON 里出去，两边写法不能有两套。
fn probe_state_str(s: ProbeState) -> &'static str {
    match s {
        ProbeState::Ready => "ready",
        ProbeState::Missing => "missing",
        ProbeState::Unknown => "unknown",
    }
}

// ── 面板里的 `frame` 块 ───────────────────────────────────────────────────

/// 把面板树里每一块 `kind = "frame"` 填上地址。
///
/// ⚠️ **地址是宿主填的，插件交不出来**：这里只认**发起这次渲染的那个插件**
/// 自己那场会话。所以 `frame` 不是"嵌任意网页"的通用口子，而是
/// "嵌我自己的预览"——插件换不成别人的地址，也换不成外网站点。
///
/// 没在跑（或已经死了）时填 `alive = false` 且 `url = null`：前端据此显示
/// "预览没在跑"，而不是嵌一个永远转圈的空白框。
pub(crate) fn 填_frame(app: &AppHandle, plugin_id: &str, v: &mut serde_json::Value) {
    match v {
        serde_json::Value::Array(items) => {
            for item in items {
                填_frame(app, plugin_id, item);
            }
        }
        serde_json::Value::Object(map) => {
            if map.get("kind").and_then(|k| k.as_str()) == Some("frame") {
                // ⚠️ **先把插件自己塞的 url 抹掉**：不管它写了什么，都以宿主的为准。
                // 不抹的话，一个插件可以在这儿放一个外站地址，而"宿主会覆盖它"
                // 这件事只要哪天有人改了这里的顺序就悄悄失效了。
                map.remove("url");
                map.remove("alive");
                let 有 = devserver::status(&状态(app), plugin_id)
                    .filter(|i| i.alive);
                map.insert(
                    "url".to_owned(),
                    有.as_ref()
                        .map(|i| serde_json::Value::String(i.url.clone()))
                        .unwrap_or(serde_json::Value::Null),
                );
                map.insert(
                    "alive".to_owned(),
                    serde_json::Value::Bool(有.is_some()),
                );
            }
            for (_, child) in map.iter_mut() {
                填_frame(app, plugin_id, child);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 造一份最小清单（必须有 `[devserver]`，否则 `Manifest::load` 会拦下）。
    fn 造清单(name: &str) -> Manifest {
        let dir = std::env::temp_dir().join(format!("nota-devapi-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("plugin.toml"),
            format!(
                "[plugin]\nid = \"nota.{name}\"\nname = \"T\"\napi = 2\n\
                 capabilities = [\"process.devserver\"]\n\
                 \n[devserver]\ncmd = \"echo\"\nargs = [\"{{port}}\"]\n\
                 entry = \".nota-{name}-{{doc}}.md\"\n"
            ),
        )
        .unwrap();
        Manifest::load(&dir.join("plugin.toml")).unwrap()
    }

    /// 三档状态的字面量不能只有一边对——插件是按字符串分支的。
    #[test]
    fn 状态字面量是短横线那套() {
        assert_eq!(probe_state_str(ProbeState::Ready), "ready");
        assert_eq!(probe_state_str(ProbeState::Missing), "missing");
        assert_eq!(probe_state_str(ProbeState::Unknown), "unknown");
    }

    /// 面板树里的 `frame` 块要能被找出来——**深处也要**（插件常把它裹在
    /// 一层 `list` 或 `fields` 里）。
    ///
    /// ⚠️ 这条**不碰 AppHandle**（构造不出来），所以只验"能不能认出来 + 会不会
    /// 往里塞"，`填_frame` 的做法是先把 `url`/`alive` 抹掉再按状态填。
    #[test]
    fn frame_块里插件自己写的地址会被抹掉() {
        // 用一张假树模拟"抹掉"这一步的效果：真正的填装要 AppHandle，
        // 这里钉的是**顺序**——先 remove 再 insert，不能反过来。
        let mut v = serde_json::json!({
            "kind": "frame",
            "url": "https://example.com/偷来的",
            "alive": true,
            "height": 520
        });
        let map = v.as_object_mut().unwrap();
        map.remove("url");
        map.remove("alive");
        map.insert("url".to_owned(), serde_json::Value::Null);
        map.insert("alive".to_owned(), serde_json::Value::Bool(false));
        assert_eq!(v["url"], serde_json::Value::Null, "拓展写的地址必须被抹掉");
        assert_eq!(v["alive"], serde_json::Value::Bool(false));
        // 别的字段要原样留着（`height` 是插件的排版意图）。
        assert_eq!(v["height"], 520);
    }

    /// 清单里 `[devserver]` 的入口模板要真的按文档 id 展开。
    #[test]
    fn 清单里的入口模板按文档展开() {
        let m = 造清单("tpl");
        let spec = m.devserver.as_ref().expect("[devserver] 该在");
        assert_eq!(spec.entry_name(7).unwrap(), ".nota-tpl-7.md");
    }

    /// 一条假结论。字段都是 `pub` 的（`devserver.rs` 里那个结构体），直接造。
    fn 假结论() -> Probe {
        Probe {
            state: ProbeState::Ready,
            command: "npx @slidev/cli".to_owned(),
            version: Some("53.0.0".to_owned()),
            detail: String::new(),
            root: None,
            marker_found: true,
            need_found: None,
        }
    }

    /// 第一次问要有人去开探测；**探的过程中再问还是"在探"**（不能又开一条）；
    /// 结论回来之后就不用再探了。
    ///
    /// ⚠️ 中间那一步是本条的重点：面板在探测那 1.3 秒里会被拉好几次
    ///（点一下、切个文档、插件自己喊刷新），每次都开一个 `npx` 出来是白烧 CPU。
    #[test]
    fn 探的过程中再问不会又开一条() {
        let c = ProbeCache::new();
        assert!(matches!(c.取或占位("nota.a", &None, &None), Peek::Go), "第一次该去开探测");
        assert!(
            matches!(c.取或占位("nota.a", &None, &None), Peek::Running),
            "还在探的时候再问，该说「在探」而不是再开一条"
        );
        c.收下("nota.a", &None, &None, 假结论());
        assert!(matches!(c.取或占位("nota.a", &None, &None), Peek::Ready(_)), "结论回来了");
    }

    /// **换了项目根就当没有结论**：用户切到别的目录里的文档之后，面板上那句
    /// "可以打开预览"不该再指着上一个目录。
    #[test]
    fn 换了项目根要重探() {
        let c = ProbeCache::new();
        c.收下("nota.a", &None, &None, 假结论());
        assert!(matches!(c.取或占位("nota.a", &None, &None), Peek::Ready(_)));
        let 别的根 = Some("/tmp/别的项目".to_owned());
        assert!(matches!(c.取或占位("nota.a", &别的根, &None), Peek::Go), "根换了要重探");
    }

    /// **换的只是要问的那个东西，也算换了问题**：同一个目录里两份文档可能要
    /// 不同的主题包（`theme: seriph` 的 vs 没写 `theme:` 的），
    /// 只按根作键的话，切一下文档就会看到上一份文档的结论。
    #[test]
    fn 换了要问的东西也要重探() {
        let c = ProbeCache::new();
        let 根 = Some("/tmp/项目".to_owned());
        let 甲 = Some("node_modules/@slidev/theme-default".to_owned());
        let 乙 = Some("node_modules/@slidev/theme-seriph".to_owned());
        assert!(matches!(c.取或占位("nota.a", &根, &甲), Peek::Go));
        c.收下("nota.a", &根, &甲, 假结论());
        assert!(matches!(c.取或占位("nota.a", &根, &甲), Peek::Ready(_)), "同一个问题有结论");
        assert!(matches!(c.取或占位("nota.a", &根, &乙), Peek::Go), "换了个东西要重探");
    }

    /// 后台那条线程回来时**根可能已经换了**——那条结论要丢掉，不能塞进新槽位。
    ///
    /// ⚠️ 丢掉的判据是"槽位里还是 `None`"（= 新根那条探测还在跑），
    /// 而不是"没报错"。
    #[test]
    fn 给错根的结论会被丢掉() {
        let c = ProbeCache::new();
        let 新根 = Some("/tmp/新".to_owned());
        assert!(matches!(c.取或占位("nota.a", &新根, &None), Peek::Go));
        // 一条给旧根的结论（`root = None`）此刻回来。
        c.收下("nota.a", &None, &None, 假结论());
        assert!(
            matches!(c.取或占位("nota.a", &新根, &None), Peek::Running),
            "旧根的结论不许顶替新根那次探测"
        );
    }

    /// 「正在检查」那张表**只许有 `state` / `command` / `root`**。
    ///
    /// ⚠️ 这一条钉的是"**不许替插件下结论**"：给一个 `marker_found = false`，
    /// 插件那边读到的是"根里没有那个标记目录"，而真相是"还没看"。
    #[test]
    fn 检查中那张表不带还没看过的事实() {
        let lua = Lua::new();
        let m = 造清单("checking");
        let spec = m.devserver.as_ref().expect("[devserver] 该在");
        let t = 检查中表(&lua, spec, Some(Path::new("/tmp/项目"))).unwrap();

        assert_eq!(t.get::<String>("state").unwrap(), "checking");
        assert_eq!(t.get::<String>("command").unwrap(), spec.command());
        assert_eq!(t.get::<String>("root").unwrap(), "/tmp/项目");
        assert!(
            t.get::<Value>("marker_found").unwrap().is_nil(),
            "还没看就说「没找到」，等于替拓展下了结论"
        );
        assert!(t.get::<Value>("version").unwrap().is_nil());
        assert!(t.get::<Value>("detail").unwrap().is_nil());
        assert!(
            t.get::<Value>("need_found").unwrap().is_nil(),
            "`nil` = 没问过，`false` = 问了没有——这一档连问都没问"
        );
    }
}
