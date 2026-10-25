//! **最小 CUPS/IPP 客户端**：直接连本机 CUPS 的 Unix socket。
//!
//! 2026-10-17 用户拍板：「直接连接 CUPS 的 Unix socket 简单一些。」
//! 此前打印框借 `lpstat` 列打印机、借 `lp` 投递；两者属于 `cups-client`，
//! Flatpak、精简发行版和开发容器里经常没有，症状是系统设置明明列着打印机，
//! Nota 却说客户端缺失。这里只实现应用真正需要的三条 IPP 操作：
//!
//! | 功能 | IPP operation |
//! |---|---|
//! | 列打印机 | `CUPS-Get-Printers` (`0x4002`) |
//! | 找默认打印机 | `CUPS-Get-Default` (`0x4001`) |
//! | 投递 PDF | `Print-Job` (`0x0002`) |
//!
//! CUPS 在 Unix socket 上说的仍是 HTTP ＋ IPP：先发一个
//! `POST /`（`Content-Type: application/ipp`），请求体前 8 字节是 IPP 头，
//! 后面是属性组；打印任务则把 PDF 直接接在属性组后面。
//!
//! ⚠️ 这里**不实现完整 IPP**：只支持标量属性和 `rangeOfInteger`，不碰
//! collection、订阅、通知、远程 TLS。NOTA 要的是本机打印，保持这条边界才能
//! 让它可审、可测；CUPS 以后若要求新属性，应当在请求构造处显式加，不要塞一个
//! “通用协议引擎”进来。

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

/// CUPS 返回的一台打印机。URI 不往 JS 侧走：前端只认名字，投递时由本模块
/// 从名字重新生成同一条路径，避免两个消费者各保存一份可能漂掉的 URI。
#[derive(Debug, Clone)]
pub(crate) struct 打印机 {
    pub 名: String,
    pub 描述: String,
    pub 是默认: bool,
}

/// 列表查询的三态结果。
#[derive(Debug)]
pub(crate) struct 列表 {
    pub 服务可用: bool,
    pub 打印机: Vec<打印机>,
    pub 问题: Option<String>,
}

/// 连本机 CUPS。路径按标准顺序找，`/var/run` 在多数发行版上只是 `/run` 的
/// 兼容软链；两边都试是为了兼容老系统。
fn 套接字路径() -> Option<PathBuf> {
    [
        PathBuf::from("/run/cups/cups.sock"),
        PathBuf::from("/var/run/cups/cups.sock"),
    ]
    .into_iter()
    .find(|路径| {
        std::fs::metadata(路径)
            .map(|元| {
                use std::os::unix::fs::FileTypeExt;
                元.file_type().is_socket()
            })
            .unwrap_or(false)
    })
}

/// 列打印机。**只连 socket**，不执行任何外部客户端。
pub(crate) fn 列打印机() -> 列表 {
    let Some(socket) = 套接字路径() else {
        return 列表 {
            服务可用: false,
            打印机: Vec::new(),
            问题: None,
        };
    };
    match 查询打印机(&socket) {
        Ok(mut 出) => {
            // 没有默认打印机不是错误：CUPS 常返回 client-error-not-found。
            if let Ok(Some(默认)) = 查询默认(&socket) {
                for p in &mut 出 {
                    p.是默认 = p.名 == 默认;
                }
            }
            列表 {
                服务可用: true,
                打印机: 出,
                问题: None,
            }
        }
        Err(e) => 列表 {
            服务可用: true,
            打印机: Vec::new(),
            问题: Some(e.to_string()),
        },
    }
}

/// 投递 PDF。成功返回给用户看的任务标识（有 `job-id` 时是
/// `打印机名-id`，否则用 job URI）。
pub(crate) fn 投递(
    pdf: &Path,
    printer: &str,
    copies: u32,
    ranges: Option<&str>,
) -> Result<String> {
    let 名 = printer.trim();
    if 名.is_empty() {
        return Err(NotaError::other("没有选打印机"));
    }
    let socket = 套接字路径()
        .ok_or_else(|| NotaError::other("没有找到 CUPS 的 Unix socket（/run/cups/cups.sock）"))?;
    let uri = 打印机uri(名);
    let mut 请求 = 起始请求(PRINT_JOB, 2);
    加字符串(&mut 请求, IPP_URI, "printer-uri", &uri);
    加字符串(
        &mut 请求,
        IPP_NAME,
        "requesting-user-name",
        &std::env::var("USER").unwrap_or_else(|_| "nota".to_string()),
    );
    加字符串(
        &mut 请求,
        IPP_NAME,
        "job-name",
        pdf.file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("Nota"),
    );
    加字符串(
        &mut 请求,
        IPP_MIME_TYPE,
        "document-format",
        "application/pdf",
    );
    if copies > 1 {
        加整数(&mut 请求, "copies", copies);
    }
    if let Some(范围) = ranges.map(str::trim).filter(|s| !s.is_empty()) {
        let 区段 = 解析页码范围(范围)?;
        加区间属性(&mut 请求, "page-ranges", &区段);
    }
    请求.push(IPP_END);

    let 路径 = uri
        .strip_prefix("ipp://localhost")
        .filter(|p| p.starts_with('/'))
        .unwrap_or("/");
    let 响应 = 发请求(&socket, 路径, &请求, Some(pdf), Duration::from_secs(90))
        .map_err(|e| NotaError::other(format!("CUPS 请求失败：{e}")))?;
    let 文档 = 解析响应(&响应)
        .map_err(|e| NotaError::other(format!("CUPS 返回了坏响应：{e}")))?;
    确认成功(文档.状态)?;

    if let Some(id) = 找第一个(&文档.属性, "job-id").and_then(读整数) {
        return Ok(format!("{名}-{id}"));
    }
    if let Some(uri) = 找第一个(&文档.属性, "job-uri").and_then(读字符串) {
        return Ok(uri.rsplit('/').next().unwrap_or(&uri).to_string());
    }
    Ok("已提交".to_string())
}

fn 查询打印机(socket: &Path) -> Result<Vec<打印机>> {
    let mut 请求 = 起始请求(CUPS_GET_PRINTERS, 1);
    for 名称 in [
        "printer-name",
        "printer-info",
        "printer-uri-supported",
        "printer-state",
        "printer-is-accepting-jobs",
    ] {
        加字符串(&mut 请求, IPP_KEYWORD, "requested-attributes", 名称);
    }
    请求.push(IPP_END);
    let 响应 = 发请求(socket, "/", &请求, None, Duration::from_secs(15))
        .map_err(|e| NotaError::other(format!("连接 CUPS 失败：{e}")))?;
    let 文档 = 解析响应(&响应)
        .map_err(|e| NotaError::other(format!("CUPS 返回了坏响应：{e}")))?;
    确认成功(文档.状态)?;

    let mut 出 = Vec::new();
    for 组 in 按组(&文档.属性, IPP_PRINTER_ATTRIBUTES) {
        let Some(名) = 组字符串(&组, "printer-name") else {
            continue;
        };
        let info = 组字符串(&组, "printer-info").unwrap_or_default();
        let state = 组
            .get("printer-state")
            .and_then(|v| v.first())
            .and_then(|v| 读整数(v));
        let accepting = 组
            .get("printer-is-accepting-jobs")
            .and_then(|v| v.first())
            .and_then(|v| 读布尔(v));
        let 状态 = match state {
            Some(3) => "idle",
            Some(4) => "processing",
            Some(5) => "stopped",
            _ => "unknown",
        };
        let mut 描述 = if info.is_empty() {
            状态.to_string()
        } else {
            format!("{状态} · {info}")
        };
        if accepting == Some(false) {
            描述.push_str(" · not accepting jobs");
        }
        出.push(打印机 {
            名,
            描述,
            是默认: false,
        });
    }
    Ok(出)
}

fn 查询默认(socket: &Path) -> Result<Option<String>> {
    let mut 请求 = 起始请求(CUPS_GET_DEFAULT, 3);
    for 名称 in ["printer-name", "printer-uri-supported"] {
        加字符串(&mut 请求, IPP_KEYWORD, "requested-attributes", 名称);
    }
    请求.push(IPP_END);
    let 响应 = 发请求(socket, "/", &请求, None, Duration::from_secs(15))
        .map_err(|e| NotaError::other(format!("连接 CUPS 失败：{e}")))?;
    let 文档 = 解析响应(&响应)
        .map_err(|e| NotaError::other(format!("CUPS 返回了坏响应：{e}")))?;
    if 文档.状态 == IPP_STATUS_CLIENT_NOT_FOUND {
        return Ok(None);
    }
    确认成功(文档.状态)?;
    Ok(按组(&文档.属性, IPP_PRINTER_ATTRIBUTES)
        .first()
        .and_then(|组| 组字符串(组, "printer-name")))
}

fn 起始请求(operation: u16, request_id: u32) -> Vec<u8> {
    let mut 出 = vec![
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
    加字符串(&mut 出, IPP_CHARSET, "attributes-charset", "utf-8");
    加字符串(
        &mut 出,
        IPP_NATURAL_LANGUAGE,
        "attributes-natural-language",
        "en",
    );
    出
}

fn 加字符串(出: &mut Vec<u8>, tag: u8, name: &str, value: &str) {
    加值(出, tag, name, value.as_bytes());
}

fn 加整数(出: &mut Vec<u8>, name: &str, value: u32) {
    加值(出, IPP_INTEGER, name, &value.to_be_bytes());
}

fn 加值(出: &mut Vec<u8>, tag: u8, name: &str, value: &[u8]) {
    let 名 = name.as_bytes();
    出.push(tag);
    出.extend_from_slice(&(名.len() as u16).to_be_bytes());
    出.extend_from_slice(名);
    出.extend_from_slice(&(value.len() as u16).to_be_bytes());
    出.extend_from_slice(value);
}

fn 加区间属性(出: &mut Vec<u8>, name: &str, ranges: &[(u32, u32)]) {
    for (i, (起, 止)) in ranges.iter().enumerate() {
        let 名 = if i == 0 { name } else { "" };
        let mut 值 = Vec::with_capacity(8);
        值.extend_from_slice(&起.to_be_bytes());
        值.extend_from_slice(&止.to_be_bytes());
        加值(出, IPP_RANGE, 名, &值);
    }
}

fn 解析页码范围(文本: &str) -> Result<Vec<(u32, u32)>> {
    let mut 出 = Vec::new();
    for 项 in 文本.split(',') {
        let 项 = 项.trim();
        if 项.is_empty() {
            return Err(NotaError::other("页码范围里有空项"));
        }
        let (起, 止) = match 项.split_once('-') {
            Some((a, b)) => (
                a.trim().parse::<u32>(),
                b.trim().parse::<u32>(),
            ),
            None => {
                let n = 项
                    .parse::<u32>()
                    .map_err(|_| NotaError::other(format!("页码范围“{项}”不是数字")))?;
                (Ok(n), Ok(n))
            }
        };
        let 起 = 起.map_err(|_| NotaError::other(format!("页码范围“{项}”起点不是数字")))?;
        let 止 = 止.map_err(|_| NotaError::other(format!("页码范围“{项}”终点不是数字")))?;
        if 起 == 0 || 止 < 起 {
            return Err(NotaError::other(format!("页码范围“{项}”无效")));
        }
        出.push((起, 止));
    }
    Ok(出)
}

fn 打印机uri(名: &str) -> String {
    format!("ipp://localhost/printers/{}", 编码路径段(名))
}

fn 编码路径段(值: &str) -> String {
    let mut 出 = String::new();
    for b in 值.as_bytes() {
        let 原样 = b.is_ascii_alphanumeric() || matches!(*b, b'-' | b'.' | b'_' | b'~');
        if 原样 {
            出.push(*b as char);
        } else {
            出.push_str(&format!("%{b:02X}"));
        }
    }
    出
}

fn 发请求(
    socket: &Path,
    path: &str,
    ipp: &[u8],
    文档文件: Option<&Path>,
    超时: Duration,
) -> io::Result<Vec<u8>> {
    use std::os::unix::net::UnixStream;

    let mut 流 = UnixStream::connect(socket)?;
    流.set_read_timeout(Some(超时))?;
    流.set_write_timeout(Some(超时))?;
    let 文件长 = match 文档文件 {
        Some(路径) => std::fs::metadata(路径)?.len(),
        None => 0,
    };
    let 总长 = ipp.len() as u64 + 文件长;
    crate::日志!(
        "[cups] POST {path}: IPP {} bytes, document {} bytes",
        ipp.len(),
        文件长
    );
    write!(
        流,
        "POST {path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/ipp\r\nAccept: application/ipp\r\nContent-Length: {总长}\r\nConnection: close\r\n\r\n"
    )?;
    流.write_all(ipp)?;
    if let Some(路径) = 文档文件 {
        let mut f = File::open(路径)?;
        io::copy(&mut f, &mut 流)?;
    }
    流.flush()?;
    // ⚠️ 不要 `shutdown(Write)`：CUPS 看到写半边关闭会只回 HTTP 头、
    // 把 `Content-Length` 指着的 IPP 正文省掉。实测同一请求不关写半边就正常。
    let mut 响应 = Vec::new();
    流.read_to_end(&mut 响应)?;
    crate::日志!("[cups] response body: {} bytes", 响应.len());
    http正文(响应)
}

fn http正文(响应: Vec<u8>) -> io::Result<Vec<u8>> {
    let 分隔 = 响应
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "HTTP 响应没有头部结束标记"))?;
    let 头 = std::str::from_utf8(&响应[..分隔])
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "HTTP 头不是 UTF-8"))?;
    let 状态 = 头
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    if !(200..300).contains(&状态) {
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!("CUPS HTTP 状态 {状态}"),
        ));
    }
    let 体 = &响应[分隔 + 4..];
    crate::日志!(
        "[cups] HTTP header {} bytes, body {} bytes, total {} bytes",
        分隔,
        体.len(),
        响应.len()
    );
    let 块 = 头.lines().any(|l| {
        l.split_once(':')
            .map(|(k, v)| {
                k.eq_ignore_ascii_case("transfer-encoding")
                    && v.to_ascii_lowercase().contains("chunked")
            })
            .unwrap_or(false)
    });
    if 块 {
        return 解块(体);
    }
    let 长度 = 头.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        k.eq_ignore_ascii_case("content-length")
            .then(|| v.trim().parse::<usize>().ok())
            .flatten()
    });
    if let Some(n) = 长度 {
        if 体.len() < n {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                format!("IPP 正文短了：头里写 {n} 字节，实际只收到 {}", 体.len()),
            ));
        }
        return Ok(体[..n].to_vec());
    }
    Ok(体.to_vec())
}

fn 解块(体: &[u8]) -> io::Result<Vec<u8>> {
    let mut 读 = 0;
    let mut 出 = Vec::new();
    loop {
        let 行尾 = 体[读..]
            .windows(2)
            .position(|w| w == b"\r\n")
            .ok_or_else(|| io::Error::new(io::ErrorKind::UnexpectedEof, "chunk 缺行尾"))?
            + 读;
        let 长文本 = std::str::from_utf8(&体[读..行尾])
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "chunk 长度不是 ASCII"))?;
        let 长文本 = 长文本.split(';').next().unwrap_or("").trim();
        let 长 = usize::from_str_radix(长文本, 16)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "chunk 长度不是十六进制"))?;
        读 = 行尾 + 2;
        if 长 == 0 {
            return Ok(出);
        }
        if 体.len() < 读 + 长 + 2 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "chunk 正文短了"));
        }
        出.extend_from_slice(&体[读..读 + 长]);
        读 += 长 + 2;
    }
}

#[derive(Debug, Clone)]
struct 属性 {
    组: u8,
    name: String,
    value: Vec<u8>,
}

#[derive(Debug)]
struct IPP文档 {
    状态: u16,
    属性: Vec<属性>,
}

fn 解析响应(数据: &[u8]) -> std::result::Result<IPP文档, String> {
    if 数据.len() < 8 {
        return Err("短于 8 字节的 IPP 头".into());
    }
    let 状态 = u16::from_be_bytes([数据[2], 数据[3]]);
    let mut i = 8;
    let mut 组 = 0;
    let mut 上一条名字 = String::new();
    let mut 属性 = Vec::new();
    while i < 数据.len() {
        let tag = 数据[i];
        i += 1;
        if tag == IPP_END {
            break;
        }
        if matches!(tag, 0x01..=0x05) {
            组 = tag;
            上一条名字.clear();
            continue;
        }
        let 名字 = 读u16(数据, &mut i).ok_or("属性名长度缺了")? as usize;
        if i + 名字 > 数据.len() {
            return Err("属性名越界".into());
        }
        let name = if 名字 == 0 {
            上一条名字.clone()
        } else {
            let s = std::str::from_utf8(&数据[i..i + 名字])
                .map_err(|_| "属性名不是 UTF-8")?
                .to_string();
            上一条名字 = s.clone();
            s
        };
        i += 名字;
        let 长 = 读u16(数据, &mut i).ok_or("属性值长度缺了")? as usize;
        if i + 长 > 数据.len() {
            return Err("属性值越界".into());
        }
        属性.push(属性 {
            组,
            name,
            value: 数据[i..i + 长].to_vec(),
        });
        i += 长;
    }
    Ok(IPP文档 { 状态, 属性 })
}

fn 读u16(数据: &[u8], i: &mut usize) -> Option<u16> {
    if *i + 2 > 数据.len() {
        return None;
    }
    let 出 = u16::from_be_bytes([数据[*i], 数据[*i + 1]]);
    *i += 2;
    Some(出)
}

fn 按组(属性: &[属性], 组: u8) -> Vec<HashMap<String, Vec<Vec<u8>>>> {
    let mut 出: Vec<HashMap<String, Vec<Vec<u8>>>> = Vec::new();
    for a in 属性.iter().filter(|a| a.组 == 组) {
        if a.name == "printer-name" || 出.is_empty() {
            出.push(HashMap::new());
        }
        if let Some(last) = 出.last_mut() {
            last.entry(a.name.clone()).or_default().push(a.value.clone());
        }
    }
    出
}

fn 组字符串(组: &HashMap<String, Vec<Vec<u8>>>, name: &str) -> Option<String> {
    组.get(name)?.first().and_then(|v| 读字符串(v))
}

fn 找第一个<'a>(属性: &'a [属性], name: &str) -> Option<&'a [u8]> {
    属性
        .iter()
        .find(|a| a.name == name)
        .map(|a| a.value.as_slice())
}

fn 读字符串(值: &[u8]) -> Option<String> {
    std::str::from_utf8(值).ok().map(ToString::to_string)
}

fn 读整数(值: &[u8]) -> Option<u32> {
    (值.len() == 4).then(|| u32::from_be_bytes([值[0], 值[1], 值[2], 值[3]]))
}

fn 读布尔(值: &[u8]) -> Option<bool> {
    (值.len() == 1).then(|| 值[0] != 0)
}

fn 确认成功(状态: u16) -> Result<()> {
    if 状态 <= 0x00ff {
        return Ok(());
    }
    let 名 = match 状态 {
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
        "CUPS 拒绝了请求：{名} (0x{状态:04X})"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    const IPP_TEXT: u8 = 0x41;
    const IPP_ENUM: u8 = 0x23;
    const IPP_JOB_ATTRIBUTES: u8 = 0x02;

    #[test]
    fn 页码范围认单页与区间() {
        assert_eq!(解析页码范围("1-3, 5").unwrap(), vec![(1, 3), (5, 5)]);
        assert!(解析页码范围("0-2").is_err());
        assert!(解析页码范围("4-2").is_err());
        assert!(解析页码范围("1,,2").is_err());
    }

    #[test]
    fn 打印机名字进_uri_会编码() {
        assert_eq!(
            打印机uri("办公室 MFP"),
            "ipp://localhost/printers/%E5%8A%9E%E5%85%AC%E5%AE%A4%20MFP"
        );
    }

    #[test]
    fn 响应解析认出打印机组与状态() {
        let mut 数据 = vec![1, 1, 0, 0, 0, 0, 0, 1, IPP_PRINTER_ATTRIBUTES];
        加字符串(&mut 数据, IPP_NAME, "printer-name", "L3150");
        加字符串(&mut 数据, IPP_TEXT, "printer-info", "Epson L3150");
        加字符串(
            &mut 数据,
            IPP_URI,
            "printer-uri-supported",
            "ipp://localhost/printers/L3150",
        );
        加值(&mut 数据, IPP_ENUM, "printer-state", &3u32.to_be_bytes());
        数据.push(IPP_END);
        let 文档 = 解析响应(&数据).unwrap();
        assert_eq!(文档.状态, 0);
        let 组 = 按组(&文档.属性, IPP_PRINTER_ATTRIBUTES);
        assert_eq!(组.len(), 1);
        assert_eq!(组字符串(&组[0], "printer-name").as_deref(), Some("L3150"));
        assert_eq!(
            组[0]["printer-state"].first().and_then(|v| 读整数(v)),
            Some(3)
        );
    }

    #[test]
    fn http_chunked_也能解() {
        let 原始 = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n".to_vec();
        assert_eq!(http正文(原始).unwrap(), b"abcde");
    }

    #[test]
    fn 缺_cups_socket_时返回服务不可用() {
        let 结果 = 列打印机();
        if !Path::new("/run/cups/cups.sock").exists()
            && !Path::new("/var/run/cups/cups.sock").exists()
        {
            assert!(!结果.服务可用);
        }
    }

    #[test]
    fn 布尔与整数只认正确宽度() {
        assert_eq!(读布尔(&[1]), Some(true));
        assert_eq!(读布尔(&[1, 0]), None);
        assert_eq!(读整数(&[0, 0, 0, 7]), Some(7));
        assert_eq!(读整数(&[7]), None);
    }

    #[test]
    fn ipp_job_属性组里能读出_job_id() {
        let mut 数据 = vec![1, 1, 0, 0, 0, 0, 0, 2, IPP_JOB_ATTRIBUTES];
        加整数(&mut 数据, "job-id", 42);
        数据.push(IPP_END);
        let 文档 = 解析响应(&数据).unwrap();
        assert_eq!(
            找第一个(&文档.属性, "job-id").and_then(读整数),
            Some(42)
        );
    }
}
