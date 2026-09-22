//! `nota.git` —— 给插件用的 git 能力。
//!
//! # 为什么是子进程而不是 libgit2
//!
//! 与 Folio 的 `fo-git-run.c` 同一个判断：
//!
//! - **尊重用户的环境**。凭据助手、`~/.gitconfig`、`includeIf`、hook、`core.autocrlf`、
//!   签名密钥——libgit2 对这些要么不支持要么各有一套，用户配好的东西会**静默失效**。
//! - **不用背链接的包袱**。libgit2 是 C 库，交叉编译、静态链接、发行版版本差异
//!   全是持续成本，而我们并不需要"不用装 git 也能用"。
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
}
