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

/// 导出（2026-09-27 加）：把一个已装的插件收成一个 `.nota-plugin` 包。
pub mod export;
pub mod installed;
/// 装 / 卸 / 停用 / 信任（2026-09-25 从本文件拆出，见那边的模块注释）。
mod install;
pub mod manifest;
pub mod package;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use mlua::Lua;
use serde::Serialize;
// `state::<DevServerState>()` 要用（停用插件时替它收摊，见 `set_enabled`）。
use tauri::Manager;

use crate::error::{NotaError, Result};
use crate::lua::{HostContext, LuaPlugin, PluginState};
use install::在用户目录里;
use installed::{来路, Installed, Signature};
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
    /// 这个插件是从哪儿来的：`builtin`（跟着安装包/仓库来的）还是 `user`
    /// （用户自己从文件装的）。
    ///
    /// ⚠️ 判据是**目录落点**（在 `paths::user_plugins_dir()` 下就是 `user`），
    /// 不是"哪个先扫到"——`discover` 里用户目录先扫，但那是去重顺序，不是来源。
    /// 界面靠它决定给不给「卸载」那颗按钮（内置插件卸不掉，见 [`PluginHost::卸`]）。
    pub origin: String,
    /// 装进来时的验签结论：`verified` / `unknown` / `unsigned`。
    /// `None` = 这笔账没记过（内置插件、或者早于这套机制的记录）。
    pub signature: Option<String>,
    /// 签名者指纹（`signature` 为 `verified`/`unknown` 时才有）。给人核对用。
    pub key_id: Option<String>,
    /// 能不能卸（= `origin == "user"`）。前端据此显示/隐藏「卸载」。
    pub removable: bool,
    /// 这个插件声明了哪些界面语言（清单里的 `langs`）。空 = 不参与协商。
    pub langs: Vec<String>,
    /// **这个插件此刻在用哪一份文案表**（`lang/<tag>.toml` 的 tag）。
    /// `None` = 没声明 `langs`（用插件代码里写着的字）。
    pub lang: Option<String>,
    /// 协商命中了没有。`langs` 非空且这里是 `false` = 界面上要显示那句
    /// 「此插件不支持您的语言」（现在给的是英语那份）。
    ///
    /// ⚠️ 判据**只看 `langs` 与这一格**，别在前端再按 `lang` 猜一遍：
    /// "声明了 zh-CN 但少了那个文件"这种事只有宿主知道（见 `lua/api/i18n.rs`）。
    pub lang_ok: bool,
}

/// 给前端看的一条信任记录（`$XDG_CONFIG_HOME/nota/trusted-keys.toml` 里的钥匙）。
#[derive(Debug, Clone, Serialize)]
pub struct 信任记录 {
    pub key_id: String,
    /// 记下这把钥匙时那个插件的名字。**只是给人看的**——信任是按指纹判的。
    pub name: String,
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
    /// 这一页要不要**放宽**（默认 `false`）。
    ///
    /// 插件栏默认是窄的（260px 那一档），对"一列文字/按钮"正好；但**画布类
    /// 的面板**（嵌一张幻灯片、一个图表、一块预览）缩在 260px 里只是个缩略图。
    /// 加这一个布尔，而不是让前端去认"哪一页是预览"——后者正是 2026-09-25
    /// 之前那个 `活动 === SLIDEV` 的写法，它把**一个插件的名字**焊进了外壳里。
    pub wide: bool,
    /// 这一页要不要**跟着时间自己动**（默认 `false`）。
    ///
    /// 声明了它的面板，宿主会**每秒**发一次"该重拉了"（`heartbeat.rs`），
    /// 于是插件的 `render` 每秒跑一遍，画出来的数才像"实时"的。
    ///
    /// # ⚠️ 这不是"给插件一个定时器"
    ///
    /// 插件那边**仍然没有 timer、仍然收不到宿主事件**（`docs/12` §4.7a 那条
    /// 事实一个字没变）：它只是**被拉得更勤**，代码还是"跑一次、返回一块内容"。
    /// 心跳在**宿主**这一侧，插件对此一无所知，也没法靠它攒状态机。
    ///
    /// 所以这条声明要**慎用**：`render` 里每跑一遍的东西都会每秒跑一遍。
    /// ⚠️ 尤其别在 `render` 里起子进程——git 那类面板一次 `git status`
    /// 几十毫秒起，每秒一次等于把 `plugins` 锁（`docs/03` 的锁序，
    /// "跑插件代码时一直握着"）一直占着，别的插件全得排队。
    /// 画个图、算个差值可以；要查外面的世界，仍旧走 `probe{}` 那条路。
    ///
    /// ⚠️ 只有**声明了的**面板才被心跳叫醒，不是所有面板：没声明的照旧
    /// "切过去才拉一次"，一秒钟白跑二十个 `render` 是没必要花的钱。
    pub live: bool,
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
// ⚠️ **camelCase**：插件作者在 Lua 里写的是 `secondArg`，而这个结构要穿过 IPC
// 交给前端（`ui/plugin-prompt.ts` 用的是同一个 TS 类型）。不加这一行，同一个字段
// 在两条路上会是两种拼法（菜单那条 `second_arg`、面板那条 `secondArg`）——
// 正是文件头警告的"两处相乘"。单字字段（`arg` / `label` / `secret`）不受影响。
#[serde(rename_all = "camelCase")]
pub struct PluginPrompt {
    /// 用户填的值放进 `args` 的哪个键。**没有它这条声明就没用**（问了也送不出去）。
    pub arg: String,
    pub label: String,
    pub placeholder: String,
    pub hint: String,
    /// 输入框画成密码框（API key 那种不该被人从肩膀上看到的）。
    /// ⚠️ 遮的只是**屏幕**，值本身原样存进插件设置文件（明文）。
    pub secret: bool,
    // ── 第二个字段（2026-09-26 加）───────────────────────────────────────
    //
    // 为 Git 身份那种"要两个值"的场合加的（名字 + 邮箱）。宿主的
    // `PromptDialog` 本来就有第二个输入框（「格式 → 超链接」在用），缺的只是
    // 插件这条路上的声明方式。
    //
    // ⚠️ 上面那句"只有一个字段"是 2026-09-25 写的，当时的判断是"真需要时再加"——
    // 现在真需要了。**再多就不加了**：三个以上的值该是插件自己的设置页，
    // 不是一个越滚越长的对话框。
    /// 第二个值放进 `args` 的哪个键。
    pub second_arg: String,
    pub second_label: String,
    pub second_placeholder: String,
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

/// 「编辑区里摊着的那个面板变了」那条事件的频道名（2026-09-25 加）。
///
/// ⚠️ 和 [`EVENT_PANEL_DIRTY`] 同一条判据：它报的是"此刻变了"这个**动作**，
/// 内容仍然由前端拉（`nota_plugin_review` + `nota_plugin_panel_content`）。
///
/// ⚠️ 发射侧在 `lua/api/ui.rs::预览表`、收侧在 `ipc.ts` 的 `events.pluginReview`
/// 加 `ui/usePlugins.ts` 的订阅。**三处必须说同一个字符串**，所以只在这里定一次。
pub const EVENT_REVIEW: &str = "nota:plugin-review";

/// 编辑区里摊着的那一格：**面板**（老形态）或**就地改动预览**（新形态）。
///
/// # 两种形态的分工（2026-09-26）
///
/// | 形态 | 谁放进去的 | 编辑区里长什么样 |
/// |---|---|---|
/// | `Panel` | `nota.ui.review(id)` | 正文**让位**，摊的是那个面板的内容 |
/// | `Diff` | `nota.ui.review_diff{...}` | 正文**原地**画 diff，一个字不动 |
///
/// ⚠️ 两形态并存是**有意的**，不是没删干净。`Diff` 那一形态只覆盖"改一份文本
/// 给人看"这一件事（AI 的补丁、git 的两版对比）；插件要摊一个**自己的界面**
/// （提交树、图表、别的东西）时仍然只有 `Panel` 可用——那类东西不是 diff，
/// 硬塞进 Diff 形态就得给它发明一套"怎么画"的协议。
///
/// ⚠️ 前端按 `kind` 分派（`bridge/types.ts` 的 `PluginReview`）。加第三个形态时
/// **两边必须同批改**——`kind` 是字符串，对不上的时候前端会走"什么都不认识"
/// 那一支，表现为"点了没反应"。
#[derive(Clone, Debug, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReviewKind {
    /// 摊一个插件的面板（`nota.ui.review(id)`）。
    Panel { panel: String },
    /// 在编辑区里**原地**画一份改动（`nota.ui.review_diff{...}`）。
    ///
    /// `text` 是**目标文本**（改完之后该长什么样），不是补丁、不是 hunk——
    /// 见 `lua/api/ui.rs::预览改动表` 里那段理由。
    Diff {
        title: String,
        text: String,
        accept: Option<ReviewAction>,
        reject: Option<ReviewAction>,
    },
}

/// 改动预览里那一个「接受 / 放弃」按钮。
///
/// ⚠️ **措辞归插件**（`label`），宿主与前端都不认命令名以外的东西：宿主不知道
/// "apply_patch" 是干什么的，也不该知道（见 `lua/api/ui.rs` 顶上那条分工）。
#[derive(Clone, Debug, serde::Serialize)]
pub struct ReviewAction {
    pub label: String,
    pub command: String,
}

/// 哪个插件现在把**哪一格**摊在编辑区里。
///
/// # 为什么这是宿主的一格状态，而不是前端自己的
///
/// 打开它的是**插件**（`nota.ui.review("改动预览")`——AI 提了改动、用户点了
/// 「在编辑区预览」那一下）。前端只能"拉"到这件事，拉不到就得等事件，
/// 而事件在"用户切走了文档再切回来""前端重挂载"这些时候是会漏的
/// （BUG-13 那条教训：声明要拉、事件要推，两者别混）。
///
/// # 为什么不在 `PluginHost` 里
///
/// `nota.ui.review` 是在**插件调用**中间跑的，那时 `plugins` 那把锁正被抱着
/// （`commands/plugin.rs::nota_plugin_call`）——写进 `PluginHost` 就是自己等
/// 自己，当场死锁。所以它单独一格状态，和 `devserver::DevServerState` 一个形状。
#[derive(Default)]
pub struct ReviewState(pub Mutex<HashMap<String, ReviewKind>>);

impl ReviewState {
    pub fn new() -> Self {
        Self::default()
    }

    /// 这个插件摊的是哪一格。
    ///
    /// ⚠️ 返回的是**克隆**：锁只在这一下里抱着。`Diff` 那一格带着整篇目标文本，
    /// 克隆一次是几 KB 的拷贝——相对于"抱着锁去序列化"（那会挡住插件那边
    /// 正在跑的 `set`）这点代价是值得的。
    pub fn get(&self, plugin: &str) -> Option<ReviewKind> {
        self.0.lock().unwrap().get(plugin).cloned()
    }

    /// 摊开（`Some`）或收起来（`None`）。
    ///
    /// ⚠️ 编辑区**只有一格**：摊开新的就整个换掉，`current()` 才不用在两张脸
    /// 之间挑一个（`HashMap` 没有顺序，挑出来的会**随机**变）。
    /// 而"收起来"只收**自己**那一格——不然插件 A 关自己的预览会把 B 的关掉。
    ///
    /// ⚠️ 不收形态：`review(nil)` 与 `review_diff(nil)` **都走这里**，
    /// 收的都是"这个插件那一格"——插件不该为了收起来先想起来自己当初摊的是哪种。
    pub fn set(&self, plugin: &str, 格: Option<ReviewKind>) {
        let mut map = self.0.lock().unwrap();
        match 格 {
            Some(格) => {
                map.clear();
                map.insert(plugin.to_owned(), 格);
            }
            None => {
                if matches!(map.get(plugin), Some(_)) {
                    map.remove(plugin);
                }
            }
        }
    }

    /// 现在摊着的是哪一格（插件 id + 那一格是什么）。表里最多一条（见 `set`）。
    pub fn current(&self) -> Option<(String, ReviewKind)> {
        self.0
            .lock()
            .unwrap()
            .iter()
            .next()
            .map(|(p, 格)| (p.clone(), 格.clone()))
    }
}

pub struct PluginHost {
    plugins: Vec<LuaPlugin>,
    /// 本地账本：哪些插件开着、当初装进来时验签验出了什么。
    ///
    /// ⚠️ **落盘**在 `$XDG_CONFIG_HOME/nota/plugins.toml`（见 [`installed`] 的文件头）。
    /// 早先这里是个内存里的 `HashSet<String>`，重启就丢——用户看到的是
    /// "我明明关过它，怎么又开了"（2026-09-25 换成这份账本）。
    installed: Installed,
    /// 加载插件要的那份宿主上下文，**去掉 `plugin_id` 那一栏**。
    ///
    /// ⚠️ 存下来是为了**运行期**还能加载：用户点「启用」或者从文件装一个插件时，
    /// `discover()` 早就跑完了，没有第二个地方拿得到 `AppHandle` 这些东西。
    base: HostContext,
}

impl PluginHost {
    /// 扫目录、加载全部插件。
    ///
    /// `resource_dir` 是打包后的资源目录（开发时传 `None`）。
    pub fn discover(resource_dir: Option<PathBuf>, base: &HostContext) -> Self {
        // ⚠️ 先读账本：**被停用的插件连 Lua 都不建**（不跑 `on_load`）。
        // "关了它就当它不存在"必须从现在开始算——等到派发命令时才拦，
        // 插件的 on_load 已经跑过了，副作用（计时器、后台线程、改过的东西）都在了。
        let installed = Installed::load();
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
                         拓展 id 里的 `.` 在事件名里写作 `-`，换一个 id"
                    );
                    errors.push(format!("{}：{reason}", manifest.meta.id));
                    plugins.push(LuaPlugin::rejected(manifest, reason, &base.应用语言));
                    continue;
                }

                let ctx = HostContext {
                    plugin_id: manifest.meta.id.clone(),
                    ..base.clone()
                };
                // ⚠️ 停用的走 `disabled()`：清单留着（界面上还要列它、还要能重新启用），
                // 但一行插件代码都不跑。判据在 `Installed::is_enabled` 里，它管着
                // 那条"没记过时按构建档"的默认值（调试档开、发布档关）。
                let 插件 = if installed.is_enabled(&manifest.meta.id) {
                    LuaPlugin::load(manifest, ctx)
                } else {
                    LuaPlugin::disabled(manifest, &base.应用语言)
                };
                plugins.push(插件);
            }
        }

        for e in errors {
            // 单个插件清单坏了不该拖住启动（其余插件照常加载），所以这里只记不抛。
            // 界面上"少了一个插件"未必看得出来 → 开发者的线索，走调试闸门。
            crate::日志!("[nota] 拓展清单读不了：{e}");
        }

        plugins.sort_by(|a, b| a.manifest.meta.id.cmp(&b.manifest.meta.id));

        Self {
            plugins,
            installed,
            base: base.clone(),
        }
    }

    pub fn list_info(&self) -> Vec<PluginInfo> {
        self.plugins
            .iter()
            .map(|p| {
                let m = &p.manifest.meta;
                let 记的 = self.installed.record(&m.id);
                let removable = 在用户目录里(&p.manifest.dir);
                let (state, error) = match (&p.state, self.installed.is_enabled(&m.id)) {
                    // 用户停用**先于**加载状态判：它是用户的显式动作，
                    // 说"已停用"比说"加载失败"更接近用户看到的事实。
                    (_, false) => ("disabled", None),
                    (PluginState::Loaded, _) => ("loaded", None),
                    (PluginState::Disabled, _) => ("disabled", None),
                    (PluginState::Failed(e), _) => ("failed", Some(e.clone())),
                };

                PluginInfo {
                    id: m.id.clone(),
                    // ⚠️ 名字可以被语言表里的保留键 `name` 盖掉（`AI 助手` /
                    // `AI Assistant`）——id **不会**，它是身份（事件通道、命令名、
                    // 账本全靠它）。理由见 `lua/api/i18n.rs::语言包::名字`。
                    name: p.语言.名字().unwrap_or(&m.name).to_owned(),
                    version: m.version.clone(),
                    // ⚠️ 简介与名字同一条规矩（保留键 `description` 盖掉清单里的）。
                    // 清单里写**英语**（主语言），中文那一份在 `lang/zh-CN.toml`。
                    description: p.语言.描述().unwrap_or(&m.description).to_owned(),
                    authors: m.authors.clone(),
                    license: m.license.clone(),
                    capabilities: m.capabilities.clone(),
                    entry: m.entry.clone(),
                    dir: p.manifest.dir.display().to_string(),
                    state: state.to_owned(),
                    error,
                    langs: m.langs.clone(),
                    lang: p.语言.lang.clone(),
                    lang_ok: p.语言.ok,
                    origin: if removable { "user" } else { "builtin" }.to_owned(),
                    signature: 记的.and_then(|r| r.signature).map(|s| {
                        match s {
                            Signature::Verified => "verified",
                            Signature::Unknown => "unknown",
                            Signature::Unsigned => "unsigned",
                        }
                        .to_owned()
                    }),
                    key_id: 记的.and_then(|r| r.key_id.clone()),
                    removable,
                }
            })
            .collect()
    }

    pub fn get(&self, id: &str) -> Option<&LuaPlugin> {
        self.plugins.iter().find(|p| p.manifest.meta.id == id)
    }

    fn 位置(&self, id: &str) -> Option<usize> {
        self.plugins.iter().position(|p| p.manifest.meta.id == id)
    }

    /// 给某个插件用的宿主上下文（`base` 加上它的 id）。
    fn 上下文(&self, id: &str) -> HostContext {
        HostContext {
            plugin_id: id.to_owned(),
            ..self.base.clone()
        }
    }

    pub fn is_enabled(&self, id: &str) -> bool {
        self.installed.is_enabled(id)
    }

    /// 启用 / 停用。**两个方向都落盘**（`plugins.toml`），而且**都是真的装卸**。
    ///
    /// # ⚠️ 停用 = 真卸载（2026-09-25 改的口径）
    ///
    /// 早先的做法是"留着 Lua 状态，只是不再派发命令过去"（`docs/12` §6 把它记作
    /// 「卸载不彻底」）。改成真卸载是因为**用户对"关掉"的期待就是"当它不存在"**：
    /// 留着状态意味着它注册过的命令还在、`nota.ui.refresh` 还能点到它的 `render`、
    /// 它开的计时器还在跑——那不叫关，叫"装作没看见"。
    ///
    /// 代价说在当面：**重新启用会重跑一遍 `on_load`**。所以插件的 `on_load` 必须
    /// 是幂等的（这条写进 `docs/11` 的约定里），而不是靠宿主替它兜着。
    ///
    /// ⚠️ 与"删掉插件"的差别只在**磁盘上还在不在**：停用留下文件（下次还能启用），
    /// 卸载（[`Self::卸`]）把目录删掉。两者都不跑它的代码。
    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<()> {
        let i = self
            .位置(id)
            .ok_or_else(|| NotaError::other(format!("没有这个拓展：{id}")))?;

        if enabled {
            self.installed.set_enabled(id, true)?;
            // ⚠️ 只有当前**没有 Lua 状态**时才真加载：已经加载着的再 load 一遍
            // 会白白跑两次 `on_load`（而 on_load 可能有副作用）。
            if self.plugins[i].state != PluginState::Loaded {
                let manifest = self.plugins[i].manifest.clone();
                let ctx = self.上下文(id);
                self.plugins[i] = LuaPlugin::load(manifest, ctx);
            }
        } else {
            self.installed.set_enabled(id, false)?;
            if self.plugins[i].state == PluginState::Loaded {
                self.plugins[i].unload(); // 给它一次 on_unload
            }
            self.收摊(id);
            let manifest = self.plugins[i].manifest.clone();
            self.plugins[i] = LuaPlugin::disabled(manifest, &self.base.应用语言);
        }
        Ok(())
    }

    /// 把一个插件留在宿主里的**外部痕迹**收掉：它开的开发服务器、编辑区里
    /// 摊着的那一块。
    ///
    /// # 为什么要在两个地方（停用 / 卸载）都做，所以抽成一个
    ///
    /// 停用与卸载都会让"它的面板和菜单跟着消失"，于是用户**再也没有地方**点
    /// 「停止预览」——那个 `git` / 静态服务器进程会一直占着端口跑到 Nota 退出为止。
    ///
    /// ⚠️ **卸载那条路上原来漏了这一步**（2026-09-27 修）：`卸` 只做了
    /// "删磁盘、忘账本"，开发服务器照旧在跑，而插件已经不在清单里了——
    /// 连"去停用它一下"这条退路都没有（`DeviceServerState` 是按 id 收的，
    /// 但界面上已经没有那一行了）。抽成这一个函数就是为了**只写一份**：
    /// 两处各抄一遍的话，第三处（将来可能有的"升级失败回滚"）必然再漏一次。
    ///
    /// ⚠️ 指望不上插件的 `on_unload`：宿主调它时**不传 `nota`**
    /// （`lua/mod.rs::unload` 是 `f.call::<()>(())`），插件那边拿不到
    /// `nota.devserver`。所以这条责任只能在宿主这一侧。
    ///
    /// ⚠️ 调它的地方都**还握着 `plugins` 锁**（两个调用者都是 `&mut self` 的方法）。
    /// 它转手去拿 devserver / review 那两把锁，锁序与 `set_enabled` 里原来那段
    /// 完全一样（见 `docs/03` 的不变量），没有新增一条嵌套。
    fn 收摊(&self, id: &str) {
        crate::devserver::stop(
            &self.base.app.state::<crate::devserver::DevServerState>(),
            id,
        );
        // ⚠️ 编辑区里摊着的那块也得收（同一条理由）：那块是**照着面板内容画的**——
        // 留着的话用户看到的是一块刷不动、按钮点了没反应的死内容，
        // 或者干脆是一句"插件没有声明面板 X"。
        {
            use tauri::Emitter;
            let review = self.base.app.state::<ReviewState>();
            review.set(id, None);
            let _ = self.base.app.emit(EVENT_REVIEW, serde_json::json!({}));
        }
    }

    /// 取一个**现在能跑代码**的插件，取不到就说清楚为什么。
    ///
    /// ⚠️ 抽出来的理由是"两处相乘"：派发命令和取面板内容都要过同一道闸
    /// （存在 / 加载成功 / 没被禁用），各写一遍的话，改一处忘一处就会出现
    /// "禁用了还能拉面板"或"加载失败的命令还能搜到"这种半生效状态。
    fn 可调用的(&self, plugin_id: &str) -> Result<&LuaPlugin> {
        let plugin = self
            .get(plugin_id)
            .ok_or_else(|| NotaError::other(format!("没有这个拓展：{plugin_id}")))?;

        match &plugin.state {
            // 用户停用**先于**加载状态判：停用是用户的显式动作，
            // 说"已被停用"比说"加载失败"更接近用户看到的事实。
            _ if !self.is_enabled(plugin_id) => {
                Err(NotaError::other(format!("拓展 {plugin_id} 已被停用")))
            }
            PluginState::Loaded => Ok(plugin),
            PluginState::Failed(e) => Err(NotaError::other(format!(
                "拓展 {plugin_id} 加载失败，无法执行命令：{e}"
            ))),
            PluginState::Disabled => Err(NotaError::other(format!("拓展 {plugin_id} 已被停用"))),
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

    /// 哪些面板声明了"跟着时间自己动"（`PluginPanel::live`），给心跳用。
    ///
    /// ⚠️ 单开一个方法而不是让 `heartbeat.rs` 拿 `panels()` 自己筛，图的是
    /// **每秒只做该做的那点事**：心跳一秒跑一趟，而 `读面板` 会把每一块的
    /// title / icon / location 都从 Lua 里 clone 出来（那些字段心跳一个都不用）。
    /// 少一次 clone 换不来什么，换来的是这里**只回答一个问题**——
    /// "谁要跟着动"，将来多一种要跟着动的声明（比如菜单项）时，
    /// 改的是这一处而不是心跳里那个 filter 的判据。
    ///
    /// 返回 `(plugin_id, panel_id)`：两个都是回给前端的原样字符串，
    /// 事件形状与 `nota.ui.refresh(id)` 那一条完全一致（同一频道、同一载荷）。
    pub fn 跟着动的面板(&self) -> Vec<(String, String)> {
        self.生效的()
            .flat_map(|p| {
                let id = p.manifest.meta.id.clone();
                读面板(&p.lua, &id)
                    .into_iter()
                    .filter(|panel| panel.live)
                    .map(|panel| (id.clone(), panel.id))
                    .collect::<Vec<_>>()
            })
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

    /// 这个插件的 id 想要的**事件频道**被别的插件占了吗。占着的那个的 id 是什么。
    ///
    /// 判据与 `discover` 里那段一样（`manifest::channel_id`），抽出来是因为
    /// **安装时还要再判一次**：先装的那个先占，后装的那个要拒——不然两个插件
    /// 往同一个频道发事件，前端分不清是谁发的（"多发一条事件"是最难查的症状）。
    fn 频道被占(&self, id: &str) -> Option<String> {
        let 我的 = manifest::channel_id(id);
        self.plugins
            .iter()
            .find(|p| p.manifest.meta.id != id && manifest::channel_id(&p.manifest.meta.id) == 我的)
            .map(|p| p.manifest.meta.id.clone())
    }
}

// ⚠️ 装 / 卸 / 停用 / 信任那几段**不在这里**，在 `plugin/install.rs`：
// 它们改的是同一个 `PluginHost`，但那一块是"插件从哪来、怎么没的"，
// 与这里的"装着什么、怎么派发"不是一件事（`install.rs` 顶上写着拆的理由）。

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
            // 同上：写入侧补过默认值，这里是兜底。
            wide: s.get::<Option<bool>>("wide").ok().flatten().unwrap_or(false),
            // 同上：写入侧只存 `true`，所以这里一条 `unwrap_or(false)` 就够。
            live: s.get::<Option<bool>>("live").ok().flatten().unwrap_or(false),
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
    // 第二个字段：**键名和标签两个都给才算数**，只给一个等于没给——理由与 `arg`
    // 那条一样（缺了键名，用户填的值没有地方放）。`second_label` 还兼着"要不要
    // 画第二行"的开关（前端看它是不是空串）。
    let second_arg = t.get::<String>("secondArg").unwrap_or_default();
    let second_label = t.get::<String>("secondLabel").unwrap_or_default();
    let 两个都给 = !second_arg.is_empty() && !second_label.is_empty();
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
        second_arg: if 两个都给 { second_arg } else { String::new() },
        second_label: if 两个都给 { second_label } else { String::new() },
        second_placeholder: if 两个都给 {
            t.get::<String>("secondPlaceholder").unwrap_or_default()
        } else {
            String::new()
        },
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
