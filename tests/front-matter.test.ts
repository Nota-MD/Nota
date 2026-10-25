/**
 * **文档开头那段 YAML front matter**（`src/editor/front-matter.ts`）——
 * 逐字节的进出、以及"改/建/删"那三条路，2026-10-04 写。
 *
 * # 这份文件量的是两件事，中间隔着一个用户拍板
 *
 * 上半份（组一、组二）钉的是**原来那件事**：「别把它弄丢」——进编辑器之前切下来、
 * 出来原样拼回去，一个字节都不许变（`docs/07` 第 56 项那一族病的根）。
 *
 * 下半份（组三、组四）钉的是**新那件事**：「让它能改」（第 64 项）。用户 2026-10-04
 * 拍板「做成可编辑的」，而做法**仍然不走节点那条路**——编辑框放在正文上方那条
 * 横幅里，改的是一段**文本**，进出仍在边界上完成。理由写在 `front-matter.ts`
 * 的文件头（不许加依赖 ＋ 键值表式的编辑会重新序列化，把注释/顺序/引号全丢掉，
 * 那正是这三轮一直在治的病）。
 *
 * 组五是那两条判据**合并**的落点（第 63 项）：大纲扫描走的是同一条
 * [`前置块行数`]，所以"所见即所得里看不见那几行、大纲却把它们当正文数"这种
 * 对不上不会再有。
 *
 * # 每一组跑的都是真代码，一段都不替它实现
 *
 * 这里**一个替身都没有**：被测的就是那几个纯函数（`拆前置块` / `拼回前置块` /
 * `拆前置块内文` / `改前置块内文` / `建前置块` / `换前置块` / `前置块行数`），
 * 没有 DOM、没有 Milkdown、没有 `Editor`。所以这份文件跑得快，也**不需要**
 * `--alias:@=./src`——它只 import 一个相对路径。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **那条横幅（`ui/FrontMatterBanner.tsx`，2026-10-07 从 `EditorPane.tsx` 拆出来的）一个字没验**：编辑框摊开、回声识别（`前置块基准Ref`）、
 *   两击删除、"清空不等于删除"——那些是 React 组件里的行为，这里一颗 DOM 都没有。
 *   ⚠️ 其中"清空不等于删除"那一条**在组件里**（`提交` 的 `if (内文.trim() === "") return`），
 *   而**模块这一层**的 [`换前置块`] 正好相反（空白 ＝ 删）：两个调用方传进来的
 *   是**已经判过**的那一份。这一处差别是本文件最容易被误读的地方，第三组末尾
 *   专门钉着它。
 * - **`create.ts::写前置块` 那条旁路没验**：它为什么不走 `markdownUpdated`
 *   （那一跳只在 `markdown !== prev` 时发生，只改 front matter 时正文字节没变，
 *   于是**永远不会**触发——自动保存会静默丢掉那一笔），是设计上的论证，
 *   要建整个 `Editor` 才验得了（`math-currency.test.ts` 第六组同形）。
 * - **开窗目检没做**：真窗口里改一行 YAML、`Ctrl+S`、`cat` 文件比字节
 *   （`docs/06` §5 的做法）。这里量的是"给一段文本、那几段变成什么"。
 * - **别的 Markdown 实现怎么读**没验：`建前置块` 结尾那个空行是为了
 *   "不让收尾 `---` 与正文首行拼成 setext 标题"，那是**读别的读法**推出来的，
 *   本仓没有第二条解析链可量。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/front-matter.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-front-matter-test/front-matter.test.mjs
 * node /tmp/nota-front-matter-test/front-matter.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 * ⚠️ esbuild 报错时旧 bundle 还在，`node` 跑出来的是上一版结果——先看 esbuild
 * 那行有没有 `error`（`inline-marks.test.ts` 的文件头记过这个坑）。
 */

import {
  splitFrontMatter,
  joinFrontMatter,
  splitFrontMatterBody,
  replaceFrontMatterBody,
  createFrontMatter,
  replaceFrontMatter,
  frontMatterLineCount,
  newFrontMatterTemplate,
} from "../src/editor/front-matter";

/* ── 一支极小的测试工装（与 `list-indent.test.ts` 同一套长相）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function group(name3: string): void {
  console.log(`\n${name3}`);
}

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function equal(actual: unknown, expected: unknown, description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}\n      实际：${a}\n      期望：${b}`);
}

function assertValue(value2: unknown, description: string): void {
  if (!value2) throw new Error(description);
}

/* ── 组一：`拆前置块` 的判据是保守的（三条同时满足才认）────────────── */

group("组一 拆前置块：`---` 首先是分割线，认错一次就毁一段文档");

testCase("正常一份：切下来的含首尾围栏，正文里一个字都不带", () => {
  const r = splitFrontMatter("---\ntheme: seriph\n---\n正文\n");
  equal(r.frontMatter, "---\ntheme: seriph\n---\n", "切下来的那一段");
  equal(r.body2, "正文\n", "剩下的正文");
});

testCase("`...` 也是合法闭栏（YAML 的另一种收尾写法）", () => {
  const r = splitFrontMatter("---\na: 1\n...\n正文\n");
  equal(r.frontMatter, "---\na: 1\n...\n", "闭栏 `...` 照样认");
});

testCase("围栏后面那几行**空行**算进前置块（否则正文首行空行会被编辑器顺手删掉）", () => {
  const r = splitFrontMatter("---\na: 1\n---\n\n\n正文\n");
  equal(r.frontMatter, "---\na: 1\n---\n\n\n", "空行跟着走");
  equal(r.body2, "正文\n", "正文开头不是空行");
});

testCase("CRLF 的文件：切下来的那一段也带 `\\r\\n`", () => {
  const r = splitFrontMatter("---\r\na: 1\r\n---\r\n正文\r\n");
  equal(r.frontMatter, "---\r\na: 1\r\n---\r\n", "回车一个不少");
  equal(r.body2, "正文\r\n", "正文那半也一样");
});

testCase("① 首行不是 `---` ⇒ 不认（开头有一行正文就不算）", () => {
  const r = splitFrontMatter("正文\n---\na: 1\n---\n");
  equal(r.frontMatter, null, "第一行不是围栏");
  equal(r.body2, "正文\n---\na: 1\n---\n", "整篇原样还回去");
});

testCase("① 有 BOM ⇒ 不认（宁可放过，不误伤）", () => {
  const r = splitFrontMatter("﻿---\na: 1\n---\n正文\n");
  equal(r.frontMatter, null, "BOM 在前面就不认");
});

testCase("② 找不到闭栏 ⇒ 不认（残缺文件照旧能看能存）", () => {
  const r = splitFrontMatter("---\na: 1\n正文\n");
  equal(r.frontMatter, null, "没有收尾那一行");
});

testCase("③ 中间那几行不像 YAML 映射 ⇒ 不认（一份散文不会被吃掉开头）", () => {
  const r = splitFrontMatter("---\n这是一段散文，不是键值对\n---\n正文\n");
  equal(r.frontMatter, null, "看起来像正文就不认");
});

testCase("③ 一对**空**围栏 ⇒ 不认（退化成什么都不保留，比不认更糟）", () => {
  const r = splitFrontMatter("---\n---\n正文\n");
  equal(r.frontMatter, null, "`---\\n---` 更像一对分割线");
});

testCase("③ 缩进行 / `#` 注释行都算「像映射」", () => {
  const r = splitFrontMatter("---\n# 注释\n  - 缩进\n主题: 昨天\n---\n正文\n");
  equal(r.frontMatter, "---\n# 注释\n  - 缩进\n主题: 昨天\n---\n", "注释与缩进都放行");
});

testCase("③ `https://x` 这类行**不**算映射项（冒号后不是空白）", () => {
  const r = splitFrontMatter("---\nhttps://example.com\n---\n正文\n");
  equal(r.frontMatter, null, "YAML 里 `键:值` 不是映射，所以它更像正文");
});

/* ── 组二：拼回去必须**逐字节**相同（第 56 项那族病的根）────────────── */

group("组二 拼回＝逐字节：打开再存一个字节都不许变");

testCase("拆了再拼 = 原文（一份带围栏后空行的 CRLF 文件）", () => {
  const original = "---\r\n主题: 昨天\r\n---\r\n\r\n正文第一段\r\n\r\n正文第二段\r\n";
  const r = splitFrontMatter(original);
  equal(joinFrontMatter(r.frontMatter, r.body2), original, "一个字节都不差");
});

testCase("没有 front matter 时 `拼回` 就是恒等", () => {
  equal(joinFrontMatter(null, "正文\n"), "正文\n", "什么都不加");
});

testCase("`拼回` 不补齐任何东西（多加一个空行＝每存一次盘长一行）", () => {
  // 切下来的那一段**末尾已经带着换行**（含闭栏那行的），正文开头不是空行，
  // 所以这里两截直接相接就是原文。要"好看"而补一个 `\n` 的话，存盘会越存越长。
  const original = "---\na: 1\n---\n正文\n";
  const r = splitFrontMatter(original);
  equal(r.frontMatter?.endsWith("---\n"), true, "切片的末尾是闭栏那行的换行");
  equal(joinFrontMatter(r.frontMatter, r.body2), original, "直接相接");
});

/* ── 组三：取内文 / 换内文（围栏与换行风格原样留着）──────────────── */

group("组三 拆/改内文：用户改的是 YAML，围栏与空行不是他的");

testCase("取内文：不含围栏、不含围栏后面吃进的空行", () => {
  const r = splitFrontMatter("---\na: 1\nb: 2\n---\n\n正文\n");
  equal(splitFrontMatterBody(r.frontMatter!), "a: 1\nb: 2", "就是那两行");
});

testCase("取内文：末尾**最多**去掉一个换行（`a: 1` 后面那行空行算内文的一部分）", () => {
  const r = splitFrontMatter("---\na: 1\n\n---\n正文\n");
  equal(splitFrontMatterBody(r.frontMatter!), "a: 1\n", "去掉的是一个，不是全部");
});

testCase("改内文：换行按**原来那一段**的习惯写回（CRLF 的文件不该变成混行）", () => {
  const r = splitFrontMatter("---\r\na: 1\r\n---\r\n正文\r\n");
  const newValue = replaceFrontMatterBody(r.frontMatter!, "a: 2\nb: 3");
  equal(newValue, "---\r\na: 2\r\nb: 3\r\n---\r\n", "两行都用 CRLF");
  assertValue(!/(?<!\r)\n/.test(newValue), "不该出现光杆的 `\\n`");
});

testCase("改内文：`...` 收尾照旧是 `...`（不顺手改成 `---`）", () => {
  const newValue = replaceFrontMatterBody("---\na: 1\n...\n", "a: 2");
  equal(newValue, "---\na: 2\n...\n", "围栏风格一个字不动");
});

testCase("改内文：围栏后面那几行空行原样留着", () => {
  const newValue = replaceFrontMatterBody("---\na: 1\n---\n\n\n", "a: 2");
  equal(newValue, "---\na: 2\n---\n\n\n", "那几行空行不属于内文");
});

testCase("改内文：多出来的一个尾换行被收掉（这正是 [`拆前置块内文`] 去掉的那一个）", () => {
  const newValue = replaceFrontMatterBody("---\na: 1\n---\n", "a: 2\n");
  equal(newValue, "---\na: 2\n---\n", "不是 `a: 2\\n\\n`");
});

testCase("改内文：原来那段认不出来 ⇒ **从头建一段**（认不出来就等于不是我们管的那段）", () => {
  const newValue = replaceFrontMatterBody("这不是 front matter", "a: 1");
  equal(newValue, "---\na: 1\n---\n\n", "等于新建");
});

/* ── 组四：建 / 换（`null` 与空白那两处的分工）────────────────────── */

group("组四 换前置块：建、改、删三条路只有一个入口");

testCase("原来没有 ⇒ 建一段（结尾带一个空行）", () => {
  equal(replaceFrontMatter(null, "a: 1"), "---\na: 1\n---\n\n", "`---\\n…\\n---\\n\\n`");
});

testCase("原来有 ⇒ 只换里面那几行", () => {
  equal(replaceFrontMatter("---\na: 1\n---\n\n", "a: 2"), "---\na: 2\n---\n\n", "围栏与空行不动");
});

testCase("内文空白（空串 / 只有换行 / 只有空格）＝ **删掉这一段**", () => {
  equal(replaceFrontMatter("---\na: 1\n---\n\n", ""), null, "空串");
  equal(replaceFrontMatter("---\na: 1\n---\n\n", "\n\n"), null, "只有换行");
  equal(replaceFrontMatter("---\na: 1\n---\n\n", "   "), null, "只有空格");
  equal(replaceFrontMatter(null, "   "), null, "本来就没有、又给空的：给 null 也不是空围栏");
});

testCase("⚠️ 空白 ＝ 删 是**模块这一层**的口径；「清空不等于删除」在组件那一层", () => {
  // `ui/FrontMatterBanner.tsx::提交` 里先 `if (内文.trim() === "") return`，
  // 所以用户把编辑框清空时**根本不会走到这里**——这是故意的：清空输入框是
  // 极容易误触的动作，而这份文档是自动保存的。要删那一段走那颗「删除」
  // （还要按两下）。这一条钉的正是"两个调用方传进来的都是已经判过的那一份"。
  equal(replaceFrontMatter("---\na: 1\n---\n\n", ""), null, "模块这一层：空白就是删");
  equal(createFrontMatter(""), "---\n\n---\n\n", "真的建出空围栏时是这样（谁都不该这么调）");
});

testCase("模板 `title: ` 照原样进得去（末尾那个空格是留给光标的，不做 trim）", () => {
  equal(createFrontMatter(newFrontMatterTemplate), "---\ntitle: \n---\n\n", "那个空格没被吃掉");
});

testCase("模板的值是**空**的：标题照旧回退到第一个标题 / 文件名", () => {
  // `document/title.rs::front_matter_title` 要求值非空，所以这里不许写死一个名字
  // ——写上去就把标签页上的标题钉死了，而用户只是想"在这篇开头放一段 front matter"。
  equal(newFrontMatterTemplate.split(":")[1], " ", "冒号后面只有那一个空格");
});

testCase("建/改/删三条路拼出来的东西**都还认得出来**（过得了自己那套判据）", () => {
  const createOf = createFrontMatter("a: 1");
  assertValue(splitFrontMatter(createOf + "正文\n").frontMatter === createOf, "建出来的能拆回来");
  const changeOf = replaceFrontMatter(createOf, "a: 2")!;
  assertValue(splitFrontMatter(changeOf + "正文\n").frontMatter === changeOf, "改出来的也能");
});

/* ── 组五：行数（大纲与编辑器藏的是同一段）────────────────────────── */

group("组五 前置块行数：判据与 `拆前置块` 同一份（第 63 项合并的落点）");

testCase("三行围栏那一份算 3 行", () => {
  equal(frontMatterLineCount("---\na: 1\n---\n正文\n"), 3, "两行围栏 + 一行 YAML");
});

testCase("闭栏后面吃进的空行**也**算（空行里没有标题，多跳几行没代价）", () => {
  equal(frontMatterLineCount("---\na: 1\n---\n\n\n正文\n"), 5, "与全文行号对得上");
});

testCase("不认的时候是 0（正文一个字都不跳）", () => {
  equal(frontMatterLineCount("正文\n---\na: 1\n---\n"), 0, "第一行不是围栏");
  equal(frontMatterLineCount(""), 0, "空文档");
});

testCase("没带闭栏换行的那一份也数得对（切片末尾按换行切会多一个空尾巴）", () => {
  equal(frontMatterLineCount("---\na: 1\n---"), 3, "文件就停在闭栏那一行");
});

/* ── 收尾 ─────────────────────────────────────────────────────────── */

console.log(`\n过 ${pass}，败 ${fail}`);
if (fail > 0) {
  console.log("没过的：");
  for (const name3 of failed) console.log(`  · ${name3}`);
  process.exit(1);
}
