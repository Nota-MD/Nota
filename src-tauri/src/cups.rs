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
    pub name: String,
    pub description_data: String,
    pub is_default: bool,
}

#[derive(Debug)]
pub(crate) struct PrinterList {
    pub service_none_available: bool,
    pub print_record: Vec<Printer>,
    pub text_question: Option<String>,
}

fn escape_boundary_character_path() -> Option<PathBuf> {
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
    let Some(socket) = escape_boundary_character_path() else {
        return PrinterList {
            service_none_available: false,
            print_record: Vec::new(),
            text_question: None,
        };
    };
    match check_search_print_record(&socket) {
        Ok(mut out) => {
            if let Ok(Some(default_2)) = check_search_default(&socket) {
                for p in &mut out {
                    p.is_default = p.name == default_2;
                }
            }
            PrinterList {
                service_none_available: true,
                print_record: out,
                text_question: None,
            }
        }
        Err(e) => PrinterList {
            service_none_available: true,
            print_record: Vec::new(),
            text_question: Some(e.to_string()),
        },
    }
}

pub(crate) fn submit(
    pdf: &Path,
    printer: &str,
    copies: u32,
    ranges: Option<&str>,
) -> Result<String> {
    let name = printer.trim();
    if name.is_empty() {
        return Err(NotaError::other("No printer was selected"));
    }
    let socket = escape_boundary_character_path().ok_or_else(|| {
        NotaError::other("Could not find the CUPS Unix socket (/run/cups/cups.sock)")
    })?;
    let uri = print_record_uri(name);
    let mut request_data = start_is_request_request(PRINT_JOB, 2);
    add_character_service_stream(&mut request_data, IPP_URI, "printer-uri", &uri);
    add_character_service_stream(
        &mut request_data,
        IPP_NAME,
        "requesting-user-name",
        &std::env::var("USER").unwrap_or_else(|_| "nota".to_string()),
    );
    add_character_service_stream(
        &mut request_data,
        IPP_NAME,
        "job-name",
        pdf.file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("Nota"),
    );
    add_character_service_stream(
        &mut request_data,
        IPP_MIME_TYPE,
        "document-format",
        "application/pdf",
    );
    if copies > 1 {
        add_validate_data(&mut request_data, "copies", copies);
    }
    if let Some(reverse_position) = ranges.map(str::trim).filter(|s| !s.is_empty()) {
        let get_segment = parse_page_reverse_position(reverse_position)?;
        add_get_check_data_line(&mut request_data, "page-ranges", &get_segment);
    }
    request_data.push(IPP_END);

    let path_3 = uri
        .strip_prefix("ipp://localhost")
        .filter(|p| p.starts_with('/'))
        .unwrap_or("/");
    let item_should = emit_request_request(
        &socket,
        path_3,
        &request_data,
        Some(pdf),
        Duration::from_secs(90),
    )
    .map_err(|e| NotaError::other(format!("CUPS request failed: {e}")))?;
    let document_2 = parse_item_should(&item_should)
        .map_err(|e| NotaError::other(format!("CUPS returned an invalid response: {e}")))?;
    confirm_success_work(document_2.status_2)?;

    if let Some(id) = find_base_one(&document_2.data_line, "job-id").and_then(read_validate_data) {
        return Ok(format!("{name}-{id}"));
    }
    if let Some(uri) =
        find_base_one(&document_2.data_line, "job-uri").and_then(read_character_service_stream)
    {
        return Ok(uri.rsplit('/').next().unwrap_or(&uri).to_string());
    }
    Ok("Submitted".to_string())
}

fn check_search_print_record(socket: &Path) -> Result<Vec<Printer>> {
    let mut request_data = start_is_request_request(CUPS_GET_PRINTERS, 1);
    for display_name in [
        "printer-name",
        "printer-info",
        "printer-uri-supported",
        "printer-state",
        "printer-is-accepting-jobs",
    ] {
        add_character_service_stream(
            &mut request_data,
            IPP_KEYWORD,
            "requested-attributes",
            display_name,
        );
    }
    request_data.push(IPP_END);
    let item_should =
        emit_request_request(socket, "/", &request_data, None, Duration::from_secs(15))
            .map_err(|e| NotaError::other(format!("Could not connect to CUPS: {e}")))?;
    let document_2 = parse_item_should(&item_should)
        .map_err(|e| NotaError::other(format!("CUPS returned an invalid response: {e}")))?;
    confirm_success_work(document_2.status_2)?;

    let mut out = Vec::new();
    for group in by_group(&document_2.data_line, IPP_PRINTER_ATTRIBUTES) {
        let Some(name) = group_character_service_stream(&group, "printer-name") else {
            continue;
        };
        let info = group_character_service_stream(&group, "printer-info").unwrap_or_default();
        let state = group
            .get("printer-state")
            .and_then(|v| v.first())
            .and_then(|v| read_validate_data(v));
        let accepting = group
            .get("printer-is-accepting-jobs")
            .and_then(|v| v.first())
            .and_then(|v| read_not_two(v));
        let status_2 = match state {
            Some(3) => "idle",
            Some(4) => "processing",
            Some(5) => "stopped",
            _ => "unknown",
        };
        let mut description_data = if info.is_empty() {
            status_2.to_string()
        } else {
            format!("{status_2} \u{b7} {info}")
        };
        if accepting == Some(false) {
            description_data.push_str(" \u{b7} not accepting jobs");
        }
        out.push(Printer {
            name,
            description_data,
            is_default: false,
        });
    }
    Ok(out)
}

fn check_search_default(socket: &Path) -> Result<Option<String>> {
    let mut request_data = start_is_request_request(CUPS_GET_DEFAULT, 3);
    for display_name in ["printer-name", "printer-uri-supported"] {
        add_character_service_stream(
            &mut request_data,
            IPP_KEYWORD,
            "requested-attributes",
            display_name,
        );
    }
    request_data.push(IPP_END);
    let item_should =
        emit_request_request(socket, "/", &request_data, None, Duration::from_secs(15))
            .map_err(|e| NotaError::other(format!("Could not connect to CUPS: {e}")))?;
    let document_2 = parse_item_should(&item_should)
        .map_err(|e| NotaError::other(format!("CUPS returned an invalid response: {e}")))?;
    if document_2.status_2 == IPP_STATUS_CLIENT_NOT_FOUND {
        return Ok(None);
    }
    confirm_success_work(document_2.status_2)?;
    Ok(by_group(&document_2.data_line, IPP_PRINTER_ATTRIBUTES)
        .first()
        .and_then(|group| group_character_service_stream(group, "printer-name")))
}

fn start_is_request_request(operation: u16, request_id: u32) -> Vec<u8> {
    let mut out = vec![
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
    add_character_service_stream(&mut out, IPP_CHARSET, "attributes-charset", "utf-8");
    add_character_service_stream(
        &mut out,
        IPP_NATURAL_LANGUAGE,
        "attributes-natural-language",
        "en",
    );
    out
}

fn add_character_service_stream(out: &mut Vec<u8>, tag: u8, name: &str, value: &str) {
    add_value(out, tag, name, value.as_bytes());
}

fn add_validate_data(out: &mut Vec<u8>, name: &str, value: u32) {
    add_value(out, IPP_INTEGER, name, &value.to_be_bytes());
}

fn add_value(out: &mut Vec<u8>, tag: u8, name: &str, value: &[u8]) {
    let name = name.as_bytes();
    out.push(tag);
    out.extend_from_slice(&(name.len() as u16).to_be_bytes());
    out.extend_from_slice(name);
    out.extend_from_slice(&(value.len() as u16).to_be_bytes());
    out.extend_from_slice(value);
}

fn add_get_check_data_line(out: &mut Vec<u8>, name: &str, ranges: &[(u32, u32)]) {
    for (i, (start, only)) in ranges.iter().enumerate() {
        let name = if i == 0 { name } else { "" };
        let mut value_2 = Vec::with_capacity(8);
        value_2.extend_from_slice(&start.to_be_bytes());
        value_2.extend_from_slice(&only.to_be_bytes());
        add_value(out, IPP_RANGE, name, &value_2);
    }
}

fn parse_page_reverse_position(text_2: &str) -> Result<Vec<(u32, u32)>> {
    let mut out = Vec::new();
    for range_item in text_2.split(',') {
        let range_item = range_item.trim();
        if range_item.is_empty() {
            return Err(NotaError::other("The page range contains an empty item"));
        }
        let (start, only) = match range_item.split_once('-') {
            Some((a, b)) => (a.trim().parse::<u32>(), b.trim().parse::<u32>()),
            None => {
                let n = range_item.parse::<u32>().map_err(|_| {
                    NotaError::other(format!("Page range item \"{range_item}\" is not a number"))
                })?;
                (Ok(n), Ok(n))
            }
        };
        let start = start.map_err(|_| {
            NotaError::other(format!(
                "The start of page range \"{range_item}\" is not a number"
            ))
        })?;
        let only = only.map_err(|_| {
            NotaError::other(format!(
                "The end of page range \"{range_item}\" is not a number"
            ))
        })?;
        if start == 0 || only < start {
            return Err(NotaError::other(format!(
                "Invalid page range: \"{range_item}\""
            )));
        }
        out.push((start, only));
    }
    Ok(out)
}

fn print_record_uri(name: &str) -> String {
    format!("ipp://localhost/printers/{}", encoding_path_segment(name))
}

fn encoding_path_segment(value_2: &str) -> String {
    let mut out = String::new();
    for b in value_2.as_bytes() {
        let source_sample = b.is_ascii_alphanumeric() || matches!(*b, b'-' | b'.' | b'_' | b'~');
        if source_sample {
            out.push(*b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn emit_request_request(
    socket: &Path,
    path: &str,
    ipp: &[u8],
    document_file: Option<&Path>,
    overflow_is: Duration,
) -> io::Result<Vec<u8>> {
    use std::os::unix::net::UnixStream;

    let mut stream = UnixStream::connect(socket)?;
    stream.set_read_timeout(Some(overflow_is))?;
    stream.set_write_timeout(Some(overflow_is))?;
    let file_length = match document_file {
        Some(path_3) => std::fs::metadata(path_3)?.len(),
        None => 0,
    };
    let total_length = ipp.len() as u64 + file_length;
    crate::debug_log!(
        "[cups] POST {path}: IPP {} bytes, document {} bytes",
        ipp.len(),
        file_length
    );
    write!(
        stream,
        "POST {path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/ipp\r\nAccept: application/ipp\r\nContent-Length: {total_length}\r\nConnection: close\r\n\r\n"
    )?;
    stream.write_all(ipp)?;
    if let Some(path_3) = document_file {
        let mut f = File::open(path_3)?;
        io::copy(&mut f, &mut stream)?;
    }
    stream.flush()?;

    let mut item_should = Vec::new();
    stream.read_to_end(&mut item_should)?;
    crate::debug_log!("[cups] response body: {} bytes", item_should.len());
    http_body(item_should)
}

fn http_body(item_should: Vec<u8>) -> io::Result<Vec<u8>> {
    let part = item_should
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "The HTTP response is missing the end of its headers",
            )
        })?;
    let header = std::str::from_utf8(&item_should[..part]).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidData, "The HTTP headers are not UTF-8")
    })?;
    let status_2 = header
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
    let question = &item_should[part + 4..];
    crate::debug_log!(
        "[cups] HTTP header {} bytes, body {} bytes, total {} bytes",
        part,
        question.len(),
        item_should.len()
    );
    let value_2 = header.lines().any(|l| {
        l.split_once(':')
            .map(|(k, v)| {
                k.eq_ignore_ascii_case("transfer-encoding")
                    && v.to_ascii_lowercase().contains("chunked")
            })
            .unwrap_or(false)
    });
    if value_2 {
        return boundary_block(question);
    }
    let length_read = header.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        k.eq_ignore_ascii_case("content-length")
            .then(|| v.trim().parse::<usize>().ok())
            .flatten()
    });
    if let Some(n) = length_read {
        if question.len() < n {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                format!(
                    "Truncated IPP body: expected {n} bytes, received {}",
                    question.len()
                ),
            ));
        }
        return Ok(question[..n].to_vec());
    }
    Ok(question.to_vec())
}

fn boundary_block(question: &[u8]) -> io::Result<Vec<u8>> {
    let mut read_2 = 0;
    let mut out = Vec::new();
    loop {
        let line_position = question[read_2..]
            .windows(2)
            .position(|w| w == b"\r\n")
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "A chunk is missing its line ending",
                )
            })?
            + read_2;
        let length_text = std::str::from_utf8(&question[read_2..line_position]).map_err(|_| {
            io::Error::new(io::ErrorKind::InvalidData, "The chunk length is not ASCII")
        })?;
        let length_text = length_text.split(';').next().unwrap_or("").trim();
        let length = usize::from_str_radix(length_text, 16).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "The chunk length is not hexadecimal",
            )
        })?;
        read_2 = line_position + 2;
        if length == 0 {
            return Ok(out);
        }
        if question.len() < read_2 + length + 2 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "A chunk body is truncated",
            ));
        }
        out.extend_from_slice(&question[read_2..read_2 + length]);
        read_2 += length + 2;
    }
}

#[derive(Debug, Clone)]
struct IppAttribute {
    group: u8,
    name: String,
    value: Vec<u8>,
}

#[derive(Debug)]
struct IppDocument {
    status_2: u16,
    data_line: Vec<IppAttribute>,
}

fn parse_item_should(data_value: &[u8]) -> std::result::Result<IppDocument, String> {
    if data_value.len() < 8 {
        return Err("The IPP header is shorter than 8 bytes".into());
    }
    let status_2 = u16::from_be_bytes([data_value[2], data_value[3]]);
    let mut i = 8;
    let mut group = 0;
    let mut upper_one_item_name = String::new();
    let mut data_line = Vec::new();
    while i < data_value.len() {
        let tag = data_value[i];
        i += 1;
        if tag == IPP_END {
            break;
        }
        if matches!(tag, 0x01..=0x05) {
            group = tag;
            upper_one_item_name.clear();
            continue;
        }
        let name_2 =
            read_u16(data_value, &mut i).ok_or("An attribute name length is missing")? as usize;
        if i + name_2 > data_value.len() {
            return Err("An attribute name is out of bounds".into());
        }
        let name = if name_2 == 0 {
            upper_one_item_name.clone()
        } else {
            let s = std::str::from_utf8(&data_value[i..i + name_2])
                .map_err(|_| "An attribute name is not UTF-8")?
                .to_string();
            upper_one_item_name = s.clone();
            s
        };
        i += name_2;
        let length =
            read_u16(data_value, &mut i).ok_or("An attribute value length is missing")? as usize;
        if i + length > data_value.len() {
            return Err("An attribute value is out of bounds".into());
        }
        data_line.push(IppAttribute {
            group,
            name,
            value: data_value[i..i + length].to_vec(),
        });
        i += length;
    }
    Ok(IppDocument {
        status_2,
        data_line,
    })
}

fn read_u16(data_value: &[u8], i: &mut usize) -> Option<u16> {
    if *i + 2 > data_value.len() {
        return None;
    }
    let out = u16::from_be_bytes([data_value[*i], data_value[*i + 1]]);
    *i += 2;
    Some(out)
}

fn by_group(data_line: &[IppAttribute], group: u8) -> Vec<HashMap<String, Vec<Vec<u8>>>> {
    let mut out: Vec<HashMap<String, Vec<Vec<u8>>>> = Vec::new();
    for a in data_line.iter().filter(|a| a.group == group) {
        if a.name == "printer-name" || out.is_empty() {
            out.push(HashMap::new());
        }
        if let Some(last) = out.last_mut() {
            last.entry(a.name.clone())
                .or_default()
                .push(a.value.clone());
        }
    }
    out
}

fn group_character_service_stream(
    group: &HashMap<String, Vec<Vec<u8>>>,
    name: &str,
) -> Option<String> {
    group
        .get(name)?
        .first()
        .and_then(|v| read_character_service_stream(v))
}

fn find_base_one<'a>(data_line: &'a [IppAttribute], name: &str) -> Option<&'a [u8]> {
    data_line
        .iter()
        .find(|a| a.name == name)
        .map(|a| a.value.as_slice())
}

fn read_character_service_stream(value_2: &[u8]) -> Option<String> {
    std::str::from_utf8(value_2).ok().map(ToString::to_string)
}

fn read_validate_data(value_2: &[u8]) -> Option<u32> {
    (value_2.len() == 4)
        .then(|| u32::from_be_bytes([value_2[0], value_2[1], value_2[2], value_2[3]]))
}

fn read_not_two(value_2: &[u8]) -> Option<bool> {
    (value_2.len() == 1).then(|| value_2[0] != 0)
}

fn confirm_success_work(status_2: u16) -> Result<()> {
    if status_2 <= 0x00ff {
        return Ok(());
    }
    let name = match status_2 {
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
        "CUPS rejected the request: {name} (0x{status_2:04X})"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    const IPP_TEXT: u8 = 0x41;
    const IPP_ENUM: u8 = 0x23;
    const IPP_JOB_ATTRIBUTES: u8 = 0x02;

    #[test]
    fn page_reverse_position_person_single_page_and_get_check() {
        assert_eq!(
            parse_page_reverse_position("1-3, 5").unwrap(),
            vec![(1, 3), (5, 5)]
        );
        assert!(parse_page_reverse_position("0-2").is_err());
        assert!(parse_page_reverse_position("4-2").is_err());
        assert!(parse_page_reverse_position("1,,2").is_err());
    }

    #[test]
    fn print_record_name_enter_uri_return_encoding() {
        assert_eq!(
            print_record_uri("\u{529e}\u{516c}\u{5ba4} MFP"),
            "ipp://localhost/printers/%E5%8A%9E%E5%85%AC%E5%AE%A4%20MFP"
        );
    }

    #[test]
    fn item_should_parse_person_out_print_record_group_and_status() {
        let mut data_value = vec![1, 1, 0, 0, 0, 0, 0, 1, IPP_PRINTER_ATTRIBUTES];
        add_character_service_stream(&mut data_value, IPP_NAME, "printer-name", "L3150");
        add_character_service_stream(&mut data_value, IPP_TEXT, "printer-info", "Epson L3150");
        add_character_service_stream(
            &mut data_value,
            IPP_URI,
            "printer-uri-supported",
            "ipp://localhost/printers/L3150",
        );
        add_value(
            &mut data_value,
            IPP_ENUM,
            "printer-state",
            &3u32.to_be_bytes(),
        );
        data_value.push(IPP_END);
        let document_2 = parse_item_should(&data_value).unwrap();
        assert_eq!(document_2.status_2, 0);
        let group = by_group(&document_2.data_line, IPP_PRINTER_ATTRIBUTES);
        assert_eq!(group.len(), 1);
        assert_eq!(
            group_character_service_stream(&group[0], "printer-name").as_deref(),
            Some("L3150")
        );
        assert_eq!(
            group[0]["printer-state"]
                .first()
                .and_then(|v| read_validate_data(v)),
            Some(3)
        );
    }

    #[test]
    fn http_chunked_page_can_boundary() {
        let source_is = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n".to_vec();
        assert_eq!(http_body(source_is).unwrap(), b"abcde");
    }

    #[test]
    fn missing_cups_socket_is_reverse_return_service_none_not_available() {
        let result_3 = list_printers();
        if !Path::new("/run/cups/cups.sock").exists()
            && !Path::new("/var/run/cups/cups.sock").exists()
        {
            assert!(!result_3.service_none_available);
        }
    }

    #[test]
    fn not_two_and_validate_data_only_person_validate_missing_width() {
        assert_eq!(read_not_two(&[1]), Some(true));
        assert_eq!(read_not_two(&[1, 0]), None);
        assert_eq!(read_validate_data(&[0, 0, 0, 7]), Some(7));
        assert_eq!(read_validate_data(&[7]), None);
    }

    #[test]
    fn ipp_job_data_line_group_inner_can_read_out_job_id() {
        let mut data_value = vec![1, 1, 0, 0, 0, 0, 0, 2, IPP_JOB_ATTRIBUTES];
        add_validate_data(&mut data_value, "job-id", 42);
        data_value.push(IPP_END);
        let document_2 = parse_item_should(&data_value).unwrap();
        assert_eq!(
            find_base_one(&document_2.data_line, "job-id").and_then(read_validate_data),
            Some(42)
        );
    }
}
