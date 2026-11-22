use super::{
    cong_xiang_ying_qu_address, content_lei_xing, duan_2, duo_bu_jian_ti_file,
    duo_bu_jian_ti_table_dan, network_tu_bu_neng_yong_put, parse_qing_qiu_tou, xiao_yan,
    xin_bian_jie, UploadMethod, UploadSettings,
};
use crate::error::{NotaError, Result};

const UPLOAD_SHANG_XIAN: usize = 32 * 1024 * 1024;

const XIANG_YING_SHANG_XIAN: u64 = 1024 * 1024;

const UPLOAD_CHAO_SHI: std::time::Duration = std::time::Duration::from_secs(60);

#[derive(Debug, Clone)]
pub enum UploadPayload {
    LocalFile { zi_jie: Vec<u8>, filename_2: String },

    NetworkAddress { original_address: String },
}

impl UploadPayload {
    pub fn is_network_2(&self) -> bool {
        matches!(self, UploadPayload::NetworkAddress { .. })
    }
}

pub fn upload_once(settings_2: &UploadSettings, content_2: UploadPayload) -> Result<String> {
    let is_network_2 = content_2.is_network_2();
    xiao_yan(settings_2, is_network_2)?;

    let address_2 = settings_2.url.trim().to_string();
    let fang_fa = match settings_2.method {
        UploadMethod::Post => "POST",
        UploadMethod::Put => "PUT",
    };

    let suo_you_tou = parse_qing_qiu_tou(&settings_2.headers)?;

    let yong_hu_content_lei_xing = suo_you_tou
        .iter()
        .find(|(ming, _)| ming.eq_ignore_ascii_case("content-type"))
        .map(|(_, value_2)| value_2.clone());
    let qi_ta_tou: Vec<(String, String)> = suo_you_tou
        .into_iter()
        .filter(|(ming, _)| !ming.eq_ignore_ascii_case("content-type"))
        .collect();

    let (ti, content_lei_xing_tou) = match (settings_2.method, content_2) {
        (UploadMethod::Post, UploadPayload::LocalFile { zi_jie, filename_2 }) => {
            check_da_xiao(zi_jie.len())?;
            let bian_jie = xin_bian_jie();
            let lei_xing = content_lei_xing(&filename_2);
            let tou = format!("multipart/form-data; boundary={bian_jie}");
            (
                duo_bu_jian_ti_file(
                    &bian_jie,
                    settings_2.field.trim(),
                    &filename_2,
                    lei_xing,
                    &zi_jie,
                ),
                tou,
            )
        }
        (UploadMethod::Post, UploadPayload::NetworkAddress { original_address }) => {
            let bian_jie = xin_bian_jie();
            let zi_duan = settings_2.remote_field.trim().to_string();
            let tou = format!("multipart/form-data; boundary={bian_jie}");
            (
                duo_bu_jian_ti_table_dan(&bian_jie, &[(zi_duan, original_address)]),
                tou,
            )
        }
        (UploadMethod::Put, UploadPayload::LocalFile { zi_jie, filename_2 }) => {
            check_da_xiao(zi_jie.len())?;

            (
                zi_jie,
                yong_hu_content_lei_xing
                    .unwrap_or_else(|| content_lei_xing(&filename_2).to_string()),
            )
        }

        (UploadMethod::Put, UploadPayload::NetworkAddress { .. }) => {
            return Err(network_tu_bu_neng_yong_put())
        }
    };

    let ua = format!("Nota/{}", env!("CARGO_PKG_VERSION"));
    let pei_zhi = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(5)
        .timeout_global(Some(UPLOAD_CHAO_SHI))
        .user_agent(ua.clone())
        .build();

    let mut gou_zao = ureq::http::Request::builder()
        .method(fang_fa)
        .uri(&address_2)
        .header("user-agent", ua);
    for (ming, value_2) in qi_ta_tou {
        gou_zao = gou_zao.header(ming, value_2);
    }

    gou_zao = gou_zao.header("content-type", content_lei_xing_tou);

    let qing_qiu = gou_zao.body(ti).map_err(|e| {
        NotaError::other(format!(
            "Could not build the upload request ({address_2}): {e}"
        ))
    })?;

    let mut xiang_ying = ureq::Agent::new_with_config(pei_zhi)
        .run(qing_qiu)
        .map_err(|e| NotaError::other(format!("Upload failed ({address_2}): {e}")))?;

    let code = xiang_ying.status().as_u16();
    let read_2 = xiang_ying
        .body_mut()
        .with_config()
        .limit(XIANG_YING_SHANG_XIAN)
        .read_to_string();

    if !(200..300).contains(&code) {
        let hui_hua = read_2.as_deref().map(duan_2).unwrap_or_default();

        return Err(NotaError::other(format!(
            "Upload failed ({address_2}): server returned {code}{}",
            if hui_hua.is_empty() {
                String::new()
            } else {
                format!("\u{ff1a}{hui_hua}")
            }
        )));
    }

    let ti = read_2.map_err(|e| {
        NotaError::other(format!(
            "Upload succeeded but the response could not be read ({address_2}): {e} (limit {XIANG_YING_SHANG_XIAN} bytes)"
        ))
    })?;
    cong_xiang_ying_qu_address(&ti, &settings_2.url_path)
}

fn check_da_xiao(zi_jie_shu: usize) -> Result<()> {
    if zi_jie_shu > UPLOAD_SHANG_XIAN {
        return Err(NotaError::other(format!(
            "This image is {:.1} MB, above the {:.0} MB upload limit; compress it first",
            zi_jie_shu as f64 / 1048576.0,
            UPLOAD_SHANG_XIAN as f64 / 1048576.0
        )));
    }
    Ok(())
}
