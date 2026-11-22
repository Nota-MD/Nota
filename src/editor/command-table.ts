
































import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import {
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
  insertImageCommand,
  toggleLinkCommand,
} from "@milkdown/kit/preset/commonmark";
import {
  insertTableCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
} from "@milkdown/kit/preset/gfm";
import { undoCommand, redoCommand } from "@milkdown/kit/plugin/history";
import { lift, toggleMark } from "@milkdown/kit/prose/commands";
import { undoInputRule } from "@milkdown/kit/prose/inputrules";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import {
  Plugin,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import {
  Fragment,
  type Node as PMNode,
  type NodeType,
} from "@milkdown/kit/prose/model";
import type { Step } from "@milkdown/kit/prose/transform";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose, callCommand } from "@milkdown/kit/utils";

import { convertBecomeTaskTaskColumnTable, clearRemoveCellStyle, deleteTableRow, deleteTableColumn, deleteWholeTable, insertCommonStyleBlock, insertItemRecord, toggleTableRowHeaders } from "./insert";
import { insertFootNote } from "./footnote";
import { githubAlertNode } from "./github-alert-edit";
import { selectLine, selectWord, selectSentence, removeWord } from "./select";
import { moveBlock } from "./move-block";
import { automaticImageName } from "./image-kind";
import { installLink, removeLink } from "./link-edit";
import { textblockDepthFrom } from "./inline-caret";
import {
  findActiveMarkRange,
  noticeTable,
  rewriteInlineBlock,
  serializeInlineBlock,
} from "./mark-hint-source";
import {
  duplicateCurrentTable,
  alignCurrentTableColumn,
  formatCurrentTable,
  resizeCurrentTable,
  moveCurrentTableColumn,
  moveCurrentTableRow,
  selectCurrentTableRange,
  setCurrentTableCellText,
  setCurrentTableCells,
  fillCurrentTableRange,
} from "./table-context";
import type { CommandPayload, EditorCommand } from "./create-types";


type HeadingCommand = `h${1 | 2 | 3 | 4 | 5 | 6}`;








type BlockCommand = Exclude<EditorCommand, HeadingCommand | "frontMatter">;






export type tableCommand = Exclude<EditorCommand, "frontMatter">;

const HEADING_RE = /^h([1-6])$/;






function isHeading(name: EditorCommand): name is HeadingCommand {
  return HEADING_RE.test(name);
}







export function sameLayerMarkTitle(state: EditorState, level: number): boolean {
  const { $from } = state.selection;
  return $from.parent.type.name === "heading" && $from.parent.attrs.level === level;
}


export function cursorAtCodeBlock(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "code_block") return true;
  }
  return false;
}

/**
 * Toggle a Markdown mark at a collapsed caret through the visible source.
 *
 * A toolbar click or Ctrl+B must have immediate feedback even when nothing is
 * selected. Typedown and Textus create an empty delimiter span at the caret;
 * Nota previously only changed storedMarks, which changed the next character
 * but left the screen unchanged. This helper inserts the visible delimiter
 * pair, removes an empty pair, and unwraps the whole current run when toggled
 * from inside it.
 */
function toggleCollapsedSourceMark(
  state: EditorState,
  markName: string,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!state.selection.empty) return false;
  const syntaxType = state.schema.nodes.notaSyntax;
  const type = state.schema.marks[markName];
  const spec = noticeTable.find((item) => item.name3 === markName);
  if (!syntaxType || !type || !spec) return false;

  const { $from } = state.selection;
  const depth = textblockDepthFrom($from);
  const parent = $from.node(depth);
  if (!parent.isTextblock || parent.type.spec.code) return false;
  const marks = state.schema.marks as Record<string, typeof type | undefined>;
  const snapshot = serializeInlineBlock(parent, syntaxType, marks);
  if (!snapshot) return false;
  const parentStart = $from.start(depth);
  const caret = snapshot.at.get(state.selection.from - parentStart);
  if (caret === undefined) return false;

  const active = findActiveMarkRange(
    state.doc,
    state.selection.from,
    type,
    syntaxType,
  );
  if (active) {
    const children: PMNode[] = [];
    state.doc.slice(active.from, active.to2).content.forEach((node) => {
      children.push(node.mark(type.removeFromSet(node.marks)));
    });
    const unwrapped = Fragment.fromArray(children);
    const rangeFrom = active.leftMarker?.from ?? active.from;
    const rangeTo = active.rightMarker?.to2 ?? active.to2;
    const relativeCaret = Math.min(
      Math.max(state.selection.from, active.from),
      active.to2,
    ) - active.from;
    const tr = state.tr.replaceWith(
      rangeFrom,
      rangeTo,
      unwrapped,
    );
    tr.setSelection(
      TextSelection.create(
        tr.doc,
        Math.min(
          rangeFrom + relativeCaret,
          rangeFrom + unwrapped.size,
        ),
      ),
    );
    tr.setStoredMarks([]).scrollIntoView();
    dispatch?.(tr);
    return true;
  }

  const pairStart = caret - spec.left.length;
  if (
    pairStart >= 0 &&
    snapshot.source.slice(pairStart, caret) === spec.left &&
    snapshot.source.slice(caret, caret + spec.right.length) === spec.right
  ) {
    const tr = rewriteInlineBlock(state, syntaxType, {
      from: pairStart,
      to2: caret + spec.right.length,
      insert: "",
      caret: pairStart,
    });
    if (!tr) return false;
    dispatch?.(tr.scrollIntoView());
    return true;
  }

  const tr = rewriteInlineBlock(state, syntaxType, {
    from: caret,
    to2: caret,
    insert: spec.left + spec.right,
    caret: caret + spec.left.length,
  });
  if (!tr) return false;
  dispatch?.(tr.scrollIntoView());
  return true;
}








export function splitReplaceInlineCode(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const type = state.schema.marks.inlineCode;
  if (!type) return false;
  const { from, to, empty, $from } = state.selection;

  if (empty) {
    if (toggleCollapsedSourceMark(state, "inlineCode", dispatch)) return true;
    const alreadyOpen = (state.storedMarks ?? $from.marks()).some((m) => m.type === type);
    const tr = state.tr;
    if (alreadyOpen) {
      tr.removeStoredMark(type);
    } else {
      for (const mark of Object.values(state.schema.marks)) {
        if (mark !== type) tr.removeStoredMark(mark);
      }
      tr.addStoredMark(type.create());
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  }

  if (state.doc.rangeHasMark(from, to, type)) {
    dispatch?.(state.tr.removeMark(from, to, type).scrollIntoView());
    return true;
  }

  const tr = state.tr;
  for (const mark of Object.values(state.schema.marks)) {
    if (mark !== type) tr.removeMark(from, to, mark);
  }
  dispatch?.(tr.addMark(from, to, type.create()).scrollIntoView());
  return true;
}









export function toggleMarkAtSelection(
  state: EditorState,
  markName: string,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const type = state.schema.marks[markName];
  if (!type) return false;
  if (toggleCollapsedSourceMark(state, markName, dispatch)) return true;

  const tr = state.tr;
  if (!(state.selection instanceof TextSelection)) {
    const position = Math.min(Math.max(1, state.selection.head), state.doc.content.size - 1);
    tr.setSelection(TextSelection.near(state.doc.resolve(position), 1));
  }

  const normalized = state.apply(tr);
  if (normalized.selection.empty) {
    const mark = type.create();
    if (type.isInSet(normalized.storedMarks ?? normalized.selection.$from.marks())) {
      tr.removeStoredMark(type);
    } else {
      tr.addStoredMark(mark);
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  }

  const markedSteps: Step[] = [];
  if (!toggleMark(type)(normalized, (next) => {
    markedSteps.push(...next.steps);
  })) {
    return false;
  }
  if (markedSteps.length === 0) return false;
  for (const step of markedSteps) tr.step(step);
  dispatch?.(tr.scrollIntoView());
  return true;
}

export function toggleMarkForToolbar(editor: Editor, markName: string): boolean {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    return toggleMarkAtSelection(view.state, markName, (tr) => view.dispatch(tr));
  });
}

/** Route Ctrl/Cmd+B and Ctrl/Cmd+I through the visible source editor. */
export const inlineMarkKeymap = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown: (view, event) => {
          if (
            event.isComposing ||
            view.composing ||
            event.altKey ||
            event.shiftKey ||
            (!event.ctrlKey && !event.metaKey)
          ) {
            return false;
          }
          const markName =
            event.key.toLowerCase() === "b"
              ? "strong"
              : event.key.toLowerCase() === "i"
                ? "emphasis"
                : null;
          if (!markName) return false;
          const handled = toggleMarkAtSelection(
            view.state,
            markName,
            (tr) => view.dispatch(tr),
          );
          if (!handled) return false;
          event.preventDefault();
          return true;
        },
      },
    }),
);









const COMMANDS: Record<BlockCommand, (editor: Editor, payload?: CommandPayload) => void> = {
  undo: (e) =>
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);

      if (!undoInputRule(view.state, view.dispatch, view)) {
        callCommand(undoCommand.key)(ctx);
      }
    }),
  redo: (e) => e.action(callCommand(redoCommand.key)),
  bold: (e) => toggleMarkForToolbar(e, "strong"),
  italic: (e) => toggleMarkForToolbar(e, "emphasis"),
  inlineCode: (e) =>
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      return splitReplaceInlineCode(view.state, (tr) => view.dispatch(tr));
    }),
  strike: (e) => toggleMarkForToolbar(e, "strike_through"),





  highlight: (e) => toggleMarkForToolbar(e, "highlight"),
  superscript: (e) => toggleMarkForToolbar(e, "superscript"),
  subscript: (e) => toggleMarkForToolbar(e, "subscript"),
  underline: (e) => toggleMarkForToolbar(e, "underline"),
  kbd: (e) => toggleMarkForToolbar(e, "kbd"),
  comment: (e) =>
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to } = view.state.selection;
      const text = view.state.doc.textBetween(from, to, "\n");
      const html = view.state.schema.nodes.html;
      if (!html) return;
      const tr = view.state.tr.replaceSelectionWith(
        html.create({ value: `<!-- ${text} -->` }),
      );
      view.dispatch(tr);
      view.focus();
    }),
  text: (e) => e.action(callCommand(turnIntoTextCommand.key)),





  quote: (e) => splitReplacePackageWrap(e, "blockquote", () => e.action(callCommand(wrapInBlockquoteCommand.key))),
  ul: (e) => splitReplacePackageWrap(e, "bullet_list", () => e.action(callCommand(wrapInBulletListCommand.key))),
  ol: (e) => splitReplacePackageWrap(e, "ordered_list", () => e.action(callCommand(wrapInOrderedListCommand.key))),
  task: (e) => convertBecomeTaskTaskColumnTable(e),



  codeBlock: (e) =>
    e.action(
      callCommand(
        (cursorAtCodeBlock(e.ctx.get(editorViewCtx).state)
          ? turnIntoTextCommand
          : createCodeBlockCommand
        ).key,
      ),
    ),
  hr: (e) => e.action(callCommand(insertHrCommand.key)),

  mathBlock: (e) => insertCommonStyleBlock(e),



  toc: (e, p) => insertItemRecord(e, p?.strict ?? false),

  footnote: (e) => insertFootNote(e),
  alertNote: (e) => githubAlertNode(e, "note"),
  alertTip: (e) => githubAlertNode(e, "tip"),
  alertImportant: (e) => githubAlertNode(e, "important"),
  alertWarning: (e) => githubAlertNode(e, "warning"),
  alertCaution: (e) => githubAlertNode(e, "caution"),




  table: (e) => e.action(callCommand(insertTableCommand.key, { row: 3, col: 3 })),
  tableRowAbove: (e) => e.action(callCommand(addRowBeforeCommand.key)),
  tableRowBelow: (e) => e.action(callCommand(addRowAfterCommand.key)),
  tableColLeft: (e) => e.action(callCommand(addColBeforeCommand.key)),
  tableColRight: (e) => e.action(callCommand(addColAfterCommand.key)),
  tableDelRow: (e) => deleteTableRow(e),
  tableDelCol: (e) => deleteTableColumn(e),
  tableDel: (e) => deleteWholeTable(e),
  tableAlignLeft: (e) => alignCurrentTableColumn(e, "left"),
  tableAlignCenter: (e) => alignCurrentTableColumn(e, "center"),
  tableAlignRight: (e) => alignCurrentTableColumn(e, "right"),
  tableResize: (e, p) => resizeCurrentTable(e, p?.columns ?? 3, p?.rows ?? 3),
  tableMoveRowUp: (e) => moveCurrentTableRow(e, -1),
  tableMoveRowDown: (e) => moveCurrentTableRow(e, 1),
  tableMoveColLeft: (e) => moveCurrentTableColumn(e, -1),
  tableMoveColRight: (e) => moveCurrentTableColumn(e, 1),
  tableCopy: (e) => duplicateCurrentTable(e),
  tableFormat: (e) => formatCurrentTable(e),
  tableRowHeaders: (e) => toggleTableRowHeaders(e),
  tableSelectRange: (e, p) =>
    selectCurrentTableRange(
      e,
      p?.tableRow ?? 0,
      p?.tableColumn ?? 0,
      p?.tableToRow ?? p?.tableRow ?? 0,
      p?.tableToColumn ?? p?.tableColumn ?? 0,
    ),
  tableSelectRow: (e, p) => selectCurrentTableRange(e, p?.tableRow ?? 0, 0, p?.tableRow ?? 0, 999),
  tableSelectColumn: (e, p) => selectCurrentTableRange(e, 0, p?.tableColumn ?? 0, 999, p?.tableColumn ?? 0),
  tableSetCell: (e, p) =>
    setCurrentTableCellText(
      e,
      p?.tableRow ?? 0,
      p?.tableColumn ?? 0,
      p?.tableText ?? "",
    ),
  tableSetCells: (e, p) => setCurrentTableCells(e, p?.tableCells ?? []),
  tableFill: (e, p) =>
    fillCurrentTableRange(
      e,
      p?.tableRow ?? 0,
      p?.tableColumn ?? 0,
      p?.tableToRow ?? p?.tableRow ?? 0,
      p?.tableToColumn ?? p?.tableColumn ?? 0,
      p?.tableFillRow ?? p?.tableToRow ?? p?.tableRow ?? 0,
      p?.tableFillColumn ?? p?.tableToColumn ?? p?.tableColumn ?? 0,
    ),




  //




  link: (e, p) => e.action(callCommand(toggleLinkCommand.key, { href: p?.href ?? "" })),
  image: (e, p) =>
    e.action(
      callCommand(insertImageCommand.key, {
        src: p?.src ?? "",
        alt: p?.alt || automaticImageName(p?.src ?? ""),
      }),
    ),



  linkSet: (e, p) => installLink(e, p),
  linkRemove: (e) => removeLink(e),

  clearFormat: (e) => clearRemoveCellStyle(e),





  selectLine: (e) => selectLine(e),
  selectWord: (e) => selectWord(e),
  selectSentence: (e) => selectSentence(e),
  deleteWord: (e) => removeWord(e),


  moveLineUp: (e) => moveBlock(e, -1),
  moveLineDown: (e) => moveBlock(e, 1),












  insertText: (e, p) => {
    const text = p?.text ?? "";
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.focus();
      if (text) view.pasteText(text);
      else view.dispatch(view.state.tr.deleteSelection());
    });
  },
};







function atPackageWrapInside(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let layer = $from.depth; layer >= 0; layer--) {
    if ($from.node(layer).type === type) return true;
  }
  return false;
}


















function splitReplacePackageWrap(e: Editor, containerName: string, packageValue: () => void): void {
  const view = e.ctx.get(editorViewCtx);
  const type = view.state.schema.nodes[containerName];
  if (type && atPackageWrapInside(view.state, type)) {
    liftValueLayer(view, containerName);
    return;
  }
  packageValue();
}












function liftValueLayer(view: EditorView, containerName: string): void {
  if (containerName === "blockquote") {
    lift(view.state, view.dispatch);
    return;
  }
  const item5 = view.state.schema.nodes.list_item;
  if (item5) liftListItem(item5)(view.state, view.dispatch);
}













export function runCommand(editor: Editor, name: tableCommand, payload?: CommandPayload): void {
  if (isHeading(name)) {
    const level = Number(HEADING_RE.exec(name)![1]);
    const view = editor.ctx.get(editorViewCtx);
    if (sameLayerMarkTitle(view.state, level)) {
      editor.action(callCommand(turnIntoTextCommand.key));
    } else {
      editor.action(callCommand(wrapInHeadingCommand.key, level));
    }
  } else {
    COMMANDS[name](editor, payload);
  }
}
