//! Slidev 预览相关命令。
//!
//! 一次预览在前端看起来是一串动作，所以这里也是**一串短命令**，而不是一条大命令：
//!
//! ```text
//! probe_install（装没装）──> start ──> probe（轮询到通）──> openWindow
//!                                                   └──> sync（打字时反复调）──> stop
//! ```
//!
//! ⚠️ 最前面那条是 2026-09-24 加的：点菜单先出面板问"装没装"，没装就给一条
//! 去官网安装指南的路——**别在没装的机器上起进程**（那会变成几百 MB 的下载）。
//!
//! ⚠️ 为什么**没有**"start 之后在后端等端口"这一条：等到端口通可能要几分钟
//! （第一次会下载 Slidev），而 Tauri 的同步命令跑在主线程上——在后端睡，
//! 冻的就是整个界面。等待交给前端轮询 `probe`，后端的每条命令都是微秒级返回。
//! 详见 `slidev.rs` 文件头。
//!
//! ⚠️ 这一层**只有接线**：取锁、拿文档目录、开/关窗口。真正的活（挑端口、写入口、
//! 杀进程组）全在 `slidev.rs` 里，那儿的单测才有意义——命令层要真跑就得起一个
//! Tauri 应用实例，测不出什么。

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, State};

use crate::document::DocId;
use crate::error::{NotaError, Result};
use crate::slidev::{self, SlidevInfo, SlidevState};
use crate::slidev_probe::{self, SlidevProbe};
use crate::state::AppState;

/// 预览窗口的 label。
///
/// ⚠️ 三处必须一致：这里、`lib.rs` 里 `Destroyed` 那段认的字符串、
/// 以及前后端之间的口头约定（前端只知道"有个窗口叫这个"）。
/// 改成别的字符串**不会报错**，只会让"关窗口 → 收服务器"那条链静默断掉。
const WINDOW: &str = "slidev";

/// 主窗口的 label。取自 `tauri.conf.json` 的 `app.windows[0].label`。
const MAIN: &str = "main";

/// 起服务器。**不等端口**，起来了没有由前端 `probe` 决定。
///
/// 入口写在文档所在目录（相对图片才解析得对），所以这里要先从文档仓库里
/// 问出它的路径；问不到（新建未存盘）就交给 `slidev.rs` 退回数据目录。
#[tauri::command]
pub fn nota_slidev_start(
    app: AppHandle,
    state: State<'_, SlidevState>,
    doc_id: DocId,
    markdown: String,
) -> Result<SlidevInfo> {
    slidev::start(&state, entry_dir(&app, doc_id), doc_id, &markdown)
}

/// 本机装没装 Slidev —— 「视图 → Slidev 预览」那个面板要的内容。
///
/// ⚠️ **写成异步的**：它要起一个进程去问版本（正常一两秒，自定义命令最多 20 秒），
/// 而 Tauri 的同步命令跑在**主线程**上——在那儿等就是把界面冻住。这和后端那条
/// "start 不等端口"的规矩是同一个理由，见文件头。
///
/// ⚠️ 真正干活的还是 `spawn_blocking`：命令体本身也是异步的，在里面直接阻塞
/// 会把 tokio 的工作线程占住。探测是纯阻塞的活儿（等子进程），就该丢进阻塞池。
#[tauri::command]
pub async fn nota_slidev_probe_install(app: AppHandle, doc_id: DocId) -> Result<SlidevProbe> {
    let dir = entry_dir(&app, doc_id);
    tauri::async_runtime::spawn_blocking(move || slidev_probe::probe_install(dir.as_deref()))
        .await
        .map_err(|e| NotaError::other(format!("探测 Slidev 装没装失败：{e}")))
}

/// 这份文档的"项目根"：入口文件写进去、Slidev 拿它当项目根的那个目录。
///
/// ⚠️ 只认**已存盘**文档的目录：新建还没存盘的 `path` 是 `None`，这里就给 `None`，
/// 由 `slidev.rs` 决定退到哪儿（数据目录），别去猜"大概该放哪儿"。
///
/// ⚠️ 起预览（`nota_slidev_start`）和探测（`nota_slidev_probe_install`）**必须走
/// 同一份判断**：不然面板会替一个目录打包票，而真正起的时候入口写到另一个目录，
/// 于是"明明说装好了却起不来"。
fn entry_dir(app: &AppHandle, doc_id: DocId) -> Option<PathBuf> {
    let state = app.state::<AppState>();
    let docs = state.documents.lock().unwrap();
    docs.get(doc_id)
        .and_then(|d| d.path.as_ref())
        .and_then(|p| p.parent().map(Path::to_path_buf))
}

/// 端口通了没有。前端每 500ms 调一次——**所以它必须快**（探活超时 300ms）。
#[tauri::command]
pub fn nota_slidev_probe(state: State<'_, SlidevState>) -> bool {
    slidev::probe(&state)
}

/// 进程输出的最后几行。**启动失败时前端把它整段端给用户**——
/// 真正的病因（缺主题、端口被占）就在里面，我们编不出比它更准的话。
#[tauri::command]
pub fn nota_slidev_log(state: State<'_, SlidevState>) -> String {
    slidev::log_tail(&state)
}

/// 当前会话。前端热重载（改前端代码存盘）之后靠它把界面状态接回来——
/// 那种情况下 Rust 侧没重启，服务器还活着，而前端的 state 已经清零了。
#[tauri::command]
pub fn nota_slidev_status(state: State<'_, SlidevState>) -> Option<SlidevInfo> {
    slidev::status(&state)
}

/// 开预览窗口（已经开着就把它顶到前面）。
///
/// ⚠️ 窗口**开在 Rust 这边**而不是前端 `new WebviewWindow(...)`：位置要挨着主窗口，
/// 那得读主窗口的几何；而且"窗口和服务器同生共死"这条线也就不必跨进程传递。
/// 代价是开窗失败时前端拿到的只是一句话——所以前端在失败时会**退回系统浏览器**
/// （见 `App.tsx` 的 `openSlidev`），不让这一条路把功能整个堵死。
#[tauri::command]
pub fn nota_slidev_open_window(app: AppHandle, state: State<'_, SlidevState>) -> Result<()> {
    let Some(info) = slidev::status(&state) else {
        return Err(NotaError::other("Slidev 还没起来，没有可以打开的地址"));
    };
    open_window(&app, &info.url)
}

/// 把正文送到入口文件。Slidev 盯到变化就热更新自己，**不需要我们再传别的**。
#[tauri::command]
pub fn nota_slidev_sync(state: State<'_, SlidevState>, markdown: String) -> Result<()> {
    slidev::sync(&state, &markdown)
}

/// 收摊：杀进程组 + 删入口文件 + 关窗口。
///
/// ⚠️ **顺序不能反**：`slidev::stop` 里要取那把锁，而关窗口会同步触发 `Destroyed`
/// 回调，那个回调**也**要那把锁（它会再调一次 `stop`）。把 `close_window` 写在
/// `slidev::stop` 返回**之后**，锁已经放掉了，这条链才不会自己卡死。
#[tauri::command]
pub fn nota_slidev_stop(app: AppHandle, state: State<'_, SlidevState>) -> Result<()> {
    slidev::stop(&state);
    close_window(&app);
    Ok(())
}

// ── 窗口 ──────────────────────────────────────────────────────────────────

fn open_window(app: &AppHandle, url: &str) -> Result<()> {
    if let Some(existing) = app.get_webview_window(WINDOW) {
        // 重复点菜单时**不开第二个**：那个窗口是"当前这场预览"的投影，
        // 多开一个就会出现"两个窗口跟着同一份文件变"的怪相。
        let _ = existing.set_focus();
        return Ok(());
    }

    let parsed = url
        .parse::<tauri::Url>()
        .map_err(|e| NotaError::other(format!("预览地址不合法（{url}）：{e}")))?;
    let (x, y) = right_of_main(app);

    tauri::WebviewWindowBuilder::new(app, WINDOW, tauri::WebviewUrl::External(parsed))
        .title("Nota — Slidev 预览")
        .inner_size(960.0, 720.0)
        .position(x, y)
        .build()
        .map_err(|e| NotaError::other(format!("开 Slidev 预览窗口失败：{e}")))?;
    Ok(())
}

fn close_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.close();
    }
}

/// 主窗口右边挨着摆，留 8 像素缝。
///
/// ⚠️ **单位是逻辑像素**：`position()` 吃逻辑值，而 `outer_position()` /
/// `outer_size()` 给的是物理值，中间必须过一遍 `scale_factor`，否则在 2 倍屏上
/// 窗口会跑到两倍远的地方去。
///
/// 问不到主窗口几何时返回 `(0, 0)`（左上角）——**不报错**：窗口出现在哪儿是小事，
/// 因为定位失败就让整场预览起不来才是大事。
fn right_of_main(app: &AppHandle) -> (f64, f64) {
    const GAP: f64 = 8.0;
    let Some(main) = app.get_webview_window(MAIN) else {
        return (0.0, 0.0);
    };
    let (Ok(pos), Ok(size)) = (main.outer_position(), main.outer_size()) else {
        return (0.0, 0.0);
    };
    let scale = main.scale_factor().unwrap_or(1.0);
    let scale = if scale <= 0.0 { 1.0 } else { scale };
    (
        (pos.x as f64 + size.width as f64) / scale + GAP,
        pos.y as f64 / scale,
    )
}
