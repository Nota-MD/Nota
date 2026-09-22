//! Nota 的统一错误类型。
//!
//! 约定（与 Folio 的 GError 口径一致）：**每一个跨 IPC 边界返回的错误都要能读懂**。
//! 前端拿到的不是 `Err(Os { code: 2 })` 这种，而是"打开 /path/x.md 失败：文件不存在"。
//! 所以 `NotaError` 的 Display 一律写成人话，命令层直接把它转成 String 返回。

use std::path::PathBuf;

pub type Result<T> = std::result::Result<T, NotaError>;

#[derive(Debug, thiserror::Error)]
pub enum NotaError {
    #[error("读文件失败 {path}：{source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("写文件失败 {path}：{source}")]
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

    #[error("插件清单有误（{file}）：{reason}")]
    Manifest { file: PathBuf, reason: String },

    #[error("插件 {id} 需要 API 版本 {wanted}，宿主是 {have}")]
    PluginApiMismatch {
        id: String,
        wanted: u32,
        have: u32,
    },

    #[error("Lua 出错（插件 {plugin}）：{message}")]
    Lua { plugin: String, message: String },

    #[error("没有活动文档")]
    NoActiveDocument,

    #[error("{0}")]
    Other(String),
}

impl NotaError {
    /// 把任意错误压成一句能直接给用户看的话。
    pub fn other(msg: impl Into<String>) -> Self {
        NotaError::Other(msg.into())
    }
}

// Tauri 的命令返回值要求错误类型可序列化。转成 String 是最省事也最可读的做法：
// 前端只需要 `catch (e) => toast(String(e))`，不用认识我们的错误结构。
impl serde::Serialize for NotaError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
