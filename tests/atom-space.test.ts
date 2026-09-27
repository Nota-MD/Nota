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
  换掉行内原子后的不换行空格,
  不换行空格,
  原子后的空格,
} from "../src/editor/atom-space";

/* ── 一支极小的测试工装（与 `math-input.test.ts` / `math-view.test.ts` 同一套长相）── */

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

function 断言(条件: unknown, 说明: string): void {
  if (!条件) throw new Error(说明);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

/* ── 一、判据：换不换 ───────────────────────────────────────────────── */

组("一、紧跟在行内原子后面那颗 NBSP ⇒ 换成普通空格");

测("行内公式（`inlineMath`）后面那颗", () => {
  const 出 = 换掉行内原子后的不换行空格(不换行空格 + "B", "inlineMath");
  等(出, " B", "换出来的是普通空格");
  等(出.charCodeAt(0), 0x20, "码点必须是 0x20，不是 U+00A0");
});

测("图片（`image`）后面那颗", () => {
  等(换掉行内原子后的不换行空格(不换行空格 + "字", "image"), " 字", "图片后面换掉");
});

测("硬换行（`break`）后面那颗", () => {
  等(换掉行内原子后的不换行空格(不换行空格 + "字", "break"), " 字", "硬换行后面换掉");
});

测("⚠️ 硬换行在 mdast 里叫 `break`、**不叫 `html`**（名字写错就静默失效）", () => {
  // 这一条钉的是"表里那个名字是从上游 `toMarkdown` 抄来的"：`<br />` 在 PM 里是
  // `hardbreak`、序列化出来是 `break`。写成 `html` 不会报错，只会**一直不生效**。
  等(换掉行内原子后的不换行空格(不换行空格 + "字", "html"), 不换行空格 + "字", "`html` 不在表里");
});

测("NBSP 后面没有别的字（空格就是最后一个字符）也换", () => {
  等(换掉行内原子后的不换行空格(不换行空格, "inlineMath"), " ", "只剩一颗空格也换");
});

测("只换**开头**那一颗：后面的 NBSP 是用户自己写的，不动", () => {
  // 真用户写不出两颗，但"粘贴 ＋ 敲"能凑出来。**只认位置，不认数量**。
  等(
    换掉行内原子后的不换行空格(不换行空格 + "A" + 不换行空格 + "B", "inlineMath"),
    " A" + 不换行空格 + "B",
    "只换第一颗",
  );
});

/* ── 二、判据：不该动的那些 ─────────────────────────────────────────── */

组("二、别处的一律不动（`docs/09` 里那条边界）");

测("前一个兄弟是**文字**（`text`）时不动——用户粘进来的 NBSP 是他的内容", () => {
  等(换掉行内原子后的不换行空格(不换行空格 + "B", "text"), 不换行空格 + "B", "原样");
});

测("前一个兄弟是**链接**（`link`）时不动（链接不是原子，那是正常打的空格）", () => {
  等(换掉行内原子后的不换行空格(不换行空格 + "B", "link"), 不换行空格 + "B", "原样");
});

测("**段首**那颗（没有前一个兄弟）不动", () => {
  等(换掉行内原子后的不换行空格(不换行空格 + "B", undefined), 不换行空格 + "B", "原样");
});

测("开头是**普通空格**时不动（根本没被换这一说）", () => {
  等(换掉行内原子后的不换行空格(" B", "inlineMath"), " B", "原样");
});

测("**空串**原样返回，不炸", () => {
  等(换掉行内原子后的不换行空格("", "inlineMath"), "", "原样");
});

测("**中间**那颗 NBSP 不动（公式前面那颗位置不对）", () => {
  等(换掉行内原子后的不换行空格("A" + 不换行空格 + "B", "inlineMath"), "A" + 不换行空格 + "B", "原样");
});

/* ── 三、包装那层：有没有正确找到"前一个兄弟" ────────────────────────── */

组("三、`原子后的空格` 包一层（前一个兄弟是从 `parent` 里现找的）");

/** 一条只会把收到的 `node.value` 原样吐回来的"原文处理器"，顺带记下它收到了什么。 */
function 记录原文(): { 原文: Parameters<typeof 原子后的空格>[0]; 收到: Array<string | undefined> } {
  const 收到: Array<string | undefined> = [];
  const 原文 = ((node: { value?: string }) => {
    收到.push(node.value);
    return node.value ?? "";
  }) as unknown as NonNullable<Parameters<typeof 原子后的空格>[0]>;
  return { 原文, 收到 };
}

测("前一个兄弟是公式 ⇒ 传给原文的是换过的值 ` B`", () => {
  const { 原文, 收到 } = 记录原文();
  const 本节点 = { type: "text", value: 不换行空格 + "B" };
  const 父 = { type: "paragraph", children: [{ type: "inlineMath" }, 本节点] };
  const 出 = 原子后的空格(原文)(本节点 as never, 父 as never, {} as never, {} as never);
  等(出, " B", "换过的值给了原文");
  等(收到[0], " B", "原文收到的就是换过的值");
});

测("⚠️ **不改树上那个节点**：本节点的值原样留在那里", () => {
  const { 原文 } = 记录原文();
  const 本节点 = { type: "text", value: 不换行空格 + "B" };
  const 父 = { type: "paragraph", children: [{ type: "inlineMath" }, 本节点] };
  原子后的空格(原文)(本节点 as never, 父 as never, {} as never, {} as never);
  等(本节点.value, 不换行空格 + "B", "入参没被改");
});

测("本节点是**第一个孩子**（位次 0）⇒ 不动", () => {
  const { 原文, 收到 } = 记录原文();
  const 本节点 = { type: "text", value: 不换行空格 + "B" };
  const 父 = { type: "paragraph", children: [本节点] };
  原子后的空格(原文)(本节点 as never, 父 as never, {} as never, {} as never);
  等(收到[0], 不换行空格 + "B", "原样");
});

测("**`parent` 是 `undefined`**（根节点那一次）⇒ 不炸、原样", () => {
  const { 原文, 收到 } = 记录原文();
  const 本节点 = { type: "text", value: 不换行空格 + "B" };
  const 出 = 原子后的空格(原文)(本节点 as never, undefined as never, {} as never, {} as never);
  等(出, 不换行空格 + "B", "原样");
  等(收到[0], 不换行空格 + "B", "原文也收到原样");
});

测("**没给**原文处理器 ⇒ 直接返回 `node.value`，不自己造一条", () => {
  const 本节点 = { type: "text", value: 不换行空格 + "B" };
  等(原子后的空格(undefined)(本节点 as never, undefined as never, {} as never, {} as never), 不换行空格 + "B", "原样");
  等(原子后的空格(undefined)({ type: "text" } as never, undefined as never, {} as never, {} as never), "", "没 value 就是空串");
});

测("前一个兄弟是**文字** ⇒ 一个字都不动地交给原文", () => {
  const { 原文, 收到 } = 记录原文();
  const 本节点 = { type: "text", value: "A" + 不换行空格 + "B" };
  const 父 = { type: "paragraph", children: [{ type: "text", value: "前" }, 本节点] };
  原子后的空格(原文)(本节点 as never, 父 as never, {} as never, {} as never);
  等(收到[0], "A" + 不换行空格 + "B", "原样");
});

/* ── 四、源码里不许有裸的 U+00A0 ─────────────────────────────────────── */

组("四、源码里不许出现裸的 U+00A0（写代码时踩过的坑）");

测("`src/editor/atom-space.ts` 里的 U+00A0 只许来自 `\\u00a0` 这个转义", () => {
  const 路 = resolve(process.cwd(), "src/editor/atom-space.ts");
  const 源 = readFileSync(路, "utf8");
  // 第一版就是这么错的：注释里写例子时手一抖，把真 NBSP 贴进了源码，看是看不出来
  // 的；这一版**又踩了一次**（常量那行直接粘成了真 NBSP）。
  const 位置 = 源.indexOf(不换行空格);
  断言(
    位置 === -1,
    `源码第 ${位置 === -1 ? 0 : 源.slice(0, 位置).split("\n").length} 行有一颗裸的 U+00A0，请改写成 \\u00a0`,
  );
  等(不换行空格, "\u00a0", "常量本身当然还是那颗字符");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${过} 过 / ${败} 败`);
if (败的.length > 0) {
  console.log("败的：");
  for (const 名 of 败的) console.log(`  - ${名}`);
  process.exit(1);
}
