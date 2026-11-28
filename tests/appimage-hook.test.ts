import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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

console.log("\n[AppImage runtime hook]");

testCase("patched GTK hook isolates GIO and avoids the Wayland input module on X11", () => {
  const directory = mkdtempSync(join(tmpdir(), "nota-appimage-hook-"));
  const path = join(directory, "linuxdeploy-plugin-gtk.sh");
  writeFileSync(path, "#!/bin/sh\nexport GDK_BACKEND=x11\n");
  try {
    for (let run = 0; run < 2; run += 1) {
      const result = spawnSync(
        process.execPath,
        ["tools/patch-linuxdeploy-gtk-hook.mjs", path],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      assert(result.status === 0, result.stderr || "patch script failed");
    }
    const patched = readFileSync(path, "utf8");
    assert(patched.includes('export GTK_IM_MODULE=xim'), "Wayland input module remains on X11");
    assert(patched.includes("export GIO_MODULE_DIR"), "host GIO modules can leak into the AppImage");
    assert(
      patched.split("# nota-appimage-runtime-compatibility").length === 2,
      "patch is not idempotent",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

testCase("release workflow patches the cached GTK hook before Tauri packages AppImage", () => {
  const workflow = readFileSync(".github/workflows/release.yml", "utf8");
  const patch = workflow.indexOf("Patch Linux AppImage runtime hook");
  const bundle = workflow.indexOf("tauri-apps/tauri-action");
  assert(patch >= 0 && bundle > patch, "release workflow uses the unpatched GTK hook");
  assert(
    workflow.includes("node tools/patch-linuxdeploy-gtk-hook.mjs"),
    "release workflow does not invoke the hook patch",
  );
  assert(
    workflow.includes("$HOME/.cache/tauri/linuxdeploy-plugin-gtk.sh"),
    "release workflow does not seed the Tauri tool cache",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
