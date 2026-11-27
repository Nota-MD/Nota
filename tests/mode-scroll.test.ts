/** Mode changes restore the position just left, not the position from document load. */

import { readFileSync } from "node:fs";
import { readElementScrollRatio } from "../src/editor/scroll-into-view";

const source = readFileSync("src/ui/EditorPane.tsx", "utf8");
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

if (failure > 0) process.exit(1);
console.log(`\n${passed} passed, 0 failed`);
