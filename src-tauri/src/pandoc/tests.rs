use super::*;

fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nota-pandoc-test-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("\u{5efa}\u{4e34}\u{65f6}\u{76ee}\u{5f55}");
    dir
}

#[cfg(unix)]
fn jia_ming_ling(tag: &str, body_2: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let path = temp_dir(tag).join("\u{5047}pandoc");
    std::fs::write(&path, format!("#!/bin/sh\n{body_2}\n")).unwrap();

    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    path
}

#[test]
fn args_li_you_biao_zhun_shu_ru_zhi_wai_de_shu_ru_path_trust_xi() {
    let args = build_args(
        &[],
        Format::Docx,
        Path::new("/tmp/\u{51fa}.docx"),
        Some(Path::new("/home/u/\u{6587}\u{6863}")),
        None,
        &[],
        None,
    );
    assert!(args.contains(&"--from=markdown".to_string()));
    assert!(args.contains(&"--to=docx".to_string()));
    assert!(args.contains(&"--standalone".to_string()));
    assert!(args.contains(&"--resource-path=/home/u/\u{6587}\u{6863}".to_string()));

    assert!(!args.iter().any(|a| a.ends_with(".md")), "{args:?}");
    assert_eq!(args.last().unwrap(), "/tmp/\u{51fa}.docx");
}

#[test]
fn dao_ru_args_ba_yuan_file_jiao_gei_pandoc_bing_shu_chu_markdown() {
    let args = build_import_args(
        &["--sandbox".to_string()],
        ImportFormat::Docx,
        Path::new("/home/u/\u{6e90}\u{6587}\u{4ef6}.docx"),
    );
    assert_eq!(args[0], "--sandbox");
    assert!(args.contains(&"--from=docx".to_string()), "{args:?}");
    assert!(args.contains(&"--to=markdown".to_string()), "{args:?}");
    assert!(args.contains(&"--wrap=none".to_string()), "{args:?}");
    assert!(
        args.contains(&"--markdown-headings=atx".to_string()),
        "{args:?}"
    );
    assert_eq!(
        args.last().unwrap(),
        "/home/u/\u{6e90}\u{6587}\u{4ef6}.docx"
    );
}

#[test]
#[cfg(unix)]
fn dao_ru_ba_pandoc_de_biao_zhun_shu_chu_yuan_yang_zuo_wei_body() {
    let dir = temp_dir("import-stdout");
    let source = dir.join("\u{8f93}\u{5165}.docx");
    std::fs::write(&source, b"not a real docx").unwrap();
    let fake = jia_ming_ling(
        "import-bin",
        "printf '# \u{5bfc}\u{5165}\u{6807}\u{9898}\\n\\n\u{6b63}\u{6587} \u{1f389}\\n'; printf 'WARNING: \u{56fe}\u{7247}\u{6ca1}\u{627e}\u{5230}\\n' >&2",
    );
    let out = import_with(&fake.display().to_string(), ImportFormat::Docx, &source).expect(
        "\u{5047} pandoc \u{6210}\u{529f}\u{65f6}\u{5e94}\u{5f53}\u{8fd4}\u{56de}\u{6b63}\u{6587}",
    );
    assert_eq!(
        out.markdown,
        "# \u{5bfc}\u{5165}\u{6807}\u{9898}\n\n\u{6b63}\u{6587} \u{1f389}\n"
    );
    assert!(
        out.warnings
            .contains("\u{56fe}\u{7247}\u{6ca1}\u{627e}\u{5230}"),
        "{}",
        out.warnings
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn pai_ban_engine_zhi_gei_pdf_er_qie_zhi_zai_zhao_dao_shi_gei() {
    let pdf = build_args(
        &[],
        Format::Pdf,
        Path::new("/tmp/a.pdf"),
        None,
        Some("xelatex"),
        &[],
        None,
    );
    assert!(pdf.contains(&"--pdf-engine=xelatex".to_string()), "{pdf:?}");

    let mei_engine = build_args(
        &[],
        Format::Pdf,
        Path::new("/tmp/a.pdf"),
        None,
        None,
        &[],
        None,
    );
    assert!(!mei_engine.iter().any(|a| a.starts_with("--pdf-engine")));

    let docx = build_args(
        &[],
        Format::Docx,
        Path::new("/tmp/a.docx"),
        None,
        Some("xelatex"),
        &[],
        None,
    );
    assert!(
        !docx.iter().any(|a| a.starts_with("--pdf-engine")),
        "{docx:?}"
    );
}

#[test]
fn qian_zhui_ming_ling_de_args_pai_zai_qian_mian() {
    let args = build_args(
        &["--sandbox".to_string()],
        Format::Odt,
        Path::new("/tmp/a.odt"),
        None,
        None,
        &[],
        None,
    );
    assert_eq!(args[0], "--sandbox");
    assert_eq!(args[1], "--from=markdown");
}

#[test]
fn e_wai_args_pai_zai_zi_jia_args_qian_mian() {
    let args = build_args(
        &[],
        Format::Docx,
        Path::new("/tmp/\u{51fa}.docx"),
        None,
        None,
        &["--reference-doc=\u{6211}\u{7684}\u{6a21}\u{677f}.docx".to_string()],
        None,
    );
    let e_wai = args
        .iter()
        .position(|a| a.starts_with("--reference-doc="))
        .unwrap();
    let zi_jia = args.iter().position(|a| a == "--from=markdown").unwrap();
    assert!(e_wai < zi_jia, "\u{989d}\u{5916}\u{53c2}\u{6570}\u{5e94}\u{5f53}\u{6392}\u{5728} `--from` \u{524d}\u{9762}\u{ff1a}{args:?}");

    assert!(args.contains(&"--reference-doc=\u{6211}\u{7684}\u{6a21}\u{677f}.docx".to_string()));
}

#[test]
fn e_wai_args_ren_yin_hao_bu_an_kong_bai_qie() {
    let fen = fen_ci("--metadata title=\"\u{6211}\u{7684} \u{4e66}\" --toc")
        .expect("\u{5f15}\u{53f7}\u{914d}\u{5bf9}");
    assert_eq!(
        fen,
        vec![
            "--metadata".to_string(),
            "title=\u{6211}\u{7684} \u{4e66}".to_string(),
            "--toc".to_string()
        ]
    );

    assert!(fen_ci("").unwrap().is_empty());
    assert!(fen_ci("   \n ").unwrap().is_empty());

    let err = fen_ci("--metadata title=\"\u{6211}\u{7684} \u{4e66}").unwrap_err();
    assert!(err.to_string().contains("unbalanced quotes"), "{err}");
}

#[test]
fn theme_css_zhi_gei_chi_de_xia_de_ge_shi() {
    let css = Path::new("/tmp/\u{4e3b}\u{9898}.css");
    let epub = build_args(
        &[],
        Format::Epub,
        Path::new("/tmp/a.epub"),
        None,
        None,
        &[],
        Some(css),
    );
    assert!(
        epub.contains(&"--css=/tmp/\u{4e3b}\u{9898}.css".to_string()),
        "epub \u{662f}\u{552f}\u{4e00}\u{8ba4} CSS \u{7684}\u{90a3}\u{79cd}\u{ff0c}\u{5fc5}\u{987b}\u{7ed9}\u{ff1a}{epub:?}"
    );

    for (ge_shi, target_3) in [
        (Format::Docx, "/tmp/a.docx"),
        (Format::Pdf, "/tmp/a.pdf"),
        (Format::Latex, "/tmp/a.tex"),
        (Format::Odt, "/tmp/a.odt"),
        (Format::Rtf, "/tmp/a.rtf"),
        (Format::Opml, "/tmp/a.opml"),
    ] {
        let args = build_args(&[], ge_shi, Path::new(target_3), None, None, &[], Some(css));
        assert!(
            !args.iter().any(|a| a.starts_with("--css=")),
            "{} \u{5403}\u{4e0d}\u{4e0b} CSS\u{ff0c}\u{4e0d}\u{8be5}\u{62ff}\u{5230} --css\u{ff1a}{args:?}",
            ge_shi.display_name()
        );
    }
}

#[test]
fn kong_theme_huo_chi_bu_xia_shi_bu_luo_temp_file() {
    assert!(
        theme_css_file("", Format::Epub).unwrap().is_none(),
        "\u{6ca1}\u{6709}\u{4e3b}\u{9898}\u{5c31}\u{4e0d}\u{5e26}"
    );
    assert!(
        theme_css_file("   \n", Format::Epub).unwrap().is_none(),
        "\u{5168}\u{662f}\u{7a7a}\u{767d}\u{4e5f}\u{4e00}\u{6837}"
    );
    assert!(
        theme_css_file("h1 { color: red }", Format::Docx)
            .unwrap()
            .is_none(),
        "docx \u{5403}\u{4e0d}\u{4e0b} CSS\u{ff0c}\u{8fde}\u{6587}\u{4ef6}\u{90fd}\u{4e0d}\u{8be5}\u{843d}"
    );
}

#[test]
#[cfg(unix)]
fn theme_css_zhen_song_dao_pandoc_shou_shang_er_qie_yong_wan_jiu_shan() {
    let dir = temp_dir("css");
    let target = dir.join("\u{6284}\u{5230}\u{7684}.css");
    let target_3 = dir.join("\u{51fa}.epub");
    let jia_pandoc = jia_ming_ling(
        "css-bin",
        &format!(
            "for a in \"$@\"; do case \"$a\" in --css=*) cp \"${{a#--css=}}\" {} ;; esac; done; \
             cat > /dev/null; : > {}",
            target.display(),
            target_3.display()
        ),
    );
    let extras = PandocExtras {
        theme_css: "h1 { color: #123456 }\n".to_string(),
        pandoc_args: String::new(),
    };
    export_with(
        &jia_pandoc.display().to_string(),
        Format::Epub,
        "\u{6b63}\u{6587}",
        &target_3,
        None,
        None,
        &extras,
    )
    .expect("\u{5e94}\u{8be5}\u{6210}\u{529f}");
    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "h1 { color: #123456 }\n",
        "pandoc \u{90a3}\u{4e00}\u{523b}\u{8bfb}\u{5230}\u{7684}\u{90a3}\u{4efd}\u{6587}\u{4ef6}\u{ff0c}\u{5e94}\u{5f53}\u{5c31}\u{662f}\u{6211}\u{4eec}\u{5199}\u{7684}\u{90a3}\u{51e0}\u{884c}"
    );

    for xiang_2 in std::fs::read_dir(std::env::temp_dir()).unwrap().flatten() {
        let ming = xiang_2.file_name().to_string_lossy().to_string();
        if !(ming.starts_with("nota-\u{5bfc}\u{51fa}\u{4e3b}\u{9898}-") && ming.ends_with(".css")) {
            continue;
        }
        let content_2 = std::fs::read_to_string(xiang_2.path()).unwrap_or_default();
        assert_ne!(
            content_2, "h1 { color: #123456 }\n",
            "\u{4e34}\u{65f6} CSS \u{7528}\u{5b8c}\u{5c31}\u{8be5}\u{5220}\u{6389}\u{ff1a}{ming}"
        );
    }
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn mei_install_shi_bao_de_shi_mei_install_er_bu_shi_bie_de() {
    let out = probe_with("nota-\u{7edd}\u{5bf9}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}\u{547d}\u{4ee4}");
    assert_eq!(out.state, ProbeState::Missing);
    assert!(out.message.contains("Could not find"), "{}", out.message);

    assert!(out.detail.contains("install pandoc"), "{}", out.detail);
    assert!(out.version.is_none());
}

#[test]
#[cfg(unix)]
fn wen_dao_ban_ben_jiu_shi_neng_yong() {
    let jia = jia_ming_ling("version", "echo pandoc 3.1.11");
    let out = probe_with(&jia.display().to_string());
    assert_eq!(out.state, ProbeState::Ready, "{}", out.detail);
    assert_eq!(out.version.as_deref(), Some("pandoc 3.1.11"));
    assert!(out.message.contains("pandoc 3.1.11"), "{}", out.message);
}

#[test]
#[cfg(unix)]
fn gua_zhu_de_ming_ling_pan_bu_que_shi_er_bu_shi_pan_mei_install() {
    let jia = jia_ming_ling("hang", "sleep 30");
    let out = probe_with(&jia.display().to_string());
    assert_eq!(out.state, ProbeState::Unknown);
    assert!(
        out.message.contains("did not return within"),
        "{}",
        out.message
    );
}

#[test]
#[cfg(unix)]
fn ren_bu_chu_ban_ben_qi_zi_ye_suan_bu_que_shi() {
    let out = probe_with("false");
    assert_eq!(out.state, ProbeState::Unknown);
    assert!(
        out.message.contains("did not report a version"),
        "{}",
        out.message
    );
}

#[test]
fn kong_ming_ling_bu_beng() {
    let out = probe_with("   ");
    assert_eq!(out.state, ProbeState::Unknown);
    assert!(out.message.contains(ENV_CMD), "{}", out.message);
}

#[test]
#[cfg(unix)]
fn engine_an_pian_ok_shun_xu_zhao_er_bu_shi_peng_dao_shui_suan_shui() {
    use std::os::unix::fs::PermissionsExt;
    let dir = temp_dir("engine");

    for name in ["pdflatex", "xelatex"] {
        let p = dir.join(name);
        std::fs::write(&p, b"#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    let path = OsString::from(dir.display().to_string());
    assert_eq!(find_in_path(ENGINES, &path).as_deref(), Some("xelatex"));

    let kong_ke = temp_dir("engine-noexec");
    std::fs::write(kong_ke.join("xelatex"), b"").unwrap();
    let path = OsString::from(kong_ke.display().to_string());
    assert_eq!(find_in_path(ENGINES, &path), None);

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&kong_ke);
}

#[test]
fn kong_path_li_shen_me_dou_mei_you() {
    assert_eq!(find_in_path(ENGINES, &OsString::from("")), None);
}

#[test]
fn ren_de_chu_na_xie_language_huan_jing_shi_utf8() {
    assert!(shi_utf8("C.UTF-8"));
    assert!(shi_utf8("zh_CN.UTF-8"));

    assert!(shi_utf8("en_US.utf8"));
    assert!(!shi_utf8("C"));
    assert!(!shi_utf8("POSIX"));
    assert!(!shi_utf8("en_US.ISO-8859-1"));
}

#[test]
fn cheng_gong_shi_zhi_tiao_warning_xing_er_qie_you_tiao_shu_shang_xian() {
    let za = "\u{4e00}\u{53e5}\u{6742}\u{97f3}\n[WARNING] \u{7b2c} 1 \u{6761}\n[WARNING] \u{7b2c} 2 \u{6761}\n[WARNING] \u{7b2c} 3 \u{6761}\n[WARNING] \u{7b2c} 4 \u{6761}\n";
    let s = cheng_gong_shi_de_warning(za);
    assert!(s.contains("\u{7b2c} 1 \u{6761}"), "{s}");
    assert!(
        !s.contains("\u{4e00}\u{53e5}\u{6742}\u{97f3}"),
        "\u{6742}\u{97f3}\u{4e0d}\u{8be5}\u{8fdb}\u{63d0}\u{793a}\u{8bed}\u{ff1a}{s}"
    );
    assert!(
        !s.contains("\u{7b2c} 4 \u{6761}"),
        "\u{8d85}\u{8fc7}\u{4e0a}\u{9650}\u{7684}\u{4e0d}\u{5217}\u{ff1a}{s}"
    );
    assert!(
        s.contains("(1 similar messages omitted)"),
        "expected the omitted-warning count: {s}"
    );

    assert_eq!(
        cheng_gong_shi_de_warning("\u{5565}\u{4e5f}\u{6ca1}\u{6709}\n"),
        ""
    );
}

#[test]
#[cfg(unix)]
fn cheng_gong_dan_bao_le_warning_ye_yao_dai_chu_lai() {
    let dir = temp_dir("warn");
    let target = dir.join("\u{51fa}.docx");
    let jia_pandoc = jia_ming_ling(
        "warn-bin",
        &format!(
            "echo '[WARNING] Could not fetch resource \u{70b9}.png' >&2; cat > {}",
            target.display()
        ),
    );
    let warning = export_with(
        &jia_pandoc.display().to_string(),
        Format::Docx,
        "\u{6b63}\u{6587}",
        &target,
        None,
        None,
        &PandocExtras::default(),
    )
    .expect("\u{5e94}\u{8be5}\u{6210}\u{529f}");
    assert!(warning.contains("\u{70b9}.png"), "{warning}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg(unix)]
fn export_ba_body_cong_biao_zhun_shu_ru_wei_jin_qu() {
    let dir = temp_dir("stdin");
    let target = dir.join("out.md");
    let jia_pandoc = jia_ming_ling("stdin-bin", &format!("cat > {}", target.display()));
    export_with(
        &jia_pandoc.display().to_string(),
        Format::Docx,
        "# \u{6807}\u{9898}\n\u{6b63}\u{6587} \u{1f389}\n",
        &target,
        None,
        None,
        &PandocExtras::default(),
    )
    .expect("\u{5e94}\u{8be5}\u{6210}\u{529f}");
    assert_eq!(
        std::fs::read_to_string(&target).unwrap(),
        "# \u{6807}\u{9898}\n\u{6b63}\u{6587} \u{1f389}\n"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg(unix)]
fn xiang_dui_path_de_tu_pian_an_document_directory_zhao() {
    let dir = temp_dir("cwd");
    let target = dir.join("out.md");

    let jia_pandoc = jia_ming_ling(
        "cwd-bin",
        &format!("pwd > {}; cat > /dev/null", target.display()),
    );
    export_with(
        &jia_pandoc.display().to_string(),
        Format::Docx,
        "![](./img.png)",
        &target,
        Some(&dir),
        None,
        &PandocExtras::default(),
    )
    .expect("\u{5e94}\u{8be5}\u{6210}\u{529f}");
    let bao_de_directory = std::fs::read_to_string(&target).unwrap();

    assert!(
        bao_de_directory
            .trim()
            .ends_with(&dir.file_name().unwrap().to_string_lossy().to_string()),
        "\u{8dd1}\u{5728} {bao_de_directory:?}\u{ff0c}\u{5e94}\u{8be5}\u{662f} {dir:?}"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg(unix)]
fn tui_chu_ma_ling_dan_mei_sheng_cheng_file_ye_suan_shi_bai() {
    let dir = temp_dir("nofile");
    let target = dir.join("\u{4e0d}\u{5b58}\u{5728}.pdf");
    let err = export_with(
        "true",
        Format::Pdf,
        "\u{6b63}\u{6587}",
        &target,
        None,
        None,
        &PandocExtras::default(),
    )
    .unwrap_err();
    assert!(err.to_string().contains("was not created"), "{err}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
#[cfg(unix)]
fn shi_bai_shi_ba_pandoc_zi_ji_de_bao_cuo_duan_chu_lai() {
    let dir = temp_dir("fail");
    let target = dir.join("\u{51fa}.docx");
    let jia_pandoc = jia_ming_ling("fail-bin", "echo \u{7b2c} 3 \u{884c}\u{6709}\u{4e2a}\u{8868}\u{683c}\u{770b}\u{4e0d}\u{61c2} >&2; exit 4");
    let err = export_with(
        &jia_pandoc.display().to_string(),
        Format::Docx,
        "\u{6b63}\u{6587}",
        &target,
        None,
        None,
        &PandocExtras::default(),
    )
    .unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("\u{8868}\u{683c}\u{770b}\u{4e0d}\u{61c2}"),
        "{msg}"
    );
    assert!(
        msg.contains("Word Document"),
        "error must name the target format: {msg}"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn mei_install_shi_export_bao_de_shi_mei_install() {
    let dir = temp_dir("nomissing");
    let target = dir.join("\u{51fa}.docx");
    let err = export_with(
        "nota-\u{7edd}\u{5bf9}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}\u{547d}\u{4ee4}",
        Format::Docx,
        "\u{6b63}\u{6587}",
        &target,
        None,
        None,
        &PandocExtras::default(),
    )
    .unwrap_err();
    assert!(err.to_string().contains("Could not find"), "{err}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn parse_write_si_de_path_yu_path_li_de_name_dou_yi_ge_zi_bu_gai() {
    let write_si = parse_2("/opt/pandoc/bin/pandoc")
        .expect("\u{547d}\u{4ee4}\u{4e0d}\u{662f}\u{7a7a}\u{7684}");
    assert_eq!(write_si.program, "/opt/pandoc/bin/pandoc");
    assert!(write_si.env.is_empty(), "\u{666e}\u{901a}\u{8def}\u{5f84}\u{4e0d}\u{8be5}\u{7ed9}\u{4efb}\u{4f55}\u{73af}\u{5883}\u{57ab}\u{7247}");

    #[cfg(unix)]
    {
        let zai_path = parse_2("sh").expect("\u{547d}\u{4ee4}\u{4e0d}\u{662f}\u{7a7a}\u{7684}");
        assert_eq!(zai_path.program, "sh");
        assert_eq!(zai_path.source_2, "PATH");
    }
}

#[test]
fn parse_kong_ming_ling_gei_none_zhao_bu_dao_de_yuan_yang_jiao_hui_qu() {
    assert!(
        parse_2("   ").is_none(),
        "\u{7a7a}\u{547d}\u{4ee4}\u{8be5}\u{7ed9} None"
    );

    let mei_you = parse_2("nota-\u{7edd}\u{5bf9}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}\u{547d}\u{4ee4}")
        .expect("\u{547d}\u{4ee4}\u{4e0d}\u{662f}\u{7a7a}\u{7684}");
    assert_eq!(
        mei_you.program,
        "nota-\u{7edd}\u{5bf9}\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}\u{547d}\u{4ee4}"
    );
    assert!(mei_you.env.is_empty());
}

#[test]
fn parse_args_gen_zhe_ming_ling_yi_qi_ban_guo_qu() {
    let luo = parse_2("/\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}/pandoc --sandbox")
        .expect("\u{547d}\u{4ee4}\u{4e0d}\u{662f}\u{7a7a}\u{7684}");
    assert_eq!(luo.args, vec!["--sandbox".to_string()]);
}

#[test]
fn su_zhu_dian_pian_li_yong_yuan_you_path_na_tiao() {
    let dian = su_zhu_dian_pian();
    let path = dian
        .iter()
        .find(|(k, _)| k == "PATH")
        .expect("\u{5fc5}\u{987b}\u{6709} PATH");
    assert!(path.1.contains("/run/host/usr/bin"), "{}", path.1);
}

#[test]
fn zhi_you_zhen_gua_zhe_su_zhu_root_shi_cai_lie_su_zhu_na_ji_ge_directory() {
    let you_2 = candidates_directory()
        .iter()
        .any(|c| c.dir.starts_with("/run/host"));
    let gai_you =
        Path::new("/run/host/usr/bin").is_dir() || Path::new("/run/host/usr/local/bin").is_dir();
    assert_eq!(you_2, gai_you);
}

#[test]
fn rong_qi_li_neng_saved_to_su_zhu_na_yi_fen_pandoc_shang() {
    let su_zhu = Path::new("/run/host/usr/bin/pandoc");
    if !ke_zhi_xing_file(su_zhu) || zai_path_li("pandoc") {
        return;
    }
    let luo = parse_2("pandoc").expect("\u{547d}\u{4ee4}\u{4e0d}\u{662f}\u{7a7a}\u{7684}");
    assert_eq!(luo.program, su_zhu.display().to_string());
    assert!(
        luo.env.iter().any(|(k, _)| k == "LD_LIBRARY_PATH"),
        "\u{5bbf}\u{4e3b}\u{90a3}\u{4efd}\u{8981}\u{8865}\u{52a8}\u{6001}\u{5e93}\u{8def}\u{5f84}\u{ff08}liblua5.4\u{ff09}"
    );
    assert!(
        luo.env.iter().any(|(k, _)| k == "pandoc_datadir"),
        "\u{5bbf}\u{4e3b}\u{90a3}\u{4efd}\u{7684}\u{6570}\u{636e}\u{76ee}\u{5f55}\u{662f}\u{7f16}\u{8fdb}\u{4e8c}\u{8fdb}\u{5236}\u{7684}\u{ff0c}\u{5f97}\u{9760}\u{8fd9}\u{4e2a}\u{53d8}\u{91cf}\u{6307}\u{8fc7}\u{53bb}"
    );
}
