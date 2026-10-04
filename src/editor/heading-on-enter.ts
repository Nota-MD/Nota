/**
 * 标题**回车才成块**（2026-09-26，照 Typora）。
 *
 * # 用户要的是什么（原话）
 *
 * > 我又看了看 Typora 做法。人家是输入 `# 你好` 之后，只是加粗，按下回车才成为标题。
 * > 成为标题后，如果在行头直接退格，则直接删掉标题
 *
 * 前半句和同一天更早那条抱怨是**同一件事**：
 *
 * > 输入一个 `#` 后按了一下空格 `#` 就自动变位置。手感很差。
 * > 应该作为标识符的 `#` 不要变换位置和大小。
 *
 * # 上游原来是怎么做的
 *
 * `@milkdown/preset-commonmark` 的 `wrapInHeadingInputRule` 是一条
 * `textblockTypeInputRule(/^(?<hashes>#+)\s$/, …)`（`lib/index.js:613-625`）：
 * 段落里**刚敲下那个空格**的瞬间，整段就变成 `heading`，而 `#` 被解析器吃进
 * 语法里、从此在文档里不存在——只在光标所在块由 `instant-render.ts` 用装饰
 * 画回块的左边。于是那一下同时发生三件事：
 *
 * 1. 字号从正文跳到 h1（**变大了**）；
 * 2. 原来打在正文里的那个 `#` 字符消失，同一时刻灰色标记从左边 56px 的
 *    装订线里冒出来（**位置跑了**）；
 * 3. 行宽变了，光标跟着重排（**找不到光标了**）。
 *
 * 用户看到的正是"`#` 自己跑了，还变大了"。
 *
 * # 现在：成块这一下推迟到**回车**
 *
 * 段落里那行字在按下回车之前**一直是段落**——井号就是段落里的一个普通字符，
 * 位置和字号都不会变；只是井号后面那段文字按**粗体**显示，提示"这一行已经
 * 是标题的写法了"。回车 → 去掉 `#` 加空格那一段前缀、把这一段换成标题，
 * **并且把下一段开出来**（光标落进那个新的空段落）。
 *
 * ⚠️ **"并且把下一段开出来"这半句是必须的**，不是顺手加的。第一版只换了块类型、
 * 光标留在标题末尾，2026-09-26 开窗实测的症状是：敲 `# Hello` ＋ 回车，接着敲
 * `second line`，屏幕上出现的是**`Hellosecond line`**——字全接进标题里去了。
 * 因为"回车"在这个编辑器里**到处**都是"换到下一段"（`baseKeymap` 的
 * `splitBlock`），只有这一处不换行，用户一定会撞上。
 * Typora 那边回车也是**两个动作一起做**（成块 ＋ 换行），这里跟它一致。
 *
 * # ⚠️ 严格档与宽松档，从 2026-09-30 起**走同一条路**
 *
 * 两条路的判据都收在 `atx.ts::atxPrefix(text, strict)` 里（那一条是**全仓唯一**
 * 一份"这行算不算标题写法"的判据，大纲、源码模式、标签页标题、正文四处共用）。
 * 差别只剩**哪一档认哪个写法**：
 *
 * | 模式 | `# 你好` | `#你好` |
 * |---|---|---|
 * | 严格（`strict_markdown = true`） | 走这条路 | **不走**（它不是标题，回车＝普通换行） |
 * | 宽松（默认） | 走这条路 | **也走**（它在大纲/标签页里早就是标题了） |
 *
 * 用户 2026-09-30 报的是宽松档那条，原话：
 *
 * > 不开启严格模式下如果没有空格出现如此问题。
 * > ……类似 `# 你好`。就是不回车只是显示加粗，回车变成标题。
 *
 * **一句话：没按回车时都只加粗，按下回车都变成标题块（字号这时才跳）。**
 *
 * ## ⚠️ 这一版推翻了什么（改之前先读，别把旧写法搬回来）
 *
 * 2026-09-29 ～ 09-30 那两天，宽松档走的是**另一条路**：`#你好` 在正文里直接
 * **按该级标题的字号排**（用户 09-29 选的长相是「文字按标题排版、井号不动」），
 * 只在你**还在写这一段**时先不放大——判据是"光标还在不在这一段里"。
 *
 * 那套今天**整个删掉了**（连带 `宽松标题类名`、`data-lax-level`、
 * `marks.css` 里那组 `.nota-lax-heading[data-lax-level]` 规则）。删它的理由是
 * **那两条要求在"光标一走开"这个时刻上冲突**：
 *
 * | | 09-29 ～ 09-30 那版 | 这一版 |
 * |---|---|---|
 * | 输入时 | 先不放大（看光标在不在这一段） | 只加粗（和 `# 你好` 一样） |
 * | **光标一走开**（点走、切窗口、敲方向键） | **跳成标题字号** | **不动**，还是只加粗 |
 * | 按回车 | 只是换行，光标离开 → 于是放大 | **变成标题块**，字号这时才跳 |
 *
 * 用户连着两次点的是中间那一行（09-26「输入时，先不放大」＋ 09-30「回车变成
 * 标题」）：**"写完了"那一刻该由回车划，不该由光标划**。老判据做不到这一点
 * ——它只能做到"回车顺带也算离开"，所以点走也跳。这一版把判据换成"是不是
 * 标题块"，那条毛病就不存在了。
 *
 * ## ⚠️ 代价一处，如实记着：宽松档成块会**塞一颗空格**
 *
 * | | `# 你好` | `#你好` |
 * |---|---|---|
 * | 转成标题块之后序列化出去 | `# 你好` | `# 你好` |
 * | 与转换前比 | **一模一样** | **多了一颗空格** |
 *
 * 标题节点序列化出去固定是"井号 ＋ 空格 ＋ 正文"，所以宽松那条**改了一个字**。
 * 这**不违反** `atx.ts` 文件头那条"宽松模式一个字节都不改"——那条管的是
 * **存盘时不许自动修复**（用户 2026-09-24：「如果关闭，存盘不要自动修复」），
 * 而这里改字的是**用户自己按下的回车**：他明确要"回车变成标题"，变成标题就
 * 必然是这个写法。**不按回车，一个字节都不动**——这一半仍然成立。
 *
 * # 行首退格：**整个变回段落**（2026-09-26 第二轮，用户点名）
 *
 * > 如果是任何有标题的文档，在任何标题前按退格统一直接删除所有标题，
 * > 而非从 `###` 变到 `##` 再 `#`。
 *
 * 上游**原来那一版是逐级降级**：`headingKeymap` 的 `DowngradeHeading` 绑在
 * `Backspace` 和 `Delete` 上（`lib/index.js:701-706`），命令体在
 * `downgradeHeadingCommand`（同文件 `:641-652`）：空选区 ＋ `$from.parentOffset === 0`
 * ＋ 当前块是标题 → **层数减一**，只有减到 0 才 `setBlockType(paragraph)`。
 * 所以 h1 行首退格一次变段落（这条本来就有），而 h3 要按三次、
 * 屏幕上看得见 `### → ## → # → 正文` 一串中间态。用户要的是**一次到位**。
 *
 * ## 为什么这条只能挂 `$shortcut` ＋ `priority`，不能写进本文件那个插件
 *
 * ⚠️ `props.handleKeyDown` 是**按插件顺序**问的，先答的那个赢。本插件
 * （[`标题回车成块`]）在 `create.ts` 里 `.use()` 在 `commonmark` **之后**，
 * 所以上游那个 keymap 一定先看到 `Backspace`、并且返回 `true` 把它吃掉——
 * 写在这里的那份**永远不会被调到**（症状：改了没反应，而且没有任何报错）。
 *
 * ⚠️ 也**不能**像摘 `wrapInHeadingInputRule` 那样 `commonmark.filter(...)`：
 * 一个 `$useKeymap` 是**一个** keymap 插件，`DowngradeHeading` 只是它里面
 * 一条绑定，摘不掉单独一条。
 *
 * Milkdown 给的正路是 [`$shortcut`]：`KeymapManager.build()` 会按 `priority`
 * **从大到小**排序再 `chainCommands`（`@milkdown/core/lib/index.js` 那个
 * `items.sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))`），
 * 上游没写 `priority`、默认就是 50。这里给 60，于是**我们这条先跑**；
 * 我们返回 `true` 时 `chainCommands` 当场收工，上游那条再不执行——
 * 同一个键**只有一处**在答，这正是本文件一直强调的那条规矩。
 *
 * ⚠️ 命令体自己判一遍守卫（可编辑、空选区、行首），**一条都不能省**：
 * 少判"可编辑"会在分屏右边那个只读预览格子里把文档改掉；少判"空选区"
 * 会把"选中一段再退格删掉"变成"散掉标题"；少判"行首"就是本文下面那条
 * "行中间退格是删字符"。
 *
 * ⚠️ **表格格子不在守卫之列，是有意的**（与回车那条不同）：格子里的回车归
 * `table-input.ts`（敲表头那两行时它要把两段吃成一张表），而**退格没有任何
 * 别的认领者**（`table-input.ts` 只认 `Enter`）——格子里那个 `###` 一样是标题，
 * 按用户的原话"任何标题"都该一次散掉。上游那条命令本来也不管格子，
 * 所以放着不管的后果是"格子里的标题比正文里的少按两次才好用"，
 * 那种不一致比"多管了一处"难查得多。
 *
 * # 只推迟**标题**，别的标记照旧敲完就变
 *
 * 列表（`- `）、引用（`> `）、分割线（`---`）、任务项（`[ ] `）**都没动**：
 * 它们的标记画在同一个 56px 装订线里、块本身的字号不变，没有"标记跑掉、变大"
 * 这回事；而"打 `- ` 立刻出圆点"是所有人的肌肉记忆，改成回车才出反而更难用。
 * 用户点名的是 `#`（"作为**标识符**的 `#`"），所以只动它一条。
 *
 * ⚠️ 代价说在明处：**在标题里打 `#` 不再加级**（原来在 h1 开头打 `#` 会变 h2，
 * 那条逻辑长在被摘掉的输入规则里）。要改级数走菜单或 `Mod-Alt-1..6`。
 */

import { $prose, $shortcut } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Command } from "@milkdown/kit/prose/state";
import type { Node as PMNode } from "@milkdown/kit/prose/model";

import { atxPrefix } from "@/editor/atx";

/** 待成块的段落里，井号**后面**那段文字挂的 class。样式在 `styles/marks.css`。 */
export const 待成块类名 = "nota-heading-pending";

/**
 * 回车：把「带 ATX 前缀的段落」换成真标题。换不了就返回 `false`（交给别人）。
 *
 * ⚠️ `strict` 是**当前档位**（`Settings.strict_markdown`），判据全交给
 * `atxPrefix`——严格档下它不认 `#你好`，那一段于是走普通的换行
 * （`baseKeymap` 的 `splitBlock`），一个字节都不变。见文件头那张表。
 *
 * 三道守卫，每一道都对应一种"抢了别人的活"的错：
 *
 * 1. **只在行尾**成块。光标在行中间时那一下回车是**拆段**——拆出来的前半段
 *    还带着 `#`，再按一次回车才成块。抢拆段的后果是"想分行，结果整行变标题"。
 * 2. **表格格子里不干**。格子里的段落不是表格语法，那里的回车归
 *    `table-input.ts`（敲表头行＋分隔行时它要把两段吃成一张表）。
 * 3. **只读的不干**。分屏右边那个预览窗格用的是同一个编辑器，它不可编辑。
 */
function 回车成标题(view: EditorView, strict: boolean): boolean {
  if (!view.editable) return false;

  const { state } = view;
  const { $from, empty } = state.selection;
  if (!empty) return false;

  const 段 = $from.parent;
  if (段.type.name !== "paragraph") return false;

  for (let d = $from.depth - 1; d > 0; d--) {
    const 名 = $from.node(d).type.name;
    if (名 === "table_cell" || 名 === "table_header") return false;
  }

  // ⚠️ 走**共用判据**，不再本地写一条"井号 ＋ 空格"。2026-09-29 之前本地那条
  // 是对的（宽松档成块会塞空格，所以只让它认无损的 `# 你好`），但用户
  // 2026-09-30 明确要了"回车变成标题"，那颗空格就是他按下去要的结果——
  // 于是两条路合一，判据只剩 `atx.ts` 那一份（同 `算装饰条目`）。
  const 头 = atxPrefix(段.textContent, strict);
  if (头 === null) return false;

  // 守卫 1（见上）。`parentOffset` 就是光标在这一段里的偏移。
  if ($from.parentOffset !== 段.content.size) return false;

  const 标题类型 = state.schema.nodes.heading;
  if (!标题类型) return false;

  const 层 = 头.层数;
  const 前缀长 = 头.长度;
  const 起 = $from.before($from.depth);

  // 正文照搬（含粗体之类的行内标记一起搬），只是掐掉行首那一段前缀。
  // `content.cut` 的偏移与文档位置同一套算法，所以直接拿字符数当偏移用。
  const 新块 = 标题类型.create({ level: 层 }, 段.content.cut(前缀长));

  const tr = state.tr.replaceWith(起, 起 + 段.nodeSize, 新块);

  // 再把**下一段**开出来，光标落进去（见文件头那段：这一下不换行，
  // 接着敲的字会全接进标题里）。空段落用 `createAndFill()` 而不是 `create()`：
  // 前者会走一遍内容表达式，节点类型将来加了必填内容也不会造出非法文档。
  // ⚠️ **不要**改成调 `splitBlock`：那个命令要一份完整的 state，而这里手上是
  // 一笔还没派发的事务，把两条命令拼起来只会让"撤销"变成两步。
  const 空段 = state.schema.nodes.paragraph?.createAndFill();
  if (空段) {
    const 位 = 起 + 新块.nodeSize;
    tr.insert(位, 空段);
    // `位 + 1` 就是那个空段落里的第一个（也是唯一一个）光标位。
    tr.setSelection(TextSelection.near(tr.doc.resolve(位 + 1)));
  } else {
    // 造不出空段落（理论上到不了这儿）：退回到"光标落在标题末尾"，
    // 至少那一下回车不是白按的。
    tr.setSelection(TextSelection.near(tr.doc.resolve(起 + 新块.nodeSize - 1)));
  }

  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}

/**
 * 一条"要装饰的区间"——[`算装饰条目`] 的出口、[`建装饰集`] 的入口。
 *
 * ⚠️ 拆出这一步**是为了缓存**：装饰只取决于文档，而 ProseMirror 每笔事务
 * （包括纯光标移动）都会问一次 `decorations`。条目按 `state.doc` 存下来，
 * 光标动的时候只重拼一遍这个数组（O(条目)，不碰文档树），
 * 不然每按一次方向键都要全篇走一遍。与 `lax-heading.ts` 同一套做法。
 *
 * ⚠️ 2026-09-30 删掉了 `待成块` / `级数` 两个字段（还有更早的 `段起`）：
 * 那两个字段是给"宽松档按标题字号排"用的，而那条路今天并进了"只加粗"
 * ——**所有**标题写法的段落从现在起挂同一个类。见文件头那句
 * 「严格档与宽松档走同一条路」。
 */
export type 待装饰 = {
  起: number;
  止: number;
};

/**
 * 按文档扫一遍：所有"是标题写法"的段落里，该加粗的那段正文区间。
 *
 * ⚠️ 判据是 `atx.ts::atxPrefix`——**全仓唯一**一份，`strict` 决定它认不认
 * `#你好`（见 [`回车成标题`] 上那张表）。
 *
 * ⚠️ 井号那一段**不碰**（装饰从 `正文起` 开始）：用户 09-26 与 09-29 两次
 * 点名的"作为标识符的 `#` 不要变换位置和大小"，在这一版里就是"只有井号后面
 * 那段文字加粗"。
 */
export function 算装饰条目(doc: PMNode, strict: boolean): 待装饰[] {
  const 条目: 待装饰[] = [];

  doc.descendants((node, pos) => {
    // ⚠️ 只认**段落**，且第一个孩子必须是**纯文本**节点：`#` 在行内代码
    //（`` `# 你好` ``）或强调里的时候它不是标题的井号，`textContent` 分不出
    // 来（都是 `# 你好`），节点类型分得出来。判据与 `lax-heading.ts` 一致。
    //
    // ⚠️ **已经是标题块的段落不再进这里**——那正是这一版判"写完了没有"的方式：
    // 回车成块之后它就是 `heading` 节点，自己按该级标题的字号排（`editor.css`），
    // 不需要任何装饰。`#你好` 没回车时是段落 → 加粗；回车后是标题块 → 放大。
    if (node.type.name !== "paragraph") return true;
    const first = node.firstChild;
    if (!first || !first.isText || !first.text) return true;

    const 头 = atxPrefix(first.text, strict);
    if (头 === null) return true;

    const 正文起 = pos + 1 + 头.长度;
    const 正文止 = pos + 1 + node.content.size;
    // 只敲了 `# ` 还没写正文：没有可装饰的范围，`inline` 传空区间没有意义。
    if (正文止 <= 正文起) return true;

    条目.push({ 起: 正文起, 止: 正文止 });
    return true;
  });

  return 条目;
}

/**
 * 把条目拼成装饰集。所有条目**一视同仁**：井号后面那段文字加粗
 * （`待成块类名`，样式在 `marks.css`）。
 *
 * ⚠️ 2026-09-30 之前这里还有一个 `正在写的段` 参数，用来"跳过光标所在那一段"
 * （宽松档"输入时先不放大"）。那条路删掉之后参数和判据一起没了：
 * 现在的判据是**是不是标题块**，不看光标在哪儿。见文件头那张对照表。
 */
export function 建装饰集(doc: PMNode, 条目: readonly 待装饰[]): DecorationSet {
  const decos = 条目.map((条) =>
    Decoration.inline(条.起, 条.止, { class: 待成块类名 }),
  );
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

/**
 * 行首退格：把这一块标题**整个变回段落**（一～六级一视同仁）。
 *
 * 守卫与 [`回车成标题`] 那几道**基本同一个形状**：空选区、光标在**行首**、
 * 只读的不干。⚠️ **只有"表格格子里不干"这一条这里没有**，而且是**有意**不要的：
 * 回车那条要它，是因为格子里的回车归 `table-input.ts`（敲表头那两行时它要把
 * 两段吃成一张表）；**退格没有任何别的认领者**（`table-input.ts` 只认 `Enter`），
 * 而格子里那个 `###` 一样是标题——按用户的要求"任何标题"都该一次散掉。
 * 上游那条命令本来也不管格子，所以这里不接管的结果是"格子里的标题比正文里的
 * 少一次退格才好用"，那种不一致比"多管了一处"难查得多。
 *
 * ⚠️ 判据是 `$from.parentOffset === 0`，也就是**光标在这一块的开头**——
 * 与上游 `downgradeHeadingCommand` 逐字相同。行中间的退格照旧是删字符，
 * 一个字都不能碰（碰了就是"想删一个字，结果整块变回正文"）。
 *
 * ⚠️ 用 `tr.setNodeMarkup` 而不是 `setBlockType`：与上游那条命令同一套写法，
 * 两者都保留行内内容（标题里的粗体、行内代码跟着走）。区别只在**落到哪一级**：
 * 上游减一，这里直接落 `paragraph`。
 *
 * ⚠️ 这是**唯一**一处本仓自己发的标题键位命令（回车那条走 `handleKeyDown`）。
 * 写成 `Command` 而不是 `(view) => boolean` 是因为 `$shortcut` 的 `onRun`
 * 要的就是 `Command`；`view` 在类型上可选，拿不到就当"做不了"返回 `false`，
 * 让上游那条去答——**别在这里造一个假的 view**。
 */
const 行首退格: Command = (state, dispatch, view) => {
  if (!view?.editable) return false;

  const { $from, empty } = state.selection;
  if (!empty) return false;

  const 块 = $from.parent;
  if (块.type.name !== "heading") return false;
  if ($from.parentOffset !== 0) return false;

  const 段类型 = state.schema.nodes.paragraph;
  if (!段类型) return false;

  if (!dispatch) return true;
  dispatch(state.tr.setNodeMarkup($from.before($from.depth), 段类型));
  return true;
};

/**
 * 把 [`行首退格`] 挂到 `Backspace` / `Delete` 上，**优先级压过上游那条**。
 *
 * ⚠️ `priority: 60` 不是随手挑的数：`KeymapManager.build()` 按 `priority ?? 50`
 * 从大到小排，上游 `DowngradeHeading` 没写 priority（＝50），所以 60 就够。
 * 文件头「为什么这条只能挂 `$shortcut` ＋ `priority`」那一段讲了为什么
 * **只能是**这条路。改小到 50 以下的症状：又变回逐级降级，而且**静默**。
 *
 * ⚠️ 两个键都给同一条命令：上游也是 `["Delete", "Backspace"]` 一对。
 * 只给 `Backspace` 的话，同一个位置按 Delete 还是逐级降级——同一个动作
 * 两个答案，是用户最难描述的那类不一致。
 */
export const 标题行首退格 = $shortcut(() => ({
  Backspace: { key: "Backspace", onRun: () => 行首退格, priority: 60 },
  Delete: { key: "Delete", onRun: () => 行首退格, priority: 60 },
}));

/**
 * 插件本体。挂两处：回车（见 [`回车成标题`]）与那份加粗提示的装饰。
 *
 * ⚠️ 收 `strict` 是**两处都要用的**（判据同源，见 [`回车成标题`] 上那张表）：
 * 严格档下 `#你好` 既不进装饰、也不成块，那条路一个字节都不变。
 *
 * ⚠️ 它因此是一个**工厂**而不是一个 `$prose` 常量：调用方按当前档位建一个。
 * `strict` 变了要**重建编辑器**才生效——`EditorPane` 那个 effect 的依赖里
 * 本来就有 `strict`（切模式时它一直在重建），所以这里不用另外接一根线。
 *
 * ⚠️ 条目**只取决于文档**，所以按"`state.doc` 还是不是同一个对象"缓存——
 * 纯光标移动也会让 ProseMirror 重新问一次 `decorations`，这里要遍历整篇，
 * 不缓存的话每按一次方向键都要全篇走一遍。✅ **2026-09-30 起这个缓存是唯一的
 * 可变状态了**：同一天删掉的那个 `state: { apply }` 是为了记"光标还在不在正在
 * 写的那一段"，而那个判据连同它要服务的长相一起被删了（见文件头「这一版推翻了
 * 什么」）。所以现在本插件**没有 `state` 分节**，也没有闭包变量跟着事务走。
 */
export const 标题回车成块 = (strict: boolean) => $prose(() => {
  let 缓存: { doc: PMNode; 条目: 待装饰[] } | null = null;

  return new Plugin({
    key: new PluginKey("nota-heading-on-enter"),
    props: {
      handleKeyDown: (view, event) => {
        // 只认**光秃秃的**回车。Shift+Enter（硬换行）、Ctrl/Alt+Enter 各有各的
        // 绑定，别抢；输入法正在组合的时候那一下回车是"选词"。
        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          view.composing
        ) {
          return false;
        }
        return 回车成标题(view, strict);
      },

      decorations: (state) => {
        if (!缓存 || 缓存.doc !== state.doc) {
          缓存 = { doc: state.doc, 条目: 算装饰条目(state.doc, strict) };
        }
        return 建装饰集(state.doc, 缓存.条目);
      },
    },
  });
});
