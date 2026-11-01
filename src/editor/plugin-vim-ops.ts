import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { closeHistory, redo, undo } from "@milkdown/kit/prose/history";
import {
  around,
  flatten,
  indexOf,
  lineEndIndex,
  lineStartIndex,
  linesRange,
  motion,
  posOf,
  selectionText,
  verticalMove,
} from "./plugin-vim-text";

/** Transactions carrying this meta are trusted edits produced by the Vim
 * adapter. The adapter's transaction filter blocks every other document
 * change while normal or visual mode owns the keyboard. */
export const VIM_INPUT_META = "nota-vim-input";
/** 显式的块结构编辑（例如取消引用）在 Vim 普通模式下也允许写回文档。 */
export const VIM_ALLOW_STRUCTURE_META = "nota-vim-allow-structure";

export type EditorOp =
  | {
      op: "move";
      unit: string;
      count?: number;
      /** Extend the selection from where it is anchored. */
      select?: boolean;
      /** Visual mode's: from where it started to where the cursor lands, both in. */
      visual?: boolean;
      char?: string;
      forward?: boolean;
      till?: boolean;
    }
  | { op: "selectLines"; count?: number }
  | { op: "visualStart" }
  | { op: "delete"; copy?: boolean }
  | { op: "deleteLines"; count?: number }
  | { op: "copy" }
  | { op: "copyLines"; count?: number }
  | { op: "deleteChars"; count?: number; back?: boolean; copy?: boolean }
  | { op: "insertText"; text: string }
  | { op: "pasteLines"; text: string; above?: boolean }
  | { op: "openLine"; above?: boolean }
  | { op: "replaceChar"; char: string }
  | { op: "collapse"; to?: "head" | "start" | "end" }
  | { op: "joinLines"; count?: number; spaces?: boolean }
  | { op: "indentLines"; count?: number; direction: 1 | -1 }
  | { op: "position" }
  | { op: "search"; query: string; forward?: boolean; count?: number }
  | { op: "undo" }
  | { op: "redo" }
  | { op: "cursor"; style: "bar" | "block" };

export interface EditorOpResult {
  /** What a delete or copy took; a line copy ends with "\n". */
  text?: string;
  /** For flash: how many places it found. */
  labels?: number;
  /** For flash: the labels' letters, nearest the caret first. */
  letters?: string;
  /** One-based logical line containing the cursor. */
  line?: number;
  /** Whether the selection is empty now. */
  empty: boolean;
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => {});
}

/**
 * Editor operations used by the Vim adapter. One instance owns one editor
 * view, so visual anchors and vertical goal columns never leak between a
 * document and its read-only split preview.
 */
export class VimEditorOps {
  private visual: { anchor: number; head: number } | null = null;
  private goalX: number | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly setCursor: (style: "bar" | "block") => void,
  ) {}

  run(action: EditorOp): EditorOpResult {
    return this.runInner(action);
  }

  private runInner(action: EditorOp): EditorOpResult {
  if (action.op === "cursor") {
    this.setCursor(action.style);
    return { empty: true };
  }
  const view = this.view;
  if (!view || view.isDestroyed) throw new Error("No editor.");
  const state = view.state;
  const dispatch = (tr: Transaction) =>
    view.dispatch(
      (tr.docChanged ? closeHistory(tr) : tr)
        .setMeta(VIM_INPUT_META, true)
        .scrollIntoView(),
    );
  const result: EditorOpResult = { empty: true };
  const count = Math.max(
    1,
    Math.min(10_000, "count" in action ? (action.count ?? 1) : 1),
  );
  const vertical =
    action.op === "move" && (action.unit === "up" || action.unit === "down");
  if (!vertical) this.goalX = null;
  switch (action.op) {
    case "move": {
      const { anchor } = state.selection;
      const head =
        action.visual && this.visual ? this.visual.head : state.selection.head;
      let to = head;
      if (action.unit === "up" || action.unit === "down") {
        this.goalX ??= view.coordsAtPos(head, 1).left;
        for (let n = 0; n < count; n++)
          to = verticalMove(view, to, action.unit === "down" ? 1 : -1, this.goalX);
      } else if (action.unit === "docStart") {
        to = TextSelection.atStart(state.doc).from;
      } else if (action.unit === "docEnd") {
        to = TextSelection.atEnd(state.doc).from;
      } else if (action.unit === "docLine") {
        // Line `count` of the document (Vim's 12G), at its first non-space character.
        const flat = flatten(state.doc, 0, state.doc.content.size);
        let i = 0;
        for (let n = 1; n < count; n++) {
          const next = flat.text.indexOf("\n", i);
          if (next < 0) break;
          i = next + 1;
        }
        to = posOf(flat, motion(flat, i, "lineFirstChar", {}));
      } else {
        const flat = around(state, head);
        let i = indexOf(flat, head);
        for (let n = 0; n < count; n++)
          i = motion(flat, i, action.unit, action);
        to = posOf(flat, i);
      }
      const $to = state.doc.resolve(
        Math.max(0, Math.min(to, state.doc.content.size)),
      );
      if (action.visual && this.visual) {
        this.visual.head = TextSelection.near($to).head;
        dispatch(
          state.tr.setSelection(
            this.visualSelection(state, this.visual.anchor, this.visual.head),
          ),
        );
        break;
      }
      this.visual = null;
      const sel = action.select
        ? TextSelection.between(state.doc.resolve(anchor), $to)
        : TextSelection.near($to);
      dispatch(state.tr.setSelection(sel));
      break;
    }
    case "visualStart": {
      const at = state.selection.head;
      this.visual = { anchor: at, head: at };
      dispatch(state.tr.setSelection(this.visualSelection(state, at, at)));
      break;
    }
    case "selectLines": {
      const lines = linesRange(state, count);
      dispatch(
        state.tr.setSelection(
          TextSelection.between(
            state.doc.resolve(lines.blocks ? lines.from + 1 : lines.from),
            state.doc.resolve(lines.blocks ? lines.to - 1 : lines.to),
          ),
        ),
      );
      break;
    }
    case "copy": {
      result.text = selectionText(state);
      copyText(result.text);
      break;
    }
    case "copyLines": {
      result.text = linesRange(state, count).text;
      copyText(result.text);
      break;
    }
    case "delete": {
      result.text = selectionText(state);
      if (action.copy !== false) copyText(result.text);
      if (!state.selection.empty) dispatch(state.tr.deleteSelection());
      break;
    }
    case "deleteLines": {
      const lines = linesRange(state, count);
      result.text = lines.text;
      copyText(lines.text);
      const tr = state.tr;
      if (
        lines.blocks &&
        lines.from === 0 &&
        lines.to === state.doc.content.size
      )
        tr.delete(lines.from + 1, lines.to - 1);
      else tr.delete(lines.from, lines.to);
      dispatch(tr);
      break;
    }
    case "deleteChars": {
      const { head } = state.selection;
      const flat = around(state, head, 2_000);
      const i = indexOf(flat, head);
      const lineStart = lineStartIndex(flat.text, i);
      const lineEnd = lineEndIndex(flat.text, i);
      const [a, b] = action.back
        ? [Math.max(lineStart, i - count), i]
        : [i, Math.min(lineEnd, i + count)];
      if (b > a) {
        const from = posOf(flat, a);
        const to = posOf(flat, b);
        result.text = state.doc.textBetween(from, to, "\n");
        if (action.copy !== false) copyText(result.text);
        dispatch(state.tr.delete(from, to));
      }
      break;
    }
    case "insertText": {
      dispatch(state.tr.insertText(action.text));
      break;
    }
    case "pasteLines": {
      const lines = action.text.replace(/\n$/, "").split("\n");
      const { $head } = state.selection;
      let depth = $head.depth;
      while (depth > 0 && !$head.node(depth).isTextblock) depth--;
      const paragraph = state.schema.nodes.paragraph;
      if (depth === 0 || !paragraph || $head.node(depth).type.spec.code) {
        dispatch(state.tr.insertText(action.text));
        break;
      }
      const at = action.above ? $head.before(depth) : $head.after(depth);
      const nodes = lines.map((line) =>
        paragraph.create(null, line ? state.schema.text(line) : null),
      );
      const tr = state.tr.insert(at, nodes);
      dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1))));
      break;
    }
    case "openLine": {
      const { $head } = state.selection;
      let depth = $head.depth;
      while (depth > 0 && !$head.node(depth).isTextblock) depth--;
      if (depth === 0) break;
      if ($head.node(depth).type.spec.code) {
        const offset = $head.pos - $head.start(depth);
        const text = $head.node(depth).textContent;
        const at = action.above
          ? $head.start(depth) + text.lastIndexOf("\n", offset - 1) + 1
          : $head.start(depth) + lineEndIndex(text, offset);
        const tr = state.tr.insertText("\n", at);
        dispatch(
          tr.setSelection(
            TextSelection.create(tr.doc, action.above ? at : at + 1),
          ),
        );
        break;
      }
      const at = action.above ? $head.before(depth) : $head.after(depth);
      const type =
        $head.node(depth).type.name === "heading"
          ? state.schema.nodes.paragraph
          : $head.node(depth).type;
      if (!type) break;
      const tr = state.tr.insert(at, type.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)));
      break;
    }
    case "replaceChar": {
      const { head } = state.selection;
      const next = state.doc.textBetween(
        head,
        Math.min(head + 1, state.doc.content.size),
        "\n",
        "\n",
      );
      if (next && next !== "\n")
        dispatch(
          state.tr
            .insertText(action.char, head, head + 1)
            .setSelection(TextSelection.create(state.doc, head)),
        );
      break;
    }
    case "collapse": {
      this.visual = null;
      const { from, to, head } = state.selection;
      const at = action.to === "start" ? from : action.to === "end" ? to : head;
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, at)));
      break;
    }
    case "joinLines": {
      const { $head } = state.selection;
      let depth = $head.depth;
      while (depth > 0 && !$head.node(depth).isTextblock) depth--;
      const tr = state.tr;
      let boundary = $head.end(depth);
      for (let n = 1; n < count; n++) {
        if (boundary >= tr.doc.content.size) break;
        tr.join(boundary);
        if (action.spaces !== false && boundary > 0) {
          tr.insertText(" ", boundary - 1);
          boundary += 1;
        }
        const next = tr.doc.resolve(Math.min(boundary + 1, tr.doc.content.size));
        let nextDepth = next.depth;
        while (nextDepth > 0 && !next.node(nextDepth).isTextblock) nextDepth--;
        boundary = next.end(nextDepth);
      }
      dispatch(tr);
      break;
    }
    case "indentLines": {
      const { $head } = state.selection;
      let depth = $head.depth;
      while (depth > 0 && !$head.node(depth).isTextblock) depth--;
      const tr = state.tr;
      let node = $head.node(depth);
      let from = $head.start(depth);
      for (let n = 0; n < count; n++) {
        if (action.direction > 0) {
          tr.insertText("    ", from);
        } else {
          const text = tr.doc.textBetween(from, Math.min(from + 4, node.content.size + from));
          const remove = text.startsWith("    ") ? 4 : text.startsWith("\t") ? 1 : 0;
          if (remove) tr.delete(from, from + remove);
        }
        from = tr.doc.resolve(Math.min(from + 1, tr.doc.content.size)).after(depth);
        const next = tr.doc.resolve(Math.min(from + 1, tr.doc.content.size));
        let nextDepth = next.depth;
        while (nextDepth > 0 && !next.node(nextDepth).isTextblock) nextDepth--;
        if (nextDepth === 0) break;
        node = next.node(nextDepth);
        from = next.start(nextDepth);
      }
      dispatch(tr);
      break;
    }
    case "position": {
      const flat = flatten(state.doc, 0, state.doc.content.size);
      const at = indexOf(flat, state.selection.head);
      result.line = flat.text.slice(0, at).split("\n").length;
      break;
    }
    case "undo":
      undo(state, dispatch);
      break;
    case "redo":
      redo(state, dispatch);
      break;
    case "search": {
      const flat = flatten(state.doc, 0, state.doc.content.size);
      const query = action.query;
      if (!query) break;
      const lower = flat.text.toLocaleLowerCase();
      const needle = query.toLocaleLowerCase();
      const head = state.selection.head;
      const cursor = indexOf({ ...flat, end: flat.end }, head);
      let at = -1;
      for (let n = 0; n < count; n++) {
        at =
          action.forward === false
            ? lower.lastIndexOf(needle, Math.max(0, cursor - 1))
            : lower.indexOf(needle, cursor + (n === 0 ? 0 : needle.length));
        if (at < 0) {
          at =
            action.forward === false
              ? lower.lastIndexOf(needle)
              : lower.indexOf(needle);
        }
      }
      if (at >= 0) {
        const from = posOf(flat, at);
        const to = posOf(flat, at + query.length);
        dispatch(
          state.tr.setSelection(
            TextSelection.create(state.doc, from, Math.max(from, to)),
          ),
        );
      }
      break;
    }
  }
  result.empty = view.state.selection.empty;
  return result;
  }

  private visualSelection(state: EditorState, anchor: number, head: number) {
    const doc = state.doc;
    const after = (p: number) => {
      const $p = doc.resolve(p);
      return Math.min(p + 1, $p.parent.isTextblock ? $p.end() : p);
    };
    return head >= anchor
      ? TextSelection.create(doc, anchor, after(head))
      : TextSelection.create(doc, after(anchor), head);
  }
}
