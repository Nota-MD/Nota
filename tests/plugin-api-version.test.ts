import { readFileSync } from "node:fs";
import { pluginApiHintFromError, pluginApiHintKey } from "../src/ui/plugin-api";

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

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n[Extension API compatibility]");

testCase("manifest inspection rejects incompatible directories without hiding them", () => {
  const source = readFileSync("src-tauri/src/plugin/mod.rs", "utf8");
  assert(source.includes("Manifest::load_unchecked"), "incompatible plugin id cannot be recovered");
  assert(source.includes("LuaPlugin::rejected"), "incompatible directory is not kept as a failed plugin");
  assert(source.includes("PluginApiMismatch"), "startup scan does not special-case API mismatch");
});

testCase("host accepts lower compatible minors and rejects newer or foreign majors", () => {
  const source = readFileSync("src-tauri/src/plugin/manifest.rs", "utf8");
  assert(source.includes("requested.minor <= self.minor"), "minor compatibility is not one-way");
  assert(source.includes("self.major == requested.major"), "major compatibility is not enforced");
  assert(source.includes('PluginApiVersion::new(2, 4)'), "host API is not v2.4");
});

testCase("existing incompatible directories stay as red list entries", () => {
  const source = readFileSync("src/ui/usePlugins.ts", "utf8");
  assert(
    !source.includes("apiMismatchQueue"),
    "existing directories still trigger popup state",
  );
  assert(source.includes("announcedStartupApiMismatch"), "startup notification can repeat");
  assert(
    source.includes("did not start because their API version is incompatible"),
    "startup mismatch does not produce a notification",
  );
  const pane = readFileSync("src/ui/settings/panes/ExtensionsPane.tsx", "utf8");
  assert(pane.includes("{p.error}"), "failed extension error is not rendered");
});

testCase("actively importing an incompatible package opens a rejection dialog", () => {
  const source = readFileSync("src/ui/usePlugins.ts", "utf8");
  assert(
    source.includes("Extension installation rejected"),
    "installation failure does not use a rejection dialog",
  );
  assert(source.includes("askConfirm({"), "installation rejection is not blocking");
});

testCase("version guidance distinguishes newer plugins from legacy plugins", () => {
  assert(
    pluginApiHintKey("v3.0", "v2.3") === "update",
    "newer plugin does not suggest checking the software version",
  );
  assert(
    pluginApiHintKey("v2.4", "v2.3") === "update",
    "newer minor does not suggest checking the software version",
  );
  assert(
    pluginApiHintKey("v1.9", "v2.3") === "contact",
    "older major does not contact the developer",
  );
  assert(pluginApiHintKey("v2.2", "v2.3") === null, "compatible older minor gained a warning");
});

testCase("installation error extracts both API versions", () => {
  const detail = pluginApiHintFromError(
    "extension reject.api requires API v3.0; this host supports v2.3",
    "v2.3",
  );
  assert(detail.required === "v3.0", "required version not extracted");
  assert(detail.supported === "v2.3", "host version not extracted");
  assert(
    detail.hint === "update",
    "installation warning is incorrect",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
