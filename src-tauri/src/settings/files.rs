//! 「文件」那一页的设置。
//!
//! 本文件装这几组字段：启动选项 / 大纲折叠 / 默认扩展名 / 切换文件时自动保存 /
//! 最近使用记录 / 拖放行为 / 文件树的可见范围与过滤。
//!
//! ⚠️ 字段名与落盘取值按本模块自己的约定走：名字一律 kebab-case，符号类的取值
//! 写成名字而不是裸符号（为什么，见文件末尾那条测试）。
//!
//! ⚠️ 有三项**这里故意没有字段**，因为它们要落成"存了也不起作用"的空开关：
//! - 「恢复未保存的草稿」「清除历史文件记录」是**动作按钮**，不是设置项；
//! - 「文件库」Nota 没有这个概念（只有侧栏的一棵文件树）。
//! 界面上它们要么接真实动作，要么如实标"还没做"，不占字段。

use serde::{Deserialize, Serialize};

/// 启动时做什么。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StartupAction {
    /// 开一个空白文档。**默认**——Nota 是编辑器，不是阅读器。
    NewFile,
    /// 恢复上次打开的文件。
    LastFile,
    /// 打开上次的文件夹（把整个目录当工作区）。
    Folder,
}

impl Default for StartupAction {
    fn default() -> Self {
        StartupAction::NewFile
    }
}

/// 把东西拖进窗口时怎么办。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DropAction {
    /// 在当前窗口里打开。**默认**。
    OpenInApp,
    /// 在系统文件管理器里打开。
    OpenInFileManager,
    /// 什么也不做。
    Ignore,
}

impl Default for DropAction {
    fn default() -> Self {
        DropAction::OpenInApp
    }
}

/// 拖进来的文件是要"打开"还是"导入"。⚠️ 只有可被导入的格式用得上这一档
/// （Markdown 本来就是原生格式，无所谓导入）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImportAction {
    /// 当普通文件导入（转成 Markdown）。
    ImportFile,
    /// 只在文件管理器里打开。
    OpenInFileManager,
    /// 什么也不做。
    Ignore,
}

impl Default for ImportAction {
    fn default() -> Self {
        ImportAction::ImportFile
    }
}

/// 侧栏那棵文件树显示哪些文件。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FileFilter {
    /// 只显示 Markdown 和纯文本。**默认**——一个 `node_modules` 摊开
    /// 会把树淹掉。
    Supported,
    /// 全都显示。
    All,
}

impl Default for FileFilter {
    fn default() -> Self {
        FileFilter::Supported
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Files {
    /// 启动选项。
    pub startup: StartupAction,
    /// 侧栏大纲是否允许折叠 / 展开。
    pub outline_collapsible: bool,
    /// 新建文档的默认扩展名（不带点）。
    pub default_extension: String,
    /// 切换文件时，自动保存上一个文件的改动。
    ///
    /// ⚠️ 「自动保存」那个开关**不在这里**，它绑的是顶层的老字段
    /// `autosave_seconds`（0 表示关）。两份状态会打架，所以只有一份。
    pub autosave_on_switch: bool,
    /// 记录打开过的文件和文件夹（喂给「最近使用的目录」）。
    pub remember_recent: bool,
    /// 拖入**文件夹**时。
    pub drop_folder: DropAction,
    /// 拖入 **Markdown 文件**时。
    pub drop_markdown: DropAction,
    /// 拖入**可被导入的**文件时。
    pub drop_importable: ImportAction,
    /// 文件树里显示隐藏文件和文件夹。
    pub show_hidden: bool,
    /// 文件树显示哪些文件。
    pub tree_filter: FileFilter,
}

impl Default for Files {
    fn default() -> Self {
        Self {
            startup: StartupAction::default(),
            // 树折叠是"记不住"的那类偏好，默认开着
            // 只会让每次打开都要把树再展开一遍。
            outline_collapsible: false,
            default_extension: "md".to_string(),
            autosave_on_switch: false,
            // 「最近使用」默认开：只有用户主动去展开那个列表时它才会露面。
            remember_recent: true,
            drop_folder: DropAction::default(),
            drop_markdown: DropAction::default(),
            drop_importable: ImportAction::default(),
            show_hidden: false,
            tree_filter: FileFilter::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 枚举落盘是_kebab_而且符号类取值不用裸符号() {
        // ⚠️ 无序列表的标记长这样：`-`、`*`、`+`。**不能**把裸符号当取值——
        // TOML 里 `bullet = -` 是语法错，`bullet = "-"` 又容易被下一个人
        // 手写掉引号。所以枚举变体用名字（`dash`），渲染层再翻成符号。
        // 这条测试盯的是"哪天有人图省事改成裸符号"这种改动。
        let f = Files {
            startup: StartupAction::Folder,
            drop_folder: DropAction::OpenInFileManager,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&f).unwrap();
        assert!(text.contains(r#"startup = "folder""#), "实际是：\n{text}");
        assert!(
            text.contains(r#"drop_folder = "open-in-file-manager""#),
            "实际是：\n{text}"
        );
        let back: Files = toml::from_str(&text).unwrap();
        assert_eq!(back, f);
    }

    #[test]
    fn 默认值符合预期() {
        // ⚠️ 默认值是逐条选过的：`remember_recent` 开，其余关。
        // 默认值写错的症状是"老用户升级后发现自己的偏好转了"，
        // 而他的设置文件里根本没有这一项。
        let d = Files::default();
        assert!(d.remember_recent, "「记录历史文件和文件夹」默认该是开的");
        assert!(!d.outline_collapsible);
        assert!(!d.autosave_on_switch);
        assert!(!d.show_hidden);
        assert_eq!(d.default_extension, "md");
    }

    #[test]
    fn 老设置文件里没有_files_表时能补出默认() {
        // 顶层结构体上的 `#[serde(default)]` 管的是这一层；`Files` 自己也
        // 标了 `#[serde(default)]`，所以 `[files]` 表**存在但缺项**时也能补。
        let back: Files = toml::from_str("show_hidden = true\n").unwrap();
        assert!(back.show_hidden);
        assert_eq!(back.startup, StartupAction::NewFile);
    }
}
