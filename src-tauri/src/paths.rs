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

/// 插件启用状态的落点：`$XDG_CONFIG_HOME/nota/plugins.toml`。
///
/// ⚠️ 与 `settings.toml` 同放 `config` 而不放 `data`，理由与
/// [`plugin_settings_dir`] 那条一样：**这是用户该能拿编辑器直接改的东西**。
/// "我装的插件怎么不见了"这一类问题的第一现场就是它，藏在 `data` 下会显得像
/// "应用自己的缓存，不该动"。
///
/// ⚠️ 与 `settings.toml` **分开两个文件**（不并进 `Settings`）：那份是"外观与编辑
/// 口径"的设置，是一张**标量表**（`docs/03`）；而这里是**一张 id 名单**，
/// 形状不同、生命周期也不同（装着插件的时候它一直在变）。
/// 并进去会让 `nota_settings_set` 那条"整份替换 + 落盘"的口径多带一份容易丢的名单。
pub fn plugin_state_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("plugins.toml"))
}

/// 信任的签名公钥表：`$XDG_CONFIG_HOME/nota/trusted-keys.toml`。
///
/// ⚠️ 与 `plugins.toml` 同放 `config`，理由也一样：**这是用户该能拿编辑器直接看
/// 和直接改的东西**——"这个包是谁签的、我信任了哪几把钥匙"必须能被人核对，
/// 藏在 `data` 下就变成"应用自己的缓存"了。参照物是 SSH 的 `known_hosts`。
///
/// ⚠️ **签名私钥从来不在这台机器上**（宿主只做验签，见 `docs/11` §1.6），
/// 所以这个文件里出现的只有公钥，泄露它没有风险，**被篡改**才有。
pub fn trusted_keys_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("trusted-keys.toml"))
}

/// 用户自装插件目录，以及插件状态的落点。
pub fn user_plugins_dir() -> Result<PathBuf> {
    Ok(data_dir()?.join("plugins"))
}

/// 插件自己的设置目录：`$XDG_CONFIG_HOME/nota/plugin-settings`。
///
/// 与 `settings.toml` 同放在 `config` 下，理由是一样的：**这是用户该能拿编辑器
/// 直接改的东西**（AI 插件的 API 密钥就存在这里）。放 `data` 或 `cache` 下
/// 会让它看起来像"应用自己的缓存，不该动"。
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

/// 图床上传的配置文件：`$XDG_CONFIG_HOME/nota/image-upload.toml`。
///
/// ⚠️ **与 `settings.toml` 分开、单独一个文件**，理由是权限：那一份走
/// `Settings::save_to`（裸 `std::fs::write`，权限跟 umask 走，通常 0644），
/// 而这一份里会有用户的 token（「请求头」那一栏）。`plugin_settings_file`
/// 单开一份也是同一个理由。**两份文件放同一个目录**（都是用户该能拿编辑器
/// 直接改的东西），只是这一份按 0600 建——见 `crate::upload` 文件头。
pub fn image_upload_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("image-upload.toml"))
}

/// 表格列宽的侧车文件：`$XDG_DATA_HOME/nota/table-widths.toml`。
///
/// ⚠️ **这一份放 `data`，是"放 config"那一串里的第一个例外**（同一条判据下
/// 还有 [`plugin_data_dir`] 与 [`session_file`]），判据就是本文件顶上那条：
/// `config` 放的是**用户该能拿编辑器直接改的东西**（`settings.toml` /
/// `plugins.toml` / `trusted-keys.toml` / `image-upload.toml` 全在那儿，用户排查
/// "我的设置怎么变了"时第一眼看的就是那个目录）。而列宽是**看的时候的状态**
/// ——是界面上拖出来的，不是一条"偏好"，用户不会去手改它；摆进 `config`
/// 反而会让人以为"这是我有意设的、删了会丢东西"。删掉它的后果只是
/// **所有表格回到自动列宽**，文档正文一个字节都不受影响。
///
/// ⚠️ 它是**侧车**：列宽**不写进 `.md`**（本仓「不改用户的字节」那条死规矩）。
/// 形状与那些账写在 `crate::table_width` 的文件头。
pub fn table_widths_file() -> Result<PathBuf> {
    Ok(data_dir()?.join("table-widths.toml"))
}

/// 会话与最近文件的落点：`$XDG_DATA_HOME/nota/session.toml`。
///
/// ⚠️ **放 `data` 不放 `config`**，判据与 [`table_widths_file`] 完全一样：
/// `config` 里放的是**用户该能拿编辑器直接改的东西**（`settings.toml` /
/// `plugins.toml` / `trusted-keys.toml` / `image-upload.toml`），而这一份是
/// **看的时候的状态**——上次开着哪几份、最近开过哪些、滚到哪儿。用户不会去手改它，
/// 摆进 `config` 反而会让人以为"这是我有意设的、删了会丢东西"。
///
/// ⚠️ 删掉它的后果**只有"记忆没了"**：标签不恢复、最近列表空掉、滚动回到顶上，
/// 文档正文一个字节都不受影响。形状与三条账写在 `crate::session` 文件头。
///
/// ⚠️ 与 `table-widths.toml` **分开两个文件**：两者形状不同（那边是
/// 路径→指纹→宽度 的两层表，这边是四样东西），写入的时刻也不同（那边随手拖、
/// 这边开关文档）。并成一份会让"拖一下表格"和"关一个标签"互相覆盖。
pub fn session_file() -> Result<PathBuf> {
    Ok(data_dir()?.join("session.toml"))
}

/// 插件自己的数据目录：`$XDG_DATA_HOME/nota/plugin-data/<id>/`。
///
/// ⚠️ **放 `data` 不放 `config`**，判据就是本文件顶上那条：`config` 里放的是
/// **用户该能拿编辑器直接改的东西**（`settings.toml` / `plugins.toml` /
/// `plugin-settings/` 全在那儿，用户排查"我的设置怎么变了"时第一眼看的就是它）。
/// 而这里是**插件自己写、插件自己读**的东西（写作统计那些按天记的账），
/// 用户不该去手改——摆进 `config` 反而会让人以为"这也是我要维护的一份配置"。
/// 与 [`table_widths_file`] 是同一条判据下的第二个例外。
///
/// ⚠️ 删掉一个插件的这个目录，后果只是**那个插件的记忆没了**（比如"今天的
/// 写作记录"从头开始），文档正文一个字节都不受影响。这条是刻意的：插件的数据
/// 不许成为"删了就丢文档"的东西。
///
/// ⚠️ 文件名同样要过 [`安全文件名`]（理由见 [`plugin_settings_file`]：
/// 插件 id 是插件自己带的字符串，拿它拼路径就是一条任意路径写入口）。
pub fn plugin_data_dir(plugin_id: &str) -> Result<PathBuf> {
    Ok(data_dir()?.join("plugin-data").join(安全文件名(plugin_id)))
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

    /// 开发态下**仓库那份排前面**：同名插件先扫到的算数，所以顺序就是"谁生效"。
    ///
    /// 这条钉的是一个具体踩过的坑（见 `builtin_plugins_dirs` 的注释）：
    /// 排在后面的时候，`cargo build` 拷进 `target/debug/plugins/` 的那份快照
    /// 会盖掉仓库里正在改的那份，而**症状是"我的改动没生效"**——不报错，
    /// 没有任何提示。修法就是这两行的顺序。
    #[test]
    fn 开发态下仓库那份排在资源快照前面() {
        let 资源 = Path::new("/假资源目录");
        let 目录们 = builtin_plugins_dirs(Some(资源));
        let 仓库 = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri 的上一级")
            .join("plugins");
        assert_eq!(目录们.first(), Some(&仓库), "仓库那份必须是第一个：{目录们:?}");
        assert_eq!(目录们.last(), Some(&资源.join("plugins")));
    }

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
/// ⚠️ **只扫这一个目录**。此前还会扫描外部编辑器的主题安装位置，那条路径
/// 已按用户要求删除（版权问题，见 `src-tauri/src/themes.rs` 文件头）。
pub fn user_themes_dir() -> Result<PathBuf> {
    Ok(config_dir()?.join("themes"))
}

/// 用户自己的**界面风格**目录（`~/.config/nota/ui-styles`）。
///
/// ⚠️ 与 `user_themes_dir`（文档主题）是**两个目录，故意不合并**：
/// 文档主题只作用编辑区、界面风格作用整个外壳，两者的 CSS **写法要求完全不同**
/// （文档主题写裸选择器、由前端限域；界面风格必须以 `[data-ui-style="…"]` 起头、
/// 不限域）。混在一个目录里，用户迟早会把两者当成同一种东西放错位置，
/// 而放错的后果是"整个界面变了"或"一个字都没变"——都不报错。
///
/// ⚠️ 同样**用到时才建**（`ui_styles::user_styles_dir` 负责建），理由同上面那条。
pub fn user_ui_styles_dir() -> Result<PathBuf> {
    Ok(config_dir()?.join("ui-styles"))
}

/// 内置插件目录。
///
/// 开发时是仓库根的 `plugins/`（改完 Lua 存盘即生效，不用重编）；
/// 打包后是资源目录里的 `plugins/`。两者都存在时**两个都扫**，
/// 用户自装的同名插件覆盖内置的。
/// ⚠️ **顺序是承重的，而且踩过一次**（2026-09-25）。
///
/// `PluginHost::discover` 是"先扫到的算数"（同名插件后面的被跳过），所以
/// **谁在前面谁生效**。开发态下两个落点都有货：仓库根的 `plugins/` 是**真的**，
/// `resource_dir/plugins`（= `target/debug/plugins`）是 `cargo build` 按
/// `bundle.resources` **拷进去的一份快照**。
///
/// 一开始这里先推 `resource_dir`。后果很隐蔽：改完 `plugins/*.lua` 重启应用，
/// 看到的还是**编那份快照时的旧行为**——不报错、不提示，看起来就像"我的改动没生效"，
/// 而 `docs/01`/`docs/06`/`docs/11` 三处都写着"debug 下扫仓库那份，改完存盘即生效"。
/// 这条曾经骗了整整一轮调试：差异预览的截断逻辑改了、重启两次都还是旧样子。
///
/// 所以 debug 档**把仓库那份排前面**：开发期要的就是"存盘改的就是跑起来的"。
/// 打包后不存在这个问题（`cfg!(debug_assertions)` 为假，只剩 resource 一个落点）。
/// 顺带一提，快照那份照样在 `target/debug/plugins` 里躺着——**忽略它是对的**。
pub fn builtin_plugins_dirs(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();

    // 开发态落点：CARGO_MANIFEST_DIR 是 src-tauri/，往上一级就是仓库根。
    // ⚠️ 必须排在下面那个前面，理由见函数头。
    if cfg!(debug_assertions) {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|root| root.join("plugins"));
        if let Some(dev) = dev {
            out.push(dev);
        }
    }

    // 打包后的落点。
    if let Some(res) = resource_dir {
        out.push(res.join("plugins"));
    }

    out
}

/// 把路径转成 String，非 UTF-8 时**报错而不是丢字符**。
/// （Unix 路径允许任意字节，但文档模型、Lua、JSON 全都按 UTF-8 走。）
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
