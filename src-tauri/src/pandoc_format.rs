//! 借 pandoc 转的那**七种格式**——菜单 id、`pandoc --to=` 的名字、存盘后缀、中文名。
//!
//! ⚠️ 从 `pandoc.rs` 拆出来的（2026-09-25，那边当时 985 行，`docs/09` §4 的规矩是
//! "900 行就该想怎么拆"）。判据是**功能**：这是**一份词汇表**——探测和导出两边都要
//! 用它，而它自己不认识进程、不认识路径、也不认识设置。拆出去之后 `pandoc.rs`
//! 用 `pub(crate) use` 把名字接回原处，调用方（`commands/pandoc.rs`）一个字都不用改。
//!
//! ⚠️ **这张表只有这一份**，而且 `id` / `to` / `extension` / `名字` 四个函数
//! **故意挤在同一个 `impl` 里紧挨着**：菜单点的是哪个、传给 pandoc 的是哪个、
//! 对话框写什么后缀，三处必须对得上——各写一份，迟早出现"对话框说存 `.tex`、
//! 文件却是 `.latex`"。

use serde::Serialize;

/// 借 pandoc 转的七种格式。
///
/// ⚠️ 只有这七种有 `from_id`。菜单上别的格式（Media Wiki、reStructuredText、
/// Textile…）pandoc 也支持，但**没在界面上列**——列了就要有人负责它到底长什么样，
/// 而这份名单是"Typora 有的那些"（见 `docs/10` §6）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Format {
    Pdf,
    Docx,
    Rtf,
    Epub,
    Latex,
    Odt,
    Opml,
}

impl Format {
    /// 前端发过来的那个 id（`commands.ts` 里 `file.export` 子菜单的 id 后半截）。
    pub(crate) fn from_id(id: &str) -> Option<Self> {
        Some(match id {
            "pdf" => Self::Pdf,
            "docx" => Self::Docx,
            "rtf" => Self::Rtf,
            "epub" => Self::Epub,
            "latex" => Self::Latex,
            "odt" => Self::Odt,
            "opml" => Self::Opml,
            _ => return None,
        })
    }

    /// 传给 `pandoc --to=` 的名字。
    pub(crate) fn to(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Epub => "epub",
            Self::Latex => "latex",
            Self::Odt => "odt",
            Self::Opml => "opml",
        }
    }

    /// 前端那个菜单 id（和 `from_id` 是一对）。
    pub(crate) fn id(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Epub => "epub",
            Self::Latex => "latex",
            Self::Odt => "odt",
            Self::Opml => "opml",
        }
    }

    /// 存盘对话框里用的扩展名（也是默认文件名的后缀）。
    pub(crate) fn extension(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Epub => "epub",
            Self::Latex => "tex",
            Self::Odt => "odt",
            Self::Opml => "opml",
        }
    }

    /// 中文名。**给用户看的**（提示语、报错、面板），所以写在这里而不是前端：
    /// 判定和报错都在后端发生，词表放两处迟早就对不上。
    pub(crate) fn 名字(self) -> &'static str {
        match self {
            Self::Pdf => "PDF",
            Self::Docx => "Word 文档",
            Self::Rtf => "RTF",
            Self::Epub => "EPUB",
            Self::Latex => "LaTeX",
            Self::Odt => "OpenDocument",
            Self::Opml => "OPML",
        }
    }
}

/// 七种格式的**全部**（顺序就是菜单/面板里该有的顺序）。
pub(crate) const ALL: [Format; 7] = [
    Format::Pdf,
    Format::Docx,
    Format::Rtf,
    Format::Epub,
    Format::Latex,
    Format::Odt,
    Format::Opml,
];

/// 一种格式"给人看的样子"，随探测结果一起交给前端。
///
/// ⚠️ 这张表**只有这一份**：保存对话框要的后缀名和 pandoc 真正写出来的后缀名
/// 必须一致，各写一份迟早会出现"对话框说存 `.tex`、文件却是 `.latex`"。
#[derive(Debug, Clone, Serialize)]
pub struct FormatInfo {
    pub id: String,
    pub name: String,
    pub extension: String,
}

pub(crate) fn 格式表() -> Vec<FormatInfo> {
    ALL.iter()
        .map(|f| FormatInfo {
            id: f.id().to_string(),
            name: f.名字().to_string(),
            extension: f.extension().to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 七种格式的名字与后缀对得上() {
        // ⚠️ 这条盯的是"菜单 id → pandoc 名字 → 后缀"三处别写岔：LaTeX 的后缀是
        // `tex`（不是 `latex`），写错了用户会得到一个存不进去的文件名。
        let 表 = [
            ("pdf", "pdf", "pdf"),
            ("docx", "docx", "docx"),
            ("rtf", "rtf", "rtf"),
            ("epub", "epub", "epub"),
            ("latex", "latex", "tex"),
            ("odt", "odt", "odt"),
            ("opml", "opml", "opml"),
        ];
        for (id, to, ext) in 表 {
            let f = Format::from_id(id).unwrap_or_else(|| panic!("认不出 {id}"));
            assert_eq!(f.to(), to);
            assert_eq!(f.extension(), ext);
            assert!(!f.名字().is_empty());
        }
        // 界面上没列的格式不许悄悄被认出来——认出来就意味着有人指望它工作。
        assert!(Format::from_id("mediawiki").is_none());
        assert!(Format::from_id("").is_none());

        // 交给前端那张表：七种一个不少，而且 id 能和 `from_id` 对上
        //（对不上就会出现"菜单点得开、导出说不认识这个格式"）。
        let 表 = 格式表();
        assert_eq!(表.len(), ALL.len());
        assert_eq!(表.len(), 7);
        for info in &表 {
            let f = Format::from_id(&info.id).unwrap_or_else(|| panic!("表里有 {} 但认不出", info.id));
            assert_eq!(f.名字(), info.name);
            assert_eq!(f.extension(), info.extension);
        }
    }
}
