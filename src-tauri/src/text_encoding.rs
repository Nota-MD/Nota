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

pub fn ren_encoding(label: &str) -> Option<&'static Encoding> {
    Encoding::for_label(label.trim().as_bytes())
}

pub fn gui_fan_ming(label: &str) -> Option<String> {
    ren_encoding(label).map(|e| e.name().to_string())
}

pub fn read_file(path: &Path) -> Result<(String, String)> {
    let zi_jie = std::fs::read(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    if yi_shi_er_jin_zhi(&zi_jie) {
        return Err(NotaError::other(format!(
            "Refusing to open probable binary file {}; Nota will not rewrite it as text",
            path.display()
        )));
    }
    Ok(guess_decode(&zi_jie))
}

fn yi_shi_er_jin_zhi(bytes: &[u8]) -> bool {
    bytes.contains(&0)
}

pub fn an_encoding_read(path: &Path, label: &str) -> Result<String> {
    let encoding_2 = ren_encoding(label)
        .ok_or_else(|| NotaError::other(format!("Unknown encoding: {label}")))?;
    let zi_jie = std::fs::read(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    let (text_2, _) = encoding_2.decode_without_bom_handling(&zi_jie);
    Ok(text_2.into_owned())
}

pub fn an_encoding_write(path: &Path, text_2: &str, label: &str) -> Result<()> {
    let encoding_2 = ren_encoding(label)
        .ok_or_else(|| NotaError::other(format!("Unknown encoding: {label}")))?;
    let zi_jie = encoding_hou_de_zi_jie(encoding_2, text_2);
    std::fs::write(path, zi_jie).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}

pub fn guess_decode(zi_jie: &[u8]) -> (String, String) {
    if let Some((encoding_2, bom_len)) = Encoding::for_bom(zi_jie) {
        let (text_2, _) = encoding_2.decode_without_bom_handling(&zi_jie[bom_len..]);
        return (text_2.into_owned(), encoding_2.name().to_string());
    }
    if let Ok(text_2) = std::str::from_utf8(zi_jie) {
        return (text_2.to_string(), UTF_8.name().to_string());
    }
    let mut tan_ce_qi = EncodingDetector::new();
    tan_ce_qi.feed(zi_jie, true);
    let encoding_2 = tan_ce_qi.guess(None, true);
    let (text_2, _, _) = encoding_2.decode(zi_jie);
    (text_2.into_owned(), encoding_2.name().to_string())
}

fn encoding_hou_de_zi_jie(encoding_2: &'static Encoding, text_2: &str) -> Vec<u8> {
    if encoding_2 == UTF_16LE || encoding_2 == UTF_16BE {
        let mut chu = Vec::with_capacity(text_2.len() * 2 + 2);
        chu.extend_from_slice(if encoding_2 == UTF_16BE {
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
            chu.extend_from_slice(&bytes);
        }
        return chu;
    }
    let (ti, _, _) = encoding_2.encode(text_2);
    ti.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gui_fan_ming_ba_bie_ming_receive_cheng_tong_yi_ge() {
        assert_eq!(gui_fan_ming("gb2312").as_deref(), Some("GBK"));
        assert_eq!(gui_fan_ming("gbk").as_deref(), Some("GBK"));
        assert_eq!(gui_fan_ming("utf8").as_deref(), Some("UTF-8"));
        assert_eq!(gui_fan_ming("  UTF-8  ").as_deref(), Some("UTF-8"));
        assert_eq!(
            gui_fan_ming("\u{8fd9}\u{4e0d}\u{662f}\u{7f16}\u{7801}"),
            None
        );
    }

    #[test]
    fn chun_ascii_yu_he_fa_utf8_dou_dang_utf8() {
        assert_eq!(guess_decode(b"hello world").1, "UTF-8");
        assert_eq!(
            guess_decode("\u{4e2d}\u{6587}\u{6b63}\u{6587}".as_bytes()).1,
            "UTF-8"
        );
    }

    #[test]
    fn bom_shuo_le_suan() {
        let le = encoding_hou_de_zi_jie(UTF_16LE, "\u{4e2d}\u{6587}");
        let (text_2, encoding_ming) = guess_decode(&le);
        assert_eq!(encoding_ming, "UTF-16LE");
        assert_eq!(text_2, "\u{4e2d}\u{6587}");
    }

    #[test]
    fn gbk_wang_fan() {
        let yuan_wen = "\u{4e2d}\u{6587}\u{7b14}\u{8bb0}\u{ff1a}\u{4e00}\u{4e8c}\u{4e09}\n\u{7b2c}\u{4e8c}\u{884c}\n";
        let zi_jie = encoding_hou_de_zi_jie(ren_encoding("gbk").unwrap(), yuan_wen);

        assert!(zi_jie.len() >= yuan_wen.chars().count() * 2 - 4);
        let (hui_2, encoding_ming) = guess_decode(&zi_jie);
        assert_eq!(hui_2, yuan_wen);
        assert_eq!(encoding_ming, "GBK");
    }

    #[test]
    fn big5_yu_shiftjis_ye_ren() {
        for biao_qian in ["big5", "shift_jis", "euc-kr", "utf-16le"] {
            assert!(
                ren_encoding(biao_qian).is_some(),
                "{biao_qian} \u{5e94}\u{8be5}\u{8ba4}\u{5f97}\u{51fa}"
            );
        }
    }

    #[test]
    fn utf16_write_pan_bu_bom_er_utf8_bu_bu() {
        let wen = "abc";
        let le = encoding_hou_de_zi_jie(UTF_16LE, wen);
        assert_eq!(&le[..2], &[0xFF, 0xFE]);
        let be = encoding_hou_de_zi_jie(UTF_16BE, wen);
        assert_eq!(&be[..2], &[0xFE, 0xFF]);

        let u8 = encoding_hou_de_zi_jie(UTF_8, wen);
        assert_eq!(&u8[..1], b"a");
    }

    #[test]
    fn ren_bu_chu_de_encoding_bao_ren_hua() {
        let cuo = an_encoding_write(
            Path::new("/tmp/nota-\u{4e0d}\u{5b58}\u{5728}-\u{7684}\u{76ee}\u{5f55}/x.txt"),
            "a",
            "\u{4e71}\u{5199}\u{7684}",
        );
        assert!(cuo.is_err(), "\u{8ba4}\u{4e0d}\u{51fa}\u{7684}\u{7f16}\u{7801}\u{8981}\u{5148}\u{62a5}\u{9519}\u{ff0c}\u{800c}\u{4e0d}\u{662f}\u{53bb}\u{5199}\u{76d8}");
    }

    #[test]
    fn chang_yong_encoding_table_li_mei_yi_ge_dou_neng_ren() {
        for (biao_qian, _) in COMMON_ENCODINGS {
            assert!(
                ren_encoding(biao_qian).is_some(),
                "\u{8868}\u{91cc}\u{7684} {biao_qian} \u{5fc5}\u{987b}\u{8ba4}\u{5f97}\u{51fa}"
            );
        }
    }

    #[test]
    fn han_nul_de_file_ju_jue_jin_ru_text_bian_ji_qi() {
        assert!(yi_shi_er_jin_zhi(b"%PDF-1.7\0binary"));
        assert!(!yi_shi_er_jin_zhi(
            "Markdown\n\t\u{6b63}\u{6587}".as_bytes()
        ));
    }
}
