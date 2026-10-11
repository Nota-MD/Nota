//! **拼写检查的后端**（2026-10-11）——不再借浏览器内核。
//!
//! # 为什么要自己有一层
//!
//! 用户原话：「**拼写检查不应该依赖于浏览器内核，而是真正可拆分的内核模块**」。
//! 在此之前这一格是**借**的：Linux 让 WebKitGTK 去问 enchant、Windows 指望 WebView2
//! 用系统拼写检查。两边的毛病是同一个：**开关和语言都捏在内核手里**，换内核＝重做一遍，
//! 而且两边行为不一样（Windows 上我们甚至只能报"这个平台还改不了"）。
//!
//! 现在这一层是 Nota 自己的：**一个 [`Backend`] trait ＋ 若干实现**，谁都能换。
//! 界面那半（画波浪线、右键菜单）只认这个 trait，不认内核。
//!
//! # ⚠️ 词典仍然不随包走
//!
//! `docs/10` 那条口径没变：**Nota 一个词典字节都不带**，用的是**系统装的那一份**
//!（`hunspell` / `enchant` 的词典包）。今天这一版的后端就是**命令行那一层**：
//! 调系统的 `enchant-2`（首选，它自己会在 hunspell / aspell / hspell 之间挑 provider）
//! 或 `hunspell`。⚠️ 这条路的代价如实写在这儿：**Windows 上要先装 hunspell**，
//! 否则这一格就是"没后端可用"——那是"系统里没有"而不是"Nota 不支持"，界面照实说。
//! ⚠️ 想彻底不依赖系统，下一步是加一个**纯 Rust 的 hunspell 后端**（读 `.aff` / `.dic`）
//! 并**随包带词典**——那是打包决策（几十 MB），没拍板之前不做；`Backend` 这个 trait
//! 就是为那一天留的口子：**换后端不动界面**。
//!
//! # 两条纪律（与 `pandoc_probe.rs` 同一条）
//!
//! ① **不联网、不下载**；
//! ② **失败给"不知道"，不给"拼错了"**——后端起不来时把词判成错，用户会看到满屏红波浪线，
//!    那比"这一格不工作"坏得多（他会以为自己的文档全是错的）。

use std::time::Duration;


use crate::proc::{run_capture, Ran, RunOpts};

/// 一次检查最多等多久。词典查询是本机的小进程，留得短一点。
const 超时: Duration = Duration::from_secs(10);

/// 一次最多送多少词过去。**防手滑**：整篇文档几千个词分块送（界面那半负责切块）。
pub const 一次最多: usize = 2000;

/// 拼写检查的**后端**。
///
/// ⚠️ 三个方法都要**按"语言标签 + 一批词"**设计，不要设计成"一个词一个方法"：
/// 每一次调用都要起一次进程（或是查一次词典），一个词一次会把界面拖垮。
pub trait Backend: Send + Sync {
    /// 这个后端叫什么（给人看的：`enchant-2` / `hunspell` / …）。
    fn 名字(&self) -> &'static str;

    /// 这个后端现在能不能用（程序在不在 PATH 里）。
    ///
    /// ⚠️ **不问"有哪些词典"**：三种实现都没法便宜地回答它（2026-10-10 实测：
    /// `enchant-2 -l` 是 `--errors-only` 不是列词典、`hunspell -D` 会挂、
    /// 扫 `*.dic` 会漏——同一台机器上 `en_US.dic` 在、可 `en_GB` 明明也能用）。
    /// 所以"有没有这本词典"靠**真查一批词**看出来（见 [`Self::查`] 的返回）。
    fn 可用(&self) -> bool;

    /// 查一批词。返回**拼错的那几个**（下标按入参顺序）。
    ///
    /// ⚠️ 后端起不来 / 超时 / 输出读不懂时返回 `None`——**不是空 Vec**：
    /// 空的含义是"这一个都没错"，那是两件完全不同的事。
    fn 查(&self, 语言: &str, 词们: &[String]) -> Option<Vec<usize>>;

    /// 给一个词的建议（界面上的「替换为…」那一列）。拿不到就给空表。
    fn 建议(&self, 语言: &str, 词: &str) -> Vec<String>;
}

/// 挑一个现在能用的后端。都不可用就给 `None`（界面照实说"这台机器上还没有拼写后端"）。
pub fn 挑后端() -> Option<Box<dyn Backend>> {
    let 候选 = 候选程序();
    for 程序 in 候选 {
        if 在_path里(程序) {
            return Some(Box::new(命令行后端 { 程序 }));
        }
    }
    None
}

/// 按偏好排的候选：`enchant-2` 优先（它自己会在 hunspell / aspell / hspell 里挑 provider，
/// 所以"装了哪一家"不用我们操心），然后才是 `hunspell` 本体。
fn 候选程序() -> &'static [&'static str] {
    &["enchant-2", "hunspell"]
}

fn 在_path里(名字: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|d| {
        let p = d.join(名字);
        p.is_file()
    })
}

/// **命令行后端**：把词喂给 `enchant-2` / `hunspell` 的 stdin，读它说哪几个错了。
///
/// ⚠️ `enchant-2 -l` / `hunspell -l` 的输出约定是**把所有拼错的词原样打出来**，
/// 所以我们送进去的每一行都要**能对回原来的下标**：同一个词出现两次时按出现次数配对
/// （`剩下的` 那张计数表就是为它准备的）。
pub struct 命令行后端 {
    pub 程序: &'static str,
}

impl Backend for 命令行后端 {
    fn 名字(&self) -> &'static str {
        self.程序
    }

    fn 可用(&self) -> bool {
        在_path里(self.程序)
    }

    fn 查(&self, 语言: &str, 词们: &[String]) -> Option<Vec<usize>> {
        if 词们.is_empty() {
            return Some(Vec::new());
        }
        let 一批: Vec<String> = 词们.iter().take(一次最多).cloned().collect();
        let 输入 = {
            let mut s = String::new();
            for w in &一批 {
                s.push_str(w);
                s.push('\n');
            }
            s
        };
        let 参数 = 拼参数(self.程序, 语言);
        let 参数: Vec<String> = 参数.into_iter().map(str::to_string).collect();
        let opts = RunOpts::timeout(超时)
            .stdin(输入)
            .env("NO_COLOR", "1")
            .env("LC_ALL", "C.UTF-8");
        match run_capture(self.程序, &参数, opts) {
            Ran::Done { ok: true, stdout, .. } => Some(对回下标(&一批, &stdout)),
            // ⚠️ `enchant-2` 在"这本词典不存在"时**退非零**并打一句 `No dictionary available`
            //（2026-10-10 实测）。那不是"全都是错的"，是"这台机器没有这本词典"——
            // 所以这里给 `None`，界面据此说"这台机器没有 zh_CN 的词典"。
            _ => None,
        }
    }

    fn 建议(&self, 语言: &str, 词: &str) -> Vec<String> {
        // `-a` 是管道模式：输入 `^` 表示"开始一段"，输出里给建议的那几行长这样
        // `& 原词 个数 偏移: 建议1, 建议2`。只认这一种，别的行一律忽略
        //（`#` / `+` / `-` / `*` / 空行都是它的其它状态）。
        let 输入 = format!("{词}\n");
        let 参数 = 建议参数(self.程序, 语言);
        let 参数: Vec<String> = 参数.into_iter().map(str::to_string).collect();
        let opts = RunOpts::timeout(超时)
            .stdin(输入)
            .env("NO_COLOR", "1")
            .env("LC_ALL", "C.UTF-8");
        let Ran::Done { ok: true, stdout, .. } = run_capture(self.程序, &参数, opts) else {
            return Vec::new();
        };
        从建议输出里抠(&stdout)
    }
}

/// 查一批词时给后端的参数。
/// ⚠️ 两个分支现在**恰好一样**，但**故意不合并**：`enchant-2` 与 `hunspell`
/// 的旗子家族并不相同（enchant 那边还有 `--list-dicts` 之类），哪天要分开写就在这儿分。
fn 拼参数<'a>(程序: &str, 语言: &'a str) -> Vec<&'a str> {
    match 程序 {
        // `-l` = 列出拼错的词；`-d` = 指定词典（enchant 那边这本词典得真的装了）。
        "enchant-2" => vec!["-d", 语言, "-l"],
        _ => vec!["-d", 语言, "-l"],
    }
}

/// 要建议时给后端的参数：`-a` 管道模式。
fn 建议参数<'a>(程序: &str, 语言: &'a str) -> Vec<&'a str> {
    match 程序 {
        "enchant-2" => vec!["-d", 语言, "-a"],
        _ => vec!["-d", 语言, "-a"],
    }
}

/// 把后端吐出来的"拼错的词"对回**入参下标**。
///
/// ⚠️ 按**出现次数**配对而不是按集合：同一个词在一批里出现两次，后端只会打两行，
/// 两个下标都该被标出来。
pub(crate) fn 对回下标(词们: &[String], 输出: &str) -> Vec<usize> {
    use std::collections::HashMap;
    let mut 待配: HashMap<&str, Vec<usize>> = HashMap::new();
    for (i, w) in 词们.iter().enumerate() {
        待配.entry(w.as_str()).or_default().push(i);
    }
    let mut 出: Vec<usize> = Vec::new();
    for 行 in 输出.lines() {
        let 词 = 行.trim();
        if 词.is_empty() {
            continue;
        }
        if let Some(下标们) = 待配.get_mut(词) {
            if let Some(i) = 下标们.pop() {
                出.push(i);
            }
        }
    }
    出.sort_unstable();
    出
}

/// 从 `-a` 管道模式的输出里抠建议。
pub(crate) fn 从建议输出里抠(输出: &str) -> Vec<String> {
    for 行 in 输出.lines() {
        let Some(体) = 行.strip_prefix("& ") else {
            continue;
        };
        // `原词 个数 偏移: 建议1, 建议2` —— 冒号后面才是建议。
        let Some((_, 建议段)) = 体.split_once(':') else {
            continue;
        };
        return 建议段
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    Vec::new()
}

/// 给外部（命令层）用的一个便利：**没有后端时**统一的那句话。
pub fn 没有后端的话() -> String {
    "这台机器上还没有拼写检查的后端。装一个就行：Debian/Ubuntu 是 `apt install enchant-2`，\
     Fedora 是 `dnf install enchant2`（词典另算，比如 `hunspell-en-US`）。"
        .to_string()
}

// ⚠️ 这里**不自己 `Command::spawn`**：起进程一律走 `crate::proc::run_capture`
//（超时、stdin、子进程收尸都在那一处，理由见 `proc.rs` 文件头）。

#[cfg(test)]
mod tests;

// ── 命令（接线，判定都在上面）──────────────────────────────────────────────

use crate::error::{NotaError, Result};

/// **查一批词**：返回**拼错的那几个的下标**（按入参顺序）。
///
/// ⚠️ `async` ＋ `spawn_blocking`：要起外部进程（最长 10 秒），同步命令会冻住主线程。
#[tauri::command]
pub async fn nota_spell_check(lang: String, words: Vec<String>) -> Result<Vec<usize>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(后端) = 挑后端() else {
            return Err(NotaError::other(没有后端的话()));
        };
        后端
            .查(&lang, &words)
            .ok_or_else(|| NotaError::other(格式没词典的话(&lang, 后端.名字())))
    })
    .await
    .map_err(|e| NotaError::other(format!("拼写检查的线程挂了：{e}")))?
}

/// **要建议**（界面上的「替换为…」那一列）。拿不到就给空表，不报错。
#[tauri::command]
pub async fn nota_spell_suggest(lang: String, word: String) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(后端) = 挑后端() else {
            return Err(NotaError::other(没有后端的话()));
        };
        Ok(后端.建议(&lang, &word))
    })
    .await
    .map_err(|e| NotaError::other(format!("拼写建议的线程挂了：{e}")))?
}

/// 后端还活着、但**这本词典它没有**时说的那句话。
///
/// ⚠️ 与"没装后端"分开说：两件事用户能做的事不一样（一个装程序、一个装词典包）。
fn 格式没词典的话(lang: &str, 后端: &str) -> String {
    format!(
        "{后端} 不认识 `{lang}` 这本词典（也可能这台机器上还没装）。         装词典包之后这一格就能用，比如 `hunspell-en-US` / `hunspell-zh-CN` 那一类。"
    )
}
