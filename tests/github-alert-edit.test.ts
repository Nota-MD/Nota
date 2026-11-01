import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { readFileSync } from "node:fs";

import { githubAlertTransaction } from "../src/editor/github-alert-edit";
import { createGitHubAlertDecorations } from "../src/editor/github-alert";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    blockquote: { group: "block", content: "block+" },
    horizontal_rule: { group: "block" },
    bullet_list: { group: "block", content: "list_item+" },
    list_item: { content: "paragraph block*" },
  },
});

function paragraph(text = "") {
  return schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined);
}

function stateAt(doc: ReturnType<typeof schema.node>, position: number): EditorState {
  return EditorState.create({ doc, selection: TextSelection.create(doc, position) });
}

console.log("\n[GitHub Alert menu commands]");

testCase("a top-level empty paragraph becomes an Alert with the cursor in its body", () => {
  const doc = schema.node("doc", null, [paragraph()]);
  const before = stateAt(doc, 1);
  const tr = githubAlertTransaction(before, "note");
  assertValue(tr, "top-level empty paragraph did not produce a transaction");
  const next = before.apply(tr);
  assertValue(next.doc.firstChild?.type.name === "blockquote", "blockquote was not created");
  assertValue(next.doc.textContent.includes("[!NOTE]"), "Alert marker is missing");
  assertValue(next.selection.$from.parent.type.name === "paragraph", "cursor is not in the Alert body");
  assertValue(next.selection.$from.parent.textContent === "", "Alert body is not empty");

  const bodyDecorations = createGitHubAlertDecorations(next).find(0, next.doc.content.size);
  const bodyShell = bodyDecorations.find((item) => item.from === 0 && item.to === next.doc.firstChild!.nodeSize);
  assertValue(!!bodyShell, "Alert shell decoration missing");
  assertValue(!String(bodyShell.type.attrs.class).includes("editing-title"), "body cursor should show formatted title");

  const titleState = next.apply(next.tr.setSelection(TextSelection.create(next.doc, 2)));
  const titleDecorations = createGitHubAlertDecorations(titleState).find(0, titleState.doc.content.size);
  const editingShell = titleDecorations.find(
    (item) => item.from === 0 && item.to === titleState.doc.firstChild!.nodeSize,
  );
  assertValue(!!editingShell, "Alert shell disappears while editing the title");
  assertValue(
    String(editingShell.type.attrs.class).includes("nota-github-alert-editing-title"),
    "title source is not revealed while editing",
  );
  const marker = titleDecorations.find((item) =>
    String(item.type.attrs.class).includes("nota-github-alert-marker-note"),
  );
  assertValue(!!marker, "editable Alert marker decoration missing");
});

testCase("an Alert can be inserted from a paragraph nested in a list", () => {
  const item = schema.nodes.list_item!.create(null, paragraph("正文"));
  const list = schema.nodes.bullet_list!.create(null, item);
  const doc = schema.node("doc", null, [list]);
  let firstParagraph = -1;
  doc.descendants((node, position) => {
    if (node.type.name !== "paragraph") return true;
    firstParagraph = position + 1;
    return false;
  });
  assertValue(firstParagraph >= 0, "test document has no paragraph");
  const before = stateAt(doc, firstParagraph);
  assertValue(before.selection.$from.parent.type.name === "paragraph", "selection is not in a paragraph");
  const tr = githubAlertTransaction(before, "warning");
  assertValue(tr, "nested paragraph did not produce a transaction");
  const next = before.apply(tr);
  const itemAfter = next.doc.firstChild?.firstChild;
  assertValue(itemAfter?.type.name === "list_item", "list item disappeared");
  assertValue(
    itemAfter.lastChild?.type.name === "blockquote",
    `Alert was not inserted in the list item: ${JSON.stringify(next.doc.toJSON())}`,
  );
  assertValue(next.doc.textContent.includes("[!WARNING]"), "nested Alert marker is wrong");
});

testCase("a non-textblock context returns null instead of reporting false success", () => {
  const hr = schema.nodes.horizontal_rule!.create();
  const doc = schema.node("doc", null, [hr]);
  const state = EditorState.create({
    doc,
    selection: NodeSelection.create(doc, 0),
  });
  assertValue(githubAlertTransaction(state, "tip") === null, "invalid selection produced a transaction");
});

testCase("editing an Alert marker stays plain source text like Typora", () => {
  const css = readFileSync("src/styles/github-alert.css", "utf8");
  const block =
    /\.nota-github-alert-editing-title \.nota-github-alert-marker\s*\{([^}]*)\}/s.exec(css)?.[1] ?? "";
  assertValue(/padding:\s*0;/.test(block), "Alert marker still repeats horizontal padding around the caret");
  assertValue(
    /box-decoration-break:\s*slice;/.test(block) &&
      /-webkit-box-decoration-break:\s*slice;/.test(block),
    "Alert marker fragments are still decorated independently",
  );
  assertValue(/background:\s*transparent;/.test(block), "editing marker still draws a filled chip");
  assertValue(/box-shadow:\s*none;/.test(block), "editing marker still draws a box");
  assertValue(/border-radius:\s*0;/.test(block), "editing marker still draws a rounded chip");
  const shell = /\.nota-github-alert\s*\{([^}]*)\}/s.exec(css)?.[1] ?? "";
  assertValue(/background:\s*transparent;/.test(shell), "Alert still paints a nested card");
  assertValue(/border:\s*0;/.test(shell), "Alert still paints a full outer border");
  assertValue(
    /border-left:\s*4px solid var\(--github-alert-color\);/.test(shell),
    "Alert no longer uses the semantic Typora-style left rule",
  );
});

console.log(`\nPassed ${pass}; failed ${fail}`);
if (fail > 0) process.exitCode = 1;
