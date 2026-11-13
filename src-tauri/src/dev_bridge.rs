//! Authenticated developer control bridge.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use base64::Engine;
use rand_core::{OsRng, RngCore};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{Emitter, Manager};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::error::{NotaError, Result};
use crate::state::AppState;

mod security;

use security::{
    allowed, bind_addresses, hash_password, normalize_whitelist, read_security, verify_password,
    write_security,
};

pub const THEME_EVENT: &str = "nota:dev-bridge-theme";
pub const COMMAND_EVENT: &str = "nota:dev-bridge-command";
const SESSION_TTL: Duration = Duration::from_secs(12 * 60 * 60);
const MAX_BODY: u64 = 64 * 1024 * 1024;
const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);

type CommandReply = std::result::Result<Value, String>;

#[derive(Debug, Clone)]
struct Session {
    ip: IpAddr,
    expires: Instant,
}

struct BridgeHandle {
    stop: Arc<AtomicBool>,
    servers: Vec<Arc<Server>>,
    workers: Vec<JoinHandle<()>>,
    port: u16,
    whitelist: Vec<String>,
}

#[derive(Default)]
pub struct DevBridge {
    handle: Mutex<Option<BridgeHandle>>,
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    failures: Arc<Mutex<HashMap<IpAddr, (u32, Instant)>>>,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<CommandReply>>>>,
    active_requests: Arc<AtomicUsize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BridgeStatus {
    pub running: bool,
    pub port: u16,
    pub whitelist: Vec<String>,
    pub sessions: usize,
    pub password_set: bool,
}

fn json_response(status: u16, value: Value) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(value.to_string())
        .with_status_code(status)
        .with_header(
            Header::from_bytes("Content-Type", "application/json; charset=utf-8")
                .expect("static header"),
        )
        .with_header(Header::from_bytes("Cache-Control", "no-store").expect("static header"))
}

fn body(request: &mut Request) -> std::result::Result<Vec<u8>, String> {
    if request
        .body_length()
        .is_some_and(|length| length as u64 > MAX_BODY)
    {
        return Err(format!("Request body exceeds {MAX_BODY} bytes"));
    }
    let mut output = Vec::new();
    request
        .as_reader()
        .take(MAX_BODY + 1)
        .read_to_end(&mut output)
        .map_err(|e| e.to_string())?;
    if output.len() as u64 > MAX_BODY {
        return Err(format!("Request body exceeds {MAX_BODY} bytes"));
    }
    Ok(output)
}

fn has_json_content_type(request: &Request) -> bool {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Content-Type"))
        .is_some_and(|header| {
            header
                .value
                .as_str()
                .split(';')
                .next()
                .is_some_and(|value| value.trim().eq_ignore_ascii_case("application/json"))
        })
}

fn host_allowed(request: &Request, peer: IpAddr) -> bool {
    let Some(header) = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Host"))
    else {
        return false;
    };
    let raw = header.value.as_str().trim();
    let host = if let Some(value) = raw.strip_prefix('[') {
        value.split_once(']').map_or(value, |(address, _)| address)
    } else {
        raw.rsplit_once(':').map_or(raw, |(address, _)| address)
    };
    if host.eq_ignore_ascii_case("localhost") {
        return peer.is_loopback();
    }
    host.parse::<IpAddr>().is_ok_and(|address| {
        address == peer
            || matches!(
                (address, peer),
                (IpAddr::V6(left), IpAddr::V4(right))
                    if left.to_ipv4_mapped() == Some(right)
            )
    })
}

fn bearer(request: &Request) -> Option<&str> {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Authorization"))
        .and_then(|header| header.value.as_str().strip_prefix("Bearer "))
}

fn random_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn issue_session(sessions: &Arc<Mutex<HashMap<String, Session>>>, ip: IpAddr) -> String {
    let token = random_token();
    sessions.lock().unwrap().insert(
        token.clone(),
        Session {
            ip,
            expires: Instant::now() + SESSION_TTL,
        },
    );
    token
}

fn authenticated(
    sessions: &Arc<Mutex<HashMap<String, Session>>>,
    request: &Request,
    ip: IpAddr,
) -> bool {
    let Some(token) = bearer(request) else {
        return false;
    };
    let mut sessions = sessions.lock().unwrap();
    sessions.retain(|_, session| session.expires > Instant::now());
    sessions
        .get(token)
        .is_some_and(|session| session.ip == ip && session.expires > Instant::now())
}

fn run_rpc(
    app: tauri::AppHandle,
    method: &str,
    params: &Value,
) -> std::result::Result<Value, String> {
    match method {
        "app.info" => {
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let docs = state.documents.lock().unwrap().list().len();
            Ok(json!({
                "app": "Nota",
                "version": env!("CARGO_PKG_VERSION"),
                "protocol": 1,
                "documents": docs,
                "apiVersion": crate::plugin::manifest::NOTA_PLUGIN_API_VERSION,
            }))
        }
        "editor.status" => {
            let documents = crate::mcp::tools::run_tool_raw(
                "nota_documents",
                params,
                &crate::mcp::host::应用宿主::新(app),
            )?;
            let list = documents
                .get("documents")
                .cloned()
                .unwrap_or_else(|| json!([]));
            let active = list
                .as_array()
                .and_then(|items| {
                    items
                        .iter()
                        .find(|item| item.get("active").and_then(Value::as_bool) == Some(true))
                })
                .cloned();
            Ok(json!({
                "app": "Nota",
                "version": env!("CARGO_PKG_VERSION"),
                "protocol": 1,
                "apiVersion": crate::plugin::manifest::NOTA_PLUGIN_API_VERSION,
                "active": active,
                "documents": list,
            }))
        }
        "documents.list" => crate::mcp::tools::run_tool_raw(
            "nota_documents",
            params,
            &crate::mcp::host::应用宿主::新(app),
        ),
        "documents.read" => crate::mcp::tools::run_tool_raw(
            "nota_read",
            params,
            &crate::mcp::host::应用宿主::新(app),
        ),
        "documents.write" => crate::mcp::tools::run_tool_raw(
            "nota_write",
            params,
            &crate::mcp::host::应用宿主::新(app),
        ),
        "documents.open" => crate::mcp::tools::run_tool_raw(
            "nota_open",
            params,
            &crate::mcp::host::应用宿主::新(app),
        ),
        "theme.reload" => {
            let path = params
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| "theme.reload requires path".to_string())?;
            let target = PathBuf::from(path);
            let css_path = if target.is_dir() {
                target.join("theme.css")
            } else {
                target
            };
            let css = fs::read_to_string(&css_path)
                .map_err(|e| format!("Could not read {}: {e}", css_path.display()))?;
            app.emit(
                THEME_EVENT,
                json!({ "path": css_path.to_string_lossy(), "css": css }),
            )
            .map_err(|e| e.to_string())?;
            Ok(json!({ "path": css_path.to_string_lossy(), "queued": true }))
        }
        "plugin.reload" => {
            let path = params
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| "plugin.reload requires path".to_string())?;
            let mut directory = PathBuf::from(path);
            if directory.is_file() {
                directory = directory.parent().unwrap_or(Path::new(".")).to_path_buf();
            }
            let canonical = directory
                .canonicalize()
                .map_err(|e| format!("Invalid plugin path: {e}"))?;
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let id = state
                .plugins
                .lock()
                .unwrap()
                .reload_dir(&canonical)
                .map_err(|e| e.to_string())?;
            Ok(json!({ "plugin": id, "path": canonical.to_string_lossy() }))
        }
        "plugin.inspect" => {
            let path = params
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| "plugin.inspect requires path".to_string())?;
            let mut manifest_path = PathBuf::from(path);
            if manifest_path.is_dir() {
                manifest_path.push(crate::plugin::package::清单文件);
            }
            let manifest = crate::plugin::manifest::Manifest::load(&manifest_path)
                .map_err(|error| error.to_string())?;
            Ok(json!({
                "root": manifest.dir.to_string_lossy(),
                "meta": manifest.meta,
                "capabilities": manifest.capabilities,
                "devserver": manifest.devserver.is_some(),
                "update": manifest.update.is_some(),
                "settings": manifest.settings.len(),
            }))
        }
        "plugins.list" => {
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let host = state.plugins.lock().unwrap();
            serde_json::to_value(host.list_info()).map_err(|e| e.to_string())
        }
        "plugins.install" => {
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let mut host = state.plugins.lock().unwrap();
            if let Some(path) = params.get("path").and_then(Value::as_str) {
                let id = host
                    .装(Path::new(path))
                    .map_err(|e| e.to_string())?;
                return Ok(json!({ "id": id, "path": path }));
            }
            let encoded = params
                .get("base64")
                .and_then(Value::as_str)
                .ok_or_else(|| "plugins.install requires path or base64".to_string())?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|e| format!("Invalid plugin package base64: {e}"))?;
            let filename = params
                .get("filename")
                .and_then(Value::as_str)
                .unwrap_or("extension.nota-plugin");
            let extension = Path::new(filename)
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("nota-plugin");
            let temp = std::env::temp_dir().join(format!(
                "nota-devbridge-{}.{}",
                random_token(),
                extension
            ));
            fs::write(&temp, bytes).map_err(|e| e.to_string())?;
            let installed = host.装(&temp);
            let _ = fs::remove_file(&temp);
            let id = installed.map_err(|e| e.to_string())?;
            Ok(json!({ "id": id, "filename": filename }))
        }
        "plugins.uninstall" => {
            let id = params
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| "plugins.uninstall requires id".to_string())?;
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let mut host = state.plugins.lock().unwrap();
            host.卸(id).map_err(|e| e.to_string())?;
            Ok(json!({ "id": id, "uninstalled": true }))
        }
        "plugins.setEnabled" => {
            let id = params
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| "plugins.setEnabled requires id".to_string())?;
            let enabled = params
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or_else(|| "plugins.setEnabled requires enabled".to_string())?;
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let mut host = state.plugins.lock().unwrap();
            host.set_enabled(id, enabled).map_err(|e| e.to_string())?;
            Ok(json!({ "id": id, "enabled": enabled }))
        }
        "plugins.checkUpdates" => {
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let sources = {
                let host = state.plugins.lock().unwrap();
                crate::plugin::updater::来源(&host)
            };
            let replacements = state
                .settings
                .lock()
                .map(|settings| settings.download.replacements.clone())
                .unwrap_or_default();
            let updates = tauri::async_runtime::block_on(
                tauri::async_runtime::spawn_blocking(move || {
                    crate::plugin::updater::检查(&sources, &replacements)
                }),
            )
            .map_err(|e| format!("Plugin update check failed: {e}"))?;
            serde_json::to_value(updates).map_err(|e| e.to_string())
        }
        "plugins.update" => {
            let id = params
                .get("id")
                .and_then(Value::as_str)
                .ok_or_else(|| "plugins.update requires id".to_string())?;
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let source = {
                let host = state.plugins.lock().unwrap();
                crate::plugin::updater::来源(&host)
                    .into_iter()
                    .find(|source| source.id == id)
                    .ok_or_else(|| format!("Extension {id} has no update source"))?
            };
            let replacements = state
                .settings
                .lock()
                .map(|settings| settings.download.replacements.clone())
                .unwrap_or_default();
            let prepared = tauri::async_runtime::block_on(
                tauri::async_runtime::spawn_blocking(move || {
                    crate::plugin::updater::准备(&source, &replacements)
                }),
            )
            .map_err(|e| format!("Plugin update download failed: {e}"))?
            .map_err(|e| e.to_string())?;
            let mut host = state.plugins.lock().unwrap();
            let result = crate::plugin::updater::安装(&mut host, prepared)
                .map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "plugins.updateAll" => {
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let sources = {
                let host = state.plugins.lock().unwrap();
                crate::plugin::updater::来源(&host)
            };
            let replacements = state
                .settings
                .lock()
                .map(|settings| settings.download.replacements.clone())
                .unwrap_or_default();
            let updates = tauri::async_runtime::block_on(
                tauri::async_runtime::spawn_blocking(move || {
                    crate::plugin::updater::检查(&sources, &replacements)
                }),
            )
            .map_err(|e| format!("Plugin update check failed: {e}"))?;
            let mut results = Vec::new();
            for update in updates
                .into_iter()
                .filter(|update| update.available && update.error.is_none())
            {
                let source = {
                    let host = state.plugins.lock().unwrap();
                    crate::plugin::updater::来源(&host)
                        .into_iter()
                        .find(|source| source.id == update.id)
                };
                let Some(source) = source else {
                    results.push(json!({ "id": update.id, "error": "No update source" }));
                    continue;
                };
                let replacements = state
                    .settings
                    .lock()
                    .map(|settings| settings.download.replacements.clone())
                    .unwrap_or_default();
                let prepared = tauri::async_runtime::block_on(
                    tauri::async_runtime::spawn_blocking(move || {
                        crate::plugin::updater::准备(&source, &replacements)
                    }),
                );
                match prepared {
                    Ok(Ok(prepared)) => {
                        let installed = {
                            let mut host = state.plugins.lock().unwrap();
                            crate::plugin::updater::安装(&mut host, prepared)
                        };
                        results.push(match installed {
                            Ok(result) => serde_json::to_value(result)
                                .unwrap_or_else(|e| json!({ "id": update.id, "error": e.to_string() })),
                            Err(error) => json!({ "id": update.id, "error": error.to_string() }),
                        });
                    }
                    Ok(Err(error)) => {
                        results.push(json!({ "id": update.id, "error": error.to_string() }));
                    }
                    Err(error) => {
                        results.push(json!({ "id": update.id, "error": error.to_string() }));
                    }
                }
            }
            Ok(json!({ "results": results }))
        }
        "diagnostics.info" => {
            let diagnostics = crate::diagnostics::收集();
            Ok(json!({
                "version": env!("CARGO_PKG_VERSION"),
                "target": option_env!("TARGET").unwrap_or(std::env::consts::ARCH),
                "debug": cfg!(debug_assertions),
                "log_enabled": crate::log::开着(),
                "diagnostics": diagnostics,
                "document_tools": crate::mcp::tools::清单(),
            }))
        }
        "logs.read" => {
            let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0);
            let chunk = crate::log::读取增量(offset)
                .map_err(|error| format!("Could not read debug log: {error}"))?;
            Ok(json!({
                "text": chunk.text,
                "offset": chunk.offset,
                "reset": chunk.reset,
            }))
        }
        "settings.read" => {
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            let settings = state.settings.lock().unwrap().clone();
            serde_json::to_value(settings).map_err(|e| e.to_string())
        }
        "settings.write" => {
            let settings: crate::settings::Settings = serde_json::from_value(
                params
                    .get("settings")
                    .cloned()
                    .ok_or_else(|| "settings.write requires settings".to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let state = app
                .try_state::<AppState>()
                .ok_or_else(|| "Application state is not ready".to_string())?;
            crate::commands::settings::落盘(&app, &state, settings).map_err(|e| e.to_string())?;
            Ok(json!({ "saved": true }))
        }
        "commands.invoke" => {
            let command = params
                .get("command")
                .and_then(Value::as_str)
                .ok_or_else(|| "commands.invoke requires command".to_string())?;
            if !command.starts_with("nota_") {
                return Err("Host commands must use the nota_ prefix".to_string());
            }
            if matches!(
                command,
                "nota_dev_bridge_enable"
                    | "nota_dev_bridge_disable"
                    | "nota_dev_bridge_revoke"
                    | "nota_dev_bridge_respond"
            ) {
                return Err(format!("Host command is reserved: {command}"));
            }
            let args = params.get("args").cloned().unwrap_or_else(|| json!({}));
            let bridge = app
                .try_state::<DevBridge>()
                .ok_or_else(|| "Developer bridge state is not ready".to_string())?;
            bridge.invoke_frontend(&app, command, args)
        }
        "preview.render" => {
            let bridge = app
                .try_state::<DevBridge>()
                .ok_or_else(|| "Developer bridge state is not ready".to_string())?;
            bridge.invoke_frontend(&app, "nota_host_preview_render", params.clone())
        }
        "capture.window" => {
            let title = params
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Nota");
            let windows = tauri::async_runtime::block_on(
                tauri_plugin_screenshots::get_screenshotable_windows(),
            )
            .map_err(|e| e.to_string())?;
            let window = windows
                .iter()
                .find(|window| {
                    window.app_name.eq_ignore_ascii_case(title) || window.title.contains(title)
                })
                .ok_or_else(|| format!("No screenshotable window matched {title}"))?;
            let path = tauri::async_runtime::block_on(
                tauri_plugin_screenshots::get_window_screenshot(app.clone(), window.id),
            )
            .map_err(|e| e.to_string())?;
            let bytes = fs::read(&path).map_err(|e| e.to_string())?;
            Ok(json!({
                "path": path.to_string_lossy(),
                "mime": "image/png",
                "base64": base64::engine::general_purpose::STANDARD.encode(bytes),
            }))
        }
        other => Err(format!("Unknown method: {other}")),
    }
}

fn handle_request(app: tauri::AppHandle, bridge: Arc<Bridge>, mut request: Request) {
    let active = bridge.active_requests.fetch_add(1, Ordering::SeqCst) + 1;
    if active > 32 {
        bridge.active_requests.fetch_sub(1, Ordering::SeqCst);
        let _ = request.respond(json_response(
            503,
            json!({
                "ok": false,
                "error": { "code": "busy", "message": "Too many concurrent developer requests" }
            }),
        ));
        return;
    }
    let _slot = RequestSlot(bridge.active_requests.clone());
    let Some(peer) = request.remote_addr().map(|value| value.ip()) else {
        let _ = request.respond(json_response(400, json!({ "ok": false })));
        return;
    };
    let whitelist = bridge.whitelist.clone();
    if !allowed(&whitelist, peer) {
        let _ = request.respond(json_response(
            403,
            json!({
                "ok": false,
                "error": { "code": "ip_not_allowed", "message": "Client IP is not allowed" }
            }),
        ));
        return;
    }
    if !host_allowed(&request, peer) {
        let _ = request.respond(json_response(403, json!({
            "ok": false,
            "error": { "code": "invalid_host", "message": "Host header does not match this machine" }
        })));
        return;
    }

    let path = request.url().split('?').next().unwrap_or("/");
    if request.method() == &Method::Get && path == "/v1/health" {
        let _ = request.respond(json_response(
            200,
            json!({
                "ok": true,
                "protocol": 1,
                "app": "nota-dev",
                "version": env!("CARGO_PKG_VERSION"),
                "features": [
                "editor.status", "documents.list", "documents.read", "documents.write", "documents.open",
                    "theme.reload", "plugin.reload", "plugin.inspect", "plugins.list",
                    "plugins.install", "plugins.uninstall", "plugins.setEnabled",
                    "plugins.checkUpdates", "plugins.update", "plugins.updateAll", "diagnostics.info",
                    "logs.read", "settings.read", "settings.write", "commands.invoke",
                    "preview.render", "capture.window"
                ]
            }),
        ));
        return;
    }
    if request.method() == &Method::Post && path == "/v1/auth" {
        if !has_json_content_type(&request) {
            let _ = request.respond(json_response(
                415,
                json!({
                    "ok": false,
                    "error": { "code": "json_required", "message": "Use application/json" }
                }),
            ));
            return;
        }
        let payload: Value = match body(&mut request)
            .and_then(|source| serde_json::from_slice(&source).map_err(|e| e.to_string()))
        {
            Ok(value) => value,
            Err(error) => {
                let _ = request.respond(json_response(
                    400,
                    json!({ "ok": false, "error": { "message": error } }),
                ));
                return;
            }
        };
        let now = Instant::now();
        let mut failures = bridge.failures.lock().unwrap();
        let entry = failures.entry(peer).or_insert((0, now));
        if now.duration_since(entry.1) > Duration::from_secs(60) {
            *entry = (0, now);
        }
        if entry.0 >= 8 {
            let _ = request.respond(json_response(429, json!({
                "ok": false,
                "error": { "code": "too_many_attempts", "message": "Too many authentication attempts" }
            })));
            return;
        }
        let password = payload
            .get("password")
            .and_then(Value::as_str)
            .unwrap_or("");
        if !verify_password(password, &bridge.password_hash) {
            entry.0 += 1;
            let _ = request.respond(json_response(401, json!({
                "ok": false,
                "error": { "code": "invalid_password", "message": "Invalid developer bridge password" }
            })));
            return;
        }
        failures.remove(&peer);
        drop(failures);
        let token = issue_session(&bridge.sessions, peer);
        let _ = request.respond(json_response(200, json!({ "ok": true, "token": token })));
        return;
    }
    if request.method() == &Method::Post && path == "/v1/rpc" {
        if !has_json_content_type(&request) {
            let _ = request.respond(json_response(
                415,
                json!({
                    "ok": false,
                    "error": { "code": "json_required", "message": "Use application/json" }
                }),
            ));
            return;
        }
        if !authenticated(&bridge.sessions, &request, peer) {
            let _ = request.respond(json_response(
                401,
                json!({
                    "ok": false,
                    "error": { "code": "unauthorized", "message": "Authenticate first" }
                }),
            ));
            return;
        }
        let payload: Value = match body(&mut request)
            .and_then(|source| serde_json::from_slice(&source).map_err(|e| e.to_string()))
        {
            Ok(value) => value,
            Err(error) => {
                let _ = request.respond(json_response(
                    400,
                    json!({ "ok": false, "error": { "message": error } }),
                ));
                return;
            }
        };
        let method = payload.get("method").and_then(Value::as_str).unwrap_or("");
        let params = payload.get("params").cloned().unwrap_or_else(|| json!({}));
        match run_rpc(app, method, &params) {
            Ok(result) => {
                let _ =
                    request.respond(json_response(200, json!({ "ok": true, "result": result })));
            }
            Err(error) => {
                let _ = request.respond(json_response(
                    200,
                    json!({
                        "ok": false,
                        "error": { "code": "rpc_failed", "message": error }
                    }),
                ));
            }
        }
        return;
    }
    let _ = request.respond(json_response(404, json!({ "ok": false })));
}

struct Bridge {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    failures: Arc<Mutex<HashMap<IpAddr, (u32, Instant)>>>,
    whitelist: Vec<String>,
    password_hash: String,
    active_requests: Arc<AtomicUsize>,
}

struct RequestSlot(Arc<AtomicUsize>);

impl Drop for RequestSlot {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

impl DevBridge {
    fn invoke_frontend(
        &self,
        app: &tauri::AppHandle,
        command: &str,
        args: Value,
    ) -> std::result::Result<Value, String> {
        let request_id = random_token();
        let (sender, receiver) = mpsc::channel();
        self.pending
            .lock()
            .unwrap()
            .insert(request_id.clone(), sender);
        if let Err(error) = app.emit(
            COMMAND_EVENT,
            json!({
                "requestId": request_id,
                "command": command,
                "args": args,
            }),
        ) {
            self.pending.lock().unwrap().remove(&request_id);
            return Err(format!("Could not reach the Nota frontend: {error}"));
        }
        match receiver.recv_timeout(COMMAND_TIMEOUT) {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(error)) => Err(error),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                self.pending.lock().unwrap().remove(&request_id);
                Err(format!(
                    "Nota did not answer {command} within {} seconds",
                    COMMAND_TIMEOUT.as_secs()
                ))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                self.pending.lock().unwrap().remove(&request_id);
                Err(format!("Nota disconnected while running {command}"))
            }
        }
    }

    pub fn respond(&self, request_id: &str, result: Option<Value>, error: Option<String>) -> bool {
        let Some(sender) = self.pending.lock().unwrap().remove(request_id) else {
            return false;
        };
        let reply = match error {
            Some(error) => Err(error),
            None => Ok(result.unwrap_or(Value::Null)),
        };
        sender.send(reply).is_ok()
    }

    pub fn status(&self) -> BridgeStatus {
        let security = read_security().unwrap_or_default();
        let guard = self.handle.lock().unwrap();
        let port = guard.as_ref().map_or(0, |handle| handle.port);
        let mut session_guard = self.sessions.lock().unwrap();
        let now = Instant::now();
        session_guard.retain(|_, session| session.expires > now);
        let sessions = session_guard.len();
        drop(session_guard);
        BridgeStatus {
            running: guard.is_some(),
            port,
            whitelist: guard
                .as_ref()
                .map_or_else(Vec::new, |handle| handle.whitelist.clone()),
            sessions,
            password_set: !security.password_hash.is_empty(),
        }
    }

    pub fn configure(
        &self,
        app: &tauri::AppHandle,
        password: Option<&str>,
        whitelist: &[String],
        port: u16,
    ) -> Result<BridgeStatus> {
        if port == 0 {
            return Err(NotaError::other(
                "Developer bridge port must be between 1 and 65535",
            ));
        }
        let whitelist = normalize_whitelist(whitelist)?;
        let mut security = read_security()?;
        if let Some(password) = password.filter(|value| !value.is_empty()) {
            security.password_hash = hash_password(password)?;
            write_security(&security)?;
        }
        if security.password_hash.is_empty() {
            return Err(NotaError::other(
                "Set a developer bridge password before enabling access",
            ));
        }
        self.stop();
        let binds = bind_addresses(&whitelist);
        if binds.is_empty() {
            return Err(NotaError::other(
                "Developer bridge whitelist produced no listen address",
            ));
        }
        let mut servers = Vec::new();
        for address in binds {
            servers.push(Arc::new(Server::http((address.ip(), port)).map_err(
                |e| NotaError::other(format!("Could not start developer bridge: {e}")),
            )?));
        }
        let stop = Arc::new(AtomicBool::new(false));
        let bridge = Arc::new(Bridge {
            sessions: self.sessions.clone(),
            failures: self.failures.clone(),
            whitelist,
            password_hash: security.password_hash,
            active_requests: self.active_requests.clone(),
        });
        let status_whitelist = bridge.whitelist.clone();
        let mut workers = Vec::new();
        for server in &servers {
            let server_for_thread = server.clone();
            let stop_for_thread = stop.clone();
            let app_for_thread = app.clone();
            let bridge_for_thread = bridge.clone();
            workers.push(thread::spawn(move || {
                while !stop_for_thread.load(Ordering::SeqCst) {
                    match server_for_thread.recv_timeout(Duration::from_millis(200)) {
                        Ok(Some(request)) => {
                            let app = app_for_thread.clone();
                            let bridge = bridge_for_thread.clone();
                            thread::spawn(move || handle_request(app, bridge, request));
                        }
                        Ok(None) => {}
                        Err(_) => break,
                    }
                }
            }));
        }
        *self.handle.lock().unwrap() = Some(BridgeHandle {
            stop,
            servers,
            workers,
            port,
            whitelist: status_whitelist,
        });
        Ok(self.status())
    }

    pub fn start_existing(
        &self,
        app: &tauri::AppHandle,
        whitelist: &[String],
        port: u16,
    ) -> Result<BridgeStatus> {
        self.configure(app, None, whitelist, port)
    }

    pub fn stop(&self) {
        let handle = self.handle.lock().unwrap().take();
        if let Some(handle) = handle {
            handle.stop.store(true, Ordering::SeqCst);
            for server in &handle.servers {
                server.unblock();
            }
            for worker in handle.workers {
                let _ = worker.join();
            }
        }
        self.pending.lock().unwrap().clear();
        self.sessions.lock().unwrap().clear();
        self.failures.lock().unwrap().clear();
    }

    pub fn sessions(&self) -> usize {
        self.sessions.lock().unwrap().len()
    }

    pub fn revoke_sessions(&self) {
        self.pending.lock().unwrap().clear();
        self.sessions.lock().unwrap().clear();
        self.failures.lock().unwrap().clear();
    }
}
