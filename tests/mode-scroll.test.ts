/** Mode changes restore the position just left, not the position from document load. */

import { readFileSync } from "node:fs";
import { readElementScrollRatio } from "../src/editor/scroll-into-view";
import { typewriterPaddingForViewport } from "../src/editor/writing-modes";

const source = readFileSync("src/ui/EditorPane.tsx", "utf8");
const writingModes = readFileSync("src/editor/writing-modes.ts", "utf8");
const sourceEditor = readFileSync("src/editor/source.ts", "utf8");
const editorCss = readFileSync("src/styles/editor.css", "utf8");
let passed = 0;
let failure = 0;

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    passed += 1;
    console.log(`  ✔ ${name3}`);
  } catch (error) {
    failure += 1;
    console.log(`  ✘ ${name3}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

console.log("\n[Mode-change scroll position]");

testCase("the old instance records its scroll ratio before disposal", () => {
  assertValue(
    source.includes("const splitReplaceBeforeRatio = readScrollRatio(mount)"),
    "cleanup does not read the current scroll ratio",
  );
  assertValue(
    source.includes("splitReplaceScrollRatioRef.current = splitReplaceBeforeRatio"),
    "the current ratio is not saved for the next instance",
  );
});

testCase("the new instance prefers the mode-change ratio over the session ratio", () => {
  assertValue(
    source.includes("splitReplaceScrollRatioRef.current ?? initialScrollRatioRef.current"),
    "mode-change position does not take priority over the session position",
  );
});

testCase("the restore plan is consumed once", () => {
  assertValue(
    source.includes("splitReplaceScrollRatioRef.current = null"),
    "the mode-change position is not cleared after handoff",
  );
});

testCase("scroll ratios read the event target and coalesce per animation frame", () => {
  assertValue(readElementScrollRatio({ scrollHeight: 200, clientHeight: 100, scrollTop: 50 }) === 0.5, "incorrect scroll ratio");
  assertValue(readElementScrollRatio({ scrollHeight: 100, clientHeight: 100, scrollTop: 0 }) === 0, "short documents should return zero");
  assertValue(source.includes("requestAnimationFrame"), "scroll accounting is not coalesced per animation frame");
  assertValue(
    source.includes("readElementScrollRatio(currentContainer)"),
    "scroll accounting still repeatedly resolves its container",
  );
});

testCase("typewriter mode reserves enough space to center the first and last lines", () => {
  assertValue(
    typewriterPaddingForViewport(0) === 0,
    "an unmeasured viewport should not add padding",
  );
  assertValue(
    typewriterPaddingForViewport(621) === 311,
    "typewriter padding should be half of the measured editor viewport",
  );
  assertValue(
    source.includes('typewriterPaddingCssProperty, `${padding}px`'),
    "the pane does not publish its measured typewriter padding",
  );
  assertValue(
    editorCss.includes(".editor-pane.nota-typewriter .editor-mount:not(.editor-preview) .ProseMirror"),
    "WYSIWYG content is missing typewriter scroll padding",
  );
  assertValue(
    editorCss.includes(".editor-pane-source.nota-typewriter .editor-mount .cm-content"),
    "source mode is missing typewriter scroll padding",
  );
});

testCase("typewriter centering runs after native scroll handling", () => {
  assertValue(
    writingModes.includes("scheduleCurrentLineCenter"),
    "WYSIWYG centering has no deferred scheduler",
  );
  assertValue(
    writingModes.includes("requestAnimationFrame"),
    "WYSIWYG centering still runs before the browser settles scrolling",
  );
  assertValue(
    sourceEditor.includes("scheduleTypewriterCenter"),
    "source mode centering has no deferred scheduler",
  );
  assertValue(
    sourceEditor.includes("cancelAnimationFrame(typewriterFrame)"),
    "source mode centering schedules overlapping frames",
  );
});

if (failure > 0) process.exit(1);
console.log(`\n${passed} passed, 0 failed`);
