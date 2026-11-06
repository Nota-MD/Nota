//! Persistence and draft-recovery tests for `DocumentStore`.

use super::*;

#[test]
fn existing_crlf_document_saves_back_as_crlf_after_lf_editing() {
    let dir = std::env::temp_dir().join("nota-docstore-crlf");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("windows.md");
    std::fs::write(&path, "# A\r\nB\r\n").unwrap();

    let mut store = DocumentStore::new(false);
    let id = store.open(&path).unwrap();
    assert_eq!(store.get(id).unwrap().line_ending, "crlf");
    store.sync(id, "# A\nB\nC\n".to_owned()).unwrap();
    store.save(id, None).unwrap();

    assert_eq!(std::fs::read_to_string(&path).unwrap(), "# A\r\nB\r\nC\r\n");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn new_document_uses_configured_line_ending() {
    let dir = std::env::temp_dir().join("nota-docstore-new-crlf");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("new.md");

    let mut store = DocumentStore::new(false);
    let id = store.create_untitled();
    store.set_line_ending(id, "crlf").unwrap();
    store.sync(id, "a\nb\n".to_owned()).unwrap();
    store.save(id, Some(path.clone())).unwrap();

    assert_eq!(std::fs::read_to_string(&path).unwrap(), "a\r\nb\r\n");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn untouched_documents_save_without_changing_any_bytes() {
    let dir = std::env::temp_dir().join("nota-docstore-byte-stable");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let cases = [
        (
            "unix.md",
            b"---\ntitle: exact\ntags:\n  - one\n---\n\n# Heading\n\n| Name | Value |\n| --- | ---: |\n| A | 1 |\n\n```rust\nfn main() {\n    println!(\"hello\");\n}\n```\n\nInline $x^2$.\n"
                .as_slice(),
        ),
        (
            "windows.md",
            b"# Windows\r\n\r\n| A | B |\r\n| - | - |\r\n| 1 | 2 |\r\n".as_slice(),
        ),
        (
            "utf8-bom.md",
            b"\xef\xbb\xbf# BOM\r\n\r\n<div align=\"center\">raw</div>\r\n".as_slice(),
        ),
    ];

    let mut store = DocumentStore::new(false);
    for (name, bytes) in cases {
        let path = dir.join(name);
        std::fs::write(&path, bytes).unwrap();
        let id = store.open(&path).unwrap();
        store.save(id, None).unwrap();
        assert_eq!(
            std::fs::read(&path).unwrap(),
            bytes,
            "{name} changed while saving without edits"
        );
    }
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn restoring_a_draft_overlays_the_existing_file_without_saving_it() {
    let dir = std::env::temp_dir().join("nota-docstore-restore-draft");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("draft.md");
    std::fs::write(&path, "# On disk\n").unwrap();

    let draft = crate::draft::Draft {
        version: 1,
        id: "stable-draft".to_owned(),
        path: Some(path.to_string_lossy().into_owned()),
        title: "Draft".to_owned(),
        text: "# Recovered\n\nUnsaved text\n".to_owned(),
        encoding: "UTF-8".to_owned(),
        line_ending: "lf".to_owned(),
        updated_at: 1,
    };
    let mut store = DocumentStore::new(false);
    let id = store.restore_draft(&draft).unwrap();
    let restored = store.get(id).unwrap();

    assert_eq!(restored.draft_id, "stable-draft");
    assert_eq!(restored.text, draft.text);
    assert!(restored.dirty);
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "# On disk\n");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn restoring_a_draft_with_a_missing_source_creates_an_untitled_document() {
    let draft = crate::draft::Draft {
        version: 1,
        id: "missing-source".to_owned(),
        path: Some("/definitely/missing/nota-draft.md".to_owned()),
        title: "Recovered title".to_owned(),
        text: "# Recovered title\n".to_owned(),
        encoding: "UTF-8".to_owned(),
        line_ending: "lf".to_owned(),
        updated_at: 1,
    };
    let mut store = DocumentStore::new(false);
    let id = store.restore_draft(&draft).unwrap();
    let restored = store.get(id).unwrap();

    assert_eq!(restored.path, None);
    assert_eq!(restored.draft_id, "missing-source");
    assert!(restored.dirty);
}
