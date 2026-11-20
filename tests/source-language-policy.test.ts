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

testCase("maintainer documentation is English without emoji", () => {
  const files = [
    "AGENTS.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "RELEASE.md",
    "SECURITY.md",
    "artifacts/readme-demo.md",
    "docs/README.md",
    "docs/07A-current-status.md",
    "src/styles/themes/adwaita/README.md",
    "tools/menu-harness/README.md",
    ".github/pull_request_template.md",
    "release-notes/v0.10.1-beta.md",
    "release-notes/v0.13.0-beta.md",
  ];
  for (const file of files) {
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

testCase("root configuration and i18n wrapper remain ASCII", () => {
  const nonAscii = /[^\x00-\x7f]/;
  const files = [
    ".gitignore",
    ".github/workflows/build.yml",
    ".github/workflows/platform.yml",
    ".github/workflows/release.yml",
    "CONTRIBUTORS.md",
    "index.html",
    "package.json",
    "src-tauri/Cargo.toml",
    "src-tauri/capabilities/default.json",
    "src-tauri/tauri.conf.json",
    "src/i18n/index.ts",
    "vite.config.ts",
  ];
  for (const file of files) {
    assert(!nonAscii.test(read(file)), `${file} contains non-ASCII text`);
  }
});

console.log(`\nSource language policy: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
