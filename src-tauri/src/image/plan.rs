use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};
use crate::settings::image::InsertImageAction;

use super::address::{encode_markdown_address, prefix_relative_path, relative_path, rule_applies};
use super::target::{
    content_segment_name, define_name, extract_name_from_address, target_directory,
};
use super::{
    ImageSource, InsertionRule, PlacementOperation, PlacementOutcome, PlacementPlan,
    RECOGNIZED_EXTENSIONS,
};

const DOWNLOAD_UPPER_THREAD: u64 = 16 * 1024 * 1024;

const DOWNLOAD_OVERFLOW_IS: std::time::Duration = std::time::Duration::from_secs(30);

pub fn compute_record_render(
    source_2: &ImageSource,
    rule: &InsertionRule,
    document_directory: Option<&Path>,
    document_name: Option<&str>,
) -> Result<PlacementPlan> {
    let network_2 = source_2.is_network_2();
    let is_use = rule_applies(network_2, rule.apply_to_local, rule.apply_to_remote);

    let action_2 = if source_2.must_required_land_parse() && rule.action == InsertImageAction::None
    {
        InsertImageAction::CopyToAssets
    } else if is_use {
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
            ImageSource::NetworkAddress(u) => page_required_convert_one(u, true, rule),
            ImageSource::LocalFile(p) => write_use_call_provided_path(p, document_directory, rule)?,
            ImageSource::Clipboard { .. } => {
                unreachable!("Clipboard images are always written to disk")
            }
        };
        return Ok(PlacementPlan::KeepInPlace { address_2 });
    };

    Ok(match source_2 {
        ImageSource::LocalFile(p) => PlacementPlan::Copy {
            from: p.clone(),
            to: directory_2,
        },
        ImageSource::NetworkAddress(u) => PlacementPlan::Download {
            address_2: u.clone(),
            to: directory_2,
        },
        ImageSource::Clipboard { bytes, extension_2 } => {
            let extension_2 =
                if RECOGNIZED_EXTENSIONS.contains(&extension_2.to_ascii_lowercase().as_str()) {
                    extension_2.to_ascii_lowercase()
                } else {
                    "png".to_string()
                };
            PlacementPlan::WriteToDisk {
                bytes: bytes.clone(),
                to: directory_2,
                name_2: format!("image-{}.{extension_2}", content_segment_name(bytes)),
            }
        }
    })
}

fn write_use_call_provided_path(
    provided: &Path,
    document_directory: Option<&Path>,
    rule: &InsertionRule,
) -> Result<String> {
    let source_text = provided.to_string_lossy().to_string();

    if !provided.is_absolute() {
        return Ok(page_required_convert_one(&source_text, false, rule));
    }
    let item_pair = match (rule.prefer_relative, document_directory) {
        (true, Some(directory_2)) => relative_path(directory_2, provided),
        _ => None,
    };
    Ok(match item_pair {
        Some(r) => {
            let r = if rule.add_dot_slash {
                prefix_relative_path(&r)
            } else {
                r
            };
            page_required_convert_one(&r, false, rule)
        }
        None => page_required_convert_one(&source_text, false, rule),
    })
}

fn page_required_convert_one(s: &str, network_2: bool, rule: &InsertionRule) -> String {
    if rule.escape_url {
        encode_markdown_address(s, network_2)
    } else {
        s.to_string()
    }
}

fn write_land_base_that_one_part(
    file_3: &Path,
    document_directory: Option<&Path>,
    rule: &InsertionRule,
) -> String {
    let item_pair = document_directory.and_then(|d| relative_path(d, file_3));
    let s = match item_pair {
        Some(r) => {
            if rule.add_dot_slash {
                prefix_relative_path(&r)
            } else {
                r
            }
        }

        None => file_3.to_string_lossy().to_string(),
    };
    page_required_convert_one(&s, false, rule)
}

pub fn land_base(
    record_render: &PlacementPlan,
    document_directory: Option<&Path>,
    rule: &InsertionRule,
    get_network: &dyn Fn(&str) -> Result<Vec<u8>>,
) -> Result<PlacementOutcome> {
    match record_render {
        PlacementPlan::KeepInPlace { address_2 } => Ok(PlacementOutcome {
            src: address_2.clone(),
            saved_to: None,
            operation_2: PlacementOperation::KeepInPlace,
        }),
        PlacementPlan::Copy { from, to } => {
            let bytes = std::fs::read(from).map_err(|e| NotaError::Read {
                path: from.clone(),
                source: e,
            })?;
            let name = from
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "image.png".to_string());
            let (path_3, need_write) = write_one_part(to, &name, &bytes)?;
            let src = write_land_base_that_one_part(&path_3, document_directory, rule);
            Ok(PlacementOutcome {
                src,
                saved_to: Some(path_3.to_string_lossy().to_string()),
                operation_2: if need_write {
                    PlacementOperation::Copy
                } else {
                    PlacementOperation::AlreadyExists
                },
            })
        }
        PlacementPlan::Download { address_2, to } => {
            let bytes = get_network(address_2)?;
            let name = extract_name_from_address(address_2);
            let (path_3, need_write) = write_one_part(to, &name, &bytes)?;
            let src = write_land_base_that_one_part(&path_3, document_directory, rule);
            Ok(PlacementOutcome {
                src,
                saved_to: Some(path_3.to_string_lossy().to_string()),
                operation_2: if need_write {
                    PlacementOperation::Download
                } else {
                    PlacementOperation::AlreadyExists
                },
            })
        }
        PlacementPlan::WriteToDisk { bytes, to, name_2 } => {
            let (path_3, need_write) = write_one_part(to, name_2, bytes)?;
            let src = write_land_base_that_one_part(&path_3, document_directory, rule);
            Ok(PlacementOutcome {
                src,
                saved_to: Some(path_3.to_string_lossy().to_string()),
                operation_2: if need_write {
                    PlacementOperation::WriteToDisk
                } else {
                    PlacementOperation::AlreadyExists
                },
            })
        }
    }
}

fn write_one_part(directory_2: &Path, name_2: &str, bytes: &[u8]) -> Result<(PathBuf, bool)> {
    std::fs::create_dir_all(directory_2).map_err(|e| NotaError::Write {
        path: directory_2.to_path_buf(),
        source: e,
    })?;
    let (path_3, need_write) = define_name(directory_2, name_2, Some(bytes));
    if need_write {
        std::fs::write(&path_3, bytes).map_err(|e| NotaError::Write {
            path: path_3.clone(),
            source: e,
        })?;
    }
    Ok((path_3, need_write))
}

fn get_network_character_boundary(address_2: &str) -> Result<Vec<u8>> {
    let match_only = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(5)
        .timeout_global(Some(DOWNLOAD_OVERFLOW_IS))
        .user_agent(format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .build();
    let request_data = ureq::http::Request::builder()
        .method("GET")
        .uri(address_2)
        .header("user-agent", format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .body(Vec::new())
        .map_err(|e| NotaError::other(format!("Could not build the request: {e}")))?;

    let mut resp = ureq::Agent::new_with_config(match_only)
        .run(request_data)
        .map_err(|e| NotaError::other(format!("Download failed ({address_2}): {e}")))?;

    let code = resp.status().as_u16();
    if !(200..300).contains(&code) {
        return Err(NotaError::other(format!(
            "Download failed ({address_2}): server returned {code}"
        )));
    }
    let bytes = resp
        .body_mut()
        .with_config()
        .limit(DOWNLOAD_UPPER_THREAD)
        .read_to_vec()
        .map_err(|e| {
            NotaError::other(format!(
                "Download failed ({address_2}) while reading the response (limit {DOWNLOAD_UPPER_THREAD} bytes): {e}"
            ))
        })?;
    Ok(bytes)
}

pub fn place(
    source_2: &ImageSource,
    rule: &InsertionRule,
    document_directory: Option<&Path>,
    document_name: Option<&str>,
) -> Result<PlacementOutcome> {
    let record_render = compute_record_render(source_2, rule, document_directory, document_name)?;
    land_base(
        &record_render,
        document_directory,
        rule,
        &get_network_character_boundary,
    )
}
