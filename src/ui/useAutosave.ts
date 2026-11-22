




































import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { DocId, Document } from "@/bridge/ipc";

export interface SelfActionSaveWiring {

  seconds: number;

  docs: readonly Document[];




  activeIdRef: RefObject<DocId | null>;

  saveDoc: (id: DocId) => Promise<unknown>;
  /** Persist a recovery copy without touching the source document. */
  saveDraft: (id: DocId) => Promise<boolean>;
}


const seeTableMilliSeconds = 1000;
const DRAFT_STOP_MILLISECONDS = 1_500;
const DRAFT_MAX_INTERVAL_MILLISECONDS = 5_000;
const DRAFT_POLL_MILLISECONDS = 500;





export function useAutosave(w: SelfActionSaveWiring): () => void {

  const activity = useRef(0);
  const draftActivity = useRef(0);
  const draftSavedAt = useRef(0);


  const resourceMaterial = useRef(w);
  resourceMaterial.current = w;

  const recordActivity = useCallback(() => {
    const now = Date.now();
    activity.current = now;
    draftActivity.current = now;
    if (draftSavedAt.current === 0) draftSavedAt.current = now;
  }, []);

  useEffect(() => {
    if (!(w.seconds > 0)) return;
    const stopStrokeMilliSeconds = w.seconds * 1000;
    const table2 = window.setInterval(() => {
      const distanceToday = Date.now() - activity.current;

      if (activity.current === 0 || distanceToday < stopStrokeMilliSeconds) return;

      const id = resourceMaterial.current.activeIdRef.current;
      const doc = resourceMaterial.current.docs.find((d) => d.id === id);
      if (!doc?.dirty || !doc.path) return;



      activity.current = Date.now();
      void resourceMaterial.current.saveDoc(doc.id).catch(() => {


      });
    }, seeTableMilliSeconds);
    return () => window.clearInterval(table2);
  }, [w.seconds]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (draftActivity.current === 0) return;
      const now = Date.now();
      const stopped = now - draftActivity.current >= DRAFT_STOP_MILLISECONDS;
      const stale = now - draftSavedAt.current >= DRAFT_MAX_INTERVAL_MILLISECONDS;
      if (!stopped && !stale) return;
      const id = resourceMaterial.current.activeIdRef.current;
      if (id === null) {
        draftActivity.current = 0;
        return;
      }
      draftActivity.current = 0;
      draftSavedAt.current = now;
      void resourceMaterial.current.saveDraft(id).catch(() => {
        // Keep this silent. A draft write failure must not interrupt typing,
        // and the next edit will try again.
      });
    }, DRAFT_POLL_MILLISECONDS);
    return () => window.clearInterval(timer);
  }, []);

  return recordActivity;
}
