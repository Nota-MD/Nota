import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { history, undo } from "@milkdown/kit/prose/history";
import {
  backspaceInlineDelimiter,
  createMarkHintPlugin,
  inputInlineDelimiter,
  inlineCompositionAnchor,
  listSyntaxMarkers,
  markHintRefresh,
  relocateComposedText,
} from "../src/editor/mark-hint";
import { serializeInlineBlock } from "../src/editor/mark-hint-source";

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

function assertion(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const schema = new Schema({
  nodes: {
    text: { group: "inline" },
    paragraph: { group: "block", content: "inline*" },
    notaSyntax: {
      inline: true,
      group: "inline",
      atom: true,
      marks: "",
      attrs: {
        syntax: { default: "" },
        side: { default: "left" },
        symbol: { default: "*" },
      },
    },
    doc: { content: "block+" },
  },
  marks: {
    strong: {},
    emphasis: {},
    highlight: {},
  },
});

const strong = schema.marks.strong!;
const highlight = schema.marks.highlight!;
const syntax = schema.nodes.notaSyntax!;

console.log("\n【行内编辑整段重解析】");

testCase("右闭标记退格后整段按新源码重新判定，而不是局部降级", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("Based on "),
      schema.text("Tauri 2*. Approach ", [strong.create()]),
      schema.text("Typora** spiritually."),
    ]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 9 + "Tauri 2*. Approach ".length),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 9 + "Tauri 2*. Approach ".length)),
  );

  const right = listSyntaxMarkers(state.doc, syntax).find((marker) => marker.side === "right");
  assertion(right, "active strong must expose a closing marker");
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, right.to2)));
  const tr = backspaceInlineDelimiter(state, syntax);
  assertion(tr, "backspace at a closing marker must rewrite the paragraph");
  state = state.apply(tr);

  equal(
    state.doc.firstChild?.textContent,
    "Based on Tauri 2*. Approach *Typora spiritually.",
    "visible text",
  );
  equal(
    state.doc.firstChild?.textContent?.includes("\\"),
    false,
    "visible text must not gain backslash escapes",
  );
});

testCase("第三个星号输入后整段恢复为强标记", () => {
  const source = "**1*";
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(source)]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, source.length + 1),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.insertText("*", source.length + 1));
  equal(state.doc.firstChild?.textContent, "1", "visible text");
  let bold = false;
  state.doc.firstChild?.forEach((node) => {
    if (node.isText && node.text === "1" && strong.isInSet(node.marks)) bold = true;
  });
  assertion(bold, "the completed sequence must be strong");
});

testCase("在内层星号前再输入星号时光标留在该边界，不跳到行尾", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("Based on "),
      schema.text("Tauri 2*. Approach ", [strong.create()]),
      schema.text("Typora** spiritually."),
    ]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1 + "Based on Tauri 2".length),
    plugins: [createMarkHintPlugin(syntax)],
  });
  const insertAt = 1 + "Based on Tauri 2".length;
  state = state.apply(state.tr.insertText("*", insertAt));
  const end = state.doc.firstChild!.nodeSize - 1;
  if (state.selection.from >= end) {
    throw new Error(`caret jumped to paragraph end: ${state.selection.from} / ${end}`);
  }
});

testCase("补齐最后一个星号后，活动强标记仍显示完整两组星号", () => {
  const source = "**Typora*";
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(source)]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, source.length + 1),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.insertText("*", source.length + 1));
  const markers = listSyntaxMarkers(state.doc, syntax);
  assertion(markers.some((marker) => marker.side === "left"), "missing opening **");
  assertion(markers.some((marker) => marker.side === "right"), "missing closing **");
});

testCase("输入法组字事务不重写当前段落", () => {
  const source = "==1";
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(source)]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, source.length + 1),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(
    state.tr
      .insertText("==", state.selection.from)
      .setMeta("composition", 1),
  );

  equal(state.doc.firstChild?.textContent, "==1==", "composition text stays literal");
  equal(listSyntaxMarkers(state.doc, syntax).length, 0, "composition must not insert marker atoms");
  equal(
    state.doc.firstChild?.child(0)?.marks.length,
    0,
    "composition must not promote a mark before commit",
  );

  state = state.apply(state.tr.setMeta(markHintRefresh, true));
  equal(state.doc.firstChild?.textContent, "1", "post-composition cleanup promotes the pair");
  let highlighted = false;
  state.doc.firstChild?.forEach((node) => {
    if (node.isText && node.text === "1") {
      highlighted = highlight.isInSet(node.marks) !== undefined;
    }
  });
  equal(highlighted, true, "only the delimited text is highlighted");
});

testCase("中文上屏误落进闭合标记内侧时移回外侧", () => {
  const rightA = syntax.create({ syntax: "highlight", side: "right", symbol: "=" });
  const rightB = syntax.create({ syntax: "highlight", side: "right", symbol: "=" });
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("1", [highlight.create()]),
      rightA,
      rightB,
    ]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, doc.content.size - 1),
    plugins: [createMarkHintPlugin(syntax)],
  });
  const anchor = inlineCompositionAnchor(state, syntax);
  assertion(anchor, "caret after the closing `==` must produce an IME anchor");
  equal(anchor.side, "after", "composition starts outside the mark");

  // WebKit's DOM normalization can put the committed text at the inner edge:
  // `1` + `中` both carry highlight, and the closing `==` follows them.
  const wrong = state.tr
    .setStoredMarks([highlight.create()])
    .insertText("中", 2, 2)
    .setMeta("composition", 2);
  wrong.setSelection(TextSelection.create(wrong.doc, 3));
  state = state.apply(wrong);
  equal(state.doc.firstChild?.textContent, "1中", "test setup must place the composition inside the mark");

  const fixed = relocateComposedText(state, anchor, "中", syntax);
  assertion(fixed, "misattributed IME text must be relocated");
  state = state.apply(fixed);

  equal(state.doc.firstChild?.textContent, "1中", "visible text");
  const children: Array<{ text: string; highlighted: boolean }> = [];
  state.doc.firstChild?.forEach((node) => {
    if (node.isText && node.text) {
      children.push({
        text: node.text,
        highlighted: highlight.isInSet(node.marks) !== undefined,
      });
    }
  });
  equal(children.map((child) => child.text).join(""), "1中", "no text lost");
  equal(children[0]?.highlighted, true, "original 1 stays highlighted");
  equal(children[1]?.highlighted, false, "new IME text stays outside the highlight");
  equal(state.selection.empty, true, "caret remains collapsed");
});

testCase("中文上屏正确落在外侧时不会继承前一段标记", () => {
  const rightA = syntax.create({ syntax: "highlight", side: "right", symbol: "=" });
  const rightB = syntax.create({ syntax: "highlight", side: "right", symbol: "=" });
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("1", [highlight.create()]),
      rightA,
      rightB,
    ]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, doc.content.size - 1),
    plugins: [createMarkHintPlugin(syntax)],
  });
  const anchor = inlineCompositionAnchor(state, syntax);
  assertion(anchor, "caret after the closing `==` must produce an IME anchor");
  const caret = state.selection.from;
  const tr = state.tr.insertText("中", caret);
  tr.setSelection(TextSelection.create(tr.doc, caret + 1));
  tr.setMeta("composition", 3);
  state = state.apply(tr);

  equal(state.doc.firstChild?.textContent, "1中", "visible text");
  let composingTextHighlighted = false;
  state.doc.firstChild?.forEach((node) => {
    if (node.isText && node.text === "中") {
      composingTextHighlighted = highlight.isInSet(node.marks) !== undefined;
    }
  });
  equal(composingTextHighlighted, false, "the new IME text is outside highlight");
  equal(relocateComposedText(state, anchor, "中", syntax), null, "correctly placed text is left alone");
});

testCase("在活动标记后输入再撤销，不恢复重复的临时标记", () => {
  const leftA = syntax.create({ syntax: "highlight", side: "left", symbol: "=" });
  const leftB = syntax.create({ syntax: "highlight", side: "left", symbol: "=" });
  const rightA = syntax.create({ syntax: "highlight", side: "right", symbol: "=" });
  const rightB = syntax.create({ syntax: "highlight", side: "right", symbol: "=" });
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      leftA,
      leftB,
      schema.text("1", [highlight.create()]),
      rightA,
      rightB,
    ]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, doc.content.size - 1),
    plugins: [history(), createMarkHintPlugin(syntax)],
  });
  const typed = inputInlineDelimiter(
    state,
    syntax,
    state.selection.from,
    state.selection.to,
    "~",
  );
  assertion(typed, "typing a delimiter after a mark must rewrite the inline block");
  state = state.apply(typed);

  equal(state.doc.firstChild?.textContent, "1~", "typed text");
  equal(
    serializeInlineBlock(
      state.doc.firstChild!,
      syntax,
      schema.marks as Record<string, typeof highlight | undefined>,
    )?.source,
    "==1==~",
    "the delimiter typed after a closed mark must stay outside its closing delimiter",
  );
  equal(listSyntaxMarkers(state.doc, syntax).length, 0, "markers close after the caret moves outside");
  let undone: EditorState | null = null;
  assertion(
    undo(state, (tr) => {
      undone = state.apply(tr);
    }),
    "undo command must be available",
  );
  assertion(undone, "undo did not dispatch");
  const restored = undone as EditorState;
  equal(restored.doc.firstChild?.textContent, "1", "undo removes only the typed character");

  let highlighted = false;
  let syntaxAtoms = 0;
  restored.doc.descendants((node) => {
    if (node.type === syntax) syntaxAtoms++;
    if (node.isText && node.text === "1") {
      highlighted = highlight.isInSet(node.marks) !== undefined;
    }
  });
  equal(highlighted, true, "original highlight survives undo");
  equal(syntaxAtoms, 4, "undo must not duplicate visible delimiters");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
