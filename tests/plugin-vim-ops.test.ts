import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { VimEditorOps } from "@/editor/plugin-vim-ops";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    text: { group: "inline" },
    notaSyntax: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: {
        syntax: { default: "" },
        side: { default: "left" },
        symbol: { default: "*" },
      },
    },
  },
});

function viewFor(text: string) {
  let state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(
      null,
      schema.nodes.paragraph.create(
        null,
        text ? schema.text(text) : undefined,
      ),
    ),
    selection: TextSelection.create(
      schema.nodes.doc.create(
        null,
        schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined),
      ),
      1,
    ),
  });
  const view = {
    get state() {
      return state;
    },
    get isDestroyed() {
      return false;
    },
    dispatch(tr: EditorState["tr"]) {
      state = state.apply(tr);
    },
  };
  return { view: view as unknown as EditorView, text: () => state.doc.textContent };
}

let passed = 0;
let failed = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  if (Object.is(actual, expected)) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const visual = viewFor("abcdef");
const ops = new VimEditorOps(visual.view, () => {});
ops.run({ op: "visualStart" });
ops.run({ op: "move", unit: "right", count: 3, visual: true });
equal(visual.view.state.selection.empty, false, "visual mode creates a range");
equal(
  visual.view.state.doc.textBetween(
    visual.view.state.selection.from,
    visual.view.state.selection.to,
    "\n",
  ),
  "abcd",
  "visual l is inclusive",
);
ops.run({ op: "delete" });
equal(visual.text(), "ef", "visual delete removes the selected characters");

const chars = viewFor("abcdef");
const charOps = new VimEditorOps(chars.view, () => {});
charOps.run({ op: "deleteChars", count: 2 });
equal(chars.text(), "cdef", "x deletes the character under the cursor");

{
  const syntax = schema.nodes.notaSyntax!;
  const marker = () => syntax.create({ syntax: "strong", side: "left", symbol: "*" });
  let state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        marker(),
        marker(),
        schema.text("1"),
        marker(),
        marker(),
      ]),
    ]),
    selection: TextSelection.create(
      schema.nodes.doc.create(null, [
        schema.nodes.paragraph.create(null, [
          marker(),
          marker(),
          schema.text("1"),
          marker(),
          marker(),
        ]),
      ]),
      2,
    ),
  });
  const view = {
    get state() {
      return state;
    },
    get isDestroyed() {
      return false;
    },
    dispatch(tr: EditorState["tr"]) {
      state = state.apply(tr);
    },
  };
  const syntaxOps = new VimEditorOps(view as unknown as EditorView, () => {});
  syntaxOps.run({ op: "move", unit: "left" });
  equal(state.selection.from, 1, "Vim left crosses the opening syntax atom to line start");
}

if (failed) {
  console.error(`${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`${passed} passed`);
