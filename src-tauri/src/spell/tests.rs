use super::*;

#[test]
fn data_out_word_can_pair_return_source_incoming_lower_table() {
    let word_list: Vec<String> = ["helo", "hello", "wrold", "hello"]
        .iter()
        .map(|s| s.to_string())
        .collect();

    let out = pair_return_lower_table(&word_list, "helo\nwrold\n");
    assert_eq!(out, vec![0, 2]);
}

#[test]
fn same_one_word_out_thread_two_word_is_two_lower_table_all_need_table_out_incoming() {
    let word_list: Vec<String> = ["helo", "x", "helo"]
        .iter()
        .map(|s| s.to_string())
        .collect();

    assert_eq!(
        pair_return_lower_table(&word_list, "helo\nhelo\n"),
        vec![0, 2]
    );
}

#[test]
fn after_segment_each_say_render_is_one_all_not_table() {
    let word_list: Vec<String> = vec!["hello".to_string()];
    assert!(pair_return_lower_table(&word_list, "").is_empty());
    assert!(pair_return_lower_table(&word_list, "   \n\n").is_empty());
}

#[test]
fn check_one_from_close_to_suffix_is_data_out_inner_port() {
    let data_out = "@(#) International Ispell Version 3.2.06\n\
                 & helo 5 0: hello, halo, help, hell, hero\n\
                 * ok\n";
    assert_eq!(
        from_check_one_data_out_inner_port(data_out),
        ["hello", "halo", "help", "hell", "hero"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<String>>()
    );

    assert!(from_check_one_data_out_inner_port("* ok\n").is_empty());
}

#[test]
fn each_has_current_word_point_is_that_sentence_render_need_say_out_three_item_out_path() {
    let render = each_has_current_word_point_render("zh_CN");

    assert!(render.contains("zh_CN"), "{render}");

    assert!(
        render.contains("hunspell-zh_CN"),
        "\u{5c11}\u{4e86}\u{88c5}\u{7cfb}\u{7edf}\u{5305}\u{90a3}\u{6761}\u{ff1a}{render}"
    );
    assert!(
        render.to_lowercase().contains("zip"),
        "\u{5c11}\u{4e86}\u{5bfc}\u{5165}\u{90a3}\u{6761}\u{ff1a}{render}"
    );
    assert!(
        render.contains("dictionaries"),
        "\u{5c11}\u{4e86}\u{62f7}\u{8fdb}\u{76ee}\u{5f55}\u{90a3}\u{6761}\u{ff1a}{render}"
    );

    assert!(!render.contains("\u{62fc}\u{9519}"), "{render}");
}

#[test]
fn use_call_word_and_call_ignore_word_all_not_get_text_engine() {
    let word_list: Vec<String> = ["hello", "Nota", "foobarbaz", "world"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let use_call: HashSet<String> = ["nota".to_string()].into_iter().collect();
    let call_ignore: HashSet<String> = ["foobarbaz".to_string()].into_iter().collect();
    let pending_check = need_real_check(&word_list, &use_call, &call_ignore);

    assert_eq!(pending_check, vec![(0, "hello"), (3, "world")]);
}

#[test]
fn use_call_word_table_must_large_small_write_not_min_clean() {
    let word_list: Vec<String> = vec!["Nota".to_string()];
    let use_call: HashSet<String> = ["nota".to_string()].into_iter().collect();
    assert!(need_real_check(&word_list, &use_call, &HashSet::new()).is_empty());

    assert_eq!(normalize_one("NOTA"), "nota");
    assert_eq!(normalize_one("  Nota  "), "nota");
}

#[cfg(unix)]
#[test]
fn add_after_segment_still_real_can_run_one_edit_check_to_word_and_check_one() {
    use std::os::unix::fs::PermissionsExt;
    let directory_2 = std::env::temp_dir().join(format!("nota-spell-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&directory_2);
    std::fs::create_dir_all(&directory_2).unwrap();
    let add = directory_2.join("enchant-2");
    std::fs::write(
        &add,



        "#!/bin/sh\ncase \"$3\" in\n  -l) cat >/dev/null; printf 'helo\\n'; ;;\n  -a) cat >/dev/null; printf '& helo 2 0: hello, halo\\n'; ;;\nesac\n",
    )
    .unwrap();
    std::fs::set_permissions(&add, std::fs::Permissions::from_mode(0o755)).unwrap();

    let program_2: &'static str = Box::leak(add.display().to_string().into_boxed_str());

    let after_segment = CommandLineBackend {
        program_2,
        use_call_word_point_directory: None,
    };
    let word_list: Vec<String> = ["helo", "hello"].iter().map(|s| s.to_string()).collect();
    assert_eq!(after_segment.check_2("en_US", &word_list), Some(vec![0]));
    assert_eq!(
        after_segment.check_one("en_US", "helo"),
        ["hello", "halo"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<String>>()
    );
    let _ = std::fs::remove_dir_all(&directory_2);
}

#[test]
fn use_call_word_point_at_is_give_path_not_at_is_give_language_names() {
    let temp_2 = std::env::temp_dir().join(format!("nota-dicts-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temp_2);
    std::fs::create_dir_all(&temp_2).unwrap();
    std::fs::write(temp_2.join("en_US.dic"), b"2\nhello\nworld\n").unwrap();
    std::fs::write(temp_2.join("en_US.aff"), b"SET UTF-8\n").unwrap();
    let pending = CommandLineBackend {
        program_2: "enchant-2",
        use_call_word_point_directory: Some(temp_2.clone()),
    };

    assert_eq!(
        pending.word_point_args("en_US"),
        temp_2.join("en_US").display().to_string()
    );

    assert_eq!(pending.word_point_args("zh_CN"), "zh_CN");
    let not_pending = CommandLineBackend {
        program_2: "enchant-2",
        use_call_word_point_directory: None,
    };
    assert_eq!(not_pending.word_point_args("en_US"), "en_US");
    let _ = std::fs::remove_dir_all(&temp_2);
}
