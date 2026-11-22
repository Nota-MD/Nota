use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::mpsc::Receiver;
use std::time::Duration;

use super::net::UploadPayload;
use super::*;

fn temp_directory(ming: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("nota-upload-test-{}-{ming}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn configured(address_2: &str) -> UploadSettings {
    UploadSettings {
        enabled: true,
        url: address_2.to_string(),
        ..Default::default()
    }
}

#[test]
fn default_shi_guan_de_er_qie_shen_me_dou_mei_tian() {
    let s = UploadSettings::default();
    assert!(
        !s.enabled,
        "\u{603b}\u{5f00}\u{5173}\u{9ed8}\u{8ba4}\u{5fc5}\u{987b}\u{662f}\u{5173}\u{7684}"
    );
    assert!(
        !s.auto,
        "\u{81ea}\u{52a8}\u{4e0a}\u{4f20}\u{9ed8}\u{8ba4}\u{5fc5}\u{987b}\u{662f}\u{5173}\u{7684}"
    );
    assert!(!s.available_2(), "\u{6ca1}\u{914d}\u{7684}\u{8bbe}\u{7f6e}\u{5728}\u{754c}\u{9762}\u{4e0a}\u{5e94}\u{5f53}\u{88ab}\u{5f53}\u{6210}\u{300c}\u{4e0d}\u{80fd}\u{4e0a}\u{4f20}\u{300d}");
    assert_eq!(s.method, UploadMethod::Post);
    assert_eq!(s.field, "file");
    assert_eq!(s.url_path, "data.url");
    assert_eq!(s.headers, "");
    assert_eq!(s.url, "");
    assert_eq!(s.remote_field, "", "\u{7559}\u{7a7a} = \u{7f51}\u{7edc}\u{56fe}\u{7247}\u{4e0d}\u{4e0a}\u{4f20}\u{ff0c}\u{8fd9}\u{662f}\u{9ed8}\u{8ba4}\u{9009}\u{62e9}");

    let text_2 = toml::to_string_pretty(&s).unwrap();
    assert!(
        text_2.contains("enabled = false"),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text_2}"
    );
    assert!(
        text_2.contains("auto = false"),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}\n{text_2}"
    );
}

#[test]
fn bu_yu_she_ren_he_fu_wu_shang() {
    let text_2 = toml::to_string_pretty(&UploadSettings::default()).unwrap();
    let xiao_write = text_2.to_lowercase();
    for jia_3 in [
        "smms", "picgo", "imgur", "qiniu", "aliyun", "upyun", "github", "jsdelivr",
    ] {
        assert!(
            !xiao_write.contains(jia_3),
            "\u{4e0a}\u{4f20}\u{8bbe}\u{7f6e}\u{91cc}\u{51fa}\u{73b0}\u{4e86}\u{670d}\u{52a1}\u{5546}\u{300c}{jia_3}\u{300d}\u{2014}\u{2014}\u{8fd9}\u{4e00}\u{5757}\u{4e0d}\u{8bb8}\u{6709}\u{9884}\u{8bbe}\u{ff0c}\u{5168}\u{662f}\u{7528}\u{6237}\u{586b}\u{7684}\u{ff1a}\n{text_2}"
        );
    }

    assert_eq!(UploadSettings::default().url, "");
    assert_eq!(UploadSettings::default().headers, "");
}

#[test]
fn write_xia_qu_de_value_read_de_hui_lai() {
    let path_3 = temp_directory("roundtrip").join("image-upload.toml");
    let yuan = UploadSettings {
        enabled: true,
        auto: true,
        url: "https://\u{56fe}\u{5e8a}.example.com/api/upload".to_string(),
        method: UploadMethod::Put,
        field: "smfile".to_string(),

        headers: "Authorization: Bearer \u{5047}token-0123456789\nX-Api-Key: \u{5047}key"
            .to_string(),
        url_path: "data.links.url".to_string(),
        remote_field: "url".to_string(),
    };
    write_file_2(&path_3, &yuan).unwrap();

    assert_eq!(read_file_2(&path_3), yuan, "\u{5199}\u{4e0b}\u{53bb}\u{518d}\u{8bfb}\u{56de}\u{6765}\u{5fc5}\u{987b}\u{4e00}\u{6a21}\u{4e00}\u{6837}");

    let text_2 = std::fs::read_to_string(&path_3).unwrap();
    assert!(
        text_2.starts_with("# Nota image upload service settings."),
        "missing file header:\n{text_2}"
    );
    assert!(
        text_2.contains("0600"),
        "\u{6587}\u{4ef6}\u{5934}\u{8981}\u{8bf4}\u{660e}\u{6743}\u{9650}\u{7684}\u{6765}\u{7531}"
    );
}

#[test]
fn read_bu_chu_lai_dang_mei_pei_er_bu_shi_bao_cuo() {
    let directory_2 = temp_directory("broken");

    assert_eq!(
        read_file_2(&directory_2.join("\u{4e0d}\u{5728}.toml")),
        UploadSettings::default(),
        "\u{6587}\u{4ef6}\u{4e0d}\u{5728}\u{8be5}\u{56de}\u{9ed8}\u{8ba4}\u{503c}\u{ff08}\u{ff1d}\u{4ec0}\u{4e48}\u{90fd}\u{4e0d}\u{4f20}\u{ff09}"
    );

    let huai = directory_2.join("\u{574f}.toml");
    std::fs::write(&huai, "\u{8fd9}\u{4e0d}\u{662f} = = toml").unwrap();
    assert_eq!(
        read_file_2(&huai),
        UploadSettings::default(),
        "\u{4e00}\u{4efd}\u{624b}\u{6539}\u{574f}\u{7684}\u{8bbe}\u{7f6e}\u{8be5}\u{8868}\u{73b0}\u{4e3a}\u{300c}\u{56de}\u{5230}\u{9ed8}\u{8ba4}\u{300d}\u{ff0c}\u{800c}\u{4e0d}\u{662f}\u{8ba9}\u{5e94}\u{7528}\u{8d77}\u{4e0d}\u{6765}"
    );

    let shao_xiang = directory_2.join("\u{5c11}.toml");
    std::fs::write(&shao_xiang, "enabled = true\nurl = \"https://a/b\"\n").unwrap();
    let hui_2 = read_file_2(&shao_xiang);
    assert!(hui_2.enabled);
    assert_eq!(
        hui_2.field, "file",
        "\u{7f3a}\u{7684}\u{9879}\u{8981}\u{8865}\u{9ed8}\u{8ba4}\u{503c}"
    );
    assert_eq!(hui_2.url_path, "data.url");
}

#[test]
#[cfg(unix)]
fn settings_file_shi_0600() {
    use std::os::unix::fs::PermissionsExt;
    let path_3 = temp_directory("mode").join("image-upload.toml");
    write_file_2(&path_3, &UploadSettings::default()).unwrap();
    let mo_shi = std::fs::metadata(&path_3).unwrap().permissions().mode() & 0o777;
    assert_eq!(mo_shi, 0o600, "\u{4e0a}\u{4f20}\u{8bbe}\u{7f6e}\u{6587}\u{4ef6}\u{6743}\u{9650}\u{6210}\u{4e86} {mo_shi:o}\u{ff0c}\u{91cc}\u{9762}\u{4f1a}\u{6709} token");

    write_file_2(&path_3, &configured("https://a/b")).unwrap();
    let mo_shi = std::fs::metadata(&path_3).unwrap().permissions().mode() & 0o777;
    assert_eq!(mo_shi, 0o600, "\u{7b2c}\u{4e8c}\u{6b21}\u{5199}\u{4e4b}\u{540e}\u{6743}\u{9650}\u{53d8}\u{6210}\u{4e86} {mo_shi:o}");
}

#[test]
fn qing_qiu_tou_yi_xing_yi_tiao() {
    let tou = parse_qing_qiu_tou(
        "# \u{8fd9}\u{4e00}\u{884c}\u{662f}\u{6ce8}\u{91ca}\n\
         \n\
         Authorization: Bearer a:b:c\n\
         X-Api-Key:   \u{6709}\u{7a7a}\u{683c}\u{7684}\u{503c}  \n",
    )
    .unwrap();
    assert_eq!(
        tou,
        vec![
            ("Authorization".to_string(), "Bearer a:b:c".to_string()),
            (
                "X-Api-Key".to_string(),
                "\u{6709}\u{7a7a}\u{683c}\u{7684}\u{503c}".to_string()
            ),
        ]
    );
}

#[test]
fn write_huai_de_qing_qiu_tou_yao_shuo_qing_chu_shi_di_ji_xing() {
    let e =
        parse_qing_qiu_tou("Authorization: ok\n\u{8fd9}\u{4e0d}\u{662f}\u{4e00}\u{884c}\u{5934}\n")
            .unwrap_err();
    let hua = e.to_string();
    assert!(
        hua.contains("Request header line 2"),
        "expected the failing line number: {hua}"
    );

    assert!(parse_qing_qiu_tou(": v\n").is_err());
    assert!(parse_qing_qiu_tou("A:\n").is_err());
}

#[test]
fn zi_ji_suan_de_tou_bu_xu_yong_hu_write() {
    for jin in [
        "Content-Length: 12",
        "Host: \u{522b}\u{5904}.example",
        "Transfer-Encoding: chunked",
    ] {
        let s = UploadSettings {
            headers: jin.to_string(),
            ..configured("https://a/b")
        };
        let hua = xiao_yan(&s, false).unwrap_err().to_string();
        assert!(
            hua.contains("must not be set manually"),
            "`{jin}` should be rejected, got: {hua}"
        );
    }

    let s = UploadSettings {
        headers: "Content-Type: application/octet-stream".to_string(),
        ..configured("https://a/b")
    };
    assert!(
        xiao_yan(&s, false).is_ok(),
        "content-type \u{662f}\u{7528}\u{6237}\u{80fd}\u{81ea}\u{5df1}\u{5b9a}\u{7684}"
    );
}

#[test]
fn qing_qiu_tou_de_value_bu_xu_shi_zhong_wen() {
    let s = UploadSettings {
        headers: "Authorization: Bearer \u{5047}token".to_string(),
        ..configured("https://a/b")
    };
    let hua = xiao_yan(&s, false).unwrap_err().to_string();
    assert!(
        hua.contains("ASCII") && hua.contains("Authorization"),
        "unexpected error: {hua}"
    );

    let s = UploadSettings {
        headers: "X Api Key: v".to_string(),
        ..configured("https://a/b")
    };
    assert!(xiao_yan(&s, false)
        .unwrap_err()
        .to_string()
        .contains("Invalid request header name"));

    let s = UploadSettings {
        headers: "Authorization: Bearer sk-abc.DEF_123-xyz\nX-Api-Key: aGVsbG8=".to_string(),
        ..configured("https://a/b")
    };
    assert!(xiao_yan(&s, false).is_ok());
}

#[test]
fn mei_pei_ok_shi_mei_yi_tiao_dou_you_yi_ju_ren_hua() {
    let kong = UploadSettings::default();
    assert!(xiao_yan(&kong, false)
        .unwrap_err()
        .to_string()
        .contains("disabled"));

    let mei_address = UploadSettings {
        enabled: true,
        ..Default::default()
    };
    assert!(xiao_yan(&mei_address, false)
        .unwrap_err()
        .to_string()
        .contains("URL is missing"));

    let bu_shi_wang_zhi = configured("/home/\u{6211}/\u{56fe}.png");
    let hua = xiao_yan(&bu_shi_wang_zhi, false).unwrap_err().to_string();
    assert!(hua.contains("HTTP or HTTPS"), "unexpected error: {hua}");
}

#[test]
fn network_tu_pian_jia_put_shi_ming_que_bao_cuo() {
    let s = UploadSettings {
        method: UploadMethod::Put,
        remote_field: "url".to_string(),
        ..configured("https://a/b")
    };
    let hua = xiao_yan(&s, true).unwrap_err().to_string();
    assert!(hua.contains("POST"), "\u{8981}\u{544a}\u{8bc9}\u{7528}\u{6237}\u{600e}\u{4e48}\u{529e}\u{ff0c}\u{800c}\u{4e0d}\u{53ea}\u{662f}\u{8bf4}\u{4e0d}\u{884c}\u{ff1a}{hua}");

    assert!(xiao_yan(&s, false).is_ok());
}

#[test]
fn network_tu_pian_zi_duan_kong_zhe_jiu_bu_chuan() {
    let s = configured("https://a/b");
    let hua = xiao_yan(&s, true).unwrap_err().to_string();
    assert!(hua.contains("not uploaded"), "unexpected error: {hua}");
}

#[test]
fn post_bi_xu_you_zi_duan_ming() {
    let s = UploadSettings {
        field: "  ".to_string(),
        ..configured("https://a/b")
    };
    assert!(xiao_yan(&s, false)
        .unwrap_err()
        .to_string()
        .contains("file field name"));

    let s = UploadSettings {
        method: UploadMethod::Put,
        field: String::new(),
        ..configured("https://a/b")
    };
    assert!(xiao_yan(&s, false).is_ok());
}

#[test]
fn tai_zhang_de_xiang_cun_bu_jin_qu() {
    let s = UploadSettings {
        url: "x".repeat(2049),
        ..Default::default()
    };
    let hua = shape_is_valid(&s).unwrap_err().to_string();
    assert!(
        hua.contains("Service URL"),
        "the error should identify the field: {hua}"
    );
    assert!(shape_is_valid(&UploadSettings::default()).is_ok());
}

#[test]
fn dian_path_neng_qu_dao_zhen_shi_tu_chuang_na_zhong_hui_hua() {
    let hui_2 = "{\"success\":true,\"code\":\"success\",\"data\":{\"url\":\"https://cdn.example.com/a/\u{56fe}.png\",\n       \"links\":{\"url\":\"https://cdn.example.com/a/\u{56fe}.png\"},\"id\":42,\n       \"list\":[{\"url\":\"https://cdn.example.com/b.png\"}]}}";
    let v: serde_json::Value = serde_json::from_str(hui_2).unwrap();

    assert_eq!(
        dian_path_qu_value(&v, "data.url").unwrap(),
        "https://cdn.example.com/a/\u{56fe}.png"
    );
    assert_eq!(
        dian_path_qu_value(&v, "data.links.url").unwrap(),
        "https://cdn.example.com/a/\u{56fe}.png"
    );

    assert_eq!(dian_path_qu_value(&v, "data.id").unwrap(), "42");

    assert_eq!(
        dian_path_qu_value(&v, "data.list.0.url").unwrap(),
        "https://cdn.example.com/b.png"
    );

    assert!(dian_path_qu_value(&v, "data.\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}").is_none());
    assert!(dian_path_qu_value(&v, "data.url.deeper").is_none(), "\u{5728}\u{5b57}\u{7b26}\u{4e32}\u{4e0a}\u{518d}\u{5f80}\u{4e0b}\u{8d70}\u{8981}\u{5f53}\u{53d6}\u{4e0d}\u{5230}");
    assert!(
        dian_path_qu_value(&v, "data.").is_none(),
        "\u{7a7a}\u{7684}\u{4e00}\u{6bb5}\u{5f53}\u{6ca1}\u{5199}\u{5bf9}"
    );

    let n: serde_json::Value = serde_json::from_str(r#"{"data":{"url":null}}"#).unwrap();
    assert!(dian_path_qu_value(&n, "data.url").is_none());
}

#[test]
fn cong_xiang_ying_qu_address_ren_san_zhong_hui_fa() {
    assert_eq!(
        cong_xiang_ying_qu_address(r#"{"data":{"url":"https://a/x.png"}}"#, "data.url").unwrap(),
        "https://a/x.png"
    );

    assert_eq!(
        cong_xiang_ying_qu_address("  https://a/x.png\n", "").unwrap(),
        "https://a/x.png"
    );

    assert_eq!(
        cong_xiang_ying_qu_address(r#""https://a/x.png""#, "").unwrap(),
        "https://a/x.png"
    );
}

#[test]
fn qu_chu_lai_bu_shi_address_jiu_bu_write_jin_document() {
    let e = cong_xiang_ying_qu_address(
        "{\"data\":{\"url\":\"\u{4e0a}\u{4f20}\u{5931}\u{8d25}\u{ff1a}token \u{65e0}\u{6548}\"}}",
        "data.url",
    );
    assert!(e.is_err(), "\u{4e0d}\u{8be5}\u{628a}\u{4e00}\u{53e5}\u{9519}\u{8bef}\u{8bdd}\u{5f53}\u{5730}\u{5740}\u{5199}\u{8fdb}\u{6587}\u{6863}");
    assert!(e
        .unwrap_err()
        .to_string()
        .contains("did not produce an HTTP or HTTPS URL"));

    assert!(cong_xiang_ying_qu_address("error: nope", "").is_err());

    assert!(cong_xiang_ying_qu_address("javascript:alert(1)", "").is_err());

    let hua = cong_xiang_ying_qu_address("<html>502</html>", "data.url")
        .unwrap_err()
        .to_string();
    assert!(
        hua.contains("did not return JSON"),
        "unexpected error: {hua}"
    );

    let hua = cong_xiang_ying_qu_address(r#"{"result":{"img":"https://a/x.png"}}"#, "data.url")
        .unwrap_err()
        .to_string();
    assert!(
        hua.contains("data.url") && hua.contains("result"),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{hua}"
    );
}

#[test]
fn bao_cuo_li_de_hui_hua_yao_ya_xing_xian_zhang() {
    let zhang = format!("<html>\n{}\n</html>", "x".repeat(2000));
    let hua = cong_xiang_ying_qu_address(&zhang, "data.url")
        .unwrap_err()
        .to_string();
    assert!(!hua.contains('\n'), "\u{63d0}\u{793a}\u{6761}\u{91cc}\u{4e0d}\u{8be5}\u{51fa}\u{73b0}\u{6362}\u{884c}\u{ff1a}{hua}");
    assert!(
        hua.chars().count() < 600,
        "\u{56de}\u{8bdd}\u{8981}\u{622a}\u{65ad}\u{ff1a}{}",
        hua.chars().count()
    );
}

#[test]
fn qian_jian_li_de_jian_zhi_ren_write_dui_de_na_ji_zhong_write_fa() {
    let you_2 = |v: &str| {
        format!("---\ntitle: \u{7b14}\u{8bb0}\n{AUTO_UPLOAD_KEY}: {v}\n---\n\u{6b63}\u{6587}\n")
    };
    for value_2 in ["true", "TRUE", "Yes", "on", "\"true\"", "'true'"] {
        assert!(
            prerequisite_enabled_2(&you_2(value_2)),
            "\u{300c}{value_2}\u{300d}\u{8be5}\u{7b97}\u{5f00}\u{7740}"
        );
    }
    for value_2 in ["false", "no", "off", "1", "\u{662f}", "", "maybe"] {
        assert!(
            !prerequisite_enabled_2(&you_2(value_2)),
            "\u{300c}{value_2}\u{300d}\u{4e0d}\u{8be5}\u{7b97}\u{5f00}\u{7740}"
        );
    }
}

#[test]
fn qian_jian_de_bian_jie_yu_biao_ti_na_bian_yi_zhi() {
    assert!(!prerequisite_enabled_2(&format!(
        "\n---\n{AUTO_UPLOAD_KEY}: true\n---\n"
    )));
    assert!(!prerequisite_enabled_2(&format!(
        "\u{6b63}\u{6587}\n---\n{AUTO_UPLOAD_KEY}: true\n---\n"
    )));

    assert!(!prerequisite_enabled_2(&format!(
        "---\ntitle: x\n---\n{AUTO_UPLOAD_KEY}: true\n"
    )));

    assert!(prerequisite_enabled_2(&format!(
        "---\n{AUTO_UPLOAD_KEY}: yes\n...\n"
    )));

    assert!(prerequisite_enabled_2(&format!(
        "---\n  {AUTO_UPLOAD_KEY}: true\n---\n"
    )));

    assert!(!prerequisite_enabled_2(
        "---\nnota-auto-upload-extra: true\n---\n"
    ));
    assert!(!prerequisite_enabled_2("---\nauto-upload: true\n---\n"));

    assert!(!prerequisite_enabled_2(&format!(
        "---\n# {AUTO_UPLOAD_KEY}: true\n---\n"
    )));
}

#[test]
fn automatic_upload_bi_xu_tong_shi_kai_zhe_san_dao_zha() {
    let tu = crate::image::ImageSource::Clipboard {
        zi_jie: vec![0x89, 0x50, 0x4e, 0x47],
        extension_2: "png".to_string(),
    };
    let settings_2 = UploadSettings {
        auto: true,
        ..configured("http://127.0.0.1:9/upload")
    };
    assert!(crate::commands::image_upload::auto_upload_applies(
        &settings_2,
        &tu,
        true
    ));
    assert!(!crate::commands::image_upload::auto_upload_applies(
        &settings_2,
        &tu,
        false
    ));
    let mei_kai_automatic = UploadSettings {
        auto: false,
        ..settings_2.clone()
    };
    assert!(!crate::commands::image_upload::auto_upload_applies(
        &mei_kai_automatic,
        &tu,
        true
    ));
    let network_tu =
        crate::image::ImageSource::NetworkAddress("https://example.com/a.png".to_string());
    assert!(
        !crate::commands::image_upload::auto_upload_applies(&settings_2, &network_tu, true),
        "\u{7f51}\u{7edc}\u{56fe}\u{7247}\u{6c38}\u{8fdc}\u{4e0d}\u{8d70}\u{81ea}\u{52a8}\u{4e0a}\u{4f20}"
    );
}

#[test]
fn automatic_upload_dui_zhe_local_tu_chuang_zhen_emit_yi_ci() {
    let (ji_address, receive_3) = qi_ge_fu_wu_qi(
        "HTTP/1.1 200 OK",
        r#"{"data":{"url":"http://127.0.0.1/assets/auto.png"}}"#,
    );
    let settings_2 = UploadSettings {
        auto: true,
        ..configured(&format!("{ji_address}/upload"))
    };
    let source_2 = crate::image::ImageSource::Clipboard {
        zi_jie: vec![0x89, 0x50, 0x4e, 0x47],
        extension_2: "png".to_string(),
    };
    let qian_jian = format!("---\n{AUTO_UPLOAD_KEY}: true\n---\n\u{6b63}\u{6587}\n");
    assert!(prerequisite_enabled_2(&qian_jian));
    assert!(crate::commands::image_upload::auto_upload_applies(
        &settings_2,
        &source_2,
        true
    ));

    let url = upload_once(
        &settings_2,
        UploadPayload::LocalFile {
            zi_jie: vec![0x89, 0x50, 0x4e, 0x47],
            filename_2: "image.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(url, "http://127.0.0.1/assets/auto.png");

    let yuan_shi = receive_3
        .recv_timeout(Duration::from_secs(10))
        .expect("\u{672c}\u{5730}\u{56fe}\u{5e8a}\u{6ca1}\u{6536}\u{5230}\u{8bf7}\u{6c42}");
    let tou =
        String::from_utf8_lossy(&yuan_shi[..zhao_shuang_huan_xing(&yuan_shi).unwrap()]).to_string();
    let ti = String::from_utf8_lossy(&yuan_shi[zhao_shuang_huan_xing(&yuan_shi).unwrap() + 4..])
        .to_string();
    assert!(
        tou.starts_with("POST /upload"),
        "\u{8bf7}\u{6c42}\u{8def}\u{5f84}\u{4e0d}\u{5bf9}\u{ff1a}{tou}"
    );
    assert!(
        tou.contains("multipart/form-data"),
        "\u{81ea}\u{52a8}\u{4e0a}\u{4f20}\u{5e94}\u{53d1} multipart\u{ff1a}{tou}"
    );
    assert!(
        ti.contains("name=\"file\""),
        "\u{6587}\u{4ef6}\u{5b57}\u{6bb5}\u{4e0d}\u{5bf9}\u{ff1a}{ti}"
    );
    assert!(
        ti.contains("filename=\"image.png\""),
        "\u{6587}\u{4ef6}\u{540d}\u{4e0d}\u{5bf9}\u{ff1a}{ti}"
    );
}

#[test]
fn duo_bu_jian_ti_de_zi_jie_pai_bu_shi_dui_de() {
    let bian_jie = "----NotaBoundary\u{6d4b}\u{8bd5}";
    let ti = duo_bu_jian_ti_file(
        bian_jie,
        "file",
        "\u{56fe}.png",
        "image/png",
        &[0x89, 0x50, 0x4e, 0x47],
    );
    let text_2 = String::from_utf8_lossy(&ti).to_string();

    assert!(
        text_2.starts_with(&format!("--{bian_jie}\r\n")),
        "\u{5f00}\u{5934}\u{4e0d}\u{5bf9}\u{ff1a}{text_2}"
    );
    assert!(
        text_2.ends_with(&format!("--{bian_jie}--\r\n")),
        "\u{7ed3}\u{5c3e}\u{4e0d}\u{5bf9}\u{ff1a}{text_2}"
    );
    assert!(
        !text_2.contains("\n\n"),
        "\u{4e0d}\u{8bb8}\u{51fa}\u{73b0}\u{5149}\u{79c3}\u{79c3}\u{7684} LF \u{6362}\u{884c}"
    );
    assert!(text_2.contains("Content-Disposition: form-data; name=\"file\""));
    assert!(text_2.contains("Content-Type: image/png"));

    assert!(
        text_2.contains("filename=\"\u{56fe}.png\""),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{text_2}"
    );
    assert!(
        text_2.contains("filename*=UTF-8''%E5%9B%BE.png"),
        "\u{975e} ASCII \u{6587}\u{4ef6}\u{540d}\u{8981}\u{7ed9} RFC 5987 \u{90a3}\u{4e00}\u{4efd}\u{ff1a}{text_2}"
    );

    assert!(ti.windows(4).any(|w| w == [0x89, 0x50, 0x4e, 0x47]));

    assert_eq!(
        text_2.matches(&format!("--{bian_jie}")).count(),
        2,
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{text_2}"
    );
}

#[test]
fn filename_li_de_huai_zi_fu_chu_bu_le_na_yi_xing() {
    let ti = duo_bu_jian_ti_file(
        "B",
        "f",
        "a\"b\r\nContent-Type: text/plain",
        "image/png",
        b"x",
    );
    let text_2 = String::from_utf8_lossy(&ti).to_string();
    assert!(
        !text_2.contains("a\"b"),
        "\u{5f15}\u{53f7}\u{8981}\u{6362}\u{6389}\u{ff1a}{text_2}"
    );
    assert!(
        !text_2.contains("\r\nContent-Type: text/plain"),
        "\u{6362}\u{884c}\u{8981}\u{6362}\u{6389}\u{ff1a}{text_2}"
    );

    let tou_xing_shu = text_2
        .lines()
        .filter(|l| l.starts_with("Content-Type:"))
        .count();
    assert_eq!(
        tou_xing_shu, 1,
        "\u{4f53}\u{91cc}\u{5192}\u{5145}\u{51fa}\u{4e86}\u{4e00}\u{884c}\u{5934}\u{ff1a}{text_2}"
    );
}

#[test]
fn content_lei_xing_an_extension_cai() {
    assert_eq!(content_lei_xing("a.png"), "image/png");
    assert_eq!(content_lei_xing("a.JPG"), "image/jpeg");
    assert_eq!(content_lei_xing("a.jpeg"), "image/jpeg");
    assert_eq!(content_lei_xing("a.webp"), "image/webp");
    assert_eq!(content_lei_xing("a.svg"), "image/svg+xml");
    assert_eq!(content_lei_xing("a.avif"), "image/avif");
    assert_eq!(
        content_lei_xing("a.\u{4e0d}\u{8ba4}\u{5f97}"),
        "application/octet-stream"
    );
    assert_eq!(
        content_lei_xing("\u{6ca1}\u{6709}\u{540e}\u{7f00}"),
        "application/octet-stream"
    );
}

fn qi_ge_fu_wu_qi(status_xing: &'static str, hui_hua: &'static str) -> (String, Receiver<Vec<u8>>) {
    let jian_ting =
        TcpListener::bind("127.0.0.1:0").expect("\u{7ed1}\u{56de}\u{73af}\u{7aef}\u{53e3}");
    let address_2 = format!("http://{}", jian_ting.local_addr().unwrap());
    let (emit_2, receive_3) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let Ok((mut liu, _)) = jian_ting.accept() else {
            return;
        };
        let _ = liu.set_read_timeout(Some(Duration::from_secs(10)));
        let qing_qiu = read_yi_ge_qing_qiu(&mut liu);
        let _ = emit_2.send(qing_qiu);
        let hui_2 = format!(
            "{status_xing}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{hui_hua}",
            hui_hua.len()
        );
        let _ = liu.write_all(hui_2.as_bytes());
        let _ = liu.flush();
    });
    (address_2, receive_3)
}

fn read_yi_ge_qing_qiu(liu: &mut std::net::TcpStream) -> Vec<u8> {
    let mut quan_bu = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = liu.read(&mut buf).unwrap_or(0);
        if n == 0 {
            break;
        }
        quan_bu.extend_from_slice(&buf[..n]);
        if let Some(p) = zhao_shuang_huan_xing(&quan_bu) {
            let tou = String::from_utf8_lossy(&quan_bu[..p]).to_string();
            let zhang = tou
                .lines()
                .find_map(|l| {
                    let (k, v) = l.split_once(':')?;
                    if k.eq_ignore_ascii_case("content-length") {
                        v.trim().parse::<usize>().ok()
                    } else {
                        None
                    }
                })
                .unwrap_or(0);
            if quan_bu.len() - (p + 4) >= zhang {
                break;
            }
        }
    }
    quan_bu
}

fn zhao_shuang_huan_xing(bs: &[u8]) -> Option<usize> {
    bs.windows(4).position(|w| w == b"\r\n\r\n")
}

fn tou_li(qing_qiu: &str, ming: &str) -> Option<String> {
    qing_qiu.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        if k.eq_ignore_ascii_case(ming) {
            Some(v.trim().to_string())
        } else {
            None
        }
    })
}

#[test]
fn post_zhen_emit_yi_ci_neng_na_hui_address() {
    let (ji_address, receive_3) = qi_ge_fu_wu_qi(
        "HTTP/1.1 200 OK",
        "{\"success\":true,\"data\":{\"url\":\"https://cdn.example.com/\u{56fe}.png\"}}",
    );

    let s = UploadSettings {
        headers: "# \u{7528}\u{6237}\u{81ea}\u{5df1}\u{7684}\u{5934}\u{ff08}\u{7528}\u{4f8b}\u{91cc}\u{662f}\u{7f16}\u{7684}\u{ff09}\nAuthorization: Bearer fake-token-0123456789"
            .to_string(),
        ..configured(&ji_address)
    };

    let mut tu_pian: Vec<u8> = vec![0x89, 0x50];
    tu_pian.extend_from_slice("\u{5047}\u{5b57}\u{8282}".as_bytes());

    let url = upload_once(
        &s,
        UploadPayload::LocalFile {
            zi_jie: tu_pian.clone(),
            filename_2: "\u{56fe}.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(url, "https://cdn.example.com/\u{56fe}.png");

    let yuan_shi = receive_3
        .recv_timeout(Duration::from_secs(10))
        .expect("\u{670d}\u{52a1}\u{5668}\u{6ca1}\u{6536}\u{5230}\u{8bf7}\u{6c42}");
    let tou_jie_shu =
        zhao_shuang_huan_xing(&yuan_shi).expect("\u{8bf7}\u{6c42}\u{6ca1}\u{6709}\u{5934}");
    let tou = String::from_utf8_lossy(&yuan_shi[..tou_jie_shu]).to_string();
    let ti = &yuan_shi[tou_jie_shu + 4..];

    assert!(
        tou.starts_with("POST "),
        "\u{65b9}\u{6cd5}\u{4e0d}\u{5bf9}\u{ff1a}{tou}"
    );
    assert_eq!(
        tou_li(&tou, "authorization").as_deref(),
        Some("Bearer fake-token-0123456789"),
        "\u{7528}\u{6237}\u{5199}\u{7684}\u{8bf7}\u{6c42}\u{5934}\u{8981}\u{771f}\u{7684}\u{53d1}\u{51fa}\u{53bb}\u{ff08}token \u{5c31}\u{5728}\u{8fd9}\u{513f}\u{ff09}"
    );
    assert!(
        tou_li(&tou, "user-agent").is_some_and(|v| v.starts_with("Nota/")),
        "\u{8981}\u{81ea}\u{62a5}\u{5bb6}\u{95e8}\u{ff1a}{tou}"
    );

    assert_eq!(
        tou.lines()
            .filter(|l| l.to_lowercase().starts_with("authorization:"))
            .count(),
        1
    );
    assert_eq!(
        tou.lines()
            .filter(|l| l.to_lowercase().starts_with("content-type:"))
            .count(),
        1
    );

    let content_lei_xing = tou_li(&tou, "content-type").expect("\u{6ca1}\u{6709} content-type");
    assert!(
        content_lei_xing.starts_with("multipart/form-data; boundary="),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{content_lei_xing}"
    );
    let bian_jie = content_lei_xing
        .split("boundary=")
        .nth(1)
        .unwrap()
        .to_string();

    let mut expected_2 = Vec::new();
    expected_2.extend_from_slice(format!("--{bian_jie}\r\n").as_bytes());
    expected_2.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"");
    expected_2.extend_from_slice("\u{56fe}.png".as_bytes());
    expected_2.extend_from_slice(b"\"");

    expected_2.extend_from_slice(b"; filename*=UTF-8''%E5%9B%BE.png");
    expected_2.extend_from_slice(b"\r\nContent-Type: image/png\r\n\r\n");
    expected_2.extend_from_slice(&tu_pian);
    expected_2.extend_from_slice(format!("\r\n--{bian_jie}--\r\n").as_bytes());
    assert_eq!(
        ti, expected_2.as_slice(),
        "\u{771f}\u{7684}\u{53d1}\u{51fa}\u{53bb}\u{7684}\u{4f53}\u{4e0d}\u{662f}\u{90a3}\u{4e00}\u{6761}\u{ff08}\u{5b9e}\u{9645}\u{6536}\u{5230}\u{ff1a}{}\u{ff09}",
        String::from_utf8_lossy(ti)
    );
}

#[test]
fn put_emit_de_shi_luo_zi_jie_er_qie_yong_hu_de_content_lei_xing_you_xian() {
    let (ji_address, receive_3) =
        qi_ge_fu_wu_qi("HTTP/1.1 200 OK", "https://cdn.example.com/x.png");
    let s = UploadSettings {
        method: UploadMethod::Put,

        url_path: String::new(),
        headers: "Content-Type: application/octet-stream".to_string(),
        ..configured(&ji_address)
    };
    let url = upload_once(
        &s,
        UploadPayload::LocalFile {
            zi_jie: vec![1, 2, 3, 4],
            filename_2: "x.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(url, "https://cdn.example.com/x.png");

    let yuan_shi = receive_3.recv_timeout(Duration::from_secs(10)).unwrap();
    let tou_jie_shu = zhao_shuang_huan_xing(&yuan_shi).unwrap();
    let tou = String::from_utf8_lossy(&yuan_shi[..tou_jie_shu]).to_string();
    let ti = &yuan_shi[tou_jie_shu + 4..];
    assert!(
        tou.starts_with("PUT "),
        "\u{65b9}\u{6cd5}\u{4e0d}\u{5bf9}\u{ff1a}{tou}"
    );
    assert_eq!(
        tou_li(&tou, "content-type").as_deref(),
        Some("application/octet-stream"),
        "\u{7528}\u{6237}\u{81ea}\u{586b}\u{7684} content-type \u{8981}\u{4f18}\u{5148}\u{ff08}\u{6ca1}\u{586b}\u{624d}\u{6309}\u{540e}\u{7f00}\u{731c}\u{ff09}"
    );
    assert_eq!(
        ti,
        &[1, 2, 3, 4],
        "PUT \u{53d1}\u{7684}\u{662f}\u{88f8}\u{5b57}\u{8282}\u{ff0c}\u{4e0d}\u{662f} multipart"
    );
}

#[test]
fn put_mei_tian_content_lei_xing_jiu_an_extension_cai() {
    let (ji_address, receive_3) =
        qi_ge_fu_wu_qi("HTTP/1.1 200 OK", "https://cdn.example.com/x.png");
    let s = UploadSettings {
        method: UploadMethod::Put,
        url_path: String::new(),
        ..configured(&ji_address)
    };
    upload_once(
        &s,
        UploadPayload::LocalFile {
            zi_jie: vec![1],
            filename_2: "x.png".to_string(),
        },
    )
    .unwrap();
    let yuan_shi = receive_3.recv_timeout(Duration::from_secs(10)).unwrap();
    let tou =
        String::from_utf8_lossy(&yuan_shi[..zhao_shuang_huan_xing(&yuan_shi).unwrap()]).to_string();
    assert_eq!(tou_li(&tou, "content-type").as_deref(), Some("image/png"));
}

#[test]
fn network_tu_pian_emit_de_shi_original_address_er_bu_shi_zi_jie() {
    let (ji_address, receive_3) = qi_ge_fu_wu_qi(
        "HTTP/1.1 200 OK",
        "{\"data\":{\"url\":\"https://cdn.example.com/\u{53d6}\u{56de}\u{6765}\u{7684}.png\"}}",
    );
    let s = UploadSettings {
        remote_field: "source_url".to_string(),
        ..configured(&ji_address)
    };
    let url = upload_once(
        &s,
        UploadPayload::NetworkAddress {
            original_address: "https://\u{522b}\u{4eba}.example/a.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(
        url,
        "https://cdn.example.com/\u{53d6}\u{56de}\u{6765}\u{7684}.png"
    );

    let yuan_shi = receive_3.recv_timeout(Duration::from_secs(10)).unwrap();
    let tou_jie_shu = zhao_shuang_huan_xing(&yuan_shi).unwrap();
    let ti = String::from_utf8_lossy(&yuan_shi[tou_jie_shu + 4..]).to_string();
    assert!(
        ti.contains("name=\"source_url\""),
        "\u{5b57}\u{6bb5}\u{540d}\u{8981}\u{6309}\u{8bbe}\u{7f6e}\u{91cc}\u{7684}\u{6765}\u{ff1a}{ti}"
    );
    assert!(
        ti.contains("https://\u{522b}\u{4eba}.example/a.png"),
        "\u{539f}\u{5730}\u{5740}\u{8981}\u{539f}\u{6837}\u{53d1}\u{8fc7}\u{53bb}\u{ff1a}{ti}"
    );
    assert!(
        !ti.contains("filename="),
        "\u{7f51}\u{7edc}\u{56fe}\u{7247}\u{90a3}\u{6761}\u{8def}\u{4e0a}**\u{6ca1}\u{6709}\u{6587}\u{4ef6}\u{90e8}\u{4ef6}**\u{ff08}Nota \u{4e0d}\u{4e0b}\u{8f7d}\u{5b83}\u{ff09}\u{ff1a}{ti}"
    );

    let tou = String::from_utf8_lossy(&yuan_shi[..tou_jie_shu]).to_string();
    assert_eq!(
        tou.matches("POST ").count(),
        1,
        "\u{53ea}\u{53d1}\u{4e86}\u{4e00}\u{4e2a}\u{8bf7}\u{6c42}\u{ff1a}{tou}"
    );
}

#[test]
fn fu_wu_qi_ju_jue_shi_ba_status_ma_he_hui_hua_dai_shang() {
    let (ji_address, _receive) = qi_ge_fu_wu_qi(
        "HTTP/1.1 401 Unauthorized",
        r#"{"message":"token invalid"}"#,
    );
    let hua = upload_once(
        &configured(&ji_address),
        UploadPayload::LocalFile {
            zi_jie: vec![1, 2],
            filename_2: "x.png".to_string(),
        },
    )
    .unwrap_err()
    .to_string();
    assert!(
        hua.contains("401"),
        "\u{8981}\u{5e26}\u{72b6}\u{6001}\u{7801}\u{ff1a}{hua}"
    );
    assert!(
        hua.contains("token invalid"),
        "\u{8981}\u{5e26}\u{670d}\u{52a1}\u{5668}\u{90a3}\u{53e5}\u{8bdd}\u{ff1a}{hua}"
    );

    assert!(!hua.contains("Authorization"), "\u{9519}\u{8bef}\u{8bdd}\u{91cc}\u{4e0d}\u{8be5}\u{56de}\u{663e}\u{8bf7}\u{6c42}\u{5934}\u{ff1a}{hua}");
}
