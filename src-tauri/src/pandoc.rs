use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::error::{NotaError, Result};

use crate::proc::{command_or_default, run_capture, Ran, RunOpts};

pub(crate) use crate::pandoc_format::Format;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ImportFormat {
    Docx,
    Rtf,
    Latex,
    Epub,
    Odt,
}

impl ImportFormat {
    pub(crate) fn from_id(id: &str) -> Option<Self> {
        Some(match id {
            "docx" => Self::Docx,
            "rtf" => Self::Rtf,
            "latex" => Self::Latex,
            "epub" => Self::Epub,
            "odt" => Self::Odt,
            _ => return None,
        })
    }

    fn from(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Latex => "latex",
            Self::Epub => "epub",
            Self::Odt => "odt",
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Latex => "latex",
            Self::Epub => "epub",
            Self::Odt => "odt",
        }
    }

    fn extensions(self) -> &'static [&'static str] {
        match self {
            Self::Docx => &["docx"],
            Self::Rtf => &["rtf"],
            Self::Latex => &["tex", "latex"],
            Self::Epub => &["epub"],
            Self::Odt => &["odt"],
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Docx => "Word",
            Self::Rtf => "RTF",
            Self::Latex => "LaTeX",
            Self::Epub => "EPUB",
            Self::Odt => "OpenDocument",
        }
    }
}

const IMPORT_ALL: [ImportFormat; 5] = [
    ImportFormat::Docx,
    ImportFormat::Rtf,
    ImportFormat::Latex,
    ImportFormat::Epub,
    ImportFormat::Odt,
];

#[derive(Debug, Clone, Serialize)]
pub struct ImportFormatInfo {
    pub id: String,
    pub name: String,
    pub extensions: Vec<String>,
}

pub(crate) fn import_formats() -> Vec<ImportFormatInfo> {
    IMPORT_ALL
        .iter()
        .map(|format| ImportFormatInfo {
            id: format.id().to_string(),
            name: format.name().to_string(),
            extensions: format
                .extensions()
                .iter()
                .map(|ext| (*ext).to_string())
                .collect(),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
pub struct PandocImport {
    pub markdown: String,

    pub warnings: String,
}

pub(crate) use super::pandoc_probe::{find_engine, probe, tail_of, PandocProbe, DETAIL_COL};

pub(crate) use super::pandoc_probe::parse_2;

#[cfg(test)]
pub(crate) use super::pandoc_probe::{
    at_path_inner, can_only_line_file, candidates_directory, find_in_path, probe_with,
    speed_main_point_piece, ProbeState, ENGINES,
};
#[cfg(test)]
use std::ffi::OsString;

pub(crate) const DEFAULT_CMD: &str = "pandoc";

pub(crate) const ENV_CMD: &str = "NOTA_PANDOC_CMD";

const EXPORT_TIMEOUT: Duration = Duration::from_secs(180);

fn effective_language_replace_static() -> Option<String> {
    ["LC_ALL", "LC_CTYPE", "LANG"]
        .iter()
        .find_map(|k| std::env::var(k).ok().filter(|v| !v.is_empty()))
}

fn is_utf8(v: &str) -> bool {
    let v = v.to_ascii_lowercase();
    v.contains("utf-8") || v.contains("utf8")
}

fn not_language_replace_static() -> Option<(&'static str, &'static str)> {
    match effective_language_replace_static() {
        Some(v) if is_utf8(&v) => None,
        _ => Some(("LC_ALL", "C.UTF-8")),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Route {
    Pandoc,

    Nota,
}

#[derive(Debug, Clone, Serialize)]
pub struct PandocExport {
    pub path: String,
    pub route: Route,

    pub note: String,
}

fn success_work_is_warning(stderr: &str) -> String {
    const MOST_MULTIPLE: usize = 3;
    let mut line: Vec<String> = stderr
        .lines()
        .map(str::trim)
        .filter(|l| l.contains("WARNING"))
        .map(|l| l.chars().take(DETAIL_COL).collect())
        .collect();
    let still_has = line.len().saturating_sub(MOST_MULTIPLE);
    line.truncate(MOST_MULTIPLE);
    let mut s = line.join("\n");
    if still_has > 0 {
        s.push_str(&format!("\n({still_has} similar messages omitted)"));
    }
    s
}

pub(crate) fn export_to(
    format: Format,
    markdown: &str,
    target: &Path,
    doc_dir: Option<&Path>,
    extras: &PandocExtras,
) -> Result<String> {
    let command = command_or_default(ENV_CMD, DEFAULT_CMD);
    let engine = find_engine();
    export_with(
        &command,
        format,
        markdown,
        target,
        doc_dir,
        engine.as_deref(),
        extras,
    )
}

pub(crate) fn import_to(format: ImportFormat, source: &Path) -> Result<PandocImport> {
    let command = command_or_default(ENV_CMD, DEFAULT_CMD);
    import_with(&command, format, source)
}

fn import_with(command: &str, format: ImportFormat, source: &Path) -> Result<PandocImport> {
    let Some(land) = parse_2(command) else {
        return Err(NotaError::other(format!(
            "{ENV_CMD} is empty; there is no command to run"
        )));
    };
    let args = build_import_args(&land.args, format, source);
    let mut opts = RunOpts::timeout(EXPORT_TIMEOUT).env("NO_COLOR", "1");
    for (k, v) in &land.env {
        opts = opts.env(k, v);
    }
    if let Some(dir) = source.parent() {
        opts = opts.cwd(dir);
    }
    if let Some((k, v)) = not_language_replace_static() {
        opts = opts.env(k, v);
    }

    let name_zero_full_success = format!("{} {}", land.program, args.join(" "));
    match run_capture(&land.program, &args, opts) {
        Ran::Done {
            ok: true,
            stdout,
            stderr,
        } => Ok(PandocImport {
            markdown: stdout,
            warnings: success_work_is_warning(&stderr),
        }),
        Ran::Done {
            ok: false,
            stdout,
            stderr,
        } => {
            let and_infer = if stderr.trim().is_empty() {
                tail_of(&stdout)
            } else {
                tail_of(&stderr)
            };
            Err(NotaError::other(format!(
                "Pandoc could not convert {} to Markdown:\n{and_infer}",
                format.name()
            )))
        }
        Ran::NoProgram => Err(NotaError::other(format!(
            "Could not find `{}`; set `{ENV_CMD}` to use another command",
            land.program
        ))),
        Ran::Timeout => Err(NotaError::other(format!(
            "Pandoc conversion exceeded {} seconds and was stopped. Command: {name_zero_full_success}",
            EXPORT_TIMEOUT.as_secs()
        ))),
        Ran::Failed(msg) => Err(NotaError::other(msg)),
    }
}

fn build_import_args(prefix: &[String], format: ImportFormat, source: &Path) -> Vec<String> {
    let mut args = prefix.to_vec();
    args.push(format!("--from={}", format.from()));
    args.push("--to=markdown".to_string());
    args.push("--wrap=none".to_string());
    args.push("--markdown-headings=atx".to_string());
    args.push(source.display().to_string());
    args
}

#[derive(Debug, Clone, Default)]
pub(crate) struct PandocExtras {
    pub theme_css: String,

    pub pandoc_args: String,
}

fn export_with(
    command: &str,
    format: Format,
    markdown: &str,
    target: &Path,
    doc_dir: Option<&Path>,
    engine: Option<&str>,
    extras: &PandocExtras,
) -> Result<String> {
    let Some(land) = parse_2(command) else {
        return Err(NotaError::other(format!(
            "{ENV_CMD} is empty; there is no command to run"
        )));
    };
    let program = land.program;

    let e_wai = part_word(&extras.pandoc_args)?;

    let css = theme_css_file(&extras.theme_css, format)?;
    let args = build_args(
        &land.args,
        format,
        target,
        doc_dir,
        engine,
        &e_wai,
        css.as_ref().map(|c| c.path_3.as_path()),
    );

    let mut opts = RunOpts::timeout(EXPORT_TIMEOUT)
        .stdin(markdown.to_string())
        .env("NO_COLOR", "1");
    for (k, v) in &land.env {
        opts = opts.env(k, v);
    }

    if let Some((k, v)) = not_language_replace_static() {
        opts = opts.env(k, v);
    }

    if let Some(dir) = doc_dir {
        opts = opts.cwd(dir);
    }

    let name_zero_full_success = format!("{} {}", program, args.join(" "));
    match run_capture(&program, &args, opts) {
        Ran::Done {
            ok: true, stderr, ..
        } => {
            if !target.is_file() {
                return Err(NotaError::other(format!(
                    "Pandoc reported success, but {} was not created. Command: {name_zero_full_success}",
                    target.display()
                )));
            }

            Ok(success_work_is_warning(&stderr))
        }
        Ran::Done {
            ok: false,
            stdout,
            stderr,
        } => {
            let and_infer = if stderr.trim().is_empty() {
                tail_of(&stdout)
            } else {
                tail_of(&stderr)
            };
            Err(NotaError::other(format!(
                "Pandoc could not create {}:\n{and_infer}",
                format.display_name()
            )))
        }
        Ran::NoProgram => Err(NotaError::other(format!(
            "Could not find `{program}`; set `{ENV_CMD}` to use another command"
        ))),
        Ran::Timeout => Err(NotaError::other(format!(
            "Pandoc was stopped after {} seconds. Command: {name_zero_full_success}",
            EXPORT_TIMEOUT.as_secs()
        ))),
        Ran::Failed(msg) => Err(NotaError::other(msg)),
    }
}

fn can_pending_css(format: Format) -> bool {
    matches!(format, Format::Epub)
}

struct TempCss {
    path_3: PathBuf,
}

impl Drop for TempCss {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path_3);
    }
}

fn theme_css_file(theme_css: &str, format: Format) -> Result<Option<TempCss>> {
    if theme_css.trim().is_empty() || !can_pending_css(format) {
        return Ok(None);
    }

    let position_one = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let path_3 = std::env::temp_dir().join(format!(
        "nota-export-theme-{}-{position_one}.css",
        std::process::id()
    ));
    std::fs::create_dir_all(std::env::temp_dir()).ok();
    std::fs::write(&path_3, theme_css.as_bytes()).map_err(|source| NotaError::Write {
        path: path_3.clone(),
        source,
    })?;
    Ok(Some(TempCss { path_3 }))
}

pub(crate) fn part_word(args_2: &str) -> Result<Vec<String>> {
    if args_2.trim().is_empty() {
        return Ok(Vec::new());
    }
    shlex::split(args_2).ok_or_else(|| {
        NotaError::other(
            "The Pandoc extra arguments in export settings contain unbalanced quotes".to_string(),
        )
    })
}

fn build_args(
    prefix: &[String],
    format: Format,
    target: &Path,
    doc_dir: Option<&Path>,
    engine: Option<&str>,
    e_wai: &[String],
    css: Option<&Path>,
) -> Vec<String> {
    let mut args = prefix.to_vec();

    args.extend(e_wai.iter().cloned());

    args.push("--from=markdown".to_string());
    args.push(format!("--to={}", format.to()));

    args.push("--standalone".to_string());
    if let Some(dir) = doc_dir {
        args.push(format!("--resource-path={}", dir.display()));
    }

    if format == Format::Pdf {
        if let Some(engine) = engine {
            args.push(format!("--pdf-engine={engine}"));
        }
    }

    if let Some(css) = css {
        if can_pending_css(format) {
            args.push(format!("--css={}", css.display()));
        }
    }
    args.push("-o".to_string());
    args.push(target.display().to_string());
    args
}

#[cfg(test)]
mod tests;
