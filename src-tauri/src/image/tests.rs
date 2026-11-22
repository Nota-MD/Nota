use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};

use super::target::extract_name_from_address;
use super::*;
use crate::settings::image::InsertImageAction as A;

fn default_rule() -> InsertionRule {
    InsertionRule {
        action: A::None,
        apply_to_local: true,
        apply_to_remote: false,
        custom_dir: String::new(),
        prefer_relative: false,
        add_dot_slash: false,
        escape_url: false,
    }
}

fn document_directory() -> PathBuf {
    PathBuf::from("/home/u/\u{6587}\u{6863}")
}

fn filename_2(p: &Path) -> String {
    p.file_name().unwrap().to_string_lossy().to_string()
}

#[test]
fn network_address_only_person_http_and_https() {
    assert!(is_network_address("https://a/b.png"));
    assert!(is_network_address("HTTP://A/B.PNG"));
    assert!(is_network_address("  http://a/b  "));

    assert!(!is_network_address("data:image/png;base64,AAAA"));
    assert!(!is_network_address("//cdn.example.com/a.png"));
    assert!(!is_network_address("./img/a.png"));
    assert!(!is_network_address("/home/u/a.png"));
}

#[test]
fn convert_one_not_touch_middle_text_single_return_receive_is_empty() {
    assert_eq!(
        encode_markdown_address("\u{56fe} \u{7247}.png", false),
        "\u{56fe}%20\u{7247}.png"
    );
    assert_eq!(encode_markdown_address("a\"b.png", false), "a%22b.png");
    assert_eq!(encode_markdown_address("a<b>c.png", false), "a%3Cb%3Ec.png");
    assert_eq!(
        encode_markdown_address("\u{5e26}`\u{53cd}\u{5f15}\u{53f7}`.png", false),
        "\u{5e26}%60\u{53cd}\u{5f15}\u{53f7}%60.png"
    );

    assert_eq!(
        encode_markdown_address("\u{7b14}\u{8bb0}-\u{2460}\u{1f34e}.png", false),
        "\u{7b14}\u{8bb0}-\u{2460}\u{1f34e}.png"
    );
}

#[test]
fn one_static_encoding_passed_address_not_return_at_passive_convert_one_edit() {
    assert_eq!(encode_markdown_address("a%20b.png", false), "a%20b.png");
    assert_eq!(encode_markdown_address("a%2Fb.png", false), "a%2Fb.png");

    assert_eq!(encode_markdown_address("100%.png", false), "100%25.png");
    assert_eq!(encode_markdown_address("100%zz.png", false), "100%25zz.png");

    assert_eq!(
        encode_markdown_address("https://a/100%.png", true),
        "https://a/100%.png"
    );
}

#[test]
fn network_address_inner_text_number_static_number_is_define_boundary_service_not_can_convert() {
    let u = "https://a/b.png?v=2#p3";
    assert_eq!(encode_markdown_address(u, true), u);

    assert_eq!(
        encode_markdown_address("\u{56fe}?\u{7247}.png", false),
        "\u{56fe}%3F\u{7247}.png"
    );
    assert_eq!(
        encode_markdown_address("\u{56fe}#1.png", false),
        "\u{56fe}%231.png"
    );
}

#[test]
fn item_pair_path_return_web_upper_derive() {
    assert_eq!(
        relative_path(Path::new("/a/b"), Path::new("/a/b/c.png")).unwrap(),
        "c.png"
    );

    assert_eq!(
        relative_path(Path::new("/a/b"), Path::new("/a/b/img/c.png")).unwrap(),
        "img/c.png"
    );

    assert_eq!(
        relative_path(Path::new("/a/b"), Path::new("/a/c.png")).unwrap(),
        "../c.png"
    );

    assert_eq!(
        relative_path(Path::new("/a/b/c"), Path::new("/x/y.png")).unwrap(),
        "../../../x/y.png"
    );

    assert!(!relative_path(Path::new("/a/b"), Path::new("/a/b/c.png"))
        .unwrap()
        .contains('\\'));
}

#[test]
fn item_pair_path_compute_not_old_give_empty() {
    assert!(relative_path(Path::new("a/b"), Path::new("/a/b/c.png")).is_none());
    assert!(relative_path(Path::new("/a/b"), Path::new("c.png")).is_none());
}

#[test]
fn need_read_path_by_document_directory_define() {
    let directory_2 = document_directory();

    assert_eq!(
        resolve_local_file(Path::new("/tmp/\u{56fe}.png"), Some(&directory_2)),
        PathBuf::from("/tmp/\u{56fe}.png")
    );

    assert_eq!(
        resolve_local_file(Path::new("\u{56fe}.png"), Some(&directory_2)),
        PathBuf::from("/home/u/\u{6587}\u{6863}/\u{56fe}.png")
    );
    assert_eq!(
        resolve_local_file(Path::new("img/\u{56fe}.png"), Some(&directory_2)),
        PathBuf::from("/home/u/\u{6587}\u{6863}/img/\u{56fe}.png")
    );

    assert_eq!(
        resolve_local_file(Path::new("\u{56fe}.png"), None),
        PathBuf::from("\u{56fe}.png")
    );
}

#[test]
fn point_point_write_just_only_add_at_each_point_start_header_before_surface() {
    assert_eq!(prefix_relative_path("assets/a.png"), "./assets/a.png");
    assert_eq!(prefix_relative_path("a.png"), "./a.png");

    assert_eq!(prefix_relative_path("./a.png"), "./a.png");
    assert_eq!(prefix_relative_path("../a.png"), "../a.png");
}

#[test]
fn none_action_character_target() {
    let directory_2 = Some(document_directory());
    let d = directory_2.as_deref();
    assert_eq!(
        target_directory(A::None, d, Some("\u{7b14}\u{8bb0}"), "").unwrap(),
        None
    );
    assert_eq!(
        target_directory(A::CopyToCurrentDir, d, Some("\u{7b14}\u{8bb0}"), "").unwrap(),
        Some(PathBuf::from("/home/u/\u{6587}\u{6863}"))
    );
    assert_eq!(
        target_directory(A::CopyToAssets, d, Some("\u{7b14}\u{8bb0}"), "").unwrap(),
        Some(PathBuf::from("/home/u/\u{6587}\u{6863}/assets"))
    );

    assert_eq!(
        target_directory(A::CopyToDocAssets, d, Some("\u{7b14}\u{8bb0}"), "").unwrap(),
        Some(PathBuf::from(
            "/home/u/\u{6587}\u{6863}/\u{7b14}\u{8bb0}.assets"
        ))
    );
}

#[test]
fn each_store_parse_document_left_not_service_only_action() {
    for a in [A::CopyToCurrentDir, A::CopyToAssets, A::CopyToDocAssets] {
        let e = target_directory(a, None, None, "").unwrap_err();
        assert!(
            e.to_string().contains("save the document"),
            "expected an unsaved-document error: {e}"
        );
    }

    assert_eq!(
        target_directory(A::CopyToCustom, None, None, "/tmp/\u{56fe}").unwrap(),
        Some(PathBuf::from("/tmp/\u{56fe}"))
    );
    let e = target_directory(A::CopyToCustom, None, None, "../\u{56fe}").unwrap_err();
    assert!(
        e.to_string().contains("needs the document directory"),
        "unexpected error: {e}"
    );
}

#[test]
fn only_define_path_empty_old_package_error_not_extract() {
    let e = target_directory(
        A::CopyToCustom,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
        "",
    )
    .unwrap_err();
    assert!(
        e.to_string().contains("No custom image path"),
        "unexpected error: {e}"
    );
}

#[test]
fn only_define_path_item_pair_is_by_document_directory_compute() {
    assert_eq!(
        target_directory(
            A::CopyToCustom,
            Some(&document_directory()),
            Some("\u{7b14}\u{8bb0}"),
            "../\u{56fe}"
        )
        .unwrap(),
        Some(PathBuf::from("/home/u/\u{6587}\u{6863}/../\u{56fe}"))
    );
    assert_eq!(
        target_directory(
            A::CopyToCustom,
            Some(&document_directory()),
            Some("\u{7b14}\u{8bb0}"),
            "/data/\u{56fe}"
        )
        .unwrap(),
        Some(PathBuf::from("/data/\u{56fe}"))
    );
}

#[test]
fn same_content_not_middle_service_write() {
    let directory_2 = std::env::temp_dir().join("nota-image-\u{5b9a}\u{540d}");
    let _ = std::fs::remove_dir_all(&directory_2);
    std::fs::create_dir_all(&directory_2).unwrap();

    let (base_one, need_write) =
        define_name(&directory_2, "a.png", Some("\u{5185}\u{5bb9}".as_bytes()));
    assert!(need_write);
    std::fs::write(&base_one, "\u{5185}\u{5bb9}".as_bytes()).unwrap();

    let (base_two, need_write) =
        define_name(&directory_2, "a.png", Some("\u{5185}\u{5bb9}".as_bytes()));
    assert_eq!(base_two, base_one);
    assert!(
        !need_write,
        "\u{540c}\u{5185}\u{5bb9}\u{4e0d}\u{8be5}\u{518d}\u{5199}\u{4e00}\u{904d}"
    );

    let (base_three, need_write) =
        define_name(&directory_2, "a.png", Some("\u{522b}\u{7684}".as_bytes()));
    assert_eq!(filename_2(&base_three), "a-1.png");
    assert!(need_write);

    let _ = std::fs::remove_dir_all(&directory_2);
}

#[test]
fn name_inner_path_and_unexpected_character_service_return_passive_question_drop() {
    let directory_2 = std::env::temp_dir().join("nota-image-\u{540d}\u{5b57}");

    let (p, _) = define_name(&directory_2, "../../etc/passwd", None);
    assert_eq!(filename_2(&p), "passwd");
    let (p, _) = define_name(&directory_2, "a<b>c:d.png", None);
    assert_eq!(filename_2(&p), "abc d.png".replace(' ', ""));

    let (p, _) = define_name(&directory_2, "/...", None);
    assert_eq!(filename_2(&p), "image.png");
}

#[test]
fn from_address_extract_name_get_suffix_segment_active_summary() {
    assert_eq!(
        extract_name_from_address("https://a/b/c.png"),
        "c.png",
        "\u{6b63}\u{5e38}\u{5730}\u{5740}\u{53d6}\u{672b}\u{6bb5}"
    );

    assert_eq!(extract_name_from_address("https://a/c.png?x=1"), "c.png");

    let name = extract_name_from_address("https://a/img/12345");
    assert!(
        name.starts_with("image-") && name.ends_with(".png"),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{name}"
    );
}

#[test]
fn default_settings_lower_deep_all_not_dynamic() {
    let r = default_rule();
    let p = compute_record_render(
        &ImageSource::LocalFile(PathBuf::from(
            "/home/u/\u{56fe}\u{7247}/\u{622a}\u{5c4f}.png",
        )),
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(
        p,
        PlacementPlan::KeepInPlace {
            address_2: "/home/u/\u{56fe}\u{7247}/\u{622a}\u{5c4f}.png".to_string()
        }
    );

    let p = compute_record_render(
        &ImageSource::LocalFile(PathBuf::from("./img/a.png")),
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(
        p,
        PlacementPlan::KeepInPlace {
            address_2: "./img/a.png".to_string()
        }
    );
}

#[test]
fn has_thread_item_pair_path_only_overflow_one_method_item_dynamic() {
    let mut r = default_rule();
    r.prefer_relative = true;

    let p = compute_record_render(
        &ImageSource::LocalFile(PathBuf::from("/home/u/\u{6587}\u{6863}/\u{56fe}/a.png")),
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(
        p,
        PlacementPlan::KeepInPlace {
            address_2: "\u{56fe}/a.png".to_string()
        }
    );

    let p = compute_record_render(
        &ImageSource::LocalFile(PathBuf::from("../\u{56fe}/a.png")),
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(
        p,
        PlacementPlan::KeepInPlace {
            address_2: "../\u{56fe}/a.png".to_string()
        }
    );

    r.add_dot_slash = true;
    let p = compute_record_render(
        &ImageSource::LocalFile(PathBuf::from("/home/u/\u{6587}\u{6863}/\u{56fe}/a.png")),
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(
        p,
        PlacementPlan::KeepInPlace {
            address_2: "./\u{56fe}/a.png".to_string()
        }
    );
}

#[test]
fn service_only_to_assets_record_render() {
    let mut r = default_rule();
    r.action = A::CopyToAssets;
    let p = compute_record_render(
        &ImageSource::LocalFile(PathBuf::from(
            "/home/u/\u{56fe}\u{7247}/\u{622a}\u{5c4f}.png",
        )),
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(
        p,
        PlacementPlan::Copy {
            from: PathBuf::from("/home/u/\u{56fe}\u{7247}/\u{622a}\u{5c4f}.png"),
            to: PathBuf::from("/home/u/\u{6587}\u{6863}/assets"),
        }
    );
}

#[test]
fn enabled_close_drop_old_not_dynamic_receive() {
    let mut r = default_rule();
    r.action = A::CopyToAssets;

    r.apply_to_local = false;
    let p = compute_record_render(
        &ImageSource::LocalFile(PathBuf::from(
            "/home/u/\u{56fe}\u{7247}/\u{622a}\u{5c4f}.png",
        )),
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert!(matches!(p, PlacementPlan::KeepInPlace { .. }));

    r.apply_to_local = true;
    let p = compute_record_render(
        &ImageSource::NetworkAddress("https://a/b.png".to_string()),
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(
        p,
        PlacementPlan::KeepInPlace {
            address_2: "https://a/b.png".to_string()
        }
    );

    r.apply_to_remote = true;
    let p = compute_record_render(
        &ImageSource::NetworkAddress("https://a/b.png".to_string()),
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(
        p,
        PlacementPlan::Download {
            address_2: "https://a/b.png".to_string(),
            to: PathBuf::from("/home/u/\u{6587}\u{6863}/assets"),
        }
    );
}

#[test]
fn clipboard_must_required_land_parse() {
    let r = default_rule();
    let p = compute_record_render(
        &ImageSource::Clipboard {
            bytes: b"PNG".to_vec(),
            extension_2: "png".to_string(),
        },
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();

    match p {
        PlacementPlan::WriteToDisk { to, name_2, .. } => {
            assert_eq!(to, PathBuf::from("/home/u/\u{6587}\u{6863}/assets"));
            assert!(
                name_2.starts_with("image-") && name_2.ends_with(".png"),
                "{name_2}"
            );
            assert_eq!(name_2.len(), "image-".len() + 8 + ".png".len());
        }
        other => panic!("\u{5e94}\u{8be5}\u{662f}\u{5199}\u{76d8}\u{ff1a}{other:?}"),
    }
}

#[test]
fn clipboard_extension_person_not_out_old_derive_return_png() {
    let r = default_rule();
    let p = compute_record_render(
        &ImageSource::Clipboard {
            bytes: b"X".to_vec(),
            extension_2: "exe".to_string(),
        },
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    match p {
        PlacementPlan::WriteToDisk { name_2, .. } => assert!(name_2.ends_with(".png"), "{name_2}"),
        other => panic!("\u{5e94}\u{8be5}\u{662f}\u{5199}\u{76d8}\u{ff1a}{other:?}"),
    }
}

fn create_document(name: &str) -> (PathBuf, PathBuf) {
    let root_2 = std::env::temp_dir().join(format!("nota-image-\u{843d}\u{5730}-{name}"));
    let _ = std::fs::remove_dir_all(&root_2);
    std::fs::create_dir_all(&root_2).unwrap();
    let document_2 = root_2.join("\u{7b14}\u{8bb0}.md");
    std::fs::write(&document_2, "# \u{7b14}\u{8bb0}\n").unwrap();
    (document_2, root_2)
}

#[test]
fn service_only_only_after_write_is_item_pair_path() {
    let (_, root_2) = create_document("\u{590d}\u{5236}");
    let source_image = root_2.join("\u{622a}\u{5c4f}.png");
    std::fs::write(&source_image, b"PNG-1").unwrap();

    let mut r = default_rule();
    r.action = A::CopyToAssets;
    let result_3 = place(
        &ImageSource::LocalFile(source_image.clone()),
        &r,
        Some(&root_2),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();

    assert_eq!(result_3.src, "assets/\u{622a}\u{5c4f}.png");
    assert_eq!(result_3.operation_2, PlacementOperation::Copy);
    assert_eq!(
        filename_2(Path::new(result_3.saved_to.as_deref().unwrap())),
        "\u{622a}\u{5c4f}.png"
    );
    assert_eq!(
        std::fs::read(root_2.join("assets/\u{622a}\u{5c4f}.png")).unwrap(),
        b"PNG-1"
    );

    assert!(source_image.exists());

    let at_word = place(
        &ImageSource::LocalFile(source_image),
        &r,
        Some(&root_2),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(at_word.operation_2, PlacementOperation::AlreadyExists);
    assert_eq!(at_word.src, "assets/\u{622a}\u{5c4f}.png");

    let _ = std::fs::remove_dir_all(&root_2);
}

#[test]
fn add_point_point_write_just_and_convert_one_at_service_only_that_one_only_page_generate_small() {
    let (_, root_2) = create_document("\u{659c}\u{6760}");

    let source_image = root_2.join("\u{6211}\u{7684} \u{56fe}.png");
    std::fs::write(&source_image, b"PNG").unwrap();

    let mut r = default_rule();
    r.action = A::CopyToAssets;
    r.add_dot_slash = true;
    r.escape_url = true;
    let result_3 = place(
        &ImageSource::LocalFile(source_image),
        &r,
        Some(&root_2),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(result_3.src, "./assets/\u{6211}\u{7684}%20\u{56fe}.png");

    let _ = std::fs::remove_dir_all(&root_2);
}

#[test]
fn download_walk_is_main_enter_incoming_that_get_network() {
    let (_, root_2) = create_document("\u{4e0b}\u{8f7d}");
    let mut r = default_rule();
    r.action = A::CopyToAssets;
    r.apply_to_remote = true;

    let image = ImageSource::NetworkAddress("https://cdn.example.com/img/a.png?x=1".to_string());
    let record_render =
        compute_record_render(&image, &r, Some(&root_2), Some("\u{7b14}\u{8bb0}")).unwrap();
    let ok = |url: &str| -> Result<Vec<u8>> {
        assert_eq!(url, "https://cdn.example.com/img/a.png?x=1");
        Ok(b"PNG-DOWNLOADED".to_vec())
    };
    let result_3 = land_base(&record_render, Some(&root_2), &r, &ok).unwrap();

    assert_eq!(result_3.operation_2, PlacementOperation::Download);
    assert_eq!(result_3.src, "assets/a.png");
    assert_eq!(
        std::fs::read(root_2.join("assets/a.png")).unwrap(),
        b"PNG-DOWNLOADED"
    );

    let broken = |_: &str| -> Result<Vec<u8>> {
        Err(NotaError::other(
            "\u{670d}\u{52a1}\u{5668}\u{56de}\u{4e86} 404",
        ))
    };
    let error = land_base(&record_render, Some(&root_2), &r, &broken).unwrap_err();
    assert!(
        error.to_string().contains("404"),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{error}"
    );

    let _ = std::fs::remove_dir_all(&root_2);
}

#[test]
fn clipboard_land_parse_and_same_content_service_use() {
    let (_, root_2) = create_document("\u{526a}\u{8d34}\u{677f}");
    let r = default_rule();
    let image = ImageSource::Clipboard {
        bytes: b"PNG-CLIP".to_vec(),
        extension_2: "png".to_string(),
    };
    let record_render =
        compute_record_render(&image, &r, Some(&root_2), Some("\u{7b14}\u{8bb0}")).unwrap();
    let not_link_web = |_: &str| -> Result<Vec<u8>> {
        unreachable!("\u{526a}\u{8d34}\u{677f}\u{4e0d}\u{8be5}\u{8054}\u{7f51}")
    };
    let one = land_base(&record_render, Some(&root_2), &r, &not_link_web).unwrap();
    let two = land_base(&record_render, Some(&root_2), &r, &not_link_web).unwrap();
    assert_eq!(one.operation_2, PlacementOperation::WriteToDisk);
    assert_eq!(two.operation_2, PlacementOperation::AlreadyExists, "\u{540c}\u{4e00}\u{5f20}\u{56fe}\u{8fde}\u{7c98}\u{4e24}\u{6b21}\u{4e0d}\u{8be5}\u{5806}\u{51fa}\u{4e24}\u{4efd}\u{6587}\u{4ef6}");
    assert_eq!(one.src, two.src);
    assert!(one.src.starts_with("assets/image-"));

    assert!(root_2.join("assets").is_dir());

    let _ = std::fs::remove_dir_all(&root_2);
}

#[test]
fn not_land_parse_is_one_character_boundary_all_not_write() {
    let (_, root_2) = create_document("\u{4e0d}\u{52a8}");
    let r = default_rule();
    let before: Vec<_> = std::fs::read_dir(&root_2).unwrap().collect();
    let result_3 = place(
        &ImageSource::LocalFile(root_2.join("\u{4e0d}\u{5b58}\u{5728}\u{7684}\u{56fe}.png")),
        &r,
        Some(&root_2),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(result_3.operation_2, PlacementOperation::KeepInPlace);
    let after: Vec<_> = std::fs::read_dir(&root_2).unwrap().collect();
    assert_eq!(before.len(), after.len(), "\u{300c}\u{65e0}\u{7279}\u{6b8a}\u{64cd}\u{4f5c}\u{300d}\u{4e0d}\u{8be5}\u{52a8}\u{78c1}\u{76d8}");

    assert!(result_3.saved_to.is_none());

    let _ = std::fs::remove_dir_all(&root_2);
}
