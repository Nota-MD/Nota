//! 原生菜单——macOS 顶端菜单栏与桌面平台的原生窗口菜单。
//!
//! # 为什么要有它
//!
//! macOS 的菜单栏在屏幕顶端、属于应用而不是窗口；Windows/Linux 也可以把
//! 菜单交给窗口管理器/GTK 绘制。三端都优先尝试原生菜单，失败时自绘菜单
//! （`src/ui/MenuBar.tsx`）继续兜底。
//!
//! # 菜单内容是**前端推过来的**
//!
//! ⚠️ 这里**没有**一份菜单定义。菜单怎么排、每一项叫什么、有没有快捷键，
//! 唯一的地方是 `src/ui/commands.ts`；前端把它连同"哪些项现在是灰的/勾上的"
//! 一起 `nota_native_menu_apply` 推过来，这里只负责**建**。
//!
//! 反面做法是在 Rust 里再抄一份菜单表。那样就有两个真相源了——而
//! `lib.rs` 里 `nota_frontend_ready` 那段注释记的正是同一类错误的代价
//! （面板/菜单清单曾经有两个真相源，重放漏一次就静默分叉）。这里不重蹈。
//!
//! 点菜单也不在这里执行任何东西：把 id 用 `nota:native-menu` 发回前端，
//! 由前端那张 `menuHandlers` 去跑。于是"点自绘菜单"和"点原生菜单"
//! **走的是同一条路**，不会出现两套实现各自分叉。
//!
//! # 跨平台与失败回退
//!
//! 判定用的是 `cfg!`（运行期常量）而不是 `#[cfg]`（条件编译）：这样**整个建菜单
//! 的代码在所有平台上都参与类型检查**，不至于只有 macOS 打包时才发现 API 写错。
//! 前端拿 `Ok(false)` 的意思是"没有原生菜单，请继续显示自绘菜单栏"——
//! 于是**建不出来也只是退回自绘**，不会变成"一条菜单都没有"。
//!
//! 2026-10-24 已在 Linux/GTK 窗口实测菜单能挂上、能展开和派发事件；
//! macOS 与 Windows 走同一套 Tauri API，仍需各自平台复核。

use serde::Deserialize;
use tauri::menu::{
    CheckMenuItemBuilder, IsMenuItem, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem,
    SubmenuBuilder,
};
use tauri::{AppHandle, Runtime};

/// 前端推过来的一项。
///
/// ⚠️ 字段改动必须同批改 `src/bridge/ipc.ts` 里的 `NativeMenuNode`。两边不一致时
/// `invoke` 不报错，只会静默用 `#[serde(default)]` 的值——菜单会**少东西**而不是报错。
#[derive(Debug, Clone, Deserialize)]
pub struct MenuNode {
    /// 分隔线。为真时其余字段一律忽略。
    #[serde(default)]
    pub sep: bool,
    /// 命令 id。点了就把它发回前端。
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    /// 显示写法（`"Ctrl+Shift+S"`），由 `to_native_accel` 转成 muda 认的写法。
    #[serde(default)]
    pub accel: Option<String>,
    #[serde(default = "yes")]
    pub enabled: bool,
    /// `Some(_)` 才建可勾选项，`None` 是普通项。**不能只看布尔**：
    /// `Some(false)` 和 `None` 在菜单上长得不一样（一个空心勾，一个什么都没有）。
    #[serde(default)]
    pub checked: Option<bool>,
    #[serde(default)]
    pub submenu: Vec<MenuNode>,
}

fn yes() -> bool {
    true
}

/// 这套原生菜单支不支持。桌面平台均启用；失败了前端会自动退回自绘菜单。
///
/// 前端拿它来定"要不要把自绘菜单栏藏起来"——`apply` 的返回值更好用，
/// 见 `commands/menu.rs`。
pub fn available() -> bool {
    cfg!(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "linux"
    ))
}

/// 建菜单并挂上去。返回"挂上了没有"。
///
/// 桌面平台都尝试挂载；建失败返回 `Err`（前端据此继续用自绘菜单）。
pub fn apply<R: Runtime>(app: &AppHandle<R>, nodes: &[MenuNode]) -> Result<bool, String> {
    if !available() {
        return Ok(false);
    }
    let menu = build(app, nodes)?;
    app.set_menu(menu)
        .map_err(|e| format!("挂原生菜单失败：{e}"))?;
    Ok(true)
}

/// 把前端推来的树建成 Tauri 的 `Menu`。
fn build<R: Runtime>(app: &AppHandle<R>, nodes: &[MenuNode]) -> Result<Menu<R>, String> {
    let mut items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();

    // ── ① macOS 的第一栏必须是"应用菜单" ──────────────────────────────
    // 关于 / 服务 / 隐藏 / 退出标准四段。这几项**不用**前端推——
    // 它们是操作系统规定的角色，不是这个应用的功能，抄进 `commands.ts`
    // 反而会让人以为"少了一项就是没实现"。Windows/Linux 没有这条约定，
    // 所以只给 macOS 插。
    if cfg!(target_os = "macos") {
        let about = PredefinedMenuItem::about(app, Some("关于 Nota"), None).map_err(estr)?;
        let services = PredefinedMenuItem::services(app, None).map_err(estr)?;
        let hide = PredefinedMenuItem::hide(app, None).map_err(estr)?;
        let hide_others = PredefinedMenuItem::hide_others(app, None).map_err(estr)?;
        let show_all = PredefinedMenuItem::show_all(app, None).map_err(estr)?;
        let quit = PredefinedMenuItem::quit(app, None).map_err(estr)?;
        let sep1 = PredefinedMenuItem::separator(app).map_err(estr)?;
        let sep2 = PredefinedMenuItem::separator(app).map_err(estr)?;

        let app_menu = SubmenuBuilder::new(app, "Nota")
            .item(&about)
            .item(&sep1)
            .item(&services)
            .item(&sep2)
            .item(&hide)
            .item(&hide_others)
            .item(&show_all)
            .item(&quit)
            .build()
            .map_err(estr)?;
        items.push(Box::new(app_menu));
    }

    // ── ② 前端推来的那几栏 ────────────────────────────────────────────
    items.extend(build_nodes(app, nodes)?);

    let refs: Vec<&dyn IsMenuItem<R>> = items.iter().map(|b| b.as_ref()).collect();
    MenuBuilder::new(app).items(&refs).build().map_err(estr)
}

/// 一层里的一串条目。**递归**——子菜单就是在这个函数里再走一次自己。
fn build_nodes<R: Runtime>(
    app: &AppHandle<R>,
    nodes: &[MenuNode],
) -> Result<Vec<Box<dyn IsMenuItem<R>>>, String> {
    let mut out: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();

    for node in nodes {
        if node.sep {
            out.push(Box::new(PredefinedMenuItem::separator(app).map_err(estr)?));
            continue;
        }

        if !node.submenu.is_empty() {
            let children = build_nodes(app, &node.submenu)?;
            let refs: Vec<&dyn IsMenuItem<R>> = children.iter().map(|b| b.as_ref()).collect();
            // 带子菜单的项**自己不执行命令**（同自绘菜单，见 `commands.ts`），
            // 所以不挂 id、也不挂快捷键。
            let sub = SubmenuBuilder::new(app, &node.label)
                .items(&refs)
                .build()
                .map_err(estr)?;
            out.push(Box::new(sub));
            continue;
        }

        out.push(build_leaf(app, node)?);
    }

    Ok(out)
}

/// 一个不带子菜单的条目。
fn build_leaf<R: Runtime>(
    app: &AppHandle<R>,
    node: &MenuNode,
) -> Result<Box<dyn IsMenuItem<R>>, String> {
    let accel = leaf_accel(node);

    if let Some(checked) = node.checked {
        let mut b = CheckMenuItemBuilder::with_id(&node.id, &node.label)
            .enabled(node.enabled)
            .checked(checked);
        if let Some(a) = accel {
            b = b.accelerator(a);
        }
        return Ok(Box::new(b.build(app).map_err(estr)?));
    }

    let mut b = MenuItemBuilder::with_id(&node.id, &node.label).enabled(node.enabled);
    if let Some(a) = accel {
        b = b.accelerator(a);
    }
    Ok(Box::new(b.build(app).map_err(estr)?))
}

/// 这一项该不该带快捷键。
///
/// ⚠️⚠️ **灰掉的项一律不带。** 这不是美观问题，是 macOS 的硬约束：
/// AppKit 拿键位去匹配菜单项时**连禁用的项一起匹配**，匹配上了就不再往下传——
/// 于是"灰着的 `⌥↑`"会把整条 Option+↑（输入框里"按段落移动光标"）**吃掉**，
/// 界面上一点异样都看不出来，只是那个键突然没用了。
/// 菜单里灰着的 `⌥↑` `⌥↓` `⌘K` `⌘U` `F8` `F9` 全是这一类；
/// `⌘C` `⌘V`（`edit.copy` / `edit.paste` 没实现、没进 `menuHandlers`）
/// 更狠——那会直接把复制粘贴弄坏。
///
/// 顺带的好处：灰着的项本来就不该宣传一个按下去没反应的键位。
fn leaf_accel(node: &MenuNode) -> Option<String> {
    if !node.enabled {
        return None;
    }
    // GTK/Tauri currently creates the menu without an accelerator group, so
    // attaching accelerators only yields "no accelerator installed" warnings
    // and does not make them work. Linux shortcuts are already handled by the
    // frontend keydown dispatcher.
    if cfg!(target_os = "linux") {
        return None;
    }
    let raw = node.accel.as_deref()?;
    let native = to_native_accel(raw);
    if native.is_none() {
        // 放行不了只是**这一条没有快捷键**，绝不能让整个菜单建不出来。
        // 而"这一项没快捷键"用户在界面上是看不出异常的（菜单项照样能点），
        // 所以这句只是开发者的线索，走调试闸门。
        crate::日志!(
            "[nota] 原生菜单：菜单项 {} 的快捷键 \"{raw}\" 转不成原生写法，这一项不带快捷键",
            node.id
        );
    }
    native
}

/// 菜单里的写法 → muda 的加速键写法。**拿不准就返回 `None`。**
///
/// 这套语法是查着 muda 源码里的 `parse_modifier` / `parse_code` 写的
/// （`muda-0.19.3/src/accelerator.rs`），不是照着印象猜的：
///
/// - 修饰键**大小写不敏感**，认 `ALT`/`OPTION`、`CTRL`/`CONTROL`、
///   `CMD`/`COMMAND`/`SUPER`、`SHIFT`，以及 `CmdOrCtrl`；
/// - ⚠️ 裸的 `CTRL` 在 macOS 上就是**真的 Control 键**，不是 ⌘。
///   所以标签里的 `Ctrl` 必须转成 `CmdOrCtrl`——那才是"各平台上的命令键"。
///   转错了的后果是"菜单上写着 ⌘S，按下去没反应"。
/// - 键名大小写不敏感，标点和数字**两种写法都收**（`COMMA` 和 `,` 等价）；
/// - ⚠️ 箭头键**只认** `UP`/`DOWN` 这类名字，**不认 `↑` 字形**——
///   而 `commands.ts` 里写的正是 `Alt+↑`，不折一道必然解析失败。
///
/// ⚠️ 这里**宁可返回 `None` 也不猜**。放行不了的结果只是"这一条没有快捷键"；
/// 而把一个没把握的字符串交给 muda，坏的可能是**整个菜单建不出来**。
pub fn to_native_accel(text: &str) -> Option<String> {
    let mut mods: Vec<&'static str> = Vec::new();
    let mut key: Option<String> = None;

    // ⚠️ 用 `split('+')` + 滤空，和 muda 那边用 `rfind('+')` 定位键名的做法
    // 在**这套语法写得出的写法**上是等价的。字面的 `+` 键两边都表达不了，也不打算支持。
    for part in text.split('+').map(str::trim).filter(|s| !s.is_empty()) {
        match part.to_ascii_lowercase().as_str() {
            // `Cmd`/`Meta`/`Super` 和 `Ctrl` 一视同仁，理由同 `src/ui/accel.ts`：
            // 它们在 macOS 上本来就是同一个键，分成两维只会打架。
            "ctrl" | "control" | "cmd" | "command" | "meta" | "super" | "win" => {
                if !mods.contains(&"CmdOrCtrl") {
                    mods.push("CmdOrCtrl");
                }
            }
            "shift" => {
                if !mods.contains(&"Shift") {
                    mods.push("Shift");
                }
            }
            "alt" | "option" | "opt" => {
                if !mods.contains(&"Alt") {
                    mods.push("Alt");
                }
            }
            _ => {
                // 第二个键名说明写错了（`Ctrl+S+N`）。**不猜哪个才是键**，整条作废。
                if key.is_some() {
                    return None;
                }
                key = Some(native_key(part)?);
            }
        }
    }

    let key = key?;
    let mut out = mods.join("+");
    if !out.is_empty() {
        out.push('+');
    }
    out.push_str(&key);
    Some(out)
}

/// 键名 → muda 认的写法。认不出来返回 `None`。
fn native_key(part: &str) -> Option<String> {
    let lower = part.to_lowercase();

    let named = match lower.as_str() {
        // 字形（`commands.ts` 里就这么写的）＋ 它的两个别名写法。
        "↑" | "up" | "arrowup" => "Up",
        "↓" | "down" | "arrowdown" => "Down",
        "←" | "left" | "arrowleft" => "Left",
        "→" | "right" | "arrowright" => "Right",
        "esc" | "escape" => "Escape",
        "return" | "enter" => "Enter",
        "space" | "spacebar" => "Space",
        "tab" => "Tab",
        "backspace" => "Backspace",
        "del" | "delete" => "Delete",
        "home" => "Home",
        "end" => "End",
        "pageup" => "PageUp",
        "pagedown" => "PageDown",
        "comma" => "Comma",
        "period" => "Period",
        "slash" => "Slash",
        "semicolon" => "Semicolon",
        "quote" => "Quote",
        "bracketleft" => "BracketLeft",
        "bracketright" => "BracketRight",
        "backslash" => "Backslash",
        "backquote" => "Backquote",
        "minus" => "Minus",
        "equal" | "plus" => "Equal",
        _ => "",
    };
    if !named.is_empty() {
        return Some(named.to_owned());
    }

    // F1..F24。⚠️ 用 `strip_prefix` 而不是 `lower[1..]`：后者碰上一个多字节
    // 开头（比如没进上面那张表的 `€`）会**在字节边界上 panic**——
    // 一个"菜单项写错了"不该把整个应用打崩。
    if let Some(digits) = lower.strip_prefix('f') {
        if let Ok(n) = digits.parse::<u8>() {
            if (1..=24).contains(&n) {
                return Some(format!("F{n}"));
            }
        }
    }

    // 单个字符：字母、数字、常见标点。muda 直接收字符本身。
    let mut chars = part.chars();
    let first = chars.next()?;
    if chars.next().is_some() {
        // 多字符且上面都不认——没把握，不放行。
        return None;
    }
    match first {
        'a'..='z' | 'A'..='Z' | '0'..='9' => Some(first.to_ascii_uppercase().to_string()),
        // ⚠️ 白名单里**故意没有 `+`**：它在上面已经被当分隔符切掉了，
        // 真要支持得先换一套切法，而全仓库没有一条这样的键位。
        ',' | '.' | '/' | ';' | '\'' | '[' | ']' | '\\' | '`' | '-' | '=' => {
            Some(first.to_string())
        }
        _ => None,
    }
}

fn estr(e: tauri::Error) -> String {
    format!("建原生菜单失败：{e}")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// **`src/ui/commands.ts` 里全部 50 条 `accel` 的逐条核对。**
    ///
    /// ⚠️ 这张表是**手抄**过来的，所以它会漂。但它值得存在：
    /// `to_native_accel` 返回 `None` 只是那一条没有快捷键，**不报错**——
    /// 而"按下去没反应"正是这个仓库最怕的那种失效（`docs/07` 里记过好几次）。
    /// 加新键位时请回来补一行，测试里对不上会当场红。
    const ALL_ACCELS: &[(&str, Option<&str>)] = &[
        // 文件
        ("Ctrl+N", Some("CmdOrCtrl+N")),
        ("Ctrl+Shift+N", Some("CmdOrCtrl+Shift+N")),
        ("Ctrl+O", Some("CmdOrCtrl+O")),
        ("Ctrl+P", Some("CmdOrCtrl+P")),
        ("Ctrl+S", Some("CmdOrCtrl+S")),
        ("Ctrl+Shift+S", Some("CmdOrCtrl+Shift+S")),
        ("Alt+Shift+P", Some("Alt+Shift+P")),
        ("Ctrl+,", Some("CmdOrCtrl+,")),
        ("Ctrl+W", Some("CmdOrCtrl+W")),
        // 编辑
        ("Ctrl+Z", Some("CmdOrCtrl+Z")),
        ("Ctrl+Y", Some("CmdOrCtrl+Y")),
        ("Ctrl+X", Some("CmdOrCtrl+X")),
        ("Ctrl+C", Some("CmdOrCtrl+C")),
        ("Ctrl+V", Some("CmdOrCtrl+V")),
        ("Ctrl+Shift+C", Some("CmdOrCtrl+Shift+C")),
        // ⚠️ 箭头那两条：`commands.ts` 写的是字形 `↑`，muda **不认字形**。
        ("Alt+↑", Some("Alt+Up")),
        ("Alt+↓", Some("Alt+Down")),
        ("Ctrl+H", Some("CmdOrCtrl+H")),
        // 段落
        ("Ctrl+1", Some("CmdOrCtrl+1")),
        ("Ctrl+2", Some("CmdOrCtrl+2")),
        ("Ctrl+3", Some("CmdOrCtrl+3")),
        ("Ctrl+4", Some("CmdOrCtrl+4")),
        ("Ctrl+5", Some("CmdOrCtrl+5")),
        ("Ctrl+6", Some("CmdOrCtrl+6")),
        ("Ctrl+0", Some("CmdOrCtrl+0")),
        ("Ctrl+Shift+M", Some("CmdOrCtrl+Shift+M")),
        ("Ctrl+Shift+K", Some("CmdOrCtrl+Shift+K")),
        ("Ctrl+Shift+Q", Some("CmdOrCtrl+Shift+Q")),
        ("Ctrl+Shift+[", Some("CmdOrCtrl+Shift+[")),
        ("Ctrl+Shift+]", Some("CmdOrCtrl+Shift+]")),
        ("Ctrl+Shift+X", Some("CmdOrCtrl+Shift+X")),
        // 格式
        ("Ctrl+B", Some("CmdOrCtrl+B")),
        ("Ctrl+I", Some("CmdOrCtrl+I")),
        ("Ctrl+U", Some("CmdOrCtrl+U")),
        ("Ctrl+Shift+`", Some("CmdOrCtrl+Shift+`")),
        ("Alt+Shift+5", Some("Alt+Shift+5")),
        ("Ctrl+K", Some("CmdOrCtrl+K")),
        ("Ctrl+\\", Some("CmdOrCtrl+\\")),
        // 视图
        ("Ctrl+Shift+L", Some("CmdOrCtrl+Shift+L")),
        ("Ctrl+Shift+1", Some("CmdOrCtrl+Shift+1")),
        ("Ctrl+Shift+3", Some("CmdOrCtrl+Shift+3")),
        ("Ctrl+Shift+2", Some("CmdOrCtrl+Shift+2")),
        ("Ctrl+Shift+F", Some("CmdOrCtrl+Shift+F")),
        ("Ctrl+/", Some("CmdOrCtrl+/")),
        // ⚠️ 编辑模式那两条（2026-09-23）。`Alt+数字` **不参与** `Ctrl→CmdOrCtrl`
        // 那次翻译——⌥ 在 macOS 上就是 Option，没有"和谁重名"的问题。
        // 它们摆在这里是因为**键族刻意不统一**：`Ctrl+/` 走标点、模式走 `Alt+数字`，
        // 看一眼表就知道，不用去读 `commands.ts`。
        ("Alt+1", Some("Alt+1")),
        ("Alt+2", Some("Alt+2")),
        ("F8", Some("F8")),
        ("F9", Some("F9")),
        ("F11", Some("F11")),
        ("Shift+F12", Some("Shift+F12")),
    ];

    #[test]
    fn 全部键位都转得出来() {
        let mut bad = Vec::new();
        for (input, want) in ALL_ACCELS {
            let got = to_native_accel(input);
            if got.as_deref() != *want {
                bad.push(format!("{input} → {got:?}（期望 {want:?}）"));
            }
        }
        assert!(bad.is_empty(), "转不出来的键位：\n{}", bad.join("\n"));
    }

    #[test]
    fn 桌面平台优先尝试原生菜单() {
        assert!(available());
    }

    #[test]
    fn 手抄的表和_commands_ts_一样多() {
        // 只挡住"键位从 50 条涨到 60 条、测试表没跟"这一种漂移。
        //
        // ⚠️ 下面这个数是**抄 `commands.ts` 数出来的**，不是自己长出来的：
        // 2026-09-23 加三种编辑模式时它从 48 变成 50，而**测试当时是绿的**——
        // 因为表里那 48 条自洽、`assert_eq!` 也只是拿常量比常量。
        // 这类"两处一起忘"的漂移这条测试**挡不住**，有这个 assert 不等于安全：
        // 真要同步，回去 `grep -c "accel:" src/ui/commands.ts`。
        assert_eq!(ALL_ACCELS.len(), 50, "accel 条数变了，请同步这张表");
    }

    #[test]
    fn ctrl_转成_cmdorctrl_而不是真的_control() {
        // ⚠️ 这条是这个模块里最容易写错、后果又最隐蔽的一处：
        // 直接照抄 `"Ctrl+S"` 给 muda，macOS 上会绑到**真的 Control 键**——
        // 菜单上画的是 ⌘S，按 ⌘S 没反应，而按 Control+S 才有。
        //
        // ⚠️ 断言要**整个相等**。曾经写的是 `!contains("Ctrl+")`，
        // 而 `"CmdOrCtrl+S"` 里本来就含这个子串（`CmdOr` + `Ctrl+` + `S`），
        // 于是这条测试对**正确**的实现也报错——一个只会误导人的断言。
        assert_eq!(to_native_accel("Ctrl+S").as_deref(), Some("CmdOrCtrl+S"));
        assert_eq!(to_native_accel("Ctrl+Shift+S").as_deref(), Some("CmdOrCtrl+Shift+S"));
        // 反过来：`Alt` 不该被一起转掉。
        assert_eq!(to_native_accel("Alt+↑").as_deref(), Some("Alt+Up"));
    }

    #[test]
    fn 拿不准的一律不放行() {
        // 认不出来 → `None`（这一条没有快捷键），**不是**一个瞎猜的字符串。
        assert_eq!(to_native_accel("Ctrl+Foo+S"), None); // 修饰键不认识
        assert_eq!(to_native_accel("Ctrl+S+N"), None); // 两个键名
        assert_eq!(to_native_accel("Ctrl+€"), None); // 多字节且不在表里（不能 panic）
        assert_eq!(to_native_accel("Ctrl+"), None); // 光有修饰键
        assert_eq!(to_native_accel(""), None);
        assert_eq!(to_native_accel("Ctrl+F25"), None); // F 键超范围
    }

    #[test]
    fn 灰掉的项不带快捷键() {
        let node = |enabled| MenuNode {
            sep: false,
            id: "edit.copy".into(),
            label: "复制".into(),
            accel: Some("Ctrl+C".into()),
            enabled,
            checked: None,
            submenu: Vec::new(),
        };
        // ⚠️⚠️ 这条是**功能性的**，不是洁癖：macOS 上禁用的菜单项照样会
        // 吃掉自己的键位，于是灰着的 ⌘C 会把复制粘贴弄坏。
        assert_eq!(leaf_accel(&node(false)), None);
        if cfg!(target_os = "linux") {
            // Linux/GTK 没有 accelerator group，显示层快捷键仍由前端处理。
            assert_eq!(leaf_accel(&node(true)), None);
        } else {
            assert_eq!(leaf_accel(&node(true)).as_deref(), Some("CmdOrCtrl+C"));
        }
    }

    #[test]
    fn 分隔线不看别的字段() {
        let n: MenuNode = serde_json::from_str(r#"{"sep":true,"label":"不该被用上"}"#).unwrap();
        assert!(n.sep);
        assert!(n.enabled, "`enabled` 默认必须是 true，否则整份菜单全是灰的");
    }
}
