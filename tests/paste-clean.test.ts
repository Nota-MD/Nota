/**
 * `src/editor/paste-clean.ts`（洗粘进来的 HTML）的**可运行**测试集。
 * 2026-09-28 写，与那个文件同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/paste-clean.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/paste-clean.mjs
 * node /tmp/nota-测试/paste-clean.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * 这一格的对错**只有两种表现**，而两种都不报错：
 *
 * - **洗过头**：`<div>` 被拆掉 ⇒ 两段并成一段；`<pre>` 上的 `data-language`
 *   被删掉 ⇒ **代码块的着色语言没了**（存盘时语言那一格是空的）。
 *   所以第二、三组把"必须留下的"一条条钉住。
 * - **洗不干净**：Word 的 `mso-*` 样式、`<o:p>`、条件注释漏进来 ⇒ 存盘里
 *   多出一堆没人看得懂的东西。第一组盯这个。
 *
 * ⚠️ 这一层**是纯函数**（自己扫标签，不碰 DOM），所以这些用例是真的在跑，
 * 不是"只能靠目检"——那正是当初不用 `DOMParser` 洗的理由（文件头那段）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️ **「粘进编辑器之后屏幕上真是一段干净内容」没验**：那一路要
 *   `transformPastedHTML` ＋ 真 `EditorView`（本仓没有 jsdom）。
 *   这里验的是**喂给 ProseMirror 的那串 HTML**，中间还隔着它自己的解析器。
 * - ⚠️ **畸形 HTML**（没闭合的标签、没加引号的属性值里带 `>`）处理不了，
 *   那是文件头写明的边界，不给它编用例——编了也只会测出"原样漏过去"。
 */

import { clearManagePastePasteHTML, findLanguageClue, languageNameTable } from "../src/editor/paste-clean";
import { extensionExtendNameTable } from "../src/editor/lang-guess";
import { readFileSync } from "node:fs";
import {
  looksLikeMarkdownSource,
  looksLikeSingleLineCode,
  recognizePastedTable,
} from "../src/editor/paste";

/* ── 一支极小的测试工装（与 `auto-correct.test.ts` 同一套长相）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];
const read = (path: string) => readFileSync(path, "utf8");

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

function group(name3: string): void {
  console.log(`\n【${name3}】`);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/** 洗一遍，只要 HTML（大多数用例不关心语言线索）。 */
function clean2(html: string): string {
  return clearManagePastePasteHTML(html).html;
}

/** 断言"洗完之后**包含**某一段"（属性顺序不敏感的那种）。 */
function contains(html: string, fragment: string, description: string): void {
  if (!html.includes(fragment)) throw new Error(`${description}：结果里没有 ${JSON.stringify(fragment)}\n      实际：${html}`);
}

/** 拿扩展名问一次（`语言名表` 那条一致性断言要一个"标准答案"）。 */
function pressExtensionExtendName(extensionExtendName: string): string | null {
  return extensionExtendNameTable[extensionExtendName] ?? null;
}

/** 断言"洗完之后**不含**某一段"。 */
function notContains(html: string, fragment: string, description: string): void {
  if (html.includes(fragment)) throw new Error(`${description}：结果里还有 ${JSON.stringify(fragment)}\n      实际：${html}`);
}

/* ── 一、垃圾一律扔掉 ───────────────────────────────────────────────── */

group("一、垃圾扔掉");

testCase("`<script>` / `<style>` / `<head>` 整块删掉（连内容一起）", () => {
  // ⚠️ 是**整块删**不是"丢壳留内容"：留着内容等于把一段 JS 贴成正文。
  equal(clean2("<p>甲</p><script>alert(1)</script><p>乙</p>"), "<p>甲</p><p>乙</p>", "script");
  equal(clean2("<style>p{color:red}</style><p>甲</p>"), "<p>甲</p>", "style");
  equal(clean2("<head><title>标题</title></head><body>甲</body>"), "甲", "head");
});

testCase("Word 的条件注释整块删掉", () => {
  const text4 = "<!--[if !supportLists]--><p>甲</p><!--[endif]-->";
  notContains(clean2(text4), "supportLists", "条件注释");
  contains(clean2(text4), "<p>甲</p>", "正文留下");
});

testCase("普通 HTML 注释也删掉", () => {
  equal(clean2("<!-- 这里是一句悄悄话 --><p>甲</p>"), "<p>甲</p>", "注释");
});

testCase("属性只留白名单里的", () => {
  const cleaned = clean2('<p class="MsoNormal" style="font-weight:700">甲</p>');
  notContains(cleaned, "MsoNormal", "class");
  notContains(cleaned, "style", "style");
  contains(cleaned, "<p>", "标签还在");
});

testCase("`<a>` 只留 `href` 与 `title`", () => {
  const cleaned = clean2('<a href="https://a.com" title="甲" onclick="bad()" target="_blank">链接</a>');
  contains(cleaned, 'href="https://a.com"', "href");
  contains(cleaned, 'title="甲"', "title");
  notContains(cleaned, "onclick", "onclick");
  notContains(cleaned, "target", "target");
});

testCase("`<img>` 只留 `src` / `alt` / `title`", () => {
  const cleaned = clean2('<img src="a.png" alt="图" width="100" height="50">');
  contains(cleaned, 'src="a.png"', "src");
  contains(cleaned, 'alt="图"', "alt");
  notContains(cleaned, "width", "width");
});

/* ── 二、壳要拆、块要留 ─────────────────────────────────────────────── */

group("二、壳拆掉、块留下");

testCase("⚠️ `<div>` **不拆**（它拆了两段就并成一段）", () => {
  // ProseMirror 的 `blockTags` 里有 `div`，靠它 `<div>甲</div><div>乙</div>`
  // 才会被解析成两段。
  const cleaned = clean2("<div>甲</div><div>乙</div>");
  contains(cleaned, "<div>甲</div>", "第一个 div");
  contains(cleaned, "<div>乙</div>", "第二个 div");
});

testCase("`<span>` / `<font>` / `<section>` 那一族拆掉（丢壳留内容）", () => {
  equal(clean2("<span>甲</span>"), "甲", "span");
  equal(clean2('<font color="red">甲</font>'), "甲", "font");
  equal(clean2("<section><p>甲</p></section>"), "<p>甲</p>", "section");
  // ⚠️ 里面那颗 `<b>` 会被 `换名` 写成 `<strong>`（第三组那条口径在这里也生效）。
  equal(clean2('<span class="x">甲<b>乙</b>丙</span>'), "甲<strong>乙</strong>丙", "嵌套");
});

testCase("命名空间的标签（`<o:p>` / `<w:ProofErr>`）丢标签留内容", () => {
  // ⚠️ Word 那份 HTML 里到处是它们。整个删掉会吃掉正文，留着又没人认得。
  equal(clean2("<p>甲<o:p></o:p></p>"), "<p>甲</p>", "`<o:p>`");
  equal(clean2('<p><w:ProofErr w:type="spellStart"/>甲</p>'), "<p>甲</p>", "`<w:ProofErr>`");
});

testCase("块级标签一个不拆", () => {
  for (const [input, expected] of [
    ["<h2>甲</h2>", "<h2>甲</h2>"],
    ["<blockquote>甲</blockquote>", "<blockquote>甲</blockquote>"],
    ["<ul><li>甲</li></ul>", "<ul><li>甲</li></ul>"],
    ["<pre>甲</pre>", "<pre>甲</pre>"],
    ["<table><tr><td>甲</td></tr></table>", "<table><tr><td>甲</td></tr></table>"],
    ["<hr>", "<hr>"],
  ]) {
    equal(clean2(input as string), expected, input as string);
  }
});

/* ── 三、把样式换成 schema 认的写法 ─────────────────────────────────── */

group("三、样式 → 语义标签（这是「洗」的另一半）");

testCase("`font-weight` 换成 `<strong>`", () => {
  contains(clean2('<p><span style="font-weight:700">甲</span></p>'), "<strong>", "加粗");
  contains(clean2('<p><span style="font-weight:bold">甲</span></p>'), "<strong>", "bold");
});

testCase("`font-style` 换成 `<em>`", () => {
  contains(clean2('<p><span style="font-style:italic">甲</span></p>'), "<em>", "斜体");
});

testCase("下划线 / 删除线换成 `<u>` / `<s>`", () => {
  // ⚠️ 不换成 `<ins>` / `<del>`：本仓序列化认的是 `u` 与 `s` 那两个写法。
  contains(clean2('<p><span style="text-decoration:underline">甲</span></p>'), "<u>", "下划线");
  contains(clean2('<p><span style="text-decoration:line-through">甲</span></p>'), "<s>", "删除线");
});

testCase("`<b>` / `<i>` / `<strike>` 换成 schema 认的那几个", () => {
  // ⚠️ 这几个在 ProseMirror 里也认，但换名之后**只有一套写法**在文档里跑。
  contains(clean2("<p><b>甲</b></p>"), "<strong>", "b → strong");
  contains(clean2("<p><i>甲</i></p>"), "<em>", "i → em");
  contains(clean2("<p><strike>甲</strike></p>"), "<s>", "strike → s");
});

testCase("OnlyOffice 写在段落或 div 上的格式进入段落内部", () => {
  const cleaned = clean2(
    '<p style="font-family:Arial;font-size:11pt;font-weight:700;font-style:italic;text-decoration:underline"><span style="font-family:宋体">111</span></p>',
  );
  equal(
    cleaned,
    "<p><strong><em><u>111</u></em></strong></p>",
    "OnlyOffice 段落样式",
  );

  const divStyle = clean2('<div style="font-weight:bold"><span style="font-style:italic">222</span></div>');
  equal(divStyle, "<div><strong><em>222</em></strong></div>", "div 段落样式");
});

testCase("OnlyOffice 的上下标与高亮样式映射为语义标签", () => {
  contains(clean2('<p><span style="vertical-align:super">2</span></p>'), "<sup>2</sup>", "上标");
  contains(clean2('<p><span style="vertical-align:sub">2</span></p>'), "<sub>2</sub>", "下标");
  contains(clean2('<p><span style="background-color:#fff2a8">重点</span></p>'), "<mark>重点</mark>", "高亮");
});

/* ── 四、代码块的语言线索 ───────────────────────────────────────────── */

group("四、代码块的 `data-language`");

testCase("⚠️ `<pre>` 必须活着带出 `data-language`（不然着色语言就没了）", () => {
  // ⚠️ `code_block` 的 `parseDOM` 读的是 `dom.dataset.language`，
  // 所以这一格是**着色能不能活下来**的唯一通道。
  const cleaned = clean2('<pre class="lang-python">print(1)</pre>');
  contains(cleaned, "data-language", "属性在");
  contains(cleaned, "python", "语言对");
});

testCase("`highlight-source-js` 那种 GitHub 的类名也认", () => {
  const cleaned = clean2('<pre class="highlight highlight-source-js"><code>const a = 1;</code></pre>');
  contains(cleaned, "javascript", "语言");
});

testCase("⚠️ 每个 `<pre>` 自己的线索优先于全文第一个", () => {
  // ⚠️ 一份 HTML 里两个代码块、语言不同时，只看"全文第一个"会串味。
  const cleaned = clean2('<pre class="lang-python">a</pre><pre class="lang-rust">b</pre>');
  const ordinalValue = cleaned.indexOf("python") >= 0;
  const ordinalTwo = cleaned.indexOf("rust") >= 0;
  if (!ordinalValue || !ordinalTwo) throw new Error(`两个 pre 的语言该各归各：${cleaned}`);
});

testCase("认不出语言的代码块照样留着（只是不带 data-language）", () => {
  const cleaned = clean2("<pre>随便写点什么</pre>");
  contains(cleaned, "<pre", "pre 还在");
  contains(cleaned, "随便写点什么", "内容还在");
});

testCase("`找语言线索` 单测：几种常见类名", () => {
  equal(findLanguageClue('<pre class="language-ts">'), "typescript", "language-");
  equal(findLanguageClue('<pre data-language="rust">'), "rust", "data-language");
  equal(findLanguageClue('<code class="lang-py">'), "python", "lang-");
  equal(findLanguageClue("<pre>没有线索</pre>"), null, "没有线索");
});

testCase("⚠️ `语言名表` 只能换名字，不能引进别处不认的语言 id", () => {
  // ⚠️ 2026-09-28 补的第二张表（`python` / `rust` 这些长名不是扩展名，查
  // `扩展名表` 一个都落空）。这条断言就是它的护栏：值必须**都**在
  // `扩展名表` 里出现过，所以这张表加不出一个新的、`lang-guess` 那边不认识的
  // 语言 id（比如 `matlab` —— refractor 里就没有那个 id）。
  const recognizeObtainOf = new Set(Object.values(extensionExtendNameTable));
  const bad = Object.entries(languageNameTable)
    .filter(([, language]) => !recognizeObtainOf.has(language))
    .map(([name3, language]) => `${name3} → ${language}`);
  if (bad.length) throw new Error(`有 ${bad.length} 条指向别处没有的 id：${bad.join("、")}`);
});

testCase("⚠️ 每个值都得认得出（长名与短名给同一个答案）", () => {
  // ⚠️ `.sh` 走 `扩展名表`、`class="lang-sh"` 也得给同一个答案，
  //    否则同一段代码"从文件打开是 bash、粘进来是别的色"。
  equal(findLanguageClue('<pre class="language-sh">'), pressExtensionExtendName("sh"), "sh 两路一致");
  equal(findLanguageClue('<pre class="lang-bash">'), pressExtensionExtendName("sh"), "bash 也是那个");
});

/* ── 五、边界 ───────────────────────────────────────────────────────── */

group("五、边界");

testCase("空串进、空串出（不抛）", () => {
  equal(clean2(""), "", "空串");
});

testCase("全是垃圾时结果为空串（调用方自己判）", () => {
  equal(clean2("<script>alert(1)</script>"), "", "只有 script");
});

testCase("纯文本原样出来", () => {
  equal(clean2("就是一段字"), "就是一段字", "没有标签");
});

testCase("⚠️ `<table>` 只留结构不留样式", () => {
  const cleaned = clean2('<table style="width:100%"><tr><td colspan="2" style="color:red">甲</td></tr></table>');
  contains(cleaned, "<table>", "table");
  contains(cleaned, 'colspan="2"', "colspan 留");
  notContains(cleaned, "color", "样式丢");
});

/* ── 六、粘贴前的纯文本识别 ─────────────────────────────────────────── */

group("六、粘贴前的纯文本识别");

testCase("表格软件复制的 TSV 识别成二维表", () => {
  const table = recognizePastedTable("姓名\t年龄\t城市\n甲\t18\t北京\n乙\t20\t上海");
  equal(table?.delimiter, "tab", "分隔符");
  equal(table?.rows.length, 3, "行数");
  equal(table?.rows[1]?.join("|"), "甲|18|北京", "数据");
});

testCase("CSV 的引号、逗号与转义引号都按表格解析", () => {
  const table = recognizePastedTable('name,note\n"Sindre, S.","He said ""hi"""\nAda,Compiler');
  equal(table?.delimiter, "comma", "分隔符");
  equal(table?.rows[1]?.[0], "Sindre, S.", "引号里的逗号");
  equal(table?.rows[1]?.[1], 'He said "hi"', "双引号转义");
});

testCase("分号 CSV 与末尾空列一起处理", () => {
  const table = recognizePastedTable("a;b;\n1;2;\n3;4;");
  equal(table?.delimiter, "semicolon", "分隔符");
  equal(table?.rows[0]?.join("|"), "a|b", "末尾空列被去掉");
});

testCase("GFM Markdown 表格直接识别为表格并保留列对齐", () => {
  const table = recognizePastedTable("| a | b |\n| :-- | --: |\n| 1 | 2 |");
  equal(table?.delimiter, "markdown", "Markdown table");
  equal(table?.rows[0]?.join("|"), "a|b", "表头");
  equal(table?.rows[1]?.join("|"), "1|2", "数据");
  equal(JSON.stringify(table?.align), JSON.stringify(["left", "right"]), "列对齐");
});

testCase("表格单元格再走行内解析，不把 `*周期*` 存成 `\\*周期\\*`", () => {
  const source3 = read("src/editor/paste.ts");
  contains(source3, "const inlineCell = (text4: string)", "单元格没有行内解析入口");
  contains(
    source3,
    'if (first2?.type.name === "paragraph") return first2.content',
    "没有取回单元格的行内标记",
  );
  contains(
    source3,
    "pasteBecomeMarkdown(view, ctx.get(parserCtx), plainText)",
    "Markdown 表格没有整表交给真实解析器",
  );
  contains(
    source3,
    "pasteBecomeTable(view, pasted, ctx.get(parserCtx))",
    "TSV/CSV 表格没有接真实解析器",
  );
});

testCase("单行代码只接管高置信形状", () => {
  equal(looksLikeSingleLineCode('{"a":1}'), true, "JSON");
  equal(looksLikeSingleLineCode("SELECT id FROM users;"), true, "SQL");
  equal(looksLikeSingleLineCode("const answer = 42;"), true, "声明");
  equal(looksLikeSingleLineCode("git status"), false, "普通命令");
  equal(looksLikeSingleLineCode("The answer, obviously."), false, "英文正文");
});

testCase("Markdown 源码优先交给上游解析", () => {
  equal(looksLikeMarkdownSource("```ts\nconst x = 1\n```"), true, "围栏");
  equal(looksLikeMarkdownSource("```math\n\n```"), true, "空 math 围栏");
  equal(looksLikeMarkdownSource("---\ntitle: A\n---\n正文"), true, "Front Matter");
  equal(looksLikeMarkdownSource("| a | b |\n| --- | --- |"), true, "Markdown 表格");
  equal(looksLikeMarkdownSource("# 标题\n- 项目\n[链接](https://example.com)"), true, "成组 Markdown");
  equal(looksLikeMarkdownSource("普通的两行\n文字内容"), false, "普通正文");
});

testCase("粘贴分流顺序：Markdown 表格 → 其他 Markdown → 代码", () => {
  const source3 = read("src/editor/paste.ts");
  const table = source3.indexOf('markdownTable?.delimiter === "markdown"');
  const markdown = source3.indexOf("pasteBecomeMarkdown(view, ctx.get(parserCtx)");
  const code = source3.indexOf("looksLikeCode(plainText)");
  if (!(table >= 0 && table < markdown && markdown < code)) {
    throw new Error(`分流顺序不对：${markdown}, ${table}, ${code}`);
  }
  if (source3.includes("html.length === 0 && looksLikeMarkdownSource(plainText)")) {
    throw new Error("Markdown 仍被限制为只能在没有 text/html 时生效");
  }
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
