/**
 * 空段落**一个字节都不写**（2026-09-26，用户第二轮）。
 *
 * # 用户原话
 *
 * > 还有，enter 默认是真 enter 而非 `<br>`
 *
 * 说的是这件事：在正文里连敲两次回车（段落之间留一个空行），存盘之后文件里
 * 会多出一行**字面 `<br />`**。用户没打过那三个字符，它就是"自动修复"换了副面孔。
 *
 * # 那行 `<br />` 是哪来的
 *
 * 不在本仓，在 `@milkdown/preset-commonmark` 给 `paragraph` 写的那条序列化
 * （`lib/index.js:484-495`）：
 *
 * ```js
 * state.openNode("paragraph");
 * if ((!node.content || node.content.size === 0) && node !== lastNode && shouldPreserveEmptyLine(ctx))
 *   state.addNode("html", void 0, "<br />");
 * else serializeText(state, node);
 * state.closeNode();
 * ```
 *
 * 也就是：**任何一个空的段落节点**（只要它不是文档最后一个顶层节点）在存盘时
 * 都会变成一个 HTML 节点。它**不是**上游写错了——mdast 表达不了"两个连续的空行"，
 * 不留一个占位符，用户敲的空行存盘就没了（配对的那一半是解析侧的
 * `remarkPreserveEmptyLinePlugin`，它把 `<br />` 认回空段落）。
 *
 * # 为什么本仓判它**不值得留**（有实测，不是口味）
 *
 * 因为那个占位符**根本活不过一次重新打开**。`<br />` 单独占一行，重新解析时
 * 是**顶层 html 块**（不是段落里的行内节点），而解析侧那个插件会把顶层 html 节点
 * 直接**摘掉**（`visitEmptyLine`）。2026-09-26 拿 madst 实测：
 *
 * | 文件里的字节 | 解析出来 | 摘掉空行节点之后 |
 * |---|---|---|
 * | `甲\n\n<br />\n\n乙` | `paragraph, html, paragraph` | **`paragraph, paragraph`** |
 * | `甲\n\n\n\n乙` | `paragraph, paragraph` | `paragraph, paragraph` |
 *
 * 两行的**结果一样**：空段落都没了。
 * ⚠️ **本仓的真实前提（2026-09-26 晚实测，与上面的推理分开读）**：
 * 「上游会写 `<br />`」这句话**在本仓默认配置下不成立**——A/B 实测（摘掉本文件的
 * `.use()` 重新 `npm run build` 再跑）里 `甲` ⏎ ⏎ `乙` 存盘是 `甲\n\n乙\n`，
 * **一个 `<br />` 都没有**。`shouldPreserveEmptyLine(ctx)` 只在
 * `remarkPreserveEmptyLinePlugin` 注册过时为真，本仓这条链上它取到的是假。
 * ⇒ 所以本文件的作用是**把这个行为钉死成确定的**（不随上游默认值/配置漂移），
 * **不是**在修一个正在发生的错。这一点如实写在这里，省得下次有人拿着
 * "用户明明报过"去复现，然后怀疑自己。
 *
差别只在"存盘到重新打开之间，文件里那几个
 * 字节长什么样"。既然如此，占位符换来的是**每次存盘都往用户文件里塞三个他没打过的
 * 字符**，代价却是零收益——所以本仓选择**不写**。
 *
 * ⚠️ 表格那个特例也一起改了（`docs/05` §4.7 里记的"字面 `<br />` 最刺眼"那一条）：
 * 空单元格里的 `<br />` 是**唯一**真正能往返的一处（它在单元格内部，摘掉之后
 * 单元格里剩下的还是一个空段落，重新存盘还会再写一遍）。取消之后单元格的往返
 * 仍然成立（`| 1 |  |` 本来就解析得回来），只是**每次存盘不再多写那五个字符**。
 *
 * ⚠️ **解析侧一个字都没动**：`remarkPreserveEmptyLinePlugin` 照旧挂在那儿，
 * 所以别人（或老版本 Nota）写的、文件里真有 `<br />` 的文档，打开时的表现与
 * 从前完全一样——那行会被安静地摘掉，不会冒出一个字面 `<br />` 的块。
 *
 * # 代价，说在明处
 *
 * **用户故意敲出来的空段落，存盘再打开之后就没了。** 这不是本文件造成的：
 * 上面那张表已经证明了它**今天也活不过一次重新打开**（`<br />` 一样被摘掉），
 * 本文件只是让**文件里的字节**别再假装它留住了。换来的是另一条本仓一直想要的性质：
 * **打开再存，字节不变**（从前那条路是 `甲\n\n<br />\n\n乙` → 打开 → 存盘 →
 * `甲\n\n乙`，第一次存盘写进去的东西第二次存盘又自己没了）。
 *
 * # 落点为什么是"改 schema"，不是改序列化选项
 *
 * ⚠️ 那行 `<br />` 是**从 ProseMirror 节点转 mdast** 那一步产生的
 * （`toMarkdown.runner`），**不是** `remarkStringifyOptionsCtx` 里的
 * `handlers`。两者离得很近、很容易搞混：`handlers` 是 **mdast → 字符串**，
 * 那时候占位符已经是一个 html 子节点躺在段落里了，再从那儿拦只能写出一段
 * 空白（而且它和相邻块之间的空行是 `containerFlow` 按**节点类型**算的，
 * `handlers` 里改不动）——试过，`甲\n\n\n\n乙`，比 `<br />` 还吵。
 *
 * 所以改的是**段落的 schema 本身**：`extendSchema` 拿上一版，只替换
 * `toMarkdown.runner`，空段落直接 `return`（不 `openNode` 就是不产出节点）。
 *
 * ⚠️ **不需要**像 `create.ts` 摘 `wrapInHeadingInputRule` 那样先 `filter` 掉
 * 上游那个 —— schema 是按名字拼的（`@milkdown/core/lib/index.js:141` 那个
 * `Object.fromEntries(ctx.get(nodesCtx).map(([key, x]) => [key, …]))`），
 * **同名后来的盖掉先前的**，而 `.use()` 的顺序就是注册顺序。本文件在
 * `create.ts` 里排在 `commonmark` 之后，所以生效的是这一版。
 *
 * ⚠️ **只动 `toMarkdown`，一个字都没碰 `parseMarkdown`**：解析那半边是
 * `paragraphSchema` 原来的，节点仍然从 `paragraph` 解析出来。
 *
 * # ⚠️⚠️ 但"空段落不产出"会踩到上游另一个坑，所以**必须有人陪着它**（2026-09-26 实测）
 *
 * 上面那条改完之后，**空文档打不开了**：新建一份空文件（或者整篇只有一个空行），
 * 界面永远停在「正在准备编辑器…」，后台日志一个字都不打。抓到的错是：
 *
 * ```
 * TypeError: undefined is not an object (evaluating 'node.children.some')
 * ```
 *
 * 崩点在 `mdast-util-to-markdown` 的 root handler（`lib/handle/root.js` 第一行
 * `node.children.some(...)`）。为什么 `children` 会没有？因为**它不是一开始就有的**：
 * `@milkdown/transformer` 的 `SerializerStackElement.push` 里才有
 * `if (!this.children) this.children = []`（`lib/index.js:182-185`），
 * 而 root 那个节点是 `docSchema` 的 runner 建出来的
 * （`state.openNode("root"); state.next(node.content);`）——**它自己不 push 任何东西**。
 *
 * 于是：**整篇文档一个 mdast 节点都产不出来**的时候（整篇都是空段落，而空段落
 * 被上面那条跳过），root 的 `children` 就一直是 `undefined`，序列化器当场崩。
 *
 * 结论：**"跳过空段落"和"保证根节点不空"是一对，拆开任何一个都会炸。**
 * 后者就是下面那个 [`文档别导出空根`]，两件事写在一个文件里也是为了这个。
 */

import { nodesCtx } from "@milkdown/kit/core";
import { paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { $nodeSchema } from "@milkdown/kit/utils";

/**
 * 段落序列化的补丁版：**空段落什么都不写**（除了 `toMarkdown.runner` 与上游逐字相同）。
 *
 * ⚠️ `上一版` 是**一个函数**（`(ctx) => NodeSpec`），不是 `NodeSpec` 本身——
 * `extendSchema(handler)` 的实现是 `$nodeSchema(id, handler(schema))`，
 * 而 `$nodeSchema` 收的就是那个函数。少写一层箭头函数的症状是**建实例时炸**，
 * 不是"没生效"，所以它骗不了人。
 */
export const 段落不写空行 = paragraphSchema.extendSchema(
  (上一版) => (ctx) => {
    const 原 = 上一版(ctx);
    return {
      ...原,
      toMarkdown: {
        ...原.toMarkdown,
        runner: (state, node) => {
          // ⚠️ 判据是**内容为空**，不是"文本为空"：`<br />` 之外还有另一种空
          // ——段里只有一个空的行内节点。`!node.content` 那半句照抄上游。
          if (!node.content || node.content.size === 0) return;
          return 原.toMarkdown.runner(state, node);
        },
      },
    };
  },
);

/**
 * `doc` 那一层：**整篇都是空段落时，照旧留一个占位**，别让根节点一个孩子都没有。
 *
 * ⚠️ 它是上面那个的**保镖**，缺了它就"空文档打不开"（文件头那一节有实测与堆栈）。
 * 两件事的判据要**同步地**看：只有"顶层块**全部**是空段落"这一种文档才会被
 * `文档别导出空根` 接管——只要还有一块有内容，走的就是正常的 `state.next()`。
 *
 * ⚠️ 占位的**形状**抄的是上游那一手（一个 `html` 节点），但**值在 2026-09-27 改成了
 * 空串**（用户拍板"空文档存盘要 0 字节"）：它**只保证"不崩"**，内容一个字节都不该有。
 *
 * ⚠️⚠️ **"空文档存盘"其实有两条路，别把它们混成一条**（2026-09-27 量清）：
 *
 * | 空文档长什么样 | 走到哪条 | 从前落盘 | 现在 |
 * |---|---|---|---|
 * | 段落**自己就没有孩子**（新建文档、或整篇只有一个空行解析出来） | 本文件那个占位 | **`<br />\n`＝7 字节** | **0 字节** |
 * | 段落里有一颗**空文本节点**（敲了字又退格删掉） | `state.next()` → 段落那条跳过 | 0 字节 | 0 字节 |
 *
 * 2026-09-26 晚这里写过一条"这一条不会往用户文件里写 `<br />`"——那是**拿第二种
 * 形状的实测去替第一种形状下结论**，形状一换就错（当时那句"占位没到落盘就没了"
 * 是错的，只是恰好在那次试的文档上成立）。2026-09-27 开窗时状态栏读出
 * 「1 words 7 characters 2 lines」，就是第一种形状把 7 个字节漏了出去，
 * 现在两种都钉在 `tests/empty-doc-save.test.ts` 里。
 *
 * # 为什么是 `$nodeSchema("doc", …)` 而不是像上面那样 `extendSchema`
 *
 * ⚠️ 因为 `docSchema` 是 `$node(...)` 的产物（一个 `$Node`），**没有 `extendSchema`**
 * ——那是 `$nodeSchema` 才有的方法（`@milkdown/utils/lib/index.js:301-313`）。
 * 而 `docSchema` 这个 id 在 commonmark 里就是 `$node("doc", …)` 注册的，所以这里
 * **重新注册一个同名的 doc**：`$nodeSchema` 内部走 `upsertById`
 * （`utils/lib/index.js:10-16`，**按 id 就地替换**），`.use()` 顺序在 `commonmark`
 * 之后 ⇒ 生效的是这一条。
 *
 * ⚠️ **spec 是从注册表里取上游那一份来改的**（`ctx.get(nodesCtx)` 里那个 `"doc"`），
 * 不是把上游源码抄一遍——抄一遍就等于给自己埋一个"上游改了这里不知道"的雷。
 * 于是**顺序成了硬要求**：`.use(文档别导出空根)` 必须在 `.use(commonmark)` 之后。
 * 顺序错了会**当场抛错**（不是悄悄失效）：一打开就白屏，很好认。
 */
export const 文档别导出空根 = $nodeSchema("doc", (ctx) => {
  const 上游 = ctx.get(nodesCtx).find(([id]) => id === "doc")?.[1];
  if (!上游) {
    // ⚠️ 只有"注册顺序写反了"会走到这儿（见上面那一段）。抛一条认得出来的错，
    // 而不是拿一个残缺的 spec 硬撑。
    throw new Error("[nota] 文档别导出空根：注册表里没有 doc（它必须排在 commonmark 之后）");
  }
  // ⚠️ 从**上游那一条**的签名里取类型，不手写结构（`SerializerState` 那一串
  // 泛型手抄一遍只会抄错，而且上游一改就对不上）。
  type 序列化状态 = Parameters<typeof 上游.toMarkdown.runner>[0];
  type 文档节点 = Parameters<typeof 上游.toMarkdown.runner>[1];

  /** 这一篇的顶层块**是不是全是空段落**（含"一个块都没有"）。 */
  const 全篇都是空段落 = (doc: 文档节点): boolean => {
    if (doc.content.size === 0) return true;
    let 全空 = true;
    doc.content.forEach((块) => {
      if (块.type.name !== "paragraph" || 块.content.size !== 0) 全空 = false;
    });
    return 全空;
  };

  return {
    ...上游,
    toMarkdown: {
      ...上游.toMarkdown,
      runner: (state: 序列化状态, node: 文档节点) => {
        // ⚠️ 先 `openNode`：上游那一条也是这个顺序（`openNode("root")` 之后才
        // `next`）。`closeNode` 上游本来就没有——文档这一层的收尾由
        // `SerializerState.toString` 那边做，这里照着不来。
        state.openNode("root");
        if (!全篇都是空段落(node)) {
          state.next(node.content);
          return;
        }
        // ⚠️⚠️ **值是个空串，不是笔误**（2026-09-27，用户拍板"空文档存 0 字节"）。
        // 这里要的**不是**一个"占位内容"，而是**一个孩子**——root 的 `children`
        // 非有不可（上面的守卫全为这个）。而 `mdast-util-to-markdown` 那条 html
        // handler 对空值的产出是**零个字节**，于是整篇空的文档序列化出来正好是
        // 空串（从前写 `"<br />"` 会连换行一起落成 7 字节，见文件头那段）。
        // 三种写法的实测（同批量的，`tests/empty-doc-save.test.ts` 里钉着）：
        // `html("")` → 0 字节 ✓、`paragraph()`（空段落）→ 0 字节 ✓、
        // **什么都不加 → 崩**（`Cannot read properties of undefined (reading 'some')`）。
        state.addNode("html", undefined, "");
      },
    },
  };
});
