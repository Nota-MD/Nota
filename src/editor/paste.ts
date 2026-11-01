/**
 * **粘贴那一路**：粘进来的东西先过一遍判据，再决定变成什么。
 * 2026-09-28 落地，用户原话：「粘贴 URL 到选中文字→自动包成链接，
 * 粘贴 HTML/Word→转干净 Markdown，粘贴 Markdown 源码→解析成富文本，
 * **粘贴代码→认语言包成代码块**」。
 *
 * # 九条路，判据的顺序是**这份文件的主要设计**
 *
 * | 先判 | 粘的是什么 | 变成什么 |
 * |---|---|---|
 * | ① | 代码块 / 行内代码里 | **什么都不做**（交给浏览器默认的纯文本粘贴） |
 * | ② | 干干净净一条图片网址 | 图片节点 |
 * | ③ | 干干净净一条普通网址 | 链接（选区非空 = 给选中那段挂标记） |
 * | ④ | VS Code 那种带元数据的复制 | **放过**，交给上游 `clipboard` 插件（它认那个格式） |
 * | ⑤ | GFM Markdown 表格 | 真表格，并保留每列对齐 |
 * | ⑥ | 其他明确 Markdown 源码 | 直接用 Markdown 解析器生成节点 |
 * | ⑦ | TSV / CSV 二维数据 | 真表格 |
 * | ⑧ | 看着像代码的纯文本 | 带语言的代码块 |
 * | ⑨ | 其余 | 交给上游：有 HTML 走 HTML，没有就把纯文本**当 Markdown 解析** |
 *
 * ⚠️ **顺序不能换**，每一条都有人踩过：
 *
 * - ① **必须在最前**：代码块里粘网址、粘一段看着像代码的东西，用户要的
 *   就是**原样贴进去**。少了这一条，往 `code_block` 里粘 URL 会得到一个
 *   里面套链接的代码块（存盘出来是 `[https://a](https://a)`，没法看）。
 * - ② 在 ③ **之前**：图片后缀、图片 CDN 与普通网页都可能是合法网址，先判
 *   图片才能把 `photo.png` 放进 image 节点而不是链接。只有空选区自动变图；
 *   选中文字后仍按 ③ 给选中文本挂链接。
 * - ③ 在 ⑦ **之前**：一条网址当然不"像代码"（单行短句那条否决就挡住了），
 *   但把它排前面读起来才不必去推"这两条会不会打架"。
 * - ④ 在 ⑤ **之前**：VS Code 复制的那份 `text/plain` 是**裸代码**，
 *   第 ⑤ 条的启发式也能认出来，但上游那条**认识它的语言**（`vscode-editor-data`
 *   里就写着 `mode: "typescript"`），比我们猜得准。**让准的先来。**
 * - ⑦ 在 ⑧ **之后会失效**：上游 `clipboard` 的 `handlePaste` 只要
 *   `text` 或 `html` 非空就 **`return true`**——它会吃掉每一次粘贴。
 *   所以本插件必须**排在上游前面**（`create.ts` 的 `.use()` 顺序）才轮得到。
 *
 * # ⚠️ 为什么 Markdown 那条不用写解析器
 *
 * "粘贴 Markdown 源码 → 解析成富文本"**上游已经在做了**：`clipboard` 插件
 * 在没有 `text/html` 时走 `parser(text)`，而那个 `parser` 就是 **Markdown**
 * 解析器（`node_modules/@milkdown/plugin-clipboard/lib/index.js:84`）。
 * 所以本文件**一行都不用写**——但这一格必须留个记号，否则下一个人读到这里
 * 会以为"这一条忘了做"，然后照着"补"一遍，把它补坏（重复解析、或者
 * 用 `pasteText` 把富文本贴成纯文本）。
 *
 * # 已知边界（如实记着）
 *
 * - ⚠️ **第 ⑦ 条是启发式，会漏也会错**。判据与代价在 `lang-guess.ts` 的
 *   {@link 像代码} 上（它是个"宁可说不是"的否决制判据）。**猜不出语言
 *   仍然建代码块**（只是不着色，用户点一下选择器就能挑）——
 *   比"猜错了染成八种颜色"好收拾。
 * - ⚠️ **`text/html` 存在时一律不走第 ⑦ 条**：从网页上复制代码会同时带上
 *   `text/html` 与 `text/plain`，那时 HTML 那一份更全（有 `<pre>`、
 *   有语言 class）。走第 ④ 条反而会把富文本降级成"一坨纯文本进代码块"。
 * - ⚠️ **第 ⑦ 条有个体积上限**（{@link 代码粘贴上限}）：超过就**不接管**，
 *   交给上游按 Markdown 贴。上限的理由是**代价不对称**——一小段命令猜错了，
 *   用户按一次 `Ctrl+Z` 就回来了；一份几百 KB 的东西被整块塞进代码块，
 *   那一下先是卡住（`像代码` 要扫全文）、再把整篇文档变成一个代码块，
 *   收拾它的代价远超"少认一次代码"。
 * - ⚠️ **代码块里粘 URL 是纯文本**（第 ① 条），这是**有意**的：
 *   `code_block` 里挂不了 `link` 标记（schema 里那些 marks 的
 *   `inclusive`/`excludes` 不带它进代码块），硬挂的结果是存盘时链接语法
 *   被原样写成方括号。
 */

import { editorViewOptionsCtx, parserCtx } from "@milkdown/kit/core";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Slice, type Node as PMNode, type NodeType } from "@milkdown/kit/prose/model";
import { $prose } from "@milkdown/kit/utils";

import { guessCodeLanguage, looksLikeCode } from "./lang-guess";
import { automaticImageName, imageAddressOfPastedText } from "./image-kind";
import { clearManagePastePasteHTML } from "./paste-clean";
import { pasteAboveUrlTransaction } from "./url-link";
import {
  determineSeparatorLine,
  isTwoRowTable,
  splitTableCells,
  type columnAlignment,
} from "./table-input";

/** 插件键。⚠️ 起了名字才好在上游那一串里认出自己（调试时 `state.plugins` 上看）。 */
export const pastePasteKey = new PluginKey("notaPaste");

/**
 * 第 ④ 条接手的**体积上限**（字符数，也就是 `text/plain` 的 `length`）。
 *
 * ⚠️ 这个数是**抄的 VMark**（`codePaste` 的 `限制` 是 50KB），不是本仓算出来的
 * ——本仓没有实测过"多大开始卡"，所以按"业界有人这么定、方向一致"取用，
 * 并**如实记在这里**：它的依据是"比这个大的东西更应该走 Markdown / HTML 那一路"，
 * 而不是"本仓测出来 50KB 是拐点"。
 */
export const codePasteLimit = 50 * 1024;

/** 一段剪贴板纯文本被识别为二维表时的结果。 */
export interface PastedTable {
  rows: string[][];
  delimiter: "markdown" | "tab" | "comma" | "semicolon";
  align?: columnAlignment[];
}

function splitDelimitedLine(line3: string, delimiter: string): string[] | null {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line3.length; i++) {
    const character = line3[i]!;
    if (quoted) {
      if (character !== '"') {
        current += character;
        continue;
      }
      if (line3[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      quoted = false;
      continue;
    }
    if (character === '"' && current.trim() === "") {
      quoted = true;
      current = "";
      continue;
    }
    if (character === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (quoted) return null;
  cells.push(current.trim());
  return cells;
}

function trimTableOuterEmptyColumns(rows: string[][]): string[][] {
  const width = Math.max(...rows.map((row) => row.length));
  const copy = rows.map((row) => [...row]);
  while (width > 0 && copy.every((row) => (row[width - 1] ?? "") === "")) {
    for (const row of copy) row.length = width - 1;
    return trimTableOuterEmptyColumns(copy);
  }
  return copy;
}

/**
 * 识别剪贴板里的二维表。
 *
 * 表格软件复制到纯文本时用 Tab，CSV 文件用逗号或分号。只有**至少两行、
 * 每行列数一致、至少两列**才接管；普通段落里偶尔出现的逗号不会被拆成表。
 * Markdown 表格源码不在这里处理，继续交给上游解析器，避免丢掉单元格里的
 * 行内标记。
 */
export function recognizePastedTable(text4: string): PastedTable | null {
  if (!text4.trim() || text4.length > codePasteLimit) return null;
  const lines = text4.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "").split("\n");
  if (lines.length < 2 || lines.some((line3) => line3.trim() === "")) return null;
  if (lines.length >= 2 && isTwoRowTable(lines[0] ?? "", lines[1] ?? "")) {
    const header = splitTableCells(lines[0] ?? "").map((cell) => cell.text2);
    const align = determineSeparatorLine(lines[1] ?? "");
    if (!align || header.length !== align.length) return null;
    const body = lines.slice(2).map((line3) =>
      splitTableCells(line3).map((cell) => cell.text2),
    );
    if (body.some((row) => row.length !== header.length)) return null;
    if (body.length === 0) body.push(header.map(() => ""));
    return { rows: [header, ...body], delimiter: "markdown", align };
  }

  const delimiters: ReadonlyArray<[PastedTable["delimiter"], string]> = [
    ["tab", "\t"],
    ["semicolon", ";"],
    ["comma", ","],
  ];
  for (const [delimiter, character] of delimiters) {
    if (!lines.some((line3) => line3.includes(character))) continue;
    const parsed = lines.map((line3) => splitDelimitedLine(line3, character));
    if (parsed.some((row) => row === null)) continue;
    const rows = trimTableOuterEmptyColumns(parsed as string[][]);
    if (rows.length < 2) continue;
    const width = rows[0]?.length ?? 0;
    if (width < 2 || rows.some((row) => row.length !== width)) continue;
    // 普通英文里可能有一两行逗号；至少四格才足以称为“表”，而纯 Tab
    // 本来就是表格软件的高置信信号。
    if (delimiter !== "tab" && rows.length * width < 4) continue;
    return { rows, delimiter };
  }
  return null;
}

/**
 * 单行里仍可高置信判断为代码的几种形状。
 *
 * 多行判断仍归 `looksLikeCode()`；这里只补 JSON、SQL 与明确声明，不把
 * `git status` 这类单行命令硬塞进代码块。
 */
export function looksLikeSingleLineCode(text4: string): boolean {
  const source3 = text4.trim();
  if (!source3 || source3.includes("\n")) return false;
  if (/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)\b/i.test(source3)) return true;
  if (/^(?:const|let|var|function|class|interface|type|def|fn|pub\s+fn)\b/.test(source3)) return true;
  if (/^(?:#include|using\s+namespace|import\s+[\w.{*])/.test(source3)) return true;
  if (/^[\[{]/.test(source3)) {
    try {
      const parsed = JSON.parse(source3) as unknown;
      return parsed !== null && typeof parsed === "object";
    } catch {
      return false;
    }
  }
  return false;
}

/** Markdown 源码应留给上游解析器，不能被“像代码”的启发式抢成围栏。 */
export function looksLikeMarkdownSource(text4: string): boolean {
  const source3 = text4.replace(/\r\n?/g, "\n").trim();
  if (!source3) return false;
  if (/^---\n[\s\S]*\n---(?:\n|$)/.test(source3)) return true;
  if (/^(?:```|~~~)[^\n]*\n[\s\S]*\n(?:```|~~~)\s*$/m.test(source3)) return true;
  const lines = source3.split("\n");
  if (lines.length >= 2 && isTwoRowTable(lines[0] ?? "", lines[1] ?? "")) return true;
  const signals = [
    /^#{1,6}\s+\S/m,
    /^>\s+\S/m,
    /^(?:[-+*]|\d+\.)\s+\S/m,
    /!?\[[^\]]*]\([^)]*\)/m,
  ].filter((rule) => rule.test(source3)).length;
  return signals >= 2;
}

function pasteBecomeTable(
  view: EditorView,
  table: PastedTable,
  parse: (markdown: string) => PMNode,
): boolean {
  const schema = view.state.schema;
  const { table: tableType, table_header_row, table_header, table_row, table_cell, paragraph } = schema.nodes;
  if (!tableType || !table_header_row || !table_header || !table_row || !table_cell || !paragraph) return false;
  const inlineCell = (text4: string) => {
    if (text4 === "") return null;
    try {
      const parsed = parse(text4.replace(/\r\n?/g, "\n"));
      const first2 = parsed.firstChild;
      // 表格单元格在 GFM 里只承载行内内容。把单元格文本再过一次同一套
      // Markdown 解析器，斜体、粗体、行内代码、公式和链接才会真正成为 mark；
      // 直接 `schema.text()` 会把 `*周期*` 这种写法原样印成星号。
      if (first2?.type.name === "paragraph") return first2.content;
    } catch {
      // 单元格里的畸形 Markdown 不该让整张表贴不进来；退回纯文字。
    }
    return schema.text(text4);
  };
  const cell2 = (text4: string, type: NodeType, alignment: columnAlignment = null) =>
    type.create({ alignment }, paragraph.create(null, inlineCell(text4)));
  const [header = [], ...body] = table.rows;
  const headerRow = table_header_row.create(
    null,
    header.map((text4, column) => cell2(text4, table_header, table.align?.[column] ?? null)),
  );
  const bodyRows = body.map((row) =>
    table_row.create(
      null,
      row.map((text4, column) => cell2(text4, table_cell, table.align?.[column] ?? null)),
    ),
  );
  const node = tableType.create(null, [headerRow, ...bodyRows]);
  const insertAt = view.state.selection.from;
  const tr = view.state.tr.replaceSelectionWith(node);
  const firstData = insertAt + 1 + headerRow.nodeSize + 3;
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(firstData, tr.doc.content.size - 1))));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * 插一个代码块，语言是猜出来的那一个。
 *
 * ⚠️ **空语言也是合法值**（`code_block` 的 `language` 默认就是 `""`，
 * 见 `preset-commonmark` 的 `attrs: { language: { default: "" } }`）。
 * 所以猜不出来时不用另外分支——建一个不着色的代码块就行。
 *
 * ⚠️ **落点**：`replaceSelectionWith` 之后光标在代码块**里面**（PM 会把
 * 选区收到插入内容的末尾）。这里不再自己设一次 `TextSelection`——
 * `code-block.ts` 那个 NodeView 会在建视图时把光标摆好，两边都设就是
 * 两套规则打架（症状是"粘完光标跳到别处"）。
 */
function pasteBecomeCodeBlock(view: EditorView, text2: string): boolean {
  const schema = view.state.schema;
  const codeBlock = schema.nodes.code_block;
  if (!codeBlock) return false;
  const language = guessCodeLanguage(text2);
  const node = codeBlock.create({ language: language }, text2 === "" ? undefined : schema.text(text2));
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  return true;
}

/** 把纯文本按 Markdown 解析成真文档节点，而不是先交给 HTML 或代码启发式。 */
function pasteBecomeMarkdown(view: EditorView, parse: (markdown: string) => PMNode, text2: string): boolean {
  const parsed = parse(text2.replace(/\r\n?/g, "\n"));
  if (!parsed || parsed.type.name !== "doc") return false;
  const slice = new Slice(parsed.content, 0, 0);
  try {
    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

/** 把一条图片网址换成一个真正的 image 节点。 */
function pasteBecomeImage(view: EditorView, address: string): boolean {
  const image = view.state.schema.nodes.image;
  const { selection } = view.state;
  if (!image || !selection.empty || !selection.$from.parent.inlineContent) return false;
  const node = image.create({
    src: address,
    alt: automaticImageName(address),
    title: "",
  });
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  return true;
}

/**
 * 挂进 `.use()` 的那一条。**必须排在 `clipboard` 之前**（理由见文件头）。
 */
export function pastePastePlaceManage() {
  return $prose((ctx) => {
    // ⚠️ **洗 HTML 走 `transformPastedHTML`，不走 `handlePaste`**：
    // 上游那条也是这么写的（`editorViewOptionsCtx.update`），两处都改的话
    // 顺序全看谁先跑；只在这一处改，**洗过的结果一定在下游看得到**。
    //
    // ⚠️ `ctx.update` 的回调形状是"拿到上一个值、返回新的"——所以这里
    // **也调一遍 `prev`**（上游那条在里面处理 `docs-internal-guid`）。
    // 本文件排在它**前面**（`.use()` 顺序），于是 `prev` 是空的，
    // 那句调用是空跑；留着它是为了让"谁先谁后"这件事将来变了也不会坏
    //（真要挪到后面，我们就成了 `prev`，它接着洗我们洗过的东西——
    // 那时它的正则匹配不到 `id`（我们已经删了），不会重复处理，安全）。
    ctx.update(editorViewOptionsCtx, (prev) => ({
      ...prev,
      transformPastedHTML: (html: string, view: EditorView) => {
        const first2 = prev.transformPastedHTML ? prev.transformPastedHTML(html, view) : html;
        return clearManagePastePasteHTML(first2).html;
      },
    }));

    return new Plugin({
      key: pastePasteKey,
      props: {
        handlePaste: (view, event) => {
          const numberEvidence = event.clipboardData;
          if (!numberEvidence) return false;
          if (!view.props.editable?.(view.state)) return false;
          // ── ① 代码块 / 行内代码里：原样贴，什么都不接管
          const start4 = view.state.selection.$from;
          if (start4.parent.type.spec.code) return false;
          if (start4.marks().some((m) => m.type.spec.code)) return false;

          const uriList = (numberEvidence.getData("text/uri-list") ?? "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line !== "" && !line.startsWith("#"));
          const plainTextData = numberEvidence.getData("text/plain") ?? "";
          const plainText = plainTextData || (uriList.length === 1 ? (uriList[0] ?? "") : "");
          const html = numberEvidence.getData("text/html");
          const dollarNumberEvidence = numberEvidence.getData("vscode-editor-data");

          // ── ② 干干净净一条图片网址：直接变成图片
          // 只有空选区自动转换；选中文字后粘网址仍沿用下面的“给选中文本加链接”，
          // 避免把用户明确选中的一句话替换掉。
          if (html.length === 0) {
            const imageAddress = imageAddressOfPastedText(plainText);
            if (imageAddress && pasteBecomeImage(view, imageAddress)) return true;
          }

          // ── ③ 干干净净一条普通网址
          if (html.length === 0) {
            const transaction = pasteAboveUrlTransaction(view.state, plainText);
            if (transaction) {
              view.dispatch(transaction.scrollIntoView());
              return true;
            }
          }
          // ── ④ 编辑器自带元数据的复制（VS Code 那边认语言）：让上游接
          if (dollarNumberEvidence) return false;
          // ── ⑤ GFM 表格先单独建原生表格。块级节点直接 replaceSelection
          // 在普通段落里可能被上下文拒绝，因此表格不用通用 Markdown Slice。
          const markdownTable = recognizePastedTable(plainText);
  if (
    markdownTable?.delimiter === "markdown" &&
    pasteBecomeMarkdown(view, ctx.get(parserCtx), plainText)
  ) return true;
          // ── ⑥ 完整 Markdown 源码直接交给 Milkdown 的 Markdown 解析器。
          // 即使剪贴板也带了 text/html，也不能让 HTML 那份吃掉围栏语言；
          // ```math / ```mermaid 等必须按围栏节点落地，而不是字面反引号。
          if (
            looksLikeMarkdownSource(plainText) &&
            pasteBecomeMarkdown(view, ctx.get(parserCtx), plainText)
          ) return true;
          // ── ⑦ Tab / CSV 纯文本：高置信二维数据直接建表。
          if (html.length === 0) {
            const pasted = recognizePastedTable(plainText);
            if (pasted && pasteBecomeTable(view, pasted, ctx.get(parserCtx))) return true;
          }
          // ── ⑧ 看着像代码的**纯文本**（超上限的不碰，理由见文件头）
          if (
            html.length === 0 &&
            plainText.length <= codePasteLimit &&
            plainText.trim() !== "" &&
            (looksLikeCode(plainText) || looksLikeSingleLineCode(plainText))
          ) {
            return pasteBecomeCodeBlock(view, plainText.replace(/\r\n?/g, "\n"));
          }
          // ── ⑨ 其余交给上游（HTML 走 DOM；纯文本被当 Markdown 解析）
          return false;
        },
      },
    });
  });
}

/**
 * ⚠️ **源码模式（CodeMirror）那一侧整份文件都用不上**：那边没有文档树，
 * 粘什么都是原样的文本。
 *
 * ⚠️ 于是"粘贴 Markdown 源码 → 富文本"这条在源码模式下**不成立**——
 * 而那是**正确**的：用户在源码模式里要的就是源码。这条边界属于
 * `ui/EditorPane.tsx` 那两条通路（所见即所得 / 源码）的差异清单，
 * 写在这里是为了让它出现在"读这个文件的人一定会看到"的地方。
 */
