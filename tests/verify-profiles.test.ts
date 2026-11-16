/** Verification profiles must stay fast, complete, and explicitly separated. */

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

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const read = (path: string) => readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
};
const light = read(".github/workflows/verify.yml");
const full = read(".github/workflows/verify-full.yml");
const frontendRunner = read("tools/test-frontend.sh");

console.log("\n[Verification profiles]");

testCase("package scripts expose light, full, and compatibility aliases", () => {
  assertValue(pkg.scripts["verify:light"], "verify:light is missing");
  assertValue(pkg.scripts["verify:full"], "verify:full is missing");
  assertValue(
    pkg.scripts.verify === "npm run verify:full",
    "verify no longer points to the full profile",
  );
});

testCase("light verification stays cloud-native and focused", () => {
  assertValue(light.includes("name: Verify (light)"), "light workflow name is missing");
  assertValue(light.includes("npm run test:smoke"), "focused tests are missing");
  assertValue(light.includes("npm run build"), "production build is missing");
  assertValue(light.includes("tools/i18n-check.sh"), "translation check is missing");
  assertValue(!light.includes("apt-get install"), "light profile installs native packages");
  assertValue(!light.includes("test:e2e"), "light profile runs browser E2E");
  assertValue(!light.includes("cargo test"), "light profile runs the Rust suite");
  assertValue(!light.includes("Nota-plugins"), "light profile checks out plugins");
});

testCase("full verification retains every release gate", () => {
  assertValue(full.includes("name: Verify (full)"), "full workflow name is missing");
  for (const gate of [
    "npm run typecheck",
    "bash tools/test-frontend.sh",
    "npm run test:e2e",
    "cargo test --lib --locked",
    "tools/i18n-check.sh",
    "tools/doc-sync-check.sh --ci",
    "Nota-plugins",
    "npm run build",
  ]) {
    assertValue(full.includes(gate), `full profile is missing ${gate}`);
  }
});

testCase("frontend runner accepts an explicit smoke-test list", () => {
  assertValue(
    frontendRunner.includes('if [ "$#" -gt 0 ]; then'),
    "explicit test files are ignored",
  );
  assertValue(
    frontendRunner.includes('test_files=("$@")'),
    "smoke files are not passed to the runner",
  );
});

console.log(`\nVerification profiles: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
