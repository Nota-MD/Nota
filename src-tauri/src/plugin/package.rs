//! 插件**包**（`.nota-plugin`，zip 基底）的解开与验签。
//!
//! 格式与那套"签什么、怎么算摘要"的口径写在 `docs/11` §1.6，这里只说**为什么**。
//!
//! # 为什么是 zip
//!
//! 插件最小合法形状是"一个 `plugin.toml` + 一个入口 lua"（`docs/11` §1.3），
//! 但真插件会带图标、模板、多个 lua 模块。目录形式在开发时最方便（改完存盘即
//! 生效），**分发**时却不行——用户拿到一个压缩包之前得先会解压。
//! zip 是唯一一个"三个平台上双击就能看、命令行里也现成"的容器，
//! 而且它不需要额外的依赖就能读（`flate2` 本来就在依赖树里）。
//!
//! ⚠️ **包是只读的**：宿主只**解**包，不**打**包。打包那半在
//! `tools/pack-plugin.py`（要 `openssl` 签，那是作者侧的动作，不该進宿主）。
//!
//! # 摘要怎么算（这是整个验签的关键）
//!
//! 签的是**载荷摘要**，不是 zip 字节。规则三条：
//!
//! 1. 条目**按路径排序**（zip 里条目的顺序是打包工具的自由，不该影响签名）；
//! 2. 每条算成 `路径字节 + \0 + 内容 sha256 的 32 字节`；
//! 3. 把这些拼起来再 sha256 一次。
//!
//! ⚠️ **签名文件自己不参与摘要**——它要是参与了就成了自指（签名里含自己的摘要）。
//! 所以它是"附加在包上的东西"，不是"包里的东西"。
//!
//! 这套算法有个好性质：**重新压缩一遍（改了时间戳、换了压缩级别）摘要不变**。
//! 所以作者可以重打包而不必重签，验证方也不必关心 zip 是怎么压的。
//!
//! # 三条失败通道，别混
//!
//! | 情况 | 结果 |
//! |---|---|
//! | 包本身坏了（不是 zip、解不开、zip 炸弹） | `Err` —— 连"这是个包"都不成立 |
//! | **有**签名但验不过 | `Err` —— 可能是被改过，**拒装**（见文件头"没有这一档"） |
//! | 没有签名 | `Ok(Signature::Unsigned)` —— 允许，但要标出来 |
//!
//! ⚠️ 第三条是刻意的：开发态的文件夹插件必然没有签名，拒掉它等于把开发流程堵死。
//! 但"没签名"和"验过了"在界面上**长得不一样**（插件行上那个标签），
//! 用户看得见自己在信一个什么东西。

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::installed::Signature;
use crate::error::{NotaError, Result};

/// 插件包的后缀。点号是它的一部分（`git` 那种"扩展名"的读法统一按带点写）。
pub const 包后缀: &str = ".nota-plugin";

/// 签名块在包里的固定名字。**这一个字符串有两份实现必须一致**：
/// 读的一侧在这里，写的一侧在 `tools/pack-plugin.py`。
pub const 签名文件: &str = "nota-signature.toml";

/// 清单在包里的固定名字。同上，两份实现（这里是读，`docs/11` §1.3 是形状）。
pub const 清单文件: &str = "plugin.toml";

/// 包解开之后**总字节数**的上限。
///
/// ⚠️ 这三条上限是**防 zip 炸弹**的，不是"怕文件大"：一个 4 KiB 的 zip 能解出
/// 几个 GB（deflate 的压缩比可以到 1000:1），而这里的做法是**先全解到内存里**再验签
/// ——没有上限的话，用户双击一个恶意包就是一次 OOM。
/// 32 MiB 对插件来说宽得离谱（现在这两个插件加起来不到 100 KiB）。
const 总上限: u64 = 32 * 1024 * 1024;
const 单文件上限: u64 = 16 * 1024 * 1024;
const 条目上限: usize = 2048;
/// 条目名的字节上限。同上是防炸弹（超长名字本身就能当攻击面）。
const 名字上限: usize = 512;

/// 包里的一个文件。
#[derive(Debug, Clone)]
pub struct 包文件 {
    /// 包内相对路径，**已经过 [`路径合法吗`] 归一**。
    pub 路径: String,
    pub 内容: Vec<u8>,
}

/// 包里的签名块（`nota-signature.toml`）。
///
/// ```toml
/// [signature]
/// algorithm = "ed25519"
/// key_id = "a1b2c3d4e5f60718"
/// public_key = "…base64…"   # 32 字节原始公钥
/// signature = "…base64…"    # 64 字节签名
/// signed_at = "2026-09-24"
/// ```
#[derive(Debug, Clone)]
pub struct 包签名 {
    pub algorithm: String,
    /// 公钥指纹。⚠️ **只是给人看的**，验签时拿公钥重算（见 [`包::验签`]）。
    pub key_id: String,
    pub public_key: [u8; 32],
    pub signature: [u8; 64],
    pub signed_at: String,
}

/// 一个解开的包：文件们 + 可能有签名。
#[derive(Debug, Clone)]
pub struct 包 {
    pub 文件们: Vec<包文件>,
    pub 签名: Option<包签名>,
}

impl 包 {
    /// 从一个 `.nota-plugin`（或任何 zip）的字节解开。
    pub fn 从zip(bytes: &[u8]) -> Result<Self> {
        let mut ar = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|e| NotaError::other(format!("这不是一个能读的拓展包：{e}")))?;

        if ar.len() > 条目上限 {
            return Err(NotaError::other(format!(
                "包里条目太多（{} 条，上限 {条目上限}）——多半不是拓展包",
                ar.len()
            )));
        }

        let mut 文件们 = Vec::new();
        let mut 总: u64 = 0;

        for i in 0..ar.len() {
            let mut e = ar
                .by_index(i)
                .map_err(|e| NotaError::other(format!("包里的第 {} 条读不出来：{e}", i + 1)))?;
            if e.is_dir() {
                continue; // 目录条目不带内容，路径本身由文件条目补
            }
            let 路径 = 路径合法吗(e.name())?;

            let mut 内容 = Vec::new();
            // ⚠️ `take(上限 + 1)` 而不是 `read_to_end`：读完才知道有没有超，
            // 而"读完"这一步正是要防的（一条声称 4 GiB 的条目）。
            // 多读那 1 个字节是为了分清"正好等于上限"和"超了"。
            e.by_ref()
                .take(单文件上限 + 1)
                .read_to_end(&mut 内容)
                .map_err(|e| NotaError::other(format!("包里的 `{路径}` 解不开：{e}")))?;
            if 内容.len() as u64 > 单文件上限 {
                return Err(NotaError::other(format!(
                    "包里的 `{路径}` 超过 {单文件上限} 字节"
                )));
            }

            总 += 内容.len() as u64;
            if 总 > 总上限 {
                return Err(NotaError::other(format!(
                    "包解开之后超过 {总上限} 字节——不装了（防 zip 炸弹）"
                )));
            }
            文件们.push(包文件 { 路径, 内容 });
        }

        Self::从文件们(文件们)
    }

    /// 从一个**目录**读（开发态、或者用户选了个文件夹）。
    ///
    /// 与 zip 那条走**同一套**规则：同一个 [`路径合法吗`]、同一组上限、
    /// 同样的摘要。所以"文件夹里验过的签名"和"打回包里再验"结果一样。
    pub fn 从目录(root: &Path) -> Result<Self> {
        let mut 文件们 = Vec::new();
        let mut 总: u64 = 0;
        收目录(root, root, &mut 文件们, &mut 总)?;
        Self::从文件们(文件们)
    }

    /// 两条来源的汇合点：**摘掉签名文件、解析它、剩下的才是载荷**。
    fn 从文件们(mut 文件们: Vec<包文件>) -> Result<Self> {
        let 签名 = match 文件们.iter().position(|f| f.路径 == 签名文件) {
            None => None,
            Some(i) => {
                let f = 文件们.remove(i);
                let text = String::from_utf8(f.内容)
                    .map_err(|_| NotaError::other("签名块不是 UTF-8 文本"))?;
                Some(读签名(&text)?)
            }
        };
        文件们.sort_by(|a, b| a.路径.cmp(&b.路径));
        Ok(Self { 文件们, 签名 })
    }

    /// 载荷摘要。算法见文件头，**这里就是那一份实现**。
    pub fn 摘要(&self) -> [u8; 32] {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        for f in &self.文件们 {
            h.update(f.路径.as_bytes());
            h.update([0u8]);
            h.update(Sha256::digest(&f.内容));
        }
        h.finalize().into()
    }

    /// 取一个文件的内容。
    pub fn 找(&self, 路径: &str) -> Option<&[u8]> {
        self.文件们
            .iter()
            .find(|f| f.路径 == 路径)
            .map(|f| f.内容.as_slice())
    }

    /// 验签。**结果只有三种可能**（见文件头那张表），验不过就是 `Err`。
    pub fn 验签(&self, 信任库: &信任库) -> Result<Signature> {
        let Some(sig) = &self.签名 else {
            return Ok(Signature::Unsigned);
        };

        if sig.algorithm != "ed25519" {
            return Err(NotaError::other(format!(
                "不认识的签名算法 `{}`（只认 ed25519）",
                sig.algorithm
            )));
        }

        // ⚠️ `from_bytes` 会拒掉不合法的公钥（不是曲线上一个合法点）。
        let key = ed25519_dalek::VerifyingKey::from_bytes(&sig.public_key)
            .map_err(|e| NotaError::other(format!("签名块里的公钥不合法：{e}")))?;

        // ⚠️ `verify_strict` 而不是 `verify`：前者额外拒掉**小阶公钥**那类
        // "同一个签名对多把钥匙都成立"的构造。用 `verify` 的话，攻击者能拿
        // 一把构造出来的钥匙冒充别人——而那正是签名要防的事。
        key.verify_strict(
            &self.摘要(),
            &ed25519_dalek::Signature::from_bytes(&sig.signature),
        )
        .map_err(|_| {
            NotaError::other(
                "签名对不上——这个包**在签完之后被改过**，或者签名块是坏的。\
                 不装（这是唯一一条硬拒的路径）"
                    .to_owned(),
            )
        })?;

        // ⚠️ 指纹**重算**，不信包里那一栏。
        let 真指纹 = super::installed::公钥指纹(&sig.public_key);
        if 真指纹 != sig.key_id {
            return Err(NotaError::other(format!(
                "签名块里的 key_id（`{}`）与公钥对不上（算出来是 `{真指纹}`）",
                sig.key_id
            )));
        }

        Ok(if 信任库.有没有(&真指纹) {
            Signature::Verified
        } else {
            Signature::Unknown
        })
    }
}

impl 包签名 {
    /// 公钥的 base64 原文（标准字母表，带 `=` 补位）。
    ///
    /// ⚠️ 编码这件事**只在这里实现一次**：写包的那一侧在 `tools/pack-plugin.py`，
    /// 读的一侧是 [`读签名`]；而"把公钥存进 `plugins.toml` 好让「信任」按钮
    /// 事后还能用"是第三种用途。三处各写一遍就是"两处相乘"那个病
    /// ——某天换了字母表（比如 url-safe），漏掉一处就验不过，且症状只在装了
    /// 签名的包上出现。
    pub fn 公钥base64(&self) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(self.public_key)
    }
}

/// 递归收一个目录。跳过符号链接，理由见下。
fn 收目录(root: &Path, dir: &Path, out: &mut Vec<包文件>, 总: &mut u64) -> Result<()> {
    let entries = std::fs::read_dir(dir).map_err(|source| NotaError::Read {
        path: dir.to_path_buf(),
        source,
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        let ty = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };

        // ⚠️ 符号链接**整条跳过**（文件与目录都跳）：跟随它的话，一个指向上级
        // 目录的链接就是一次无限递归——而且是在用户点完「安装」之后才开始，
        // 界面卡死、栈溢出，看不出跟这个链接有关。插件包里本来也不该有链接。
        if ty.is_symlink() {
            continue;
        }

        if ty.is_dir() {
            收目录(root, &path, out, 总)?;
            continue;
        }
        if !ty.is_file() {
            continue; // 管道、设备文件之类
        }

        let 相对 = path
            .strip_prefix(root)
            .map_err(|_| NotaError::other(format!("{} 不在拓展目录里", path.display())))?;
        let 名 = 相对.to_string_lossy().replace('\\', "/");
        let 路径 = 路径合法吗(&名)?;

        let 内容 = std::fs::read(&path).map_err(|source| NotaError::Read {
            path: path.clone(),
            source,
        })?;
        if 内容.len() as u64 > 单文件上限 {
            return Err(NotaError::other(format!(
                "`{路径}` 超过 {单文件上限} 字节"
            )));
        }
        *总 += 内容.len() as u64;
        if *总 > 总上限 {
            return Err(NotaError::other(format!(
                "拓展目录总共超过 {总上限} 字节——不装了"
            )));
        }
        out.push(包文件 { 路径, 内容 });
    }

    if out.len() > 条目上限 {
        return Err(NotaError::other(format!("文件太多（上限 {条目上限}）")));
    }
    Ok(())
}

/// 归一 + 校验一个包内路径。
///
/// # ⚠️ 这是安全函数，不是格式函数
///
/// 包是**别人给的文件**，而里面的路径会被拿去拼落点（`目标目录.join(路径)`）。
/// 不设防的话 `../../.config/autostart/x.desktop` 就是一个任意路径写入口
/// ——"装个插件"变成"往哪儿都能写"。所以规则宁可严：
///
/// - 反斜杠一律**当成**分隔符（zip 里两种都有，Windows 打的包会用 `\`）；
/// - 不许绝对路径、不许盘符；
/// - 不许出现 `.` / `..` / 空段（`a//b` 也拒）；
/// - 不许空名、不许超长。
///
/// ⚠️ 只在**解包时**校验一次，之后一律用归一过的那个字符串——
/// 解包时验、落盘时再验第二遍，就是"两处相乘"：改一处忘一处，
/// 而这里漏一处就是任意路径写。
pub fn 路径合法吗(名: &str) -> Result<String> {
    let 名 = 名.replace('\\', "/");
    let 名 = 名.trim_end_matches('/').to_owned();

    if 名.is_empty() {
        return Err(NotaError::other("包里有一个空路径的条目"));
    }
    if 名.len() > 名字上限 {
        return Err(NotaError::other(format!("包里有一个超长路径（{} 字节）", 名.len())));
    }
    if 名.starts_with('/') || 名.contains(':') {
        return Err(NotaError::other(format!(
            "包里的路径 `{名}` 是绝对路径或带盘符——不装这种包"
        )));
    }
    for 段 in 名.split('/') {
        if 段.is_empty() || 段 == "." || 段 == ".." {
            return Err(NotaError::other(format!(
                "包里的路径 `{名}` 含 `.` / `..` / 空段——这是想把文件写到目标目录外面"
            )));
        }
    }
    Ok(名)
}

/// 读一个签名块。**缺栏就说清缺哪一栏**，别让作者对着一句"格式不对"猜。
fn 读签名(text: &str) -> Result<包签名> {
    #[derive(Deserialize)]
    struct 文件 {
        signature: 段,
    }
    #[derive(Deserialize)]
    struct 段 {
        #[serde(default = "默认算法")]
        algorithm: String,
        key_id: String,
        public_key: String,
        signature: String,
        #[serde(default)]
        signed_at: String,
    }
    fn 默认算法() -> String {
        "ed25519".to_owned()
    }

    let f: 文件 = toml::from_str(text)
        .map_err(|e| NotaError::other(format!("签名块读不出来（要 `[signature]` 一段）：{e}")))?;

    let 解 = |s: &str, 要: usize, 名: &str| -> Result<Vec<u8>> {
        use base64::Engine;
        let v = base64::engine::general_purpose::STANDARD
            .decode(s.trim())
            .map_err(|e| NotaError::other(format!("签名块的 `{名}` 不是合法 base64：{e}")))?;
        if v.len() != 要 {
            return Err(NotaError::other(format!(
                "签名块的 `{名}` 应该是 {要} 字节，实际 {} 字节",
                v.len()
            )));
        }
        Ok(v)
    };

    let pk = 解(&f.signature.public_key, 32, "public_key")?;
    let sg = 解(&f.signature.signature, 64, "signature")?;

    let mut public_key = [0u8; 32];
    public_key.copy_from_slice(&pk);
    let mut signature = [0u8; 64];
    signature.copy_from_slice(&sg);

    Ok(包签名 {
        algorithm: f.signature.algorithm,
        key_id: f.signature.key_id,
        public_key,
        signature,
        signed_at: f.signature.signed_at,
    })
}

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
    /// 指纹每次现算（与 [`包::验签`] 里那条同一个理由）。
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
    fn 记下不落盘(&mut self, key_id: &str, name: &str, public_key: &str) {
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
fn 年月日(天: i64) -> (i64, u32, u32) {
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

/// 把一个路径读成字节：`.nota-plugin` / `.zip` 走解包，目录走 [`包::从目录`]。
pub fn 读一个包(path: &Path) -> Result<包> {
    if path.is_dir() {
        return 包::从目录(path);
    }
    let bytes = std::fs::read(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    包::从zip(&bytes)
}

/// 这个路径看起来是个包文件吗（拿后缀判）。
pub fn 像包文件(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("nota-plugin") | Some("zip")
    )
}

/// 把一个相对路径拼到目标目录下。⚠️ 只接受 [`路径合法吗`] 的产物。
pub fn 拼落点(目标: &Path, 路径: &str) -> PathBuf {
    目标.join(路径)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Signer;

    /// 造一个签好名的包：返回 (包文件们, 签名块文本, 公钥指纹)。
    /// 用同一套算法**独立实现一遍**摘要，才谈得上"钉住格式"
    /// ——直接调 `包::摘要()` 再用它签，等于拿被测对象证明被测对象。
    fn 打个包(载荷: &[(&str, &str)]) -> (Vec<(String, Vec<u8>)>, String, String) {
        use base64::Engine;
        use sha2::{Digest, Sha256};

        let key = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let pk = key.verifying_key().to_bytes();

        let mut 有序: Vec<(String, Vec<u8>)> = 载荷
            .iter()
            .map(|(p, c)| ((*p).to_owned(), c.as_bytes().to_vec()))
            .collect();
        有序.sort_by(|a, b| a.0.cmp(&b.0));

        let mut h = Sha256::new();
        for (p, c) in &有序 {
            h.update(p.as_bytes());
            h.update([0u8]);
            h.update(Sha256::digest(c));
        }
        let 摘要: [u8; 32] = h.finalize().into();
        let sig = key.sign(&摘要).to_bytes();

        let 指纹 = super::super::installed::公钥指纹(&pk);
        let 签名块 = format!(
            "[signature]\nalgorithm = \"ed25519\"\nkey_id = \"{指纹}\"\n\
             public_key = \"{}\"\nsignature = \"{}\"\nsigned_at = \"2026-09-24\"\n",
            base64::engine::general_purpose::STANDARD.encode(pk),
            base64::engine::general_purpose::STANDARD.encode(sig),
        );
        (有序, 签名块, 指纹)
    }

    fn 带签名的包(载荷: &[(&str, &str)]) -> (包, String) {
        let (mut 文件们, 签名块, 指纹) = 打个包(载荷);
        let 文件们: Vec<包文件> = 文件们
            .drain(..)
            .map(|(路径, 内容)| 包文件 { 路径, 内容 })
            .collect();
        (
            包::从文件们({
                let mut v = 文件们;
                v.push(包文件 {
                    路径: 签名文件.to_owned(),
                    内容: 签名块.into_bytes(),
                });
                v
            })
            .unwrap(),
            指纹,
        )
    }

    /// 没签名 = `Unsigned`（开发态的文件夹插件必然是这样，拒掉它等于堵死开发流程）。
    #[test]
    fn 没签名就是未签名不是错误() {
        let p = 包::从文件们(vec![
            包文件 {
                路径: 清单文件.to_owned(),
                内容: b"[plugin]\nid = \"a.b\"\n".to_vec(),
            },
            // 名字故意排在后头，钉"排序"那一步真的做了
            包文件 {
                路径: "main.lua".to_owned(),
                内容: b"return {}\n".to_vec(),
            },
        ])
        .unwrap();
        assert!(p.签名.is_none());
        assert_eq!(p.验签(&信任库::从文本("")).unwrap(), Signature::Unsigned);
        assert_eq!(p.文件们.len(), 2);
        assert_eq!(p.文件们[0].路径, "main.lua", "按路径排序");
    }

    /// 签过、而且钥匙在信任库里 → `Verified`。
    #[test]
    fn 签名对且信任就是已验证() {
        let (p, 指纹) = 带签名的包(&[(清单文件, "[plugin]\nid = \"a.b\"\n"), ("main.lua", "x")]);
        let 库 = 信任库::从文本(&format!(
            "[keys.\"{指纹}\"]\nname = \"测试\"\npublic_key = \"AA==\"\n"
        ));
        assert_eq!(p.验签(&库).unwrap(), Signature::Verified);
    }

    /// 签过但钥匙没被信任 → `Unknown`（装得进来，但界面上要标出来）。
    #[test]
    fn 签名对但没信任就是未知签名者() {
        let (p, _) = 带签名的包(&[(清单文件, "[plugin]\nid = \"a.b\"\n")]);
        assert_eq!(
            p.验签(&信任库::从文本("")).unwrap(),
            Signature::Unknown
        );
    }

    /// ⚠️ 这条是**安全用例**：签完之后动一个字节，就必须拒。
    #[test]
    fn 签完再改一个字节就拒() {
        let (mut p, _) = 带签名的包(&[(清单文件, "[plugin]\nid = \"a.b\"\n"), ("main.lua", "x")]);
        let f = p
            .文件们
            .iter_mut()
            .find(|f| f.路径 == "main.lua")
            .unwrap();
        f.内容 = b"y".to_vec(); // 一个字节：x → y

        let err = p.验签(&信任库::从文本("")).unwrap_err().to_string();
        assert!(err.contains("签名对不上"), "实际：{err}");
    }

    /// ⚠️ 这条也是**安全用例**：改 `key_id` 冒充一把已信任的钥匙，必须拒。
    #[test]
    fn 改_key_id_冒充信任的钥匙要拒() {
        let (mut p, _) = 带签名的包(&[(清单文件, "[plugin]\nid = \"a.b\"\n")]);
        // 把签名块里的 key_id 换成"另一把"（公钥不动）
        let sig = p.签名.as_mut().unwrap();
        sig.key_id = "0000000000000000".to_owned();

        let err = p.验签(&信任库::从文本("")).unwrap_err().to_string();
        assert!(err.contains("对不上"), "实际：{err}");
    }

    /// ⚠️ 这条是**安全用例**：摘要不含签名文件自己。
    /// 如果它参与了，加进签名块会让摘要变，签名就永远验不过——
    /// 但更糟的是有人"顺手把它算进去"，于是改签名块里的 `signed_at`
    /// 就变成一次签名失效。钉住它。
    #[test]
    fn 摘要不含签名文件自己() {
        let (p, _) = 带签名的包(&[(清单文件, "[plugin]\nid = \"a.b\"\n")]);
        let 只有载荷 = 包::从文件们(p.文件们.clone()).unwrap();
        assert!(只有载荷.签名.is_none());
        assert_eq!(p.摘要(), 只有载荷.摘要(), "签名文件不该影响摘要");
    }

    /// 重新排序条目**不改**摘要——这是"重打包不必重签"那条性质的根据。
    #[test]
    fn 条目顺序不影响摘要() {
        let a = 包::从文件们(vec![
            包文件 {
                路径: "a".to_owned(),
                内容: b"1".to_vec(),
            },
            包文件 {
                路径: "b".to_owned(),
                内容: b"2".to_vec(),
            },
        ])
        .unwrap();
        let b = 包::从文件们(vec![
            包文件 {
                路径: "b".to_owned(),
                内容: b"2".to_vec(),
            },
            包文件 {
                路径: "a".to_owned(),
                内容: b"1".to_vec(),
            },
        ])
        .unwrap();
        assert_eq!(a.摘要(), b.摘要());
    }

    /// ⚠️ 这条是**安全用例**：包里的路径不许把文件写到目标目录外面去。
    #[test]
    fn 包里的路径跳不出目标目录() {
        for 坏 in [
            "../evil",
            "a/../../evil",
            "/etc/passwd",
            "C:/windows/x",
            "a\\..\\..\\evil",
            "a//b",
            "./x",
            "",
            "..",
        ] {
            assert!(路径合法吗(坏).is_err(), "`{坏}` 该被拒");
        }
        for 好 in ["plugin.toml", "main.lua", "icons/a.png", "a/b/c/d.lua"] {
            assert_eq!(路径合法吗(好).unwrap(), 好, "`{好}` 是合法路径");
        }
        // 反斜杠归一成正斜杠（Windows 打的包）
        assert_eq!(路径合法吗("a\\b").unwrap(), "a/b");
        // 尾斜杠是目录条目的写法，归一掉
        assert_eq!(路径合法吗("a/b/").unwrap(), "a/b");
    }

    /// 解出来的包能读出来内容（顺带钉住 `zip` 那条路真的走得通）。
    #[test]
    fn 从zip解开能读到文件() {
        use std::io::Write;
        let mut buf = Vec::new();
        {
            let mut w = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            let opts: zip::write::FileOptions<'_, ()> =
                zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);
            w.start_file("plugin.toml", opts).unwrap();
            w.write_all(b"[plugin]\nid = \"a.b\"\n").unwrap();
            w.start_file("main.lua", opts).unwrap();
            w.write_all(b"return {}\n").unwrap();
            w.finish().unwrap();
        }

        let p = 包::从zip(&buf).unwrap();
        assert_eq!(p.文件们.len(), 2);
        assert_eq!(p.找("main.lua").unwrap(), b"return {}\n");
        assert_eq!(p.找("没有这个"), None);
        assert!(p.签名.is_none());
    }

    /// 不是 zip 就得说清"这不是一个能读的插件包"，不要 panic。
    #[test]
    fn 不是zip就报错不panic() {
        let err = 包::从zip("这是一段普通文本，不是 zip".as_bytes())
            .unwrap_err()
            .to_string();
        assert!(err.contains("拓展包"), "实际：{err}");
    }

    /// 坏掉的信任库当空表——它不该让应用打不开。
    #[test]
    fn 坏掉的信任库当空表() {
        let 库 = 信任库::从文本("不是 TOML {{{");
        assert!(!库.有没有("随便"));
        assert_eq!(库.有几把(), 0);
    }

    /// 日期换算钉几个**手算得出来**的点：纪元零点、往前一天（`div_euclid`
    /// 写错就会在这里露馅——负数除法是这套算术最容易栽的地方）、
    /// 一个普通年份、以及一个**百年不闰**的年（2000 是闰年，1900 不是，
    /// 但 `days_from_civil` 那套是按 400 年一轮算的，所以挑 2000-02-29 钉住
    /// "世纪闰年被算进去了"）。
    #[test]
    fn 天数换成公历日期() {
        assert_eq!(年月日(0), (1970, 1, 1));
        assert_eq!(年月日(-1), (1969, 12, 31));
        assert_eq!(年月日(19_723), (2024, 1, 1));
        assert_eq!(年月日(11_016), (2000, 2, 29));
        assert_eq!(年月日(20_721), (2026, 9, 25));
    }

    /// `今天()` 的形状：`YYYY-MM-DD`，十位，两位是连字符。
    ///
    /// ⚠️ **只钉形状，不钉具体哪一天**——钉了的话这条用例到了明天就红。
    #[test]
    fn 今天长得像个日期() {
        let t = 今天();
        assert_eq!(t.len(), 10, "实际：{t}");
        let 位: Vec<char> = t.chars().collect();
        assert_eq!(位[4], '-');
        assert_eq!(位[7], '-');
        for (i, c) in 位.iter().enumerate() {
            if i == 4 || i == 7 {
                continue;
            }
            assert!(c.is_ascii_digit(), "第 {i} 位不是数字：{t}");
        }
        assert!(t.starts_with("20"), "这个字段是给人看的，四位年：{t}");
    }

    /// 记一把钥匙会**顺手填上日期**（`added_at` 曾经一直是空串，见那一段的注释）。
    ///
    /// ⚠️ 走的是 `记下不落盘`：`记下` 会写**真的**信任表，用例不能碰。
    #[test]
    fn 记下的钥匙带日期() {
        let mut 库 = 信任库::从文本("");
        库.记下不落盘("deadbeefdeadbeef", "某人", "AAA=");
        let 文本 = 库.到文本().unwrap();
        assert!(!文本.contains(r#"added_at = """#), "日期是空的：{文本}");
        assert!(文本.contains(&今天()), "实际：{文本}");
    }
}
