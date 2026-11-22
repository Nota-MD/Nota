



































import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { CommandPayload } from "./create-types";
import { DangerousProtocol } from "./url-link";


export interface range {
  from: number;
  to: number;
}













export function linkDropPoint(name: string, address: string): { label: string; href: string | null } {
  const name3 = name.trim();
  const address2 = address.trim();
  return { label: name3 || address2, href: address2 === "" || DangerousProtocol(address2) ? null : address2 };
}


export interface sourceLink {
  from: number;
  to: number;
  label: string;
  href: string;
}













const sourceLinkPattern = /\[([^\]\n]*)\]\(([^)\s]*)\)/g;








export function sourceLinkRange(text4: string, position2: number): sourceLink | null {
  const position3 = Math.max(0, Math.min(position2, text4.length));
  sourceLinkPattern.lastIndex = 0;
  for (const match2 of text4.matchAll(sourceLinkPattern)) {
    const from = match2.index ?? 0;
    const to = from + match2[0].length;
    if (position3 >= from && position3 <= to) {
      return { from, to, label: match2[1] ?? "", href: match2[2] ?? "" };
    }
  }
  return null;
}


export function sourceLink(name: string, address: string): string {
  const { label, href } = linkDropPoint(name, address);
  return href === null ? label : `[${label}](${href})`;
}







export function removeSourceLink(text2: string): string {
  return text2.replace(/\[([\s\S]*?)\]\([^)\s]*\)/g, "$1");
}




export interface LinkPlace extends range {
  label: string;
  href: string;
}

function clamp(value2: number, below: number, above: number): number {
  return Math.max(below, Math.min(value2, above));
}












export function linkRange(doc: PMNode, position2: number): LinkPlace | null {
  const linkType = doc.type.schema.marks.link;
  if (!linkType) return null;
  const position = doc.resolve(clamp(position2, 0, doc.content.size));
  const block = position.parent;
  if (!block.isTextblock || block.type.spec.code) return null;
  const start4 = position.start();
  const position3 = clamp(position2, start4, start4 + block.content.size);


  let bias = 0;
  let match = -1;
  for (let i = 0; i < block.childCount; i++) {
    const child3 = block.child(i);
    const start6 = start4 + bias;
    if (position3 >= start6 && position3 <= start6 + child3.nodeSize) {
      match = i;
      break;
    }
    bias += child3.nodeSize;
  }
  if (match < 0) return null;

  const getLink = (i: number) => block.child(i).marks.find((m) => m.type === linkType) ?? null;
  const first = getLink(match);
  if (!first) return null;
  const href = String(first.attrs.href ?? "");
  const sameOneItem = (i: number) => String(getLink(i)?.attrs.href ?? "\u0000") === href;

  let left = match;
  let right = match;
  while (left > 0 && sameOneItem(left - 1)) left--;
  while (right + 1 < block.childCount && sameOneItem(right + 1)) right++;

  let fromHead = start4;
  for (let i = 0; i < left; i++) fromHead += block.child(i).nodeSize;
  let toTail = fromHead;
  for (let i = left; i <= right; i++) toTail += block.child(i).nodeSize;
  return { from: fromHead, to: toTail, label: doc.textBetween(fromHead, toTail, ""), href };
}









export function createLinkTransaction(
  state: EditorState,
  area: range,
  name: string,
  address: string,
): Transaction | null {
  const linkType = state.schema.marks.link;
  if (!linkType) return null;
  const { label, href } = linkDropPoint(name, address);
  if (label === "") return null;
  const node =
    href === null ? state.schema.text(label) : state.schema.text(label, [linkType.create({ href })]);
  return state.tr.replaceWith(area.from, area.to, node).removeStoredMark(linkType);
}







export function removeLinkTransaction(state: EditorState, area: range): Transaction | null {
  const linkType = state.schema.marks.link;
  if (!linkType || area.from >= area.to) return null;
  return state.tr.removeMark(area.from, area.to, linkType).removeStoredMark(linkType);
}








function targetRange(view: EditorView): range {
  const select = view.state.selection;
  if (!select.empty) return { from: select.from, to: select.to };
  return linkRange(view.state.doc, select.from) ?? { from: select.from, to: select.to };
}


export function installLink(editor: Editor, payload?: CommandPayload): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = createLinkTransaction(view.state, targetRange(view), payload?.label ?? "", payload?.href ?? "");
    if (tr) view.dispatch(tr);
  });
}


export function removeLink(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = removeLinkTransaction(view.state, targetRange(view));
    if (tr) view.dispatch(tr);
  });
}
