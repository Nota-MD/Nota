

































































import { editorViewOptionsCtx, parserCtx } from "@milkdown/kit/core";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Slice, type Node as PMNode, type NodeType } from "@milkdown/kit/prose/model";
import { $prose } from "@milkdown/kit/utils";

import { guessCodeLanguage, looksLikeCode } from "./lang-guess";
import { automaticImageName, imageAddressOfPastedText } from "./image-kind";
import { clearManagePastePasteHTML } from "./paste-clean";
import {
  NormalizeLink,
  linkifiedPastedTextTransaction,
  pasteAboveUrlTransaction,
} from "./url-link";
import {
  determineSeparatorLine,
  isTwoRowTable,
  splitTableCells,
  type columnAlignment,
} from "./table-input";


export const pastePasteKey = new PluginKey("notaPaste");









export const codePasteLimit = 50 * 1024;


export interface PastedTable {
  rows: string[][];
  delimiter: "markdown" | "tab" | "comma" | "semicolon";
  align?: columnAlignment[];
}

function splitDelimitedLine(line3: string, delimiter: string): string[] | null {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line3.length; i++) {
    const character = line3[i]!;
    if (quoted) {
      if (character !== '"') {
        current += character;
        continue;
      }
      if (line3[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      quoted = false;
      continue;
    }
    if (character === '"' && current.trim() === "") {
      quoted = true;
      current = "";
      continue;
    }
    if (character === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (quoted) return null;
  cells.push(current.trim());
  return cells;
}

function trimTableOuterEmptyColumns(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((row) => row.length));
  const copy = rows.map((row) => [...row]);
  while (width > 0 && copy.every((row) => (row[width - 1] ?? "") === "")) {
    for (const row of copy) row.length = width - 1;
    return trimTableOuterEmptyColumns(copy);
  }
  return copy;
}









export function recognizePastedTable(text4: string): PastedTable | null {
  if (!text4.trim() || text4.length > codePasteLimit) return null;
  const lines = text4.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "").split("\n");
  if (lines.length < 2 || lines.some((line3) => line3.trim() === "")) return null;
  if (lines.length >= 2 && isTwoRowTable(lines[0] ?? "", lines[1] ?? "")) {
    const header = splitTableCells(lines[0] ?? "").map((cell) => cell.text2);
    const align = determineSeparatorLine(lines[1] ?? "");
    if (!align || header.length !== align.length) return null;
    const body = lines.slice(2).map((line3) =>
      splitTableCells(line3).map((cell) => cell.text2),
    );
    if (body.some((row) => row.length !== header.length)) return null;
    if (body.length === 0) body.push(header.map(() => ""));
    return { rows: [header, ...body], delimiter: "markdown", align };
  }

  const delimiters: ReadonlyArray<[PastedTable["delimiter"], string]> = [
    ["tab", "\t"],
    ["semicolon", ";"],
    ["comma", ","],
  ];
  for (const [delimiter, character] of delimiters) {
    if (!lines.some((line3) => line3.includes(character))) continue;
    const parsed = lines.map((line3) => splitDelimitedLine(line3, character));
    if (parsed.some((row) => row === null)) continue;
    const rows = trimTableOuterEmptyColumns(parsed as string[][]);
    if (rows.length < 2) continue;
    const width = rows[0]?.length ?? 0;
    if (width < 2 || rows.some((row) => row.length !== width)) continue;


    if (delimiter !== "tab" && rows.length * width < 4) continue;
    return { rows, delimiter };
  }
  return null;
}







export function looksLikeSingleLineCode(text4: string): boolean {
  const source3 = text4.trim();
  if (!source3 || source3.includes("\n")) return false;
  if (/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)\b/i.test(source3)) return true;
  if (/^(?:const|let|var|function|class|interface|type|def|fn|pub\s+fn)\b/.test(source3)) return true;
  if (/^(?:#include|using\s+namespace|import\s+[\w.{*])/.test(source3)) return true;
  if (/^[\[{]/.test(source3)) {
    try {
      const parsed = JSON.parse(source3) as unknown;
      return parsed !== null && typeof parsed === "object";
    } catch {
      return false;
    }
  }
  return false;
}


export function looksLikeMarkdownSource(text4: string): boolean {
  const source3 = text4.replace(/\r\n?/g, "\n").trim();
  if (!source3) return false;
  if (/^---\n[\s\S]*\n---(?:\n|$)/.test(source3)) return true;
  if (/^(?:```|~~~)[^\n]*\n[\s\S]*\n(?:```|~~~)\s*$/m.test(source3)) return true;
  const lines = source3.split("\n");
  if (lines.length >= 2 && isTwoRowTable(lines[0] ?? "", lines[1] ?? "")) return true;
  const signals = [
    /^#{1,6}\s+\S/m,
    /^>\s+\S/m,
    /^(?:[-+*]|\d+\.)\s+\S/m,
    /!?\[[^\]]*]\([^)]*\)/m,
  ].filter((rule) => rule.test(source3)).length;
  return signals >= 2;
}

function pasteBecomeTable(
  view: EditorView,
  table: PastedTable,
  parse: (markdown: string) => PMNode,
): boolean {
  const schema = view.state.schema;
  const { table: tableType, table_header_row, table_header, table_row, table_cell, paragraph } = schema.nodes;
  if (!tableType || !table_header_row || !table_header || !table_row || !table_cell || !paragraph) return false;
  const inlineCell = (text4: string) => {
    if (text4 === "") return null;
    try {
      const parsed = parse(text4.replace(/\r\n?/g, "\n"));
      const first2 = parsed.firstChild;



      if (first2?.type.name === "paragraph") return first2.content;
    } catch {

    }
    return schema.text(text4);
  };
  const cell2 = (text4: string, type: NodeType, alignment: columnAlignment = null) =>
    type.create({ alignment }, paragraph.create(null, inlineCell(text4)));
  const [header = [], ...body] = table.rows;
  const headerRow = table_header_row.create(
    null,
    header.map((text4, column) => cell2(text4, table_header, table.align?.[column] ?? null)),
  );
  const bodyRows = body.map((row) =>
    table_row.create(
      null,
      row.map((text4, column) => cell2(text4, table_cell, table.align?.[column] ?? null)),
    ),
  );
  const node = tableType.create(null, [headerRow, ...bodyRows]);
  const insertAt = view.state.selection.from;
  const tr = view.state.tr.replaceSelectionWith(node);
  const firstData = insertAt + 1 + headerRow.nodeSize + 3;
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(firstData, tr.doc.content.size - 1))));
  view.dispatch(tr.scrollIntoView());
  return true;
}













function pasteBecomeCodeBlock(view: EditorView, text2: string): boolean {
  const schema = view.state.schema;
  const codeBlock = schema.nodes.code_block;
  if (!codeBlock) return false;
  const language = guessCodeLanguage(text2);
  const node = codeBlock.create({ language: language }, text2 === "" ? undefined : schema.text(text2));
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  return true;
}


function pasteBecomeMarkdown(view: EditorView, parse: (markdown: string) => PMNode, text2: string): boolean {
  const parsed = parse(text2.replace(/\r\n?/g, "\n"));
  if (!parsed || parsed.type.name !== "doc") return false;
  const slice = new Slice(parsed.content, 0, 0);
  try {
    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
    return true;
  } catch {
    return false;
  }
}


function pasteBecomeImage(view: EditorView, address: string): boolean {
  const image = view.state.schema.nodes.image;
  const { selection } = view.state;
  if (!image || !selection.empty || !selection.$from.parent.inlineContent) return false;
  const node = image.create({
    src: address,
    alt: automaticImageName(address),
    title: "",
  });
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  return true;
}




export function pastePastePlaceManage(autoLinks = true) {
  return $prose((ctx) => {



    //






    ctx.update(editorViewOptionsCtx, (prev) => ({
      ...prev,
      transformPastedHTML: (html: string, view: EditorView) => {
        const first2 = prev.transformPastedHTML ? prev.transformPastedHTML(html, view) : html;
        return clearManagePastePasteHTML(first2).html;
      },
    }));

    return new Plugin({
      key: pastePasteKey,
      props: {
        handlePaste: (view, event) => {
          const numberEvidence = event.clipboardData;
          if (!numberEvidence) return false;
          if (!view.props.editable?.(view.state)) return false;

          const start4 = view.state.selection.$from;
          if (start4.parent.type.spec.code) return false;
          if (start4.marks().some((m) => m.type.spec.code)) return false;

          const uriList = (numberEvidence.getData("text/uri-list") ?? "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line !== "" && !line.startsWith("#"));
          const plainTextData = numberEvidence.getData("text/plain") ?? "";
          const plainText = plainTextData || (uriList.length === 1 ? (uriList[0] ?? "") : "");
          const html = numberEvidence.getData("text/html");
          const dollarNumberEvidence = numberEvidence.getData("vscode-editor-data");




          if (html.length === 0) {
            const imageAddress = imageAddressOfPastedText(plainText);
            if (imageAddress && pasteBecomeImage(view, imageAddress)) return true;
          }


          if (autoLinks && html.length === 0) {
            const transaction = pasteAboveUrlTransaction(view.state, plainText);
            if (transaction) {
              view.dispatch(transaction.scrollIntoView());
              return true;
            }
          }
          if (!autoLinks && html.length === 0 && NormalizeLink(plainText)) {
            view.dispatch(view.state.tr.insertText(plainText.trim()));
            return true;
          }

          if (dollarNumberEvidence) return false;


          const markdownTable = recognizePastedTable(plainText);
  if (
    markdownTable?.delimiter === "markdown" &&
    pasteBecomeMarkdown(view, ctx.get(parserCtx), plainText)
  ) return true;



          if (
            looksLikeMarkdownSource(plainText) &&
            pasteBecomeMarkdown(view, ctx.get(parserCtx), plainText)
          ) return true;
          // Plain prose containing one or more URLs/emails keeps every visible
          // character and gains only link marks.
          if (autoLinks && html.length === 0) {
            const linkified = linkifiedPastedTextTransaction(view.state, plainText);
            if (linkified) {
              view.dispatch(linkified.scrollIntoView());
              return true;
            }
          }

          if (html.length === 0) {
            const pasted = recognizePastedTable(plainText);
            if (pasted && pasteBecomeTable(view, pasted, ctx.get(parserCtx))) return true;
          }

          if (
            html.length === 0 &&
            plainText.length <= codePasteLimit &&
            plainText.trim() !== "" &&
            (looksLikeCode(plainText) || looksLikeSingleLineCode(plainText))
          ) {
            return pasteBecomeCodeBlock(view, plainText.replace(/\r\n?/g, "\n"));
          }

          return false;
        },
      },
    });
  });
}
