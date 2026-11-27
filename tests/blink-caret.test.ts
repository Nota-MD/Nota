/**
 * Body caret overlay and blink styles.
 *
 * Real ProseMirror schemas and EditorStates verify caret eligibility and ensure
 * that the implementation does not reintroduce input-blocking widget decorations.
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { readFileSync } from "node:fs";

import {
  caretHeightInLine,
  caretTopInLine,
  blinkingCaretPlugin,
  inlineMathBoundary,
  inlineSyntaxBoundary,
  shouldShowBodyCaret,
  usableCaretCoordinate,
} from "../src/editor/blink-caret";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*", attrs: { level: { default: 1 } } },
    code_block: { group: "block", content: "text*", code: true, marks: "" },
    math_block: { group: "block", content: "text*", atom: true, marks: "" },
    math_inline: { group: "inline", inline: true, content: "text*", atom: true, marks: "" },
    notaLinkSource: {
      group: "inline",
      inline: true,
      content: "text*",
      code: true,
      marks: "",
    },
    notaSyntax: { group: "inline", inline: true, atom: true, selectable: false, marks: "" },
    text: { group: "inline" },
  },
});

function document(...blocks: PMNode[]): PMNode {
  return schema.nodes.doc.create(null, blocks);
}

function paragraph2(text3: string): PMNode {
  return schema.nodes.paragraph.create(null, text3 ? schema.text(text3) : null);
}

function makeEditorState(doc: PMNode, selection = 1): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, selection),
    plugins: [blinkingCaretPlugin()],
  });
}

console.log("\n[Body blinking caret]");

testCase("a collapsed selection in a paragraph produces a caret", () => {
  const editorState = makeEditorState(document(paragraph2("正文")));
  equal(shouldShowBodyCaret(editorState), true, "a paragraph should show the caret");
});

testCase("a collapsed selection in a heading also produces a caret", () => {
  const heading = schema.nodes.heading.create({ level: 1 }, schema.text("标题"));
  const editorState = makeEditorState(document(heading), 2);
  equal(shouldShowBodyCaret(editorState), true, "a heading should show the caret");
});

testCase("heading carets follow heading text size while body carets keep line height", () => {
  equal(caretHeightInLine("heading", 48, 18), 48, "heading caret does not follow heading text height");
  equal(caretHeightInLine("paragraph", 30, 18), 30, "body caret is shortened incorrectly");
  equal(caretHeightInLine("heading", 12, 18), 12, "small line boxes should not be compressed further");
});

testCase("carets beside tall inline atoms occupy one line", () => {
  equal(caretHeightInLine("paragraph", 720, 18), 22, "image height was mistaken for caret height");
  equal(caretTopInLine(720, 22, 180, 18), 180, "the caret before a tall atom is not at the line top");
  equal(caretTopInLine(30, 30, 180, 18), 180, "ordinary body caret top is shifted");
});

testCase("carets at inline-mark boundaries fall back to body coordinates", () => {
  equal(
    usableCaretCoordinate([
      { left: 100, top: 20, bottom: 20 },
      { left: 98, top: 18, bottom: 42 },
    ])?.left,
    98,
    "zero-height marker coordinates do not trigger fallback",
  );
  equal(
    usableCaretCoordinate([null, { left: 10, top: 0, bottom: 18 }])?.bottom,
    18,
    "valid coordinates are discarded",
  );
  equal(usableCaretCoordinate([null, undefined]), null, "the implementation should not guess without valid coordinates");
});

testCase("selected text does not draw an extra caret", () => {
  const doc = document(paragraph2("选中我"));
  const editorState = makeEditorState(doc);
  const selected = editorState.apply(
    editorState.tr.setSelection(TextSelection.create(doc, 1, 4)),
  );
  equal(shouldShowBodyCaret(selected), false, "a collapsed caret is shown while text is selected");
});

testCase("code blocks and math blocks delegate caret drawing to inner editors", () => {
  const code = makeEditorState(document(schema.nodes.code_block.create(null, schema.text("x"))));
  const math = makeEditorState(document(schema.nodes.math_block.create(null, schema.text("x"))));
  equal(shouldShowBodyCaret(code), false, "code blocks should not show the body caret");
  equal(shouldShowBodyCaret(math), false, "math blocks should not show the body caret");
});

testCase("carets between inline syntax markers remain in the body layer", () => {
  const marker = schema.nodes.notaSyntax.create();
  const state = makeEditorState(
    document(schema.nodes.paragraph.create(null, [schema.text("Typora"), marker, marker])),
    8,
  );
  equal(shouldShowBodyCaret(state), true, "the `Typora|**` boundary still hides the caret");
});

testCase("both sides of inline syntax atoms use real character boundaries", () => {
  const marker = schema.nodes.notaSyntax.create();
  const paragraph = schema.nodes.paragraph.create(null, [
    schema.text("word"),
    marker,
  ]);
  const doc = document(paragraph);
  const beforeMarker = 1 + schema.text("word").nodeSize;
  const before = EditorState.create({
    doc,
    selection: TextSelection.create(doc, beforeMarker),
  });
  const after = EditorState.create({
    doc,
    selection: TextSelection.create(doc, beforeMarker + marker.nodeSize),
  });
  equal(
    JSON.stringify(inlineSyntaxBoundary(before)),
    JSON.stringify({ position: beforeMarker, side: "before" }),
    "star left edge was not identified",
  );
  equal(
    JSON.stringify(inlineSyntaxBoundary(after)),
    JSON.stringify({ position: beforeMarker, side: "after" }),
    "star right edge was not identified",
  );
});

testCase("link source nodes still use the body caret layer", () => {
  const source = schema.nodes.notaLinkSource.create(
    null,
    schema.text("[github](https://github.com)"),
  );
  const state = makeEditorState(
    document(schema.nodes.paragraph.create(null, [source])),
    3,
  );
  equal(shouldShowBodyCaret(state), true, "link source nodes hide the body caret");
});

testCase("math-boundary carets use node coordinates instead of theme line-box coordinates", () => {
  const formula = schema.nodes.math_inline.create(null, schema.text("LaTeX"));
  const paragraph2 = schema.nodes.paragraph.create(
    null,
    [schema.text("ABC"), formula],
  );
  const doc = document(paragraph2);
  const after3 = 1 + paragraph2.content.size;
  const after = EditorState.create({
    doc,
    selection: TextSelection.create(doc, after3),
  });
  equal(
    JSON.stringify(inlineMathBoundary(after)),
    JSON.stringify({ position: after3 - formula.nodeSize, side: "after" }),
    "the boundary after the closing `$` was not recognized",
  );
  const before3 = after3 - formula.nodeSize;
  const before = EditorState.create({
    doc,
    selection: TextSelection.create(doc, before3),
  });
  equal(
    JSON.stringify(inlineMathBoundary(before)),
    JSON.stringify({ position: before3, side: "before" }),
    "the boundary before the opening `$` was not recognized",
  );
});

testCase("the plugin uses a view overlay and registers no ProseMirror decorations", () => {
  const plugin = blinkingCaretPlugin();
  assertValue(typeof plugin.spec.view === "function", "the plugin has no view");
  equal(plugin.spec.props?.decorations, undefined, "input-blocking decorations were registered again");
});

console.log("\n[Caret styles]");

const css = readFileSync(`${process.cwd()}/src/styles/editor.css`, "utf8");
const assemble = readFileSync(`${process.cwd()}/src/editor/assemble.ts`, "utf8");
const blinkSource = readFileSync(`${process.cwd()}/src/editor/blink-caret.ts`, "utf8");

testCase("the native caret is hidden and the overlay follows the accent color", () => {
  assertValue(css.includes("caret-color: transparent"), "the native caret is not hidden");
  assertValue(css.includes("background: var(--accent)"), "the caret does not follow the theme accent");
  assertValue(css.includes(".nota-blink-caret-dim"), "the low-power blink state is missing");
  assertValue(blinkSource.includes("setInterval"), "the low-frequency blink timer is missing");
});

testCase("the overlay stays outside the body DOM and follows focus and selection", () => {
  const source = readFileSync(`${process.cwd()}/src/editor/blink-caret.ts`, "utf8");
  assertValue(css.includes("position: fixed"), "the overlay is not fixed-positioned");
  assertValue(css.includes("display: none"), "the overlay is not hidden by default");
  assertValue(source.includes("view.hasFocus()"), "editor focus is not checked");
  assertValue(source.includes("view.dom.parentElement"), "the overlay is not mounted outside the body DOM");
  assertValue(!source.includes("Decoration.widget("), "ProseMirror widgets are still used");
  assertValue(!source.includes("decorations("), "ProseMirror decorations are still registered");
});

testCase("IME composition restores the native caret and pauses the overlay", () => {
  assertValue(
    blinkSource.includes('const imeComposingClass = "nota-ime-composing"'),
    "the IME composition marker is missing",
  );
  assertValue(
    blinkSource.includes('addEventListener("compositionstart", beginComposition)'),
    "compositionstart does not restore the native caret",
  );
  assertValue(
    blinkSource.includes('addEventListener("compositionupdate", beginComposition)'),
    "compositionupdate does not preserve the IME caret state",
  );
  assertValue(
    blinkSource.includes('addEventListener("compositionend", endComposition)'),
    "compositionend does not restore the overlay caret",
  );
  assertValue(
    blinkSource.includes("view.dom.classList.contains(imeComposingClass)"),
    "later refreshes can redraw the overlay during composition",
  );
  assertValue(
    blinkSource.includes("view.composing && attempts < 5"),
    "compositionend does not wait for ProseMirror to receive the committed text",
  );
  assertValue(
    css.includes(".ProseMirror.nota-ime-composing *") &&
      css.includes("caret-color: var(--accent) !important"),
    "IME composition does not restore a movable native caret",
  );
});

testCase("the body overlay hides while inner editors draw their own caret", () => {
  assertValue(
    blinkSource.includes("export function innerEditorOwnsCaret"),
    "inner-editor focus is not recognized",
  );
  assertValue(
    blinkSource.includes("textCaretOwner(active)") &&
      readFileSync(
        `${process.cwd()}/src/editor/caret-ownership.ts`,
        "utf8",
      ).includes('".nota-keyboard-link-source"'),
    "inputs and CodeMirror are not part of the shared inner-caret predicate",
  );
  assertValue(
    blinkSource.includes("innerEditorOwnsCaret(active, view.dom)"),
    "inner-editor focus is not checked before drawing the body caret",
  );
  assertValue(
    blinkSource.includes("nota-inline-math-input-focused"),
    "the body overlay is not explicitly hidden while the formula source is focused",
  );
});

testCase("reduced motion keeps the caret statically visible", () => {
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assertValue(reduced.includes("opacity: 1"), "the caret is not kept fully visible");
  assertValue(reduced.includes("opacity: 1"), "the static caret is invisible");
});

testCase("only editable instances mount the blinking-caret plugin", () => {
  assertValue(
    assemble.includes(".use(readOnly ? [] : [$prose(() => blinkingCaretPlugin())])"),
    "the plugin is not wired",
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
