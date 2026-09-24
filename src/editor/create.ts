/**
 * 编辑器内核：Milkdown（ProseMirror + remark）的封装。
 *
 * # 为什么是 ProseMirror 系而不是「textarea + 高亮装饰」
 *
 * Typora 的语义是**文档树**，不是"带样式的文本缓冲"。表格拖列宽、图片定尺寸、
 * 嵌套列表的层级、脚注引用、任务项勾选——这些在文档树上都是**一等的节点**，
 * 在文本缓冲上则要一层层拿文本偏移去近似，且每次编辑都可能算错。
 * Typora 能做到的那几样看起来"琐碎"的功能，恰恰是文本缓冲方案最先崩的地方。
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
import { katexOptionsCtx, math } from "@milkdown/plugin-math";
import { diagram } from "@milkdown/plugin-diagram";

// 菜单栏要用的编辑命令。**只从这里进**——别处不许自己去摸 `editorViewCtx`
// 派事务（见本文件顶上那段"真相在哪"）。
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
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
  toggleStrikethroughCommand,
  insertTableCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
  setAlignCommand,
} from "@milkdown/kit/preset/gfm";
import { undoCommand, redoCommand } from "@milkdown/kit/plugin/history";
import { callCommand } from "@milkdown/kit/utils";

// 需要"先看一眼光标在哪、再一笔事务里改两处"的那几条，实现放在这里。
// ⚠️ 本文件是它**唯一**的调用点（理由见那份文件头）。
import { 转成任务列表, 清除格式, 表格删行, 表格删列, 表格删表 } from "./insert";

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
// 而"我的语言不在列表里"是插件和用户都会撞上的问题。真嫌大时再换成
// 按需 import，但那时要自己维护依赖顺序（php 必须排在 markup-templating 后面）。
import "refractor/all";

// 光标所在块的 Markdown 标记（`##`、`>`、`-`……）浅灰画在块左边。
// 这是"标记不消失、只淡化"那条 Typora 手感，理由写在它自己的文件头上。
import { instantRender } from "./instant-render";
// 任务项的复选框：画出来 + 点它勾上。DOM 钩子（`data-checked`）是
// `preset-gfm` 早就给了的，缺的是 CSS 和点击，理由写在它自己的文件头上。
import { taskList } from "./task-list";
// 代码块的右下角那一条：语言选择器 / 复制 / 折叠。这是**唯一**一处用 NodeView
// 的地方（别处要么改 schema、要么用 Decoration），理由写在它自己的文件头上。
import { codeBlockView } from "./code-block";
// 宽松模式下"把 `#标题` 按标题排版、但一个字都不改"的那个装饰。
// ⚠️ 判据在 `atx.ts`，这里只负责挂不挂——别在这再写一份正则。
import { 不转义行首井号, 宽松标题显示 } from "./lax-heading";
// ⚠️ **不许删**：没有它，**不带 title 的图片会在装载时被整节点丢掉**
// （打开含图文档 → 存盘 → 图片从文件里消失）。上游 schema 的毛病、
// 症状与实测记录都在它自己的文件头上。
import { 补全图片属性 } from "./image-attrs";
import { katexOptionsFor } from "./math-macros";
// 「光标现在在什么状态」。格式化工具栏的高亮与菜单那十条表格命令的灰/亮
// 都问它——**只读不写**，见它自己的文件头。
import { 光标状态插件, type CommandState } from "./command-state";
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
  type FindStatus,
} from "./find";

/**
 * 菜单栏能派发的编辑命令。
 *
 * ⚠️ 这是一张**白名单**，不是"随便什么命令名都能传"。任意的命令名字符串
 * 从菜单传进来，等于把一个 `any` 形状的入口开给界面层——写错了不报错、
 * 只是没反应。列成联合类型，写错就是编译错。
 *
 * `h1`~`h6` 走同一族命令（`wrapInHeadingCommand` 带层数参数），
 * 在 `runCommand` 里拆开，所以这里列六个而不是一个 `heading` 加参数。
 */
export type EditorCommand =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "inlineCode"
  | "strike"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "text"
  | "quote"
  | "ul"
  | "ol"
  | "task"
  | "codeBlock"
  | "hr"
  | "table"
  | "link"
  | "image"
  | "clearFormat"
  | "tableRowAbove"
  | "tableRowBelow"
  | "tableColLeft"
  | "tableColRight"
  | "tableDelRow"
  | "tableDelCol"
  | "tableDel"
  | "tableAlignLeft"
  | "tableAlignCenter"
  | "tableAlignRight";

/**
 * 命令可以带的参数。目前只有两条用得上（超链接的地址、图片的路径）。
 *
 * ⚠️ 它**不是**一个"什么都能塞"的口袋：字段少、全是可选，是因为命令名本身
 * 已经说明了要干什么，参数只是那件事的原料。真出现第三种原料时再往这里加，
 * 别提前把 `Record<string, unknown>` 那类东西开出来——那种类型等于没有类型。
 */
export interface CommandPayload {
  /** 超链接的目标地址。 */
  href?: string;
  /** 图片地址（相对文档目录的路径，或 http(s)/data: 开头的地址）。 */
  src?: string;
  /** 图片的替代文字。 */
  alt?: string;
}

/** 编辑器句柄。调用方只通过这些方法跟编辑器打交道。 */
export interface EditorHandle {
  /** 取出当前 markdown 文本。 */
  getMarkdown: () => string;
  /** 整篇替换（用于：打开文件、插件改了文档、放弃修改重载）。 */
  setMarkdown: (markdown: string) => void;
  /** 把焦点交给编辑区。 */
  focus: () => void;
  /** 拨专注/打字机模式。**随时可拨，不重建实例**（见 `writing-modes.ts`）。 */
  setWritingModes: (模式: 写作模式) => void;
  /**
   * 跑一条编辑命令。菜单栏和快捷键都走这里，**不认识 ProseMirror**。
   *
   * ⚠️ **返回值是"这条命令在这条通路上有没有对应的实现"**，不是"改了没有"。
   * 所见即所得这一侧永远有（`COMMANDS` 是白名单，覆盖全部 `EditorCommand`），
   * 于是它恒为 `true`；**源码模式那一侧会真的返回 `false`**（CodeMirror 没有
   * 文档树，表格那几条就没有对应的文本操作）。调用方（`ui/EditorPane.tsx`）
   * 据此提示用户，而不是让按钮按下去毫无反应。
   */
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;

  /* ── 查找与替换（`editor/find.ts`）────────────────────────────────────
   *
   * ⚠️ **这几条不进 `EditorCommand`**。那个联合类型是**编辑动作**的白名单
   * （作用在文档上、会进撤销栈），而查找是**视图层的状态**（高亮是装饰，
   * 不进文档、不进撤销栈）。混在一起的话，"查找下一个"会出现在命令表的
   * 遍历里，而它根本不是那一类东西。
   */

  /** 设查询与三个开关。**空串 = 关掉查找的高亮**（不清光标）。 */
  setFind: (query: string, options: FindOptions) => void;
  /** 跳到下一个（`1`）或上一个（`-1`）命中。 */
  findStep: (方向: 1 | -1) => void;
  /** 清掉查找状态与全部高亮。关查找条时调。 */
  clearFind: () => void;
  /** 替换当前命中。**没停在任何命中上时返回 `false`**（调用方据此提示）。 */
  replaceCurrent: (text: string) => boolean;
  /** 全部替换，返回换了几个。 */
  replaceAll: (text: string) => number;
  /** 销毁。组件卸载时**必须**调，否则 ProseMirror 的 DOM 监听会留着。 */
  destroy: () => void;
}

export interface CreateOptions {
  /** 挂载点。 */
  root: HTMLElement;
  /** 初始内容。 */
  initialMarkdown: string;
  /**
   * 文档变化回调。**已经在 Milkdown 的 `updated` 钩子里**——
   * 调用方拿到后仍要做去抖（见 `docs/03` §真相在哪）。
   */
  onChange?: (markdown: string) => void;
  /**
   * 只读（分屏模式右侧那个预览窗格用）。
   *
   * ⚠️ 只读时**必须同时不接 `onChange`**——见 `EditorPane.tsx` 里那段
   * "谁的话算数"，只读窗格改不了文本，报变化只会制造回声。
   */
  readOnly?: boolean;
  /**
   * **严格模式**（`Settings.strict_markdown`，默认 `false`）。
   *
   * `false`（宽松）时 `#标题` 也算标题——但**只是显示上算**：文档树里它还是
   * 普通段落，存盘存回原文（用户定的死规矩「如果关闭，存盘不要自动修复」，
   * 见 `atx.ts` 文件头）。挂的插件是 `宽松标题显示`。`true` 时一切照
   * CommonMark——也就是 Nota 2026-09-24 之前一直的行为。
   *
   * ⚠️ 改这个值等于**换了挂哪些插件**，所以它进了 `EditorPane` 那个 effect
   * 的依赖：换模式 = 把编辑器整个重建（不然手里这份还挂着旧模式的插件）。
   */
  strict?: boolean;
  /**
   * **数学公式里的 physics 宏包**（`Settings.enable_physics`，默认 `false`）。
   *
   * ⚠️ KaTeX **官方没有 physics**，所以这一档不是"加载一个扩展"，而是把
   * `math-macros.ts` 里那套**我们自己写的宏定义**塞进 `katexOptionsCtx`
   * （`@milkdown/plugin-math` 渲染时会 `ctx.get()` 它交给 `katex.render`）。
   *
   * ⚠️ 改这个值要**重建编辑器**：KaTeX 的宏是渲染那一刻查表的，
   * 已经画出来的公式不会自己回头重画。所以它和 `strict` 一样进了
   * `EditorPane` 那个 effect 的依赖。
   */
  physics?: boolean;
  /**
   * 光标状态变化的通知（工具栏高亮、菜单里表格那十条的灰/亮）。
   *
   * ⚠️ **不传就不挂那条插件**。只读那一侧（分屏的预览窗格）不需要它，
   * 传了也只是白算——预览窗格没有光标可言。
   */
  onCommandState?: (state: CommandState) => void;
  /**
   * 查找状态变化的通知（命中数、当前第几个）。**同样不传就不挂那条插件。**
   */
  onFindStatus?: (status: FindStatus) => void;
  /**
   * 建实例时两个写作开关（专注 / 打字机）的状态。**默认两个都关**。
   *
   * ⚠️ 它**不进** `EditorPane` 那个 effect 的依赖：拨开关走
   * `setWritingModes`，**不重建实例**——重建会丢撤销栈和光标，而这两个
   * 开关恰恰是写到一半才会想去拨的。这里只是"切编辑模式时新实例的初值"。
   */
  writingModes?: 写作模式;
}

/**
 * 建一个编辑器实例。
 *
 * 注意插件清单里**没有**什么，和有什么一样重要：
 * - 没有 `slash`（斜杠菜单）、没有 `block`（块手柄）、没有 `tooltip`
 *   ——这些是交互糖，排在后面对标的轮次里（见 `docs/07`）。
 *   先装它们会让我们在还没确定自己交互口径时就被它们的默认行为绑住。
 */
export async function createEditor(options: CreateOptions): Promise<EditorHandle> {
  const { root, initialMarkdown, onChange, readOnly = false, strict = false, physics = false } = options;
  // ⚠️ 单独取出来而不是解构：它可选，而 `.use([])` 与 `.use([插件])` 这两种
  // 写法在 Milkdown 里都是合法的——不传时给空数组，比给一个"什么都不做的
  // 插件"干净（后者每次事务都要跑一趟）。

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, initialMarkdown);

      // 序列化时**不要把行首的井号转义掉**（`#标签` 存成 `\#标签` 也是
      // "自动修复"，只不过换副面孔，用户没打那个反斜杠）。理由、边界与残留
      // 见 `lax-heading.ts` 第二段那个长注释。
      //
      // ⚠️ **两种模式都改**，不是只管宽松：那条转义只在"井号后面有空白"时
      // 才是有用的，而那种写法我们一个字都不碰（正则收得很紧）。两种模式都
      // 不改，用户看到的规律才简单——"**Nota 不会往你写的井号上加反斜杠**"。
      //
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
        // 不是"我们随便挑的"。要支持混用（有人爱写 `* 甲`）得自己写序列化器，
        // 那是另一件事——现在这条只能保证"**我们不会主动换掉它**"。
        //
        // ⚠️ `as const` 是**给类型的**，值没有变：`bullet` 在类型里是个联合
        // （`"-" | "*" | "+" | null | undefined`），而对象字面量里的 `"-"`
        // 会被**拓宽**成 `string`——不加这两个字，`tsc` 报两行
        // 「Type 'string' is not assignable to ...」。这一点在 2026-09-24 的
        // 一次 `tsc --noEmit` 里露出来了：**当时以为类型是过的，其实没过**。
        bullet: "-" as const,
        rule: "-" as const,
        handlers: { ...prev.handlers, text: 不转义行首井号(prev.handlers?.text) },
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
      // 之下完成——不靠正文区里有什么 id。上一版确实靠这个 id：那时叫
      // `typora-theme.ts`，把裸元素规则收进 `#write`。那个文件和整个
      // "兼容 Typora 主题"的链条已经被用户否掉并删掉了（版权，见 `docs/07` §4）。
      //
      // 那还留着它做什么：**给用户自己写的主题留一个钩子**。Typora 主题里
      // 大量使用 `#write h1` 这种写法，抄过来的人会带着它。留着这个 id，
      // 那些选择器被限域成 `.editor-pane #write h1` 之后仍然**命中**；
      // 删掉的话它们会静默失效——用户只会看到"我的主题一半没生效"。
      // ⚠️ 所以这不是死代码，**别顺手删**。
      //
      // ⚠️ 走 `editorViewOptionsCtx` 而不是建完之后去改 DOM：ProseMirror 重建 view
      // 时只会重放这里的属性，手动改的那一下会丢。
      // ⚠️ `attributes` 的类型允许是函数，这里只可能是对象形式，所以先归一化再展开。
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        // 只读：分屏里的预览窗格。⚠️ 用 ProseMirror 的 `editable`（它管的是
        // **能不能编辑**），不是 `editable` 之外的什么"禁用"。禁用会让内容变灰、
        // 还会吞掉选择与复制——而预览窗格恰恰要能选中、复制。
        editable: () => !readOnly,
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
        if (markdown !== prev) onChange?.(markdown);
      });
    })
    .use(commonmark)
    .use(gfm)
    // ⚠️ 在 `commonmark` 之后即可（它只是往 mdast 上多挂一个变换），
    // 但**必须在 `.create()` 之前**：mdast → ProseMirror 那一步发生在建实例时，
    // 建完了再挂就等于没挂。**只读的那一份也要挂**（分屏预览、导出），
    // 那两处同样会把 markdown 变成文档。
    .use(补全图片属性)
    .use(history)
    .use(listener)
    .use(cursor)
    .use(clipboard)
    .use(indent)
    .use(trailing)
    .use(instantRender)
    .use(taskList)
    .use(codeBlockView)
    .use(prism)
    .use(math)
    .use(diagram)
    // 宽松模式才挂这个装饰（严格模式的定义就是"井号后必须有空格"，那时
    // `#你好` 就该是一段普通正文）。它只改显示、**不动文档**——理由见
    // `lax-heading.ts` 文件头。
    .use(strict ? [] : [宽松标题显示])
    // 盯着光标那一条。**只读**，见 `command-state.ts`。
    .use(options.onCommandState ? [光标状态插件(options.onCommandState)] : [])
    // 查找。⚠️ **和上面那条一样是可选的**：分屏右侧那个只读预览窗格
    // 不挂（它没有光标、也不会被查找），不传就少一条插件。
    .use(options.onFindStatus ? [查找插件(options.onFindStatus)] : [])
    // 专注 / 打字机。**恒挂**（可编辑那一份）：两个开关随时可能被拨，
    // 而"挂不挂插件"一旦绑进 `EditorPane` 的依赖，拨一下就得重建实例。
    // 只读的预览窗格不挂——那边没有光标，也没有"正在写的那一段"。
    .use(readOnly ? [] : [写作模式插件(options.writingModes)])
    .create();

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

  return {
    getMarkdown: () =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const serializer = ctx.get(serializerCtx);
        return serializer(view.state.doc);
      }),

    setMarkdown: (markdown: string) => {
      // ⚠️ **原样**装进去：外来的文本（换文档、插件改文档、分屏推给预览）
      // 一个字符都不能被顺手改掉——存盘存的是编辑器序列化出来的东西。
      // 宽松模式认标题靠的是显示层的装饰，不是"先把文本补好"（见 `atx.ts`）。
      editor.action(replaceAll(markdown));
    },

    focus: 聚焦,

    setWritingModes: (模式: 写作模式) =>
      editor.action((ctx) => 设写作模式(ctx.get(editorViewCtx), 模式)),

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

    runCommand: (name: EditorCommand, payload?: CommandPayload) => {
      if (isHeading(name)) {
        editor.action(callCommand(wrapInHeadingCommand.key, Number(HEADING_RE.exec(name)![1])));
      } else {
        COMMANDS[name](editor, payload);
      }

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
  text: (e) => e.action(callCommand(turnIntoTextCommand.key)),
  quote: (e) => e.action(callCommand(wrapInBlockquoteCommand.key)),
  ul: (e) => e.action(callCommand(wrapInBulletListCommand.key)),
  ol: (e) => e.action(callCommand(wrapInOrderedListCommand.key)),
  task: (e) => 转成任务列表(e),
  codeBlock: (e) => e.action(callCommand(createCodeBlockCommand.key)),
  hr: (e) => e.action(callCommand(insertHrCommand.key)),

  // ⚠️ **表格插的是 3 × 3**，不是 Typora 那种"先弹个框问行列数"。
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
