import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function test(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ok ${name}`);
  } catch (error) {
    fail++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

console.log("\n[Toast position]");

test("App passes the actual bottom-bar visibility", () => {
  const app = read("src/App.tsx");
  assert(app.includes("tabbarVisible={docs.length >= 2}"), "tab bar visibility is not passed");
  assert(app.includes("statusbarVisible={statusBarOpen}"), "status bar visibility is not passed");
});

test("Toasts exposes bottom-bar visibility to CSS", () => {
  const toasts = read("src/ui/Toasts.tsx");
  assert(toasts.includes('data-tabbar={tabbarVisible ? "true" : "false"}'), "missing tab bar marker");
  assert(
    toasts.includes('data-statusbar={statusbarVisible ? "true" : "false"}'),
    "missing status bar marker",
  );
});

test("bottom-right toasts sit above every visible bar", () => {
  const css = read("src/styles/toast.css");
  assert(
    css.includes("calc(var(--statusbar-height) + var(--toast-edge-gap))"),
    "status bar height is not included",
  );
  assert(
    css.includes(
      "calc(var(--statusbar-height) + var(--tabbar-height) + var(--toast-edge-gap))",
    ),
    "tab bar and status bar heights are not combined",
  );
  assert(
    css.includes("calc(var(--tabbar-height) + var(--toast-edge-gap))"),
    "tab bar height alone is not handled",
  );
});

test("shared height tokens match the rendered bars", () => {
  const base = read("src/styles/theme/base.css");
  const bars = read("src/styles/tabs-status.css");
  assert(base.includes("--tabbar-height: 32px"), "missing tab bar token");
  assert(base.includes("--statusbar-height: 26px"), "missing status bar token");
  assert(bars.includes("height: var(--tabbar-height)"), "tab bar ignores its token");
  assert(bars.includes("height: var(--statusbar-height)"), "status bar ignores its token");
});

test("immersive mode resets the toast to the viewport edge", () => {
  const css = read("src/styles/toast.css");
  assert(
    css.includes('.app[data-zen="true"] .toasts[data-position="bottom-right"]'),
    "missing immersive override",
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;

