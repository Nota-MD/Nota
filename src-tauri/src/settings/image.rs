//! 「图像」那一页的设置。
//!
//! 本文件装这几组字段：插入图片时的动作 / 该动作对本地与网络图片的适用范围 /
//! 图片语法偏好（相对路径、`./` 前缀、URL 转义）。
//!
//! # ⚠️ 「上传服务」那一组**在这张表里一个字段都没有**，这是有意的（2026-09-26）
//!
//! 它落在**另一个文件**里：`~/.config/nota/image-upload.toml`，权限 **0600**，
//! 类型与全部算式在 `crate::upload`（那一支的文件头解释了整件事）。
//!
//! 为什么不并进 `settings.toml`：那张表走 `Settings::save_to`，是裸的
//! `std::fs::write`，权限跟 umask 走（通常 0644），而上传的「请求头」那一栏里
//! 放的是**用户的 token**。并进来就等于把密钥写进一份会被同步、被备份、
//! 排查问题时被贴给别人的文件里。`plugin-settings/nota.ai.toml` 单开一份
//! 也是这个理由——那一份同样是 0600。
//!
//! ⚠️ 所以这一页的设置**有两个落点**（界面上看不出来，用户也不必知道）：
//! 插入动作那几组在这一张表里、上传那一组在 `image-upload.toml` 里。
//! 设置页的「上传服务设置」那一段因此**不走 `paneWriter`**，它自己读写
//! （见 `ui/settings/panes/ImageUploadGroup.tsx`）。
//!
//! ⚠️ 边界：**这一张表里不许出现**任何服务地址、密钥、字段名、URL 路径——
//! 下面有一条用例盯着它（`图片设置里不许出现上传与密钥`），名字里出现
//! `upload`/`token`/`endpoint` 那一类词就红。`docs/10` §11.2 那张「不做的事与
//! 理由」表在 2026-09-26 之前**正是靠它**挡住上传的；授权改口径之后，那条用例
//! 挡的东西变成了"别把密钥搬进一张 0644 的表"。

use serde::{Deserialize, Serialize};

/// 往文档里插一张图片时做什么。
///
/// ⚠️ 五个取值里有四个**会往磁盘上多写一个文件**，所以默认必须是
/// `None`（「无特殊操作」），而且每一条的落点都写在名字里——用户不必去查
/// "`copy-to-assets` 到底复制到哪儿"。算式只有一处：`crate::image::目标目录`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InsertImageAction {
    /// 无特殊操作：图片留在原处，文档里写指向它的路径 / URL。**默认**。
    None,
    /// 复制到**文档所在的那个目录**里。
    CopyToCurrentDir,
    /// 复制到文档旁边的 `assets/`（没有就建）。
    CopyToAssets,
    /// 复制到文档旁边的 `$(filename).assets/`——一份文档一个文件夹，
    /// 名字取自文档名（`笔记.md` → `笔记.assets/`）。
    CopyToDocAssets,
    /// 复制到用户填的那条路径（`custom_dir`）。
    /// ⚠️ 绝对路径照用；相对路径按**文档目录**算，不按进程的工作目录算。
    CopyToCustom,
}

impl Default for InsertImageAction {
    fn default() -> Self {
        InsertImageAction::None
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Image {
    /// 插入图片时做什么。
    pub insert_action: InsertImageAction,
    /// 「复制到指定路径」用的那条路径。**只在动作是 `CopyToCustom` 时有意义。**
    ///
    /// ⚠️ 相对路径按**文档目录**算（不是进程的工作目录）——理由见
    /// `crate::image::目标目录`。空串 = 还没填，那时插入会**报错**让用户去填，
    /// 不会悄悄退回别的目录。
    pub custom_dir: String,
    /// 上面那条规则对**本地位置**的图片生效。
    pub apply_to_local: bool,
    /// 上面那条规则对**网络位置**的图片生效。
    pub apply_to_remote: bool,
    /// 图片语法偏好：用户给的地址是绝对路径时，换算成相对文档目录的写法。
    ///
    /// ⚠️ **只朝一个方向动**（绝对 → 相对）。本来就是相对的地址原样保留；
    /// 本应用自己复制/下载出来的那一份**总是**写相对路径，不看这一项。
    /// 三条规则的完整版在 `crate::image` 文件头。
    pub prefer_relative: bool,
    /// 为相对路径添加 `./` 前缀。⚠️ 只在最终写出来的是相对路径时才有意义。
    pub add_dot_slash: bool,
    /// 插入时自动转义图片 URL（`空格` → `%20` 等）。
    pub escape_url: bool,
}

impl Default for Image {
    fn default() -> Self {
        Self {
            insert_action: InsertImageAction::default(),
            custom_dir: String::new(),
            // ⚠️ 对本地位置的图片**开**，对网络位置的不开：
            // 网络图片多数是刻意引用原地址，不该跟着复制；而且把这一项打开
            // 意味着"插入时可能联网下载"，那是要用户显式同意的事。
            apply_to_local: true,
            apply_to_remote: false,
            prefer_relative: false,
            add_dot_slash: false,
            escape_url: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 插图默认不动磁盘() {
        // ⚠️ 这条盯的是**默认值必须是"什么都不做"**：
        // `copy-to-assets` 会往用户的文件夹里多写一个文件。
        // 默认值错了的症状是：用户没有选过复制，文件夹里却多出一个 assets 目录。
        assert_eq!(InsertImageAction::default(), InsertImageAction::None);
        assert_eq!(Image::default().insert_action, InsertImageAction::None);
        let text = toml::to_string_pretty(&Image::default()).unwrap();
        assert!(text.contains(r#"insert_action = "none""#), "实际是：\n{text}");
    }

    #[test]
    fn 五个插入动作的写法是老设置也认得的那一套() {
        // ⚠️ 这条盯两件事：
        // 1. 五个取值在设置文件里都是 kebab-case（那是人打开看得懂的那份）；
        // 2. **老设置里那两个写法今天仍然有效**——2026-09-26 之前的设置文件里
        //    只可能出现 `none` / `copy-to-assets`，加选项不该让它们读不出来
        //    （读不出来 = 整份设置回落默认，用户会觉得"我的设置没了"）。
        let 表 = [
            (InsertImageAction::None, "none"),
            (InsertImageAction::CopyToCurrentDir, "copy-to-current-dir"),
            (InsertImageAction::CopyToAssets, "copy-to-assets"),
            (InsertImageAction::CopyToDocAssets, "copy-to-doc-assets"),
            (InsertImageAction::CopyToCustom, "copy-to-custom"),
        ];
        for (值, 写法) in 表 {
            let 文本 = format!("insert_action = \"{写法}\"\n");
            let 回: Image = toml::from_str(&文本).unwrap();
            assert_eq!(回.insert_action, 值, "读不回来：{写法}");
            let 打 = toml::to_string_pretty(&Image {
                insert_action: 值,
                ..Default::default()
            })
            .unwrap();
            assert!(打.contains(写法), "写出去的不是 {写法}：\n{打}");
        }
    }

    #[test]
    fn 老设置文件里没有的项补默认() {
        // 这一条盯的是"升级之后设置文件里少了几项"——`#[serde(default)]`。
        let 回: Image = toml::from_str("insert_action = \"copy-to-assets\"\n").unwrap();
        assert_eq!(回.custom_dir, "");
        assert!(回.apply_to_local);
        assert!(!回.apply_to_remote);
        assert!(!回.prefer_relative);
    }

    #[test]
    fn 图片设置里不许出现上传与密钥() {
        // ⚠️ 这条测试是**故意**写成"查字符串"的，但它挡的东西 2026-09-26 变了：
        //
        // 以前挡的是"别做上传"（`docs/10` §11.2 那张不做的事与理由表，
        // 那时的用例名就叫「没有上传服务这一项」）。用户 2026-09-26 授权做了，
        // 所以**挡的对象换成"别把上传服务那一组并回这张表"**：
        //
        //     settings.toml 的权限跟 umask 走（通常 0644），而上传那一组里
        //     会有用户的 token。它住在 image-upload.toml（0600，`crate::upload`）。
        //
        // ⚠️ 所以这一条**不是**"上传不许存在"的护栏，而是"密钥不许住进一张
        // 普通权限、会被同步/备份/贴进 issue 的文件"的护栏。判断一句改动合不
        // 合规，看的是这个。
        let text = toml::to_string_pretty(&Image::default()).unwrap();
        let 小写 = text.to_lowercase();
        for 禁 in [
            "upload",
            "图床",
            "picgo",
            "smms",
            "imgur",
            "token",
            "secret",
            "password",
            "authorization",
            "api_key",
            "endpoint",
        ] {
            assert!(
                !小写.contains(禁),
                "图片设置里不该出现「{禁}」——上传服务那一组住在 \
                 image-upload.toml（0600）里，别把它并进这张普通权限的表：\n{text}"
            );
        }
    }
}
