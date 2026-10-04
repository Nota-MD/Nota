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

import { 块HTML转换, 块HTML节点名 } from "../src/editor/html-block";
import { 目录事务 } from "../src/editor/insert";
import { extractOutline } from "../src/editor/headings";
import {
  生成目录,
  算目录块,
  找目录,
  替换目录,
  目录块文本,
  目录开始标记,
  目录结束标记,
  锚点,
} from "../src/editor/toc";

/* ── 最小工装 ─────────────────────────────────────────────────────────── */

let 通过 = 0;
let 失败 = 0;
const 失败清单: string[] = [];
let 当前组 = "";

function 组(名: string): void {
  当前组 = 名;
  console.log(`\n── ${名} ${"─".repeat(Math.max(0, 56 - 名.length))}`);
}

function 测(名称: string, 体: () => void): void {
  try {
    体();
    通过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    失败++;
    失败清单.push(`${当前组} / ${名称}`);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a !== b) throw new Error(`${说明}：期望 ${b}，实际 ${a}`);
}

function 真(值: boolean, 说明: string): void {
  if (!值) throw new Error(说明);
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
        match: ({ type }: MarkdownNode) => type === 块HTML节点名,
        runner: (state: ParserState, node: MarkdownNode, type: unknown) =>
          state.addNode(type as never, { value: node.value ?? "" }),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === 块HTML节点名,
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
function 造处理机() {
  return unified()
    .use(remarkParse)
    .use(() => (树: unknown) => 块HTML转换(树 as MarkdownNode))
    .use(remarkStringify, { bullet: "-" });
}

const 机 = 造处理机();

/** 一整篇 markdown → 文档树。 */
function 解析(源: string): PMNode {
  return ParserState.create(schema, 机)(源) as unknown as PMNode;
}

/** 文档树 → 一整篇 markdown（`目录事务` 要的就是这一对）。 */
function 序列化(节点: PMNode): string {
  return SerializerState.create(schema, 机)(节点);
}

/** 顶层节点的类型名，读起来方便。 */
function 顶层类型(节点: PMNode): string[] {
  const 出: string[] = [];
  节点.forEach((n: PMNode) => 出.push(n.type.name));
  return 出;
}

/**
 * 把文档里**那份目录列表**读成 `[层数, 文字]`。
 *
 * ⚠️ 断言看的是**结构**（谁在谁下面），不是"序列化出来那一行长什么样"：
 * 记号字符由序列化器的选项说了算，拿它去比会把"记号换了一个"当成功能坏了。
 * 这里要比也是比**嵌套层数**——那才是"缩进对不对"这件事本身。
 */
function 列表项(节点: PMNode): [number, string][] {
  const 出: [number, string][] = [];
  const 走 = (n: PMNode, 层: number): void => {
    if (n.type.name === "list_item") {
      // ⚠️ 用**第一个孩子**（`list_item` 的 content 是 `paragraph block*`）而不是
      // `n.textContent`：后者会把嵌套在里面的子列也一起读进来，
      // 顶层那一条会变成「甲乙」（第一版就是这么写的，断言里看得一清二楚）。
      出.push([层, n.firstChild?.textContent ?? ""]);
      n.forEach((c: PMNode) => {
        if (c.type.name === "bullet_list") c.forEach((i: PMNode) => 走(i, 层 + 1));
      });
      return;
    }
    n.forEach((c: PMNode) => 走(c, 层));
  };
  节点.forEach((n: PMNode) => {
    if (n.type.name === "bullet_list") 走(n, 0);
  });
  return 出;
}

/* ── 一、锚点 ─────────────────────────────────────────────────────────── */

组("一、锚点（照 GitHub 那套）");

测("全小写、空白折成一个连字符", () => {
  等(锚点("Hello World", new Set()), "hello-world", "基本形状");
  等(锚点("  Hello   World  ", new Set()), "hello-world", "两边空白先 trim");
});

测("标点去掉，连字符与下划线留着", () => {
  等(锚点("什么是「爱」？", new Set()), "什么是爱", "中文标点去掉");
  等(锚点("a.b, c!d", new Set()), "ab-cd", "拉丁标点去掉");
  等(锚点("a-b_c", new Set()), "a-b_c", "`-` 与 `_` 是允许的字符");
});

测("中日韩保留（不是 `a-z0-9` 那种写法）", () => {
  等(锚点("第三章 小结", new Set()), "第三章-小结", "中文标题不该变成空锚点");
});

测("重名按出现顺序加 `-1` / `-2`", () => {
  const 已用 = new Set<string>();
  等([锚点("小结", 已用), 锚点("小结", 已用), 锚点("小结", 已用)], ["小结", "小结-1", "小结-2"], "三次同名");
});

测("去重只在**传进来的那个集合**里算（两次独立调用互不影响）", () => {
  const 甲 = new Set<string>();
  const 乙 = new Set<string>();
  等([锚点("小结", 甲), 锚点("小结", 乙)], ["小结", "小结"], "各算各的");
});

测("全被滤掉时兜底给 `section`（空锚点在 HTML 里等于没写）", () => {
  等(锚点("🎉🚀", new Set()), "section", "纯 emoji");
  等(锚点("   ", new Set()), "section", "纯空白");
  等(锚点("!!!", new Set()), "section", "纯标点");
});

/* ── 二、生成目录 ─────────────────────────────────────────────────────── */

组("二、生成目录");

测("一个标题都没有 → `null`（菜单项据此变灰）", () => {
  等(生成目录([]), null, "空表");
  等(算目录块("正文一段。\n", false), null, "有正文没标题");
});

测("缩进按**相对层级**：从 `##` 开头的一份文档不整个缩进一格", () => {
  const 二起 = extractOutline("## 甲\n\n### 乙\n\n## 丙\n", false);
  等(
    生成目录(二起),
    ["- [甲](#甲)", "  - [乙](#乙)", "- [丙](#丙)"].join("\n"),
    "最浅的那一级 `-` 顶格",
  );
});

测("层级跳跃（`#` 直接到 `###`）不报错，缩进按差值", () => {
  const 跳 = extractOutline("# 甲\n\n### 丙\n", false);
  等(生成目录(跳), ["- [甲](#甲)", "    - [丙](#丙)"].join("\n"), "差两级缩四格");
});

测("标题里的方括号被转义（否则链接会被拆散）", () => {
  const 方 = extractOutline("# 甲[乙]\n", false);
  等(生成目录(方), "- [甲\\[乙\\]](#甲乙)", "中括号转义，锚点里没有它们");
});

测("重名标题在目录里也是 `-1`", () => {
  const 重 = extractOutline("# 小结\n\n## 小结\n", false);
  等(生成目录(重), ["- [小结](#小结)", "  - [小结](#小结-1)"].join("\n"), "第二个加了后缀");
});

测("一块完整的目录：两头标记、上下各空一行", () => {
  const 块 = 算目录块("# 甲\n", false);
  等(块, `${目录开始标记}\n\n- [甲](#甲)\n\n${目录结束标记}`, "块文本");
  等(目录块文本("- [甲](#甲)"), 块, "`目录块文本` 与 `算目录块` 拼出来的是同一个");
});

测("严格模式：`#标签` 不算标题（与侧栏「大纲」同一份判据）", () => {
  等(算目录块("#标签\n", true), null, "严格档下一个标题都没有");
  真(算目录块("#标签\n", false) !== null, "宽松档下算一个标题");
});

/* ── 二½、front matter 判据合并（第 63 项，2026-10-04）────────────────── */

组("二½、front matter：大纲与编辑器用同一份严判据");

测("真 front matter（闭栏 ＋ 映射行）整个跳过，标题行号按整篇文档算", () => {
  const 篇 = extractOutline("---\ntitle: 甲\n---\n\n# 正文\n", false);
  等(篇.length, 1, "front matter 里的 `title:` 不是标题");
  等(篇[0]!.line, 4, "行号是整篇文档的（含 front matter 那四行）");
});

测("`...` 收尾也算 front matter（YAML 的另一种闭栏）", () => {
  const 篇 = extractOutline("---\ntitle: 甲\n...\n# 正文\n", false);
  等(篇.length, 1, "正文标题还在");
  等(篇[0]!.line, 3, "跳过的是三行");
});

测("BUG-32 现场：两条 `---` 夹着散文——不算 front matter，标题一个不丢", () => {
  // 现场是 `/tmp/nota-fixture/words.md`（第 1 行 `---`、第 5 行 `# 字数样张`、
  // 第 11 行又一条 `---`）：中间是普通段落与空行，不满足"看起来像 YAML 映射"。
  const 篇 = extractOutline(
    "---\n\n开头一段散文。\n\n# 字数样张\n\n中间又一页。\n\n---\n\n# 下一页\n",
    false,
  );
  等(篇.length, 2, "两个标题都进大纲");
  等(篇[0]!.text, "字数样张", "第一个标题没被吃掉");
});

测("`---` 没闭合的残缺文件：不当 front matter，正文照常扫", () => {
  const 篇 = extractOutline("---\nkey: 只有半截\n\n# 正文\n", false);
  等(篇.length, 1, "残缺文件里的标题还在");
  等(篇[0]!.line, 3, "一行都没跳过——行号也如实");
});

测("闭合、中间像映射：与编辑器（`拆前置块`）同一份判定", () => {
  // 编辑器那边会把这一段整个拿走（所见即所得里看不见），大纲也该看不见。
  const 篇 = extractOutline("---\nlayout: cover\n---\n# 甲\n", false);
  等(篇.length, 1, "front matter 里的行不进大纲");
});

/* ── 三、找 / 替换（纯文本）───────────────────────────────────────────── */

组("三、找 / 替换");

测("找得到一对标记之间的区间", () => {
  const 文 = `前言。\n\n${目录块文本("- [甲](#甲)")}\n\n正文。\n`;
  const 区间 = 找目录(文);
  真(区间 !== null, "该找得到");
  等(文.slice(区间!.起, 区间!.止).startsWith(目录开始标记), true, "起点是开始标记");
  等(文.slice(区间!.起, 区间!.止).endsWith(目录结束标记), true, "终点是结束标记");
});

测("没有标记、或者只有一半 → `null`（按「没有」处理）", () => {
  等(找目录("正文里没有目录。\n"), null, "一条都没有");
  等(找目录(`${目录开始标记}\n\n- [甲](#甲)\n`), null, "只有开头（用户删了一半）");
  等(找目录(`${目录结束标记}\n\n- [甲](#甲)\n`), null, "只有结尾");
});

测("替换只动那一段，别处一个字不变", () => {
  const 文 = `前言。\n\n${目录块文本("- [甲](#甲)")}\n\n正文。\n`;
  const 新 = 替换目录(文, 目录块文本("- [乙](#乙)"));
  等(新, `前言。\n\n${目录块文本("- [乙](#乙)")}\n\n正文。\n`, "换掉整块");
  等(替换目录("没有目录。\n", "x"), null, "没有就给 `null`（调用方据此走插入）");
});

/* ── 四、目录事务（真 EditorState ＋ 真 schema）───────────────────────── */

组("四、目录事务");

/** 从 markdown 建一份带光标的 state。`锚` = 光标落在第几行（0 起）。 */
function 建(源: string, 锚 = 0): EditorState {
  const doc = 解析(源);
  let 位置 = 0;
  let 已过 = 0;
  doc.forEach((节点: PMNode, 偏移: number) => {
    if (已过 < 锚) {
      已过++;
      位置 = 偏移 + 节点.nodeSize;
    }
  });
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(Math.min(位置, doc.content.size))),
  });
}

测("还没有目录 → 插在**光标所在那一块之后**", () => {
  const st = 建("# 甲\n\n正文。\n\n## 乙\n", 0);
  const tr = 目录事务(st, 序列化, 解析, false);
  真(tr !== null, "该有事务");
  const 后 = st.apply(tr!);
  等(
    顶层类型(后.doc),
    ["heading", 块HTML节点名, "bullet_list", 块HTML节点名, "paragraph", "heading"],
    "插在第一个标题之后",
  );
});

测("插出来的那段 markdown 就是 `算目录块` 那一份", () => {
  const st = 建("# 甲\n\n## 乙\n", 0);
  const 后 = st.apply(目录事务(st, 序列化, 解析, false)!);
  const 文 = 序列化(后.doc);
  真(文.includes("[甲](#甲)"), `该有甲那一条：\n${文}`);
  // ⚠️ 缩进（嵌套）看**文档树**，不看字符串——理由见 `列表项` 那段。
  等(列表项(后.doc), [[0, "甲"], [1, "乙"]], "层级与生成时一致");
  // 两颗标记都在，且只有一对。
  等(文.split(目录开始标记).length - 1, 1, "开始标记一条");
  等(文.split(目录结束标记).length - 1, 1, "结束标记一条");
});

测("已经有目录 → **只换中段**，不是再插一份", () => {
  const 旧 = 目录块文本("- [旧名](#旧名)");
  const st = 建(`# 甲\n\n${旧}\n\n正文。\n`, 3);
  const 后 = st.apply(目录事务(st, 序列化, 解析, false)!);
  等(
    顶层类型(后.doc),
    ["heading", 块HTML节点名, "bullet_list", 块HTML节点名, "paragraph"],
    "标记仍然只有一对、列表只有一份",
  );
  等(列表项(后.doc), [[0, "甲"]], "换成了新的");
  const 文 = 序列化(后.doc);
  真(!文.includes("旧名"), "旧的没了");
  等(文.split(目录开始标记).length - 1, 1, "开始标记只有一条");
});

测("目录内容没变 → **不派事务**（省一次白按的撤销）", () => {
  const 现成 = 算目录块("# 甲\n", false)!;
  const st = 建(`# 甲\n\n${现成}\n\n正文。\n`, 3);
  等(目录事务(st, 序列化, 解析, false), null, "一样就不动");
});

测("一个标题都没有 → 不派事务", () => {
  const st = 建("只有一段正文。\n", 0);
  等(目录事务(st, 序列化, 解析, false), null, "没原料");
});

测("标记缺一半（用户删了结尾那条）→ 当**没有**目录，插一份新的", () => {
  const st = 建(`# 甲\n\n${目录开始标记}\n\n- [甲](#甲)\n\n正文。\n`, 0);
  const tr = 目录事务(st, 序列化, 解析, false);
  真(tr !== null, "该插一份新的");
  const 文 = 序列化(st.apply(tr!).doc);
  等(文.split(目录结束标记).length - 1, 1, "新的那一份把结尾标记补上了");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(60)}`);
console.log(`通过 ${通过}，失败 ${失败}`);
if (失败) {
  console.log("失败清单：");
  for (const 项 of 失败清单) console.log(`  · ${项}`);
  process.exitCode = 1;
}
