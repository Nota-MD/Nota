//! 外部改动监视相关命令。
//!
//! 用户 2026-09-26 点的：「**加入对本地其他程序修改后提示支持**……**此乃非插件**」。
//! 发现那一半在 `watch.rs`（盯目录、比对摘要、发 `nota:file-changed`），
//! 这一层只有一条命令：**前端把"现在打开着哪些文件"报一遍**。
//!
//! # 为什么是"整份报一遍"而不是"增删两条"
//!
//! 见 `watch.rs::内层::同步` 那段——增量的形状要求前端把"哪一份关了"也算对，
//! 而它算错的症状分别是**外部改动静默失效**和 **inotify 句柄慢慢漏干净**，
//! 两种都不报错。整份重来对齐成本最低，而它只在文档列表变化时才发生。
//!
//! ⚠️ **只有带路径的文档要报**：没存过盘的新文档（`path == None`）没有文件可盯，
//! 由前端筛掉——宿主这边**不替它筛**，因为"哪一份有路径"这件事在文档仓里
//!（要拿 `documents` 锁），而这条命令按设计**不碰文档仓**（见 `watch.rs` 顶上
//! 那段锁序说明：它只拿自己那一把锁，所以不在锁序里）。

use std::path::PathBuf;

use serde::Deserialize;
use tauri::State;

use crate::document::DocId;
use crate::error::Result;
use crate::watch::监视器;

/// 前端报上来的一份：文档 id + 它此刻的落盘路径。
#[derive(Debug, Clone, Deserialize)]
pub struct 要盯的 {
    pub id: DocId,
    pub path: String,
}

/// 前端报一遍"现在打开着哪些文件"。
///
/// ⚠️ 路径**原样收**（不做存在性检查）：文件这会儿可能还没落地（刚另存为）、
/// 也可能刚被删。`watch.rs::内层::同步` 对这两种都当"读不到摘要"处理，
/// 而不是报错——见那边"同步时文件不在也不炸"那条用例。
#[tauri::command]
pub fn nota_watch_sync(监: State<'_, 监视器>, docs: Vec<要盯的>) -> Result<()> {
    let 表: Vec<(DocId, PathBuf)> = docs
        .into_iter()
        .map(|一| (一.id, PathBuf::from(一.path)))
        .collect();
    监.同步(&表);
    Ok(())
}
