/**
 * 编辑器内核：Milkdown（ProseMirror + remark）的封装。
 *
 * # 为什么是 ProseMirror 系而不是「textarea + 高亮装饰」
 *
 * 这一层要的语义是**文档树**，不是"带样式的文本缓冲"。表格结构、图片定尺寸、
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

import { editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import { replaceAll as replaceAllContent } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/kit/prose/state";

// 开头那段 YAML front matter 的拆分/拼回/改写。**只在这个文件与 `assemble.ts`
// 的边界上用**，别处不许各自去切一刀（判据只有一份）。理由见它的文件头。
// ⚠️ 装配那一侧只要 `拼回前置块`（`markdownUpdated` 报出去的是整篇）；切分与
// 改写都在这儿——"活的那一段"住在本函数的闭包里。
import { splitFrontMatter, joinFrontMatter, replaceFrontMatter, newFrontMatterTemplate } from "@/editor/front-matter";

// ⚠️ **装配（`.config()` ＋ 整条 `.use()` 插件链）2026-10-07 整块搬去了
// `./assemble`**（本文件那天 1006 行，`docs/07` 第 89 项）：那边只管"一次性把
// 一切装上去"，本文件只剩"实例建好之后怎么用"（句柄、front matter 的读写、
// 存盘拼回）。⚠️ 那条链的**顺序就是语义**，别在那边随手挪 `.use()`。
import { installConfigureActualExample } from "./assemble";
// ⚠️ 命令表里那几条"先看一眼光标在哪、再一笔事务里改两处"的实现
//（`insert.ts` 的任务列表 / 清除格式 / 表格增删 / 公式块 / 目录，`footnote.ts`
// 的插脚注）2026-09-28 **跟着表一起搬去了 `./command-table`**——本文件不再直接
// 引它们，对 `insert.ts` 也不再是"唯一的调用点"了。
import { runCommand } from "./command-table";
import { rollActionToPosition } from "./scroll-into-view";
// 就地改动预览（`nota.ui.review_diff`）。⚠️ 算法与两种看法在 `review.ts` 里，
// 这里只用它那一侧的适配层。
import { removeViewMode, setViewMode2, type changePreview, type previewMode } from "./review";
// ⚠️ `预览插件` / `预览中吗` 跟着装配那一块走了；这里只剩"换文档时推给
// 活着的实例"那一条路要用的 `设预览`。
import { setPreview } from "./review-prose";
// ⚠️ 三种行内扩展的默认值在这儿：`options.inlineMarks` 没传时就是它。
import { DefaultInlineExtensionFlags } from "./inline-marks";
// ⚠️ `undefined` 落到它（`input` 档），与 Rust 那边的 `Default` 一致。
import { DefaultPunctuationSettings } from "./smart-punctuation";
// 写作模式（专注 / 打字机）：装配在 `assemble.ts`，这里管"开关被拨动时推给
// 活着的实例"。
import { rollToCurrentLine, setWritingMode, type WritingMode } from "./writing-modes";
// 查找与替换。**匹配逻辑在那边**，这里只把它的命令接到句柄上；
// 源码模式那一侧共用同一个纯函数（见那个文件头）。
import {
  setQuery,
  walk,
  clearRemove,
  replaceReplaceCurrent,
  replaceAll as replaceAllMatches,
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
  SelectionContent,
  EditorHandle,
  CreateOptions,
} from "./create-types";
// 本文件自己还要用这四样（`createEditor` 的签名与返回值、`跑一条命令` 的签名）。
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
  const {
    root,
    initialMarkdown,
    onChange,
    documentPath = null,
    readOnly = false,
    physics = false,
    // ⚠️ 默认 `false` = **宽松档**，与 `Settings.strict_markdown` 的默认值一致
    // （见 `atx.ts` 文件头那句"默认关意味着把 Nota 从来的行为放宽"）。
    // 调用方忘了传的后果只是"`#你好` 在正文里也画成标题写法"，不会写坏任何东西。
    strict = false,
  } = options;
  // ⚠️ 单独取出来而不是解构：它可选，而 `.use([])` 与 `.use([插件])` 这两种
  // 写法在 Milkdown 里都是合法的——不传时给空数组，比给一个"什么都不做的
  // 插件"干净（后者每次事务都要跑一趟）。

  // 三种行内扩展语法的开关。**建实例时取一次**（下面 `.use()` 那几行要它，
  // 而转换器是捕获式地拿着它的）——改设置要重建编辑器，与 `physics` 同一条
  // 口径，理由见 `create-types.ts` 的 `inlineMarks` 那一格。
  const inlineExtensions = options.inlineMarks ?? DefaultInlineExtensionFlags;

  // 智能标点那一组。**同样建实例时取一次**（输入规则是注册制的），
  // 改设置要重建编辑器——理由见 `create-types.ts` 的 `标点` 那一格。
  // ⚠️ `undefined` 落到 `默认标点设置`（`input`），与 Rust 那边的 `Default` 一致。
  const punctuation = options.punctuation ?? DefaultPunctuationSettings;

  // 自动更正开不开。⚠️ `undefined` **不等于关**：Rust 那边的默认是 `true`，
  // 这里跟着取 `true`（见 `create-types.ts` 的 `自动更正` 那一格）。
  const selfActionMoreCorrect = options.selfActionMoreCorrect ?? true;

  // Emoji（短代码替换 ＋ 输入补全）。⚠️ 同样是**建实例时取一次**：
  // 输入规则是注册制的、补全面板那条插件也建在这里，改设置要重建编辑器
  // ——理由见 `create-types.ts` 的 `emoji` 那一格。
  const emoji = options.emoji ?? true;

  // 智能符号补全（`ui/pane-editors.ts` 传进来，来自 `settings.editor.smart_symbols`）。
  // ⚠️ `undefined` **不等于关**：Rust 那边的默认是 `true`（用户 2026-09-28
  // 点名「默认为开」），这里跟着取 `true`——见 `create-types.ts` 的 `智能符号` 那一格。
  const smartAbleSymbolNumber = options.smartAbleSymbolNumber ?? true;

  // ── 开头那段 front matter：切下来存住，出去的时候原样拼回 ──────────────
  //
  // ⚠️ 编辑器**读不懂**它（CommonMark 里 `---` 是分割线），不切的话"打开再
  // 存盘"会把它改写成正文——静默的数据损毁，实测与根因见 `front-matter.ts`
  // 文件头。切下来之后它**不在文档树里**，编辑器一个字节都碰不到。
  //
  // ⚠️ **只读实例也切**（分屏右侧预览、导出用的离屏实例）：那两个同样只该
  // 画**正文**，front matter 是元数据，不该出现在预览和导出的 HTML 里。
  // 它们不读 `getMarkdown`，所以拼回那一步对它们是空跑。
  const header2 = splitFrontMatter(initialMarkdown);
  let frontMatter = header2.frontMatter;

  /**
   * 上一次设进去的那份预览。**按对象身份去重**用的（见 `setReview`）。
   * 初值是建实例时那一份，与插件 `init` 里算的是同一个对象。
   */
  let aboveCountPreview: changePreview | null = options.review ?? null;

  // 装配（`.config()` ＋ 整条 `.use()` 链）2026-10-07 整块搬去了 `./assemble`
  //（本文件那天 1006 行，`docs/07` 第 89 项）。这里只把"装什么"列成一张清单：
  // 下面每一项为什么是回调、为什么是这个值，见 `assemble.ts` 与 `create-types.ts`。
  const editor = await installConfigureActualExample({
    root,
    body2: header2.body2,
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
    // ⚠️ 取的是**这一刻**那一段：`markdownUpdated` 拼回去时它可能已经换了
    //（换文档、源码模式切回来都走 `setMarkdown`，那里会重新切一刀）。
    getFrontMatter: () => frontMatter,
    // ⚠️ 斜杠菜单那条路要的是 `跑一条命令`**本身**（它是本文件的函数声明，
    // 会被提升，所以这里包一层不影响它"在 `.use()` 之后才定义"）。
    runOneItemCommand: (name, payload) => runOneItemCommand(name, payload),
    options,
  });

  // 实例建好时如果打字机模式已经开着，先把当前行摆正再交给调用方——
  // 插件那个 `view.update` 在"建好那一刻"不会跑（没有事务），不补这一下
  // 的话用户得先打个字才看得到居中效果。
  if (!readOnly && options.writingModes?.typewriter) {
    editor.action((ctx) => rollToCurrentLine(ctx.get(editorViewCtx)));
  }

  const clusterFocus = () =>
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
  function runOneItemCommand(name: EditorCommand, payload?: CommandPayload): void {
    // ⚠️ **front matter 那一条在这一层拦下来**，不进 `command-table`：那张表
    // 只吃 `(editor, payload)`，够不着这个闭包里的 `前置块`，也够不着
    // `onChange`（见 `command-table.ts` 里 `Exclude` 那一段）。
    if (name === "frontMatter") {
      writeFrontMatter(payload?.frontMatter);
      return;
    }
    // ⚠️ 表与派发逻辑 2026-09-28 搬去了 `./command-table`（行数），这里只剩
    // 一层薄壳——两个用家（`runCommand` 与斜杠菜单）仍然走同一个入口。
    runCommand(editor, name, payload);
  }

  /**
   * 换掉开头那段 front matter（`docs/07` 第 64 项）。`undefined` = **确保有一段**。
   *
   * 三条含义写在 `CommandPayload.frontMatter` 那一格上，这里只说三件实现上的事：
   *
   * ⚠️ **它绕过了 `markdownUpdated` 那条路，自己调 `onChange`**。改的是文档树
   * **之外**的那一段，序列化出来的正文前后一模一样，上面那条
   * `if (markdown !== prev)` 于是不会成立——不自己报的话，宿主根本不知道这段
   * 变了：标签不脏、撤销栈里没有、**自动保存会把这次改动丢掉**。
   *
   * ⚠️ **编辑器看不见、撤销栈里也没有它**（它不在文档树里）。所以这里派不出
   * 事务，也无从"撤销"——`Ctrl+Z` 撤的是正文，撤不回这一段。这是"不引
   * `remark-frontmatter`"那条取舍的直接代价，如实写在 `docs/05` 与 `docs/07`。
   *
   * ⚠️ 只读实例（分屏右侧预览、导出用的离屏实例）**什么都不做**：那两份连
   * `onChange` 都没有，改了也传不出去，只会在自己的闭包里留下一份假的文本。
   */
  function writeFrontMatter(body: string | null | undefined): void {
    if (readOnly) return;
    const newValueBlock =
      body === undefined
        ? frontMatter ?? replaceFrontMatter(null, newFrontMatterTemplate)
        : replaceFrontMatter(frontMatter, body ?? ""); // `null` 与空白串一个意思：删掉这一段
    if (newValueBlock === frontMatter) return; // 一个字都没变（含"本来就有、这次只是确保"）
    frontMatter = newValueBlock;
    // ⚠️ 报出去的是**整篇**（拼回前置块），与 `getMarkdown`、`markdownUpdated`
    // 那两条路同一个口径——调用方手里那份文本永远要跟磁盘上那份对得上。
    onChange?.(
      joinFrontMatter(
        frontMatter,
        editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc)),
      ),
    );
  }

  /** 把插入点挪到文档最开头。⚠️ 只给"刚打开一篇文档"，见接口上那条长注释。 */
  const cursorToOpenHead = () =>
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
        return joinFrontMatter(frontMatter, serializer(view.state.doc));
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
      const newValueOf = splitFrontMatter(markdown);
      frontMatter = newValueOf.frontMatter;
      const replaceReplace = replaceAllContent(newValueOf.body2);
      editor.action((ctx) => {
        replaceReplace(ctx);
        if (readOnly) return;
        const view = ctx.get(editorViewCtx);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.atStart(view.state.doc)).scrollIntoView(),
        );
      });
    },

    focus: clusterFocus,
    focusAtStart: cursorToOpenHead,

    // **在光标处插一段**（插件的 `nota.document.insert_at_cursor`，`docs/07`
    // 第 14 项）。⚠️ 守卫与 `脚本里的插入` 同一个形状：少判 `readOnly` 会在
    // 分屏右边那个只读预览格子里把文档改掉（`heading-on-enter.ts` 顶上那段
    // 记着这条教训）。
    //
    // ⚠️ `tr.insertText(文本, from, to)`：**选区非空时是替换**，这正是
    // "把选中的内容换成插件给的那段"该有的样子。光标落在插进去的内容**末尾**
    //（ProseMirror 的默认行为），所以插件连着插两段是"后一段接在前一段后面"。
    //
    // ⚠️ 焦点不抢过来：这条路是**插件**发起的，用户可能正在别处（面板里）
    // 点着，把焦点抢回正文会让他刚点的那一下白点。要抢的是"用户主动按了
    // 某个按钮"那类动作，不在这一条里。
    insertAtCursorPlace: (text: string) => {
      if (readOnly) return false;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { from, to } = view.state.selection;
        view.dispatch(view.state.tr.insertText(text, from, to));
      });
      return true;
    },

    setWritingModes: (mode2: WritingMode) =>
      editor.action((ctx) => setWritingMode(ctx.get(editorViewCtx), mode2)),

    setReview: (preview: changePreview | null, viewMode: previewMode) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        // ⚠️ 只有**预览换了**才派事务：派一次要序列化整篇 + 解析整篇目标文本，
        // 光切看法不该付这个代价（看法是纯 CSS 的开关）。
        if (preview !== aboveCountPreview) {
          aboveCountPreview = preview;
          setPreview(view, preview);
        }
        if (preview) setViewMode2(view.dom, viewMode);
        else removeViewMode(view.dom);
      }),

    // ── 查找与替换。每条就是"拿到 view，交给 `find.ts` 里的函数"──────
    // ⚠️ 不在这里写任何匹配逻辑：口径只有 `find.ts` 一份（见它的文件头）。
    setFind: (query: string, options: FindOptions) =>
      editor.action((ctx) => setQuery(ctx.get(editorViewCtx), query, options)),
    findStep: (direction: 1 | -1) =>
      editor.action((ctx) => walk(ctx.get(editorViewCtx), direction)),
    clearFind: () => editor.action((ctx) => clearRemove(ctx.get(editorViewCtx))),
    replaceCurrent: (text: string) =>
      editor.action((ctx) => replaceReplaceCurrent(ctx.get(editorViewCtx), text)),
    replaceAll: (text: string) =>
      editor.action((ctx) => replaceAllMatches(ctx.get(editorViewCtx), text)),

    // 选区那一份交给 ProseMirror 自己序列化（`serializeForClipboard`）：
    // 它给出的 HTML 与按 Ctrl+C 时写进剪贴板的**是同一份**，所以菜单里点
    // 「复制」和按快捷键得到的东西不会两样。
    //
    // ⚠️ 这里刻意不接 `transformCopied` 之类的钩子：复制出去的内容该是什么样，
    // 唯一的口径是 PM 那一份。想改就改 `clipboardTextSerializer`（全局一处），
    // 在调用点各写一份的话，两种复制方式迟早分叉。
    selection: () =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const sel = view.state.selection;
        if (sel.empty) return null;
        const { dom, text } = view.serializeForClipboard(sel.content());
        return { text, html: dom.innerHTML };
      }),

    jumpToMarkTitle: ({ index }) =>
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
        rollActionToPosition(view, pos + 1);
      }),

    runCommand: (name: EditorCommand, payload?: CommandPayload) => {
      // ⚠️ 命令本身在 `跑一条命令` 里（与斜杠菜单共用一份实现），这里只多
      // 一件"把焦点交回正文"的收尾——见那条函数上的注释。
      runOneItemCommand(name, payload);

      // ⚠️ 跑完必须把焦点交回编辑区。命令是从**菜单按钮**上点下去的，
      // 那一刻 DOM 焦点在按钮上；命令本身改的是 ProseMirror 的 state
      //（它自己的 selection 还在原处，所以命令能正确生效），但**光标不会
      // 自己回到正文**——用户点完「加粗」接着打字，字会打到一个没有焦点的
      // 编辑区里，看起来就是"菜单点完就卡住了"。
      //
      // ⚠️ **`frontMatter` 那一条不抢焦点**：它多半是从正文上方那个 YAML
      // 编辑框里发出来的（`ui/FrontMatterBanner.tsx` 每次提交都发一条），每次提交
      // 都把光标从输入框里拽回正文的话，用户根本没法在框里连着打第二个字。
      // 理由与"斜杠菜单不走这一层"是同一条：**焦点本来就在该在的地方**。
      // （从菜单栏点那一条进来的情形代价也小：焦点留在菜单上，用户点一下
      // 编辑框就行——反过来"光标不知什么时候被夺走"要难查得多。）
      if (name !== "frontMatter") clusterFocus();

      // 这一侧恒为 `true`（见 `EditorHandle.runCommand` 那段）。
      return true;
    },

    destroy: () => {
      editor.destroy();
    },
  };
}

// ⚠️ 这里**曾经**导出一个 `parseMarkdown(editor, markdown)`（拿 `parserCtx` 把文本
// 解析成 ProseMirror 文档然后返回），2026-10-04 删掉了，第 31 项就此结清。删的
// 理由：它**没有任何调用点**，而且那条"进编辑器的文本要先过一遍解析"的口径
// 靠它也落实不了——`replaceAll` 内部走的本来就是同一个解析器（remark 宽容、
// 不抛错），先手动解析一遍再把结果扔掉，可观测的行为一个字节都不会变。
// "语法坏掉的串只能靠肉眼发现"是真的，但它是 remark 的本性，不是一个
// 没人调用的函数能治的。口径原文在 `docs/03` 的缺陷表里，那里已经同步结清。
