/**
 * 查找与替换（`docs/07` backlog 第 4 项）。
 *
 * # 一份匹配逻辑，两个编辑器用
 *
 * **匹配是纯函数**（`在文本里找匹配`）——给它一段文本、一个查询、几个开关，
 * 它给出这段文本里的所有命中区间。它不认识 ProseMirror，也不认识 CodeMirror。
 *
 * 两个适配器各走各的：
 * - **所见即所得**：`doc.descendants` 挨个文本节点问一遍（下面 `算匹配`）。
 *   ⚠️ **逐节点问，不是把全文拼起来问**：文档树里两个相邻节点之间没有
 *   字符，拼起来之后 `终点` 和 `起点` 会隔着段落边界"命中"——一个横跨
 *   两段的查询在界面上是查不到的，而拼起来的写法会把它当成命中。
 * - **源码模式**：整篇文本就是一条字符串，偏移量直接就是文档偏移
 *   （`editor/source.ts` 里那一段）。
 *
 * 这样"大小写敏感""全字匹配""正则"三件事的口径**只有一份**，不会出现
 * "所见即所得是 3 个命中、源码模式是 4 个"这种没人查得动的差异。
 *
 * # 为什么自己写，不用 `@codemirror/search`
 *
 * ⚠️ **它在 `node_modules` 里不存在**（`package.json` 没列，本机也没装），
 * 而这个项目是在**没有网**的容器里构建的。CodeMirror 自带的那套查找面板
 * 因此不可用——源码模式那一侧的查找只能是手写的。既然那一侧必须手写，
 * 所见即所得这一侧就不该另引一套库：两边共用 `在文本里找匹配`，口径天然一致。
 *
 * # 命中的高亮是**装饰**，不是文档
 *
 * 所有命中都走 `Decoration.inline`（只改 DOM 的 class），一个字节都不进文档。
 * 所以：查找不会改动文档、不会进撤销栈、关掉查找条之后一个字都不留。
 */

import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { $prose } from "@milkdown/kit/utils";

// ⚠️ 命中的滚动是自己算的（`滚动到可见`），不用事务上的 `scrollIntoView`：
// 理由写在那边文件头，以及 `选中` 里那段。
import { 滚动到可见 } from "./scroll-into-view";

/** 查找开关。三个布尔，界面上就是查找条里那三颗可以拨的开关。 */
export interface FindOptions {
  caseSensitive: boolean;
  /** 全字匹配：命中两侧不能是"词里的字符"。 */
  wholeWord: boolean;
  /** 把查询当正则（⚠️ 写坏了不算错，只是查不到——见下面 `编译`）。 */
  regex: boolean;
}

export const 默认查找选项: FindOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

/** 一段文本里的一个命中。`start`/`end` 是**这段文本**里的下标。 */
export interface 文本命中 {
  start: number;
  end: number;
}

/** 词字符。⚠️ 用 `\p{L}`/`\p{N}` 而不是 `\w`：中文汉字属于 `\p{L}`，
 * 而 `\w` 只认 ASCII——用 `\w` 的话「全字匹配」在中文里等于没开。 */
const 词字符 = /[\p{L}\p{N}_]/u;

/** 正则里的元字符。非正则模式下要先转义掉，否则用户查 `1.` 会当成"1 加任意字符"。 */
const 元字符 = /[.*+?^${}()|[\]\\]/g;

function 编译(query: string, opts: FindOptions): RegExp | null {
  let source: string;
  if (opts.regex) {
    source = query;
  } else {
    source = query.replace(元字符, "\\$&");
  }
  // ⚠️ 正则写坏了（比如用户正在敲 `[`）**不是错误**，是"这一次查不到"。
  // 抛出去会打断用户打字——他只是在把那个括号打完。
  try {
    return new RegExp(source, opts.caseSensitive ? "gu" : "giu");
  } catch {
    return null;
  }
}

/**
 * 在一段文本里找出所有命中。
 *
 * ⚠️ 空查询返回**空表**，不是"命中一切"：查找框里还没打字时，
 * 把全文都涂上高亮是最没用的反应。
 *
 * ⚠️ 零宽正则（`^`、`a*`）会匹配出 `start === end` 的区间——那种命中
 * **高亮不出来、也替换不出东西**，一律丢掉，否则 `replaceAll` 会在同一个
 * 位置上原地打转（用户会看到"替换全部"点了没反应，或者更糟：死循环）。
 */
export function 在文本里找匹配(
  text: string,
  query: string,
  opts: FindOptions,
): 文本命中[] {
  if (query === "") return [];
  const re = 编译(query, opts);
  if (!re) return [];

  const out: 文本命中[] = [];
  for (;;) {
    const m = re.exec(text);
    if (!m) break;
    // 零宽命中：丢掉，但仍然要让 `lastIndex` 往前走，否则永远出不来。
    if (m[0].length === 0) {
      // ⚠️ 只有**带 `g`** 的正则才有 `lastIndex`（这里编译时一定带了）。
      re.lastIndex += 1;
      if (re.lastIndex > text.length) break;
      continue;
    }
    const start = m.index;
    const end = start + m[0].length;
    if (!opts.wholeWord || 是整词(text, start, end)) out.push({ start, end });
  }
  return out;
}

/** 命中两侧都不是词字符。⚠️ 边界**可能落在文本之外**（段首/段尾），那算通过。 */
function 是整词(text: string, start: number, end: number): boolean {
  const 左 = start > 0 ? text[start - 1]! : "";
  const 右 = end < text.length ? text[end]! : "";
  return !(左 && 词字符.test(左)) && !(右 && 词字符.test(右));
}

/* ── 文档树 → 命中列表 ─────────────────────────────────────────────────── */

/** 整个文档里的命中，位置是**文档偏移**。 */
export function 算匹配(doc: PMNode, query: string, opts: FindOptions): 文本命中[] {
  if (query === "") return [];
  const out: 文本命中[] = [];
  doc.descendants((node, pos) => {
    // ⚠️ 只在文本节点上找。`node.text` 对非文本节点是 `undefined`，
    // 而**不能**用 `node.textContent`——那会把整棵子树的文字连起来，
    // 于是"跨节点命中"又回来了（见文件头）。
    if (!node.isText || !node.text) return true;
    for (const m of 在文本里找匹配(node.text, query, opts)) {
      // ⚠️⚠️ **文本节点里第 i 个字符就在 `pos + i`**——不是 `pos + 1 + i`。
      //
      // `pos` 是 `descendants` 给的"**节点之前**那个位置"，而对**文本节点**来说
      // 那个位置**就是它第一个字符所在的位置**（`pos + 1` 是给**父节点**用的：
      // 一个块的内容从它自己的 `pos + 1` 开始）。
      //
      // ⚠️ 这里原来写的是 `pos + 1 + m.start`，**整整多算一格**（2026-10-06 修，
      // `docs/07` BUG-67）。用户的原话是「**实测搜索后高亮框向后位移一位**」——
      // 症状正是这个：高亮画在命中的**右边一格**上，于是最后一个字符那一次命中
      // 的区间跨出了文本节点、**什么都画不出来**（截图里 `ABCD` 查 `D`
      // 那颗 D 上一点高亮都没有，像素读数是纯背景）。**选区与滚动同源地错**：
      // "找下一个"选中的也是右移一格的那个字。
      //
      // 判据（探针，别靠记忆）：`doc.descendants` 给的 `pos` 上，
      // `doc.textBetween(pos, pos + 1)` 就是**第一个字符**。
      out.push({ start: pos + m.start, end: pos + m.end });
    }
    return true;
  });
  return out;
}

/* ── 插件状态 ──────────────────────────────────────────────────────────── */

/** 给界面看的：查询是什么、一共几个命中、现在停在第几个。 */
export interface FindStatus {
  query: string;
  /** 命中总数。0 且 `query !== ""` = "查不到"，界面上要说出来。 */
  total: number;
  /** 当前停在**第几个**，从 1 数起（0 = 没有当前项）。 */
  current: number;
}

interface 插件状态 {
  query: string;
  options: FindOptions;
  matches: 文本命中[];
  /** 当前命中在 `matches` 里的下标。没有命中时是 -1。 */
  index: number;
}

const 空状态: 插件状态 = { query: "", options: 默认查找选项, matches: [], index: -1 };

/**
 * 「什么都没在查」。
 *
 * ⚠️ 界面层用它表示**没有查找状态**（关掉查找条、编辑器拆了），
 * 与"查了但没有命中"（`query` 非空、`total === 0`）是两回事——
 * 查找条对这两种情况的说法不一样（一个留空，一个写「无结果」）。
 */
export const 空查找状态: FindStatus = { query: "", total: 0, current: 0 };

export const 查找键 = new PluginKey<插件状态>("nota-find");

/** 改查询/选项。`current` 从哪开始找由 `从后面` 决定（见 `下一个`）。 */
export const 设置查询元 = "nota-find-set";
/** 走到下一个 / 上一个。`from` 是 -1 表示上一步。 */
export const 走动元 = "nota-find-step";
/** 清空（关掉查找条）。 */
export const 清除元 = "nota-find-clear";

/** 从光标位置起找**第一个不早于**它的命中；没有就绕回第一个（环形）。 */
function 就近命中(s: 插件状态, pos: number): number {
  if (s.matches.length === 0) return -1;
  const hit = s.matches.findIndex((m) => m.start >= pos);
  return hit === -1 ? 0 : hit;
}

/**
 * 把**光标**送到某个命中上并选中它。
 *
 * ⚠️ 选中的是**命中本身**（而不是只滚动过去）。这样"找下一个"之后接着打字
 * 就是替换它——那是查找最常用的下一步。也正因为要选区，这条必须派事务，
 * 不能只改装饰。
 */
function 选中(view: EditorView, m: 文本命中): void {
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, m.start, m.end));
  view.dispatch(tr);
  // ⚠️ 事务上原本挂了 `.scrollIntoView()`，**但它在这条路上不生效**：点查找
  // 那一刻焦点在查找条的输入框里，ProseMirror 算"该滚到哪"是去读浏览器当前
  // 选区的，选区不在编辑器里它就整段跳过（机理写在 `scroll-into-view.ts` 顶上）。
  // 表现是命中明明选了、视图却一动不动——长文档里等于看不见结果。
  // 改成自己滚，且**只要能看见就够**（查找是连续动作，每敲一个字都重设一次
  // 查询，顶到最上面会让正文跟着每个字乱跳）。
  滚动到可见(view, m.start, m.end);
}

function 应用(tr: Transaction, prev: 插件状态, 新state: EditorState): 插件状态 {
  if (tr.getMeta(清除元)) return 空状态;

  const 设置 = tr.getMeta(设置查询元) as
    | { query: string; options: FindOptions }
    | undefined;
  const 走 = tr.getMeta(走动元) as number | undefined;

  let query = prev.query;
  let options = prev.options;
  if (设置) {
    query = 设置.query;
    options = 设置.options;
  }

  // ⚠️ **文档变了就必须重算**：匹配位置是文档偏移，用户在前面插一个字，
  // 后面所有的命中位置就全错位了。不重算的话高亮会画在别的字上。
  const 要重算 = 设置 !== undefined || tr.docChanged;
  const matches = 要重算 ? 算匹配(新state.doc, query, options) : prev.matches;

  let index = prev.index;
  if (matches.length === 0) {
    index = -1;
  } else if (设置) {
    // 新查询：从当前光标位置往后找最近的一个。
    index = 就近命中({ query, options, matches, index: -1 }, 新state.selection.from);
  } else if (走 !== undefined) {
    // 上下走一格。**环形**：走到最后一个再按"下一个"回到第一个。
    const n = matches.length;
    index = 走 > 0 ? (index + 1 + n) % n : (index - 1 + n) % n;
  } else if (要重算) {
    // 文档变了、命中表重算了：把下标夹回合法范围（原来那一项可能已经没了）。
    index = Math.min(Math.max(index, 0), matches.length - 1);
  }

  return { query, options, matches, index };
}

/** 命中高亮的 class。⚠️ 颜色写在 `styles/bars.css` 里，这里只给名字。 */
const 命中类 = "nota-find-hit";
const 当前类 = "nota-find-current";

export function 查找插件(onStatus: (s: FindStatus) => void) {
  return $prose(() => {
    let 上次 = "";
    const 报 = (s: 插件状态) => {
      const status: FindStatus = {
        query: s.query,
        total: s.matches.length,
        current: s.index + 1,
      };
      // 签名比对，避免每敲一个字都让 React 重渲染（同 `command-state.ts`）。
      const sig = `${status.query}|${status.total}|${status.current}`;
      if (sig === 上次) return;
      上次 = sig;
      onStatus(status);
    };

    return new Plugin<插件状态>({
      key: 查找键,
      state: {
        init: () => 空状态,
        apply: (tr, prev, _old, 新state) => 应用(tr, prev, 新state),
      },
      props: {
        decorations(state) {
          const s = 查找键.getState(state);
          if (!s || s.matches.length === 0) return null;
          return DecorationSet.create(
            state.doc,
            s.matches.map((m, i) =>
              Decoration.inline(m.start, m.end, {
                class: i === s.index ? `${命中类} ${当前类}` : 命中类,
              }),
            ),
          );
        },
      },
      view: () => ({
        update: (view) => {
          const s = 查找键.getState(view.state);
          if (s) 报(s);
          return false;
        },
      }),
    });
  });
}

/* ── 命令 ──────────────────────────────────────────────────────────────── */

/** 取当前那份状态。没挂插件时给空状态。 */
function 状态(view: EditorView): 插件状态 {
  return 查找键.getState(view.state) ?? 空状态;
}

export function 设查询(view: EditorView, query: string, options: FindOptions): void {
  view.dispatch(view.state.tr.setMeta(设置查询元, { query, options }));
  // ⚠️ **设完立刻选中第一个命中**：只画高亮不移动光标的话，用户按
  // 「下一个」是从"第一个"跳到"第二个"，而他眼睛还停在原来的光标那里——
  // 看起来像是跳过了开头那一个。
  const s = 状态(view);
  if (s.index >= 0) 选中(view, s.matches[s.index]!);
}

/** 走上一个/下一个。`方向` 大于 0 是"下一个"。 */
export function 走(view: EditorView, 方向: 1 | -1): void {
  const 前 = 状态(view);
  if (前.matches.length === 0) return;
  view.dispatch(view.state.tr.setMeta(走动元, 方向));
  const 后 = 状态(view);
  if (后.index >= 0) 选中(view, 后.matches[后.index]!);
}

export function 清除(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(清除元, true));
}

/**
 * 替换**当前**这一个命中，然后把光标送到下一个。**换了才返回 `true`**
 * （没停在任何命中上时是 `false`）——调用方拿它决定要不要提示用户。
 *
 * ⚠️ 替换完之后**必须重新读一次状态**：`matches` 是替换后由插件重算的
 * （`tr.docChanged`），而"下一个"必须从**新的**命中表上取——拿旧的算
 * 会跳错一格（被替换掉的那个位置后面，所有命中都往前挪了）。
 */
export function 替换当前(view: EditorView, 替换成: string): boolean {
  const s = 状态(view);
  if (s.index < 0) return false;
  const m = s.matches[s.index]!;
  const tr = view.state.tr.insertText(替换成, m.start, m.end);
  view.dispatch(tr);
  // 替换之后 `index` 还停在同一格上，而那一格现在是**下一个**命中了
  // （因为被替换掉的那个已经不在表里）。所以这里不能再 +1。
  const 后 = 状态(view);
  if (后.index >= 0 && 后.matches[后.index]) 选中(view, 后.matches[后.index]!);
  return true;
}

/**
 * 全部替换。返回换了几个（调用方拿它写提示）。
 *
 * ⚠️ **从后往前换**（`reverse`）：替换文本的长度和原文不一定一样，
 * 从前往后换的话，第二个命中的位置会被第一个的改动推着走——换了三个之后
 * 后面全错位。从后往前时，前面那些命中还没被碰过，位置仍然准。
 */
export function 全部替换(view: EditorView, 替换成: string): number {
  const s = 状态(view);
  if (s.matches.length === 0) return 0;
  const n = s.matches.length;
  let tr = view.state.tr;
  for (const m of [...s.matches].reverse()) {
    tr = tr.insertText(替换成, m.start, m.end);
  }
  view.dispatch(tr);
  return n;
}
