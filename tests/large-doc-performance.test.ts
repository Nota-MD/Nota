import { readFileSync } from "node:fs";

import {
  featurePauseThreshold,
  shouldHydrateNearViewport,
  shouldPauseOptionalFeatures,
  viewportHydrationThreshold,
} from "../src/editor/large-doc";

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

console.log("\n[Large document performance]");

testCase("viewport hydration starts only for genuinely large documents", () => {
  assert(
    !shouldHydrateNearViewport(viewportHydrationThreshold),
    "the threshold itself must stay on the eager path",
  );
  assert(
    shouldHydrateNearViewport(viewportHydrationThreshold + 1),
    "the first node above the threshold must use viewport hydration",
  );
});

testCase("optional feature suspension has a separate, much larger threshold", () => {
  assert(
    featurePauseThreshold > viewportHydrationThreshold,
    "optional features would be disabled before lightweight virtualization begins",
  );
  assert(
    !shouldPauseOptionalFeatures(featurePauseThreshold),
    "the suspension threshold itself must remain active",
  );
  assert(
    shouldPauseOptionalFeatures(featurePauseThreshold + 1),
    "documents past the suspension threshold must be detected",
  );
});

testCase("math and diagrams share the near-viewport release contract", () => {
  const math = readFileSync("src/editor/math-view.ts", "utf8");
  const mathDeferred = readFileSync("src/editor/math-view-deferred.ts", "utf8");
  const diagram = readFileSync("src/editor/diagram-view.ts", "utf8");
  const visibility = readFileSync("src/editor/viewport-visibility.ts", "utf8");
  assert(math.includes("observeNearViewport"), "math has no viewport observer");
  assert(mathDeferred.includes("renderStatic"), "math has no rendered-only tier");
  assert(mathDeferred.includes("hydrateEditing"), "math has no editing tier");
  assert(
    mathDeferred.includes('dataset.notaMathMode = "virtual"'),
    "math has no virtual tier",
  );
  assert(
    diagram.includes("hydrateAroundViewport"),
    "diagrams are not hydrated when they approach the viewport",
  );
  assert(
    visibility.includes("preserveElementAnchor"),
    "viewport replacement has no scroll anchoring",
  );
});

testCase("large documents defer heading ids, syntax highlighting and code editors", () => {
  const headings = readFileSync("src/editor/heading-id.ts", "utf8");
  const prism = readFileSync("src/editor/lazy-prism.ts", "utf8");
  const code = readFileSync("src/editor/code-block.ts", "utf8");
  assert(
    headings.includes("headingSchemaWithIds"),
    "heading ids are not applied during parsing",
  );
  assert(
    headings.includes("headingIdsTouched"),
    "heading id updates are not scoped to heading changes",
  );
  assert(
    prism.includes("requestCodeBlockHighlight"),
    "syntax highlighting is not available on demand",
  );
  assert(
    prism.includes("shouldHydrateNearViewport"),
    "syntax highlighting eagerly scans large documents",
  );
  assert(
    prism.includes("step.getMap().forEach"),
    "syntax-highlight updates scan unmapped transaction coordinates",
  );
  const start = code.indexOf("const startHeavyContent");
  const end = code.indexOf("const requestFocus", start);
  assert(
    start >= 0 && end > start && !code.slice(start, end).includes("ensureCodeBlockEditor"),
    "near-viewport code blocks still create a full editor",
  );
});

testCase("the large-document benchmark uses the production editor", () => {
  const perf = readFileSync("e2e/perf.ts", "utf8");
  assert(perf.includes("createEditor"), "benchmark does not mount createEditor");
  assert(perf.includes("writingModes"), "benchmark cannot compare focus mode");
  assert(perf.includes("pluginMs"), "benchmark does not collect plugin timings");
  assert(perf.includes('params.get("size")'), "benchmark size is not configurable");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
