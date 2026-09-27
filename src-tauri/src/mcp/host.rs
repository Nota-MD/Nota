//! MCP 工具要用到的**那几件宿主能力**，以及它在真应用上的一份实现。
//!
//! # 为什么抽一层 trait
//!
//! 不是为了"将来还能接别的宿主"（那是猜），而是为了**测得到**：真实现要
//! `tauri::AppHandle`，而 `AppHandle` 在单元测试里建不出来（要一个真的
//! `App`/事件循环）。把能力收成 `宿主` 之后，`tools.rs` 那一整套工具与
//! `mod.rs` 那一圈协议都能拿一份**假宿主**跑通（见 `tools.rs` 的 `tests`）。
//!
//! ⚠️ 于是这里有一条纪律：**工具里不许出现第二条"直接问应用"的路**。
//! 想让某个工具多做一件事，就给它加一个 [`宿主`] 方法——凡是绕过 trait
//! 直接摸 `AppState` 的写法，都会变成"单测跑得到、真机上没人跑过"或者
//! 反过来的那种半边绿。
//!
//! # 真实现为什么这么薄
//!
//! 每一条都落在**已经有别的东西在用**的那条路上：
//!
//! * 读文档 → `DocumentStore`（前端 `nota_doc_sync` 推上来的那份镜像，
//!   写作统计插件读的也是它）；
//! * 写文档 → `sync()` ＋ `nota:document-changed` 事件，与 Lua 插件的
//!   `document.write` **一个字都不差**（`lua/api/document.rs` 的 `set_text`）；
//! * 打开文件 → `nota:second-instance` 那条事件，与"用户又启动了一次 Nota"
//!   同一个载荷（`single_instance.rs` 的 `载荷`）。
//!
//! ⚠️ **没有一条是新通道**，这是故意的：MCP 是一个**新的入口**，不是一个
//! 新的内核。新入口的代价只有在"它走的不是既有那条路"时才会失控。

use std::path::PathBuf;

use serde_json::json;
use tauri::{Emitter, Manager};

use crate::state::AppState;

/// 一份文档的**速览**（不含正文）。字段名与 `tools.rs` 里那几个工具的
/// 输出一一对应，别在这里改名叫「标题」而那边叫 `title`——AI 客户端读的是
/// JSON 里的键，两边不一致的代价是"模型猜字段名"。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct 概览 {
    pub id: u64,
    pub title: String,
    /// ⚠️ `None` = 没存过盘的新文档（`未命名 N`）。**不是**空字符串：
    /// 空字符串看起来像一个合法的路径。非 UTF-8 的路径也落在这里
    /// （`Document::path_string` 那条规矩）。
    pub path: Option<String>,
    /// 有未存盘的改动。
    pub dirty: bool,
    /// 宿主这份镜像的版本号，每次 `sync` 自增。⚠️ 它**不是**编辑器的撤销栈，
    /// 只回答"我读到的是不是刚写进去的那一份"。
    pub revision: u64,
    /// 是不是当前活动的那一份（窗口里正显示着它）。
    pub active: bool,
}

/// 读出来的一整份：速览 ＋ 正文。
#[derive(Debug, Clone, PartialEq)]
pub struct 全文 {
    pub 概览: 概览,
    pub 正文: String,
}

/// MCP 工具能用到的**全部**宿主能力。
///
/// ⚠️ 返回 `Result<_, String>` 而不是 `NotaError`：这里的错误**要原样写给
/// 一个 AI 客户端看**（MCP 的 `tools/call` 结果是给人/模型读的文字），
/// `NotaError` 的 Display 是给本仓用户看的短句，两者不通用的地方就在这儿。
pub trait 宿主: Send + Sync {
    /// 报给客户端的 `serverInfo.version`（`CARGO_PKG_VERSION`）。
    fn 应用版本(&self) -> String;

    /// 打开的文档，**活动的那一份排在最前**（AI 问"现在开着什么"时，
    /// 它最想要的那一份应该在头一条上，而不是让模型自己去 `active` 里找）。
    fn 概览们(&self) -> Vec<概览>;

    /// 读一份文档。`id` 为 `None` = 读当前活动的那一份。
    fn 读(&self, id: Option<u64>) -> Result<全文, String>;

    /// 整篇替换一份文档。成功给 `(id, 新版本号)`。
    ///
    /// ⚠️ **这是唯一一个会改用户文档的工具**，所以它的语义要写死在实现里：
    /// 走 `DocumentStore::sync` ＋ `nota:document-changed`（`origin: "mcp"`），
    /// 前端收到会把编辑器整篇换掉——**用户在窗口里看得见，Ctrl+Z 撤得回**。
    /// 不做"悄悄改盘上的文件"那条路：那才是真的会丢东西。
    fn 写(&self, id: Option<u64>, 正文: &str) -> Result<(u64, u64), String>;

    /// 请 Nota 打开一个文件（进一个新标签页）。
    ///
    /// ⚠️ 实现里**先判路径在不在**：这条路的失败提示走的是前端的提示条
    /// （「第二次启动 Nota 时带来的路径用不了」），而 MCP 这一侧**没有**第二次
    /// 启动那层上下文，让用户看到那句话只会更糊涂。判完再发，那句提示就基本
    /// 不会出现；真出现了（判完到打开之间文件被删）也仍是如实报错。
    fn 请求打开(&self, 路径: &str) -> Result<(), String>;
}

/// 真宿主：把 [`宿主`] 的每一条落到 `AppState` 与那条事件上。
pub struct 应用宿主 {
    app: tauri::AppHandle,
}

impl 应用宿主 {
    pub fn 新(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    /// 拿应用状态。⚠️ 拿不到**不当成 panic**：MCP 服务是在 `setup` 里起的，
    /// 正常路径上一定拿得到；但"正常路径上一定"不是一条防线，而这里崩掉的
    /// 代价是整个应用一起挂（MCP 只是个旁路）。
    fn 状态(&self) -> Result<tauri::State<'_, AppState>, String> {
        self.app
            .try_state::<AppState>()
            .ok_or_else(|| "Nota 的应用状态还没准备好".to_string())
    }
}

/// 把一份 `Document` 摊成 [`概览`]。
fn 摊(d: &crate::document::Document, 活动: Option<u64>) -> 概览 {
    概览 {
        id: d.id.0,
        title: d.title.clone(),
        path: d.path_string(),
        dirty: d.dirty,
        revision: d.revision,
        active: 活动 == Some(d.id.0),
    }
}

impl 宿主 for 应用宿主 {
    fn 应用版本(&self) -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }

    fn 概览们(&self) -> Vec<概览> {
        let 状态 = match self.状态() {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let 仓 = 状态.documents.lock().unwrap();
        let 活动 = 仓.active_id().map(|i| i.0);
        let mut 出的: Vec<概览> = 仓.list().iter().map(|d| 摊(d, 活动)).collect();
        // 活动那份挪到最前（顺序稳定：其余保持仓里的次序）。
        if let Some(位) = 出的.iter().position(|g| g.active) {
            let 一份 = 出的.remove(位);
            出的.insert(0, 一份);
        }
        出的
    }

    fn 读(&self, id: Option<u64>) -> Result<全文, String> {
        let 状态 = self.状态()?;
        let 仓 = 状态.documents.lock().unwrap();
        let 活动 = 仓.active_id().map(|i| i.0);
        let 文档 = match id {
            Some(要) => 仓
                .list()
                .iter()
                .find(|d| d.id.0 == 要)
                .ok_or_else(|| format!("没有 id 为 {要} 的文档（用 nota_documents 看现在开着哪些）"))?,
            None => 仓
                .active()
                .ok_or_else(|| "Nota 现在一份文档都没打开".to_string())?,
        };
        Ok(全文 {
            概览: 摊(文档, 活动),
            正文: 文档.text.clone(),
        })
    }

    fn 写(&self, id: Option<u64>, 正文: &str) -> Result<(u64, u64), String> {
        let 状态 = self.状态()?;
        let (文档号, 版本) = {
            let mut 仓 = 状态.documents.lock().unwrap();
            let 要 = match id {
                Some(要) => crate::document::DocId(要),
                None => 仓
                    .active_id()
                    .ok_or_else(|| "Nota 现在一份文档都没打开".to_string())?,
            };
            let 版本 = 仓.sync(要, 正文.to_string()).map_err(|e| e.to_string())?;
            (要.0, 版本)
        }; // ← 锁在这里**一定**已经放掉了：发事件不该抱着文档仓（`state.rs` 顶上那条锁序）

        // 与 Lua 插件的 `document.write` 同一条路：前端收到就把编辑器整篇换掉。
        let _ = self.app.emit(
            "nota:document-changed",
            json!({ "id": 文档号, "text": 正文, "origin": "mcp" }),
        );
        Ok((文档号, 版本))
    }

    fn 请求打开(&self, 路径: &str) -> Result<(), String> {
        let 目标 = PathBuf::from(路径);
        if !目标.exists() {
            return Err(format!("路径不存在：{路径}"));
        }
        // ⚠️ 复用 `nota:second-instance`：那条载荷的语义就是"**有别的进程**请
        // Nota 打开这个文件"，而 MCP 客户端正是一个别的进程。前端那边一个字节
        // 都不用为 MCP 新写。
        //
        // ⚠️ **但这里不抬窗**（`single_instance::起` 那条路会抬）：AI 一次可能
        // 连开好几个文件，每次都把窗口抢到最前，比不抢烦人得多。用户在窗口里
        // 打开标签页时自然会看到。
        let _ = self.app.emit(
            crate::single_instance::事件,
            crate::single_instance::载荷 {
                path: Some(路径.to_string()),
                error: None,
            },
        );
        Ok(())
    }
}
