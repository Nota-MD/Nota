//! `nota.git` —— 给插件用的 git 能力。
//!
//! # 为什么是子进程而不是 libgit2
//!
//! 与 Folio 的 `fo-git-run.c` 同一个判断：
//!
//! - **尊重用户的环境**。凭据助手、`~/.gitconfig`、`includeIf`、hook、`core.autocrlf`、
//!   签名密钥——libgit2 对这些要么不支持要么各有一套，用户配好的东西会**静默失效**。
//! - **不用背链接的包袱**。libgit2 是 C 库，交叉编译、静态链接、发行版版本差异
//!   全是持续成本，而"不用装 git 也能用"并不是这里要的东西。
//! - **行为与用户敲命令行一致**。出问题时用户能在终端里原样复现，这比什么都值钱。
//!
//! 代价：没装 git 就不能用（报错里说清楚）、每个操作一次进程开销（人对 git 的操作
//! 频率下无所谓）。
//!
//! # 围栏
//!
//! 能力叫 `process.git`，意思是**只能起 git 这一个进程**，不是通用 subprocess。
//! 除此之外还有两条：
//!
//! 1. **工作目录锁死**在工作区根（没开工作区就退到活动文档所在目录）；
//! 2. **拒绝会重定向目标目录的那几个参数**（`-C` / `--git-dir` / `--work-tree`）。
//!    只锁 cwd 是不够的——`git -C /elsewhere` 一句话就把 cwd 绕过去了。
//!
//! ⚠️ **已知边界（不是漏洞，是记录）**：`git config --global` 这类会写用户全局配置的
//! 子命令挡不住，因为参数层面分不清它跟合法的 `git config --get`。这个能力因此是
//! "能对用户的机器做 git 能做的事"，装插件时该按这个尺度信任。见 `docs/11` 能力表。
//!
//! # 路径不转义（`-c core.quotePath=false`）
//!
//! 见 `run_git` 里那一行。一句话：默认开着转义时，中文文件名在 diff 里会变成
//! `"\344\270\255…"`，而插件是**把 git 的输出直接画给用户看的**。
//!
//! # 两种失败要分开（踩过一次）
//!
//! 这里有两个**性质完全不同**的失败通道，混起来会出真事：
//!
//! - **调用错误**（传了 `-C`、参数不是字符串）→ **抛 Lua 错误**。这是插件写错了，
//!   必须让作者看见，不能让它伪装成一次正常的 git 运行。
//! - **环境不具备**（没开工作区也没活动文档、没装 git）→ **正常返回一张结果表**，
//!   把原因写在 `stderr` 里、`code` 非零。这与 `git status` 在不存在的仓库里失败
//!   是同一类事，插件的处理方式也该是同一种。
//!
//! 踩到的正是第二条：`working_dir()` 曾经对"没有工作目录"直接 `Err`，而 git 插件的
//! `on_load` 结尾要刷一次状态——于是**"用户还没打开文件夹"变成了"这个插件加载失败"**，
//! 侧栏里赫然一行「失败」，而插件本身一个字都没写错。见 `docs/07` 第一轮 BUG-2。

use std::path::PathBuf;
use std::process::Command;

use mlua::{Lua, Table, Value};

use super::{lua_err, mlua_to_nota};
use crate::error::{NotaError, Result as NotaResult};
use crate::lua::HostContext;

/// 会把"在哪个仓库上操作"重定向掉的参数。cwd 锁不住了，只能拒。
const 禁止的参数: &[&str] = &["-C", "--git-dir", "--work-tree", "--namespace"];

pub fn build(lua: &Lua, ctx: &HostContext) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let ctx2 = ctx.clone();
    let run = lua
        .create_function(move |lua, args: Table| -> mlua::Result<Table> {
            let argv = table_to_argv(&args)?;
            // 环境不具备就走结果表，不抛错——见文件头「两种失败要分开」。
            let cwd = match working_dir(&ctx2) {
                Ok(cwd) => cwd,
                Err(msg) => return 没有工作目录的结果(lua, "stdout", msg),
            };
            let out = run_git(&cwd, &argv).map_err(lua_err)?;

            let result = lua.create_table()?;
            result.set("code", out.code)?;
            result.set("stdout", out.stdout)?;
            result.set("stderr", out.stderr)?;
            result.set("ok", out.code == 0)?;
            Ok(result)
        })
        .map_err(mlua_to_nota)?;
    t.set("run", run).map_err(mlua_to_nota)?;

    // 把 `status` 那份原始输出切成一张能直接用的表。
    //
    // ⚠️ **它是纯的**（一段文本进、一张表出，不碰 git 也不碰磁盘），
    // 所以不需要额外能力——判据与 `nota.diff` 那张表一致。
    let parse_status = lua
        .create_function(move |lua, raw: String| -> mlua::Result<Table> {
            let (branch, entries) = 解析状态(&raw);

            let t = lua.create_table()?;
            t.set("branch", branch)?;
            let list = lua.create_table()?;
            for (i, e) in entries.into_iter().enumerate() {
                let item = lua.create_table()?;
                item.set("index", e.index)?;
                item.set("work", e.work)?;
                item.set("path", e.path)?;
                // ⚠️ 只有重命名/复制才有原路径：**没有就不放这个键**（Lua 里
                // 读不到的键是 `nil`，插件那边正好用 `e.orig and …` 判它）。
                if let Some(orig) = e.orig {
                    item.set("orig", orig)?;
                }
                item.set("state", e.state)?;
                // ⚠️ 下标从 **1** 起：Lua 的数组下标从 1 起（`ipairs` / `#` 都按这个算）。
                list.set(i + 1, item)?;
            }
            t.set("entries", list)?;
            Ok(t)
        })
        .map_err(mlua_to_nota)?;
    t.set("parse_status", parse_status).map_err(mlua_to_nota)?;

    // 提交树：`git log --graph` 那一份输出 → 一行行。
    //
    // ⚠️ **格式串和解析在同一处**（下面 `图格式`）：它们是一对，分开写就会漂——
    // 改格式忘了改解析，症状是"树画出来了，但每一行的字段都是错的"。
    let ctx2 = ctx.clone();
    let log_graph = lua
        .create_function(move |lua, n: Option<i64>| -> mlua::Result<Table> {
            let cwd = match working_dir(&ctx2) {
                Ok(cwd) => cwd,
                Err(msg) => return 没有工作目录的结果(lua, "rows", msg),
            };
            // 上限**夹在宿主这边**：`-n` 要的是个十进制串，插件给个负数或天文数字
            // 都会变成一条 git 的报错（或者一次读几十万行）。
            let n = n.unwrap_or(60).clamp(1, 200).to_string();
            let out = run_git(
                &cwd,
                &[
                    "log",
                    "--graph",
                    "--date-order",
                    "--no-color",
                    "-n",
                    &n,
                    图格式,
                ],
            )
            .map_err(lua_err)?;

            let t = lua.create_table()?;
            t.set("code", out.code)?;
            t.set("ok", out.code == 0)?;
            t.set("stderr", out.stderr)?;
            let rows = lua.create_table()?;
            for (i, row) in 解析图日志(&out.stdout).into_iter().enumerate() {
                let item = lua.create_table()?;
                item.set("art", row.art)?;
                if let Some(hash) = row.hash {
                    item.set("hash", hash)?;
                    item.set("parent", row.parent)?;
                    item.set("refs", row.refs)?;
                    item.set("subject", row.subject)?;
                }
                rows.set(i + 1, item)?;
            }
            t.set("rows", rows)?;
            Ok(t)
        })
        .map_err(mlua_to_nota)?;
    t.set("log_graph", log_graph).map_err(mlua_to_nota)?;

    // 几个**只读**的顺手封装。插件当然能用 run 自己拼，但有这几个，
    // git 插件那边的 Lua 会短一大截，也少一堆引号转义的坑。
    let ctx2 = ctx.clone();
    let status = lua
        .create_function(move |lua, ()| -> mlua::Result<Table> {
            let cwd = match working_dir(&ctx2) {
                Ok(cwd) => cwd,
                Err(msg) => return 没有工作目录的结果(lua, "raw", msg),
            };
            // --porcelain=v1 -z 是给程序读的稳定格式，不做颜色、不做分页。
            let out = run_git(&cwd, &["status", "--porcelain=v1", "-z", "-b"])
                .map_err(lua_err)?;
            let result = lua.create_table()?;
            result.set("code", out.code)?;
            result.set("raw", out.stdout)?;
            result.set("stderr", out.stderr)?;
            Ok(result)
        })
        .map_err(mlua_to_nota)?;
    t.set("status", status).map_err(mlua_to_nota)?;

    let ctx2 = ctx.clone();
    let diff = lua
        .create_function(move |lua, staged: Option<bool>| -> mlua::Result<Table> {
            let cwd = match working_dir(&ctx2) {
                Ok(cwd) => cwd,
                Err(msg) => return 没有工作目录的结果(lua, "text", msg),
            };
            let mut argv = vec!["diff", "--no-color"];
            if staged.unwrap_or(false) {
                argv.push("--cached");
            }
            let out = run_git(&cwd, &argv).map_err(lua_err)?;
            let result = lua.create_table()?;
            result.set("code", out.code)?;
            result.set("text", out.stdout)?;
            result.set("stderr", out.stderr)?;
            Ok(result)
        })
        .map_err(mlua_to_nota)?;
    t.set("diff", diff).map_err(mlua_to_nota)?;

    let ctx2 = ctx.clone();
    let repo_root = lua
        .create_function(move |_, ()| {
            let Ok(cwd) = working_dir(&ctx2) else {
                // 不知道在哪儿跑 → "不知道仓库在哪"，返回 nil 而不是抛错。
                return Ok(None);
            };
            let out = run_git(&cwd, &["rev-parse", "--show-toplevel"]).map_err(lua_err)?;
            if out.code != 0 {
                return Ok(None);
            }
            Ok(Some(out.stdout.trim().to_owned()))
        })
        .map_err(mlua_to_nota)?;
    t.set("repo_root", repo_root).map_err(mlua_to_nota)?;

    Ok(t)
}

/// 「不知道该在哪个目录跑 git」时给插件的那张结果表。
///
/// `text_key` 是这一支自己那个取文本的键名（`status` 是 `raw`、`diff` 是 `text`、
/// `run` 是 `stdout`）——**空串要给全**：插件拿到的表长得跟成功时一样，
/// 少一个键会让 Lua 那边在 `..` 拼接时炸在"attempt to concatenate a nil value"上，
/// 那才是把环境问题伪装成插件 bug 的做法。
fn 没有工作目录的结果(
    lua: &Lua,
    text_key: &str,
    msg: String,
) -> mlua::Result<Table> {
    let result = lua.create_table()?;
    result.set("code", -1)?;
    result.set(text_key, "")?;
    result.set("stderr", msg)?;
    result.set("ok", false)?;
    Ok(result)
}

#[derive(Debug)]
struct GitOutput {
    code: i32,
    stdout: String,
    stderr: String,
}

/// 起一个 `git` 进程。**这是全仓唯一一处起子进程的地方**——加别的之前先读 `docs/11`
/// 的能力表，别顺手把 `process.git` 变成 `process.any`。
/// 泛型收参数：内部调用点写 `&["status"]`（`&[&str]`），插件来的那条路给
/// `&[String]`，两边都不用为了对齐类型多转一次。
fn run_git<S: AsRef<str>>(cwd: &PathBuf, argv: &[S]) -> NotaResult<GitOutput> {
    for arg in argv {
        let arg = arg.as_ref();
        if 禁止的参数.contains(&arg) {
            return Err(NotaError::other(format!(
                "nota.git 不接受 `{arg}`：它会把操作目标改到工作区之外"
            )));
        }
        // `--git-dir=/x` 这种等号写法同样要挡。
        if let Some((head, _)) = arg.split_once('=') {
            if 禁止的参数.contains(&head) {
                return Err(NotaError::other(format!(
                    "nota.git 不接受 `{head}=…`：它会把操作目标改到工作区之外"
                )));
            }
        }
    }

    let out = Command::new("git")
        // ⚠️ `core.quotePath=false` **是给界面用的，不是给 git 用的**：
        // 默认开着的时候，一个叫 `中文.md` 的文件在 diff 里写成
        // `"\344\270\255\346\226\207.md"`，而这串转义会原样画在插件面板上
        //（git 插件 2026-09-25 加的差异预览就是这么来的）。顺带：带引号的路径
        // 连 `b/` 前缀都掐不掉（引号在 `b/` 外面），解析那边会认不出文件名。
        // 关掉它，路径就是路径。`status -z` 本来就不转义，所以这条是**只增不改**。
        .args(["-c", "core.quotePath=false"])
        .args(argv.iter().map(|a| a.as_ref()))
        .current_dir(cwd)
        // 不要让 git 弹交互式编辑器 / 分页器 / 凭据提示把界面卡死。
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_PAGER", "cat")
        .env("GIT_EDITOR", "true")
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                NotaError::other("找不到 `git` 命令，请先安装 git")
            } else {
                NotaError::other(format!("起 git 进程失败：{e}"))
            }
        })?;

    Ok(GitOutput {
        code: out.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

/// 从共享状态里取两个候选目录，交给 `挑工作目录` 裁决。
fn working_dir(ctx: &HostContext) -> Result<PathBuf, String> {
    let workspace = ctx.workspace.lock().unwrap().clone();
    let doc_dir = ctx
        .documents
        .lock()
        .unwrap()
        .active()
        .and_then(|d| d.path.as_ref())
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf());
    挑工作目录(workspace, doc_dir)
}

/// 工作目录的**纯裁决**：优先工作区根，没开工作区就退到活动文档所在目录。
///
/// 与 `fs.rs` 的 `resolve_in()` 同一个理由抽成纯函数：这里是唯一说得出
/// "插件为什么会拿到一张失败的结果表"的地方，得有单元测试钉住它
/// ——**尤其是第三个分支**（两个都没有），那条正是 BUG-2 的现场。
fn 挑工作目录(
    workspace: Option<PathBuf>,
    doc_dir: Option<PathBuf>,
) -> Result<PathBuf, String> {
    workspace.or(doc_dir).ok_or_else(|| {
        "没有工作区、当前文档也没存过盘，不知道要在哪个目录跑 git".to_owned()
    })
}

/// Lua 数组 → `Vec<&str>`。**参数只收字符串**——收数字/表会让拼命令行的行为
/// 变得难预测，而这是安全边界所在，宁可严一点。
fn table_to_argv(args: &Table) -> mlua::Result<Vec<String>> {
    let mut out = Vec::new();
    for pair in args.clone().sequence_values::<Value>() {
        match pair? {
            Value::String(s) => out.push(s.to_string_lossy().to_string()),
            other => {
                return Err(mlua::Error::RuntimeError(format!(
                    "nota.git.run 的参数只能是字符串，收到 {}",
                    other.type_name()
                )))
            }
        }
    }
    Ok(out)
}

// ── `git status` 的解析（`nota.git.parse_status`）─────────────────────────
//
// ⚠️ 这一段**从 git 插件的 `main.lua` 搬过来的**（2026-09-26）。搬的理由有两条，
// 每条都实在：
//
// 1. **在同一处**：`nota.diff.parse_unified` 已经把"diff 这份格式怎么读"收在宿主里，
//    而 `status` 那份同样是**给人看之前必须读准**的格式（错一位整张列表就串行）。
//    两份解析挨着放，改格式的人一眼看得到另一份。
// 2. **能测**：这份格式里"NUL 而不是换行""重命名多跟一个路径""分支名后面还挂着
//    `[ahead 1]`"这些事，在插件面板上靠肉眼是试不完的；放进 Rust 就有用例按得住。
//    （顺带：插件的 `main.lua` 离 1000 行上限只剩几个字节，见 `docs/09`。）

/// 一条改动。
#[derive(Debug, PartialEq)]
struct 改动条目 {
    /// 暂存区的状态字母。
    index: String,
    /// 工作区的状态字母。
    work: String,
    path: String,
    /// 重命名/复制时多出来的**原路径**。
    orig: Option<String>,
    /// 归类用的一个词：`untracked` / `staged` / `staged-dirty` / `modified`。
    ///
    /// ⚠️ **只归类，不措辞。** 那句话是插件写的（要过插件的 `lang/zh-CN.toml` 翻），
    /// 而"哪两个字母算哪一类"是 git 的格式知识。混起来的话，往后每加一种状态
    /// 都得同时改插件和译文——而分类本身一个字都不用动。
    state: &'static str,
}

/// `git status --porcelain=v1 -z -b` 的输出 → `(分支, 一堆改动)`。
///
/// `-z` 的格式（**注意 NUL 而不是换行**，这是为了路径里能有空格和换行）：
/// ```text
/// "## 分支...上游 [ahead 1]" NUL "XY 路径" NUL ["XY 新路径" NUL "旧路径" NUL]
/// ```
fn 解析状态(raw: &str) -> (String, Vec<改动条目>) {
    let parts: Vec<&str> = raw.split('\0').collect();

    let mut i = 0;
    let mut branch = String::new();
    // ⚠️ 判据用 `strip_prefix` 而不是按字节切 `[3..]`：分支名可以是中文，
    // 按字节切会在字符中间断开并**炸掉整次解析**（Rust 的 `&s[3..]` 会 panic）。
    if let Some(first) = parts.first() {
        if let Some(rest) = first.strip_prefix("##") {
            branch = rest.trim_start().to_owned();
            i = 1;
        }
    }

    let mut out = Vec::new();
    while i < parts.len() {
        let line = parts[i];
        // 空段是尾随的 NUL、或者重命名吃掉两段之后剩下的空档。
        if line.is_empty() {
            i += 1;
            continue;
        }
        // ⚠️ 全部用 `get(..)` 取字节：拿到 `None` 就当空格 / 空路径。
        // 直接下标会在畸形输入上 panic，而"某一行看不懂"不该让整张列表消失。
        let index = line.get(0..1).unwrap_or(" ").to_owned();
        let work = line.get(1..2).unwrap_or(" ").to_owned();
        let path = line.get(3..).unwrap_or("").to_owned();
        let st = format!("{index}{work}");

        // 重命名/复制（X 或 Y 是 R/C）**多跟一个路径**，不处理它整个列表会错位。
        let mut orig = None;
        if st.contains('R') || st.contains('C') {
            orig = parts.get(i + 1).map(|s| (*s).to_owned());
            i += 2;
        } else {
            i += 1;
        }

        out.push(改动条目 {
            state: 归类(&index, &work),
            index,
            work,
            path,
            orig,
        });
    }

    (branch, out)
}

/// 两个状态字母 → 一个词。
///
/// ⚠️ 这几个词是**接口**（前端按它挑颜色、插件按它挑那句人话），
/// 三处必须说同一套：这里、`plugins/git/main.lua` 的 `STATES`、
/// 以及 `docs/13` 的 §nota.git。改一处就要一起改。
fn 归类(index: &str, work: &str) -> &'static str {
    if index == "?" && work == "?" {
        "untracked"
    } else if index != " " && work != " " {
        "staged-dirty"
    } else if index != " " {
        "staged"
    } else {
        "modified"
    }
}

// ── 提交树（`nota.git.log_graph`）─────────────────────────────────────────
//
// 与 `解析状态` 同一条判据（那段顶上写着）：**"画给用户看之前必须读准的格式"
// 归宿主，措辞归插件**。这里管"哪一截是图线、哪一个是哈希、合并提交的父是哪个"，
// 插件管"这一行该说什么话、点了跑哪条命令"。

/// 让 `git log` 把每一行切成"图线 + 字段"的格式串。
///
/// ⚠️ **以 `%x1f` 开头**（ASCII 的 Unit Separator）：git 把图线原样打出来，
/// 之后紧跟格式串的内容，所以"第一个 `\31` 之前"就是那截图线。
/// 正文里不可能出现 `\31`，所以这个切法是可靠的（这也是选它的理由）。
/// 字段：`%h` 短哈希 / `%p` 父哈希（合并提交有多个，空格隔开）/ `%d` 分支标签 / `%s` 标题。
///
/// ⚠️ `--date-order`（在调用处）**是写出来的**：`--graph` 有自己的默认排序，而不同
/// git 版本对"并行分支上谁先"给的结果会变；按时间排更接近"我刚做了什么"的读法。
const 图格式: &str = "--format=%x1f%h%x1f%p%x1f%d%x1f%s";

/// 提交树上的一行。
#[derive(Debug, PartialEq)]
struct 图行 {
    /// 那截图线，**原样保留**（含 git 用来对齐的尾随空格）。
    art: String,
    /// 提交行才有。`None` = 纯连接线行（`|\`、`|/` 那种），它上面没有提交。
    hash: Option<String>,
    /// **第一个父**。合并提交有多个父，这里只取第一个（主干那一侧）——
    /// 另一侧要在界面上比，就走"选中两个提交"那条路。
    parent: String,
    /// 分支标签，**两头的括号和空格已经去掉了**（`%d` 给的是 ` (HEAD -> main)`）。
    refs: String,
    subject: String,
}

/// `git log --graph` 的输出 → 一行行。
fn 解析图日志(stdout: &str) -> Vec<图行> {
    let mut out = Vec::new();
    for line in stdout.split('\n') {
        // ⚠️ 空行跳过：末尾那个换行会切出一个空段，而它既不是提交行也不是图线。
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\u{1f}').collect();
        // 纯连接线行里没有 `\31`（字段少于 5 段），整行都是图线。
        // ⚠️ 字段切不出 5 段时也走这条路（格式串和这边对不上，理论上不会）：
        // 当图线画总比把整棵树弄没了好——那样用户看到的是一片空白，什么线索都没有。
        let hash = parts.get(1).copied().unwrap_or("");
        if parts.len() < 5 || hash.is_empty() {
            out.push(图行 {
                art: line.to_owned(),
                hash: None,
                parent: String::new(),
                refs: String::new(),
                subject: String::new(),
            });
            continue;
        }
        out.push(图行 {
            art: parts[0].to_owned(),
            hash: Some(hash.to_owned()),
            parent: parts[2].split_whitespace().next().unwrap_or("").to_owned(),
            refs: parts[3]
                .trim()
                .trim_start_matches('(')
                .trim_end_matches(')')
                .trim()
                .to_owned(),
            subject: parts[4].to_owned(),
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 围栏拒绝时，错误里一定带"不接受"三个字。
    fn 被围栏拒了(r: &NotaResult<GitOutput>) -> bool {
        matches!(r, Err(e) if e.to_string().contains("不接受"))
    }

    #[test]
    fn 重定向目标目录的参数要拒() {
        let cwd = std::env::temp_dir();
        let r = run_git(&cwd, &["-C", "/tmp", "status"]);
        assert!(被围栏拒了(&r), "`-C` 应当被围栏拒掉");
    }

    #[test]
    fn 等号写法的重定向同样要拒() {
        let cwd = std::env::temp_dir();
        assert!(被围栏拒了(&run_git(&cwd, &["--git-dir=/tmp/x", "status"])));
        assert!(被围栏拒了(&run_git(&cwd, &["--work-tree=/tmp/x", "status"])));
    }

    #[test]
    fn 普通参数不该被围栏误伤() {
        // temp_dir 多半不是 git 仓库，所以 git 自己可能失败——这没关系，
        // 这条只确认**围栏没拦**。围栏误伤的代价是插件莫名其妙用不了。
        let cwd = std::env::temp_dir();
        let r = run_git(&cwd, &["status", "--porcelain=v1"]);
        assert!(!被围栏拒了(&r), "普通参数被围栏误伤了：{r:?}");
    }

    #[test]
    fn 开了工作区就用工作区() {
        let got = 挑工作目录(Some(PathBuf::from("/工作区")), Some(PathBuf::from("/文稿")));
        assert_eq!(got.unwrap(), PathBuf::from("/工作区"));
    }

    #[test]
    fn 没工作区就退到文档所在目录() {
        let got = 挑工作目录(None, Some(PathBuf::from("/文稿")));
        assert_eq!(got.unwrap(), PathBuf::from("/文稿"));
    }

    #[test]
    fn 两个都没有是环境不具备不是插件坏() {
        // BUG-2 的现场：这条以前是抛错的，而 git 插件的 on_load 结尾要刷一次状态，
        // 于是"用户还没打开文件夹"被显示成"这个插件加载失败"。
        // 它必须是**函数值**（Err 的字符串），由调用方折成一张 code≠0 的结果表。
        let err = 挑工作目录(None, None).unwrap_err();
        assert!(err.contains("不知道要在哪个目录跑 git"), "实际是：{err}");
    }

    // ── `nota.git.parse_status` ───────────────────────────────────────────

    /// 造一份 `-z` 输出：段与段之间是 NUL，不是换行。
    fn 状态(段: &[&str]) -> String {
        段.join("\0")
    }

    #[test]
    fn 空输出是空列表而不是一句报错() {
        // "还没 git init"与"仓库里干干净净"都会走到这儿，两者都**不是错误**。
        assert_eq!(解析状态(""), (String::new(), Vec::new()));
    }

    #[test]
    fn 分支行连上游和_ahead_一起拿出来() {
        let (branch, entries) = 解析状态(&状态(&["## main...origin/main [ahead 1]"]));
        assert_eq!(branch, "main...origin/main [ahead 1]");
        assert!(entries.is_empty());
    }

    #[test]
    fn 没有分支段时第一条改动不能被吃掉() {
        // `status` 不带 `-b` 时第一段就是条目。曾经按"第一段一定是分支"写，
        // 结果列表里第一条改动永远看不见——而列表看着是"对的，只是少了一条"。
        let (branch, entries) = 解析状态(&状态(&[" M 甲.md", "?? 乙.md"]));
        assert_eq!(branch, "");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "甲.md");
    }

    #[test]
    fn 中文路径原样出来() {
        let (_, entries) = 解析状态(&状态(&["## main", " M 中文 文件名.md"]));
        assert_eq!(entries[0].path, "中文 文件名.md");
    }

    #[test]
    fn 四种状态各自归对类() {
        let (_, e) = 解析状态(&状态(&[
            "## main",
            "?? 新.md",   // 未跟踪
            "M  a.md",    // 只动了暂存区
            "MM b.md",    // 两边都动过
            " M c.md",    // 只动了工作区
        ]));
        let got: Vec<&str> = e.iter().map(|x| x.state).collect();
        assert_eq!(got, ["untracked", "staged", "staged-dirty", "modified"]);
    }

    #[test]
    fn 重命名要多吃掉一段原路径() {
        // ⚠️ 这一条是整份解析里最容易错的地方：不吃掉那一段，
        // 后面每一条改动都会**串到上一条的路径上**（列表长得像对的，内容全错位）。
        let (_, e) = 解析状态(&状态(&["## main", "R  b.md", "a.md", " M c.md"]));
        assert_eq!(e.len(), 2);
        assert_eq!(e[0].path, "b.md");
        assert_eq!(e[0].orig.as_deref(), Some("a.md"));
        assert_eq!(e[1].path, "c.md");
        assert_eq!(e[1].orig, None, "不是重命名的不该有原路径");
    }

    #[test]
    // ⚠️ 名字里那个 `c` 是**小写**的：Rust 的 `non_snake_case` 会把大写的
    // 标识符当成类型报一条 warning（`cargo test --lib` 会打出来）。这一条是
    // 2026-10-11 顺手清掉的——它跟拼写那一批无关，只是每次编译都在那儿响。
    fn 复制的_c_也算多一段() {
        let (_, e) = 解析状态(&状态(&["## main", "C  b.md", "a.md"]));
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].orig.as_deref(), Some("a.md"));
    }

    #[test]
    fn 条目少一段也不会炸() {
        // 畸形输入（git 换过格式、或者我们切错了）该退化成"某一条看不懂"，
        // 不该 panic 到把整次状态刷新带走。
        let (_, e) = 解析状态(&状态(&["## main", "R  b.md"]));
        assert_eq!(e.len(), 1);
        assert_eq!(e[0].orig, None);
    }

    // ── `nota.git.log_graph` ──────────────────────────────────────────────

    /// 一份**真的** git 输出：从一个含 `--no-ff` 合并的夹具仓库里抓的（2026-09-26）。
    ///
    /// ⚠️ 用真输出而不是手编的：这份格式里最容易错的恰恰是**图线上的对齐空格**
    ///（`*   ` 与 `* ` 不是一个东西，写错了整棵树会歪）和"纯连接线行根本没有字段"。
    const 真日志: &str = concat!(
        "*   \u{1f}f40c61c\u{1f}d9d8ce9 1583864\u{1f} (HEAD -> main)\u{1f}合并支线\n",
        "|\\  \n",
        "* | \u{1f}d9d8ce9\u{1f}a2def45\u{1f}\u{1f}主线往前走\n",
        "| * \u{1f}1583864\u{1f}32b98f1\u{1f} (支线)\u{1f}支线上再改一处\n",
        "| * \u{1f}32b98f1\u{1f}a2def45\u{1f}\u{1f}支线上加一份 b.md\n",
        "|/  \n",
        "* \u{1f}a2def45\u{1f}0a703e9\u{1f}\u{1f}补一段\n",
        "* \u{1f}0a703e9\u{1f}\u{1f}\u{1f}第一版：a.md\n",
    );

    #[test]
    fn 图日志切得出图线与字段() {
        let rows = 解析图日志(真日志);
        assert_eq!(rows.len(), 8, "6 个提交 + 2 条连接线");

        let first = &rows[0];
        assert_eq!(first.art, "*   ", "图线上的对齐空格要原样留住");
        assert_eq!(first.hash.as_deref(), Some("f40c61c"));
        assert_eq!(first.parent, "d9d8ce9", "合并提交只取**第一个**父（主干那侧）");
        assert_eq!(first.refs, "HEAD -> main", "两头的括号和空格要去掉");
        assert_eq!(first.subject, "合并支线");
    }

    #[test]
    fn 纯连接线行没有提交但图线留着() {
        let rows = 解析图日志(真日志);
        assert_eq!(rows[1].hash, None);
        assert_eq!(rows[1].art, "|\\  ");
        assert_eq!(rows[5].hash, None);
        assert_eq!(rows[5].art, "|/  ");
    }

    #[test]
    fn 根提交的父是空串而不是缺字段() {
        // ⚠️ 插件靠 `parent == ""` 认"这是第一次提交"（那条路要走 `git show`）。
        // 换成 `None`/缺字段的话，它会算成 `git diff 空 提交`——命令是错的，
        // 但结果看着像对的（"好像没改动"），这种错最难发现。
        let rows = 解析图日志(真日志);
        let root = &rows[7];
        assert_eq!(root.hash.as_deref(), Some("0a703e9"));
        assert_eq!(root.parent, "");
        assert_eq!(root.refs, "");
    }

    #[test]
    fn 没有分支标签的提交_refs_是空串() {
        let rows = 解析图日志(真日志);
        assert_eq!(rows[2].refs, "");
        assert_eq!(rows[2].subject, "主线往前走");
        assert_eq!(rows[3].refs, "支线");
    }

    #[test]
    fn 空输出和尾随换行都不会多出一行() {
        // ⚠️ `split('\n')` 会把末尾那个换行切出一个空段：不跳过它，树的最下面
        // 就挂一条空白行（而它一样能点）。
        assert!(解析图日志("").is_empty());
        assert_eq!(解析图日志("* \u{1f}abc\u{1f}\u{1f}\u{1f}标题\n").len(), 1);
    }
}
