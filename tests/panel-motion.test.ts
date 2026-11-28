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
const app = read("src/App.tsx");
const appCss = read("src/styles/app.css");
const sidebarCss = read("src/styles/sidebar.css");
const dockCss = read("src/styles/dock.css");

console.log("\n[Panel motion]");

testCase("panel state is published on the app body", () => {
  assert(app.includes('data-sidebar-open={sidebarOpen ? "true" : undefined}'), "sidebar state is missing");
  assert(app.includes('data-dock-open={dockOpen ? "true" : undefined}'), "dock state is missing");
  assert(
    /\.app-body\[data-sidebar-open="true"\]\s*>\s*\.app-main\s*\{[^}]*margin-left:/s.test(appCss),
    "the editor does not reserve space for the left panel",
  );
  assert(
    /\.app-body\[data-dock-open="true"\]\s*>\s*\.app-main\s*\{[^}]*margin-right:/s.test(appCss),
    "the editor does not reserve space for the right panel",
  );
});

testCase("left panel slides on the compositor", () => {
  assert(/\.sidebar\s*\{[^}]*position:\s*absolute;/s.test(sidebarCss), "sidebar is still a flex sibling");
  assert(/\.sidebar\s*\{[^}]*transform:\s*translate3d/s.test(sidebarCss), "sidebar has no transform layer");
  assert(
    /\.sidebar-collapsed\s*\{[^}]*transform:\s*translate3d/s.test(sidebarCss),
    "collapsed sidebar does not slide out",
  );
  assert(!/transition:\s*width\b/.test(sidebarCss), "sidebar still animates width");
});

testCase("right panel slides without collapsing its contents", () => {
  assert(/\.plugin-dock\s*\{[^}]*position:\s*absolute;/s.test(dockCss), "dock is still a flex sibling");
  assert(/\.plugin-dock\s*\{[^}]*transform:\s*translate3d/s.test(dockCss), "dock has no transform layer");
  assert(
    /\.plugin-dock\.plugin-dock-collapsed[\s\S]*?transform:\s*translate3d\(100%/s.test(dockCss),
    "collapsed dock does not slide out",
  );
  assert(!/transition:\s*width\b/.test(dockCss), "dock still animates width");
});

testCase("reduced motion disables panel transitions", () => {
  assert(
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.sidebar,[\s\S]*?\.plugin-dock[\s\S]*?transition:\s*none/s.test(
      dockCss,
    ),
    "reduced motion leaves panel transitions enabled",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
