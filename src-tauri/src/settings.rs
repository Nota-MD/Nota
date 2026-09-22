//! 用户设置。
//!
//! 三条**互相独立**的外观轴（用户 2026-09-22 明确要求，别混成一条）：
//!
//! 1. `ui_style` —— **界面风格**，是一整套设计语言（macOS / Yaru / Adwaita / Windows），
//!    换的不只是颜色，还包括控件形状、圆角、间距、动效、字体栈。
//!    ⚠️ 它**不是**"主题"的同义词。
//! 2. `ui_mode` —— 明暗。`auto` 时跟随系统（Linux 走 XDG desktop portal 的
//!    `color-scheme`）。这条轴在**任何**风格下都成立。
//! 3. `document_theme` —— **文档主题**，只管正文那一块（Typora 的 Themes 菜单）。
//!    纯 CSS，用户可以在主题目录里放 `.user.css` 覆盖，不动应用外壳一分。
//!
//! 三条轴的落地形态见 `docs/04-ui-map.md` §外观，实现排在后面轮次（见 `docs/07`）。

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};
use crate::paths;

/// 界面风格。加新风格时**同时**要改：本枚举、`frontend/src/styles/styles/` 下的
/// 风格表、`docs/04` 的外观一节。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiStyle {
    /// 跟随当前桌面环境，探不到就用 Adwaita。
    Auto,
    Adwaita,
    Macos,
    Yaru,
    Windows,
}

impl Default for UiStyle {
    fn default() -> Self {
        UiStyle::Auto
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiMode {
    Auto,
    Light,
    Dark,
}

impl Default for UiMode {
    fn default() -> Self {
        UiMode::Auto
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub ui_style: UiStyle,
    pub ui_mode: UiMode,
    /// 文档主题名，对应 `themes/<name>.css`。空串表示用内置默认。
    pub document_theme: String,
    /// 界面字号（px）。文档字号是文档主题的事，不在这里。
    pub ui_font_size: u32,
    /// 内容区宽度上限（px）。Typora 的"正文宽度"。
    pub content_width: u32,
    /// 关闭窗口时若有未保存改动，是否询问。
    pub confirm_unsaved: bool,
    /// 自动保存间隔（秒）。0 表示关闭自动保存。
    pub autosave_seconds: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ui_style: UiStyle::default(),
            ui_mode: UiMode::default(),
            document_theme: String::new(),
            ui_font_size: 15,
            content_width: 760,
            confirm_unsaved: true,
            autosave_seconds: 0,
        }
    }
}

impl Settings {
    /// 从磁盘读。文件不存在**不算错误**——首次启动就是这种情况，返回默认值。
    /// 文件存在但解析不了则报错：静默回默认会让人以为设置被吞了。
    pub fn load() -> Result<Self> {
        let path = paths::settings_file()?;
        Self::load_from(&path)
    }

    pub fn load_from(path: &Path) -> Result<Self> {
        match std::fs::read_to_string(path) {
            Ok(text) => toml::from_str(&text).map_err(|e| NotaError::Config(format!(
                "解析 {} 失败：{e}",
                path.display()
            ))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(NotaError::Read {
                path: path.to_path_buf(),
                source: e,
            }),
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = paths::settings_file()?;
        self.save_to(&path)
    }

    pub fn save_to(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            paths::ensure_dir(parent)?;
        }
        let text = toml::to_string_pretty(self)
            .map_err(|e| NotaError::Config(format!("序列化设置失败：{e}")))?;
        std::fs::write(path, text).map_err(|source| NotaError::Write {
            path: path.to_path_buf(),
            source,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 默认设置能往返序列化() {
        let dir = std::env::temp_dir().join("nota-settings-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");

        let mut s = Settings::default();
        s.ui_style = UiStyle::Macos;
        s.ui_mode = UiMode::Dark;
        s.save_to(&path).unwrap();

        let back = Settings::load_from(&path).unwrap();
        assert_eq!(back.ui_style, UiStyle::Macos);
        assert_eq!(back.ui_mode, UiMode::Dark);
        assert_eq!(back.content_width, 760);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 文件不存在时回默认而不是报错() {
        let path = std::env::temp_dir().join("nota-does-not-exist-xyz/settings.toml");
        let s = Settings::load_from(&path).unwrap();
        assert_eq!(s.ui_style, UiStyle::Auto);
    }

    #[test]
    fn 枚举落盘用_kebab_风格() {
        // 存法即接口：`ui_style = "macos"`，不是 `"Macos"`。
        let s = Settings {
            ui_style: UiStyle::Macos,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&s).unwrap();
        assert!(text.contains(r#"ui_style = "macos""#), "实际是：\n{text}");
    }
}
