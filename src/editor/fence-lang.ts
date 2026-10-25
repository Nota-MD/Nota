/**
 * 围栏语言补全：在普通段落里输入 ```mat 时，直接把语言候选显示在光标下方。
 *
 * 这里**不提前把段落换成代码块**。用户还在输入语言名时，文档仍是普通段落；
 * 选定候选（Enter / Tab / Space / 点击）之后才用一笔事务换成真正的
 * `code_block(language=...)`。这样：
 *
 * - 退格、修改查询都仍然是普通文本编辑；
 * - 候选不会把半截语言写进节点属性；
 * - 上游原有的“```＋空格/回车”输入规则照旧可用，这里只是一条更快的路径。
 *
 * 弹层挂在 `document.body`，与 `lang-picker.ts` 相同：编辑区会滚动、会重排，
 * 固定定位要按视口坐标自己算；弹层也不该进入 ProseMirror 的文档 DOM。
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { searchLanguages, relatedLanguages } from "./code-block";
import { languageIcon } from "./lang-icon";

const candidateLimit = 3;
const popupClass = "nota-fence-lang-popup";
const optionClass = "nota-fence-lang-option";
const selectedClass = "nota-fence-lang-on";

/** 高频语言优先；不在表里的按字母序。`mat` 因此稳定得到截图里的三行。 */
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

/** 从一段普通文本里取出围栏后的语言查询；不是“```＋语言”就返回 null。 */
export function encloseBarLanguageQuery(text2: string): string | null {
  const match = /^```([A-Za-z0-9_+.#-]*)$/.exec(text2);
  return match ? (match[1] ?? "") : null;
}

/**
 * 按前缀挑语言。`mat` 只保留 `math`、`mathematica`、`matlab` 这类前缀命中；
 * 不做“包含”匹配，避免 `icu-message-format` 这种完全不相干的长尾混进来。
 */
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

/**
 * 候选弹层的按键语义。
 *
 * ⚠️ 真窗口里按键先经过编辑器的 DOM capture 监听，再轮到 ProseMirror 的普通
 * `handleKeyDown`。安装和候选显示那两帧常常紧挨着，走普通 prop 时 Enter 会被
 * 段落换行抢走；这个纯函数只定义动作，接线必须用 capture，理由见插件 view。
 */
export function encloseBarLanguageKeypress(
  key: string,
  isComposing: boolean,
  keyCode: number,
): EncloseBarLanguageKeypressAction {
  if (isComposing || keyCode === 229) return "composition";
  // ⚠️ WebKitGTK 在部分键盘布局上会把 `key` 报成 `Unidentified`；`keyCode`
  // 仍保留标准值，所以两条判据都要看（与表格里的 Shift+Tab 是同一类现场）。
  if (key === "Escape" || keyCode === 27) return "close";
  if (key === "ArrowDown" || keyCode === 40) return "next";
  if (key === "ArrowUp" || keyCode === 38) return "previous";
  if (key === "Enter" || keyCode === 13) return "commit";
  if (key === "Tab" || keyCode === 9) return "commit";
  if (key === " " || keyCode === 32) return "commit";
  return null;
}

/** 当前光标所在的顶层普通段落，以及它在文档里的位置。 */
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

/**
 * 只给可编辑实例装。只读预览与导出离屏实例不会有输入，装了也不会出现；
 * 仍在这里明确返回空，避免将来只读 DOM 里混进一条浮层。
 */
export const encloseBarLanguageFillAll = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-fence-language-suggest"),
      view: (view) => {
        let popup: HTMLElement | null = null;
        let candidate: string[] = [];
        let currentItem = 0;
        let paragraph: { from: number; to: number; query: string } | null = null;

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

          const node = type.create({ language: language });
          const tr = state.tr.replaceWith(from, to, node);
          tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from + 1, tr.doc.content.size))));
          view.dispatch(tr.scrollIntoView());
          close();
          queueMicrotask(() => view.focus());
        };

        const heavyDraw = () => {
          const newValueParagraph = currentEncloseBarParagraph(view);
          if (!newValueParagraph) {
            close();
            return;
          }
          paragraph = newValueParagraph;
          candidate = encloseBarLanguageCandidate(newValueParagraph.query, searchLanguages(), relatedLanguages);
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

        // ⚠️ 这是本插件在真窗口里的主路径。普通 `props.handleKeyDown` 会与
        // 上游普通回车处理争同一颗键，症状正是“候选已经显示，Enter 却换了一行”。
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
