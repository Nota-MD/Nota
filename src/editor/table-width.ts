/**
 * **表格列宽**：把用户拖出来的列宽记住，下次打开这份文档时摆回去。
 *
 * 用户 2026-09-26：「还有就是表格，允许拖动改变大小（**咋存你来定**）」。
 *
 * # 「能拖」缺的是两半，「拖完记得住」缺的是第三半
 *
 * ⚠️ 2026-09-26 查下来发现缺的是**三样**，而且第一样一开始判错了：
 *
 * 1. **`columnResizing` 那个 ProseMirror 插件压根没装**。原先记的是"preset
 *    默认就装"——**反了**：`@milkdown/preset-gfm` 的 `lib/index.js:1012`
 *    那个 `plugins` 数组只有 `keepTableAlignPlugin` / `autoInsertSpanPlugin` /
 *    `remarkGFMPlugin` / `tableEditingPlugin` 四个，`columnResizingPlugin`
 *    同文件 929 行定义的，**只被导出、没进任何数组**。装它那一行在
 *    `create.ts`（`.use(gfm)` 紧跟着的那条）。
 * 2. **没有那份 CSS**，所以手柄不可见、光标不变——用户根本看不出这儿能拖
 *    （已修：`main.tsx` 引了 `prosemirror-tables` 自带的那份）。
 * 3. **没有这个地方**，所以拖完就丢：GFM 的表格语法里**没有列宽**，
 *    `toMarkdown` 出去的时候 `colwidth` 这个属性就没了，重开即自动列宽。
 *
 * 这个文件管第 3 件（第 1、2 件的落点分别在 `create.ts` 与 `main.tsx`）。
 *
 * # 「咋存」的答案：**侧车，不写进正文**
 *
 * 列宽是**给人看的排版偏好**，不是文档内容。写进 Markdown 的办法只有一条
 * ——塞 HTML 的 `<colgroup>` 或者往表格行末加锚，两条都会让原文变得不是
 * 用户写的那份：换到别的 Markdown 工具里会露出一堆看不懂的东西，git diff 里
 * 也是噪声。所以它落在宿主那边一份**侧车文件**里
 *（`~/.local/share/nota/table-widths.toml`，形状与理由见
 * `src-tauri/src/table_width.rs`）。
 *
 * # ⚠️ 键是**指纹**，不是"第几张表"
 *
 * 按序号存（"第 2 张表 3 列各多宽"）在文档编辑一次之后就会**张冠李戴**——
 * 往上插一张新表，后面每张的编号都挪一位，于是所有列宽集体错位，而且是
 * 静默的。指纹取**表头那一行的文字 ＋ 列数**：改表头才会失效（那时它
 * 多半本来就是另一张表了），往下加几行数据不受影响。
 *
 * ⚠️ 指纹算法**只在这儿**（前端）。宿主只当它是个字符串，不解释格式
 *（`commands/table_width.rs` 顶上写着这条分工）。
 */

import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { columnResizing, columnResizingPluginKey } from "@milkdown/kit/prose/tables";
import { $prose } from "@milkdown/kit/utils";

/**
 * 一张表拖完之后的样子。
 *
 * ⚠️ `宽度` 里 **`0` 表示"这一列没有明确宽度、按自动排版走"**，不是一个真的宽度
 * （真实宽度有下限 `cellMinWidth: 25`，取不到 0）。用 0 当哨兵是因为宿主那侧
 * 存的是 `Vec<u32>`（`src-tauri/src/table_width.rs`），塞不进 `Option`。
 *
 * ⚠️ **"拖过一列"和"每一列都拖过"是两回事**：`prosemirror-tables` 的
 * `updateColumnWidth` 只给**被拖的那一列**写 `colwidth`，同表的其他列
 * 保持 `null`。所以任何"必须每列都有宽度才算数"的判据都是错的——
 * 2026-09-26 就是这么写的，症状是**拖完松手、侧车里一个字都没写**
 * （`表列宽` 返回 `null`，`读出列宽` 给出空数组，调用方以为"这张表没拖过"）。
 */
export interface 一张表的宽度 {
  指纹: string;
  /** 每列多宽（像素）。**一定是整数**；`0` = 这一列没拖过、自动排版。 */
  宽度: number[];
}

/** 指纹的长度上限。见 [`表格指纹`]。 */
const 指纹上限 = 120;

/** schema 里那三个名字。⚠️ 与 `@milkdown/preset-gfm` 的 schema 对齐。 */
const 表类型 = "table";
const 格类型 = new Set(["table_cell", "table_header"]);

/**
 * 一张表的**指纹**：表头那一行的每格文字，拼上列数。
 *
 * 形如 `姓名 | 年龄#2`。⚠️ 掐到 120 字：表头可以很长（有人把整句话写进去），
 * 而它只是一个键——太长没有好处，反而让侧车文件难读。
 *
 * ⚠️ **列数必须进指纹**，光有表头文字不够：`| a | b |` 和 `| a | b | c |`
 * 的表头拼出来可以是同一个前缀（截断之后尤其如此），而它们**列数不同**，
 * 宽度数组套上去会错位。
 */
export function 表格指纹(表: PMNode): string {
  const 头 = 表.firstChild;
  const 格: string[] = [];
  let 列数 = 0;
  头?.forEach((格节点) => {
    格.push(格节点.textContent.trim());
    列数 += (格节点.attrs.colspan as number) || 1;
  });
  const 名 = 格.join(" | ").slice(0, 指纹上限);
  return `${名}#${列数}`;
}

/**
 * 数一张表有几列（把 `colspan` 算进去）。
 *
 * ⚠️ 以**表头行**为准（`TableMap` 也这么算）：body 的行可能因为合并单元格而
 * 比表头少几格，拿它数会数少。
 */
function 列数(表: PMNode): number {
  let 出 = 0;
  表.firstChild?.forEach((格) => {
    出 += (格.attrs.colspan as number) || 1;
  });
  return 出;
}

/**
 * 一张表此刻的列宽。**一列都没拖过就给 `null`**（不是给一串默认值——
 * "没拖过"和"拖成了默认那个数"是两件事，前者该让它自动排）。
 *
 * ⚠️ 判据是**表头行**那一行的格子（`colwidth` 列宽是整列一起写的，表头那一格
 * 与 body 的格子必然一致，但表头一定在、body 可能一行都没有）。
 * ⚠️ **混着也算数**：拖过的列给宽度、没拖过的列给 `0`（见 `一张表的宽度`
 * 上那条——"每列都得有"这个判据是错的）。
 */
function 表列宽(表: PMNode): number[] | null {
  const 头 = 表.firstChild;
  if (!头) return null;
  const 出: number[] = [];
  let 有拖过的 = false;
  头.forEach((格) => {
    const 宽 = 格.attrs.colwidth as number[] | null;
    if (宽 && 宽.length > 0) {
      // ⚠️ `colwidth` 是**按 `colspan` 分格**的数组：`colspan: 2` 的格子会有
      // 两个数（`[w0, w1]`，`w1` 常常是 0）。这里整段摊出去，与 `列数()` 的
      // 算法一致（那边也是逐格加 `colspan`）。
      for (const 一个 of 宽) 出.push(一个);
      if (宽.some((n) => n > 0)) 有拖过的 = true;
    } else {
      // 没写成 `colwidth`：这一格占几列就补几个 0。
      for (let i = 0; i < ((格.attrs.colspan as number) || 1); i++) 出.push(0);
    }
  });
  if (!有拖过的 || 出.length !== 列数(表)) return null;
  return 出;
}

/**
 * 文档里**所有**表格此刻的列宽。给"拖完之后存一份"用。
 *
 * ⚠️ 没拖过的表**不进结果**（见 [`表列宽`]）。调用方据此判断"这份文档一张
 * 拖过的表都没有"，而那时该做的是**什么都不写**——写一份空表会把侧车里
 * 已有的记录覆盖掉（那是别的表、或者用户上次拖的那次）。
 */
export function 读出列宽(doc: PMNode): 一张表的宽度[] {
  const 出: 一张表的宽度[] = [];
  doc.descendants((节点) => {
    if (节点.type.name !== 表类型) return true;
    const 宽 = 表列宽(节点);
    if (宽) 出.push({ 指纹: 表格指纹(节点), 宽度: 宽 });
    // 不进表格内部：cell 里可以有嵌套表格，那属于里面那张表的账。
    return false;
  });
  return 出;
}

/**
 * 把记下来的列宽**摆回文档**（打开文档、或者换了文档之后调一次）。
 *
 * 没有记录的表格**一个字都不动**——它按 `columnResizing` 的自动排版走。
 *
 * ⚠️ 派出去的那笔事务带 `addToHistory: false`：这是**装载**，不是用户改的。
 * 不带的话，用户打开文档后按一次 `Ctrl+Z`，撤销掉的是"列宽被摆回去"这件事，
 * 而屏幕上看起来**什么都没发生**（列宽变回自动，用户多半也不觉得那是撤销）。
 *
 * # ⚠️⚠️ 位置那个坑（2026-09-26，查了很久）
 *
 * 下面算格子位置时写的是 **`位置 + 1 + 格位置`**，那多出来的 `1` 不是装饰：
 *
 * - `view.state.doc.descendants` 给**表**的位置是**绝对**位置（doc 的内容
 *   起点就是位置 0），所以外层的 `位置` 可以直接用；
 * - 而 `节点.nodesBetween` / `节点.descendants` 给的位置是**相对这张表的
 *   内容**的偏移（回调收到的是 `nodeStart + pos`，第一层子节点是 0）。
 *   表的内容从 `位置 + 1` 开始，所以格子的绝对位置是 `位置 + 1 + 格位置`。
 *
 * **少写这个 `1` 的后果**：`setNodeMarkup` 落在**表头行**上（`位置 + 0`），
 * 而 `colwidth` 不是行节点的属性——schema 直接把它丢掉，于是**什么都没改**，
 * 事务却是"成功"的（`steps=1`、`docChanged=true`）。症状是"侧车里记得好好的、
 * 重开文档列宽一个都不回来"，而所有中间量（指纹、宽度、列数）从调试看
 * **全都是对的**，极难从症状反推。
 * ⚠️ 同一条也适用于任何"在子节点上按位置动手"的地方：**先确认那个 pos 是
 * 相对谁的**，别凭 `descendants` 这个名字猜。
 */
export function 应用列宽(view: EditorView, 记着: Record<string, number[]>): void {
  const tr = view.state.tr;
  let 改了 = false;

  view.state.doc.descendants((节点, 位置) => {
    if (节点.type.name !== 表类型) return true;
    const 宽 = 记着[表格指纹(节点)];
    if (!宽 || 宽.length !== 列数(节点)) return false;

    let 列 = 0;
    节点.nodesBetween(0, 节点.content.size, (格, 格位置) => {
      if (!格类型.has(格.type.name)) return true;
      const 跨 = (格.attrs.colspan as number) || 1;
      const 目标 = 宽[列];
      列 += 跨;
      // ⚠️ 合并单元格（`colspan > 1`）**跳过**：它的宽度是好几列的和，
      // 而这里记的是**每列**多宽，怎么折算没有唯一答案。跳过它、让自动排版
      // 管那一格，比按第一列的数硬塞一个好（塞错的症状是那一格突然变形）。
      if (跨 !== 1 || 目标 === undefined) return true;
      // `0` = 这一列没拖过（见 `一张表的宽度`）：写回 `null`——**是清掉，
      // 不是写个 0 进去**。留着上一次的 `colwidth` 的话，用户"把某列拖过又
      // 想让它回自动"就永远回不去。
      const 要写 = 目标 > 0 ? [目标] : null;
      const 现 = 格.attrs.colwidth as number[] | null;
      const 一样 =
        要写 === null ? 现 === null || 现.length === 0 : 现?.length === 1 && 现[0] === 目标;
      if (一样) return true; // 已经对了，别白派一次
      tr.setNodeMarkup(位置 + 1 + 格位置, undefined, { ...格.attrs, colwidth: 要写 });
      改了 = true;
      return true;
    });
    return false;
  });

  if (改了) view.dispatch(tr.setMeta("addToHistory", false));
}
/**
 * **拖列宽的插件本体**（2026-09-27 起由本仓自己造，不再用 `gfm` 导出的那一个）。
 *
 * # 为什么要自己造一个：`defaultCellMinWidth`
 *
 * `prosemirror-tables` 的 `columnResizing` 有个选项 `defaultCellMinWidth`
 * （默认 **100**）。它的作用**不是**"每列至少 100px"，而是**给整张表算一个
 * `min-width`**：`TableView` 每次更新都按"每一列各自的宽度，没有宽度的列按这个
 * 数补"求和，把结果写成表格上的**行内** `min-width`（库里 `updateColumnsOnResize`
 * 最后那两行）。于是列一多，表格就先被钉死在 `列数 × 100px` 上：**8 列 = 800px**，
 * 比正文列（`--content-width`，默认 760px）还宽，`.tableWrapper` 自带的
 * `overflow-x: auto` 顺手给出一条横向滚动条——用户报的
 * 「表格全宽度是钉死的」正是这一条。
 *
 * ⚠️ **"钉死"不是 CSS 写的**（`styles/editor.css` 里一条 `width` 都没有），
 * 是这段 JS 每次更新算出来写进去的；所以在 CSS 那边加多少选择器、多少
 * `!important` 都改不动它，只能从这个选项下手。
 *
 * 给 **0** 就是"没拖过的列不预留宽度"：行内 `min-width` 变成 `0px`、`width`
 * 留空，库自带的 `table-layout: fixed; width: 100%` 于是说了算——**表格跟着
 * 正文列走，没有列宽的列等分**，与 Typora 的观感一致。
 *
 * ⚠️ **拖过列宽的表不受影响**：那些列有 `colwidth`，求和照旧；每一列都被拖过
 * 时 `TableView` 还会把 `width` 也写死成那个和，那正是"用户点了名要这么宽"，
 * 该留着（列数多到挤不下时才会再出滚动条，而那一次是用户自己拖出来的）。
 *
 * ⚠️ **单元格的最小宽度不归这个选项管**，它归 CSS：库里那条
 * `min-width: var(--default-cell-min-width)` 读的是表格上的**行内变量**
 * （`TableView` 建实例时把选项原样写进去），所以那边得用 `!important`
 * 才按得住——那一段连同"为什么"在 `styles/editor.css` 里。
 *
 * ⚠️ **只读的那一份挂着它也不会响应**（分屏右侧的预览、导出的离屏实例）：
 * 库自己判 `view.editable`。所以"装的时候不必分模式"——那一句判断在库里，
 * 不在 `create.ts`（2026-09-28 从那边搬过来的，理由：这条属于本插件的行为）。
 */
export const 列宽拖动插件 = $prose(() =>
  columnResizing({ defaultCellMinWidth: 0 }),
);

/**
 * 盯着"用户刚拖完一次列宽"的那个插件。
 *
 * # 判据是 `dragging` 从真变假，不是 `activeHandle` 归位
 *
 * `ResizeState` 有两个字段：`activeHandle`（鼠标此刻悬停在某个列边界上）
 * 和 `dragging`（正按着左键在拖）。⚠️ **只看 `activeHandle` 会误报**：
 * 用户把鼠标从列边界上移开（什么都没拖）时它也会归 -1，那一刻去存一次，
 * 存的是**拖动之前**那份列宽——一份没变过的数据，白写一次盘。
 *
 * ⚠️ 也**不能**挂在 `apply` 上：那时 `dragging` 刚变、还没走完 `handleMouseUp`
 * 里写 `colwidth` 的那笔事务，读到的是**拖之前**的宽度。`view.update` 跑在
 * 这一轮事务全部落定之后，读到的才是最终那棵树。
 *
 * ⚠️ 外面那层 `$prose` 是 Milkdown 要的壳（`.use()` 收的是 `MilkdownPlugin`，
 * 不是一个裸的 `Plugin`）——同 `find.ts::查找插件` / `command-state.ts` 的写法。
 */
export function 列宽插件(在拖完: (表: 一张表的宽度[]) => void) {
  return $prose(
    () =>
      new Plugin({
        key: new PluginKey("nota-table-width"),
        view: () => ({
          update: (view, 上一份) => {
            const 前 = columnResizingPluginKey.getState(上一份);
            const 后 = columnResizingPluginKey.getState(view.state);
            if (前?.dragging && !后?.dragging) 在拖完(读出列宽(view.state.doc));
          },
        }),
      }),
  );
}
