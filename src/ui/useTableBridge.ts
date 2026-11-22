import { useEffect, type RefObject } from "react";

import {
  api,
  events,
  on,
  type TableSnapshot,
  type TableWritePayload,
} from "@/bridge/ipc";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Toast } from "@/ui/Toasts";
import { useT } from "@/i18n";
import { snapshotForTable } from "@/ui/table-snapshot";

interface Wiring {
  enabled: boolean;
  documentId: number | null;
  root: RefObject<HTMLElement | null>;
  editor: RefObject<EditorPaneHandle | null>;
  toast: (message: string, level?: Toast["level"]) => void;
}

export function useTableBridge({
  enabled,
  documentId,
  root,
  editor,
  toast,
}: Wiring): void {
  const t = useT();

  useEffect(() => {
    if (!enabled || documentId === null) return;
    let active = true;
    let frame = 0;
    let attempts = 0;
    const publishTables = () => {
      if (!active) return;
      const tables = Array.from(
        root.current?.querySelectorAll<HTMLTableElement>(".ProseMirror table") ?? [],
      );
      if (tables.length > 0) {
        const origin: TableSnapshot["active"] = { row: 0, column: 0 };
        const selection: TableSnapshot["selection"] = {
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
        };
        void (async () => {
          for (const table of tables) {
            if (!active) return;
            const snapshot = snapshotForTable(table, documentId, selection, origin);
            if (snapshot) await api.table.syncSnapshot(snapshot);
          }
          if (active) window.dispatchEvent(new Event("nota-table-snapshots-ready"));
        })();
        return;
      }
      attempts += 1;
      if (attempts < 120) frame = requestAnimationFrame(publishTables);
    };
    frame = requestAnimationFrame(publishTables);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      void api.table.syncSnapshot(null);
    };
  }, [documentId, enabled, root]);

  useEffect(() => {
    if (!enabled) {
      for (const table of root.current?.querySelectorAll<HTMLTableElement>("table") ?? []) {
        for (const cell of table.querySelectorAll<HTMLTableCellElement>("td, th")) {
          cell.classList.remove("nota-sheet-computed");
          cell.removeAttribute("data-nota-sheet-value");
        }
      }
      return;
    }

    let active = true;
    const disposers: Array<() => void> = [];

    void on<TableWritePayload>(events.tableWrite, (payload) => {
      if (!active || payload.documentId !== documentId) return;
      const applied = editor.current?.runCommand("tableSetCells", {
        tableCells: payload.cells,
      });
      if (!applied) {
        toast(t("The extension changed the table, but the editor is no longer editable."), "warn");
      }
    }).then((dispose) => {
      if (active) disposers.push(dispose);
      else dispose();
    });

    return () => {
      active = false;
      for (const dispose of disposers) dispose();
    };
  }, [documentId, editor, enabled, root, t, toast]);
}
