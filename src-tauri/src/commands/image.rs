use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::State;

use crate::commands::image_upload::{
    auto_upload, auto_upload_applies, document_has_key, document_location, read_settings,
};
use crate::document::DocId;
use crate::error::{NotaError, Result};
use crate::image::{self, ImageSource, InsertionRule};
use crate::state::AppState;

const PASTE_LIMIT: usize = 16 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ImageSourceInput {
    Path { path: String },

    Url { url: String },

    Base64 { data: String, ext: Option<String> },
}

#[derive(Debug, Serialize)]
pub struct PlacementResult {
    pub src: String,

    #[serde(rename = "savedTo")]
    pub saved_to: Option<String>,

    #[serde(rename = "did")]
    pub operation_2: image::PlacementOperation,

    #[serde(rename = "action")]
    pub action_2: String,

    #[serde(rename = "upload")]
    pub upload_2: Option<UploadResult>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind")]
pub enum UploadResult {
    #[serde(rename = "ok")]
    Success { url: String },

    #[serde(rename = "failed")]
    Failure { error: String },
}

#[tauri::command]
pub async fn nota_image_place(
    state: State<'_, AppState>,
    doc_id: Option<DocId>,
    source: ImageSourceInput,
) -> Result<PlacementResult> {
    let (document_directory, document_name) = document_location(&state, doc_id)?;
    let rule = {
        let s = state
            .settings
            .lock()
            .map_err(|_| NotaError::other("The settings lock is poisoned; restart Nota"))?;
        InsertionRule::from_settings(&s.image)
    };

    let source_2 = parse_source(source)?;

    let action_2 = action_name(&rule.action);

    let uploadsettings = read_settings().await?;
    let should_auto_upload = auto_upload_applies(
        &uploadsettings,
        &source_2,
        document_has_key(&state, doc_id)?,
    );

    let placement_directory = document_directory.clone();
    let (source_2, placement) = tauri::async_runtime::spawn_blocking(move || {
        let r = image::place(
            &source_2,
            &rule,
            placement_directory.as_deref(),
            document_name.as_deref(),
        );
        (source_2, r)
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not start the image task: {error}")))?;
    let result_3 = placement?;

    let upload_2 = if should_auto_upload {
        Some(
            auto_upload(
                uploadsettings,
                source_2,
                document_directory,
                result_3.saved_to.clone(),
            )
            .await,
        )
    } else {
        None
    };

    let mut src = result_3.src;
    let upload_2 = match upload_2 {
        Some(result_2) => {
            if let UploadResult::Success { url } = &result_2 {
                src = url.clone();
            }
            Some(result_2)
        }
        None => None,
    };

    Ok(PlacementResult {
        src,
        saved_to: result_3.saved_to,
        operation_2: result_3.operation_2,
        action_2,
        upload_2,
    })
}

pub(crate) fn parse_source(s: ImageSourceInput) -> Result<ImageSource> {
    match s {
        ImageSourceInput::Path { path } => {
            let p = std::path::PathBuf::from(&path);
            if p.as_os_str().is_empty() {
                return Err(NotaError::other("No image path was provided"));
            }
            Ok(ImageSource::LocalFile(p))
        }
        ImageSourceInput::Url { url } => {
            if !image::is_network_address(&url) {
                return Err(NotaError::other(format!(
                    "\"{url}\" is not an HTTP or HTTPS URL"
                )));
            }
            Ok(ImageSource::NetworkAddress(url))
        }
        ImageSourceInput::Base64 { data, ext } => {
            let zi_jie = base64::engine::general_purpose::STANDARD
                .decode(data.as_bytes())
                .map_err(|error| {
                    NotaError::other(format!(
                        "Could not read image data from the clipboard: {error}"
                    ))
                })?;
            if zi_jie.is_empty() {
                return Err(NotaError::other("The clipboard image is empty"));
            }
            if zi_jie.len() > PASTE_LIMIT {
                return Err(NotaError::other(format!(
                    "This image is {:.1} MB, above the {:.0} MB limit. Save it as a file and insert that file.",
                    zi_jie.len() as f64 / 1048576.0,
                    PASTE_LIMIT as f64 / 1048576.0
                )));
            }
            Ok(ImageSource::Clipboard {
                zi_jie,
                extension_2: ext.unwrap_or_else(|| "png".to_string()),
            })
        }
    }
}

const IMAGE_DISPLAY_LIMIT: u64 = 32 * 1024 * 1024;

fn tu_pian_mime(path_3: &Path) -> &'static str {
    match path_3
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

fn image_roots() -> Vec<PathBuf> {
    [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::desktop_dir(),
        dirs::download_dir(),
    ]
    .into_iter()
    .flatten()
    .filter_map(|p| p.canonicalize().ok())
    .collect()
}

fn inside_image_root(path_3: &Path, roots_2: &[PathBuf]) -> bool {
    roots_2.iter().any(|root_2| path_3.starts_with(root_2))
}

fn read_as_data_url(path_3: &str) -> Result<String> {
    let path_3 = PathBuf::from(path_3);
    let zhen = path_3.canonicalize().map_err(|error| {
        NotaError::other(format!(
            "Could not open image {}: {error}",
            path_3.display()
        ))
    })?;
    let metadata_2 = std::fs::metadata(&zhen)
        .map_err(|error| NotaError::other(format!("Could not read image metadata: {error}")))?;
    if !metadata_2.is_file() {
        return Err(NotaError::other("The image path is not a file"));
    }
    if metadata_2.len() > IMAGE_DISPLAY_LIMIT {
        return Err(NotaError::other(format!(
            "The image is {:.1} MB, above the 32 MB display limit",
            metadata_2.len() as f64 / 1048576.0
        )));
    }
    if !inside_image_root(&zhen, &image_roots()) {
        return Err(NotaError::other(
            "Image access is limited to the home, document, Desktop, and Downloads directories",
        ));
    }
    let zi_jie = std::fs::read(&zhen)
        .map_err(|error| NotaError::other(format!("Could not read the image: {error}")))?;
    let engine_2 = base64::engine::general_purpose::STANDARD;
    Ok(format!(
        "data:{};base64,{}",
        tu_pian_mime(&zhen),
        engine_2.encode(zi_jie)
    ))
}

#[tauri::command]
pub async fn nota_image_data_url(path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || read_as_data_url(&path))
        .await
        .map_err(|error| NotaError::other(format!("The image read task failed: {error}")))?
}

fn action_name(a: &crate::settings::image::InsertImageAction) -> String {
    use crate::settings::image::InsertImageAction as A;
    match a {
        A::None => "none",
        A::CopyToCurrentDir => "copy-to-current-dir",
        A::CopyToAssets => "copy-to-assets",
        A::CopyToDocAssets => "copy-to-doc-assets",
        A::CopyToCustom => "copy-to-custom",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tu_pian_kuo_zhan_ming_gei_chu_zheng_que_de_mime() {
        assert_eq!(tu_pian_mime(Path::new("a.PNG")), "image/png");
        assert_eq!(tu_pian_mime(Path::new("a.jpeg")), "image/jpeg");
        assert_eq!(tu_pian_mime(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(
            tu_pian_mime(Path::new("a.unknown")),
            "application/octet-stream"
        );
    }

    #[test]
    fn tu_pian_path_bi_xu_luo_zai_yun_xu_de_root_directory_nei() {
        let root_2 = std::env::temp_dir().join(format!("nota-image-root-{}", std::process::id()));
        std::fs::create_dir_all(root_2.join("inside")).unwrap();
        std::fs::write(root_2.join("inside/a.png"), b"x").unwrap();
        let root_2 = root_2.canonicalize().unwrap();
        let nei = root_2.join("inside/a.png");
        assert!(inside_image_root(&nei, std::slice::from_ref(&root_2)));
        assert!(!inside_image_root(
            Path::new("/etc/passwd"),
            std::slice::from_ref(&root_2)
        ));
        let _ = std::fs::remove_dir_all(root_2);
    }

    fn jie_2(s: ImageSourceInput) -> Result<ImageSource> {
        parse_source(s)
    }

    #[test]
    fn address_yao_zhen_de_is_network_address() {
        assert!(jie_2(ImageSourceInput::Url {
            url: "https://a/b.png".into()
        })
        .is_ok());
        assert!(jie_2(ImageSourceInput::Url {
            url: "/home/u/x.png".into()
        })
        .is_err());
        assert!(jie_2(ImageSourceInput::Url { url: "".into() }).is_err());
    }

    #[test]
    fn kong_path_bu_shi_path() {
        assert!(jie_2(ImageSourceInput::Path { path: "".into() }).is_err());
        assert!(jie_2(ImageSourceInput::Path {
            path: "/home/u/x.png".into()
        })
        .is_ok());
    }

    #[test]
    fn clipboard_de_zi_jie_yao_jie_de_kai_qie_bu_shi_kong_de() {
        let ok_de = base64::engine::general_purpose::STANDARD.encode([1u8, 2, 3]);
        let r = jie_2(ImageSourceInput::Base64 {
            data: ok_de.clone(),
            ext: Some("png".into()),
        })
        .unwrap();
        match r {
            ImageSource::Clipboard {
                zi_jie,
                extension_2,
            } => {
                assert_eq!(zi_jie, vec![1, 2, 3]);
                assert_eq!(extension_2, "png");
            }
            other => panic!("\u{5e94}\u{8be5}\u{662f}\u{526a}\u{8d34}\u{677f}\u{ff1a}{other:?}"),
        }

        assert!(jie_2(ImageSourceInput::Base64 {
            data: "\u{8fd9}\u{4e0d}\u{662f} base64\u{ff01}\u{ff01}".into(),
            ext: None,
        })
        .is_err());

        assert!(jie_2(ImageSourceInput::Base64 {
            data: "".into(),
            ext: None,
        })
        .is_err());
    }

    #[test]
    fn action_name_yu_settings_li_write_chu_qu_de_na_yi_tao_yi_zhi() {
        use crate::settings::image::Image;
        let table_2 = [
            ("none", crate::settings::image::InsertImageAction::None),
            (
                "copy-to-current-dir",
                crate::settings::image::InsertImageAction::CopyToCurrentDir,
            ),
            (
                "copy-to-assets",
                crate::settings::image::InsertImageAction::CopyToAssets,
            ),
            (
                "copy-to-doc-assets",
                crate::settings::image::InsertImageAction::CopyToDocAssets,
            ),
            (
                "copy-to-custom",
                crate::settings::image::InsertImageAction::CopyToCustom,
            ),
        ];
        for (name_2, value_2) in table_2 {
            assert_eq!(action_name(&value_2), name_2);
            let text_2 = toml::to_string_pretty(&Image {
                insert_action: value_2,
                ..Default::default()
            })
            .unwrap();
            assert!(
                text_2.contains(&format!("insert_action = \"{name_2}\"")),
                "\u{8bbe}\u{7f6e}\u{91cc}\u{5199}\u{51fa}\u{53bb}\u{7684}\u{4e0e}\u{547d}\u{4ee4}\u{91cc}\u{62a5}\u{7684}\u{4e0d}\u{662f}\u{4e00}\u{5957}\u{ff1a}{name_2}\n{text_2}"
            );
        }
    }
}
