use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use zspell::Dictionary;

use super::store;

static CI_DIAN_HUAN_CUN: OnceLock<Mutex<HashMap<String, Option<Arc<Dictionary>>>>> =
    OnceLock::new();

fn huan_cun_table() -> &'static Mutex<HashMap<String, Option<Arc<Dictionary>>>> {
    CI_DIAN_HUAN_CUN.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn qing_huan_cun() {
    if let Ok(mut table_2) = huan_cun_table().lock() {
        table_2.clear();
    }
}

pub struct NativeRustBackend {
    pub yong_hu_directory: Option<PathBuf>,
}

impl NativeRustBackend {
    pub fn create_2() -> Self {
        Self {
            yong_hu_directory: store::yong_hu_ci_dian_directory().ok(),
        }
    }

    pub fn you_ci_dian(&self, language_2: &str) -> bool {
        self.ci_dian(language_2).is_some()
    }

    fn ci_dian(&self, language_2: &str) -> Option<Arc<Dictionary>> {
        let (aff, dic) = store::zhao_yi_dui(language_2, self.yong_hu_directory.as_deref())?;
        let jian_2 = format!(
            "{}|{}",
            dic.display(),
            aff.as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_default()
        );
        if let Ok(table_2) = huan_cun_table().lock() {
            if let Some(you_2) = table_2.get(&jian_2) {
                return you_2.clone();
            }
        }
        let jian_ok = jian_ci_dian(aff.as_deref(), &dic).map(Arc::new);
        if let Ok(mut table_2) = huan_cun_table().lock() {
            table_2.insert(jian_2, jian_ok.clone());
        }
        jian_ok
    }

    pub fn cha_2(&self, language_2: &str, ci_men: &[String]) -> Option<Vec<usize>> {
        let ci_dian = self.ci_dian(language_2)?;

        let mut chu = Vec::new();
        for (i, ci) in ci_men.iter().enumerate() {
            if !ci_dian.check_word(ci) {
                chu.push(i);
            }
        }
        Some(chu)
    }

    pub fn jian_yi(&self, language_2: &str, ci: &str) -> Vec<String> {
        let Some(ci_dian) = self.ci_dian(language_2) else {
            return Vec::new();
        };
        let tiao_mu = ci_dian.entry(ci);
        tiao_mu
            .suggest()
            .map(|jian_yi_men| jian_yi_men.into_iter().map(str::to_string).collect())
            .unwrap_or_default()
    }
}

fn jian_ci_dian(aff: Option<&std::path::Path>, dic: &std::path::Path) -> Option<Dictionary> {
    let ci_table = std::fs::read_to_string(dic).ok()?;
    let pei_zhi = match aff {
        Some(p) => {
            std::fs::read_to_string(p).unwrap_or_else(|_| store::zui_xiao_affix().to_string())
        }
        None => store::zui_xiao_affix().to_string(),
    };

    zspell::builder()
        .config_str(&pei_zhi)
        .dict_str(&ci_table)
        .build()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_CACHE_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn yi_fen_zui_xiao_de_ci_dian_ye_neng_jian_qi_lai_bing_cha_ci() {
        let _guard = TEST_CACHE_LOCK.lock().unwrap();
        let root_2 = std::env::temp_dir().join(format!("nota-native-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        std::fs::create_dir_all(&root_2).unwrap();
        std::fs::write(root_2.join("zz_ZZ.aff"), store::zui_xiao_affix()).unwrap();
        std::fs::write(root_2.join("zz_ZZ.dic"), "2\nhello\nworld\n").unwrap();

        let hou_duan = NativeRustBackend {
            yong_hu_directory: Some(root_2.clone()),
        };
        assert!(hou_duan.you_ci_dian("zz_ZZ"));
        assert!(
            !hou_duan.you_ci_dian("yy_YY"),
            "\u{6ca1}\u{8fd9}\u{4e00}\u{95e8}\u{65f6}\u{4e0d}\u{8bb8}\u{8bf4}'\u{6709}'"
        );

        let ci_men: Vec<String> = ["hello", "helllo", "world"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(hou_duan.cha_2("zz_ZZ", &ci_men), Some(vec![1]));

        assert_eq!(
            hou_duan.cha_2("zz_ZZ", &["Hello".to_string()]),
            Some(vec![])
        );

        assert_eq!(hou_duan.cha_2("yy_YY", &ci_men), None);

        qing_huan_cun();
        let _ = std::fs::remove_dir_all(&root_2);
    }

    #[test]
    fn tong_yi_fen_ci_dian_zhi_jian_yi_ci() {
        let _guard = TEST_CACHE_LOCK.lock().unwrap();
        let root_2 = std::env::temp_dir().join(format!("nota-native-cache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        std::fs::create_dir_all(&root_2).unwrap();
        std::fs::write(root_2.join("cc_CC.aff"), store::zui_xiao_affix()).unwrap();
        std::fs::write(root_2.join("cc_CC.dic"), "1\nhello\n").unwrap();
        let hou_duan = NativeRustBackend {
            yong_hu_directory: Some(root_2.clone()),
        };
        qing_huan_cun();
        let a = hou_duan.ci_dian("cc_CC").unwrap();
        let b = hou_duan.ci_dian("cc_CC").unwrap();
        assert!(Arc::ptr_eq(&a, &b), "\u{7b2c}\u{4e8c}\u{6b21}\u{8be5}\u{62ff}\u{5230}\u{7f13}\u{5b58}\u{91cc}\u{90a3}\u{4e00}\u{4efd}");

        qing_huan_cun();
        let c = hou_duan.ci_dian("cc_CC").unwrap();
        assert!(!Arc::ptr_eq(&a, &c));
        qing_huan_cun();
        let _ = std::fs::remove_dir_all(&root_2);
    }
}
