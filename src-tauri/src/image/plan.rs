use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};
use crate::settings::image::InsertImageAction;

use super::address::{jia_dian_dian_xie_gang, rule_shi_yong, xiang_dui_path, zhuan_yi_address};
use super::target::{cong_address_cai_name, content_duan_ming, ding_ming, target_directory};
use super::{
    ImageSource, InsertionRule, PlacementOperation, PlacementOutcome, PlacementPlan,
    RECOGNIZED_EXTENSIONS,
};

const DOWNLOAD_SHANG_XIAN: u64 = 16 * 1024 * 1024;

const DOWNLOAD_CHAO_SHI: std::time::Duration = std::time::Duration::from_secs(30);

pub fn suan_ji_hua(
    source_2: &ImageSource,
    rule: &InsertionRule,
    document_directory: Option<&Path>,
    document_name: Option<&str>,
) -> Result<PlacementPlan> {
    let network_2 = source_2.is_network_2();
    let shi_yong = rule_shi_yong(network_2, rule.apply_to_local, rule.apply_to_remote);

    let action_2 = if source_2.bi_xu_luo_pan() && rule.action == InsertImageAction::None {
        InsertImageAction::CopyToAssets
    } else if shi_yong {
        rule.action
    } else {
        InsertImageAction::None
    };

    let target_2 = target_directory(
        action_2,
        document_directory,
        document_name,
        &rule.custom_dir,
    )?;

    let Some(directory_2) = target_2 else {
        let address_2 = match source_2 {
            ImageSource::NetworkAddress(u) => ye_xu_zhuan_yi(u, true, rule),
            ImageSource::LocalFile(p) => write_yong_hu_provided_path(p, document_directory, rule)?,
            ImageSource::Clipboard { .. } => {
                unreachable!("Clipboard images are always written to disk")
            }
        };
        return Ok(PlacementPlan::KeepInPlace { address_2 });
    };

    Ok(match source_2 {
        ImageSource::LocalFile(p) => PlacementPlan::Copy {
            cong: p.clone(),
            dao: directory_2,
        },
        ImageSource::NetworkAddress(u) => PlacementPlan::Download {
            address_2: u.clone(),
            dao: directory_2,
        },
        ImageSource::Clipboard {
            zi_jie,
            extension_2,
        } => {
            let extension_2 =
                if RECOGNIZED_EXTENSIONS.contains(&extension_2.to_ascii_lowercase().as_str()) {
                    extension_2.to_ascii_lowercase()
                } else {
                    "png".to_string()
                };
            PlacementPlan::WriteToDisk {
                zi_jie: zi_jie.clone(),
                dao: directory_2,
                name_2: format!("image-{}.{extension_2}", content_duan_ming(zi_jie)),
            }
        }
    })
}

fn write_yong_hu_provided_path(
    provided: &Path,
    document_directory: Option<&Path>,
    rule: &InsertionRule,
) -> Result<String> {
    let yuan_wen = provided.to_string_lossy().to_string();

    if !provided.is_absolute() {
        return Ok(ye_xu_zhuan_yi(&yuan_wen, false, rule));
    }
    let xiang_dui = match (rule.prefer_relative, document_directory) {
        (true, Some(directory_2)) => xiang_dui_path(directory_2, provided),
        _ => None,
    };
    Ok(match xiang_dui {
        Some(r) => {
            let r = if rule.add_dot_slash {
                jia_dian_dian_xie_gang(&r)
            } else {
                r
            };
            ye_xu_zhuan_yi(&r, false, rule)
        }
        None => ye_xu_zhuan_yi(&yuan_wen, false, rule),
    })
}

fn ye_xu_zhuan_yi(s: &str, network_2: bool, rule: &InsertionRule) -> String {
    if rule.escape_url {
        zhuan_yi_address(s, network_2)
    } else {
        s.to_string()
    }
}

fn write_luo_di_de_na_yi_fen(
    file_3: &Path,
    document_directory: Option<&Path>,
    rule: &InsertionRule,
) -> String {
    let xiang_dui = document_directory.and_then(|d| xiang_dui_path(d, file_3));
    let s = match xiang_dui {
        Some(r) => {
            if rule.add_dot_slash {
                jia_dian_dian_xie_gang(&r)
            } else {
                r
            }
        }

        None => file_3.to_string_lossy().to_string(),
    };
    ye_xu_zhuan_yi(&s, false, rule)
}

pub fn luo_di(
    ji_hua: &PlacementPlan,
    document_directory: Option<&Path>,
    rule: &InsertionRule,
    qu_network: &dyn Fn(&str) -> Result<Vec<u8>>,
) -> Result<PlacementOutcome> {
    match ji_hua {
        PlacementPlan::KeepInPlace { address_2 } => Ok(PlacementOutcome {
            src: address_2.clone(),
            saved_to: None,
            operation_2: PlacementOperation::KeepInPlace,
        }),
        PlacementPlan::Copy { cong, dao } => {
            let zi_jie = std::fs::read(cong).map_err(|e| NotaError::Read {
                path: cong.clone(),
                source: e,
            })?;
            let ming = cong
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "image.png".to_string());
            let (path_3, yao_write) = write_yi_fen(dao, &ming, &zi_jie)?;
            let src = write_luo_di_de_na_yi_fen(&path_3, document_directory, rule);
            Ok(PlacementOutcome {
                src,
                saved_to: Some(path_3.to_string_lossy().to_string()),
                operation_2: if yao_write {
                    PlacementOperation::Copy
                } else {
                    PlacementOperation::AlreadyExists
                },
            })
        }
        PlacementPlan::Download { address_2, dao } => {
            let zi_jie = qu_network(address_2)?;
            let ming = cong_address_cai_name(address_2);
            let (path_3, yao_write) = write_yi_fen(dao, &ming, &zi_jie)?;
            let src = write_luo_di_de_na_yi_fen(&path_3, document_directory, rule);
            Ok(PlacementOutcome {
                src,
                saved_to: Some(path_3.to_string_lossy().to_string()),
                operation_2: if yao_write {
                    PlacementOperation::Download
                } else {
                    PlacementOperation::AlreadyExists
                },
            })
        }
        PlacementPlan::WriteToDisk {
            zi_jie,
            dao,
            name_2,
        } => {
            let (path_3, yao_write) = write_yi_fen(dao, name_2, zi_jie)?;
            let src = write_luo_di_de_na_yi_fen(&path_3, document_directory, rule);
            Ok(PlacementOutcome {
                src,
                saved_to: Some(path_3.to_string_lossy().to_string()),
                operation_2: if yao_write {
                    PlacementOperation::WriteToDisk
                } else {
                    PlacementOperation::AlreadyExists
                },
            })
        }
    }
}

fn write_yi_fen(directory_2: &Path, name_2: &str, zi_jie: &[u8]) -> Result<(PathBuf, bool)> {
    std::fs::create_dir_all(directory_2).map_err(|e| NotaError::Write {
        path: directory_2.to_path_buf(),
        source: e,
    })?;
    let (path_3, yao_write) = ding_ming(directory_2, name_2, Some(zi_jie));
    if yao_write {
        std::fs::write(&path_3, zi_jie).map_err(|e| NotaError::Write {
            path: path_3.clone(),
            source: e,
        })?;
    }
    Ok((path_3, yao_write))
}

fn qu_network_zi_jie(address_2: &str) -> Result<Vec<u8>> {
    let pei_zhi = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(5)
        .timeout_global(Some(DOWNLOAD_CHAO_SHI))
        .user_agent(format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .build();
    let qing_qiu = ureq::http::Request::builder()
        .method("GET")
        .uri(address_2)
        .header("user-agent", format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .body(Vec::new())
        .map_err(|e| NotaError::other(format!("Could not build the request: {e}")))?;

    let mut resp = ureq::Agent::new_with_config(pei_zhi)
        .run(qing_qiu)
        .map_err(|e| NotaError::other(format!("Download failed ({address_2}): {e}")))?;

    let code = resp.status().as_u16();
    if !(200..300).contains(&code) {
        return Err(NotaError::other(format!(
            "Download failed ({address_2}): server returned {code}"
        )));
    }
    let zi_jie = resp
        .body_mut()
        .with_config()
        .limit(DOWNLOAD_SHANG_XIAN)
        .read_to_vec()
        .map_err(|e| {
            NotaError::other(format!(
                "Download failed ({address_2}) while reading the response (limit {DOWNLOAD_SHANG_XIAN} bytes): {e}"
            ))
        })?;
    Ok(zi_jie)
}

pub fn place(
    source_2: &ImageSource,
    rule: &InsertionRule,
    document_directory: Option<&Path>,
    document_name: Option<&str>,
) -> Result<PlacementOutcome> {
    let ji_hua = suan_ji_hua(source_2, rule, document_directory, document_name)?;
    luo_di(&ji_hua, document_directory, rule, &qu_network_zi_jie)
}
