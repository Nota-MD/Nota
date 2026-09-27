/**
 * `src/editor/empty-paragraph.ts` 里那条**保镖**（`文档别导出空根`）的**可运行**测试集。
 *
 * # 它盯的是什么
 *
 * 用户 2026-09-27 拍了：**空文档存盘要落 0 字节**。
 *
 * 现状是**落 7 字节**（字面 `<br />` ＋ 换行），状态栏因此读「1 words 7 characters
 * 2 lines」——见 `docs/06` §5.34 末尾那条观察。那 7 个字节不是谁有意写的，是那条
 * 保镖的**副作用**：`文档别导出空根` 往 root 里塞一个 `html("<br />")` 占位，
 * 只为让 root 的 `children` 存在（否则 `mdast-util-to-markdown` 的 root handler
 * 在第一行 `node.children.some` 上 TypeError，整篇文档打不开——文件头有实测与堆栈）。
 *
 * 所以这份测试要**同时**钉住两件看起来相反的事：
 *
 * 1. **整篇都是空的 → 序列化出来必须是 0 字节**（占位不许漏到用户文件里）；
 * 2. **不许崩**（占位当初就是为这个来的：空 root 那条路上，谁都不能让
 *    `children` 变成 `undefined`）。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/empty-doc-save.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-空文档/empty-doc-save.test.mjs
 * node /tmp/nota-空文档/empty-doc-save.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 用的是真代码，不是替身
 *
 * - 两个插件（段落那条、doc 那条）**真跑起来**：`.node(ctx)()` 走的就是
 *   `create.ts` 里 `.use(...)` 那条注册路径（`$nodeSchema` 返回的元组第 2 位）。
 * - 序列化用的是**真 `SerializerState`**（`@milkdown/kit/transformer`），
 *   与 `create.ts` 建 `serializerCtx` 用的是同一个类。
 * - doc/paragraph 那两份规格**从注册表里取**（`ctx.get(nodesCtx)`），
 *   不是这里手抄一份——抄一份就等于给自己埋一个"上游改了不知道"的雷。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **建整个 `Editor` 的那条路没验**（`.use()` 顺序、真 DOM）——那要
 *   `Editor.make()`，本仓没有 jsdom，也不许为这件事装包。
 * - **落盘那一步没验**：这里量的是"序列化出来的字符串有几个字节"，而
 *   `src-tauri/src/document/mod.rs` 是 `fs::write(&path, &doc.text)` **原样**
 *   写下去的（那一条是读代码得到的，不是这里量的）。所以"字符串 0 字节 ⇒
 *   文件 0 字节"这一跳，靠的是那一行确实不加料。
 * - **开窗目检**（真敲字、真 `Ctrl+S`、真 `cat` 文件）是另一件事，见 `docs/06` §5.31。
 */

import { Container, Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx, nodesCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import { docSchema, paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { 文档别导出空根, 段落不写空行 } from "../src/editor/empty-paragraph";

/* ── 一支极小的测试工装（与 `math-delim.test.ts` 同一套长相）── */

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    败的.push(名称);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 组(名: string): void {
  console.log(`\n【${名}】`);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

/* ── 真规格 → 真 Schema → 真两台状态机 ─────────────────────────────────── */

const ctx = new Ctx(new Container(), {} as never);
ctx.inject(nodesCtx);
/**
 * ⚠️ **上游段落那条 runner 会去问 `editorViewCtx`**（`preset-commonmark/lib/index.js:487`
 * 的 `ctx.get(editorViewCtx).state?.doc.lastChild`），没登记它就当场抛
 * `Context "editorView" not found`。本仓那份 `段落不写空行` 只在**非空**段落上
 * 才把这一问交给上游，所以这个替身只影响"非空段落"那几条。给一个 `state: undefined`
 * 就够：`state?.doc.lastChild` 整条链短路成 `undefined`，于是"空段落写不写占位符"
 * 判成假（与真编辑器里 `shouldPreserveEmptyLine` 取到假是同一个结果）。
 */
ctx.inject(editorViewCtx, { state: undefined } as never);

// ⚠️ 上游那两份先登记（`文档别导出空根` 的 spec 是**从注册表里取上游那份来改**的，
// 取不到就当场抛错——那正是"注册顺序写反了"的信号）。
// ⚠️ `docSchema` 没有 `.ctx`（它不是 `$nodeSchema` 那个元组，见下面 `跑裸插件`），
// 所以它不用预先登记切片——跑一遍插件就进注册表了。
paragraphSchema.ctx(ctx);
// 本仓那两份的切片也要登记，`ctx.get(段落不写空行.key)` 才取得到。
段落不写空行.ctx(ctx);
文档别导出空根.ctx(ctx);

/**
 * 插件体是个 `async` 函数，挨个真跑一遍——**注册进 `nodesCtx` 的就是这一步**。
 *
 * ⚠️ 类型那一串 `as unknown as` 抄的是 `math-delim.test.ts`：`$nodeSchema` 返回的是
 * 个**元组**（`[schemaCtx, nodeSchema]`，`@milkdown/utils/lib/index.js:301-316`），
 * 而 `.node` 挂在那个数组上，TS 看不出这一点。
 * ⚠️⚠️ 但 **`docSchema` 不是**那个形状：它是 `$node(...)` 的产物（一个 `$Node`，
 * 本仓 `empty-paragraph.ts` 的文件头正是为这件事写了"为什么用 `$nodeSchema` 重注册
 * 一个同名 doc"）——**它自己就是那个插件函数**，没有 `.node` 这一层。
 * 两者混用会当场 `xxx is not a function`（第一次跑这份测试就栽在这儿）。
 */
const 跑元组插件 = async (支: unknown): Promise<void> => {
  await (支 as { node: (c: Ctx) => () => Promise<void> }).node(ctx)();
};
const 跑裸插件 = async (支: unknown): Promise<void> => {
  await (支 as (c: Ctx) => () => Promise<void>)(ctx)();
};

const 注册表 = (): [string, unknown][] => ctx.get(nodesCtx) as [string, unknown][];

await 跑裸插件(docSchema);
await 跑元组插件(paragraphSchema);
await 跑元组插件(段落不写空行);
await 跑元组插件(文档别导出空根);

/** doc/paragraph 那两份**从注册表里取**——跑完上面那几步之后，里面就是本仓这两份。 */
const 取规格 = (id: string): never => {
  const 找到 = 注册表().find(([名字]) => 名字 === id);
  if (!找到) throw new Error(`注册表里没有 ${id}`);
  return 找到[1] as never;
};

/**
 * 一台够用的 schema：`doc` / `paragraph` / `text` 三个。
 *
 * ⚠️ doc 与 paragraph **用的是注册表里那两份**（本仓改过的），text 是个最小版
 * （本文件不关心行内标记，`toDOM` 一律省掉——不碰 DOM）。
 */
const schema = new Schema({
  nodes: {
    doc: 取规格("doc"),
    paragraph: 取规格("paragraph"),
    text: {
      group: "inline",
      parseMarkdown: {
        match: ({ type }) => type === "text",
        runner: (state, node) => state.addText(node.value as string),
      },
      toMarkdown: {
        match: (node) => node.type.name === "text",
        runner: (state, node) => state.addNode("text", undefined, node.text as string),
      },
    },
  },
}) as unknown as Schema;

/**
 * 一台真处理机：**与 `create.ts` 那条链同形**的**最小**版（`remark-parse` ＋
 * `remark-stringify` 都用上游默认）。占位符那几个字节**不经过 `handlers`**
 * （见 `empty-paragraph.ts` 里"落点为什么是改 schema"那一节），所以这里不需要
 * 挂任何 handler。`void 序列化状态` 那行只是为了让上面那个未用的类型别名不报未使用。
 */
const 处理机 = unified().use(remarkParse).use(remarkStringify);

const 解析 = ParserState.create(schema, 处理机);
const 序列化 = SerializerState.create(schema, 处理机);

/** 一整趟：markdown → 文档 → markdown。**两个方向都是真代码**。 */
const 往返 = (源: string): string => String(序列化(解析(源)));

/**
 * 手工建一篇"整篇都是空段落"的文档。
 *
 * ⚠️ `几段 === 0` 走的是**解析**那条路（`解析("")`），不是 `schema.node("doc", null, [])`
 * ——后者当场抛 `Invalid content for node doc: <>`（`doc.content` 声明的是 `block+`，
 * 而真编辑器里那种"一个孩子都没有"的文档是 `injectRoot` 建出来的，绕过了那条校验）。
 */
const 空段落文档 = (几段: number): unknown => {
  if (几段 === 0) return 解析("");
  const 每段 = Array.from({ length: 几段 }, () => schema.node("paragraph"));
  return schema.node("doc", null, 每段);
};

/** 手工建一篇 `段落 > 空文本节点` 的文档（"敲了字又退格删掉"落到的那副样子）。 */
const 空文本段落文档 = (): unknown =>
  schema.node("doc", null, [schema.node("paragraph", null, [schema.node("text", null, "")])]);

/* ── 一、正题：整篇都是空的，落盘必须 0 字节 ─────────────────────────── */

组("一、空文档存盘是 0 字节");

测("0 字节的源：打开再存盘，还是 0 字节", () => {
  const 出来 = 往返("");
  console.log(`      （实际：${JSON.stringify(出来)}，${Buffer.byteLength(出来, "utf8")} 字节）`);
  等(出来, "", "空文档序列化");
});

测("整篇只有一个空段落：也是 0 字节", () => {
  const 出来 = String(序列化(空段落文档(1)));
  console.log(`      （实际：${JSON.stringify(出来)}，${Buffer.byteLength(出来, "utf8")} 字节）`);
  等(出来, "", "一个空段落");
});

测("整篇好几个空段落：还是 0 字节", () => {
  const 出来 = String(序列化(空段落文档(3)));
  console.log(`      （实际：${JSON.stringify(出来)}，${Buffer.byteLength(出来, "utf8")} 字节）`);
  等(出来, "", "三个空段落");
});

测("`段落 > 空文本节点`（敲了字又退格删掉的样子）：也是 0 字节", () => {
  // ⚠️ 这一条是 2026-09-26 那次"实测 0 字节"落到的形状，与上面两条**不是同一条路**：
  // 这里 `全篇都是空段落` 判成**假**（段落里有一颗空文本，`content.size` 是 1），
  // 于是走 `state.next()` → 段落那条（上游）→ 什么都不写 → root 的 children 是
  // **空数组**。它与"占位"那条路的区别见下面第二组。
  const 出来 = String(序列化(空文本段落文档()));
  console.log(`      （实际：${JSON.stringify(出来)}，${Buffer.byteLength(出来, "utf8")} 字节）`);
  等(出来, "", "空文本段落");
});

测("⚠️ 一个 `<br />` 都不许漏出来", () => {
  for (const 源 of ["", "\n", "\n\n"]) {
    const 出来 = 往返(源);
    if (出来.includes("<br")) throw new Error(`源 ${JSON.stringify(源)} 存成了 ${JSON.stringify(出来)}`);
  }
});

/* ── 二、保镖那条不许丢：空 root 不能把序列化器弄崩 ───────────────────── */

组("二、保镖那条还在（空 root 不崩）");

测("⚠️ 空文档序列化**不抛错**（从前是 `node.children.some` 上 TypeError）", () => {
  // 这一条是 `文档别导出空根` 存在的**全部理由**：占位改成空串之后，
  // root 的 `children` 还得有人建出来，否则一打开空文件就白屏
  // （`empty-paragraph.ts` 文件头记着那条堆栈）。
  let 炸了 = "";
  try {
    序列化(空段落文档(0));
    序列化(解析(""));
  } catch (e) {
    炸了 = e instanceof Error ? e.message : String(e);
  }
  等(炸了, "", "序列化空文档不该抛错");
});

/* ── 三、有内容的一个字节都不许动 ────────────────────────────────────── */

组("三、非空文档原样");

测("普通段落往返不变（含末尾那个换行）", () => {
  等(往返("甲\n"), "甲\n", "一段");
  等(往返("甲\n\n乙\n"), "甲\n\n乙\n", "两段");
});

测("段落里有字：还是原样（`段落不写空行` 只对空段落动手）", () => {
  等(往返("甲 乙\n"), "甲 乙\n", "一段两个字");
});

/* ── 收尾 ────────────────────────────────────────────────────────────── */

console.log(`\n${过} 过 / ${败} 败`);
if (败 > 0) {
  console.log(`不过的：${败的.join("、")}`);
  process.exit(1);
}
