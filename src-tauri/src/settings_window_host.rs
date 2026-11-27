use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::error::{NotaError, Result};

#[derive(Debug, Deserialize, Serialize)]
struct ControlState {
    pid: u32,
    port: u16,
}

pub struct SettingsWindowControl {
    state_path: PathBuf,
}

impl Drop for SettingsWindowControl {
    fn drop(&mut self) {
        let current = read_state(&self.state_path);
        if current.is_some_and(|state| state.pid == std::process::id()) {
            let _ = std::fs::remove_file(&self.state_path);
        }
    }
}

fn state_path() -> Result<PathBuf> {
    Ok(crate::paths::config_dir()?.join("settings-window.state"))
}

fn read_state(path: &PathBuf) -> Option<ControlState> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn focus_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn start(app: tauri::AppHandle) -> Result<SettingsWindowControl> {
    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
        .map_err(|error| NotaError::other(format!("Could not bind Settings control: {error}")))?;
    let port = listener
        .local_addr()
        .map_err(|error| {
            NotaError::other(format!("Could not read Settings control port: {error}"))
        })?
        .port();
    let path = state_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            NotaError::other(format!(
                "Could not create Settings state directory: {error}"
            ))
        })?;
    }
    let state = ControlState {
        pid: std::process::id(),
        port,
    };
    std::fs::write(
        &path,
        serde_json::to_vec(&state).map_err(|error| {
            NotaError::other(format!("Could not encode Settings state: {error}"))
        })?,
    )
    .map_err(|error| NotaError::other(format!("Could not write Settings state: {error}")))?;

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else {
                continue;
            };
            let mut request = [0_u8; 16];
            let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
            let read = stream.read(&mut request).unwrap_or(0);
            if !request[..read].starts_with(b"focus") {
                continue;
            }
            focus_window(&app);
            let _ = write!(stream, "ok {}", std::process::id());
        }
    });

    Ok(SettingsWindowControl { state_path: path })
}

pub fn focus_existing() -> Option<u32> {
    let path = state_path().ok()?;
    let state = read_state(&path)?;
    let mut stream = TcpStream::connect_timeout(
        &SocketAddrV4::new(Ipv4Addr::LOCALHOST, state.port).into(),
        Duration::from_millis(350),
    )
    .ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(350)));
    stream.write_all(b"focus\n").ok()?;
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    response.starts_with("ok ").then_some(state.pid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_state_round_trips() {
        let state = ControlState {
            pid: 321,
            port: 45678,
        };
        let encoded = serde_json::to_string(&state).unwrap();
        let decoded: ControlState = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded.pid, 321);
        assert_eq!(decoded.port, 45678);
    }
}
