use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::commands::image::{parse_source, ImageSourceInput, UploadResult};
use crate::document::DocId;
use crate::error::{NotaError, Result};
use crate::image::{self, ImageSource};
use crate::state::AppState;
use crate::upload::{self, UploadPayload, UploadSettings};

#[derive(Debug, Serialize)]
pub struct UploadOverview {
    pub settings: UploadSettings,

    #[serde(rename = "canUpload")]
    pub configured: bool,

    #[serde(rename = "willAutoUpload")]
    pub will_auto_upload: bool,
}

#[derive(Debug, Serialize)]
pub struct UploadedImage {
    pub url: String,
}

#[tauri::command]
pub async fn nota_image_upload_get(
    state: State<'_, AppState>,
    doc_id: Option<DocId>,
) -> Result<UploadOverview> {
    let settings_2 = read_settings().await?;
    let configured = settings_2.available_2();

    let automatic = configured && settings_2.auto && document_has_key(&state, doc_id)?;
    Ok(UploadOverview {
        settings: settings_2,
        configured,
        will_auto_upload: automatic,
    })
}

#[tauri::command]
pub async fn nota_image_upload_set(settings: UploadSettings) -> Result<()> {
    upload::shape_is_valid(&settings)?;
    tauri::async_runtime::spawn_blocking(move || upload::write_2(&settings))
        .await
        .map_err(|error| {
            NotaError::other(format!("Could not start the upload settings task: {error}"))
        })?
}

#[tauri::command]
pub async fn nota_image_upload_one(
    state: State<'_, AppState>,
    doc_id: Option<DocId>,
    source: ImageSourceInput,
) -> Result<UploadedImage> {
    let (document_directory, _) = document_location(&state, doc_id)?;
    let settings_2 = read_settings().await?;
    let source_2 = parse_source(source)?;

    let url = upload_this(settings_2, source_2, document_directory, None).await?;
    Ok(UploadedImage { url })
}

pub(crate) async fn upload_this(
    settings_2: UploadSettings,
    source_2: image::ImageSource,
    document_directory: Option<PathBuf>,
    saved_to_de: Option<String>,
) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let content_2 = upload_payload(
            &source_2,
            document_directory.as_deref(),
            saved_to_de.as_deref(),
        )?;
        upload::upload_once(&settings_2, content_2)
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not start the upload task: {error}")))?
}

fn upload_payload(
    source_3: &ImageSource,
    document_directory: Option<&Path>,
    saved_to_de: Option<&str>,
) -> Result<UploadPayload> {
    if let Some(path_3) = saved_to_de {
        let p = Path::new(path_3);
        let zi_jie = std::fs::read(p).map_err(|e| NotaError::Read {
            path: p.to_path_buf(),
            source: e,
        })?;
        return Ok(UploadPayload::LocalFile {
            zi_jie,
            filename_2: filename_2(p),
        });
    }
    Ok(match source_3 {
        ImageSource::LocalFile(provided) => {
            let p = image::resolve_local_file(provided, document_directory);
            let zi_jie = std::fs::read(&p).map_err(|e| NotaError::Read {
                path: p.clone(),
                source: e,
            })?;

            UploadPayload::LocalFile {
                zi_jie,
                filename_2: filename_2(&p),
            }
        }
        ImageSource::NetworkAddress(u) => UploadPayload::NetworkAddress {
            original_address: u.clone(),
        },
        ImageSource::Clipboard {
            zi_jie,
            extension_2,
        } => UploadPayload::LocalFile {
            zi_jie: zi_jie.clone(),
            filename_2: format!("image.{extension_2}"),
        },
    })
}

fn filename_2(p: &Path) -> String {
    p.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "image.png".to_string())
}

pub(crate) async fn read_settings() -> Result<UploadSettings> {
    tauri::async_runtime::spawn_blocking(upload::read_2)
        .await
        .map_err(|error| NotaError::other(format!("Could not read upload settings: {error}")))
}

pub(crate) fn auto_upload_applies(
    settings_2: &UploadSettings,
    source_2: &image::ImageSource,
    prerequisite_enabled: bool,
) -> bool {
    settings_2.available_2() && settings_2.auto && !source_2.is_network_2() && prerequisite_enabled
}

pub(crate) fn document_location(
    state: &AppState,
    doc_id: Option<DocId>,
) -> Result<(Option<PathBuf>, Option<String>)> {
    let docs = state
        .documents
        .lock()
        .map_err(|_| NotaError::other("The document store lock is poisoned; restart Nota"))?;
    Ok(match doc_id.and_then(|id| docs.get(id)) {
        Some(d) => (
            d.path
                .as_ref()
                .and_then(|p| p.parent().map(|x| x.to_path_buf())),
            d.path
                .as_ref()
                .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().to_string())),
        ),
        None => (None, None),
    })
}

pub(crate) fn document_has_key(state: &AppState, doc_id: Option<DocId>) -> Result<bool> {
    let docs = state
        .documents
        .lock()
        .map_err(|_| NotaError::other("The document store lock is poisoned; restart Nota"))?;
    Ok(doc_id
        .and_then(|id| docs.get(id))
        .is_some_and(|d| upload::prerequisite_enabled_2(&d.text)))
}

pub(crate) async fn auto_upload(
    settings_2: UploadSettings,
    source_2: image::ImageSource,
    document_directory: Option<PathBuf>,
    saved_to_de: Option<String>,
) -> UploadResult {
    match upload_this(settings_2, source_2, document_directory, saved_to_de).await {
        Ok(url) => UploadResult::Success { url },

        Err(e) => UploadResult::Failure {
            error: e.to_string(),
        },
    }
}
