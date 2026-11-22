import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal, flushSync } from "react-dom";

import { events, on, type TableRenderPayload } from "@/bridge/ipc";
import {
  computedBoxesFor,
  recordTableExtensionContent,
  type ComputedBox,
} from "@/ui/table-computed";

interface Props {
  active: boolean;
  documentKey: string | number;
}

function computedValueClass(box: ComputedBox): string {
  return `sheet-computed-value${box.selected ? " is-selected" : ""}${
    box.error ? " is-error" : ""
  }`;
}

export function PersistentTableComputedOverlay({ active, documentKey }: Props) {
  const [boxes, setBoxes] = useState<ComputedBox[]>([]);
  const renders = useRef<Map<string, TableRenderPayload>>(new Map());

  useLayoutEffect(() => {
    if (!active) {
      renders.current.clear();
      setBoxes([]);
      return;
    }

    let disposed = false;
    let frame = 0;
    let unlisten: (() => void) | null = null;
    const documentId = Number(documentKey);

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => measure(false));
    };

    const measure = (synchronous: boolean) => {
      frame = 0;
      if (disposed) return;
      const liveTables = Array.from(
        document.querySelectorAll<HTMLTableElement>(".ProseMirror table"),
      );
      const rangeRect = document.querySelector(".sheet-range-box")?.getBoundingClientRect();
      const next: ComputedBox[] = [];
      for (const payload of renders.current.values()) {
        if (payload.documentId !== documentId) continue;
        const index = Number(payload.tableId.slice(payload.tableId.lastIndexOf(":") + 1));
        const table = Number.isSafeInteger(index) ? liveTables[index] : null;
        if (!table) continue;
        for (const box of computedBoxesFor(table, payload.cells)) {
          const centerX = box.left + box.width / 2;
          const centerY = box.top + box.height / 2;
          next.push({
            ...box,
            ref: `${payload.plugin}:${payload.tableId}:${box.ref}`,
            selected: Boolean(
              rangeRect &&
                centerX >= rangeRect.left &&
                centerX <= rangeRect.right &&
                centerY >= rangeRect.top &&
                centerY <= rangeRect.bottom,
            ),
          });
        }
      }
      if (synchronous) {
        flushSync(() => setBoxes(next));
      } else {
        setBoxes(next);
      }
    };

    void on<TableRenderPayload>(events.tableRender, (payload) => {
      if (payload.documentId !== documentId) return;
      recordTableExtensionContent(
        payload.documentId,
        payload.tableId,
        payload.extensionContent,
      );
      renders.current.set(`${payload.plugin}:${payload.tableId}`, payload);
      schedule();
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });

    const mutations = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(record.target instanceof Element) ||
            Boolean(record.target.closest("table")),
        )
      ) {
        schedule();
      }
    });
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const onSelectionChange = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      measure(true);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("nota-selection-theme-changed", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      mutations.disconnect();
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("nota-selection-theme-changed", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      unlisten?.();
    };
  }, [active, documentKey]);

  if (!active || boxes.length === 0) return null;
  return createPortal(
    <>
      {boxes.map((box) => (
        <div
          key={box.ref}
          className={computedValueClass(box)}
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            padding: box.padding,
            textAlign: box.align as CSSProperties["textAlign"],
            background: box.background,
          }}
        >
          {box.value}
        </div>
      ))}
    </>,
    document.body,
  );
}
