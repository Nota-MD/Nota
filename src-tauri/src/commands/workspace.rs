//! 工作区（打开的文件夹）相关命令。
//!
//! 工作区这一栏不只是 UI 状态——它同时是 `nota.fs` 与 `nota.git` 的**围栏**：
//! 插件能碰的文件范围、能跑 git 的目录，都由它决定。所以设工作区这个动作
//! 走的是**规范化后的绝对路径**，不是用户点进来的那个可能带 `..` 的串。

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::error::{NotaError, Result};
use crate::state::AppState;

/// 文件树的一格。
#[derive(Debug, Clone, Serialize)]
pub struct TreeNode {
    /// 显示名（文件名）。
    pub name: String,
    /// **相对工作区根**的路径，用 `/` 分隔。
    /// 用相对路径而不是绝对路径：前端把整棵树递来递去时不必背着机器信息，
    /// 插件也能直接拿它去 `nota.fs.read`（那个 API 只收相对路径）。
    pub path: String,
    pub is_dir: bool,
    /// 目录才有；文件是 `None`。
    pub children: Option<Vec<TreeNode>>,
}

/// 打开一个文件夹作工作区。
#[tauri::command]
pub fn nota_workspace_open(state: State<'_, AppState>, path: String) -> Result<String> {
    let canonical = PathBuf::from(&path)
        .canonicalize()
        .map_err(|source| NotaError::Read {
            path: PathBuf::from(&path),
            source,
        })?;

    if !canonical.is_dir() {
        return Err(NotaError::other(format!("{path} 不是文件夹")));
    }

    *state.workspace.lock().unwrap() = Some(canonical.clone());
    crate::paths::path_to_string(&canonical)
}

/// 关掉工作区。**只清围栏，不关文档**——用户开着的标签照旧。
#[tauri::command]
pub fn nota_workspace_close(state: State<'_, AppState>) -> Result<()> {
    *state.workspace.lock().unwrap() = None;
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

/// 取工作区的文件树。
///
/// `depth` 是递归层数上限，前端按侧栏展开状态分段请求（先 1 层，展开某个目录时
/// 再要那一支）。**不做整棵树一次拉完**——大仓库（几万个文件）那样会卡住界面。
#[tauri::command]
pub fn nota_workspace_tree(
    state: State<'_, AppState>,
    sub_path: Option<String>,
    depth: Option<u32>,
) -> Result<Vec<TreeNode>> {
    let root = state
        .workspace
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| NotaError::other("没有打开工作区"))?;

    // 子路径同样要过一遍围栏——它从前端来，不能假定是干净的。
    let base = match sub_path {
        Some(sub) => crate::lua::api::fs::resolve_in(&root, &sub)?,
        None => root.clone(),
    };
    if !base.is_dir() {
        return Err(NotaError::other(format!("{} 不是文件夹", base.display())));
    }

    let base_rel = base
        .strip_prefix(&root)
        .map(|p| p.to_path_buf())
        .unwrap_or_default();

    Ok(read_dir_sorted(&base, &base_rel, depth.unwrap_or(1)))
}

/// 读一层目录，排好序，按 `depth` 决定要不要递归下去。
fn read_dir_sorted(dir: &Path, rel: &Path, depth: u32) -> Vec<TreeNode> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut dirs: Vec<TreeNode> = Vec::new();
    let mut files: Vec<TreeNode> = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        // 跳过的三类：点开头（.git/.obsidian 这类元数据）、node_modules、
        // 以及符号链接本身。**符号链接不跟**——跟了就可能绕出工作区，
        // 也可能成环把内存吃光。
        if name.starts_with('.') || name == "node_modules" {
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

        if meta.is_dir() {
            dirs.push(TreeNode {
                name,
                path: rel_str,
                is_dir: true,
                children: if depth > 1 {
                    Some(read_dir_sorted(&entry.path(), &child_rel, depth - 1))
                } else {
                    None
                },
            });
        } else if is_markdown(&name) {
            // 文件树**只列 markdown**——这是对标 Typora 的口径。
            // 要列全部文件的那天再放宽，见 `docs/07`。
            files.push(TreeNode {
                name,
                path: rel_str,
                is_dir: false,
                children: None,
            });
        }
    }

    // 目录在前、文件在后，各自按名字排。用不区分大小写的比较——
    // 混排大小写时（README.md 与 apple.md）区分大小写的结果看着是乱的。
    let by_name = |a: &TreeNode, b: &TreeNode| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    };
    dirs.sort_by(by_name);
    files.sort_by(by_name);

    dirs.extend(files);
    dirs
}

/// 哪些后缀算 markdown。与 `docs/03` 里认领的后缀表**必须一致**。
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
    fn 认领的_markdown_后缀() {
        assert!(is_markdown("a.md"));
        assert!(is_markdown("A.MD"), "后缀大小写要认");
        assert!(is_markdown("b.markdown"));
        assert!(!is_markdown("c.rs"));
        assert!(!is_markdown("d.pd"));
    }

    #[test]
    fn 文件树只列_markdown_并且目录在前() {
        let root = std::env::temp_dir().join("nota-tree-test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("zeta")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(root.join("a.md"), "# a").unwrap();
        std::fs::write(root.join("b.png"), "x").unwrap();

        let tree = read_dir_sorted(&root, Path::new(""), 1);
        let names: Vec<&str> = tree.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["zeta", "a.md"], "目录在前、只留 md、跳过点开头");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn depth_为_1_时不给子节点() {
        let root = std::env::temp_dir().join("nota-tree-depth");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("d")).unwrap();
        std::fs::write(root.join("d/inner.md"), "# x").unwrap();

        let tree = read_dir_sorted(&root, Path::new(""), 1);
        assert!(tree[0].children.is_none());

        let tree = read_dir_sorted(&root, Path::new(""), 2);
        assert_eq!(tree[0].children.as_ref().unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(&root);
    }
}
