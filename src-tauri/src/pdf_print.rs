//! 用 **WebKit 自己**把一份 HTML 静默印成 PDF。**只有 Linux 有**。
//!
//! 这是 PDF 导出的**兜底**：pandoc 那条路走不通（没装 pandoc，或者没装排版引擎）
//! 时，用 Nota 里已经有的那个渲染引擎出 PDF。用户 2026-09-25 定的口径是
//! 「两条都留、pandoc 优先」，并且**每次都要说清楚这次走的是哪条**。
//!
//! # 为什么是"印"而不是"导"
//!
//! WebKitGTK 2.52 **没有导出 PDF 的 API**（实测：`webkit2gtk` 那个 crate 里没有
//! `print_to_pdf`，WebKitGTK 的 .so 里也没有任何 PDF 符号）。唯一走得通的是
//! **打印系统**：给一份 `PrintSettings` 指向"输出到文件"，再让 `WebKitPrintOperation`
//! 跑一遍——走的是系统打印后端，出来的就是 PDF。
//!
//! # 实测过的三件事（2026-09-25，容器里跑通的）
//!
//! 1. **必须同时设 `printer` 和 `output-uri`**。只设 `output-uri` 时 WebKit 会去起
//!    系统打印命令，报的是 `Failed to execute child process "lpr"`——因为"输出到文件"
//!    在 GTK 那边是**一台叫 `Print to File` 的假打印机**，不是 URI 的一个属性。
//! 2. **`Gtk.OffscreenWindow` 不行**：WebKit 起不来 GL（
//!    `GDK is not able to create a GL context`）。要的是"`realize()` 过但**从没
//!    `show()`** 的普通窗口"——它照样算有屏幕可画，用户眼前又不会闪一下。
//! 3. **`WebKitPrintOperation` 不是 `Gtk.PrintOperation` 的子类**，所以
//!    `set_export_filename` 那条路不通（那是另一套 API 上的方法）。
//!
//! # 两个必须记住的坑
//!
//! ⚠️ **对象得活到信号来**。印刷是异步的：对象在 `finished` / `failed` 之前被回收，
//! 轻则没结果、重则崩。所以有一个"印刷中"的登记处（`印刷中`），它**必须**是
//! `thread_local`——GObject 不是 `Send`，放进 `static Mutex` 连编译都过不去。
//!
//! ⚠️ **不许在自己的信号回调里把父窗口放掉**（那等于在释放正在使用的对象）。
//! 收工一律经 `glib::idle_add_local_once` 推到下一轮主循环再做。
//!
//! # 这台系统上没有它的时候
//!
//! 非 Linux 平台这个模块只有一句"没有"（见文件尾）：诚实地报"没有兜底"，
//! 而不是假装能导。

use std::path::Path;

// ⚠️ 同 `PRINT_TIMEOUT`：只有 Linux 那一套真印用得上（2026-10-10）。
#[cfg(target_os = "linux")]
use std::time::Duration;

use tauri::AppHandle;

use crate::error::{NotaError, Result};

/// 印一次最多等多久。超时**取消不了**那次印刷（WebKit 没给取消的口子），
/// 只能把窗口收掉、把结论报成失败——所以这个值要留得够宽。
// ⚠️ 只有 Linux 那一套真印用得上（`available()` 在别的平台上是 `false`，
// 打印那半边整个编不进来）。2026-10-10 做 Windows 编译尝试时量到的。
#[cfg(target_os = "linux")]
pub(crate) const PRINT_TIMEOUT: Duration = Duration::from_secs(120);

/// 这台系统上有没有"Nota 自己那套 PDF"。
pub(crate) fn available() -> bool {
    cfg!(target_os = "linux")
}

// ── Linux：真印 ───────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
pub fn print_html_to_pdf(
    app: &AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    target: &Path,
) -> Result<()> {
    linux::印刷(app, html, base_dir, target)
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::cell::RefCell;
    use std::sync::mpsc::{self, RecvTimeoutError, Sender};

    use gtk::glib;
    use gtk::prelude::*;
    // ⚠️ WebKit 那两个 trait 得**点名**引进来（这个 crate 没有 prelude）：
    // `load_html` / `print` / `connect_finished` 全在它们身上，不引入的话
    // 编译期报的是"没有这个方法"，而提示会指向 trait —— 一开始很容易看岔。
    // 用 `as _` 是为了不和 gtk 那边**同名**的 `PrintOperationExt` 撞上。
    use webkit2gtk::{PrintOperationExt as _, WebViewExt as _};

    /// 「输出到文件」那台假打印机的名字。**必须给**，理由见文件头第 1 条。
    const PRINTER: &str = "Print to File";
    /// 输出格式那个键的值。GTK 的文件后端认这三个：`pdf` / `ps` / `svg`。
    const FORMAT: &str = "pdf";
    /// 输出到哪儿的**设置键**。
    ///
    /// ⚠️ **这两个不是 API，是打印后端自己读的键名**——`gtk_print_settings_set("output-uri",
    /// …)` 那种写法（`PrintSettings::set` 是通用键值 setter）。找它们只能去
    /// **`libprintbackend-file.so` 里 `strings`** 看，头文件里没有：
    /// 那儿能读到 `output-uri` / `output-file-format` / `output-basename` / `output-dir`
    /// 四个键和打印机名 `Print to File`。
    ///
    /// ⚠️ **2026-09-25 的教训（这条踩过一次）**：先按名字猜着一路写成
    /// `gtk_print_settings_set_output_uri(…)` 并自己声明 `extern "C"`——**编译期全过、
    /// 链接期才炸**（`undefined reference`）。因为 libgtk-3 **没有**导出一个那样的符号
    /// （`nm -D` 里只有 `..._set_output_bin`）。⚠️ 判断"某个 C 函数在哪"**不能只看
    /// 绑定的 .rs 声明存不存在**，要 `nm -D --defined-only <so> | grep`。
    const KEY_URI: &str = "output-uri";
    const KEY_FORMAT: &str = "output-file-format";

    // 印刷途中必须活着的对象。**只能放 thread_local**（理由见文件头）。
    thread_local! {
        static 印刷中: RefCell<Option<会话>> = const { RefCell::new(None) };
    }

    struct 会话 {
        /// 那个**没显示过**的窗口。它同时是 WebView 的父节点，所以留着它就等于
        /// 留着整棵界面树。
        window: gtk::Window,
        /// 印刷开始之后才有。它异步进行，得有人持有到信号来。
        op: Option<webkit2gtk::PrintOperation>,
    }

    impl Drop for 会话 {
        /// 手工把窗口关掉，而不是等引用计数归零。
        ///
        /// ⚠️ 这不是多余的：窗口是**隐藏**的，没有"用户关掉它"这条路，
        /// 而一次导出失败/超时之后它要是还活着，就是每次导出漏一个窗口。
        /// 显式关掉让"收工"这件事一眼看得见——`window` 这个字段也不会
        /// 落成"只为了持有而存在"的死字段。
        fn drop(&mut self) {
            self.window.close();
        }
    }

    /// 把印了一半的东西收掉。**只在主线程上调**。
    fn 收工() {
        印刷中.with(|c| {
            // 放掉会话 = 放掉窗口 = 销毁那棵界面树。⚠️ 所以它只能从主循环的空闲
            // 回调里调，不能从 WebView 自己的信号处理里调（见文件头）。
            let _ = c.borrow_mut().take();
        });
    }

    pub(super) fn 印刷(
        app: &AppHandle,
        html: &str,
        base_dir: Option<&Path>,
        target: &Path,
    ) -> Result<()> {
        let target_uri = 转地址(target)?;
        // ⚠️ 末尾那个斜杠不能少：少了的时候最后一段会被当成**文件名**替换掉，
        // 于是 `![](./img.png)` 解析到文档目录的上一级去——而图片裂了**不会报错**。
        let base_uri = match base_dir {
            Some(dir) => {
                let mut uri = 转地址(dir)?;
                if !uri.ends_with('/') {
                    uri.push('/');
                }
                Some(uri)
            }
            None => None,
        };

        let (tx, rx) = mpsc::channel::<std::result::Result<(), String>>();
        let html = html.to_string();
        // ⚠️ GTK 那一套只能在主线程上碰，而这条命令跑在异步线程里——所以整个
        // "建窗口 + 开印"要交回去做，这边只等结论。
        //
        // ⚠️ 这个闭包**立刻返回**：结果经 `tx` 回传（占着主线程等信号 = 死锁）。
        app.run_on_main_thread(move || 起印刷(&html, base_uri.as_deref(), &target_uri, tx))
            .map_err(|e| NotaError::other(format!("把印刷任务交给主线程失败：{e}")))?;

        match rx.recv_timeout(PRINT_TIMEOUT) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(NotaError::other(e)),
            Err(RecvTimeoutError::Timeout) => {
                // 超时：让主线程把窗口收掉（那次印刷取消不了，见 PRINT_TIMEOUT）。
                let _ = app.run_on_main_thread(收工);
                Err(NotaError::other(format!(
                    "印这份 PDF 超过 {} 秒还没结束，已经放弃",
                    PRINT_TIMEOUT.as_secs()
                )))
            }
            Err(RecvTimeoutError::Disconnected) => {
                Err(NotaError::other("印刷任务没了下文（主线程那边可能已经退出）"))
            }
        }
    }

    /// 转成 `file://` 地址。⚠️ 用 glib 那个函数而不是自己拼字符串：目录名里
    /// 有空格、`#`、中文时自己拼出来的地址是**错的**，而且错得没声没响。
    fn 转地址(path: &Path) -> Result<String> {
        glib::filename_to_uri(path, None)
            .map(|u| u.to_string())
            .map_err(|e| NotaError::other(format!("{} 转不成地址：{e}", path.display())))
    }

    /// 建窗口、装 WebView、开印。**在主线程上跑**，而且**立刻返回**——
    /// 结果经 `tx` 回传（占着主线程等信号就是死锁）。
    ///
    /// ⚠️ 这里**没有**返回错误那一路：建 GTK 对象和 `load_html` 都不返回失败，
    /// 真正的失败只有两种，各自有各自的出口——`failed` 信号（WebKit 说自己印不了）
    /// 和等的人那边的超时（连信号都没来）。别在这儿另造一个"起不来"的分支：
    /// 它没有对应的真实故障，只会让人以为覆盖到了什么。
    ///
    /// ⚠️ 也**没有**接 `load-failed`：那个信号在**一张图片 404 时也会响**，
    /// 而"图裂了照样导"正是打印那条路的既定行为（见 `commands/export.rs` 文件头）。
    /// 把子资源失败当致命错，会让一份少一张图的文档整个导不出来。
    fn 起印刷(
        html: &str,
        base_uri: Option<&str>,
        target_uri: &str,
        tx: Sender<std::result::Result<(), String>>,
    ) {
        // ⚠️ 只 `realize()`、**不 `show()`**（理由见文件头第 2 条）。
        let window = gtk::Window::new(gtk::WindowType::Toplevel);
        let webview = webkit2gtk::WebView::new();
        window.add(&webview);
        window.realize();

        // 会话**先**挂上：下面那个闭包不许持有窗口（闭包归 webview 管、webview 又
        // 归窗口管，那就是个引用环，窗口永远释放不掉）。
        印刷中.with(|c| {
            let _ = c
                .borrow_mut()
                .replace(会话 {
                    window: window.clone(),
                    op: None,
                });
        });

        let settings = gtk::PrintSettings::new();
        settings.set_printer(PRINTER);
        // 落点与格式（键名与理由见上面那两条常量）。
        settings.set(KEY_URI, Some(target_uri));
        settings.set(KEY_FORMAT, Some(FORMAT));

        // ⚠️ 闭包**不捕获 `webview`**，用信号自己传进来的那一个：闭包挂在
        // webview 身上，再让它持有 webview 就是引用环，那个窗口永远释放不掉。
        webview.connect_load_changed(
            glib::clone!(@strong settings, @strong tx => move |view, event| {
                // 只在**加载完**之后印：早一步页面上还是空的。
                if event != webkit2gtk::LoadEvent::Finished {
                    return;
                }
                let op = webkit2gtk::PrintOperation::new(view);
                op.set_print_settings(&settings);
                // 把它挂进会话：信号来之前它不能被回收。
                印刷中.with(|c| {
                    if let Some(s) = c.borrow_mut().as_mut() {
                        s.op = Some(op.clone());
                    }
                });

                let 成功 = tx.clone();
                op.connect_finished(move |_| {
                    // ⚠️ 收工推到下一轮主循环：此刻还在 WebView 的信号处理里，
                    // 现在放掉窗口就是释放正在使用的对象。
                    glib::idle_add_local_once(收工);
                    let _ = 成功.send(Ok(()));
                });
                let 失败 = tx.clone();
                op.connect_failed(move |_, err| {
                    glib::idle_add_local_once(收工);
                    let _ = 失败.send(Err(format!("WebKit 印 PDF 失败：{err}")));
                });

                op.print();
            }),
        );

        // 直接从字符串加载 + 用文档目录当基准地址：**不必往用户目录里写那一份 HTML**
        // （打印那条路要写，因为它是把文件交给别的程序）。
        webview.load_html(html, base_uri);
    }
}

// ── 其它平台：没有就是没有 ────────────────────────────────────────────────

/// 非 Linux 上这条兜底**不存在**：那一套是 WebKitGTK 的打印后端，别的平台上
/// 要走完全不同的 API（macOS 的 `WKWebView.createPDF`、Windows 的
/// `WebView2.PrintToPdfAsync`），**没有写、也没验过**。
///
/// ⚠️ 所以这里报的是"没有"，而不是"试试看"：假装能导、最后给用户一个空文件，
/// 比直接说没有坏得多。真要用 PDF，那些平台上装 pandoc + 一个排版引擎即可。
#[cfg(not(target_os = "linux"))]
pub fn print_html_to_pdf(
    _app: &AppHandle,
    _html: &str,
    _base_dir: Option<&Path>,
    _target: &Path,
) -> Result<()> {
    Err(NotaError::other(
        "这台系统上 Nota 没有自带的 PDF 排版（那是 WebKitGTK 的打印后端，只有 Linux 有）。\
         导出 PDF 需要 pandoc 加一个排版引擎（xelatex / tectonic 之类）。",
    ))
}
