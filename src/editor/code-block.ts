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
import { refractor } from "refractor";

import { t } from "@/i18n";

import { 创建语言选择器 } from "./lang-picker";
import { 有专属图标 } from "./lang-icon";

/** 下拉第一项：不指定语言。与 `code_block` 的 `language` 默认值一致。 */
const NO_LANGUAGE = "";

/** 复制按钮显示"已复制"多久。 */
const COPY_FEEDBACK_MS = 1200;

/** 语言名算一次就够。400 个名字排一遍序是毫秒级，但没必要每个代码块排一次。 */
let sortedLanguages: string[] | null = null;

// ⚠️ 全量语言表（`refractor` 的 297 种）**异步加载**（2026-10-04，第 27 项）：
// 那一份 `refractor/all` 是 ~500 kB，静态 import 会整个压进首屏，而首屏真正
// 需要的高亮语言是 common 那 62 种（c / js / ts / py / rs / go / sh / sql …
// ——上面 `import { refractor } from "refractor"` 已经把它们注册好了）。
//
// 为什么要自己加载：`@milkdown/plugin-prism` 内部也是
// `import { refractor } from "refractor"`，两边是**同一个单例**
// （都从 `refractor/lib/core.js` 拿那一个 `refractor`），而它读语言表是
// **惰性**的（`getBlockDecorations(node, pos, refractor, languages = refractor.listLanguages())`
// 里那是默认参数，每次重算都要现取），所以这里补注册的，它立刻看得见。
//
// ⚠️ 这条 `import()` **在本模块顶层就发出去**（模块一进来就发起请求）：
// 首屏不阻塞，但长尾语言也尽早到。到了之后把下拉的缓存清掉，
// 下次点开语言选择器就是全量表。
//
// ⚠️ **已知的一个时序**（如实记着，别当成"没这回事"）：开机时正开着一份
// **长尾语言**（不在 common 62 里）的文档，那个代码块在**首次编辑代码块之前**
// 可能显示为未高亮的纯文本——prism 的装饰只在 `docChanged` 时重算
// （`plugin-prism/lib/index.js` 的 `apply` 第一行就判它，点一下不算）。
// 编辑那个块、或改任何一个代码块，整篇的重算就发生了，高亮随即补上。
// 判据：这个窗口只在"冷启动第一帧还没到 + 文档里正好有长尾语言块"时存在。
let 全量表已到 = false;
const 全量表到了 = import("refractor/all").then(() => {
  全量表已到 = true;
  // 下拉那份名字算过一次就缓存了（`sortedLanguages`），全量表到了要重算。
  sortedLanguages = null;
});

/**
 * 全量语言表到了没有。**给测试/诊断用**（界面不等它）。⚠️ 它 `true` 不代表
 * 每个语言都注册成功——`refractor/all` 里个别语言的自注册是会抛的
 * （上游就那样），这里只反映"那一整包代码跑过了"。
 */
export function 语言表就绪(): boolean {
  return 全量表已到;
}

/** 等全量表加载完（测试用；界面里没有 await 它的地方）。 */
export function 等语言表(): Promise<void> {
  return 全量表到了.then(() => undefined);
}

/**
 * 下拉里**列出来**的语言：**只留有专属图标的那些**。
 *
 * 用户 2026-09-26：「语言选择框你除了有图标的语言其他都删了吧。另加一个输入框，
 * 允许用户输入自己的答案」。
 *
 * ⚠️ **这不是"砍掉功能"**：`refractor` 那 400 个语言**一个都没少**，代码高亮
 * 照旧全部支持——变的只是**下拉里预先摆出来的选项**。剩下的三百来个走新加的
 * 输入框（`lang-picker.ts` 顶上那个），打什么用什么。
 *
 * ⚠️ 判据是 `有专属图标`（真图那张 93 项的表），**不是色表**——400 个语言人人
 * 都有一颗徽章（首字母 + 代表色），拿"有没有徽章"筛等于没筛。理由写在
 * `lang-icon.ts` 文件头那张表里。
 *
 * ⚠️ 这里**不筛掉空语言**：`""` 不是"一个没有图标的语言"，它是"不指定语言"
 * 那一项（下拉第一行，显示「纯文本」）。筛掉它，用户就再也没法把语言改回空了。
 */
function allLanguages(): string[] {
  if (sortedLanguages === null) {
    sortedLanguages = refractor
      .listLanguages()
      .filter((名) => 有专属图标(名))
      .sort((a, b) => a.localeCompare(b));
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
 *
 * ⚠️ **导出给 `ui/useClipboard.ts` 用**（2026-09-25）：菜单里的「复制」「剪切」
 * 也要写纯文本，两条路必须与这里**逐字相同**——各写一份的话，代码块的复制按钮
 * 能用、菜单里的复制用不了（或反过来），而那种"同一个动作两个结果"的毛病
 * 极难被当成同一个 bug 报上来。
 */
export async function writeClipboard(text: string): Promise<boolean> {
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
      //   <div class="nota-code-gutter" contenteditable="false">1\n2\n3</div>
      //   <div class="nota-code-bar" contenteditable="false">…</div>
      //   <span class="nota-code-lang-wrap" contenteditable="false">…</span>
      // </pre>
      // ⚠️ 后三个都是**绝对定位的挂件**，不占文档流、不进 contentDOM。
      // 区别只在于画在哪：
      // - gutter（行号）在块**内部**左侧那条装订线里，默认不显示；
      // - bar（折叠 / 复制）在块**下沿之外**的左侧（2026-09-26 从块内搬出来）；
      // - 语言框在块**下沿之外**的右侧。
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      pre.appendChild(code);

      // ⚠️ 行号这一条**常驻生成、由 CSS 决定显不显示**（`useCodeBlockPrefs.ts`
      // 那三条 `data-*`）。不在 JS 里判设置的理由有两条，都很要紧：
      // ① 判了就得把设置传进 `createEditor`，再进 `EditorPane` 那个 effect 的
      //    依赖 → 拨一下"显示行号"就重建编辑器，撤销栈和光标全丢；
      // ② 常驻生成的代价只是几行文本，`display: none` 时一个像素都不画。
      const gutter = document.createElement("div");
      gutter.className = "nota-code-gutter";
      // 同 bar 那条理由：光写 `contenteditable` 拦不住 ProseMirror 把在它上面的
      // 点击当成"用户点了编辑区"去挪光标（它还要 `stopEvent` 那一条）。
      gutter.contentEditable = "false";
      // 行号不许被选中、不许吃鼠标：它压在代码左边的空位上，用户在那儿拖选
      // 文字时不该选中一串数字（CSS 里也有 `user-select: none`，两处都要）。
      gutter.setAttribute("aria-hidden", "true");

      const bar = document.createElement("div");
      bar.className = "nota-code-bar";
      // `contenteditable="false"` 是给浏览器看的；`stopEvent` 是给 ProseMirror
      // 看的。**两个都要**——只写前者，PM 照样会把在 select 上的点击当作
      // "用户点了编辑区"去挪光标。
      bar.contentEditable = "false";

      const foldBtn = document.createElement("button");
      foldBtn.type = "button";
      foldBtn.className = "nota-code-btn";
      foldBtn.textContent = t("Collapse");
      foldBtn.title = t("Collapse this code block");

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "nota-code-btn";
      copyBtn.textContent = t("Copy");
      copyBtn.title = t("Copy Code");

      /** 改节点属性。高亮由 plugin-prism 读属性重算，不用本仓操心。 */
      const applyLanguage = (lang: string) => {
        const pos = getPos();
        if (typeof pos !== "number") return;

        const current = view.state.doc.nodeAt(pos);
        if (!current || current.type.name !== "code_block") return;
        if (current.attrs.language === lang) return;

        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language: lang }),
        );
        view.focus();
      };

      // ⚠️ 语言框**不住在 `.nota-code-bar` 里**（2026-09-25 移出）。用户点名要它
      // 在「代码块右下方，下面」，而 bar 那条是贴在块**内部**右下角的——两个位置
      // 差一层，所以它直接挂在 `pre` 上，位置交给 CSS 的
      // `.nota-code-lang-wrap`（`top: 100%`，落在下边框外面）。
      // `pre` 本来就是 `position: relative`，且 `overflow: visible`，
      // 画到框外不会被裁掉——那两条都不是为它加的，是围栏标记先用上的。
      // ⚠️ `contenteditable="false"` **要自己写**：以前是跟着 bar 继承来的，
      // 搬出来之后不写，ProseMirror 就会把在它上面的点击当成"用户点了编辑区"。
      //
      // ⚠️ 里面这层 `span` 还得留：它是**弹层定位与那颗自画箭头的锚**
      // （`.nota-code-lang-wrap` 的 `::after`）。⚠️ 里面那颗控件 2026-09-25 从
      // **原生 `<select>` 换成了自绘下拉**（`lang-picker.ts`），原因是原生弹层里
      // 放不了图标——所以 `appearance: none` 那一段历史只在设置页那个下拉上还成立，
      // 这里已经不适用了（`<select>` 都没了）。
      const langWrap = document.createElement("span");
      langWrap.className = "nota-code-lang-wrap";
      langWrap.contentEditable = "false";

      // ⚠️ **必须是一个会跟着 `update` 走的活引用**，不能直接闭包 `initialNode`
      // （2026-09-25 实测踩出来的）。`initialNode` 是建这个视图时的那个节点，
      // 永远不变；一旦语言被改过（不管是在本框里选的、还是在源码模式里改的），
      // 它记的还是老语言。后果有两处，且**都在点开下拉那一下才发作**：
      //  ① 闭合框上的字会**倒退回旧语言**（`lang-picker.ts` 的 click 里那句
      //     `画闭合(选项.当前语言())`）；
      //  ② 开场高亮的是旧语言那一项，用户按 Enter 就把它又选回去了。
      // 而"选语言"那条路是好的（`applyLanguage` 走 `getPos()`＋`nodeAt()` 读活文档），
      // 所以症状是"改成 A 之后框上写着 B、再点开还是高亮 B"——一半对一半错。
      let 当前节点 = initialNode;

      const 语言选择器 = 创建语言选择器({
        全部语言: allLanguages,
        当前语言: () => languageOf(当前节点),
        选语言: applyLanguage,
      });
      langWrap.appendChild(语言选择器.dom);

      bar.append(foldBtn, copyBtn);
      pre.append(gutter, bar, langWrap);

      // ── 复制 ──────────────────────────────────────────────────────────
      // `mousedown` 上 preventDefault：不这样做，点按钮会先让编辑区失焦、
      // 选区被清掉。
      copyBtn.addEventListener("mousedown", (e) => e.preventDefault());
      copyBtn.addEventListener("click", () => {
        void (async () => {
          const ok = await writeClipboard(code.textContent ?? "");
          copyBtn.textContent = ok ? t("Copied") : t("Copy Failed");
          window.setTimeout(() => {
            copyBtn.textContent = t("Copy");
          }, COPY_FEEDBACK_MS);
        })();
      });

      // ── 折叠 ──────────────────────────────────────────────────────────
      // ⚠️ 折叠状态**只活在这个视图里**，不写进文档——它不是文档的属性。
      // 存进去会让同一份 .md 在不同人手里长得不一样。
      // 同样地，折叠走的是 CSS 的 `max-height`，**不是 `display: none`**：
      // 藏起来的 contentDOM 会让 ProseMirror 没法在里面放光标，
      // 点到折叠区就是一次"选区落进不可见元素"的报错。
      foldBtn.addEventListener("mousedown", (e) => e.preventDefault());
      foldBtn.addEventListener("click", () => {
        const folded = pre.classList.toggle("nota-code-folded");
        foldBtn.textContent = folded ? t("Expand") : t("Collapse");
        foldBtn.title = folded ? t("Expand this code block") : t("Collapse this code block");
      });

      // ── 与 ProseMirror 的边界 ─────────────────────────────────────────
      // ⚠️ 判据是「三个挂件」不是「bar」：语言框 2026-09-25 搬到了 `pre` 底下、
      // 行号 2026-09-26 加进来，两者都不住在 bar 里。只判 bar 的话，在它们上面
      // 点一下就会被 PM 当作"点了编辑区"去挪光标（`stopEvent`）。
      const inChrome = (target: EventTarget | null) =>
        target instanceof Node &&
        (bar.contains(target) || langWrap.contains(target) || gutter.contains(target));

      const syncChrome = (node: PMNode) => {
        const lang = languageOf(node);
        // `data-language` 是原有约定，`instant-render.ts` 画围栏标记时读它。
        if (lang) pre.dataset.language = lang;
        else delete pre.dataset.language;
        // 闭合状态显示的就是当前语言。⚠️ 这一句**不能省**：在源码模式里把
        // 围栏的语言改了、再切回所见即所得，走的就是这条路——
        // 少了它，框上写的还是旧语言。
        语言选择器.设语言(lang);
        // 行号要跟着**内容**走，而这个函数在 `update` 里每次都被调，正好是
        // 那条通路。⚠️ 判一下再写：`textContent` 的赋值会把整段文本重排一次，
        // 而上游的 `update` 是**每次光标移动、每次节点属性变化**都会来的
        //（改语言、拖列宽…），那种"内容没变也要重排一遍行号"的开销在小文档上
        // 看不出来，长代码块上会变成打字时的卡顿。
        const 号 = 行号(node);
        if (gutter.textContent !== 号) gutter.textContent = 号;
      };

      syncChrome(initialNode);

      return {
        dom: pre,
        contentDOM: code,

        update: (updated) => {
          // 节点类型变了（比如说这个代码块被转成了段落）→ 这个视图不该再用。
          if (updated.type !== initialNode.type) return false;
          // ⚠️ 这两句的顺序不能反：先把活引用换掉，`syncChrome` 里那条
          // `设语言()` 和之后任何一次 `当前语言()` 才读得到新节点。
          当前节点 = updated;
          syncChrome(updated);
          return true;
        },

        // 这一条和底下那条是**两件事**，别合并：
        // `stopEvent` 管的是一进来就拦下（点、按键、滚轮）；
        // `ignoreMutation` 管的是已经发生的 DOM 变更要不要告诉 ProseMirror。
        // 少了后者，"复制"按钮把文字改成"已复制"这件事会被 PM 当成
        // "用户在编辑区里改了东西"，于是它去重解析——那一下光标就飞了。
        stopEvent: (e) => inChrome(e.target),

        ignoreMutation: (m) => inChrome(m.target),

        // ⚠️ **必须有**：语言下拉的弹层挂在 `document.body` 上（理由见
        // `lang-picker.ts` 的文件头），它**不归 ProseMirror 管**，
        // 所以没人会替我们收。不摘的话，每销毁一个代码块就留一个孤儿弹层在
        // `body` 上——文档一改就多一个，肉眼看不见但一直在那儿。
        destroy: () => 语言选择器.销毁(),
      };
    },
);

/** 取节点的语言属性。缺省是空串，统一成 `NO_LANGUAGE`。 */
function languageOf(node: PMNode): string {
  const raw = node.attrs.language;
  return typeof raw === "string" ? raw : NO_LANGUAGE;
}

/**
 * 一颗代码块的行号文本（`1\n2\n3`），行数按**换行符**数。
 *
 * ⚠️ 读的是 `node.textContent`（**文档树**）而不是 `code.textContent`（DOM）：
 * 文档树是权威，DOM 只是它这一刻的样子。而且 `syncChrome` 里那个
 * "一样就不写"的判断要两边同源才成立（拿 DOM 当输入的话，写完一次之后
 * 第二次读到的正是自己写的值，判断恒成立——行号从此再不更新）。
 *
 * ⚠️ **末尾换行算一行**（`"a\n"` → 2）：代码块的 `textContent` 里空行是
 * 真实存在的行，`split("\n").length` 数的就是屏幕上那几行——最后一行空着时
 * 用户看得见一个空行，行号不该少一个。
 *
 * ⚠️ 这里**不做换行折行后的续行号**：自动换行（`white-space: pre-wrap`）把一条
 * 逻辑行折成两行显示时，它仍然只占一个行号——这是编辑器里的通行口径
 *（VSCode 亦然），因为行号指的是**文件里的第几行**，不是屏幕上的第几行。
 */
function 行号(node: PMNode): string {
  const 行数 = node.textContent.split("\n").length;
  const 出: string[] = [];
  for (let i = 1; i <= 行数; i++) 出.push(String(i));
  return 出.join("\n");
}
