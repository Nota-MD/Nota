//! `nota.fs` —— 插件读写文件，**限死在当前工作区内**。
//!
//! # 围栏怎么立的
//!
//! 每条路径先**规范化**（`canonicalize`，会把 `..` 和符号链接都解开），再要求它
//! 落在规范化后的工作区根之下。写一个新文件时文件还不存在，规范化不了，
//! 就规范化它的**父目录**再拼上文件名——否则 `fs.write("../../.bashrc", ...)`
//! 正好从"文件不存在"这个缝里溜出去。
//!
//! 没开工作区（`workspace` 是 `None`）时**一律拒绝**，不是"那就放开"。
//! 放开会让"没开文件夹"变成一条绕过围栏的路。
//!
//! 裁决逻辑抽在 `resolve_in()` 里、**不依赖 Tauri**，所以它能真被单元测试覆盖
//! （见文件末尾）——这是本仓唯一一处安全边界，不能只靠"看着对"。

use std::path::{Component, Path, PathBuf};

use mlua::{Lua, Table};

use super::{lua_err, mlua_to_nota};
use crate::error::{NotaError, Result as NotaResult};
use crate::lua::HostContext;
use crate::plugin::manifest::{Capability, Manifest};

pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;
    let can_read = manifest.has(Capability::FsRead);
    let can_write = manifest.has(Capability::FsWrite);

    if can_read {
        let ctx2 = ctx.clone();
        let read = lua
            .create_function(move |_, path: String| {
                let full = resolve(&ctx2, &path)?;
                std::fs::read_to_string(&full)
                    .map_err(|e| lua_err(NotaError::Read { path: full, source: e }))
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
    }

    if can_write {
        let ctx2 = ctx.clone();
        let write = lua
            .create_function(move |_, (path, text): (String, String)| {
                let full = resolve(&ctx2, &path)?;
                if let Some(parent) = full.parent() {
                    // 这个闭包返回的是 mlua::Result，NotaError 得先转一道。
                    crate::paths::ensure_dir(parent).map_err(lua_err)?;
                }
                std::fs::write(&full, text)
                    .map_err(|e| lua_err(NotaError::Write { path: full, source: e }))
            })
            .map_err(mlua_to_nota)?;
        t.set("write", write).map_err(mlua_to_nota)?;

        let ctx2 = ctx.clone();
        let remove = lua
            .create_function(move |_, path: String| {
                let full = resolve(&ctx2, &path)?;
                std::fs::remove_file(&full)
                    .map_err(|e| lua_err(NotaError::Write { path: full, source: e }))
            })
            .map_err(mlua_to_nota)?;
        t.set("remove", remove).map_err(mlua_to_nota)?;
    }

    Ok(t)
}

/// 从共享状态里取工作区根，再交给 `resolve_in` 裁决。
fn resolve(ctx: &HostContext, given: &str) -> mlua::Result<PathBuf> {
    let root = ctx.workspace.lock().unwrap().clone().ok_or_else(|| {
        lua_err(NotaError::other("没有打开工作区，nota.fs 不可用"))
    })?;
    resolve_in(&root, given).map_err(lua_err)
}

/// 核心裁决：把插件给的相对路径解析成工作区内的绝对路径，**并确认它没跑出去**。
///
/// 三步，缺一不可：
/// 1. 必须是相对路径；
/// 2. `..` **在交给文件系统之前**就按段算掉（只靠 canonicalize 挡不住"写新文件"那条路）；
/// 3. 再比一次规范化结果，防符号链接。
pub fn resolve_in(root: &Path, given: &str) -> NotaResult<PathBuf> {
    let rel = Path::new(given);

    // ① 绝对路径一律拒。允许了就等于允许写 /etc。
    if rel.is_absolute() {
        return Err(NotaError::other(format!(
            "nota.fs 只接受工作区内的相对路径，收到绝对路径 `{given}`"
        )));
    }

    // ② 逐段算掉 `.` 与 `..`。`..` 弹出栈底还多就说明跑出去了。
    let mut normalized = PathBuf::new();
    for comp in rel.components() {
        match comp {
            Component::Normal(p) => normalized.push(p),
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(NotaError::other(format!(
                        "路径 `{given}` 跑到工作区外面去了"
                    )));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(NotaError::other(format!(
                    "路径 `{given}` 不是合法的工作区内相对路径"
                )));
            }
        }
    }

    let full = root.join(&normalized);

    // ③ 符号链接。`normalized` 里可能有指向外面的软链，规范化后比一次。
    //    文件还不存在（新建）就退而比父目录。
    let real_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let probe = if full.exists() {
        full.canonicalize().ok()
    } else {
        full.parent().and_then(|p| p.canonicalize().ok())
    };
    if let Some(probe) = probe {
        if !probe.starts_with(&real_root) {
            return Err(NotaError::other(format!(
                "路径 `{given}` 经符号链接指向了工作区外面"
            )));
        }
    }

    Ok(full)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn 临时工作区(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("nota-fs-sandbox-{tag}"));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("子目录")).unwrap();
        root.canonicalize().unwrap()
    }

    #[test]
    fn 普通相对路径能过() {
        let root = 临时工作区("plain");
        let got = resolve_in(&root, "子目录/a.md").unwrap();
        assert_eq!(got, root.join("子目录/a.md"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn 点开头的清除掉但不越界() {
        let root = 临时工作区("curdir");
        let got = resolve_in(&root, "./子目录/./a.md").unwrap();
        assert_eq!(got, root.join("子目录/a.md"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn 绝对路径直接拒() {
        let root = 临时工作区("abs");
        assert!(resolve_in(&root, "/etc/passwd").is_err());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn 用点点爬出去要拒() {
        let root = 临时工作区("dotdot");
        // 这两条是围栏的正题：写一个**还不存在**的文件，走不了 canonicalize 那条路。
        assert!(resolve_in(&root, "../逃逸.md").is_err());
        assert!(resolve_in(&root, "子目录/../../逃逸.md").is_err());
        // 但在里面绕一圈是合法的。
        assert!(resolve_in(&root, "子目录/../里面.md").is_ok());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn 符号链接指向外面要拒() {
        let root = 临时工作区("symlink");
        let outside = std::env::temp_dir().join("nota-fs-sandbox-outside");
        let _ = std::fs::remove_dir_all(&outside);
        std::fs::create_dir_all(&outside).unwrap();

        // 造一个指向工作区外的软链。造不出来（比如平台不支持）就跳过。
        let link = root.join("链接");
        if std::os::unix::fs::symlink(&outside, &link).is_ok() {
            assert!(
                resolve_in(&root, "链接/偷.md").is_err(),
                "经符号链接跑到工作区外应当被拒"
            );
        }

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }
}
