use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};
use crate::paths;

pub mod appearance;
pub mod document;
pub mod download;
pub mod editor;
pub mod export;
pub mod files;
pub mod focus;
pub mod general;
pub mod image;
pub mod keys;
pub mod markdown;
pub mod updates;

pub use appearance::Appearance;
pub use document::{DocFont, Document};
pub use download::Download;
pub use editor::Editor;
pub use export::Export;
pub use files::Files;
pub use focus::Focus;
pub use general::General;
pub use image::Image;
pub use keys::Keys;
pub use markdown::Markdown;
pub use updates::Updates;

pub const DEFAULT_UI_STYLE: &str = "adwaita";

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
    pub ui_style: String,
    pub ui_mode: UiMode,

    pub document_theme: String,

    pub ui_font_size: u32,

    pub content_width: u32,

    pub limit_text_width: bool,

    pub confirm_unsaved: bool,

    pub autosave_seconds: u32,

    pub strict_markdown: bool,

    pub enable_physics: bool,

    pub files: Files,

    pub editor: Editor,

    pub image: Image,

    pub markdown: Markdown,

    pub export: Export,

    pub appearance: Appearance,

    pub general: General,

    pub download: Download,

    pub updates: Updates,

    pub focus: Focus,

    pub document: Document,

    pub keys: Keys,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ui_style: DEFAULT_UI_STYLE.to_owned(),
            ui_mode: UiMode::default(),
            document_theme: String::new(),
            ui_font_size: 15,
            content_width: 760,

            limit_text_width: false,
            confirm_unsaved: true,
            autosave_seconds: 0,

            strict_markdown: false,

            enable_physics: false,
            files: Files::default(),
            editor: Editor::default(),
            image: Image::default(),
            markdown: Markdown::default(),
            export: Export::default(),
            appearance: Appearance::default(),
            general: General::default(),
            download: Download::default(),
            updates: Updates::default(),
            focus: Focus::default(),
            document: Document::default(),
            keys: Keys::default(),
        }
    }
}

impl Settings {
    pub fn load() -> Result<Self> {
        let path = paths::settings_file()?;
        Self::load_from(&path)
    }

    pub fn load_from(path: &Path) -> Result<Self> {
        match std::fs::read_to_string(path) {
            Ok(text) => toml::from_str(&text).map_err(|e| {
                let bei_fen = liu_yi_fen_bei_fen(path);
                let wei_ba = match &bei_fen {
                    Some(b) => format!("(the original file was saved as {})", b.display()),
                    None => String::new(),
                };
                NotaError::Config(format!("Could not parse {}: {e}{wei_ba}", path.display()))
            }),
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
            .map_err(|e| NotaError::Config(format!("Could not serialize settings: {e}")))?;
        std::fs::write(path, text).map_err(|source| NotaError::Write {
            path: path.to_path_buf(),
            source,
        })
    }
}

fn liu_yi_fen_bei_fen(path: &Path) -> Option<PathBuf> {
    let mut raw = path.as_os_str().to_owned();
    raw.push(".bak");
    let bak = PathBuf::from(raw);
    std::fs::copy(path, &bak).ok()?;
    Some(bak)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_bu_dong_de_settings_hui_xian_liu_yi_fen_bei_fen() {
        let dir = std::env::temp_dir().join("nota-settings-backup-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");
        std::fs::write(
            &path,
            "ui_style = [\u{8fd9}\u{4e0d}\u{662f}\u{5408}\u{6cd5}\u{7684} TOML",
        )
        .unwrap();

        let r = Settings::load_from(&path);
        assert!(r.is_err(), "\u{89e3}\u{6790}\u{4e0d}\u{4e86}\u{8981}\u{62a5}\u{9519}\u{ff0c}\u{4e0d}\u{80fd}\u{9759}\u{9ed8}\u{56de}\u{9ed8}\u{8ba4}");

        let bak = dir.join("settings.toml.bak");
        assert!(
            bak.exists(),
            "\u{539f}\u{6587}\u{4ef6}\u{8981}\u{7559}\u{4e00}\u{4efd}\u{526f}\u{672c}"
        );
        assert_eq!(
            std::fs::read_to_string(&bak).unwrap(),
            "ui_style = [\u{8fd9}\u{4e0d}\u{662f}\u{5408}\u{6cd5}\u{7684} TOML",
            "\u{526f}\u{672c}\u{8981}\u{548c}\u{539f}\u{6587}\u{4ef6}\u{9010}\u{5b57}\u{8282}\u{4e00}\u{81f4}"
        );
        assert!(
            r.unwrap_err().to_string().contains("saved as"),
            "the error should identify where the backup was saved"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn settings_file_bu_cun_zai_shi_gei_default_value_qie_bu_liu_bei_fen() {
        let dir = std::env::temp_dir().join("nota-settings-absent-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");

        let s = Settings::load_from(&path).unwrap();
        assert_eq!(s.strict_markdown, Settings::default().strict_markdown);
        assert!(!dir.join("settings.toml.bak").exists(), "\u{4ec0}\u{4e48}\u{90fd}\u{6ca1}\u{8bfb}\u{5230}\u{ff0c}\u{6ca1}\u{4ec0}\u{4e48}\u{53ef}\u{5907}\u{4efd}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn default_settings_neng_wang_fan_xu_lie_hua() {
        let dir = std::env::temp_dir().join("nota-settings-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");

        let mut s = Settings::default();
        s.ui_style = "macos".to_owned();
        s.ui_mode = UiMode::Dark;
        s.save_to(&path).unwrap();

        let back = Settings::load_from(&path).unwrap();
        assert_eq!(back.ui_style, "macos");

        assert!(!back.enable_physics);
        assert_eq!(back.ui_mode, UiMode::Dark);
        assert_eq!(back.content_width, 760);

        assert!(!back.limit_text_width);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_bu_cun_zai_shi_hui_default_er_bu_shi_bao_cuo() {
        let path = std::env::temp_dir().join("nota-does-not-exist-xyz/settings.toml");
        let s = Settings::load_from(&path).unwrap();
        assert_eq!(s.ui_style, DEFAULT_UI_STYLE);
    }

    #[test]
    fn mei_ju_luo_pan_yong_kebab_feng_ge() {
        let s = Settings {
            ui_style: "macos".to_owned(),
            ..Default::default()
        };
        let text = toml::to_string_pretty(&s).unwrap();
        assert!(
            text.contains(r#"ui_style = "macos""#),
            "\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
        );
    }

    #[test]
    fn physics_default_shi_guan_de_qie_neng_wang_fan() {
        assert!(!Settings::default().enable_physics);

        let s = Settings {
            enable_physics: true,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&s).unwrap();
        assert!(
            text.contains("enable_physics = true"),
            "\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
        );
        let back: Settings = toml::from_str(&text).unwrap();
        assert!(back.enable_physics);
    }

    #[test]
    fn qi_ye_settings_neng_zheng_fen_wang_fan() {
        let dir = std::env::temp_dir().join("nota-settings-panes-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.toml");

        let mut s = Settings::default();
        s.files.show_hidden = true;
        s.files.startup = files::StartupAction::LastSession;
        s.editor.default_indent = 8;
        s.editor.line_ending = editor::LineEnding::Crlf;
        s.editor.keyboard_experience = true;
        s.image.insert_action = image::InsertImageAction::CopyToAssets;
        s.markdown.highlight = false;
        s.markdown.smart_punctuation = markdown::SmartPunctuation::Render;
        s.markdown.bullet_mark = markdown::BulletMark::Star;
        s.markdown.code_indent = 2;
        s.export.open_after_export = true;
        s.appearance.zoom = 125;
        s.general.debug_mode = true;
        s.download.replacements = "github.com/ => gh-proxy.net/github.com/".to_owned();
        s.save_to(&path).unwrap();

        let back = Settings::load_from(&path).unwrap();
        assert!(back.files.show_hidden);
        assert_eq!(back.files.startup, files::StartupAction::LastSession);
        assert_eq!(back.editor.default_indent, 8);
        assert_eq!(back.editor.line_ending, editor::LineEnding::Crlf);
        assert!(back.editor.keyboard_experience, "\u{952e}\u{76d8}\u{4f53}\u{9a8c}\u{4f18}\u{5316}\u{5fc5}\u{987b}\u{6574}\u{4efd}\u{5f80}\u{8fd4}");
        assert_eq!(
            back.image.insert_action,
            image::InsertImageAction::CopyToAssets
        );
        assert!(!back.markdown.highlight);
        assert_eq!(
            back.markdown.smart_punctuation,
            markdown::SmartPunctuation::Render
        );
        assert_eq!(back.markdown.bullet_mark, markdown::BulletMark::Star);
        assert_eq!(back.markdown.code_indent, 2);
        assert!(back.export.open_after_export);
        assert_eq!(back.appearance.zoom, 125);
        assert!(back.general.debug_mode);
        assert_eq!(
            back.download.replacements,
            "github.com/ => gh-proxy.net/github.com/"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn biao_liang_write_zai_table_qian_mian_fou_ze_toml_hui_ju_receive() {
        let s = Settings::default();
        let text = toml::to_string_pretty(&s).expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}\u{ff08}\u{5b57}\u{6bb5}\u{987a}\u{5e8f}\u{9519}\u{4e86}\u{5c31}\u{4f1a}\u{5728}\u{8fd9}\u{513f}\u{70b8}\u{ff09}");

        let di_yi_zhang_table = text
            .find("\n[")
            .expect("\u{8be5}\u{6709}\u{81f3}\u{5c11}\u{4e00}\u{5f20}\u{8868}");
        let zui_hou_de_biao_liang = text
            .rfind("\nenable_physics = ")
            .expect("enable_physics \u{8be5}\u{662f}\u{6700}\u{540e}\u{4e00}\u{4e2a}\u{9876}\u{5c42}\u{6807}\u{91cf}");
        assert!(
            zui_hou_de_biao_liang < di_yi_zhang_table,
            "\u{6807}\u{91cf}\u{5fc5}\u{987b}\u{6392}\u{5728}\u{6240}\u{6709}\u{8868}\u{4e4b}\u{524d}\u{ff0c}\u{5b9e}\u{9645}\u{987a}\u{5e8f}\u{662f}\u{ff1a}\n{text}"
        );
    }

    #[test]
    fn lao_settings_file_li_mei_you_na_qi_zhang_table_shi_quan_shi_default_value() {
        let lao_file = r#"
ui_style = "ghub"
ui_mode = "dark"
document_theme = "night"
view_mode = "split"
ui_font_size = 17
content_width = 900
confirm_unsaved = false
autosave_seconds = 60
strict_markdown = true
enable_physics = true
"#;
        let s: Settings = toml::from_str(lao_file).expect(
            "\u{8001}\u{6587}\u{4ef6}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}",
        );

        assert_eq!(s.ui_style, "ghub");
        assert_eq!(s.ui_mode, UiMode::Dark);
        assert_eq!(s.document_theme, "night");
        assert_eq!(s.ui_font_size, 17);
        assert_eq!(s.content_width, 900);
        assert!(
            !s.limit_text_width,
            "\u{8001}\u{6587}\u{4ef6}\u{91cc}\u{90a3}\u{4e2a} 900 \u{662f}**\u{65e7}\u{9ed8}\u{8ba4}\u{751f}\u{6548}\u{65f6}\u{4ee3}**\u{7559}\u{4e0b}\u{7684}\u{503c}\u{ff1b}\u{65b0}\u{52a0}\u{7684}\u{5f00}\u{5173}\u{5fc5}\u{987b}\u{9ed8}\u{8ba4}\u{5173}\u{ff0c}\
             \u{5426}\u{5219}\u{5bbd}\u{7a97}\u{53e3}\u{53f3}\u{8fb9}\u{90a3}\u{6761}\u{7a7a}\u{6863}\u{7167}\u{65e7}\u{ff08}\u{7528}\u{6237} 2026-10-09 \u{62a5}\u{7684}\u{5c31}\u{662f}\u{5b83}\u{ff09}"
        );
        assert!(!s.confirm_unsaved);
        assert_eq!(s.autosave_seconds, 60);
        assert!(s.strict_markdown, "\u{4e25}\u{683c}\u{6a21}\u{5f0f}\u{88ab}\u{9759}\u{9ed8}\u{5173}\u{4e86}\u{5c31}\u{662f}\u{8fd9}\u{6761}\u{8981}\u{6321}\u{7684}\u{4e8b}");
        assert!(s.enable_physics, "physics \u{88ab}\u{9759}\u{9ed8}\u{5173}\u{4e86}\u{5c31}\u{662f}\u{8fd9}\u{6761}\u{8981}\u{6321}\u{7684}\u{4e8b}");

        assert_eq!(s.markdown, Markdown::default());
        assert_eq!(s.editor, Editor::default());
        assert_eq!(s.files, Files::default());
        assert_eq!(s.appearance, Appearance::default());
    }
}
