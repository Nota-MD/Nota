//! **外部改动**的监视：别的程序动了我们打开着的那份文件时，告诉前端一声。
//!
//! 用户 2026-09-26 点的这一条：「加入对本地其他程序修改后提示支持。有：**忽略**
//!（这里修改完保存依然直接存）、**重新载入**（载入磁盘修改文件）、**查看修改**
//!（用 diff）。**此乃非插件**。」
//!
//! 这一份只做**发现**那一半：盯着、比对、发一条事件。三个动作全在前端
//!（`ui/useExternalChanges.ts`）——因为"忽略 / 重新载入 / 查看修改"里后两个
//! 都要动编辑器，而编辑器在前端（`docs/03` 那条"真相在前端"）。
//!
//! # ⚠️ 判据：磁盘内容 ≠ **我们上次知道的那份磁盘内容**
//!
//! 不是"磁盘 ≠ 编辑器里的文本"——那一条会**每存必报**：编辑器会把文本规范化
//!（`|---|---|` → `| - | - |` 那一族，见 `docs/05` §4.7），存盘写出去的字节
//! 和编辑器手里的文本**本来就不一样**。
//!
//! 所以这里记的是**每一份文件上一次被我们读过或写过的内容摘要**：
//!
//! | 什么时候更新 | 为什么 |
//! |---|---|
//! | 打开 / 重载一份文档之后 | 刚读进来的就是"我们知道的"那一份 |
//! | **存盘之后**（`commands::document::nota_doc_save`） | 刚写出去的字节就是新基准；**这同时是"不报自己"的全部机制** |
//! | 监视线程发现磁盘变了之后 | 报了就不再报第二次（"忽略"= 下次保存直接覆盖） |
//!
//! ⚠️ 最后那一行是**"忽略"这个动作的全部实现**：用户点了忽略，前端什么都不用
//! 做——摘要已经在事件发出去之前就更新了。反过来说，**摘要更新必须发生在
//! `emit` 之前**，不然那一下点得比事件快的人会看到同一条提示反复冒出来。
//!
//! # 为什么盯**父目录**而不是文件本身
//!
//! 直接 `watch(文件)` 在原子替换下会失效：多数编辑器存盘是"写临时文件 → rename
//! 覆盖"，被盯的那个 inode 在 rename 之后就不在路径上了，此后再也不报。
//! 盯父目录（**非递归**）＋ 按完整路径过滤，是各家文件监视器的通用做法。
//!
//! ⚠️ 代价：目录里**任何**文件的动静都会叫醒我们，包括那份文档旁边的
//! `xx.md.swp`。所以过滤要严格：路径**完全相等**才算，且必须在我们登记的集合里。
//!
//! # ⚠️ 文件**不见了**不算外部改动
//!
//! 原子替换的中间态就是"这一刻路径上没有文件"，git checkout 也会先删再写。
//! 见到读不到就报，等于每次外部存盘都多弹一条假提示。**读不到就跳过**，
//! 让下一次事件（rename 落地之后那一条）去判。
//!
//! # 锁序
//!
//! 本模块**只拿自己那一把锁**，不碰 `plugins` / `documents` / `settings`
//! ——事件里带的 `id` 和 `path` 是登记时就记下的，不需要回头去查文档仓。
//! 所以它不在 `state.rs` 顶上那条锁序里，也不会成环。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::document::DocId;

/// 外部改动事件。载荷：`{ id, path, hash }`。
pub const EVENT_FILE_CHANGED: &str = "nota:file-changed";

/// 去抖窗口。⚠️ 一次外部存盘会连着来好几个事件（临时文件建、写、rename、
/// 删），而且 `Ctrl+S` 手快的人一秒钟能按好几下——攒够这么久再一次性判。
///
/// 250ms 是按"人按完保存看不见延迟"定的（`docs/06` §5 那一族目检的判据是
/// 肉眼可见与否，200~300ms 都在"没感觉"那一档）。
const 去抖: Duration = Duration::from_millis(250);

/// 一份被盯着的文件。
#[derive(Debug, Clone)]
struct 一份 {
    id: DocId,
    摘要: String,
}

struct 内层 {
    /// 持有 watcher 本体。**必须活着**——`RecommendedWatcher` 一 drop，
    /// 底下的 OS 监视就停了，而症状是"什么都没发生"（不报错）。
    watcher: Option<RecommendedWatcher>,
    /// 目录 → 还有几份文档在里面。归零时 `unwatch`。
    dirs: HashMap<PathBuf, usize>,
    /// 文件路径 → 那一份。
    files: HashMap<PathBuf, 一份>,
}

impl 内层 {
    /// 该盯的都盯上、该放的全放掉。**每次前端报一遍完整的清单**，不增量。
    ///
    /// 为什么不做增量（`add` / `remove` 两条命令）：那样前端得把"哪一份关了"
    /// 也算对，而它算错的症状是**漏掉一个目录或漏掉一次 unwatch**——前者让
    /// 外部改动静默失效，后者让 inotify 句柄慢慢漏干净（`fs.inotify.max_user_watches`
    /// 满了之后，新的监视会**静默失败**）。整份重来一遍是对齐成本最低的形状，
    /// 而这件事只在文档列表变化时才发生。
    fn 同步(&mut self, 表: &[(DocId, PathBuf)]) {
        let 想要: HashMap<PathBuf, 一份> = 表
            .iter()
            .map(|(id, p)| {
                // ⚠️ 已经在盯着的那一份**保留旧摘要**：整份重来不该把"我们已经
                // 知道磁盘长什么样"这件事一起忘掉——忘了的话，用户每切一次
                // 标签页，旁边存一次盘的提示就会再冒一次。
                let 摘要 = self
                    .files
                    .get(p)
                    .filter(|老| 老.id == *id)
                    .map(|老| 老.摘要.clone())
                    .unwrap_or_else(|| 读摘要(p).unwrap_or_default());
                (p.clone(), 一份 { id: *id, 摘要 })
            })
            .collect();

        // 先算目录的账：多出来的盯上，不再需要的放掉。
        let mut 目标目录: HashMap<PathBuf, usize> = HashMap::new();
        for 路径 in 想要.keys() {
            if let Some(父) = 路径.parent() {
                *目标目录.entry(父.to_path_buf()).or_insert(0) += 1;
            }
        }
        for (目录, _) in 目标目录.iter() {
            if !self.dirs.contains_key(目录) {
                if let Some(w) = self.watcher.as_mut() {
                    match w.watch(目录, RecursiveMode::NonRecursive) {
                        Ok(()) => {}
                        // ⚠️ **不静默**：盯不上就是"这一份的外部改动永远不报"，
                        // 而它在界面上没有任何别的表现。走调试闸门（`log.rs`）。
                        Err(e) => crate::日志!("[nota] failed to watch directory {}: {e}", 目录.display()),
                    }
                }
            }
        }
        for 目录 in self.dirs.keys() {
            if !目标目录.contains_key(目录) {
                if let Some(w) = self.watcher.as_mut() {
                    let _ = w.unwatch(目录);
                }
            }
        }
        self.dirs = 目标目录;
        self.files = 想要;
    }
}

/// 一份文本的**短摘要**。
///
/// ⚠️ 这不是密码学哈希，也**不该**是：它只用来回答"还是不是同一份"，
/// 输入是本机文件的内容、不对外发。所以用 FNV-1a（一行、无依赖、够快）——
/// 为了这个去引 `sha2` 是把一件小事变大。碰撞的后果也只是"这一次外部改动
/// 没报"，而它下一次存盘还会再报一次。
pub fn 摘要(文本: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in 文本.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn 读摘要(路径: &Path) -> Option<String> {
    std::fs::read(路径).ok().map(|字节| 摘要(&String::from_utf8_lossy(&字节)))
}

/// 文件监视器。**一个进程一份**，挂在 `AppState` 上。
pub struct 监视器 {
    内: Arc<Mutex<内层>>,
}

impl 监视器 {
    /// 起一个监视器，并在后台开一条线程收事件。
    ///
    /// ⚠️ 线程**跟着进程走**（不持有 join 句柄、没有退出协议）：应用退出的
    /// 时候进程整个没了，那条线程自然结束。为它写一套停机协议，收益只是
    /// "退出时少一个线程"，而代价是多一条可能出错的路径。
    pub fn 新建(app: AppHandle) -> Self {
        let (tx, rx) = channel::<notify::Result<notify::Event>>();
        let watcher = notify::recommended_watcher(move |ev| {
            // ⚠️ 发送失败 = 接收端没了 = 进程在收尾。**忽略**，别 unwrap：
            // 那会因为一个"正在退出"而 panic 在监视线程里。
            let _ = tx.send(ev);
        })
        .map_err(|e| crate::日志!("[nota] failed to start file watcher: {e}"))
        .ok();

        let 内 = Arc::new(Mutex::new(内层 {
            watcher,
            dirs: HashMap::new(),
            files: HashMap::new(),
        }));

        let 线程内 = Arc::clone(&内);
        std::thread::spawn(move || 收事件(app, 线程内, rx));

        Self { 内 }
    }

    /// 前端报一遍"现在打开着哪些文档"。
    pub fn 同步(&self, 表: &[(DocId, PathBuf)]) {
        self.内.lock().unwrap().同步(表);
    }

    /// **我们自己**刚把这份内容写到了这个路径上——把基准挪过去。
    ///
    /// 调用点只有两个：存盘（`nota_doc_save`）与重载（`nota_doc_reload`）。
    /// 少了存盘那一次，每次 `Ctrl+S` 都会在 250ms 之后**报一次自己的改动**。
    pub fn 记下(&self, 路径: &Path, 文本: &str) {
        let mut 内 = self.内.lock().unwrap();
        if let Some(一) = 内.files.get_mut(路径) {
            一.摘要 = 摘要(文本);
        }
    }
}

/// 收事件 → 去抖 → 比对 → 发事件。
fn 收事件(
    app: AppHandle,
    内: Arc<Mutex<内层>>,
    rx: std::sync::mpsc::Receiver<notify::Result<notify::Event>>,
) {
    loop {
        // 第一段：**阻塞**等第一条，退出时才走得到错误分支。
        let 首条 = match rx.recv() {
            Ok(ev) => ev,
            Err(_) => return, // 发送端没了 = 进程在收尾
        };
        let mut 攒了: Vec<PathBuf> = Vec::new();
        let 收一条 = |ev: notify::Result<notify::Event>, 攒了: &mut Vec<PathBuf>| match ev {
            Ok(e) => {
                if matches!(
                    e.kind,
                    notify::EventKind::Create(_)
                        | notify::EventKind::Modify(_)
                        | notify::EventKind::Remove(_)
                ) {
                    攒了.extend(e.paths);
                }
            }
            Err(e) => crate::日志!("[nota] file watcher error: {e}"),
        };
        收一条(首条, &mut 攒了);

        // 第二段：把窗口期里陆续来的都收进来。超时 = 窗口结束。
        while let Ok(ev) = rx.recv_timeout(去抖) {
            收一条(ev, &mut 攒了);
        }

        比对并发(app.clone(), &内, 攒了);
    }
}

/// 攒完一轮之后：哪些路径的内容真的换了。
fn 比对并发(app: AppHandle, 内: &Arc<Mutex<内层>>, 动过的: Vec<PathBuf>) {
    let 报这些 = {
        let mut 内 = 内.lock().unwrap();
        let mut 出: Vec<(DocId, PathBuf, String)> = Vec::new();
        for 路径 in 动过的 {
            let Some(一) = 内.files.get(&路径).cloned() else {
                continue; // 没登记过的路径（同一个目录里的别的文件）
            };
            let Some(新摘要) = 读摘要(&路径) else {
                continue; // 读不到：原子替换的中间态，见文件头"文件不见了"那一段
            };
            if 新摘要 == 一.摘要 {
                continue; // 我们自己写的那一下，或者内容没变
            }
            // ⚠️ **先挪基准、再发事件**：见文件头"忽略"那一段。
            内.files.get_mut(&路径).unwrap().摘要 = 新摘要.clone();
            出.push((一.id, 路径, 新摘要));
        }
        出
    };

    for (id, 路径, 摘要) in 报这些 {
        crate::日志!("[nota] file changed externally: {}", 路径.display());
        let _ = app.emit(
            EVENT_FILE_CHANGED,
            serde_json::json!({
                "id": id.0,
                "path": 路径.to_string_lossy(),
                "hash": 摘要,
            }),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 摘要的两个基本性质：同内容同摘要、不同内容不同摘要。
    #[test]
    fn 摘要同内容一致() {
        assert_eq!(摘要("你好\n世界\n"), 摘要("你好\n世界\n"));
        assert_ne!(摘要("你好"), 摘要("你好 "));
        assert_ne!(摘要(""), 摘要("\n"));
    }

    /// ⚠️ 摘要按**字节**算，不按字符：两个不同长度的多字节文本不该撞。
    /// （这条钉的是"别哪天把它改成按 `char` 迭代"——那会让 UTF-8 的不同
    /// 字节序列在 Rust 的 `String` 层就被归一，碰撞率凭空涨上去。）
    #[test]
    fn 摘要认得出多字节的差别() {
        assert_ne!(摘要("表"), 摘要("表格"));
    }

    /// 登记表按**完整路径**认，而且"换了 id 就重新读一次磁盘"。
    #[test]
    fn 同步只认登记过的路径() {
        let mut 内 = 内层 {
            watcher: None,
            dirs: HashMap::new(),
            files: HashMap::new(),
        };
        let a = PathBuf::from("/tmp/nota-watch-不存在/a.md");
        let b = PathBuf::from("/tmp/nota-watch-不存在/b.md");
        内.同步(&[(DocId(1), a.clone())]);
        assert!(内.files.contains_key(&a));
        assert!(!内.files.contains_key(&b), "没登记过的路径不该被盯");

        // 同一份文档再来一遍：摘要不该被清掉（清了就会重复提示）。
        内.files.get_mut(&a).unwrap().摘要 = "abc".to_owned();
        内.同步(&[(DocId(1), a.clone())]);
        assert_eq!(内.files[&a].摘要, "abc");

        // 路径没变、id 变了（关掉再开）：**重新读一次**，因为新那份额度
        // 可能与我们旧的那份不是一回事了。
        内.同步(&[(DocId(2), a.clone())]);
        assert_eq!(内.files[&a].id, DocId(2));
    }

    /// 文件不存在时同步不该炸（新文档还没有路径、或者文件刚被删）。
    #[test]
    fn 同步时文件不在也不炸() {
        let mut 内 = 内层 {
            watcher: None,
            dirs: HashMap::new(),
            files: HashMap::new(),
        };
        内.同步(&[(DocId(7), PathBuf::from("/tmp/nota-watch-根本没有这份.md"))]);
        assert!(内.files[&PathBuf::from("/tmp/nota-watch-根本没有这份.md")]
            .摘要
            .is_empty());
    }
}
