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

const FILE_HEADER: &str = "\
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
        receive_enter_directory_full_thread(dir);
    }

    let body = toml::to_string(settings_2)
        .map_err(|e| NotaError::other(format!("Could not serialize upload settings: {e}")))?;
    let text = format!("{FILE_HEADER}{body}");

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
fn receive_enter_directory_full_thread(dir: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
fn receive_enter_directory_full_thread(_dir: &std::path::Path) {}

const CHARACTER_PENDING_HEADER: [&str; 3] = ["content-length", "host", "transfer-encoding"];

pub fn small_validate(s: &UploadSettings, is_network_image: bool) -> Result<()> {
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
    if is_network_image {
        if s.method == UploadMethod::Put {
            return Err(network_image_not_can_use_put());
        }
        if s.remote_field.trim().is_empty() {
            return Err(NotaError::other(
                "Network images are not uploaded because the remote image field is empty",
            ));
        }
    }
    for (name, value_2) in parse_request_request_header(&s.headers)? {
        if CHARACTER_PENDING_HEADER.contains(&name.to_ascii_lowercase().as_str()) {
            return Err(NotaError::other(format!(
                "The request header \"{name}\" is generated by Nota and must not be set manually"
            )));
        }
        if !is_and_method_header_name(&name) {
            return Err(NotaError::other(format!(
                "Invalid request header name \"{name}\"; use ASCII letters, digits, `-`, and `_`"
            )));
        }

        if !value_2.is_ascii() {
            return Err(NotaError::other(format!(
                "Request header \"{name}\" contains non-ASCII characters; HTTP header values must be ASCII"
            )));
        }
        if value_2.chars().any(|c| c.is_control()) {
            return Err(NotaError::other(format!(
                "Request header \"{name}\" contains control characters"
            )));
        }
    }
    Ok(())
}

fn is_and_method_header_name(name: &str) -> bool {
    !name.is_empty()
        && name.bytes().all(|b| {
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

pub fn network_image_not_can_use_put() -> NotaError {
    NotaError::other(
        "Network images cannot use PUT upload; switch to POST or leave the remote image field empty",
    )
}

fn length_read_line(name: &str, value_2: &str, upper_thread: usize) -> Result<()> {
    if value_2.chars().count() > upper_thread {
        return Err(NotaError::other(format!(
            "\"{name}\" is {} characters, above the {upper_thread} character limit",
            value_2.chars().count()
        )));
    }
    Ok(())
}

pub fn shape_is_valid(s: &UploadSettings) -> Result<()> {
    length_read_line("Service URL", &s.url, 2048)?;
    length_read_line("Request headers", &s.headers, 32 * 1024)?;
    length_read_line("File field", &s.field, 200)?;
    length_read_line("Response path", &s.url_path, 500)?;
    length_read_line("Remote image field", &s.remote_field, 200)
}

pub fn parse_request_request_header(text_2: &str) -> Result<Vec<(String, String)>> {
    let mut out = Vec::new();
    for (i, line) in text_2.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some(anchor_number) = line.find(':') else {
            return Err(NotaError::other(format!(
                "Request header line {} is not in `name: value` form: {line}",
                i + 1
            )));
        };
        let name = line[..anchor_number].trim();
        let value_2 = line[anchor_number + 1..].trim();
        if name.is_empty() {
            return Err(NotaError::other(format!(
                "Request header line {} has no name: {line}",
                i + 1
            )));
        }
        if value_2.is_empty() {
            return Err(NotaError::other(format!(
                "Request header line {} has an empty value: {line}",
                i + 1
            )));
        }
        out.push((name.to_string(), value_2.to_string()));
    }
    Ok(out)
}

pub fn content_kind_line(name: &str) -> &'static str {
    let extension_2 = name
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

pub fn new_edit_boundary() -> String {
    let that_description = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!(
        "----NotaBoundary{:x}{:x}",
        std::process::id(),
        that_description
    )
}

fn not_check_header(
    out: &mut Vec<u8>,
    edit_boundary: &str,
    out_only: &str,
    content_kind_line: Option<&str>,
) {
    out.extend_from_slice(format!("--{edit_boundary}\r\n").as_bytes());
    out.extend_from_slice(format!("Content-Disposition: {out_only}\r\n").as_bytes());
    if let Some(t) = content_kind_line {
        out.extend_from_slice(format!("Content-Type: {t}\r\n").as_bytes());
    }
    out.extend_from_slice(b"\r\n");
}

pub fn multiple_not_check_question_file(
    edit_boundary: &str,
    character_segment_name: &str,
    filename_2: &str,
    content_kind_line: &str,
    bytes: &[u8],
) -> Vec<u8> {
    let mut out = Vec::with_capacity(bytes.len() + 512);
    not_check_header(
        &mut out,
        edit_boundary,
        &format!(
            "form-data; name=\"{}\"; {}",
            escape_quotes(character_segment_name),
            content_disposition_filename(filename_2)
        ),
        Some(content_kind_line),
    );
    out.extend_from_slice(bytes);
    out.extend_from_slice(format!("\r\n--{edit_boundary}--\r\n").as_bytes());
    out
}

pub fn multiple_not_check_question_table_single(
    edit_boundary: &str,
    character_segment_list: &[(String, String)],
) -> Vec<u8> {
    let mut out = Vec::with_capacity(512);
    for (name, value_2) in character_segment_list {
        not_check_header(
            &mut out,
            edit_boundary,
            &format!("form-data; name=\"{}\"", escape_quotes(name)),
            None,
        );
        out.extend_from_slice(value_2.as_bytes());
        out.extend_from_slice(b"\r\n");
    }
    out.extend_from_slice(format!("--{edit_boundary}--\r\n").as_bytes());
    out
}

fn escape_quotes(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '"' | '\\' | '\r' | '\n' => '_',
            _ => c,
        })
        .collect()
}

fn content_disposition_filename(name: &str) -> String {
    let escaped = escape_quotes(name);
    if name.is_ascii() {
        format!("filename=\"{escaped}\"")
    } else {
        format!(
            "filename=\"{escaped}\"; filename*=UTF-8''{}",
            percent_part_number_encoding(&escaped)
        )
    }
}

fn percent_part_number_encoding(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.as_bytes() {
        let package_stream = b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'!' | b'#' | b'$' | b'&' | b'+' | b'-' | b'.' | b'^' | b'_' | b'`' | b'|' | b'~'
            );
        if package_stream {
            out.push(*b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub fn point_path_get_value(root: &serde_json::Value, path_3: &str) -> Option<String> {
    let mut current_2 = root;
    for segment in path_3.split('.') {
        if segment.is_empty() {
            return None;
        }
        current_2 = match current_2 {
            serde_json::Value::Object(table_2) => table_2.get(segment)?,
            serde_json::Value::Array(list) => list.get(segment.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    match current_2 {
        serde_json::Value::String(s) => Some(s.clone()),

        serde_json::Value::Null => None,

        other => Some(other.to_string()),
    }
}

pub fn from_item_should_get_address(question: &str, url_path: &str) -> Result<String> {
    let question = question.trim();
    let path_3 = url_path.trim();
    let value_2 = if path_3.is_empty() {
        match serde_json::from_str::<serde_json::Value>(question) {
            Ok(serde_json::Value::String(s)) => s,
            _ => question.to_string(),
        }
    } else {
        let json: serde_json::Value = serde_json::from_str(question).map_err(|e| {
            NotaError::other(format!(
                "The upload server did not return JSON, but the response path is \"{path_3}\": {e}. Response: {}",
                segment_2(question)
            ))
        })?;
        match point_path_get_value(&json, path_3) {
            Some(v) => v,
            None => {
                return Err(NotaError::other(format!(
                    "The upload response JSON does not contain path \"{path_3}\". Response: {}",
                    segment_2(question)
                )))
            }
        }
    };
    let value_2 = value_2.trim();
    if !crate::image::is_network_address(value_2) {
        return Err(NotaError::other(format!(
            "The response path did not produce an HTTP or HTTPS URL: {}",
            segment_2(value_2)
        )));
    }
    Ok(value_2.to_string())
}

fn segment_2(s: &str) -> String {
    const UPPER_THREAD: usize = 200;
    let one_line: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() <= UPPER_THREAD {
        return one_line;
    }
    let mut out: String = one_line.chars().take(UPPER_THREAD).collect();
    out.push('\u{2026}');
    out
}

pub fn prerequisite_enabled_2(body_2: &str) -> bool {
    let mut line_list = body_2.lines();
    if line_list.next().map(str::trim_end) != Some("---") {
        return false;
    }
    for line in line_list {
        let line = line.trim_end();
        if line == "---" || line == "..." {
            return false;
        }

        let Some(value_2) = line.trim().strip_prefix(AUTO_UPLOAD_KEY) else {
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
