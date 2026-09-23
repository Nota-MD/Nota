//! 主题相关命令。
//!
//! 四条命令对应界面上四个动作：**列出来**（主题菜单/设置面板）、
//! **读一份**（选中时把 CSS 文本交给前端去改造）、**读一份资源**
//! （字体/图片，读成 data: URL 内联进 CSS）、**打开文件夹**（让用户能放自己的主题）。

use std::path::Path;

use crate::error::Result;
use crate::themes::{self, ThemeInfo};

/// 列出所有可用主题。目录不存在不算错，返回空表。
#[tauri::command]
pub fn nota_themes_list() -> Vec<ThemeInfo> {
    themes::discover()
}

/// 读一份主题 CSS 的**文本**（不是渲染结果）。见 `themes.rs` 顶上那段。
#[tauri::command]
pub fn nota_theme_read(path: String) -> Result<String> {
    themes::read_css(Path::new(&path))
}

/// 读一份主题资源（字体/图片），返回可直接写进 CSS 的 **data: URL**。
///
/// 为什么不返回路径让前端用 asset 协议：见 `themes.rs` 顶上
/// "为什么字体也不走 asset 协议"——WebKitGTK 那边取不回来。
#[tauri::command]
pub fn nota_theme_asset(path: String) -> Result<String> {
    themes::read_asset(Path::new(&path))
}

/// 建好并返回我们自己的主题目录，供「打开主题文件夹」用。
#[tauri::command]
pub fn nota_themes_dir() -> Result<String> {
    themes::user_themes_dir()
}
