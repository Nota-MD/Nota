import type { Toast } from "@/ui/Toasts";
import { api } from "@/bridge/ipc";
import {
  findView,
  heavyNewValueCheckCombineWrite,
  replaceReplaceCombineWrite,
} from "@/editor/spell-check";
import {
  combineWriteAddWordDictionary,
  combineWriteIgnoreOmit,
  combineWriteReplaceReplacePrefix,
} from "@/ui/context-menu";

export interface CombineWriteScene {
  element: HTMLElement;
  word: string;
  createProposalPlural: string[];
}

export function dropToCombineWrite(
  id: string,
  scene: CombineWriteScene | null,
  toast: (message: string, level?: Toast["level"]) => void,
): void {
  if (!scene || !scene.element.isConnected) return;
  const view = findView(scene.element);
  if (!view) return;

  if (id === combineWriteAddWordDictionary || id === combineWriteIgnoreOmit) {
    const action =
      id === combineWriteAddWordDictionary
        ? api.spell.wordAdd(scene.word)
        : api.spell.wordIgnore(scene.word);
    void action
      .then(() => heavyNewValueCheckCombineWrite(view))
      .catch((error) => toast(String(error), "error"));
    return;
  }

  if (!id.startsWith(combineWriteReplaceReplacePrefix)) return;
  const index = Number(id.slice(combineWriteReplaceReplacePrefix.length));
  const replacement = scene.createProposalPlural[index];
  if (!replacement) return;
  const from = view.posAtDOM(scene.element, 0);
  replaceReplaceCombineWrite(view, from, from + scene.word.length, replacement);
}
