import { readFileSync } from "node:fs";

const css = readFileSync("src/styles/editor.css", "utf8");
const pane = readFileSync("src/ui/EditorPane.tsx", "utf8");

if (!css.includes("max-width: var(--doc-page-width, 1120px);")) {
  throw new Error("editor lost the Typora-style default page width");
}
if (!css.includes("margin-inline: auto;")) {
  throw new Error("editor page column is not centered");
}
if (!pane.includes('["--doc-page-width" as string]: `${contentWidth}px`')) {
  throw new Error("custom text width does not narrow the page column");
}

console.log("Editor page width: 3 checks passed");
