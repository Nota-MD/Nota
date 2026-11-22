import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Document, ViewMode } from "@/bridge/ipc";
import type { FocusState } from "@/bridge/types";
import type { CommandState } from "@/editor/command-state";
import type { SelectionSnapshot } from "@/editor/caret-snapshot";
import type { StatusMetric } from "@/bridge/types-settings";
import { useT } from "@/i18n";
import { FocusMeter } from "@/ui/FocusMeter";
import { Icon } from "@/ui/Icon";
import { MenuPopup } from "@/ui/MenuPopup";
import { SpellMenu } from "@/ui/SpellMenu";
import { popupSelfSelfAtRoll } from "@/ui/popup-scroll";
import type { MenuEntry } from "@/ui/commands";
import { countText } from "@/ui/outline";


const menuOrder: StatusMetric[] = ["minutes", "lines", "words", "characters"];


const systemCountPrefix = "status.metric.";

export function StatusBar({
  doc,

  cursor,
  selection,
  mode,
  sidebarOpen,
  readingSpeed,
  focus,
  metric,
  onPickMetric,
  spellcheck,
  combineWriteLanguage,
  onChangeSpell,
  pluginDock,
  onToggleSidebar,
  onToggleSource,
  onHide,
}: {
  doc: Document | null;

  cursor: CommandState | null;
  selection: SelectionSnapshot | null;

  mode: ViewMode;

  sidebarOpen: boolean;


  readingSpeed: number;


  focus: FocusState | null;

  metric: StatusMetric;

  onPickMetric: (m: StatusMetric) => void;


  spellcheck: boolean | null;


  combineWriteLanguage: string[] | null;


  onChangeSpell: (fill: { open2?: boolean; language?: string[] }) => void;


  pluginDock: { open2: boolean; splitReplace: () => void } | null;

  onToggleSidebar: () => void;

  onToggleSource: () => void;


  onHide: () => void;
}) {


  const t = useT();
  const counts = useMemo(
    () => countText(doc?.text ?? "", readingSpeed),
    [doc?.text, readingSpeed],
  );
  const selectionCounts = useMemo(
    () => countText(selection?.empty === false ? selection.text : "", readingSpeed),
    [selection, readingSpeed],
  );


  const bar = useRef<HTMLElement | null>(null);


  const [menu, setMenu] = useState<"count" | "spell" | null>(null);

  const [anchor2, setAnchor] = useState<{ left: number; top: number } | null>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
    setAnchor(null);
  }, []);

  const openMenu = useCallback(
    (whichItem: "count" | "spell") => {


      if (menu === whichItem) {
        closeMenu();
        return;
      }
      const r = bar.current?.getBoundingClientRect();
      if (!r) return;


      setAnchor({ left: r.right, top: r.top });
      setMenu(whichItem);
    },
    [menu, closeMenu],
  );


  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (bar.current?.contains(el as Node)) return;


      if (el?.closest?.(".menu-sub")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };


    const onScroll = (e: Event) => {
      if (popupSelfSelfAtRoll(e.target)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu, closeMenu]);


  const fourItem: Record<StatusMetric, string> = {
    minutes: t("{0} minutes", counts.readingMinutes),
    lines: t("{0} lines", counts.lines),
    words: t("{0} words", counts.words),
    characters: t("{0} characters", counts.characters),
  };


  const systemCountItem: MenuEntry[] = menuOrder.map((m) => ({
    id: systemCountPrefix + m,
    label: fourItem[m],
    checkable: true,
  }));

  const systemCountCheck: Record<string, boolean> = {};
  for (const m of menuOrder) systemCountCheck[systemCountPrefix + m] = m === metric;


  const detailThin = t(
    "{0} words / {1} characters / {2} lines / about {3} min",
    counts.words,
    counts.characters,
    counts.lines,
    counts.readingMinutes,
  );
  const hasTextSelection = selection?.empty === false && selection.text.length > 0;
  const selectedCountLabel: Record<StatusMetric, string> = {
    minutes: t(
      "{0}/{1} minutes",
      selectionCounts.readingMinutes,
      counts.readingMinutes,
    ),
    lines: t("{0}/{1} lines", selectionCounts.lines, counts.lines),
    words: t("{0}/{1} words", selectionCounts.words, counts.words),
    characters: t(
      "{0}/{1} characters",
      selectionCounts.characters,
      counts.characters,
    ),
  };
  const countLabel = hasTextSelection ? selectedCountLabel[metric] : fourItem[metric];
  const countDetail = hasTextSelection
    ? t(
        "{0} selected words / {1} selected characters",
        selectionCounts.words,
        selectionCounts.characters,
      )
    : detailThin;

  const left = (
    <span className="status-left">
      <button
        type="button"
        className="status-btn"
        onClick={onToggleSidebar}
        title={t("Toggle Sidebar")}
        aria-label={t("Toggle Sidebar")}
        aria-pressed={sidebarOpen}
      >
        <Icon
          name={sidebarOpen ? "nota-sidebar-collapse-symbolic" : "nota-sidebar-toggle-symbolic"}
        />
      </button>
      {


                                            }
      {pluginDock && (
        <button
          type="button"
          className="status-btn"
          onClick={pluginDock.splitReplace}
          title={t("Show the extension dock")}
          aria-label={t("Show the extension dock")}
          aria-pressed={pluginDock.open2}
        >
          <Icon name="folio-columns-symbolic" />
        </button>
      )}
      <button
        type="button"
        className="status-btn"
        data-on={mode === "source" || undefined}
        onClick={onToggleSource}
        title={t("Switch between source mode and WYSIWYG")}
        aria-label={t("Switch between source mode and WYSIWYG")}
        aria-pressed={mode === "source"}
      >
        <Icon name="folio-insert-code-symbolic" />
      </button>
    </span>
  );

  const dedicatedNote = <FocusMeter state={focus} />;

  return (
    <footer className="statusbar" ref={bar}>
      {left}
      <span className="status-right">
        {dedicatedNote}
        {
                          }
        {doc && (
          <span className="status-count-group">
            <button
              type="button"
              className="status-btn status-aux"
              data-on={menu === "spell" || undefined}
              onClick={() => openMenu("spell")}
              title={t("Spell check")}
              aria-label={t("Spell check")}
              aria-haspopup="menu"
              aria-expanded={menu === "spell"}
            >
              <Icon name="nota-spellcheck-symbolic" />
            </button>
            {


                                               }
            {cursor?.overtype && (
              <span
                className="status-ovr"
                title={t("Overtype: typing replaces the character to the right")}
              >
                OVR
              </span>
            )}
            <span className="status-count" title={doc ? `${countDetail} / ${doc.encoding}` : countDetail}>
              {countLabel}
            </span>
            <button
              type="button"
              className="status-btn status-aux"
              data-on={menu === "count" || undefined}
              onClick={() => openMenu("count")}
              title={t("Which count the status bar shows")}
              aria-label={t("Which count the status bar shows")}
              aria-haspopup="menu"
              aria-expanded={menu === "count"}
            >
              <Icon name="nota-unfold-more-symbolic" />
            </button>
          </span>
        )}





        <button
          type="button"
          className="status-btn statusbar-close"
          title={t("Hide the status bar")}
          aria-label={t("Hide the status bar")}
          onClick={onHide}
        >
          <Icon name="folio-close-symbolic" />
        </button>
      </span>

      {menu && anchor2 && (


        <div className="status-menu-anchor" style={{ left: anchor2.left, top: anchor2.top }}>
          {menu === "count" ? (
            <MenuPopup
              label={t("Word Count")}
              heading="Word Count"
              entries={systemCountItem}
              disabled={new Set()}
              checks={systemCountCheck}
              onPick={(id) => {
                const pickOf = menuOrder.find((m) => systemCountPrefix + m === id);
                closeMenu();
                if (pickOf) onPickMetric(pickOf);
              }}
              onDismiss={closeMenu}


              onArrowOut={() => {}}
            />
          ) : (


            <SpellMenu
              spellcheck={spellcheck}
              language={combineWriteLanguage}
              onChangeSpell={onChangeSpell}
              onDismiss={closeMenu}
            />
          )}
        </div>
      )}
    </footer>
  );
}
