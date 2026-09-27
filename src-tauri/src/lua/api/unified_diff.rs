//! `nota.diff.parse_unified` —— **unified diff** 的解析。
//!
//! # 它跟 `diff.rs` 里那份不是一个格式
//!
//! `diff.rs` 管的是「改动块」（```nota-diff 围栏，模型写的那个）；
//! 这里管的是 `git diff` / `diff -u` 吐出来的那套 `---`/`+++`/`@@`。
//! 两者只共用两样东西：**Lua 那边挂在同一张表下**（插件作者只需要记
//! `nota.diff` 一个名字），**输出同一个形状**（`{ op = "del"|"add", text = … }`，
//! 也就是界面上 `kind = "diff"` 那块内容块要的行）。
//!
//! 分成两个文件是因为**格式不同、认法不同、出错的样子也不同**：
//! 模型写的改动块可以少一个收尾围栏、可以混进一句解释（那边一律"认不出就当正文"），
//! 而 git 的输出是机器生成的——它不会写错，只会出现我没预料到的行。
//! 把两套规矩塞进一个文件，下一个人会以为它们是一回事。
//!
//! # 为什么会在这儿，不在 git 插件里
//!
//! 和 `diff.rs` 顶上那条同样的理由：**这份格式不是 git 专有的**（`diff -u`
//! 就是一个样），而"哪个字符是标记行、哪个是文件头"这种事**必须能被单元测试按住**
//! ——一份真的 diff 里会出现的形状（删掉的一行恰好长成 `--- x`、文件末尾
//! 没换行、二进制文件、只有模式变化）用接口试是试不完的。
//! 顺带：`nota.diff` 是**不需要任何能力**的纯函数表（见 `mod.rs` 那段），
//! 这个函数也是纯的——一段文本进，一张表出。
//!
//! # 三条已经踩过/会踩到的规矩
//!
//! 1. **只为 `diff --git` 开出来的段落认 `---`/`+++`**。一份 diff 里
//!    "被删掉的一行"完全可能长成 `--- 这一行`（原文是 `-- 这一行`）。判据
//!    不是"这行长得像文件头"，而是"**它出现在 `diff --git` 之后、第一个 `@@`
//!    之前**"——那个位置只可能是文件头。所以非 git 的裸 `diff -u`（没有
//!    `diff --git` 行）解析出来是空的：宁可不画，也不能把正文当成文件头。
//! 2. **行分五类，照 `git diff` 自己的行首标记来**（2026-09-26 起**带上下文**）。
//!    `@@` 是段头、`+`/`-` 是增删、`\ No newline` 与文件头那几行（`diff --git` /
//!    `index` / `---` / `+++` / `new file mode` …）是元信息、hunk 里其余的是上下文。
//!    此前只画增删两种，代价是**看不出"改在哪一段"**——改了哪几行紧挨着的是谁的
//!    上下文，正是判断"这一改对不对"要看的东西。换成这个形状的另一个理由是
//!    **和 Folio 那个 Git 拓展同形**：它是四档（加/删/hunk/元信息）逐行上色
//!    （`extensions/git/fo-git-panel-diff.c`），用户点名要对齐。
//!    ⚠️ **改这里之前先改前端**：`PanelDiffLine` 的 op 是个联合类型，而
//!    `panel-nodes.ts` 里认不出的 op 会**静默变成 `add`**（画成绿的）——
//!    多出来的种类不先在前端落地，界面上就是一片绿。
//! 3. **路径要关掉 git 的转义**。默认 `core.quotePath=true` 时，`中文.md`
//!    在 diff 里写成 `"\344\270\255\346\226\207.md"`，并且 `+++` 行还带引号
//!    ——那样掐 `b/` 前缀就掐不着了。宿主在 `lua/api/git.rs` 里统一加了
//!    `-c core.quotePath=false`（那边有注释），所以走到这儿的路径是原样的。

use mlua::{Function, Lua};

use super::mlua_to_nota;
use crate::error::NotaError;

/// 一份文件在 unified diff 里的改动。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct 文件块 {
    /// 显示给用户看的路径：**已经掐掉 `a/`、`b/` 前缀和尾部那个制表符**。
    ///
    /// 掐不出来时是空串（理论上到不了：`diff --git` 那行总能猜出一个）。
    pub 路径: String,
    /// 这份文件是**新加的**（`--- /dev/null`）。
    pub 新增: bool,
    /// 这份文件被**整个删掉了**（`+++ /dev/null`）。此时 `路径` 取的是旧路径。
    pub 已删: bool,
    /// 逐行的内容。**五种都有**（见 `种类`），按它们在 diff 里出现的顺序。
    ///
    /// ⚠️ 空 `Vec` 不等于"没有改动"：二进制文件、只改了文件模式的那种，
    /// 本来就没有行可画（那时连文件头都没有）。调用方要按 `文件块` 画一条
    /// "这份画不了"，而不是不画。
    pub 行: Vec<一行>,
}

/// 一行在统一格式里的种类。**与 `git diff` 自己那套行首标记一一对应**。
///
/// 五档而不是两档（增/删）是 2026-09-26 改的：少了另外三档就看不见"改在哪一段"。
/// 上色由界面层决定（`src/styles/diff.css`），这里只回答"这是哪一种行"。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum 种类 {
    /// `diff --git` / `index …` / `--- a/x` / `+++ b/x` / `new file mode` /
    /// `rename …` / `\ No newline at end of file`。界面画成灰的。
    ///
    /// ⚠️ 这几行**照画**（不是像从前那样跳过）：一是终端里的 `git diff` 就有，
    /// 二是"这个文件是新加的还是改的"就写在上面。插件那边已经有一条人话的
    /// 文件标题，两处都在是刻意的——一条给人看，一条给"照 git 的样子看"。
    元信息,
    /// `@@ -a,b +c,d @@`。界面画成蓝的——它只标"位置"，不是内容。
    段头,
    /// `+` 开头的行。界面画成绿底。
    加,
    /// `-` 开头的行。界面画成红底 + 删除线。
    删,
    /// hunk 里没变的那部分（git 打出来是以一个空格开头）。界面保持默认颜色：
    /// 它是**背景**，不该跟改动抢眼。
    上下文,
}

/// 一行。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct 一行 {
    /// 这是哪一种行。
    pub 种类: 种类,
    /// 行内容。加/删/上下文**不含行首那个标记**（界面自己补 `+`/`-`/空格），
    /// 元信息与段头是**整行原样**（`@@ -1,4 +1,4 @@ 开头` 那串要原样留着）。
    pub 文本: String,
}

/// `种类` → 交给界面的 `op` 字符串。
///
/// ⚠️ 名字**不是**随便取的：前端 `src/ui/panel-nodes.ts` 按这几个字面量认，
/// 认不出的一律当 `add`（那里刻意"宁可多画一行也不静默吞掉"）。
/// 两处对不上时症状是**颜色骗人**，所以这一对字面量在两边各写了一遍注释。
fn 种类到op(种类: 种类) -> &'static str {
    match 种类 {
        种类::加 => "add",
        种类::删 => "del",
        种类::上下文 => "ctx",
        种类::段头 => "hunk",
        种类::元信息 => "meta",
    }
}

/// 解析一份 unified diff。认不出的一律跳过，**不报错**。
///
/// 认不出不是错误：一份 diff 里本来就有不属于任何文件块的东西（裸 `diff -u`
/// 那种没有 `diff --git` 的输出、`GIT binary patch` 后面的 base85 数据）。
/// 为它们让整个预览失败，等于"用户看得懂的东西被一个他看不懂的细节挡住"。
pub fn 解析统一(文本: &str) -> Vec<文件块> {
    let mut 结果: Vec<文件块> = Vec::new();
    let mut 当前: Option<文件块> = None;
    // `--- ` 给的旧路径。新文件那头是 `/dev/null`，靠它认"这份是新加的"。
    let mut 旧路径 = String::new();
    // 已经进过 `@@` = 后面全是正文，`--- x` 那样的行是**被删掉的内容**。
    let mut 在正文里 = false;
    // `GIT binary patch` 之后的 base85 是数据不是正文，跳过直到下一个文件。
    let mut 二进制 = false;

    // ⚠️ `lines()` 而不是 `split('\n')`：后者在收尾换行之后还会多出一个空串，
    // 而那个空串**不是 diff 里的一行**——2026-09-26 加上下文行的时候它当场
    // 现形了（每个文件块末尾凭空多一条空的上下文行，界面上是一行灰底空行）。
    // `lines()` 顺带把 `\r` 也吃掉（`strip_suffix` 留着是防有人换回 split）。
    for 原始 in 文本.lines() {
        let 行 = 原始.strip_suffix('\r').unwrap_or(原始);

        if let Some(余) = 行.strip_prefix("diff --git ") {
            收(&mut 结果, &mut 当前);
            当前 = Some(文件块 {
                路径: 猜路径(余),
                ..Default::default()
            });
            // ⚠️ 创建块之后**紧接着**把这一行也推进去：终端里的 `git diff`
            // 第一行就是它，而"这份是新文件还是改的"也有一部分写在这儿。
            推一行(&mut 当前, 种类::元信息, 行);
            旧路径.clear();
            在正文里 = false;
            二进制 = false;
            continue;
        }

        // ⚠️ 二进制那条**必须排在 `@@` 之前**：`GIT binary patch` 段里没有 `@@`，
        // 但数据行里可能出现任何字符。先认出"这段别看"就一了百了。
        if 二进制 {
            continue;
        }
        // ⚠️ 这两条**不能合成一条**（2026-09-26 分开的）：`GIT binary patch`
        // 后面跟着 base85 数据段，必须整段别看；而 `Binary files … differ`
        // 是一句**独立的话**，后面没有数据，它正是 git 在告诉用户"这份没法
        // 按行比"——吞掉它，用户看到的就是三行文件头下面什么都没有。
        if 行.starts_with("GIT binary patch") {
            二进制 = true;
            推一行(&mut 当前, 种类::元信息, 行);
            continue;
        }
        if 行.starts_with("Binary files ") {
            推一行(&mut 当前, 种类::元信息, 行);
            continue;
        }

        // ⚠️ `@@` 那条**必须排在文件头分支前面**：文件头分支在第一个 `@@`
        // 之后就再也不该被轮到——它认的是"`---`/`+++` 出现在 `diff --git`
        // 之后、第一个 `@@` 之前"。反过来排的症状是"每一行都被当文件头吞掉"，
        // 解析出来每个文件都是零行。
        if 行.starts_with("@@") {
            在正文里 = true;
            推一行(&mut 当前, 种类::段头, 行);
            continue;
        }

        // 只有有了 `当前` 才认文件头（见文件头第 1 条）。
        if !在正文里 && 当前.is_some() {
            if let Some(p) = 行.strip_prefix("--- ") {
                旧路径 = 干净路径(p, "a/");
                推一行(&mut 当前, 种类::元信息, 行);
                continue;
            }
            if let Some(p) = 行.strip_prefix("+++ ") {
                let p = 干净路径(p, "b/");
                let 块 = 当前.as_mut().expect("上面刚判过");
                if p == "/dev/null" {
                    // 删掉的文件：`+++` 那头没有路径，用 `---` 那头的。
                    块.路径 = 旧路径.clone();
                    块.已删 = true;
                } else {
                    块.新增 = 旧路径 == "/dev/null";
                    块.路径 = p;
                }
                推一行(&mut 当前, 种类::元信息, 行);
                continue;
            }
            if let Some(p) = 行.strip_prefix("rename to ") {
                // 纯改名（没有行改动）时 `diff --git` 给的是旧名字，而用户
                // 在改动列表里看到的是新名字——两处对不上就会显得像 bug。
                块路径(&mut 当前, &干净路径(p, ""));
                推一行(&mut 当前, 种类::元信息, 行);
                continue;
            }
            // 文件头那一段里其余的行（`index …`、`new file mode`、
            // `old mode`/`new mode`、`similarity index`、`rename from`）：
            // **照画，但是灰的**。它们不影响"哪几行被删了、哪几行加了"，
            // 却是终端里那份 diff 的一部分；行首标记一个都不认识的行
            // （被别的工具转写过的输出）也会落到这里。
            推一行(&mut 当前, 种类::元信息, 行);
            continue;
        }

        if let Some(rest) = 行.strip_prefix('+') {
            推一行(&mut 当前, 种类::加, rest);
        } else if let Some(rest) = 行.strip_prefix('-') {
            推一行(&mut 当前, 种类::删, rest);
        } else if 行.starts_with('\\') {
            // `\ No newline at end of file`：git 插在 hunk 里的提示行，
            // 既不是加也不是删（Folio 那边也把它算元信息）。
            推一行(&mut 当前, 种类::元信息, 行);
        } else {
            // 上下文：git 打出来是以**一个空格**开头，被别的工具转写过之后
            // 可能只剩空串。两种都当上下文——当成"没变的那部分"比当成
            // 文件头合理。
            推一行(&mut 当前, 种类::上下文, 行.strip_prefix(' ').unwrap_or(行));
        }
    }

    收(&mut 结果, &mut 当前);
    结果
}

/// 收尾：把 `当前` 放回结果里。
fn 收(结果: &mut Vec<文件块>, 当前: &mut Option<文件块>) {
    if let Some(块) = 当前.take() {
        // 路径是空的那种（既没 `+++` 也没猜出来）不画：界面上会变成一条
        // 没有名字、只有几行红绿的块，用户没法判断那是哪个文件的。
        if !块.路径.is_empty() {
            结果.push(块);
        }
    }
}

/// 往当前那份文件块里追加一行。
///
/// 没有当前块时（裸 `diff -u` 的输出、或者标记行出现在任何文件之前）是
/// **空操作**——宁可不画，也不凭空造一份没有名字的块（见文件头第 1 条）。
fn 推一行(当前: &mut Option<文件块>, 种类: 种类, 文本: &str) {
    if let Some(块) = 当前.as_mut() {
        块.行.push(一行 {
            种类,
            文本: 文本.to_owned(),
        });
    }
}

fn 块路径(当前: &mut Option<文件块>, 路径: &str) {
    if let Some(块) = 当前.as_mut() {
        块.路径 = 路径.to_owned();
    }
}

/// 从 `diff --git a/x b/x` 那行的剩余部分猜一个路径。
///
/// ⚠️ 这是**猜**：路径里带空格时（`a/我的 文稿.md b/我的 文稿.md`）两半靠
/// ` b/` 分界，路径自己带 ` b/` 就会猜错。所以它只在**没有 `+++` 行**时
/// 才当结果用（二进制文件、只改了模式的那种）——有 `+++` 行的时候那行是准的。
fn 猜路径(余: &str) -> String {
    let 余 = 余.strip_prefix("a/").unwrap_or(余);
    match 余.find(" b/") {
        Some(i) => 余[..i].to_owned(),
        // 没有 `a/`/`b/` 前缀（`diff -u` 风格）时至少掐掉制表符后面那份。
        None => 余.split('\t').next().unwrap_or(余).to_owned(),
    }
}

/// 掐掉前缀和尾部那份。普通 `diff -u` 会在路径后面跟一个制表符 + 时间戳
/// （`+++ x.md\t2026-09-25 …`），git 也会跟一个制表符。
fn 干净路径(原始: &str, 前缀: &str) -> String {
    let s = 原始.split('\t').next().unwrap_or(原始);
    s.strip_prefix(前缀).unwrap_or(s).to_owned()
}

/// 装出一个函数挂到 `nota.diff` 下面（键名由 `diff.rs` 那边定）。
///
/// 返回的是**一张数组表**（`{ {path=…, added=…, deleted=…, lines=…}, … }`），
/// 不是一个 `{ files = … }` 的记录——它没有"正文"、"坏行数"这类附属信息，
/// 硬套一层壳只会让每个调用点多写一个 `.files`。
pub fn build(lua: &Lua) -> Result<Function, NotaError> {
    lua.create_function(|lua, 文本: String| {
        let 文件们 = lua.create_table()?;
        for (i, f) in 解析统一(&文本).iter().enumerate() {
            let 表 = lua.create_table()?;
            表.set("path", f.路径.as_str())?;
            表.set("added", f.新增)?;
            表.set("deleted", f.已删)?;
            let 行们 = lua.create_table()?;
            for (j, l) in f.行.iter().enumerate() {
                let 行表 = lua.create_table()?;
                // ⚠️ 这五个字面量**必须和前端 `panel-nodes.ts` 的
                // `PanelDiffLine.op` 一一对上**：那边认不出的 op 会静默变成
                // `add`（画成绿的），所以这里多一个、那边少一个，界面上
                // 就是"明明删了却画成绿的"，而没有人会报这种 bug。
                行表.set("op", 种类到op(l.种类))?;
                行表.set("text", l.文本.as_str())?;
                行们.set(j + 1, 行表)?;
            }
            表.set("lines", 行们)?;
            文件们.set(i + 1, 表)?;
        }
        Ok(文件们)
    })
    .map_err(mlua_to_nota)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 断言用的小构造器：`行(种类::加, "新的一章")`。
    fn 行(种类: 种类, 文本: &str) -> 一行 {
        一行 {
            种类,
            文本: 文本.into(),
        }
    }

    /// 这一份里**真正的增删行**有几条（元信息 / 段头 / 上下文不算）。
    ///
    /// 用它而不是 `行.len()`：从 2026-09-26 起元信息也画（见文件头第 2 条），
    /// 于是"这份有没有改动"不再等于"这份有几行"。
    fn 改动条数(块: &文件块) -> usize {
        块.行
            .iter()
            .filter(|l| matches!(l.种类, 种类::加 | 种类::删))
            .count()
    }

    /// 一份最普通的 git diff：两个文件，第二个是新加的。
    const 两处: &str = r#"diff --git a/一章.md b/一章.md
index 1111111..2222222 100644
--- a/一章.md
+++ b/一章.md
@@ -1,4 +1,4 @@ 开头
 上文
-他慢慢地走了过来。
+他走过来。
 下文
diff --git a/二章.md b/二章.md
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/二章.md
@@ -0,0 +1,2 @@
+新的一章
+第二行
"#;

    #[test]
    fn 两个文件各归各的() {
        let 文件 = 解析统一(两处);
        assert_eq!(文件.len(), 2, "应当认出两个文件");
        assert_eq!(文件[0].路径, "一章.md");
        assert_eq!(文件[0].新增, false);
        assert_eq!(文件[0].已删, false);
        assert_eq!(
            文件[0].行,
            vec![
                行(种类::元信息, "diff --git a/一章.md b/一章.md"),
                行(种类::元信息, "index 1111111..2222222 100644"),
                行(种类::元信息, "--- a/一章.md"),
                行(种类::元信息, "+++ b/一章.md"),
                行(种类::段头, "@@ -1,4 +1,4 @@ 开头"),
                行(种类::上下文, "上文"),
                行(种类::删, "他慢慢地走了过来。"),
                行(种类::加, "他走过来。"),
                行(种类::上下文, "下文"),
            ]
        );
        assert_eq!(文件[1].路径, "二章.md");
        assert!(文件[1].新增, "`--- /dev/null` = 新文件");
        assert_eq!(
            文件[1].行,
            vec![
                行(种类::元信息, "diff --git a/二章.md b/二章.md"),
                行(种类::元信息, "new file mode 100644"),
                行(种类::元信息, "index 0000000..3333333"),
                行(种类::元信息, "--- /dev/null"),
                行(种类::元信息, "+++ b/二章.md"),
                行(种类::段头, "@@ -0,0 +1,2 @@"),
                行(种类::加, "新的一章"),
                行(种类::加, "第二行"),
            ]
        );
    }

    #[test]
    fn hunk_里空出来的那行算上下文不算文件头() {
        // 被别的工具转写过之后，上下文行那个前导空格可能没了，只剩空串。
        // 当成上下文（"没变的那部分"）比当成文件头合理。
        let 文本 = "diff --git a/x.md b/x.md\n\
                    --- a/x.md\n\
                    +++ b/x.md\n\
                    @@ -1,3 +1,3 @@\n\
                    \n\
                    -旧\n\
                    +新\n\
                    \x20尾\n";
        let 文件 = 解析统一(文本);
        assert_eq!(
            文件[0].行.last(),
            Some(&行(种类::上下文, "尾")),
            "最后那行是上下文：{:?}",
            文件[0].行
        );
        assert_eq!(
            文件[0].行[4],
            行(种类::上下文, ""),
            "空行也是上下文：{:?}",
            文件[0].行
        );
        assert_eq!(改动条数(&文件[0]), 2);
    }

    #[test]
    fn 五种类各自的样子都认得出来() {
        // 一条链把五种都走一遍：这份断言是**给前端那份联合类型立的靶子**
        // （`panel-nodes.ts` 的 `PanelDiffLine.op`），少了哪一种，界面上就
        // 会有一类行静默变成绿的。
        let 文件 = 解析统一(两处);
        let mut 见过 = Vec::new();
        for l in &文件[0].行 {
            见过.push(种类到op(l.种类));
        }
        assert_eq!(
            见过,
            vec!["meta", "meta", "meta", "meta", "hunk", "ctx", "del", "add", "ctx"]
        );
    }

    #[test]
    fn 被删掉的一行长得像文件头也不能认成文件头() {
        // 原文里有一行 `-- 分隔线`，删掉它 → diff 里是 `--- 分隔线`。
        // 只看"长得像"的话，这里会凭空多出一个叫"分隔线"的文件。
        let 文本 = "diff --git a/x.md b/x.md\n\
                    --- a/x.md\n\
                    +++ b/x.md\n\
                    @@ -1,3 +1,2 @@\n\
                    \x20上文\n\
                    --- 分隔线\n\
                    \x20下文\n";
        let 文件 = 解析统一(文本);
        assert_eq!(文件.len(), 1, "不该把被删的行当成第二个文件：{文件:?}");
        assert_eq!(文件[0].路径, "x.md");
        assert_eq!(
            改动条数(&文件[0]),
            1,
            "只有一行是改动：{:?}",
            文件[0].行
        );
        assert_eq!(
            文件[0].行.last(),
            Some(&行(种类::上下文, "下文")),
            "最后那行仍是上下文"
        );
        let 那一行 = 文件[0]
            .行
            .iter()
            .find(|l| l.种类 == 种类::删)
            .expect("删掉的那行要在");
        assert_eq!(那一行.文本, "-- 分隔线", "行首的标记只掐一个");
    }

    #[test]
    fn 删掉的文件用旧路径() {
        let 文本 = "diff --git a/旧.md b/旧.md\n\
                    deleted file mode 100644\n\
                    --- a/旧.md\n\
                    +++ /dev/null\n\
                    @@ -1 +0,0 @@\n\
                    -只剩这一行\n";
        let 文件 = 解析统一(文本);
        assert_eq!(文件.len(), 1);
        assert_eq!(文件[0].路径, "旧.md");
        assert!(文件[0].已删);
        assert!(!文件[0].新增);
        assert_eq!(改动条数(&文件[0]), 1);
        assert_eq!(
            文件[0].行.last(),
            Some(&行(种类::删, "只剩这一行")),
            "删掉的文件那行是删：{:?}",
            文件[0].行
        );
    }

    #[test]
    fn 二进制和只有模式变化都认出来了_只是没有增删的行() {
        // ⚠️ 这里判的是"**没有增删的行**"，不是"没有行"：从 2026-09-26 起
        // 文件头那几行也画（灰的），所以二进制文件现在有三行可看——
        // `Binary files … differ` 那句本身就是 git 在说"这份没法按行比"。
        let 二进制 = "diff --git a/图.png b/图.png\n\
                      index 111..222 100644\n\
                      Binary files a/图.png and b/图.png differ\n";
        let 文件 = 解析统一(二进制);
        assert_eq!(文件.len(), 1, "二进制文件也要出现，不能悄悄不画");
        assert_eq!(文件[0].路径, "图.png");
        assert_eq!(改动条数(&文件[0]), 0, "二进制没有增删的行");
        assert_eq!(文件[0].行.len(), 3, "但 git 自己那三行要照画");
        assert!(文件[0].行.iter().all(|l| l.种类 == 种类::元信息));

        let 模式 = "diff --git a/脚本.sh b/脚本.sh\n\
                    old mode 100644\n\
                    new mode 100755\n";
        let 文件 = 解析统一(模式);
        assert_eq!(文件.len(), 1);
        assert_eq!(
            文件[0].路径, "脚本.sh",
            "没有 `+++` 行时要能从 `diff --git` 猜出来"
        );
        assert_eq!(改动条数(&文件[0]), 0);
        assert_eq!(
            文件[0].行.last(),
            Some(&行(种类::元信息, "new mode 100755"))
        );
    }

    #[test]
    fn git_的二进制补丁体不当正文() {
        // `GIT binary patch` 之后是 base85，理论上一行可能以 `+`/`-` 开头。
        let 文本 = "diff --git a/x.bin b/x.bin\n\
                    index 111..222 100644\n\
                    GIT binary patch\n\
                    literal 12\n\
                    +abc\n\
                    -def\n\
                    diff --git a/y.md b/y.md\n\
                    --- a/y.md\n\
                    +++ b/y.md\n\
                    @@ -1 +1 @@\n\
                    -旧\n\
                    +新\n";
        let 文件 = 解析统一(文本);
        assert_eq!(文件.len(), 2);
        assert_eq!(
            文件[0].行,
            vec![
                行(种类::元信息, "diff --git a/x.bin b/x.bin"),
                行(种类::元信息, "index 111..222 100644"),
                行(种类::元信息, "GIT binary patch"),
            ],
            "只剩文件头那三行：base85 一段都别进来"
        );
        assert!(
            文件[0].行.iter().all(|l| !l.文本.contains("abc")),
            "base85 那几行一个字都不许进来：{:?}",
            文件[0].行
        );
        assert_eq!(改动条数(&文件[1]), 2, "下一个文件不受影响");
    }

    #[test]
    fn 末尾没换行那行不算改动() {
        let 文本 = "diff --git a/x.md b/x.md\n\
                    --- a/x.md\n\
                    +++ b/x.md\n\
                    @@ -1 +1 @@\n\
                    -旧\n\
                    +新\n\
                    \\ No newline at end of file\n";
        let 文件 = 解析统一(文本);
        assert_eq!(改动条数(&文件[0]), 2);
        assert_eq!(
            文件[0].行.last(),
            Some(&行(种类::元信息, "\\ No newline at end of file")),
            "这句是提示，不是改动，也不是上下文：{:?}",
            文件[0].行
        );
    }

    #[test]
    fn 路径后面那个制表符要掐掉() {
        let 文本 = "diff --git a/我的 文稿.md b/我的 文稿.md\n\
                    --- a/我的 文稿.md\t\n\
                    +++ b/我的 文稿.md\t2026-09-25 10:00:00\n\
                    @@ -1 +1 @@\n\
                    -旧\n\
                    +新\n";
        let 文件 = 解析统一(文本);
        assert_eq!(文件[0].路径, "我的 文稿.md");
    }

    #[test]
    fn 纯改名用新名字() {
        let 文本 = "diff --git a/旧名.md b/新名.md\n\
                    similarity index 100%\n\
                    rename from 旧名.md\n\
                    rename to 新名.md\n";
        let 文件 = 解析统一(文本);
        assert_eq!(文件[0].路径, "新名.md", "改动列表里显示的是新名字，这里要对上");
        assert_eq!(改动条数(&文件[0]), 0, "纯改名没有增删的行");
        assert_eq!(
            文件[0].行.last(),
            Some(&行(种类::元信息, "rename to 新名.md"))
        );
    }

    #[test]
    fn 不是_diff_的文本给空表() {
        // 一段随笔、一份没有 `diff --git` 的裸 `diff -u`——都退回"没认出来"。
        // 认不出的代价是没有预览；认错了的代价是把正文画成红绿两色。
        assert!(解析统一("这是一段普通的文字。\n--- 一条分隔线\n+++ 另一条\n").is_empty());
        assert!(解析统一("").is_empty());
    }

    #[test]
    fn 没有名字的那块不画() {
        // 既没有 `diff --git` 也没有 `+++`，只有几行增删：路径猜不出来，
        // 画出来就是一条没有名字的红绿块。
        let 文本 = "diff --git \n@@ -1 +1 @@\n-旧\n+新\n";
        assert!(解析统一(文本).is_empty());
    }
}
