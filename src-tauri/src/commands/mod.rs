//! IPC 命令层。
//!
//! 这一层的职责**只有三件**：取锁、调下层、把错误转成人话。
//! **业务逻辑不许写在这里**——命令函数应当短到能一眼看完，真正的活在下层模块。
//! （Folio 的 `fo-window-*.c` 是同一分工：窗口层只接线，逻辑在 `fo-document*` 里。）
//!
//! 命名约定：命令一律 `nota_` 前缀，前端 `invoke("nota_doc_save", …)`。
//! 前缀不是装饰——它让前端代码里**一眼分得清**哪些是跨进程调用、哪些是本地函数。

pub mod diagnostics;
pub mod diff;
pub mod document;
pub mod export;
pub mod focus;
pub mod image;
pub mod image_upload;
pub mod menu;
pub mod pandoc;
pub mod path_kind;
pub mod plugin;
pub mod session;
pub mod settings;
pub mod table_width;
pub mod theme;
pub mod ui_style;
pub mod watch;
pub mod webview;
pub mod window;
pub mod workspace;
