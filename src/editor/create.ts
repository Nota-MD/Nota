/**
 * 编辑器内核：Milkdown（ProseMirror + remark）的封装。
 *
 * # 为什么是 ProseMirror 系而不是「textarea + 高亮装饰」
 *
 * 这一层要的语义是**文档树**，不是"带样式的文本缓冲"。表格拖列宽、图片定尺寸、
 * 嵌套列表的层级、脚注引用、任务项勾选——这些在文档树上都是**一等的节点**，
 * 在文本缓冲上则要一层层拿文本偏移去近似，且每次编辑都可能算错。
 * 那些看起来"琐碎"的功能，正是文本缓冲方案最先崩的地方。
 *
 * Milkdown 底下就是裸 ProseMirror。将来某个节点要下沉到 PM 原语（自定义 schema、
 * 自定义 plugin），这条路是敞开的——本文件不做任何"只此一家"的封装。
 *
 * # 真相在哪
 *
 * **前端是文本的真相**（见 `src-tauri/src/document/mod.rs` 顶上那段）。
 * 本模块提供 `getMarkdown()` / `setMarkdown()` 两个口子，别的模块
 * **不要**直接去摸 `editorViewCtx` 里的 state。
 */

import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  serializerCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
} from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { indent } from "@milkdown/kit/plugin/indent";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { replaceAll } from "@milkdown/kit/utils";
// 这三个**不在** `@milkdown/kit` 的转发表里，得从各自的包进。
// 前两个是 kit 的依赖（间接装上了），plugin-prism 不是——所以它在 package.json
// 里必须显式列出来，漏了就是一句 "Cannot find module"。
import { prism } from "@milkdown/plugin-prism";
// ⚠️ `mathInlineInputRule` 是**拿掉**的那一条，见下面 `.use(math.filter(...))`。
import { katexOptionsCtx, math, mathInlineInputRule } from "@milkdown/plugin-math";
import { diagram } from "@milkdown/plugin-diagram";

// 开头那段 YAML front matter 的拆分/拼回。**只在这个文件的边界上用**，
// 别处不许各自去切一刀（判据只有一份）。理由见它的文件头。
import { 拆前置块, 拼回前置块 } from "@/editor/front-matter";

// 菜单栏要用的编辑命令。**只从这里进**——别处不许自己去摸 `editorViewCtx`
// 派事务（见本文件顶上那段"真相在哪"）。
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInHeadingInputRule,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
  insertImageCommand,
  toggleLinkCommand,
} from "@milkdown/kit/preset/commonmark";
import {
  // ⚠️ **`columnResizingPlugin` 不在 `gfm` 里**——这一条 2026-09-26 查出来时
  // 反了直觉：`@milkdown/preset-gfm` 的 `lib/index.js:1012` 那个 `plugins` 数组
  // 只有 `keepTableAlignPlugin` / `autoInsertSpanPlugin` / `remarkGFMPlugin` /
  // `tableEditingPlugin` 四个，而 `columnResizingPlugin`（同文件 929 行定义的）
  // **只是被 `export` 出来，没有被塞进任何数组**。所以"preset 默认就装"
  // 这句话是错的，得在这里自己 `.use()`。
  //
  // 症状正是用户报的那条（「表格，允许拖动改变大小」）：表格画得出来、打字正常、
  // 什么都不报错，**就是拖不动**——因为压根没有那个插件在监听鼠标。
  // ⚠️ 它和 `main.tsx` 里引的那份 `tables.css` 是**两半，缺一不可**：
  // 插件负责"拖了要发生什么"，CSS 负责"哪儿能拖、拖的时候长什么样"。
  columnResizingPlugin,
  toggleStrikethroughCommand,
  insertTableCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
  setAlignCommand,
} from "@milkdown/kit/preset/gfm";
import { TextSelection } from "@milkdown/kit/prose/state";
import { undoCommand, redoCommand } from "@milkdown/kit/plugin/history";
import { callCommand } from "@milkdown/kit/utils";

// 需要"先看一眼光标在哪、再一笔事务里改两处"的那几条，实现放在这里。
// ⚠️ 本文件是它**唯一**的调用点（理由见那份文件头）。
import { 转成任务列表, 清除格式, 表格删行, 表格删列, 表格删表, 插公式块, 插目录 } from "./insert";
// 脚注（gfm 的节点＋解析＋序列化都是现成的，缺的是"从零插一条"）。
import { 插脚注 } from "./footnote";
import { 滚动到位置 } from "./scroll-into-view";
// 就地改动预览（`nota.ui.review_diff`）。⚠️ 算法与两种看法在 `review.ts` 里，
// 这里只用它那一侧的适配层，和 `writing-modes.ts` 的接线方式一样。
import { 摘看法, 设看法, type 改动预览, type 预览看法 } from "./review";
import { 预览中吗, 预览插件, 设预览 } from "./review-prose";

// ⚠️ 副作用导入，**不是多余的**：把 refractor 的语言表从 36 种补到 400 个
// （297 种语言 + 别名，比如 ts→typescript、sh→bash）。
//
// 为什么需要这一行：`@milkdown/plugin-prism` 内部是
// `import { refractor } from "refractor"`，而 `refractor` 这个入口指向
// `lib/common.js`——**里面只 register 了 36 种**（c / cpp / java / python /
// js / ts / rust / go 那一批）。`lib/all.js` 才是全量那份 297 行的注册清单。
//
// ⚠️ 两边是**同一个单例**（都从 `refractor/lib/core.js` 拿那一个 `refractor`），
// 所以这里注册的，plugin-prism 那边立刻看得见——它读语言表是**惰性**的
// （`getBlockDecorations(node, pos, refractor, languages = refractor.listLanguages())`
// 里那是默认参数，调用时才求值），只要这行 import 在 `Editor.make()` 之前跑完即可。
//
// 代价是打包体积。**这是有意的取舍**：桌面应用没有下载时间这一说，
// 而"语言不在列表里"是插件和用户都会撞上的问题。真嫌大时再换成
// 按需 import，但那时要自己维护依赖顺序（php 必须排在 markup-templating 后面）。
import "refractor/all";

// 光标所在块的 Markdown 标记（`##`、`>`、`-`……）浅灰画在块左边。
// 这是"标记不消失、只淡化"的口径，理由写在它自己的文件头上。
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
import { 表格输入规则, 表格输入 } from "./table-input";
// 标题**回车才成块**（照 Typora）：`# 你好` 在按回车之前一直是段落，
// 只按粗体提示；回车才去掉前缀、换成标题。理由见它自己的文件头。
import { 标题回车成块, 标题行首退格 } from "./heading-on-enter";
import { 段落不写空行, 文档别导出空根 } from "./empty-paragraph";
// 代码块的右下角那一条：语言选择器 / 复制 / 折叠。用 NodeView 的地方之一
// （另一处是下面的图表块），理由写在它自己的文件头上。
import { codeBlockView } from "./code-block";
// 图表块（```mermaid）：把 `@milkdown/plugin-diagram` 那个只会把源码塞进
// `<pre>` 的节点换成真图。⚠️ 上游插件**一处都没调过 `mermaid.render`**，
// 渲染这件事只能宿主自己写——契约（`attrs.value` 是唯一真相、identity 不变）
// 和取舍都写在它自己的文件头上。
import { diagramView } from "./diagram-view";
// 公式（`$x$` / `$$ … $$`）：上游那两个节点是 `atom`，却一个 NodeView 都没有
// ——点一下只是整块选中，写进去的字还会被 `toMarkdown` 丢掉（源码在两处、
// 读的是 `attrs.value`）。这个文件把它们换成能就地改的视图，编辑时用半透明的
// `$` / `$$` 标出输入位置。契约与取舍写在它自己的文件头上。
import { mathView } from "./math-view";
// 行内公式的**打字**规则：`$x$` 与 `$$x$$`。上游那条认不出 `$$…$$`（敲到
// `A$$bb$` 就把 `$bb$` 变成公式了），这里换掉它。正则、守卫、与解析器的
// 实测对照表都在它自己的文件头上。
import { 公式输入 } from "./math-input";
// 行内公式**用了几个 `$`**：用户敲两个就存两个（2026-09-27 用户拍板「保留」）。
// ⚠️ 三件事在这个文件里：`math_inline` 的规格**加了一个 `dollars` 属性**（用官方的
// `extendSchema`，不复制上游规格）、一个 `$remark` 插件把源码里那个数标进 mdast、
// 以及一条按数选上游处理器的序列化 handler。少接一处就是**静默失效**（存盘悄悄
// 变回 `$x$`），全貌与边界在它自己的文件头。
import { 标美元数, 行内公式处理器, 行内公式规格 } from "./math-delim";
// 敲在行内原子（公式、图片、硬换行）后面的那颗空格：WebKit 会把它换成不换行
// 空格，于是存盘多出一个用户没敲过的字符（U+00A0，不换行）。⚠️ 修法是**在序列化
// 那一步换回来**（包一层 `handlers.text`，挂载点在下面 `.config()` 里
// `不转义行首井号` 那一行上），**不是**在编辑器里拦——拦过，会让那颗空格在
// 后续编辑里消失；也**不是**挂 `$remark` 插件——挂过，那个转换器根本不会被
// 调用。两版失败都写在 `atom-space.ts` 文件头。
import { 原子后的空格 } from "./atom-space";
// 序列化时**不给行首的井号加反斜杠**（不加这一步，`#标签` 存盘会变成
// `\#标签`——用户没打过那个反斜杠，那也是"自动修复"）。
// ⚠️ 宽松模式原来自带的另一半（把 `#标题` 按标题排版）**2026-09-26 删掉了**：
// 用户裁定 `#你好` 不许变位置变大小，理由与他的原话在那个文件的文件头。
import { 不转义行首井号 } from "./lax-heading";
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
  关掉单波浪号删除线,
  行内标记解析,
  行内标记处理器,
  行内标记规格插件,
  行内标记命令,
  行内标记输入规则,
  不转义行首等号,
  不转义孤立波浪号,
  默认行内扩展开关,
} from "./inline-marks";
// **块级**裸 HTML 与 HTML 注释。⚠️ 行内的那些（`甲<u>乙</u>丙`）**不走这里**——
// preset 自带的 `htmlSchema` 管着它们；这一条补的是"独占一行的 HTML / 注释
// 在 mdast 里是 root 的直属孩子，而 doc 只收 block+，于是整篇文档打不开"那个洞
// （全貌在那个文件的文件头）。挂载位置与 `行内标记解析` 同一条：**排在 `gfm`
// 后面**（它改的也是解析完的树）。
import { 块HTML解析, 块HTML规格插件 } from "./html-block";
// **智能标点**（`--` → `–`、`"` → `“ ”` 那一组，`settings/markdown.rs` 里
// 六个字段的消费者）。⚠️ 两条都要，而且**只有 `Input` 档挂输入规则、
// 只有 `Render` 档挂装饰**——两个函数内部各自判模式并返回空数组，
// 这里不必写分支（理由与"为什么返回空数组而不是挂上去返回 null"在那个文件的
// `标点输入` 上）。排在这里＝排在 `commonmark` / `gfm` **之后**：
// 上游的分割线规则（`/^(?:---|___\s|\*\*\*\s)$/`）要求整块只有三个减号，
// 让先中者赢的那一侧是上游，本文件这边另有一道守卫兜着（`是行首的横线`）。
import { 标点输入, 标点装饰, 默认标点设置 } from "./smart-punctuation";
// **自动更正**（英文错拼那一张固定表）。⚠️ 只有一条输入规则，**排在整串
// `.use()` 的最后**——理由见那个文件的 `自动更正输入`。
import { 自动更正输入 } from "./auto-correct";
// **Emoji**（`:smile:` → 😄 的短代码替换 ＋ 打 `:smi` 弹候选的补全面板）。
// ⚠️ 两条都是"只动正在敲的那几个字符"：替换只在敲下词尾空白那一下发生，
// 面板**只画不改**（`Plugin.view` ＋ 挂在 body 上的 fixed 浮层，文档树一个
// 字都不动）。⚠️ 补全面板**只读实例不挂**（见下面 `.use()` 那一段）。
import { emoji输入规则, emoji补全 } from "./emoji";
// **斜杠菜单**（行首敲 `/` 弹一张"插入什么"的列表）。⚠️ 与 Emoji 补全面板
// 同一条手法（自绘浮层、只画不改），理由与"为什么不装 `@milkdown/plugin-slash`"
// 写在那个文件的文件头。⚠️ 它**只读实例不挂**。
import { 斜杠菜单 } from "./slash";
// ⚠️ **不许删**：没有它，**不带 title 的图片会在装载时被整节点丢掉**
// （打开含图文档 → 存盘 → 图片从文件里消失）。上游 schema 的毛病、
// 症状与实测记录都在它自己的文件头上。
import { 补全图片属性 } from "./image-attrs";
import { katexOptionsFor } from "./math-macros";
// 表格列宽（拖动改大小那条路的下半截：记住 / 摆回来）。
// ⚠️ 上半截是 CSS（`main.tsx` 引的那份 `tables.css`），缺了它"能拖"没有出口。
import { 列宽插件, 应用列宽 } from "./table-width";
// 「光标现在在什么状态」。格式化工具栏的高亮与菜单那十条表格命令的灰/亮
// 都问它——**只读不写**，见它自己的文件头。
import { 光标状态插件 } from "./command-state";
import { 写作模式插件, 滚到当前行, 设写作模式, type 写作模式 } from "./writing-modes";
// 查找与替换。**匹配逻辑在那边**，这里只把它的命令接到句柄上；
// 源码模式那一侧共用同一个纯函数（见那个文件头）。
import {
  查找插件,
  设查询,
  走,
  清除,
  替换当前,
  全部替换,
  type FindOptions,
} from "./find";

// ── 对外类型**搬走了**（2026-09-26）────────────────────────────────────
// `EditorCommand` / `CommandPayload` / `选区内容` / `EditorHandle` / `CreateOptions`
// 五样整段搬去了 `./create-types`——搬的原因只有行数一个（本文件当时 1036 行、
// 越过 1000 行硬上限），内容一个字节没改。
//
// ⚠️ **下面这条转发是必须的**：全仓几十处是按 `@/editor/create` 引这些类型的
// （`ui/EditorPane.tsx`、`ui/useClipboard.ts`、`ui/source.ts`…），转发断了就是
// 几十处编译错。加新类型时也走这里出去，**别再让同一个类型有两个住处**。
export type {
  EditorCommand,
  CommandPayload,
  选区内容,
  EditorHandle,
  CreateOptions,
} from "./create-types";
// 本文件自己还要用这四样（`COMMANDS` 表的签名、`createEditor` 的签名与返回值）。
import type {
  EditorCommand,
  CommandPayload,
  EditorHandle,
  CreateOptions,
} from "./create-types";


/**
 * 建一个编辑器实例。
 *
 * 注意插件清单里**没有**什么，和有什么一样重要：
 * - 没有 `block`（块手柄）、没有 `tooltip` ——这些是交互糖，排在后面的轮次里
 *   （见 `docs/07`）。先装它们会在交互口径还没定下来时就被它们的默认行为绑住。
 *
 * ⚠️ **`slash`（斜杠菜单）已经不在这张"没有"清单里了**（2026-09-27）：它做了，
 * 装在上面 `.use(readOnly ? [] : 斜杠菜单(...))` 那一行。
 * ⚠️ 而且装的是**自己写的那一份**（`editor/slash.ts`），**不是**
 * `@milkdown/plugin-slash`——那份要拖 `@floating-ui/dom` ＋ `lodash-es`
 * 两条依赖链进来，而这里要的只是"行首敲 `/` 弹一张表"。理由写在
 * `editor/slash.ts` 的文件头。
 */
export async function createEditor(options: CreateOptions): Promise<EditorHandle> {
  const { root, initialMarkdown, onChange, readOnly = false, physics = false } = options;
  // ⚠️ 单独取出来而不是解构：它可选，而 `.use([])` 与 `.use([插件])` 这两种
  // 写法在 Milkdown 里都是合法的——不传时给空数组，比给一个"什么都不做的
  // 插件"干净（后者每次事务都要跑一趟）。

  // 三种行内扩展语法的开关。**建实例时取一次**（下面 `.use()` 那几行要它，
  // 而转换器是捕获式地拿着它的）——改设置要重建编辑器，与 `physics` 同一条
  // 口径，理由见 `create-types.ts` 的 `inlineMarks` 那一格。
  const 行内扩展 = options.inlineMarks ?? 默认行内扩展开关;

  // 智能标点那一组。**同样建实例时取一次**（输入规则是注册制的），
  // 改设置要重建编辑器——理由见 `create-types.ts` 的 `标点` 那一格。
  // ⚠️ `undefined` 落到 `默认标点设置`（`input`），与 Rust 那边的 `Default` 一致。
  const 标点 = options.标点 ?? 默认标点设置;

  // 自动更正开不开。⚠️ `undefined` **不等于关**：Rust 那边的默认是 `true`，
  // 这里跟着取 `true`（见 `create-types.ts` 的 `自动更正` 那一格）。
  const 自动更正 = options.自动更正 ?? true;

  // Emoji（短代码替换 ＋ 输入补全）。⚠️ 同样是**建实例时取一次**：
  // 输入规则是注册制的、补全面板那条插件也建在这里，改设置要重建编辑器
  // ——理由见 `create-types.ts` 的 `emoji` 那一格。
  const emoji = options.emoji ?? true;

  // ── 开头那段 front matter：切下来存住，出去的时候原样拼回 ──────────────
  //
  // ⚠️ 编辑器**读不懂**它（CommonMark 里 `---` 是分割线），不切的话"打开再
  // 存盘"会把它改写成正文——静默的数据损毁，实测与根因见 `front-matter.ts`
  // 文件头。切下来之后它**不在文档树里**，编辑器一个字节都碰不到。
  //
  // ⚠️ **只读实例也切**（分屏右侧预览、导出用的离屏实例）：那两个同样只该
  // 画**正文**，front matter 是元数据，不该出现在预览和导出的 HTML 里。
  // 它们不读 `getMarkdown`，所以拼回那一步对它们是空跑。
  const 首部 = 拆前置块(initialMarkdown);
  let 前置块 = 首部.前置块;

  /**
   * 上一次设进去的那份预览。**按对象身份去重**用的（见 `setReview`）。
   * 初值是建实例时那一份，与插件 `init` 里算的是同一个对象。
   */
  let 上次预览: 改动预览 | null = options.review ?? null;

  /**
   * **这一刻**记着的表格列宽。初值是侧车那份，用户每拖完一次就跟着更新。
   *
   * ⚠️ 必须是**活的那一份**，不能每次回读 `options.tableWidths`：整篇替换
   * （`setMarkdown`：重新载入、插件改文档、切模式）之后要把它摆回去，而
   * `options` 里那份是**建实例时**的快照——用它的话，用户刚拖完列宽、插件
   * 紧接着改一次文档，列宽就会被**退回建实例那一刻的旧值**，看起来像"我刚
   * 拖的它自己变回去了"。
   */
  let 列宽表: Record<string, number[]> = { ...(options.tableWidths ?? {}) };

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, 首部.正文);

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
      关掉单波浪号删除线(ctx);

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
          ...行内标记处理器(),
          // ⚠️ 四条**套着**的文本处理器，谁在外层一眼可见（后两条只看字符本身，
          // 前两条要看这一颗文本节点**最终**写出什么，所以在外层）：
          //   外层 `不转义孤立波浪号`——把**孤立**的 `\~` 去掉（`甲 ~ 乙` 不该
          //        存成 `甲 \~ 乙`；成对/贴边的照旧留着，判据在那个函数上）；
          //   次层 `不转义行首等号`——把行首 `==重点==` 前面那个反斜杠去掉；
          //   中层 `原子后的空格`——把 WebKit 塞在行内原子后面的那颗 U+00A0
          //        换回普通空格（`atom-space.ts`）；
          //   内层 `不转义行首井号`——把行首 `#` 前面那个多余的反斜杠去掉
          //        （`lax-heading.ts`）。
          // 四条各自只看自己认的那个字符、各自把原文传下去，互不干扰。
          //
          // ⚠️ **只能挂在这儿**：序列化走的是 `remark.stringify()`，
          // 而 unified 的 `stringify()` **不跑转换器**（只调编译器）——所以
          // `$remark` 插件挂上去是个**静默的空操作**（`atom-space.ts` 第二版
          // 就栽在这儿，那一段里有探针与源码行号）。上游那些 remark 插件靠的是
          // `toMarkdownExtensions` 这类 data，不是转换器。
          text: 不转义孤立波浪号(不转义行首等号(原子后的空格(不转义行首井号(prev.handlers?.text)))),
          // 行内公式：**用户敲了几个 `$` 就写回几个**。
          //
          // ⚠️ 这一条**没有**"包一层"的写法（不像上面那条 `text`）——上游那条
          // `inlineMath` 不在 `prev.handlers` 里，它是 remark-math 从
          // `data.toMarkdownExtensions` 送进来的。覆盖得掉它靠的是
          // `mdast-util-to-markdown` 的 `configure()` 顺序：**先**展开
          // `extensions`、**后**铺顶层 `handlers`（`lib/configure.js:20-27`），
          // 我们这份是后写的，所以赢。理由与实测在 `math-delim.ts` 文件头。
          inlineMath: 行内公式处理器(),
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
        editable: (state) => !readOnly && !预览中吗(state),
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
        if (markdown !== prev) onChange?.(拼回前置块(前置块, markdown));
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
    .use(commonmark.filter((p) => p !== wrapInHeadingInputRule))
    // ⚠️ **这三条必须排在 `gfm` 前面**，理由见文件顶 `inline-marks` 那段 import
    // 注释（`$inputRule` 先中者赢，而 `gfm` 的删除线会抢中文的 `张~2~`）。
    // 规格要早于输入规则：输入规则命中的那一刻，`schema.marks` 里就得有那四种
    // mark 了，否则建出来的 mark 是 `undefined`。
    .use(行内标记规格插件)
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
    // ⚠️ **不跟 `行内扩展` 开关走**（与 `COMMANDS` 表上那段注释同源）：
    // 关掉的是"解析与输入"，不是这四条能力。
    .use(行内标记命令)
    // 输入规则（`==x==` 敲完当场变高亮那类）。**只读实例也挂**——只读时
    // 压根没有输入，挂上去是零成本的死代码；分一个跟 `markHint` 那样的
    // 分支反而多一处"哪个模式装了哪个没装"要说清楚的东西。
    .use(行内标记输入规则(行内扩展))
    .use(gfm)
    // 智能标点的输入规则（`--` → `–` 那一族）与显示装饰（`Render` 档）。
    // ⚠️ **两个函数各自判模式**：`off` / `render` 时输入规则返回空数组，
    // `off` / `input` 时装饰返回空数组——这里不写分支，读的人只需要看那两处。
    .use(标点输入(标点))
    .use(标点装饰(标点))
    // 自动更正的输入规则（`teh` → `the` 那一族）。⚠️ 它与上游任何输入规则
    // 都不抢同一段文本（那些要的分隔符是 `#` / `>` / `-` / 数字，不是字母），
    // 所以位置其实无关紧要；放在这里只是让"标点那一家"挨在一起。
    .use(自动更正输入(自动更正))
    // Emoji：短代码替换（`:smile:` → 😄）与输入补全面板（打 `:smi` 弹候选）。
    // ⚠️ **两件事都由 `emoji` 一个开关管**（理由见 `create-types.ts` 那一格）。
    // ⚠️ 排在**最后**：短代码要以英文冒号起头、以冒号＋空白收尾，与上游那些
    // "占满整块"的规则不重合；放最后只是为了让"输入辅助"这一族挨在一起。
    .use(emoji输入规则(emoji))
    // ⚠️ 补全面板**只读实例不挂**（与上面那条输入规则不同）：输入规则在
    // 只读时是零成本的死代码（压根没有输入），而补全面板只要光标停在一个
    // `:smi` 后面就会弹——只读预览（分屏右窗格）里点一下也会，那是纯噪声。
    // 导出那条路（`editor/export.ts` 的离屏实例）同理，且它更该干净。
    .use(emoji补全(emoji && !readOnly))
    // ⚠️ **排在 `gfm` 后面**：它改的是解析完的 mdast，早于 `gfm` 就等于对着
    // 还没铺开的树干活。默认 `remark-parse` 与 `gfm` 都不认识那四种写法，
    // 到了这一步它们还只是普通文本节点。
    .use(行内标记解析(行内扩展))
    // 块级裸 HTML / HTML 注释那一颗节点（规格 ＋ 解析转换器）。⚠️ 两条都要，
    // 而且**顺序不能反**：转换器先把块级 `html` 改写成自造类型，schema 才有
    // 东西可接（见 `html-block.ts` 文件头）。
    .use(块HTML规格插件)
    .use(块HTML解析())
    // ⚠️ **拖列宽那条插件要自己装**（`gfm` 里没有它），理由见文件顶 `import`
    // 那一段的长注释。它必须排在 `gfm` **之后**：`schema` 是 `gfm` 带进来的，
    // 插件建实例时要按 schema 找 `table` / `table_cell` 那几个节点。
    //
    // ⚠️ **源码模式那一侧也装了**（它就是 `gfm` 的一部分，没按模式分家）——
    // 分屏右侧那个只读预览不会响应它（`columnResizing` 自己判 `view.editable`），
    // 可编辑的那一份装上是**故意的**：源码模式切回所见即所得是重建实例，
    // 这里少装一次不会省下什么，反而多一个"哪个模式装了哪个没装"的分支。
    .use(columnResizingPlugin)
    // ⚠️ 在 `commonmark` 之后即可（它只是往 mdast 上多挂一个变换），
    // 但**必须在 `.create()` 之前**：mdast → ProseMirror 那一步发生在建实例时，
    // 建完了再挂就等于没挂。**只读的那一份也要挂**（分屏预览、导出），
    // 那两处同样会把 markdown 变成文档。
    .use(补全图片属性)
    // ⚠️ 这里原来写着 `.use(原子后的空格)`（"原子后面那颗空格"）——**2026-09-26
    // 整个搬走了，而且是两次**：第一版是 ProseMirror 插件（拦在编辑器里，
    // 会让那颗空格在后续编辑里消失），第二版是 `$remark` 插件（看着像"在序列化
    // 那一步改"，实际**一次都不会被调用**，因为 unified 的 `stringify()` 不跑
    // 转换器）。现在它包在 `handlers.text` 上，见上面 `.config()` 里那一行。
    // ⚠️ **那两次失败都写进了 `atom-space.ts` 的文件头**——包括"怎么验出
    // 没被调用"的探针。别再往这里加第三次。
    .use(history)
    .use(listener)
    .use(cursor)
    .use(clipboard)
    .use(indent)
    .use(trailing)
    .use(instantRender)
    .use(taskList)
    .use(表格输入规则)
    .use(表格输入)
    .use(标题回车成块)
    // ⚠️ **行首退格散标题**（2026-09-26 第二轮）：标题前按退格一次变回段落，
    // 不逐级降级。它是 `$shortcut`（走 keymap 的 `priority` 排序），
    // **不是**上面那条 `$prose`——为什么非得这样、为什么放在这个位置都
    // 无所谓，见 `heading-on-enter.ts` 文件头那一节。
    .use(标题行首退格)
    // ⚠️ **空段落不写 `<br />`**（2026-09-26 第二轮，用户：「enter 默认是真 enter
    // 而非 `<br>`」）。它必须在 `commonmark` **之后**——schema 按名字拼、
    // 同名后来者盖先前的（理由与实测在 `empty-paragraph.ts` 文件头）。
    .use(段落不写空行)
    // ⚠️ **必须紧跟着上面那条**：它俩是一对（"空段落不产出" ＋ "根节点不能空"），
    // **少一个空文档就打不开**——界面停在「正在准备编辑器…」，堆栈是上游
    // `mdast-util-to-markdown` 的 root handler 里 `node.children.some`。
    // 实测与理由在 `empty-paragraph.ts` 文件头。
    .use(文档别导出空根)
    .use(codeBlockView)
    .use(prism)
    // ⚠️ **摘掉一条输入规则**（2026-09-26，和上面标题那条同一个手法）：
    // 上游那条行内公式规则（`mathInlineInputRule`，正则 `/(?:\$)([^$]+)(?:\$)$/`）
    // 认不出 `$$…$$`——用户敲到 `A$$bb$` 那一下就把尾巴上的 `$bb$` 变成公式了，
    // 等他把最后一个 `$` 补上，落进文档的已经不是公式。**"行内 `$$…$$`
    // 打不出来"的根因就是它**。换成 `公式输入` 那两条（多一条守卫、多一条
    // `$$` 规则），边界与实测表在 `math-input.ts` 文件头。
    // ⚠️ `math` 也是**纯数组**（`plugin-math/lib/index.es.js` 尾部那个
    // `[…].flat()`），所以按引用滤得掉。**块公式那条规则照旧**（`$$` ＋ 空格
    // 起一块），摘的只有行内这一条。
    .use(math.filter((p) => p !== mathInlineInputRule))
    .use(公式输入)
    // ⚠️ **必须是紧挨着的三条，而且顺序不能动**：
    //   ① `math` 那份（上面）先把上游的 `math_inline` 规格登记进去；
    //   ② `行内公式规格` 用 `extendSchema` 出一份**同 id** 的，登记时由
    //      `upsertById` **就地替换**（位置不变——`utils.ts:11-20` 那段注释说得很
    //      清楚：换位置会让 ProseMirror 的 content-match 走岔、然后无限递归）；
    //   ③ `标美元数` 这个 remark 插件要排在 `math` 后面（转换器按注册顺序跑）。
    // ② 与 ③ 谁先谁后无所谓，**但都不能排到 ① 前面**。
    .use(行内公式规格)
    .use(标美元数)
    // ⚠️ 这里原来挂着 `原子后的空格`（`handleTextInput`，把 WebKit 塞进原子后面
    // 的那颗 NBSP 挡在文档之外）——**2026-09-26 开窗实测之后整个搬走了**：
    // 挡在编辑器里会让那颗空格在"紧接着再敲一个字符"时**从文档里消失**
    // （丢内容，比文件里多个不可见字符严重）。现在它挂在 **remark** 那一串上，
    // 只在写 Markdown 那一刻换字符，**编辑器里随 WebKit 去**。
    // 经过、三次实测与代价见 `atom-space.ts` 文件头。
    .use(diagram)
    .use(diagramView)
    // 公式那两个节点（`$x$` / `$$ … $$`）：上游一个视图都没给，这里补上
    // 「点一下就地改」。不在编辑时行内直接渲染；编辑时正文就是源码（`$` 半透明）、
    // 公式落在下面那个悬浮预览里——两态的长相与理由见 `math-view.ts` 文件头。
    // ⚠️ `mathView` 是个**数组**（两条线：`$prose` 那条管"当前是哪一块"，
    // `$view` 那条管怎么画），`.use()` 收数组。
    .use(mathView)
    // ⚠️ 宽松标题那条显示层装饰**2026-09-26 删掉了**（原位置就是这一行）。
    // 用户裁定 `#你好` 不许变位置变大小，所以两种模式下正文的长相现在
    // **完全一样**；严格模式只剩源码模式 / 大纲 / 标签页标题三处（见上面
    // `readOnly` 下面那条注释）。理由与用户原话在 `lax-heading.ts` 文件头。
    // 盯着光标那一条。**只读**，见 `command-state.ts`。
    .use(options.onCommandState ? [光标状态插件(options.onCommandState)] : [])
    // 查找。⚠️ **和上面那条一样是可选的**：分屏右侧那个只读预览窗格
    // 不挂（它没有光标、也不会被查找），不传就少一条插件。
    .use(options.onFindStatus ? [查找插件(options.onFindStatus)] : [])
    // 专注 / 打字机。**恒挂**（可编辑那一份）：两个开关随时可能被拨，
    // 而"挂不挂插件"一旦绑进 `EditorPane` 的依赖，拨一下就得重建实例。
    // 只读的预览窗格不挂——那边没有光标，也没有"正在写的那一段"。
    .use(readOnly ? [] : [写作模式插件(options.writingModes)])
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
    .use(readOnly ? [] : 斜杠菜单(true, (id) => 跑一条命令(id)))
    // 就地改动预览。**恒挂**（可编辑那一份）：预览随时可能被插件喊起来，
    // 而"挂不挂插件"一旦绑进 `EditorPane` 的依赖，喊一次就得重建编辑器。
    // 不传 `onReviewEscape` 时给一个空函数——`Esc` 那一下没人接就是了，
    // 比让插件在按下时抛错好。
    .use(readOnly ? [] : [预览插件(options.review ?? null, options.onReviewEscape ?? (() => {}))])
    // 表格列宽：**拖完之后**把这一刻的宽度报出去（调用方写侧车）。
    // ⚠️ 与上面那两条"不传就不挂"同一个理由；另外它单独一条还是因为那条插件
    // 只在**拖动真的结束**时才出声（判据写在 `table-width.ts::列宽插件`），
    // 挂上去不产生任何日常开销。
    .use(
      readOnly || !options.onTableResize
        ? []
        : [
            列宽插件((表) => {
              // 先更新手里这份，再报出去（顺序要紧：`setMarkdown` 那条路读的是
              // 这里，见 `列宽表` 上那条注释）。
              for (const 一张 of 表) 列宽表[一张.指纹] = 一张.宽度;
              options.onTableResize?.(表);
            }),
          ],
    )
    .create();

  // 把侧车里记着的列宽摆回文档。
  //
  // ⚠️ **必须在 `.create()` 之后**：这是要往真的视图里派事务的，而视图到
  // 这一刻才存在（`.config()` 那一段跑的比它早，那儿的 `editorViewCtx` 还
  // 取不出来）。
  //
  // ⚠️ 它**不会**把文档标脏：`colwidth` 是节点属性，GFM 序列化时压根不写出去
  //（那正是"重开就丢、所以要侧车"的原因），所以下面这笔事务前后
  // `serializer(doc)` 是同一个字符串——`create.ts` 里那条
  // `if (markdown !== prev)` 于是不成立，`onChange` 一次都不会响。
  // ⚠️ 这一条**不能只靠推理**：本批的目检项之一就是"打开一份记着列宽的文档，
  // 状态栏不出现「已修改」"（结论记在 `docs/07` §4 本批那一行）。
  if (!readOnly) {
    editor.action((ctx) => 应用列宽(ctx.get(editorViewCtx), 列宽表));
  }

  // 实例建好时如果打字机模式已经开着，先把当前行摆正再交给调用方——
  // 插件那个 `view.update` 在"建好那一刻"不会跑（没有事务），不补这一下
  // 的话用户得先打个字才看得到居中效果。
  if (!readOnly && options.writingModes?.typewriter) {
    editor.action((ctx) => 滚到当前行(ctx.get(editorViewCtx)));
  }

  const 聚焦 = () =>
    editor.action((ctx) => {
      ctx.get(editorViewCtx).focus();
    });

  /**
   * 跑一条编辑命令，**只管命令、不管焦点**。
   *
   * ⚠️ 抽出来是因为它有**两个用家**，而两者的焦点处境正好相反：
   * - `runCommand`（菜单栏 / 快捷键）：命令是从**按钮**上点下去的，那一刻
   *   DOM 焦点在按钮上，所以跑完必须 `聚焦()` 把它交回正文；
   * - 斜杠菜单：焦点**本来就在编辑区里**（面板那两条 `preventDefault` 保的
   *   就是它），不必也不该多转一圈。
   *
   * 各写一份的话，症状是"菜单里点了是这样、斜杠里选出来是另一样"——
   * 而那种差别没人会想到去查。
   *
   * ⚠️ 写成函数声明是**有意**的：它被上面 `.use()` 那一行引用到，而那行
   * 在源码里排在它前面。提升让这件事成立；它里面用的 `editor`（`const`）
   * 到真正被调用时早已赋值，不存在暂时性死区那一类问题。
   */
  function 跑一条命令(name: EditorCommand, payload?: CommandPayload): void {
    if (isHeading(name)) {
      editor.action(callCommand(wrapInHeadingCommand.key, Number(HEADING_RE.exec(name)![1])));
    } else {
      COMMANDS[name](editor, payload);
    }
  }

  /** 把插入点挪到文档最开头。⚠️ 只给"刚打开一篇文档"，见接口上那条长注释。 */
  const 光标到开头 = () =>
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      // `TextSelection.atStart`：文档开头第一个**合法**的文本位置（空文档、
      // 第一块是代码块/表格都成立，不会抛）。
      view.dispatch(
        state.tr.setSelection(TextSelection.atStart(state.doc)).scrollIntoView(),
      );
      // ⚠️ `focus()` 必须在**派完事务之后**：聚焦本身会派一次事务（`trailing`
      // 补尾段那一条），先聚焦再设选区的话，那笔事务的
      // `selectionToInsertionEnd` 会把刚设好的插入点又带回文末——顺序反了
      // 就等于没写，而且症状一模一样（光标还在文末），很难查。
      view.focus();
    });

  return {
    // ⚠️ 出去的时候**把 front matter 拼回去**：调用方手里那份文本要跟磁盘上
    // 那份对得上（`ui/useDocuments.ts::saveDoc` 存的就是它的返回值）。
    getMarkdown: () =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const serializer = ctx.get(serializerCtx);
        return 拼回前置块(前置块, serializer(view.state.doc));
      }),

    setMarkdown: (markdown: string) => {
      // ⚠️ **原样**装进去：外来的文本（换文档、插件改文档、分屏推给预览）
      // 一个字符都不能被改动——存盘存的是编辑器序列化出来的东西。
      // 宽松模式认标题靠的是显示层的装饰，不是"先把文本补好"（见 `atx.ts`）。
      //
      // ⚠️ 替换完**显式把插入点收回开头**（2026-09-26）。`replaceAll` 内部走
      // `tr.replace(0, size, …)`，ProseMirror 会把选区用 `selectionToInsertionEnd`
      // 放到**替换内容的末尾**——重新载入一篇长文档之后光标在文末、屏幕外，
      // 症状就是用户说的「我最开始进入的时候找不到光标」。
      //
      // ⚠️ **只读的那一份不做**（分屏右侧预览）：它每次按键都被推一次新文本，
      // 跟着把选区拉回开头就等于**每次输入都把预览滚回顶部**，用户正翻着下半
      // 篇就被扯回去。只读那一侧没有"插入点"这个概念，本来也不需要。
      //
      // ⚠️ 整篇进来时**重新切一次**开头那段（不是沿用建实例时那一份）：
      // 换文档、插件改文档、源码模式切回来都走这条路，front matter 可能
      // 已经换成另一段了。忘了这一下的话症状是"切一次模式，开头那几行换成
      // 上一份文档的"——比丢掉还难查。
      const 新的 = 拆前置块(markdown);
      前置块 = 新的.前置块;
      const 替换 = replaceAll(新的.正文);
      editor.action((ctx) => {
        替换(ctx);
        if (readOnly) return;
        const view = ctx.get(editorViewCtx);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.atStart(view.state.doc)).scrollIntoView(),
        );
        // ⚠️ 整篇换掉之后**把列宽重新摆一遍**：这一段文本刚被解析成新的文档树，
        // 而 GFM 里根本没有列宽这回事（`colwidth` 是节点属性，序列化时丢）
        // ——不补这一下，「重新载入」（以及"放弃修改重载"、插件改文档）之后
        // 用户刚拖好的列宽会**全部回到自动**，而屏幕上没有任何解释。
        // ⚠️ 摆在设选区**之后**：那笔事务只动选区，两者不冲突，但这个顺序读起来
        // 是"先把文档摆好、再收光标"。
        应用列宽(view, 列宽表);
      });
    },

    focus: 聚焦,
    focusAtStart: 光标到开头,

    setWritingModes: (模式: 写作模式) =>
      editor.action((ctx) => 设写作模式(ctx.get(editorViewCtx), 模式)),

    setReview: (预览: 改动预览 | null, 看法: 预览看法) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        // ⚠️ 只有**预览换了**才派事务：派一次要序列化整篇 + 解析整篇目标文本，
        // 光切看法不该付这个代价（看法是纯 CSS 的开关）。
        if (预览 !== 上次预览) {
          上次预览 = 预览;
          设预览(view, 预览);
        }
        if (预览) 设看法(view.dom, 看法);
        else 摘看法(view.dom);
      }),

    // ── 查找与替换。每条就是"拿到 view，交给 `find.ts` 里的函数"──────
    // ⚠️ 不在这里写任何匹配逻辑：口径只有 `find.ts` 一份（见它的文件头）。
    setFind: (query: string, options: FindOptions) =>
      editor.action((ctx) => 设查询(ctx.get(editorViewCtx), query, options)),
    findStep: (方向: 1 | -1) =>
      editor.action((ctx) => 走(ctx.get(editorViewCtx), 方向)),
    clearFind: () => editor.action((ctx) => 清除(ctx.get(editorViewCtx))),
    replaceCurrent: (text: string) =>
      editor.action((ctx) => 替换当前(ctx.get(editorViewCtx), text)),
    replaceAll: (text: string) =>
      editor.action((ctx) => 全部替换(ctx.get(editorViewCtx), text)),

    // 选区那一份交给 ProseMirror 自己序列化（`serializeForClipboard`）：
    // 它给出的 HTML 与按 Ctrl+C 时写进剪贴板的**是同一份**，所以菜单里点
    // 「复制」和按快捷键得到的东西不会两样。
    //
    // ⚠️ 这里刻意不接 `transformCopied` 之类的钩子：复制出去的内容该是什么样，
    // 唯一的口径是 PM 那一份。想改就改 `clipboardTextSerializer`（全局一处），
    // 在调用点各写一份的话，两种复制方式迟早分叉。
    选区: () =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const sel = view.state.selection;
        if (sel.empty) return null;
        const { dom, text } = view.serializeForClipboard(sel.content());
        return { text, html: dom.innerHTML };
      }),

    跳到标题: ({ index }) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        // 数到第 `index` 个 heading 的**起始位置**（即它前面那个边界，
        // 正文从 `pos + 1` 开始）。
        // ⚠️ 用 `-1` 当"没找到"，不用 `number | null`：赋值发生在回调里，
        // TS 会把外面的 `null` 一直窄化下去，`pos + 1` 那一步就报 `never`。
        let n = 0;
        let pos = -1;
        view.state.doc.descendants((node, p) => {
          if (pos >= 0) return false;
          if (node.type.name === "heading") {
            if (n === index) {
              pos = p;
              return false;
            }
            n++;
          }
          return true;
        });
        if (pos < 0) return;
        // ⚠️ 事务上**不加** `.scrollIntoView()`：点大纲这条路上它不生效，
        // 机理见 `scroll-into-view.ts` 顶上那段（第一次点不动、第二次才动）。
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)),
        );
        // 焦点交给正文：不交的话焦点留在侧栏那颗按钮上，用户接着打字是白打，
        // 而"点了大纲就要接着写"正是这个动作的全部意义。
        view.focus();
        // ⚠️ 滚放在 `focus()` **之后**：焦点一交，浏览器会按自己的规矩把 DOM 选区
        // 拉进视野（可能只滚一点点），最后这一下才是"标题落在顶部"的那一下。
        滚动到位置(view, pos + 1);
      }),

    runCommand: (name: EditorCommand, payload?: CommandPayload) => {
      // ⚠️ 命令本身在 `跑一条命令` 里（与斜杠菜单共用一份实现），这里只多
      // 一件"把焦点交回正文"的收尾——见那条函数上的注释。
      跑一条命令(name, payload);

      // ⚠️ 跑完必须把焦点交回编辑区。命令是从**菜单按钮**上点下去的，
      // 那一刻 DOM 焦点在按钮上；命令本身改的是 ProseMirror 的 state
      //（它自己的 selection 还在原处，所以命令能正确生效），但**光标不会
      // 自己回到正文**——用户点完「加粗」接着打字，字会打到一个没有焦点的
      // 编辑区里，看起来就是"菜单点完就卡住了"。
      聚焦();

      // 这一侧恒为 `true`（见 `EditorHandle.runCommand` 那段）。
      return true;
    },

    destroy: () => {
      editor.destroy();
    },
  };
}

/** `h1`~`h6`。它们共用一条命令，只是层数不同，所以单独一族。 */
type HeadingCommand = `h${1 | 2 | 3 | 4 | 5 | 6}`;
type BlockCommand = Exclude<EditorCommand, HeadingCommand>;

const HEADING_RE = /^h([1-6])$/;

/**
 * ⚠️ 类型谓词而不是 `as`。写成 `HEADING_RE.test(name)` 的话 TS 收窄不了，
 * 后面查表就得 `as` 一下——而那个 `as` 会把"表里漏了一项"这种错误也一起放过去。
 * 写成谓词，两个分支各自拿到准确类型，漏项仍然是编译错。
 */
function isHeading(name: EditorCommand): name is HeadingCommand {
  return HEADING_RE.test(name);
}

/**
 * 命令白名单的**实体**。
 *
 * ⚠️ 存的是 `$Command` 的**回调**而不是 `$Command` 本身：Milkdown 的
 * `callCommand` 要的是 `slice.key`，直接传 `$Command` 过不了类型
 *（`$Command<T>` 是个带 `run`/`key` 的插件对象，不是 `CmdKey`）。
 * 包成"吃一个 editor"的闭包之后，调用点也不必再碰 Milkdown 的类型。
 */
const COMMANDS: Record<BlockCommand, (editor: Editor, payload?: CommandPayload) => void> = {
  undo: (e) => e.action(callCommand(undoCommand.key)),
  redo: (e) => e.action(callCommand(redoCommand.key)),
  bold: (e) => e.action(callCommand(toggleStrongCommand.key)),
  italic: (e) => e.action(callCommand(toggleEmphasisCommand.key)),
  inlineCode: (e) => e.action(callCommand(toggleInlineCodeCommand.key)),
  strike: (e) => e.action(callCommand(toggleStrikethroughCommand.key)),
  // 行内标记四条（高亮 / 上标 / 下标 / 下划线）。**不跟开关走**：命令表是
  // 静态的，而"这条命令能不能跑"取决于开关的话，菜单项的灰/亮就得跟着设置变
  // ——那是另一件事（`ui/commands.ts` 的 `命令能否用`）。关掉高亮的用户
  // 从格式化工具栏点一下，读到的是"这条通路上没实现"，那是个谎。
  // 真相是：**关掉的是解析与输入，不是这条能力**。
  highlight: (e) => e.action(callCommand(行内标记命令[0]!.key)),
  superscript: (e) => e.action(callCommand(行内标记命令[1]!.key)),
  subscript: (e) => e.action(callCommand(行内标记命令[2]!.key)),
  underline: (e) => e.action(callCommand(行内标记命令[3]!.key)),
  text: (e) => e.action(callCommand(turnIntoTextCommand.key)),
  quote: (e) => e.action(callCommand(wrapInBlockquoteCommand.key)),
  ul: (e) => e.action(callCommand(wrapInBulletListCommand.key)),
  ol: (e) => e.action(callCommand(wrapInOrderedListCommand.key)),
  task: (e) => 转成任务列表(e),
  codeBlock: (e) => e.action(callCommand(createCodeBlockCommand.key)),
  hr: (e) => e.action(callCommand(insertHrCommand.key)),
  // 公式块：`plugin-math` 没有插入命令，见 `insert.ts` 的 `插公式块`（2026-09-26）。
  mathBlock: (e) => 插公式块(e),
  // 内容目录：插一段普通 markdown 列表，两头用注释夹住；已有就原地更新。
  // ⚠️ `strict` 由上面带进来（缺省 = 宽松），编辑器实例自己不知道这个设置——
  // 理由写在 `create-types.ts::CommandPayload.strict`。
  toc: (e, p) => 插目录(e, p?.strict ?? false),
  // 脚注：gfm 给了节点与解析/序列化，缺"从零插一条"，见 `footnote.ts`（2026-09-27）。
  footnote: (e) => 插脚注(e),

  // ⚠️ **表格插的是 3 × 3**，而不是"先弹个框问行列数"。
  // `insertTableCommand` 的 `row`/`col` 缺省也能用，但缺省值不写出来就成了
  // 一个说不出所以然的数；菜单上那一项的标签也照这个数写了，两处一致。
  table: (e) => e.action(callCommand(insertTableCommand.key, { row: 3, col: 3 })),
  tableRowAbove: (e) => e.action(callCommand(addRowBeforeCommand.key)),
  tableRowBelow: (e) => e.action(callCommand(addRowAfterCommand.key)),
  tableColLeft: (e) => e.action(callCommand(addColBeforeCommand.key)),
  tableColRight: (e) => e.action(callCommand(addColAfterCommand.key)),
  tableDelRow: (e) => 表格删行(e),
  tableDelCol: (e) => 表格删列(e),
  tableDel: (e) => 表格删表(e),
  tableAlignLeft: (e) => e.action(callCommand(setAlignCommand.key, "left")),
  tableAlignCenter: (e) => e.action(callCommand(setAlignCommand.key, "center")),
  tableAlignRight: (e) => e.action(callCommand(setAlignCommand.key, "right")),

  // 这两条**必须有 payload**：地址从外面进来（界面先问用户，见 `ui/PromptDialog.tsx`）。
  // 缺省值给空串而不是"不执行"——空串的语义是"插一个还没填地址的链接/图片"，
  // 而那正是用户点完之后马上要补的东西。
  link: (e, p) => e.action(callCommand(toggleLinkCommand.key, { href: p?.href ?? "" })),
  image: (e, p) =>
    e.action(callCommand(insertImageCommand.key, { src: p?.src ?? "", alt: p?.alt ?? "" })),

  clearFormat: (e) => 清除格式(e),

  /**
   * 用文本替换当前选区（空串 = 删掉选区）。
   *
   * 两个用家：「粘贴」（`ui/useClipboard.ts` 读到剪贴板文本之后插进来）、
   * 「剪切」（复制成功之后删掉选中的那段）。
   *
   * ⚠️ 非空那一支**走 ProseMirror 自己的 `pasteText`**，不自己拼事务：
   * 多行文本要按行拆成多个段落、代码块和表格里不能塞段落——这些规矩 PM
   * 那边有一份现成的。自己写一份的话，"菜单粘贴"和"按 Ctrl+V"插出来的
   * 东西迟早不一样，而那种差别没人会想到去查。
   */
  insertText: (e, p) => {
    const text = p?.text ?? "";
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.focus();
      if (text) view.pasteText(text);
      else view.dispatch(view.state.tr.deleteSelection());
    });
  },
};

/**
 * 把 markdown 文本解析成 ProseMirror 文档（用于校验、或将来做"粘贴前预检"）。
 *
 * 单独导出来是因为 `docs/03` 里那条口径：**任何进编辑器的文本都要先过一遍解析**。
 * 直接 `replaceAll` 一个语法坏掉的串，remark 会按它的理解尽力解析——结果不是
 * "报错"而是"一段看起来对但不完全对的内容"，那种错最难发现。
 */
export function parseMarkdown(editor: Editor, markdown: string): unknown {
  return editor.action((ctx) => {
    const parser = ctx.get(parserCtx);
    return parser(markdown);
  });
}
