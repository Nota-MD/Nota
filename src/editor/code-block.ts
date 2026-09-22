/**
 * 代码块的 NodeView：**语言选择器 + 一键复制 + 折叠**（backlog 第 35 项，
 * 用户 2026-09-22 点名要的：「代码框右下角有一个小框框可以选择编程语言可否？」）。
 *
 * # 三件事为什么放在一个文件里
 *
 * 它们要的是**同一块 chrome**：都挂在 `<pre>` 上、都在右下角那一条、
 * 都靠 `stopEvent` 把事件从 ProseMirror 手里拿回来。分三次做就得把同一套
 * NodeView 样板写三遍，而且三次都要重新想一遍"这条边怎么跟编辑器隔开"。
 *
 * # 为什么必须是 NodeView，不能是 Decoration
 *
 * `instant-render.ts` 那边能纯靠 Decoration 是因为它**只改显示、不加元素**。
 * 这里加的是**真的会交互的元素**（`<select>`、`<button>`）——Decoration 给的
 * widget 是只读装饰，点它、让它持有焦点、让它开下拉，都不是它的职责。
 * NodeView 才是"这个节点由我来画"的正规口子。
 *
 * # ⚠️ 语言高亮**不归这里管**
 *
 * 代码着色是 `@milkdown/plugin-prism` 干的，它读的是**节点属性** `attrs.language`
 * （`getBlockDecorations` 里 `node.attrs.language`），不看 DOM 上的
 * `data-language`。所以本文件只负责**把选择器的值写回节点属性**，
 * 高亮会自己跟上——不要去手动改 DOM 里的 class 或 span。
 */

import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

// ⚠️ 和 `create.ts` 里那一行是**同一个模块**（都落到 `refractor/lib/core.js`
// 那个单例上），所以重复 import 不会重复打包，但能让本文件不依赖
// "别的文件先跑过那句副作用 import"这种隐形顺序。语言表从 36 涨到 400 就靠它。
import "refractor/all";
import { refractor } from "refractor";

/** 下拉第一项：不指定语言。与 `code_block` 的 `language` 默认值一致。 */
const NO_LANGUAGE = "";

/** 复制按钮显示"已复制"多久。 */
const COPY_FEEDBACK_MS = 1200;

/** 语言名算一次就够。400 个名字排一遍序是毫秒级，但没必要每个代码块排一次。 */
let sortedLanguages: string[] | null = null;

function allLanguages(): string[] {
  if (sortedLanguages === null) {
    sortedLanguages = refractor.listLanguages().slice().sort((a, b) => a.localeCompare(b));
  }
  return sortedLanguages;
}

/**
 * 把文本塞进剪贴板。
 *
 * ⚠️ 两条路都要有：`navigator.clipboard` 需要**安全上下文**（WebKitGTK 下
 * Tauri 的 `tauri://localhost` 算，但打包方式一变就未必），而且它的失败是
 * **异步抛**的——`await` 外面不包 try 的话，用户看到的是"点了复制但什么都没发生"。
 * 兜底那条 `execCommand("copy")` 虽然被标了弃用，但它是唯一不依赖权限的写法。
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落下去走兜底，不往上抛——复制失败不该变成一个错误弹窗。
  }

  const scratch = document.createElement("textarea");
  scratch.value = text;
  // 不能 `display: none`：那样选不中，`execCommand` 会失败。
  scratch.style.position = "fixed";
  scratch.style.top = "-1000px";
  scratch.style.opacity = "0";
  document.body.appendChild(scratch);
  scratch.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(scratch);
  return ok;
}

export const codeBlockView = $view(
  // ⚠️ 要的是 `$NodeSchema` 上的 `.node`，不是 `$NodeSchema` 本身——
  // `$view` 收的是 `$Node | $Mark`，而 `$NodeSchema` 是"schema 定义 + 那个 node"
  // 的合成体，类型上不是 `$Node`。
  codeBlockSchema.node,
  () =>
    (initialNode: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
      // ── 结构 ──────────────────────────────────────────────────────────
      // <pre data-language="rust">
      //   <code>…</code>            ← contentDOM，ProseMirror 只管这一块
      //   <div class="nota-code-bar" contenteditable="false">…</div>
      // </pre>
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      pre.appendChild(code);

      const bar = document.createElement("div");
      bar.className = "nota-code-bar";
      // `contenteditable="false"` 是给浏览器看的；`stopEvent` 是给 ProseMirror
      // 看的。**两个都要**——只写前者，PM 照样会把在 select 上的点击当作
      // "用户点了编辑区"去挪光标。
      bar.contentEditable = "false";

      const foldBtn = document.createElement("button");
      foldBtn.type = "button";
      foldBtn.className = "nota-code-btn";
      foldBtn.textContent = "折叠";
      foldBtn.title = "折叠这一段代码";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "nota-code-btn";
      copyBtn.textContent = "复制";
      copyBtn.title = "复制代码";

      const select = document.createElement("select");
      select.className = "nota-code-lang";
      select.title = "代码语言";

      bar.append(foldBtn, copyBtn, select);
      pre.appendChild(bar);

      // ── 语言选择器 ────────────────────────────────────────────────────
      // ⚠️ **懒填充**。400 个 `<option>` 不算多，但一份文档里有十个代码块就是
      // 4000 个 DOM 节点，而且绝大多数用户一辈子不会去开那个下拉。
      let filled = false;
      const fillLanguages = () => {
        if (filled) return;
        filled = true;

        const blank = document.createElement("option");
        blank.value = NO_LANGUAGE;
        blank.textContent = "纯文本";
        select.appendChild(blank);

        for (const name of allLanguages()) {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        }
        select.value = languageOf(initialNode);
      };
      select.addEventListener("pointerdown", fillLanguages);
      select.addEventListener("focus", fillLanguages);

      const applyLanguage = (lang: string) => {
        const pos = getPos();
        if (typeof pos !== "number") return;

        const current = view.state.doc.nodeAt(pos);
        if (!current || current.type.name !== "code_block") return;
        if (current.attrs.language === lang) return;

        // 只改属性：高亮由 plugin-prism 读属性重算，不用我们操心。
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language: lang }),
        );
        view.focus();
      };

      select.addEventListener("change", () => applyLanguage(select.value));

      // ── 复制 ──────────────────────────────────────────────────────────
      // `mousedown` 上 preventDefault：不这样做，点按钮会先让编辑区失焦、
      // 选区被清掉。
      copyBtn.addEventListener("mousedown", (e) => e.preventDefault());
      copyBtn.addEventListener("click", () => {
        void (async () => {
          const ok = await writeClipboard(code.textContent ?? "");
          copyBtn.textContent = ok ? "已复制" : "复制失败";
          window.setTimeout(() => {
            copyBtn.textContent = "复制";
          }, COPY_FEEDBACK_MS);
        })();
      });

      // ── 折叠 ──────────────────────────────────────────────────────────
      // ⚠️ 折叠状态**只活在这个视图里**，不写进文档——它不是文档的属性
      //（Typora 也不把折叠存进文件），存进去会让同一份 .md 在不同人手里长得不一样。
      // 同样地，折叠走的是 CSS 的 `max-height`，**不是 `display: none`**：
      // 藏起来的 contentDOM 会让 ProseMirror 没法在里面放光标，
      // 点到折叠区就是一次"选区落进不可见元素"的报错。
      foldBtn.addEventListener("mousedown", (e) => e.preventDefault());
      foldBtn.addEventListener("click", () => {
        const folded = pre.classList.toggle("nota-code-folded");
        foldBtn.textContent = folded ? "展开" : "折叠";
        foldBtn.title = folded ? "展开这一段代码" : "折叠这一段代码";
      });

      // ── 与 ProseMirror 的边界 ─────────────────────────────────────────
      const inBar = (target: EventTarget | null) =>
        target instanceof Node && bar.contains(target);

      const syncChrome = (node: PMNode) => {
        const lang = languageOf(node);
        // `data-language` 是原有约定，`instant-render.ts` 画围栏标记时读它。
        if (lang) pre.dataset.language = lang;
        else delete pre.dataset.language;
        // 下拉还没填充过就别去动它的 value（那时里面只有空气）。
        if (filled) select.value = lang;
      };

      syncChrome(initialNode);

      return {
        dom: pre,
        contentDOM: code,

        update: (updated) => {
          // 节点类型变了（比如说这个代码块被转成了段落）→ 这个视图不该再用。
          if (updated.type !== initialNode.type) return false;
          syncChrome(updated);
          return true;
        },

        // 这一条和底下那条是**两件事**，别合并：
        // `stopEvent` 管的是一进来就拦下（点、按键、滚轮）；
        // `ignoreMutation` 管的是已经发生的 DOM 变更要不要告诉 ProseMirror。
        // 少了后者，"复制"按钮把文字改成"已复制"这件事会被 PM 当成
        // "用户在编辑区里改了东西"，于是它去重解析——那一下光标就飞了。
        stopEvent: (e) => inBar(e.target),

        ignoreMutation: (m) => inBar(m.target),
      };
    },
);

/** 取节点的语言属性。缺省是空串，统一成 `NO_LANGUAGE`。 */
function languageOf(node: PMNode): string {
  const raw = node.attrs.language;
  return typeof raw === "string" ? raw : NO_LANGUAGE;
}
