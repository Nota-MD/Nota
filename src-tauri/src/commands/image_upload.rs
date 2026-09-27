//! 「上传图片」那三条命令，外加**手动与自动两条路共用的那一次上传**。
//!
//! ```text
//! 设置页 ──> nota_image_upload_get  ──> { settings, willAutoUpload }
//!        └─> nota_image_upload_set  ──> 落盘（0600，见 crate::upload）
//!
//! 对话框（手动勾选）──> nota_image_upload_one ──┐
//! 插入时（YAML 自动）─> nota_image_place 内部 ──┴─> 同一次上传（传这张）
//! ```
//!
//! # 三道闸，缺一不可
//!
//! 自动上传要**同时**成立：`enabled`（这台机器上有这么一台服务器）、
//! `auto`（允许文档自己说要传）、**这份文档的 front matter 里写着
//! `nota-auto-upload`**。少一道就是"没传"——而"没传"必须是**看得出来的没传**
//! （什么都不发生），不是"悄悄用了另一条路"。
//!
//! ⚠️ **网络图片永远不自动上传**，这一条没有开关。理由不是省流量：网络图片的
//! 原地址**不是这台机器上的文件**，自动去取它等于"替你访问一个第三方"，
//! 而用户此刻的动作只是"往文档里插一条地址"。手动勾选时那条路是走的
//! （`remote_field`），因为那一下是用户明确点的。
//!
//! # ⚠️ 上传失败**绝不能把图弄丢**
//!
//! 自动那条路在 `place` **之后**跑：图已经在磁盘上、`src` 已经算好了。
//! 传成功了就把 `src` 换成 URL；传失败就把错误**如实报回去**，`src` 保持
//! 本地地址不变（见 `commands/image.rs` 里 `落地结果.upload`）。手动那条路
//! 反过来：先试上传，**失败了才走 place**（`useImageInsert` 里那段）。
//! 两条路的方向不同，结果一样：**文档里总有一条能用的地址**。
//!
//! # 配置**每次都从盘上读**，不在 `AppState` 里放一份
//!
//! 与 `settings` 那张表不同（那份在内存里，改了立刻热更新）。这一份刻意不缓存：
//! ①它很小（八个字段），一次 `read_to_string` 的事；②它**是用户会拿编辑器手改
//! 的文件**（文件头就是这么写的），缓存了就会出现"我改了文件怎么不生效"；
//! ③缓存要配一把新锁，而它不在「plugins → documents → settings」那条锁序上，
//! 多一把锁就多一种死锁的排法。
//!
//! ⚠️ 三条命令**都是 `async` + `spawn_blocking`**：读设置要碰磁盘，上传要联网
//! （最长 60 秒，见 `upload/net.rs`）。Tauri 的同步命令跑在主线程上，在那儿等
//! 就是冻界面。

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::commands::image::{图片来源, 上传回报, 解析来源};
use crate::document::DocId;
use crate::error::{NotaError, Result};
use crate::image::{self, 来源};
use crate::state::AppState;
use crate::upload::{self, 传什么, 上传设置};

/// 设置页要的几样：配置本身，以及"这台机器配没配"、"此刻会不会自动上传"。
#[derive(Debug, Serialize)]
pub struct 上传概览 {
    pub settings: 上传设置,
    /// 配好了吗（总开关开着、地址也是 http/https）——`上传设置::可用` 那一个判据。
    ///
    /// ⚠️ 由宿主算，**不让前端拿 `url` 自己判**："这条地址算不算服务器地址"
    /// 只有一处答案（`image::是网络地址`），前端再判一次就是两份规则，
    /// 而两份规则迟早有一份过期——症状是"勾选框在那儿，勾下去报一句不是地址"。
    #[serde(rename = "canUpload")]
    pub 配好了: bool,
    /// **此刻**在这份文档里插一张本地图片，会不会自动上传——三个条件都算过了。
    ///
    /// ⚠️ 同样由宿主算：多一个推导点就多一处"界面上说会自动传、实际没传"
    /// （或者反过来）。前端拿它做的只有一件事：那张勾选框要不要换成一句说明。
    #[serde(rename = "willAutoUpload")]
    pub 会自动上传: bool,
}

/// 传上去之后回报的东西。今天只有一条地址。
#[derive(Debug, Serialize)]
pub struct 上传了 {
    /// 该写进文档的那条地址。
    pub url: String,
}

/// 读上传设置 + 这份文档会不会自动上传。
#[tauri::command]
pub async fn nota_image_upload_get(
    state: State<'_, AppState>,
    doc_id: Option<DocId>,
) -> Result<上传概览> {
    let 设置 = 读设置().await?;
    let 配好了 = 设置.可用();
    // ⚠️ 锁的是 documents，且**读完就放**（`文档写着键吗` 里面那个花括号）。
    // 不在持锁期间 await——那条规矩见 `state.rs` 顶上。
    let 自动 = 配好了 && 设置.auto && 文档写着键吗(&state, doc_id)?;
    Ok(上传概览 {
        settings: 设置,
        配好了,
        会自动上传: 自动,
    })
}

/// 存上传设置。**整份替换**（与 `nota_settings_set` 同一条口径）。
///
/// ⚠️ 参数名写 `settings` 而不是 `设置`：**这个标识符要过 IPC**，Tauri 会把
/// Rust 的参数名转成前端那个键（默认 camelCase）。中文标识符在那一层转换里
/// 没有先例——空转不一定出事，但"名字对不上"的症状是**运行时静默失败**，
/// 而且要开图形界面才看得见。与 `nota_settings_set` 用同一个名字就没有这个问题。
#[tauri::command]
pub async fn nota_image_upload_set(settings: 上传设置) -> Result<()> {
    upload::形状行吗(&settings)?;
    tauri::async_runtime::spawn_blocking(move || upload::写(&settings))
        .await
        .map_err(|e| NotaError::other(format!("保存上传设置的任务没跑起来：{e}")))?
}

/// 手动把一张图传上去（对话框里勾了「插入后上传」那条路）。
///
/// ⚠️ **它不落盘、也不改文档**：只回一条地址，写进文档是前端的事
/// （`useImageInsert` 拿到地址后照常走 `run("image", …)`）。这样"改用户字节"
/// 那件事仍然只有一条路（编辑器的插入命令），框里勾一下不会绕开撤销栈。
#[tauri::command]
pub async fn nota_image_upload_one(
    state: State<'_, AppState>,
    doc_id: Option<DocId>,
    source: 图片来源,
) -> Result<上传了> {
    let (文档目录, _) = 文档位置(&state, doc_id)?;
    let 设置 = 读设置().await?;
    let 来源 = 解析来源(source)?;
    // ⚠️ 手动那条路**不给"落到的文件"**：图还没插进文档呢，磁盘上还没有那一份
    // （用户可能选了「复制到 ./assets」，但那是插入时才发生的事）。
    let url = 传这张(设置, 来源, 文档目录, None).await?;
    Ok(上传了 { url })
}

/* ── 手动与自动共用的那一次 ────────────────────────────────────────────── */

/// 把一份来源传上去，拿回地址。
///
/// `落到的` 是宿主刚落地的那份文件（绝对路径）。**有它就读它**：文档里写的
/// 将是那条相对地址，传上去的也该是同一个文件；没有才退回原始的来源
/// （本地路径按文档目录定、剪贴板用手里那段字节）。
pub(crate) async fn 传这张(
    设置: 上传设置,
    来源: image::来源,
    文档目录: Option<PathBuf>,
    落到的: Option<String>,
) -> Result<String> {
    // 读文件 + 拼体 + 发请求全在阻塞池里：一次上传最长 60 秒（见 `upload/net.rs`）。
    tauri::async_runtime::spawn_blocking(move || {
        let 内容 = 要传什么(&来源, 文档目录.as_deref(), 落到的.as_deref())?;
        upload::传一次(&设置, 内容)
    })
    .await
    .map_err(|e| NotaError::other(format!("上传任务没跑起来：{e}")))?
}

/// 把一份 `image::来源` 变成"要传的东西"。**读文件在这儿发生。**
///
/// ⚠️ 剪贴板那一路**不写任何文件**：字节本来就在手里，直接发。所以"粘贴一张
/// 截图 → 上传"这条路上，磁盘上一个字节都不会多出来（除非用户还开着
/// 「复制到 ./assets」，那是插入那一步的事）。
fn 要传什么(
    源: &来源,
    文档目录: Option<&Path>,
    落到的: Option<&str>,
) -> Result<传什么> {
    // 落了盘就传那一份：它与文档里要写的地址是同一个文件。
    if let Some(路径) = 落到的 {
        let p = Path::new(路径);
        let 字节 = std::fs::read(p).map_err(|e| NotaError::Read {
            path: p.to_path_buf(),
            source: e,
        })?;
        return Ok(传什么::本地 {
            字节,
            文件名: 文件名(p),
        });
    }
    Ok(match 源 {
        来源::本地文件(给的) => {
            let p = image::定本地文件(给的, 文档目录);
            let 字节 = std::fs::read(&p).map_err(|e| NotaError::Read {
                path: p.clone(),
                source: e,
            })?;
            // ⚠️ 文件名取**定过之后**的那个：用户写 `图.png`、文档在
            // `/home/我/笔记/` 下，服务器该收到 `图.png`（不是 `图.png` 的
            // 某个变体），所以两条路上都得从同一个 Path 上取。
            传什么::本地 {
                字节,
                文件名: 文件名(&p),
            }
        }
        来源::网络地址(u) => 传什么::网络 {
            原地址: u.clone(),
        },
        来源::剪贴板 { 字节, 后缀 } => 传什么::本地 {
            字节: 字节.clone(),
            文件名: format!("image.{后缀}"),
        },
    })
}

fn 文件名(p: &Path) -> String {
    p.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "image.png".to_string())
}

/* ── 从仓库和盘上取事实 ────────────────────────────────────────────────── */

/// 读上传设置（在阻塞池里读盘）。
pub(crate) async fn 读设置() -> Result<上传设置> {
    tauri::async_runtime::spawn_blocking(upload::读)
        .await
        .map_err(|e| NotaError::other(format!("读上传设置的任务没跑起来：{e}")))
}

/// 当前文档在哪个目录、叫什么名（自动上传要用它去定相对路径）。
pub(crate) fn 文档位置(
    state: &AppState,
    doc_id: Option<DocId>,
) -> Result<(Option<PathBuf>, Option<String>)> {
    let docs = state
        .documents
        .lock()
        .map_err(|_| NotaError::other("文档仓库的锁坏了，请重启 Nota"))?;
    Ok(match doc_id.and_then(|id| docs.get(id)) {
        Some(d) => (
            d.path
                .as_ref()
                .and_then(|p| p.parent().map(|x| x.to_path_buf())),
            d.path
                .as_ref()
                .and_then(|p| p.file_stem().map(|s| s.to_string_lossy().to_string())),
        ),
        None => (None, None),
    })
}

/// 这份文档的 front matter 里写着「允许自动上传」吗。
///
/// ⚠️ 取的是 `Document.text`——**仓库里的文本镜像**，不是编辑区里那一份。
/// 两者在存盘/同步时对齐（见 `document/mod.rs` 文件头）。用镜像的代价是：
/// 用户刚在前件里敲上那个键、还没触发一次 sync 时插入图片，这次不算数
/// （下一次算）。这是**故意**的：为了一个开关去读编辑器里的 DOM，等于把
/// 宿主的手伸进渲染层；而"多等一次同步"的最坏结果是"这次没传"，
/// 而"这次没传"是**看得出来的**（插进去的是本地地址）。
pub(crate) fn 文档写着键吗(state: &AppState, doc_id: Option<DocId>) -> Result<bool> {
    let docs = state
        .documents
        .lock()
        .map_err(|_| NotaError::other("文档仓库的锁坏了，请重启 Nota"))?;
    Ok(doc_id
        .and_then(|id| docs.get(id))
        .is_some_and(|d| upload::前件开着吗(&d.text)))
}

/// 自动上传那一步（`nota_image_place` 尾部调它）。
///
/// 三道闸已经在外层判过（见文件头），这里只做"传"和"把结果折成回报"。
pub(crate) async fn 自动传(
    设置: 上传设置,
    来源: image::来源,
    文档目录: Option<PathBuf>,
    落到的: Option<String>,
) -> 上传回报 {
    match 传这张(设置, 来源, 文档目录, 落到的).await {
        Ok(url) => 上传回报::好 { url },
        // ⚠️ 失败**只回一句话，不回滚任何东西**：图已经在磁盘上、地址已经算好，
        // 前端用 `failed.error` 弹一条错误提示，插入照旧用本地地址完成。
        Err(e) => 上传回报::没成 {
            error: e.to_string(),
        },
    }
}
