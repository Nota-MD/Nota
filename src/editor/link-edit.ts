/**
 * **链接**这一族：找光标处那条链接 ＋ 写一条新的进去（2026-10-07）。
 *
 * # 它为什么单开一个文件
 *
 * 与 `select.ts` / `insert.ts` 同一条理由：`command-table.ts` 那张表是一行一条的
 * **映射**，而这两条要先看一眼光标在哪、那条链接从哪儿到哪儿、再把新文字拼出来
 * ——塞进那张表就成了清单里夹着算法。⚠️ 入口仍然只有 `command-table.ts` 那一个
 * （界面层不许直接调本文件，见 `create.ts` 顶上那条纪律），源码模式那一侧由
 * `source-commands.ts` 调下面第二组那几个**纯文本**判据。
 *
 * # 三层的分法（与 `select.ts` 一模一样，理由也一样：判据要能单测）
 *
 * | 组 | 吃什么 | 谁能测 |
 * |---|---|---|
 * | {@link 链接落点} / {@link 源文链接区间} / {@link 源文链接} / {@link 摘源文链接} | **纯字符串** | `tests/link-edit.test.ts` |
 * | {@link 链接区间} / {@link 建链接事务} / {@link 摘链接事务} | 一棵 **ProseMirror 文档** | 同上（一个 `Schema` 就够） |
 * | {@link 装链接} / {@link 摘链接} | 一个 `Editor` | 开窗目检（`docs/06`） |
 *
 * # ⚠️ 「插入链接」不是"换个框"，是**补一条真实现**
 *
 * 上游那条 `toggleLinkCommand` 拆开是 `toggleMark(link, {href})`——**一个字符都不插**，
 * 空选区时它只设 `storedMarks`（下一个敲的字才带链接）。所以"光标停在空处点插入链接"
 * 在它那儿**屏幕上什么都不会出现**。这一份干的正是它没干的那件事：**把文字一起写进去**。
 * ⚠️ 而"再点一次＝去掉链接"那条能力（toggle 语义）**不许弄丢**，它今天走
 * {@link 摘链接}（框里那颗「去掉链接」）——两条路分开，不混在一条命令里。
 *
 * # 地址那道闸
 *
 * 地址为空、或者过了 {@link 危险协议}（`javascript:` 那一族）时，**不写成链接**、
 * **落成纯文字**：用户填的字一个都不许丢，而一条能执行的链接一个都不许进文档。
 * ⚠️ 这与 `url-link.ts` 那条自动识别**同一个答案**（那边遇到危险协议也是"当没看见"，
 * 文字留在原处）——两条路各判一次的话，"打出来不是链接、插进去是链接"就成了没人
 * 说得清的差别。
 */

import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { CommandPayload } from "./create-types";
import { 危险协议 } from "./url-link";

/** 一段区间：`from` 含、`to` 不含。与 `select.ts` 那个同名同形。 */
export interface 区间 {
  from: number;
  to: number;
}

/* ══ 第一组：纯字符串的判据（两种模式共用）══════════════════════════════ */

/**
 * 用户填的两个框**该写成什么**。
 *
 * 三条规则，一条都不许省：
 * - **显示名称为空时用地址当名字**：链接的可见文字空了，屏幕上就是一条点不着、
 *   也看不见的链接（`[]()`），比纯文字更让人困惑；
 * - **地址为空 → `href` 给 `null`**（落纯文字）：空 `href` 的链接点下去什么都不
 *   发生（与 `PromptDialog` 那条"主字段为空 = 取消"同一口径，这里是它的兜底）；
 * - **危险协议 → `href` 给 `null`**（同上），见文件头那道闸。
 */
export function 链接落点(名称: string, 地址: string): { label: string; href: string | null } {
  const 名 = 名称.trim();
  const 址 = 地址.trim();
  return { label: 名 || 址, href: 址 === "" || 危险协议(址) ? null : 址 };
}

/** 一条 Markdown 行内链接在**纯文本**里的位置（源码模式用）。 */
export interface 源文链接 {
  from: number;
  to: number;
  label: string;
  href: string;
}

/**
 * `[名称](地址)` 的匹配式。
 *
 * ⚠️ **不认嵌套、不认括号转义**（`[a[b]](c)` 那种）：本仓自己写出来的链接永远是
 * 最普通的那一种（`source-commands.ts` 与所见即所得那边都只写这一种），而写得
 * 更全的那一版要一套真的行内解析器——那正是"在源码模式里重新实现一遍 Markdown"
 * 那条被反复否掉的路（见 `applyCommand` 顶上那段）。认不出来的一律**当普通文字**，
 * 不当链接改。
 *
 * ⚠️ 名称里排除 `]` 与换行、地址里排除 `)` 与空白：这三样本仓写出来的链接里
 * 都不会出现，放进去只会让"哪一段算是这条链接"变得更含糊。
 */
const 源文链接正则 = /\[([^\]\n]*)\]\(([^)\s]*)\)/g;

/**
 * 光标处（`位置` 是**整篇文本**里的偏移）那条 `[名称](地址)`。
 *
 * 判据是**半开区间的两端都算**（`from <= 位置 <= to`）：光标贴着链接尾巴、或者
 * 正好在它开头那一个字符上，都是"在这条链接里"——与 `select.ts::挑词` 那条
 * "贴着词尾也算"同一个道理，也正是用户点一下那条链接时最常撞上的位置。
 */
export function 源文链接区间(文: string, 位置: number): 源文链接 | null {
  const 位 = Math.max(0, Math.min(位置, 文.length));
  源文链接正则.lastIndex = 0;
  for (const 匹配 of 文.matchAll(源文链接正则)) {
    const from = 匹配.index ?? 0;
    const to = from + 匹配[0].length;
    if (位 >= from && 位 <= to) {
      return { from, to, label: 匹配[1] ?? "", href: 匹配[2] ?? "" };
    }
  }
  return null;
}

/** 把「名称 ＋ 地址」写成 Markdown 该有的那串字（危险/空地址时只有名称）。 */
export function 源文链接(名称: string, 地址: string): string {
  const { label, href } = 链接落点(名称, 地址);
  return href === null ? label : `[${label}](${href})`;
}

/**
 * 把一段文本里的行内链接**摘成纯文字**（对应「去掉链接」；文字一个字节不动）。
 *
 * ⚠️ 与 `source-commands.ts::清除行内标记` 里那条链接规则**同一个形状**，
 * 但那一条还顺手摘加粗/斜体——两者不是一件事，谁都不许调谁。
 */
export function 摘源文链接(文本: string): string {
  return 文本.replace(/\[([\s\S]*?)\]\([^)\s]*\)/g, "$1");
}

/* ══ 第二组：ProseMirror 层的换算与事务 ═════════════════════════════════ */

/** 光标处那条链接：文档位置 ＋ 它显示的文字 ＋ 地址。 */
export interface 链接处 extends 区间 {
  label: string;
  href: string;
}

function 夹(值: number, 下: number, 上: number): number {
  return Math.max(下, Math.min(值, 上));
}

/**
 * 光标处那条链接**从哪儿到哪儿**。不在链接里（或者在代码块里）给 `null`。
 *
 * ⚠️ **代码块里什么都不做**：那一段的选区与光标住在块里那颗 CodeMirror 上
 * （`code-block.ts` 的 NodeView），PM 这边认出来的"链接"在屏幕上与光标对不上
 * ——与 `select.ts::摊开块` 那条出口同一个理由。
 *
 * ⚠️ **连续的同地址兄弟要合成一条**：PM 的文本节点按"标记相同"归并，但同一段
 * 文字被别的标记（比如一段加粗的链接）切开时，一条链接会摊成两个节点。只看光标
 * 落在的那一个节点的话，改一次链接只改掉半截。
 */
export function 链接区间(doc: PMNode, 位置: number): 链接处 | null {
  const 链接型 = doc.type.schema.marks.link;
  if (!链接型) return null;
  const $位 = doc.resolve(夹(位置, 0, doc.content.size));
  const 块 = $位.parent;
  if (!块.isTextblock || 块.type.spec.code) return null;
  const 起点 = $位.start();
  const 位 = 夹(位置, 起点, 起点 + 块.content.size);

  // 命中哪一颗子节点：两端都算（同 {@link 源文链接区间}）。
  let 偏 = 0;
  let 命中 = -1;
  for (let i = 0; i < 块.childCount; i++) {
    const 子 = 块.child(i);
    const 始 = 起点 + 偏;
    if (位 >= 始 && 位 <= 始 + 子.nodeSize) {
      命中 = i;
      break;
    }
    偏 += 子.nodeSize;
  }
  if (命中 < 0) return null;

  const 取链接 = (i: number) => 块.child(i).marks.find((m) => m.type === 链接型) ?? null;
  const 首 = 取链接(命中);
  if (!首) return null;
  const href = String(首.attrs.href ?? "");
  const 同一条 = (i: number) => String(取链接(i)?.attrs.href ?? "\u0000") === href;

  let 左 = 命中;
  let 右 = 命中;
  while (左 > 0 && 同一条(左 - 1)) 左--;
  while (右 + 1 < 块.childCount && 同一条(右 + 1)) 右++;

  let 从头 = 起点;
  for (let i = 0; i < 左; i++) 从头 += 块.child(i).nodeSize;
  let 到尾 = 从头;
  for (let i = 左; i <= 右; i++) 到尾 += 块.child(i).nodeSize;
  return { from: 从头, to: 到尾, label: doc.textBetween(从头, 到尾, ""), href };
}

/**
 * 把 `区` 那段换成一条链接（地址危险或为空时换成**纯文字**）。
 *
 * 一个字节都不动、也不该派事务时给 `null`（两头都空）。⚠️ 模板是
 * `url-link.ts::换链接`（281 行那个）：`replaceWith` ＋ 显式带 mark 的
 * `schema.text` ＋ **`removeStoredMark`** —— 最后那一下不能省：不摘掉"存储标记"，
 * 紧接着敲的下一个字会接着带上链接。
 */
export function 建链接事务(
  state: EditorState,
  区: 区间,
  名称: string,
  地址: string,
): Transaction | null {
  const 链接型 = state.schema.marks.link;
  if (!链接型) return null;
  const { label, href } = 链接落点(名称, 地址);
  if (label === "") return null;
  const 节点 =
    href === null ? state.schema.text(label) : state.schema.text(label, [链接型.create({ href })]);
  return state.tr.replaceWith(区.from, 区.to, 节点).removeStoredMark(链接型);
}

/**
 * 把 `区` 里的链接标记摘掉、**文字一个字节不动**（「去掉链接」）。
 *
 * ⚠️ 摘的是**标记**、不是那串 `[名称](地址)` 的字：所见即所得那边本来就没有中括号，
 * 摘完就是普通文字。源码模式那一侧走的是 {@link 摘源文链接}（纯文本）。
 */
export function 摘链接事务(state: EditorState, 区: 区间): Transaction | null {
  const 链接型 = state.schema.marks.link;
  if (!链接型 || 区.from >= 区.to) return null;
  return state.tr.removeMark(区.from, 区.to, 链接型).removeStoredMark(链接型);
}

/* ══ 第三组：两条命令（落到真编辑器上）══════════════════════════════════ */

/**
 * 这条命令要作用的**文档区间**：
 * - 有选区 → 就是那个选区（用户选了一段字再插链接，那就是他的意思）；
 * - 空光标 → 光标处那条链接整条；不在链接里就是光标那一点（"插一条新的"）。
 */
function 目标区间(view: EditorView): 区间 {
  const 选 = view.state.selection;
  if (!选.empty) return { from: 选.from, to: 选.to };
  return 链接区间(view.state.doc, 选.from) ?? { from: 选.from, to: 选.to };
}

/** 写一条链接进去（`linkSet`）。名称与地址由框里问来（见 `ui/LinkDialog.tsx`）。 */
export function 装链接(editor: Editor, payload?: CommandPayload): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = 建链接事务(view.state, 目标区间(view), payload?.label ?? "", payload?.href ?? "");
    if (tr) view.dispatch(tr);
  });
}

/** 去掉光标处那条链接（`linkRemove`）——**文字留着**。 */
export function 摘链接(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = 摘链接事务(view.state, 目标区间(view));
    if (tr) view.dispatch(tr);
  });
}
