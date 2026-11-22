use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{NotaError, Result};

const BOUNDARY_PACKAGE_UPPER_THREAD: u64 = 128 * 1024 * 1024;

pub fn use_call_word_point_directory() -> Result<PathBuf> {
    Ok(crate::paths::config_dir()?.join("dictionaries"))
}

pub fn use_call_word_table_file() -> Result<PathBuf> {
    Ok(use_call_word_point_directory()?.join("user-words.txt"))
}

pub fn system_same_word_point_directory_list() -> Vec<PathBuf> {
    let mut out = Vec::new();
    #[cfg(target_os = "linux")]
    {
        out.push(PathBuf::from("/usr/share/hunspell"));
        out.push(PathBuf::from("/usr/share/myspell"));
        out.push(PathBuf::from("/usr/share/myspell/dicts"));
        out.push(PathBuf::from("/usr/local/share/hunspell"));
    }
    #[cfg(target_os = "macos")]
    {
        out.push(PathBuf::from("/Library/Spelling"));
        if let Some(add_3) = std::env::var_os("HOME") {
            out.push(PathBuf::from(add_3).join("Library/Spelling"));
        }
    }
    #[cfg(target_os = "windows")]
    {
        let parse = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        out.push(PathBuf::from(format!(
            "{parse}\\Program Files\\LibreOffice\\share\\extensions"
        )));
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum DictionarySource {
    #[serde(rename = "user")]
    User,

    #[serde(rename = "system")]
    System,
}

#[derive(Debug, Clone, Serialize)]
pub struct DictionaryEntry {
    pub tag: String,
    pub source_2: DictionarySource,

    pub directory_2: String,
}

fn normalize_one(table_before: &str) -> String {
    table_before
        .chars()
        .map(|c| match c {
            '-' | '_' => '_',
            c => c.to_ascii_lowercase(),
        })
        .collect()
}

fn directory_inner_find_one_pair(
    directory_2: &Path,
    table_before: &str,
) -> Option<(Option<PathBuf>, PathBuf)> {
    let wanted_content = normalize_one(table_before);
    let mut dic = None;
    let mut aff = None;
    for item in std::fs::read_dir(directory_2).ok()?.flatten() {
        let path_3 = item.path();
        if !path_3.is_file() {
            continue;
        }
        let Some(extension_2) = path_3.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        let Some(static_2) = path_3.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if normalize_one(static_2) != wanted_content {
            continue;
        }
        match extension_2.to_ascii_lowercase().as_str() {
            "dic" => dic = Some(path_3),
            "aff" => aff = Some(path_3),
            _ => {}
        }
    }
    Some((aff, dic?))
}

pub fn find_one_pair(
    table_before: &str,
    use_call_directory: Option<&Path>,
) -> Option<(Option<PathBuf>, PathBuf)> {
    if let Some(directory_2) = use_call_directory {
        if let Some(pair) = directory_inner_find_one_pair(directory_2, table_before) {
            return Some(pair);
        }
    }
    for directory_2 in system_same_word_point_directory_list() {
        if let Some(pair) = directory_inner_find_one_pair(&directory_2, table_before) {
            return Some(pair);
        }
    }
    None
}

pub fn list_out(use_call_directory: Option<&Path>) -> Vec<DictionaryEntry> {
    let mut method_item: Vec<(DictionarySource, PathBuf)> = Vec::new();
    if let Some(directory_2) = use_call_directory {
        method_item.push((DictionarySource::User, directory_2.to_path_buf()));
    }
    for directory_2 in system_same_word_point_directory_list() {
        method_item.push((DictionarySource::System, directory_2));
    }
    list_out_from(method_item)
}

fn list_out_from(method_item: Vec<(DictionarySource, PathBuf)>) -> Vec<DictionaryEntry> {
    let mut out: Vec<DictionaryEntry> = Vec::new();
    let mut check_passed: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (source_2, directory_2) in method_item {
        let Ok(item_target_list) = std::fs::read_dir(&directory_2) else {
            continue;
        };
        for item in item_target_list.flatten() {
            let path_3 = item.path();
            if !path_3.is_file() {
                continue;
            }
            let extension_2 = path_3
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if extension_2 != "dic" {
                continue;
            }
            let Some(static_2) = path_3.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };

            if normalize_one(static_2) == "index" {
                continue;
            }
            if !check_passed.insert(normalize_one(static_2)) {
                continue;
            }
            out.push(DictionaryEntry {
                tag: static_2.to_string(),
                source_2,
                directory_2: directory_2.display().to_string(),
            });
        }
    }
    out.sort_by(|a, b| a.tag.cmp(&b.tag));
    out
}

fn table_before_of(package_inner_path: &str) -> Option<String> {
    let segment: Vec<&str> = package_inner_path
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    let file_3 = *segment.last()?;
    let static_2 = file_3.rsplit_once('.').map(|(a, _)| a).unwrap_or(file_3);
    if !static_2.eq_ignore_ascii_case("index") {
        return Some(static_2.to_string());
    }

    Some(segment.get(segment.len().checked_sub(2)?)?.to_string())
}

struct DictionaryArchive {
    table_before: String,
    aff: Option<Vec<u8>>,
    dic: Option<Vec<u8>>,
}

pub fn to_into_press_lock_package(path_3: &Path) -> Result<String> {
    let bytes = std::fs::read(path_3)
        .map_err(|e| NotaError::other(format!("Could not read this file: {e}")))?;
    let mut ar = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|e| NotaError::other(format!("This is not a readable ZIP package: {e}")))?;

    let mut pair_list: Vec<DictionaryArchive> = Vec::new();
    let mut total: u64 = 0;
    for i in 0..ar.len() {
        let Ok(mut e) = ar.by_index(i) else { continue };
        if e.is_dir() {
            continue;
        }
        let name_2 = e.name().to_string();

        let suffix_segment = name_2.rsplit('/').next().unwrap_or("");
        if name_2.starts_with("__MACOSX/") || suffix_segment.starts_with("._") {
            continue;
        }
        let extension_2 = suffix_segment
            .rsplit('.')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();
        if extension_2 != "aff" && extension_2 != "dic" {
            continue;
        }
        let Some(table_before) = table_before_of(&name_2) else {
            continue;
        };
        let mut content_2 = Vec::new();

        if e.by_ref()
            .take(BOUNDARY_PACKAGE_UPPER_THREAD + 1)
            .read_to_end(&mut content_2)
            .is_err()
        {
            continue;
        }
        total += content_2.len() as u64;
        if total > BOUNDARY_PACKAGE_UPPER_THREAD {
            return Err(NotaError::other(
                "The extracted ZIP is too large to be a dictionary".to_string(),
            ));
        }
        match pair_list
            .iter_mut()
            .find(|f| normalize_one(&f.table_before) == normalize_one(&table_before))
        {
            Some(cao) => {
                if extension_2 == "aff" {
                    cao.aff = Some(content_2);
                } else {
                    cao.dic = Some(content_2);
                }
            }
            None => pair_list.push(DictionaryArchive {
                table_before,
                aff: (extension_2 == "aff").then_some(content_2.clone()),
                dic: (extension_2 == "dic").then_some(content_2),
            }),
        }
    }

    let Some(is_to) = pair_list.into_iter().find(|f| f.dic.is_some()) else {
        return Err(NotaError::other(
            "The ZIP does not contain a required `.dic` word list".to_string(),
        ));
    };

    let target_directory = use_call_word_point_directory()?;
    std::fs::create_dir_all(&target_directory)
        .map_err(|e| NotaError::other(format!("Could not create the dictionary directory: {e}")))?;
    let word_table = is_to.dic.expect("already checked with dic.is_some()");
    std::fs::write(
        target_directory.join(format!("{}.dic", is_to.table_before)),
        word_table,
    )
    .map_err(|e| NotaError::other(format!("Could not write the word list: {e}")))?;
    let aff = is_to
        .aff
        .unwrap_or_else(|| most_small_affix().as_bytes().to_vec());
    std::fs::write(
        target_directory.join(format!("{}.aff", is_to.table_before)),
        aff,
    )
    .map_err(|e| NotaError::other(format!("Could not write the affix configuration: {e}")))?;

    Ok(is_to.table_before)
}

pub fn most_small_affix() -> &'static str {
    "SET UTF-8\n"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_character_service_and_lower_render_thread_is_same_one_list_language() {
        assert_eq!(normalize_one("en-US"), normalize_one("en_US"));
        assert_eq!(normalize_one("EN_us"), normalize_one("en_US"));
        assert_ne!(normalize_one("en_US"), normalize_one("en_GB"));
    }

    #[test]
    fn package_inner_table_before_by_three_middle_thread_long_get() {
        assert_eq!(table_before_of("en_US.dic").unwrap(), "en_US");

        assert_eq!(table_before_of("en_US/en_US.aff").unwrap(), "en_US");

        assert_eq!(
            table_before_of("dictionaries/en-US/index.aff").unwrap(),
            "en-US"
        );
    }

    #[test]
    fn use_call_at_that_directory_old_thread_see_that() {
        let root_2 = std::env::temp_dir().join(format!("nota-store-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        let use_call = root_2.join("user");
        std::fs::create_dir_all(&use_call).unwrap();
        std::fs::write(use_call.join("en_US.dic"), "1\nmine\n").unwrap();

        let (aff, dic) = find_one_pair("en_US", Some(&use_call)).unwrap();
        assert!(dic.starts_with(&use_call));
        assert!(aff.is_none(), "\u{53ea}\u{6709}\u{8bcd}\u{8868}\u{65f6} aff \u{8be5}\u{662f} None\u{ff0c}\u{522b}\u{51ed}\u{7a7a}\u{9020}\u{4e00}\u{4efd}");

        assert!(find_one_pair("en-us", Some(&use_call)).is_some());

        assert!(find_one_pair("zz_ZZ", Some(&use_call)).is_none());
        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn list_out_incoming_not_required_middle_sample_use_call_that_current_change_main_system_same_that_current(
    ) {
        let root_2 = std::env::temp_dir().join(format!("nota-store-list-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        let use_call = root_2.join("user");
        let system_same = root_2.join("sys");
        std::fs::create_dir_all(&use_call).unwrap();
        std::fs::create_dir_all(&system_same).unwrap();

        std::fs::write(use_call.join("de_DE.dic"), "1\nhallo\n").unwrap();
        std::fs::write(use_call.join("en_US.dic"), "1\nmine\n").unwrap();
        std::fs::write(system_same.join("en_US.dic"), "1\nours\n").unwrap();
        std::fs::write(system_same.join("fr_FR.dic"), "1\nbonjour\n").unwrap();

        std::fs::write(use_call.join("index.dic"), "1\nx\n").unwrap();
        std::fs::write(use_call.join("notes.txt"), "x").unwrap();

        let out = list_out_from(vec![
            (DictionarySource::User, use_call.clone()),
            (DictionarySource::System, system_same),
        ]);
        let table_before_list: Vec<&str> = out.iter().map(|d| d.tag.as_str()).collect();
        assert_eq!(table_before_list, vec!["de_DE", "en_US", "fr_FR"]);
        assert_eq!(
            out.iter().find(|d| d.tag == "en_US").unwrap().source_2,
            DictionarySource::User
        );
        assert_eq!(
            out.iter().find(|d| d.tag == "fr_FR").unwrap().source_2,
            DictionarySource::System
        );
        let _ = std::fs::remove_dir_all(&root_2);
    }

    static TEST_ENVIRONMENT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn to_into_one_real_zip_three_middle_thread_long_all_land_lower_get() {
        use std::io::Write as _;
        let _guard = TEST_ENVIRONMENT_LOCK
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let root_2 = std::env::temp_dir().join(format!("nota-store-zip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        std::fs::create_dir_all(&root_2).unwrap();
        let old = std::env::var_os("XDG_CONFIG_HOME");
        std::env::set_var("XDG_CONFIG_HOME", &root_2);

        for (when, item_target_list) in [
            (
                "en_US",
                vec![
                    ("en_US.aff", "SET UTF-8\n"),
                    ("en_US.dic", "2\nhello\nworld\n"),
                ],
            ),
            (
                "de_DE",
                vec![
                    ("de_DE/de_DE.aff", "SET UTF-8\n"),
                    ("de_DE/de_DE.dic", "1\nhallo\n"),
                ],
            ),
            ("fr_FR", vec![("fr_FR.dic", "1\nbonjour\n")]),
        ] {
            let package = root_2.join(format!("{when}.zip"));
            let mut write_2 = zip::ZipWriter::new(std::fs::File::create(&package).unwrap());
            let select_item = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for (name, text) in item_target_list {
                write_2.start_file(name, select_item).unwrap();
                write_2.write_all(text.as_bytes()).unwrap();
            }
            write_2.finish().unwrap();

            let table_before = to_into_press_lock_package(&package)
                .expect("\u{5bfc}\u{5165}\u{8be5}\u{6210}\u{529f}");
            assert_eq!(table_before, when);
            let target_3 = use_call_word_point_directory().unwrap();
            let word_table = std::fs::read_to_string(target_3.join(format!("{when}.dic"))).unwrap();
            assert!(
                word_table.contains("2\n") || word_table.starts_with('1'),
                "\u{8bcd}\u{8868}\u{5185}\u{5bb9}\u{4e0d}\u{5bf9}\u{ff1a}{word_table}"
            );

            assert!(
                target_3.join(format!("{when}.aff")).is_file(),
                "\u{6ca1}\u{843d} aff\u{ff1a}{when}"
            );
        }

        let empty_package = root_2.join("\u{7a7a}.zip");
        let mut write_2 = zip::ZipWriter::new(std::fs::File::create(&empty_package).unwrap());
        write_2
            .start_file("readme.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        write_2.write_all(b"not a dictionary").unwrap();
        write_2.finish().unwrap();
        assert!(to_into_press_lock_package(&empty_package).is_err(), "\u{4e00}\u{4e2a}\u{6ca1}\u{6709} .dic \u{7684}\u{5305}\u{4e0d}\u{8be5}\u{88ab}\u{5f53}\u{6210}\u{8bcd}\u{5178}");

        match old {
            Some(v) => std::env::set_var("XDG_CONFIG_HOME", v),
            None => std::env::remove_var("XDG_CONFIG_HOME"),
        }
        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn to_into_three_middle_thread_long_all_person_out_incoming() {
        let level_plain = table_before_of("en_US.dic").unwrap();
        let pending_directory = table_before_of("en_US/en_US.aff").unwrap();
        let wooorm = table_before_of("dictionaries/en-US/index.dic").unwrap();
        assert_eq!(
            (
                level_plain.as_str(),
                pending_directory.as_str(),
                wooorm.as_str()
            ),
            ("en_US", "en_US", "en-US")
        );
    }
}
