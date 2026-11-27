import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { useT } from "@/i18n";
import { parseAccent } from "@/styles/accent";

export const accentPalette = [
  "#9bd8fb", "#80e6b0", "#fff48a", "#ffc88a", "#ff9b98", "#e3a9ea", "#d6b69c", "#f2f4f6", "#aeb5bf",
  "#73c4f5", "#62d992", "#ffed65", "#ffad62", "#ff7772", "#d68be0", "#c79a72", "#d7dadd", "#868e98",
  "#42a8ee", "#35c977", "#ffd93b", "#ff8c2e", "#f4514d", "#b85dc7", "#a5734a", "#b8bdc2", "#59616c",
  "#1d87df", "#19a85f", "#e8bb13", "#db6718", "#d32f35", "#8e389f", "#7a4f2b", "#8d939b", "#3d444d",
  "#1567af", "#0d7a43", "#aa8508", "#aa4a0e", "#a91d24", "#67206f", "#57341b", "#5a6068", "#11151b",
] as const;

export const defaultAccentDots = [
  "#007aff",
  "#a550a7",
  "#f74f9e",
  "#ff5257",
  "#f7821b",
  "#ffc600",
  "#62ba46",
  "#8c8c8c",
] as const;

function themeAccentDots(): string[] {
  const styles = getComputedStyle(document.documentElement);
  return defaultAccentDots.map((fallback, index) => {
    const value = styles.getPropertyValue(`--accent-choice-${index + 1}`).trim();
    return parseAccent(value) ?? fallback;
  });
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const id = useId();
  const dots = themeAccentDots();
  const selected = dots.findIndex(
    (color) => color.toLowerCase() === value.toLowerCase(),
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dotRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => setDraft(value), [value]);

  const placePopup = (): void => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(300, Math.max(0, window.innerWidth - 16));
    const left = Math.min(
      Math.max(8, rect.right - width),
      Math.max(8, window.innerWidth - width - 8),
    );
    const below = rect.bottom + 6;
    setPlace(
      window.innerHeight - below < 150
        ? { left, width, bottom: window.innerHeight - rect.top + 6 }
        : { left, width, top: below },
    );
  };

  useLayoutEffect(() => {
    if (!open) return;
    placePopup();
    requestAnimationFrame(() => inputRef.current?.focus());
    window.addEventListener("resize", placePopup);
    return () => window.removeEventListener("resize", placePopup);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnPointer = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnPointer, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  const choose = (color: string): void => {
    onChange(color);
    setDraft(color);
    setOpen(false);
  };

  const onDotKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + dots.length) % dots.length;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % dots.length;
    }
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = dots.length - 1;
    if (next === null) return;
    event.preventDefault();
    dotRefs.current[next]?.focus();
  };

  const custom = parseAccent(draft);
  const customSelected = value !== "" && selected < 0;

  return (
    <span className="stg-color-picker" data-open={open || undefined}>
      <span
        className="stg-color-dots"
        role="radiogroup"
        aria-label={t("Accent color")}
      >
        {dots.map((color, index) => (
          <button
            key={`${index}-${color}`}
            ref={(element) => {
              dotRefs.current[index] = element;
            }}
            type="button"
            role="radio"
            className="stg-color-dot"
            style={{ background: color }}
            aria-label={color}
            aria-checked={index === selected}
            tabIndex={index === Math.max(0, selected) ? 0 : -1}
            onKeyDown={(event) => onDotKey(event, index)}
            onClick={() => choose(color)}
          />
        ))}
        <button
          ref={triggerRef}
          type="button"
          className="stg-color-add"
          aria-label={t("Custom color code")}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${id}-popup` : undefined}
          data-selected={customSelected ? "true" : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          +
        </button>
      </span>
      {open &&
        place &&
        createPortal(
          <div
            ref={popupRef}
            id={`${id}-popup`}
            className="stg-color-popup"
            style={place}
            role="dialog"
            aria-modal="false"
            data-modal-layer="true"
            aria-label={t("Custom color code")}
          >
            <div className="stg-color-popup-head">
              <strong>{t("Custom color code")}</strong>
              <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
                {t("Done")}
              </button>
            </div>
            <div className="stg-color-custom">
              <label htmlFor={`${id}-hex`}>{t("Custom")}</label>
              <input
                ref={inputRef}
                id={`${id}-hex`}
                className="stg-input"
                value={draft}
                spellCheck={false}
                placeholder="#007aff"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && custom) {
                    event.preventDefault();
                    choose(custom);
                  }
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={!custom}
                onClick={() => custom && choose(custom)}
              >
                {t("Select")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
