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

import { searchLanguages, 同族语言 } from "./code-block";
import { languageIcon } from "./lang-icon";

const 候选上限 = 3;
const 弹层类 = "nota-fence-lang-popup";
const 选项类 = "nota-fence-lang-option";
const 选中类 = "nota-fence-lang-on";

/** 高频语言优先；不在表里的按字母序。`mat` 因此稳定得到截图里的三行。 */
const 优先语言 = new Map(
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
  ].map((名, i) => [名, i] as const),
);

/** 从一段普通文本里取出围栏后的语言查询；不是“```＋语言”就返回 null。 */
export function 围栏语言查询(文本: string): string | null {
  const 命中 = /^```([A-Za-z0-9_+.#-]*)$/.exec(文本);
  return 命中 ? (命中[1] ?? "") : null;
}

/**
 * 按前缀挑语言。`mat` 只保留 `math`、`mathematica`、`matlab` 这类前缀命中；
 * 不做“包含”匹配，避免 `icu-message-format` 这种完全不相干的长尾混进来。
 */
export function 围栏语言候选(
  查询: string,
  语言: readonly string[] = searchLanguages(),
  别名: (语言: string) => readonly string[] = 同族语言,
): string[] {
  const 小写 = 查询.trim().toLowerCase();
  if (!小写) return [];
  return [...new Set(语言)]
    .filter((项) => 别名(项).some((名) => 名.toLowerCase().startsWith(小写)))
    .sort((a, b) => {
      const a精确 = 别名(a).some((名) => 名.toLowerCase() === 小写) ? 1 : 0;
      const b精确 = 别名(b).some((名) => 名.toLowerCase() === 小写) ? 1 : 0;
      const a优先 = 优先语言.get(a) ?? 999;
      const b优先 = 优先语言.get(b) ?? 999;
      return b精确 - a精确 || a优先 - b优先 || a.localeCompare(b);
    })
    .slice(0, 候选上限);
}

/** 当前光标所在的顶层普通段落，以及它在文档里的位置。 */
function 当前围栏段落(view: EditorView): {
  from: number;
  to: number;
  查询: string;
} | null {
  const { state } = view;
  const { $from } = state.selection;
  const 深度 = $from.depth;
  if (深度 < 1 || !$from.parent.isTextblock || $from.parent.type.name !== "paragraph") {
    return null;
  }
  const 查询 = 围栏语言查询($from.parent.textContent);
  if (查询 === null || 查询 === "") return null;
  return { from: $from.before(深度), to: $from.after(深度), 查询 };
}

/**
 * 只给可编辑实例装。只读预览与导出离屏实例不会有输入，装了也不会出现；
 * 仍在这里明确返回空，避免将来只读 DOM 里混进一条浮层。
 */
export const 围栏语言补全 = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-fence-language-suggest"),
      view: (view) => {
        let 弹层: HTMLElement | null = null;
        let 候选: string[] = [];
        let 当前项 = 0;
        let 段落: { from: number; to: number; 查询: string } | null = null;

        const 选项们 = () =>
          弹层
            ? [...弹层.querySelectorAll<HTMLElement>(`.${选项类}`)]
            : [];

        const 着色 = () => {
          for (const [i, 项] of 选项们().entries()) {
            项.classList.toggle(选中类, i === 当前项);
            项.setAttribute("aria-selected", String(i === 当前项));
          }
        };

        const 关闭 = () => {
          弹层?.remove();
          弹层 = null;
          候选 = [];
          段落 = null;
          document.removeEventListener("pointerdown", 点外面, true);
          window.removeEventListener("blur", 关闭);
          window.removeEventListener("resize", 关闭);
          window.removeEventListener("scroll", 滚动了, true);
        };

        const 点外面 = (e: Event) => {
          if (e.target instanceof Node && 弹层?.contains(e.target)) return;
          关闭();
        };

        const 滚动了 = (e: Event) => {
          if (e.target instanceof Node && 弹层?.contains(e.target)) return;
          关闭();
        };

        const 定位 = () => {
          if (!弹层) return;
          const { from } = view.state.selection;
          const r = view.coordsAtPos(from);
          const 宽 = 弹层.offsetWidth;
          const 左 = Math.max(8, Math.min(r.left, window.innerWidth - 宽 - 8));
          const 高 = 弹层.offsetHeight;
          const 下 = r.bottom + 6;
          弹层.style.left = `${左}px`;
          弹层.style.top =
            下 + 高 < window.innerHeight - 8
              ? `${下}px`
              : `${Math.max(8, r.top - 高 - 6)}px`;
        };

        const 换成代码块 = (语言: string) => {
          const { state } = view;
          const { $from } = state.selection;
          const 深度 = $from.depth;
          if (深度 < 1 || $from.parent.type.name !== "paragraph") {
            关闭();
            return;
          }
          const from = $from.before(深度);
          const to = $from.after(深度);
          const 类型 = state.schema.nodes.code_block;
          if (!类型) {
            关闭();
            return;
          }
          const $前 = state.doc.resolve(from);
          const 序号 = $前.index();
          if (!$前.parent.canReplaceWith(序号, 序号 + 1, 类型)) {
            关闭();
            return;
          }

          const 节点 = 类型.create({ language: 语言 });
          const tr = state.tr.replaceWith(from, to, 节点);
          tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from + 1, tr.doc.content.size))));
          view.dispatch(tr.scrollIntoView());
          关闭();
          queueMicrotask(() => view.focus());
        };

        const 重画 = () => {
          const 新段落 = 当前围栏段落(view);
          if (!新段落) {
            关闭();
            return;
          }
          段落 = 新段落;
          候选 = 围栏语言候选(新段落.查询, searchLanguages(), 同族语言);
          if (候选.length === 0) {
            关闭();
            return;
          }
          当前项 = Math.min(当前项, 候选.length - 1);

          if (!弹层) {
            弹层 = document.createElement("div");
            弹层.className = 弹层类;
            弹层.setAttribute("role", "listbox");
            弹层.setAttribute("aria-label", "Code Language");
            document.body.appendChild(弹层);
          }

          弹层.replaceChildren();
          for (const [i, 语言] of 候选.entries()) {
            const 项 = document.createElement("div");
            项.className = 选项类;
            项.dataset.lang = 语言;
            项.setAttribute("role", "option");
            项.append(languageIcon(语言), document.createTextNode(语言));
            项.addEventListener("mousedown", (e) => e.preventDefault());
            项.addEventListener("pointerenter", () => {
              当前项 = i;
              着色();
            });
            项.addEventListener("click", () => 换成代码块(语言));
            弹层.appendChild(项);
          }
          着色();
          定位();

          document.addEventListener("pointerdown", 点外面, true);
          window.addEventListener("blur", 关闭);
          window.addEventListener("resize", 关闭);
          window.addEventListener("scroll", 滚动了, true);
        };

        return {
          update: (current, 上一) => {
            if (current.state.doc === 上一.doc) {
              if (current.state.selection.from !== 上一.selection.from) 关闭();
              return;
            }
            if (弹层 || 当前围栏段落(current)) queueMicrotask(重画);
          },
          destroy: 关闭,
          props: {
            handleTextInput: (current: EditorView, _from: number, _to: number, 字: string) => {
              if (!current.editable || 字.includes("\n")) return false;
              queueMicrotask(() => {
                const 文本 = current.state.selection.$from.parent.textContent;
                const 查询 = 围栏语言查询(文本);
                if (查询 && 查询.length > 0) 重画();
              });
              return false;
            },
            handleKeyDown: (_current: EditorView, e: KeyboardEvent) => {
              if (!弹层 || !段落) return false;
              if (e.isComposing) return false;
              if (e.key === "Escape") {
                关闭();
                return true;
              }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                当前项 =
                  e.key === "ArrowDown"
                    ? Math.min(当前项 + 1, 候选.length - 1)
                    : Math.max(当前项 - 1, 0);
                着色();
                return true;
              }
              if (e.key === "Enter" || e.key === "Tab" || e.key === " ") {
                const 语言 = 候选[当前项];
                if (!语言) return false;
                换成代码块(语言);
                return true;
              }
              return false;
            },
          },
        };
      },
    }),
);
