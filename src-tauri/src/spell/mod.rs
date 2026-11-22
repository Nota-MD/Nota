use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use crate::error::{NotaError, Result};
use crate::proc::{run_capture, Ran, RunOpts};

pub mod native;
pub mod store;

const OVERFLOW_IS: Duration = Duration::from_secs(10);

pub const MAX_WORDS: usize = 2000;

pub trait Backend: Send + Sync {
    fn name_2(&self) -> &'static str;

    fn available_2(&self) -> bool;

    fn check_2(&self, language_2: &str, word_list: &[String]) -> Option<Vec<usize>>;

    fn check_one(&self, language_2: &str, word: &str) -> Vec<String>;
}

static USE_CALL_WORD: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

static CALL_IGNORE_WORD: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn use_call_word_table() -> &'static Mutex<HashSet<String>> {
    USE_CALL_WORD.get_or_init(|| Mutex::new(read_use_call_word_table()))
}

fn call_ignore_word_table() -> &'static Mutex<HashSet<String>> {
    CALL_IGNORE_WORD.get_or_init(|| Mutex::new(HashSet::new()))
}

fn normalize_one(word: &str) -> String {
    word.trim().to_lowercase()
}

fn read_use_call_word_table() -> HashSet<String> {
    let Ok(path_3) = store::use_call_word_table_file() else {
        return HashSet::new();
    };
    let Ok(text) = std::fs::read_to_string(path_3) else {
        return HashSet::new();
    };
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| line.to_lowercase())
        .collect()
}

pub fn add_into_use_call_word(word: &str) -> Result<String> {
    let normalized = normalize_one(word);
    if normalized.is_empty() {
        return Err(NotaError::other(
            "An empty word cannot be added".to_string(),
        ));
    }
    if let Ok(mut table_2) = use_call_word_table().lock() {
        if !table_2.insert(normalized.clone()) {
            return Ok(normalized);
        }
    }
    if let Ok(mut table_2) = call_ignore_word_table().lock() {
        table_2.remove(&normalized);
    }
    let path_3 = store::use_call_word_table_file()?;
    if let Some(service) = path_3.parent() {
        std::fs::create_dir_all(service).map_err(|e| {
            NotaError::other(format!("Could not create the dictionary directory: {e}"))
        })?;
    }
    use std::io::Write as _;
    let mut file_3 = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path_3)
        .map_err(|e| NotaError::other(format!("Could not write the user word list: {e}")))?;
    writeln!(file_3, "{normalized}")
        .map_err(|e| NotaError::other(format!("Could not write the user word list: {e}")))?;
    Ok(normalized)
}

pub fn call_ignore_one_word(word: &str) -> String {
    let normalized = normalize_one(word);
    if normalized.is_empty() {
        return normalized;
    }
    if let Ok(mut table_2) = call_ignore_word_table().lock() {
        table_2.insert(normalized.clone());
    }
    if let Ok(mut table_2) = use_call_word_table().lock() {
        table_2.remove(&normalized);
    }
    normalized
}

pub(crate) fn need_real_check<'a>(
    word_list: &'a [String],
    use_call: &HashSet<String>,
    call_ignore: &HashSet<String>,
) -> Vec<(usize, &'a str)> {
    word_list
        .iter()
        .enumerate()
        .filter(|(_, word)| {
            let normalized = normalize_one(word);
            !use_call.contains(&normalized) && !call_ignore.contains(&normalized)
        })
        .map(|(i, word)| (i, word.as_str()))
        .collect()
}

fn pending_candidates(word_list: &[String]) -> Vec<(usize, String)> {
    let use_call = use_call_word_table()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let call_ignore = call_ignore_word_table()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    need_real_check(word_list, &use_call, &call_ignore)
        .into_iter()
        .map(|(i, word)| (i, word.to_string()))
        .collect()
}

pub struct CompositeBackend {
    source_generate: native::NativeRustBackend,
    name_zero_line: Option<CommandLineBackend>,
}

impl Backend for CompositeBackend {
    fn name_2(&self) -> &'static str {
        "zspell / enchant / hunspell"
    }

    fn available_2(&self) -> bool {
        true
    }

    fn check_2(&self, language_2: &str, word_list: &[String]) -> Option<Vec<usize>> {
        let pending_check = pending_candidates(word_list);
        if pending_check.is_empty() {
            return Some(Vec::new());
        }
        let only_has_word: Vec<String> =
            pending_check.iter().map(|(_, word)| word.clone()).collect();
        let result_3 = if self.source_generate.has_word_point(language_2) {
            self.source_generate.check_2(language_2, &only_has_word)
        } else if let Some(name_zero_line) = &self.name_zero_line {
            name_zero_line.check_2(language_2, &only_has_word)
        } else {
            None
        };
        let error_lower_table = result_3?;

        Some(
            error_lower_table
                .into_iter()
                .map(|i| pending_check[i].0)
                .collect(),
        )
    }

    fn check_one(&self, language_2: &str, word: &str) -> Vec<String> {
        if self.source_generate.has_word_point(language_2) {
            return self.source_generate.check_one(language_2, word);
        }
        self.name_zero_line
            .as_ref()
            .map(|after_segment| after_segment.check_one(language_2, word))
            .unwrap_or_default()
    }
}

pub fn item_after_segment() -> Option<Box<dyn Backend>> {
    let source_generate = native::NativeRustBackend::create_2();
    let name_zero_line = candidates_program()
        .iter()
        .copied()
        .find(|program_2| at_path_inner(program_2))
        .map(|program_2| CommandLineBackend {
            program_2,
            use_call_word_point_directory: store::use_call_word_point_directory().ok(),
        });

    Some(Box::new(CompositeBackend {
        source_generate,
        name_zero_line,
    }))
}

fn candidates_program() -> &'static [&'static str] {
    &["enchant-2", "hunspell"]
}

fn at_path_inner(name_2: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|d| d.join(name_2).is_file())
}

pub struct CommandLineBackend {
    pub program_2: &'static str,

    pub use_call_word_point_directory: Option<PathBuf>,
}

impl CommandLineBackend {
    fn word_point_args(&self, language_2: &str) -> String {
        if let Some(directory_2) = &self.use_call_word_point_directory {
            let candidates_2 = directory_2.join(format!("{language_2}.dic"));
            if candidates_2.is_file() {
                return directory_2.join(language_2).display().to_string();
            }
        }
        language_2.to_string()
    }
}

impl Backend for CommandLineBackend {
    fn name_2(&self) -> &'static str {
        self.program_2
    }

    fn available_2(&self) -> bool {
        at_path_inner(self.program_2)
    }

    fn check_2(&self, language_2: &str, word_list: &[String]) -> Option<Vec<usize>> {
        if word_list.is_empty() {
            return Some(Vec::new());
        }
        let one_batch: Vec<String> = word_list.iter().take(MAX_WORDS).cloned().collect();
        let data_into = {
            let mut s = String::new();
            for w in &one_batch {
                s.push_str(w);
                s.push('\n');
            }
            s
        };
        let word_point = self.word_point_args(language_2);
        let args_2: Vec<String> = spell_args(self.program_2, &word_point)
            .into_iter()
            .map(str::to_string)
            .collect();
        let opts = RunOpts::timeout(OVERFLOW_IS)
            .stdin(data_into)
            .env("NO_COLOR", "1")
            .env("LC_ALL", "C.UTF-8");
        match run_capture(self.program_2, &args_2, opts) {
            Ran::Done {
                ok: true, stdout, ..
            } => Some(pair_return_lower_table(&one_batch, &stdout)),

            _ => None,
        }
    }

    fn check_one(&self, language_2: &str, word: &str) -> Vec<String> {
        let data_into = format!("{word}\n");
        let word_point = self.word_point_args(language_2);
        let args_2: Vec<String> = check_one_args(self.program_2, &word_point)
            .into_iter()
            .map(str::to_string)
            .collect();
        let opts = RunOpts::timeout(OVERFLOW_IS)
            .stdin(data_into)
            .env("NO_COLOR", "1")
            .env("LC_ALL", "C.UTF-8");
        let Ran::Done {
            ok: true, stdout, ..
        } = run_capture(self.program_2, &args_2, opts)
        else {
            return Vec::new();
        };
        from_check_one_data_out_inner_port(&stdout)
    }
}

fn spell_args<'a>(program_2: &str, language_2: &'a str) -> Vec<&'a str> {
    match program_2 {
        "enchant-2" => vec!["-d", language_2, "-l"],
        _ => vec!["-d", language_2, "-l"],
    }
}

fn check_one_args<'a>(program_2: &str, language_2: &'a str) -> Vec<&'a str> {
    match program_2 {
        "enchant-2" => vec!["-d", language_2, "-a"],
        _ => vec!["-d", language_2, "-a"],
    }
}

pub(crate) fn pair_return_lower_table(word_list: &[String], data_out: &str) -> Vec<usize> {
    use std::collections::HashMap;
    let mut pending_match: HashMap<&str, Vec<usize>> = HashMap::new();
    for (i, w) in word_list.iter().enumerate() {
        pending_match.entry(w.as_str()).or_default().push(i);
    }
    let mut out: Vec<usize> = Vec::new();
    for line in data_out.lines() {
        let word = line.trim();
        if word.is_empty() {
            continue;
        }
        if let Some(lower_table_list) = pending_match.get_mut(word) {
            if let Some(i) = lower_table_list.pop() {
                out.push(i);
            }
        }
    }
    out.sort_unstable();
    out
}

pub(crate) fn from_check_one_data_out_inner_port(data_out: &str) -> Vec<String> {
    for line in data_out.lines() {
        let Some(question) = line.strip_prefix("& ") else {
            continue;
        };

        let Some((_, check_one_segment)) = question.split_once(':') else {
            continue;
        };
        return check_one_segment
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    Vec::new()
}

#[cfg(test)]
mod tests;

#[tauri::command]
pub async fn nota_spell_check(language: String, words: Vec<String>) -> Result<Vec<usize>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(after_segment) = item_after_segment() else {
            return Err(NotaError::other(each_has_engine_render()));
        };
        after_segment
            .check_2(&language, &words)
            .ok_or_else(|| NotaError::other(each_has_current_word_point_render(&language)))
    })
    .await
    .map_err(|e| {
        NotaError::other(format!(
            "\u{62fc}\u{5199}\u{68c0}\u{67e5}\u{7684}\u{7ebf}\u{7a0b}\u{6302}\u{4e86}\u{ff1a}{e}"
        ))
    })?
}

#[tauri::command]
pub async fn nota_spell_suggest(language: String, word: String) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(after_segment) = item_after_segment() else {
            return Ok(Vec::new());
        };
        Ok(after_segment.check_one(&language, &word))
    })
    .await
    .map_err(|e| NotaError::other(format!("The spelling suggestion task failed: {e}")))?
}

#[tauri::command]
pub async fn nota_spell_dictionaries() -> Result<Vec<store::DictionaryEntry>> {
    tauri::async_runtime::spawn_blocking(|| {
        Ok(store::list_out(
            store::use_call_word_point_directory().ok().as_deref(),
        ))
    })
    .await
    .map_err(|e| NotaError::other(format!("The dictionary listing task failed: {e}")))?
}

#[tauri::command]
pub async fn nota_spell_dict_dir() -> Result<String> {
    Ok(store::use_call_word_point_directory()?
        .display()
        .to_string())
}

#[tauri::command]
pub async fn nota_spell_dict_reveal(app: tauri::AppHandle) -> Result<String> {
    use tauri_plugin_opener::OpenerExt as _;
    let directory_2 = store::use_call_word_point_directory()?;
    std::fs::create_dir_all(&directory_2)
        .map_err(|e| NotaError::other(format!("Could not create the dictionary directory: {e}")))?;
    let thread_is = crate::paths::path_to_string(&directory_2)?;
    app.opener()
        .open_path(thread_is.clone(), None::<&str>)
        .map_err(|e| NotaError::other(format!("Could not open the directory {thread_is}: {e}")))?;
    Ok(thread_is)
}

#[tauri::command]
pub async fn nota_spell_dict_import(path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let table_before = store::to_into_press_lock_package(std::path::Path::new(&path))?;

        native::request_replace_store();
        Ok(table_before)
    })
    .await
    .map_err(|e| NotaError::other(format!("The dictionary import task failed: {e}")))?
}

#[tauri::command]
pub async fn nota_spell_word_add(word: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || add_into_use_call_word(&word))
        .await
        .map_err(|e| NotaError::other(format!("The user word list task failed: {e}")))?
}

#[tauri::command]
pub async fn nota_spell_word_ignore(word: String) -> Result<String> {
    Ok(call_ignore_one_word(&word))
}

fn each_has_engine_render() -> String {
    "The spell-check engine could not start. This is an internal bug, not a missing system dependency.".to_string()
}

pub fn each_has_current_word_point_render(language: &str) -> String {
    let directory_2 = store::use_call_word_point_directory()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<config-dir>/nota/dictionaries".to_string());
    format!(
        "No `{language}` dictionary is installed. Install `hunspell-{language}`, import a ZIP containing `.aff` and `.dic`, or copy `{language}.aff` and `{language}.dic` into `{directory_2}`."
    )
}
