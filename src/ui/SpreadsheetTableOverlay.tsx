import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  api,
  events,
  on,
  type TableRenderPayload,
  type TableSnapshot,
} from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import {
  applyComputed,
  needsComputedPaint,
  recordTableExtensionContent,
} from "@/ui/table-computed";
import { snapshotForTable, tableIdentifier } from "@/ui/table-snapshot";

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
  tableId: string;
  tableRect: DOMRect;
  columns: HeaderBox[];
  rows: HeaderBox[];
  selection: Range;
  active: Point;
  box: { left: number; top: number; width: number; height: number };
  formulaTop: number;
  formulaWidth: number;
}

interface ReferenceBox {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  tone: number;
  range: boolean;
}

interface ReferencePreview {
  range: Range;
  box: ReferenceBox;
}

export interface FormulaReferenceInsertion {
  start: number;
  end: number;
}

interface FormulaToken {
  text: string;
  kind: "plain" | "reference" | "function";
  tone: number;
}

interface Props {
  visible: boolean;
  documentKey: string | number;
  run: (command: EditorCommand, payload?: CommandPayload) => void;
  onFormulaActiveChange?: (active: boolean) => void;
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

export function insertFormulaReference(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  range: Range,
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(value.length, selectionStart));
  const end = Math.max(start, Math.min(value.length, selectionEnd));
  const reference = rangeLabel(range);
  return {
    value: value.slice(0, start) + reference + value.slice(end),
    caret: start + reference.length,
  };
}

export function canReplaceFormulaReference(
  draft: string,
  selectionStart: number,
  selectionEnd: number,
  previous: FormulaReferenceInsertion | null,
): previous is FormulaReferenceInsertion {
  return Boolean(
    previous &&
      selectionStart === previous.end &&
      selectionEnd === previous.end &&
      previous.end === draft.length,
  );
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

function parseCellReference(reference: string): Point | null {
  const match = /^\$?([A-Za-z]+)\$?([1-9]\d*)$/.exec(reference);
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

const formulaReferenceSource =
  String.raw`\$?[A-Za-z]{1,4}\$?[1-9]\d*(?::\$?[A-Za-z]{1,4}\$?[1-9]\d*)?`;
const formulaTokenPattern = new RegExp(
  `(${formulaReferenceSource})(?=\\s*(?:[+\\-*/^&,)]|$))|([A-Za-z_][A-Za-z0-9_.]*)(?=\\s*\\()`,
  "g",
);

function referenceTone(
  reference: string,
  assignedTones: Map<string, number>,
): number {
  const key = reference.replaceAll("$", "").toUpperCase();
  const assigned = assignedTones.get(key);
  if (assigned !== undefined) return assigned;
  const tone = assignedTones.size % 7;
  assignedTones.set(key, tone);
  return tone;
}

export function formulaTokens(value: string): FormulaToken[] {
  if (!value.startsWith("=")) {
    return value ? [{ text: value, kind: "plain", tone: 0 }] : [];
  }
  const tokens: FormulaToken[] = [];
  const assignedTones = new Map<string, number>();
  let position = 0;
  for (const match of value.matchAll(formulaTokenPattern)) {
    const index = match.index ?? 0;
    if (index > position) tokens.push({ text: value.slice(position, index), kind: "plain", tone: 0 });
    const reference = match[1];
    tokens.push(
      reference
        ? { text: reference, kind: "reference", tone: referenceTone(reference, assignedTones) }
        : { text: match[0], kind: "function", tone: 0 },
    );
    position = index + match[0].length;
  }
  if (position < value.length) tokens.push({ text: value.slice(position), kind: "plain", tone: 0 });
  return tokens;
}

export function referenceBoxesFor(
  table: HTMLTableElement,
  draft: string,
): ReferenceBox[] {
  if (!draft.startsWith("=")) return [];
  const boxes: ReferenceBox[] = [];
  for (const [index, token] of formulaTokens(draft).entries()) {
    if (token.kind !== "reference") continue;
    const parts = token.text.replaceAll("$", "").split(":");
    const first = parseCellReference(parts[0] ?? "");
    if (!first) continue;
    const last = parseCellReference(parts[1] ?? parts[0] ?? "") ?? first;
    const top = Math.max(0, Math.min(first.row, last.row));
    const bottom = Math.min(table.rows.length - 1, Math.max(first.row, last.row));
    const columnCount = table.rows[0]?.cells.length ?? 0;
    const left = Math.max(0, Math.min(first.column, last.column));
    const right = Math.min(columnCount - 1, Math.max(first.column, last.column));
    const start = table.rows[top]?.cells[left]?.getBoundingClientRect();
    const end = table.rows[bottom]?.cells[right]?.getBoundingClientRect();
    if (!start || !end) continue;
    boxes.push({
      key: `${index}-${token.tone}-${token.text}`,
      left: Math.min(start.left, end.left),
      top: Math.min(start.top, end.top),
      width: Math.max(start.right, end.right) - Math.min(start.left, end.left),
      height: Math.max(start.bottom, end.bottom) - Math.min(start.top, end.top),
      tone: token.tone,
      range: parts.length > 1,
    });
  }
  return boxes;
}

export function isFormulaReferenceDraft(value: string): boolean {
  return /^\s*=/.test(value);
}

function referenceToneAt(
  draft: string,
  range: Range,
  start: number,
  end: number,
): number {
  const reference = rangeLabel(range);
  const preview = draft.slice(0, start) + reference + draft.slice(end);
  let position = 0;
  for (const token of formulaTokens(preview)) {
    if (token.kind === "reference" && position === start) return token.tone;
    position += token.text.length;
  }
  return 0;
}

function referencePreviewFor(
  table: HTMLTableElement,
  range: Range,
  draft: string,
  start: number,
  end: number,
): ReferencePreview | null {
  const startRect = table.rows[range.top]?.cells[range.left]?.getBoundingClientRect();
  const endRect = table.rows[range.bottom]?.cells[range.right]?.getBoundingClientRect();
  if (!startRect || !endRect) return null;
  const tone = referenceToneAt(draft, range, start, end);
  return {
    range,
    box: {
      key: `preview-${rangeLabel(range)}`,
      left: Math.min(startRect.left, endRect.left),
      top: Math.min(startRect.top, endRect.top),
      width: Math.max(startRect.right, endRect.right) - Math.min(startRect.left, endRect.left),
      height: Math.max(startRect.bottom, endRect.bottom) - Math.min(startRect.top, endRect.top),
      tone,
      range: true,
    },
  };
}

function snapshotFor(
  table: HTMLTableElement,
  documentKey: string | number,
  range: Range,
  active: Point,
): TableSnapshot | null {
  return snapshotForTable(table, documentKey, range, active);
}

function paintRange(table: HTMLTableElement, range: Range): void {
  for (const [rowIndex, row] of Array.from(table.rows).entries()) {
    for (const [columnIndex, cell] of Array.from(row.cells).entries()) {
      cell.classList.toggle(
        "nota-sheet-range",
        rowIndex >= range.top &&
          rowIndex <= range.bottom &&
          columnIndex >= range.left &&
          columnIndex <= range.right,
      );
    }
  }
}

function rangeCellCount(range: Range): number {
  return (range.bottom - range.top + 1) * (range.right - range.left + 1);
}

function rangeContains(range: Range, point: Point): boolean {
  return (
    point.row >= range.top &&
    point.row <= range.bottom &&
    point.column >= range.left &&
    point.column <= range.right
  );
}

function liveTables(tableId: string | undefined): HTMLTableElement[] {
  if (!tableId) return [];
  const index = Number(tableId.slice(tableId.lastIndexOf(":") + 1));
  if (!Number.isSafeInteger(index) || index < 0) return [];
  return Array.from(document.querySelectorAll<HTMLTableElement>(".ProseMirror table"))
    .filter((table) => {
      const root = table.closest(".ProseMirror");
      if (!root) return false;
      return Array.from(root.querySelectorAll("table")).indexOf(table) === index;
    });
}

function activeTableFor(layout: Layout): HTMLTableElement {
  return liveTables(layout.tableId)[0] ?? layout.table;
}

function boxForRange(table: HTMLTableElement, range: Range) {
  const firstRow = table.rows[0];
  const lastRow = table.rows[table.rows.length - 1];
  const startCell = table.rows[range.top]?.cells[range.left];
  const lastColumnCell = firstRow?.cells[firstRow.cells.length - 1];
  const stableStart =
    startCell?.getBoundingClientRect() ??
    table.rows[0]?.cells[0]?.getBoundingClientRect();
  const lastColumnRect = lastColumnCell?.getBoundingClientRect();
  const lastRowRect = lastRow?.getBoundingClientRect();
  if (!stableStart || !lastColumnRect || !lastRowRect) return null;
  const existingEnd = table.rows[range.bottom]?.cells[range.right]?.getBoundingClientRect();
  const endRight =
    existingEnd?.right ??
    lastColumnRect.right +
      (range.right - ((firstRow?.cells.length ?? 1) - 1)) * lastColumnRect.width;
  const endBottom =
    existingEnd?.bottom ??
    lastRowRect.bottom + (range.bottom - (table.rows.length - 1)) * lastRowRect.height;
  return {
    left: stableStart.left,
    top: stableStart.top,
    width: Math.max(0, endRight - stableStart.left),
    height: Math.max(0, endBottom - stableStart.top),
  };
}

function pointerPoint(
  table: HTMLTableElement,
  x: number,
  y: number,
): Point | null {
  const direct = cellPoint(document.elementFromPoint(x, y));
  if (direct) return direct;
  const first = table.rows[0]?.cells[0]?.getBoundingClientRect();
  const lastRow = table.rows[table.rows.length - 1];
  const lastCell = table.rows[0]?.cells[table.rows[0].cells.length - 1];
  const last = lastCell?.getBoundingClientRect();
  const bottom = lastRow?.getBoundingClientRect().bottom ?? 0;
  if (!first || !last) return null;
  if (x >= first.left && x <= last.right && y > bottom) {
    return {
      row: table.rows.length + Math.floor((y - bottom) / Math.max(1, lastRow!.getBoundingClientRect().height)),
      column: table.rows[0]!.cells[table.rows[0]!.cells.length - 1]!.cellIndex,
    };
  }
  if (y >= first.top && y <= bottom && x > last.right) {
    return {
      row: table.rows[table.rows.length - 1]!.rowIndex,
      column: table.rows[0]!.cells.length + Math.floor((x - last.right) / Math.max(1, last.width)),
    };
  }
  return null;
}

export function SpreadsheetTableOverlay({
  visible,
  documentKey,
  run,
  onFormulaActiveChange,
}: Props) {
  const t = useT();
  const [layout, setLayout] = useState<Layout | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const [draft, setDraft] = useState("");
  const [referenceBoxes, setReferenceBoxes] = useState<ReferenceBox[]>([]);
  const [referencePreview, setReferencePreview] = useState<ReferencePreview | null>(null);
  const [formulaComposing, setFormulaComposing] = useState(false);
  const anchor = useRef<Point | null>(null);
  const selection = useRef<Range | null>(null);
  const fillSource = useRef<Range | null>(null);
  const formulaInput = useRef<HTMLInputElement | null>(null);
  const formulaHighlight = useRef<HTMLDivElement | null>(null);
  const formulaActive = useRef(false);
  const formulaTarget = useRef<Point | null>(null);
  const referencing = useRef(false);
  const referenceRange = useRef<Range | null>(null);
  const referenceStart = useRef(0);
  const referenceEnd = useRef(0);
  const lastReferenceInsertion = useRef<FormulaReferenceInsertion | null>(null);
  const lastSnapshot = useRef("");
  const lastRender = useRef<TableRenderPayload | null>(null);
  const dragging = useRef(false);
  const filling = useRef(false);
  const contextSelectionFrozen = useRef(false);

  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  useLayoutEffect(() => {
    if (!visible) {
      formulaActive.current = false;
      formulaTarget.current = null;
      referenceRange.current = null;
      lastReferenceInsertion.current = null;
      setReferencePreview(null);
      lastSnapshot.current = "";
      setLayout(null);
      return;
    }
    let frame = 0;
    let polling = 0;
    let lastGeometry = "";
    const contextMenuOwnsFocus = () =>
      document.activeElement instanceof Element &&
      Boolean(document.activeElement.closest("[data-context-menu]"));
    const measure = () => {
      const selected = window.getSelection();
      const element =
        selected?.anchorNode instanceof Element
          ? selected.anchorNode
          : selected?.anchorNode?.parentElement ?? null;
      const table = element?.closest<HTMLTableElement>(".ProseMirror table");
      if (!table?.rows[0]?.cells[0]) {
        // Focusing the native formula input can temporarily move the browser
        // selection out of the table. Keep the overlay mounted while that input
        // owns the interaction, otherwise React unmounts it on pointer focus.
        if (
          formulaActive.current ||
          contextSelectionFrozen.current ||
          contextMenuOwnsFocus()
        ) {
          return;
        }
        setLayout(null);
        return;
      }
      const pane = table.closest<HTMLElement>(".editor-pane");
      const viewport = pane?.getBoundingClientRect();
      if (!viewport) {
        setLayout(null);
        return;
      }
      const banner = pane?.querySelector<HTMLElement>(".editor-frontmatter");
      const contentTop = Math.max(
        viewport.top,
        banner ? banner.getBoundingClientRect().bottom : viewport.top,
      );
      const tableRect = table.getBoundingClientRect();
      const active = cellPoint(element) ?? { row: 0, column: 0 };
      const range = selection.current ?? normalizeRange(active, active);
      paintRange(table, range);
      const currentTableId = tableIdentifier(table, documentKey);
      const render = lastRender.current;
      if (render?.tableId === currentTableId) {
        const tables = liveTables(currentTableId);
        for (const liveTable of tables.length > 0 ? tables : [table]) {
          if (needsComputedPaint(liveTable, Object.keys(render.cells).length)) {
            applyComputed(liveTable, render.cells);
          }
        }
      }
      const box = boxForRange(table, range);
      if (!box) return;
      const columns = Array.from(table.rows[0].cells).flatMap((cell, index) => {
        const rect = cell.getBoundingClientRect();
        const top = Math.max(contentTop, rect.top - 27);
        const bottom = Math.min(viewport.bottom, rect.top - 1);
        if (bottom <= top) return [];
        return [{
          index,
          label: columnLabel(index),
          left: Math.max(viewport.left, rect.left),
          top,
          width: Math.max(0, Math.min(rect.right, viewport.right) - Math.max(viewport.left, rect.left)),
          height: bottom - top,
        }];
      }).filter((column) => column.width > 0);
      const rows = Array.from(table.rows).flatMap((row, index) => {
        const rect = row.getBoundingClientRect();
        const top = Math.max(contentTop, rect.top);
        const bottom = Math.min(viewport.bottom, rect.bottom);
        if (bottom <= top) return [];
        return [{
          index,
          label: String(index + 1),
          left: Math.max(viewport.left, rect.left - 34),
          top,
          width: 33,
          height: bottom - top,
        }];
      });
      const visibleBox = {
        left: Math.max(viewport.left, box.left),
        top: Math.max(contentTop, box.top),
        right: Math.min(viewport.right, box.left + box.width),
        bottom: Math.min(viewport.bottom, box.top + box.height),
      };
      if (visibleBox.right <= visibleBox.left || visibleBox.bottom <= visibleBox.top) {
        setLayout(null);
        return;
      }
      setLayout({
        table,
        tableId: currentTableId,
        tableRect,
        columns,
        rows,
        selection: range,
        active,
        box: {
          left: visibleBox.left,
          top: visibleBox.top,
          width: visibleBox.right - visibleBox.left,
          height: visibleBox.bottom - visibleBox.top,
        },
        formulaTop: Math.max(
          contentTop + 4,
          Math.min(viewport.bottom - 30, tableRect.top - 62),
        ),
        formulaWidth: Math.max(
          280,
          Math.min(viewport.right, window.innerWidth) -
            Math.max(viewport.left, tableRect.left) -
            8,
        ),
      });
      if (
        !formulaActive.current ||
        formulaTarget.current?.row !== active.row ||
        formulaTarget.current?.column !== active.column
      ) {
        setDraft(activeCell(table, active)?.textContent ?? "");
      }
    };
    const syncGeometry = () => {
      const selected = window.getSelection();
      const element =
        selected?.anchorNode instanceof Element
          ? selected.anchorNode
          : selected?.anchorNode?.parentElement ?? null;
      const table = element?.closest<HTMLTableElement>(".ProseMirror table");
      const rect = table?.getBoundingClientRect();
      const geometry = rect
        ? `${rect.left}:${rect.top}:${rect.width}:${rect.height}:${window.innerWidth}`
        : "none";
      if (geometry === lastGeometry) return;
      lastGeometry = geometry;
      frame = 0;
      measure();
    };
    const publishSnapshot = () => {
      const current = layoutRef.current;
      if (!current) return;
      const table = activeTableFor(current);
      const selected = window.getSelection();
      const element =
        selected?.anchorNode instanceof Element
          ? selected.anchorNode
          : selected?.anchorNode?.parentElement ?? null;
      const active = cellPoint(element) ?? current.active;
      const range = selection.current ?? current.selection;
      const snapshot = snapshotFor(table, documentKey, range, active);
      if (!snapshot) return;
      const signature = JSON.stringify(snapshot);
      if (signature === lastSnapshot.current) return;
      lastSnapshot.current = signature;
      void api.table.syncSnapshot(snapshot);
    };
    const poll = () => {
      syncGeometry();
      const liveLayout = layoutRef.current;
      const table = liveLayout ? activeTableFor(liveLayout) : null;
      if (
        table &&
        selection.current &&
        table.querySelectorAll(".nota-sheet-range").length !==
          rangeCellCount(selection.current)
      ) {
        paintRange(table, selection.current);
      }
      const render = lastRender.current;
      if (render) {
        for (const liveTable of liveTables(render.tableId)) {
          if (needsComputedPaint(liveTable, Object.keys(render.cells).length)) {
            applyComputed(liveTable, render.cells);
          }
        }
      }
      publishSnapshot();
      polling = requestAnimationFrame(poll);
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          measure();
          publishSnapshot();
        });
      }
    };
    schedule();
    polling = requestAnimationFrame(poll);
    document.addEventListener("selectionchange", schedule);
    const editorRoot = document.querySelector(".ProseMirror") ?? document.body;
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => !(record.target instanceof Element) ||
        Boolean((record.target as Element).closest("table")))) {
        schedule();
      }
    });
    mutations.observe(editorRoot, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (polling) cancelAnimationFrame(polling);
      mutations.disconnect();
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [visible, documentKey]);

  useEffect(() => {
    if (!visible || !layout) return;
    const tableId = tableIdentifier(layout.table, documentKey);
    if (lastRender.current?.tableId === tableId) {
      const targets = liveTables(tableId);
      for (const table of targets.length > 0 ? targets : [layout.table]) {
        applyComputed(table, lastRender.current.cells);
      }
    }
    const snapshot = snapshotFor(
      layout.table,
      documentKey,
      layout.selection,
      layout.active,
    );
    if (!snapshot) return;
    const signature = JSON.stringify(snapshot);
    if (signature === lastSnapshot.current) return;
    lastSnapshot.current = signature;
    void api.table.syncSnapshot(snapshot);
  }, [documentKey, layout, visible]);

  useEffect(() => {
    if (formulaActive.current && isFormulaReferenceDraft(draft)) return;
    referenceRange.current = null;
    setReferencePreview(null);
  }, [draft]);

  useLayoutEffect(() => {
    if (!visible || !layout) {
      setReferenceBoxes([]);
      return;
    }
    let frame = 0;
    frame = requestAnimationFrame(() => {
      setReferenceBoxes(referenceBoxesFor(activeTableFor(layout), draft));
    });
    return () => cancelAnimationFrame(frame);
  }, [draft, layout, visible]);

  useEffect(() => {
    if (!visible || !layout) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void on<TableRenderPayload>(events.tableRender, (payload) => {
      if (disposed || payload.documentId !== Number(documentKey)) return;
      recordTableExtensionContent(
        payload.documentId,
        payload.tableId,
        payload.extensionContent,
      );
      const tableId = tableIdentifier(layout.table, documentKey);
      if (payload.tableId !== tableId) return;
      lastRender.current = payload;
      const tables = liveTables(tableId);
      const appliedTables = tables.length > 0 ? tables : [layout.table];
      for (const liveTable of appliedTables) {
        applyComputed(liveTable, payload.cells);
      }
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [documentKey, layout, visible]);

  useEffect(() => {
    if (!visible || !layout) return;
    const updateFromPointer = (event: PointerEvent) => {
      const table = activeTableFor(layout);
      const point = pointerPoint(table, event.clientX, event.clientY);
      if (!point || !anchor.current) return null;
      selection.current = normalizeRange(anchor.current, point);
      paintRange(table, selection.current);
      setLayout((current) => {
        if (!current) return current;
        const box = boxForRange(table, selection.current!);
        return box ? { ...current, selection: selection.current!, active: anchor.current!, box } : current;
      });
      return point;
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!(event.target instanceof Element) || !event.target.closest("[data-context-menu]")) {
        contextSelectionFrozen.current = false;
      }
      const table = activeTableFor(layout);
      const point = cellPoint(event.target as Element);
      if (!point) return;
      if (
        formulaActive.current &&
        formulaTarget.current &&
        isFormulaReferenceDraft(draftRef.current)
      ) {
        if (
          point.row === formulaTarget.current.row &&
          point.column === formulaTarget.current.column
        ) {
          event.preventDefault();
          event.stopPropagation();
          requestAnimationFrame(() => formulaInput.current?.focus({ preventScroll: true }));
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        anchor.current = point;
        referenceRange.current = normalizeRange(point, point);
        const input = formulaInput.current;
        const selectionStart = input?.selectionStart ?? draftRef.current.length;
        const selectionEnd = input?.selectionEnd ?? draftRef.current.length;
        if (
          canReplaceFormulaReference(
            draftRef.current,
            selectionStart,
            selectionEnd,
            lastReferenceInsertion.current,
          )
        ) {
          referenceStart.current = lastReferenceInsertion.current.start;
          referenceEnd.current = lastReferenceInsertion.current.end;
        } else {
          referenceStart.current = selectionStart;
          referenceEnd.current = selectionEnd;
        }
        setReferencePreview(
          referencePreviewFor(
            table,
            referenceRange.current,
            draftRef.current,
            referenceStart.current,
            referenceEnd.current,
          ),
        );
        dragging.current = true;
        referencing.current = true;
        filling.current = false;
        requestAnimationFrame(() => formulaInput.current?.focus({ preventScroll: true }));
        return;
      }
      event.preventDefault();
      anchor.current = point;
      selection.current = normalizeRange(point, point);
      paintRange(table, selection.current);
      dragging.current = true;
      filling.current = false;
      setDraft(activeCell(table, point)?.textContent ?? "");
      setLayout((current) => {
        if (!current) return current;
        const box = boxForRange(table, selection.current!);
        return box
          ? { ...current, selection: selection.current!, active: point, box }
          : current;
      });
    };
    const move = (event: PointerEvent) => {
      if (!dragging.current && !filling.current) return;
      if (referencing.current && formulaTarget.current && formulaActive.current) {
        const table = activeTableFor(layout);
        const point = pointerPoint(table, event.clientX, event.clientY);
        if (!point || !anchor.current) return;
        event.preventDefault();
        event.stopPropagation();
        referenceRange.current = normalizeRange(anchor.current, point);
        setReferencePreview(
          referencePreviewFor(
            table,
            referenceRange.current,
            draftRef.current,
            referenceStart.current,
            referenceEnd.current,
          ),
        );
        return;
      }
      const point = updateFromPointer(event);
      if (point && (point.row !== anchor.current?.row || point.column !== anchor.current?.column)) {
        event.preventDefault();
      }
    };
    const up = (event: PointerEvent) => {
      if (
        referencing.current &&
        referenceRange.current &&
        formulaInput.current &&
        isFormulaReferenceDraft(draftRef.current)
      ) {
        event.preventDefault();
        event.stopPropagation();
        const input = formulaInput.current;
        const released = insertFormulaReference(
          draftRef.current,
          referenceStart.current,
          referenceEnd.current,
          referenceRange.current,
        );
        draftRef.current = released.value;
        setDraft(released.value);
        lastReferenceInsertion.current = {
          start: referenceStart.current,
          end: released.caret,
        };
        referenceRange.current = null;
        setReferencePreview(null);
        referencing.current = false;
        dragging.current = false;
        requestAnimationFrame(() => {
          input.focus({ preventScroll: true });
          input.setSelectionRange(released.caret, released.caret);
        });
        return;
      }
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
        run("tableSelectRange", {
          tableRow: range.top,
          tableColumn: range.left,
          tableToRow: range.bottom,
          tableToColumn: range.right,
        });
      }
      dragging.current = false;
      filling.current = false;
      referencing.current = false;
      referenceRange.current = null;
      setReferencePreview(null);
    };
    const preserveSecondarySelection = (event: MouseEvent) => {
      if (event.button !== 2 || !selection.current) return;
      const point = cellPoint(event.target as Element);
      if (!point || !rangeContains(selection.current, point)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const preserveFormulaFocus = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        !formulaActive.current ||
        !formulaTarget.current ||
        !isFormulaReferenceDraft(draftRef.current)
      ) {
        return;
      }
      const point = cellPoint(event.target as Element);
      if (!point) return;
      event.preventDefault();
      event.stopPropagation();
      requestAnimationFrame(() => formulaInput.current?.focus({ preventScroll: true }));
    };
    const preserveContextSelection = (event: MouseEvent) => {
      if (!selection.current) return;
      const point = cellPoint(event.target as Element);
      if (!point || !rangeContains(selection.current, point)) return;
      contextSelectionFrozen.current = true;
      event.preventDefault();
      event.stopPropagation();
      requestAnimationFrame(() => {
        const range = selection.current;
        if (!range) return;
        run("tableSelectRange", {
          tableRow: range.top,
          tableColumn: range.left,
          tableToRow: range.bottom,
          tableToColumn: range.right,
        });
      });
    };
    const restoreFrozenSelection = (event: FocusEvent) => {
      const target = event.target;
      if (
        !selection.current ||
        !(target instanceof Element) ||
        !target.closest("[data-context-menu]")
      ) {
        return;
      }
      window.setTimeout(() => {
        const range = selection.current;
        if (!range) return;
        run("tableSelectRange", {
          tableRow: range.top,
          tableColumn: range.left,
          tableToRow: range.bottom,
          tableToColumn: range.right,
        });
      }, 0);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("mousedown", preserveSecondarySelection, true);
    window.addEventListener("mousedown", preserveFormulaFocus, true);
    document.addEventListener("contextmenu", preserveContextSelection, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    document.addEventListener("focusin", restoreFrozenSelection, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("mousedown", preserveSecondarySelection, true);
      window.removeEventListener("mousedown", preserveFormulaFocus, true);
      document.removeEventListener("contextmenu", preserveContextSelection, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      document.removeEventListener("focusin", restoreFrozenSelection, true);
    };
  }, [layout, run, visible]);

  if (!visible || !layout) return null;

  const commit = () => {
    const target = formulaTarget.current ?? layout.active;
    run("tableSetCell", {
      tableRow: target.row,
      tableColumn: target.column,
      tableText: draft,
    });
  };
  const width = layout.formulaWidth;
  const formulaLeft = Math.max(8, Math.min(layout.tableRect.left, window.innerWidth - width - 8));
  const highlightTokens = formulaTokens(draft);
  const applyLocalRange = (range: Range, active: Point) => {
    const table = activeTableFor(layout);
    const tableId = tableIdentifier(table, documentKey);
    selection.current = range;
    anchor.current = active;
    paintRange(table, range);
    setLayout((current) => {
      if (!current) return current;
      const box = boxForRange(table, range);
      return box
        ? { ...current, table, tableId, selection: range, active, box }
        : current;
    });
    setDraft(activeCell(table, active)?.textContent ?? "");
  };

  return createPortal(
    <>
      <div
        className="sheet-formula-bar"
        style={{ top: layout.formulaTop, left: formulaLeft, width }}
        onMouseDown={(event) => {
          if (event.target === formulaInput.current) return;
          event.preventDefault();
          formulaInput.current?.focus();
        }}
      >
        <span className="sheet-reference">{rangeLabel(layout.selection)}</span>
        <span className="sheet-formula-mark" aria-hidden="true">fx</span>
        <div className="sheet-formula-input-shell">
          <div
            ref={formulaHighlight}
            className="sheet-formula-highlight"
            aria-hidden="true"
            style={{ opacity: formulaComposing ? 0 : 1 }}
          >
            {highlightTokens.map((token, index) => (
              <span
                key={`${index}-${token.kind}`}
                className={`sheet-formula-token sheet-formula-${token.kind} sheet-tone-${token.tone}`}
              >
                {token.text}
              </span>
            ))}
          </div>
          <input
            ref={formulaInput}
            value={draft}
            aria-label={t("Cell contents")}
            style={{ color: formulaComposing ? "var(--fg)" : "transparent" }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onFocus={() => {
              formulaActive.current = true;
              formulaTarget.current = layout.active;
              onFormulaActiveChange?.(true);
            }}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              lastReferenceInsertion.current = null;
              setDraft(event.target.value);
            }}
            onCompositionStart={() => setFormulaComposing(true)}
            onCompositionEnd={() => {
              requestAnimationFrame(() => setFormulaComposing(false));
            }}
            onScroll={(event) => {
              if (formulaHighlight.current) {
                formulaHighlight.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
              }
            }}
            onBlur={() => {
              formulaActive.current = false;
              onFormulaActiveChange?.(false);
              commit();
              formulaTarget.current = null;
              referenceRange.current = null;
              lastReferenceInsertion.current = null;
              setReferencePreview(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </div>
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
            const range = {
              top: 0,
              bottom: layout.table.rows.length - 1,
              left: column.index,
              right: column.index,
            };
            formulaInput.current?.blur();
            applyLocalRange(range, { row: 0, column: column.index });
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
            const range = {
              top: row.index,
              bottom: row.index,
              left: 0,
              right: layout.table.rows[0]?.cells.length
                ? layout.table.rows[0].cells.length - 1
                : 0,
            };
            formulaInput.current?.blur();
            applyLocalRange(range, { row: row.index, column: 0 });
            run("tableSelectRow", { tableRow: row.index });
          }}
        >
          {row.label}
        </button>
      ))}
      {referenceBoxes.map((box) => (
        <div
          key={box.key}
          className={`sheet-reference-box sheet-tone-${box.tone}${
            box.range ? " is-range" : ""
          }`}
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
          }}
        />
      ))}
      {referencePreview && (
        <div
          className={`sheet-reference-box is-preview sheet-tone-${referencePreview.box.tone}`}
          style={{
            left: referencePreview.box.left,
            top: referencePreview.box.top,
            width: referencePreview.box.width,
            height: referencePreview.box.height,
          }}
        />
      )}
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
