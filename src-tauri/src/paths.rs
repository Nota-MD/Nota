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
