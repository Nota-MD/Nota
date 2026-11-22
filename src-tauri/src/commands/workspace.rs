use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{NotaError, Result};
use crate::settings::files::{FileFilter, Files, TreeSort};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct TreeNode {
    pub name: String,

    pub path: String,
    pub is_dir: bool,

    pub children: Option<Vec<TreeNode>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExcerpt {
    pub path: String,
    pub title: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TreeOptions {
    pub sort: Option<TreeSort>,

    pub filter: Option<FileFilter>,

    pub show_hidden: Option<bool>,
}

#[derive(Debug, Clone, Copy)]
struct ResolvedTreeOptions {
    sort: TreeSort,
    filter: FileFilter,
    show_hidden: bool,
}

impl Default for ResolvedTreeOptions {
    fn default() -> Self {
        Self {
            sort: TreeSort::default(),
            filter: FileFilter::default(),
            show_hidden: false,
        }
    }
}

fn parse_options(opts: Option<TreeOptions>, she: &Files) -> ResolvedTreeOptions {
    ResolvedTreeOptions {
        sort: opts.as_ref().and_then(|o| o.sort).unwrap_or(she.tree_sort),
        filter: opts
            .as_ref()
            .and_then(|o| o.filter)
            .unwrap_or(she.tree_filter),
        show_hidden: opts
            .as_ref()
            .and_then(|o| o.show_hidden)
            .unwrap_or(she.show_hidden),
    }
}

#[tauri::command]
pub fn nota_workspace_open(state: State<'_, AppState>, path: String) -> Result<String> {
    let canonical = PathBuf::from(&path)
        .canonicalize()
        .map_err(|source| NotaError::Read {
            path: PathBuf::from(&path),
            source,
        })?;

    if !canonical.is_dir() {
        return Err(NotaError::other(format!("{path} is not a folder")));
    }

    let canonical_string = crate::paths::path_to_string(&canonical)?;
    *state.workspace.lock().unwrap() = Some(canonical.clone());

    if let Err(e) = crate::session::save_workspace(Some(&canonical_string)) {
        crate::debug_log!("[nota] workspace not saved to session: {e}");
    }
    crate::debug_log!("[nota] workspace opened: {canonical_string}");
    Ok(canonical_string)
}

#[tauri::command]
pub fn nota_workspace_close(state: State<'_, AppState>) -> Result<()> {
    *state.workspace.lock().unwrap() = None;

    if let Err(e) = crate::session::save_workspace(None) {
        crate::debug_log!("[nota] failed to clear workspace from session: {e}");
    }
    crate::debug_log!("[nota] workspace closed");
    Ok(())
}

#[tauri::command]
pub fn nota_workspace_get(state: State<'_, AppState>) -> Result<Option<String>> {
    let ws = state.workspace.lock().unwrap();
    match ws.as_ref() {
        Some(p) => Ok(Some(crate::paths::path_to_string(p)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn nota_workspace_delete_path(state: State<'_, AppState>, path: String) -> Result<()> {
    let root = state
        .workspace
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| NotaError::other("No workspace is open"))?;
    delete_workspace_path(&root, Path::new(&path))
}

fn delete_workspace_path(root: &Path, path: &Path) -> Result<()> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| NotaError::other("Only files inside the current workspace can be deleted"))?;
    if relative.as_os_str().is_empty() {
        return Err(NotaError::other("The workspace root cannot be deleted"));
    }
    let target = crate::lua::api::fs::resolve_in(root, &relative.to_string_lossy())?;
    let metadata = std::fs::symlink_metadata(&target).map_err(|source| NotaError::Read {
        path: target.clone(),
        source,
    })?;
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        std::fs::remove_dir_all(&target).map_err(|source| NotaError::Delete {
            path: target,
            source,
        })
    } else {
        std::fs::remove_file(&target).map_err(|source| NotaError::Delete {
            path: target,
            source,
        })
    }
}

#[tauri::command]
pub async fn nota_workspace_excerpts(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<WorkspaceExcerpt>> {
    let root = state
        .workspace
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| NotaError::other("No workspace is open"))?;
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|path| {
                let full = crate::lua::api::fs::resolve_in(&root, &path)?;
                if has_binary_suffix(&full) {
                    return Ok(WorkspaceExcerpt {
                        path,
                        title: None,
                        detail: None,
                    });
                }
                let mut bytes = Vec::with_capacity(16 * 1024);
                let file = std::fs::File::open(&full).map_err(|source| NotaError::Read {
                    path: full.clone(),
                    source,
                })?;
                file.take(16 * 1024)
                    .read_to_end(&mut bytes)
                    .map_err(|source| NotaError::Read { path: full, source })?;
                if !can_extract_text_excerpt(&bytes) {
                    return Ok(WorkspaceExcerpt {
                        path,
                        title: None,
                        detail: None,
                    });
                }
                let (text, _) = crate::text_encoding::guess_decode(&bytes);
                let (title, detail) = take_summary(&text);
                Ok(WorkspaceExcerpt {
                    path,
                    title,
                    detail,
                })
            })
            .collect()
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not read file summaries: {error}")))?
}

fn can_extract_text_excerpt(bytes: &[u8]) -> bool {
    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        return true;
    }
    if bytes.contains(&0) {
        return false;
    }
    let bad = bytes
        .iter()
        .filter(|byte| **byte < 0x09 || (**byte > 0x0D && **byte < 0x20))
        .count();
    bad * 20 <= bytes.len()
}

fn has_binary_suffix(path: &Path) -> bool {
    let suffix = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        suffix.as_str(),
        "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "bmp"
            | "avif"
            | "ico"
            | "pdf"
            | "zip"
            | "gz"
            | "bz2"
            | "xz"
            | "7z"
            | "rar"
            | "mp3"
            | "mp4"
            | "m4v"
            | "webm"
            | "ogv"
            | "woff"
            | "woff2"
            | "ttf"
            | "otf"
    )
}

fn take_summary(text: &str) -> (Option<String>, Option<String>) {
    let mut lines = text.lines();
    if lines
        .clone()
        .next()
        .is_some_and(|line| line.trim() == "---")
    {
        lines.next();
        for line in lines.by_ref() {
            if line.trim() == "---" {
                break;
            }
        }
    }

    let mut picked = Vec::new();
    for raw in lines {
        let Some(line) = clean_summary_line(raw) else {
            continue;
        };
        picked.push(truncate_2(&line, if picked.is_empty() { 80 } else { 120 }));
        if picked.len() == 2 {
            break;
        }
    }
    (picked.first().cloned(), picked.get(1).cloned())
}

fn clean_summary_line(raw: &str) -> Option<String> {
    let mut line = raw.trim();
    if line.is_empty()
        || line == "---"
        || line.starts_with("```")
        || line.starts_with("~~~")
        || line.starts_with("<!--")
        || line.starts_with('|')
    {
        return None;
    }
    line = line.trim_start_matches(['#', '>']).trim();
    for marker in ["- ", "* ", "+ "] {
        if let Some(rest) = line.strip_prefix(marker) {
            line = rest.trim();
            break;
        }
    }
    if let Some((prefix, rest)) = line.split_once(". ") {
        if !prefix.is_empty() && prefix.chars().all(|c| c.is_ascii_digit()) {
            line = rest.trim();
        }
    }
    let cleaned = line
        .replace("**", "")
        .replace("__", "")
        .replace("~~", "")
        .replace('`', "");
    let cleaned = cleaned.trim();
    (!cleaned.is_empty()).then(|| cleaned.to_string())
}

fn truncate_2(text: &str, max_chars: usize) -> String {
    let mut chars = text.chars();
    let head: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{head}\u{2026}")
    } else {
        head
    }
}

#[tauri::command]
pub fn nota_workspace_tree(
    state: State<'_, AppState>,
    sub_path: Option<String>,
    depth: Option<u32>,
    opts: Option<TreeOptions>,
) -> Result<Vec<TreeNode>> {
    let root = state
        .workspace
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| NotaError::other("No workspace is open"))?;

    let base = match sub_path {
        Some(sub) => crate::lua::api::fs::resolve_in(&root, &sub)?,
        None => root.clone(),
    };
    if !base.is_dir() {
        return Err(NotaError::other(format!(
            "{} is not a folder",
            base.display()
        )));
    }

    let base_rel = base
        .strip_prefix(&root)
        .map(|p| p.to_path_buf())
        .unwrap_or_default();

    let options_2 = {
        let she = state.settings.lock().unwrap();
        parse_options(opts, &she.files)
    };

    read_dir_sorted(&base, &base_rel, depth.unwrap_or(1), options_2)
}

fn read_dir_sorted(
    dir: &Path,
    rel: &Path,
    depth: u32,
    options_2: ResolvedTreeOptions,
) -> Result<Vec<TreeNode>> {
    let entries = std::fs::read_dir(dir).map_err(|source| NotaError::Read {
        path: dir.to_path_buf(),
        source,
    })?;

    const YONG_YUAN_TIAO_GUO: [&str; 2] = [".git", "node_modules"];

    struct FileCandidate {
        node_2: TreeNode,
        time_2: Option<SystemTime>,
    }

    let mut dirs: Vec<FileCandidate> = Vec::new();
    let mut files: Vec<FileCandidate> = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') && !options_2.show_hidden {
            continue;
        }

        if YONG_YUAN_TIAO_GUO.contains(&name.as_str()) {
            continue;
        }

        let Ok(meta) = entry.metadata() else { continue };

        if meta.file_type().is_symlink() {
            continue;
        }

        let child_rel = rel.join(&name);
        let rel_str = child_rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");

        let time_2 = match options_2.sort {
            TreeSort::Name => None,
            TreeSort::Modified => meta.modified().ok(),

            TreeSort::Created => meta.created().ok().or_else(|| meta.modified().ok()),
        };

        if meta.is_dir() {
            dirs.push(FileCandidate {
                node_2: TreeNode {
                    name,
                    path: rel_str,
                    is_dir: true,
                    children: if depth > 1 {
                        Some(
                            read_dir_sorted(&entry.path(), &child_rel, depth - 1, options_2)
                                .unwrap_or_default(),
                        )
                    } else {
                        None
                    },
                },
                time_2,
            });
        } else if options_2.filter == FileFilter::All || is_markdown(&name) {
            files.push(FileCandidate {
                node_2: TreeNode {
                    name,
                    path: rel_str,
                    is_dir: false,
                    children: None,
                },
                time_2,
            });
        }
    }

    let by_name = |a: &FileCandidate, b: &FileCandidate| {
        a.node_2
            .name
            .to_lowercase()
            .cmp(&b.node_2.name.to_lowercase())
            .then_with(|| a.node_2.name.cmp(&b.node_2.name))
    };

    let compare = |a: &FileCandidate, b: &FileCandidate| match options_2.sort {
        TreeSort::Name => by_name(a, b),
        TreeSort::Modified | TreeSort::Created => {
            b.time_2.cmp(&a.time_2).then_with(|| by_name(a, b))
        }
    };
    dirs.sort_by(compare);
    files.sort_by(compare);

    Ok(dirs.into_iter().chain(files).map(|c| c.node_2).collect())
}

fn is_markdown(name: &str) -> bool {
    let lower = name.to_lowercase();
    [".md", ".markdown", ".mdown", ".mkd", ".mdx", ".txt"]
        .iter()
        .any(|ext| lower.ends_with(ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ren_ling_de_markdown_extension() {
        assert!(is_markdown("a.md"));
        assert!(
            is_markdown("A.MD"),
            "\u{540e}\u{7f00}\u{5927}\u{5c0f}\u{5199}\u{8981}\u{8ba4}"
        );
        assert!(is_markdown("b.markdown"));
        assert!(!is_markdown("c.rs"));
        assert!(!is_markdown("d.pd"));
    }

    #[test]
    fn file_summary_tiao_guo_front_matter_bing_qu_liang_xing() {
        let text = "---\ntitle: \u{5143}\u{6570}\u{636e}\n---\n\n# UNIX\u{ae}\n\n**\u{53a6}\u{95e8}\u{5e02}\u{69df}\u{6994}\u{4e2d}\u{5b66}** 2024\u{ff08}12\u{ff09} \u{674e}\u{9f50}\n\n\u{540e}\u{6587}";
        let (title, detail) = take_summary(text);
        assert_eq!(title.as_deref(), Some("UNIX\u{ae}"));
        assert_eq!(detail.as_deref(), Some("\u{53a6}\u{95e8}\u{5e02}\u{69df}\u{6994}\u{4e2d}\u{5b66} 2024\u{ff08}12\u{ff09} \u{674e}\u{9f50}"));
    }

    #[test]
    fn file_shu_zhi_lie_markdown_bing_qie_directory_zai_qian() {
        let root = std::env::temp_dir().join("nota-tree-test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("zeta")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(root.join("a.md"), "# a").unwrap();
        std::fs::write(root.join("b.png"), "x").unwrap();

        let tree =
            read_dir_sorted(&root, Path::new(""), 1, ResolvedTreeOptions::default()).unwrap();
        let names: Vec<&str> = tree.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["zeta", "a.md"], "\u{76ee}\u{5f55}\u{5728}\u{524d}\u{3001}\u{53ea}\u{7559} md\u{3001}\u{8df3}\u{8fc7}\u{70b9}\u{5f00}\u{5934}");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn depth_wei_1_shi_bu_gei_zi_node() {
        let root = std::env::temp_dir().join("nota-tree-depth");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("d")).unwrap();
        std::fs::write(root.join("d/inner.md"), "# x").unwrap();

        let tree =
            read_dir_sorted(&root, Path::new(""), 1, ResolvedTreeOptions::default()).unwrap();
        assert!(tree[0].children.is_none());

        let tree =
            read_dir_sorted(&root, Path::new(""), 2, ResolvedTreeOptions::default()).unwrap();
        assert_eq!(tree[0].children.as_ref().unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(&root);
    }

    fn da_ge_directory(ming: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("nota-tree-{ming}"));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn ming_men(shu_2: &[TreeNode]) -> Vec<String> {
        shu_2.iter().map(|n| n.name.clone()).collect()
    }

    #[test]
    fn options_zhu_ge_hui_luo() {
        let she = Files {
            tree_sort: TreeSort::Modified,
            tree_filter: FileFilter::All,
            show_hidden: true,
            ..Default::default()
        };

        let quan_que = parse_options(None, &she);
        assert_eq!(quan_que.sort, TreeSort::Modified);
        assert_eq!(quan_que.filter, FileFilter::All);
        assert!(quan_que.show_hidden);

        let zhi_gei_pai_xu = parse_options(
            Some(TreeOptions {
                sort: Some(TreeSort::Name),
                ..Default::default()
            }),
            &she,
        );
        assert_eq!(zhi_gei_pai_xu.sort, TreeSort::Name);
        assert_eq!(
            zhi_gei_pai_xu.filter,
            FileFilter::All,
            "\u{6ca1}\u{7ed9}\u{7684}\u{90a3}\u{683c}\u{8be5}\u{7167}\u{8bbe}\u{7f6e}\u{8d70}"
        );
        assert!(
            zhi_gei_pai_xu.show_hidden,
            "\u{6ca1}\u{7ed9}\u{7684}\u{90a3}\u{683c}\u{8be5}\u{7167}\u{8bbe}\u{7f6e}\u{8d70}"
        );

        let xian_shi_guan_diao_yin_cang = parse_options(
            Some(TreeOptions {
                show_hidden: Some(false),
                ..Default::default()
            }),
            &she,
        );
        assert!(
            !xian_shi_guan_diao_yin_cang.show_hidden,
            "\u{663e}\u{5f0f} false \u{5fc5}\u{987b}\u{771f}\u{7684}\u{5173}\u{6389}"
        );
    }

    #[test]
    fn an_xiu_gai_shi_jian_pai_shi_xin_de_zai_qian() {
        let root = da_ge_directory("modified");

        std::fs::write(root.join("a-\u{8001}.md"), "a").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(root.join("b-\u{65b0}.md"), "b").unwrap();

        let an_ming =
            read_dir_sorted(&root, Path::new(""), 1, ResolvedTreeOptions::default()).unwrap();
        assert_eq!(
            ming_men(&an_ming),
            vec!["a-\u{8001}.md", "b-\u{65b0}.md"],
            "\u{540d}\u{5b57}\u{6863}\u{7167}\u{65e7}\u{5347}\u{5e8f}"
        );

        let an_shi_jian = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            ResolvedTreeOptions {
                sort: TreeSort::Modified,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            ming_men(&an_shi_jian),
            vec!["b-\u{65b0}.md", "a-\u{8001}.md"],
            "\u{4fee}\u{6539}\u{65f6}\u{95f4}\u{6863}\u{ff1a}\u{65b0}\u{7684}\u{5728}\u{524d}"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn shi_jian_dang_li_directory_reng_zai_file_qian_mian() {
        let root = da_ge_directory("dirs-first");
        std::fs::create_dir_all(root.join("d")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(root.join("\u{540e}\u{6765}\u{7684}.md"), "x").unwrap();

        let shu_2 = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            ResolvedTreeOptions {
                sort: TreeSort::Modified,
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(ming_men(&shu_2), vec!["d", "\u{540e}\u{6765}\u{7684}.md"]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn xian_shi_yin_cang_file_dan_git_yu_node_modules_yong_bu_chu_xian() {
        let root = da_ge_directory("hidden");
        std::fs::write(root.join("\u{770b}\u{5f97}\u{5230}.md"), "x").unwrap();
        std::fs::write(root.join(".env"), "A=1").unwrap();
        std::fs::create_dir_all(root.join(".github")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let default_2 =
            read_dir_sorted(&root, Path::new(""), 1, ResolvedTreeOptions::default()).unwrap();
        assert_eq!(
            ming_men(&default_2),
            vec!["\u{770b}\u{5f97}\u{5230}.md"],
            "\u{9ed8}\u{8ba4}\u{6863}\u{8fde} .env \u{90fd}\u{4e0d}\u{5217}"
        );

        let zhi_bo_yin_cang = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            ResolvedTreeOptions {
                show_hidden: true,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            ming_men(&zhi_bo_yin_cang),
            vec![".github", "\u{770b}\u{5f97}\u{5230}.md"],
            "\u{9690}\u{85cf}\u{5f00}\u{4e86}\u{3001}\u{8fc7}\u{6ee4}\u{6ca1}\u{5f00}"
        );

        let bo_kai = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            ResolvedTreeOptions {
                show_hidden: true,
                filter: FileFilter::All,
                ..Default::default()
            },
        )
        .unwrap();
        let ming = ming_men(&bo_kai);
        for gai_zai in [".env", ".github"] {
            assert!(
                ming.contains(&gai_zai.to_string()),
                "{gai_zai} \u{8be5}\u{9732}\u{51fa}\u{6765}\u{4e86}\u{ff1a}{ming:?}"
            );
        }
        for yong_bu_zai in [".git", "node_modules"] {
            assert!(
                !ming.contains(&yong_bu_zai.to_string()),
                "{yong_bu_zai} \u{6c38}\u{8fdc}\u{4e0d}\u{8be5}\u{51fa}\u{73b0}\u{ff1a}{ming:?}"
            );
        }

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn guo_lv_dang_all_shi_lie_chu_fei_markdown_file() {
        let root = da_ge_directory("filter");
        std::fs::write(root.join("a.md"), "x").unwrap();
        std::fs::write(root.join("b.png"), "x").unwrap();

        let zhi_markdown =
            read_dir_sorted(&root, Path::new(""), 1, ResolvedTreeOptions::default()).unwrap();
        assert_eq!(ming_men(&zhi_markdown), vec!["a.md"]);

        let quan_bu = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            ResolvedTreeOptions {
                filter: FileFilter::All,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(ming_men(&quan_bu), vec!["a.md", "b.png"]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn binary_files_have_no_sidebar_excerpt_but_text_and_utf16_do() {
        assert!(!can_extract_text_excerpt(b"plain\0binary"));
        assert!(can_extract_text_excerpt(
            "\u{4e2d}\u{6587}\u{6458}\u{8981}".as_bytes()
        ));
        assert!(can_extract_text_excerpt(&[0xFF, 0xFE, b'A', 0, b'B', 0]));
        assert!(has_binary_suffix(Path::new("cover.PNG")));
        assert!(has_binary_suffix(Path::new("manual.pdf")));
        assert!(!has_binary_suffix(Path::new("notes.GBK.md")));
        assert!(!has_binary_suffix(Path::new("README")));
    }

    #[test]
    fn workspace_delete_handles_files_directories_and_root_guards() {
        let root = da_ge_directory("delete-path");
        let file = root.join("delete.md");
        let nested = root.join("folder").join("delete.md");
        std::fs::write(&file, "delete me").unwrap();
        std::fs::create_dir_all(nested.parent().unwrap()).unwrap();
        std::fs::write(&nested, "nested").unwrap();

        delete_workspace_path(&root, &file).unwrap();
        assert!(!file.exists());
        delete_workspace_path(&root, nested.parent().unwrap()).unwrap();
        assert!(!nested.parent().unwrap().exists());
        assert!(delete_workspace_path(&root, &root).is_err());
        assert!(delete_workspace_path(&root, Path::new("/tmp/outside-nota")).is_err());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn unreadable_directory_returns_an_error() {
        let missing_directory = std::env::temp_dir().join("nota-tree-does-not-exist-20260925");
        let _ = std::fs::remove_dir_all(&missing_directory);

        let result = read_dir_sorted(
            &missing_directory,
            Path::new(""),
            1,
            ResolvedTreeOptions::default(),
        );
        assert!(
            result.is_err(),
            "an unreadable directory must return Err, not an empty list"
        );
        assert!(
            result.unwrap_err().to_string().contains("Could not read"),
            "the error must contain a user-readable message"
        );
    }
}
