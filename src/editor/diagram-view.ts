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
import {
  createCodeBlockEditor,
  type codeBlockEditor,
} from "@/editor/code-block-cm";

import { imageTableSpec } from "@/editor/diagram-node";

/** 节点名。与 plugin 里 `const id = "diagram"` 一致，判类型时要用。 */
const nodeName = "diagram";

/** 源码框改完多久写回文档。太短会在每个字上一笔事务，太长会觉得"没保存"。 */
const guardDebounceMilliSeconds = 250;

/** 缓存条数上限。超过就丢最老那条（LRU，见 `写缓存`）。 */
const bufferSaveLimit = 50;

/** 明暗。**按正文纸面判**，不按界面判（理由见 `读明暗`）。 */
type mode = "light" | "dark";

interface ImageTableTheme {
  mode: mode;
  accent: string;
  /** 缓存键与“主题变没变”判据共用的一份稳定指纹。 */
  key: string;
}

/**
 * 一档渲染结果。**失败也是一种结果**，一样进缓存。
 */
type RenderResult =
  | { state: "ok"; imageShape: string }
  | { state: "错"; clearMessage: string };

interface BufferSaveItem {
  /** 这份结果是哪份源码画的。identity 不变而源码变过时，靠它判不能复用。 */
  source2: string;
  result2: RenderResult;
}

/** `identity|明暗` → 上次画出来的东西。 */
const bufferSave = new Map<string, BufferSaveItem>();

function checkBufferSave(key: string, source2: string): RenderResult | null {
  const match = bufferSave.get(key);
  if (!match || match.source2 !== source2) return null;
  // 命中就挪到队尾（Map 的插入序就是这里的 LRU 序）。
  bufferSave.delete(key);
  bufferSave.set(key, match);
  return match.result2;
}

function writeBufferSave(key: string, source2: string, result2: RenderResult): void {
  bufferSave.delete(key);
  bufferSave.set(key, { source2, result2 });
  while (bufferSave.size > bufferSaveLimit) {
    const mostOld = bufferSave.keys().next();
    if (mostOld.done) break;
    bufferSave.delete(mostOld.value);
  }
}

/** mermaid 每次渲染要一个**独一无二**的 id（它的内部 CSS 就是按这个 id 限域的）。 */
let renderIndex = 0;

/** 渲染的串行链。理由见 `渲染`。 */
let renderChain: Promise<unknown> = Promise.resolve();

function arrangeQueue<T>(taskTask: () => Promise<T>): Promise<T> {
  // 前一个任务失败也要接着跑下一个，所以两个分支都给同一个 `任务`。
  const result2 = renderChain.then(taskTask, taskTask);
  renderChain = result2.then(
    () => undefined,
    () => undefined,
  );
  return result2;
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
async function render(source2: string, theme: ImageTableTheme): Promise<RenderResult> {
  return arrangeQueue(async () => {
    const mermaid = (await import("mermaid")).default;
    const mindmap = imageTableType(source2) === "mindmap";

    // `startOnLoad` 这里重申一遍：`initialize` 是"整个配置表覆盖一次"，
    // 少给一条就落回默认值（默认 `true` 会让 mermaid 自己去扫页面上的
    // `.mermaid` 节点，那是另一条我们不要的路）。
    mermaid.initialize({
      startOnLoad: false,
      theme: mindmap ? "base" : theme.mode === "dark" ? "dark" : "default",
      themeVariables: mindmap ? thinkDimensionGuideImageConfigureColor(theme.mode, theme.accent) : undefined,
      // Mermaid 10 的 mindmap 把连线颜色绑到节点填充色（`cScale*`）；浅色纸面上
      // 那些粉彩色块接近白色，连线随之“消失”。mindmap 的源码样式后面再补一条
      // 高对比连线的 CSS，节点仍保留柔和的邻近色。
      themeCSS: mindmap
        ? `.mindmap-edges path, .mindmap-edges .edge {
             stroke: ${theme.mode === "dark" ? "#9dadbf" : "#60768c"} !important;
             stroke-width: 3px !important;
           }`
        : undefined,
    });

    const editNumber = `nota-mermaid-${++renderIndex}`;
    try {
      // ⚠️ 不传第三个参数（容器）：给了容器它会直接改我们传进去的元素，
      // 我们要的是拿到字符串自己插——插哪儿、什么时候插由本文件说了算。
      const { svg } = await mermaid.render(editNumber, source2);
      return { state: "ok", imageShape: svg };
    } catch (e) {
      clearRemoveRemnantKeep(editNumber);
      return { state: "错", clearMessage: raiseGetClearMessage(e) };
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
function clearRemoveRemnantKeep(editNumber: string): void {
  // 非 sandbox（默认 `securityLevel: "strict"`）挂的是 `d<id>`；sandbox 档是
  // iframe `i<id>`。全试一遍，没有就算了。
  for (const id of [`d${editNumber}`, `i${editNumber}`, editNumber]) {
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
function raiseGetClearMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;

  const shapeLikeError = e as { message?: unknown; str?: unknown } | null;
  if (shapeLikeError) {
    if (typeof shapeLikeError.message === "string" && shapeLikeError.message) return shapeLikeError.message;
    if (typeof shapeLikeError.str === "string" && shapeLikeError.str) return shapeLikeError.str;
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
function normalizeColor(value2: string): [number, number, number] | null {
  if (!value2) return null;
  const aboveBelowText = document.createElement("canvas").getContext("2d");
  if (!aboveBelowText) return null;

  // 先填一个哨兵：**无效的颜色值不会改变 `fillStyle`**，读回来还是哨兵，
  // 于是"认不出来"这件事是判得出来的（换成先设 `#000` 就不行——黑色是合法值）。
  aboveBelowText.fillStyle = "#010203";
  aboveBelowText.fillStyle = value2;
  const normalize = aboveBelowText.fillStyle;
  if (normalize === "#010203") return null;

  // 归一之后只可能是 `#rrggbb` 或 `rgba(r, g, b, a)` 两种写法。
  const tenSix = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(normalize);
  if (tenSix) {
    const [, r, g, b] = tenSix;
    if (r && g && b) {
      return [parseInt(r, 16) / 255, parseInt(g, 16) / 255, parseInt(b, 16) / 255];
    }
  }
  const functionNumberStyle = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(normalize);
  if (functionNumberStyle) {
    const [, r, g, b] = functionNumberStyle;
    if (r && g && b) {
      return [Number(r) / 255, Number(g) / 255, Number(b) / 255];
    }
  }
  return null;
}

function twoDigits(value2: number): string {
  return Math.round(Math.min(1, Math.max(0, value2)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function colorHex(throughWay: [number, number, number]): string {
  const [r, g, b] = throughWay;
  return `#${twoDigits(r)}${twoDigits(g)}${twoDigits(b)}`;
}

function colorToHsl(throughWay: [number, number, number]): { h: number; s: number; l: number } {
  const [r, g, b] = throughWay;
  const large = Math.max(r, g, b);
  const small = Math.min(r, g, b);
  const difference = large - small;
  const l = (large + small) / 2;
  if (difference === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? difference / (2 - large - small) : difference / (large + small);
  let h: number;
  if (large === r) h = (g - b) / difference + (g < b ? 6 : 0);
  else if (large === g) h = (b - r) / difference + 2;
  else h = (r - g) / difference + 4;
  return { h: h * 60, s, l };
}

function hslColor(h: number, s: number, l: number): string {
  const hue = (((h % 360) + 360) % 360) / 360;
  const saturation = Math.max(0, Math.min(1, s));
  const lightness = Math.max(0, Math.min(1, l));
  if (saturation === 0) return colorHex([lightness, lightness, lightness]);
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const shareMeasure = (offset: number): number => {
    let t = hue + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return colorHex([shareMeasure(1 / 3), shareMeasure(0), shareMeasure(-1 / 3)]);
}

/**
 * 认图表类型。跳过空行、Mermaid 注释和 `---` 配置块，只看第一条真正的指令。
 * 只用于决定“思维导图要不要改配色”，认不出来时按普通图表处理。
 */
function imageTableType(source2: string): string {
  let configurePlaceBlock = false;
  for (const originalLine of source2.split(/\r?\n/)) {
    const line3 = originalLine.trim();
    if (!line3 || line3.startsWith("%%")) continue;
    if (line3 === "---") {
      configurePlaceBlock = !configurePlaceBlock;
      continue;
    }
    if (configurePlaceBlock) continue;
    return line3.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  }
  return "";
}

/**
 * 思维导图的色彩：从当前强调色取色相，只在中邻近的色相里铺开。
 *
 * Mermaid 自带的 `default` 主题会在分支级上按 30° 一路跳到红、绿、紫，
 * 一张图会同时出现好几种互不相干的主色。这里改成围绕主题色做一组低饱和的
 * 邻近色：根部保持主题色，一级分支向外做小幅色相偏移。具体亮度按文档纸面
 * 分两套，浅色是柔和粉彩，深色是压暗的色块；文字分别用深色和浅色。
 *
 * ⚠️ Mermaid 在 `base` 主题里会再次把 `cScale*` 调暗（浅色 -25、深色 -75
 * 个亮度点），所以这里的输入亮度要先把这一步补回去；否则深色模式会得到
 * 近黑色块。`darkMode` 也必须显式传进去，不能只靠 `theme: "base"` 猜——否则
 * Mermaid 会按浅色公式处理深色纸面。这个补偿只影响最终颜色，不改变源码。
 */
function thinkDimensionGuideImageConfigureColor(mode: mode, accent: string): Record<string, string | boolean> {
  const throughWay = normalizeColor(accent) ?? [0.208, 0.518, 0.894];
  const { h, s } = colorToHsl(throughWay);
  const saturation = Math.min(0.42, Math.max(0.2, s * 0.72 + 0.08));
  const dark = mode === "dark";
  const branchHue = [-32, 0, 26, -54, 48, 72, -74, 14, 38, -44, 58, -16];
  const lightLuminance = [0.76, 0.81, 0.78, 0.84, 0.79, 0.82, 0.77, 0.83, 0.8, 0.75, 0.82, 0.78];
  const darkLuminance = [0.23, 0.27, 0.2, 0.29, 0.25, 0.22, 0.31, 0.24, 0.28, 0.19, 0.26, 0.21];
  const text3 = dark ? "#f4f2ee" : "#202124";
  const border = dark ? "#718094" : "#9aa9b8";
  const rootBottom = hslColor(h, Math.min(0.48, saturation + 0.08), dark ? 0.38 : 0.68);
  const rootCharacter = text3;
  const paper = dark ? "#202327" : "#ffffff";
  const surface = dark ? "#292e34" : "#f5f7f9";
  const changeMeasure: Record<string, string | boolean> = {
    darkMode: dark,
    fontFamily: "var(--font-ui), sans-serif",
    fontSize: "14px",
    background: "transparent",
    primaryColor: rootBottom,
    primaryTextColor: text3,
    primaryBorderColor: border,
    mainBkg: surface,
    nodeBkg: surface,
    nodeBorder: border,
    nodeTextColor: text3,
    lineColor: dark ? "#9dadbf" : "#60768c",
    defaultLinkColor: dark ? "#9dadbf" : "#60768c",
    edgeLabelBackground: paper,
    clusterBkg: surface,
    clusterBorder: border,
    titleColor: text3,
    secondaryColor: hslColor(h + 24, saturation, dark ? 0.22 : 0.8),
    secondaryTextColor: text3,
    secondaryBorderColor: border,
    tertiaryColor: hslColor(h - 28, saturation, dark ? 0.26 : 0.8),
    tertiaryTextColor: text3,
    tertiaryBorderColor: border,
    noteBkgColor: dark ? "#393b2c" : "#fff7c9",
    noteTextColor: dark ? "#f7f1c7" : "#3d3420",
    noteBorderColor: dark ? "#77734d" : "#d8ca82",
    textColor: text3,
    labelTextColor: text3,
    scaleLabelColor: text3,
    git0: rootBottom,
    gitBranchLabel0: rootCharacter,
    git1: hslColor(h + 24, saturation, dark ? 0.64 : 0.7),
    git2: hslColor(h - 28, saturation, dark ? 0.56 : 0.74),
  };

  for (let i = 0; i < branchHue.length; i += 1) {
    const hue = h + (branchHue[i] ?? 0);
    const targetLightness = (dark ? darkLuminance : lightLuminance)[i] ?? (dark ? 0.24 : 0.8);
    const inputLightness = dark ? targetLightness + 0.75 : targetLightness + 0.25;
    changeMeasure[`cScale${i}`] = hslColor(hue, saturation, inputLightness);
    changeMeasure[`cScaleInv${i}`] = hslColor(hue, Math.min(0.48, saturation + 0.08), dark ? 0.72 : 0.34);
    changeMeasure[`cScaleLabel${i}`] = text3;
  }
  return changeMeasure;
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
function readChangeMeasure(element: HTMLElement | null | undefined, name3: string): string {
  if (!element || !element.isConnected) return "";
  return getComputedStyle(element).getPropertyValue(name3).trim();
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
function readMode(selfSelfOfRoot: HTMLElement, viewRoot: HTMLElement | null | undefined): mode {
  const bottomColor =
    readChangeMeasure(selfSelfOfRoot, "--doc-bg") ||
    readChangeMeasure(viewRoot, "--doc-bg") ||
    readChangeMeasure(selfSelfOfRoot, "--bg") ||
    readChangeMeasure(viewRoot, "--bg");
  const throughWay = normalizeColor(bottomColor);
  if (!throughWay) return "light";
  const [r, g, b] = throughWay;
  // 感知亮度。纸面这两档离阈值都远（近黑 / 近白），阈值取哪儿都差不多。
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5 ? "dark" : "light";
}

/**
 * 图表重画要跟着两件事走：纸面明暗与主题色。只跟明暗的话，换一个同明暗的
 * 界面主题后，思维导图仍会停在旧强调色上。
 */
function readDiagramTheme(selfSelfOfRoot: HTMLElement, viewRoot: HTMLElement): ImageTableTheme {
  const mode = readMode(selfSelfOfRoot, viewRoot);
  const strongConfigure =
    normalizeColor(readChangeMeasure(selfSelfOfRoot, "--accent")) ??
    normalizeColor(readChangeMeasure(viewRoot, "--accent")) ??
    ([0.208, 0.518, 0.894] as [number, number, number]);
  const accent = colorHex(strongConfigure);
  return { mode, accent, key: `${mode}|${accent}` };
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
const activityView = new Set<() => void>();
let themeObserver: MutationObserver | null = null;

function followAboveTheme(returnConfigure: () => void): void {
  activityView.add(returnConfigure);
  if (themeObserver) return;

  themeObserver = new MutationObserver(() => {
    for (const returnConfigure of activityView) returnConfigure();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-ui-mode", "data-ui-style", "style"],
  });
  themeObserver.observe(document.head, { childList: true, subtree: true });
}

function distinguishAgainFollowDone(returnConfigure: () => void): void {
  activityView.delete(returnConfigure);
  if (activityView.size === 0) {
    themeObserver?.disconnect();
    themeObserver = null;
  }
}

/**
 * 取节点里的源码。
 *
 * ⚠️ 真相在 `attrs.value` 里（plugin 的 `parseMarkdown` 写的就是它、
 * `toMarkdown` 读的也是它），**不在节点的子内容里**——这个节点是 `atom`，
 * 子内容一直是空的。
 */
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
      dom.className = "nota-diagram";
      dom.classList.add("md-diagram-panel");

      const body = document.createElement("div");
      body.className = "nota-diagram-body";

      const sourceShell = document.createElement("div");
      sourceShell.className = "nota-diagram-source-shell";

      const sourceBox = document.createElement("div");
      sourceBox.className = "nota-diagram-source nota-diagram-cm";

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
      // ── 画 ────────────────────────────────────────────────────────────

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
          press.addEventListener("click", () => codeEditor?.clusterFocus() ?? view.focus());
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
        dispatch(codeEditor?.getText() ?? "");
      }

      // ── CodeMirror：Mermaid 源码的输入面 ─────────────────────────────
      // 节点正文始终在 PM 的 `attrs.value` 里；CM 只负责输入、选区、配对、
      // Tab 缩进与剪贴板。粘贴事件必须落在 CM 自己的 DOM 上，不能再交给
      // 外层 ProseMirror，否则会变成"源码框空着、正文多出一段粘贴内容"。
      codeEditor = createCodeBlockEditor({
        initialStartText: readSource(initialNode),
        initialStartLanguage: "mermaid",
        textChangeConvert: (newText) => {
          if (guardDebounce !== null) window.clearTimeout(guardDebounce);
          guardDebounce = window.setTimeout(() => {
            guardDebounce = null;
            dispatch(newText);
          }, guardDebounceMilliSeconds);
        },
        clusterFocus: () => {
          // CM 自己持有选区；PM 这一层只保留节点本身。
        },
        loseFocus: firstDispatch,
        undoCancel: () => undo(view.state, view.dispatch, view),
        heavyDo: () => redo(view.state, view.dispatch, view),
        openHeadBackCell: () => view.focus(),
      });
      sourceBox.append(codeEditor.view.dom);
      codeEditor.view.contentDOM.setAttribute("aria-label", t("Diagram Source (Mermaid)"));
      codeEditor.view.dom.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        firstDispatch();
        view.focus();
      });

      // ── 事件 ──────────────────────────────────────────────────────────

      for (const PressButton of [collapse2, copy]) {
        PressButton.addEventListener("mousedown", (e) => e.preventDefault());
      }

      collapse2.addEventListener("click", () => {
        const collapsed = sourceShell.classList.toggle("is-collapsed");
        collapse2.textContent = collapsed ? t("Expand") : t("Collapse");
        collapse2.title = collapsed ? t("Expand this diagram source") : t("Collapse this diagram source");
      });

      copy.addEventListener("click", () => {
        void writeClipboard(codeEditor?.getText() ?? readSource(current)).then((ok) => {
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
        if (readDiagramTheme(dom, view.dom).key !== renderedTheme) void sameStep();
      };
      followAboveTheme(followTheme);

      /** 只读实例只保留渲染结果，源码框由 CSS 隐藏。 */
      function sameStepEditable(): void {
        dom.classList.toggle("nota-diagram-readonly", !view.editable);
      }

      sameStepEditable();
      void sameStep();

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
          }

          sameStepEditable();
          // 源码没变时 `同步` 是一次 Map 查表就返回，不必在这儿先比一遍。
          void sameStep();
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
