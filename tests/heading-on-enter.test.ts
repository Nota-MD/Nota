/**
 * `src/editor/heading-on-enter.ts` 那两份**纯算术**的测试集：
 * `算装饰条目`（按文档扫出"该装饰的区间"）与 `建装饰集`（把区间拼成装饰）。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/heading-on-enter.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-heading-on-enter/heading-on-enter.test.mjs
 * node /tmp/nota-heading-on-enter/heading-on-enter.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 为什么单开一份（而不是塞进 `mark-hint.test.ts`）
 *
 * 那一份测的是行内标记（`**` 那一条），这一份测的是**块首那几个井号**——
 * 同一颗 Schema、同一个工装长相，但被问的是另一个插件，混在一起以后谁也
 * 说不清"这一条失败该去看哪儿"。
 *
 * # 这份测试是为什么写的（2026-09-30 重写）
 *
 * 用户当天报「不开启严格模式下如果没有空格出现如此问题」，并把要的长相
 * 说清楚了：「**类似 `# 你好`。就是不回车只是显示加粗，回车变成标题。**」
 *
 * 于是 `#你好` 和 `# 你好` **从这天起走完全同一条路**：没按回车时都是段落、
 * 井号后面那段文字**只加粗**；按下回车都**变成标题块**（字号这时才跳）。
 *
 * ⚠️ **上一版测试测的是另一样东西，别照旧稿抄**。它钉的是"正在写的那一段
 * 先不放大"那三行判据（`建装饰集` 收一个 `正在写的段` 参数、`待装饰` 里有
 * `待成块`/`级数`）。那套判据连同它服务的长相被用户同一句话推翻了，整个
 * 删掉——来龙去脉在 `heading-on-enter.ts` 文件头「这一版推翻了什么」。
 *
 * 现在这份钉的是两件事：
 *
 * 1. **哪些区间进装饰**——区间必须从 `atx.ts::atxPrefix` **同一个匹配**里
 *    算出来。第 5 组那几条（`#   标题` 多一颗空格）就是这条的现场：自己另数
 *    一遍井号会把中间那段空白留在加粗范围里（少想一步，多一个分叉）。
 * 2. **档位只影响"认不认"**——严格档下 `#你好` **一条都不该有**（它不是
 *    标题，装饰、成块两样都不参与）；宽松档下它和 `# 你好` 一模一样。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **回车那一下它碰不到**。`回车成标题` 要一份真的 `EditorView`（要
 *   `editable`、要能 `dispatch` 一笔事务），这里没有视图——那是 `docs/06`
 *   开窗目检的事。这里测的是**判据**（谁该被加粗），不是"按了回车真的成块
 *   了、真的开出了下一段"。
 * - 也证明不了：字号与字重（那在 `marks.css` 的规则里）、井号本身有没有被碰、
 *   以及"那一行会不会横向跳一下"。一律是目检的事。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { MarkType, Node as PMNode } from "@milkdown/kit/prose/model";
import type { Decoration } from "@milkdown/kit/prose/view";
import { createDecorationCollection, computeDecorationsItem } from "../src/editor/heading-on-enter";

/* ── 极小的测试工装（与 `mark-hint.test.ts` 同一套长相）───────────────── */

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

function assertion(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/* ── 一颗够用的真 Schema（段落 ＋ 一个行内原子 ＋ 加粗）───────────────── */

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    // 行内原子的形状（`math_inline` / `image` 都是这一档）：占**一个**位置，
    // 带不了 mark。第 1 组最后那一条用它验"第一个孩子不是纯文本就不认"。
    atom: { group: "inline", inline: true, atom: true, selectable: false },
    // 标题块。⚠️ 这一版新增：`#你好` 现在**真的会**变成它（回车那一下），
    // 而"已经不是段落的不该再进装饰"是这一版判"写完了没有"的方式。
    heading: { content: "inline*", defining: true, attrs: { level: { default: 1 } } },
  },
  marks: {
    strong: {},
  },
});

const strong = schema.marks.strong as MarkType;

/**
 * 拼一段：`片段` 里每项是"文字 + 带哪些 mark"。
 *
 * ⚠️ 文本节点**只能**走 `schema.text()`（`schema.nodes.text.create(...)` 会抛
 * `NodeType.create can't construct text nodes`）——与 `mark-hint.test.ts` 同一句。
 */
function oneParagraph(fragment: readonly (readonly [string, readonly MarkType[]])[]): PMNode {
  const block: PMNode[] = fragment.map(([character2, mark]) => schema.text(character2, mark.map((m) => m.create())));
  return schema.nodes.paragraph.create(null, block);
}

/** 一行字、不带标记那种段落。 */
function paragraphGroup(character2: string): PMNode {
  return oneParagraph([[character2, []]]);
}

/** 一棵真标题块（`#你好` 按过回车之后的样子），用来验"已经不认它了"。 */
function markTitleParagraph(level2: number, character2: string): PMNode {
  return schema.nodes.heading.create({ level: level2 }, character2 ? schema.text(character2) : []);
}

function combine2(...paragraphs: readonly PMNode[]): PMNode {
  return schema.nodes.doc.create(null, paragraphs.slice());
}

/**
 * 把装饰集读成好读的字符串，失败信息里一眼能看出窗口挪到哪儿去了：
 * `3-5:nota-heading-pending`。
 *
 * ⚠️ 那个 `as unknown as` 是**必须**的：`Decoration.type` 在 `prosemirror-view`
 * 里声明成基类 `DecorationType`，而 `attrs` 只在 `InlineType` 上有——两边是同一
 * 个东西，只是类型没往下收。别为了"没有 cast"去自己造一份 attrs。
 *
 * ⚠️ 2026-09-30 起这里**不再读 `data-lax-level`**：那个属性跟 `.nota-lax-heading`
 * 一起没了。现在整棵树上一共只有一个类名，级数（`#` 还是 `##`）**不进装饰**——
 * 因为两种写法都是"只加粗"，字号要等到成块之后由 `h1`~`h6` 自己排。
 */
function setAboveOf(collection: ReturnType<typeof createDecorationCollection>): string[] {
  return collection.find().map((d: Decoration) => {
    const attribute = (d.type as unknown as { attrs?: Record<string, unknown> | null }).attrs ?? {};
    return `${d.from}-${d.to}:${String(attribute["class"] ?? "")}`;
  });
}

/** 把条目读成好读的字符串（就是区间本身，`起-止`）。 */
function items(doc: PMNode, strict: boolean): string[] {
  return computeDecorationsItem(doc, strict).map((item4) => `${item4.start5}-${item4.end2}`);
}

/* ── 用例 ─────────────────────────────────────────────────────────────── */

group("一、扫全篇：哪些区间算「标题写法」（宽松档，默认）");

//  位置: 0   1   2   3   4   5
//        │   #     你   好   │
//        └───── 段落 ────────┘
//  `# 你好` 的正文从位置 3 起（`#` ＋ 一颗空格 = 两格前缀）。
testCase("`# 你好`：范围只盖正文，井号不碰", () => {
  equal(items(combine2(paragraphGroup("# 你好")), false).join(" "), "3-5", "条目");
});

testCase("`#你好`（井号后没空格）：**和上一条同一档**，正文从 2 起", () => {
  //  ⚠️ 这一条就是 2026-09-30 那个需求本身：宽松档下它不再是"另一条路"。
  equal(items(combine2(paragraphGroup("#你好")), false).join(" "), "2-4", "条目");
});

testCase("`##abc`：范围同样只盖正文（前缀长 2）", () => {
  equal(items(combine2(paragraphGroup("##abc")), false).join(" "), "3-6", "条目");
});

testCase("`#   标题`（井号后三颗空格）：前缀把空白**整段**吃掉，正文从 5 起", () => {
  //  ⚠️ 这一格是 `atx.ts::atxPrefix` 那段注释点名的坑：`\s*` / `\s+` 是贪婪的，
  //     井号与正文之间**任意多个**空白都算前缀。自己另写一条 `^#{1,6}\s*`
  //     去数井号就会少算，把中间那几颗空格留在加粗范围里。
  //     症状：`#   标题` 里那几颗空格被加粗——看不见，但装饰范围是错的。
  equal(items(combine2(paragraphGroup("#   标题")), false).join(" "), "5-7", "条目");
});

testCase("只敲了 `#`、`# `（还没写正文）：没有可装饰的范围", () => {
  equal(items(combine2(paragraphGroup("#")), false).join(" "), "", "`#` 一条都不该有");
  equal(items(combine2(paragraphGroup("# ")), false).join(" "), "", "`# ` 一条都不该有");
});

testCase("普通段落：一条都没有", () => {
  equal(items(combine2(paragraphGroup("正文而已")), false).join(" "), "", "条目");
});

testCase("第一个孩子是**行内原子**时不算：`#` 不在行首", () => {
  const paragraph2 = schema.nodes.paragraph.create(null, [
    schema.nodes.atom.create(),
    schema.text("# 你好"),
  ]);
  equal(items(combine2(paragraph2), false).join(" "), "", "判据是「第一个孩子是纯文本」，原子挡在前面就不认");
});

testCase("`#**你好**`：正文那颗加粗节点**整颗**都在范围里", () => {
  //  位置: 0   1   2   3   4
  //        │   #   你   好   │   （`你好` 带 strong）
  //  用户截图里那一行就是这个长相（标题里按过 Ctrl+B）。
  equal(items(combine2(oneParagraph([["#", []], ["你好", [strong]]])), false).join(" "), "2-4", "条目");
});

testCase("多段：只有那段标题写法有条目，位置按整篇算", () => {
  //  第 1 段占 0…3（`#你好` 三颗字 ＋ 一对哨兵位），所以第 2 段从 5 起。
  equal(items(combine2(paragraphGroup("#你好"), paragraphGroup("正文")), false).join(" "), "2-4", "条目");
});

group("二、已经是标题块的不再进装饰（这条是「写完了没有」的判据）");

testCase("真标题块：一条都没有（它自己按该级字号排，不要装饰）", () => {
  //  ⚠️ 这一条是这一版判"写完没有"的**全部秘密**：没按回车是段落 → 加粗；
  //     按了回车是 `heading` 块 → 由 `editor.css` 的 `h1`~`h6` 排。
  //     中间没有任何"光标在哪儿"的状态，见 `heading-on-enter.ts` 文件头。
  equal(items(combine2(markTitleParagraph(1, "你好")), false).join(" "), "", "标题块不该被装饰");
});

testCase("标题块与待成块的段落混在一篇里：只装饰那段段落", () => {
  //  第 1 段是真标题（占 0…4），第 2 段 `#你好` 从 5 起、正文从 7 起。
  equal(items(combine2(markTitleParagraph(1, "旧标题"), paragraphGroup("#你好")), false).join(" "), "7-9", "条目");
});

group("三、严格档：`#你好` 一个像素都不动");

testCase("严格档下 `#你好` **不是**标题：一条都不该有", () => {
  //  ⚠️ 严格档下按回车走的是普通换行（`baseKeymap`），**不成块**——
  //     所以它连"写完了会变"这回事都没有，装饰更是谈不上。
  equal(items(combine2(paragraphGroup("#你好")), true).join(" "), "", "严格档不许把它画成标题写法");
});

testCase("严格档下 `# 你好` 照旧（它本来就在严格口径里）", () => {
  equal(items(combine2(paragraphGroup("# 你好")), true).join(" "), "3-5", "条目");
});

testCase("严格档下 `#   标题`：空白同样整段算前缀", () => {
  equal(items(combine2(paragraphGroup("#   标题")), true).join(" "), "5-7", "条目");
});

testCase("两档一起看：`#你好` 宽松有、严格没有，长度一致", () => {
  //  ⚠️ 分两条断言而不是写进同一条：一条挂了要知道挂在哪一档上。
  equal(items(combine2(paragraphGroup("#你好")), false).join(" "), "2-4", "宽松档");
  equal(items(combine2(paragraphGroup("#你好")), true).join(" "), "", "严格档");
});

group("四、拼装饰：所有条目**一视同仁**（没有「跳过」这回事了）");

//  第 1 段 `# 你好`（4 颗字）在 0…5，第 2 段 `#你好`（3 颗字）从 6 起、正文从 8 起。
const twoParagraphs = combine2(paragraphGroup("# 你好"), paragraphGroup("#你好"));

testCase("两条都套上，同一个类名（严格那条与宽松那条没有区别）", () => {
  //  ⚠️ 上一版这里分两种类名、还有"正在写的那一段先不放大"那一支。
  //     现在两档合并，`建装饰集` 也不再收"正在写的段"参数了。
  equal(
    setAboveOf(createDecorationCollection(twoParagraphs, computeDecorationsItem(twoParagraphs, false))).join(" "),
    "1-3:nota-heading-prefix 3-5:nota-heading-pending 7-8:nota-heading-prefix 8-10:nota-heading-pending",
    "装饰",
  );
});

testCase("严格档那一篇：只有 `# 你好` 那条套上", () => {
  equal(
    setAboveOf(createDecorationCollection(twoParagraphs, computeDecorationsItem(twoParagraphs, true))).join(" "),
    "1-3:nota-heading-prefix 3-5:nota-heading-pending",
    "严格档下 `#你好` 那条不该套",
  );
});

testCase("没有条目时给的是空集（不是「套了一层空装饰」）", () => {
  equal(setAboveOf(createDecorationCollection(combine2(paragraphGroup("正文")), computeDecorationsItem(combine2(paragraphGroup("正文")), false))).length, 0, "条数");
});

testCase("前缀与正文分别套 `nota-heading-prefix` / `nota-heading-pending`", () => {
  const collection = createDecorationCollection(combine2(paragraphGroup("#你好")), computeDecorationsItem(combine2(paragraphGroup("#你好")), false));
  equal(
    setAboveOf(collection).join(" "),
    "1-2:nota-heading-prefix 2-4:nota-heading-pending",
    "类名",
  );
});

testCase("光标离开待成块段落：整段按标题排版，前缀仍在但由 CSS 隐藏", () => {
  const doc = combine2(paragraphGroup("# 你好"));
  const collection = createDecorationCollection(doc, computeDecorationsItem(doc, false), 6);
  equal(
    setAboveOf(collection).join(" "),
    "0-6:nota-heading-rendered-block 1-3:nota-heading-prefix",
    "离开后的装饰",
  );
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}

// ℹ️ `断言` 只有个别用例用得上，留着是为了与 `mark-hint.test.ts` 同一套工装
//    长相——别因为"没人用"就删掉。
void assertion;
