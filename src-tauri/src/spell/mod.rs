//! **拼写检查的后端**（2026-10-11）——不借浏览器内核，也不借系统程序。
//!
//! # 三层，各管各的
//!
//! | 层 | 管什么 | 文件 |
//! |---|---|---|
//! | 引擎 | 词对不对、给什么建议 | [`native`]（zspell，纯 Rust，**编进程序**） |
//! | 词典 | 去哪找 `.aff`/`.dic`、有哪些、怎么装进来 | [`store`] |
//! | 口径 | 用户词表、忽略、失败怎么说 | 这一份 |
//!
//! 界面那半（波浪线、右键菜单）只认这一份里的 [`Backend`] trait，不认引擎。
//!
//! # 为什么曾经不是这样
//!
//! 用户原话：「**拼写检查不应该依赖于浏览器内核，而是真正可拆分的内核模块**」。
//! 更早那一版是**借**的：Linux 让 WebKitGTK 去问 enchant，Windows 指望 WebView2
//! 用系统拼写检查。两边的毛病是同一个——**开关和语言都捏在内核手里**，换内核＝
//! 重做一遍，而且两边行为不一样（Windows 上我们甚至只能报"这个平台还改不了"）。
//! 中间那版**借系统程序**（调 `enchant-2` / `hunspell` 的命令行）：内核那条绳
//! 断了，但**"这台机器上得先装上那个程序"**成了新的门槛——新装的 Windows 上
//! 什么都没有。今天这一版把引擎**编进程序**（[`native`]），命令行那条留着当退路。
//!
//! # ⚠️ 词典**一个字节都不随包分发**（用户 2026-10-11 拍板）
//!
//! 「默认随包不分发任何字典」——照 Typora 那条 `❌ 词典数据不内置`。词典从
//! **两个方向**找（用户目录 ＋ 系统目录，见 [`store`]），还可以**导入 `.zip`**。
//! 所以一台没装系统词典的新机器上，英文拼写检查**是打不开的**：界面上那一格
//! 要如实说"这台机器上还没有这本词典"，并把三条出路写在旁边（装系统包 / 导入
//! zip / 拷进目录）。⚠️ **我们不像 Typora 那样联网下载词典**——本仓对拼写这一格
//! 钉死了两条纪律，见下。
//!
//! # 两条纪律（与 `pandoc_probe.rs` 同一条）
//!
//! ① **不联网、不下载**；
//! ② **失败给"不知道"，不给"拼错了"**——没有词典时把词判成错，用户会看到满屏
//!    红波浪线，那比"这一格不工作"坏得多（他会以为自己的文档全是错的）。

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use crate::error::{NotaError, Result};
use crate::proc::{run_capture, Ran, RunOpts};

pub mod native;
pub mod store;

/// 一次检查最多等多久。命令行后端要起进程，留得短一点。
const 超时: Duration = Duration::from_secs(10);

/// 一次最多送多少词过去。**防手滑**：整篇文档几千个词分块送（界面那半负责切块）。
pub const 一次最多: usize = 2000;

/// 拼写检查的**后端**。
///
/// ⚠️ 三个方法都要**按"语言标签 + 一批词"**设计，不要设计成"一个词一个方法"：
/// 命令行后端每一次调用都要起一次进程，一个词一次会把界面拖垮。
pub trait Backend: Send + Sync {
    /// 这个后端叫什么（给人看的：`zspell` / `enchant-2` / …）。
    fn 名字(&self) -> &'static str;

    /// 这个后端现在能不能用。
    ///
    /// ⚠️ **不问"有哪些词典"**：命令行那条路没法便宜地回答它（2026-10-10 实测：
    /// `enchant-2 -l` 是 `--errors-only` 不是列词典、`hunspell -D` 会挂）。
    /// "有没有这本词典"靠**真查一批词**看出来（见 [`Self::查`] 的返回）。
    fn 可用(&self) -> bool;

    /// 查一批词。返回**拼错的那几个**（下标按入参顺序）。
    ///
    /// ⚠️ 后端起不来 / 超时 / 输出读不懂时返回 `None`——**不是空 Vec**：
    /// 空的含义是"这一个都没错"，那是两件完全不同的事。
    fn 查(&self, 语言: &str, 词们: &[String]) -> Option<Vec<usize>>;

    /// 给一个词的建议（界面上的「替换为…」那一列）。拿不到就给空表。
    fn 建议(&self, 语言: &str, 词: &str) -> Vec<String>;
}

// ── 用户词表与"忽略"（两件不同的事，别并成一个）────────────────────────────

/// 用户自己加的词（右键「加入词典」写进去的那一份）。**落盘**。
///
/// ⚠️ 这是一个**覆盖层**：命中它的词**直接算对**，不问引擎。这样做的理由是它
/// 必须对两种后端都生效（zspell 与 enchant 的"个人词典"机制各不相同，而用户
/// 看到的只有"我加过这个词"这一个事实）。
static 用户词: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

/// 本次运行里被"忽略"的词。**不落盘**（与"加入词典"分开的两件事，见 `忽略一个词`）。
static 忽略词: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn 用户词表() -> &'static Mutex<HashSet<String>> {
    用户词.get_or_init(|| Mutex::new(读用户词表()))
}

fn 忽略词表() -> &'static Mutex<HashSet<String>> {
    忽略词.get_or_init(|| Mutex::new(HashSet::new()))
}

/// 词的比较口径：**统一小写**。`Nota` 与 `nota` 是同一个词（词典那条路本来也是
/// 大小写不敏感的：实测 `Hello`/`HELLO` 都判对）。
fn 归一(词: &str) -> String {
    词.trim().to_lowercase()
}

/// 从 `dictionaries/user-words.txt` 读一份用户词表。
///
/// ⚠️ 读不出来（文件不存在是最常见的那种）**不算错误**：那只是"一个自己的词都
/// 还没加过"。空表与"读失败"在这里**结果相同**，而把读失败报成错误会让第一次
/// 打开设置页的人看到一句莫名其妙的红字。
fn 读用户词表() -> HashSet<String> {
    let Ok(路径) = store::用户词表文件() else {
        return HashSet::new();
    };
    let Ok(文) = std::fs::read_to_string(路径) else {
        return HashSet::new();
    };
    文.lines()
        .map(str::trim)
        .filter(|行| !行.is_empty() && !行.starts_with('#'))
        .map(|行| 行.to_lowercase())
        .collect()
}

/// **加入词典**（右键菜单那一项）：写进用户词表，并且**当场生效**。
///
/// ⚠️ 与「忽略」分开是**必须的**，不是分类癖：`忽略` 是"这一篇里别烦我"
///（本次运行有效，重开软件照旧会标），`加入词典` 是"这个词是对的，以后都算对"
///（落盘，一直有效）。做成一个的话，用户点哪一次都是**猜**——而猜错的后果
/// 是"我明明忽略过，怎么又标上了"（或反过来："我明明说的是这个词是对的"）。
pub fn 加入用户词(词: &str) -> Result<String> {
    let 净 = 归一(词);
    if 净.is_empty() {
        return Err(NotaError::other("空词加不了".to_string()));
    }
    if let Ok(mut 表) = 用户词表().lock() {
        if !表.insert(净.clone()) {
            return Ok(净); // 已经加过：不重复写文件
        }
    }
    if let Ok(mut 表) = 忽略词表().lock() {
        表.remove(&净); // 加进词典了就不该还挂在忽略里
    }
    let 路径 = store::用户词表文件()?;
    if let Some(父) = 路径.parent() {
        std::fs::create_dir_all(父)
            .map_err(|e| NotaError::other(format!("建不了词典目录：{e}")))?;
    }
    use std::io::Write as _;
    let mut 文件 = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&路径)
        .map_err(|e| NotaError::other(format!("写不了用户词表：{e}")))?;
    writeln!(文件, "{净}").map_err(|e| NotaError::other(format!("写不了用户词表：{e}")))?;
    Ok(净)
}

/// **忽略**（右键菜单那一项）：只在**本次运行**里不再标它。
pub fn 忽略一个词(词: &str) -> String {
    let 净 = 归一(词);
    if 净.is_empty() {
        return 净;
    }
    if let Ok(mut 表) = 忽略词表().lock() {
        表.insert(净.clone());
    }
    if let Ok(mut 表) = 用户词表().lock() {
        表.remove(&净);
    }
    净
}

/// 从一批词里挑出**真要去问引擎**的那些（带它们在入参里的原下标）。
///
/// ⚠️ 减掉的那些不是"优化"，是**语义**：用户词表里的词**必须**算对，
/// 哪怕引擎不认识它（那正是他把词加进去的原因）。
pub(crate) fn 要真查的<'a>(
    词们: &'a [String],
    用户: &HashSet<String>,
    忽略: &HashSet<String>,
) -> Vec<(usize, &'a str)> {
    词们
        .iter()
        .enumerate()
        .filter(|(_, 词)| {
            let 净 = 归一(词);
            !用户.contains(&净) && !忽略.contains(&净)
        })
        .map(|(i, 词)| (i, 词.as_str()))
        .collect()
}

/// [`要真查的`] 的用法——用现成的两张表。
fn 要真查(词们: &[String]) -> Vec<(usize, String)> {
    let 用户 = 用户词表().lock().map(|g| g.clone()).unwrap_or_default();
    let 忽略 = 忽略词表().lock().map(|g| g.clone()).unwrap_or_default();
    要真查的(词们, &用户, &忽略)
        .into_iter()
        .map(|(i, 词)| (i, 词.to_string()))
        .collect()
}

// ── 后端 ──────────────────────────────────────────────────────────────────

/// **组合后端**：先走自己手里那条（[`native`]），手里没有这门语言的词典时
/// 才退到系统程序（`enchant-2` / `hunspell`）。
///
/// ⚠️ 这个顺序**不是随便排的**：zspell 那条查 2000 个词 0.2 ms，命令行那条要起
/// 一次进程（几百毫秒）。手里有词典时**绝不去起进程**。
pub struct 组合后端 {
    原生: native::纯Rust后端,
    命令行: Option<命令行后端>,
}

impl Backend for 组合后端 {
    fn 名字(&self) -> &'static str {
        // ⚠️ 这一行是**给人看的**（报错文案里会带上）：它要说得出"这一发可能是
        // 谁答的"，所以两个名字都列。
        "zspell / enchant / hunspell"
    }

    fn 可用(&self) -> bool {
        // ⚠️ 引擎编在程序里 ⇒ 这一层**永远起得来**。真正会缺的是**词典**
        //（见 [`没有这本词典的话`]）——两件事分开说，别把"没词典"说成"没引擎"。
        true
    }

    fn 查(&self, 语言: &str, 词们: &[String]) -> Option<Vec<usize>> {
        let 待查 = 要真查(词们);
        if 待查.is_empty() {
            return Some(Vec::new());
        }
        let 只有词: Vec<String> = 待查.iter().map(|(_, 词)| 词.clone()).collect();
        let 结果 = if self.原生.有词典(语言) {
            self.原生.查(语言, &只有词)
        } else if let Some(命令行) = &self.命令行 {
            命令行.查(语言, &只有词)
        } else {
            // ⚠️ 手里没有这门语言的词典、系统里也没有 enchant/hunspell ⇒
            // `None`（"不知道"）。**不许**退化成"一个都没错"——那会让用户以为
            // 这篇文档全对。
            None
        };
        let 错的下标 = 结果?;
        // 下标搬回**原位置**（减掉用户词之后，两边的下标不再是同一套）。
        Some(错的下标.into_iter().map(|i| 待查[i].0).collect())
    }

    fn 建议(&self, 语言: &str, 词: &str) -> Vec<String> {
        if self.原生.有词典(语言) {
            return self.原生.建议(语言, 词);
        }
        self.命令行
            .as_ref()
            .map(|后端| 后端.建议(语言, 词))
            .unwrap_or_default()
    }
}

/// 造一个后端。⚠️ **几乎总是给得出一个**（引擎编在程序里），给不出才 `None`。
///
/// ⚠️ 用户**刚导入**的词典要当场生效：`nota_spell_dict_import` 那条命令里有
/// [`native::清缓存`]，而寻找词典（`store::找一对`）每一次都现扫目录，所以
/// 不用重启软件。
pub fn 挑后端() -> Option<Box<dyn Backend>> {
    let 原生 = native::纯Rust后端::新建();
    let 命令行 = 候选程序()
        .iter()
        .copied()
        .find(|程序| 在_path里(程序))
        .map(|程序| 命令行后端 {
            程序,
            用户词典目录: store::用户词典目录().ok(),
        });
    // ⚠️ 命令行后端一个都没有**也要给**：原生那条手里可能一本词典都没有，
    // 但用户随时能导入一份（导入之后不用重启）。
    Some(Box::new(组合后端 { 原生, 命令行 }))
}

/// 按偏好排的候选：`enchant-2` 优先（它自己会在 hunspell / aspell / hspell 里
/// 挑 provider，所以"装了哪一家"不用我们操心），然后才是 `hunspell` 本体。
fn 候选程序() -> &'static [&'static str] {
    &["enchant-2", "hunspell"]
}

fn 在_path里(名字: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|d| d.join(名字).is_file())
}

/// **命令行后端**（退路）：把词喂给 `enchant-2` / `hunspell` 的 stdin，读它说
/// 哪几个错了。
///
/// ⚠️ `enchant-2 -l` / `hunspell -l` 的输出约定是**把所有拼错的词原样打出来**，
/// 所以我们送进去的每一行都要**能对回原来的下标**：同一个词出现两次时按出现
/// 次数配对（`剩下的` 那张计数表就是为它准备的）。
pub struct 命令行后端 {
    pub 程序: &'static str,
    /// **用户词典目录**（`store::用户词典目录()`）。里面真有这门语言的 `.dic` 时
    /// 给 `-d` 一个**路径**，让系统程序也吃我们自己那一份。
    pub 用户词典目录: Option<PathBuf>,
}

impl 命令行后端 {
    /// 这一门语言该用**哪个** `-d` 值：用户目录里真有 `<语言>.dic` 时给**路径**
    ///（hunspell / enchant 都认"指向 `.dic` 的路径"，会自动找同目录同名的
    /// `.aff`），否则给语言名（让它们去系统词典里找）。
    fn 词典参数(&self, 语言: &str) -> String {
        if let Some(目录) = &self.用户词典目录 {
            let 候选 = 目录.join(format!("{语言}.dic"));
            if 候选.is_file() {
                // ⚠️ 去掉 `.dic` 后缀：hunspell 的 `-d` 收的是**词干路径**，
                // 它自己会去拼 `.dic` / `.aff`（带上后缀在某些版本上反而不认）。
                return 目录.join(语言).display().to_string();
            }
        }
        语言.to_string()
    }
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
        let 词典 = self.词典参数(语言);
        let 参数: Vec<String> = 拼参数(self.程序, &词典)
            .into_iter()
            .map(str::to_string)
            .collect();
        let opts = RunOpts::timeout(超时)
            .stdin(输入)
            .env("NO_COLOR", "1")
            .env("LC_ALL", "C.UTF-8");
        match run_capture(self.程序, &参数, opts) {
            Ran::Done { ok: true, stdout, .. } => Some(对回下标(&一批, &stdout)),
            // ⚠️ `enchant-2` 在"这本词典不存在"时**退非零**并打一句 `No dictionary
            // available`（2026-10-10 实测）。那不是"全都是错的"，是"这台机器没有
            // 这本词典"——所以这里给 `None`，界面据此说"没有这本词典"。
            _ => None,
        }
    }

    fn 建议(&self, 语言: &str, 词: &str) -> Vec<String> {
        // `-a` 是管道模式：输出里给建议的那几行长这样
        // `& 原词 个数 偏移: 建议1, 建议2`。只认这一种，别的行一律忽略
        //（`#` / `+` / `-` / `*` / 空行都是它的其它状态）。
        let 输入 = format!("{词}\n");
        let 词典 = self.词典参数(语言);
        let 参数: Vec<String> = 建议参数(self.程序, &词典)
            .into_iter()
            .map(str::to_string)
            .collect();
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

// ⚠️ 起进程一律走 `crate::proc::run_capture`（超时、stdin、子进程收尸都在那一处，
// 理由见 `proc.rs` 文件头），这里不自己 `Command::spawn`。

#[cfg(test)]
mod tests;

// ── 命令（接线，判定都在上面）──────────────────────────────────────────────

/// **查一批词**：返回**拼错的那几个的下标**（按入参顺序）。
///
/// ⚠️ `async` ＋ `spawn_blocking`：可能要起外部进程 / 读一份词典（最长 10 秒），
/// 同步命令会冻住主线程。
#[tauri::command]
pub async fn nota_spell_check(lang: String, words: Vec<String>) -> Result<Vec<usize>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(后端) = 挑后端() else {
            return Err(NotaError::other(没有引擎的话()));
        };
        后端
            .查(&lang, &words)
            .ok_or_else(|| NotaError::other(没有这本词典的话(&lang)))
    })
    .await
    .map_err(|e| NotaError::other(format!("拼写检查的线程挂了：{e}")))?
}

/// **要建议**（界面上的「替换为…」那一列）。拿不到就给空表，不报错。
#[tauri::command]
pub async fn nota_spell_suggest(lang: String, word: String) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(后端) = 挑后端() else {
            return Ok(Vec::new());
        };
        Ok(后端.建议(&lang, &word))
    })
    .await
    .map_err(|e| NotaError::other(format!("拼写建议的线程挂了：{e}")))?
}

/// **这台机器上有哪些词典**（语言选择那一格用）。
#[tauri::command]
pub async fn nota_spell_dictionaries() -> Result<Vec<store::词典条目>> {
    tauri::async_runtime::spawn_blocking(|| {
        Ok(store::列出(store::用户词典目录().ok().as_deref()))
    })
    .await
    .map_err(|e| NotaError::other(format!("列词典的线程挂了：{e}")))?
}

/// **用户词典目录在哪儿**（设置页那一行"打开文件夹"用）。
#[tauri::command]
pub async fn nota_spell_dict_dir() -> Result<String> {
    Ok(store::用户词典目录()?.display().to_string())
}

/// **在文件管理器里打开用户词典目录**（设置页那颗按钮）。
///
/// ⚠️ **"打开"这一步在宿主**，不给前端路径让它自己开——理由与
/// `nota_settings_open_dir` 那段**完全同源**（BUG-27：前端那条路要过 ACL 的
/// path scope，而本仓的目录口径在 `paths.rs` 的 XDG 里，两份不一定指同一个
/// 地方）。这里比那一处还多一件事：`dictionaries/` **可能还不存在**
/// （一台还没导过任何词典的机器就是空的），那就先建出来——文件管理器打不开
/// 一个不存在的路径。
#[tauri::command]
pub async fn nota_spell_dict_reveal(app: tauri::AppHandle) -> Result<String> {
    use tauri_plugin_opener::OpenerExt as _;
    let 目录 = store::用户词典目录()?;
    std::fs::create_dir_all(&目录)
        .map_err(|e| NotaError::other(format!("建不了词典目录：{e}")))?;
    let 显示 = crate::paths::path_to_string(&目录)?;
    app.opener()
        .open_path(显示.clone(), None::<&str>)
        .map_err(|e| NotaError::other(format!("调用系统打开器失败：{e}——目录是 {显示}")))?;
    Ok(显示)
}

/// **导入一个词典包**（`.zip`）。返回装进去的语言标签。
#[tauri::command]
pub async fn nota_spell_dict_import(path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let 标签 = store::导入压缩包(std::path::Path::new(&path))?;
        // ⚠️ **必须清缓存**：用户可能导入的是**盖住原来那本**的同名词典
        //（`en_US` 换一份更好的），而缓存是按文件路径记的——不清的话新词典
        // 要等他重启软件才生效，症状是"我明明导入了，怎么还是老样子"。
        native::清缓存();
        Ok(标签)
    })
    .await
    .map_err(|e| NotaError::other(format!("导入词典的线程挂了：{e}")))?
}

/// **加入词典**（右键菜单）。返回归一化之后真正写进去的那个词。
#[tauri::command]
pub async fn nota_spell_word_add(word: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || 加入用户词(&word))
        .await
        .map_err(|e| NotaError::other(format!("写用户词表的线程挂了：{e}")))?
}

/// **忽略**（右键菜单）。只在本次运行里有效（理由见 [`加入用户词`] 那段）。
#[tauri::command]
pub async fn nota_spell_word_ignore(word: String) -> Result<String> {
    Ok(忽略一个词(&word))
}

/// 连引擎都造不出来时说的那句话。⚠️ 今天几乎走不到（引擎编在程序里），
/// 留着是因为"几乎"不是"永远"。
fn 没有引擎的话() -> String {
    "拼写检查的引擎起不来——这是个 bug，不是这台机器缺什么。".to_string()
}

/// **这门语言的词典找不到**时说的那句话（今天最常见的那一种失败）。
///
/// ⚠️ 三条出路都要写出来：这条提示的读者是"想用中文/德语拼写检查的人"，
/// 而他手里**没有一个**现成的办法——只告诉他"没有词典"，他下一步只能来问我们。
pub fn 没有这本词典的话(lang: &str) -> String {
    let 目录 = store::用户词典目录()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<配置目录>/nota/dictionaries".to_string());
    format!(
        "这台机器上没有 `{lang}` 的词典。三条路：① 装系统词典包（Debian/Ubuntu 是 \
         `apt install hunspell-{lang}`，Fedora 是 `dnf install hunspell-{lang}`）；\
         ② 在「设置 → 编辑器 → 拼写检查」里导入一个含 `.aff`/`.dic` 的 zip 包；\
         ③ 把 `{lang}.aff` 与 `{lang}.dic` 拷进 `{目录}`。"
    )
}
