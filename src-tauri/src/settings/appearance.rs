use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolbarMode {
    Always,

    Hover,

    #[default]
    Never,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CtrlWheelTarget {
    #[default]
    FontSize,

    Zoom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StatusMetric {
    #[default]
    Words,

    Characters,

    Lines,

    Minutes,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FocusDim {
    #[default]
    Standard,

    Strong,

    Stronger,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MenuBarRenderer {
    #[default]
    Nota,

    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SettingsWindowStyle {
    Full,

    #[default]
    Embedded,

    External,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Appearance {
    pub custom_font_size: bool,

    pub zoom: u32,

    pub ctrl_wheel_zoom: bool,

    pub ctrl_wheel_target: CtrlWheelTarget,

    pub show_status_bar: bool,

    pub status_metric: StatusMetric,

    pub show_menu_bar: bool,

    pub menu_renderer: MenuBarRenderer,

    pub force_nota_menu_when_expanded: bool,

    pub reading_speed: u32,

    pub toolbar: ToolbarMode,

    pub dark_theme_separate: bool,

    pub dark_document_theme: String,

    pub accent: String,

    pub sidebar_width: u32,

    pub dock_width: u32,

    pub focus_mode_dim: FocusDim,

    pub show_filename_in_titlebar: bool,

    pub focus_after_window_transfer: bool,

    pub settings_window_style: SettingsWindowStyle,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            custom_font_size: false,
            zoom: 100,
            ctrl_wheel_zoom: false,
            ctrl_wheel_target: CtrlWheelTarget::FontSize,
            show_status_bar: true,

            status_metric: StatusMetric::Words,

            show_menu_bar: true,
            menu_renderer: MenuBarRenderer::Nota,
            force_nota_menu_when_expanded: true,
            reading_speed: 382,

            toolbar: ToolbarMode::Never,
            dark_theme_separate: false,
            dark_document_theme: String::new(),

            accent: crate::distribution_profile::DEFAULT_ACCENT
                .unwrap_or_default()
                .to_owned(),

            sidebar_width: 240,

            dock_width: 260,

            focus_mode_dim: FocusDim::Standard,

            show_filename_in_titlebar: true,
            focus_after_window_transfer: true,
            settings_window_style: SettingsWindowStyle::Embedded,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_method_default_one_percent_two_not_is_zero() {
        assert_eq!(Appearance::default().zoom, 100);
    }

    #[test]
    fn extract_single_panel_sample_is_default_nota_and_can_cut_replace_system_same() {
        assert_eq!(
            Appearance::default().menu_renderer,
            MenuBarRenderer::Nota,
            "\u{9ed8}\u{8ba4}\u{5fc5}\u{987b}\u{4fdd}\u{6301}\u{8de8}\u{5e73}\u{53f0}\u{4e00}\u{81f4}\u{7684} Nota \u{81ea}\u{7ed8}\u{83dc}\u{5355}"
        );
        let old: Appearance = toml::from_str("").expect("\u{65e7}\u{8bbe}\u{7f6e}\u{6587}\u{4ef6}\u{6ca1}\u{6709}\u{8fd9}\u{4e00}\u{683c}\u{4e5f}\u{8981}\u{80fd}\u{8bfb}");
        assert_eq!(
            old.menu_renderer,
            MenuBarRenderer::Nota,
            "\u{65e7}\u{8bbe}\u{7f6e}\u{6587}\u{4ef6}\u{7f3a} menu_renderer \u{65f6}\u{5fc5}\u{987b}\u{8865}\u{6210} Nota"
        );
        for (renderer, word) in [
            (MenuBarRenderer::Nota, "nota"),
            (MenuBarRenderer::System, "system"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                menu_renderer: renderer,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(text.contains(&format!("menu_renderer = \"{word}\"")));
            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.menu_renderer, renderer);
        }
    }

    #[test]
    fn expanded_window_menu_fallback_defaults_on() {
        assert!(Appearance::default().force_nota_menu_when_expanded);
        let old: Appearance = toml::from_str("").expect("old settings must still load");
        assert!(
            old.force_nota_menu_when_expanded,
            "old settings should enable the full-screen and maximized fallback"
        );
        let text = toml::to_string_pretty(&Appearance {
            force_nota_menu_when_expanded: false,
            ..Appearance::default()
        })
        .expect("appearance settings should serialize");
        let back: Appearance = toml::from_str(&text).expect("appearance settings should load");
        assert!(!back.force_nota_menu_when_expanded);
    }

    #[test]
    fn settings_window_style_defaults_to_embedded_and_roundtrips() {
        assert_eq!(
            Appearance::default().settings_window_style,
            SettingsWindowStyle::Embedded
        );
        let old: Appearance = toml::from_str("").expect("old settings must still load");
        assert_eq!(old.settings_window_style, SettingsWindowStyle::Embedded);
        for (style, word) in [
            (SettingsWindowStyle::Full, "full"),
            (SettingsWindowStyle::Embedded, "embedded"),
            (SettingsWindowStyle::External, "external"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                settings_window_style: style,
                ..Appearance::default()
            })
            .expect("settings should serialize");
            assert!(text.contains(&format!("settings_window_style = \"{word}\"")));
            let back: Appearance = toml::from_str(&text).expect("settings should load");
            assert_eq!(back.settings_window_style, style);
        }
    }

    #[test]
    fn character_number_only_has_one_part_two_not_two_only_is_compute_not_compute_data() {
        let a = Appearance::default();
        assert!(!a.custom_font_size, "\u{9ed8}\u{8ba4}\u{8be5}\u{662f}\u{300c}\u{81ea}\u{52a8}\u{300d}\u{ff0c}\u{4e0d}\u{662f}\u{300c}\u{81ea}\u{5b9a}\u{4e49}\u{300d}");

        let s = crate::settings::Settings::default();
        assert_eq!(s.ui_font_size, 15);
    }

    #[test]
    fn ctrl_gun_argument_default_change_character_number_two_not_is_lock_method() {
        assert_eq!(
            Appearance::default().ctrl_wheel_target,
            CtrlWheelTarget::FontSize
        );
    }

    #[test]
    fn ctrl_gun_argument_two_when_at_settings_file_inner_is_two_word() {
        for (target, word) in [
            (CtrlWheelTarget::FontSize, "font_size"),
            (CtrlWheelTarget::Zoom, "zoom"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                ctrl_wheel_target: target,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(
                text.contains(&format!("ctrl_wheel_target = \"{word}\"")),
                "`{target:?}` \u{8be5}\u{843d}\u{6210} `{word}`\u{ff0c}\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
            );
            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.ctrl_wheel_target, target);
        }
    }

    #[test]
    fn old_settings_file_inner_each_has_gun_argument_target_that_one_page_can_read() {
        let old_table = "ctrl_wheel_zoom = true\nzoom = 150\n";
        let a: Appearance = toml::from_str(old_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(a.ctrl_wheel_target, CtrlWheelTarget::FontSize);
        assert!(a.ctrl_wheel_zoom, "\u{8001}\u{6587}\u{4ef6}\u{91cc}\u{90a3}\u{4e2a}\u{5f00}\u{5173}\u{5fc5}\u{987b}\u{7167}\u{65e7}\u{8ba4}");
        assert_eq!(a.zoom, 150, "`zoom` \u{672c}\u{8eab}\u{4e0d}\u{53d7}\u{5f71}\u{54cd}\u{ff0c}\u{53ea}\u{662f}\u{6eda}\u{8f6e}\u{4e0d}\u{518d}\u{53bb}\u{62e8}\u{5b83}");
    }

    #[test]
    fn work_sentence_panel_default_not_thread_is_is_estimate_one() {
        assert_eq!(Appearance::default().toolbar, ToolbarMode::Never);
    }

    #[test]
    fn work_sentence_panel_three_when_at_settings_file_inner_is_three_word() {
        for (mode, word) in [
            (ToolbarMode::Always, "always"),
            (ToolbarMode::Hover, "hover"),
            (ToolbarMode::Never, "never"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                toolbar: mode,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(
                text.contains(&format!("toolbar = \"{word}\"")),
                "`{mode:?}` \u{8be5}\u{843d}\u{6210} `{word}`\u{ff0c}\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
            );

            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.toolbar, mode);
        }
    }

    #[test]
    fn old_settings_file_inner_that_not_two_passive_call_ignore_two_not_is_package_error() {
        let old_table = "show_toolbar = true\n";
        let a: Appearance = toml::from_str(old_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(a.toolbar, ToolbarMode::Never);

        assert_eq!(a.zoom, 100);
    }

    #[test]
    fn status_panel_same_record_two_default_is_word_data_old_table_inner_each_has_one_page_read_enter_incoming(
    ) {
        let old_table = "zoom = 120\nshow_status_bar = true\n";
        let a: Appearance = toml::from_str(old_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(a.status_metric, StatusMetric::Words);
        assert_eq!(a.zoom, 120, "\u{540c}\u{4e00}\u{5f20}\u{8868}\u{91cc}\u{522b}\u{7684}\u{9879}\u{4e0d}\u{80fd}\u{53d7}\u{5f71}\u{54cd}");

        for (text_value, expected_2) in [
            ("words", StatusMetric::Words),
            ("characters", StatusMetric::Characters),
            ("lines", StatusMetric::Lines),
            ("minutes", StatusMetric::Minutes),
        ] {
            let table_2 = format!("status_metric = {text_value:?}\n");
            let b: Appearance = toml::from_str(&table_2)
                .unwrap_or_else(|e| panic!("`{text_value}` \u{8be5}\u{80fd}\u{8bfb}\u{ff1a}{e}"));
            assert_eq!(
                b.status_metric, expected_2,
                "`{text_value}` \u{8ba4}\u{9519}\u{4e86}\u{9879}"
            );
        }
    }

    #[test]
    fn status_panel_same_record_two_store_lower_get_at_read_return_incoming_not_edit() {
        for value_2 in [
            StatusMetric::Words,
            StatusMetric::Characters,
            StatusMetric::Lines,
            StatusMetric::Minutes,
        ] {
            let text = toml::to_string_pretty(&Appearance {
                status_metric: value_2,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.status_metric, value_2);
        }
    }

    #[test]
    fn theme_color_default_root_follow_style() {
        assert_eq!(Appearance::default().accent, "");
    }

    #[test]
    fn theme_color_source_sample_store_get_not_change_write() {
        for value_2 in ["#3584e4", "#3584E4", "3584e4", ""] {
            let text = toml::to_string_pretty(&Appearance {
                accent: value_2.to_string(),
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(
                back.accent, value_2,
                "`{value_2}` \u{8be5}\u{539f}\u{6837}\u{56de}\u{6765}"
            );
        }
    }

    #[test]
    fn theme_color_write_one_person_not_out_incoming_value_page_not_required_handle_settings_read_four(
    ) {
        for broken in ["red", "#12345", "rgb(1,2,3)", "\u{1f7e5}", "   "] {
            let table_2 = format!("accent = {broken:?}\n");
            let a: Appearance = toml::from_str(&table_2)
                .unwrap_or_else(|e| panic!("`{broken}` \u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}\u{ff0c}\u{5b9e}\u{9645}\u{62a5}\u{9519}\u{ff1a}{e}"));
            assert_eq!(a.accent, broken, "\u{540e}\u{7aef}\u{8be5}\u{539f}\u{6837}\u{7559}\u{7740}\u{ff0c}\u{4ea4}\u{7ed9}\u{524d}\u{7aef}\u{5224}");

            assert_eq!(a.zoom, 100);
            assert_eq!(a.toolbar, ToolbarMode::Never);
        }
    }

    #[test]
    fn old_settings_file_inner_each_has_theme_color_that_one_page_can_read() {
        let old_table = "zoom = 120\ntoolbar = \"always\"\n";
        let a: Appearance = toml::from_str(old_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(a.accent, "", "\u{7f3a}\u{952e}\u{8be5}\u{8865}\u{6210}\u{300c}\u{8ddf}\u{968f}\u{98ce}\u{683c}\u{300d}");
        assert_eq!(a.zoom, 120, "\u{540c}\u{4e00}\u{5f20}\u{8868}\u{91cc}\u{522b}\u{7684}\u{9879}\u{4e0d}\u{80fd}\u{53d7}\u{5f71}\u{54cd}");
        assert_eq!(a.toolbar, ToolbarMode::Always);
    }

    #[test]
    fn extract_single_panel_default_thread_is_two_work_sentence_panel_default_not_thread_is_is_two_item_not_same_get_set(
    ) {
        let a = Appearance::default();
        assert!(
            a.show_menu_bar,
            "\u{83dc}\u{5355}\u{680f}\u{9ed8}\u{8ba4}\u{8be5}\u{663e}\u{793a}"
        );
        assert!(
            a.show_status_bar,
            "\u{72b6}\u{6001}\u{680f}\u{9ed8}\u{8ba4}\u{4e5f}\u{662f}\u{663e}\u{793a}"
        );
        assert_eq!(a.toolbar, ToolbarMode::Never, "\u{5de5}\u{5177}\u{680f}\u{9ed8}\u{8ba4}\u{4ecd}\u{7136}\u{662f}\u{4e0d}\u{663e}\u{793a}");
    }

    #[test]
    fn extract_single_panel_enabled_source_sample_store_get() {
        for value_2 in [true, false] {
            let text = toml::to_string_pretty(&Appearance {
                show_menu_bar: value_2,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(
                text.contains(&format!("show_menu_bar = {value_2}")),
                "\u{8be5}\u{843d}\u{6210} `show_menu_bar = {value_2}`\u{ff0c}\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
            );
            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.show_menu_bar, value_2);
        }
    }

    #[test]
    fn old_settings_file_inner_each_has_extract_single_panel_that_one_old_is_thread_is() {
        let old_table = "zoom = 120\n";
        let a: Appearance = toml::from_str(old_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert!(a.show_menu_bar, "\u{7f3a}\u{952e}\u{8be5}\u{8865}\u{6210}\u{300c}\u{663e}\u{793a}\u{300d}\u{ff0c}\u{4e0d}\u{80fd}\u{662f}\u{300c}\u{9690}\u{85cf}\u{300d}");
        assert_eq!(a.zoom, 120, "\u{540c}\u{4e00}\u{5f20}\u{8868}\u{91cc}\u{522b}\u{7684}\u{9879}\u{4e0d}\u{80fd}\u{53d7}\u{5f71}\u{54cd}");
    }

    #[test]
    fn convert_main_press_by_default_table_ready_two_not_is_more_qiang() {
        assert_eq!(Appearance::default().focus_mode_dim, FocusDim::Standard);
    }

    #[test]
    fn convert_main_press_by_three_when_at_settings_file_inner_is_three_word() {
        for (when, word) in [
            (FocusDim::Standard, "standard"),
            (FocusDim::Strong, "strong"),
            (FocusDim::Stronger, "stronger"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                focus_mode_dim: when,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(
                text.contains(&format!("focus_mode_dim = \"{word}\"")),
                "`{when:?}` \u{8be5}\u{843d}\u{6210} `{word}`\u{ff0c}\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
            );
            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.focus_mode_dim, when);
        }
    }

    #[test]
    fn old_settings_file_inner_each_has_convert_main_press_by_that_one_page_can_read() {
        let old_table = "zoom = 120\nfocus_mode_dim = \"strong\"\n";
        let a: Appearance = toml::from_str("zoom = 120\n")
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(
            a.focus_mode_dim,
            FocusDim::Standard,
            "\u{7f3a}\u{952e}\u{8865}\u{6807}\u{51c6}\u{90a3}\u{4e00}\u{6863}"
        );
        assert_eq!(a.zoom, 120, "\u{540c}\u{4e00}\u{5f20}\u{8868}\u{91cc}\u{522b}\u{7684}\u{9879}\u{4e0d}\u{80fd}\u{53d7}\u{5f71}\u{54cd}");

        let b: Appearance = toml::from_str(old_table).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
        assert_eq!(b.focus_mode_dim, FocusDim::Strong);
    }

    #[test]
    fn table_question_panel_filename_default_pending_two_one_close_drop() {
        assert!(Appearance::default().show_filename_in_titlebar);
        for (value_2, word) in [(true, "true"), (false, "false")] {
            let text = toml::to_string_pretty(&Appearance {
                show_filename_in_titlebar: value_2,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(
                text.contains(&format!("show_filename_in_titlebar = {word}")),
                "\u{8be5}\u{843d}\u{6210} `show_filename_in_titlebar = {word}`\u{ff0c}\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
            );
            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.show_filename_in_titlebar, value_2);
        }
    }

    #[test]
    fn focus_after_window_transfer_defaults_on_and_old_settings_still_load() {
        assert!(Appearance::default().focus_after_window_transfer);
        let old: Appearance = toml::from_str("").expect("old settings must still load");
        assert!(old.focus_after_window_transfer);
        let text = toml::to_string_pretty(&Appearance {
            focus_after_window_transfer: false,
            ..Appearance::default()
        })
        .expect("appearance settings should serialize");
        let back: Appearance = toml::from_str(&text).expect("appearance settings should load");
        assert!(!back.focus_after_window_transfer);
    }
}
