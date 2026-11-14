import { readFileSync } from "node:fs";

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

const source = readFileSync(`${process.cwd()}/src/editor/ime-guard.ts`, "utf8");
const assemble = readFileSync(`${process.cwd()}/src/editor/assemble.ts`, "utf8");

console.log("\n【IME composition guard】");

testCase("restores a textblock pruned by deleteCompositionText", () => {
  if (!source.includes('"deleteCompositionText"')) {
    throw new Error("the WebKit delete phase is not guarded");
  }
  if (!source.includes("restorePrunedComposition(view, links)")) {
    throw new Error("the pruned composition ancestors are not restored");
  }
});

testCase("clears only the stale WebKit post-composition Enter timestamp", () => {
  if (!source.includes("compositionEndedAt = -2e8")) {
    throw new Error("the stale Enter timestamp is not cleared");
  }
  if (!source.includes("event.keyCode === 229")) {
    throw new Error("consumed IME keys are not excluded");
  }
});

testCase("installs both guards only for editable editors", () => {
  if (
    !assemble.includes(
      ".use(readOnly ? [] : [compositionPruneGuard, linuxImeEnterGuard])",
    )
  ) {
    throw new Error("IME guards are missing from the editable editor");
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
