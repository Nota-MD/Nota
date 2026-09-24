//! 目录布局。**所有路径只在这里算**，别处一律调这里取——
//! 散落的 `dirs::config_dir()` 是将来"换存法"时最先烂掉的地方。

use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};

/// 应用名。用作 XDG 目录下的子目录名。
pub const APP_DIR: &str = "nota";

/// 配置目录：`$XDG_CONFIG_HOME/nota`（一般是 `~/.config/nota`）。
pub fn config_dir() -> Result<PathBuf> {
    let base = dirs::config_dir().ok_or(NotaError::NoHomeDir)?;
    Ok(base.join(APP_DIR))
}

/// 数据目录：`$XDG_DATA_HOME/nota`（一般是 `~/.local/share/nota`）。
pub fn data_dir() -> Result<PathBuf> {
    let base = dirs::data_dir().ok_or(NotaError::NoHomeDir)?;
    Ok(base.join(APP_DIR))
}

/// 缓存目录：`$XDG_CACHE_HOME/nota`。
pub fn cache_dir() -> Result<PathBuf> {
    let base = dirs::cache_dir().ok_or(NotaError::NoHomeDir)?;
    Ok(base.join(APP_DIR))
}

/// 用户设置文件。
pub fn settings_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("settings.toml"))
}

/// 用户自装插件目录，以及插件状态的落点。
pub fn user_plugins_dir() -> Result<PathBuf> {
    Ok(data_dir()?.join("plugins"))
}

/// 插件自己的设置目录：`$XDG_CONFIG_HOME/nota/plugin-settings`。
///
/// 与 `settings.toml` 同放在 `config` 下，理由是一样的：**这是用户该能拿编辑器
/// 直接改的东西**（AI 插件的 API 密钥就存在这里）。放 `data` 或 `cache` 下
/// 会让它看起来像"应用自己的缓存，别动"。
pub fn plugin_settings_dir() -> Result<PathBuf> {
    Ok(config_dir()?.join("plugin-settings"))
}

/// 一个插件的设置文件：`plugin-settings/<id>.toml`。
///
/// ⚠️ 文件名**必须过一遍 [`安全文件名`]**：插件 id 是插件清单里写的字符串，
/// 里面出现 `/` 或 `..` 的话（`nota/../../etc/passwd`）这个函数就成了一个
/// 任意路径写入口。清单的校验挡不住这个——它只查 id 的字符集合，
/// 而这里要的是"拿它当文件名安全"。
pub fn plugin_settings_file(plugin_id: &str) -> Result<PathBuf> {
    Ok(plugin_settings_dir()?.join(format!("{}.toml", 安全文件名(plugin_id))))
}

/// 把插件 id 变成一个**安全的文件名**。
///
/// 规则很短：ASCII 字母数字、`.`、`-`、`_` 原样留；**别的字符一律换成 `_`**；
/// 空串和 `.` / `..` 这种特殊名加上一段前缀避开。
///
/// ⚠️ 这是**有损**的：两个不同的 id 可能映到同一个文件名（`nota.ai` 与
/// `nota/ai`）。**接受这个损失**——因为 id 在宿主里已经过
/// `manifest::id_合法吗` 式的校验（`.` 与 `-` 是允许集合里的全部特殊字符），
/// 走得到这里的 id 本来就不可能含 `/`。这一层是**兜底**：万一将来校验放宽了、
/// 或者有人绕过它，也不能让文件名把路径带出去。
///
/// ⚠️ 中文 id 会被整个换成 `_`（一个汉字一个 `_`）——这是刻意的：
/// 非 ASCII 文件名在跨平台/打包/同步时是另一类麻烦，而这是**内部**文件名，
/// 用户看到的插件名走的是 `name` 字段，不走这里。
pub fn 安全文件名(plugin_id: &str) -> String {
    let mut out = String::with_capacity(plugin_id.len());
    for c in plugin_id.chars() {
        if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    // 退化情况：空串、`.`、`..` 都会变成一个"看起来像目录"的名字。
    if out.is_empty() || out.chars().all(|c| c == '.') {
        out.insert_str(0, "plugin-");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ⚠️ **这条是安全用例，不是格式用例。**
    ///
    /// `plugin_settings_file` 的入参来自插件清单，而清单是**插件自己带的文件**。
    /// 它一旦不设防，`nota.settings.set` 就是一个任意路径写入。
    ///
    /// ⚠️ 判据只能钉三条**结果**，钉不了"里面含不含 `..`"——因为
    /// `nota/../../etc/passwd` 会被归一成 `nota_.._.._etc_passwd`，
    /// 它**含** `..` 但那两个点已经只是普通字符，不是目录跳转了。
    /// 会出事的形状只有"含分隔符"和"整名都是点"这两种。
    #[test]
    fn 插件id里的路径分隔符出不了文件名() {
        for id in [
            "nota/../../etc/passwd",
            "../../x",
            "a\\b",
            "a/b",
            "",
            ".",
            "..",
            "...",
            "\0",
        ] {
            let 名 = 安全文件名(id);
            assert!(
                !名.contains('/') && !名.contains('\\'),
                "`{id}` 变成 `{名}`，里面还有路径分隔符——那就能写到别的目录去"
            );
            assert!(!名.is_empty(), "`{id}` 变成了空文件名");
            assert!(
                !名.chars().all(|c| c == '.'),
                "`{id}` 变成 `{名}`，还是个纯点的名字（`..` 指向上级目录）"
            );
        }
    }

    /// 正常 id 一个字符都不该变——变了会让老用户的设置文件找不到。
    #[test]
    fn 正常的插件id原样保留() {
        assert_eq!(安全文件名("nota.ai"), "nota.ai");
        assert_eq!(安全文件名("nota_git-2"), "nota_git-2");
    }
}

/// 用户自己的文档主题目录（`~/.config/nota/themes`）。
///
/// ⚠️ 这个目录**用到时才建**，所以这里只算路径不建目录——
/// 首次启动就凭空造一个空目录，用户会以为里面该有什么东西。
///
/// ⚠️ **只扫这一个目录**。以前还扫 Typora 的两处安装位置，那一整条
/// 兼容链已按用户要求拆掉（版权问题，见 `src-tauri/src/themes.rs` 文件头）。
pub fn user_themes_dir() -> Result<PathBuf> {
    Ok(config_dir()?.join("themes"))
}

/// 内置插件目录。
///
/// 开发时是仓库根的 `plugins/`（改完 Lua 存盘即生效，不用重编）；
/// 打包后是资源目录里的 `plugins/`。两者都存在时**两个都扫**，
/// 用户自装的同名插件覆盖内置的。
pub fn builtin_plugins_dirs(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();

    // 打包后的落点。
    if let Some(res) = resource_dir {
        out.push(res.join("plugins"));
    }

    // 开发态落点：CARGO_MANIFEST_DIR 是 src-tauri/，往上一级就是仓库根。
    if cfg!(debug_assertions) {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|root| root.join("plugins"));
        if let Some(dev) = dev {
            out.push(dev);
        }
    }

    out
}

/// 把路径转成 String，非 UTF-8 时**报错而不是丢字符**。
/// （Unix 路径允许任意字节，但我们的文档模型、Lua、JSON 全都按 UTF-8 走。）
pub fn path_to_string(path: &Path) -> Result<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| NotaError::NonUtf8Path(path.to_path_buf()))
}

/// 确保目录存在。
pub fn ensure_dir(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}
