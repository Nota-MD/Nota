use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::plugin::manifest::DevServerSpec;
use crate::proc::{run_capture, split_command, Ran, RunOpts};

const CHECK_TIMEOUT: Duration = Duration::from_secs(20);

const DETAIL_LINES: usize = 8;
const DETAIL_COL: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProbeState {
    Ready,

    Missing,

    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct Probe {
    pub state: ProbeState,

    pub command: String,

    pub version: Option<String>,

    pub detail: String,

    pub root: Option<String>,

    pub marker_found: bool,

    pub need_found: Option<bool>,
}

pub fn probe(spec: &DevServerSpec, root: Option<&Path>, need: Option<&str>) -> Probe {
    let command = spec.command();
    let mut out = Probe {
        state: ProbeState::Unknown,
        command: command.clone(),
        version: None,
        detail: String::new(),
        root: root.map(|p| p.display().to_string()),
        marker_found: true,
        need_found: None,
    };

    let Some((program, mut args)) = split_command(&command) else {
        out.detail = format!(
            "`{}` is empty; there is no command to run.",
            spec.cmd_env.as_deref().unwrap_or("Startup command")
        );
        return out;
    };
    args.extend(spec.probe_args());

    let cwd = existing_dir(root);
    match run_version(spec, &program, &args, cwd.as_deref()) {
        Check::Ok(version) => {
            out.version = version;
            out.state = ProbeState::Ready;
        }
        Check::NoProgram => {
            out.state = ProbeState::Missing;
            out.detail = format!("Could not find `{program}`.");
        }
        Check::Timeout => {
            out.state = ProbeState::Unknown;
            out.detail = format!(
                "`{command}` did not respond within {} seconds; the probe stopped without concluding that it is missing.",
                CHECK_TIMEOUT.as_secs()
            );
        }
        Check::Failed(text) => {
            out.state = ProbeState::Missing;
            out.detail = text;
        }
    }

    if let Some(marker) = &spec.project_marker {
        out.marker_found = root.is_some_and(|dir| marker_installed(dir, marker));
    }

    if let Some(rel) = need {
        if and_method_item_pair_path(rel) {
            out.need_found = Some(root.is_some_and(|dir| has_layer(dir, rel)));
        }
    }

    out
}

fn has_layer(root: &Path, rel: &str) -> bool {
    root.ancestors().any(|d| d.join(rel).exists())
}

fn and_method_item_pair_path(rel: &str) -> bool {
    !rel.is_empty()
        && !rel.contains('\\')
        && rel
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
}

#[derive(Debug)]
enum Check {
    Ok(Option<String>),

    NoProgram,

    Failed(String),
    Timeout,
}

fn run_version(spec: &DevServerSpec, program: &str, args: &[String], cwd: Option<&Path>) -> Check {
    let mut opts = RunOpts::timeout(CHECK_TIMEOUT).env("NO_COLOR", "1");
    if let Some(dir) = cwd {
        opts = opts.cwd(dir);
    }

    for (k, v) in spec.probe_env.iter().flatten() {
        opts = opts.env(k, v);
    }

    match run_capture(program, args, opts) {
        Ran::Done {
            ok: true, stdout, ..
        } => Check::Ok(last_line(&stdout)),
        Ran::Done {
            ok: false,
            stdout,
            stderr,
        } => {
            if stderr.trim().is_empty() {
                Check::Failed(tail_of(&stdout))
            } else {
                Check::Failed(tail_of(&stderr))
            }
        }

        Ran::Timeout => Check::Timeout,
        Ran::NoProgram => Check::NoProgram,
        Ran::Failed(msg) => Check::Failed(msg),
    }
}

fn marker_installed(dir: &Path, marker: &str) -> bool {
    let (parent, prefix) = match marker.rsplit_once('/') {
        Some((p, name)) => (Some(p), name),
        None => (None, marker),
    };
    dir.ancestors().any(|d| {
        let base = match parent {
            Some(p) => d.join(p),
            None => d.to_path_buf(),
        };
        let Ok(entries) = std::fs::read_dir(&base) else {
            return false;
        };
        entries
            .flatten()
            .any(|e| e.file_name().to_string_lossy().starts_with(prefix))
    })
}

fn existing_dir(dir: Option<&Path>) -> Option<PathBuf> {
    dir.map(Path::to_path_buf).filter(|d| d.is_dir())
}

fn last_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .next_back()
        .map(|l| l.chars().take(DETAIL_COL).collect())
}

fn tail_of(text: &str) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(DETAIL_LINES);
    lines[start..]
        .iter()
        .map(|l| l.chars().take(DETAIL_COL).collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-probe-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("\u{5efa}\u{4e34}\u{65f6}\u{76ee}\u{5f55}");
        dir
    }

    fn spec() -> DevServerSpec {
        DevServerSpec {
            cmd: "npx @slidev/cli".to_owned(),
            cmd_env: Some(
                "NOTA_\u{6d4b}\u{8bd5}_\u{7edd}\u{4e0d}\u{5b58}\u{5728}\u{7684}\u{53d8}\u{91cf}"
                    .to_owned(),
            ),
            args: vec![],
            entry: None,
            probe_args: None,
            probe_env: None,
            project_marker: None,
        }
    }

    #[test]
    fn table_record_directory_need_web_upper_find() {
        let dir = temp_dir("marker");
        let deep = dir.join("\u{7b14}\u{8bb0}").join("\u{9879}\u{76ee}");
        std::fs::create_dir_all(
            deep.join("node_modules")
                .join("@slidev")
                .join("theme-default"),
        )
        .unwrap();

        assert!(marker_installed(&deep, "node_modules/@slidev/theme-"));

        assert!(!marker_installed(&deep, "node_modules/@slidev/xx-"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn e_wai_need_find_dynamic_system_page_web_upper_find() {
        let dir = temp_dir("need");
        let document_directory = dir.join("\u{7b14}\u{8bb0}").join("\u{6f14}\u{793a}");
        std::fs::create_dir_all(&document_directory).unwrap();
        let theme_2 = dir
            .join("node_modules")
            .join("@slidev")
            .join("theme-seriph");
        std::fs::create_dir_all(&theme_2).unwrap();
        std::fs::write(theme_2.join("package.json"), "{}").unwrap();

        assert!(has_layer(
            &document_directory,
            "node_modules/@slidev/theme-seriph/package.json"
        ));

        assert!(!has_layer(
            &document_directory,
            "node_modules/@slidev/theme-default/package.json"
        ));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn item_pair_path_parse_sentence() {
        assert!(and_method_item_pair_path(
            "node_modules/@slidev/theme-default"
        ));
        assert!(and_method_item_pair_path("node_modules/.bin/nota"));

        for broken in [
            "",
            "/etc/passwd",
            "../../.ssh/id_ed25519",
            "a/../../b",
            "a\\b",
            "a//b",
        ] {
            assert!(!and_method_item_pair_path(broken), "`{broken}` \u{4e0d}\u{8be5}\u{88ab}\u{5224}\u{6210}\u{5408}\u{6cd5}\u{7684}\u{76f8}\u{5bf9}\u{8def}\u{5f84}");
        }
    }

    #[test]
    fn name_zero_not_store_at_is_package_is_person_render() {
        let s = DevServerSpec {
            cmd: "nota-\u{7edd}\u{5bf9}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}\u{547d}\u{4ee4}".to_owned(),
            cmd_env: None,
            ..spec()
        };
        let p = probe(&s, None, None);
        assert_eq!(p.state, ProbeState::Missing);
        assert!(
            p.detail
                .contains("nota-\u{7edd}\u{5bf9}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}\u{547d}\u{4ee4}"),
            "\u{8981}\u{70b9}\u{540d}\u{90a3}\u{4e2a}\u{547d}\u{4ee4}\u{ff1a}{}",
            p.detail
        );

        assert_eq!(p.need_found, None, "\u{6ca1}\u{95ee}\u{8fc7}\u{7684}\u{4e1c}\u{897f}\u{4e0d}\u{8bb8}\u{6709}\u{7ed3}\u{8bba}");
    }

    #[test]
    fn not_and_method_need_find_dynamic_system_not_compute_text_passed() {
        let s = spec();
        let p = probe(&s, Some(Path::new("/tmp")), Some("../../etc/passwd"));
        assert_eq!(p.need_found, None, "\u{4e0d}\u{5408}\u{6cd5} = \u{4e0d}\u{56de}\u{7b54}\u{ff0c}\u{4e0d}\u{662f}\u{300c}\u{6ca1}\u{6709}\u{300d}");
    }
}
