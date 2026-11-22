use super::*;

fn temp_root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "nota-typora-theme-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn imports_flat_directory_without_rewriting_its_css() {
    let root = temp_root("directory");
    let source = "#write { --doc-bg: white; }\n";
    std::fs::write(root.join("paper.css"), source).unwrap();
    std::fs::write(
        root.join("paper-dark.css"),
        "@import \"./paper.css\";\n:root { --doc-bg: black; }",
    )
    .unwrap();
    std::fs::write(root.join("notes.css"), "p { color: black; }").unwrap();
    let installed = root.join("installed");
    let report = install_source(&root, &installed).unwrap();

    let collection = collection_id(&root);
    assert_eq!(
        report.document,
        vec![
            theme_id(&collection, "paper.css"),
            theme_id(&collection, "paper-dark.css"),
        ]
    );
    let package = installed.join(&collection);
    assert_eq!(
        std::fs::read_to_string(package.join("paper.css")).unwrap(),
        source
    );
    assert!(!package.join("theme.css").exists());
    let manifest = read_manifest(&package).unwrap();
    assert_eq!(manifest.themes[0].name, "paper");
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn imports_one_css_with_only_its_dependencies() {
    let root = temp_root("single-css");
    std::fs::create_dir_all(root.join("parts")).unwrap();
    std::fs::create_dir_all(root.join("images")).unwrap();
    std::fs::write(root.join("parts/base.css"), "body { color: black; }\n").unwrap();
    std::fs::write(root.join("images/bg.png"), [0, 1, 2, 3]).unwrap();
    std::fs::write(
        root.join("theme.css"),
        "@import \"parts/base.css\";\n:root { --doc-bg: white; background: url(images/bg.png); }\n",
    )
    .unwrap();
    std::fs::write(
        root.join("unrelated-large-download.bin"),
        vec![0; 1024 * 1024],
    )
    .unwrap();

    let installed = root.join("installed");
    let report = install_source(&root.join("theme.css"), &installed).unwrap();
    assert_eq!(report.document.len(), 1);
    let package = installed.join(collection_id(&root));
    assert!(package.join("theme.css").is_file());
    assert!(package.join("parts/base.css").is_file());
    assert!(package.join("images/bg.png").is_file());
    assert!(!package.join("unrelated-large-download.bin").exists());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn imports_one_ui_css_into_the_ui_theme_root() {
    let root = temp_root("single-ui-css");
    std::fs::create_dir_all(root.join("images")).unwrap();
    std::fs::write(root.join("images/close.svg"), "<svg/>").unwrap();
    std::fs::write(
        root.join("my-ui.css"),
        "[data-ui-style=\"my-ui\"] { --icon-close: url(images/close.svg); }\n",
    )
    .unwrap();
    std::fs::write(
        root.join("unrelated-large-download.bin"),
        vec![0; 1024 * 1024],
    )
    .unwrap();

    let ui_root = root.join("ui-installed");
    let document_root = root.join("document-installed");
    let report = install_source_bundle(&root.join("my-ui.css"), &ui_root, &document_root).unwrap();
    assert_eq!(report.ui, vec!["my-ui"]);
    assert!(report.document.is_empty());
    assert!(ui_root.join("my-ui/theme.css").is_file());
    assert!(ui_root.join("my-ui/images/close.svg").is_file());
    assert!(!document_root.join("my-ui").exists());
    assert!(!ui_root.join("my-ui/unrelated-large-download.bin").exists());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn does_not_list_user_overrides_as_themes() {
    let root = temp_root("user-override");
    std::fs::write(
        root.join("paper.css"),
        "@import \"paper.user.css\";\n#write { --doc-bg: white; }",
    )
    .unwrap();
    std::fs::write(
        root.join("paper.user.css"),
        "#write { --text-color: black; }",
    )
    .unwrap();
    let installed = root.join("installed");
    let report = install_source(&root, &installed).unwrap();
    assert_eq!(report.document.len(), 1);
    let package = installed.join(collection_id(&root));
    let css = load_runtime_css(&package.join("paper.css")).unwrap();
    assert!(css.contains("--text-color: black"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn runtime_expands_imports_and_inlines_relative_assets() {
    let root = temp_root("runtime");
    std::fs::create_dir_all(root.join("fonts")).unwrap();
    std::fs::write(root.join("fonts/base.css"), "p { color: red; }").unwrap();
    std::fs::write(root.join("assets.svg"), "<svg/>").unwrap();
    std::fs::write(
        root.join("demo.css"),
        "@import url(\"./fonts/base.css\");\n#write { background: url(./assets.svg); }",
    )
    .unwrap();
    let css = load_runtime_css(&root.join("demo.css")).unwrap();
    assert!(css.find("color: red").unwrap() < css.find("--doc-bg").unwrap_or(usize::MAX));
    assert!(css.contains("data:image/svg+xml;base64"));
    assert!(!css.contains("@import"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn runtime_ignores_missing_optional_imports() {
    let root = temp_root("optional-import");
    std::fs::write(
        root.join("theme.css"),
        "@import \"theme.user.css\";\n@import \"missing.user.css\";\n#write { --doc-bg: white; }",
    )
    .unwrap();
    std::fs::write(
        root.join("theme.user.css"),
        "#write { --text-color: black; }",
    )
    .unwrap();
    let css = load_runtime_css(&root.join("theme.css")).unwrap();
    assert!(css.contains("--text-color: black"));
    assert!(css.contains("--doc-bg: white"));
    assert!(!css.contains("@import"));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn imports_flat_typora_zip_without_conversion() {
    let root = temp_root("zip");
    let archive = root.join("theme.zip");
    {
        let file = std::fs::File::create(&archive).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("wrapper/paper.css", options).unwrap();
        zip.write_all(b"#write { --doc-bg: white; }\n").unwrap();
        zip.start_file("wrapper/fonts/face.woff2", options).unwrap();
        zip.write_all(b"font").unwrap();
        zip.finish().unwrap();
    }
    let installed = root.join("installed");
    let report = install_zip(&archive, &root.join("ui-installed"), &installed).unwrap();
    assert_eq!(report.document.len(), 1);
    let package = installed.join(collection_id(&root.join("wrapper")));
    assert_eq!(
        std::fs::read_to_string(package.join("paper.css")).unwrap(),
        "#write { --doc-bg: white; }\n"
    );
    assert_eq!(
        std::fs::read(package.join("fonts/face.woff2")).unwrap(),
        b"font"
    );
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn prefers_embedded_font_data_and_drops_local_fallback() {
    let css = "@font-face { src: url(\"./font.otf\") format(\"opentype\"), url(\"data:font/woff2;base64,AA\") format(\"woff2\"); }";
    let simplified = simplify_font_sources(css);
    assert!(!simplified.contains("font.otf"));
    assert!(simplified.contains("data:font/woff2"));
}

#[test]
fn audits_external_theme_paths_from_environment() {
    let Some(paths) = std::env::var_os("NOTA_TYPO_AUDIT_PATHS") else {
        return;
    };
    let installed = temp_root("external-audit");
    for path in std::env::split_paths(&paths) {
        match install_source(&path, &installed) {
            Ok(report) => {
                for id in report.document {
                    let package = installed.join(collection_id(&path));
                    let manifest = read_manifest(&package).unwrap();
                    let theme = manifest.themes.iter().find(|theme| theme.id == id).unwrap();
                    let css = load_runtime_css(&package.join(&theme.css)).unwrap();
                    let font_faces = css.matches("@font-face").count();
                    let data_urls = css.matches("url(\"data:").count()
                        + css.matches("url(data:").count()
                        + css.matches("url('data:").count();
                    let imports = css.matches("@import").count();
                    println!(
                        "AUDIT\t{}\t{}\tbytes={}\tfont_faces={font_faces}\tdata_urls={data_urls}\timports={imports}",
                        path.display(),
                        id,
                        css.len()
                    );
                }
            }
            Err(error) => panic!("{}: {error}", path.display()),
        }
    }
    let _ = std::fs::remove_dir_all(installed);
}
