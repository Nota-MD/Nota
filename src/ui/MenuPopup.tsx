import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useT } from "@/i18n";
import { formatAccel } from "@/ui/accel";
import { isMenuItem, type MenuEntry, type MenuItemSpec } from "@/ui/commands";
import { useMenuRovingFocus } from "@/ui/useMenuRovingFocus";


type Line =
  | { kind: "sep"; key: string }
  | { kind: "item"; entry: MenuItemSpec; row: number };

interface Layout {

  lines: Line[];

  items: MenuItemSpec[];
}

function layout(entries: readonly MenuEntry[]): Layout {
  const lines: Line[] = [];
  const items: MenuItemSpec[] = [];
  entries.forEach((entry, i) => {
    if (!isMenuItem(entry)) {

      lines.push({ kind: "sep", key: `sep-${i}` });
      return;
    }
    lines.push({ kind: "item", entry, row: items.length });
    items.push(entry);
  });
  return { lines, items };
}

interface PopupProps {

  entries: MenuEntry[];

  disabled: ReadonlySet<string>;

  checks: Record<string, boolean>;

  onPick: (id: string) => void;

  onDismiss: () => void;

  onArrowOut: (dir: 1 | -1) => void;

  label: string;


  heading?: string;


  top?: ReactNode;
}

export function MenuPopup(props: PopupProps) {
  const { entries, disabled, checks, onPick, onDismiss, onArrowOut, label, heading, top } = props;


  const t = useT();

  const { lines, items } = useMemo(() => layout(entries), [entries]);


  const [subOpen, setSubOpen] = useState<number | null>(null);

  const [subAnchor, setSubAnchor] = useState<{
    top: number;
    left: number;
    parentLeft: number;
  } | null>(null);


  const pointOpenOf = useRef<number | null>(null);


  const rowRefs = useRef<Array<HTMLElement | null>>([]);

  const roving = useMenuRovingFocus<{ disabled?: boolean }>({
    items: items.map((it) => ({ disabled: disabled.has(it.id) })),


    enabled: !top,
    onActivate: (_item, index) => {
      const entry = items[index];
      if (!entry) return;
      if (entry.submenu) {


        if (subOpen === index) closeSub(index);
        else openSub(index, "key");
        return;
      }
      if (!disabled.has(entry.id)) onPick(entry.id);
    },
    onDismiss,
    onRight: (_item, index) => {
      const entry = items[index];
      if (entry?.submenu) {
        openSub(index, "key");
        return;
      }

      onArrowOut(1);
    },
    onLeft: () => onArrowOut(-1),
  });

  const { itemProps, registerItem } = roving;


  const registerRow = (row: number, node: HTMLElement | null) => {
    rowRefs.current[row] = node;
    registerItem(row, node);
  };


  function openSub(row: number, comeSource: "point" | "mark" | "key") {
    const el = rowRefs.current[row];
    if (!el) return;
    const r = el.getBoundingClientRect();


    setSubAnchor({ top: r.top, left: r.right - 4, parentLeft: r.left });
    pointOpenOf.current = comeSource === "point" ? row : null;
    setSubOpen(row);
  }


  function closeSub(row: number) {
    pointOpenOf.current = null;
    setSubOpen(null);
    setSubAnchor(null);


    roving.focusItem(row);
  }


  const drawLine = (line: Line) => {
      if (line.kind === "sep") {
        return (
          <div
            className="menu-sep"
            key={line.key}
            role="separator"
            onMouseEnter={() => roving.setFocusedIndex(-1)}
          />
        );
      }

      const { entry, row } = line;
      const isSubOpen = subOpen === row;


      const isFocusPoint = roving.focusedIndex === row;
      const p = itemProps(row);

      return (
        <div
          className="menu-item-root"
          key={entry.id}
        >
          <button
            type="button"
            role="menuitem"
            className={`menu-item ${entry.danger ? "menu-item-danger" : ""} ${
              isSubOpen || isFocusPoint ? "menu-item-open" : ""
            }`}


            disabled={disabled.has(entry.id)}
            aria-checked={entry.checkable ? !!checks[entry.id] : undefined}
            aria-haspopup={entry.submenu ? "menu" : undefined}
            aria-expanded={entry.submenu ? isSubOpen : undefined}
            tabIndex={p.tabIndex}
            ref={(n) => registerRow(row, n)}
            onFocus={p.onFocus}
            onMouseEnter={() => {

              if (disabled.has(entry.id)) {
                roving.setFocusedIndex(-1);
                return;
              }
              p.onMouseEnter();
              if (entry.submenu) openSub(row, "mark");
              else {
                pointOpenOf.current = null;
                setSubOpen(null);
              }
            }}
            onClick={() => {
              if (entry.submenu) {


                if (isSubOpen && pointOpenOf.current === row) closeSub(row);
                else openSub(row, "point");
                return;
              }
              onPick(entry.id);
            }}
          >
            <span className="menu-check">{entry.checkable && checks[entry.id] ? "✓" : ""}</span>
            <span className="menu-label">{t(entry.label)}</span>







            {entry.accel && !disabled.has(entry.id) && (
              <span className="menu-accel">{formatAccel(entry.accel)}</span>
            )}





            {!entry.accel && entry.right && (
              <span className="menu-accel">{entry.right}</span>
            )}


            <span className="menu-arrow">{entry.submenu ? "▸" : ""}</span>
          </button>

          {entry.submenu &&
            isSubOpen &&
            subAnchor &&
            createPortal(
              <SubMenu
                entries={entry.submenu}
                disabled={disabled}
                checks={checks}
                onPick={onPick}
                onDismiss={onDismiss}
                onClose={() => closeSub(row)}
                anchor={subAnchor}
              />,
              document.body,
            )}
        </div>
      );
  };

  return (
    <div
      className="menu-popup"
      role="menu"
      aria-label={label}
      onMouseLeave={() => roving.setFocusedIndex(-1)}
      onKeyDown={(e) => {


        const target = e.target as HTMLElement | null;
        if (e.key !== "Escape" && target && target.tagName === "INPUT") return;
        roving.handleKeyDown(e);
      }}
    >

      {top}
      {heading && <div className="menu-heading">{t(heading)}</div>}
      {lines.map(drawLine)}
    </div>
  );
}

export interface SubMenuProps {
  entries: MenuEntry[];
  disabled: ReadonlySet<string>;
  checks: Record<string, boolean>;
  onPick: (id: string) => void;
  onDismiss: () => void;
  onClose: () => void;

  anchor: { top: number; left: number; parentLeft: number };


  className?: string;
}


export function SubMenu(props: SubMenuProps) {
  const { entries, disabled, checks, onPick, onDismiss, onClose, anchor, className } = props;


  const t = useT();

  const { lines, items } = useMemo(() => layout(entries), [entries]);

  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(anchor);
  const [flipped, setFlipped] = useState(false);


  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const top = Math.max(8, Math.min(anchor.top, window.innerHeight - el.offsetHeight - 8));
    const rightSideExceedBoundary = anchor.left + el.offsetWidth > window.innerWidth - 8;
    const leftSideAnchor = anchor.parentLeft - el.offsetWidth + 4;
    const expandLeft = rightSideExceedBoundary && leftSideAnchor >= 8;
    const left = expandLeft
      ? leftSideAnchor
      : Math.max(8, Math.min(anchor.left, window.innerWidth - el.offsetWidth - 8));
    setFlipped(expandLeft);
    setPos({ ...anchor, top, left });
  }, [anchor]);

  const roving = useMenuRovingFocus<{ disabled?: boolean }>({
    items: items.map((it) => ({ disabled: disabled.has(it.id) })),
    onActivate: (_item, index) => {
      const entry = items[index];
      if (entry && !disabled.has(entry.id)) onPick(entry.id);
    },


    onDismiss,

    onCancel: onClose,

    onRight: () => {},
    onLeft: onClose,
  });

  const { itemProps, registerItem } = roving;


  return (
    <div
      ref={boxRef}
      className={`menu-sub${flipped ? " menu-sub-left" : ""}${className ? ` ${className}` : ""}`}
      role="menu"
      style={{ top: pos.top, left: pos.left }}
      onKeyDown={roving.handleKeyDown}
      onMouseLeave={() => roving.setFocusedIndex(-1)}
    >
      {lines.map((line) => {
        if (line.kind === "sep") {
          return <div className="menu-sep" key={line.key} role="separator" />;
        }
        const { entry, row } = line;
        const p = itemProps(row);


        const isFocusPoint = roving.focusedIndex === row;

        return (
          <button
            type="button"
            role="menuitem"
            className={`menu-item ${entry.danger ? "menu-item-danger" : ""} ${isFocusPoint ? "menu-item-open" : ""}`}
            key={entry.id}
            disabled={disabled.has(entry.id)}
            aria-checked={entry.checkable ? !!checks[entry.id] : undefined}
            tabIndex={p.tabIndex}
            ref={(n) => registerItem(row, n)}
            onFocus={p.onFocus}
            onMouseEnter={() => {
              if (disabled.has(entry.id)) roving.setFocusedIndex(-1);
              else p.onMouseEnter();
            }}
            onClick={() => {
              if (!disabled.has(entry.id)) onPick(entry.id);
            }}
          >
            <span className="menu-check">{entry.checkable && checks[entry.id] ? "✓" : ""}</span>
            <span className="menu-label">{t(entry.label)}</span>

            {entry.accel && !disabled.has(entry.id) && (
              <span className="menu-accel">{formatAccel(entry.accel)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
