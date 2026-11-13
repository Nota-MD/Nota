import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { history, undo } from "@milkdown/kit/prose/history";

import {
  backspaceInlineDelimiter,
  createMarkHintPlugin,
  findActiveMarkRange,
  inputInlineDelimiter,
  insertPlainInlineText,
} from "../src/editor/mark-hint";
import {
  emptyInlinePairEdit,
  shouldStartInlinePair,
  shouldStepOverInlinePair,
} from "../src/editor/inline-edit";
import {
  normalizeInlineBlock,
  serializeInlineBlock,
} from "../src/editor/mark-hint-source";

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
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
const markMap = schema.marks as Record<string, typeof strong | undefined>;

function literal(text: string, caret = 1): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, caret),
  });
}

function marked(content: string, mark = strong): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(content, [mark.create()])]),
  ]);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, content.length + 1),
    plugins: [history()],
  });
}

function sourceOf(state: EditorState): string {
  const snapshot = serializeInlineBlock(state.doc.firstChild!, syntax, markMap);
  if (!snapshot) throw new Error("inline source could not be serialized");
  return snapshot.source;
}

function semanticSpans(state: EditorState): Array<{ text: string; strong: boolean }> {
  const spans: Array<{ text: string; strong: boolean }> = [];
  state.doc.firstChild?.forEach((child) => {
    const text4 = child.isText ? child.text ?? "" : "";
    if (!text4) return;
    const isStrong = child.isText && strong.isInSet(child.marks) !== undefined;
    const previous = spans.at(-1);
    if (previous && previous.strong === isStrong) previous.text += text4;
    else spans.push({ text: text4, strong: isStrong });
  });
  return spans;
}

console.log("\n【行内编辑：语义与视觉分层】");

testCase("完整粗体分隔符归一为 mark，并生成可停留的字符标记", () => {
  const state = literal("**first**");
  const tr = normalizeInlineBlock(state, syntax);
  assertion(tr, "complete bold delimiters were not normalized");
  const next = state.apply(tr);
  equal(next.doc.firstChild?.textContent, "first", "visible semantic text");
  let hasStrong = false;
  let atoms = 0;
  next.doc.descendants((node) => {
    if (node.type === syntax) atoms++;
    if (node.isText && node.text === "first" && strong.isInSet(node.marks)) hasStrong = true;
  });
  equal(hasStrong, true, "content carries strong mark");
  equal(atoms, 4, "expected two opening and two closing marker characters");
});

testCase("尚未闭合的定界符保持普通文本", () => {
  const state = literal("**first");
  const tr = normalizeInlineBlock(state, syntax);
  equal(tr, null, "incomplete construct was promoted early");
  equal(sourceOf(state), "**first", "literal source changed");
});

testCase("已有粗体段落反序列化仍得到完整源码", () => {
  const state = marked("first");
  equal(
    serializeInlineBlock(state.doc.firstChild!, syntax, markMap)?.source,
    "**first**",
    "semantic mark did not serialize to source delimiters",
  );
});

testCase("实时输入与 Typedown 的最近强闭符解析保持一致", () => {
  const source = "Based on **Tauri 2*. Approach **Typora** spiritually.";
  const state = literal(source, source.indexOf("Typora") + 1);
  const tr = normalizeInlineBlock(state, syntax);
  assertion(tr, "the exact sentence was not normalized");
  const next = state.apply(tr);
  const joined = semanticSpans(next)
    .map((span) => `${span.strong ? "strong" : "text"}:${span.text}`)
    .join("|");
  equal(
    joined,
    "text:Based on |strong:Tauri 2*. Approach |text:Typora** spiritually.",
    "live parsing diverged from Typedown nearest-strong rules",
  );
});

testCase("删除一个定界符后按剩余源码的 Typedown 结构重解析", () => {
  const source = "Based on **Tauri 2*. Approach **Typora** spiritually.";
  const state = literal(source, source.indexOf("Typora") + 1);
  const normalized = normalizeInlineBlock(state, syntax);
  assertion(normalized, "the exact sentence was not normalized");
  const editing = state.apply(normalized);
  const active = findActiveMarkRange(
    editing.doc,
    editing.selection.from,
    strong,
    syntax,
  );
  assertion(active?.leftMarker, "the active strong opener is missing");
  const insideOpener = editing.tr.setSelection(
    TextSelection.create(editing.doc, active.leftMarker.from + 1),
  );
  const withCaret = editing.apply(insideOpener);
  const removed = backspaceInlineDelimiter(withCaret, syntax);
  assertion(removed, "deleting one opener star produced no rewrite");
  const next = withCaret.apply(removed);
  const snapshot = serializeInlineBlock(next.doc.firstChild!, syntax, markMap);
  assertion(snapshot, "the edited paragraph could not be serialized");
  equal(
    snapshot.source,
    "Based on *Tauri 2*. Approach **Typora** spiritually.",
    "remaining emphasis and strong runs were not canonicalized from source",
  );
  let marked = false;
  next.doc.firstChild?.forEach((node) => {
    if (node.isText && node.marks.length > 0) marked = true;
  });
  equal(marked, true, "remaining valid emphasis and strong runs must stay formatted");
});

testCase("退格留下星号时不得原子化或自动添加反斜杠", () => {
  const state = literal("**Typora**", 3);
  const normalized = normalizeInlineBlock(state, syntax);
  assertion(normalized, "complete bold source was not normalized");
  const editing = state.apply(normalized);
  const removed = backspaceInlineDelimiter(editing, syntax);
  assertion(removed, "Backspace at the opening delimiter produced no rewrite");
  const next = editing.apply(removed);
  const snapshot = serializeInlineBlock(next.doc.firstChild!, syntax, markMap);
  assertion(snapshot, "the edited paragraph could not be serialized");
  equal(snapshot.source.includes("\\"), false, "the remaining source gained a backslash");
  let text = "";
  next.doc.firstChild?.forEach((node) => {
    if (node.isText) text += node.text ?? "";
  });
  equal(text.includes("Typora"), true, "remaining text must stay ordinary text");
});

testCase("在粗体正文里删除普通星号，插件会把剩余源码继续归一为粗体", () => {
  const source = "**Tauri 2*. Approach **Typora** spiritually.";
  const innerStar = source.indexOf("*. Approach") + 1;
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(source)]),
  ]);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, innerStar + 1),
    plugins: [createMarkHintPlugin(syntax)],
  });
  const next = state.apply(state.tr.delete(innerStar, innerStar + 1));
  equal(
    semanticSpans(next)
      .map((span) => `${span.strong ? "strong" : "text"}:${span.text}`)
      .join("|"),
    "text:**Tauri 2. Approach |strong:Typora|text: spiritually.",
    "ordinary source deletion did not follow the remaining GFM structure",
  );
});

testCase("在粗体内容末端退格不删除整组闭合定界符", () => {
  const state = marked("first");
  const tr = backspaceInlineDelimiter(state, syntax);
  equal(tr, null, "content-boundary Backspace must be left to normal text deletion");
  equal(
    serializeInlineBlock(state.doc.firstChild!, syntax, markMap)?.source,
    "**first**",
    "mark delimiters changed before normal Backspace",
  );
});

testCase("高亮右边界输入的新字符留在闭合等号之外", () => {
  const state = marked("1", highlight);
  const tr = inputInlineDelimiter(
    state,
    syntax,
    state.selection.from,
    state.selection.to,
    "~",
  );
  assertion(tr, "typing after a closed highlight did not rewrite");
  const next = state.apply(tr);
  equal(
    serializeInlineBlock(next.doc.firstChild!, syntax, markMap)?.source,
    "==1==~",
    "typed character entered the closing delimiter",
  );
});

testCase("撤销输入的定界符不会恢复任何临时语法节点", () => {
  const state = marked("1", highlight);
  const typed = inputInlineDelimiter(
    state,
    syntax,
    state.selection.from,
    state.selection.to,
    "~",
  );
  assertion(typed, "typing did not produce a transaction");
  const afterTyping = state.apply(typed);
  let undone: EditorState | null = null;
  assertion(
    undo(afterTyping, (tr) => {
      undone = afterTyping.apply(tr);
    }),
    "undo was unavailable",
  );
  assertion(undone, "undo produced no state");
  const restored = undone as EditorState;
  equal(restored.doc.firstChild?.textContent, "1", "undo did not remove typed character");
  let atoms = 0;
  restored.doc.descendants((node) => {
    if (node.type === syntax) atoms++;
  });
  equal(atoms, 0, "undo restored stale marker atoms");
});

console.log("\n【Typedown 式定界符输入】");

testCase("行首、空白、标点与中文后开启定界符配对", () => {
  for (const before of ["", " ", "，", "中文"]) {
    equal(
      shouldStartInlinePair(before, "*"),
      true,
      `pair after ${JSON.stringify(before)}`,
    );
  }
});

testCase("字母、数字与反斜杠后的星号保持字面", () => {
  for (const before of ["a", "2", "\\"]) {
    equal(
      shouldStartInlinePair(before, "*"),
      false,
      `literal after ${JSON.stringify(before)}`,
    );
  }
});

testCase("行内代码与公式扩展不自动补定界符", () => {
  equal(shouldStartInlinePair("", "*", true), false, "verbatim context");
});

testCase("反引号保持字面输入，不自动创建行内代码配对", () => {
  for (const before of ["", " ", "中文", "a"]) {
    equal(
      shouldStartInlinePair(before, "`"),
      false,
      `backtick should stay literal after ${JSON.stringify(before)}`,
    );
  }
});

testCase("重复闭符按 Typedown 的窄条件跨过", () => {
  equal(shouldStepOverInlinePair("*x*", 2, "*"), true, "paired closing star");
  equal(shouldStepOverInlinePair("**", 1, "*"), false, "second opener star");
  equal(shouldStepOverInlinePair("$x$", 2, "$"), true, "paired dollar");
  equal(shouldStepOverInlinePair("`x`", 2, "`"), false, "paired backtick");
});

testCase("一个星号输入后光标停在自动补出的闭星号之前", () => {
  const state = literal("");
  const tr = inputInlineDelimiter(
    state,
    syntax,
    state.selection.from,
    state.selection.to,
    "*",
    undefined,
    false,
    true,
  );
  assertion(tr, "paired star input produced no transaction");
  const next = state.apply(tr);
  equal(sourceOf(next), "**", "paired source");
  equal(next.selection.from, 2, "caret between the paired stars");
});

testCase("自动补全关闭时只插入用户按下的那颗星", () => {
  const state = literal("");
  const tr = inputInlineDelimiter(
    state,
    syntax,
    state.selection.from,
    state.selection.to,
    "*",
    undefined,
    false,
    false,
  );
  assertion(tr, "literal star input produced no transaction");
  const next = state.apply(tr);
  equal(sourceOf(next), "*", "literal source");
  equal(next.selection.from, 2, "caret after the typed star");
});

testCase("第二个星号补齐强标记的开启组而不是停在斜体", () => {
  let state = literal("");
  const first = inputInlineDelimiter(
    state,
    syntax,
    state.selection.from,
    state.selection.to,
    "*",
    undefined,
    false,
    true,
  );
  assertion(first, "first star produced no transaction");
  state = state.apply(first);
  const second = inputInlineDelimiter(
    state,
    syntax,
    state.selection.from,
    state.selection.to,
    "*",
    undefined,
    false,
    true,
  );
  assertion(second, "second star produced no transaction");
  state = state.apply(second);
  equal(sourceOf(state), "****", "second star source");
  equal(state.selection.from, 3, "caret inside the two-character opening run");
});

testCase("自动补出的闭星号被敲到时只跨过，不重复增加源码", () => {
  const source = literal("*x*", 3);
  const normalized = normalizeInlineBlock(source, syntax);
  assertion(normalized, "literal italic source did not normalize");
  let state = source.apply(normalized);
  const before = serializeInlineBlock(state.doc.firstChild!, syntax, markMap);
  assertion(before, "italic source did not serialize");
  const tr = inputInlineDelimiter(
    state,
    syntax,
    state.selection.from,
    state.selection.to,
    "*",
    undefined,
    false,
    true,
  );
  assertion(tr, "closing star produced no transaction");
  state = state.apply(tr);
  const after = serializeInlineBlock(state.doc.firstChild!, syntax, markMap);
  assertion(after, "stepped source did not serialize");
  equal(after.source, "*x*", "closing star duplicated the source");
  equal(state.selection.from, 4, "caret did not step to the outside of the mark");
});

testCase("输入反斜杠不会把两侧美元原子化，公式输入规则仍能解析", () => {
  const state = literal("$$", 2);
  const tr = insertPlainInlineText(
    state,
    state.selection.from,
    state.selection.to,
    "\\",
  );
  const next = state.apply(tr);
  equal(next.doc.firstChild?.textContent, "$\\$", "backslash source");
  let foreignAtoms = 0;
  next.doc.descendants((node) => {
    if (node.type === syntax) foreignAtoms++;
  });
  equal(foreignAtoms, 0, "dollar delimiters became opaque atoms");
  equal(next.selection.from, 3, "caret did not stay inside the dollar pair");
});

testCase("空 Markdown 对在一次退格或 Delete 中整对消失", () => {
  equal(
    JSON.stringify(emptyInlinePairEdit("**", 1, "backward")),
    JSON.stringify({ from: 0, to2: 2, caret: 0 }),
    "Backspace pair",
  );
  equal(
    JSON.stringify(emptyInlinePairEdit("$$", 0, "forward")),
    JSON.stringify({ from: 0, to2: 2, caret: 0 }),
    "Delete pair",
  );
  equal(emptyInlinePairEdit("``", 1, "backward"), null, "backtick pair");
  equal(emptyInlinePairEdit("**", 2, "backward"), null, "ordinary source");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
