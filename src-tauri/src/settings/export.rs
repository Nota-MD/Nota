//! 「导出」那一页的设置。
//!
//! 本文件装三条字段：默认导出文件夹 / 导出后是否打开所在目录 /
//! **借 pandoc 时要捎的那串额外参数**（2026-10-10 加，见下）。
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
//!
//! # ⚠️ 2026-10-10：多了 `pandoc_args`（用户那句「文档主题没有影响到 Pandoc 的导出」）
//!
//! 用户原话：「**还有就是我的文档主题没有影响到 Pandoc 的导出。你可以参考 Markra。**」
//!
//! Markra 那边（`markra-ref`，用户在 10-10 点名参考的那份源码）对同一件事的办法
//! 就是**一格"额外参数"**：`settings.export.pandocArgs`，说明写着"应用到 DOCX、
//! EPUB 和 LaTeX 导出的额外 Pandoc 参数"。理由不难懂——pandoc 那几种格式各有各的
//! 排版接口（DOCX 认 `--reference-doc=`、LaTeX/PDF 认 `-V` 变量与 `-H` 头文件、
//! EPUB/HTML 认 `--css=`），而"写一本自己的 Word 模板"是用户自己的事，
//! Nota 替不了他。CSS 那一种（EPUB）**Nota 自己会带上文档主题**（见
//! `pandoc.rs::能带_CSS`），其余几种就在这一格留个出口。
//!
//! ⚠️ **这一格是本文件唯一一次改写"不存 pandoc 东西"那条口径**——改窄了：
//! 从前那条测试名字叫 `没有_pandoc_这一项`，它真正要挡的是**存路径**
//!（存下来的路径会过期，见上）。现在改成 `不存_pandoc_的路径`：挡的还是路径，
//! 而"额外参数"是本机此刻就能用的东西，存下来不会过期。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct CustomExporter {
    /// 稳定 id；菜单命令从这里生成。
    pub id: String,
    /// 菜单与设置页显示的名称，可由用户修改。
    pub name: String,
    /// 后端 `Format::from_id` 认得的 pandoc 输出格式。
    pub format: String,
    /// 这一份导出器自己的额外参数。
    pub args: String,
    /// Word/ODT 的参考文档、EPUB 的 CSS 或 LaTeX/PDF 的头文件。
    pub style_file: String,
    /// 完成这一种导出后是否在文件管理器中定位结果。
    pub open_after_export: bool,
}

impl CustomExporter {
    fn new(id: &str, name: &str, format: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            format: format.to_string(),
            args: String::new(),
            style_file: String::new(),
            open_after_export: false,
        }
    }
}

fn 默认导出器() -> Vec<CustomExporter> {
    vec![
        CustomExporter::new("template-docx", "Word (.docx)", "docx"),
        CustomExporter::new("template-odt", "OpenDocument", "odt"),
        CustomExporter::new("template-rtf", "RTF", "rtf"),
        CustomExporter::new("template-epub", "EPUB", "epub"),
        CustomExporter::new("template-latex", "LaTeX", "latex"),
        CustomExporter::new("template-mediawiki", "MediaWiki", "mediawiki"),
        CustomExporter::new("template-rst", "reStructuredText", "rst"),
        CustomExporter::new("template-textile", "Textile", "textile"),
        CustomExporter::new("template-opml", "OPML", "opml"),
    ]
}

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
    /// **追加给 pandoc 的额外参数**（借 pandoc 导那七种时用，2026-10-10 加）。
    ///
    /// 写法就是一条命令行上的那些参数，**空格分词、支持引号**（`shlex`，
    /// 见 `pandoc.rs::分词`）——所以 `--metadata title="我的 书"` 里的空格不会被
    /// 当成两个参数。空串 = 一个都不加（出厂值）。
    ///
    /// ⚠️ **它排在 Nota 自己那几行参数前面**（`--from` / `--to` / `-o` 那几行
    /// 在后面）：用户写的是"额外"的东西，而 `--to` 那种由**导出格式**决定，
    /// 不该被一格设置顶掉——真顶掉了症状是"我选了 Word、导出来是个 epub"。
    /// 反过来说，用户**能**用它覆盖掉我们给的默认值之外的东西（比如
    /// `--reference-doc=` `--css=` `-V mainfont=`），这正是这一格存在的理由。
    pub pandoc_args: String,
    /// 分隔线以下的自定义导出器。默认给 Typora 同款九种模板；用户可以增删、
    /// 排序和改名。固定项（通用 / PDF / HTML 两档 / 图片）不在这个数组里。
    #[serde(default = "默认导出器")]
    pub custom_exporters: Vec<CustomExporter>,
}

impl Default for Export {
    fn default() -> Self {
        Self {
            default_folder: String::new(),
            // 默认关：导出完成后不再多开一个文件管理器窗口。
            open_after_export: false,
            // 默认不给：额外参数是"用户自己知道要什么"才写的东西。
            pandoc_args: String::new(),
            custom_exporters: 默认导出器(),
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
    fn 不存_pandoc_的路径() {
        // ⚠️ 同 `image.rs` 里那条：挡的是以后有人把 "Pandoc 路径" 加回来。
        // ⚠️ **守的是"不存路径"，不是"不许出现 Pandoc 这个词"**（2026-09-25 改口径，
        // 2026-10-10 又收窄了一次）：七种格式真的借系统里那个 pandoc 转，
        // 探测是允许的，**额外参数那一格也是允许的**（用户 2026-10-10 点名的，
        // 见文件头）——不许的只有**路径**：存下来的路径会过期（换机器、改 PATH、
        // 重装），而额外参数不会。⚠️ 所以这条测试**盯的是键名 `pandoc_path`**，
        // 不是"整份 TOML 里不许有 pandoc 这七个字母"。
        let text = toml::to_string_pretty(&Export::default()).unwrap();
        assert!(
            !text.to_lowercase().contains("pandoc_path"),
            "导出设置里不该存 pandoc 的路径：\n{text}"
        );
        // 对照：真正该在的那一格在（`pandoc_args`）。少了它这条测试也会红——
        // 一条只会"查没有"的测试，把那一格整个删掉它也是绿的。
        assert!(
            text.contains(r#"pandoc_args = """#),
            "额外参数那一格必须在（哪怕它是空的）：\n{text}"
        );
    }

    #[test]
    fn 额外参数存得下也读得回来() {
        // 用户会在这一格里写一条命令行那样的东西（含引号与空格）。
        let e = Export {
            pandoc_args: r#"--reference-doc=我的模板.docx --metadata title="我的 书""#.to_string(),
            ..Export::default()
        };
        let text = toml::to_string_pretty(&e).unwrap();
        let back: Export = toml::from_str(&text).unwrap();
        assert_eq!(back.pandoc_args, e.pandoc_args);
        // ⚠️ 老配置（这一格还没有的那些）读进来应当是"不给额外参数"，
        // 不是"读不出整份设置"。serde 的 `default` 那一行管着这件事。
        let 老: Export = toml::from_str("default_folder = \"\"\nopen_after_export = false\n").unwrap();
        assert_eq!(老.pandoc_args, "");
    }

    #[test]
    fn 默认导出器可删除且旧设置自动补齐() {
        let e = Export::default();
        assert_eq!(e.custom_exporters.len(), 9);
        assert_eq!(e.custom_exporters[0].format, "docx");

        let empty: Export = toml::from_str(
            "default_folder = \"\"\nopen_after_export = false\npandoc_args = \"\"\ncustom_exporters = []\n",
        )
        .unwrap();
        assert!(empty.custom_exporters.is_empty());

        let old: Export = toml::from_str(
            "default_folder = \"\"\nopen_after_export = false\npandoc_args = \"\"\n",
        )
        .unwrap();
        assert_eq!(old.custom_exporters.len(), 9);
    }
}
