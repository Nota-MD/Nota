use std::path::Path;

use serde::Deserialize;

use crate::error::{NotaError, Result};

use super::manifest::Capability;

pub enum SettingsValue {
    Number(f64),
    Text(String),
    Toggle(bool),
}

#[derive(Debug, Clone, Deserialize)]
pub struct SettingDecl {
    pub key: String,

    #[serde(default = "default_setting_kind")]
    pub kind: String,

    pub label: String,

    #[serde(default)]
    pub help: String,

    #[serde(default)]
    pub min: Option<f64>,

    #[serde(default)]
    pub max: Option<f64>,

    #[serde(default)]
    pub default: Option<f64>,

    #[serde(default)]
    pub step: Option<f64>,

    #[serde(default)]
    pub unit: String,

    #[serde(default)]
    pub placeholder: String,

    #[serde(default)]
    pub secret: bool,

    #[serde(default)]
    pub default_text: Option<String>,

    #[serde(default)]
    pub default_on: Option<bool>,
}

fn default_setting_kind() -> String {
    "range".to_owned()
}

impl SettingDecl {
    pub fn step(&self) -> f64 {
        self.step.unwrap_or(1.0)
    }

    pub fn qiu_value(&self, file_li: Option<&toml::Value>) -> SettingsValue {
        match self.kind.as_str() {
            "text" => {
                let cong_file = match file_li {
                    Some(toml::Value::String(s)) => Some(s.clone()),
                    _ => None,
                };
                SettingsValue::Text(
                    cong_file
                        .or_else(|| self.default_text.clone())
                        .unwrap_or_default(),
                )
            }
            "toggle" => {
                let cong_file = match file_li {
                    Some(toml::Value::Boolean(b)) => Some(*b),

                    Some(toml::Value::String(s)) => match s.as_str() {
                        "1" | "true" => Some(true),
                        "0" | "false" => Some(false),
                        _ => None,
                    },
                    _ => None,
                };
                SettingsValue::Toggle(cong_file.unwrap_or_else(|| self.default_on.unwrap_or(false)))
            }

            _ => {
                let cong_file = match file_li {
                    Some(toml::Value::Integer(i)) => Some(*i as f64),
                    Some(toml::Value::Float(f)) => Some(*f),
                    _ => None,
                };
                SettingsValue::Number(
                    self.jia_jin(cong_file.unwrap_or_else(|| self.default.unwrap_or(0.0))),
                )
            }
        }
    }

    pub fn receive_value(&self, v: &serde_json::Value) -> Result<toml::Value> {
        let bu_xiang =
            |yao: &str| NotaError::other(format!("Setting `{}` requires {yao}", self.key));
        match self.kind.as_str() {
            "text" => {
                let s = v.as_str().ok_or_else(|| bu_xiang("a string"))?;

                if s.chars().count() > 4000 {
                    return Err(bu_xiang("a string of at most 4000 characters"));
                }
                Ok(toml::Value::String(s.to_owned()))
            }
            "toggle" => {
                let b = v.as_bool().ok_or_else(|| bu_xiang("a toggle value"))?;
                Ok(toml::Value::Boolean(b))
            }
            _ => {
                let n = v.as_f64().ok_or_else(|| bu_xiang("a number"))?;
                Ok(toml::Value::Float(self.jia_jin(n)))
            }
        }
    }

    pub fn jia_jin(&self, v: f64) -> f64 {
        let lo = self.min.unwrap_or(0.0);
        let hi = self.max.unwrap_or(0.0);
        if !v.is_finite() {
            return self.default.unwrap_or(lo);
        }
        let jia_guo = v.max(lo).min(hi);
        let step = self.step();
        if step <= 0.0 {
            return jia_guo;
        }

        let n = ((jia_guo - lo) / step).round();
        let dui_qi = lo + n * step;

        let wei = xiao_shu_wei(step);
        let receive_3 = (dui_qi * 10f64.powi(wei)).round() / 10f64.powi(wei);
        receive_3.max(lo).min(hi)
    }
}

fn xiao_shu_wei(step: f64) -> i32 {
    for wei in 0..=6 {
        let fang_da = 10f64.powi(wei);
        if (step * fang_da).fract().abs() < 1e-9 {
            return wei;
        }
    }
    6
}

pub(crate) fn check_settings(
    chuan: Vec<SettingDecl>,
    capabilities: &[Capability],
    file: &Path,
) -> Result<Vec<SettingDecl>> {
    if chuan.is_empty() {
        return Ok(chuan);
    }

    let bao_2 = |reason_2: String| NotaError::Manifest {
        file: file.to_path_buf(),
        reason: reason_2,
    };

    if !capabilities.contains(&Capability::SettingsOwn) {
        return Err(bao_2(
            "`[[settings]]` requires the `settings.own` capability because the rendered control writes the extension's settings file"
                .to_owned(),
        ));
    }

    let mut jian_guo_de: Vec<&str> = Vec::new();
    for s in &chuan {
        if s.key.is_empty() {
            return Err(bao_2("A `[[settings]]` key cannot be empty".to_owned()));
        }
        if !s
            .key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        {
            return Err(bao_2(format!(
                "Invalid `[[settings]]` key `{}`; use ASCII letters, digits, `-`, and `_`",
                s.key
            )));
        }
        if jian_guo_de.contains(&s.key.as_str()) {
            return Err(bao_2(format!("Duplicate `[[settings]]` key `{}`", s.key)));
        }
        jian_guo_de.push(&s.key);

        if s.label.trim().is_empty() {
            return Err(bao_2(format!(
                "`[[settings]] {}` is missing a label",
                s.key
            )));
        }

        if !matches!(s.kind.as_str(), "range" | "text" | "toggle") {
            return Err(bao_2(format!(
                "Unknown `[[settings]] {}` kind `{}`; use `range`, `text`, or `toggle`",
                s.key, s.kind
            )));
        }

        let bu_xu = |zi_duan: &str, wei_shen_me: &str| {
            bao_2(format!(
                "`[[settings]] {}` has kind `{}` and cannot use `{zi_duan}` ({wei_shen_me})",
                s.key, s.kind
            ))
        };
        let you_shu = s.min.is_some() || s.max.is_some() || s.default.is_some() || s.step.is_some();
        let you_wen = s.secret || !s.placeholder.is_empty() || s.default_text.is_some();
        let you_enabled_default = s.default_on.is_some();
        match s.kind.as_str() {
            "range" => {
                if you_wen {
                    return Err(bu_xu(
                        "secret / placeholder / default_text",
                        "this field belongs to `text`",
                    ));
                }
                if you_enabled_default {
                    return Err(bu_xu("default_on", "this field belongs to `toggle`"));
                }
            }
            "text" => {
                if you_shu {
                    return Err(bu_xu(
                        "min / max / default / step",
                        "this field belongs to `range`; text settings use `default_text`",
                    ));
                }
                if you_enabled_default {
                    return Err(bu_xu("default_on", "this field belongs to `toggle`"));
                }
                if !s.unit.is_empty() {
                    return Err(bu_xu("unit", "Text settings cannot define a unit"));
                }
            }

            _ => {
                if you_shu {
                    return Err(bu_xu(
                        "min / max / default / step",
                        "this field belongs to `range`",
                    ));
                }
                if you_wen {
                    return Err(bu_xu(
                        "secret / placeholder / default_text",
                        "this field belongs to `text`",
                    ));
                }
                if !s.unit.is_empty() {
                    return Err(bu_xu("unit", "Toggle settings cannot define a unit"));
                }
            }
        }

        if s.kind == "range" {
            let (Some(lo), Some(hi), Some(default_2)) = (s.min, s.max, s.default) else {
                return Err(bao_2(format!(
                    "`[[settings]] {}` is a `range` and requires min, max, and default",
                    s.key
                )));
            };
            if !lo.is_finite() || !hi.is_finite() || !default_2.is_finite() {
                return Err(bao_2(format!(
                    "`[[settings]] {}` has a non-numeric range value",
                    s.key
                )));
            }
            if lo >= hi {
                return Err(bao_2(format!(
                    "`[[settings]] {}` has min ({lo}) greater than or equal to max ({hi})",
                    s.key
                )));
            }
            if default_2 < lo || default_2 > hi {
                return Err(bao_2(format!(
                    "`[[settings]] {}` default ({default_2}) is outside {lo}..{hi}",
                    s.key
                )));
            }
            if let Some(step) = s.step {
                if !(step > 0.0) || !step.is_finite() || step > hi - lo {
                    return Err(bao_2(format!(
                        "`[[settings]] {}` step ({step}) must be between 0 and {:.0}",
                        s.key,
                        hi - lo
                    )));
                }
            }
        }
    }

    Ok(chuan)
}

#[cfg(test)]
mod tests {
    use super::super::manifest::{tests::write_manifest, Manifest};

    fn dai_settings_de_manifest(
        ming: &str,
        settings_duan: &str,
        neng_li: &str,
    ) -> std::result::Result<Manifest, String> {
        let dir = std::env::temp_dir().join(format!("nota-manifest-set-{ming}"));
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            &format!(
                "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = \"v2.3\"\ncapabilities = [{neng_li}]\n{settings_duan}"
            ),
        );
        let r = Manifest::load(&dir.join("plugin.toml")).map_err(|e| e.to_string());
        let _ = std::fs::remove_dir_all(&dir);
        r
    }

    const TEST_SETTINGS: &str = r#"
[[settings]]
key = "window_seconds"
kind = "range"
label = "Speed window"
help = "How many seconds the big number looks back over."
min = 1
max = 60
default = 5
unit = "s"
"#;

    #[test]
    fn declaration_le_settings_jiu_parse_de_chu_lai() {
        let m = dai_settings_de_manifest("good", TEST_SETTINGS, "\"settings.own\"").unwrap();
        assert_eq!(m.settings.len(), 1);
        let s = &m.settings[0];
        assert_eq!(s.key, "window_seconds");
        assert_eq!(s.label, "Speed window");
        assert_eq!(s.min, Some(1.0));
        assert_eq!(s.max, Some(60.0));
        assert_eq!(s.default, Some(5.0));
        assert_eq!(s.unit, "s");

        assert_eq!(s.step(), 1.0);
    }

    #[test]
    fn settings_de_value_hui_jia_jin_fan_wei_bing_dui_qi_bu_zhang() {
        let m = dai_settings_de_manifest("clamp", TEST_SETTINGS, "\"settings.own\"").unwrap();
        let s = &m.settings[0];
        assert_eq!(
            s.jia_jin(5.0),
            5.0,
            "\u{8303}\u{56f4}\u{5185}\u{7684}\u{539f}\u{6837}"
        );
        assert_eq!(
            s.jia_jin(999.0),
            60.0,
            "\u{8d85}\u{4e0a}\u{754c}\u{5939}\u{5230}\u{4e0a}\u{754c}"
        );
        assert_eq!(
            s.jia_jin(-3.0),
            1.0,
            "\u{4f4e}\u{4e8e}\u{4e0b}\u{754c}\u{5939}\u{5230}\u{4e0b}\u{754c}"
        );
        assert_eq!(
            s.jia_jin(2.7),
            3.0,
            "\u{6b65}\u{957f} 1 \u{4e0a}\u{5bf9}\u{9f50}\u{5230} 3"
        );
        assert_eq!(s.jia_jin(2.4), 2.0);

        assert_eq!(
            s.jia_jin(f64::NAN),
            5.0,
            "\u{4e0d}\u{662f}\u{6570}\u{5c31}\u{7528}\u{9ed8}\u{8ba4}\u{503c}"
        );

        assert_eq!(s.jia_jin(1.0), 1.0);
    }

    #[test]
    fn declaration_le_settings_que_mei_shen_qing_neng_li_yao_bao_cuo() {
        let err = dai_settings_de_manifest("nocap", TEST_SETTINGS, "\"ui.panel\"").unwrap_err();
        assert!(
            err.contains("settings.own"),
            "\u{5b9e}\u{9645}\u{ff1a}{err}"
        );
    }

    #[test]
    fn zhi_you_neng_li_bu_declaration_settings_shi_zheng_chang_de() {
        let m = dai_settings_de_manifest("caponly", "", "\"settings.own\"").unwrap();
        assert!(m.settings.is_empty());
    }

    #[test]
    fn ren_bu_chu_de_kong_jian_lei_xing_yao_bao_cuo() {
        let duan = TEST_SETTINGS.replace("kind = \"range\"", "kind = \"slider\"");
        let err = dai_settings_de_manifest("kind", &duan, "\"settings.own\"").unwrap_err();
        assert!(err.contains("slider"), "\u{5b9e}\u{9645}\u{ff1a}{err}");
    }

    #[test]
    fn range_san_jian_tao_que_yi_ge_yao_bao_cuo() {
        let duan = TEST_SETTINGS.replace("default = 5\n", "");
        let err = dai_settings_de_manifest("nodefault", &duan, "\"settings.own\"").unwrap_err();
        assert!(err.contains("default"), "\u{5b9e}\u{9645}\u{ff1a}{err}");

        let duan = TEST_SETTINGS.replace("max = 60\n", "");
        let err = dai_settings_de_manifest("nomax", &duan, "\"settings.own\"").unwrap_err();
        assert!(
            err.contains("requires min, max, and default"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn default_value_chu_jie_huo_fan_wei_dian_dao_yao_bao_cuo() {
        let err = dai_settings_de_manifest(
            "outofrange",
            &TEST_SETTINGS.replace("default = 5", "default = 99"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("is outside"), "unexpected error: {err}");

        let err = dai_settings_de_manifest(
            "inverted",
            &TEST_SETTINGS.replace("max = 60", "max = 0"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(
            err.contains("greater than or equal"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn settings_jian_zhong_fu_yao_bao_cuo() {
        let duan = format!("{TEST_SETTINGS}{TEST_SETTINGS}");
        let err = dai_settings_de_manifest("dup", &duan, "\"settings.own\"").unwrap_err();
        assert!(
            err.contains("Duplicate `[[settings]]` key"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn settings_jian_li_you_guai_zi_fu_yao_bao_cuo() {
        let err = dai_settings_de_manifest(
            "badkey",
            &TEST_SETTINGS.replace("window_seconds", "window.seconds"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(
            err.contains("Invalid `[[settings]]` key"),
            "unexpected error: {err}"
        );
    }

    const TEXT_AND_TOGGLE_SETTINGS: &str = r#"
[[settings]]
key = "base_url"
kind = "text"
label = "Endpoint URL"
placeholder = "https://api.openai.com/v1"

[[settings]]
key = "api_key"
kind = "text"
label = "API key"
secret = true

[[settings]]
key = "stream"
kind = "toggle"
label = "Show answers as they are written"
default_on = true
"#;

    #[test]
    fn wen_zi_yu_enabled_na_liang_dang_parse_de_chu_lai() {
        let m =
            dai_settings_de_manifest("text-toggle", TEXT_AND_TOGGLE_SETTINGS, "\"settings.own\"")
                .unwrap();
        assert_eq!(m.settings.len(), 3);
        assert_eq!(m.settings[0].kind, "text");
        assert_eq!(m.settings[0].placeholder, "https://api.openai.com/v1");
        assert!(!m.settings[0].secret);

        assert_eq!(m.settings[0].default_text, None);
        assert!(m.settings[1].secret);
        assert_eq!(m.settings[2].kind, "toggle");
        assert_eq!(m.settings[2].default_on, Some(true));

        assert_eq!(
            m.settings[0].default_on, None,
            "\u{53ea}\u{6709} toggle \u{90a3}\u{4e00}\u{6863}\u{624d}\u{8ba4}\u{5b83}"
        );
    }

    #[test]
    fn dang_wei_yu_zi_duan_dui_bu_shang_yao_bao_cuo() {
        let err = dai_settings_de_manifest(
            "toggle-min",
            &TEXT_AND_TOGGLE_SETTINGS.replace("default_on = true", "default_on = true\nmin = 1"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("cannot use"), "unexpected error: {err}");

        let err = dai_settings_de_manifest(
            "text-unit",
            &TEXT_AND_TOGGLE_SETTINGS
                .replace("label = \"API key\"", "label = \"API key\"\nunit = \"px\""),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("cannot use"), "unexpected error: {err}");

        let err = dai_settings_de_manifest(
            "range-secret",
            &TEST_SETTINGS.replace("unit = \"s\"", "unit = \"s\"\nsecret = true"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("cannot use"), "unexpected error: {err}");
    }

    #[test]
    fn san_dang_de_value_dou_read_de_hui_lai() {
        let m = dai_settings_de_manifest(
            "values",
            &format!("{TEST_SETTINGS}{TEXT_AND_TOGGLE_SETTINGS}"),
            "\"settings.own\"",
        )
        .unwrap();
        let zi_2 = m.settings.iter().find(|s| s.key == "base_url").unwrap();
        let enabled_2 = m.settings.iter().find(|s| s.key == "stream").unwrap();
        let hua_gan = m
            .settings
            .iter()
            .find(|s| s.key == "window_seconds")
            .unwrap();

        assert!(matches!(
            zi_2.qiu_value(None),
            super::SettingsValue::Text(v) if v == ""
        ));
        assert!(matches!(
            enabled_2.qiu_value(None),
            super::SettingsValue::Toggle(true)
        ));
        assert!(matches!(hua_gan.qiu_value(None), super::SettingsValue::Number(v) if v == 5.0));

        assert!(matches!(
            enabled_2.qiu_value(Some(&toml::Value::String("1".into()))),
            super::SettingsValue::Toggle(true)
        ));
        assert!(matches!(
            enabled_2.qiu_value(Some(&toml::Value::String("0".into()))),
            super::SettingsValue::Toggle(false)
        ));

        assert!(matches!(
            enabled_2.qiu_value(Some(&toml::Value::Integer(7))),
            super::SettingsValue::Toggle(true)
        ));
        assert!(matches!(
            zi_2.qiu_value(Some(&toml::Value::Integer(9))),
            super::SettingsValue::Text(v) if v == ""
        ));

        assert!(matches!(
            hua_gan.qiu_value(Some(&toml::Value::Integer(999))),
            super::SettingsValue::Number(v) if v == 60.0
        ));
    }

    #[test]
    fn receive_value_an_dang_wei_xiao_yan() {
        let m = dai_settings_de_manifest(
            "collect",
            &format!("{TEST_SETTINGS}{TEXT_AND_TOGGLE_SETTINGS}"),
            "\"settings.own\"",
        )
        .unwrap();
        let zi_2 = m.settings.iter().find(|s| s.key == "base_url").unwrap();
        let enabled_2 = m.settings.iter().find(|s| s.key == "stream").unwrap();
        let hua_gan = m
            .settings
            .iter()
            .find(|s| s.key == "window_seconds")
            .unwrap();

        assert_eq!(
            zi_2.receive_value(&serde_json::json!("https://x/v1"))
                .unwrap(),
            toml::Value::String("https://x/v1".into())
        );
        assert!(
            zi_2.receive_value(&serde_json::json!(12)).is_err(),
            "\u{6587}\u{672c}\u{90a3}\u{6863}\u{4e0d}\u{6536}\u{6570}"
        );
        assert_eq!(
            enabled_2.receive_value(&serde_json::json!(true)).unwrap(),
            toml::Value::Boolean(true)
        );
        assert!(
            enabled_2.receive_value(&serde_json::json!("1")).is_err(),
            "\u{5f00}\u{5173}\u{90a3}\u{6863}\u{4e0d}\u{6536}\u{5b57}\u{7b26}\u{4e32}"
        );

        assert_eq!(
            hua_gan.receive_value(&serde_json::json!(999)).unwrap(),
            toml::Value::Float(60.0)
        );

        let zhang = "\u{5b57}".repeat(4001);
        assert!(
            zi_2.receive_value(&serde_json::json!(zhang)).is_err(),
            "\u{8fc7}\u{957f}\u{7684}\u{6587}\u{672c}\u{8981}\u{62d2}"
        );
    }
}
