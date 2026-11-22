





import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { DOMSerializer, Fragment } from "@milkdown/kit/prose/model";
import type { Transaction } from "@milkdown/kit/prose/state";
import { blockName } from "./math-current";

const upstreamClass = "nota-math-upstream";








export function readSource(node: PMNode): string {
  if (node.type.name === blockName) {
    const value2: unknown = node.attrs.value;
    return typeof value2 === "string" ? value2 : "";
  }
  return node.textContent;
}














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




export function raiseGetClearMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}










export function drawUpstream(node: PMNode): HTMLElement {
  try {
    const traceDescribe = node.type.spec.toDOM?.(node);
    if (traceDescribe) {
      const { dom } = DOMSerializer.renderSpec(document, traceDescribe);
      dom.classList.add(upstreamClass);
      return dom;
    }
  } catch {

  }
  const fallback = document.createElement(node.isInline ? "span" : "div");
  fallback.className = upstreamClass;
  fallback.textContent = readSource(node);
  return fallback;
}
