/**
 * **裸 URL**：用户打出来（或粘进来）的那串 `https://…` / `www.…` 自动变成链接。
 * 2026-09-28 落地，用户原话：「**裸 URL 自动识别成链接**」「粘贴 URL 到选中文字
 * → 自动包成链接」。
 *
 * # 两件事，一处判据
 *
 * | 什么时候 | 怎么进 | 落到文档上的样子 |
 * |---|---|---|
 * | 打到**词尾**（空格 / 制表符） | 输入规则（{@link 自动链接输入}） | 那段文字挂上 `link` 标记 |
 * | **粘**进来 | 粘贴插件（`editor/paste.ts` 调 {@link 贴上网址事务}） | 同上；**选区非空时是给选中那段挂标记** |
 *
 * ⚠️ **两路的"这是不是一个网址"必须是同一个答案**：判据只有
 * {@link 正规化网址} 一个出口（`find.ts` / `table-width.ts` 那条"匹配逻辑只有
 * 一份"的规矩）。分成两份的症状是"打出来是链接、粘进来不是"，而用户没法
 * 理解为什么。
 *
 * # 口径（四条，都是取舍）
 *
 * 1. **只认有来头的写法**：带 `http(s)://` 的，与 `www.` 开头的。
 *    ⚠️ **裸域名（`example.com`）不认**——这一条是**故意**的，不是漏了。
 *    认了的话，`README.md` / `node.js` / `index.html` / `图.png` / `v1.2`
 *    全都变成链接，而"把用户写的普通文字改成一个链接"是这件事唯一不能犯的错
 *    （与 `auto-correct.ts` 的入表判据同一条道理）。GitHub 认裸域名，
 *    代价正是这几类误报。
 * 2. **危险协议一个都不放**：{@link 危险协议} 那张黑名单。
 *    ⚠️ 上游 `linkSchema` **不校验 `href`**（`toggleLinkCommand` 原样收字符串），
 *    而这里的一个输入源是**剪贴板**——粘一段带 `javascript:` 的东西进来，
 *    等于把一段可执行文本写成链接，点一下就跑了。所以进 `link` 标记之前必须
 *    过这一道。⚠️ 这是**纵深防御的第二层**：插件也是从这条路进来的，
 *    但真正拦住它们的不该只有这一处。
 * 3. **只动"刚敲进去 / 刚粘进来"的那一串**：输入规则走 `prosemirror-inputrules`，
 *    `Ctrl+Z` 一步退回纯文本（与智能标点、自动更正同一条口径）；粘贴在
 *    一次事务里，同样一步可退。**已有文本一个字节不改。**
 * 4. **网址末尾的标点留在链接外面**（{@link 切尾标点}），这是 linkify 的通用
 *    做法，也是"每句话末尾多一颗句号在链接里"那个常见毛病的解药。
 *
 * # 已知边界（如实记着）
 *
 * - ⚠️ **行尾那颗回车不触发**：输入规则只在"打字"那一下跑，回车不是打字。
 *   所以一行结尾的 URL（后面直接换段）**要等下一个空格才成链接**。
 *   Typora 在回车时也转，本仓没做——那要在 `Enter` 的 keymap 里插一手、
 *   再和段落切分抢同一颗按键，收益（少打一个空格）远小于风险。
 * - ⚠️ **行内代码与围栏代码块里不触发**（`规则选项` 那条注释讲了机制）。
 * - ⚠️ **不做"输入时把已有文本重扫一遍"**：只认刚敲的、刚粘的，老文档一个
 *   字节不改（Nota 那条"存盘不要自动修复"的铁律）。
 */

import { $inputRule } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { MarkType } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

/* ── 第一格：判据（纯函数，测试只用这一层）──────────────────────────────── */

/**
 * 这些协议一律不许写成链接。
 *
 * ⚠️ 表里**没有** `mailto:` / `tel:` ——那两条是**正当**协议，用户写
 * `[写信](mailto:a@b.c)` 是常规做法，挡掉它们等于挡掉一条真功能。
 * 裸 URL 那一路本来也不会把 `mailto:` 认成网址（{@link 正规化网址} 只认
 * http/https/www），所以这里放行是安全的。
 */
const 危险协议表 = ["javascript:", "vbscript:", "data:", "file:", "blob:"] as const;

/**
 * 这条地址危不危险（危险 = 不许进文档）。
 *
 * @param 地址 已经写成 href 的那串（`https://…` 或 `javascript:…`）。
 *
 * ⚠️ **判据是"去掉全部空白与控制符之后的前缀"**，不是字符串开头——否则
 * `java\tscript:` 这种写法会从这道闸底下钻过去（浏览器解析 `href` 时会把
 * 里面的制表符与换行吃掉，它**仍然是**一条 `javascript:`）。
 */
export function 危险协议(地址: string): boolean {
  const 干 = 地址.replace(/[\s\u0000-\u001f\u007f]/g, "").toLowerCase();
  return 危险协议表.some((坏) => 干.startsWith(坏));
}

/**
 * 这一串像不像主机名。
 *
 * 三档放行：`localhost`（本地开发天天用）、IPv4 点分四段、以及
 * **至少带一颗点、且最后一段是 ≥2 个字母**的普通域名。
 *
 * ⚠️ 最后那条"最后一段 ≥2 个字母"是**这里唯一有份量的判据**：没有它的话
 * `www.v2` / `www.1` 这种半截东西也会变成链接；有了它，`www.nota.app` 认、
 * `www.x` 不认。IDN（`例子.中国`）走 `new URL()` 会被转成 punycode，
 * 到了这一步已经是 `xn--…`，最后一段是字母，照样放行。
 */
function 是像主机名(主机: string): boolean {
  if (主机 === "localhost") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(主机)) return true;
  return /^[^.\s/]+(\.[^.\s/]+)*\.[a-z]{2,}$/i.test(主机);
}

/**
 * 一串**候选**文字能不能当网址用；能的话给出去的 href 是什么，不能给 `null`。
 *
 * 三档：
 *
 * | 输入 | 结果 | 说明 |
 * |---|---|---|
 * | `https://a.b/c` | 原样 | 已经带协议 |
 * | `HTTP://A.B/C` | 原样 | 大小写不影响可用性，不规范化 |
 * | `www.a.b/c` | `https://` ＋ 原样 | 补的**一定是 https**（2026 年了，http 是错的默认） |
 * | 别的（含裸域名 `a.b`） | `null` | 理由在文件头第 1 条 |
 *
 * ⚠️ **纯函数**：{@link 自动链接输入} 与 {@link 贴上网址事务} 用的是同一个它，
 * 测试（`tests/url-link.test.ts`）也是。
 */
export function 正规化网址(候选: string): string | null {
  const 文 = 候选.trim();
  if (文 === "" || /\s/.test(文)) return null;
  if (危险协议(文)) return null;
  let 地址: string;
  if (/^https?:\/\//i.test(文)) {
    地址 = 文;
  } else if (/^www\./i.test(文)) {
    地址 = `https://${文}`;
  } else {
    return null;
  }
  let 解析: URL;
  try {
    解析 = new URL(地址);
  } catch {
    // `new URL` 抛 = 这串压根不是个地址（`https://` 后面什么都没有、
    // 或者中间有浏览器不接受的字符）。**当没看见**，不是报错。
    return null;
  }
  if (解析.protocol !== "http:" && 解析.protocol !== "https:") return null;
  if (!是像主机名(解析.hostname)) return null;
  return 地址;
}

/** {@link 是裸URL} 的判据出口（测试用）。 */
export function 是裸URL(候选: string): boolean {
  return 正规化网址(候选) !== null;
}

/** 左括号 / 左引号 → 右括号 / 右引号。{@link 切尾标点} 第 ② 条用它配对。 */
const 右配左: Readonly<Record<string, string>> = {
  ")": "(",
  "]": "[",
  "}": "{",
  '"': '"',
  "'": "'",
  "»": "«",
  "”": "“",
  "’": "‘",
  /* 中文那一族的右括号。⚠️ 2026-09-28 补上：`「https://a.com」` 是中文正文里
     最常见的写法，而下面那条判据要按"左右各几颗"配对，**表里没有右角括号
     就等于永远不切**——症状是链接尾巴上粘着一颗 `」`。 */
  "」": "「",
  "』": "『",
  "》": "《",
  "〉": "〈",
};

/**
 * URL **末尾**那些不属于它的字符切下来。
 *
 * 两种：
 *
 * ① **句读**（`.,;:!?`）**一律切**。理由：`见 https://a.com/b.` 里的句号是
 *    句子的一部分，不是地址的一部分。代价如实记：真以句号结尾的地址
 *    （极罕见）会被切掉一颗，用户要么用 `[文字](地址)` 写法、要么点进去之后
 *    自己补——比"每句话末尾都多一颗句号在链接里"划算得多。
 * ② **右括号 / 右引号**（`)]}"»”’` 与中文那一族 `」』》〉`）**数着切**：
 *    它前面若还有一颗**没被配掉**的左括号，才切。这是维基百科链接与 linkify 库
 *    通用的那一条——`https://en.wikipedia.org/wiki/A_(b)` 必须以 `)` 结尾
 *    （切了它，左边就多出一颗 `(` 没人配），而 `https://a.com)` 那颗 `)`
 *    是外层括号的（切了它正好配平）。左右引号字符不同，单独数一对更准，
 *    所以它们也在这一族里。
 *
 *
 * @returns `网址` 是切干净的（**可能为空串**，调用方自己判），`尾巴` 是切下来的
 *   那一截（**原样**、顺序不变），调用方要把它当普通文字放回原处。
 */
export function 切尾标点(原文: string): { 网址: string; 尾巴: string } {
  const 数 = (s: string, c: string) => s.split(c).length - 1;
  let 终 = 原文.length;
  while (终 > 0) {
    const 末 = 原文[终 - 1]!;
    if (".,;:!?".includes(末)) {
      终--;
      continue;
    }
    const 左 = 右配左[末];
    if (左 !== undefined) {
      // ⚠️ `终` 是"最后一颗之后"的那个下标，所以 `slice(0, 终)` **已经含**
      // 当前这一颗了——不要再自己 `+ 1`。2026-09-28 写测试时加了那一颗，
      // 症状是**配平的地址反被切掉尾巴**（`.../A_(b)` 变成 `.../A_(b`）。
      const 已有 = 原文.slice(0, 终);
      if (数(已有, 末) > 数(已有, 左)) {
        终--;
        continue;
      }
    }
    break;
  }
  return { 网址: 原文.slice(0, 终), 尾巴: 原文.slice(终) };
}

/* ── 第二格：输入规则（打字那一路）────────────────────────────────────── */

/**
 * 每一条规则都要带的那份选项。⚠️ 理由与 `smart-punctuation.ts` /
 * `auto-correct.ts` 里那两个同名常量**完全一样**（`inCodeMark` 的默认值是
 * `true`，不写这一句行内代码里也会生效），那段长注释在 `smart-punctuation.ts`
 * 那边，这里不重复。
 */
const 规则选项 = { inCodeMark: false } as const;

/**
 * 打到词尾那一下的匹配式。**导出是给测试用的**。
 *
 * 拆开看：
 *
 * | 段 | 作用 |
 * |---|---|
 * | `(?:^\|[\s([{（【「『"'“‘>\uFFFC])` | 前面必须是**行首 / 空白 / 左括号那一族**。⚠️ 末尾那颗 `\uFFFC` 是 `U+FFFC`（`textBetween` 给图片这类叶子节点的占位符）——网址紧跟在图片后面时前一个"字符"就是它 |
 * | `((?:https?:\/\/\|www\.)[^\s<>"'\`]+)` | 网址本体。⚠️ 收尾字符里排出 `<>"` 与反引号——它们在实际地址里一定得转义，出现即说明这不是地址 |
 * | `[ \t]$` | 词尾的触发字符。⚠️ **只有空格与制表符**，与 `auto-correct.ts` 同一条口径 |
 *
 * ⚠️ 匹配式**必须在光标处收尾**（末尾那颗 `$`）：`prosemirror-inputrules` 用
 * `始 = 光标 - match[0].length` 反推位置，不收尾就会把位置算错一个偏移，
 * 症状是"链接包住了 URL 前面那颗空格"。
 */
export const 裸URL正则 =
  /(?:^|[\s([{（【「『"'“‘>\uFFFC])((?:https?:\/\/|www\.)[^\s<>"'`]+)[ \t]$/;

/**
 * 挂进 `.use()` 的输入规则：**打到词尾那一下**把外面那串变成链接。
 *
 * ⚠️ **只有一条，而且没有开关**：这件事没有对应的设置项（用户要的就是它一直在），
 * 为它加一格控件只是多一个没人会去拨的开关。
 *
 * ⚠️ **排在整串 `.use()` 的后面**（`create.ts` 里挂在自动更正旁边）：上游那些
 * 输入规则要的分隔符是 `#` / `>` / `-` / 数字 / 反引号 / `$`，与"字母冒号
 * 斜杠那一串"不重合，抢不起来；排后面是零代价的保险。
 */
export function 自动链接输入() {
  return [
    $inputRule(() =>
      new InputRule(裸URL正则, (state, 匹配, 始, 终) => {
        const 原 = 匹配[1]!;
        // ⚠️ 先切尾标点**再**判网址：`https://a.com/b.` 里那颗句号让
        // `new URL` 仍然成功，而 `https://a.com/b,` 里那颗逗号未必——顺序反了
        // 会出现"带逗号的不认、带句号的认"这种说不通的差别。
        const { 网址, 尾巴 } = 切尾标点(原);
        const 地址 = 正规化网址(网址);
        if (!地址) return null;
        const 链接 = state.schema.marks.link;
        if (!链接) return null;
        // ⚠️ `匹配[0]` 是"**前缀字符 ＋ 网址 ＋ 触发空白**"，`始` 落在前缀
        // 字符上、`终` 在光标（触发空白之后）。所以网址本体的区间是
        // `[始 + 前缀长, 终 - 1)`。前缀长**只能这么算**，不能写死：
        // 行首时前缀是空的（`^` 那一支），写死 1 会把第一个字符切掉。
        const 前缀长 = 匹配[0].length - 原.length - 1;
        return 换链接(state, 始 + 前缀长, 终 - 1, 网址, 尾巴, 地址, 链接);
      }, 规则选项),
    ),
  ];
}

/**
 * 把 `[始, 终)` 那段文字换成"挂上链接标记的同一段文字（＋尾巴）"。
 *
 * ⚠️ **三个可能的坑，都在这儿一次踩完**：
 *
 * ① **不能用 `addMark`**：那一段现在是纯文本，`addMark` 只加标记、不改文字，
 *    看着也能用——但**尾标点那一段要留在链接外面**，而 `addMark` 是整段一刀，
 *    分不出外面。所以走 `replaceWith` ＋ 显式带 mark 的 `schema.text`。
 * ② **`removeStoredMark`**：ProseMirror 的"存储标记"会让**紧接着**敲的下一个
 *    字也带上链接——用户打完 URL 接着写正文，会发现自己在一个链接里。
 *    粘贴那一路同理。
 * ③ **顺序**：链接节点在前、尾巴在后，一次 `replaceWith` 传数组。
 */
function 换链接(
  state: EditorState,
  始: number,
  终: number,
  网址: string,
  尾巴: string,
  地址: string,
  链接: MarkType,
) {
  const 节点 = [state.schema.text(网址, [链接.create({ href: 地址 })])];
  if (尾巴 !== "") 节点.push(state.schema.text(尾巴));
  return state.tr.replaceWith(始, 终, 节点).removeStoredMark(链接);
}

/* ── 第三格：粘贴那一路的入口 ──────────────────────────────────────────── */

/**
 * 剪贴板里那串纯文本是个网址时，算出"贴进去"该派的事务；不是网址、或者落点
 * 不合适时给 `null`（调用方接着往下判，交给别的处理器）。
 *
 * 两种落法：
 *
 * | 选区 | 动作 |
 * |---|---|
 * | **非空**（选中了"这里"两个字） | 给**选中那段**挂上链接，文字一个字节不动（用户原话：「粘贴 URL 到选中文字 → 自动包成链接」） |
 * | 空 | 插入网址本身，**当场就是链接**（不用再等下一个空格） |
 *
 * ⚠️ **只认"剪贴板里干干净净就是一条网址"**（前后空白算干净，中间有空白不算）。
 * 粘一段"看这里 https://a.com 很有意思"不该把整段变成链接——那既不可能是
 * 用户要的，也会把正文吃掉。
 *
 * ⚠️ **代码块那一道闸在调用方**（`paste.ts`，与上游 `clipboard` 插件同一处口径）：
 * 代码块里粘网址就该是纯文本。
 *
 * ⚠️ **选区是不是"行内"必须自己看**：NodeSelection（选中一整张图片、一个代码块）
 * 上 `from`/`to` 之间是一整个**块节点**，`addMark` 会在它身上挂链接标记，
 * 存盘序列化出来没法看。所以只给 `inlineContent` 的两端挂。
 */
export function 贴上网址事务(state: EditorState, 剪贴板文本: string): Transaction | null {
  const 地址 = 正规化网址(剪贴板文本);
  if (!地址) return null;
  const 链接 = state.schema.marks.link;
  if (!链接) return null;
  const { selection } = state;
  if (selection.empty) {
    // ⚠️ **不能用 `insertText`**：它的签名里**没有** marks 那一格
    //（`insertText(text, from?, to?)`），带上第四参会编译报错。要"插进去就带
    // 标记"只能自己造一个 text 节点递给 `replaceWith`。
    return state.tr
      .replaceWith(
        selection.from,
        selection.to,
        state.schema.text(剪贴板文本.trim(), [链接.create({ href: 地址 })]),
      )
      .removeStoredMark(链接);
  }
  if (!selection.$from.parent.inlineContent || !selection.$to.parent.inlineContent) return null;
  return state.tr.addMark(selection.from, selection.to, 链接.create({ href: 地址 }));
}
