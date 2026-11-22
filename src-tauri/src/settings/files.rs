use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StartupAction {
    NewFile,

    LastFile,

    #[serde(alias = "folder")]
    LastSession,
}

impl Default for StartupAction {
    fn default() -> Self {
        StartupAction::NewFile
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DropAction {
    OpenInApp,

    OpenInFileManager,

    Ignore,
}

impl Default for DropAction {
    fn default() -> Self {
        DropAction::OpenInApp
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImportAction {
    ImportFile,

    OpenInFileManager,

    Ignore,
}

impl Default for ImportAction {
    fn default() -> Self {
        ImportAction::ImportFile
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FileFilter {
    Supported,

    All,
}

impl Default for FileFilter {
    fn default() -> Self {
        FileFilter::Supported
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TreeSort {
    Name,

    Modified,

    Created,
}

impl Default for TreeSort {
    fn default() -> Self {
        TreeSort::Name
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Files {
    pub startup: StartupAction,

    pub outline_collapsible: bool,

    pub default_extension: String,

    pub autosave_on_switch: bool,

    pub remember_recent: bool,

    pub drop_folder: DropAction,

    pub drop_markdown: DropAction,

    pub drop_importable: ImportAction,

    pub show_hidden: bool,

    pub tree_filter: FileFilter,

    pub tree_sort: TreeSort,
}

impl Default for Files {
    fn default() -> Self {
        Self {
            startup: StartupAction::default(),

            outline_collapsible: false,
            default_extension: "md".to_string(),
            autosave_on_switch: false,

            remember_recent: true,
            drop_folder: DropAction::default(),
            drop_markdown: DropAction::default(),
            drop_importable: ImportAction::default(),
            show_hidden: false,
            tree_filter: FileFilter::default(),
            tree_sort: TreeSort::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enums_serialize_as_kebab_case_names() {
        let f = Files {
            startup: StartupAction::LastSession,
            drop_folder: DropAction::OpenInFileManager,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&f).unwrap();
        assert!(
            text.contains(r#"startup = "last-session""#),
            "unexpected TOML:\n{text}"
        );
        assert!(
            text.contains(r#"drop_folder = "open-in-file-manager""#),
            "unexpected TOML:\n{text}"
        );
        let back: Files = toml::from_str(&text).unwrap();
        assert_eq!(back, f);
    }

    #[test]
    fn defaults_match_the_expected_table() {
        let d = Files::default();
        assert!(
            d.remember_recent,
            "recent history must be enabled by default"
        );
        assert!(!d.outline_collapsible);
        assert!(!d.autosave_on_switch);
        assert!(!d.show_hidden);
        assert_eq!(d.default_extension, "md");

        assert_eq!(d.tree_sort, TreeSort::Name, "tree sorting defaults to name");
        assert_eq!(FileFilter::default(), FileFilter::Supported);

        assert_eq!(
            d.startup,
            StartupAction::NewFile,
            "startup defaults to a blank document"
        );
    }

    #[test]
    fn legacy_folder_value_maps_to_the_last_session() {
        let old: Files = toml::from_str(r#"startup = "folder""#).unwrap();
        assert_eq!(old.startup, StartupAction::LastSession);

        let new = toml::to_string_pretty(&old).unwrap();
        assert!(
            new.contains(r#"startup = "last-session""#),
            "unexpected TOML:\n{new}"
        );
        assert!(
            !new.contains(r#""folder""#),
            "legacy name must not be written:\n{new}"
        );
    }

    #[test]
    fn sort_modes_serialize_by_name() {
        let mut f = Files::default();
        f.tree_sort = TreeSort::Modified;
        let text = toml::to_string_pretty(&f).unwrap();
        assert!(
            text.contains(r#"tree_sort = "modified""#),
            "unexpected TOML:\n{text}"
        );
        let back: Files = toml::from_str(&text).unwrap();
        assert_eq!(back.tree_sort, TreeSort::Modified);

        let old: Files = toml::from_str("show_hidden = true\n").unwrap();
        assert_eq!(old.tree_sort, TreeSort::Name);
    }

    #[test]
    fn missing_files_section_backfills_defaults() {
        let back: Files = toml::from_str("show_hidden = true\n").unwrap();
        assert!(back.show_hidden);
        assert_eq!(back.startup, StartupAction::NewFile);
    }
}
