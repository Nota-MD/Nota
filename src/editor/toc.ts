/**
 * **内容目录（TOC）**：把正文里已有的标题抽成一段可点的链接列表，插进正文。
 *
 * `docs/10-feature-matrix.md` §1 的「目录（TOC）」在 2026-09-27 之前是 ⬜。
 * 菜单项（`para.toc`「内容目录」）**早就在**了，只是 `App.tsx` 里没有它的
 * 处理函数——于是它**一直是灰的**，点不动，而且不报错（`ui/useMenus.ts`
 * 那张判据表的第二条就是拿"有没有处理函数"当"这个功能做了没有"）。
 *
 * # 形状：一段**普通的 markdown 列表**，两头用注释夹住
 *
 * ```markdown
 * <!-- nota:toc -->
 *
 * - [甲](#甲)
 *   - [乙](#乙)
 *
 * <!-- /nota:toc -->
 * ```
 *
 * 三条理由，一条比一条实在：
 *
 * 1. **它必须是正文**。用户要在源码模式里看见它、要能整个删掉、要能复制去
 *    别处——插成一颗粒子节点（像公式块那样）就等于把它锁在所见即所得里，
 *    源码模式下是一段谁也读不懂的记号。
 * 2. **两头那对注释是"这里有一份目录"的唯一判据**，靠它才能做"再点一次就是
 *    更新"（见 [`找目录`]）。不夹的话，唯一能认的只有"一串以 `- [` 开头的
 *    行"，那会跟用户自己手写的链接列表撞上——而"更新目录"去改用户手写的东西
 *    是**不能接受的**。
 * 3. 注释在编辑区里**本来就有节点**（`editor/html-block.ts`，块级 HTML 与
 *    注释共用一个节点），解析、序列化、往返都是现成的，这个文件不需要碰
 *    schema —— 这也是它能只有几百行的原因。
 *
 * # ⚠️ 它是**快照**，不会自己变新
 *
 * 标题改了、加了、删了，已经插在正文里那一份**不会跟着动**。这是**有意的**，
 * 不是没做完：
 *
 * - 真做"实时更新"要么加一颗 NodeView 节点（那就违背上面第 1 条），要么挂一条
 *   `appendTransaction` 插件在**每次按键**时重扫全文——而重扫要先把整篇文档
 *   序列化成 markdown（判据得和侧栏大纲**同一份**，见 [`生成目录`] 那段），
 *   那是一次 O(全文) 的序列化，跟着每一次击键跑。
 * - 更要紧的是：目录是**用户文档里的一段字**。让它随敲键自己变，等于程序
 *   替用户改他写的东西——本仓对这件事的立场写在 `lax-heading.ts` 顶上
 *   （"存盘会改字"那个病灶）。用户点一下「内容目录」才动它，是唯一说得通的口径。
 *
 * 于是这条命令的语义是 **"插入或更新"**：文档里还没有就插，已经有了就**原地
 * 重算那一份**（两个标记之间的东西整个换掉，别处一个字不动）。
 *
 * # 锚点是怎么定的
 *
 * 见 [`锚点`]。一句话：照 GitHub 的规矩（小写、空白变 `-`、去掉标点、保留
 * 中日韩），重名按出现顺序加 `-1` / `-2`。**导出那一侧必须用同一个函数**，
 * 否则目录里的链接点过去是空的——`editor/export.ts::补标题锚点` 就是从
 * 这里引的。
 */

import { extractOutline, type OutlineItem } from "@/editor/headings";

/** 目录开头的那个标记（一整行，前后不能有别的东西）。 */
export const tocStartMarker = "<!-- nota:toc -->";
/** 目录结尾的那个标记。 */
export const tocEndMarker = "<!-- /nota:toc -->";

/**
 * 认一个节点的原文是不是这两个标记之一。
 *
 * ⚠️ 比对的是 `trim()` 之后的结果：mdast 往返一趟回来，注释两边的空白是
 * remark 说了算的，本仓不靠"一个空格都不差"来认自己的标记。
 */
export function isItemRecordMark(source: string): boolean {
  const clean = source.trim();
  return clean === tocStartMarker || clean === tocEndMarker;
}

/**
 * 一个标题该有的锚点。
 *
 * 规矩照 **GitHub**（也是 Typora 导出时用的那一套），因为它决定了
 * "`[甲](#甲)` 点过去能不能跳"这件事，而导出的 HTML 是给人拿去 GitHub /
 * 静态站上看的：
 *
 * 1. 先**小写**（`toLowerCase`）——⚠️ 只影响拉丁字母，中日韩没有大小写；
 * 2. 去掉**不是**"字母 / 数字 / 空白 / 连字符 / 下划线 / 中日韩"的字符
 *    （标点、emoji、`#` 都走人）。⚠️ 用 `\p{L}\p{N}\p{M}` 这类 Unicode
 *    属性转义而不是 `a-z0-9`：后者会把中文整个抹掉，得到一串空锚点。
 * 3. 空白折成**一个** `-`；
 * 4. **去重**：同一个名字出现第二次起加 `-1`、`-2`……（`已用` 由调用方带着，
 *    按文档顺序往下走）。⚠️ GitHub 的口径是"重名的第 n 个加 `-n`"，本仓
 *    跟着它——不加的话，两个「小结」在导出的 HTML 里会指向同一处。
 *
 * 全被滤掉时（标题只有一个 emoji 之类）兜底给 `"section"`，理由是**空串锚点
 * 在 HTML 里等于没写**（`id=""` 谁都不匹配，而且 `#` 会跳到页面顶部）。
 */
export function anchor(text2: string, alreadyUse: Set<string>): string {
  const clean = text2
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s+/g, "-");
  const bottom = clean === "" ? "section" : clean;

  let name3 = bottom;
  for (let n = 1; alreadyUse.has(name3); n++) name3 = `${bottom}-${n}`;
  alreadyUse.add(name3);
  return name3;
}

/**
 * 把一串标题排成目录的**列表正文**（不含两头的标记）。
 *
 * 缩进按**相对层级**算（第一条标题是几级，它就是第 0 层），所以一份从 `##`
 * 开始写的文档不会整个缩进一格——markdown 的缩进是语义（嵌套列表），
 * 而"从几级开始"是排版，两回事。
 *
 * 返回 `null` 表示**一个标题都没有**：那时插一份空目录没有意义，调用方据此
 * 让菜单项变灰（`editor/command-state.ts` 的 `hasHeadings`）。
 *
 * ⚠️ `锚点` 的去重集**在这里新建**，一次生成一份目录只算一遍——调用方若把
 * 同一份 `已用` 复用两次（比如"先试算再真插"），第二次会得到一堆 `-1`
 * 后缀。导出那边也是自己新建一份（见 `export.ts`）。
 */
export function generateBecomeItemRecord(headings: readonly OutlineItem[]): string | null {
  if (headings.length === 0) return null;
  const mostLight = Math.min(...headings.map((t) => t.level));
  const alreadyUse = new Set<string>();
  return headings
    .map((t) => {
      const shrinkEnter = "  ".repeat(Math.max(0, t.level - mostLight));
      const name3 = t.text.replace(/[[\]]/g, "\\$&"); // 方括号会把链接拆散
      return `${shrinkEnter}- [${name3}](#${anchor(t.text, alreadyUse)})`;
    })
    .join("\n");
}

/**
 * 一整块目录（含两头标记、上下各留一个空行）——**插进正文的就是这一串**。
 *
 * ⚠️ 标记与列表之间**必须空一行**：markdown 里 HTML 块以空行结束，挤在一起
 * 的话那段注释会把后面的列表**一起吞进同一个 HTML 块**（CommonMark 第 2 类
 * HTML 块的边界就是空行）。吞了之后解析回来只剩一颗 `notaHtmlBlock`，
 * 列表看不见了——而文件里明明是好的，症状很难查。
 *
 * ⚠️ 前后那两个换成对：`\n\n` 是"与上下段落隔开"。插在段落正中间时
 * （光标在一段话中间），没有它们的话列表会跟那一段粘成同一块。
 */
export function tocBlockText(columnTable: string): string {
  return `${tocStartMarker}\n\n${columnTable}\n\n${tocEndMarker}`;
}

/**
 * 从一篇 markdown 里算出该有的那一块；没有标题就返回 `null`。
 *
 * ⚠️ 判据走 [`extractOutline`]——**和侧栏「大纲」页是同一份**。两份各扫一遍
 * 的话，用户会在同一个界面上看到"大纲里有 7 条、目录里只有 6 条"这种东西，
 * 而两边都不报错。
 *
 * ⚠️ `strict` 从设置来（`Settings.strict_markdown`），与侧栏那一路同源。
 */
export function computeItemRecordBlock(markdown: string, strict: boolean): string | null {
  const columnTable = generateBecomeItemRecord(extractOutline(markdown, strict));
  return columnTable === null ? null : tocBlockText(columnTable);
}

/**
 * 在**纯文本**里找已有的目录块，返回那对标记各自的起止下标。
 *
 * ⚠️ 这是给**测试与源码模式**用的纯文本版本；所见即所得那一侧走的是
 * `editor/insert.ts::目录事务`（它认的是文档树里的节点，不是字符下标——
 * 在两处各写一份替换逻辑，迟早会在"用户在标记中间插了一段字"这种情形上
 * 分道扬镳）。
 *
 * 找不到、或者只有开头没有结尾（用户删了一半）都返回 `null`——那时
 * **按"没有目录"处理**：再点一次会插一份新的，而不是去猜那半份该补在哪。
 */
export function findItemRecord(markdown: string): { start5: number; end2: number } | null {
  const start5 = markdown.indexOf(tocStartMarker);
  if (start5 === -1) return null;
  const tailStart = markdown.indexOf(tocEndMarker, start5 + tocStartMarker.length);
  if (tailStart === -1) return null;
  return { start5, end2: tailStart + tocEndMarker.length };
}

/**
 * 用新的一块替掉文档里已有的那一块；没有就返回 `null`（调用方据此走"插入"）。
 *
 * ⚠️ 替换范围**含两头的标记**（`[起, 止)` 到结束标记的尾巴），所以替换之后
 * 整篇文档里那对标记仍然只有一对。
 */
export function replaceReplaceItemRecord(markdown: string, newValueBlock: string): string | null {
  const range = findItemRecord(markdown);
  if (!range) return null;
  return markdown.slice(0, range.start5) + newValueBlock + markdown.slice(range.end2);
}
