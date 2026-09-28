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

import { 清理粘贴HTML, 找语言线索, 语言名表 } from "../src/editor/paste-clean";
import { 扩展名表 } from "../src/editor/lang-guess";

/* ── 一支极小的测试工装（与 `auto-correct.test.ts` 同一套长相）── */

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    败的.push(名称);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 组(名: string): void {
  console.log(`\n【${名}】`);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

/** 洗一遍，只要 HTML（大多数用例不关心语言线索）。 */
function 洗(html: string): string {
  return 清理粘贴HTML(html).html;
}

/** 断言"洗完之后**包含**某一段"（属性顺序不敏感的那种）。 */
function 含(html: string, 片段: string, 说明: string): void {
  if (!html.includes(片段)) throw new Error(`${说明}：结果里没有 ${JSON.stringify(片段)}\n      实际：${html}`);
}

/** 拿扩展名问一次（`语言名表` 那条一致性断言要一个"标准答案"）。 */
function 按扩展名(扩展名: string): string | null {
  return 扩展名表[扩展名] ?? null;
}

/** 断言"洗完之后**不含**某一段"。 */
function 不含(html: string, 片段: string, 说明: string): void {
  if (html.includes(片段)) throw new Error(`${说明}：结果里还有 ${JSON.stringify(片段)}\n      实际：${html}`);
}

/* ── 一、垃圾一律扔掉 ───────────────────────────────────────────────── */

组("一、垃圾扔掉");

测("`<script>` / `<style>` / `<head>` 整块删掉（连内容一起）", () => {
  // ⚠️ 是**整块删**不是"丢壳留内容"：留着内容等于把一段 JS 贴成正文。
  等(洗("<p>甲</p><script>alert(1)</script><p>乙</p>"), "<p>甲</p><p>乙</p>", "script");
  等(洗("<style>p{color:red}</style><p>甲</p>"), "<p>甲</p>", "style");
  等(洗("<head><title>标题</title></head><body>甲</body>"), "甲", "head");
});

测("Word 的条件注释整块删掉", () => {
  const 文 = "<!--[if !supportLists]--><p>甲</p><!--[endif]-->";
  不含(洗(文), "supportLists", "条件注释");
  含(洗(文), "<p>甲</p>", "正文留下");
});

测("普通 HTML 注释也删掉", () => {
  等(洗("<!-- 这里是一句悄悄话 --><p>甲</p>"), "<p>甲</p>", "注释");
});

测("属性只留白名单里的", () => {
  const 洗后 = 洗('<p class="MsoNormal" style="font-weight:700">甲</p>');
  不含(洗后, "MsoNormal", "class");
  不含(洗后, "style", "style");
  含(洗后, "<p>", "标签还在");
});

测("`<a>` 只留 `href` 与 `title`", () => {
  const 洗后 = 洗('<a href="https://a.com" title="甲" onclick="bad()" target="_blank">链接</a>');
  含(洗后, 'href="https://a.com"', "href");
  含(洗后, 'title="甲"', "title");
  不含(洗后, "onclick", "onclick");
  不含(洗后, "target", "target");
});

测("`<img>` 只留 `src` / `alt` / `title`", () => {
  const 洗后 = 洗('<img src="a.png" alt="图" width="100" height="50">');
  含(洗后, 'src="a.png"', "src");
  含(洗后, 'alt="图"', "alt");
  不含(洗后, "width", "width");
});

/* ── 二、壳要拆、块要留 ─────────────────────────────────────────────── */

组("二、壳拆掉、块留下");

测("⚠️ `<div>` **不拆**（它拆了两段就并成一段）", () => {
  // ProseMirror 的 `blockTags` 里有 `div`，靠它 `<div>甲</div><div>乙</div>`
  // 才会被解析成两段。
  const 洗后 = 洗("<div>甲</div><div>乙</div>");
  含(洗后, "<div>甲</div>", "第一个 div");
  含(洗后, "<div>乙</div>", "第二个 div");
});

测("`<span>` / `<font>` / `<section>` 那一族拆掉（丢壳留内容）", () => {
  等(洗("<span>甲</span>"), "甲", "span");
  等(洗('<font color="red">甲</font>'), "甲", "font");
  等(洗("<section><p>甲</p></section>"), "<p>甲</p>", "section");
  // ⚠️ 里面那颗 `<b>` 会被 `换名` 写成 `<strong>`（第三组那条口径在这里也生效）。
  等(洗('<span class="x">甲<b>乙</b>丙</span>'), "甲<strong>乙</strong>丙", "嵌套");
});

测("命名空间的标签（`<o:p>` / `<w:ProofErr>`）丢标签留内容", () => {
  // ⚠️ Word 那份 HTML 里到处是它们。整个删掉会吃掉正文，留着又没人认得。
  等(洗("<p>甲<o:p></o:p></p>"), "<p>甲</p>", "`<o:p>`");
  等(洗('<p><w:ProofErr w:type="spellStart"/>甲</p>'), "<p>甲</p>", "`<w:ProofErr>`");
});

测("块级标签一个不拆", () => {
  for (const [输入, 期望] of [
    ["<h2>甲</h2>", "<h2>甲</h2>"],
    ["<blockquote>甲</blockquote>", "<blockquote>甲</blockquote>"],
    ["<ul><li>甲</li></ul>", "<ul><li>甲</li></ul>"],
    ["<pre>甲</pre>", "<pre>甲</pre>"],
    ["<table><tr><td>甲</td></tr></table>", "<table><tr><td>甲</td></tr></table>"],
    ["<hr>", "<hr>"],
  ]) {
    等(洗(输入 as string), 期望, 输入 as string);
  }
});

/* ── 三、把样式换成 schema 认的写法 ─────────────────────────────────── */

组("三、样式 → 语义标签（这是「洗」的另一半）");

测("`font-weight` 换成 `<strong>`", () => {
  含(洗('<p><span style="font-weight:700">甲</span></p>'), "<strong>", "加粗");
  含(洗('<p><span style="font-weight:bold">甲</span></p>'), "<strong>", "bold");
});

测("`font-style` 换成 `<em>`", () => {
  含(洗('<p><span style="font-style:italic">甲</span></p>'), "<em>", "斜体");
});

测("下划线 / 删除线换成 `<u>` / `<s>`", () => {
  // ⚠️ 不换成 `<ins>` / `<del>`：本仓序列化认的是 `u` 与 `s` 那两个写法。
  含(洗('<p><span style="text-decoration:underline">甲</span></p>'), "<u>", "下划线");
  含(洗('<p><span style="text-decoration:line-through">甲</span></p>'), "<s>", "删除线");
});

测("`<b>` / `<i>` / `<strike>` 换成 schema 认的那几个", () => {
  // ⚠️ 这几个在 ProseMirror 里也认，但换名之后**只有一套写法**在文档里跑。
  含(洗("<p><b>甲</b></p>"), "<strong>", "b → strong");
  含(洗("<p><i>甲</i></p>"), "<em>", "i → em");
  含(洗("<p><strike>甲</strike></p>"), "<s>", "strike → s");
});

/* ── 四、代码块的语言线索 ───────────────────────────────────────────── */

组("四、代码块的 `data-language`");

测("⚠️ `<pre>` 必须活着带出 `data-language`（不然着色语言就没了）", () => {
  // ⚠️ `code_block` 的 `parseDOM` 读的是 `dom.dataset.language`，
  // 所以这一格是**着色能不能活下来**的唯一通道。
  const 洗后 = 洗('<pre class="lang-python">print(1)</pre>');
  含(洗后, "data-language", "属性在");
  含(洗后, "python", "语言对");
});

测("`highlight-source-js` 那种 GitHub 的类名也认", () => {
  const 洗后 = 洗('<pre class="highlight highlight-source-js"><code>const a = 1;</code></pre>');
  含(洗后, "javascript", "语言");
});

测("⚠️ 每个 `<pre>` 自己的线索优先于全文第一个", () => {
  // ⚠️ 一份 HTML 里两个代码块、语言不同时，只看"全文第一个"会串味。
  const 洗后 = 洗('<pre class="lang-python">a</pre><pre class="lang-rust">b</pre>');
  const 第一 = 洗后.indexOf("python") >= 0;
  const 第二 = 洗后.indexOf("rust") >= 0;
  if (!第一 || !第二) throw new Error(`两个 pre 的语言该各归各：${洗后}`);
});

测("认不出语言的代码块照样留着（只是不带 data-language）", () => {
  const 洗后 = 洗("<pre>随便写点什么</pre>");
  含(洗后, "<pre", "pre 还在");
  含(洗后, "随便写点什么", "内容还在");
});

测("`找语言线索` 单测：几种常见类名", () => {
  等(找语言线索('<pre class="language-ts">'), "typescript", "language-");
  等(找语言线索('<pre data-language="rust">'), "rust", "data-language");
  等(找语言线索('<code class="lang-py">'), "python", "lang-");
  等(找语言线索("<pre>没有线索</pre>"), null, "没有线索");
});

测("⚠️ `语言名表` 只能换名字，不能引进别处不认的语言 id", () => {
  // ⚠️ 2026-09-28 补的第二张表（`python` / `rust` 这些长名不是扩展名，查
  // `扩展名表` 一个都落空）。这条断言就是它的护栏：值必须**都**在
  // `扩展名表` 里出现过，所以这张表加不出一个新的、`lang-guess` 那边不认识的
  // 语言 id（比如 `matlab` —— refractor 里就没有那个 id）。
  const 认得的 = new Set(Object.values(扩展名表));
  const 坏的 = Object.entries(语言名表)
    .filter(([, 语言]) => !认得的.has(语言))
    .map(([名, 语言]) => `${名} → ${语言}`);
  if (坏的.length) throw new Error(`有 ${坏的.length} 条指向别处没有的 id：${坏的.join("、")}`);
});

测("⚠️ 每个值都得认得出（长名与短名给同一个答案）", () => {
  // ⚠️ `.sh` 走 `扩展名表`、`class="lang-sh"` 也得给同一个答案，
  //    否则同一段代码"从文件打开是 bash、粘进来是别的色"。
  等(找语言线索('<pre class="language-sh">'), 按扩展名("sh"), "sh 两路一致");
  等(找语言线索('<pre class="lang-bash">'), 按扩展名("sh"), "bash 也是那个");
});

/* ── 五、边界 ───────────────────────────────────────────────────────── */

组("五、边界");

测("空串进、空串出（不抛）", () => {
  等(洗(""), "", "空串");
});

测("全是垃圾时结果为空串（调用方自己判）", () => {
  等(洗("<script>alert(1)</script>"), "", "只有 script");
});

测("纯文本原样出来", () => {
  等(洗("就是一段字"), "就是一段字", "没有标签");
});

测("⚠️ `<table>` 只留结构不留样式", () => {
  const 洗后 = 洗('<table style="width:100%"><tr><td colspan="2" style="color:red">甲</td></tr></table>');
  含(洗后, "<table>", "table");
  含(洗后, 'colspan="2"', "colspan 留");
  不含(洗后, "color", "样式丢");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
