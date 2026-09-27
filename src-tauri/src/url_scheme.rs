//! **从 `nota://` 链接打开**（`docs/10-feature-matrix.md` §9 那一格，2026-09-27）
//! ——**注册**那一半。
//!
//! 解析那一半在 `cli.rs`（`从链接取路径`）：桌面项把 `nota://…` 当参数送进来，
//! 那边把它解成一个路径，**之后走的就是"双击一个 .md"那条既有的路**，
//! 一行都不用新写。本文件只负责**让系统知道 Nota 认这个协议**。
//!
//! # 注册到底要写哪两样（Linux 上）
//!
//! 1. **一个桌面项**：`$XDG_DATA_HOME/applications/nota-url-handler.desktop`，
//!    里面有 `Exec=… %u` 与 `MimeType=x-scheme-handler/nota;`。
//!    前者告诉系统"怎么起这个应用、参数往哪儿放"，后者是"我认这个协议"的声明。
//! 2. **一条默认关联**：`x-scheme-handler/nota` → 上面那个桌面项。
//!    ⚠️ **光有桌面项不够**：没有这条，点链接时系统会说"没有程序能打开"。
//!    这条交给 `xdg-mime`（xdg-utils 里的标准工具，它自己会**合并**进
//!    `mimeapps.list` 而不是覆盖——那是这个文件唯一的正确改法）。
//!
//! ⚠️ **文件名故意叫 `nota-url-handler.desktop` 而不是 `nota.desktop`**：
//! `~/.local/share/applications` 里的同名文件会**盖住**系统那一份，将来真有
//! 打包版装了 `/usr/share/applications/nota.desktop`，用同一个名字就会把它顶掉
//! （用户从应用菜单点开的那一份会变成这个只会处理链接的壳）。
//!
//! # 幂等，而且**只在必要时才动**
//!
//! 每一步之前都先看一眼"现在是什么样"：桌面项内容一样就**不写**，
//! 也因此**不会去调 `xdg-mime`**。所以除了第一次启动（以及二进制路径变过之后
//! 的那一次），这条路上一个系统调用都不发。⚠️ 这条不是省时间，是**别去碰
//! 用户的桌面配置**——每次启动都重写一遍，等于把一个用户没法解释的东西
//! 变成常态。
//!
//! # 不做的事
//!
//! - **失败一律不拦启动**：注册不上就是"点链接打不开"，那不该让应用起不来。
//!   所以整个 `注册()` 只记日志，不往上报错（调用处也就没有 `?`）。
//! - **不提供"取消注册"的按钮**：今天没有这个入口。真要撤，删掉那个
//!   `.desktop` 文件就行了（`xdg-mime uninstall` 也行），文件头里这段
//!   就是给那时候看的。

use std::path::{Path, PathBuf};

/// 桌面项的文件名。⚠️ 只有这一处定义——写、查、日志都用它。
pub const 桌面项名: &str = "nota-url-handler.desktop";

/// 协议名（`nota://` 里那个 `nota`）。⚠️ 与 `cli.rs::是链接` 里那串必须一致。
pub const 协议: &str = "nota";

/// 桌面项要写的内容。
///
/// ⚠️ **`Exec` 里的路径要加引号**：可执行文件装在带空格的目录里时，
/// 不加引号的那一行会被桌面环境从空格处切开，起不来（而且不报错，只是没反应）。
/// ⚠️ `%u` 而不是 `%U`：一个链接就是**一条** URL，`%u` 表达得准确
/// （`%U` 是"可能多条"，而我们只认第一个参数，见 `cli.rs`）。
/// ⚠️ `NoDisplay=true`：这一条**只为处理链接而存在**，不该在应用菜单里
/// 多出一个"Nota"（用户已经有一个了）。⚠️ 万一哪个桌面环境连"默认程序"
/// 的查找也跳过 `NoDisplay` 的条目（已知有这种实现），把这一行删掉即可——
/// 代价是菜单里多一项，功能本身不受影响。**这条取舍写在这里，别处不必猜。**
pub fn 桌面项内容(exe: &Path) -> String {
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Nota\n\
         Comment=Open Markdown notes in Nota\n\
         Exec=\"{}\" %u\n\
         Terminal=false\n\
         NoDisplay=true\n\
         Categories=Utility;\n\
         MimeType=x-scheme-handler/{协议};\n",
        exe.display()
    )
}

/// 桌面项的落点：`$XDG_DATA_HOME/applications/<桌面项名>`。
pub fn 桌面项路径() -> crate::error::Result<PathBuf> {
    let 底 = dirs::data_dir().ok_or(crate::error::NotaError::NoHomeDir)?;
    Ok(底.join("applications").join(桌面项名))
}

/// 现在那一份要不要重写。**唯一判据是内容一样不一样**。
///
/// ⚠️ 不判"文件在不在"、也不比 mtime：内容一样就没必要动它——写了会让
/// 桌面环境重扫一遍，而我们接下来还会误以为"注册过东西了"而去调 `xdg-mime`。
pub fn 要重写吗(现有: Option<&str>, 新: &str) -> bool {
    match 现有 {
        Some(s) => s != 新,
        None => true,
    }
}

/// `xdg-mime` 那一枪的参数（不含程序名本身）。
///
/// ⚠️ 参数顺序是 `xdg-mime default <桌面项> <类型>`——`default` 子命令的
/// 是"**谁**来做**什么**"，反了的话 xdg-mime 只会打一行用法然后退出 0
/// （`xdg-mime` 对用错的参数**不报错**），症状是"注册说成功了、点链接还是没人接"。
pub fn 关联参数() -> Vec<String> {
    vec![
        "default".to_owned(),
        桌面项名.to_owned(),
        format!("x-scheme-handler/{协议}"),
    ]
}

/// 把这一台机器上的 `nota://` 接到本程序上。**失败只记日志**，见文件头最后一段。
///
/// ⚠️ 调用处是 `lib.rs` 的 `setup`，也就是**窗口都还没画出来**的时候。
/// 这里发的子进程（`xdg-mime`）会占住这一枪几十毫秒——所以"内容一样就跳过"
/// 那一条不只是洁癖，它是**冷启动时间**的一部分。
pub fn 注册() {
    match 注册内部() {
        Ok(()) => {}
        Err(e) => crate::日志!("[nota] 注册 nota:// 链接失败（不影响启动）：{e}"),
    }
}

fn 注册内部() -> crate::error::Result<()> {
    use crate::error::NotaError;

    // ⚠️ `current_exe()` 失败时**什么都别做**：拿一个猜出来的路径去写桌面项，
    // 症状是"点链接起了另一个程序"（或者起不来），而那比"没注册"难查得多。
    let exe = std::env::current_exe()
        .map_err(|e| NotaError::Other(format!("问不到自己的可执行文件路径：{e}")))?;
    let 想要 = 桌面项内容(&exe);
    let 落点 = 桌面项路径()?;

    let 现有 = std::fs::read_to_string(&落点).ok();
    if !要重写吗(现有.as_deref(), &想要) {
        return Ok(());
    }

    if let Some(父) = 落点.parent() {
        crate::paths::ensure_dir(父)?;
    }
    std::fs::write(&落点, 想要).map_err(|e| NotaError::Write {
        path: 落点.clone(),
        source: e,
    })?;
    crate::日志!("[nota] 写好桌面项 {}", 落点.display());

    // 关联那一枪。⚠️ "找不到 xdg-mime"是正常情况（极简的容器、
    // 没装 xdg-utils 的发行版），不当地错误看——桌面项已经写好了，
    // 缺的只是那一条默认关联，用户在桌面环境里自己选一次也就有了。
    match std::process::Command::new("xdg-mime")
        .args(关联参数())
        .status()
    {
        Ok(状) if 状.success() => crate::日志!("[nota] 已把 nota:// 关联到 {桌面项名}"),
        Ok(状) => crate::日志!("[nota] xdg-mime 退出码 {:?}，关联没成", 状.code()),
        Err(e) => crate::日志!("[nota] 没跑起 xdg-mime（{e}），桌面项写了但没关联"),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 桌面项里该有的那几件都在() {
        let 文 = 桌面项内容(Path::new("/usr/bin/nota"));
        assert!(文.contains("MimeType=x-scheme-handler/nota;"), "认不认这个协议全靠这一行");
        assert!(文.contains("Exec=\"/usr/bin/nota\" %u"), "怎么起、参数放哪儿");
        assert!(文.starts_with("[Desktop Entry]\n"), "第一行必须是组名");
        assert!(文.contains("Type=Application"), "少了它不少桌面环境直接不认这个文件");
    }

    /// ⚠️ 带空格的路径**必须被引号包住**：不引的话桌面环境从空格处切开，
    /// 起不来而且不报错（只是"点了没反应"）。
    #[test]
    fn 可执行文件路径带空格也要引起来() {
        let 文 = 桌面项内容(Path::new("/opt/my apps/nota"));
        assert!(文.contains("Exec=\"/opt/my apps/nota\" %u"));
    }

    /// ⚠️ `%u` 不是 `%U`：一个链接就是一条 URL，而 `cli.rs` 只认第一个参数。
    #[test]
    fn 参数占位符是单个u() {
        let 文 = 桌面项内容(Path::new("/usr/bin/nota"));
        assert!(文.contains(" %u\n"), "占位符后面那一行是我们自己的换行，用来钉住它没被写成别的");
        assert!(!文.contains("%U"));
    }

    /// 内容一样就**不写**——这条决定"会不会去碰用户的桌面配置"。
    #[test]
    fn 内容一样就不重写() {
        let 文 = 桌面项内容(Path::new("/usr/bin/nota"));
        assert!(!要重写吗(Some(&文), &文));
        assert!(要重写吗(None, &文), "没有这一份，要写");
        assert!(
            要重写吗(Some("[Desktop Entry]\nName=别的\n"), &文),
            "别人占了这个名字也要改写它（那是我们自己的文件名，见文件头）"
        );
    }

    /// ⚠️ `xdg-mime` 的参数顺序反了它**不报错**（打一行用法、退出 0），
    /// 症状是"注册说成功了、点链接还是没人接"。所以这一条要钉死。
    #[test]
    fn xdgmime的参数顺序是default在前() {
        let 参 = 关联参数();
        assert_eq!(参[0], "default");
        assert_eq!(参[1], 桌面项名);
        assert_eq!(参[2], "x-scheme-handler/nota");
    }

    /// ⚠️ 协议名在两处出现（`cli.rs` 判链接、这里写桌面项），必须是同一个——
    /// 不一致的表现是"系统把链接送进来了，我们却不认"。
    #[test]
    fn 协议名与cli那边说好的是同一个() {
        assert_eq!(协议, "nota");
        assert!(crate::cli::是链接(&format!("{协议}://open?path=%2Ftmp%2Fa.md")));
    }
}
