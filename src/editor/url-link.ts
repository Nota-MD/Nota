import { $inputRule } from "@milkdown/kit/utils";
import { linkSchema } from "@milkdown/kit/preset/commonmark";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { MarkType, Node as PMNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";


export function linkBoundaryMarkSpec<T extends { inclusive?: boolean }>(previous: T): T {
  return {
    ...previous,
    inclusive: false,
  };
}

export const linkBoundarySpec = linkSchema.extendSchema(
  (previous) => (ctx) => linkBoundaryMarkSpec(previous(ctx)),
);


const dangerousProtocolTable = ["javascript:", "vbscript:", "data:", "file:", "blob:"] as const;


export function DangerousProtocol(address: string): boolean {
  const doValue = address.replace(/[\s\u0000-\u001f\u007f]/g, "").toLowerCase();
  return dangerousProtocolTable.some((broken) => doValue.startsWith(broken));
}


function isLikeMainMachineName(mainMachine: string): boolean {
  if (mainMachine === "localhost") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(mainMachine)) return true;
  return /^[^.\s/]+(\.[^.\s/]+)*\.[a-z]{2,}$/i.test(mainMachine);
}


export function NormalizeUrl(candidate: string): string | null {
  const text4 = candidate.trim();
  if (text4 === "" || /\s/.test(text4)) return null;
  if (DangerousProtocol(text4)) return null;
  let address: string;
  if (/^https?:\/\//i.test(text4)) {
    address = text4;
  } else if (/^www\./i.test(text4)) {
    address = `https://${text4}`;
  } else {
    return null;
  }
  let parse: URL;
  try {
    parse = new URL(address);
  } catch {


    return null;
  }
  if (parse.protocol !== "http:" && parse.protocol !== "https:") return null;
  if (!isLikeMainMachineName(parse.hostname)) return null;
  return address;
}


export interface NormalizedLink {
  text: string;
  href: string;
}

const emailAddressPattern =
  /^(?:(mailto:\/{0,2}))?([a-z0-9][a-z0-9._%+-]{0,63})@((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})$/i;


export function NormalizeLink(candidate: string): NormalizedLink | null {
  const text4 = candidate.trim();
  const url = NormalizeUrl(text4);
  if (url) return { text: text4, href: url };
  if (text4 === "" || /\s/.test(text4) || DangerousProtocol(text4)) return null;
  const email = emailAddressPattern.exec(text4);
  if (!email) return null;
  return { text: text4, href: /^mailto:/i.test(text4) ? text4 : `mailto:${text4}` };
}


export function isBareURL(candidate: string): boolean {
  return NormalizeUrl(candidate) !== null;
}


export function normalizeExplicitLinkDestination(candidate: string): string | null {
  const text4 = candidate.trim();
  if (text4 === "" || /\s/.test(text4) || DangerousProtocol(text4)) return null;
  const normalized = NormalizeLink(text4);
  if (normalized) return normalized.href;
  if (/^(?:#|\/|\.{1,2}\/)/.test(text4)) return text4;
  const host = text4.split(/[/?#]/, 1)[0] ?? "";
  return isLikeMainMachineName(host) ? `https://${text4}` : text4;
}


const rightConfigureLeft: Readonly<Record<string, string>> = {
  ")": "(",
  "]": "[",
  "}": "{",
  '"': '"',
  "'": "'",
  "»": "«",
  "”": "“",
  "’": "‘",


  "」": "「",
  "』": "『",
  "》": "《",
  "〉": "〈",
};


export function splitTailPunctuation(source: string): { url: string; tailPart: string } {
  const number2 = (s: string, c: string) => s.split(c).length - 1;
  let end3 = source.length;
  while (end3 > 0) {
    const end = source[end3 - 1]!;
    if (".,;:!?*_~，。；：！？、".includes(end)) {
      end3--;
      continue;
    }
    const left = rightConfigureLeft[end];
    if (left !== undefined) {


      const alreadyHas = source.slice(0, end3);
      if (number2(alreadyHas, end) > number2(alreadyHas, left)) {
        end3--;
        continue;
      }
    }
    break;
  }
  return { url: source.slice(0, end3), tailPart: source.slice(end3) };
}


const ruleRuleOption = { inCodeMark: false } as const;


export const bareURLCorrectRule =
  /(?:^|[\s([{（【「『"'“‘>\uFFFC])((?:(?:https?:\/\/|www\.)[^\s<>"'\x60]+|(?:mailto:\/{0,2})?[a-z0-9][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+[?!.,:**_~;，。；：！？、]*))[ \t]$/i;

export function selfActionLinkInput(enabled = true) {
  if (!enabled) return [];
  return [
    $inputRule(() =>
      new InputRule(bareURLCorrectRule, (state, match2, start6, end3) => {
        const original = match2[1]!;


        const { url, tailPart } = splitTailPunctuation(original);
        const normalized = NormalizeLink(url);
        if (!normalized) return null;
        const link = state.schema.marks.link;
        if (!link) return null;


        const prefixLength = match2[0].length - original.length - 1;
        const from = start6 + prefixLength;
        const to = end3 - 1;
        let alreadyLinked = false;
        state.doc.nodesBetween(from, to, (node) => {
          if (node.isText && link.isInSet(node.marks)) alreadyLinked = true;
        });
        return alreadyLinked
          ? null
          : replaceLink(state, from, to, url, tailPart, normalized.href, link);
      }, ruleRuleOption),
    ),
  ];
}


export const explicitLinkSyntax = /\[([^\]\n]+)\]\(([^()\s]+)\)$/;

function explicitLinkTransaction(
  state: EditorState,
  match2: RegExpMatchArray,
  start6: number,
  end3: number,
): Transaction | null {
  const label = match2[1] ?? "";
  const href = normalizeExplicitLinkDestination(match2[2] ?? "");
  const link = state.schema.marks.link;
  if (!label || href === null || !link) return null;
  const currentMarks = state.storedMarks ?? state.selection.$from.marks();
  const textNode = state.schema.text(label, [
    ...currentMarks.filter((mark) => mark.type !== link),
    link.create({ href }),
  ]);
  const transaction = state.tr.replaceWith(start6, end3, textNode);
  transaction.setSelection(TextSelection.create(transaction.doc, start6 + label.length));
  transaction.removeStoredMark(link);
  return transaction;
}

export function explicitLinkInput() {
  return [
    $inputRule(() =>
      new InputRule(explicitLinkSyntax, (state, match2, start6, end3) => {
        return explicitLinkTransaction(state, match2, start6, end3);
      }),
    ),
  ];
}


export function explicitLinkAtClosingParenthesis(
  state: EditorState,
  position: number,
): Transaction | null {
  if (!state.selection.empty || state.selection.from !== position) return null;
  const resolved = state.doc.resolve(position);
  if (!resolved.parent.inlineContent || resolved.parent.type.spec.code) return null;
  if (resolved.parentOffset >= resolved.parent.content.size) return null;
  if (resolved.parent.textBetween(resolved.parentOffset, resolved.parentOffset + 1) !== ")") {
    return null;
  }

  const before = resolved.parent.textBetween(0, resolved.parentOffset, "\n", "\uFFFC");
  const match2 = explicitLinkSyntax.exec(`${before})`);
  if (!match2) return null;


  const start6 = resolved.start() + before.length - match2[0].length + 1;
  return explicitLinkTransaction(state, match2, start6, position + 1);
}

export function explicitLinkAtTypedParenthesis(
  state: EditorState,
  position: number,
  typed: string,
): Transaction | null {
  if (typed !== ")" || !state.selection.empty || state.selection.from !== position) {
    return null;
  }
  const autoInserted = explicitLinkAtClosingParenthesis(state, position);
  if (autoInserted) return autoInserted;
  const resolved = state.doc.resolve(position);
  if (!resolved.parent.inlineContent || resolved.parent.type.spec.code) return null;
  const before = resolved.parent.textBetween(
    0,
    resolved.parentOffset,
    "\n",
    "\uFFFC",
  );
  const match2 = explicitLinkSyntax.exec(`${before})`);
  if (!match2) return null;


  const start6 = resolved.start() + before.length - match2[0].length + 1;
  return explicitLinkTransaction(state, match2, start6, position);
}

export function explicitLinkAtCursor(
  state: EditorState,
  position: number,
): Transaction | null {
  if (!state.selection.empty || state.selection.from !== position) return null;
  const resolved = state.doc.resolve(position);
  if (!resolved.parent.inlineContent || resolved.parent.type.spec.code) return null;

  const linkSourceType = state.schema.nodes.notaLinkSource;
  if (
    linkSourceType &&
    (resolved.nodeBefore?.type === linkSourceType ||
      resolved.nodeAfter?.type === linkSourceType)
  ) {
    return null;
  }
  const before = resolved.parent.textBetween(
    0,
    resolved.parentOffset,
    "\n",
    "\uFFFC",
  );
  const match2 = explicitLinkSyntax.exec(before);
  if (!match2) return null;
  const start6 = resolved.start() + before.length - match2[0].length;
  return explicitLinkTransaction(state, match2, start6, position);
}


export function explicitLinkAtTrailingWhitespace(
  state: EditorState,
  position: number,
): Transaction | null {
  if (!state.selection.empty || state.selection.from !== position) return null;
  const resolved = state.doc.resolve(position);
  if (!resolved.parent.inlineContent || resolved.parent.type.spec.code) return null;
  const before = resolved.parent.textBetween(
    0,
    resolved.parentOffset,
    "\n",
    "\uFFFC",
  );
  const trailing = /[ \t]+$/.exec(before)?.[0] ?? "";
  if (!trailing) return null;
  const match2 = explicitLinkSyntax.exec(before.slice(0, -trailing.length));
  if (!match2) return null;
  const start6 = resolved.start() + before.length - trailing.length - match2[0].length;
  const transaction = explicitLinkTransaction(
    state,
    match2,
    start6,
    position - trailing.length,
  );
  if (!transaction) return null;
  transaction.setSelection(
    TextSelection.create(
      transaction.doc,
      start6 + (match2[1] ?? "").length + trailing.length,
    ),
  );
  return transaction;
}


export function explicitLinkTyping() {
  const key = new PluginKey("nota-explicit-link-typing");
  return $prose(
    () =>
      new Plugin({
        key,
        props: {
          handleTextInput: (view, from, to, text4) => {
            if (text4 !== ")" || view.composing) return false;
            if (!view.state.selection.empty || from !== to) return false;
            const transaction = explicitLinkAtTypedParenthesis(view.state, from, text4);
            if (!transaction) return false;
            view.dispatch(transaction);
            return true;
          },
        },
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          if (transactions.some((transaction) => transaction.getMeta(key))) return null;
          if (transactions.some((transaction) => transaction.getMeta("composition") != null)) {
            return null;
          }


          const position = newState.selection.from;
          const transaction =
            explicitLinkAtCursor(newState, position) ??
            explicitLinkAtTrailingWhitespace(newState, position);
          return transaction?.setMeta(key, true) ?? null;
        },
        handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
          if (
            event.key !== ")" ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            view.composing
          ) {
            return false;
          }
          const { selection } = view.state;
          if (!selection.empty) return false;
          const transaction = explicitLinkAtClosingParenthesis(
            view.state,
            selection.from,
          );
          if (!transaction) return false;
          view.dispatch(transaction);
          return true;
        },
      }),
  );
}


export interface LinkBeforeCursor {
  from: number;
  to: number;
  text: string;
  href: string;
  tail: string;
}


export function findLinkBeforeCursor(parentText: string): LinkBeforeCursor | null {
  const match = /(\S+)$/u.exec(parentText);
  if (!match) return null;
  let token = match[1]!;
  let from = parentText.length - token.length;
  const boundaryPattern = /[\s([{（【「『"'“‘>\uFFFC]/u;
  const before = from > 0 ? parentText[from - 1] : undefined;
  if (before !== undefined && !boundaryPattern.test(before)) return null;
  if (boundaryPattern.test(token[0] ?? "")) {
    token = token.slice(1);
    from += 1;
  }
  const { url, tailPart } = splitTailPunctuation(token);
  const link = NormalizeLink(url);
  if (!link) return null;
  return {
    from,
    to: from + url.length,
    text: link.text,
    href: link.href,
    tail: tailPart,
  };
}


export function autoLinkBeforeCursor(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!selection.empty || !selection.$from.parent.inlineContent) return null;
  const { $from } = selection;
  if ($from.parent.type.spec.code) return null;
  const found = findLinkBeforeCursor($from.parent.textBetween(0, $from.parentOffset, "\n", "\uFFFC"));
  if (!found) return null;
  const linkType = state.schema.marks.link;
  if (!linkType) return null;
  const from = $from.start() + found.from;
  const to = $from.start() + found.to;
  let alreadyLinked = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && linkType.isInSet(node.marks)) alreadyLinked = true;
  });
  if (alreadyLinked) return null;
  return replaceLink(state, from, to, found.text, "", found.href, linkType);
}


export const autoLinkBoundary = (enabled = true) =>
  $prose(() =>
    new Plugin({
      key: new PluginKey("nota-auto-link-boundary"),
      props: {
        handleKeyDown: (view, event) => {
          if (
            !enabled ||
            (event.key !== "Enter" && event.key !== " ") ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            view.composing
          ) {
            return false;
          }
          const transaction = autoLinkBeforeCursor(view.state);
          if (!transaction) return false;
          view.dispatch(transaction.scrollIntoView());
          return false;
        },
      },
    }),
  );


function replaceLink(
  state: EditorState,
  start6: number,
  end3: number,
  url: string,
  tailPart: string,
  address: string,
  link: MarkType,
) {
  const node = [state.schema.text(url, [link.create({ href: address })])];
  if (tailPart !== "") node.push(state.schema.text(tailPart));
  return state.tr.replaceWith(start6, end3, node).removeStoredMark(link);
}


export function pasteAboveUrlTransaction(state: EditorState, cutPasteBoardText: string): Transaction | null {
  const normalized = NormalizeLink(cutPasteBoardText);
  if (!normalized) return null;
  const link = state.schema.marks.link;
  if (!link) return null;
  const { selection } = state;
  if (selection.empty) {


    return state.tr
      .replaceWith(
        selection.from,
        selection.to,
        state.schema.text(normalized.text, [link.create({ href: normalized.href })]),
      )
      .removeStoredMark(link);
  }
  if (!selection.$from.parent.inlineContent || !selection.$to.parent.inlineContent) return null;
  return state.tr
    .addMark(selection.from, selection.to, link.create({ href: normalized.href }))
    .removeStoredMark(link);
}


export function linkifiedPastedTextTransaction(
  state: EditorState,
  pastedText: string,
): Transaction | null {
  const link = state.schema.marks.link;
  if (!link || pastedText === "") return null;
  const { selection } = state;
  if (!selection.$from.parent.inlineContent || !selection.$to.parent.inlineContent) {
    return null;
  }

  const pattern =
    /(?:https?:\/\/|www\.)[^\s<>"'`]+|(?:mailto:\/{0,2})?[a-z0-9][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
  const boundary = /[\s([{（【「『"'“‘>\uFFFC]/u;
  const nodes: PMNode[] = [];
  let cursor = 0;
  let linked = 0;
  for (const match of pastedText.matchAll(pattern)) {
    const start = match.index ?? 0;
    const raw = match[0] ?? "";
    if (!raw) continue;
    if (start > 0 && !boundary.test(pastedText[start - 1] ?? "")) continue;
    if (start >= 2 && pastedText.slice(start - 2, start) === "](") continue;
    const { url, tailPart } = splitTailPunctuation(raw);
    const normalized = NormalizeLink(url);
    if (!normalized) continue;
    if (start > cursor) nodes.push(state.schema.text(pastedText.slice(cursor, start)));
    nodes.push(state.schema.text(normalized.text, [link.create({ href: normalized.href })]));
    if (tailPart) nodes.push(state.schema.text(tailPart));
    cursor = start + raw.length;
    linked++;
  }
  if (!linked) return null;
  if (cursor < pastedText.length) nodes.push(state.schema.text(pastedText.slice(cursor)));
  return state.tr.replaceWith(selection.from, selection.to, nodes).removeStoredMark(link);
}
