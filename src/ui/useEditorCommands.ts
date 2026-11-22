































import { useCallback, type RefObject } from "react";

import { useT } from "@/i18n";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Dialogs } from "@/ui/useDialogs";
import { cursorPlaceThatItemLink } from "@/ui/useLinkClick";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import type { Toast } from "@/ui/Toasts";

export interface commandWiring {

  editorRef: RefObject<EditorPaneHandle | null>;

  askLink: Dialogs["askLink"];
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface commandApi {

  run: (c: EditorCommand, payload?: CommandPayload) => void;

  insertLink: () => Promise<void>;
}

export function useEditorCommands(w: commandWiring): commandApi {


  const t = useT();
  const { editorRef, askLink, toast } = w;


  const handoffCommand = useCallback(
    (c: EditorCommand, payload?: CommandPayload) => {
      if (!editorRef.current?.runCommand(c, payload)) {
        toast(t("This action is not available in the current editing mode."), "info");
      }
    },
    [editorRef, toast],
  );












  const insertLink = useCallback(async () => {
    const current2 = cursorPlaceThatItemLink();
    const answer = await askLink({
      label: current2?.label ?? editorRef.current?.selection()?.text ?? "",
      href: current2?.href ?? "",
      editing: current2 !== null,
    });
    if (!answer) return;
    if (answer.kind === "remove") handoffCommand("linkRemove");
    else handoffCommand("linkSet", { href: answer.href, label: answer.label });
  }, [askLink, handoffCommand, editorRef]);

  const run = useCallback(
    (c: EditorCommand, payload?: CommandPayload) => {



      if (c === "link") {
        void insertLink();
        return;
      }
      handoffCommand(c, payload);
    },
    [handoffCommand, insertLink],
  );

  return { run, insertLink };
}
