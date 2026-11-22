use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};
use crate::settings::image::InsertImageAction;

use super::RECOGNIZED_EXTENSIONS;

const NAME_UPPER_LIMIT: usize = 80;

pub fn target_directory(
    action: InsertImageAction,
    doc_dir: Option<&Path>,
    doc_stem: Option<&str>,
    custom_dir: &str,
) -> Result<Option<PathBuf>> {
    let need_document_side_edit = |left_deep: &str| -> Result<PathBuf> {
        let directory = doc_dir.ok_or_else(|| {
            NotaError::other(format!(
                "\"{left_deep}\" needs the document directory; save the document with Ctrl+S before inserting the image"
            ))
        })?;
        Ok(directory.to_path_buf())
    };
    match action {
        InsertImageAction::None => Ok(None),
        InsertImageAction::CopyToCurrentDir => Ok(Some(need_document_side_edit(
            "Copy to the current directory",
        )?)),
        InsertImageAction::CopyToAssets => Ok(Some(
            need_document_side_edit("Copy to ./assets")?.join("assets"),
        )),
        InsertImageAction::CopyToDocAssets => {
            let directory_2 = need_document_side_edit("Copy to ./$(filename).assets")?;
            let name = doc_stem.filter(|stem| !stem.is_empty()).ok_or_else(|| {
                NotaError::other(
                    "The document has no file name, so `$(filename).assets` cannot be resolved",
                )
            })?;
            Ok(Some(directory_2.join(format!("{name}.assets"))))
        }
        InsertImageAction::CopyToCustom => {
            let need = custom_dir.trim();
            if need.is_empty() {
                return Err(NotaError::other(
                    "No custom image path is configured; set one in image settings or choose another insert action",
                ));
            }
            let p = PathBuf::from(need);
            if p.is_absolute() {
                Ok(Some(p))
            } else {
                Ok(Some(
                    need_document_side_edit("Copy to a custom path")?.join(p),
                ))
            }
        }
    }
}

fn sanitize_image_name(wanted_content: &str) -> String {
    let suffix_segment = wanted_content
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(wanted_content)
        .trim()
        .trim_start_matches('.');
    let request_passed: String = suffix_segment
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
        .take(NAME_UPPER_LIMIT)
        .collect();
    let cleaned = request_passed.trim().to_string();
    if cleaned.is_empty() {
        "image.png".to_string()
    } else {
        cleaned
    }
}

fn recognized_extension(name: &str) -> Option<String> {
    let (_, extension) = name.rsplit_once('.')?;
    let extension = extension.to_ascii_lowercase();
    if RECOGNIZED_EXTENSIONS.contains(&extension.as_str()) {
        Some(extension)
    } else {
        None
    }
}

pub(super) fn content_segment_name(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .take(4)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn strip_extension(name: &str) -> &str {
    match name.rsplit_once('.') {
        Some((stem, _)) => stem,
        None => name,
    }
}

pub fn define_name(
    directory_2: &Path,
    wanted_name: &str,
    content_2: Option<&[u8]>,
) -> (PathBuf, bool) {
    let name = sanitize_image_name(wanted_name);
    let stem = strip_extension(&name).to_string();
    let extension = recognized_extension(&name)
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    for i in 0..1000u32 {
        let candidates_2 = if i == 0 {
            directory_2.join(&name)
        } else {
            directory_2.join(format!("{stem}-{i}{extension}"))
        };
        if !candidates_2.exists() {
            return (candidates_2, true);
        }
        if let Some(content_2) = content_2 {
            if std::fs::read(&candidates_2).is_ok_and(|existing| existing == content_2) {
                return (candidates_2, false);
            }
        }
    }
    (directory_2.join(format!("{stem}-999{extension}")), true)
}

pub(super) fn extract_name_from_address(address: &str) -> String {
    let tail = address
        .split(['?', '#'])
        .next()
        .unwrap_or(address)
        .rsplit('/')
        .next()
        .unwrap_or("");
    let name = sanitize_image_name(tail);
    if recognized_extension(&name).is_some() {
        name
    } else {
        format!("image-{}.png", content_segment_name(address.as_bytes()))
    }
}
