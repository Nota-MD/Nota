/**
 * Shapes shared by the active-table bridge and table-capable extensions.
 *
 * Rows and cell text always describe the Markdown source. `TableRender` is a
 * temporary display map and never changes the document.
 */

export interface TablePoint {
  row: number;
  column: number;
}

export interface TableRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface TableSnapshot {
  documentId: number;
  tableId: string;
  rows: string[][];
  selection: TableRange;
  active: TablePoint;
}

export interface TableCellUpdate extends TablePoint {
  text: string;
}

export interface TableRenderPayload {
  plugin: string;
  documentId: number;
  tableId: string;
  cells: Record<string, string>;
  extensionContent: boolean;
}

export interface TableWritePayload {
  plugin: string;
  documentId: number;
  tableId: string;
  cells: TableCellUpdate[];
}

export interface TableContextAction {
  plugin: string;
  id: string;
  label: string;
  command: string;
}
