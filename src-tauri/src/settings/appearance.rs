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

            accent: String::new(),

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
    fn suo_fang_default_yi_bai_er_bu_shi_ling() {
        assert_eq!(Appearance::default().zoom, 100);
    }

    #[test]
    fn cai_dan_lan_yang_shi_default_nota_bing_ke_qie_huan_xi_tong() {
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
        for (renderer, ci) in [
            (MenuBarRenderer::Nota, "nota"),
            (MenuBarRenderer::System, "system"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                menu_renderer: renderer,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(text.contains(&format!("menu_renderer = \"{ci}\"")));
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
    fn zi_hao_zhi_you_yi_fen_er_zhe_ge_bu_er_zhi_shi_suan_bu_suan_shu() {
        let a = Appearance::default();
        assert!(!a.custom_font_size, "\u{9ed8}\u{8ba4}\u{8be5}\u{662f}\u{300c}\u{81ea}\u{52a8}\u{300d}\u{ff0c}\u{4e0d}\u{662f}\u{300c}\u{81ea}\u{5b9a}\u{4e49}\u{300d}");

        let s = crate::settings::Settings::default();
        assert_eq!(s.ui_font_size, 15);
    }

    #[test]
    fn ctrl_gun_lun_default_gai_zi_hao_er_bu_shi_suo_fang() {
        assert_eq!(
            Appearance::default().ctrl_wheel_target,
            CtrlWheelTarget::FontSize
        );
    }

    #[test]
    fn ctrl_gun_lun_liang_dang_zai_settings_file_li_shi_zhe_liang_ge_ci() {
        for (target, ci) in [
            (CtrlWheelTarget::FontSize, "font_size"),
            (CtrlWheelTarget::Zoom, "zoom"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                ctrl_wheel_target: target,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(
                text.contains(&format!("ctrl_wheel_target = \"{ci}\"")),
                "`{target:?}` \u{8be5}\u{843d}\u{6210} `{ci}`\u{ff0c}\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
            );
            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.ctrl_wheel_target, target);
        }
    }

    #[test]
    fn lao_settings_file_li_mei_you_gun_lun_target_na_yi_ge_ye_neng_read() {
        let lao_table = "ctrl_wheel_zoom = true\nzoom = 150\n";
        let a: Appearance = toml::from_str(lao_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(a.ctrl_wheel_target, CtrlWheelTarget::FontSize);
        assert!(a.ctrl_wheel_zoom, "\u{8001}\u{6587}\u{4ef6}\u{91cc}\u{90a3}\u{4e2a}\u{5f00}\u{5173}\u{5fc5}\u{987b}\u{7167}\u{65e7}\u{8ba4}");
        assert_eq!(a.zoom, 150, "`zoom` \u{672c}\u{8eab}\u{4e0d}\u{53d7}\u{5f71}\u{54cd}\u{ff0c}\u{53ea}\u{662f}\u{6eda}\u{8f6e}\u{4e0d}\u{518d}\u{53bb}\u{62e8}\u{5b83}");
    }

    #[test]
    fn gong_ju_lan_default_bu_xian_shi_shi_gu_yi_de() {
        assert_eq!(Appearance::default().toolbar, ToolbarMode::Never);
    }

    #[test]
    fn gong_ju_lan_san_dang_zai_settings_file_li_shi_zhe_san_ge_ci() {
        for (mode, ci) in [
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
                text.contains(&format!("toolbar = \"{ci}\"")),
                "`{mode:?}` \u{8be5}\u{843d}\u{6210} `{ci}`\u{ff0c}\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
            );

            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.toolbar, mode);
        }
    }

    #[test]
    fn lao_settings_file_li_de_na_ge_bu_er_bei_hu_lve_er_bu_shi_bao_cuo() {
        let lao_table = "show_toolbar = true\n";
        let a: Appearance = toml::from_str(lao_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(a.toolbar, ToolbarMode::Never);

        assert_eq!(a.zoom, 100);
    }

    #[test]
    fn status_lan_tong_ji_liang_default_shi_ci_shu_lao_table_li_mei_you_zhe_yi_ge_ye_read_de_jin_lai(
    ) {
        let lao_table = "zoom = 120\nshow_status_bar = true\n";
        let a: Appearance = toml::from_str(lao_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(a.status_metric, StatusMetric::Words);
        assert_eq!(a.zoom, 120, "\u{540c}\u{4e00}\u{5f20}\u{8868}\u{91cc}\u{522b}\u{7684}\u{9879}\u{4e0d}\u{80fd}\u{53d7}\u{5f71}\u{54cd}");

        for (wen_zi, expected_2) in [
            ("words", StatusMetric::Words),
            ("characters", StatusMetric::Characters),
            ("lines", StatusMetric::Lines),
            ("minutes", StatusMetric::Minutes),
        ] {
            let table_2 = format!("status_metric = {wen_zi:?}\n");
            let b: Appearance = toml::from_str(&table_2)
                .unwrap_or_else(|e| panic!("`{wen_zi}` \u{8be5}\u{80fd}\u{8bfb}\u{ff1a}{e}"));
            assert_eq!(
                b.status_metric, expected_2,
                "`{wen_zi}` \u{8ba4}\u{9519}\u{4e86}\u{9879}"
            );
        }
    }

    #[test]
    fn status_lan_tong_ji_liang_cun_xia_qu_zai_read_hui_lai_bu_bian() {
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
    fn theme_se_default_gen_sui_feng_ge() {
        assert_eq!(Appearance::default().accent, "");
    }

    #[test]
    fn theme_se_yuan_yang_cun_qu_bu_gai_write() {
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
    fn theme_se_write_zhe_yi_ge_ren_bu_chu_lai_de_value_ye_bu_xu_ba_settings_read_si() {
        for huai in ["red", "#12345", "rgb(1,2,3)", "\u{1f7e5}", "   "] {
            let table_2 = format!("accent = {huai:?}\n");
            let a: Appearance = toml::from_str(&table_2)
                .unwrap_or_else(|e| panic!("`{huai}` \u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}\u{ff0c}\u{5b9e}\u{9645}\u{62a5}\u{9519}\u{ff1a}{e}"));
            assert_eq!(a.accent, huai, "\u{540e}\u{7aef}\u{8be5}\u{539f}\u{6837}\u{7559}\u{7740}\u{ff0c}\u{4ea4}\u{7ed9}\u{524d}\u{7aef}\u{5224}");

            assert_eq!(a.zoom, 100);
            assert_eq!(a.toolbar, ToolbarMode::Never);
        }
    }

    #[test]
    fn lao_settings_file_li_mei_you_theme_se_na_yi_ge_ye_neng_read() {
        let lao_table = "zoom = 120\ntoolbar = \"always\"\n";
        let a: Appearance = toml::from_str(lao_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(a.accent, "", "\u{7f3a}\u{952e}\u{8be5}\u{8865}\u{6210}\u{300c}\u{8ddf}\u{968f}\u{98ce}\u{683c}\u{300d}");
        assert_eq!(a.zoom, 120, "\u{540c}\u{4e00}\u{5f20}\u{8868}\u{91cc}\u{522b}\u{7684}\u{9879}\u{4e0d}\u{80fd}\u{53d7}\u{5f71}\u{54cd}");
        assert_eq!(a.toolbar, ToolbarMode::Always);
    }

    #[test]
    fn cai_dan_lan_default_xian_shi_er_gong_ju_lan_default_bu_xian_shi_shi_liang_tiao_bu_tong_de_qu_she(
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
    fn cai_dan_lan_enabled_yuan_yang_cun_qu() {
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
    fn lao_settings_file_li_mei_you_cai_dan_lan_na_yi_ge_jiu_shi_xian_shi() {
        let lao_table = "zoom = 120\n";
        let a: Appearance = toml::from_str(lao_table)
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert!(a.show_menu_bar, "\u{7f3a}\u{952e}\u{8be5}\u{8865}\u{6210}\u{300c}\u{663e}\u{793a}\u{300d}\u{ff0c}\u{4e0d}\u{80fd}\u{662f}\u{300c}\u{9690}\u{85cf}\u{300d}");
        assert_eq!(a.zoom, 120, "\u{540c}\u{4e00}\u{5f20}\u{8868}\u{91cc}\u{522b}\u{7684}\u{9879}\u{4e0d}\u{80fd}\u{53d7}\u{5f71}\u{54cd}");
    }

    #[test]
    fn zhuan_zhu_ya_an_default_biao_zhun_er_bu_shi_geng_qiang() {
        assert_eq!(Appearance::default().focus_mode_dim, FocusDim::Standard);
    }

    #[test]
    fn zhuan_zhu_ya_an_san_dang_zai_settings_file_li_shi_zhe_san_ge_ci() {
        for (dang, ci) in [
            (FocusDim::Standard, "standard"),
            (FocusDim::Strong, "strong"),
            (FocusDim::Stronger, "stronger"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                focus_mode_dim: dang,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(
                text.contains(&format!("focus_mode_dim = \"{ci}\"")),
                "`{dang:?}` \u{8be5}\u{843d}\u{6210} `{ci}`\u{ff0c}\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
            );
            let back: Appearance = toml::from_str(&text).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
            assert_eq!(back.focus_mode_dim, dang);
        }
    }

    #[test]
    fn lao_settings_file_li_mei_you_zhuan_zhu_ya_an_na_yi_ge_ye_neng_read() {
        let lao_table = "zoom = 120\nfocus_mode_dim = \"strong\"\n";
        let a: Appearance = toml::from_str("zoom = 120\n")
            .expect("\u{8001}\u{8868}\u{5fc5}\u{987b}\u{4ecd}\u{7136}\u{80fd}\u{89e3}\u{6790}");
        assert_eq!(
            a.focus_mode_dim,
            FocusDim::Standard,
            "\u{7f3a}\u{952e}\u{8865}\u{6807}\u{51c6}\u{90a3}\u{4e00}\u{6863}"
        );
        assert_eq!(a.zoom, 120, "\u{540c}\u{4e00}\u{5f20}\u{8868}\u{91cc}\u{522b}\u{7684}\u{9879}\u{4e0d}\u{80fd}\u{53d7}\u{5f71}\u{54cd}");

        let b: Appearance = toml::from_str(lao_table).expect("\u{8bfb}\u{5f97}\u{56de}\u{6765}");
        assert_eq!(b.focus_mode_dim, FocusDim::Strong);
    }

    #[test]
    fn biao_ti_lan_filename_default_dai_er_zhe_yi_ge_guan_de_diao() {
        assert!(Appearance::default().show_filename_in_titlebar);
        for (value_2, ci) in [(true, "true"), (false, "false")] {
            let text = toml::to_string_pretty(&Appearance {
                show_filename_in_titlebar: value_2,
                ..Appearance::default()
            })
            .expect("\u{5e8f}\u{5217}\u{5316}\u{8be5}\u{6210}\u{529f}");
            assert!(
                text.contains(&format!("show_filename_in_titlebar = {ci}")),
                "\u{8be5}\u{843d}\u{6210} `show_filename_in_titlebar = {ci}`\u{ff0c}\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text}"
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
