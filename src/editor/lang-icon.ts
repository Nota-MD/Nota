/**
 * 编程语言的图标：给一个语言名，返回一颗小图标元素。
 *
 * # 两种长相，一个入口
 *
 * | | 覆盖 | 长什么样 | 在哪儿 |
 * |---|---|---|---|
 * | **真图** | 93 个语言（热门那些） | 彩色 logo，vscode-icons 搬来的 | `lang-icons-real.ts` |
 * | **兜底徽章** | **全部** 400 个语言 id | 圆角小方块 + 字母缩写 + 代表色 | 本文件 |
 *
 * 调用方（`lang-picker.ts`）只知道一个 `languageIcon(lang)`——**先问真图、
 * 问不到才回落**这件事就收在这一个函数里。用户 2026-09-26 要的就是这个：
 * 「代码框语言图标只支持热门语言即可。但是要画真图标。」
 *
 * # 为什么真图盖不全，而这不是缺点
 *
 * 语言有 400 个（`refractor.listLanguages()`），**任何图标集都覆盖不全**
 * （vscode-icons 一共 1208 颗文件图标，分给语言的也就百来颗）。所以
 * "没图标时怎么办"不是边角情况，是主路径之一——它得有个正经的兜底。
 *
 * # 兜底长什么样：首字母徽章 ＋ 该语言的代表色
 *
 * 一个圆角小方块，里面是语言的字母缩写（`rust` → `R`、`csharp` → `C#`），
 * 底色用该语言约定俗成的那个颜色（`rust` 的橙、`python` 的蓝……）。
 * ⚠️ **这不是"退而求其次"**：它是**唯一能自动覆盖全部 400 个语言**的方案，
 * 而且它只用了字母和颜色——**不含任何厂商商标图形**，所以那一堆语言里
 * 同样没有"用了谁的 logo"的问题。
 *
 * ⚠️ 颜色表要克制：只给**真正有约定色**的语言写死。查不到的一律走中性灰，
 * 别自己编一个颜色——编出来的颜色会让"这颗徽章是哪个语言"变得更难认，
 * 那还不如全用灰的。
 *
 * ⚠️ 两套长相**别互相渗透**：真图那边是**彩色**的、不跟主题变，所以走
 * `background-image`；徽章这边是自绘的色块字，走 `background-color` + 文字。
 * 想给真图刷成单色（`mask-image` 那套，`src/assets/icons/` 的界面图标是那么做的）
 * 的话，会把 93 颗彩色 logo 全变成一片纯色——那是把"真图标"这件事取消掉。
 */

import { iconName, assertValueIconURI } from "./lang-icons-real";

/** 不指定语言（`NO_LANGUAGE`，与 `code-block.ts` 同一个值）。 */
const NO_LANGUAGE = "";

/**
 * 语言的字母缩写。只给**缩写比首字母更清楚**的那些写死，其余取首字母大写。
 *
 * ⚠️ 判据是"看不看得出来"，不是"够不够短"：`python` → `P` 和 `perl` → `P`
 * 会撞成一样，所以这两个都得给两字母。反过来 `rust` → `R` 没人会认错，就别写。
 */
const shrinkWriteTable: Record<string, string> = {
  python: "Py",
  perl: "Pl",
  php: "Ph",
  javascript: "JS",
  typescript: "TS",
  jsx: "JSX",
  tsx: "TSX",
  csharp: "C#",
  fsharp: "F#",
  cpp: "C+",
  objectivec: "OC",
  coffeescript: "CS",
  visualbasic: "VB",
  vbnet: "VB",
  powershell: "PS",
  postscript: "PS",
  graphql: "GQ",
  markdown: "MD",
  makefile: "MK",
  cmake: "CM",
  docker: "DK",
  dockerfile: "DK",
  nginx: "NG",
  apacheconf: "AC",
  protobuf: "PB",
  sql: "SQ",
  plsql: "SQ",
  scala: "Sc",
  scheme: "Sm",
  smalltalk: "ST",
  solidity: "So",
  haskell: "Hs",
  clojure: "Cl",
  elixir: "Ex",
  erlang: "Er",
  kotlin: "Kt",
  groovy: "Gr",
  julia: "Jl",
  matlab: "ML",
  latex: "Tx",
  tex: "Tx",
  r: "R",
};

/**
 * 语言的代表色（十六进制，不带 `#` 的不要写）。
 *
 * ⚠️ 这些是**颜色**，不是图形——色值本身不构成商标。但**别把它们当成
 * "官方色"去宣传**：表里的是"社区里大家认的那个色"，够用即可。
 */
const colorTable: Record<string, string> = {
  rust: "#CE422B",
  python: "#3776AB",
  javascript: "#F7DF1E",
  typescript: "#3178C6",
  jsx: "#61DAFB",
  tsx: "#3178C6",
  go: "#00ADD8",
  ruby: "#CC342D",
  java: "#E76F00",
  c: "#5C6BC0",
  cpp: "#00599C",
  csharp: "#68217A",
  fsharp: "#378BBA",
  php: "#777BB4",
  swift: "#FA7343",
  kotlin: "#7F52FF",
  scala: "#DC322F",
  haskell: "#5D4F85",
  lua: "#2C2D72",
  perl: "#39457E",
  r: "#276DC3",
  dart: "#0175C2",
  elixir: "#6E4A7E",
  erlang: "#A90533",
  clojure: "#5881D8",
  julia: "#9558B2",
  matlab: "#E16737",
  sql: "#E38C00",
  plsql: "#E38C00",
  bash: "#4EAA25",
  shell: "#4EAA25",
  sh: "#4EAA25",
  powershell: "#5391FE",
  yaml: "#CB171E",
  markdown: "#083FA1",
  css: "#663399",
  markup: "#E34F26",
  xml: "#005FAD",
  json: "#8A8A8A",
  docker: "#2496ED",
  dockerfile: "#2496ED",
  makefile: "#427819",
  cmake: "#064F8C",
  vim: "#019833",
  latex: "#008080",
  tex: "#008080",
  graphql: "#E10098",
  fortran: "#734F96",
  cobol: "#005CA9",
  nim: "#C8A200",
  zig: "#F7A41D",
  ocaml: "#EC6813",
  elm: "#60B5CC",
  crystal: "#333333",
  lisp: "#3FB68B",
  scheme: "#3FB68B",
  prolog: "#74283C",
  ada: "#02A95C",
  solidity: "#5C5C5C",
  toml: "#9C4121",
  sass: "#CC6699",
  scss: "#CC6699",
  less: "#1D365D",
  git: "#F05032",
  nginx: "#009639",
  protobuf: "#4285F4",
  awk: "#8B0000",
  groovy: "#4298B8",
  smalltalk: "#5C6BC0",
  vhdl: "#543978",
  verilog: "#B2A100",
  wasm: "#654FF0",
  ini: "#8A8A8A",
  diff: "#8A8A8A",
  http: "#8A8A8A",
  regex: "#8A8A8A",
  bnf: "#8A8A8A",
};

/**
 * 查不到代表色时用的中性灰。
 *
 * ⚠️ 它是一个**写死的色值**，不跟任何主题变——这是有意的：徽章的底色说的是
 * "这是哪个语言"，跟"现在用的是浅色还是深色文档主题"无关。同一个语言在哪个
 * 主题下都该是同一个颜色，用户才认得住。
 */
const middlePropertyColor = "#8A8A8A";

/** 底色偏亮时，压在上面的字用这个深色；偏暗时用白色。 */
const brightBottomAboveOfCharacter = "#1A1A1A";
const darkBottomAboveOfCharacter = "#FFFFFF";

/**
 * 给一个底色，算压在上面的字该用黑还是白。
 *
 * ⚠️ **不能写死白色**：色表里有一批很亮的（JavaScript 的黄 `#F7DF1E`、
 * nim 的 `#C8A200`、verilog 的 `#B2A100`），白字压上去基本看不见。
 *
 * 用的是 YIQ 那条老公式（`299/587/114`）：人眼对绿最敏感、对蓝最不敏感，
 * 这三个系数就是这件事的线性近似。⚠️ 它比 sRGB 相对亮度那套**粗糙**，
 * 但用来在两种颜色里二选一**够用**——这里要的只是"别看不见"，
 * 不是精确的对比度数值（真要那个得解 WCAG 的公式，为这点收益不值得）。
 */
function correctCompareColor(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? brightBottomAboveOfCharacter : darkBottomAboveOfCharacter;
}

/** 取一个语言的缩写。没写死的走首字母大写；空语言给一个通用的破折号。 */
function shrinkWrite(lang: string): string {
  if (lang === NO_LANGUAGE) return "—";
  const writeDead = shrinkWriteTable[lang];
  if (writeDead) return writeDead;
  return lang.charAt(0).toUpperCase();
}

/**
 * 造一颗图标：**先真图、后徽章**。
 *
 * ⚠️ 返回的是一颗**新的**元素，调用方随便改它的尺寸（CSS 管），
 * 但**别改它的文字**——那会绕开这里的规则，缩写的规则要只有一处。
 *
 * ⚠️ 两条路的 class **不一样**（真图多一个 `--logo`），因为两条路的
 * `background-*` 是互相矛盾的两套：`.nota-lang-icon` 那条是"底色 + 字"，
 * `.nota-lang-icon--logo` 那条是"透明底 + 一张图"。⚠️ **别把两条规则合到
 * 一条选择器里**（`src/styles/math.css` 有一段教训注释，讲的就是"同一批属性
 * 由两条互不知情的规则共同决定"会出什么事）。
 */
export function languageIcon(lang: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "nota-lang-icon";
  // 图标本身没有语义（语言名就写在旁边），别让读屏器把它念一遍。
  el.setAttribute("aria-hidden", "true");

  const image = assertValueIconURI(lang);
  if (image !== null) {
    el.classList.add("nota-lang-icon--logo");
    el.style.backgroundImage = image;
    // ⚠️ 真图那条路**不留文字**（`textContent` 一个字符都没有）：留着的话
    //    徽章的缩写会压在图上面，而 `--logo` 那条已经把底色改成透明——
    //    于是"图 + 一个孤零零的字母"叠在一起，只在真图的语言上看得到。
    return el;
  }

  el.textContent = shrinkWrite(lang);
  const color = colorTable[lang] ?? middlePropertyColor;
  // ⚠️ 底色和字色**一起给**（都是内联的 CSS 变量，样式全在
  // `editor.css` 的 `.nota-lang-icon` 里）。分两处算的话，将来加一个语言
  // 忘了补对比色，那颗徽章就是"浅色底 + 白字"——而且只在那一个语言上出错，
  // 极难被发现。
  el.style.setProperty("--nota-lang-color", color);
  el.style.setProperty("--nota-lang-on", correctCompareColor(color));
  return el;
}

/**
 * 有没有这个语言的**专属真图标**（没有就是走徽章）。
 *
 * ⚠️ 返回 `false` 不代表"没有图标"——徽章人人都有（见文件头那张表）。
 * 这个函数是给"要不要在这里放图"这类判断用的（今天 `lang-picker.ts` 没用到它，
 * 它自己会问 `languageIcon`；留着是因为文件头把"两套长相的判据"当成这个文件的
 * 一部分责任）。⚠️ 判据是**真图标表**，不是色表——色表管的是徽章的底色，
 * 两个问题没关系。
 */
export function hasDedicatedBelongIcon(lang: string): boolean {
  return iconName(lang) !== null;
}
