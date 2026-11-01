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

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const selected = accentPalette.findIndex((color) => color.toLowerCase() === value.toLowerCase());
  const [active, setActive] = useState(Math.max(0, selected));

  useEffect(() => setDraft(value), [value]);

  const placePopup = (): void => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(360, Math.max(0, window.innerWidth - 16));
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    const below = rect.bottom + 6;
    const openAbove = window.innerHeight - below < 380 && rect.top > 380;
    setPlace(
      openAbove
        ? { left, width, bottom: window.innerHeight - rect.top + 6 }
        : { left, width, top: below },
    );
  };

  useLayoutEffect(() => {
    if (!open) return;
    placePopup();
    window.addEventListener("resize", placePopup);
    return () => window.removeEventListener("resize", placePopup);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const choose = (color: string): void => {
    onChange(color);
    setDraft(color);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    let next = active;
    if (event.key === "ArrowLeft") next -= 1;
    else if (event.key === "ArrowRight") next += 1;
    else if (event.key === "ArrowUp") next -= 9;
    else if (event.key === "ArrowDown") next += 9;
    else if (event.key === "Home") next = Math.floor(active / 9) * 9;
    else if (event.key === "End") next = Math.floor(active / 9) * 9 + 8;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const color = accentPalette[active];
      if (color) choose(color);
      return;
    } else return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(accentPalette.length - 1, next)));
  };

  const custom = parseAccent(draft);
  return (
    <span className="stg-color-picker" data-open={open || undefined}>
      <button
        ref={triggerRef}
        type="button"
        className="stg-color-trigger"
        aria-label={t("Accent color")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-popup` : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="stg-color-chip" style={{ background: value || "#000000" }} />
        <span className="stg-color-hex">{value || t("Follow the style")}</span>
      </button>
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
            aria-label={t("Select Color")}
          >
            <div className="stg-color-popup-head">
              <strong>{t("Select Color")}</strong>
              <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
                {t("Done")}
              </button>
            </div>
            <div
              className="stg-color-grid"
              role="grid"
              aria-label={t("Accent color")}
              aria-activedescendant={`${id}-color-${active}`}
              tabIndex={0}
              onKeyDown={onGridKey}
            >
              {accentPalette.map((color, index) => (
                <button
                  key={color}
                  id={`${id}-color-${index}`}
                  type="button"
                  role="gridcell"
                  tabIndex={-1}
                  className="stg-color-cell"
                  style={{ background: color }}
                  data-active={index === active ? "true" : undefined}
                  data-selected={color.toLowerCase() === value.toLowerCase() ? "true" : undefined}
                  aria-label={color}
                  aria-selected={color.toLowerCase() === value.toLowerCase()}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onClick={() => choose(color)}
                />
              ))}
            </div>
            <div className="stg-color-custom">
              <label htmlFor={`${id}-hex`}>{t("Custom")}</label>
              <input
                id={`${id}-hex`}
                className="stg-input"
                value={draft}
                spellCheck={false}
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
