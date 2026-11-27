use super::*;

pub(crate) fn write_manifest(dir: &Path, body: &str) {
    std::fs::create_dir_all(dir).unwrap();
    std::fs::write(dir.join("plugin.toml"), body).unwrap();
}

#[test]
fn ok_manifest_can_parse_out_can_inner() {
    let dir = std::env::temp_dir().join("nota-manifest-good");
    let _ = std::fs::remove_dir_all(&dir);
    write_manifest(
        &dir,
        r#"
[plugin]
id = "nota.git"
name = "Git"
    api = "v2.4"
capabilities = ["document.read", "process.git"]
"#,
    );

    let m = Manifest::load(&dir.join("plugin.toml")).unwrap();
    assert_eq!(m.meta.id, "nota.git");
    assert_eq!(
        m.meta.entry, "main.lua",
        "entry \u{8be5}\u{6709}\u{9ed8}\u{8ba4}\u{503c}"
    );
    assert!(m.has(Capability::ProcessGit));
    assert!(!m.has(Capability::NetworkHttp));

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn same_to_name_inner_point_need_replace_success_link_character_service() {
    assert_eq!(channel_id("nota.git"), "nota-git");
    assert_eq!(channel_id("nota.ai"), "nota-ai");

    assert_eq!(channel_id("a_b-c"), "a_b-c");

    for id in [
        "nota.git",
        "a.b.c",
        "x/y",
        "\u{5e26}\u{4e2d}\u{6587}\u{7684}",
    ] {
        let c = channel_id(id);
        assert!(
            c.chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'),
            "`{id}` \u{5f52}\u{4e00}\u{540e}\u{4ecd}\u{6709}\u{4e0d}\u{5408}\u{6cd5}\u{5b57}\u{7b26}\u{ff1a}{c}"
        );
    }
}

#[test]
fn api_half_current_not_service_need_sentence_at() {
    let dir = std::env::temp_dir().join("nota-manifest-apimismatch");
    let _ = std::fs::remove_dir_all(&dir);
    write_manifest(
        &dir,
        "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = \"v3.0\"\n",
    );

    let err = Manifest::load(&dir.join("plugin.toml")).unwrap_err();
    match err {
        NotaError::PluginApiMismatch { wanted, have, .. } => {
            assert_eq!(wanted, "v3.0");
            assert_eq!(have, NOTA_PLUGIN_API_VERSION.to_string());
        }
        other => panic!("actual: {other}"),
    }

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn api_minor_compatibility_is_one_way() {
    let dir = std::env::temp_dir().join("nota-manifest-api-minor");
    let _ = std::fs::remove_dir_all(&dir);
    write_manifest(
        &dir,
        "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = \"v2.2\"\n",
    );
    assert!(Manifest::load(&dir.join("plugin.toml")).is_ok());

    write_manifest(
        &dir,
        "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = \"v2.6\"\n",
    );
    assert!(Manifest::load(&dir.join("plugin.toml")).is_err());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn incompatible_directory_manifest_can_be_identified_without_being_accepted() {
    let dir = std::env::temp_dir().join("nota-manifest-api-identified");
    let _ = std::fs::remove_dir_all(&dir);
    write_manifest(
        &dir,
        "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = \"v3.0\"\n",
    );
    let path = dir.join("plugin.toml");
    assert!(Manifest::load(&path).is_err());
    let manifest = Manifest::load_unchecked(&path).unwrap();
    assert_eq!(manifest.meta.id, "x.y");
    assert_eq!(manifest.meta.api.to_string(), "v3.0");
    assert!(!NOTA_PLUGIN_API_VERSION.supports(manifest.meta.api));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn legacy_numeric_api_is_read_as_minor_zero() {
    let dir = std::env::temp_dir().join("nota-manifest-api-legacy");
    let _ = std::fs::remove_dir_all(&dir);
    write_manifest(&dir, "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = 2\n");
    let manifest = Manifest::load(&dir.join("plugin.toml")).unwrap();
    assert_eq!(manifest.meta.api, PluginApiVersion::new(2, 0));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn entry_not_required_escape_out_plugin_directory() {
    let dir = std::env::temp_dir().join("nota-manifest-escape");
    let _ = std::fs::remove_dir_all(&dir);
    write_manifest(
        &dir,
        "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = \"v2.3\"\nentry = \"../../evil.lua\"\n",
    );

    assert!(Manifest::load(&dir.join("plugin.toml")).is_err());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn not_person_is_can_inner_need_package_error_two_not_is_static_suffix_call_ignore() {
    let dir = std::env::temp_dir().join("nota-manifest-unknowncap");
    let _ = std::fs::remove_dir_all(&dir);
    write_manifest(
        &dir,
        "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = \"v2.3\"\ncapabilities = [\"fs.everything\"]\n",
    );

    let err = Manifest::load(&dir.join("plugin.toml")).unwrap_err();
    assert!(
        err.to_string().contains("fs.everything"),
        "\u{5b9e}\u{9645}\u{ff1a}{err}"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn point_start_header_directory_not_when_plugin() {
    let dir = std::env::temp_dir().join("nota-manifest-dotdir");
    let _ = std::fs::remove_dir_all(&dir);
    write_manifest(
        &dir.join("a.b"),
        "[plugin]\nid = \"a.b\"\nname = \"A\"\napi = \"v2.3\"\n",
    );
    write_manifest(
        &dir.join(".\u{88c5}\u{5230}\u{4e00}\u{534a}-1"),
        "[plugin]\nid = \"a.b\"\nname = \"A\"\napi = \"v2.3\"\n",
    );

    let find_to = find_manifests(&dir);
    assert_eq!(
        find_to.len(),
        1,
        "\u{5b9e}\u{9645}\u{627e}\u{5230}\u{ff1a}{find_to:?}"
    );
    assert!(
        find_to[0].ends_with("a.b/plugin.toml"),
        "\u{5b9e}\u{9645}\u{ff1a}{:?}",
        find_to[0]
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn update_manifest_must_required_is_https_active_current_record_return_replace() {
    let dir = std::env::temp_dir().join("nota-manifest-update-url");
    let _ = std::fs::remove_dir_all(&dir);
    write_manifest(
        &dir,
        r#"
[plugin]
id = "x.y"
name = "X"
api = "v2.3"

[update]
manifest = "http://example.com/latest.json"
"#,
    );
    assert!(Manifest::load(&dir.join("plugin.toml")).is_err());

    write_manifest(
        &dir,
        r#"
[plugin]
id = "x.y"
name = "X"
api = "v2.3"

[update]
manifest = "https://example.com/latest.json"
"#,
    );
    let manifest = Manifest::load(&dir.join("plugin.toml")).unwrap();
    assert!(manifest.update.is_some());
    let _ = std::fs::remove_dir_all(&dir);
}
