//! 信任的签名公钥表（TOFU）：**哪些作者是被信过的**。
//!
//! 落盘在 `$XDG_CONFIG_HOME/nota/trusted-keys.toml`。
//!
//! # 为什么单独一份（2026-09-29）
//!
//! 原来这一段在 `plugin/package.rs` 里（那一份当时 875 行）。拆的线是
//! 「**包本身（解包、算摘要、验签）／信谁**」：前者是对**字节**做的算术，
//! 后者是**用户的一次表态**——它有 `save()`、有日期、有给界面看的清单，
//! 跟 zip 一点关系都没有。
//!
//! ⚠️ `package.rs` 里 `pub use trust::*;` 转出去，所以
//! `package::信任库::load()` 这类老路径一个字没变（`plugin/install.rs` 与
//! `plugin/export.rs` 都按那个路径调）——拆家不动门牌。
//!
//! # ⚠️ 签名只能证明"没被改过"，证明不了"是谁给的"
//!
//! Ed25519 验签成立只说明"这份载荷是持有那把私钥的人签的"，而**包里自带公钥**
//! ——所以任何人都能造一把钥匙签一个包。**"是谁"这件事由这张表回答**：
//! 指纹在这张表里 → `Verified`；不在 → `Unknown`（装得进来，但界面上标出来，
//! 并且给一颗「信任」按钮让用户自己决定）。
//!
//! 这是 TOFU（trust on first use）+ 显式信任，和 SSH 的 `known_hosts` 一个路子。
//! ⚠️ **没有"全局信任任何一个签名"这种选项，也不该加**——那等于把签名降级成
//! 一个校验和，而校验和拦不住任何有心人。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

// ── 信任库 ────────────────────────────────────────────────────────────────

/// 一把被信任的签名公钥。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct 信任的钥匙 {
    /// 给人看的名字（"张三"、"某插件作者"）。**只是注释**，验签不看它。
    #[serde(default)]
    pub name: String,
    /// base64 的 32 字节原始公钥。
    pub public_key: String,
    /// 信任这把钥匙的日期（`YYYY-MM-DD`）。
    ///
    /// ⚠️ 和 `name` 同一档：**只是给人看的**，验签一个字节都不看它。
    /// 但**要填**——一张 TOFU 表如果连"我什么时候信的"都没有，事后就没法回想
    /// 当时为什么信它。2026-09-25 之前这一栏一直是空的（`String::new()`），
    /// 因为宿主当时没有任何时间来源；现在用 [`今天`] 填上。
    #[serde(default)]
    pub added_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct 信任存档 {
    #[serde(default)]
    keys: BTreeMap<String, 信任的钥匙>,
}

/// 信任的签名公钥表，落盘在 `$XDG_CONFIG_HOME/nota/trusted-keys.toml`。
///
/// # ⚠️ 签名只能证明"没被改过"，证明不了"是谁给的"
///
/// Ed25519 验签成立只说明"这份载荷是持有那把私钥的人签的"，而**包里自带公钥**
/// ——所以任何人都能造一把钥匙签一个包。**"是谁"这件事由这张表回答**：
/// 指纹在这张表里 → `Verified`；不在 → `Unknown`（装得进来，但界面上标出来，
/// 并且给一颗「信任」按钮让用户自己决定）。
///
/// 这是 TOFU（trust on first use）+ 显式信任，和 SSH 的 `known_hosts` 一个路子。
/// ⚠️ **没有"全局信任任何一个签名"这种选项，也不该加**——那等于把签名降级成
/// 一个校验和，而校验和拦不住任何有心人。
pub struct 信任库 {
    keys: BTreeMap<String, 信任的钥匙>,
}

impl 信任库 {
    pub fn 从文本(text: &str) -> Self {
        let 信任存档 { keys } = toml::from_str(text).unwrap_or_default();
        Self { keys }
    }

    pub fn load() -> Self {
        let text = crate::paths::trusted_keys_file()
            .ok()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .unwrap_or_default();
        Self::从文本(&text)
    }

    pub fn 到文本(&self) -> Result<String> {
        let 存档 = 信任存档 {
            keys: self.keys.clone(),
        };
        toml::to_string_pretty(&存档)
            .map_err(|e| NotaError::other(format!("信任库写不成 TOML（这是个 bug）：{e}")))
    }

    pub fn save(&self) -> Result<()> {
        let path = crate::paths::trusted_keys_file()?;
        if let Some(父) = path.parent() {
            crate::paths::ensure_dir(父)?;
        }
        std::fs::write(&path, self.到文本()?).map_err(|source| NotaError::Write { path, source })
    }

    pub fn 有没有(&self, key_id: &str) -> bool {
        self.keys.contains_key(key_id)
    }

    pub fn 有几把(&self) -> usize {
        self.keys.len()
    }

    /// 列出来（`(指纹, 名字)`，按指纹排序——`BTreeMap` 的天然顺序）。
    /// 给界面看："我信任了哪几把钥匙"要能被人核对，这是那张表的**唯一**读出口。
    pub fn 列(&self) -> Vec<(String, String)> {
        self.keys
            .iter()
            .map(|(k, v)| (k.clone(), v.name.clone()))
            .collect()
    }

    /// 记下一把钥匙。`公钥` 是 base64 原文——⚠️ **存的是它，不是指纹**，
    /// 指纹每次现算（与 `package.rs::包::验签` 里那条同一个理由）。
    pub fn 记下(&mut self, key_id: &str, name: &str, public_key: &str) -> Result<()> {
        self.记下不落盘(key_id, name, public_key);
        self.save()
    }

    /// 只改内存，不落盘。
    ///
    /// ⚠️ 拆出来是**给用例用的**：`save()` 写的是
    /// `$XDG_CONFIG_HOME/nota/trusted-keys.toml`，在开发机上那就是用户**真的**
    /// 那份信任表（`~/.config/nota/`）——用例碰它等于随手改用户的数据。
    /// 所以用例只走这一半，落盘那一半交给实机验证。
    pub(crate) fn 记下不落盘(&mut self, key_id: &str, name: &str, public_key: &str) {
        self.keys.insert(
            key_id.to_owned(),
            信任的钥匙 {
                name: name.to_owned(),
                public_key: public_key.to_owned(),
                added_at: 今天(),
            },
        );
    }
}

/// 今天的日期，`YYYY-MM-DD`。
///
/// # ⚠️ 这是 **UTC** 的今天，不是本机的今天
///
/// 为了一个"给人看的"栏去引 `chrono`、或者去读 `/etc/localtime`（那是要
/// `unsafe` 调 `localtime_r` 的），都不值当——所以只用了 `std`。
/// 代价：UTC+8 的用户在**本地凌晨 0 点到 8 点之间**信任一把钥匙，这里会记成
/// 前一天。它是**注释级**的信息（和 [`信任的钥匙::name`] 同一档），
/// 验签不读它，界面也不显示它，所以这个偏差可以接受。
pub fn 今天() -> String {
    let 秒 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (年, 月, 日) = 年月日((秒 / 86_400) as i64);
    format!("{年:04}-{月:02}-{日:02}")
}

/// 把"1970-01-01 起的天数"换成公历 `(年, 月, 日)`。
///
/// Howard Hinnant 那套 `civil_from_days`（`<chrono>` 里那个日期算法的原型）。
/// 取它是因为**闰年、世纪闰、400 年闰全都在算术里**，没有表、没有分支特例；
/// 而且 `天` 是负的（1970 年以前）也照样算得对——我们用不到，但它不要钱。
pub(crate) fn 年月日(天: i64) -> (i64, u32, u32) {
    // 把起点挪到 0000-03-01，于是"闰日"永远落在一年之末，公式里不用再判月。
    let z = 天 + 719_468;
    let era = z.div_euclid(146_097); // 400 年一轮（146097 天）
    let doe = z.rem_euclid(146_097); // 这一轮里过了多少天
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // 这一轮里的年
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // 这一年里过了多少天
    let mp = (5 * doy + 2) / 153; // 3 月当作这一年的第 0 个月
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
