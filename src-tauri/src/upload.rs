use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};
use crate::paths;

mod net;

#[cfg(test)]
mod tests;

pub use net::{upload_once, UploadPayload};

pub const AUTO_UPLOAD_KEY: &str = "nota-auto-upload";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UploadMethod {
    Post,

    Put,
}

impl Default for UploadMethod {
    fn default() -> Self {
        UploadMethod::Post
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct UploadSettings {
    pub enabled: bool,

    pub auto: bool,

    pub url: String,

    pub method: UploadMethod,

    pub field: String,

    pub headers: String,

    pub url_path: String,

    pub remote_field: String,
}

impl Default for UploadSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            auto: false,
            url: String::new(),
            method: UploadMethod::Post,
            field: "file".to_string(),
            headers: String::new(),
            url_path: "data.url".to_string(),
            remote_field: String::new(),
        }
    }
}

impl UploadSettings {
    pub fn available_2(&self) -> bool {
        self.enabled && crate::image::is_network_address(&self.url)
    }
}

const FILE_TOU: &str = "\
# Nota image upload service settings.
# Edit this file directly; changes take effect after saving.
# Request headers may contain plaintext tokens or secrets. Keep this file private.
# File permissions are restricted to 0600.
# See the upload settings page for field descriptions.
";

pub fn read_2() -> UploadSettings {
    match paths::image_upload_file() {
        Ok(path_3) => read_file_2(&path_3),

        Err(e) => {
            crate::debug_log!("[nota] upload settings path unavailable; using empty settings: {e}");
            UploadSettings::default()
        }
    }
}

pub fn read_file_2(path_3: &std::path::Path) -> UploadSettings {
    let Ok(text) = std::fs::read_to_string(path_3) else {
        return UploadSettings::default();
    };
    match toml::from_str::<UploadSettings>(&text) {
        Ok(s) => s,
        Err(e) => {
            crate::debug_log!(
                "[nota] upload settings unreadable; using unconfigured state: {}: {e}",
                path_3.display()
            );
            UploadSettings::default()
        }
    }
}

pub fn write_2(settings_2: &UploadSettings) -> Result<()> {
    write_file_2(&paths::image_upload_file()?, settings_2)
}

pub fn write_file_2(path_3: &std::path::Path, settings_2: &UploadSettings) -> Result<()> {
    if let Some(dir) = path_3.parent() {
        paths::ensure_dir(dir)?;
        receive_jin_directory_quan_xian(dir);
    }

    let body = toml::to_string(settings_2)
        .map_err(|e| NotaError::other(format!("Could not serialize upload settings: {e}")))?;
    let text = format!("{FILE_TOU}{body}");

    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;

        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path_3)
            .map_err(|source| NotaError::Write {
                path: path_3.to_path_buf(),
                source,
            })?;
        f.write_all(text.as_bytes())
            .map_err(|source| NotaError::Write {
                path: path_3.to_path_buf(),
                source,
            })?;
        return Ok(());
    }

    #[cfg(not(unix))]
    std::fs::write(path_3, text).map_err(|source| NotaError::Write {
        path: path_3.to_path_buf(),
        source,
    })
}

#[cfg(unix)]
fn receive_jin_directory_quan_xian(dir: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
fn receive_jin_directory_quan_xian(_dir: &std::path::Path) {}

const ZI_DAI_TOU: [&str; 3] = ["content-length", "host", "transfer-encoding"];

pub fn xiao_yan(s: &UploadSettings, is_network_tu: bool) -> Result<()> {
    if !s.enabled {
        return Err(NotaError::other(
            "The upload service is disabled in image settings",
        ));
    }
    if s.url.trim().is_empty() {
        return Err(NotaError::other(
            "The upload service URL is missing in image settings",
        ));
    }
    if !crate::image::is_network_address(&s.url) {
        return Err(NotaError::other(format!(
            "Upload service URL \"{}\" is not an HTTP or HTTPS URL",
            s.url.trim()
        )));
    }
    if s.method == UploadMethod::Post && s.field.trim().is_empty() {
        return Err(NotaError::other(
            "POST uploads require a file field name in the upload service settings",
        ));
    }
    if is_network_tu {
        if s.method == UploadMethod::Put {
            return Err(network_tu_bu_neng_yong_put());
        }
        if s.remote_field.trim().is_empty() {
            return Err(NotaError::other(
                "Network images are not uploaded because the remote image field is empty",
            ));
        }
    }
    for (ming, value_2) in parse_qing_qiu_tou(&s.headers)? {
        if ZI_DAI_TOU.contains(&ming.to_ascii_lowercase().as_str()) {
            return Err(NotaError::other(format!(
                "The request header \"{ming}\" is generated by Nota and must not be set manually"
            )));
        }
        if !shi_he_fa_tou_ming(&ming) {
            return Err(NotaError::other(format!(
                "Invalid request header name \"{ming}\"; use ASCII letters, digits, `-`, and `_`"
            )));
        }

        if !value_2.is_ascii() {
            return Err(NotaError::other(format!(
                "Request header \"{ming}\" contains non-ASCII characters; HTTP header values must be ASCII"
            )));
        }
        if value_2.chars().any(|c| c.is_control()) {
            return Err(NotaError::other(format!(
                "Request header \"{ming}\" contains control characters"
            )));
        }
    }
    Ok(())
}

fn shi_he_fa_tou_ming(ming: &str) -> bool {
    !ming.is_empty()
        && ming.bytes().all(|b| {
            b.is_ascii_alphanumeric()
                || matches!(
                    b,
                    b'!' | b'#'
                        | b'$'
                        | b'%'
                        | b'&'
                        | b'\''
                        | b'*'
                        | b'+'
                        | b'-'
                        | b'.'
                        | b'^'
                        | b'_'
                        | b'`'
                        | b'|'
                        | b'~'
                )
        })
}

pub fn network_tu_bu_neng_yong_put() -> NotaError {
    NotaError::other(
        "Network images cannot use PUT upload; switch to POST or leave the remote image field empty",
    )
}

fn zhang_du_xing_ma(ming: &str, value_2: &str, shang_xian: usize) -> Result<()> {
    if value_2.chars().count() > shang_xian {
        return Err(NotaError::other(format!(
            "\"{ming}\" is {} characters, above the {shang_xian} character limit",
            value_2.chars().count()
        )));
    }
    Ok(())
}

pub fn shape_is_valid(s: &UploadSettings) -> Result<()> {
    zhang_du_xing_ma("Service URL", &s.url, 2048)?;
    zhang_du_xing_ma("Request headers", &s.headers, 32 * 1024)?;
    zhang_du_xing_ma("File field", &s.field, 200)?;
    zhang_du_xing_ma("Response path", &s.url_path, 500)?;
    zhang_du_xing_ma("Remote image field", &s.remote_field, 200)
}

pub fn parse_qing_qiu_tou(text_2: &str) -> Result<Vec<(String, String)>> {
    let mut out = Vec::new();
    for (i, xing) in text_2.lines().enumerate() {
        let xing = xing.trim();
        if xing.is_empty() || xing.starts_with('#') {
            continue;
        }
        let Some(mao_hao) = xing.find(':') else {
            return Err(NotaError::other(format!(
                "Request header line {} is not in `name: value` form: {xing}",
                i + 1
            )));
        };
        let ming = xing[..mao_hao].trim();
        let value_2 = xing[mao_hao + 1..].trim();
        if ming.is_empty() {
            return Err(NotaError::other(format!(
                "Request header line {} has no name: {xing}",
                i + 1
            )));
        }
        if value_2.is_empty() {
            return Err(NotaError::other(format!(
                "Request header line {} has an empty value: {xing}",
                i + 1
            )));
        }
        out.push((ming.to_string(), value_2.to_string()));
    }
    Ok(out)
}

pub fn content_lei_xing(ming: &str) -> &'static str {
    let extension_2 = ming
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    match extension_2.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

pub fn xin_bian_jie() -> String {
    let na_miao = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("----NotaBoundary{:x}{:x}", std::process::id(), na_miao)
}

fn bu_jian_tou(out: &mut Vec<u8>, bian_jie: &str, chu_zhi: &str, content_lei_xing: Option<&str>) {
    out.extend_from_slice(format!("--{bian_jie}\r\n").as_bytes());
    out.extend_from_slice(format!("Content-Disposition: {chu_zhi}\r\n").as_bytes());
    if let Some(t) = content_lei_xing {
        out.extend_from_slice(format!("Content-Type: {t}\r\n").as_bytes());
    }
    out.extend_from_slice(b"\r\n");
}

pub fn duo_bu_jian_ti_file(
    bian_jie: &str,
    zi_duan_ming: &str,
    filename_2: &str,
    content_lei_xing: &str,
    zi_jie: &[u8],
) -> Vec<u8> {
    let mut out = Vec::with_capacity(zi_jie.len() + 512);
    bu_jian_tou(
        &mut out,
        bian_jie,
        &format!(
            "form-data; name=\"{}\"; {}",
            zhuan_yi_yin_hao(zi_duan_ming),
            chu_zhi_filename(filename_2)
        ),
        Some(content_lei_xing),
    );
    out.extend_from_slice(zi_jie);
    out.extend_from_slice(format!("\r\n--{bian_jie}--\r\n").as_bytes());
    out
}

pub fn duo_bu_jian_ti_table_dan(bian_jie: &str, zi_duan_men: &[(String, String)]) -> Vec<u8> {
    let mut out = Vec::with_capacity(512);
    for (ming, value_2) in zi_duan_men {
        bu_jian_tou(
            &mut out,
            bian_jie,
            &format!("form-data; name=\"{}\"", zhuan_yi_yin_hao(ming)),
            None,
        );
        out.extend_from_slice(value_2.as_bytes());
        out.extend_from_slice(b"\r\n");
    }
    out.extend_from_slice(format!("--{bian_jie}--\r\n").as_bytes());
    out
}

fn zhuan_yi_yin_hao(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '"' | '\\' | '\r' | '\n' => '_',
            _ => c,
        })
        .collect()
}

fn chu_zhi_filename(ming: &str) -> String {
    let gan_jing = zhuan_yi_yin_hao(ming);
    if ming.is_ascii() {
        format!("filename=\"{gan_jing}\"")
    } else {
        format!(
            "filename=\"{gan_jing}\"; filename*=UTF-8''{}",
            bai_fen_hao_encoding(&gan_jing)
        )
    }
}

fn bai_fen_hao_encoding(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.as_bytes() {
        let bao_liu = b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'!' | b'#' | b'$' | b'&' | b'+' | b'-' | b'.' | b'^' | b'_' | b'`' | b'|' | b'~'
            );
        if bao_liu {
            out.push(*b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub fn dian_path_qu_value(root: &serde_json::Value, path_3: &str) -> Option<String> {
    let mut current_2 = root;
    for duan in path_3.split('.') {
        if duan.is_empty() {
            return None;
        }
        current_2 = match current_2 {
            serde_json::Value::Object(table_2) => table_2.get(duan)?,
            serde_json::Value::Array(lie) => lie.get(duan.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    match current_2 {
        serde_json::Value::String(s) => Some(s.clone()),

        serde_json::Value::Null => None,

        other => Some(other.to_string()),
    }
}

pub fn cong_xiang_ying_qu_address(ti: &str, url_path: &str) -> Result<String> {
    let ti = ti.trim();
    let path_3 = url_path.trim();
    let value_2 = if path_3.is_empty() {
        match serde_json::from_str::<serde_json::Value>(ti) {
            Ok(serde_json::Value::String(s)) => s,
            _ => ti.to_string(),
        }
    } else {
        let json: serde_json::Value = serde_json::from_str(ti).map_err(|e| {
            NotaError::other(format!(
                "The upload server did not return JSON, but the response path is \"{path_3}\": {e}. Response: {}",
                duan_2(ti)
            ))
        })?;
        match dian_path_qu_value(&json, path_3) {
            Some(v) => v,
            None => {
                return Err(NotaError::other(format!(
                    "The upload response JSON does not contain path \"{path_3}\". Response: {}",
                    duan_2(ti)
                )))
            }
        }
    };
    let value_2 = value_2.trim();
    if !crate::image::is_network_address(value_2) {
        return Err(NotaError::other(format!(
            "The response path did not produce an HTTP or HTTPS URL: {}",
            duan_2(value_2)
        )));
    }
    Ok(value_2.to_string())
}

fn duan_2(s: &str) -> String {
    const SHANG_XIAN: usize = 200;
    let yi_xing: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if yi_xing.chars().count() <= SHANG_XIAN {
        return yi_xing;
    }
    let mut out: String = yi_xing.chars().take(SHANG_XIAN).collect();
    out.push('\u{2026}');
    out
}

pub fn prerequisite_enabled_2(body_2: &str) -> bool {
    let mut xing_men = body_2.lines();
    if xing_men.next().map(str::trim_end) != Some("---") {
        return false;
    }
    for xing in xing_men {
        let xing = xing.trim_end();
        if xing == "---" || xing == "..." {
            return false;
        }

        let Some(value_2) = xing.trim().strip_prefix(AUTO_UPLOAD_KEY) else {
            continue;
        };
        let Some(value_2) = value_2.strip_prefix(':') else {
            continue;
        };
        let value_2 = value_2.trim().trim_matches(|c| c == '"' || c == '\'');
        return matches!(value_2.to_ascii_lowercase().as_str(), "true" | "yes" | "on");
    }
    false
}
