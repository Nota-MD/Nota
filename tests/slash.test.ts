/**
 * `src/editor/slash.ts`（斜杠菜单：表、筛、认查询、采用、插件）的**可运行**测试集。
 * 2026-09-27 写，与那个文件同批落地（`docs/10-feature-matrix.md` §3「斜杠菜单」）。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/slash.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/slash.mjs
 * node /tmp/nota-测试/slash.mjs
 * ```
 *
 * ⚠️ **esbuild 报错时旧 bundle 还在**，`node` 跑出来的是上一版结果。先看
 * esbuild 那行有没有 `error`（`inline-marks.test.ts` 的文件头记过这个坑）。
 *
 * ⚠️ 这条命令**不用加 `--alias:@=./src`**：`slash.ts` 那句 `import { t } from "@/i18n"`
 * 由 esbuild 自己按 `tsconfig.json` 的 `paths` 解（`toc.test.ts` 走的
 * `@/editor/headings` 同理，那条从 2026-09-27 起就一直没加别名）。
 *
 * # 五组判据
 *
 * - **一、表本身的账**（纯数据）：id 不重名、关键词全是 ASCII、每条都筛得到自己、
 *   以及**那些故意不在表里的 id 确实不在**（这张表是"插入菜单"，混进一条
 *   「撤销」就是口径破了，而那种错不报错、只在用户手上显得怪）。
 * - **二、`筛项`**：空查询命中全部（**不是零条**）、大小写无关、子串不是词。
 * - **三、`认查询`**（纯函数 ＋ 真 `EditorState`）：只在行首、有空格就断、
 *   非 `paragraph` 不认、一条都不命中给 `null`、`起` 的文档坐标。
 * - **四、`采用`**：删的范围对不对、**先删再执行**的顺序、越界与光标倒退时不动。
 * - **五、插件**（真 `EditorState` ＋ 那颗裸 `Plugin`）：`init` / `apply` 那条
 *   **meta 分支**（按 ↓ 的高亮为什么不会被重算冲掉）、`handleKeyDown` 的四条键
 *   与两条早退（组合态、面板没开）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️⚠️ **一次窗都没开过**：敲 `/h1` 弹出面板、按 ↓ 换一条、回车插进文档，
 *   屏幕上到底发生了什么，这里一条都没验。它要 `Editor.make()` ＋ 真 DOM ＋
 *   真键盘事件（本仓没有 jsdom，也不许为这件事装包）。
 * - ⚠️ **面板画出来的样子没验**：`摆位置` 的翻边、`is-on` 的高亮、
 *   `replaceChildren` 重画，全是 DOM 与坐标的事。**插件建出来不碰 `document`**
 *   （面板是 `view()` 里懒建的），所以这里连桩都不用铺——代价是面板那一整段
 *   在这层测试里是**盲区**。
 * - ⚠️ **输入法组合态那条早退只验了"返回 false"**，没验真 WebKit 里
 *   `isComposing` 什么时候是 `true`。
 * - ⚠️ **`create.ts` 那一侧的接线没验**：`COMMANDS` 表里确实有 `h1`…这些键、
 *   执行函数收到的 id 真的会跑出一条命令——那半截是 `npx tsc --noEmit`
 *   ＋ 开窗目检的事（`docs/06` §5）。
 * - ⚠️ 这里的 schema 是**手搓的最小版**（`doc` / `paragraph` / `heading` /
 *   `hrBlock` / `text`），不是 `create.ts` 那份真 schema。`认查询` 认的是
 *   类型名 `"paragraph"` 这个字符串，这个契约由 import 与真 schema 保证，
 *   不由这里的断言保证。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Transaction } from "@milkdown/kit/prose/state";

import {
  slashTable,
  queryCorrectRule,
  filterItem,
  recognizeQuery,
  slashKey,
  slantBarMenu,
  slantBarPlugin,
  adoptUse,
  type SlantBarState,
} from "../src/editor/slash";
import type { EditorCommand } from "../src/editor/create-types";

/* ── 最小工装 ─────────────────────────────────────────────────────────── */

let passed = 0;
let failure = 0;
const failureList: string[] = [];
let currentGroup = "";

function group(name3: string): void {
  currentGroup = name3;
  console.log(`\n── ${name3} ${"─".repeat(Math.max(0, 56 - name3.length))}`);
}

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failure++;
    failureList.push(`${currentGroup} / ${name}`);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function equal(actual: unknown, expected: unknown, description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}：期望 ${b}，实际 ${a}`);
}

function assertValue(value2: boolean, description: string): void {
  if (!value2) throw new Error(description);
}

/* ── schema：够用就行 ─────────────────────────────────────────────────── */

/**
 * ⚠️ 比 `toc.test.ts` 那份还小：这里**不解析 markdown、不序列化**，
 * 文档树是直接 `schema.node()` 手搭的，所以 mdast 那两套处理器一个都不用抄。
 *
 * `hrBlock` 那颗是**非文本块**的代表：`认查询` 里"不是文本块就早退"那一条
 * 要有东西可喂（用 `NodeSelection` 停上去）。
 */
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    heading: { content: "inline*", group: "block", attrs: { level: { default: 1 } } },
    hrBlock: { group: "block", atom: true },
    text: { group: "inline" },
  },
});

/** 一个段落（`文` 为空就是空段落）。 */
function paragraph2(text4 = ""): PMNode {
  return text4 ? schema.node("paragraph", null, [schema.text(text4)]) : schema.node("paragraph");
}

function markTitle(text4: string): PMNode {
  return schema.node("heading", { level: 1 }, [schema.text(text4)]);
}

function shareCutLine(): PMNode {
  return schema.node("hrBlock");
}

/** 拿几块搭一篇文档。 */
function create(...block: PMNode[]): PMNode {
  return schema.node("doc", null, block);
}

/**
 * 一颗真的 `EditorState`，光标放在 `位置`。
 *
 * ⚠️ 把插件挂进 `plugins` 是**必须的**：`斜杠键.getState(state)` 读的是插件
 * 在 state 里那份槽位，不挂插件的话读出来恒为 `undefined`。
 */
function createState(document: PMNode, position2: number, plugin = slantBarPlugin(() => {})): EditorState {
  const initial = EditorState.create({ doc: document, plugins: [plugin] });
  return initial.apply(initial.tr.setSelection(TextSelection.create(initial.doc, position2)));
}

/**
 * 一颗**只够跑逻辑**的假 view：`采用` 要的只有 `state` 与 `dispatch`。
 *
 * ⚠️ 假 view 派出去的事务**真的会 `apply` 到 state 上**（与真 view 一致），
 * 否则"先删再执行"那条顺序就验不出真结果——执行函数读到的会是老 state。
 */
function createFakeView(state: EditorState): { view: EditorView; dispatched: Transaction[]; now: () => EditorState } {
  const dispatched: Transaction[] = [];
  let current = state;
  const view = {
    get state() {
      return current;
    },
    dispatch(tr: Transaction) {
      dispatched.push(tr);
      current = current.apply(tr);
    },
  } as unknown as EditorView;
  return { view, dispatched, now: () => current };
}

/** 文档坐标 → 光标停在"第 `块` 块里第 `偏` 个字符处"。 */
function positionInParagraph(document: PMNode, block: number, bias: number): number {
  let start5 = 0;
  for (let i = 0; i < block; i++) start5 += document.child(i).nodeSize;
  return start5 + 1 + bias;
}

/** 文档纯文本（用来断言"删掉了什么"）。 */
function fullText(document: PMNode): string {
  return document.textBetween(0, document.content.size, "\n", "￼");
}

/* ══ 一、表本身 ════════════════════════════════════════════════════════ */

group("一、表本身的账");

testCase("id 不重名", () => {
  const see = new Map<string, number>();
  for (const item5 of slashTable) see.set(item5.id, (see.get(item5.id) ?? 0) + 1);
  const heavy = [...see].filter(([, n]) => n > 1).map(([id]) => id);
  equal(heavy, [], "重名的 id（后一条永远选不到 = 死行）");
});

testCase("名称都非空", () => {
  const emptyValue = slashTable.filter((item5) => item5.label.trim() === "").map((item5) => item5.id);
  equal(emptyValue, [], "名称为空的项（面板上那一行是空白的）");
});

testCase("关键词全是 ASCII", () => {
  // ⚠️ 这一条不是洁癖：用户敲的是键盘上的字母，关键词里混进中文就**永远
  // 敲不出来**（`/标题` 这种查询在中文输入法下打出来是候选字，不是 `/` 后的查询串）。
  const broken = slashTable.filter((item5) => /[^\x20-\x7e]/.test(item5.closeKeyWord)).map((item5) => item5.id);
  equal(broken, [], "关键词里混了非 ASCII 的项");
});

testCase("每一条都筛得到自己（关键词里至少有一个词真能命中）", () => {
  const broken: string[] = [];
  for (const item5 of slashTable) {
    const word = item5.closeKeyWord.split(/\s+/).filter(Boolean);
    const match = word.some((w) => filterItem(w).includes(item5));
    if (!match) broken.push(item5.id);
  }
  equal(broken, [], "一个词都命中不了自己的项（关键词写了个查不到的东西）");
});

testCase("id 都是 `EditorCommand` 白名单里的（编译期由类型兜，这里再核一遍名单）", () => {
  // ⚠️ TypeScript 那层已经保证了（`斜杠项.id` 是 `EditorCommand`），这一条
  // 是**运行时**的第二次核对：将来谁把 `斜杠项.id` 放宽成 `string`，
  // 类型那层就silently失效，而这条断言还在。
  const whiteNameSingle: EditorCommand[] = [
    "h1", "h2", "h3", "ul", "ol", "task", "quote",
    "codeBlock", "mathBlock", "table", "hr", "footnote", "toc",
  ];
  const notAt = slashTable.map((item5) => item5.id).filter((id) => !whiteNameSingle.includes(id));
  equal(notAt, [], "表里有白名单外的 id");
  equal(slashTable.map((item5) => item5.id).sort(), [...whiteNameSingle].sort(), "表的内容与这份清单对不上（加了新的要一起改）");
});

testCase("**故意不在**表里的那些 id 确实不在", () => {
  // 判据在 `slash.ts` 文件头"哪些命令故意不在"那一段：要地址的（链接/图片）、
  // 行内动作（加粗那一族）、不是"插入什么"的（撤销那一族）、
  // 要求光标在表格里的（表格那十条）。
  const notShouldAt: EditorCommand[] = [
    "link", "image",
    "bold", "italic", "inlineCode", "strike", "highlight",
    "superscript", "subscript", "underline", "clearFormat",
    "undo", "redo",
    "tableRowAbove", "tableRowBelow", "tableColLeft", "tableColRight",
    "tableDelRow", "tableDelCol", "tableDel",
    "tableAlignLeft", "tableAlignCenter", "tableAlignRight",
    "insertText", "text",
  ];
  const mixedEnterComeDone = slashTable.filter((item5) => notShouldAt.includes(item5.id)).map((item5) => item5.id);
  equal(mixedEnterComeDone, [], "这些 id 不该出现在斜杠菜单里（理由见 slash.ts 文件头）");
});

testCase("`h4`/`h5`/`h6` 不在表里（表里只给到三级标题）", () => {
  // ⚠️ 这条写死是为了**留个记号**：真加进去时这条会红，提醒一起改
  // `docs/10` 那格与 `zh-ui.ts` 的中文（`Heading 1`~`3` 是那一批加的；
  // 2026-09-28 语言翻转**之前**那几句的原文是中文、住在 `en-ui.ts` 里）。
  const has = slashTable.some((item5) => item5.id === "h4" || item5.id === "h5" || item5.id === "h6");
  assertValue(!has, "表里出现了 h4/h5/h6——加了就要一起补译文与文档");
});

/* ══ 二、筛项 ══════════════════════════════════════════════════════════ */

group("二、筛项");

testCase("空查询命中**全部**（不是零条）", () => {
  equal(filterItem("").length, slashTable.length, "刚敲下 `/` 那一下要看到整张表");
});

testCase("只有空白也算空查询", () => {
  equal(filterItem("   ").length, slashTable.length, "全是空白的查询按空处理");
});

testCase("`h1` 只命中标题 1", () => {
  equal(filterItem("h1").map((item5) => item5.id), ["h1"], "`/h1`");
});

testCase("大小写无关", () => {
  equal(filterItem("H1").map((item5) => item5.id), filterItem("h1").map((item5) => item5.id), "`/H1` 与 `/h1` 一样");
  equal(filterItem("ToC").map((item5) => item5.id), ["toc"], "`/ToC`");
});

testCase("筛的是**子串**不是词：`head` 命中三条标题", () => {
  equal(filterItem("head").map((item5) => item5.id), ["h1", "h2", "h3"], "`/head`");
});

testCase("子串也跨词边界：`li` 命中列表那几条", () => {
  const obtain = filterItem("li").map((item5) => item5.id);
  assertValue(obtain.includes("ul") && obtain.includes("ol"), `\`/li\` 该命中 ul 与 ol，实际 ${JSON.stringify(obtain)}`);
});

testCase("顺序照表（不是按相关度重排）", () => {
  equal(filterItem("title").map((item5) => item5.id), ["h1", "h2", "h3"], "三条标题按表里的先后");
});

testCase("一条都不命中给空数组（不是抛错）", () => {
  equal(filterItem("zzz"), [], "`/zzz`");
  equal(filterItem("标"), [], "中文查不到——关键词是 ASCII，这是**已知边界**不是 bug");
});

testCase("`筛项` 不改表本身", () => {
  // ⚠️ 它返回的是 `斜杠表` 本身（空查询那条路）或 `filter` 出来的新数组。
  // 空查询那条路返回的是**同一个引用**，所以调用方一旦就地改它就会污染全表。
  // 这里把这条"危险但已知"记下来：真改了要能看见。
  const snapshot = JSON.stringify(slashTable);
  filterItem("h1");
  filterItem("");
  equal(JSON.stringify(slashTable), snapshot, "筛过之后表被改了");
  assertValue(filterItem("") === slashTable, "空查询返回的是表本身那个引用（**别就地改它**）");
});

/* ══ 三、认查询 ════════════════════════════════════════════════════════ */

group("三、认查询");

testCase("空段落里敲一个 `/` → 面板开，候选是整张表", () => {
  const document = create(paragraph2("/"));
  const state3 = recognizeQuery(createState(document, positionInParagraph(document, 0, 1)));
  assertValue(state3 !== null, "该认出来");
  equal(state3!.query, "", "查询是空串");
  equal(state3!.candidate.length, slashTable.length, "候选是整张表");
  equal(state3!.selected, 0, "默认高亮第 0 条");
});

testCase("`起` 是那个 `/` 的**文档坐标**（不是块内偏移）", () => {
  const document = create(paragraph2("甲"), paragraph2("/h1"));
  const state3 = recognizeQuery(createState(document, positionInParagraph(document, 1, 3)));
  assertValue(state3 !== null, "该认出来");
  equal(state3!.start5, positionInParagraph(document, 1, 0), "`起` 落在第二个段落的行首");
  // ⚠️ 这里比的是**文档坐标**（`textBetween` 收的那一套），不是 `全文` 里
  // 那个"块之间补 `\n`"的文本下标——两者差着块边界的偏移，混用会算错。
  equal(
    document.textBetween(state3!.start5, positionInParagraph(document, 1, 3)),
    "/h1",
    "从 `起` 到光标正好是 `/h1`",
  );
});

testCase("`/h1` → 查询是 `h1`、候选一条", () => {
  const document = create(paragraph2("/h1"));
  const state3 = recognizeQuery(createState(document, positionInParagraph(document, 0, 3)));
  equal(state3!.query, "h1", "查询不含斜杠");
  equal(state3!.candidate.map((item5) => item5.id), ["h1"], "候选");
});

testCase("⚠️ 不在行首的 `/` 不认（`3/4`）", () => {
  const document = create(paragraph2("3/4"));
  const state3 = recognizeQuery(createState(document, positionInParagraph(document, 0, 3)));
  equal(state3, null, "行中间的斜杠是普通字符");
});

testCase("⚠️ 查询里有空格就断（`/我 想`）", () => {
  const document = create(paragraph2("/我 想"));
  const state3 = recognizeQuery(createState(document, positionInParagraph(document, 0, 4)));
  equal(state3, null, "空格是「放弃」那个动作（与 emoji 的 `认前缀` 同一条判据）");
});

testCase("斜杠后面再一个斜杠也不认（`/a/b`）", () => {
  equal(queryCorrectRule.test("/a/b"), false, "正则的排除集里有 `/`");
  const document = create(paragraph2("/a/b"));
  equal(recognizeQuery(createState(document, positionInParagraph(document, 0, 4))), null, "路径形状的不该弹面板");
});

testCase("⚠️ 一条都不命中 → `null`（不留空面板）", () => {
  const document = create(paragraph2("/zzz"));
  equal(recognizeQuery(createState(document, positionInParagraph(document, 0, 4))), null, "`/zzz` 收起面板");
});

testCase("⚠️ 非 `paragraph` 不认：标题里敲 `/` 不弹", () => {
  const document = create(markTitle("/h1"));
  // ⚠️ 这一条是文件头点名的那个坏结果：「在标题里敲 `/`，选「标题 1」」——
  // 用户会以为菜单坏了。标题是文本块，所以拦它的**只有** `type.name` 那一条。
  const text = document.resolve(1);
  assertValue(text.parent.isTextblock, "前提：标题是文本块（否则这条拦的是别的东西）");
  equal(recognizeQuery(createState(document, 2)), null, "标题里不认");
});

testCase("非文本块（分割线那一颗）不认", () => {
  const document = create(paragraph2("甲"), shareCutLine());
  // ⚠️ 顶层文档的坐标里**块前面没有"开括号"**（那是段落内部才有的事，
  // 所以 `段内位置` 那个 `+1` 在这儿不能用）：第二块就停在第一块的 nodeSize 处。
  const position2 = document.child(0).nodeSize;
  const initial = EditorState.create({ doc: document, plugins: [slantBarPlugin(() => {})] });
  const state3 = recognizeQuery(initial.apply(initial.tr.setSelection(NodeSelection.create(initial.doc, position2))));
  equal(state3, null, "停在叶块上时不该弹");
});

testCase("有选区（非空）不认", () => {
  const document = create(paragraph2("/h1"));
  const initial = EditorState.create({ doc: document, plugins: [slantBarPlugin(() => {})] });
  const withSelect = initial.apply(initial.tr.setSelection(TextSelection.create(initial.doc, 1, 3)));
  equal(recognizeQuery(withSelect), null, "选中了一段的时候不弹");
});

testCase("光标在 `/` **前面**不认（用户把光标挪回去了）", () => {
  const document = create(paragraph2("/h1"));
  // 光标在行首、斜杠在它后面：`textBetween(0, 0)` 是空串，不匹配 `^\/`
  equal(recognizeQuery(createState(document, positionInParagraph(document, 0, 0))), null, "光标在斜杠之前");
});

testCase("光标在段落中间而斜杠在行首、中间有别的字 → 不认", () => {
  // `/h1好` 的光标停在 `好` 后面：串是 `/h1好`，正则过得了（没有空白），
  // 于是**会认**——它把 `h1好` 当成查询，筛出来是空 → `null`。
  // ⚠️ 这条记的是"为什么它最后仍然是 null"：不是正则拦的，是筛空拦的。
  const document = create(paragraph2("/h1好"));
  equal(recognizeQuery(createState(document, positionInParagraph(document, 0, 4))), null, "查询 `h1好` 筛不到东西");
});

testCase("第二个段落里敲 `/` 一样认（`起` 跟着段落走）", () => {
  const document = create(paragraph2("甲"), paragraph2("乙"), paragraph2("/"));
  const state3 = recognizeQuery(createState(document, positionInParagraph(document, 2, 1)));
  assertValue(state3 !== null, "该认出来");
  equal(state3!.start5, positionInParagraph(document, 2, 0), "`起` 在第三个段落的行首");
});

/* ══ 四、采用 ══════════════════════════════════════════════════════════ */

group("四、采用");

testCase("删掉 `/查询` 那一段，再把 id 交出去", () => {
  const document = create(paragraph2("/h1"));
  const { view, dispatched, now } = createFakeView(createState(document, positionInParagraph(document, 0, 3)));
  const received: EditorCommand[] = [];
  adoptUse(view, recognizeQuery(now())!, 0, (id) => received.push(id));
  equal(received, ["h1"], "执行收到的是那条 id");
  equal(dispatched.length, 1, "先派一笔删");
  equal(fullText(now().doc), "", "`/h1` 那三个字被删干净了");
});

testCase("⚠️ 顺序不能反：执行函数读到的**已经是删完的** state", () => {
  // 这是文件头那条"两笔、顺序不能反"的可运行版本：反过来的话，
  // `/标题` 那三个字会被标题命令当成正文带进去，变成 `# /标题`。
  const document = create(paragraph2("/ul"));
  const { view, now } = createFakeView(createState(document, positionInParagraph(document, 0, 3)));
  let executeLineTimeSeeTo: string | null = null;
  adoptUse(view, recognizeQuery(now())!, 0, () => {
    executeLineTimeSeeTo = fullText(now().doc);
  });
  equal(executeLineTimeSeeTo, "", "执行那一刻文档里已经没有 `/ul` 了");
});

testCase("删的范围是 [起, 光标]——`/` 之前写好的字一个不动", () => {
  const document = create(paragraph2("/h1"));
  const { view, now } = createFakeView(createState(document, positionInParagraph(document, 0, 3)));
  adoptUse(view, recognizeQuery(now())!, 0, () => {});
  equal(fullText(now().doc), "", "整段只剩空");
  // 换一个：斜杠前面有字（那种情况下 `认查询` 本来就不认，但 `采用` 不假设这一点）
  const document2 = create(paragraph2("甲/h1"));
  const { view: v2, now: n2 } = createFakeView(createState(document2, positionInParagraph(document2, 0, 4)));
  const state3 = recognizeQuery(n2());
  equal(state3, null, "前提：`甲/h1` 认不出来（斜杠不在行首）");
  // 手动造一份"起在斜杠处"的状态喂给 `采用`：验的是删除范围的计算，不是认查询。
  adoptUse(v2, { start5: positionInParagraph(document2, 0, 1), query: "h1", candidate: slashTable, selected: 0 }, 0, () => {});
  equal(fullText(n2().doc), "甲", "`甲` 留着，`/h1` 被删掉");
});

testCase("选中的是第 `第几条` 个候选（不是永远第 0 条）", () => {
  const document = create(paragraph2("/t"));
  const { view, now } = createFakeView(createState(document, positionInParagraph(document, 0, 2)));
  const state3 = recognizeQuery(now())!;
  assertValue(state3.candidate.length > 1, "前提：`/t` 筛出不止一条");
  const received: EditorCommand[] = [];
  adoptUse(view, state3, 1, (id) => received.push(id));
  equal(received, [state3.candidate[1]!.id], "收到的是第 1 条");
});

testCase("越界（第几条 超出）→ 不派事务、不执行", () => {
  const document = create(paragraph2("/h1"));
  const { view, dispatched } = createFakeView(createState(document, positionInParagraph(document, 0, 3)));
  const received: EditorCommand[] = [];
  adoptUse(view, recognizeQuery(view.state)!, 99, (id) => received.push(id));
  equal(dispatched.length, 0, "不该派事务");
  equal(received, [], "不该执行");
});

testCase("光标在 `起` 之前 → 不动（防越界删除）", () => {
  const document = create(paragraph2("/h1"));
  const state = createState(document, positionInParagraph(document, 0, 1));
  const { view, dispatched } = createFakeView(state);
  const received: EditorCommand[] = [];
  // 假装面板记的 `起` 在光标后面（真跑不会出现，但 `采用` 不许在这上面崩）
  adoptUse(view, { start5: positionInParagraph(document, 0, 3), query: "h", candidate: slashTable, selected: 0 }, 0, (id) =>
    received.push(id),
  );
  equal(dispatched.length, 0, "不该派事务");
  equal(received, [], "不该执行");
});

/* ══ 五、插件 ══════════════════════════════════════════════════════════ */

group("五、插件");

testCase("只读实例不挂（`开 = false` → 零条）", () => {
  equal(slantBarMenu(false, () => {}), [], "关的时候一条插件都不给");
});

testCase("`开 = true` → 一条插件（`$prose` 那层壳）", () => {
  // ⚠️ 只数条数：`$prose` 返回的是一个 `(ctx) => Plugin` 的函数，
  // 不在 Milkdown 的 `Ctx` 里跑不起来（那要 `Editor.make()`）。
  equal(slantBarMenu(true, () => {}).length, 1, "开的时候给一条");
});

testCase("插件建出来的**那一刻**不碰 `document`（面板是懒建的）", () => {
  // ⚠️ 这条是这份测试**跑得起来**的前提：本仓没有 jsdom，`globalThis.document`
  // 在 node 里是 `undefined`，只要插件构造里有一句 `document.createElement`
  // 这条就会炸。它同时也是给 `view()` 那段留的边界——面板只在真浏览器里建。
  assertValue(typeof (globalThis as { document?: unknown }).document === "undefined", "前提：node 里没有 document");
  const plugin = slantBarPlugin(() => {});
  assertValue(plugin !== null, "插件建出来了");
});

testCase("`init`：造 state 时就认出来了", () => {
  const document = create(paragraph2("/h1"));
  const state = createState(document, positionInParagraph(document, 0, 3));
  const state3 = slashKey.getState(state);
  assertValue(state3 !== null && state3 !== undefined, "state 里该有面板状态");
  equal(state3!.query, "h1", "查询");
});

testCase("`apply`：改了文档就重算", () => {
  const document = create(paragraph2("/h1"));
  const state = createState(document, positionInParagraph(document, 0, 3));
  // 再敲一个 `2`：光标跟着往后，查询该变成 `h12` → 筛不到东西 → null
  const newValue = state.apply(state.tr.insertText("2", positionInParagraph(document, 0, 3)));
  equal(slashKey.getState(newValue), null, "`/h12` 筛不到东西，面板该收");
});

testCase("⚠️ `apply`：带 meta 的事务**原样采用**（按 ↓ 的高亮不会被重算冲掉）", () => {
  const document = create(paragraph2("/"));
  const state = createState(document, positionInParagraph(document, 0, 1));
  const state3 = slashKey.getState(state)!;
  equal(state3.selected, 0, "起始高亮");
  // 这一笔**不改文档**（只带 meta）——正是"按 ↓"那一笔
  const newValue = state.apply(state.tr.setMeta(slashKey, { ...state3, selected: 3 }));
  equal(slashKey.getState(newValue)!.selected, 3, "高亮跟着 meta 走");
  // 反面对照：不带 meta 的事务走重算那条路，会把它**重置回 0**
  const again = newValue.apply(newValue.tr.setMeta("别的键", 1));
  equal(slashKey.getState(again)!.selected, 0, "不带本插件的 meta 时重算回 0（这就是为什么必须有那条分支）");
});

testCase("`apply`：meta 是 `null` 时面板**收起来**", () => {
  const document = create(paragraph2("/"));
  const state = createState(document, positionInParagraph(document, 0, 1));
  const newValue = state.apply(state.tr.setMeta(slashKey, null));
  equal(slashKey.getState(newValue), null, "显式 null 就是「关」");
});

testCase("`handleKeyDown`：面板没开时一条键都不接管", () => {
  const document = create(paragraph2("甲"));
  const state = createState(document, positionInParagraph(document, 0, 1));
  const { view, dispatched } = createFakeView(state);
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]) {
    equal(pluginShortcut(state, view, key), false, `面板没开时 \`${key}\` 不该被吃掉`);
  }
  equal(dispatched.length, 0, "一条事务都不该派");
});

testCase("`handleKeyDown`：输入法组合态时不接管（**硬要求**）", () => {
  const document = create(paragraph2("/"));
  const state = createState(document, positionInParagraph(document, 0, 1));
  const { view, dispatched } = createFakeView(state);
  assertValue(slashKey.getState(state) !== null, "前提：面板确实开着");
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]) {
    equal(pluginShortcut(state, view, key, true), false, `组合态下 \`${key}\` 不许被吃掉`);
  }
  equal(dispatched.length, 0, "组合态下不该派任何事务");
});

testCase("`handleKeyDown`：↓/↑ 改高亮并环绕", () => {
  const document = create(paragraph2("/"));
  const state = createState(document, positionInParagraph(document, 0, 1));
  const { view, now } = createFakeView(state);
  const itemNumber2 = slashKey.getState(state)!.candidate.length;
  equal(pluginShortcut(now(), view, "ArrowDown"), true, "↓ 该被吃掉");
  equal(slashKey.getState(now())!.selected, 1, "高亮 +1");
  equal(pluginShortcut(now(), view, "ArrowUp"), true, "↑ 该被吃掉");
  equal(slashKey.getState(now())!.selected, 0, "高亮 −1");
  // 从 0 往上：环绕到末条
  equal(pluginShortcut(now(), view, "ArrowUp"), true, "↑ 在第一条上仍该被吃掉");
  equal(slashKey.getState(now())!.selected, itemNumber2 - 1, "环绕到末条");
  equal(pluginShortcut(now(), view, "ArrowDown"), true, "↓ 在末条上仍该被吃掉");
  equal(slashKey.getState(now())!.selected, 0, "环绕回第一条");
});

testCase("`handleKeyDown`：回车/`Tab` = 采用当前高亮那条", () => {
  for (const key of ["Enter", "Tab"]) {
    const document = create(paragraph2("/h1"));
    const received: EditorCommand[] = [];
    // ⚠️ 执行函数是从**插件建出来那一刻**捕获的（`斜杠插件(执行)`），
    // 所以记这笔账要拿一颗带记账的插件建 state，不能用默认那颗。
    const fake = createFakeView(createState(document, positionInParagraph(document, 0, 3), slantBarPlugin((id) => received.push(id))));
    equal(pluginShortcut(fake.now(), fake.view, key), true, `${key} 该被吃掉`);
    equal(received, ["h1"], `${key} 该跑那条命令`);
    equal(fullText(fake.now().doc), "", `${key} 该先把 \`/h1\` 删掉`);
  }
});

testCase("`handleKeyDown`：回车采用的是**高亮那条**，不是永远第一条", () => {
  const document = create(paragraph2("/"));
  const received: EditorCommand[] = [];
  const fake = createFakeView(createState(document, positionInParagraph(document, 0, 1), slantBarPlugin((id) => received.push(id))));
  const state3 = slashKey.getState(fake.now())!;
  assertValue(state3.candidate.length > 2, "前提：`/` 筛出三条以上");
  pluginShortcut(fake.now(), fake.view, "ArrowDown");
  pluginShortcut(fake.now(), fake.view, "ArrowDown");
  pluginShortcut(fake.now(), fake.view, "Enter");
  equal(received, [state3.candidate[2]!.id], "按了两下 ↓ 之后回车，跑的是第 2 条");
});

testCase("`handleKeyDown`：`Esc` 不删那个斜杠（只收面板）", () => {
  const document = create(paragraph2("/h1"));
  const state = createState(document, positionInParagraph(document, 0, 3));
  const { view, dispatched } = createFakeView(state);
  equal(pluginShortcut(state, view, "Escape"), true, "Esc 该被吃掉");
  equal(dispatched.length, 0, "⚠️ 一笔事务都不派——那个 `/` 是用户敲的字，不许替他删");
});

testCase("`handleKeyDown`：别的键一律不管", () => {
  const document = create(paragraph2("/"));
  const state = createState(document, positionInParagraph(document, 0, 1));
  const { view } = createFakeView(state);
  for (const key of ["a", "Backspace", " ", "PageDown", "F5"]) {
    equal(pluginShortcut(state, view, key), false, `\`${key}\` 不该被面板吃掉`);
  }
});

/**
 * 拿假 view 敲一下键。
 *
 * ⚠️ 走的是 `插件.props.handleKeyDown`——`Plugin` 实例上的 `props` 是公开的
 * （ProseMirror 把编辑器传进来的那几件挂在这儿），所以不必建真 `EditorView`。
 */
function pluginShortcut(
  state: EditorState,
  view: EditorView,
  key: string,
  composing = false,
): boolean {
  const plugin = state.plugins.find((p) => p.spec.key === slashKey) ?? slantBarPlugin(() => {});
  const placeManage = plugin.props.handleKeyDown;
  if (!placeManage) throw new Error("插件上没有 handleKeyDown");
  return (
    placeManage(view, {
      key: key,
      isComposing: composing,
      preventDefault() {},
    } as unknown as KeyboardEvent) === true
  );
}

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(60)}`);
console.log(`通过 ${passed}，失败 ${failure}`);
if (failure) {
  console.log("失败清单：");
  for (const item5 of failureList) console.log(`  · ${item5}`);
  process.exitCode = 1;
}
