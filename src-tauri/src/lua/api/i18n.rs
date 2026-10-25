//! `nota.i18n` —— 插件自己的文案表。
//!
//! # 用户要的是什么（2026-09-25 原话）
//!
//! > 插件也支持。插件必须包含英语。如果应用语言在插件语言列表内，则直接使用；
//! > 否则，显示"此插件不支持您的语言"，并且使用英语。
//!
//! 规矩本身（归一化、精确/前缀匹配、`en` 兜底）在 `crate::lang`，那边是
//! **唯一**一处解释"什么算有效语言"的地方。这个文件只做三件跟插件有关的事：
//!
//! 1. **协商**：拿宿主此刻的语言去清单的 `langs` 里找（[`装`]）；
//! 2. **读表**：把 `lang/<tag>.toml` 读成一张 `键 → 字` 的表（纯函数在
//!    `crate::lang::读语言文件`，这里只管找路径、读文件、报错的口径）；
//! 3. **装表**：给插件一张 `nota.i18n`（[`build`]）。
//!
//! # 为什么它**不需要任何能力**（和 `nota.diff` 同一条判据）
//!
//! 它只读**插件自己目录里**那一份 `lang/<tag>.toml`——那是插件作者自己带的文件，
//! 不是用户的文档、不是任意路径。所以它不碰"清单之外的东西"，不需要申请
//! `fs.read`。⚠️ 插件**不能**用它读别的路径：`text` 收的是**键**，路径是宿主
//! 自己拼的（`dir/lang/<规范过的 tag>.toml`），拼法写死在 [`语言包::文件`] 里。
//!
//! # 表是空的会怎样：**缺键就用原文**
//!
//! `nota.i18n.text(key)` 查不到就返回 `nil`。于是插件里那句惯用写法是
//!
//! ```lua
//! local function T(s) return nota.i18n.text(s) or s end
//! ```
//!
//! ——**键就是作者自己写下的那句原文**，查不到就原样用。
//!
//! ⚠️ **原文是英语**（2026-09-28 起；用户定的方向是"英语才是主语言，中文是
//! 翻译包"）。所以 `T("Stop preview")`，译文写进 `lang/zh-CN.toml`
//! （`"Stop preview" = "停止预览"`）。⚠️ **`lang/en.toml` 不写了**——英语是原文，
//! 那份表活着的每一天都只是在把代码里的字抄一遍（四个内置插件的那一份翻转时
//! 已删）。清单里的 `langs` **仍然必须含 `en`**（[`插件兜底`] 那条要求没变），
//! 只是不再要求有一份对应的文件。
//!
//! 带来的三件事：
//!
//! 1. 表可以**只写要翻译的那些键**：英语作者的 `lang/zh-CN.toml` 是空的，
//!    中文作者那份里也只有中文与英语写法不一样的那些条目；
//!
//! ⚠️ **保留键**（不是插件自己的文案，宿主认得的）现在是两个：`name`
//! 和 `description`——它们分别盖掉清单里的 `name` / `description`（见
//! [`语言包::名字`] / [`语言包::描述`]）。2026-09-27 加的 `description`：
//! 那天用户报「拓展语言混杂」，根因是**列表里那一行简介只有中文**——
//! 名字会随语言变、简介不会，一句话里两种语言。
//! 2. "表里漏了这条键"、"语言文件写坏了"、"压根没声明 `langs`"三种情况退化成
//!    同一个行为：**看见作者的原文**，而不是看见 `panel.title` 或一片空白。
//!    这比"宿主替它兜底"结实——兜底得有东西可兜，而宿主不认识插件的键；
//! 3. 键是给人看的原文，不是 `panel.title` 那种代号：插件作者不必先学会一套
//!    命名约定，写一句 `T("Could not find Node.js")` 就完了。
//!
//! ⚠️ 代价说在明处：**改了原文就等于改了键**，那份翻译会悄悄失效（表现为退回原文，
//! 不会报错）。所以译文表里的键是"那一刻的原文"——这不是缺陷，是这种写法的代价，
//! 换来的是插件作者零成本入场。
//!
//! ⚠️ 它与前端那半边（`src/i18n/index.ts`）是**同一条规矩**，两边一起改：
//! 用户/作者只需要记一次。

use std::collections::HashMap;
use std::path::PathBuf;

use mlua::{Lua, Table, Value};

use super::mlua_to_nota;
use crate::error::NotaError;
use crate::lang;
use crate::plugin::manifest::Manifest;

/// 一个插件这次**实际在用**的文案表，以及"这份表是怎么选出来的"。
///
/// 存在 `LuaPlugin` 上（不是每次要用再算一遍）：`PluginInfo` 要拿它算
/// 界面上那个名字，而 `nota.i18n` 那张表要拿它填 `lang` / `ok`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct 语言包 {
    /// 插件在清单里声明了 `langs` 吗（`false` = 不参与协商，也不该显示提示）。
    pub 声明: bool,
    /// 实际用的是那一份表。`None` = 没声明 `langs`（用插件代码里写着的字）。
    pub lang: Option<String>,
    /// 命中了吗。`false` + [`Self::声明`] = 界面上要说那句
    /// 「此插件不支持您的语言」（现在给的是英语那份）。
    pub ok: bool,
    /// 表里的文案。**含两个保留键**：`name`、`description`
    /// （插件在这个语言下叫什么名字、那一行简介怎么写）。
    pub 表: HashMap<String, String>,
}

/// 「没声明 `langs`」那一份：**`ok` 是 `true`**。
///
/// ⚠️ 这是本类型唯一一处需要人写 `Default` 的地方，也是唯一一处容易写反的地方：
/// `bool` 的默认值是 `false`，照那样推出来的默认值会把每个"没声明语言"的插件
/// 都判成「不支持你的语言」——界面上就是一片无中生有的提示。所以手写这一份，
/// 并让 `ok` 默认成立：**没什么好协商的时候，也就没什么好抱怨的**。
impl Default for 语言包 {
    fn default() -> Self {
        Self {
            声明: false,
            lang: None,
            ok: true,
            表: HashMap::new(),
        }
    }
}

impl 语言包 {
    /// 插件在这个语言下的**名字**（保留键 `name`）。没写就没有。
    ///
    /// ⚠️ 它**覆盖清单里的 `name`**（界面上页签名、插件列表那一行）。理由：
    /// 清单里的 `name` 是静态的，而"这个名字该怎么写"是随语言变的
    /// （`AI 助手` / `AI Assistant`）。⚠️ 但**不覆盖** id——id 是身份，
    /// 事件通道、命令名、账本全靠它，一个字都不能随语言变。
    pub fn 名字(&self) -> Option<&str> {
        self.表.get("name").map(String::as_str)
    }

    /// 插件在这个语言下的**简介**（保留键 `description`）。没写就没有。
    ///
    /// ⚠️ 它**覆盖清单里的 `description`**（插件列表那一行的小字），理由与
    /// [`Self::名字`] 同一条：清单是静态的，而"这句话该怎么写"随语言变。
    ///
    /// ⚠️ 2026-09-27 补的。在此之前**只有名字**能随语言变，于是界面上出现
    /// 一句话里两种语言：标题 `AI assistant`（英语）、下面那行简介还是中文。
    /// 用户当天报的就是这个（「拓展语言混杂」）。
    ///
    /// ⚠️ **主语言是英语**（用户 2026-09-27 定）：清单里的 `name` / `description`
    /// 一律写英语，中文这一份是**翻译**，写在 `lang/zh-CN.toml` 里。
    /// 这条与 [`crate::lang::插件兜底`]（英语是所有插件都必须给的那一门）是同一条
    /// 规矩的两半：**给不出英语的插件，别人就没有能兜住的那一份**。
    pub fn 描述(&self) -> Option<&str> {
        self.表.get("description").map(String::as_str)
    }

    /// 取一条文案。查不到给 `None`（插件的 `or "英文原文"` 接住）。
    pub fn 取(&self, key: &str) -> Option<&str> {
        self.表.get(key).map(String::as_str)
    }

    /// 这个语言的文案文件在哪儿。**名字按规范写法找**（`zh-CN.toml`）。
    ///
    /// ⚠️ 清单里写 `zh_CN` 也认（协商那边归一化过），但**文件名一律要求写成
    /// 规范的 BCP-47**：不然同一门语言会同时存在 `zh_CN.toml` / `zh-cn.toml`
    /// 几个写法，作者自己都记不住该用哪个。一条规矩，错了就在日志里说清楚。
    fn 文件(dir: &std::path::Path, tag: &str) -> PathBuf {
        dir.join("lang").join(format!("{}.toml", lang::规范(tag)))
    }
}

/// 给某个插件**协商 + 读表**。
///
/// `应用语言` 是宿主此刻在说的语言（`crate::lang::有效语言` 算出来的那个）。
pub fn 装(manifest: &Manifest, 应用语言: &str) -> 语言包 {
    let id = &manifest.meta.id;
    let langs = &manifest.meta.langs;

    // 没声明 `langs`：**不参与协商**，也不显示那句提示。它是"只用英语写"的插件，
    // 而英语恰好就是兜底——所以"不支持你的语言"这句话对它没有意义。
    if langs.is_empty() {
        return 语言包::default();
    }

    let (tag, ok) = match lang::匹配(应用语言, langs) {
        Some(t) => (t, true),
        None => (lang::插件兜底.to_owned(), false),
    };

    // ⚠️ 文件读不到 / 写坏了**不改 `ok`**（2026-09-25 定的口径）。
    //
    // `ok` 回答的是用户那句话里的问题——**应用语言在不在插件的语言列表里**
    // （「如果应用语言在插件语言列表内，则直接使用；否则，显示…」）。文件在不在
    // 是另一件事：表空了就退回插件自己写下的原文（`text() or 原文`），
    // 而那**恰好**就是"只用英语写"的插件（`langs = ["en"]`、一份表都不带，
    // 最常见的一种）该有的样子——拿文件缺失去判 `ok=false`，会让这类插件
    // 平白挂上一句「此插件不支持您的语言」，恰好把它说反。
    //
    // 对作者来说这不是一笔糊涂账：加载时会记一条（走调试闸门，见 `log.rs`）。
    //
    // ⚠️ 于是**英语下这一条是正常的、不是缺陷**（2026-09-29 查过一次）：四个内置插件
    // 都声明 `langs = ["zh-CN", "en"]` 而只带 `lang/zh-CN.toml`——`en.toml` 按约定
    // 不写（英语是插件的原文语言，那张表只是在抄一遍自己，见 `plugin/manifest.rs`
    // 文件头）。判据：**只有 tag 是 `en` 时才会每次启动出现这几条**（内置插件共 4 条）；
    // 换成别的 tag 还出现这行，才是真问题——声明了却少那份表。
    let 表 = 读(&manifest.dir, &tag).unwrap_or_else(|原因| {
        crate::日志!(
            "[nota:{id}] missing lang/{}.toml ({原因}); falling back to source strings",
            lang::规范(&tag)
        );
        HashMap::new()
    });

    语言包 {
        声明: true,
        lang: Some(lang::规范(&tag)),
        ok,
        表,
    }
}

/// 读一份语言文件。读不到 / 写坏了都如实返回原因（由 [`装`] 决定怎么处理）。
fn 读(dir: &std::path::Path, tag: &str) -> std::result::Result<HashMap<String, String>, String> {
    let 路 = 语言包::文件(dir, tag);
    let 文本 = std::fs::read_to_string(&路)
        .map_err(|e| format!("读不了 {}：{e}", 路.display()))?;
    lang::读语言文件(&文本)
}

/// 组装 `nota.i18n`。
///
/// 四个成员，各自的意思写在 [`语言包`] 上，插件那边只需要记：
/// **`text(key) or "英文原文"`**。
pub fn build(lua: &Lua, 包: &语言包, 应用语言: &str) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;
    t.set("app_lang", 应用语言.to_owned()).map_err(mlua_to_nota)?;
    // 没声明 `langs`：`nil` 是"没得协商"，不是"不知道自己在说什么语言"。
    // 插件作者要那个值就读 `app_lang`（它永远在）。
    match &包.lang {
        Some(l) => t.set("lang", l.clone()).map_err(mlua_to_nota)?,
        None => t.set("lang", Value::Nil).map_err(mlua_to_nota)?,
    }
    t.set("ok", 包.ok).map_err(mlua_to_nota)?;

    let 表 = 包.表.clone();
    let text = lua
        .create_function(move |_, key: String| Ok(表.get(&key).cloned()))
        .map_err(mlua_to_nota)?;
    t.set("text", text).map_err(mlua_to_nota)?;

    Ok(t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// 造一份最小清单：只有 id / langs / dir 三项跟这次要测的有关。
    fn 清单(dir: PathBuf, langs: &[&str]) -> Manifest {
        use crate::plugin::manifest::{PluginMeta, NOTA_PLUGIN_API_VERSION};
        Manifest {
            meta: PluginMeta {
                id: "nota.test".to_owned(),
                name: "Test".to_owned(),
                version: "0.1.0".to_owned(),
                api: NOTA_PLUGIN_API_VERSION,
                entry: "main.lua".to_owned(),
                description: String::new(),
                authors: Vec::new(),
                license: "BSD-2-Clause".to_owned(),
                capabilities: Vec::new(),
                langs: langs.iter().map(|s| (*s).to_owned()).collect(),
            },
            dir,
            capabilities: Vec::new(),
            devserver: None,
            update: None,
            // 这份清单不声明任何设置（2026-10-04 加的那一格；这一组用例
            // 测的是语言协商，与设置无关）。
            settings: Vec::new(),
        }
    }

    fn 建(dir: &std::path::Path, tag: &str, 内容: &str) {
        std::fs::create_dir_all(dir.join("lang")).unwrap();
        std::fs::write(dir.join("lang").join(format!("{tag}.toml")), 内容).unwrap();
    }

    fn 临时目录(名: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("nota-i18n-test-{名}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn 不声明langs就不协商也不提示() {
        let dir = 临时目录("没声明");
        let 包 = 装(&清单(dir.clone(), &[]), "zh-CN");
        assert!(!包.声明);
        assert_eq!(包.lang, None);
        assert!(包.ok, "没声明 `langs` 的拓展不该被判成「不支持你的语言」");
        assert!(包.表.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 命中的语言用那一份_没命中就用英语并说一句() {
        let dir = 临时目录("命中");
        建(&dir, "zh-CN", "name = \"中文名\"\ndescription = \"中文简介\"\nhint = \"你好\"\n");
        建(&dir, "en", "name = \"English name\"\nhint = \"hi\"\n");

        let 中文 = 装(&清单(dir.clone(), &["zh-CN", "en"]), "zh-CN");
        assert!(中文.ok);
        assert_eq!(中文.lang.as_deref(), Some("zh-CN"));
        assert_eq!(中文.名字(), Some("中文名"));
        assert_eq!(中文.描述(), Some("中文简介"));
        assert_eq!(中文.取("hint"), Some("你好"));

        let 英文 = 装(&清单(dir.clone(), &["zh-CN", "en"]), "ja-JP");
        assert!(!英文.ok, "日语不在 langs 里 → 说「不支持你的语言」");
        assert_eq!(英文.lang.as_deref(), Some("en"));
        assert_eq!(英文.名字(), Some("English name"));
        // ⚠️ 英语那份表里没写 `description` → 给 `None`，由调用方退回清单里那一句
        // （主语言是英语，清单里写的**就是**英语，所以"没写"是常态，不是缺陷）。
        assert_eq!(英文.描述(), None, "表里没写就退回清单，别凭空造一句");

        // 前缀命中：应用 zh-CN、插件只有 zh。
        let dir2 = 临时目录("前缀");
        建(&dir2, "zh", "name = \"中文\"\n");
        建(&dir2, "en", "name = \"English\"\n");
        let 粗 = 装(&清单(dir2.clone(), &["zh", "en"]), "zh-CN");
        assert!(粗.ok);
        assert_eq!(粗.lang.as_deref(), Some("zh"));

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&dir2);
    }

    #[test]
    fn 缺文件只退回原文_不把话说过头() {
        // ⚠️ 这条钉的是 2026-09-25 定的口径：**`ok` 只看清单里有没有这门语言**，
        // 不看文件在不在。理由见 [`装`] 里那段——最常见的插件（`langs = ["en"]`、
        // 一份表都不带）走的就是"文件不在"这条路，判错了会把话说反。
        let dir = 临时目录("缺文件");
        let 包 = 装(&清单(dir.clone(), &["zh-CN", "en"]), "zh-CN");
        assert!(包.ok, "清单里有 zh-CN，就不该说「不支持你的语言」");
        assert_eq!(包.lang.as_deref(), Some("zh-CN"));
        assert!(包.表.is_empty(), "表空了，交给拓展的 `or 原文` 兜底");
        assert_eq!(包.名字(), None);

        // 英语源的插件：只声明 en、不带任何表——同样不算"不支持"。
        let 英 = 装(&清单(dir.clone(), &["en"]), "zh-CN");
        assert!(!英.ok, "zh-CN 不在它的列表里 → 说这句，用 en");
        assert_eq!(英.lang.as_deref(), Some("en"));
        assert!(英.表.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 表里没有那条键时text给nil() {
        let dir = 临时目录("缺键");
        建(&dir, "en", "a = \"甲\"\n");
        let 包 = 装(&清单(dir.clone(), &["en"]), "en");

        let lua = Lua::new();
        let t = build(&lua, &包, "en").unwrap();
        assert_eq!(t.get::<Option<String>>("app_lang").unwrap().as_deref(), Some("en"));
        assert_eq!(t.get::<Option<String>>("lang").unwrap().as_deref(), Some("en"));
        assert!(t.get::<bool>("ok").unwrap());
        let text: mlua::Function = t.get("text").unwrap();
        assert_eq!(text.call::<Option<String>>("a").unwrap().as_deref(), Some("甲"));
        // ⚠️ 查不到必须给 `nil`，不是空串也不是键名：插件那边靠 `or "英文原文"` 兜底。
        assert_eq!(text.call::<Option<String>>("没有这条").unwrap(), None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 没声明langs时lang是nil而app_lang还在() {
        let dir = 临时目录("nil");
        let 包 = 装(&清单(dir.clone(), &[]), "zh-CN");
        let lua = Lua::new();
        let t = build(&lua, &包, "zh-CN").unwrap();
        assert_eq!(t.get::<Option<String>>("lang").unwrap(), None);
        assert_eq!(
            t.get::<Option<String>>("app_lang").unwrap().as_deref(),
            Some("zh-CN"),
            "应用在说哪种语言，拓展永远读得到"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 文件名按规范写法找() {
        // 清单里写 `zh_CN`（下划线，手写清单的人常这么写），文件名要按 zh-CN.toml 找。
        let dir = 临时目录("规范");
        建(&dir, "zh-CN", "hint = \"下划线也认\"\n");
        let 包 = 装(&清单(dir.clone(), &["zh_CN", "en"]), "zh-CN");
        assert!(包.ok, "清单里的下划线写法要能被归一化");
        assert_eq!(包.取("hint"), Some("下划线也认"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
