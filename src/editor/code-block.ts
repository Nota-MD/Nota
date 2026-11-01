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
import { katexOptionsCtx } from "./math-schema";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type { Command } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";
import type { KatexOptions } from "katex";
import { refractor } from "refractor";
import { t } from "@/i18n";

import { computeMostSmallChangeAction } from "./code-block-change";
import type { codeBlockEditor } from "./code-block-cm";
import { liftCodeBlockToParagraphs } from "./code-block-lift";
import { createHTMLPreview } from "./code-preview";
import { createLanguagePicker } from "./lang-picker";
import { hasDedicatedBelongIcon } from "./lang-icon";
import {
  ensureLanguageIcons,
  languageIconsReady,
  relatedIconLanguages,
  representTableLanguage,
} from "./lang-icon-registry";
import { createNumberLearnCodeOutput, isMathCodeLanguage } from "./math-code";
import {
  ensureFullLanguageTable,
  languageTableReady,
} from "./refractor-runtime";

/** 下拉第一项：不指定语言。与 `code_block` 的 `language` 默认值一致。 */
const NO_LANGUAGE = "";

/** `math` 是 Nota 的数学围栏别名；refractor 没有同名语言，所以单独列入下拉。 */
const numberLearnLanguageDistinguishName = "math";

/** 语言名算一次就够。400 个名字排一遍序是毫秒级，但没必要每个代码块排一次。 */
let sortedLanguages: string[] | null = null;

// ⚠️ 全量语言表（`refractor` 的数百种）**只按需加载**（2026-10-31 收紧）：
// 那一份 `refractor/all` 是 ~500 kB，静态 import 会压进首屏，而首屏真正需要的
// 高亮语言是 common 那 62 种（上面 `import { refractor } from "refractor"`
// 已经把它们注册好了）。此前虽然用了动态 import，却在模块顶层立刻发出请求，
// 等于每个普通文档都承担了长尾语言注册表的内存；现在推迟到真正打开语言选择器，
// 或代码块确实使用未注册语言时。
//
// 为什么要自己加载：`@milkdown/plugin-prism` 内部也是
// `import { refractor } from "refractor"`，两边是**同一个单例**
// （都从 `refractor/lib/core.js` 拿那一个 `refractor`），而它读语言表是
// **惰性**的（`getBlockDecorations(node, pos, refractor, languages = refractor.listLanguages())`
// 里那是默认参数，每次重算都要现取），所以这里补注册的，它立刻看得见。
//
// ⚠️ **已知的一个时序**（如实记着，别当成"没这回事"）：开机时正开着一份
// **长尾语言**（不在 common 62 里）的文档，那个代码块在**首次编辑代码块之前**
// 可能显示为未高亮的纯文本——prism 的装饰只在 `docChanged` 时重算
// （`plugin-prism/lib/index.js` 的 `apply` 第一行就判它，点一下不算）。
// 编辑那个块、或改任何一个代码块，整篇的重算就发生了，高亮随即补上。
// 判据：这个窗口只在"冷启动第一帧还没到 + 文档里正好有长尾语言块"时存在。

/**
 * 全量语言表到了没有。**给测试/诊断用**（界面不等它）。⚠️ 它 `true` 不代表
 * 每个语言都注册成功——`refractor/all` 里个别语言的自注册是会抛的
 * （上游就那样），这里只反映"那一整包代码跑过了"。
 */
export { languageTableReady };

/** 主动加载并等待完整语言表；语言选择器打开时使用。 */
export function awaitLanguageTable(): Promise<void> {
  return Promise.all([ensureFullLanguageTable(), ensureLanguageIcons()]).then(() => {
    // 下拉那份名字算过一次就缓存了；全量表到了要重算。
    sortedLanguages = null;
    searchableLanguages = null;
  });
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
export function allLanguages(): string[] {
  if (sortedLanguages === null) {
    const languages = refractor.listLanguages();
    if (!languageIconsReady()) {
      return [...new Set([...languages.filter((name3) => name3.trim() !== ""), numberLearnLanguageDistinguishName])].sort(
        (a, b) => a.localeCompare(b),
      );
    }
    sortedLanguages = languages
      .filter((name3) => hasDedicatedBelongIcon(name3) || name3 === numberLearnLanguageDistinguishName)
      // ⚠️⚠️ **同一门语言只留一行**（2026-10-16，朋友报的「代码块语言类型重复」）：
      // 真图那张表里每一组就是"同一门语言的不同写法"（`markdown`/`md`、
      // `plaintext`/`plain`/`text`/`txt`、`nasm`/`armasm`/`asm6502`/`arm-asm`…），
      // 而它们排进下拉就是好几行**一模一样的东西**（用户那张图里 `arm-asm` 与
      // `armasm` 挨着）。判据是 `代表语言`——组里第一个是代表。
      // ⚠️ **一个都没少**：`refractor` 那 400 个 id 照旧全部支持，用户手打
      // `armasm` 一样能用（输入框那条路，`lang-picker.ts`）；变的只是"摆出来的
      // 那几行"。
      .filter((name3) => representTableLanguage(name3) === name3)
      .sort((a, b) => a.localeCompare(b));
  }
  return sortedLanguages;
}

let searchableLanguages: string[] | null = null;

/** 输入查询时使用的完整 refractor 语言表；默认下拉仍只预摆带图标的语言。 */
export function searchLanguages(): string[] {
  if (searchableLanguages === null) {
    searchableLanguages = [
      ...new Set([
        ...refractor.listLanguages().filter((name3) => name3.trim() !== ""),
        "math",
        "latex",
        "tex",
      ]),
    ].sort((a, b) => a.localeCompare(b));
  }
  return searchableLanguages;
}

/**
 * 同一个图标组里的**全部写法**（含代表名自己）。
 *
 * ⚠️ 给搜索用：下拉里一行一个语言族（`allLanguages` 那条写着为什么），而用户
 * 可能按 `armasm` / `md` / `plain` 这些**别名**找——它们和代表名是同一门语言。
 * ⚠️ 表里没有的（用户自己敲的那种）原样给一个。
 */
export function relatedLanguages(id: string): readonly string[] {
  return relatedIconLanguages(id);
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
  (ctx) => {
    let numberLearnOption: KatexOptions = {};
    try {
      numberLearnOption = ctx.get(katexOptionsCtx.key) ?? {};
    } catch {
      // 选项没准备好时仍显示公式，只是 physics 宏不可用。
    }
    return (initialNode: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
      // ── 结构 ──────────────────────────────────────────────────────────
      // <pre data-language="rust">
      //   <code class="nota-code-text">…</code>  ← contentDOM：ProseMirror 的文本住这儿
      //   <div class="cm-editor">…</div>        ← CodeMirror：用户看到/打字的那一层
      //   <span class="nota-code-lang-wrap" contenteditable="false">…</span>
      // </pre>
      //
      // ⚠️ **2026-10-06（backlog 第 101 项）起，代码块有两层文本**，别把
      // 任何一层当成"多余的那一层"删掉：
      // - `code`（contentDOM）是 **ProseMirror 的那一份**——文档树、撤销栈、
      //   存盘、查找，读的都是它。它**不给用户看**（CSS 把它收成零尺寸），
      //   但它必须**存在且是 `pre` 的子元素**：ProseMirror 规定有内容的节点
      //   必须有一个 contentDOM 来装它的文本。
      // - `.cm-editor` 是**用户真正在用的那一个**（CodeMirror 实例，
      //   见 `code-block-cm.ts`）。两边的文本由本文件那两把 `同步中` 锁收口。
      //
      // ⚠️ 为什么不让 CodeMirror 直接当 contentDOM：它的 DOM 结构是
      // 「一行一个 `<div class="cm-line">`」，而 ProseMirror 要按**文本偏移**
      // 往 contentDOM 里映射位置（`Decoration`、`domFromPos`）。两套坐标对不上，
      // `@milkdown/plugin-prism` 那种按偏移挂的行内装饰会整片错位。
      // ⚠️ 后两个都是**绝对定位的挂件**，不占文档流、不进 contentDOM。
      // 区别只在于画在哪：
      // - 行号由 CodeMirror 的原生 gutter 画在输入面内部；
      // - 语言框在块**下沿之外**的右侧。
      const pre = document.createElement("pre");
      // Typora 主题把代码块写成 `pre.md-fences`。这是结构兼容标记，不触发任何
      // 主题专用程序分支；没有外部主题时它也只是一个不会命中的 class。
      pre.className = "md-fences ty-contain-cm nota-source-surface";
      // ⚠️⚠️ **这一行是整件事的开关，删了它代码块就整个哑掉**（2026-10-06
      // 一路开窗量出来的）。
      //
      // 浏览器只允许**一个**编辑宿主是 `document.activeElement`，而 WebKitGTK
      // 在**嵌套** contenteditable 的情形下认的是**外层那个**（`.ProseMirror`）。
      // 于是里面的 CodeMirror 永远拿不到 activeElement——它自己那句
      // `hasFocus` 判的正是 `activeElement == .cm-content` → 恒为假，症状是：
      // **光标画不出来、`Backspace` 一动不动、`Tab` 变成一个制表符、
      // 回车按在行首**。而"能打字"这条假象最容易让人查错方向：打字是浏览器
      // 直接写进 DOM 的，不经过任何键位表。
      //
      // `contenteditable="false"` 把这一段画成**非编辑孤岛**，里面的
      // `.cm-content` 于是自成编辑宿主、拿得到 activeElement。
      // ⚠️ 它与继承规则不冲突：显式 `true` 的后代在 `false` 的祖先里照样可编辑
      //（这正是这里要的）。⚠️ 顺带把 PM 那条路也收干净了——它再也不会把那个
      // 零尺寸的 contentDOM 当光标落点。
      pre.contentEditable = "false";
      const code = document.createElement("code");
      code.className = "nota-code-text";
      // Document themes are user CSS and may target `pre code` broadly. Keep
      // the ProseMirror contentDOM laid out but unreachable through inline,
      // important styles so a theme cannot turn it back into visible code or
      // a selectable duplicate beneath the CodeMirror surface.
      for (const [property, value] of Object.entries({
        position: "absolute",
        top: "0",
        left: "-100000px",
        display: "block",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        opacity: "0",
        visibility: "hidden",
        "clip-path": "inset(50%)",
        "pointer-events": "none",
        "user-select": "none",
        "-webkit-user-select": "none",
      })) {
        code.style.setProperty(property, value, "important");
      }
      code.setAttribute("aria-hidden", "true");

      /**
       * 改节点属性（语言）。
       *
       * ⚠️ **2026-10-06 起代码块里的着色归 CodeMirror**（第 101 项）：
       * 本函数只写节点属性，`syncChrome` 会把新语言转给 CM 那一侧重算。
       * 原来的读者 `@milkdown/plugin-prism` **仍然在插件表里**（
       * 源码模式、以及别的节点的着色它还管着），但代码块这一条已经不走它了
       * ——代码块的 contentDOM 是零尺寸的，它挂的行内装饰画不出来。
       */
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

      // ⚠️ 语言框直接挂在 `pre` 上，位置交给 CSS 的
      // `.nota-code-lang-wrap`（`top: 100%`，落在下边框外面）。
      // `pre` 本来就是 `position: relative`，且 `overflow: visible`，
      // 画到框外不会被裁掉——那两条都不是为它加的，是围栏标记先用上的。
      // `contenteditable="false"` 告诉浏览器这一块不是正文输入面；
      // ProseMirror 那一侧再由 `stopEvent` 拦住。
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
      let currentNode = initialNode;
      let codeEditor: codeBlockEditor | null = null;
      let editorDisposed = false;
      let waitingSelection: [number, number] | null = null;
      let waitingFocus = false;

      const languagePicker = createLanguagePicker({
        allLanguages: allLanguages,
        searchSearchLanguage: searchLanguages,
        prepare: awaitLanguageTable,
        // ⚠️ 搜索要连**别名**一起认（2026-10-16）：下拉一行一个语言族，
        // 而 `armasm` / `md` / `plain` 这些别名也得能筛出那一行。见 `代表语言`。
        distinguishName: relatedLanguages,
        currentLanguage: () => languageOf(currentNode),
        selectLanguage: applyLanguage,
        restoreFocus: () => codeEditor?.clusterFocus(),
      });
      langWrap.appendChild(languagePicker.dom);

      /** `math` / `latex` / `tex` 围栏的渲染结果。普通代码语言时整块隐藏。 */
      const numberLearn = createNumberLearnCodeOutput(numberLearnOption);
      const setNumberLearnEditEdit = (open2: boolean) => {
        wrap.classList.toggle("nota-code-math-editing", open2);
      };

      // ── CodeMirror：这一段的输入面 ─────────────────────────────────────
      // ⚠️ **两把 `同步中` 锁**是本批最要紧的一处（`code-block-cm.ts` 文件头
      // 那三个坑的第一个）：这一把管"PM 收到的改动是不是自己刚推出去的那一笔"，
      // CM 那边同名的那一把管"CM 收到的改动是不是自己刚推回来的一笔"。
      // 少任何一把，光标都会跳、撤销栈都会被拆碎。
      let sameStepMiddle = false;

      /** 把一条 ProseMirror 命令当函数调。（撤销/重做要它。） */
      const walkCommand = (command: Command) => {
        command(view.state, view.dispatch, view);
      };

      // ⚠️ **撤销归 ProseMirror**（第 101 项点名的第二个坑）：CM 那一侧
      // **刻意没装 `history()`**，代码块里的 Ctrl+Z 转给 PM 走。
      // 装两套的话，两边各记一份、互相看不见对方——"在代码块里改一个字、
      // 点到正文再按 Ctrl+Z"就会只撤销正文那一步，而用户以为撤销的是刚才那次编辑。
      const bootstrap = document.createElement("textarea");
      bootstrap.className = "nota-code-bootstrap";
      bootstrap.value = initialNode.textContent;
      bootstrap.rows = Math.max(1, bootstrap.value.split("\n").length);
      bootstrap.setAttribute("spellcheck", "false");
      bootstrap.setAttribute("aria-label", "Code");

      const openHeadCell = () => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        const current = view.state.doc.nodeAt(pos);
        if (!current || current.type.name !== "code_block") return;
        // Opening Backspace removes the fence. Non-empty code becomes normal
        // paragraphs line by line; empty code becomes an empty paragraph.
        const paragraph = liftCodeBlockToParagraphs(current, view.state.schema);
        if (!paragraph) return;
        const tr = view.state.tr.replaceWith(pos, pos + current.nodeSize, paragraph);
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
        view.dispatch(tr.scrollIntoView());
        view.focus();
      };

      /**
       * 把 CodeMirror 里的改动**推回文档**（一笔真事务）。
       *
       * ⚠️ 推的是 `算最小改动` 抠出来的那一段，**不是"整块换掉"**：
       * 整块换的话每敲一个字都记一笔"整块替换"，撤销一下会把一整段一起吞掉。
       *
       * ⚠️ 推完**要把 PM 的选区跟到 CM 的光标上**。PM 的 DOM 选区不会动
       *（CM 拿着焦点时 `selectionToDOM` 直接返回），动的是它 state 里那一份
       * ——不跟的话，"在代码块里打字时按 Ctrl+B"这类命令会作用到别处去，
       * 而那是一种**界面上看不出来**的错。
       */
      function pushReturnDocument(newText: string, cursorHint?: number) {
        if (sameStepMiddle) return;
        const pos = getPos();
        if (typeof pos !== "number") return;
        const liveNode = view.state.doc.nodeAt(pos);
        if (!liveNode || liveNode.type.name !== "code_block") return;
        const oldText = liveNode.textContent;
        if (oldText === newText) return;

        const { deleteStart, deleteEnd, insert } = computeMostSmallChangeAction(oldText, newText);
        if (deleteStart === deleteEnd && !insert) return;

        const base = pos + 1;
        let transaction = view.state.tr;
        if (deleteStart < deleteEnd) {
          transaction = insert
            ? transaction.replaceWith(base + deleteStart, base + deleteEnd, view.state.schema.text(insert))
            : transaction.delete(base + deleteStart, base + deleteEnd);
        } else {
          transaction = transaction.insertText(insert, base + deleteStart);
        }

        try {
          transaction = transaction.setSelection(
            TextSelection.create(transaction.doc, base + (cursorHint ?? codeEditor?.getCursor() ?? 0)),
          );
        } catch {
          // 位置落不进去（极端情况）就只改文本。下一次按键选区会自己修正。
        }

        sameStepMiddle = true;
        try {
          view.dispatch(transaction);
        } finally {
          sameStepMiddle = false;
        }
      }

      /**
       * CM 拿到焦点时，把 PM 的选区也挪进这个代码块。
       *
       * ⚠️ 这一步**不是可有可无的**：不挪，PM 的选区还停在用户上一次点的地方
       *（可能在第 3 段），于是走 PM 的那些命令（`Ctrl+A`、格式、查找）会去动
       * 那一段——用户在代码块里看着自己的光标，命令却作用在别处。
       * ⚠️ `addToHistory: false`：这只是"光标挪了一下"，不该占一格撤销。
       */
      function recognizeLeadSelection() {
        const pos = getPos();
        if (typeof pos !== "number") return;
        try {
          const to2 = pos + 1 + (codeEditor?.getCursor() ?? bootstrap.selectionStart);
          view.dispatch(
            view.state.tr
              .setSelection(TextSelection.create(view.state.doc, to2))
              .setMeta("addToHistory", false),
          );
        } catch {
          // 同上：位置落不进去就只当没挪过。
        }
      }

      bootstrap.addEventListener("input", () => {
        bootstrap.rows = Math.max(1, bootstrap.value.split("\n").length);
        pushReturnDocument(bootstrap.value, bootstrap.selectionStart);
      });

      // CodeMirror is optional startup weight: documents with no fenced code
      // never request this chunk. A code block remains typable in the bootstrap
      // textarea while the real editor is being fetched.
      let editorStarted = false;
      let heavyPreviewStarted = false;
      let visibilityObserver: IntersectionObserver | null = null;
      const ensureCodeBlockEditor = () => {
        if (editorStarted || editorDisposed) return;
        editorStarted = true;
        visibilityObserver?.disconnect();
        visibilityObserver = null;
        void import("./code-block-cm")
          .then(({ createCodeBlockEditor }) => {
            if (editorDisposed) return;
            const editor = createCodeBlockEditor({
              initialStartText: currentNode.textContent,
              initialStartLanguage: languageOf(currentNode),
              nativeLineNumbers: true,
              textChangeConvert: (newText, cursor) =>
                pushReturnDocument(newText, cursor),
              clusterFocus: () => {
                setNumberLearnEditEdit(true);
                recognizeLeadSelection();
              },
              loseFocus: () => {
                queueMicrotask(() => {
                  if (!wrap.contains(document.activeElement)) setNumberLearnEditEdit(false);
                });
              },
              undoCancel: () => walkCommand(undo),
              heavyDo: () => walkCommand(redo),
              openHeadBackCell: openHeadCell,
            });
            codeEditor = editor;
            bootstrap.replaceWith(editor.view.dom);
            syncChrome(currentNode);
            if (waitingSelection) editor.setSelection(...waitingSelection);
            if (waitingFocus) editor.clusterFocus();
          })
          .catch((error: unknown) => {
            console.error("[nota] code editor failed to load", error);
            bootstrap.classList.add("nota-code-bootstrap-error");
            bootstrap.setAttribute("aria-label", t("Code editor failed to load"));
          });
      };
      bootstrap.addEventListener("focusin", ensureCodeBlockEditor);

      // ── HTML 预览（2026-10-16）───────────────────────────────────────
      // ⚠️ **它长在 `pre` 之外**（`wrap > pre ＋ 预览`），所以这一批多套了一层
      // `div.nota-code-wrap`。两层理由：
      // ① 预览要**占文档流**（它不是浮层）：`pre` 上那三样挂件全靠
      //    `position: absolute` 挂在块外，谁也不推下一段；预览是一整块框，
      //    必须把后面的内容顶下去；
      // ② `pre` 上有 `overflow: visible`（为围栏标记留的）与一堆绝对定位的
      //    挂件，把预览**塞进 `pre` 里面**去改它的内边距，会连语言框、按钮条
      //    的落点一起挪。
      // ⚠️ 这一层 `div` 让 `.ProseMirror > pre` 那类**直接子元素**选择器不再命中
      //    ——现网那几条全是后代选择器（`.ProseMirror pre`），核过，一条不受影响；
      //    往后加样式时照着后代选择器写。
      // ⚠️ 预览语言不是 HTML 时它 `hidden`，**一个像素都不占**（见 `code-preview.ts`）。
      const wrap = document.createElement("div");
      wrap.className = "nota-code-wrap";
      const preview = createHTMLPreview();

      // ⚠️ 顺序：`code`（隐藏的 contentDOM）与 CM 的根一起放在最前，两个挂件随后。
      // 挂件都是绝对定位，顺序上不敏感，但 contentDOM 必须是 `pre` 的子元素。
      pre.append(code, bootstrap, langWrap);
      // ⚠️ 当前顺序是**源码在上、生成物在下**：普通代码块后面接 HTML 预览，
      // `math` / `latex` / `tex` 后面接 KaTeX。数学预览曾经排在 `pre` 前面，
      // 结果是“上方公式、下方源码”，与 Mermaid、HTML 预览的方向相反。
      wrap.append(pre, numberLearn.element, preview.element);

      // Keep hidden examples as lightweight textareas. Only code blocks near
      // the viewport or focused by the user instantiate CodeMirror.
      const startHeavyContent = () => {
        if (heavyPreviewStarted) return;
        heavyPreviewStarted = true;
        syncChrome(currentNode);
        preview.sameStep(currentNode, true);
        ensureCodeBlockEditor();
      };

      if (typeof IntersectionObserver === "undefined") queueMicrotask(startHeavyContent);
      else {
        visibilityObserver = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) startHeavyContent();
          },
          { rootMargin: "600px 0px" },
        );
        visibilityObserver.observe(wrap);
      }

      // 收起态只看见渲染结果；点它进入“上面源码、下面公式”的编辑态。
      numberLearn.element.addEventListener("mousedown", (event) => {
        event.preventDefault();
        setNumberLearnEditEdit(true);
        if (codeEditor) codeEditor.clusterFocus();
        else {
          ensureCodeBlockEditor();
          waitingFocus = true;
          bootstrap.focus();
        }
      });

      // 点在 `pre` 的**内边距**上（不在 CM 的内容里）时，把焦点交给 CM。
      // ⚠️ 不这么做的话这一击被 `stopEvent` 拦下、谁也不管——用户会觉得
      // "点了没反应"。语言框由 `inChrome` 排除，不会抢走正文焦点。
      pre.addEventListener("mousedown", (e) => {
        const target = e.target;
        if (!(target instanceof Node)) return;
        if (inChrome(target)) return;
        if (codeEditor) codeEditor.clusterFocus();
        else {
          ensureCodeBlockEditor();
          waitingFocus = true;
          bootstrap.focus();
        }
      }, true);

      // ── 与 ProseMirror 的边界 ─────────────────────────────────────────
      // 语言框和公式预览都是编辑器 chrome，点它们不该让 PM 挪正文光标。
      const inChrome = (target: EventTarget | null) =>
        target instanceof Node &&
        (langWrap.contains(target) || numberLearn.element.contains(target));

      const syncChrome = (node: PMNode) => {
        const lang = languageOf(node);
        // `data-language` 是原有约定，`instant-render.ts` 画围栏标记时读它。
        if (lang) pre.dataset.language = lang;
        else delete pre.dataset.language;
        // 闭合状态显示的就是当前语言。⚠️ 这一句**不能省**：在源码模式里把
        // 围栏的语言改了、再切回所见即所得，走的就是这条路——
        // 少了它，框上写的还是旧语言。
        languagePicker.setLanguage2(lang);
        // ⚠️ 同一句话还要转给 CodeMirror：代码块里那一段的着色是它画的
        // （见 `code-block-cm.ts` 的分色插件）。**语言没变时它自己会短路**，
        // 所以这里不用先比一次。
        codeEditor?.setLanguage2(lang);
        const isMath = isMathCodeLanguage(lang);
        wrap.classList.toggle("nota-code-math", isMath);
        numberLearn.element.hidden = !isMath || !heavyPreviewStarted;
        if (isMath) {
          if (heavyPreviewStarted) numberLearn.sameStep(node.textContent);
          const pos = getPos();
          const selection = view.state.selection;
          const selectionAtBlockInside =
            typeof pos === "number" &&
            selection.from >= pos &&
            selection.to <= pos + node.nodeSize;
          if (wrap.contains(document.activeElement) || selectionAtBlockInside) setNumberLearnEditEdit(true);
          else setNumberLearnEditEdit(false);
        } else {
          setNumberLearnEditEdit(false);
        }
        // ⚠️ 预览跟着**语言**决定露不露脸、跟着**内容**换 `srcdoc`
        // （内部去抖，见 `code-preview.ts` 文件头第 3 条）。
        if (heavyPreviewStarted) preview.sameStep(node);
      };

      // Lightweight chrome is ready immediately. Preview engines wait until the
      // block is near the viewport, so a long document does not start KaTeX,
      // HTML iframes or Mermaid for every off-screen block.
      syncChrome(initialNode);
      if (heavyPreviewStarted) preview.sameStep(initialNode, true);

      return {
        dom: wrap,
        contentDOM: code,

        update: (updated) => {
          // 节点类型变了（比如说这个代码块被转成了段落）→ 这个视图不该再用。
          if (updated.type !== initialNode.type) return false;
          // ⚠️ 这两句的顺序不能反：先把活引用换掉，`syncChrome` 里那条
          // `设语言()` 和之后任何一次 `当前语言()` 才读得到新节点。
          currentNode = updated;
          syncChrome(updated);
          // ⚠️ CodeMirror 那一侧也要跟上：源码模式里改这段、撤销、
          // 后端整篇替换文档，进代码块的**只有这一条路**。
          // ⚠️ `同步中` 在这里**必须判**——不判的话"CM 推给 PM、PM 又推回 CM"
          // 就成环了（第 101 项点名的第一个坑）。
          const text4 = updated.textContent;
          if (!sameStepMiddle && bootstrap.isConnected && bootstrap.value !== text4) {
            bootstrap.value = text4;
          }
          if (codeEditor && !sameStepMiddle && text4 !== codeEditor.getText()) {
            sameStepMiddle = true;
            try {
              codeEditor.setText(text4);
            } finally {
              sameStepMiddle = false;
            }
          }
          return true;
        },

        // 这一条和底下那条是**两件事**，别合并：
        // `stopEvent` 管的是一进来就拦下（点、按键、滚轮）；
        // `ignoreMutation` 管的是已经发生的 DOM 变更要不要告诉 ProseMirror。
        // 少了后者，"复制"按钮把文字改成"已复制"这件事会被 PM 当成
        // "用户在编辑区里改了东西"，于是它去重解析——那一下光标就飞了。
        //
        // ⚠️ **2026-10-06 起判据放宽成整个 `pre` 子树**（原来是"三个挂件"）：
        // 代码区里现在是 CodeMirror 的 DOM，它每一次按键/重绘都发生在这个子树里。
        // 漏一条进去，PM 就会去重解析那一坨不属于它的 DOM——光标当场飞走。
        // ⚠️ 预览那一块（2026-10-16）也一起拦：点它不该被 PM 当成"点了编辑区"
        // 去挪光标。它里面的 iframe **自成一份文档**，那些事件根本不上来，
        // 所以这里判的是预览框自己那一圈内边距 / 边框。
        stopEvent: (e) =>
          e.target instanceof Node &&
          (pre.contains(e.target) ||
            numberLearn.element.contains(e.target) ||
            preview.element.contains(e.target)),

        // ⚠️ 一律 `true`：这个节点里的 DOM 变化**没有一件**是 PM 该关心的
        // ——文本的唯一入口是 `推回文档` 那条事务，不靠它从 DOM 里读。
        ignoreMutation: () => true,

        // ProseMirror 要把光标放进这个代码块时（从上面一段按 ↓ 进来、或者点它），
        // 把光标交给 CodeMirror。⚠️ 坐标是**相对这个节点内容起点**的
        //（PM 的 `ViewDesc` 逐层把节点起点减掉了），所以减 1 才是文本偏移。
        setSelection: (anchor2, head2) => {
          setNumberLearnEditEdit(true);
          const length = codeEditor?.getText().length ?? currentNode.textContent.length;
          const clamp = (n: number) => Math.max(0, Math.min(length, n - 1));
          const anchor = clamp(anchor2);
          const head = clamp(head2);
          waitingSelection = [anchor, head];
          if (codeEditor) {
            codeEditor.setSelection(anchor, head);
            codeEditor.clusterFocus();
          } else {
            ensureCodeBlockEditor();
          }
        },

        // ⚠️ **必须有**：语言下拉的弹层挂在 `document.body` 上（理由见
        // `lang-picker.ts` 的文件头），它**不归 ProseMirror 管**，
        // 所以没人会替我们收。不摘的话，每销毁一个代码块就留一个孤儿弹层在
        // `body` 上——文档一改就多一个，肉眼看不见但一直在那儿。
        // ⚠️ CodeMirror 实例同理：它的 DOM 随 `pre` 一起消失，但它的
        // MutationObserver 与内部状态得显式收掉。
        destroy: () => {
          editorDisposed = true;
          visibilityObserver?.disconnect();
          languagePicker.cancelDestroy();
          codeEditor?.cancelDestroy();
          // ⚠️ 预览自己那条待写的定时器也要撤（见 `code-preview.ts` 文件头）。
          preview.cancelDestroy();
        },
      };
    };
  },
);

/** 取节点的语言属性。缺省是空串，统一成 `NO_LANGUAGE`。 */
function languageOf(node: PMNode): string {
  const raw = node.attrs.language;
  return typeof raw === "string" ? raw : NO_LANGUAGE;
}
