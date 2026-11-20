import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useT } from "@/i18n";
import type { CommandPayload, EditorCommand } from "@/editor/create";

interface Point {
  row: number;
  column: number;
}

interface Range {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

interface HeaderBox {
  index: number;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Layout {
  table: HTMLTableElement;
  tableRect: DOMRect;
  columns: HeaderBox[];
  rows: HeaderBox[];
  selection: Range;
  active: Point;
  box: { left: number; top: number; width: number; height: number };
  formulaTop: number;
}

interface Props {
  visible: boolean;
  documentKey: string | number;
  run: (command: EditorCommand, payload?: CommandPayload) => void;
}

export function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const digit = (value - 1) % 26;
    label = String.fromCharCode(65 + digit) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export function cellLabel(point: Point): string {
  return `${columnLabel(point.column)}${point.row + 1}`;
}

function normalizeRange(anchor: Point, head: Point): Range {
  return {
    top: Math.min(anchor.row, head.row),
    left: Math.min(anchor.column, head.column),
    bottom: Math.max(anchor.row, head.row),
    right: Math.max(anchor.column, head.column),
  };
}

function rangeLabel(range: Range): string {
  const start = cellLabel({ row: range.top, column: range.left });
  const end = cellLabel({ row: range.bottom, column: range.right });
  return start === end ? start : `${start}:${end}`;
}

function cellPoint(element: Element | null): Point | null {
  const cell = element?.closest<HTMLTableCellElement>("td, th");
  const row = cell?.parentElement as HTMLTableRowElement | null;
  const table = cell?.closest("table");
  if (!cell || !row || !table) return null;
  return { row: row.rowIndex, column: cell.cellIndex };
}

function activeCell(table: HTMLTableElement, point: Point): HTMLTableCellElement | null {
  return table.rows[point.row]?.cells[point.column] ?? null;
}

function boxForRange(table: HTMLTableElement, range: Range) {
  const start = table.rows[range.top]?.cells[range.left]?.getBoundingClientRect();
  const end = table.rows[range.bottom]?.cells[range.right]?.getBoundingClientRect();
  if (!start || !end) return null;
  return {
    left: Math.min(start.left, end.left),
    top: Math.min(start.top, end.top),
    width: Math.abs(end.right - start.left),
    height: Math.abs(end.bottom - start.top),
  };
}

export function SpreadsheetTableOverlay({ visible, documentKey, run }: Props) {
  const t = useT();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [draft, setDraft] = useState("");
  const anchor = useRef<Point | null>(null);
  const selection = useRef<Range | null>(null);
  const fillSource = useRef<Range | null>(null);
  const dragging = useRef(false);
  const filling = useRef(false);

  useLayoutEffect(() => {
    if (!visible) {
      setLayout(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const selected = window.getSelection();
      const element =
        selected?.anchorNode instanceof Element
          ? selected.anchorNode
          : selected?.anchorNode?.parentElement ?? null;
      const table = element?.closest<HTMLTableElement>(".ProseMirror table");
      if (!table?.rows[0]?.cells[0]) {
        setLayout(null);
        return;
      }
      const tableRect = table.getBoundingClientRect();
      const active = cellPoint(element) ?? { row: 0, column: 0 };
      const range = selection.current ?? normalizeRange(active, active);
      const box = boxForRange(table, range);
      if (!box) return;
      const columns = Array.from(table.rows[0].cells).map((cell, index) => {
        const rect = cell.getBoundingClientRect();
        return {
          index,
          label: columnLabel(index),
          left: rect.left,
          top: rect.top - 27,
          width: rect.width,
          height: 26,
        };
      });
      const rows = Array.from(table.rows).map((row, index) => {
        const rect = row.getBoundingClientRect();
        return {
          index,
          label: String(index + 1),
          left: rect.left - 34,
          top: rect.top,
          width: 33,
          height: rect.height,
        };
      });
      setLayout({
        table,
        tableRect,
        columns,
        rows,
        selection: range,
        active,
        box,
        formulaTop: Math.max(4, tableRect.top - 62),
      });
      setDraft(activeCell(table, active)?.textContent ?? "");
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [visible, documentKey]);

  useEffect(() => {
    if (!visible || !layout) return;
    const table = layout.table;
    const updateFromPointer = (event: PointerEvent) => {
      const point = cellPoint(document.elementFromPoint(event.clientX, event.clientY));
      if (!point || !anchor.current) return null;
      selection.current = normalizeRange(anchor.current, point);
      setLayout((current) => {
        if (!current) return current;
        const box = boxForRange(table, selection.current!);
        return box ? { ...current, selection: selection.current!, active: anchor.current!, box } : current;
      });
      return point;
    };
    const down = (event: PointerEvent) => {
      const point = cellPoint(event.target as Element);
      if (!point) return;
      anchor.current = point;
      selection.current = normalizeRange(point, point);
      dragging.current = true;
      filling.current = false;
      setDraft(activeCell(table, point)?.textContent ?? "");
    };
    const move = (event: PointerEvent) => {
      if (!dragging.current && !filling.current) return;
      const point = updateFromPointer(event);
      if (point && (point.row !== anchor.current?.row || point.column !== anchor.current?.column)) {
        event.preventDefault();
      }
    };
    const up = () => {
      if (filling.current && layout && selection.current) {
        const source = fillSource.current;
        const range = selection.current;
        if (!source) return;
        run("tableFill", {
          tableRow: source.top,
          tableColumn: source.left,
          tableToRow: source.bottom,
          tableToColumn: source.right,
          tableFillRow: range.bottom,
          tableFillColumn: range.right,
        });
      } else if (dragging.current && selection.current) {
        const range = selection.current;
        if (range.top !== range.bottom || range.left !== range.right) {
          run("tableSelectRange", {
            tableRow: range.top,
            tableColumn: range.left,
            tableToRow: range.bottom,
            tableToColumn: range.right,
          });
        }
      }
      dragging.current = false;
      filling.current = false;
    };
    table.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      table.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [layout, run, visible]);

  if (!visible || !layout) return null;

  const commit = () => {
    run("tableSetCell", {
      tableRow: layout.active.row,
      tableColumn: layout.active.column,
      tableText: draft,
    });
  };
  const width = Math.max(280, layout.tableRect.width);
  const formulaLeft = Math.max(8, Math.min(layout.tableRect.left, window.innerWidth - width - 8));

  return createPortal(
    <>
      <div
        className="sheet-formula-bar"
        style={{ top: layout.formulaTop, left: formulaLeft, width }}
      >
        <span className="sheet-reference">{rangeLabel(layout.selection)}</span>
        <span className="sheet-formula-mark" aria-hidden="true">fx</span>
        <input
          value={draft}
          aria-label={t("Cell contents")}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      {layout.columns.map((column) => (
        <button
          key={column.index}
          type="button"
          className={`sheet-header sheet-column-header${
            column.index >= layout.selection.left && column.index <= layout.selection.right
              ? " is-selected"
              : ""
          }`}
          style={{ left: column.left, top: column.top, width: column.width, height: column.height }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            selection.current = {
              top: 0,
              bottom: layout.rows.length - 1,
              left: column.index,
              right: column.index,
            };
            anchor.current = { row: 0, column: column.index };
            run("tableSelectColumn", { tableColumn: column.index });
          }}
        >
          {column.label}
        </button>
      ))}
      {layout.rows.map((row) => (
        <button
          key={row.index}
          type="button"
          className={`sheet-header sheet-row-header${
            row.index >= layout.selection.top && row.index <= layout.selection.bottom
              ? " is-selected"
              : ""
          }`}
          style={{ left: row.left, top: row.top, width: row.width, height: row.height }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            selection.current = {
              top: row.index,
              bottom: row.index,
              left: 0,
              right: layout.columns.length - 1,
            };
            anchor.current = { row: row.index, column: 0 };
            run("tableSelectRow", { tableRow: row.index });
          }}
        >
          {row.label}
        </button>
      ))}
      <div
        className="sheet-range-box"
        style={{
          left: layout.box.left,
          top: layout.box.top,
          width: layout.box.width,
          height: layout.box.height,
        }}
      >
        <button
          type="button"
          className="sheet-fill-handle"
          aria-label={t("Fill selected cells")}
          title={t("Fill selected cells")}
          onPointerDown={(event) => {
            event.preventDefault();
            filling.current = true;
            dragging.current = false;
            anchor.current = { row: layout.selection.top, column: layout.selection.left };
            selection.current = layout.selection;
            fillSource.current = layout.selection;
          }}
        />
      </div>
    </>,
    document.body,
  );
}
