use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};
use crate::settings::image::InsertImageAction;

use super::RECOGNIZED_EXTENSIONS;

const NAME_SHANG_XIAN: usize = 80;

pub fn target_directory(
    action: InsertImageAction,
    doc_dir: Option<&Path>,
    doc_stem: Option<&str>,
    custom_dir: &str,
) -> Result<Option<PathBuf>> {
    let yao_document_pang_bian = |zuo_shen_me: &str| -> Result<PathBuf> {
        let d = doc_dir.ok_or_else(|| {
            NotaError::other(format!(
                "\"{zuo_shen_me}\" needs the document directory; save the document with Ctrl+S before inserting the image"
            ))
        })?;
        Ok(d.to_path_buf())
    };
    match action {
        InsertImageAction::None => Ok(None),
        InsertImageAction::CopyToCurrentDir => Ok(Some(yao_document_pang_bian(
            "Copy to the current directory",
        )?)),
        InsertImageAction::CopyToAssets => Ok(Some(
            yao_document_pang_bian("Copy to ./assets")?.join("assets"),
        )),
        InsertImageAction::CopyToDocAssets => {
            let directory_2 = yao_document_pang_bian("Copy to ./$(filename).assets")?;
            let ming = doc_stem.filter(|s| !s.is_empty()).ok_or_else(|| {
                NotaError::other(
                    "The document has no file name, so `$(filename).assets` cannot be resolved",
                )
            })?;
            Ok(Some(directory_2.join(format!("{ming}.assets"))))
        }
        InsertImageAction::CopyToCustom => {
            let yao = custom_dir.trim();
            if yao.is_empty() {
                return Err(NotaError::other(
                    "No custom image path is configured; set one in image settings or choose another insert action",
                ));
            }
            let p = PathBuf::from(yao);
            if p.is_absolute() {
                Ok(Some(p))
            } else {
                Ok(Some(
                    yao_document_pang_bian("Copy to a custom path")?.join(p),
                ))
            }
        }
    }
}

fn receive_shi_name(xiang_yao: &str) -> String {
    let mo_duan = xiang_yao
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(xiang_yao)
        .trim()
        .trim_start_matches('.');
    let qing_guo: String = mo_duan
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
        .take(NAME_SHANG_XIAN)
        .collect();
    let qing_guo = qing_guo.trim().to_string();
    if qing_guo.is_empty() {
        "image.png".to_string()
    } else {
        qing_guo
    }
}

fn qu_extension_2(name_2: &str) -> Option<String> {
    let duan = name_2.rsplit_once('.')?;
    let wei_2 = duan.1.to_ascii_lowercase();
    if RECOGNIZED_EXTENSIONS.contains(&wei_2.as_str()) {
        Some(wei_2)
    } else {
        None
    }
}

pub(super) fn content_duan_ming(zi_jie: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(zi_jie);
    let d = h.finalize();
    d.iter().take(4).map(|b| format!("{b:02x}")).collect()
}

fn qu_extension(name_2: &str) -> &str {
    match name_2.rsplit_once('.') {
        Some((qian, _)) => qian,
        None => name_2,
    }
}

pub fn ding_ming(
    directory_2: &Path,
    xiang_yao_de_name: &str,
    content_2: Option<&[u8]>,
) -> (PathBuf, bool) {
    let name_2 = receive_shi_name(xiang_yao_de_name);
    let zhu_gan = qu_extension(&name_2).to_string();
    let extension_2 = qu_extension_2(&name_2)
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    for i in 0..1000u32 {
        let candidates_2 = if i == 0 {
            directory_2.join(&name_2)
        } else {
            directory_2.join(format!("{zhu_gan}-{i}{extension_2}"))
        };
        if !candidates_2.exists() {
            return (candidates_2, true);
        }
        if let Some(content_2) = content_2 {
            if std::fs::read(&candidates_2).is_ok_and(|jiu| jiu == content_2) {
                return (candidates_2, false);
            }
        }
    }
    (
        directory_2.join(format!("{zhu_gan}-999{extension_2}")),
        true,
    )
}

pub(super) fn cong_address_cai_name(address_2: &str) -> String {
    let mo_duan = address_2
        .split(['?', '#'])
        .next()
        .unwrap_or(address_2)
        .rsplit('/')
        .next()
        .unwrap_or("");
    let name_2 = receive_shi_name(mo_duan);
    if qu_extension_2(&name_2).is_some() {
        name_2
    } else {
        format!("image-{}.png", content_duan_ming(address_2.as_bytes()))
    }
}
