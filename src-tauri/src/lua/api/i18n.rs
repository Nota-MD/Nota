use std::collections::HashMap;
use std::path::PathBuf;

use mlua::{Lua, Table, Value};

use super::mlua_to_nota;
use crate::error::NotaError;
use crate::lang;
use crate::plugin::manifest::Manifest;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LanguagePack {
    pub declaration_2: bool,

    pub language: Option<String>,

    pub ok: bool,

    pub table_2: HashMap<String, String>,
}

impl Default for LanguagePack {
    fn default() -> Self {
        Self {
            declaration_2: false,
            language: None,
            ok: true,
            table_2: HashMap::new(),
        }
    }
}

impl LanguagePack {
    pub fn name_2(&self) -> Option<&str> {
        self.table_2.get("name").map(String::as_str)
    }

    pub fn description_data(&self) -> Option<&str> {
        self.table_2.get("description").map(String::as_str)
    }

    pub fn get_2(&self, key: &str) -> Option<&str> {
        self.table_2.get(key).map(String::as_str)
    }

    fn file_3(dir: &std::path::Path, tag: &str) -> PathBuf {
        dir.join("lang")
            .join(format!("{}.toml", lang::normalize_language_tag(tag)))
    }
}

pub fn install_2(manifest: &Manifest, application_language: &str) -> LanguagePack {
    let id = &manifest.meta.id;
    let langs = &manifest.meta.langs;

    if langs.is_empty() {
        return LanguagePack::default();
    }

    let (tag, ok) = match lang::match_language(application_language, langs) {
        Some(t) => (t, true),
        None => (lang::PLUGIN_FALLBACK.to_owned(), false),
    };

    let table_2 = read_2(&manifest.dir, &tag).unwrap_or_else(|reason_2| {
        crate::debug_log!(
            "[nota:{id}] missing lang/{}.toml ({reason_2}); falling back to source strings",
            lang::normalize_language_tag(&tag)
        );
        HashMap::new()
    });

    LanguagePack {
        declaration_2: true,
        language: Some(lang::normalize_language_tag(&tag)),
        ok,
        table_2,
    }
}

fn read_2(
    dir: &std::path::Path,
    tag: &str,
) -> std::result::Result<HashMap<String, String>, String> {
    let path = LanguagePack::file_3(dir, tag);
    let text_2 = std::fs::read_to_string(&path)
        .map_err(|e| format!("Could not read {}: {e}", path.display()))?;
    lang::read_language_file(&text_2)
}

pub fn build(
    lua: &Lua,
    package: &LanguagePack,
    application_language: &str,
) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;
    t.set("app_lang", application_language.to_owned())
        .map_err(mlua_to_nota)?;

    match &package.language {
        Some(l) => t.set("lang", l.clone()).map_err(mlua_to_nota)?,
        None => t.set("lang", Value::Nil).map_err(mlua_to_nota)?,
    }
    t.set("ok", package.ok).map_err(mlua_to_nota)?;

    let table_2 = package.table_2.clone();
    let text = lua
        .create_function(move |_, key: String| Ok(table_2.get(&key).cloned()))
        .map_err(mlua_to_nota)?;
    t.set("text", text).map_err(mlua_to_nota)?;

    Ok(t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn manifest_2(dir: PathBuf, langs: &[&str]) -> Manifest {
        use crate::plugin::manifest::{PluginMeta, NOTA_PLUGIN_API_VERSION};
        Manifest {
            meta: PluginMeta {
                id: "nota.test".to_owned(),
                name: "Test".to_owned(),
                version: "0.1.0".to_owned(),
                api: NOTA_PLUGIN_API_VERSION,
                entry: "main.lua".to_owned(),
                description: String::new(),
                authors: Vec::new(),
                license: "BSD-2-Clause".to_owned(),
                capabilities: Vec::new(),
                langs: langs.iter().map(|s| (*s).to_owned()).collect(),
            },
            dir,
            capabilities: Vec::new(),
            devserver: None,
            update: None,

            settings: Vec::new(),
            setting_locks: Vec::new(),
        }
    }

    fn check(dir: &std::path::Path, tag: &str, content_2: &str) {
        std::fs::create_dir_all(dir.join("lang")).unwrap();
        std::fs::write(dir.join("lang").join(format!("{tag}.toml")), content_2).unwrap();
    }

    fn temp_directory(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("nota-i18n-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn not_declaration_langs_old_not_write_upper_page_not_question_is() {
        let dir = temp_directory("\u{6ca1}\u{58f0}\u{660e}");
        let package = install_2(&manifest_2(dir.clone(), &[]), "zh-CN");
        assert!(!package.declaration_2);
        assert_eq!(package.language, None);
        assert!(package.ok, "\u{6ca1}\u{58f0}\u{660e} `langs` \u{7684}\u{62d3}\u{5c55}\u{4e0d}\u{8be5}\u{88ab}\u{5224}\u{6210}\u{300c}\u{4e0d}\u{652f}\u{6301}\u{4f60}\u{7684}\u{8bed}\u{8a00}\u{300d}");
        assert!(package.table_2.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn name_middle_language_use_that_one_part_each_name_middle_old_use_should_and_and_say_one_sentence(
    ) {
        let dir = temp_directory("\u{547d}\u{4e2d}");
        check(&dir, "zh-CN", "name = \"\u{4e2d}\u{6587}\u{540d}\"\ndescription = \"\u{4e2d}\u{6587}\u{7b80}\u{4ecb}\"\nhint = \"\u{4f60}\u{597d}\"\n");
        check(&dir, "en", "name = \"English name\"\nhint = \"hi\"\n");

        let middle_text = install_2(&manifest_2(dir.clone(), &["zh-CN", "en"]), "zh-CN");
        assert!(middle_text.ok);
        assert_eq!(middle_text.language.as_deref(), Some("zh-CN"));
        assert_eq!(middle_text.name_2(), Some("\u{4e2d}\u{6587}\u{540d}"));
        assert_eq!(
            middle_text.description_data(),
            Some("\u{4e2d}\u{6587}\u{7b80}\u{4ecb}")
        );
        assert_eq!(middle_text.get_2("hint"), Some("\u{4f60}\u{597d}"));

        let should_text = install_2(&manifest_2(dir.clone(), &["zh-CN", "en"]), "ja-JP");
        assert!(!should_text.ok, "\u{65e5}\u{8bed}\u{4e0d}\u{5728} langs \u{91cc} \u{2192} \u{8bf4}\u{300c}\u{4e0d}\u{652f}\u{6301}\u{4f60}\u{7684}\u{8bed}\u{8a00}\u{300d}");
        assert_eq!(should_text.language.as_deref(), Some("en"));
        assert_eq!(should_text.name_2(), Some("English name"));

        assert_eq!(should_text.description_data(), None, "\u{8868}\u{91cc}\u{6ca1}\u{5199}\u{5c31}\u{9000}\u{56de}\u{6e05}\u{5355}\u{ff0c}\u{522b}\u{51ed}\u{7a7a}\u{9020}\u{4e00}\u{53e5}");

        let dir2 = temp_directory("\u{524d}\u{7f00}");
        check(&dir2, "zh", "name = \"\u{4e2d}\u{6587}\"\n");
        check(&dir2, "en", "name = \"English\"\n");
        let cu = install_2(&manifest_2(dir2.clone(), &["zh", "en"]), "zh-CN");
        assert!(cu.ok);
        assert_eq!(cu.language.as_deref(), Some("zh"));

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&dir2);
    }

    #[test]
    fn missing_file_only_derive_return_source_text_not_handle_render_say_passed_header() {
        let dir = temp_directory("\u{7f3a}\u{6587}\u{4ef6}");
        let package = install_2(&manifest_2(dir.clone(), &["zh-CN", "en"]), "zh-CN");
        assert!(package.ok, "\u{6e05}\u{5355}\u{91cc}\u{6709} zh-CN\u{ff0c}\u{5c31}\u{4e0d}\u{8be5}\u{8bf4}\u{300c}\u{4e0d}\u{652f}\u{6301}\u{4f60}\u{7684}\u{8bed}\u{8a00}\u{300d}");
        assert_eq!(package.language.as_deref(), Some("zh-CN"));
        assert!(package.table_2.is_empty(), "\u{8868}\u{7a7a}\u{4e86}\u{ff0c}\u{4ea4}\u{7ed9}\u{62d3}\u{5c55}\u{7684} `or \u{539f}\u{6587}` \u{515c}\u{5e95}");
        assert_eq!(package.name_2(), None);

        let should = install_2(&manifest_2(dir.clone(), &["en"]), "zh-CN");
        assert!(!should.ok, "zh-CN \u{4e0d}\u{5728}\u{5b83}\u{7684}\u{5217}\u{8868}\u{91cc} \u{2192} \u{8bf4}\u{8fd9}\u{53e5}\u{ff0c}\u{7528} en");
        assert_eq!(should.language.as_deref(), Some("en"));
        assert!(should.table_2.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn table_inner_each_has_that_item_check_is_text_give_nil() {
        let dir = temp_directory("\u{7f3a}\u{952e}");
        check(&dir, "en", "a = \"\u{7532}\"\n");
        let package = install_2(&manifest_2(dir.clone(), &["en"]), "en");

        let lua = Lua::new();
        let t = build(&lua, &package, "en").unwrap();
        assert_eq!(
            t.get::<Option<String>>("app_lang").unwrap().as_deref(),
            Some("en")
        );
        assert_eq!(
            t.get::<Option<String>>("lang").unwrap().as_deref(),
            Some("en")
        );
        assert!(t.get::<bool>("ok").unwrap());
        let text: mlua::Function = t.get("text").unwrap();
        assert_eq!(
            text.call::<Option<String>>("a").unwrap().as_deref(),
            Some("\u{7532}")
        );

        assert_eq!(
            text.call::<Option<String>>("\u{6ca1}\u{6709}\u{8fd9}\u{6761}")
                .unwrap(),
            None
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn each_declaration_langs_is_language_is_nil_two_app_language_still_at() {
        let dir = temp_directory("nil");
        let package = install_2(&manifest_2(dir.clone(), &[]), "zh-CN");
        let lua = Lua::new();
        let t = build(&lua, &package, "zh-CN").unwrap();
        assert_eq!(t.get::<Option<String>>("lang").unwrap(), None);
        assert_eq!(
            t.get::<Option<String>>("app_lang").unwrap().as_deref(),
            Some("zh-CN"),
            "\u{5e94}\u{7528}\u{5728}\u{8bf4}\u{54ea}\u{79cd}\u{8bed}\u{8a00}\u{ff0c}\u{62d3}\u{5c55}\u{6c38}\u{8fdc}\u{8bfb}\u{5f97}\u{5230}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn filename_by_normalize_reverse_write_method_find() {
        let dir = temp_directory("\u{89c4}\u{8303}");
        check(
            &dir,
            "zh-CN",
            "hint = \"\u{4e0b}\u{5212}\u{7ebf}\u{4e5f}\u{8ba4}\"\n",
        );
        let package = install_2(&manifest_2(dir.clone(), &["zh_CN", "en"]), "zh-CN");
        assert!(package.ok, "\u{6e05}\u{5355}\u{91cc}\u{7684}\u{4e0b}\u{5212}\u{7ebf}\u{5199}\u{6cd5}\u{8981}\u{80fd}\u{88ab}\u{5f52}\u{4e00}\u{5316}");
        assert_eq!(
            package.get_2("hint"),
            Some("\u{4e0b}\u{5212}\u{7ebf}\u{4e5f}\u{8ba4}")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
