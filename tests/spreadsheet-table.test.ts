import { readFileSync } from "node:fs";

import {
  cellLabel,
  canReplaceFormulaReference,
  columnLabel,
  formulaTokens,
  insertFormulaReference,
  isFormulaReferenceDraft,
} from "@/ui/SpreadsheetTableOverlay";
import {
  adaptiveSelectionPalette,
  parseColor,
} from "@/styles/doc-theme";
import {
  clearTableExtensionContent,
  hasExtensionTableContent,
  recordTableExtensionContent,
} from "@/ui/table-computed";

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
const persistent = read("src/ui/PersistentTableComputedOverlay.tsx");
const tableComputed = read("src/ui/table-computed.ts");
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

testCase("active cells and row or column headers select immediately", () => {
  assert(
    overlay.includes("const applyLocalRange") &&
      overlay.includes("active: point") &&
      overlay.includes("paintRange(table, selection.current)"),
    "pointer entry does not paint and store the active cell immediately",
  );
  assert(
    overlay.includes('run("tableSelectColumn"') &&
      overlay.includes('run("tableSelectRow"') &&
      overlay.includes("applyLocalRange(range, { row: row.index, column: 0 })"),
    "row or column headers do not enter the shared range-selection path",
  );
  assert(
    tableCss.includes(".nota-sheet-range") &&
      tableCss.includes("--nota-sheet-selection-bg"),
    "the active cell range has no visible highlight",
  );
});

testCase("cell formula input keeps focus when clicked", () => {
  assert(
    overlay.includes("onMouseDown={(event) => {") &&
      overlay.includes("event.stopPropagation();"),
    "formula input lets the document selection steal pointer events",
  );
  assert(
    !overlay.includes("event.preventDefault();\n            event.stopPropagation();\n            event.currentTarget.focus();"),
    "formula input still blocks native caret placement and text selection",
  );
  assert(
    overlay.includes("formulaTarget.current?.row !== active.row") &&
      overlay.includes("formulaTarget.current?.column !== active.column"),
    "formula bar can keep stale text while the cell changes",
  );
  assert(
    overlay.includes("active: point") &&
      overlay.includes("const range = selection.current;") &&
      overlay.includes('run("tableSelectRange"'),
    "single-cell pointer selection does not update the shared active cell",
  );
  assert(
    overlay.includes("const formulaActive = useRef(false)") &&
      overlay.includes("formulaActive.current ||") &&
      overlay.includes("contextSelectionFrozen.current ||") &&
      overlay.includes("contextMenuOwnsFocus()") &&
      overlay.includes("formulaTarget.current?.row !== active.row"),
    "focusing the formula input can still unmount the spreadsheet overlay",
  );
  assert(
    overlay.includes("const formulaTarget = useRef<Point | null>(null)") &&
      overlay.includes("const target = formulaTarget.current ?? layout.active"),
    "formula edits are not pinned to the cell that opened the formula bar",
  );
  assert(
    toolbar.includes("const spreadsheetEditing = useRef(false)") &&
      toolbar.includes("if (spreadsheetEditing.current || contextMenuOwnsFocus()) return") &&
      overlay.includes("onFormulaActiveChange?.(true)"),
    "the parent table toolbar can still unmount while its formula input is active",
  );
  assert(
    toolbar.includes("contextMenuOwnsFocus") &&
      overlay.includes("contextMenuOwnsFocus") &&
      toolbar.includes('closest("[data-context-menu]")') &&
      overlay.includes('closest("[data-context-menu]")'),
    "the table overlay can still disappear while the context menu owns focus",
  );
  assert(
    overlay.includes("restoreFrozenSelection") &&
      overlay.includes('closest("[data-context-menu]")') &&
      overlay.includes('run("tableSelectRange"'),
    "the context menu can still clear the frozen table selection",
  );
  assert(
    overlay.includes("contextSelectionFrozen") &&
      overlay.includes("contextSelectionFrozen.current = true"),
    "secondary click does not freeze the selection before menu focus moves",
  );
});

testCase("formula references use matching OnlyOffice-style colors", () => {
  const tokens = formulaTokens("=SUM(A1:A2)+B1+A1+A1");
  const references = tokens.filter((token) => token.kind === "reference");
  assert(tokens.some((token) => token.kind === "function" && token.text === "SUM"), "formula function is not highlighted");
  assert(references.map((token) => token.text).join(",") === "A1:A2,B1,A1,A1", "references are not tokenized in source order");
  assert(references[2]?.tone === references[3]?.tone, "repeated references must keep the same color");
  assert(references[0]?.tone !== references[1]?.tone, "distinct references must receive distinct colors");
  assert(
    overlay.includes("function activeTableFor(") &&
      overlay.includes("useLayoutEffect") &&
      overlay.includes("activeTableFor(layout)"),
    "reference overlays are not measured against the live table after layout",
  );
  assert(
    overlay.includes("formulaReferenceSource") &&
      overlay.includes("referenceBoxesFor(activeTableFor(layout), draft)"),
    "formula references do not drive cell overlays",
  );
  assert(
    tableCss.includes(".sheet-formula-highlight") &&
      tableCss.includes(".sheet-formula-reference") &&
      tableCss.includes(".sheet-reference-box"),
    "the formula text and cell reference overlays are not styled",
  );
  for (const tone of ["0", "1", "2", "3", "4", "5", "6"]) {
    assert(
      tableCss.includes(`.sheet-tone-${tone}`),
      `formula reference tone ${tone} is missing`,
    );
  }
  assert(
    tableCss.includes("border: 1.5px dashed var(--sheet-range-tone)"),
    "formula reference cells do not use a dashed tone border",
  );
  assert(
    overlay.includes("const [referencePreview, setReferencePreview]") &&
      overlay.includes("setReferencePreview(") &&
      overlay.includes("sheet-reference-box is-preview"),
    "formula reference clicks do not use a dedicated preview overlay",
  );
});

testCase("editing a formula can insert single cells and dragged ranges", () => {
  assert(isFormulaReferenceDraft("=A1+B1"), "formula draft is not treated as reference mode");
  assert(isFormulaReferenceDraft("  =SUM(A1:A2)"), "indented formula draft is not treated as reference mode");
  assert(!isFormulaReferenceDraft("plain text"), "ordinary cell text incorrectly enters reference mode");

  const range = insertFormulaReference("=SUM()", 5, 5, {
    top: 1,
    left: 0,
    bottom: 2,
    right: 2,
  });
  assert(range.value === "=SUM(A2:C3)", `dragged range was not inserted: ${range.value}`);
  assert(range.caret === 10, `caret did not move after the inserted range: ${range.caret}`);

  const single = insertFormulaReference("=A1+1", 1, 3, {
    top: 3,
    left: 3,
    bottom: 3,
    right: 3,
  });
  assert(single.value === "=D4+1", "selected reference text was not replaced");
  assert(single.caret === 3, "caret did not stay after the single-cell reference");

  const firstClick = insertFormulaReference("=A1+", 4, 4, {
    top: 0,
    left: 1,
    bottom: 0,
    right: 1,
  });
  const previous = { start: 4, end: firstClick.caret };
  assert(
    canReplaceFormulaReference(firstClick.value, firstClick.caret, firstClick.caret, previous),
    "the trailing formula reference cannot be replaced by another click",
  );
  const secondClick = insertFormulaReference(
    firstClick.value,
    previous.start,
    previous.end,
    { top: 1, left: 1, bottom: 1, right: 1 },
  );
  assert(secondClick.value === "=A1+B2", `repeated cell clicks append instead of replace: ${secondClick.value}`);
  assert(
    !canReplaceFormulaReference("=A1+B1+", 8, 8, previous),
    "ordinary typing after a reference still allows it to be replaced",
  );

  assert(
    overlay.includes("referencing.current") &&
      overlay.includes("insertFormulaReference(") &&
      overlay.includes("referenceRange.current") &&
      overlay.includes("formulaTarget.current") &&
      overlay.includes("input.setSelectionRange(released.caret, released.caret)"),
    "formula editing does not keep focus while cells are clicked or dragged",
  );

  const functionRule = /\.sheet-formula-function\s*\{([^}]*)\}/.exec(tableCss)?.[1] ?? "";
  const referenceRule = /\.sheet-formula-reference\s*\{([^}]*)\}/.exec(tableCss)?.[1] ?? "";
  const inputRule = /\.sheet-formula-bar input\s*\{([^}]*)\}/.exec(tableCss)?.[1] ?? "";
  assert(
    !functionRule.includes("font-weight") &&
      !referenceRule.includes("font-weight") &&
      inputRule.includes("font: inherit") &&
      inputRule.includes("letter-spacing: normal"),
    "colored formula tokens can drift from the transparent input caret metrics",
  );
});

testCase("spreadsheet overlays stay inside the editor viewport", () => {
  assert(overlay.includes('table.closest<HTMLElement>(".editor-pane")'), "editor viewport is not measured");
  assert(overlay.includes('querySelector<HTMLElement>(".editor-frontmatter")'), "front matter boundary is not measured");
  assert(overlay.includes("const contentTop = Math.max("), "front matter can still cover spreadsheet controls");
  assert(overlay.includes("Math.min(viewport.bottom, box.top + box.height)"), "range box is not clipped to the editor");
  assert(overlay.includes("bottom <= top"), "row headers are not clipped at the editor boundary");
  assert(toolbar.includes("const topBoundary = Math.max("), "table toolbar can overlap front matter");
  const area = read("src/ui/EditorArea.tsx");
  assert(
    area.includes("!(settings?.editor.spreadsheet_tables ?? false)"),
    "spreadsheet mode still inherits the prose column width limit",
  );
  assert(
    overlay.includes("formulaWidth") &&
      overlay.includes("Math.min(viewport.right, window.innerWidth)"),
    "formula bar still stops at the table width instead of using the editor width",
  );
});

testCase("table extensions receive source snapshots and display-only results", () => {
  const bridge = read("src-tauri/src/table_bridge.rs");
  const bridgeHook = read("src/ui/useTableBridge.ts");
  const snapshotHelper = read("src/ui/table-snapshot.ts");
  assert(overlay.includes("api.table.syncSnapshot(snapshot)"), "active table snapshot is not published");
  assert(
    overlay.includes("const publishSnapshot = () =>") &&
      overlay.includes("publishSnapshot();") &&
      overlay.includes("api.table.syncSnapshot(snapshot)"),
    "table edits do not publish a fresh formula snapshot immediately",
  );
  assert(snapshotHelper.includes("table.dataset.notaTableId = tableId"), "tables have no stable bridge identity");
  assert(bridge.includes("pub struct TableSnapshot"), "host snapshot shape is missing");
  assert(bridge.includes("pub struct TableWriteRequest"), "host write intent is missing");
  assert(
    tableComputed.includes("cell.dataset.notaSheetValue = value") &&
      overlay.includes("applyComputed(liveTable, payload.cells)"),
    "computed values are not display-only",
  );
  assert(
    persistent.includes("events.tableRender") &&
      persistent.includes("renders.current.set(") &&
      persistent.includes("computedBoxesFor(table, payload.cells)") &&
      !persistent.includes("currentTable && currentRange"),
    "computed values do not survive after the caret leaves the table",
  );
  assert(
    persistent.includes("{boxes.map((box) => (") &&
      !persistent.includes("boxes.filter((box) => !box.selected)"),
    "selecting a formula cell still hides its computed result",
  );
  assert(
    tableComputed.includes("paintedBackground(cell)") &&
      tableComputed.includes("fontSize: style.fontSize") &&
      tableComputed.includes("--nota-cell-ink") &&
      persistent.includes("fontFamily: box.fontFamily") &&
      tableCss.includes("var(--nota-cell-ink"),
    "computed values do not inherit the rendered cell typography, ink and background",
  );
  assert(
    toolbar.includes("PersistentTableComputedOverlay") &&
      persistent.includes("new MutationObserver") &&
      persistent.includes('document.addEventListener("selectionchange", onSelectionChange)') &&
      read("src/ui/EditorArea.tsx").includes("spreadsheetPersistent="),
    "rendered table values are not repainted after editor DOM updates",
  );
  assert(bridgeHook.includes('runCommand("tableSetCells"'), "extension write intent is not applied");
  assert(
    bridgeHook.includes('querySelectorAll<HTMLTableElement>(".ProseMirror table")') &&
      bridgeHook.includes("snapshotForTable(") &&
      bridgeHook.includes("new MutationObserver") &&
      bridgeHook.includes("api.table.syncSnapshot(snapshot)") &&
      bridgeHook.includes('dispatchEvent(new Event("nota-table-snapshots-ready"))') &&
      persistent.includes("api.table.renders()") &&
      !overlay.includes("void api.table.syncSnapshot(null)"),
    "table formula snapshots stop updating after the caret leaves the table",
  );
});

testCase("extension-rendered table content is included in save feedback", () => {
  recordTableExtensionContent(501, "doc:0", false);
  assert(!hasExtensionTableContent(501), "plain tables were marked as extension-rendered");
  recordTableExtensionContent(501, "doc:1", true);
  assert(hasExtensionTableContent(501), "rendered table content was not recorded");
  clearTableExtensionContent(501);
  assert(!hasExtensionTableContent(501), "document table state was not cleared");
  const bridge = read("src-tauri/src/table_bridge.rs");
  const documents = read("src/ui/useDocuments.ts");
  assert(
    bridge.includes("pub extension_content: bool") &&
      bridge.includes("has_extension_content") &&
      documents.includes("Table content is rendered by extensions"),
    "save feedback or the additive extension API is missing",
  );
});

testCase("formula source stays in the formula bar and errors are visible", () => {
  assert(
    persistent.includes("computedBoxesFor(table, payload.cells)") &&
      persistent.includes("{boxes.map((box) => (") &&
      !persistent.includes("boxes.filter((box) => !box.selected)") &&
      !persistent.includes("table === currentTable"),
    "a selected formula cell still reveals its source instead of the computed value",
  );
  assert(
    tableComputed.includes('/^#[A-Z0-9/?!]+$/i') &&
      persistent.includes("box.error") &&
      tableCss.includes(".sheet-computed-value.is-error") &&
      tableCss.includes("td.nota-sheet-error::after"),
    "formula errors do not have a distinct warning treatment",
  );
});

testCase("selection colors keep contrast under IBM light and dark themes", () => {
  const light = adaptiveSelectionPalette(
    parseColor("#ffffff")!,
    parseColor("#0f62fe")!,
    parseColor("#d0e2ff")!,
    parseColor("#161616")!,
  );
  const dark = adaptiveSelectionPalette(
    parseColor("#262626")!,
    parseColor("#78a9ff")!,
    parseColor("#525252")!,
    parseColor("#f4f4f4")!,
  );
  for (const palette of [light, dark]) {
    assert(palette.backgroundContrast >= 2.5, "selection fill is too close to the page");
    assert(palette.inkContrast >= 4.5, "selected text contrast is below WCAG AA");
    assert(palette.outlineContrast >= 3, "selection outline contrast is below 3:1");
  }
  assert(
    tableCss.includes("--nota-sheet-selection-bg") &&
      tableCss.includes("--nota-selection-outline") &&
      tableCss.includes("--nota-result-ink") &&
      read("src/styles/doc-theme.ts").includes("var(--nota-selection-bg"),
    "selection and spreadsheet range colors are not using the adaptive palette",
  );
});

testCase("multi-cell selection survives drag and secondary click", () => {
  assert(
    overlay.includes('window.addEventListener("pointermove", move, true)') &&
      overlay.includes("event.preventDefault();\n      anchor.current = point;") &&
      overlay.includes("activeTableFor(layout)"),
    "drag selection is still intercepted by the editor or a stale table node",
  );
  assert(
    overlay.includes("if (event.button !== 0) return;") &&
      overlay.includes('document.addEventListener("contextmenu", preserveContextSelection, true)') &&
      overlay.includes("rangeContains(selection.current, point)"),
    "secondary click collapses the selected table range",
  );
});

testCase("extension table edits and setting ownership are explicit", () => {
  const commandTable = read("src/editor/command-table.ts");
  const context = read("src/editor/table-context.ts");
  const locks = read("src-tauri/src/plugin/setting_locks.rs");
  const pane = read("src/ui/settings/panes/EditorPane.tsx");
  assert(commandTable.includes("tableSetCells:"), "batch cell command is not wired");
  assert(context.includes("export function setCurrentTableCells"), "batch transaction is missing");
  assert(context.includes("tr.replaceWith(from, to, paragraph)"), "batch cells do not share one transaction");
  assert(locks.includes("remember_setting_backup"), "previous setting is not recorded");
  assert(locks.includes("set_setting_value"), "owned setting is not forced");
  assert(pane.includes('settingLocks.has("editor.spreadsheet_tables")'), "owned setting is not disabled in UI");
});

testCase("table context actions carry plugin commands and a single undo step", () => {
  const menu = read("src/ui/context-menu.ts");
  const contextMenu = read("src/ui/ContextMenu.tsx");
  assert(menu.includes("export const tableActionPrefix"), "table action ids are missing");
  assert(menu.includes("tableActions.map"), "registered table actions are not rendered");
  assert(contextMenu.includes("onTableAction(action.plugin, action.command, action.id)"), "table action command is not dispatched");
  assert(tableContext.includes("if (tr.docChanged) view.dispatch(tr.scrollIntoView())"), "batch edit can create multiple undo steps");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
