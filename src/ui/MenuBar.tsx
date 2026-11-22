



































import { useEffect, useRef, useState } from "react";

import type { DocThemeInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { resolvePick, themeChecks, themeEntries, type MenuSpec } from "@/ui/commands";
import { MenuPopup } from "@/ui/MenuPopup";

interface Props {









  menus: readonly MenuSpec[];

  disabled: Set<string>;

  checks: Record<string, boolean>;

  themes: DocThemeInfo[];

  currentTheme: string;
  onCommand: (id: string) => void;

  onTheme: (id: string) => void;
  onOpenThemesDir: () => void;

  onRefreshThemes: () => void;
}

export function MenuBar(props: Props) {










  const t = useT();


  const [open, setOpen] = useState<string | null>(null);







  const [keyDiskDropPoint, setKeyDiskDropPoint] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);








  const pointOpenOf = useRef<string | null>(null);


  const focusTitle = (menuId: string) => {
    barRef.current?.querySelector<HTMLElement>(`[data-menu="${menuId}"]`)?.focus();
  };


  const closeBar2 = () => {
    pointOpenOf.current = null;
    setOpen(null);
  };


  const openBar = (id: string, comeSource: "point" | "mark" | "key") => {
    if (props.menus.find((menu) => menu.id === id)?.dynamic === "themes") {
      props.onRefreshThemes();
    }
    pointOpenOf.current = comeSource === "point" ? id : null;
    setOpen(id);
  };



  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (barRef.current?.contains(t as Node)) return;




      if (t?.closest?.(".menu-sub")) return;
      closeBar2();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);








  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key !== "F10" ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.shiftKey ||
        e.isComposing ||
        e.keyCode === 229
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (open) {
        setKeyDiskDropPoint(null);
        closeBar2();
        focusTitle(open);
        return;
      }
      const active = document.activeElement;
      const activeMenu =
        active instanceof HTMLElement ? active.closest<HTMLElement>("[data-menu]")?.dataset.menu : undefined;
      const target = props.menus.find((m) => m.id === activeMenu) ?? props.menus[0];
      if (target) {
        setKeyDiskDropPoint(target.id);
        focusTitle(target.id);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, props.menus]);




  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      const comeSelfKeyDisk = pointOpenOf.current === null;
      closeBar2();
      if (comeSelfKeyDisk) setKeyDiskDropPoint(open);


      focusTitle(open);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);


  const arrowAcross = (dir: 1 | -1) => {
    const i = props.menus.findIndex((m) => m.id === open);
    if (i < 0) return;
    const next = props.menus[i + dir];


    if (!next) return;





    openBar(next.id, "key");
  };


  const pick = (id: string) => {
    closeBar2();


    const p = resolvePick(id);
    if (p.kind === "theme") props.onTheme(p.id);
    else if (p.kind === "themes-dir") props.onOpenThemesDir();
    else props.onCommand(p.id);
  };

  return (
    <div
      className="menubar"
      role="menubar"
      ref={barRef}
      data-menu-open={open === null ? undefined : "true"}
      aria-keyshortcuts="F10"
    >
      {props.menus.map((menu, menuIndex) => {
        const isThemes = menu.dynamic === "themes";
        const entries = isThemes ? themeEntries(props.themes) : menu.items;



        const checks = isThemes
          ? { ...props.checks, ...themeChecks(props.themes, props.currentTheme) }
          : props.checks;
        const isOpen = open === menu.id;

        return (
          <div className="menu-root" key={menu.id}>
            <button
              type="button"
              data-menu={menu.id}
              className={`menu-title ${isOpen ? "menu-title-open" : ""} ${
                keyDiskDropPoint === menu.id ? "menu-title-keyboard" : ""
              }`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onKeyDown={(e) => {
                if (e.ctrlKey || e.altKey || e.metaKey) return;
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  e.stopPropagation();
                  const direction = e.key === "ArrowRight" ? 1 : -1;
                  const next = props.menus[menuIndex + direction];
                  if (next) {
                    setKeyDiskDropPoint(next.id);
                    focusTitle(next.id);
                  }
                  return;
                }
                if (e.key === "Home" || e.key === "End") {
                  e.preventDefault();
                  e.stopPropagation();
                  const target = e.key === "Home" ? props.menus[0] : props.menus[props.menus.length - 1];
                  if (target) {
                    setKeyDiskDropPoint(target.id);
                    focusTitle(target.id);
                  }
                  return;
                }
                if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  openBar(menu.id, "key");
                }
              }}

              onClick={() => {
                setKeyDiskDropPoint(null);


                if (!isOpen) openBar(menu.id, "point");
                else if (pointOpenOf.current === menu.id) closeBar2();
                else openBar(menu.id, "point");
              }}
            >
              {t(menu.label)}
            </button>

            {isOpen && (



              <MenuPopup
                key={menu.id}
                label={t(menu.label)}
                entries={entries}
                disabled={props.disabled}
                checks={checks}
                onPick={pick}
                onDismiss={() => {
                  const comeSelfKeyDisk = pointOpenOf.current === null;
                  closeBar2();
                  if (comeSelfKeyDisk) setKeyDiskDropPoint(menu.id);
                  focusTitle(menu.id);
                }}
                onArrowOut={arrowAcross}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
