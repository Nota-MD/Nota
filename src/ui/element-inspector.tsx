/**
 * Developer-mode element inspector.
 *
 * The overlay follows the pointer, reports computed visual properties for the
 * nearest interactive element (or the target itself), and places the panel
 * below that element when there is room. It never participates in hit testing.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

interface VisualStyle {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  backgroundColor: string;
  padding: string;
  borderRadius: string;
  display: string;
}

export interface InspectorRow {
  label: string;
  value: string;
}

export interface InspectorPlacement {
  style: CSSProperties;
  side: "above" | "below";
}

export interface InspectorSnapshot {
  selector: string;
  rows: InspectorRow[];
  target: DOMRect;
}

const interactiveSelector = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "label",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[contenteditable="true"]',
].join(",");

function cleanValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function compactInspectorValue(value: string, limit = 56): string {
  const clean = cleanValue(value);
  return clean.length <= limit ? clean : `${clean.slice(0, Math.max(0, limit - 1))}…`;
}

export function inspectorSelector(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = Array.from(element.classList).slice(0, 2).map((name) => `.${name}`).join("");
  return compactInspectorValue(`${tag}${id}${classes}`, 72);
}

export function inspectorRows(
  style: VisualStyle,
  width: number,
  height: number,
): InspectorRow[] {
  return [
    {
      label: "font",
      value: compactInspectorValue(
        `${style.fontSize} / ${style.lineHeight} · ${style.fontWeight}`,
      ),
    },
    { label: "font-family", value: compactInspectorValue(style.fontFamily) },
    { label: "color", value: compactInspectorValue(style.color) },
    { label: "background", value: compactInspectorValue(style.backgroundColor) },
    {
      label: "box",
      value: `${Math.round(width)} × ${Math.round(height)} · ${style.display}`,
    },
    { label: "padding", value: compactInspectorValue(style.padding) },
    { label: "radius", value: compactInspectorValue(style.borderRadius) },
  ];
}

export function inspectorPlacement(
  rect: Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width">,
  viewportWidth: number,
  viewportHeight: number,
  panelHeight = 150,
): InspectorPlacement {
  const gap = 8;
  const width = Math.min(380, Math.max(0, viewportWidth - gap * 2));
  const left = Math.min(
    Math.max(gap, rect.left),
    Math.max(gap, viewportWidth - width - gap),
  );
  const below = rect.bottom + gap;
  const roomBelow = viewportHeight - below >= panelHeight;
  const roomAbove = rect.top - gap >= panelHeight;
  if (roomBelow || !roomAbove) {
    return {
      side: "below",
      style: {
        left,
        top: Math.min(below, Math.max(gap, viewportHeight - panelHeight - gap)),
        width,
      },
    };
  }
  return {
    side: "above",
    style: { left, bottom: viewportHeight - rect.top + gap, width },
  };
}

function styleSnapshot(element: Element): VisualStyle {
  const style = getComputedStyle(element);
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    color: style.color,
    backgroundColor: style.backgroundColor,
    padding: style.padding,
    borderRadius: style.borderRadius,
    display: style.display,
  };
}

export function ElementInspector({ enabled }: { enabled: boolean }) {
  const [snapshot, setSnapshot] = useState<InspectorSnapshot | null>(null);
  const lastTarget = useRef<Element | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastTarget.current = null;
      setSnapshot(null);
      return;
    }

    let frame = 0;
    let pending: Element | null = null;
    const inspectPending = (): void => {
      frame = 0;
      const target = pending;
      pending = null;
      if (!target || !target.isConnected) {
        lastTarget.current = null;
        setSnapshot(null);
        return;
      }
      if (target === lastTarget.current) return;
      lastTarget.current = target;
      const rect = target.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        setSnapshot(null);
        return;
      }
      setSnapshot({
        selector: inspectorSelector(target),
        rows: inspectorRows(styleSnapshot(target), rect.width, rect.height),
        target: rect,
      });
    };

    const track = (event: PointerEvent): void => {
      const raw = event.target;
      if (!(raw instanceof Element) || raw.closest("[data-nota-element-inspector]")) {
        return;
      }
      if (raw === document.documentElement || raw === document.body || raw.id === "root") {
        lastTarget.current = null;
        setSnapshot(null);
        return;
      }
      const nearest = raw.closest(interactiveSelector);
      const target = nearest ?? raw.closest("[data-nota-inspect]") ?? raw;
      if (target === lastTarget.current) return;
      pending = target;
      if (!frame) frame = requestAnimationFrame(inspectPending);
    };
    const clear = (): void => {
      pending = null;
      lastTarget.current = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setSnapshot(null);
    };

    document.addEventListener("pointermove", track, true);
    document.addEventListener("pointerdown", track, true);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointermove", track, true);
      document.removeEventListener("pointerdown", track, true);
      window.removeEventListener("blur", clear);
      if (frame) cancelAnimationFrame(frame);
      lastTarget.current = null;
    };
  }, [enabled]);

  if (!snapshot) return null;
  const placement = inspectorPlacement(
    snapshot.target,
    window.innerWidth,
    window.innerHeight,
  );
  const targetStyle: CSSProperties = {
    left: snapshot.target.left,
    top: snapshot.target.top,
    width: snapshot.target.width,
    height: snapshot.target.height,
  };

  return createPortal(
    <div data-nota-element-inspector="true">
      <div className="nota-element-inspector-outline" style={targetStyle} />
      <aside
        className="nota-element-inspector"
        data-side={placement.side}
        style={placement.style}
        role="status"
        aria-live="polite"
      >
        <div className="nota-element-inspector-selector">{snapshot.selector}</div>
        <dl className="nota-element-inspector-grid">
          {snapshot.rows.map((row) => (
            <div key={row.label} className="nota-element-inspector-row">
              <dt>{row.label}</dt>
              <dd title={row.value}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>,
    document.body,
  );
}
