/**
 * Mermaid 渲染、主题读取与结果缓存。
 *
 * NodeView 只负责 DOM、输入和文档同步；昂贵的渲染链留在本模块，便于按职责维护。
 */

/** 缓存条数上限。超过就丢最老那条（LRU，见 `写缓存`）。 */
const bufferSaveLimit = 50;

/** 明暗。**按正文纸面判**，不按界面判（理由见 `读明暗`）。 */
type mode = "light" | "dark";

export interface ImageTableTheme {
  mode: mode;
  accent: string;
  /** 缓存键与“主题变没变”判据共用的一份稳定指纹。 */
  key: string;
}

/**
 * 一档渲染结果。**失败也是一种结果**，一样进缓存。
 */
export type RenderResult =
  | { state: "ok"; imageShape: string }
  | { state: "错"; clearMessage: string };

interface BufferSaveItem {
  /** 这份结果是哪份源码画的。identity 不变而源码变过时，靠它判不能复用。 */
  source2: string;
  result2: RenderResult;
}

/** `identity|明暗` → 上次画出来的东西。 */
const bufferSave = new Map<string, BufferSaveItem>();

export function checkBufferSave(key: string, source2: string): RenderResult | null {
  const match = bufferSave.get(key);
  if (!match || match.source2 !== source2) return null;
  // 命中就挪到队尾（Map 的插入序就是这里的 LRU 序）。
  bufferSave.delete(key);
  bufferSave.set(key, match);
  return match.result2;
}

export function writeBufferSave(key: string, source2: string, result2: RenderResult): void {
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
export async function render(source2: string, theme: ImageTableTheme): Promise<RenderResult> {
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
           }
           .mindmap-node text,
           .mindmap-node tspan {
             text-anchor: middle !important;
             dominant-baseline: middle;
           }
           .mindmap-node foreignObject > div,
           .mindmap-node .nodeLabel,
           .mindmap-node .labelBkg {
             text-align: center !important;
             justify-content: center !important;
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
export function readDiagramTheme(selfSelfOfRoot: HTMLElement, viewRoot: HTMLElement): ImageTableTheme {
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

export function followAboveTheme(returnConfigure: () => void): void {
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

export function distinguishAgainFollowDone(returnConfigure: () => void): void {
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
