































import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { DocId, Document } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";
import { MenuPopup } from "@/ui/MenuPopup";
import { popupSelfSelfAtRoll } from "@/ui/popup-scroll";
import type { MenuEntry } from "@/ui/commands";
import { useTablistKeys } from "@/ui/useTablistKeys";
import { usePointerTabReorder } from "@/ui/tab-order";


const newValueWindowItem = "tab.openInNewWindow";
const moveToWindowItem = "tab.moveToWindow";



export function TabBar(props: {
  docs: Document[];
  activeId: DocId | null;
  onSelect: (id: DocId) => void;
  onClose: (id: DocId) => void;





  onOpenInNewWindow: (path: string) => void;
  onMoveToWindow: (id: DocId) => void;
  onReorder: (source: DocId, target: DocId, place: "before" | "after") => void;







  inert?: boolean;
}) {


  const t = useT();






  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    id: DocId;
    path: string | null;
    openUp: boolean;
  } | null>(null);
  const anchor2 = useRef<HTMLDivElement>(null);



  const bar = useRef<HTMLDivElement>(null);
  useTablistKeys(bar);
  const { dragId, dropTarget, begin } = usePointerTabReorder({
    container: bar,
    onReorder: (sourceId, targetId, place) => {
      const source = props.docs.find((d) => String(d.id) === sourceId);
      const target = props.docs.find((d) => String(d.id) === targetId);
      if (source && target) props.onReorder(source.id, target.id, place);
    },
  });

  const closeMenu = useCallback(() => setMenu(null), []);

  const openMenu = useCallback((d: Document, x: number, y: number) => {




    const width = 232;
    const left = Math.max(0, Math.min(x, window.innerWidth - width));
    setMenu({
      x: left,
      y,
      id: d.id,
      path: d.path ?? null,
      openUp: window.innerHeight - y < 96,
    });
  }, []);






  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (anchor2.current?.contains(t as Node)) return;



      if (t?.closest?.(".menu-sub")) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menu, closeMenu]);




  useEffect(() => {
    if (!menu) return;



    const closeRoll = (e: Event) => {
      if (popupSelfSelfAtRoll(e.target)) return;
      closeMenu();
    };
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeRoll, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeRoll, true);
    };
  }, [menu, closeMenu]);

  const item: MenuEntry[] = [
    { id: newValueWindowItem, label: t("Open in New Window"), accel: "Ctrl+Alt+N" },
    { id: moveToWindowItem, label: t("Move to Another Window…"), accel: "Ctrl+Alt+M" },
  ];

  const disabled = new Set(menu?.path ? [] : [newValueWindowItem]);

  return (
    <div ref={bar} className="tabbar" role="tablist" inert={props.inert || undefined}>
      {props.docs.map((d) => (
        <div
          key={d.id}
          role="tab"
          data-tab-id={String(d.id)}
          aria-selected={d.id === props.activeId}
          className={`tab ${d.id === props.activeId ? "tab-active" : ""}`}
          data-dragging={dragId === String(d.id) || undefined}
          data-drop-before={dropTarget?.id === String(d.id) && dropTarget.place === "before" || undefined}
          data-drop-after={dropTarget?.id === String(d.id) && dropTarget.place === "after" || undefined}
          onPointerDown={(event) => begin(String(d.id), event)}


          onContextMenu={(e) => {
            e.preventDefault();
            openMenu(d, e.clientX, e.clientY);
          }}
        >
          <button type="button" className="tab-label" onClick={() => props.onSelect(d.id)}>
            {d.dirty && <span className="tab-dot" title={t("Has unsaved changes")} />}
            {d.title}
          </button>
          <button
            type="button"
            className="tab-close"
            title={t("Close")}
            aria-label={t("Close this tab")}
            data-no-tab-drag
            onClick={() => props.onClose(d.id)}
          >
            <Icon name="nota-tab-close-symbolic" />
          </button>
        </div>
      ))}

      {menu &&
        createPortal(
          <div
            className="tab-menu-anchor"
            data-open-up={menu.openUp || undefined}
            ref={anchor2}
            style={{ left: menu.x, top: menu.y }}
          >
            <MenuPopup
              label={t("Tab")}
              entries={item}
              disabled={disabled}
              checks={{}}
              onPick={(id) => {
                const docId = menu.id;
                const path2 = menu.path;
                closeMenu();
                if (id === newValueWindowItem && path2) props.onOpenInNewWindow(path2);
                if (id === moveToWindowItem) props.onMoveToWindow(docId);
              }}
              onDismiss={closeMenu}
              // `←` / `→` have no adjacent menu when this popup is detached from the tab strip.
              onArrowOut={() => {}}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
