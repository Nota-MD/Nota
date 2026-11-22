import { useEffect, type RefObject } from "react";

import {
  events,
  on,
  type TableWritePayload,
} from "@/bridge/ipc";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Toast } from "@/ui/Toasts";
import { useT } from "@/i18n";

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
