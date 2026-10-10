//! `nota.fs` —— 插件读写文件，**限死在当前工作区内**。
//!
//! # 围栏怎么立的
//!
//! 每条路径先**规范化**（`canonicalize`，会把 `..` 和符号链接都解开），再要求它
//! 落在规范化后的工作区根之下。写一个新文件时文件还不存在，规范化不了，
//! 就规范化它的**父目录**再拼上文件名——否则 `fs.write("../../.bashrc", ...)`
//! 正好从"文件不存在"这个缝里溜出去。
//!
//! 围栏的根是**工作区根**；没开工作区时退到**活动文档所在目录**
//! （2026-10-10 加，见下面 `工作根`）。两样都没有（没开文件夹、文档也没存过盘）
//! 时**一律拒绝**，不是"那就放开"——放开会让"没开文件夹"变成一条绕过围栏的路。
//!
//! 裁决逻辑抽在 `resolve_in()` 里、**不依赖 Tauri**，所以它能真被单元测试覆盖
//! （见文件末尾）——这是唯一一处安全边界，不能只靠"看着对"。

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
    let root = 工作根(ctx).map_err(lua_err)?;
    resolve_in(&root, given).map_err(lua_err)
}

/// 这一格围栏的根：**工作区根，没开工作区就退到活动文档所在目录**。
///
/// ⚠️ 2026-10-10 加这个回退，起因是用户报的一句话「**找不到工作区**」（附 AI 面板那张
/// 截图：他直接开了一份 `.md`，没"打开文件夹"，于是「AI 可读的文件」列不出东西）。
/// 判据与 `git.rs::挑工作目录` **同一个形状**（那边一直就是这么退的）：
/// "两样都没有"才是真没法干活——那时文档没存过盘，连一个目录都指不出来。
///
/// ⚠️ **它没有放宽围栏**：仍然只认相对路径、仍然 `..` 与软链都拒（`resolve_in`），
/// 放宽的只是"哪棵树算里面"。文档所在目录本来就是用户刚刚亲手打开的那一份，
/// 与 `nota.git` 允许在它里面跑命令是同一条边界。
fn 工作根(ctx: &HostContext) -> NotaResult<PathBuf> {
    let workspace = ctx.workspace.lock().unwrap().clone();
    let doc_dir = ctx
        .documents
        .lock()
        .unwrap()
        .active()
        .and_then(|d| d.path.as_ref())
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf());
    挑根(workspace, doc_dir).map_err(NotaError::other)
}

/// 根的那个**纯裁决**（与 `git.rs::挑工作目录` 同一个理由抽出来：这里是唯一说得出
/// "插件为什么会拿到一句「不可用」"的地方，得有单元测试钉住它，**尤其是第三个分支**）。
fn 挑根(workspace: Option<PathBuf>, doc_dir: Option<PathBuf>) -> Result<PathBuf, String> {
    workspace.or(doc_dir).ok_or_else(|| {
        "没有工作区、当前文档也没存过盘，nota.fs 不可用".to_owned()
    })
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

    /// ⚠️ **根从哪来**（2026-10-10，用户那句「找不到工作区」）：开了工作区就用它；
    /// 没开就用**活动文档所在目录**；两样都没有才报那句"不可用"。
    /// ⚠️ 顺序不能反——反了的话"开着工作区、同时开着一份别处的文档"会让插件
    /// 突然看得到工作区外面的东西，而围栏的名义根还是工作区（那种错没人看得出来）。
    #[test]
    fn 根优先工作区没开工作区就用文档目录() {
        let 区 = PathBuf::from("/tmp/某工作区");
        let 文 = PathBuf::from("/tmp/某处");

        assert_eq!(挑根(Some(区.clone()), None).unwrap(), 区);
        assert_eq!(挑根(Some(区.clone()), Some(文.clone())).unwrap(), 区);
        assert_eq!(挑根(None, Some(文.clone())).unwrap(), 文);

        // 第三个分支：两样都没有 = 文档也没存过盘，那时连一个目录都指不出来。
        let err = 挑根(None, None).unwrap_err();
        assert!(err.contains("不可用"), "实际：{err}");
        assert!(err.contains("存过盘"), "那句要说清是「文档没存过盘」：{err}");
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
