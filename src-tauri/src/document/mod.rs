use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

pub const EVENT_EDIT: &str = "nota:document-edit";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct DocId(pub u64);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: DocId,

    pub draft_id: String,

    pub path: Option<PathBuf>,

    pub title: String,

    pub text: String,

    #[serde(default = "default_encoding")]
    pub encoding: String,

    #[serde(default = "default_line_ending")]
    pub line_ending: String,

    pub dirty: bool,

    pub revision: u64,

    #[serde(skip)]
    pub untitled_index: u64,

    #[serde(skip)]
    pub clean_text: String,

    #[serde(skip)]
    pub select_get: Option<SelectionSnapshot>,
}

fn default_encoding() -> String {
    crate::text_encoding::UTF8_ENCODING.to_string()
}

fn default_line_ending() -> String {
    "lf".to_string()
}

fn new_draft_id() -> String {
    static NEXT_DRAFT_ID: AtomicU64 = AtomicU64::new(0);
    let serial = NEXT_DRAFT_ID.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{}-{nanos:x}-{serial:x}", std::process::id())
}

fn detect_line_ending(text: &str) -> String {
    if text.contains("\r\n") {
        "crlf".to_string()
    } else {
        "lf".to_string()
    }
}

fn with_line_ending(text: &str, label: &str) -> String {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    if label.eq_ignore_ascii_case("crlf") {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SelectionSnapshot {
    pub text: String,
    pub empty: bool,
}

impl Default for SelectionSnapshot {
    fn default() -> Self {
        Self {
            text: String::new(),
            empty: true,
        }
    }
}

impl Document {
    pub fn is_untitled(&self) -> bool {
        self.path.is_none()
    }

    pub fn path_string(&self) -> Option<String> {
        self.path
            .as_ref()
            .and_then(|p| p.to_str())
            .map(str::to_owned)
    }
}

mod title;
pub use title::derive_title;

#[derive(Debug, Default)]
pub struct DocumentStore {
    docs: Vec<Document>,
    active: Option<DocId>,
    next_id: u64,
    untitled_count: u64,

    strict_markdown: bool,
}

impl DocumentStore {
    pub fn new(strict_markdown: bool) -> Self {
        Self {
            strict_markdown,
            ..Self::default()
        }
    }

    fn alloc_id(&mut self) -> DocId {
        self.next_id += 1;
        DocId(self.next_id)
    }

    pub fn create_untitled(&mut self) -> DocId {
        self.create_untitled_with_text(String::new(), None)
    }

    pub fn create_untitled_with_text(&mut self, text: String, title_hint: Option<String>) -> DocId {
        self.untitled_count += 1;
        let id = self.alloc_id();
        let idx = self.untitled_count;
        let mut title = derive_title(&text, None, idx, self.strict_markdown);
        if title.starts_with("Untitled ") {
            if let Some(hint) = title_hint.filter(|hint| !hint.trim().is_empty()) {
                title = hint;
            }
        }
        let dirty = !text.is_empty();
        let line_ending = detect_line_ending(&text);
        let doc = Document {
            id,
            draft_id: new_draft_id(),
            path: None,
            title,
            text,
            encoding: crate::text_encoding::UTF8_ENCODING.to_string(),
            line_ending,
            dirty,
            revision: 0,
            untitled_index: idx,
            clean_text: String::new(),
            select_get: None,
        };
        self.docs.push(doc);
        self.active = Some(id);
        id
    }

    pub fn open(&mut self, path: &Path) -> Result<DocId> {
        if let Some(existing) = self.docs.iter().find(|d| d.path.as_deref() == Some(path)) {
            let id = existing.id;
            self.active = Some(id);
            return Ok(id);
        }

        let (text, encoding) = crate::text_encoding::read_file(path)?;
        let line_ending = detect_line_ending(&text);

        let clean = text.clone();
        let id = self.alloc_id();
        self.docs.push(Document {
            id,
            draft_id: new_draft_id(),
            path: Some(path.to_path_buf()),
            title: derive_title(&text, Some(path), 0, self.strict_markdown),
            text,
            encoding,
            line_ending,
            dirty: false,
            revision: 0,

            untitled_index: 0,
            clean_text: clean,
            select_get: None,
        });
        self.active = Some(id);
        Ok(id)
    }

    pub fn restore_draft(&mut self, draft: &crate::draft::Draft) -> Result<DocId> {
        if draft.version > 1 {
            return Err(NotaError::other(format!(
                "Draft version {} is newer than this version of Nota",
                draft.version
            )));
        }

        let source = draft.path.as_ref().map(PathBuf::from);
        let id = source
            .as_deref()
            .filter(|path| path.is_file())
            .and_then(|path| self.open(path).ok())
            .unwrap_or_else(|| {
                self.create_untitled_with_text(draft.text.clone(), Some(draft.title.clone()))
            });

        let strict = self.strict_markdown;
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        doc.draft_id = draft.id.clone();
        doc.encoding = draft.encoding.clone();
        doc.line_ending = if draft.line_ending.eq_ignore_ascii_case("crlf") {
            "crlf".to_string()
        } else {
            "lf".to_string()
        };
        doc.text = draft.text.clone();
        doc.dirty = doc.text != doc.clean_text;
        doc.revision += 1;
        doc.title = derive_title(&doc.text, doc.path.as_deref(), doc.untitled_index, strict);
        self.active = Some(id);
        Ok(id)
    }

    pub fn reload(&mut self, id: DocId) -> Result<()> {
        let strict = self.strict_markdown;
        let path = self
            .get(id)
            .and_then(|d| d.path.clone())
            .ok_or(NotaError::NoActiveDocument)?;
        let (text, encoding) = crate::text_encoding::read_file(&path)?;
        let line_ending = detect_line_ending(&text);
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        let idx = doc.untitled_index;
        doc.title = derive_title(&text, Some(&path), idx, strict);
        doc.encoding = encoding;
        doc.line_ending = line_ending;
        doc.clean_text = text.clone();
        doc.text = text;
        doc.dirty = false;
        doc.revision += 1;
        Ok(())
    }

    pub fn sync(&mut self, id: DocId, text: String) -> Result<u64> {
        let strict = self.strict_markdown;
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        if doc.text == text {
            return Ok(doc.revision);
        }
        doc.text = text;
        doc.dirty = doc.text != doc.clean_text;
        doc.revision += 1;
        let idx = doc.untitled_index;
        doc.title = derive_title(&doc.text, doc.path.as_deref(), idx, strict);
        Ok(doc.revision)
    }

    pub fn settle(&mut self, id: DocId, text: String) -> Result<u64> {
        let strict = self.strict_markdown;
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;

        if doc.text != text {
            doc.text = text.clone();
            doc.revision += 1;
            let idx = doc.untitled_index;
            doc.title = derive_title(&doc.text, doc.path.as_deref(), idx, strict);
        }

        doc.clean_text = text;
        doc.dirty = false;
        Ok(doc.revision)
    }

    pub fn save(&mut self, id: DocId, path_override: Option<PathBuf>) -> Result<PathBuf> {
        let strict = self.strict_markdown;
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        let previous_path = doc.path.clone();
        let path = match path_override {
            Some(p) => {
                doc.path = Some(p.clone());
                p
            }
            None => doc
                .path
                .clone()
                .ok_or_else(|| NotaError::other("The document has no path; use Save As"))?,
        };

        if !doc.dirty && previous_path.as_ref() == Some(&path) {
            return Ok(path);
        }

        if let Some(parent) = path.parent() {
            crate::paths::ensure_dir(parent)?;
        }
        let disk_text = with_line_ending(&doc.text, &doc.line_ending);
        crate::text_encoding::an_encoding_write(&path, &disk_text, &doc.encoding)?;

        doc.dirty = false;
        doc.clean_text = doc.text.clone();
        let idx = doc.untitled_index;
        doc.title = derive_title(&doc.text, Some(&path), idx, strict);
        doc.revision += 1;
        Ok(path)
    }

    pub fn set_line_ending(&mut self, id: DocId, label: &str) -> Result<()> {
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        doc.line_ending = if label.eq_ignore_ascii_case("crlf") {
            "crlf".to_string()
        } else {
            "lf".to_string()
        };
        Ok(())
    }

    pub fn move_to_2(&mut self, id: DocId, target_2: PathBuf) -> Result<PathBuf> {
        let strict = self.strict_markdown;
        let old = self.get(id).and_then(|d| d.path.clone()).ok_or_else(|| {
            NotaError::other("The document has not been saved; use Save As to choose a location")
        })?;

        crate::file_move::one_dynamic(&old, &target_2)?;

        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        doc.path = Some(target_2.clone());
        let idx = doc.untitled_index;
        doc.title = derive_title(&doc.text, Some(&target_2), idx, strict);
        doc.revision += 1;
        Ok(target_2)
    }

    pub fn close(&mut self, id: DocId) {
        self.docs.retain(|d| d.id != id);
        if self.active == Some(id) {
            self.active = self.docs.last().map(|d| d.id);
        }
    }

    pub fn get(&self, id: DocId) -> Option<&Document> {
        self.docs.iter().find(|d| d.id == id)
    }

    pub fn get_mut(&mut self, id: DocId) -> Option<&mut Document> {
        self.docs.iter_mut().find(|d| d.id == id)
    }

    pub fn active(&self) -> Option<&Document> {
        self.active.and_then(|id| self.get(id))
    }

    pub fn active_id(&self) -> Option<DocId> {
        self.active
    }

    pub fn set_active(&mut self, id: DocId) -> Result<()> {
        if self.get(id).is_none() {
            return Err(NotaError::other(format!("Document not found: {id:?}")));
        }
        self.active = Some(id);
        Ok(())
    }

    pub fn list(&self) -> &[Document] {
        &self.docs
    }

    pub fn save_selection(&mut self, id: DocId, select_get: SelectionSnapshot) -> Result<()> {
        let doc = self.get_mut(id).ok_or(NotaError::NoActiveDocument)?;
        doc.select_get = Some(select_get);
        Ok(())
    }

    pub fn set_strict_markdown(&mut self, strict: bool) {
        if self.strict_markdown == strict {
            return;
        }
        self.strict_markdown = strict;
        let strict = self.strict_markdown;
        for doc in &mut self.docs {
            let idx = doc.untitled_index;
            doc.title = derive_title(&doc.text, doc.path.as_deref(), idx, strict);
        }
    }

    pub fn has_unsaved(&self) -> bool {
        self.docs.iter().any(|d| d.dirty)
    }
}

#[cfg(test)]
mod draft_tests;

#[cfg(test)]
mod tests {
    use super::*;

    const LAX: bool = false;
    const STRICT: bool = true;

    #[test]
    fn table_question_has_thread_get_front_matter() {
        let text = "---\ntitle: \u{6211}\u{7684}\u{7b14}\u{8bb0}\n---\n\n# \u{522b}\u{7684}\u{6807}\u{9898}\n";
        assert_eq!(
            derive_title(text, None, 1, LAX),
            "\u{6211}\u{7684}\u{7b14}\u{8bb0}"
        );
    }

    #[test]
    fn each_has_front_matter_is_get_base_one_table_question() {
        let text =
            "\u{524d}\u{8a00}\n\n## \u{5c0f}\u{8282}\u{6807}\u{9898} ##\n\n\u{6b63}\u{6587}\n";
        assert_eq!(
            derive_title(text, None, 1, LAX),
            "\u{5c0f}\u{8282}\u{6807}\u{9898}"
        );
    }

    #[test]
    fn pending_block_inner_static_number_not_compute_table_question() {
        let text = "```sh\n# \u{8fd9}\u{662f}\u{6ce8}\u{91ca}\u{4e0d}\u{662f}\u{6807}\u{9898}\n```\n\n# \u{771f}\u{6807}\u{9898}\n";
        assert_eq!(derive_title(text, None, 1, LAX), "\u{771f}\u{6807}\u{9898}");
    }

    #[test]
    fn static_number_after_each_empty_validate_suffix_is_not_compute_table_question() {
        let text = "#\u{6807}\u{7b7e} \u{4e0d}\u{662f}\u{6807}\u{9898}\n";
        assert_eq!(derive_title(text, None, 7, STRICT), "Untitled 7");

        assert_eq!(
            derive_title(text, None, 7, LAX),
            "\u{6807}\u{7b7e} \u{4e0d}\u{662f}\u{6807}\u{9898}"
        );
    }

    #[test]
    fn check_store_is_old_handle_table_question_options_define_lower_incoming() {
        let validate = DocumentStore::new(STRICT);
        let mut validate = validate;
        let id = validate.create_untitled();
        validate.sync(id, "#\u{6807}\u{7b7e}\n".to_owned()).unwrap();
        assert_eq!(
            validate.get(id).unwrap().title,
            "Untitled 1",
            "\u{4e25}\u{683c}\u{4ed3}\u{91cc}\u{8fd9}\u{884c}\u{4e0d}\u{662f}\u{6807}\u{9898}"
        );

        let mut width_loose = DocumentStore::new(LAX);
        let id = width_loose.create_untitled();
        width_loose
            .sync(id, "#\u{6807}\u{7b7e}\n".to_owned())
            .unwrap();
        assert_eq!(
            width_loose.get(id).unwrap().title,
            "\u{6807}\u{7b7e}",
            "\u{5bbd}\u{677e}\u{4ed3}\u{91cc}\u{5b83}\u{662f}\u{6807}\u{9898}"
        );
    }

    #[test]
    fn to_into_body_only_boundary_check_out_dirty_document_and_has_thread_is_use_body_table_question(
    ) {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled_with_text(
            "# \u{5bfc}\u{5165}\u{7684}\u{6807}\u{9898}\n\n\u{6b63}\u{6587}".to_string(),
            Some("\u{539f}\u{6587}\u{4ef6}\u{540d}".to_string()),
        );
        let doc = s
            .get(id)
            .expect("\u{521a}\u{5efa}\u{7684}\u{6587}\u{6863}\u{5e94}\u{5f53}\u{5728}");
        assert_eq!(doc.title, "\u{5bfc}\u{5165}\u{7684}\u{6807}\u{9898}");
        assert_eq!(
            doc.text,
            "# \u{5bfc}\u{5165}\u{7684}\u{6807}\u{9898}\n\n\u{6b63}\u{6587}"
        );
        assert!(doc.dirty, "\u{5bfc}\u{5165}\u{5185}\u{5bb9}\u{8fd8}\u{6ca1}\u{6709}\u{5b58}\u{76d8}\u{ff0c}\u{5fc5}\u{987b}\u{663e}\u{793a}\u{672a}\u{4fdd}\u{5b58}\u{72b6}\u{6001}");
        assert_eq!(doc.clean_text, "");
    }

    #[test]
    fn to_into_body_each_has_table_question_is_use_source_filename_all_base() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled_with_text(
            "\u{53ea}\u{6709}\u{6b63}\u{6587}".to_string(),
            Some("\u{4f1a}\u{8bae}\u{8bb0}\u{5f55}".to_string()),
        );
        assert_eq!(
            s.get(id)
                .expect("\u{521a}\u{5efa}\u{7684}\u{6587}\u{6863}\u{5e94}\u{5f53}\u{5728}")
                .title,
            "\u{4f1a}\u{8bae}\u{8bb0}\u{5f55}"
        );
    }

    #[test]
    fn static_number_after_has_empty_two_middle_suffix_is_all_compute_table_question() {
        let text = "# \u{4f60}\u{597d}\n";
        assert_eq!(derive_title(text, None, 7, STRICT), "\u{4f60}\u{597d}");
        assert_eq!(derive_title(text, None, 7, LAX), "\u{4f60}\u{597d}");
    }

    #[test]
    fn get_not_to_old_return_derive_to_filename_active_position_name_name() {
        assert_eq!(
            derive_title(
                "\u{6b63}\u{6587}\u{800c}\u{5df2}",
                Some(Path::new("/tmp/\u{6211}\u{7684}\u{6587}\u{6863}.md")),
                1,
                LAX
            ),
            "\u{6211}\u{7684}\u{6587}\u{6863}"
        );
        assert_eq!(
            derive_title("\u{6b63}\u{6587}\u{800c}\u{5df2}", None, 3, LAX),
            "Untitled 3"
        );
    }

    #[test]
    fn cut_replace_validate_suffix_is_return_middle_compute_table_question() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        s.sync(id, "#\u{6807}\u{7b7e}\n".to_owned()).unwrap();

        assert_eq!(s.get(id).unwrap().title, "\u{6807}\u{7b7e}");

        let dirty = s.get(id).unwrap().dirty;

        s.set_strict_markdown(STRICT);
        assert_eq!(s.get(id).unwrap().title, "Untitled 1", "\u{4e25}\u{683c}\u{4e4b}\u{540e}\u{8fd9}\u{884c}\u{4e0d}\u{662f}\u{6807}\u{9898}\u{4e86}");

        s.set_strict_markdown(LAX);
        assert_eq!(
            s.get(id).unwrap().title,
            "\u{6807}\u{7b7e}",
            "\u{6539}\u{56de}\u{6765}\u{8981}\u{8ddf}\u{7740}\u{56de}\u{6765}"
        );

        assert_eq!(
            s.get(id).unwrap().dirty,
            dirty,
            "\u{91cd}\u{7b97}\u{6807}\u{9898}\u{4e0d}\u{8be5}\u{987a}\u{624b}\u{628a}\u{6587}\u{6863}\u{6807}\u{6210}\u{5df2}\u{4fee}\u{6539}"
        );
    }

    #[test]
    fn same_not_item_same_content_not_dynamic_revision() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        let r0 = s.get(id).unwrap().revision;
        assert_eq!(s.sync(id, String::new()).unwrap(), r0);
        let r1 = s.sync(id, "\u{53d8}\u{4e86}".to_owned()).unwrap();
        assert_eq!(r1, r0 + 1);
        assert!(s.get(id).unwrap().dirty);
    }

    #[test]
    fn same_one_path_only_open_one_part() {
        let dir = std::env::temp_dir().join("nota-docstore-dedupe");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.md");
        std::fs::write(&path, "# A\n").unwrap();

        let mut s = DocumentStore::new(LAX);
        let a = s.open(&path).unwrap();
        let b = s.open(&path).unwrap();
        assert_eq!(a, b);
        assert_eq!(s.list().len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn nested_documents_with_the_same_file_name_save_independently() {
        let root = std::env::temp_dir().join("nota-docstore-same-name");
        let _ = std::fs::remove_dir_all(&root);
        let first = root.join("first");
        let second = root.join("second");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        let first_path = first.join("notes.md");
        let second_path = second.join("notes.md");
        std::fs::write(&first_path, "# First\n").unwrap();
        std::fs::write(&second_path, "# Second\n").unwrap();

        let mut store = DocumentStore::new(LAX);
        let first_id = store.open(&first_path).unwrap();
        let second_id = store.open(&second_path).unwrap();
        assert_ne!(first_id, second_id);

        store
            .sync(first_id, "# First changed\n".to_owned())
            .unwrap();
        store
            .sync(second_id, "# Second changed\n".to_owned())
            .unwrap();
        store.save(first_id, None).unwrap();
        store.save(second_id, None).unwrap();

        assert_eq!(
            std::fs::read_to_string(&first_path).unwrap(),
            "# First changed\n"
        );
        assert_eq!(
            std::fs::read_to_string(&second_path).unwrap(),
            "# Second changed\n"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn store_parse_after_dirty_normalize_zero_cut_zero_wai_store_can_replace_path() {
        let dir = std::env::temp_dir().join("nota-docstore-save");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        s.sync(id, "# \u{4f60}\u{597d}\n".to_owned()).unwrap();
        assert!(s.has_unsaved());

        let target = dir.join("out.md");
        s.save(id, Some(target.clone())).unwrap();
        assert!(!s.has_unsaved());
        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            "# \u{4f60}\u{597d}\n"
        );
        assert_eq!(s.get(id).unwrap().path.as_deref(), Some(target.as_path()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn gbk_document_roundtrips_as_gbk() {
        let dir = std::env::temp_dir().join("nota-docstore-gbk");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("gbk.md");
        crate::text_encoding::an_encoding_write(
            &path,
            "# \u{521d}\u{59cb}\u{4e2d}\u{6587}\n",
            "GBK",
        )
        .unwrap();

        let mut s = DocumentStore::new(LAX);
        let id = s.open(&path).unwrap();
        let opened = s.get(id).unwrap();
        assert_eq!(opened.text, "# \u{521d}\u{59cb}\u{4e2d}\u{6587}\n");
        assert_eq!(opened.encoding, "GBK");

        s.sync(
            id,
            "# \u{4fee}\u{6539}\u{540e}\u{7684}\u{4e2d}\u{6587}\n".to_owned(),
        )
        .unwrap();
        s.save(id, None).unwrap();

        let raw = std::fs::read(&path).unwrap();
        let (decoded, encoding) = crate::text_encoding::guess_decode(&raw);
        assert_eq!(encoding, "GBK", "saving changed the encoding");
        assert_eq!(
            decoded,
            "# \u{4fee}\u{6539}\u{540e}\u{7684}\u{4e2d}\u{6587}\n"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn move_passed_only_after_path_and_table_question_root_replace_two_change_not_dynamic() {
        let dir = std::env::temp_dir().join("nota-docstore-move");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let old = dir.join("\u{8001}\u{540d}\u{5b57}.md");
        std::fs::write(&old, "\u{76d8}\u{4e0a}\u{7684}\u{65e7}\u{5185}\u{5bb9}\n").unwrap();

        let mut s = DocumentStore::new(LAX);
        let id = s.open(&old).unwrap();

        s.sync(id, "\u{76d8}\u{4e0a}\u{7684}\u{65e7}\u{5185}\u{5bb9}\n\n\u{65b0}\u{5199}\u{7684}\u{4e00}\u{6bb5}\n".to_owned()).unwrap();
        let move_before_half_current = s.get(id).unwrap().revision;
        assert!(s.get(id).unwrap().dirty);

        let new = dir.join("\u{65b0}\u{540d}\u{5b57}.md");
        let target_3 = s.move_to_2(id, new.clone()).unwrap();

        assert_eq!(target_3, new);
        assert!(
            !old.exists(),
            "\u{76d8}\u{4e0a}\u{90a3}\u{4efd}\u{8981}\u{8ddf}\u{7740}\u{6539}\u{540d}"
        );
        assert_eq!(
            std::fs::read_to_string(&new).unwrap(),
            "\u{76d8}\u{4e0a}\u{7684}\u{65e7}\u{5185}\u{5bb9}\n",
            "\u{76d8}\u{4e0a}\u{7559}\u{7684}\u{662f}**\u{4e0a}\u{4e00}\u{6b21}\u{5b58}\u{8fc7}\u{7684}**\u{5185}\u{5bb9}\u{ff0c}\u{672a}\u{4fdd}\u{5b58}\u{7684}\u{6539}\u{52a8}\u{8fd8}\u{5728}\u{5185}\u{5b58}\u{91cc}"
        );
        let doc = s.get(id).unwrap();
        assert_eq!(doc.path.as_deref(), Some(new.as_path()));
        assert_eq!(doc.title, "\u{65b0}\u{540d}\u{5b57}", "\u{6807}\u{9898}\u{53d6}\u{81ea}\u{6587}\u{4ef6}\u{540d}\u{ff0c}\u{6539}\u{4e86}\u{540d}\u{5c31}\u{8be5}\u{6362}");
        assert!(doc.dirty, "\u{672a}\u{4fdd}\u{5b58}\u{7684}\u{6539}\u{52a8}\u{4e0d}\u{8bb8}\u{88ab}\u{8fd9}\u{4e00}\u{6b21}\u{632a}\u{52a8}\u{62b9}\u{6389}");
        assert_eq!(doc.text, "\u{76d8}\u{4e0a}\u{7684}\u{65e7}\u{5185}\u{5bb9}\n\n\u{65b0}\u{5199}\u{7684}\u{4e00}\u{6bb5}\n");
        assert!(doc.revision > move_before_half_current, "\u{8def}\u{5f84}\u{53d8}\u{4e86}\u{4e5f}\u{662f}\u{4e00}\u{6b21}\u{8be5}\u{8ba9}\u{63d2}\u{4ef6}\u{77e5}\u{9053}\u{7684}\u{53d8}\u{5316}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn move_is_percent_is_document_still_only_old_path() {
        let dir = std::env::temp_dir().join("nota-docstore-move-fail");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let old = dir.join("\u{7532}.md");
        std::fs::write(&old, "\u{7532}\u{7684}\u{6b63}\u{6587}\n").unwrap();
        let expand = dir.join("\u{4e59}.md");
        std::fs::write(&expand, "\u{4e59}\u{7684}\u{6b63}\u{6587}\n").unwrap();

        let mut s = DocumentStore::new(LAX);
        let id = s.open(&old).unwrap();
        let move_before_half_current = s.get(id).unwrap().revision;

        assert!(s.move_to_2(id, expand.clone()).is_err());

        let doc = s.get(id).unwrap();
        assert_eq!(doc.path.as_deref(), Some(old.as_path()));
        assert_eq!(doc.title, "\u{7532}");
        assert_eq!(
            doc.revision, move_before_half_current,
            "\u{6ca1}\u{632a}\u{6210}\u{5c31}\u{4ec0}\u{4e48}\u{90fd}\u{6ca1}\u{53d8}"
        );
        assert_eq!(
            std::fs::read_to_string(&expand).unwrap(),
            "\u{4e59}\u{7684}\u{6b63}\u{6587}\n"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn each_store_passed_parse_document_move_not() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        let to = std::env::temp_dir().join("nota-\u{4e0d}\u{8be5}\u{51fa}\u{73b0}\u{7684}.md");
        let error = s.move_to_2(id, to.clone()).unwrap_err().to_string();

        assert!(
            error.contains("Save As"),
            "expected actionable guidance: {error}"
        );
        assert!(!to.exists(), "\u{4e0d}\u{8bb8}\u{5728}\u{7528}\u{6237}\u{6ca1}\u{9009}\u{8fc7}\u{7684}\u{5730}\u{65b9}\u{7559}\u{4e0b}\u{4e00}\u{4efd}\u{6587}\u{4ef6}");
    }

    #[test]
    fn each_path_has_each_save_as_need_package_error() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        assert!(s.save(id, None).is_err());
    }

    #[test]
    fn position_name_name_required_number_not_return_passive_large_character_suffix_drop() {
        let mut s = DocumentStore::new(LAX);
        let a = s.create_untitled();
        let b = s.create_untitled();
        assert_eq!(s.get(a).unwrap().title, "Untitled 1");
        assert_eq!(s.get(b).unwrap().title, "Untitled 2");

        s.sync(a, "\u{53ea}\u{662f}\u{6b63}\u{6587}".to_owned())
            .unwrap();
        s.sync(b, "\u{53e6}\u{4e00}\u{4efd}\u{6b63}\u{6587}".to_owned())
            .unwrap();
        assert_eq!(s.get(a).unwrap().title, "Untitled 1");
        assert_eq!(s.get(b).unwrap().title, "Untitled 2");
    }

    #[test]
    fn install_at_is_normalize_reverse_render_not_compute_use_call_change() {
        let dir = std::env::temp_dir().join("nota-docstore-settle");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.md");
        std::fs::write(&path, "# A\n").unwrap();

        let mut s = DocumentStore::new(LAX);
        let id = s.open(&path).unwrap();
        assert!(
            !s.get(id).unwrap().dirty,
            "\u{521a}\u{6253}\u{5f00}\u{4e0d}\u{8be5}\u{810f}"
        );

        s.sync(id, "# A\n\n".to_owned()).unwrap();
        assert!(s.get(id).unwrap().dirty, "\u{89c4}\u{8303}\u{5316}\u{786e}\u{5b9e}\u{8ba9}\u{5b83}\u{4e0e}\u{78c1}\u{76d8}\u{4e0d}\u{540c}\u{4e86}");

        s.settle(id, "# A\n\n".to_owned()).unwrap();
        assert!(
            !s.get(id).unwrap().dirty,
            "settle \u{4e4b}\u{540e}\u{4e0d}\u{8be5}\u{810f}"
        );

        s.sync(id, "# A\n\n\u{65b0}\u{5199}\u{7684}".to_owned())
            .unwrap();
        assert!(s.get(id).unwrap().dirty);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn position_name_name_document_empty_not_dirty() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();
        assert!(!s.get(id).unwrap().dirty);
        s.sync(id, "".to_owned()).unwrap();
        assert!(
            !s.get(id).unwrap().dirty,
            "\u{63a8}\u{7a7a}\u{4e32}\u{4e0d}\u{8be5}\u{53d8}\u{810f}"
        );
        s.sync(id, "\u{6709}\u{4e1c}\u{897f}\u{4e86}".to_owned())
            .unwrap();
        assert!(s.get(id).unwrap().dirty);

        let path = std::env::temp_dir().join("nota-docstore-untitled-clean.md");
        s.save(id, Some(path.clone())).unwrap();
        assert!(!s.get(id).unwrap().dirty);
        s.sync(id, "\u{6709}\u{4e1c}\u{897f}\u{4e86}".to_owned())
            .unwrap();
        assert!(!s.get(id).unwrap().dirty, "\u{63a8}\u{56de}\u{4e00}\u{6a21}\u{4e00}\u{6837}\u{7684}\u{5185}\u{5bb9}\u{4e0d}\u{8be5}\u{53d8}\u{810f}");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_selection_not_touch_half_current_page_not_touch_dirty_table_record() {
        let mut s = DocumentStore::new(LAX);
        let id = s.create_untitled();

        assert!(s.get(id).unwrap().select_get.is_none());

        let half_current = s.get(id).unwrap().revision;
        s.save_selection(
            id,
            SelectionSnapshot {
                text: "\u{9009}\u{4e2d}".to_owned(),
                empty: false,
            },
        )
        .unwrap();

        let d = s.get(id).unwrap();
        assert_eq!(d.select_get.as_ref().unwrap().text, "\u{9009}\u{4e2d}");
        assert!(!d.select_get.as_ref().unwrap().empty);
        assert_eq!(
            d.revision, half_current,
            "\u{9009}\u{533a}\u{4e0d}\u{8be5}\u{649e} revision"
        );
        assert!(!d.dirty, "\u{9009}\u{533a}\u{4e0d}\u{8be5}\u{649e} dirty");
        assert!(
            d.text.is_empty(),
            "\u{9009}\u{533a}\u{4e0d}\u{8be5}\u{6539}\u{6b63}\u{6587}\u{955c}\u{50cf}"
        );

        s.save_selection(
            id,
            SelectionSnapshot {
                text: String::new(),
                empty: true,
            },
        )
        .unwrap();
        let d = s.get(id).unwrap();
        assert!(d.select_get.as_ref().unwrap().empty);
        assert!(d.select_get.as_ref().unwrap().text.is_empty());

        let add = DocId(9999);
        assert!(s.save_selection(add, SelectionSnapshot::default()).is_err());
    }

    #[test]
    fn select_middle_source_character_is_text_position_empty_single_select_get_not_empty() {
        let snapshot_2 = SelectionSnapshot {
            text: String::new(),
            empty: false,
        };
        assert!(!snapshot_2.empty);
        assert!(snapshot_2.text.is_empty());

        assert!(SelectionSnapshot::default().empty);
    }
}
