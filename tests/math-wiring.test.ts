/**
 * 公式那两份测试的**第二份**：公式节点**外围**的三条线（2026-10-07 从
 * `math-view.test.ts` 拆出来的，`docs/07` 第 89 项）。
 *
 * # 为什么拆、按什么拆
 *
 * `math-view.test.ts` 那天涨到 1024 行，而它**一直被 ① 闸漏掉**（闸的扫描面
 * 不含 `tests/`）。拆的依据是**职责**，不是行数对半砍：那份测的是
 * "公式节点**自己**"（源码在哪、面板开合、写回哪、装饰、真插件的两条线），
 * 这份测的是"**公式之外围**"——
 *
 * 1. **插公式块那条命令**（`insert.ts::插公式块`，"插入 → 公式"菜单那一下）；
 * 2. **序列化不给行首井号加反斜杠**（`lax-heading.ts`）；
 * 3. **命令补全弹窗的接线**（`math-suggest.ts` 那一层自己测在
 *    `math-suggest.test.ts`，这里量的是"NodeView 把它挂上、敲进去它自己开"）。
 *
 * 三组共用一套地基（真 `Ctx` ＋ 真 `Schema` ＋ 假 NodeView 支架），那份地基
 * 两份测试都要，所以抽去了 `tests/math-fixture.ts`；假 DOM 仍是 `tests/fake-dom.ts`
 * （`找` / `数` 那两个小工具 2026-10-07 也搬去了那边——两份都要用，
 * 而它们只认 `假元素` 的 `childNodes`，与数学无关）。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/math-wiring.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-math-test/math-wiring.test.mjs
 * node /tmp/nota-math-test/math-wiring.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * ⚠️ 单独核类型（`tests/` 不在 `tsc` 的 `include` 里）：
 *
 * ```sh
 * npx tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext \
 *   --moduleResolution bundler --lib es2022,dom,dom.iterable --types node \
 *   --noUncheckedIndexedAccess tests/math-wiring.test.ts
 * ```
 *
 * # ⚠️ 这套测试**证明不了**什么
 *
 * 与另一半同款：CSS 长什么样、KaTeX 排出来对不对、真浏览器里的焦点与选区、
 * ProseMirror 与真 DOM 的同步——一律**未验**。这里建的是假 DOM，只跑逻辑。
 */

import { editorViewCtx } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";

import { 插公式块 } from "../src/editor/insert";
import { 取源码 } from "../src/editor/math-view";
import { 不转义行首井号 } from "../src/editor/lax-heading";
import { 假元素, 找, 数, type 假事件 } from "./fake-dom";
import { 存盘一笔, 块, 块位置, 行内, 行内位置, 建, ctx, schema, 段落 } from "./math-fixture";

/* ── 一支极小的测试工装 ───────────────────────────────────────────────── */

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

async function 测(名称: string, 体: () => void | Promise<void>): Promise<void> {
  try {
    await 体();
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



/* ── 命令：插一个空公式块（`insert.ts` 的 `插公式块`）─────────────────── */
//
// 这一组要的是"菜单里那一下到底改了什么"。工装只有两件：一颗真 `EditorState`
// （真的是它算的位置与选区）＋一颗**只记 `dispatch` 的假 view**——
// `插公式块` 用到的 view 只有 `state` 与 `dispatch` 两样。
//
// ⚠️ **没验的**：真浏览器里那块 KaTeX 排出来长什么样、面板有没有自动打开
// （面板的判据是"整块被选中"，这里只验到**选区确实是 `NodeSelection`**——
// 从它到"面板开了"那一步在下面第一组的 NodeView 测试里，两边合起来才算严丝合缝）。

ctx.inject(editorViewCtx);

/** 跑一次 `插公式块`，把光标放在 `光标`（必须是文本位置）。返回改完的 state。 */
function 跑插公式块(文档: PMNode, 光标: number) {
  const 视图 = {
    state: EditorState.create({ doc: 文档, selection: TextSelection.create(文档, 光标) }),
    dispatch(tr: Transaction) {
      调用.push("dispatch");
      视图.state = 视图.state.apply(tr);
    },
    // ⚠️ 只记顺序，不做真的聚焦（假 DOM 里没有焦点这回事）。
    focus() {
      调用.push("focus");
    },
  };
  const 调用: string[] = [];
  ctx.set(editorViewCtx, 视图 as never);
  // `Editor` 那一层只用得上 `action`（它就是把 ctx 交回调）。
  插公式块({ action: (体: (c: unknown) => void) => 体(ctx) } as never);
  return { state: 视图.state, 调用 };
}

组("六、插公式块（`docs/07` 第 52 项那条菜单）");

await 测("空段落里 → **就地**变成公式块（不留下一个空段落），并整个选中它", () => {
  const 文档 = schema.topNodeType.create(null, [段落()]);
  const { state: 改完 } = 跑插公式块(文档, 1);
  等(改完.doc.childCount, 1, "还是只有一块（就地换，不是插一块新的）");
  等(改完.doc.child(0).type.name, "math_block", "那一段自己变成了公式块");
  等(改完.doc.child(0).attrs.value, "", "源码为空（用户马上要自己写）");
  断言(改完.selection instanceof NodeSelection, "选区是 NodeSelection——这是『正在编辑』的判据");
  等(改完.selection.from, 0, "选中的正是新块");
});

await 测("有字的段落里 → 插在**这一段之后**，那一段的字一个不动", () => {
  const 文档 = schema.topNodeType.create(null, [段落("甲"), 段落("乙")]);
  const { state: 改完 } = 跑插公式块(文档, 2);
  等(改完.doc.childCount, 3, "多出来一块");
  等(改完.doc.child(0).textContent, "甲", "原段落一个字不动（`setBlockType` 那条路会把这字吃掉）");
  等(改完.doc.child(1).type.name, "math_block", "新块落在它后面");
  等(改完.doc.child(2).textContent, "乙", "后面的段落也没被顶掉");
  断言(改完.selection instanceof NodeSelection, "新块被选中");
  等(改完.selection.from, 段落("甲").nodeSize, "选中的是新块的位置");
});

await 测("嵌套的空段落里（引用块内）→ 只插一块，**外层整块不许被换掉**", () => {
  const 引用 = schema.nodes.blockquote.create(null, [段落()]);
  const 文档 = schema.topNodeType.create(null, [引用, 段落("尾")]);
  const { state: 改完 } = 跑插公式块(文档, 2);
  等(改完.doc.childCount, 3, "引用块还在，只多出一块");
  等(改完.doc.child(0).type.name, "blockquote", "⚠️ 外层引用块必须原样在（`$from.before(1)` 那个坑）");
  等(改完.doc.child(0).childCount, 1, "引用块里的空段落也还在");
  等(改完.doc.child(1).type.name, "math_block", "新块插在这一整个顶层块之后");
  等(改完.doc.child(2).textContent, "尾", "后面的照旧");
});

await 测("插进去那块是**真能存盘**的（走插件自己那份 toMarkdown）", () => {
  const { state: 改完 } = 跑插公式块(schema.topNodeType.create(null, [段落()]), 1);
  等(JSON.stringify(存盘一笔(改完.doc.child(0))), JSON.stringify([{ 名: "math", 值: "" }]), "存盘读 attrs.value，落成一条 math");
});

await 测("**先聚焦、再派事务**（从菜单点下来时源码框才抢得到焦点）", () => {
  const { 调用 } = 跑插公式块(schema.topNodeType.create(null, [段落()]), 1);
  // ⚠️ 这条钉的是一个**无头窗口里才露头**的毛病（2026-09-26）：菜单点下来那一刻
  //    DOM 焦点还在菜单按钮上，`math-view.ts::同步面板` 的判据 `view.hasFocus()`
  //    为假 → 面板画出来却不把焦点给源码框 → 接着敲的字进了正文。
  //    （走 `Ctrl+Shift+M` 时焦点本就在正文里，所以只在鼠标这条路上出问题。）
  等(JSON.stringify(调用), JSON.stringify(["focus", "dispatch"]), "顺序：先 focus 再 dispatch");
});

/* ── 七、序列化时不给行首井号加反斜杠（`lax-heading.ts`）───────────────── */
//
// 这一组接的是第七组原来的位置：那一组钉的是 `宽松标题显示`（把 `#你好` 按
// `h1` 排版的那个装饰），**2026-09-26 那条装饰被删掉了**——用户裁定
// `#你好` 不许变位置变大小（他的原话与完整理由在 `lax-heading.ts` 文件头）。
// 装饰没了就没什么可测的，于是这一格换成**同一个文件里剩下那一半**：
// `不转义行首井号`——它原来**一条用例都没有**（判据只写在注释里）。
//
// ⚠️ 这一组**测不到 remark 真的会怎么转义**：那边是 `mdast-util-to-markdown`
// 的内部行为，这里递进去的是一份**假的**原文处理器（`假转义`），所以钉的是
// **本函数的判据**（哪几种能脱、哪几种一个字节都不许动），不是"上游行为没变"。
// 上游行为要变，得靠端到端那条（`docs/06` §5.9 的"存前存后比字节"）。

/**
 * 假装自己是 remark 那条文本处理器：把**行首**的井号转义掉。
 *
 * ⚠️ 只做这一件事，因为 `被转义的行首井号` 这条正则只认这一个形状。
 */
function 假转义(值: string): string {
  return 值.replace(/^(#{1,6})/, "\\$1");
}

/** 拿一个"原文处理器"：`脱` 是假的，用来验脱得对不对。 */
function 假原文(值: string) {
  return (() => 假转义(值)) as never;
}

/** 跑一遍：拿真函数包住假原文，喂一个假的 mdast 文本节点。 */
function 串化(值: string): string {
  const 处理 = 不转义行首井号(假原文(值));
  return 处理({ value: 值 } as never, null as never, null as never, null as never);
}

组("七、序列化不给行首井号加反斜杠（`lax-heading.ts`）");

await 测("`#标签`：反斜杠要脱掉（存盘存回用户写的那几个字符）", () => {
  等(串化("#标签 不是标题"), "#标签 不是标题", "`\\#标签` 要变回 `#标签`");
  等(串化("###三层"), "###三层", "一到六个井号都算");
});

await 测("⚠️ `# 有空格`：**一个字节都不许动**（它本来就得转义）", () => {
  // 这是整条规则**最容易改错**的一处：CommonMark 里"井号 + 空格"是真标题，
  // 那个反斜杠是**有用的**，脱掉之后重新打开就变成标题了。
  等(串化("# 有空格"), "\\# 有空格", "井号后有空白 → 不许脱");
  等(串化("#"), "\\#", "光一个井号 → 不许脱");
  等(串化("##"), "\\##", "连着两个井号（后面什么都没）→ 不许脱");
});

await 测("`#` 不在行首（段中间、或行内代码里那种）→ 不许动", () => {
  // 只有**行首**那个才有多余转义的问题；段中间的井号 remark 本来就不转义，
  // 这里给的是"假原文已经转了"的输入，函数也不该去动它（判据里没有行首就返回原样）。
  等(串化("甲#标签"), "甲#标签", "不在行首：原样返回");
});

await 测("多行文本：每一行的行首都算（`(^|\n)` 那一段）", () => {
  等(串化("甲\n#标签"), "甲\n#标签", "第二行的行首也要脱");
});

await 测("没有原文处理器时**原样返回**，不自己造一条", () => {
  // `create.ts` 传的是 `prev.handlers?.text`，它可能没有——那时宁可什么都不做，
  // 也不能在这里自己拼一份转义规则出来（序列化器是核心路径）。
  const 处理 = 不转义行首井号(undefined);
  等(处理({ value: "#标签" } as never, null as never, null as never, null as never), "#标签");
});

组("八、命令补全弹窗的**接线**（`math-suggest.ts` 那一层自己测在 `math-suggest.test.ts`）");

/**
 * 在源码框里"敲"一串字：改 `value`、把光标放到末尾、派发一次 `input`。
 *
 * ⚠️ 这一串正是**浏览器**会做的事（`math-view.ts` 听的就是 `input`），
 * 而不是直接喊内部函数——所以"接线断了"这种事测得出来。
 */
function 敲进(dom: 假元素, 源: string): 假元素 {
  const 框 = 找(dom, "nota-math-source");
  if (!框) throw new Error("没找到源码框");
  框.value = 源;
  框.setSelectionRange(源.length, 源.length);
  框.派发("input");
  return 框;
}

/** 按一个键（走源码框上那条 `keydown`）。 */
function 按键(框: 假元素, 键: string): 假事件 {
  return 框.派发("keydown", { key: 键 });
}

await 测("面板里挂着那一格弹窗；起手是藏着的", () => {
  const { 视角 } = 建(块("E=mc^2"), 块位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");

  const 弹 = 找(dom, "nota-math-suggest");
  断言(弹, "弹窗该在面板里");
  等(弹?.hidden, true, "起手藏着");
  // ⚠️ 挂**在面板里**（不是 `document.body`，像 `lang-picker.ts` 那样）：
  //    两条理由写在 `math-suggest.ts` 的文件头，这里量的是结论那一半。
  等(数(找(dom, "nota-math-panel") as 假元素, "nota-math-suggest"), 1, "在面板那棵树里");
  // 块公式用 `div`（行内那档用 `span`，见下面那条）。
  等(弹?.tagName, "DIV", "块那档的根元素");
});

await 测("⚠️ 只读实例连弹窗都不挂（同面板与悬浮预览那两条）", () => {
  const { 视角 } = 建(块("E=mc^2"), 块位置, true);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");
  等(找(dom, "nota-math-suggest"), null, "只读那棵树里不该有它");
});

await 测("行内公式那档：弹窗是 `span`（整棵 NodeView 活在一个 `<span>` 里）", () => {
  const { 视角 } = 建(行内("x"), 行内位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");
  const 弹 = 找(dom, "nota-math-suggest");
  断言(弹, "该有弹窗");
  等(弹?.tagName, "SPAN", "行内那档的根元素");
});

await 测("敲进 `\\fr`：弹窗自己开了，第一条是 `\\frac`", () => {
  const { 视角 } = 建(块(""), 块位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");

  敲进(dom, "\\fr");
  const 弹 = 找(dom, "nota-math-suggest") as 假元素;
  等(弹.hidden, false, "弹窗开了");
  等(数(弹, "nota-math-suggest-item"), 1, "`\\fr` 只挑得到一条");
  等待名字(弹, "\\frac");
});

await 测("⚠️ 光标不在命令里时它收起来（敲了别的字不该留着上一列）", () => {
  const { 视角 } = 建(块(""), 块位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");
  敲进(dom, "\\fr");
  const 弹 = 找(dom, "nota-math-suggest") as 假元素;
  等(弹.hidden, false, "先开着");
  敲进(dom, "x+1");
  等(弹.hidden, true, "没有当场了 → 收起来");
});

await 测("⚠️ 回车收下：写进文档的是替换后的源码，面板**留着**（不是退出编辑）", () => {
  const { 视角, 取state } = 建(块(""), 块位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");

  const 框 = 敲进(dom, "\\fr");
  按键(框, "Enter");

  const 节点 = 取state().doc.nodeAt(块位置);
  等(取源码(节点 as never), "\\frac{}{}", "文档里已经是插入体");
  等(框.value, "\\frac{}{}", "源码框跟着变");
  // `\frac{}{}`：0=\ 1=f 2=r 3=a 4=c 5={ 6=} … → 光标落在 6（第一个 `{}` 里面）
  等(框.选区[0], 6, "光标落进第一个 `{}`");
  断言(dom.classList.contains("nota-math-editing"), "面板还开着（收的是命令，不是退出编辑）");
  等((找(dom, "nota-math-suggest") as 假元素).hidden, true, "弹窗自己收了");
});

await 测("⚠️ Esc 的第一下只收弹窗、第二下才退出编辑", () => {
  const { 视角 } = 建(块(""), 块位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");
  const 框 = 敲进(dom, "\\fr");
  const 弹 = 找(dom, "nota-math-suggest") as 假元素;

  按键(框, "Escape");
  等(弹.hidden, true, "第一下：弹窗收了");
  断言(dom.classList.contains("nota-math-editing"), "第一下面板还在（这是那条「只收候选」）");

  按键(框, "Escape");
  断言(!dom.classList.contains("nota-math-editing"), "第二下才退出编辑");
});

await 测("点一条候选：收下它（走的是同一个「写进源码框」的口子）", () => {
  const { 视角, 取state } = 建(块(""), 块位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");

  const 框 = 敲进(dom, "\\i");
  const 弹 = 找(dom, "nota-math-suggest") as 假元素;
  const 行 = (弹 as unknown as { childNodes: 假元素[] }).childNodes;
  断言(行.length >= 2, "`\\i` 该挑出不止一条");
  const 想要 = 行[1] as 假元素;
  const 名字 = 想要.childNodes.find((c) =>
    c.classList.contains("nota-math-suggest-name"),
  )?.textContent;

  想要.派发("mousedown");
  等(取源码(取state().doc.nodeAt(块位置) as never), `\\int_{}^{}`, "文档里是第二条的插入体");
  等(框.value.startsWith(名字 ?? "？"), true, `源码框里是 ${名字}`);
  等(弹.hidden, true, "点完收起来");
});

await 测("⚠️ `aria-activedescendant` 写在**源码框**上（焦点一直在那儿）", () => {
  const { 视角 } = 建(块(""), 块位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");
  const 框 = 敲进(dom, "\\i");
  等(框.getAttribute("aria-activedescendant"), "nota-math-suggest-item-0", "开着时指着第一条");

  按键(框, "ArrowDown");
  等(框.getAttribute("aria-activedescendant"), "nota-math-suggest-item-1", "往下挪一格");

  按键(框, "Escape");
  等(框.getAttribute("aria-activedescendant"), null, "收起来之后这一笔要抹掉");
});

await 测("⚠️ 丢焦点：弹窗收起来（面板归**选区**管，那是另一条判据）", () => {
  const { 视角 } = 建(块(""), 块位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");
  const 框 = 敲进(dom, "\\fr");
  const 弹 = 找(dom, "nota-math-suggest") as 假元素;
  等(弹.hidden, false, "先开着");

  框.派发("blur");
  等(弹.hidden, true, "丢了焦点就收");
  // ⚠️ 面板**故意还开着**：`面板该开` 的两条判据是「装饰说当前」或「框里有焦点」，
  //    这会儿装饰还是说当前的（选区没动）。这一条断言是**有意**写下来的——
  //    它把"弹窗归焦点、面板归选区"这条分界钉住，将来改坏了当场看得见。
  断言(dom.classList.contains("nota-math-editing"), "面板还在（装饰还说当前）");

  // 真的离开这一块（退出编辑：选区搬走）之后，两条一起收。
  按键(框, "Escape");
  断言(!dom.classList.contains("nota-math-editing"), "退出编辑后面板收了");
  等(弹.hidden, true, "弹窗当然也收着");
});

/** 断言弹窗第一条候选的名字是哪一个。 */
function 等待名字(弹: 假元素, 期望: string): void {
  const 行 = (弹 as unknown as { childNodes: 假元素[] }).childNodes[0];
  const 名字 = 行?.childNodes.find((c) => c.classList.contains("nota-math-suggest-name"));
  等(名字?.textContent, 期望, "第一条候选的名字");
}


/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
