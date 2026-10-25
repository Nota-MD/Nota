/**
 * 块级 HTML 的显示层：**安全渲染，源码保持原样**。
 *
 * `html-block.ts` 负责把块级 `html` 节点接进 ProseMirror，并在存盘时逐字写回。
 * 本文件只接 `toDOM` 之后的显示：把 `attrs.value` 交给 DOMPurify，按受控的
 * 标签与属性白名单生成一个只读视图。它不参与 Markdown 的解析或序列化，因此
 * “打开再保存，字节不变”仍由 schema 那一侧保证。
 *
 * 渲染范围覆盖 README 中常见的 HTML 片段：居中段落、标题、链接、图片、徽章、
 * 表格、引用、代码、details/summary 等。脚本、iframe、表单、内联样式、事件
 * 属性与危险 URL 不会进入编辑区 DOM。
 *
 * HTML 块在普通状态下显示渲染结果。鼠标经过或选中该块时会出现一个 `HTML`
 * 按钮；点击后在块内编辑源码，再次点击恢复渲染。所有源码修改仍通过一笔
 * ProseMirror 事务写回 `attrs.value`，所以撤销、自动保存和源码模式使用同一份
 * 文档真相。
 */

import DOMPurify from "dompurify";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose, $view } from "@milkdown/kit/utils";

import { api } from "@/bridge/ipc";
import { t } from "@/i18n";
import { debugEvent } from "@/ui/debug-log";

import {
  createCodeBlockEditor,
  type codeBlockEditor,
} from "./code-block-cm";
import { blockHTMLSpec, isNoteRelease } from "./html-block";
import { localLocalImageSliceAbsoluteCorrectPath } from "./video-view";

/** GitHub README 与普通文档中常见、且不提供脚本执行能力的标签。 */
export const allowedHtmlTags = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "center",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "s",
  "samp",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "var",
] as const;

/**
 * 允许保留的属性。
 *
 * ⚠️ `style` / `class` / `id` 故意不在表里。它们看起来只是排版信息，实际可以
 * 覆盖编辑器外壳、伪造选中态，或与文档主题的选择器相撞。README 的居中标题与
 * 徽章使用 `align`、`src`、`href`、`width` 就够。
 */
export const allowedHtmlAttributes = [
  "align",
  "alt",
  "border",
  "cellpadding",
  "cellspacing",
  "colspan",
  "height",
  "href",
  "loading",
  "referrerpolicy",
  "rel",
  "role",
  "rowspan",
  "scope",
  "src",
  "target",
  "title",
  "valign",
  "width",
] as const;

/** DOMPurify 的唯一配置。测试直接读这一份，避免实现与判据各写一张表。 */
export const hTMLCleanConvertConfigurePlace = {
  ALLOWED_TAGS: [...allowedHtmlTags],
  ALLOWED_ATTR: [...allowedHtmlAttributes],
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
  FORBID_TAGS: [
    "audio",
    "base",
    "button",
    "embed",
    "form",
    "iframe",
    "input",
    "link",
    "math",
    "meta",
    "object",
    "option",
    "script",
    "select",
    "style",
    "svg",
    "template",
    "textarea",
    "video",
  ],
  FORBID_ATTR: ["class", "id", "srcdoc", "style"],
};

/**
 * 一条 HTML 地址是否允许保留。
 *
 * DOMPurify 已处理已知协议绕过；这里再按用途收一次口。相对路径、片段、
 * `http(s)` 与协议相对地址保留。`mailto:` / `tel:` 只给链接；`asset:` 与
 * `file:` 只给图片，交给宿主读成 data URL。`data:` 一律拒绝。
 */
export function isSafeHtmlUrl(address: string, attribute: "href" | "src" = "src"): boolean {
  const clean = address.replace(/[\s\u0000-\u001f\u007f]/g, "");
  if (!clean) return true;

  const smallWrite = clean.toLowerCase();
  if (attribute === "src" && (/^[a-z]:[\\/]/i.test(clean) || clean.startsWith("\\\\"))) {
    return true;
  }
  if (/^https?:/i.test(clean)) return true;
  if (attribute === "href" && /^(?:mailto:|tel:)/i.test(clean)) return true;
  if (attribute === "src" && /^(?:asset:|file:)/i.test(clean)) return true;

  // 只要出现了协议名就必须已经被上面的白名单接住。没有协议的相对地址
  // （`assets/a.png`、`./a`、`/a`、`#anchor`、`//host/a`）可以保留。
  if (/^[a-z][a-z0-9+.-]*:/i.test(smallWrite)) return false;
  return true;
}

/** 清理一棵已解析 DOM 里的 href/src。它是净化后的第二道独立闸门。 */
export function clearManageHTMLAddress(root: ParentNode): void {
  for (const element of Array.from(root.querySelectorAll("[href], [src]"))) {
    for (const attribute of ["href", "src"] as const) {
      const value2 = element.getAttribute(attribute);
      if (value2 !== null && !isSafeHtmlUrl(value2, attribute)) element.removeAttribute(attribute);
    }
  }
}

interface BlockAttribute {
  value: string;
}

interface PendingReadImageSlice {
  element: HTMLImageElement;
  path: string;
}

/** 造一个 DOM。DOMPurify 已执行；这里只追加宿主读图的 data URL。 */
function safeAllFragment(source2: string): DocumentFragment {
  const modelBoard = document.createElement("template");
  modelBoard.innerHTML = DOMPurify.sanitize(source2, hTMLCleanConvertConfigurePlace);
  clearManageHTMLAddress(modelBoard.content);
  return modelBoard.content;
}

/** 本地图片在插入文档前先摘掉 src，避免 WebView 对相对路径发一次无用请求。 */
function removeOutputLocalLocalImageSlice(root: DocumentFragment, documentPath: string | null): PendingReadImageSlice[] {
  const result2: PendingReadImageSlice[] = [];
  for (const element of Array.from(root.querySelectorAll("img[src]"))) {
    if (!(element instanceof HTMLImageElement)) continue;
    const originalAddress = element.getAttribute("src") ?? "";
    const path = localLocalImageSliceAbsoluteCorrectPath(originalAddress, documentPath);
    if (!path) continue;
    element.removeAttribute("src");
    element.setAttribute("data-nota-local-image", "true");
    result2.push({ element, path });
  }
  return result2;
}

function writeImageSlice(imageSlice: PendingReadImageSlice, path: string, afterWrite: () => boolean): void {
  void api.image
    .dataUrl(path)
    .then((address) => {
      if (!afterWrite()) return;
      imageSlice.element.setAttribute("src", address);
      imageSlice.element.removeAttribute("data-nota-local-image");
    })
    .catch(() => {
      if (!afterWrite()) return;
      imageSlice.element.removeAttribute("src");
      imageSlice.element.removeAttribute("data-nota-local-image");
    });
}

/** 块级 HTML 的 NodeView。文档路径固定于实例，节点更新只改 attrs.value。 */
export function blockHTMLView(documentPath: string | null = null) {
  let alreadyReportNoteBook = false;
  let alreadyReportConstructCreate = false;
  return $view(
    blockHTMLSpec.node,
    (ctx) => {
      if (!alreadyReportNoteBook) {
        alreadyReportNoteBook = true;
        debugEvent("editor", "HTML block NodeView registered", {
          id: blockHTMLSpec.node.id,
          schema_name: blockHTMLSpec.type(ctx).name,
        });
      }
      return (initialNode: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
        if (!alreadyReportConstructCreate) {
          alreadyReportConstructCreate = true;
          debugEvent("editor", "HTML block NodeView constructed");
        }
        let current = initialNode;
        let represent = 0;
        let sourceMode = false;

        const root = document.createElement("div");
        root.className = "nota-html-block";
        root.setAttribute("data-type", "html-block");

        const show = document.createElement("div");
        show.className = "nota-html-render";

        const source2 = document.createElement("div");
        source2.className = "nota-html-source";
        source2.setAttribute("aria-label", t("HTML source"));

        const writeReturnSource = (newValueValue: string): void => {
          const position2 = getPos();
          if (position2 === undefined) return;
          view.dispatch(
            view.state.tr.setNodeMarkup(position2, undefined, {
              ...current.attrs,
              value: newValueValue,
            }),
          );
        };

        const sourceEditing: codeBlockEditor = createCodeBlockEditor({
          initialStartText: (current.attrs as BlockAttribute).value,
          initialStartLanguage: "html",
          textChangeConvert: writeReturnSource,
          clusterFocus: () => {
            sourceMode = true;
            root.classList.add("nota-html-source-mode");
          },
          loseFocus: () => {
            // 焦点移到同一块里的 HTML 按钮时不算离开；真正离开整个块后
            // 自动结束编辑，不必强制用户再点一次勾号。
            queueMicrotask(() => {
              if (!root.isConnected || root.contains(document.activeElement)) return;
              if (sourceMode) setSourceMode(false);
            });
          },
          undoCancel: () => undo(view.state, view.dispatch, view),
          heavyDo: () => redo(view.state, view.dispatch, view),
        });
        source2.append(sourceEditing.view.dom);

        const splitReplace = document.createElement("button");
        splitReplace.type = "button";
        splitReplace.className = "nota-html-source-toggle";
        splitReplace.textContent = "HTML";
        splitReplace.setAttribute("aria-pressed", "false");
        splitReplace.title = t("Edit HTML source");

        const writeAttribute = (node: PMNode): void => {
          const value2 = (node.attrs as BlockAttribute).value;
          root.setAttribute("data-value", value2);
          root.toggleAttribute("data-comment", isNoteRelease(value2));
        };

        const draw = (): void => {
          if (sourceMode) return;
          const value2 = (current.attrs as BlockAttribute).value;
          const localCount = ++represent;
          const activeActive = (): boolean => localCount === represent && root.isConnected;

          if (isNoteRelease(value2)) {
            show.textContent = value2;
            show.classList.add("nota-html-comment");
            return;
          }
          show.classList.remove("nota-html-comment");
          const fragment = safeAllFragment(value2);
          const imageSlice = removeOutputLocalLocalImageSlice(fragment, documentPath);
          show.replaceChildren(fragment);
          for (const oneImage of imageSlice) writeImageSlice(oneImage, oneImage.path, activeActive);
        };

        function setSourceMode(open2: boolean): void {
          sourceMode = open2;
          root.classList.toggle("nota-html-source-mode", open2);
          sourceEditing.setText((current.attrs as BlockAttribute).value);
          splitReplace.textContent = "HTML";
          splitReplace.title = open2 ? t("Finish editing") : t("Edit HTML source");
          splitReplace.setAttribute("aria-pressed", open2 ? "true" : "false");
          if (open2) {
            sourceEditing.clusterFocus();
          } else {
            draw();
          }
        }

        splitReplace.addEventListener("mousedown", (event) => event.preventDefault());
        splitReplace.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (sourceMode) {
            setSourceMode(false);
            view.focus();
          } else {
            setSourceMode(true);
          }
        });

        source2.addEventListener("keydown", (event) => {
          if (event.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setSourceMode(false);
            view.focus();
          }
        }, true);

        // 整块渲染区域都是“进入源码编辑”的命中范围。链接不在这里导航，图片、
        // 徽章和空白处也都算同一块；右上角勾号负责结束编辑。
        root.addEventListener("click", (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest("button, textarea")) return;
          // 链接交给应用统一的链接分流：普通 Markdown 链接仍编辑地址，
          // 自绘 HTML 里的链接则直接打开，不抢成“进入 HTML 编辑”。
          if (target.closest("a[href]")) return;
          if (sourceMode) return;
          event.preventDefault();
          event.stopPropagation();
          if (!sourceMode) setSourceMode(true);
        });

        root.append(show, source2, splitReplace);
        writeAttribute(current);
        sourceEditing.setText((current.attrs as BlockAttribute).value);
        draw();

        return {
          dom: root,
          update: (newValueNode: PMNode): boolean => {
            const valueChangeDone =
              (current.attrs as BlockAttribute).value !== (newValueNode.attrs as BlockAttribute).value;
            current = newValueNode;
            writeAttribute(current);
            if (sourceMode) {
              const newValueValue = (current.attrs as BlockAttribute).value;
              if (sourceEditing.getText() !== newValueValue) sourceEditing.setText(newValueValue);
            } else if (valueChangeDone) {
              draw();
            }
            return true;
          },
          stopEvent: (event: Event): boolean => {
            const target = event.target;
            return (
              target instanceof Node &&
              (source2.contains(target) || splitReplace.contains(target))
            );
          },
          ignoreMutation: () => true,
          destroy: () => {
            represent++;
            sourceEditing.cancelDestroy();
          },
        };
      };
    },
  );
}

/** 调试模式下记录一次文档里 HTML 节点和其他顶层块的形状。 */
export const blockHTMLDiagnostics = $prose(
  () =>
    new Plugin({
      view: (view) => {
        let blocks = 0;
        let inline = 0;
        view.state.doc.descendants((node) => {
          if (node.type.name === blockHTMLSpec.node.id) blocks += 1;
          if (node.type.name === "html") inline += 1;
        });
        debugEvent("editor", "document node inventory", {
          html_blocks: blocks,
          inline_html: inline,
          top_level: view.state.doc.firstChild?.type.name ?? "",
        });
        return {};
      },
    }),
);
