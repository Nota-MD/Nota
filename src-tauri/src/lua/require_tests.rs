use super::*;

fn plugin_directory(name: &str) -> std::path::PathBuf {
    let position_one = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let directory_2 = std::env::temp_dir().join(format!(
        "nota-require-{name}-{}-{position_one}",
        std::process::id()
    ));
    std::fs::create_dir_all(&directory_2)
        .expect("\u{5efa}\u{4e34}\u{65f6}\u{62d3}\u{5c55}\u{76ee}\u{5f55}");
    directory_2
}

fn receive_probe(directory_2: &std::path::Path) {
    let _ = std::fs::remove_dir_all(directory_2);
}

fn pending_require_sandbox_item(name: &str) -> (Lua, std::path::PathBuf) {
    let lua =
        should_render_lua().expect("\u{6c99}\u{7bb1}\u{8be5}\u{5efa}\u{5f97}\u{8d77}\u{6765}");
    let directory_2 = plugin_directory(name);
    install_require(&lua, &directory_2).expect("\u{88c5} require");
    (lua, directory_2)
}

fn write_suffix_block(root_2: &std::path::Path, item_pair: &str, source: &str) {
    let p = root_2.join(item_pair);
    if let Some(service) = p.parent() {
        std::fs::create_dir_all(service).expect("\u{5efa}\u{5b50}\u{76ee}\u{5f55}");
    }
    std::fs::write(&p, source).expect("\u{5199}\u{6a21}\u{5757}");
}

fn need(lua: &Lua, name: &str) -> mlua::Value {
    let f: mlua::Function = lua
        .globals()
        .get("require")
        .expect("`require` \u{8be5}\u{88c5}\u{4e0a}\u{4e86}");
    f.call(name.to_owned())
        .expect("\u{8fd9}\u{6b21} require \u{4e0d}\u{8be5}\u{629b}")
}

fn need_error(lua: &Lua, name: &str) -> String {
    let f: mlua::Function = lua
        .globals()
        .get("require")
        .expect("`require` \u{8be5}\u{88c5}\u{4e0a}\u{4e86}");
    f.call::<mlua::Value>(name.to_owned())
        .expect_err("\u{8fd9}\u{6b21} require \u{8be5}\u{629b}")
        .to_string()
}

#[test]
fn require_person_two_middle_write_method() {
    let (lua, root_2) = pending_require_sandbox_item("\u{4e24}\u{79cd}\u{5199}\u{6cd5}");
    write_suffix_block(&root_2, "chart.lua", r#"return { name = "chart" }"#);
    write_suffix_block(&root_2, "ui/palette.lua", r#"return { fg = '#fff' }"#);

    write_suffix_block(&root_2, "kit/init.lua", "return { kind = \"\u{5305}\" }");

    let value_4 = need(&lua, "chart");
    let value_4 = value_4
        .as_table()
        .expect("`chart` \u{8be5}\u{7ed9}\u{4e00}\u{5f20}\u{8868}");
    assert_eq!(value_4.get::<String>("name").unwrap(), "chart");

    let value_2 = need(&lua, "ui.palette");
    let value_2 = value_2
        .as_table()
        .expect("`ui.palette` \u{8be5}\u{7ed9}\u{4e00}\u{5f20}\u{8868}");
    assert_eq!(value_2.get::<String>("fg").unwrap(), "#fff");

    let and = need(&lua, "kit");
    let and = and
        .as_table()
        .expect("`kit` \u{8be5}\u{7ed9}\u{4e00}\u{5f20}\u{8868}");
    assert_eq!(and.get::<String>("kind").unwrap(), "\u{5305}");

    receive_probe(&root_2);
}

#[test]
fn require_only_run_one_word_base_two_word_provided_is_same_one_table() {
    let (lua, root_2) = pending_require_sandbox_item("\u{53ea}\u{8dd1}\u{4e00}\u{6b21}");

    write_suffix_block(
        &root_2,
        "counter.lua",
        "_G.__n = (_G.__n or 0) + 1\nreturn { n = _G.__n }",
    );

    let one = need(&lua, "counter");
    let one = one
        .as_table()
        .expect("\u{8be5}\u{7ed9}\u{4e00}\u{5f20}\u{8868}")
        .clone();
    let two = need(&lua, "counter");
    let two = two
        .as_table()
        .expect("\u{8be5}\u{7ed9}\u{4e00}\u{5f20}\u{8868}")
        .clone();

    assert_eq!(
        two.get::<i64>("n").unwrap(),
        1,
        "\u{6a21}\u{5757}\u{88ab}\u{6c42}\u{503c}\u{4e86}\u{4e24}\u{904d}"
    );

    one.set("\u{540e}\u{6765}\u{52a0}\u{7684}", 42i64).unwrap();
    assert_eq!(
        two.get::<i64>("\u{540e}\u{6765}\u{52a0}\u{7684}").unwrap(),
        42,
        "\u{4e24}\u{6b21}\u{62ff}\u{5230}\u{7684}\u{4e0d}\u{662f}\u{540c}\u{4e00}\u{4e2a}\u{8868}"
    );

    receive_probe(&root_2);
}

#[test]
fn require_deep_all_not_reverse_return_is_base_two_word_give_true() {
    let (lua, root_2) = pending_require_sandbox_item("\u{8fd4}\u{56de}\u{7a7a}");
    write_suffix_block(&root_2, "empty.lua", "local x = 1");

    let receive = need(&lua, "empty");
    assert!(receive.is_nil(), "\u{7b2c}\u{4e00}\u{6b21}\u{8be5}\u{662f} `nil`\u{ff08}\u{6a21}\u{5757}\u{6ca1}\u{6709}\u{8fd4}\u{56de}\u{503c}\u{ff09}");

    let two = need(&lua, "empty");
    assert!(
        matches!(two, mlua::Value::Boolean(true)),
        "\u{7b2c}\u{4e8c}\u{6b21}\u{8be5}\u{7ed9} `true`\u{ff0c}\u{5b9e}\u{9645}\u{ff1a}{two:?}"
    );

    receive_probe(&root_2);
}

#[test]
fn require_name_not_and_method_only_boundary_sentence() {
    let (lua, root_2) = pending_require_sandbox_item("\u{540d}\u{5b57}");
    for broken in [
        "",
        "   ",
        "/etc/passwd",
        "../\u{5916}\u{9762}",
        "a/../../\u{5916}\u{9762}",
        "a..b",
        "\u{6709}\u{4e2d}\u{6587}",
        "a b",
        "a;b",
        "a$b",
        "a\\b",
    ] {
        let render = need_error(&lua, broken);
        assert!(
            render.contains("Invalid require name"),
            "`{broken}` should be rejected by the name check, got: {render}"
        );
    }
    receive_probe(&root_2);
}

#[test]
fn require_soft_link_escape_not_out_plugin_directory() {
    let (lua, root_2) = pending_require_sandbox_item("\u{8f6f}\u{94fe}");
    let wai_surface = root_2
        .parent()
        .expect("\u{4e34}\u{65f6}\u{76ee}\u{5f55}\u{8be5}\u{6709}\u{7239}")
        .join(format!(
            "nota-require-\u{5077}\u{6765}\u{7684}-{}.lua",
            std::process::id()
        ));
    std::fs::write(&wai_surface, "return { \u{5077}\u{6765}\u{7684} = true }")
        .expect("\u{5199}\u{5916}\u{9762}\u{7684}\u{6587}\u{4ef6}");

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&wai_surface, root_2.join("link.lua"))
            .expect("\u{5efa}\u{8f6f}\u{94fe}");
        let render = need_error(&lua, "link");
        assert!(
            render.contains("resolves outside the workspace"),
            "the symlink should be rejected by resolve_in, got: {render}"
        );
    }

    let _ = std::fs::remove_file(&wai_surface);
    receive_probe(&root_2);
}

#[test]
fn require_convert_full_package_is_person_render() {
    let (lua, root_2) = pending_require_sandbox_item("\u{8f6c}\u{5708}");
    write_suffix_block(&root_2, "a.lua", r#"return require("b")"#);
    write_suffix_block(&root_2, "b.lua", r#"return require("a")"#);

    let render = need_error(&lua, "a");
    assert!(render.contains("\u{8f6c}\u{5708}"), "\u{5faa}\u{73af}\u{4f9d}\u{8d56}\u{8be5}\u{7ed9}\u{4eba}\u{8bdd}\u{ff0c}\u{5b9e}\u{9645}\u{ff1a}{render}");

    let render_2 = need_error(&lua, "a");
    assert!(render_2.contains("\u{8f6c}\u{5708}"), "\u{7b2c}\u{4e8c}\u{6b21}\u{8be5}\u{662f}\u{540c}\u{4e00}\u{53e5}\u{8bdd}\u{ff0c}\u{5b9e}\u{9645}\u{ff1a}{render_2}");

    receive_probe(&root_2);
}

#[test]
fn require_find_not_to_is_render_inner_has_thread_lock() {
    let (lua, root_2) = pending_require_sandbox_item("\u{627e}\u{4e0d}\u{5230}");
    write_suffix_block(&root_2, "there.lua", "return 1");

    let render = need_error(&lua, "missing");
    assert!(render.contains("missing.lua"), "\u{8be5}\u{8bf4}\u{51fa}\u{8bd5}\u{8fc7}\u{54ea}\u{4e2a}\u{6587}\u{4ef6}\u{540d}\u{ff1a}{render}");
    assert!(
        render.contains("init.lua"),
        "\u{4e24}\u{79cd}\u{5199}\u{6cd5}\u{90fd}\u{8be5}\u{63d0}\u{5230}\u{ff1a}{render}"
    );
    assert!(
        render.contains("inside the extension directory"),
        "expected the module search scope: {render}"
    );

    write_suffix_block(&root_2, "native.so", "");
    let render_2 = need_error(&lua, "native");
    assert!(
        render_2.contains("was not found as"),
        "`.so` must not be require-able: {render_2}"
    );

    receive_probe(&root_2);
}

#[test]
fn not_upper_require_not_wait_and_handle_package_install_return_incoming() {
    let (lua, root_2) = pending_require_sandbox_item("\u{5305}");
    for name_2 in ["package", "io", "os", "debug", "loadfile", "dofile"] {
        let v: mlua::Value = lua.globals().get(name_2).unwrap();
        assert!(
            v.is_nil(),
            "`{name_2}` \u{4e0d}\u{8be5}\u{8ddf}\u{7740} `require` \u{4e00}\u{8d77}\u{56de}\u{6765}\u{2014}\u{2014}\u{8865}\u{7684}\u{662f}**\u{4e00}\u{4e2a}\u{51fd}\u{6570}**\u{ff0c}\
             \u{4e0d}\u{662f}\u{90a3}\u{4e2a}\u{6807}\u{51c6}\u{5e93}\u{ff08}BUG-10 \u{7684}\u{95f8}\u{4e0d}\u{80fd}\u{62c6}\u{ff09}"
        );
    }

    let r: mlua::Value = lua.globals().get("require").unwrap();
    assert!(!r.is_nil(), "`require` \u{8be5}\u{88c5}\u{4e0a}\u{2014}\u{2014}\u{7528}\u{4f8b}\u{672c}\u{8eab}\u{7684}\u{524d}\u{63d0}\u{6ca1}\u{4e86}");

    receive_probe(&root_2);
}
