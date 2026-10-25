//! 工作区（打开的文件夹）相关命令。
//!
//! 工作区这一栏不只是 UI 状态——它同时是 `nota.fs` 与 `nota.git` 的**围栏**：
//! 插件能碰的文件范围、能跑 git 的目录，都由它决定。所以设工作区这个动作
//! 走的是**规范化后的绝对路径**，不是用户点进来的那个可能带 `..` 的串。
//!
//! # ⚠️ 它有两份真相，分工必须清楚
//!
//! - **内存那一份**（`AppState::workspace`）是**这次**生效的东西，围栏读的是它。
//!   进程一退就没了。
//! - **会话侧车那一笔**（`crate::session::记工作区`）只是"上次开的是哪个文件夹"
//!   这句记忆，唯一用途是启动时按设置里的第三档恢复（2026-09-27 加）。
//!
//! 所以写侧车**失败不算这条命令失败**：真正生效的那一份已经写进内存了。
//! 反过来也成立——侧车里有、内存里没有（刚启动、还没恢复），**围栏就是没有**：
//! `nota_workspace_get` 读的是内存，不会拿侧车里的旧路径去开围栏。

//! # 树的口径（2026-09-28 加）
//!
//! [`nota_workspace_tree`] 从这一批起收一个可选的 [`TreeOptions`]：**排序档、
//! 显示哪些文件、要不要显示隐藏文件**。不传时回落到 `[files]` 表里那三项
//! （{@link 口径解析}），所以老的调用点不改也照常工作。
//!
//! ⚠️ **为什么要显式传，而不是让后端自己去读设置**：设置页那一路是"先改内存
//! 再写盘"（`props.tsx::paneWriter`），时序上后端可能还拿着旧值——用户在下拉里
//! 换成"按修改时间"，紧接着的那一次请求如果读的是后端手里的旧设置，树就**不换**，
//! 要等下一次别的原因刷新才换。这种"拨了没反应、过一会儿自己好了"是最难报的
//! 一类 bug。前端把当前口径**跟着请求一起递过来**，就没有这个时间差。

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{NotaError, Result};
use crate::settings::files::{FileFilter, Files, TreeSort};
use crate::state::AppState;

/// 文件树的一格。
#[derive(Debug, Clone, Serialize)]
pub struct TreeNode {
    /// 显示名（文件名）。
    pub name: String,
    /// **相对工作区根**的路径，用 `/` 分隔。
    /// 用相对路径而不是绝对路径：前端把整棵树递来递去时不必背着机器信息，
    /// 插件也能直接拿它去 `nota.fs.read`（那个 API 只收相对路径）。
    pub path: String,
    pub is_dir: bool,
    /// 目录才有；文件是 `None`。
    pub children: Option<Vec<TreeNode>>,
}

/// 文件列表的轻量摘要。只读正文开头，不进入文档仓库，也不改变任何文件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExcerpt {
    pub path: String,
    pub title: Option<String>,
    pub detail: Option<String>,
}

/// 前端这一次请求要用的树口径。**三格全是可选的**：没给的格子回落到设置。
///
/// ⚠️ 字段是 camelCase（`showHidden`），与别的命令参数一个口径——Tauri 只把
/// **命令自己的**参数名从 camelCase 转成 snake_case，**结构体里面的字段名
/// serde 原样用**。少了这一句，前端发 `showHidden` 会被当成未知字段忽略掉，
/// 症状是"显示隐藏文件这个开关拨了没用"（而这正是本批要修的那类毛病）。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TreeOptions {
    /// 怎么排。不给就用设置里那一档。
    pub sort: Option<TreeSort>,
    /// 显示哪些文件。不给就用设置里那一档。
    pub filter: Option<FileFilter>,
    /// 显示隐藏文件吗。不给就用设置里那个开关。
    pub show_hidden: Option<bool>,
}

/// [`TreeOptions`] 解析之后的落地形态：三格都定死了，读目录那一层只认它。
///
/// ⚠️ **与 [`TreeOptions`] 分开是故意的**：前者是"线上来的、可以缺格"的形状，
/// 后者是"干活用的、一定齐全"的形状。合成一个的话，`read_dir_sorted` 里
/// 每一处判断都要写一次 `unwrap_or`，而漏掉一处的症状是那一路**静默用错档**。
#[derive(Debug, Clone, Copy)]
struct 树口径 {
    sort: TreeSort,
    filter: FileFilter,
    show_hidden: bool,
}

impl Default for 树口径 {
    fn default() -> Self {
        Self {
            sort: TreeSort::default(),
            filter: FileFilter::default(),
            show_hidden: false,
        }
    }
}

/// 把"这一次请求要什么"与"设置里存着什么"合成一份齐全的口径。
///
/// ⚠️ **逐格回落，不是"给了 opts 就全听 opts"**：前端只关心其中一格时
/// （比如只想显示隐藏文件、排序照设置走）另外两格留空即可，不必把设置抄一份
/// 再递过来——抄的那一份会过期。
///
/// ⚠️ **纯函数**（只读 [`Files`]，不碰状态、不碰磁盘），所以测试能直接喂它。
fn 口径解析(opts: Option<TreeOptions>, 设: &Files) -> 树口径 {
    树口径 {
        sort: opts.as_ref().and_then(|o| o.sort).unwrap_or(设.tree_sort),
        filter: opts.as_ref().and_then(|o| o.filter).unwrap_or(设.tree_filter),
        show_hidden: opts
            .as_ref()
            .and_then(|o| o.show_hidden)
            .unwrap_or(设.show_hidden),
    }
}

/// 打开一个文件夹作工作区。
///
/// ⚠️ 顺手把路径记进**会话侧车**（`crate::session::记工作区`）：设置里「启动时」
/// 的第三档要"恢复上次的文件和文件夹"，而在这之前工作区只在内存里，冷启动必是空的。
///
/// ⚠️ **记不住不算失败**：内存里那一份才是这次真正生效的东西（也是插件围栏的来源），
/// 侧车丢了只该让"下次启动不恢复文件夹"。所以这里**只记日志，不往上报错**——
/// 口径与侧车本文件头那句"删掉它的后果只有记忆没了"一致。
#[tauri::command]
pub fn nota_workspace_open(state: State<'_, AppState>, path: String) -> Result<String> {
    let canonical = PathBuf::from(&path)
        .canonicalize()
        .map_err(|source| NotaError::Read {
            path: PathBuf::from(&path),
            source,
        })?;

    if !canonical.is_dir() {
        return Err(NotaError::other(format!("{path} 不是文件夹")));
    }

    let 标准串 = crate::paths::path_to_string(&canonical)?;
    *state.workspace.lock().unwrap() = Some(canonical.clone());
    if let Err(e) = crate::session::记工作区(Some(&标准串)) {
        crate::日志!("[nota] workspace not saved to session: {e}");
    }
    crate::日志!("[nota] workspace opened: {标准串}");
    Ok(标准串)
}

/// 关掉工作区。**只清围栏，不关文档**——用户开着的标签照旧。
///
/// ⚠️ 侧车里那一笔也**要跟着清掉**：用户是**主动**关掉这个文件夹的，
/// 留着它的话下次启动第三档又会把它打开——那是"我关的东西自己回来了"。
#[tauri::command]
pub fn nota_workspace_close(state: State<'_, AppState>) -> Result<()> {
    *state.workspace.lock().unwrap() = None;
    if let Err(e) = crate::session::记工作区(None) {
        crate::日志!("[nota] failed to clear workspace from session: {e}");
    }
    crate::日志!("[nota] workspace closed");
    Ok(())
}

#[tauri::command]
pub fn nota_workspace_get(state: State<'_, AppState>) -> Result<Option<String>> {
    let ws = state.workspace.lock().unwrap();
    match ws.as_ref() {
        Some(p) => Ok(Some(crate::paths::path_to_string(p)?)),
        None => Ok(None),
    }
}

/// 批量读取文件列表要显示的标题与下一段文字。
///
/// 只读每个文件开头 16 KiB，在阻塞线程池执行；打开工作区时不会为了摘要把整棵
/// 树的正文全部读一遍。路径仍经过工作区围栏。
#[tauri::command]
pub async fn nota_workspace_excerpts(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<WorkspaceExcerpt>> {
    let root = state
        .workspace
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| NotaError::other("没有打开工作区"))?;
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|path| {
                let full = crate::lua::api::fs::resolve_in(&root, &path)?;
                let mut bytes = Vec::with_capacity(16 * 1024);
                let file = std::fs::File::open(&full).map_err(|source| NotaError::Read {
                    path: full.clone(),
                    source,
                })?;
                file.take(16 * 1024)
                    .read_to_end(&mut bytes)
                    .map_err(|source| NotaError::Read {
                        path: full,
                        source,
                    })?;
                let text = String::from_utf8_lossy(&bytes);
                let (title, detail) = 取摘要(&text);
                Ok(WorkspaceExcerpt {
                    path,
                    title,
                    detail,
                })
            })
            .collect()
    })
    .await
    .map_err(|e| NotaError::other(format!("读取文件摘要失败：{e}")))?
}

fn 取摘要(text: &str) -> (Option<String>, Option<String>) {
    let mut lines = text.lines();
    if lines.clone().next().is_some_and(|line| line.trim() == "---") {
        lines.next();
        for line in lines.by_ref() {
            if line.trim() == "---" {
                break;
            }
        }
    }

    let mut picked = Vec::new();
    for raw in lines {
        let Some(line) = 清理摘要行(raw) else {
            continue;
        };
        picked.push(截断(&line, if picked.is_empty() { 80 } else { 120 }));
        if picked.len() == 2 {
            break;
        }
    }
    (picked.first().cloned(), picked.get(1).cloned())
}

fn 清理摘要行(raw: &str) -> Option<String> {
    let mut line = raw.trim();
    if line.is_empty()
        || line == "---"
        || line.starts_with("```")
        || line.starts_with("~~~")
        || line.starts_with("<!--")
        || line.starts_with('|')
    {
        return None;
    }
    line = line.trim_start_matches(['#', '>']).trim();
    for marker in ["- ", "* ", "+ "] {
        if let Some(rest) = line.strip_prefix(marker) {
            line = rest.trim();
            break;
        }
    }
    if let Some((prefix, rest)) = line.split_once(". ") {
        if !prefix.is_empty() && prefix.chars().all(|c| c.is_ascii_digit()) {
            line = rest.trim();
        }
    }
    let cleaned = line
        .replace("**", "")
        .replace("__", "")
        .replace("~~", "")
        .replace('`', "");
    let cleaned = cleaned.trim();
    (!cleaned.is_empty()).then(|| cleaned.to_string())
}

fn 截断(text: &str, max_chars: usize) -> String {
    let mut chars = text.chars();
    let head: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{head}…")
    } else {
        head
    }
}

/// 取工作区的文件树。
///
/// `depth` 是递归层数上限，前端按侧栏展开状态分段请求（先 1 层，展开某个目录时
/// 再要那一支）。**不做整棵树一次拉完**——大仓库（几万个文件）那样会卡住界面。
///
/// `opts` 是这一次的树口径（排序 / 过滤 / 隐藏文件），见 [`TreeOptions`]。
/// ⚠️ **不给就回落到 `[files]` 表**，所以这不是一个必须传的参数。
#[tauri::command]
pub fn nota_workspace_tree(
    state: State<'_, AppState>,
    sub_path: Option<String>,
    depth: Option<u32>,
    opts: Option<TreeOptions>,
) -> Result<Vec<TreeNode>> {
    let root = state
        .workspace
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| NotaError::other("没有打开工作区"))?;

    // 子路径同样要过一遍围栏——它从前端来，不能假定是干净的。
    let base = match sub_path {
        Some(sub) => crate::lua::api::fs::resolve_in(&root, &sub)?,
        None => root.clone(),
    };
    if !base.is_dir() {
        return Err(NotaError::other(format!("{} 不是文件夹", base.display())));
    }

    let base_rel = base
        .strip_prefix(&root)
        .map(|p| p.to_path_buf())
        .unwrap_or_default();

    // ⚠️ 这里**短暂持锁取一份 [`Files`] 的克隆**，不是整段读目录都持着设置锁
    // （下面 read_dir_sorted 可能递归几层、碰几千个文件）。设置锁与文档锁是
    // 分开的两把，但没必要把任何一把攥在磁盘 IO 上面。
    let 口径 = {
        let 设 = state.settings.lock().unwrap();
        口径解析(opts, &设.files)
    };

    read_dir_sorted(&base, &base_rel, depth.unwrap_or(1), 口径)
}

/// 读一层目录，排好序，按 `depth` 决定要不要递归下去。
///
/// ⚠️⚠️ **读不动的那一层要报错，不能返回空数组**（2026-09-25 改）。
/// 原来自作主张：`let Ok(entries) = … else { return Vec::new() }`。后果是
/// "这个文件夹我没有权限"和"这个文件夹是空的"在界面上长得**一模一样**
/// ——展开之后一片空白，用户以为自己记错了。
///
/// ⚠️ 前端其实早就备好了那条路：`Sidebar.tsx` 里是
/// `loadDir(...).then(...).catch(e => setErrors(...))`，注释写着这一行的用处。
/// **是后端从来不 reject，那条 catch 一次也没跑到过。**
///
/// ⚠️ 只有**被请求的那一层**抛（就是下面函数签名里这个 `Result`）：递归下去的
/// 子目录仍然吞掉（调用处 `unwrap_or_default`）。一个子目录读不动，
/// 不该让整棵已经读得出来的树跟着失败；而前端本来就是一层层按需要的，
/// 等轮到它自己那一层时，它会照常报出来。
fn read_dir_sorted(
    dir: &Path,
    rel: &Path,
    depth: u32,
    口径: 树口径,
) -> Result<Vec<TreeNode>> {
    let entries = std::fs::read_dir(dir).map_err(|source| NotaError::Read {
        path: dir.to_path_buf(),
        source,
    })?;

    // ⚠️ **一律跳过的名字**，与"显示隐藏文件"那个开关**无关**：
    //
    // - `.git` —— 里面是几千个哈希名，而且没有一个是用户想打开的。它是
    //   `show_hidden` 最典型的受害者：用户拨开隐藏文件是想看 `.github` /
    //   `.env`，结果整棵树被 `.git/objects/ab/cdef…` 淹掉，"显示隐藏文件"
    //   这个开关当场变成"永远不要拨"。
    // - `node_modules` —— 同上，而且它**不是**隐藏目录，过滤档挡不住它
    //   （`Show all` 那一档列全部文件）。设置页那句帮助文案
    //   （`FilesPane.tsx`：「一个 node_modules 就能把树填满」）指的就是它，
    //   文案既然这么写了，这里就得真跳。
    const 永远跳过: [&str; 2] = [".git", "node_modules"];

    // ⚠️ 两份都带着"时刻"走（排序用），最后才剥成 [`TreeNode`]。
    // 时刻**只在这一层用**：它不跟着 [`TreeNode`] 发给前端——前端拿不到就不该
    // 自己再排一遍，排序逻辑只有这一份（与 `find.ts` 那条"匹配逻辑只有一份"
    // 同一条规矩）。
    struct 候选 {
        节点: TreeNode,
        时刻: Option<SystemTime>,
    }

    let mut dirs: Vec<候选> = Vec::new();
    let mut files: Vec<候选> = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        // 点开头的一律是元数据目录（`.obsidian` / `.git` / `.DS_Store` 那一族），
        // **默认不显示**；`show_hidden` 拨开才列，但上面那两类永远不列。
        if name.starts_with('.') && !口径.show_hidden {
            continue;
        }
        // `node_modules` 不是隐藏目录，所以这一句**必须与上面那句分开写**：
        // 合起来写成 `if name.starts_with('.') || name == "node_modules"`
        // 就变成"拨开隐藏文件之后 node_modules 也冒出来了"。
        if 永远跳过.contains(&name.as_str()) {
            continue;
        }

        let Ok(meta) = entry.metadata() else { continue };
        // 符号链接不跟——跟了就可能绕出工作区，也可能成环把内存吃光。
        if meta.file_type().is_symlink() {
            continue;
        }

        let child_rel = rel.join(&name);
        let rel_str = child_rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");

        // ⚠️ **按名字排时一次 `metadata()` 都不多碰**：`meta` 本来就要取
        // （上面判符号链接、下面判目录），这里只是把它已经带着的时间读出来，
        // 没有额外的系统调用。
        let 时刻 = match 口径.sort {
            TreeSort::Name => None,
            TreeSort::Modified => meta.modified().ok(),
            // ⚠️ 给不出创建时间就**退回修改时间**（有些文件系统没有 btime）。
            // 理由写在 `TreeSort::Created` 上：排到最后的表现是"这批文件不参与
            // 排序"，看起来像排序坏了。
            TreeSort::Created => meta.created().ok().or_else(|| meta.modified().ok()),
        };

        if meta.is_dir() {
            dirs.push(候选 {
                节点: TreeNode {
                    name,
                    path: rel_str,
                    is_dir: true,
                    children: if depth > 1 {
                        // 子目录读不动就当作空的（见函数头那段）：只有被直接请求的
                        // 那一层才值得让整个请求失败。
                        Some(
                            read_dir_sorted(&entry.path(), &child_rel, depth - 1, 口径)
                                .unwrap_or_default(),
                        )
                    } else {
                        None
                    },
                },
                时刻,
            });
        } else if 口径.filter == FileFilter::All || is_markdown(&name) {
            // ⚠️ `Supported` 那一档**只列 markdown**（默认档，理由见
            // `settings/files.rs::FileFilter`）；`All` 那一档列全部文件——
            // 这一句是本批接上的线，在那之前这里写死成 `is_markdown(&name)`，
            // 于是设置页那个下拉拨了等于没拨。
            files.push(候选 {
                节点: TreeNode {
                    name,
                    path: rel_str,
                    is_dir: false,
                    children: None,
                },
                时刻,
            });
        }
    }

    // ⚠️ 名字序：用不区分大小写的比较——混排大小写时（README.md 与 apple.md）
    // 区分大小写的结果看着是乱的。大小写完全一样时再按原样比一次，纯粹是为了
    // 让顺序**稳定**（同一个目录读两次拿到的次序必须一样，否则界面每刷新一次
    // 行就重排一次）。
    let by_name = |a: &候选, b: &候选| {
        a.节点
            .name
            .to_lowercase()
            .cmp(&b.节点.name.to_lowercase())
            .then_with(|| a.节点.name.cmp(&b.节点.name))
    };

    // ⚠️ **两个时间档都是"新的在前"**（`b` 与 `a` 反着比），理由写在
    // `TreeSort` 上：用户想看的是"我刚改过的那几份"。
    // ⚠️ 比不出时刻的那些（`None`）在 `Option` 的次序里**小于** `Some`，
    // 反着比就落到最后——正是"排不出来也别挤掉别人"的落点。
    let 比较 = |a: &候选, b: &候选| match 口径.sort {
        TreeSort::Name => by_name(a, b),
        TreeSort::Modified | TreeSort::Created => b.时刻.cmp(&a.时刻).then_with(|| by_name(a, b)),
    };
    dirs.sort_by(比较);
    files.sort_by(比较);

    // ⚠️ **目录永远排在文件前面，三档都一样**（理由写在 `TreeSort` 上），
    // 所以这里是两段拼起来，不是一起排。
    Ok(dirs.into_iter().chain(files).map(|c| c.节点).collect())
}

/// 哪些后缀算 markdown。与 `docs/03` 里认领的后缀表**必须一致**。
///
/// ⚠️ 它只服务 [`FileFilter::Supported`] 那一档（默认档）：`All` 那一档
/// **不调用它**。别把"哪些文件能在 Nota 里打开"也寄存在这里——那是
/// `nota_doc_open` 的事，两者重合是巧合，不是约束。
fn is_markdown(name: &str) -> bool {
    let lower = name.to_lowercase();
    [".md", ".markdown", ".mdown", ".mkd", ".mdx", ".txt"]
        .iter()
        .any(|ext| lower.ends_with(ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 认领的_markdown_后缀() {
        assert!(is_markdown("a.md"));
        assert!(is_markdown("A.MD"), "后缀大小写要认");
        assert!(is_markdown("b.markdown"));
        assert!(!is_markdown("c.rs"));
        assert!(!is_markdown("d.pd"));
    }

    #[test]
    fn 文件摘要跳过_front_matter_并取两行() {
        let text = "---\ntitle: 元数据\n---\n\n# UNIX®\n\n**厦门市槟榔中学** 2024（12） 李齐\n\n后文";
        let (title, detail) = 取摘要(text);
        assert_eq!(title.as_deref(), Some("UNIX®"));
        assert_eq!(detail.as_deref(), Some("厦门市槟榔中学 2024（12） 李齐"));
    }

    #[test]
    fn 文件树只列_markdown_并且目录在前() {
        let root = std::env::temp_dir().join("nota-tree-test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("zeta")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(root.join("a.md"), "# a").unwrap();
        std::fs::write(root.join("b.png"), "x").unwrap();

        let tree = read_dir_sorted(&root, Path::new(""), 1, 树口径::default()).unwrap();
        let names: Vec<&str> = tree.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, vec!["zeta", "a.md"], "目录在前、只留 md、跳过点开头");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn depth_为_1_时不给子节点() {
        let root = std::env::temp_dir().join("nota-tree-depth");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("d")).unwrap();
        std::fs::write(root.join("d/inner.md"), "# x").unwrap();

        let tree = read_dir_sorted(&root, Path::new(""), 1, 树口径::default()).unwrap();
        assert!(tree[0].children.is_none());

        let tree = read_dir_sorted(&root, Path::new(""), 2, 树口径::default()).unwrap();
        assert_eq!(tree[0].children.as_ref().unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(&root);
    }

    /* ── 树口径：排序 / 过滤 / 隐藏文件（2026-09-28 加）──────────────────── */

    /// 造一棵一次性的临时目录树，跑完删掉。
    ///
    /// ⚠️ 目录名带**测试名**：`read_dir_sorted` 那几条老用例共用一个
    /// `nota-tree-test`，并行跑时互删对方的目录（`cargo test` 默认多线程）。
    /// 新写的这几条一律各用各的名字。
    fn 搭个目录(名: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("nota-tree-{名}"));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn 名们(树: &[TreeNode]) -> Vec<String> {
        树.iter().map(|n| n.name.clone()).collect()
    }

    /// [`口径解析`] 是纯函数，所以"哪一格听谁的"能一条条钉住。
    ///
    /// ⚠️ 逐格回落是**这份口径唯一容易写错的地方**：写成"给了 opts 就整份听
    /// opts"的话，前端只想改一格时会悄悄把另外两格打回默认——症状是"我只换了
    /// 排序，显示隐藏文件那个开关自己关了"。
    #[test]
    fn 口径逐格回落() {
        let 设 = Files {
            tree_sort: TreeSort::Modified,
            tree_filter: FileFilter::All,
            show_hidden: true,
            ..Default::default()
        };

        // ① 什么都不给：三格照设置。
        let 全缺 = 口径解析(None, &设);
        assert_eq!(全缺.sort, TreeSort::Modified);
        assert_eq!(全缺.filter, FileFilter::All);
        assert!(全缺.show_hidden);

        // ② 只给一格：另外两格**照旧听设置**。
        let 只给排序 = 口径解析(
            Some(TreeOptions {
                sort: Some(TreeSort::Name),
                ..Default::default()
            }),
            &设,
        );
        assert_eq!(只给排序.sort, TreeSort::Name);
        assert_eq!(只给排序.filter, FileFilter::All, "没给的那格该照设置走");
        assert!(只给排序.show_hidden, "没给的那格该照设置走");

        // ③ 给 `false` 与"没给"是两回事：`Option<bool>` 存在的意义就在这一格。
        let 显式关掉隐藏 = 口径解析(
            Some(TreeOptions {
                show_hidden: Some(false),
                ..Default::default()
            }),
            &设,
        );
        assert!(!显式关掉隐藏.show_hidden, "显式 false 必须真的关掉");
    }

    /// ⚠️ **时间档：新的在前**（与名字档的方向**相反**，这是刻意的）。
    ///
    /// 拿"写完一份再写下一份"造出时间差，不碰 `File::set_modified`——
    /// 那个 API 要 Rust 1.75，而且各家文件系统的精度不一。两份之间隔 20ms，
    /// ext4 与 tmpfs 都分辨得出来。
    #[test]
    fn 按修改时间排时新的在前() {
        let root = 搭个目录("modified");
        // ⚠️ 文件名的**字母序与时间序必须相反**，否则这条用例证明不了什么：
        // 名字取 `a-老` / `b-新` 时，两种排法给出的答案正好对着来。
        std::fs::write(root.join("a-老.md"), "a").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(root.join("b-新.md"), "b").unwrap();

        let 按名 = read_dir_sorted(&root, Path::new(""), 1, 树口径::default()).unwrap();
        assert_eq!(名们(&按名), vec!["a-老.md", "b-新.md"], "名字档照旧升序");

        let 按时间 = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            树口径 {
                sort: TreeSort::Modified,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(名们(&按时间), vec!["b-新.md", "a-老.md"], "修改时间档：新的在前");

        let _ = std::fs::remove_dir_all(&root);
    }

    /// ⚠️ **目录永远排在文件前面**，时间档也一样。
    ///
    /// 这一条是时间档最容易踩坏的地方：目录的修改时间只在"往里加/删文件"时
    /// 更新，所以它和文件混在一起按时间排的结果是**看着随机**——树是靠缩进
    /// 读的，目录跑到文件后面去，用户会以为那一层没有子目录。
    #[test]
    fn 时间档里目录仍在文件前面() {
        let root = 搭个目录("dirs-first");
        std::fs::create_dir_all(root.join("d")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(root.join("后来的.md"), "x").unwrap();

        let 树 = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            树口径 {
                sort: TreeSort::Modified,
                ..Default::default()
            },
        )
        .unwrap();
        // 目录 `d` 比文件**旧**，按时间排本该在后面——但它必须在前面。
        assert_eq!(名们(&树), vec!["d", "后来的.md"]);

        let _ = std::fs::remove_dir_all(&root);
    }

    /// ⚠️ **`show_hidden` 与"永远跳过"是两回事**（本批接线的核心）。
    ///
    /// 拨开隐藏文件是冲着 `.github` / `.env` 去的；`.git` 里是几千个哈希名，
    /// 露出来就等于这个开关废了——用户拨一次，看到满屏 `objects/`，从此
    /// 再也不碰它。`node_modules` 同理，而且它**不是隐藏目录**，所以它得由
    /// 另一句（与点开头那句分开写的）挡住。
    #[test]
    fn 显示隐藏文件但_git_与_node_modules_永不出现() {
        let root = 搭个目录("hidden");
        std::fs::write(root.join("看得到.md"), "x").unwrap();
        std::fs::write(root.join(".env"), "A=1").unwrap();
        std::fs::create_dir_all(root.join(".github")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();

        let 默认 = read_dir_sorted(&root, Path::new(""), 1, 树口径::default()).unwrap();
        assert_eq!(名们(&默认), vec!["看得到.md"], "默认档连 .env 都不列");

        // ⚠️ 拨开隐藏文件、但**过滤档还是默认的 `Supported`**：`.env` 这时
        // 仍然不列——它不是 markdown。这两个开关是**各自独立**的，混在一起
        // 想会得到"拨了隐藏文件，树里冒出一堆图片"。
        let 只拨隐藏 = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            树口径 {
                show_hidden: true,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(名们(&只拨隐藏), vec![".github", "看得到.md"], "隐藏开了、过滤没开");

        let 拨开 = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            树口径 {
                show_hidden: true,
                filter: FileFilter::All,
                ..Default::default()
            },
        )
        .unwrap();
        let 名 = 名们(&拨开);
        for 该在 in [".env", ".github"] {
            assert!(名.contains(&该在.to_string()), "{该在} 该露出来了：{名:?}");
        }
        for 永不在 in [".git", "node_modules"] {
            assert!(!名.contains(&永不在.to_string()), "{永不在} 永远不该出现：{名:?}");
        }

        let _ = std::fs::remove_dir_all(&root);
    }

    /// ⚠️ **过滤档真的接线了**（在那之前 `read_dir_sorted` 里写死成
    /// `is_markdown(&name)`，设置页那个下拉拨了等于没拨）。
    #[test]
    fn 过滤档_all_时列出非_markdown_文件() {
        let root = 搭个目录("filter");
        std::fs::write(root.join("a.md"), "x").unwrap();
        std::fs::write(root.join("b.png"), "x").unwrap();

        // ⚠️ 同一份目录**跑两种档位再比**，不能写成两句各自断言：那样
        // "两档给出同一个结果"（也就是"根本没接线"）照样能过。
        let 只markdown = read_dir_sorted(&root, Path::new(""), 1, 树口径::default()).unwrap();
        assert_eq!(名们(&只markdown), vec!["a.md"]);

        let 全部 = read_dir_sorted(
            &root,
            Path::new(""),
            1,
            树口径 {
                filter: FileFilter::All,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(名们(&全部), vec!["a.md", "b.png"]);

        let _ = std::fs::remove_dir_all(&root);
    }

    /// ⚠️ **读不动要报 Err，不能是"空目录"**（2026-09-25 改的行为，见函数头那段）。
    ///
    /// 用的是**不存在的目录**而不是 `chmod 000` 的目录：后者在 root 下跑测试时
    /// 权限位根本拦不住（root 照样读得进去），那样这条用例会时灵时不灵。
    /// 不存在是**所有用户下都成立**的读不动。
    #[test]
    fn 目录读不动时报错而不是给空数组() {
        let 没有这个目录 = std::env::temp_dir().join("nota-tree-绝对不存在-20260925");
        let _ = std::fs::remove_dir_all(&没有这个目录);

        let r = read_dir_sorted(&没有这个目录, Path::new(""), 1, 树口径::default());
        assert!(r.is_err(), "读不动必须是 Err——吞成空数组就是 BUG-24");
        assert!(
            r.unwrap_err().to_string().contains("读文件失败"),
            "错误要是那句能给人看的文案"
        );
    }
}
