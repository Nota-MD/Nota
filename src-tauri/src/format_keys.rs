//! **`Ctrl+B` / `Ctrl+I` 收不到**那个坑（BUG-49）**当年**留下的修法。
//!
//! ⚠️⚠️ **2026-09-29 实测之后：这一层在真程序里是死的，正主在别处。**
//! 全文按实测改写过一遍，下面每一节都标着"量到了什么"。
//!
//! # 先说结论
//!
//! - 用户 2026-09-28 报的原话是「**Ctrl B 没反应**」，修法是
//!   **`ui/useMenus.ts` 里那句 `if (e.defaultPrevented) return;`**——原因见
//!   下一节，与本文件无关。
//! - **本文件这一层装得上、但一次都没拦到过键**：开 `NOTA_DEBUG=1` 在真窗口里
//!   量了 4 次 `Ctrl+B` ＋ 1 次 `Ctrl+I`，日志里只有"已装上"，**0 条"拦到"**。
//!   也就是说它与没装等价。
//! - 它**目前留着**：删掉它要连着动 `lib.rs` 的 `on_page_load` 钩子、前端那条
//!   `nota:format-key` 监听、`bridge/ipc.ts` 的频道名和几份文档，而它不碍事。
//!   `docs/07` 的 BUG-49 那一项里列着"删还是留"这个待拍板的问题。
//!
//! # 正主：`Mod-b` / `Mod-i` 被**绑了两次**，而两条命令都是 toggle
//!
//! `@milkdown/preset-commonmark` 自己绑了 `Mod-b` / `Mod-i`
//!（`strongKeymap` / `emphasisKeymap`），本仓菜单表（`ui/commands.ts` ＋
//! `ui/useCommandTable.ts`）也绑了同样两颗（`fmt.bold` / `fmt.italic`）。
//! 两条命令都是**开关**，同一颗键跑两遍**正好抵消**——看起来就是"按了没反应"。
//!
//! ⚠️ 指纹是**同一颗键在两种模式下不同命**：源码模式那边 CodeMirror 没绑
//! `Mod-b`（`src/editor/source.ts` 的 `撞车键位`），只跑一遍，所以一直好使。
//! 查"快捷键不灵"先看这一条。
//!
//! ⚠️ **当年为什么没查到这里**：同批量到的对照是 `Ctrl+U`（下划线）"有用"，
//! 于是判成"按键压根没进 DOM"。那个对照是**假象**——`Ctrl+U` 在 WebKit 里
//! 本来就是"下划线"，是**它自己**执行了 `execCommand` 插了 `<u>`，而
//! ProseMirror 恰好认 `<u>`（`inline-marks.ts` 那一条）。`Ctrl+B` / `Ctrl+I`
//! 输在 PM **不认** `<b>` / `<i>`：同样是"被 WebKit 干了"，一个看得见、
//! 一个看不见。
//!
//! # ⚠️ 被推翻的那句判断（原文留着，好认）
//!
//! 旧版本这里写的是"**WebKitGTK 在把按键派发给 DOM 之前就把这几颗键当成自己的
//! 编辑命令处理掉了**"。**这句是错的**，两条实测：
//!
//! ① 最小复现（GTK ＋ WebKit2 各一个窗口，`/tmp/keys-repro.py`）：把下面这一层
//!    关掉时，网页侧**收得到** `[网页] JS 收到 keydown: key=b ctrl=true`。
//! ② 真程序里 `ui/useMenus.ts` 那条 `window` 监听**也收得到**那颗键——它当年
//!    之所以"没反应"，是因为收到之后又和 Milkdown 那条**互相抵消**（上一节）。
//!
//! # 这一层的机制（**今天没生效，写在这里是为了将来查得回来**）
//!
//! `GtkEventControllerKey`（GTK 3.24 起）装在窗口上，相位是
//! **`GTK_PHASE_CAPTURE`**——事件在这条路上是**从窗口往子 widget 走**的，
//! 所以它**应该**早于 WebView 自己的处理。在这里返回 `true`，事件就到此为止。
//! ⚠️ 它在最小复现里**确实做得到**；在 Tauri 里做不到，原因还没查出来
//!（候选：wry/Tauri 自己那一套事件控制器的相位，或 `webview.window()` 拿到的
//! 不是键盘事件真正走的那个 toplevel）。留待真要用时再查。
//!
//! 拦下来之后**不在 Rust 里执行命令**，只发一条事件（{@link EVENT}）给前端：
//! 加粗到底是"给选区套一个 mark"还是别的写法，那份知识在前端
//!（`ui/useCommandTable.ts` 的 `fmt.bold`），宿主不该有第二份。
//!
//! ⚠️ **只在 Linux 上装**：macOS / Windows 上 `Ctrl+B` 是正常派发到 DOM 的
//!（`ui/useMenus.ts` 那条 keydown 接得住），装了反而会和它撞成"执行两遍"。
//!
//! # 挂在哪儿：`Builder::on_page_load`
//!
//! ⚠️ **不是 `setup`**：那个钩子在窗口**建出来之前**跑（`app.rs` 的
//! `Builder::setup` → `build()` 里才建窗），那会儿 `get_webview_window("main")`
//! 拿到的是 `None`。而 `on_page_load` 拿到的是**已经建好的那个 `Webview`**
//! 本身，不用按名字去找，也就不会因为将来改 label 而静默失效。
//!
//! ⚠️ 它**每一轮页面加载都会跑一次**（开发时 vite 热重载、生产里只有一次），
//! 所以下面那道"装过就不再装"的闸是必须的，不是保险。
//!
//! # ⚠️ 两条代价，如实记着
//!
//! ① **焦点在哪个输入框里都拦**。设置对话框的文本框、查找条里按 `Ctrl+B`
//!    一样会被截下来发给前端。前端的接法（`ui/useMenus.ts`）走的是**同一份**
//!    `disabledCommands` 判据，所以"没有文档"时不会被误触；但"有文档、而光标
//!    在查找条里"时它仍会去加粗**文档**。这与菜单加速键的既有行为一致
//!   （那套也是这样），不算新问题，但要知道。
//! ② **`Ctrl+Shift+B` 之类一律放行**（下面判了修饰键），只有"字母 + 纯 Ctrl"
//!    这一种组合会被截。
//!
//! ✅ 顺带说清**不是**代价的一条：`--new-window` 开出来的第二个窗口
//!（`commands/window.rs::nota_window_open_new`）是**另起一个进程**，它自己那份
//! `main` 窗口走的是同一段 `on_page_load`，所以那边也一样能收到。
//!
//! # 关于 `v3_24`
//!
//! `gtk::EventControllerKey` 是 `v3_24` feature 门控的（见 `Cargo.toml` 那段
//! 注释）。GTK 3.24 是 2018 年的版本，本仓的最低目标是 Fedora/Debian 那两套
//! 现代发行版，够用。

/// **键盘上那两颗键被截下来了**。载荷是 `"bold"` / `"italic"`。
///
/// ⚠️ 频道名前端那边也写了一遍（`src/bridge/ipc.ts` 的 `events.formatKey`）。
/// 两处必须说同一个字符串——改了收不到、**也不报错**（Tauri 对没有监听者的
/// 频道 emit 是静默成功的，这一条 `bridge/ipc.ts` 里记过好几次）。
pub const EVENT: &str = "nota:format-key";

/// 收这条事件的窗口 label。
///
/// ⚠️ 只有主窗的 `App` 挂 `useMenus`（警报窗走 `main.tsx` 里
/// `#focus-alarm` 那条岔路，渲染的是 `FocusAlarmWindow`），所以定向发就够了。
/// 定向而不是广播是为了**将来**：多一个跑完整 `App` 的窗口时，广播会让两个窗口
/// 一起执行同一条命令。
// ⚠️ 只有 Linux 那一半用得上（2026-10-10 做 Windows 编译尝试时量到的：
// 别的平台上它是一条"从没被用过"的常量告警）。
#[cfg(target_os = "linux")]
const WINDOW: &str = "main";

/// 认下来的两颗键 → 发给前端的名字。
///
/// ⚠️ 名字**不是**菜单命令 id（这里是 `bold`，那边是 `fmt.bold`）：这一层
/// 只知道"用户按了加粗键"，那是物理事实；"加粗键对应哪条命令"是命令表的事，
/// 在 `ui/useMenus.ts` 里一次性映射过去。宿主不该知道菜单项的 id 长什么样。
#[cfg(target_os = "linux")]
fn 认键(键值: u32) -> Option<&'static str> {
    // ⚠️ 用**十六进制字面量**而不是 `gdk::keys::constants`：GDK 的 keyval 对
    // ASCII 字母就等于它的小写码点（`b` = 0x62），这是一条稳定到可以写死的
    // 约定，而引一个常量表会平白多一条 import。大小写两种都认：CapsLock 开着、
    // 或者别的地方把 keyval 规范化成大写时报的是大写那一颗。
    match 键值 {
        0x0062 | 0x0042 => Some("bold"),   // b / B
        0x0069 | 0x0049 => Some("italic"), // i / I
        _ => None,
    }
}

/// 在这个 webview 所属的**系统窗口**上装一层捕获阶段的键盘控制器。
///
/// 从 `Builder::on_page_load` 里调（理由见文件头"挂在哪儿"那段）。不是 `main`
/// 就直接返回——警报窗不需要这一层（它里面没有编辑器，也没有菜单）。
#[cfg(target_os = "linux")]
pub fn 装上(webview: &tauri::Webview) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};

    use gtk::prelude::*;
    use tauri::{Emitter, EventTarget};

    /// 装过就不再装。
    ///
    /// ⚠️ **必须幂等**：调用点在 `on_page_load` 上，而那个钩子每加载一轮页面就
    /// 跑一次（开发时 vite 一热重载就是一枪）。不挡的话每重载一轮就多一层控制器，
    /// 一次 `Ctrl+B` 会派发好几遍——加粗是 toggle，**偶数遍等于没加粗**，
    /// 症状正好和这个 bug 本身撞脸，会让人以为修没生效。
    static 装过了: AtomicBool = AtomicBool::new(false);

    if webview.label() != WINDOW {
        return Ok(());
    }
    if 装过了.load(Ordering::SeqCst) {
        return Ok(());
    }

    // ⚠️ 用 `webview.window()` 而不是 `app.get_webview_window("main")`：
    // 手上这个就是我们要的那个窗口，按名字再找一遍等于把 label 当成了第二个
    // 真相源。（`gtk_window()` 的 cfg 门控比 `target_os = "linux"` 宽——BSD 那
    // 几家也有——本文件只在 Linux 编，这里不额外判。）
    let gtk窗 = webview
        .window()
        .gtk_window()
        .map_err(|e| format!("拿不到 GTK 窗口：{e}"))?;

    // ⚠️ 这个构造函数**自己就把控制器挂上去了**（gdk-rs 的签名是
    // `new(widget: &impl IsA<Widget>)`，对应 C 侧的 `gtk_event_controller_key_new`
    // 之后还要 `gtk_widget_add_controller` 那两步），所以**不要**再写一句
    // `add_controller`——GTK 3 的 `WidgetExt` 上没有那个方法（那是 GTK 4 的形状），
    // 写了会编译不过。
    let 控 = gtk::EventControllerKey::new(&gtk窗);
    // ⚠️ 显式设相位，不赌默认值：整个修法成立的前提就是"捕获阶段先于 WebView"，
    // 而相位一旦落在冒泡那一侧，这一层会**静默地什么都不做**（和没装一样，
    // 不报错、日志里也没痕迹）。
    控.set_propagation_phase(gtk::PropagationPhase::Capture);

    // ⚠️ 闭包要 `'static`，所以拿走一份 `Webview` 的克隆（它是 `Clone`），
    // 不是借 `&Webview`。控制器活得比这个函数长。
    let 发信 = webview.clone();
    控.connect_key_pressed(move |_, 键值, _, 状态| {
        use gtk::gdk::ModifierType;

        // 只认"纯 Ctrl + 字母"：多一个修饰键就是另一个键位了
        //（`Ctrl+Shift+B` 在本仓没有占用，将来也不该被这一层吃掉）。
        if !状态.contains(ModifierType::CONTROL_MASK) {
            return false;
        }
        // ⚠️ Alt 在 gdk-rs 里叫 **`MOD1_MASK`**，没有 `ALT_MASK` 这个名字
        //（`ModifierType` 是位标志，名字直接照抄 GDK 的 C 枚举）。
        // `SUPER_MASK` 就是 Super/⌘ 那颗。
        if 状态.intersects(
            ModifierType::SHIFT_MASK | ModifierType::MOD1_MASK | ModifierType::SUPER_MASK,
        ) {
            return false;
        }
        let Some(名字) = 认键(键值) else {
            return false;
        };
        // ⚠️ 发不出去**不影响**这一层该不该吃：那颗键已经被 WebKit 定性成
        // "加粗"，放它过去只会得到一段 PM 不认的 `<b>`（见文件头），
        // 比没反应更糟。所以这里不看 `emit_to` 的结果。
        let _ = 发信.emit_to(EventTarget::labeled(WINDOW), EVENT, 名字);
        // `true` = 到此为止，WebView 收不到这颗键。
        true
    });

    // 成功之后才落闸（上面任何一步提前 return 都不该把重试的机会一起关掉）。
    装过了.store(true, Ordering::SeqCst);
    Ok(())
}

/// 非 Linux：**什么都不做**（理由见文件头"只在 Linux 上装"那段）。
#[cfg(not(target_os = "linux"))]
pub fn 装上(_webview: &tauri::Webview) -> Result<(), String> {
    Ok(())
}
