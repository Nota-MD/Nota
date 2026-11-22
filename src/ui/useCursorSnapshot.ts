

















































import { useRef } from "react";

import { api, type DocId } from "@/bridge/ipc";
import type { SelectionSnapshot } from "@/editor/caret-snapshot";







const CURSOR_DEBOUNCE_MS = 250;


export interface SelectionSnapshotWiring {

  recordSnapshot: (snapshot: SelectionSnapshot) => void;

  clearSnapshotFixedTime: () => void;
}





export function useSelectionSnapshot(documentId: DocId): SelectionSnapshotWiring {





  const snapshotFixedTimeRef = useRef<number | null>(null);

  const clearSnapshotFixedTime = () => {
    if (snapshotFixedTimeRef.current !== null) {
      window.clearTimeout(snapshotFixedTimeRef.current);
      snapshotFixedTimeRef.current = null;
    }
  };

  const recordSnapshot = (snapshot: SelectionSnapshot) => {


    if (snapshotFixedTimeRef.current !== null) window.clearTimeout(snapshotFixedTimeRef.current);
    snapshotFixedTimeRef.current = window.setTimeout(() => {
      snapshotFixedTimeRef.current = null;

      void api.doc.cursor(documentId, snapshot).catch(() => {});
    }, CURSOR_DEBOUNCE_MS);
  };

  return { recordSnapshot, clearSnapshotFixedTime };
}
