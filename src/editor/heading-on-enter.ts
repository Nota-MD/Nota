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
 * `# 你好` 在按下回车之前**一直是段落**——井号就是段落里的一个普通字符，
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
 * ⚠️ **这一步不动文件里的字节**：段落 `# 你好` 序列化出来就是 `# 你好`，
 * 而 `# 你好` 本来就是 markdown 的一级标题——**按不按回车，存进文件的是
 * 同一串字节**。这和宽松模式（`lax-heading.ts`）那条"一个字节都不改"是
 * 同一个道理：文档树里是什么，文件里就是什么。
 *
 * ⚠️ 它带来一个**有意留着**的小出入：敲了 `# 你好` 直接存盘、再打开，
 * 那一段会是**真标题**（解析器认的就是它）。要消掉这个出入，只能回到
 * "打空格即成块"——而那正是用户否掉的手感。两害相权，留着。
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

/**
 * 行首的 ATX 前缀：一～六个井号 ＋ **一个空格**。
 *
 * ⚠️ 只认**半角空格**，不认制表符。CommonMark 两种都算，但
 * **转换会把前缀从文字里删掉**：`#\t你好` 删掉 `#\t` 之后标题正文是 `你好`，
 * 序列化出去是 `# 你好`——**制表符被换成了空格，字节变了**。而落在"不转换"
 * 这一边是**安全的**：那一行还是段落、字一个不动，存盘原样；下次打开时
 * 解析器照样把它认成标题（那是解析器的事，与这里的改字无关）。
 * 拿不准的时候选"不改字"那一边，这是全仓的规矩（见 `table-input.ts` 顶上那段）。
 */
const 前缀 = /^(#{1,6}) /;

/** 待成块的段落里，井号**后面**那段文字挂的 class。样式在 `styles/editor.css`。 */
export const 待成块类名 = "nota-heading-pending";

/**
 * 回车：把「带 ATX 前缀的段落」换成真标题。换不了就返回 `false`（交给别人）。
 *
 * 三道守卫，每一道都对应一种"抢了别人的活"的错：
 *
 * 1. **只在行尾**成块。光标在行中间时那一下回车是**拆段**——拆出来的前半段
 *    还带着 `#`，再按一次回车才成块。抢拆段的后果是"想分行，结果整行变标题"。
 * 2. **表格格子里不干**。格子里的段落不是表格语法，那里的回车归
 *    `table-input.ts`（敲表头行＋分隔行时它要把两段吃成一张表）。
 * 3. **只读的不干**。分屏右边那个预览窗格用的是同一个编辑器，它不可编辑。
 */
function 回车成标题(view: EditorView): boolean {
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

  const 匹 = 前缀.exec(段.textContent);
  if (!匹) return false;

  // 守卫 1（见上）。`parentOffset` 就是光标在这一段里的偏移。
  if ($from.parentOffset !== 段.content.size) return false;

  const 标题类型 = state.schema.nodes.heading;
  if (!标题类型) return false;

  const 层 = 匹[1]!.length;
  const 前缀长 = 匹[0].length;
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

/** 按文档算一遍装饰：给"待成块"的段落里井号后面那段文字加粗。 */
function 算装饰(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];

  doc.descendants((node, pos) => {
    // ⚠️ 只认**段落**，且第一个孩子必须是**纯文本**节点：`#` 在行内代码
    //（`` `# 你好` ``）或强调里的时候它不是标题的井号，`textContent` 分不出
    // 来（都是 `# 你好`），节点类型分得出来。判据与 `lax-heading.ts` 一致。
    if (node.type.name !== "paragraph") return true;
    const first = node.firstChild;
    if (!first || !first.isText || !first.text) return true;

    const 匹 = 前缀.exec(first.text);
    if (!匹) return true;

    const 前缀长 = 匹[0].length;
    const 正文起 = pos + 1 + 前缀长;
    const 正文止 = pos + 1 + node.content.size;
    // 只敲了 `# ` 还没写正文：没有可加粗的范围，`inline` 传空区间没有意义。
    if (正文止 <= 正文起) return true;

    decos.push(Decoration.inline(正文起, 正文止, { class: 待成块类名 }));
    return true;
  });

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
 * 插件本体。挂两处：回车（见 [`回车成标题`]）和那份加粗提示的装饰。
 *
 * ⚠️ 装饰**只取决于文档**，所以按"`state.doc` 还是不是同一个对象"缓存——
 * 纯光标移动也会让 ProseMirror 重新问一次 `decorations`，这里要遍历整篇，
 * 不缓存的话每按一次方向键都要全篇走一遍。与 `lax-heading.ts` 同一套做法。
 */
export const 标题回车成块 = $prose(() => {
  let 缓存: { doc: PMNode; set: DecorationSet } | null = null;

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
        return 回车成标题(view);
      },

      decorations: (state) => {
        if (!缓存 || 缓存.doc !== state.doc) {
          缓存 = { doc: state.doc, set: 算装饰(state.doc) };
        }
        return 缓存.set;
      },
    },
  });
});
