import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/editor/code-block-cm.ts"), "utf8");
const selectionRule =
  /cm-selectionBackground, \.cm-content ::selection":\s*\{([\s\S]*?)\}/.exec(source)?.[1] ?? "";

if (!selectionRule.includes("color-mix(in srgb, var(--fg) 16%, transparent)")) {
  throw new Error("code-block selection must derive contrast from the foreground");
}
if (selectionRule.includes("var(--bg-active)")) {
  throw new Error("code-block selection still uses the low-contrast active surface token");
}

console.log("Code-block selection: 2 checks passed");
