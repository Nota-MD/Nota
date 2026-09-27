//! Nota 的统一错误类型。
//!
//! 约定（与 Folio 的 GError 口径一致）：**每一个跨 IPC 边界返回的错误都要能读懂**。
//! 前端拿到的不是 `Err(Os { code: 2 })` 这种，而是"打开 /path/x.md 失败：文件不存在"。
//! 所以 `NotaError` 的 Display 一律写成人话，命令层直接把它转成 String 返回。

use std::path::PathBuf;

pub type Result<T> = std::result::Result<T, NotaError>;

#[derive(Debug, thiserror::Error)]
pub enum NotaError {
    #[error("读文件失败 {path}：{}", 人话(source))]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("写文件失败 {path}：{}", 人话(source))]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("路径不是合法的 UTF-8：{0}")]
    NonUtf8Path(PathBuf),

    #[error("找不到用户目录（$HOME / $XDG_CONFIG_HOME 都没探到）")]
    NoHomeDir,

    #[error("配置读写失败：{0}")]
    Config(String),

    #[error("拓展清单有误（{file}）：{reason}")]
    Manifest { file: PathBuf, reason: String },

    #[error("拓展 {id} 需要 API 版本 {wanted}，宿主是 {have}")]
    PluginApiMismatch {
        id: String,
        wanted: u32,
        have: u32,
    },

    #[error("Lua 出错（拓展 {plugin}）：{message}")]
    Lua { plugin: String, message: String },

    #[error("没有活动文档")]
    NoActiveDocument,

    #[error("{0}")]
    Other(String),
}

/// 把 `io::Error` 里最常见的几类翻成中文。**兜底留原文**。
///
/// ⚠️ 为什么要翻（2026-09-25）：`{source}` 的现成文案是英文，于是打开一个非
/// UTF-8 的文件时，界面上弹的是「读文件失败 x.md：stream did not contain valid
/// UTF-8」——一句中英夹生的话（`docs/08` §1.3 的口径是界面文案一律中文）。
/// 用户看见它的第一反应是"这功能是不是没做完"，而不是"这文件不是文本"。
///
/// ⚠️ **没见过的 kind 必须原样透出**。把所有错误都换成一句"读文件失败"，
/// 等于把排查线索丢掉——那句英文虽然夹生，但它说的是到底哪儿不对。
///
/// ⚠️ **2026-09-27 起是 `pub(crate)`**：`file_move.rs`（重命名 / 移动）要自己造
/// 句子的主语（"「x」动不了：…"），而它同样需要这份中文。**别在那边再写一份**——
/// 两份映射表迟早只改一份（改的那份是这里，漏的那份不报错、只是文案退回英文）。
pub(crate) fn 人话(e: &std::io::Error) -> String {
    use std::io::ErrorKind as K;
    match e.kind() {
        K::NotFound => "路径不存在".to_string(),
        K::PermissionDenied => "没有权限".to_string(),
        K::InvalidData => "内容不是合法的 UTF-8 文本".to_string(),
        K::IsADirectory => "那是一个文件夹，不是文件".to_string(),
        K::AlreadyExists => "同名文件已经存在".to_string(),
        K::StorageFull => "磁盘空间不够".to_string(),
        _ => e.to_string(),
    }
}

impl NotaError {
    /// 把任意错误压成一句能直接给用户看的话。
    pub fn other(msg: impl Into<String>) -> Self {
        NotaError::Other(msg.into())
    }
}

// Tauri 的命令返回值要求错误类型可序列化。转成 String 是最省事也最可读的做法：
// 前端只需要 `catch (e) => toast(String(e))`，不必认识错误类型本身。
impl serde::Serialize for NotaError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::ErrorKind;

    /// `人话()` 的映射。⚠️ 这条钉的不是"翻译得漂亮"，是**用户看到的那句话是中文**
    /// ——BUG-25 的症状就是"(中文路径) 失败：stream did not contain valid UTF-8"。
    #[test]
    fn io_错误翻成中文() {
        let cases = [
            (ErrorKind::NotFound, "路径不存在"),
            (ErrorKind::PermissionDenied, "没有权限"),
            (ErrorKind::InvalidData, "内容不是合法的 UTF-8 文本"),
            (ErrorKind::IsADirectory, "那是一个文件夹，不是文件"),
        ];
        for (kind, want) in cases {
            let e = std::io::Error::new(kind, "whatever");
            assert_eq!(人话(&e), want, "{kind:?} 要翻成中文");
        }
    }

    /// ⚠️ **没见过的 kind 必须留着原文**：那句英文是排查线索，
    /// 一律换成"读文件失败"就等于把它丢了。
    #[test]
    fn 没见过的_io_错误保留原文() {
        let e = std::io::Error::new(ErrorKind::Other, "some exotic failure");
        assert_eq!(人话(&e), "some exotic failure");

        let 整个错误 = NotaError::Read {
            path: PathBuf::from("/tmp/x.md"),
            source: std::io::Error::new(ErrorKind::NotFound, "nope"),
        };
        let 话 = 整个错误.to_string();
        assert!(话.contains("/tmp/x.md"), "路径要在文案里：{话}");
        assert!(话.contains("路径不存在"), "翻过的那句要在文案里：{话}");
        assert!(!话.contains("nope"), "翻过之后不该再露出英文原文：{话}");
    }
}
