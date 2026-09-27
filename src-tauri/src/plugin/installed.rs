//! 已装插件在**本地**的状态：开没开着，以及当初装进来时验签验出了什么。
//!
//! 落盘在 `$XDG_CONFIG_HOME/nota/plugins.toml`（[`crate::paths::plugin_state_file`]）。
//!
//! # 形状
//!
//! ```toml
//! [plugins."nota.git"]
//! enabled = true
//! signature = "verified"          # verified / unknown / unsigned
//! key_id = "a1b2c3d4e5f60718"
//! public_key = "…base64…"         # 签名者的公钥，给「信任」按钮用
//! ```
//!
//! ⚠️ **只记"用户做过决定"的那些**。没出现在这个文件里的插件走
//! [`Installed::没记过时开不开`] 那条默认值——所以这个文件小、可读、
//! 而且**删掉它就等于恢复出厂**（这一点是刻意的，写在 `docs/11` §1.6）。
//!
//! # ⚠️ 默认值分两种构建，这是刻意的
//!
//! - **调试构建**：没记过 = 开着。开发时改完 Lua 存盘就该看到效果，
//!   不该还要先去面板里打开一次；仓库里新加一个插件也该直接出现在界面上。
//! - **发布构建**：没记过 = 关着。用户装应用时不该凭空多出一堆他没要过的东西
//!   ——发布版**连内置插件都不打包**（见 `tauri.conf.json` 的 `bundle.resources`），
//!   所以一条干净的发布版装完之后，「插件」页是空的，全靠用户自己从文件装。
//!
//! ⚠️ **这条默认值不属于 `Settings`**（`src-tauri/src/settings/`）。那份是"外观与编辑
//! 口径"的一张**标量表**，而这里是一张 **id 名单**：形状不同（`Settings` 里
//! 一个 `Vec`/`HashMap` 都没有）、生命周期也不同（装着插件的时候它一直在变）。
//! 并进去会让 `nota_settings_set` 那条"整份替换 + 落盘"的口径多带一份容易丢的名单。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

/// 装进来时的验签结论。
///
/// ⚠️ **没有"验签失败"这一档**——那不是一种状态，是一个错误：签名对不上的包
/// **根本装不进来**（见 [`super::package::包::验签`]）。这里只记"装进来了，
/// 而且当时是这样"。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Signature {
    /// 签名对上了，而且签名者那把公钥在信任库里。
    Verified,
    /// 签名对上了，但签名者不在信任库里（自签、新作者、或者用户还没点过「信任」）。
    Unknown,
    /// 包里没有签名块（开发态的文件夹、或者打包时没签）。
    Unsigned,
}

impl Signature {
    /// 给界面看的一句话。**短**：它是插件行上一个标签，不是一段解释。
    pub fn 说明(self) -> &'static str {
        match self {
            Self::Verified => "已验证",
            Self::Unknown => "未知签名者",
            Self::Unsigned => "未签名",
        }
    }
}

/// 一个插件在本地的那几笔账。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PluginRecord {
    #[serde(default)]
    pub enabled: bool,
    /// 装进来时的验签结论。老记录里没有这一栏 = `None`（不是 `Unsigned`——
    /// 那会谎称"当初验过，是没签名的"）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<Signature>,
    /// 签名者的公钥指纹（签名生效时才有）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_id: Option<String>,
    /// 签名者的**公钥本身**（base64 原文，签名生效时才有）。
    ///
    /// ⚠️ 留着它是为了「信任」那颗按钮能**事后**点：装完之后原包文件不在手里了
    /// （签名块也不落进安装目录——[`super::package::包::从文件们`] 会把它摘掉），
    /// 而信任一把钥匙要的是**公钥**本身，不是指纹。指纹是算出来的，反推不回去。
    ///
    /// 公钥不是秘密，存在这里没有风险；**私钥从来不在这台机器上**（`docs/11` §1.6）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub public_key: Option<String>,
}

/// 一个插件的**来路**：装进来的时候验出了什么，以及签名者是谁。
///
/// 三样一起写而不是分三次写：它们是"同一件事的三个侧面"，分三次落盘就会出现
/// "结论记上了、指纹还没记"这种中间态（而 `save` 每次都要写一整份文件）。
pub struct 来路 {
    pub 结: Signature,
    pub key_id: Option<String>,
    pub public_key: Option<String>,
}

impl 来路 {
    /// 没有签名的包：三样都是空的。
    pub fn 没签() -> Self {
        Self {
            结: Signature::Unsigned,
            key_id: None,
            public_key: None,
        }
    }
}

/// 落盘形状。`toml::to_string_pretty` 要求顶层是表，所以只能是个结构体。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct 存档 {
    #[serde(default)]
    plugins: BTreeMap<String, PluginRecord>,
}

/// 「哪些插件开着」＋「当初验签验出了什么」。
pub struct Installed {
    map: BTreeMap<String, PluginRecord>,
    /// 没记过的插件开不开。**由构建档决定**，见文件头。
    ///
    /// ⚠️ 它是**字段**而不是直接读 `cfg!`：这样用例能把两个档都钉一遍
    /// （`cfg!` 在测试进程里恒等于当时那次构建的档，钉不了另一半）。
    没记过: bool,
}

impl Installed {
    /// 没记过时开不开。**当前构建档**的答案。
    pub fn 没记过时开不开() -> bool {
        cfg!(debug_assertions)
    }

    /// 从文本读。**纯函数**（用例钉的就是这一半）。
    pub fn 从文本(text: &str, 没记过: bool) -> Self {
        let 存档 { plugins } = toml::from_str(text).unwrap_or_default();
        Self {
            map: plugins,
            没记过,
        }
    }

    /// 当前构建档的默认值 + 从文本读。
    pub fn 从文本_按当前档(text: &str) -> Self {
        Self::从文本(text, Self::没记过时开不开())
    }

    /// 读盘。**读不了就当没记过**——一个坏掉的配置不该让应用打不开，
    /// 而且这条降级是安全的：回到"按构建档的默认值"。
    pub fn load() -> Self {
        let text = crate::paths::plugin_state_file()
            .ok()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .unwrap_or_default();
        Self::从文本_按当前档(&text)
    }

    pub fn 到文本(&self) -> Result<String> {
        let 存档 = 存档 {
            plugins: self.map.clone(),
        };
        toml::to_string_pretty(&存档).map_err(|e| {
            NotaError::other(format!("拓展状态写不成 TOML（这是个 bug，请上报）：{e}"))
        })
    }

    pub fn save(&self) -> Result<()> {
        let path = crate::paths::plugin_state_file()?;
        if let Some(父) = path.parent() {
            crate::paths::ensure_dir(父)?;
        }
        std::fs::write(&path, self.到文本()?).map_err(|source| NotaError::Write { path, source })
    }

    /// 这个插件开着没有。**没记过**就走构建档的默认值。
    pub fn is_enabled(&self, id: &str) -> bool {
        self.map
            .get(id)
            .map(|r| r.enabled)
            .unwrap_or(self.没记过)
    }

    pub fn 记过没有(&self, id: &str) -> bool {
        self.map.contains_key(id)
    }

    pub fn record(&self, id: &str) -> Option<&PluginRecord> {
        self.map.get(id)
    }

    fn 取或建(&mut self, id: &str) -> &mut PluginRecord {
        let 默认 = self.没记过;
        self.map.entry(id.to_owned()).or_insert(PluginRecord {
            enabled: 默认,
            ..Default::default()
        })
    }

    /// 开/关。**落盘**——不落盘的话下次启动它又按默认值回来了，
    /// 而用户看到的是"我明明关过它"。
    pub fn set_enabled(&mut self, id: &str, on: bool) -> Result<()> {
        self.取或建(id).enabled = on;
        self.save()
    }

    /// 记下这个插件是怎么装进来的（验签结论 + 公钥指纹 + 公钥）。
    pub fn 记来路(&mut self, id: &str, 来路: 来路) -> Result<()> {
        let r = self.取或建(id);
        r.signature = Some(来路.结);
        r.key_id = 来路.key_id;
        r.public_key = 来路.public_key;
        self.save()
    }

    /// 忘掉一个插件（卸掉时调）。**连"开关过"那笔账一起忘**——
    /// 留着的话，下次再装同一个 id 会莫名其妙地沿用上一次的开关。
    pub fn 忘掉(&mut self, id: &str) -> Result<()> {
        self.map.remove(id);
        self.save()
    }
}

/// 把公钥算成指纹：`sha256(公钥原始 32 字节)` 的前 8 字节，十六进制，16 个字符。
///
/// ⚠️ **指纹是算出来的，不是包里的一个字段说了算**。包里那份 `key_id` 只是
/// "方便人看"，验签时会拿公钥重算一遍再对比（对不上就拒）——否则改一个
/// `key_id` 就能冒充别人已经信任的那把钥匙。
pub fn 公钥指纹(public_key: &[u8; 32]) -> String {
    use sha2::{Digest, Sha256};
    let d = Sha256::digest(public_key);
    d.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ⚠️ 这条钉的是**发布档的行为**：文件里没有的插件默认**关着**。
    /// 用户原话是「默认啥都没有」——发布版连内置插件都不打包，所以一条干净的
    /// 发布版装完之后，「插件」页就该是空的。
    #[test]
    fn 发布档里没记过的插件是关着的() {
        let s = Installed::从文本("", false);
        assert!(!s.is_enabled("nota.git"));
        assert!(!s.记过没有("nota.git"));
    }

    /// ⚠️ 这条钉的是**调试档的行为**：没记过 = 开着（「调试环境默认全都装」）。
    /// 两档的差别只在这一条默认值上，所以两条要并排放着看。
    #[test]
    fn 调试档里没记过的插件是开着的() {
        let s = Installed::从文本("", true);
        assert!(s.is_enabled("nota.git"));
    }

    /// 记过之后就按记的那份来，**默认值不再参与**。
    #[test]
    fn 记过的按记的来() {
        let s = Installed::从文本(
            r#"
[plugins."nota.git"]
enabled = false
"#,
            true, // 调试档也照样关着——用户显式关过的不能被默认值顶回来
        );
        assert!(!s.is_enabled("nota.git"));
        assert!(s.is_enabled("nota.ai"), "别的拓展照旧走默认值");
    }

    /// ⚠️ 这条是**安全用例**：`key_id` 由公钥算出来，不许被文件里那一栏带跑。
    #[test]
    fn 公钥指纹只由公钥决定() {
        let a = [1u8; 32];
        let b = [2u8; 32];
        assert_eq!(公钥指纹(&a), 公钥指纹(&a));
        assert_ne!(公钥指纹(&a), 公钥指纹(&b));
        assert_eq!(公钥指纹(&a).len(), 16, "指纹是 8 字节的十六进制");
        assert!(公钥指纹(&a).chars().all(|c| c.is_ascii_hexdigit()));
    }

    /// 写出来的能读回来，而且**形状是给人看的那一种**（一行一个 id，不是一坨 JSON）。
    #[test]
    fn 存了能读回来() {
        let mut s = Installed::从文本("", true);
        s.set_enabled("nota.git", false).unwrap();
        s.记来路(
            "nota.git",
            来路 {
                结: Signature::Verified,
                key_id: Some("abc123".into()),
                public_key: Some("AAAA".into()),
            },
        )
        .unwrap();
        let text = s.到文本().unwrap();
        assert!(text.contains("[plugins.\"nota.git\"]"), "实际：{text}");
        assert!(text.contains("enabled = false"), "实际：{text}");
        assert!(text.contains("signature = \"verified\""), "实际：{text}");

        let 回 = Installed::从文本(&text, true);
        assert!(!回.is_enabled("nota.git"), "写盘再读回来开关不能变");
        assert_eq!(
            回.record("nota.git").and_then(|r| r.signature),
            Some(Signature::Verified)
        );
        assert_eq!(
            回.record("nota.git").and_then(|r| r.key_id.as_deref()),
            Some("abc123")
        );
        // ⚠️ 公钥那一栏也要能读回来：它是「信任」按钮事后还能点得动的唯一依据。
        assert_eq!(
            回.record("nota.git").and_then(|r| r.public_key.as_deref()),
            Some("AAAA")
        );
    }

    /// 没签名的包：三样都空着，而且**不写成空字符串**（那看着像"验过，是空的"）。
    #[test]
    fn 没签名的包来路是空着的() {
        let mut s = Installed::从文本("", true);
        s.记来路("a.b", 来路::没签()).unwrap();
        let r = s.record("a.b").unwrap();
        assert_eq!(r.signature, Some(Signature::Unsigned));
        assert!(r.key_id.is_none());
        assert!(r.public_key.is_none());
        let text = s.到文本().unwrap();
        assert!(!text.contains("key_id"), "实际：{text}");
    }

    /// 卸掉之后**连"开关过"那笔账一起忘**——不然再装同一个 id 会莫名其妙沿用上次的开关。
    #[test]
    fn 忘掉是连开关一起忘() {
        let mut s = Installed::从文本("", true);
        s.set_enabled("nota.git", false).unwrap();
        s.忘掉("nota.git").unwrap();
        assert!(!s.记过没有("nota.git"));
        assert!(s.is_enabled("nota.git"), "回到默认值（调试档=开着）");
    }

    /// 坏掉的配置**不该让应用打不开**：读不出来就当没记过。
    #[test]
    fn 读不出来的配置当没记过() {
        let s = Installed::从文本("这不是 TOML {{{", true);
        assert!(s.is_enabled("任何东西"));
    }
}
