/**
 * 公式源码的读写与只读渲染。
 *
 * 这些函数不持有 NodeView 状态，单独放一份，避免主公式视图越过行数硬线。
 */

import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { DOMSerializer, Fragment } from "@milkdown/kit/prose/model";
import type { Transaction } from "@milkdown/kit/prose/state";
import { blockName } from "./math-current";

const upstreamClass = "nota-math-upstream";

/**
 * 取节点里的源码。
 *
 * ⚠️ **行内与块不是一处**——这是本任务最容易做错的地方：
 * 行内在 `node.textContent`（`toMarkdown` 读 `a.textContent`），
 * 块在 `attrs.value`（`toMarkdown` 读 `a.attrs.value`）。
 */
export function readSource(node: PMNode): string {
  if (node.type.name === blockName) {
    const value2: unknown = node.attrs.value;
    return typeof value2 === "string" ? value2 : "";
  }
  return node.textContent;
}

/**
 * 把一份源码写进节点。**改的是传进来的那笔事务**，返回它有没有动过手。
 *
 * ⚠️ 两条路（见文件头那张表），认的是**节点类型**：
 *
 * - 行内：`replaceWith(内容起点, 内容终点, 文本)`。`位置 + 1` 是节点内容的起点、
 *   `位置 + node.nodeSize - 1` 是终点（首尾那两个位置是节点自己的开闭 token）。
 * - 块：`setNodeMarkup(位置, undefined, {...attrs, value})`。属性要**整个展开**，
 *   不然别的属性会被抹掉（今天只有 `value`，将来不一定）。
 *
 * ⚠️ 行内的空串要取 `Fragment.empty` 当内容：`replaceWith` 收的就是"片段/节点"，
 * 而 `schema.text("")` 会直接抛（ProseMirror 不接受空文本节点）。
 */
export function writeEnterSource(tr: Transaction, position2: number, node: PMNode, source2: string): boolean {
  if (readSource(node) === source2) return false;

  if (node.type.name === blockName) {
    tr.setNodeMarkup(position2, undefined, { ...node.attrs, value: source2 });
    return true;
  }

  const fragment = source2 === "" ? Fragment.empty : tr.doc.type.schema.text(source2);
  tr.replaceWith(position2 + 1, position2 + node.nodeSize - 1, fragment);
  return true;
}

/* ── 三、NodeView ─────────────────────────────────────────────────────── */

/** 从异常里抠一句人能读的话。`katex` 的解析错是 `ParseError`，但别赌它。 */
export function raiseGetClearMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

/**
 * 只读实例里那棵树：**上游 `toDOM` 画什么就是什么**。
 *
 * ⚠️ 走 `DOMSerializer.renderSpec` 而不是直接拿 `toDOM` 的返回值，是照
 * ProseMirror 自己的做法（没有自定义视图时 `NodeViewDesc` 就是这么画的）：
 * `toDOM` 允许返回"元素"或"描述数组"两种形状，这一步两种都吃。
 * 结果与今天预览格里的**逐字节相同**（含 `data-type` / `data-value`，
 * 而且上游 `toDOM` 自己会按同一份 `katexOptions` 调一次 `katex.render`）。
 */
export function drawUpstream(node: PMNode): HTMLElement {
  try {
    const traceDescribe = node.type.spec.toDOM?.(node);
    if (traceDescribe) {
      const { dom } = DOMSerializer.renderSpec(document, traceDescribe);
      dom.classList.add(upstreamClass);
      return dom;
    }
  } catch {
    // 上游的画法炸了就退回一句原文：宁可难看，也别在预览格里留一块空白。
  }
  const fallback = document.createElement(node.isInline ? "span" : "div");
  fallback.className = upstreamClass;
  fallback.textContent = readSource(node);
  return fallback;
}
