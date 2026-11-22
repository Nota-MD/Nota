import { useEffect, useMemo, useRef, useState } from "react";

import type { DocThemeInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { formatAccel } from "@/ui/accel";
import {
  collectCommandPaletteEntries,
  firstEnabledCommand,
  nextEnabledCommand,
  searchCommandPalette,
} from "@/ui/command-palette";
import type { MenuSpec } from "@/ui/commands";
import { useModalTrap } from "@/ui/useModalTrap";

export interface CommandPaletteWiring {
  menus: readonly MenuSpec[];
  disabled: ReadonlySet<string>;
  checks: Readonly<Record<string, boolean>>;
  themes: readonly DocThemeInfo[];
  currentTheme: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

export function CommandPalette({
  menus,
  disabled,
  checks,
  themes,
  currentTheme,
  onPick,
  onClose,
}: CommandPaletteWiring) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const entries = useMemo(
    () => {
      const collected = collectCommandPaletteEntries({
        menus,
        disabled,
        checks,
        themes,
        currentTheme,
        translate: t,
      });
      return collected.filter((entry) => entry.id !== "file.commandPalette");
    },
    [checks, currentTheme, disabled, menus, t, themes],
  );
  const results = useMemo(() => searchCommandPalette(entries, query), [entries, query]);
  const activeIndex = results.findIndex((entry) => entry.id === activeId);
  const fallbackIndex = firstEnabledCommand(results);
  const selectedIndex = activeIndex >= 0 ? activeIndex : fallbackIndex;

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (results.length === 0) {
      setActiveId(null);
      return;
    }
    if (!results.some((entry) => entry.id === activeId && !entry.disabled)) {
      setActiveId(results[fallbackIndex]?.id ?? null);
    }
  }, [activeId, fallbackIndex, results]);

  const close = (restoreFocus: boolean) => {
    onClose();
    if (restoreFocus) {
      requestAnimationFrame(() => previousFocus.current?.focus());
    }
  };

  const run = (entry: (typeof results)[number] | undefined) => {
    if (!entry || entry.disabled) return;
    onClose();
    onPick(entry.id);
  };

  useModalTrap(panelRef, { onEscape: () => close(true) });

  return (
    <div className="command-palette-backdrop" onMouseDown={() => close(true)}>
      <div
        ref={panelRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("Command Palette")}
        data-modal-layer="true"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const next = nextEnabledCommand(
              results,
              selectedIndex,
              event.key === "ArrowDown" ? 1 : -1,
            );
            if (next >= 0) setActiveId(results[next]?.id ?? null);
            return;
          }
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            const next = event.key === "Home" ? firstEnabledCommand(results) : -1;
            const finalIndex =
              next >= 0
                ? next
                : event.key === "End"
                  ? nextEnabledCommand(results, -1, -1)
                  : -1;
            if (finalIndex >= 0) setActiveId(results[finalIndex]?.id ?? null);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            run(results[selectedIndex]);
          }
        }}
      >
        <input
          ref={inputRef}
          className="command-palette-input"
          value={query}
          placeholder={t("Type a command")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="nota-command-palette-results"
          aria-activedescendant={
            selectedIndex >= 0 ? `nota-command-${results[selectedIndex]?.id}` : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveId(null);
          }}
        />

        <div
          id="nota-command-palette-results"
          className="command-palette-results"
          role="listbox"
        >
          {results.length === 0 ? (
            <p className="command-palette-empty">{t("No matching commands")}</p>
          ) : (
            results.map((entry, index) => (
              <button
                key={entry.id}
                id={`nota-command-${entry.id}`}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                aria-disabled={entry.disabled || undefined}
                data-active={index === selectedIndex || undefined}
                data-checked={entry.checked || undefined}
                data-danger={entry.danger || undefined}
                className="command-palette-item"
                onMouseEnter={() => setActiveId(entry.id)}
                onClick={() => run(entry)}
              >
                <span className="command-palette-marker" aria-hidden="true" />
                <span className="command-palette-copy">
                  <span className="command-palette-title">{entry.title}</span>
                  <span className="command-palette-group">{entry.group}</span>
                </span>
                {entry.disabled ? (
                  <span className="command-palette-unavailable">{t("Unavailable")}</span>
                ) : entry.accel ? (
                  <kbd className="command-palette-accel">{formatAccel(entry.accel)}</kbd>
                ) : null}
              </button>
            ))
          )}
        </div>

        <div className="command-palette-footer" aria-hidden="true">
          <span>{t("Enter to run")}</span>
          <span>{t("Esc to close")}</span>
        </div>
      </div>
    </div>
  );
}
