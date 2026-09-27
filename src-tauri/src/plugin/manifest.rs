//! 插件清单（`plugin.toml`）的解析与校验。
//!
//! # 清单长什么样
//!
//! ```toml
//! [plugin]
//! id          = "nota.git"          # 全局唯一，点号分层；宿主用它做覆盖与依赖
//! name        = "Git 版本控制"       # 给人看的名字
//! version     = "0.1.0"             # 插件自己的版本，不代表 ABI
//! api         = 2                   # 需要的宿主 API 版本，**精确匹配**
//! entry       = "main.lua"          # 入口脚本，相对插件目录
//! description = "…"
//! authors     = ["…"]
//! license     = "BSD-2-Clause"
//! capabilities = ["document.read", "fs.read", "fs.write", "process.git"]
//! langs       = ["zh-CN", "en"]     # 界面上有哪几种语言，**必须含 en**
//! ```
//!
//! # 多语言（`langs` + `lang/<tag>.toml`）
//!
//! 声明了 `langs` 的插件，在**插件目录**下放 `lang/<tag>.toml` 文件，
//! 一种语言一份，长的就是一张平表：
//!
//! ```toml
//! # lang/en.toml
//! name    = "Git"                # 保留键：这个语言下插件叫什么名字
//! "刷新"  = "Refresh"            # 别的键都是插件自己的文案
//! ```
//!
//! 插件里用 `nota.i18n.text("刷新")` 取——**键就是作者自己写下的那句原文**：
//!
//! ```lua
//! local function T(s) return nota.i18n.text(s) or s end
//! ```
//!
//! 取不到就原样用原文（表里没写、文件没带、压根没声明 `langs`，都是这一条），
//! 所以译文表**只需要写要翻译的那些键**，作者原文那种语言的表几乎是空的。
//! 详见 `lua/api/i18n.rs` 顶上那段。
//!
//! 协商规则（用户 2026-09-25 定的，与 `src/lang.rs` 里那份是同一套）：
//! 应用的语言在 `langs` 里就用那个语言；不在就用 `en`，
//! 并在界面上给这个插件挂一句「此插件不支持您的语言」。
//! ⚠️ 判据**只看这张清单**，不看 `lang/` 下有没有那个文件（见下面 `langs` 那段）。
//!
//! ⚠️ **不写 `langs`** 的插件不参与协商（也不显示那句提示）：它是"只说自己
//! 写死的那一种语言"的插件，宿主不去猜它说的是什么语言。
//!
//! # 想让宿主替你起一个开发服务器，就再写一段 `[devserver]`
//!
//! ```toml
//! [devserver]
//! cmd   = "npx @slidev/cli"          # 宿主只会起这一条命令
//! # 启动参数：{port} 换成宿主挑的空闲端口，{entry} 换成入口文件路径
//! args  = ["{entry}", "--port", "{port}", "--no-open"]
//! entry = ".nota-slidev-{doc}.md"    # 入口文件名模板；宿主决定放在哪个目录
//! ```
//!
//! 判据与 `process.git` 是同一条：**能力放行的是"这一条命令"，不是"任意命令"**。
//! 命令写在清单里（清单是随插件一起安装、走签名校验的那份文件），Lua 那边
//! 交不出第二个程序名来。细节见 `src-tauri/src/devserver.rs`。
//!
//! # 为什么 `api` 是精确匹配而不是 `>=`
//!
//! 与 Folio 的 `FO_PLUGIN_API_VERSION` 同一条理由（见 `docs/11`）：宿主与内置插件
//! 永远同批构建，`>=` 只会让"插件作者以为存在一个他没见过的新版本"这种事发生。
//! 号一变，内置插件同批改号，没有迁移动作。什么时候该动号、什么时候不该动，
//! 判据写在 `docs/11-writing-a-plugin.md`。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};
use crate::lang;

/// 宿主 API 版本。**当前是 2**。
///
/// 动它的判据（与 Folio 一致）：
/// - 给 Lua 侧的 `nota.*` 表**增加**成员 —— 不动号（老插件照样跑）；
/// - **改名**某个 `nota.*` 成员，或**改变它的语义** —— 动号（老插件会静默拿到别的东西）；
/// - 增删 `capabilities` 里的取值，并让它影响放行 —— 动号。
///
/// ⚠️ **1 → 2 就是第三条**（2026-09-25）：加了 `process.devserver` 与
/// `ui.open_url` 两个取值。它们**不影响老插件**（老插件申请不到、也不会去申请），
/// 但按上面那条判据还是动了号——理由和 `>=` 不用是同一条：**号是一个整体承诺**，
/// 分成"有时严格有时宽松"之后，插件作者就得记住哪些改动会动号、哪些不会，
/// 而记错的表现是**插件在别人的机器上静默换了行为**。两个内置插件同批改成 2。
pub const NOTA_PLUGIN_API_VERSION: u32 = 2;

/// 插件可以申请的能力。宿主按此放行 Lua API——
/// **没申请就用不了**，不是"申请了就随便用"。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    /// 读当前文档的文本、路径、选区。
    #[serde(rename = "document.read")]
    DocumentRead,
    /// 改当前文档（替换全文 / 插入 / 替换选区）。
    #[serde(rename = "document.write")]
    DocumentWrite,
    /// 读工作区内的文件。
    #[serde(rename = "fs.read")]
    FsRead,
    /// 写工作区内的文件。
    #[serde(rename = "fs.write")]
    FsWrite,
    /// 起 `git` 子进程。**只放行 git 这一个命令**，不是通用 subprocess。
    #[serde(rename = "process.git")]
    ProcessGit,
    /// 起清单里 `[devserver]` 声明的那条开发服务器命令，并把它嵌进面板。
    ///
    /// ⚠️ 与 `process.git` 同一条判据：**放行的是"那一条命令"，不是"任意命令"**。
    /// 没有 `[devserver]` 段就什么都起不来（`nota.devserver` 整张表是 `nil`）。
    #[serde(rename = "process.devserver")]
    ProcessDevServer,
    /// 发 HTTP 请求（AI 插件要用）。
    #[serde(rename = "network.http")]
    NetworkHttp,
    /// 弹通知。
    #[serde(rename = "ui.notify")]
    UiNotify,
    /// 把用户的系统浏览器打开到某个 `https://` 地址。
    ///
    /// ⚠️ **只认 `https`**：这是唯一一个"插件能让用户跳出 Nota"的口子，
    /// 放开 `http`/`file`/自定义 scheme 就等于给了一条把用户送到别处的路。
    /// 插件要说的话仍然该在 `nota.ui.notify` 里说，这条只用于"去官网看文档"。
    #[serde(rename = "ui.open_url")]
    UiOpenUrl,
    /// 注册侧栏面板。
    #[serde(rename = "ui.panel")]
    UiPanel,
    /// 往菜单里加条目。
    #[serde(rename = "ui.menu")]
    UiMenu,
    /// 读写插件自己的设置段。
    #[serde(rename = "settings.own")]
    SettingsOwn,
    /// 读写插件**自己那份数据**（`$XDG_DATA_HOME/nota/plugin-data/<id>/` 里的一串文本文件）。
    ///
    /// ⚠️ 与 `settings.own` **不是一回事**，两个都申请才算"设置与账都能存"：
    /// 那一份是**用户该能改的偏好**（`config` 下、可能含明文密钥），
    /// 这一份是**插件自己写自己读的账**（写作统计按天记的那些数字）。
    /// 判据与文件布局写在 `paths.rs::plugin_data_dir` 与 `lua/api/data.rs` 的文件头。
    ///
    /// ⚠️ 它**只**放行那一个目录：`fs.read` / `fs.write` 围的是用户的工作区，
    /// 这一条围的是插件自己的角落，两条互不覆盖。
    #[serde(rename = "data.own")]
    DataOwn,
}

impl Capability {
    /// 从清单里的字符串解析。未知能力**报错而不是忽略**——
    /// 悄悄忽略会变成"插件作者以为申请到了、实际没有"的静默降级。
    pub fn parse(s: &str) -> Result<Self> {
        Ok(match s {
            "document.read" => Self::DocumentRead,
            "document.write" => Self::DocumentWrite,
            "fs.read" => Self::FsRead,
            "fs.write" => Self::FsWrite,
            "process.git" => Self::ProcessGit,
            "process.devserver" => Self::ProcessDevServer,
            "network.http" => Self::NetworkHttp,
            "ui.notify" => Self::UiNotify,
            "ui.open_url" => Self::UiOpenUrl,
            "ui.panel" => Self::UiPanel,
            "ui.menu" => Self::UiMenu,
            "settings.own" => Self::SettingsOwn,
            "data.own" => Self::DataOwn,
            other => {
                return Err(NotaError::other(format!(
                    "不认识的能力 `{other}`（见 docs/11 的能力表）"
                )))
            }
        })
    }
}

/// `[plugin]` 段。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    #[serde(default = "default_version")]
    pub version: String,
    pub api: u32,
    #[serde(default = "default_entry")]
    pub entry: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default)]
    pub license: String,
    /// 申请的能力。空 = 纯声明式插件（只贡献菜单/面板，不碰文档与磁盘）。
    #[serde(default)]
    pub capabilities: Vec<String>,
    /// 这个插件的界面文案有哪几种语言（`lang/<tag>.toml` 一个文件一种）。
    ///
    /// ⚠️ **不写 = 不参与语言协商**：那个插件只说自己写死的那一种语言，
    /// 界面不会给它显示「此插件不支持您的语言」。老插件因此照样能用——
    /// 这一格是**自愿报名**，不是新门槛。
    ///
    /// ⚠️ **写了就必须含 `en`**（用户 2026-09-25：「插件必须包含英语」）：
    /// 英语是唯一能要求所有作者都提供的兜底（理由见 `src/lang.rs` 的
    /// [`crate::lang::插件兜底`]）。
    /// 声明了却不给 = 契约坏掉，**加载时报错**而不是悄悄降级。
    ///
    /// ⚠️ 声明了某个语言但 `lang/<那个语言>.toml` 不在，**不报错、也不改 `ok`**：
    /// 那份表空着，插件里的 `text("…") or "…"` 就退回**作者写下的原文**
    /// （这套"缺键用原文"的写法见 `lua/api/i18n.rs` 顶上那段）。界面上那句
    /// 「此插件不支持您的语言」只由**清单里有没有这门语言**决定——用户的原话就是
    /// 「如果应用语言在插件语言列表内，则直接使用；否则…」，跟着文件在不在走，
    /// 会把"只用英语写、不带任何表"的那种插件（最常见的一种）说反。
    /// 要收走的是**契约层面**的谎（声明里没有 `en`），不是还没写完的活。
    #[serde(default)]
    pub langs: Vec<String>,
}

fn default_version() -> String {
    "0.0.0".to_owned()
}

fn default_entry() -> String {
    "main.lua".to_owned()
}

/// `[devserver]` 段：宿主替这个插件起哪个开发服务器。
///
/// ⚠️ **这是"能力"的一部分，不是配置**。`process.devserver` 放行的正是这一段里
/// 写死的那条命令——Lua 那边**交不出第二个程序名来**（`nota.devserver.start`
/// 不收 `cmd` 参数）。理由与 `process.git` 一样：能力该放行"这件事"，
/// 而不是"这类事"。
#[derive(Debug, Clone, Deserialize)]
pub struct DevServerSpec {
    /// 起哪个程序。和 `args` 一起交给 `proc::split_command` 那个口径拆。
    pub cmd: String,
    /// 调试旋钮：设了这个环境变量就换掉 `cmd`（整条命令，不是单个词）。
    /// `docs/06` §3.4 那张旋钮表里原来叫 `NOTA_SLIDEV_CMD`。
    #[serde(default)]
    pub cmd_env: Option<String>,
    /// 启动参数。两个占位符：`{port}` 换成宿主挑的空闲端口，`{entry}`
    /// 换成入口文件的绝对路径。
    #[serde(default)]
    pub args: Vec<String>,
    /// 入口文件名模板（`{doc}` 换成文档 id），**只能是文件名**——
    /// 带路径分隔符就是打包时的一处越界，校验挡在门口。
    /// 不写 = 这个服务器不需要入口文件。
    #[serde(default)]
    pub entry: Option<String>,
    /// 探"装没装"时的参数，默认 `["--version"]`。
    #[serde(default)]
    pub probe_args: Option<Vec<String>>,
    /// 探"装没装"时要带的环境变量（比如 npm 的"不许联网"）。
    #[serde(default)]
    pub probe_env: Option<std::collections::BTreeMap<String, String>>,
    /// 项目根的判据：根**或它的任一层父目录**里要有以它开头的目录。
    /// `None` = 不看（探到命令能跑就算装好了）。
    #[serde(default)]
    pub project_marker: Option<String>,
}

impl DevServerSpec {
    /// 现在该用哪条命令：调试旋钮优先，其次清单里那条。
    pub fn command(&self) -> String {
        match &self.cmd_env {
            Some(var) => crate::proc::command_or_default(var, &self.cmd),
            None => self.cmd.clone(),
        }
    }

    /// 入口文件名（`{doc}` 已经换成 id）。没有 `entry` 就是 `None`。
    ///
    /// ⚠️ 参数收 `u64` 而不是 `DocId`：清单这一层不该认识"文档"是什么，
    /// 它只认识"模板里有个洞要填"。
    pub fn entry_name(&self, doc: u64) -> Option<String> {
        self.entry.as_ref().map(|t| t.replace("{doc}", &doc.to_string()))
    }

    pub fn probe_args(&self) -> Vec<String> {
        self.probe_args
            .clone()
            .unwrap_or_else(|| vec!["--version".to_owned()])
    }
}

#[derive(Debug, Clone, Deserialize)]
struct ManifestFile {
    plugin: PluginMeta,
    #[serde(default)]
    devserver: Option<DevServerSpec>,
}

/// 解析好、校验过的清单，附上它所在的目录。
#[derive(Debug, Clone)]
pub struct Manifest {
    pub meta: PluginMeta,
    /// 插件根目录（`plugin.toml` 所在处）。
    pub dir: PathBuf,
    pub capabilities: Vec<Capability>,
    /// `[devserver]` 段。`None` = 这个插件不起开发服务器。
    pub devserver: Option<DevServerSpec>,
}

impl Manifest {
    /// 入口脚本的绝对路径。
    pub fn entry_path(&self) -> PathBuf {
        self.dir.join(&self.meta.entry)
    }

    /// 从 `plugin.toml` 读并校验。
    pub fn load(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path).map_err(|source| NotaError::Read {
            path: path.to_path_buf(),
            source,
        })?;

        let file: ManifestFile = toml::from_str(&text).map_err(|e| NotaError::Manifest {
            file: path.to_path_buf(),
            reason: e.to_string(),
        })?;

        let dir = path
            .parent()
            .ok_or_else(|| NotaError::Manifest {
                file: path.to_path_buf(),
                reason: "plugin.toml 没有父目录".to_owned(),
            })?
            .to_path_buf();

        Self::from_meta(file.plugin, file.devserver, dir, path)
    }

    fn from_meta(
        meta: PluginMeta,
        devserver: Option<DevServerSpec>,
        dir: PathBuf,
        file: &Path,
    ) -> Result<Self> {
        // ── id：点号分层的小写标识 ───────────────────────────────────────
        if meta.id.is_empty() {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: "id 不能为空".to_owned(),
            });
        }
        if !meta
            .id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-' || c == '_')
        {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!("id `{}` 只能用小写字母、数字、`.`、`-`、`_`", meta.id),
            });
        }

        // ── api：精确匹配 ────────────────────────────────────────────────
        if meta.api != NOTA_PLUGIN_API_VERSION {
            return Err(NotaError::PluginApiMismatch {
                id: meta.id.clone(),
                wanted: meta.api,
                have: NOTA_PLUGIN_API_VERSION,
            });
        }

        // ── entry：不许逃出插件目录 ──────────────────────────────────────
        // 清单是插件自带的，`entry = "../../../etc/passwd"` 这种必须挡在门口。
        if meta.entry.contains("..") || Path::new(&meta.entry).is_absolute() {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!("entry `{}` 必须是插件目录内的相对路径", meta.entry),
            });
        }

        // ── capabilities ─────────────────────────────────────────────────
        let mut capabilities = Vec::new();
        for raw in &meta.capabilities {
            let cap = Capability::parse(raw).map_err(|e| NotaError::Manifest {
                file: file.to_path_buf(),
                reason: e.to_string(),
            })?;
            if !capabilities.contains(&cap) {
                capabilities.push(cap);
            }
        }

        // ── langs ───────────────────────────────────────────────────────
        // ⚠️ 报错而不是"补一个 en 上去"：补的话，插件作者永远不知道自己漏了
        // 兜底语言，而用户会在某个语言下看到一片 `nil`（`nota.i18n.text` 取不到
        // 就是 `nil`）。契约坏掉要当场说。
        if !meta.langs.is_empty() && lang::匹配(lang::插件兜底, &meta.langs).is_none() {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!(
                    "`langs` 里没有 `en`（现在写的是 {:?}）——英语是必须有的兜底：\
                     应用的语言不在这个表里时，插件一律用英语显示（用户 2026-09-25 定的）",
                    meta.langs
                ),
            });
        }

        // ── [devserver] ─────────────────────────────────────────────────
        // ⚠️ 两条校验都是**越界**，不是"写错了"：
        // ① `entry` 只能是文件名——它是宿主拼进"文档同目录"的一个片段，
        //    带 `../` 或绝对路径就是让插件往任意地方写文件；
        // ② 申请了 `process.devserver` 却没有 `[devserver]` 段 = 能力空转，
        //    加载时报出来，别等到用户点了按钮才发现什么都起不来。
        let devserver = check_devserver(devserver, &capabilities, file)?;

        Ok(Manifest {
            meta,
            dir,
            capabilities,
            devserver,
        })
    }

    pub fn has(&self, cap: Capability) -> bool {
        self.capabilities.contains(&cap)
    }
}

/// 校验 `[devserver]` 段。两条都是**越界**，不是"写错了"：
///
/// 1. **`entry` 只能是文件名**——宿主会把它拼进"文档同目录"，`../` 或绝对路径
///    就是让插件往任意位置写文件。这是整个清单里除 `entry` 之外第二处路径校验，
///    口径与那条一样：**能挡在门口的就别留到运行时**。
/// 2. **申请了 `process.devserver` 却没有 `[devserver]` 段** = 能力空转。
///    加载时报出来，别等用户点了按钮才发现什么都起不来。
///    反向（有 `[devserver]` 却没申请能力）也一样报：那份声明永远不会被读，
///    留着只会让下一个读清单的人以为它生效。
fn check_devserver(
    spec: Option<DevServerSpec>,
    capabilities: &[Capability],
    file: &Path,
) -> Result<Option<DevServerSpec>> {
    let 申请了 = capabilities.contains(&Capability::ProcessDevServer);

    let Some(spec) = spec else {
        if 申请了 {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: "申请了 `process.devserver` 却没有 `[devserver]` 段——\
                         那一格能力放行的就是段里那条命令，没有段就没有命令"
                    .to_owned(),
            });
        }
        return Ok(None);
    };

    if !申请了 {
        return Err(NotaError::Manifest {
            file: file.to_path_buf(),
            reason: "写了 `[devserver]` 却没申请 `process.devserver` 能力——\
                     那段声明永远不会生效"
                .to_owned(),
        });
    }

    if spec.cmd.trim().is_empty() {
        return Err(NotaError::Manifest {
            file: file.to_path_buf(),
            reason: "`[devserver] cmd` 不能为空".to_owned(),
        });
    }

    if let Some(name) = &spec.entry {
        // ⚠️ 判据是「有没有路径成分」而不是「有没有 `..` 子串」：
        // `/etc/passwd`、`a/b.md`、`a\b.md` 三种都要挡，而 `..x.md`
        // 这种正经文件名不该被误伤。
        let 越界 = Path::new(name)
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)));
        if 越界 {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!(
                    "`[devserver] entry` 只能是文件名（现在写的是 `{name}`）——\
                     它由宿主决定落在哪个目录"
                ),
            });
        }
    }

    Ok(Some(spec))
}

/// 插件 id 在**事件通道名**里的写法。
///
/// # 为什么需要这么一个函数
///
/// 清单里的 id 允许 `.`（`nota.git`、`nota.ai` 就是这么写的，反域名风格），
/// 而 **Tauri 的事件名只允许字母数字与 `-` `/` `:` `_`**——一个点就让 `emit`
/// 直接报错。踩到它的样子是：插件加载"成功"，但一 `emit` 就抛
/// `only alphanumeric, '-', '/', ':', '_' permitted for event names`，
/// 而且**只在这个插件第一次发事件时才炸**，静态看代码完全看不出来。
///
/// # 口径
///
/// **允许集合里的字符原样保留，不在集合里的一律换成 `-`。**
/// 允许集合与 Tauri 的判据一致：字母数字 + `-` + `_`（`/` 与 `:` 也在 Tauri 名单里，
/// 但 id 的校验不会放它们进来）。所以：
///
/// - `.` → `-`：这是**唯一**会被改写的常见字符，`nota.git` 变成 `nota-git`。
///   ⚠️ **`_` 不会被改**——它本来就在允许集合里，改了反而多此一举。
///   （本注释早期版本写成"`.` / `_` 与 `-` 是同一个字符"，那是错的；
///   `channel_id("a_b-c") == "a_b-c"` 有用例钉着，见 `docs/07` BUG-3。）
/// - 于是 `nota.git` 与 `nota-git` 这两个**都合法**的 id 会撞成同一个通道，
///   而 `nota_git` 与 `nota-git` **不撞**。撞了事件就分不清是谁发的，
///   所以 `PluginHost::discover()` 会**把后一个判为加载失败**，而不是让它们悄悄混在一起。
///
/// 返回的串由 `[A-Za-z0-9_-]` 组成，插进 `plugin:<id>:<名字>` 里一定合法。
pub fn channel_id(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

/// 在「插件目录」里找一个插件的清单文件。
///
/// 认两种形状，方便开发时少写一层：`<dir>/plugin.toml`，或 `<dir>/<id>/plugin.toml`。
pub fn find_manifests(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();

    let direct = root.join("plugin.toml");
    if direct.is_file() {
        out.push(direct);
        return out;
    }

    let Ok(entries) = std::fs::read_dir(root) else {
        return out;
    };
    for entry in entries.flatten() {
        // ⚠️ **点开头的目录一律不看**：惯例上那是隐藏目录（`.git`、编辑器临时目录），
        // 而且宿主自己也往里放东西——安装一个插件时先解到
        // `.装到一半-<pid>/`（见 `plugin::PluginHost::装`），**半路死掉的那个**
        // 正好留在这里。不跳的话它下次启动会被当成一个插件（而且因为路径排序
        // 靠前，还会把真正那份挤掉），用户看到的是一个永远加载失败的幽灵插件。
        if entry
            .file_name()
            .to_str()
            .map(|n| n.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        let candidate = entry.path().join("plugin.toml");
        if candidate.is_file() {
            out.push(candidate);
        }
    }
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_manifest(dir: &Path, body: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join("plugin.toml"), body).unwrap();
    }

    #[test]
    fn 好清单能解析出能力() {
        let dir = std::env::temp_dir().join("nota-manifest-good");
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            r#"
[plugin]
id = "nota.git"
name = "Git"
api = 2
capabilities = ["document.read", "process.git"]
"#,
        );

        let m = Manifest::load(&dir.join("plugin.toml")).unwrap();
        assert_eq!(m.meta.id, "nota.git");
        assert_eq!(m.meta.entry, "main.lua", "entry 该有默认值");
        assert!(m.has(Capability::ProcessGit));
        assert!(!m.has(Capability::NetworkHttp));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 通道名里的点要换成连字符() {
        // 反域名风格的 id 是主流写法，而 Tauri 的事件名不认点——
        // 直接拼进 `plugin:<id>:<名字>` 会让每一次 emit 都抛错。
        assert_eq!(channel_id("nota.git"), "nota-git");
        assert_eq!(channel_id("nota.ai"), "nota-ai");
        // 安全的字符原样留着，别把 `_` 也一起换掉。
        assert_eq!(channel_id("a_b-c"), "a_b-c");
        // 空 id 清单那一关已经拦了，这里只管"结果一定合法"。
        for id in ["nota.git", "a.b.c", "x/y", "带中文的"] {
            let c = channel_id(id);
            assert!(
                c.chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'),
                "`{id}` 归一后仍有不合法字符：{c}"
            );
        }
    }

    #[test]
    fn api_版本不符要拒载() {
        let dir = std::env::temp_dir().join("nota-manifest-apimismatch");
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = 99\n",
        );

        let err = Manifest::load(&dir.join("plugin.toml")).unwrap_err();
        assert!(
            // ⚠️ `have` 用常量而不是字面量：这条用例问的是"**版本不符会不会被拦**、
            // 报的数对不对"，不是"宿主现在是第几版"。写死一个数的话，每次升版本
            // 都会红一条**与它无关**的用例（2026-09-25 升 2 的时候就这样红过）。
            matches!(err, NotaError::PluginApiMismatch { wanted: 99, have: NOTA_PLUGIN_API_VERSION, .. }),
            "实际：{err}"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn entry_不许逃出插件目录() {
        let dir = std::env::temp_dir().join("nota-manifest-escape");
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = 2\nentry = \"../../evil.lua\"\n",
        );

        assert!(Manifest::load(&dir.join("plugin.toml")).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 不认识的能力要报错而不是静默忽略() {
        let dir = std::env::temp_dir().join("nota-manifest-unknowncap");
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = 2\ncapabilities = [\"fs.everything\"]\n",
        );

        let err = Manifest::load(&dir.join("plugin.toml")).unwrap_err();
        assert!(err.to_string().contains("fs.everything"), "实际：{err}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ⚠️ 点开头的目录**不是插件**。
    ///
    /// 钉的是这条具体的现象：安装插件时先解到 `.装到一半-<pid>/plugin.toml`，
    /// 半路死掉就留在插件目录里了。不跳的话它下次启动会被当成一个插件——
    /// 而且因为路径排序靠前（`.` 的字节序小于字母），它还会把真正那一份挤掉。
    #[test]
    fn 点开头的目录不当插件() {
        let dir = std::env::temp_dir().join("nota-manifest-dotdir");
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(&dir.join("a.b"), "[plugin]\nid = \"a.b\"\nname = \"A\"\napi = 2\n");
        write_manifest(
            &dir.join(".装到一半-1"),
            "[plugin]\nid = \"a.b\"\nname = \"A\"\napi = 2\n",
        );

        let 找到 = find_manifests(&dir);
        assert_eq!(找到.len(), 1, "实际找到：{找到:?}");
        assert!(找到[0].ends_with("a.b/plugin.toml"), "实际：{:?}", 找到[0]);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
