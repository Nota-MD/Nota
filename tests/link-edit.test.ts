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
  建链接事务,
  摘链接事务,
  摘源文链接,
  源文链接,
  源文链接区间,
  链接区间,
  链接落点,
} from "../src/editor/link-edit";

/* ── 极小的测试工装（与 `select.test.ts` 同一套长相）───────────────────── */

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

function 真(条件: unknown, 说明: string): void {
  if (!条件) throw new Error(说明);
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

const 链接型 = schema.marks.link!;

function 段(...内容: PMNode[]): PMNode {
  return schema.node("paragraph", null, 内容);
}

function 文(字: string, 标记: readonly import("@milkdown/kit/prose/model").Mark[] = []): PMNode {
  return schema.text(字, 标记);
}

function 链(字: string, 地址: string): PMNode {
  return schema.text(字, [链接型.create({ href: 地址 })]);
}

function 文档(...块: PMNode[]): PMNode {
  return schema.node("doc", null, 块);
}

function 状态(doc: PMNode): EditorState {
  return EditorState.create({ schema, doc });
}

/* ── 第一组：纯字符串的判据 ───────────────────────────────────────────── */

组("一、链接落点 / 源文链接 / 摘源文链接：地址空或危险时只落纯文字");

测("名称与地址都在 → 一条正常的链接", () => {
  const 落 = 链接落点("Nota 官网", "https://nota.app");
  等(落.label, "Nota 官网", "显示名称");
  等(落.href, "https://nota.app", "地址");
});

测("两头的空白切掉（用户手打的框里常带空格）", () => {
  const 落 = 链接落点("  看这里  ", "  https://a.b/x  ");
  等(落.label, "看这里", "名称");
  等(落.href, "https://a.b/x", "地址");
});

测("名称为空 → **用地址顶上**（空名字的链接在屏幕上点不着也看不见）", () => {
  const 落 = 链接落点("", "https://a.b");
  等(落.label, "https://a.b", "名字");
  等(落.href, "https://a.b", "地址");
});

测("地址为空 → `href` 给 null（落纯文字，不写一个点不动的空链接）", () => {
  const 落 = 链接落点("看这里", "   ");
  等(落.label, "看这里", "名字");
  等(落.href, null, "地址");
});

测("危险协议 → `href` 给 null（那道闸与 `url-link.ts` 是同一个答案）", () => {
  for (const 坏 of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "file:///etc/passwd"]) {
    等(链接落点("点我", 坏).href, null, 坏);
  }
});

测("危险协议**藏不掉**（中间塞制表符/换行也拦得住——浏览器解析 href 时会吃掉它们）", () => {
  // ⚠️ 这一条是 `url-link.ts::危险协议` 那段注释里说的第一种绕过写法。
  等(链接落点("点我", "java\tscript:alert(1)").href, null, "制表符");
  等(链接落点("点我", "java\nscript:alert(1)").href, null, "换行");
});

测("正常协议照旧放行（包括自家锚点与 mailto）", () => {
  for (const 好 of ["https://a.b", "http://a.b", "#本页锚点", "mailto:a@b.c", "/相对/路径.md"]) {
    等(链接落点("点我", 好).href, 好, 好);
  }
});

测("两头都空 → 名字是空串（调用方据此什么都不做）", () => {
  等(链接落点("   ", "  ").label, "", "名字");
});

测("源文链接：正常那一条写成 `[名称](地址)`，地址危险/为空时只写名称", () => {
  等(源文链接("Nota", "https://a.b"), "[Nota](https://a.b)", "正常");
  等(源文链接("点我", "javascript:alert(1)"), "点我", "危险协议");
  等(源文链接("Nota", ""), "Nota", "空地址");
  等(源文链接("", "https://a.b"), "[https://a.b](https://a.b)", "名称空 → 地址顶上去");
});

测("摘源文链接：一对中括号与圆括号连同地址一起摘掉，文字留着", () => {
  等(摘源文链接("[Nota](https://a.b)"), "Nota", "最普通那一条");
  等(摘源文链接("见 [Nota](https://a.b) 首页"), "见 Nota 首页", "夹在句子里");
  等(摘源文链接("[甲](u1) 与 [乙](u2)"), "甲 与 乙", "一句话里两条");
  等(摘源文链接("没有链接"), "没有链接", "本来就不是链接 → 一个字不动");
});

/* ── 第二组：源码模式那一层的区间 ─────────────────────────────────────── */

组("二、源文链接区间：光标在哪一段里算「在这条链接里」");

const 源 = "见 [Nota](https://a.b) 首页";
//  `见 ` = 0..1，`[Nota](https://a.b)` = **[2, 21)**，` 首页` = [21, 24)

测("光标在 `[名称](地址)` 里面 → 就是它", () => {
  const 区 = 源文链接区间(源, 8);
  等(区?.from, 2, "起点");
  等(区?.to, 21, "终点");
  等(区?.label, "Nota", "名称");
  等(区?.href, "https://a.b", "地址");
});

测("两端都算（`from` 那一格与 `to` 那一格都算在里面）", () => {
  // ⚠️ 半开区间 `[from, to)` 里 `to` 那一格**不在**区间内，这里是**故意**放宽的：
  //    光标贴着链接尾巴、或者落在它开头那一个字符上，都是"在这条链接里"——
  //    与 `select.ts::挑词` 那条"贴着词尾也算"同一个理由。
  等(源文链接区间(源, 2)?.label, "Nota", "起点那一格");
  等(源文链接区间(源, 21)?.label, "Nota", "终点那一格（紧随其后的那个空格上）");
});

测("不在任何链接里 → null", () => {
  等(源文链接区间(源, 0), null, "`见` 上");
  等(源文链接区间(源, 1), null, "空格上");
  等(源文链接区间(源, 22), null, "`首` 上");
  等(源文链接区间(源, 23), null, "`页` 上");
  等(源文链接区间(源, 999), null, "越界（夹到末尾，那里也不是链接）");
});

测("位置越界不抛（夹回两端）", () => {
  等(源文链接区间(源, -5), null, "负数夹到 0");
  等(源文链接区间("[甲](u)", 999)?.label, "甲", "超出长度夹到末尾");
});

测("一句话里两条 → 各回各的", () => {
  const 文 = "[甲](u1) 与 [乙](u2)";
  //  `[甲](u1)` = 0..7、` 与 ` = 8..10、`[乙](u2)` = 11..18
  等(源文链接区间(文, 3)?.label, "甲", "第一条");
  等(源文链接区间(文, 14)?.label, "乙", "第二条");
  等(源文链接区间(文, 9), null, "中间的空隙");
});

测("认不出来的一律当普通文字（嵌套 / 地址里带空格 / 跨行）", () => {
  等(源文链接区间("[甲[乙]](u)", 1), null, "嵌套中括号");
  等(源文链接区间("[甲](u v)", 1), null, "地址里有空格");
  等(源文链接区间("[甲](\nu)", 1), null, "地址里换行");
});

测("空文 / 光秃秃的文字 → null", () => {
  等(源文链接区间("", 0), null, "空文");
  等(源文链接区间("看这里", 1), null, "普通文字");
});

/* ── 第三组：ProseMirror 层的区间 ─────────────────────────────────────── */

组("三、链接区间：块内偏移 → 文档位置");

测("光标在那条链接里 → 整条（含它显示的那几个字）", () => {
  const doc = 文档(段(文("见 "), 链("Nota", "https://a.b"), 文(" 首页")));
  //  段落内容从位置 1 起：`见 ` = 1..2、链接 = 3..7、` 首页` = 7..9
  const 区 = 链接区间(doc, 5);
  等(区?.from, 3, "起点");
  等(区?.to, 7, "终点");
  等(区?.label, "Nota", "名称（取的是文档里那几个字）");
  等(区?.href, "https://a.b", "地址");
});

测("两端都算（起点那一格、终点那一格）", () => {
  const doc = 文档(段(链("Nota", "https://a.b")));
  等(链接区间(doc, 1)?.label, "Nota", "起点");
  等(链接区间(doc, 5)?.label, "Nota", "终点（段落末尾那一格）");
});

测("不在链接里 → null", () => {
  const doc = 文档(段(文("看这里")));
  等(链接区间(doc, 2), null, "普通文字上");
  等(链接区间(doc, 0), null, "doc 那一层（不是文本块）");
});

测("空段落 / 空文档 → null", () => {
  等(链接区间(文档(段()), 1), null, "空段落");
});

测("代码块 → null（那一段的光标归块里那颗 CodeMirror）", () => {
  const doc = 文档(schema.node("code_block", null, [schema.text("[Nota](https://a.b)")]));
  等(链接区间(doc, 5), null, "代码块里");
});

测("一条链接被别的标记切成两个文本节点时**合并成一条**（否则只改掉半截）", () => {
  // 段落 = [「No」带着 链接+加粗][「ta」带着 链接]：文档里是两个节点、
  // 屏幕上是一条链接。
  const doc = 文档(段(文("No", [链接型.create({ href: "https://a.b" }), schema.marks.strong!.create()]), 链("ta", "https://a.b")));
  const 区 = 链接区间(doc, 3);
  等(区?.from, 1, "起点");
  等(区?.to, 5, "终点（两个节点一起）");
  等(区?.label, "Nota", "名称");
});

测("两条地址不同的链接挨着：光标落在交界那一格 → 算**前一条**（两端都算的左端优先）", () => {
  const doc = 文档(段(链("甲", "u1"), 链("乙", "u2")));
  //  `[甲]` = 1..2、`[乙]` = 2..3
  等(链接区间(doc, 1)?.href, "u1", "第一条里");
  等(链接区间(doc, 3)?.href, "u2", "第二条里");
  等(链接区间(doc, 2)?.href, "u1", "交界那一格 → 前一条");
});

测("行内原子占一个位置，不许把偏移算错", () => {
  // 段落 = [atom][链接「Nota」]：原子占位置 1，链接从位置 2 起。
  const doc = 文档(段(schema.node("atom"), 链("Nota", "https://a.b")));
  等(链接区间(doc, 3)?.from, 2, "起点（若原子少算一个位置，这里会偏一格）");
  等(链接区间(doc, 3)?.to, 6, "终点");
});

/* ── 第四组：两个事务 ─────────────────────────────────────────────────── */

组("四、建链接事务 / 摘链接事务：派完那棵树长什么样");

测("把一段普通文字换成一条链接", () => {
  const tr = 建链接事务(状态(文档(段(文("点这里")))), { from: 1, to: 4 }, "Nota", "https://a.b");
  真(tr !== null, "该派得出事务");
  const 子 = tr!.doc.firstChild!.firstChild!;
  等(子.text, "Nota", "文字换成了显示名称");
  等(String(子.marks[0]?.attrs.href), "https://a.b", "带上了地址");
});

测("空光标处插一条新的（一个字都还没有的时候）", () => {
  const tr = 建链接事务(状态(文档(段())), { from: 1, to: 1 }, "Nota", "https://a.b");
  真(tr !== null, "该派得出事务");
  const 子 = tr!.doc.firstChild!.firstChild!;
  等(子.text, "Nota", "插进去的是显示名称");
  真(子.marks.some((m) => m.type === 链接型), "是链接、不是一个空标记");
});

测("派完不留**存储标记**（不然紧接着敲的下一个字也带链接）", () => {
  const tr = 建链接事务(状态(文档(段())), { from: 1, to: 1 }, "Nota", "https://a.b");
  const 留的 = tr!.storedMarks ?? [];
  真(!留的.some((m) => m.type === 链接型), "存储标记里不许有链接");
});

测("地址危险 → **落纯文字**（用户填的字一个字不丢，链接一个都不写）", () => {
  const tr = 建链接事务(状态(文档(段())), { from: 1, to: 1 }, "点我", "javascript:alert(1)");
  真(tr !== null, "该派得出事务");
  const 子 = tr!.doc.firstChild!.firstChild!;
  等(子.text, "点我", "文字照落");
  等(子.marks.length, 0, "一个标记都不许带");
});

测("地址为空 → 同上（纯文字）", () => {
  const tr = 建链接事务(状态(文档(段())), { from: 1, to: 1 }, "点我", "  ");
  const 子 = tr!.doc.firstChild!.firstChild!;
  等(子.text, "点我", "文字");
  等(子.marks.length, 0, "标记");
});

测("两头都空 → 不派事务（`null`）", () => {
  等(建链接事务(状态(文档(段())), { from: 1, to: 1 }, "  ", "  "), null, "没什么可落的");
});

测("名称空时地址顶上去（写进去的就是地址那几个字）", () => {
  const tr = 建链接事务(状态(文档(段())), { from: 1, to: 1 }, "", "https://a.b");
  等(tr!.doc.firstChild!.firstChild!.text, "https://a.b", "名字");
});

测("摘链接事务：**文字一个字节不动**，掉的只有标记", () => {
  const doc = 文档(段(链("Nota", "https://a.b")));
  const tr = 摘链接事务(状态(doc), { from: 1, to: 5 });
  真(tr !== null, "该派得出事务");
  const 子 = tr!.doc.firstChild!.firstChild!;
  等(子.text, "Nota", "文字照旧");
  等(子.marks.length, 0, "标记摘干净了");
});

测("摘链接事务：空区间 → 不派事务", () => {
  等(摘链接事务(状态(文档(段(链("Nota", "u")))), { from: 1, to: 1 }), null, "空区间");
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log("\n" + "─".repeat(64));
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log("失败的：");
  for (const n of 败的) console.log(`  - ${n}`);
  process.exit(1);
}
