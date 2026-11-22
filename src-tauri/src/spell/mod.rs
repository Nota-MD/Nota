use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use crate::error::{NotaError, Result};
use crate::proc::{run_capture, Ran, RunOpts};

pub mod native;
pub mod store;

const CHAO_SHI: Duration = Duration::from_secs(10);

pub const MAX_WORDS: usize = 2000;

pub trait Backend: Send + Sync {
    fn name_2(&self) -> &'static str;

    fn available_2(&self) -> bool;

    fn cha_2(&self, language_2: &str, ci_men: &[String]) -> Option<Vec<usize>>;

    fn jian_yi(&self, language_2: &str, ci: &str) -> Vec<String>;
}

static YONG_HU_CI: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

static HU_LVE_CI: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn yong_hu_ci_table() -> &'static Mutex<HashSet<String>> {
    YONG_HU_CI.get_or_init(|| Mutex::new(read_yong_hu_ci_table()))
}

fn hu_lve_ci_table() -> &'static Mutex<HashSet<String>> {
    HU_LVE_CI.get_or_init(|| Mutex::new(HashSet::new()))
}

fn gui_yi(ci: &str) -> String {
    ci.trim().to_lowercase()
}

fn read_yong_hu_ci_table() -> HashSet<String> {
    let Ok(path_3) = store::yong_hu_ci_table_file() else {
        return HashSet::new();
    };
    let Ok(wen) = std::fs::read_to_string(path_3) else {
        return HashSet::new();
    };
    wen.lines()
        .map(str::trim)
        .filter(|xing| !xing.is_empty() && !xing.starts_with('#'))
        .map(|xing| xing.to_lowercase())
        .collect()
}

pub fn jia_ru_yong_hu_ci(ci: &str) -> Result<String> {
    let jing = gui_yi(ci);
    if jing.is_empty() {
        return Err(NotaError::other(
            "An empty word cannot be added".to_string(),
        ));
    }
    if let Ok(mut table_2) = yong_hu_ci_table().lock() {
        if !table_2.insert(jing.clone()) {
            return Ok(jing);
        }
    }
    if let Ok(mut table_2) = hu_lve_ci_table().lock() {
        table_2.remove(&jing);
    }
    let path_3 = store::yong_hu_ci_table_file()?;
    if let Some(fu) = path_3.parent() {
        std::fs::create_dir_all(fu).map_err(|e| {
            NotaError::other(format!("Could not create the dictionary directory: {e}"))
        })?;
    }
    use std::io::Write as _;
    let mut file_3 = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path_3)
        .map_err(|e| NotaError::other(format!("Could not write the user word list: {e}")))?;
    writeln!(file_3, "{jing}")
        .map_err(|e| NotaError::other(format!("Could not write the user word list: {e}")))?;
    Ok(jing)
}

pub fn hu_lve_yi_ge_ci(ci: &str) -> String {
    let jing = gui_yi(ci);
    if jing.is_empty() {
        return jing;
    }
    if let Ok(mut table_2) = hu_lve_ci_table().lock() {
        table_2.insert(jing.clone());
    }
    if let Ok(mut table_2) = yong_hu_ci_table().lock() {
        table_2.remove(&jing);
    }
    jing
}

pub(crate) fn yao_zhen_cha_de<'a>(
    ci_men: &'a [String],
    yong_hu: &HashSet<String>,
    hu_lve: &HashSet<String>,
) -> Vec<(usize, &'a str)> {
    ci_men
        .iter()
        .enumerate()
        .filter(|(_, ci)| {
            let jing = gui_yi(ci);
            !yong_hu.contains(&jing) && !hu_lve.contains(&jing)
        })
        .map(|(i, ci)| (i, ci.as_str()))
        .collect()
}

fn yao_zhen_cha(ci_men: &[String]) -> Vec<(usize, String)> {
    let yong_hu = yong_hu_ci_table()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let hu_lve = hu_lve_ci_table()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    yao_zhen_cha_de(ci_men, &yong_hu, &hu_lve)
        .into_iter()
        .map(|(i, ci)| (i, ci.to_string()))
        .collect()
}

pub struct CompositeBackend {
    yuan_sheng: native::NativeRustBackend,
    ming_ling_xing: Option<CommandLineBackend>,
}

impl Backend for CompositeBackend {
    fn name_2(&self) -> &'static str {
        "zspell / enchant / hunspell"
    }

    fn available_2(&self) -> bool {
        true
    }

    fn cha_2(&self, language_2: &str, ci_men: &[String]) -> Option<Vec<usize>> {
        let dai_cha = yao_zhen_cha(ci_men);
        if dai_cha.is_empty() {
            return Some(Vec::new());
        }
        let zhi_you_ci: Vec<String> = dai_cha.iter().map(|(_, ci)| ci.clone()).collect();
        let result_3 = if self.yuan_sheng.you_ci_dian(language_2) {
            self.yuan_sheng.cha_2(language_2, &zhi_you_ci)
        } else if let Some(ming_ling_xing) = &self.ming_ling_xing {
            ming_ling_xing.cha_2(language_2, &zhi_you_ci)
        } else {
            None
        };
        let cuo_de_xia_biao = result_3?;

        Some(cuo_de_xia_biao.into_iter().map(|i| dai_cha[i].0).collect())
    }

    fn jian_yi(&self, language_2: &str, ci: &str) -> Vec<String> {
        if self.yuan_sheng.you_ci_dian(language_2) {
            return self.yuan_sheng.jian_yi(language_2, ci);
        }
        self.ming_ling_xing
            .as_ref()
            .map(|hou_duan| hou_duan.jian_yi(language_2, ci))
            .unwrap_or_default()
    }
}

pub fn tiao_hou_duan() -> Option<Box<dyn Backend>> {
    let yuan_sheng = native::NativeRustBackend::create_2();
    let ming_ling_xing = candidates_program()
        .iter()
        .copied()
        .find(|program_2| zai_path_li(program_2))
        .map(|program_2| CommandLineBackend {
            program_2,
            yong_hu_ci_dian_directory: store::yong_hu_ci_dian_directory().ok(),
        });

    Some(Box::new(CompositeBackend {
        yuan_sheng,
        ming_ling_xing,
    }))
}

fn candidates_program() -> &'static [&'static str] {
    &["enchant-2", "hunspell"]
}

fn zai_path_li(name_2: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|d| d.join(name_2).is_file())
}

pub struct CommandLineBackend {
    pub program_2: &'static str,

    pub yong_hu_ci_dian_directory: Option<PathBuf>,
}

impl CommandLineBackend {
    fn ci_dian_args(&self, language_2: &str) -> String {
        if let Some(directory_2) = &self.yong_hu_ci_dian_directory {
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
        zai_path_li(self.program_2)
    }

    fn cha_2(&self, language_2: &str, ci_men: &[String]) -> Option<Vec<usize>> {
        if ci_men.is_empty() {
            return Some(Vec::new());
        }
        let yi_pi: Vec<String> = ci_men.iter().take(MAX_WORDS).cloned().collect();
        let shu_ru = {
            let mut s = String::new();
            for w in &yi_pi {
                s.push_str(w);
                s.push('\n');
            }
            s
        };
        let ci_dian = self.ci_dian_args(language_2);
        let args_2: Vec<String> = pin_args(self.program_2, &ci_dian)
            .into_iter()
            .map(str::to_string)
            .collect();
        let opts = RunOpts::timeout(CHAO_SHI)
            .stdin(shu_ru)
            .env("NO_COLOR", "1")
            .env("LC_ALL", "C.UTF-8");
        match run_capture(self.program_2, &args_2, opts) {
            Ran::Done {
                ok: true, stdout, ..
            } => Some(dui_hui_xia_biao(&yi_pi, &stdout)),

            _ => None,
        }
    }

    fn jian_yi(&self, language_2: &str, ci: &str) -> Vec<String> {
        let shu_ru = format!("{ci}\n");
        let ci_dian = self.ci_dian_args(language_2);
        let args_2: Vec<String> = jian_yi_args(self.program_2, &ci_dian)
            .into_iter()
            .map(str::to_string)
            .collect();
        let opts = RunOpts::timeout(CHAO_SHI)
            .stdin(shu_ru)
            .env("NO_COLOR", "1")
            .env("LC_ALL", "C.UTF-8");
        let Ran::Done {
            ok: true, stdout, ..
        } = run_capture(self.program_2, &args_2, opts)
        else {
            return Vec::new();
        };
        cong_jian_yi_shu_chu_li_kou(&stdout)
    }
}

fn pin_args<'a>(program_2: &str, language_2: &'a str) -> Vec<&'a str> {
    match program_2 {
        "enchant-2" => vec!["-d", language_2, "-l"],
        _ => vec!["-d", language_2, "-l"],
    }
}

fn jian_yi_args<'a>(program_2: &str, language_2: &'a str) -> Vec<&'a str> {
    match program_2 {
        "enchant-2" => vec!["-d", language_2, "-a"],
        _ => vec!["-d", language_2, "-a"],
    }
}

pub(crate) fn dui_hui_xia_biao(ci_men: &[String], shu_chu: &str) -> Vec<usize> {
    use std::collections::HashMap;
    let mut dai_pei: HashMap<&str, Vec<usize>> = HashMap::new();
    for (i, w) in ci_men.iter().enumerate() {
        dai_pei.entry(w.as_str()).or_default().push(i);
    }
    let mut chu: Vec<usize> = Vec::new();
    for xing in shu_chu.lines() {
        let ci = xing.trim();
        if ci.is_empty() {
            continue;
        }
        if let Some(xia_biao_men) = dai_pei.get_mut(ci) {
            if let Some(i) = xia_biao_men.pop() {
                chu.push(i);
            }
        }
    }
    chu.sort_unstable();
    chu
}

pub(crate) fn cong_jian_yi_shu_chu_li_kou(shu_chu: &str) -> Vec<String> {
    for xing in shu_chu.lines() {
        let Some(ti) = xing.strip_prefix("& ") else {
            continue;
        };

        let Some((_, jian_yi_duan)) = ti.split_once(':') else {
            continue;
        };
        return jian_yi_duan
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
pub async fn nota_spell_check(lang: String, words: Vec<String>) -> Result<Vec<usize>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(hou_duan) = tiao_hou_duan() else {
            return Err(NotaError::other(mei_you_engine_de_hua()));
        };
        hou_duan
            .cha_2(&lang, &words)
            .ok_or_else(|| NotaError::other(mei_you_zhe_ben_ci_dian_de_hua(&lang)))
    })
    .await
    .map_err(|e| {
        NotaError::other(format!(
            "\u{62fc}\u{5199}\u{68c0}\u{67e5}\u{7684}\u{7ebf}\u{7a0b}\u{6302}\u{4e86}\u{ff1a}{e}"
        ))
    })?
}

#[tauri::command]
pub async fn nota_spell_suggest(lang: String, word: String) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(hou_duan) = tiao_hou_duan() else {
            return Ok(Vec::new());
        };
        Ok(hou_duan.jian_yi(&lang, &word))
    })
    .await
    .map_err(|e| NotaError::other(format!("The spelling suggestion task failed: {e}")))?
}

#[tauri::command]
pub async fn nota_spell_dictionaries() -> Result<Vec<store::DictionaryEntry>> {
    tauri::async_runtime::spawn_blocking(|| {
        Ok(store::lie_chu(
            store::yong_hu_ci_dian_directory().ok().as_deref(),
        ))
    })
    .await
    .map_err(|e| NotaError::other(format!("The dictionary listing task failed: {e}")))?
}

#[tauri::command]
pub async fn nota_spell_dict_dir() -> Result<String> {
    Ok(store::yong_hu_ci_dian_directory()?.display().to_string())
}

#[tauri::command]
pub async fn nota_spell_dict_reveal(app: tauri::AppHandle) -> Result<String> {
    use tauri_plugin_opener::OpenerExt as _;
    let directory_2 = store::yong_hu_ci_dian_directory()?;
    std::fs::create_dir_all(&directory_2)
        .map_err(|e| NotaError::other(format!("Could not create the dictionary directory: {e}")))?;
    let xian_shi = crate::paths::path_to_string(&directory_2)?;
    app.opener()
        .open_path(xian_shi.clone(), None::<&str>)
        .map_err(|e| NotaError::other(format!("Could not open the directory {xian_shi}: {e}")))?;
    Ok(xian_shi)
}

#[tauri::command]
pub async fn nota_spell_dict_import(path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let biao_qian = store::dao_ru_ya_suo_bao(std::path::Path::new(&path))?;

        native::qing_huan_cun();
        Ok(biao_qian)
    })
    .await
    .map_err(|e| NotaError::other(format!("The dictionary import task failed: {e}")))?
}

#[tauri::command]
pub async fn nota_spell_word_add(word: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || jia_ru_yong_hu_ci(&word))
        .await
        .map_err(|e| NotaError::other(format!("The user word list task failed: {e}")))?
}

#[tauri::command]
pub async fn nota_spell_word_ignore(word: String) -> Result<String> {
    Ok(hu_lve_yi_ge_ci(&word))
}

fn mei_you_engine_de_hua() -> String {
    "The spell-check engine could not start. This is an internal bug, not a missing system dependency.".to_string()
}

pub fn mei_you_zhe_ben_ci_dian_de_hua(lang: &str) -> String {
    let directory_2 = store::yong_hu_ci_dian_directory()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<config-dir>/nota/dictionaries".to_string());
    format!(
        "No `{lang}` dictionary is installed. Install `hunspell-{lang}`, import a ZIP containing `.aff` and `.dic`, or copy `{lang}.aff` and `{lang}.dic` into `{directory_2}`."
    )
}
