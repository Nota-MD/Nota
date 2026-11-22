export interface ComputedBox {
  ref: string;
  value: string;
  left: number;
  top: number;
  width: number;
  height: number;
  padding: string;
  align: string;
  background: string;
  ink: string;
  fontFamily: string;
  fontSize: string;
  fontStyle: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  error: boolean;
  selected: boolean;
}

interface ExtensionTableRecord {
  extensionContent: boolean;
}

const extensionTables = new Map<number, Map<string, ExtensionTableRecord>>();

export function recordTableExtensionContent(
  documentId: number,
  tableId: string,
  extensionContent: boolean,
): void {
  let tables = extensionTables.get(documentId);
  if (!tables) {
    tables = new Map();
    extensionTables.set(documentId, tables);
  }
  tables.set(tableId, { extensionContent });
}

export function clearTableExtensionContent(documentId: number): void {
  extensionTables.delete(documentId);
}

export function hasExtensionTableContent(documentId: number): boolean {
  return Array.from(extensionTables.get(documentId)?.values() ?? []).some(
    (table) => table.extensionContent,
  );
}

function referencePoint(reference: string): { row: number; column: number } | null {
  const match = /^([A-Za-z]+)([1-9]\d*)$/.exec(reference.replaceAll("$", ""));
  if (!match) return null;
  const letters = match[1];
  const number = match[2];
  if (!letters || !number) return null;
  let column = 0;
  for (const letter of letters.toUpperCase()) {
    column = column * 26 + letter.charCodeAt(0) - 64;
  }
  return { row: Number(number) - 1, column: column - 1 };
}

function isFormulaError(value: string): boolean {
  return /^#[A-Z0-9/?!]+$/i.test(value);
}

function paintedBackground(cell: HTMLTableCellElement): string {
  let element: HTMLElement | null = cell;
  while (element) {
    const style = getComputedStyle(element);
    if (style.backgroundImage !== "none") {
      return style.background;
    }
    if (
      style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      style.backgroundColor !== "transparent"
    ) {
      return style.backgroundColor;
    }
    if (element.classList.contains("ProseMirror")) break;
    element = element.parentElement;
  }
  const fallback = getComputedStyle(
    cell.closest<HTMLElement>(".editor-pane") ?? document.documentElement,
  );
  return (
    fallback.getPropertyValue("--doc-bg").trim() ||
    fallback.backgroundColor ||
    "transparent"
  );
}

export function applyComputed(
  table: HTMLTableElement,
  cells: Record<string, string>,
): void {
  for (const cell of table.querySelectorAll<HTMLTableCellElement>("td, th")) {
    cell.classList.remove("nota-sheet-computed", "nota-sheet-error");
    cell.removeAttribute("data-nota-sheet-value");
    cell.style.removeProperty("--nota-cell-ink");
    cell.style.removeProperty("color");
    cell.style.removeProperty("text-shadow");
    cell.style.removeProperty("position");
    for (const child of cell.querySelectorAll<HTMLElement>("*")) {
      child.style.removeProperty("color");
      child.style.removeProperty("text-shadow");
    }
  }
  for (const [reference, value] of Object.entries(cells)) {
    const point = referencePoint(reference);
    if (!point) continue;
    const cell = table.rows[point.row]?.cells[point.column];
    if (!cell) continue;
    const ink = getComputedStyle(cell).color;
    cell.style.setProperty("--nota-cell-ink", ink);
    cell.dataset.notaSheetValue = value;
    cell.classList.add("nota-sheet-computed");
    if (isFormulaError(value)) cell.classList.add("nota-sheet-error");
    cell.style.setProperty("color", "transparent", "important");
    cell.style.setProperty("text-shadow", "none", "important");
    cell.style.setProperty("position", "relative");
    for (const child of cell.querySelectorAll<HTMLElement>("*")) {
      child.style.setProperty("color", "transparent", "important");
      child.style.setProperty("text-shadow", "none", "important");
    }
  }
}

export function computedBoxesFor(
  table: HTMLTableElement,
  cells: Record<string, string>,
): ComputedBox[] {
  const boxes: ComputedBox[] = [];
  for (const [reference, value] of Object.entries(cells)) {
    const point = referencePoint(reference);
    if (!point) continue;
    const cell = table.rows[point.row]?.cells[point.column];
    if (!cell) continue;
    const rect = cell.getBoundingClientRect();
    const style = getComputedStyle(cell);
    const error = isFormulaError(value);
    const inset = 1;
    boxes.push({
      ref: reference,
      value,
      left: rect.left + inset,
      top: rect.top + inset,
      width: Math.max(0, rect.width - inset * 2),
      height: Math.max(0, rect.height - inset * 2),
      padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
      align: style.textAlign || "left",
      background: error
        ? "color-mix(in srgb, var(--danger) 12%, var(--doc-bg, var(--bg)))"
        : paintedBackground(cell),
      ink:
        style.getPropertyValue("--nota-cell-ink").trim() ||
        style.color ||
        "var(--doc-fg)",
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontStyle: style.fontStyle,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      error,
      selected: false,
    });
  }
  return boxes;
}

export function needsComputedPaint(table: HTMLTableElement, count: number): boolean {
  const marked = Array.from(
    table.querySelectorAll<HTMLTableCellElement>(".nota-sheet-computed"),
  );
  return (
    marked.length < count ||
    marked.some((cell) => cell.style.getPropertyValue("color") !== "transparent")
  );
}
