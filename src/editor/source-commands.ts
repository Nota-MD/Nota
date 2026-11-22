

























import { moveLineDown, moveLineUp, redo, selectLine, undo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";

import { atxPrefixRe } from "@/editor/atx";
import type { CommandPayload, EditorCommand } from "@/editor/create";


import { belowValueItemFootNoteLabel, scanSourceTextLabel } from "@/editor/footnote";


import { splitFrontMatter, replaceFrontMatter, newFrontMatterTemplate } from "@/editor/front-matter";


import { tryRemoveFixedBoundarySymbol } from "@/editor/source-mark";


import { wordRange, sentenceRange } from "@/editor/select";


import { removeSourceLink, sourceLink, sourceLinkRange } from "@/editor/link-edit";



import { t } from "@/i18n";














const LINE_PREFIXES: Record<string, RegExp> = {

  quote: /^(?:> ?)+/,

  bullet: /^[-*+] +/,

  ordered: /^\d+[.)] +/,



  task: /^(?:[-*+] +\[[ xX]\] +|[-*+] +)/,
};


function selectedLines(
  view: EditorView,
): Array<{ from: number; to: number }> {
  const { from, to } = view.state.selection.main;
  const out: Array<{ from: number; to: number }> = [];
  const doc = view.state.doc;
  let line = doc.lineAt(from);
  const last = doc.lineAt(to);
  for (;;) {
    out.push({ from: line.from, to: line.to });
    if (line.number >= last.number) break;
    line = doc.line(line.number + 1);
  }
  return out;
}


function setLinePrefix(
  view: EditorView,
  family: string,
  prefix: string | null,
  strict: boolean,
): void {

  const re = family === "heading" ? atxPrefixRe(strict) : LINE_PREFIXES[family];
  if (!re) return;
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  for (const line of selectedLines(view)) {
    const text = view.state.doc.sliceString(line.from, line.to);
    const hit = re.exec(text);
    const stripped = hit ? text.slice(hit[0].length) : text;
    const want = prefix === null ? stripped : prefix + stripped;
    if (want === text) continue;


    if (prefix !== null && stripped.trim() === "") continue;
    changes.push({ from: line.from, to: line.to, insert: want });
  }
  if (changes.length === 0) return;
  view.dispatch({ changes });
}


function allIsThisValueLevelMarkTitle(view: EditorView, prefix: string, strict: boolean): boolean {
  const re = atxPrefixRe(strict);
  const lines = selectedLines(view).filter((line) => view.state.doc.sliceString(line.from, line.to).trim() !== "");
  if (lines.length === 0) return false;
  return lines.every((line) => {
    const hit = re.exec(view.state.doc.sliceString(line.from, line.to));
    return hit?.[0] === prefix;
  });
}


function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholderText: string,
): void {
  const { from, to } = view.state.selection.main;
  const picked = view.state.sliceDoc(from, to);
  const body = picked || placeholderText;
  view.dispatch({
    changes: { from, to, insert: `${before}${body}${after}` },

    selection: { anchor: from + before.length, head: from + before.length + body.length },
  });
}

















function splitReplaceInlineMark(
  view: EditorView,
  before: string,
  after: string,
  placeholderText: string,
): void {
  const { from, to } = view.state.selection.main;
  const remove2 = tryRemoveFixedBoundarySymbol(view.state.doc.toString(), from, to, before, after);
  if (remove2 === null) {

    wrapSelection(view, before, after, placeholderText);
    return;
  }
  if (remove2.result2 === "stationary") return;


  view.dispatch({ changes: remove2.changeAction, selection: remove2.selection });
}











function clearRemoveInlineMark(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  const original = view.state.sliceDoc(from, to);
  const clean = original



    .replace(/!\[([\s\S]*?)\]\([^)\s]*\)/g, "$1")


    .replace(/\[([\s\S]*?)\]\([^)\s]*\)/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/~~([\s\S]+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")





    .replace(/==([\s\S]+?)==/g, "$1")
    .replace(/<u>([\s\S]+?)<\/u>/gi, "$1")
    .replace(/\^([^\^\n]+?)\^/g, "$1")
    .replace(/(?<!~)~([^~\n]+?)~(?!~)/g, "$1")



    .replace(/\*([^*\n]+?)\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,，。]|$)/g, "$1$2");
  if (clean === original) return;
  view.dispatch({ changes: { from, to, insert: clean } });
}


function insertAtCursor(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
}


function insertBlock(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  const at = view.state.doc.lineAt(from);

  const needsBreak = at.from !== from;
  const body = (needsBreak ? "\n" : "") + text;
  const offset = body.indexOf("$0");
  const insert = offset >= 0 ? body.replace("$0", "") : body;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: offset >= 0 ? from + offset : from + insert.length },
  });
}






















export function applyCommand(
  view: EditorView,
  name: EditorCommand,
  strict: boolean,
  payload?: CommandPayload,
): boolean {
  switch (name) {
    case "undo":
      undo(view);
      return true;
    case "redo":
      redo(view);
      return true;


    case "bold":
      splitReplaceInlineMark(view, "**", "**", t("Bold"));
      return true;
    case "italic":
      splitReplaceInlineMark(view, "*", "*", t("Italic"));
      return true;
    case "strike":
      splitReplaceInlineMark(view, "~~", "~~", t("Strikethrough"));
      return true;
    case "inlineCode":
      splitReplaceInlineMark(view, "`", "`", t("Code"));
      return true;





    case "highlight":
      splitReplaceInlineMark(view, "==", "==", t("Highlight"));
      return true;
    case "superscript":
      splitReplaceInlineMark(view, "^", "^", t("Superscript"));
      return true;
    case "subscript":
      splitReplaceInlineMark(view, "~", "~", t("Subscript"));
      return true;
    case "underline":
      splitReplaceInlineMark(view, "<u>", "</u>", t("Underline"));
      return true;
    case "comment":
      splitReplaceInlineMark(view, "<!-- ", " -->", t("Comment"));
      return true;

    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(name.slice(1));
      const prefix = "#".repeat(level) + " ";
      setLinePrefix(view, "heading", allIsThisValueLevelMarkTitle(view, prefix, strict) ? null : prefix, strict);
      return true;
    }
    case "text":
      setLinePrefix(view, "heading", null, strict);
      return true;
    case "quote":
      setLinePrefix(view, "quote", "> ", strict);
      return true;
    case "ul":
      setLinePrefix(view, "bullet", "- ", strict);
      return true;
    case "ol":
      setLinePrefix(view, "ordered", "1. ", strict);
      return true;
    case "task":
      setLinePrefix(view, "task", "- [ ] ", strict);
      return true;
    case "hr":
      insertBlock(view, "\n---\n$0");
      return true;



    case "footnote": {
      const { from, to } = view.state.selection.main;
      const label = belowValueItemFootNoteLabel(scanSourceTextLabel(view.state.doc.toString()));
      const fragment = `[^${label}]`;
      const end = view.state.doc.length;


      const fixedMeaningFragment = (end === 0 ? "" : "\n\n") + `[^${label}]: `;
      if (to === end) {


        const combine = fragment + fixedMeaningFragment;
        view.dispatch({
          changes: { from, to, insert: combine },
          selection: { anchor: from + combine.length },
        });
      } else {



        view.dispatch({
          changes: [
            { from, to, insert: fragment },
            { from: end, insert: fixedMeaningFragment },
          ],
          selection: { anchor: end + fixedMeaningFragment.length },
        });
      }
      return true;
    }
    case "codeBlock":
      insertBlock(view, "\n```\n$0\n```\n");
      return true;



    case "mathBlock":
      insertBlock(view, "\n$$\n$0\n$$\n");
      return true;
    case "table":




      insertBlock(
        view,
        t("\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| $0 |  |  |\n|  |  |  |\n"),
      );
      return true;



    case "link": {
      if (!payload?.href) return false;
      wrapSelection(view, "[", `](${payload.href})`, t("Link Text"));
      return true;
    }






    case "linkSet": {
      const { from, to } = view.state.selection.main;
      const current2 = from === to ? sourceLinkRange(view.state.doc.toString(), from) : null;
      const area = current2 ?? { from, to };
      const newValue = sourceLink(payload?.label ?? "", payload?.href ?? "");

      if (newValue === "") return true;
      view.dispatch({
        changes: { from: area.from, to: area.to, insert: newValue },


        selection: { anchor: area.from + newValue.length },
      });
      return true;
    }



    case "linkRemove": {
      const { from, to } = view.state.selection.main;
      const current2 = from === to ? sourceLinkRange(view.state.doc.toString(), from) : null;
      if (current2) {
        view.dispatch({
          changes: { from: current2.from, to: current2.to, insert: current2.label },
          selection: { anchor: current2.from + current2.label.length },
        });
        return true;
      }
      if (from === to) return true;
      const original = view.state.sliceDoc(from, to);
      const clean = removeSourceLink(original);
      if (clean !== original) view.dispatch({ changes: { from, to, insert: clean } });
      return true;
    }
    case "image": {
      if (!payload?.src) return false;
      insertAtCursor(view, `![${payload.alt ?? ""}](${payload.src})`);
      return true;
    }
    case "clearFormat":
      clearRemoveInlineMark(view);
      return true;









    case "selectLine": {
      selectLine(view);
      return true;
    }




    case "selectWord":
    case "selectSentence": {
      const head2 = view.state.selection.main.head;
      const line3 = view.state.doc.lineAt(head2);
      const area =
        name === "selectWord"
          ? wordRange(line3.text, head2 - line3.from)
          : sentenceRange(line3.text, head2 - line3.from);
      if (area && area.from < area.to) {
        const from = line3.from + area.from;
        const to = line3.from + area.to;
        view.dispatch({ selection: { anchor: from, head: to } });
      }
      return true;
    }


    case "deleteWord": {
      const select = view.state.selection.main;
      const area = select.empty
        ? (() => {
            const line3 = view.state.doc.lineAt(select.head);
            const word = wordRange(line3.text, select.head - line3.from);
            return word && { from: line3.from + word.from, to: line3.from + word.to };
          })()
        : { from: select.from, to: select.to };


      if (area && area.from < area.to) {
        view.dispatch({
          changes: { from: area.from, to: area.to },
          selection: { anchor: area.from },
        });
      }
      return true;
    }




    case "moveLineUp": {
      moveLineUp(view);
      return true;
    }
    case "moveLineDown": {
      moveLineDown(view);
      return true;
    }





    case "insertText": {
      view.dispatch(view.state.replaceSelection(payload?.text ?? ""));
      return true;
    }









    case "frontMatter": {
      const originalBlock = splitFrontMatter(view.state.doc.toString()).frontMatter;
      const want = payload?.frontMatter;
      const newValueBlock =
        want === undefined
          ? originalBlock ?? replaceFrontMatter(null, newFrontMatterTemplate)
          : replaceFrontMatter(originalBlock, want ?? "");
      if (newValueBlock === originalBlock) return true;



      view.dispatch({ changes: { from: 0, to: originalBlock?.length ?? 0, insert: newValueBlock ?? "" } });
      return true;
    }

    case "tableRowAbove":
    case "tableRowBelow":
    case "tableColLeft":
    case "tableColRight":
    case "tableDelRow":
    case "tableDelCol":
    case "tableDel":
    case "tableAlignLeft":
    case "tableAlignCenter":
    case "tableAlignRight":
      return false;
    default:
      return false;
  }
}
