//! **页面引擎（webview）身上的开关**：目前只有拼写检查（2026-09-27 开关、
//! 2026-10-10 加语言）。
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
//! # 语言那一格为什么也在这儿（2026-10-10）
//!
//! 用户要的是「**拼写检查允许设置不同语言**」。查过 WebKit 自己的源码之后，
//! 落地的地方**只有这一条路**（`Source/WebCore/platform/text/enchant/TextCheckerEnchant.cpp`，
//! 2026-10-10 读的 `main` 分支）：
//!
//! ```text
//! updateSpellCheckingLanguages(列表)
//!   ├─ 列表非空 → 逐个 `enchant_broker_dict_exists()`，**装着的那些**才加载
//!   └─ 列表为空 → 拿系统默认语言；连它都没有词典 → 退到"装着的第一个词典"
//! checkSpellingOfString(词) → 拿这个词去**加载着的那几本词典**里查
//! ```
//!
//! 三条由此定下来：
//!
//! 1. **列表就是"用哪些语言"**。⚠️ 语言标签是 enchant/hunspell 那套
//!    **`语言_地区`**（`zh_CN` / `en_US`，**下划线**），不是 BCP-47 的 `zh-CN`——
//!    写成连字符时 `enchant_broker_dict_exists()` 认不出来，而症状是**一个字都不检查**。
//! 2. **空列表不是"没有语言"，是"跟随系统"**——所以"跟随系统"这一档就是
//!    **把空列表设回去**，不是"不去设它"。⚠️ 这条是 2026-10-10 改的口径：
//!    从前这一格写"语言不可选"，理由是"设了等于把跟随系统钉死"——那个理由**站不住**，
//!    空列表本身就是"跟随系统"那一档。
//! 3. ⚠️ **元素的 `lang` 属性在这一版 Linux 上不参与挑词典**（当年那份交接单里
//!    猜的是它挑，读了源码之后推翻：`checkSpellingOfString` 从头到尾没有语言参数，
//!    拿的是全局那几本词典）。前端仍然把 `lang` 写在正文那一层上——那是文档语言的
//!    正当声明（断词、朗读、以及将来换内核时有用），**但它不是语言这一格的落地方式**。
//!
//! # ⚠️ 试过、不成立的一件事：**别去列"这台机器装了什么词典"**（2026-10-10 晚）
//!
//! 用户那句话是「多语言拼写检查」，于是先想做的一件顺理成章的事：**把机器上
//! 装着的词典列出来**，用户就不用对着一张"一半点了没反应"的表猜。
//! **试过，四种列法全都不可靠，所以不做**（证据是本机与容器上逐条跑出来的）：
//!
//! | 想用的办法 | 实测 |
//! |---|---|
//! | `enchant-2 -l` | 那不是"列词典"，是 `--errors-only`（`--list-dicts` 报未知选项） |
//! | `hunspell -D` | 容器里没装；宿主上输出混进 `/run/host` 与 `/proc`，去重后只剩 4 个标签（`ls` 有 24 个），第二次还挂死 4 分钟 |
//! | `aspell dump dicts` | 名字是 `en_GB-ise` 这一套，**与 enchant 的标签对不上**，而且容器里没有 aspell |
//! | 扫 `*.dic`（看着最像的那条） | ⚠️ **会漏**：宿主 `/usr/share/hunspell` 里**只有 `en_US.dic`**，而 `enchant-2 -d en_GB -l` **exit 0**（它是走 aspell 后端拿到的） |
//!
//! 最后那条正是**不能做**的理由：照它列，界面会在用户自己那台机器上给 `en_GB`
//! 标一句"这台机器上没有"——**而它明明是好的**。一个会撒谎的提示比没有提示坏得多
//! （本仓最忌讳的那一类），所以候选表**保持"写死的一张表 ＋ 自定义标签"**，
//! 而"这台机器到底有没有这本词典"**只有引擎说了算**：设完之后读回来的那串里
//! 少了谁，就当场说谁（`ui/useSpellcheck.ts` 那条逐门比）。
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

use serde::Serialize;
use tauri::Manager;

use crate::error::{NotaError, Result};

/// 「捏合那条钩子装过了」的闸。⚠️ 装两遍的后果是回调叠着跑（每捏一下按回去好几次），
/// 不至于坏，但没必要。
static 装过: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// 主窗口的 label。⚠️ 与 `tauri.conf.json` 里那个窗口的 `label` 必须一致
/// （同 `commands/window.rs`）。
const 主窗口: &str = "main";

/// 等主线程回话的上限。
///
/// ⚠️ **不能无限等**：主线程要是正忙（比如在一段长任务里），`recv()` 会把这条
/// 命令连同它的前台调用者一起吊死，而界面上的症状是**菜单点下去没有任何反应**
/// ——那种卡死比"报一句读不到"难查得多。宁可如实报失败。
const 等回话: Duration = Duration::from_millis(800);

/// 引擎那边拼写检查的现状。
///
/// ⚠️ **读回来的，不是我们请求的那个值**（本仓的老口径，见文件头）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct 拼写现状 {
    /// 总开关。
    pub on: bool,
    /// **真加载着的那几本词典的标签**（`["en_US"]` 这种）。
    /// 空 = 一本都没加载（⚠️ 那意味着**一个字都不会检查**，不是"没问题"）。
    ///
    /// ⚠️ 它与"我们请求的那几个语言"**不是一回事**：请求了 `["zh_CN"]`
    /// 而机器上没这本词典时，这里回来的就是空的——前端靠这件事告诉用户
    /// "这个语言没有词典"，理由见文件头第 3 条上面那段。
    pub languages: Vec<String>,
}

/// 这一趟要改什么。`只读` 那一档就是"读一眼"。
///
/// ⚠️ 写成枚举而不是"两个 `Option` 参数"：`Option<bool>` + `Option<Vec<String>>`
/// 能表达出"两个都设"这种**没有意义**的组合，而这里三种意图互斥。
enum 改动 {
    /// 什么都不改，只把现状读回来。
    只读,
    /// 开关。
    开关(bool),
    /// 语言列表。⚠️ **空列表是"跟随系统"那一档**（见文件头第 2 条）。
    语言(Vec<String>),
    /// **关掉引擎的"平滑滚动"**（2026-10-11，用户：「触摸板上下滑动速度貌似居然是
    /// 贝塞尔曲线，而且有延迟……改成硬滑动」）。见 `硬滚动` 那条命令。
    硬滚动,
}

/// 读一眼拼写检查现在是什么状态（开关 ＋ 真加载着的词典）。
#[tauri::command]
pub async fn nota_webview_spellcheck_get(app: tauri::AppHandle) -> Result<拼写现状> {
    问主线程(app, 改动::只读).await
}

/// 打开/关掉拼写检查。**返回改完之后从引擎读回来的值**。
///
/// ⚠️ 返回值不是"我们请求的那个值"（这是本仓的老口径：状态一律**从被改的那个
/// 东西身上读回来**，见 `ui/useImmersive.ts` 的文件头）。两者分叉时用户看到的
/// 才是真的。
#[tauri::command]
pub async fn nota_webview_spellcheck_set(app: tauri::AppHandle, on: bool) -> Result<bool> {
    Ok(问主线程(app, 改动::开关(on)).await?.on)
}

/// 换拼写检查用的语言。`languages` 空 = **跟随系统**。
///
/// 返回**引擎真加载着的那几本词典**（可能不是你给的那几个，见 `拼写现状::languages`）。
#[tauri::command]
pub async fn nota_webview_spellcheck_languages_set(
    app: tauri::AppHandle,
    languages: Vec<String>,
) -> Result<Vec<String>> {
    Ok(问主线程(app, 改动::语言(languages)).await?.languages)
}


/// 把活投给主线程：可选地**先改**，然后**无条件读一遍**回来。
///
/// `改动` 是枚举而不是"另写几个函数"：读那一段（`读一眼`）在这几个命令里
/// 是同一段，复制几份的话哪天读法改了就会只改一边——而症状是"改完的返回值和
/// 单读的那个值不一样"，最难查的那一类。
async fn 问主线程(app: tauri::AppHandle, 要改: 改动) -> Result<拼写现状> {
    let 窗 = app
        .get_webview_window(主窗口)
        .ok_or_else(|| NotaError::other(format!("找不到窗口 `{主窗口}`")))?;

    // ⚠️ **`mpsc` 而不是 `Arc<Mutex<Option<拼写现状>>>`**：这里要的是"等一个值回来"，
    // 通道天然带着这个同步；共享变量还得自己配一个 Condvar 才等价。
    let (发, 收) = mpsc::channel::<Option<拼写现状>>();
    窗.with_webview(move |w| {
        // ⚠️ 回不去就是回不去了（命令那边已经超时走人）——`let _ =` 是**有意的**，
        // 不是偷懒：这时候再 unwrap 会让主线程因为一个没人听的回复而 panic。
        let _ = 发.send(读一眼(&w, 要改));
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
fn 读一眼(w: &tauri::webview::PlatformWebview, 要改: 改动) -> Option<拼写现状> {
    // ⚠️ 这两个 trait 得点名引进来（这个 crate 没有 prelude）：`context()` 在
    // `WebViewExt` 上、`set/is_spell_checking_enabled` 与那两个语言方法都在
    // `WebContextExt` 上。
    // 不引入的话报的是"没有这个方法"（同 `pdf_print.rs` 里那条注释）。
    use webkit2gtk::{WebContextExt as _, WebViewExt as _};

    // ⚠️⚠️ **开关在 WebContext 上，不在 WebSettings 上**（2026-09-27 踩过）：
    // 名字看着最像的那一对（`WebKitSettings` 的 `enable-spell-checking`）**在这个
    // 绑定里没有**——`grep -rn spell webkit2gtk-2.0.2/src/` 只命中 `web_context.rs`。
    // 写错的表现是**编译期**的"没有这个方法"（不是运行期静默失效），所以改的时候
    // 别照着老文档里的 `webkit_settings_*` 抄。
    let 上 = w.inner().context()?;
    match 要改 {
        改动::只读 => {}
        改动::开关(开) => 上.set_spell_checking_enabled(开),
        改动::硬滚动 => {
            // ⚠️ 这一档动的是 **WebView 的 settings**（不是 context）：触摸板滚动的
            // 缓动是 `WebKitSettings:enable-smooth-scrolling`（**默认开**）做的，
            // 关掉之后手指动多少就滚多少。⚠️ **只关平滑、不动 `kinetic`（惯性滑行）**：
            // 用户抱怨的是"曲线 + 延迟"，不是松手之后那一段滑行。
            use webkit2gtk::SettingsExt as _;
            if let Some(设置) = w.inner().settings() {
                设置.set_enable_smooth_scrolling(false);
                // ⚠️ **还没做的一条，记在这儿**：触摸板**捏合**会让引擎自己放大页面
                // （用户 2026-10-11：「触摸板放大手势会导致软件真的放大。要改」）。
                // 正解是关掉 WebKit 的 `enable-page-zoom`，但**这个绑定里没有那个方法**
                // （`webkit2gtk-2.0.2` 的 `Settings` 只有 `zoom_text_only`；WebKitGTK 2.24
                // 起才有 `enable-page-zoom` 这个属性）⇒ 要么升这个 crate，要么照
                // `format_keys.rs` 那套在 **GTK 捕获相位**挂一个手势控制器把它吃掉。
                // `docs/07` 第 116 项记着这笔。
            }
        }
        改动::语言(语言) => {
            // ⚠️ 空 `Vec` 要**照样调**（不能 `if !语言.is_empty()` 跳过）：
            // 空列表是"跟随系统"那一档，跳过它就等于"上一个语言还留着"。
            let 借用: Vec<&str> = 语言.iter().map(String::as_str).collect();
            上.set_spell_checking_languages(&借用);
        }
    }
    // ── 捏合缩放：**盯住 `zoom-level`，一被人改就按回 1.0**（2026-10-11）────────
    //
    // 用户原话：「现在触摸板放大手势会导致软件真的放大。要改」。
    //
    // ⚠️ 正解是关掉 WebKit 的 `enable-page-zoom`，但**这个绑定里没有那个方法**
    //（`webkit2gtk-2.0.2` 的 `Settings` 只有 `zoom_text_only`，`webkit2gtk-sys` 里
    // 连 `webkit_settings_set_enable_page_zoom` 都没有——那一批绑定比 WebKitGTK 2.24 还老）。
    // 于是退而求其次：**它改一次我们就按回去一次**。捏合走的就是这条路，所以
    // 观感上捏合不再放大；而 Nota 自己的"缩放"是**另一套**（`appearance.zoom`
    // 算出来的 CSS 变量），压根不碰引擎这个数，互不干扰。
    //
    // ⚠️ 只装一次（`装过` 那道闸）：这条命令在启动时叫一次，但组件重挂时还会再叫。
    if !装过.swap(true, std::sync::atomic::Ordering::SeqCst) {
        use webkit2gtk::WebViewExt as _;
        w.inner().connect_zoom_level_notify(|v| {
            if (v.zoom_level() - 1.0).abs() > f64::EPSILON {
                v.set_zoom_level(1.0);
            }
        });
    }

    Some(拼写现状 {
        on: 上.is_spell_checking_enabled(),
        // ⚠️ `GString` → `String` 转一手：`GString` 带的是 glib 的引用计数，
        // 而这条值要跨线程回给命令那边（`mpsc`），非 `Send` 的类型过不去。
        languages: 上
            .spell_checking_languages()
            .iter()
            .map(|l| l.to_string())
            .collect(),
    })
}

/// 别的平台：接口在那儿，但底下没有实现。
///
/// ⚠️ 返回 `None`（不是 `Some(false)`）：`Some(false)` 是"引擎说它是关的"，
/// 而这里的事实是"**没问到**"。混成一样的话，界面会显示一个它其实控制不了的
/// 开关位置——那是本仓最忌讳的那类故障。
#[cfg(not(target_os = "linux"))]
fn 读一眼(_w: &tauri::webview::PlatformWebview, 要改: 改动) -> Option<拼写现状> {
    // ⚠️ 这里**把 `要改` 拆开、逐档 `let _` 掉**，不是随手写成 `_要改`：
    // 那样这两个 payload 在这个平台上**从没被读过**，编译期会一直报
    // `field 0 is never read`（做 Windows 编译尝试时量到的）。而那条告警本身
    // 说的正是实话——**这个平台上这两格确实改不了**——所以这里把它挑明。
    match 要改 {
        改动::只读 => {}
        改动::开关(开) => {
            let _ = 开;
        }
        改动::语言(语言) => {
            let _ = 语言;
        }
        改动::硬滚动 => {}
    }
    None
}

/// **把引擎的"平滑滚动"关掉**（2026-10-11，用户：「触摸板上下滑动速度貌似居然是
/// 贝塞尔曲线，而且有延迟，很影响体验。改成硬滑动」）。
///
/// 那不是我们写的动画：触摸板滚动由**引擎**缓动，WebKitGTK 那边就是
/// `WebKitSettings:enable-smooth-scrolling`（默认开）。所以这条命令跟拼写那两条
/// 同一类——**引擎身上的设置**，都得过一次主线程。
///
/// ⚠️ **别的平台没有这个开关**（Windows 那份是 WebView2 ＝ Chromium，对应的东西是
/// 启动参数 `--disable-smooth-scrolling`），所以那边这一档是空实现、**不报错**
/// （"这件事这个平台做不到"与"你操作错了"不是一回事）。欠账记在 `docs/07` 第 114 项。
#[tauri::command]
pub async fn nota_webview_scroll_hard(app: tauri::AppHandle) -> Result<()> {
    let _ = 问主线程(app, 改动::硬滚动).await?;
    Ok(())
}
