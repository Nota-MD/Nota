import { normalizeRect } from "../src/ui/useImeCursorBridge";

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

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

console.log("\n【IME cursor bridge】");

testCase("rounds a viewport caret rectangle to native pixels", () => {
  const rect = normalizeRect({
    left: 120.4,
    top: 240.6,
    width: 0,
    height: 19.2,
  });
  equal(rect?.x, 120, "x was not rounded");
  equal(rect?.y, 241, "y was not rounded");
  equal(rect?.width, 1, "zero-width caret did not retain a native anchor");
  equal(rect?.height, 19, "caret height was not rounded");
});

testCase("rejects a transient non-finite DOM rect", () => {
  equal(
    normalizeRect({ left: Number.NaN, top: 10, width: 1, height: 18 }),
    null,
    "an invalid rectangle reached the native bridge",
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
