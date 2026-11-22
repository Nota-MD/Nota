

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useT } from "@/i18n";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import { Icon } from "@/ui/Icon";
import { PersistentTableComputedOverlay } from "@/ui/PersistentTableComputedOverlay";
import { SpreadsheetTableOverlay } from "@/ui/SpreadsheetTableOverlay";

interface Props {
  visible: boolean;
  documentKey: string | number;
  run: (command: EditorCommand, payload?: CommandPayload) => void;
  spreadsheet: boolean;
  spreadsheetPersistent: boolean;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

export function TableToolbar({
  visible,
  documentKey,
  run,
  spreadsheet,
  spreadsheetPersistent,
}: Props) {
  const t = useT();
  const [position, setPosition] = useState<Position | null>(null);
  const [current, setCurrent] = useState({ columns: 0, rows: 0 });
  const [picker, setPicker] = useState(false);
  const [hover, setHover] = useState(current);
  const spreadsheetEditing = useRef(false);
  const cells = useMemo(
    () => Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, column) => ({ row: row + 1, column: column + 1 }))),
    [],
  );

  useLayoutEffect(() => {
    if (!visible) {
      spreadsheetEditing.current = false;
      setPosition(null);
      setPicker(false);
      return;
    }
    let frame = 0;
    let polling = 0;
    let lastGeometry = "";
    const standaloneImmediatelyFixedPosition = () => {
      frame = 0;
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const element =
        anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      const table = element?.closest<HTMLTableElement>(".ProseMirror table");
      if (!table) {
        if (spreadsheetEditing.current) return;
        setPosition(null);
        return;
      }
      const rect = table.getBoundingClientRect();
      const pane = table.closest<HTMLElement>(".editor-pane");
      const paneRect = pane?.getBoundingClientRect();
      const banner = pane?.querySelector<HTMLElement>(".editor-frontmatter");
      const topBoundary = Math.max(
        paneRect?.top ?? 0,
        banner ? banner.getBoundingClientRect().bottom : (paneRect?.top ?? 0),
      );
      const columns = table.rows[0]?.cells.length ?? 0;
      const rows = table.rows.length;
      setCurrent({ columns, rows });
      setHover({ columns, rows });
      const width = Math.max(
        180,
        Math.min(rect.width, window.innerWidth - 16),
      );
      setPosition({
        top: Math.max(
          topBoundary + 4,
          rect.top >= (spreadsheet ? 104 : 44)
            ? rect.top - (spreadsheet ? 96 : 34)
            : rect.bottom + 4,
        ),
        left: Math.max(
          8,
          Math.min(rect.left, window.innerWidth - width - 8),
        ),
        width,
      });
    };
    const syncGeometry = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const element =
        anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      const table = element?.closest<HTMLTableElement>(".ProseMirror table");
      const rect = table?.getBoundingClientRect();
      const geometry = rect
        ? `${rect.left}:${rect.top}:${rect.width}:${rect.height}:${window.innerWidth}`
        : "none";
      if (geometry === lastGeometry) return;
      lastGeometry = geometry;
      standaloneImmediatelyFixedPosition();
    };
    const poll = () => {
      syncGeometry();
      polling = requestAnimationFrame(poll);
    };
    const locate = () => {
      if (frame) return;
      frame = requestAnimationFrame(standaloneImmediatelyFixedPosition);
    };
    locate();
    polling = requestAnimationFrame(poll);
    document.addEventListener("selectionchange", locate);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (polling) cancelAnimationFrame(polling);
      document.removeEventListener("selectionchange", locate);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [visible, documentKey, spreadsheet]);

  const persistentComputed = (
    <PersistentTableComputedOverlay
      active={spreadsheetPersistent && Boolean(documentKey)}
      documentKey={documentKey}
    />
  );
  if (!visible || !position) return persistentComputed;

  const action = (command: EditorCommand, payload?: CommandPayload) => {
    run(command, payload);
    setPicker(false);
  };

  return (
    <>
      {persistentComputed}
      {spreadsheet && (
        <SpreadsheetTableOverlay
          visible={visible}
          documentKey={documentKey}
          run={run}
          onFormulaActiveChange={(active) => {
            spreadsheetEditing.current = active;
          }}
        />
      )}
      {createPortal(
        <div
          className="table-toolbar"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
          }}
          onMouseDown={(event) => event.preventDefault()}
          role="toolbar"
          aria-label={t("Table")}
        >
      <button
        type="button"
        className="table-toolbar-btn"
        title={t("Adjust table size")}
        aria-label={t("Adjust table size")}
        aria-expanded={picker}
        onClick={() => setPicker((open) => !open)}
      >
        <span className="table-grid-glyph" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </button>
      <button
        type="button"
        className="table-toolbar-btn"
        title={t("Align current column left")}
        aria-label={t("Align current column left")}
        onClick={() => action("tableAlignLeft")}
      >
        <span className="table-align-glyph is-left" aria-hidden="true"><i /><i /><i /></span>
      </button>
      <button
        type="button"
        className="table-toolbar-btn"
        title={t("Align current column center")}
        aria-label={t("Align current column center")}
        onClick={() => action("tableAlignCenter")}
      >
        <span className="table-align-glyph is-center" aria-hidden="true"><i /><i /><i /></span>
      </button>
      <button
        type="button"
        className="table-toolbar-btn"
        title={t("Align current column right")}
        aria-label={t("Align current column right")}
        onClick={() => action("tableAlignRight")}
      >
        <span className="table-align-glyph is-right" aria-hidden="true"><i /><i /><i /></span>
      </button>
      <span className="table-toolbar-gap" />
      <button
        type="button"
        className="table-toolbar-btn is-danger"
        title={t("Delete Table")}
        aria-label={t("Delete Table")}
        onClick={() => action("tableDel")}
      >
        <Icon name="folio-delete-symbolic" />
      </button>

          {picker && (
            <div className="table-size-picker">
              <div className="table-size-grid" onMouseLeave={() => setHover(current)}>
                {cells.map((row) =>
                  row.map(({ row: rows, column: columns }) => (
                    <button
                      type="button"
                      key={`${columns}x${rows}`}
                      className={
                        columns <= hover.columns && rows <= hover.rows ? "is-active" : ""
                      }
                      aria-label={`${columns} × ${rows}`}
                      onMouseEnter={() => setHover({ columns, rows })}
                      onFocus={() => setHover({ columns, rows })}
                      onClick={() => action("tableResize", { columns, rows })}
                    />
                  )),
                )}
              </div>
              <div className="table-size-label">
                {hover.columns} × {hover.rows}
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
