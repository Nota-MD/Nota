import { insertBackslashAtSelection } from "../src/editor/math-inline-events";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function staleWebKitInput(value: string, start: number, end = start) {
  let current = value;
  let caretStart = start;
  let caretEnd = end;
  return {
    get value() {
      return current;
    },
    get selectionStart() {
      return caretStart;
    },
    get selectionEnd() {
      return caretEnd;
    },
    setRangeText(replacement: string, from: number, to: number): void {
      current = current.slice(0, from) + replacement + current.slice(to);
      // Deliberately leave selection stale, matching the WebKitGTK failure.
    },
    setSelectionRange(from: number, to: number): void {
      caretStart = from;
      caretEnd = to;
    },
  };
}

console.log("\n[Inline math source events]");

testCase("backslash caret does not trust a stale WebKit selectionStart", () => {
  const input = staleWebKitInput("", 0);
  const cursor = insertBackslashAtSelection(input);
  equal(input.value, "\\", "source");
  equal(cursor, 1, "returned caret");
  equal(input.selectionStart, 1, "explicit caret");
  equal(input.selectionEnd, 1, "explicit selection end");
});

testCase("backslash replaces a selected source span", () => {
  const input = staleWebKitInput("abcd", 1, 3);
  const cursor = insertBackslashAtSelection(input);
  equal(input.value, "a\\d", "source");
  equal(cursor, 2, "returned caret");
  equal(input.selectionStart, 2, "caret after inserted slash");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
