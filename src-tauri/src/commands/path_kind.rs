//! **一条路径是什么**：目录 / 文件 / 不存在（2026-09-27）。
//!
//! ⚠️ 文件叫 `path_kind` 而不是 `paths`：仓里**已经有一个** `src-tauri/src/paths.rs`
//! （那是"Nota 自己的目录都在哪"），两个同名的 `paths` 在同一棵 crate 里，
//! 写 `use crate::paths::…` 的人每一次都得先想一下是哪一层。
//!
//! # 为什么要开这条命令
//!
//! 「拖放文件到窗口打开」那条路（`src/ui/useFileDrop.ts`）拿到的是**一串字符串**
//! ——Tauri 的 `onDragDropEvent` 只给路径（见 `ui/useImageInsert.ts` 文件头），
//! 而"该不该把它当文件夹开成工作区"和"该不该把它当文档打开"是**两个动作**，
//! 选错了的症状是一个红色的错误提示条。
//!
//! 判据只能来自文件系统（`metadata`），而**前端够不着它**：
//! `@tauri-apps/plugin-fs` 没装（本仓的口径是"能用自己的 `#[tauri::command]`
//! 走通的，就不开插件权限"，见 `src-tauri/capabilities/default.json` 的 description）。
//!
//! ⚠️ **不靠后缀猜**：`notes.md` 可以是一个**目录**的名字，而没有后缀的普通文件
//! 也多得是。猜错的代价是"拖一个文件夹进来，它去当文档打开，然后报一堆错"。
//!
//! # 它只回答"是什么"，不回答"该怎么办"
//!
//! 分类与动作**故意分在两边**：这边只给事实（`dir` / `file` / `missing`），
//! 「文件夹按 `files.drop_folder` 办、Markdown 按 `files.drop_markdown` 办」
//! 那套路由在前端。理由与图片那条一致——**说成哪句话、做哪个动作是界面的事**。

use std::path::Path;

use serde::Serialize;

use crate::error::Result;

/// 一条路径是什么。⚠️ 落盘的取值是 kebab-case 的**英文**（`dir` / `file` /
/// `missing`），与 `settings/files.rs` 那几个枚举同一个口径：跨 IPC 的取值
/// 不用中文，中文只出现在注释和界面文案里。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum 路径种类 {
    /// 目录（拖它进来的意图通常是"把这个文件夹当工作区"）。
    Dir,
    /// 普通文件。
    File,
    /// 不在了。⚠️ **不是多此一举**：拖放到我们真正去 `metadata` 之间隔着
    /// 一个异步往返，中间文件被删/被移走是可能的——那时候如实说"没找到"
    /// 比按文件去打开（然后报一句读不了的错）准确。
    Missing,
}

/// 逐条回答"这是什么"。**返回的数组与入参一一对应**（同长度、同顺序）。
///
/// ⚠️ 一条坏路径**不让整批失败**：拖进来十个文件，其中一个刚好被删了，
/// 另外九个照旧该打开。所以这里不返回 `Result` 之外的逐条错误，坏的就是
/// `Missing`。
#[tauri::command]
pub fn nota_paths_kind(paths: Vec<String>) -> Result<Vec<路径种类>> {
    Ok(paths.iter().map(|p| 认一认(p)).collect())
}

fn 认一认(路径: &str) -> 路径种类 {
    // ⚠️ 先 `metadata`（**跟着软链走**）再 `symlink_metadata`（看它本身）：
    // 一个**指向目录的软链**拖进来，用户的心智模型是"那就是个目录"，
    // 所以第一眼要跟随。跟随不上（断链、真不存在）时才退一步看它本身还在不在
    // ——一个**断链**该报 `Missing`（打不开），而**权限不够**的目录该报 `File`
    // 让后面那句真实的错误说出来，别在这儿替它猜。
    match std::fs::metadata(Path::new(路径)) {
        Ok(m) if m.is_dir() => 路径种类::Dir,
        Ok(_) => 路径种类::File,
        Err(_) => match std::fs::symlink_metadata(Path::new(路径)) {
            Ok(m) if m.is_dir() => 路径种类::Dir,
            Ok(_) => 路径种类::File,
            Err(_) => 路径种类::Missing,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 目录_文件_不存在三种都认得出() {
        let 临时 = std::env::temp_dir().join(format!("nota-paths-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&临时);
        std::fs::create_dir_all(&临时).unwrap();
        let 文件 = 临时.join("一篇.md");
        std::fs::write(&文件, "# 标题\n").unwrap();

        let 结果 = nota_paths_kind(vec![
            临时.to_string_lossy().into_owned(),
            文件.to_string_lossy().into_owned(),
            临时.join("没有这个").to_string_lossy().into_owned(),
        ])
        .unwrap();

        assert_eq!(
            结果,
            vec![路径种类::Dir, 路径种类::File, 路径种类::Missing]
        );
        let _ = std::fs::remove_dir_all(&临时);
    }

    #[test]
    fn 空入参给空出参_一条坏的也不拖垮整批() {
        assert!(nota_paths_kind(vec![]).unwrap().is_empty());
        // ⚠️ 顺序与长度必须保住：前端是按下标把"是什么"对回"哪一条路径"的，
        // 少一条或者挪一位，症状是**拖进来的名字和打开的东西对不上**。
        let 结果 = nota_paths_kind(vec!["/绝对不存在/甲".into(), "/绝对不存在/乙".into()]).unwrap();
        assert_eq!(结果.len(), 2);
        assert!(结果.iter().all(|k| *k == 路径种类::Missing));
    }

    #[test]
    fn 跨_ipc_的取值是英文小写() {
        // ⚠️ 这一条盯的是"哪天有人把变体名改成中文"——那样前端那个
        // `=== "dir"` 会永远不成立，而失败的样子是**拖文件夹进来被当文档打开**。
        for (种类, 期望) in [
            (路径种类::Dir, "\"dir\""),
            (路径种类::File, "\"file\""),
            (路径种类::Missing, "\"missing\""),
        ] {
            assert_eq!(serde_json::to_string(&种类).unwrap(), 期望);
        }
    }
}
