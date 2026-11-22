import type { TableSnapshot } from "@/bridge/ipc";

export function tableIdentifier(
  table: HTMLTableElement,
  documentKey: string | number,
): string {
  const pane = table.closest(".ProseMirror");
  const index = pane
    ? Array.from(pane.querySelectorAll<HTMLTableElement>("table")).indexOf(table)
    : -1;
  return `${String(documentKey)}:${Math.max(0, index)}`;
}

export function snapshotForTable(
  table: HTMLTableElement,
  documentKey: string | number,
  selection: TableSnapshot["selection"],
  active: TableSnapshot["active"],
): TableSnapshot | null {
  const documentId = typeof documentKey === "number" ? documentKey : Number(documentKey);
  if (!Number.isSafeInteger(documentId)) return null;
  const tableId = tableIdentifier(table, documentKey);
  table.dataset.notaTableId = tableId;
  return {
    documentId,
    tableId,
    rows: Array.from(table.rows, (row) =>
      Array.from(row.cells, (cell) => cell.textContent ?? ""),
    ),
    selection,
    active,
  };
}
