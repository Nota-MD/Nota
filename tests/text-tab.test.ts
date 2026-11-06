import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import { applyTextTab } from "../src/editor/text-tab";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
});

function stateWith(...lines: string[]): EditorState {
  const doc = schema.nodes.doc.create(
    null,
    lines.map((line) =>
      schema.nodes.paragraph.create(null, line ? schema.text(line) : undefined),
    ),
  );
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1),
  });
}

function press(state: EditorState, reverse = false): EditorState {
  let next = state;
  applyTextTab(state, (tr) => {
    next = state.apply(tr);
  }, reverse, 2);
  return next;
}

let passed = 0;
function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  passed++;
}

const empty = stateWith("");
const indented = press(empty);
equal(indented.doc.childCount, 1, "Tab changed the number of paragraphs");
equal(indented.doc.firstChild?.textContent, "\u00A0\u00A0", "Tab did not insert visible indentation");

const text = schema.nodes.doc.create(
  null,
  schema.nodes.paragraph.create(null, schema.text("x")),
);
const afterX = EditorState.create({
  schema,
  doc: text,
  selection: TextSelection.create(text, 2),
});
equal(press(afterX).doc.textContent, "x\u00A0\u00A0", "Tab did not append indentation at the caret");
equal(press(afterX, true).doc.textContent, "x", "Shift+Tab edited a line without indentation");

const twoLinesDocument = schema.nodes.doc.create(null, [
  schema.nodes.paragraph.create(null, schema.text("a")),
  schema.nodes.paragraph.create(null, schema.text("b")),
]);
const twoLines = EditorState.create({
  schema,
  doc: twoLinesDocument,
  selection: TextSelection.create(twoLinesDocument, 1, 5),
});
let selected = twoLines;
applyTextTab(
  twoLines,
  (tr) => {
    selected = twoLines.apply(tr);
  },
  false,
  2,
);
equal(selected.doc.textContent, "\u00A0\u00A0a\u00A0\u00A0b", "multi-block selection was not indented");

console.log(`${passed} text-tab assertions passed`);
