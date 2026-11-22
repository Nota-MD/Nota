








































































































































import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { Node as PMNode, ResolvedPos, Schema } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { $inputRule, $prose } from "@milkdown/kit/utils";

import { Nbsp } from "./atom-space";


export type alignmentValue = "left" | "center" | "right";







export type columnAlignment = alignmentValue | null;


export type cell = { text2: string; start4: number; endPoint: number };


export type tablePredicate = { header: cell[]; align: columnAlignment[] };







function isWhitespace(character: string): boolean {
  return character === " " || character === "\t" || character === Nbsp;
}







const normalizeWhitespace = (text4: string): string => text4.replaceAll(Nbsp, " ");






export function matchCoverHoldWholeParagraph(match2: string, paragraphText: string): boolean {
  return normalizeWhitespace(match2).startsWith(normalizeWhitespace(paragraphText));
}






export function shrinkEnterPassDark(line3: string): boolean {
  let width = 0;
  for (let i = 0; i < line3.length; i++) {
    const character = line3.charAt(i);
    if (character === " ") width += 1;
    else if (character === "\t") width += 4;
    else break;
    if (width >= 4) return true;
  }
  return false;
}











export function splitTableCells(line3: string): cell[] {
  const range: { start5: number; end2: number }[] = [];
  let start5 = 0;
  for (let i = 0; i < line3.length; i++) {
    const character = line3.charAt(i);
    if (character === "\\") {
      i += 1;
      continue;
    }
    if (character === "|") {
      range.push({ start5, end2: i });
      start5 = i + 1;
    }
  }
  range.push({ start5, end2: line3.length });

  const isWhitespaceParagraph = (paragraph2: { start5: number; end2: number }) => line3.slice(paragraph2.start5, paragraph2.end2).trim() === "";





  if (range.length > 0 && isWhitespaceParagraph(range[0]!)) range.shift();
  if (range.length > 0 && isWhitespaceParagraph(range[range.length - 1]!)) range.pop();

  return range.map((paragraph2) => {
    let left = paragraph2.start5;
    let right = paragraph2.end2;
    while (left < right && isWhitespace(line3.charAt(left))) left += 1;
    while (right > left && isWhitespace(line3.charAt(right - 1))) right -= 1;
    return { text2: line3.slice(left, right), start4: left, endPoint: right };
  });
}







export function isHeaderRow(line3: string): cell[] | null {
  if (shrinkEnterPassDark(line3)) return null;
  if (line3.trim() === "") return null;
  const cell = splitTableCells(line3);
  return cell.length > 0 ? cell : null;
}


export function isSingleLineTable(line3: string): cell[] | null {
  if (determineSeparatorLine(line3) !== null) return null;
  const cell2 = isHeaderRow(line3);
  return cell2 && cell2.length >= 2 ? cell2 : null;
}








export function determineSeparatorLine(line3: string): columnAlignment[] | null {
  if (shrinkEnterPassDark(line3)) return null;
  if (!line3.includes("|") && !line3.includes(":")) return null;

  const cell = splitTableCells(line3);
  if (cell.length === 0) return null;

  const align: columnAlignment[] = [];
  for (const cell2 of cell) {
    const match = /^(:?)(-+)(:?)$/.exec(cell2.text2);
    if (!match) return null;
    const hasLeftEmergeNumber = match[1] === ":";
    const hasRightEmergeNumber = match[3] === ":";

    align.push(hasLeftEmergeNumber && hasRightEmergeNumber ? "center" : hasLeftEmergeNumber ? "left" : hasRightEmergeNumber ? "right" : null);
  }
  return align;
}





export function isTwoRowTable(headerRow: string, separatorLine: string): tablePredicate | null {
  const header = isHeaderRow(headerRow);
  const align = determineSeparatorLine(separatorLine);
  if (!header || !align) return null;
  if (header.length !== align.length) return null;
  return { header, align };
}


function allPlainText(paragraph2: PMNode): boolean {
  for (let i = 0; i < paragraph2.childCount; i++) {
    if (!paragraph2.child(i).isText) return false;
  }
  return true;
}









function getType(schema: Schema) {
  const { table, table_header_row, table_header, table_row, table_cell, paragraph } = schema.nodes;
  if (!table || !table_header_row || !table_header || !table_row || !table_cell || !paragraph) {
    return null;
  }
  return {
    table2: table,
    headerRow: table_header_row,
    header: table_header,
    line3: table_row,
    cell2: table_cell,
    paragraph: paragraph,
  };
}










function tryConvertTable(state: EditorState, separator: ResolvedPos, separatorLine: string): Transaction | null {

  if (separator.depth !== 1) return null;

  const localParagraph = separator.parent;
  if (!localParagraph.isTextblock || !allPlainText(localParagraph)) return null;

  const paragraphBefore = separator.before(1);
  if (paragraphBefore <= 0) return null;
  const aboveParagraph = state.doc.resolve(paragraphBefore).nodeBefore;
  if (!aboveParagraph || aboveParagraph.type.name !== "paragraph" || !allPlainText(aboveParagraph)) return null;

  const determineEvidence = isTwoRowTable(aboveParagraph.textContent, separatorLine);
  if (!determineEvidence) return null;

  const type = getType(state.schema);
  if (!type) return null;

  const aboveParagraphStart = paragraphBefore - aboveParagraph.nodeSize;



  const aboveParagraphContentStart = aboveParagraphStart + 1;






  const headerCell = determineEvidence.header.map((cell2, order) =>
    type.header.create(
      { alignment: determineEvidence.align[order] ?? null },
      type.paragraph.create(
        null,
        state.doc.slice(aboveParagraphContentStart + cell2.start4, aboveParagraphContentStart + cell2.endPoint).content,
      ),
    ),
  );

  const dataCell = determineEvidence.align.map((align) =>
    type.cell2.create({ alignment: align }, type.paragraph.create()),
  );

  const headerRowNode = type.headerRow.create(null, headerCell);
  const table = type.table2.create(null, [headerRowNode, type.line3.create(null, dataCell)]);

  const tr = state.tr.replaceWith(aboveParagraphStart, separator.after(1), table);



  const dataCellContentStart = aboveParagraphStart + 1 + headerRowNode.nodeSize + 3;
  tr.setSelection(TextSelection.near(tr.doc.resolve(dataCellContentStart)));
  return tr.scrollIntoView();
}








export function trySingleLineTable(state: EditorState, line: ResolvedPos): Transaction | null {
  if (line.depth !== 1) return null;
  const localParagraph = line.parent;
  if (!localParagraph.isTextblock || !allPlainText(localParagraph)) return null;

  const cell2 = isSingleLineTable(localParagraph.textContent);
  if (!cell2) return null;
  const type = getType(state.schema);
  if (!type) return null;

  const paragraphStart = line.before(1);
  const contentStart = paragraphStart + 1;
  const headerCell = cell2.map((valueCell) =>
    type.header.create(
      { alignment: null },
      type.paragraph.create(
        null,
        state.doc.slice(contentStart + valueCell.start4, contentStart + valueCell.endPoint).content,
      ),
    ),
  );
  const dataCell = cell2.map(() => type.cell2.create({ alignment: null }, type.paragraph.create()));
  const headerRowNode = type.headerRow.create(null, headerCell);
  const table = type.table2.create(null, [
    headerRowNode,
    type.line3.create(null, dataCell),
  ]);

  const tr = state.tr.replaceWith(paragraphStart, line.after(1), table);
  const dataCellContentStart = paragraphStart + 1 + headerRowNode.nodeSize + 3;
  tr.setSelection(TextSelection.near(tr.doc.resolve(dataCellContentStart)));
  return tr.scrollIntoView();
}














export const receiveTailOfSeparatorLine = /^[ \t\u00a0]*\|?[ \t\u00a0]*(?::?-+:?[ \t\u00a0]*\|[ \t\u00a0]*)+$/;











export const tableInputRule = $inputRule(
  () =>
    new InputRule(receiveTailOfSeparatorLine, (state, match, _start, end) => {
      const separator = state.doc.resolve(end);
      if (separator.depth !== 1) return null;
      if (separator.parentOffset !== separator.parent.content.size) return null;







      if (!matchCoverHoldWholeParagraph(match[0], separator.parent.textContent)) return null;
      return tryConvertTable(state, separator, match[0]);
    }),
);







export const tableInput = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-table-input"),
      props: {
        handleKeyDown: (view, event) => {
          if (event.key !== "Enter" || event.isComposing) return false;
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;

          const { state } = view;
          const { selection } = state;
          if (!selection.empty) return false;
          const separator = selection.$from;
          if (separator.depth !== 1) return false;
          if (separator.parentOffset !== separator.parent.content.size) return false;

          const separator2 = determineSeparatorLine(separator.parent.textContent);
          const tr =
            (separator2 ? tryConvertTable(state, separator, separator.parent.textContent) : null) ??
            trySingleLineTable(state, separator);
          if (!tr) return false;
          view.dispatch(tr);
          return true;
        },
      },
    }),
);
