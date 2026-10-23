/**
 * 行内公式「用了几个 `$`」——**记住用户打了几个，存盘照原样写回去**（2026-09-27）。
 *
 * # 为什么会有这个文件
 *
 * 用户 2026-09-26 要的「`$$…$$` 不必独占一行」落地之后，露出了一条**存盘会改字节**
 * 的尾巴（`docs/05` §4.6c 那条 ⚠️⚠️）：`$$x$$` 存盘变成 `$x$`。两种写法解析出来是
 * 同一颗公式、看的人看不出区别，所以当时记的是「**要不要保留 `$$` 是产品决定，待
 * 用户拍板**」（`docs/07` backlog 第 53 项）。2026-09-27 用户拍了：**保留**。
 *
 * 这条决定与用户定的另一条死规矩其实是同一件事的两面——「**如果关闭，存盘不要
 * 自动修复**」（宽松档是默认，`docs/05` §4.7）：`$$x$$` 是用户自己敲的、是**合法的
 * Markdown**（`remark-math` 认它、`$$` 两个都是行内公式），把它改写成 `$x$` 就是
 * 替用户改文档。所以这个文件干的事只有一件：**把"几个 `$`"这个信息一路带过去**。
 *
 * # 为什么不能只改序列化器
 *
 * mdast 的 `inlineMath` **没有"用了几个 `$`"这个字段**（它只有 `value`），写回时的
 * 美元数是 `mdast-util-math` **按值现算**的（`lib/index.js:241-257`：默认 1 个，
 * 值里出现孤立的 `$` 时才加到 2）。也就是说**信息在解析那一步就丢了**，光改序列化器
 * 救不回来——必须自己另记一处。记在哪儿，就是下面三件事。
 *
 * # 三处（少一处就静默失效，而且不报错）
 *
 * | 哪一步 | 在哪 | 干什么 |
 * |---|---|---|
 * | 文件 → mdast | `标美元数`（一个 `$remark` 插件） | 照着**源码偏移**数出开头有几个 `$`，写进 mdast 节点的 `data` |
 * | mdast ↔ PM 节点 | `行内公式规格` 那两个 `runner` | 搬进 `attrs.dollars` / 搬回 mdast 的 `data` |
 * | mdast → 文字 | `行内公式处理器` | 按这个数，选**上游现成的**两条处理器之一（1 个 `$` / 2 个 `$`） |
 *
 * ⚠️ **打字那条路不走第一格**：`math-input.ts` 的两条输入规则自己造节点，`$$` 那条
 * 直接写 `dollars: 2`（当场知道的事，不用回头再数）。
 *
 * # 为什么要动 `math_inline` 的 schema（而 `math-view.ts` 一个字都不动）
 *
 * ProseMirror 里**每个节点能存东西的地方只有 `attrs`**，所以"记住几个 `$`"绕不开
 * 给它加一个属性。加法走官方的登记函数 `$nodeSchema`（**顶层
 * `@milkdown/kit/utils` 那一份**），用**同一个 id** `"math_inline"`：
 *
 * - **不是**把上游那份规格复制一遍：上游那份是**从 ctx 里现场取的**
 *   （`ctx.get(mathInlineSchema.key)`），改完再登记回同一个 id。所以"上游那份"
 *   仍然是唯一的事实来源——上游哪天改了 `runner`，我们这边跟着走。
 * - ⚠️ **不用 `mathInlineSchema.extendSchema`**（这是个踩过的坑，别改回去）：
 *   `@milkdown/plugin-math@7.5.9` 自己嵌了一份 `@milkdown/utils@7.5.9`（顶层是
 *   7.22.1），两份的 `extendSchema` **不是同一套实现**——顶层那份返回 `$NodeSchema`、
 *   登记走 `upsertById`（**就地替换、位置不动**），plugin-math 嵌的那份返回**一个
 *   插件**、体里把节点**挪到 `nodesCtx` 末尾**。两者写的是**同一个 `nodesCtx`**
 *   （都从不嵌套的 `@milkdown/core` import），所以不是"写飞了"，而是"顺序会挪"——
 *   排在 `math` 后面的节点插件（比如 `diagram`）会把 `math_inline` 挤到前面去。
 *   顶层那份还多个好处：**它带 `.key`**，测试能把这份规格取出来量（plugin-math
 *   那份的产物没有 `.key`，取不出来）。详见第二格那段注释。
 * - NodeView 那一侧**不受影响**：`$view` 登记的是 `[type.id, view]`（字符串 `math_inline`，
 *   见 `$view.ts`），不是那个 `$Node` 对象的身份。
 *
 * ⚠️ **代价如实记**：`math_inline` 从此**有** `attrs` 了（`dollars`，默认 1）。所以
 * `tests/math-view.test.ts` 里那条「`math_inline` 连 attrs 都没有」量的是**上游那份**
 * 规格——那一条仍然对（它量的是 `mathInlineSchema.ctx` 里那个函数），但**别再照它
 * 推断"本仓的 `math_inline` 没有属性"**。
 *
 * # 口径与边界
 *
 * - **记的是"开头那几个 `$`"，只可能是 1 或 2**：`$$$ab$$` 这种三个 `$` 起的，
 *   micromark **根本不当公式读**（整段字面，见 `math-input.ts` 文件头那张表），
 *   所以 3 及以上到不了这里；真到了（源码偏移算歪了）也**退回 1**——退回 1 的后果
 *   只是"这一次没保留住"，不是丢字。
 * - **按源码偏移数，不按值猜**：`$$\frac{a}{b}$$`（值里有反斜杠、有花括号）、
 *   `$$𝒜$$`（星光面字符）都一样——数的是 `$$` 那两个字节，跟公式里写什么无关。
 * - ⚠️ **粘贴/拖拽进来的公式拿不到这个数**（DOM → 节点那条路走 `parseDOM`，
 *   那上面没有"几个 `$`"），落到默认值 1。这是**有意的**：从别处粘进来的公式
 *   本来就没有"用户自己敲的几个 `$`"可言。
 * - ⚠️ **块公式（`math_block`）本来就没这个问题**：它的 `$$` 各占一行、存出去还是
 *   两行（`toMarkdown` 交的是 `math` 节点，`mdast-util-math` 那个 handler 按
 *   `longestStreak + 1` 现算，最少 2 个）。所以这里只管行内。
 *
 * # 序列化那一步为什么不自己抄一份 handler
 *
 * 上游 `mdast-util-math` **导出了** `mathToMarkdown(options)`，而 `singleDollarTextMath:
 * false` 这个选项的含义正好是"行内公式一律用两个 `$`"（`lib/index.js:246-248`：
 * `if (!single) size++`）。于是"要写两个 `$`"这件事不用自己拼——建两份处理器，
 * 按数选一份。**自己抄一份的代价是**：那个 handler 里还有"值首尾是空格就补空格"
 * 与"值里的换行要防住块级陷阱"两段（同文件 `:274-330`），抄漏一段就是静默的格式
 * 漂移。⚠️ 这是**本仓第一条直接依赖 `mdast-util-math` 的地方**（它本来只是
 * `remark-math` 的传递依赖），所以 `package.json` 里显式列了它——理由与 `mermaid`
 * 那条一样：**用到了就写出来**，别靠"谁碰巧装了它"。
 *
 * ⚠️ **覆盖得掉上游那条处理器**，靠的是 `mdast-util-to-markdown` 的 `configure()`
 * 顺序（`lib/configure.js:20-27`：**先**展开 `extensions`，**后**铺顶层 `handlers`）——
 * remark-math 那条 `inlineMath` 是从 `data.toMarkdownExtensions` 进来的，而我们这条
 * 走 `remarkStringifyOptionsCtx.handlers`，**后写，所以赢**。（`atom-space.ts` 里那条
 * `handlers.text` 靠的是同一个顺序。）
 *
 * # ⚠️ 2026-10-04：第五格**当天就撤回了**（用户拍板）
 *
 * 这天早些时候按 Typora/Pandoc 的判据加过一格：**值两边紧挨空格的 `$…$` 不算公式**
 * （`$ 你好 $` 整段还原成正文）。用户当天下午在分屏预览里发现它顺手把
 * `$ \LaTeX $` 这种**带空格的常见写法**也判成了普通文字（不再渲染），当场拍了
 * 「**整条撤回**」。于是这一段连代码带测试一起删掉，行为回到上游默认：
 * **任何 `$…$` 都是公式**——解析、打字两条路一起回，理由见 `math-input.ts` 那张
 * 「解析器怎么读我就怎么转」的表。
 *
 * ⚠️ **撤回是知情的，代价如实记**（`docs/07` §2 那条 BUG-62 与 `docs/06` §5.51）：
 * `mdast-util-math` 解析时就把值两端的空白 trim 掉了（`$ \LaTeX $` → 值 `\LaTeX`），
 * 存盘写回去是 `$\LaTeX$`——**里外两个空格会没**。这不是新 bug，是上游行为：
 * 加第五格之前它就是这样的，撤回之后又回到它。真要不吃那两颗空格，只有一条路——
 * 像 `dollars` 那样**另记一处"两边有没有空格"**、序列化时补回去（用户这次没要，
 * 方案留在 `docs/07` §3 里）。
 *
 * 判据原文（Typora 那四张截图、本仓与它的逐条差别、为什么"只收窄 inlineMath"）
 * 在 `docs/06` §5.51 与 `docs/07` §4 那天那一行里；这里只留结论与代价，
 * 免得下一个人再照 Typora 加一次。
 */

import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import { mathInlineSchema } from "./math-schema";
import { mathToMarkdown } from "mdast-util-math";

/**
 * 属性名：这一颗行内公式在源码里**用了几个 `$`**（只可能是 1 或 2）。
 *
 * ⚠️ 取 ASCII 是为了它可能出现在剪贴板的 JSON 里（`nodeFromJSON` 那份），
 * 中文键名在 JSON 里合法，但没必要在**跨进程的数据**里用中文——Lua 那三条
 * 「标识符一律 ASCII」讲的是另一件事（那边是语法错误）。
 */
export const 美元数属性 = "dollars";

/**
 * 源码里 `起` 那个偏移往前数，**开头连着几个 `$`**（结果只给 1 或 2）。
 *
 * ⚠️ 数出来是 0 或 1 一律**退回 1**：0 说明这个偏移上压根不是 `$`（位置算歪了），
 * 那时保守写回 `$x$` —— 后果只是"这次没保留住"，不会丢字、也不会写出两个 `$`
 * 把公式拆成两半。3 及以上同理（那种源码 micromark 就不当公式读）。
 */
export function 数开头美元(源: string, 起: number): number {
  let n = 0;
  while (源[起 + n] === "$") n++;
  return n >= 2 ? 2 : 1;
}

/**
 * 从一个 PM 节点（或一个 mdast 节点）上读那个数；**没有就按 1 算**。
 *
 * ⚠️ 默认必须是 1：老剪贴板数据、`parseDOM` 那条路、别处手工 `create()` 出来的节点
 * 上都没有这个属性，而"没有"最合理的解释就是"用户写的是 `$x$`"。
 */
export function 读美元数(持有者: { attrs?: unknown; data?: unknown }): number {
  const 甲 = (持有者.attrs ?? {}) as Record<string, unknown>;
  const 乙 = (持有者.data ?? {}) as Record<string, unknown>;
  const 值 = 甲[美元数属性] ?? 乙[美元数属性];
  return 值 === 2 ? 2 : 1;
}

/* ── 第一格：文件 → mdast（数出源码里那几个 `$`）───────────────────────── */

/** `$remark` 那个工厂的类型（**从它自己的参数里反推**，不引额外类型）。 */
type 转换器工厂 = Parameters<typeof $remark<"标美元数", undefined>>[1];

/**
 * 标注插件：把"开头几个 `$`"写进每颗 `inlineMath` 节点的 `data`。
 *
 * ⚠️ **三层箭头，少一层编译不过**：`$remark` 要的那个东西是 remark 的**插件**
 * （`Plugin<[选项], Root>`），不是转换器——`注解 → 选项 → 转换器`。写两层时
 * `tsc` 报的是「Target signature provides too few arguments. Expected 2 or more,
 * but got 1」，而参数变成隐式 `any`（条件类型没法参与上下文推断）。**三层写对了，
 * 树与文件两个参数都是真类型**（mdast 的 `Root` / `VFile`），底下那段按 `type`
 * 收窄、`position.start.offset` 取值都能编译过——所以这里**不需要**自己拼一份
 * 最小接口（`atom-space.ts` 那种写法是因为它拿到的处理器签名是条件类型）。
 *
 * ⚠️ **它只在解析那一趟有意义**：写进 `data` 的是我们自己的一个字段，
 * `mdast-util-math` 不认识它、`toMarkdown` 也不看它——**一个字节都不改**。
 * （对比 `atom-space.ts` 第一版：那个插件在解析那趟真的改了内容，所以打开一份
 * 老文件就动字节。）
 *
 * ⚠️ 转换器**只在解析那一趟跑**（`stringify()` 不跑转换器，`create.ts` 里那段
 * 注释记着这件事），所以这里不必担心"存盘时又来标一遍"。
 *
 * 位置来源：`node.position.start.offset` 是**源码字符串里的下标**，而
 * `ParserState.run()` 把整份 Markdown 当 `VFile` 的 value 递给了转换器
 * （`@milkdown/transformer/src/parser/state.ts:212-219`），所以两边同源、切得准。
 *
 * ⚠️ 单独导出来是**给测试用的**：`tests/math-delim.test.ts` 要把它挂到一台真
 * `unified()` 处理机上（走 `$remark` 那一层只有建整个 `Editor` 才跑得到）。
 */
export const 标美元数插件: ReturnType<转换器工厂> = () => (树, 文件) => {
  const 源 = typeof 文件?.value === "string" ? 文件.value : "";
  if (!源) return;

  const 走 = (节点: (typeof 树)["children"][number]): void => {
    if (节点.type === "inlineMath") {
      const 起 = 节点.position?.start?.offset;
      if (typeof 起 === "number") {
        节点.data = { ...节点.data, [美元数属性]: 数开头美元(源, 起) };
      }
    }
    // ⚠️ 收窄成"有 children 的那些"：`RootContent` 里有 `text` 这种没有孩子的，
    // 不收窄直接取 `.children` 编译不过（mdast 的类型是准的，别去 `as any`）。
    if ("children" in 节点) for (const 孩 of 节点.children ?? []) 走(孩);
  };

  for (const 孩 of 树.children ?? []) 走(孩);
};

/** 那个插件本体（三层里的**后两层**：选项 → 转换器）。 */
const 标美元数工厂: 转换器工厂 = () => 标美元数插件;

/** 挂给 milkdown 的那一份：`.use()` 得**排在 `math` 后面**（转换器按注册顺序跑，晚的在后）。 */
export const 标美元数 = $remark("标美元数", 标美元数工厂);

/* ── 第二格：mdast ↔ PM 节点（搬进 attrs，再搬回去）───────────────────── */

/**
 * `math_inline` 的规格，**加一个 `dollars` 属性**，并把那两个 `runner` 换成会搬它的。
 *
 * ⚠️ 两个 `runner` 都是**照着上游那份写的**（`plugin-math/src/index.ts`：
 * `openNode(type).addText(node.value).closeNode()` / `addNode("inlineMath", void 0,
 * node.textContent)`）——**只多搬一个数**。改这两处最容易出的错是"顺手把源码取成
 * 别的东西"（行内的源码在**内容**里、块在 **`attrs.value`** 里，这是 `math-view.ts`
 * 文件头点名的那条），所以下面两句的顺序与参数一个都没动。
 *
 * ⚠️⚠️ **这里用的是顶层 `@milkdown/kit/utils` 的 `$nodeSchema`，不是
 * `mathInlineSchema.extendSchema`**——这是个踩过一次的坑，记清楚：
 *
 * - `@milkdown/plugin-math@7.5.9` 的 `package.json` 把 `@milkdown/utils` 钉在
 *   **7.5.9**，于是 `node_modules/@milkdown/plugin-math/node_modules/` 下**另有一份**
 *   `@milkdown/utils`（顶层是 7.22.1）。`mathInlineSchema.extendSchema` 是**那一份**的函数，
 *   和顶层那份**不是同一套实现**：
 *   - 顶层 7.22.1：`extendSchema` 返回一个 **`$NodeSchema`**（就是 `[规格切片, 节点插件]`
 *     那个数组），登记走 `upsertById`——**就地替换、位置不动**（`utils.ts:16-19` 的注释：
 *     换位置会让 ProseMirror 的 content-match 走到另一个首节点上、然后无限递归）。
 *   - plugin-math 里那份 7.5.9：`extendSchema` 返回一个**插件函数**（`.use()` 直接吃），
 *     体里写的是 `[...filter(id !== 这个), [id, 新规格]]`——**把 `math_inline` 挪到
 *     `nodesCtx` 末尾**。末尾就末尾，可它有别的节点插件排在我们后面时（比如 `diagram`），
 *     顺序就真的变了。
 *   - 两份的 `nodesCtx` **是同一个切片**（都从**没被嵌**的 `@milkdown/core` 里 import），
 *     所以不是"写进了没人读的地方"，而是"写进去了、但顺序可能挪"。
 * - 换成顶层 `$nodeSchema("math_inline", …)` 之后两条都解决了：位置就地不动，
 *   而且**它带 `.key`**——所以 `tests/math-delim.test.ts` 能直接把这份规格取出来量
 *   （plugin-math 那份 `extendSchema` 的产物没有 `.key`，取不出来）。
 * - id 仍然是 `"math_inline"`（字符串），所以 `$view(mathInlineSchema.node, …)`
 *   （`math-view.ts`）与 ProseMirror 那边**都不受影响**。
 *
 * ⚠️ 上游那份规格是从 **ctx 里现场取**的（`ctx.get(mathInlineSchema.key)`），不是
 * 模块加载时取的——插件跑之前那个切片里什么都没有。取之前先 `mathInlineSchema.ctx(ctx)`
 * 兜一下（**幂等**：`create.ts` 里 `math` 那条本来就会注入），这样这个插件单独用
 * 也不会因为缺切片而炸。
 */
export const 行内公式规格 = $nodeSchema("math_inline", (ctx) => {
  mathInlineSchema.ctx(ctx);
  const 原 = ctx.get(mathInlineSchema.key)(ctx);
  return {
    ...原,
    attrs: { ...原.attrs, [美元数属性]: { default: 1 } },
    parseMarkdown: {
      ...原.parseMarkdown,
      runner: (state, node, type) => {
        state
          .openNode(type, { [美元数属性]: 读美元数({ data: node.data }) })
          .addText(node.value as string)
          .closeNode();
      },
    },
    toMarkdown: {
      ...原.toMarkdown,
      runner: (state, node) => {
        state.addNode("inlineMath", undefined, node.textContent, {
          data: { [美元数属性]: 读美元数(node) },
        });
      },
    },
  };
});

/* ── 第三格：mdast → 文字（按数选一条上游处理器）──────────────────────── */

/** 序列化选项的类型：**从 ctx 反推出来**（与 `lax-heading.ts` / `atom-space.ts` 同一套写法）。 */
type 串化选项 = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;
/** mdast 的行内公式处理器（`handlers.inlineMath` 那一条）。 */
type 行内处理器 = NonNullable<NonNullable<串化选项["handlers"]>["inlineMath"]>;

/** 上游那份，`singleDollarTextMath` 用默认值（1 个 `$`）。**建一次就够**，它是纯的。 */
const 上游单美元 = mathToMarkdown();
/** 上游那份，显式关掉单美元 ⇒ 一律 2 个 `$`。 */
const 上游双美元 = mathToMarkdown({ singleDollarTextMath: false });

/**
 * 本仓的行内公式处理器：**按 `dollars` 选上游那一份**，一个字都不自己拼。
 *
 * ⚠️ 上游那两份是**构造时就定死的**（`singleDollarTextMath` 进了闭包），所以这里
 * 只能"选"，不能"传参"——换个写法（比如自己拼 `'$'.repeat(n)`）就绕开了上游那两段
 * 边界处理（首尾补空格、值里的换行防块级陷阱），那正是这个文件要避免的事。
 */
export function 行内公式处理器(): 行内处理器 {
  return (node, parent, state, info) => {
    const 选 = 读美元数(node) >= 2 ? 上游双美元 : 上游单美元;
    const 处理 = 选.handlers?.inlineMath;
    if (!处理) return "";
    return 处理(node, parent, state, info);
  };
}

/* ── 第四格：正文里的 `$` 不要被转义（`handlers.text` 那一层）─────────────── */

/**
 * 上游给**正文里的每一颗 `$`** 前面都加一颗反斜杠，这里把它去掉。
 *
 * # 症状（用户 2026-10-04 第二次报「还是会自动插入斜杠」）
 *
 * `mdast-util-math` 的 `mathToMarkdown().unsafe` 里有这么一条
 * （`lib/index.js:184-193`）：
 *
 * ```js
 * {character: '$', after: undefined, inConstruct: 'phrasing'}
 * ```
 *
 * `after: undefined` = **不看后面是什么**，`inConstruct: 'phrasing'` = **行内到哪儿都算**。
 * 于是普通正文里的一颗 `$`（`价格 100$ 起`、`$ 你好 $`）存盘一律变成 `\$`——
 * 用户一个字节都没打过。⚠️ **与行首竖线那条是同一类病**：所见即所得里 `\$` 与
 * `$` 长得一模一样（转义在渲染那一步就被吃掉了），用户在屏幕上看不见，只在切到
 * 源码模式、或用别的编辑器打开时才发现，报到我们这儿就成了「自动插入斜杠」。
 *
 * ⚠️ 上游为什么敢这么干：`singleDollarTextMath` 默认是 **true**，也就是
 * **同一段行内内容里任意两颗 `$` 之间都是公式**（`micromark-extension-math` 的
 * `math-text.js`：`between` 连空格、换行都收）。它一行一行地写，看不见另一颗 `$`
 * 在哪一行，所以宁可全转义。
 *
 * # 判据：这一段的 `$` **全在这一颗文本节点里**才动手
 *
 * 去掉反斜杠之后，那几颗 `$` 就**活了**——**可能当场拼成公式**。所以只在能算清的
 * 时候动手：
 *
 * 1. 这颗文本节点的**直接父节点**必须是段落／标题／表格格子（`paragraph` /
 *    `heading` / `tableCell`）。⚠️ 夹在粗体、链接里的（父是 `strong` / `link`…）
 *    **一个字都不动**：那时我看不见同一段里还有没有别的 `$`，而**跨过行内节点的
 *    配对是真的**（两颗 `$` 不必挨着，也不必在同一行）。
 * 2. 把父节点**整棵子树**里所有字符串里的 `$` 数一遍，必须**恰好等于**这一颗自己
 *    值里的 `$` 数。多一颗（兄弟里还有公式节点、还有带 `$` 的文本）就不动手。
 *    ⚠️ 数多了只影响"动不动手"，是安全的一边；数漏了才会改错字节，所以 `数美元`
 *    的走法是"看见字符串就数"，**不挑字段名**，还专门把公式节点**现拼的那两颗
 *    分隔符**加回去（它们不在任何字段里）。
 * 3. 认不出父节点是谁（`parent` 没到手）⇒ 不动。
 *
 * ⚠️ **1 ＋ 2 合起来的意思**：
 *
 * | 这一颗里的 `$` | 放掉之后 | 结果 |
 * |---|---|---|
 * | 一对（`$ 你好 $`） | 两颗重新配对 ⇒ **行内公式** | 用户打它就是想写公式 ⇒ **对的** |
 * | 一颗（`价格 100$ 起`） | 一颗拼不成公式 ⇒ **还是文字** | 字节守恒 ⇒ **对的** |
 *
 * 两档都**稳定**：前者稳定在公式上，后者稳定在文字上，**不会来回抖**
 * （`tests/math-delim.test.ts` 最后那条量的是这个）。
 *
 * # ⚠️ 已知代价（如实记）
 *
 * - **一颗 `$` 挨着别处的 `$` 时不动手**：`公式 $x$ 和 100$` 里那一颗会一直带着
 *   反斜杠（旁边那颗公式节点也算 `$`，判据 2 不成立）。代价是"难看"，换的是
 *   "绝不在算不清的地方替用户改字节"。
 * - **公式节点自己从不经过这一层**：`inlineMath` 的处理器是自己拼 `$…$` 的
 *   （不走 `state.safe`），本来就不会被转义——这里只管正文。
 * - ⚠️ 只认**反斜杠**这一种转义写法（`\$`）：上游对 `$` 用的就是它（`$` 是
 *   ASCII 标点，`state.safe` 走字符转义那条路）。真出现 `&#x24;` 那种写法，
 *   这一层**认不出**、也就不动手——不会改错，只是没修上。
 *
 * # 挂在哪
 *
 * `text-handlers.ts` 那一串里，**套在行首竖线那层里面**（两层都盯着"最终字节"，
 * 但一个看 `|`、一个看 `$`，判据不相交，顺序换了也一样；换的时候记得重跑
 * `tests/table-pipe.test.ts` 与 `tests/math-delim.test.ts`）。
 */

/** mdast 的文本处理器（`handlers.text` 那一条）。⚠️ 不引 `text-handlers.ts` 那份：
 *  那个文件 import 本文件，引回来就是绕圈。同一套 `串化选项` 反推写法。 */
type 文本处理器 = NonNullable<NonNullable<串化选项["handlers"]>["text"]>;

/** mdast 节点里我们真正会读的那几个字段（不引 `@types/mdast`，够用就好）。 */
type Mdast节点 = { type: string; value?: string; children?: Mdast节点[] };

/** 本层认得的"行内内容的家"：段落、标题、表格格子。 */
const 认得的父 = new Set(["paragraph", "heading", "tableCell"]);

/**
 * 一串东西（递归地）写进文件时会带几颗 `$`。**往多处数**（数多了不动手，安全）。
 *
 * ⚠️ 公式节点的分隔符**不在任何字段里**（`value` 只有公式本身，是处理器现拼的），
 * 所以要单独按 `dollars` 补回来——不补的话"兄弟是一颗公式"会被数成 0 颗，
 * 判据 2 就放行了，那可就是替用户改字节了。
 */
export function 数美元(件: unknown): number {
  if (typeof 件 === "string") return 件.split("$").length - 1;
  if (Array.isArray(件)) return 件.reduce<number>((和, 颗) => 和 + 数美元(颗), 0);
  if (件 && typeof 件 === "object") {
    const 节 = 件 as { type?: string };
    let 和 = 0;
    for (const 值 of Object.values(件)) 和 += 数美元(值);
    if (节.type === "inlineMath") 和 += 2 * 读美元数(件 as { attrs?: unknown; data?: unknown });
    return 和;
  }
  return 0;
}

/** 上游写出来的那一颗转义美元（前面**不是**反斜杠的那种，见文件头）。 */
const 被转义的美元 = /(^|[^\\])\\\$/g;

/**
 * 包一层：把正文里被上游转义掉的 `\$` 放回 `$`（判据见文件头）。
 *
 * `原文` 是 Milkdown 自己那条文本处理器（`handlers.text`）；**没有它就原样返回**。
 */
export function 不转义美元(原文?: 文本处理器): 文本处理器 {
  return (node, parent, state, info) => {
    if (!原文) return node.value ?? "";
    const 输出 = 原文(node, parent, state, info);
    if (!输出.includes("\\$")) return 输出;
    const 父 = parent as Mdast节点 | undefined;
    if (!父 || !认得的父.has(父.type)) return 输出; // 判据 1
    if (数美元(父.children) !== 数美元((node as Mdast节点).value)) return 输出; // 判据 2
    return 输出.replace(被转义的美元, "$1$");
  };
}
