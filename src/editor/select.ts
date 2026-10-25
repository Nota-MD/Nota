/**
 * 「选择」这一族命令（2026-10-07）：**选当前行 / 选当前词 / 选当前句 / 选词并删**。
 *
 * # 它为什么单开一个文件
 *
 * 与 `insert.ts` 同一条理由：`command-table.ts` 那张表是一行一条的**映射**，
 * 而这几条要先看一眼光标在哪一段、再把"段内偏移"换算成文档位置——塞进那张表
 * 就成了清单里夹着算法。⚠️ 入口仍然只有 `command-table.ts` 那一个（界面层
 * 不许直接调本文件，见 `create.ts` 顶上那条纪律）。
 *
 * # 两层的分法：**纯算术**与**落选区**
 *
 * 下面分成三组，是**为了让判据能被测试**（本仓没有 jsdom，建不出真的
 * `EditorView`，见 `tests/fake-dom.ts` 文件头）：
 *
 * | 组 | 吃什么 | 谁能测 |
 * |---|---|---|
 * | {@link 选词区间} / {@link 选句区间} | 一段**纯文本** ＋ 一个字符偏移 | `tests/select.test.ts` |
 * | {@link 行区间} / {@link 词区间} / {@link 句区间} | 一棵 **ProseMirror 文档** ＋ 一个位置 | 同上（`Schema` 就够了） |
 * | {@link 选行} / {@link 选词} / {@link 选句} / {@link 删词} | 一个 `Editor` | 开窗目检（`docs/06`） |
 *
 * ⚠️ 第二组是**薄薄一层换算**，一行都不许多做：把块首那几个字符的差补上。
 * 真正"哪个字算一个词"的判据全在第一组——两种模式共用它。
 *
 * # ⚠️ 为什么源码模式与所见即所得**共用**第一组
 *
 * 源码模式手里就是 Markdown 原文，本可以直接用 CodeMirror 的 `wordAt`。不用的
 * 理由与 `insertText` 那条一模一样（见 `command-table.ts`）：同一颗键在两种模式
 * 下选出来的东西**必须一样**，不然用户迟早撞上"切一下模式，同一个词选得不一样"
 * 那种说不清是谁的错的差别。所以两边都调 {@link 选词区间}。
 *
 * # ⚠️ 代码块里**什么都不做**（所见即所得那边）
 *
 * 代码块在 PM 眼里是一个节点，可**光标和选区其实住在里层那颗 CodeMirror 上**
 * （`code-block.ts` 的 NodeView）。PM 这边设一个"在代码块节点里"的选区，屏幕
 * 上什么都不会亮——用户按下去像键坏了。所以 {@link 行区间} 那一族**认了代码块
 * 就返回 `null`**（`spec.code`），代码块里的这几颗键由 `code-block-cm.ts` 自己
 * 那套键位接着（它的选区归它自己管）。
 *
 * # ⚠️ 行内原子要**占一个字符**
 *
 * "段内偏移"要能一对一地换算成文档位置，前提是**文本的长度与位置数相等**。
 * 图片、公式、硬换行这些**行内叶子**在文档里各占**一个位置**，而 `textBetween`
 * 默认给它们空串——那样算出来的偏移会整体错位。所以这里传一个 `leafText`：
 * 硬换行给 `"\n"`（它本来就是一个换行，句读扫描要认它），其余给 U+FFFC
 * （一个**不是**词、也不是句读的字符）。两样都正好一个字符。
 */

import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** 一段区间：`from` 含、`to` 不含。 */
export interface range {
  from: number;
  to: number;
}

/* ══ 第一组：纯文本层的判据（两种模式共用，见文件头）══════════════════════ */

/** 行内叶子的替身。`U+FFFC`（OBJECT REPLACEMENT CHARACTER）不是词、不是句读。 */
const atomPlaceholder = "￼";

/**
 * 分词器。**有没有随环境变**（WebKit 老版本、精简 ICU 的 Node 都可能没有），
 * 所以取一次记住，没有就退回 {@link 词正则}。
 *
 * ⚠️ 一次不是懒加载的优化，是 `Intl.Segmenter` 的**语义**：它按语言规则分词
 * （中文按词典切、英文按词形切），每次新建一份没有意义。⚠️ 语言给 `undefined`
 * 表示"按运行环境的默认语言"——本应用没有"文档语言"这个概念，用系统默认是对的。
 */
let shareParagraphDevice: Intl.Segmenter | null | undefined;

function getShareParagraphDevice(): Intl.Segmenter | null {
  if (shareParagraphDevice !== undefined) return shareParagraphDevice;
  try {
    shareParagraphDevice = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;
  } catch {
    // 建不出来（个别环境的 ICU 会抛）也不该让整条命令倒下——退回正则那一支。
    shareParagraphDevice = null;
  }
  return shareParagraphDevice;
}

/** 没有分词器时的兜底：字母/数字/下划线连成一段。⚠️ 中文会**整段**连成一"词"。 */
const wordCorrectRule = /[\p{L}\p{N}_]+/gu;

function clamp(value2: number, below: number, above: number): number {
  return Math.max(below, Math.min(value2, above));
}

/**
 * 从一串**候选词**里挑出光标该落在哪一个（三条判据，按顺序）：
 *
 * 1. 光标在某个词**里面** → 就是它；
 * 2. 光标**贴着某个词的尾巴**（`你好|`、`hello| world` 那种）→ 还是那个词；
 * 3. 光标在空白里（哪个词里都不在）→ 拿**前一个**词；前面没有词就拿**后一个**。
 *
 * ⚠️ 第 2 条是"按 Ctrl+D 的那一下"最常撞上的位置：用户刚敲完一个词、光标就
 * 停在词尾，此时它**不在**词里（半开区间 `[from, to)`），少了这一条就会去选
 * 下一个词——而用户明明指着刚敲的那一个。
 *
 * 候选**必须是按顺序给的**（后一个的 `from` 比前一个大），第 3 条靠这个顺序。
 *
 * ⚠️ 收的是 `Iterable` 而不是数组：源码模式那边喂进来的可能是整篇文本，
 * 而**挑到就该停**——物化成一整张候选表再去挑，是替一次按键把全篇都分一遍词。
 */
function pickWord(candidate: Iterable<range>, position3: number): range | null {
  let before2: range | null = null;
  for (const word of candidate) {
    if (position3 >= word.from && position3 < word.to) return word;
    // ⚠️ 判据是 `<=`（"整个词都在前面"），不是 `===`（"正好贴着它尾巴"）：
    // 空白**不止一格**（`"hello  world"` 里光标停在第 2 个空格上）时，
    // `===` 会让 `前` 一直是空的，第 3 条于是给出**后一个**词——而"光标
    // 在空白里往前找一个词"是这条命令的本意（见文件头那把三条判据）。
    if (word.to <= position3) before2 = word;
    else if (word.from > position3) return before2 ?? word;
  }
  return before2;
}

/** 分词器那一支的候选（**懒**的，见 {@link 挑词}）。`isWordLike` 是分词器自己的判据。 */
function* shareWordDeviceCandidate(text2: string, paragraph2: Intl.Segmenter): Generator<range> {
  for (const value of paragraph2.segment(text2)) {
    if (value.isWordLike) yield { from: value.index, to: value.index + value.segment.length };
  }
}

/** 兜底那一支的候选（同样懒）。 */
function* correctRuleCandidate(text2: string): Generator<range> {
  for (const match2 of text2.matchAll(wordCorrectRule)) {
    yield { from: match2.index, to: match2.index + match2[0].length };
  }
}

/** 一段纯文本里，`位置` 处那个**词**的区间。没有词（空文、纯空白、纯标点）给 `null`。 */
export function wordRange(text2: string, position2: number): range | null {
  if (!text2) return null;
  const position3 = clamp(position2, 0, text2.length);
  const paragraph2 = getShareParagraphDevice();
  return pickWord(paragraph2 ? shareWordDeviceCandidate(text2, paragraph2) : correctRuleCandidate(text2), position3);
}

/**
 * 句读——**一个句子的结束符**。中文那几个之外还认半角 `! ? ;`（用户可能中英混
 * 排），以及 `\n`（一行至少是一句）。
 *
 * ⚠️ **逗号、顿号不算**。它们分的是短语，不是句子；认了它们，一句中文里随便
 * 一按就只选中半截，而英文里逗号更多——"选句"会退化成"选到下一个逗号"。
 * ⚠️ 句号（半角 `.`）**单独判**，见 {@link 是句读}。
 */
const sentenceReadCollection = new Set(["。", "！", "？", "…", "；", "!", "?", ";", "\n"]);

function isNumberCharacter(character2: string | undefined): boolean {
  return character2 !== undefined && character2 >= "0" && character2 <= "9";
}

/**
 * `文本[i]` 是不是句读。
 *
 * ⚠️ `.` 要**躲开小数点**：`3.14` 里那个点两边都是数字，它不是句读。不做这一条
 * 的话"选句"会在小数中间断掉，而那种错很难被想到（它不是崩，是选短了）。
 * ⚠️ 缩写（`Fig. 1`）**不躲**——那需要一部缩写词典，本仓不做；认它当句尾是
 * 可接受的偏差，如实记在这儿。
 */
function isSentenceRead(text2: string, i: number): boolean {
  const character2 = text2[i];
  if (character2 === undefined) return false;
  if (character2 === ".") return !(isNumberCharacter(text2[i - 1]) && isNumberCharacter(text2[i + 1]));
  return sentenceReadCollection.has(character2);
}

function isWhitespace(character2: string | undefined): boolean {
  return character2 !== undefined && /\s/.test(character2);
}

/**
 * 收边：把两头多余的空白切掉，切完是空区间就给 `null`（"这里没有句子"）。
 *
 * ⚠️ 收边**必须在算完起止之后统一做一次**：起点前面那几个空格、结尾那个换行
 * 都得切——切不干净的症状是"选中之后一敲字，后面的行被并上来了"（`\n` 被删了）。
 */
function receiveEdge(text2: string, start5: number, end3: number): range | null {
  let head2 = start5;
  let tail = end3;
  while (head2 < tail && isWhitespace(text2[head2])) head2++;
  while (tail > head2 && isWhitespace(text2[tail - 1])) tail--;
  return tail > head2 ? { from: head2, to: tail } : null;
}

/** 光标往前收一句：句尾是 `句尾`（那个句读的下标 + 1）。 */
function towardReturnOneSentence(text2: string, sentenceTail: number): range | null {
  let start5 = 0;
  for (let i = sentenceTail - 2; i >= 0; i--) {
    if (isSentenceRead(text2, i)) {
      start5 = i + 1;
      break;
    }
  }
  return receiveEdge(text2, start5, sentenceTail);
}

/**
 * 一段纯文本里，`位置` 处那一**句**的区间。算不出来（空文、只剩空白）给 `null`。
 *
 * 两条路：
 * - 光标**正好贴着一个句读的后面**（刚写完 `你好。|` 那种，最常见）→ 收**刚过去
 *   那一句**，连它自己的句号一起。少了这一步，用户敲完一句立刻按 Ctrl+E 会
 *   选到**下一句**去——那是这条命令最容易让人觉得"坏了"的地方。
 * - 其余情况 → 光标所在那一句：往左找到最近的句读（不含），往右找到最近的句读
 *   （含它，除了 `\n`——换行不跟着选，理由见 {@link 收边}）。
 */
export function sentenceRange(text2: string, position2: number): range | null {
  if (!text2) return null;
  const position3 = clamp(position2, 0, text2.length);
  if (position3 > 0 && isSentenceRead(text2, position3 - 1)) {
    const returnHead = towardReturnOneSentence(text2, position3);
    if (returnHead) return returnHead;
    // ⚠️ 收不出来（连着两个句读、前面只有空白）就往下走，别在这里返回空。
  }
  let start5 = 0;
  for (let i = position3 - 1; i >= 0; i--) {
    if (isSentenceRead(text2, i)) {
      start5 = i + 1;
      break;
    }
  }
  let end3 = text2.length;
  for (let j = position3; j < text2.length; j++) {
    if (isSentenceRead(text2, j)) {
      // ⚠️ 换行**不跟着选**：选进去的话，选中之后一敲字，下一行就被并上来了。
      end3 = text2[j] === "\n" ? j : j + 1;
      break;
    }
  }
  return receiveEdge(text2, start5, end3);
}

/* ══ 第二组：ProseMirror 层的换算 ══════════════════════════════════════════ */

/**
 * 把光标所在的**文本块**摊成"纯文本 ＋ 段内偏移"，给上面那一组判据用。
 *
 * ⚠️ 三条出口：块不是文本块（表格里的 `table_row`、图片那类原子块）、块是
 * 代码块（见文件头）、位置在文档之外（理论上不会有）。
 */
function expandBlock(doc: PMNode, position2: number): { block: PMNode; text4: string; position3: number; start4: number } | null {
  const $pos = doc.resolve(clamp(position2, 0, doc.content.size));
  const block = $pos.parent;
  if (!block.isTextblock || block.type.spec.code) return null;
  const text4 = block.textBetween(0, block.content.size, undefined, (leaf) =>
    leaf.type.name === "hardbreak" ? "\n" : atomPlaceholder,
  );
  return { block, text4, position3: $pos.parentOffset, start4: $pos.start() };
}

/** 光标所在那一段的**整段文字**区间（`Ctrl+L`）。空段落给 `null`。 */
export function lineRange(doc: PMNode, position2: number): range | null {
  const flatten = expandBlock(doc, position2);
  if (!flatten || flatten.block.content.size === 0) return null;
  return { from: flatten.start4, to: flatten.start4 + flatten.block.content.size };
}

/** 光标所在那个**词**的区间（`Ctrl+D`）。 */
export function wordRange2(doc: PMNode, position2: number): range | null {
  const flatten = expandBlock(doc, position2);
  if (!flatten) return null;
  const area = wordRange(flatten.text4, flatten.position3);
  return area && { from: flatten.start4 + area.from, to: flatten.start4 + area.to };
}

/** 光标所在那一**句**的区间（`Ctrl+E`）。 */
export function sentenceRange2(doc: PMNode, position2: number): range | null {
  const flatten = expandBlock(doc, position2);
  if (!flatten) return null;
  const area = sentenceRange(flatten.text4, flatten.position3);
  return area && { from: flatten.start4 + area.from, to: flatten.start4 + area.to };
}

/* ══ 第三组：四条命令（落到真编辑器上）══════════════════════════════════ */

/**
 * 把算出来的区间落成选区。⚠️ 空区间/`null` 一律**什么都不做**：那不是错，
 * 是"这里没有东西可选"（空段落、纯空白）。派一笔空事务反而会把撤销栈搞脏。
 */
function dropSelection(view: EditorView, area: range | null): void {
  if (!area || area.from >= area.to) return;
  const { state } = view;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, area.from, area.to)));
}

/** 选当前**行**（`Ctrl+L`）。 */
export function selectLine(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    dropSelection(view, lineRange(view.state.doc, view.state.selection.from));
  });
}

/** 选当前**词**（`Ctrl+D`）。 */
export function selectWord(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    dropSelection(view, wordRange2(view.state.doc, view.state.selection.from));
  });
}

/** 选当前**句**（`Ctrl+E`）。 */
export function selectSentence(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    dropSelection(view, sentenceRange2(view.state.doc, view.state.selection.from));
  });
}

/**
 * 选当前词**并删掉**（`Ctrl+Shift+D`）。
 *
 * ⚠️ **已经有选区时删的是那个选区**，不再去找词：用户既然已经选好了，"
 * 再把选区挪到附近某个词上"只会让他按第二下时删错东西。这条与
 * {@link 删词} 的另一个调用点（菜单）是同一件事——菜单上那一条的判据与键位一致。
 */
export function removeWord(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const select = state.selection;
    const area = select.empty ? wordRange2(state.doc, select.from) : { from: select.from, to: select.to };
    if (!area || area.from >= area.to) return;
    // ⚠️ 光标落在**删掉的那一段的开头**（不是结尾）：中文写作里删掉一个词之后
    // 接着敲的往往是新词，落在原地比跳到别处稳。
    const tr = state.tr.delete(area.from, area.to);
    view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(area.from))));
  });
}
