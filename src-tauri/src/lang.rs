use std::collections::HashMap;

pub const SUPPORTED_LANGUAGES: [&str; 2] = ["zh-CN", "en"];

pub const LANGUAGE_NAMES: [&str; 2] = ["Chinese (Simplified)", "English"];

pub const PLUGIN_FALLBACK: &str = "en";

pub const APP_FALLBACK: &str = "en";

pub const AUTO: &str = "auto";

pub fn gui_fan(tag: &str) -> String {
    let zhu = tag
        .split(['.', '@'])
        .next()
        .unwrap_or(tag)
        .trim()
        .replace('_', "-");
    if zhu.is_empty() {
        return String::new();
    }

    let mut duan = zhu.split('-');
    let language_2 = duan.next().unwrap_or("").to_ascii_lowercase();
    let qi_yu: Vec<String> = duan
        .map(|s| {
            if s.len() == 2 && s.chars().all(|c| c.is_ascii_alphabetic()) {
                s.to_ascii_uppercase()
            } else if s.len() == 4 && s.chars().all(|c| c.is_ascii_alphabetic()) {
                let mut c = s.chars();
                match c.next() {
                    Some(shou) => {
                        shou.to_ascii_uppercase().to_string() + &c.as_str().to_ascii_lowercase()
                    }
                    None => String::new(),
                }
            } else {
                s.to_ascii_lowercase()
            }
        })
        .collect();

    if qi_yu.is_empty() {
        language_2
    } else {
        format!("{language_2}-{}", qi_yu.join("-"))
    }
}

pub fn xi_tong_language() -> Option<String> {
    if let Some(ping_tai_provided) = sys_locale::get_locale() {
        let yi = gui_fan(&ping_tai_provided);
        if !yi.is_empty() && yi != "c" && yi != "posix" {
            return Some(yi);
        }
    }
    for jian_2 in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        let Ok(value_2) = std::env::var(jian_2) else {
            continue;
        };
        let yi = gui_fan(&value_2);
        if yi.is_empty() || yi == "c" || yi == "posix" {
            continue;
        }
        return Some(yi);
    }
    #[cfg(target_os = "linux")]
    for path_3 in ["/etc/default/locale", "/etc/locale.conf"] {
        if let Ok(content_2) = std::fs::read_to_string(path_3) {
            if let Some(language_2) = cong_language_pei_zhi_qu(&content_2) {
                return Some(language_2);
            }
        }
    }
    None
}

pub fn cong_language_pei_zhi_qu(content_2: &str) -> Option<String> {
    for jian_2 in ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] {
        for xing in content_2.lines() {
            let xing = xing.trim();
            let Some(value_2) = xing.strip_prefix(&format!("{jian_2}=")) else {
                continue;
            };
            let shou_xiang = value_2.trim().trim_matches(['"', '\'']).split(':').next()?;
            let gui_yi = gui_fan(shou_xiang);
            if !gui_yi.is_empty() && gui_yi != "c" && gui_yi != "posix" {
                return Some(gui_yi);
            }
        }
    }
    None
}

pub fn pi_pei(xiang_yao: &str, ke_xuan: &[String]) -> Option<String> {
    let xiang_yao = gui_fan(xiang_yao);
    if xiang_yao.is_empty() {
        return None;
    }
    if let Some(yi) = ke_xuan.iter().find(|c| gui_fan(c) == xiang_yao) {
        return Some(yi.clone());
    }
    let primary = primary_language(&xiang_yao);

    ke_xuan
        .iter()
        .find(|c| primary_language(&gui_fan(c)) == primary && gui_fan(c).len() < xiang_yao.len())
        .cloned()
}

pub fn primary_language(tag: &str) -> String {
    tag.split('-').next().unwrap_or(tag).to_ascii_lowercase()
}

pub fn effective_language(she_ding: &str, xi_tong: Option<String>) -> String {
    let xiang_yao = if she_ding.trim().is_empty() || gui_fan(she_ding) == gui_fan(AUTO) {
        xi_tong.unwrap_or_else(|| APP_FALLBACK.to_owned())
    } else {
        she_ding.to_owned()
    };

    pi_pei(
        &xiang_yao,
        &SUPPORTED_LANGUAGES
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|| APP_FALLBACK.to_owned())
}

pub fn read_language_file(text_2: &str) -> Result<HashMap<String, String>, String> {
    let value_2: toml::Value =
        toml::from_str(text_2).map_err(|e| format!("Language file is not valid TOML: {e}"))?;
    let table_2 = value_2
        .as_table()
        .ok_or_else(|| "The language file root must be a table".to_owned())?;

    let mut chu = HashMap::new();
    for (jian_2, v) in table_2 {
        match v {
            toml::Value::String(s) => {
                chu.insert(jian_2.clone(), s.clone());
            }
            bie_de => {
                return Err(format!(
                    "Language entry `{jian_2}` has type {}; only flat string values are accepted",
                    bie_de.type_str()
                ))
            }
        }
    }
    Ok(chu)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gui_yi_hua() {
        assert_eq!(gui_fan("zh_CN.UTF-8"), "zh-CN");
        assert_eq!(gui_fan("zh-cn"), "zh-CN");
        assert_eq!(gui_fan("EN"), "en");
        assert_eq!(gui_fan("en_US"), "en-US");
        assert_eq!(gui_fan("pt_BR@euro"), "pt-BR");
        assert_eq!(gui_fan("zh_Hans_CN"), "zh-Hans-CN");
        assert_eq!(gui_fan("  "), "");
        assert_eq!(gui_fan("C"), "c");
    }

    #[test]
    fn language_names_match_supported_languages() {
        assert_eq!(
            LANGUAGE_NAMES.len(),
            SUPPORTED_LANGUAGES.len(),
            "supported languages {supported:?} and labels {labels:?} have different lengths",
            supported = SUPPORTED_LANGUAGES,
            labels = LANGUAGE_NAMES
        );
        assert!(
            !LANGUAGE_NAMES.iter().any(|name| name.trim().is_empty()),
            "labels must not be empty"
        );
    }

    #[test]
    fn both_fallbacks_are_supported_languages() {
        assert!(SUPPORTED_LANGUAGES.contains(&PLUGIN_FALLBACK));
        assert!(SUPPORTED_LANGUAGES.contains(&APP_FALLBACK));
    }

    #[test]
    fn liang_ge_dou_di_shi_liang_ge_gai_nian_jin_tian_qia_ok_tong_value() {
        assert_eq!(
            PLUGIN_FALLBACK, "en",
            "the extension fallback must remain English"
        );
        assert_eq!(
            APP_FALLBACK, "en",
            "the app fallback changed back to English on 2026-09-26 and must not change without a new rationale"
        );
    }

    #[test]
    fn pi_pei_jing_que_zai_qian_qian_zhui_dou_di() {
        let ke_xuan = vec!["en".to_owned(), "zh".to_owned(), "ja".to_owned()];
        assert_eq!(pi_pei("zh", &ke_xuan).as_deref(), Some("zh"));

        assert_eq!(pi_pei("zh-CN", &ke_xuan).as_deref(), Some("zh"));

        let xi = vec!["zh-CN".to_owned()];
        assert_eq!(pi_pei("zh", &xi), None);

        let liang_ge = vec!["zh".to_owned(), "zh-CN".to_owned()];
        assert_eq!(pi_pei("zh-CN", &liang_ge).as_deref(), Some("zh-CN"));

        assert_eq!(pi_pei("ja-JP", &ke_xuan).as_deref(), Some("ja"));

        assert_eq!(pi_pei("ko-KR", &ke_xuan), None);
        assert_eq!(pi_pei("", &ke_xuan), None);
    }

    #[test]
    fn automatic_language_follows_the_system_and_uses_the_app_fallback() {
        assert_eq!(effective_language(AUTO, Some("zh-CN".to_owned())), "zh-CN");

        assert_eq!(
            effective_language(AUTO, Some("zh-TW".to_owned())),
            APP_FALLBACK
        );
        assert_eq!(effective_language(AUTO, Some("en-US".to_owned())), "en");
        assert_eq!(
            effective_language(AUTO, None),
            APP_FALLBACK,
            "missing system locale uses the app fallback"
        );
        assert_eq!(
            effective_language(AUTO, Some("ja-JP".to_owned())),
            APP_FALLBACK,
            "Japanese has no translation table"
        );
    }

    #[test]
    fn xu_ni_huan_jing_zhi_you_c_locale_shi_cong_xi_tong_pei_zhi_zhao_hui_zhong_wen() {
        let pei_zhi = "LANG=\"zh_CN.UTF-8\"\nLANGUAGE=\"zh_CN:zh\"\n";
        assert_eq!(cong_language_pei_zhi_qu(pei_zhi).as_deref(), Some("zh-CN"));
        assert_eq!(cong_language_pei_zhi_qu("LANG=C.UTF-8\n").as_deref(), None);
        assert_eq!(
            cong_language_pei_zhi_qu("LANG=en_US.UTF-8\n").as_deref(),
            Some("en-US")
        );
    }

    #[test]
    fn unknown_manual_language_uses_the_app_fallback() {
        assert_eq!(effective_language("zh-CN", None), "zh-CN");
        assert_eq!(effective_language("zh_CN", None), "zh-CN", "\u{624b}\u{5199} settings.toml \u{7684}\u{4eba}\u{53ef}\u{80fd}\u{5199}\u{6210}\u{4e0b}\u{5212}\u{7ebf}");
        assert_eq!(effective_language("en", None), "en");

        assert_eq!(effective_language("fr", None), APP_FALLBACK);
        assert_eq!(effective_language("", None), APP_FALLBACK);
    }

    #[test]
    fn read_language_file_zhi_receive_ping_de_zi_fu_chuan() {
        let table_2 = read_language_file("name = \"AI\"\nhint = \"hi\"\n").unwrap();
        assert_eq!(table_2.get("name").map(String::as_str), Some("AI"));
        assert_eq!(table_2.get("hint").map(String::as_str), Some("hi"));

        assert!(read_language_file("[a]\nb = 1\n").is_err());
        assert!(read_language_file("n = 3\n").is_err());
        assert!(read_language_file("\u{8fd9}\u{4e0d}\u{662f} toml").is_err());
    }
}
