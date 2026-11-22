








































import { useCallback, useEffect, useRef, useState } from "react";

import { api, type DocId, type Document, type StartupAction } from "@/bridge/ipc";
import type { Toast } from "@/ui/Toasts";







const dropDiskDelayDelay = 400;








const rollActionDropDiskDelayDelay = 500;

export interface MeetingSpeechWiring {

  docs: readonly Document[];

  activeId: DocId | null;




  openPath: (path: string) => Promise<boolean>;









  newDocument: () => Promise<void>;

  connectAboveCurrentHas: () => Promise<boolean>;








  setWorkspace: (w: string | null) => void;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface MeetingSpeechOutputMouth {






  recent: readonly string[];













  connectAboveMeetingSpeech: (startActionTextItem: string | null, startActionLevel: StartupAction) => Promise<void>;

  rollActionPosition: (path: string | null | undefined) => number | undefined;

  recordRollAction: (path: string, compareExample: number) => void;

  openRecent: (path: string) => Promise<void>;

  forgetRemoveRecent: (path: string) => Promise<void>;

  clearEmptyRecent: () => Promise<void>;
}

export function useSession(w: MeetingSpeechWiring): MeetingSpeechOutputMouth {



  const { docs, activeId, openPath, newDocument, connectAboveCurrentHas, setWorkspace, toast } = w;

  const [recent, setRecent] = useState<readonly string[]>([]);









  const [rollAction, setRollAction] = useState<Record<string, number>>({});




  const thenThread = useRef(false);

  const pendingWrite = useRef(new Map<string, number>());
  const rollActionCountTime = useRef<number | null>(null);


  const isOpen = useCallback((): [string[], string | null] => {
    const path = docs.map((d) => d.path).filter((p): p is string => !!p);
    const beforePlatform = docs.find((d) => d.id === activeId)?.path ?? null;
    return [path, beforePlatform];
  }, [docs, activeId]);

  const connectAboveMeetingSpeech = useCallback(
    async (startActionTextItem: string | null, startActionLevel: StartupAction) => {
      let alreadyAccuratePrepareDocument = false;
      try {



        if (!startActionTextItem && startActionLevel === "new-file") {
          alreadyAccuratePrepareDocument = await connectAboveCurrentHas();
          if (!alreadyAccuratePrepareDocument) {
            await newDocument();
            alreadyAccuratePrepareDocument = true;
          }
        }

        const MeetingSpeech = await api.session.get();
        setRecent(MeetingSpeech.recent);
        setRollAction(MeetingSpeech.scroll);


        //




        //




        //


        if (startActionLevel === "last-session" && MeetingSpeech.workspace) {


          void api.workspace
            .open(MeetingSpeech.workspace)
            .then(setWorkspace)
            .catch((e) => {
              console.warn("[nota] The previous workspace cannot be opened; skipping restore:", e);
            });
        }


        //




        if (!startActionTextItem && startActionLevel !== "new-file") {



          const itsRemaining = MeetingSpeech.open.filter((p) => p !== MeetingSpeech.active);
          for (const p of itsRemaining) {
            if (await openPath(p)) alreadyAccuratePrepareDocument = true;
          }
          if (MeetingSpeech.active && (await openPath(MeetingSpeech.active))) alreadyAccuratePrepareDocument = true;




          if (MeetingSpeech.open.length) setRecent((await api.session.get()).recent);
        }


        //






        //


        //



        if (!startActionTextItem && !alreadyAccuratePrepareDocument && !(await connectAboveCurrentHas())) await newDocument();
      } catch (e) {


        console.warn("[nota] Could not read the session:", e);
        if (!startActionTextItem && !alreadyAccuratePrepareDocument) {
          const connectAboveDone = await connectAboveCurrentHas().catch(() => false);
          if (!connectAboveDone) await newDocument();
        }
      } finally {


        thenThread.current = true;
      }
    },
    [openPath, newDocument, setWorkspace, connectAboveCurrentHas],
  );


  //




  const pathKey = docs
    .map((d) => d.path)
    .filter((p): p is string => !!p)
    .join("\n");
  const beforePlatform = docs.find((d) => d.id === activeId)?.path ?? null;

  useEffect(() => {
    if (!thenThread.current) return;
    const countTime = window.setTimeout(() => {



      const columnTable = pathKey ? pathKey.split("\n") : [];
      void api.session.setOpen(columnTable, beforePlatform).catch((e) => {
        console.warn("[nota] Could not save the session:", e);
      });
    }, dropDiskDelayDelay);
    return () => window.clearTimeout(countTime);
  }, [pathKey, beforePlatform]);



  const recordRollAction = useCallback((path: string, compareExample: number) => {
    if (!thenThread.current) return;
    pendingWrite.current.set(path, compareExample);



    if (rollActionCountTime.current !== null) return;
    rollActionCountTime.current = window.setTimeout(() => {
      rollActionCountTime.current = null;
      const batch2 = new Map(pendingWrite.current);
      pendingWrite.current.clear();
      if (batch2.size === 0) return;


      setRollAction((table2) => ({ ...table2, ...Object.fromEntries(batch2) }));
      for (const [p, r] of batch2) {
        void api.session.setScroll(p, r).catch((e) => {
          console.warn("[nota] Could not save the scroll position:", e);
        });
      }
    }, rollActionDropDiskDelayDelay);
  }, []);

  const rollActionPosition = useCallback(




    (path: string | null | undefined) => (path ? rollAction[path] : undefined),
    [rollAction],
  );



  const forgetRemoveRecent = useCallback(async (path: string) => {
    setRecent((columnTable) => columnTable.filter((p) => p !== path));
    try {
      await api.session.forgetRecent(path);
    } catch (e) {
      console.warn("[nota] Could not clear recent items:", e);
    }
  }, []);

  const openRecent = useCallback(
    async (path: string) => {



      if (await openPath(path)) return;
      await forgetRemoveRecent(path);
    },
    [openPath, forgetRemoveRecent],
  );

  const clearEmptyRecent = useCallback(async () => {

    setRecent([]);
    setRollAction({});
    try {
      await api.session.clear();




      const [columnTable, beforePlatform] = isOpen();
      if (columnTable.length) await api.session.setOpen(columnTable, beforePlatform);
    } catch (e) {
      toast(String(e), "error");
    }
  }, [isOpen, toast]);

  return { recent, connectAboveMeetingSpeech, rollActionPosition, recordRollAction, openRecent, forgetRemoveRecent, clearEmptyRecent };
}


export function textItemName(path: string): string {
  const paragraph2 = path.split(/[/\\]/).filter(Boolean);
  return paragraph2[paragraph2.length - 1] ?? path;
}







export function parentItemRecordName(path: string): string {
  const paragraph2 = path.split(/[/\\]/).filter(Boolean);
  return paragraph2.length >= 2 ? paragraph2[paragraph2.length - 2]! : "";
}






export function recentItemName(path: string): string {
  const parent = parentItemRecordName(path);
  return parent ? `${textItemName(path)} — ${parent}` : textItemName(path);
}
