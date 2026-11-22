use std::ffi::OsStr;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

pub(crate) fn background_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    hide_console_window(&mut command);
    command
}

#[cfg(windows)]
pub(crate) fn hide_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(crate) fn hide_console_window(_command: &mut Command) {}

pub(crate) fn split_command(cmd: &str) -> Option<(String, Vec<String>)> {
    let mut parts = cmd.split_whitespace();
    let program = parts.next()?;
    Some((program.to_string(), parts.map(str::to_string).collect()))
}

pub(crate) fn command_or_default(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

pub(crate) fn kill_group(pid: u32) {
    let _ = background_command(kill_program())
        .args(kill_args(pid))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(unix)]
fn kill_program() -> &'static str {
    "kill"
}

#[cfg(unix)]
fn kill_args(pid: u32) -> Vec<String> {
    vec!["-TERM".to_string(), format!("-{pid}")]
}

#[cfg(windows)]
fn kill_program() -> &'static str {
    "taskkill"
}

#[cfg(windows)]
fn kill_args(pid: u32) -> Vec<String> {
    vec![
        "/T".to_string(),
        "/F".to_string(),
        "/PID".to_string(),
        pid.to_string(),
    ]
}

pub(crate) struct RunOpts {
    pub cwd: Option<PathBuf>,

    pub envs: Vec<(String, String)>,

    pub stdin: Option<String>,
    pub timeout: Duration,
}

impl RunOpts {
    pub(crate) fn timeout(timeout: Duration) -> Self {
        Self {
            cwd: None,
            envs: Vec::new(),
            stdin: None,
            timeout,
        }
    }

    pub(crate) fn cwd(mut self, dir: impl Into<PathBuf>) -> Self {
        self.cwd = Some(dir.into());
        self
    }

    pub(crate) fn env(mut self, key: &str, value: &str) -> Self {
        self.envs.push((key.to_string(), value.to_string()));
        self
    }

    pub(crate) fn stdin(mut self, text: impl Into<String>) -> Self {
        self.stdin = Some(text.into());
        self
    }
}

pub(crate) fn spawn_retrying(command: &mut Command) -> std::io::Result<Child> {
    const WAIT: [Duration; 3] = [
        Duration::from_millis(5),
        Duration::from_millis(20),
        Duration::from_millis(60),
    ];

    hide_console_window(command);
    let mut base_record_word = 0;
    loop {
        match command.spawn() {
            Ok(child) => return Ok(child),
            Err(e) if file_validate_passive_write(&e) && base_record_word < WAIT.len() => {
                std::thread::sleep(WAIT[base_record_word]);
                base_record_word += 1;
            }
            Err(e) => return Err(e),
        }
    }
}

#[cfg(unix)]
fn file_validate_passive_write(e: &std::io::Error) -> bool {
    e.raw_os_error() == Some(26)
}

#[cfg(not(unix))]
fn file_validate_passive_write(_: &std::io::Error) -> bool {
    false
}

#[derive(Debug)]
pub(crate) enum Ran {
    Done {
        ok: bool,
        stdout: String,
        stderr: String,
    },

    NoProgram,

    Timeout,

    Failed(String),
}

pub(crate) fn run_capture(program: &str, args: &[String], opts: RunOpts) -> Ran {
    let mut command = background_command(program);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command.stdin(if opts.stdin.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    });
    for (k, v) in &opts.envs {
        command.env(k, v);
    }
    if let Some(dir) = &opts.cwd {
        command.current_dir(dir);
    }

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = match spawn_retrying(&mut command) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ran::NoProgram,
        Err(e) => return Ran::Failed(format!("Could not start `{program}`: {e}")),
    };

    if let Some(text) = opts.stdin {
        if let Some(mut four) = child.stdin.take() {
            std::thread::spawn(move || {
                let _ = four.write_all(text.as_bytes());

                drop(four);
            });
        }
    }

    let pid = child.id();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    match rx.recv_timeout(opts.timeout) {
        Ok(Ok(out)) => Ran::Done {
            ok: out.status.success(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        },
        Ok(Err(e)) => Ran::Failed(format!("Could not read `{program}` output: {e}")),
        Err(_) => {
            kill_group(pid);
            Ran::Timeout
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_name_zero_by_empty_percent_part_word() {
        assert_eq!(
            split_command("npx @slidev/cli").unwrap(),
            ("npx".to_string(), vec!["@slidev/cli".to_string()])
        );

        assert!(split_command("   ").is_none());
    }

    #[test]
    fn provided_is_validate_enter_success_group() {
        #[cfg(unix)]
        {
            let args = kill_args(4321);
            assert_eq!(args, vec!["-TERM".to_string(), "-4321".to_string()]);
            assert!(
                args[1].starts_with('-'),
                "\u{7ec4}\u{53f7}\u{5fc5}\u{987b}\u{5e26}\u{8d1f}\u{53f7}"
            );
            assert_eq!(kill_program(), "kill");
        }
        #[cfg(windows)]
        {
            assert_eq!(kill_args(4321), vec!["/T", "/F", "/PID", "4321"]);
        }
    }

    #[test]
    fn replace_static_edit_two_has_thread_and_default_value() {
        assert_eq!(
            command_or_default(
                "NOTA_\u{7edd}\u{5bf9}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}\u{53d8}\u{91cf}",
                "\u{9ed8}\u{8ba4}\u{547d}\u{4ee4}"
            ),
            "\u{9ed8}\u{8ba4}\u{547d}\u{4ee4}"
        );
    }

    #[test]
    #[cfg(unix)]
    fn file_validate_passive_other_person_write_is_wait_one_lower_at_start() {
        use std::io::Write as _;
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("nota-proc-test-busy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let call_current = dir.join("\u{5047}\u{547d}\u{4ee4}");
        let by_main = {
            let mut f = std::fs::File::create(&call_current).unwrap();
            f.write_all("#!/bin/sh\necho \u{8d77}\u{6765}\u{4e86}\n".as_bytes())
                .unwrap();
            std::fs::set_permissions(&call_current, std::fs::Permissions::from_mode(0o755))
                .unwrap();
            f
        };
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(40));
            drop(by_main);
        });

        let ran = run_capture(
            &call_current.display().to_string(),
            &[],
            RunOpts::timeout(Duration::from_secs(10)),
        );
        match ran {
            Ran::Done { ok, stdout, .. } => {
                assert!(ok);
                assert!(stdout.contains("\u{8d77}\u{6765}\u{4e86}"), "{stdout}");
            }
            other => panic!("\u{8be5}\u{7b49}\u{4e00}\u{4e0b}\u{4e4b}\u{540e}\u{8d77}\u{6765}\u{ff0c}\u{5374}\u{662f} {other:?}"),
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn run_to_program_character_record_data_out() {
        let out = run_capture(
            "printf",
            &["%s".to_string(), "1.2.3".to_string()],
            RunOpts::timeout(Duration::from_secs(10)),
        );
        match out {
            Ran::Done { ok, stdout, .. } => {
                assert!(ok);
                assert_eq!(stdout, "1.2.3");
            }
            other => panic!("\u{5e94}\u{8be5}\u{662f}\u{8dd1}\u{5b8c}\u{4e86}\u{ff1a}{other:?}"),
        }
    }

    #[test]
    fn find_not_to_program_is_single_read_one_when() {
        let out = run_capture(
            "nota-\u{7edd}\u{5bf9}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}\u{547d}\u{4ee4}",
            &[],
            RunOpts::timeout(Duration::from_secs(5)),
        );
        assert!(matches!(out, Ran::NoProgram), "{out:?}");
    }

    #[test]
    #[cfg(unix)]
    fn attach_main_name_zero_return_overflow_is_two_not_is_one_only_wait() {
        let out = run_capture(
            "sleep",
            &["30".to_string()],
            RunOpts::timeout(Duration::from_millis(300)),
        );
        assert!(
            matches!(out, Ran::Timeout),
            "\u{5e94}\u{8be5}\u{662f}\u{8d85}\u{65f6}\u{ff1a}{out:?}"
        );
    }

    #[test]
    #[cfg(unix)]
    fn table_ready_data_into_position_enter_get() {
        let out = run_capture(
            "cat",
            &[],
            RunOpts::timeout(Duration::from_secs(10))
                .stdin("# \u{6807}\u{9898}\n\u{6b63}\u{6587} \u{1f389}\n"),
        );
        match out {
            Ran::Done { ok, stdout, .. } => {
                assert!(ok);
                assert_eq!(stdout, "# \u{6807}\u{9898}\n\u{6b63}\u{6587} \u{1f389}\n");
            }
            other => panic!("\u{5e94}\u{8be5}\u{662f}\u{8dd1}\u{5b8c}\u{4e86}\u{ff1a}{other:?}"),
        }
    }

    #[test]
    #[cfg(unix)]
    fn derive_out_invalid_zero_is_handle_data_out_stream_lower_incoming() {
        let out = run_capture(
            "sh",
            &[
                "-c".to_string(),
                "echo \u{574f}\u{6d88}\u{606f} >&2; exit 3".to_string(),
            ],
            RunOpts::timeout(Duration::from_secs(10)),
        );
        match out {
            Ran::Done { ok, stderr, .. } => {
                assert!(!ok);
                assert!(stderr.contains("\u{574f}\u{6d88}\u{606f}"), "{stderr}");
            }
            other => panic!("\u{5e94}\u{8be5}\u{662f}\u{8dd1}\u{5b8c}\u{4e86}\u{4f46}\u{5931}\u{8d25}\u{ff1a}{other:?}"),
        }
    }
}
