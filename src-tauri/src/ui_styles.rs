//! 界面风格：内置的八档 ＋ **用户自己放进来的**。
//!
//! # 和 `themes.rs`（文档主题）是一对，但不是一件事
//!
//! 两个模块的形状几乎一样（列清单 / 取一份 CSS / 打开目录），因为背后是**同一条
//! 产品逻辑**：内置几套 ＋ 用户往一个目录里丢文件，**同名覆盖内置**
//! （2026-09-26 用户原话：「本来主题应该就是拆成多个文件的。加一个就是允许用户导入」）。
//! 差别只有作用范围：
//!
//! | | 目录 | 作用范围 | 注进 `<style>` 之前 |
//! |---|---|---|---|
//! | 文档主题（`themes.rs`） | `~/.config/nota/themes/` | **只有编辑区** | **必须限域**（`styles/doc-theme.ts`） |
//! | 界面风格（本文件） | `~/.config/nota/ui-styles/` | **整个应用外壳** | **原样注入，不限域** |
//!
//! ⚠️⚠️ **"不限域"是这两者最重要的差别，不是漏了一道工序。**
//! 文档主题限域，是因为它写的是 `h1 { … }` / `:root { … }` 这种裸选择器，
//! 原样注入会连外壳一起改掉——用户 2026-09-23 划的线是「这是文档风格，
//! 不是界面风格，不应该影响到UI主题」。界面风格**要改的正是外壳**，
//! 所以它不但不限域，还**要求**用户把每条选择器按 `[data-ui-style="<id>"]`
//! 起头写：那份文件被选中时，`<html>` 上的 `data-ui-style` 就是它的 id。
//!
//! # 用户文件怎么写
//!
//! `~/.config/nota/ui-styles/<id>.css`，**只扫这一个目录**，文件名去掉 `.css`
//! 就是 id。标准的写法是三块（形状 ＋ 浅色 ＋ 深色）：
//!
//! ```css
//! [data-ui-style="my-style"] { --radius: 6px; --control-height: 30px; }
//! [data-ui-style="my-style"][data-ui-mode="light"] { --bg: #fff; --fg: #111; }
//! [data-ui-style="my-style"][data-ui-mode="dark"]  { --bg: #111; --fg: #eee; }
//! ```
//!
//! ⚠️ **没给值的变量落到 `:root` 的默认值**（`src/styles/theme/base.css`），
//! 所以只写想改的那几个就够，**不必抄一遍内置那 16 格**。
//! ⚠️ 强调色要连 `--accent-fg`（它上面的字）一起给，且要过对比度——
//! 判据与算法在 `docs/04-ui-map.md` §3.2c 那张表里。
//!
//! # ⛔ 不内置任何第三方风格
//!
//! 与 `themes.rs` 同一条线：第三方主题文件的版权归各自的作者，随包分发属于侵权
//! （用户 2026-09-23 明确划过）。内置那八档 CSS 是**照各家设计语言的取向自己配的**
//! ——没有复制任何第三方 CSS 或色值，也没有内嵌任何字体文件
//! （专有字体名同样一个都没进来，见 `docs/04` §3.2c）。
//! 用户自己要装什么，那是用户自己的事，我们只提供这个目录。
//!
//! ⚠️ **内置那八档没有各自独立的 `.css` 文件**：它们的形状住在
//! `src/styles/theme/shape.css`、颜色住在 `theme/color.css` 里（那是**界面轴的
//! 两半**，按"形状一份、颜色十六格"组织的，不是按风格分的）。所以本模块的
//! `BUILTIN_IDS` **只有 id，没有 CSS、也没有显示名**——显示名要翻译，
//! 住在前端（`ui/settings/panes/AppearancePane.tsx` 的 `STYLES`）。
//! 三份清单（本文件 / `shape.css` / 前端的 `STYLE_ORDER`）由
//! `tools/doc-sync-check.sh` 的 ⑦ 钉住一致。

use serde::Serialize;

use crate::error::{NotaError, Result};
use crate::paths;
// ⚠️ 这两条判据**复用文档主题那份，不另写一份**：它们是安全边界（路径穿越），
// 两份实现迟早会漂，而漂的那一刻没人看得出来。`themes.rs` 那边有注释说明。
use crate::themes::{check_id, check_size};

/// 风格 CSS 的体积上限。与文档主题同值——超过这个数基本可以断定不是在装风格。
const MAX_CSS_BYTES: u64 = 2 * 1024 * 1024;

/// 内置风格的 id。**顺序就是下拉里的顺序**（`auto` 在最前）。
///
/// ⚠️ **`auto` 不是一档具体的风格**：它是"跟随当前桌面环境"，由前端
/// `styles/applyTheme.ts::resolveStyle()` 在运行期解析成下面某一个。
/// 把它列在这里是因为它**在设置里占一格**（`ui_style = "auto"` 是默认值）。
///
/// ⚠️ **这张表是三份抄本之一**（另两份：`src/styles/theme/shape.css` 里的
/// `[data-ui-style="…"]` 段、前端 `AppearancePane.tsx` 的 `STYLE_ORDER`）。
/// `tools/doc-sync-check.sh` 的 ⑦ 会报不一致——改一处就要改三处。
pub const BUILTIN_IDS: &[&str] = &[
    "auto",      // 跟随当前桌面环境，探不到就用 adwaita
    "adwaita",   // GNOME 原生：中等圆角、扁平、层级靠阴影
    "ghub",      // GitHub：冷灰蓝边框、无阴影
    "plasma",    // KDE Plasma 的 Breeze（⚠️ 界面上显示成 Breeze，落盘的值是 plasma）
    "macos",     // macOS：大圆角、控件偏矮、亚克力
    "windows",   // Windows 11：小圆角、Mica
    "windows10", // Windows 10 原生：直角、亚克力。⚠️ **只能手选**，见下
    "yaru",      // Ubuntu Yaru：橙色强调
    // CDE（Common Desktop Environment / Motif 那种年头的样子）：直角、3D 斜面、
    // 硬阴影。⚠️ **它不是"某个现代桌面"的复刻**，与 `ghub` 同类——是一条设计语言，
    // 所以 `auto` 永远不会探到它，只能手选。配色取自用户 2026-10-16 给的一份
    // Firefox 主题（只取配色方向、**没有抄它的任何素材**，见 `theme/color.css`）。
    "cde",
];

// ⚠️ **`windows10` 与 `windows` 是并存的两代，不是替换关系**，而且
// **`auto` 永远探不到它**：Windows 10 与 Windows 11 在 UA 和
// `XDG_CURRENT_DESKTOP` 上都是同一串（`Windows NT 10.0`），
// `applyTheme.ts` 里 `windows` 那个线索只有一个去处。所以它只能手选。
//
// ⚠️ 同理 `ghub` 也没有对应的桌面——它**根本不是"某个系统"**，是设计语言。
// 两者的共同点：`auto` 的探测表里没有它们，也不该有。
//
// ⚠️ **2026-10-07 删掉了 `"yaru-blue"`**（Yaru 的蓝色强调档，形状与 yaru 共用）：
// 用户原话「**只需要 Yaru，不需要 Yaru Blue 了**」。整档一起删——`color.css` 里那
// 两段、`shape.css` 里并列的那个选择器、`zh-settings.ts` 的两条译文、
// `bridge/types.ts` 的联合类型、以及 `AppearancePane.tsx::STYLE_ORDER`。
// ⇒ 那几处**必须同批改**，否则 `doc-sync-check.sh` 的 ⑦（三份 id 清单一致）会红；
// 而 ⑦ 是**按子串**比的，所以这个列表里"多一个/少一个"只有它自己那三条能钉住
// （下面那条 `内置_id_逐条钉住` 用例就是逐字钉的，改这里必须改那里）。

/// 设置里要列的一项。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UiStyleInfo {
    /// 唯一键。存进 `settings.ui_style` 的就是它，取 CSS 也用它。
    pub id: String,
    /// 是不是本仓内置的那几档。`false` 有两种：用户新加的、或用户**覆盖了内置的**
    /// （放了个同名的 `<id>.css`）。⚠️ 这两种在界面上要能看出来——
    /// 不标的话"我放的文件怎么没生效"会变成一个查不动的问题（同 `DocThemeInfo`）。
    pub builtin: bool,
}

/// 列出所有可用的界面风格：内置的 ＋ 用户目录里多出来的。
///
/// 用户文件**同名覆盖内置**，所以清单一律按 id 去重、用户那份赢
/// （只翻 `builtin` 那一格，**位置不动**——条目位置变来变去比多一条烦人，
/// 这条与 `themes::discover` 是同一条理由）。
pub fn discover() -> Vec<UiStyleInfo> {
    let user = user_ids();

    let mut out: Vec<UiStyleInfo> = BUILTIN_IDS
        .iter()
        .map(|id| UiStyleInfo {
            id: (*id).to_owned(),
            builtin: !user.iter().any(|u| u == id),
        })
        .collect();

    // 然后是用户自己新加的（id 不与内置重合的那些）。
    // ⚠️ `read_dir` 的顺序在不同文件系统上不一样，不排就是随机的。
    let mut extra: Vec<&String> = user
        .iter()
        .filter(|id| !BUILTIN_IDS.contains(&id.as_str()))
        .collect();
    extra.sort();
    for id in extra {
        out.push(UiStyleInfo {
            id: id.clone(),
            builtin: false,
        });
    }

    out
}

/// 取一份**用户导入的**界面风格的 CSS 文本。
///
/// ⚠️ 与 `themes::css_of` 不同，这里**没有内置兜底**：内置八档的 CSS 已经在
/// 前端打包好的样式表里了，再来一份是重复注入。所以只有用户文件存在时才该调
/// 这条命令（判据是 `discover()` 给的 `builtin` 那一格）。
///
/// 找不到就报错，**不静默给空串**：静默的后果是"设置里记着一个名字、
/// 界面上一片默认"，而用户看不出是名字错了还是文件被删了。
pub fn css_of(id: &str) -> Result<String> {
    check_id(id)?;

    let path = paths::user_ui_styles_dir()?.join(format!("{id}.css"));
    if !path.is_file() {
        return Err(NotaError::other(format!(
            "没有名为 {id} 的界面风格——它多半是被删了，或者名字里的字母大小写不对"
        )));
    }
    check_size(&path, MAX_CSS_BYTES)?;
    std::fs::read_to_string(&path).map_err(|source| NotaError::Read { path, source })
}

/// 用户风格目录里的所有 id（文件名去掉 `.css`）。目录不存在就是空表。
///
/// 认不出来的文件名**跳过**（不符合 `check_id` 的直接不要），
/// 免得清单里出现一个读不了的条目。
fn user_ids() -> Vec<String> {
    let Ok(dir) = paths::user_ui_styles_dir() else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("css") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if check_id(stem).is_ok() {
            out.push(stem.to_owned());
        }
    }
    out
}

/// 用户风格目录，**用到时才建**。返回它的绝对路径。
///
/// 「打开风格文件夹」那个按钮要能把它建出来再打开——首次使用时它多半还不存在，
/// 而文件管理器打不开一个不存在的路径。
pub fn user_styles_dir() -> Result<String> {
    let dir = paths::user_ui_styles_dir()?;
    paths::ensure_dir(&dir)?;
    paths::path_to_string(&dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 内置_id_没有重复也没有空的() {
        let mut ids: Vec<&str> = BUILTIN_IDS.to_vec();
        let n = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), n, "BUILTIN_IDS 里有重复");
        for id in BUILTIN_IDS {
            assert!(check_id(id).is_ok(), "内置 id 自己都不合法：{id}");
        }
        assert_eq!(BUILTIN_IDS[0], "auto", "auto 必须排在最前面（下拉的第一格）");
    }

    #[test]
    fn 内置_id_逐条钉住() {
        // ⚠️ 这条用例是**故意写死的**：`tools/doc-sync-check.sh` 的 ⑦ 查的是
        // "Rust / shape.css / 前端"三份清单一致，但它按子串比。这一条把
        // Rust 这份**逐字**钉住，防止有人"顺手删一个看着没用的"——
        // 删掉一个内置 id 的症状是：那个风格的 CSS 还在，但下拉里没有了，
        // 而且**老设置文件里存着它的用户会掉回默认**（不报错）。
        assert_eq!(
            BUILTIN_IDS,
            &[
                "auto", "adwaita", "ghub", "plasma", "macos", "windows", "windows10", "yaru"
            ]
        );
    }

    #[test]
    fn 界面风格的_id_判据与文档主题同一套() {
        // ⚠️ 两边共用 `themes::check_id`（那是安全边界，只该有一份实现）。
        // 这条用例盯的是**共用的那一份还在生效**：哪天有人把它拆成两份，
        // 这里会红。
        for bad in ["", "..", "../../etc/passwd", "a/b", "a\\b", "我的风格", ".hidden"] {
            assert!(check_id(bad).is_err(), "「{bad}」不该被放行");
        }
        for good in ["my-style", "my_style_2", "A1"] {
            assert!(check_id(good).is_ok(), "「{good}」该被放行");
        }
    }

    #[test]
    fn 内置的那几档一个都不会从清单里消失() {
        // 用户目录不存在（新机器）时也必须全在——这正是"新装的机器下拉是空的"
        // 那个问题的反面。可能被同名文件盖成 builtin: false，所以只查 id 在不在。
        let list = discover();
        for id in BUILTIN_IDS {
            assert!(
                list.iter().any(|s| &s.id == id),
                "内置风格 {id} 从清单里消失了"
            );
        }
    }

    #[test]
    fn 取一份没有文件的风格要报错而不是给空串() {
        // ⚠️ 内置那几档**没有文件**，所以对它们调这条也是报错——前端只在
        // `discover()` 说 `builtin: false` 时才该调它。这条用例把这个口径钉住。
        let err = css_of("no-such-style-xyz").unwrap_err();
        assert!(err.to_string().contains("没有名为"), "实际：{err}");
        let err = css_of("adwaita").unwrap_err();
        assert!(
            err.to_string().contains("没有名为"),
            "内置档不该有文件可读，实际：{err}"
        );
    }

    #[test]
    fn 路径穿越的_id_进不到_取_css_那一步() {
        let err = css_of("../../etc/passwd").unwrap_err();
        assert!(err.to_string().contains("不合法"), "实际：{err}");
    }
}
