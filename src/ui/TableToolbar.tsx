import { useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { CommandPayload, EditorCommand } from "@/editor/create";
import { useT } from "@/i18n";
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

const moreCommands: Array<{
  id: EditorCommand;
  label: string;
  separator?: boolean;
}> = [
  { id: "tableRowAbove", label: "Add Row Above" },
  { id: "tableRowBelow", label: "Add Row Below" },
  { id: "tableColLeft", label: "Add Column Before" },
  { id: "tableColRight", label: "Add Column After" },
  { id: "tableMoveRowUp", label: "Move Row Up", separator: true },
  { id: "tableMoveRowDown", label: "Move Row Down" },
  { id: "tableMoveColLeft", label: "Move Column Left" },
  { id: "tableMoveColRight", label: "Move Column Right" },
  { id: "tableDelRow", label: "Delete Row", separator: true },
  { id: "tableDelCol", label: "Delete Column" },
  { id: "tableCopy", label: "Copy Table", separator: true },
  { id: "tableFormat", label: "Format Table Source" },
  { id: "tableDel", label: "Delete Table", separator: true },
];

export function TableToolbar({ visible, documentKey, run }: Props) {
  const t = useT();
  const [position, setPosition] = useState<Position | null>(null);
  const [current, setCurrent] = useState({ columns: 0, rows: 0 });
  const [picker, setPicker] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreUp, setMoreUp] = useState(false);
  const [hover, setHover] = useState(current);
  const cells = useMemo(
    () =>
      Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 8 }, (_, column) => ({
          row: row + 1,
          column: column + 1,
        })),
      ),
    [],
  );

  useLayoutEffect(() => {
    if (!visible) {
      setPosition(null);
      setPicker(false);
      setMoreOpen(false);
      return;
    }
    let frame = 0;
    let polling = 0;
    let lastGeometry = "";
    const locateNow = () => {
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
      setHover((value) =>
        value.columns === columns && value.rows === rows
          ? value
          : { columns, rows },
      );
      const width = Math.max(180, Math.min(rect.width, window.innerWidth - 16));
      setPosition({
        top: Math.max(
          topBoundary + 4,
          rect.top >= 42 ? rect.top - 34 : rect.bottom + 4,
        ),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(locateNow);
    };
    const poll = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const element =
        anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      const table = element?.closest<HTMLTableElement>(".ProseMirror table");
      const rect = table?.getBoundingClientRect();
      const geometry = rect
        ? `${rect.left}:${rect.top}:${rect.width}:${rect.height}:${window.innerWidth}`
        : "none";
      if (geometry !== lastGeometry) {
        lastGeometry = geometry;
        schedule();
      }
      polling = requestAnimationFrame(poll);
    };
    schedule();
    polling = requestAnimationFrame(poll);
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (polling) cancelAnimationFrame(polling);
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [visible, documentKey]);

  if (!visible || !position) return null;

  const action = (command: EditorCommand, payload?: CommandPayload) => {
    run(command, payload);
    setPicker(false);
    setMoreOpen(false);
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
        onClick={() => {
          setPicker((open) => !open);
          setMoreOpen(false);
        }}
      >
        <span className="table-grid-glyph" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </button>
      {(["left", "center", "right"] as const).map((align) => {
        const label =
          align === "left"
            ? t("Align current column left")
            : align === "center"
              ? t("Align current column center")
              : t("Align current column right");
        return (
        <button
          type="button"
          className="table-toolbar-btn"
          key={align}
          title={label}
          aria-label={label}
          onClick={() =>
            action(
              align === "left"
                ? "tableAlignLeft"
                : align === "center"
                  ? "tableAlignCenter"
                  : "tableAlignRight",
            )
          }
        >
          <span className={`table-align-glyph is-${align}`} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
        );
      })}
      <span className="table-toolbar-gap" />
      <div className="table-toolbar-more-wrap">
        <button
          type="button"
          className="table-toolbar-btn"
          title={t("More table actions")}
          aria-label={t("More table actions")}
          aria-expanded={moreOpen}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMoreUp(rect.bottom + 430 > window.innerHeight);
            setMoreOpen((open) => !open);
            setPicker(false);
          }}
        >
          <Icon name="nota-view-more-horizontal-symbolic" />
        </button>
        {moreOpen && (
          <div
            className={`table-toolbar-menu${moreUp ? " is-up" : ""}`}
            role="menu"
          >
            {moreCommands.map((item) => (
              <div key={item.id}>
                {item.separator && <div className="table-toolbar-menu-sep" />}
                <button
                  type="button"
                  role="menuitem"
                  className={item.id === "tableDel" ? "is-danger" : undefined}
                  onClick={() => action(item.id)}
                >
                  {t(item.label)}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="table-toolbar-btn is-danger"
        title={t("Delete Table")}
        aria-label={t("Delete Table")}
        onClick={() => action("tableDel")}
      >
        <Icon name="nota-delete-symbolic" />
      </button>
      {picker && (
        <div className="table-size-picker">
          <div
            className="table-size-grid"
            onMouseLeave={() => setHover(current)}
          >
            {cells.map((row) =>
              row.map(({ row: rows, column: columns }) => (
                <button
                  type="button"
                  key={`${columns}x${rows}`}
                  className={
                    columns <= hover.columns && rows <= hover.rows
                      ? "is-active"
                      : ""
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
