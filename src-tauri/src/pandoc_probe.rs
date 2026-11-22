use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::proc::{command_or_default, run_capture, split_command, Ran, RunOpts};

use super::pandoc::{import_formats, ImportFormatInfo, DEFAULT_CMD, ENV_CMD};
use crate::pandoc_format::{format_table, FormatInfo};

pub(crate) const VERSION_FLAG: &str = "--version";

pub(crate) const CHECK_TIMEOUT: Duration = Duration::from_secs(10);

pub(crate) const DETAIL_LINES: usize = 8;
pub(crate) const DETAIL_COL: usize = 200;

pub(crate) const ENGINES: &[&str] = &[
    "xelatex",
    "lualatex",
    "tectonic",
    "typst",
    "pdflatex",
    "latexmk",
    "wkhtmltopdf",
    "weasyprint",
    "prince",
    "context",
    "pdfroff",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProbeTarget {
    pub program: String,

    pub args: Vec<String>,

    pub env: Vec<(String, String)>,

    pub source_2: String,
}

pub(crate) fn parse_2(command: &str) -> Option<ProbeTarget> {
    let (program_2, args) = split_command(command)?;

    if program_2.contains('/') || program_2.contains(std::path::MAIN_SEPARATOR) {
        return Some(ProbeTarget {
            program: program_2,
            args,
            env: Vec::new(),
            source_2: "path hard-coded in the command".to_string(),
        });
    }

    if at_path_inner(&program_2) {
        return Some(ProbeTarget {
            program: program_2,
            args,
            env: Vec::new(),
            source_2: "PATH".to_string(),
        });
    }

    for candidates_2 in candidates_directory() {
        let full = candidates_2.dir.join(&program_2);
        if can_only_line_file(&full) {
            return Some(ProbeTarget {
                program: full.display().to_string(),
                args,
                env: candidates_2.env,
                source_2: candidates_2.source_2,
            });
        }
    }

    Some(ProbeTarget {
        program: program_2,
        args,
        env: Vec::new(),
        source_2: "PATH".to_string(),
    })
}

pub(crate) fn at_path_inner(name_2: &str) -> bool {
    match std::env::var_os("PATH") {
        Some(path) => find_in_path(&[name_2], &path).is_some(),
        None => false,
    }
}

pub(crate) fn candidates_directory() -> Vec<ProbeCandidate> {
    let mut out = Vec::new();
    if let Some(add_3) = dirs::home_dir() {
        out.push(ProbeCandidate::plain_same(
            add_3.join(".local/bin"),
            "~/.local/bin",
        ));
        out.push(ProbeCandidate::plain_same(
            add_3.join(".cabal/bin"),
            "~/.cabal/bin",
        ));
    }
    out.push(ProbeCandidate::plain_same(
        PathBuf::from("/usr/local/bin"),
        "/usr/local/bin",
    ));
    out.push(ProbeCandidate::plain_same(
        PathBuf::from("/opt/homebrew/bin"),
        "/opt/homebrew/bin",
    ));
    out.push(ProbeCandidate::plain_same(
        PathBuf::from("/opt/pandoc"),
        "/opt/pandoc",
    ));
    out.push(ProbeCandidate::plain_same(
        PathBuf::from("/snap/bin"),
        "/snap/bin",
    ));

    for directory_2 in ["/run/host/usr/local/bin", "/run/host/usr/bin"] {
        let dir = PathBuf::from(directory_2);
        if dir.is_dir() {
            out.push(ProbeCandidate {
                dir,
                source_2: format!("host-provided {directory_2}"),
                env: speed_main_point_piece(),
            });
        }
    }
    out
}

pub(crate) struct ProbeCandidate {
    pub(crate) dir: PathBuf,

    pub(crate) source_2: String,

    pub(crate) env: Vec<(String, String)>,
}

impl ProbeCandidate {
    fn plain_same(dir: PathBuf, source_2: &str) -> Self {
        Self {
            dir,
            source_2: source_2.to_string(),
            env: Vec::new(),
        }
    }
}

pub(crate) fn speed_main_point_piece() -> Vec<(String, String)> {
    let mut out = Vec::new();

    let store = speed_main_store_directory();
    if !store.is_empty() {
        out.push(("LD_LIBRARY_PATH".to_string(), store.join(":")));
    }

    let host_path = "/run/host/usr/local/bin:/run/host/usr/bin:/run/host/bin";
    let source = std::env::var("PATH").unwrap_or_default();
    out.push((
        "PATH".to_string(),
        if source.is_empty() {
            host_path.to_string()
        } else {
            format!("{source}:{host_path}")
        },
    ));

    if Path::new("/run/host/usr/share/pandoc").is_dir() {
        out.push((
            "pandoc_datadir".to_string(),
            "/run/host/usr/share/pandoc".to_string(),
        ));
    }
    out
}

fn speed_main_store_directory() -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for service in ["/run/host/usr/lib", "/run/host/lib"] {
        let service = Path::new(service);
        if !service.is_dir() {
            continue;
        }
        out.push(service.display().to_string());
        if let Ok(item_target) = std::fs::read_dir(service) {
            for item in item_target.flatten() {
                let p = item.path();
                let is_multiple_add_construct = p
                    .file_name()
                    .map(|n| n.to_string_lossy().contains("-linux-gnu"))
                    .unwrap_or(false);
                if p.is_dir() && is_multiple_add_construct {
                    out.push(p.display().to_string());
                }
            }
        }
    }
    for edit_level in ["/run/host/usr/lib64", "/run/host/lib64"] {
        if Path::new(edit_level).is_dir() {
            out.push(edit_level.to_string());
        }
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProbeState {
    Ready,

    Missing,

    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct PandocProbe {
    pub state: ProbeState,

    pub command: String,

    pub version: Option<String>,

    pub message: String,

    pub detail: String,

    pub pdf_engine: Option<String>,

    pub fallback_pdf: bool,

    pub formats: Vec<FormatInfo>,

    pub import_formats: Vec<ImportFormatInfo>,
}

pub fn probe() -> PandocProbe {
    probe_with(&command_or_default(ENV_CMD, DEFAULT_CMD))
}

pub(crate) fn probe_with(command: &str) -> PandocProbe {
    let mut out = PandocProbe {
        state: ProbeState::Unknown,
        command: command.to_string(),
        version: None,
        message: String::new(),
        detail: String::new(),
        pdf_engine: find_engine(),
        fallback_pdf: crate::pdf_print::available(),
        formats: format_table(),
        import_formats: import_formats(),
    };

    let Some(land) = parse_2(command) else {
        out.message = format!("{ENV_CMD} is empty; there is no command to run.");
        return out;
    };

    out.command = land.program.clone();
    let program = land.program;
    let mut args = land.args;
    args.push(VERSION_FLAG.to_string());

    let mut opts = RunOpts::timeout(CHECK_TIMEOUT).env("NO_COLOR", "1");
    for (k, v) in &land.env {
        opts = opts.env(k, v);
    }
    match run_capture(&program, &args, opts) {
        Ran::Done {
            ok: true, stdout, ..
        } => {
            out.state = ProbeState::Ready;
            out.version = first_line(&stdout);
            out.message = install_ok_that_sentence(&out);

            if land.source_2 != "PATH" {
                out.message.push_str(&format!(
                    "(This executable is not on PATH; found through {}.)",
                    land.source_2
                ));
            }
        }
        Ran::Done {
            ok: false,
            stdout,
            stderr,
        } => {
            out.state = ProbeState::Unknown;
            out.detail = if stderr.trim().is_empty() {
                tail_of(&stdout)
            } else {
                tail_of(&stderr)
            };
            out.message =
                format!("`{program}` started but did not report a version. It can still be used.");
        }
        Ran::NoProgram => {
            out.state = ProbeState::Missing;
            out.message = format!(
                "Could not find `{program}`. Pandoc is required for PDF, Word, RTF, EPUB, LaTeX, OpenDocument, OPML, MediaWiki, reStructuredText, and Textile conversion."
            );
            out.detail = "Install Pandoc from pandoc.org/installing.html:\n\
                          Debian/Ubuntu: sudo apt install pandoc\n\
                          Fedora:        sudo dnf install pandoc\n\
                          macOS:         brew install pandoc"
                .to_string();
        }
        Ran::Timeout => {
            out.state = ProbeState::Unknown;
            out.message = format!(
                "`{program} --version` did not return within {} seconds.",
                CHECK_TIMEOUT.as_secs()
            );
        }
        Ran::Failed(msg) => {
            out.state = ProbeState::Unknown;
            out.message = msg;
        }
    }
    out
}

pub(crate) fn install_ok_that_sentence(out: &PandocProbe) -> String {
    let version = out.version.as_deref().unwrap_or("Unknown version");
    let mut s = format!("Found pandoc ({version}); formats from the export table are available.");
    if let Some(engine) = &out.pdf_engine {
        s.push_str(&format!("PDF layout uses `{engine}`."));
    } else if out.fallback_pdf {
        s.push_str(
            "Pandoc needs a layout engine such as XeLaTeX or Tectonic for PDF. Nota will use its built-in PDF layout instead.",
        );
    } else {
        s.push_str(
            "Pandoc needs a layout engine such as XeLaTeX or Tectonic for PDF, and none was found.",
        );
    }
    s
}

pub(crate) fn first_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(|l| l.chars().take(DETAIL_COL).collect())
}

pub(crate) fn tail_of(text: &str) -> String {
    let mut lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    if lines.len() > DETAIL_LINES {
        lines.drain(..lines.len() - DETAIL_LINES);
    }
    lines
        .iter()
        .map(|l| l.chars().take(DETAIL_COL).collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn find_engine() -> Option<String> {
    if let Some(path) = std::env::var_os("PATH") {
        if let Some(name) = find_in_path(ENGINES, &path) {
            return Some(name);
        }
    }

    let directory_2: Vec<PathBuf> = candidates_directory().into_iter().map(|c| c.dir).collect();
    for name in ENGINES {
        for dir in &directory_2 {
            if can_only_line_file(&dir.join(name)) {
                return Some((*name).to_string());
            }
        }
    }
    None
}

pub(crate) fn find_in_path(names: &[&str], path: &OsString) -> Option<String> {
    let dirs: Vec<PathBuf> = std::env::split_paths(path).collect();
    for name in names {
        for dir in &dirs {
            if dir.as_os_str().is_empty() {
                continue;
            }
            if can_only_line_file(&dir.join(name)) {
                return Some((*name).to_string());
            }
        }
    }
    None
}

#[cfg(unix)]
pub(crate) fn can_only_line_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(windows)]
pub(crate) fn can_only_line_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
}
