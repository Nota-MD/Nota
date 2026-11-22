use super::{
    content_kind_line, from_item_should_get_address, multiple_not_check_question_file,
    multiple_not_check_question_table_single, network_image_not_can_use_put, new_edit_boundary,
    parse_request_request_header, segment_2, small_validate, UploadMethod, UploadSettings,
};
use crate::error::{NotaError, Result};

const UPLOAD_UPPER_THREAD: usize = 32 * 1024 * 1024;

const ITEM_SHOULD_UPPER_THREAD: u64 = 1024 * 1024;

const UPLOAD_OVERFLOW_IS: std::time::Duration = std::time::Duration::from_secs(60);

#[derive(Debug, Clone)]
pub enum UploadPayload {
    LocalFile { bytes: Vec<u8>, filename_2: String },

    NetworkAddress { original_address: String },
}

impl UploadPayload {
    pub fn is_network_2(&self) -> bool {
        matches!(self, UploadPayload::NetworkAddress { .. })
    }
}

pub fn upload_once(settings_2: &UploadSettings, content_2: UploadPayload) -> Result<String> {
    let is_network_2 = content_2.is_network_2();
    small_validate(settings_2, is_network_2)?;

    let address_2 = settings_2.url.trim().to_string();
    let method_method = match settings_2.method {
        UploadMethod::Post => "POST",
        UploadMethod::Put => "PUT",
    };

    let lock_has_header = parse_request_request_header(&settings_2.headers)?;

    let use_call_content_kind_line = lock_has_header
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("content-type"))
        .map(|(_, value_2)| value_2.clone());
    let start_it_header: Vec<(String, String)> = lock_has_header
        .into_iter()
        .filter(|(name, _)| !name.eq_ignore_ascii_case("content-type"))
        .collect();

    let (question, content_kind_line_header) = match (settings_2.method, content_2) {
        (UploadMethod::Post, UploadPayload::LocalFile { bytes, filename_2 }) => {
            check_large_small(bytes.len())?;
            let edit_boundary = new_edit_boundary();
            let kind_line = content_kind_line(&filename_2);
            let header = format!("multipart/form-data; boundary={edit_boundary}");
            (
                multiple_not_check_question_file(
                    &edit_boundary,
                    settings_2.field.trim(),
                    &filename_2,
                    kind_line,
                    &bytes,
                ),
                header,
            )
        }
        (UploadMethod::Post, UploadPayload::NetworkAddress { original_address }) => {
            let edit_boundary = new_edit_boundary();
            let character_segment = settings_2.remote_field.trim().to_string();
            let header = format!("multipart/form-data; boundary={edit_boundary}");
            (
                multiple_not_check_question_table_single(
                    &edit_boundary,
                    &[(character_segment, original_address)],
                ),
                header,
            )
        }
        (UploadMethod::Put, UploadPayload::LocalFile { bytes, filename_2 }) => {
            check_large_small(bytes.len())?;

            (
                bytes,
                use_call_content_kind_line
                    .unwrap_or_else(|| content_kind_line(&filename_2).to_string()),
            )
        }

        (UploadMethod::Put, UploadPayload::NetworkAddress { .. }) => {
            return Err(network_image_not_can_use_put())
        }
    };

    let ua = format!("Nota/{}", env!("CARGO_PKG_VERSION"));
    let match_only = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(5)
        .timeout_global(Some(UPLOAD_OVERFLOW_IS))
        .user_agent(ua.clone())
        .build();

    let mut construct_create = ureq::http::Request::builder()
        .method(method_method)
        .uri(&address_2)
        .header("user-agent", ua);
    for (name, value_2) in start_it_header {
        construct_create = construct_create.header(name, value_2);
    }

    construct_create = construct_create.header("content-type", content_kind_line_header);

    let request_data = construct_create.body(question).map_err(|e| {
        NotaError::other(format!(
            "Could not build the upload request ({address_2}): {e}"
        ))
    })?;

    let mut item_should = ureq::Agent::new_with_config(match_only)
        .run(request_data)
        .map_err(|e| NotaError::other(format!("Upload failed ({address_2}): {e}")))?;

    let code = item_should.status().as_u16();
    let read_2 = item_should
        .body_mut()
        .with_config()
        .limit(ITEM_SHOULD_UPPER_THREAD)
        .read_to_string();

    if !(200..300).contains(&code) {
        let return_render = read_2.as_deref().map(segment_2).unwrap_or_default();

        return Err(NotaError::other(format!(
            "Upload failed ({address_2}): server returned {code}{}",
            if return_render.is_empty() {
                String::new()
            } else {
                format!("\u{ff1a}{return_render}")
            }
        )));
    }

    let question = read_2.map_err(|e| {
        NotaError::other(format!(
            "Upload succeeded but the response could not be read ({address_2}): {e} (limit {ITEM_SHOULD_UPPER_THREAD} bytes)"
        ))
    })?;
    from_item_should_get_address(&question, &settings_2.url_path)
}

fn check_large_small(character_boundary_data: usize) -> Result<()> {
    if character_boundary_data > UPLOAD_UPPER_THREAD {
        return Err(NotaError::other(format!(
            "This image is {:.1} MB, above the {:.0} MB upload limit; compress it first",
            character_boundary_data as f64 / 1048576.0,
            UPLOAD_UPPER_THREAD as f64 / 1048576.0
        )));
    }
    Ok(())
}
