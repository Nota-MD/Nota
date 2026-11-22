use super::*;

#[test]
fn zhi_fang_xing_https_he_hui_huan_de_http() {
    for ok in [
        "https://api.anthropic.com/v1/messages",
        "https://example.com",
        "http://127.0.0.1:11434/api/chat",
        "http://localhost:1234/v1/chat/completions",
        "http://[::1]:8080/x",
        "http://LOCALHOST:1/x",
    ] {
        assert!(
            check_address(ok).is_ok(),
            "`{ok}` \u{8be5}\u{653e}\u{884c}\u{ff0c}\u{5374}\u{88ab}\u{6321}\u{4e86}"
        );
    }

    for bad in [
        "http://api.anthropic.com/v1/messages",
        "http://192.168.1.10:8080/",
        "http://0.0.0.0:8080/",
        "ftp://example.com/x",
        "file:///etc/passwd",
        "api.anthropic.com",
    ] {
        assert!(
            check_address(bad).is_err(),
            "`{bad}` \u{8be5}\u{88ab}\u{6321}\u{ff0c}\u{5374}\u{653e}\u{884c}\u{4e86}"
        );
    }
}

#[test]
fn qu_zhu_ji_yao_neng_chai_chu_duan_kou_he_userinfo() {
    assert_eq!(qu_zhu_ji("example.com/a/b?c#d"), "example.com");
    assert_eq!(qu_zhu_ji("example.com:8443/a"), "example.com");
    assert_eq!(qu_zhu_ji("user:pw@example.com/a"), "example.com");
    assert_eq!(qu_zhu_ji("[::1]:8080/x"), "::1");
    assert_eq!(qu_zhu_ji("Example.COM"), "example.com");

    assert_eq!(qu_zhu_ji("127.0.0.1@evil.com/x"), "evil.com");
}

#[test]
fn zhu_ji_ming_pian_bu_guo_hui_huan_pan_ding() {
    for host in ["127.0.0.1.evil.com", "localhost.evil.com", "notlocalhost"] {
        assert!(
            !shi_hui_huan(host),
            "`{host}` \u{88ab}\u{5f53}\u{6210}\u{4e86}\u{56de}\u{73af}"
        );
    }
    assert!(shi_hui_huan("127.0.0.1"));
    assert!(shi_hui_huan("localhost"));
    assert!(shi_hui_huan("::1"));
}

#[test]
fn fang_fa_zhi_you_na_liu_ge() {
    assert!(YUN_XU_DE_FANG_FA.contains(&"GET"));
    assert!(YUN_XU_DE_FANG_FA.contains(&"POST"));
    assert!(!YUN_XU_DE_FANG_FA.contains(&"CONNECT"));
    assert!(!YUN_XU_DE_FANG_FA.contains(&"TRACE"));
}

#[test]
fn chao_shi_jie_dao_shang_xian() {
    let lua = Lua::new();
    let t = lua.create_table().unwrap();
    assert_eq!(chao_shi(&t).unwrap(), DEFAULT_CHAO_SHI);

    t.set("timeout_ms", 5_000u64).unwrap();
    assert_eq!(chao_shi(&t).unwrap(), Duration::from_secs(5));

    t.set("timeout_ms", 600_000u64).unwrap();
    assert_eq!(
        chao_shi(&t).unwrap(),
        ZUI_ZHANG_CHAO_SHI,
        "\u{8d85}\u{957f}\u{7684}\u{8d85}\u{65f6}\u{8be5}\u{88ab}\u{622a}\u{5230}\u{4e0a}\u{9650}"
    );

    t.set("timeout_ms", 0u64).unwrap();
    assert!(chao_shi(&t).is_err(), "0 \u{662f}\u{6ca1}\u{610f}\u{4e49}\u{7684}\u{8d85}\u{65f6}\u{ff0c}\u{8be5}\u{62a5}\u{9519}");
}

#[test]
fn liang_zhong_write_fa_dou_gui_yi_hua() {
    let lua = Lua::new();

    let t = gui_yi_hua(
        &lua,
        Value::String(lua.create_string("https://x/").unwrap()),
        "GET",
    )
    .unwrap();
    assert_eq!(t.get::<String>("url").unwrap(), "https://x/");
    assert_eq!(t.get::<String>("method").unwrap(), "GET");

    let spec = lua.create_table().unwrap();
    spec.set("url", "https://y/").unwrap();
    gui_yi_hua(&lua, Value::Table(spec.clone()), "POST").unwrap();
    assert_eq!(spec.get::<String>("method").unwrap(), "POST");

    let spec2 = lua.create_table().unwrap();
    spec2.set("url", "https://z/").unwrap();
    spec2.set("method", "PUT").unwrap();
    let t = gui_yi_hua(&lua, Value::Table(spec2), "POST").unwrap();
    assert_eq!(t.get::<String>("method").unwrap(), "PUT");

    assert!(gui_yi_hua(&lua, Value::Integer(1), "GET").is_err());
}

#[test]
fn ren_de_plugin_zi_ji_write_de_content_type() {
    let lua = Lua::new();

    let kong = lua.create_table().unwrap();
    assert!(!write_le_content_type(&kong));

    let bie_de = lua.create_table().unwrap();
    bie_de.set("authorization", "Bearer sk-x").unwrap();
    assert!(!write_le_content_type(&bie_de));

    let da_write = lua.create_table().unwrap();
    da_write
        .set("Content-Type", "application/json; charset=utf-8")
        .unwrap();
    assert!(write_le_content_type(&da_write));

    let xiao_write = lua.create_table().unwrap();
    xiao_write.set("content-type", "text/plain").unwrap();
    assert!(write_le_content_type(&xiao_write));
}

#[test]
fn xiang_ying_shi_json_jiu_chai_ok_fang_jin_qu() {
    let lua = Lua::new();
    let t = receive_kou(
        &lua,
        Ok(RequestOutcome::Response(HttpResponse {
            code: 200,
            text: "{\"choices\":[{\"message\":{\"content\":\"\u{4f60}\u{597d}\"}},{\"message\":{\"content\":\"\u{7b2c}\u{4e8c}\"}}],\"ok\":true}"
                .to_owned(),
        })),
    )
    .unwrap();

    assert_eq!(t.get::<u16>("code").unwrap(), 200);
    let json = t.get::<Table>("json").unwrap();
    assert_eq!(json.get::<bool>("ok").unwrap(), true);
    let choices = json.get::<Table>("choices").unwrap();
    assert_eq!(choices.raw_len(), 2, "\u{4e24}\u{4e2a}\u{5143}\u{7d20}\u{90fd}\u{8be5}\u{5728}\u{ff0c}\u{4e00}\u{4e2a}\u{90fd}\u{4e0d}\u{80fd}\u{5c11}");
    assert_eq!(
        choices
            .get::<Table>(1)
            .unwrap()
            .get::<Table>("message")
            .unwrap()
            .get::<String>("content")
            .unwrap(),
        "\u{4f60}\u{597d}"
    );
}

#[test]
fn bu_shi_json_jiu_mei_you_json_zhe_ge_jian() {
    let lua = Lua::new();
    let t = receive_kou(
        &lua,
        Ok(RequestOutcome::Response(HttpResponse {
            code: 502,
            text: "<html>502 Bad Gateway</html>".to_owned(),
        })),
    )
    .unwrap();

    assert_eq!(t.get::<u16>("code").unwrap(), 502);
    assert!(
        matches!(t.get::<Value>("json").unwrap(), Value::Nil),
        "HTML \u{4e0d}\u{8be5}\u{88ab}\u{5f53}\u{6210} JSON \u{89e3}\u{6790}\u{51fa}\u{4ec0}\u{4e48}\u{6765}"
    );
    assert_eq!(
        t.get::<String>("text").unwrap(),
        "<html>502 Bad Gateway</html>"
    );
}

#[test]
fn huan_jing_lei_shi_bai_shi_result_table_bu_pao_cuo() {
    let lua = Lua::new();
    let t = receive_kou(&lua, Ok(RequestOutcome::EnvironmentFailure("\u{8bf7}\u{6c42}\u{5931}\u{8d25}\u{ff1a}\u{8fde}\u{63a5}\u{88ab}\u{62d2}".to_owned())))
        .expect("\u{73af}\u{5883}\u{7c7b}\u{5931}\u{8d25}**\u{4e0d}\u{8bb8}**\u{53d8}\u{6210} Lua \u{9519}\u{8bef}");

    assert_eq!(t.get::<bool>("ok").unwrap(), false);
    assert_eq!(
        t.get::<String>("error").unwrap(),
        "\u{8bf7}\u{6c42}\u{5931}\u{8d25}\u{ff1a}\u{8fde}\u{63a5}\u{88ab}\u{62d2}"
    );

    assert!(matches!(t.get::<Value>("code").unwrap(), Value::Nil));
    assert!(matches!(t.get::<Value>("text").unwrap(), Value::Nil));
}

#[test]
fn args_write_cuo_zhao_jiu_pao() {
    let lua = Lua::new();
    let e = receive_kou(
        &lua,
        Err(NotaError::other(
            "\u{4e0d}\u{652f}\u{6301} `TRACE` \u{65b9}\u{6cd5}",
        )),
    );
    assert!(e.is_err(), "\u{4f5c}\u{8005}\u{5199}\u{9519}\u{4e86}\u{7a0b}\u{5e8f}\u{ff0c}\u{6808}\u{4fe1}\u{606f}\u{8981}\u{7559}\u{7ed9}\u{4f5c}\u{8005}");
}

#[test]
fn na_dao_hui_ying_shi_ok_shi_zhen_de() {
    let lua = Lua::new();
    let t = receive_kou(
        &lua,
        Ok(RequestOutcome::Response(HttpResponse {
            code: 404,
            text: "not found".to_owned(),
        })),
    )
    .unwrap();

    assert_eq!(t.get::<bool>("ok").unwrap(), true);
    assert_eq!(t.get::<u16>("code").unwrap(), 404);
}

fn zhuang_fu_wu_qi(
    xiang_ying_tou: String,
    kuai_men: Vec<Vec<u8>>,
) -> (String, std::thread::JoinHandle<()>) {
    use std::io::{Read as _, Write as _};
    let jian_ting = std::net::TcpListener::bind("127.0.0.1:0")
        .expect("\u{7ed1}\u{4e0d}\u{4e0a}\u{56de}\u{73af}\u{7aef}\u{53e3}");
    let address_2 = jian_ting.local_addr().unwrap();
    let ba_shou = std::thread::spawn(move || {
        let (mut lian, _) = jian_ting
            .accept()
            .expect("\u{6ca1}\u{4eba}\u{8fde}\u{4e0a}\u{6765}");

        let mut dao_diao = [0u8; 4096];
        let _ = lian.read(&mut dao_diao);
        lian.write_all(xiang_ying_tou.as_bytes()).unwrap();
        lian.flush().unwrap();
        for kuai_2 in kuai_men {
            lian.write_all(&kuai_2).unwrap();
            lian.flush().unwrap();
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = lian.shutdown(std::net::Shutdown::Write);

        while let Ok(n) = lian.read(&mut dao_diao) {
            if n == 0 {
                break;
            }
        }
    });
    (format!("http://{address_2}/v1/chat/completions"), ba_shou)
}

fn fen_kuai_xiang_ying(ti: &str) -> (String, Vec<Vec<u8>>) {
    let tou = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\n\r\n",
        ti.len()
    );

    let kuai_men = ti.as_bytes().chunks(8).map(|c| c.to_vec()).collect();
    (tou, kuai_men)
}

fn receive_ji_kuai() -> (
    std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    Lua,
    mlua::Function,
) {
    use std::sync::{Arc, Mutex};
    let lua = Lua::new();
    let kuang = Arc::new(Mutex::new(Vec::new()));
    let kuang_2 = kuang.clone();
    let f = lua
        .create_function(move |_, kuai_2: String| {
            kuang_2.lock().unwrap().push(kuai_2);
            Ok(())
        })
        .unwrap();
    (kuang, lua, f)
}

#[test]
fn liu_shi_de_mei_yi_kuai_dou_bu_qie_ban_ge_han_zi() {
    let ti = "data: {\"choices\":[{\"delta\":{\"content\":\"\u{4f60}\u{597d}\u{ff0c}\u{4e16}\u{754c}\"}}]}\n\n\
              data: {\"choices\":[{\"delta\":{\"content\":\"\u{518d}\u{89c1}\"}}]}\n\n\
              data: [DONE]\n\n";
    let (tou, kuai_men) = fen_kuai_xiang_ying(ti);
    let (address_2, ba_shou) = zhuang_fu_wu_qi(tou, kuai_men);

    let (kuang, lua, f) = receive_ji_kuai();
    let spec = lua.create_table().unwrap();
    spec.set("url", address_2).unwrap();
    spec.set("method", "POST").unwrap();

    let luo = liu_shi(&lua, &spec, &f).unwrap();
    let (bao, kuai_shu, zhong_duan) = match luo {
        super::RequestOutcome::Streamed {
            bao,
            kuai_shu,
            zhong_duan,
        } => (bao, kuai_shu, zhong_duan),
        _ => panic!("\u{8be5}\u{662f}\u{6d41}\u{5b8c}"),
    };
    ba_shou.join().unwrap();

    assert_eq!(bao.code, 200);
    assert!(!zhong_duan);
    assert_eq!(bao.text, ti, "\u{6512}\u{8d77}\u{6765}\u{7684}\u{5168}\u{6587}\u{8981}**\u{9010}\u{5b57}**\u{7b49}\u{4e8e}\u{54cd}\u{5e94}\u{4f53}");
    let kuai_men = kuang.lock().unwrap();
    assert_eq!(kuai_men.concat(), ti, "\u{4ea4}\u{7ed9}\u{56de}\u{8c03}\u{7684}\u{90a3}\u{4e9b}\u{5757}\u{62fc}\u{8d77}\u{6765}\u{4e5f}\u{8981}\u{9010}\u{5b57}\u{7b49}\u{4e8e}\u{54cd}\u{5e94}\u{4f53}");
    assert!(
        kuai_shu >= 3,
        "\u{6869}\u{5206}\u{4e86} {} \u{6bb5}\u{6162}\u{5199}\u{ff0c}\u{62ff}\u{5230} {kuai_shu} \u{5757}\u{2014}\u{2014}\u{592a}\u{5c11}\u{8bf4}\u{660e}\u{662f}\u{618b}\u{5b8c}\u{624d}\u{7ed9}\u{7684}",
        ti.len() / 8
    );

    for (i, kuai_2) in kuai_men.iter().enumerate() {
        assert!(!kuai_2.contains('\u{FFFD}'), "\u{7b2c} {i} \u{5757}\u{91cc}\u{6709}\u{66ff}\u{6362}\u{5b57}\u{7b26}\u{ff1a}{kuai_2:?}");
    }
}

#[test]
fn man_man_tu_de_zhang_hui_da_bu_gai_bei_zong_shi_xian_qia_diao() {
    let kuai_2 = 30;
    let ti: String = (0..kuai_2)
        .map(|i| format!("data: {{\"i\":{i}}}\n\n"))
        .collect();
    let tou = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\n\r\n",
        ti.len()
    );
    let kuai_men: Vec<Vec<u8>> = ti
        .as_bytes()
        .chunks(ti.len() / kuai_2)
        .map(|c| c.to_vec())
        .collect();

    let (address_2, ba_shou) = zhuang_fu_wu_qi(tou, kuai_men);

    let (kuang, lua, f) = receive_ji_kuai();
    let spec = lua.create_table().unwrap();
    spec.set("url", address_2).unwrap();
    spec.set("method", "POST").unwrap();

    spec.set("timeout_ms", 600).unwrap();

    let qi = std::time::Instant::now();
    let luo = liu_shi(&lua, &spec, &f).unwrap();
    let yong_le = qi.elapsed();
    let (bao, kuai_shu, zhong_duan) = match luo {
        super::RequestOutcome::Streamed {
            bao,
            kuai_shu,
            zhong_duan,
        } => (bao, kuai_shu, zhong_duan),
        super::RequestOutcome::EnvironmentFailure(hua) => {
            panic!("\u{4e0d}\u{8be5}\u{5931}\u{8d25}\u{ff0c}\u{5b9e}\u{9645}\u{ff1a}{hua}")
        }
        _ => panic!("\u{8be5}\u{662f}\u{6d41}\u{5b8c}"),
    };
    let _ = ba_shou.join();

    assert_eq!(bao.code, 200);
    assert!(
        !zhong_duan,
        "\u{6ca1}\u{6709}\u{4efb}\u{4f55}\u{4e00}\u{5757}\u{8be5}\u{88ab}\u{6390}\u{6389}"
    );
    assert_eq!(
        bao.text, ti,
        "\u{5168}\u{6587}\u{8981}\u{9010}\u{5b57}\u{6536}\u{9f50}"
    );
    assert_eq!(kuang.lock().unwrap().concat(), ti);
    assert!(
        kuai_shu >= kuai_2,
        "\u{6869}\u{5206}\u{4e86} {kuai_2} \u{6bb5}\u{6162}\u{5199}\u{ff0c}\u{53ea}\u{62ff}\u{5230} {kuai_shu} \u{5757}\u{2014}\u{2014}\u{8bf4}\u{660e}\u{4e2d}\u{9014}\u{88ab}\u{6390}\u{4e86}"
    );

    assert!(
        yong_le > Duration::from_millis(600),
        "\u{8fd9}\u{6761}\u{7528}\u{4f8b}\u{8981}\u{7684}\u{662f}\u{300c}\u{603b}\u{65f6}\u{957f}\u{8d85}\u{8fc7}\u{65f6}\u{9650}\u{300d}\u{ff0c}\u{5b9e}\u{6d4b}\u{53ea}\u{7528}\u{4e86} {yong_le:?}\u{2014}\u{2014}\u{5939}\u{5177}\u{592a}\u{5feb}\u{4e86}\u{ff1f}"
    );
}

#[test]
fn hui_diao_fan_hui_false_jiu_dang_chang_receive_gong() {
    let ti = "\u{7b2c}\u{4e00}\u{5757}\n\u{7b2c}\u{4e8c}\u{5757}\n\u{7b2c}\u{4e09}\u{5757}\n\u{7b2c}\u{56db}\u{5757}\n\u{7b2c}\u{4e94}\u{5757}\n\u{7b2c}\u{516d}\u{5757}\n\u{7b2c}\u{4e03}\u{5757}\n\u{7b2c}\u{516b}\u{5757}\n";
    let (tou, kuai_men) = fen_kuai_xiang_ying(ti);
    let (address_2, ba_shou) = zhuang_fu_wu_qi(tou, kuai_men);

    let lua = Lua::new();
    let receive_dao = lua.create_function(|_, _chunk: String| Ok(false)).unwrap();
    let spec = lua.create_table().unwrap();
    spec.set("url", address_2).unwrap();
    spec.set("method", "POST").unwrap();

    let luo = liu_shi(&lua, &spec, &receive_dao).unwrap();
    let (bao, kuai_shu, zhong_duan) = match luo {
        super::RequestOutcome::Streamed {
            bao,
            kuai_shu,
            zhong_duan,
        } => (bao, kuai_shu, zhong_duan),
        _ => panic!("\u{8be5}\u{662f}\u{6d41}\u{5b8c}"),
    };

    assert!(
        zhong_duan,
        "\u{56de}\u{8c03}\u{8bf4}\u{4e86}\u{505c}\u{ff0c}`aborted` \u{5fc5}\u{987b}\u{662f} true"
    );
    assert_eq!(
        kuai_shu, 1,
        "\u{558a}\u{505c}\u{4e4b}\u{540e}\u{4e00}\u{5757}\u{90fd}\u{4e0d}\u{8bb8}\u{518d}\u{4ea4}"
    );
    assert_eq!(bao.text, &ti[..bao.text.len()], "\u{6512}\u{4e0b}\u{6765}\u{7684}\u{5168}\u{6587}\u{53ea}\u{80fd}\u{662f}\u{558a}\u{505c}\u{524d}\u{6536}\u{5230}\u{7684}\u{90a3}\u{70b9}");
    assert!(bao.text.len() < ti.len(), "\u{558a}\u{505c}\u{5f97}\u{591f}\u{65e9}\u{ff0c}\u{5168}\u{6587}\u{4e0d}\u{8be5}\u{662f}\u{5b8c}\u{6574}\u{90a3}\u{4efd}");

    drop(ba_shou);
}

#[test]
fn liu_shi_de_result_table_zhi_zai_zhen_zhong_duan_shi_cai_you_aborted() {
    let lua = Lua::new();

    let receive_wan = receive_kou(
        &lua,
        Ok(RequestOutcome::Streamed {
            bao: HttpResponse {
                code: 200,
                text: "abc".to_owned(),
            },
            kuai_shu: 3,
            zhong_duan: false,
        }),
    )
    .unwrap();
    assert_eq!(receive_wan.get::<bool>("ok").unwrap(), true);
    assert_eq!(receive_wan.get::<usize>("chunks").unwrap(), 3);
    assert!(
        matches!(receive_wan.get::<Value>("aborted").unwrap(), Value::Nil),
        "\u{6ca1}\u{4e2d}\u{65ad}\u{5c31}\u{4e0d}\u{8be5}\u{6709} `aborted` \u{8fd9}\u{4e2a}\u{952e}\u{2014}\u{2014}`if r.aborted` \u{4f1a}\u{628a} false \u{4e5f}\u{5f53}\u{6ca1}\u{4e2d}\u{65ad}\u{ff0c}\
         \u{4f46} `if r.aborted ~= nil` \u{4f1a}\u{628a} false \u{5f53}\u{4e2d}\u{65ad}"
    );

    let zhong_chang = receive_kou(
        &lua,
        Ok(RequestOutcome::Streamed {
            bao: HttpResponse {
                code: 200,
                text: "ab".to_owned(),
            },
            kuai_shu: 2,
            zhong_duan: true,
        }),
    )
    .unwrap();
    assert_eq!(zhong_chang.get::<bool>("aborted").unwrap(), true);
    assert_eq!(zhong_chang.get::<usize>("chunks").unwrap(), 2);

    let yi_ci = receive_kou(
        &lua,
        Ok(RequestOutcome::Response(HttpResponse {
            code: 200,
            text: "x".to_owned(),
        })),
    )
    .unwrap();
    assert!(matches!(yi_ci.get::<Value>("chunks").unwrap(), Value::Nil));
}

#[test]
fn qie_chu_wan_zheng_duan_de_san_tiao_lu() {
    let mut b = "\u{4f60}\u{597d}".as_bytes().to_vec();
    assert_eq!(qie_chu_wan_zheng_duan(&mut b).unwrap(), "\u{4f60}\u{597d}");
    assert!(b.is_empty());
    assert!(
        qie_chu_wan_zheng_duan(&mut b).is_none(),
        "\u{7a7a}\u{7f13}\u{51b2}\u{7ed9} None"
    );

    let mut b = Vec::new();
    b.extend_from_slice("ab".as_bytes());
    b.extend_from_slice(&"\u{597d}".as_bytes()[..2]);
    assert_eq!(qie_chu_wan_zheng_duan(&mut b).unwrap(), "ab");
    assert_eq!(b.len(), 2, "\u{5269}\u{4e0b}\u{7684}\u{90a3}\u{534a}\u{4e2a}\u{5b57}\u{8981}\u{7559}\u{5728}\u{7f13}\u{51b2}\u{91cc}\u{7b49}\u{4e0b}\u{4e00}\u{5757}");
    assert!(
        qie_chu_wan_zheng_duan(&mut b).is_none(),
        "\u{53ea}\u{6709}\u{534a}\u{4e2a}\u{5b57}\u{65f6}\u{4ec0}\u{4e48}\u{90fd}\u{4e0d}\u{4ea4}\u{2014}\u{2014}\u{7b49}\u{ff0c}\u{4e0d}\u{662f}\u{53d6}\u{5de7}"
    );

    b.push("\u{597d}".as_bytes()[2]);
    assert_eq!(qie_chu_wan_zheng_duan(&mut b).unwrap(), "\u{597d}");

    let mut b = vec![b'a', 0xFF, 0xFE, b'b'];
    let mut quan_bu = String::new();
    while let Some(s) = qie_chu_wan_zheng_duan(&mut b) {
        quan_bu.push_str(&s);
    }
    assert_eq!(quan_bu, "a\u{FFFD}\u{FFFD}b");
    assert!(b.is_empty(), "\u{574f}\u{5b57}\u{8282}\u{4e5f}\u{8981}\u{5f80}\u{524d}\u{8d70}\u{ff0c}\u{4e0d}\u{8bb8}\u{5361}\u{5728}\u{7f13}\u{51b2}\u{91cc}");
}

#[test]
fn install_shang_le_stream_er_qie_hui_diao_shi_bi_tian_de() {
    let lua = Lua::new();
    let http = build(&lua).unwrap();
    assert!(
        matches!(http.get::<Value>("stream").unwrap(), Value::Function(_)),
        "`nota.http.stream` \u{8be5}\u{5728}\u{8868}\u{91cc}"
    );

    let gui_ge = lua.create_table().unwrap();
    gui_ge.set("url", "http://127.0.0.1:1/x").unwrap();
    let f = http.get::<mlua::Function>("stream").unwrap();
    assert!(
        f.call::<Value>(gui_ge).is_err(),
        "\u{5c11}\u{4e00}\u{4e2a}\u{56de}\u{8c03}\u{53c2}\u{6570}\u{8be5}\u{62a5}\u{9519}"
    );
}
