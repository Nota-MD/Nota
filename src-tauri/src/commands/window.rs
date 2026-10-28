//! **窗口自身的控制**（2026-09-27）：开发者工具、开一个新窗口。
//!
//! # 为什么这里只有两条命令
//!
//! 「窗口置顶」**不在这里**——它前端直接用 JS API 就够了
//! （`getCurrentWindow().setAlwaysOnTop()`，读回来是 `isAlwaysOnTop()`），
//! 而菜单上那个勾的判据**必须是"从窗口读回来的"**（与全屏同一条口径，
//! 见 `ui/useImmersive.ts`）。走 IPC 的话要多一条"读回来"的命令，
//! 而那条命令除了转发没有任何判断，纯属多一层。
//!
//! 「开发者工具」不一样：**它没有 JS API**。Tauri 的 `devtools` feature 只给了
//! Rust 侧一个 `WebviewWindow::open_devtools()`，前端够不着，所以必须在这儿开一条。
//!
//! ⚠️ **`devtools` 是在 `Cargo.toml` 里显式打开的**（`tauri = { features =
//! ["protocol-asset", "devtools"] }`）。去掉那个 feature，这个文件**编译不过**
//! ——不是"静默失效"，这正是要的：菜单里那一条要么真的能开，要么整仓编译失败。
//!
//! # 「在新窗口中打开」为什么是**再起一份进程**，不是 `WebviewWindowBuilder`
//!
//! 同一个进程里再建一个 webview 是能做到的（Tauri 就那一个 API），但那样两个
//! 窗口共用同一份 `AppState`：**文档表是同一张**，于是"新窗口"里看到的还是原来
//! 那一堆标签，关一个两边一起变。那不是用户要的"新窗口"。
//!
//! 再起一份进程天然就是独立的（文档、工作区、插件各一份），代价只有一处：
//! **跳过单实例那一关**（`cli.rs` 的 `--new-window`，判据与代价写在 `lib.rs` ⓿'）。

use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::error::{NotaError, Result};
use crate::state::AppState;

/// 主窗口的 label。⚠️ 与 `tauri.conf.json` 里那个窗口的 `label` **必须一致**；
/// 写错了的症状是"点了没反应"（命令报"找不到窗口"，而按钮看着是亮的）。
const 主窗口: &str = "main";

/// 编辑器和界面主题都就绪后，把预热窗口移到屏幕中央并显示。
///
/// 窗口在 `tauri.conf.json` 里先创建在屏幕外、隐藏任务栏按钮。隐藏窗口的
/// WebView 会被 WebKit 暂停动画帧，编辑器初始化反而可能永远等不到；因此让它在
/// 屏幕外正常渲染，就绪后再移入视野。用户第一次看到窗口时，正文已经可输入。
#[tauri::command]
pub fn nota_window_show_main(app: tauri::AppHandle) -> Result<()> {
    let 窗 = app
        .get_webview_window(主窗口)
        .ok_or_else(|| NotaError::other(format!("找不到窗口 `{主窗口}`")))?;
    窗.set_skip_taskbar(false)
        .map_err(|e| NotaError::other(format!("显示任务栏入口失败：{e}")))?;
    // 窗口此前在屏幕外保持可见，以便 WebView 正常初始化。Windows 的 DWM
    // 会把从 -10000,-10000 到屏幕中央的长距离移动演成开场动画；先收起再
    // 定位显示可以只提交一次静态帧。X11 上这一对 hide/show 反而会多花近
    // 一秒，因此只在 Windows 走这条路。
    #[cfg(target_os = "windows")]
    窗.hide()
        .map_err(|e| NotaError::other(format!("收起预热窗口失败：{e}")))?;
    窗.center()
        .map_err(|e| NotaError::other(format!("居中主窗口失败：{e}")))?;
    窗.show()
        .map_err(|e| NotaError::other(format!("显示主窗口失败：{e}")))?;
    窗.set_focus()
        .map_err(|e| NotaError::other(format!("聚焦主窗口失败：{e}")))?;
    crate::日志!("[nota] editor ready; showing main window");
    Ok(())
}

/// 打开独立的原始调试日志窗口；创建失败时退回纯 Rust 系统查看器。
#[tauri::command]
pub fn nota_window_open_debug_log(app: tauri::AppHandle) -> Result<()> {
    crate::日志!("[nota] opening debug log");
    if let Some(窗) = app.get_webview_window("debug-log") {
        窗.show()
            .map_err(|e| NotaError::other(format!("显示调试日志窗口失败：{e}")))?;
        窗.set_focus()
            .map_err(|e| NotaError::other(format!("聚焦调试日志窗口失败：{e}")))?;
        return Ok(());
    }
    let built = WebviewWindowBuilder::new(
        &app,
        "debug-log",
        WebviewUrl::App("debug-log.html".into()),
    )
    .title("Nota Debug Log")
    .inner_size(920.0, 620.0)
    .min_inner_size(560.0, 320.0)
    .build();
    if built.is_ok() {
        return Ok(());
    }
    let 程序 = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("找不到 Nota 自己的可执行文件：{e}")))?;
    std::process::Command::new(&程序)
        .arg(crate::cli::调试日志选项)
        .spawn()
        .map_err(|e| NotaError::other(format!("启动调试日志失败：{e}")))?;
    Ok(())
}

/// 打开或聚焦编入前端的帮助窗口。
///
/// 帮助正文由 `ui/HelpWindow.tsx` 生成 HTML，并与其他界面文字共用翻译表。
/// 它不挂 `<App />`、不加载 Markdown 渲染器，也不读取当前文档或插件状态。
/// `section` 只接受帮助页认识的几个锚点，避免把任意字符串塞进窗口 URL。
#[tauri::command]
pub fn nota_window_open_help(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    section: Option<String>,
) -> Result<()> {
    let section = 帮助章节(section.as_deref());
    let 标题 = if state.app_lang.to_ascii_lowercase().starts_with("zh") {
        "Nota 帮助"
    } else {
        "Nota Help"
    };
    if let Some(窗) = app.get_webview_window("help") {
        let mut url = 窗
            .url()
            .map_err(|e| NotaError::other(format!("读取帮助窗口地址失败：{e}")))?;
        url.set_fragment(None);
        url.set_query(Some(&format!("section={section}")));
        窗.navigate(url)
            .map_err(|e| NotaError::other(format!("切换到帮助章节失败：{e}")))?;
        窗.show()
            .map_err(|e| NotaError::other(format!("显示帮助窗口失败：{e}")))?;
        窗.set_focus()
            .map_err(|e| NotaError::other(format!("聚焦帮助窗口失败：{e}")))?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        "help",
        WebviewUrl::App(format!("help.html?section={section}").into()),
    )
    .title(标题)
    .inner_size(980.0, 720.0)
    .min_inner_size(620.0, 440.0)
    .center()
    .build()
    .map_err(|e| NotaError::other(format!("打开帮助窗口失败：{e}")))?;
    Ok(())
}

/// 上下文帮助只允许跳到已知章节；未知值回落到帮助首页。
fn 帮助章节(section: Option<&str>) -> &'static str {
    match section {
        Some("pandoc") => "pandoc",
        Some("printing") => "printing",
        Some("shortcuts") => "shortcuts",
        _ => "start",
    }
}

/// 打开主窗口的开发者工具（菜单「视图 → 开发者工具」/ `Shift+F12`）。
///
/// ⚠️ **再点一次是"聚焦"而不是"关掉"**：`open_devtools()` 在已经开着的时候
/// 只把它调到前面。前端菜单**不留勾**（它是动作不是状态）——「开发者工具开着没有」
/// 这件事 WebKitGTK 没有可读的接口，硬记一个内存状态就会和实际分叉。
#[tauri::command]
pub fn nota_window_open_devtools(app: tauri::AppHandle) -> Result<()> {
    let 窗 = app
        .get_webview_window(主窗口)
        .ok_or_else(|| NotaError::other(format!("找不到窗口 `{主窗口}`")))?;
    窗.open_devtools();
    Ok(())
}

/// 开一个新进程窗口；有路径时顺便打开那份文档，没有路径时打开空白工作区。
///
/// 标签页右键传路径；「文件 → 新建窗口」不传路径。未保存的内存文档仍只能
/// 留在原进程，不能跨进程复制。
///
/// ⚠️ **不 `wait()`**：等它退出等于把主窗口一起卡住，而新窗口活多久与这里无关。
/// 但 `spawn` 的失败**如实报错**（可执行文件没了、权限不对），别静默——
/// "点了菜单什么都没发生"是最难查的一种症状。
#[tauri::command]
pub fn nota_window_open_new(path: Option<String>) -> Result<()> {
    let 程序 = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("找不到 Nota 自己的可执行文件：{e}")))?;
    let mut command = std::process::Command::new(&程序);
    command.arg(crate::cli::新窗口选项);
    if let Some(path) = path.filter(|path| !path.trim().is_empty()) {
        command.arg(&path);
    }
    command.spawn()
        .map_err(|e| {
            NotaError::other(format!("起不了新窗口（{}）：{e}", 程序.display()))
        })?;
    crate::日志!("[nota] new window: {}", 程序.display());
    Ok(())
}

/// **真的退出**（2026-10-16 新增，朋友清单第 7／16 条「退出软件时对更改进行保存/弹窗」）。
///
/// # 它为什么存在：退出的决定权在前端，退出的动作在后端
///
/// 「关窗口时还有没保存的改动」这句话**只有前端答得出**：文档的正文真相在编辑器
/// 那棵树上（宿主手里那份是镜像），而"哪几份是脏的"是 `ui/useDocuments.ts` 那份
/// 列表。所以流程是**两段**：
///
/// 1. 用户点窗口的叉（或 `Alt+F4`、或桌面环境的关闭）→ `lib.rs` 的
///    `WindowEvent::CloseRequested` **先把这一下挡回去**（`api.prevent_close()`），
///    发一条 `nota:close-requested` 给前端；
/// 2. 前端按设置（`confirm_unsaved`）与那几份文档脏不脏去问用户、按答案存盘，
///    **答案是要退**的时候才调这一条命令——它就是这里的 `app.exit(0)`。
///
/// ⚠️ **`app.exit(0)` 不会再走一次 `CloseRequested`**（它直接进退出流程），
/// 所以这里**不需要**再记一个"已经确认过了"的标志位去防自锁。反过来也成立：
/// 真要有第二道闸，就会出现"确认过了、但它又问一遍"的循环。
///
/// ⚠️ **它不给参数、也没有"退出码"这一格**：正常退出就是 0。
#[tauri::command]
pub fn nota_quit(app: tauri::AppHandle) {
    crate::日志!("[nota] quit confirmed by frontend");
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::帮助章节;

    #[test]
    fn 帮助章节只落到白名单() {
        assert_eq!(帮助章节(Some("pandoc")), "pandoc");
        assert_eq!(帮助章节(Some("printing")), "printing");
        assert_eq!(帮助章节(Some("shortcuts")), "shortcuts");
        assert_eq!(帮助章节(Some("../settings")), "start");
        assert_eq!(帮助章节(None), "start");
    }
}
