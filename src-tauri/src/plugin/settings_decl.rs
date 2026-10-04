//! `[[settings]]` 那一格：**插件声明、宿主画**的设置（2026-10-04 从 `manifest.rs` 拆出）。
//!
//! # 为什么拆
//!
//! 这一批（写作统计的 Δt 滑杆）往 `manifest.rs` 里加了 `SettingDecl` 与它的九条测试，
//! 那份文件顶到 1077 行，而 `.rs` 的硬上限是 1000（`docs/09` §4）。挑中这一截是因为
//! 它**自己成一个题目**：上面是清单的公共部分（`[plugin]` / `[devserver]` / 能力表），
//! 这里是"宿主替插件画一格设置"这一件事的全部——结构体、夹紧、校验。`manifest.rs`
//! 那边只留 `pub use`（老路径 `plugin::manifest::SettingDecl` 照旧能用）。
//!
//! # 两处名字里的中文
//!
//! ⚠️ `夹紧` / `小数位` 这两个**函数名是中文的，这是有意的**，与
//! `src-tauri/src/lua/api/settings.rs` 里那批一致：本仓 Rust 侧的中文标识符是允许的
//! （不许的是 **Lua** 那边，见 `plugins/stats/main.lua` 顶上那条）。它们是**私有**的，
//! 不出这个模块，所以不会成为一条要读的 API。

use std::path::Path;

use serde::Deserialize;

use crate::error::{NotaError, Result};

use super::manifest::Capability;
/// `[[settings]]` 段：插件声明"我有一格设置，请宿主画在「设置 → 拓展」那一页上"
/// （2026-10-04 加）。
///
/// # 它是干什么的
///
/// 用户 2026-10-04 要求写作统计那个大数字**不再按整整一分钟算**，改成"最近 Δt 秒
/// 里打了多少字"，而 Δt **要做成一根滑杆放在拓展的设置页上**（1–60 秒，默认 5 秒）。
/// 于是宿主第一次有了"替插件画一格设置"这件事：插件在清单里声明这一格长什么样、
/// 什么范围、默认多少，宿主负责画，值写进插件自己那份设置文件
/// （`~/.config/nota/plugin-settings/<id>.toml`）。
///
/// # ⚠️ 它和 `settings.own` 不是一回事
///
/// | | 界面谁画 | 值存在哪儿 | 谁写进去 |
/// |---|---|---|---|
/// | 有 `[[settings]]` | **宿主**（设置页那一栏） | 插件设置文件 | 用户拖滑杆 → 宿主的命令 |
/// | 只有 `settings.own` | 插件自己（面板里那套） | 同一个文件 | 插件的 `nota.settings.set` |
///
/// AI 插件是第二种（API key 在它自己的面板里填），写作统计现在两种都有。
/// 两种同时用**不冲突**：文件是同一个，键各是各的。
///
/// ⚠️ 写了 `[[settings]]` **必须**同时申请 `settings.own`——宿主写的就是那个文件，
/// 没申请却让宿主从旁边去写，等于绕过能力表开了一个口子。
///
/// # 现在只有 `range` 一种控件
///
/// 有真实需求才加下一种。加的时候要动的地方（宿主三处 ＋ 前端两处 ＋ 文档）写在
/// `docs/11-writing-a-plugin.md` 的「给拓展做一格设置」那一节。
#[derive(Debug, Clone, Deserialize)]
pub struct SettingDecl {
    /// 设置键。规则与 `lua/api/settings.rs::键合法吗` **逐字相同**：不含点的 ASCII 词。
    pub key: String,
    /// 控件类型。现在只认 `range`（滑杆）。认不出的值**报错**，不静默降级。
    #[serde(default = "default_setting_kind")]
    pub kind: String,
    /// 给人看的名字。**写英语**（清单是英语的，同 `name` / `description`），
    /// 译文进这个插件的 `lang/<tag>.toml`（键就是这句英语原文）。
    pub label: String,
    /// 名字下面那句小字。同上：英语原文，可翻译。不写就是没有。
    #[serde(default)]
    pub help: String,
    /// `range` 的下界。**`range` 必须给**（一个没有范围的滑杆画不出来）。
    #[serde(default)]
    pub min: Option<f64>,
    /// 上界。同上。
    #[serde(default)]
    pub max: Option<f64>,
    /// 默认值（用户还没拖过的那个值）。同上。
    #[serde(default)]
    pub default: Option<f64>,
    /// 步长。不写是 `1`——整数挡。⚠️ **要小数就得自己写**（`0.05` 那种）：
    /// 一个 0～1 的滑杆只走整数，是作者第一次试就能看见的东西，不是静默出错。
    #[serde(default)]
    pub step: Option<f64>,
    /// 读数后面跟的那个单位（`s` / `%` / `px`）。⚠️ **不进 i18n**：这几个符号
    /// 两门语言写出来一个样（同 `ui/usePlugins.ts::大小说明` 那条）。
    #[serde(default)]
    pub unit: String,
}

fn default_setting_kind() -> String {
    "range".to_owned()
}

impl SettingDecl {
    /// 步长（不写就是 1）。
    pub fn step(&self) -> f64 {
        self.step.unwrap_or(1.0)
    }

    /// 把用户（可能被手改）的值夹进 `[min, max]` 并按 `step` 对齐。
    ///
    /// ⚠️ **夹而不是拒**：这个文件用户可以直接拿编辑器改（`lua/api/settings.rs`
    /// 的文件头就是这么说的），写进去一个 `999` 或 `"五秒"` 都不该让设置页白屏——
    /// 与那个文件"读不出来就是空的"是同一条口径。插件那一侧自己还会再夹一次
    /// （它不能假设宿主一定先跑过）。
    pub fn 夹紧(&self, v: f64) -> f64 {
        let lo = self.min.unwrap_or(0.0);
        let hi = self.max.unwrap_or(0.0);
        if !v.is_finite() {
            return self.default.unwrap_or(lo);
        }
        let 夹过 = v.max(lo).min(hi);
        let step = self.step();
        if step <= 0.0 {
            return 夹过;
        }
        // ⚠️ 按**下界**对齐（不是从 0 起）：`1..60 step 1` 的滑杆上，1 是个合法值，
        // 而从 0 起对齐会把它推成 0。
        let n = ((夹过 - lo) / step).round();
        let 对齐 = lo + n * step;
        // 浮点乘出来可能是 `5.000000000000001`，四舍五入到 step 的小数位。
        let 位 = 小数位(step);
        let 收 = (对齐 * 10f64.powi(位)).round() / 10f64.powi(位);
        收.max(lo).min(hi)
    }
}

/// 一个数写出来有几位小数（`1` → 0，`0.05` → 2）。只认到 6 位——再细的步长
/// 不该出现在一个滑杆上。
fn 小数位(step: f64) -> i32 {
    for 位 in 0..=6 {
        let 放大 = 10f64.powi(位);
        if (step * 放大).fract().abs() < 1e-9 {
            return 位;
        }
    }
    6
}
/// 校验 `[[settings]]` 那一串。
///
/// 口径与 [`check_devserver`] 同源：**能挡在门口的就别留到运行时**。
/// 五条，每条都是"写错了就该当场说，而不是等用户拖一根不会动的滑杆"：
///
/// 1. **写了 `[[settings]]` 却没申请 `settings.own`** —— 宿主写的就是那份设置文件，
///    没申请却从旁边去写，等于绕过能力表开了一个口子。
///    ⚠️ **反方向不报**：只有 `settings.own`、什么都不声明的插件（AI 那种，
///    设置界面是它自己在面板里画的）是**正常**的，`docs/11` 那张分工表写着。
/// 2. **键不合法 / 重复** —— 键的规则与 `lua/api/settings.rs::键合法吗` 一字不差
///    （不含点的 ASCII 词，点号会让 TOML 把它当成嵌套表）。重复的键会让后一格
///    悄悄盖掉前一格。
/// 3. **认不出的 `kind`** —— 静默降级的话，作者写的滑杆会在界面上变成别的东西。
/// 4. **`range` 三件套缺一个** —— 没有范围的滑杆画不出来，没有默认值的滑杆
///    在用户拖之前没有值可显示。
/// 5. **`min >= max`、`default` 出界、`step <= 0`** —— 都是"这根滑杆拖不动"。
pub(crate) fn check_settings(
    串: Vec<SettingDecl>,
    capabilities: &[Capability],
    file: &Path,
) -> Result<Vec<SettingDecl>> {
    if 串.is_empty() {
        return Ok(串);
    }

    let 报 = |原因: String| NotaError::Manifest {
        file: file.to_path_buf(),
        reason: 原因,
    };

    if !capabilities.contains(&Capability::SettingsOwn) {
        return Err(报(
            "写了 `[[settings]]` 却没申请 `settings.own` 能力——\
             宿主画的那一格写的就是插件自己那份设置文件，这份能力放行的正是它"
                .to_owned(),
        ));
    }

    let mut 见过的: Vec<&str> = Vec::new();
    for s in &串 {
        // ① 键
        if s.key.is_empty() {
            return Err(报("`[[settings]]` 的 key 不能为空".to_owned()));
        }
        if !s
            .key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
        {
            return Err(报(format!(
                "`[[settings]]` 的 key `{}` 不合法：只能用 ASCII 字母、数字、`-`、`_`\
                 （点号会让 TOML 把它当成嵌套的表，见 `lua/api/settings.rs`）",
                s.key
            )));
        }
        if 见过的.contains(&s.key.as_str()) {
            return Err(报(format!(
                "`[[settings]]` 里有两格用同一个 key `{}`——后一格会悄悄盖掉前一格",
                s.key
            )));
        }
        见过的.push(&s.key);

        if s.label.trim().is_empty() {
            return Err(报(format!("`[[settings]] {}` 没写 label", s.key)));
        }

        // ② 控件类型
        if s.kind != "range" {
            return Err(报(format!(
                "`[[settings]] {}` 的 kind `{}` 认不出：现在只有 `range`（滑杆）一种，\
                 见 docs/11「给拓展做一格设置」",
                s.key, s.kind
            )));
        }

        // ③ 范围三件套
        let (Some(lo), Some(hi), Some(默认)) = (s.min, s.max, s.default) else {
            return Err(报(format!(
                "`[[settings]] {}` 是 `range`，min / max / default 三个都要给\
                 （少了范围或者默认值的滑杆画不出来）",
                s.key
            )));
        };
        if !lo.is_finite() || !hi.is_finite() || !默认.is_finite() {
            return Err(报(format!("`[[settings]] {}` 的范围里有不是数的值", s.key)));
        }
        if lo >= hi {
            return Err(报(format!(
                "`[[settings]] {}` 的 min ({lo}) 不小于 max ({hi})——这根滑杆拖不动",
                s.key
            )));
        }
        if 默认 < lo || 默认 > hi {
            return Err(报(format!(
                "`[[settings]] {}` 的 default ({默认}) 不在 {lo}..{hi} 里",
                s.key
            )));
        }
        if let Some(step) = s.step {
            if !(step > 0.0) || !step.is_finite() || step > hi - lo {
                return Err(报(format!(
                    "`[[settings]] {}` 的 step ({step}) 不合法：要在 0 与 {:.0} 之间",
                    s.key,
                    hi - lo
                )));
            }
        }
    }

    Ok(串)
}

// ── 测试 ─────────────────────────────────────────────────────────────────
//
// ⚠️ 这一块 2026-10-04 从 `manifest.rs` 的 `mod tests` 搬过来（同一天那些用例是跟着
// `[[settings]]` 一起写的）。搬的理由与拆模块那条同源：`manifest.rs` 搬完之后 862 行，
// 过了 800 那条 WARN 线（`docs/09` §4 的目标区间是 300–800，硬上限 1000）。
//
// ⚠️ 它们测的是**清单解析这条整路**（`Manifest::load`），不是 `SettingDecl` 一个人：
// "写了设置却没申请能力要报错"这类判据只有走到 `load` 才成立。所以下面用的是
// `manifest::Manifest` 与 `manifest::tests::write_manifest`——测试跟着**它要验的那条
// 规矩**走（这一格设置），而不是跟着那个函数走。
#[cfg(test)]
mod tests {
    use super::super::manifest::{Manifest, tests::write_manifest};
    // ── `[[settings]]`（2026-10-04 加）────────────────────────────────────

    /// 写一份"声明了一格设置"的清单，跑一遍解析。
    fn 带设置的清单(名: &str, 设置段: &str, 能力: &str) -> std::result::Result<Manifest, String> {
        let dir = std::env::temp_dir().join(format!("nota-manifest-set-{名}"));
        let _ = std::fs::remove_dir_all(&dir);
        write_manifest(
            &dir,
            &format!(
                "[plugin]\nid = \"x.y\"\nname = \"X\"\napi = 2\ncapabilities = [{能力}]\n{设置段}"
            ),
        );
        let r = Manifest::load(&dir.join("plugin.toml")).map_err(|e| e.to_string());
        let _ = std::fs::remove_dir_all(&dir);
        r
    }

    const 好设置: &str = r#"
[[settings]]
key = "window_seconds"
kind = "range"
label = "Speed window"
help = "How many seconds the big number looks back over."
min = 1
max = 60
default = 5
unit = "s"
"#;

    #[test]
    fn 声明了设置就解析得出来() {
        let m = 带设置的清单("good", 好设置, "\"settings.own\"").unwrap();
        assert_eq!(m.settings.len(), 1);
        let s = &m.settings[0];
        assert_eq!(s.key, "window_seconds");
        assert_eq!(s.label, "Speed window");
        assert_eq!(s.min, Some(1.0));
        assert_eq!(s.max, Some(60.0));
        assert_eq!(s.default, Some(5.0));
        assert_eq!(s.unit, "s");
        // ⚠️ 不写 step 就是 1（整数挡）。写小数步长的作者会当场看见，
        // 不是静默出错——所以这里钉着那个默认值。
        assert_eq!(s.step(), 1.0);
    }

    /// ⚠️ 值要**夹紧并对齐**：用户手改过设置文件之后，界面上的读数和文件里的值
    /// 本来就可能对不上（`999`、`-3`、`2.7`）。
    #[test]
    fn 设置的值会夹进范围并对齐步长() {
        let m = 带设置的清单("clamp", 好设置, "\"settings.own\"").unwrap();
        let s = &m.settings[0];
        assert_eq!(s.夹紧(5.0), 5.0, "范围内的原样");
        assert_eq!(s.夹紧(999.0), 60.0, "超上界夹到上界");
        assert_eq!(s.夹紧(-3.0), 1.0, "低于下界夹到下界");
        assert_eq!(s.夹紧(2.7), 3.0, "步长 1 上对齐到 3");
        assert_eq!(s.夹紧(2.4), 2.0);
        // ⚠️ 不是数的（文件里被手改成字符串，读出来给不到这里）走 default。
        assert_eq!(s.夹紧(f64::NAN), 5.0, "不是数就用默认值");
        // ⚠️ 按**下界**对齐：`1..60 step 1` 上 1 是合法值，从 0 起对齐会把它推成 0。
        assert_eq!(s.夹紧(1.0), 1.0);
    }

    /// 写了 `[[settings]]` 却没申请 `settings.own` = 宿主去写一个它没被放行的文件。
    #[test]
    fn 声明了设置却没申请能力要报错() {
        let err = 带设置的清单("nocap", 好设置, "\"ui.panel\"").unwrap_err();
        assert!(err.contains("settings.own"), "实际：{err}");
    }

    /// ⚠️ **反方向不报错**：只有 `settings.own`、什么都不声明的插件（AI 那种，
    /// 设置界面它自己在面板里画）是正常的一种。
    #[test]
    fn 只有能力不声明设置是正常的() {
        let m = 带设置的清单("caponly", "", "\"settings.own\"").unwrap();
        assert!(m.settings.is_empty());
    }

    #[test]
    fn 认不出的控件类型要报错() {
        let 段 = 好设置.replace("kind = \"range\"", "kind = \"slider\"");
        let err = 带设置的清单("kind", &段, "\"settings.own\"").unwrap_err();
        assert!(err.contains("slider"), "实际：{err}");
    }

    /// `range` 少了范围/默认值 = 一根画不出来的滑杆。
    #[test]
    fn range_三件套缺一个要报错() {
        let 段 = 好设置.replace("default = 5\n", "");
        let err = 带设置的清单("nodefault", &段, "\"settings.own\"").unwrap_err();
        assert!(err.contains("default"), "实际：{err}");

        let 段 = 好设置.replace("max = 60\n", "");
        let err = 带设置的清单("nomax", &段, "\"settings.own\"").unwrap_err();
        assert!(err.contains("min / max / default"), "实际：{err}");
    }

    #[test]
    fn 默认值出界或范围颠倒要报错() {
        let err = 带设置的清单(
            "outofrange",
            &好设置.replace("default = 5", "default = 99"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("不在"), "实际：{err}");

        let err = 带设置的清单("inverted", &好设置.replace("max = 60", "max = 0"), "\"settings.own\"")
            .unwrap_err();
        assert!(err.contains("不小于"), "实际：{err}");
    }

    /// 两格用同一个键 = 后一格悄悄盖掉前一格。
    #[test]
    fn 设置键重复要报错() {
        let 段 = format!("{好设置}{好设置}");
        let err = 带设置的清单("dup", &段, "\"settings.own\"").unwrap_err();
        assert!(err.contains("同一个 key"), "实际：{err}");
    }

    /// 键的规则与 `lua/api/settings.rs` 那条**一字不差**（点号会被 TOML 当成嵌套表）。
    #[test]
    fn 设置键里有怪字符要报错() {
        let err = 带设置的清单(
            "badkey",
            &好设置.replace("window_seconds", "window.seconds"),
            "\"settings.own\"",
        )
        .unwrap_err();
        assert!(err.contains("不合法"), "实际：{err}");
    }
}
