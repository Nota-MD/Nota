import { fitDiagramSize } from "../src/editor/diagram-size";
import { mermaidConfigurationKey } from "../src/editor/diagram-render";

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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function close(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 0.02, `${message}: expected ${expected}, got ${actual}`);
}

console.log("\n[Diagram sizing]");

testCase("small diagrams keep their natural size", () => {
  const size = fitDiagramSize(320, 180, 800, 600);
  close(size.width, 320, "width");
  close(size.height, 180, "height");
  close(size.scale, 1, "scale");
});

testCase("wide diagrams fit the available width", () => {
  const size = fitDiagramSize(1600, 400, 800, 600);
  close(size.width, 800, "width");
  close(size.height, 200, "height");
  close(size.scale, 0.5, "scale");
});

testCase("tall diagrams fit the available height instead of showing a half graph", () => {
  const size = fitDiagramSize(900, 1200, 800, 600);
  close(size.width, 450, "width");
  close(size.height, 600, "height");
  close(size.scale, 0.5, "scale");
});

testCase("invalid measurement falls back without collapsing the graph", () => {
  const size = fitDiagramSize(0, 0, 0, 0);
  assert(size.width >= 1 && size.height >= 1, "invalid dimensions collapsed the SVG");
  close(size.scale, 1, "scale");
});

testCase("Mermaid initialization is keyed by theme and diagram family", () => {
  const theme = {
    mode: "dark" as const,
    accent: "#78aeed",
    fontFamily: "sans-serif",
    fontSize: 16,
    key: "dark|#78aeed|sans-serif|16",
  };
  assert(
    mermaidConfigurationKey(theme, false) === mermaidConfigurationKey(theme, false),
    "the same Mermaid configuration produced different cache keys",
  );
  assert(
    mermaidConfigurationKey(theme, false) !== mermaidConfigurationKey(theme, true),
    "mind maps and flow diagrams shared one Mermaid cache key",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
