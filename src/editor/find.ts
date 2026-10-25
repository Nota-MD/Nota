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
import { rollActionToCanSee } from "./scroll-into-view";

/** 查找开关。三个布尔，界面上就是查找条里那三颗可以拨的开关。 */
export interface FindOptions {
  caseSensitive: boolean;
  /** 全字匹配：命中两侧不能是"词里的字符"。 */
  wholeWord: boolean;
  /** 把查询当正则（⚠️ 写坏了不算错，只是查不到——见下面 `编译`）。 */
  regex: boolean;
  /**
   * **把 `*` 与 `?` 当通配符**（2026-10-16 加，朋友清单里的「功能:通配符支持」）。
   *
   * ⚠️ 与 {@link regex} **互斥**，而且 `regex` 优先：查的是正则的时候，
   * `*` 与 `?` 在正则里本来就有意思（重复、可选），再把它们当通配符就会
   * **两套规则打架**。界面上那两颗开关也据此互斥（点一颗关掉另一颗）。
   */
  wildcard: boolean;
}

export const defaultFindOptions: FindOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  wildcard: false,
};

/** 一段文本里的一个命中。`start`/`end` 是**这段文本**里的下标。 */
export interface TextMatch {
  start: number;
  end: number;
}

/** 词字符。⚠️ 用 `\p{L}`/`\p{N}` 而不是 `\w`：中文汉字属于 `\p{L}`，
 * 而 `\w` 只认 ASCII——用 `\w` 的话「全字匹配」在中文里等于没开。 */
const wordCharacter = /[\p{L}\p{N}_]/u;

/** 正则里的元字符。非正则模式下要先转义掉，否则用户查 `1.` 会当成"1 加任意字符"。 */
const dollarCharacter = /[.*+?^${}()|[\]\\]/g;

/**
 * **通配符写法 → 正则源**（`*` = 任意多个字符、`?` = 恰好一个字符）。
 *
 * ⚠️ 做法与"把查询当正则"正好相反：**先把用户写的每一个字符都转义掉**
 * （这样 `.` `[` 这些就只是字面字符），**再**把 `\*` / `\?` 换回 `.` 那一套。
 * 反过来的写法（先替换再转义）会把刚换进去的 `.*` 又转义掉，症状是
 * "通配符开关打开之后什么都没变"——而这正是最容易写错的一步。
 *
 * ⚠️ `*` **不匹配换行**（`.` 在 JS 正则里默认就不匹配 `\n`）：查"通配符"
 * 的人要的是"这一段里的东西"，让 `a*b` 跨段把两段连起来命中的话，替换起来
 * 会吃掉段落分隔——那是另一件事（. 加 `s` 旗标）。这一条与"逐节点问"
 * 那个设计（见文件头）也是同一个口径。
 */
function throughConfigureSymbolConvertCorrectRule(query: string): string {
  return query
    .replace(dollarCharacter, "\\$&")
    .replace(/\\\*/g, ".*")
    .replace(/\\\?/g, ".");
}

function editTranslate(query: string, opts: FindOptions): RegExp | null {
  let source: string;
  if (opts.regex) {
    source = query;
  } else if (opts.wildcard) {
    source = throughConfigureSymbolConvertCorrectRule(query);
  } else {
    source = query.replace(dollarCharacter, "\\$&");
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
 * 正则**是不是写坏了**——**给界面用的那一份判据**（2026-10-07，`docs/07` 第 95 项）。
 *
 * # 为什么引擎静默、界面出声
 *
 * 上面那个 `编译` 故意不抛、`在文本里找匹配` 碰到坏正则就返回空表，这是**引擎
 * 那一侧的克制**：用户正敲到一半的 `[` 不该被当成错误打断（他下一秒就会把
 * 括号补上）。但**克制只该到引擎为止**——到了界面上，"正则根本不成立"和
 * "这次真的没找到"长得一模一样（都是 `No results`），而前者**改一个字符就能
 * 救回来**。不说出来，用户只会以为"这篇文档里没有这个词"，然后去翻别的地方。
 *
 * 所以判据分两层：**引擎照旧静默地返回空表，界面把它当场说出来**
 * （输入框变红 ＋ 一行原因，见 `ui/FindBar.tsx`）。两层各司其职，谁也不用
 * 去改对方的口径。
 *
 * # ⚠️ 界面必须调**这一个函数**，不许自己 `try { new RegExp(...) }`
 *
 * 两份判据只要差一点（最容易漏的是那个**恒开的 `u` 旗标**——`编译` 里
 * `"gu"` / `"giu"` 的 `u` 一直在），就会出现"框红着、结果却找得到"或者反过来。
 * 那不只是难看：红框在说"这个正则不成立"，而屏幕上有高亮，等于**界面自己
 * 跟自己打架**。所以这里直接复用 `编译` 本身，判据天然同一份。
 *
 * ⚠️ **空查询不算写坏**：那是"还没开始查"（刚 `Ctrl+F` 打开的框就是空的），
 * 而 `new RegExp("")` 本来就合法。不排掉的话，一按 `Ctrl+F` 就红着脸。
 */
export function correctRuleWriteBrokenDone(query: string, opts: FindOptions): boolean {
  return opts.regex && query !== "" && editTranslate(query, opts) === null;
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
export function findMatchesInText(
  text: string,
  query: string,
  opts: FindOptions,
): TextMatch[] {
  if (query === "") return [];
  const re = editTranslate(query, opts);
  if (!re) return [];

  const out: TextMatch[] = [];
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
    if (!opts.wholeWord || isWholeWord(text, start, end)) out.push({ start, end });
  }
  return out;
}

/** 命中两侧都不是词字符。⚠️ 边界**可能落在文本之外**（段首/段尾），那算通过。 */
function isWholeWord(text: string, start: number, end: number): boolean {
  const left = start > 0 ? text[start - 1]! : "";
  const right = end < text.length ? text[end]! : "";
  return !(left && wordCharacter.test(left)) && !(right && wordCharacter.test(right));
}

/* ── 文档树 → 命中列表 ─────────────────────────────────────────────────── */

/** 整个文档里的命中，位置是**文档偏移**。 */
export function computeMatch(doc: PMNode, query: string, opts: FindOptions): TextMatch[] {
  if (query === "") return [];
  const out: TextMatch[] = [];
  doc.descendants((node, pos) => {
    // ⚠️ 只在文本节点上找。`node.text` 对非文本节点是 `undefined`，
    // 而**不能**用 `node.textContent`——那会把整棵子树的文字连起来，
    // 于是"跨节点命中"又回来了（见文件头）。
    if (!node.isText || !node.text) return true;
    for (const m of findMatchesInText(node.text, query, opts)) {
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

interface pluginState {
  query: string;
  options: FindOptions;
  matches: TextMatch[];
  /** 当前命中在 `matches` 里的下标。没有命中时是 -1。 */
  index: number;
}

const emptyState: pluginState = { query: "", options: defaultFindOptions, matches: [], index: -1 };

/**
 * 「什么都没在查」。
 *
 * ⚠️ 界面层用它表示**没有查找状态**（关掉查找条、编辑器拆了），
 * 与"查了但没有命中"（`query` 非空、`total === 0`）是两回事——
 * 查找条对这两种情况的说法不一样（一个留空，一个写「无结果」）。
 */
export const emptyFindState: FindStatus = { query: "", total: 0, current: 0 };

export const findKey = new PluginKey<pluginState>("nota-find");

/** 改查询/选项。`current` 从哪开始找由 `从后面` 决定（见 `下一个`）。 */
export const settingsQueryMetadata = "nota-find-set";
/** 走到下一个 / 上一个。`from` 是 -1 表示上一步。 */
export const walkActionDollar = "nota-find-step";
/** 清空（关掉查找条）。 */
export const clearRemoveDollar = "nota-find-clear";

/** 从光标位置起找**第一个不早于**它的命中；没有就绕回第一个（环形）。 */
function thenNearMatch(s: pluginState, pos: number): number {
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
function selected(view: EditorView, m: TextMatch): void {
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, m.start, m.end));
  view.dispatch(tr);
  // ⚠️ 事务上原本挂了 `.scrollIntoView()`，**但它在这条路上不生效**：点查找
  // 那一刻焦点在查找条的输入框里，ProseMirror 算"该滚到哪"是去读浏览器当前
  // 选区的，选区不在编辑器里它就整段跳过（机理写在 `scroll-into-view.ts` 顶上）。
  // 表现是命中明明选了、视图却一动不动——长文档里等于看不见结果。
  // 改成自己滚，且**只要能看见就够**（查找是连续动作，每敲一个字都重设一次
  // 查询，顶到最上面会让正文跟着每个字乱跳）。
  rollActionToCanSee(view, m.start, m.end);
}

function shouldUse(tr: Transaction, prev: pluginState, newValuestate: EditorState): pluginState {
  if (tr.getMeta(clearRemoveDollar)) return emptyState;

  const settings = tr.getMeta(settingsQueryMetadata) as
    | { query: string; options: FindOptions }
    | undefined;
  const walk = tr.getMeta(walkActionDollar) as number | undefined;

  let query = prev.query;
  let options = prev.options;
  if (settings) {
    query = settings.query;
    options = settings.options;
  }

  // ⚠️ **文档变了就必须重算**：匹配位置是文档偏移，用户在前面插一个字，
  // 后面所有的命中位置就全错位了。不重算的话高亮会画在别的字上。
  const wantHeavyCompute = settings !== undefined || tr.docChanged;
  const matches = wantHeavyCompute ? computeMatch(newValuestate.doc, query, options) : prev.matches;

  let index = prev.index;
  if (matches.length === 0) {
    index = -1;
  } else if (settings) {
    // 新查询：从当前光标位置往后找最近的一个。
    index = thenNearMatch({ query, options, matches, index: -1 }, newValuestate.selection.from);
  } else if (walk !== undefined) {
    // 上下走一格。**环形**：走到最后一个再按"下一个"回到第一个。
    const n = matches.length;
    index = walk > 0 ? (index + 1 + n) % n : (index - 1 + n) % n;
  } else if (wantHeavyCompute) {
    // 文档变了、命中表重算了：把下标夹回合法范围（原来那一项可能已经没了）。
    index = Math.min(Math.max(index, 0), matches.length - 1);
  }

  return { query, options, matches, index };
}

/** 命中高亮的 class。⚠️ 颜色写在 `styles/bars.css` 里，这里只给名字。 */
const matchClass = "nota-find-hit";
const currentClass = "nota-find-current";

export function findPlugin(onStatus: (s: FindStatus) => void) {
  return $prose(() => {
    let aboveCount = "";
    const report = (s: pluginState) => {
      const status: FindStatus = {
        query: s.query,
        total: s.matches.length,
        current: s.index + 1,
      };
      // 签名比对，避免每敲一个字都让 React 重渲染（同 `command-state.ts`）。
      const sig = `${status.query}|${status.total}|${status.current}`;
      if (sig === aboveCount) return;
      aboveCount = sig;
      onStatus(status);
    };

    return new Plugin<pluginState>({
      key: findKey,
      state: {
        init: () => emptyState,
        apply: (tr, prev, _old, newValuestate) => shouldUse(tr, prev, newValuestate),
      },
      props: {
        decorations(state) {
          const s = findKey.getState(state);
          if (!s || s.matches.length === 0) return null;
          return DecorationSet.create(
            state.doc,
            s.matches.map((m, i) =>
              Decoration.inline(m.start, m.end, {
                class: i === s.index ? `${matchClass} ${currentClass}` : matchClass,
              }),
            ),
          );
        },
      },
      view: () => ({
        update: (view) => {
          const s = findKey.getState(view.state);
          if (s) report(s);
          return false;
        },
      }),
    });
  });
}

/* ── 命令 ──────────────────────────────────────────────────────────────── */

/** 取当前那份状态。没挂插件时给空状态。 */
function state(view: EditorView): pluginState {
  return findKey.getState(view.state) ?? emptyState;
}

export function setQuery(view: EditorView, query: string, options: FindOptions): void {
  view.dispatch(view.state.tr.setMeta(settingsQueryMetadata, { query, options }));
  // ⚠️ **设完立刻选中第一个命中**：只画高亮不移动光标的话，用户按
  // 「下一个」是从"第一个"跳到"第二个"，而他眼睛还停在原来的光标那里——
  // 看起来像是跳过了开头那一个。
  const s = state(view);
  if (s.index >= 0) selected(view, s.matches[s.index]!);
}

/** 走上一个/下一个。`方向` 大于 0 是"下一个"。 */
export function walk(view: EditorView, direction: 1 | -1): void {
  const before2 = state(view);
  if (before2.matches.length === 0) return;
  view.dispatch(view.state.tr.setMeta(walkActionDollar, direction));
  const after = state(view);
  if (after.index >= 0) selected(view, after.matches[after.index]!);
}

export function clearRemove(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(clearRemoveDollar, true));
}

/**
 * 替换**当前**这一个命中，然后把光标送到下一个。**换了才返回 `true`**
 * （没停在任何命中上时是 `false`）——调用方拿它决定要不要提示用户。
 *
 * ⚠️ 替换完之后**必须重新读一次状态**：`matches` 是替换后由插件重算的
 * （`tr.docChanged`），而"下一个"必须从**新的**命中表上取——拿旧的算
 * 会跳错一格（被替换掉的那个位置后面，所有命中都往前挪了）。
 */
export function replaceReplaceCurrent(view: EditorView, replaceReplaceBecome: string): boolean {
  const s = state(view);
  if (s.index < 0) return false;
  const m = s.matches[s.index]!;
  const tr = view.state.tr.insertText(replaceReplaceBecome, m.start, m.end);
  view.dispatch(tr);
  // 替换之后 `index` 还停在同一格上，而那一格现在是**下一个**命中了
  // （因为被替换掉的那个已经不在表里）。所以这里不能再 +1。
  const after = state(view);
  if (after.index >= 0 && after.matches[after.index]) selected(view, after.matches[after.index]!);
  return true;
}

/**
 * 全部替换。返回换了几个（调用方拿它写提示）。
 *
 * ⚠️ **从后往前换**（`reverse`）：替换文本的长度和原文不一定一样，
 * 从前往后换的话，第二个命中的位置会被第一个的改动推着走——换了三个之后
 * 后面全错位。从后往前时，前面那些命中还没被碰过，位置仍然准。
 */
export function replaceAll(view: EditorView, replaceReplaceBecome: string): number {
  const s = state(view);
  if (s.matches.length === 0) return 0;
  const n = s.matches.length;
  let tr = view.state.tr;
  for (const m of [...s.matches].reverse()) {
    tr = tr.insertText(replaceReplaceBecome, m.start, m.end);
  }
  view.dispatch(tr);
  return n;
}
