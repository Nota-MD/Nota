use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};

use super::target::cong_address_cai_name;
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
fn network_address_zhi_ren_http_he_https() {
    assert!(is_network_address("https://a/b.png"));
    assert!(is_network_address("HTTP://A/B.PNG"));
    assert!(is_network_address("  http://a/b  "));

    assert!(!is_network_address("data:image/png;base64,AAAA"));
    assert!(!is_network_address("//cdn.example.com/a.png"));
    assert!(!is_network_address("./img/a.png"));
    assert!(!is_network_address("/home/u/a.png"));
}

#[test]
fn zhuan_yi_bu_peng_zhong_wen_dan_hui_receive_shi_kong_ge() {
    assert_eq!(
        zhuan_yi_address("\u{56fe} \u{7247}.png", false),
        "\u{56fe}%20\u{7247}.png"
    );
    assert_eq!(zhuan_yi_address("a\"b.png", false), "a%22b.png");
    assert_eq!(zhuan_yi_address("a<b>c.png", false), "a%3Cb%3Ec.png");
    assert_eq!(
        zhuan_yi_address("\u{5e26}`\u{53cd}\u{5f15}\u{53f7}`.png", false),
        "\u{5e26}%60\u{53cd}\u{5f15}\u{53f7}%60.png"
    );

    assert_eq!(
        zhuan_yi_address("\u{7b14}\u{8bb0}-\u{2460}\u{1f34e}.png", false),
        "\u{7b14}\u{8bb0}-\u{2460}\u{1f34e}.png"
    );
}

#[test]
fn yi_jing_encoding_guo_de_address_bu_hui_zai_bei_zhuan_yi_bian() {
    assert_eq!(zhuan_yi_address("a%20b.png", false), "a%20b.png");
    assert_eq!(zhuan_yi_address("a%2Fb.png", false), "a%2Fb.png");

    assert_eq!(zhuan_yi_address("100%.png", false), "100%25.png");
    assert_eq!(zhuan_yi_address("100%zz.png", false), "100%25zz.png");

    assert_eq!(
        zhuan_yi_address("https://a/100%.png", true),
        "https://a/100%.png"
    );
}

#[test]
fn network_address_li_de_wen_hao_jing_hao_shi_ding_jie_fu_bu_neng_zhuan() {
    let u = "https://a/b.png?v=2#p3";
    assert_eq!(zhuan_yi_address(u, true), u);

    assert_eq!(
        zhuan_yi_address("\u{56fe}?\u{7247}.png", false),
        "\u{56fe}%3F\u{7247}.png"
    );
    assert_eq!(
        zhuan_yi_address("\u{56fe}#1.png", false),
        "\u{56fe}%231.png"
    );
}

#[test]
fn xiang_dui_path_hui_wang_shang_tui() {
    assert_eq!(
        xiang_dui_path(Path::new("/a/b"), Path::new("/a/b/c.png")).unwrap(),
        "c.png"
    );

    assert_eq!(
        xiang_dui_path(Path::new("/a/b"), Path::new("/a/b/img/c.png")).unwrap(),
        "img/c.png"
    );

    assert_eq!(
        xiang_dui_path(Path::new("/a/b"), Path::new("/a/c.png")).unwrap(),
        "../c.png"
    );

    assert_eq!(
        xiang_dui_path(Path::new("/a/b/c"), Path::new("/x/y.png")).unwrap(),
        "../../../x/y.png"
    );

    assert!(!xiang_dui_path(Path::new("/a/b"), Path::new("/a/b/c.png"))
        .unwrap()
        .contains('\\'));
}

#[test]
fn xiang_dui_path_suan_bu_le_jiu_gei_kong() {
    assert!(xiang_dui_path(Path::new("a/b"), Path::new("/a/b/c.png")).is_none());
    assert!(xiang_dui_path(Path::new("/a/b"), Path::new("c.png")).is_none());
}

#[test]
fn yao_read_de_path_an_document_directory_ding() {
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
fn dian_dian_xie_gang_zhi_jia_zai_mei_dian_kai_tou_de_qian_mian() {
    assert_eq!(jia_dian_dian_xie_gang("assets/a.png"), "./assets/a.png");
    assert_eq!(jia_dian_dian_xie_gang("a.png"), "./a.png");

    assert_eq!(jia_dian_dian_xie_gang("./a.png"), "./a.png");
    assert_eq!(jia_dian_dian_xie_gang("../a.png"), "../a.png");
}

#[test]
fn wu_ge_action_ge_zi_de_target() {
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
fn mei_cun_pan_de_document_zuo_bu_le_fu_zhi_action() {
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
fn zhi_ding_path_kong_zhe_jiu_bao_cuo_bu_cai() {
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
fn zhi_ding_path_xiang_dui_shi_an_document_directory_suan() {
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
fn tong_content_bu_zhong_fu_write() {
    let directory_2 = std::env::temp_dir().join("nota-image-\u{5b9a}\u{540d}");
    let _ = std::fs::remove_dir_all(&directory_2);
    std::fs::create_dir_all(&directory_2).unwrap();

    let (di_yi, yao_write) = ding_ming(&directory_2, "a.png", Some("\u{5185}\u{5bb9}".as_bytes()));
    assert!(yao_write);
    std::fs::write(&di_yi, "\u{5185}\u{5bb9}".as_bytes()).unwrap();

    let (di_er, yao_write) = ding_ming(&directory_2, "a.png", Some("\u{5185}\u{5bb9}".as_bytes()));
    assert_eq!(di_er, di_yi);
    assert!(
        !yao_write,
        "\u{540c}\u{5185}\u{5bb9}\u{4e0d}\u{8be5}\u{518d}\u{5199}\u{4e00}\u{904d}"
    );

    let (di_san, yao_write) = ding_ming(&directory_2, "a.png", Some("\u{522b}\u{7684}".as_bytes()));
    assert_eq!(filename_2(&di_san), "a-1.png");
    assert!(yao_write);

    let _ = std::fs::remove_dir_all(&directory_2);
}

#[test]
fn name_li_de_path_yu_guai_zi_fu_hui_bei_ti_diao() {
    let directory_2 = std::env::temp_dir().join("nota-image-\u{540d}\u{5b57}");

    let (p, _) = ding_ming(&directory_2, "../../etc/passwd", None);
    assert_eq!(filename_2(&p), "passwd");
    let (p, _) = ding_ming(&directory_2, "a<b>c:d.png", None);
    assert_eq!(filename_2(&p), "abc d.png".replace(' ', ""));

    let (p, _) = ding_ming(&directory_2, "/...", None);
    assert_eq!(filename_2(&p), "image.png");
}

#[test]
fn cong_address_cai_name_qu_mo_duan_huo_summary() {
    assert_eq!(
        cong_address_cai_name("https://a/b/c.png"),
        "c.png",
        "\u{6b63}\u{5e38}\u{5730}\u{5740}\u{53d6}\u{672b}\u{6bb5}"
    );

    assert_eq!(cong_address_cai_name("https://a/c.png?x=1"), "c.png");

    let ming = cong_address_cai_name("https://a/img/12345");
    assert!(
        ming.starts_with("image-") && ming.ends_with(".png"),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{ming}"
    );
}

#[test]
fn default_settings_xia_shen_me_dou_bu_dong() {
    let r = default_rule();
    let p = suan_ji_hua(
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

    let p = suan_ji_hua(
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
fn you_xian_xiang_dui_path_zhi_chao_yi_ge_fang_xiang_dong() {
    let mut r = default_rule();
    r.prefer_relative = true;

    let p = suan_ji_hua(
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

    let p = suan_ji_hua(
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
    let p = suan_ji_hua(
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
fn fu_zhi_dao_assets_de_ji_hua() {
    let mut r = default_rule();
    r.action = A::CopyToAssets;
    let p = suan_ji_hua(
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
            cong: PathBuf::from("/home/u/\u{56fe}\u{7247}/\u{622a}\u{5c4f}.png"),
            dao: PathBuf::from("/home/u/\u{6587}\u{6863}/assets"),
        }
    );
}

#[test]
fn enabled_guan_diao_jiu_bu_dong_shou() {
    let mut r = default_rule();
    r.action = A::CopyToAssets;

    r.apply_to_local = false;
    let p = suan_ji_hua(
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
    let p = suan_ji_hua(
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
    let p = suan_ji_hua(
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
            dao: PathBuf::from("/home/u/\u{6587}\u{6863}/assets"),
        }
    );
}

#[test]
fn clipboard_bi_xu_luo_pan() {
    let r = default_rule();
    let p = suan_ji_hua(
        &ImageSource::Clipboard {
            zi_jie: b"PNG".to_vec(),
            extension_2: "png".to_string(),
        },
        &r,
        Some(&document_directory()),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();

    match p {
        PlacementPlan::WriteToDisk { dao, name_2, .. } => {
            assert_eq!(dao, PathBuf::from("/home/u/\u{6587}\u{6863}/assets"));
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
fn clipboard_de_extension_ren_bu_chu_jiu_tui_hui_png() {
    let r = default_rule();
    let p = suan_ji_hua(
        &ImageSource::Clipboard {
            zi_jie: b"X".to_vec(),
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

fn zao_ge_document(ming: &str) -> (PathBuf, PathBuf) {
    let root_2 = std::env::temp_dir().join(format!("nota-image-\u{843d}\u{5730}-{ming}"));
    let _ = std::fs::remove_dir_all(&root_2);
    std::fs::create_dir_all(&root_2).unwrap();
    let document_2 = root_2.join("\u{7b14}\u{8bb0}.md");
    std::fs::write(&document_2, "# \u{7b14}\u{8bb0}\n").unwrap();
    (document_2, root_2)
}

#[test]
fn fu_zhi_zhi_hou_write_de_shi_xiang_dui_path() {
    let (_, root_2) = zao_ge_document("\u{590d}\u{5236}");
    let yuan_tu = root_2.join("\u{622a}\u{5c4f}.png");
    std::fs::write(&yuan_tu, b"PNG-1").unwrap();

    let mut r = default_rule();
    r.action = A::CopyToAssets;
    let result_3 = place(
        &ImageSource::LocalFile(yuan_tu.clone()),
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

    assert!(yuan_tu.exists());

    let zai_ci = place(
        &ImageSource::LocalFile(yuan_tu),
        &r,
        Some(&root_2),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(zai_ci.operation_2, PlacementOperation::AlreadyExists);
    assert_eq!(zai_ci.src, "assets/\u{622a}\u{5c4f}.png");

    let _ = std::fs::remove_dir_all(&root_2);
}

#[test]
fn jia_dian_dian_xie_gang_yu_zhuan_yi_zai_fu_zhi_na_yi_zhi_ye_sheng_xiao() {
    let (_, root_2) = zao_ge_document("\u{659c}\u{6760}");

    let yuan_tu = root_2.join("\u{6211}\u{7684} \u{56fe}.png");
    std::fs::write(&yuan_tu, b"PNG").unwrap();

    let mut r = default_rule();
    r.action = A::CopyToAssets;
    r.add_dot_slash = true;
    r.escape_url = true;
    let result_3 = place(
        &ImageSource::LocalFile(yuan_tu),
        &r,
        Some(&root_2),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(result_3.src, "./assets/\u{6211}\u{7684}%20\u{56fe}.png");

    let _ = std::fs::remove_dir_all(&root_2);
}

#[test]
fn download_zou_de_shi_zhu_jin_lai_de_na_ge_qu_network() {
    let (_, root_2) = zao_ge_document("\u{4e0b}\u{8f7d}");
    let mut r = default_rule();
    r.action = A::CopyToAssets;
    r.apply_to_remote = true;

    let tu = ImageSource::NetworkAddress("https://cdn.example.com/img/a.png?x=1".to_string());
    let ji_hua = suan_ji_hua(&tu, &r, Some(&root_2), Some("\u{7b14}\u{8bb0}")).unwrap();
    let ok_de = |url: &str| -> Result<Vec<u8>> {
        assert_eq!(url, "https://cdn.example.com/img/a.png?x=1");
        Ok(b"PNG-DOWNLOADED".to_vec())
    };
    let result_3 = luo_di(&ji_hua, Some(&root_2), &r, &ok_de).unwrap();

    assert_eq!(result_3.operation_2, PlacementOperation::Download);
    assert_eq!(result_3.src, "assets/a.png");
    assert_eq!(
        std::fs::read(root_2.join("assets/a.png")).unwrap(),
        b"PNG-DOWNLOADED"
    );

    let huai_de = |_: &str| -> Result<Vec<u8>> {
        Err(NotaError::other(
            "\u{670d}\u{52a1}\u{5668}\u{56de}\u{4e86} 404",
        ))
    };
    let cuo = luo_di(&ji_hua, Some(&root_2), &r, &huai_de).unwrap_err();
    assert!(
        cuo.to_string().contains("404"),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{cuo}"
    );

    let _ = std::fs::remove_dir_all(&root_2);
}

#[test]
fn clipboard_luo_de_pan_yu_tong_content_fu_yong() {
    let (_, root_2) = zao_ge_document("\u{526a}\u{8d34}\u{677f}");
    let r = default_rule();
    let tu = ImageSource::Clipboard {
        zi_jie: b"PNG-CLIP".to_vec(),
        extension_2: "png".to_string(),
    };
    let ji_hua = suan_ji_hua(&tu, &r, Some(&root_2), Some("\u{7b14}\u{8bb0}")).unwrap();
    let bu_lian_wang = |_: &str| -> Result<Vec<u8>> {
        unreachable!("\u{526a}\u{8d34}\u{677f}\u{4e0d}\u{8be5}\u{8054}\u{7f51}")
    };
    let yi = luo_di(&ji_hua, Some(&root_2), &r, &bu_lian_wang).unwrap();
    let er = luo_di(&ji_hua, Some(&root_2), &r, &bu_lian_wang).unwrap();
    assert_eq!(yi.operation_2, PlacementOperation::WriteToDisk);
    assert_eq!(er.operation_2, PlacementOperation::AlreadyExists, "\u{540c}\u{4e00}\u{5f20}\u{56fe}\u{8fde}\u{7c98}\u{4e24}\u{6b21}\u{4e0d}\u{8be5}\u{5806}\u{51fa}\u{4e24}\u{4efd}\u{6587}\u{4ef6}");
    assert_eq!(yi.src, er.src);
    assert!(yi.src.starts_with("assets/image-"));

    assert!(root_2.join("assets").is_dir());

    let _ = std::fs::remove_dir_all(&root_2);
}

#[test]
fn bu_luo_pan_shi_yi_ge_zi_jie_dou_bu_write() {
    let (_, root_2) = zao_ge_document("\u{4e0d}\u{52a8}");
    let r = default_rule();
    let qian: Vec<_> = std::fs::read_dir(&root_2).unwrap().collect();
    let result_3 = place(
        &ImageSource::LocalFile(root_2.join("\u{4e0d}\u{5b58}\u{5728}\u{7684}\u{56fe}.png")),
        &r,
        Some(&root_2),
        Some("\u{7b14}\u{8bb0}"),
    )
    .unwrap();
    assert_eq!(result_3.operation_2, PlacementOperation::KeepInPlace);
    let hou: Vec<_> = std::fs::read_dir(&root_2).unwrap().collect();
    assert_eq!(qian.len(), hou.len(), "\u{300c}\u{65e0}\u{7279}\u{6b8a}\u{64cd}\u{4f5c}\u{300d}\u{4e0d}\u{8be5}\u{52a8}\u{78c1}\u{76d8}");

    assert!(result_3.saved_to.is_none());

    let _ = std::fs::remove_dir_all(&root_2);
}
