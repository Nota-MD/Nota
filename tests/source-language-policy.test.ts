import { readFileSync } from "node:fs";

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

const read = (path: string) => readFileSync(path, "utf8");
const han = /[\u3400-\u9fff]/;
const emoji = /\p{Extended_Pictographic}/u;

console.log("\n[Source language policy]");

testCase("core rules are linked from the repository entry point", () => {
  const rules = read("CORE_RULES.md");
  const agents = read("AGENTS.md");
  assert(rules.includes("Production identifiers must be ASCII English."), "identifier rule missing");
  assert(rules.includes("Comments in source code must be concise English."), "comment rule missing");
  assert(agents.includes("`CORE_RULES.md`"), "AGENTS.md does not reference core rules");
});

testCase("root rule and experience files are concise English without emoji", () => {
  for (const file of ["CORE_RULES.md", "DEVELOPMENT_EXPERIENCE.md"]) {
    const text = read(file);
    assert(!han.test(text), `${file} contains Chinese`);
    assert(!emoji.test(text), `${file} contains emoji`);
  }
});

testCase("language audit protects the migration baseline", () => {
  const tool = read("tools/source-language-audit.mjs");
  const baseline = JSON.parse(read("tools/source-language-baseline.json")) as {
    total: number;
    files: Record<string, number>;
  };
  assert(tool.includes("--check"), "audit has no check mode");
  assert(tool.includes("--update"), "audit cannot refresh the baseline");
  assert(baseline.total >= 0, "baseline total is invalid");
  assert(Object.keys(baseline.files).length >= 0, "baseline files are invalid");
});

testCase("migrated download modules contain no Chinese", () => {
  for (const file of ["src-tauri/src/remote.rs", "src-tauri/src/settings/download.rs"]) {
    assert(!han.test(read(file)), `${file} still contains Chinese`);
  }
});

console.log(`\nSource language policy: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
