use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use zspell::Dictionary;

use super::store;

static WORD_POINT_REPLACE_STORE: OnceLock<Mutex<HashMap<String, Option<Arc<Dictionary>>>>> =
    OnceLock::new();

fn replace_store_table() -> &'static Mutex<HashMap<String, Option<Arc<Dictionary>>>> {
    WORD_POINT_REPLACE_STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn request_replace_store() {
    if let Ok(mut table_2) = replace_store_table().lock() {
        table_2.clear();
    }
}

pub struct NativeRustBackend {
    pub use_call_directory: Option<PathBuf>,
}

impl NativeRustBackend {
    pub fn create_2() -> Self {
        Self {
            use_call_directory: store::use_call_word_point_directory().ok(),
        }
    }

    pub fn has_word_point(&self, language_2: &str) -> bool {
        self.word_point(language_2).is_some()
    }

    fn word_point(&self, language_2: &str) -> Option<Arc<Dictionary>> {
        let (aff, dic) = store::find_one_pair(language_2, self.use_call_directory.as_deref())?;
        let value_2 = format!(
            "{}|{}",
            dic.display(),
            aff.as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_default()
        );
        if let Ok(table_2) = replace_store_table().lock() {
            if let Some(has_2) = table_2.get(&value_2) {
                return has_2.clone();
            }
        }
        let check_ok = check_word_point(aff.as_deref(), &dic).map(Arc::new);
        if let Ok(mut table_2) = replace_store_table().lock() {
            table_2.insert(value_2, check_ok.clone());
        }
        check_ok
    }

    pub fn check_2(&self, language_2: &str, word_list: &[String]) -> Option<Vec<usize>> {
        let word_point = self.word_point(language_2)?;

        let mut out = Vec::new();
        for (i, word) in word_list.iter().enumerate() {
            if !word_point.check_word(word) {
                out.push(i);
            }
        }
        Some(out)
    }

    pub fn check_one(&self, language_2: &str, word: &str) -> Vec<String> {
        let Some(word_point) = self.word_point(language_2) else {
            return Vec::new();
        };
        let item_target = word_point.entry(word);
        item_target
            .suggest()
            .map(|check_one_list| check_one_list.into_iter().map(str::to_string).collect())
            .unwrap_or_default()
    }
}

fn check_word_point(aff: Option<&std::path::Path>, dic: &std::path::Path) -> Option<Dictionary> {
    let word_table = std::fs::read_to_string(dic).ok()?;
    let match_only = match aff {
        Some(p) => {
            std::fs::read_to_string(p).unwrap_or_else(|_| store::most_small_affix().to_string())
        }
        None => store::most_small_affix().to_string(),
    };

    zspell::builder()
        .config_str(&match_only)
        .dict_str(&word_table)
        .build()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_CACHE_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn one_part_most_small_word_point_page_can_check_start_incoming_and_check_word() {
        let _guard = TEST_CACHE_LOCK.lock().unwrap();
        let root_2 = std::env::temp_dir().join(format!("nota-native-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        std::fs::create_dir_all(&root_2).unwrap();
        std::fs::write(root_2.join("zz_ZZ.aff"), store::most_small_affix()).unwrap();
        std::fs::write(root_2.join("zz_ZZ.dic"), "2\nhello\nworld\n").unwrap();

        let after_segment = NativeRustBackend {
            use_call_directory: Some(root_2.clone()),
        };
        assert!(after_segment.has_word_point("zz_ZZ"));
        assert!(
            !after_segment.has_word_point("yy_YY"),
            "\u{6ca1}\u{8fd9}\u{4e00}\u{95e8}\u{65f6}\u{4e0d}\u{8bb8}\u{8bf4}'\u{6709}'"
        );

        let word_list: Vec<String> = ["hello", "helllo", "world"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(after_segment.check_2("zz_ZZ", &word_list), Some(vec![1]));

        assert_eq!(
            after_segment.check_2("zz_ZZ", &["Hello".to_string()]),
            Some(vec![])
        );

        assert_eq!(after_segment.check_2("yy_YY", &word_list), None);

        request_replace_store();
        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn same_one_part_word_point_only_check_one_word() {
        let _guard = TEST_CACHE_LOCK.lock().unwrap();
        let root_2 = std::env::temp_dir().join(format!("nota-native-cache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        std::fs::create_dir_all(&root_2).unwrap();
        std::fs::write(root_2.join("cc_CC.aff"), store::most_small_affix()).unwrap();
        std::fs::write(root_2.join("cc_CC.dic"), "1\nhello\n").unwrap();
        let after_segment = NativeRustBackend {
            use_call_directory: Some(root_2.clone()),
        };
        request_replace_store();
        let a = after_segment.word_point("cc_CC").unwrap();
        let b = after_segment.word_point("cc_CC").unwrap();
        assert!(Arc::ptr_eq(&a, &b), "\u{7b2c}\u{4e8c}\u{6b21}\u{8be5}\u{62ff}\u{5230}\u{7f13}\u{5b58}\u{91cc}\u{90a3}\u{4e00}\u{4efd}");

        request_replace_store();
        let c = after_segment.word_point("cc_CC").unwrap();
        assert!(!Arc::ptr_eq(&a, &c));
        request_replace_store();
        let _ = std::fs::remove_dir_all(&root_2);
    }
}
