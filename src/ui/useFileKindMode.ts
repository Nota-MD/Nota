



































































import { useCallback, useEffect, useRef, useState } from "react";

import type { DocId, Document, ViewMode } from "@/bridge/ipc";
import {
  actualMode,
  lowerLevelReason,
  type LowerLevelReason as reason,
} from "@/editor/file-kind";
import type { Toast } from "@/ui/Toasts";


export interface input {

  docs: Document[];

  activeId: DocId | null;

  toast: (message: string, level?: Toast["level"]) => void;

  t: (source: string, ...parameter: (string | number)[]) => string;
}

export interface OutputMouth {

  mode2: ViewMode;







  preference: ViewMode;








  setMode: (m: ViewMode) => void;
}

export function useFileKind(input: input): OutputMouth {
  const { docs, activeId, toast, t } = input;





  const [modePreference, setModePreference] = useState<ViewMode>("wysiwyg");







  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);







  const [lowerLevelTable, setLowerLevelTable] = useState<ReadonlyMap<DocId, reason>>(() => new Map());


  const determinePass = useRef(new Set<DocId>());

  const noticePass = useRef(new Set<DocId>());


  //



  useEffect(() => {
    const atWorld = new Set(docs.map((d) => d.id));






    let hasDummy = false;
    for (const id of determinePass.current) {
      if (!atWorld.has(id)) {
        determinePass.current.delete(id);
        noticePass.current.delete(id);
        hasDummy = true;
      }
    }


    const newValueLowerLevel: Array<[DocId, reason]> = [];
    for (const d of docs) {
      if (determinePass.current.has(d.id)) continue;
      determinePass.current.add(d.id);


      const reason = lowerLevelReason(d.path, d.text.length);
      if (reason) newValueLowerLevel.push([d.id, reason]);
    }

    if (!hasDummy && newValueLowerLevel.length === 0) return;

    setLowerLevelTable((oldValue) => {
      const newValue = new Map<DocId, reason>();
      for (const [id, reason] of oldValue) if (atWorld.has(id)) newValue.set(id, reason);
      for (const [id, reason] of newValueLowerLevel) newValue.set(id, reason);
      return newValue;
    });
  }, [docs]);


  useEffect(() => {
    if (activeId === null) return;
    const reason = lowerLevelTable.get(activeId);
    if (!reason || noticePass.current.has(activeId)) return;
    const d = docs.find((x) => x.id === activeId);
    if (!d) return;
    noticePass.current.add(activeId);
    if (reason === "text") {
      toast(
        t(
          "“{0}” is not a Markdown file, so it opened in Source mode.",
          d.title,
        ),
      );
    } else {
      toast(
        t(
          "“{0}” is very large ({1} characters), so it opened in Source mode to keep typing responsive.",
          d.title,
          d.text.length,
        ),
      );
    }
  }, [activeId, lowerLevelTable, docs, toast, t]);


  const thisOneDocumentOfReason: reason | null =
    activeId === null ? null : (lowerLevelTable.get(activeId) ?? null);




  const mode2 = actualMode(modePreference, thisOneDocumentOfReason);


  const setMode = useCallback((m: ViewMode) => {
    setModePreference(m);
    const id = activeIdRef.current;
    if (id === null) return;
    setLowerLevelTable((oldValue) => {
      if (!oldValue.has(id)) return oldValue;
      const newValue = new Map(oldValue);
      newValue.delete(id);
      return newValue;
    });
  }, []);

  return { mode2, preference: modePreference, setMode };
}
