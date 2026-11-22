use std::path::Path;

use chardetng::EncodingDetector;
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};

use crate::error::{NotaError, Result};

pub const UTF8_ENCODING: &str = "UTF-8";

pub const COMMON_ENCODINGS: &[(&str, &str)] = &[
    ("UTF-8", "UTF-8 (universal)"),
    ("GBK", "GBK / GB2312 (Simplified Chinese)"),
    (
        "GB18030",
        "GB18030 (Simplified Chinese with rare characters)",
    ),
    ("Big5", "Big5 (Traditional Chinese)"),
    ("Shift_JIS", "Shift_JIS (Japanese)"),
    ("EUC-JP", "EUC-JP (Japanese)"),
    ("EUC-KR", "EUC-KR (Korean)"),
    ("UTF-16LE", "UTF-16 LE (Windows Notepad)"),
    ("UTF-16BE", "UTF-16 BE"),
    ("windows-1252", "Windows-1252 (Western European)"),
    ("ISO-8859-1", "ISO-8859-1 (Western European)"),
];

pub fn person_encoding(label: &str) -> Option<&'static Encoding> {
    Encoding::for_label(label.trim().as_bytes())
}

pub fn normalize_reverse_name(label: &str) -> Option<String> {
    person_encoding(label).map(|e| e.name().to_string())
}

pub fn read_file(path: &Path) -> Result<(String, String)> {
    let bytes = std::fs::read(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    if one_is_two_enter_only(&bytes) {
        return Err(NotaError::other(format!(
            "Refusing to open probable binary file {}; Nota will not rewrite it as text",
            path.display()
        )));
    }
    Ok(guess_decode(&bytes))
}

fn one_is_two_enter_only(bytes: &[u8]) -> bool {
    bytes.contains(&0)
}

pub fn an_encoding_read(path: &Path, label: &str) -> Result<String> {
    let encoding_2 = person_encoding(label)
        .ok_or_else(|| NotaError::other(format!("Unknown encoding: {label}")))?;
    let bytes = std::fs::read(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    let (text_2, _) = encoding_2.decode_without_bom_handling(&bytes);
    Ok(text_2.into_owned())
}

pub fn an_encoding_write(path: &Path, text_2: &str, label: &str) -> Result<()> {
    let encoding_2 = person_encoding(label)
        .ok_or_else(|| NotaError::other(format!("Unknown encoding: {label}")))?;
    let bytes = encoding_after_character_boundary(encoding_2, text_2);
    std::fs::write(path, bytes).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}

pub fn guess_decode(bytes: &[u8]) -> (String, String) {
    if let Some((encoding_2, bom_len)) = Encoding::for_bom(bytes) {
        let (text_2, _) = encoding_2.decode_without_bom_handling(&bytes[bom_len..]);
        return (text_2.into_owned(), encoding_2.name().to_string());
    }
    if let Ok(text_2) = std::str::from_utf8(bytes) {
        return (text_2.to_string(), UTF_8.name().to_string());
    }
    let mut probe_side_start = EncodingDetector::new();
    probe_side_start.feed(bytes, true);
    let encoding_2 = probe_side_start.guess(None, true);
    let (text_2, _, _) = encoding_2.decode(bytes);
    (text_2.into_owned(), encoding_2.name().to_string())
}

fn encoding_after_character_boundary(encoding_2: &'static Encoding, text_2: &str) -> Vec<u8> {
    if encoding_2 == UTF_16LE || encoding_2 == UTF_16BE {
        let mut out = Vec::with_capacity(text_2.len() * 2 + 2);
        out.extend_from_slice(if encoding_2 == UTF_16BE {
            &[0xFE, 0xFF]
        } else {
            &[0xFF, 0xFE]
        });
        for unit in text_2.encode_utf16() {
            let bytes = if encoding_2 == UTF_16BE {
                unit.to_be_bytes()
            } else {
                unit.to_le_bytes()
            };
            out.extend_from_slice(&bytes);
        }
        return out;
    }
    let (question, _, _) = encoding_2.encode(text_2);
    question.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_reverse_name_handle_other_name_receive_success_same_one() {
        assert_eq!(normalize_reverse_name("gb2312").as_deref(), Some("GBK"));
        assert_eq!(normalize_reverse_name("gbk").as_deref(), Some("GBK"));
        assert_eq!(normalize_reverse_name("utf8").as_deref(), Some("UTF-8"));
        assert_eq!(
            normalize_reverse_name("  UTF-8  ").as_deref(),
            Some("UTF-8")
        );
        assert_eq!(
            normalize_reverse_name("\u{8fd9}\u{4e0d}\u{662f}\u{7f16}\u{7801}"),
            None
        );
    }

    #[test]
    fn pure_ascii_and_and_method_utf8_all_when_utf8() {
        assert_eq!(guess_decode(b"hello world").1, "UTF-8");
        assert_eq!(
            guess_decode("\u{4e2d}\u{6587}\u{6b63}\u{6587}".as_bytes()).1,
            "UTF-8"
        );
    }

    #[test]
    fn bom_say_compute() {
        let le = encoding_after_character_boundary(UTF_16LE, "\u{4e2d}\u{6587}");
        let (text_2, encoding_name) = guess_decode(&le);
        assert_eq!(encoding_name, "UTF-16LE");
        assert_eq!(text_2, "\u{4e2d}\u{6587}");
    }

    #[test]
    fn gbk_web_reverse() {
        let source_text = "\u{4e2d}\u{6587}\u{7b14}\u{8bb0}\u{ff1a}\u{4e00}\u{4e8c}\u{4e09}\n\u{7b2c}\u{4e8c}\u{884c}\n";
        let bytes = encoding_after_character_boundary(person_encoding("gbk").unwrap(), source_text);

        assert!(bytes.len() >= source_text.chars().count() * 2 - 4);
        let (return_2, encoding_name) = guess_decode(&bytes);
        assert_eq!(return_2, source_text);
        assert_eq!(encoding_name, "GBK");
    }

    #[test]
    fn big5_and_shiftjis_page_person() {
        for table_before in ["big5", "shift_jis", "euc-kr", "utf-16le"] {
            assert!(
                person_encoding(table_before).is_some(),
                "{table_before} \u{5e94}\u{8be5}\u{8ba4}\u{5f97}\u{51fa}"
            );
        }
    }

    #[test]
    fn utf16_write_parse_not_bom_two_utf8_not_not() {
        let text = "abc";
        let le = encoding_after_character_boundary(UTF_16LE, text);
        assert_eq!(&le[..2], &[0xFF, 0xFE]);
        let be = encoding_after_character_boundary(UTF_16BE, text);
        assert_eq!(&be[..2], &[0xFE, 0xFF]);

        let u8 = encoding_after_character_boundary(UTF_8, text);
        assert_eq!(&u8[..1], b"a");
    }

    #[test]
    fn person_not_out_encoding_package_person_render() {
        let error = an_encoding_write(
            Path::new("/tmp/nota-\u{4e0d}\u{5b58}\u{5728}-\u{7684}\u{76ee}\u{5f55}/x.txt"),
            "a",
            "\u{4e71}\u{5199}\u{7684}",
        );
        assert!(error.is_err(), "\u{8ba4}\u{4e0d}\u{51fa}\u{7684}\u{7f16}\u{7801}\u{8981}\u{5148}\u{62a5}\u{9519}\u{ff0c}\u{800c}\u{4e0d}\u{662f}\u{53bb}\u{5199}\u{76d8}");
    }

    #[test]
    fn long_use_encoding_table_inner_each_one_all_can_person() {
        for (table_before, _) in COMMON_ENCODINGS {
            assert!(
                person_encoding(table_before).is_some(),
                "\u{8868}\u{91cc}\u{7684} {table_before} \u{5fc5}\u{987b}\u{8ba4}\u{5f97}\u{51fa}"
            );
        }
    }

    #[test]
    fn contain_nul_file_sentence_absolute_enter_into_text_edit_record_start() {
        assert!(one_is_two_enter_only(b"%PDF-1.7\0binary"));
        assert!(!one_is_two_enter_only(
            "Markdown\n\t\u{6b63}\u{6587}".as_bytes()
        ));
    }
}
