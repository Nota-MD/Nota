use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::NotaError;
use crate::paths;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableWidthRecord {
    pub document_2: PathBuf,

    pub fingerprint_2: String,

    pub width_2: Vec<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct TableWidthArchive {
    #[serde(default)]
    widths: BTreeMap<String, BTreeMap<String, Vec<u32>>>,
}

const FILE_TOU: &str = "# Nota table width sidecar data.\n# Deleting this file resets all tables to automatic widths without changing Markdown files.\n# Records are keyed by document path and become inactive when a document moves.\n";

fn path_jian(document_2: &Path) -> String {
    document_2.to_string_lossy().into_owned()
}

fn zhan_kai(archive_2: TableWidthArchive) -> Vec<TableWidthRecord> {
    let mut out = Vec::new();
    for (path_3, table_men) in archive_2.widths {
        for (fingerprint_2, width_2) in table_men {
            out.push(TableWidthRecord {
                document_2: PathBuf::from(path_3.as_str()),
                fingerprint_2,
                width_2,
            });
        }
    }
    out
}

fn receive_long(ji_lu_men: &[TableWidthRecord]) -> TableWidthArchive {
    let mut archive_2 = TableWidthArchive::default();
    for r in ji_lu_men {
        if r.width_2.is_empty() {
            continue;
        }
        archive_2
            .widths
            .entry(path_jian(&r.document_2))
            .or_default()
            .insert(r.fingerprint_2.clone(), r.width_2.clone());
    }
    archive_2
}

pub fn cong_text(text: &str) -> Vec<TableWidthRecord> {
    zhan_kai(toml::from_str::<TableWidthArchive>(text).unwrap_or_default())
}

pub fn dao_text(ji_lu_men: &[TableWidthRecord]) -> Result<String, String> {
    archive_dao_text(&receive_long(ji_lu_men))
}

fn archive_dao_text(archive_2: &TableWidthArchive) -> Result<String, String> {
    let body = toml::to_string_pretty(archive_2)
        .map_err(|e| format!("Could not serialize table widths as TOML (internal error): {e}"))?;
    Ok(format!("{FILE_TOU}{body}"))
}

fn read_archive_2(ce_che: &Path) -> TableWidthArchive {
    let Ok(text) = std::fs::read_to_string(ce_che) else {
        return TableWidthArchive::default();
    };
    match toml::from_str::<TableWidthArchive>(&text) {
        Ok(s) => s,
        Err(e) => {
            crate::debug_log!(
                "[nota] table-width file unreadable; using empty state: {}: {e}",
                ce_che.display()
            );
            TableWidthArchive::default()
        }
    }
}

fn write_archive(ce_che: &Path, archive_2: &TableWidthArchive) -> Result<(), NotaError> {
    let text = archive_dao_text(archive_2).map_err(NotaError::other)?;
    if let Some(fu) = ce_che.parent() {
        paths::ensure_dir(fu)?;
    }

    std::fs::write(ce_che, text).map_err(|source| NotaError::Write {
        path: ce_che.to_path_buf(),
        source,
    })
}

fn error_message(error: NotaError) -> String {
    format!("Could not save table widths: {error}")
}

pub fn read_2() -> Vec<TableWidthRecord> {
    match paths::table_widths_file() {
        Ok(ce_che) => read_file_2(&ce_che),

        Err(e) => {
            crate::debug_log!("[nota] table-width path unavailable; using empty state: {e}");
            Vec::new()
        }
    }
}

pub fn read_file_2(ce_che: &Path) -> Vec<TableWidthRecord> {
    zhan_kai(read_archive_2(ce_che))
}

pub fn write_file_2(ce_che: &Path, ji_lu_men: &[TableWidthRecord]) -> Result<(), String> {
    write_archive(ce_che, &receive_long(ji_lu_men)).map_err(error_message)
}

pub fn qu_2(document_2: &Path) -> Vec<TableWidthRecord> {
    match paths::table_widths_file() {
        Ok(ce_che) => qu_file(&ce_che, document_2),
        Err(e) => {
            crate::debug_log!("[nota] table-width path unavailable; using empty state: {e}");
            Vec::new()
        }
    }
}

pub fn qu_file(ce_che: &Path, document_2: &Path) -> Vec<TableWidthRecord> {
    let mut archive_2 = read_archive_2(ce_che);
    match archive_2.widths.remove(&path_jian(document_2)) {
        Some(table_men) => table_men
            .into_iter()
            .map(|(fingerprint_2, width_2)| TableWidthRecord {
                document_2: document_2.to_path_buf(),
                fingerprint_2,
                width_2,
            })
            .collect(),
        None => Vec::new(),
    }
}

pub fn ji(document_2: &Path, fingerprint_2: &str, width_2: &[u32]) -> Result<(), String> {
    ji_file(
        &paths::table_widths_file().map_err(error_message)?,
        document_2,
        fingerprint_2,
        width_2,
    )
}

pub fn ji_file(
    ce_che: &Path,
    document_2: &Path,
    fingerprint_2: &str,
    width_2: &[u32],
) -> Result<(), String> {
    let mut archive_2 = read_archive_2(ce_che);
    let jian_2 = path_jian(document_2);

    let yuan_lai_zhe_yi_tiao = archive_2
        .widths
        .get(&jian_2)
        .and_then(|table_men| table_men.get(fingerprint_2));
    let yao_write_de = if width_2.is_empty() {
        None
    } else {
        Some(width_2.to_vec())
    };

    if yuan_lai_zhe_yi_tiao == yao_write_de.as_ref() {
        return Ok(());
    }

    let table_men = archive_2.widths.entry(jian_2.clone()).or_default();
    match yao_write_de {
        Some(kuan) => {
            table_men.insert(fingerprint_2.to_string(), kuan);
        }
        None => {
            table_men.remove(fingerprint_2);
        }
    }

    if archive_2
        .widths
        .get(&jian_2)
        .is_some_and(|table_men| table_men.is_empty())
    {
        archive_2.widths.remove(&jian_2);
    }

    write_archive(ce_che, &archive_2).map_err(error_message)
}

pub fn forget(document_2: &Path) -> Result<(), String> {
    forget_file(
        &paths::table_widths_file().map_err(error_message)?,
        document_2,
    )
}

pub fn replace_path(lao: &Path, xin: &Path) -> Result<(), String> {
    replace_path_file(
        &paths::table_widths_file().map_err(error_message)?,
        lao,
        xin,
    )
}

pub fn replace_path_file(ce_che: &Path, lao: &Path, xin: &Path) -> Result<(), String> {
    let lao_jian = path_jian(lao);
    let xin_jian = path_jian(xin);
    if lao_jian == xin_jian {
        return Ok(());
    }

    let mut archive_2 = read_archive_2(ce_che);
    let table_men = match archive_2.widths.remove(&lao_jian) {
        Some(table_men) => table_men,
        None => return Ok(()),
    };

    archive_2.widths.insert(xin_jian, table_men);
    write_archive(ce_che, &archive_2).map_err(error_message)
}

pub fn forget_file(ce_che: &Path, document_2: &Path) -> Result<(), String> {
    let mut archive_2 = read_archive_2(ce_che);
    if archive_2.widths.remove(&path_jian(document_2)).is_none() {
        return Ok(());
    }
    write_archive(ce_che, &archive_2).map_err(error_message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_directory(ming: &str) -> PathBuf {
        static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);
        let wei_yi = format!(
            "{}-{}-{}",
            std::process::id(),
            TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let directory_2 = std::env::temp_dir().join(format!(
            "nota-\u{8868}\u{683c}\u{5bbd}\u{5ea6}-{wei_yi}-{ming}"
        ));
        std::fs::create_dir_all(&directory_2).expect("\u{5efa}\u{4e34}\u{65f6}\u{76ee}\u{5f55}");
        directory_2
    }

    fn receive_tan(directory_2: &Path) {
        let _ = std::fs::remove_dir_all(directory_2);
    }

    #[test]
    fn read_bu_dao_file_dang_kong_de() {
        let directory_2 = temp_directory("\u{8bfb}\u{4e0d}\u{5230}");
        let ce_che = directory_2.join("\u{5bbd}\u{5ea6}.toml");

        assert!(
            read_file_2(&ce_che).is_empty(),
            "\u{6587}\u{4ef6}\u{4e0d}\u{5728}\u{5c31}\u{8be5}\u{662f}\u{7a7a}\u{7684}"
        );
        assert!(
            cong_text("").is_empty(),
            "\u{7a7a}\u{6587}\u{672c}\u{4e5f}\u{662f}\u{7a7a}\u{7684}"
        );
        assert!(cong_text(FILE_TOU).is_empty(), "\u{53ea}\u{6709}\u{6ce8}\u{91ca}\u{7684}\u{6587}\u{4ef6}\u{540c}\u{6837}\u{662f}\u{7a7a}\u{7684}");
        assert!(qu_file(&ce_che, &directory_2.join("\u{6ca1}\u{8bb0}\u{8fc7}.md")).is_empty());

        receive_tan(&directory_2);
    }

    #[test]
    fn write_wan_neng_read_hui_lai_zhong_wen_path_yu_zhong_wen_fingerprint() {
        let directory_2 = temp_directory("\u{5f80}\u{8fd4}");
        let ce_che = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let document_2 = directory_2.join("\u{7b2c}\u{4e00}\u{7ae0} \u{7eea}\u{8bba}.md");
        let ji_lu_men = vec![
            TableWidthRecord {
                document_2: document_2.clone(),
                fingerprint_2:
                    "\u{8868}\u{5934}:\u{59d3}\u{540d}|\u{5e74}\u{9f84}|\u{5907}\u{6ce8}"
                        .to_string(),
                width_2: vec![160, 240, 96],
            },
            TableWidthRecord {
                document_2: document_2.clone(),
                fingerprint_2: "\u{7b2c}\u{4e8c}\u{5f20}\u{8868}".to_string(),
                width_2: vec![80],
            },
        ];

        write_file_2(&ce_che, &ji_lu_men).expect("\u{5199}\u{76d8}");

        let text_2 = std::fs::read_to_string(&ce_che).expect("\u{8bfb}\u{76d8}");
        assert!(
            text_2.contains("\u{7b2c}\u{4e00}\u{7ae0} \u{7eea}\u{8bba}.md"),
            "\u{8def}\u{5f84}\u{8981}\u{5728}\u{6587}\u{4ef6}\u{91cc}\u{ff1a}{text_2}"
        );
        assert!(
            text_2.contains("\u{8868}\u{5934}:\u{59d3}\u{540d}|\u{5e74}\u{9f84}|\u{5907}\u{6ce8}"),
            "\u{4e2d}\u{6587}\u{6307}\u{7eb9}\u{8981}\u{5728}\u{6587}\u{4ef6}\u{91cc}\u{ff1a}{text_2}"
        );
        assert!(
            text_2.starts_with('#'),
            "\u{6587}\u{4ef6}\u{5934}\u{8981}\u{5728}\u{6700}\u{524d}\u{9762}\u{ff1a}{text_2}"
        );

        let hui_2 = read_file_2(&ce_che);
        assert_eq!(hui_2.len(), 2);
        assert!(
            hui_2.contains(&ji_lu_men[0]),
            "\u{5f80}\u{8fd4}\u{8981}\u{4e00}\u{6a21}\u{4e00}\u{6837}\u{ff1a}{hui_2:?}"
        );
        assert!(hui_2.contains(&ji_lu_men[1]));
        assert_eq!(qu_file(&ce_che, &document_2).len(), 2, "\u{540c}\u{4e00}\u{4efd}\u{6587}\u{6863}\u{7684}\u{4e24}\u{6761}\u{90fd}\u{53d6}\u{5f97}\u{5230}");

        assert_eq!(
            dao_text(&ji_lu_men).unwrap(),
            dao_text(&read_file_2(&ce_che)).unwrap()
        );

        receive_tan(&directory_2);
    }

    #[test]
    fn tong_document_tong_fingerprint_shi_fu_gai_bu_shi_die_jia() {
        let directory_2 = temp_directory("\u{8986}\u{76d6}");
        let ce_che = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let document_2 = directory_2.join("\u{7b14}\u{8bb0}.md");

        ji_file(&ce_che, &document_2, "\u{8868}\u{4e00}", &[100, 200]).unwrap();
        ji_file(&ce_che, &document_2, "\u{8868}\u{4e00}", &[300]).unwrap();

        let qu_hui = qu_file(&ce_che, &document_2);
        assert_eq!(qu_hui.len(), 1, "\u{540c}\u{6587}\u{6863}\u{540c}\u{6307}\u{7eb9}\u{53ea}\u{80fd}\u{6709}\u{4e00}\u{6761}\u{ff1a}{qu_hui:?}");
        assert_eq!(
            qu_hui[0].width_2,
            vec![300],
            "\u{7559}\u{4e0b}\u{7684}\u{662f}\u{540e}\u{8bb0}\u{7684}\u{90a3}\u{4e00}\u{4efd}"
        );

        ji_file(&ce_che, &document_2, "\u{8868}\u{4e8c}", &[7]).unwrap();
        assert_eq!(qu_file(&ce_che, &document_2).len(), 2);

        receive_tan(&directory_2);
    }

    #[test]
    fn forget_diao_zhi_hou_qu_bu_dao() {
        let directory_2 = temp_directory("\u{5fd8}");
        let ce_che = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let jia_4 = directory_2.join("\u{7532}.md");
        let yi_2 = directory_2.join("\u{4e59}.md");
        ji_file(&ce_che, &jia_4, "\u{8868}\u{4e00}", &[10]).unwrap();
        ji_file(&ce_che, &yi_2, "\u{8868}\u{4e00}", &[20]).unwrap();

        forget_file(&ce_che, &jia_4).unwrap();
        assert!(
            qu_file(&ce_che, &jia_4).is_empty(),
            "\u{5fd8}\u{6389}\u{7684}\u{90a3}\u{4efd}\u{53d6}\u{4e0d}\u{5230}"
        );
        assert_eq!(
            qu_file(&ce_che, &yi_2).len(),
            1,
            "\u{522b}\u{7684}\u{6587}\u{6863}\u{4e00}\u{6761}\u{90fd}\u{4e0d}\u{8bb8}\u{52a8}\u{ff1a}{:?}",
            read_file_2(&ce_che)
        );

        forget_file(&ce_che, &jia_4).unwrap();

        receive_tan(&directory_2);
    }

    #[test]
    fn gai_ming_zhi_hou_lie_kuan_gen_zhe_ban_guo_qu() {
        let directory_2 = temp_directory("\u{6539}\u{8def}\u{5f84}");
        let ce_che = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let lao = directory_2.join("\u{8001}\u{540d}\u{5b57}.md");
        let xin = directory_2.join("\u{65b0}\u{540d}\u{5b57}.md");
        let bie_de = directory_2.join("\u{522b}\u{7684}.md");
        ji_file(&ce_che, &lao, "\u{8868}\u{4e00}", &[160, 240]).unwrap();
        ji_file(&ce_che, &lao, "\u{8868}\u{4e8c}", &[80]).unwrap();
        ji_file(&ce_che, &bie_de, "\u{8868}\u{4e00}", &[10]).unwrap();

        replace_path_file(&ce_che, &lao, &xin).unwrap();

        assert_eq!(
            qu_file(&ce_che, &xin)
                .iter()
                .map(|r| (r.fingerprint_2.clone(), r.width_2.clone()))
                .collect::<Vec<_>>(),
            vec![
                ("\u{8868}\u{4e00}".to_string(), vec![160, 240]),
                ("\u{8868}\u{4e8c}".to_string(), vec![80])
            ],
            "\u{4e24}\u{5f20}\u{8868}\u{7684}\u{5217}\u{5bbd}\u{90fd}\u{8981}\u{5728}\u{ff0c}\u{4e14}\u{5bbd}\u{5ea6}\u{539f}\u{6837}"
        );
        assert!(
            qu_file(&ce_che, &lao).is_empty(),
            "\u{8001}\u{8def}\u{5f84}\u{90a3}\u{4efd}\u{8981}\u{6e05}\u{6389}"
        );
        assert_eq!(
            qu_file(&ce_che, &bie_de).len(),
            1,
            "\u{522b}\u{7684}\u{6587}\u{6863}\u{4e00}\u{6761}\u{90fd}\u{4e0d}\u{8bb8}\u{52a8}"
        );

        receive_tan(&directory_2);
    }

    #[test]
    fn mei_you_ji_lu_de_file_gai_ming_bu_write_pan() {
        let directory_2 = temp_directory("\u{6539}\u{8def}\u{5f84}\u{6ca1}\u{8bb0}\u{5f55}");
        let ce_che = directory_2.join("\u{4fa7}\u{8f66}.toml");

        replace_path_file(
            &ce_che,
            &directory_2.join("\u{7532}.md"),
            &directory_2.join("\u{4e59}.md"),
        )
        .unwrap();

        assert!(!ce_che.exists(), "\u{6ca1}\u{6709}\u{5b83}\u{7684}\u{8bb0}\u{5f55}\u{5c31}\u{4e0d}\u{8be5}\u{9020}\u{51fa}\u{6587}\u{4ef6}\u{6765}");
        receive_tan(&directory_2);
    }

    #[test]
    fn huai_diao_de_toml_dang_kong_de_yong() {
        let directory_2 = temp_directory("\u{574f}\u{6587}\u{4ef6}");
        let ce_che = directory_2.join("\u{4fa7}\u{8f66}.toml");
        std::fs::write(&ce_che, "\u{8fd9}\u{4e0d}\u{662f} TOML {{{ [").unwrap();

        assert!(
            read_file_2(&ce_che).is_empty(),
            "\u{574f}\u{6587}\u{4ef6}\u{5f53}\u{7a7a}\u{7684}"
        );
        assert!(cong_text("\u{8fd9}\u{4e0d}\u{662f} TOML {{{ [").is_empty());
        assert!(
            cong_text("[widths]\n\"a\" = \"\u{4e0d}\u{662f}\u{6570}\u{7ec4}\"").is_empty(),
            "\u{7c7b}\u{578b}\u{4e0d}\u{5bf9}\u{ff08}\u{8be5}\u{662f}\u{6570}\u{7ec4}\u{7684}\u{5730}\u{65b9}\u{7ed9}\u{4e86}\u{5b57}\u{7b26}\u{4e32}\u{ff09}\u{4e5f}\u{662f}\u{7a7a}\u{7684}"
        );

        let document_2 = directory_2.join("\u{7b14}\u{8bb0}.md");
        ji_file(&ce_che, &document_2, "\u{8868}\u{4e00}", &[42]).unwrap();
        assert_eq!(qu_file(&ce_che, &document_2)[0].width_2, vec![42]);

        receive_tan(&directory_2);
    }

    #[test]
    fn kong_width_deng_yu_shan_diao_zhe_tiao_ji_lu() {
        let directory_2 = temp_directory("\u{7a7a}\u{5bbd}\u{5ea6}");
        let ce_che = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let document_2 = directory_2.join("\u{7b14}\u{8bb0}.md");
        ji_file(&ce_che, &document_2, "\u{8868}\u{4e00}", &[10, 20]).unwrap();
        ji_file(&ce_che, &document_2, "\u{8868}\u{4e8c}", &[30]).unwrap();

        ji_file(&ce_che, &document_2, "\u{8868}\u{4e00}", &[]).unwrap();
        let sheng = qu_file(&ce_che, &document_2);
        assert_eq!(sheng.len(), 1, "\u{5220}\u{6389}\u{7684}\u{90a3}\u{6761}\u{4e0d}\u{8be5}\u{8fd8}\u{5728}\u{ff1a}{sheng:?}");
        assert_eq!(sheng[0].fingerprint_2, "\u{8868}\u{4e8c}");

        ji_file(&ce_che, &document_2, "\u{8868}\u{4e8c}", &[]).unwrap();
        assert!(qu_file(&ce_che, &document_2).is_empty());
        assert!(read_file_2(&ce_che).is_empty());

        let text_2 = std::fs::read_to_string(&ce_che).expect("\u{8bfb}\u{76d8}");
        assert!(!text_2.contains("\u{7b14}\u{8bb0}.md"), "\u{7a7a}\u{58f3}\u{7684}\u{90a3}\u{4e00}\u{8282}\u{8981}\u{4e00}\u{8d77}\u{6d88}\u{5931}\u{ff1a}{text_2}");
        assert!(!text_2.contains("\u{8868}\u{4e8c}"), "\u{7a7a}\u{6570}\u{7ec4}\u{4e0d}\u{8be5}\u{88ab}\u{5199}\u{51fa}\u{6765}\u{ff1a}{text_2}");

        receive_tan(&directory_2);
    }

    #[test]
    fn yi_fen_document_de_duo_tiao_ji_lu_bu_hu_xiang_chuan() {
        let directory_2 = temp_directory("\u{4e0d}\u{4e32}");
        let ce_che = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let jia_directory = directory_2.join("\u{7532}");
        let yi_directory = directory_2.join("\u{4e59}");
        std::fs::create_dir_all(&jia_directory).unwrap();
        std::fs::create_dir_all(&yi_directory).unwrap();
        let jia_4 = jia_directory.join("\u{7b14}\u{8bb0}.md");
        let yi_2 = yi_directory.join("\u{7b14}\u{8bb0}.md");

        ji_file(&ce_che, &jia_4, "\u{8868}\u{4e00}", &[1, 2]).unwrap();
        ji_file(&ce_che, &jia_4, "\u{8868}\u{4e8c}", &[3]).unwrap();
        ji_file(&ce_che, &yi_2, "\u{8868}\u{4e00}", &[9]).unwrap();

        assert_eq!(qu_file(&ce_che, &jia_4).len(), 2);
        assert_eq!(qu_file(&ce_che, &yi_2).len(), 1, "\u{540c}\u{540d}\u{7684}\u{90a3}\u{4e00}\u{4efd}\u{4e0d}\u{80fd}\u{88ab}\u{6df7}\u{8fdb}\u{6765}");
        assert_eq!(qu_file(&ce_che, &yi_2)[0].width_2, vec![9]);

        receive_tan(&directory_2);
    }

    #[test]
    fn width_an_u32_yuan_yang_wang_fan() {
        let directory_2 = temp_directory("\u{539f}\u{6837}");
        let ce_che = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let document_2 = directory_2.join("\u{7b14}\u{8bb0}.md");
        let width_2 = vec![0, u32::MAX, 3, 3, 1];

        ji_file(&ce_che, &document_2, "\u{8868}\u{4e00}", &width_2).unwrap();

        assert_eq!(qu_file(&ce_che, &document_2)[0].width_2, width_2);
        assert_eq!(
            read_file_2(&ce_che)[0].width_2,
            width_2,
            "\u{4ece}\u{76d8}\u{4e0a}\u{8bfb}\u{56de}\u{6765}\u{4e5f}\u{8981}\u{4e00}\u{6837}"
        );

        receive_tan(&directory_2);
    }
}
