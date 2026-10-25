/** 当前表格上方的快捷工具栏：调整尺寸、对齐与删除。 */

import { useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useT } from "@/i18n";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import { Icon } from "@/ui/Icon";

interface Props {
  visible: boolean;
  documentKey: string | number;
  run: (command: EditorCommand, payload?: CommandPayload) => void;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

export function TableToolbar({ visible, documentKey, run }: Props) {
  const t = useT();
  const [position, setPosition] = useState<Position | null>(null);
  const [current, setCurrent] = useState({ columns: 0, rows: 0 });
  const [picker, setPicker] = useState(false);
  const [hover, setHover] = useState(current);
  const cells = useMemo(
    () => Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, column) => ({ row: row + 1, column: column + 1 }))),
    [],
  );

  useLayoutEffect(() => {
    if (!visible) {
      setPosition(null);
      setPicker(false);
      return;
    }
    let frame = 0;
    const standaloneImmediatelyFixedPosition = () => {
      frame = 0;
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const element =
        anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      const table = element?.closest<HTMLTableElement>(".ProseMirror table");
      if (!table) {
        setPosition(null);
        return;
      }
      const rect = table.getBoundingClientRect();
      const columns = table.rows[0]?.cells.length ?? 0;
      const rows = table.rows.length;
      setCurrent({ columns, rows });
      setHover({ columns, rows });
      const width = Math.max(
        180,
        Math.min(rect.width, window.innerWidth - 16),
      );
      setPosition({
        top: rect.top >= 44 ? rect.top - 34 : rect.bottom + 4,
        left: Math.max(
          8,
          Math.min(rect.left, window.innerWidth - width - 8),
        ),
        width,
      });
    };
    const locate = () => {
      if (frame) return;
      frame = requestAnimationFrame(standaloneImmediatelyFixedPosition);
    };
    locate();
    document.addEventListener("selectionchange", locate);
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", locate, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", locate);
      window.removeEventListener("resize", locate);
      window.removeEventListener("scroll", locate, true);
    };
  }, [visible, documentKey]);

  if (!visible || !position) return null;

  const action = (command: EditorCommand, payload?: CommandPayload) => {
    run(command, payload);
    setPicker(false);
  };

  return createPortal(
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
  );
}
