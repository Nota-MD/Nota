














import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  awaitLanguageTable,
  requestCodeBlockFocus,
  searchLanguages,
  relatedLanguages,
} from "./code-block";
import { languageIcon } from "./lang-icon";
import { normalizeMathCodeLanguage } from "./math-code";

const candidateLimit = 3;
const popupClass = "nota-fence-lang-popup";
const optionClass = "nota-fence-lang-option";
const selectedClass = "nota-fence-lang-on";


const goodFirstLanguage = new Map(
  [
    "math",
    "mathematica",
    "matlab",
    "python",
    "javascript",
    "typescript",
    "html",
    "css",
    "json",
    "bash",
    "shell",
    "c",
    "cpp",
    "csharp",
    "java",
    "rust",
    "go",
    "sql",
    "yaml",
    "markdown",
  ].map((name3, i) => [name3, i] as const),
);


export function encloseBarLanguageQuery(text2: string): string | null {
  const match = /^```([A-Za-z0-9_+.#-]*)$/.exec(text2);
  return match ? (match[1] ?? "") : null;
}





export function encloseBarLanguageCandidate(
  query: string,
  language: readonly string[] = searchLanguages(),
  distinguishName: (language: string) => readonly string[] = relatedLanguages,
): string[] {
  const smallWrite = query.trim().toLowerCase();
  if (!smallWrite) return [];
  return [...new Set(language)]
    .filter((item5) => distinguishName(item5).some((name3) => name3.toLowerCase().startsWith(smallWrite)))
    .sort((a, b) => {
      const aPreciseConfirm = distinguishName(a).some((name3) => name3.toLowerCase() === smallWrite) ? 1 : 0;
      const bPreciseConfirm = distinguishName(b).some((name3) => name3.toLowerCase() === smallWrite) ? 1 : 0;
      const aGoodFirst = goodFirstLanguage.get(a) ?? 999;
      const bGoodFirst = goodFirstLanguage.get(b) ?? 999;
      return bPreciseConfirm - aPreciseConfirm || aGoodFirst - bGoodFirst || a.localeCompare(b);
    })
    .slice(0, candidateLimit);
}

export type EncloseBarLanguageKeypressAction =
  | "composition"
  | "close"
  | "next"
  | "previous"
  | "commit"
  | null;








export function encloseBarLanguageKeypress(
  key: string,
  isComposing: boolean,
  keyCode: number,
): EncloseBarLanguageKeypressAction {
  if (isComposing || keyCode === 229) return "composition";


  if (key === "Escape" || keyCode === 27) return "close";
  if (key === "ArrowDown" || keyCode === 40) return "next";
  if (key === "ArrowUp" || keyCode === 38) return "previous";
  if (key === "Enter" || keyCode === 13) return "commit";
  if (key === "Tab" || keyCode === 9) return "commit";
  if (key === " " || keyCode === 32) return "commit";
  return null;
}


function currentEncloseBarParagraph(view: EditorView): {
  from: number;
  to: number;
  query: string;
} | null {
  const { state } = view;
  const { $from } = state.selection;
  const darkDegree = $from.depth;
  if (darkDegree < 1 || !$from.parent.isTextblock || $from.parent.type.name !== "paragraph") {
    return null;
  }
  const query = encloseBarLanguageQuery($from.parent.textContent);
  if (query === null || query === "") return null;
  return { from: $from.before(darkDegree), to: $from.after(darkDegree), query };
}





export const encloseBarLanguageFillAll = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-fence-language-suggest"),
      view: (view) => {
        let popup: HTMLElement | null = null;
        let candidate: string[] = [];
        let currentItem = 0;
        let paragraph: { from: number; to: number; query: string } | null = null;
        let fullTableRequested = false;

        const options = () =>
          popup
            ? [...popup.querySelectorAll<HTMLElement>(`.${optionClass}`)]
            : [];

        const activeColor = () => {
          for (const [i, item5] of options().entries()) {
            item5.classList.toggle(selectedClass, i === currentItem);
            item5.setAttribute("aria-selected", String(i === currentItem));
          }
        };

        const close = () => {
          popup?.remove();
          popup = null;
          candidate = [];
          paragraph = null;
          document.removeEventListener("pointerdown", pointExternalSurface, true);
          window.removeEventListener("blur", close);
          window.removeEventListener("resize", close);
          window.removeEventListener("scroll", rollActionDone, true);
        };

        const pointExternalSurface = (e: Event) => {
          if (e.target instanceof Node && popup?.contains(e.target)) return;
          close();
        };

        const rollActionDone = (e: Event) => {
          if (e.target instanceof Node && popup?.contains(e.target)) return;
          close();
        };

        const fixedPosition = () => {
          if (!popup) return;
          const { from } = view.state.selection;
          const r = view.coordsAtPos(from);
          const width = popup.offsetWidth;
          const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
          const height = popup.offsetHeight;
          const below = r.bottom + 6;
          popup.style.left = `${left}px`;
          popup.style.top =
            below + height < window.innerHeight - 8
              ? `${below}px`
              : `${Math.max(8, r.top - height - 6)}px`;
        };

        const replaceBecomeCodeBlock = (language: string) => {
          const { state } = view;
          const { $from } = state.selection;
          const darkDegree = $from.depth;
          if (darkDegree < 1 || $from.parent.type.name !== "paragraph") {
            close();
            return;
          }
          const from = $from.before(darkDegree);
          const to = $from.after(darkDegree);
          const type = state.schema.nodes.code_block;
          if (!type) {
            close();
            return;
          }
          const before = state.doc.resolve(from);
          const index = before.index();
          if (!before.parent.canReplaceWith(index, index + 1, type)) {
            close();
            return;
          }

          const node = type.create({ language: normalizeMathCodeLanguage(language) });
          const tr = state.tr.replaceWith(from, to, node);
          tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from + 1, tr.doc.content.size))));
          view.dispatch(tr.scrollIntoView());
          close();
          if (!requestCodeBlockFocus(view, from)) view.focus();
        };

        const heavyDraw = () => {
          const newValueParagraph = currentEncloseBarParagraph(view);
          if (!newValueParagraph) {
            close();
            return;
          }
          paragraph = newValueParagraph;
          candidate = encloseBarLanguageCandidate(newValueParagraph.query, searchLanguages(), relatedLanguages);
          if (!fullTableRequested) {
            fullTableRequested = true;
            void awaitLanguageTable()
              .then(() => {
                if (popup && paragraph) heavyDraw();
              })
              .catch((error: unknown) => {
                console.warn("[nota] Full code-language list failed to load; code fences use the core list:", error);
              });
          }
          if (candidate.length === 0) {
            close();
            return;
          }
          currentItem = Math.min(currentItem, candidate.length - 1);

          if (!popup) {
            popup = document.createElement("div");
            popup.className = popupClass;
            popup.setAttribute("role", "listbox");
            popup.setAttribute("aria-label", "Code Language");
            document.body.appendChild(popup);
          }

          popup.replaceChildren();
          for (const [i, language] of candidate.entries()) {
            const item5 = document.createElement("div");
            item5.className = optionClass;
            item5.dataset.lang = language;
            item5.setAttribute("role", "option");
            item5.append(languageIcon(language), document.createTextNode(language));
            item5.addEventListener("mousedown", (e) => e.preventDefault());
            item5.addEventListener("pointerenter", () => {
              currentItem = i;
              activeColor();
            });
            item5.addEventListener("click", () => replaceBecomeCodeBlock(language));
            popup.appendChild(item5);
          }
          activeColor();
          fixedPosition();

          document.addEventListener("pointerdown", pointExternalSurface, true);
          window.addEventListener("blur", close);
          window.addEventListener("resize", close);
          window.addEventListener("scroll", rollActionDone, true);
        };

        const keypress = (event: KeyboardEvent) => {
          if (!popup || !paragraph) return;
          const action = encloseBarLanguageKeypress(event.key, event.isComposing, event.keyCode);
          if (!action || action === "composition") return;
          if (action === "close") {
            close();
          } else if (action === "next") {
            currentItem = Math.min(currentItem + 1, candidate.length - 1);
            activeColor();
          } else if (action === "previous") {
            currentItem = Math.max(currentItem - 1, 0);
            activeColor();
          } else {
            const language = candidate[currentItem];
            if (!language) return;
            replaceBecomeCodeBlock(language);
          }
          event.preventDefault();
          event.stopPropagation();
        };



        if (view.editable) view.dom.addEventListener("keydown", keypress, true);

        return {
          update: (current, aboveValue) => {
            if (current.state.doc === aboveValue.doc) {
              if (current.state.selection.from !== aboveValue.selection.from) close();
              return;
            }
            if (popup || currentEncloseBarParagraph(current)) queueMicrotask(heavyDraw);
          },
          destroy: () => {
            view.dom.removeEventListener("keydown", keypress, true);
            close();
          },
          props: {
            handleTextInput: (current: EditorView, _from: number, _to: number, character2: string) => {
              if (!current.editable || character2.includes("\n")) return false;
              queueMicrotask(() => {
                const text2 = current.state.selection.$from.parent.textContent;
                const query = encloseBarLanguageQuery(text2);
                if (query && query.length > 0) heavyDraw();
              });
              return false;
            },
          },
        };
      },
    }),
);
