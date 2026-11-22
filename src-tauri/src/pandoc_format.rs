use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Format {
    Pdf,
    Docx,
    Rtf,
    Epub,
    Latex,
    Odt,
    Opml,
    MediaWiki,
    Rst,
    Textile,
}

impl Format {
    pub(crate) fn from_id(id: &str) -> Option<Self> {
        Some(match id {
            "pdf" => Self::Pdf,
            "docx" => Self::Docx,
            "rtf" => Self::Rtf,
            "epub" => Self::Epub,
            "latex" => Self::Latex,
            "odt" => Self::Odt,
            "opml" => Self::Opml,
            "mediawiki" => Self::MediaWiki,
            "rst" => Self::Rst,
            "textile" => Self::Textile,
            _ => return None,
        })
    }

    pub(crate) fn to(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Epub => "epub",
            Self::Latex => "latex",
            Self::Odt => "odt",
            Self::Opml => "opml",
            Self::MediaWiki => "mediawiki",
            Self::Rst => "rst",
            Self::Textile => "textile",
        }
    }

    pub(crate) fn id(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Epub => "epub",
            Self::Latex => "latex",
            Self::Odt => "odt",
            Self::Opml => "opml",
            Self::MediaWiki => "mediawiki",
            Self::Rst => "rst",
            Self::Textile => "textile",
        }
    }

    pub(crate) fn extension(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Epub => "epub",
            Self::Latex => "tex",
            Self::Odt => "odt",
            Self::Opml => "opml",
            Self::MediaWiki => "wiki",
            Self::Rst => "rst",
            Self::Textile => "textile",
        }
    }

    pub(crate) fn display_name(self) -> &'static str {
        match self {
            Self::Pdf => "PDF",
            Self::Docx => "Word Document",
            Self::Rtf => "RTF",
            Self::Epub => "EPUB",
            Self::Latex => "LaTeX",
            Self::Odt => "OpenDocument",
            Self::Opml => "OPML",
            Self::MediaWiki => "MediaWiki",
            Self::Rst => "reStructuredText",
            Self::Textile => "Textile",
        }
    }
}

pub(crate) const ALL: [Format; 10] = [
    Format::Pdf,
    Format::Docx,
    Format::Rtf,
    Format::Epub,
    Format::Latex,
    Format::Odt,
    Format::Opml,
    Format::MediaWiki,
    Format::Rst,
    Format::Textile,
];

#[derive(Debug, Clone, Serialize)]
pub struct FormatInfo {
    pub id: String,
    pub name: String,
    pub extension: String,
}

pub(crate) fn format_table() -> Vec<FormatInfo> {
    ALL.iter()
        .map(|f| FormatInfo {
            id: f.id().to_string(),
            name: f.display_name().to_string(),
            extension: f.extension().to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ten_formats_have_matching_names_and_extensions() {
        let table = [
            ("pdf", "pdf", "pdf"),
            ("docx", "docx", "docx"),
            ("rtf", "rtf", "rtf"),
            ("epub", "epub", "epub"),
            ("latex", "latex", "tex"),
            ("odt", "odt", "odt"),
            ("opml", "opml", "opml"),
            ("mediawiki", "mediawiki", "wiki"),
            ("rst", "rst", "rst"),
            ("textile", "textile", "textile"),
        ];
        for (id, to, ext) in table {
            let f = Format::from_id(id).unwrap_or_else(|| panic!("unknown format {id}"));
            assert_eq!(f.to(), to);
            assert_eq!(f.extension(), ext);
            assert!(!f.display_name().is_empty());
        }

        assert!(Format::from_id("").is_none());

        let table = format_table();
        assert_eq!(table.len(), ALL.len());
        assert_eq!(table.len(), 10);
        for info in &table {
            let f = Format::from_id(&info.id)
                .unwrap_or_else(|| panic!("table contains unknown format {}", info.id));
            assert_eq!(f.display_name(), info.name);
            assert_eq!(f.extension(), info.extension);
        }
    }
}
