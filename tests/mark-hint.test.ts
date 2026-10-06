/**
 * `src/editor/mark-hint.ts` 里 `扫一段`（"光标所在的那一整段带标记的文字
 * 是哪一段"）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/mark-hint.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-mark-hint-test/mark-hint.test.mjs
 * node /tmp/nota-mark-hint-test/mark-hint.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 为什么单开一份（而不是塞进 `math-view.test.ts`）
 *
 * 那一份要假 DOM + 假 EditorView（它测的是 NodeView 那一层）。这里要测的是
 * **纯位置算术**：建一颗真 `Schema`、拼几颗真文本节点、问 `扫一段` 要哪一段。
 * 一行 DOM 都不碰，跑起来是毫秒级。
 *
 * # 这份测试是为什么写的（2026-09-26）
 *
 * 用户要的是"光标在黑体/斜体里就半透明显示 `*`"。第一版 `扫一段` 直接拿
 * `doc.resolve(p).marks()` 当"第 p 个字符的标记"用，于是**两端的标记都画在
 * 全段右移一格的地方**——无头目检里 `一二三四五`（加粗）显示成了
 * `一**二三四五***`。根因是 ProseMirror 的 `marks()` 问的是"**在 p 这个位置
 * 打字会拿到什么 mark**"（即左边那个字符的），不是"从 p 开始那个字符的"。
 * 下面「第 3 组」那几条就是照这个复发场景写的。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * 它证明不了：装饰有没有真的挂到 DOM 上、`::before` / `::after` 画成什么样、
 * 淡入动画、符号占不占宽度、光标进出时那一行会不会横向跳。那些一律是
 * **目检**的事（见 `docs/06` §5.9 起的开窗目检一节）。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { MarkType, Node as PMNode } from "@milkdown/kit/prose/model";
import { emphasisSchema, inlineCodeSchema, strongSchema } from "@milkdown/preset-commonmark";
import { 扫一段, 提示表 } from "../src/editor/mark-hint";

/* ── 极小的测试工装（与 `math-view.test.ts` 同一套长相）───────────────── */

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

function 断言(条件: unknown, 说明: string): void {
  if (!条件) throw new Error(说明);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

/* ── 一颗够用的真 Schema（只要 strong / em 两个 mark）────────────────── */

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    // 行内原子的形状（`math_inline` / `image` 都是这一档）：`inline: true` +
    // `atom: true`，占**一个**位置，带不了 mark。
    atom: { group: "inline", inline: true, atom: true, selectable: false },
  },
  marks: {
    strong: {},
    em: {},
  },
});

const 强 = schema.marks.strong as MarkType;
const 斜 = schema.marks.em as MarkType;
const 段 = schema.nodes.paragraph;

/**
 * 拼一段：`甲 **一一一** 乙` 这种。`片段` 里每项是"文字 + 带哪些 mark"。
 *
 * ⚠️ 文本节点**只能**走 `schema.text()`——`schema.nodes.text.create(...)`
 * 会抛 `NodeType.create can't construct text nodes`（第一次跑就撞上了）。
 */
function 拼(片段: readonly (readonly [string, readonly MarkType[]])[]): PMNode {
  const 块: PMNode[] = 片段.map(([字, 标记]) => schema.text(字, 标记.map((m) => m.create())));
  return schema.nodes.doc.create(null, 段.create(null, 块));
}

/** 这一段的**内容**从哪个位置开始（绝对位置 1：doc 里第 0 个段落的内容起点）。 */
const 块首 = 1;

/** 把"相对块首的偏移"翻成绝对位置。 */
function 处(偏移: number): number {
  return 块首 + 偏移;
}

/** 把 `扫一段` 的结果翻成"相对块首的 [从, 到)"，好读。 */
function 扫(doc: PMNode, 偏移: number, 类型: MarkType): [number, number] | null {
  const 段界 = 扫一段(doc, 处(偏移), 类型);
  return 段界 ? [段界.从 - 块首, 段界.到 - 块首] : null;
}

/** 把结果写成好读的字符串，失败信息里能一眼看出窗口挪到哪儿去了。 */
function 显示(结果: [number, number] | null): string {
  return 结果 ? `[${结果[0]}, ${结果[1]})` : "null";
}

/* ── 用例 ─────────────────────────────────────────────────────────────── */

组("一、光标落在加粗段**里面**：整段两头都要包住");

//  位置: 0   1   2   3   4   5   6   7
//        │   一   二   三   四   五   │
//       甲   └─────── strong ──────┘   乙
//  上面那一行是**位置**（`位置` 落在哪个字符之前），不是字符本身。
//  ⚠️ 别照"第几个字"数偏移——`甲  前` 那种带空格的写法上一次就是在这里数错了一位。
const 长加粗 = 拼([
  ["甲", []],
  ["一二三四五", [强]],
  ["乙", []],
]);
const 整段: [number, number] = [1, 6];

测("光标在段首那个字之前（位置 1，紧贴段首）→ 整段", () => {
  等(显示(扫(长加粗, 1, 强)), 显示(整段), "紧贴段首也算落在里面");
});

测("光标在段中间（位置 3）→ 整段", () => {
  //  ⚠️ 这一格就是 2026-09-26 无头目检里复发的那一处：曾经答 [2, 7)
  //     （两端各右移一格，右端还吃掉了「乙」）。
  等(显示(扫(长加粗, 3, 强)), 显示(整段), "曾经答 [2, 7)");
});

测("光标在段尾那个字之后（位置 6，紧贴段尾）→ 整段", () => {
  // ⚠️ 这一格 2026-10-05 当天**翻过去又翻回来**：先改成"不画"，被用户拿 Typora
  //    的两张图推翻——**那边是照常显示的**，光标能在右符号两侧移动（`docs/07` BUG-65）。
  //    真正要改的是**画法**（右符号走 widget ＋ `side:-1`），不是"躲开不画"。
  等(显示(扫(长加粗, 6, 强)), 显示(整段), "刚打完 `**粗**` 时就是这个位置");
});

测("四个内部位置逐个走一遍，答案都一样", () => {
  for (const 位 of [1, 2, 3, 4, 5, 6]) {
    等(显示(扫(长加粗, 位, 强)), 显示(整段), `位置 ${位}`);
  }
});

组("二、光标不在这一段里 → 什么都不显示");

测("光标在段首那个字**之前**（位置 0）→ null", () => {
  等(显示(扫(长加粗, 0, 强)), "null", "位置 0 在「甲」之前");
});

测("光标在段尾那个字**之后**（位置 7，块尾）→ null", () => {
  等(显示(扫(长加粗, 7, 强)), "null", "位置 7 在「乙」之后，不属于任何字符");
});

测("光标在段后面那个普通字之后 → null", () => {
  //  位置 6 是"紧贴段尾"（算），位置 7 是"跨过「乙」之后"（不算）——
  //  这两条差一格，正是最容易糊在一起的地方。
  等(显示(扫(长加粗, 6, 强)), 显示(整段), "位置 6 算");
  等(显示(扫(长加粗, 7, 强)), "null", "位置 7 不算");
});

组("三、⚠️ 两端各有一个紧邻的另一段标记（最容易差一格）");

//  位置: 0   1   2   3   4   5   6
//       甲   一   二   三   乙   丙
//           └ strong ┘   └ strong ┘   ← 中间隔着「三」这个不带标记的字
const 两段加粗 = 拼([
  ["甲", []],
  ["一二", [强]],
  ["三", []],
  ["乙丙", [强]],
]);

测("光标在一段里时，**不许**越过中间那个不带标记的字", () => {
  等(显示(扫(两段加粗, 1, 强)), "[1, 3)", "第一段（紧贴段首）");
  等(显示(扫(两段加粗, 2, 强)), "[1, 3)", "第一段中间");
  等(显示(扫(两段加粗, 3, 强)), "[1, 3)", "第一段的段尾那一处");
  等(显示(扫(两段加粗, 4, 强)), "[4, 6)", "第二段（紧贴段首）");
  等(显示(扫(两段加粗, 6, 强)), "[4, 6)", "第二段的段尾那一处");
});

组("四、一个 mark 都没有的段落 → null（不许报错）");

const 无标记 = 拼([["甲 乙 丙", []]]);

测("普通段落里问加粗 → null", () => {
  for (const 位 of [0, 2, 5]) 等(显示(扫(无标记, 位, 强)), "null", `位置 ${位}`);
});

组("五、整段都是加粗（块首 / 块尾那两个边界）");

const 全加粗 = 拼([["一二三", [强]]]);

测("整段加粗：块首和块尾都算在里面", () => {
  等(显示(扫(全加粗, 0, 强)), "[0, 3)", "块首");
  等(显示(扫(全加粗, 2, 强)), "[0, 3)", "中间");
  等(显示(扫(全加粗, 3, 强)), "[0, 3)", "块尾");
});

组("六、又粗又斜（两个 mark 叠在同一段上）");

const 又粗又斜 = 拼([
  ["甲", []],
  ["一二三", [强, 斜]],
  ["乙", []],
]);

测("两个 mark 各扫各的，扫出来的是**同一段**", () => {
  等(显示(扫(又粗又斜, 2, 强)), "[1, 4)", "粗");
  等(显示(扫(又粗又斜, 2, 斜)), "[1, 4)", "斜");
});

测("只带一个 mark 的段：另一个 mark 问出来是 null", () => {
  //  ⚠️ 这只是"两个 mark 各自扫出来是同一段"的**逻辑**侧。两个装饰落在
  //     同一段上时，ProseMirror 会把它们并成一颗 span、属性只剩一个赢家，
  //     所以 `***又粗又斜***` 画不出 `***`（画出来的长相见 `mark-hint.ts` 文件头）。
  等(显示(扫(长加粗, 3, 斜)), "null", "只有 strong，问 em 应该没有");
});

组("七、行内原子（公式 / 图片）占一格、且一律不带标记");

//  位置: 0   1   2   3
//       甲   [原子]   乙
//  上面是**位置**；`乙` 落在位置 2 到 3 之间那一格，所以它是偏移 2。
//  「原子」占一格（位置 1 到 2 之间），本身带不了 mark。
const 带原子 = schema.nodes.doc.create(
  null,
  段.create(null, [
    schema.text("甲"),
    schema.nodes.atom.create(null),
    schema.text("乙", [强.create()]),
  ]),
);

测("问加粗：只扫出「乙」，原子不会被算进去", () => {
  等(显示(扫(带原子, 3, 强)), "[2, 3)", "位置 3 紧贴在「乙」之后（段尾）");
  等(显示(扫(带原子, 2, 强)), "[2, 3)", "位置 2 是「乙」的段首");
});

测("问加粗：原子自己那一格不算（它是节点不是字）", () => {
  等(显示(扫(带原子, 1, 强)), "null", "位置 1 是原子的起点");
});

组("八、⚠️ 提示表里的 mark 名字要和**真 preset** 对得上");

/**
 * 从 preset 导出的那一片里抠出 mark 的 id。
 *
 * ⚠️ 这几片**没有** `.id`（本仓装的这一版里是 `undefined`），真正带名字的是
 * ctx 的 key：`String(strongSchema.key.id)` = `"Symbol(Context-strong)"`。
 * 这个形状是**照着实际情况写的**，不是文档承诺的——哪天 milkdown 改了，
 * 这一条会红，那时候改的是这个函数，**不是删掉这一组用例**：
 * 它挡的是"名字写错、提示悄悄不出现"这种没有任何报错的坏法。
 */
function 抠名字(片: { key?: { id?: unknown } }): string {
  const 原 = String(片.key?.id);
  const 命中 = /Context-(.*)\)$/.exec(原);
  if (!命中) throw new Error(`认不出这个 ctx key 里的 mark 名：${原}`);
  return 命中[1] as string;
}

const 真名 = new Set([
  抠名字(strongSchema as unknown as { key?: { id?: unknown } }),
  抠名字(emphasisSchema as unknown as { key?: { id?: unknown } }),
  抠名字(inlineCodeSchema as unknown as { key?: { id?: unknown } }),
]);

测("先把 preset 的 id 认对（认错的话下面那两条就是假的）", () => {
  等([...真名].sort().join("、"), "emphasis、inlineCode、strong", "preset 里这三个 mark 的 id");
});

测("每一个名字都是 `@milkdown/preset-commonmark` 真有的 mark id", () => {
  //  ⚠️ 这一组是**唯一**能挡住"名字写错、提示悄悄不出现"的东西。
  //     2026-09-26 就是这么错的：斜体写成 `"em"`，而 preset 里的 id 是
  //     `"emphasis"`——加粗的 `**` 出来了，斜体的 `*` 死活不出来，不报错。
  for (const { 名, 符号 } of 提示表) {
    断言(真名.has(名), `提示表里的「${名}」（画 ${符号}）不是 preset 里的 mark id`);
  }
});

测("`em` 那种写法确实不在 preset 里（把这一课钉住）", () => {
  断言(!真名.has("em"), "`em` 不该是 preset 的 mark id——它是 `emphasis`");
});

测("这张表里**只有**加粗和斜体两样（用户 2026-09-26 只点了这两样）", () => {
  等(提示表.length, 2, "行数");
  等(提示表.map((行) => 行.符号).join(" "), "** *", "符号");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}

// ℹ️ 这份文件里 `断言` 只有个别用例用得上（大部分是"等"），留着是为了与
//    `math-view.test.ts` 同一套工装长相——别因为"没人用"就删掉。
void 断言;
