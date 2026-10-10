/**
 * 编辑区：把编辑器实例接进 React 生命周期，并按当前**模式**摆一到两个窗格。
 *
 * ⚠️ **React 不该管编辑器内部的 DOM**。所见即所得那半由 Milkdown（ProseMirror）
 * 独占、源码那半由 CodeMirror 独占，React 只负责"什么时候挂上去、什么时候拆掉、
 * 摆几个"。想让 React 去 diff 编辑区的内容，两边会互相覆盖——这类 bug 表现为
 * "打着字光标突然跳走"，而且极难复现。所以这里用**从不重新渲染的空 div**
 * 当挂载点，内容变化一律走命令式通道。
 *
 * # 三种模式
 *
 * | 模式 | 左边 | 右边 | 谁的话算数 |
 * |---|---|---|---|
 * | `wysiwyg` | Milkdown（可编辑） | — | Milkdown |
 * | `source` | CodeMirror（可编辑） | — | CodeMirror |
 * | `split` | CodeMirror（可编辑） | Milkdown（**只读**预览） | CodeMirror |
 *
 * # ⚠️ 分屏为什么只有一个方向
 *
 * 两个窗格**不互推**：源码改动单向推给预览（去抖），预览**从不**往回写。
 * 理由是往返会改字——Milkdown 把 Markdown 解析成文档树再序列化回来未必逐字节
 * 相同（尾段、空行、标记写法都被规范化，BUG-12 的根因候选之一），互推会让
 * 用户的原文被另一侧"改写"，而且每推一次都可能再规范一遍。完整理由见
 * `editor/source.ts` 文件头。
 *
 * 所以预览窗格是**只读**的，这既是产品选择也是正确性要求：界面上不假装
 * 那边能改。
 *
 * # ⚠️ 切模式时文本怎么不丢
 *
 * 模式一变，那两个实例是**换掉**（不是复用）——ProseMirror 的撤销栈与
 * CodeMirror 的完全不是一回事，硬接只会得到一个"撤销会跳到另一个编辑器的历史里"
 * 的怪物。所以：
 *
 * 1. 新实例的初始文本取 `latestRef`（**不是** `doc.text`）——后者被 300ms 去抖
 *    拖着，用户打完最后一个字立刻切模式就会丢掉那几个字；
 * 2. `latestRef` 在 `onChange` 里就更新，另外**卸载时再从活着的实例同步读一次**
 *    （见清理函数），把去抖窗口里那最后一截也捞住。
 *
 * # 这个文件里剩什么、别的都在哪儿
 *
 * 2026-10-07 拆过一刀（`docs/07` 第 89 项，那天它 1171 行）。留下的是**只有
 * 这个组件知道的事**：属性契约（`Props`）、对外的 13 条命令（`EditorPaneHandle`）、
 * 那一个建实例/拆实例的 effect、以及外面那层 DOM。搬走的是成体系的几件事：
 *
 * | 搬去了哪儿 | 搬走的是什么 |
 * |---|---|
 * | `ui/FrontMatterBanner.tsx` | 正文上方那条 front matter 横幅（读 / 改 / 删 / 两击确认） |
 * | `ui/pane-editors.ts` | 三个实例各传哪些选项（"哪一侧传 `physics`"那些判断） |
 * | `ui/useEditorSettings.ts` | `settings.markdown` → 编辑器要的那三个值（含记忆化） |
 * | `ui/useEditorHandle.ts` | 13 条命令怎么落到活着的那两个实例上 |
 * | `ui/useCursorSnapshot.ts` | 选区快照 → 后端那条 250ms 的去抖 |
 * | `ui/table-widths.ts` | 表格列宽侧车的读与写 |
 *
 * ⚠️ 边界是**搬出去的那几件事别再搬回来**：想往里加"横幅里某个按钮"或者
 * "某一侧多传一个选项"的时候，去上表那一份改——两个地方各写一半的话，
 * 症状会是"改了没用"或者"改了一边、另一边没跟上"。
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";

import {
  api,
  type Document,
  type DocumentSettings,
  type MarkdownSettings,
  type PluginReviewDiff,
  type ViewMode,
} from "@/bridge/ipc";
import { 正文排版变量 } from "@/styles/doc-typography";
import { useT } from "@/i18n";
import type { 预览看法 } from "@/editor/review";
import {
  type CommandPayload,
  type EditorCommand,
  type EditorHandle,
  type 选区内容,
} from "@/editor/create";
// 开头那段 front matter 的横幅（`docs/07` 第 64 项）。⚠️ 那一段的切片、拼回、
// 判据、模板在 `editor/front-matter.ts` 里，横幅本身（读、改、删、两击确认）
// 在下面这一份里——2026-10-07 整块搬出去的，见那边文件头。
import { FrontMatterBanner, type FrontMatterBannerHandle } from "@/ui/FrontMatterBanner";
import type { CommandState } from "@/editor/command-state";
// 三种行内扩展的开关（`==高亮==` / `^上标^` / `~下标~`）与智能标点那六个字段：
// 拼装与记忆化都在 `useEditorSettings.ts` 那一份里（⚠️ 2026-10-07 整块搬过去的，
// `docs/07` 第 89 项），这里只收结果——**为什么要收整份设置、为什么要 `useMemo`，
// 写在那边文件头**。
import { use编辑器开关 } from "@/ui/useEditorSettings";
// 13 条命令的转发（`EditorPaneHandle`）。⚠️ 2026-10-07 搬出去的，见那边文件头。
import { use编辑器句柄 } from "@/ui/useEditorHandle";
// 选区快照 → 后端（那条 250ms 的去抖与"拆的时候要清定时器"都在里面）。
import { use选区快照 } from "@/ui/useCursorSnapshot";
// 表格列宽侧车那两跳（`docs/07` 第 26 项那批）。⚠️ 2026-10-07 搬出去的。
import { 存表格列宽, 读表格列宽 } from "@/ui/table-widths";
import type { 写作模式 } from "@/editor/writing-modes";
import { 空查找状态, type FindOptions, type FindStatus } from "@/editor/find";
import { 恢复滚动比例, 读滚动比例 } from "@/editor/scroll-into-view";
import type { SourceHandle } from "@/editor/source";
// 三个实例各传哪些选项（"哪一侧要 `physics`、哪一侧不传 `自动更正`"那些判断）。
// ⚠️ 2026-10-07 从下面那个大 effect 里整块搬出去的，见那边文件头。
import { 建源码编辑器, 建所见即所得编辑器, 建预览编辑器 } from "@/ui/pane-editors";

export interface EditorPaneHandle {
  getMarkdown: () => string | undefined;
  setMarkdown: (markdown: string) => void;
  /**
   * 跑一条编辑命令。菜单栏、快捷键与格式化工具栏都走这里。
   *
   * ⚠️ **返回它在这条通路上有没有实现**（见 `EditorHandle.runCommand`）：
   * 所见即所得恒 `true`，源码模式里表格那十条与"没填地址的链接/图片"
   * 会给 `false`。调用方据此提示用户——按钮按下去要有反应。
   */
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;

  /* 查找五条。⚠️ **两种模式都有**（所见即所得走 `editor/find.ts`，源码走
   * `editor/source.ts` 里那套 CM 状态字段），所以这里不必判模式。
   * 口径只有一份：匹配逻辑都在 `find.ts` 的纯函数里。 */
  setFind: (query: string, options: FindOptions) => void;
  findStep: (方向: 1 | -1) => void;
  clearFind: () => void;
  replaceCurrent: (text: string) => boolean;
  replaceAll: (text: string) => number;

  /**
   * 跳到大纲里第 `index` 个标题（0 起）。侧栏大纲点一下就走这里
   * （`docs/07` §3 第 48 项）。
   *
   * ⚠️ 两个坐标都要给：源码模式用 `line`、所见即所得用 `index`，
   * 理由写在 `create.ts` 的 `EditorHandle.跳到标题` 那段。
   */
  跳到标题: (目标: { line: number; index: number }) => void;

  /**
   * 当前选中的内容（「复制」「剪切」要它，见 `ui/useClipboard.ts`）。
   * 没选中东西给 `null`。
   */
  选区: () => 选区内容 | null;

  /**
   * **在光标处插一段**（替换选区）。给插件的 `nota.document.insert_at_cursor`
   * 用（`docs/07` 第 14 项）。
   *
   * ⚠️ 与 `runCommand` 同一套契约：**返回值是"这一侧有没有实现"**，
   * 没实现（只读实例）或编辑器还没建好时给 `false`，不抛错。
   */
  插入在光标处: (text: string) => boolean;

  /** 把焦点交回编辑区。关查找条、关菜单之后要用（焦点在别处时打的字是白打）。 */
  focus: () => void;
}

interface Props {
  doc: Document;
  /** 当前**实际**编辑模式，来自 `App.tsx` 的 `viewMode`（家在那条会话内 `useState`，这里已经过完降级）。 */
  mode: ViewMode;
  /**
   * **严格模式**，来自 `settings.strict_markdown`。
   *
   * ⚠️ 它**只喂给源码模式那一侧**（`createSourceEditor` 的 `atxPrefixRe`）
   * 和下面那个 effect 的依赖：所见即所得一侧两种模式已经完全一样了
   * （宽松标题那条显示层装饰 2026-09-26 删掉了，见 `create.ts`）。
   * ⚠️ 依赖还是必须进：源码模式是**建实例时捕获**严格模式的，不重建的话
   * 用户改了设置得先切一次文档才生效——那种"设置像没生效"的毛病最难被当成
   * bug 报上来。大纲与标签页标题另有两处，不靠重建（`ui/outline.ts` 每次
   * 现算、后端 `set_strict_markdown` 当场重算）。
   */
  strict: boolean;
  /**
   * **数学公式里的 physics 宏包**，来自 `settings.enable_physics`。
   *
   * ⚠️ 理由同 `strict`：它换的是**交给 KaTeX 的那份宏表**，而 KaTeX 是在
   * 渲染那一刻查表的。不进依赖的话，用户拨了开关得先切一次文档才生效——
   * 那种"设置像没生效"的毛病最难被当成 bug 报上来。
   */
  physics: boolean;
  /**
   * **这一份不是 Markdown**（`editor/file-kind.ts::认文件类型`），源码模式
   * 不该给它套 Markdown 文法与配色。
   *
   * ⚠️ **它由 App 算好递进来，这里不自己看路径**：判据在 `file-kind.ts`
   * （名字 ＋ 大小两条）、受理在 `App.tsx`（用户手动切模式要解除），
   * 这里只当一根管子。放进这个文件的话，"哪些文件被降级"就有了第二个答案。
   *
   * ⚠️ **只在源码那一侧起作用**（`createSourceEditor`）：降级之后模式一律是
   * `source`（`实际模式`），所见即所得那一侧照常解析——真走到这一侧时说明
   * 用户刚手动切了模式，那正是"我要按 Markdown 看它"的意思。
   * 但它**仍要进下面那个 effect 的依赖**：文法与配色是建实例时挂上去的，
   * 不重建的话这份文件得先切一次文档才换过来。
   */
  纯文本?: boolean;
  /**
   * **Emoji 输入辅助**，来自 `settings.editor.emoji_autocomplete`。
   *
   * ⚠️ 与 `markdown` 那一格相反，这里**只收一个布尔**：它只喂给
   * `createEditor` 的 `emoji` 一个格子（短代码替换 ＋ 补全面板两件事都由
   * 它管，理由见 `create-types.ts`），不像 Markdown 那一页要拼成两个对象。
   *
   * ⚠️ 同样**必须进下面那个 effect 的依赖**：它换的是 `.use()` 链上的两条
   * 输入规则与一条插件，而那串链是建实例时定死的。不进依赖的话，用户拨了
   * 开关得先关掉这份文档再打开才生效——"设置像没生效"。
   */
  emoji: boolean;
  /**
   * **智能符号补全**，来自 `settings.editor.smart_symbols`（2026-09-28，**默认开**）。
   *
   * ⚠️ 同 `emoji` 那一格：只收一个布尔，原样喂给 `createEditor` 的
   * `智能符号` 那一格——关掉是 `editor/auto-pair.ts` **整条插件不装**
   * （补一对 / 跳过 / 空对退格 / `Tab` 跳出右半边四件事一起走，理由见
   * `create-types.ts` 的 `智能符号` 那一格）。
   *
   * ⚠️ **必须进下面那个 effect 的依赖**：它换的是 `.use()` 链上的一条插件，
   * 而那串链是建实例时定死的。不进依赖的话，用户拨了开关得先关掉这份文档
   * 再打开才生效——"设置像没生效"。
   */
  智能符号: boolean;
  /**
   * **整整一页 Markdown 设置**（`settings.markdown`），`undefined` = 设置还没
   * 从后端读回来。
   *
   * ⚠️ 这里**只用它里面十一个字段**：三个行内扩展开关（`highlight` /
   * `superscript` / `subscript`）、智能标点那六个（`smart_punctuation` /
   * `smart_quotes` / `smart_quotes_double` / `smart_quotes_single` /
   * `smart_dashes` / `dash_style`）、以及 `auto_correct`（2026-09-27 加）。
   * 其余字段本组件一概不读。**故意收整份而不是收一堆零星布尔值**：那些要拼成
   * 两个对象才能喂给 `createEditor`，而"每次渲染新建一个对象字面量"会让下面
   * 那个 effect **每帧重建编辑器**（丢撤销栈、丢光标）。拼装和记忆化在
   * `ui/useEditorSettings.ts` 里做一次（⚠️ 2026-10-07 从本组件搬出去的），
   * `App.tsx` 那边就只剩一行——它已经在 1000 行硬线上了，多一行都是债。
   *
   * ⚠️ 下划线**不在**这三个开关里：它恒开（走 HTML 标签，与 CommonMark 不
   * 冲突，见 `editor/inline-marks.ts` 里那条 `设置键: null`）。
   *
   * ⚠️ 这三类**必须进下面那个 effect 的依赖**，理由和 `strict` / `physics`
   * 一样：它们换的是 `.use()` 链里挂的几个插件（输入规则 + `$remark` 转换器），
   * 而那串链是**建实例时定死的**。不进依赖的话，用户拨了开关得先关掉这份文档
   * 再打开才生效——"设置像没生效"。
   */
  markdown?: MarkdownSettings;
  /**
   * 专注模式 / 打字机模式（视图菜单里那两个开关）。
   *
   * ⚠️ 它们**不进下面那个 effect 的依赖**：拨开关走 `setWritingModes`，
   * **不重建实例**——重建会丢撤销栈和光标，而这两个开关是"写到一半
   * 才想去拨"的东西。下面那份 ref 只在**新建实例**时当初始值用。
   */
  focusMode: boolean;
  typewriter: boolean;
  /**
   * 这份文档**上次滚到哪儿**（`0.0`~`1.0` 的比例），`undefined` = 没记过。
   *
   * ⚠️ **只在建实例那一刻读一次**，不进下面那个 effect 的依赖（理由同
   * `focusMode`）：跟着变的话，用户每滚一下都会重建编辑器——撤消栈和光标全丢。
   * 记账与落盘在 `ui/useSession.ts`，这里只管"打开时回到那儿"。
   *
   * ⚠️ 存在外面的是**比例不是像素**，理由见 `editor/scroll-into-view.ts`。
   */
  初始滚动?: number;
  /**
   * 用户滚动时报告当前位置（比例）。
   *
   * ⚠️ **本组件不做去抖、也不落盘**：那是调用方的事（`ui/useSession.ts`
   * 那边去抖 500ms 再写侧车）。这里每滚一下就报一次，走的是 ref，
   * 所以调用方的函数身份换了也不会重建编辑器。
   */
  onScroll?: (比例: number) => void;
  /**
   * 「正文宽度」那一格（px，`settings.content_width`）。
   * ⚠️ **它只在 `limitTextWidth` 开着时才写进 CSS**——见下面那个 prop。
   */
  contentWidth: number;
  /**
   * 拼写检查用的语言（`settings.editor.spellcheck_lang`，enchant 那套 `zh_CN`）。
   *
   * ⚠️ 它只写正文那一层 `contenteditable` 的 **`lang` 属性**——而**挑词典的不是
   * 它**：这一版 Linux 上真正决定用哪本词典的是 WebKitGTK 那个
   * `spell-checking-languages`（`ui/useSpellcheck.ts` ＋ `commands/webview.rs`，
   * 2026-10-10 读 WebKit 源码确认）。`lang` 是**文档语言的正当声明**
   * （断词、朗读、别的内核），顺手补上而己。
   *
   * ⚠️ 写的是**连字符**形式（`zh_CN` → `zh-CN`）：`lang` 那条 HTML 属性按
   * BCP-47 认，下划线那是 enchant 的写法，两者不是一回事。
   *
   * ⚠️ 它**不进下面那个 effect 的依赖**：改它只是重渲染一次那个 `<div>`
   * （同 `contentWidth`），**不重建编辑器**——重建会丢撤销栈和光标。
   *
   * `undefined` = 设置还没读回来（那时不写这个属性）。
   */
  拼写语言?: string;
  /**
   * **限制正文宽度**（`settings.limit_text_width`，2026-10-09）。默认 `false`。
   *
   * ⚠️ 关着时**不写 `--content-width`**，`editor.css` 那条 `max-width` 落到
   * `none` ⇒ 正文列铺满编辑区（两侧各 56px 装订线）。开着时才用它，
   * 而且**只卡块级子元素**——`hr` 永远铺满整行（用户 2026-09-26 要的）。
   */
  limitTextWidth: boolean;
  /**
   * 「文档主题」那一页那四个可调项（`settings.document`，2026-09-27）。
   * `undefined` = 设置还没从后端读回来——那时**一个变量都不写**，
   * 让文档主题（或 `editor.css` 的兜底值）说话。
   *
   * ⚠️ **收一整个对象，不收四个数**（同上面 `markdown` 那一格的理由）：它们
   * 要一起变成一组 CSS 变量、写在同一处（`styles/doc-typography.ts` 算好），
   * 摊成四个 props 只会让 `EditorArea` 那边多四行"哪一件来自谁"的账。
   *
   * ⚠️ 它**不进下面那个 effect 的依赖**，而且**不该进**：这四项落地走的是
   * CSS 变量（写到 `.editor-pane` 的内联 style 上），改一下当场重渲染就生效，
   * **不重建编辑器**——重建会丢撤销栈和光标，而用户调行距的时候正在打字。
   * 上面 `markdown` 那一格正相反（它换的是 `.use()` 链），两者别写串。
   *
   * ⚠️ 为什么写在这一层而不是 `<html>` 上（像主题色那样）：文档主题的声明
   * 就在 `.editor-pane` 这一层，靠继承盖不过它。理由见 `settings/document.rs`
   * 文件头最后一段，别改到 `applyTheme.ts` 里去。
   */
  文档排版?: DocumentSettings;
  /**
   * 光标状态变化（工具栏高亮、菜单里表格那十条的灰/亮）。
   *
   * ⚠️ **源码模式与"还没有文档"时给 `null`**，不是给一份空状态——
   * 两者含义不同：`null` 是"这条通路读不出来"，而空状态是"读出来了，
   * 光标在普通段落上"。工具栏对这两种情况的反应不一样（见 `FormatBar.tsx`）。
   */
  onCommandState: (state: CommandState | null) => void;
  /** 查找状态（命中数、当前第几个）。关掉查找条时调用方自己清。 */
  onFindStatus: (status: FindStatus) => void;
  onToast: (message: string, level?: "info" | "warn" | "error" | "success") => void;
  onDocsChanged: () => Promise<unknown>;
  /**
   * 内容**变了**（每一次，不走去抖）。
   *
   * 现在只有一个用处：自动保存的"停笔"判据（`ui/useAutosave.ts` 记的是最后
   * 一次活动时刻）。⚠️ 它**必须在去抖之前**调——去抖那 300ms 是给"推给后端"
   * 用的，跟"用户什么时候停的手"是两件事。
   */
  onActivity: () => void;
  /**
   * **就地改动预览**（`nota.ui.review_diff`，见 `editor/review.ts`）。
   *
   * ⚠️ 编辑器这一侧**不认识插件**：它只拿到"一份目标文本 + 标题"，连
   * "这是 AI 提的改动"都不知道。那条边界是有意的——预览怎么画是编辑器的事，
   * 谁提的、接受之后干什么，全是插件与 `App` 的事。
   *
   * ⚠️ 它**不进下面那个 effect 的依赖**（同 `focusMode` 那条）：进来了就等于
   * "每来一次预览都重建编辑器"，撤销栈和光标全丢。建实例时的初值走
   * `预览Ref`，活了之后走 `setReview`。
   */
  review?: PluginReviewDiff | null;
  /**
   * 现在看哪一面（"对比" / "改后"）。
   *
   * ⚠️ 状态在 `App` 手里**不在这里**：顶上那条细条（`ui/ReviewBar.tsx`）
   * 是它的按钮，而细条与编辑区是兄弟——两边都得知道现在哪一面，
   * 那份状态就只能在他们共同的那一层。
   */
  预览看法: 预览看法;
  /** 用户在正文里按了 `Esc`。收起来那件事由 `App` 决定怎么做（见那边）。 */
  onReviewEscape?: () => void;
  ref?: Ref<EditorPaneHandle>;
}

/** 推给后端的去抖间隔。见 `docs/03` §真相在哪。 */
const SYNC_DEBOUNCE_MS = 300;
/** 分屏里把源码推给预览的去抖。比 sync 短——那是本地的，不跨 IPC。 */
const PREVIEW_DEBOUNCE_MS = 150;
// ⚠️ 第三档「选区快照」那条（250ms）在 `useCursorSnapshot.ts` 里，第四档
//「横幅那颗删除等第二下」那条（4 秒）在 `FrontMatterBanner.tsx` 里——两处都
// 是 2026-10-07 跟着各自的代码搬出去的，别在这里再写一份。

export function EditorPane({
  doc,
  mode,
  strict,
  physics,
  纯文本 = false,
  emoji,
  /* 说明书在 `Props` 上那一份 `智能符号` 里（这里不抄第二份）。 */
  智能符号,
  markdown,
  focusMode,
  typewriter,
  初始滚动,
  onScroll,
  contentWidth,
  limitTextWidth,
  拼写语言,
  文档排版,
  onCommandState,
  onFindStatus,
  onToast,
  onDocsChanged,
  onActivity,
  review,
  预览看法,
  onReviewEscape,
  ref,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<EditorHandle | SourceHandle | null>(null);
  const previewHandleRef = useRef<EditorHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  /** 最后一次知道的文本。切模式时用它当新实例的初始值。 */
  const latestRef = useRef(doc.text);
  const [ready, setReady] = useState(false);
  // ── 正文上方那条 front matter 横幅（`docs/07` 第 64 项）──────────────
  // ⚠️ 它自己那份状态（输入框里正在打的字、两击确认、基准）全在
  // `FrontMatterBanner.tsx` 里（2026-10-07 搬出去的）。这里只留一根管子：
  // 把"编辑器报来的文本"推给它、把"用户改了那一段"转成一条编辑器命令。
  const 横幅Ref = useRef<FrontMatterBannerHandle>(null);
  const t = useT();

  // ⚠️ 光标状态那条回调**走 ref 读**，不进下面那个 effect 的依赖：
  // 它来自 `App`，而 `App` 每次重渲染都可能给出一个新的函数身份。
  // 进了依赖就等于"每次光标动一下都重建编辑器"——灾难。
  const commandStateRef = useRef(onCommandState);
  commandStateRef.current = onCommandState;
  // 查找那条同理（同一份理由：它是 `App` 每次渲染新建的函数）。
  const findStatusRef = useRef(onFindStatus);
  findStatusRef.current = onFindStatus;
  // 活动那条同理（`useAutosave` 返回的那个函数是 `useCallback`，但这条规矩
  // 不该靠调用方去守——照上面两条走）。
  const 活动Ref = useRef(onActivity);
  活动Ref.current = onActivity;

  // 选区快照 → 后端（`docs/07` 第 14 项）。⚠️ 去抖、那次推送、以及"拆的时候
  // 为什么必须清掉那个定时器"，都在 `useCursorSnapshot.ts` 里（2026-10-07 搬
  // 出去的）；这里只拿两件事：报一份快照、拆的时候清一次。
  const { 记快照, 清快照定时 } = use选区快照(doc.id);

  // 滚动那两条同理（`初始滚动` 只在建实例那一刻读一次，见 `Props` 那条）。
  const 初始滚动Ref = useRef(初始滚动);
  初始滚动Ref.current = 初始滚动;
  const 滚动回调Ref = useRef(onScroll);
  滚动回调Ref.current = onScroll;

  // ── 设置 → 编辑器要的三个值（`useEditorSettings.ts`，2026-10-07 搬出去的）──
  // ⚠️ 这两个对象只有**内容真的变了**才换身份——下面那个建实例的 effect 拿它们
  // 当依赖，每帧新建一个的话会每帧重建编辑器（丢撤销栈、丢光标）。这条纪律
  // 现在归 `useEditorSettings.ts` 文件头管，这里只管用。
  const { 行内扩展, 标点, 自动更正 } = use编辑器开关(markdown);

  // 两个写作开关。⚠️ 同上：拨开关**不重建实例**，所以它只能走 ref 读。
  const 写作模式Ref = useRef<写作模式>({ focus: focusMode, typewriter });
  写作模式Ref.current = { focus: focusMode, typewriter };

  // 拨开关 → 通知活着的那个实例。⚠️ **建实例那一刻是没 handle 的**，
  // 所以这一句在挂载时是空跑——那种情况由"建实例时把当前值传进去"兜住
  //（见下面两处 `writingModes`）。
  useEffect(() => {
    handleRef.current?.setWritingModes({ focus: focusMode, typewriter });
  }, [focusMode, typewriter]);

  // 预览那一份的"建实例时的初值"。⚠️ 同 `写作模式Ref` 的理由与写法（见 `Props`
  // 里 `review` 那条）：不进下面那个 effect 的依赖，不然每来一次预览都要重建
  // 编辑器。⚠️ 退出那条也走 ref：句柄活着的时候会一直攥着建实例时那个闭包，
  // 直接传函数的话，`App` 每次重渲染给的新身份它都用不上。
  const 预览Ref = useRef<PluginReviewDiff | null>(review ?? null);
  预览Ref.current = review ?? null;
  const 退出Ref = useRef(onReviewEscape);
  退出Ref.current = onReviewEscape;

  // 预览来了 / 收了 / 换看法了 → 推给活着的那个实例。
  // ⚠️ 依赖里**没有 `ready`**：重建之后那一份由"建实例时的初值"接手（`预览Ref`），
  // 加了 `ready` 反而会在"实例还没建好"那一帧里对着 null 空跑一次。
  useEffect(() => {
    handleRef.current?.setReview(review ?? null, 预览看法);
  }, [review, 预览看法]);

  // ⚠️ **分屏右格（预览）也要跟着 review 走**（2026-09-26，用户截图那句
  // 「这里的小问题，修复下」：切到「改后效果」之后，右格只有一个空标题的
  // 占位徽章「H2」，改后的正文一个字都没有）。
  //
  // 根因：右格只有 `pushPreview` 一条路（源码改动时推），而**预览期文档是
  // 锁住的**（`review-prose.ts` / `review-source.ts` 里那条 `filterTransaction`），
  // 源码一个字节都不动 ⇒ 右格永远停在"打开这份文档那一刻"的内容。用户看到的
  // 就是"点了改后效果，右格什么都没变"——他那份文档当时只有一块空标题，
  // 于是右格上就只剩那个 `H2` 徽章。
  //
  // 推的是 `改动预览.text`——**目标文本**，也就是"应用之后该长什么样"
  // （`editor/review.ts` 里那条接口的注释：不是补丁、不是 hunk）。收起预览
  // （`review` 变 `null`）时推回当前文档，右格跟着回到原样。
  //
  // ⚠️ 依赖**只有 `review`**，不含 `预览看法`：两种看法是**同一个**改动的两种
  // 画法，目标文本一个字都没变；跟着重推一次只会让右格白闪一下、滚动位置跳回
  // 顶部（`setMarkdown` 是整篇替换）。
  // ⚠️ `latestRef` **故意不进依赖**（同上面 `预览Ref` 那条理由）：进了就等于
  // "每敲一个字都重推一遍右格"。
  // ⚠️ 只读预览实例**不接 `onChange`**，所以这一推不会形成回声（`EditorPane`
  // 文件头第 2 条：往预览接 `onChange` 就是回声）。
  useEffect(() => {
    previewHandleRef.current?.setMarkdown(review ? review.text : latestRef.current);
  }, [review]);

  // 把 handle 暴露给 App（存盘前要强制同步、插件改文档时整篇替换）。
  // ⚠️ 13 条命令的转发与"没实例时给什么"那套兜底都在 `useEditorHandle.ts`
  // 那一份里（2026-10-07 搬出去的）；这里只把三个 ref 交进去。
  use编辑器句柄({
    ref,
    主句柄Ref: handleRef,
    预览句柄Ref: previewHandleRef,
    最新文本Ref: latestRef,
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let handle: EditorHandle | SourceHandle | null = null;
    let preview: EditorHandle | null = null;

    /** 源码 → 预览。⚠️ 单向，见文件头。 */
    const pushPreview = (markdown: string) => {
      if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = window.setTimeout(() => {
        previewTimerRef.current = null;
        previewHandleRef.current?.setMarkdown(markdown);
      }, PREVIEW_DEBOUNCE_MS);
    };

    /**
     * 编辑器报来"文本变了" → 认下来、跟前端说一声、并去抖推给后端。
     *
     * ⚠️ **两种模式共用这一份**（2026-10-04 合并）：原来所见即所得与源码各写
     * 一遍，差别只在"分屏那一侧要不要推预览"——而那一条按 `mode` 判得出来。
     * 两遍的代价是"往这条路里加一件事就得加两处"，第 64 项那一段正是第一件。
     *
     * ⚠️ 这条路上还有两件事**不在这里**：横幅（那段 front matter 的显示）推给
     * `FrontMatterBanner`（`横幅Ref.current?.同步`），选区快照推给
     * `useCursorSnapshot`（编辑器那一侧直接接在 `onSelection` 上）。
     */
    const 认改动 = (markdown: string) => {
      latestRef.current = markdown;
      活动Ref.current();
      横幅Ref.current?.同步(markdown);
      if (mode === "split") pushPreview(markdown);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(async () => {
        timerRef.current = null;
        try {
          await api.doc.sync(doc.id, markdown);
          await onDocsChanged();
        } catch (e) {
          onToast(t("Could not sync to the backend: {0}", String(e)), "error");
        }
      }, SYNC_DEBOUNCE_MS);
    };

    (async () => {
      try {
        // ── 权威那一侧 ────────────────────────────────────────────────
        // ⚠️ 初始文本取 `latestRef` 而不是 `doc.text`，理由见文件头第 1 条。
        const initial = latestRef.current;
        // 这一段横幅的**初值**（见 `FrontMatterBanner` 的 `同步` 那一格）。⚠️ 判的
        // 是**这一份**初始文本，与 `createEditor` 里切的是同一串（同一个纯函数，
        // 判据只有一份）。⚠️ 基准与"上一次见到的"都要一起摆好（那边摆）：摆漏了
        // 的话，编辑器报回来的第一笔就会被当成"文档里那一段变了"，把输入框重填
        // 一遍。⚠️ 这里给的第二个实参 `false` = **不要摊开**，理由见那一条。
        横幅Ref.current?.同步(initial, false);

        if (mode === "wysiwyg") {
          // ── 表格列宽（侧车）─────────────────────────────────────────
          // ⚠️ 读那一跳（"没有路径就不查"、"读失败按自动排版显示"）在
          // `ui/table-widths.ts` 里（2026-10-07 搬出去的）。
          const 列宽 = await 读表格列宽(doc.path);
          // ⚠️ 上面这个 `await` 之后要重判一次 `disposed`：建编辑器本身也是
          // await，中间隔着一次 IPC 就多一个"effect 已经拆了、这里才回来"的
          // 窗口（StrictMode 下一定会撞上）。
          if (disposed) return;

          handle = await 建所见即所得编辑器({
            root: mount,
            initial,
            列宽,
            // ⚠️ "没有 `doc.path` 就一个字都不存"在 `ui/table-widths.ts` 里。
            onTableResize: (表) => 存表格列宽(doc.path, 表),
            strict,
            physics,
            行内扩展,
            标点,
            自动更正,
            emoji,
            智能符号,
            写作模式: 写作模式Ref.current,
            预览: 预览Ref.current,
            onReviewEscape: () => 退出Ref.current?.(),
            onCommandState: (s) => commandStateRef.current(s),
            onFindStatus: (s) => findStatusRef.current(s),
            onSelection: 记快照,
            onChange: 认改动,
          });
        } else {
          // source 与 split 的左侧是同一个东西，只是 split 多一个预览窗格。
          // ⚠️ 源码这一侧**明确报 `null`**（不是空状态）：CodeMirror 手里
          // 就是文本，没有文档树可读，工具栏据此不画任何高亮。
          commandStateRef.current(null);
          handle = 建源码编辑器({
            root: mount,
            initial,
            strict,
            纯文本,
            写作模式: 写作模式Ref.current,
            预览: 预览Ref.current,
            onReviewEscape: () => 退出Ref.current?.(),
            onFindStatus: (s) => findStatusRef.current(s),
            onSelection: 记快照,
            onChange: 认改动,
          });
        }

        // StrictMode 下 effect 会跑两遍：第一遍的实例如果已经建好了，
        // 这一遍就得把它拆掉，不然页面上会有两个编辑器。
        if (disposed) {
          handle.destroy();
          return;
        }

        handleRef.current = handle;

        // ── 分屏右侧那个只读预览 ──────────────────────────────────────
        // ⚠️ 它**不接 onChange、不 settle、不 focus**：它是显示端，不是输入端。
        // 接了 onChange 就会形成回声（见 `create.ts` 里 `readOnly` 那段）。
        if (mode === "split" && previewRef.current) {
          preview = await 建预览编辑器({
            root: previewRef.current,
            initial,
            strict,
            physics,
            行内扩展,
            标点,
          });
          if (disposed) {
            preview.destroy();
            previewHandleRef.current = null;
            return;
          }
          previewHandleRef.current = preview;
        }

        setReady(true);
        // ⚠️ 是 `focusAtStart` 不是 `focus`（2026-09-26，用户：「我最开始进入的
        // 时候找不到光标」「默认开头光标位置也不要变」）。`focus` 只把焦点交过来，
        // 插入点在哪儿由上一个事务决定——而 `trailing` 插尾段、`replaceAll`
        // 换全文**都会把插入点带到文末**，于是"打开一篇长文档，光标在屏幕外"。
        // 理由与两条机制写在 `EditorHandle.focusAtStart` 的注释里。
        handle.focusAtStart();

        // ── 回到上次滚到的地方（`docs/07` 第 76 项）──────────────────────
        // ⚠️ **必须在 `focusAtStart()` 之后**：聚焦会派一次事务、把插入点放到
        // 文档开头，浏览器顺手会把视口拉到那儿——先滚的话会被它当场盖掉。
        // ⚠️ **隔一帧再滚**：正文这会儿刚进去，图片还没撑开、`scrollHeight`
        // 还是初值，那一刻滚过去会落在错的地方（而且看起来像"没生效"——
        // 滚了一下又被后面的布局拉回去）。
        // ⚠️ 读的是 `初始滚动Ref.current`（而不是外面那个 prop）：这一帧之后
        // 用户自己滚一下，回调把 prop 换了，但"打开时回到哪儿"已经定下来了。
        const 要回到 = 初始滚动Ref.current;
        if (要回到 !== undefined) {
          requestAnimationFrame(() => {
            if (disposed) return;
            恢复滚动比例(mount, 要回到);
          });
        }

        // 装载完之后把编辑器的文本交回后端**认领**一次。
        //
        // ⚠️ 这不是 `sync`。编辑器把 markdown 解析成文档树再序列化回来，结果未必
        // 与磁盘上那份逐字节相同（尾段、空行、标记写法都会被规范化），而那是
        // **编辑器**改的、不是**用户**改的。不认领的话，打开一个文件就会显示
        // 「已修改」、关窗口还多问一句（BUG-12）。
        //
        // 此刻用户还没碰键盘，所以这一步吞不掉任何真改动；真改动走上面的 onChange。
        // ⚠️ 这一步**必须在 `focus()` 之后**：聚焦本身会派一次事务（补尾段、定选区），
        // 要认领就认领最后一次同步事务之后的结果。
        //
        // ⚠️⚠️ **源码模式不认领**。`settle` 的语义是"接受编辑器的规范化结果"，
        // 而 CodeMirror **不做任何规范化**——它手里就是原文。源码模式下文本相同
        // 时下面这个 `if` 天然不成立；但更重要的是：源码模式下**没有"规范化"
        // 这回事**，认领这一步没有意义，留着只会让人以为这里有问题。
        const settled = handle.getMarkdown();
        latestRef.current = settled;
        if (mode === "wysiwyg" && settled !== doc.text) {
          try {
            await api.doc.settle(doc.id, settled);
            await onDocsChanged();
          } catch (e) {
            // 认领失败不该挡住编辑——最坏的结果是脏标记虚报一次。
            console.warn("[nota] 装载后认领文本失败：", e);
          }
        }
      } catch (e) {
        onToast(t("The editor failed to start: {0}", String(e)), "error");
      }
    })();

    return () => {
      disposed = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      // ⚠️ 选区快照那条**只清定时器，不补推**（理由见 `useCursorSnapshot.ts`
      // 文件头最后一段）：那一笔会打在**已经换掉的那份文档**的 id 上。
      清快照定时();
      // ⚠️ 拆之前**再从活着的实例读一次**：去抖窗口里那最后一截（用户打完字
      // 不到 300ms 就切了模式）还没推给后端，而它已经不在 `latestRef` 之外
      // 的任何地方了。丢掉它 = 用户亲眼看着自己刚打的字消失。
      const last = handleRef.current?.getMarkdown();
      if (last !== undefined) latestRef.current = last;

      handleRef.current = null;
      previewHandleRef.current = null;
      handle?.destroy();
      preview?.destroy();
      setReady(false);
      // 拆掉了就报 `null`——留着上一次那份状态的话，换文档/切模式之后
      // 工具栏会高亮在一个**已经不存在**的位置上。
      commandStateRef.current(null);
      // 查找那边同理：新实例手里一个命中都没有，留着旧的那份命中数
      // （比如"3 / 12"）就是界面在报一个**已经不存在**的查找。
      findStatusRef.current(空查找状态);
    };
    // doc.id 变 = 换文档 = 重挂（App 那边也带了 key，双保险）；
    // mode 变 = 换编辑器（见文件头第 3 条）；
    // strict 变 = 源码模式里"这一行算不算标题"的正则要换一份，而那份是建
    // 实例时捕获的，得重来（所见即所得一侧现在与 strict 无关，见 `Props` 那条）。
    // 行内扩展变 = `.use()` 那串链里挂着/不挂着几个插件，而链是建实例时
    // 定死的，同样得重来（理由见 `Props` 里那一条）。
    // 标点 / 自动更正变 = 同上，而且**六项里任何一项变了都算**（哪怕只是换个
    // 引号字形）——为什么不细分见 `useEditorSettings.ts` 文件头那一段。
    // emoji 变 = 同上（两条输入规则 ＋ 一条补全插件，都在那串链上）。
    // 纯文本变 = 源码模式那串扩展里换了**两样**（`markdown()` 与配套配色），
    // 同样是建实例时挂死的。⚠️ 它**只在降级与用户手动切模式时**会变，而后者
    // 本来就会带着 mode 一起变——也就是说这一格平时纹丝不动，加进依赖不会让
    // 任何人重建编辑器。
    // 刻意**不**依赖 doc.text：那是初始值，不是要跟随的状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, mode, strict, physics, 纯文本, 行内扩展, 标点, 自动更正, emoji, 智能符号]);

  /* ── 正文上方那条 front matter 横幅（`docs/07` 第 64 项）──────────────
   *
   * 读、改、删三件事都在 `FrontMatterBanner.tsx` 里（2026-10-07 搬出去的）。
   * 这一侧只做两件事：把编辑器报来的文本推给它（`横幅Ref.current?.同步`，
   * 见上面 `认改动` 与建实例那一处），以及把"用户改了那一段"转成一条编辑器命令。
   *
   * ⚠️ **改的路只有一条**：`runCommand("frontMatter", …)` —— 那段文本归编辑器
   * 那一侧持有（`create.ts` 里那个 `前置块` 变量），横幅绝不自己拼一份存起来：
   * 两处各存一份的话，插件整篇替换文本之后横幅里那份就成了旧的。
   */

  /** 横幅要的那两样：读"最后知道的文本"、把那段 YAML 写回编辑器。 */
  const 读最新文本 = () => latestRef.current;
  const 写前置块 = (内文: string | null) =>
    handleRef.current?.runCommand("frontMatter", { frontMatter: 内文 });

  // ── 记滚动位置 ──────────────────────────────────────────────────────
  // ⚠️ **监听挂在捕获阶段**：滚动事件不冒泡（`scroll` 只在自己那个元素上派），
  // 而真正在滚的那个元素是编辑器内部的（所见即所得是 `.editor-mount`、
  // 源码是 CodeMirror 的 `.cm-scroller`），它在 React 这棵树的下面。捕获阶段
  // 能从挂载点收到，不必去猜里面长什么样。
  //
  // ⚠️ **每一下都报，不在这里去抖**：去抖与落盘在 `ui/useSession.ts`（那边还
  // 要跨文档合并写入），这里再抖一层只会让"最后那一下"更容易丢。
  // ⚠️ 报告失败（读不出容器、读不出比例）**什么都不做**——这是记账，不是功能。
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const 报 = () => {
      const 比例 = 读滚动比例(mount);
      if (比例 !== null) 滚动回调Ref.current?.(比例);
    };
    mount.addEventListener("scroll", 报, { capture: true, passive: true });
    return () => mount.removeEventListener("scroll", 报, { capture: true });
  }, []);

  // ⚠️ 换文档时 `latestRef` 要跟着换，否则会把上一份文档的文本当成本份的初始值。
  // **真正管这件事的是 `App.tsx` 上那个 `key={doc.id}`**（换文档 = 整个组件重挂，
  // 连 `latestRef` 都是新的）。这里这几行是**兜底**：哪天有人把那个 key 去掉，
  // 症状会是"切到另一份文档、里面是上一份的内容"，而且看起来像后端的锅。
  // 判断写在渲染里（不是 effect 里）是为了**赶在上面那个 effect 之前**生效。
  const lastDocIdRef = useRef(doc.id);
  if (lastDocIdRef.current !== doc.id) {
    lastDocIdRef.current = doc.id;
    latestRef.current = doc.text;
  }

  return (
    // ⚠️ 那四个排版变量写在**这一层**（`.editor-pane`），不是 `<html>` 上，
    // 也不是 `.editor-mount` 上：
    // - 不能写 `<html>`：文档主题的声明落的就是 `.editor-pane`（`doc-theme.ts`
    //   把主题的 `:root` 改写成它），**继承盖不过声明**，写上面等于没写；
    // - 写到 `.editor-mount` 只盖住主窗格，分屏右边那个预览会留着主题的字体，
    //   两半长得不一样。
    // 内联样式优先级高于任何选择器，所以这一层是"用户显式盖过主题"的唯一落点。
    // 理由与来历见 `styles/doc-typography.ts` 与 `settings/document.rs`。
    <div className={`editor-pane editor-pane-${mode}`} style={正文排版变量(文档排版) as CSSProperties}>
      {!ready && <div className="editor-loading">{t("Preparing the editor…")}</div>}
      {/* front matter 横幅（`docs/07` 第 64 项）。⚠️ **它一直挂在这儿**，
          由它自己按 `显示` 决定露不露面（源码模式下渲染 `null`）——不是这里
          条件渲染：那样一切模式就会把它的状态（输入框里正在打的字、两击确认）
          连同组件一起扔掉，切回所见即所得时横幅里是切走那一刻的旧内容。
          为什么它在文档树之外、以及"读/改/删"三条路的归属，见它的文件头。 */}
      <FrontMatterBanner
        ref={横幅Ref}
        显示={mode === "wysiwyg"}
        读文本={读最新文本}
        写前置块={写前置块}
      />
      {/* ⚠️ 这两块 div 的内容由编辑器独占，React 永不往里渲染。 */}
      <div
        ref={mountRef}
        className="editor-mount"
        // ⚠️ **只有开了「限制正文宽度」才写这个变量**（2026-10-09）。不写的时候
        // `editor.css` 那条 `max-width: var(--content-width, none)` 落到 `none`，
        // 正文列就铺满编辑区——用户报的"右边还有空隙"就是它。
        // ⚠️ `lang` 是**文档语言**（2026-10-10）。它写的是**连字符**形式：
        // `spellcheck_lang` 里那个下划线是 enchant 的写法，`lang` 那条 HTML 属性
        // 按 BCP-47 认（`zh-CN`）；两者的分工见 `Props` 上那一格。
        lang={拼写语言 ? 拼写语言.replace(/_/g, "-") : undefined}
        style={
          limitTextWidth ? { ["--content-width" as string]: `${contentWidth}px` } : undefined
        }
      />
      {mode === "split" && (
        // 右侧预览。`aria-readonly` 是**如实告知**——它真的改不了。
        // 预览**永远不给** `--content-width`：那一半本来就窄，再限宽会剩一条缝。
        <div ref={previewRef} className="editor-mount editor-preview" aria-readonly="true" />
      )}
    </div>
  );
}
