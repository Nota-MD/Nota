//! 「外观」那一页的设置。
//!
//! 本文件装这几组字段：字体大小 / 缩放 / 状态栏 / 字数统计 / 工具栏 / 主题。
//!
//! ⚠️⚠️ **这一页有一半的东西不在这里，在顶层。** 那是有意的：
//!
//! - `ui_style`（界面风格）、`ui_mode`（明暗）—— 顶层
//! - `ui_font_size`（界面字号）—— 顶层，对应界面上的「字体大小」那一组
//! - `document_theme`（主题）—— 顶层，对应界面上的「主题」那一组
//!
//! 它们是 2026-09-22 / 09-23 就定下来的**三条互相独立的外观轴**，位置在
//! `settings/mod.rs` 的文件头写着。搬进 `[appearance]` 表会让**老设置文件里的值
//! 静默丢回默认**——用户选好的 macOS 深色 + 某个文档主题，升级之后全变回
//! 跟随系统，而他的配置文件一个字都没动。这种"看着好好的"故障最难排查。
//!
//! 所以这一页的**界面**是完整的（见 `src/ui/settings/panes/AppearancePane.tsx`），
//! 但它读写的是两个地方：老的四条走顶层，本文件这几条走 `[appearance]`。
//! 界面不关心这件事，看代码的人得知道。

use serde::{Deserialize, Serialize};

/// 格式工具栏什么时候露出来。**三档，不是布尔**（2026-09-25）。
///
/// ⚠️ 这里原来是一个 `show_toolbar: bool`，默认 `true`。改成三档是因为
/// 用户要的那句「默认隐藏，可在设置中选：始终显示 / 鼠标悬停时显示 /
/// 始终不显示」——**中间那一档布尔表达不了**：它是"平时藏着、鼠标到顶上才
/// 出来"，两种状态都属于同一个设置值。
///
/// ⚠️ 老设置文件里那条 `show_toolbar = true` 会被**忽略**（结构体上那个
/// `#[serde(default)]` 只管"字段缺了补默认值"，多余的表/键本来就不报错）。
/// 于是升级之后工具栏按新默认**不显示**。这是有意的：老值 `true` 的原意是
/// "一直显示"，而这条轴现在多出两档，替用户猜一档不如按新默认来，用户在
/// 设置里一改就落盘、旧键也就跟着没了。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolbarMode {
    /// 一直显示。
    Always,
    /// 鼠标移到工具栏那一条的位置上时才显示，移开就收起来。
    Hover,
    /// 一直不显示（**默认**）。
    ///
    /// ⚠️ 默认值与"工具栏是主要入口之一，关掉等于藏起来"的直觉相反，但这是
    /// 用户 2026-09-25 点名要的：正文里那一栏按钮平时并不需要，看得见的
    /// **菜单栏**已经把同样的命令按同一套分组摆好了（`commands.ts`），
    /// 想让它常驻的人在设置里选「始终显示」即可。
    #[default]
    Never,
}

/// **Ctrl+滚轮改什么。两档，默认改字号**（2026-09-26，用户点名）。
///
/// ⚠️ 它与 `ctrl_wheel_zoom` 是**两个问题**，别把其中一个当成另一个：
///
/// | 字段 | 回答的问题 |
/// |---|---|
/// | `ctrl_wheel_zoom: bool` | Ctrl+滚轮**生不生效** |
/// | `ctrl_wheel_target` | 生效时**改的是哪个数** |
///
/// ⚠️ 为什么默认是**字号**而不是缩放：缩放走 `webview.setZoom()`，动的是整个
/// 界面（外壳 ＋ 编辑区 ＋ 视口单位），滚一格连窗口布局都跟着变；而"Ctrl+滚轮"
/// 在别的编辑器里几乎都是**改字号**。用户 2026-09-26 点名要的也是这个顺序
/// （「可选'字体大小'或'界面实际缩放'，默认字体大小」）。
///
/// ⚠️ 老设置文件里没有这个键 → 走 `#[serde(default)]` 补成 `FontSize`。
/// 于是**从前把 `ctrl_wheel_zoom` 打开的人，升级后滚轮改成调字号了**——这是
/// 有意的（那条轴的新默认就是字号），而且这一项在设置里一眼能看见、改回去一步。
/// 这一点与 `ToolbarMode` 那次同源，**但不像那次那样无从挽回**：
/// 缩放那个数（`zoom`）本身一个字都没动，只是滚轮不再去拨它。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CtrlWheelTarget {
    /// 改**界面字号**（`ui_font_size`，顶层那个）。**默认**。
    #[default]
    FontSize,
    /// 改**界面缩放**（`zoom`，走 `webview.setZoom()`）。
    Zoom,
}

/// 文档主题在深色模式下是否换成**另一个**主题。
///
/// ⚠️ 这一条只在**文档主题**这条轴上成立（`document_theme`），
/// 与 `ui_mode`（整个外壳的明暗）无关，不是"给外壳配两套主题"。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Appearance {
    /// 「自定义」界面字号。**关**时字号自动，
    /// 此时 `ui_font_size` 那一格在界面上是灰的。
    ///
    /// ⚠️ 这**不是**第二个字号字段——字号只有 `ui_font_size` 一个。
    /// 这个布尔只是"那个值算不算数"。
    pub custom_font_size: bool,
    /// 缩放百分比。100 是原始大小。
    /// ⚠️ 它缩的是**整个界面**（外壳 + 编辑区），而 `ui_font_size` 只缩外壳的
    /// 文字。两者会叠乘，这是有意的：缩放动的是整个界面，字号只动外壳的文字。
    pub zoom: u32,
    /// 按住 Ctrl 时用鼠标滚轮**生效**（改什么由下面那条定）。
    ///
    /// ⚠️ 名字里的 `zoom` 是**老名字**（那会儿它只能缩放）。现在它只回答
    /// "生不生效"，**改什么**是 `ctrl_wheel_target`。⚠️ 没跟着改名是为了
    /// 不把用户已经打开的这个开关静默清零——老设置文件里那个键还在，
    /// 新版本照旧认（改名的话那一格会缺、按默认 `false` 补，用户会发现
    /// "我明明开着，怎么不灵了"）。
    pub ctrl_wheel_zoom: bool,
    /// Ctrl+滚轮改的是字号还是缩放。**默认字号**，见 `CtrlWheelTarget`。
    pub ctrl_wheel_target: CtrlWheelTarget,
    /// 显示状态栏（底部那条字数 / 行列 / 时间的横条）。
    pub show_status_bar: bool,
    /// 阅读速度（词每分钟），只用来把字数换算成"约几分几秒读完"。
    /// 中文常见取值 382。
    pub reading_speed: u32,
    /// 格式工具栏（加粗 / 斜体那一栏）什么时候露出来。
    /// ⚠️ **默认不显示**，理由见 `ToolbarMode::Never` 那段。
    pub toolbar: ToolbarMode,
    /// 深色模式下用一套独立的文档主题。
    pub dark_theme_separate: bool,
    /// 深色模式用的那个文档主题 **id**。空串 = 跟浅色用同一个 / 没有。
    /// ⚠️ 存 id 不存名字，理由同 `document_theme`（`settings/mod.rs` 里写着）。
    pub dark_document_theme: String,
    /// 「主题色」（**强调色**）。**空串 = 跟随当前风格**——那是默认，也是
    /// 2026-09-26 之前唯一的行为。
    ///
    /// ⚠️ 存的是 `#rrggbb`（小写）。**校验在前端**（`styles/accent.ts` 的
    /// `parseAccent`）：认不出来的一律当"跟随风格"，**不报错、也不落盘时清洗**。
    /// 理由与 `ui_style` 那条同源——这一格的值是用户自己敲进去的，
    /// 让一个拼错的颜色**把整份设置读不进来**（枚举会那样）比让它安静失效坏得多。
    ///
    /// ⚠️ **它只覆盖 `--accent` 与 `--accent-fg` 两个变量**（内联写在 `<html>` 上，
    /// 优先级高于那 16 格选择器），所以十六格 CSS 一行都不用改。强调色的
    /// hover / 按下两态走的是全仓那条 `filter: brightness()`，会自己跟着走。
    ///
    /// ⚠️ **前景色不存**：`--accent-fg` 由 `accentFg()` 按对比度当场算
    /// （黑白里挑更清楚的那个）。存下来的话，改一次主题色就可能留下一对
    /// "白字排在浅黄上"的组合，而那种组合在设置里怎么看都看不出来。
    pub accent: String,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            custom_font_size: false,
            zoom: 100,
            ctrl_wheel_zoom: false,
            ctrl_wheel_target: CtrlWheelTarget::FontSize,
            show_status_bar: true,
            reading_speed: 382,
            // ⚠️ 见 `ToolbarMode::Never` 那段：本项默认**不显示**，是刻意的取舍。
            toolbar: ToolbarMode::Never,
            dark_theme_separate: false,
            dark_document_theme: String::new(),
            // ⚠️ 空串 = 跟随当前风格，见字段那段。**不要在这里填一个颜色**：
            // 填了就变成"每档风格共用一个出厂色"，八档风格各自的辨识度当场没了。
            accent: String::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 缩放默认一百而不是零() {
        // ⚠️ `zoom: 0` 会让整个界面消失（或者按 0% 算出一堆 NaN 尺寸）。
        // 默认值写成 0 是可以编译、可以过测试、只在界面上炸的那类错误。
        assert_eq!(Appearance::default().zoom, 100);
    }

    #[test]
    fn 字号只有一份而这个布尔只是算不算数() {
        // ⚠️ 这条盯的是"`custom_font_size` 被用成第二个字号"这种改法。
        // 真正的值在顶层 `ui_font_size`。
        let a = Appearance::default();
        assert!(!a.custom_font_size, "默认该是「自动」，不是「自定义」");
        // 顶层那个字段仍然存在且是唯一的字号来源。
        let s = crate::settings::Settings::default();
        assert_eq!(s.ui_font_size, 15);
    }

    #[test]
    fn ctrl滚轮默认改字号而不是缩放() {
        // ⚠️ 默认值与"这个开关本来就叫 ctrl_wheel_zoom"的直觉相反，所以钉成测试：
        // 哪天有人把它改回 `Zoom`（或者把 `#[default]` 挪到另一档），这里会红，
        // 然后他会读到那段理由（别的编辑器里 Ctrl+滚轮几乎都是改字号；
        // 而缩放动的是整个界面，滚一格连布局都变）。
        assert_eq!(Appearance::default().ctrl_wheel_target, CtrlWheelTarget::FontSize);
    }

    #[test]
    fn ctrl滚轮两档在设置文件里是这两个词() {
        // ⚠️ 与 `工具栏三档在设置文件里是这三个词` 同一条理由：`rename_all` 一被
        // 拿掉、或者有人手写成 `"FontSize"`，设置文件里的词就换了，而那种改动
        // **不报错**——只是老文件里那一档静默落回默认（用户看到"我选的缩放，
        // 重启又变成字号了"）。两档的字符串在这里钉死。
        for (target, 词) in [
            (CtrlWheelTarget::FontSize, "font_size"),
            (CtrlWheelTarget::Zoom, "zoom"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                ctrl_wheel_target: target,
                ..Appearance::default()
            })
            .expect("序列化该成功");
            assert!(
                text.contains(&format!("ctrl_wheel_target = \"{词}\"")),
                "`{target:?}` 该落成 `{词}`，实际是：\n{text}"
            );
            let back: Appearance = toml::from_str(&text).expect("读得回来");
            assert_eq!(back.ctrl_wheel_target, target);
        }
    }

    #[test]
    fn 老设置文件里没有滚轮目标那一格也能读() {
        // ⚠️ 2026-09-26 之前存下来的设置文件里没有 `ctrl_wheel_target`。
        // 这时候**不能报错**（报错的后果是整份设置回默认），也不能把它当成
        // "没启用"——那一格与 `ctrl_wheel_zoom` 是两件事：老用户开着滚轮、
        // 只是当年没有"改什么"这一问。缺键补成默认的**字号**。
        let 老表 = "ctrl_wheel_zoom = true\nzoom = 150\n";
        let a: Appearance = toml::from_str(老表).expect("老表必须仍然能解析");
        assert_eq!(a.ctrl_wheel_target, CtrlWheelTarget::FontSize);
        assert!(a.ctrl_wheel_zoom, "老文件里那个开关必须照旧认");
        assert_eq!(a.zoom, 150, "`zoom` 本身不受影响，只是滚轮不再去拨它");
    }

    #[test]
    fn 工具栏默认不显示是故意的() {
        // ⚠️ 默认值与直觉相反的一处，见 `ToolbarMode::Never` 那段。写成测试是
        // 为了让它显眼：哪天有人把它改回"默认显示"，这里会红，然后他会读到那段理由。
        assert_eq!(Appearance::default().toolbar, ToolbarMode::Never);
    }

    #[test]
    fn 工具栏三档在设置文件里是这三个词() {
        // ⚠️ 这条盯的是**落盘的写法**。`#[serde(rename_all = "snake_case")]` 一被
        // 拿掉（或者有人手写成 `"Always"`），设置文件里的值就换了个词，而那种改动
        // **不报错、不崩**——只让老文件里的那一档静默落回默认（用户会看到"我明明
        // 选了悬停，重启又没了"）。所以这里把三个字符串钉死。
        for (mode, 词) in [
            (ToolbarMode::Always, "always"),
            (ToolbarMode::Hover, "hover"),
            (ToolbarMode::Never, "never"),
        ] {
            let text = toml::to_string_pretty(&Appearance {
                toolbar: mode,
                ..Appearance::default()
            })
            .expect("序列化该成功");
            assert!(
                text.contains(&format!("toolbar = \"{词}\"")),
                "`{mode:?}` 该落成 `{词}`，实际是：\n{text}"
            );
            // 反向：那个词也读得回来。
            let back: Appearance = toml::from_str(&text).expect("读得回来");
            assert_eq!(back.toolbar, mode);
        }
    }

    #[test]
    fn 老设置文件里的那个布尔被忽略而不是报错() {
        // ⚠️ 用户在 2026-09-25 之前存过 `show_toolbar = true`。新版本读它时
        // **不能报错**（报错的后果是整份设置回默认，连 ui_style 都没了），
        // 也不能猜——那一档就按新默认走。
        let 老表 = "show_toolbar = true\n";
        let a: Appearance = toml::from_str(老表).expect("老表必须仍然能解析");
        assert_eq!(a.toolbar, ToolbarMode::Never);
        // 同一张表里另外那几项也照常认出来（`#[serde(default)]` 是整张表的）。
        assert_eq!(a.zoom, 100);
    }

    #[test]
    fn 主题色默认跟随风格() {
        // ⚠️ 默认必须是**空串**（= 跟随当前风格），不能是个具体颜色。
        // 填一个的话，"每档风格自带一个出厂强调色"这件事当场没了：
        // 八档风格会长得一模一样，而用户并没做过这个选择。
        // 用户 2026-09-26：「这个主题只包含一个 UI 的设计样式……而不包含主题颜色」。
        assert_eq!(Appearance::default().accent, "");
    }

    #[test]
    fn 主题色原样存取不改写() {
        // ⚠️ **后端不做任何校验**，连大小写都不归一。归一放在前端
        // （`styles/accent.ts::parseAccent`）。理由：改了这儿的写法就得同时改
        // 前端，而两处一旦不一致，症状是"我明明选的红色，存下去变成了另一个
        // 红"——不报错、不崩，只是颜色不对。**只存不算**就没有这条缝。
        for 值 in ["#3584e4", "#3584E4", "3584e4", ""] {
            let text = toml::to_string_pretty(&Appearance {
                accent: 值.to_string(),
                ..Appearance::default()
            })
            .expect("序列化该成功");
            let back: Appearance = toml::from_str(&text).expect("读得回来");
            assert_eq!(back.accent, 值, "`{值}` 该原样回来");
        }
    }

    #[test]
    fn 主题色写着一个认不出来的值也不许把设置读死() {
        // ⚠️⚠️ 这是本字段**最要紧**的一条。用户在 `settings.toml` 里手敲了
        // 一个 `red`、`#12345`、或者干脆打错一个字，**整份设置必须照样读得进来**。
        //
        // 反例是把它做成枚举（像 `ToolbarMode` 那样）：那样一个拼错的值会让
        // `toml::from_str` **当场失败**，而失败在这个仓库里的后果是**整份设置
        // 回默认**——用户的界面风格、文档主题、快捷键全没了，只因为他把一个
        // 颜色拼错了。所以这里是 `String`＋"认不出来就当跟随风格"
        // （`styles/accent.ts` 那一条 `null`），界面上另有一句「（认不出…）」。
        for 坏 in ["red", "#12345", "rgb(1,2,3)", "🟥", "   "] {
            let 表 = format!("accent = {坏:?}\n");
            let a: Appearance = toml::from_str(&表)
                .unwrap_or_else(|e| panic!("`{坏}` 必须仍然能解析，实际报错：{e}"));
            assert_eq!(a.accent, 坏, "后端该原样留着，交给前端判");
            // 同一张表里别的项照常认出——失败会**波及整张表**，所以这条要一起看。
            assert_eq!(a.zoom, 100);
            assert_eq!(a.toolbar, ToolbarMode::Never);
        }
    }

    #[test]
    fn 老设置文件里没有主题色那一格也能读() {
        // ⚠️ 2026-09-26 之前存下来的设置文件里没有 `accent` 这个键。
        // `#[serde(default)]` 是**结构体级**的（见那行属性），所以缺键补默认值，
        // 而不是报错。这条测试盯的是哪天有人把它挪到字段级、或者干脆删掉。
        let 老表 = "zoom = 120\ntoolbar = \"always\"\n";
        let a: Appearance = toml::from_str(老表).expect("老表必须仍然能解析");
        assert_eq!(a.accent, "", "缺键该补成「跟随风格」");
        assert_eq!(a.zoom, 120, "同一张表里别的项不能受影响");
        assert_eq!(a.toolbar, ToolbarMode::Always);
    }
}
