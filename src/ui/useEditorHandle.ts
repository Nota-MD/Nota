
































import { useImperativeHandle, type Ref, type RefObject } from "react";

import type { SelectionContent, CommandPayload, EditorCommand, EditorHandle } from "@/editor/create";
import type { FindOptions } from "@/editor/find";
import type { SourceHandle } from "@/editor/source";
import type { EditorPaneHandle } from "@/ui/EditorPane";


export interface SentenceHandleWiring {

  ref?: Ref<EditorPaneHandle>;

  mainSentenceHandleRef: RefObject<EditorHandle | SourceHandle | null>;

  previewSentenceHandleRef: RefObject<EditorHandle | null>;

  mostNewTextLocalRef: RefObject<string>;
}

export function useEditorSentenceHandle({
  ref,
  mainSentenceHandleRef,
  previewSentenceHandleRef,
  mostNewTextLocalRef,
}: SentenceHandleWiring): void {

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => mainSentenceHandleRef.current?.getMarkdown(),
      setMarkdown: (markdown: string) => {
        mostNewTextLocalRef.current = markdown;
        mainSentenceHandleRef.current?.setMarkdown(markdown);
        previewSentenceHandleRef.current?.setMarkdown(markdown);
      },
      runCommand: (name: EditorCommand, payload?: CommandPayload) =>
        mainSentenceHandleRef.current?.runCommand(name, payload) ?? false,

      insertAtCursorPlace: (text: string) => mainSentenceHandleRef.current?.insertAtCursorPlace(text) ?? false,




      setFind: (query: string, options: FindOptions) =>
        mainSentenceHandleRef.current?.setFind(query, options),
      findStep: (direction: 1 | -1) => mainSentenceHandleRef.current?.findStep(direction),
      clearFind: () => mainSentenceHandleRef.current?.clearFind(),
      replaceCurrent: (text: string) => mainSentenceHandleRef.current?.replaceCurrent(text) ?? false,
      replaceAll: (text: string) => mainSentenceHandleRef.current?.replaceAll(text) ?? 0,


      selection: (): SelectionContent | null => mainSentenceHandleRef.current?.selection() ?? null,

      jumpToMarkTitle: (target: { line: number; index: number }) =>
        mainSentenceHandleRef.current?.jumpToMarkTitle(target),
      focus: () => mainSentenceHandleRef.current?.focus(),
    }),




    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
