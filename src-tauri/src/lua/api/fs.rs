use std::path::{Component, Path, PathBuf};

use mlua::{Lua, Table};

use super::{lua_err, mlua_to_nota};
use crate::error::{NotaError, Result as NotaResult};
use crate::lua::HostContext;
use crate::plugin::manifest::{Capability, Manifest};

pub const EVENT_OPEN_DOCUMENT: &str = "nota:open-document";

pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;
    let can_read = manifest.has(Capability::FsRead);
    let can_write = manifest.has(Capability::FsWrite);

    if can_read {
        let ctx2 = ctx.clone();
        let read = lua
            .create_function(move |_, path: String| {
                let full = resolve(&ctx2, &path)?;
                std::fs::read_to_string(&full).map_err(|e| {
                    lua_err(NotaError::Read {
                        path: full,
                        source: e,
                    })
                })
            })
            .map_err(mlua_to_nota)?;
        t.set("read", read).map_err(mlua_to_nota)?;

        let ctx2 = ctx.clone();
        let exists = lua
            .create_function(move |_, path: String| {
                let full = resolve(&ctx2, &path)?;
                Ok(full.exists())
            })
            .map_err(mlua_to_nota)?;
        t.set("exists", exists).map_err(mlua_to_nota)?;

        let ctx2 = ctx.clone();
        let list = lua
            .create_function(move |_, path: String| {
                let full = resolve(&ctx2, &path)?;
                let entries = std::fs::read_dir(&full).map_err(|e| {
                    lua_err(NotaError::Read {
                        path: full.clone(),
                        source: e,
                    })
                })?;

                let mut out: Vec<String> = Vec::new();
                for entry in entries.flatten() {
                    if let Some(name) = entry.file_name().to_str() {
                        out.push(name.to_owned());
                    }
                }
                out.sort();
                Ok(out)
            })
            .map_err(mlua_to_nota)?;
        t.set("list", list).map_err(mlua_to_nota)?;

        let ctx2 = ctx.clone();
        let root = lua
            .create_function(move |_, ()| {
                let root = work_left_root(&ctx2).map_err(lua_err)?;
                root.to_str().map(str::to_owned).ok_or_else(|| {
                    lua_err(NotaError::other(
                        "The workspace root is not valid UTF-8 and cannot be referenced as a string",
                    ))
                })
            })
            .map_err(mlua_to_nota)?;
        t.set("root", root).map_err(mlua_to_nota)?;

        let ctx2 = ctx.clone();
        let relative = lua
            .create_function(move |_, path: String| {
                let root = work_left_root(&ctx2).map_err(lua_err)?;
                Ok(relative_in(&root, &path))
            })
            .map_err(mlua_to_nota)?;
        t.set("relative", relative).map_err(mlua_to_nota)?;

        let ctx2 = ctx.clone();
        let open = lua
            .create_function(move |_, path: String| {
                use tauri::Emitter;

                let full = resolve(&ctx2, &path)?;
                if !full.is_file() {
                    return Err(lua_err(NotaError::other(format!(
                        "nota.fs.open can only open files inside the workspace; `{path}` is not a file"
                    ))));
                }
                let path_text = full.to_str().ok_or_else(|| {
                    lua_err(NotaError::other(
                        "The target path is not valid UTF-8 and cannot be opened by the editor",
                    ))
                })?;
                ctx2
                    .app
                    .emit(EVENT_OPEN_DOCUMENT, serde_json::json!({ "path": path_text }))
                    .map_err(|e| {
                        lua_err(NotaError::other(format!("Could not ask the editor to open the file: {e}")))
                    })
            })
            .map_err(mlua_to_nota)?;
        t.set("open", open).map_err(mlua_to_nota)?;
    }

    if can_write {
        let ctx2 = ctx.clone();
        let write = lua
            .create_function(move |_, (path, text): (String, String)| {
                let full = resolve(&ctx2, &path)?;
                if let Some(parent) = full.parent() {
                    crate::paths::ensure_dir(parent).map_err(lua_err)?;
                }
                std::fs::write(&full, text).map_err(|e| {
                    lua_err(NotaError::Write {
                        path: full,
                        source: e,
                    })
                })
            })
            .map_err(mlua_to_nota)?;
        t.set("write", write).map_err(mlua_to_nota)?;

        let ctx2 = ctx.clone();
        let remove = lua
            .create_function(move |_, path: String| {
                let full = resolve(&ctx2, &path)?;
                std::fs::remove_file(&full).map_err(|e| {
                    lua_err(NotaError::Write {
                        path: full,
                        source: e,
                    })
                })
            })
            .map_err(mlua_to_nota)?;
        t.set("remove", remove).map_err(mlua_to_nota)?;
    }

    Ok(t)
}

fn relative_in(root: &Path, given: &str) -> Option<String> {
    let path = Path::new(given);
    let full = if path.is_absolute() {
        path.to_path_buf()
    } else {
        resolve_in(root, given).ok()?
    };
    let real_root = root.canonicalize().ok()?;
    let real_full = full.canonicalize().ok()?;
    let relative = real_full.strip_prefix(&real_root).ok()?;
    let text = relative.to_string_lossy().replace('\\', "/");
    (!text.is_empty()).then_some(text)
}

fn resolve(ctx: &HostContext, given: &str) -> mlua::Result<PathBuf> {
    let root = work_left_root(ctx).map_err(lua_err)?;
    resolve_in(&root, given).map_err(lua_err)
}

fn work_left_root(ctx: &HostContext) -> NotaResult<PathBuf> {
    let workspace = ctx.workspace.lock().unwrap().clone();
    let doc_dir = ctx
        .documents
        .lock()
        .unwrap()
        .active()
        .and_then(|d| d.path.as_ref())
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf());
    item_root(workspace, doc_dir).map_err(NotaError::other)
}

fn item_root(workspace: Option<PathBuf>, doc_dir: Option<PathBuf>) -> Result<PathBuf, String> {
    workspace.or(doc_dir).ok_or_else(|| {
        "nota.fs is unavailable because there is no workspace and the document has not been saved".to_owned()
    })
}

pub fn resolve_in(root: &Path, given: &str) -> NotaResult<PathBuf> {
    let rel = Path::new(given);

    if rel.is_absolute() {
        return Err(NotaError::other(format!(
            "nota.fs only accepts workspace-relative paths; received absolute path `{given}`"
        )));
    }

    let mut normalized = PathBuf::new();
    for comp in rel.components() {
        match comp {
            Component::Normal(p) => normalized.push(p),
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(NotaError::other(format!(
                        "Path `{given}` escapes the workspace"
                    )));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(NotaError::other(format!(
                    "Path `{given}` is not a valid workspace-relative path"
                )));
            }
        }
    }

    let full = root.join(&normalized);

    let real_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let probe = if full.exists() {
        full.canonicalize().ok()
    } else {
        full.parent().and_then(|p| p.canonicalize().ok())
    };
    if let Some(probe) = probe {
        if !probe.starts_with(&real_root) {
            return Err(NotaError::other(format!(
                "Path `{given}` resolves outside the workspace through a symbolic link"
            )));
        }
    }

    Ok(full)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_workspace(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("nota-fs-sandbox-{tag}"));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("\u{5b50}\u{76ee}\u{5f55}")).unwrap();
        root.canonicalize().unwrap()
    }

    #[test]
    fn root_has_thread_workspace_each_start_workspace_old_use_document_directory() {
        let get = PathBuf::from("/tmp/\u{67d0}\u{5de5}\u{4f5c}\u{533a}");
        let text = PathBuf::from("/tmp/\u{67d0}\u{5904}");

        assert_eq!(item_root(Some(get.clone()), None).unwrap(), get);
        assert_eq!(
            item_root(Some(get.clone()), Some(text.clone())).unwrap(),
            get
        );
        assert_eq!(item_root(None, Some(text.clone())).unwrap(), text);

        let err = item_root(None, None).unwrap_err();
        assert!(err.contains("unavailable"), "unexpected error: {err}");
        assert!(
            err.contains("has not been saved"),
            "expected an unsaved-document reason: {err}"
        );
    }

    #[test]
    fn plain_same_item_pair_path_can_passed() {
        let root = temp_workspace("plain");
        let got = resolve_in(&root, "\u{5b50}\u{76ee}\u{5f55}/a.md").unwrap();
        assert_eq!(got, root.join("\u{5b50}\u{76ee}\u{5f55}/a.md"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn point_start_header_request_out_drop_single_not_month_boundary() {
        let root = temp_workspace("curdir");
        let got = resolve_in(&root, "./\u{5b50}\u{76ee}\u{5f55}/./a.md").unwrap();
        assert_eq!(got, root.join("\u{5b50}\u{76ee}\u{5f55}/a.md"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn absolute_pair_path_only_boundary_sentence() {
        let root = temp_workspace("abs");
        assert!(resolve_in(&root, "/etc/passwd").is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn use_point_point_climb_out_get_need_sentence() {
        let root = temp_workspace("dotdot");

        assert!(resolve_in(&root, "../\u{9003}\u{9038}.md").is_err());
        assert!(resolve_in(&root, "\u{5b50}\u{76ee}\u{5f55}/../../\u{9003}\u{9038}.md").is_err());

        assert!(resolve_in(&root, "\u{5b50}\u{76ee}\u{5f55}/../\u{91cc}\u{9762}.md").is_ok());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn service_number_link_boundary_only_item_wai_surface_need_sentence() {
        let root = temp_workspace("symlink");
        let outside = std::env::temp_dir().join("nota-fs-sandbox-outside");
        let _ = std::fs::remove_dir_all(&outside);
        std::fs::create_dir_all(&outside).unwrap();

        let link = root.join("\u{94fe}\u{63a5}");
        if std::os::unix::fs::symlink(&outside, &link).is_ok() {
            assert!(
                resolve_in(&root, "\u{94fe}\u{63a5}/\u{5077}.md").is_err(),
                "\u{7ecf}\u{7b26}\u{53f7}\u{94fe}\u{63a5}\u{8dd1}\u{5230}\u{5de5}\u{4f5c}\u{533a}\u{5916}\u{5e94}\u{5f53}\u{88ab}\u{62d2}"
            );
        }

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn item_pair_path_package_height_same_is_boundary_receive_current_document_absolute_pair_path_and_workspace_item_pair_path(
    ) {
        let root = temp_workspace("relative");
        let file = root.join("\u{5b50}\u{76ee}\u{5f55}/a.md");
        std::fs::write(&file, "# A").unwrap();

        assert_eq!(
            relative_in(&root, file.to_str().unwrap()).as_deref(),
            Some("\u{5b50}\u{76ee}\u{5f55}/a.md")
        );
        assert_eq!(
            relative_in(&root, "\u{5b50}\u{76ee}\u{5f55}/a.md").as_deref(),
            Some("\u{5b50}\u{76ee}\u{5f55}/a.md")
        );
        assert_eq!(relative_in(&root, "/etc/passwd"), None);

        let _ = std::fs::remove_dir_all(&root);
    }
}
