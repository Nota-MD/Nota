//! **纯 Rust 的拼写后端**（2026-10-11）——zspell，读 `.aff` / `.dic`。
//!
//! # 为什么要有这一层（而不是只有 `mod.rs` 里那条命令行后端）
//!
//! 命令行那条路（`enchant-2` / `hunspell`）的毛病是**用户机器上得先装上它**：
//! 新装的 Windows 上什么都没有，Linux 上没装 `enchant2` 的发行版也一样——
//! 症状是"这个功能在这台机器上根本不存在"。而拼写检查这件事**不需要外部程序**：
//! hunspell 的词典格式是一份 `.aff`（词缀规则）＋ 一份 `.dic`（词表），纯数据。
//!
//! 于是有了这一层：**引擎编进程序**（`zspell`，纯 Rust、无 C 依赖、MIT/Apache
//! 那一家），**词典是数据**（用户目录 ＋ 系统目录，见 `store.rs`）。
//! 命令行那条**留着**——它是"这门语言我们手里没有词典、但系统里装了 enchant"
//! 时的退路（比如 `zh_CN` 在装了 `hunspell-zh` 的机器上真能用）。
//!
//! # 三条实测（2026-10-11，`en_US` 那份 47 554 词的 SCOWL 词表）
//!
//! | 事 | 数 |
//! |---|---|
//! | 建一本词典 | **155 ms**（所以**必须缓存**：一次打字就建一次是灾难） |
//! | 查 2000 个词 | **0.2 ms**（同一条命令行后端要起一次进程、几百毫秒） |
//! | 大小写 | `Hello` / `HELLO` 都判**对**（词典里只有 `hello`）；`Nota` 判错——**专有名词靠用户词表** |
//!
//! ⚠️ **连字符词一律判错**（实测 `Wi-Fi` / `e-mail` / `well-known` 全是 false，
//! 因为 SCOWL 那份 `.dic` 里一个带 `-` 的词条都没有）。所以**切词那一侧**把它们
//! 拆成几段、太短的段不查（`src/editor/spell-check.ts::切词`）——这一层收到什么
//! 就查什么，不做"看着像复合词就放过"的猜测。
//!
//! ⚠️ 建议（`suggest`）在 zspell 里是**未稳定**的（`unstable-suggestions` 这个
//! feature），质量也一般（实测 `helllo` → `hello` ✅，`wrold` → `wold` ❌）。
//! 右键菜单里它只是**第一条候选**：拿不到、或拿得不好，都不影响"这个词是错的"
//! 那个判断。所以这里**允许它退化成空表**，不因为它的质量返工整条路。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use zspell::Dictionary;

use super::store;

/// 建好的词典按**文件路径**缓存。
///
/// ⚠️ 不缓存的话每一次 `nota_spell_check` 都要重读 47 万个字节 ＋ 重算一遍
/// affix 表（155 ms），而前端每 600 ms 就来问一次——那是"打字就卡"。
///
/// ⚠️ 缓存的键是**词典文件的路径**：用户导入了同一门语言的新词典时，写的还是
/// 那个文件名（用户目录盖住系统目录），所以导入之后必须 [`清缓存`]。
/// 忘了清的症状很怪：**新装的词典不生效，重启软件才生效**。
static 词典缓存: OnceLock<Mutex<HashMap<String, Option<Arc<Dictionary>>>>> = OnceLock::new();

fn 缓存表() -> &'static Mutex<HashMap<String, Option<Arc<Dictionary>>>> {
    词典缓存.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 把建好的词典全部丢掉（导入词典、改用户词表之后叫一次）。
pub fn 清缓存() {
    if let Ok(mut 表) = 缓存表().lock() {
        表.clear();
    }
}

/// **纯 Rust 后端**。它自己不记状态——词典从 `store.rs` 现找，缓存是进程级的。
pub struct 纯Rust后端 {
    /// 用户词典目录（`store::用户词典目录()`）。`None` = 这台机器上算不出来
    ///（取不到家目录），那就只用系统目录。
    pub 用户目录: Option<PathBuf>,
}

impl 纯Rust后端 {
    pub fn 新建() -> Self {
        Self {
            用户目录: store::用户词典目录().ok(),
        }
    }

    /// 这门语言我们手里有词典吗（**有文件**；建不建得起来另说）。
    pub fn 有词典(&self, 语言: &str) -> bool {
        self.词典(语言).is_some()
    }

    /// 拿这门语言的词典（找不到、建不起来都给 `None`）。
    fn 词典(&self, 语言: &str) -> Option<Arc<Dictionary>> {
        let (aff, dic) = store::找一对(语言, self.用户目录.as_deref())?;
        let 键 = format!(
            "{}|{}",
            dic.display(),
            aff.as_ref().map(|p| p.display().to_string()).unwrap_or_default()
        );
        if let Ok(表) = 缓存表().lock() {
            if let Some(有) = 表.get(&键) {
                return 有.clone();
            }
        }
        let 建好 = 建词典(aff.as_deref(), &dic).map(Arc::new);
        if let Ok(mut 表) = 缓存表().lock() {
            表.insert(键, 建好.clone());
        }
        建好
    }

    /// 查一批词，返回**拼错的那几个的下标**（按入参顺序）。
    ///
    /// ⚠️ 只有"这本词典建不起来"才给 `None`（＝"不知道"）。**没有"这门语言没
    /// 词典"这个分支**：那种情况在 `mod.rs::组合后端` 那层就已经决定不走这条路了。
    pub fn 查(&self, 语言: &str, 词们: &[String]) -> Option<Vec<usize>> {
        let 词典 = self.词典(语言)?;
        // ⚠️ `check_word` 而不是 `check`：我们送进去的**已经是切好的词**
        //（切词在界面那一层，见 `src/editor/spell-check.ts`），这里再切一遍
        // 会让偏移量对不上下标。
        let mut 出 = Vec::new();
        for (i, 词) in 词们.iter().enumerate() {
            if !词典.check_word(词) {
                出.push(i);
            }
        }
        Some(出)
    }

    /// 给一个词的建议（拿不到就给空表）。
    pub fn 建议(&self, 语言: &str, 词: &str) -> Vec<String> {
        let Some(词典) = self.词典(语言) else {
            return Vec::new();
        };
        let 条目 = 词典.entry(词);
        条目
            .suggest()
            .map(|建议们| 建议们.into_iter().map(str::to_string).collect())
            .unwrap_or_default()
    }
}

/// 真去建一本词典：读两份文件、交给 zspell。
///
/// ⚠️ **`.aff` 缺了也给建**（拿 `store::最小affix()` 兜底）——用户点名的容错
///（「只有 `.dic` 也要能认」），代价是派生词会被标错，写在 `store.rs::最小affix`。
fn 建词典(aff: Option<&std::path::Path>, dic: &std::path::Path) -> Option<Dictionary> {
    let 词表 = std::fs::read_to_string(dic).ok()?;
    let 配置 = match aff {
        Some(p) => std::fs::read_to_string(p).unwrap_or_else(|_| store::最小affix().to_string()),
        None => store::最小affix().to_string(),
    };
    // ⚠️ 编码不是 UTF-8 的旧词典（ISO-8859-1 那一代）在这一步直接失败 →
    // 给 `None` → 界面说"这本词典读不了"，**不许**半读一半（半个词表建出来的
    // 词典会把大半个文档标红）。
    zspell::builder()
        .config_str(&配置)
        .dict_str(&词表)
        .build()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 缓存是进程级共享状态；Rust 测试默认并行，两个用例互相清缓存会让
    /// “第二次仍然拿到同一份”在全集里偶发失败。单独重跑又永远通过，所以
    /// 这里只串行化碰这份缓存的用例，不改变生产路径的任何语义。
    static 缓存测试锁: Mutex<()> = Mutex::new(());

    /// 拿**一份真词典**走完整条路：建、查、建议。
    ///
    /// ⚠️ 这份词典是**用例自己现写**的（不是某个系统包），所以它在任何机器上
    /// 都跑得起来——这一条正是"测试不许依赖这台机器装了什么"那条规矩的落点。
    #[test]
    fn 一份最小的词典也能建起来并查词() {
        let _锁 = 缓存测试锁.lock().unwrap();
        let 根 = std::env::temp_dir().join(format!("nota-native-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&根);
        std::fs::create_dir_all(&根).unwrap();
        std::fs::write(根.join("zz_ZZ.aff"), store::最小affix()).unwrap();
        std::fs::write(根.join("zz_ZZ.dic"), "2\nhello\nworld\n").unwrap();

        let 后端 = 纯Rust后端 {
            用户目录: Some(根.clone()),
        };
        assert!(后端.有词典("zz_ZZ"));
        assert!(!后端.有词典("yy_YY"), "没这一门时不许说'有'");

        let 词们: Vec<String> = ["hello", "helllo", "world"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(后端.查("zz_ZZ", &词们), Some(vec![1]));
        // ⚠️ 大小写：词典里只有小写 `hello`，而句首那个 `Hello` 不许标错
        //（实测 zspell 自己处理这一条，这里把它钉住——哪天换引擎时要重新量）。
        assert_eq!(后端.查("zz_ZZ", &["Hello".to_string()]), Some(vec![]));
        // 这门语言没词典：`None`（＝"不知道"），不是"一个都没错"。
        assert_eq!(后端.查("yy_YY", &词们), None);

        清缓存();
        let _ = std::fs::remove_dir_all(&根);
    }

    /// ⚠️ 缓存那条：**同一个键不许建两遍**（155 ms × 每次打字）。
    #[test]
    fn 同一份词典只建一次() {
        let _锁 = 缓存测试锁.lock().unwrap();
        let 根 = std::env::temp_dir().join(format!("nota-native-cache-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&根);
        std::fs::create_dir_all(&根).unwrap();
        std::fs::write(根.join("cc_CC.aff"), store::最小affix()).unwrap();
        std::fs::write(根.join("cc_CC.dic"), "1\nhello\n").unwrap();
        let 后端 = 纯Rust后端 {
            用户目录: Some(根.clone()),
        };
        清缓存();
        let a = 后端.词典("cc_CC").unwrap();
        let b = 后端.词典("cc_CC").unwrap();
        assert!(Arc::ptr_eq(&a, &b), "第二次该拿到缓存里那一份");
        // 清掉之后是**新建的一份**（用户导入新词典之后要走的那条路）。
        清缓存();
        let c = 后端.词典("cc_CC").unwrap();
        assert!(!Arc::ptr_eq(&a, &c));
        清缓存();
        let _ = std::fs::remove_dir_all(&根);
    }
}
