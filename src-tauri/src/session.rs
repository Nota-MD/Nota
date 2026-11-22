use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::NotaError;
use crate::paths;

pub const MAX_RECENT_FILES: usize = 20;

pub const MAX_SESSIONS: usize = 12;

pub const MAX_SCROLL_ENTRIES: usize = 64;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct SessionState {
    pub open: Vec<String>,

    pub active: Option<String>,

    pub recent: Vec<String>,

    pub scroll: BTreeMap<String, f64>,

    pub workspace: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct SessionArchive {
    #[serde(default)]
    open: Vec<String>,
    #[serde(default)]
    active: Option<String>,
    #[serde(default)]
    recent: Vec<String>,
    #[serde(default)]
    scroll: BTreeMap<String, f64>,
    #[serde(default)]
    workspace: Option<String>,
}

const FILE_HEADER: &str = "# Nota session state: open documents, recent files, and scroll positions.\n# Deleting this file resets tabs and recent history but does not modify Markdown files.\n# It stores paths only, not document text.\n";

pub fn derive_into_most_enter(list_table: &mut Vec<String>, path_3: &str) {
    if list_table.first().map(String::as_str) == Some(path_3) {
        return;
    }
    list_table.retain(|x| x != path_3);
    list_table.insert(0, path_3.to_string());
    list_table.truncate(MAX_RECENT_FILES);
}

pub fn add_must_inner(v: f64) -> f64 {
    if !v.is_finite() {
        return 0.0;
    }
    v.clamp(0.0, 1.0)
}

pub fn remove_missing(session_2: &mut SessionState, store_at: impl Fn(&str) -> bool) {
    session_2.open.retain(|p| store_at(p));
    session_2.recent.retain(|p| store_at(p));
    session_2.scroll.retain(|p, _| store_at(p));
}

pub fn modify_check(session_2: &mut SessionState) {
    let package_stream: std::collections::HashSet<&str> = session_2
        .open
        .iter()
        .chain(session_2.recent.iter())
        .map(String::as_str)
        .collect();
    session_2
        .scroll
        .retain(|p, _| package_stream.contains(p.as_str()));
    session_2.open.truncate(MAX_SESSIONS);
    session_2.recent.truncate(MAX_RECENT_FILES);
    if session_2.scroll.len() > MAX_SCROLL_ENTRIES {
        let discard: Vec<String> = session_2
            .scroll
            .keys()
            .skip(MAX_SCROLL_ENTRIES)
            .cloned()
            .collect();
        for k in discard {
            session_2.scroll.remove(&k);
        }
    }
}

fn from_archive(when: SessionArchive) -> SessionState {
    SessionState {
        open: when.open,
        active: when.active.filter(|s| !s.is_empty()),
        recent: when.recent,
        scroll: when
            .scroll
            .into_iter()
            .map(|(k, v)| (k, add_must_inner(v)))
            .collect(),
        workspace: when.workspace.filter(|s| !s.is_empty()),
    }
}

pub fn from_text(text: &str) -> SessionState {
    from_archive(toml::from_str::<SessionArchive>(text).unwrap_or_default())
}

pub fn to_text(session_2: &SessionState) -> Result<String, String> {
    let mut session_2 = session_2.clone();
    modify_check(&mut session_2);
    let when = SessionArchive {
        open: session_2.open,
        active: session_2.active,
        recent: session_2.recent,
        scroll: session_2.scroll,
        workspace: session_2.workspace,
    };
    let body = toml::to_string_pretty(&when)
        .map_err(|e| format!("Could not serialize the session as TOML (internal error): {e}"))?;
    Ok(format!("{FILE_HEADER}{body}"))
}

fn read_archive_2(file_3: &Path) -> SessionState {
    let Ok(text) = std::fs::read_to_string(file_3) else {
        return SessionState::default();
    };
    match toml::from_str::<SessionArchive>(&text) {
        Ok(when) => from_archive(when),
        Err(e) => {
            crate::debug_log!(
                "[nota] session file unreadable; using empty session: {}: {e}",
                file_3.display()
            );
            SessionState::default()
        }
    }
}

fn write_archive(file_3: &Path, session_2: &SessionState) -> Result<(), NotaError> {
    let text = to_text(session_2).map_err(NotaError::other)?;
    if let Some(service) = file_3.parent() {
        paths::ensure_dir(service)?;
    }

    std::fs::write(file_3, text).map_err(|source| NotaError::Write {
        path: file_3.to_path_buf(),
        source,
    })
}

fn error_message(error: NotaError) -> String {
    format!("Could not save the session: {error}")
}

pub fn read_2() -> SessionState {
    match paths::session_file() {
        Ok(file_3) => read_file_2(&file_3),
        Err(e) => {
            crate::debug_log!("[nota] session path unavailable; using empty session: {e}");
            SessionState::default()
        }
    }
}

pub fn read_file_2(file_3: &Path) -> SessionState {
    read_archive_2(file_3)
}

pub fn write_2(session_2: &SessionState) -> Result<(), String> {
    write_file_2(&paths::session_file().map_err(error_message)?, session_2).map_err(error_message)
}

pub fn write_file_2(file_3: &Path, session_2: &SessionState) -> Result<(), NotaError> {
    write_archive(file_3, session_2)
}

pub fn remember_recent_2(path_3: &str) -> Result<(), String> {
    let mut session_2 = read_2();
    derive_into_most_enter(&mut session_2.recent, path_3);
    write_2(&session_2)
}

pub fn forget_recent(path_3: &str) -> Result<(), String> {
    let mut session_2 = read_2();
    session_2.recent.retain(|p| p != path_3);
    session_2.scroll.remove(path_3);
    write_2(&session_2)
}

pub fn replace_recent(old: &str, new: &str) -> Result<(), String> {
    let mut session_2 = read_2();
    ban_path(&mut session_2, old, new);
    write_2(&session_2)
}

pub fn ban_path(session_2: &mut SessionState, old: &str, new: &str) {
    let must_inner = session_2.scroll.remove(old);
    if let Some(must_inner) = must_inner {
        session_2.scroll.insert(new.to_string(), must_inner);
    }
    session_2.recent.retain(|p| p != old);
    derive_into_most_enter(&mut session_2.recent, new);
}

pub fn save_scroll(path_3: &str, must_inner: f64) -> Result<(), String> {
    let mut session_2 = read_2();
    session_2
        .scroll
        .insert(path_3.to_string(), add_must_inner(must_inner));
    write_2(&session_2)
}

pub fn save_session(open: Vec<String>, active: Option<String>) -> Result<(), String> {
    let mut session_2 = read_2();
    session_2.open = open;
    session_2.active = active;
    write_2(&session_2)
}

pub fn save_workspace(path_3: Option<&str>) -> Result<(), String> {
    let mut session_2 = read_2();
    session_2.workspace = path_3.map(str::to_string);
    write_2(&session_2)
}

pub fn target_3() -> Option<PathBuf> {
    paths::session_file().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_2(open: &[&str], recent: &[&str]) -> SessionState {
        SessionState {
            open: open.iter().map(|s| s.to_string()).collect(),
            active: open.first().map(|s| s.to_string()),
            recent: recent.iter().map(|s| s.to_string()).collect(),
            scroll: BTreeMap::new(),
            workspace: None,
        }
    }

    #[test]
    fn most_enter_is_get_middle_cut_new_at_before() {
        let mut list_table = vec!["b.md".to_string(), "a.md".to_string()];
        derive_into_most_enter(&mut list_table, "a.md");
        assert_eq!(list_table, vec!["a.md", "b.md"], "\u{8001}\u{7684}\u{90a3}\u{6761}\u{8981}\u{88ab}\u{63d0}\u{5230}\u{6700}\u{524d}\u{ff0c}\u{4e0d}\u{662f}\u{7559}\u{4e24}\u{6761}");
        derive_into_most_enter(&mut list_table, "c.md");
        assert_eq!(list_table, vec!["c.md", "a.md", "b.md"]);
    }

    #[test]
    fn middle_service_derive_same_one_item_not_produce_generate_edit_render() {
        let mut list_table = vec!["a.md".to_string(), "b.md".to_string()];
        let source_sample = list_table.clone();
        derive_into_most_enter(&mut list_table, "a.md");
        assert_eq!(list_table, source_sample);
    }

    #[test]
    fn most_enter_has_upper_thread_cut_see_is_position_handle() {
        let mut list_table: Vec<String> = Vec::new();
        for i in 0..(MAX_RECENT_FILES + 5) {
            derive_into_most_enter(&mut list_table, &format!("f{i}.md"));
        }
        assert_eq!(list_table.len(), MAX_RECENT_FILES);
        assert_eq!(
            list_table[0],
            format!("f{}.md", MAX_RECENT_FILES + 4),
            "\u{6700}\u{65b0}\u{7684}\u{8981}\u{5728}\u{6700}\u{524d}"
        );
        assert!(
            !list_table.contains(&"f0.md".to_string()),
            "\u{6700}\u{8001}\u{7684}\u{8981}\u{88ab}\u{780d}\u{6389}"
        );
    }

    #[test]
    fn change_name_only_after_most_enter_and_gun_dynamic_position_only_one_start_half_passed_get() {
        let mut session_2 = create_2(&[], &["/\u{8001}.md", "/\u{522b}\u{7684}.md"]);
        session_2.scroll.insert("/\u{8001}.md".to_string(), 0.75);
        session_2
            .scroll
            .insert("/\u{522b}\u{7684}.md".to_string(), 0.1);

        ban_path(&mut session_2, "/\u{8001}.md", "/\u{65b0}.md");

        assert_eq!(session_2.recent, vec!["/\u{65b0}.md", "/\u{522b}\u{7684}.md"], "\u{65b0}\u{540d}\u{5b57}\u{8fdb}\u{5217}\u{8868}\u{3001}\u{8001}\u{540d}\u{5b57}\u{51fa}\u{53bb}");
        assert_eq!(
            session_2.scroll.get("/\u{65b0}.md"),
            Some(&0.75),
            "\u{770b}\u{5230}\u{7b2c}\u{51e0}\u{9875}\u{8981}\u{8ddf}\u{7740}\u{8d70}"
        );
        assert_eq!(session_2.scroll.get("/\u{8001}.md"), None, "\u{8001}\u{8def}\u{5f84}\u{7684}\u{8d26}\u{8981}\u{6e05}\u{6389}\u{ff0c}\u{522b}\u{7559}\u{4e2a}\u{5e7d}\u{7075}");
        assert_eq!(session_2.scroll.get("/\u{522b}\u{7684}.md"), Some(&0.1), "\u{522b}\u{7684}\u{6587}\u{6863}\u{4e00}\u{4e2a}\u{5b57}\u{8282}\u{90fd}\u{4e0d}\u{8bb8}\u{52a8}");
    }

    #[test]
    fn not_at_length_inner_file_change_name_page_enter_most_enter() {
        let mut session_2 = create_2(&[], &["/\u{522b}\u{7684}.md"]);
        ban_path(
            &mut session_2,
            "/\u{4ece}\u{6765}\u{6ca1}\u{8bb0}\u{8fc7}\u{7684}.md",
            "/\u{65b0}\u{7684}.md",
        );
        assert_eq!(
            session_2.recent,
            vec!["/\u{65b0}\u{7684}.md", "/\u{522b}\u{7684}.md"]
        );
        assert_eq!(session_2.scroll.get("/\u{65b0}\u{7684}.md"), None, "\u{672c}\u{6765}\u{5c31}\u{6ca1}\u{6bd4}\u{4f8b}\u{ff0c}\u{522b}\u{51ed}\u{7a7a}\u{9020}\u{4e00}\u{4e2a}");
    }

    #[test]
    fn must_inner_add_enter_zero_to_one_cut_when_main_invalid_data() {
        assert_eq!(add_must_inner(0.42), 0.42);
        assert_eq!(add_must_inner(-3.0), 0.0);
        assert_eq!(add_must_inner(7.5), 1.0);
        assert_eq!(add_must_inner(f64::NAN), 0.0, "NaN \u{5fc5}\u{987b}\u{53d8}\u{6210} 0\u{2014}\u{2014}clamp \u{6321}\u{4e0d}\u{4f4f}\u{5b83}");
        assert_eq!(add_must_inner(f64::INFINITY), 0.0);
        assert_eq!(add_must_inner(f64::NEG_INFINITY), 0.0);
    }

    #[test]
    fn store_read_one_full_not_discard_dynamic_system() {
        let mut session_2 = create_2(&["/a.md", "/b.md"], &["/b.md", "/a.md"]);
        session_2.active = Some("/b.md".to_string());
        session_2.scroll.insert("/a.md".to_string(), 0.25);
        session_2.workspace = Some("/\u{7b14}\u{8bb0}".to_string());
        let text = to_text(&session_2).expect("\u{5199}\u{5f97}\u{51fa}\u{6765}");
        assert_eq!(from_text(&text), session_2);
    }

    #[test]
    fn workspace_record_main_page_read_return() {
        let mut session_2 = create_2(&["/a.md"], &["/a.md"]);
        session_2.workspace = Some("/home/lqy/\u{7b14}\u{8bb0}".to_string());
        let text = to_text(&session_2).expect("\u{5199}\u{5f97}\u{51fa}\u{6765}");
        assert!(
            text.contains("workspace = \"/home/lqy/\u{7b14}\u{8bb0}\""),
            "\u{5de5}\u{4f5c}\u{533a}\u{5f97}\u{5199}\u{8fdb}\u{6587}\u{4ef6}\u{91cc}\u{ff08}\u{7528}\u{6237}\u{7ffb}\u{8fd9}\u{4efd}\u{6587}\u{4ef6}\u{65f6}\u{8be5}\u{770b}\u{5f97}\u{89c1}\u{ff09}\u{ff1a}\n{text}"
        );
        assert_eq!(
            from_text(&text).workspace.as_deref(),
            Some("/home/lqy/\u{7b14}\u{8bb0}")
        );
    }

    #[test]
    fn old_side_carrier_each_has_workspace_that_one_line_page_can_read() {
        let loaded = from_text("open = [\"/a.md\"]\nactive = \"/a.md\"\nrecent = [\"/a.md\"]\n");
        assert_eq!(loaded.open, vec!["/a.md"], "\u{522b}\u{7684}\u{5b57}\u{6bb5}\u{4e00}\u{4e2a}\u{90fd}\u{4e0d}\u{80fd}\u{8ddf}\u{7740}\u{4e22}");
        assert_eq!(loaded.workspace, None);
    }

    #[test]
    fn empty_workspace_when_each_has() {
        assert_eq!(from_text("workspace = \"\"\n").workspace, None);
    }

    #[test]
    fn empty_session_page_can_store_can_read() {
        let text = to_text(&SessionState::default()).expect("\u{5199}\u{5f97}\u{51fa}\u{6765}");
        assert!(
            text.contains("Deleting this file"),
            "missing file header: {text}"
        );
        assert_eq!(from_text(&text), SessionState::default());
    }

    #[test]
    fn broken_file_when_empty_use_not_package_error() {
        assert_eq!(
            from_text("\u{8fd9}\u{4e0d}\u{662f} toml {{{"),
            SessionState::default()
        );
        assert_eq!(from_text(""), SessionState::default());
    }

    #[test]
    fn read_enter_incoming_must_inner_page_add() {
        let loaded = from_text("[scroll]\n\"/a.md\" = 3.5\n\"/b.md\" = -1.0\n");
        assert_eq!(loaded.scroll["/a.md"], 1.0);
        assert_eq!(loaded.scroll["/b.md"], 0.0);
    }

    #[test]
    fn empty_active_when_each_has() {
        assert_eq!(from_text("active = \"\"\n").active, None);
    }

    #[test]
    fn request_four_link_handle_three_out_all_request_drop() {
        let mut session_2 = create_2(
            &["/a.md", "/\u{6ca1}\u{4e86}.md"],
            &["/a.md", "/\u{6ca1}\u{4e86}.md"],
        );
        session_2
            .scroll
            .insert("/\u{6ca1}\u{4e86}.md".to_string(), 0.5);
        session_2.scroll.insert("/a.md".to_string(), 0.5);
        remove_missing(&mut session_2, |p| p == "/a.md");
        assert_eq!(session_2.open, vec!["/a.md"]);
        assert_eq!(session_2.recent, vec!["/a.md"]);
        assert_eq!(session_2.scroll.len(), 1, "\u{6b7b}\u{94fe}\u{7684}\u{6eda}\u{52a8}\u{4f4d}\u{7f6e}\u{4e5f}\u{8981}\u{6e05}\u{ff1a}{:?}", session_2.scroll);
    }

    #[test]
    fn modify_check_handle_gun_dynamic_reverse_position_press_return_manifest_inner() {
        let mut session_2 = create_2(&["/a.md"], &["/a.md", "/b.md"]);
        session_2.scroll.insert("/a.md".to_string(), 0.1);
        session_2.scroll.insert("/b.md".to_string(), 0.2);
        session_2.scroll.insert(
            "/\u{65e9}\u{5c31}\u{4e0d}\u{5f00}\u{4e86}.md".to_string(),
            0.3,
        );
        modify_check(&mut session_2);
        assert_eq!(session_2.scroll.len(), 2);
        assert!(!session_2
            .scroll
            .contains_key("/\u{65e9}\u{5c31}\u{4e0d}\u{5f00}\u{4e86}.md"));
    }

    #[test]
    fn gun_dynamic_table_not_return_month_store_month_large() {
        let mut session_2 = SessionState::default();
        for i in 0..200 {
            let p = format!("/f{i}.md");
            derive_into_most_enter(&mut session_2.recent, &p);
            session_2.scroll.insert(p, 0.5);
        }
        let text = to_text(&session_2).expect("\u{5199}\u{5f97}\u{51fa}\u{6765}");
        let return_incoming = from_text(&text);
        assert!(
            return_incoming.scroll.len() <= MAX_RECENT_FILES,
            "\u{6eda}\u{52a8}\u{8868}\u{6ca1}\u{6709}\u{88ab}\u{538b}\u{56de}\u{6765}\u{ff1a}{} \u{6761}",
            return_incoming.scroll.len()
        );
    }

    #[test]
    fn session_item_data_has_upper_thread() {
        let multiple: Vec<String> = (0..(MAX_SESSIONS + 6))
            .map(|i| format!("/f{i}.md"))
            .collect();
        let mut session_2 = create_2(&[], &[]);
        session_2.open = multiple;
        modify_check(&mut session_2);
        assert_eq!(session_2.open.len(), MAX_SESSIONS);
        assert_eq!(session_2.open[0], "/f0.md", "\u{780d}\u{7684}\u{662f}\u{540e}\u{9762}\u{7684}\u{ff0c}\u{987a}\u{5e8f}\u{4e0d}\u{8bb8}\u{52a8}");
    }

    #[test]
    fn write_file_at_read_return_incoming() {
        let directory_2 = std::env::temp_dir().join(format!(
            "nota-session-test-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&directory_2).expect("\u{5efa}\u{4e34}\u{65f6}\u{76ee}\u{5f55}");
        let file_3 = directory_2.join("session.toml");

        let session_2 = create_2(&["/a.md"], &["/a.md", "/b.md"]);
        write_file_2(&file_3, &session_2).expect("\u{5199}\u{5f97}\u{51fa}\u{53bb}");
        assert_eq!(read_file_2(&file_3), session_2);

        write_file_2(&file_3, &create_2(&[], &[])).expect("\u{5199}\u{5f97}\u{51fa}\u{53bb}");
        assert_eq!(read_file_2(&file_3), SessionState::default());

        std::fs::remove_file(&file_3).expect("\u{5220}\u{5f97}\u{6389}");
        assert_eq!(read_file_2(&file_3), SessionState::default());

        let _ = std::fs::remove_dir_all(&directory_2);
    }
}
