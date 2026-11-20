import { readFileSync } from "node:fs";

import { contextRuns, diffMarker } from "@/ui/PanelDiffBlock";
import type { PanelDiffLine } from "@/ui/panel-nodes";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const source = readFileSync("src/ui/PanelDiffBlock.tsx", "utf8");
const panelBody = readFileSync("src/ui/PanelBody.tsx", "utf8");
const css = readFileSync("src/styles/diff.css", "utf8");
const panelCss = readFileSync("src/styles/panel.css", "utf8");

console.log("\n[Diff view]");

testCase("all diff operations have stable markers", () => {
  assert(diffMarker.add === "+", "add marker is wrong");
  assert(diffMarker.del === "-", "delete marker is wrong");
  assert(diffMarker.ctx === " ", "context marker is wrong");
  assert(diffMarker.hunk === "", "hunk marker is wrong");
  assert(diffMarker.meta === "", "metadata marker is wrong");
});

testCase("context runs are grouped only across adjacent context rows", () => {
  const lines: PanelDiffLine[] = [
    { op: "hunk", text: "@@ -1 +1 @@" },
    { op: "ctx", text: "a" },
    { op: "ctx", text: "b" },
    { op: "del", text: "c" },
    { op: "ctx", text: "d" },
  ];
  const runs = contextRuns(lines);
  assert(runs.length === 2, "context runs were not split correctly");
  assert(runs[0]?.start === 1 && runs[0].lines.length === 2, "first run is wrong");
  assert(runs[1]?.start === 4 && runs[1].lines.length === 1, "second run is wrong");
});

testCase("large context runs expose a collapse control", () => {
  const lines: PanelDiffLine[] = Array.from({ length: 8 }, (_, index) => ({
    op: "ctx",
    text: `line ${index}`,
  }));
  assert(contextRuns(lines)[0]?.lines.length === 8, "context run is wrong");
  assert(source.includes("run.lines.length > collapseThreshold"), "collapse threshold is not applied");
  assert(source.includes('className="diff-context-toggle"'), "context toggle is missing");
});

testCase("panel body delegates diff rendering to the dedicated block", () => {
  assert(panelBody.includes("<PanelDiffBlock"), "PanelBody does not use PanelDiffBlock");
  assert(!panelBody.includes("DIFF_MARK"), "legacy inline diff marker remains");
});

testCase("diff rows have marker, text and operation styling hooks", () => {
  assert(source.includes('className="diff-marker"'), "marker class is missing");
  assert(source.includes('className="diff-text"'), "text class is missing");
  assert(source.includes("data-diff-op={line.op}"), "operation attribute is missing");
  for (const op of ["add", "del", "ctx", "hunk", "meta"]) {
    assert(css.includes(`.diff-${op}`), `${op} styling is missing`);
  }
  assert(css.includes("white-space: pre"), "long lines do not preserve whitespace");
  assert(panelCss.includes("overflow-x: auto"), "horizontal scrolling is missing");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
