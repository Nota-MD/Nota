use super::*;

#[test]
fn same_only_layer_record_normalize_one_render() {
    assert_eq!(normalise_level(None), "info");
    assert_eq!(normalise_level(Some("warn")), "warn");
    assert_eq!(normalise_level(Some("warning")), "warn");
    assert_eq!(normalise_level(Some("error")), "error");
    assert_eq!(
        normalise_level(Some("\u{968f}\u{4fbf}\u{5199}\u{7684}")),
        "info"
    );
}

#[test]
fn main_side_surface_half_read_return_incoming() {
    let lua = Lua::new();
    let register = surface_half_table(&lua, "nota.t").unwrap();

    let spec = lua.create_table().unwrap();
    spec.set("id", "git").unwrap();
    spec.set("title", "Git").unwrap();
    register.call::<()>(spec).unwrap();

    let got = crate::plugin::read_surface_half(&lua, "nota.t");
    assert_eq!(got.len(), 1, "\u{6ce8}\u{518c}\u{4e86}\u{4e00}\u{4e2a}\u{ff0c}\u{5c31}\u{8be5}\u{8bfb}\u{56de}\u{4e00}\u{4e2a}");
    assert_eq!(got[0].plugin, "nota.t");
    assert_eq!(got[0].id, "git");
    assert_eq!(got[0].title, "Git");
    assert_eq!(
        got[0].location, "right",
        "\u{4e0d}\u{5199} `location` \u{8be5}\u{9ed8}\u{8ba4}\u{5230}\u{53f3}\u{4fa7}\u{62d3}\u{5c55}\u{680f}\u{2014}\u{2014}\u{9ed8}\u{8ba4}\u{503c} `sidebar` \u{662f}\u{5de6}\u{680f}\u{8fd8}\u{517c}\u{804c}\u{88c5}\u{62d3}\u{5c55}\u{65f6}\u{7684}\u{4e8b}"
    );
}

#[test]
fn surface_half_not_write_title_old_that_id_define_upper() {
    let lua = Lua::new();
    let register = surface_half_table(&lua, "nota.t").unwrap();
    let spec = lua.create_table().unwrap();
    spec.set("id", "only-id").unwrap();
    register.call::<()>(spec).unwrap();

    let got = crate::plugin::read_surface_half(&lua, "nota.t");
    assert_eq!(got[0].title, "only-id");
}

#[test]
fn surface_half_middle_name_need_package_error() {
    let lua = Lua::new();
    let register = surface_half_table(&lua, "nota.t").unwrap();
    let spec = lua.create_table().unwrap();
    spec.set("id", "dup").unwrap();
    register.call::<()>(spec.clone()).unwrap();

    let err = register.call::<()>(spec).unwrap_err().to_string();
    assert!(
        err.contains("registered a duplicate panel"),
        "unexpected error: {err}"
    );

    assert_eq!(crate::plugin::read_surface_half(&lua, "nota.t").len(), 1);
}

#[test]
fn each_declaration_passed_old_read_return_empty_table() {
    let lua = Lua::new();
    assert!(crate::plugin::read_surface_half(&lua, "nota.t").is_empty());
    assert!(crate::plugin::read_extract_single(&lua, "nota.t").is_empty());
}

#[test]
fn main_side_extract_single_item_read_return_incoming() {
    let lua = Lua::new();
    let register = extract_single_table(&lua, "nota.t").unwrap();

    let spec = lua.create_table().unwrap();
    spec.set("label", "\u{63d0}\u{4ea4}\u{2026}").unwrap();
    spec.set("command", "commit").unwrap();
    register.call::<()>(spec).unwrap();

    let got = crate::plugin::read_extract_single(&lua, "nota.t");
    assert_eq!(got.len(), 1);
    assert_eq!(
        got[0].menu, "plugins",
        "\u{4e0d}\u{5199} `menu` \u{9ed8}\u{8ba4}\u{6302}\u{5728} plugins \u{4e0b}"
    );
    assert_eq!(got[0].command, "commit");
    assert_eq!(got[0].accelerator, None);
    assert!(got[0].prompt.is_none(), "\u{6ca1}\u{5199} `prompt` \u{5c31}\u{662f}\u{76f4}\u{63a5}\u{8dd1}\u{ff0c}\u{4e0d}\u{8be5}\u{95ee}");
}

#[test]
fn extract_single_item_prompt_read_return_incoming() {
    let lua = Lua::new();
    let register = extract_single_table(&lua, "nota.t").unwrap();
    let spec: Table = lua
        .load(
            "return {\n                 label = \"\u{63d0}\u{4ea4}\u{2026}\", command = \"commit\",\n                 prompt = { arg = \"message\", label = \"\u{63d0}\u{4ea4}\u{4fe1}\u{606f}\", placeholder = \"\u{4e00}\u{53e5}\u{8bdd}\u{8bf4}\u{6e05}\u{8fd9}\u{6b21}\u{6539}\u{4e86}\u{4ec0}\u{4e48}\" },\n               }",
        )
        .eval()
        .unwrap();
    register.call::<()>(spec).unwrap();

    let got = crate::plugin::read_extract_single(&lua, "nota.t");
    let p = got[0]
        .prompt
        .as_ref()
        .expect("`prompt` \u{8be5}\u{8ddf}\u{7740}\u{56de}\u{6765}");
    assert_eq!(p.arg, "message", "\u{6ca1}\u{6709} `arg` \u{7684}\u{8bdd}\u{7528}\u{6237}\u{586b}\u{7684}\u{503c}\u{6ca1}\u{6709}\u{5730}\u{65b9}\u{653e}");
    assert_eq!(p.label, "\u{63d0}\u{4ea4}\u{4fe1}\u{606f}");
    assert_eq!(
        p.placeholder,
        "\u{4e00}\u{53e5}\u{8bdd}\u{8bf4}\u{6e05}\u{8fd9}\u{6b21}\u{6539}\u{4e86}\u{4ec0}\u{4e48}"
    );
    assert!(
        !p.secret,
        "\u{4e0d}\u{5199} `secret` \u{5c31}\u{662f}\u{660e}\u{6587}\u{663e}\u{793a}"
    );
    assert_eq!(p.hint, "", "\u{6ca1}\u{5199}\u{7684}\u{5b57}\u{6bb5}\u{7ed9}\u{7a7a}\u{4e32}\u{ff0c}\u{4e0d}\u{662f} panic");
}

#[test]
fn each_has_arg_prompt_when_each_write() {
    let lua = Lua::new();
    let register = extract_single_table(&lua, "nota.t").unwrap();
    let spec: Table = lua
        .load("return { label = \"\u{63d0}\u{4ea4}\u{2026}\", command = \"commit\", prompt = { label = \"\u{63d0}\u{4ea4}\u{4fe1}\u{606f}\" } }")
        .eval()
        .unwrap();
    register.call::<()>(spec).unwrap();

    assert!(crate::plugin::read_extract_single(&lua, "nota.t")[0]
        .prompt
        .is_none());
}

#[test]
fn two_character_segment_prompt_read_return_incoming() {
    let lua = Lua::new();
    let register = extract_single_table(&lua, "nota.t").unwrap();
    let spec: Table = lua
        .load(
            "return {\n                 label = \"\u{586b}\u{8eab}\u{4efd}\u{2026}\", command = \"set_identity\",\n                 prompt = { arg = \"name\", label = \"Git \u{8eab}\u{4efd}\", placeholder = \"\u{540d}\u{5b57}\u{ff0c}\u{6bd4}\u{5982}\u{ff1a}\u{5f20}\u{4e09}\",\n                            secondArg = \"email\", secondLabel = \"\u{90ae}\u{7bb1}\",\n                            secondPlaceholder = \"you@example.com\" },\n               }",
        )
        .eval()
        .unwrap();
    register.call::<()>(spec).unwrap();

    let got = crate::plugin::read_extract_single(&lua, "nota.t");
    let p = got[0]
        .prompt
        .as_ref()
        .expect("`prompt` \u{8be5}\u{8ddf}\u{7740}\u{56de}\u{6765}");
    assert_eq!(p.arg, "name");
    assert_eq!(
        p.second_arg, "email",
        "\u{7b2c}\u{4e8c}\u{4e2a}\u{503c}\u{7684}\u{952e}\u{540d}"
    );
    assert_eq!(p.second_label, "\u{90ae}\u{7bb1}");
    assert_eq!(p.second_placeholder, "you@example.com");
}

#[test]
fn base_two_character_segment_only_give_one_half_wait_and_each_give() {
    for half_boundary in [
        r#"secondArg = "email""#,
        "secondLabel = \"\u{90ae}\u{7bb1}\", secondPlaceholder = \"you@example.com\"",
    ] {
        let lua = Lua::new();
        let register = extract_single_table(&lua, "nota.t").unwrap();
        let code = format!(
            "return {{ label = \"\u{586b}\u{8eab}\u{4efd}\u{2026}\", command = \"set_identity\",\n                         prompt = {{ arg = \"name\", label = \"Git \u{8eab}\u{4efd}\", {half_boundary} }} }}"
        );
        let spec: Table = lua.load(&code).eval().unwrap();
        register.call::<()>(spec).unwrap();

        let got = crate::plugin::read_extract_single(&lua, "nota.t");
        let p = got[0]
            .prompt
            .as_ref()
            .expect("`prompt` \u{672c}\u{8eab}\u{8fd8}\u{5728}");
        assert_eq!(
            p.arg, "name",
            "\u{7b2c}\u{4e00}\u{4e2a}\u{5b57}\u{6bb5}\u{4e0d}\u{53d7}\u{5f71}\u{54cd}"
        );
        assert_eq!(
            p.second_arg, "",
            "\u{53ea}\u{7ed9}\u{4e00}\u{534a}\u{ff1a}{half_boundary}"
        );
        assert_eq!(p.second_label, "");
        assert_eq!(p.second_placeholder, "");
    }
}

fn pending_render_surface_half(body: &str) -> Lua {
    let lua = Lua::new();
    let register = surface_half_table(&lua, "nota.t").unwrap();

    let code = format!("return {{ id = 'p', title = 'P', render = function() {body} end }}");
    let spec: Table = lua.load(&code).eval().unwrap();
    register.call::<()>(spec).unwrap();
    lua
}

#[test]
fn surface_half_render_out_incoming_content_read_return_incoming() {
    let lua = pending_render_surface_half(
        "return {\n             { kind = \"heading\", text = \"main\" },\n             { kind = \"list\", items = { { title = \"a.md\", badge = \"\u{5df2}\u{4fee}\u{6539}\" } } },\n             { kind = \"buttons\", items = { { label = \"\u{5237}\u{65b0}\", command = \"refresh\" } } },\n           }",
    );

    let v = surface_half_content(&lua, "nota.t", "p").unwrap();
    let arr = v
        .as_array()
        .expect("\u{8be5}\u{662f}\u{4e00}\u{4e2a}\u{6570}\u{7ec4}");
    assert_eq!(arr.len(), 3);
    assert_eq!(arr[0]["kind"], "heading");
    assert_eq!(arr[0]["text"], "main");
    assert_eq!(arr[1]["items"][0]["badge"], "\u{5df2}\u{4fee}\u{6539}");
    assert_eq!(arr[2]["items"][0]["command"], "refresh");
}

#[test]
fn each_word_read_all_middle_new_run_one_edit_render() {
    let lua = Lua::new();
    let register = surface_half_table(&lua, "nota.t").unwrap();
    let spec: Table = lua
        .load(
            "\n            local n = 0\n            return { id = \"p\", render = function()\n                n = n + 1\n                return { { kind = \"text\", text = \"\u{7b2c} \" .. n .. \" \u{6b21}\" } }\n            end }\n            ",
        )
        .eval()
        .unwrap();
    register.call::<()>(spec).unwrap();

    for expected_2 in [
        "\u{7b2c} 1 \u{6b21}",
        "\u{7b2c} 2 \u{6b21}",
        "\u{7b2c} 3 \u{6b21}",
    ] {
        let v = surface_half_content(&lua, "nota.t", "p").unwrap();
        assert_eq!(
            v[0]["text"], expected_2,
            "render \u{6ca1}\u{6709}\u{6bcf}\u{6b21}\u{73b0}\u{8dd1}"
        );
    }
}

#[test]
fn render_run_error_is_package_is_plugin_character_record_error() {
    let lua = pending_render_surface_half("error(\"\u{78c1}\u{76d8}\u{6ee1}\u{4e86}\")");
    let err = surface_half_content(&lua, "nota.t", "p")
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("\u{78c1}\u{76d8}\u{6ee1}\u{4e86}"),
        "unexpected error: {err}"
    );
    assert!(
        err.contains("Could not render panel"),
        "expected a render-stage error: {err}"
    );
}

#[test]
fn each_has_render_surface_half_into_is_say_each_has() {
    let lua = Lua::new();
    let register = surface_half_table(&lua, "nota.t").unwrap();
    let spec = lua.create_table().unwrap();
    spec.set("id", "bare").unwrap();
    register.call::<()>(spec).unwrap();

    let err = surface_half_content(&lua, "nota.t", "bare")
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("has no `render` function"),
        "unexpected error: {err}"
    );
}

#[test]
fn each_has_surface_half_need_package_out_incoming_two_not_is_give_empty() {
    let lua = pending_render_surface_half("return {}");
    let err = surface_half_content(&lua, "nota.t", "\u{4e0d}\u{5b58}\u{5728}")
        .unwrap_err()
        .to_string();
    assert!(
        err.contains("does not declare panel"),
        "unexpected error: {err}"
    );
}

#[test]
fn render_not_is_contain_data_when_long_old_package() {
    let lua = Lua::new();
    let register = surface_half_table(&lua, "nota.t").unwrap();
    let spec: Table = lua
        .load("return { id = \"p\", render = { \"\u{6211}\u{662f}\u{4e00}\u{5f20}\u{8868}\" } }")
        .eval()
        .unwrap();
    let err = register.call::<()>(spec).unwrap_err().to_string();
    assert!(
        err.contains("requires a `render` function"),
        "unexpected error: {err}"
    );
}

#[test]
fn overflow_length_text_truncate_cut_not_batch_start_contain_character() {
    let lua = pending_render_surface_half(&format!(
        "return {{ {{ kind = \"text\", text = string.rep(\"\u{6c49}\", {}) }} }}",
        SURFACE_HALF_TEXT_UPPER_THREAD + 500
    ));
    let v = surface_half_content(&lua, "nota.t", "p").unwrap();
    let text = v[0]["text"].as_str().unwrap();
    assert_eq!(text.chars().count(), SURFACE_HALF_TEXT_UPPER_THREAD + 1, "\u{622a}\u{65ad}\u{957f}\u{5ea6}\u{4e0d}\u{5bf9}\u{ff08}+1 \u{662f}\u{90a3}\u{4e2a}\u{7701}\u{7565}\u{53f7}\u{ff09}");
    assert!(
        text.ends_with('\u{2026}'),
        "\u{622a}\u{65ad}\u{8be5}\u{7559}\u{4e2a}\u{8bb0}\u{53f7}\u{ff1a}{}",
        &text[..10]
    );
    assert!(
        text.chars().all(|c| c == '\u{6c49}' || c == '\u{2026}'),
        "\u{6c49}\u{5b57}\u{88ab}\u{5288}\u{5f00}\u{4e86}"
    );
}

#[test]
fn passed_not_json_value_edit_success_null() {
    let lua = pending_render_surface_half(
        r#"return { { kind = "text", text = "x", cb = function() end } }"#,
    );
    let v = surface_half_content(&lua, "nota.t", "p").unwrap();
    assert!(
        v[0]["cb"].is_null(),
        "\u{51fd}\u{6570}\u{8be5}\u{53d8}\u{6210} null\u{ff0c}\u{5b9e}\u{9645}\u{662f} {}",
        v[0]["cb"]
    );
    assert_eq!(v[0]["text"], "x", "\u{540c}\u{4e00}\u{4e2a}\u{8868}\u{91cc}\u{522b}\u{7684}\u{5b57}\u{6bb5}\u{4e0d}\u{8be5}\u{53d7}\u{5f71}\u{54cd}");
}

#[test]
fn character_infer_use_table_not_return_large_stream_expand() {
    let lua = pending_render_surface_half(r#"local t = { kind = "text" }; t.me = t; return { t }"#);
    let v = surface_half_content(&lua, "nota.t", "p").unwrap();

    let mut cur = &v[0]["me"];
    let mut layer = 0;
    while !cur.is_null() {
        cur = &cur["me"];
        layer += 1;
        assert!(
            layer <= SURFACE_HALF_LAYER_DATA_UPPER_THREAD + 2,
            "\u{9012}\u{5f52}\u{6ca1}\u{6709}\u{505c}\u{4e0b}\u{6765}"
        );
    }
    assert!(
        layer > 1,
        "\u{81f3}\u{5c11}\u{8be5}\u{5f80}\u{4e0b}\u{8d70}\u{51e0}\u{5c42}\u{624d}\u{5bf9}"
    );
}

#[test]
fn one_layer_item_data_has_upper_thread() {
    let lua = pending_render_surface_half(&format!(
        r#"local items = {{}}
           for i = 1, {} do items[i] = {{ title = "x" }} end
           return {{ {{ kind = "list", items = items }} }}"#,
        SURFACE_HALF_NODE_UPPER_THREAD + 50
    ));
    let v = surface_half_content(&lua, "nota.t", "p").unwrap();
    assert_eq!(
        v[0]["items"].as_array().unwrap().len(),
        SURFACE_HALF_NODE_UPPER_THREAD
    );
}

#[test]
fn network_surface_half_node_data_group_is_use_more_height_convert_use_upper_thread() {
    let lua = pending_render_surface_half(&format!(
        r#"local nodes = {{}}
           for i = 1, {} do nodes[i] = {{ id = tostring(i), label = "x" }} end
           return {{ {{ kind = "network", nodes = nodes, edges = {{}} }} }}"#,
        NETWORK_METADATA_SPEED_UPPER_THREAD + 50
    ));
    let v = surface_half_content(&lua, "nota.t", "p").unwrap();
    assert_eq!(
        v[0]["nodes"].as_array().unwrap().len(),
        NETWORK_METADATA_SPEED_UPPER_THREAD,
        "network nodes should use the graph-specific limit"
    );
}

#[test]
fn need_position_handle_must_source_text_still_length_old_source_sample_give_return() {
    assert_eq!(get_position_handle("\u{77ed}", 10), "\u{77ed}");
    assert_eq!(get_position_handle("", 10), "");
    assert_eq!(
        get_position_handle("\u{6b63}\u{597d}\u{4e94}\u{4e2a}\u{5b57}", 5),
        "\u{6b63}\u{597d}\u{4e94}\u{4e2a}\u{5b57}"
    );
}

#[test]
fn get_position_handle_by_character_service_not_by_character_boundary() {
    let source_text =
        "\u{4e00}\u{4e8c}\u{4e09}\u{56db}\u{4e94}\u{516d}\u{4e03}\u{516b}\u{4e5d}\u{5341}";
    assert_eq!(
        get_position_handle(source_text, 3),
        "\u{516b}\u{4e5d}\u{5341}"
    );

    assert_eq!(get_position_handle(source_text, 3).chars().count(), 3);
}

#[test]
fn is_is_upper_thread_is_small_data_two_record() {
    assert_eq!(IS_IS_UPPER_THREAD, 8000);
    assert!(
        IS_IS_UPPER_THREAD < 20_000,
        "\u{5f97}\u{6bd4}\u{6536}\u{5de5}\u{65f6}\u{90a3}\u{6761}\u{8def}\u{5c0f}"
    );
}
