/**
 * 图表（` ```mermaid ` 围栏）的 NodeView：**把源码画成图，并且还能改源码**。
 *
 * # 为什么这个文件非得存在
 *
 * `@milkdown/plugin-diagram` 干的事只有三件：把 ` ```mermaid ` 围栏转成 `diagram`
 * 节点（remark 那一步）、给这个节点一个 schema、给一个 `toDOM`。而它的
 * `toDOM` **只有一句 `dom.textContent = code`**（`lib/index.es.js`，全包**没有
 * 一处**调 `mermaid.render`）——"把源码画成图"这件事它从来就没打算做，是留给
 * 宿主的。本仓此前没写，所以 ` ```mermaid ` 在编辑器里的表现是：围栏被吃掉、
 * 源码退化成一坨正文。这个文件就是补上那一步。
 *
 * # 为什么是"源码在上、渲染在下"
 *
 * `diagram` 节点在 schema 里是 `atom: true`，**没有 contentDOM 可给**——它的
 * 源码不在子节点里，而在 `attrs.value` 里（见下面 `取源码`）。所以"改源码"
 * 只能是 NodeView 自己摆一个输入控件，再把内容写回节点属性。
 *
 * 可编辑实例始终把源码框放在上方，把独立渲染结果放在下方，切到源码框就能
 * 直接改；只读实例只保留渲染结果。这样与 Typora 的块内编辑方式一致。
 *
 * # 文档里的真相永远是源码
 *
 * 节点里存的**只有**用户写的 Mermaid 源码（`attrs.value`），序列化走的也是它
 * （plugin 的 `toMarkdown` 读的就是 `attrs.value`）。渲染只是显示：
 * **渲染失败绝不回写文档**（`渲染` 那条路上一次 `dispatch` 都没有）。
 *
 * # mermaid 从哪儿来（⚠️ 这里动过手，别改回去）
 *
 * mermaid（10.9.8，MIT）是**顶层依赖**，`package.json` 里有一行——
 * 理由是本仓惯例："直接 import 的包必须在 `package.json` 里显式列出来"。
 *
 * ⚠️ **2026-10-04（第 27 项）两处变了，前史记在这里**：
 *
 * - 当年它装在**嵌套位置**（`node_modules/@milkdown/plugin-diagram/node_modules/mermaid`），
 *   想直接 import 那个嵌套路径两条路都堵死（上游 `exports` 只声明 `"."`；
 *   相对路径又把 npm 的目录摆法写死进源码）——所以它才被显式列进 `package.json`。
 *   现在上游包整个退役、mermaid 就是顶层包，嵌套那一段成为历史。
 * - 当年是**静态** `import mermaid from "mermaid"`（几 KB 的插件连带几百 KB
 *   的 mermaid 一起进主包）。现在是 `渲染` 里的**动态 import**——全仓唯一
 *   import 点，只有真出图时才加载；mermaid 的主题是**全局配置**（见下面 `渲染`），
 *   ESM 的模块记录保证全进程还是同一个实例。
 *
 * # 缓存（性能）
 *
 * 按 `identity` 缓存（那是 plugin 给每个 `diagram` 节点发的随机 id，
 * `nanoid` 出 8 位），键里再带上明暗。命中还要求**源码逐字相同**——
 * 因为 `identity` 是跟着节点走的、改源码不会换 id，只认 id 会把旧图顶上来。
 * **失败也缓存**：语法错着的块滚动来回时不该反复重算那一次解析。
 *
 * 缓存是**模块级**的，故意如此：只读预览格里是另一个 Editor 实例，
 * 同一份源码在那里会再画一次——同一 identity 命中同一条，第二次是白拿的。
 *
 * # 出错
 *
 * mermaid 抛错时**自己收尾**（见 `清除残留`）：它渲染失败会把一张"红炸弹"
 * 错误图留在 `document.body` 上不收——那正是用户截图里别人家编辑器那个观感。
 * 本仓的写法是：块里出一张**不吓人的说明卡**（中文说清是语法错、附上
 * mermaid 的原文报错），右上角那颗「编辑源码」就在旁边，改完立刻重画。
 */

import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

// ⚠️ mermaid **不在这里静态 import**（2026-10-04，第 27 项）：全仓唯一
// import 点在下面 `渲染` 里，是动态的——几百 KB 只有真出图时才加载。
// 原先那条 `import mermaid from "mermaid"`（连同"必须在 package.json 里
// 显式列出"的整段来路，见 git 历史）随 `@milkdown/plugin-diagram` 一起
// 退役了；`package.json` 里那行依赖**留着**（动态 import 一样要它）。

import { t } from "@/i18n";
import { writeClipboard } from "@/editor/code-block";
import type { codeBlockEditor } from "@/editor/code-block-cm";
import {
  bootstrapCodeBlockExit,
  codeBlockExitTransaction,
  moveBootstrapCodeBlockCaret,
  type CodeBlockExitSide,
} from "@/editor/code-block-boundary";

import { imageTableSpec } from "@/editor/diagram-node";
import {
  checkBufferSave,
  distinguishAgainFollowDone,
  followAboveTheme,
  readDiagramTheme,
  render,
  writeBufferSave,
  type RenderResult,
} from "./diagram-render";

/** 节点名。与 plugin 里 `const id = "diagram"` 一致，判类型时要用。 */
const nodeName = "diagram";

/** 源码框改完多久写回文档。太短会在每个字上一笔事务，太长会觉得"没保存"。 */
const guardDebounceMilliSeconds = 250;

function readSource(node: PMNode): string {
  const value2: unknown = node.attrs.value;
  return typeof value2 === "string" ? value2 : "";
}

/**
 * 取节点的身份。
 *
 * ⚠️ 它是 plugin 在**建节点时**随机发的（`getId`：有 `identity` 就用它，没有就
 * `nanoid(8)`，字母表只有 `abcdefg`），**改源码不会换**——所以它是"这个块"
 * 的标识，不是"这份源码"的标识。缓存键用它，但**必须再比一遍源码**。
 */
function getBodyPart(node: PMNode): string {
  const value2: unknown = node.attrs.identity;
  return typeof value2 === "string" ? value2 : "";
}

export const diagramView = $view(
  // ⚠️ 要的是 `$NodeSchema` 上的 `.node`，不是 `$NodeSchema` 本身——
  // `$view` 收的是 `$Node | $Mark`（同 `code-block.ts` 那句注）。
  // 2026-10-04 起这颗 schema 是本仓自己的（`diagram-node.ts::图表规格`，
  // 第 27 项替掉了 `@milkdown/plugin-diagram`），形状与上游逐字段一致。
  imageTableSpec.node,
  () =>
    (initialNode: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
      // ── 骨架 ──────────────────────────────────────────────────────────
      // <div class="nota-diagram">
      //   <div class="nota-diagram-body">
      //     <textarea class="nota-diagram-source">   ← 可编辑实例常驻
      //     <div class="nota-diagram-preview">       ← 画好的 SVG，或一张说明卡
      //
      // ⚠️ **一个 `data-type` / `data-value` / `data-id` 都不给它**。plugin 的
      //    `parseDOM` 认的就是 `div[data-type="diagram"]`（`getAttrs` 从
      //    `dataset.value` / `dataset.id` 读源码和身份）。我这棵树一旦带上那几个
      //    属性，ProseMirror 万一重解析这段 DOM（剪贴板、DOMObserver），
      //    就会把**屏幕上的东西**当成文档的真相读回去——而屏幕上的东西里
      //    有 SVG、有错误提示。真相只有源码一份，不该有第二个入口。
      const dom = document.createElement("div");
      dom.className = "nota-diagram md-diagram-panel md-fences-adv-panel";

      const body = document.createElement("div");
      body.className = "nota-diagram-body";

      const sourceShell = document.createElement("div");
      sourceShell.className = "nota-diagram-source-shell nota-source-surface";

      const sourceBox = document.createElement("div");
      sourceBox.className = "nota-diagram-source nota-diagram-cm";
      const sourceBootstrap = document.createElement("textarea");
      sourceBootstrap.className = "nota-diagram-source-bootstrap";
      sourceBootstrap.value = readSource(initialNode);
      sourceBootstrap.rows = Math.max(3, sourceBootstrap.value.split("\n").length);
      sourceBootstrap.spellcheck = false;
      sourceBootstrap.setAttribute("aria-label", t("Diagram Source (Mermaid)"));
      sourceBox.append(sourceBootstrap);

      const preview = document.createElement("div");
      preview.className = "nota-diagram-preview";

      const sourceBar = document.createElement("div");
      sourceBar.className = "nota-diagram-source-bar";

      const collapse2 = document.createElement("button");
      collapse2.type = "button";
      collapse2.className = "nota-code-btn";
      collapse2.textContent = t("Collapse");
      collapse2.title = t("Collapse this diagram source");

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "nota-code-btn";
      copy.textContent = t("Copy");
      copy.title = t("Copy Mermaid source");

      const language = document.createElement("span");
      language.className = "nota-diagram-language";
      language.textContent = "mermaid";

      sourceBar.append(collapse2, copy, language);
      sourceShell.append(sourceBox, sourceBar);
      body.append(sourceShell, preview);
      dom.append(body);

      // ── 这个视图的状态（都不进文档）──────────────────────────────────
      /**
       * 当前服务的节点。**必须是活的**——`initialNode` 是建视图时那一份，
       * 永远不变（`code-block.ts` 顶上那段踩过这个坑：拿旧节点读属性会读出
       * 老值，而症状只在那一个动作上发作）。
       */
      let current = initialNode;
      /** 最近一次**由本视图**写进文档的源码，用来分清"这变化是我派的还是外面改的"。 */
      let mostAfterDispatch = readSource(initialNode);
      /** 屏幕上有没有画过东西。只用来决定"第一次渲染要不要先摆一句正在渲染"。 */
      let rendered = false;
      /** `已画` 用的是哪一档配色。主题一变就得重画。 */
      let renderedTheme = "";
      /** 代号：异步渲染回来时用它判"这份结果是不是已经过期了"。 */
      let representNumber = 0;
      /** 防抖计时器；`null` = 没有待派发的内容。 */
      let guardDebounce: number | null = null;
      let codeEditor: codeBlockEditor | null = null;
      let editorDisposed = false;
      let editorStarted = false;
      let previewStarted = false;
      let visibilityObserver: IntersectionObserver | null = null;
      // ── 画 ────────────────────────────────────────────────────────────

      /**
       * The diagram mirrors a math block: the rendered result is the resting
       * state, and the source editor is only visible while this block owns
       * focus. Clicking the preview is an explicit request to edit.
       */
      function enterEditing(): void {
        if (!view.editable) return;
        dom.classList.add("nota-diagram-editing");
        ensureDiagramEditor();
      }

      function leaveEditing(): void {
        firstDispatch();
        dom.classList.remove("nota-diagram-editing");
        sourceShell.classList.remove("is-collapsed");
        collapse2.textContent = t("Collapse");
        collapse2.title = t("Collapse this diagram source");
      }

      function focusSource(): void {
        enterEditing();
        requestAnimationFrame(() => {
          if (editorDisposed) return;
          if (codeEditor) codeEditor.clusterFocus();
          else {
            ensureDiagramEditor();
            sourceBootstrap.focus();
          }
        });
      }

      /** 说明卡：标题 + 一段原文 + 可选一颗按钮。出错、空块、渲染中都用它。 */
      function descriptionCard(markTitle: string, body2: string, PressButton: string | null): HTMLElement {
        const card = document.createElement("div");
        card.className = "nota-diagram-note";

        const title = document.createElement("div");
        title.className = "nota-diagram-note-title";
        title.textContent = markTitle;
        card.append(title);

        // ⚠️ 是 `div` **不是 `pre`**：`editor.css` 里有一条
        // `.editor-mount .ProseMirror pre`（代码块那套：底色、描边、34px 的下内边距），
        // 用 `pre` 就得再写五六条去抵消它。换行/空白由 CSS 的 `white-space: pre-wrap`
        // 保——那正是这里要的全部。
        const text4 = document.createElement("div");
        text4.className = "nota-diagram-note-detail";
        text4.textContent = body2;
        card.append(text4);

        if (PressButton) {
          const press = document.createElement("button");
          press.type = "button";
          press.className = "nota-code-btn nota-diagram-note-btn";
          press.textContent = PressButton;
          press.addEventListener("mousedown", (e) => e.preventDefault());
          press.addEventListener("click", () => codeEditor?.clusterFocus() ?? sourceBootstrap.focus());
          card.append(press);
        }
        return card;
      }

      /**
       * 换掉预览区里画的东西。**只碰 `预览` 这一棵**，源码框一个字节都不动。
       *
       * ⚠️ `data-state` 的值是**英文**（CSS 要按它选）；卡里的字才是中文——
       * 这条分界与全仓一致。
       */
      function draw(result2: RenderResult | null): void {
        rendered = true;
        preview.replaceChildren();

        if (result2 === null) {
          preview.dataset.state = "empty";
          preview.append(
            descriptionCard(
              t("There is no diagram source here yet"),
              t("Write Mermaid in the code box above, for example:\ngraph TD; A[Start] --> B[End]"),
              null,
            ),
          );
          return;
        }

        if (result2.state === "错") {
          preview.dataset.state = "error";
          preview.append(
            descriptionCard(
              t("The diagram has a syntax error and cannot be drawn (your source is untouched in the document)."),
              result2.clearMessage,
              null,
            ),
          );
          return;
        }

        preview.dataset.state = "ok";
        // mermaid 返回的这段 SVG 已经过 DOMPurify 洗过（它默认 `securityLevel:
        // "strict"`，那条路一定会走 `DOMPurify.sanitize`），所以这里可以直接
        // 用 `innerHTML`——这是 mermaid 官方文档给的用法。
        preview.innerHTML = result2.imageShape;
        const image = preview.querySelector("svg");
        if (image instanceof SVGSVGElement) {
          // ⚠️ mermaid 给的 `<svg>` 上带的是**内联**样式（`width="100%"` 属性 ＋
          // 一条 `max-width`），内联权重高过样式表，所以只能在 DOM 上改
          // （在 CSS 里跟它较劲要动 `!important`，那是最后手段）。
          //
          // ⚠️ 上限取**它自己的坐标系宽度**（`viewBox` 的宽，也就是 mermaid 算好的
          // 自然尺寸），**不是** `100%`。
          //
          // 2026-09-26 开窗实测踩中：原先这里一律写 `max-width: 100%`（本意只是
          // "窄窗格里别把正文列顶宽"），结果两行的小流程图被**撑满整栏**——
          // `width="100%"` 配 `height: auto` 是按 viewBox 的宽高比**等比放大**的，
          // 容器多宽它就放多大，`Start` 一个词占了半个屏幕、块还溢出到屏幕外。
          // 换成"自然宽与容器宽取小"之后：宽窗格里按自然大小画，窄窗格里才缩。
          const selfThenWidth = image.viewBox.baseVal.width;
          image.style.maxWidth = selfThenWidth > 0 ? `min(100%, ${Math.ceil(selfThenWidth)}px)` : "100%";
          image.style.height = "auto";
        }
      }

      /** 第一帧专用：还没画过任何东西时先摆一句，免得是个空盒子。 */
      function drawMiddle(): void {
        preview.dataset.state = "loading";
        preview.replaceChildren(descriptionCard(t("Rendering the diagram…"), t("Mermaid is parsing this source."), null));
      }

      // ── 同步 ──────────────────────────────────────────────────────────

      /**
       * 让屏幕跟上节点：**源码 + 明暗**没变就不重渲染。
       */
      async function sameStep(): Promise<void> {
        const source2 = readSource(current);
        const theme = readDiagramTheme(dom, view.dom);
        renderedTheme = theme.key;

        if (source2.trim() === "") {
          // 空源码不交给 mermaid（它会当解析失败报一句"没有识别出图表类型"，
          // 那是让用户对着一个还没写东西的块看错误提示）。
          representNumber++;
          draw(null);
          return;
        }

        // ⚠️ 键里带明暗：同一份源码在深色/浅色下是**两张图**，不能互相顶。
        // ⚠️ `identity` 可能是空串（schema 的默认值）——那时这条键是共用的，
        // 但下面的源码比对会挡住错用，代价只是那种块之间会来回顶掉缓存。
        const key = `${getBodyPart(current)}|${theme.key}`;
        const match = checkBufferSave(key, source2);
        if (match) {
          representNumber++;
          draw(match);
          return;
        }

        const selfOfRepresentNumber = ++representNumber;
        // ⚠️ 已经画过就**留着上一版**：改一个字闪一下白是更糟的观感。
        if (!rendered) drawMiddle();

        const result2 = await render(source2, theme);
        // 期间节点又变了（或者视图没了）→ 这份结果作废。
        if (selfOfRepresentNumber !== representNumber) return;
        writeBufferSave(key, source2, result2);
        renderedTheme = theme.key;
        draw(result2);
      }

      /**
       * 把源码框里的内容写回节点。
       *
       * ⚠️ **只能走 `setNodeMarkup` 改 `attrs.value`**：那才是文档里的真相。
       * ⚠️ `identity` 要**原样带过去**（`{ ...节点.attrs }`），换了它缓存键就换了。
       */
      function dispatch(newValueSource: string): void {
        const pos = getPos();
        if (typeof pos !== "number") return;

        const node = view.state.doc.nodeAt(pos);
        if (!node || node.type.name !== nodeName) return;
        if (readSource(node) === newValueSource) return;

        mostAfterDispatch = newValueSource;
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, value: newValueSource }),
        );
      }

      /** 有没派发完的就立刻派发（失焦、视图销毁时用）。 */
      function firstDispatch(): void {
        if (guardDebounce === null) return;
        window.clearTimeout(guardDebounce);
        guardDebounce = null;
        dispatch(codeEditor?.getText() ?? sourceBootstrap.value);
      }

      function leaveDiagram(side: CodeBlockExitSide): void {
        firstDispatch();
        const pos = getPos();
        if (typeof pos !== "number") return;
        const node = view.state.doc.nodeAt(pos);
        if (!node || node.type.name !== nodeName) return;
        const transaction = codeBlockExitTransaction(view.state, pos, node, side);
        if (!transaction) return;
        leaveEditing();
        view.dispatch(transaction.scrollIntoView());
        view.focus();
      }

      const leaveHeadCell = () => leaveDiagram("before");
      const leaveTailCell = () => leaveDiagram("after");

      // ── CodeMirror：Mermaid 源码的输入面 ─────────────────────────────
      // 节点正文始终在 PM 的 `attrs.value` 里；CM 只负责输入、选区、配对、
      // Tab 缩进与剪贴板。粘贴事件必须落在 CM 自己的 DOM 上，不能再交给
      // 外层 ProseMirror，否则会变成"源码框空着、正文多出一段粘贴内容"。
      const convertSource = (newText: string) => {
        sourceBootstrap.rows = Math.max(3, newText.split("\n").length);
        if (guardDebounce !== null) window.clearTimeout(guardDebounce);
        guardDebounce = window.setTimeout(() => {
          guardDebounce = null;
          dispatch(newText);
        }, guardDebounceMilliSeconds);
      };
      sourceBootstrap.addEventListener("input", () => convertSource(sourceBootstrap.value));
      sourceBootstrap.addEventListener("focusin", () => ensureDiagramEditor());
      sourceBootstrap.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          firstDispatch();
          leaveEditing();
          view.focus();
          return;
        }
        if (event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        const caret = sourceBootstrap.selectionStart;
        if (caret === null || caret !== sourceBootstrap.selectionEnd) return;
        const exit = bootstrapCodeBlockExit(sourceBootstrap.value, caret, event.key);
        if (exit) {
          event.preventDefault();
          event.stopPropagation();
          if (exit === "before") leaveHeadCell();
          else leaveTailCell();
          return;
        }
        if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          const next = moveBootstrapCodeBlockCaret(sourceBootstrap.value, caret, event.key);
          sourceBootstrap.setSelectionRange(next, next);
        }
      });

      function ensureDiagramEditor(): void {
        if (editorStarted || editorDisposed) return;
        editorStarted = true;
        visibilityObserver?.disconnect();
        visibilityObserver = null;
        void import("@/editor/code-block-cm")
          .then(({ createCodeBlockEditor }) => {
            if (editorDisposed || !dom.isConnected) return;
            const editor = createCodeBlockEditor({
              initialStartText: readSource(current),
              initialStartLanguage: "mermaid",
              nativeLineNumbers: true,
              textChangeConvert: convertSource,
              clusterFocus: () => {
                // CM 自己持有选区；PM 这一层只保留节点本身。
              },
              loseFocus: firstDispatch,
              undoCancel: () => undo(view.state, view.dispatch, view),
              heavyDo: () => redo(view.state, view.dispatch, view),
              openHeadBackCell: () => view.focus(),
              leaveHeadCell,
              leaveTailCell,
            });
            codeEditor = editor;
            sourceBox.replaceChildren(editor.view.dom);
            editor.view.contentDOM.setAttribute("aria-label", t("Diagram Source (Mermaid)"));
            editor.view.dom.addEventListener("keydown", (event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              firstDispatch();
              leaveEditing();
              view.focus();
            });
          })
          .catch((error: unknown) => {
            console.error("[nota] diagram source editor failed to load", error);
            sourceBootstrap.classList.add("nota-code-bootstrap-error");
          });
      }

      const revealDiagram = () => {
        previewStarted = true;
        void sameStep();
      };
      if (typeof IntersectionObserver === "undefined") queueMicrotask(revealDiagram);
      else {
        visibilityObserver = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) revealDiagram();
          },
          { rootMargin: "600px 0px" },
        );
        visibilityObserver.observe(dom);
      }

      // ── 事件 ──────────────────────────────────────────────────────────

      for (const PressButton of [collapse2, copy]) {
        PressButton.addEventListener("mousedown", (e) => e.preventDefault());
      }

      preview.addEventListener("mousedown", (event) => {
        if (!view.editable) return;
        event.preventDefault();
        event.stopPropagation();
        focusSource();
      });

      sourceShell.addEventListener("focusin", enterEditing);
      sourceShell.addEventListener("focusout", () => {
        window.setTimeout(() => {
          if (!dom.contains(document.activeElement)) leaveEditing();
        }, 0);
      });

      collapse2.addEventListener("click", () => {
        const collapsed = sourceShell.classList.toggle("is-collapsed");
        collapse2.textContent = collapsed ? t("Expand") : t("Collapse");
        collapse2.title = collapsed ? t("Expand this diagram source") : t("Collapse this diagram source");
      });

      copy.addEventListener("click", () => {
        void writeClipboard(codeEditor?.getText() ?? sourceBootstrap.value ?? readSource(current)).then((ok) => {
          if (!ok) return;
          copy.textContent = t("Copied");
          window.setTimeout(() => {
            copy.textContent = t("Copy");
          }, 1200);
        });
      });

      // ── 与 ProseMirror 的边界 ─────────────────────────────────────────

      /**
       * 判据是「这颗元素是不是我的挂件」。
       *
       * ⚠️ **不含预览区本身**（只含它里面的按钮）：点图上任何地方都该让
       * ProseMirror 去处理——它会把这个原子节点整块选中，用户才能接着
       * 删除 / 复制 / 剪切。把整块预览都算成挂件的话，点图就成了"什么都没发生"。
       */
      const isSelfOfAttachItem = (target: EventTarget | null): boolean =>
        target instanceof Element &&
        (sourceShell.contains(target) || target.closest("button") !== null);

      // ── 主题 ──────────────────────────────────────────────────────────

      const followTheme = (): void => {
        if (previewStarted && readDiagramTheme(dom, view.dom).key !== renderedTheme) void sameStep();
      };
      followAboveTheme(followTheme);

      /** 只读实例只保留渲染结果，源码框由 CSS 隐藏。 */
      function sameStepEditable(): void {
        dom.classList.toggle("nota-diagram-readonly", !view.editable);
        if (!view.editable) dom.classList.remove("nota-diagram-editing");
      }

      sameStepEditable();

      return {
        dom,

        update: (afterUpdate: PMNode): boolean => {
          // 节点类型变了（这段内容被转成了别的东西）→ 这个视图不该再用。
          if (afterUpdate.type !== initialNode.type) return false;

          const newValueSource = readSource(afterUpdate);
          // ⚠️ 这条判据是"**外面**改的"：撤销、源码框里手改文档、插件改文档、
          //    整个文档被换掉……都会走到这儿。只认这一类，因为本视图自己派的那次
          //    不能再写回源码框——每敲一个字就把光标拽回开头，那个框没法用。
          const externalSurfaceChangeOf = newValueSource !== mostAfterDispatch;
          current = afterUpdate;

          if (externalSurfaceChangeOf) {
            mostAfterDispatch = newValueSource;
            if (codeEditor && codeEditor.getText() !== newValueSource) codeEditor.setText(newValueSource);
            else if (!codeEditor && sourceBootstrap.value !== newValueSource) {
              sourceBootstrap.value = newValueSource;
            }
          }

          sameStepEditable();
          if (view.editable) {
            const position = getPos();
            const selection = view.state.selection;
            if (typeof position === "number") {
              const inside =
                selection.from >= position &&
                selection.to <= position + afterUpdate.nodeSize;
              if (!inside && !dom.contains(document.activeElement)) {
                leaveEditing();
              }
            }
          }
          // 源码没变时 `同步` 是一次 Map 查表就返回，不必在这儿先比一遍。
          if (previewStarted) void sameStep();
          return true;
        },

        // 这一条和底下那条是**两件事**（同 `code-block.ts`）：`stopEvent` 管一进来
        // 就拦下；`ignoreMutation` 管已经发生的 DOM 变更要不要告诉 ProseMirror。
        stopEvent: (e) => isSelfOfAttachItem(e.target),

        // ⚠️ 恒为 `true`：这棵树整个由本视图管，没有任何一处是 ProseMirror 该读的
        // （这个节点没有 contentDOM，源码在 attrs 里）。返回 false 的话，
        // 「画完一张图」这件事本身会被当成"用户在编辑区里改了东西"，PM 接着去
        // 重解析这段 DOM——而它认得的 `div[data-type]` 一个都没有，结果是节点被
        // 判成脏的、光标乱飞。
        ignoreMutation: () => true,

        destroy: () => {
          editorDisposed = true;
          visibilityObserver?.disconnect();
          // 在飞的渲染结果作废（它回来时视图已经没了）。
          representNumber++;
          // 只在**真有待派发的内容**时补一次：销毁常常发生在整篇文档被换掉
          // （`replaceAll`）的过程中，那时去派事务是没必要的风险。
          firstDispatch();
          codeEditor?.cancelDestroy();
          distinguishAgainFollowDone(followTheme);
        },
      };
    },
);
