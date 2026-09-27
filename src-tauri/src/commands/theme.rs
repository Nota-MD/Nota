//! 文档主题相关命令。
//!
//! 三条命令对应界面上三个动作：**列出来**（主题菜单）、**取一份的 CSS**
//! （选中时把文本交给前端去限域注入）、**打开文件夹**（让用户能放自己的主题）。
//!
//! ⚠️ 入参是 **id 不是路径**。路径由 `themes.rs` 自己拼（`<主题目录>/<id>.css`），
//! 前端拿不到"让后端读任意文件"的能力。上一版是传路径 + 一道目录前缀检查，
//! 那一版没有漏洞，但"传 id"是**结构上不可能出错**，比"检查得对"更强。
//!
//! 也**没有**"读一份资源"那条命令了：那是给第三方主题内联字体用的，
//! 那一整条兼容链已经按用户要求拆掉（见 `themes.rs` 文件头）。

use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::themes::{self, DocThemeInfo};

/// 列出所有可用的文档主题。用户目录不存在不算错，内置那几套照样在。
#[tauri::command]
pub fn nota_doc_themes() -> Vec<DocThemeInfo> {
    themes::discover()
}

/// 取一份文档主题的 **CSS 文本**（不是渲染结果）。
///
/// 限域（把每条选择器挂到编辑区之下）在前端做，所以这里要的是文本。
/// 为什么不直接用 asset 协议 `<link>` 进来：那样拿不到文本，也就没法限域，
/// 文档主题立刻会渗进界面外壳——见 `themes.rs` 文件头。
#[tauri::command]
pub fn nota_doc_theme_css(id: String) -> Result<String> {
    themes::css_of(&id)
}

/// 建好用户主题目录并在系统的文件管理器里打开它，返回打开的是哪个路径。
///
/// ⚠️ "建出来"这一步不能省：首次使用时这个目录还不存在，而文件管理器
/// 打不开一个不存在的路径。
///
/// ⚠️ **为什么"打开"这一步在宿主**：理由与 `nota_settings_open_dir` 那段
/// 完全同源（Tauri 的 ACL 要 scope、scope 跟着 `$APPCONFIG` 走、与本仓
/// `paths.rs` 的 XDG 口径不一定同一个目录）——BUG-27 就是这一条。
/// 那边那段注释是详细版，这里不重复。
#[tauri::command]
pub fn nota_doc_themes_open_dir(app: tauri::AppHandle) -> Result<String> {
    let shown = themes::user_themes_dir()?;
    app.opener()
        .open_path(shown.clone(), None::<&str>)
        .map_err(|e| NotaError::other(format!("调用系统打开器失败：{e}——目录是 {shown}")))?;
    Ok(shown)
}
