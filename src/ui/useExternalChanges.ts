







































import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  api,
  events,
  on,
  type DiffLine,
  type DocId,
  type Document,
  type FileChangedPayload,
} from "@/bridge/ipc";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Toast } from "@/ui/Toasts";



export interface ExternalPartChangeAction {
  id: DocId;

  path: string;

  hash: string;

  title: string;
}


export interface ExternalPartCorrectAccording {
  id: DocId;
  title: string;
  /** Raw file contents currently on disk; the editor renders this as the target preview. */
  diskText: string;

  line3: DiffLine[];
}

interface wiring {

  docs: readonly Document[];

  activeIdRef: { current: DocId | null };
  editorRef: { current: EditorPaneHandle | null };

  reloadDoc: (id: DocId) => Promise<void>;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface ExternalPartChangeActionOutputMouth {

  changeAction: ExternalPartChangeAction[];

  ignoreOmit: (id: DocId) => void;

  heavyNewValueLoadEnter: (id: DocId) => Promise<void>;

  checkSeeFixChange: (id: DocId) => Promise<ExternalPartCorrectAccording | null>;

  correctAccording: ExternalPartCorrectAccording | null;

  closeCorrectAccording: () => void;
}

export function useExternalChanges(w: wiring): ExternalPartChangeActionOutputMouth {


  const { docs, activeIdRef, editorRef, reloadDoc, toast } = w;

  const [changeAction, setChangeAction] = useState<ExternalPartChangeAction[]>([]);
  const [correctAccording, setCorrectAccording] = useState<ExternalPartCorrectAccording | null>(null);






  const docsRef = useRef(docs);
  docsRef.current = docs;


  //




  const pathKey = useMemo(
    () => docs.map((d) => `${d.id}:${d.path ?? ""}`).join("|"),
    [docs],
  );

  useEffect(() => {
    const table2 = docs
      .filter((d): d is Document & { path: string } => !!d.path)
      .map((d) => ({ id: d.id, path: d.path }));



    void api.watch.sync(table2).catch((e) => {
      console.warn("[nota] Could not sync the external-change watch list:", e);
    });
  }, [pathKey]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let returnActiveActive = true;

    void on<FileChangedPayload>(events.fileChanged, ({ id, path, hash }) => {


      setChangeAction((oldValue) => {
        const thatOneItem = oldValue.find((c) => c.id === id);

        if (thatOneItem?.hash === hash) return oldValue;
        const document = docsRef.current.find((d) => d.id === id);
        const newValueItem: ExternalPartChangeAction = {
          id,
          path,
          hash,



          title: document?.title ?? path.split("/").pop() ?? path,
        };
        return thatOneItem ? oldValue.map((c) => (c.id === id ? newValueItem : c)) : [...oldValue, newValueItem];
      });
    }).then((u) => {
      if (returnActiveActive) unsubscribe = u;
      else u();
    });

    return () => {
      returnActiveActive = false;
      unsubscribe?.();
    };
  }, []);



  const ignoreOmit = useCallback((id: DocId) => {
    setChangeAction((oldValue) => oldValue.filter((c) => c.id !== id));
  }, []);

  const heavyNewValueLoadEnter = useCallback(
    async (id: DocId) => {



      await reloadDoc(id);
      setChangeAction((oldValue) => oldValue.filter((c) => c.id !== id));


      setCorrectAccording((oldValue) => (oldValue?.id === id ? null : oldValue));
    },
    [reloadDoc],
  );

  const checkSeeFixChange = useCallback(
    async (id: DocId): Promise<ExternalPartCorrectAccording | null> => {
      try {


        //




        const handHead =
          id === activeIdRef.current
            ? editorRef.current?.getMarkdown()
            : undefined;
        const selfPluralOf = handHead ?? docsRef.current.find((d) => d.id === id)?.text ?? "";
        const disk = await api.doc.diskText(id);
        const line3 = await api.diff.texts(selfPluralOf, disk);
        const markTitle = docsRef.current.find((d) => d.id === id)?.title ?? "";
        const oneDocument: ExternalPartCorrectAccording = { id, title: markTitle, diskText: disk, line3 };
        setCorrectAccording(oneDocument);
        return oneDocument;
      } catch (e) {
        toast(String(e), "error");
        return null;
      }
    },
    [activeIdRef, editorRef, toast],
  );

  const closeCorrectAccording = useCallback(() => setCorrectAccording(null), []);

  return { changeAction, ignoreOmit, heavyNewValueLoadEnter, checkSeeFixChange, correctAccording, closeCorrectAccording };
}
