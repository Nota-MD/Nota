use std::ffi::{OsStr, OsString};
use std::path::PathBuf;

use crate::error::Result;

#[cfg(unix)]
use crate::error::NotaError;
#[cfg(unix)]
use std::io::{Read, Write};

#[cfg(unix)]
const MAX_FRAME: u64 = 64 * 1024;

pub enum Claim {
    First(Listener),

    Forwarded,
}

#[cfg(unix)]
pub struct Listener {
    socket: std::os::unix::net::UnixListener,
    path: PathBuf,
}

#[cfg(unix)]
impl Listener {
    pub fn path(&self) -> &std::path::Path {
        &self.path
    }

    pub fn receive(&self) -> Option<Option<OsString>> {
        let (connection, _) = self.socket.accept().ok()?;
        let mut buffer = Vec::new();

        connection.take(MAX_FRAME).read_to_end(&mut buffer).ok()?;
        if buffer.is_empty() {
            return Some(None);
        }
        Some(Some(std::os::unix::ffi::OsStringExt::from_vec(buffer)))
    }
}

#[cfg(unix)]
pub fn socket_path() -> Result<PathBuf> {
    let base = match dirs::runtime_dir() {
        Some(d) => d,
        None => crate::paths::data_dir()?,
    };
    Ok(base.join(format!("{}.sock", crate::distribution_profile::BINARY_NAME)))
}

#[cfg(unix)]
pub fn claim(requested: Option<&OsStr>) -> Result<Claim> {
    let path = socket_path()?;
    if let Some(parent) = path.parent() {
        crate::paths::ensure_dir(parent)?;
    }

    if forward(&path, requested).is_ok() {
        return Ok(Claim::Forwarded);
    }

    let _ = std::fs::remove_file(&path);

    let socket = std::os::unix::net::UnixListener::bind(&path).map_err(|e| {
        NotaError::Other(format!(
            "Single-instance socket could not bind {}: {e}",
            path.display()
        ))
    })?;
    Ok(Claim::First(Listener { socket, path }))
}

#[cfg(unix)]
fn forward(path: &std::path::Path, file: Option<&OsStr>) -> std::io::Result<()> {
    let mut stream = std::os::unix::net::UnixStream::connect(path)?;
    if let Some(f) = file {
        stream.write_all(std::os::unix::ffi::OsStrExt::as_bytes(f))?;
    }

    let _ = stream.shutdown(std::net::Shutdown::Write);
    Ok(())
}

pub const EVENT: &str = "nota:second-instance";

#[derive(Default)]
pub struct Endpoint(pub std::sync::Mutex<Option<PathBuf>>);

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Payload {
    pub path: Option<String>,

    pub error: Option<String>,
}

#[cfg(unix)]
impl Payload {
    fn raise_window() -> Self {
        Self {
            path: None,
            error: None,
        }
    }

    fn open(path: String) -> Self {
        Self {
            path: Some(path),
            error: None,
        }
    }

    fn error(error: String) -> Self {
        Self {
            path: None,
            error: Some(error),
        }
    }
}

#[cfg(unix)]
pub fn start(app: tauri::AppHandle, listener: Listener) {
    use tauri::{Emitter, Manager};

    if let Some(state) = app.try_state::<Endpoint>() {
        if let Ok(mut slot) = state.0.lock() {
            *slot = Some(listener.path().to_path_buf());
        }
    }

    std::thread::spawn(move || loop {
        let Some(incoming) = listener.receive() else {
            continue;
        };

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }

        let payload = match incoming {
            None => Payload::raise_window(),
            Some(raw) => match crate::paths::path_to_string(&PathBuf::from(raw)) {
                Ok(path) => Payload::open(path),

                Err(error) => Payload::error(error.to_string()),
            },
        };
        let _ = app.emit(EVENT, payload);
    });
}

#[cfg(unix)]
pub fn cleanup(path: &std::path::Path) {
    let _ = std::fs::remove_file(path);
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::ffi::{OsStrExt, OsStringExt};

    fn temp_path(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("nota-si-test-{}-{name}.sock", std::process::id()));
        let _ = std::fs::remove_file(&p);
        p
    }

    fn bind(path: &std::path::Path) -> Listener {
        let _ = std::fs::remove_file(path);
        let socket =
            std::os::unix::net::UnixListener::bind(path).expect("could not bind temporary socket");
        Listener {
            socket,
            path: path.to_path_buf(),
        }
    }

    fn send(path: &std::path::Path, bytes: &[u8]) {
        let mut stream = std::os::unix::net::UnixStream::connect(path).unwrap();
        stream.write_all(bytes).unwrap();
        let _ = stream.shutdown(std::net::Shutdown::Write);
    }

    fn receive_path(listener: &Listener) -> Option<OsString> {
        listener.receive().expect("expected one connection")
    }

    #[test]
    fn cannot_connect_without_a_listener() {
        let p = temp_path("unused");
        assert!(std::os::unix::net::UnixStream::connect(&p).is_err());
    }

    #[test]
    fn forwarded_path_is_received_unchanged() {
        let p = temp_path("round-trip");
        let listener = bind(&p);
        let sender = std::thread::spawn({
            let p = p.clone();
            move || send(&p, b"/tmp/\xe7\xac\x94\xe8\xae\xb0.md")
        });
        let received = receive_path(&listener).expect("expected one path");
        sender.join().unwrap();
        assert_eq!(received.as_bytes(), b"/tmp/\xe7\xac\x94\xe8\xae\xb0.md");
        cleanup(listener.path());
    }

    #[test]
    fn empty_frame_is_valid_but_not_a_file() {
        let p = temp_path("empty");
        let listener = bind(&p);
        send(&p, b"");
        assert!(receive_path(&listener).is_none());
        cleanup(listener.path());
    }

    #[test]
    fn non_utf8_path_is_received_byte_for_byte() {
        let p = temp_path("bytes");
        let listener = bind(&p);
        let raw = OsString::from_vec(vec![
            b'/', b't', b'm', b'p', b'/', 0xff, 0xfe, b'.', b'm', b'd',
        ]);
        let sender = std::thread::spawn({
            let p = p.clone();
            let raw = raw.clone();
            move || send(&p, raw.as_bytes())
        });
        let received = receive_path(&listener).expect("expected one path");
        sender.join().unwrap();
        assert_eq!(received.as_bytes(), raw.as_bytes());
        assert!(
            received.to_string_lossy().contains('\u{fffd}'),
            "this path is intentionally not UTF-8"
        );
        cleanup(listener.path());
    }

    #[test]
    fn one_bad_connection_does_not_affect_the_next() {
        let p = temp_path("bad-then-good");
        let listener = bind(&p);
        send(&p, b"");
        assert!(receive_path(&listener).is_none());
        send(&p, b"");
        assert!(
            receive_path(&listener).is_none(),
            "the second connection shows the loop is still alive"
        );
        cleanup(listener.path());
    }

    #[test]
    fn cleanup_returns_the_socket_to_unreachable() {
        let p = temp_path("active");
        let listener = bind(&p);
        assert!(std::os::unix::net::UnixStream::connect(&p).is_ok());
        cleanup(listener.path());
        assert!(
            std::os::unix::net::UnixStream::connect(&p).is_err(),
            "cleanup must remove the socket"
        );
    }
}

#[cfg(not(unix))]
pub struct Listener {
    path: PathBuf,
}

#[cfg(not(unix))]
impl Listener {
    pub fn path(&self) -> &std::path::Path {
        &self.path
    }

    pub fn receive(&self) -> Option<Option<OsString>> {
        None
    }
}

#[cfg(not(unix))]
pub fn claim(_requested: Option<&OsStr>) -> Result<Claim> {
    Ok(Claim::First(Listener {
        path: PathBuf::new(),
    }))
}

#[cfg(not(unix))]
pub fn start(_app: tauri::AppHandle, _listener: Listener) {}

#[cfg(not(unix))]
pub fn cleanup(_path: &std::path::Path) {}
