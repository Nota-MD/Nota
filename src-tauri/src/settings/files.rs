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

/// 启动时做什么。**三档，一档比一档多恢复一样东西。**
///
/// ```text
/// new-file      什么都不恢复，开一份空白文档      ← 默认
/// last-file     恢复上次开着的那些文件（标签）
/// last-session  恢复上次开着的文件 **＋** 上次那个文件夹
/// ```
///
/// ⚠️ **老用户升级过来时，行为是变的**：2026-09-27 之前这三档是**摆设**——
/// 没有任何一处读它，而前端无条件恢复标签和工作区（＝永远按第三档办）。
/// 现在它真的生效了，于是"从没动过这一项"的人会从"恢复一切"变成"什么都不恢复"
/// （默认档是第一档）。这是用户点名要的三档，而 `new-file` 本来就是
/// [`Default`] 的值（见文件末尾那条测试）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StartupAction {
    /// 开一个空白文档。**默认**——Nota 是编辑器，不是阅读器。
    NewFile,
    /// 恢复上次打开的文件（标签顺序、前台是哪一份都照旧）。
    LastFile,
    /// 恢复上次打开的文件**和**上次那个文件夹。
    ///
    /// ⚠️ **落到 `"last-session"`，不是 `"folder"`**（2026-09-27 改的名）。
    /// 老名字说的只是"打开文件夹"，而这一档真正干的是"连文件带文件夹一起接上"
    /// ——按老名字去实现的话，第三档会比第二档**少**恢复标签。
    ///
    /// ⚠️ 那个 `alias = "folder"` **不能删**：用户 `settings.toml` 里可能已经存着
    /// `startup = "folder"`（设置页那三档一直是可点的，只是点了没用）。删掉的话
    /// 那一份设置**整份读不出来**，宿主会走"留一份备份 + 退回默认"，用户看到的
    /// 是"我的偏好全没了"。留着它，老值读进来就是这一档。
    #[serde(alias = "folder")]
    LastSession,
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

/// 侧栏那棵树按什么排。
///
/// ⚠️ **只有"名"这一档是升序**（A→Z），两个时间档都是**新的在最上面**——
/// 用户想看的是"我刚改过的那几份"，而按时间升序要点到列表另一头去。这条
/// 取舍写在三档上，改之前先想清楚它是不是两档各说各话。
///
/// ⚠️ **目录永远排在文件前面**，三档都一样：树是靠缩进与层级读的，把目录
/// 混进文件里按时间排，读起来是一堆不知道该不该展开的行。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TreeSort {
    /// 按名字（不区分大小写）。**默认**——唯一一个"不看时间也知道顺序"的档。
    Name,
    /// 按**修改时间**，新的在前。
    ///
    /// 目录排的是它**自己**的修改时间（在里面加/删文件会更新它），不是
    /// "里面最新的那一份"——后者要递归下去，展开一层就等于把整棵子树读一遍。
    Modified,
    /// 按**创建时间**，新的在前。
    ///
    /// ⚠️ 文件系统给不出创建时间时**退回修改时间**（`meta.created()` 在有些
    /// 文件系统上直接报错，ext4 要有 statx 才有 btime）。退回而不是"排到最后"：
    /// 排到最后的表现是"这一批文件不参与排序"，看起来像排序坏了。
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
    /// 文件树按什么排（2026-09-28 加）。
    ///
    /// ⚠️ 同一批还把 `show_hidden` 与 `tree_filter` **接上了线**：它们从
    /// 2026-09-24 就摆在界面上，而 `commands/workspace.rs` 里那两个判断是
    /// **写死**的（点开头的永远跳过、只列 markdown），拨了等于没拨。
    /// 详见 `docs/07` §4。
    pub tree_sort: TreeSort,
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
            tree_sort: TreeSort::default(),
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
            startup: StartupAction::LastSession,
            drop_folder: DropAction::OpenInFileManager,
            ..Default::default()
        };
        let text = toml::to_string_pretty(&f).unwrap();
        assert!(text.contains(r#"startup = "last-session""#), "实际是：\n{text}");
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
        // 默认按名字：它是唯一一个"不看时间也知道顺序"的档，而按时间排的
        // 副作用是**老用户升级后发现树的样子变了**（顺序是这一栏的全部）。
        assert_eq!(d.tree_sort, TreeSort::Name, "默认该是按名字");
        assert_eq!(FileFilter::default(), FileFilter::Supported);
        // ⚠️ **这条是承重的**：默认档从 2026-09-27 起真的生效了，而它决定
        // "第一次装上 Nota 的人开出来是什么样"。默认要是落到 `last-session`
        // 去，新用户第一次启动就会撞见一份不知道从哪儿来的文件夹。
        assert_eq!(d.startup, StartupAction::NewFile, "默认档必须是「开空白文档」");
    }

    /// ⚠️ **老设置文件里的 `startup = "folder"` 必须还读得懂**。
    ///
    /// 第三档 2026-09-27 从 `folder` 改名成 `last-session`（理由见枚举上那段）。
    /// 用户 `settings.toml` 里可能已经存着老值——那条路是设置页的下拉写的，
    /// 不是手改的。没有这个别名，`toml::from_str` 会在这一行上**整份失败**，
    /// 宿主走"留备份 + 退回默认"，用户看到的是"我的偏好全没了"。
    #[test]
    fn 老取值_folder_还能读成第三档() {
        let 老: Files = toml::from_str(r#"startup = "folder""#).unwrap();
        assert_eq!(老.startup, StartupAction::LastSession);
        // ⚠️ 反过来的那一半：写出去的**永远是**新名字。别名只进不出——
        // 读进来 `folder`、写出去变成 `last-session`，下次启动就归一了。
        let 新 = toml::to_string_pretty(&老).unwrap();
        assert!(新.contains(r#"startup = "last-session""#), "实际是：\n{新}");
        assert!(!新.contains(r#""folder""#), "老名字不该再被写出去：\n{新}");
    }

    /// ⚠️ **三档要落成名字，不是裸符号**（本文件那条约定）。
    ///
    /// 写成 `name` / `modified` / `created` 而不是 `0` / `1` / `2`：设置文件
    /// 是给人看的，而"按修改时间"这件事光看一个 `2` 谁都认不出来。这条与
    /// 上面那几个枚举同一条规矩。
    #[test]
    fn 排序档位落盘写的是名字() {
        let mut f = Files::default();
        f.tree_sort = TreeSort::Modified;
        let 文 = toml::to_string_pretty(&f).unwrap();
        assert!(文.contains(r#"tree_sort = "modified""#), "实际是：\n{文}");
        let back: Files = toml::from_str(&文).unwrap();
        assert_eq!(back.tree_sort, TreeSort::Modified);
        // ⚠️ 反方向：老设置文件里没有这一项时补出默认，**不能让整份读失败**。
        let 老: Files = toml::from_str("show_hidden = true\n").unwrap();
        assert_eq!(老.tree_sort, TreeSort::Name);
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
