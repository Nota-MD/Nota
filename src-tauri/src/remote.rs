//! 更新器共用的受限 HTTP 下载。
//!
//! 应用更新和插件更新都只从外部取两类东西：一份 JSON 清单与一个发布包。
//! 两边都要有重定向上限、总时限、响应体上限和统一的 User-Agent，所以这里
//! 只保留一条下载路径。调用方负责更严格的地址围栏与摘要校验。

use std::time::Duration;

use crate::error::{NotaError, Result};

/// GET 一个地址，响应体不得超过 `上限`。
///
/// `replacements` 是用户配置的 `旧前缀 => 新前缀` 规则。改写后的地址仍须通过
/// HTTPS / 本机回环检查，避免一个替换规则把下载悄悄降成明文或非法协议。
pub(crate) fn 取(
    地址: &str,
    替换规则: &str,
    上限: u64,
    超时: Duration,
) -> Result<Vec<u8>> {
    取_带进度(地址, 替换规则, 上限, 超时, |_, _| {})
}

/// 与 [`取`] 相同，但每读一块就报告一次“已下载 / 总长度”。
///
/// 下载包只在内存里攒一份，不额外写临时分片；回调负责把进度推给界面。
pub(crate) fn 取_带进度(
    地址: &str,
    替换规则: &str,
    上限: u64,
    超时: Duration,
    mut 进度: impl FnMut(u64, Option<u64>),
) -> Result<Vec<u8>> {
    use std::io::Read as _;

    let 地址 = crate::settings::download::改写地址(地址, 替换规则)?;
    if !地址可信(&地址) {
        return Err(NotaError::other(format!(
            "下载地址替换后不是 HTTPS 或本机地址：{地址}"
        )));
    }
    let 配置 = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(5)
        .timeout_global(Some(超时))
        .user_agent(format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .build();
    let 请求 = ureq::http::Request::builder()
        .method("GET")
        .uri(&地址)
        .header("user-agent", format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .body(Vec::new())
        .map_err(|e| NotaError::other(format!("更新请求无效：{e}")))?;
    let mut 响应 = ureq::Agent::new_with_config(配置)
        .run(请求)
        .map_err(|e| NotaError::other(format!("更新请求失败：{e}")))?;
    let 状态 = 响应.status().as_u16();
    if !(200..300).contains(&状态) {
        return Err(NotaError::other(format!("更新服务器返回 HTTP {状态}")));
    }
    let 总长 = 响应.body().content_length();
    let mut 读取 = 响应.body_mut().with_config().limit(上限).reader();
    let mut 字节 = Vec::with_capacity(总长.unwrap_or(0).min(上限) as usize);
    let mut 块 = [0_u8; 64 * 1024];
    loop {
        let 读入 = 读取
            .read(&mut 块)
            .map_err(|e| NotaError::other(format!("更新数据读取失败：{e}")))?;
        if 读入 == 0 {
            break;
        }
        字节.extend_from_slice(&块[..读入]);
        进度(字节.len() as u64, 总长);
    }
    Ok(字节)
}

/// 更新清单只接受 HTTPS。回环 HTTP 留给本地测试，不出本机。
pub(crate) fn 地址可信(地址: &str) -> bool {
    let 地址 = 地址.trim();
    地址.starts_with("https://")
        || 地址.starts_with("http://127.0.0.1:")
        || 地址.starts_with("http://localhost:")
        || 地址.starts_with("http://[::1]:")
}
