use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
#[cfg(test)]
use std::process::Command;
use std::process::{Child, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::document::DocId;
use crate::error::{NotaError, Result};
use crate::paths;
use crate::plugin::manifest::DevServerSpec;
use crate::proc::split_command;

mod probe;
pub use probe::{probe, Probe, ProbeState};

const LOG_TAIL: usize = 30;

const PROBE_TIMEOUT: Duration = Duration::from_millis(300);

pub const START_TIMEOUT: Duration = Duration::from_secs(180);

pub struct DevServerState(pub Mutex<HashMap<String, Server>>);

impl DevServerState {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    pub fn stop_all(&self) {
        let mut map = self.0.lock().unwrap();
        map.clear();
    }
}

impl Default for DevServerState {
    fn default() -> Self {
        Self::new()
    }
}

pub struct Server {
    child: Child,
    info: Info,

    log: Arc<Mutex<Vec<String>>>,

    doc: Option<DocId>,
}

impl Drop for Server {
    fn drop(&mut self) {
        kill_tree(&mut self.child);

        if let Some(entry) = &self.info.entry {
            let _ = std::fs::remove_file(entry);
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Info {
    pub plugin: String,
    pub port: u16,

    pub url: String,

    pub entry: Option<String>,

    pub alive: bool,
}

pub fn start(
    state: &DevServerState,
    plugin: &str,
    spec: &DevServerSpec,
    root: Option<PathBuf>,
    doc: Option<DocId>,
    text: &str,
) -> Result<Info> {
    stop(state, plugin);

    let port = pick_port()?;
    let entry = write_entry(spec, plugin, root.as_deref(), doc, text)?;
    let (child, log) = spawn(spec, entry.as_deref(), port)?;

    let info = Info {
        plugin: plugin.to_owned(),
        port,

        url: format!("http://127.0.0.1:{port}/"),
        entry: entry.as_ref().map(|p| p.to_string_lossy().into_owned()),
        alive: true,
    };

    if let Some(p) = &entry {
        push_log(&log, format!("[nota] entry file {}", p.display()));
    }

    let log2 = log.clone();

    {
        let mut map = state.0.lock().unwrap();
        map.insert(
            plugin.to_owned(),
            Server {
                child,
                info: info.clone(),
                log,
                doc,
            },
        );
    }

    let wait = START_TIMEOUT;

    match wait_ready(state, plugin, port, wait) {
        Wait::Ready => {
            push_log(&log2, format!("[nota] port {port} is ready"));
        }
        why => {
            let tail = log_tail(state, plugin);
            stop(state, plugin);
            return Err(NotaError::other(match why {



                Wait::Died => format!("The server process exited before its port became ready. Last output:\n{tail}"),
                Wait::Gone => "The server was stopped during startup.".to_owned(),

                Wait::Ready | Wait::Timeout => format!(
                    "The server started but its port did not open within {} seconds. Last output:\n{tail}",
                    wait.as_secs()
                ),
            }));
        }
    }

    if let Some(server) = state.0.lock().unwrap().get_mut(plugin) {
        server.info.url = reachable_url(port);
    }

    match status(state, plugin) {
        Some(i) => Ok(i),
        None => Err(NotaError::other("The server was stopped during startup")),
    }
}

pub fn refresh(state: &DevServerState, doc: DocId, text: &str) {
    let map = state.0.lock().unwrap();
    for server in map.values() {
        if server.doc != Some(doc) {
            continue;
        }
        let Some(entry) = &server.info.entry else {
            continue;
        };

        let _ = write_file(Path::new(entry), text);
    }
}

enum Wait {
    Ready,

    Died,

    Gone,

    Timeout,
}

fn wait_ready(state: &DevServerState, plugin: &str, port: u16, wait: Duration) -> Wait {
    let deadline = Instant::now() + wait;
    loop {
        if port_open(port) {
            return Wait::Ready;
        }
        match status(state, plugin) {
            None => return Wait::Gone,
            Some(s) if !s.alive => return Wait::Died,
            Some(_) => {}
        }
        if Instant::now() >= deadline {
            return Wait::Timeout;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

pub fn stop(state: &DevServerState, plugin: &str) {
    let taken = state.0.lock().unwrap().remove(plugin);
    drop(taken);
}

pub fn status(state: &DevServerState, plugin: &str) -> Option<Info> {
    let mut map = state.0.lock().unwrap();
    let server = map.get_mut(plugin)?;
    server.info.alive = server.child.try_wait().ok().flatten().is_none();
    Some(server.info.clone())
}

pub fn log_tail(state: &DevServerState, plugin: &str) -> String {
    let map = state.0.lock().unwrap();
    match map.get(plugin) {
        Some(s) => s.log.lock().unwrap().join("\n"),
        None => String::new(),
    }
}

fn write_entry(
    spec: &DevServerSpec,
    plugin: &str,
    root: Option<&Path>,
    doc: Option<DocId>,
    body: &str,
) -> Result<Option<PathBuf>> {
    let Some(name) = doc.and_then(|d| spec.entry_name(d.0)) else {
        return Ok(None);
    };

    if let Some(dir) = root {
        if dir.is_dir() {
            let candidate = dir.join(&name);
            if write_file(&candidate, body).is_ok() {
                return Ok(Some(candidate));
            }
        }
    }

    let fallback = paths::data_dir()?
        .join("devserver")
        .join(plugin)
        .join(&name);
    if let Some(parent) = fallback.parent() {
        paths::ensure_dir(parent)?;
    }
    write_file(&fallback, body)?;
    Ok(Some(fallback))
}

fn write_file(path: &Path, body: &str) -> Result<()> {
    std::fs::write(path, body).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}

fn spawn(
    spec: &DevServerSpec,
    entry: Option<&Path>,
    port: u16,
) -> Result<(Child, Arc<Mutex<Vec<String>>>)> {
    let cmd = spec.command();

    let (program, mut args) =
        split_command(&cmd).ok_or_else(|| NotaError::other("The startup command is empty"))?;

    let entry_str = entry.map(|p| p.to_string_lossy().into_owned());
    args.extend(spec.args.iter().map(|a| {
        a.replace("{port}", &port.to_string())
            .replace("{entry}", entry_str.as_deref().unwrap_or(""))
    }));

    let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    push_log(&log, format!("[nota] $ {program} {}", args.join(" ")));

    let cwd = entry.and_then(|p| p.parent().map(Path::to_path_buf));

    let mut command = crate::proc::background_command(&program);
    command
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("BROWSER", "none")
        .env("NO_COLOR", "1");
    if let Some(dir) = &cwd {
        command.current_dir(dir);
    }

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = crate::proc::spawn_retrying(&mut command).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            NotaError::other(format!(
                "Could not find `{program}`; install it according to its documentation"
            ))
        } else {
            NotaError::other(format!("Could not start the process: {e}"))
        }
    })?;

    for pipe in [
        child
            .stdout
            .take()
            .map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
        child
            .stderr
            .take()
            .map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
    ]
    .into_iter()
    .flatten()
    {
        let log = log.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(pipe)
                .lines()
                .map_while(std::result::Result::ok)
            {
                push_log(&log, line);
            }
        });
    }

    Ok((child, log))
}

fn kill_tree(child: &mut Child) {
    let pid = child.id();
    crate::proc::kill_group(pid);

    let _ = child.kill();
    let _ = child.wait();
}

fn push_log(log: &Arc<Mutex<Vec<String>>>, line: String) {
    let mut v = log.lock().unwrap();
    if v.len() >= LOG_TAIL {
        v.remove(0);
    }
    v.push(line);
}

fn pick_port() -> Result<u16> {
    for _ in 0..10 {
        let Ok(listener) = TcpListener::bind((Ipv6Addr::LOCALHOST, 0)) else {
            break;
        };
        let Ok(port) = listener.local_addr().map(|a| a.port()) else {
            break;
        };
        drop(listener);

        if TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_ok() {
            return Ok(port);
        }
    }
    Err(NotaError::other(
        "Could not find a free port after trying IPv4 and IPv6",
    ))
}

fn probe_addrs(port: u16) -> Vec<SocketAddr> {
    let mut out: Vec<SocketAddr> = Vec::new();
    if let Ok(addrs) = ("localhost", port).to_socket_addrs() {
        out.extend(addrs);
    }
    out.push(SocketAddr::from((Ipv6Addr::LOCALHOST, port)));
    out.push(SocketAddr::from((Ipv4Addr::LOCALHOST, port)));
    out.dedup();
    out
}

fn port_open(port: u16) -> bool {
    probe_addrs(port)
        .into_iter()
        .any(|addr| TcpStream::connect_timeout(&addr, PROBE_TIMEOUT).is_ok())
}

fn reachable_url(port: u16) -> String {
    let v4 = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let v6 = SocketAddr::from((Ipv6Addr::LOCALHOST, port));
    if TcpStream::connect_timeout(&v4, PROBE_TIMEOUT).is_ok() {
        return format!("http://127.0.0.1:{port}/");
    }
    if TcpStream::connect_timeout(&v6, PROBE_TIMEOUT).is_ok() {
        return format!("http://localhost:{port}/");
    }

    format!("http://127.0.0.1:{port}/")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-devserver-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("\u{5efa}\u{4e34}\u{65f6}\u{76ee}\u{5f55}");
        dir
    }

    fn spec(entry: Option<&str>) -> DevServerSpec {
        DevServerSpec {
            cmd: "npx @slidev/cli".to_owned(),
            cmd_env: Some(
                "NOTA_\u{6d4b}\u{8bd5}_\u{7edd}\u{4e0d}\u{5b58}\u{5728}\u{7684}\u{53d8}\u{91cf}"
                    .to_owned(),
            ),
            args: vec![
                "{entry}".to_owned(),
                "--port".to_owned(),
                "{port}".to_owned(),
            ],
            entry: entry.map(str::to_owned),
            probe_args: None,
            probe_env: None,
            project_marker: None,
        }
    }

    #[test]
    fn tiao_chu_lai_de_duan_kou_liang_tao_zhan_dou_neng_bang() {
        let mut last = String::new();
        for _ in 0..10 {
            let port = pick_port().expect("\u{5e94}\u{8be5}\u{6311}\u{5f97}\u{5230}");
            assert!(port > 0);

            let v6 = TcpListener::bind((Ipv6Addr::LOCALHOST, port));
            let v4 = TcpListener::bind((Ipv4Addr::LOCALHOST, port));
            if v6.is_ok() && v4.is_ok() {
                return;
            }
            last = format!(
                "\u{7aef}\u{53e3} {port}\u{ff1a}v6={:?} v4={:?}",
                v6.as_ref().err(),
                v4.as_ref().err()
            );
        }
        panic!("\u{8fde}\u{8bd5} 10 \u{4e2a}\u{7aef}\u{53e3}\u{90fd}\u{6ca1}\u{80fd}\u{540c}\u{65f6}\u{7ed1}\u{4e0a} v6/v4\u{2014}\u{2014}\u{8fd9}\u{5df2}\u{7ecf}\u{4e0d}\u{662f}\u{8d5b}\u{8dd1}\u{4e86}\u{ff1a}{last}");
    }

    #[test]
    fn ru_kou_write_zai_xiang_mu_root_li() {
        let dir = temp_dir("entry");
        let path = write_entry(
            &spec(Some(".nota-slidev-{doc}.md")),
            "nota.slidev",
            Some(&dir),
            Some(DocId(7)),
            "# \u{4e00}\u{9875}\n",
        )
        .expect("\u{5e94}\u{8be5}\u{5199}\u{5f97}\u{8fdb}\u{53bb}")
        .expect("\u{6709}\u{5165}\u{53e3}");
        assert_eq!(path.parent(), Some(dir.as_path()));
        assert_eq!(path.file_name().unwrap(), ".nota-slidev-7.md");
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "# \u{4e00}\u{9875}\n"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn xiang_mu_root_write_bu_jin_qu_shi_tui_hui_shu_ju_directory() {
        let missing = std::env::temp_dir()
            .join("nota-devserver-\u{4e0d}\u{5b58}\u{5728}-\u{7684}\u{76ee}\u{5f55}");
        let path = write_entry(
            &spec(Some("\u{5165}\u{53e3}-{doc}.md")),
            "nota.\u{6d4b}\u{8bd5}",
            Some(&missing),
            Some(DocId(8)),
            "# \u{9000}\u{8def}\n",
        )
        .expect("\u{9000}\u{56de}\u{6570}\u{636e}\u{76ee}\u{5f55}\u{4e5f}\u{8981}\u{6210}")
        .expect("\u{6709}\u{5165}\u{53e3}");
        assert!(
            path.starts_with(paths::data_dir().unwrap()),
            "\u{5e94}\u{8be5}\u{843d}\u{5728}\u{6570}\u{636e}\u{76ee}\u{5f55}\u{4e0b}\u{ff0c}\u{5b9e}\u{9645} {}",
            path.display()
        );
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "# \u{9000}\u{8def}\n"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn mei_declaration_ru_kou_file_shi_bu_write_file() {
        let dir = temp_dir("no-entry");
        let out = write_entry(
            &spec(None),
            "nota.\u{6d4b}\u{8bd5}",
            Some(&dir),
            Some(DocId(1)),
            "\u{6b63}\u{6587}",
        )
        .unwrap();
        assert!(out.is_none());
        assert_eq!(
            std::fs::read_dir(&dir).unwrap().count(),
            0,
            "\u{4e00}\u{4e2a}\u{6587}\u{4ef6}\u{90fd}\u{4e0d}\u{8be5}\u{5199}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn ru_kou_name_gen_zhe_document_zou_bu_hui_hu_xiang_fu_gai() {
        let s = spec(Some(".nota-preview-{doc}.md"));
        assert_ne!(s.entry_name(1), s.entry_name(2));
        assert!(s.entry_name(1).unwrap().starts_with('.'));
    }

    #[test]
    fn qi_dong_ming_ling_de_huan_jing_bian_liang_xuan_niu_you_xian() {
        let s = spec(None);
        assert_eq!(s.command(), "npx @slidev/cli");
    }

    #[test]
    fn ri_zhi_huan_zhi_liu_zui_hou_ji_xing() {
        let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        for i in 0..(LOG_TAIL + 10) {
            push_log(&log, format!("\u{7b2c} {i} \u{884c}"));
        }
        let v = log.lock().unwrap();
        assert_eq!(v.len(), LOG_TAIL);
        assert_eq!(
            v.last().unwrap(),
            &format!("\u{7b2c} {} \u{884c}", LOG_TAIL + 9)
        );
        assert_eq!(v.first().unwrap(), &format!("\u{7b2c} {} \u{884c}", 10));
    }

    #[test]
    fn mei_zai_pao_de_shi_hou_wen_shen_me_dou_shi_kong_de() {
        let state = DevServerState::new();
        assert!(status(&state, "nota.\u{6d4b}\u{8bd5}").is_none());
        assert_eq!(log_tail(&state, "nota.\u{6d4b}\u{8bd5}"), "");

        stop(&state, "nota.\u{6d4b}\u{8bd5}");
    }

    #[test]
    fn document_bian_le_zhi_shua_ding_zhe_ta_de_na_yi_chang() {
        let dir = temp_dir("refresh");
        let ru_kou = dir.join("\u{5165}\u{53e3}.md");
        std::fs::write(&ru_kou, "\u{65e7}").unwrap();

        let state = DevServerState::new();
        let mut cmd = Command::new("sleep");
        cmd.arg("300").stdout(Stdio::null()).stderr(Stdio::null());
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        let child = cmd.spawn().expect("\u{8d77} sleep");
        let info = Info {
            plugin: "nota.\u{6d4b}\u{8bd5}".to_owned(),
            port: 1,
            url: "http://localhost:1/".to_owned(),
            entry: Some(ru_kou.display().to_string()),
            alive: true,
        };
        state.0.lock().unwrap().insert(
            "nota.\u{6d4b}\u{8bd5}".to_owned(),
            Server {
                child,
                info,
                log: Arc::new(Mutex::new(Vec::new())),
                doc: Some(DocId(7)),
            },
        );

        refresh(&state, DocId(8), "\u{522b}\u{4eba}\u{7684}\u{6b63}\u{6587}");
        assert_eq!(std::fs::read_to_string(&ru_kou).unwrap(), "\u{65e7}");

        refresh(&state, DocId(7), "\u{65b0}\u{6b63}\u{6587}");
        assert_eq!(
            std::fs::read_to_string(&ru_kou).unwrap(),
            "\u{65b0}\u{6b63}\u{6587}"
        );

        state.stop_all();
        assert!(
            !ru_kou.exists(),
            "\u{6536}\u{644a}\u{8be5}\u{628a}\u{5165}\u{53e3}\u{6587}\u{4ef6}\u{5220}\u{6389}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn receive_tan_zhi_hou_jin_cheng_zhen_mei_le() {
        let mut cmd = Command::new("sleep");
        cmd.arg("300").stdout(Stdio::null()).stderr(Stdio::null());
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        let mut child = cmd.spawn().expect("\u{8d77} sleep");
        let pid = child.id();
        kill_tree(&mut child);

        let alive = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        assert!(!alive, "\u{8fdb}\u{7a0b}\u{7ec4}\u{5e94}\u{8be5}\u{5df2}\u{7ecf}\u{88ab}\u{6740}\u{6389}\u{4e86}");
    }
}
