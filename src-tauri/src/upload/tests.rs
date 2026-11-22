use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::mpsc::Receiver;
use std::time::Duration;

use super::net::UploadPayload;
use super::*;

fn temp_directory(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("nota-upload-test-{}-{name}", std::process::id()));
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
fn default_is_close_two_cut_deep_all_each_field() {
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
fn not_and_set_person_and_service_none_upper() {
    let text_2 = toml::to_string_pretty(&UploadSettings::default()).unwrap();
    let small_write = text_2.to_lowercase();
    for add_3 in [
        "smms", "picgo", "imgur", "qiniu", "aliyun", "upyun", "github", "jsdelivr",
    ] {
        assert!(
            !small_write.contains(add_3),
            "\u{4e0a}\u{4f20}\u{8bbe}\u{7f6e}\u{91cc}\u{51fa}\u{73b0}\u{4e86}\u{670d}\u{52a1}\u{5546}\u{300c}{add_3}\u{300d}\u{2014}\u{2014}\u{8fd9}\u{4e00}\u{5757}\u{4e0d}\u{8bb8}\u{6709}\u{9884}\u{8bbe}\u{ff0c}\u{5168}\u{662f}\u{7528}\u{6237}\u{586b}\u{7684}\u{ff1a}\n{text_2}"
        );
    }

    assert_eq!(UploadSettings::default().url, "");
    assert_eq!(UploadSettings::default().headers, "");
}

#[test]
fn write_lower_get_value_read_return_incoming() {
    let path_3 = temp_directory("roundtrip").join("image-upload.toml");
    let source = UploadSettings {
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
    write_file_2(&path_3, &source).unwrap();

    assert_eq!(read_file_2(&path_3), source, "\u{5199}\u{4e0b}\u{53bb}\u{518d}\u{8bfb}\u{56de}\u{6765}\u{5fc5}\u{987b}\u{4e00}\u{6a21}\u{4e00}\u{6837}");

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
fn read_not_out_incoming_when_each_match_two_not_is_package_error() {
    let directory_2 = temp_directory("broken");

    assert_eq!(
        read_file_2(&directory_2.join("\u{4e0d}\u{5728}.toml")),
        UploadSettings::default(),
        "\u{6587}\u{4ef6}\u{4e0d}\u{5728}\u{8be5}\u{56de}\u{9ed8}\u{8ba4}\u{503c}\u{ff08}\u{ff1d}\u{4ec0}\u{4e48}\u{90fd}\u{4e0d}\u{4f20}\u{ff09}"
    );

    let broken = directory_2.join("\u{574f}.toml");
    std::fs::write(&broken, "\u{8fd9}\u{4e0d}\u{662f} = = toml").unwrap();
    assert_eq!(
        read_file_2(&broken),
        UploadSettings::default(),
        "\u{4e00}\u{4efd}\u{624b}\u{6539}\u{574f}\u{7684}\u{8bbe}\u{7f6e}\u{8be5}\u{8868}\u{73b0}\u{4e3a}\u{300c}\u{56de}\u{5230}\u{9ed8}\u{8ba4}\u{300d}\u{ff0c}\u{800c}\u{4e0d}\u{662f}\u{8ba9}\u{5e94}\u{7528}\u{8d77}\u{4e0d}\u{6765}"
    );

    let few_item = directory_2.join("\u{5c11}.toml");
    std::fs::write(&few_item, "enabled = true\nurl = \"https://a/b\"\n").unwrap();
    let return_2 = read_file_2(&few_item);
    assert!(return_2.enabled);
    assert_eq!(
        return_2.field, "file",
        "\u{7f3a}\u{7684}\u{9879}\u{8981}\u{8865}\u{9ed8}\u{8ba4}\u{503c}"
    );
    assert_eq!(return_2.url_path, "data.url");
}

#[test]
#[cfg(unix)]
fn settings_file_is_0600() {
    use std::os::unix::fs::PermissionsExt;
    let path_3 = temp_directory("mode").join("image-upload.toml");
    write_file_2(&path_3, &UploadSettings::default()).unwrap();
    let suffix_is = std::fs::metadata(&path_3).unwrap().permissions().mode() & 0o777;
    assert_eq!(suffix_is, 0o600, "\u{4e0a}\u{4f20}\u{8bbe}\u{7f6e}\u{6587}\u{4ef6}\u{6743}\u{9650}\u{6210}\u{4e86} {suffix_is:o}\u{ff0c}\u{91cc}\u{9762}\u{4f1a}\u{6709} token");

    write_file_2(&path_3, &configured("https://a/b")).unwrap();
    let suffix_is = std::fs::metadata(&path_3).unwrap().permissions().mode() & 0o777;
    assert_eq!(suffix_is, 0o600, "\u{7b2c}\u{4e8c}\u{6b21}\u{5199}\u{4e4b}\u{540e}\u{6743}\u{9650}\u{53d8}\u{6210}\u{4e86} {suffix_is:o}");
}

#[test]
fn request_request_header_one_line_one_item() {
    let header = parse_request_request_header(
        "# \u{8fd9}\u{4e00}\u{884c}\u{662f}\u{6ce8}\u{91ca}\n\
         \n\
         Authorization: Bearer a:b:c\n\
         X-Api-Key:   \u{6709}\u{7a7a}\u{683c}\u{7684}\u{503c}  \n",
    )
    .unwrap();
    assert_eq!(
        header,
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
fn write_broken_request_request_header_need_say_request_out_is_base_record_line() {
    let e = parse_request_request_header(
        "Authorization: ok\n\u{8fd9}\u{4e0d}\u{662f}\u{4e00}\u{884c}\u{5934}\n",
    )
    .unwrap_err();
    let render = e.to_string();
    assert!(
        render.contains("Request header line 2"),
        "expected the failing line number: {render}"
    );

    assert!(parse_request_request_header(": v\n").is_err());
    assert!(parse_request_request_header("A:\n").is_err());
}

#[test]
fn character_record_compute_header_not_required_use_call_write() {
    for enter in [
        "Content-Length: 12",
        "Host: \u{522b}\u{5904}.example",
        "Transfer-Encoding: chunked",
    ] {
        let s = UploadSettings {
            headers: enter.to_string(),
            ..configured("https://a/b")
        };
        let render = small_validate(&s, false).unwrap_err().to_string();
        assert!(
            render.contains("must not be set manually"),
            "`{enter}` should be rejected, got: {render}"
        );
    }

    let s = UploadSettings {
        headers: "Content-Type: application/octet-stream".to_string(),
        ..configured("https://a/b")
    };
    assert!(
        small_validate(&s, false).is_ok(),
        "content-type \u{662f}\u{7528}\u{6237}\u{80fd}\u{81ea}\u{5df1}\u{5b9a}\u{7684}"
    );
}

#[test]
fn request_request_header_value_not_required_is_middle_text() {
    let s = UploadSettings {
        headers: "Authorization: Bearer \u{5047}token".to_string(),
        ..configured("https://a/b")
    };
    let render = small_validate(&s, false).unwrap_err().to_string();
    assert!(
        render.contains("ASCII") && render.contains("Authorization"),
        "unexpected error: {render}"
    );

    let s = UploadSettings {
        headers: "X Api Key: v".to_string(),
        ..configured("https://a/b")
    };
    assert!(small_validate(&s, false)
        .unwrap_err()
        .to_string()
        .contains("Invalid request header name"));

    let s = UploadSettings {
        headers: "Authorization: Bearer sk-abc.DEF_123-xyz\nX-Api-Key: aGVsbG8=".to_string(),
        ..configured("https://a/b")
    };
    assert!(small_validate(&s, false).is_ok());
}

#[test]
fn each_match_ok_is_each_one_item_all_has_one_sentence_person_render() {
    let empty = UploadSettings::default();
    assert!(small_validate(&empty, false)
        .unwrap_err()
        .to_string()
        .contains("disabled"));

    let each_address = UploadSettings {
        enabled: true,
        ..Default::default()
    };
    assert!(small_validate(&each_address, false)
        .unwrap_err()
        .to_string()
        .contains("URL is missing"));

    let not_is_web_only = configured("/home/\u{6211}/\u{56fe}.png");
    let render = small_validate(&not_is_web_only, false)
        .unwrap_err()
        .to_string();
    assert!(
        render.contains("HTTP or HTTPS"),
        "unexpected error: {render}"
    );
}

#[test]
fn network_image_piece_add_put_is_name_missing_package_error() {
    let s = UploadSettings {
        method: UploadMethod::Put,
        remote_field: "url".to_string(),
        ..configured("https://a/b")
    };
    let render = small_validate(&s, true).unwrap_err().to_string();
    assert!(render.contains("POST"), "\u{8981}\u{544a}\u{8bc9}\u{7528}\u{6237}\u{600e}\u{4e48}\u{529e}\u{ff0c}\u{800c}\u{4e0d}\u{53ea}\u{662f}\u{8bf4}\u{4e0d}\u{884c}\u{ff1a}{render}");

    assert!(small_validate(&s, false).is_ok());
}

#[test]
fn network_image_piece_character_segment_empty_old_not_stream() {
    let s = configured("https://a/b");
    let render = small_validate(&s, true).unwrap_err().to_string();
    assert!(
        render.contains("not uploaded"),
        "unexpected error: {render}"
    );
}

#[test]
fn post_must_required_has_character_segment_name() {
    let s = UploadSettings {
        field: "  ".to_string(),
        ..configured("https://a/b")
    };
    assert!(small_validate(&s, false)
        .unwrap_err()
        .to_string()
        .contains("file field name"));

    let s = UploadSettings {
        method: UploadMethod::Put,
        field: String::new(),
        ..configured("https://a/b")
    };
    assert!(small_validate(&s, false).is_ok());
}

#[test]
fn platform_length_item_store_not_enter_get() {
    let s = UploadSettings {
        url: "x".repeat(2049),
        ..Default::default()
    };
    let render = shape_is_valid(&s).unwrap_err().to_string();
    assert!(
        render.contains("Service URL"),
        "the error should identify the field: {render}"
    );
    assert!(shape_is_valid(&UploadSettings::default()).is_ok());
}

#[test]
fn point_path_can_get_to_real_is_image_window_that_middle_return_render() {
    let return_2 = "{\"success\":true,\"code\":\"success\",\"data\":{\"url\":\"https://cdn.example.com/a/\u{56fe}.png\",\n       \"links\":{\"url\":\"https://cdn.example.com/a/\u{56fe}.png\"},\"id\":42,\n       \"list\":[{\"url\":\"https://cdn.example.com/b.png\"}]}}";
    let v: serde_json::Value = serde_json::from_str(return_2).unwrap();

    assert_eq!(
        point_path_get_value(&v, "data.url").unwrap(),
        "https://cdn.example.com/a/\u{56fe}.png"
    );
    assert_eq!(
        point_path_get_value(&v, "data.links.url").unwrap(),
        "https://cdn.example.com/a/\u{56fe}.png"
    );

    assert_eq!(point_path_get_value(&v, "data.id").unwrap(), "42");

    assert_eq!(
        point_path_get_value(&v, "data.list.0.url").unwrap(),
        "https://cdn.example.com/b.png"
    );

    assert!(point_path_get_value(&v, "data.\u{6ca1}\u{6709}\u{8fd9}\u{4e2a}").is_none());
    assert!(point_path_get_value(&v, "data.url.deeper").is_none(), "\u{5728}\u{5b57}\u{7b26}\u{4e32}\u{4e0a}\u{518d}\u{5f80}\u{4e0b}\u{8d70}\u{8981}\u{5f53}\u{53d6}\u{4e0d}\u{5230}");
    assert!(
        point_path_get_value(&v, "data.").is_none(),
        "\u{7a7a}\u{7684}\u{4e00}\u{6bb5}\u{5f53}\u{6ca1}\u{5199}\u{5bf9}"
    );

    let n: serde_json::Value = serde_json::from_str(r#"{"data":{"url":null}}"#).unwrap();
    assert!(point_path_get_value(&n, "data.url").is_none());
}

#[test]
fn from_item_should_get_address_person_three_middle_return_method() {
    assert_eq!(
        from_item_should_get_address(r#"{"data":{"url":"https://a/x.png"}}"#, "data.url").unwrap(),
        "https://a/x.png"
    );

    assert_eq!(
        from_item_should_get_address("  https://a/x.png\n", "").unwrap(),
        "https://a/x.png"
    );

    assert_eq!(
        from_item_should_get_address(r#""https://a/x.png""#, "").unwrap(),
        "https://a/x.png"
    );
}

#[test]
fn get_out_incoming_not_is_address_old_not_write_enter_document() {
    let e = from_item_should_get_address(
        "{\"data\":{\"url\":\"\u{4e0a}\u{4f20}\u{5931}\u{8d25}\u{ff1a}token \u{65e0}\u{6548}\"}}",
        "data.url",
    );
    assert!(e.is_err(), "\u{4e0d}\u{8be5}\u{628a}\u{4e00}\u{53e5}\u{9519}\u{8bef}\u{8bdd}\u{5f53}\u{5730}\u{5740}\u{5199}\u{8fdb}\u{6587}\u{6863}");
    assert!(e
        .unwrap_err()
        .to_string()
        .contains("did not produce an HTTP or HTTPS URL"));

    assert!(from_item_should_get_address("error: nope", "").is_err());

    assert!(from_item_should_get_address("javascript:alert(1)", "").is_err());

    let render = from_item_should_get_address("<html>502</html>", "data.url")
        .unwrap_err()
        .to_string();
    assert!(
        render.contains("did not return JSON"),
        "unexpected error: {render}"
    );

    let render =
        from_item_should_get_address(r#"{"result":{"img":"https://a/x.png"}}"#, "data.url")
            .unwrap_err()
            .to_string();
    assert!(
        render.contains("data.url") && render.contains("result"),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{render}"
    );
}

#[test]
fn package_error_inner_return_render_need_press_line_thread_length() {
    let length = format!("<html>\n{}\n</html>", "x".repeat(2000));
    let render = from_item_should_get_address(&length, "data.url")
        .unwrap_err()
        .to_string();
    assert!(!render.contains('\n'), "\u{63d0}\u{793a}\u{6761}\u{91cc}\u{4e0d}\u{8be5}\u{51fa}\u{73b0}\u{6362}\u{884c}\u{ff1a}{render}");
    assert!(
        render.chars().count() < 600,
        "\u{56de}\u{8bdd}\u{8981}\u{622a}\u{65ad}\u{ff1a}{}",
        render.chars().count()
    );
}

#[test]
fn before_check_inner_check_only_person_write_pair_that_record_middle_write_method() {
    let has_2 = |v: &str| {
        format!("---\ntitle: \u{7b14}\u{8bb0}\n{AUTO_UPLOAD_KEY}: {v}\n---\n\u{6b63}\u{6587}\n")
    };
    for value_2 in ["true", "TRUE", "Yes", "on", "\"true\"", "'true'"] {
        assert!(
            prerequisite_enabled_2(&has_2(value_2)),
            "\u{300c}{value_2}\u{300d}\u{8be5}\u{7b97}\u{5f00}\u{7740}"
        );
    }
    for value_2 in ["false", "no", "off", "1", "\u{662f}", "", "maybe"] {
        assert!(
            !prerequisite_enabled_2(&has_2(value_2)),
            "\u{300c}{value_2}\u{300d}\u{4e0d}\u{8be5}\u{7b97}\u{5f00}\u{7740}"
        );
    }
}

#[test]
fn before_check_edit_boundary_and_table_question_that_edit_one_only() {
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
fn automatic_upload_must_required_same_is_start_three_to_click() {
    let image = crate::image::ImageSource::Clipboard {
        bytes: vec![0x89, 0x50, 0x4e, 0x47],
        extension_2: "png".to_string(),
    };
    let settings_2 = UploadSettings {
        auto: true,
        ..configured("http://127.0.0.1:9/upload")
    };
    assert!(crate::commands::image_upload::auto_upload_applies(
        &settings_2,
        &image,
        true
    ));
    assert!(!crate::commands::image_upload::auto_upload_applies(
        &settings_2,
        &image,
        false
    ));
    let each_start_automatic = UploadSettings {
        auto: false,
        ..settings_2.clone()
    };
    assert!(!crate::commands::image_upload::auto_upload_applies(
        &each_start_automatic,
        &image,
        true
    ));
    let network_image =
        crate::image::ImageSource::NetworkAddress("https://example.com/a.png".to_string());
    assert!(
        !crate::commands::image_upload::auto_upload_applies(&settings_2, &network_image, true),
        "\u{7f51}\u{7edc}\u{56fe}\u{7247}\u{6c38}\u{8fdc}\u{4e0d}\u{8d70}\u{81ea}\u{52a8}\u{4e0a}\u{4f20}"
    );
}

#[test]
fn automatic_upload_pair_local_image_window_real_emit_one_word() {
    let (record_address, receive_3) = start_service_none_start(
        "HTTP/1.1 200 OK",
        r#"{"data":{"url":"http://127.0.0.1/assets/auto.png"}}"#,
    );
    let settings_2 = UploadSettings {
        auto: true,
        ..configured(&format!("{record_address}/upload"))
    };
    let source_2 = crate::image::ImageSource::Clipboard {
        bytes: vec![0x89, 0x50, 0x4e, 0x47],
        extension_2: "png".to_string(),
    };
    let before_check = format!("---\n{AUTO_UPLOAD_KEY}: true\n---\n\u{6b63}\u{6587}\n");
    assert!(prerequisite_enabled_2(&before_check));
    assert!(crate::commands::image_upload::auto_upload_applies(
        &settings_2,
        &source_2,
        true
    ));

    let url = upload_once(
        &settings_2,
        UploadPayload::LocalFile {
            bytes: vec![0x89, 0x50, 0x4e, 0x47],
            filename_2: "image.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(url, "http://127.0.0.1/assets/auto.png");

    let source_is = receive_3
        .recv_timeout(Duration::from_secs(10))
        .expect("\u{672c}\u{5730}\u{56fe}\u{5e8a}\u{6ca1}\u{6536}\u{5230}\u{8bf7}\u{6c42}");
    let header =
        String::from_utf8_lossy(&source_is[..find_double_replace_line(&source_is).unwrap()])
            .to_string();
    let question =
        String::from_utf8_lossy(&source_is[find_double_replace_line(&source_is).unwrap() + 4..])
            .to_string();
    assert!(
        header.starts_with("POST /upload"),
        "\u{8bf7}\u{6c42}\u{8def}\u{5f84}\u{4e0d}\u{5bf9}\u{ff1a}{header}"
    );
    assert!(
        header.contains("multipart/form-data"),
        "\u{81ea}\u{52a8}\u{4e0a}\u{4f20}\u{5e94}\u{53d1} multipart\u{ff1a}{header}"
    );
    assert!(
        question.contains("name=\"file\""),
        "\u{6587}\u{4ef6}\u{5b57}\u{6bb5}\u{4e0d}\u{5bf9}\u{ff1a}{question}"
    );
    assert!(
        question.contains("filename=\"image.png\""),
        "\u{6587}\u{4ef6}\u{540d}\u{4e0d}\u{5bf9}\u{ff1a}{question}"
    );
}

#[test]
fn multiple_not_check_question_character_boundary_schedule_not_is_pair() {
    let edit_boundary = "----NotaBoundary\u{6d4b}\u{8bd5}";
    let question = multiple_not_check_question_file(
        edit_boundary,
        "file",
        "\u{56fe}.png",
        "image/png",
        &[0x89, 0x50, 0x4e, 0x47],
    );
    let text_2 = String::from_utf8_lossy(&question).to_string();

    assert!(
        text_2.starts_with(&format!("--{edit_boundary}\r\n")),
        "\u{5f00}\u{5934}\u{4e0d}\u{5bf9}\u{ff1a}{text_2}"
    );
    assert!(
        text_2.ends_with(&format!("--{edit_boundary}--\r\n")),
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

    assert!(question.windows(4).any(|w| w == [0x89, 0x50, 0x4e, 0x47]));

    assert_eq!(
        text_2.matches(&format!("--{edit_boundary}")).count(),
        2,
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{text_2}"
    );
}

#[test]
fn filename_inner_broken_character_service_out_not_that_one_line() {
    let question = multiple_not_check_question_file(
        "B",
        "f",
        "a\"b\r\nContent-Type: text/plain",
        "image/png",
        b"x",
    );
    let text_2 = String::from_utf8_lossy(&question).to_string();
    assert!(
        !text_2.contains("a\"b"),
        "\u{5f15}\u{53f7}\u{8981}\u{6362}\u{6389}\u{ff1a}{text_2}"
    );
    assert!(
        !text_2.contains("\r\nContent-Type: text/plain"),
        "\u{6362}\u{884c}\u{8981}\u{6362}\u{6389}\u{ff1a}{text_2}"
    );

    let header_line_data = text_2
        .lines()
        .filter(|l| l.starts_with("Content-Type:"))
        .count();
    assert_eq!(
        header_line_data, 1,
        "\u{4f53}\u{91cc}\u{5192}\u{5145}\u{51fa}\u{4e86}\u{4e00}\u{884c}\u{5934}\u{ff1a}{text_2}"
    );
}

#[test]
fn content_kind_line_by_extension_extract() {
    assert_eq!(content_kind_line("a.png"), "image/png");
    assert_eq!(content_kind_line("a.JPG"), "image/jpeg");
    assert_eq!(content_kind_line("a.jpeg"), "image/jpeg");
    assert_eq!(content_kind_line("a.webp"), "image/webp");
    assert_eq!(content_kind_line("a.svg"), "image/svg+xml");
    assert_eq!(content_kind_line("a.avif"), "image/avif");
    assert_eq!(
        content_kind_line("a.\u{4e0d}\u{8ba4}\u{5f97}"),
        "application/octet-stream"
    );
    assert_eq!(
        content_kind_line("\u{6ca1}\u{6709}\u{540e}\u{7f00}"),
        "application/octet-stream"
    );
}

fn start_service_none_start(
    status_line: &'static str,
    return_render: &'static str,
) -> (String, Receiver<Vec<u8>>) {
    let check_listen =
        TcpListener::bind("127.0.0.1:0").expect("\u{7ed1}\u{56de}\u{73af}\u{7aef}\u{53e3}");
    let address_2 = format!("http://{}", check_listen.local_addr().unwrap());
    let (emit_2, receive_3) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let Ok((mut stream, _)) = check_listen.accept() else {
            return;
        };
        let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
        let request_data = read_one_request_request(&mut stream);
        let _ = emit_2.send(request_data);
        let return_2 = format!(
            "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{return_render}",
            return_render.len()
        );
        let _ = stream.write_all(return_2.as_bytes());
        let _ = stream.flush();
    });
    (address_2, receive_3)
}

fn read_one_request_request(stream: &mut std::net::TcpStream) -> Vec<u8> {
    let mut full_not = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = stream.read(&mut buf).unwrap_or(0);
        if n == 0 {
            break;
        }
        full_not.extend_from_slice(&buf[..n]);
        if let Some(p) = find_double_replace_line(&full_not) {
            let header = String::from_utf8_lossy(&full_not[..p]).to_string();
            let length = header
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
            if full_not.len() - (p + 4) >= length {
                break;
            }
        }
    }
    full_not
}

fn find_double_replace_line(bs: &[u8]) -> Option<usize> {
    bs.windows(4).position(|w| w == b"\r\n\r\n")
}

fn header_inner(request_data: &str, name: &str) -> Option<String> {
    request_data.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        if k.eq_ignore_ascii_case(name) {
            Some(v.trim().to_string())
        } else {
            None
        }
    })
}

#[test]
fn post_real_emit_one_word_can_that_return_address() {
    let (record_address, receive_3) = start_service_none_start(
        "HTTP/1.1 200 OK",
        "{\"success\":true,\"data\":{\"url\":\"https://cdn.example.com/\u{56fe}.png\"}}",
    );

    let s = UploadSettings {
        headers: "# \u{7528}\u{6237}\u{81ea}\u{5df1}\u{7684}\u{5934}\u{ff08}\u{7528}\u{4f8b}\u{91cc}\u{662f}\u{7f16}\u{7684}\u{ff09}\nAuthorization: Bearer fake-token-0123456789"
            .to_string(),
        ..configured(&record_address)
    };

    let mut image_piece: Vec<u8> = vec![0x89, 0x50];
    image_piece.extend_from_slice("\u{5047}\u{5b57}\u{8282}".as_bytes());

    let url = upload_once(
        &s,
        UploadPayload::LocalFile {
            bytes: image_piece.clone(),
            filename_2: "\u{56fe}.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(url, "https://cdn.example.com/\u{56fe}.png");

    let source_is = receive_3
        .recv_timeout(Duration::from_secs(10))
        .expect("\u{670d}\u{52a1}\u{5668}\u{6ca1}\u{6536}\u{5230}\u{8bf7}\u{6c42}");
    let header_boundary_data =
        find_double_replace_line(&source_is).expect("\u{8bf7}\u{6c42}\u{6ca1}\u{6709}\u{5934}");
    let header = String::from_utf8_lossy(&source_is[..header_boundary_data]).to_string();
    let question = &source_is[header_boundary_data + 4..];

    assert!(
        header.starts_with("POST "),
        "\u{65b9}\u{6cd5}\u{4e0d}\u{5bf9}\u{ff1a}{header}"
    );
    assert_eq!(
        header_inner(&header, "authorization").as_deref(),
        Some("Bearer fake-token-0123456789"),
        "\u{7528}\u{6237}\u{5199}\u{7684}\u{8bf7}\u{6c42}\u{5934}\u{8981}\u{771f}\u{7684}\u{53d1}\u{51fa}\u{53bb}\u{ff08}token \u{5c31}\u{5728}\u{8fd9}\u{513f}\u{ff09}"
    );
    assert!(
        header_inner(&header, "user-agent").is_some_and(|v| v.starts_with("Nota/")),
        "\u{8981}\u{81ea}\u{62a5}\u{5bb6}\u{95e8}\u{ff1a}{header}"
    );

    assert_eq!(
        header
            .lines()
            .filter(|l| l.to_lowercase().starts_with("authorization:"))
            .count(),
        1
    );
    assert_eq!(
        header
            .lines()
            .filter(|l| l.to_lowercase().starts_with("content-type:"))
            .count(),
        1
    );

    let content_kind_line =
        header_inner(&header, "content-type").expect("\u{6ca1}\u{6709} content-type");
    assert!(
        content_kind_line.starts_with("multipart/form-data; boundary="),
        "\u{5b9e}\u{9645}\u{662f}\u{ff1a}{content_kind_line}"
    );
    let edit_boundary = content_kind_line
        .split("boundary=")
        .nth(1)
        .unwrap()
        .to_string();

    let mut expected_2 = Vec::new();
    expected_2.extend_from_slice(format!("--{edit_boundary}\r\n").as_bytes());
    expected_2.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"");
    expected_2.extend_from_slice("\u{56fe}.png".as_bytes());
    expected_2.extend_from_slice(b"\"");

    expected_2.extend_from_slice(b"; filename*=UTF-8''%E5%9B%BE.png");
    expected_2.extend_from_slice(b"\r\nContent-Type: image/png\r\n\r\n");
    expected_2.extend_from_slice(&image_piece);
    expected_2.extend_from_slice(format!("\r\n--{edit_boundary}--\r\n").as_bytes());
    assert_eq!(
        question, expected_2.as_slice(),
        "\u{771f}\u{7684}\u{53d1}\u{51fa}\u{53bb}\u{7684}\u{4f53}\u{4e0d}\u{662f}\u{90a3}\u{4e00}\u{6761}\u{ff08}\u{5b9e}\u{9645}\u{6536}\u{5230}\u{ff1a}{}\u{ff09}",
        String::from_utf8_lossy(question)
    );
}

#[test]
fn put_emit_is_land_character_boundary_two_cut_use_call_content_kind_line_has_thread() {
    let (record_address, receive_3) =
        start_service_none_start("HTTP/1.1 200 OK", "https://cdn.example.com/x.png");
    let s = UploadSettings {
        method: UploadMethod::Put,

        url_path: String::new(),
        headers: "Content-Type: application/octet-stream".to_string(),
        ..configured(&record_address)
    };
    let url = upload_once(
        &s,
        UploadPayload::LocalFile {
            bytes: vec![1, 2, 3, 4],
            filename_2: "x.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(url, "https://cdn.example.com/x.png");

    let source_is = receive_3.recv_timeout(Duration::from_secs(10)).unwrap();
    let header_boundary_data = find_double_replace_line(&source_is).unwrap();
    let header = String::from_utf8_lossy(&source_is[..header_boundary_data]).to_string();
    let question = &source_is[header_boundary_data + 4..];
    assert!(
        header.starts_with("PUT "),
        "\u{65b9}\u{6cd5}\u{4e0d}\u{5bf9}\u{ff1a}{header}"
    );
    assert_eq!(
        header_inner(&header, "content-type").as_deref(),
        Some("application/octet-stream"),
        "\u{7528}\u{6237}\u{81ea}\u{586b}\u{7684} content-type \u{8981}\u{4f18}\u{5148}\u{ff08}\u{6ca1}\u{586b}\u{624d}\u{6309}\u{540e}\u{7f00}\u{731c}\u{ff09}"
    );
    assert_eq!(
        question,
        &[1, 2, 3, 4],
        "PUT \u{53d1}\u{7684}\u{662f}\u{88f8}\u{5b57}\u{8282}\u{ff0c}\u{4e0d}\u{662f} multipart"
    );
}

#[test]
fn put_each_field_content_kind_line_old_by_extension_extract() {
    let (record_address, receive_3) =
        start_service_none_start("HTTP/1.1 200 OK", "https://cdn.example.com/x.png");
    let s = UploadSettings {
        method: UploadMethod::Put,
        url_path: String::new(),
        ..configured(&record_address)
    };
    upload_once(
        &s,
        UploadPayload::LocalFile {
            bytes: vec![1],
            filename_2: "x.png".to_string(),
        },
    )
    .unwrap();
    let source_is = receive_3.recv_timeout(Duration::from_secs(10)).unwrap();
    let header =
        String::from_utf8_lossy(&source_is[..find_double_replace_line(&source_is).unwrap()])
            .to_string();
    assert_eq!(
        header_inner(&header, "content-type").as_deref(),
        Some("image/png")
    );
}

#[test]
fn network_image_piece_emit_is_original_address_two_not_is_character_boundary() {
    let (record_address, receive_3) = start_service_none_start(
        "HTTP/1.1 200 OK",
        "{\"data\":{\"url\":\"https://cdn.example.com/\u{53d6}\u{56de}\u{6765}\u{7684}.png\"}}",
    );
    let s = UploadSettings {
        remote_field: "source_url".to_string(),
        ..configured(&record_address)
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

    let source_is = receive_3.recv_timeout(Duration::from_secs(10)).unwrap();
    let header_boundary_data = find_double_replace_line(&source_is).unwrap();
    let question = String::from_utf8_lossy(&source_is[header_boundary_data + 4..]).to_string();
    assert!(
        question.contains("name=\"source_url\""),
        "\u{5b57}\u{6bb5}\u{540d}\u{8981}\u{6309}\u{8bbe}\u{7f6e}\u{91cc}\u{7684}\u{6765}\u{ff1a}{question}"
    );
    assert!(
        question.contains("https://\u{522b}\u{4eba}.example/a.png"),
        "\u{539f}\u{5730}\u{5740}\u{8981}\u{539f}\u{6837}\u{53d1}\u{8fc7}\u{53bb}\u{ff1a}{question}"
    );
    assert!(
        !question.contains("filename="),
        "\u{7f51}\u{7edc}\u{56fe}\u{7247}\u{90a3}\u{6761}\u{8def}\u{4e0a}**\u{6ca1}\u{6709}\u{6587}\u{4ef6}\u{90e8}\u{4ef6}**\u{ff08}Nota \u{4e0d}\u{4e0b}\u{8f7d}\u{5b83}\u{ff09}\u{ff1a}{question}"
    );

    let header = String::from_utf8_lossy(&source_is[..header_boundary_data]).to_string();
    assert_eq!(
        header.matches("POST ").count(),
        1,
        "\u{53ea}\u{53d1}\u{4e86}\u{4e00}\u{4e2a}\u{8bf7}\u{6c42}\u{ff1a}{header}"
    );
}

#[test]
fn service_none_start_sentence_absolute_is_handle_status_and_return_render_pending_upper() {
    let (record_address, _receive) = start_service_none_start(
        "HTTP/1.1 401 Unauthorized",
        r#"{"message":"token invalid"}"#,
    );
    let render = upload_once(
        &configured(&record_address),
        UploadPayload::LocalFile {
            bytes: vec![1, 2],
            filename_2: "x.png".to_string(),
        },
    )
    .unwrap_err()
    .to_string();
    assert!(
        render.contains("401"),
        "\u{8981}\u{5e26}\u{72b6}\u{6001}\u{7801}\u{ff1a}{render}"
    );
    assert!(
        render.contains("token invalid"),
        "\u{8981}\u{5e26}\u{670d}\u{52a1}\u{5668}\u{90a3}\u{53e5}\u{8bdd}\u{ff1a}{render}"
    );

    assert!(!render.contains("Authorization"), "\u{9519}\u{8bef}\u{8bdd}\u{91cc}\u{4e0d}\u{8be5}\u{56de}\u{663e}\u{8bf7}\u{6c42}\u{5934}\u{ff1a}{render}");
}
