use super::*;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

fn test_root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "nota-settings-import-{name}-{}-{}",
        std::process::id(),
        unique_stamp()
    ));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).unwrap();
    root
}

fn package_with(root: &Path, files: &[(&str, &[u8])]) -> PathBuf {
    let package = root.join("settings.nota-backup");
    let mut writer = ZipWriter::new(File::create(&package).unwrap());
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let records = files
        .iter()
        .map(|(path, bytes)| {
            serde_json::json!({
                "path": path,
                "bytes": bytes.len(),
            })
        })
        .collect::<Vec<_>>();
    let manifest = serde_json::json!({
        "format": FORMAT,
        "schema": SCHEMA,
        "app_version": "0.18.0-beta",
        "created_at_epoch": 1,
        "files": records,
    });
    writer.start_file("manifest.json", options).unwrap();
    writer
        .write_all(serde_json::to_string(&manifest).unwrap().as_bytes())
        .unwrap();
    for (path, bytes) in files {
        writer.start_file(*path, options).unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap();
    package
}

fn test_paths(root: &Path) -> PackagePaths {
    PackagePaths {
        config: root.join("config"),
        data: root.join("data"),
    }
}

#[test]
fn import_restores_files_and_creates_a_backup() {
    let root = test_root("restore");
    let paths = test_paths(&root);
    fs::create_dir_all(&paths.config).unwrap();
    fs::write(
        paths.config.join("settings.toml"),
        "strict_markdown = false\n",
    )
    .unwrap();
    let package = package_with(
        &root,
        &[
            (
                "program/settings.toml",
                b"strict_markdown = true\nui_style = \"adwaita\"\nui_mode = \"dark\"\n",
            ),
            ("themes/demo/theme.css", b":root { color: black; }\n"),
        ],
    );
    let mut prepared = prepare_with_paths(
        &ImportRequest {
            package: package.display().to_string(),
            include: vec!["settings".into(), "themes".into()],
        },
        &paths,
    )
    .unwrap();
    prepared.commit().unwrap();
    let report = prepared.finish();

    assert!(!report.restart_required);
    assert!(report.settings.as_ref().unwrap().strict_markdown);
    assert!(paths
        .config
        .join("themes/document/demo/theme.css")
        .is_file());
    assert!(Path::new(&report.backup).join("settings").is_file());
    cleanup_directory(&root);
}

#[test]
fn path_traversal_and_unknown_entries_are_rejected() {
    let root = test_root("traversal");
    let paths = test_paths(&root);
    let traversal = package_with(&root, &[("../outside", b"x")]);
    assert!(validate(&traversal.display().to_string(), &paths).is_err());

    let unknown_root = test_root("unknown");
    let unknown_paths = test_paths(&unknown_root);
    let unknown = package_with(&unknown_root, &[("other/file", b"x")]);
    assert!(validate(&unknown.display().to_string(), &unknown_paths).is_err());
    cleanup_directory(&root);
    cleanup_directory(&unknown_root);
}

#[test]
fn sensitive_plugin_data_is_not_selected_by_default() {
    let root = test_root("sensitive");
    let paths = test_paths(&root);
    let package = package_with(
        &root,
        &[
            ("plugins/nota.ai/settings.toml", b"key = \"secret\"\n"),
            ("plugins/nota.ai/data/history.txt", b"private\n"),
        ],
    );
    let inventory = validate(&package.display().to_string(), &paths)
        .unwrap()
        .inventory;
    assert_eq!(inventory.items.len(), 2);
    assert!(inventory.items.iter().all(|item| item.sensitive));
    cleanup_directory(&root);
}

#[test]
fn extension_package_is_inspected_and_staged_separately() {
    let root = test_root("extension-package");
    let paths = test_paths(&root);
    let package = package_with(
        &root,
        &[(
            "plugins/nota.demo/package/nota.demo-1.0.0.nota-plugin",
            b"package-bytes",
        )],
    );
    let inventory = validate(&package.display().to_string(), &paths)
        .unwrap()
        .inventory;
    assert_eq!(inventory.items.len(), 1);
    assert_eq!(inventory.items[0].id, "plugin-package:nota.demo");

    let prepared = prepare_with_paths(
        &ImportRequest {
            package: package.display().to_string(),
            include: vec!["plugin-package:nota.demo".into()],
        },
        &paths,
    )
    .unwrap();
    let staged = prepared.plugin_packages();
    assert_eq!(staged.len(), 1);
    assert_eq!(staged[0].id, "nota.demo");
    assert_eq!(fs::read(&staged[0].path).unwrap(), b"package-bytes");
    drop(prepared);
    cleanup_directory(&root);
}

#[test]
fn embedded_bootstrap_is_applied_only_once() {
    let root = test_root("embedded-bootstrap");
    let paths = test_paths(&root);
    let resource = root.join("resource");
    let distribution = resource.join("distribution");
    fs::create_dir_all(&distribution).unwrap();
    let package = package_with(
        &root,
        &[
            (
                "program/settings.toml",
                b"document_theme = \"org-theme\"\n[general]\nonboarding_seen = false\n",
            ),
            ("themes/org-theme/theme.css", b":root { color: black; }\n"),
        ],
    );
    fs::copy(&package, distribution.join("bootstrap.nota-backup")).unwrap();
    fs::write(
        distribution.join("distribution.json"),
        serde_json::json!({
            "id": "test-org",
            "bootstrap": {
                "revision": 1,
                "allowExtensionSettings": false
            },
            "resources": {
                "bootstrap": "bootstrap.nota-backup"
            }
        })
        .to_string(),
    )
    .unwrap();

    assert!(apply_embedded_bootstrap_with_paths(&resource, &paths)
        .unwrap()
        .is_some());
    let settings_path = paths.config.join("settings.toml");
    let installed = fs::read_to_string(&settings_path).unwrap();
    assert!(installed.contains("org-theme"));
    assert!(paths
        .config
        .join("themes/document/org-theme/theme.css")
        .is_file());

    fs::write(&settings_path, "document_theme = \"user-theme\"\n").unwrap();
    assert!(apply_embedded_bootstrap_with_paths(&resource, &paths)
        .unwrap()
        .is_none());
    assert_eq!(
        fs::read_to_string(&settings_path).unwrap(),
        "document_theme = \"user-theme\"\n"
    );
    cleanup_directory(&root);
}
