//! 文档相关命令。

use std::path::PathBuf;

use tauri::State;

use crate::devserver::{self, DevServerState};
use crate::document::{DocId, Document};
use crate::error::{NotaError, Result};
use crate::state::AppState;
use crate::watch::监视器;

/// 新建一份空文档。
#[tauri::command]
pub fn nota_doc_new(state: State<'_, AppState>) -> Result<DocId> {
    let mut docs = state.documents.lock().unwrap();
    Ok(docs.create_untitled())
}

/// 打开一个文件。**已打开就复用**（不重复开标签），并把活动标签切过去。
///
/// ⚠️ 打开之后要把**外部改动监视**的基准挪到"我们刚读进来的这一份"：
/// 不挪的话，下一次别人动这份文件时，我们手里那个基准还停在**上一个**
/// 打开过的内容上，判据会当场判成"变了"——用户什么都没干就看到一条提示。
///
/// ⚠️ `documents` 锁**在动监视器之前放掉**。`watch.rs` 不在
/// `state.rs` 那条锁序上（它只拿自己那一把），可"不在锁序上"只说明它不会
/// 成环，不说明可以抱着别人的锁去拿它（那正是锁序要防的形状）。
#[tauri::command]
pub fn nota_doc_open(
    state: State<'_, AppState>,
    监: State<'_, 监视器>,
    path: String,
) -> Result<DocId> {
    let 路径 = PathBuf::from(path);
    let (id, 文本) = {
        let mut docs = state.documents.lock().unwrap();
        let id = docs.open(&路径)?;
        let 文本 = docs.get(id).map(|d| d.text.clone()).unwrap_or_default();
        (id, 文本)
    };
    监.记下(&路径, &文本);
    // 记进「最近文件」。⚠️ **放在这两件事之后**：真正的口径是"**打开成功**才算
    // 最近打开过"——先记的话，一个打不开的路径（文件不在了、不是 UTF-8）会
    // 赖在最近列表里，而用户点它换来的还是同一条错。
    //
    // ⚠️ 这里**故意不 `?`**：记不住最近是件小事，不该让"打开文档"这一枪失败。
    // 侧车写不进去（磁盘满、权限）时只记一行日志，文档照开。
    if let Err(e) = crate::session::记最近(&路径.to_string_lossy()) {
        crate::日志!("[nota] 最近文件没记上：{e}");
    }
    Ok(id)
}

/// 前端推来新文本。返回新的 revision。
///
/// 前端**去抖 300ms** 调一次（见 `docs/03` §真相在哪），存盘/插件读文档前会强制再调一次。
///
/// ⚠️ 除了更新镜像，这里还**顺手把插件的预览接上新的正文**（见下面 `推给预览`）。
/// 两件事的先后是**必须的**：先把 documents 锁放掉，再动 devserver。
/// 锁序见 `state.rs` 顶上那段（`plugins → documents → settings`）——
/// 在这里抱着 documents 去拿 devserver，而另一个线程可能正抱着 devserver 等
/// documents，那就是死锁。
#[tauri::command]
pub fn nota_doc_sync(
    state: State<'_, AppState>,
    dev: State<'_, DevServerState>,
    id: DocId,
    text: String,
) -> Result<u64> {
    let revision = {
        let mut docs = state.documents.lock().unwrap();
        docs.sync(id, text.clone())?
    }; // ← documents 锁在这里**一定**已经放掉了
    推给预览(&dev, id, &text);
    Ok(revision)
}

/// 编辑器**装载完之后**把文本交回来认领。
///
/// ⚠️ 这是 `sync` 的兄弟，但语义完全不同：`sync` 是"用户改了"，
/// 本命令是"编辑器把文件规范化成了这个样子、用户还没碰呢"。
/// 混用会让 `dirty` 说谎（要么打开就脏、要么改完不脏）。见 `DocumentStore::settle`。
///
/// ⚠️ 也要 `推给预览`：`settle` 之后正文**确实变了**（编辑器规范化过），
/// 而用户接下来很可能是去点「预览」——那时入口文件要是还没更新，
/// 他看到的是一份规范化之前的旧稿。这一条修起来是一行，不修则是一个
/// "预览的内容跟我屏幕上不一样"的鬼故事。
#[tauri::command]
pub fn nota_doc_settle(
    state: State<'_, AppState>,
    dev: State<'_, DevServerState>,
    id: DocId,
    text: String,
) -> Result<u64> {
    let revision = {
        let mut docs = state.documents.lock().unwrap();
        docs.settle(id, text.clone())?
    };
    推给预览(&dev, id, &text);
    Ok(revision)
}

/// 正文变了 → 让盯着这份文档的预览重新写入口文件。
///
/// ⚠️ **没在预览时是空操作**（`refresh` 里连一场会话都没匹配上），
/// 所以这个钩子对绝大多数编辑是零成本的：一次取锁 + 一次空遍历。
/// 不为它加判据是**故意**的——"有没有预览在跑"这个判断在另一把锁后面，
/// 为了省这点开销去多取一次锁反而更容易出问题。
fn 推给预览(dev: &DevServerState, id: DocId, text: &str) {
    devserver::refresh(dev, id, text);
}

/// 存盘。`path` 给了就是「另存为」。返回最终落盘路径。
///
/// ⚠️ 存盘之后必须调 `监视器::记下`。这一步**不是优化，是"不报自己"的全部机制**：
/// 我们刚把这份文本写到那个路径上，250ms 之后监视器会收到一条"这个文件变了"，
/// 拿磁盘摘要跟我们手里那个基准一比——不挪基准的话，每次 `Ctrl+S` 都会弹一条
/// "这个文件被别的程序改了"，而改的人就是用户自己。这条判据的完整说明在
/// `watch.rs` 文件头。
#[tauri::command]
pub fn nota_doc_save(
    state: State<'_, AppState>,
    监: State<'_, 监视器>,
    id: DocId,
    path: Option<String>,
) -> Result<String> {
    // ⚠️ `docs.save` 会把 `path` **移走**，所以先在这里记一笔"用户指定了路径没有"
    // ——下面要据此决定记不记「最近」（见那一段的注释）。
    let 是另存为 = path.is_some();
    let (written, 文本) = {
        let mut docs = state.documents.lock().unwrap();
        let written = docs.save(id, path.map(PathBuf::from))?;
        // ⚠️ 取的是 `text`，也就是**刚写出去的那份**（`save` 写的就是它，
        // 见 `DocumentStore::save`）。这里不能拿 `clean_text`——两者存盘后
        // 虽然相等，但读 `text` 才是"磁盘上现在是什么"的直接对应。
        let 文本 = docs.get(id).map(|d| d.text.clone()).unwrap_or_default();
        (written, 文本)
    };
    监.记下(&written, &文本);
    // ⚠️ **只有「另存为」（`path` 有值）才记「最近」**，理由不是"省一次写盘"
    // 而是正确性：`Ctrl+S` 与自动保存在一份**已经打开**的文档上是高频动作
    // （自动保存每隔几秒就一次），每次都重写一遍侧车文件纯属浪费；而
    // 「另存为」产出的是一条**新路径**，它不在最近列表里，正该记上。
    if 是另存为 {
        if let Err(e) = crate::session::记最近(&written.to_string_lossy()) {
            crate::日志!("[nota] 最近文件没记上：{e}");
        }
    }
    crate::paths::path_to_string(&written)
}

/// **重命名**：把这份文档挪到**同一个目录**下的另一个名字。
///
/// ⚠️ 收的是**名字**（单独一段），不是整条路径。理由有两条，都硬：
/// 1. **路径的其余部分要原样保留**。宿主手里那份路径可以有非 UTF-8 的字节
///    （Linux 上路径不保证合法，见 `single_instance.rs` 文件头），而前端拿到的
///    `path` 是**有损**的（`path_string()`）——拿它去拼新路径，会把
///    `/home/u/笔记` 这种目录名拼成 `?` 开头的另一个目录，于是"重命名"
///    变成"把文件挪到一个新造的目录里"。这里让宿主从自己记着的那一份拼。
/// 2. **把"改名"和"挪到别处"分开**：名字里带 `/` 就是后者，那件事有
///    `nota_doc_move` 那条路（走目录选择框）。挡住它，免得同一个输入框里
///    能打出两种动作，而其中一种（`../x.md`）会跑到别的目录去。
///
/// ⚠️ 三笔账要跟着搬：**监视基准**（前端拿到新路径会重报一遍，这一层不动）、
/// **「最近」与滚动位置**（`session::改最近`）、**表格列宽**（`table_width::改路径`）。
/// 后两笔都**不 `?`**：它们失败只是"列表里少一条 / 列宽回到自动"，不该让
/// 一次已经成功的改名看起来失败了——那种失败会诱使用户再点一次，而第二次
/// 会报"名字已经在了"（文件真的已经挪过去了）。
#[tauri::command]
pub fn nota_doc_rename(state: State<'_, AppState>, id: DocId, name: String) -> Result<String> {
    let 名字 = 干净的文件名(&name)?;
    let 老 = 老路径(&state, id)?;
    let 父 = 老.parent().ok_or_else(|| {
        NotaError::other(format!("「{}」没有上一级目录，挪不了", 老.display()))
    })?;
    let 目标 = 父.join(名字);
    挪过去(&state, id, &老, 目标)
}

/// **移动**：把这份文档挪到另一个目录里（文件名不变）。
///
/// ⚠️ 文件名那一段**由宿主从自己那份路径上取**（理由同 `nota_doc_rename` 第 1 条）。
#[tauri::command]
pub fn nota_doc_move(state: State<'_, AppState>, id: DocId, dir: String) -> Result<String> {
    let 老 = 老路径(&state, id)?;
    let 名 = 老
        .file_name()
        .ok_or_else(|| NotaError::other(format!("「{}」没有文件名，挪不了", 老.display())))?
        .to_os_string();
    let 目标 = PathBuf::from(dir).join(名);
    挪过去(&state, id, &老, 目标)
}

/// 这份文档现在的路径。**还没存过盘**时如实报错（让界面去提示「保存为」）。
fn 老路径(state: &AppState, id: DocId) -> Result<PathBuf> {
    state
        .documents
        .lock()
        .unwrap()
        .get(id)
        .and_then(|d| d.path.clone())
        .ok_or_else(|| NotaError::other("这份文档还没存过盘，先用「保存为」给它一个位置"))
}

/// 用户敲进来的那个新名字，能不能当**一段**名字用。
///
/// ⚠️ 这里只挡"不能是一段名字"的那种（空、带分隔符、`.` / `..`）。
/// **不查扩展名**：`a.md` 改成 `a.txt` 是用户的事，改成 `a` 也行——
/// 仓库里没有一条规矩说"Nota 只认 .md"（打开时是按内容判的，不是按扩展名）。
fn 干净的文件名(名字: &str) -> Result<String> {
    let 名字 = 名字.trim();
    if 名字.is_empty() {
        return Err(NotaError::other("名字不能是空的"));
    }
    if 名字.contains('/') || 名字.contains('\\') {
        return Err(NotaError::other(
            "名字里不能带路径分隔符——要挪到别的文件夹请用「移动…」",
        ));
    }
    if 名字 == "." || 名字 == ".." {
        return Err(NotaError::other("「.」和「..」不是文件名"));
    }
    Ok(名字.to_owned())
}

/// 改名 / 移动的**共同后半段**：真的挪、改文档记着的路径、把三笔账跟过去。
///
/// ⚠️ 顺序是：**先挪盘上的文件**（`docs.移到` 里做的就是这件事，挪失败什么都不改），
/// 成功了再动账。反过来的话，挪失败会留下一份"最近列表里已经改了名、
/// 而文件还在老地方"的账。
///
/// ⚠️ 三笔账里**监视那一笔故意不在这儿动**：它是"前端报一遍现在开着什么"
/// 驱动的（`watch.rs::同步`），而前端刷新文档列表之后自己会重报一遍——
/// 那一次会按新路径去盘上读基准，正是我们要的。在这里手动 `记下` 反而是错的：
/// 这份文档可能带着**还没保存的改动**，拿内存里那份当基准，下一次外部改动
/// 检查会拿磁盘上的旧内容去比，于是**报一条假的"文件被别的程序改了"**。
fn 挪过去(state: &AppState, id: DocId, 老: &std::path::Path, 目标: PathBuf) -> Result<String> {
    let 新 = {
        let mut docs = state.documents.lock().unwrap();
        docs.移到(id, 目标.clone())?
    };

    let (老串, 新串) = (
        老.to_string_lossy().into_owned(),
        新.to_string_lossy().into_owned(),
    );
    if let Err(e) = crate::session::改最近(&老串, &新串) {
        crate::日志!("[nota] 改名后「最近」没跟上：{e}");
    }
    if let Err(e) = crate::table_width::改路径(老, &新) {
        crate::日志!("[nota] 改名后表格列宽没跟上：{e}");
    }
    crate::paths::path_to_string(&新)
}

/// 关掉一份文档。**不做未保存询问**——那是前端的事（它才知道用户点了什么）。
#[tauri::command]
pub fn nota_doc_close(state: State<'_, AppState>, id: DocId) -> Result<()> {
    let mut docs = state.documents.lock().unwrap();
    docs.close(id);
    Ok(())
}

/// 切换活动文档。
#[tauri::command]
pub fn nota_doc_set_active(state: State<'_, AppState>, id: DocId) -> Result<()> {
    let mut docs = state.documents.lock().unwrap();
    docs.set_active(id)
}

/// 取一份文档的当前状态。
#[tauri::command]
pub fn nota_doc_get(state: State<'_, AppState>, id: DocId) -> Result<Document> {
    let docs = state.documents.lock().unwrap();
    docs.get(id)
        .cloned()
        .ok_or_else(|| NotaError::other(format!("没有这份文档：{}", id.0)))
}

/// 列出所有打开的文档。
#[tauri::command]
pub fn nota_doc_list(state: State<'_, AppState>) -> Result<Vec<Document>> {
    let docs = state.documents.lock().unwrap();
    Ok(docs.list().to_vec())
}

/// 磁盘内容变了，重读一遍（外部改动 / 用户放弃修改）。
///
/// ⚠️ 重载之后把监视基准挪到**刚读进来的那一份**，理由与 `nota_doc_open`
/// 那段相同。少了这一步，用户在提示条上点一次「重新载入」，250ms 之后
/// **同一条提示会再冒一次**——而他刚刚才处理过。
#[tauri::command]
pub fn nota_doc_reload(
    state: State<'_, AppState>,
    监: State<'_, 监视器>,
    id: DocId,
) -> Result<Document> {
    let 文档 = {
        let mut docs = state.documents.lock().unwrap();
        docs.reload(id)?;
        docs.get(id)
            .cloned()
            .ok_or_else(|| NotaError::other(format!("没有这份文档：{}", id.0)))?
    };
    if let Some(路径) = 文档.path.as_deref() {
        监.记下(路径, &文档.text);
    }
    Ok(文档)
}

/// 读**磁盘上**那一份的文本，**不改任何状态**。
///
/// 给外部改动提示条的「查看修改」用：要拿磁盘那份和编辑器手里这份做 diff，
/// 而 `nota_doc_reload` 会把内存里那份也换掉（它正是「重新载入」那个按钮
/// 干的事）。这里只读一眼，读完什么都不会变——用户点「查看修改」之后
/// 随手一关，编辑器里还是原样。
///
/// ⚠️ **不要**拿宿主镜像（`Document::text`）代替它：镜像有 300ms 去抖，
/// 而且它本来就是"编辑器里那份"，正是要比的另一边。
#[tauri::command]
pub fn nota_doc_disk_text(state: State<'_, AppState>, id: DocId) -> Result<String> {
    let 路径 = {
        let docs = state.documents.lock().unwrap();
        docs.get(id)
            .and_then(|d| d.path.clone())
            .ok_or_else(|| NotaError::other("这份文档还没有路径"))?
    };
    std::fs::read_to_string(&路径).map_err(|source| NotaError::Read { path: 路径, source })
}

/// 有没有未保存的改动。退出前前端拿它决定要不要弹框。
#[tauri::command]
pub fn nota_doc_has_unsaved(state: State<'_, AppState>) -> Result<bool> {
    let docs = state.documents.lock().unwrap();
    Ok(docs.has_unsaved())
}
