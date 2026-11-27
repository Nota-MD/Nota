import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    fail++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

console.log("\n[Distribution Profile]");

testCase("official is an explicit profile with its own identity", () => {
  const profile = JSON.parse(read("distributions/official/distribution.json"));
  assert(profile.schemaVersion === 1, "official schema version");
  assert(profile.kind === "official", "official kind");
  assert(profile.id === "official", "official id");
  assert(profile.identity.identifier === "io.github.nota.Nota", "official identifier");
  assert(profile.identity.dataDirectory === "nota", "official data directory");
  assert(profile.updates.manifestUrl.includes("Nota-MD/Nota"), "official update channel");
});

testCase("organization profile has isolated identity and static onboarding", () => {
  const profile = JSON.parse(read("distributions/example-university/distribution.json"));
  assert(profile.kind === "organization", "organization kind");
  assert(profile.identity.identifier !== "io.github.nota.Nota", "identifier isolation");
  assert(profile.identity.dataDirectory !== "nota", "data directory isolation");
  assert(profile.onboarding.mode === "before-default", "onboarding placement");
  assert(profile.legal.distributionLicense, "distribution license");
  const guide = read("distributions/example-university/assets/onboarding-en.html");
  const notice = read("distributions/example-university/assets/notice-en.html");
  for (const html of [guide, notice]) {
    assert(!/<script\b/i.test(html), "script injection");
    assert(!/<iframe\b/i.test(html), "iframe injection");
    assert(!/\son[a-z]+\s*=/i.test(html), "event-handler injection");
  }
});

testCase("profile tooling validates unknown fields, HTTPS, assets, and extension hashes", () => {
  const tool = read("tools/distribution-profile.mjs");
  assert(tool.includes("unknown field"), "unknown field validation");
  assert(tool.includes('parsed.protocol !== "https:"'), "HTTPS validation");
  assert(tool.includes("SHA-256 does not match"), "extension hash validation");
  assert(tool.includes("must not use the official identifier"), "official identity guard");
  assert(tool.includes("safeStaticHtml"), "static onboarding validation");
});

testCase("profile build reuses Tauri's config merge path and preserves a dry-run check", () => {
  const build = read("tools/build-dist.mjs");
  assert(build.includes('["tauri", "build", "--config", configPath'), "tauri merge path");
  assert(build.includes("NOTA_DISTRIBUTION_PROFILE"), "build-time profile injection");
  assert(build.includes("--dry-run"), "dry-run validation");
  assert(build.includes('join(root, "dist")'), "production frontend build reuse");
});

testCase("extension program export remains a separate .nota-plugin operation", () => {
  const pluginExport = read("src-tauri/src/plugin/export.rs");
  const settingsWindow = read("src/ui/SettingsWindow.tsx");
  assert(pluginExport.includes("default_package_name"), "extension package name");
  assert(pluginExport.includes("SIGNATURE_FILE"), "signature preservation path");
  assert(!pluginExport.includes("plugin-settings"), "user settings must not enter extension code");
  assert(settingsWindow.includes("Export extension"), "extension manager export action");
  assert(settingsWindow.includes('"nota-plugin"'), "extension package filter");
});

console.log(`\nDistribution Profile: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
