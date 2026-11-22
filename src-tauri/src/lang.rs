use std::collections::HashMap;

pub const SUPPORTED_LANGUAGES: [&str; 2] = ["zh-CN", "en"];

pub const LANGUAGE_NAMES: [&str; 2] = ["Chinese (Simplified)", "English"];

pub const PLUGIN_FALLBACK: &str = "en";

pub const APP_FALLBACK: &str = "en";

pub const AUTO: &str = "auto";

pub fn normalize_language_tag(tag: &str) -> String {
    let normalized = tag
        .split(['.', '@'])
        .next()
        .unwrap_or(tag)
        .trim()
        .replace('_', "-");
    if normalized.is_empty() {
        return String::new();
    }

    let mut segments = normalized.split('-');
    let language = segments.next().unwrap_or("").to_ascii_lowercase();
    let qualifiers: Vec<String> = segments
        .map(|segment| {
            if segment.len() == 2 && segment.chars().all(|c| c.is_ascii_alphabetic()) {
                segment.to_ascii_uppercase()
            } else if segment.len() == 4 && segment.chars().all(|c| c.is_ascii_alphabetic()) {
                let mut chars = segment.chars();
                match chars.next() {
                    Some(first) => {
                        first.to_ascii_uppercase().to_string()
                            + &chars.as_str().to_ascii_lowercase()
                    }
                    None => String::new(),
                }
            } else {
                segment.to_ascii_lowercase()
            }
        })
        .collect();

    if qualifiers.is_empty() {
        language
    } else {
        format!("{language}-{}", qualifiers.join("-"))
    }
}

pub fn system_language() -> Option<String> {
    if let Some(platform_locale) = sys_locale::get_locale() {
        let tag = normalize_language_tag(&platform_locale);
        if !tag.is_empty() && tag != "c" && tag != "posix" {
            return Some(tag);
        }
    }
    for variable in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        let Ok(value) = std::env::var(variable) else {
            continue;
        };
        let tag = normalize_language_tag(&value);
        if tag.is_empty() || tag == "c" || tag == "posix" {
            continue;
        }
        return Some(tag);
    }
    #[cfg(target_os = "linux")]
    for path in ["/etc/default/locale", "/etc/locale.conf"] {
        if let Ok(content) = std::fs::read_to_string(path) {
            if let Some(language) = extract_system_language(&content) {
                return Some(language);
            }
        }
    }
    None
}

pub fn extract_system_language(content: &str) -> Option<String> {
    for variable in ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] {
        for line in content.lines() {
            let line = line.trim();
            let Some(value) = line.strip_prefix(&format!("{variable}=")) else {
                continue;
            };
            let first = value.trim().trim_matches(['"', '\'']).split(':').next()?;
            let tag = normalize_language_tag(first);
            if !tag.is_empty() && tag != "c" && tag != "posix" {
                return Some(tag);
            }
        }
    }
    None
}

pub fn match_language(wanted: &str, candidates: &[String]) -> Option<String> {
    let wanted = normalize_language_tag(wanted);
    if wanted.is_empty() {
        return None;
    }
    if let Some(exact) = candidates
        .iter()
        .find(|candidate| normalize_language_tag(candidate) == wanted)
    {
        return Some(exact.clone());
    }
    let primary = primary_language(&wanted);

    candidates
        .iter()
        .find(|candidate| {
            primary_language(&normalize_language_tag(candidate)) == primary
                && normalize_language_tag(candidate).len() < wanted.len()
        })
        .cloned()
}

pub fn primary_language(tag: &str) -> String {
    tag.split('-').next().unwrap_or(tag).to_ascii_lowercase()
}

pub fn effective_language(setting: &str, system_language: Option<String>) -> String {
    let wanted = if setting.trim().is_empty()
        || normalize_language_tag(setting) == normalize_language_tag(AUTO)
    {
        system_language.unwrap_or_else(|| APP_FALLBACK.to_owned())
    } else {
        setting.to_owned()
    };

    match_language(
        &wanted,
        &SUPPORTED_LANGUAGES
            .iter()
            .map(|language| language.to_string())
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|| APP_FALLBACK.to_owned())
}

pub fn read_language_file(text: &str) -> Result<HashMap<String, String>, String> {
    let value: toml::Value =
        toml::from_str(text).map_err(|e| format!("Language file is not valid TOML: {e}"))?;
    let table = value
        .as_table()
        .ok_or_else(|| "The language file root must be a table".to_owned())?;

    let mut entries = HashMap::new();
    for (key, value) in table {
        match value {
            toml::Value::String(text) => {
                entries.insert(key.clone(), text.clone());
            }
            other => {
                return Err(format!(
                    "Language entry `{key}` has type {}; only flat string values are accepted",
                    other.type_str()
                ))
            }
        }
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_language_tags() {
        assert_eq!(normalize_language_tag("zh_CN.UTF-8"), "zh-CN");
        assert_eq!(normalize_language_tag("zh-cn"), "zh-CN");
        assert_eq!(normalize_language_tag("EN"), "en");
        assert_eq!(normalize_language_tag("en_US"), "en-US");
        assert_eq!(normalize_language_tag("pt_BR@euro"), "pt-BR");
        assert_eq!(normalize_language_tag("zh_Hans_CN"), "zh-Hans-CN");
        assert_eq!(normalize_language_tag("  "), "");
        assert_eq!(normalize_language_tag("C"), "c");
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
    fn both_fallbacks_keep_the_documented_english_value() {
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
    fn matches_exact_tags_before_primary_language_fallbacks() {
        let candidates = vec!["en".to_owned(), "zh".to_owned(), "ja".to_owned()];
        assert_eq!(match_language("zh", &candidates).as_deref(), Some("zh"));

        assert_eq!(match_language("zh-CN", &candidates).as_deref(), Some("zh"));

        let specific = vec!["zh-CN".to_owned()];
        assert_eq!(match_language("zh", &specific), None);

        let both = vec!["zh".to_owned(), "zh-CN".to_owned()];
        assert_eq!(match_language("zh-CN", &both).as_deref(), Some("zh-CN"));

        assert_eq!(match_language("ja-JP", &candidates).as_deref(), Some("ja"));

        assert_eq!(match_language("ko-KR", &candidates), None);
        assert_eq!(match_language("", &candidates), None);
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
    fn locale_files_can_supply_a_supported_language() {
        let config = "LANG=\"zh_CN.UTF-8\"\nLANGUAGE=\"zh_CN:zh\"\n";
        assert_eq!(extract_system_language(config).as_deref(), Some("zh-CN"));
        assert_eq!(extract_system_language("LANG=C.UTF-8\n").as_deref(), None);
        assert_eq!(
            extract_system_language("LANG=en_US.UTF-8\n").as_deref(),
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
    fn language_file_accepts_only_flat_strings() {
        let table = read_language_file("name = \"AI\"\nhint = \"hi\"\n").unwrap();
        assert_eq!(table.get("name").map(String::as_str), Some("AI"));
        assert_eq!(table.get("hint").map(String::as_str), Some("hi"));

        assert!(read_language_file("[a]\nb = 1\n").is_err());
        assert!(read_language_file("n = 3\n").is_err());
        assert!(read_language_file("\u{8fd9}\u{4e0d}\u{662f} toml").is_err());
    }
}
