//! `nota.diff` —— **改动块**的解析与应用。
//!
//! # 改动块是什么
//!
//! 一段普通文本，最末尾附一个围栏包起来的块：
//!
//! ~~~text
//! 我把第二句改短了。
//!
//! ```nota-diff
//! - 他慢慢地走了过来。
//! + 他走过来。
//! ```
//! ~~~
//!
//! `-` 开头的是**原文里要被换掉的那几行**，`+` 开头的是换上去的新话。
//! 应用的方式是**逐字找到那几行、就地替换**——不是"用新文本覆盖整篇"。
//!
//! # ⚠️ 为什么这件事在宿主里，不在某个插件里
//!
//! 它是 2026-09-24 跟 AI 插件一起长出来的（用户要求"AI 生成 diff，在末尾用
//! 特殊标注写"），但**它不是 AI 专有的**：任何"我建议你把文档改成这样"的插件
//! 都要同一样东西，而界面上那块 `kind = "diff"` 的渲染**早就已经是宿主的**
//! （`src/ui/panel-nodes.ts` 的白名单里就有它）。一份格式两处实现迟早会漂，
//! 而漂的症状是"明明一模一样的两行，它说没找到"。
//!
//! 所以：**格式的定义只有这一份**（本文件），插件那一侧只有一句
//! `nota.diff.apply(文档, nota.diff.parse(回答).hunks)`。
//!
//! # 三条规矩（`docs/13-lua-api.md` §「AI 改动块」有同一张表）
//!
//! 1. **失败必须是"什么都没做"**：`应用` 要么给出新全文，要么给一句原因，
//!    **不给半截结果**。"改了一半"比"没改"坏得多——用户按 Ctrl+Z 都不知道
//!    该退回到哪一步。
//! 2. **`-` 行要逐字一致、而且连续**：模型爱顺手改标点、补空格，
//!    那就不认（宁可报"没找到"，也不要拿一段近似的文字去猜）。
//! 3. **没有 `-` 行 = 追加到文末**：没有落点就别猜位置。
//!
//! # 为什么核心是普通 Rust 函数
//!
//! `解析` / `应用` 都**不认识 Lua**，只有 `build()` 那一层做包装。
//! 这样它们能直接被单元测试按住——而它们的输入是**模型现编的一段文字**，
//! 线上撞见的形状（少写收尾围栏、多打一个 `\r`、把两处改动的顺序写反、
//! 引用了一行文档里没有的话）用接口试是试不完的。

use mlua::{Lua, Table, Value};

use super::{mlua_to_nota, set};
use crate::error::NotaError;

/// 改动块的开始围栏。**整行**（允许前后有空白）等于它才算数。
pub const 围栏开始: &str = "```nota-diff";

/// 结束围栏。
pub const 围栏结束: &str = "```";

/// 一处改动：删掉 `删` 那几行，换成 `加` 那几行。
///
/// 两边的行数**可以不一样**（`加` 是空的 = 纯删除，`删` 是空的 = 纯插入）。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct 一处 {
    pub 删: Vec<String>,
    pub 加: Vec<String>,
}

/// `解析` 的结果。
#[derive(Debug, Clone, Default)]
pub struct 解析结果 {
    /// 围栏之外的那些字（画成对话里那条消息）。
    pub 正文: String,
    /// 按出现顺序排好的改动。**一个都没有时是空 `Vec`，不是 `None`**。
    pub 改动: Vec<一处>,
    /// 围栏里既不 `-` 也不 `+` 的行数。数出来给用户看，不当成改动。
    pub 坏行: usize,
}

/// 把一段回答拆成「正文 ＋ 改动块」。
///
/// 认得出就认，认不出就**当成普通正文**（不报错）：模型少写个收尾围栏、
/// 多写一段解释都是常事，为格式问题让用户白等一轮最不划算。
pub fn 解析(回答: &str) -> 解析结果 {
    let 行 = 切行(回答);

    let mut 结果 = 解析结果::default();
    let mut 正文: Vec<String> = Vec::new();
    let mut i = 0;

    while i < 行.len() {
        if 行[i].trim() == 围栏开始 {
            let mut 删 = Vec::new();
            let mut 加 = Vec::new();
            i += 1;
            while i < 行.len() && 行[i].trim() != 围栏结束 {
                match 掐标记(&行[i], '-') {
                    Some(内容) => 删.push(内容),
                    None => match 掐标记(&行[i], '+') {
                        Some(内容) => 加.push(内容),
                        // 既不 - 也不 +：**数出来**，不静默吞掉。多半是模型
                        // 混进了一句解释，或者行首少了标记。
                        None => {
                            结果.坏行 += 1;
                        }
                    },
                }
                i += 1;
            }
            // 收尾的 ``` 吃掉。⚠️ 模型漏写收尾是常事，所以**没写也认**。
            if i < 行.len() {
                i += 1;
            }
            // 空的改动块（既没 + 也没 -）当没写：模型偶尔画一个空块表示"不用改"。
            if !删.is_empty() || !加.is_empty() {
                结果.改动.push(一处 { 删, 加 });
            }
        } else {
            正文.push(行[i].clone());
            i += 1;
        }
    }

    // 拆掉围栏之后会在两头留下空行，不收拾的话消息里会多出几行空白。
    while 正文.first().is_some_and(|l| l.is_empty()) {
        正文.remove(0);
    }
    while 正文.last().is_some_and(|l| l.is_empty()) {
        正文.pop();
    }
    结果.正文 = 正文.join("\n");
    结果
}

/// 把改动应用上去。成功给新全文，失败给一句人话。
///
/// **失败时不返回半截结果**（见文件头第 1 条）。
pub fn 应用(文档: &str, 改动: &[一处]) -> Result<String, String> {
    if 改动.is_empty() {
        return Err("改动块是空的".to_owned());
    }

    let (mut 行, 结尾有换行, crlf) = 切行保留结尾(文档);
    let mut from = 0usize;
    let mut 插入过 = false;

    for (n, h) in 改动.iter().enumerate() {
        if h.删.is_empty() {
            // 纯插入：没有 `-` 行就没有落点，规矩是**追加到文末**。
            行.extend(h.加.iter().cloned());
            插入过 = true;
            from = 行.len();
            continue;
        }

        // ⚠️ 先从上一次的落点往后找（顺序应用：两处改动引用同一句话时，
        // 第二处不会又改回头一处），找不到**再从头找一遍**（模型把顺序写反了）。
        let at = 找连续(&行, &h.删, from).or_else(|| 找连续(&行, &h.删, 0));
        let Some(at) = at else {
            return Err(format!(
                "第 {} 处改动没找到能对上的原文（`-` 那几行要和文档里连续的一段逐字一致），比如 `{}`",
                n + 1,
                掐短(&h.删[0], 30)
            ));
        };

        let mut 新行 = Vec::with_capacity(行.len() + h.加.len());
        新行.extend(行[..at].iter().cloned());
        新行.extend(h.加.iter().cloned());
        新行.extend(行[at + h.删.len()..].iter().cloned());
        from = at + h.加.len();
        行 = 新行;
    }

    // 换行风格跟着原文走（见 `切行` 那段）。
    let nl = if crlf { "\r\n" } else { "\n" };
    let mut out = 行.join(nl);
    // 结尾换行：原文有就保留；往文末加了新行的话也补一个——加完最后一行
    // 不带换行，在 Markdown 里就是"跟后面的东西粘在一起"。
    if (结尾有换行 || (插入过 && !out.is_empty())) && !out.is_empty() {
        out.push_str(nl);
    }
    Ok(out)
}

// ── 内部 ──────────────────────────────────────────────────────────────────

/// 掐掉行首的标记（`-` 或 `+`）和紧跟的一个空格。没有标记给 `None`。
///
/// `- foo` / `-foo` 都收：模型两种写法都见过，为这个报错不值得。
fn 掐标记(行: &str, 标记: char) -> Option<String> {
    let mut 字 = 行.chars();
    if 字.next() != Some(标记) {
        return None;
    }
    let 剩下 = 字.as_str();
    Some(剩下.strip_prefix(' ').unwrap_or(剩下).to_owned())
}

/// 按行切开，顺手把每行末尾的 `\r` 掐掉。
fn 切行(文本: &str) -> Vec<String> {
    文本
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l).to_owned())
        .collect()
}

/// 切行，带回"结尾是不是换行"和"是不是 CRLF"。
///
/// ⚠️ 末尾那个换行必须是**单独一位**、不能混进行数组：`"a\n"` 切出来是
/// `["a"]` ＋ `结尾有换行`，不是 `["a", ""]`——否则"在末尾插入一行"会先多出
/// 一个空行。
///
/// ⚠️ `\r` **按行掐掉、join 的时候再按原来的风格补回去**。不掐的话，一份 CRLF
/// 的文档永远也应用不上改动：模型给的 `-` 行里没有 `\r`（`解析` 掐掉了），
/// 而文档里的每一行都带着——"逐字一致"就永远不成立。
fn 切行保留结尾(文档: &str) -> (Vec<String>, bool, bool) {
    // ⚠️ 用"整份文档里有没有 `\r\n`"判，不是"某一行末尾是不是 `\r`"：
    // 后者会把一份 LF 文档里孤零零的 `\r`（正常打字打不出来的东西）也算成 CRLF。
    let crlf = 文档.contains("\r\n");
    let 结尾有换行 = 文档.ends_with('\n');

    // 空文档切出来是 `[""]`（一个空行），直接往里追加会凭空多出一个空行。
    let 行 = if 文档.is_empty() {
        Vec::new()
    } else {
        let 主体 = if 结尾有换行 {
            &文档[..文档.len() - 1]
        } else {
            文档
        };
        // 行末尾的 `\r` 已经在 `切行` 里掐掉了。
        切行(主体)
    };
    (行, 结尾有换行, crlf)
}

/// 在行数组里找 `要删` 这一串**连续且逐字一致**的行，返回起始下标。
fn 找连续(行: &[String], 要删: &[String], 起点: usize) -> Option<usize> {
    let m = 要删.len();
    if m == 0 || 行.len() < m {
        return None;
    }
    (起点..=行.len() - m).find(|&i| &行[i..i + m] == 要删)
}

/// 按**字符**截断（不是字节）：按字节截会把一个汉字劈成半个。
fn 掐短(s: &str, 上限: usize) -> String {
    if s.chars().count() <= 上限 {
        return s.to_owned();
    }
    s.chars().take(上限).collect::<String>() + "…"
}

// ── 装进 Lua ──────────────────────────────────────────────────────────────

/// 装 `nota.diff`。
///
/// ⚠️ **不需要任何能力**：全是纯函数，不碰文档、不碰磁盘、不碰网络。
/// 拿到的是"一段文本进、一段文本出"，插件拿它做不出清单之外的事。
pub fn build(lua: &Lua) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let parse = lua
        .create_function(|lua, 回答: String| {
            let r = 解析(&回答);
            let 表 = lua.create_table()?;
            表.set("text", r.正文)?;
            表.set("bad", r.坏行)?;
            let 改动们 = lua.create_table()?;
            for (i, h) in r.改动.iter().enumerate() {
                改动们.set(i + 1, 一处转表(lua, h)?)?;
            }
            表.set("hunks", 改动们)?;
            Ok(表)
        })
        .map_err(mlua_to_nota)?;
    set(t.set("parse", parse), lua)?;

    let apply = lua
        .create_function(|lua, (文档, hunks): (String, Table)| {
            let 改动 = 表转改动(&hunks)?;
            // ⚠️ 失败是**返回值**，不是抛错：`没找到` 是一个正常结果
            //（用户改了文档、模型看的是旧版），命令那一侧要把它画成一条
            // 对话消息，而不是一次"命令炸了"。
            match 应用(&文档, &改动) {
                Ok(新) => Ok((Value::String(lua.create_string(新)?), Value::Nil)),
                Err(原因) => Ok((Value::Nil, Value::String(lua.create_string(原因)?))),
            }
        })
        .map_err(mlua_to_nota)?;
    set(t.set("apply", apply), lua)?;

    Ok(t)
}

fn 一处转表(lua: &Lua, h: &一处) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("del", lua.create_sequence_from(h.删.iter().cloned())?)?;
    t.set("add", lua.create_sequence_from(h.加.iter().cloned())?)?;
    Ok(t)
}

/// Lua 那边的 `hunks`（`parse` 给的形状）→ Rust。
fn 表转改动(hunks: &Table) -> mlua::Result<Vec<一处>> {
    let mut out = Vec::new();
    for i in 1..=hunks.raw_len() {
        let Ok(条目) = hunks.raw_get::<Table>(i) else {
            continue;
        };
        let 读一串 = |键: &str| -> mlua::Result<Vec<String>> {
            let Ok(v) = 条目.raw_get::<Value>(键) else {
                return Ok(Vec::new());
            };
            match v {
                Value::Nil => Ok(Vec::new()),
                Value::Table(t) => {
                    let mut 行 = Vec::new();
                    for j in 1..=t.raw_len() {
                        行.push(t.raw_get::<String>(j)?);
                    }
                    Ok(行)
                }
                other => Err(mlua::Error::RuntimeError(format!(
                    "`hunks[{i}].{键}` 该是一串字符串，实际是 {}",
                    other.type_name()
                ))),
            }
        };
        out.push(一处 {
            删: 读一串("del")?,
            加: 读一串("add")?,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 解析一段回答。
    fn 解析成(回答: &str) -> 解析结果 {
        解析(回答)
    }

    /// ⚠️ **改动块的契约钉在这里。**
    ///
    /// 逐条对 `docs/13-lua-api.md` §「AI 改动块」那张表：**改那张表就要改这里**。
    /// 用例里那些形状全是真实会撞见的（模型现编的文字，不是我们写的）——
    /// 少写收尾围栏、多打一个 `\r`、把顺序写反、引用一行文档里没有的话。
    #[test]
    fn 一段普通文本加末尾一块改动() {
        let 回答 = "我把第二句改短了。\n\n```nota-diff\n- 他慢慢地走了过来。\n+ 他走过来。\n```\n";
        let r = 解析成(回答);
        assert_eq!(r.正文, "我把第二句改短了。", "正文该是围栏之外那段，首尾不留空行");
        assert_eq!(r.坏行, 0);
        assert_eq!(r.改动.len(), 1);
        assert_eq!(r.改动[0].删, vec!["他慢慢地走了过来。"]);
        assert_eq!(r.改动[0].加, vec!["他走过来。"]);

        let 文档 = "第一行。\n他慢慢地走了过来。\n第三行。\n";
        assert_eq!(
            应用(文档, &r.改动).expect("这一段在文档里，该能应用"),
            "第一行。\n他走过来。\n第三行。\n"
        );
    }

    /// 文档里没有那一行 → **报错，且不给半截结果**。
    ///
    /// 这是"文档被改坏了"和"没改成"的分界：失败时调用方一个字都不许写。
    #[test]
    fn 对不上就整体放弃并说清原因() {
        let r = 解析成("```nota-diff\n- 他慢慢地走了过来。\n+ 他走过来。\n```\n");
        let 错 = 应用("完全不相干的一段话。\n", &r.改动).expect_err("文档里没有那行，该失败");
        assert!(错.contains("没找到"), "失败原因要说清是没找到，实际：{错}");
    }

    /// `-` 那几行必须是**连续**的一段，分开的行不算。
    #[test]
    fn 不连续的行不算数() {
        let r = 解析成("```nota-diff\n- 甲。\n- 乙。\n+ 换了。\n```\n");
        assert!(
            应用("甲。\n中间夹着别的。\n乙。\n", &r.改动).is_err(),
            "「甲。乙。」在文档里不挨着，不该匹配上"
        );
    }

    /// 只有 `+` 行 = 追加到文末（没有 `-` 行就没有落点）。
    #[test]
    fn 只有加号就追加到文末() {
        let r = 解析成("```nota-diff\n+ 新加的一行。\n```\n");
        assert_eq!(
            应用("正文。\n", &r.改动).expect("纯插入该成功"),
            "正文。\n新加的一行。\n"
        );
        // 空文档里插入：不该凭空多出一个空行。
        assert_eq!(应用("", &r.改动).expect("空文档该能插入"), "新加的一行。\n");
    }

    /// 多处改动**按顺序**应用，各改各的。
    #[test]
    fn 两块改动按顺序各改各的() {
        let r = 解析成(
            "```nota-diff\n- 甲。\n+ A。\n```\n中间还有话说。\n```nota-diff\n- 丙。\n+ C。\n```\n",
        );
        assert_eq!(r.正文, "中间还有话说。", "两块之间的字是正文");
        assert_eq!(r.改动.len(), 2);
        assert_eq!(
            应用("甲。\n乙。\n丙。\n", &r.改动).expect("两块都该应用上"),
            "A。\n乙。\nC。\n"
        );
    }

    /// 模型把两处改动的顺序写反了：往后找不到就从头找一遍。
    #[test]
    fn 顺序写反了也还能用() {
        let r = 解析成("```nota-diff\n- 丙。\n+ C。\n```\n```nota-diff\n- 甲。\n+ A。\n```\n");
        assert_eq!(
            应用("甲。\n乙。\n丙。\n", &r.改动).expect("顺序反了也该能应用"),
            "A。\n乙。\nC。\n"
        );
    }

    /// 围栏里既不 `-` 也不 `+` 的行：**数出来给用户看**，不当成改动。
    #[test]
    fn 坏行只数出来不当改动() {
        let r = 解析成("```nota-diff\n这里不该有字。\n- 甲。\n+ A。\n```\n");
        assert_eq!(r.坏行, 1, "那一行该被数成坏行");
        assert_eq!(应用("甲。\n", &r.改动).expect("坏行不该影响后面那对"), "A。\n");
    }

    /// 没有改动块 → 整段都是正文，一个改动都没有。
    #[test]
    fn 没有围栏就是普通文本() {
        let r = 解析成("这条我不用改文档。\n");
        assert_eq!(r.正文, "这条我不用改文档。");
        assert!(r.改动.is_empty());
        assert_eq!(应用("原文。\n", &r.改动).expect_err("空的改动该被挡下"), "改动块是空的");
    }

    /// 模型少写了收尾的 ``` —— 常事（尤其是小模型），为此报格式错只会让用户白等一轮。
    #[test]
    fn 少写收尾围栏也认() {
        let r = 解析成("```nota-diff\n- 甲。\n+ A。\n");
        assert_eq!(应用("甲。\n", &r.改动).expect("少个收尾也该认"), "A。\n");
    }

    /// 空改动块当没写（模型偶尔画一个空块表示"不用改"）。
    #[test]
    fn 空改动块当没写() {
        let r = 解析成("不用改。\n\n```nota-diff\n```\n");
        assert_eq!(r.正文, "不用改。");
        assert!(r.改动.is_empty());
    }

    /// 文档是 CRLF：`\r` 不能成为"逐字一致"的绊脚石，而且**改完要保持 CRLF**。
    ///
    /// ⚠️ 这条是防退化的：模型给的 `-` 行里没有 `\r`（`解析` 掐了），文档里每行
    /// 都有——不处理的话症状是"明明一模一样的两行，它说没找到"。
    #[test]
    fn crlf_文档也能改且不改风格() {
        let r = 解析成("```nota-diff\n- 甲。\n+ A。\n```\n");
        assert_eq!(
            应用("甲。\r\n乙。\r\n", &r.改动).expect("CRLF 文档也该能改"),
            "A。\r\n乙。\r\n",
            "改完要保持原来的 CRLF，不能把整篇文档统一成 LF"
        );
        // LF 的文档别被带上 `\r`。
        assert_eq!(应用("甲。\n乙。\n", &r.改动).unwrap(), "A。\n乙。\n");
    }

    /// 删掉一整段（`+` 是空的）／删掉末尾一行：换行不能乱。
    #[test]
    fn 纯删除和删末尾行() {
        let r = 解析成("```nota-diff\n- 乙。\n```\n");
        assert_eq!(应用("甲。\n乙。\n丙。\n", &r.改动).unwrap(), "甲。\n丙。\n");
        assert_eq!(应用("甲。\n乙。\n", &r.改动).unwrap(), "甲。\n");
        // 原文没有结尾换行时也不该凭空长出一个。
        assert_eq!(应用("甲。\n乙。", &r.改动).unwrap(), "甲。");
    }

    /// 被删的是空行：零长度的 `-` 行也要能对上。
    #[test]
    fn 删空行() {
        let r = 解析成("```nota-diff\n-\n```\n");
        assert_eq!(r.改动[0].删, vec![""], "`-` 单独一行 = 删一个空行");
        assert_eq!(应用("甲。\n\n乙。\n", &r.改动).unwrap(), "甲。\n乙。\n");
    }
}
