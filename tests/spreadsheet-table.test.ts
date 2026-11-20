import { readFileSync } from "node:fs";

import { cellLabel, columnLabel } from "@/ui/SpreadsheetTableOverlay";

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
const rust = read("src-tauri/src/settings/editor.rs");
const types = read("src/bridge/types-settings.ts");
const pane = read("src/ui/settings/panes/EditorPane.tsx");
const overlay = read("src/ui/SpreadsheetTableOverlay.tsx");
const toolbar = read("src/ui/TableToolbar.tsx");
const tableCss = read("src/styles/table-toolbar.css");
const commands = read("src/editor/command-table.ts");
const tableContext = read("src/editor/table-context.ts");

console.log("\n[Spreadsheet table mode]");

testCase("spreadsheet mode is persistent and defaults off", () => {
  assert(rust.includes("pub spreadsheet_tables: bool"), "Rust setting is missing");
  assert(rust.includes("spreadsheet_tables: false"), "Rust default is not off");
  assert(types.includes("spreadsheet_tables: boolean"), "frontend setting is missing");
  assert(pane.includes('t("Spreadsheet table mode")'), "settings UI is missing");
  assert(!pane.toLowerCase().includes("excel mode"), "UI uses Excel-specific naming");
});

testCase("column and cell labels use spreadsheet notation", () => {
  assert(columnLabel(0) === "A", "A label is wrong");
  assert(columnLabel(25) === "Z", "Z label is wrong");
  assert(columnLabel(26) === "AA", "AA label is wrong");
  assert(cellLabel({ row: 0, column: 0 }) === "A1", "A1 label is wrong");
  assert(cellLabel({ row: 4, column: 27 }) === "AB5", "AB5 label is wrong");
});

testCase("overlay provides headers, formula bar, range and fill handle", () => {
  assert(overlay.includes("sheet-column-header"), "column headers are missing");
  assert(overlay.includes("sheet-row-header"), "row headers are missing");
  assert(overlay.includes("sheet-formula-bar"), "formula bar is missing");
  assert(overlay.includes("sheet-range-box"), "range highlight is missing");
  assert(overlay.includes("sheet-fill-handle"), "fill handle is missing");
});

testCase("range and fill commands dispatch through the editor command table", () => {
  for (const command of ["tableSelectRange", "tableSelectRow", "tableSelectColumn", "tableSetCell", "tableFill"]) {
    assert(commands.includes(`${command}:`), `${command} is not wired`);
  }
  assert(tableContext.includes("CellSelection.create"), "range selection is missing");
  assert(tableContext.includes("fillCurrentTableRange"), "fill transform is missing");
  assert(tableContext.includes("replaceWith"), "fill does not rebuild the GFM table");
});

testCase("spreadsheet operations do not introduce a private document format", () => {
  assert(!overlay.includes("formula:"), "spreadsheet mode stores formula state");
  assert(!overlay.includes("sheetId"), "spreadsheet mode stores sheet state");
  assert(tableContext.includes("rect.table.type.create"), "table rebuild does not preserve GFM nodes");
});

testCase("spreadsheet overlays stay below application chrome", () => {
  assert(
    tableCss.includes("z-index: calc(var(--z-editor-widget, 24) + 3)"),
    "formula bar is not bounded by the editor widget layer",
  );
  assert(
    tableCss.includes("z-index: var(--z-editor-widget, 24)"),
    "range overlay is not bounded by the editor widget layer",
  );
});

testCase("spreadsheet geometry follows scroll and layout changes", () => {
  assert(overlay.includes("syncGeometry"), "sheet overlay has no persistent geometry sync");
  assert(overlay.includes("polling = requestAnimationFrame(poll)"), "sheet overlay does not keep coordinates current");
  assert(toolbar.includes("syncGeometry"), "table toolbar has no persistent geometry sync");
  assert(toolbar.includes("polling = requestAnimationFrame(poll)"), "table toolbar does not keep coordinates current");
});

testCase("cell formula input keeps focus when clicked", () => {
  assert(
    overlay.includes("onMouseDown={(event) => {") &&
      overlay.includes("event.preventDefault();") &&
      overlay.includes("event.currentTarget.focus();"),
    "formula input lets the document selection steal focus",
  );
});

testCase("spreadsheet overlays stay inside the editor viewport", () => {
  assert(overlay.includes('table.closest<HTMLElement>(".editor-pane")'), "editor viewport is not measured");
  assert(overlay.includes('querySelector<HTMLElement>(".editor-frontmatter")'), "front matter boundary is not measured");
  assert(overlay.includes("const contentTop = Math.max("), "front matter can still cover spreadsheet controls");
  assert(overlay.includes("Math.min(viewport.bottom, box.top + box.height)"), "range box is not clipped to the editor");
  assert(overlay.includes("bottom <= top"), "row headers are not clipped at the editor boundary");
  assert(toolbar.includes("const topBoundary = Math.max("), "table toolbar can overlap front matter");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
