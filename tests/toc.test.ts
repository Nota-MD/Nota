/**
 * `src/editor/toc.ts`（内容目录：锚点、生成、查找、插入/更新事务）的**可运行**测试集。
 * 2026-09-27 写，与那个文件同批落地（`docs/10-feature-matrix.md` §1「目录（TOC）」）。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/toc.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/toc.mjs
 * node /tmp/nota-测试/toc.mjs
 * ```
 *
 * ⚠️ **esbuild 报错时旧 bundle 还在**，`node` 跑出来的是上一版结果。先看
 * esbuild 那行有没有 `error`（`inline-marks.test.ts` 的文件头记过这个坑）。
 *
 * # 四组判据
 *
 * - **一、锚点**（纯函数）：GitHub 那套规矩。它是全篇唯一一处"会决定导出文件
 *   点不点得动"的算法，所以边界单列：大小写、空白折连字符、标点去掉、
 *   中日韩**保留**、重名加 `-1`/`-2`、全是 emoji 时兜底。
 * - **二、生成目录**：缩进按**相对层级**（从 `##` 开头不该整个缩进一格）、
 *   方括号转义、一个标题都没有时给 `null`。
 * - **三、找/替换**（纯文本）：一对标记之间那一段。
 * - **四、目录事务**（真 `EditorState` ＋ 真 schema）：插在哪、已有目录时是
 *   "只换中段"而不是"再插一份"、内容一样时**不派事务**、标记缺一半时当没有。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **真编辑器的 schema 没验**：这里的 schema 是手搓的最小版（`doc` /
 *   `paragraph` / `heading` / `bullet_list` / `list_item` / `text` ＋
 *   `notaHtmlBlock` ＋ `link` mark），少了引用、表格、代码块那一堆。
 * - **界面那一条路没验**：菜单项亮不亮（`ui/useMenus.ts` 的 `光标条件` 与
 *   `editor/command-state.ts` 的 `hasHeadings`）、点了以后 `create.ts` 的
 *   `COMMANDS` 表有没有接上——那两处是 `npx tsc --noEmit` 与开窗目检的事。
 * - **导出那一侧的锚点没验**：`editor/export.ts::摘正文` 里给 `<h1..h6>` 补
 *   `id` 那一段跑不起来（要真 DOM ＋ 真编辑器实例）。这里只验了**同一个
 *   `锚点()` 函数**——两处引用的是同一个实现，这一点由 import 保证，不由断言保证。
 * - **编辑区里点目录里的链接不会跳**（`toc.ts` 文件头那条已知边界），所以
 *   "能不能跳"这件事没有可验的东西。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import type { MarkdownNode } from "@milkdown/kit/transformer";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import { blockHTMLConvertReplace, blockHtmlNodeName } from "../src/editor/html-block";
import { tocTransaction } from "../src/editor/insert";
import { extractOutline } from "../src/editor/headings";
import {
  generateBecomeItemRecord,
  computeItemRecordBlock,
  findItemRecord,
  replaceReplaceItemRecord,
  tocBlockText,
  tocStartMarker,
  tocEndMarker,
  anchor,
} from "../src/editor/toc";

/* ── 最小工装 ─────────────────────────────────────────────────────────── */

let passed = 0;
let failure = 0;
const failureList: string[] = [];
let currentGroup = "";

function group(name3: string): void {
  currentGroup = name3;
  console.log(`\n── ${name3} ${"─".repeat(Math.max(0, 56 - name3.length))}`);
}

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failure++;
    failureList.push(`${currentGroup} / ${name}`);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function equal(actual: unknown, expected: unknown, description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}：期望 ${b}，实际 ${a}`);
}

function assertValue(value2: boolean, description: string): void {
  if (!value2) throw new Error(description);
}

/* ── schema：形状照 `preset-commonmark` 抄，少了别的块 ────────────────── */

/**
 * ⚠️ 每一颗的 `group` / `content` / `attrs` / mdast 处理器都是**照抄**
 * `preset-commonmark/lib/index.js` 的（行号在该文件里逐条找得到），一个字没改：
 * 目录那一块是**一段真的 markdown 列表**，形状不对的话"插进去以后还是不是
 * 一份列表"这件事在这里验不出真结果。
 *
 * ⚠️ `notaHtmlBlock` 那一颗抄的是本仓 `html-block.ts` 的 `块HTML规格`
 * （两头那对标记就是它）——⚠️ 它的 `group` 必须是 `"block"`：`doc.content`
 * 是 `"block+"`，写成 `inline` 的话**整篇打不开**。
 */
const schema = new Schema({
  nodes: {
    doc: {
      content: "block+",
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "root",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) =>
          state.injectRoot(node, type as never),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "doc",
        // ⚠️ **这里不许有 `closeNode()`**（`root` 那一层归
        // `SerializerState.build()` 自己收）。`html-block.test.ts` 记着这条踩过的坑。
        runner: (state: SerializerState, node: PMNode) => {
          state.openNode("root");
          state.next(node.content);
        },
      },
    },
    paragraph: {
      content: "inline*",
      group: "block",
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "paragraph",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) => {
          state.openNode(type as never);
          state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "paragraph",
        runner: (state: SerializerState, node: PMNode) => {
          state.openNode("paragraph");
          state.next(node.content);
          state.closeNode();
        },
      },
    },
    /** `preset-commonmark` 的 `headingSchema`（少了那个 `id` 属性，本文件不用）。 */
    heading: {
      content: "inline*",
      group: "block",
      defining: true,
      attrs: { level: { default: 1 } },
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "heading",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) => {
          state.openNode(type as never, { level: node.depth as number });
          state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "heading",
        runner: (state: SerializerState, node: PMNode) => {
          state.openNode("heading", undefined, { depth: node.attrs.level as number });
          state.next(node.content);
          state.closeNode();
        },
      },
    },
    bullet_list: {
      content: "list_item+",
      group: "block",
      attrs: { spread: { default: false } },
      parseMarkdown: {
        match: ({ type, ordered }: MarkdownNode) => type === "list" && !ordered,
        runner: (state: ParserState, node: MarkdownNode, type: unknown) => {
          state.openNode(type as never, { spread: (node.spread as boolean) ?? false });
          state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "bullet_list",
        runner: (state: SerializerState, node: PMNode) => {
          state.openNode("list", undefined, { ordered: false, spread: node.attrs.spread });
          state.next(node.content);
          state.closeNode();
        },
      },
    },
    list_item: {
      group: "listItem",
      content: "paragraph block*",
      defining: true,
      attrs: {
        label: { default: "•" },
        listType: { default: "bullet" },
        spread: { default: true },
      },
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "listItem",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) => {
          const label = node.label != null ? `${node.label}.` : "•";
          state.openNode(type as never, {
            label,
            listType: node.label != null ? "ordered" : "bullet",
            spread: (node.spread as boolean) ?? true,
          });
          state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "list_item",
        runner: (state: SerializerState, node: PMNode) => {
          state.openNode("listItem", undefined, { spread: node.attrs.spread });
          state.next(node.content);
          state.closeNode();
        },
      },
    },
    /** 两头那对标记住的节点。形状照本仓 `html-block.ts` 的 `块HTML规格`。 */
    notaHtmlBlock: {
      group: "block",
      atom: true,
      defining: true,
      attrs: { value: { default: "" } },
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === blockHtmlNodeName,
        runner: (state: ParserState, node: MarkdownNode, type: unknown) =>
          state.addNode(type as never, { value: node.value ?? "" }),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === blockHtmlNodeName,
        runner: (state: SerializerState, node: PMNode) =>
          state.addNode("html", undefined, node.attrs.value as string),
      },
    },
    /** 行内 `html`（preset 的 `htmlSchema` 等价物）。目录用不到，少了它会解析报错。 */
    html: {
      atom: true,
      group: "inline",
      inline: true,
      attrs: { value: { default: "" } },
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "html",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) =>
          state.addNode(type as never, { value: node.value }),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "html",
        runner: (state: SerializerState, node: PMNode) =>
          state.addNode("html", undefined, node.attrs.value as string),
      },
    },
    text: {
      group: "inline",
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "text",
        runner: (state: ParserState, node: MarkdownNode) => state.addText(node.value as string),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "text",
        runner: (state: SerializerState, node: PMNode) =>
          state.addNode("text", undefined, node.text as string),
      },
    },
  },
  marks: {
    /** `preset-commonmark` 的 `linkSchema`（DOM 那两件本文件用不到，没抄）。 */
    link: {
      attrs: { href: { default: null }, title: { default: null } },
      inclusive: false,
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "link",
        runner: (
          state: ParserState,
          node: MarkdownNode,
          markType: unknown,
        ) => {
          state.openMark(markType as never, { href: node.url, title: node.title });
          state.next(node.children as MarkdownNode[]);
          state.closeMark(markType as never);
        },
      },
      toMarkdown: {
        match: (mark: { type: { name: string } }) => mark.type.name === "link",
        runner: (
          state: SerializerState,
          mark: { attrs: { href: unknown; title: unknown } },
        ) => {
          // mdast 的链接处理器要的是 `url` / `title` 两个名字（`link` 那半在
          // `mdast-util-to-markdown/lib/handle/link.js`）。
          state.withMark(mark as never, "link", undefined, {
            title: mark.attrs.title,
            url: mark.attrs.href,
          });
        },
      },
    },
  },
});

/**
 * 一台真处理机：`remark-parse` ＋ 本仓那个块级 HTML 转换器 ＋ `remark-stringify`。
 *
 * ⚠️ `{ bullet: "-" }` **要与 `create.ts` 里那份序列化选项一致**：那边把
 * 列表记号钉成 `-`（`remark` 的默认是 `*`，"打开再存一次，diff 里全是这种行"
 * 是用户 2026-09-24 明令不许的）。不钉的话这里序列化出来是 `* [甲](#甲)`，
 * 与产品存盘写出来的**不是一个字节**——测试就失真了。
 * （**踩过**：2026-09-27 第一版没钉，断言里看到的全是 `*`。）
 */
function createPlaceManageMachine() {
  return unified()
    .use(remarkParse)
    .use(() => (tree: unknown) => blockHTMLConvertReplace(tree as MarkdownNode))
    .use(remarkStringify, { bullet: "-" });
}

const machine = createPlaceManageMachine();

/** 一整篇 markdown → 文档树。 */
function parse(source3: string): PMNode {
  return ParserState.create(schema, machine)(source3) as unknown as PMNode;
}

/** 文档树 → 一整篇 markdown（`目录事务` 要的就是这一对）。 */
function serialize(node: PMNode): string {
  return SerializerState.create(schema, machine)(node);
}

/** 顶层节点的类型名，读起来方便。 */
function topLayerType(node: PMNode): string[] {
  const output2: string[] = [];
  node.forEach((n: PMNode) => output2.push(n.type.name));
  return output2;
}

/**
 * 把文档里**那份目录列表**读成 `[层数, 文字]`。
 *
 * ⚠️ 断言看的是**结构**（谁在谁下面），不是"序列化出来那一行长什么样"：
 * 记号字符由序列化器的选项说了算，拿它去比会把"记号换了一个"当成功能坏了。
 * 这里要比也是比**嵌套层数**——那才是"缩进对不对"这件事本身。
 */
function columnTableItem(node: PMNode): [number, string][] {
  const output2: [number, string][] = [];
  const walk = (n: PMNode, layer: number): void => {
    if (n.type.name === "list_item") {
      // ⚠️ 用**第一个孩子**（`list_item` 的 content 是 `paragraph block*`）而不是
      // `n.textContent`：后者会把嵌套在里面的子列也一起读进来，
      // 顶层那一条会变成「甲乙」（第一版就是这么写的，断言里看得一清二楚）。
      output2.push([layer, n.firstChild?.textContent ?? ""]);
      n.forEach((c: PMNode) => {
        if (c.type.name === "bullet_list") c.forEach((i: PMNode) => walk(i, layer + 1));
      });
      return;
    }
    n.forEach((c: PMNode) => walk(c, layer));
  };
  node.forEach((n: PMNode) => {
    if (n.type.name === "bullet_list") walk(n, 0);
  });
  return output2;
}

/* ── 一、锚点 ─────────────────────────────────────────────────────────── */

group("一、锚点（照 GitHub 那套）");

testCase("全小写、空白折成一个连字符", () => {
  equal(anchor("Hello World", new Set()), "hello-world", "基本形状");
  equal(anchor("  Hello   World  ", new Set()), "hello-world", "两边空白先 trim");
});

testCase("标点去掉，连字符与下划线留着", () => {
  equal(anchor("什么是「爱」？", new Set()), "什么是爱", "中文标点去掉");
  equal(anchor("a.b, c!d", new Set()), "ab-cd", "拉丁标点去掉");
  equal(anchor("a-b_c", new Set()), "a-b_c", "`-` 与 `_` 是允许的字符");
});

testCase("中日韩保留（不是 `a-z0-9` 那种写法）", () => {
  equal(anchor("第三章 小结", new Set()), "第三章-小结", "中文标题不该变成空锚点");
});

testCase("重名按出现顺序加 `-1` / `-2`", () => {
  const alreadyUse = new Set<string>();
  equal([anchor("小结", alreadyUse), anchor("小结", alreadyUse), anchor("小结", alreadyUse)], ["小结", "小结-1", "小结-2"], "三次同名");
});

testCase("去重只在**传进来的那个集合**里算（两次独立调用互不影响）", () => {
  const alpha = new Set<string>();
  const beta = new Set<string>();
  equal([anchor("小结", alpha), anchor("小结", beta)], ["小结", "小结"], "各算各的");
});

testCase("全被滤掉时兜底给 `section`（空锚点在 HTML 里等于没写）", () => {
  equal(anchor("🎉🚀", new Set()), "section", "纯 emoji");
  equal(anchor("   ", new Set()), "section", "纯空白");
  equal(anchor("!!!", new Set()), "section", "纯标点");
});

/* ── 二、生成目录 ─────────────────────────────────────────────────────── */

group("二、生成目录");

testCase("一个标题都没有 → `null`（菜单项据此变灰）", () => {
  equal(generateBecomeItemRecord([]), null, "空表");
  equal(computeItemRecordBlock("正文一段。\n", false), null, "有正文没标题");
});

testCase("缩进按**相对层级**：从 `##` 开头的一份文档不整个缩进一格", () => {
  const twoStart = extractOutline("## 甲\n\n### 乙\n\n## 丙\n", false);
  equal(
    generateBecomeItemRecord(twoStart),
    ["- [甲](#甲)", "  - [乙](#乙)", "- [丙](#丙)"].join("\n"),
    "最浅的那一级 `-` 顶格",
  );
});

testCase("层级跳跃（`#` 直接到 `###`）不报错，缩进按差值", () => {
  const jump = extractOutline("# 甲\n\n### 丙\n", false);
  equal(generateBecomeItemRecord(jump), ["- [甲](#甲)", "    - [丙](#丙)"].join("\n"), "差两级缩四格");
});

testCase("标题里的方括号被转义（否则链接会被拆散）", () => {
  const square = extractOutline("# 甲[乙]\n", false);
  equal(generateBecomeItemRecord(square), "- [甲\\[乙\\]](#甲乙)", "中括号转义，锚点里没有它们");
});

testCase("重名标题在目录里也是 `-1`", () => {
  const heavy = extractOutline("# 小结\n\n## 小结\n", false);
  equal(generateBecomeItemRecord(heavy), ["- [小结](#小结)", "  - [小结](#小结-1)"].join("\n"), "第二个加了后缀");
});

testCase("一块完整的目录：两头标记、上下各空一行", () => {
  const block = computeItemRecordBlock("# 甲\n", false);
  equal(block, `${tocStartMarker}\n\n- [甲](#甲)\n\n${tocEndMarker}`, "块文本");
  equal(tocBlockText("- [甲](#甲)"), block, "`目录块文本` 与 `算目录块` 拼出来的是同一个");
});

testCase("严格模式：`#标签` 不算标题（与侧栏「大纲」同一份判据）", () => {
  equal(computeItemRecordBlock("#标签\n", true), null, "严格档下一个标题都没有");
  assertValue(computeItemRecordBlock("#标签\n", false) !== null, "宽松档下算一个标题");
});

/* ── 二½、front matter 判据合并（第 63 项，2026-10-04）────────────────── */

group("二½、front matter：大纲与编辑器用同一份严判据");

testCase("真 front matter（闭栏 ＋ 映射行）整个跳过，标题行号按整篇文档算", () => {
  const article = extractOutline("---\ntitle: 甲\n---\n\n# 正文\n", false);
  equal(article.length, 1, "front matter 里的 `title:` 不是标题");
  equal(article[0]!.line, 4, "行号是整篇文档的（含 front matter 那四行）");
});

testCase("`...` 收尾也算 front matter（YAML 的另一种闭栏）", () => {
  const article = extractOutline("---\ntitle: 甲\n...\n# 正文\n", false);
  equal(article.length, 1, "正文标题还在");
  equal(article[0]!.line, 3, "跳过的是三行");
});

testCase("BUG-32 现场：两条 `---` 夹着散文——不算 front matter，标题一个不丢", () => {
  // 现场是 `/tmp/nota-fixture/words.md`（第 1 行 `---`、第 5 行 `# 字数样张`、
  // 第 11 行又一条 `---`）：中间是普通段落与空行，不满足"看起来像 YAML 映射"。
  const article = extractOutline(
    "---\n\n开头一段散文。\n\n# 字数样张\n\n中间又一页。\n\n---\n\n# 下一页\n",
    false,
  );
  equal(article.length, 2, "两个标题都进大纲");
  equal(article[0]!.text, "字数样张", "第一个标题没被吃掉");
});

testCase("`---` 没闭合的残缺文件：不当 front matter，正文照常扫", () => {
  const article = extractOutline("---\nkey: 只有半截\n\n# 正文\n", false);
  equal(article.length, 1, "残缺文件里的标题还在");
  equal(article[0]!.line, 3, "一行都没跳过——行号也如实");
});

testCase("闭合、中间像映射：与编辑器（`拆前置块`）同一份判定", () => {
  // 编辑器那边会把这一段整个拿走（所见即所得里看不见），大纲也该看不见。
  const article = extractOutline("---\nlayout: cover\n---\n# 甲\n", false);
  equal(article.length, 1, "front matter 里的行不进大纲");
});

/* ── 三、找 / 替换（纯文本）───────────────────────────────────────────── */

group("三、找 / 替换");

testCase("找得到一对标记之间的区间", () => {
  const text4 = `前言。\n\n${tocBlockText("- [甲](#甲)")}\n\n正文。\n`;
  const range = findItemRecord(text4);
  assertValue(range !== null, "该找得到");
  equal(text4.slice(range!.start5, range!.end2).startsWith(tocStartMarker), true, "起点是开始标记");
  equal(text4.slice(range!.start5, range!.end2).endsWith(tocEndMarker), true, "终点是结束标记");
});

testCase("没有标记、或者只有一半 → `null`（按「没有」处理）", () => {
  equal(findItemRecord("正文里没有目录。\n"), null, "一条都没有");
  equal(findItemRecord(`${tocStartMarker}\n\n- [甲](#甲)\n`), null, "只有开头（用户删了一半）");
  equal(findItemRecord(`${tocEndMarker}\n\n- [甲](#甲)\n`), null, "只有结尾");
});

testCase("替换只动那一段，别处一个字不变", () => {
  const text4 = `前言。\n\n${tocBlockText("- [甲](#甲)")}\n\n正文。\n`;
  const newValue = replaceReplaceItemRecord(text4, tocBlockText("- [乙](#乙)"));
  equal(newValue, `前言。\n\n${tocBlockText("- [乙](#乙)")}\n\n正文。\n`, "换掉整块");
  equal(replaceReplaceItemRecord("没有目录。\n", "x"), null, "没有就给 `null`（调用方据此走插入）");
});

/* ── 四、目录事务（真 EditorState ＋ 真 schema）───────────────────────── */

group("四、目录事务");

/** 从 markdown 建一份带光标的 state。`锚` = 光标落在第几行（0 起）。 */
function create(source3: string, anchor2 = 0): EditorState {
  const doc = parse(source3);
  let position2 = 0;
  let passed2 = 0;
  doc.forEach((node: PMNode, offset: number) => {
    if (passed2 < anchor2) {
      passed2++;
      position2 = offset + node.nodeSize;
    }
  });
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(Math.min(position2, doc.content.size))),
  });
}

testCase("还没有目录 → 插在**光标所在那一块之后**", () => {
  const st = create("# 甲\n\n正文。\n\n## 乙\n", 0);
  const tr = tocTransaction(st, serialize, parse, false);
  assertValue(tr !== null, "该有事务");
  const after = st.apply(tr!);
  equal(
    topLayerType(after.doc),
    ["heading", blockHtmlNodeName, "bullet_list", blockHtmlNodeName, "paragraph", "heading"],
    "插在第一个标题之后",
  );
});

testCase("插出来的那段 markdown 就是 `算目录块` 那一份", () => {
  const st = create("# 甲\n\n## 乙\n", 0);
  const after = st.apply(tocTransaction(st, serialize, parse, false)!);
  const text4 = serialize(after.doc);
  assertValue(text4.includes("[甲](#甲)"), `该有甲那一条：\n${text4}`);
  // ⚠️ 缩进（嵌套）看**文档树**，不看字符串——理由见 `列表项` 那段。
  equal(columnTableItem(after.doc), [[0, "甲"], [1, "乙"]], "层级与生成时一致");
  // 两颗标记都在，且只有一对。
  equal(text4.split(tocStartMarker).length - 1, 1, "开始标记一条");
  equal(text4.split(tocEndMarker).length - 1, 1, "结束标记一条");
});

testCase("已经有目录 → **只换中段**，不是再插一份", () => {
  const oldValue = tocBlockText("- [旧名](#旧名)");
  const st = create(`# 甲\n\n${oldValue}\n\n正文。\n`, 3);
  const after = st.apply(tocTransaction(st, serialize, parse, false)!);
  equal(
    topLayerType(after.doc),
    ["heading", blockHtmlNodeName, "bullet_list", blockHtmlNodeName, "paragraph"],
    "标记仍然只有一对、列表只有一份",
  );
  equal(columnTableItem(after.doc), [[0, "甲"]], "换成了新的");
  const text4 = serialize(after.doc);
  assertValue(!text4.includes("旧名"), "旧的没了");
  equal(text4.split(tocStartMarker).length - 1, 1, "开始标记只有一条");
});

testCase("目录内容没变 → **不派事务**（省一次白按的撤销）", () => {
  const currentBecome = computeItemRecordBlock("# 甲\n", false)!;
  const st = create(`# 甲\n\n${currentBecome}\n\n正文。\n`, 3);
  equal(tocTransaction(st, serialize, parse, false), null, "一样就不动");
});

testCase("一个标题都没有 → 不派事务", () => {
  const st = create("只有一段正文。\n", 0);
  equal(tocTransaction(st, serialize, parse, false), null, "没原料");
});

testCase("标记缺一半（用户删了结尾那条）→ 当**没有**目录，插一份新的", () => {
  const st = create(`# 甲\n\n${tocStartMarker}\n\n- [甲](#甲)\n\n正文。\n`, 0);
  const tr = tocTransaction(st, serialize, parse, false);
  assertValue(tr !== null, "该插一份新的");
  const text4 = serialize(st.apply(tr!).doc);
  equal(text4.split(tocEndMarker).length - 1, 1, "新的那一份把结尾标记补上了");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(60)}`);
console.log(`通过 ${passed}，失败 ${failure}`);
if (failure) {
  console.log("失败清单：");
  for (const item5 of failureList) console.log(`  · ${item5}`);
  process.exitCode = 1;
}
