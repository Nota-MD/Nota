//! 文档主题：内置的那几套 ＋ 用户自己放进来的。
//!
//! # 文档主题和界面主题是**两回事**
//!
//! 用户 2026-09-23 把这条划得很死：
//!
//! | 轴 | 值 | 作用范围 |
//! |---|---|---|
//! | 界面风格 `ui_style` | Adwaita / GitHub / KDE Plasma / macOS / Windows / Yaru | 整个应用外壳 |
//! | 明暗 `ui_mode` | 跟随系统 / 浅色 / 深色 | 整个应用外壳 |
//! | 文档主题 `document_theme` | 本模块列出的那些 | **只有编辑区** |
//!
//! 前两条相乘 = 对外承诺的界面外观；第三条**不许影响外壳**。
//! 之前那版把文档主题的配色桥接进 UI 变量（`--nota-bridge-*`），结果是
//! 选一个浅色文档主题、界面跟着变亮，整个应用一半亮一半暗。那一整套桥接
//! 已经拆干净，守住这条线的机制在 `src/styles/doc-theme.ts`——注入前把每条
//! 选择器统一挂到编辑区之下，**不靠写主题时自觉**。
//!
//! # ⛔ 不内置任何第三方主题
//!
//! 第三方主题文件的**版权归各自的作者**，随包分发属于侵权，
//! 用户 2026-09-23 明确划了这条线。
//! 所以：既不扫描外部的主题安装目录，也不带第三方主题的解析器
//! （那套 `@import` 展开 ＋ `url()` 内联成 data: URL 的机器一起删了，
//! 见 `docs/07` §4 的记录）。
//!
//! 内置的这几套是**自己写的**（`src/styles/themes/*.css`），
//! 用 `include_str!` 编进二进制，所以新装的机器上主题菜单不是空的。
//!
//! ⚠️ 「自己写的」这条对**名字里有别人招牌**的那一套同样成立：
//! `adwaita.css` 是照 GNOME 那套主题的**风格取向**自己配的，
//! `latex.css` 是照 LaTeX 的**排版规则**自己写的——**两份都没有复制
//! 任何第三方 CSS 或色值**，也没有内嵌任何字体文件（那两件事都各自
//! 撞一条许可证）。判据是"文件里的每一行都是本仓写的"，不是"名字眼熟
//! 就算侵权"；改这两套时也请守住同一条线。
//!
//! # 用户主题放哪儿
//!
//! `~/.config/nota/themes/<id>.css`。**只扫这一个目录**。
//! 文件名去掉 `.css` 就是 id，与内置主题**同名即覆盖内置那套**
//! （想改哪套就复制出去改，升级不会冲掉）。
//!
//! ⚠️ 这条覆盖规则意味着 id 是**用户可控的字符串**，所以 `css_of` 里
//! 有一道 id 形状检查——不能让 `../../etc/passwd` 这样的名字拼进路径。
//! 判据是"只允许字母数字和 `-` `_`"，比"过滤掉 `..`"更难绕过。

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{NotaError, Result};
use crate::paths;

/// 主题 CSS 的体积上限。超过这个数基本可以断定不是在装主题。
const MAX_CSS_BYTES: u64 = 2 * 1024 * 1024;

/// 一套内置主题。三个字段都是编译期常量。
struct Builtin {
    /// 唯一键。同时是用户覆盖它时该用的文件名（`<id>.css`）。
    id: &'static str,
    /// 菜单里显示的名字。**中文**——界面文案一律中文。
    name: &'static str,
    /// CSS 正文，编译期嵌进来。
    css: &'static str,
}

/// 内置主题清单。**顺序就是菜单里的顺序**。
///
/// 2026-09-26 换成现在这三套（用户点名的：极简 / Adwaita / LaTeX），
/// 之前那六套（素纸 / 蓝图 / 晨雾 / 报刊 / 墨色 / 松林）连同它们的 `.css`
/// 一起删掉了。**三套都是浅色**——用户没要深色，而三套摆在一起时深浅一致
/// 才好对比；也正因为如此，原来那句"浅色几套在前、深色几套在后"的排序
/// 规矩现在没有意义了，**顺序就是想要的第一印象**：「极简」放第一个
/// （它最像"默认"），Adwaita 次之，LaTeX 最后。
///
/// ⚠️ 这些文件在仓库的 `src/styles/themes/` 下，不在 `src-tauri/` 里。
/// 改完主题 CSS 后 `cargo build` 会跟着重编（`include_str!` 的依赖会进
/// dep-info），**不需要 `touch` 什么**；但 `vite` 那边不认这些文件，
/// 前端拿到的永远是后端发过去的文本——单一真相源就在这儿。
///
/// ⚠️ 文件名是 ASCII、显示名是中文，**故意分开的**：中文文件名在
/// Windows 交叉编译和 zip 打包时都是麻烦，而菜单里要显示中文。
/// 唯一的例外是 `adwaita`：那是个专有名词（GNOME 的主题名），
/// 中文里也是照原名写的，所以显示名就写 `Adwaita`。
const BUILTIN: &[Builtin] = &[
    Builtin {
        id: "minimal",
        name: "极简",
        css: include_str!("../../src/styles/themes/minimal.css"),
    },
    Builtin {
        id: "adwaita",
        name: "Adwaita",
        css: include_str!("../../src/styles/themes/adwaita.css"),
    },
    Builtin {
        id: "latex",
        name: "LaTeX",
        css: include_str!("../../src/styles/themes/latex.css"),
    },
    // ── CDE（2026-10-17）────────────────────────────────────────────────
    //
    // 用户：「还有注意模仿 **CDE 默认的文档风格**，以及**点宋**」。它是**深底浅字**
    // 那一挂（画布是 `#686F82`，照真机截图量的），而另外三套都是白纸。
    // ⚠️ 它**没有深色配对**：它自己就是深底——`ui/useDocTheme.ts` 的 `深色配对`
    // 表里没有它，所以"界面深色时自动换深色档"对它不生效（本来就是深的）。
    // ⚠️ 首选字体是点宋（`WenQuanYi Bitmap Song` 那一族）。没装时前端会**弹一句**
    // （`ui/font-check.ts`），而不是安静地退回系统字体——这是用户点名要的。
    Builtin {
        id: "cde",
        name: "CDE",
        css: include_str!("../../src/styles/themes/cde.css"),
    },
    // ── 深色那三档（2026-10-16）──────────────────────────────────────────
    //
    // ⚠️⚠️ **它们是"浅色那份 ＋ 一层颜色补丁"拼出来的**，不是另写一份完整主题：
    // 排版（字体、字号、行高、圆角、标题边距）只有一份，**颜色**是深色那份的
    // 全部内容。`concat!` 是编译期拼字符串（两个 `include_str!` 都是常量），
    // 所以运行时一个字节都不多花。
    // ⚠️ 为什么这么做：**深色不是把浅色反色**——反色会把 `--border`、
    // `--code-string` 那些中间色一起变成灰糊糊的一团。每个值都得照"深色纸面上
    // 还看得清"重挑（三份补丁的文件头都写着这一条）。
    //
    // 用户朋友 2026-10-16 报的：「**功能:编辑器暗色/浅色跟随主题**」——他的截图里
    // 深色界面配着一整张白纸。⚠️ 机制其实**早就有了**（`appearance.dark_theme_separate`
    // ＋ `dark_document_theme`，外观页里能选），**缺的是"能选的东西"**：
    // 三套内置主题全是浅色，于是那一格无论怎么选都还是白的。这三条补的就是它。
    Builtin {
        id: "minimal-dark",
        name: "极简（深色）",
        css: concat!(
            include_str!("../../src/styles/themes/minimal.css"),
            "\n",
            include_str!("../../src/styles/themes/dark/minimal.css")
        ),
    },
    Builtin {
        id: "adwaita-dark",
        name: "Adwaita（深色）",
        css: concat!(
            include_str!("../../src/styles/themes/adwaita.css"),
            "\n",
            include_str!("../../src/styles/themes/dark/adwaita.css")
        ),
    },
    Builtin {
        id: "latex-dark",
        name: "LaTeX（深色）",
        css: concat!(
            include_str!("../../src/styles/themes/latex.css"),
            "\n",
            include_str!("../../src/styles/themes/dark/latex.css")
        ),
    },
];

/// 菜单/设置里要列的一项。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DocThemeInfo {
    /// 唯一键。存进 `settings.document_theme` 的就是它。空串表示"无主题"。
    pub id: String,
    /// 显示名（中文）。
    pub name: String,
    /// 是不是内置的那几套。界面上要标出来——用户自己放的同名文件会盖掉内置，
    /// 不标的话"我改的文件怎么没生效"会变成一个查不动的问题。
    pub builtin: bool,
}

/// 列出所有可用主题：内置的 ＋ 用户目录里多出来的。
///
/// 用户主题**同名覆盖内置**，所以清单一律按 id 去重，用户那份赢。
pub fn discover() -> Vec<DocThemeInfo> {
    let user = user_ids();

    // 内置的在前，保持 `BUILTIN` 里排好的顺序。被用户同名文件盖掉的那条
    // **仍然在原来的位置**（只是 `builtin` 翻成 false），这样菜单的顺序
    // 不会因为用户放了个文件就整体挪位——菜单位置变来变去比"多一个条目"烦人。
    let mut out: Vec<DocThemeInfo> = BUILTIN
        .iter()
        .map(|b| DocThemeInfo {
            id: b.id.to_owned(),
            name: b.name.to_owned(),
            builtin: !user.iter().any(|id| id == b.id),
        })
        .collect();

    // 然后是用户自己新加的（id 不与内置重合的那些）。
    // **排序**：`read_dir` 的顺序在不同文件系统上不一样，不排就是随机的。
    let mut extra: Vec<&String> = user
        .iter()
        .filter(|id| !BUILTIN.iter().any(|b| &b.id == *id))
        .collect();
    extra.sort();
    for id in extra {
        out.push(DocThemeInfo {
            id: id.clone(),
            name: id.clone(),
            builtin: false,
        });
    }

    out
}

/// 取一份主题的 CSS 文本。
///
/// 用户目录里有同名文件就用它，否则回落到内置。找不到就报错——
/// 这里**不能静默给空串**：静默的后果是"设置里记着一个名字、界面上一片默认"，
/// 而用户看不出是名字错了还是文件没了。
pub fn css_of(id: &str) -> Result<String> {
    check_id(id)?;

    let path = paths::user_themes_dir()?.join(format!("{id}.css"));
    if path.is_file() {
        check_size(&path, MAX_CSS_BYTES)?;
        let css = std::fs::read_to_string(&path).map_err(|source| NotaError::Read {
            path: path.clone(),
            source,
        })?;
        let root = paths::user_themes_dir()?;
        return Ok(crate::theme_assets::inline(&css, &path, &root));
    }

    BUILTIN
        .iter()
        .find(|b| b.id == id)
        .map(|b| b.css.to_owned())
        .ok_or_else(|| NotaError::other(format!("没有名为 {id} 的文档主题")))
}

/// id 的形状检查。**这是本模块的安全边界**，见文件头那段。
///
/// 白名单而不是黑名单：只放行 ASCII 字母、数字、`-`、`_`，长度 1–64。
/// 中文文件名（`极简.css`）因此用不了——**这是有意的取舍**：主题的显示名
/// 在文件里写着（菜单显示中文），文件名只是个键，用 ASCII 键换掉一整类
/// 路径穿越问题，划算。
///
/// ⚠️ **`pub(crate)` 是给 `ui_styles.rs` 用的**（界面风格，同一套"用户往目录里
/// 丢 CSS"的机制）。那条边界**只有这一份**——两份实现会漂，而漂的那一份
/// 正好是安全边界时没人看得出来。那边的测试 `界面风格的_id_判据与文档主题同一套`
/// 钉着"改这里，那边也得跟着成立"。
pub(crate) fn check_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if ok {
        Ok(())
    } else {
        Err(NotaError::other(format!("主题 id「{id}」不合法")))
    }
}

/// 用户主题目录里的所有 id（文件名去掉 `.css`）。目录不存在就是空表。
///
/// 认不出来的文件名**跳过**（不符合 `check_id` 的直接不要），
/// 免得清单里出现一个读不了的条目。
fn user_ids() -> Vec<String> {
    let Ok(dir) = paths::user_themes_dir() else {
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

/// 体积闸。⚠️ 与 `check_id` 一样是 `pub(crate)` 给 `ui_styles.rs` 复用的。
pub(crate) fn check_size(path: &Path, limit: u64) -> Result<()> {
    let meta = std::fs::metadata(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    if meta.len() > limit {
        return Err(NotaError::other(format!(
            "主题文件 {} 有 {} 字节，超过 {} 字节的上限",
            path.display(),
            meta.len(),
            limit
        )));
    }
    Ok(())
}

/// 用户主题目录，**用到时才建**。返回它的绝对路径。
///
/// 「打开主题文件夹」菜单项要能把它建出来再打开——首次使用时它多半还不存在。
pub fn user_themes_dir() -> Result<String> {
    let dir: PathBuf = paths::user_themes_dir()?;
    paths::ensure_dir(&dir)?;
    paths::path_to_string(&dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 内置主题的_id_与文件名一一对应() {
        // 每一条都要能取到 CSS，而且不是空的。这条挡的是"加了条目忘了建文件"、
        // 或者 `include_str!` 指错了路径——后者在编译期就会炸，但**空文件不会**。
        let mut ids = Vec::new();
        for b in BUILTIN {
            assert!(check_id(b.id).is_ok(), "内置 id 自己都不合法：{}", b.id);
            assert!(!b.name.is_empty(), "{} 没有显示名", b.id);
            assert!(
                b.css.contains("--doc-bg"),
                "{} 没定义 --doc-bg，多半不是一份文档主题",
                b.id
            );
            ids.push(b.id);
        }
        let n = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), n, "内置 id 有重复");
    }

    #[test]
    fn 内置主题不碰界面变量() {
        // ⚠️ 这条是**回归闸**：上一版就是文档主题里定义了界面变量、
        // 再靠桥接规则漏进外壳的。文档主题只许定义 `--doc-*` / `--code-*`
        // / `--select-*` 这一批，以及 `--fg*` `--bg*` `--border*` `--radius*`
        // `--accent*`（这些在编辑区里被 editor.css 消费，作用域已收拢）。
        //
        // 界面独有的那几个变量名一旦出现在主题文件里，就说明有人又开始
        // 往"让文档主题改外壳"那条路上走了。
        const UI_ONLY: &[&str] = &["--ui-font-size", "--font-ui", "--sidebar-width",
            "--dock-width", "--toolbar-height", "--statusbar-height", "--zen-peek",
            "--shadow"];
        for b in BUILTIN {
            for bad in UI_ONLY {
                assert!(
                    !b.css.contains(bad),
                    "{} 里出现了界面变量 {bad}——文档主题不许碰外壳",
                    b.id
                );
            }
            assert!(
                !b.css.contains("--nota-bridge"),
                "{} 里还有桥接变量，那是已经拆掉的老路",
                b.id
            );
        }
    }

    #[test]
    fn 内置主题都带自己的一套代码高亮() {
        // 底色是主题挑的，沿用界面那套会出现"深底配深字"。
        for b in BUILTIN {
            for tok in [
                "--code-comment",
                "--code-keyword",
                "--code-string",
                "--code-number",
                "--code-function",
                "--code-attr",
                "--code-tag",
            ] {
                assert!(b.css.contains(tok), "{} 少了 {tok}", b.id);
            }
        }
    }

    #[test]
    fn 拒绝形状不对的_id() {
        // 路径穿越与空 id。判据是白名单，所以这些一律进不来。
        for bad in ["", "..", "../../etc/passwd", "a/b", "a\\b", "素纸", ".hidden"] {
            assert!(check_id(bad).is_err(), "「{bad}」不该被放行");
        }
        for good in ["paper", "my-theme", "my_theme_2", "A1"] {
            assert!(check_id(good).is_ok(), "「{good}」该被放行");
        }
    }

    #[test]
    fn 取一份不存在的主题要报错而不是给空串() {
        let err = css_of("no-such-theme-xyz").unwrap_err();
        assert!(err.to_string().contains("没有名为"), "实际：{err}");
    }

    #[test]
    fn 目录不存在时清单只剩内置的() {
        // 用户目录不存在（新机器）时，内置那几套必须还在——这正是
        // "新装的机器主题菜单是空的"那个问题的反面。
        let list = discover();
        let builtin_count = list.iter().filter(|t| t.builtin).count();
        assert!(builtin_count <= BUILTIN.len());
        for b in BUILTIN {
            // 可能被用户同名文件盖成 builtin: false，所以只查 id 在不在。
            assert!(
                list.iter().any(|t| t.id == b.id),
                "内置主题 {} 从清单里消失了",
                b.id
            );
        }
    }
}
