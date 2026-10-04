//! 插件对外声明的**形状**：宿主给前端看的快照、插件给宿主声明的面板/菜单，
//! 以及编辑区那一格改动预览的两种形态。
//!
//! # 为什么单独一份（2026-09-29）
//!
//! 原来这些全在 `plugin/mod.rs` 里（那一份当时 819 行）。拆出来的线是
//! 「**这是说给别人的形状，还是宿主自己的动作**」：本文件全是前者——
//! 它们的字段名要**穿过 IPC**（`serde` 那一串属性就是为这来的），
//! 或者要在别处被**照着字面量比对**（`REG_*` / `EVENT_*`）。
//!
//! ⚠️ 所以改这里的字段名**不是**改一个 Rust 结构那么大：前端
//! （`bridge/types.ts`、`ui/panel-nodes.ts`、`ui/plugin-prompt.ts`）和
//! 插件作者写的 Lua 都按这些名字说话。改一次要**两处同批**，
//! 不然症状是"界面上那一栏永远是空的"且不报错。
//!
//! ⚠️ `mod.rs` 里 `pub use types::*;` 转出去，所以
//! `crate::plugin::PluginInfo` 这类老路径**一个字没变**——拆家不动门牌。
//!
//! ⚠️ `REG_PANELS` / `REG_MENUS` / `EVENT_*` 那几条**常量留在了 `mod.rs`**，
//! 没跟着过来：它们也是"两处要说同一个字符串"，但它们是**宿主两边**的事
//! （写的一侧 `lua/api/ui.rs`、读的一侧 `mod.rs`），与"给前端看的形状"不同路。

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;

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
    /// 这个插件**请宿主画的**那几格设置（清单里的 `[[settings]]`，2026-10-04 加）。
    ///
    /// ⚠️ 空数组有两种意思，界面上不用分：**没声明**、或者声明了但清单不给画——
    /// 后者加载时就被挡下了（`plugin/manifest.rs::check_settings`）。
    /// 插件自己在面板里画设置界面那种（AI 插件）**本来就是一格都不声明**。
    pub settings: Vec<PluginSetting>,
}

/// 插件声明的一格设置 ＋ **此刻的值**，给「设置 → 拓展」那一页画。
///
/// # ⚠️ 值是在这里夹好、对齐好的（`SettingDecl::夹紧`）
///
/// 前端拿到的是"能直接摆到滑杆上的数"，它不自己夹一遍。理由与全仓那条
/// "拼路径 / 算文件名一律在宿主"同源：同一条规则两处实现，迟早对不上，
/// 而对不上的表现是"滑杆显示 5、插件按 999 算"。
///
/// # 为什么值不是 `Option`
///
/// 用户还没拖过 = 文件里没这个键 = **用清单里的 `default`**。三者在界面上是
/// 同一个东西（"现在是几"），所以这里给的是一个一定有值的数——
/// 前端拿不到"没设过"这个中间态，也就不会画出第三种样子。
///
/// # 为什么字段名全是单词
///
/// 这一份要穿过 IPC（`bridge/types.ts` 的同名 interface）。字段名里没有第二个
/// 单词，所以不需要 `rename_all` 那套——**加字段时挑一个单词的**，不然就得两边
/// 同批改拼法（`PluginPrompt` 那边踩过一次，见 [`PluginPrompt`] 的注释）。
#[derive(Debug, Clone, Serialize)]
pub struct PluginSetting {
    /// 进插件设置文件的键。
    pub key: String,
    /// 控件类型。现在只有 `"range"`（滑杆），前端按它分派。
    pub kind: String,
    /// 这一格的名字。**已经按插件自己的语言表翻好**（清单里写英语原文，
    /// `lang/<tag>.toml` 里那一条是译文——与 `PluginInfo::name` 同一条规矩）。
    pub label: String,
    /// 名字下面那句小字。同上，翻好的。
    pub help: String,
    pub min: f64,
    pub max: f64,
    pub step: f64,
    /// 读数后面那个单位（`s`）。空串 = 不画（**它不进 i18n**）。
    pub unit: String,
    /// 此刻的值（文件里的，夹过；没有就用 `default`）。
    pub value: f64,
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
