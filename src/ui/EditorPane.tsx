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
// 开头那段 front matter（上面那条横幅，`docs/07` 第 64 项）。⚠️ 切片、拼回、
// 判据、模板都在 `front-matter.ts` 那一份里——这里只**读**它、**改**它，
// 绝不自己再切一刀（判据两处各写一份的话，编辑器藏起来的那几行与横幅里
// 显示的那几行迟早不是同一段）。
import { 拆前置块, 拆前置块内文, 换前置块, 新建前置块模板 } from "@/editor/front-matter";
// 选区快照的**类型**（`docs/07` 第 14 项）。⚠️ 只借类型：算法在编辑器那一侧
// 的两份实现里（所见即所得 `caret-snapshot.ts`、源码 `source.ts` 的
// `updateListener`），这里只负责"收下来、去抖、推给后端"。
import type { 选区快照 } from "@/editor/caret-snapshot";
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
/**
 * 把**选区快照**推给后端的去抖（`docs/07` 第 14 项，2026-10-04）。
 *
 * ⚠️ **比 `SYNC_DEBOUNCE_MS` 短、比 `PREVIEW_DEBOUNCE_MS` 长**：它跨 IPC
 * （所以要防抖），但它只是给插件看的一条旁路（所以拖久了没意义）。
 * ⚠️ 编辑器那一侧已经先按"快照真的变了"去过一次重了（`caret-snapshot.ts`），
 * 这里再压一道时间窗——只挪光标不改字的情形**不会**触发 `sync`，
 * 那条路完全靠这一条。
 */
const CURSOR_DEBOUNCE_MS = 250;

/**
 * 横幅里那颗「删除」等第二下的时间窗（`docs/07` 第 64 项）。
 *
 * ⚠️ 它是**两击确认**，不是弹窗：那一段是文档内容、而且这份文档是自动保存的，
 * 误点一下就没了太容易。为一行 YAML 把 `useDialogs` 那一套从 `App` 一路传进来
 * 不值当，而"按钮自己变成『确认删除』、过几秒再变回去"这条路不需要任何新通道。
 *
 * ⚠️ 4 秒是**猜的**：短到不会让人对着一个已经变了意思的按钮发呆，长到够看清
 * 那行字再点第二下。它与 `SYNC_DEBOUNCE_MS` 那几档没有关系（不是同一类时间）。
 */
const 删除确认毫秒 = 4000;

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
   * 这份文档开头有没有 YAML front matter（有 = 正文上方要挂那条横幅）。
   *
   * ⚠️ 它**不是建实例那一刻算一次**的（2026-10-04 第 64 项起）：菜单里那条
   * 「YAML Front Matter」能在文档开着的时候把这一段建出来、横幅里那颗「删除」
   * 又能把它删掉——那是两个中途翻转的时刻，只算一次的话横幅要么不出现、
   * 要么删完了还挂在那儿。现在它跟着**每一次报来的文本**重算（同值不引起重画）。
   */
  const [有前置块, set有前置块] = useState(false);
  /**
   * 横幅里那个 YAML 输入框的**内容**。
   *
   * ⚠️ 它是**受控**的，但**不跟着文档走**：编辑框里的字归用户所有。编辑器每次
   * 报文本都无脑覆盖它的话，我们**自己提交出去的那一笔回声**会把用户正在打的
   * 字顶掉——他打第三个字母的时候光标会当场跳一下（见 [`提交前置块`]）。
   */
  const [前置块内文, set前置块内文] = useState("");
  const [前置块展开, set前置块展开] = useState(false);
  /** 「删除」按了第一下，正等着第二下。4 秒后自己变回去，见 [`删除前置块`]。 */
  const [删前置块待确认, set删前置块待确认] = useState(false);
  const 前置块框Ref = useRef<HTMLTextAreaElement>(null);
  /** 两击确认那个定时器。 */
  const 待确认定时Ref = useRef<number | null>(null);
  /**
   * **文档里**那段 front matter 的内文（`null` = 没有这一段）。
   *
   * 它只有一个用处：认出"刚报回来的这一份就是我刚才写进去的那一笔"。不做这个
   * 区分的话，每次提交都会绕回来覆盖一遍输入框——而规范化（内文末尾的空行）
   * 会让那份覆盖**与用户手里那份差一个字节**，症状就是他正打着字、光标跳回行尾。
   */
  const 前置块基准Ref = useRef<string | null>(null);
  /**
   * 上一次**见到**的内文（含建实例那一刻那一份）。
   *
   * 用处也只有一个：认出"这一次是**从没有到有**"——那一定是菜单里刚点出来的
   * 那一条，用户下一步准是去填它，所以顺手把输入框摊开。
   */
  const 上一次内文Ref = useRef<string | null>(null);
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

  /**
   * 选区快照那条去抖的定时器。
   *
   * ⚠️ **与 `timerRef`（sync 那条）分开**：两条路的节奏与内容都不一样，
   * 合用一个会让"改一个字"把"刚挪了光标"那次推送吞掉（或反过来）。
   */
  const 快照定时Ref = useRef<number | null>(null);
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
      // ⚠️ 没 handle 时给 `false`（"这一侧没做"），不是抛错——同 `runCommand`。
      插入在光标处: (text: string) => handleRef.current?.插入在光标处(text) ?? false,

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

  /**
   * 选区快照 → 后端镜像（`docs/07` 第 14 项）。
   *
   * ⚠️ **它在编辑器那一侧已经去过一次重**（所见即所得在 `caret-snapshot.ts`
   * 的插件里、源码在 `source.ts` 的 `updateListener` 里），这里再压一道
   * 时间窗——两条去重管的不是同一件事：那边的键是"快照变没变"，
   * 这边的键是"多久没推过了"。
   *
   * ⚠️ **失败只吞掉**（不像 `sync` 那条要弹提示条）：这只是一条给插件看的
   * 旁路，推失败（编辑器刚拆、文档刚关）的后果是"插件读到上一次的选区"，
   * 而那在下一笔事务时自愈。为它弹一条"同步失败"是拿噪声换噪声。
   */
  const 记快照 = (快照: 选区快照) => {
    if (快照定时Ref.current !== null) window.clearTimeout(快照定时Ref.current);
    快照定时Ref.current = window.setTimeout(() => {
      快照定时Ref.current = null;
      void api.doc.cursor(doc.id, 快照).catch(() => {});
    }, CURSOR_DEBOUNCE_MS);
  };

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
     * 把"编辑器手里这份文本"里那段 front matter 反映到横幅上
     * （`docs/07` 第 64 项；两种模式共用，源码那一侧不画横幅但也得记着，
     * 不然切回来时状态是旧的）。
     *
     * ⚠️ **它不管编辑框里正在打的那几个字**：底下那一段变了才覆盖输入框，
     * 而我们自己提交出去的那一笔回声**不算变**（判据是 `前置块基准Ref`）。
     * 不区分这两件事的话，用户每打一个字母都会被自己那一笔写回来的规范化结果
     * 覆盖一次，光标当场跳到末尾。
     */
    const 同步前置块 = (markdown: string, 允许摊开 = true) => {
      const 块 = 拆前置块(markdown).前置块;
      const 内文 = 块 === null ? null : 拆前置块内文(块);
      // "从没有到有"＝这一段是刚冒出来的。会这么干的只有两处：菜单里那条
      //「YAML Front Matter」（建的是模板）和插件整篇替换文本。
      const 刚冒出来 = 内文 !== null && 上一次内文Ref.current === null;
      上一次内文Ref.current = 内文;
      set有前置块(内文 !== null);
      if (内文 === null) set前置块展开(false); // 删掉了（或插件拿掉了）就合上
      if (内文 === 前置块基准Ref.current && !刚冒出来) return; // 自己那一笔回声
      前置块基准Ref.current = 内文;
      set前置块内文(内文 ?? "");
      // 刚建出来的那一段是用户点"插入 YAML Front Matter"点出来的，下一步准是
      // 去填它——顺手摊开（省掉一次"再点一下编辑"）。⚠️ 只认模板：插件塞进来的
      // 那一段内容多半是它自己管的，把输入框弹出来只是噪声。
      // ⚠️ 建实例那一次**不算**（`允许摊开` 传 `false`）：那一份本来就在盘上，
      // 用户没点过任何东西。不挡的话，开头正好写着 `title: ` 的文档一打开就会
      // 弹出一个输入框，看着像编辑器自己动了他的文件。
      if (允许摊开 && 刚冒出来 && 内文 === 新建前置块模板) set前置块展开(true);
    };

    /**
     * 编辑器报来"文本变了" → 认下来、跟前端说一声、并去抖推给后端。
     *
     * ⚠️ **两种模式共用这一份**（2026-10-04 合并）：原来所见即所得与源码各写
     * 一遍，差别只在"分屏那一侧要不要推预览"——而那一条按 `mode` 判得出来。
     * 两遍的代价是"往这条路里加一件事就得加两处"，第 64 项这一段正是第一件。
     */
    const 认改动 = (markdown: string) => {
      latestRef.current = markdown;
      活动Ref.current();
      同步前置块(markdown);
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
        // 这一段横幅的**初值**（见 `有前置块`、`前置块基准Ref`）。⚠️ 判的是
        // **这一份**初始文本，与 `createEditor` 里切的是同一串（同一个纯函数，
        // 判据只有一份）。⚠️ 基准与"上一次见到的"都要一起摆好：摆漏了的话，
        // 编辑器报回来的第一笔就会被当成"文档里那一段变了"，把输入框重填一遍。
        同步前置块(initial, false);

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
            // **严格模式**。⚠️ 所见即所得这一侧**要传**：它换的是正文里
            // "`#你好` 算不算标题的写法"（`heading-on-enter.ts`）。这里原来
            // 写着"没有 `strict`，两种模式已经完全一样了"——那是 2026-09-26
            // 删掉显示层之后的实情，**2026-09-29 又加回来了**（用户报"严格模式
            // 关闭后 `#标题` 还是无法正常显示"），见 `atx.ts` 文件头。
            //
            // ⚠️ **2026-09-30 起它管的还是这一件事，长相却换了**：宽松档下
            // `#你好` 与 `# 你好` 走**同一条路**——没按回车时都只加粗，按下
            // 回车都变成标题块（字号这时才跳）。用户原话：「类似 `# 你好`。
            // 就是不回车只是显示加粗，回车变成标题。」所以这一侧传 `strict`
            // 现在的效果是：**严格档下 `#你好` 一个字节、一个像素都不动**
            //（既不进装饰、也不成块），宽松档下它和 `# 你好` 完全一样。
            //
            // ⚠️ 反过来说：**只传这一侧**。导出那条路（`export.ts`）不传——
            // 那里的 `nota-` 前缀规则会把这类装饰整个摘掉，导出结果与严格
            // 与否无关，这是有意的（见 `导出选项` 那段注释）。
            strict,
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
            // **智能符号补全**（`settings.editor.smart_symbols`，默认开）。
            // ⚠️ **所见即所得这一侧才传**（源码模式是 CodeMirror，它没有
            // "打一颗字符顺手补另一半"这回事）；分屏预览那一侧**不传**——
            // 它是只读的，补进来也只是噪声。
            智能符号,
            writingModes: 写作模式Ref.current,
            // 预览那一份，理由见 `预览Ref`。
            review: 预览Ref.current,
            onReviewEscape: () => 退出Ref.current?.(),
            // 光标状态只在这一侧读得出来（源码模式没有文档树）。
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
          handle = createSourceEditor({
            root: mount,
            initialMarkdown: initial,
            strict,
            纯文本,
            // ⚠️ 源码那一侧**没有 `physics`**：它是 CodeMirror，只显示 Markdown
            // 原文，一个字都不渲染，宏表跟它无关（`CreateSourceOptions` 里没这项，
            // 传了编译不过）。
            writingModes: 写作模式Ref.current,
            // 预览那一份，理由见 `预览Ref`（源码模式同样支持就地预览）。
            review: 预览Ref.current,
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
          preview = await createEditor({
            root: previewRef.current,
            initialMarkdown: initial,
            // ⚠️ **理由同 `inlineMarks`**：预览显示的就是左边那份文档，开关不
            // 一样的话，`#标题` 在左侧正文里按标题排版、在右边是一条普通段落。
            // ⚠️ 但**分屏左侧是源码模式**，那边 `#标题` 本来就是一行原文，所以
            // 实际上"两边不一致"只在 `strict` 与源码模式无关这件事上自洽——
            // 传它图的是"预览永远等于所见即所得那一档的渲染结果"。
            strict,
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
      // ⚠️ 选区快照那条**只清定时器，不补推**：编辑器马上就没了，补推出去的
      // 是一份"拆之前的选区"，对插件没有意义（它下次收到的是新文档的第一份）。
      // ⚠️ 不清的话，这一笔会打在**已经换掉的那份文档**的 id 上——改的是
      // 另一份文档的选区快照，看不出来坏在哪。
      if (快照定时Ref.current !== null) {
        window.clearTimeout(快照定时Ref.current);
        快照定时Ref.current = null;
      }
      // 两击确认那个定时器同理（`删除前置块`）：它只是把按钮上的字变回去，
      // 拆掉了还留着的话，那一下会打在**下一份文档**的输入框上。
      if (待确认定时Ref.current !== null) {
        window.clearTimeout(待确认定时Ref.current);
        待确认定时Ref.current = null;
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
    // 纯文本变 = 源码模式那串扩展里换了**两样**（`markdown()` 与配套配色），
    // 同样是建实例时挂死的。⚠️ 它**只在降级与用户手动切模式时**会变，而后者
    // 本来就会带着 mode 一起变——也就是说这一格平时纹丝不动，加进依赖不会让
    // 任何人重建编辑器。
    // 刻意**不**依赖 doc.text：那是初始值，不是要跟随的状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, mode, strict, physics, 纯文本, 行内扩展, 标点, 自动更正, emoji, 智能符号]);

  /* ── 正文上方那条 front matter 横幅（`docs/07` 第 64 项）──────────────
   *
   * 读、改、删三件事都在下面这几个函数里。**改的路只有一条**：
   * `runCommand("frontMatter", …)` —— 那段文本归编辑器那一侧持有
   *（`create.ts` 里那个 `前置块` 变量），这里绝不自己拼一份存起来：两处各存
   * 一份的话，插件整篇替换文本之后横幅里那份就成了旧的。
   */

  /** 从"最后一次知道的文本"里现取那段内文（`null` = 这份没有 front matter）。 */
  const 现取内文 = (): string | null => {
    const 块 = 拆前置块(latestRef.current).前置块;
    return 块 === null ? null : 拆前置块内文(块);
  };

  /**
   * 摊开输入框（「编辑」那一颗，以及刚建出那一段时自动摊开）。
   *
   * ⚠️ 读的是 `latestRef`（**编辑器最后报来的那一份**），不是 `doc.text`：
   * 后者是属性传进来的初值，编辑器自己规范化过的结果不在里面。
   */
  const 打开前置块框 = () => {
    const 内文 = 现取内文() ?? "";
    // ⚠️ 基准**先摆好**：这一刻起输入框里那份就是"文档里那份"，接下来任何一次
    // 报回来的相同内文都算回声，不会再把框重填一遍。
    前置块基准Ref.current = 内文;
    set前置块内文(内文);
    set删前置块待确认(false);
    set前置块展开(true);
  };

  /** 合上输入框。**不提交任何东西**——每一次按键都已经提交过了（见下）。 */
  const 合上前置块框 = () => {
    if (待确认定时Ref.current !== null) {
      window.clearTimeout(待确认定时Ref.current);
      待确认定时Ref.current = null;
    }
    set删前置块待确认(false);
    set前置块展开(false);
  };

  /**
   * 把输入框里那段 YAML 交给编辑器。**每一次按键都交，不做去抖。**
   *
   * ⚠️ 不去抖的理由有两条：① 这条路改的是文档树**之外**的一段文本，不重新
   * 解析正文（见 `create.ts::写前置块`），比在正文里打一个字还便宜；② 底下推给
   * 后端那一跳本来就有 300ms 去抖。少一层去抖也就少一个坑——"打完最后一个字
   * 就关标签页，那一笔还在定时器里"。
   */
  const 提交前置块 = (内文: string) => {
    // ⚠️ **清空不等于删除**：清掉一个输入框是极容易误触的动作，而这份文档是
    // 自动保存的。空的就一个字都不写；要删那一段走「删除」（它还要按两下）。
    if (内文.trim() === "") return;
    const 原块 = 拆前置块(latestRef.current).前置块;
    const 新块 = 换前置块(原块, 内文);
    if (新块 === null || 新块 === 原块) return; // 一个字都不会变，别惊动编辑器
    // 基准挪到**规范化之后**的那一份（内文末尾的空行会被收掉一个）：等会儿
    // 编辑器报回来的回声要与它逐字相同，才认得出"这是我自己刚写的那一笔"。
    前置块基准Ref.current = 拆前置块内文(新块);
    handleRef.current?.runCommand("frontMatter", { frontMatter: 内文 });
  };

  /**
   * 删掉那一段。**两击确认**（第一下只是把按钮上的字换成「确认删除」）。
   *
   * ⚠️ 为什么不弹窗：那一段是文档内容、而且会自动存回盘上，一次误点不该就没了
   * ——但为一行 YAML 把 `useDialogs` 那一套从 `App` 一路传进来也不值当。
   * 两击确认不需要任何新通道，代价是那行小字要写清楚（见 JSX 里的 `title`）。
   */
  const 删除前置块 = () => {
    if (!删前置块待确认) {
      if (待确认定时Ref.current !== null) window.clearTimeout(待确认定时Ref.current);
      set删前置块待确认(true);
      待确认定时Ref.current = window.setTimeout(() => {
        待确认定时Ref.current = null;
        set删前置块待确认(false);
      }, 删除确认毫秒);
      return;
    }
    合上前置块框();
    // 基准**先**挪到 `null`：等会儿报回来的是"没有这一段"，与它相等 ⇒ 输入框
    // 不会被重新填上（否则那一段刚删掉又出现在框里，看着像没删掉）。
    前置块基准Ref.current = null;
    handleRef.current?.runCommand("frontMatter", { frontMatter: null });
  };

  // 输入框摊开之后把焦点交进去、插入点落到末尾：这一段是用户刚点出来要填的
  //（「编辑」或者菜单里那条「YAML Front Matter」），不接焦点的话他得再点一下；
  // 光标落在末尾是因为新建出来的模板就一句 `title: `，紧接着要打的是值。
  useEffect(() => {
    if (!前置块展开) return;
    const 框 = 前置块框Ref.current;
    if (!框) return;
    框.focus();
    框.setSelectionRange(框.value.length, 框.value.length);
  }, [前置块展开]);

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
      {/* front matter 不在文档树里（`editor/front-matter.ts`），所见即所得的
          正文里看不见它——这一条横幅就是它的落点：既**如实说明**开头那几行
          没丢，也让人就地能读能改（`docs/07` 第 64 项）。
          ⚠️ 只在**有**这一段的时候出现。没有的时候不摆一条空横幅：那会变成
          一块常驻的装饰，而"这里本来没有东西"不该占一行。要**加**那一段走
          菜单里那条「YAML Front Matter」（`create.ts::写前置块` 里
          `payload` 缺省的那一支）。 */}
      {mode === "wysiwyg" && 有前置块 && (
        <div
          className="editor-frontmatter"
          role="region"
          aria-label={t("Front matter")}
        >
          <div className="editor-frontmatter-head">
            <span className="editor-frontmatter-title">{t("Front matter")}</span>
            {前置块展开 ? (
              <button type="button" className="editor-frontmatter-btn" onClick={合上前置块框}>
                {t("Done")}
              </button>
            ) : (
              <button type="button" className="editor-frontmatter-btn" onClick={打开前置块框}>
                {t("Edit")}
              </button>
            )}
            {/* ⚠️ 两击确认（见 [`删除前置块`]）。第二下之前那行字要**先说清楚
                再按哪一下**，不然"确认删除"看着像已经删了。 */}
            <button
              type="button"
              className="editor-frontmatter-btn editor-frontmatter-del"
              data-arming={删前置块待确认 ? "true" : undefined}
              title={t("The line itself goes away too — this one takes two clicks.")}
              onClick={删除前置块}
            >
              {删前置块待确认 ? t("Confirm delete") : t("Delete")}
            </button>
          </div>
          {前置块展开 && (
            // ⚠️ **受控**输入框（`value` 绑在 `前置块内文` 上）：编辑器规范化过
            // 的结果（末尾空行收掉一个）要能回填到框里，否则用户看到的与盘上的
            // 差一行。回声识别在 [`提交前置块`] 与那个基准 ref 里。
            // ⚠️ 打字**当场**提交，不按回车也不失焦才提交：关了标签页/切了文档
            // 就跑掉的那一笔，是最难查的一类丢字。
            <textarea
              ref={前置块框Ref}
              className="editor-frontmatter-text"
              value={前置块内文}
              spellCheck={false}
              rows={Math.min(12, Math.max(2, 前置块内文.split("\n").length + 1))}
              onChange={(e) => {
                set前置块内文(e.target.value);
                提交前置块(e.target.value);
              }}
              onKeyDown={(e) => {
                // Esc 合上（不撤销——每一笔都已经进去了）。⚠️ 只在这里拦 Esc：
                // 这个框是 `textarea`，别指望外层的快捷键还会轮到它。
                if (e.key === "Escape") {
                  e.preventDefault();
                  合上前置块框();
                }
              }}
            />
          )}
          <div className="editor-frontmatter-hint">
            {前置块展开
              ? t(
                  "Kept as-is at the very top of the file, outside the text you edit below — clearing this box will not delete it.",
                )
              : t(
                  "The lines wrapped in `---` at the top of the file. They are not part of the text below, and they are kept as-is when you save.",
                )}
          </div>
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
