/**
 * 文档开头那段 **YAML front matter** 的拆分与拼回（两个纯函数，没有状态）。
 *
 * # 为什么需要它：编辑器读不懂 front matter，而且**会把它毁掉**
 *
 * 所见即所得这一侧是 Milkdown（ProseMirror + remark），认的是 **CommonMark**。
 * 而 CommonMark 里 `---` 独占一行叫**分割线**（thematic break）——它不认识
 * "开头两行 `---` 夹一段 YAML"这回事。于是：
 *
 * ```text
 * 存盘前                     打开再存盘之后
 * ---                        ---
 * theme: seriph     ⇒
 * ---                        ## theme: seriph
 * ```
 *
 * 收尾那行 `---` 被吃掉了，`theme: seriph` 落成 **setext 标题**（`##` 是
 * 序列化时补的）。这是**静默的数据损毁**：用户没改过那一行，界面上也看不出
 * 少了什么（所见即所得里它本来就长得像正文），存一次盘就没了。2026-09-26
 * 开窗实测（`Ctrl+S` 前后比 `od -c`）撞出来的，根因追到最后就是这一段。
 *
 * 后果不止"少两行"：Slidev 的 `theme:` 就写在这儿，所以"主题读不到"那个
 * 报障的**根**是这个（插件读的是后端镜像里的正文，而镜像里早就没有 front
 * matter 了）。
 *
 * # 办法：在边界上**原样留住**，编辑器从头到尾看不见它
 *
 * 进编辑器之前把开头那一段切下来（[`拆前置块`]），出来的时候原样拼回去
 * （[`拼回前置块`]）。持有的是**原文切片**（含首尾两行围栏、连换行一起），
 * 不重新拼行——所以 CRLF、行尾空格、缩进写法一个字节都不会变。
 * 连**围栏后面那几行空行**也一起留着（不在这一侧留住，编辑器会把正文开头
 * 的空行顺手删掉，理由见 [`拆分结果.前置块`]）。
 *
 * ⚠️ **只走"整篇进出"这一条路**（建实例的初始文本、`setMarkdown`、
 * `getMarkdown`/`onChange` 的返回值），所以调用方见到的文本**始终是完整的**
 * （含 front matter）。切下来的那一段在编辑器里**不是节点、也不是装饰**，
 * 它根本不在文档树里。
 *
 * # 为什么不真做一个 front matter 节点
 *
 * 那条路要引 `remark-frontmatter` 一类依赖，再补 schema / parser /
 * serializer / NodeView，还要逐处判定哪些插件该认得这个节点——是另一个量级的
 * 改动。而这里要的只是"**别把它弄丢**"。
 *
 * 📌 **2026-10-04（`docs/07` 第 64 项）：用户拍板"做成可编辑的"，做法仍然不走
 * 节点那条路**——见本文件下面那一段（[`拆前置块内文`] 一族）：编辑框放在正文
 * 上方那条横幅里，改的是一段**文本**，进出仍在边界上完成。理由有两条：
 * ① 本仓不许加依赖（`remark-frontmatter` 不在 `node_modules` 里），而节点那条
 * 路的一半工作量就在补那套依赖缺口；② 用户要的是"能改那几行"，不是"那几行
 * 在文档树里"——做成节点之后还要回答"撤销栈里它算不算一步""导出要不要带上它"
 * 这一类问题，而键值表式的编辑还会**重新序列化**（注释、顺序、引号风格全丢），
 * 那正是这三轮一直在治的病。
 *
 * ⚠️ **源码模式（CodeMirror）不经过这里**：它手里就是原文，本来就能看见、
 * 能改，也不做任何规范化（见 `source.ts` 文件头）。
 *
 * # 判据是保守的：`---` 首先是分割线
 *
 * 认它当 front matter 要同时满足三条（见 [`拆前置块`]）：
 *
 * 1. `---` 在**第一行**（前面一个字符都没有，BOM 也没有——有 BOM 就不认，
 *    宁可放过也不误伤）；
 * 2. 后面找得到**闭栏**（`---` 或 `...` 独占一行）；
 * 3. 中间那几行**看起来像 YAML 映射**（`键: 值` / 注释 / 缩进续行）。
 *
 * 第 ③ 条是这套启发式的**边界**：一份开头恰好是分割线、中间恰好有一行
 * `时间: 昨天`、收尾又是分割线的散文，会被当成 front matter——表现为
 * **所见即所得里那几行不见了**（源码模式里照旧看得见、也改得动；存盘
 * 一个字节都不会丢）。反过来，判松了的代价是**每开一次盘就毁一段文档**，
 * 两害相权取其轻。
 *
 * ⚠️ 判据写在**一处**（本文件）。`ui/outline.ts` 里曾另有一条"首行 `---` 到
 * 收尾 `---`"的大纲启发式（BUG-32 修过一次），那条松得多——2026-10-04 **两条
 * 合并成这一条**（`docs/07` 第 63 项）：`headings.ts::extractOutline` 现在走
 * [`前置块行数`]，也就是**严的那份判据**。合并的理据：两处各判各的，同一份
 * 文件会出现"所见即所得里那几行看不见、大纲却把它们当正文数"的对不上；合完
 * 之后**大纲藏的与编辑器藏的是同一段**。大纲那一侧要兜的"残缺文件"
 * （`---` 没闭合）不用另写——严判据里"找不到闭栏＝不认"本身就兜住了它。
 */

/** [`拆前置块`] 的结果。 */
export interface SplitShareResult {
  /**
   * 开头那一段原文（**含首尾两行围栏**，末尾带回车/换行），没有就是 `null`。
   *
   * ⚠️ 连**围栏后面那些空行**一起算在里面（`---\n…\n---\n\n` 的那种空行）。
   * 理由：那几行空行属于"围栏下面那一段间隔"，不属于正文——编辑器拿到
   * 正文时如果开头带着空行，**它会顺手删掉**（正文经 mdast 一走一回头，
   * 开头的空行不表达任何节点），于是"打开再存"就又差一个字节。放在这一侧
   * 留住，进出的文本才是真正的逐字节相同。
   *
   * ⚠️ 是**原文切片**，不是拼出来的，所以能原样拼回去。
   */
  frontMatter: string | null;
  /** 剩下的部分（编辑器真正看得见的那部分）。**开头不是空行。** */
  body2: string;
}

/** 首行必须是**整行** `---`（允许行尾空白），后面必须跟一个换行。 */
const firstFenceLine = /^---[ \t]*(\r?\n)/;
/** 闭栏：`---` 或 `...` 独占一行。⚠️ `...` 是 YAML 的另一种收尾写法。 */
const closeBar = /^(?:---|\.\.\.)[ \t]*$/;
/** 一行 YAML 映射项：`键:` 或 `键: 值`。⚠️ 冒号后**必须**是空白或行尾。 */
const mapProjectItem = /^[^\s:][^:]*:(?:\s|$)/;

/**
 * 这几行**看起来像不像** YAML 映射。空行不算内容，但也不妨碍。
 *
 * ⚠️ 冒号后要求空白，是照着 YAML 自己的规矩来的：`键:值` 在 YAML 里**不是**
 * 映射（整行是一个普通标量字符串）。所以 `https://x` 这种行**不**算映射项——
 * 这也是我们想要的：它更像正文。
 */
function likeMapProject(rows: string[]): boolean {
  const hasContent = rows.filter((line3) => line3.trim() !== "");
  // ⚠️ 空的 `---\n---` 不看：那更可能是一对分割线（或者用户随手敲的），
  // 而"退化成什么都不保留"这件事一旦发生，用户看到的是"我的内容没了"。
  if (hasContent.length === 0) return false;
  return hasContent.every((line3) => {
    if (/^[ \t]/.test(line3)) return true; // 缩进：续行 / 嵌套 / 列表项
    if (line3.startsWith("#")) return true; // YAML 注释
    return mapProjectItem.test(line3);
  });
}

/**
 * 从 `位置` 起，把后面那些**整行空**的行也算进前置块，返回新位置。
 *
 * ⚠️ 只吃**空行**，吃到第一个有内容的行就停：正文一个字都不挪。
 */
function consumeRemoveEmptyLine(markdown: string, position2: number): number {
  while (position2 < markdown.length) {
    const replaceLinePlace = markdown.indexOf("\n", position2);
    const lineTail = replaceLinePlace === -1 ? markdown.length : replaceLinePlace + 1;
    if (!/^[ \t]*\r?\n?$/.test(markdown.slice(position2, lineTail))) return position2;
    if (replaceLinePlace === -1) return lineTail;
    position2 = lineTail;
  }
  return position2;
}

/**
 * 把开头那段 front matter 切下来。不认识就**原样还回去**（`前置块: null`，
 * `正文` 就是传进来的那串）。
 *
 * ⚠️ **不抛错、不改字**：任何"拿不准"的情形都走"不认识"这一支。
 */
export function splitFrontMatter(markdown: string): SplitShareResult {
  const notSplit: SplitShareResult = { frontMatter: null, body2: markdown };
  const first = firstFenceLine.exec(markdown);
  if (!first) return notSplit;

  const body3: string[] = [];
  let position2 = first[0].length;
  while (position2 <= markdown.length) {
    const replaceLinePlace = markdown.indexOf("\n", position2);
    // `行尾` = 含换行的下一行起点；最后一行没有换行时就是串尾。
    const lineTail = replaceLinePlace === -1 ? markdown.length : replaceLinePlace + 1;
    const line3 = markdown.slice(position2, lineTail).replace(/\r?\n$/, "");
    if (closeBar.test(line3)) {
      if (!likeMapProject(body3)) return notSplit;
      // ⚠️ 切到 `行尾`（**含闭栏那行的换行**）：拼回去就是一次直接相接，
      // 正文开头那个换行不会被算重、也不会被吃掉。
      const head2 = consumeRemoveEmptyLine(markdown, lineTail);
      return { frontMatter: markdown.slice(0, head2), body2: markdown.slice(head2) };
    }
    if (replaceLinePlace === -1) return notSplit; // 到最后一行都没有闭栏
    body3.push(line3);
    position2 = lineTail;
  }
  return notSplit;
}

/**
 * 把 [`拆前置块`] 切下来的那段拼回正文前面。
 *
 * ⚠️ 不做任何补齐（不加空行、不补换行）：`前置块` 是从原文切下来的，
 * 与 `正文` 本来就是相邻的两截。要"看起来整齐"而在这里加一个换行，就等于
 * **每存一次盘往文件里多一个空行**——那正是这个模块要根治的病。
 */
export function joinFrontMatter(frontMatter: string | null, body2: string): string {
  return frontMatter === null ? body2 : frontMatter + body2;
}

/* ── 改写那一段（`docs/07` 第 64 项，2026-10-04）────────────────────────
 *
 * 上面三条是"**别把它弄丢**"（进出整篇时原样留住），下面这几条是"**让它能改**"。
 *
 * ⚠️ 改的**只是里面那几行 YAML**，首尾围栏与后面吃进的空行原样留着——用户点进
 * 去改的是 `theme: seriph` 那一行，不该顺手把 `...` 收尾改成 `---`、把 CRLF
 * 换成 LF。这与本模块"别动用户没打过的字符"是同一条。
 *
 * ⚠️ **仍然不引 `remark-frontmatter`**：那套东西（schema / parser / serializer /
 * NodeView）是为了让 front matter 成为**文档树里的一个节点**，而这里要的只是
 * "把开头那一段换成另一段文本"，在边界上做最省事、也最不容易毁东西。
 */

/**
 * 开头那一对围栏**在哪**：`内文起点` 是首行围栏之后、`闭栏行首` 是收尾那一行
 * 的行首。认不出来给 `null`（判据与 [`拆前置块`] 同一份）。
 */
function encloseBarPosition(frontMatter: string): { bodyStart: number; closingFenceLineStart: number } | null {
  const first = firstFenceLine.exec(frontMatter);
  if (!first) return null;
  let position2 = first[0].length;
  while (position2 <= frontMatter.length) {
    const replaceLinePlace = frontMatter.indexOf("\n", position2);
    const lineTail = replaceLinePlace === -1 ? frontMatter.length : replaceLinePlace + 1;
    const line3 = frontMatter.slice(position2, lineTail).replace(/\r?\n$/, "");
    if (closeBar.test(line3)) return { bodyStart: first[0].length, closingFenceLineStart: position2 };
    if (replaceLinePlace === -1) break;
    position2 = lineTail;
  }
  return null;
}

/**
 * 取 front matter **里面**那几行 YAML（不含首尾围栏，也不含围栏后面吃进的空行）。
 *
 * ⚠️ 末尾**最多**去掉一个换行：`---\na\n\n---` 这一份给出来是 `a\n`（那一行空行
 * 是内文的一部分，不是围栏的）。去掉的这一个换来的是"多一行空行不算内文"，
 * 与 [`改前置块内文`] 补回来的那一个正好对上。
 */
export function splitFrontMatterBody(frontMatter: string): string {
  const position3 = encloseBarPosition(frontMatter);
  if (!position3) return "";
  return frontMatter.slice(position3.bodyStart, position3.closingFenceLineStart).replace(/\r?\n$/, "");
}

/**
 * 换掉 front matter 里的 YAML 内文，**围栏与后面那几行空行原样留着**。
 *
 * ⚠️ 换行按**原来那一段**的习惯写回（CRLF 的文件里改一行 YAML，不该变成混行的文件）。
 * ⚠️ 原来那段认不出来时**从头建一段**（而不是返回原样）：认不出来意味着它压根不是
 * 我们管的那一段，把它当没写过是唯一说得通的做法。
 */
export function replaceFrontMatterBody(originalBlock: string, body: string): string {
  const position3 = encloseBarPosition(originalBlock);
  if (!position3) return createFrontMatter(body);
  const head2 = originalBlock.slice(0, position3.bodyStart); // 首行围栏 + 它的换行
  const tail = originalBlock.slice(position3.closingFenceLineStart); // 闭栏那一行 + 它后面吃进的空行
  const replaceLine = head2.includes("\r\n") ? "\r\n" : "\n";
  const rows = body.replace(/\r?\n$/, "").split(/\r?\n/);
  return head2 + rows.join(replaceLine) + replaceLine + tail;
}

/**
 * 从零**建**一段 front matter 时给的内文。
 *
 * ⚠️ 值里那个 `title:` **是空的**，这不是没写完：`document/title.rs` 取标题时
 * 对空值的处理是"当作没写"（`front_matter_title` 要求值非空），所以标签页上的
 * 名字照旧回退到第一个标题 / 文件名。**填上**一个值反而会把标题钉死——用户
 * 只是想"在这篇开头放一段 front matter"，不是想给这篇改个名字。
 *
 * ⚠️ 末尾那个空格是**留给光标的**（编辑框打开时插入点落在它后面），不是给
 * YAML 看的。去掉也解析得对，别为它加一条 trim。
 */
export const newFrontMatterTemplate = "title: ";

/**
 * 从零**建**一段 front matter（`docs/07` 第 64 项：菜单里「YAML Front Matter」
 * 那一条，以及"这份文档本来就没有"时那条编辑框）。
 *
 * ⚠️ 结尾带**一个空行**（`---\n…\n---\n\n`），这不是为了好看：不空那一行的话，
 * 收尾的 `---` 与正文的第一行紧挨着，而**别的** Markdown 实现（不是本仓编辑器）
 * 会把 `---` 下面那行读成 setext 标题（`标题\n---` 那是一整套写法）。空一行之后
 * 对照的每一种读法都是干净的。这也正是 [`拆前置块`] 会把空行吃进切片的原因。
 */
export function createFrontMatter(body: string): string {
  const rows = body.replace(/\r?\n$/, "").split(/\r?\n/);
  return `---\n${rows.join("\n")}\n---\n\n`;
}

/**
 * **改或建或删**：按"新的内文"算出这一段该变成什么（`null` = 这一段不要了）。
 *
 * ⚠️ 内文空白（空串、只有换行）＝ **删掉这一段**，不是"留一对空围栏"：一对空的
 * 围栏过不了 [`像映射`]（`---\n\n---` 会退化成"什么都不保留"，那比删掉更糟），
 * 拼进正文还会被当成分割线。**这个判断只有这一处**——两个调用方
 * （`create.ts` 与 `source.ts`）都走它，免得一边删一边留一对空围栏。
 */
export function replaceFrontMatter(originalBlock: string | null, body: string): string | null {
  if (body.trim() === "") return null;
  return originalBlock === null ? createFrontMatter(body) : replaceFrontMatterBody(originalBlock, body);
}

/**
 * 开头那段 front matter **占几行**（2026-10-04，`docs/07` 第 63 项）。
 * 不认时返回 0。
 *
 * 消费者是 `headings.ts::extractOutline`：大纲扫描从这一行数往后开始，
 * 判据与 [`拆前置块`]（也就是编辑器那条存盘边界）**完全同一份**——
 * 这正是两条判据合并的落点，为什么合见文件头那一段。
 *
 * ⚠️ 行数按**整篇文档**的行号算（切片里有几行就数几行），连闭栏后面
 * 吃进来的那几行空行也算：空行里没有标题，多跳几行没有任何代价，
 * 却能让大纲的行号与全文行号对得上。
 */
export function frontMatterLineCount(markdown: string): number {
  const head2 = splitFrontMatter(markdown).frontMatter;
  if (head2 === null) return 0;
  // 切片末尾**通常**带着闭栏那行的换行（[`拆前置块`] 的注释），按换行切会多出
  // 一个空尾巴；⚠️ 但文件正好**停在闭栏那一行**（末尾没有换行）时就没那个尾巴。
  // 所以这里先把**最多一个**尾换行去掉再数，两种情形才是同一个答案。
  // ⚠️ 这个差一（`len - 1` 的写法给 2、真值是 3）是 2026-10-04 写
  // `tests/front-matter.test.ts` 时量出来的：症状是"文件停在闭栏那一行"时大纲
  // 少跳一行（多扫一行 `---`）。那一行不是标题，所以没出过可见的错——
  // 但数错了就是数错了，这个函数的全部价值就在于它给出的行号是真的。
  // 吃进的空行（闭栏后面那几行）照旧算在里面，见上面的注解。
  return head2.replace(/\r?\n$/, "").split(/\r?\n/).length;
}
