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

const FILE_HEADER: &str = "# Nota table width sidecar data.\n# Deleting this file resets all tables to automatic widths without changing Markdown files.\n# Records are keyed by document path and become inactive when a document moves.\n";

fn path_check(document_2: &Path) -> String {
    document_2.to_string_lossy().into_owned()
}

fn expand_start(archive_2: TableWidthArchive) -> Vec<TableWidthRecord> {
    let mut out = Vec::new();
    for (path_3, table_list) in archive_2.widths {
        for (fingerprint_2, width_2) in table_list {
            out.push(TableWidthRecord {
                document_2: PathBuf::from(path_3.as_str()),
                fingerprint_2,
                width_2,
            });
        }
    }
    out
}

fn receive_long(record_path_list: &[TableWidthRecord]) -> TableWidthArchive {
    let mut archive_2 = TableWidthArchive::default();
    for r in record_path_list {
        if r.width_2.is_empty() {
            continue;
        }
        archive_2
            .widths
            .entry(path_check(&r.document_2))
            .or_default()
            .insert(r.fingerprint_2.clone(), r.width_2.clone());
    }
    archive_2
}

pub fn from_text(text: &str) -> Vec<TableWidthRecord> {
    expand_start(toml::from_str::<TableWidthArchive>(text).unwrap_or_default())
}

pub fn to_text(record_path_list: &[TableWidthRecord]) -> Result<String, String> {
    archive_to_text(&receive_long(record_path_list))
}

fn archive_to_text(archive_2: &TableWidthArchive) -> Result<String, String> {
    let body = toml::to_string_pretty(archive_2)
        .map_err(|e| format!("Could not serialize table widths as TOML (internal error): {e}"))?;
    Ok(format!("{FILE_HEADER}{body}"))
}

fn read_archive_2(side_carrier: &Path) -> TableWidthArchive {
    let Ok(text) = std::fs::read_to_string(side_carrier) else {
        return TableWidthArchive::default();
    };
    match toml::from_str::<TableWidthArchive>(&text) {
        Ok(s) => s,
        Err(e) => {
            crate::debug_log!(
                "[nota] table-width file unreadable; using empty state: {}: {e}",
                side_carrier.display()
            );
            TableWidthArchive::default()
        }
    }
}

fn write_archive(side_carrier: &Path, archive_2: &TableWidthArchive) -> Result<(), NotaError> {
    let text = archive_to_text(archive_2).map_err(NotaError::other)?;
    if let Some(service) = side_carrier.parent() {
        paths::ensure_dir(service)?;
    }

    std::fs::write(side_carrier, text).map_err(|source| NotaError::Write {
        path: side_carrier.to_path_buf(),
        source,
    })
}

fn error_message(error: NotaError) -> String {
    format!("Could not save table widths: {error}")
}

pub fn read_2() -> Vec<TableWidthRecord> {
    match paths::table_widths_file() {
        Ok(side_carrier) => read_file_2(&side_carrier),

        Err(e) => {
            crate::debug_log!("[nota] table-width path unavailable; using empty state: {e}");
            Vec::new()
        }
    }
}

pub fn read_file_2(side_carrier: &Path) -> Vec<TableWidthRecord> {
    expand_start(read_archive_2(side_carrier))
}

pub fn write_file_2(
    side_carrier: &Path,
    record_path_list: &[TableWidthRecord],
) -> Result<(), String> {
    write_archive(side_carrier, &receive_long(record_path_list)).map_err(error_message)
}

pub fn get_2(document_2: &Path) -> Vec<TableWidthRecord> {
    match paths::table_widths_file() {
        Ok(side_carrier) => get_file(&side_carrier, document_2),
        Err(e) => {
            crate::debug_log!("[nota] table-width path unavailable; using empty state: {e}");
            Vec::new()
        }
    }
}

pub fn get_file(side_carrier: &Path, document_2: &Path) -> Vec<TableWidthRecord> {
    let mut archive_2 = read_archive_2(side_carrier);
    match archive_2.widths.remove(&path_check(document_2)) {
        Some(table_list) => table_list
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

pub fn record(document_2: &Path, fingerprint_2: &str, width_2: &[u32]) -> Result<(), String> {
    record_file(
        &paths::table_widths_file().map_err(error_message)?,
        document_2,
        fingerprint_2,
        width_2,
    )
}

pub fn record_file(
    side_carrier: &Path,
    document_2: &Path,
    fingerprint_2: &str,
    width_2: &[u32],
) -> Result<(), String> {
    let mut archive_2 = read_archive_2(side_carrier);
    let value_2 = path_check(document_2);

    let source_incoming_one_item = archive_2
        .widths
        .get(&value_2)
        .and_then(|table_list| table_list.get(fingerprint_2));
    let need_write = if width_2.is_empty() {
        None
    } else {
        Some(width_2.to_vec())
    };

    if source_incoming_one_item == need_write.as_ref() {
        return Ok(());
    }

    let table_list = archive_2.widths.entry(value_2.clone()).or_default();
    match need_write {
        Some(width) => {
            table_list.insert(fingerprint_2.to_string(), width);
        }
        None => {
            table_list.remove(fingerprint_2);
        }
    }

    if archive_2
        .widths
        .get(&value_2)
        .is_some_and(|table_list| table_list.is_empty())
    {
        archive_2.widths.remove(&value_2);
    }

    write_archive(side_carrier, &archive_2).map_err(error_message)
}

pub fn forget(document_2: &Path) -> Result<(), String> {
    forget_file(
        &paths::table_widths_file().map_err(error_message)?,
        document_2,
    )
}

pub fn replace_path(old: &Path, new: &Path) -> Result<(), String> {
    replace_path_file(
        &paths::table_widths_file().map_err(error_message)?,
        old,
        new,
    )
}

pub fn replace_path_file(side_carrier: &Path, old: &Path, new: &Path) -> Result<(), String> {
    let old_check = path_check(old);
    let new_check = path_check(new);
    if old_check == new_check {
        return Ok(());
    }

    let mut archive_2 = read_archive_2(side_carrier);
    let table_list = match archive_2.widths.remove(&old_check) {
        Some(table_list) => table_list,
        None => return Ok(()),
    };

    archive_2.widths.insert(new_check, table_list);
    write_archive(side_carrier, &archive_2).map_err(error_message)
}

pub fn forget_file(side_carrier: &Path, document_2: &Path) -> Result<(), String> {
    let mut archive_2 = read_archive_2(side_carrier);
    if archive_2.widths.remove(&path_check(document_2)).is_none() {
        return Ok(());
    }
    write_archive(side_carrier, &archive_2).map_err(error_message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_directory(name: &str) -> PathBuf {
        static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);
        let position_one = format!(
            "{}-{}-{}",
            std::process::id(),
            TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let directory_2 = std::env::temp_dir().join(format!(
            "nota-\u{8868}\u{683c}\u{5bbd}\u{5ea6}-{position_one}-{name}"
        ));
        std::fs::create_dir_all(&directory_2).expect("\u{5efa}\u{4e34}\u{65f6}\u{76ee}\u{5f55}");
        directory_2
    }

    fn receive_probe(directory_2: &Path) {
        let _ = std::fs::remove_dir_all(directory_2);
    }

    #[test]
    fn read_not_to_file_when_empty() {
        let directory_2 = temp_directory("\u{8bfb}\u{4e0d}\u{5230}");
        let side_carrier = directory_2.join("\u{5bbd}\u{5ea6}.toml");

        assert!(
            read_file_2(&side_carrier).is_empty(),
            "\u{6587}\u{4ef6}\u{4e0d}\u{5728}\u{5c31}\u{8be5}\u{662f}\u{7a7a}\u{7684}"
        );
        assert!(
            from_text("").is_empty(),
            "\u{7a7a}\u{6587}\u{672c}\u{4e5f}\u{662f}\u{7a7a}\u{7684}"
        );
        assert!(from_text(FILE_HEADER).is_empty(), "\u{53ea}\u{6709}\u{6ce8}\u{91ca}\u{7684}\u{6587}\u{4ef6}\u{540c}\u{6837}\u{662f}\u{7a7a}\u{7684}");
        assert!(get_file(
            &side_carrier,
            &directory_2.join("\u{6ca1}\u{8bb0}\u{8fc7}.md")
        )
        .is_empty());

        receive_probe(&directory_2);
    }

    #[test]
    fn write_complete_can_read_return_incoming_middle_text_path_and_middle_text_fingerprint() {
        let directory_2 = temp_directory("\u{5f80}\u{8fd4}");
        let side_carrier = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let document_2 = directory_2.join("\u{7b2c}\u{4e00}\u{7ae0} \u{7eea}\u{8bba}.md");
        let record_path_list = vec![
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

        write_file_2(&side_carrier, &record_path_list).expect("\u{5199}\u{76d8}");

        let text_2 = std::fs::read_to_string(&side_carrier).expect("\u{8bfb}\u{76d8}");
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

        let return_2 = read_file_2(&side_carrier);
        assert_eq!(return_2.len(), 2);
        assert!(
            return_2.contains(&record_path_list[0]),
            "\u{5f80}\u{8fd4}\u{8981}\u{4e00}\u{6a21}\u{4e00}\u{6837}\u{ff1a}{return_2:?}"
        );
        assert!(return_2.contains(&record_path_list[1]));
        assert_eq!(get_file(&side_carrier, &document_2).len(), 2, "\u{540c}\u{4e00}\u{4efd}\u{6587}\u{6863}\u{7684}\u{4e24}\u{6761}\u{90fd}\u{53d6}\u{5f97}\u{5230}");

        assert_eq!(
            to_text(&record_path_list).unwrap(),
            to_text(&read_file_2(&side_carrier)).unwrap()
        );

        receive_probe(&directory_2);
    }

    #[test]
    fn same_document_same_fingerprint_is_service_change_not_is_stack_add() {
        let directory_2 = temp_directory("\u{8986}\u{76d6}");
        let side_carrier = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let document_2 = directory_2.join("\u{7b14}\u{8bb0}.md");

        record_file(&side_carrier, &document_2, "\u{8868}\u{4e00}", &[100, 200]).unwrap();
        record_file(&side_carrier, &document_2, "\u{8868}\u{4e00}", &[300]).unwrap();

        let get_return = get_file(&side_carrier, &document_2);
        assert_eq!(get_return.len(), 1, "\u{540c}\u{6587}\u{6863}\u{540c}\u{6307}\u{7eb9}\u{53ea}\u{80fd}\u{6709}\u{4e00}\u{6761}\u{ff1a}{get_return:?}");
        assert_eq!(
            get_return[0].width_2,
            vec![300],
            "\u{7559}\u{4e0b}\u{7684}\u{662f}\u{540e}\u{8bb0}\u{7684}\u{90a3}\u{4e00}\u{4efd}"
        );

        record_file(&side_carrier, &document_2, "\u{8868}\u{4e8c}", &[7]).unwrap();
        assert_eq!(get_file(&side_carrier, &document_2).len(), 2);

        receive_probe(&directory_2);
    }

    #[test]
    fn forget_drop_only_after_get_not_to() {
        let directory_2 = temp_directory("\u{5fd8}");
        let side_carrier = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let value_4 = directory_2.join("\u{7532}.md");
        let value_2 = directory_2.join("\u{4e59}.md");
        record_file(&side_carrier, &value_4, "\u{8868}\u{4e00}", &[10]).unwrap();
        record_file(&side_carrier, &value_2, "\u{8868}\u{4e00}", &[20]).unwrap();

        forget_file(&side_carrier, &value_4).unwrap();
        assert!(
            get_file(&side_carrier, &value_4).is_empty(),
            "\u{5fd8}\u{6389}\u{7684}\u{90a3}\u{4efd}\u{53d6}\u{4e0d}\u{5230}"
        );
        assert_eq!(
            get_file(&side_carrier, &value_2).len(),
            1,
            "\u{522b}\u{7684}\u{6587}\u{6863}\u{4e00}\u{6761}\u{90fd}\u{4e0d}\u{8bb8}\u{52a8}\u{ff1a}{:?}",
            read_file_2(&side_carrier)
        );

        forget_file(&side_carrier, &value_4).unwrap();

        receive_probe(&directory_2);
    }

    #[test]
    fn change_name_only_after_list_width_root_half_passed_get() {
        let directory_2 = temp_directory("\u{6539}\u{8def}\u{5f84}");
        let side_carrier = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let old = directory_2.join("\u{8001}\u{540d}\u{5b57}.md");
        let new = directory_2.join("\u{65b0}\u{540d}\u{5b57}.md");
        let other = directory_2.join("\u{522b}\u{7684}.md");
        record_file(&side_carrier, &old, "\u{8868}\u{4e00}", &[160, 240]).unwrap();
        record_file(&side_carrier, &old, "\u{8868}\u{4e8c}", &[80]).unwrap();
        record_file(&side_carrier, &other, "\u{8868}\u{4e00}", &[10]).unwrap();

        replace_path_file(&side_carrier, &old, &new).unwrap();

        assert_eq!(
            get_file(&side_carrier, &new)
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
            get_file(&side_carrier, &old).is_empty(),
            "\u{8001}\u{8def}\u{5f84}\u{90a3}\u{4efd}\u{8981}\u{6e05}\u{6389}"
        );
        assert_eq!(
            get_file(&side_carrier, &other).len(),
            1,
            "\u{522b}\u{7684}\u{6587}\u{6863}\u{4e00}\u{6761}\u{90fd}\u{4e0d}\u{8bb8}\u{52a8}"
        );

        receive_probe(&directory_2);
    }

    #[test]
    fn each_has_record_path_file_change_name_not_write_parse() {
        let directory_2 = temp_directory("\u{6539}\u{8def}\u{5f84}\u{6ca1}\u{8bb0}\u{5f55}");
        let side_carrier = directory_2.join("\u{4fa7}\u{8f66}.toml");

        replace_path_file(
            &side_carrier,
            &directory_2.join("\u{7532}.md"),
            &directory_2.join("\u{4e59}.md"),
        )
        .unwrap();

        assert!(!side_carrier.exists(), "\u{6ca1}\u{6709}\u{5b83}\u{7684}\u{8bb0}\u{5f55}\u{5c31}\u{4e0d}\u{8be5}\u{9020}\u{51fa}\u{6587}\u{4ef6}\u{6765}");
        receive_probe(&directory_2);
    }

    #[test]
    fn broken_drop_toml_when_empty_use() {
        let directory_2 = temp_directory("\u{574f}\u{6587}\u{4ef6}");
        let side_carrier = directory_2.join("\u{4fa7}\u{8f66}.toml");
        std::fs::write(&side_carrier, "\u{8fd9}\u{4e0d}\u{662f} TOML {{{ [").unwrap();

        assert!(
            read_file_2(&side_carrier).is_empty(),
            "\u{574f}\u{6587}\u{4ef6}\u{5f53}\u{7a7a}\u{7684}"
        );
        assert!(from_text("\u{8fd9}\u{4e0d}\u{662f} TOML {{{ [").is_empty());
        assert!(
            from_text("[widths]\n\"a\" = \"\u{4e0d}\u{662f}\u{6570}\u{7ec4}\"").is_empty(),
            "\u{7c7b}\u{578b}\u{4e0d}\u{5bf9}\u{ff08}\u{8be5}\u{662f}\u{6570}\u{7ec4}\u{7684}\u{5730}\u{65b9}\u{7ed9}\u{4e86}\u{5b57}\u{7b26}\u{4e32}\u{ff09}\u{4e5f}\u{662f}\u{7a7a}\u{7684}"
        );

        let document_2 = directory_2.join("\u{7b14}\u{8bb0}.md");
        record_file(&side_carrier, &document_2, "\u{8868}\u{4e00}", &[42]).unwrap();
        assert_eq!(get_file(&side_carrier, &document_2)[0].width_2, vec![42]);

        receive_probe(&directory_2);
    }

    #[test]
    fn empty_width_wait_and_delete_drop_item_record_path() {
        let directory_2 = temp_directory("\u{7a7a}\u{5bbd}\u{5ea6}");
        let side_carrier = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let document_2 = directory_2.join("\u{7b14}\u{8bb0}.md");
        record_file(&side_carrier, &document_2, "\u{8868}\u{4e00}", &[10, 20]).unwrap();
        record_file(&side_carrier, &document_2, "\u{8868}\u{4e8c}", &[30]).unwrap();

        record_file(&side_carrier, &document_2, "\u{8868}\u{4e00}", &[]).unwrap();
        let generate = get_file(&side_carrier, &document_2);
        assert_eq!(generate.len(), 1, "\u{5220}\u{6389}\u{7684}\u{90a3}\u{6761}\u{4e0d}\u{8be5}\u{8fd8}\u{5728}\u{ff1a}{generate:?}");
        assert_eq!(generate[0].fingerprint_2, "\u{8868}\u{4e8c}");

        record_file(&side_carrier, &document_2, "\u{8868}\u{4e8c}", &[]).unwrap();
        assert!(get_file(&side_carrier, &document_2).is_empty());
        assert!(read_file_2(&side_carrier).is_empty());

        let text_2 = std::fs::read_to_string(&side_carrier).expect("\u{8bfb}\u{76d8}");
        assert!(!text_2.contains("\u{7b14}\u{8bb0}.md"), "\u{7a7a}\u{58f3}\u{7684}\u{90a3}\u{4e00}\u{8282}\u{8981}\u{4e00}\u{8d77}\u{6d88}\u{5931}\u{ff1a}{text_2}");
        assert!(!text_2.contains("\u{8868}\u{4e8c}"), "\u{7a7a}\u{6570}\u{7ec4}\u{4e0d}\u{8be5}\u{88ab}\u{5199}\u{51fa}\u{6765}\u{ff1a}{text_2}");

        receive_probe(&directory_2);
    }

    #[test]
    fn one_part_document_multiple_item_record_path_not_call_item_stream() {
        let directory_2 = temp_directory("\u{4e0d}\u{4e32}");
        let side_carrier = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let add_directory = directory_2.join("\u{7532}");
        let one_directory = directory_2.join("\u{4e59}");
        std::fs::create_dir_all(&add_directory).unwrap();
        std::fs::create_dir_all(&one_directory).unwrap();
        let value_4 = add_directory.join("\u{7b14}\u{8bb0}.md");
        let value_2 = one_directory.join("\u{7b14}\u{8bb0}.md");

        record_file(&side_carrier, &value_4, "\u{8868}\u{4e00}", &[1, 2]).unwrap();
        record_file(&side_carrier, &value_4, "\u{8868}\u{4e8c}", &[3]).unwrap();
        record_file(&side_carrier, &value_2, "\u{8868}\u{4e00}", &[9]).unwrap();

        assert_eq!(get_file(&side_carrier, &value_4).len(), 2);
        assert_eq!(get_file(&side_carrier, &value_2).len(), 1, "\u{540c}\u{540d}\u{7684}\u{90a3}\u{4e00}\u{4efd}\u{4e0d}\u{80fd}\u{88ab}\u{6df7}\u{8fdb}\u{6765}");
        assert_eq!(get_file(&side_carrier, &value_2)[0].width_2, vec![9]);

        receive_probe(&directory_2);
    }

    #[test]
    fn width_by_u32_source_sample_web_reverse() {
        let directory_2 = temp_directory("\u{539f}\u{6837}");
        let side_carrier = directory_2.join("\u{4fa7}\u{8f66}.toml");
        let document_2 = directory_2.join("\u{7b14}\u{8bb0}.md");
        let width_2 = vec![0, u32::MAX, 3, 3, 1];

        record_file(&side_carrier, &document_2, "\u{8868}\u{4e00}", &width_2).unwrap();

        assert_eq!(get_file(&side_carrier, &document_2)[0].width_2, width_2);
        assert_eq!(
            read_file_2(&side_carrier)[0].width_2,
            width_2,
            "\u{4ece}\u{76d8}\u{4e0a}\u{8bfb}\u{56de}\u{6765}\u{4e5f}\u{8981}\u{4e00}\u{6837}"
        );

        receive_probe(&directory_2);
    }
}
