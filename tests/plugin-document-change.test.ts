/** External plugin writes must replace the editor without losing to pending local sync. */

import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function ok(value: boolean, label: string): void {
  if (value) pass++;
  else {
    fail++;
    console.log(`  FAIL ${label}`);
  }
}

const events = readFileSync("src/ui/useAppEvents.ts", "utf8");
const editor = readFileSync("src/ui/EditorPane.tsx", "utf8");
const handle = readFileSync("src/ui/useEditorHandle.ts", "utf8");
const editorArea = readFileSync("src/ui/EditorArea.tsx", "utf8");
const review = readFileSync("src/styles/review.css", "utf8");
const theme = readFileSync("src/styles/theme/base.css", "utf8");

ok(
  events.includes("setMarkdownFromHost(p.text)") && events.includes("void refreshDocs()"),
  "plugin and MCP document changes use the host replacement path and refresh metadata",
);
ok(
  editor.includes("sourceSnapshotRef.current?.cancel()") &&
    handle.includes("cancelPendingSync();"),
  "host replacement cancels queued editor synchronization first",
);
ok(
  editorArea.includes("const succeeded = await plugin.configure") &&
    editorArea.includes("if (succeeded) await plugin.receivePreview()"),
  "a successful review command closes the stale diff overlay",
);
ok(
  review.includes("color: var(--doc-fg)") &&
    review.includes("color-mix(in srgb, var(--success) 24%, transparent)"),
  "review additions keep theme foreground contrast on tinted backgrounds",
);
ok(
  theme.includes("--diff-del-bg: rgb(229 115 115 / 19%)") &&
    theme.includes("--diff-add-bg: rgb(110 192 138 / 18%)"),
  "dark diffs use translucent theme-aware color layers",
);

console.log(`Plugin document replacement: ${pass} checks passed, ${fail} failed`);
if (fail > 0) process.exit(1);
