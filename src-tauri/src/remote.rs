//! Shared restricted HTTP downloads for updater paths.
//!
//! Callers provide the trust boundary and checksum verification. This module
//! applies URL replacement rules, enforces trusted schemes, and bounds body
//! size, time, redirects, and cancellation latency.

use std::time::Duration;

use crate::error::{NotaError, Result};

pub(crate) fn fetch(
    address: &str,
    replacements: &str,
    limit: u64,
    timeout: Duration,
) -> Result<Vec<u8>> {
    fetch_with_progress(address, replacements, limit, timeout, |_, _| {})
}

pub(crate) fn fetch_with_progress(
    address: &str,
    replacements: &str,
    limit: u64,
    timeout: Duration,
    progress: impl FnMut(u64, Option<u64>),
) -> Result<Vec<u8>> {
    fetch_with_progress_cancellable(address, replacements, limit, timeout, || false, progress)
}

pub(crate) fn fetch_with_progress_cancellable(
    address: &str,
    replacements: &str,
    limit: u64,
    timeout: Duration,
    cancelled: impl Fn() -> bool,
    mut progress: impl FnMut(u64, Option<u64>),
) -> Result<Vec<u8>> {
    use std::io::Read as _;

    if cancelled() {
        return Err(NotaError::other("Update download cancelled"));
    }
    let address = crate::settings::download::rewrite_address(address, replacements)?;
    if !is_trusted_address(&address) {
        return Err(NotaError::other(format!(
            "Rewritten download URL is not HTTPS or loopback: {address}"
        )));
    }
    let config = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(5)
        .timeout_global(Some(timeout))
        .timeout_recv_body(Some(Duration::from_secs(15)))
        .user_agent(format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .build();
    let user_agent = format!("Nota/{}", env!("CARGO_PKG_VERSION"));
    let request = ureq::http::Request::builder()
        .method("GET")
        .uri(&address)
        .header("user-agent", user_agent)
        .body(Vec::new())
        .map_err(|error| NotaError::other(format!("Invalid update request: {error}")))?;
    let mut response = ureq::Agent::new_with_config(config)
        .run(request)
        .map_err(|error| NotaError::other(format!("Update request failed: {error}")))?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(NotaError::other(format!(
            "Update server returned HTTP {status}"
        )));
    }
    let total = response.body().content_length();
    let mut reader = response.body_mut().with_config().limit(limit).reader();
    let mut bytes = Vec::with_capacity(total.unwrap_or(0).min(limit) as usize);
    let mut block = [0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut block)
            .map_err(|error| NotaError::other(format!("Update read failed: {error}")))?;
        if read == 0 {
            break;
        }
        if cancelled() {
            return Err(NotaError::other("Update download cancelled"));
        }
        bytes.extend_from_slice(&block[..read]);
        progress(bytes.len() as u64, total);
    }
    Ok(bytes)
}

/// Update manifests and packages accept HTTPS and loopback HTTP only.
pub(crate) fn is_trusted_address(address: &str) -> bool {
    let address = address.trim();
    address.starts_with("https://")
        || address.starts_with("http://127.0.0.1:")
        || address.starts_with("http://localhost:")
        || address.starts_with("http://[::1]:")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_happens_before_network_access() {
        let result = fetch_with_progress_cancellable(
            "https://example.invalid/nota.pkg",
            "",
            1024,
            Duration::from_secs(1),
            || true,
            |_, _| {},
        );
        assert!(result.unwrap_err().to_string().contains("cancelled"));
    }
}
