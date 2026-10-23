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
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

// ⚠️ mermaid **不在这里静态 import**（2026-10-04，第 27 项）：全仓唯一
// import 点在下面 `渲染` 里，是动态的——几百 KB 只有真出图时才加载。
// 原先那条 `import mermaid from "mermaid"`（连同"必须在 package.json 里
// 显式列出"的整段来路，见 git 历史）随 `@milkdown/plugin-diagram` 一起
// 退役了；`package.json` 里那行依赖**留着**（动态 import 一样要它）。

import { t } from "@/i18n";

import { 图表规格 } from "@/editor/diagram-node";

/** 节点名。与 plugin 里 `const id = "diagram"` 一致，判类型时要用。 */
const 节点名 = "diagram";

/** 源码框改完多久写回文档。太短会在每个字上一笔事务，太长会觉得"没保存"。 */
const 防抖毫秒 = 250;

/** 缓存条数上限。超过就丢最老那条（LRU，见 `写缓存`）。 */
const 缓存上限 = 50;

/** 明暗。**按正文纸面判**，不按界面判（理由见 `读明暗`）。 */
type 明暗 = "light" | "dark";

/**
 * 一档渲染结果。**失败也是一种结果**，一样进缓存。
 */
type 渲染结果 =
  | { 状态: "ok"; 图形: string }
  | { 状态: "错"; 消息: string };

interface 缓存项 {
  /** 这份结果是哪份源码画的。identity 不变而源码变过时，靠它判不能复用。 */
  源码: string;
  结果: 渲染结果;
}

/** `identity|明暗` → 上次画出来的东西。 */
const 缓存 = new Map<string, 缓存项>();

function 查缓存(键: string, 源码: string): 渲染结果 | null {
  const 命中 = 缓存.get(键);
  if (!命中 || 命中.源码 !== 源码) return null;
  // 命中就挪到队尾（Map 的插入序就是这里的 LRU 序）。
  缓存.delete(键);
  缓存.set(键, 命中);
  return 命中.结果;
}

function 写缓存(键: string, 源码: string, 结果: 渲染结果): void {
  缓存.delete(键);
  缓存.set(键, { 源码, 结果 });
  while (缓存.size > 缓存上限) {
    const 最老 = 缓存.keys().next();
    if (最老.done) break;
    缓存.delete(最老.value);
  }
}

/** mermaid 每次渲染要一个**独一无二**的 id（它的内部 CSS 就是按这个 id 限域的）。 */
let 渲染序号 = 0;

/** 渲染的串行链。理由见 `渲染`。 */
let 渲染链: Promise<unknown> = Promise.resolve();

function 排队<T>(任务: () => Promise<T>): Promise<T> {
  // 前一个任务失败也要接着跑下一个，所以两个分支都给同一个 `任务`。
  const 结果 = 渲染链.then(任务, 任务);
  渲染链 = 结果.then(
    () => undefined,
    () => undefined,
  );
  return 结果;
}

/**
 * 把一份源码画成 SVG。
 *
 * ⚠️ **必须串行**：主题是 mermaid 的**全局配置**——`mermaid.render()` 没有
 * "这一次用哪个主题"这个参数，只能先 `initialize` 再 `render`。两份主题不同的
 * 渲染并行跑，后 `initialize` 的那份会把先跑的那份的配色顶掉。所以上面那条链
 * 把"设主题 + 渲染"整段锁起来。
 *
 * ⚠️ **mermaid 是动态 import 的**（2026-10-04，第 27 项）：它几百 KB，
 * 静态 import 会把它整个打进首屏——而多数文档一张图都没有。
 * 这里是全仓**唯一**的 import 点，`Promise` 在飞的时候天然去重
 * （ESM 的模块记录只有一份），连"加载中"的状态都不用画：
 * 第一次出图晚一两秒，之后有缓存。
 */
async function 渲染(源码: string, 主题: 明暗): Promise<渲染结果> {
  return 排队(async () => {
    const mermaid = (await import("mermaid")).default;

    // `startOnLoad` 这里重申一遍：`initialize` 是"整个配置表覆盖一次"，
    // 少给一条就落回默认值（默认 `true` 会让 mermaid 自己去扫页面上的
    // `.mermaid` 节点，那是另一条我们不要的路）。
    mermaid.initialize({
      startOnLoad: false,
      theme: 主题 === "dark" ? "dark" : "default",
    });

    const 编号 = `nota-mermaid-${++渲染序号}`;
    try {
      // ⚠️ 不传第三个参数（容器）：给了容器它会直接改我们传进去的元素，
      // 我们要的是拿到字符串自己插——插哪儿、什么时候插由本文件说了算。
      const { svg } = await mermaid.render(编号, 源码);
      return { 状态: "ok", 图形: svg };
    } catch (e) {
      清除残留(编号);
      return { 状态: "错", 消息: 提取消息(e) };
    }
  });
}

/**
 * 摘掉 mermaid 渲染失败时留在页面上的临时元素。
 *
 * ⚠️⚠️ **这一句不能省**。mermaid 的 `render$1` 在失败时是**先 throw、后 remove**
 * （`dist/mermaid-*.js` 里 `if (parseEncounteredException) throw …` 在
 * `node.remove()` 之前），而它为了画图会先在 `document.body` 上挂一个
 * `<div id="d<编号>">`。也就是说：**每失败一次，页面上就多留一张 mermaid 自带的
 * 红炸弹错误图**，挂在 body 最后、盖在所有东西上面，而本块里那块说明卡也在报
 * 同一件事——两个错误提示，其中一个还不在文档流里。
 */
function 清除残留(编号: string): void {
  // 非 sandbox（默认 `securityLevel: "strict"`）挂的是 `d<id>`；sandbox 档是
  // iframe `i<id>`。全试一遍，没有就算了。
  for (const id of [`d${编号}`, `i${编号}`, 编号]) {
    document.getElementById(id)?.remove();
  }
}

/**
 * 从异常里抠一句人能读的话。
 *
 * ⚠️ **mermaid 抛的不一定是 `Error`**：解析错（jison 那一层）抛的是个带
 * `str` / `hash` 的普通对象，`message` 未必有——只写 `e.message` 会得到
 * `undefined` 摆在用户面前。
 */
function 提取消息(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;

  const 形如错误 = e as { message?: unknown; str?: unknown } | null;
  if (形如错误) {
    if (typeof 形如错误.message === "string" && 形如错误.message) return 形如错误.message;
    if (typeof 形如错误.str === "string" && 形如错误.str) return 形如错误.str;
  }
  return String(e);
}

/**
 * 认一个 CSS 颜色，归一成 0–1 的三通道。认不出来返回 `null`。
 *
 * 借浏览器的解析器（canvas 的 `fillStyle`）而不是自己写正则：文档主题是
 * **用户写的 CSS**，`#abc`、`rgb()`、`hsl()`、系统色、`color-mix()` 都可能出现，
 * 自己解析等于把"哪些写法算数"重新定义一遍。
 */
function 归一颜色(值: string): [number, number, number] | null {
  if (!值) return null;
  const 上下文 = document.createElement("canvas").getContext("2d");
  if (!上下文) return null;

  // 先填一个哨兵：**无效的颜色值不会改变 `fillStyle`**，读回来还是哨兵，
  // 于是"认不出来"这件事是判得出来的（换成先设 `#000` 就不行——黑色是合法值）。
  上下文.fillStyle = "#010203";
  上下文.fillStyle = 值;
  const 归一 = 上下文.fillStyle;
  if (归一 === "#010203") return null;

  // 归一之后只可能是 `#rrggbb` 或 `rgba(r, g, b, a)` 两种写法。
  const 十六 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(归一);
  if (十六) {
    const [, r, g, b] = 十六;
    if (r && g && b) {
      return [parseInt(r, 16) / 255, parseInt(g, 16) / 255, parseInt(b, 16) / 255];
    }
  }
  const 函数式 = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(归一);
  if (函数式) {
    const [, r, g, b] = 函数式;
    if (r && g && b) {
      return [Number(r) / 255, Number(g) / 255, Number(b) / 255];
    }
  }
  return null;
}

/**
 * 从一棵树上读一个 CSS 变量的计算值。
 *
 * ⚠️ **脱离文档的节点读不到继承下来的变量**（`getComputedStyle` 给空串）——
 * 而 NodeView 建出来的**那一刻**，自己的 DOM 还没被 ProseMirror 插进文档
 * （`viewdesc.ts` 是先调 node view 工厂、后 insert）。不判这一下的话，
 * 深色文档里的第一笔会按"读不到 → 浅色"画，而且**不会自己纠正**
 * （主题没变，观察器不响）。
 */
function 读变量(元素: HTMLElement | null | undefined, 名: string): string {
  if (!元素 || !元素.isConnected) return "";
  return getComputedStyle(元素).getPropertyValue(名).trim();
}

/**
 * 读"这张纸是深色还是浅色"。
 *
 * ⚠️ **按正文纸面判，不按界面外壳判**。mermaid 的图是画在**文档**上的，
 * 底下那层底色归文档主题管（`--doc-bg`，文档主题会覆盖它，见 `doc-theme.ts`）。
 * 外壳是深色、文档是浅色（或者反过来）都是合法组合，拿 `data-ui-mode` 判会在
 * 那种组合上得到一张"深底黑字"的图。
 *
 * ⚠️ 两个元素都问一遍：先问**自己这棵树**（离节点最近），它没插进文档时再问
 * `view.dom`（正文那棵树的根，建视图时就已经在文档里了）。两者继承的是同一份
 * 变量（都在 `.editor-pane` 底下，分屏那两格也一样），所以谁答都一样。
 *
 * 取不到变量就按浅色处理：浅色是 mermaid 的默认主题，猜错的那一版至少是它
 * 自己设计的配色。
 */
function 读明暗(自己的根: HTMLElement, 视图根: HTMLElement | null | undefined): 明暗 {
  const 底色 =
    读变量(自己的根, "--doc-bg") ||
    读变量(视图根, "--doc-bg") ||
    读变量(自己的根, "--bg") ||
    读变量(视图根, "--bg");
  const 通道 = 归一颜色(底色);
  if (!通道) return "light";
  const [r, g, b] = 通道;
  // 感知亮度。纸面这两档离阈值都远（近黑 / 近白），阈值取哪儿都差不多。
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5 ? "dark" : "light";
}

/**
 * 主题变了要重画的通知。
 *
 * 图上那些颜色是 mermaid 在渲染时**烤进 SVG 里**的（内联样式 + SVG 自己那段
 * `<style>`），它不是"跟着 CSS 变量走"的——所以换主题（界面明暗、或文档主题）
 * 之后必须重画一次。这里挂一个**全局共用的** MutationObserver：
 *
 * - `<html>` 上的 `data-ui-mode` / `data-ui-style`：`applyTheme` 写的两条轴；
 * - `<head>` 里的子树：文档主题换的是 `#nota-doc-theme` 那个 `<style>` 的内容。
 *
 * 回调里只是**比一下明暗有没有变**，变了才真去重画；重画本身多半是缓存命中
 * （键里带明暗，另一档早就画过一次了），所以一次主题切换的代价是每块一次
 * `innerHTML`，不会重新去跑 mermaid。
 */
const 活动视图 = new Set<() => void>();
let 主题观察器: MutationObserver | null = null;

function 跟上主题(回调: () => void): void {
  活动视图.add(回调);
  if (主题观察器) return;

  主题观察器 = new MutationObserver(() => {
    for (const 回调 of 活动视图) 回调();
  });
  主题观察器.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-ui-mode", "data-ui-style"],
  });
  主题观察器.observe(document.head, { childList: true, subtree: true });
}

function 别再跟了(回调: () => void): void {
  活动视图.delete(回调);
  if (活动视图.size === 0) {
    主题观察器?.disconnect();
    主题观察器 = null;
  }
}

/**
 * 取节点里的源码。
 *
 * ⚠️ 真相在 `attrs.value` 里（plugin 的 `parseMarkdown` 写的就是它、
 * `toMarkdown` 读的也是它），**不在节点的子内容里**——这个节点是 `atom`，
 * 子内容一直是空的。
 */
function 取源码(node: PMNode): string {
  const 值: unknown = node.attrs.value;
  return typeof 值 === "string" ? 值 : "";
}

/**
 * 取节点的身份。
 *
 * ⚠️ 它是 plugin 在**建节点时**随机发的（`getId`：有 `identity` 就用它，没有就
 * `nanoid(8)`，字母表只有 `abcdefg`），**改源码不会换**——所以它是"这个块"
 * 的标识，不是"这份源码"的标识。缓存键用它，但**必须再比一遍源码**。
 */
function 取身份(node: PMNode): string {
  const 值: unknown = node.attrs.identity;
  return typeof 值 === "string" ? 值 : "";
}

export const diagramView = $view(
  // ⚠️ 要的是 `$NodeSchema` 上的 `.node`，不是 `$NodeSchema` 本身——
  // `$view` 收的是 `$Node | $Mark`（同 `code-block.ts` 那句注）。
  // 2026-10-04 起这颗 schema 是本仓自己的（`diagram-node.ts::图表规格`，
  // 第 27 项替掉了 `@milkdown/plugin-diagram`），形状与上游逐字段一致。
  图表规格.node,
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
      dom.className = "nota-diagram";
      dom.classList.add("md-diagram-panel");

      const body = document.createElement("div");
      body.className = "nota-diagram-body";

      const 源码框 = document.createElement("textarea");
      源码框.className = "nota-diagram-source";
      源码框.spellcheck = false;
      源码框.rows = 6;
      源码框.setAttribute("aria-label", t("Diagram Source (Mermaid)"));

      const 预览 = document.createElement("div");
      预览.className = "nota-diagram-preview";

      body.append(源码框, 预览);
      dom.append(body);

      // ── 这个视图的状态（都不进文档）──────────────────────────────────
      /**
       * 当前服务的节点。**必须是活的**——`initialNode` 是建视图时那一份，
       * 永远不变（`code-block.ts` 顶上那段踩过这个坑：拿旧节点读属性会读出
       * 老值，而症状只在那一个动作上发作）。
       */
      let 当前 = initialNode;
      /** 最近一次**由本视图**写进文档的源码，用来分清"这变化是我派的还是外面改的"。 */
      let 最后派发 = 取源码(initialNode);
      /** 屏幕上有没有画过东西。只用来决定"第一次渲染要不要先摆一句正在渲染"。 */
      let 画过 = false;
      /** `已画` 用的是哪一档明暗。主题一变就得重画。 */
      let 已画主题: 明暗 = "light";
      /** 代号：异步渲染回来时用它判"这份结果是不是已经过期了"。 */
      let 代号 = 0;
      /** 防抖计时器；`null` = 没有待派发的内容。 */
      let 防抖: number | null = null;
      // ── 画 ────────────────────────────────────────────────────────────

      /** 说明卡：标题 + 一段原文 + 可选一颗按钮。出错、空块、渲染中都用它。 */
      function 说明卡(标题: string, 正文: string, 按钮: string | null): HTMLElement {
        const 卡 = document.createElement("div");
        卡.className = "nota-diagram-note";

        const 题 = document.createElement("div");
        题.className = "nota-diagram-note-title";
        题.textContent = 标题;
        卡.append(题);

        // ⚠️ 是 `div` **不是 `pre`**：`editor.css` 里有一条
        // `.editor-mount .ProseMirror pre`（代码块那套：底色、描边、34px 的下内边距），
        // 用 `pre` 就得再写五六条去抵消它。换行/空白由 CSS 的 `white-space: pre-wrap`
        // 保——那正是这里要的全部。
        const 文 = document.createElement("div");
        文.className = "nota-diagram-note-detail";
        文.textContent = 正文;
        卡.append(文);

        if (按钮) {
          const 按 = document.createElement("button");
          按.type = "button";
          按.className = "nota-code-btn nota-diagram-note-btn";
          按.textContent = 按钮;
          按.addEventListener("mousedown", (e) => e.preventDefault());
          按.addEventListener("click", () => 源码框.focus());
          卡.append(按);
        }
        return 卡;
      }

      /**
       * 换掉预览区里画的东西。**只碰 `预览` 这一棵**，源码框一个字节都不动。
       *
       * ⚠️ `data-state` 的值是**英文**（CSS 要按它选）；卡里的字才是中文——
       * 这条分界与全仓一致。
       */
      function 画(结果: 渲染结果 | null): void {
        画过 = true;
        预览.replaceChildren();

        if (结果 === null) {
          预览.dataset.state = "empty";
          预览.append(
            说明卡(
              t("There is no diagram source here yet"),
              t("Write Mermaid in the code box above, for example:\ngraph TD; A[Start] --> B[End]"),
              null,
            ),
          );
          return;
        }

        if (结果.状态 === "错") {
          预览.dataset.state = "error";
          预览.append(
            说明卡(
              t("The diagram has a syntax error and cannot be drawn (your source is untouched in the document)."),
              结果.消息,
              null,
            ),
          );
          return;
        }

        预览.dataset.state = "ok";
        // mermaid 返回的这段 SVG 已经过 DOMPurify 洗过（它默认 `securityLevel:
        // "strict"`，那条路一定会走 `DOMPurify.sanitize`），所以这里可以直接
        // 用 `innerHTML`——这是 mermaid 官方文档给的用法。
        预览.innerHTML = 结果.图形;
        const 图 = 预览.querySelector("svg");
        if (图 instanceof SVGSVGElement) {
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
          const 自然宽 = 图.viewBox.baseVal.width;
          图.style.maxWidth = 自然宽 > 0 ? `min(100%, ${Math.ceil(自然宽)}px)` : "100%";
          图.style.height = "auto";
        }
      }

      /** 第一帧专用：还没画过任何东西时先摆一句，免得是个空盒子。 */
      function 画中(): void {
        预览.dataset.state = "loading";
        预览.replaceChildren(说明卡(t("Rendering the diagram…"), t("Mermaid is parsing this source."), null));
      }

      // ── 同步 ──────────────────────────────────────────────────────────

      /**
       * 让屏幕跟上节点：**源码 + 明暗**没变就不重渲染。
       */
      async function 同步(): Promise<void> {
        const 源码 = 取源码(当前);
        const 主题 = 读明暗(dom, view.dom);
        已画主题 = 主题;

        if (源码.trim() === "") {
          // 空源码不交给 mermaid（它会当解析失败报一句"没有识别出图表类型"，
          // 那是让用户对着一个还没写东西的块看错误提示）。
          代号++;
          画(null);
          return;
        }

        // ⚠️ 键里带明暗：同一份源码在深色/浅色下是**两张图**，不能互相顶。
        // ⚠️ `identity` 可能是空串（schema 的默认值）——那时这条键是共用的，
        // 但下面的源码比对会挡住错用，代价只是那种块之间会来回顶掉缓存。
        const 键 = `${取身份(当前)}|${主题}`;
        const 命中 = 查缓存(键, 源码);
        if (命中) {
          代号++;
          画(命中);
          return;
        }

        const 我的代号 = ++代号;
        // ⚠️ 已经画过就**留着上一版**：改一个字闪一下白是更糟的观感。
        if (!画过) 画中();

        const 结果 = await 渲染(源码, 主题);
        // 期间节点又变了（或者视图没了）→ 这份结果作废。
        if (我的代号 !== 代号) return;
        写缓存(键, 源码, 结果);
        已画主题 = 主题;
        画(结果);
      }

      /**
       * 把源码框里的内容写回节点。
       *
       * ⚠️ **只能走 `setNodeMarkup` 改 `attrs.value`**：那才是文档里的真相。
       * ⚠️ `identity` 要**原样带过去**（`{ ...节点.attrs }`），换了它缓存键就换了。
       */
      function 派发(新源码: string): void {
        const pos = getPos();
        if (typeof pos !== "number") return;

        const 节点 = view.state.doc.nodeAt(pos);
        if (!节点 || 节点.type.name !== 节点名) return;
        if (取源码(节点) === 新源码) return;

        最后派发 = 新源码;
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, { ...节点.attrs, value: 新源码 }),
        );
      }

      /** 有没派发完的就立刻派发（失焦、视图销毁时用）。 */
      function 先派发(): void {
        if (防抖 === null) return;
        window.clearTimeout(防抖);
        防抖 = null;
        派发(源码框.value);
      }

      // ── 事件 ──────────────────────────────────────────────────────────

      源码框.addEventListener("input", () => {
        if (防抖 !== null) window.clearTimeout(防抖);
        防抖 = window.setTimeout(() => {
          防抖 = null;
          派发(源码框.value);
        }, 防抖毫秒);
      });

      // 失焦就落盘：不然"改了源码直接去点别处"会丢掉最后那几个字。
      源码框.addEventListener("blur", 先派发);

      源码框.addEventListener("keydown", (e) => {
        // Escape 把焦点还给正文；源码框本身保持常驻。
        // ⚠️ **只认 Escape**：Enter 是换行——Mermaid 的源码几乎每行都靠换行分开，
        //    把 Enter 当"确认"会让这个框没法用。
        if (e.key !== "Escape") return;
        e.preventDefault();
        先派发();
        view.focus();
      });

      // ── 与 ProseMirror 的边界 ─────────────────────────────────────────

      /**
       * 判据是「这颗元素是不是我的挂件」。
       *
       * ⚠️ **不含预览区本身**（只含它里面的按钮）：点图上任何地方都该让
       * ProseMirror 去处理——它会把这个原子节点整块选中，用户才能接着
       * 删除 / 复制 / 剪切。把整块预览都算成挂件的话，点图就成了"什么都没发生"。
       */
      const 是我的挂件 = (目标: EventTarget | null): boolean =>
        目标 instanceof Element && (源码框 === 目标 || 目标.closest("button") !== null);

      // ── 主题 ──────────────────────────────────────────────────────────

      const 跟主题 = (): void => {
        if (读明暗(dom, view.dom) !== 已画主题) void 同步();
      };
      跟上主题(跟主题);

      /** 只读实例只保留渲染结果，源码框由 CSS 隐藏。 */
      function 同步可编辑(): void {
        dom.classList.toggle("nota-diagram-readonly", !view.editable);
      }

      同步可编辑();
      void 同步();

      return {
        dom,

        update: (更新后: PMNode): boolean => {
          // 节点类型变了（这段内容被转成了别的东西）→ 这个视图不该再用。
          if (更新后.type !== initialNode.type) return false;

          const 新源码 = 取源码(更新后);
          // ⚠️ 这条判据是"**外面**改的"：撤销、源码框里手改文档、插件改文档、
          //    整个文档被换掉……都会走到这儿。只认这一类，因为本视图自己派的那次
          //    不能再写回源码框——每敲一个字就把光标拽回开头，那个框没法用。
          const 外面改的 = 新源码 !== 最后派发;
          当前 = 更新后;

          if (外面改的) {
            最后派发 = 新源码;
            if (源码框.value !== 新源码) 源码框.value = 新源码;
          }

          同步可编辑();
          // 源码没变时 `同步` 是一次 Map 查表就返回，不必在这儿先比一遍。
          void 同步();
          return true;
        },

        // 这一条和底下那条是**两件事**（同 `code-block.ts`）：`stopEvent` 管一进来
        // 就拦下；`ignoreMutation` 管已经发生的 DOM 变更要不要告诉 ProseMirror。
        stopEvent: (e) => 是我的挂件(e.target),

        // ⚠️ 恒为 `true`：这棵树整个由本视图管，没有任何一处是 ProseMirror 该读的
        // （这个节点没有 contentDOM，源码在 attrs 里）。返回 false 的话，
        // 「画完一张图」这件事本身会被当成"用户在编辑区里改了东西"，PM 接着去
        // 重解析这段 DOM——而它认得的 `div[data-type]` 一个都没有，结果是节点被
        // 判成脏的、光标乱飞。
        ignoreMutation: () => true,

        destroy: () => {
          // 在飞的渲染结果作废（它回来时视图已经没了）。
          代号++;
          // 只在**真有待派发的内容**时补一次：销毁常常发生在整篇文档被换掉
          // （`replaceAll`）的过程中，那时去派事务是没必要的风险。
          先派发();
          别再跟了(跟主题);
        },
      };
    },
);
