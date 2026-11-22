use super::*;

#[test]
fn shu_chu_de_ci_neng_dui_hui_yuan_lai_de_xia_biao() {
    let ci_men: Vec<String> = ["helo", "hello", "wrold", "hello"]
        .iter()
        .map(|s| s.to_string())
        .collect();

    let chu = dui_hui_xia_biao(&ci_men, "helo\nwrold\n");
    assert_eq!(chu, vec![0, 2]);
}

#[test]
fn tong_yi_ge_ci_chu_xian_liang_ci_shi_liang_ge_xia_biao_dou_yao_biao_chu_lai() {
    let ci_men: Vec<String> = ["helo", "x", "helo"]
        .iter()
        .map(|s| s.to_string())
        .collect();

    assert_eq!(dui_hui_xia_biao(&ci_men, "helo\nhelo\n"), vec![0, 2]);
}

#[test]
fn hou_duan_mei_shuo_hua_shi_yi_ge_dou_bu_biao() {
    let ci_men: Vec<String> = vec!["hello".to_string()];
    assert!(dui_hui_xia_biao(&ci_men, "").is_empty());
    assert!(dui_hui_xia_biao(&ci_men, "   \n\n").is_empty());
}

#[test]
fn jian_yi_cong_guan_dao_mo_shi_de_shu_chu_li_kou() {
    let shu_chu = "@(#) International Ispell Version 3.2.06\n\
                 & helo 5 0: hello, halo, help, hell, hero\n\
                 * ok\n";
    assert_eq!(
        cong_jian_yi_shu_chu_li_kou(shu_chu),
        ["hello", "halo", "help", "hell", "hero"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<String>>()
    );

    assert!(cong_jian_yi_shu_chu_li_kou("* ok\n").is_empty());
}

#[test]
fn mei_you_zhe_ben_ci_dian_shi_na_ju_hua_yao_shuo_de_chu_san_tiao_chu_lu() {
    let hua = mei_you_zhe_ben_ci_dian_de_hua("zh_CN");

    assert!(hua.contains("zh_CN"), "{hua}");

    assert!(
        hua.contains("hunspell-zh_CN"),
        "\u{5c11}\u{4e86}\u{88c5}\u{7cfb}\u{7edf}\u{5305}\u{90a3}\u{6761}\u{ff1a}{hua}"
    );
    assert!(
        hua.to_lowercase().contains("zip"),
        "\u{5c11}\u{4e86}\u{5bfc}\u{5165}\u{90a3}\u{6761}\u{ff1a}{hua}"
    );
    assert!(
        hua.contains("dictionaries"),
        "\u{5c11}\u{4e86}\u{62f7}\u{8fdb}\u{76ee}\u{5f55}\u{90a3}\u{6761}\u{ff1a}{hua}"
    );

    assert!(!hua.contains("\u{62fc}\u{9519}"), "{hua}");
}

#[test]
fn yong_hu_ci_yu_hu_lve_de_ci_dou_bu_qu_wen_engine() {
    let ci_men: Vec<String> = ["hello", "Nota", "foobarbaz", "world"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let yong_hu: HashSet<String> = ["nota".to_string()].into_iter().collect();
    let hu_lve: HashSet<String> = ["foobarbaz".to_string()].into_iter().collect();
    let dai_cha = yao_zhen_cha_de(&ci_men, &yong_hu, &hu_lve);

    assert_eq!(dai_cha, vec![(0, "hello"), (3, "world")]);
}

#[test]
fn yong_hu_ci_table_bi_da_xiao_write_bu_min_gan() {
    let ci_men: Vec<String> = vec!["Nota".to_string()];
    let yong_hu: HashSet<String> = ["nota".to_string()].into_iter().collect();
    assert!(yao_zhen_cha_de(&ci_men, &yong_hu, &HashSet::new()).is_empty());

    assert_eq!(gui_yi("NOTA"), "nota");
    assert_eq!(gui_yi("  Nota  "), "nota");
}

#[cfg(unix)]
#[test]
fn jia_hou_duan_hai_zhen_neng_pao_yi_bian_cha_dao_ci_yu_jian_yi() {
    use std::os::unix::fs::PermissionsExt;
    let directory_2 = std::env::temp_dir().join(format!("nota-spell-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&directory_2);
    std::fs::create_dir_all(&directory_2).unwrap();
    let jia = directory_2.join("enchant-2");
    std::fs::write(
        &jia,



        "#!/bin/sh\ncase \"$3\" in\n  -l) cat >/dev/null; printf 'helo\\n'; ;;\n  -a) cat >/dev/null; printf '& helo 2 0: hello, halo\\n'; ;;\nesac\n",
    )
    .unwrap();
    std::fs::set_permissions(&jia, std::fs::Permissions::from_mode(0o755)).unwrap();

    let program_2: &'static str = Box::leak(jia.display().to_string().into_boxed_str());

    let hou_duan = CommandLineBackend {
        program_2,
        yong_hu_ci_dian_directory: None,
    };
    let ci_men: Vec<String> = ["helo", "hello"].iter().map(|s| s.to_string()).collect();
    assert_eq!(hou_duan.cha_2("en_US", &ci_men), Some(vec![0]));
    assert_eq!(
        hou_duan.jian_yi("en_US", "helo"),
        ["hello", "halo"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<String>>()
    );
    let _ = std::fs::remove_dir_all(&directory_2);
}

#[test]
fn yong_hu_ci_dian_zai_shi_gei_path_bu_zai_shi_gei_language_names() {
    let temp_2 = std::env::temp_dir().join(format!("nota-dicts-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_2);
    std::fs::create_dir_all(&temp_2).unwrap();
    std::fs::write(temp_2.join("en_US.dic"), b"2\nhello\nworld\n").unwrap();
    std::fs::write(temp_2.join("en_US.aff"), b"SET UTF-8\n").unwrap();
    let dai = CommandLineBackend {
        program_2: "enchant-2",
        yong_hu_ci_dian_directory: Some(temp_2.clone()),
    };

    assert_eq!(
        dai.ci_dian_args("en_US"),
        temp_2.join("en_US").display().to_string()
    );

    assert_eq!(dai.ci_dian_args("zh_CN"), "zh_CN");
    let bu_dai = CommandLineBackend {
        program_2: "enchant-2",
        yong_hu_ci_dian_directory: None,
    };
    assert_eq!(bu_dai.ci_dian_args("en_US"), "en_US");
    let _ = std::fs::remove_dir_all(&temp_2);
}
