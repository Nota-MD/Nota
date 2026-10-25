/**
 * **粘进来的 HTML 先洗一遍**，再交给 ProseMirror 解析。
 *
 * # 为什么非洗不可
 *
 * 从 Word / Google Docs / 网页上复制一段，剪贴板里那份 `text/html` 长这样：
 * 每个 ` <span>` 上挂着 `font-family` / `mso-bidi-font-size` / `mso-list:l0 level1`，
 * 外面套着 `<div class=WordSection1>`、`<o:p></o:p>`、`<w:ProofErr>`，
 * 中间夹着 `<!--[if !supportLists]-->` 这种只在 Word 里成立的条件注释。
 *
 * ⚠️ ProseMirror 的 `DOMParser` **会**把它们收下——它按 schema 过滤标签，
 * 但**属性**是另一回事：`<p>` 上的 `class` 与 `style` 会原样进 `attrs`，
 * 有些还会被序列化器写回 Markdown（本仓的序列化口径是"不认识的属性丢掉"，
 * 所以真正掉的是**结构**：`<span style="font-weight:700">` 里的加粗**整个丢掉**，
 * 因为 schema 里没有哪个 mark 认 `style`）。
 *
 * 所以这一层的活是**两件**：把没用的扔掉（垃圾标签、垃圾属性），
 * 把有用的**换成 schema 认的写法**（`font-weight:700` → `<strong>`）。
 *
 * # 为什么不用 `DOMParser` 洗，而是自己扫标签
 *
 * ⚠️ **因为测试要在 node 里跑**。`tests/fake-dom.ts` 是本仓自己写的一个极小
 * 替身（只够 `ui/` 那几个 hook 用），里面**没有 `DOMParser`、没有 `template`**；
 * 真拿 DOM 洗的话，这一层的判据（洗掉什么、留下什么、语言线索从哪来）就
 * 一条都测不到——而那正是最容易悄悄坏掉的部分。自己扫标签的代价是**不认识
 * 畸形 HTML**，如实记在下方"已知边界"里。
 *
 * # 它挂在哪儿
 *
 * `editor/paste.ts` 的 `transformPastedHTML`。⚠️ **它必须排在 milkdown 自带的
 * `clipboard` 插件之前**（`create.ts` 的 `.use()` 顺序）——那一条里有处理
 * `<b id="docs-internal-guid-…">` 的正则，而本文件会把 `id` 属性整个删掉，
 * 排在后面的话那条正则**永远匹配不上**（看着还在、其实已经死了）。
 *
 * # 已知边界（如实记着）
 *
 * - ⚠️ **不认识的畸形 HTML 会原样漏过去**：本文件不是解析器，它是"扫描标签"。
 *   没有闭合的标签、属性值里有裸 `>`（没加引号）这类写法处理不了，
 *   漏过去之后由 ProseMirror 自己尽力。**这不是静默失败**：漏过去的部分
 *   行为与洗之前一样，不会比不洗更糟。
 * - ⚠️ **`<div>` 不拆**：它是 ProseMirror 认的块级标签
 *   （`prosemirror-model/dist/index.js` 的 `blockTags` 里有 `div`），
 *   留着它，`<div>甲</div><div>乙</div>` 才会被解析成**两段**而不是并成一段。
 *   真正的"壳"（`<span>` / `<section>` / `<body>` 那一族）才拆。
 * - ⚠️ **语言线索只取"全文第一个"**：一份 HTML 里好几个代码块、语言各不相同时，
 *   只有第一个能被认出来。⚠️ 例外是**每个 `<pre>` 自己带的线索优先**——
 *   `<pre class="lang-python">` 用的是它自己的，不看全文那一个。
 * - ⚠️ **`<table>` 只留结构不留样式**：列宽、边框、底色全丢（本仓的表格
 *   序列化只认 GFM 的对齐冒号，留样式等于留一堆存不下去的东西）。
 * - ⚠️ **`<img>` 的 `src` 原样留着**：`data:` 开头的 base64 图也留
 *   （用户从网页上复制一张图就是这个形状）。要不要落地成文件是
 *   `ui/useImageInsert.ts` 那条路的事，不在这里拦。
 */

import { LanguageFromExtension } from "./lang-guess";

/** 洗完之后的两样东西。 */
export interface ClearManageResult {
  /** 洗干净的 HTML。**可能为空串**（整段都是垃圾），调用方要自己判。 */
  html: string;
  /** 从 `class` / `data-language` 里认出来的语言 id（`refractor` 的写法）；认不出给 `null`。 */
  languageClue: string | null;
}

/* ── 三张表 ───────────────────────────────────────────────────────────── */

/**
 * **整块删掉**（连内容一起）：这些标签里的东西**不是正文**。
 *
 * ⚠️ `<title>` 也在里面：从网页上复制通常不会带上它，但 `<svg>` 里那一颗
 * `<title>`（无障碍名字）会——留着它会在正文里冒出一段莫名其妙的话。
 * ⚠️ `<select>` / `<textarea>` / `<button>` 也删：表单控件粘进正文里
 * 既编辑不了也存不下去，留着只是几个空壳。
 */
const wholeBlockRemove = new Set([
  "script",
  "style",
  "head",
  "title",
  "meta",
  "link",
  "base",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "canvas",
  "select",
  "option",
  "optgroup",
  "textarea",
  "button",
  "input",
]);

/**
 * **丢掉壳、留下内容**：这些标签本身没有任何语义，只是排版用的包装。
 *
 * ⚠️ **`div` 刻意不在里面**（见文件头"已知边界"）——它一进来，段与段就并了。
 * ⚠️ `body` / `html` 也在里面，虽然 `template.innerHTML` 本来就不会给我们这两层；
 * 留着是防"用户粘的是一整份网页源码、外面还裹着 `<!DOCTYPE html>`"那一类。
 */
const loseShell = new Set([
  "html",
  "body",
  "span",
  "font",
  "small",
  "big",
  "abbr",
  "cite",
  "q",
  "time",
  "label",
  "section",
  "article",
  "header",
  "footer",
  "aside",
  "nav",
  "main",
  "form",
  "fieldset",
  "legend",
  "address",
  "hgroup",
  "center",
  "wbr",
]);

/**
 * **每个标签留哪些属性**。不在这张表里的属性一律删。
 *
 * ⚠️ 表里**没有一条是样式**——`style` / `class` / `id` / `width` / `height`
 * 全删。留样式的后果是"洗过一遍，但它还是带着 Word 的字体"，
 * 而本仓的显示口径是**文档主题说了算**（`ui/useDocTheme.ts`），
 * 粘进来的字不该有能力改掉它。
 *
 * ⚠️ `pre` 的 `data-language` 是**唯一**一条会让"语言"活下来的属性：
 * `preset-commonmark` 的 `code_block` 就是 `dom.dataset.language`
 * 那一行读的（`node_modules/@milkdown/preset-commonmark/lib/index.js:805`）。
 */
const attributeWhiteNameSingle: Readonly<Record<string, readonly string[]>> = {
  a: ["href", "title"],
  img: ["src", "alt", "title"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  ol: ["start"],
  pre: ["data-language"],
};

/** 空元素：没有闭合标签，遇到就直接输出。 */
const emptyElement = new Set([
  "br",
  "img",
  "hr",
  "wbr",
  "input",
  "meta",
  "link",
  "area",
  "col",
  "source",
  "track",
  "base",
]);

/**
 * 这些元素上**不许外面再包一层语义标签**（见 {@link 读语义包裹}）。
 *
 * ⚠️ 判据是"它是不是块级容器"，所以 `td` / `th` / `li` **不在**里面
 * ——它们里面装的是行内内容，`<td><strong>x</strong></td>` 完全合法。
 */
const notPackageWrap = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "hr",
  "br",
  "details",
  "summary",
  "figure",
  "figcaption",
  "caption",
  "dl",
  "dt",
  "dd",
]);

/**
 * 同义词换名。写得不一样、语义一样的标签，统一成**本仓 schema 认的那一个**。
 *
 * ⚠️ `ins` → `u` 是要紧的一条：Nota 的下划线写法就是裸 HTML `<u>x</u>`
 * （没有 Markdown 语法，见 `inline-marks.ts` 文件头），留着 `ins` 的话
 * 粘进来的下划线**存盘就没了**（序列化器不认识 `ins`）。
 */
const replaceName: Readonly<Record<string, string>> = {
  ins: "u",
  strike: "s",
  b: "strong",
  i: "em",
};

/**
 * 样式里哪几段该变成**语义标签**。
 *
 * ⚠️ **只有这四条**，因为本仓的 schema 只认这四个行内标记
 * （加粗 / 斜体 / 下划线 / 删除线）。字号、颜色、字体一律丢——
 * 理由同上：显示口径归文档主题。
 */
const styleStyleLanguageMeaning: readonly (readonly [RegExp, string])[] = [
  [/font-weight\s*:\s*(?:bold|bolder|[6-9]\d0)\b/i, "strong"],
  [/font-style\s*:\s*italic\b/i, "em"],
  [/text-decoration(?:-line)?\s*:[^;]*\bunderline\b/i, "u"],
  [/text-decoration(?:-line)?\s*:[^;]*\bline-through\b/i, "s"],
];

/* ── 扫 ──────────────────────────────────────────────────────────────── */

/** 一个标签壳：名、是不是闭合标签、属性串、是不是自闭合。 */
interface label {
  name3: string;
  closeCombine: boolean;
  selfCloseCombine: boolean;
  attributeString: string;
}

/** 栈上的一项：还没闭合的元素，以及它开出来的那几层语义包裹。 */
interface StackItem {
  name3: string;
  /**
   * **这个元素的开标签真的输出过吗**。
   *
   * ⚠️ 2026-09-28 加的一格：`丢壳`（`<span>` / `<body>` 那一族）与命名空间
   * （`<o:p>`）这两类**只丢标签、留内容**，它们的开标签一个字都没写出去，
   * 那闭合标签也**一个字都不该写**。加这一格之前，`<span>甲</span>` 洗出来是
   * `甲</span>`——一对孤零零的闭合标签，症状是粘进来一段内容后面多出几个
   * 莫名其妙的 `</div>` 之类。
   */
  outputLabel2: boolean;
  packageValue: string[];
}

/**
 * 洗一遍。**纯函数**：只吃字符串、只吐字符串（＋一个语言线索），
 * 不碰 DOM、不碰文档（`tests/paste-clean.test.ts` 全靠这一条）。
 */
export function clearManagePastePasteHTML(html: string): ClearManageResult {
  const fullTextLineSearch = findLanguageClue(html);
  let output2 = "";
  let i = 0;
  const stack: StackItem[] = [];
  /** 正在丢的整块里（`>0`），记着是哪个标签开的。 */
  let loseDarkDegree = 0;
  let loseName = "";
  const n = html.length;

  while (i < n) {
    const left = html.indexOf("<", i);
    if (left < 0) {
      if (loseDarkDegree === 0) output2 += text2(html.slice(i));
      break;
    }
    // ⚠️ `<` 后面不是"标签名 / `/` / `!` / `?`"，那它就是正文里的一颗小于号
    //（`2 < 3`）。当标签处理会把它后面的东西整段吃掉。
    if (!/[a-zA-Z!/?]/.test(html[left + 1] ?? "")) {
      if (loseDarkDegree === 0) output2 += text2(html.slice(i, left + 1));
      i = left + 1;
      continue;
    }
    if (loseDarkDegree === 0) output2 += text2(html.slice(i, left));

    if (html.startsWith("<!--", left)) {
      const complete = html.indexOf("-->", left + 4);
      i = complete < 0 ? n : complete + 3;
      continue;
    }
    if (html[left + 1] === "!" || html[left + 1] === "?") {
      const complete = html.indexOf(">", left);
      i = complete < 0 ? n : complete + 1;
      continue;
    }

    const tail = findLabelTail(html, left);
    if (tail < 0) {
      // 这个 `<` 之后一直到文末都没有 `>`：它不是标签，是正文。
      if (loseDarkDegree === 0) output2 += text2(html.slice(left));
      break;
    }
    const parse2 = parseLabel(html.slice(left, tail + 1));
    i = tail + 1;
    if (!parse2) continue;

    // ── 正在丢的整块里：只数同名标签的进出，别的什么都不做
    if (loseDarkDegree > 0) {
      if (parse2.name3 === loseName) {
        if (parse2.closeCombine) loseDarkDegree--;
        else if (!parse2.selfCloseCombine) loseDarkDegree++;
      }
      continue;
    }
    if (wholeBlockRemove.has(parse2.name3)) {
      if (!parse2.closeCombine && !parse2.selfCloseCombine) {
        loseDarkDegree = 1;
        loseName = parse2.name3;
      }
      continue;
    }
    // ── Office 命名空间（`o:p` / `w:ProofErr` / `v:shape` / `st1:*`）：
    //    标签丢掉，包里那点内容留着（常常是空的，那就是全丢）。
    const isCommandNameEmptyInterval = parse2.name3.includes(":");

    if (parse2.closeCombine) {
      const receive = receiveStack(stack, parse2.name3, output2);
      output2 = receive.output2;
      if (receive.configureAbove && receive.outputLabel2) output2 += `</${parse2.name3}>`;
      continue;
    }

    // ── 开始标签
    const packageValue = readLanguageMeaningPackageWrap(parse2, isCommandNameEmptyInterval);
    for (const t of packageValue) output2 += `<${t}>`;
    const isEmpty = emptyElement.has(parse2.name3) || parse2.selfCloseCombine;
    // 三件互不冲突的事，分开写：① 命名空间标签与"壳"标签都**不输出标签本身**；
    // ② 不是壳的才输出（过了白名单）；③ 不是空元素的进栈等着被闭合。
    const outputLabel2 = !isCommandNameEmptyInterval && !loseShell.has(parse2.name3);
    if (outputLabel2) output2 += outputLabel(parse2, fullTextLineSearch);
    if (!isEmpty) stack.push({ name3: parse2.name3, outputLabel2, packageValue });
  }

  // 文末还有没闭合的：把包裹一层层收回来，元素本身也补一个闭合
  //（不补的话，最后一段就成了下一段的父节点）。
  while (stack.length > 0) {
    const item5 = stack.pop()!;
    for (let k = item5.packageValue.length - 1; k >= 0; k--) output2 += `</${item5.packageValue[k]}>`;
    if (item5.outputLabel2) output2 += `</${item5.name3}>`;
  }
  return { html: output2, languageClue: fullTextLineSearch };
}

/* ── 小工具（都是纯函数）──────────────────────────────────────────────── */

/**
 * 正文里那一颗 `<` 要转义，其余字符原样。
 *
 * ⚠️ **不碰 `&`**：这里过的是一段 HTML 源码，`&amp;` 已经是转义过的了，
 * 再转一次会变成 `&amp;amp;`（最后 `template.innerHTML` 还要解一遍，
 * 一进一出就成了字面的 `&amp;` 显示在屏幕上）。
 */
function text2(s: string): string {
  return s.replace(/</g, "&lt;");
}

/** 从 `起`（一个 `<`）往后找这个标签的 `>`，跳过引号里的。找不到给 `-1`。 */
function findLabelTail(s: string, start5: number): number {
  let reference = "";
  for (let i = start5 + 1; i < s.length; i++) {
    const c = s[i]!;
    if (reference !== "") {
      if (c === reference) reference = "";
      continue;
    }
    if (c === '"' || c === "'") {
      reference = c;
      continue;
    }
    if (c === ">") return i;
  }
  return -1;
}

/** 拆一个标签壳。**认不出给 `null`**（调用方把它当没看见）。 */
function parseLabel(source: string): label | null {
  const m = /^<\s*(\/?)\s*([a-zA-Z][\w:.-]*)([\s\S]*?)(\/?)\s*>$/.exec(source);
  if (!m) return null;
  const smallWrite = m[2]!.toLowerCase();
  return {
    // ⚠️ 换名在**这里**做（而不是输出那一步）：进栈的键与闭合标签的键都要
    //    用换过之后的名字，否则 `<ins>…</ins>` 会变成"开着 `ins`、关着 `u`"，
    //    栈永远收不了口。
    name3: replaceName[smallWrite] ?? smallWrite,
    closeCombine: m[1] === "/",
    selfCloseCombine: m[4] === "/",
    attributeString: m[3] ?? "",
  };
}

/** 拆属性串：给 `[名, 值(null = 光杆属性)]`。 */
function parseAttribute(stringValue: string): [string, string | null][] {
  const output2: [string, string | null][] = [];
  const find = /\s([a-zA-Z_:][\w:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  for (let m = find.exec(stringValue); m; m = find.exec(stringValue)) {
    const name3 = m[1]!.toLowerCase();
    let value2 = m[2] ?? null;
    if (value2 !== null && (value2.startsWith('"') || value2.startsWith("'"))) value2 = value2.slice(1, -1);
    output2.push([name3, value2]);
  }
  return output2;
}

/** 从 `style` 里读出该包的语义标签（顺序固定：strong → em → u → s）。 */
function readLanguageMeaningPackageWrap(parse2: label, isCommandNameEmptyInterval: boolean): string[] {
  // ⚠️ **块级元素上不许包**：`<p style="font-weight:bold">` 包成
  // `<strong><p>` 是非法嵌套，浏览器会自己"修"一遍，修成什么样没法预测
  //（多半是把 `<strong>` 提到 `<p>` 外面、只裹住前半句）。
  // ⚠️ 命名空间标签（`<SPAN style='font-weight:bold'>` 在 Word 里也可能
  // 写成 `<w:r>` 包着）不受这条限制——它本来就是要拆的壳。
  if (!isCommandNameEmptyInterval && notPackageWrap.has(parse2.name3)) return [];
  const styleStyle = parseAttribute(parse2.attributeString).find(([k]) => k === "style")?.[1];
  if (!styleStyle) return [];
  const output2: string[] = [];
  for (const [determineEvidence, labelName] of styleStyleLanguageMeaning) if (determineEvidence.test(styleStyle)) output2.push(labelName);
  return output2;
}

/**
 * 输出一个开始标签：按白名单过滤属性，`pre` 上补 `data-language`。
 *
 * ⚠️ `pre` 补语言那一条**不打乱原有属性**：它自己带了 `data-language`
 * 就不补（以它自己的为准）。
 */
function outputLabel(parse2: label, fullTextLineSearch: string | null): string {
  const allowAllow = attributeWhiteNameSingle[parse2.name3];
  if (!allowAllow) return `<${parse2.name3}>`;
  const keep: string[] = [];
  for (const [k, v] of parseAttribute(parse2.attributeString)) {
    if (allowAllow.includes(k) && v !== null) keep.push(`${k}="${convertMeaningAttribute(v)}"`);
  }
  if (parse2.name3 === "pre" && !keep.some((a) => a.startsWith("data-language"))) {
    // ⚠️ 这个 `<pre>` 自己带的线索优先（`class="lang-python"`），
    //    没有才退回全文那一个——一份 HTML 里几个代码块语言不同时，
    //    至少带线索的那些能各归各位。
    const selfWith = findLanguageClue(parse2.attributeString) ?? fullTextLineSearch;
    if (selfWith) keep.push(`data-language="${convertMeaningAttribute(selfWith)}"`);
  }
  return keep.length > 0 ? `<${parse2.name3} ${keep.join(" ")}>` : `<${parse2.name3}>`;
}

/** 属性值里的引号与尖括号要转义，否则会把这个标签拆坏。 */
function convertMeaningAttribute(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 收栈：找到**最上面**那个同名的元素，把它与它上面所有元素开的包裹一层层关掉。
 *
 * ⚠️ 找不到就**什么都不做**（返回 `配上: false`）——一段 HTML 里多一个
 * `</div>` 是常事（我们在洗的本来就是别人拼出来的东西），为此抛错或
 * 硬补一个 `</div>` 都只会让后面的结构更乱。
 *
 * @returns `出` 是追加了闭合包裹之后的串；`配上` 是找没找到；
 *   `出标签` 是那个元素的**开**标签当初输出过没有（`丢壳` / 命名空间那两类没有
 *   ——见 {@link 栈项.出标签}）。
 */
function receiveStack(
  stack: StackItem[],
  name3: string,
  output2: string,
): { output2: string; configureAbove: boolean; outputLabel2: boolean } {
  let k = -1;
  for (let j = stack.length - 1; j >= 0; j--) {
    if (stack[j]!.name3 === name3) {
      k = j;
      break;
    }
  }
  if (k < 0) return { output2, configureAbove: false, outputLabel2: false };
  const outputLabel2 = stack[k]!.outputLabel2;
  for (let j = stack.length - 1; j >= k; j--) {
    const packageValue = stack[j]!.packageValue;
    for (let t = packageValue.length - 1; t >= 0; t--) output2 += `</${packageValue[t]}>`;
  }
  stack.length = k;
  return { output2, configureAbove: true, outputLabel2 };
}

/**
 * **语言长名 → 语言 id**。
 *
 * ⚠️ 2026-09-28 补的**第二张表**，起因是一次真失败：`class="lang-python"` 与
 * `data-language="rust"` 一个都认不出来（`<pre>` 洗完之后光秃秃的，着色语言
 * 丢了）。原因是那截记号先被当成"扩展名"去查 {@link 扩展名表}——而
 * `python` / `rust` / `javascript` 这些**语言长名压根不是扩展名**
 * （表里的键是 `py` / `rs` / `js`），于是**一个都落空**，脚本报不了错，
 * 症状只是"粘进来的代码块没有语言"。
 *
 * 所以两份记号走两条路：
 *
 * | 记号长什么样 | 例子 | 查哪儿 |
 * |---|---|---|
 * | 扩展名那一族 | `js` `py` `ts` `rs` `sh` `md` | {@link 扩展名表} |
 * | 语言长名那一族 | `python` `rust` `javascript` `csharp` | 这张表 |
 *
 * ⚠️ **两张表不一致**这件事由测试兜着（`tests/paste-clean.test.ts` 里有一条
 * 断言：这张表里**每一个值**都必须在 {@link 扩展名表} 里出现过）——也就是
 * 说这张表只能"换名字"，不能引进一个别处不认的语言 id。
 */
export const languageNameTable: Readonly<Record<string, string>> = {
  python: "python", python3: "python",
  javascript: "javascript", typescript: "typescript",
  jsx: "jsx", tsx: "tsx",
  rust: "rust", golang: "go", go: "go",
  ruby: "ruby", php: "php", perl: "perl", lua: "lua",
  java: "java", kotlin: "kotlin", scala: "scala", groovy: "groovy",
  c: "c", cpp: "cpp", "c++": "cpp", csharp: "csharp", "c#": "csharp",
  objectivec: "objectivec", "objective-c": "objectivec", objc: "objectivec",
  swift: "swift", pascal: "pascal", fortran: "fortran", cobol: "cobol",
  basic: "basic", vbnet: "vbnet", "vb.net": "vbnet", "visual-basic": "vbnet",
  haskell: "haskell", elixir: "elixir", erlang: "erlang", clojure: "clojure",
  ocaml: "ocaml", fsharp: "fsharp", "f#": "fsharp", dart: "dart", julia: "julia",
  nim: "nim", zig: "zig", crystal: "crystal", solidity: "solidity",
  gdscript: "gdscript", cypher: "cypher", odin: "odin",
  assembly: "nasm", nasm: "nasm",
  /* 硬件描述 */
  verilog: "verilog", vhdl: "vhdl", glsl: "glsl", hlsl: "hlsl", wgsl: "wgsl",
  /* 网页 / 模板 */
  html: "html", xml: "xml", svg: "svg", mathml: "mathml",
  vue: "markup", svelte: "markup",
  cshtml: "cshtml", jinja: "jinja2", jinja2: "jinja2", handlebars: "handlebars",
  /* 数据 / 配置 */
  json: "json", json5: "json5", yaml: "yaml", toml: "toml", ini: "ini",
  hcl: "hcl", terraform: "hcl", nix: "nix", dockerfile: "dockerfile",
  docker: "dockerfile", makefile: "makefile", make: "makefile", cmake: "cmake",
  nginx: "nginx", systemd: "systemd", properties: "properties",
  gitignore: "gitignore", editorconfig: "editorconfig",
  protobuf: "protobuf", proto: "protobuf", graphql: "graphql", gql: "graphql",
  /* 查询 / 数据库 */
  sql: "sql", psql: "sql", pgsql: "sql", postgres: "sql", postgresql: "sql",
  mysql: "sql", sqlite: "sql", tsql: "sql", plsql: "plsql", promql: "promql",
  /* 文档 / 文本 */
  markdown: "markdown", mkd: "markdown", latex: "latex", asciidoc: "asciidoc",
  adoc: "asciidoc", rest: "rest", rst: "rest", wiki: "wiki", csv: "csv",
  log: "log", diff: "diff", patch: "diff", regex: "regex", regexp: "regex",
  mermaid: "mermaid", plantuml: "plantuml", puml: "plantuml",
  /* 命令行 */
  shell: "bash", sh: "bash", bash: "bash", zsh: "bash",
  powershell: "powershell", pwsh: "powershell", batch: "batch", bat: "batch",
  vim: "vim", viml: "vim", tcl: "tcl", awk: "awk",
};

/**
 * 从一段 HTML（或一个元素的属性串）里认语言线索。
 *
 * 认这几种写法，都是真实网站用过的：
 *
 * | 出处 | 长什么样 |
 * |---|---|
 * | GitHub | `class="highlight highlight-source-js"` |
 * | StackOverflow / Highlight.js | `class="lang-python"` / `class="language-rust"` |
 * | 各家 Markdown 渲染器 | `class="language-ts"` |
 * | Prism | `class="language-css"` |
 * | 自定 | `data-language="go"` / `data-lang="go"` |
 *
 * ⚠️ 抓出来的那截要先走 {@link 按扩展名推语言}（`js` / `py` / `ts` 这些写法
 * 本身就是扩展名，那份表正好管这个），落空再走 {@link 语言名表}
 * （`python` / `rust` 那种长名）。**顺序不能反**：长名表里 `sh` / `bat`
 * 这些键也兼着扩展名的身份，先查扩展名表才能保证 `.sh` 文件与
 * `class="lang-sh"` 给的是同一个答案。
 */
export function findLanguageClue(s: string): string | null {
  const find =
    /(?:highlight-source-|language-|lang-|brush:\s*|data-language\s*=\s*["']|data-lang\s*=\s*["'])([A-Za-z][\w+#.-]*)/i.exec(
      s,
    );
  if (!find) return null;
  const recordNumber = find[1]!;
  return LanguageFromExtension(recordNumber) ?? languageNameTable[recordNumber.toLowerCase()] ?? null;
}
