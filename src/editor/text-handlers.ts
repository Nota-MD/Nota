/**
 * 序列化时那一串**套着**的文本处理器（`remarkStringifyOptionsCtx` 的
 * `handlers.text`）到底套了哪几层、谁在外层。
 *
 * # 为什么单独一个文件（2026-09-27 拆出来）
 *
 * 这一串原来写在 `create.ts` 的 `.config()` 里，五层套完加注释约 25 行。那天
 * 加第五层（`table-pipe.ts`）时 `create.ts` 涨到 1011 行、顶破 1000 行的硬线
 * （`docs/09` §4）。拆的判据不是行数，而是**它自己就是一整件事**：五层各自的
 * 理由、顺序的讲究、"为什么不能挂 `$remark`"全是同一条知识，散在 `.config()`
 * 里反而更难看懂。`create.ts` 那边只剩一行调用。
 *
 * # 这五层是谁、为什么是这个顺序
 *
 * ⚠️ **最外层**要看的是"这一颗节点最终要落盘成什么"，所以排在最外面；
 * 里面几层只看自己认的那个字符：
 *
 * 1. **`不转义行首竖线`**（`table-pipe.ts`）——把行首 `|`（或 `|-` / `|:`）前面
 *    那颗多余的反斜杠去掉。⚠️ 它还要看这个节点**能不能占两行以上**（能就一个字
 *    都不动：下一行真有可能是分隔行），所以必须看见最终字节；
 * 2. `不转义孤立波浪号`——把**孤立**的 `\~` 去掉（`甲 ~ 乙` 不该存成 `甲 \~ 乙`；
 *    成对/贴边的照旧留着，判据在那个函数上）；
 * 3. `不转义行首等号`——把行首 `==重点==` 前面那个反斜杠去掉；
 * 4. `原子后的空格`——把 WebKit 塞在行内原子（公式/图片/硬换行）后面的那颗
 *    U+00A0 换回普通空格（`atom-space.ts`）；
 * 5. **最内层 `不转义行首井号`**（`lax-heading.ts`）——把行首 `#` 前面那颗多余的
 *    反斜杠去掉。
 *
 * 五条各自只看自己认的那个字符、各自把原文传下去，互不干扰（1、2 两层还要看
 * 上下文/兄弟节点，但判据互不相干：一个看的是"这一段几行"，一个看的是"这颗
 * 波浪号挨着谁"）。⚠️ 顺序**可以**换（这几条判据不相交），但每次换都要重跑
 * `tests/table-pipe.test.ts` 与 `tests/atom-space.test.ts`——"看起来不相交"和
 * "真的不相交"是两件事。
 *
 * # ⚠️ 只能挂在 `handlers.text` 上，不能挂 `$remark` 插件
 *
 * 序列化走的是 `remark.stringify()`，而 unified 的 `stringify()` **不跑转换器**
 * （只调编译器）——`$remark` 插件挂上去是个**静默的空操作**：不报错、屏幕上
 * 一点变化都看不出来。`atom-space.ts` 的第二版就栽在这儿，那一段里有探针与
 * 上游源码行号；上游那些 remark 插件靠的是 `toMarkdownExtensions` 这类 data，
 * 不是转换器。
 *
 * ⚠️ 另一个陷阱（`tests/table-pipe.test.ts` 文件头第 1 条记着）：**别把 `原文`
 * 弄丢**。这几层在没有原文时按本仓惯例把节点原值交出去，那等于**连上游的转义
 * 一起省了**——真表格里会写出坏字节（格子里的 `|` 不转义，一行被劈成三格）。
 * 生产路径上 `prev.handlers?.text` 一直在（不在的话前四层早就出事了），
 * 测试里则必须自己把 `mdast-util-to-markdown` 的 `defaultHandlers.text` 传进来。
 */

import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

import { 原子后的空格 } from "./atom-space";
import { 不转义行首等号, 不转义孤立波浪号 } from "./inline-marks";
import { 不转义行首井号 } from "./lax-heading";
import { 不转义行首竖线 } from "./table-pipe";

/** remark 序列化选项的类型：**从 ctx 反推出来**（同 `lax-heading.ts`）。 */
type 串化选项 = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;
/** mdast 的文本处理器（`handlers.text` 那一条）。 */
export type 文本处理器 = NonNullable<NonNullable<串化选项["handlers"]>["text"]>;

/**
 * 把五层套起来。`原文` 是 Milkdown 自己那条文本处理器
 * （`prev.handlers?.text`），**透传给最内层**。
 */
export function 文本处理器链(原文?: 文本处理器): 文本处理器 {
  return 不转义行首竖线(
    不转义孤立波浪号(不转义行首等号(原子后的空格(不转义行首井号(原文)))),
  );
}
