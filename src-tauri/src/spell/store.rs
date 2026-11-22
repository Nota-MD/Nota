use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{NotaError, Result};

const JIE_BAO_SHANG_XIAN: u64 = 128 * 1024 * 1024;

pub fn yong_hu_ci_dian_directory() -> Result<PathBuf> {
    Ok(crate::paths::config_dir()?.join("dictionaries"))
}

pub fn yong_hu_ci_table_file() -> Result<PathBuf> {
    Ok(yong_hu_ci_dian_directory()?.join("user-words.txt"))
}

pub fn xi_tong_ci_dian_directory_men() -> Vec<PathBuf> {
    let mut chu = Vec::new();
    #[cfg(target_os = "linux")]
    {
        chu.push(PathBuf::from("/usr/share/hunspell"));
        chu.push(PathBuf::from("/usr/share/myspell"));
        chu.push(PathBuf::from("/usr/share/myspell/dicts"));
        chu.push(PathBuf::from("/usr/local/share/hunspell"));
    }
    #[cfg(target_os = "macos")]
    {
        chu.push(PathBuf::from("/Library/Spelling"));
        if let Some(jia_3) = std::env::var_os("HOME") {
            chu.push(PathBuf::from(jia_3).join("Library/Spelling"));
        }
    }
    #[cfg(target_os = "windows")]
    {
        let pan = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        chu.push(PathBuf::from(format!(
            "{pan}\\Program Files\\LibreOffice\\share\\extensions"
        )));
    }
    chu
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

fn gui_yi(biao_qian: &str) -> String {
    biao_qian
        .chars()
        .map(|c| match c {
            '-' | '_' => '_',
            c => c.to_ascii_lowercase(),
        })
        .collect()
}

fn directory_li_zhao_yi_dui(
    directory_2: &Path,
    biao_qian: &str,
) -> Option<(Option<PathBuf>, PathBuf)> {
    let xiang_yao = gui_yi(biao_qian);
    let mut dic = None;
    let mut aff = None;
    for tiao in std::fs::read_dir(directory_2).ok()?.flatten() {
        let path_3 = tiao.path();
        if !path_3.is_file() {
            continue;
        }
        let Some(extension_2) = path_3.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        let Some(jing_2) = path_3.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if gui_yi(jing_2) != xiang_yao {
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

pub fn zhao_yi_dui(
    biao_qian: &str,
    yong_hu_directory: Option<&Path>,
) -> Option<(Option<PathBuf>, PathBuf)> {
    if let Some(directory_2) = yong_hu_directory {
        if let Some(dui) = directory_li_zhao_yi_dui(directory_2, biao_qian) {
            return Some(dui);
        }
    }
    for directory_2 in xi_tong_ci_dian_directory_men() {
        if let Some(dui) = directory_li_zhao_yi_dui(&directory_2, biao_qian) {
            return Some(dui);
        }
    }
    None
}

pub fn lie_chu(yong_hu_directory: Option<&Path>) -> Vec<DictionaryEntry> {
    let mut ge_fang_xiang: Vec<(DictionarySource, PathBuf)> = Vec::new();
    if let Some(directory_2) = yong_hu_directory {
        ge_fang_xiang.push((DictionarySource::User, directory_2.to_path_buf()));
    }
    for directory_2 in xi_tong_ci_dian_directory_men() {
        ge_fang_xiang.push((DictionarySource::System, directory_2));
    }
    lie_chu_cong(ge_fang_xiang)
}

fn lie_chu_cong(ge_fang_xiang: Vec<(DictionarySource, PathBuf)>) -> Vec<DictionaryEntry> {
    let mut chu: Vec<DictionaryEntry> = Vec::new();
    let mut jian_guo: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (source_2, directory_2) in ge_fang_xiang {
        let Ok(tiao_mu_men) = std::fs::read_dir(&directory_2) else {
            continue;
        };
        for tiao in tiao_mu_men.flatten() {
            let path_3 = tiao.path();
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
            let Some(jing_2) = path_3.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };

            if gui_yi(jing_2) == "index" {
                continue;
            }
            if !jian_guo.insert(gui_yi(jing_2)) {
                continue;
            }
            chu.push(DictionaryEntry {
                tag: jing_2.to_string(),
                source_2,
                directory_2: directory_2.display().to_string(),
            });
        }
    }
    chu.sort_by(|a, b| a.tag.cmp(&b.tag));
    chu
}

fn biao_qian_of(bao_nei_path: &str) -> Option<String> {
    let duan: Vec<&str> = bao_nei_path.split('/').filter(|s| !s.is_empty()).collect();
    let file_3 = *duan.last()?;
    let jing_2 = file_3.rsplit_once('.').map(|(a, _)| a).unwrap_or(file_3);
    if !jing_2.eq_ignore_ascii_case("index") {
        return Some(jing_2.to_string());
    }

    Some(duan.get(duan.len().checked_sub(2)?)?.to_string())
}

struct DictionaryArchive {
    biao_qian: String,
    aff: Option<Vec<u8>>,
    dic: Option<Vec<u8>>,
}

pub fn dao_ru_ya_suo_bao(path_3: &Path) -> Result<String> {
    let zi_jie = std::fs::read(path_3)
        .map_err(|e| NotaError::other(format!("Could not read this file: {e}")))?;
    let mut ar = zip::ZipArchive::new(std::io::Cursor::new(zi_jie))
        .map_err(|e| NotaError::other(format!("This is not a readable ZIP package: {e}")))?;

    let mut dui_men: Vec<DictionaryArchive> = Vec::new();
    let mut zong: u64 = 0;
    for i in 0..ar.len() {
        let Ok(mut e) = ar.by_index(i) else { continue };
        if e.is_dir() {
            continue;
        }
        let name_2 = e.name().to_string();

        let mo_duan = name_2.rsplit('/').next().unwrap_or("");
        if name_2.starts_with("__MACOSX/") || mo_duan.starts_with("._") {
            continue;
        }
        let extension_2 = mo_duan
            .rsplit('.')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();
        if extension_2 != "aff" && extension_2 != "dic" {
            continue;
        }
        let Some(biao_qian) = biao_qian_of(&name_2) else {
            continue;
        };
        let mut content_2 = Vec::new();

        if e.by_ref()
            .take(JIE_BAO_SHANG_XIAN + 1)
            .read_to_end(&mut content_2)
            .is_err()
        {
            continue;
        }
        zong += content_2.len() as u64;
        if zong > JIE_BAO_SHANG_XIAN {
            return Err(NotaError::other(
                "The extracted ZIP is too large to be a dictionary".to_string(),
            ));
        }
        match dui_men
            .iter_mut()
            .find(|f| gui_yi(&f.biao_qian) == gui_yi(&biao_qian))
        {
            Some(cao) => {
                if extension_2 == "aff" {
                    cao.aff = Some(content_2);
                } else {
                    cao.dic = Some(content_2);
                }
            }
            None => dui_men.push(DictionaryArchive {
                biao_qian,
                aff: (extension_2 == "aff").then_some(content_2.clone()),
                dic: (extension_2 == "dic").then_some(content_2),
            }),
        }
    }

    let Some(shi_dao) = dui_men.into_iter().find(|f| f.dic.is_some()) else {
        return Err(NotaError::other(
            "The ZIP does not contain a required `.dic` word list".to_string(),
        ));
    };

    let target_directory = yong_hu_ci_dian_directory()?;
    std::fs::create_dir_all(&target_directory)
        .map_err(|e| NotaError::other(format!("Could not create the dictionary directory: {e}")))?;
    let ci_table = shi_dao.dic.expect("already checked with dic.is_some()");
    std::fs::write(
        target_directory.join(format!("{}.dic", shi_dao.biao_qian)),
        ci_table,
    )
    .map_err(|e| NotaError::other(format!("Could not write the word list: {e}")))?;
    let aff = shi_dao
        .aff
        .unwrap_or_else(|| zui_xiao_affix().as_bytes().to_vec());
    std::fs::write(
        target_directory.join(format!("{}.aff", shi_dao.biao_qian)),
        aff,
    )
    .map_err(|e| NotaError::other(format!("Could not write the affix configuration: {e}")))?;

    Ok(shi_dao.biao_qian)
}

pub fn zui_xiao_affix() -> &'static str {
    "SET UTF-8\n"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lian_zi_fu_yu_xia_hua_xian_shi_tong_yi_men_language() {
        assert_eq!(gui_yi("en-US"), gui_yi("en_US"));
        assert_eq!(gui_yi("EN_us"), gui_yi("en_US"));
        assert_ne!(gui_yi("en_US"), gui_yi("en_GB"));
    }

    #[test]
    fn bao_li_de_biao_qian_an_san_zhong_xian_chang_qu() {
        assert_eq!(biao_qian_of("en_US.dic").unwrap(), "en_US");

        assert_eq!(biao_qian_of("en_US/en_US.aff").unwrap(), "en_US");

        assert_eq!(
            biao_qian_of("dictionaries/en-US/index.aff").unwrap(),
            "en-US"
        );
    }

    #[test]
    fn yong_hu_zai_na_ge_directory_jiu_xian_kan_na_ge() {
        let root_2 = std::env::temp_dir().join(format!("nota-store-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        let yong_hu = root_2.join("user");
        std::fs::create_dir_all(&yong_hu).unwrap();
        std::fs::write(yong_hu.join("en_US.dic"), "1\nmine\n").unwrap();

        let (aff, dic) = zhao_yi_dui("en_US", Some(&yong_hu)).unwrap();
        assert!(dic.starts_with(&yong_hu));
        assert!(aff.is_none(), "\u{53ea}\u{6709}\u{8bcd}\u{8868}\u{65f6} aff \u{8be5}\u{662f} None\u{ff0c}\u{522b}\u{51ed}\u{7a7a}\u{9020}\u{4e00}\u{4efd}");

        assert!(zhao_yi_dui("en-us", Some(&yong_hu)).is_some());

        assert!(zhao_yi_dui("zz_ZZ", Some(&yong_hu)).is_none());
        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn lie_chu_lai_de_bu_xu_zhong_yang_yong_hu_na_ben_gai_zhu_xi_tong_na_ben() {
        let root_2 = std::env::temp_dir().join(format!("nota-store-list-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        let yong_hu = root_2.join("user");
        let xi_tong = root_2.join("sys");
        std::fs::create_dir_all(&yong_hu).unwrap();
        std::fs::create_dir_all(&xi_tong).unwrap();

        std::fs::write(yong_hu.join("de_DE.dic"), "1\nhallo\n").unwrap();
        std::fs::write(yong_hu.join("en_US.dic"), "1\nmine\n").unwrap();
        std::fs::write(xi_tong.join("en_US.dic"), "1\nours\n").unwrap();
        std::fs::write(xi_tong.join("fr_FR.dic"), "1\nbonjour\n").unwrap();

        std::fs::write(yong_hu.join("index.dic"), "1\nx\n").unwrap();
        std::fs::write(yong_hu.join("notes.txt"), "x").unwrap();

        let chu = lie_chu_cong(vec![
            (DictionarySource::User, yong_hu.clone()),
            (DictionarySource::System, xi_tong),
        ]);
        let biao_qian_men: Vec<&str> = chu.iter().map(|d| d.tag.as_str()).collect();
        assert_eq!(biao_qian_men, vec!["de_DE", "en_US", "fr_FR"]);
        assert_eq!(
            chu.iter().find(|d| d.tag == "en_US").unwrap().source_2,
            DictionarySource::User
        );
        assert_eq!(
            chu.iter().find(|d| d.tag == "fr_FR").unwrap().source_2,
            DictionarySource::System
        );
        let _ = std::fs::remove_dir_all(&root_2);
    }

    static TEST_ENVIRONMENT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn dao_ru_yi_ge_zhen_zip_san_zhong_xian_chang_dou_luo_de_xia_qu() {
        use std::io::Write as _;
        let _guard = TEST_ENVIRONMENT_LOCK
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let root_2 = std::env::temp_dir().join(format!("nota-store-zip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        std::fs::create_dir_all(&root_2).unwrap();
        let jiu = std::env::var_os("XDG_CONFIG_HOME");
        std::env::set_var("XDG_CONFIG_HOME", &root_2);

        for (dang, tiao_mu_men) in [
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
            let bao = root_2.join(format!("{dang}.zip"));
            let mut write_2 = zip::ZipWriter::new(std::fs::File::create(&bao).unwrap());
            let xuan_xiang = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for (ming, wen) in tiao_mu_men {
                write_2.start_file(ming, xuan_xiang).unwrap();
                write_2.write_all(wen.as_bytes()).unwrap();
            }
            write_2.finish().unwrap();

            let biao_qian =
                dao_ru_ya_suo_bao(&bao).expect("\u{5bfc}\u{5165}\u{8be5}\u{6210}\u{529f}");
            assert_eq!(biao_qian, dang);
            let target_3 = yong_hu_ci_dian_directory().unwrap();
            let ci_table = std::fs::read_to_string(target_3.join(format!("{dang}.dic"))).unwrap();
            assert!(
                ci_table.contains("2\n") || ci_table.starts_with('1'),
                "\u{8bcd}\u{8868}\u{5185}\u{5bb9}\u{4e0d}\u{5bf9}\u{ff1a}{ci_table}"
            );

            assert!(
                target_3.join(format!("{dang}.aff")).is_file(),
                "\u{6ca1}\u{843d} aff\u{ff1a}{dang}"
            );
        }

        let kong_bao = root_2.join("\u{7a7a}.zip");
        let mut write_2 = zip::ZipWriter::new(std::fs::File::create(&kong_bao).unwrap());
        write_2
            .start_file("readme.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        write_2.write_all(b"not a dictionary").unwrap();
        write_2.finish().unwrap();
        assert!(dao_ru_ya_suo_bao(&kong_bao).is_err(), "\u{4e00}\u{4e2a}\u{6ca1}\u{6709} .dic \u{7684}\u{5305}\u{4e0d}\u{8be5}\u{88ab}\u{5f53}\u{6210}\u{8bcd}\u{5178}");

        match jiu {
            Some(v) => std::env::set_var("XDG_CONFIG_HOME", v),
            None => std::env::remove_var("XDG_CONFIG_HOME"),
        }
        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn dao_ru_de_san_zhong_xian_chang_dou_ren_de_chu_lai() {
        let ping_pu = biao_qian_of("en_US.dic").unwrap();
        let dai_directory = biao_qian_of("en_US/en_US.aff").unwrap();
        let wooorm = biao_qian_of("dictionaries/en-US/index.dic").unwrap();
        assert_eq!(
            (ping_pu.as_str(), dai_directory.as_str(), wooorm.as_str()),
            ("en_US", "en_US", "en-US")
        );
    }
}
