//! 起外部进程那几件小事：**怎么拆一条命令行、怎么按进程组收尸、怎么带超时地跑一次**。
//!
//! 2026-09-25 独立成模块。判据是**依赖方向**：好几个调用方要用同样这三件，
//! 而让它们互相 `use` 对方是错的——两个互不相干的功能会因此长期绑在一起，
//! 读代码的人也会以为"要干 A 得先把 B 装上"。
//!
//! ⚠️ 这里**只许放最通用的一层**：不许出现任何一个具体功能的专属概念。
//! 一出现就说明它该待在调用方那边。
//!
//! # 为什么统一在这里杀**进程组**而不是那个 child
//!
//! 实测（一条 `sh` → `npm exec` → `node` 的三层调用）：只杀最上面那层的话，
//! 底下真正在干活的会留下来变成孤儿进程，而且**占着端口**。
//! 所以凡是自己起进程的地方一律 `process_group(0)` + 超时杀组。

use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

/// 把"一行命令"拆成程序名 + 参数。
///
/// ⚠️ 只按空白分词，**不认引号**——这是个调试旋钮（`NOTA_*_CMD` 那类），够用；
/// 真有带空格的路径，自己写个包一层的脚本。⚠️ 探测和真正起进程**走的就是这一个拆法**：
/// 两边拆法不同，面板就会替一条根本跑不起来的命令打包票。
pub(crate) fn split_command(cmd: &str) -> Option<(String, Vec<String>)> {
    let mut parts = cmd.split_whitespace();
    let program = parts.next()?;
    Some((program.to_string(), parts.map(str::to_string).collect()))
}

/// 现在该用哪条命令：调试旋钮（环境变量）优先，其次默认值。
pub(crate) fn command_or_default(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

/// 给**整个进程组**发 TERM（负号 = 发给组；组号就是组长的 pid）。
///
/// ⚠️ 只发给组**不负责收尸**：`wait` 由起了这个进程的那一侧做（这里连 child 都没有）。
pub(crate) fn kill_group(pid: u32) {
    let _ = Command::new(kill_program())
        .args(kill_args(pid))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(unix)]
fn kill_program() -> &'static str {
    "kill"
}

/// Unix：`kill -TERM -<pid>`（负号 = 整个进程组）。
#[cfg(unix)]
fn kill_args(pid: u32) -> Vec<String> {
    vec!["-TERM".to_string(), format!("-{pid}")]
}

#[cfg(windows)]
fn kill_program() -> &'static str {
    "taskkill"
}

/// Windows：`taskkill /T /F /PID <pid>`。`/T` 就是"连子进程一起"。
#[cfg(windows)]
fn kill_args(pid: u32) -> Vec<String> {
    vec![
        "/T".to_string(),
        "/F".to_string(),
        "/PID".to_string(),
        pid.to_string(),
    ]
}

/// 跑一次外部命令的选项。**超时必须给**——`Child::wait` 没有时限，而任何外部程序
/// 都可能挂住；挂住的后果是界面上那个面板一直转。
pub(crate) struct RunOpts {
    /// 在哪个目录里跑。`None` = 继承本进程的。
    pub cwd: Option<PathBuf>,
    /// 额外塞给它的环境变量。
    pub envs: Vec<(String, String)>,
    /// 从标准输入喂给它的内容。`None` = `/dev/null`。
    pub stdin: Option<String>,
    pub timeout: Duration,
}

impl RunOpts {
    pub(crate) fn timeout(timeout: Duration) -> Self {
        Self {
            cwd: None,
            envs: Vec::new(),
            stdin: None,
            timeout,
        }
    }

    pub(crate) fn cwd(mut self, dir: impl Into<PathBuf>) -> Self {
        self.cwd = Some(dir.into());
        self
    }

    pub(crate) fn env(mut self, key: &str, value: &str) -> Self {
        self.envs.push((key.to_string(), value.to_string()));
        self
    }

    pub(crate) fn stdin(mut self, text: impl Into<String>) -> Self {
        self.stdin = Some(text.into());
        self
    }
}

/// 起进程，**碰上 `ETXTBSY` 就等一小下再试**（最多四下）。
///
/// ⚠️ 这不是在掩错误，是因为 `ETXTBSY`（"Text file busy"）**本来就是个暂时状态**：
/// 它说的是"这个文件此刻正被某个进程以可写方式打开"。可能是编辑器正在存那个包装
/// 脚本、包管理器正在装它，也可能是下面这条——2026-09-25 为了查"测试随机报
/// Text file busy"专门查出来的：
///
/// **`fork` 会把整个 fd 表复制一份给孩子**，而 close-on-exec 要等**那个孩子自己
/// `exec` 的那一刻**才生效——在那之前，它手里攥着我们早先写脚本时那个可写 fd 的
/// 副本。于是"我们 write 完 → close → chmod → spawn"这条路上，只要**另一条线程**
/// 在我们 write 的那一刻恰好 `fork` 了一次，那个孩子就能让我们的 `execve` 吃
/// `ETXTBSY`，它自己的 `exec` 排在前面还是后面全看调度器。测试天生是多线程的、
/// 每条线程又都在起进程，所以撞得上；实测过：四条线程各跑 150 轮，不重试
/// 时错 13~34 次，等一下就好了。
///
/// ⚠️ 真错误一次都不会重试：权限不对、格式不对、目录不存在报的都是别的 errno。
/// 重试次数和间隔取小值（5 + 20 + 60 毫秒）——真被长期占着（用户拿编辑器一直开着
/// 那个脚本不改），等一下之后照样如实报错。
pub(crate) fn spawn_retrying(command: &mut Command) -> std::io::Result<Child> {
    /// 第 n 次失败之后等多久（前三次各等一下，第四次失败就认了）。
    const 等: [Duration; 3] = [
        Duration::from_millis(5),
        Duration::from_millis(20),
        Duration::from_millis(60),
    ];
    let mut 第几次 = 0;
    loop {
        // ⚠️ `Command` 可以反复 `spawn`（标准库明确允许），所以不用重建。
        match command.spawn() {
            Ok(child) => return Ok(child),
            Err(e) if 文件正被写(&e) && 第几次 < 等.len() => {
                std::thread::sleep(等[第几次]);
                第几次 += 1;
            }
            Err(e) => return Err(e),
        }
    }
}

/// 是不是 `ETXTBSY`。
///
/// ⚠️ 判 errno 而不是 `std::io::ErrorKind::ExecutableFileBusy`：那个字面量在标准库
/// 里还是 unstable 的（`io_error_more`），稳定版用不了。`26` 是 Linux 和 macOS
/// 上同一个值；Windows 那边没有这个概念（那边 `26` 是别的意思，所以整个判断
/// 只在 unix 上生效）。
#[cfg(unix)]
fn 文件正被写(e: &std::io::Error) -> bool {
    e.raw_os_error() == Some(26)
}

#[cfg(not(unix))]
fn 文件正被写(_: &std::io::Error) -> bool {
    false
}

/// 一次"带超时地跑完一个外部命令"的结论。
#[derive(Debug)]
pub(crate) enum Ran {
    /// 起来了、也退出了。`ok` = 退出码是 0。
    Done {
        ok: bool,
        stdout: String,
        stderr: String,
    },
    /// **连程序都找不到**（PATH 里没有它）。这一档要和"跑了但失败"分开：
    /// 前者该引用户去装，后者该把程序自己的输出端给用户看。
    NoProgram,
    /// 等超时了。**已经杀了整个进程组**，但收尸归起了进程的那一侧。
    Timeout,
    /// 起来了但没跑成（spawn 报了别的错，或读输出失败）。
    Failed(String),
}

/// 跑一次外部命令：**自成进程组、有超时、可喂标准输入、输出全收**。
///
/// 收尸交给那个 `wait_with_output` 线程（它结束时自然收），杀进程交给 `kill_group`。
/// 喂标准输入另起一个线程：正文可能有几 MB，而"边写边等"在管道满时会和子进程
/// 互相卡住——两个线程各干各的就绕开了整类死锁。
pub(crate) fn run_capture(program: &str, args: &[String], opts: RunOpts) -> Ran {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command.stdin(if opts.stdin.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    });
    for (k, v) in &opts.envs {
        command.env(k, v);
    }
    if let Some(dir) = &opts.cwd {
        command.current_dir(dir);
    }

    // 自成进程组，超时才有得杀（见本文件头）。
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = match spawn_retrying(&mut command) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ran::NoProgram,
        Err(e) => return Ran::Failed(format!("起 `{program}` 失败：{e}")),
    };

    if let Some(text) = opts.stdin {
        if let Some(mut si) = child.stdin.take() {
            std::thread::spawn(move || {
                let _ = si.write_all(text.as_bytes());
                // 显式关掉：pandoc 那类"读完标准输入才开工"的程序要看到 EOF。
                drop(si);
            });
        }
    }

    let pid = child.id();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    match rx.recv_timeout(opts.timeout) {
        Ok(Ok(out)) => Ran::Done {
            ok: out.status.success(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        },
        Ok(Err(e)) => Ran::Failed(format!("读 `{program}` 的输出失败：{e}")),
        Err(_) => {
            kill_group(pid);
            Ran::Timeout
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 拆命令按空白分词() {
        assert_eq!(
            split_command("npx @slidev/cli").unwrap(),
            ("npx".to_string(), vec!["@slidev/cli".to_string()])
        );
        // 空命令 = 没命令可跑，不是"跑一个空程序"。
        assert!(split_command("   ").is_none());
    }

    #[test]
    fn 给的是整个进程组() {
        // 2026-09-25 定下来的（见本文件头）。负号是关键：没有它，上面那层
        // 死了、底下真正占端口的那个还活着。
        #[cfg(unix)]
        {
            let args = kill_args(4321);
            assert_eq!(args, vec!["-TERM".to_string(), "-4321".to_string()]);
            assert!(args[1].starts_with('-'), "组号必须带负号");
            assert_eq!(kill_program(), "kill");
        }
        #[cfg(windows)]
        {
            assert_eq!(kill_args(4321), vec!["/T", "/F", "/PID", "4321"]);
        }
    }

    #[test]
    fn 环境变量优先于默认值() {
        // 环境变量是进程级的，所以这里只验"没设时给默认值"那半——
        // 另一半由调用方（如 `pandoc.rs`）各自用例覆盖。
        assert_eq!(
            command_or_default("NOTA_绝对没有这个变量", "默认命令"),
            "默认命令"
        );
    }

    #[test]
    #[cfg(unix)]
    fn 文件正被别人写着时等一下再起() {
        // ⚠️ 这一条是照着一个**真出现过**的现象写的：`cargo test` 并行跑时随机
        // 有一两条报 `Text file busy (os error 26)`，`--test-threads=1` 永远绿。
        // 查出来的机制见 `spawn_retrying` 的注释（别条线程 fork 出来的孩子还攥着
        // 那个 fd）。这里把那个状态**做成确定的**：自己拿着可写 fd 不放，
        // 另一条线程过一会儿放掉——没有重试的话第一下必然 ETXTBSY。
        use std::io::Write as _;
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("nota-proc-test-busy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let 脚本 = dir.join("假命令");
        let 按住 = {
            let mut f = std::fs::File::create(&脚本).unwrap();
            f.write_all("#!/bin/sh\necho 起来了\n".as_bytes()).unwrap();
            std::fs::set_permissions(&脚本, std::fs::Permissions::from_mode(0o755)).unwrap();
            f
        };
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(40));
            drop(按住);
        });

        let ran = run_capture(
            &脚本.display().to_string(),
            &[],
            RunOpts::timeout(Duration::from_secs(10)),
        );
        match ran {
            Ran::Done { ok, stdout, .. } => {
                assert!(ok);
                assert!(stdout.contains("起来了"), "{stdout}");
            }
            别的 => panic!("该等一下之后起来，却是 {别的:?}"),
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn 跑到程序自己的输出() {
        let out = run_capture(
            "printf",
            &["%s".to_string(), "1.2.3".to_string()],
            RunOpts::timeout(Duration::from_secs(10)),
        );
        match out {
            Ran::Done { ok, stdout, .. } => {
                assert!(ok);
                assert_eq!(stdout, "1.2.3");
            }
            other => panic!("应该是跑完了：{other:?}"),
        }
    }

    #[test]
    fn 找不到程序是单独一档() {
        // ⚠️ 这一档不能和"跑了但失败"混：前者要引用户去装，后者要把程序
        // 自己的输出端出来。混在一起就会出现"没装 pandoc"却显示一段 ENOENT。
        let out = run_capture(
            "nota-绝对没有这个命令",
            &[],
            RunOpts::timeout(Duration::from_secs(5)),
        );
        assert!(matches!(out, Ran::NoProgram), "{out:?}");
    }

    #[test]
    #[cfg(unix)]
    fn 挂住的命令会超时而不是一直等() {
        let out = run_capture(
            "sleep",
            &["30".to_string()],
            RunOpts::timeout(Duration::from_millis(300)),
        );
        assert!(matches!(out, Ran::Timeout), "应该是超时：{out:?}");
    }

    #[test]
    #[cfg(unix)]
    fn 标准输入喂得进去() {
        // `cat` 把标准输入原样吐回来——这条钉的是"大正文不给管道卡住"那条路。
        let out = run_capture(
            "cat",
            &[],
            RunOpts::timeout(Duration::from_secs(10)).stdin("# 标题\n正文 🎉\n"),
        );
        match out {
            Ran::Done { ok, stdout, .. } => {
                assert!(ok);
                assert_eq!(stdout, "# 标题\n正文 🎉\n");
            }
            other => panic!("应该是跑完了：{other:?}"),
        }
    }

    #[test]
    #[cfg(unix)]
    fn 退出码非零时把输出留下来() {
        // 失败那一路必须能把程序自己的话（stderr）带回去：导出的报错全是
        // "pandoc 说他哪儿不懂"，另编一句概括只会更难查。
        let out = run_capture(
            "sh",
            &["-c".to_string(), "echo 坏消息 >&2; exit 3".to_string()],
            RunOpts::timeout(Duration::from_secs(10)),
        );
        match out {
            Ran::Done { ok, stderr, .. } => {
                assert!(!ok);
                assert!(stderr.contains("坏消息"), "{stderr}");
            }
            other => panic!("应该是跑完了但失败：{other:?}"),
        }
    }
}
