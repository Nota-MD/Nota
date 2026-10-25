/**
 * **编辑区里画什么**（2026-09-27 从 `App.tsx` 搬出，那边 995 行、硬上限 1000）。
 *
 * # 搬的是哪一块、判据是什么
 *
 * 就是 `<main class="app-main">` 里面那一整棵：外部改动提示条 · 查找替换条 ·
 * 格式化工具栏 · 改动预览那条细条 · **正文**（没文档时是主页）· 插件面板 ·
 * 外部改动对照。判据是老规矩（见 `App.tsx` 文件头）：**这一块自己有一份完整的
 * 理由可写**——它回答的是同一个问题："此刻这一格该画什么"。
 *
 * ⚠️ **不是"顺手重构"**：搬之前 `App.tsx` 995 行，再往上加任何一件新功能都会
 * 顶破那条线。搬的时候**一行逻辑没改**，只是把外面那些局部名换成了 `接线.xxx`。
 *
 * # 为什么收**一个对象**而不是四十来个 props
 *
 * 同 `ui/AppDialogs.tsx` 的判据：这一块要的东西跨了七八个 hook 的出口，摊成
 * 四十来个 props 之后，"哪一件来自谁"就散了——而漏掉一件的症状是**那块界面
 * 安静地不工作**（不报错）。收成一个对象，来源在 `App.tsx` 那一个字面量里一眼看得全。
 *
 * ⚠️ 里面那几个 `xxx出口` 字段是**整个 hook 返回值**，不是挑出来的几项：
 * 那些对象要么是 `useMemo` 出来的、要么每帧重建（反正本组件随 `App` 重渲染），
 * 挑字段只会多一层"这里要哪个"的账，而那份账在别处已经有一份了。
 *
 * # ⚠️ `data-review` 是**推导**出来的，不再读那个原始对象
 *
 * 搬之前写的是 `预览 ? (预览.kind === "diff" ? "inline" : "true") : undefined`。
 * 现在 `预览` 这个原始值就在 [`预览出口`] 里（`活跃预览` / `面板预览` 是它的
 * 两个分派结果，一个 `kind` 只可能命中一边），所以这里写成"先看 `外部对照`、
 * 再看是哪一种预览"。⚠️ **判据一个字没变**——它给的是同一个字符串。
 * 留着读原始对象也行，但那要多传一个字段，而多传的每一个字段都是一处会分叉的账。
 */

import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";

import type { CommandState } from "@/editor/command-state";
import type { Document, ViewMode } from "@/bridge/ipc";
import type { Settings } from "@/bridge/types";
import type { Toast } from "@/ui/Toasts";
import { recognizeTextItemType } from "@/editor/file-kind";
import { EditorPane, type EditorPaneHandle } from "@/ui/EditorPane";
import { ExternalChangeBar } from "@/ui/ExternalChangeBar";
import { ExternalDiffPane } from "@/ui/ExternalDiffPane";
import { FindBar } from "@/ui/FindBar";
import { FormatBar } from "@/ui/FormatBar";
import { Home } from "@/ui/Home";
import { ReviewBar } from "@/ui/ReviewBar";
import { ReviewPane } from "@/ui/ReviewPane";
import { TableToolbar } from "@/ui/TableToolbar";
import type { Dialogs } from "@/ui/useDialogs";
import type { documentApi } from "@/ui/useDocuments";
import type { commandApi } from "@/ui/useEditorCommands";
import type { ExternalPartChangeActionOutputMouth } from "@/ui/useExternalChanges";
import type { findBar } from "@/ui/useFindBar";
import type { PluginsState } from "@/ui/usePlugins";
import type { PreviewModeOutputMouth } from "@/ui/useReviewView";
import type { MeetingSpeechOutputMouth } from "@/ui/useSession";
import { usePointLink } from "@/ui/useLinkClick";

/** 这一格要的全部东西。见文件头「为什么收一个对象」。 */
export interface editorAreaWiring {
  /** `<main>` 自己那个挂载点。⚠️ 「悬停显形」那段量鼠标位置的窥视带要它。 */
  mainArea: RefObject<HTMLElement | null>;
  /** 格式化工具栏那排按钮的挂载点（同一段窥视带也要它）。 */
  cellStyleConvertBar: RefObject<HTMLDivElement | null>;
  /** 编辑器句柄：大纲跳转、查找、菜单命令都往它身上送。 */
  editor: RefObject<EditorPaneHandle | null>;
  /** 此刻前台那份文档。`null` = 一份都没开，主区画主页。 */
  activeDoc: Document | null;
  settings: Settings | null;
  /** 三种编辑模式（所见即所得 / 源码 / 分屏）。⚠️ `App.tsx` 的 `viewMode`：**实际**模式（过完降级）。 */
  viewMode: ViewMode;
  focusMode: boolean;
  typewriter: boolean;
  /** 正文只读模式（视图菜单）。 */ onlyReadMode: boolean;
  /** 格式化工具栏此刻该不该画（三档里由 `ui/useChromeVisibility.ts` 算出来）。 */
  cellStyleConvertBarOpen: boolean;
  /**
   * 收起格式工具栏（**它右端那颗 ×**，2026-10-04 补，`docs/07` 第 49 项）。
   *
   * ⚠️ 由 `App.tsx` 交下来，落点就是上面那个 `格式化栏开着` 的**同一个 setter**
   * （`setChrome({ toolbar: "never" })`）——这里只负责把它接到那颗按钮上。
   */
  hideFormatBar: () => void;
  /** 光标那儿的格式状态（工具栏那排按钮亮不亮）。 */
  commandState: CommandState | null;
  setCommandState: Dispatch<SetStateAction<CommandState | null>>;
  /** 转交一条编辑命令（`ui/useEditorCommands.ts`）。 */
  runCommand: commandApi["run"];
  /**
   * 「插入图像」那一条（`ui/useImageInsert.ts` 的 `插入图像`）。
   *
   * ⚠️ 工具栏那颗图片键**必须**走它，不能交给 `跑命令("image")`：编辑器那条
   * `image` 要的是 `{src, alt}` 两个参数，而工具栏点下去一个都不带 ⇒ 插进去的是
   * 一张 `src=""` 的空图，屏幕上看就是"点了没反应"（用户 2026-10-11：
   * 「现在工具栏没法插入图片」）。链接那颗同理（`useEditorCommands` 里 `link`
   * 那条改道）。
   */
  insertImageLike: () => Promise<void>;
  /** 几个 hook 的出口。⚠️ 整个给，不挑字段（见文件头）。 */
  documentApi: documentApi;
  findBar: findBar;
  previewOutputMouth: PreviewModeOutputMouth;
  changeActionOutputMouth: ExternalPartChangeActionOutputMouth;
  MeetingSpeechOutputMouth: MeetingSpeechOutputMouth;
  plugin: PluginsState;
  /** 自绘对话框那一套（`ui/useDialogs.ts`）：面板里那颗按钮要问参数。 */
  dialog: Dialogs;
  /**
   * 从磁盘重读一次文档列表（编辑器那边存/另存之后要刷新标签栏）。
   * ⚠️ 返回 `Promise<unknown>` 而不是 `Promise<void>`：它给的是重读之后的整份
   * 列表，而这里只关心"刷完了没有"。口径与 `EditorPane` 的 `onDocsChanged`
   * 一模一样——那一边也是这么写的，两边别分叉。
   */
  refreshDocs: () => Promise<unknown>;
  toast: (message: string, level?: Toast["level"]) => void;
  /**
   * 底部那一条（**标签栏 ＋ 状态栏**，2026-09-30）。
   *
   * ⚠️ **为什么是这里的一个槽位、而不是继续留在 `App.tsx` 的返回里**：
   * 用户照 Typora 提的要求是「注意下方变化」——侧栏要一直通到窗口底。
   * 这两条原来排在 `.app-body` 外面，横跨整个窗口宽，于是**侧栏底下那一段
   * 被它们占了**。要让它只占中间这一栏，它们就得是 `.app-main` 的子节点，
   * 而 `.app-main` 这根 `<main>` 是这个组件画的（`data-review`、`ref` 都在它身上，
   * 挪不走）。
   *
   * ⚠️ **节点由 `App.tsx` 建好、这里只负责落位**：这一槽位里的东西要读
   * `docs` / `activeId` / `专注状态` / `sidebarOpen` 那一批，全在 App 手里，
   * 为了"让 EditorArea 自己建"再把它们搬一遍，等于给同一个状态开第二条路。
   */
  bottomPart: ReactNode;
}

/**
 * ⚠️ 形参是**一个叫 `接线` 的 prop**（`{ 接线 }` 解构），不是把接口摊成 props
 * ——调用处因此写成 `<EditorArea 接线={{ … }} />`，那一整个字面量是**一处**看得完的账。
 */
export function EditorArea({ wiring }: { wiring: editorAreaWiring }) {
  const { mainArea, cellStyleConvertBar, editor, activeDoc, settings, viewMode, focusMode, typewriter, onlyReadMode } = wiring;
  const { cellStyleConvertBarOpen, hideFormatBar, commandState, setCommandState, runCommand, insertImageLike, refreshDocs, toast } =
    wiring;
  const { documentApi, findBar, previewOutputMouth, changeActionOutputMouth, MeetingSpeechOutputMouth, plugin, dialog } = wiring;

  // 正文里点一下链接那件事（`docs/07` 第 96 项）：单击弹同一个「链接」框、
  // `Ctrl`＋单击交给系统浏览器。⚠️ 挂的是 `<main>` 上的一条 `click` 委托，
  // 判据（只认可编辑那一侧、地址危险不放行）写在 `ui/useLinkClick.ts` 文件头。
  usePointLink({
    mainArea,
    askLink: dialog.askLink,
    runCommand,
    toast,
    openDocument: documentApi.openPath,
    documentPath: activeDoc?.path ?? null,
  });

  const { newDoc, openViaDialog, openFolder, recordActivity } = documentApi;
  const { findOpen, replaceReplaceLine, matchSituationSituation, reportMatch, closeFind, replaceReplaceCurrent, replaceAll } = findBar;
  const {
    activeJumpPreview,
    panelPreview,
    viewMode: reviewViewMode,
    setViewMode,
    backOutputPreview,
  } = previewOutputMouth;
  const { changeAction: ExternalPartChangeAction, ignoreOmit: ignoreOmitExternalPartChangeAction, heavyNewValueLoadEnter: heavyNewValueLoadEnterExternalPart, checkSeeFixChange, correctAccording: ExternalPartCorrectAccording, closeCorrectAccording } = changeActionOutputMouth;
  const { recent, openRecent, rollActionPosition, recordRollAction } = MeetingSpeechOutputMouth;

  return (
    // ⚠️ `data-review` 是给 CSS 的开关（`styles/review.css`）：
    // `"true"` = 面板形态，正文**只是藏起来，不卸载**（`.editor-pane`
    // 里那个 CodeMirror 带着撤销栈和光标，卸载一次就全没了）；
    // `"inline"` = 改动预览，正文留在原地，改动画在它身上。
    <main
      className="app-main"
      ref={mainArea}
      data-review={
        ExternalPartCorrectAccording
          ? // 外部改动那份对照是**块**（占编辑区，正文让位），不是画在正文
            // 身上的装饰——它跟插件面板同一形态，所以走 `"true"` 那一支。
            "true"
          : activeJumpPreview
            ? "inline"
            : panelPreview
              ? "true"
              : undefined
      }
    >
      {/* 外部改动提示条（`ui/ExternalChangeBar.tsx`）。⚠️ **排在编辑区那两块
          之前**，因为它必须在**任何模式、任何预览形态**下都看得见——
          磁盘上那份被改了这件事，不会因为用户此刻开着预览就不算数。 */}
      <ExternalChangeBar
        changeAction={ExternalPartChangeAction}
        ignoreOmit={ignoreOmitExternalPartChangeAction}
        heavyNewValueLoadEnter={heavyNewValueLoadEnterExternalPart}
        checkSeeFixChange={(id) => void checkSeeFixChange(id)}
        correctAtSee={ExternalPartCorrectAccording?.id ?? null}
        closeCorrectAccording={closeCorrectAccording}
      />
      {activeDoc && findOpen && (
        // ⚠️ key 要归零（换文档时清掉查询——理由见下），但**必须带前缀**：
        // 这个键值不能和下面 `EditorPane` 那个撞。同层兄弟键值相撞会让
        // React 把该删的旧 fiber 既不复用也不删，**被关掉的条子永远
        // 留在 `.app-main` 里**（BUG-33，2026-09-25）。整条机理见
        // `docs/04` 的「查找和替换条」一节，别把前缀省掉。
        //
        // ⚠️ 换文档为什么要归零：查找条里的查询是**组件自己的状态**，
        // 不归零的话，B 文档那个编辑器手里没有任何查找状态（新实例），
        // 而条子里还写着 A 文档的查询——条子上的"3 / 12"和正文里
        // 一个高亮都没有，两边对不上。
        //
        // ⚠️ 两条查找回调**不包 `useCallback`**：`FindBar` 把它们存进
        // ref 读（见那边的注释），身份抖不抖它不受影响；而这里包一层
        // 反而多两行噪声。
        <FindBar
          key={`find-${activeDoc.id}`}
          status={matchSituationSituation}
          onQuery={(q, o) => editor.current?.setFind(q, o)}
          onStep={(d) => editor.current?.findStep(d)}
          onReplace={replaceReplaceCurrent}
          onReplaceAll={replaceAll}
          onClose={closeFind}
          showReplaceReplace={replaceReplaceLine}
        />
      )}
      {activeDoc && cellStyleConvertBarOpen && (
        // ⚠️ **只在有文档时画**。没文档时它是一排按不动的按钮
        //（命令全都没有活动文档可作用），那比不画更让人困惑。
        //
        // ⚠️ `onCommand` 传的是 `run` **本身**，不包一层箭头：
        // 包了的话每次 `App` 重渲染都是一个新函数身份，`FormatBar`
        // 那十几颗按钮就整排重画一遍。
        <FormatBar
          ref={cellStyleConvertBar}
          state={commandState}
          // ⚠️ 图片那颗走"先弹框问地址/文件、再落笔"那条路（见上面 `插入图像` 那段注释）；
          // 其余照旧交给编辑器命令那一侧（链接那颗由 `useEditorCommands` 自己改道）。
          onCommand={(id) => (id === "image" ? void insertImageLike() : runCommand(id))}
          onHide={hideFormatBar}
        />
      )}
      <TableToolbar
        visible={viewMode === "wysiwyg" && Boolean(commandState?.inTable)}
        documentKey={activeDoc?.id ?? ""}
        run={runCommand}
      />
      {activeJumpPreview && (
        // 改动预览顶上那一条细条。⚠️ **排在编辑区前面**（同一个 flex
        // 列里的上一行），不是编辑区的子节点——分屏那两个窗格是横向
        // flex，塞进去会把它们挤下去（理由写在 `ui/ReviewBar.tsx` 顶上）。
        <ReviewBar
          review={activeJumpPreview}
          viewMode={reviewViewMode}
          onViewMode={setViewMode}
          // ⚠️ 包一层：`调插件` 要插件 id（`命令` 只在插件内部唯一），
          // 而按钮给的只是命令名。插件 id 在这一份预览里，闭包里取。
          onCall={(command) => void plugin.configure(activeJumpPreview.plugin, command)}
          onClose={() => void plugin.receivePreview()}
          // ⚠️ 与 `EditorPane` 那条 `onReviewEscape` **同一个函数**：焦点
          // 在正文里还是在这条工具栏上，按 `Esc` 应当做同一件事。
          onEscape={backOutputPreview}
        />
      )}
      {activeDoc ? (
        <EditorPane
          ref={editor}
          key={activeDoc.id}
          doc={activeDoc}
          mode={viewMode}
          // ⚠️ 非 Markdown 的文件在**源码模式**里不套 Markdown 文法与配色
          //（理由见 `editor/file-kind.ts` 顶上那段：拿 `#` 去染一份 Python 是
          // 一幅**错的画**）。这里**按路径现算**，不接 App 递下来的一份——
          // 文件是不是 Markdown 是它的属性，而"降级"是这一次打开时的决定
          //（用户手动切过模式之后降级就没了，可它**仍然**不是 Markdown）。
          plainText={activeDoc.path !== null && recognizeTextItemType(activeDoc.path) === "text"}
          strict={settings?.strict_markdown ?? false}
          physics={settings?.enable_physics ?? false}
          // Emoji 输入辅助（短代码替换 ＋ 补全面板）。⚠️ 这里是**一个**
          // 布尔而不是整整一页设置：`EditorPane` 只把它原样喂给 `createEditor`
          // 的 `emoji` 那一格（理由见 `create-types.ts`）。
          emoji={settings?.editor?.emoji_autocomplete ?? false}
          // **智能符号补全**（`settings.editor.smart_symbols`，2026-09-28，
          // **默认开**）。⚠️ 同 `emoji` 那条：一个布尔，原样喂给 `createEditor`
          // 的 `智能符号` 那一格（关掉 = `editor/auto-pair.ts` 整条不装）。
          // ⚠️ **兜底取 `true`**，与 Rust 那边 `smart_symbols` 的默认值一致——
          // 取 `false` 的话，设置还没读回来那一小会儿编辑器是不补的。
          smartAbleSymbolNumber={settings?.editor?.smart_symbols ?? true}
          // 整整一页 Markdown 设置。⚠️ 只有 `editor/inline-marks.ts` 那三个
          // 开关用得上（高亮/上标/下标），挑字段与记忆化都在 `EditorPane`
          // 里做——`App.tsx` 在 1000 行硬线上，这里只给一行。
          markdown={settings?.markdown}
          focusMode={focusMode}
          typewriter={typewriter}
          onlyReadMode={onlyReadMode}
          // 正文列宽那一对（第 107 项，2026-10-09）：
          // ⚠️ **开关默认 `false`**——不写这个变量时 `editor.css` 落到
          // `max-width: none`，正文列铺满编辑区（两侧各 56px 装订线）。
          contentWidth={settings?.content_width ?? 760}
          limitTextWidth={settings?.limit_text_width ?? false}
          // 拼写检查用的语言（2026-10-10，当天晚些从"一门"改成"多门"）。
          // ⚠️ **`lang` 这条 HTML 属性只放得下一门**，所以这里取**第一门**
          // （用户勾的第一个）当作文档语言；多门的挑选本身在
          // `settings.editor.spellcheck_langs`，落到引擎上由
          // `ui/useSpellcheck.ts` 负责。⚠️ 空数组 → `undefined` = 不写这个属性
          // （"跟随系统"那一档），而设置还没读回来也走同一个 `undefined`——
          // 两种"空"在这里合流是**结果相同**（都不写属性），不是语义被抹平。
          combineWriteLanguage={settings?.editor?.spellcheck_langs[0]}
          // 正文排版那四项（行距 / 段距 / 字体 / 字号，文档主题那一页）。
          // ⚠️ 整份给，不挑字段（同 `markdown` 那一格的判据）：它在
          // `EditorPane` 里要被一起算成 CSS 变量、写在同一处。
          // `undefined` = 设置还没读回来，那时一个变量都不写。
          documentTypography={settings?.document}
          // 滚动位置（第 76 项那两格：记住 + 恢复）。
          // ⚠️ `初始滚动` 是**编辑器实例建出来那一刻读一次**的值
          //（`EditorPane` 里那句注释），所以这里给 `undefined` 表示
          // "没记过、别动它"——不能给 `0`，那是"滚到顶上"这个有意义的
          // 位置（比例 0 是短文档的正常值）。
          // ⚠️ `onScroll` 现写箭头函数**没问题**：那边把它存进 ref 读，
          // 身份抖不抖它不受影响（见 `EditorPane` 的 `滚动回调Ref`）。
          initialStartRollAction={rollActionPosition(activeDoc.path)}
          onScroll={(compareExample) => {
            if (activeDoc.path) recordRollAction(activeDoc.path, compareExample);
          }}
          onCommandState={setCommandState}
          onFindStatus={reportMatch}
          onToast={toast}
          onDocsChanged={refreshDocs}
          onActivity={recordActivity}
          // 改动预览按**两种形态**分派：`diff` 这一形态的图画在编辑区
          // 自己身上，所以那一份要交给它；`panel` 形态跟它无关（那是
          // 下面那个 `ReviewPane` 的事）。
          review={activeJumpPreview}
          previewMode={reviewViewMode}
          onReviewEscape={backOutputPreview}
        />
      ) : (
        <Home
          plugins={plugin.plugins}
          onNew={newDoc}
          onOpen={openViaDialog}
          onOpenFolder={openFolder}
          recent={recent}
          onOpenRecent={(p) => void openRecent(p)}
        />
      )}

      {panelPreview && (
        // 编辑区里的**插件面板**（用户 2026-09-25 要的"直接在 Markdown
        // 编辑区域预览"）。⚠️ 它排在正文**后面**，靠 CSS
        // （`.app-main[data-review="true"]`）让正文让位——不是"二选一渲染"：
        // 正文那一块不能卸载，理由见上面 `data-review` 那段。
        <ReviewPane
          plugin={panelPreview.plugin}
          panel={panelPreview.panel}
          // 标题与那句语言提示的合成都在 `ReviewPane` 那边（要拿插件清单
          // 和面板清单两张表查名字/查语言）。放这边的唯一理由是这个文件
          // 贴着 1000 行上限（`AGENTS.md` §0.4），多一行都是负担。
          plugins={plugin.plugins}
          panels={plugin.panels}
          onClose={() => void plugin.receivePreview()}
          onCall={plugin.configure}
          askPrompt={dialog.askPrompt}
        />
      )}

      {ExternalPartCorrectAccording && (
        // **磁盘上那份和编辑器里这份**的对照（用户点了提示条上的
        // 「查看修改」）。⚠️ 它是**只读**的、一个可点节点都没有——理由
        //（以及"为什么不给它一颗接受按钮"）写在 `ui/ExternalDiffPane.tsx` 顶上。
        //
        // ⚠️ 它和上面那块插件面板**可以同时摊着**（各占一半）。罕见，
        // 但不必为它加优先级：两块都是用户自己点开的，替他把其中一块
        // 藏起来，他会以为是刚点的那下没生效。
        <ExternalDiffPane correctAccording={ExternalPartCorrectAccording} onClose={closeCorrectAccording} />
      )}

      {/* 底部那一条（标签栏 ＋ 状态栏）。⚠️ **排在最后**：它俩是这一列的
          收尾，前面那些面板摊开时也照旧贴在底下（标签栏与状态栏是"现在开着
          哪几份文档 / 这一份多少字"，跟预览画什么无关）。
          ⚠️ 上面那几个面板的让位规则（`styles/review.css`）**没有把它俩算进去**
          ——那一份是"逐个排除"的写法，没点名的就留着。 */}
      {wiring.bottomPart}
    </main>
  );
}
