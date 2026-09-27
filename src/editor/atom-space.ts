/**
 * 行内原子节点后面那颗空格：**存盘时不写成 U+00A0**，写成用户敲的那个普通空格。
 *
 * # 症状（2026-09-26 目检里发现的）
 *
 * 行内公式后面紧跟一个空格，存盘时那个空格是 **U+00A0**（不换行空格），
 * 不是用户敲的空格：
 *
 * ```text
 * 打字：A$bb$M-BM- B        ← `cat -A` 的输出，`M-BM- ` 就是 U+00A0
 * C$dd$M-BM- D
 * ```
 *
 * 同一份文件里"空格两边都是普通文字"的那一行（`Q W`）是**正常空格**。
 * 所以这不是"空格全坏了"，而是**只发生在行内原子节点后面**。
 *
 * # 根因：那是 WebKit 故意给的不换行空格
 *
 * WebKit 的编辑引擎在**不可编辑的行内元素**（公式、图片这些渲染成
 * `contenteditable=false` 的原子）后面插空格时会改用不换行空格——它怕这个
 * 空格挨着非文本元素、在后续编辑里被折叠掉。代价是那颗 NBSP 成了**文档里的
 * 字符**：不换行、看不见、用户没敲过。
 *
 * ⚠️ **不是这次改动引入的**：改之前那条上游输入规则产出的 `C$dd$ D` 落盘也是
 * `M-BM- `（`h1.md` 里那次目检的字节还在），是行内公式一直有的老毛病。
 *
 * # ⚠️⚠️ 第一版是"在编辑器里把它拦下来"，**开窗实测证明那条路走不通**
 *
 * 第一版挂的是 ProseMirror 的 `handleTextInput`（NBSP 已经进了 DOM 之后），
 * 后来还加了一条更早的 `handleKeyDown`（按键那一刻就 `preventDefault`，
 * 让浏览器一个字节都不往 DOM 里写）——**单元测试全绿，真窗口里那颗空格却会
 * 消失**：
 *
 * ```text
 * 真窗口打字：Q W ⏎ A$bb$␣B   →  存盘：Q W ⏎⏎ A$bb$B      ← 那颗空格没了
 * ```
 *
 * 三次实测把结论钉死了（都在无头窗口里、`od -c` 读的落盘字节）：
 *
 * 1. **同一次运行里"空格两边都是普通文字"的那行（`Q W`）是好的**，所以不是
 *    工装丢按键。
 * 2. 把拦下来那一支临时改成插一个可见的 `~` 再开窗打字，**文件里出现了 `~`**
 *    ⇒ 拦截这条路**确实会被调用**，问题是"插进去的那颗**空格**被随后的某一步
 *    吃掉了"（`~` 不被吃）。
 * 3. 敲完空格**不再敲别的**，那颗空格**能存进文件**；**紧接着再敲一个字符**，
 *    它就在存盘时不见了。而"从文件里读进来的普通空格"（`A$bb$ B` 打开后接着
 *    打字）**是稳的**。
 *
 * 第 3 条就是答案：**浏览器在后续编辑里会清掉"非可编辑元素旁边那个可折叠的
 * 空格"**——WebKit 当初改写成 NBSP 正是为了不让它被清掉。**跟它抢，输的是
 * 那颗空格**（用户敲了、文档里没有 = 丢内容），比"文件里多一个看不见的字符"
 * 严重得多。所以拦截那一版**整个删掉了**。
 *
 * # ⚠️⚠️ 第二版换成了 `$remark` 插件，**那是个静默的空操作**
 *
 * 第二版挂的是 `$remark("nota-atom-space", …)`：写一个**转换器**
 * （`() => (tree) => {…}`）在树被写成文本之前改那颗字符。**看着很对，其实一次
 * 都不会被调用**——装上去之后必须验一遍才看得出来：
 *
 * ```js
 * // unified 里探的（`node -e` 那种规模的小脚本，结论与版本无关）：
 * const p = unified().use(remarkParse).use(探针).use(remarkStringify);
 * p.stringify(p.parse("hello\n"));   // → "hello\n"   转换器没跑
 * ```
 *
 * 原因在 **unified 的语义**：**转换器只在 `run()` / `process()` 里跑**，
 * `stringify()` 只调**编译器**（`unified/lib/index.js:995`，函数体里只有
 * 一句 `compiler(tree, realFile)`）。而 Milkdown 的序列化器走的正是后者：
 *
 * ```js
 * // @milkdown/transformer/lib/index.js:374
 * this.toString = (remark) => remark.stringify(this.build());
 * ```
 *
 * ⚠️ 上游那些 remark 插件（`preset-commonmark` / `preset-gfm` / `plugin-math`）
 * **不靠转换器**：它们往 `data("micromarkExtensions" / "toMarkdownExtensions")`
 * 里塞东西，**编译器**自己去读。所以"别人也这么挂"这个印象是错的——
 * 挂得上去、也确实没人报错，**但这一支根本没有执行过**。
 *
 * ⚠️ **这一版的教训比 bug 本身值钱**：`$remark` 挂上去、`tsc` 干净、
 * 单测全绿、开窗也不报错——**只有"对着输出字节数一数"才看得出来**。
 * 所以下面这版写完照旧要开窗读 `od -c`（`docs/06` §5.22），**不许只看测试**。
 *
 * # 现在这一版：换掉 `handlers.text`（**与 `lax-heading.ts` 同一个手法**）
 *
 * `remarkStringifyOptionsCtx` 里那份 `handlers` 是 `mdast-util-to-markdown` 的
 * **公开扩展点**，Milkdown 原样透传给 `remarkStringify`（`@milkdown/core/lib/index.js:108`），
 * 而且它**默认就自带一条 `text` 处理器**（同文件 `:25`）。所以这里做的事只有一件：
 * **包一层**——轮到某个文本节点时，先看它是不是"紧跟在行内原子后面那颗 NBSP"，
 * 是就把值换回普通空格，再交给原来那条处理器。
 *
 * ⚠️ **同一份 `handlers.text` 上已经挂了 `不转义行首井号`**（`lax-heading.ts`），
 * 两条是**套着**的（`create.ts` 那一行里一眼能看出来谁在外层）。两条各自只看
 * 自己认的那个字符、各自把原文传下去，**互不干扰**。
 *
 * 两处边界：
 *
 * 1. **只换"紧跟在行内原子后面"的那一颗**（`行内原子` 那张表），而且是
 *    **文本节点开头**那一颗——那正好是 WebKit 塞进来的位置。别处的 NBSP
 *    一律不动：用户从别处粘进来的、自己写进公式源码里的，都是他的内容。
 * 2. **不动别的字符**。这不是"清洗所有不可见字符"，只认这一个码点、
 *    只认这一个位置。
 *
 * # 只在**写**的那一趟生效（与第二版不同，这是好事）
 *
 * 第二版那个 remark 插件**解析那一趟也会跑到**（`remarkCtx` 那一串同时喂给
 * 解析器与序列化器，而解析走的是 `runSync`，转换器**会**跑），所以当时还得
 * 接受一条副作用：**打开**一份手写的老文件时那颗 NBSP 就被改掉了。
 * 换成 `handlers.text` 之后这条副作用没了——**处理器只在序列化时被调用**，
 * 打开文件的那一趟一个字节都不动。于是口径干净成一句话：
 * **只有存盘会动它，而且只动那一颗**。（打开带 NBSP 的老文件 → 那次存盘
 * 就会把它写回普通空格，这正是要的结果。）
 *
 * ⚠️ **代价要一并记下来**：**文档里那颗字符仍然是 NBSP**——所以在编辑器里
 * `Ctrl+F` 搜 `A$bb$ B` 搜不到（**查找是这个形状的人第一个会撞上的地方**），
 * 复制出去也带着 NBSP。这是**换来"空格不会丢"所付的钱**，不是没想到。
 * 要把编辑器里那颗也变成普通空格，就得让 WebKit 肯留着一颗可折叠的空格——
 * 那是第一版撞过的墙。
 */

import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

/**
 * 不换行空格（U+00A0）。
 * ⚠️ 全仓只在这里写这个码点；别处要判它请引这个名字。
 */
export const 不换行空格 = "\u00a0";

/**
 * remark 序列化选项的类型：**从 ctx 反推出来**（与 `lax-heading.ts` 同一套写法）。
 *
 * ⚠️ 别为了这几个字把 `remark-stringify` 列进 `package.json`——它只是
 * `@milkdown/core` 的间接依赖。这里顺着 `SliceType` 上那个 `_typeInfo`
 * 把类型拿回来，一分钱不多花。
 */
type 串化选项 = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;
/** mdast 的文本处理器（`handlers.text` 那一条）。 */
type 文本处理器 = NonNullable<NonNullable<串化选项["handlers"]>["text"]>;

/** mdast 节点里本仓要用到的那两个字段（不引 `@types/mdast`，只取用得到的）。 */
interface Mdast节点 {
  type?: string;
  value?: string;
  children?: Mdast节点[];
}

/**
 * 哪些节点算"行内原子"（**紧跟在它们后面**的那颗 NBSP 才是 WebKit 塞的）。
 *
 * ⚠️ 这张表写的是**序列化时 mdast 里的节点名**，不是 ProseMirror 那边的名字，
 * 也不是 Markdown 语法里的写法。三个名字都是照着上游 `toMarkdown` 抄的：
 *
 * | mdast 类型 | 是谁 | 抄自 |
 * |---|---|---|
 * | `inlineMath` | 行内公式 | `@milkdown/plugin-math`：`addNode("inlineMath", …, textContent)` |
 * | `image` | 图片 | `@milkdown/preset-commonmark`：`addNode("image", …)` |
 * | `break` | 硬换行（`<br />`） | `@milkdown/preset-commonmark`：`addNode("break")` |
 *
 * ⚠️ **硬换行是 `break`、不是 `html`**：`<br />` 在 PM 里是 `hardbreak` 节点，
 * 它 `toMarkdown` 出来的是一个 `break` 节点。写成 `html` 就等于这一条悄悄失效
 * （而且**不会有任何报错**——这正是这一整个文件要防的那种错）。
 *
 * 链接（`link`）**不算**：它不是原子，后面那颗空格是用户正常打的。别的行内
 * 节点（表情、脚注引用……）本仓还没有，等有了再加——⚠️ **加之前先照上面那样
 * 去上游 `toMarkdown` 里把真实名字抄下来**。
 */
const 行内原子 = new Set(["inlineMath", "image", "break"]);

/**
 * 换法本身：**纯函数**，输入是本节点的值 ＋ **前一个兄弟的类型**，输出换过之后的值。
 *
 * ⚠️ 判据是 **"值以 NBSP 开头"** ＋ **"前一个兄弟是行内原子"**，两个缺一不可。
 * 只看"有没有 NBSP"会把用户粘进来的内容一起改掉（`docs/09` 里那条边界的原话）。
 *
 * ⚠️ 只换**开头那一颗**：后面的 NBSP 是用户自己写的，不动（真用户写不出来两颗，
 * 但"粘贴 ＋ 敲"能凑出来）。
 */
export function 换掉行内原子后的不换行空格(值: string, 前一兄弟类型: string | undefined): string {
  if (
    值.startsWith(不换行空格) &&
    前一兄弟类型 !== undefined &&
    行内原子.has(前一兄弟类型)
  ) {
    return " " + 值.slice(不换行空格.length);
  }
  return 值;
}

/**
 * 从一个文本节点在父节点里的位置找出**前一个兄弟的类型**（没有前一个就是 `undefined`）。
 *
 * ⚠️ `parent` 可能就是 `undefined`（`mdast-util-to-markdown` 处理根节点时会传
 * `undefined`，见它 `lib/index.js:66`），所以这里不能直接取 `.children`。
 */
function 前一兄弟类型(node: Mdast节点, parent: Mdast节点 | undefined): string | undefined {
  const 兄弟 = parent?.children;
  if (!Array.isArray(兄弟)) return undefined;
  const 位 = 兄弟.indexOf(node);
  if (位 <= 0) return undefined;
  return 兄弟[位 - 1]?.type;
}

/**
 * 包一层：轮到文本节点时，先把"原子后面那颗 NBSP"换回普通空格，再交给下面的处理器。
 *
 * `原文` 是 Milkdown 自己那条文本处理器（`remarkStringifyOptionsCtx` 的默认值里
 * 就有）；**没有它就原样返回**，不自己造一条——序列化是核心路径，宁可什么都不做
 * （这一条与 `lax-heading.ts` 那条一样）。
 *
 * ⚠️ **不改树上那个节点，改的是一份副本**：值换掉之后用 `{ ...node, value: 新值 }`
 * 交给 `原文`。序列化器本来就把这棵树丢掉，改不改都行，但"处理器不改入参"这件事
 * 少一个要记的前提。
 */
export function 原子后的空格(原文?: 文本处理器): 文本处理器 {
  return (node, parent, state, info) => {
    if (!原文) return node.value ?? "";
    const 值 = node.value ?? "";
    const 新值 = 换掉行内原子后的不换行空格(
      值,
      前一兄弟类型(node as Mdast节点, parent as Mdast节点 | undefined),
    );
    // ⚠️ 与 `值` 比、不是与 `node.value` 比：`value` 是 `undefined` 时上面按 `""`
    // 算的，跟 `node.value` 比就永远不等，等于每次都给副本（不致命，但白绕一圈）。
    if (新值 === 值) return 原文(node, parent, state, info);
    return 原文({ ...node, value: 新值 }, parent, state, info);
  };
}
