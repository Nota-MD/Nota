use super::*;

#[test]
fn only_method_line_https_and_return_replace_http() {
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
fn get_main_record_need_can_split_out_segment_port_and_userinfo() {
    assert_eq!(get_main_record("example.com/a/b?c#d"), "example.com");
    assert_eq!(get_main_record("example.com:8443/a"), "example.com");
    assert_eq!(get_main_record("user:pw@example.com/a"), "example.com");
    assert_eq!(get_main_record("[::1]:8080/x"), "::1");
    assert_eq!(get_main_record("Example.COM"), "example.com");

    assert_eq!(get_main_record("127.0.0.1@evil.com/x"), "evil.com");
}

#[test]
fn main_record_name_piece_not_passed_return_replace_parse_define() {
    for host in ["127.0.0.1.evil.com", "localhost.evil.com", "notlocalhost"] {
        assert!(
            !is_return_replace(host),
            "`{host}` \u{88ab}\u{5f53}\u{6210}\u{4e86}\u{56de}\u{73af}"
        );
    }
    assert!(is_return_replace("127.0.0.1"));
    assert!(is_return_replace("localhost"));
    assert!(is_return_replace("::1"));
}

#[test]
fn method_method_only_has_that_stream() {
    assert!(RUN_REQUIRED_METHOD_METHOD.contains(&"GET"));
    assert!(RUN_REQUIRED_METHOD_METHOD.contains(&"POST"));
    assert!(!RUN_REQUIRED_METHOD_METHOD.contains(&"CONNECT"));
    assert!(!RUN_REQUIRED_METHOD_METHOD.contains(&"TRACE"));
}

#[test]
fn overflow_is_boundary_to_upper_thread() {
    let lua = Lua::new();
    let t = lua.create_table().unwrap();
    assert_eq!(overflow_is(&t).unwrap(), DEFAULT_OVERFLOW_IS);

    t.set("timeout_ms", 5_000u64).unwrap();
    assert_eq!(overflow_is(&t).unwrap(), Duration::from_secs(5));

    t.set("timeout_ms", 600_000u64).unwrap();
    assert_eq!(
        overflow_is(&t).unwrap(),
        MOST_LENGTH_OVERFLOW_IS,
        "\u{8d85}\u{957f}\u{7684}\u{8d85}\u{65f6}\u{8be5}\u{88ab}\u{622a}\u{5230}\u{4e0a}\u{9650}"
    );

    t.set("timeout_ms", 0u64).unwrap();
    assert!(overflow_is(&t).is_err(), "0 \u{662f}\u{6ca1}\u{610f}\u{4e49}\u{7684}\u{8d85}\u{65f6}\u{ff0c}\u{8be5}\u{62a5}\u{9519}");
}

#[test]
fn two_middle_write_method_all_normalize_one_render() {
    let lua = Lua::new();

    let t = normalize_one_render(
        &lua,
        Value::String(lua.create_string("https://x/").unwrap()),
        "GET",
    )
    .unwrap();
    assert_eq!(t.get::<String>("url").unwrap(), "https://x/");
    assert_eq!(t.get::<String>("method").unwrap(), "GET");

    let spec = lua.create_table().unwrap();
    spec.set("url", "https://y/").unwrap();
    normalize_one_render(&lua, Value::Table(spec.clone()), "POST").unwrap();
    assert_eq!(spec.get::<String>("method").unwrap(), "POST");

    let spec2 = lua.create_table().unwrap();
    spec2.set("url", "https://z/").unwrap();
    spec2.set("method", "PUT").unwrap();
    let t = normalize_one_render(&lua, Value::Table(spec2), "POST").unwrap();
    assert_eq!(t.get::<String>("method").unwrap(), "PUT");

    assert!(normalize_one_render(&lua, Value::Integer(1), "GET").is_err());
}

#[test]
fn person_plugin_character_record_write_content_type() {
    let lua = Lua::new();

    let empty = lua.create_table().unwrap();
    assert!(!write_content_type(&empty));

    let other = lua.create_table().unwrap();
    other.set("authorization", "Bearer sk-x").unwrap();
    assert!(!write_content_type(&other));

    let large_write = lua.create_table().unwrap();
    large_write
        .set("Content-Type", "application/json; charset=utf-8")
        .unwrap();
    assert!(write_content_type(&large_write));

    let small_write = lua.create_table().unwrap();
    small_write.set("content-type", "text/plain").unwrap();
    assert!(write_content_type(&small_write));
}

#[test]
fn item_should_is_json_old_split_ok_method_enter_get() {
    let lua = Lua::new();
    let t = receive_port(
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
fn not_is_json_old_each_has_json_check() {
    let lua = Lua::new();
    let t = receive_port(
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
fn replace_static_kind_is_percent_is_result_table_not_run_error() {
    let lua = Lua::new();
    let t = receive_port(&lua, Ok(RequestOutcome::EnvironmentFailure("\u{8bf7}\u{6c42}\u{5931}\u{8d25}\u{ff1a}\u{8fde}\u{63a5}\u{88ab}\u{62d2}".to_owned())))
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
fn args_write_error_find_old_run() {
    let lua = Lua::new();
    let e = receive_port(
        &lua,
        Err(NotaError::other(
            "\u{4e0d}\u{652f}\u{6301} `TRACE` \u{65b9}\u{6cd5}",
        )),
    );
    assert!(e.is_err(), "\u{4f5c}\u{8005}\u{5199}\u{9519}\u{4e86}\u{7a0b}\u{5e8f}\u{ff0c}\u{6808}\u{4fe1}\u{606f}\u{8981}\u{7559}\u{7ed9}\u{4f5c}\u{8005}");
}

#[test]
fn that_to_return_should_is_ok_is_real() {
    let lua = Lua::new();
    let t = receive_port(
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

fn state_service_none_start(
    item_should_header: String,
    block_list: Vec<Vec<u8>>,
) -> (String, std::thread::JoinHandle<()>) {
    use std::io::{Read as _, Write as _};
    let check_listen = std::net::TcpListener::bind("127.0.0.1:0")
        .expect("\u{7ed1}\u{4e0d}\u{4e0a}\u{56de}\u{73af}\u{7aef}\u{53e3}");
    let address_2 = check_listen.local_addr().unwrap();
    let handle_receive = std::thread::spawn(move || {
        let (mut link, _) = check_listen
            .accept()
            .expect("\u{6ca1}\u{4eba}\u{8fde}\u{4e0a}\u{6765}");

        let mut to_drop = [0u8; 4096];
        let _ = link.read(&mut to_drop);
        link.write_all(item_should_header.as_bytes()).unwrap();
        link.flush().unwrap();
        for value_2 in block_list {
            link.write_all(&value_2).unwrap();
            link.flush().unwrap();
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = link.shutdown(std::net::Shutdown::Write);

        while let Ok(n) = link.read(&mut to_drop) {
            if n == 0 {
                break;
            }
        }
    });
    (
        format!("http://{address_2}/v1/chat/completions"),
        handle_receive,
    )
}

fn part_block_item_should(question: &str) -> (String, Vec<Vec<u8>>) {
    let header = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\n\r\n",
        question.len()
    );

    let block_list = question.as_bytes().chunks(8).map(|c| c.to_vec()).collect();
    (header, block_list)
}

fn receive_record_block() -> (
    std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    Lua,
    mlua::Function,
) {
    use std::sync::{Arc, Mutex};
    let lua = Lua::new();
    let frame = Arc::new(Mutex::new(Vec::new()));
    let frame_2 = frame.clone();
    let f = lua
        .create_function(move |_, value_2: String| {
            frame_2.lock().unwrap().push(value_2);
            Ok(())
        })
        .unwrap();
    (frame, lua, f)
}

#[test]
fn stream_is_each_one_block_all_not_cut_half_contain_character() {
    let question = "data: {\"choices\":[{\"delta\":{\"content\":\"\u{4f60}\u{597d}\u{ff0c}\u{4e16}\u{754c}\"}}]}\n\n\
              data: {\"choices\":[{\"delta\":{\"content\":\"\u{518d}\u{89c1}\"}}]}\n\n\
              data: [DONE]\n\n";
    let (header, block_list) = part_block_item_should(question);
    let (address_2, handle_receive) = state_service_none_start(header, block_list);

    let (frame, lua, f) = receive_record_block();
    let spec = lua.create_table().unwrap();
    spec.set("url", address_2).unwrap();
    spec.set("method", "POST").unwrap();

    let land = stream_is(&lua, &spec, &f).unwrap();
    let (package, block_data, middle_segment) = match land {
        super::RequestOutcome::Streamed {
            package,
            block_data,
            middle_segment,
        } => (package, block_data, middle_segment),
        _ => panic!("\u{8be5}\u{662f}\u{6d41}\u{5b8c}"),
    };
    handle_receive.join().unwrap();

    assert_eq!(package.code, 200);
    assert!(!middle_segment);
    assert_eq!(package.text, question, "\u{6512}\u{8d77}\u{6765}\u{7684}\u{5168}\u{6587}\u{8981}**\u{9010}\u{5b57}**\u{7b49}\u{4e8e}\u{54cd}\u{5e94}\u{4f53}");
    let block_list = frame.lock().unwrap();
    assert_eq!(block_list.concat(), question, "\u{4ea4}\u{7ed9}\u{56de}\u{8c03}\u{7684}\u{90a3}\u{4e9b}\u{5757}\u{62fc}\u{8d77}\u{6765}\u{4e5f}\u{8981}\u{9010}\u{5b57}\u{7b49}\u{4e8e}\u{54cd}\u{5e94}\u{4f53}");
    assert!(
        block_data >= 3,
        "\u{6869}\u{5206}\u{4e86} {} \u{6bb5}\u{6162}\u{5199}\u{ff0c}\u{62ff}\u{5230} {block_data} \u{5757}\u{2014}\u{2014}\u{592a}\u{5c11}\u{8bf4}\u{660e}\u{662f}\u{618b}\u{5b8c}\u{624d}\u{7ed9}\u{7684}",
        question.len() / 8
    );

    for (i, value_2) in block_list.iter().enumerate() {
        assert!(!value_2.contains('\u{FFFD}'), "\u{7b2c} {i} \u{5757}\u{91cc}\u{6709}\u{66ff}\u{6362}\u{5b57}\u{7b26}\u{ff1a}{value_2:?}");
    }
}

#[test]
fn full_full_image_length_return_large_not_change_passive_total_is_thread_match_drop() {
    let value_2 = 30;
    let question: String = (0..value_2)
        .map(|i| format!("data: {{\"i\":{i}}}\n\n"))
        .collect();
    let header = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\n\r\n",
        question.len()
    );
    let block_list: Vec<Vec<u8>> = question
        .as_bytes()
        .chunks(question.len() / value_2)
        .map(|c| c.to_vec())
        .collect();

    let (address_2, handle_receive) = state_service_none_start(header, block_list);

    let (frame, lua, f) = receive_record_block();
    let spec = lua.create_table().unwrap();
    spec.set("url", address_2).unwrap();
    spec.set("method", "POST").unwrap();

    spec.set("timeout_ms", 600).unwrap();

    let start = std::time::Instant::now();
    let land = stream_is(&lua, &spec, &f).unwrap();
    let elapsed = start.elapsed();
    let (package, block_data, middle_segment) = match land {
        super::RequestOutcome::Streamed {
            package,
            block_data,
            middle_segment,
        } => (package, block_data, middle_segment),
        super::RequestOutcome::EnvironmentFailure(render) => {
            panic!("\u{4e0d}\u{8be5}\u{5931}\u{8d25}\u{ff0c}\u{5b9e}\u{9645}\u{ff1a}{render}")
        }
        _ => panic!("\u{8be5}\u{662f}\u{6d41}\u{5b8c}"),
    };
    let _ = handle_receive.join();

    assert_eq!(package.code, 200);
    assert!(
        !middle_segment,
        "\u{6ca1}\u{6709}\u{4efb}\u{4f55}\u{4e00}\u{5757}\u{8be5}\u{88ab}\u{6390}\u{6389}"
    );
    assert_eq!(
        package.text, question,
        "\u{5168}\u{6587}\u{8981}\u{9010}\u{5b57}\u{6536}\u{9f50}"
    );
    assert_eq!(frame.lock().unwrap().concat(), question);
    assert!(
        block_data >= value_2,
        "\u{6869}\u{5206}\u{4e86} {value_2} \u{6bb5}\u{6162}\u{5199}\u{ff0c}\u{53ea}\u{62ff}\u{5230} {block_data} \u{5757}\u{2014}\u{2014}\u{8bf4}\u{660e}\u{4e2d}\u{9014}\u{88ab}\u{6390}\u{4e86}"
    );

    assert!(
        elapsed > Duration::from_millis(600),
        "\u{8fd9}\u{6761}\u{7528}\u{4f8b}\u{8981}\u{7684}\u{662f}\u{300c}\u{603b}\u{65f6}\u{957f}\u{8d85}\u{8fc7}\u{65f6}\u{9650}\u{300d}\u{ff0c}\u{5b9e}\u{6d4b}\u{53ea}\u{7528}\u{4e86} {elapsed:?}\u{2014}\u{2014}\u{5939}\u{5177}\u{592a}\u{5feb}\u{4e86}\u{ff1f}"
    );
}

#[test]
fn return_drop_reverse_return_false_old_when_long_receive_work() {
    let question = "\u{7b2c}\u{4e00}\u{5757}\n\u{7b2c}\u{4e8c}\u{5757}\n\u{7b2c}\u{4e09}\u{5757}\n\u{7b2c}\u{56db}\u{5757}\n\u{7b2c}\u{4e94}\u{5757}\n\u{7b2c}\u{516d}\u{5757}\n\u{7b2c}\u{4e03}\u{5757}\n\u{7b2c}\u{516b}\u{5757}\n";
    let (header, block_list) = part_block_item_should(question);
    let (address_2, handle_receive) = state_service_none_start(header, block_list);

    let lua = Lua::new();
    let receive_to = lua.create_function(|_, _chunk: String| Ok(false)).unwrap();
    let spec = lua.create_table().unwrap();
    spec.set("url", address_2).unwrap();
    spec.set("method", "POST").unwrap();

    let land = stream_is(&lua, &spec, &receive_to).unwrap();
    let (package, block_data, middle_segment) = match land {
        super::RequestOutcome::Streamed {
            package,
            block_data,
            middle_segment,
        } => (package, block_data, middle_segment),
        _ => panic!("\u{8be5}\u{662f}\u{6d41}\u{5b8c}"),
    };

    assert!(
        middle_segment,
        "\u{56de}\u{8c03}\u{8bf4}\u{4e86}\u{505c}\u{ff0c}`aborted` \u{5fc5}\u{987b}\u{662f} true"
    );
    assert_eq!(
        block_data, 1,
        "\u{558a}\u{505c}\u{4e4b}\u{540e}\u{4e00}\u{5757}\u{90fd}\u{4e0d}\u{8bb8}\u{518d}\u{4ea4}"
    );
    assert_eq!(package.text, &question[..package.text.len()], "\u{6512}\u{4e0b}\u{6765}\u{7684}\u{5168}\u{6587}\u{53ea}\u{80fd}\u{662f}\u{558a}\u{505c}\u{524d}\u{6536}\u{5230}\u{7684}\u{90a3}\u{70b9}");
    assert!(package.text.len() < question.len(), "\u{558a}\u{505c}\u{5f97}\u{591f}\u{65e9}\u{ff0c}\u{5168}\u{6587}\u{4e0d}\u{8be5}\u{662f}\u{5b8c}\u{6574}\u{90a3}\u{4efd}");

    drop(handle_receive);
}

#[test]
fn stream_is_result_table_only_at_real_middle_segment_is_extract_has_aborted() {
    let lua = Lua::new();

    let receive_complete = receive_port(
        &lua,
        Ok(RequestOutcome::Streamed {
            package: HttpResponse {
                code: 200,
                text: "abc".to_owned(),
            },
            block_data: 3,
            middle_segment: false,
        }),
    )
    .unwrap();
    assert_eq!(receive_complete.get::<bool>("ok").unwrap(), true);
    assert_eq!(receive_complete.get::<usize>("chunks").unwrap(), 3);
    assert!(
        matches!(receive_complete.get::<Value>("aborted").unwrap(), Value::Nil),
        "\u{6ca1}\u{4e2d}\u{65ad}\u{5c31}\u{4e0d}\u{8be5}\u{6709} `aborted` \u{8fd9}\u{4e2a}\u{952e}\u{2014}\u{2014}`if r.aborted` \u{4f1a}\u{628a} false \u{4e5f}\u{5f53}\u{6ca1}\u{4e2d}\u{65ad}\u{ff0c}\
         \u{4f46} `if r.aborted ~= nil` \u{4f1a}\u{628a} false \u{5f53}\u{4e2d}\u{65ad}"
    );

    let middle_long = receive_port(
        &lua,
        Ok(RequestOutcome::Streamed {
            package: HttpResponse {
                code: 200,
                text: "ab".to_owned(),
            },
            block_data: 2,
            middle_segment: true,
        }),
    )
    .unwrap();
    assert_eq!(middle_long.get::<bool>("aborted").unwrap(), true);
    assert_eq!(middle_long.get::<usize>("chunks").unwrap(), 2);

    let one_word = receive_port(
        &lua,
        Ok(RequestOutcome::Response(HttpResponse {
            code: 200,
            text: "x".to_owned(),
        })),
    )
    .unwrap();
    assert!(matches!(
        one_word.get::<Value>("chunks").unwrap(),
        Value::Nil
    ));
}

#[test]
fn cut_out_complete_validate_segment_three_item_path() {
    let mut b = "\u{4f60}\u{597d}".as_bytes().to_vec();
    assert_eq!(
        cut_out_complete_validate_segment(&mut b).unwrap(),
        "\u{4f60}\u{597d}"
    );
    assert!(b.is_empty());
    assert!(
        cut_out_complete_validate_segment(&mut b).is_none(),
        "\u{7a7a}\u{7f13}\u{51b2}\u{7ed9} None"
    );

    let mut b = Vec::new();
    b.extend_from_slice("ab".as_bytes());
    b.extend_from_slice(&"\u{597d}".as_bytes()[..2]);
    assert_eq!(cut_out_complete_validate_segment(&mut b).unwrap(), "ab");
    assert_eq!(b.len(), 2, "\u{5269}\u{4e0b}\u{7684}\u{90a3}\u{534a}\u{4e2a}\u{5b57}\u{8981}\u{7559}\u{5728}\u{7f13}\u{51b2}\u{91cc}\u{7b49}\u{4e0b}\u{4e00}\u{5757}");
    assert!(
        cut_out_complete_validate_segment(&mut b).is_none(),
        "\u{53ea}\u{6709}\u{534a}\u{4e2a}\u{5b57}\u{65f6}\u{4ec0}\u{4e48}\u{90fd}\u{4e0d}\u{4ea4}\u{2014}\u{2014}\u{7b49}\u{ff0c}\u{4e0d}\u{662f}\u{53d6}\u{5de7}"
    );

    b.push("\u{597d}".as_bytes()[2]);
    assert_eq!(
        cut_out_complete_validate_segment(&mut b).unwrap(),
        "\u{597d}"
    );

    let mut b = vec![b'a', 0xFF, 0xFE, b'b'];
    let mut full_not = String::new();
    while let Some(s) = cut_out_complete_validate_segment(&mut b) {
        full_not.push_str(&s);
    }
    assert_eq!(full_not, "a\u{FFFD}\u{FFFD}b");
    assert!(b.is_empty(), "\u{574f}\u{5b57}\u{8282}\u{4e5f}\u{8981}\u{5f80}\u{524d}\u{8d70}\u{ff0c}\u{4e0d}\u{8bb8}\u{5361}\u{5728}\u{7f13}\u{51b2}\u{91cc}");
}

#[test]
fn install_upper_stream_two_cut_return_drop_is_must_field() {
    let lua = Lua::new();
    let http = build(&lua).unwrap();
    assert!(
        matches!(http.get::<Value>("stream").unwrap(), Value::Function(_)),
        "`nota.http.stream` \u{8be5}\u{5728}\u{8868}\u{91cc}"
    );

    let normalize = lua.create_table().unwrap();
    normalize.set("url", "http://127.0.0.1:1/x").unwrap();
    let f = http.get::<mlua::Function>("stream").unwrap();
    assert!(
        f.call::<Value>(normalize).is_err(),
        "\u{5c11}\u{4e00}\u{4e2a}\u{56de}\u{8c03}\u{53c2}\u{6570}\u{8be5}\u{62a5}\u{9519}"
    );
}
