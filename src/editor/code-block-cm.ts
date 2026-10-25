/**
 * 代码块里那个 **CodeMirror 实例**（backlog 第 101 项）。
 *
 * 用户 2026-10-06 定的做法：「**引入开源项目：CodeMirror。解决代码框。记得鸣谢。**」
 * ——也就是说，代码块不再靠给 ProseMirror 的 `code_block` 打补丁去凑手感
 * （`auto-pair.ts` 那边只能补"配对"这一件，缩进与 `Tab` 补不进去），
 * 而是**换一个真的编辑器来管那一段文本**。
 *
 * # 为什么这就不是"新引一个库"
 *
 * `@codemirror/state` / `view` / `commands` / `language` 本仓**早就在用**
 * （源码模式 `editor/source.ts`，2026-09 起）。这一批只多了一个
 * `@codemirror/autocomplete`——它是**唯一**新登记的依赖，为的是它里面的
 * `closeBrackets()`（真正的代码编辑器那套配对：成对补右半边、再打闭符号跨过去、
 * 夹在空对中间退格两颗一起删）。⚠️ 那一份不许自己手写：配对看着简单，
 * 但"选中一段再打括号""引号里的引号""退格删一对"三件事的边界条件很碎，
 * 手写的版本一定会在某个语言上出洋相。
 *
 * # 谁拥有这段文本（**这是本文件最要紧的一条**）
 *
 * **ProseMirror 仍然是文档的唯一真相**——`.md` 存的是它序列化出来的东西，
 * 撤销栈、脏标记、"改了没有"全归它。CodeMirror 在这里只是**这一段文本的
 * 输入面**：用户按键落在 CM 上，CM 把改动**推回** PM 一笔真事务。
 *
 * ⚠️ 因此撤销**归 PM**（CM 那一侧**刻意不装 `history()`**）：代码块里按
 * `Ctrl+Z` 走的是 `code-block.ts` 转给 PM 的那条路，于是"在代码块里改一个字
 * → 点到正文 → 再按 Ctrl+Z"撤销的是同一件事，不会出现两套栈互相看不见对方。
 *
 * # 三个坑（`docs/07` 第 101 项点名要盯的）
 *
 * ① **防回声**：CM 一改就推 PM，PM 一改又推回 CM——不收口的话光标会跳、
 *    撤销栈会被拆碎。收口靠**两把锁**：本文件的 `同步中`（CM 那一侧）
 *    与 `code-block.ts` 里同名的那把（PM 那一侧）。判定文本相不相同时，
 *    两把锁都要在。
 * ② **不抖**：推给 PM 的**不是"整块换掉"**，而是 `算最小改动` 算出来的
 *    那一段（只换真正变了的那几个字）。整块换的话每敲一个字都记一笔
 *    "整块替换"，撤销一下会把一整段吞掉。
 * ③ **不要两套高亮**：代码着色的**唯一来源**仍是 `refractor`（本仓 297 种语言
 *    的那一份，原来是 `@milkdown/plugin-prism` 在读）。这里把它**接过来**：
 *    `分色()` 拿 refractor 的分词结果算出区间，再交给 CM 的 `Decoration.mark`。
 *    ⚠️ 类名**逐字沿用** `token xxx`（`editor-blocks.css` 里那一整段
 *    `.token.keyword` 配色就是这么写的），所以配色**一个新常量都没加**。
 *
 * # 2026-10-07 补的两样：选择那几颗键 ＋ 空选区复制/剪切
 *
 * - **`Ctrl+L` / `Ctrl+D` / `Ctrl+Shift+D` 在这里自己接**（`selectLine` 与
 *   `select.ts` 共用那两个判据）。⚠️ **不能指望应用那条路**：那三条命令
 *   （`selectLine` / `selectWord` / `deleteWord`）在所见即所得那一侧**认了
 *   代码块就返回**——代码块的选区归这颗实例管，PM 那边设一个"在代码块里"的
 *   选区**屏幕上什么都不会亮**（那颗实例拿着 DOM 焦点时 PM 的
 *   `editorOwnsSelection()` 就是假，`selectionToDOM` 直接返回回来，所以
 *   NodeView 的 `setSelection` 根本不会被叫到）。见 `select.ts` 文件头。
 *   ⚠️ 因此**菜单里那三条在代码块里点不动**（菜单走的是 PM 那条路），而键位
 *   好用——不是撒谎，是"这一段文本的主人不是它"；这条边界记在 `docs/07`。
 * - **空选区按复制/剪切＝整行**（编辑器里的 `lineWiseCopyCut` 那一条，
 *   判据是 {@link 整行剪贴}）。⚠️ `Mod-e`（选句）**这里不接**：代码里没有
 *   "句子"这个概念，拿句读去扫代码只会切出半截标识符。两头（这里与 PM 那条路）
 *   都**不做**，于是没有"键位与菜单不一致"这回事。
 */

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab, selectLine } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  highlightActiveLine,
  keymap,
  type Command,
  type DecorationSet,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";
import { refractor } from "refractor";

// ⚠️ 「哪个字算一个词」的判据**与所见即所得、源码模式是同一份**（`select.ts`
// 第一组那几个纯函数）：同一颗 `Ctrl+D` 在三处选出来的东西必须一样。
import { wordRange, type range } from "./select";

/**
 * 一级缩进的宽度。
 *
 * ⚠️ **这是本批自己定的一个数，不是抄来的**：CM 的出厂值是 2 个空格，
 * 而代码块里常见的那几门语言（Rust / Python / C 系）的通行口径是 4，
 * 参考对象 Typora 也是 4。将来要做成设置项的话，**改这一处就够**——
 * `Tab`、`Shift+Tab`、回车续行三条路读的都是它。
 */
const shrinkEnterWidthDegree = "    ";

/* ── 纯函数：给测试读的那三个 ─────────────────────────────────────────────
 *
 * ⚠️ 这三件（改动的边界、着色的区间、回车续多少格）**都是纯字符串运算**，
 * 与 CM/PM 的视图无关，所以单独放在这儿让 `tests/code-block-editing.test.ts`
 * 直接测——开窗目检只能证"这一条看着对"，边界条件（半个 emoji、空行、
 * 括号配对）得靠用例钉。
 */

function isHeightPosition(c: number): boolean {
  return c >= 0xd800 && c <= 0xdbff;
}

function isLowPosition(c: number): boolean {
  return c >= 0xdc00 && c <= 0xdfff;
}

/**
 * 两版文本之间**最小的那一段改动**（只用一处替换表达）。
 *
 * 算法是"抠掉公共前缀、再抠掉公共后缀"，看着朴素，但**两条边界必须处理**，
 * 否则会切出半个字符来：
 *
 * - **代理对**：`"😀"` 与 `"😁"` 的高位是同一个码元（`0xD83D`），
 *   逐码元比前缀会停在**两个码元中间**——照那个位置切，切完剩下一个孤立的
 *   高位代理，文本就坏了。所以两条边界都要往回退到**完整的字符**上。
 * - **前后缀重叠**：前缀和后缀都别越过对方（`前 + 尾 <= 短`），
 *   否则 `"aa"` → `"a"` 这种会被算成"删掉一个 a 又插回一个 a"。
 *
 * 判据在 `tests/code-block-editing.test.ts`：相等、纯插入、纯删除、中间替换、
 * 整段替换、以及上面那两种边界。
 */
export function computeMostSmallChangeAction(
  oldText: string,
  newText: string,
): { deleteStart: number; deleteEnd: number; insert: string } {
  const short = Math.min(oldText.length, newText.length);

  let before2 = 0;
  while (before2 < short && oldText.charCodeAt(before2) === newText.charCodeAt(before2)) before2++;
  // ⚠️ 退到完整字符上：`前` 若正好落在（高位, 低位）之间，两边一起退一格。
  while (before2 > 0 && (isLowPosition(oldText.charCodeAt(before2)) || isLowPosition(newText.charCodeAt(before2)))) {
    if (isHeightPosition(oldText.charCodeAt(before2 - 1)) || isHeightPosition(newText.charCodeAt(before2 - 1))) before2--;
    else break;
  }

  const returnAbleBack = () => tail < short - before2;
  const tailBreakAtCharacterInside = (text4: string) => {
    const i = text4.length - tail;
    return i > 0 && i < text4.length && isHeightPosition(text4.charCodeAt(i - 1)) && isLowPosition(text4.charCodeAt(i));
  };

  let tail = 0;
  while (returnAbleBack() && oldText.charCodeAt(oldText.length - 1 - tail) === newText.charCodeAt(newText.length - 1 - tail))
    tail++;
  while (returnAbleBack() && (tailBreakAtCharacterInside(oldText) || tailBreakAtCharacterInside(newText))) tail++;

  return { deleteStart: before2, deleteEnd: oldText.length - tail, insert: newText.slice(before2, newText.length - tail) };
}

/** hast 里我们要用到的那几个字段。⚠️ refractor 的类型很宽，这里自己收窄。 */
type ShareWordNode = {
  type: string;
  value?: string;
  children?: ShareWordNode[];
  properties?: { className?: unknown };
};

export type ColorBlock = { from: number; to2: number; class: string };

/**
 * 把一段代码按语言分成着色区间（`{从, 到, 类}`）。
 *
 * 类名与 `@milkdown/plugin-prism` 的产物**逐字相同**（`token` + 若干修饰类，
 * 嵌套的那几层合并成一串）——`editor-blocks.css` 里那一整段配色照旧管用，
 * 一个颜色常量都不用新加。
 *
 * ⚠️ 三条安静的失败都走"不上色"（返回空），**不抛**：语言为空、
 * refractor 不认识这个语言、分词器自己抛（`refractor/all` 里个别语言就是会抛）。
 * 代码块变成纯文本**不好看**，但比"整块渲染不出来"好得多。
 */
export function shareColor(text2: string, language: string): ColorBlock[] {
  if (!text2 || !language) return [];
  if (!refractor.listLanguages().includes(language)) return [];

  let tree: ShareWordNode;
  try {
    tree = refractor.highlight(text2, language) as unknown as ShareWordNode;
  } catch {
    return [];
  }

  const output2: ColorBlock[] = [];
  let position3 = 0;
  const walk = (nodes: ShareWordNode[], tokenClasses: string[]): void => {
    for (const node of nodes) {
      if (node.type === "element") {
        const name3 = Array.isArray(node.properties?.className)
          ? (node.properties.className as string[])
          : [];
        walk(node.children ?? [], [...tokenClasses, ...name3]);
      } else if (typeof node.value === "string") {
        const to2 = position3 + node.value.length;
        if (tokenClasses.length && node.value.length) {
          output2.push({ from: position3, to2, class: tokenClasses.join(" ") });
        }
        position3 = to2;
      }
    }
  };
  walk(tree.children ?? [], []);
  return output2;
}

/** 三种括号的配对表（与 `closeBrackets` 那份表同源）。 */
const openBracketNumber = "([{";
const closeBracketNumber = ")]}";

/**
 * 回车那一刻该插什么、光标落在哪。
 *
 * 三条口径（照真编辑器）：
 * ① **延续上一行的缩进**；
 * ② 上一行以 `{` / `(` / `[` 结尾时**再进一级**；
 * ③ 光标正好夹在一对空括号中间（`{|}`）时**展开成三行**（中间那行再进一级）。
 *
 * ⚠️ `删多少` 那一项是给"光标停在一行纯空白后面"这一格用的：真编辑器在
 * 这种情况下会把那截空白**并进新行**（上一行不留尾随空白）。CM 自带的
 * `insertNewlineAndIndent` 也是这么做的，这里对齐它。
 *
 * 返回的是**相对光标**的三个数，命令层照抄即可。
 */
export function returnCarContinueLine(
  prefixText: string,
  afterText: string,
  singlePosition: string,
): { removeManyLess: number; insert: string; cursor: number } {
  const blankOnly = /^[ \t]*$/.test(prefixText);
  const shrinkEnter = /^[ \t]*/.exec(prefixText)?.[0] ?? "";

  const nonWhitespaceTail = prefixText.replace(/[ \t]+$/, "");
  const endCharacter = nonWhitespaceTail.slice(-1);
  // ⚠️ `末字符` 为空时**不能直接 `indexOf`**：`"([{".indexOf("")` 回的是 `0`
  //（空串是任何字符串的子串），于是"光标停在一行纯空白后面"这一格会被当成
  // "上一行以 `(` 结尾"，凭空多进一级。**这一条是 `tests/code-block-editing.test.ts`
  // 当场抓出来的**（见那一组最后一条）。
  const position2 = endCharacter === "" ? -1 : openBracketNumber.indexOf(endCharacter);
  const expectedClose = position2 >= 0 ? closeBracketNumber.charAt(position2) : "";

  const afterTextHead = /^[ \t]*/.exec(afterText)?.[0] ?? "";
  const afterTextFirst = afterText.charAt(afterTextHead.length);
  const receiveTail = expectedClose !== "" && afterTextFirst === expectedClose;

  if (receiveTail) {
    const insideShrinkEnter = shrinkEnter + singlePosition;
    return { removeManyLess: blankOnly ? prefixText.length : 0, insert: `\n${insideShrinkEnter}\n${shrinkEnter}`, cursor: 1 + insideShrinkEnter.length };
  }

  const newValueShrinkEnter = expectedClose !== "" ? shrinkEnter + singlePosition : shrinkEnter;
  return { removeManyLess: blankOnly ? prefixText.length : 0, insert: `\n${newValueShrinkEnter}`, cursor: 1 + newValueShrinkEnter.length };
}

/**
 * 一段文本里，`位置` 所在那一行的边界（`入` 含、`出` 不含，**都不含换行符**）。
 *
 * ⚠️ 位置**正好落在某个换行符后面**时算作下一行的行首（`lastIndexOf` 的起点
 * 是 `位 - 1`，正好会捡到它前面那个 `\n`）——光标停在行首按 `Ctrl+C` 拿的
 * 该是**光标后面那一行**，不是它上面那一行。
 */
export function lineBoundary(text2: string, position2: number): { enter: number; output2: number } {
  const position3 = Math.max(0, Math.min(text2.length, position2));
  const enter = text2.lastIndexOf("\n", position3 - 1) + 1;
  let output2 = text2.indexOf("\n", enter);
  if (output2 < 0) output2 = text2.length;
  return { enter, output2 };
}

/**
 * 「空选区按复制 / 剪切」该拿哪一段——编辑器里管这条叫 `lineWiseCopyCut`
 * （VS Code、Typora 的代码块都有）。**纯字符串运算**，用例在
 * `tests/code-block-editing.test.ts`。
 *
 * 三条口径：
 *
 * ① **带走那个换行符**：`Ctrl+C` 空选区拿到的是整行**连同它的换行**，粘到别处
 *    就是一行，不会和上一行黏在一起。⚠️ **最后一行没有换行可带**（文档末尾），
 *    那时只给这一行的字符——凭空补一个 `\n` 会让粘贴处多出一个空行。
 * ② **剪切要连换行一起删**，但**末尾那一行删的是它前面那个换行**：不这么办的话
 *    "删掉最后一行"会留下一个空行（屏幕上看着像删干净了、文档里还剩一个 `\n`）。
 * ③ 只算**一行**（光标所在那一行）。多光标/"已经有选区"这两种情况**不在这条
 *    命令的范围内**——{@link 落剪贴板} 见到就交回 CM 自己那份默认行为。
 *
 * 返回 `null` 表示"没算出来"（文档为空）——调用方照旧交回默认行为。
 */
export function wholeLineCutPaste(
  text2: string,
  position2: number,
  isCutSplit: boolean,
): { text2: string; remove: { from: number; to: number } | null; cursor: number } | null {
  if (!text2) return null;
  const { enter, output2 } = lineBoundary(text2, position2);
  const hasBelowLine = output2 < text2.length;
  const lineText = text2.slice(enter, output2);
  const remove = isCutSplit
    ? {
        // ⚠️ 末尾那一行（`有下行` 为假）删的是前面那个换行；只有一段的文档
        //（`入` 为 0）没有前面那个换行，就删它自己。
        from: hasBelowLine ? enter : Math.max(0, enter - 1),
        to: hasBelowLine ? output2 + 1 : output2,
      }
    : null;
  return { text2: lineText + (hasBelowLine ? "\n" : ""), remove, cursor: remove ? remove.from : enter };
}

/* ── CM 扩展 ──────────────────────────────────────────────────────────── */

/** 语言靠一个 `StateField` 记着：代码块的 NodeView 改语言时发这条效果。 */
const setLanguageEffectResult = StateEffect.define<string>();

const languageField = StateField.define<string>({
  create: () => "",
  update(value2, transaction) {
    for (const EffectResult of transaction.effects) if (EffectResult.is(setLanguageEffectResult)) return EffectResult.value;
    return value2;
  },
});

/** "请重新算一遍着色"。⚠️ 只给**长尾语言那一份表异步到货**时用（见下）。 */
const heavyComputeEffectResult = StateEffect.define<null>();

/** 短块直接重算；超过这条线的长块先把旧装饰随改动平移，再攒一帧重算。 */
export function needWantDelayDelayActiveColor(lengthDegree: number): boolean {
  return lengthDegree > 2_000;
}

const lengthBlockActiveColorEqualPendingMilliSeconds = 80;

function computeDecorations(state: EditorState): DecorationSet {
  const text2 = state.doc.toString();
  const language = state.field(languageField, false) ?? "";
  const range = shareColor(text2, language).map((block) =>
    Decoration.mark({ class: block.class }).range(block.from, block.to2),
  );
  // ⚠️ 第二个参数 `true` 是"排一下序"：CM 要求装饰按起点有序，
  // 而 refractor 的叶子是**嵌套展平**出来的（父的类名会并进子串），
  // 自己排不如让它排。
  return Decoration.set(range, true);
}

const shareColorPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private countTime: number | null = null;
    private activeActive = true;
    constructor(private view: EditorView) {
      this.decorations = computeDecorations(view.state);
    }
    update(u: ViewUpdate) {
      const languageChanged = u.startState.field(languageField, false) !== u.state.field(languageField, false);
      const wantHeavyCompute = u.transactions.some((transaction) =>
        transaction.effects.some((EffectResult) => EffectResult.is(heavyComputeEffectResult)),
      );
      if (languageChanged || wantHeavyCompute) {
        if (this.countTime !== null) window.clearTimeout(this.countTime);
        this.countTime = null;
        this.decorations = computeDecorations(u.state);
        return;
      }
      if (!u.docChanged) return;
      if (!needWantDelayDelayActiveColor(u.state.doc.length)) {
        if (this.countTime !== null) window.clearTimeout(this.countTime);
        this.countTime = null;
        this.decorations = computeDecorations(u.state);
        return;
      }

      // 长代码块打字时，refractor 对整块重新分词比按键本身贵得多。先只把旧
      // 装饰按改动映射到新坐标，80ms 内没有新按键再派一条一次性事务重算。
      this.decorations = this.decorations.map(u.changes);
      if (this.countTime !== null) window.clearTimeout(this.countTime);
      this.countTime = window.setTimeout(() => {
        this.countTime = null;
        if (!this.activeActive) return;
        this.view.dispatch({ effects: heavyComputeEffectResult.of(null) });
      }, lengthBlockActiveColorEqualPendingMilliSeconds);
    }
    destroy() {
      this.activeActive = false;
      if (this.countTime !== null) window.clearTimeout(this.countTime);
      this.countTime = null;
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * 外观。⚠️ **一个色值都不写**：颜色全走 `var(--…)`（和 `source.ts` 那条
 * 同一个理由——写死了之后换文档主题就会得到"深底深字"）。
 *
 * ⚠️ 字号继续从 `pre` 继承（`.88em` 那一档）；字体必须在这里显式点成
 * `var(--font-mono)`。CodeMirror 的 baseTheme 会给 `.cm-scroller` 写
 * `font-family: monospace`，只写 `inherit` 在不同 WebView/主题组合下并不稳；
 * 文档主题只要覆盖 `--font-mono`，代码框就该跟着它走。
 */
const theme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "inherit", height: "auto" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "inherit",
    // ⚠️ `pre` 那边才是滚动的那一层（它 `overflow: visible` 是**必须的**：
    // 块外那三样挂件——围栏标记、工具栏、语言框——都要画到框外去，见
    // `editor-blocks.css` 那条注释）。所以这里不能自己开一个滚动区。
    overflow: "visible",
  },
  ".cm-content": {
    padding: "0",
    minHeight: "0",
    fontFamily: "var(--font-mono)",
    caretColor: "var(--accent)",
  },
  ".cm-line": { padding: "0", fontFamily: "var(--font-mono)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  // ⚠️⚠️ **第一条选择器要照 CM 自己那条写全**（理由与 `source.ts` 那处一字不差，
  // 2026-10-07 一起量出来的）：写短了权重压不过 CM 出厂的聚焦色，画出来是它的
  // 淡紫而不是这里的 `--bg-active`，且聚焦紫、失焦灰两种色。
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--bg-active)",
  },
  // 当前行那一层淡底。
  //
  // ⚠️ **不能照抄源码模式那条 `--bg-subtle`**：代码块自己的底**就是**
  // `--bg-subtle`（`editor-blocks.css` 里 `pre` 那条 `background`），同一个色
  // 兑上去是一条**隐身规则**——看着像生效了、屏幕上一个像素都不变。
  //
  // 所以这里用**正文色的半透明**兑：`--fg` 按定义就是与底反差最大的那一极
  //（浅色近黑、深色近白），混出来的一层在明暗两套、各套文档主题下都成立，
  // 不用为一个新色号去 `base.css` 那两处再添一个变量。
  // ⚠️ 别改成 `var(--accent)`：强调色在代码块里会被语法配色抢掉，而且那个色
  // 已经归"拖列宽"那条 12% 的规则用着，两处撞脸会让人以为是同一件事。
  //
  // ⚠️⚠️ **两条规则是一对，缺一条就出错**（2026-10-07 开窗量出来的）：
  //
  // - **上面那条（`transparent`）不是多余的**：CM 自己带一条出厂样式
  //   `.cm-activeLine { background: #cceeff44 }`（淡蓝 27%），而**它不看焦点**。
  //   只要装了 `highlightActiveLine()`，**每一个没聚焦的代码块也会被它涂上**
  //   ——文档里几个代码块就亮几行第一行。上面那条按 (0,2,0) 把它压掉。
  //   ⚠️ 这一条**当初是量出来的**：截图上带子是 `rgb(95,104,109)`，
  //   `0.267×#cceeff + 0.733×#383838` 正好等于它——不是"看着像"。
  // - **下面那条（有焦点）挂在 `&.cm-focused` 上**，按 (0,3,0) 压住上面那条。
  //   焦点是判据：没聚焦时**根本没有任何一行是"当前行"**。
  "& .cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--fg) 5%, transparent)" },
});

/** 配对表。⚠️ CM 出厂那份**没有反引号**，代码块里必须有（`` ` `` 是常用符号）。 */
const configureCorrectTable = EditorState.languageData.of(() => [
  { closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"], before: ")]}:;>`" } },
]);

/**
 * 空选区按复制 / 剪切时**整行进出**（`lineWiseCopyCut`，判据见 {@link 整行剪贴}）。
 *
 * ⚠️ **只做"空选区"这一格**，其余一律 `return false` 交回浏览器/CM 自己：
 * 有选区时原生那套（复制选中那段、剪切掉它）就是对的，另写一份只会和它打架。
 * 多光标同理（本仓虽然没开多光标插件，但 `defaultKeymap` 里那两条
 * `Mod-Alt-ArrowUp/Down` 能加出多个选区来）——那时"哪一行"没有唯一答案。
 *
 * ⚠️ **`cut` 必须自己删**：`preventDefault()` 之后浏览器不会动 DOM，删是我们
 * 这一笔 CM 事务的责任（它随后经 `文本变化` 推回 PM，所以撤销栈归 PM，
 * 与文件头那条一致）。⚠️ 不用 `document.execCommand`——那条已经废弃，而且在
 * WebKitGTK 上的行为还得另测。
 *
 * ⚠️ `clipboardData` 可能为空（个别环境不给）：那时**什么都不做**、放行原生
 * 行为，而不是"标记成处理了却没写剪贴板"——后者会让用户按了 Ctrl+C 之后
 * 剪贴板里还是上一次的东西，而界面看不出任何异常。
 */
/**
 * 按过键、但那次按键的剪贴板事件**还没被消费掉**的实例。
 *
 * 判据的由来见 {@link 记按键}：WebKitGTK 对同一次按键会派发**两遍**
 * `copy` / `cut`，所以要有一份"这一下按键办过没有"的账。
 */
const keypressNoneHandle = new WeakSet<EditorView>();

/**
 * 剪贴板那两条键的"记账"键位（`Mod-c` / `Mod-x`）。
 *
 * ⚠️ **它什么都不做、也要 `return false`**：返回 `false` 才不会 `preventDefault()`
 * 掉按键——`copy` / `cut` 那两个 DOM 事件正是浏览器对这颗键的**默认动作**，
 * 拦了它们就永远发不出来（2026-10-07 开窗量到的第一课，见
 * {@link 整行剪贴处理}）。
 *
 * 记这笔账是因为**同一次按键会派发两遍**：实测 WebKitGTK 按一下 `Ctrl+X`，
 * `cut` 事件来两次（两次都是 `isTrusted`，中间没有任何 keydown；同一支里
 * `paste` 只来一次），而 `Ctrl+C` 也来两次。复制挨两遍没关系，**剪切挨两遍
 * 就是少两行**——第二遍的光标已经落到被删那一行的下一行，于是顺手再删一行。
 * 症状（实测）：按一下 `Ctrl+X`，代码块里连着少两行，而剪贴板里只有一行。
 *
 * ⚠️ 判据用"有没有一次真的按键"，**不是**时间戳/防抖：那两种都是猜，而这种
 * 错法的代价是**删掉用户的字**。⚠️ 账本按实例记（`WeakSet`）：一个文档里
 * 可能有多个代码块，各挂各的 keymap。
 */
const recordKeypress: Command = (target) => {
  keypressNoneHandle.add(target);
  return false;
};

function dropCutPasteBoard(event: ClipboardEvent, view: EditorView, isCutSplit: boolean): boolean {
  // ⚠️ **先认账**，再决定怎么办：不是新按键的那一遍直接咽掉——文档已经删过了、
  // 剪贴板也写好了，再办一遍就是多删一行。咽的时候要 `preventDefault()`：
  // 不拦的话浏览器会拿它自己那份（此时选区是空的）去动剪贴板与 DOM。
  if (!keypressNoneHandle.has(view)) {
    event.preventDefault();
    return true;
  }
  keypressNoneHandle.delete(view);

  const selectionPlural = view.state.selection.ranges;
  if (selectionPlural.length !== 1 || !selectionPlural[0]!.empty) return false;
  const plan = wholeLineCutPaste(view.state.doc.toString(), selectionPlural[0]!.head, isCutSplit);
  if (!plan) return false;
  if (!event.clipboardData) return false;
  event.clipboardData.setData("text/plain", plan.text2);
  event.preventDefault();
  if (plan.remove) {
    view.dispatch({
      changes: { from: plan.remove.from, to: plan.remove.to },
      selection: EditorSelection.cursor(plan.cursor),
      scrollIntoView: true,
    });
  }
  return true;
}

/**
 * {@link 落剪贴板} 的两条挂载。⚠️ CM 自己**不管**复制/剪切（它靠浏览器默认），
 * 所以**这一段就是它们的主人**——但 2026-10-07 开窗量出：光挂上还不够。
 *
 * ⚠️ **它跑不跑，取决于 `ui/useMenus.ts` 那条全局 accel 放不放行**：那条在
 * `window` 上、`Ctrl+C` / `Ctrl+X` / `Ctrl+V` 都在它的表里，默认路径会
 * `preventDefault()`——而 `preventDefault()` 按死的是**浏览器的默认动作**，
 * 于是 `copy` / `cut` 这两个事件**根本不会发出来**，下面挂的 handler 一次都
 * 跑不到（实测：空选区按 `Ctrl+C`，剪贴板里还是上一次在外面复制的那一篇）。
 * 所以那个文件里有一条按 id 的放行（认的是这颗实例根元素上那个
 * `nota-code-cm`）——两处注释互指，改一边要连着看另一边（`docs/06` §5.55）。
 *
 * ⚠️ **跑到了还会跑到两遍**：WebKitGTK 对同一次按键派发两遍 `copy` / `cut`
 * （实测，两次都是 `isTrusted`，中间没有 keydown），于是 handler 里第一件事
 * 是认 {@link 记按键} 记的那笔账——那一笔的由来与"少两行"的症状都写在那儿。
 */
const wholeLineCutPastePlaceManage = EditorView.domEventHandlers({
  copy: (event, view) => dropCutPasteBoard(event, view, false),
  cut: (event, view) => dropCutPasteBoard(event, view, true),
});


export type codeBlockEditor = {
  /** CM 的根元素，加进 `pre` 里当可见的那一层。 */
  view: EditorView;
  getText: () => string;
  getCursor: () => number;
  /** 从外面换掉整段文本（PM→CM 那条路）。⚠️ 走最小改动，所以光标不会跳。 */
  setText: (text4: string) => void;
  setLanguage2: (language2: string) => void;
  setSelection: (anchor2: number, head2: number) => void;
  clusterFocus: () => void;
  hasFocusPoint: () => boolean;
  cancelDestroy: () => void;
};

export type codeBlockEditorOptions = {
  initialStartText: string;
  initialStartLanguage: string;
  /** CM 里的文本变了（**已经去掉了回声**：由调用方的 `同步中` 那把锁保证）。 */
  textChangeConvert: (newText: string) => void;
  clusterFocus: () => void;
  loseFocus: () => void;
  /** 代码块里按了 Ctrl+Z / Ctrl+Shift+Z。⚠️ 撤销归 ProseMirror，见文件头。 */
  undoCancel: () => void;
  heavyDo: () => void;
  /**
   * 光标在本实例最开头按下退格时的可选钩子。
   *
   * 普通代码块会传入它：在代码框最开头按退格，去掉代码框并保留全部正文。
   * 图表源码框仍可传自己的退出动作。
   */
  openHeadBackCell?: () => void;
};

export function createCodeBlockEditor(option: codeBlockEditorOptions): codeBlockEditor {
  let alreadyCancelDestroy = false;

  /**
   * 回车。
   *
   * ⚠️ **自己写一条，而不是直接用 CM 的 `insertNewlineAndIndent`**：那条在没有
   * 语言文法时（代码块就是这种情况——本仓只装了 markdown 一门 CM 文法）
   * 只会**照抄上一行的缩进**，不会"上一行以 `{` 结尾就再进一级"。
   * 这里把它换成 `回车续行`（纯函数，有用例）＋ 同一个"夹在空括号里就展开"的
   * 口径。写进 keymap 的第一位，压住 `defaultKeymap` 里那一条。
   */
  const returnCarWithShrinkEnter: Command = ({ state, dispatch }) => {
    const main = state.selection.main;
    const line3 = state.doc.lineAt(main.from);
    const prefixText = state.sliceDoc(line3.from, main.from);
    const afterText = state.sliceDoc(main.to, line3.to);
    const { removeManyLess, insert, cursor } = returnCarContinueLine(prefixText, afterText, shrinkEnterWidthDegree);
    const from = main.from - removeManyLess;
    dispatch(
      state.update({
        changes: { from: from, to: main.to, insert: insert },
        selection: EditorSelection.cursor(from + cursor),
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  };

  const undoCancelKey = { key: "Mod-z", run: () => (option.undoCancel(), true) };
  const heavyDoKey = [
    { key: "Shift-Mod-z", run: () => (option.heavyDo(), true) },
    { key: "Mod-y", run: () => (option.heavyDo(), true) },
  ];

  /**
   * 光标那一行的**词区间**（`Ctrl+D` / `Ctrl+Shift+D` 共用）。
   *
   * ⚠️ 判据是 `select.ts` 里那个**与另两种模式共用**的 `选词区间`；⚠️ 只扫
   * **光标所在这一行**（`行界` 那一套与 `source-commands.ts` 同一条口径）：
   * 拿整块代码去扫的话，光标停在行首时会去选**上一行的最后一个词**。
   */
  const cursorPlaceWord = (state: EditorState): range | null => {
    const head2 = state.selection.main.head;
    const line3 = state.doc.lineAt(head2);
    const word = wordRange(line3.text, head2 - line3.from);
    return word && { from: line3.from + word.from, to: line3.from + word.to };
  };

  /** 选当前词（`Ctrl+D`）。⚠️ 与所见即所得那条同判据，理由见文件头。 */
  const selectWordKey: Command = ({ state, dispatch }) => {
    const area = cursorPlaceWord(state);
    if (!area) return false;
    dispatch(state.update({ selection: EditorSelection.range(area.from, area.to), scrollIntoView: true }));
    return true;
  };

  /** 选当前词并删（`Ctrl+Shift+D`）。⚠️ 光标落在删掉那一段的**开头**（同 `select.ts::删词`）。 */
  const removeWordKey: Command = ({ state, dispatch }) => {
    const area = cursorPlaceWord(state);
    if (!area) return false;
    dispatch(
      state.update({
        changes: { from: area.from, to: area.to },
        selection: EditorSelection.cursor(area.from),
        scrollIntoView: true,
      }),
    );
    return true;
  };

  const selectChooseKey: KeyBinding[] = [
    // ⚠️ `Mod-l` / `Mod-d` / `Mod-e` 在 CM 的 `defaultKeymap` 里**都没有**
    //（`Ctrl-e` / `Ctrl-d` 那两条住在 `emacsStyleKeymap`，本仓没装那份），
    // 所以这里不需要"压住谁"——写在这儿是因为**这一段文本的键位归这颗实例**。
    {
      key: "Mod-l",
      run: (target) => {
        // 直接借 CodeMirror 自己那条（源码模式也用它）——"一行"这个概念在
        // 文本上只有一个答案。⚠️ 它选中的是**整行连同末尾那个换行**，
        // 与所见即所得那边（段落内容、不含分隔）不同，理由见 `select.ts` 那一段。
        selectLine(target);
        return true;
      },
    },
    { key: "Mod-d", run: selectWordKey },
    { key: "Mod-Shift-d", run: removeWordKey },
  ];

  // 自动换行那一格（设置 → 编辑器 → 「代码块 → 自动换行」，默认开）。
  // ⚠️ **必须走 CM 自己的开关，不能只靠 CSS**：`pre` 上那条
  // `html[data-code-wrap="off"] { white-space: pre }` 管不到 CM 内部
  //（它的 `.cm-content` 有自己的 `white-space`）。做成一个舱，设置一变就重配，
  // 这样那颗开关在代码块里**真的**是活的——不然就是又一个"拨了不生效的开关"。
  const replaceLineCabin = new Compartment();
  const wantReplaceLine = () => document.documentElement.dataset.codeWrap !== "off";

  const view = new EditorView({
    state: EditorState.create({
      doc: option.initialStartText,
      extensions: [
        configureCorrectTable,
        // ⚠️ 顺序既管优先级也管"谁先试"：我们自己那两条撤销键要在最前
        //（`defaultKeymap` 里没有 `Mod-z`，但先写能保证将来它加了也不打架）。
        keymap.of([
          { key: "Enter", run: returnCarWithShrinkEnter },
          { key: "Shift-Enter", run: returnCarWithShrinkEnter },
          // ⚠️ **退格**：光标在开头时吃掉按键并留在代码框内。2026-10-16 曾把
          // 这一下改成“拆回正文”，但 2026-10-24 用户实测发现光标会跳到页边距；
          // 代码框的输入焦点必须保持稳定。其余位置仍交给 `deleteCharBackward`。
          {
            key: "Backspace",
            run: (target) => {
              const area = target.state.selection.main;
              if (!area.empty || area.from !== 0) return false;
              option.openHeadBackCell?.();
              return true;
            },
          },
          undoCancelKey,
          ...heavyDoKey,
          ...selectChooseKey,
          // ⚠️ 这两条**只记账、不办事**（`记按键` 里有整段理由）：`return false`
          // 才能让浏览器照旧发出 `copy` / `cut`，那才是这两条键的正文。
          { key: "Mod-c", run: recordKeypress },
          { key: "Mod-x", run: recordKeypress },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        closeBrackets(),
        indentUnit.of(shrinkEnterWidthDegree),
        EditorState.tabSize.of(shrinkEnterWidthDegree.length),
        languageField.init(() => option.initialStartLanguage),
        shareColorPlugin,
        drawSelection(),
        wholeLineCutPastePlaceManage,
        // ⚠️ 给这颗实例的根元素挂一个**只属于代码块**的类名：`ui/useMenus.ts`
        // 那条全局 accel 要认它，才知道"剪贴板那几键归里层这个编辑器"
        //（源码模式也是 `.cm-editor`，光按那个认会把源码模式一起放进去）。
        EditorView.editorAttributes.of({ class: "nota-code-cm" }),
        // 当前行那一层淡底（配色在同文件那条 `主题` 里，**与源码模式不是一个色**，
        // 理由见那条注释）。
        highlightActiveLine(),
        replaceLineCabin.of(wantReplaceLine() ? EditorView.lineWrapping : []),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) option.textChangeConvert(u.state.doc.toString());
          if (u.focusChanged) (u.view.hasFocus ? option.clusterFocus : option.loseFocus)();
        }),
      ],
    }),
  });

  const watchSettings = new MutationObserver(() => {
    if (alreadyCancelDestroy) return;
    view.dispatch({ effects: replaceLineCabin.reconfigure(wantReplaceLine() ? EditorView.lineWrapping : []) });
  });
  watchSettings.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-code-wrap"],
  });

  // ⚠️ 长尾语言那一份表（`refractor/all`，~500 kB）是**异步**到的（见
  // `code-block.ts` 顶上那段）。本插件只在文档变化时重算，所以"开机时正开着
  // 一份长尾语言的文档"这一格要靠这条通知补上。⚠️ `import()` 有缓存，
  // 每个代码块各挂一次不会重复下载。
  void import("refractor/all").then(() => {
    if (alreadyCancelDestroy) return;
    try {
      view.dispatch({ effects: heavyComputeEffectResult.of(null) });
    } catch {
      // 视图可能在 resolve 之前就被销毁了（整块被删掉）。不理它。
    }
  });

  return {
    view,
    getText: () => view.state.doc.toString(),
    getCursor: () => view.state.selection.main.head,
    setText: (text4) => {
      const oldValue = view.state.doc.toString();
      if (oldValue === text4) return;
      const { deleteStart, deleteEnd, insert } = computeMostSmallChangeAction(oldValue, text4);
      view.dispatch({ changes: { from: deleteStart, to: deleteEnd, insert: insert } });
    },
    setLanguage2: (language2) => {
      if (view.state.field(languageField) === language2) return;
      view.dispatch({ effects: setLanguageEffectResult.of(language2) });
    },
    setSelection: (anchor2, head2) => {
      const length = view.state.doc.length;
      const clamp = (n: number) => Math.max(0, Math.min(length, n));
      const newValue = EditorSelection.range(clamp(anchor2), clamp(head2));
      const oldValue = view.state.selection.main;
      if (oldValue.anchor === newValue.anchor && oldValue.head === newValue.head) return;
      view.dispatch({ selection: newValue });
    },
    clusterFocus: () => view.focus(),
    hasFocusPoint: () => view.hasFocus,
    cancelDestroy: () => {
      alreadyCancelDestroy = true;
      watchSettings.disconnect();
      view.destroy();
    },
  };
}
