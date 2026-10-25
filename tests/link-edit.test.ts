/**
 * `src/editor/link-edit.ts`（插入 / 编辑 / 去掉链接的判据，`docs/07` 第 96 ＋ 102 项，
 * 2026-10-07）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * npx esbuild tests/link-edit.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/link-edit.mjs
 * node /tmp/nota-测试/link-edit.mjs
 * ```
 *
 * ⚠️ **两个开关都不要**：这条链上一个 `@/…` 都没有（`link-edit.ts` 只从
 * `./create-types`、`./url-link` 与 `@milkdown/kit/…` 进），也没有一个 svg。
 * 所以它就是 `docs/06` §6.3 那个 `for` 循环里的普通一份。
 *
 * # 测的是哪三层
 *
 * | 组 | 吃什么 | 用例在哪 |
 * |---|---|---|
 * | 一：`链接落点` / `源文链接` / `摘源文链接` | **纯字符串** | 第一组 |
 * | 二：`源文链接区间` | 一段纯文本 ＋ 一个偏移（源码模式那一路） | 第二组 |
 * | 三：`链接区间` / `建链接事务` / `摘链接事务` | 一棵 **ProseMirror 文档** | 第三、四组 |
 *
 * ⚠️ **第三、四组能建真 `EditorState`**（`prosemirror-state` 是纯的，不要 DOM），
 * 所以事务**真的派了一遍**、看的是派完之后那棵树——这比"参数传对了没有"结实得多。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **框弹出来了没有、点链接那一下有没有反应**：`装链接` / `摘链接` 要一份真
 *   `EditorView`（`editor.action` 得拿到 `editorViewCtx`），本仓没有 jsdom
 *   （见 `tests/fake-dom.ts` 文件头）。**开窗那一次在 `docs/06` §5.59**。
 * - **`Ctrl`＋单击真的叫起了系统浏览器**：那是 Tauri 的 `opener`，容器里量不出来。
 * - **源码模式那一侧的 `applyCommand`**：它要真的 CodeMirror（也要 DOM）；这里测的是
 *   它调的那几个纯函数。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";

import {
  createLinkTransaction,
  removeLinkTransaction,
  removeSourceLink,
  sourceLink,
  sourceLinkRange,
  linkRange,
  linkDropPoint,
} from "../src/editor/link-edit";

/* ── 极小的测试工装（与 `select.test.ts` 同一套长相）───────────────────── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

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

function assertValue(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

/* ── 一颗够用的真 Schema（段落 ＋ 链接 ＋ 加粗 ＋ 代码块 ＋ 行内原子）────── */

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    // 代码块（`spec.code`）——`链接区间` 认了它就返回 `null`（那一段的选区归
    // 块里那颗 CodeMirror 管，见 `link-edit.ts` 里那条出口）。
    code_block: { content: "text*", group: "block", marks: "", code: true, defining: true },
    // 行内原子（图片那一档）：在文档里占**一个**位置。
    atom: { group: "inline", inline: true, atom: true, selectable: false },
  },
  marks: {
    // ⚠️ `inclusive: false` 是上游 `linkSchema` 的写法（光标贴着链接尾巴敲字
    // 不该继续带链接），照抄过来——判据一样，测出来的才是真的那份。
    link: { attrs: { href: {} }, inclusive: false },
    strong: {},
  },
});

const linkType = schema.marks.link!;

function paragraph2(...content: PMNode[]): PMNode {
  return schema.node("paragraph", null, content);
}

function text4(character2: string, mark: readonly import("@milkdown/kit/prose/model").Mark[] = []): PMNode {
  return schema.text(character2, mark);
}

function chain(character2: string, address: string): PMNode {
  return schema.text(character2, [linkType.create({ href: address })]);
}

function document(...block: PMNode[]): PMNode {
  return schema.node("doc", null, block);
}

function state(doc: PMNode): EditorState {
  return EditorState.create({ schema, doc });
}

/* ── 第一组：纯字符串的判据 ───────────────────────────────────────────── */

group("一、链接落点 / 源文链接 / 摘源文链接：地址空或危险时只落纯文字");

testCase("名称与地址都在 → 一条正常的链接", () => {
  const drop = linkDropPoint("Nota 官网", "https://nota.app");
  equal(drop.label, "Nota 官网", "显示名称");
  equal(drop.href, "https://nota.app", "地址");
});

testCase("两头的空白切掉（用户手打的框里常带空格）", () => {
  const drop = linkDropPoint("  看这里  ", "  https://a.b/x  ");
  equal(drop.label, "看这里", "名称");
  equal(drop.href, "https://a.b/x", "地址");
});

testCase("名称为空 → **用地址顶上**（空名字的链接在屏幕上点不着也看不见）", () => {
  const drop = linkDropPoint("", "https://a.b");
  equal(drop.label, "https://a.b", "名字");
  equal(drop.href, "https://a.b", "地址");
});

testCase("地址为空 → `href` 给 null（落纯文字，不写一个点不动的空链接）", () => {
  const drop = linkDropPoint("看这里", "   ");
  equal(drop.label, "看这里", "名字");
  equal(drop.href, null, "地址");
});

testCase("危险协议 → `href` 给 null（那道闸与 `url-link.ts` 是同一个答案）", () => {
  for (const broken of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "file:///etc/passwd"]) {
    equal(linkDropPoint("点我", broken).href, null, broken);
  }
});

testCase("危险协议**藏不掉**（中间塞制表符/换行也拦得住——浏览器解析 href 时会吃掉它们）", () => {
  // ⚠️ 这一条是 `url-link.ts::危险协议` 那段注释里说的第一种绕过写法。
  equal(linkDropPoint("点我", "java\tscript:alert(1)").href, null, "制表符");
  equal(linkDropPoint("点我", "java\nscript:alert(1)").href, null, "换行");
});

testCase("正常协议照旧放行（包括自家锚点与 mailto）", () => {
  for (const good of ["https://a.b", "http://a.b", "#本页锚点", "mailto:a@b.c", "/相对/路径.md"]) {
    equal(linkDropPoint("点我", good).href, good, good);
  }
});

testCase("两头都空 → 名字是空串（调用方据此什么都不做）", () => {
  equal(linkDropPoint("   ", "  ").label, "", "名字");
});

testCase("源文链接：正常那一条写成 `[名称](地址)`，地址危险/为空时只写名称", () => {
  equal(sourceLink("Nota", "https://a.b"), "[Nota](https://a.b)", "正常");
  equal(sourceLink("点我", "javascript:alert(1)"), "点我", "危险协议");
  equal(sourceLink("Nota", ""), "Nota", "空地址");
  equal(sourceLink("", "https://a.b"), "[https://a.b](https://a.b)", "名称空 → 地址顶上去");
});

testCase("摘源文链接：一对中括号与圆括号连同地址一起摘掉，文字留着", () => {
  equal(removeSourceLink("[Nota](https://a.b)"), "Nota", "最普通那一条");
  equal(removeSourceLink("见 [Nota](https://a.b) 首页"), "见 Nota 首页", "夹在句子里");
  equal(removeSourceLink("[甲](u1) 与 [乙](u2)"), "甲 与 乙", "一句话里两条");
  equal(removeSourceLink("没有链接"), "没有链接", "本来就不是链接 → 一个字不动");
});

/* ── 第二组：源码模式那一层的区间 ─────────────────────────────────────── */

group("二、源文链接区间：光标在哪一段里算「在这条链接里」");

const source3 = "见 [Nota](https://a.b) 首页";
//  `见 ` = 0..1，`[Nota](https://a.b)` = **[2, 21)**，` 首页` = [21, 24)

testCase("光标在 `[名称](地址)` 里面 → 就是它", () => {
  const area = sourceLinkRange(source3, 8);
  equal(area?.from, 2, "起点");
  equal(area?.to, 21, "终点");
  equal(area?.label, "Nota", "名称");
  equal(area?.href, "https://a.b", "地址");
});

testCase("两端都算（`from` 那一格与 `to` 那一格都算在里面）", () => {
  // ⚠️ 半开区间 `[from, to)` 里 `to` 那一格**不在**区间内，这里是**故意**放宽的：
  //    光标贴着链接尾巴、或者落在它开头那一个字符上，都是"在这条链接里"——
  //    与 `select.ts::挑词` 那条"贴着词尾也算"同一个理由。
  equal(sourceLinkRange(source3, 2)?.label, "Nota", "起点那一格");
  equal(sourceLinkRange(source3, 21)?.label, "Nota", "终点那一格（紧随其后的那个空格上）");
});

testCase("不在任何链接里 → null", () => {
  equal(sourceLinkRange(source3, 0), null, "`见` 上");
  equal(sourceLinkRange(source3, 1), null, "空格上");
  equal(sourceLinkRange(source3, 22), null, "`首` 上");
  equal(sourceLinkRange(source3, 23), null, "`页` 上");
  equal(sourceLinkRange(source3, 999), null, "越界（夹到末尾，那里也不是链接）");
});

testCase("位置越界不抛（夹回两端）", () => {
  equal(sourceLinkRange(source3, -5), null, "负数夹到 0");
  equal(sourceLinkRange("[甲](u)", 999)?.label, "甲", "超出长度夹到末尾");
});

testCase("一句话里两条 → 各回各的", () => {
  const text4 = "[甲](u1) 与 [乙](u2)";
  //  `[甲](u1)` = 0..7、` 与 ` = 8..10、`[乙](u2)` = 11..18
  equal(sourceLinkRange(text4, 3)?.label, "甲", "第一条");
  equal(sourceLinkRange(text4, 14)?.label, "乙", "第二条");
  equal(sourceLinkRange(text4, 9), null, "中间的空隙");
});

testCase("认不出来的一律当普通文字（嵌套 / 地址里带空格 / 跨行）", () => {
  equal(sourceLinkRange("[甲[乙]](u)", 1), null, "嵌套中括号");
  equal(sourceLinkRange("[甲](u v)", 1), null, "地址里有空格");
  equal(sourceLinkRange("[甲](\nu)", 1), null, "地址里换行");
});

testCase("空文 / 光秃秃的文字 → null", () => {
  equal(sourceLinkRange("", 0), null, "空文");
  equal(sourceLinkRange("看这里", 1), null, "普通文字");
});

/* ── 第三组：ProseMirror 层的区间 ─────────────────────────────────────── */

group("三、链接区间：块内偏移 → 文档位置");

testCase("光标在那条链接里 → 整条（含它显示的那几个字）", () => {
  const doc = document(paragraph2(text4("见 "), chain("Nota", "https://a.b"), text4(" 首页")));
  //  段落内容从位置 1 起：`见 ` = 1..2、链接 = 3..7、` 首页` = 7..9
  const area = linkRange(doc, 5);
  equal(area?.from, 3, "起点");
  equal(area?.to, 7, "终点");
  equal(area?.label, "Nota", "名称（取的是文档里那几个字）");
  equal(area?.href, "https://a.b", "地址");
});

testCase("两端都算（起点那一格、终点那一格）", () => {
  const doc = document(paragraph2(chain("Nota", "https://a.b")));
  equal(linkRange(doc, 1)?.label, "Nota", "起点");
  equal(linkRange(doc, 5)?.label, "Nota", "终点（段落末尾那一格）");
});

testCase("不在链接里 → null", () => {
  const doc = document(paragraph2(text4("看这里")));
  equal(linkRange(doc, 2), null, "普通文字上");
  equal(linkRange(doc, 0), null, "doc 那一层（不是文本块）");
});

testCase("空段落 / 空文档 → null", () => {
  equal(linkRange(document(paragraph2()), 1), null, "空段落");
});

testCase("代码块 → null（那一段的光标归块里那颗 CodeMirror）", () => {
  const doc = document(schema.node("code_block", null, [schema.text("[Nota](https://a.b)")]));
  equal(linkRange(doc, 5), null, "代码块里");
});

testCase("一条链接被别的标记切成两个文本节点时**合并成一条**（否则只改掉半截）", () => {
  // 段落 = [「No」带着 链接+加粗][「ta」带着 链接]：文档里是两个节点、
  // 屏幕上是一条链接。
  const doc = document(paragraph2(text4("No", [linkType.create({ href: "https://a.b" }), schema.marks.strong!.create()]), chain("ta", "https://a.b")));
  const area = linkRange(doc, 3);
  equal(area?.from, 1, "起点");
  equal(area?.to, 5, "终点（两个节点一起）");
  equal(area?.label, "Nota", "名称");
});

testCase("两条地址不同的链接挨着：光标落在交界那一格 → 算**前一条**（两端都算的左端优先）", () => {
  const doc = document(paragraph2(chain("甲", "u1"), chain("乙", "u2")));
  //  `[甲]` = 1..2、`[乙]` = 2..3
  equal(linkRange(doc, 1)?.href, "u1", "第一条里");
  equal(linkRange(doc, 3)?.href, "u2", "第二条里");
  equal(linkRange(doc, 2)?.href, "u1", "交界那一格 → 前一条");
});

testCase("行内原子占一个位置，不许把偏移算错", () => {
  // 段落 = [atom][链接「Nota」]：原子占位置 1，链接从位置 2 起。
  const doc = document(paragraph2(schema.node("atom"), chain("Nota", "https://a.b")));
  equal(linkRange(doc, 3)?.from, 2, "起点（若原子少算一个位置，这里会偏一格）");
  equal(linkRange(doc, 3)?.to, 6, "终点");
});

/* ── 第四组：两个事务 ─────────────────────────────────────────────────── */

group("四、建链接事务 / 摘链接事务：派完那棵树长什么样");

testCase("把一段普通文字换成一条链接", () => {
  const tr = createLinkTransaction(state(document(paragraph2(text4("点这里")))), { from: 1, to: 4 }, "Nota", "https://a.b");
  assertValue(tr !== null, "该派得出事务");
  const child3 = tr!.doc.firstChild!.firstChild!;
  equal(child3.text, "Nota", "文字换成了显示名称");
  equal(String(child3.marks[0]?.attrs.href), "https://a.b", "带上了地址");
});

testCase("空光标处插一条新的（一个字都还没有的时候）", () => {
  const tr = createLinkTransaction(state(document(paragraph2())), { from: 1, to: 1 }, "Nota", "https://a.b");
  assertValue(tr !== null, "该派得出事务");
  const child3 = tr!.doc.firstChild!.firstChild!;
  equal(child3.text, "Nota", "插进去的是显示名称");
  assertValue(child3.marks.some((m) => m.type === linkType), "是链接、不是一个空标记");
});

testCase("派完不留**存储标记**（不然紧接着敲的下一个字也带链接）", () => {
  const tr = createLinkTransaction(state(document(paragraph2())), { from: 1, to: 1 }, "Nota", "https://a.b");
  const keepOf = tr!.storedMarks ?? [];
  assertValue(!keepOf.some((m) => m.type === linkType), "存储标记里不许有链接");
});

testCase("地址危险 → **落纯文字**（用户填的字一个字不丢，链接一个都不写）", () => {
  const tr = createLinkTransaction(state(document(paragraph2())), { from: 1, to: 1 }, "点我", "javascript:alert(1)");
  assertValue(tr !== null, "该派得出事务");
  const child3 = tr!.doc.firstChild!.firstChild!;
  equal(child3.text, "点我", "文字照落");
  equal(child3.marks.length, 0, "一个标记都不许带");
});

testCase("地址为空 → 同上（纯文字）", () => {
  const tr = createLinkTransaction(state(document(paragraph2())), { from: 1, to: 1 }, "点我", "  ");
  const child3 = tr!.doc.firstChild!.firstChild!;
  equal(child3.text, "点我", "文字");
  equal(child3.marks.length, 0, "标记");
});

testCase("两头都空 → 不派事务（`null`）", () => {
  equal(createLinkTransaction(state(document(paragraph2())), { from: 1, to: 1 }, "  ", "  "), null, "没什么可落的");
});

testCase("名称空时地址顶上去（写进去的就是地址那几个字）", () => {
  const tr = createLinkTransaction(state(document(paragraph2())), { from: 1, to: 1 }, "", "https://a.b");
  equal(tr!.doc.firstChild!.firstChild!.text, "https://a.b", "名字");
});

testCase("摘链接事务：**文字一个字节不动**，掉的只有标记", () => {
  const doc = document(paragraph2(chain("Nota", "https://a.b")));
  const tr = removeLinkTransaction(state(doc), { from: 1, to: 5 });
  assertValue(tr !== null, "该派得出事务");
  const child3 = tr!.doc.firstChild!.firstChild!;
  equal(child3.text, "Nota", "文字照旧");
  equal(child3.marks.length, 0, "标记摘干净了");
});

testCase("摘链接事务：空区间 → 不派事务", () => {
  equal(removeLinkTransaction(state(document(paragraph2(chain("Nota", "u")))), { from: 1, to: 1 }), null, "空区间");
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log("\n" + "─".repeat(64));
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log("失败的：");
  for (const n of failed) console.log(`  - ${n}`);
  process.exit(1);
}
