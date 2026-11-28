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
const settings = read("src-tauri/src/settings/mod.rs");
const commands = read("src-tauri/src/commands/settings.rs");
const app = read("src/App.tsx");
const settingsWindow = read("src/ui/SettingsWindow.tsx");
const aboutWindow = read("src/ui/AboutWindow.tsx");
const bridge = read("src/bridge/ipc.ts");

console.log("\n[Settings persistence]");

testCase("settings writes are atomic", () => {
  assert(settings.includes(".nota-tmp-"), "settings save has no temporary file");
  assert(settings.includes("file.sync_all()"), "settings bytes are not flushed before replacement");
  assert(settings.includes("MoveFileExW"), "Windows cannot atomically replace the settings file");
  assert(settings.includes("MOVEFILE_REPLACE_EXISTING"), "Windows replacement flags are missing");
});

testCase("settings updates use a backend merge patch", () => {
  assert(commands.includes("pub fn nota_settings_patch"), "backend patch command is missing");
  assert(commands.includes("merge_json(&mut base, patch)"), "backend patch does not deep merge");
  assert(bridge.includes("patch: (patch: Partial<Settings>)"), "IPC patch is missing");
  for (const source of [app, settingsWindow, aboutWindow]) {
    assert(source.includes("api.settings.patch(patch)"), "a window still writes a stale full snapshot");
  }
});

testCase("onboarding completion commits only its own flag", () => {
  assert(commands.includes("pub fn nota_settings_complete_onboarding"), "onboarding command is missing");
  assert(
    commands.includes("next.general.onboarding_seen = true"),
    "onboarding command does not persist the flag",
  );
  assert(
    commands.includes("let mut next = Settings::load()?"),
    "onboarding command starts from a stale process snapshot",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
