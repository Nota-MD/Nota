/**
 * `src/editor/find.ts`（查找与替换）的**可运行**测试集。2026-10-06 新建。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/find.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-find/find.test.mjs && node /tmp/nota-find/find.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 * ⚠️ 它**不需要** `--alias:@=./src`（`find.ts` 走的是相对路径与真包名）。
 *
 * ⚠️ 写完再**单独核一遍类型**（`tests/` 不在 `tsc` 的 `include` 里，`esbuild` 又只剥类型
 * 不检查——见 `docs/06` §6.3 那一段）：
 *
 * ```sh
 * npx tsc --noEmit --strict --skipLibCheck --target es2022 --module esnext \
 *   --moduleResolution bundler --lib es2022,dom,dom.iterable --types node \
 *   --noUncheckedIndexedAccess tests/find.test.ts
 * ```
 *
 * ⚠️ 这一遍当场抓到两处（`props.decorations` 的 `this: Plugin`、它的返回类型是基类
 * `DecorationSource` 而**没有** `.find()`）——不核的话它们会一直潜伏到有人真去动那几行。
 *
 * # 为什么有这一份（BUG-67 的账）
 *
 * 2026-10-06 用户报「**实测搜索后高亮框向后位移一位**」——`算匹配` 里写的是
 * `pos + 1 + m.start`，**整整多算一格**（`descendants` 给文本节点的 `pos`
 * **就是**它第一个字符的位置，`+ 1` 是给父节点用的）。
 *
 * 这个 bug 的恶劣之处在于**所有闸都绿**：类型对、`tsc` 过、`i18n` 过，
 * 连既有那几份与查找沾边的测试也全过——因为它们问的是「找没找到」，
 * 而这个 bug 只动**命中落在哪个格子上**。只有真开窗、真去看那颗字上有没有
 * 高亮才看得见（截图里 `ABCD` 查 `D`，那颗 D 上一点颜色都没有：区间跨出了
 * 文本节点，`Decoration.inline` 什么都画不出来）。
 *
 * 所以第四组量的**不是**「命中几个」，而是「命中压在哪个格子上」：判据一律写成
 * `doc.textBetween(命中.start, 命中.end)`——**它必须正好是用户查的那串字**。
 * 拿这一条当判据，`+1` 那一版会红，而「命中数」那一路是绿的。
 *
 * ⚠️ 判据里**不许**只写「输出等于 `[{start: 4, end: 5}]`」这种纯数字：数字对不上
 * 时（换一颗 schema、前面多一段）看不出错在哪儿；而 `textBetween` 把那句
 * 「区间必须正好压在那颗字上」直接写成了可运行的断言。两样都写：数字钉住坐标
 * 口径，`textBetween` 钉住语义。
 *
 * # 这份测试证明不了什么
 *
 * - **滚动没验**：`选中` 里那句 `滚动到可见`（「点查找那一刻前两下不滚」那个坑）
 *   要真 `EditorView` ＋ 真 DOM ＋ 真的可滚容器，这里给的是空壳 `dom`，
 *   它一路找不到可滚祖先、什么都不做（见 `建假视图`）。
 * - **装饰真画到屏幕上没有没验**：这里只能读到 `DecorationSet` 里那几条条目的
 *   区间与类名；「那颗字上真有一块颜色」是开窗目检（`docs/06` §5.56）。
 * - **查找条那一侧没验**：`ui/useFindBar.ts` 的状态机、输入框、按钮都不在这里，
 *   那是 React 的事。
 * - **源码模式那一侧没验**：`source-find.ts` 的适配器不在这个文件里，
 *   它共用的是下面第一、二、三组量过的 `在文本里找匹配`。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import {
  清除,
  正则写坏了,
  全部替换,
  在文本里找匹配,
  默认查找选项,
  算匹配,
  替换当前,
  设查询,
  查找键,
  查找插件,
  设置查询元,
  走,
  type FindOptions,
} from "../src/editor/find";

/* ── 工装（与 `code-block-editing.test.ts` 同一套长相）────────────────── */

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

/** 命中列表读成 `起-止` 的串，失败信息里一眼看得出错在哪儿。 */
function 区间们(命中: readonly { start: number; end: number }[]): string {
  return 命中.map((m) => `${m.start}-${m.end}`).join(" ");
}

/** 一套开关：只写要改的那一个。 */
function 选项(改: Partial<FindOptions> = {}): FindOptions {
  return { ...默认查找选项, ...改 };
}

/* ── 一颗够用的真 Schema（段落 ＋ 加粗）───────────────────────────────── */

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: { strong: {} },
});

/** 文本节点**只能**走 `schema.text()`（`nodeType.create()` 对它是抛错的）。 */
function 平段(字: string): PMNode {
  return schema.nodes.paragraph.create(null, 字 ? schema.text(字) : []);
}

function 拼(...段们: readonly PMNode[]): PMNode {
  return schema.nodes.doc.create(null, 段们.slice());
}

/* ── 真插件与假视图 ───────────────────────────────────────────────────── */

/**
 * 真 `Plugin`。
 *
 * ⚠️⚠️ **`.plugin()` 要先调用一次那个 MilkdownPlugin 才会有东西**：
 * `$prose` 是这么实现的（`node_modules/@milkdown/utils/lib/index.js`）——
 *
 * ```js
 * function $prose(prose) {
 *   let prosePlugin;                                   // ← 起步是 undefined
 *   const plugin = (ctx) => async () => {
 *     await ctx.wait(SchemaReady);
 *     prosePlugin = prose(ctx);                        // ← 到这一步才有值
 *     ctx.update(prosePluginsCtx, (ps) => [...ps, prosePlugin]);
 *     ...
 *   };
 *   plugin.plugin = () => prosePlugin;
 *   plugin.key = () => prosePlugin.spec.key;           // ← undefined.spec ⇒ 那句
 * }
 * ```
 *
 * 所以直接 `查找插件(...).plugin()` 拿到的是 **`undefined`**，而且报错的地方
 * 在 `.key()` 里（`Cannot read properties of undefined (reading 'key')`），
 * 与"插件没挂上"看不出关系。`math-view.test.ts` 那句 `await 公式当前(ctx)()`
 * 就是在做这一步，只是它用的是真 ctx。这里给一个**只认 `wait` / `update` 两个
 * 方法的空壳**：插件体自己（`查找插件` 里那个工厂）根本不看 ctx。
 *
 * ⚠️ 插件体里那个 `onStatus` 回调是**视图那条线**（`view.update`）在调的，
 * 这里没有视图，所以它一次都不会响——下面一律直接读 `查找键.getState()`。
 */
const 插件件 = 查找插件(() => {});
type 插件上下文 = Parameters<typeof 插件件>[0];
await 插件件({
  wait: async () => undefined,
  update: () => {},
} as unknown as 插件上下文)();
const 插件 = 插件件.plugin();

function 建状态(doc: PMNode, 光标 = 1): EditorState {
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, 光标),
    plugins: [插件],
  });
}

/** 插件里那份状态（`query` / `options` / `matches` / `index`）。 */
function 读插件(state: EditorState) {
  const s = 查找键.getState(state);
  if (!s) throw new Error("插件状态没挂上——`plugins` 里是不是少了 `插件`？");
  return s;
}

/** 派一条改查询的事务，返回新状态。 */
function 派查询(state: EditorState, query: string, opts = 选项()): EditorState {
  return state.applyTransaction(state.tr.setMeta(设置查询元, { query, options: opts })).state;
}

/**
 * 一个**只有 `state` 与 `dispatch`** 的假视图。
 *
 * `替换当前` / `全部替换` / `设查询` 都要 `EditorView`，而真 `EditorView` 在
 * node 里建不起来（要真 DOM）。这三条命令真正用到的只有两样：读 `state`、
 * 派事务。⚠️ 唯一另一处是 `选中` 末尾那句 `滚动到可见`——它从 `view.dom`
 * 往上找可滚祖先，空壳对象没有 `parentElement`，于是**一路返回、什么都不做**
 * （正是我们想要的：滚动本来就不在这份测试的射程里）。
 */
function 建假视图(state: EditorState): EditorView {
  const v: { state: EditorState; dom: object; dispatch(tr: Transaction): void } = {
    state,
    dom: {},
    dispatch(tr) {
      v.state = v.state.apply(tr);
    },
  };
  return v as unknown as EditorView;
}

/* ── 一、在文本里找匹配：字面量与大小写 ───────────────────────────────── */

组("一、在文本里找匹配：字面量与大小写");

测("`ABCD` 查 `D`：区间正好压在最后那颗 D 上（文本这一层的判据）", () => {
  // ⚠️ 这一格就是用户看到的那个病在这一层的样子：出界的话它会越过末尾。
  等(区间们(在文本里找匹配("ABCD", "D", 选项())), "3-4", "区间");
});

测("多个命中都往前推，不是只第一颗对", () => {
  等(区间们(在文本里找匹配("aXbXc", "x", 选项())), "1-2 3-4", "区间");
});

测("默认**不**区分大小写", () => {
  等(区间们(在文本里找匹配("AbC", "abc", 选项())), "0-3", "区间");
});

测("开了大小写敏感：不匹配就是不匹配（不是换个地方匹配）", () => {
  等(区间们(在文本里找匹配("AbC", "abc", 选项({ caseSensitive: true }))), "", "小写查大写");
  等(区间们(在文本里找匹配("AbC", "AbC", 选项({ caseSensitive: true }))), "0-3", "同一串");
});

测("非正则模式下元字符是**字面量**：查 `1.` 不吃 `1x`", () => {
  等(区间们(在文本里找匹配("a1.b", "1.", 选项())), "1-3", "`1.` 命中");
  等(区间们(在文本里找匹配("a1xb", "1.", 选项())), "", "`1x` 不算");
});

测("查 `$` 不炸（元字符转义对了）", () => {
  等(区间们(在文本里找匹配("价格 $5", "$", 选项())), "3-4", "区间");
});

测("空查询给空表（不是「命中一切」）", () => {
  等(区间们(在文本里找匹配("abc", "", 选项())), "", "区间");
});

/* ── 二、全字匹配 ─────────────────────────────────────────────────────── */

组("二、全字匹配");

测("`cat` 在 `cat category` 里只命中第一个", () => {
  等(区间们(在文本里找匹配("cat category", "cat", 选项({ wholeWord: true }))), "0-3", "区间");
});

测("**中文汉字算词字符**：`好` 在 `你好` 里不算整词，前面是逗号的那颗才算", () => {
  // ⚠️ 这一格钉的是 `词字符` 用 `\p{L}` 而不是 `\w`：换成 `\w` 的话
  //    `你` 不算词字符，`你好` 里那颗 `好` 就会被当成整词命中。
  //  `你好，好`：第一颗 `好` 左边是 `你`（词字符）⇒ 不算；第二颗左边是 `，` ⇒ 算。
  等(区间们(在文本里找匹配("你好，好", "好", 选项({ wholeWord: true }))), "3-4", "区间");
  等(区间们(在文本里找匹配("你好，好", "好", 选项())), "1-2 3-4", "关掉整词时两颗都算");
});

测("开头的命中两侧越界也算整词（左边界不是「失败」）", () => {
  等(区间们(在文本里找匹配("cat dog", "cat", 选项({ wholeWord: true }))), "0-3", "区间");
});

测("下划线算词字符：`a_b` 里那颗 `b` 不是整词", () => {
  等(区间们(在文本里找匹配("a_b b", "b", 选项({ wholeWord: true }))), "4-5", "区间");
});

测("关掉全字匹配：两处都命中（开关真的在起作用）", () => {
  等(区间们(在文本里找匹配("cat category", "cat", 选项())), "0-3 4-7", "区间");
});

/* ── 三、正则与零宽 ───────────────────────────────────────────────────── */

组("三、正则与零宽");

测("正则模式：`\\d+` 命中每一串数字", () => {
  等(区间们(在文本里找匹配("a1b22", "\\d+", 选项({ regex: true }))), "1-2 3-5", "区间");
});

测("正则写坏了（用户还在敲那半个 `[`）**不抛**，只是这次查不到", () => {
  等(区间们(在文本里找匹配("a[b", "[", 选项({ regex: true }))), "", "区间");
});

测("零宽命中一律丢掉（`^` 查得到也不给）", () => {
  // ⚠️ 零宽那条高亮不出来、替换会把 `全部替换` 原地钉死。
  等(区间们(在文本里找匹配("abc", "^", 选项({ regex: true }))), "", "`^`");
  等(区间们(在文本里找匹配("abc", "x*", 选项({ regex: true }))), "", "`x*`");
});

测("零宽的丢弃**不会卡死**（`lastIndex` 有往前走）", () => {
  // ⚠️ 这一格只问「走完了没有」：真死循环起来是超时，不是断言失败。
  等(区间们(在文本里找匹配("aaaaaaaaaa", "b*", 选项({ regex: true }))), "", "区间");
});

测("零宽与非零宽混在一起：只留非零宽那几个", () => {
  等(区间们(在文本里找匹配("a1b2", "\\d*", 选项({ regex: true }))), "1-2 3-4", "区间");
});

/* ── 四、算匹配：文档偏移（BUG-67 的判据）────────────────────────────── */

组("四、算匹配：命中压在哪一格上（BUG-67 的判据）");

测("一段 `ABCD` 查 `D`：区间必须是 `4-5`（多算一格的那版给 `5-6`）", () => {
  //  位置: 0   1   2   3   4   5
  //        │   A   B   C   D   │
  //        └──── 段落 content ──┘
  //  `descendants` 给文本节点的 `pos` 是 **1**（它第一个字符所在的位置），
  //  `D` 在文本里是第 3 个字符 ⇒ `1 + 3 = 4`。
  const doc = 拼(平段("ABCD"));
  等(区间们(算匹配(doc, "D", 选项())), "4-5", "区间");
});

测("`textBetween` 读出来**正好是查的那颗字**（这一条才是承重的判据）", () => {
  const doc = 拼(平段("ABCD"));
  for (const m of 算匹配(doc, "D", 选项())) {
    等(doc.textBetween(m.start, m.end), "D", "命中区间里的字");
  }
  // ⚠️ 顺手把「多算一格会怎样」也钉在断言里：`5-6` 已经出了那个文本节点，
  //    `textBetween` 给空串——那正是截图里「那颗 D 一点颜色都没有」。
  等(doc.textBetween(5, 6), "", "出界那个区间是空的（这就是病的样子）");
});

测("每一颗命中的区间里都是查询串本身（全篇扫一遍）", () => {
  // ⚠️ 这条是**通用**判据：偏移口径只要错了，无论错在哪一段都会红。
  const doc = 拼(平段("ab ab ab"), 平段("xabx"), 平段("末尾ab"));
  const 命中 = 算匹配(doc, "ab", 选项());
  等(命中.length, 5, "命中数");
  for (const m of 命中) {
    等(doc.textBetween(m.start, m.end), "ab", `区间 ${m.start}-${m.end} 里的字`);
  }
});

测("第二段里的命中：偏移要把前面那一段的尺寸算进去", () => {
  //  段落一 `你好世界` 占 0..6（内容 1..5），段落二从 6 起、内容从 7 起。
  const doc = 拼(平段("你好世界"), 平段("甲乙世界"));
  等(区间们(算匹配(doc, "世界", 选项())), "3-5 9-11", "区间");
});

测("**逐文本节点**找：跨节点的那一串不算命中（文件头那条规矩）", () => {
  //  `甲乙` 在**拼起来的**全文里是连着的，在文档树里却是两个文本节点
  //  （标记不同），中间没有字符——界面上查不到的串不许算命中。
  const doc = 拼(
    schema.nodes.paragraph.create(null, [
      schema.text("甲"),
      schema.text("乙", [schema.marks.strong.create()]),
    ]),
  );
  断言(doc.child(0).childCount === 2, "这一段该是两个文本节点");
  等(doc.textBetween(1, 3), "甲乙", "拼起来确实是这两个字（所以拼起来找就会错）");
  等(区间们(算匹配(doc, "甲乙", 选项())), "", "跨节点");
  等(区间们(算匹配(doc, "乙", 选项())), "2-3", "单颗字");
});

测("空查询：不进文档树也知道是空表", () => {
  等(区间们(算匹配(拼(平段("abc")), "", 选项())), "", "区间");
});

/* ── 五、插件状态：查询、走位、清除、文档变了 ─────────────────────────── */

组("五、插件状态：查询、走位、清除、文档变了");

//  `AB CD AB`：内容从 1 起，两处命中是 1-3 与 7-9。
const 双命中 = () => 拼(平段("AB CD AB"));

测("设查询：光标在段首 → 停在**第一个**命中上，并把选区送过去", () => {
  const view = 建假视图(建状态(双命中(), 1));
  设查询(view, "AB", 选项());
  等(区间们(读插件(view.state).matches), "1-3 7-9", "命中");
  等(读插件(view.state).index, 0, "停在第几个");
  等(`${view.state.selection.from}-${view.state.selection.to}`, "1-3", "选区");
});

测("设查询：光标在两处命中**之间** → 就近找后面那一个（不是第一个）", () => {
  const view = 建假视图(建状态(双命中(), 7));
  设查询(view, "AB", 选项());
  等(读插件(view.state).index, 1, "停在第几个");
});

测("设查询：光标在**所有命中之后** → 绕回第一个", () => {
  const view = 建假视图(建状态(双命中(), 9));
  设查询(view, "AB", 选项());
  等(读插件(view.state).index, 0, "停在第几个");
});

测("走：最后一格按「下一个」回到第一格，第一格按「上一个」回到最后一格（环形）", () => {
  const view = 建假视图(建状态(双命中(), 1));
  设查询(view, "AB", 选项());
  走(view, 1);
  等(读插件(view.state).index, 1, "走一格之后");
  等(`${view.state.selection.from}-${view.state.selection.to}`, "7-9", "选区");
  走(view, 1);
  等(读插件(view.state).index, 0, "绕回第一格");
  走(view, -1);
  等(读插件(view.state).index, 1, "再往回绕到最后一格");
});

测("一个命中都没有时：`走` 什么都不做（不炸、不改选区）", () => {
  const view = 建假视图(建状态(双命中(), 1));
  设查询(view, "zzz", 选项());
  等(读插件(view.state).matches.length, 0, "命中数");
  走(view, 1);
  等(`${view.state.selection.from}-${view.state.selection.to}`, "1-1", "选区没动");
});

测("清除：回到「什么都没在查」（与「查了没命中」是两回事）", () => {
  const view = 建假视图(建状态(双命中(), 1));
  设查询(view, "AB", 选项());
  清除(view);
  const s = 读插件(view.state);
  等(s.query, "", "查询");
  等(s.matches.length, 0, "命中数");
  等(s.index, -1, "下标");
});

测("派查询（不走命令）：状态换了一套，命中表跟着重算", () => {
  //  ⚠️ 这一格量的是 `apply` 里那条 `要重算`：光标没动、文档没动，
  //     光是换了查询串，命中表就必须换。
  const state = 建状态(双命中(), 1);
  等(区间们(读插件(派查询(state, "CD")).matches), "4-6", "换成 `CD` 之后");
});

测("文档变了：命中位置**重算**（前面插字，后面的命中跟着挪）", () => {
  const view = 建假视图(建状态(双命中(), 1));
  设查询(view, "AB", 选项());
  view.dispatch(view.state.tr.insertText("XX", 1, 1));
  等(区间们(读插件(view.state).matches), "3-5 9-11", "插两个字之后");
  for (const m of 读插件(view.state).matches) {
    等(view.state.doc.textBetween(m.start, m.end), "AB", "命中区间里的字");
  }
});

测("文档变了：停着的那一格没了 → 下标夹回合法范围（不是 -1、不是越界）", () => {
  const view = 建假视图(建状态(拼(平段("aa aa")), 1));
  设查询(view, "aa", 选项());
  走(view, 1);
  等(读插件(view.state).index, 1, "先停在第二格");
  view.dispatch(view.state.tr.delete(1, 3)); // 把第一处 `aa` 删掉
  const s = 读插件(view.state);
  等(区间们(s.matches), "2-4", "删完之后只剩一处");
  等(s.index, 0, "下标夹回来了");
});

/* ── 六、装饰（画到屏幕上的那一层）────────────────────────────────────── */

组("六、装饰：高亮就是装饰（不进文档、不进撤销栈）");

/** 装饰集读成 `起-止:类名`（读法与 `heading-on-enter.test.ts` 那一条相同）。 */
function 装饰们(state: EditorState): string[] {
  // ⚠️ 两处 cast 都不是装饰：① `props.decorations` 的签名带 `this: Plugin`
  //    （ProseMirror 是把它挂在插件上调的），孤零零地调要 `.call(插件, …)`；
  //    ② 它的返回类型是 `DecorationSource`（`DecorationSet` 与别的源共用的基类），
  //    `.find()` 只在 `DecorationSet` 上。⚠️ 这两条**只有单独核这份测试才看得见**：
  //    `tsc --noEmit` 的 `include` 只有 `src` 与 `vite.config.ts`，`tests/` 不在里面。
  const 集 = 插件.spec.props?.decorations?.call(插件, state) as
    | DecorationSet
    | null
    | undefined;
  if (!集) return [];
  return 集.find().map((d: Decoration) => {
    // ⚠️ `type` 在**类型声明**上是私有的（基类 `Decoration` 只声明了 `from`/`to`），
    //    运行时却实实在在挂着（`heading-on-enter.test.ts` 也靠它读类名）——
    //    所以这里连 `d` 一起 cast，别只 cast 里面那一层。
    const 属性 =
      (d as unknown as { type?: { attrs?: Record<string, unknown> | null } }).type?.attrs ?? {};
    return `${d.from}-${d.to}:${String(属性["class"] ?? "")}`;
  });
}

测("两处命中两条装饰，区间与命中表一致；当前那一格多一个类", () => {
  const view = 建假视图(建状态(双命中(), 1));
  设查询(view, "AB", 选项());
  等(
    装饰们(view.state).join(" | "),
    "1-3:nota-find-hit nota-find-current | 7-9:nota-find-hit",
    "装饰",
  );
});

测("走一格之后**当前类**跟着走（不是两条都亮）", () => {
  const view = 建假视图(建状态(双命中(), 1));
  设查询(view, "AB", 选项());
  走(view, 1);
  等(
    装饰们(view.state).join(" | "),
    "1-3:nota-find-hit | 7-9:nota-find-hit nota-find-current",
    "装饰",
  );
});

测("查不到时一条装饰都没有（界面留空，不是把全文涂上）", () => {
  const view = 建假视图(建状态(双命中(), 1));
  设查询(view, "zzz", 选项());
  等(装饰们(view.state).join(" | "), "", "装饰");
});

测("装饰**不进文档**：查一场、走一圈之后，文档树一个字节不动", () => {
  const doc = 双命中();
  const view = 建假视图(建状态(doc, 1));
  设查询(view, "AB", 选项());
  走(view, 1);
  等(view.state.doc.textContent, doc.textContent, "文档内容");
  等(view.state.doc.eq(doc), true, "文档树（`eq` 为真 = 内容一个字节都没动）");
});

/* ── 七、替换（假视图上的真逻辑）──────────────────────────────────────── */

组("七、替换：当前那一处 / 全部");

测("替换当前：换掉的是**停着的那一处**，换完跳到下一个", () => {
  //  `aa X aa X aa`：三处命中是 1-3 / 6-8 / 11-13。
  const view = 建假视图(建状态(拼(平段("aa X aa X aa")), 1));
  设查询(view, "aa", 选项());
  等(替换当前(view, "zz"), true, "换没换");
  等(view.state.doc.textContent, "zz X aa X aa", "文本");
  等(`${view.state.selection.from}-${view.state.selection.to}`, "6-8", "下一个的选区");
  for (const m of 读插件(view.state).matches) {
    等(view.state.doc.textBetween(m.start, m.end), "aa", "重算之后命中区间里的字");
  }
});

测("替换当前：没停在任何命中上时给 `false`（调用方拿它决定要不要提示）", () => {
  const view = 建假视图(建状态(拼(平段("aa")), 1));
  设查询(view, "zzz", 选项());
  等(替换当前(view, "x"), false, "换没换");
});

测("替换当前：替换串**长度不一样**也不吃掉后面的字", () => {
  const view = 建假视图(建状态(拼(平段("aa b aa")), 1));
  设查询(view, "aa", 选项());
  替换当前(view, "长很多的一串");
  等(view.state.doc.textContent, "长很多的一串 b aa", "文本");
});

测("全部替换：**从后往前**换，长度不一样也不会互相推着走", () => {
  // ⚠️ 从前往后换的话，第一处换长之后第二、三处的位置全被推着走了，
  //    结果是「替换全部」把文档改花。这一格就是钉那条 `reverse` 的。
  const view = 建假视图(建状态(拼(平段("aa X aa X aa")), 1));
  设查询(view, "aa", 选项());
  等(全部替换(view, "bbbb"), 3, "换了几个");
  等(view.state.doc.textContent, "bbbb X bbbb X bbbb", "文本");
});

测("全部替换：查不到时给 0，文档一个字不动", () => {
  const view = 建假视图(建状态(拼(平段("aa")), 1));
  设查询(view, "zzz", 选项());
  等(全部替换(view, "x"), 0, "换了几个");
  等(view.state.doc.textContent, "aa", "文本");
});

测("全部替换成**空串**（删除）：两处全没，剩下的骨架还在", () => {
  const view = 建假视图(建状态(拼(平段("aa X aa")), 1));
  设查询(view, "aa", 选项());
  等(全部替换(view, ""), 2, "换了几个");
  等(view.state.doc.textContent, " X ", "文本");
});

/* ── 八、界面那份判据：`正则写坏了`（2026-10-07，第 95 项）────────────── */

组("八、界面那份判据（正则写坏了）");

// 这一组量的**不是**匹配，而是**界面会不会说错话**：`正则写坏了` 是查找条
// 据以画红边、把「无结果」换成原因的那把尺子（`ui/FindBar.tsx`）。它错了，
// 屏幕上就会红着框显示"有结果"、或者安静地撒谎说"无结果"。

测("正则**没开**时，`[` 是字面量——不写坏（它会被转义掉）", () => {
  // ⚠️ 这一格钉的是"别把开关忘了":`[` 在字面量模式里完全合法，
  //    真实文档里查 `[1]` 这种引用标号是常事。
  等(正则写坏了("[", 选项()), false, "写坏了没有");
  等(区间们(在文本里找匹配("a[1]", "[1]", 选项())), "1-4", "引擎照常找得到");
});

测("正则开了、`[` 只敲了一半：写坏", () => {
  等(正则写坏了("[", 选项({ regex: true })), true, "写坏了没有");
});

测("空查询不算写坏（刚 `Ctrl+F` 打开、还没打字）", () => {
  // ⚠️ 不排掉这一格的话，查找条一打开就红着脸——`new RegExp("")` 本来合法，
  //    红的是"没查"，而没查不是错。
  等(正则写坏了("", 选项({ regex: true })), false, "写坏了没有");
});

测("正则开了、写得对的：不写坏", () => {
  等(正则写坏了("\\d+", 选项({ regex: true })), false, "写坏了没有");
});

测("⚠️⚠️ 判据与引擎**同源**：`\\p` 在 `u` 旗标下不成立", () => {
  // 这一格是给"界面自己写一份 `new RegExp`"那条路挖的坑：
  // `\p` **不带** `u` 是合法的（Annex B 的 IdentityEscape，匹配字面的 `p`），
  // 而 `编译` 的旗标永远是 `"gu"`／`"giu"`——`u` 一直在。自己重写一份判据的
  // 人只要忘了那个 `u`，这里就会给出 `false`（"没写坏"），于是查找条一边
  // 亮着"无结果"一边看着用户，而真正的原因（正则不成立）一个字都没说。
  //
  // ⚠️ 后半截是**同源本身**：判据说写坏了，引擎就必须一个结果也给不出——
  // 两边只要有一个不认这条，红框（或"无结果"）就是在撒谎。
  等(正则写坏了("\\p", 选项({ regex: true })), true, "写坏了没有");
  等(区间们(在文本里找匹配("ap b", "\\p", 选项({ regex: true }))), "", "引擎给的结果");
});

测("写坏时引擎**照旧不抛**（它只是这一趟查不到）", () => {
  // ⚠️ 引擎静默、界面出声（见 `find.ts::正则写坏了` 那段）：这一格钉住
  //    "别为了界面好写就把 `编译` 改成抛异常"——那会打断正在打字的人。
  等(区间们(在文本里找匹配("a[b", "[", 选项({ regex: true }))), "", "区间");
});

/* ── 十七、通配符（2026-10-16，朋友清单里的「功能:通配符支持」）─────────── */

组("十七、通配符：`*` 任意多、`?` 恰好一个");

测("`*` 配任意多（含零个，**也能跨空格**）", () => {
  // ⚠️ `*` 换成的是 `.*`，而 `.` 是"任意字符"——**空格也算**，所以这一串
  // 从头到尾是一个命中（实测 0-13）。这是通配符该有的语义（Windows 的
  // `*` 同理），但值得写下来：查 `a*b` 命中的可能是**很长**的一段。
  等(区间们(在文本里找匹配("ab axxb ayyyb", "a*b", 选项({ wildcard: true }))), "0-13", "区间");
  // 同一段里换成一个不跨空格的查询，就能看出"一个个分别命中"：
  等(区间们(在文本里找匹配("ab\naxxb", "a*b", 选项({ wildcard: true }))), "0-2 3-7", "换行不跨（`.` 不匹配 `\n`）");
});

测("`?` 配**恰好一个**（零个、两个都不算）", () => {
  // `axb` 与 `ayb` 都命中（中间那一个字符随便是什么），而 `ab`（零个）不命中。
  等(区间们(在文本里找匹配("ab axb ayb", "a?b", 选项({ wildcard: true }))), "3-6 7-10", "区间");
});

测("⚠️ 不开通配符时 `*` 与 `?` 就是字面量", () => {
  等(区间们(在文本里找匹配("a*b", "a*b", 选项())), "0-3", "字面量命中");
  等(区间们(在文本里找匹配("axb", "a*b", 选项())), "", "不该命中");
});

测("⚠️ 通配符里的其它元字符仍是**字面量**（先转义再换回通配符）", () => {
  // `.` 在通配符模式下只是点号：`a.b` 不该命中 `axb`
  等(区间们(在文本里找匹配("axb a.b", "a.b", 选项({ wildcard: true }))), "4-7", "区间");
  // 而 `a?b` 里的那个 `.`（由 `?` 换出来的）要真的配一个字符 ✓ 见上一条。
});

测("⚠️ 正则优先于通配符（两颗开关互斥，界面上也灰）", () => {
  // 两个都传进来时按**正则**走（`find.ts::编译` 里那两支的顺序）：
  // `a*b` 在正则里是"a、零个或多个 a、b"——命中 `ab` 与 `aab`，不命中 `axb`。
  // ⚠️ 第三段那个 `axb` 里也命中了一次——命中的是**光秃秃的那个 `b`**
  // （`a*` 允许零个 a）。这正是"正则里的 `*` 不是通配符"的证据。
  等(区间们(在文本里找匹配("ab aab axb", "a*b", 选项({ regex: true, wildcard: true }))), "0-2 3-6 9-10", "区间");
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log("\n" + "─".repeat(64));
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log("失败的：");
  for (const n of 败的) console.log(`  - ${n}`);
  process.exit(1);
}
