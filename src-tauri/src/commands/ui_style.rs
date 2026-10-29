//! 界面风格（用户导入的那一半）相关命令。
//!
//! 三条命令对应界面上三个动作：**列出来**（「外观」那一页的下拉）、
//! **取一份的 CSS**（选中导入风格时把文本交给前端去注入）、
//! **打开文件夹**（让用户能放自己的风格）。
//!
//! ⚠️ 形状与 `commands/theme.rs` 是**一对**（那边是文档主题），差别与理由写在
//! `ui_styles.rs` 文件头：同名覆盖内置、入参是 id 不是路径，两条规则一样；
//! 但**注入方式不一样**——文档主题要在前端限域，界面风格原样注入。
//! 那个差别在前端（`styles/ui-style.ts`），不在这里。
//!
//! ⚠️ 入参是 **id 不是路径**：路径由 `ui_styles.rs` 自己拼
//! （`<风格目录>/<id>/theme.css`），前端拿不到"让后端读任意文件"的能力。
//! 与 `theme.rs` 同一条取舍：传 id 是**结构上不可能出错**，
//! 比"路径 + 一道前缀检查"更强。

use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::ui_styles::{self, UiStyleInfo};

/// 列出所有可用的界面风格。用户目录不存在不算错，内置那几档照样在。
#[tauri::command]
pub fn nota_ui_styles() -> Vec<UiStyleInfo> {
    ui_styles::discover()
}

/// 取一份**用户导入的**界面风格的 CSS 文本（不是渲染结果）。
///
/// ⚠️ **内置那几档没有文件**，对它们调这条会报错——前端只在 `nota_ui_styles`
/// 报 `builtin: false` 时才该调它（内置的 CSS 已经在打包好的样式表里了）。
///
/// 为什么是"取文本"而不是给一个 `<link href=…>` 让 WebView 自己拉：
/// 与文档主题同一个理由（统一走一条通道、注入点在我们手里、asset 协议的 scope
/// 不必再开一个目录），而且**顺序**是我们能控的——用户那份必须排在内置之后。
#[tauri::command]
pub fn nota_ui_style_css(id: String) -> Result<String> {
    ui_styles::css_of(&id)
}

/// 建好用户风格目录并在系统的文件管理器里打开它，返回打开的是哪个路径。
///
/// ⚠️ "建出来"这一步不能省：首次使用时这个目录还不存在。
/// ⚠️ **"打开"这一步在宿主**：理由与 `nota_doc_themes_open_dir` 完全同源
/// （Tauri 的 ACL 要 scope、scope 跟着 `$APPCONFIG` 走、与本仓 `paths.rs`
/// 的 XDG 口径不一定同一个目录）——BUG-27 就是这一条，那边注释是详细版。
#[tauri::command]
pub fn nota_ui_styles_open_dir(app: tauri::AppHandle) -> Result<String> {
    let shown = ui_styles::user_styles_dir()?;
    app.opener()
        .open_path(shown.clone(), None::<&str>)
        .map_err(|e| NotaError::other(format!("调用系统打开器失败：{e}——目录是 {shown}")))?;
    Ok(shown)
}
