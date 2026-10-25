/**
 * `src/editor/atom-space.ts`（行内原子后面那颗空格）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/atom-space.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-atom-space-test/atom-space.test.mjs
 * node /tmp/nota-atom-space-test/atom-space.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试是为什么写的（2026-09-26）
 *
 * 无头目检里发现：行内公式后面紧跟着敲一个空格，**落盘的是 U+00A0**（`cat -A`
 * 里那截 `M-BM- `），不是用户敲的空格——同一份文件里"空格两边都是普通文字"
 * 的那一行却是正常的。
 *
 * ⚠️ 这个毛病**改了两版都没见效**，两版的失败都写在 `atom-space.ts` 文件头：
 * 第一版拦在编辑器里（真窗口里那颗空格反而丢了），第二版挂 `$remark` 插件
 * （**转换器一次都没被调用**，静默空操作）。第三版包的是 `handlers.text`。
 *
 * # 这份测试测什么、不测什么
 *
 * - 测：`换掉行内原子后的不换行空格` 这条纯函数（判据 ＋ 只换开头那一颗），
 *   以及 `原子后的空格` 那层包装**有没有从 `parent` 里正确找到前一个兄弟**。
 * - **不测**：Milkdown 到底有没有把这条处理器用在真序列化上。
 *   ⚠️ **这是这份测试最大的盲区，而且是刚刚栽过的那个坑**：第二版挂的
 *   `$remark` 插件**测试全绿、`tsc` 干净、开窗不报错**，但它根本没被调用。
 *   判据只有一个：**开窗打字 + 读落盘字节**（`docs/06` §5.22）。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ReplaceNbspAfterInlineAtom,
  Nbsp,
  SpaceAfterAtom,
} from "../src/editor/atom-space";

/* ── 一支极小的测试工装（与 `math-input.test.ts` / `math-view.test.ts` 同一套长相）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function group(name3: string): void {
  console.log(`\n【${name3}】`);
}

function assertion(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/* ── 一、判据：换不换 ───────────────────────────────────────────────── */

group("一、紧跟在行内原子后面那颗 NBSP ⇒ 换成普通空格");

testCase("行内公式（`inlineMath`）后面那颗", () => {
  const output2 = ReplaceNbspAfterInlineAtom(Nbsp + "B", "inlineMath");
  equal(output2, " B", "换出来的是普通空格");
  equal(output2.charCodeAt(0), 0x20, "码点必须是 0x20，不是 U+00A0");
});

testCase("图片（`image`）后面那颗", () => {
  equal(ReplaceNbspAfterInlineAtom(Nbsp + "字", "image"), " 字", "图片后面换掉");
});

testCase("硬换行（`break`）后面那颗", () => {
  equal(ReplaceNbspAfterInlineAtom(Nbsp + "字", "break"), " 字", "硬换行后面换掉");
});

testCase("⚠️ 硬换行在 mdast 里叫 `break`、**不叫 `html`**（名字写错就静默失效）", () => {
  // 这一条钉的是"表里那个名字是从上游 `toMarkdown` 抄来的"：`<br />` 在 PM 里是
  // `hardbreak`、序列化出来是 `break`。写成 `html` 不会报错，只会**一直不生效**。
  equal(ReplaceNbspAfterInlineAtom(Nbsp + "字", "html"), Nbsp + "字", "`html` 不在表里");
});

testCase("NBSP 后面没有别的字（空格就是最后一个字符）也换", () => {
  equal(ReplaceNbspAfterInlineAtom(Nbsp, "inlineMath"), " ", "只剩一颗空格也换");
});

testCase("只换**开头**那一颗：后面的 NBSP 是用户自己写的，不动", () => {
  // 真用户写不出两颗，但"粘贴 ＋ 敲"能凑出来。**只认位置，不认数量**。
  equal(
    ReplaceNbspAfterInlineAtom(Nbsp + "A" + Nbsp + "B", "inlineMath"),
    " A" + Nbsp + "B",
    "只换第一颗",
  );
});

/* ── 二、判据：不该动的那些 ─────────────────────────────────────────── */

group("二、别处的一律不动（`docs/09` 里那条边界）");

testCase("前一个兄弟是**文字**（`text`）时不动——用户粘进来的 NBSP 是他的内容", () => {
  equal(ReplaceNbspAfterInlineAtom(Nbsp + "B", "text"), Nbsp + "B", "原样");
});

testCase("前一个兄弟是**链接**（`link`）时不动（链接不是原子，那是正常打的空格）", () => {
  equal(ReplaceNbspAfterInlineAtom(Nbsp + "B", "link"), Nbsp + "B", "原样");
});

testCase("**段首**那颗（没有前一个兄弟）不动", () => {
  equal(ReplaceNbspAfterInlineAtom(Nbsp + "B", undefined), Nbsp + "B", "原样");
});

testCase("开头是**普通空格**时不动（根本没被换这一说）", () => {
  equal(ReplaceNbspAfterInlineAtom(" B", "inlineMath"), " B", "原样");
});

testCase("**空串**原样返回，不炸", () => {
  equal(ReplaceNbspAfterInlineAtom("", "inlineMath"), "", "原样");
});

testCase("**中间**那颗 NBSP 不动（公式前面那颗位置不对）", () => {
  equal(ReplaceNbspAfterInlineAtom("A" + Nbsp + "B", "inlineMath"), "A" + Nbsp + "B", "原样");
});

/* ── 三、包装那层：有没有正确找到"前一个兄弟" ────────────────────────── */

group("三、`原子后的空格` 包一层（前一个兄弟是从 `parent` 里现找的）");

/** 一条只会把收到的 `node.value` 原样吐回来的"原文处理器"，顺带记下它收到了什么。 */
function recordRecordSource(): { source: Parameters<typeof SpaceAfterAtom>[0]; received: Array<string | undefined> } {
  const received: Array<string | undefined> = [];
  const source = ((node: { value?: string }) => {
    received.push(node.value);
    return node.value ?? "";
  }) as unknown as NonNullable<Parameters<typeof SpaceAfterAtom>[0]>;
  return { source, received };
}

testCase("前一个兄弟是公式 ⇒ 传给原文的是换过的值 ` B`", () => {
  const { source, received } = recordRecordSource();
  const localNode = { type: "text", value: Nbsp + "B" };
  const parent = { type: "paragraph", children: [{ type: "inlineMath" }, localNode] };
  const output2 = SpaceAfterAtom(source)(localNode as never, parent as never, {} as never, {} as never);
  equal(output2, " B", "换过的值给了原文");
  equal(received[0], " B", "原文收到的就是换过的值");
});

testCase("⚠️ **不改树上那个节点**：本节点的值原样留在那里", () => {
  const { source } = recordRecordSource();
  const localNode = { type: "text", value: Nbsp + "B" };
  const parent = { type: "paragraph", children: [{ type: "inlineMath" }, localNode] };
  SpaceAfterAtom(source)(localNode as never, parent as never, {} as never, {} as never);
  equal(localNode.value, Nbsp + "B", "入参没被改");
});

testCase("本节点是**第一个孩子**（位次 0）⇒ 不动", () => {
  const { source, received } = recordRecordSource();
  const localNode = { type: "text", value: Nbsp + "B" };
  const parent = { type: "paragraph", children: [localNode] };
  SpaceAfterAtom(source)(localNode as never, parent as never, {} as never, {} as never);
  equal(received[0], Nbsp + "B", "原样");
});

testCase("**`parent` 是 `undefined`**（根节点那一次）⇒ 不炸、原样", () => {
  const { source, received } = recordRecordSource();
  const localNode = { type: "text", value: Nbsp + "B" };
  const output2 = SpaceAfterAtom(source)(localNode as never, undefined as never, {} as never, {} as never);
  equal(output2, Nbsp + "B", "原样");
  equal(received[0], Nbsp + "B", "原文也收到原样");
});

testCase("**没给**原文处理器 ⇒ 直接返回 `node.value`，不自己造一条", () => {
  const localNode = { type: "text", value: Nbsp + "B" };
  equal(SpaceAfterAtom(undefined)(localNode as never, undefined as never, {} as never, {} as never), Nbsp + "B", "原样");
  equal(SpaceAfterAtom(undefined)({ type: "text" } as never, undefined as never, {} as never, {} as never), "", "没 value 就是空串");
});

testCase("前一个兄弟是**文字** ⇒ 一个字都不动地交给原文", () => {
  const { source, received } = recordRecordSource();
  const localNode = { type: "text", value: "A" + Nbsp + "B" };
  const parent = { type: "paragraph", children: [{ type: "text", value: "前" }, localNode] };
  SpaceAfterAtom(source)(localNode as never, parent as never, {} as never, {} as never);
  equal(received[0], "A" + Nbsp + "B", "原样");
});

/* ── 四、源码里不许有裸的 U+00A0 ─────────────────────────────────────── */

group("四、源码里不许出现裸的 U+00A0（写代码时踩过的坑）");

testCase("`src/editor/atom-space.ts` 里的 U+00A0 只许来自 `\\u00a0` 这个转义", () => {
  const path2 = resolve(process.cwd(), "src/editor/atom-space.ts");
  const source3 = readFileSync(path2, "utf8");
  // 第一版就是这么错的：注释里写例子时手一抖，把真 NBSP 贴进了源码，看是看不出来
  // 的；这一版**又踩了一次**（常量那行直接粘成了真 NBSP）。
  const position2 = source3.indexOf(Nbsp);
  assertion(
    position2 === -1,
    `源码第 ${position2 === -1 ? 0 : source3.slice(0, position2).split("\n").length} 行有一颗裸的 U+00A0，请改写成 \\u00a0`,
  );
  equal(Nbsp, "\u00a0", "常量本身当然还是那颗字符");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${pass} 过 / ${fail} 败`);
if (failed.length > 0) {
  console.log("败的：");
  for (const name3 of failed) console.log(`  - ${name3}`);
  process.exit(1);
}
