/**
 * **图片在装载时会被整节点丢掉** —— 这个插件是那件事的补丁。
 *
 * # 症状（2026-09-24 实测到的，不是推测）
 *
 * 打开一份带图片的文档，**存盘之后图片就没了**，而且不是画不出来，是
 * **从文档里消失**：存回去的字节里连 `![](...)` 都不剩。自己插进去的图也一样——
 * 插一张、存盘、再打开，就没了。
 *
 * 实测（`createEditor({initialMarkdown})` 再 `getMarkdown()` 读回来）：
 *
 * | 进去 | 出来 |
 * |---|---|
 * | `![图](img/a.png)` | ``（**整段没了**） |
 * | `文字里 ![图](a.png) 夹一张` | `文字里  夹一张` |
 * | `![图](img/a.png "标题")` | 原样（**带 title 的活下来了**） |
 *
 * 最后一行是关键线索：**不是"不支持图片"，是"没有 title 的图片活不下来"**。
 *
 * # 根因（在 `@milkdown/preset-commonmark` 里，不在我们这儿）
 *
 * 那个包把 image 节点的三个属性写成：
 *
 * ```js
 * attrs: { src: { default: "", validate: "string" },
 *          alt: { default: "", validate: "string" },
 *          title: { default: "", validate: "string" } }
 * ```
 *
 * 而它自己的 `parseMarkdown.runner` 把 mdast 里的值**原样**递进来：
 * `state.addNode(type, { src: url, alt: node.alt, title: node.title })`。
 * mdast 对 `![图](a.png)` 给的 `title` 是 `null` —— `validate: "string"` 于是
 * 判它不合法，`addNode` 建不出节点，**那一颗就被解析器默默跳过了**。
 *
 * ⚠️ 同一个包里的 **link 没有这个毛病**：它那份 title 写的是
 * `{ default: null, validate: "string|null" }`（`[a](b)` 的 title 也是 `null`，
 * 但它许了 `null`）。所以这不是"mdast 不给值"，是 image 那一处**少写了
 * `|null`**——一个上游的疏漏，我们只能在下游补。
 *
 * # 补的办法：在 mdast 上把 `null` 抹成 `""`
 *
 * 挂一个 remark 插件，在 **mdast → ProseMirror 之前**把 image 节点的
 * `alt` / `title` 里那些 `null` 换成空串。语义上是对的：`![图](a.png)` 在
 * CommonMark 里就是"没有 title"，而"没有"在这张 schema 里的表示是 `""`
 * （`default` 也正是 `""`）。
 *
 * ⚠️ **为什么不在 `create.ts` 里改 schema**：那个 image 节点是 preset 里
 * `$nodeSchema("image")` 建好的，attrs 在**建 schema 那一刻**就定死了，
 * 事后拿不到一个"改它的 attrs"的接口。换掉整个节点等于把 preset 的
 * 解析/序列化/命令全接过来自己养——为一行 `|null` 不值得。
 *
 * ⚠️ **我们自己也有一份责任**：`create.ts` 里那条 image 命令只传
 * `{src, alt}`、不传 `title`，于是**自己插的图**序列化出来正好是不带 title 的那种，
 * 再打开必丢。补上这个插件之后这两条路都通了（插件是**装载侧**的兜底，
 * 插进去的那一刻仍然是对的）。⚠️ 但"插进去的那一刻看着对、存盘再打开才丢"
 * 这种组合最伤人：用户会以为是自己存错了。所以这个插件必须在**每一个**
 * 会把 markdown 变成文档的实例上都挂上（可编辑的、分屏预览的、导出的）。
 *
 * ⚠️ 顺手记一笔：**别把这个插件的存在当成"可以不管上游"**。哪天
 * `@milkdown/preset-commonmark` 自己补了 `|null`，这个插件就变成一段
 * 无害但多余的东西（抹 `null` 的动作不会再命中）——那时删掉它即可。
 */

import { $remark } from "@milkdown/kit/utils";

/** mdast 节点里我们要用到的那几个字段（不引 `@types/mdast`，只取用得到的）。 */
interface Mdast节点 {
  type?: string;
  alt?: string | null;
  title?: string | null;
  children?: Mdast节点[];
}

/** 就地把一棵 mdast 里所有 image 的 `null` 属性抹成 `""`。 */
function 抹掉图片的空属性(node: Mdast节点): void {
  if (node.type === "image") {
    if (node.alt === null || node.alt === undefined) node.alt = "";
    if (node.title === null || node.title === undefined) node.title = "";
  }
  // ⚠️ 递归下去而不是只看顶层：图片在列表项、引用块、表格单元格里都是常见的，
  // 只扫 `tree.children` 那一层会漏掉绝大多数真实文档。
  if (Array.isArray(node.children)) {
    for (const 孩子 of node.children) 抹掉图片的空属性(孩子);
  }
}

/**
 * 挂进 `.use(...)` 的插件。**两档（宽松/严格）、只读实例都要挂**——
 * 它管的是"装得进来"，与那两件事无关。
 */
export const 补全图片属性 = $remark("nota-image-attrs", () => () => (tree: Mdast节点) => {
  抹掉图片的空属性(tree);
});
