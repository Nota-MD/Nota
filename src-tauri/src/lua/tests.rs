use super::*;

#[test]
fn sha_xiang_li_bu_gai_you_de_quan_ju_yi_ge_dou_bu_neng_you() {
    let lua = ying_hua_de_lua().expect("\u{6c99}\u{7bb1}\u{8be5}\u{5efa}\u{5f97}\u{8d77}\u{6765}");

    for name in BI_XU_WEI_KONG_DE_QUAN_JU {
        let v: mlua::Value = lua.globals().get(name).unwrap();
        assert!(
            v.is_nil(),
            "`{name}` \u{4e0d}\u{8be5}\u{5728}\u{62d3}\u{5c55}\u{7684} Lua \u{91cc}\u{5b58}\u{5728}\u{3002}\u{5b83}\u{4e00}\u{65e6}\u{5b58}\u{5728}\u{ff0c}\u{80fd}\u{529b}\u{56f4}\u{680f}\u{5c31}\u{80fd}\u{88ab}\u{7ed5}\u{8fc7}\u{53bb}\u{2014}\u{2014}\
             \u{4e00}\u{4e2a}\u{53ea}\u{7533}\u{8bf7} `ui.notify` \u{7684}\u{62d3}\u{5c55}\u{53ef}\u{4ee5} `os.execute(\"rm -rf ~\")` \
             \u{6216} `io.open(\"/etc/shadow\")`\u{ff08}BUG-10\u{ff09}"
        );
    }
}

#[test]
fn mlua_de_default_safe_han_io_he_os() {
    let lua = Lua::new();
    for name in ["io", "os", "package", "require"] {
        let v: mlua::Value = lua.globals().get(name).unwrap();
        assert!(
            !v.is_nil(),
            "`Lua::new()` \u{91cc} `{name}` \u{7adf}\u{7136}\u{4e0d}\u{5b58}\u{5728}\u{4e86}\u{2014}\u{2014}mlua \u{7684}\u{9ed8}\u{8ba4}\u{503c}\u{53d8}\u{4e86}\u{ff01}\
             \u{672c}\u{6587}\u{4ef6}\u{9876}\u{4e0a}\u{300c}\u{7b2c}\u{4e00}\u{9053}\u{95f8}\u{66fe}\u{7ecf}\u{662f}\u{5047}\u{7684}\u{300d}\u{90a3}\u{4e00}\u{6bb5}\u{7684}\u{524d}\u{63d0}\u{6ca1}\u{4e86}\u{ff0c}\
             \u{8bf7}\u{91cd}\u{65b0}\u{5224}\u{4e00}\u{6b21} `\u{786c}\u{5316}\u{7684}_lua()` \u{8be5}\u{600e}\u{4e48}\u{5199}\u{ff0c}\u{518d}\u{6539}\u{8fd9}\u{6761}\u{65ad}\u{8a00}"
        );
    }

    let dbg: mlua::Value = lua.globals().get("debug").unwrap();
    assert!(
        dbg.is_nil(),
        "`debug` \u{4e0d}\u{8be5}\u{5728} `Lua::new()` \u{91cc}"
    );
}

#[test]
fn nei_zhi_plugin_dou_neng_bei_lua_bian_yi() {
    let lua = ying_hua_de_lua().expect("\u{6c99}\u{7bb1}\u{8be5}\u{5efa}\u{5f97}\u{8d77}\u{6765}");
    let mut bian_yi_guo_ji_ge = 0;

    for dir in crate::paths::builtin_plugins_dirs(None) {
        let Ok(tiao_mu_men) = std::fs::read_dir(&dir) else {
            continue;
        };
        for tiao_mu in tiao_mu_men.flatten() {
            let manifest_path_2 = tiao_mu.path().join("plugin.toml");
            if !manifest_path_2.is_file() {
                continue;
            }

            let m = crate::plugin::manifest::Manifest::load(&manifest_path_2).unwrap_or_else(|e| {
                panic!(
                    "`{}` \u{8bfb}\u{4e0d}\u{51fa}\u{6765}\u{ff1a}{e}",
                    manifest_path_2.display()
                )
            });

            let zhe_yi_fen_de = gai_plugin_xia_suo_you_lua(&m.dir);
            assert!(
                !zhe_yi_fen_de.is_empty(),
                "`{}` \u{91cc}\u{4e00}\u{4efd} `.lua` \u{90fd}\u{6ca1}\u{626b}\u{5230}\u{2014}\u{2014}\u{5165}\u{53e3} `{}` \u{5462}\u{ff1f}",
                m.dir.display(),
                m.meta.entry
            );

            for jiao_ben in zhe_yi_fen_de {
                let code = std::fs::read_to_string(&jiao_ben).unwrap_or_else(|e| {
                    panic!(
                        "`{}` \u{8bfb}\u{4e0d}\u{51fa}\u{6765}\u{ff1a}{e}",
                        jiao_ben.display()
                    )
                });

                lua.load(&code)
                    .set_name(jiao_ben.to_string_lossy().as_ref())
                    .into_function()
                    .unwrap_or_else(|e| {
                        panic!(
                            "`{}` \u{7f16}\u{8bd1}\u{4e0d}\u{8fc7}\u{ff1a}{e}",
                            jiao_ben.display()
                        )
                    });

                bian_yi_guo_ji_ge += 1;
            }
        }
    }

    assert!(
        bian_yi_guo_ji_ge >= 2,
        "\u{4e00}\u{4e2a}\u{5185}\u{7f6e}\u{62d3}\u{5c55}\u{90fd}\u{6ca1}\u{626b}\u{5230}\u{ff08}\u{626b}\u{5230} {bian_yi_guo_ji_ge} \u{4e2a}\u{ff09}\u{2014}\u{2014}`plugins/` \u{662f}\u{632a}\u{8d70}\u{4e86}\u{ff0c}\
         \u{8fd8}\u{662f} `builtin_plugins_dirs` \u{6539}\u{4e86}\u{ff1f}\u{6d4b}\u{8bd5}\u{8981}\u{8ddf}\u{7740}\u{6539}\u{ff0c}\u{522b}\u{628a}\u{8fd9}\u{6761}\u{5220}\u{4e86}"
    );
}

fn gai_plugin_xia_suo_you_lua(directory_2: &std::path::Path) -> Vec<std::path::PathBuf> {
    fn zou(directory_2: &std::path::Path, receive_dao: &mut Vec<std::path::PathBuf>) {
        let Ok(tiao_mu_men) = std::fs::read_dir(directory_2) else {
            return;
        };
        for tiao_mu in tiao_mu_men.flatten() {
            let p = tiao_mu.path();
            if p.is_dir() {
                zou(&p, receive_dao);
            } else if p.extension().is_some_and(|e| e == "lua") {
                receive_dao.push(p);
            }
        }
    }
    let mut receive_dao = Vec::new();
    zou(directory_2, &mut receive_dao);
    receive_dao.sort();
    receive_dao
}

fn nei_zhi_plugin_source_ma(id: &str) -> Option<String> {
    for dir in crate::paths::builtin_plugins_dirs(None) {
        let ru_kou = dir.join(id).join("main.lua");
        if let Ok(s) = std::fs::read_to_string(&ru_kou) {
            return Some(s);
        }
    }
    None
}

#[test]
fn slidev_ren_de_document_yao_de_shi_na_ge_theme_bao() {
    let lua = ying_hua_de_lua().expect("\u{6c99}\u{7bb1}\u{8be5}\u{5efa}\u{5f97}\u{8d77}\u{6765}");
    let source_3 = nei_zhi_plugin_source_ma("slidev").expect(
        "\u{5185}\u{7f6e}\u{62d3}\u{5c55}\u{91cc}\u{8be5}\u{6709}\u{4e00}\u{4efd} slidev/main.lua",
    );

    let wei_2 = "return M";
    let jian_diao = source_3.trim_end();
    assert!(
        jian_diao.ends_with(wei_2),
        "`slidev/main.lua` \u{7684}\u{7ed3}\u{5c3e}\u{4e0d}\u{518d}\u{662f} `{wei_2}` \u{4e86}\u{2014}\u{2014}\u{8fd9}\u{6761}\u{6d4b}\u{8bd5}\u{7684}\u{6302}\u{94a9}\u{8981}\u{8ddf}\u{7740}\u{6539}"
    );
    let dai_ma = format!(
        "{}\nreturn {{ theme_from_text = theme_from_text, theme_package = theme_package, \
         describe_probe = describe_probe }}\n",
        &jian_diao[..jian_diao.len() - wei_2.len()]
    );
    let table_2: mlua::Table = lua
        .load(&dai_ma)
        .set_name("slidev/main.lua\u{ff08}\u{6d4b}\u{8bd5}\u{6302}\u{94a9}\u{ff09}")
        .eval()
        .expect("\u{6574}\u{6bb5}\u{8be5}\u{8dd1}\u{5f97}\u{8d77}\u{6765}\u{ff1a}\u{6a21}\u{5757}\u{7ea7}\u{8bed}\u{53e5}\u{4e0d}\u{8bb8}\u{78b0} `nota`");
    let read_2: mlua::Function = table_2
        .get("theme_from_text")
        .expect("\u{8bfb}\u{51fd}\u{6570}");
    let fan: mlua::Function = table_2
        .get("theme_package")
        .expect("\u{7ffb}\u{51fd}\u{6570}");

    let yong_li: [(&str, &str, Option<&str>); 10] = [
        (
            "---\ntheme: seriph\n---\n# \u{4e00}\u{9875}\n",
            "\u{666e}\u{901a}",
            Some("seriph"),
        ),
        ("---\r\ntheme: seriph\r\n---\r\n", "CRLF", Some("seriph")),
        (
            "---\ntheme: \"seriph\"\n---\n",
            "\u{5e26}\u{5f15}\u{53f7}",
            Some("seriph"),
        ),
        (
            "---\ntheme: seriph # \u{5907}\u{9009}\u{ff1a}default\n---\n",
            "\u{884c}\u{5c3e}\u{6ce8}\u{91ca}",
            Some("seriph"),
        ),
        (
            "\u{feff}---\ntheme: seriph\n---\n",
            "\u{5e26} BOM",
            Some("seriph"),
        ),
        (
            "# \u{4e00}\u{9875}\n\n---\n\ntheme: seriph\n",
            "\u{5206}\u{9694}\u{7ebf}\u{4e0d}\u{5728}\u{5f00}\u{5934}",
            None,
        ),
        (
            "---\ntheme: seriph\n",
            "\u{6ca1}\u{6709}\u{6536}\u{5c3e}",
            None,
        ),
        (
            "---\ntitle: \u{4e00}\u{9875}\n---\n",
            "\u{6ca1}\u{5199} theme",
            None,
        ),
        (
            "---\ntheme:\n---\n",
            "\u{503c}\u{662f}\u{7a7a}\u{7684}",
            None,
        ),
        ("", "\u{7a7a}\u{6587}\u{6863}", None),
    ];
    for (body_2, name_2, expected_2) in yong_li {
        let de_dao = read_2.call::<Option<String>>(body_2.to_owned()).unwrap();
        assert_eq!(
            de_dao.as_deref(),
            expected_2,
            "\u{300c}{name_2}\u{300d}\u{90a3}\u{4efd}\u{6b63}\u{6587}\u{8bfb}\u{51fa}\u{6765}\u{7684}\u{4e3b}\u{9898}\u{4e0d}\u{5bf9}\u{ff1a}{de_dao:?}\u{ff08}\u{6b63}\u{6587}\u{ff1a}{body_2:?}\u{ff09}"
        );
    }

    let fan_yong_li: [(&str, Option<&str>); 5] = [
        ("seriph", Some("@slidev/theme-seriph")),
        ("none", None),
        ("./\u{6211}\u{7684}\u{4e3b}\u{9898}", None),
        ("@org/\u{6211}\u{7684}\u{4e3b}\u{9898}", None),
        ("/tmp/\u{4e3b}\u{9898}", None),
    ];
    for (name_2, expected_2) in fan_yong_li {
        let de_dao = fan.call::<Option<String>>(name_2.to_owned()).unwrap();
        assert_eq!(
            de_dao.as_deref(),
            expected_2,
            "`theme: {name_2}` \u{8be5}\u{95ee}\u{7684}\u{5305}\u{4e0d}\u{5bf9}"
        );
    }

    let default_2 = fan.call::<Option<String>>(mlua::Value::Nil).unwrap();
    assert_eq!(
        default_2.as_deref(),
        Some("@slidev/theme-default"),
        "\u{6ca1}\u{5199}\u{4e3b}\u{9898}\u{65f6}\u{8be5}\u{95ee}\u{9ed8}\u{8ba4}\u{5305}"
    );

    assert!(
        source_3.contains(r#"{ need = "node_modules/" .. pkg, pkg = pkg, theme_name = theme_name }"#),
        "`required_theme` \u{62fc} `need` \u{7684}\u{90a3}\u{4e00}\u{884c}\u{53d8}\u{4e86}\u{2014}\u{2014}\u{5bbf}\u{4e3b}\u{6536}\u{7684}\u{662f}\u{76f8}\u{5bf9}\u{8def}\u{5f84}\u{ff0c}\u{6539}\u{6cd5}\u{8981}\u{770b} \
         `devserver/probe.rs`\u{ff1b}`theme_name` \u{662f}\u{4e0b}\u{9762}\u{7b2c} \u{56db} \u{6bb5}\u{90a3}\u{4e24}\u{652f}\u{7684}\u{5224}\u{636e}\u{ff0c}\u{4e00}\u{8d77}\u{5e26}\u{51fa}\u{53bb}"
    );

    let shuo: mlua::Function = table_2
        .get("describe_probe")
        .expect("\u{7ffb}\u{8bd1}\u{51fd}\u{6570}");

    let tan_bao = |state: &str, root: Option<&str>, marker: bool, need: Option<bool>| {
        let t = lua.create_table()?;
        t.set("state", state)?;
        t.set("version", "53.0.0")?;
        t.set("command", "npx @slidev/cli")?;
        t.set("detail", "")?;
        t.set("marker_found", marker)?;
        if let Some(r) = root {
            t.set("root", r)?;
        }
        if let Some(n) = need {
            t.set("need_found", n)?;
        }
        Ok::<mlua::Table, mlua::Error>(t)
    };

    let yao_de = |theme_name: Option<&str>, pkg: &str| {
        let t = lua.create_table()?;
        t.set("need", format!("node_modules/{pkg}"))?;
        t.set("pkg", pkg)?;
        if let Some(n) = theme_name {
            t.set("theme_name", n)?;
        }
        Ok::<mlua::Table, mlua::Error>(t)
    };
    let fan = |p: mlua::Table, w: mlua::Table| -> mlua::Table {
        shuo.call((p, w))
            .expect("`describe_probe` \u{4e0d}\u{8be5}\u{629b}\u{9519}")
    };

    let d = fan(
        tan_bao("ready", Some("/tmp/\u{7532}"), true, Some(false)).unwrap(),
        yao_de(None, "@slidev/theme-default").unwrap(),
    );
    assert_eq!(
        d.get::<String>("state").unwrap(),
        "notheme",
        "\u{7f3a}\u{90a3}\u{4e2a}\u{5305}\u{8be5}\u{62a5} notheme"
    );
    let mei_write_de_hua: String = d.get("message").unwrap();
    let mei_write_de_xi: String = d.get("detail").unwrap();

    assert!(mei_write_de_hua.contains("names no theme"), "\u{6ca1}\u{5199} `theme:` \u{7684}\u{6587}\u{6863}\u{8be5}\u{8bf4}\u{300c}\u{6ca1}\u{5199}\u{4e3b}\u{9898}\u{300d}\u{ff1a}{mei_write_de_hua}");
    assert!(mei_write_de_xi.contains("theme: none"), "\u{8be5}\u{7ed9}\u{300c}\u{52a0}\u{4e09}\u{884c} frontmatter\u{300d}\u{8fd9}\u{6761}\u{7167}\u{7740}\u{505a}\u{5f97}\u{5230}\u{7684}\u{8def}\u{ff1a}{mei_write_de_xi}");
    assert!(
        mei_write_de_xi.contains("npm i"),
        "\u{88c5}\u{5305}\u{90a3}\u{6761}\u{8def}\u{4e5f}\u{5f97}\u{5728}\u{ff1a}{mei_write_de_xi}"
    );

    let d = fan(
        tan_bao("ready", Some("/tmp/\u{7532}"), true, Some(false)).unwrap(),
        yao_de(Some("seriph"), "@slidev/theme-seriph").unwrap(),
    );
    assert_eq!(d.get::<String>("state").unwrap(), "notheme");
    let write_le_de_hua: String = d.get("message").unwrap();
    let write_le_xi: String = d.get("detail").unwrap();
    assert!(!write_le_de_hua.contains("names no theme"), "\u{5199}\u{4e86} `theme:` \u{7684}\u{6587}\u{6863}\u{4e0d}\u{8bb8}\u{8bf4}\u{300c}\u{6ca1}\u{5199}\u{4e3b}\u{9898}\u{300d}\u{ff1a}{write_le_de_hua}");

    assert!(write_le_xi.contains("slidev-theme-"), "\u{5199}\u{4e86}\u{4e3b}\u{9898}\u{7684}\u{90a3}\u{652f}\u{8be5}\u{8bb2}\u{89e3}\u{6790}\u{987a}\u{5e8f}\u{ff1a}{write_le_xi}");
    assert!(!mei_write_de_xi.contains("slidev-theme-"), "\u{6ca1}\u{5199}\u{4e3b}\u{9898}\u{7684}\u{90a3}\u{652f}\u{8bb2}\u{89e3}\u{6790}\u{987a}\u{5e8f}\u{662f}\u{5e9f}\u{8bdd}\u{ff1a}{mei_write_de_xi}");

    let d = fan(
        tan_bao("ready", Some("/tmp/\u{7532}"), true, Some(true)).unwrap(),
        yao_de(None, "@slidev/theme-default").unwrap(),
    );
    assert_eq!(d.get::<String>("state").unwrap(), "ready");

    let d = fan(
        tan_bao("ready", Some("/tmp/\u{7532}"), true, None).unwrap(),
        yao_de(None, "@slidev/theme-default").unwrap(),
    );
    assert_eq!(d.get::<String>("state").unwrap(), "ready");
}

#[test]
fn bai_ming_dan_li_bu_xu_you_io_os_package_debug() {
    let libs = plugin_biao_zhun_ku();
    for (name, flag) in [
        ("io", mlua::StdLib::IO),
        ("os", mlua::StdLib::OS),
        ("package", mlua::StdLib::PACKAGE),
        ("debug", mlua::StdLib::DEBUG),
    ] {
        assert!(
            !libs.contains(flag),
            "`\u{62d3}\u{5c55}\u{6807}\u{51c6}\u{5e93}()` \u{91cc}\u{4e0d}\u{8be5}\u{542b} `{name}`\u{2014}\u{2014}\u{5b83}\u{6b63}\u{662f}\u{8981}\u{6321}\u{7684}\u{4e1c}\u{897f}\u{ff08}BUG-10\u{ff09}"
        );
    }

    for (name, flag) in [
        ("coroutine", mlua::StdLib::COROUTINE),
        ("table", mlua::StdLib::TABLE),
        ("string", mlua::StdLib::STRING),
        ("math", mlua::StdLib::MATH),
    ] {
        assert!(libs.contains(flag), "`{name}` \u{8be5}\u{7559}\u{7740}\u{ff0c}\u{62d3}\u{5c55}\u{65e5}\u{5e38}\u{8981}\u{7528}");
    }
}

#[test]
fn plugin_pao_bu_le_os_execute() {
    let lua = ying_hua_de_lua().expect("\u{6c99}\u{7bb1}\u{8be5}\u{5efa}\u{5f97}\u{8d77}\u{6765}");
    let err = lua
        .load(r#"os.execute("touch /tmp/nota-sandbox-should-never-exist")"#)
        .eval::<mlua::Value>()
        .unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("nil value") || msg.contains("os"),
        "\u{8be5}\u{62a5}\u{300c}`os` \u{662f} nil\u{300d}\u{ff0c}\u{5b9e}\u{9645}\u{ff1a}{msg}"
    );
    assert!(
        !std::path::Path::new("/tmp/nota-sandbox-should-never-exist").exists(),
        "\u{6587}\u{4ef6}\u{7adf}\u{7136}\u{5efa}\u{51fa}\u{6765}\u{4e86}\u{2014}\u{2014}\u{6c99}\u{7bb1}\u{6ca1}\u{6321}\u{4f4f}"
    );
}

#[test]
fn duo_file_plugin_de_require_lian_zhen_de_pao_de_tong() {
    let mut qiu_guo_value_ji_ge = 0;

    for dir in crate::paths::builtin_plugins_dirs(None) {
        let Ok(tiao_mu_men) = std::fs::read_dir(&dir) else {
            continue;
        };
        for tiao_mu in tiao_mu_men.flatten() {
            let manifest_path_2 = tiao_mu.path().join("plugin.toml");
            if !manifest_path_2.is_file() {
                continue;
            }
            let m = crate::plugin::manifest::Manifest::load(&manifest_path_2).unwrap_or_else(|e| {
                panic!(
                    "`{}` \u{8bfb}\u{4e0d}\u{51fa}\u{6765}\u{ff1a}{e}",
                    manifest_path_2.display()
                )
            });

            let lua = ying_hua_de_lua()
                .expect("\u{6c99}\u{7bb1}\u{8be5}\u{5efa}\u{5f97}\u{8d77}\u{6765}");
            install_require(&lua, &m.dir).unwrap_or_else(|e| {
                panic!(
                    "`{}` \u{7684} require \u{88c5}\u{4e0d}\u{4e0a}\u{ff1a}{e}",
                    m.meta.id
                )
            });

            for jiao_ben in gai_plugin_xia_suo_you_lua(&m.dir) {
                let ming = jiao_ben
                    .file_stem()
                    .expect("`.lua` \u{6587}\u{4ef6}\u{8be5}\u{6709} stem")
                    .to_string_lossy()
                    .to_string();
                if ming == "main" {
                    continue;
                }

                let table_2: mlua::Table = lua
                    .load(format!("return require({ming:?})"))
                    .set_name(format!("{}\u{ff08}\u{6d4b}\u{8bd5}\u{6302}\u{94a9}\u{ff09}", jiao_ben.display()))
                    .eval()
                    .unwrap_or_else(|e| {
                        panic!(
                            "`{}` \u{91cc}\u{7684} `require({ming:?})` \u{8dd1}\u{4e0d}\u{901a}\u{ff1a}{e}\n                             \u{26a0}\u{fe0f} \u{6a21}\u{5757}\u{540d}\u{5bf9}\u{4e0d}\u{4e0a}\u{3001}\u{6709}\u{5faa}\u{73af}\u{4f9d}\u{8d56}\u{3001}\u{6216}\u{8005}\u{6a21}\u{5757}\u{7ea7}\u{8bed}\u{53e5}\u{78b0}\u{4e86} `nota`\u{ff0c}                             \u{4e09}\u{79cd}\u{90fd}\u{4f1a}\u{5728}\u{8fd9}\u{91cc}\u{73b0}\u{5f62}",
                             m.meta.id
                        )
                    });

                assert!(
                    table_2.pairs::<mlua::Value, mlua::Value>().count() > 0,
                    "`{}/{}.lua` require \u{56de}\u{6765}\u{662f}\u{4e00}\u{5f20}\u{7a7a}\u{8868}\u{2014}\u{2014}`return M` \u{5462}\u{ff1f}",
                    m.meta.id,
                    ming
                );
                qiu_guo_value_ji_ge += 1;
            }
        }
    }

    assert!(
        qiu_guo_value_ji_ge >= 2,
        "\u{4e00}\u{4e2a}\u{591a}\u{6587}\u{4ef6}\u{63d2}\u{4ef6}\u{7684}\u{5144}\u{5f1f}\u{6a21}\u{5757}\u{90fd}\u{6ca1}\u{6c42}\u{5230}\u{503c}\u{ff08}\u{6c42}\u{5230} {qiu_guo_value_ji_ge} \u{4e2a}\u{ff09}\u{2014}\u{2014}         `plugins/` \u{91cc}\u{90a3}\u{51e0}\u{4efd}\u{591a}\u{6587}\u{4ef6}\u{63d2}\u{4ef6}\u{ff08}`stats` / `git` / `ai`\u{ff09}\u{662f}\u{6ca1}\u{4e86}\u{ff0c}         \u{8fd8}\u{662f}\u{90fd}\u{4e0d}\u{62c6}\u{4e86}\u{ff1f}\u{8fd9}\u{6761}\u{7528}\u{4f8b}\u{7684}\u{5224}\u{636e}\u{8981}\u{8ddf}\u{7740}\u{6539}\u{ff0c}\u{522b}\u{5220}"
    );
}
