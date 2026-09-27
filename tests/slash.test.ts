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
  斜杠表,
  查询正则,
  筛项,
  认查询,
  斜杠键,
  斜杠菜单,
  斜杠插件,
  采用,
  type 斜杠状态,
} from "../src/editor/slash";
import type { EditorCommand } from "../src/editor/create-types";

/* ── 最小工装 ─────────────────────────────────────────────────────────── */

let 通过 = 0;
let 失败 = 0;
const 失败清单: string[] = [];
let 当前组 = "";

function 组(名: string): void {
  当前组 = 名;
  console.log(`\n── ${名} ${"─".repeat(Math.max(0, 56 - 名.length))}`);
}

function 测(名称: string, 体: () => void): void {
  try {
    体();
    通过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    失败++;
    失败清单.push(`${当前组} / ${名称}`);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a !== b) throw new Error(`${说明}：期望 ${b}，实际 ${a}`);
}

function 真(值: boolean, 说明: string): void {
  if (!值) throw new Error(说明);
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
function 段(文 = ""): PMNode {
  return 文 ? schema.node("paragraph", null, [schema.text(文)]) : schema.node("paragraph");
}

function 标题(文: string): PMNode {
  return schema.node("heading", { level: 1 }, [schema.text(文)]);
}

function 分割线(): PMNode {
  return schema.node("hrBlock");
}

/** 拿几块搭一篇文档。 */
function 建(...块: PMNode[]): PMNode {
  return schema.node("doc", null, 块);
}

/**
 * 一颗真的 `EditorState`，光标放在 `位置`。
 *
 * ⚠️ 把插件挂进 `plugins` 是**必须的**：`斜杠键.getState(state)` 读的是插件
 * 在 state 里那份槽位，不挂插件的话读出来恒为 `undefined`。
 */
function 建状态(文档: PMNode, 位置: number, 插件 = 斜杠插件(() => {})): EditorState {
  const 初 = EditorState.create({ doc: 文档, plugins: [插件] });
  return 初.apply(初.tr.setSelection(TextSelection.create(初.doc, 位置)));
}

/**
 * 一颗**只够跑逻辑**的假 view：`采用` 要的只有 `state` 与 `dispatch`。
 *
 * ⚠️ 假 view 派出去的事务**真的会 `apply` 到 state 上**（与真 view 一致），
 * 否则"先删再执行"那条顺序就验不出真结果——执行函数读到的会是老 state。
 */
function 建假view(状态: EditorState): { view: EditorView; 派过: Transaction[]; 现在: () => EditorState } {
  const 派过: Transaction[] = [];
  let 当前 = 状态;
  const view = {
    get state() {
      return 当前;
    },
    dispatch(tr: Transaction) {
      派过.push(tr);
      当前 = 当前.apply(tr);
    },
  } as unknown as EditorView;
  return { view, 派过, 现在: () => 当前 };
}

/** 文档坐标 → 光标停在"第 `块` 块里第 `偏` 个字符处"。 */
function 段内位置(文档: PMNode, 块: number, 偏: number): number {
  let 起 = 0;
  for (let i = 0; i < 块; i++) 起 += 文档.child(i).nodeSize;
  return 起 + 1 + 偏;
}

/** 文档纯文本（用来断言"删掉了什么"）。 */
function 全文(文档: PMNode): string {
  return 文档.textBetween(0, 文档.content.size, "\n", "￼");
}

/* ══ 一、表本身 ════════════════════════════════════════════════════════ */

组("一、表本身的账");

测("id 不重名", () => {
  const 见 = new Map<string, number>();
  for (const 项 of 斜杠表) 见.set(项.id, (见.get(项.id) ?? 0) + 1);
  const 重 = [...见].filter(([, n]) => n > 1).map(([id]) => id);
  等(重, [], "重名的 id（后一条永远选不到 = 死行）");
});

测("名称都非空", () => {
  const 空 = 斜杠表.filter((项) => 项.名称.trim() === "").map((项) => 项.id);
  等(空, [], "名称为空的项（面板上那一行是空白的）");
});

测("关键词全是 ASCII", () => {
  // ⚠️ 这一条不是洁癖：用户敲的是键盘上的字母，关键词里混进中文就**永远
  // 敲不出来**（`/标题` 这种查询在中文输入法下打出来是候选字，不是 `/` 后的查询串）。
  const 坏 = 斜杠表.filter((项) => /[^\x20-\x7e]/.test(项.关键词)).map((项) => 项.id);
  等(坏, [], "关键词里混了非 ASCII 的项");
});

测("每一条都筛得到自己（关键词里至少有一个词真能命中）", () => {
  const 坏: string[] = [];
  for (const 项 of 斜杠表) {
    const 词 = 项.关键词.split(/\s+/).filter(Boolean);
    const 命中 = 词.some((w) => 筛项(w).includes(项));
    if (!命中) 坏.push(项.id);
  }
  等(坏, [], "一个词都命中不了自己的项（关键词写了个查不到的东西）");
});

测("id 都是 `EditorCommand` 白名单里的（编译期由类型兜，这里再核一遍名单）", () => {
  // ⚠️ TypeScript 那层已经保证了（`斜杠项.id` 是 `EditorCommand`），这一条
  // 是**运行时**的第二次核对：将来谁把 `斜杠项.id` 放宽成 `string`，
  // 类型那层就silently失效，而这条断言还在。
  const 白名单: EditorCommand[] = [
    "h1", "h2", "h3", "ul", "ol", "task", "quote",
    "codeBlock", "mathBlock", "table", "hr", "footnote", "toc",
  ];
  const 不在 = 斜杠表.map((项) => 项.id).filter((id) => !白名单.includes(id));
  等(不在, [], "表里有白名单外的 id");
  等(斜杠表.map((项) => 项.id).sort(), [...白名单].sort(), "表的内容与这份清单对不上（加了新的要一起改）");
});

测("**故意不在**表里的那些 id 确实不在", () => {
  // 判据在 `slash.ts` 文件头"哪些命令故意不在"那一段：要地址的（链接/图片）、
  // 行内动作（加粗那一族）、不是"插入什么"的（撤销那一族）、
  // 要求光标在表格里的（表格那十条）。
  const 不该在: EditorCommand[] = [
    "link", "image",
    "bold", "italic", "inlineCode", "strike", "highlight",
    "superscript", "subscript", "underline", "clearFormat",
    "undo", "redo",
    "tableRowAbove", "tableRowBelow", "tableColLeft", "tableColRight",
    "tableDelRow", "tableDelCol", "tableDel",
    "tableAlignLeft", "tableAlignCenter", "tableAlignRight",
    "insertText", "text",
  ];
  const 混进来了 = 斜杠表.filter((项) => 不该在.includes(项.id)).map((项) => 项.id);
  等(混进来了, [], "这些 id 不该出现在斜杠菜单里（理由见 slash.ts 文件头）");
});

测("`h4`/`h5`/`h6` 不在表里（表里只给到三级标题）", () => {
  // ⚠️ 这条写死是为了**留个记号**：真加进去时这条会红，提醒一起改
  // `docs/10` 那格与 `en-ui.ts` 的英文（`标题 1`~`3` 是那一批加的）。
  const 有 = 斜杠表.some((项) => 项.id === "h4" || 项.id === "h5" || 项.id === "h6");
  真(!有, "表里出现了 h4/h5/h6——加了就要一起补英文与文档");
});

/* ══ 二、筛项 ══════════════════════════════════════════════════════════ */

组("二、筛项");

测("空查询命中**全部**（不是零条）", () => {
  等(筛项("").length, 斜杠表.length, "刚敲下 `/` 那一下要看到整张表");
});

测("只有空白也算空查询", () => {
  等(筛项("   ").length, 斜杠表.length, "全是空白的查询按空处理");
});

测("`h1` 只命中标题 1", () => {
  等(筛项("h1").map((项) => 项.id), ["h1"], "`/h1`");
});

测("大小写无关", () => {
  等(筛项("H1").map((项) => 项.id), 筛项("h1").map((项) => 项.id), "`/H1` 与 `/h1` 一样");
  等(筛项("ToC").map((项) => 项.id), ["toc"], "`/ToC`");
});

测("筛的是**子串**不是词：`head` 命中三条标题", () => {
  等(筛项("head").map((项) => 项.id), ["h1", "h2", "h3"], "`/head`");
});

测("子串也跨词边界：`li` 命中列表那几条", () => {
  const 得 = 筛项("li").map((项) => 项.id);
  真(得.includes("ul") && 得.includes("ol"), `\`/li\` 该命中 ul 与 ol，实际 ${JSON.stringify(得)}`);
});

测("顺序照表（不是按相关度重排）", () => {
  等(筛项("title").map((项) => 项.id), ["h1", "h2", "h3"], "三条标题按表里的先后");
});

测("一条都不命中给空数组（不是抛错）", () => {
  等(筛项("zzz"), [], "`/zzz`");
  等(筛项("标"), [], "中文查不到——关键词是 ASCII，这是**已知边界**不是 bug");
});

测("`筛项` 不改表本身", () => {
  // ⚠️ 它返回的是 `斜杠表` 本身（空查询那条路）或 `filter` 出来的新数组。
  // 空查询那条路返回的是**同一个引用**，所以调用方一旦就地改它就会污染全表。
  // 这里把这条"危险但已知"记下来：真改了要能看见。
  const 快照 = JSON.stringify(斜杠表);
  筛项("h1");
  筛项("");
  等(JSON.stringify(斜杠表), 快照, "筛过之后表被改了");
  真(筛项("") === 斜杠表, "空查询返回的是表本身那个引用（**别就地改它**）");
});

/* ══ 三、认查询 ════════════════════════════════════════════════════════ */

组("三、认查询");

测("空段落里敲一个 `/` → 面板开，候选是整张表", () => {
  const 文档 = 建(段("/"));
  const 状 = 认查询(建状态(文档, 段内位置(文档, 0, 1)));
  真(状 !== null, "该认出来");
  等(状!.查询, "", "查询是空串");
  等(状!.候选.length, 斜杠表.length, "候选是整张表");
  等(状!.选中, 0, "默认高亮第 0 条");
});

测("`起` 是那个 `/` 的**文档坐标**（不是块内偏移）", () => {
  const 文档 = 建(段("甲"), 段("/h1"));
  const 状 = 认查询(建状态(文档, 段内位置(文档, 1, 3)));
  真(状 !== null, "该认出来");
  等(状!.起, 段内位置(文档, 1, 0), "`起` 落在第二个段落的行首");
  // ⚠️ 这里比的是**文档坐标**（`textBetween` 收的那一套），不是 `全文` 里
  // 那个"块之间补 `\n`"的文本下标——两者差着块边界的偏移，混用会算错。
  等(
    文档.textBetween(状!.起, 段内位置(文档, 1, 3)),
    "/h1",
    "从 `起` 到光标正好是 `/h1`",
  );
});

测("`/h1` → 查询是 `h1`、候选一条", () => {
  const 文档 = 建(段("/h1"));
  const 状 = 认查询(建状态(文档, 段内位置(文档, 0, 3)));
  等(状!.查询, "h1", "查询不含斜杠");
  等(状!.候选.map((项) => 项.id), ["h1"], "候选");
});

测("⚠️ 不在行首的 `/` 不认（`3/4`）", () => {
  const 文档 = 建(段("3/4"));
  const 状 = 认查询(建状态(文档, 段内位置(文档, 0, 3)));
  等(状, null, "行中间的斜杠是普通字符");
});

测("⚠️ 查询里有空格就断（`/我 想`）", () => {
  const 文档 = 建(段("/我 想"));
  const 状 = 认查询(建状态(文档, 段内位置(文档, 0, 4)));
  等(状, null, "空格是「放弃」那个动作（与 emoji 的 `认前缀` 同一条判据）");
});

测("斜杠后面再一个斜杠也不认（`/a/b`）", () => {
  等(查询正则.test("/a/b"), false, "正则的排除集里有 `/`");
  const 文档 = 建(段("/a/b"));
  等(认查询(建状态(文档, 段内位置(文档, 0, 4))), null, "路径形状的不该弹面板");
});

测("⚠️ 一条都不命中 → `null`（不留空面板）", () => {
  const 文档 = 建(段("/zzz"));
  等(认查询(建状态(文档, 段内位置(文档, 0, 4))), null, "`/zzz` 收起面板");
});

测("⚠️ 非 `paragraph` 不认：标题里敲 `/` 不弹", () => {
  const 文档 = 建(标题("/h1"));
  // ⚠️ 这一条是文件头点名的那个坏结果：「在标题里敲 `/`，选「标题 1」」——
  // 用户会以为菜单坏了。标题是文本块，所以拦它的**只有** `type.name` 那一条。
  const $文 = 文档.resolve(1);
  真($文.parent.isTextblock, "前提：标题是文本块（否则这条拦的是别的东西）");
  等(认查询(建状态(文档, 2)), null, "标题里不认");
});

测("非文本块（分割线那一颗）不认", () => {
  const 文档 = 建(段("甲"), 分割线());
  // ⚠️ 顶层文档的坐标里**块前面没有"开括号"**（那是段落内部才有的事，
  // 所以 `段内位置` 那个 `+1` 在这儿不能用）：第二块就停在第一块的 nodeSize 处。
  const 位置 = 文档.child(0).nodeSize;
  const 初 = EditorState.create({ doc: 文档, plugins: [斜杠插件(() => {})] });
  const 状 = 认查询(初.apply(初.tr.setSelection(NodeSelection.create(初.doc, 位置))));
  等(状, null, "停在叶块上时不该弹");
});

测("有选区（非空）不认", () => {
  const 文档 = 建(段("/h1"));
  const 初 = EditorState.create({ doc: 文档, plugins: [斜杠插件(() => {})] });
  const 带选 = 初.apply(初.tr.setSelection(TextSelection.create(初.doc, 1, 3)));
  等(认查询(带选), null, "选中了一段的时候不弹");
});

测("光标在 `/` **前面**不认（用户把光标挪回去了）", () => {
  const 文档 = 建(段("/h1"));
  // 光标在行首、斜杠在它后面：`textBetween(0, 0)` 是空串，不匹配 `^\/`
  等(认查询(建状态(文档, 段内位置(文档, 0, 0))), null, "光标在斜杠之前");
});

测("光标在段落中间而斜杠在行首、中间有别的字 → 不认", () => {
  // `/h1好` 的光标停在 `好` 后面：串是 `/h1好`，正则过得了（没有空白），
  // 于是**会认**——它把 `h1好` 当成查询，筛出来是空 → `null`。
  // ⚠️ 这条记的是"为什么它最后仍然是 null"：不是正则拦的，是筛空拦的。
  const 文档 = 建(段("/h1好"));
  等(认查询(建状态(文档, 段内位置(文档, 0, 4))), null, "查询 `h1好` 筛不到东西");
});

测("第二个段落里敲 `/` 一样认（`起` 跟着段落走）", () => {
  const 文档 = 建(段("甲"), 段("乙"), 段("/"));
  const 状 = 认查询(建状态(文档, 段内位置(文档, 2, 1)));
  真(状 !== null, "该认出来");
  等(状!.起, 段内位置(文档, 2, 0), "`起` 在第三个段落的行首");
});

/* ══ 四、采用 ══════════════════════════════════════════════════════════ */

组("四、采用");

测("删掉 `/查询` 那一段，再把 id 交出去", () => {
  const 文档 = 建(段("/h1"));
  const { view, 派过, 现在 } = 建假view(建状态(文档, 段内位置(文档, 0, 3)));
  const 收到: EditorCommand[] = [];
  采用(view, 认查询(现在())!, 0, (id) => 收到.push(id));
  等(收到, ["h1"], "执行收到的是那条 id");
  等(派过.length, 1, "先派一笔删");
  等(全文(现在().doc), "", "`/h1` 那三个字被删干净了");
});

测("⚠️ 顺序不能反：执行函数读到的**已经是删完的** state", () => {
  // 这是文件头那条"两笔、顺序不能反"的可运行版本：反过来的话，
  // `/标题` 那三个字会被标题命令当成正文带进去，变成 `# /标题`。
  const 文档 = 建(段("/ul"));
  const { view, 现在 } = 建假view(建状态(文档, 段内位置(文档, 0, 3)));
  let 执行时看到: string | null = null;
  采用(view, 认查询(现在())!, 0, () => {
    执行时看到 = 全文(现在().doc);
  });
  等(执行时看到, "", "执行那一刻文档里已经没有 `/ul` 了");
});

测("删的范围是 [起, 光标]——`/` 之前写好的字一个不动", () => {
  const 文档 = 建(段("/h1"));
  const { view, 现在 } = 建假view(建状态(文档, 段内位置(文档, 0, 3)));
  采用(view, 认查询(现在())!, 0, () => {});
  等(全文(现在().doc), "", "整段只剩空");
  // 换一个：斜杠前面有字（那种情况下 `认查询` 本来就不认，但 `采用` 不假设这一点）
  const 文档2 = 建(段("甲/h1"));
  const { view: v2, 现在: n2 } = 建假view(建状态(文档2, 段内位置(文档2, 0, 4)));
  const 状 = 认查询(n2());
  等(状, null, "前提：`甲/h1` 认不出来（斜杠不在行首）");
  // 手动造一份"起在斜杠处"的状态喂给 `采用`：验的是删除范围的计算，不是认查询。
  采用(v2, { 起: 段内位置(文档2, 0, 1), 查询: "h1", 候选: 斜杠表, 选中: 0 }, 0, () => {});
  等(全文(n2().doc), "甲", "`甲` 留着，`/h1` 被删掉");
});

测("选中的是第 `第几条` 个候选（不是永远第 0 条）", () => {
  const 文档 = 建(段("/t"));
  const { view, 现在 } = 建假view(建状态(文档, 段内位置(文档, 0, 2)));
  const 状 = 认查询(现在())!;
  真(状.候选.length > 1, "前提：`/t` 筛出不止一条");
  const 收到: EditorCommand[] = [];
  采用(view, 状, 1, (id) => 收到.push(id));
  等(收到, [状.候选[1]!.id], "收到的是第 1 条");
});

测("越界（第几条 超出）→ 不派事务、不执行", () => {
  const 文档 = 建(段("/h1"));
  const { view, 派过 } = 建假view(建状态(文档, 段内位置(文档, 0, 3)));
  const 收到: EditorCommand[] = [];
  采用(view, 认查询(view.state)!, 99, (id) => 收到.push(id));
  等(派过.length, 0, "不该派事务");
  等(收到, [], "不该执行");
});

测("光标在 `起` 之前 → 不动（防越界删除）", () => {
  const 文档 = 建(段("/h1"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 1));
  const { view, 派过 } = 建假view(状态);
  const 收到: EditorCommand[] = [];
  // 假装面板记的 `起` 在光标后面（真跑不会出现，但 `采用` 不许在这上面崩）
  采用(view, { 起: 段内位置(文档, 0, 3), 查询: "h", 候选: 斜杠表, 选中: 0 }, 0, (id) =>
    收到.push(id),
  );
  等(派过.length, 0, "不该派事务");
  等(收到, [], "不该执行");
});

/* ══ 五、插件 ══════════════════════════════════════════════════════════ */

组("五、插件");

测("只读实例不挂（`开 = false` → 零条）", () => {
  等(斜杠菜单(false, () => {}), [], "关的时候一条插件都不给");
});

测("`开 = true` → 一条插件（`$prose` 那层壳）", () => {
  // ⚠️ 只数条数：`$prose` 返回的是一个 `(ctx) => Plugin` 的函数，
  // 不在 Milkdown 的 `Ctx` 里跑不起来（那要 `Editor.make()`）。
  等(斜杠菜单(true, () => {}).length, 1, "开的时候给一条");
});

测("插件建出来的**那一刻**不碰 `document`（面板是懒建的）", () => {
  // ⚠️ 这条是这份测试**跑得起来**的前提：本仓没有 jsdom，`globalThis.document`
  // 在 node 里是 `undefined`，只要插件构造里有一句 `document.createElement`
  // 这条就会炸。它同时也是给 `view()` 那段留的边界——面板只在真浏览器里建。
  真(typeof (globalThis as { document?: unknown }).document === "undefined", "前提：node 里没有 document");
  const 插件 = 斜杠插件(() => {});
  真(插件 !== null, "插件建出来了");
});

测("`init`：造 state 时就认出来了", () => {
  const 文档 = 建(段("/h1"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 3));
  const 状 = 斜杠键.getState(状态);
  真(状 !== null && 状 !== undefined, "state 里该有面板状态");
  等(状!.查询, "h1", "查询");
});

测("`apply`：改了文档就重算", () => {
  const 文档 = 建(段("/h1"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 3));
  // 再敲一个 `2`：光标跟着往后，查询该变成 `h12` → 筛不到东西 → null
  const 新 = 状态.apply(状态.tr.insertText("2", 段内位置(文档, 0, 3)));
  等(斜杠键.getState(新), null, "`/h12` 筛不到东西，面板该收");
});

测("⚠️ `apply`：带 meta 的事务**原样采用**（按 ↓ 的高亮不会被重算冲掉）", () => {
  const 文档 = 建(段("/"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 1));
  const 状 = 斜杠键.getState(状态)!;
  等(状.选中, 0, "起始高亮");
  // 这一笔**不改文档**（只带 meta）——正是"按 ↓"那一笔
  const 新 = 状态.apply(状态.tr.setMeta(斜杠键, { ...状, 选中: 3 }));
  等(斜杠键.getState(新)!.选中, 3, "高亮跟着 meta 走");
  // 反面对照：不带 meta 的事务走重算那条路，会把它**重置回 0**
  const 又 = 新.apply(新.tr.setMeta("别的键", 1));
  等(斜杠键.getState(又)!.选中, 0, "不带本插件的 meta 时重算回 0（这就是为什么必须有那条分支）");
});

测("`apply`：meta 是 `null` 时面板**收起来**", () => {
  const 文档 = 建(段("/"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 1));
  const 新 = 状态.apply(状态.tr.setMeta(斜杠键, null));
  等(斜杠键.getState(新), null, "显式 null 就是「关」");
});

测("`handleKeyDown`：面板没开时一条键都不接管", () => {
  const 文档 = 建(段("甲"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 1));
  const { view, 派过 } = 建假view(状态);
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]) {
    等(插件按键(状态, view, key), false, `面板没开时 \`${key}\` 不该被吃掉`);
  }
  等(派过.length, 0, "一条事务都不该派");
});

测("`handleKeyDown`：输入法组合态时不接管（**硬要求**）", () => {
  const 文档 = 建(段("/"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 1));
  const { view, 派过 } = 建假view(状态);
  真(斜杠键.getState(状态) !== null, "前提：面板确实开着");
  for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]) {
    等(插件按键(状态, view, key, true), false, `组合态下 \`${key}\` 不许被吃掉`);
  }
  等(派过.length, 0, "组合态下不该派任何事务");
});

测("`handleKeyDown`：↓/↑ 改高亮并环绕", () => {
  const 文档 = 建(段("/"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 1));
  const { view, 现在 } = 建假view(状态);
  const 条数 = 斜杠键.getState(状态)!.候选.length;
  等(插件按键(现在(), view, "ArrowDown"), true, "↓ 该被吃掉");
  等(斜杠键.getState(现在())!.选中, 1, "高亮 +1");
  等(插件按键(现在(), view, "ArrowUp"), true, "↑ 该被吃掉");
  等(斜杠键.getState(现在())!.选中, 0, "高亮 −1");
  // 从 0 往上：环绕到末条
  等(插件按键(现在(), view, "ArrowUp"), true, "↑ 在第一条上仍该被吃掉");
  等(斜杠键.getState(现在())!.选中, 条数 - 1, "环绕到末条");
  等(插件按键(现在(), view, "ArrowDown"), true, "↓ 在末条上仍该被吃掉");
  等(斜杠键.getState(现在())!.选中, 0, "环绕回第一条");
});

测("`handleKeyDown`：回车/`Tab` = 采用当前高亮那条", () => {
  for (const 键 of ["Enter", "Tab"]) {
    const 文档 = 建(段("/h1"));
    const 收到: EditorCommand[] = [];
    // ⚠️ 执行函数是从**插件建出来那一刻**捕获的（`斜杠插件(执行)`），
    // 所以记这笔账要拿一颗带记账的插件建 state，不能用默认那颗。
    const 假 = 建假view(建状态(文档, 段内位置(文档, 0, 3), 斜杠插件((id) => 收到.push(id))));
    等(插件按键(假.现在(), 假.view, 键), true, `${键} 该被吃掉`);
    等(收到, ["h1"], `${键} 该跑那条命令`);
    等(全文(假.现在().doc), "", `${键} 该先把 \`/h1\` 删掉`);
  }
});

测("`handleKeyDown`：回车采用的是**高亮那条**，不是永远第一条", () => {
  const 文档 = 建(段("/"));
  const 收到: EditorCommand[] = [];
  const 假 = 建假view(建状态(文档, 段内位置(文档, 0, 1), 斜杠插件((id) => 收到.push(id))));
  const 状 = 斜杠键.getState(假.现在())!;
  真(状.候选.length > 2, "前提：`/` 筛出三条以上");
  插件按键(假.现在(), 假.view, "ArrowDown");
  插件按键(假.现在(), 假.view, "ArrowDown");
  插件按键(假.现在(), 假.view, "Enter");
  等(收到, [状.候选[2]!.id], "按了两下 ↓ 之后回车，跑的是第 2 条");
});

测("`handleKeyDown`：`Esc` 不删那个斜杠（只收面板）", () => {
  const 文档 = 建(段("/h1"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 3));
  const { view, 派过 } = 建假view(状态);
  等(插件按键(状态, view, "Escape"), true, "Esc 该被吃掉");
  等(派过.length, 0, "⚠️ 一笔事务都不派——那个 `/` 是用户敲的字，不许替他删");
});

测("`handleKeyDown`：别的键一律不管", () => {
  const 文档 = 建(段("/"));
  const 状态 = 建状态(文档, 段内位置(文档, 0, 1));
  const { view } = 建假view(状态);
  for (const key of ["a", "Backspace", " ", "PageDown", "F5"]) {
    等(插件按键(状态, view, key), false, `\`${key}\` 不该被面板吃掉`);
  }
});

/**
 * 拿假 view 敲一下键。
 *
 * ⚠️ 走的是 `插件.props.handleKeyDown`——`Plugin` 实例上的 `props` 是公开的
 * （ProseMirror 把编辑器传进来的那几件挂在这儿），所以不必建真 `EditorView`。
 */
function 插件按键(
  状态: EditorState,
  view: EditorView,
  键: string,
  组合中 = false,
): boolean {
  const 插件 = 状态.plugins.find((p) => p.spec.key === 斜杠键) ?? 斜杠插件(() => {});
  const 处理 = 插件.props.handleKeyDown;
  if (!处理) throw new Error("插件上没有 handleKeyDown");
  return (
    处理(view, {
      key: 键,
      isComposing: 组合中,
      preventDefault() {},
    } as unknown as KeyboardEvent) === true
  );
}

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(60)}`);
console.log(`通过 ${通过}，失败 ${失败}`);
if (失败) {
  console.log("失败清单：");
  for (const 项 of 失败清单) console.log(`  · ${项}`);
  process.exitCode = 1;
}
