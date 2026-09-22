//! 插件清单（`plugin.toml`）的解析与校验。
//!
//! # 清单长什么样
//!
//! ```toml
//! [plugin]
//! id          = "nota.git"          # 全局唯一，点号分层；宿主用它做覆盖与依赖
//! name        = "Git 版本控制"       # 给人看的名字
//! version     = "0.1.0"             # 插件自己的版本，不代表 ABI
//! api         = 1                   # 需要的宿主 API 版本，**精确匹配**
//! entry       = "main.lua"          # 入口脚本，相对插件目录
//! description = "…"
//! authors     = ["…"]
//! license     = "BSD-2-Clause"
//! capabilities = ["document.read", "fs.read", "fs.write", "process.git"]
//! ```
//!
//! # 为什么 `api` 是精确匹配而不是 `>=`
//!
//! 与 Folio 的 `FO_PLUGIN_API_VERSION` 同一条理由（见 `docs/11`）：宿主与内置插件
//! 永远同批构建，`>=` 只会让"插件作者以为存在一个他没见过的新版本"这种事发生。
//! 号一变，内置插件同批改号，没有迁移动作。什么时候该动号、什么时候不该动，
//! 判据写在 `docs/11-writing-a-plugin.md`。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

/// 宿主 API 版本。**当前是 1**。
///
/// 动它的判据（与 Folio 一致）：
/// - 给 Lua 侧的 `nota.*` 表**增加**成员 —— 不动号（老插件照样跑）；
/// - **改名**某个 `nota.*` 成员，或**改变它的语义** —— 动号（老插件会静默拿到别的东西）；
/// - 增删 `capabilities` 里的取值，并让它影响放行 —— 动号。
pub const NOTA_PLUGIN_API_VERSION: u32 = 1;

/// 插件可以申请的能力。宿主按此放行 Lua API——
/// **没申请就用不了**，不是"申请了就随便用"。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    /// 读当前文档的文本、路径、选区。
    #[serde(rename = "document.read")]
    DocumentRead,
    /// 改当前文档（替换全文 / 插入 / 替换选区）。
    #[serde(rename = "document.write")]
    DocumentWrite,
    /// 读工作区内的文件。
    #[serde(rename = "fs.read")]
    FsRead,
    /// 写工作区内的文件。
    #[serde(rename = "fs.write")]
    FsWrite,
    /// 起 `git` 子进程。**只放行 git 这一个命令**，不是通用 subprocess。
    #[serde(rename = "process.git")]
    ProcessGit,
    /// 发 HTTP 请求（AI 插件要用）。
    #[serde(rename = "network.http")]
    NetworkHttp,
    /// 弹通知。
    #[serde(rename = "ui.notify")]
    UiNotify,
    /// 注册侧栏面板。
    #[serde(rename = "ui.panel")]
    UiPanel,
    /// 往菜单里加条目。
    #[serde(rename = "ui.menu")]
    UiMenu,
    /// 读写插件自己的设置段。
    #[serde(rename = "settings.own")]
    SettingsOwn,
}

impl Capability {
    /// 从清单里的字符串解析。未知能力**报错而不是忽略**——
    /// 悄悄忽略会变成"插件作者以为申请到了、实际没有"的静默降级。
    pub fn parse(s: &str) -> Result<Self> {
        Ok(match s {
            "document.read" => Self::DocumentRead,
            "document.write" => Self::DocumentWrite,
            "fs.read" => Self::FsRead,
            "fs.write" => Self::FsWrite,
            "process.git" => Self::ProcessGit,
            "network.http" => Self::NetworkHttp,
            "ui.notify" => Self::UiNotify,
            "ui.panel" => Self::UiPanel,
            "ui.menu" => Self::UiMenu,
            "settings.own" => Self::SettingsOwn,
            other => {
                return Err(NotaError::other(format!(
                    "不认识的能力 `{other}`（见 docs/11 的能力表）"
                )))
            }
        })
    }
}

/// `[plugin]` 段。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    #[serde(default = "default_version")]
    pub version: String,
    pub api: u32,
    #[serde(default = "default_entry")]
    pub entry: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default)]
    pub license: String,
    /// 申请的能力。空 = 纯声明式插件（只贡献菜单/面板，不碰文档与磁盘）。
    #[serde(default)]
    pub capabilities: Vec<String>,
}

fn default_version() -> String {
    "0.0.0".to_owned()
}

fn default_entry() -> String {
    "main.lua".to_owned()
}

#[derive(Debug, Clone, Deserialize)]
struct ManifestFile {
    plugin: PluginMeta,
}

/// 解析好、校验过的清单，附上它所在的目录。
#[derive(Debug, Clone)]
pub struct Manifest {
    pub meta: PluginMeta,
    /// 插件根目录（`plugin.toml` 所在处）。
    pub dir: PathBuf,
    pub capabilities: Vec<Capability>,
}

impl Manifest {
    /// 入口脚本的绝对路径。
    pub fn entry_path(&self) -> PathBuf {
        self.dir.join(&self.meta.entry)
    }

    /// 从 `plugin.toml` 读并校验。
    pub fn load(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path).map_err(|source| NotaError::Read {
            path: path.to_path_buf(),
            source,
        })?;

        let file: ManifestFile = toml::from_str(&text).map_err(|e| NotaError::Manifest {
            file: path.to_path_buf(),
            reason: e.to_string(),
        })?;

        let dir = path
            .parent()
            .ok_or_else(|| NotaError::Manifest {
                file: path.to_path_buf(),
                reason: "plugin.toml 没有父目录".to_owned(),
            })?
            .to_path_buf();

        Self::from_meta(file.plugin, dir, path)
    }

    fn from_meta(meta: PluginMeta, dir: PathBuf, file: &Path) -> Result<Self> {
        // ── id：点号分层的小写标识 ───────────────────────────────────────
        if meta.id.is_empty() {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: "id 不能为空".to_owned(),
            });
        }
        if !meta
            .id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-' || c == '_')
        {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!("id `{}` 只能用小写字母、数字、`.`、`-`、`_`", meta.id),
            });
        }

        // ── api：精确匹配 ────────────────────────────────────────────────
        if meta.api != NOTA_PLUGIN_API_VERSION {
            return Err(NotaError::PluginApiMismatch {
                id: meta.id.clone(),
                wanted: meta.api,
                have: NOTA_PLUGIN_API_VERSION,
            });
        }

        // ── entry：不许逃出插件目录 ──────────────────────────────────────
        // 清单是插件自带的，`entry = "../../../etc/passwd"` 这种必须挡在门口。
        if meta.entry.contains("..") || Path::new(&meta.entry).is_absolute() {
            return Err(NotaError::Manifest {
                file: file.to_path_buf(),
                reason: format!("entry `{}` 必须是插件目录内的相对路径", meta.entry),
            });
        }

        // ── capabilities ─────────────────────────────────────────────────
        let mut capabilities = Vec::new();
        for raw in &meta.capabilities {
            let cap = Capability::parse(raw).map_err(|e| NotaError::Manifest {
                file: file.to_path_buf(),
                reason: e.to_string(),
            })?;
            if !capabilities.contains(&cap) {
                capabilities.push(cap);
            }
        }

        Ok(Manifest {
            meta,
            dir,
            capabilities,
        })
    }

    pub fn has(&self, cap: Capability) -> bool {
        self.capabilities.contains(&cap)
    }
}

/// 插件 id 在**事件通道名**里的写法。
///
/// # 为什么需要这么一个函数
///
/// 清单里的 id 允许 `.`（`nota.git`、`nota.ai` 就是这么写的，反域名风格），
/// 而 **Tauri 的事件名只允许字母数字与 `-` `/` `:` `_`**——一个点就让 `emit`
/// 直接报错。踩到它的样子是：插件加载"成功"，但一 `emit` 就抛
/// `only alphanumeric, '-', '/', ':', '_' permitted for event names`，
/// 而且**只在这个插件第一次发事件时才炸**，静态看代码完全看不出来。
///
/// # 口径
///
/// **允许集合里的字符原样保留，不在集合里的一律换成 `-`。**
/// 允许集合与 Tauri 的判据一致：字母数字 + `-` + `_`（`/` 与 `:` 也在 Tauri 名单里，
/// 但 id 的校验不会放它们进来）。所以：
///
/// - `.` → `-`：这是**唯一**会被改写的常见字符，`nota.git` 变成 `nota-git`。
///   ⚠️ **`_` 不会被改**——它本来就在允许集合里，改了反而多此一举。
///   （本注释早期版本写成"`.` / `_` 与 `-` 是同一个字符"，那是错的；
///   `channel_id("a_b-c") == "a_b-c"` 有用例钉着，见 `docs/07` BUG-3。）
/// - 于是 `nota.git` 与 `nota-git` 这两个**都合法**的 id 会撞成同一个通道，
///   而 `nota_git` 与 `nota-git` **不撞**。撞了事件就分不清是谁发的，
///   所以 `PluginHost::discover()` 会**把后一个判为加载失败**，而不是让它们悄悄混在一起。
///
/// 返回的串由 `[A-Za-z0-9_-]` 组成，插进 `plugin:<id>:<名字>` 里一定合法。
pub fn channel_id(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

/// 在「插件目录」里找一个插件的清单文件。
///
/// 认两种形状，方便开发时少写一层：`<dir>/plugin.toml`，或 `<dir>/<id>/plugin.toml`。
pub fn find_manifests(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();

    let direct = root.join("plugin.toml");
    if direct.is_file() {
        out.push(direct);
        return out;
    }

    let Ok(entries) = std::fs::read_dir(root) else {
        return out;
    };
    for entry in entries.flatten() {
        let candidate = entry.path().join("plugin.toml");
        if candidate.is_file() {
            out.push(candidate);
        }
    }
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_manifest(dir: &Path, body: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join("plugin.toml"), body).unwrap();
    }

    #[test]
    fn 好清单能解析出能力() {
        let dir = std::env::temp_dir().join("nota-manifest-good");
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            r#"
[plugin]
id = "nota.git"
name = "Git"
api = 1
capabilities = ["document.read", "process.git"]
"#,
        );

        let m = Manifest::load(&dir.join("plugin.toml")).unwrap();
        assert_eq!(m.meta.id, "nota.git");
        assert_eq!(m.meta.entry, "main.lua", "entry 该有默认值");
        assert!(m.has(Capability::ProcessGit));
        assert!(!m.has(Capability::NetworkHttp));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 通道名里的点要换成连字符() {
        // 反域名风格的 id 是主流写法，而 Tauri 的事件名不认点——
        // 直接拼进 `plugin:<id>:<名字>` 会让每一次 emit 都抛错。
        assert_eq!(channel_id("nota.git"), "nota-git");
        assert_eq!(channel_id("nota.ai"), "nota-ai");
        // 安全的字符原样留着，别把 `_` 也一起换掉。
        assert_eq!(channel_id("a_b-c"), "a_b-c");
        // 空 id 清单那一关已经拦了，这里只管"结果一定合法"。
        for id in ["nota.git", "a.b.c", "x/y", "带中文的"] {
            let c = channel_id(id);
            assert!(
                c.chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'),
                "`{id}` 归一后仍有不合法字符：{c}"
            );
        }
    }

    #[test]
    fn api_版本不符要拒载() {
        let dir = std::env::temp_dir().join("nota-manifest-apimismatch");
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = 99\n",
        );

        let err = Manifest::load(&dir.join("plugin.toml")).unwrap_err();
        assert!(
            matches!(err, NotaError::PluginApiMismatch { wanted: 99, have: 1, .. }),
            "实际：{err}"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn entry_不许逃出插件目录() {
        let dir = std::env::temp_dir().join("nota-manifest-escape");
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = 1\nentry = \"../../evil.lua\"\n",
        );

        assert!(Manifest::load(&dir.join("plugin.toml")).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 不认识的能力要报错而不是静默忽略() {
        let dir = std::env::temp_dir().join("nota-manifest-unknowncap");
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = 1\ncapabilities = [\"fs.everything\"]\n",
        );

        let err = Manifest::load(&dir.join("plugin.toml")).unwrap_err();
        assert!(err.to_string().contains("fs.everything"), "实际：{err}");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
