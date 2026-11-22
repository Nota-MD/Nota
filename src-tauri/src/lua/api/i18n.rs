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

    pub lang: Option<String>,

    pub ok: bool,

    pub table_2: HashMap<String, String>,
}

impl Default for LanguagePack {
    fn default() -> Self {
        Self {
            declaration_2: false,
            lang: None,
            ok: true,
            table_2: HashMap::new(),
        }
    }
}

impl LanguagePack {
    pub fn name_2(&self) -> Option<&str> {
        self.table_2.get("name").map(String::as_str)
    }

    pub fn miao_shu(&self) -> Option<&str> {
        self.table_2.get("description").map(String::as_str)
    }

    pub fn qu_2(&self, key: &str) -> Option<&str> {
        self.table_2.get(key).map(String::as_str)
    }

    fn file_3(dir: &std::path::Path, tag: &str) -> PathBuf {
        dir.join("lang")
            .join(format!("{}.toml", lang::gui_fan(tag)))
    }
}

pub fn install_2(manifest: &Manifest, application_language: &str) -> LanguagePack {
    let id = &manifest.meta.id;
    let langs = &manifest.meta.langs;

    if langs.is_empty() {
        return LanguagePack::default();
    }

    let (tag, ok) = match lang::pi_pei(application_language, langs) {
        Some(t) => (t, true),
        None => (lang::PLUGIN_FALLBACK.to_owned(), false),
    };

    let table_2 = read_2(&manifest.dir, &tag).unwrap_or_else(|reason_2| {
        crate::debug_log!(
            "[nota:{id}] missing lang/{}.toml ({reason_2}); falling back to source strings",
            lang::gui_fan(&tag)
        );
        HashMap::new()
    });

    LanguagePack {
        declaration_2: true,
        lang: Some(lang::gui_fan(&tag)),
        ok,
        table_2,
    }
}

fn read_2(
    dir: &std::path::Path,
    tag: &str,
) -> std::result::Result<HashMap<String, String>, String> {
    let lu = LanguagePack::file_3(dir, tag);
    let text_2 = std::fs::read_to_string(&lu)
        .map_err(|e| format!("Could not read {}: {e}", lu.display()))?;
    lang::read_language_file(&text_2)
}

pub fn build(
    lua: &Lua,
    bao: &LanguagePack,
    application_language: &str,
) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;
    t.set("app_lang", application_language.to_owned())
        .map_err(mlua_to_nota)?;

    match &bao.lang {
        Some(l) => t.set("lang", l.clone()).map_err(mlua_to_nota)?,
        None => t.set("lang", Value::Nil).map_err(mlua_to_nota)?,
    }
    t.set("ok", bao.ok).map_err(mlua_to_nota)?;

    let table_2 = bao.table_2.clone();
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

    fn jian(dir: &std::path::Path, tag: &str, content_2: &str) {
        std::fs::create_dir_all(dir.join("lang")).unwrap();
        std::fs::write(dir.join("lang").join(format!("{tag}.toml")), content_2).unwrap();
    }

    fn temp_directory(ming: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("nota-i18n-test-{ming}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn bu_declaration_langs_jiu_bu_xie_shang_ye_bu_ti_shi() {
        let dir = temp_directory("\u{6ca1}\u{58f0}\u{660e}");
        let bao = install_2(&manifest_2(dir.clone(), &[]), "zh-CN");
        assert!(!bao.declaration_2);
        assert_eq!(bao.lang, None);
        assert!(bao.ok, "\u{6ca1}\u{58f0}\u{660e} `langs` \u{7684}\u{62d3}\u{5c55}\u{4e0d}\u{8be5}\u{88ab}\u{5224}\u{6210}\u{300c}\u{4e0d}\u{652f}\u{6301}\u{4f60}\u{7684}\u{8bed}\u{8a00}\u{300d}");
        assert!(bao.table_2.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn ming_zhong_de_language_yong_na_yi_fen_mei_ming_zhong_jiu_yong_ying_yu_bing_shuo_yi_ju() {
        let dir = temp_directory("\u{547d}\u{4e2d}");
        jian(&dir, "zh-CN", "name = \"\u{4e2d}\u{6587}\u{540d}\"\ndescription = \"\u{4e2d}\u{6587}\u{7b80}\u{4ecb}\"\nhint = \"\u{4f60}\u{597d}\"\n");
        jian(&dir, "en", "name = \"English name\"\nhint = \"hi\"\n");

        let zhong_wen = install_2(&manifest_2(dir.clone(), &["zh-CN", "en"]), "zh-CN");
        assert!(zhong_wen.ok);
        assert_eq!(zhong_wen.lang.as_deref(), Some("zh-CN"));
        assert_eq!(zhong_wen.name_2(), Some("\u{4e2d}\u{6587}\u{540d}"));
        assert_eq!(
            zhong_wen.miao_shu(),
            Some("\u{4e2d}\u{6587}\u{7b80}\u{4ecb}")
        );
        assert_eq!(zhong_wen.qu_2("hint"), Some("\u{4f60}\u{597d}"));

        let ying_wen = install_2(&manifest_2(dir.clone(), &["zh-CN", "en"]), "ja-JP");
        assert!(!ying_wen.ok, "\u{65e5}\u{8bed}\u{4e0d}\u{5728} langs \u{91cc} \u{2192} \u{8bf4}\u{300c}\u{4e0d}\u{652f}\u{6301}\u{4f60}\u{7684}\u{8bed}\u{8a00}\u{300d}");
        assert_eq!(ying_wen.lang.as_deref(), Some("en"));
        assert_eq!(ying_wen.name_2(), Some("English name"));

        assert_eq!(ying_wen.miao_shu(), None, "\u{8868}\u{91cc}\u{6ca1}\u{5199}\u{5c31}\u{9000}\u{56de}\u{6e05}\u{5355}\u{ff0c}\u{522b}\u{51ed}\u{7a7a}\u{9020}\u{4e00}\u{53e5}");

        let dir2 = temp_directory("\u{524d}\u{7f00}");
        jian(&dir2, "zh", "name = \"\u{4e2d}\u{6587}\"\n");
        jian(&dir2, "en", "name = \"English\"\n");
        let cu = install_2(&manifest_2(dir2.clone(), &["zh", "en"]), "zh-CN");
        assert!(cu.ok);
        assert_eq!(cu.lang.as_deref(), Some("zh"));

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&dir2);
    }

    #[test]
    fn que_file_zhi_tui_hui_yuan_wen_bu_ba_hua_shuo_guo_tou() {
        let dir = temp_directory("\u{7f3a}\u{6587}\u{4ef6}");
        let bao = install_2(&manifest_2(dir.clone(), &["zh-CN", "en"]), "zh-CN");
        assert!(bao.ok, "\u{6e05}\u{5355}\u{91cc}\u{6709} zh-CN\u{ff0c}\u{5c31}\u{4e0d}\u{8be5}\u{8bf4}\u{300c}\u{4e0d}\u{652f}\u{6301}\u{4f60}\u{7684}\u{8bed}\u{8a00}\u{300d}");
        assert_eq!(bao.lang.as_deref(), Some("zh-CN"));
        assert!(bao.table_2.is_empty(), "\u{8868}\u{7a7a}\u{4e86}\u{ff0c}\u{4ea4}\u{7ed9}\u{62d3}\u{5c55}\u{7684} `or \u{539f}\u{6587}` \u{515c}\u{5e95}");
        assert_eq!(bao.name_2(), None);

        let ying = install_2(&manifest_2(dir.clone(), &["en"]), "zh-CN");
        assert!(!ying.ok, "zh-CN \u{4e0d}\u{5728}\u{5b83}\u{7684}\u{5217}\u{8868}\u{91cc} \u{2192} \u{8bf4}\u{8fd9}\u{53e5}\u{ff0c}\u{7528} en");
        assert_eq!(ying.lang.as_deref(), Some("en"));
        assert!(ying.table_2.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn table_li_mei_you_na_tiao_jian_shi_text_gei_nil() {
        let dir = temp_directory("\u{7f3a}\u{952e}");
        jian(&dir, "en", "a = \"\u{7532}\"\n");
        let bao = install_2(&manifest_2(dir.clone(), &["en"]), "en");

        let lua = Lua::new();
        let t = build(&lua, &bao, "en").unwrap();
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
    fn mei_declaration_langs_shi_lang_shi_nil_er_app_lang_hai_zai() {
        let dir = temp_directory("nil");
        let bao = install_2(&manifest_2(dir.clone(), &[]), "zh-CN");
        let lua = Lua::new();
        let t = build(&lua, &bao, "zh-CN").unwrap();
        assert_eq!(t.get::<Option<String>>("lang").unwrap(), None);
        assert_eq!(
            t.get::<Option<String>>("app_lang").unwrap().as_deref(),
            Some("zh-CN"),
            "\u{5e94}\u{7528}\u{5728}\u{8bf4}\u{54ea}\u{79cd}\u{8bed}\u{8a00}\u{ff0c}\u{62d3}\u{5c55}\u{6c38}\u{8fdc}\u{8bfb}\u{5f97}\u{5230}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn filename_an_gui_fan_write_fa_zhao() {
        let dir = temp_directory("\u{89c4}\u{8303}");
        jian(
            &dir,
            "zh-CN",
            "hint = \"\u{4e0b}\u{5212}\u{7ebf}\u{4e5f}\u{8ba4}\"\n",
        );
        let bao = install_2(&manifest_2(dir.clone(), &["zh_CN", "en"]), "zh-CN");
        assert!(bao.ok, "\u{6e05}\u{5355}\u{91cc}\u{7684}\u{4e0b}\u{5212}\u{7ebf}\u{5199}\u{6cd5}\u{8981}\u{80fd}\u{88ab}\u{5f52}\u{4e00}\u{5316}");
        assert_eq!(
            bao.qu_2("hint"),
            Some("\u{4e0b}\u{5212}\u{7ebf}\u{4e5f}\u{8ba4}")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
