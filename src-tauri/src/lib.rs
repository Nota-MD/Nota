//! Nota 宿主库。
//!
//! 启动顺序是**有讲究的**（下面 `run()` 里每一步都注了为什么）：
//!
//! 1. 读设置（读不出来就回默认值并记一笔，**不让应用打不开**）；
//! 2. 探插件目录、加载插件——**必须在 Tauri 起来之后**，因为插件的 `nota.ui.*`
//!    要发事件给前端，而那需要 `AppHandle`；
//! 3. 组装 `AppState` 交给 Tauri 托管。
//!
//! ⚠️ 插件起的那些开发服务器（`devserver.rs`）**不塞进 `AppState`**：管的是
//! **一批子进程的生死**，与文档/设置/插件都无关。单独 `manage` 一份，
//! 退出时统一收掉（见下面 `RunEvent::Exit` 那段）。
//!
//! ⚠️ 那一步"窗口显示后把插件的菜单/面板补发给前端"**已经取消**（BUG-13）：
//! 声明改走 registry **拉**（`nota_plugin_panels` / `nota_plugin_menus`），
//! 不经事件，所以不存在赛跑。`nota_frontend_ready` 只剩"前端能收事件了"这一个含义。

pub mod cli;
pub mod commands;
#[cfg(target_os = "linux")]
pub mod cups;
pub mod devserver;
pub mod debug_log;
pub mod diagnostics;
pub mod diff;
pub mod document;
pub mod error;
pub mod file_move;
pub mod focus;
pub mod format_keys;
pub mod heartbeat;
pub mod image;
pub mod lang;
pub mod log;
pub mod lua;
pub mod mcp;
pub mod native_menu;
pub mod pandoc;
pub mod pandoc_format;
/// pandoc 的**探测那一半**（2026-09-29 从 `pandoc.rs` 拆出，见那边的模块注释）。
pub mod pandoc_probe;
pub mod paths;
pub mod pdf_print;
pub mod pdf_render;
pub mod print_job;
pub mod plugin;
pub mod proc;
pub mod remote;
pub mod session;
pub mod settings_export;
pub mod spell;
pub mod settings;
pub mod single_instance;
pub mod state;
pub mod table_width;
pub mod theme_assets;
pub mod themes;
pub mod ui_styles;
pub mod update;
pub mod upload;
pub mod url_scheme;
pub mod watch;

use std::sync::{Arc, Mutex};

use lua::HostContext;
use plugin::PluginHost;
use settings::Settings;
use state::AppState;
use tauri::{Emitter, Manager};

/// WebKitGTK 渲染器的**安全回退开关**。默认走 DMA-BUF/GPU。
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
/// ⚠️ **2026-10-18 改为默认不关**：真实使用里强制关 DMA-BUF 会把频繁重绘压到
/// 15–30Hz，代码块打字和滚动明显卡顿。只有显式设置
/// `NOTA_SAFE_RENDERING=1` 才进入旧的安全回退；用户自己给
/// `WEBKIT_DISABLE_DMABUF_RENDERER` 任何值时仍然完全听用户的。
/// ⚠️ **只管 Linux**：macOS 走 WKWebView、Windows 走 WebView2，都不经这条路。
fn 配置_webkit_渲染器() {
    if !cfg!(target_os = "linux") {
        return;
    }
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        return;
    }
    let 安全回退 = std::env::var("NOTA_SAFE_RENDERING").is_ok_and(|v| {
        matches!(
            v.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    });
    if !安全回退 {
        crate::日志!("[nota] WebKitGTK using default DMA-BUF/GPU rendering");
        return;
    }
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    crate::日志!(
        "[nota] NOTA_SAFE_RENDERING: WebKitGTK DMA-BUF renderer disabled; \
         compatibility fallback reduces scrolling and typing frame rate."
    );
}

pub fn run() {
    // 闸门开着就先自报一句：不然"我设了 NOTA_DEBUG 怎么什么都没有"和
    // "日志真的干净"从终端上看不出区别。这一行本身也走闸门，所以默认照旧静默。
    crate::日志!("[nota] debug mode enabled (NOTA_DEBUG); log output is normally suppressed");
    配置_webkit_渲染器();

    // 独立调试报告模式：完全不建 Tauri/WebView，前端白屏或 WebKit 初始化失败
    // 时仍能生成日志并交给系统文本查看器。
    if cli::要查看调试日志(std::env::args_os()) {
        match debug_log::生成并打开() {
            Ok(path) => eprintln!("[nota] 调试报告：{}", path.display()),
            Err(e) => {
                eprintln!("[nota] 打开调试日志失败：{e}");
                std::process::exit(5);
            }
        }
        std::process::exit(0);
    }

    // ── ⓿ 单实例 ──────────────────────────────────────────────────────────
    // ⚠️ **必须在 `Builder::build()` 之前**：晚了的话，第二次启动会先闪出一个
    // 空窗口再退出——用户看到的是"Nota 闪了一下就没了"，比没有单实例还糟。
    //
    // ⚠️ 抢不到位置时**把参数转交出去然后立刻退出**，不建窗口、不加载插件：
    // 这一份进程什么都没建，也没有任何要收摊的东西。
    // ⚠️ 走 `std::process::exit` 而不是从 `run()` 里返回：返回之后 `main`
    // 也就结束了，但真正的理由是不想让人以为"可以在这里做清理"——这里
    // 什么都还没起，没有清理可做。
    // ⚠️ 挑"要打开哪个"仍然只走 `cli.rs` 那一份规则（这里挑出来的东西还要
    // 转交给已经在跑的那一份，它那边也调同一个函数）。
    let 这次要开的 = cli::首个要打开的文件(std::env::args_os());

    // ── ⓿''' `--mcp`：AI 客户端连上来的入口（2026-09-27）────────────────────
    // 形态一（**最常见的那一种**）：已经有一份 Nota 在跑 → 这一份进程**不开窗、
    // 不当主人**，只把自己变成一根管子，把 stdio 接到那一份的 socket 上。
    // AI 于是够到的是用户**此刻正在编辑的那份文档**（那正是这条功能的意义）。
    //
    // ⚠️⚠️ **三种结局全都在这里退出，一种都不许"继续往下走"**（2026-09-29 改）。
    // 原来"一份 Nota 都没跑"是**照常启动**（开窗、抢单实例的位置、就地服务
    // MCP），代价是：MCP 客户端每次重启它那个服务器进程，**用户桌上就多一个
    // 他没要过的 Nota 窗口**，而客户端走的时候我们**故意不关窗**（用户正在
    // 编辑的东西不该被 AI 带走），于是窗口留下来 —— 用户报的原话就是
    // 「现在会不停新建窗口」。完整账在 `mcp` 模块头「为什么形态 2 不开窗」。
    //
    // ⚠️ 所以 `--mcp` 今天**既不建窗也不抢单实例的位置**了：它只有"转接"这
    // 一件事，转接不成就说一句人话退出。
    //
    // ⚠️ 说给 **stderr**：stdout 是协议通道（虽然这会儿会话已经结束），
    // 而 stderr 是 MCP 客户端会原样记进它自己日志的那一路——用户看不见我们的
    // 界面，这句就是他能拿到的唯一一句解释。
    let 要开_mcp = cli::要开_mcp(std::env::args_os());
    if 要开_mcp {
        let (码, 话) = match mcp::接上() {
            // 会话跑完 = 这一份进程**什么都没建**（没建窗、没加载插件、没抢
            // 位置），跟隔壁"已转交"那条一模一样，没有清理可做。
            mcp::结局::会话跑完 => std::process::exit(0),
            mcp::结局::没人听 => (
                2,
                "Nota 没在跑。请先打开 Nota——AI 客户端连上的是**它**手里的文档；\
                 `nota --mcp` 只做转接，不会替你开一个窗口。"
                    .to_string(),
            ),
            mcp::结局::会话断了(e) => (3, format!("与 Nota 的会话断了：{e}")),
            // ⚠️ **只有别的平台走得到这一档**（`mcp/mod.rs` 里那个
            // `#[cfg(not(unix))]` 的 `接上`）：Windows 上那条转接还没做。
            // 如实说一句，别让它冒充"没人听"——那会把人引到"去开一份 Nota"，
            // 而开了也没用。理由与欠账写在 `single_instance.rs` 文件尾。
            mcp::结局::平台不支持 => (
                4,
                "这个平台上还没有 `--mcp` 转接：Nota 的 MCP 挂在单实例那个 Unix socket 上，\
                 别的平台要另做一套（命名管道那一类）。"
                    .to_string(),
            ),
        };
        eprintln!("[nota] {话}");
        std::process::exit(码);
    }

    // ── ⓿' `--new-window`：**这一份进程不参与单实例**（2026-09-27）──────────
    // 标签页右键那一条「在新窗口中打开」就是靠它：Nota `spawn` 一份自己、
    // 带上这个选项和路径。用户要的是**第二个窗口**，而单实例那一关的语义正好
    // 相反（把参数转交给已经在跑的那一份、自己退出），所以这里**整关跳过**。
    //
    // ⚠️ **跳过的是"抢"，不是"收"**：这一份进程既不 `connect` 也不 `bind`，
    // 于是 `nota.sock` 仍然归第一份所有——第三次普通启动照旧转交给**第一份**
    // （不是最近开的这一份）。这是这个做法唯一的怪处，而它无害：转交那件事
    // 回答的是"哪个进程能收下并抬窗"，第一份一直在。
    //
    // ⚠️ **代价如实记一笔**：新窗口这一份**收不到** `nota:second-instance`
    // 事件（它没有 socket）。所以"把这个标签页送回原来那个窗口"这种操作
    // 做不了——用户明确说了不用考虑拖回来（原话「不用考虑拖回来的情况了」）。
    let 单实例 = if cli::要开新窗口(std::env::args_os()) {
        crate::日志!("[nota] --new-window: bypassing single instance");
        None
    } else {
        match single_instance::抢占(这次要开的.as_deref().map(|p| p.as_os_str())) {
            Ok(single_instance::决定::第一个(听)) => Some(听),
            Ok(single_instance::决定::已转交) => std::process::exit(0),
            // ⚠️ 起不来就**照常单开**，不拦启动：单实例是个便利，不是一个前提。
            // 拿不到运行目录、socket 文件建不出来，都不该让人用不了 Nota。
            Err(e) => {
                crate::日志!("[nota] single-instance unavailable (continuing): {e}");
                None
            }
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        // 剪贴板（2026-10-11）：菜单里那条「粘贴」从前只能读 WebKit 的
        // `navigator.clipboard.readText()`，而那个被挡在权限后面——被拒时只能弹一句
        // "请按 Ctrl+V"（用户：「剪切板始终显示要CtrlV粘贴，但是我已经是CtrlV了」）。
        // 现在读剪贴板走**宿主**（这个插件），菜单那条就真的能粘了。
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // ── ① 设置 ────────────────────────────────────────────────────
            // 读失败**不回滚启动**：一份坏掉的 settings.toml 不该让人连界面都进不去。
            // 退回默认值，用户至少能打开应用去改回来。
            //
            // ⚠️ 但**要把这件事说给用户听**（2026-09-25 改）。原来说给 stderr 听：
            // 双击图标进来的人看不到控制台，看到的是"我的设置变成了默认值"，
            // 而任何一次改动都会把那份读不懂的文件覆盖掉（备份见
            // `settings/mod.rs` 的 `留一份备份`）。那句话现在是启动 toast，
            // 走 `AppState::settings_problem` → `nota_settings_problem`。
            // ⚠️ 底下的 `日志!` **不是**那条提示（2026-09-25 起默认不输出）：
            // 提示条是**用户**的渠道，这一行是**开发者**的渠道，别拿它当兜底。
            let (settings, 启动时的问题) = match Settings::load() {
                Ok(s) => (s, None),
                Err(e) => {
                    crate::日志!("[nota] settings read failed; using defaults: {e}");
                    // ⚠️ 送上界面前**压成一行**：`toml` 的报错是多行的（带行号、
                    // 一个 `|` 画出来的箭头、还有出错那一行的原文），原样塞进提示条
                    // 就是一段六行的"ASCII 画"——用户第一眼看到的是"界面坏了"，
                    // 而不是"我那个文件第 2 行写错了"。压行**不丢信息**：
                    // 行号、原因、备份路径都还在，只是不再占六行。
                    let 话 = e
                        .to_string()
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ");
                    (Settings::default(), Some(话))
                }
            };
            log::设置调试模式(settings.general.debug_mode);
            crate::日志!(
                "[nota] runtime: version={} pid={} os={} arch={} profile={}",
                env!("CARGO_PKG_VERSION"),
                std::process::id(),
                std::env::consts::OS,
                std::env::consts::ARCH,
                if cfg!(debug_assertions) { "debug" } else { "release" }
            );
            crate::日志!(
                "[nota] settings loaded: strict_markdown={} physics={} ui_style={} ui_mode={:?} document_theme={} limit_text_width={} debug_mode={}",
                settings.strict_markdown,
                settings.enable_physics,
                settings.ui_style,
                settings.ui_mode,
                settings.document_theme,
                settings.limit_text_width,
                settings.general.debug_mode
            );
            if let Ok(path) = crate::paths::settings_file() {
                crate::日志!("[nota] settings file: {}", path.display());
            }

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

            // ── ②b 界面语言 ───────────────────────────────────────────────
            // ⚠️ **一次算清，之后不再变**：插件在加载时按这个语言挑好了自己的
            // 文案表（`lang/<tag>.toml`），运行中再变就会出现"外壳中文、插件英文"
            // 那种谁也解释不清的中间态。所以设置里那一格改完要**重启**才生效
            // ——这条写进了界面上那一行，也写进了 `settings/general.rs`。
            let 应用语言 = {
                let 设定 = settings_arc
                    .lock()
                    .map(|s| s.general.language.clone())
                    .unwrap_or_else(|_| crate::lang::自动.to_owned());
                crate::lang::有效语言(&设定, crate::lang::系统语言())
            };
            crate::日志!("[nota] interface language: {应用语言}");

            let resource_dir = app.path().resource_dir().ok();
            let base = HostContext {
                app: app.handle().clone(),
                documents: documents.clone(),
                settings: settings_arc.clone(),
                workspace: workspace.clone(),
                plugin_id: String::new(), // 每个插件加载时会被换成自己的 id
                应用语言: 应用语言.clone(),
            };
            // 插件发现要扫描清单、建 Lua 状态并跑 on_load。它不应挡住窗口创建：
            // 先把空宿主托管进去，等系统窗口和 WebView 开始绘制后，再由后台线程
            // 完成真正的加载。前端第一批插件清单命令会短暂等待 ready。
            let plugins = PluginHost::empty(&base);

            // ── ③ 交给 Tauri 托管 ─────────────────────────────────────────
            app.manage(AppState {
                documents,
                settings: settings_arc,
                workspace,
                plugins: Mutex::new(plugins),
                settings_problem: 启动时的问题,
                // 与插件加载时用的是同一个值（上面 ②b 算的那个）。
                app_lang: 应用语言,
            });
            // 两份**不往 `AppState` 里塞**的托管状态，理由一样：它们都不在
            // 「plugins → documents → settings」那条锁序上，谁也不该拿它们去
            // 排进那条队伍。
            //
            // ① 开发服务器：管的是插件起的那种子进程的生死（`nota.devserver`）。
            app.manage(devserver::DevServerState::new());
            // ② 编辑区里摊着的插件面板（`nota.ui.review`）：只有一格，
            //    "此刻界面上显示什么"这种东西不属于文档也不属于设置。
            //    ⚠️ 拿它**不需要** `plugins` 锁——插件正跑着（宿主握着那把锁）
            //    的时候，「回到正文」这个按钮还得能按（见 `commands/plugin.rs`）。
            app.manage(plugin::ReviewState::new());
            // ③ 探测结论的缓存（`nota.devserver.probe`）：让面板的 `render`
            //    **不必等**一次 `npx`——有结论就回，没有就回一句「正在检查」
            //    并在后台探（探完发事件叫前端重拉）。见 `lua/api/devserver.rs`
            //    的「探测缓存」一节（`docs/07` BUG-36）。
            app.manage(lua::api::devserver::ProbeCache::new());
            // ④ 外部改动监视器（2026-09-26 加）。同样**不往 `AppState` 里塞**：
            //    它只拿自己那一把锁、不碰文档/设置/插件（理由见 `watch.rs` 顶上
            //    "锁序"那段），塞进 `AppState` 反而会让人以为它在那条锁序上。
            //    ⚠️ 起它的这一步会开一条后台线程并注册 inotify 监视，所以在
            //    `setup` 里做、只做一次；前端那边是**拉**着用的
            //    （`nota_watch_sync` 报清单），不靠事件对账（BUG-13 的教训）。
            app.manage(watch::监视器::新建(app.handle().clone()));
            // ⑤ 面板心跳（2026-09-26 加）。同上**不往 `AppState` 里塞**：
            //    它一秒握一下 `plugins` 锁、读完就放，自己不在那条锁序上。
            //    ⚠️ 起线程这一步只做一次（心跳线程自己 `loop`，没有"重启"）。
            //    它叫醒的是**声明了 `live` 的面板**——今天只有写作统计一个，
            //    没声明的一律不受影响（`heartbeat.rs` 顶上那段）。
            app.manage(heartbeat::Heartbeat::default());
            heartbeat::起(app.handle().clone());
            // ⑥ 强制专注（2026-09-26 加）。⚠️ **这条不是插件，是核心功能**
            //    （用户原话：「这不是插件。这是核心功能」）——它要窗口焦点、
            //    要开一个置顶窗、要出声，三样都在插件沙箱之外。
            //    同样**不往 `AppState` 里塞**：账本自己一把锁，虽然每个 tick
            //    要读一次设置，但读法是"读了就放开、再动自己的账本"，
            //    没有排进 `plugins → documents → settings` 那条序。
            app.manage(focus::FocusState::default());
            focus::起(app.handle().clone());
            // ⑦ 单实例（2026-09-27 加）。⚠️ **位置很要紧**：上面那一堆
            //    `manage` / `起` 都已经注册完，接收线程第一条连接就是奔着
            //    "打开一份文档"来的——它 emit 的那条事件要有人收，收的是**前端**，
            //    所以这边只要把托管状态（退出时删 socket 要用的路径）先挂上。
            app.manage(single_instance::落点::default());
            if let Some(听) = 单实例 {
                single_instance::起(app.handle().clone(), 听);
            }
            app.manage(plugin::DeferredDiscovery::new(resource_dir, base));
            // ⑧ 把 `nota://` 接到本程序上（2026-09-27 加，"从 URL scheme 打开"
            //    那一格的注册那一半，解析在 `cli.rs`）。⚠️ 失败**不拦启动**：
            //    注册不上就是"点链接打不开"，那不该让应用起不来。
            //    ⚠️ 它**只在需要时**才动盘，见那个文件头（"幂等，而且只在必要时才动"）。
            url_scheme::注册();
            // ⑨ ⚠️ **MCP 服务器那一格 2026-09-29 删掉了**，位置留在这里说明它
            //    为什么不该回来：它原来是"这一份进程就是那个 Nota 时，在这个
            //    进程里服务 MCP"（`mcp::起`）。今天 `--mcp` 在 ⓿''' 那一步
            //    **三条路全都退出**（转接成功 / 没人在听 / 会话断了），根本走
            //    不到 `setup`，所以那个分支永远为假。留着一个永远为假的分支，
            //    读起来像"还存在一种在进程里直接服务 MCP 的形态"——而**那种
            //    形态正是用户报的「不停新建窗口」**（完整账在 `mcp` 模块头
            //    「为什么形态 2 不开窗」）。
            //
            // ⚠️ 真要让它回来，改的是 ⓿''' 那一段的口径，两处必须一起改。

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::diagnostics::nota_diagnostics,
            commands::diagnostics::nota_debug_log_read,
            commands::diagnostics::nota_debug_log_write,
            commands::file_picker::nota_picker_places,
            commands::file_picker::nota_picker_list,
            commands::file_picker::nota_picker_create_dir,
            commands::native_dialog::nota_dialog_native,
            commands::document::nota_doc_new,
            commands::document::nota_doc_new_with_text,
            commands::document::nota_doc_open,
            commands::document::nota_doc_sync,
            commands::document::nota_doc_settle,
            commands::document::nota_doc_cursor,
            commands::document::nota_doc_save,
            commands::document::nota_doc_rename,
            commands::document::nota_doc_move,
            commands::document::nota_doc_close,
            commands::document::nota_doc_delete,
            commands::document::nota_doc_set_active,
            commands::document::nota_doc_get,
            commands::document::nota_doc_list,
            commands::document::nota_doc_reload,
            commands::document::nota_doc_disk_text,
            commands::document::nota_doc_has_unsaved,
            commands::diff::nota_diff_texts,
            commands::table_width::nota_table_widths_get,
            commands::table_width::nota_table_widths_set,
            commands::table_width::nota_table_widths_forget,
            // 会话与最近文件（侧车 `session.toml`，形状见 `session.rs`）。
            commands::session::nota_session_get,
            commands::session::nota_session_set_open,
            commands::session::nota_session_set_scroll,
            commands::session::nota_session_forget_recent,
            commands::session::nota_session_clear,
            commands::session::nota_session_file,
            commands::watch::nota_watch_sync,
            commands::export::nota_export_write,
            commands::export::nota_export_write_bytes,
            commands::export::nota_export_print,
            commands::export::nota_export_reveal,
            // 应用内打印（2026-10-17）：列打印机 / 出 PDF＋预览 / 投递。
            commands::print::nota_print_supported,
            commands::print::nota_print_printers,
            commands::print::nota_print_prepare,
            commands::print::nota_print_system,
            commands::print::nota_print_send,
            commands::print::nota_print_save_pdf,
            commands::image::nota_image_place,
            commands::image::nota_image_data_url,
            commands::image_upload::nota_image_upload_get,
            commands::image_upload::nota_image_upload_set,
            commands::image_upload::nota_image_upload_one,
            commands::pandoc::nota_pandoc_probe,
            commands::pandoc::nota_pandoc_export,
            commands::pandoc::nota_pandoc_import,
            commands::workspace::nota_workspace_open,
            commands::workspace::nota_workspace_close,
            commands::workspace::nota_workspace_get,
            commands::workspace::nota_workspace_tree,
            commands::workspace::nota_workspace_excerpts,
            commands::settings::nota_settings_get,
            commands::settings::nota_settings_set,
            commands::window::nota_window_open_devtools,
            commands::window::nota_window_open_help,
            commands::window::nota_window_open_debug_log,
            commands::window::nota_window_show_main,
            commands::window::nota_quit,
            commands::window::nota_window_open_new,
            // 拖放那条路要的「这条路径是什么」（`commands/paths.rs`）。
            commands::path_kind::nota_paths_kind,
            // 页面引擎身上的开关（`commands/webview.rs`）：拼写检查。
            // ⚠️ 这三条是 `async`，理由见那个文件头（`with_webview` 走主线程）。
            commands::webview::nota_webview_spellcheck_get,
            commands::webview::nota_webview_spellcheck_set,
            commands::webview::nota_webview_spellcheck_languages_set,
            commands::webview::nota_webview_scroll_hard,
            // 拼写检查的**独立后端**（不借内核，见 `spell/mod.rs` 文件头）：
            // 引擎编在程序里（zspell），词典是数据（用户目录 ＋ 系统目录）。
            // ⚠️ 后五条是 2026-10-11 加的（词典从哪儿来那一组）。
            spell::nota_spell_check,
            spell::nota_spell_suggest,
            spell::nota_spell_dictionaries,
            spell::nota_spell_dict_dir,
            spell::nota_spell_dict_reveal,
            spell::nota_spell_dict_import,
            spell::nota_spell_word_add,
            spell::nota_spell_word_ignore,
            commands::settings::nota_settings_open_dir,
            commands::settings::nota_settings_problem,
            commands::settings::nota_app_lang,
            commands::settings::nota_settings_reset,
            commands::settings::nota_settings_export_inventory,
            commands::settings::nota_settings_export,
            // 强制专注（核心功能，不是插件）。⚠️ 只有这四条是"命令"，
            // 真正的计时在 `focus/mod.rs` 的后台线程里，前端碰不到它。
            commands::focus::nota_focus_get,
            commands::focus::nota_focus_start,
            commands::focus::nota_focus_stop,
            commands::focus::nota_focus_ack,
            // 这两条是给警报窗用的边角：一条兜底音、一条关窗。
            commands::focus::nota_focus_beep,
            commands::focus::nota_focus_close_alarm,
            commands::theme::nota_doc_themes,
            commands::theme::nota_doc_theme_css,
            commands::theme::nota_doc_themes_open_dir,
            // 界面风格里"用户导入的那一半"。⚠️ 内置档没有文件，
            // 所以 `nota_ui_style_css` 只对导入的 id 有效（`ui_styles.rs` 文件头）。
            commands::ui_style::nota_ui_styles,
            commands::ui_style::nota_ui_style_css,
            commands::ui_style::nota_ui_styles_open_dir,
            commands::update::nota_update_check,
            commands::update::nota_update_install,
            commands::update::nota_update_cancel,
            commands::plugin::nota_plugins_list,
            commands::plugin::nota_plugin_set_enabled,
            commands::plugin::nota_plugin_call,
            commands::plugin::nota_plugin_find_command,
            commands::plugin::nota_plugin_panels,
            commands::plugin::nota_plugin_panel_content,
            commands::plugin::nota_plugin_review,
            commands::plugin::nota_plugin_review_close,
            commands::plugin::nota_plugin_menus,
            commands::plugin::nota_plugin_install,
            commands::plugin::nota_plugin_uninstall,
            commands::plugin::nota_plugin_trust,
            commands::plugin::nota_plugin_setting_set,
            commands::plugin::nota_plugin_trust_list,
            commands::plugin::nota_plugin_updates,
            commands::plugin::nota_plugin_update,
            commands::plugin::nota_plugin_export,
            commands::plugin::nota_plugin_export_name,
            commands::plugin::nota_plugins_open_dir,
            commands::menu::nota_native_menu_apply,
            nota_frontend_ready,
            nota_startup_file,
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
            // ── 关窗口时先问一句（2026-10-16 加）──────────────────────────
            //
            // 用户朋友那份清单的第 7／16 条：「**功能:退出软件时对更改进行保存/弹窗**」。
            // 在那之前，点窗口的叉就是**直接退**——内存里没存的那几笔改动一个字
            // 都不问就没了，是那种"用户不会想到要报、但一定会骂"的事故。
            //
            // ⚠️ **这两个条件是"拦不拦"的全部判据，而且都在这儿判**：
            //   ① 设置里开着「关闭前先问我」（`Settings::confirm_unsaved`）；
            //   ② 宿主那份镜像里**确实有**没保存的改动。
            // 两条有一条不成立就直接放行——**没有未保存的改动就不该多一次往返**
            //（关一下窗口要等前端回话才退，那是另一种坏体验）。
            //
            // ⚠️ **问的那句话、存盘、以及"用户点了取消"这三件事一件都不在这儿**：
            // 正文真相与"哪几份是脏的"都在前端（见 `commands/window.rs::nota_quit`）。
            // 宿主只做一件事——把这一下**挡回去**，然后告诉前端"有人要关窗了"。
            //
            // ⚠️ **只拦 `main`**（与下面 `Focused` / `Destroyed` 两段同一条口径）：
            // 别的窗口（对话框、以后插件自己开的窗）关掉就该立刻关掉。
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && 关窗前要问(window) {
                    api.prevent_close();
                    let _ = window.app_handle().emit("nota:close-requested", ());
                }
            }

            // ── 强制专注靠这一枪吃饭 ────────────────────────────────────────
            //
            // ⚠️⚠️ **判据必须钉死在 `main` 上**，这里比 `Destroyed` 那一段更要紧：
            //
            // - 警报窗自己也会发 `Focused(true)`。一起算进去的话，"警报窗弹出来
            //   抢到焦点"会被记成"用户回来专注了"，于是**该罚的变成该奖的**，
            //   而且警报会在下一拍自己解掉——整个功能当场失效；
            // - 将来任何第三个窗（对话框、插件开的窗）同理。
            //
            // ⚠️ 注意它和 `Destroyed` 那一段的判据**方向相反**：那边是"不是 main
            // 就什么都别做"（别的窗关了不该卸插件），这边是"只有 main 才算数"。
            // 两段都写在同一个 `match` 之外，各判各的，别想着合并。
            if let tauri::WindowEvent::Focused(有焦点) = event {
                if window.label() == "main" {
                    if let Some(状态) = window.try_state::<focus::FocusState>() {
                        focus::窗口焦点(&状态, *有焦点);
                    }
                }
            }

            if let tauri::WindowEvent::Destroyed = event {
                // ⚠️⚠️ **必须按 label 分派**。下面那段会把**所有**插件都卸掉，
                // 而这个应用随时可能有别的窗口（对话框、以后哪个插件开的面板窗），
                // 不加判据的话，关掉任何一个别的窗口 = 把插件全关了，
                // 而且一点动静都没有（卸载只记日志）。
                //
                // ⚠️ 从 2026-09-25 起，**预览不再单开窗口**了：它搬进了右侧插件栏
                // （插件自己 `register_panel` 报一块 `kind = "frame"`，见
                // `lua/api/devserver.rs`）。所以下面这个 `_ => {}` 今天一次都跑不到。
                //
                // ⚠️ **但这一整个 `match` 不能简化掉**：`main` 那个 ARM 是关窗时
                // 卸插件的**唯一**一处，而"不分派 label"这件事踩过一次
                // （2026-09-23：叉掉预览窗 = 插件全没，见 `docs/01` 的老记录）。
                // 留着分派，将来谁再开第二个窗口时才不会又踩一遍。
                match window.label() {
                    "main" => {
                        // 关窗前给插件一次 on_unload，让它们有机会落盘自己的状态。
                        if let Some(state) = window.try_state::<AppState>() {
                            if let Ok(mut host) = state.plugins.lock() {
                                host.unload_all();
                            }
                        }
                    }
                    // 警报窗被关掉了（Alt+F4、或者窗口管理器直接关）——
                    // **当作"我回来了"**（2026-09-26 加）。
                    //
                    // ⚠️ 少了这一条会出现最难受的一种故障：窗没了、阶段还停在
                    // `alarm`，下一拍**又开一个**——用户按几次 Alt+F4 就冒出几个
                    // 窗，而且他会以为这软件坏了（他猜得没错）。
                    // ⚠️ 用 guard 而不是把常量直接写进模式：那个 label 只有一处
                    // 定义（`focus/alarm.rs::窗_LABEL`），写成字面量就是第二个真相源。
                    l if l == focus::alarm::窗_LABEL => {
                        if let Some(状态) = window.try_state::<focus::FocusState>() {
                            focus::确认(&状态);
                        }
                    }
                    // 别的窗口被关掉：**什么都不做**，插件留着。
                    _ => {}
                }
            }
        })
        // ── `Ctrl+B` / `Ctrl+I`：在 GTK 捕获阶段把它们截下来 ────────────────
        //
        // ⚠️ **必须在这里挂，不能提前到 `setup`**：`setup` 跑的时候窗口还没建
        //（`Builder::setup` 只是存个回调，建窗在 `build()` 里），那会儿拿不到
        // `Webview`。这个钩子给的就是**已经建好的那个 webview 本身**，正是
        // `format_keys::装上` 要的东西。
        //
        // ⚠️ 它每加载一轮页面跑一次（开发时 vite 热重载一次就是一枪），
        // 幂等那一道闸在 `format_keys.rs` 里，别挪出来。
        //
        // ⚠️ 失败**只记日志、不拦启动**：这条修的是"快捷键不灵"，
        // 而它挂了顶多是回到修复前的样子——绝不能因此让人进不去界面。
        // 这正是 BUG-49 那一条的处境（`docs/07`）；BUG-49 的完整来龙去脉
        // 写在 `format_keys.rs` 的文件头。
        .on_page_load(|webview, _| {
            if let Err(e) = format_keys::装上(webview) {
                crate::日志!("[nota] format shortcut hook unavailable (Ctrl+B uses fallback): {e}");
            }
        })
        .build(tauri::generate_context!())
        .expect("Nota 启动失败")
        .run(|app, event| {
            // ── 退出时把插件起的开发服务器全收掉（2026-09-25 加）──────────
            //
            // ⚠️ **不收就是漏**：那些进程是 `Command` 起的子进程，不在 Tauri 的
            // 管理范围内，主进程一退**它们自己接着跑**（2026-09-25 实测：SIGTERM
            // 掉 Nota 之后 Slidev 还占着 45795 端口，得手动 kill）。
            //
            // ⚠️ 这是**兜底**，不是唯一的路：平时收摊走插件自己的 `stop`
            // （用户点「停止预览」）。但这儿必须有——否则用户开着预览直接关应用，
            // 留下的是一个没人知道、也关不掉的服务器。
            //
            // ⚠️ 只认 `Exit`（清理阶段，一定跑得到），不认 `ExitRequested`
            // ——后者可以被"要不要保存"那种对话框取消掉。
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<devserver::DevServerState>() {
                    state.stop_all();
                }
                // 面板心跳（2026-09-26 加）。⚠️ 不叫停它也**不会**拖住退出：
                // 它是分离线程，进程一没它就没了。叫这一声是为了"这一拍之后
                // 别再往一个正在拆的 WebView 上发事件"——emit 本身失败也无所谓
                // （`heartbeat.rs` 里那条 `let _ =`），但让一条线程明知故犯地
                // 对着正在收摊的应用敲一秒的门，没有必要。
                if let Some(hb) = app.try_state::<heartbeat::Heartbeat>() {
                    hb.stop();
                }
                // 单实例那个 socket 文件（2026-09-27 加）。⚠️ 不删的后果是
                // **下一次启动会多问一句**（连上去发现没人听），谈不上故障；
                // 但攒在 `$XDG_RUNTIME_DIR` 里一个用不上的文件，会让下一个人
                // 以为 Nota 还开着。顺手删掉，成本是零。
                if let Some(落) = app.try_state::<single_instance::落点>() {
                    if let Ok(槽) = 落.0.lock() {
                        if let Some(p) = 槽.as_ref() {
                            let _ = std::fs::remove_file(p);
                        }
                    }
                }
            }
        })
}

/// 关窗前**要不要把这一下挡回去、让前端去问用户**。
///
/// ⚠️ **两条都成立才拦**：设置里开着「关闭前先问我」，**而且**镜像里确实有
/// 没保存的改动。读法按本仓的锁序（`plugins → documents → settings`）：这里只
/// 碰 `documents` 与 `settings`，而且是**先放掉 documents 再取 settings**，
/// 不把两把锁同时握着（同一条理由写在 `state.rs` 顶上）。
///
/// ⚠️ **读不到状态就放行**：拿不到（启动早期、`AppState` 还没 `manage`）时按
/// "不用问"办。拦一个自己都读不懂的窗口，最坏的结果是**关不掉**——那比少问一句
/// 严重得多。
fn 关窗前要问(window: &tauri::Window) -> bool {
    let Some(state) = window.try_state::<AppState>() else {
        return false;
    };
    let 有未保存 = state
        .documents
        .lock()
        .map(|docs| docs.has_unsaved())
        .unwrap_or(false);
    if !有未保存 {
        return false;
    }
    state
        .settings
        .lock()
        .map(|s| s.confirm_unsaved)
        .unwrap_or(false)
}

/// 启动时命令行里带的那个文件（`nota 笔记.md`），没有就是 `None`。
///
/// ⚠️ **由前端调，而不是在 `setup` 里直接打开**（2026-09-25）。两条理由：
///
/// 1. 打开文档那条路在前端只有一份（选中标签、刷列表、出错弹提示条都在
///    `App.tsx::openPath`）——宿主在自己那边再写一份，就是第二个真相源，
///    而且"读不出来"在那里**没有出路**：`setup` 里报错只能进终端，
///    双击文件的用户看不到。
/// 2. 这条路本身就是**桌面集成**，桌面集成该跟对话框、拖放走同一段代码。
///
/// 于是这个命令只做一件事：把参数挑出来交给前端。挑的规则（哪个参数算路径、
/// 为什么不在这一层判存在性）写在 `cli.rs`。
#[tauri::command]
fn nota_startup_file() -> Result<Option<String>, error::NotaError> {
    let path = match cli::首个要打开的文件(std::env::args_os()) {
        Some(p) => p,
        None => return Ok(None),
    };
    // ⚠️ 文件名不是合法 UTF-8 时**要报错上去，不要静默返回 `None`**（2026-09-25 改）。
    // 以前这里只往 stderr 记一行然后给个 `None`：用户双击一个这样的文件，
    // 界面上**什么都不发生**、也没有任何提示；而那一行从 2026-09-25 起
    // 还归了调试闸门，默认连终端都不打，等于彻底静默。往回传个 lossy 的串
    // 更糟——那会拼出一个**不一样的路径**，然后弹"路径不存在"（文件明明在），
    // 用户照着那句提示去哪儿都找不着问题。所以如实报错，让前端那条 toast 去说
    // （`App.tsx` 启动那一段给这一枪自带了 `catch`，翻不了整个 `Promise.all`）。
    Ok(Some(crate::paths::path_to_string(&path)?))
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
    app.state::<plugin::DeferredDiscovery>().start(&app);
    Ok(())
}
