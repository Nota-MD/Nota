/**
 * **装配一个编辑器实例**：`.config()` 那一段 ＋ 整条 `.use()` 插件链。
 *
 * 2026-10-07 从 `create.ts` 整块搬出来的（`docs/07` 第 89 项）——那边那天 1006 行。
 * 切这一刀的依据是**职责**：`create.ts` 管的是"实例建好之后怎么用"（句柄的 13 条
 * 命令、front matter 的读写、存盘拼回），而这里管的是**一次性地把
 * 一切装上去**：ctx 的初值、序列化器、输入规则、NodeView、各种可选插件。
 *
 * # 为什么是这个形状（一个参数对象，不是一个长参数表）
 *
 * 装配这件事天然要碰到十几样东西（三个开关 ＋ 六个设置 ＋ 四个回调）。写成
 * 位置参数的话，调用点上就会出现一连串没有名字的布尔——`create.ts` 那边正是
 * 为了躲开它才用解构的。所以这里收**一个对象**，每一样都有名字，调用点读起来
 * 是一张"这份实例按什么装"的清单。
 *
 * ⚠️ 下面这一样必须走**回调**、不能传值：
 *   · `取前置块`——`markdownUpdated` 拼回去的必须是**这一刻**那一段（换文档、
 *     源码模式切回来都会换掉它），传值就把建实例那一刻的那一份钉死了；
 *
 * # ⚠️ 顺序就是语义，别按"看着顺眼"挪 `.use()`
 *
 * 整条链上每一处"必须排在谁前面"都写着理由（`$inputRule` 先中者赢、schema
 * 登记与解析转换器的先后、`handlePaste` 按插件顺序问……）。搬的时候**一字未改**，
 * 注释跟着代码一起过来了；要动顺序，先把那一条注释读完。
 */

import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
  remarkStringifyOptionsCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { flashSparkCursor } from "./blink-caret";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { indent } from "@milkdown/kit/plugin/indent";
import { trailing } from "@milkdown/kit/plugin/trailing";
// 这三个**不在** `@milkdown/kit` 的转发表里，得从各自的包进。
// 前两个是 kit 的依赖（间接装上了），plugin-prism 不是——所以它在 package.json
// 里必须显式列出来，漏了就是一句 "Cannot find module"。
import { prism } from "@milkdown/plugin-prism";
// ⚠️ `mathInlineInputRule` / `mathBlockInputRule` 是**按引用拿掉**的那两条，
// 见下面 `.use(math.filter(...))`。
import { katexOptionsCtx, math } from "./math-schema";
// ⚠️ **命令白名单那一串**（`toggleStrongCommand` … `setAlignCommand`）2026-09-28
// 整段搬去了 `./command-table`；这里只剩这一条：它**不是命令**，是一条输入
// 规则，留着是为了把上游那条从 `commonmark` 里过滤掉
//（见下面 `.use(commonmark.filter(...))`）。
import { wrapInHeadingInputRule } from "@milkdown/kit/preset/commonmark";

// 拼回开头那段 front matter（`markdownUpdated` 报出去的是**整篇**）。
// ⚠️ 切分那一步在 `create.ts`（它手里才有"活的那一段"）。
import { joinFrontMatter } from "@/editor/front-matter";

import { previewMiddleQuestion, previewPlugin } from "./review-prose";
// 光标所在块的 Markdown 标记（`##`、`>`、`-`……）浅灰画在块左边。
// 这是"标记不消失、只淡化"的口径，理由写在它自己的文件头上。
import { $prose } from "@milkdown/kit/utils";

import { combineWriteCheckCheckPlugin } from "./spell-check";
// 覆写模式（`Insert` 键，2026-10-16）。⚠️ 它**有状态**（开关住在插件 state 里，
// 理由在那边文件头），所以与 `spell-check` 那种"只加 decoration"的不是一类。
import { coverWritePlugin } from "./overtype";
import { instantRender } from "./instant-render";
// 光标落在**加粗**／*斜体* 里时，把那两个 `**` / `*` 半透明画在那段文字两边。
// 块级标记归上面那个（画在装订线里），行内没有装订线，所以是另一份插件；
// 两边的分工与"为什么占宽度"写在它自己的文件头上。
import { markHint } from "./mark-hint";
// 任务项的复选框：画出来 + 点它勾上。DOM 钩子（`data-checked`）是
// `preset-gfm` 早就给了的，缺的是 CSS 和点击，理由写在它自己的文件头上。
import { taskList } from "./task-list";
// 表格的**打字**建表：敲出「表头行 ＋ 分隔行」就当场成表（上游只认 `|3x2|`
// 那种速记，标准 Markdown 表格语法一个都不认）。判据、对齐值的坑、
// 两条触发路都写在它自己的文件头上。
import { tableInputRule, tableInput } from "./table-input";
import { blockContainerKeypress } from "./block-keys";
// 标题**回车才成块**（照 Typora）：`# 你好` 在按回车之前一直是段落，
// 只按粗体提示；回车才去掉前缀、换成标题。理由见它自己的文件头。
import { markTitleReturnCarBecomeBlock, markTitleLineFirstBackCell } from "./heading-on-enter";
import { paragraphWithoutBlankLine, documentMustNotExportEmptyRoot } from "./empty-paragraph";
// 代码块的右下角那一条：语言选择器 / 复制 / 折叠。用 NodeView 的地方之一
// （另一处是下面的图表块），理由写在它自己的文件头上。
import { codeBlockView } from "./code-block";
import { encloseBarLanguageFillAll } from "./fence-lang";
// 图表块（```mermaid）的**节点**（schema/remark 转换/输入规则）2026-10-04 起
// 是本仓自己的（`diagram-node.ts`，第 27 项）：`@milkdown/plugin-diagram` 整个
// 退役——它只做了这几件不含 mermaid 的小活，却把 mermaid 静态打进首屏。
import { mermaidCodeBlockConvertReplace, imageTableParse, imageTableSpecPlugin, imageTableInputRuleRule } from "./diagram-node";
// ⚠️ 视图（真图、改源码）在下面这一行；mermaid 从那里**动态**加载。
import { diagramView } from "./diagram-view";
// 公式（`$x$` / `$$ … $$`）：上游那两个节点是 `atom`，却一个 NodeView 都没有
// ——点一下只是整块选中，写进去的字还会被 `toMarkdown` 丢掉（源码在两处、
// 读的是 `attrs.value`）。这个文件把它们换成能就地改的视图，编辑时用半透明的
// `$` / `$$` 标出输入位置。契约与取舍写在它自己的文件头上。
import { mathView } from "./math-view";
// 图片语法里的地址指向视频（`![](a.mp4)`）时画成播放器。⚠️ 上游那个
// `imageSchema` 一个 NodeView 都没有，画什么全在 `toDOM` 里写死成 `<img>`
// ——于是视频文件得到一颗破图标。判据（只看后缀）、为什么只改屏幕不改源码、
// 以及两件没验的事都写在它自己的文件头上。
import { visionFrequencyView } from "./video-view";
// 公式的**打字**规则，三条：`$x$`、`$$x$$` 当场变行内公式；`$$` ＋**回车**建一块
// 空块公式。上游那两条（行内、块）都被这里换掉了，理由与实测对照表在它自己的
// 文件头上。
import { commonStyleBlockReturnCar, commonStyleInput } from "./math-input";
// 行内公式**用了几个 `$`**：用户敲两个就存两个（2026-09-27 用户拍板「保留」）。
// ⚠️ 三件事在这个文件里：`math_inline` 的规格**加了一个 `dollars` 属性**（用官方的
// `extendSchema`，不复制上游规格）、一个 `$remark` 插件把源码里那个数标进 mdast、
// 一条按数选上游处理器的序列化 handler。少接一处就是**静默失效**（存盘悄悄变回
// `$x$`），全貌与边界在它自己的文件头。
//
// ⚠️ 挂在下面那条链**紧挨着的三条，顺序不能动**：`math`（登记上游规格）
// → `行内公式规格`（`extendSchema` 同 id 就地替换）→ `标美元数`。
import { markDollarDollarNumber, inlineMathHandler, inlineMathSpec } from "./math-delim";
// ⚠️ `$` 当钱写的口径（第 54 项）：那条规则**包在分词器上**，不是 mdast 后处理，
// 理由（要 micromark 自己重扫）见那个文件头。**必须排在 `math` 后面**。
import { receiveStrictDollarDollar } from "./math-currency";
// ⚠️ 序列化时那一串**套着**的文本处理器（行首井号 / 原子后的空格 / 行首等号 /
// 孤立波浪号 / 行首竖线）**2026-09-27 搬去了 `text-handlers.ts`**——五层的理由、
// 顺序的讲究、"为什么不能挂 `$remark`"都在那个文件头，这里只留一行调用
// （搬家的直接原因：加第五层之后 `create.ts` 1011 行，顶破 `docs/09` §4 那条硬线）。
import { textHandlerChain } from "./text-handlers";
// 三种**非 CommonMark** 的行内标记：高亮 `==x==`、上标 `^x^`、下标 `~x~`
//（外加没有开关的下划线 `<u>x</u>`）。四层链路（remark-parse → mdast →
// PM 文档树 → remark-stringify）缺一层就是**静默失败**，全貌与四条已知边界
// 在那个文件的文件头。
//
// ⚠️ **挂载位置有讲究，三处都不能随手挪**：
//   · `行内标记规格`（四条 `$markSchema`）与 `行内标记输入规则` 排在 `gfm`
//     **前面**——`$inputRule` 的优先级就是 `.use()` 的顺序，先中者赢，而
//     `gfm` 那条删除线规则会把中文的 `张~2~` 抢走（它的 `\w` 不含中文，
//     详见 `inline-marks.ts` 文件头）；
//   · `行内标记解析`（`$remark` 转换器）排在 `gfm` **后面**——它要改的是
//     解析完的 mdast，早于 `gfm` 就等于对着还没铺开的树干活；
//   · **`gfm` 自己的选项**要在 `.config()` 里改（`关掉单波浪号删除线` 那一行）。
import {
  closeSingleWaveWaveNumberRemoveRemoveLine,
  inlineMarkParse,
  inlineMarkHandler,
  inlineMarkSpecPlugin,
  inlineMarkCommand,
  inlineMarkInputRuleRule,
  type InlineExtensionFlags,
} from "./inline-marks";
// **块级**裸 HTML 与 HTML 注释。⚠️ 行内的那些（`甲<u>乙</u>丙`）**不走这里**——
// preset 自带的 `htmlSchema` 管着它们；这一条补的是"独占一行的 HTML / 注释
// 在 mdast 里是 root 的直属孩子，而 doc 只收 block+，于是整篇文档打不开"那个洞
// （全貌在那个文件的文件头）。挂载位置与 `行内标记解析` 同一条：**排在 `gfm`
// 后面**（它改的也是解析完的树）。
import { blockHTMLParse, blockHTMLSpecPlugin } from "./html-block";
import { blockHTMLDiagnostics, blockHTMLView } from "./html-block-view";
import { gitHubNoticePlugin } from "./github-alert";
// **智能标点**（`--` → `–`、`"` → `“ ”` 那一组，`settings/markdown.rs` 里
// 六个字段的消费者）。⚠️ 两条都要，而且**只有 `Input` 档挂输入规则、
// 只有 `Render` 档挂装饰**——两个函数内部各自判模式并返回空数组，
// 这里不必写分支（理由与"为什么返回空数组而不是挂上去返回 null"在那个文件的
// `标点输入` 上）。排在这里＝排在 `commonmark` / `gfm` **之后**：
// 上游的分割线规则（`/^(?:---|___\s|\*\*\*\s)$/`）要求整块只有三个减号，
// 让先中者赢的那一侧是上游，本文件这边另有一道守卫兜着（`是横线骨架行`，它还保着**表格输入**，见 BUG-51）。
import { referenceNumberConfigureCorrect, punctuationInput, punctuationDecoration, type punctuationSettings } from "./smart-punctuation";
// **自动更正**（英文错拼那一张固定表）。⚠️ 只有一条输入规则，**排在整串
// `.use()` 的最后**——理由见那个文件的 `自动更正输入`。
import { selfActionMoreCorrectInput } from "./auto-correct";
// **裸 URL**（打到词尾那一下把 `https://…` / `www.…` 变成链接）。
// ⚠️ "粘贴一条网址"那半截也在那个文件里（`贴上网址事务`）——**判据只有一份**。
import { selfActionLinkInput } from "./url-link";
// **粘贴那一路**（洗 HTML / 认语言的代码块）。⚠️ 必须排在 `clipboard` 前面。
import { pastePastePlaceManage } from "./paste";
// **自动配对 ＋ Tab 跳出右半边**（`(` ⇒ `()`，`Tab` 跨过右边那颗闭括号）。
// ⚠️ 它也要抢 `Tab`，必须排在 `indent` 前面。
import { configureCorrectPlaceManage } from "./auto-pair";
// **选区标记包裹**：选中一段再按 `*` / `_` / `~` / `^` / 反引号时不覆盖选区，
// 而是在两侧放一对标记并继续选中原文。必须排在 `配对处理` 前面，先把“有选区”
// 这条路接住；空选区仍交给自动配对。
import { selectionMarkFillAll } from "./selection-marks";
// **表格里的 `Tab` / `Shift+Tab`**（走到下一格 / 上一格；最后一格再按 `Tab`
// 就加一行）。⚠️ 它抢的也是 `Tab`，所以**必须排在 `indent` 前面、`配对处理`
// 后面**——理由与那张表在 `./table-tab` 的文件头。
import { tableTab } from "./table-tab";
// **表格里的普通回车**：走到下一格；最后一格加一行。上游把裸 `Enter` 也绑成
// “退出表格”，这一条用更高优先级改回填表手感；`Mod+Enter` 仍可退出。
import { tableEnterKey } from "./table-enter";
// **`Alt+↑` / `Alt+↓`：上移 / 下移光标所在的块**（2026-10-07 接上；菜单里那两条
// `edit.moveLineUp` / `edit.moveLineDown` 走 `command-table.ts`，这里挂的是键位）。
// ⚠️ 它抢的键 `baseKeymap` 也绑着（`joinUp` / `joinDown`），所以**必须自己接**
// ——整条经过在那个文件的文件头与 `.use()` 那一段。⚠️ 只读实例不挂。
import { moveKeymap } from "./move-block";
// **Emoji**（`:smile:` → 😄 的短代码替换 ＋ 打 `:smi` 弹候选的补全面板）。
// ⚠️ 两条都是"只动正在敲的那几个字符"：替换只在敲下词尾空白那一下发生，
// 面板**只画不改**（`Plugin.view` ＋ 挂在 body 上的 fixed 浮层，文档树一个
// 字都不动）。⚠️ 补全面板**只读实例不挂**（见下面 `.use()` 那一段）。
import { emojiInputRuleRule, emojiFillAll } from "./emoji";
// **斜杠菜单**（行首敲 `/` 弹一张"插入什么"的列表）。⚠️ 与 Emoji 补全面板
// 同一条手法（自绘浮层、只画不改），理由与"为什么不装 `@milkdown/plugin-slash`"
// 写在那个文件的文件头。⚠️ 它**只读实例不挂**。
import { slantBarMenu } from "./slash";
// ⚠️ **不许删**：没有它，**不带 title 的图片会在装载时被整节点丢掉**
// （打开含图文档 → 存盘 → 图片从文件里消失）。上游 schema 的毛病、
// 症状与实测记录都在它自己的文件头上。
import { fillAllImageSliceAttribute } from "./image-attrs";
import { katexOptionsFor } from "./math-macros";
// 「光标现在在什么状态」。格式化工具栏的高亮与菜单那十条表格命令的灰/亮
// 都问它——**只读不写**，见它自己的文件头。
import { selectionSnapshotPlugin } from "./caret-snapshot";
import { cursorStatePlugin } from "./command-state";
import { writingModePlugin } from "./writing-modes";
// 查找与替换。**匹配逻辑在那边**，这里只把它的插件挂上。
import { findPlugin } from "./find";
import type { CommandPayload, CreateOptions, EditorCommand } from "./create-types";

/**
 * 装配一份实例要的那些东西。
 *
 * ⚠️ 这里**不收** `CreateOptions` 整份：`root` / `physics` / 那几个开关在
 * `create.ts` 那边已经被解构、归一化过了（默认值、`undefined` 的语义都在那里
 * 定），这里收的是**定完之后**的结果——两处各算一次默认值，迟早会漂。
 */
export interface InstallConfigureParameter {
  /** 正文区根节点（`rootCtx`）。 */
  root: HTMLElement;
  /** 初始**正文**：front matter 已经切掉了（切分在 `create.ts`）。 */
  body2: string;
  /** 开不开 KaTeX 那套物理宏。 */
  physics: boolean;
  /** 只读（分屏右侧预览、导出用的离屏实例）：不报变化、不挂编辑类插件。 */
  readOnly: boolean;
  /** 当前文档完整路径；图片相对地址以它所在目录解析，只用于显示。 */
  documentPath: string | null;
  /** 严格模式（`atx.ts` 那套判据的开关）。 */
  strict: boolean;
  inlineExtensions: InlineExtensionFlags;
  punctuation: punctuationSettings;
  selfActionMoreCorrect: boolean;
  emoji: boolean;
  smartAbleSymbolNumber: boolean;
  /** 文档变了（**整篇**、已拼回 front matter）。⚠️ 只读实例从来不报。 */
  onChange?: (markdown: string) => void;
  /** **这一刻**那一段 front matter，`null` = 没有。⚠️ 见文件头"为什么是回调"。 */
  getFrontMatter: () => string | null;
  /** 斜杠菜单选中一条要走的那条路（`create.ts` 的 `跑一条命令`）。 */
  runOneItemCommand: (name: EditorCommand, payload?: CommandPayload) => void;
  /** `CreateOptions` 里那几条"不传就不挂"的可选回调——原样转给对应插件。 */
  options: Pick<
    CreateOptions,
    "onCommandState" | "onFindStatus" | "onSelection" | "writingModes" | "review" | "onReviewEscape"
  >;
}

/** 把一份实例装起来。⚠️ 顺序就是语义，见文件头。 */
export async function installConfigureActualExample(parameter: InstallConfigureParameter): Promise<Editor> {
  const {
    root,
    body2,
    physics,
    readOnly,
    documentPath,
    strict,
    inlineExtensions,
    punctuation,
    selfActionMoreCorrect,
    emoji,
    smartAbleSymbolNumber,
    onChange,
    options,
  } = parameter;

  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, body2);

      // 序列化时**不要把行首的井号转义掉**（`#标签` 存成 `\#标签` 也是
      // "自动修复"，只不过换副面孔，用户没打那个反斜杠）。理由、边界与残留
      // 见 `lax-heading.ts` 第二段那个长注释。
      //
      // ⚠️ **两种模式都改**，不是只管宽松：那条转义只在"井号后面有空白"时
      // 才是有用的，而那种写法本仓一个字都不碰（正则收得很紧）。两种模式都
      // 不改，用户看到的规律才简单——"**Nota 不会往井号上加反斜杠**"。
      //
      // 解析那一侧**不许把 `~x~` 当删除线**（`H~2~O` 是下标）。⚠️ 光在输入规则
      // 那侧排顺序只够管"打字"，**打开/存盘**走 micromark 分词（BUG-48）。
      closeSingleWaveWaveNumberRemoveRemoveLine(ctx);

      // ⚠️ 得在 `.config()` 里改：这一份在 Init 阶段被拿去建 remark 处理器，
      // 建完了再改就没用了。
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({
        ...prev,
        // 列表记号与分隔线用哪个字符**照用户写的那个存回去**。
        //
        // ⚠️ 这是**用户定的死规矩**（「如果关闭，存盘不要自动修复」，宽松档是默认）
        // 的一个落点，2026-09-24 补的。remark 的默认是 `*`，于是
        // `- 甲` 存盘变成 `* 甲`、`---` 变成 `***`——**一个字都没改的文档，
        // 打开再存一次，diff 里全是这种行**。用户看不到任何变化，却要为一堆
        // 自己没写过的字符背书。
        //
        // ⚠️ 这两个值是 remark-stringify 的**唯一写法**（`-` 就是 `-`），
        // 不是随便挑的。要支持混用（有人爱写 `* 甲`）得自己写序列化器，
        // 那是另一件事——现在这条只能保证"**本仓不会主动换掉它**"。
        //
        // ⚠️ `as const` 是**给类型的**，值没有变：`bullet` 在类型里是个联合
        // （`"-" | "*" | "+" | null | undefined`），而对象字面量里的 `"-"`
        // 会被**拓宽**成 `string`——不加这两个字，`tsc` 报两行
        // 「Type 'string' is not assignable to ...」。这一点在 2026-09-24 的
        // 一次 `tsc --noEmit` 里露出来了：**当时以为类型是过的，实际没过**。
        bullet: "-" as const,
        rule: "-" as const,
        handlers: {
          ...prev.handlers,
          // 四条**行内标记**的序列化处理器（`notaHighlight` / `notaSuperscript` /
          // `notaSubscript` / `notaUnderline`）。**恒挂**，不跟开关走——三种组合
          // 里只有"解析开着而序列化器不在"会吞掉标记，完整的推理在
          // `inline-marks.ts` 的 `行内扩展开关` 那一格。
          ...inlineMarkHandler(),
          // ⚠️ 五条**套着**的文本处理器（行首竖线 / 孤立波浪号 / 行首等号 /
          // 原子后的空格 / 行首井号）——谁在外层、为什么、以及"**只能挂
          // `handlers.text`、挂 `$remark` 是静默空操作**"那一段，全在
          // `text-handlers.ts` 的文件头（2026-09-27 从这儿拆出去的：加第五层时
          // 这个文件顶破了 1000 行）。
          text: textHandlerChain(prev.handlers?.text),
          // 行内公式：**用户敲了几个 `$` 就写回几个**。
          //
          // ⚠️ 这一条**没有**"包一层"的写法（不像上面那条 `text`）——上游那条
          // `inlineMath` 不在 `prev.handlers` 里，它是 remark-math 从
          // `data.toMarkdownExtensions` 送进来的。覆盖得掉它靠的是
          // `mdast-util-to-markdown` 的 `configure()` 顺序：**先**展开
          // `extensions`、**后**铺顶层 `handlers`（`lib/configure.js:20-27`），
          // 我们这份是后写的，所以赢。理由与实测在 `math-delim.ts` 文件头。
          inlineMath: inlineMathHandler(),
        },
      }));

      // 数学公式：把宏表交给 KaTeX。**两档都设置**（不开 physics 时也设一份
      // 空的），这样"开关关掉"是一条明确的动作，而不是"没人设过 Ctx"——
      // 后者在调试时看不出区别，而它们的后果完全不同。
      // ⚠️ 传的是 `katexOptionsCtx.key` 而不是 `katexOptionsCtx` 本身：
      // 前者是那片 slice，后者是个插件对象（`$Ctx` = 插件 + `key`）。传错编译不过，
      // 这条正好被类型挡住了。
      ctx.set(katexOptionsCtx.key, katexOptionsFor(physics));

      // 正文区挂一个 `#write`。
      //
      // ⚠️ **它已经不是限域机制了**（2026-09-23 改的口径）。限域由
      // `styles/doc-theme.ts` 在注入前**机械地**把每条选择器收到 `.editor-pane`
      // 之下完成——不靠正文区里有什么 id。上一版确实靠这个 id：那时候的写法是
      // 把裸元素规则收进 `#write`。那套"兼容外部主题"的链条已经被用户否掉并
      // 删掉了（版权，见 `docs/07` §4）。
      //
      // 那还留着它做什么：**给用户自己写的主题留一个钩子**。外部编辑器的主题里
      // 大量使用 `#write h1` 这种写法，抄过来的人会带着它。留着这个 id，
      // 那些选择器被限域成 `.editor-pane #write h1` 之后仍然**命中**；
      // 删掉的话它们会静默失效——用户只会看到"主题一半没生效"。
      // ⚠️ 所以这不是死代码。
      //
      // ⚠️ 走 `editorViewOptionsCtx` 而不是建完之后去改 DOM：ProseMirror 重建 view
      // 时只会重放这里的属性，手动改的那一下会丢。
      // ⚠️ `attributes` 的类型允许是函数，这里只可能是对象形式，所以先归一化再展开。
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        // 只读：分屏里的预览窗格。⚠️ 用 ProseMirror 的 `editable`（它管的是
        // **能不能编辑**），不是 `editable` 之外的什么"禁用"。禁用会让内容变灰、
        // 还会吞掉选择与复制——而预览窗格需要能选中、复制。
        //
        // ⚠️ **改动预览也走这一条**（2026-09-26）：预览期正文要变成"能滚能选、
        // 但改不动"，那正是 `editable: false` 的语义。文档级的锁另有一道
        // （`review-prose.ts` 的 `filterTransaction`）——那一道德住的是命令与
        // 别的插件派的事务，这一道只管键盘与鼠标。两道都要。
        editable: (state) => !readOnly && !previewMiddleQuestion(state),
        attributes: {
          ...(typeof prev.attributes === "function" ? {} : prev.attributes),
          id: "write",
        },
      }));

      // 文档变化 → 通知调用方。
      // ⚠️ 这里**不做去抖**：去抖是调用方的事，因为"多快算太快"取决于
      // 它拿这个回调干什么（存草稿 vs 推给后端 vs 更新字数，三种节奏不一样）。
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prev) => {
        // ⚠️ 只读实例**一律不报变化**。预览窗格的文本是**别人推给它的**，
        // 报回来只会让调用方以为"用户改了文档"，进而把预览的规范化结果
        // 当成正文回写——那正是 `source.ts` 文件头里说的那个往返改字。
        if (readOnly) return;
        // ⚠️ 报出去的是**整篇**（把 front matter 拼回去）：调用方拿它当
        // "这份文档现在的文本"——去抖后推给后端、字数、切模式时当初始值。
        // 报半截的话，拼回这一步就只有 `getMarkdown` 那一处有，两条路
        // 迟早分叉（正文里少了开头那几行，而且是在同步到后端那条路上丢的）。
        if (markdown !== prev) onChange?.(joinFrontMatter(parameter.getFrontMatter(), markdown));
      });
    })
    // ⚠️ **摘掉一条输入规则**：上游那条「打 `#` 加空格，整段当场变标题」的规则
    // （`wrapInHeadingInputRule`，正则 `/^(#+)\s$/`）被滤掉了——用户 2026-09-26
    // 要的是 Typora 那一套「**回车才成块**」（原话：「输入 `# 你好` 之后，只是加粗，
    // 按下回车才成为标题」）。理由、代价与那一小块补上的逻辑都在
    // `heading-on-enter.ts` 文件头。
    //
    // ⚠️ `commonmark` / `gfm` 是**纯数组**（`preset-commonmark/lib/index.js:2133`
    // 那个 `[…].flat()`），所以按引用滤得掉；别处那几条输入规则（列表 `- `、
    // 引用 `> `、分割线 `---`）**照旧敲完就变**，只摘标题这一条。
    .use(encloseBarLanguageFillAll)
    .use(commonmark.filter((p) => p !== wrapInHeadingInputRule))
    // ⚠️ **这三条必须排在 `gfm` 前面**，理由见文件顶 `inline-marks` 那段 import
    // 注释（`$inputRule` 先中者赢，而 `gfm` 的删除线会抢中文的 `张~2~`）。
    // 规格要早于输入规则：输入规则命中的那一刻，`schema.marks` 里就得有那四种
    // mark 了，否则建出来的 mark 是 `undefined`。
    .use(inlineMarkSpecPlugin)
    // ⚠️⚠️ **这四条 toggle 命令必须挂**（2026-09-27 补，BUG-47）：`$command`
    // 返回的是**一条插件**，`plugin.key` 是在**它的函数体里**才赋上的
    //（`@milkdown/utils/lib/index.js` 的 `$command`：`(ctx) => async () => {
    // plugin.key = cmdKey; … ctx.get(commandsCtx).create(cmdKey, command) }`）。
    // 不挂 ⇒ 两件坏事同时发生：`行内标记命令[0]!.key` 是 `undefined`，
    // 而管理器里也压根没有这条命令 ⇒ 菜单点「高亮」当场 `TypeError`
    //（`callCommand(undefined)` → `manager.call` → `undefined.id`）。
    // ⚠️ 症状与 BUG-46 不同：那一条是**编辑器起不来**，这一条是**编辑器好好的、
    // 只有这四个动作点了没反应**——所以它躲过了那次修。四个动作是
    // 高亮 / 上标 / 下标 / 下划线，菜单、格式化工具栏、快捷键三条路都走这张表。
    // ⚠️ **不跟 `行内扩展` 开关走**（与 `command-table.ts` 表上那段注释同源）：
    // 关掉的是"解析与输入"，不是这四条能力。
    .use(inlineMarkCommand)
    // 输入规则（`==x==` 敲完当场变高亮那类）。**只读实例也挂**——只读时
    // 压根没有输入，挂上去是零成本的死代码；分一个跟 `markHint` 那样的
    // 分支反而多一处"哪个模式装了哪个没装"要说清楚的东西。
    .use(inlineMarkInputRuleRule(inlineExtensions))
    .use(gfm)
    .use(gitHubNoticePlugin)
    // 智能标点的输入规则（`--` → `–` 那一族）与显示装饰（`Render` 档）。
    // ⚠️ **两个函数各自判模式**：`off` / `render` 时输入规则返回空数组，
    // `off` / `input` 时装饰返回空数组——这里不写分支，读的人只需要看那两处。
    .use(referenceNumberConfigureCorrect(punctuation))
    .use(punctuationInput(punctuation))
    .use(punctuationDecoration(punctuation))
    // 自动更正的输入规则（`teh` → `the` 那一族）。⚠️ 它与上游任何输入规则
    // 都不抢同一段文本（那些要的分隔符是 `#` / `>` / `-` / 数字，不是字母），
    // 所以位置其实无关紧要；放在这里只是让"标点那一家"挨在一起。
    .use(selfActionMoreCorrectInput(selfActionMoreCorrect))
    // 裸 URL（用户原话：「**裸 URL 自动识别成链接**」）。判据见 `url-link.ts`。
    .use(selfActionLinkInput())
    // Emoji：短代码替换（`:smile:` → 😄）与输入补全面板（打 `:smi` 弹候选）。
    // ⚠️ **两件事都由 `emoji` 一个开关管**（理由见 `create-types.ts` 那一格）。
    // ⚠️ 排在**最后**：短代码要以英文冒号起头、以冒号＋空白收尾，与上游那些
    // "占满整块"的规则不重合；放最后只是为了让"输入辅助"这一族挨在一起。
    .use(emojiInputRuleRule(emoji))
    // ⚠️ 补全面板**只读实例不挂**（与上面那条输入规则不同）：输入规则在
    // 只读时是零成本的死代码（压根没有输入），而补全面板只要光标停在一个
    // `:smi` 后面就会弹——只读预览（分屏右窗格）里点一下也会，那是纯噪声。
    // 导出那条路（`editor/export.ts` 的离屏实例）同理，且它更该干净。
    .use(emojiFillAll(emoji && !readOnly))
    // ⚠️ **排在 `gfm` 后面**：它改的是解析完的 mdast，早于 `gfm` 就等于对着
    // 还没铺开的树干活。默认 `remark-parse` 与 `gfm` 都不认识那四种写法，
    // 到了这一步它们还只是普通文本节点。
    .use(inlineMarkParse(inlineExtensions))
    // 块级裸 HTML / HTML 注释那一颗节点（规格 ＋ 解析转换器）。⚠️ 两条都要，
    // 而且**顺序不能反**：转换器先把块级 `html` 改写成自造类型，schema 才有
    // 东西可接（见 `html-block.ts` 文件头）。
    .use(blockHTMLSpecPlugin)
    .use(blockHTMLParse())
    // 块级 HTML 的安全渲染与就地源码编辑。源码仍只住在 `attrs.value` 里，
    // NodeView 不参与保存，所以渲染结果不会反向污染 Markdown。
    .use(blockHTMLView(documentPath))
    .use(blockHTMLDiagnostics)
    // ⚠️ 在 `commonmark` 之后即可（它只是往 mdast 上多挂一个变换），
    // 但**必须在 `.create()` 之前**：mdast → ProseMirror 那一步发生在建实例时，
    // 建完了再挂就等于没挂。**只读的那一份也要挂**（分屏预览、导出），
    // 那两处同样会把 markdown 变成文档。
    .use(fillAllImageSliceAttribute)
    // ⚠️ 这里原来写着 `.use(原子后的空格)`（"原子后面那颗空格"）——**2026-09-26
    // 整个搬走了，而且是两次**：第一版是 ProseMirror 插件（拦在编辑器里，
    // 会让那颗空格在后续编辑里消失），第二版是 `$remark` 插件（看着像"在序列化
    // 那一步改"，实际**一次都不会被调用**，因为 unified 的 `stringify()` 不跑
    // 转换器）。现在它包在 `handlers.text` 上，见上面 `.config()` 里那一行。
    // ⚠️ **那两次失败都写进了 `atom-space.ts` 的文件头**——包括"怎么验出
    // 没被调用"的探针。别再往这里加第三次。
    // ⚠️ **拼写检查那条波浪线**（2026-10-11）：后端在 `src-tauri/src/spell/`，
    // 画是这一条插件干的（`spell-check.ts` 文件头有三条规矩）。⚠️ 它**只加
    // decoration**——不改 schema、不抢输入规则，所以放在链子这儿的哪一段都不影响
    // 语义；放这儿是图它离 `history` 近（另一个"只做事不定义文档形状"的插件）。
    .use($prose(() => combineWriteCheckCheckPlugin()))
    // ⚠️ 覆写那一层要排在 `history` **前面**（插件顺序 = 谁先拿到键与输入）：
    // 它只认 `Insert` 与"覆写开着时的打字"，抢不到别人的键；但排在后面的话
    // `insertText` 那条默认路已经先把字插进去了，覆写就成了"插一个、再删一个"
    //（撤销栈里多出一笔，用户按一下 Ctrl+Z 只退半个动作）。
    .use($prose(() => coverWritePlugin()))
    .use(history)
    .use(listener)
    .use(cursor)
    .use(readOnly ? [] : [$prose(() => flashSparkCursor())])
    // ⚠️⚠️ **必须排在下面这条 `clipboard` 前面，不能挪**：PM 按插件顺序问
    // `handlePaste`，第一个返回 `true` 的赢，而上游那条**总会**返回 `true`。
    .use(pastePastePlaceManage())
    // ⚠️ **智能符号补全那一条**（括号 / `[` / `*` 自配对 ＋ `Tab` 跳出右半边
    // ＋ 空对退格）。关掉开关时它返回 `[]`（同 `标点输入` 那一条的做法），
    // 也就是"这条插件不装"——`docs/05` §4.20c。
    .use(selectionMarkFillAll(smartAbleSymbolNumber, inlineExtensions))
    .use(configureCorrectPlaceManage(smartAbleSymbolNumber, inlineExtensions))
    .use(clipboard)
    // ⚠️ **必须排在下面那条 `indent` 前面**：`@milkdown/plugin-indent` 绑的
    // 就是 `Tab`，而且它不认表格（不分位置地往格子里塞两颗空格，那两颗会写进
    // 文件）。这一条只管"选区在表格某一行里"，其余一律放行——见 `./table-tab`。
    .use(tableTab())
    .use(readOnly ? [] : [tableEnterKey])
    // **`Alt+↑` / `Alt+↓`：上移 / 下移光标所在的块**（2026-10-07）。
    // ⚠️ **必须自己接这一颗**：`baseKeymap` 把这两颗绑给了 `joinUp` / `joinDown`
    // （合并相邻两段），它会先跑、还 preventDefault，全局那条 accel
    // （`ui/useMenus.ts` 的 `e.defaultPrevented` 闸）于是整颗放行——不接的话
    // 用户按下去看到的是"两段被并成一段"。整条经过写在
    // `move-block.ts::建移动键位` 的文件头。
    // ⚠️ **只给可编辑实例**（与 `markHint` 同一条）：只读那两份（分屏预览、
    // 导出用的离屏实例）没有"用户在按键盘"这回事，而且 PM 只读时本来也不发
    // 这些键——挂上去只是让阅读的人多问一句"预览里也会搬吗"。
    .use(readOnly ? [] : [moveKeymap])
    .use(indent)
    .use(trailing)
    .use(instantRender)
    .use(taskList)
    .use(tableInputRule)
    .use(tableInput)
    // 引用开头空格退出、空表格开头退格删表。两条都在 `handleKeyDown` 里，
    // 因此比输入规则和 `baseKeymap` 先拿到这一下。
    .use(readOnly ? [] : [blockContainerKeypress])
    // ⚠️ **它是个工厂，要收 `strict`**（2026-09-29 起）：那份"标题写法"的
    // 加粗提示在宽松档下要认 `#你好`、严格档下不认——判据一处
    // （`atx.ts::atxPrefix`），四个消费者一起守。详见 `heading-on-enter.ts` 文件头。
    .use(markTitleReturnCarBecomeBlock(strict))
    // ⚠️ **行首退格散标题**（2026-09-26 第二轮）：标题前按退格一次变回段落，
    // 不逐级降级。它是 `$shortcut`（走 keymap 的 `priority` 排序），
    // **不是**上面那条 `$prose`——为什么非得这样、为什么放在这个位置都
    // 无所谓，见 `heading-on-enter.ts` 文件头那一节。
    .use(markTitleLineFirstBackCell)
    // ⚠️ **空段落不写 `<br />`**（2026-09-26 第二轮，用户：「enter 默认是真 enter
    // 而非 `<br>`」）。它必须在 `commonmark` **之后**——schema 按名字拼、
    // 同名后来者盖先前的（理由与实测在 `empty-paragraph.ts` 文件头）。
    .use(paragraphWithoutBlankLine)
    // ⚠️ **必须紧跟着上面那条**：它俩是一对（"空段落不产出" ＋ "根节点不能空"），
    // **少一个空文档就打不开**——界面停在「正在准备编辑器…」，堆栈是上游
    // `mdast-util-to-markdown` 的 root handler 里 `node.children.some`。
    // 实测与理由在 `empty-paragraph.ts` 文件头。
    .use(documentMustNotExportEmptyRoot)
    .use(codeBlockView)
    .use(prism)
    // ⚠️ **摘掉两条输入规则**（行内那条 2026-09-26，块那条 2026-10-04，
    // 和上面标题那条同一个手法）：
    //   · `mathInlineInputRule`（正则 `/(?:\$)([^$]+)(?:\$)$/`）认不出 `$$…$$`
    //     ——用户敲到 `A$$bb$` 那一下就把尾巴上的 `$bb$` 变成公式了，等他补上
    //     最后一个 `$`，落进文档的已经不是公式。**"行内 `$$…$$` 打不出来"的
    //     根因就是它**。换成 `公式输入` 那两条。
    //   · `mathBlockInputRule`（正则 `/^\$\$\s$/`）**一个空格就凭空建出一块空的
    //     块公式**——用户想空一行/想打个空格，屏幕上多出一块空白。它自己的注释
    //     写的是「press **enter**」，实现跟注释不符（2026-10-04 用户拿 Typora
    //     截图点的就是这条）。换成 `公式块回车`——**回车**才建块。
    // 两处的边界与实测表都在 `math-input.ts` 文件头。
    // ⚠️ `math` 是**纯数组**（`plugin-math/lib/index.es.js` 尾部那个
    // `[…].flat()`），所以按引用滤得掉，**摘一条不影响别的**。
    .use(math)
    .use(commonStyleInput)
    // ⚠️ **块公式的回车**（2026-10-04）：`$$` 那一段按回车 → 一块空的
    // `math_block`，源码框当场打开。放在这里只是为了挨着上面那两条（同一个
    // 话题），**顺序上没有讲究**——上游那条挂在输入规则上，跟回车撞不上。
    .use(commonStyleBlockReturnCar)
    // ⚠️ **必须是紧挨着的三条，而且顺序不能动**：
    //   ① `math` 那份（上面）先把上游的 `math_inline` 规格登记进去；
    //   ② `行内公式规格` 用 `extendSchema` 出一份**同 id** 的，登记时由
    //      `upsertById` **就地替换**（位置不变——`utils.ts:11-20` 那段注释说得很
    //      清楚：换位置会让 ProseMirror 的 content-match 走岔、然后无限递归）；
    //   ③ `标美元数` 这个 remark 插件排在最后。
    // ⚠️ 顺序上只有一处讲究：② 那一步是 schema 登记（跟 ①③ 不是一回事），
    // 只要不排到 ① 前面。（2026-10-04 曾经在这两条中间夹过第四条 `收严公式`，
    // 并对 ③ 有"必须排在它前面"的要求；那条当天就被用户拍了撤回，一起撤掉的。）
    .use(inlineMathSpec)
    .use(markDollarDollarNumber)
    // ⚠️ **`$` 当钱写的时候不算公式**（`docs/07` 第 54 项，2026-10-04）：这一条
    // **必须排在 `math` 后面**——它要做的第一件事是**从处理机上把 `remark-math`
    // 挂的那条 tokenizer 取出来包一层**（`math-currency.ts` 的 `找上游美元`），
    // 排到前面去表里还没有那条，这个插件就白挂了（**静默失效**，一声不响）。
    // 判据、代价与"认不出的形状"全在那个文件头。
    .use(receiveStrictDollarDollar)
    // ⚠️ 这里原来挂着 `原子后的空格`（`handleTextInput`，把 WebKit 塞进原子后面
    // 的那颗 NBSP 挡在文档之外）——**2026-09-26 开窗实测之后整个搬走了**：
    // 挡在编辑器里会让那颗空格在"紧接着再敲一个字符"时**从文档里消失**
    // （丢内容，比文件里多个不可见字符严重）。现在它挂在 **remark** 那一串上，
    // 只在写 Markdown 那一刻换字符，**编辑器里随 WebKit 去**。
    // 经过、三次实测与代价见 `atom-space.ts` 文件头。
    // 图表块：节点与转换是 `diagram-node.ts` 那三件（第 27 项起本仓自造，
    // 原先 `@milkdown/plugin-diagram` 那一坨的活），视图在 `diagram-view.ts`。
    // ⚠️ `图表解析` 排在 `gfm` 之后（它改的是解析完的树）；`图表输入规则`
    // 只是 `` ```mermaid `` 那一条，与 gfm 的表格规则不抢。
    .use(imageTableSpecPlugin)
    .use(mermaidCodeBlockConvertReplace)
    .use(imageTableInputRuleRule)
    .use(imageTableParse())
    .use(diagramView)
    // 公式那两个节点（`$x$` / `$$ … $$`）：上游一个视图都没给，这里补上
    // 「点一下就地改」。不在编辑时行内直接渲染；编辑时正文就是源码（`$` 半透明）、
    // 公式落在下面那个悬浮预览里——两态的长相与理由见 `math-view.ts` 文件头。
    // ⚠️ `mathView` 是个**数组**（两条线：`$prose` 那条管"当前是哪一块"，
    // `$view` 那条管怎么画），`.use()` 收数组。
    .use(mathView)
    // 图片语法里的地址指向视频时画成播放器（用户那句「图片语法指向 `.mp4`
    // 当视频」）。⚠️ **只画屏幕，不动源码**：节点类型、解析、序列化一概没碰，
    // 所以"打开再存字节不变"那条不变量与这一条无关（理由在文件头）。
    // ⚠️ 它要排在 `imageSchema` 登记**之后**（也就是 `commonmark` 之后）——
    // 反正整条链都在 `commonmark` 后面，这个位置满足。
    // ⚠️ **三种实例都生效**（可编辑 / 分屏预览 / 导出用的离屏实例），
    // 因为这个文件是**唯一建实例的地方**；只读那两处一样需要它，否则
    // 分屏右边和导出文件里还是破图标。
    .use(visionFrequencyView(documentPath))
    // ⚠️ 宽松标题那条显示层装饰**2026-09-26 删掉过一次、2026-09-29 以另一个
    // 形状回来了**（原位置就是这一行）。经过：先被用户否掉（`#你好` 不许变
    // 位置变大小），后来他报「严格模式关闭后 `#标题` 还是无法正常显示」——
    // 真问题是**大纲 / 源码模式 / 标签页标题三处都认宽松标题、只有正文不认**。
    // 现在的形状是「**文字按标题排版、井号不动**」（用户 2026-09-29 选的长相）：
    // 井号后面那段文字按该级标题的字号/字重排，井号一个字不碰。落在
    // `heading-on-enter.ts` 那条装饰里（不在这一行，跟着 `标题回车成块` 走，
    // 所以它**吃 `strict`**——严格档下 `#你好` 不是标题，不许这么画）。
    // 盯着光标那一条。**只读**，见 `command-state.ts`。
    .use(options.onCommandState ? [cursorStatePlugin(options.onCommandState)] : [])
    // 查找。⚠️ **和上面那条一样是可选的**：分屏右侧那个只读预览窗格
    // 不挂（它没有光标、也不会被查找），不传就少一条插件。
    .use(options.onFindStatus ? [findPlugin(options.onFindStatus)] : [])
    // 选区变了就报一次（`docs/07` 第 14 项，2026-10-04 加）。⚠️ **同样可选**：
    // 只有可编辑那一侧要报——预览窗格没有"用户选中了什么"可言，导出用的
    // 离屏实例更是连用户都没有。理由与那一整套坐标怎么定，见
    // `caret-snapshot.ts` 顶上那张量测表。
    .use(options.onSelection ? [selectionSnapshotPlugin(options.onSelection)] : [])
    // 专注 / 打字机。**恒挂**（可编辑那一份）：两个开关随时可能被拨，
    // 而"挂不挂插件"一旦绑进 `EditorPane` 的依赖，拨一下就得重建实例。
    // 只读的预览窗格不挂——那边没有光标，也没有"正在写的那一段"。
    .use(readOnly ? [] : [writingModePlugin(options.writingModes)])
    // 行内标记的提示（加粗/斜体的 `*`）。⚠️ **只给可编辑实例**：它是编辑时的
    // 提示，不是文档的一部分——只读实例有两个（分屏预览、导出用的离屏实例），
    // 装上就会在预览和导出文件里多出一对星号。理由写在 `mark-hint.ts` 文件头。
    .use(readOnly ? [] : [markHint])
    // 斜杠菜单（行首敲 `/` 弹插入列表）。⚠️ **只给可编辑实例**——与上面那条
    // （`markHint`）同一个理由，只为它多一层：只读实例有两个，在那儿弹一块
    // "想插入什么"的面板纯属噪声。
    // ⚠️ 执行那条路走 `跑一条命令`，而它**正是 `runCommand` 的下半个**——
    // 于是斜杠菜单与菜单栏点同一项，落点必然是同一份代码，不会出现
    // "菜单里能插、斜杠里插出来是另一样"。`跑一条命令` 是函数声明（会被提升），
    // 所以写在这一行后面也调得到；它里面用的 `editor` 到那一刻早就建好了。
    .use(readOnly ? [] : slantBarMenu(true, (id) => parameter.runOneItemCommand(id)))
    // 就地改动预览。**恒挂**（可编辑那一份）：预览随时可能被插件喊起来，
    // 而"挂不挂插件"一旦绑进 `EditorPane` 的依赖，喊一次就得重建编辑器。
    // 不传 `onReviewEscape` 时给一个空函数——`Esc` 那一下没人接就是了，
    // 比让插件在按下时抛错好。
    .use(readOnly ? [] : [previewPlugin(options.review ?? null, options.onReviewEscape ?? (() => {}))])
    .create();}
