//! **页面引擎（webview）身上的开关**：目前只有拼写检查（2026-09-27）。
//!
//! # 为什么和 `commands/window.rs` 分开
//!
//! 那边动的是**窗口管理器**认得的东西（置顶、开发者工具），这边动的是**页面
//! 引擎**自己的设置。这条界线不是我们划的——Tauri 的权限就给两套命名空间
//! （`core:window:*` 与 `core:webview:*`，见 `capabilities/default.json`），
//! `with_webview` 拿到的那个 `webkit2gtk::WebView` 正是后一套的入口。
//!
//! # 拼写检查为什么非得走这一层
//!
//! Nota 的正文是 `contenteditable` 的一棵 ProseMirror 树，**拼写检查是浏览器
//! 内核提供的**——它不属于文档、不属于插件，是 WebKitGTK 自己的一个开关
//! （`WebKitWebContext::spell-checking-enabled`）。前端够不着它：`spellcheck` 那个
//! HTML 属性**只能关不能开**（属性为 `true` 时，全局开关是关的照样不检查），
//! 所以"让这个设置真的生效"必须落到那个 context 上。
//!
//! ⚠️ 设置里那个 `editor.spellcheck` 此前是一个**拨了不生效的死开关**
//! （2026-09-26 就在界面上，全仓没有一处读它）。这一模块就是把它接上。
//!
//! ⚠️ **语言不可选、跟随系统**（`settings/editor.rs` 那条注释）：WebKitGTK 的
//! 拼写语言列表默认是空的，空列表的含义就是"跟系统走"——所以我们**不去设它**，
//! 设了反而等于把"跟随系统"钉死成一个值。
//!
//! # ⚠️ 只有 Linux 那一条是真的
//!
//! `webkit2gtk` 是 Linux/BSD 才有的绑定。别的平台上**如实报一句"这个平台还没有
//! 接口"**，不假装成功——假成功的症状是"设置页里那个开关拨过去又弹回来"，
//! 而用户会以为设置文件没存上。
//!
//! ⚠️ 命令写成 **`async`** 是有原因的（不是随手）：`with_webview` 把活干在主线程
//! 上，而同步命令**本身就跑在主线程**——那样就得等自己把活干完，等不到。
//! `async` 命令跑在别的线程上，消息投过去、主线程干完再回来（下面那个
//! `问主线程` 里的 `mpsc` 就是这条回程）。

use std::sync::mpsc;
use std::time::Duration;

use tauri::Manager;

use crate::error::{NotaError, Result};

/// 主窗口的 label。⚠️ 与 `tauri.conf.json` 里那个窗口的 `label` 必须一致
/// （同 `commands/window.rs`）。
const 主窗口: &str = "main";

/// 等主线程回话的上限。
///
/// ⚠️ **不能无限等**：主线程要是正忙（比如在一段长任务里），`recv()` 会把这条
/// 命令连同它的前台调用者一起吊死，而界面上的症状是**菜单点下去没有任何反应**
/// ——那种卡死比"报一句读不到"难查得多。宁可如实报失败。
const 等回话: Duration = Duration::from_millis(800);

/// 读一眼拼写检查现在开着没有。
#[tauri::command]
pub async fn nota_webview_spellcheck_get(app: tauri::AppHandle) -> Result<bool> {
    问主线程(app, None).await
}

/// 打开/关掉拼写检查。**返回改完之后从引擎读回来的值**。
///
/// ⚠️ 返回值不是"我们请求的那个值"（这是本仓的老口径：状态一律**从被改的那个
/// 东西身上读回来**，见 `ui/useImmersive.ts` 的文件头）。两者分叉时用户看到的
/// 才是真的。
#[tauri::command]
pub async fn nota_webview_spellcheck_set(app: tauri::AppHandle, on: bool) -> Result<bool> {
    问主线程(app, Some(on)).await
}

/// 把活投给主线程：可选地**先设**，然后**无条件读一遍**回来。
///
/// `要设` 是 `Option` 而不是"另写两个函数"：读那一段（`读一眼`）在两个命令里
/// 是同一段，复制两份的话哪天读法改了就会只改一边——而症状是"设完的返回值和
/// 单读的那个值不一样"，最难查的那一类。
async fn 问主线程(app: tauri::AppHandle, 要设: Option<bool>) -> Result<bool> {
    let 窗 = app
        .get_webview_window(主窗口)
        .ok_or_else(|| NotaError::other(format!("找不到窗口 `{主窗口}`")))?;

    // ⚠️ **`mpsc` 而不是 `Arc<Mutex<Option<bool>>>`**：这里要的是"等一个值回来"，
    // 通道天然带着这个同步；共享变量还得自己配一个 Condvar 才等价。
    let (发, 收) = mpsc::channel::<Option<bool>>();
    窗.with_webview(move |w| {
        // ⚠️ 回不去就是回不去了（命令那边已经超时走人）——`let _ =` 是**有意的**，
        // 不是偷懒：这时候再 unwrap 会让主线程因为一个没人听的回复而 panic。
        let _ = 发.send(读一眼(&w, 要设));
    })
    .map_err(|e| NotaError::other(format!("取窗口的页面句柄失败：{e}")))?;

    match 收.recv_timeout(等回话) {
        Ok(Some(v)) => Ok(v),
        // `None` = 句柄拿到了，但引擎那边问不到设置（平台上没有这个接口，
        // 或者窗口正在销毁）。**这与超时是两件事**，说法也不同。
        Ok(None) => Err(NotaError::other(
            "这个平台上还改不了拼写检查（Nota 只在 Linux/WebKitGTK 上接了这个开关）",
        )),
        Err(_) => Err(NotaError::other("等页面引擎回话超时，拼写检查没有改成功")),
    }
}

/// 真正落地的那一下。**只在主线程上跑**（由 `with_webview` 保证）。
#[cfg(target_os = "linux")]
fn 读一眼(w: &tauri::webview::PlatformWebview, 要设: Option<bool>) -> Option<bool> {
    // ⚠️ 这两个 trait 得点名引进来（这个 crate 没有 prelude）：`context()` 在
    // `WebViewExt` 上、`set/is_spell_checking_enabled` 在 `WebContextExt` 上。
    // 不引入的话报的是"没有这个方法"（同 `pdf_print.rs` 里那条注释）。
    use webkit2gtk::{WebContextExt as _, WebViewExt as _};

    // ⚠️⚠️ **开关在 WebContext 上，不在 WebSettings 上**（2026-09-27 踩过）：
    // 名字看着最像的那一对（`WebKitSettings` 的 `enable-spell-checking`）**在这个
    // 绑定里没有**——`grep -rn spell webkit2gtk-2.0.2/src/` 只命中 `web_context.rs`。
    // 写错的表现是**编译期**的"没有这个方法"（不是运行期静默失效），所以改的时候
    // 别照着老文档里的 `webkit_settings_*` 抄。
    let 上 = w.inner().context()?;
    if let Some(开) = 要设 {
        上.set_spell_checking_enabled(开);
    }
    Some(上.is_spell_checking_enabled())
}

/// 别的平台：接口在那儿，但底下没有实现。
///
/// ⚠️ 返回 `None`（不是 `Some(false)`）：`Some(false)` 是"引擎说它是关的"，
/// 而这里的事实是"**没问到**"。混成一样的话，界面会显示一个它其实控制不了的
/// 开关位置——那是本仓最忌讳的那类故障。
#[cfg(not(target_os = "linux"))]
fn 读一眼(_w: &tauri::webview::PlatformWebview, _要设: Option<bool>) -> Option<bool> {
    None
}
