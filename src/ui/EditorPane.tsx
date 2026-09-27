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
 */

import {
  useEffect,
  useImperativeHandle,
  useMemo,
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
  createEditor,
  type CommandPayload,
  type EditorCommand,
  type EditorHandle,
  type 选区内容,
} from "@/editor/create";
// ⚠️ 只有下面那条提示要用它（"这份文档有没有 front matter"）。切片、拼回、
// 判据都在编辑器那一侧（`editor/create.ts` 的边界上），这里**只读一眼**。
import { 拆前置块 } from "@/editor/front-matter";
import type { CommandState } from "@/editor/command-state";
// 三种行内扩展的开关（`==高亮==` / `^上标^` / `~下标~`）。⚠️ 这里只挑出
// `settings.markdown` 里那三个字段拼成编辑器要的形状——**为什么收整份、
// 为什么要 `useMemo`，写在下面 `Props.markdown` 那一条上**。
import { 默认行内扩展开关 } from "@/editor/inline-marks";
// 智能标点那六个字段（`settings.markdown` 的 `smart_punctuation` 那一组）。
// ⚠️ 同样在下面拼成编辑器要的形状，理由与 `行内扩展` 逐字相同。
import { 默认标点设置, type 标点设置 } from "@/editor/smart-punctuation";
import type { 写作模式 } from "@/editor/writing-modes";
import { 空查找状态, type FindOptions, type FindStatus } from "@/editor/find";
import { 恢复滚动比例, 读滚动比例 } from "@/editor/scroll-into-view";
import { createSourceEditor, type SourceHandle } from "@/editor/source";

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

  /** 把焦点交回编辑区。关查找条、关菜单之后要用（焦点在别处时打的字是白打）。 */
  focus: () => void;
}

interface Props {
  doc: Document;
  /** 当前编辑模式，来自 `settings.view_mode`。 */
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
   * **整整一页 Markdown 设置**（`settings.markdown`），`undefined` = 设置还没
   * 从后端读回来。
   *
   * ⚠️ 这里**只用它里面十一个字段**：三个行内扩展开关（`highlight` /
   * `superscript` / `subscript`）、智能标点那六个（`smart_punctuation` /
   * `smart_quotes` / `smart_quotes_double` / `smart_quotes_single` /
   * `smart_dashes` / `dash_style`）、以及 `auto_correct`（2026-09-27 加）。
   * 其余字段本组件一概不读。**故意收整份而不是收一堆零星布尔值**：那些要拼成
   * 两个对象才能喂给 `createEditor`，而"每次渲染新建一个对象字面量"会让下面
   * 那个 effect **每帧重建编辑器**（丢撤销栈、丢光标）。拼装和记忆化在组件
   * 内部做一次，`App.tsx` 那边就只剩一行——它已经在 1000 行硬线上了，
   * 多一行都是债。
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
  contentWidth: number;
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

export function EditorPane({
  doc,
  mode,
  strict,
  physics,
  emoji,
  markdown,
  focusMode,
  typewriter,
  初始滚动,
  onScroll,
  contentWidth,
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
  /**
   * 这份文档开头有没有 YAML front matter（有 = 所见即所得里要挂一条说明）。
   *
   * ⚠️ 它是**建实例那一刻算一次**的，不是每敲一个字都算：所见即所得里
   * front matter 不在文档树里、改不动，所以这个值只有三种情况会变——
   * 换文档、切模式、插件整篇替换文本，前两种都是**重挂**（下面那个 effect
   * 重跑），第三种本来就要走 `setMarkdown`。拿它当渲染条件就够了。
   */
  const [有前置块, set有前置块] = useState(false);
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
  // 滚动那两条同理（`初始滚动` 只在建实例那一刻读一次，见 `Props` 那条）。
  const 初始滚动Ref = useRef(初始滚动);
  初始滚动Ref.current = 初始滚动;
  const 滚动回调Ref = useRef(onScroll);
  滚动回调Ref.current = onScroll;

  // ── 三种行内扩展的开关（`Props.markdown` 那一条讲了为什么要这么包）──
  // ⚠️ 依赖给的是**三个布尔值**，不是 `markdown` 这个对象：设置对象每次从后端
  // 回来都是新的（改任何一项都换一个），拿它当依赖会让"改了字号"也顺手把
  // 编辑器重建一遍。三个布尔值没变，下面那个对象身份就不变，effect 不重跑。
  const 行内扩展 = useMemo(
    () => ({
      highlight: markdown?.highlight ?? 默认行内扩展开关.highlight,
      superscript: markdown?.superscript ?? 默认行内扩展开关.superscript,
      subscript: markdown?.subscript ?? 默认行内扩展开关.subscript,
    }),
    [markdown?.highlight, markdown?.superscript, markdown?.subscript],
  );

  // ── 智能标点那一组（同上：拼成对象、依赖给逐项）──
  // ⚠️ 依赖给的是**六个字段**，不是 `markdown` 对象——理由同上：改任何一项
  // 设置都会换一个新的 `markdown`，拿它当依赖等于"改了字号也重建编辑器"。
  //
  // ⚠️ **六项里任何一项变了都要重建**（不是只重建"挂不挂规则"那三项）。
  // 曾经想过让字形与破折号风格热更新（它们在处理器被调到那一刻才被读，
  // 看着像个能省的），**放弃了**：那就得让规则读一个可变的盒子、再加一个
  // `set标点`，而"省下一次重建"换来的是一类**静默失效**——改了字形、
  // 活着的实例闭包里还是旧的，症状正是本仓最忌的"设置像没生效"。
  // 代价如实记：写到一半拨标点开关会丢撤销栈，与 `physics` / `inlineMarks`
  // 完全一样（那两条也是这么办的）。
  const 标点 = useMemo<标点设置>(
    () => ({
      模式: markdown?.smart_punctuation ?? 默认标点设置.模式,
      引号: markdown?.smart_quotes ?? 默认标点设置.引号,
      双引号: markdown?.smart_quotes_double ?? 默认标点设置.双引号,
      单引号: markdown?.smart_quotes_single ?? 默认标点设置.单引号,
      破折号: markdown?.smart_dashes ?? 默认标点设置.破折号,
      风格: markdown?.dash_style ?? 默认标点设置.风格,
      省略号: 默认标点设置.省略号,
    }),
    [
      markdown?.smart_punctuation,
      markdown?.smart_quotes,
      markdown?.smart_quotes_double,
      markdown?.smart_quotes_single,
      markdown?.smart_dashes,
      markdown?.dash_style,
    ],
  );

  // 自动更正那一格。⚠️ `undefined` **不等于关**：Rust 那边的默认是 `true`，
  // 设置还没从后端回来时按默认走（`create-types.ts` 的 `自动更正` 那一格）。
  const 自动更正 = markdown?.auto_correct ?? true;

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
  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => handleRef.current?.getMarkdown(),
      setMarkdown: (markdown: string) => {
        latestRef.current = markdown;
        handleRef.current?.setMarkdown(markdown);
        previewHandleRef.current?.setMarkdown(markdown);
      },
      runCommand: (name: EditorCommand, payload?: CommandPayload) =>
        handleRef.current?.runCommand(name, payload) ?? false,

      // 查找五条**直接转发**给当前那个 handle。⚠️ 没有 handle 时（编辑器
      // 还没建好/已经拆了）给"什么都没做"的安全值，不是抛错——关查找条
      // 恰好发生在编辑器重建的那一瞬间（换文档）时，抛错会把整棵树带下来。
      setFind: (query: string, options: FindOptions) =>
        handleRef.current?.setFind(query, options),
      findStep: (方向: 1 | -1) => handleRef.current?.findStep(方向),
      clearFind: () => handleRef.current?.clearFind(),
      replaceCurrent: (text: string) => handleRef.current?.replaceCurrent(text) ?? false,
      replaceAll: (text: string) => handleRef.current?.replaceAll(text) ?? 0,
      // ⚠️ 没 handle 时给 `null`（"没有选区"），不是抛错：菜单点下去的那一刻
      // 可能正好在换文档（编辑器重建），抛错会把整棵树带下来。
      选区: () => handleRef.current?.选区() ?? null,
      // ⚠️ 同一条口径：编辑器还没建好时点大纲，什么都不做，不抛错。
      跳到标题: (目标: { line: number; index: number }) =>
        handleRef.current?.跳到标题(目标),
      focus: () => handleRef.current?.focus(),
    }),
    [],
  );

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

    (async () => {
      try {
        // ── 权威那一侧 ────────────────────────────────────────────────
        // ⚠️ 初始文本取 `latestRef` 而不是 `doc.text`，理由见文件头第 1 条。
        const initial = latestRef.current;
        // front matter 那条说明（见 `有前置块`）。⚠️ 只判所见即所得：源码模式
        // 手里就是原文，那几行看得见也改得动。⚠️ 判的是**这一份**初始文本，
        // 与 `createEditor` 里切的是同一串（同一个纯函数，判据只有一份）。
        set有前置块(mode === "wysiwyg" && 拆前置块(initial).前置块 !== null);

        if (mode === "wysiwyg") {
          // ── 表格列宽（侧车）─────────────────────────────────────────
          // ⚠️ **没有 `doc.path` 就不查**（新建的未命名文档）：侧车是按路径
          // 记的，一份还没落盘的东西没有可记的地方，查它只会拿到空。
          // ⚠️ 查失败**不拦着建编辑器**：侧车是排版偏好，读不到就按自动排版
          // 显示，比"因为一个记录文件读不出来所以打不开文档"合理得多。
          let 列宽: Record<string, number[]> = {};
          if (doc.path) {
            try {
              列宽 = await api.tableWidths.get(doc.path);
            } catch (e) {
              console.warn("[nota] 读表格列宽记录失败，按自动排版显示：", e);
            }
          }
          // ⚠️ 上面这个 `await` 之后要重判一次 `disposed`：建编辑器本身也是
          // await，中间隔着一次 IPC 就多一个"effect 已经拆了、这里才回来"的
          // 窗口（StrictMode 下一定会撞上）。
          if (disposed) return;

          handle = await createEditor({
            root: mount,
            initialMarkdown: initial,
            tableWidths: 列宽,
            // ⚠️ 拖完一次就把**这一刻所有拖过的表**整体报一遍。宿主是按指纹
            // 逐条记的，多报几条没拖过的也无妨（它们本来就不在结果里，见
            // `table-width.ts::读出列宽`）。没有 `doc.path` 就一个字都不存——
            // 这也是这里不把 `doc.path` 传进 `createEditor` 的原因：
            // "存到哪儿"是调用方的事，编辑器不该知道有文件这回事。
            onTableResize: (表) => {
              if (!doc.path) return;
              for (const 一张 of 表) {
                api.tableWidths
                  .set(doc.path, 一张.指纹, 一张.宽度)
                  .catch((e) => console.warn("[nota] 记表格列宽失败：", e));
              }
            },
            // ⚠️ **没有 `strict`**：所见即所得这一侧两种模式已经完全一样了
            // （宽松标题那条显示层装饰 2026-09-26 删掉了，见 `create.ts` 里
            // `readOnly` 下面那条注释）。
            physics,
            // 三种行内扩展的开关。⚠️ 所见即所得这一侧才传：源码模式是
            // CodeMirror，它只显示 Markdown 源码，没有"这条算不算标记"这回事。
            inlineMarks: 行内扩展,
            // 智能标点那一组 ＋ 自动更正。⚠️ **所见即所得这一侧才传**，
            // 理由见 `create-types.ts` 的 `标点` 那一格（导出那条路不许传）；
            // 分屏预览那一侧**要传**，见下面那一处。
            标点,
            自动更正,
            // Emoji 输入辅助（短代码替换 ＋ 补全面板）。⚠️ **所见即所得这一
            // 侧才传**（源码模式没有"短代码"这回事）；分屏预览那一侧**不传**
            // ——它是只读的，补全面板在只读里弹出来只是噪声（`create.ts`
            // 里另有一道 `readOnly` 兜底）。
            emoji,
            writingModes: 写作模式Ref.current,
            // 预览那一份，理由见 `预览Ref`。
            review: 预览Ref.current,
            onReviewEscape: () => 退出Ref.current?.(),
            // 光标状态只在这一侧读得出来（源码模式没有文档树）。
            onCommandState: (s) => commandStateRef.current(s),
            onFindStatus: (s) => findStatusRef.current(s),
            onChange: (markdown) => {
              latestRef.current = markdown;
              活动Ref.current();
              if (timerRef.current !== null) window.clearTimeout(timerRef.current);
              timerRef.current = window.setTimeout(async () => {
                timerRef.current = null;
                try {
                  await api.doc.sync(doc.id, markdown);
                  await onDocsChanged();
                } catch (e) {
                  onToast(`同步到后端失败：${e}`, "error");
                }
              }, SYNC_DEBOUNCE_MS);
            },
          });
        } else {
          // source 与 split 的左侧是同一个东西，只是 split 多一个预览窗格。
          // ⚠️ 源码这一侧**明确报 `null`**（不是空状态）：CodeMirror 手里
          // 就是文本，没有文档树可读，工具栏据此不画任何高亮。
          commandStateRef.current(null);
          handle = createSourceEditor({
            root: mount,
            initialMarkdown: initial,
            strict,
            // ⚠️ 源码那一侧**没有 `physics`**：它是 CodeMirror，只显示 Markdown
            // 原文，一个字都不渲染，宏表跟它无关（`CreateSourceOptions` 里没这项，
            // 传了编译不过）。
            writingModes: 写作模式Ref.current,
            // 预览那一份，理由见 `预览Ref`（源码模式同样支持就地预览）。
            review: 预览Ref.current,
            onReviewEscape: () => 退出Ref.current?.(),
            onFindStatus: (s) => findStatusRef.current(s),
            onChange: (markdown) => {
              latestRef.current = markdown;
              活动Ref.current();
              if (mode === "split") pushPreview(markdown);
              if (timerRef.current !== null) window.clearTimeout(timerRef.current);
              timerRef.current = window.setTimeout(async () => {
                timerRef.current = null;
                try {
                  await api.doc.sync(doc.id, markdown);
                  await onDocsChanged();
                } catch (e) {
                  onToast(`同步到后端失败：${e}`, "error");
                }
              }, SYNC_DEBOUNCE_MS);
            },
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
          preview = await createEditor({
            root: previewRef.current,
            initialMarkdown: initial,
            physics,
            // ⚠️ **要跟主编辑器一致**：预览显示的就是左边那份文档的渲染结果，
            // 开关不一样的话，`==甲==` 在左边是高亮、在右边是一条光秃秃的
            // `==甲==`——用户会以为分屏坏了。
            inlineMarks: 行内扩展,
            // ⚠️ **智能标点也要跟主编辑器一致**：`Render` 档下左边把 `--` 显示成
            // `–`、右边还是 `--`，用户会以为分屏坏了。⚠️ 这一份的 DOM **不拿去
            // 导出**（导出走 `editor/export.ts` 自己另建的那个实例），所以传它
            // 不会把"仅显示时转换"漏进文件——那条边界见 `create-types.ts`。
            // ⚠️ 自动更正**不传**：预览是只读的，没有输入可言，挂上去是纯死代码。
            标点,
            readOnly: true,
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
        onToast(`编辑器启动失败：${e}`, "error");
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
    // 引号字形）——为什么不细分见上面 `标点` 那个 `useMemo` 的注释。
    // emoji 变 = 同上（两条输入规则 ＋ 一条补全插件，都在那串链上）。
    // 刻意**不**依赖 doc.text：那是初始值，不是要跟随的状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, mode, strict, physics, 行内扩展, 标点, 自动更正, emoji]);

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
      {!ready && <div className="editor-loading">{t("正在准备编辑器…")}</div>}
      {/* front matter 不在文档树里（`editor/front-matter.ts`），所见即所得
          里看不见也改不了——这一条就是**如实说明**这件事，否则用户会以为
          自己开头那几行丢了。⚠️ 只说事实，不带按钮：要改就切源码模式，
          那颗按钮在别处（视图菜单）。 */}
      {mode === "wysiwyg" && 有前置块 && (
        <div className="editor-frontmatter-note" role="note">
          {t(
            "这篇文档开头有一段 front matter（`---` 包住的那几行）。所见即所得里不显示、也改不了，存盘时会原样保留——要改请切到源码模式。",
          )}
        </div>
      )}
      {/* ⚠️ 这两块 div 的内容由编辑器独占，React 永不往里渲染。 */}
      <div
        ref={mountRef}
        className="editor-mount"
        style={{ ["--content-width" as string]: `${contentWidth}px` }}
      />
      {mode === "split" && (
        // 右侧预览。`aria-readonly` 是**如实告知**——它真的改不了。
        // 预览不给 `--content-width`：那一半本来就窄，再限宽会剩一条缝。
        <div ref={previewRef} className="editor-mount editor-preview" aria-readonly="true" />
      )}
    </div>
  );
}
