//! **词典放哪儿、这台机器上有哪些、怎么装进来**（2026-10-11）。
//!
//! # 为什么要单独一层
//!
//! 拼写检查的**引擎**在我们自己手里（`native.rs` 的 zspell），但**词典是数据**，
//! 数据得先知道去哪儿找。这一层回答的就是那三个问题——`mod.rs` 与 `native.rs`
//! 都不自己拼路径（散落的 `join("dicts")` 正是"换个存法时最先烂掉的地方"，
//! 同 `paths.rs` 顶上那句话）。
//!
//! # 两个方向，一个先后（用户 2026-10-11：「再加上系统的字典目录寻找，双方向」）
//!
//! | 方向 | 在哪儿 | 谁放进去的 |
//! |---|---|---|
//! | **用户** | `$XDG_CONFIG_HOME/nota/dictionaries/` | 用户自己：导入 `.zip`，或把 `.aff`/`.dic` 直接拷进去（照 Typora 的 `~/.config/Typora/dictionaries/`） |
//! | **系统** | `/usr/share/hunspell` / `myspell` 那一族 | 发行版的 `hunspell-xx` 包 |
//!
//! ⚠️ **先后是"用户 > 系统"**：用户自己放进去的那一门永远赢——他放进来这件事
//! 本身就是"我要用这一本"的表态。
//!
//! ⚠️⚠️ **安装包里一本词典都不带**（用户 2026-10-11 拍板：「默认随包不分发任何
// 字典」，照 Typora 那条 `❌ 词典数据不内置`）。所以这条路只有上面两个方向——
// 早先那版随包带过一份 `en_US`（`bundle.resources` 的 `dicts` 映射），已摘掉。
// 一台又没装系统词典、又没联网的新机器上，英文拼写检查**打不开**，这是
// **说清楚了的选择**，不是故障：界面上那一格要如实说"这台机器上还没有词典"，
// 并把"去哪儿弄"（系统包 / 导入 zip / 拷进目录）写在旁边。
// ⚠️ **我们不联网下载词典**：Typora 是从 `dict.typora.io` 拉的，而本仓对拼写
// 这一格钉死了「不联网、不下载」（`mod.rs` 顶上那两条纪律）。学的是它的
// **目录模型**（一个用户目录、手动丢进去就能用、还去系统目录里找）。
//!
//! ⚠️ **没有中文词典**这件事与 Typora 一致（hunspell 那套按空格切词查词表，
// 中文没有词间空格）：中文只有"导入用户自己的词表"这条路。别把这条当待办——
// 它是格式本身的性质，不是我们没做。

use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{NotaError, Result};

/// 一个压缩包最多解出多少字节。⚠️ 词典是**文本**：SCOWL 的 `en_US` 一对加起来
/// 不到 1 MB，最大的语种也就十几 MB。给到 128 MB 是"防手滑"而不是"够用"。
const 解包上限: u64 = 128 * 1024 * 1024;

/// 用户词典目录：`$XDG_CONFIG_HOME/nota/dictionaries`。
///
/// ⚠️ 放 **`config`**（与 `settings.toml` / `trusted-keys.toml` 同处），不放 `data`
/// ——判据是 `paths.rs` 顶上那条：`config` 里放的是**用户该能自己动手的东西**。
/// 词典正是那一类（Typora 的用户就是自己拷 `.aff`/`.dic` 进去的），而
/// "我的词典呢"这个问题的第一现场必须是用户一眼能找到的地方。
pub fn 用户词典目录() -> Result<PathBuf> {
    Ok(crate::paths::config_dir()?.join("dictionaries"))
}

/// 用户词表（Typora 那个 `user-dict.json` 的对应物）：`dictionaries/user-words.txt`。
///
/// ⚠️ **一行一个词、纯文本**，不学 Typora 用 JSON：这一份是**用户该能拿编辑器
/// 直接改**的东西（那条 `config` 的判据），而 JSON 会逼着他伺候括号与逗号。
/// 空行与 `#` 开头的行不算词（注释），这样他能自己分组、写备注。
pub fn 用户词表文件() -> Result<PathBuf> {
    Ok(用户词典目录()?.join("user-words.txt"))
}

/// 系统词典目录（按平台，能查到几个算几个）。
///
/// ⚠️ 这里**只列 hunspell 那套 `.aff`/`.dic` 家的目录**，不去猜 aspell
///（`.rws` 是另一种二进制格式，我们的引擎读不了）。列了 aspell 的目录只会让
/// "这台机器上有这本词典"这句话变成谎话。
pub fn 系统词典目录们() -> Vec<PathBuf> {
    let mut 出 = Vec::new();
    #[cfg(target_os = "linux")]
    {
        出.push(PathBuf::from("/usr/share/hunspell"));
        出.push(PathBuf::from("/usr/share/myspell"));
        出.push(PathBuf::from("/usr/share/myspell/dicts"));
        出.push(PathBuf::from("/usr/local/share/hunspell"));
    }
    #[cfg(target_os = "macos")]
    {
        // macOS 的"系统拼写检查"不走 hunspell（那是 Cocoa 自己一套），但用户往
        // 这两个目录丢 hunspell 词典时它们确实在那儿。
        出.push(PathBuf::from("/Library/Spelling"));
        if let Some(家) = std::env::var_os("HOME") {
            出.push(PathBuf::from(家).join("Library/Spelling"));
        }
    }
    #[cfg(target_os = "windows")]
    {
        // ⚠️ Windows 上没有"系统装好的 hunspell 词典"这个概念（Chromium 用的是
        // 自己那套 `.bdic`，格式完全不同）。这里只捞 LibreOffice 带的那一份——
        // 它是官方渠道里最常见的 hunspell 词典来源。捞不到就是"只有用户那一层"。
        let 盘 = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
        出.push(PathBuf::from(format!(
            "{盘}\\Program Files\\LibreOffice\\share\\extensions"
        )));
    }
    出
}

/// 一本词典**是谁放进来的**。
///
/// ⚠️ 跨 IPC 的取值**一律英文小写**（`user` / `system`），中文只出现在注释与
/// 界面文案里——与 `bridge/types.ts::路径种类` 同一个口径。⚠️ **变体名是中文**，
/// 所以不能靠 `rename_all`（那个把中文变体名再小写一遍，出来还是中文），
/// 得一条一条写 `rename`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum 来源 {
    /// 用户自己放进 `dictionaries/` 的（导入的 `.zip` 或手拷的）。
    #[serde(rename = "user")]
    用户,
    /// 系统包（`hunspell-en-US` 那一类）装出来的。
    #[serde(rename = "system")]
    系统,
}

/// 列给界面看的一本词典。
#[derive(Debug, Clone, Serialize)]
pub struct 词典条目 {
    /// 语言标签（`en_US` 这种，文件名去掉后缀）。
    pub tag: String,
    pub 来源: 来源,
    /// 在哪个目录（给"打开文件夹"那条路用）。
    pub 目录: String,
}

/// 归一化一个语言标签：`en-US` 与 `en_US` 是**同一门**，大小写不算差别。
///
/// ⚠️ 这一步不是洁癖：用户在设置里敲的是 `en_US`，而 wooorm 那份词典包里的
/// 目录名是 `en-US`，系统包的名字是 `en_US`。不归一化的话他明明装对了、界面
/// 却说"没有这本词典"。
fn 归一(标签: &str) -> String {
    标签
        .chars()
        .map(|c| match c {
            '-' | '_' => '_',
            c => c.to_ascii_lowercase(),
        })
        .collect()
}

/// 某个目录里，语言标签为 `tag` 的那一对词典在哪儿。
///
/// `.aff` 是**可选**的：只有 `.dic` 时我们拿一份最小的 affix 配置去建
///（见 `native.rs::建词典`）。⚠️ 这条容错是用户点名的（「只有 `.dic` 也要能认」）
/// ——症状上它是"有些派生词（复数、时态）会被标错"，但**总比整本读不出来强**。
fn 目录里找一对(目录: &Path, 标签: &str) -> Option<(Option<PathBuf>, PathBuf)> {
    let 想要 = 归一(标签);
    let mut dic = None;
    let mut aff = None;
    for 条 in std::fs::read_dir(目录).ok()?.flatten() {
        let 路径 = 条.path();
        if !路径.is_file() {
            continue;
        }
        let Some(后缀) = 路径.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        let Some(茎) = 路径.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if 归一(茎) != 想要 {
            continue;
        }
        match 后缀.to_ascii_lowercase().as_str() {
            "dic" => dic = Some(路径),
            "aff" => aff = Some(路径),
            _ => {}
        }
    }
    Some((aff, dic?))
}

/// 按**用户 → 系统**的顺序，找出这门语言的词典在哪儿。
pub fn 找一对(标签: &str, 用户目录: Option<&Path>) -> Option<(Option<PathBuf>, PathBuf)> {
    if let Some(目录) = 用户目录 {
        if let Some(对) = 目录里找一对(目录, 标签) {
            return Some(对);
        }
    }
    for 目录 in 系统词典目录们() {
        // ⚠️ 一个目录读不了（不存在 / 没权限）**不算失败**：跳到下一个。
        if let Some(对) = 目录里找一对(&目录, 标签) {
            return Some(对);
        }
    }
    None
}

/// 这台机器上**我们的引擎真读得了**的词典们。
///
/// ⚠️⚠️ 这一条与 `commands/webview.rs` 文件头那段"四种列法全不靠谱"**不矛盾**，
/// 因为问的是**另一个问题**：
///
/// · 那边问的是"**enchant** 认哪些标签"——它背后可能是 aspell/hspell，扫 `.dic`
///   会漏（宿主机上 `en_GB` 能用而 `/usr/share/hunspell` 里没有它）；
/// · 这里问的是"**我们的 zspell** 读得了哪些文件"——它就只认 `.aff`/`.dic`，
///   所以"扫得到"与"用得了"是**同一件事**；扫不到的那些本来就用不了，列出来
///   才是画饼。
///
/// 界面那条口径照旧：**列出来的不一定真能建起来**（文件坏了、affix 写错了），
/// 所以"这本到底能不能用"最终仍以**真查一遍**为准。
pub fn 列出(用户目录: Option<&Path>) -> Vec<词典条目> {
    let mut 各方向: Vec<(来源, PathBuf)> = Vec::new();
    if let Some(目录) = 用户目录 {
        各方向.push((来源::用户, 目录.to_path_buf()));
    }
    for 目录 in 系统词典目录们() {
        各方向.push((来源::系统, 目录));
    }
    列出_从(各方向)
}

/// [`列出`] 的里子：给定**一串按先后排好的目录**，扫出词典、去重。
///
/// ⚠️ 拆出来是为了能测：直接调 [`列出`] 的话，容器里装着的那 25 份系统词典
/// 会把用例想验的东西（"用户那本盖住系统那本、`index` 不当标签"）淹掉。
fn 列出_从(各方向: Vec<(来源, PathBuf)>) -> Vec<词典条目> {
    let mut 出: Vec<词典条目> = Vec::new();
    let mut 见过: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (来源, 目录) in 各方向 {
        let Ok(条目们) = std::fs::read_dir(&目录) else {
            continue;
        };
        for 条 in 条目们.flatten() {
            let 路径 = 条.path();
            if !路径.is_file() {
                continue;
            }
            let 后缀 = 路径
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if 后缀 != "dic" {
                continue;
            }
            let Some(茎) = 路径.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            // ⚠️ `index` 是 wooorm 那种"一个目录一门语言"的写法里的文件名
            //（`dictionaries/en-US/index.dic`）——拿它当标签是错的，那一门的
            // 名字在**上一级目录**上。导入时我们把它摊平了，所以这里遇到
            // `index` 直接跳过。
            if 归一(茎) == "index" {
                continue;
            }
            if !见过.insert(归一(茎)) {
                continue; // 用户那本盖住了系统那本，别列两遍
            }
            出.push(词典条目 {
                tag: 茎.to_string(),
                来源,
                目录: 目录.display().to_string(),
            });
        }
    }
    出.sort_by(|a, b| a.tag.cmp(&b.tag));
    出
}

/// 从**包内路径**推出这一对词典的标签。
///
/// `dictionaries/en-US/index.aff` → `en-US`（拿上一级目录名）；
/// `en_US.aff`／`en_US/en_US.aff` → `en_US`（拿文件名）。
fn 标签_of(包内路径: &str) -> Option<String> {
    let 段: Vec<&str> = 包内路径.split('/').filter(|s| !s.is_empty()).collect();
    let 文件 = *段.last()?;
    let 茎 = 文件.rsplit_once('.').map(|(a, _)| a).unwrap_or(文件);
    if !茎.eq_ignore_ascii_case("index") {
        return Some(茎.to_string());
    }
    // `…/index.aff`：标签是它上一级那个目录名。
    Some(段.get(段.len().checked_sub(2)?)?.to_string())
}

/// 从 zip 里读出来的一份待写文件。
struct 拾到的 {
    标签: String,
    aff: Option<Vec<u8>>,
    dic: Option<Vec<u8>>,
}

/// 从一个 `.zip` 里把词典装进用户目录。返回装进去的**语言标签**。
///
/// # 容错（用户点名要的三条）
///
/// | 现场 | 怎么办 |
/// |---|---|
/// | 包里带一层目录（`en_US/en_US.aff`） | 只看**文件名**，不看它在包里哪一层 |
/// | wooorm 那种 `en-US/index.aff` | 文件名是 `index` 时，**拿它所在那一级的目录名**当标签 |
/// | **只有 `.dic`、没有 `.aff`** | 也收，写出一份最小的 affix 配置 |
///
/// ⚠️ 大小写不同的两份（`EN_us.dic`）：按**第一次见到的那一对**为准，不合并、
/// 不报错——用户看到一个装好的 tag 就够了，多问一句反而要他去判断大小写。
pub fn 导入压缩包(路径: &Path) -> Result<String> {
    let 字节 =
        std::fs::read(路径).map_err(|e| NotaError::other(format!("读不了这个文件：{e}")))?;
    let mut ar = zip::ZipArchive::new(std::io::Cursor::new(字节))
        .map_err(|e| NotaError::other(format!("这不是一个能读的 zip 包：{e}")))?;

    // 先把包里的 `.aff` / `.dic` 都读进内存（一份词典最大十几 MB，装得下）。
    let mut 对们: Vec<拾到的> = Vec::new();
    let mut 总: u64 = 0;
    for i in 0..ar.len() {
        let Ok(mut e) = ar.by_index(i) else { continue };
        if e.is_dir() {
            continue;
        }
        let 名字 = e.name().to_string();
        // ⚠️ macOS 打的包会带 `__MACOSX/` 那一层资源分叉（`._en_US.dic`）——
        // 它们**长得像词典但读进去是垃圾**，不收。
        let 末段 = 名字.rsplit('/').next().unwrap_or("");
        if 名字.starts_with("__MACOSX/") || 末段.starts_with("._") {
            continue;
        }
        let 后缀 = 末段
            .rsplit('.')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();
        if 后缀 != "aff" && 后缀 != "dic" {
            continue;
        }
        let Some(标签) = 标签_of(&名字) else { continue };
        let mut 内容 = Vec::new();
        // ⚠️ `take(上限 + 1)` 而不是 `read_to_end`：一条声称 4 GiB 的条目不能真读完。
        if e.by_ref().take(解包上限 + 1).read_to_end(&mut 内容).is_err() {
            continue;
        }
        总 += 内容.len() as u64;
        if 总 > 解包上限 {
            return Err(NotaError::other(
                "这个包里解出来的东西太大了，不像是一份词典".to_string(),
            ));
        }
        match 对们.iter_mut().find(|f| 归一(&f.标签) == 归一(&标签)) {
            Some(槽) => {
                if 后缀 == "aff" {
                    槽.aff = Some(内容);
                } else {
                    槽.dic = Some(内容);
                }
            }
            None => 对们.push(拾到的 {
                标签,
                aff: (后缀 == "aff").then_some(内容.clone()),
                dic: (后缀 == "dic").then_some(内容),
            }),
        }
    }

    // 优先挑**有词表**的那一对（没有 `.dic` 的 `.aff` 是一份配置，不是一本词典）。
    let Some(拾到) = 对们.into_iter().find(|f| f.dic.is_some()) else {
        return Err(NotaError::other(
            "这个包里没有找到 `.dic` 词表（一本词典至少要有它）".to_string(),
        ));
    };

    let 目标目录 = 用户词典目录()?;
    std::fs::create_dir_all(&目标目录)
        .map_err(|e| NotaError::other(format!("建不了词典目录：{e}")))?;
    let 词表 = 拾到.dic.expect("上面刚按 dic.is_some() 挑过");
    std::fs::write(目标目录.join(format!("{}.dic", 拾到.标签)), 词表)
        .map_err(|e| NotaError::other(format!("写不了词表：{e}")))?;
    let aff = 拾到.aff.unwrap_or_else(|| 最小affix().as_bytes().to_vec());
    std::fs::write(目标目录.join(format!("{}.aff", 拾到.标签)), aff)
        .map_err(|e| NotaError::other(format!("写不了 affix 配置：{e}")))?;

    Ok(拾到.标签)
}

/// 一份最小的 affix 配置：只声明编码，不带任何词缀规则。
///
/// ⚠️ 只在"包里只有 `.dic`"时兜底。代价如实写在这里：**复数、时态这些派生词
/// 会被标成错的**（那是 `.aff` 的活儿）。
pub fn 最小affix() -> &'static str {
    "SET UTF-8\n"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 连字符与下划线是同一门语言() {
        assert_eq!(归一("en-US"), 归一("en_US"));
        assert_eq!(归一("EN_us"), 归一("en_US"));
        assert_ne!(归一("en_US"), 归一("en_GB"));
    }

    #[test]
    fn 包里的标签按三种现场取() {
        // ① 平铺
        assert_eq!(标签_of("en_US.dic").unwrap(), "en_US");
        // ② 带一层目录（文件名还是标签）
        assert_eq!(标签_of("en_US/en_US.aff").unwrap(), "en_US");
        // ③ wooorm 那种 index.* —— 标签在上一级目录上
        assert_eq!(标签_of("dictionaries/en-US/index.aff").unwrap(), "en-US");
    }

    #[test]
    fn 用户在哪个目录就先看哪个() {
        let 根 = std::env::temp_dir().join(format!("nota-store-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&根);
        let 用户 = 根.join("user");
        std::fs::create_dir_all(&用户).unwrap();
        std::fs::write(用户.join("en_US.dic"), "1\nmine\n").unwrap();

        let (aff, dic) = 找一对("en_US", Some(&用户)).unwrap();
        assert!(dic.starts_with(&用户));
        assert!(aff.is_none(), "只有词表时 aff 该是 None，别凭空造一份");
        // ⚠️ 连字符写法也要找得到同一本（归一化那条）。
        assert!(找一对("en-us", Some(&用户)).is_some());
        // 这一门谁也不认识：给 None 而不是空的一对。
        assert!(找一对("zz_ZZ", Some(&用户)).is_none());
        let _ = std::fs::remove_dir_all(&根);
    }

    #[test]
    fn 列出来的不许重样_用户那本盖住系统那本() {
        let 根 = std::env::temp_dir().join(format!("nota-store-list-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&根);
        let 用户 = 根.join("user");
        let 系统 = 根.join("sys");
        std::fs::create_dir_all(&用户).unwrap();
        std::fs::create_dir_all(&系统).unwrap();
        // 两边都有 `en_US`（用户那本该赢），系统那边还多一份 `fr_FR`。
        std::fs::write(用户.join("de_DE.dic"), "1\nhallo\n").unwrap();
        std::fs::write(用户.join("en_US.dic"), "1\nmine\n").unwrap();
        std::fs::write(系统.join("en_US.dic"), "1\nours\n").unwrap();
        std::fs::write(系统.join("fr_FR.dic"), "1\nbonjour\n").unwrap();
        // `index.dic`（wooorm 那种）不拿它当标签。
        std::fs::write(用户.join("index.dic"), "1\nx\n").unwrap();
        std::fs::write(用户.join("notes.txt"), "x").unwrap();

        let 出 = 列出_从(vec![
            (来源::用户, 用户.clone()),
            (来源::系统, 系统),
        ]);
        let 标签们: Vec<&str> = 出.iter().map(|d| d.tag.as_str()).collect();
        assert_eq!(标签们, vec!["de_DE", "en_US", "fr_FR"]);
        assert_eq!(出.iter().find(|d| d.tag == "en_US").unwrap().来源, 来源::用户);
        assert_eq!(出.iter().find(|d| d.tag == "fr_FR").unwrap().来源, 来源::系统);
        let _ = std::fs::remove_dir_all(&根);
    }

    /// 导入那三条容错（用户点名的那三种现场）——从**真 zip** 走一遍。
    ///
    /// ⚠️⚠️ 这条用例**会改 `XDG_CONFIG_HOME`**（`用户词典目录()` 从那儿算）。
    /// 改环境变量在多线程下是危险的，所以这里两条纪律：
    /// ① **只有这一条用例碰那个变量**（别的用例一律把目录当参数传进来，
    ///    不调 `用户词典目录()`——`native.rs` 那两条就是那么写的）；
    /// ② 用一把**静态锁**把这一条串起来，跑完还原。
    static 环境锁: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn 导入一个真_zip_三种现场都落得下去() {
        use std::io::Write as _;
        let _闸 = 环境锁.lock().unwrap_or_else(|e| e.into_inner());
        let 根 = std::env::temp_dir().join(format!("nota-store-zip-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&根);
        std::fs::create_dir_all(&根).unwrap();
        let 旧 = std::env::var_os("XDG_CONFIG_HOME");
        std::env::set_var("XDG_CONFIG_HOME", &根);

        // ① 平铺；② 带一层目录；③ 只有 `.dic`（没有 `.aff`）
        for (档, 条目们) in [
            (
                "en_US",
                vec![("en_US.aff", "SET UTF-8\n"), ("en_US.dic", "2\nhello\nworld\n")],
            ),
            (
                "de_DE",
                vec![
                    ("de_DE/de_DE.aff", "SET UTF-8\n"),
                    ("de_DE/de_DE.dic", "1\nhallo\n"),
                ],
            ),
            ("fr_FR", vec![("fr_FR.dic", "1\nbonjour\n")]),
        ] {
            let 包 = 根.join(format!("{档}.zip"));
            let mut 写 = zip::ZipWriter::new(std::fs::File::create(&包).unwrap());
            let 选项 = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for (名, 文) in 条目们 {
                写.start_file(名, 选项).unwrap();
                写.write_all(文.as_bytes()).unwrap();
            }
            写.finish().unwrap();

            let 标签 = 导入压缩包(&包).expect("导入该成功");
            assert_eq!(标签, 档);
            let 落点 = 用户词典目录().unwrap();
            let 词表 = std::fs::read_to_string(落点.join(format!("{档}.dic"))).unwrap();
            assert!(词表.contains("2\n") || 词表.starts_with('1'), "词表内容不对：{词表}");
            // ⚠️ **`.aff` 缺了也要写出一份最小的**：只有 `.dic` 的包里那一份
            // 要是没落盘，下次读词典时 `找一对` 拿不到 aff（也能建，但那是
            // "碰巧能建"——`store.rs::最小affix` 那条明路才是设计。
            assert!(落点.join(format!("{档}.aff")).is_file(), "没落 aff：{档}");
        }

        // 一个什么都不是的包：给一句人话，不许静默成功。
        let 空包 = 根.join("空.zip");
        let mut 写 = zip::ZipWriter::new(std::fs::File::create(&空包).unwrap());
        写.start_file("readme.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        写.write_all(b"not a dictionary").unwrap();
        写.finish().unwrap();
        assert!(导入压缩包(&空包).is_err(), "一个没有 .dic 的包不该被当成词典");

        match 旧 {
            Some(v) => std::env::set_var("XDG_CONFIG_HOME", v),
            None => std::env::remove_var("XDG_CONFIG_HOME"),
        }
        let _ = std::fs::remove_dir_all(&根);
    }

    #[test]
    fn 导入的三种现场都认得出来() {
        let 平铺 = 标签_of("en_US.dic").unwrap();
        let 带目录 = 标签_of("en_US/en_US.aff").unwrap();
        let wooorm = 标签_of("dictionaries/en-US/index.dic").unwrap();
        assert_eq!((平铺.as_str(), 带目录.as_str(), wooorm.as_str()), ("en_US", "en_US", "en-US"));
    }
}
