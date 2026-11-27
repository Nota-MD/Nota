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
    pub multiline: bool,

    #[serde(default)]
    pub default_on: Option<bool>,

    #[serde(default)]
    pub options_command: String,

    #[serde(default)]
    pub change_command: String,

    #[serde(default)]
    pub create_command: String,

    #[serde(default)]
    pub rename_command: String,

    #[serde(default)]
    pub delete_command: String,
}

fn default_setting_kind() -> String {
    "range".to_owned()
}

impl SettingDecl {
    pub fn step(&self) -> f64 {
        self.step.unwrap_or(1.0)
    }

    pub fn request_value(&self, file_inner: Option<&toml::Value>) -> SettingsValue {
        match self.kind.as_str() {
            "text" | "select" => {
                let from_file = match file_inner {
                    Some(toml::Value::String(s)) => Some(s.clone()),
                    _ => None,
                };
                SettingsValue::Text(
                    from_file
                        .or_else(|| self.default_text.clone())
                        .unwrap_or_default(),
                )
            }
            "toggle" => {
                let from_file = match file_inner {
                    Some(toml::Value::Boolean(b)) => Some(*b),

                    Some(toml::Value::String(s)) => match s.as_str() {
                        "1" | "true" => Some(true),
                        "0" | "false" => Some(false),
                        _ => None,
                    },
                    _ => None,
                };
                SettingsValue::Toggle(from_file.unwrap_or_else(|| self.default_on.unwrap_or(false)))
            }

            _ => {
                let from_file = match file_inner {
                    Some(toml::Value::Integer(i)) => Some(*i as f64),
                    Some(toml::Value::Float(f)) => Some(*f),
                    _ => None,
                };
                SettingsValue::Number(
                    self.add_enter(from_file.unwrap_or_else(|| self.default.unwrap_or(0.0))),
                )
            }
        }
    }

    pub fn receive_value(&self, v: &serde_json::Value) -> Result<toml::Value> {
        let not_item =
            |need: &str| NotaError::other(format!("Setting `{}` requires {need}", self.key));
        match self.kind.as_str() {
            "text" | "select" => {
                let s = v.as_str().ok_or_else(|| not_item("a string"))?;

                if s.chars().count() > 4000 {
                    return Err(not_item("a string of at most 4000 characters"));
                }
                Ok(toml::Value::String(s.to_owned()))
            }
            "toggle" => {
                let b = v.as_bool().ok_or_else(|| not_item("a toggle value"))?;
                Ok(toml::Value::Boolean(b))
            }
            _ => {
                let n = v.as_f64().ok_or_else(|| not_item("a number"))?;
                Ok(toml::Value::Float(self.add_enter(n)))
            }
        }
    }

    pub fn add_enter(&self, v: f64) -> f64 {
        let lo = self.min.unwrap_or(0.0);
        let hi = self.max.unwrap_or(0.0);
        if !v.is_finite() {
            return self.default.unwrap_or(lo);
        }
        let add_passed = v.max(lo).min(hi);
        let step = self.step();
        if step <= 0.0 {
            return add_passed;
        }

        let n = ((add_passed - lo) / step).round();
        let pair_start = lo + n * step;

        let position = small_data_position(step);
        let receive_3 = (pair_start * 10f64.powi(position)).round() / 10f64.powi(position);
        receive_3.max(lo).min(hi)
    }
}

fn small_data_position(step: f64) -> i32 {
    for position in 0..=6 {
        let method_large = 10f64.powi(position);
        if (step * method_large).fract().abs() < 1e-9 {
            return position;
        }
    }
    6
}

pub(crate) fn check_settings(
    stream: Vec<SettingDecl>,
    capabilities: &[Capability],
    file: &Path,
) -> Result<Vec<SettingDecl>> {
    if stream.is_empty() {
        return Ok(stream);
    }

    let package_2 = |reason_2: String| NotaError::Manifest {
        file: file.to_path_buf(),
        reason: reason_2,
    };

    if !capabilities.contains(&Capability::SettingsOwn) {
        return Err(package_2(
            "`[[settings]]` requires the `settings.own` capability because the rendered control writes the extension's settings file"
                .to_owned(),
        ));
    }

    let mut check_passed: Vec<&str> = Vec::new();
    for s in &stream {
        if s.key.is_empty() {
            return Err(package_2("A `[[settings]]` key cannot be empty".to_owned()));
        }
        if !s
            .key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        {
            return Err(package_2(format!(
                "Invalid `[[settings]]` key `{}`; use ASCII letters, digits, `-`, and `_`",
                s.key
            )));
        }
        if check_passed.contains(&s.key.as_str()) {
            return Err(package_2(format!(
                "Duplicate `[[settings]]` key `{}`",
                s.key
            )));
        }
        check_passed.push(&s.key);

        if s.label.trim().is_empty() {
            return Err(package_2(format!(
                "`[[settings]] {}` is missing a label",
                s.key
            )));
        }

        if !matches!(s.kind.as_str(), "range" | "text" | "toggle" | "select") {
            return Err(package_2(format!(
                "Unknown `[[settings]] {}` kind `{}`; use `range`, `text`, `toggle`, or `select`",
                s.key, s.kind
            )));
        }

        let not_required = |character_segment: &str, position_deep: &str| {
            package_2(format!(
                "`[[settings]] {}` has kind `{}` and cannot use `{character_segment}` ({position_deep})",
                s.key, s.kind
            ))
        };
        let has_data =
            s.min.is_some() || s.max.is_some() || s.default.is_some() || s.step.is_some();
        let has_text =
            s.secret || !s.placeholder.is_empty() || s.default_text.is_some() || s.multiline;
        let has_enabled_default = s.default_on.is_some();
        let has_select = !s.options_command.is_empty()
            || !s.change_command.is_empty()
            || !s.create_command.is_empty()
            || !s.rename_command.is_empty()
            || !s.delete_command.is_empty();
        match s.kind.as_str() {
            "range" => {
                if has_text {
                    return Err(not_required(
                        "secret / placeholder / default_text / multiline",
                        "this field belongs to `text`",
                    ));
                }
                if has_enabled_default {
                    return Err(not_required("default_on", "this field belongs to `toggle`"));
                }
                if has_select {
                    return Err(not_required(
                        "options_command / change_command",
                        "this field belongs to `select`",
                    ));
                }
            }
            "text" => {
                if has_data {
                    return Err(not_required(
                        "min / max / default / step",
                        "this field belongs to `range`; text settings use `default_text`",
                    ));
                }
                if has_enabled_default {
                    return Err(not_required("default_on", "this field belongs to `toggle`"));
                }
                if !s.unit.is_empty() {
                    return Err(not_required("unit", "Text settings cannot define a unit"));
                }
                if has_select {
                    return Err(not_required(
                        "options_command / change_command",
                        "this field belongs to `select`",
                    ));
                }
            }

            "toggle" => {
                if has_data {
                    return Err(not_required(
                        "min / max / default / step",
                        "this field belongs to `range`",
                    ));
                }
                if has_text {
                    return Err(not_required(
                        "secret / placeholder / default_text / multiline",
                        "this field belongs to `text`",
                    ));
                }
                if !s.unit.is_empty() {
                    return Err(not_required("unit", "Toggle settings cannot define a unit"));
                }
                if has_select {
                    return Err(not_required(
                        "options_command / change_command",
                        "this field belongs to `select`",
                    ));
                }
            }

            _ => {
                if has_data {
                    return Err(not_required(
                        "min / max / default / step",
                        "this field belongs to `range`",
                    ));
                }
                if s.secret || s.multiline || !s.unit.is_empty() || has_enabled_default {
                    return Err(not_required(
                        "secret / multiline / unit / default_on",
                        "select settings use a text value and a command-backed option list",
                    ));
                }
                if s.options_command.trim().is_empty() {
                    return Err(package_2(format!(
                        "`[[settings]] {}` is a `select` and requires `options_command`",
                        s.key
                    )));
                }
            }
        }

        if s.kind == "range" {
            let (Some(lo), Some(hi), Some(default_2)) = (s.min, s.max, s.default) else {
                return Err(package_2(format!(
                    "`[[settings]] {}` is a `range` and requires min, max, and default",
                    s.key
                )));
            };
            if !lo.is_finite() || !hi.is_finite() || !default_2.is_finite() {
                return Err(package_2(format!(
                    "`[[settings]] {}` has a non-numeric range value",
                    s.key
                )));
            }
            if lo >= hi {
                return Err(package_2(format!(
                    "`[[settings]] {}` has min ({lo}) greater than or equal to max ({hi})",
                    s.key
                )));
            }
            if default_2 < lo || default_2 > hi {
                return Err(package_2(format!(
                    "`[[settings]] {}` default ({default_2}) is outside {lo}..{hi}",
                    s.key
                )));
            }
            if let Some(step) = s.step {
                if !(step > 0.0) || !step.is_finite() || step > hi - lo {
                    return Err(package_2(format!(
                        "`[[settings]] {}` step ({step}) must be between 0 and {:.0}",
                        s.key,
                        hi - lo
                    )));
                }
            }
        }
    }

    Ok(stream)
}

#[cfg(test)]
mod tests {
    use super::super::manifest::{tests::write_manifest, Manifest};

    fn pending_settings_manifest(
        name: &str,
        settings_segment: &str,
        can_inner: &str,
    ) -> std::result::Result<Manifest, String> {
        let dir = std::env::temp_dir().join(format!("nota-manifest-set-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            &format!(
                "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = \"v2.3\"\ncapabilities = [{can_inner}]\n{settings_segment}"
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
    fn declaration_settings_old_parse_out_incoming() {
        let m = pending_settings_manifest("good", TEST_SETTINGS, "\"settings.own\"").unwrap();
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
    fn settings_value_return_add_enter_reverse_position_and_pair_start_not_length() {
        let m = pending_settings_manifest("clamp", TEST_SETTINGS, "\"settings.own\"").unwrap();
        let s = &m.settings[0];
        assert_eq!(
            s.add_enter(5.0),
            5.0,
            "\u{8303}\u{56f4}\u{5185}\u{7684}\u{539f}\u{6837}"
        );
        assert_eq!(
            s.add_enter(999.0),
            60.0,
            "\u{8d85}\u{4e0a}\u{754c}\u{5939}\u{5230}\u{4e0a}\u{754c}"
        );
        assert_eq!(
            s.add_enter(-3.0),
            1.0,
            "\u{4f4e}\u{4e8e}\u{4e0b}\u{754c}\u{5939}\u{5230}\u{4e0b}\u{754c}"
        );
        assert_eq!(
            s.add_enter(2.7),
            3.0,
            "\u{6b65}\u{957f} 1 \u{4e0a}\u{5bf9}\u{9f50}\u{5230} 3"
        );
        assert_eq!(s.add_enter(2.4), 2.0);

        assert_eq!(
            s.add_enter(f64::NAN),
            5.0,
            "\u{4e0d}\u{662f}\u{6570}\u{5c31}\u{7528}\u{9ed8}\u{8ba4}\u{503c}"
        );

        assert_eq!(s.add_enter(1.0), 1.0);
    }

    #[test]
    fn declaration_settings_missing_each_deep_request_can_inner_need_package_error() {
        let err = pending_settings_manifest("nocap", TEST_SETTINGS, "\"ui.panel\"").unwrap_err();
        assert!(
            err.contains("settings.own"),
            "\u{5b9e}\u{9645}\u{ff1a}{err}"
        );
    }

    #[test]
    fn only_has_can_inner_not_declaration_settings_is_validate_long() {
        let m = pending_settings_manifest("caponly", "", "\"settings.own\"").unwrap();
        assert!(m.settings.is_empty());
    }

    #[test]
    fn person_not_out_empty_check_kind_line_need_package_error() {
        let segment = TEST_SETTINGS.replace("kind = \"range\"", "kind = \"slider\"");
        let err = pending_settings_manifest("kind", &segment, "\"settings.own\"").unwrap_err();
        assert!(err.contains("slider"), "\u{5b9e}\u{9645}\u{ff1a}{err}");
    }

    #[test]
    fn range_three_check_escape_missing_one_need_package_error() {
        let segment = TEST_SETTINGS.replace("default = 5\n", "");
        let err = pending_settings_manifest("nodefault", &segment, "\"settings.own\"").unwrap_err();
        assert!(err.contains("default"), "\u{5b9e}\u{9645}\u{ff1a}{err}");

        let segment = TEST_SETTINGS.replace("max = 60\n", "");
        let err = pending_settings_manifest("nomax", &segment, "\"settings.own\"").unwrap_err();
        assert!(
            err.contains("requires min, max, and default"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn default_value_out_boundary_active_reverse_position_point_to_need_package_error() {
        let err = pending_settings_manifest(
            "outofrange",
            &TEST_SETTINGS.replace("default = 5", "default = 99"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("is outside"), "unexpected error: {err}");

        let err = pending_settings_manifest(
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
    fn settings_check_middle_service_need_package_error() {
        let segment = format!("{TEST_SETTINGS}{TEST_SETTINGS}");
        let err = pending_settings_manifest("dup", &segment, "\"settings.own\"").unwrap_err();
        assert!(
            err.contains("Duplicate `[[settings]]` key"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn settings_check_inner_has_unexpected_character_service_need_package_error() {
        let err = pending_settings_manifest(
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
    fn text_character_and_enabled_that_two_when_parse_out_incoming() {
        let m =
            pending_settings_manifest("text-toggle", TEXT_AND_TOGGLE_SETTINGS, "\"settings.own\"")
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
    fn multiline_text_setting_is_parsed_and_rejected_on_non_text_kinds() {
        let multiline = r#"
[[settings]]
key = "persona_prompt"
kind = "text"
label = "Custom preset instructions"
multiline = true
"#;
        let m = pending_settings_manifest("multiline-text", multiline, "\"settings.own\"").unwrap();
        assert!(m.settings[0].multiline);

        let err = pending_settings_manifest(
            "multiline-toggle",
            &TEXT_AND_TOGGLE_SETTINGS
                .replace("default_on = true", "default_on = true\nmultiline = true"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("cannot use"), "unexpected error: {err}");
    }

    #[test]
    fn when_position_and_character_segment_pair_not_upper_need_package_error() {
        let err = pending_settings_manifest(
            "toggle-min",
            &TEXT_AND_TOGGLE_SETTINGS.replace("default_on = true", "default_on = true\nmin = 1"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("cannot use"), "unexpected error: {err}");

        let err = pending_settings_manifest(
            "text-unit",
            &TEXT_AND_TOGGLE_SETTINGS
                .replace("label = \"API key\"", "label = \"API key\"\nunit = \"px\""),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("cannot use"), "unexpected error: {err}");

        let err = pending_settings_manifest(
            "range-secret",
            &TEST_SETTINGS.replace("unit = \"s\"", "unit = \"s\"\nsecret = true"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("cannot use"), "unexpected error: {err}");
    }

    #[test]
    fn three_when_value_all_read_return_incoming() {
        let m = pending_settings_manifest(
            "values",
            &format!("{TEST_SETTINGS}{TEXT_AND_TOGGLE_SETTINGS}"),
            "\"settings.own\"",
        )
        .unwrap();
        let character_2 = m.settings.iter().find(|s| s.key == "base_url").unwrap();
        let enabled_2 = m.settings.iter().find(|s| s.key == "stream").unwrap();
        let render_clean = m
            .settings
            .iter()
            .find(|s| s.key == "window_seconds")
            .unwrap();

        assert!(matches!(
            character_2.request_value(None),
            super::SettingsValue::Text(v) if v == ""
        ));
        assert!(matches!(
            enabled_2.request_value(None),
            super::SettingsValue::Toggle(true)
        ));
        assert!(
            matches!(render_clean.request_value(None), super::SettingsValue::Number(v) if v == 5.0)
        );

        assert!(matches!(
            enabled_2.request_value(Some(&toml::Value::String("1".into()))),
            super::SettingsValue::Toggle(true)
        ));
        assert!(matches!(
            enabled_2.request_value(Some(&toml::Value::String("0".into()))),
            super::SettingsValue::Toggle(false)
        ));

        assert!(matches!(
            enabled_2.request_value(Some(&toml::Value::Integer(7))),
            super::SettingsValue::Toggle(true)
        ));
        assert!(matches!(
            character_2.request_value(Some(&toml::Value::Integer(9))),
            super::SettingsValue::Text(v) if v == ""
        ));

        assert!(matches!(
            render_clean.request_value(Some(&toml::Value::Integer(999))),
            super::SettingsValue::Number(v) if v == 60.0
        ));
    }

    #[test]
    fn receive_value_by_when_position_small_validate() {
        let m = pending_settings_manifest(
            "collect",
            &format!("{TEST_SETTINGS}{TEXT_AND_TOGGLE_SETTINGS}"),
            "\"settings.own\"",
        )
        .unwrap();
        let character_2 = m.settings.iter().find(|s| s.key == "base_url").unwrap();
        let enabled_2 = m.settings.iter().find(|s| s.key == "stream").unwrap();
        let render_clean = m
            .settings
            .iter()
            .find(|s| s.key == "window_seconds")
            .unwrap();

        assert_eq!(
            character_2
                .receive_value(&serde_json::json!("https://x/v1"))
                .unwrap(),
            toml::Value::String("https://x/v1".into())
        );
        assert!(
            character_2.receive_value(&serde_json::json!(12)).is_err(),
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
            render_clean.receive_value(&serde_json::json!(999)).unwrap(),
            toml::Value::Float(60.0)
        );

        let length = "\u{5b57}".repeat(4001);
        assert!(
            character_2
                .receive_value(&serde_json::json!(length))
                .is_err(),
            "\u{8fc7}\u{957f}\u{7684}\u{6587}\u{672c}\u{8981}\u{62d2}"
        );
    }

    #[test]
    fn select_settings_use_a_text_value_and_require_an_options_command() {
        let select = r#"
[[settings]]
key = "persona_active"
kind = "select"
label = "AI persona"
options_command = "list_personas"
change_command = "persona_selected"
"#;
        let manifest = pending_settings_manifest("select", select, "\"settings.own\"").unwrap();
        let setting = &manifest.settings[0];
        assert!(matches!(
            setting.request_value(None),
            super::SettingsValue::Text(value) if value.is_empty()
        ));
        assert_eq!(
            setting.receive_value(&serde_json::json!("editor")).unwrap(),
            toml::Value::String("editor".into())
        );
        assert!(setting.receive_value(&serde_json::json!(true)).is_err());

        let missing = select.replace("options_command = \"list_personas\"\n", "");
        let error =
            pending_settings_manifest("select-missing", &missing, "\"settings.own\"").unwrap_err();
        assert!(error.contains("requires `options_command`"), "{error}");
    }
}
