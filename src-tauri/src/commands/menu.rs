//! 原生菜单的命令面。
//!
//! 这一层按约定只做三件事：转错误、调下层、把返回值说清楚（见 `commands/mod.rs`）。
//! 真正的建菜单逻辑在 `crate::native_menu`。

use tauri::AppHandle;

use crate::native_menu::{self, MenuNode};

/// 把前端推来的菜单树建成**原生菜单**并挂上去。
///
/// 返回 `true` = 挂上了（前端应当把自绘菜单栏藏起来）；`false` = 这个平台没有
/// 原生菜单（前端继续显示自绘菜单栏）。
///
/// ⚠️ 返回值是**前端决定藏不藏自绘菜单栏的唯一依据**，不要改成"按平台判断"。
/// 那种写法在"macOS 上建菜单失败"时会两道菜单都没有——藏了自绘的，
/// 原生那个又没建出来，用户面前就是**一条菜单都没有**。
/// 交给这里如实回答，失败时前端自然留在自绘那一版。
///
/// 失败只返回 `Err` 不 panic：菜单是入口，不是数据，建不出来不该让应用起不来。
#[tauri::command]
pub fn nota_native_menu_apply(app: AppHandle, nodes: Vec<MenuNode>) -> Result<bool, String> {
    native_menu::apply(&app, &nodes)
}
