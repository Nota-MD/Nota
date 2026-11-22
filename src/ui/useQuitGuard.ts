



































import { useEffect, useRef } from "react";

import { api, events, on, type Document, type DocId } from "@/bridge/ipc";
import { t } from "@/i18n";
import type { Toast } from "@/ui/Toasts";
import type { Dialogs } from "@/ui/useDialogs";

export function useQuitGuard(w: {

  docs: readonly Document[];
  saveDoc: (id: DocId) => Promise<boolean>;
  toast: (message: string, level?: Toast["level"]) => void;
  askConfirm: Dialogs["askConfirm"];
}): void {
  const { docs, saveDoc, toast, askConfirm } = w;











  const mostNewValue = useRef({ docs, saveDoc, toast, askConfirm });
  mostNewValue.current = { docs, saveDoc, toast, askConfirm };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let uninstallDone = false;




    let correctAtEnterLine = false;
    void on(events.quitRequested, () => {
      if (correctAtEnterLine) return;
      correctAtEnterLine = true;
      void (async () => {
        const { docs: table2, saveDoc: save, toast: notice, askConfirm: ask } = mostNewValue.current;
        const dirtyOf = table2.filter((d) => d.dirty);
        try {



          if (dirtyOf.length) {
            const answer = await ask({
              title: t("Has unsaved changes"),
              message: t("Still unsaved: {0}. Save before quitting?", nameSingle(dirtyOf)),
              extraLabel: t("Save All and Quit"),
              confirmLabel: t("Discard and Quit"),
              danger: true,
            });
            if (answer === "cancel") return;
            if (answer === "extra") {
              for (const d of dirtyOf) {
                if (!(await save(d.id))) {
                  notice(
                    t("Could not save “{0}”, so Nota is staying open", d.title),
                    "error",
                  );
                  return;
                }
              }
            } else {
              for (const d of dirtyOf) {
                await api.draft.discardDocument(d.id).catch(() => undefined);
              }
            }
          }
          await api.window.quit();
        } finally {


          correctAtEnterLine = false;
        }
      })();
    }).then((fn) => {
      unsubscribe = fn;



      if (uninstallDone) fn();
    });
    return () => {
      uninstallDone = true;
      unsubscribe?.();
    };
  }, []);
}


function nameSingle(dirtyOf: readonly Document[]): string {
  const name2 = dirtyOf.map((d) => d.title);
  if (name2.length <= 3) return name2.join(", ");

  return t("{0} and {1} more", name2.slice(0, 3).join(", "), name2.length - 3);
}
