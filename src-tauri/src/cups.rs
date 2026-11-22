use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::error::{NotaError, Result};

const IPP_OPERATION_ATTRIBUTES: u8 = 0x01;
const IPP_END: u8 = 0x03;
const IPP_PRINTER_ATTRIBUTES: u8 = 0x04;

const IPP_INTEGER: u8 = 0x21;
const IPP_RANGE: u8 = 0x33;
const IPP_NAME: u8 = 0x42;
const IPP_KEYWORD: u8 = 0x44;
const IPP_URI: u8 = 0x45;
const IPP_CHARSET: u8 = 0x47;
const IPP_NATURAL_LANGUAGE: u8 = 0x48;
const IPP_MIME_TYPE: u8 = 0x49;

const CUPS_GET_DEFAULT: u16 = 0x4001;
const CUPS_GET_PRINTERS: u16 = 0x4002;
const PRINT_JOB: u16 = 0x0002;

const IPP_STATUS_CLIENT_NOT_FOUND: u16 = 0x0406;

#[derive(Debug, Clone)]
pub(crate) struct Printer {
    pub ming: String,
    pub miao_shu: String,
    pub shi_default: bool,
}

#[derive(Debug)]
pub(crate) struct PrinterList {
    pub fu_wu_available: bool,
    pub print_ji: Vec<Printer>,
    pub wen_ti: Option<String>,
}

fn tao_jie_zi_path() -> Option<PathBuf> {
    [
        PathBuf::from("/run/cups/cups.sock"),
        PathBuf::from("/var/run/cups/cups.sock"),
    ]
    .into_iter()
    .find(|path_3| {
        std::fs::metadata(path_3)
            .map(|metadata_2| {
                use std::os::unix::fs::FileTypeExt;
                metadata_2.file_type().is_socket()
            })
            .unwrap_or(false)
    })
}

pub(crate) fn list_printers() -> PrinterList {
    let Some(socket) = tao_jie_zi_path() else {
        return PrinterList {
            fu_wu_available: false,
            print_ji: Vec::new(),
            wen_ti: None,
        };
    };
    match cha_xun_print_ji(&socket) {
        Ok(mut chu) => {
            if let Ok(Some(default_2)) = cha_xun_default(&socket) {
                for p in &mut chu {
                    p.shi_default = p.ming == default_2;
                }
            }
            PrinterList {
                fu_wu_available: true,
                print_ji: chu,
                wen_ti: None,
            }
        }
        Err(e) => PrinterList {
            fu_wu_available: true,
            print_ji: Vec::new(),
            wen_ti: Some(e.to_string()),
        },
    }
}

pub(crate) fn submit(
    pdf: &Path,
    printer: &str,
    copies: u32,
    ranges: Option<&str>,
) -> Result<String> {
    let ming = printer.trim();
    if ming.is_empty() {
        return Err(NotaError::other("No printer was selected"));
    }
    let socket = tao_jie_zi_path().ok_or_else(|| {
        NotaError::other("Could not find the CUPS Unix socket (/run/cups/cups.sock)")
    })?;
    let uri = print_ji_uri(ming);
    let mut qing_qiu = qi_shi_qing_qiu(PRINT_JOB, 2);
    jia_zi_fu_chuan(&mut qing_qiu, IPP_URI, "printer-uri", &uri);
    jia_zi_fu_chuan(
        &mut qing_qiu,
        IPP_NAME,
        "requesting-user-name",
        &std::env::var("USER").unwrap_or_else(|_| "nota".to_string()),
    );
    jia_zi_fu_chuan(
        &mut qing_qiu,
        IPP_NAME,
        "job-name",
        pdf.file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("Nota"),
    );
    jia_zi_fu_chuan(
        &mut qing_qiu,
        IPP_MIME_TYPE,
        "document-format",
        "application/pdf",
    );
    if copies > 1 {
        jia_zheng_shu(&mut qing_qiu, "copies", copies);
    }
    if let Some(fan_wei) = ranges.map(str::trim).filter(|s| !s.is_empty()) {
        let qu_duan = parse_ye_ma_fan_wei(fan_wei)?;
        jia_qu_jian_shu_xing(&mut qing_qiu, "page-ranges", &qu_duan);
    }
    qing_qiu.push(IPP_END);

    let path_3 = uri
        .strip_prefix("ipp://localhost")
        .filter(|p| p.starts_with('/'))
        .unwrap_or("/");
    let xiang_ying = emit_qing_qiu(
        &socket,
        path_3,
        &qing_qiu,
        Some(pdf),
        Duration::from_secs(90),
    )
    .map_err(|e| NotaError::other(format!("CUPS request failed: {e}")))?;
    let document_2 = parse_xiang_ying(&xiang_ying)
        .map_err(|e| NotaError::other(format!("CUPS returned an invalid response: {e}")))?;
    confirm_cheng_gong(document_2.status_2)?;

    if let Some(id) = zhao_di_yi_ge(&document_2.shu_xing, "job-id").and_then(read_zheng_shu) {
        return Ok(format!("{ming}-{id}"));
    }
    if let Some(uri) = zhao_di_yi_ge(&document_2.shu_xing, "job-uri").and_then(read_zi_fu_chuan) {
        return Ok(uri.rsplit('/').next().unwrap_or(&uri).to_string());
    }
    Ok("Submitted".to_string())
}

fn cha_xun_print_ji(socket: &Path) -> Result<Vec<Printer>> {
    let mut qing_qiu = qi_shi_qing_qiu(CUPS_GET_PRINTERS, 1);
    for ming_cheng in [
        "printer-name",
        "printer-info",
        "printer-uri-supported",
        "printer-state",
        "printer-is-accepting-jobs",
    ] {
        jia_zi_fu_chuan(
            &mut qing_qiu,
            IPP_KEYWORD,
            "requested-attributes",
            ming_cheng,
        );
    }
    qing_qiu.push(IPP_END);
    let xiang_ying = emit_qing_qiu(socket, "/", &qing_qiu, None, Duration::from_secs(15))
        .map_err(|e| NotaError::other(format!("Could not connect to CUPS: {e}")))?;
    let document_2 = parse_xiang_ying(&xiang_ying)
        .map_err(|e| NotaError::other(format!("CUPS returned an invalid response: {e}")))?;
    confirm_cheng_gong(document_2.status_2)?;

    let mut chu = Vec::new();
    for zu in an_zu(&document_2.shu_xing, IPP_PRINTER_ATTRIBUTES) {
        let Some(ming) = zu_zi_fu_chuan(&zu, "printer-name") else {
            continue;
        };
        let info = zu_zi_fu_chuan(&zu, "printer-info").unwrap_or_default();
        let state = zu
            .get("printer-state")
            .and_then(|v| v.first())
            .and_then(|v| read_zheng_shu(v));
        let accepting = zu
            .get("printer-is-accepting-jobs")
            .and_then(|v| v.first())
            .and_then(|v| read_bu_er(v));
        let status_2 = match state {
            Some(3) => "idle",
            Some(4) => "processing",
            Some(5) => "stopped",
            _ => "unknown",
        };
        let mut miao_shu = if info.is_empty() {
            status_2.to_string()
        } else {
            format!("{status_2} \u{b7} {info}")
        };
        if accepting == Some(false) {
            miao_shu.push_str(" \u{b7} not accepting jobs");
        }
        chu.push(Printer {
            ming,
            miao_shu,
            shi_default: false,
        });
    }
    Ok(chu)
}

fn cha_xun_default(socket: &Path) -> Result<Option<String>> {
    let mut qing_qiu = qi_shi_qing_qiu(CUPS_GET_DEFAULT, 3);
    for ming_cheng in ["printer-name", "printer-uri-supported"] {
        jia_zi_fu_chuan(
            &mut qing_qiu,
            IPP_KEYWORD,
            "requested-attributes",
            ming_cheng,
        );
    }
    qing_qiu.push(IPP_END);
    let xiang_ying = emit_qing_qiu(socket, "/", &qing_qiu, None, Duration::from_secs(15))
        .map_err(|e| NotaError::other(format!("Could not connect to CUPS: {e}")))?;
    let document_2 = parse_xiang_ying(&xiang_ying)
        .map_err(|e| NotaError::other(format!("CUPS returned an invalid response: {e}")))?;
    if document_2.status_2 == IPP_STATUS_CLIENT_NOT_FOUND {
        return Ok(None);
    }
    confirm_cheng_gong(document_2.status_2)?;
    Ok(an_zu(&document_2.shu_xing, IPP_PRINTER_ATTRIBUTES)
        .first()
        .and_then(|zu| zu_zi_fu_chuan(zu, "printer-name")))
}

fn qi_shi_qing_qiu(operation: u16, request_id: u32) -> Vec<u8> {
    let mut chu = vec![
        1,
        1,
        (operation >> 8) as u8,
        operation as u8,
        (request_id >> 24) as u8,
        (request_id >> 16) as u8,
        (request_id >> 8) as u8,
        request_id as u8,
        IPP_OPERATION_ATTRIBUTES,
    ];
    jia_zi_fu_chuan(&mut chu, IPP_CHARSET, "attributes-charset", "utf-8");
    jia_zi_fu_chuan(
        &mut chu,
        IPP_NATURAL_LANGUAGE,
        "attributes-natural-language",
        "en",
    );
    chu
}

fn jia_zi_fu_chuan(chu: &mut Vec<u8>, tag: u8, name: &str, value: &str) {
    jia_value(chu, tag, name, value.as_bytes());
}

fn jia_zheng_shu(chu: &mut Vec<u8>, name: &str, value: u32) {
    jia_value(chu, IPP_INTEGER, name, &value.to_be_bytes());
}

fn jia_value(chu: &mut Vec<u8>, tag: u8, name: &str, value: &[u8]) {
    let ming = name.as_bytes();
    chu.push(tag);
    chu.extend_from_slice(&(ming.len() as u16).to_be_bytes());
    chu.extend_from_slice(ming);
    chu.extend_from_slice(&(value.len() as u16).to_be_bytes());
    chu.extend_from_slice(value);
}

fn jia_qu_jian_shu_xing(chu: &mut Vec<u8>, name: &str, ranges: &[(u32, u32)]) {
    for (i, (qi, zhi)) in ranges.iter().enumerate() {
        let ming = if i == 0 { name } else { "" };
        let mut value_2 = Vec::with_capacity(8);
        value_2.extend_from_slice(&qi.to_be_bytes());
        value_2.extend_from_slice(&zhi.to_be_bytes());
        jia_value(chu, IPP_RANGE, ming, &value_2);
    }
}

fn parse_ye_ma_fan_wei(text_2: &str) -> Result<Vec<(u32, u32)>> {
    let mut chu = Vec::new();
    for xiang_2 in text_2.split(',') {
        let xiang_2 = xiang_2.trim();
        if xiang_2.is_empty() {
            return Err(NotaError::other("The page range contains an empty item"));
        }
        let (qi, zhi) = match xiang_2.split_once('-') {
            Some((a, b)) => (a.trim().parse::<u32>(), b.trim().parse::<u32>()),
            None => {
                let n = xiang_2.parse::<u32>().map_err(|_| {
                    NotaError::other(format!("Page range item \"{xiang_2}\" is not a number"))
                })?;
                (Ok(n), Ok(n))
            }
        };
        let qi = qi.map_err(|_| {
            NotaError::other(format!(
                "The start of page range \"{xiang_2}\" is not a number"
            ))
        })?;
        let zhi = zhi.map_err(|_| {
            NotaError::other(format!(
                "The end of page range \"{xiang_2}\" is not a number"
            ))
        })?;
        if qi == 0 || zhi < qi {
            return Err(NotaError::other(format!(
                "Invalid page range: \"{xiang_2}\""
            )));
        }
        chu.push((qi, zhi));
    }
    Ok(chu)
}

fn print_ji_uri(ming: &str) -> String {
    format!("ipp://localhost/printers/{}", encoding_path_duan(ming))
}

fn encoding_path_duan(value_2: &str) -> String {
    let mut chu = String::new();
    for b in value_2.as_bytes() {
        let yuan_yang = b.is_ascii_alphanumeric() || matches!(*b, b'-' | b'.' | b'_' | b'~');
        if yuan_yang {
            chu.push(*b as char);
        } else {
            chu.push_str(&format!("%{b:02X}"));
        }
    }
    chu
}

fn emit_qing_qiu(
    socket: &Path,
    path: &str,
    ipp: &[u8],
    document_file: Option<&Path>,
    chao_shi: Duration,
) -> io::Result<Vec<u8>> {
    use std::os::unix::net::UnixStream;

    let mut liu = UnixStream::connect(socket)?;
    liu.set_read_timeout(Some(chao_shi))?;
    liu.set_write_timeout(Some(chao_shi))?;
    let file_zhang = match document_file {
        Some(path_3) => std::fs::metadata(path_3)?.len(),
        None => 0,
    };
    let zong_zhang = ipp.len() as u64 + file_zhang;
    crate::debug_log!(
        "[cups] POST {path}: IPP {} bytes, document {} bytes",
        ipp.len(),
        file_zhang
    );
    write!(
        liu,
        "POST {path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/ipp\r\nAccept: application/ipp\r\nContent-Length: {zong_zhang}\r\nConnection: close\r\n\r\n"
    )?;
    liu.write_all(ipp)?;
    if let Some(path_3) = document_file {
        let mut f = File::open(path_3)?;
        io::copy(&mut f, &mut liu)?;
    }
    liu.flush()?;

    let mut xiang_ying = Vec::new();
    liu.read_to_end(&mut xiang_ying)?;
    crate::debug_log!("[cups] response body: {} bytes", xiang_ying.len());
    http_body(xiang_ying)
}

fn http_body(xiang_ying: Vec<u8>) -> io::Result<Vec<u8>> {
    let fen_ge = xiang_ying
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "The HTTP response is missing the end of its headers",
            )
        })?;
    let tou = std::str::from_utf8(&xiang_ying[..fen_ge]).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidData, "The HTTP headers are not UTF-8")
    })?;
    let status_2 = tou
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    if !(200..300).contains(&status_2) {
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!("CUPS HTTP status {status_2}"),
        ));
    }
    let ti = &xiang_ying[fen_ge + 4..];
    crate::debug_log!(
        "[cups] HTTP header {} bytes, body {} bytes, total {} bytes",
        fen_ge,
        ti.len(),
        xiang_ying.len()
    );
    let kuai_2 = tou.lines().any(|l| {
        l.split_once(':')
            .map(|(k, v)| {
                k.eq_ignore_ascii_case("transfer-encoding")
                    && v.to_ascii_lowercase().contains("chunked")
            })
            .unwrap_or(false)
    });
    if kuai_2 {
        return jie_kuai(ti);
    }
    let zhang_du = tou.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        k.eq_ignore_ascii_case("content-length")
            .then(|| v.trim().parse::<usize>().ok())
            .flatten()
    });
    if let Some(n) = zhang_du {
        if ti.len() < n {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                format!(
                    "Truncated IPP body: expected {n} bytes, received {}",
                    ti.len()
                ),
            ));
        }
        return Ok(ti[..n].to_vec());
    }
    Ok(ti.to_vec())
}

fn jie_kuai(ti: &[u8]) -> io::Result<Vec<u8>> {
    let mut read_2 = 0;
    let mut chu = Vec::new();
    loop {
        let xing_wei = ti[read_2..]
            .windows(2)
            .position(|w| w == b"\r\n")
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "A chunk is missing its line ending",
                )
            })?
            + read_2;
        let zhang_text = std::str::from_utf8(&ti[read_2..xing_wei]).map_err(|_| {
            io::Error::new(io::ErrorKind::InvalidData, "The chunk length is not ASCII")
        })?;
        let zhang_text = zhang_text.split(';').next().unwrap_or("").trim();
        let zhang = usize::from_str_radix(zhang_text, 16).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "The chunk length is not hexadecimal",
            )
        })?;
        read_2 = xing_wei + 2;
        if zhang == 0 {
            return Ok(chu);
        }
        if ti.len() < read_2 + zhang + 2 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "A chunk body is truncated",
            ));
        }
        chu.extend_from_slice(&ti[read_2..read_2 + zhang]);
        read_2 += zhang + 2;
    }
}

#[derive(Debug, Clone)]
struct IppAttribute {
    zu: u8,
    name: String,
    value: Vec<u8>,
}

#[derive(Debug)]
struct IppDocument {
    status_2: u16,
    shu_xing: Vec<IppAttribute>,
}

fn parse_xiang_ying(shu_ju: &[u8]) -> std::result::Result<IppDocument, String> {
    if shu_ju.len() < 8 {
        return Err("The IPP header is shorter than 8 bytes".into());
    }
    let status_2 = u16::from_be_bytes([shu_ju[2], shu_ju[3]]);
    let mut i = 8;
    let mut zu = 0;
    let mut shang_yi_tiao_name = String::new();
    let mut shu_xing = Vec::new();
    while i < shu_ju.len() {
        let tag = shu_ju[i];
        i += 1;
        if tag == IPP_END {
            break;
        }
        if matches!(tag, 0x01..=0x05) {
            zu = tag;
            shang_yi_tiao_name.clear();
            continue;
        }
        let name_2 =
            read_u16(shu_ju, &mut i).ok_or("An attribute name length is missing")? as usize;
        if i + name_2 > shu_ju.len() {
            return Err("An attribute name is out of bounds".into());
        }
        let name = if name_2 == 0 {
            shang_yi_tiao_name.clone()
        } else {
            let s = std::str::from_utf8(&shu_ju[i..i + name_2])
                .map_err(|_| "An attribute name is not UTF-8")?
                .to_string();
            shang_yi_tiao_name = s.clone();
            s
        };
        i += name_2;
        let zhang =
            read_u16(shu_ju, &mut i).ok_or("An attribute value length is missing")? as usize;
        if i + zhang > shu_ju.len() {
            return Err("An attribute value is out of bounds".into());
        }
        shu_xing.push(IppAttribute {
            zu,
            name,
            value: shu_ju[i..i + zhang].to_vec(),
        });
        i += zhang;
    }
    Ok(IppDocument { status_2, shu_xing })
}

fn read_u16(shu_ju: &[u8], i: &mut usize) -> Option<u16> {
    if *i + 2 > shu_ju.len() {
        return None;
    }
    let chu = u16::from_be_bytes([shu_ju[*i], shu_ju[*i + 1]]);
    *i += 2;
    Some(chu)
}

fn an_zu(shu_xing: &[IppAttribute], zu: u8) -> Vec<HashMap<String, Vec<Vec<u8>>>> {
    let mut chu: Vec<HashMap<String, Vec<Vec<u8>>>> = Vec::new();
    for a in shu_xing.iter().filter(|a| a.zu == zu) {
        if a.name == "printer-name" || chu.is_empty() {
            chu.push(HashMap::new());
        }
        if let Some(last) = chu.last_mut() {
            last.entry(a.name.clone())
                .or_default()
                .push(a.value.clone());
        }
    }
    chu
}

fn zu_zi_fu_chuan(zu: &HashMap<String, Vec<Vec<u8>>>, name: &str) -> Option<String> {
    zu.get(name)?.first().and_then(|v| read_zi_fu_chuan(v))
}

fn zhao_di_yi_ge<'a>(shu_xing: &'a [IppAttribute], name: &str) -> Option<&'a [u8]> {
    shu_xing
        .iter()
        .find(|a| a.name == name)
        .map(|a| a.value.as_slice())
}

fn read_zi_fu_chuan(value_2: &[u8]) -> Option<String> {
    std::str::from_utf8(value_2).ok().map(ToString::to_string)
}

fn read_zheng_shu(value_2: &[u8]) -> Option<u32> {
    (value_2.len() == 4)
        .then(|| u32::from_be_bytes([value_2[0], value_2[1], value_2[2], value_2[3]]))
}

fn read_bu_er(value_2: &[u8]) -> Option<bool> {
    (value_2.len() == 1).then(|| value_2[0] != 0)
}

fn confirm_cheng_gong(status_2: u16) -> Result<()> {
    if status_2 <= 0x00ff {
        return Ok(());
    }
    let ming = match status_2 {
        0x0400 => "client-error-bad-request",
        0x0401 => "client-error-forbidden",
        0x0402 => "client-error-not-authenticated",
        0x0403 => "client-error-not-authorized",
        0x0404 => "client-error-not-possible",
        0x0405 => "client-error-timeout",
        0x0406 => "client-error-not-found",
        0x0407 => "client-error-gone",
        0x0408 => "client-error-request-entity-too-large",
        0x0500 => "server-error-internal-error",
        0x0501 => "server-error-operation-not-supported",
        0x0502 => "server-error-service-unavailable",
        _ => "unknown-ipp-error",
    };
    Err(NotaError::other(format!(
        "CUPS rejected the request: {ming} (0x{status_2:04X})"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    const IPP_TEXT: u8 = 0x41;
    const IPP_ENUM: u8 = 0x23;
    const IPP_JOB_ATTRIBUTES: u8 = 0x02;

    #[test]
    fn ye_ma_fan_wei_ren_dan_ye_yu_qu_jian() {
        assert_eq!(parse_ye_ma_fan_wei("1-3, 5").unwrap(), vec![(1, 3), (5, 5)]);
        assert!(parse_ye_ma_fan_wei("0-2").is_err());
        assert!(parse_ye_ma_fan_wei("4-2").is_err());
        assert!(parse_ye_ma_fan_wei("1,,2").is_err());
    }

    #[test]
    fn print_ji_name_jin_uri_hui_encoding() {
        assert_eq!(
            print_ji_uri("\u{529e}\u{516c}\u{5ba4} MFP"),
            "ipp://localhost/printers/%E5%8A%9E%E5%85%AC%E5%AE%A4%20MFP"
        );
    }

    #[test]
    fn xiang_ying_parse_ren_chu_print_ji_zu_yu_status() {
        let mut shu_ju = vec![1, 1, 0, 0, 0, 0, 0, 1, IPP_PRINTER_ATTRIBUTES];
        jia_zi_fu_chuan(&mut shu_ju, IPP_NAME, "printer-name", "L3150");
        jia_zi_fu_chuan(&mut shu_ju, IPP_TEXT, "printer-info", "Epson L3150");
        jia_zi_fu_chuan(
            &mut shu_ju,
            IPP_URI,
            "printer-uri-supported",
            "ipp://localhost/printers/L3150",
        );
        jia_value(&mut shu_ju, IPP_ENUM, "printer-state", &3u32.to_be_bytes());
        shu_ju.push(IPP_END);
        let document_2 = parse_xiang_ying(&shu_ju).unwrap();
        assert_eq!(document_2.status_2, 0);
        let zu = an_zu(&document_2.shu_xing, IPP_PRINTER_ATTRIBUTES);
        assert_eq!(zu.len(), 1);
        assert_eq!(
            zu_zi_fu_chuan(&zu[0], "printer-name").as_deref(),
            Some("L3150")
        );
        assert_eq!(
            zu[0]["printer-state"]
                .first()
                .and_then(|v| read_zheng_shu(v)),
            Some(3)
        );
    }

    #[test]
    fn http_chunked_ye_neng_jie() {
        let yuan_shi = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n".to_vec();
        assert_eq!(http_body(yuan_shi).unwrap(), b"abcde");
    }

    #[test]
    fn que_cups_socket_shi_fan_hui_fu_wu_bu_available() {
        let result_3 = list_printers();
        if !Path::new("/run/cups/cups.sock").exists()
            && !Path::new("/var/run/cups/cups.sock").exists()
        {
            assert!(!result_3.fu_wu_available);
        }
    }

    #[test]
    fn bu_er_yu_zheng_shu_zhi_ren_zheng_que_width() {
        assert_eq!(read_bu_er(&[1]), Some(true));
        assert_eq!(read_bu_er(&[1, 0]), None);
        assert_eq!(read_zheng_shu(&[0, 0, 0, 7]), Some(7));
        assert_eq!(read_zheng_shu(&[7]), None);
    }

    #[test]
    fn ipp_job_shu_xing_zu_li_neng_read_chu_job_id() {
        let mut shu_ju = vec![1, 1, 0, 0, 0, 0, 0, 2, IPP_JOB_ATTRIBUTES];
        jia_zheng_shu(&mut shu_ju, "job-id", 42);
        shu_ju.push(IPP_END);
        let document_2 = parse_xiang_ying(&shu_ju).unwrap();
        assert_eq!(
            zhao_di_yi_ge(&document_2.shu_xing, "job-id").and_then(read_zheng_shu),
            Some(42)
        );
    }
}
