//! 「导出」那一页的设置。
//!
//! 本文件装两条字段：默认导出文件夹 / 导出后是否打开所在目录。
//!
//! ⚠️⚠️ **这一页只有两条设置。** 界面上的格式清单 2026-09-25 起是这样：
//! ① HTML（两档）和 PDF **Nota 自己出**；② PDF / Word (.docx) / OpenOffice /
//! RTF / Epub / LaTeX / OPML 这七种**借系统里那个 pandoc** 转（`pandoc.rs`）；
//! ③ 剩下 Image / Media Wiki / reStructuredText / Textile **如实标"还没做"**。
//! 要做到 ③ 那一步得先有一整套可插拔的导出器框架（连增删改导出器的那排
//! `+ − ↑ ↓ ✎` 一起），不是一个页面。
//!
//! ⚠️ **"Pandoc 路径"那个选择框：仍然不做，但理由变了**（这是本文件唯一一处
//! 2026-09-25 被改写过的口径）。原来的理由是 `docs/10` §11.2 那句"不做 Pandoc"，
//! 那句话现在是窄的——**内嵌 / 下载 / 替用户装**不做，**探测系统里已有的**可以做
//! （用户定的：别人也这么干）。于是这条设置真正不能有的原因换成了**不存路径**：
//! 存下来的路径会过期（换机器、改 PATH、重装、用户手改配置），而探一次只要几十
//! 毫秒——`pandoc.rs::probe()` 每次现探。`没有_pandoc_这一项` 那个测试守的是
//! **这条**，不是"不许提 Pandoc 这个词"。
//!
//! ⚠️ 那排 `+ − ↑ ↓ ✎`（自定义导出器）**也不做**：它要的是一个导出器插件
//! 接口，而 Nota 的插件系统是 Lua 的、面向文档操作的，两者不是一回事。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Export {
    /// 默认的导出文件夹。**空串 = 自动**（跟着当前文档所在的目录走），
    /// 界面上那一格显示为「自动」。
    ///
    /// ⚠️ 存空串而不是存一个"自动"的枚举值：这是一个**路径**，
    /// 除了"用户指定了一个目录"之外没有别的状态。
    pub default_folder: String,
    /// 导出完成后，打开导出文件所在的目录。
    pub open_after_export: bool,
}

impl Default for Export {
    fn default() -> Self {
        Self {
            default_folder: String::new(),
            // 默认关：导出完成后不再多开一个文件管理器窗口。
            open_after_export: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 空串就是自动() {
        // ⚠️ 「自动」不该有自己的一档枚举值。存空串的好处是：
        // 用户手改配置文件时，`default_folder = ""` 一眼就是"没指定"，
        // 而 `default_folder = "auto"` 会被误读成"有个叫 auto 的目录"。
        let e = Export::default();
        assert_eq!(e.default_folder, "");
        assert!(!e.open_after_export);
    }

    #[test]
    fn 没有_pandoc_这一项() {
        // ⚠️ 同 `image.rs` 里那条：挡的是以后有人把 "Pandoc 路径" 加回来。
        // ⚠️ **守的是"不存路径"，不是"不许出现 Pandoc 这个词"**（2026-09-25 改口径）：
        // 七种格式现在真的借系统里那个 pandoc 转，探测也是允许的——但不存路径，
        // 每次现探（存下来的会过期：换机器、改 PATH、重装）。理由见本文件头。
        let text = toml::to_string_pretty(&Export::default()).unwrap();
        assert!(
            !text.to_lowercase().contains("pandoc"),
            "导出设置里不该出现 Pandoc：\n{text}"
        );
    }
}
