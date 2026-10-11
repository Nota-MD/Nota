/**
 * 应用外壳：状态编排 + 布局。
 *
 * 这一层只做三件事——**取数据、派事件、拼布局**。编辑器的活全在
 * `ui/EditorPane.tsx`，文件树的活在 `ui/Sidebar.tsx`，别往这里堆。
 *
 * ⚠️ 本文件**常年在行数上限附近**，所以从 2026-09-23 起一直在把两类块往外搬：
 * "只画不决策"的（`TopBar` / `TabBar`）和"判据/状态"的（`ui/useMenus.ts`、
 * `useDialogs` / `useExport` / `useDocTheme` / `useEditorCommands` / `usePlugins` /
 * `useChromeVisibility` / `useDocuments` / `useClipboard` / `useImmersive`）。
 * 搬走的清单与各自的日期见 `docs/09` §2。判据是**和外壳骨架无关**：那块东西
 * 自己有一份完整的理由可写，留在本文件里只会把上面那三件事淹掉。
 *
 * ⚠️ 搬完要**重数**行数：头两次搬完它反而还在 916 行——同一批里又往里加了
 * 格式工具栏与查找条的接线，搬走的和加进来的正好抵掉。数出来的才算数。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  type DocId,
  type Document,
  type Settings,
  type DocThemeInfo,
  type TreeNode,
} from "@/bridge/ipc";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { useFileKind } from "@/ui/useFileKindMode";
// ⚠️ 只要类型：`EditorPane` 这个组件本身已经搬到 `ui/EditorArea.tsx` 里去画了，
// 这边留着的是那个句柄类型（`editorRef` 要它）。写成 `import type` 免得再被
// 当成"没用上的组件"清掉。
import type { EditorPaneHandle } from "@/ui/EditorPane";
import { resolvePick } from "@/ui/commands";
import { useT } from "@/i18n";
import { PluginDock } from "@/ui/PluginDock";
import { Sidebar, type SidebarTab } from "@/ui/Sidebar";
import { 口径键, 读口径 } from "@/ui/tree-options";
import { SettingsDialog } from "@/ui/settings/SettingsDialog";
import { StatusBar } from "@/ui/StatusBar";
import { useStatusBar } from "@/ui/useStatusBar";
import { Toasts } from "@/ui/Toasts";
import { useToasts } from "@/ui/useToasts";
import { TabBar } from "@/ui/TabBar";
import { TopBar } from "@/ui/TopBar";
import { useDialogs } from "@/ui/useDialogs";
import { useEditorCommands } from "@/ui/useEditorCommands";
import { AppDialogs } from "@/ui/AppDialogs";
import { useFileDrop } from "@/ui/useFileDrop";
import { useSpellcheck } from "@/ui/useSpellcheck";
import { useImageInsert } from "@/ui/useImageInsert";
import { useDocuments } from "@/ui/useDocuments";
import { useExternalChanges } from "@/ui/useExternalChanges";
import { useClipboard } from "@/ui/useClipboard";
import { useFindBar } from "@/ui/useFindBar";
import { useFocusSession } from "@/ui/useFocusSession";
import { useMenus } from "@/ui/useMenus";
import type { CommandState } from "@/editor/command-state";
import { useDocTheme, useDocThemeSlot } from "@/ui/useDocTheme";
import { useUiStyles } from "@/ui/useUiStyles";
import { useSettingsFile } from "@/ui/useSettingsFile";
import { useChromeVisibility } from "@/ui/useChromeVisibility";
import { useImmersive } from "@/ui/useImmersive";
import { useWindowControls } from "@/ui/useWindowControls";
import { EditorArea } from "@/ui/EditorArea";
import { useWindowTitle } from "@/ui/useWindowTitle";
import { useExport } from "@/ui/useExport";
import { useCommandTable } from "@/ui/useCommandTable";
import { usePlugins } from "@/ui/usePlugins";
import { useAppearance } from "@/ui/useAppearance";
import { useCodeBlockPrefs } from "@/ui/useCodeBlockPrefs";
import { useFocusDim } from "@/ui/useFocusDim";
import { useStartup } from "@/ui/useStartup";
import { useAppEvents } from "@/ui/useAppEvents";
import { useSession } from "@/ui/useSession";
import { useReviewView } from "@/ui/useReviewView";
import { useMenuTable } from "@/ui/useMenuTable";
import { ContextMenu } from "@/ui/ContextMenu";

export default function App() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [activeId, setActiveId] = useState<DocId | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  // 右侧插件栏开着没有。**默认关**。
  // ⚠️ 2026-09-24 用户改的口径，原话：「**默认打开应用不要展开两个菜单**」——
  // 此前这里是 `true`，理由是"用户点名要的就是插件在右侧边栏，默认藏起来等于没做"。
  // 那条理由**没有被推翻**（插件确实该在右侧栏），被推翻的是**默认值**：
  // 打开应用先看到的应该是一篇干净的正文，而不是左右各占一条。
  // 插件栏照旧是"顶栏那颗「插件」按钮 / 栏里的 × / 视图菜单"三处都能开，
  // 藏起来的只是**开机那一刻**的状态。收起后这一格宽度全还给正文。
  // ⚠️ 只在内存里，没进 settings：它跟左侧栏选的是哪一页一样是**看的时候的状态**，
  // 不是文档的属性。真要持久化时跟 `content_width` 那批一起走。
  const [dockOpen, setDockOpen] = useState(false);

  // 左侧栏开着没有、以及它现在是哪一页。**放在 App 上**是为了让
  // 「视图 → 显示/隐藏侧边栏 / 大纲 / 文件树」那几条菜单项能驱动它
  //（见 `ui/Sidebar.tsx` 里那段"为什么改成受控"）。
  // ⚠️ 2026-09-24 **默认关**，理由同上（用户那句「不要展开两个菜单」指的就是
  // 左侧栏与右侧插件栏这一对）。三处菜单项（`view.toggleSidebar` /
  // `view.showOutline` / `view.showTree`）照旧能把它开出来。
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("tree");
  // ⚠️ 状态栏**不在这里**（2026-09-25 起）：它以设置文件为准，见下面
  // `updateSettings` 之后那两条派生值。

  // 偏好设置开着没有。**只在内存里**：它是一次交互，不是设置项本身。
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ⚠️ 格式化工具栏**也不在这里**了（2026-09-25 起），理由同上一行；它比状态栏
  // 多一层：**是三档**（始终显示 / 鼠标悬停时显示 / 始终不显示），默认最后那一档。
  // 三档和悬停的判据都在 `ui/useChromeVisibility.ts` 的文件头。

  // 查找条的状态与四个动作在 `ui/useFindBar.ts`（2026-09-27 从本文件搬走）。
  // ⚠️ **命中数不在这里算**，由编辑器报上来——理由见那份文件头。

  // 打字机模式。**只在内存里**，同「格式化工具栏」：它是"写这一篇时想不想这样"
  // 的临时状态，不是"以后都这样"的偏好。真实现（往哪儿滚）在
  // `editor/writing-modes.ts`。⚠️ 和它成对的**专注模式不在这里**（2026-09-25
  // 起）：专注与全屏共用一套外壳规则，整块在 `ui/useImmersive.ts`。
  const [typewriter, setTypewriter] = useState(false);

  /**
   * 光标状态（`null` = 读不出来：源码模式 / 还没打开文档）。
   *
   * ⚠️ 有两处消费它：工具栏的高亮，以及**菜单里那十条表格命令的灰/亮**。
   * 后者的判据原本只有"有没有处理函数"，那回答不了"现在这一刻能不能用"
   * ——「删除行」在光标不在表格里时按下去什么都没有，而菜单上它是亮的。
   */
  const [commandState, setCommandState] = useState<CommandState | null>(null);

  // 扫到的文档主题。启动时拉一次——它是**状态不是事件**，同 `panels` 的道理（BUG-13）：
  // 用户在应用运行期间往主题目录里丢文件不会触发通知，想让新主题出现就重开应用。
  // ⚠️ 这里**没有**界面主题——那两条轴在 `settings` 里，由 `applyTheme` 落进
  // `<html>` 的属性，不经过这份清单。
  const [themes, setThemes] = useState<DocThemeInfo[]>([]);


  // 事件订阅里要读"当前是哪份"，但**不能把它写进依赖数组**——那会让每次切标签都
  // 退订再订一遍，中间那一刻的事件是丢的。用 ref 读最新值，订阅只发生一次。
  const activeIdRef = useRef<DocId | null>(null);

  const editorRef = useRef<EditorPaneHandle>(null);

  // ── 提示 ────────────────────────────────────────────────────────────────
  // ⚠️ 这一摊（`toasts` 数组 / `toast` / `dismiss`）2026-09-25 搬去了
  // `ui/useToasts.ts`——本文件当时 958 行、软上限 900。搬的是"什么时候消失"，
  // 文案照旧由这里给。那条 `ttlMs === 0` 的分支（不自动消失）见那个文件。
  const { toasts, toast, dismiss } = useToasts();

  // ⚠️ 本文件里要翻的界面串只剩两处（下面「替换」那条提示、以及递给
  // `useFileKind` 的那两条降级提示）：都是**回调里现取**的，而 `useToasts`
  // 那一摊不是组件、拿不到 context，所以订阅留在这儿。
  const t = useT();

  // 2026-09-28 那两条规则（按文件名认类型 ＋ 大文件自动降级源码模式）整块在
  // `ui/useFileKindMode.ts`：判据是纯函数、有测试，那边只管"每份只判一次"与
  // 提示条。⚠️ 出口对象每渲染一份新的，但**两个成员的身份都是稳的**。
  //
  // ⚠️ **2026-10-07 起编辑模式那两件（偏好 / 切模式的 `设模式`）也住那边**：
  // "模式不再存盘"把它那条 `useState` 从本文件搬了过去（加完它是 1027 行、
  // 越了 1000 硬线），落在那个 hook 是因为 `设模式` 要顺手解除降级、与那两条
  // 规则同源。理由在那个文件头上。
  const 文件类型 = useFileKind({ docs, activeId, toast, t });

  const refreshDocs = useCallback(async () => {
    const list = await api.doc.list();
    setDocs(list);
    return list;
  }, []);

  // "编辑器里现在的正文"。导出、打印、借 pandoc 那些都用它。
  //
  // ⚠️ 包一层 `useCallback` 是有代价意识的做法：内联箭头每次渲染都是新函数，
  // 会把 `useExport` 里那几条回调的依赖搅得每帧都变，进而让下面的菜单表整张重建
  // （那条链在 `ui/useMenus.ts` 顶上）。
  //
  // ⚠️ 这里原来还有一条 `useSlidev(...)`（预览的整块编排），2026-09-25 删掉了：
  // Slidev 成了**拓展**，它要正文走的是 `nota.document.get_text`（那条 API
  // 本来就是给插件读当前文档的），整个生命周期都在插件那一侧，宿主这边一行不留。
  const getEditorMarkdown = useCallback(() => editorRef.current?.getMarkdown(), []);

  // 两个自绘对话框——确认框与输入框。整块在 `ui/useDialogs.ts`：
  // 「谁在等答案」的 Promise 拼接和外壳骨架不是一回事，搬走之后本文件
  // 只剩"往哪儿接"。
  //
  // ⚠️ **那份对象本身要留着**（`对话框`）：下面 `<AppDialogs>` 收的是它，
  // 不是十来个函数——五个框的 `answerXxx` 全在它身上，摊开传的下场是漏一个
  // 就有一个框永远关不掉（见 `ui/AppDialogs.tsx` 的文件头）。
  const 对话框 = useDialogs();
  // ⚠️ 这里**只解构本文件还用的那几个**：五个 `answerXxx` 由 `AppDialogs`
  // 直接从对象上取，本文件不再碰（`confirmReq` / `promptReq` / `imageReq` /
  // `linkReq` / `emojiOpen` 还要用——下面那个 `有浮层` 判据要数它们）。
  const { confirmReq, promptReq, imageReq, linkReq, emojiOpen } = 对话框;
  const { askConfirm, askPrompt, askLink, askImage, askEmoji } = 对话框;

  // 插件那一整块：已装清单、声明的面板、声明的菜单项、以及"跑一条插件命令"。
  // 整块在 `ui/usePlugins.ts`——取数据、合成菜单栏、建处理函数三件事都在那边，
  // 这边只把结果接到 `Home` / 菜单栏 / `PluginDock` 上。
  //
  // ⚠️ 位置**必须在 `useDialogs` 之后**：菜单项上声明的"先问一句"要借
  // `askPrompt`，而那个函数是上面那个 hook 产出的；装/卸插件之前那句
  // "确定吗"同理（`askConfirm`，宿主自己画的框，不是 `window.confirm`）。
  const 插件 = usePlugins({ toast, askPrompt, askConfirm });
  const {
    plugins,
    panels,
    信任: 信任表,
    // 编辑区里此刻摊着的插件面板（`nota.ui.review` 放进去的那一格）＋收起它。
    // ⚠️ **归宿主**（`plugin::ReviewState`），不是这里的一份 `useState`：
    // 刷新一次界面 / 热重载一次，"我正在看 AI 提的那份改动"不该就这么没了。
    review: 预览,
    收预览,
    menus: 全部菜单,
    handlers: 插件处理,
    调: 调插件,
    动作: 插件动作,
  } = 插件;


  // ── 编辑区那一格的两种形态与"看哪一面"（2026-09-27 搬到 `ui/useReviewView.ts`）
  //
  // 搬走的是一整块：**分派形态 / 记住看法 / `Esc` 之后干什么**，三件事挂的是
  // 同一份数据（宿主推来的那一份预览）。三条围栏（分派只做一次、看法归共同
  // 的父层、`Esc` 优先走插件的「放弃」）都写在那个文件头里。
  const 预览出口 = useReviewView({
    预览,
    调插件,
    收预览,
  });
  // ⚠️ 这里**不再拆字段**：整份 `预览出口` 交给 `ui/EditorArea.tsx` 去了
  //（那边要用 `活跃预览` / `面板预览` / `看法` / `退出预览` 好几样），拆一半
  // 留一半只会多一份"哪几个在这边有用"的账。

  // 口径指纹（`ui/tree-options.ts`）：换排序 / 换过滤 / 拨开隐藏文件之后树要
  // 自己重取，靠的就是下面那个依赖。⚠️ 依赖它而不是口径对象——对象每次渲染
  // 都换身份，那样 `refreshTree` 的身份会跟着抖，取树也会跟着每次都重跑。
  const 树指纹 = 口径键(读口径(settings));

  const refreshTree = useCallback(async () => {
    if (!workspace) {
      setTree([]);
      return;
    }
    try {
      setTree(await api.workspace.tree(undefined, 1, 读口径(settings)));
    } catch (e) {
      toast(String(e), "error");
    }
    // ⚠️ 依赖的是那个**指纹**，不是 `settings`：见上面那段。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同上
  }, [workspace, toast, 树指纹]);

  // ── 文档的生命周期 ──────────────────────────────────────────────────────
  // 打开 / 新建 / 存盘 / 关闭 / 重载整块搬去了 `ui/useDocuments.ts`（2026-09-25，
  // 本文件当时 998 行，离 `.tsx` 的硬上限只剩两行）。
  //
  // ⚠️ **调用位置不能往下挪**：下面"启动"那个 effect 的依赖里有 `openPath`，
  // 而 `useCallback` 的依赖数组是在**渲染时**求值的——把这段放到启动那段
  // 后面就是 `Cannot access 'openPath' before initialization`，整个界面白屏。
  const 文档出口 = useDocuments({
    docs,
    setActiveId,
    activeIdRef,
    refreshDocs,
    setWorkspace,
    setTree,
    editorRef,
    settings,
    // ⚠️ 给 `偏好`（用户选的那一档）不给 `模式`：那边问"用户想要所见即所得吗"，与降级无关。
    模式偏好: 文件类型.偏好,
    toast,
    askConfirm,
    askPrompt,
  });
  const {
    openPath,
    newDoc,
    openViaDialog,
    openFolder,
    loadDir,
    saveDoc,
    切换文档,
    closeDoc,
    reloadDoc,
    renameDoc,
    moveDoc,
  } = 文档出口;

  // ── 外部改动（别的程序动了磁盘上那份文件）──────────────────────────────
  //
  // 用户 2026-09-26 点的（「此乃非插件」）。发现那一半在宿主（`watch.rs`），
  // 三个动作与那块对照在这一块。⚠️ **位置在 `useDocuments` 之后**：它要
  // `reloadDoc`（「重新载入」那颗按钮走的正是既有的重载，包括未保存确认那一道）。
  const 改动出口 = useExternalChanges({ docs, activeIdRef, editorRef, reloadDoc, toast });
  // ⚠️ 只拿「对照」：另外四项（改动 / 忽略 / 重新载入 / 查看修改 / 关对照）
  // 全是 `ui/ExternalChangeBar.tsx` 和那块对照界面在使，而它们都搬进
  // `ui/EditorArea.tsx` 了。这边留「对照」是因为下面那个"摊着预览吗"的判据
  // 要它（外部对照同样把正文顶掉）。
  const { 对照: 外部对照 } = 改动出口;


  /**
   * 摊着预览吗。**两种形态都算**——用户 2026-09-26 说「最好当预览的时候禁止
   * 操作」，那句话不挑形态。
   *
   * ⚠️ **外部改动那份对照也算**（2026-09-26）：它同样把正文顶掉了（`data-review`
   * 那一支），正文看不见却还能按 `Ctrl+S`、还能点「插入表格」，那是同一个
   * "点下去不知道在看哪儿"的毛病。⚠️ 但**提示条那三颗按钮不受影响**：它们在
   * 下面那三块 `inert` 之外（见 `ExternalChangeBar`），所以对照摊着的时候
   * 用户照样能点「重新载入」「忽略」——那正是他要做的事。
   *
   * 它喂两个地方，缺一处就漏一条路：
   * 1. `useCommandTable`（菜单全灰 ＋ 快捷键全不接，见那边的 `预览中`）；
   * 2. 下面三块界面上的 `inert`（左栏 / 右侧栏 / 页签）——它们**不走那张表**，
   *    各自有自己的按钮（打开文件、插件的按钮、关标签）。
   */
  const 预览中 = 预览 !== null || 外部对照 !== null;

  /**
   * **会话侧车**：最近打开过哪些文件、上次开着哪几个标签、每份文档滚到哪儿
   *（整块在 `ui/useSession.ts`，四格的账都在那个文件头里）。
   *
   * ⚠️ **位置**：必须在 `useDocuments` 之后（要它的 `openPath`），且必须在
   * `useStartup` 之前（启动那一枪要用 `接上会话`）。
   */
  const 会话出口 = useSession({
    docs,
    activeId,
    openPath,
    // ⚠️ 只有「启动时」**第一档**会用一次：那一档要的是"落到一张白纸上"，
    // 见 `ui/useSession.ts::接上会话` 最后那一段。
    新建文档: newDoc,
    // ⚠️ 只有「启动时」第三档会用一次：侧车记着上次那个文件夹，接上它要**经过
    // 宿主**（围栏在那边），回来的是规范化后的路径，得有地方放。见
    // `ui/useSession.ts::接上会话` 里那一段。
    setWorkspace,
    toast,
  });
  // ⚠️ `滚动位置` / `记滚动` 不在这儿——它们只喂给编辑区那个 `EditorPane`
  //（搬进 `ui/EditorArea.tsx` 了）。这边要的是"最近打开"那一族（主页/菜单）
  // 和 `接上会话`。⚠️ `忘掉最近` 也不在这儿：它只服务"从列表里摘掉一条"，
  // 而那一颗 × 长在「文档列表」页里，2026-09-28 那一页删了（见 `ui/Sidebar.tsx`
  // 文件头）；`useSession` 内部照旧用它（打不开的记录顺手摘掉）。
  const { 最近, 接上会话, 打开最近, 清空最近 } = 会话出口;

  // ⚠️ 菜单表搬去了 `ui/useMenuTable.ts`（2026-10-04，本文件当时 998 行、
  // 离硬上限只剩 2 行）。**它的理由（为什么要 `useMemo`、为什么只此一份、
  // 为什么键位覆盖叠在这一处）全在那个文件头上**，改它之前先读那一段。
  const 菜单 = useMenuTable({
    全部菜单,
    最近,
    覆盖: settings?.keys?.overrides,
  });

  // ── 启动与事件订阅 ──────────────────────────────────────────────────────
  // 两块都搬走了（2026-09-26，本文件当时 1049 行、硬上限 1000）：
  // 「启动那一枪」在 `ui/useStartup.ts`，「宿主推来的事件 + 活动文档同步」在
  // `ui/useAppEvents.ts`。判据是老规矩（见文件头）：各自有一份完整的理由可写。
  //
  // ⚠️ **`useStartup` 必须在 `useDocuments` 之后**：它要 `openPath`（命令行给的
  // 文件走的就是那条路）。⚠️ 这两个 hook 里那几条 effect 都**只跑一次**，
  // 而那是**约定不是观察**——上游回调用 `useCallback` 包稳的规矩在
  // `ui/useStartup.ts` 文件头最后一段里，改那边之前先读那一段。
  useStartup({ setSettings, setWorkspace, setThemes, refreshDocs, openPath, 接上会话, toast });
  useAppEvents({ toast, refreshDocs, openPath, activeId, activeIdRef, editorRef });
  // ── 主题 ────────────────────────────────────────────────────────
  // ⚠️ 界面主题与缩放搬去了 `ui/useAppearance.ts`（2026-09-25，本文件顶着行数
  // 上限）。它**不在这个位置**——要等下面 `updateSettings` 存在，调用处在那里。

  // 工作区一变就重取文件树。⚠️ 这条留在本文件里：它挂在 `refreshTree` 上，
  // 而 `refreshTree` 依赖 `workspace` 这个 state（见上面那段）。
  useEffect(() => {
    void refreshTree();
    // refreshTree 已经依赖 workspace，这里不必再列一遍。
  }, [refreshTree]);

  // ── 菜单命令 ────────────────────────────────────────────────────────────


  /** 改设置并落盘。改不动就把内存里的改回去，免得"界面上是新的、重开又变回去"。 */
  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return;
      const previous = settings;
      const next = { ...settings, ...patch };
      setSettings(next); // 先改内存：主题、字号这些要立刻见效果
      try {
        await api.settings.set(next);
        // ⚠️ 标签页上的标题是**后端按当前口径从正文算出来**的（严格模式一变，
        // `#标题` 算不算标题就变了），光刷设置刷不到它——那份要在文档列表里。
        // 少这一步就会出现"正文已经变了、标签页还挂着老标题"。
        void refreshDocs();
      } catch (e) {
        setSettings(previous);
        toast(t("Could not save the settings: {0}", String(e)), "error");
      }
    },
    [settings, toast, refreshDocs],
  );

  // 文档主题：**现在生效的是哪一套**，以及换主题该写哪个槽。
  //
  // ⚠️ 2026-09-25 之前这里处处直接读 `settings.document_theme`。那天「外观 →
  // 深色模式」里那两档真的接上了线（`appearance.dark_theme_separate` ＋
  // `dark_document_theme`）——深色下生效的可能是**另一份**，所以"读哪个字段"
  // 这件事必须只有一个答案，就是这里的 `槽.id`。下面三处消费者（导出内联的
  // 主题 CSS、主题菜单的勾、`useDocTheme` 取哪份 CSS）用的是同一个值。
  //
  // ⚠️ 位置**必须在 `updateSettings` 之后**：它拿那个函数当入参。
  const 槽 = useDocThemeSlot(settings, updateSettings);

  // 界面主题（落进 `<html>`）＋ 缩放（落到 webview）。位置约束与"文档主题不在
  // 这儿"都写在 `ui/useAppearance.ts` 的文件头。
  // ⚠️ 返回值是缩放那三档的动作，交给 `useCommandTable` 接菜单与快捷键（`useMemo` 过，可当依赖）。
  const 缩放动作 = useAppearance(settings, updateSettings);

  // 代码块那三条挂件的显隐（行号 / 工具栏 / 语言框），同样落进 `<html>`。
  // ⚠️ 与上面那条是**两个 hook**、不是同一份：那一条管的是界面外观那两条轴
  //（`appearance` 表），这一条管 `editor` 表里三条纯显示开关。理由写在
  // `ui/useCodeBlockPrefs.ts` 的文件头。
  useCodeBlockPrefs(settings);

  // 专注模式的压暗强度（`appearance.focus_mode_dim`，三档），同样落进 `<html>`。
  // ⚠️ 它是**第三条**"拨了不重建编辑器"的显隐开关，与上面那两条分开住：
  // 那两条管 `editor` / `markdown` 表，这一条管 `appearance` 表里的一档。
  // 为什么不做成编辑器参数，写在 `ui/useFocusDim.ts` 的文件头。
  useFocusDim(settings);

  // 导出与打印。整块编排在 `ui/useExport.ts`（HTML 两档、打印、借 pandoc 那七种）。
  // ⚠️ 正文走 `getEditorMarkdown`——**身份稳定**的那个 `useCallback`。现写一个箭头
  // 函数的话每渲染换一次身份，`导出` → `menuHandlers` → `disabledCommands` 一路
  // 跟着换，于是**原生菜单每渲染重推一遍**（这条链在 `ui/useMenus.ts` 顶上）。
  // ⚠️ 位置**必须在 `useImmersive` 之前**：下面那个 `有浮层` 要数进 `pandocGate`。
  // 这就是它没跟其余"设置消费方"一起摆在文件后面的原因。
  //
  // ⚠️ `themeId` 给的是**生效的那一套**，不是 `settings.document_theme`：这个值
  // 用来把主题 CSS 内联进导出的 HTML／PDF，口径就是"导出的东西和屏幕上一样"。
  // 给存储的那一份的话，深色下导出会是一份配色完全不同的文件。
  const { 导出, 打印, 导出为, pandocGate, pandocGateActions } = useExport({
    activeId,
    docs,
    getMarkdown: getEditorMarkdown,
    themeId: 槽.id,
    // ⚠️ 兜底那份**每一格都要写出来**（`pandoc_args` 是 2026-10-10 加的）。
    exportSettings: settings?.export ?? { default_folder: "", open_after_export: false, pandoc_args: "" },
    toast,
  });

  // 状态栏 / 格式化工具栏 / 菜单栏：**以设置文件为准**，搬去了
  // `ui/useChromeVisibility.ts`（2026-09-25，本文件顶着行数上限；那个文件的头儿
  // 写着为什么前两条不再是内存 state——原来是"菜单里关掉重启又回来、设置里
  // 关掉什么都不发生"。菜单栏是 2026-09-28 用户点名加进去的第三条，它比另外
  // 两条多一件事：藏下去时要发一条"怎么开回来"的提示，理由在那边的文件头）。
  //
  // ⚠️ 两个 ref 是给**悬停那一档**量位置用的（工具栏什么时候画、鼠标还在不在
  // 它下沿以上），理由在那边文件头那张表里。别的地方别拿它们做事。
  // ⚠️ `toast` 是给菜单栏那条提示用的（它身份稳定，`useToasts` 里包的 `useCallback`）。
  const mainRef = useRef<HTMLElement | null>(null);
  const formatBarRef = useRef<HTMLDivElement | null>(null);
  const { statusBarOpen, formatBarOpen, menuBarOpen, toolbarMode, setChrome, 收起工具栏 } =
    useChromeVisibility(settings, updateSettings, { 主区: mainRef, 工具栏: formatBarRef, toast });

  // ── 强制专注（核心功能，不是插件）──────────────────────────────────────
  //
  // 整块在 `ui/useFocusSession.ts`（2026-09-28 从本文件搬走：本文件贴着
  // `docs/09` §4 的 1000 行硬线）。⚠️ 搬走的是**一整档功能**——订阅状态、四条
  // 命令、结束那份总结，四块的分工与两道位置约束都写在那个文件的头注释里。
  // ⚠️ 它与下面 `useImmersive` 那个「专注」毫无关系（一个收外壳、一个记账）。
  const { 专注状态, 专注运行中, 切换强制专注, 专注总结, 关掉专注总结 } =
    useFocusSession({ askConfirm, settings, updateSettings });

  // 沉浸模式（专注 / 全屏）。整块在 `ui/useImmersive.ts`——连"`有浮层` 为什么
  // 要传"一起说清楚了，这里只接线。
  //
  // ⚠️ `专注总结 !== null` 那一条（2026-09-27 加的）：强制专注的总结框开着时
  // `Esc` 该归它（`ui/FocusSummaryDialog.tsx` 自己接了一个），不该顺手把沉浸模式
  // 也退掉——两个都关掉的话，用户只是想把报告收起来，却连外壳一起被拆了。
  const { 沉浸, focusMode, 切换专注, fullscreen, 切换全屏 } = useImmersive({
    有浮层:
      settingsOpen ||
      confirmReq !== null ||
      promptReq !== null ||
      imageReq !== null ||
      linkReq !== null || // 「链接」框（第 96 ＋ 102 项）
      emojiOpen ||
      对话框.关于开着 || // 「关于」框（见 `ui/useDialogs.ts` 那一格）
      pandocGate !== null || 专注总结 !== null,
    toast,
  });

  // 窗口自身那两件（置顶 / 开发者工具）。整块在 `ui/useWindowControls.ts`
  // ——连"置顶那个勾为什么要从窗口读回来"一起说清楚了，这里只接线。
  const { 置顶, 切换置顶, 开开发者工具, 开新窗口 } = useWindowControls({ toast });

  // 文档主题那三件事（应用 / 切换 / 打开主题文件夹）搬去了
  // `ui/useDocTheme.ts`（2026-09-24，本文件顶着行数上限）。那边的文件头写着
  // "为什么和 `applyTheme` 分家"、以及"只作用于编辑区"那道限域保证的来历。
  //
  // ⚠️ `themeId` 与 `写主题` **两样都从 `槽` 来**（定义在上面、`updateSettings`
  // 之后）：用哪一份、换哪一份，必须是同一个判据，否则会出现"取的 CSS 是浅色
  // 那份、点一下写进深色那份"——屏幕不动，提示却说换好了。
  const { pickTheme, openThemesDir } = useDocTheme({
    themeId: 槽.id,
    写主题: 槽.写,
    themes,
    // ⚠️ 第 41 项（2026-10-04）：清单原来只在启动时拉（`useStartup`）一次，
    // 现在打开主题文件夹回来会重拉一把。清单还是只有 `themes` 这一份状态。
    重扫: () => void api.theme.list().then(setThemes),
    toast,
  });

  // 用户**导入的**界面风格（取 CSS 注入 / 打开风格文件夹）在
  // `ui/useUiStyles.ts`（2026-09-26）。⚠️ 与上面那条不是一伙的：文档主题只管
  // 编辑区、它管整个外壳，注入方式还正好相反——细节在那边文件头。
  const { styles: uiStyles, openStylesDir } = useUiStyles(settings, toast);

  // 「复制为 Markdown」（`edit.copyAsMarkdown`）也搬去了 `ui/useClipboard.ts`
  // （2026-09-25），理由在那个文件的文件头；接线在下面 `剪贴板` 那一行。
  // 「关于 Nota」：框体在 `ui/AboutDialog.tsx`，开关在 `ui/useDialogs.ts`
  // （2026-09-28 从 `ui/useAbout.ts` 并过去：那个文件当时只剩内容，而状态本来
  // 就该和别的浮层待在一起。整段理由在 `ui/useDialogs.ts` 那一格的注释里）。
  const showAbout = 对话框.开关于;

  // 「跑一条编辑命令」与两个"先问参数、再插进去"的命令搬去了
  // `ui/useEditorCommands.ts`（2026-09-24，本文件顶着行数上限）。那边一并讲了
  // "菜单项和编辑器之间到底有几根线"。
  //
  // ⚠️ 传的是 `editorRef` **本体**（身份稳定），不是 `editorRef.current`——
  // 后者每次渲染都可能是个新值，会让 `run` 每帧换身份。
  const { run, 插入链接 } = useEditorCommands({ editorRef, askLink, toast });

  // 「插入图像」那一条（含**粘贴**，`ui/useImageInsert.ts`，2026-09-26）。
  // ⚠️ **必须在 `run` 之后**：它把宿主落好盘的地址通过 `run("image", …)` 插进正文。
  // ⚠️ 也要在 `useDialogs` 之后（`askImage` / `imageReq` 是那边产出的）。
  const { 插入图像, 落一张 } = useImageInsert({
    run,
    docId: activeId,
    // ⚠️ 用 `docs` 现查而不是 `activeDoc`：那个常量在本文件**下面**才算出来，
    // 而 hook 的调用顺序不能往后挪。
    docSaved: (docs.find((d) => d.id === activeId)?.path ?? null) !== null,
    askImage,
    toast,
  });

  // **拼写检查那两格接到引擎上**（`ui/useSpellcheck.ts`：开关 2026-09-27、语言
  // 2026-10-10）。它是个 hook 而不是"设置页里顺手调一下"：这两格**不属于设置页**，
  // 用户在菜单里改、设置文件被别的程序改了，都该跟着动（`settings` 是它唯一的输入）。
  useSpellcheck({
    // ⚠️ `?? null`（不是 `?.` 链到底）：没读回来是"还不知道"，不是"关着"。
    开: settings?.editor.spellcheck ?? null,
    // ⚠️ 空数组是"跟随系统"那一档的**正常值**，不能被 `?? null` 吃掉。
    // ⚠️ 这里传的是**设置里那一个数组本身**（不现造一个）：`useSpellcheck` 拿它
    // 当依赖，每帧新造一个会让那条 effect 每帧重跑一遍（每次都要过一次主线程）。
    语言: settings === null ? null : settings.editor.spellcheck_langs,
    toast,
  });

  // **拖进窗口的东西该干什么**（`ui/useFileDrop.ts`，2026-09-27）。
  // ⚠️ 窗口级拖放的**唯一订阅者**——图片那一支也在这里分派回 `落一张`
  //（两条订阅一起跑的话，拖一张图会插两张，见那份文件头）。
  useFileDrop({
    openPath,
    openFolder,
    落一张,
    files: settings?.files ?? null,
    hasDoc: activeId !== null,
    toast,
  });

  /**
   * 「格式 → 插入 Emoji…」那一条（`ui/EmojiDialog.tsx`）。
   *
   * ⚠️ **就地问一句、拿回一个字符、交给 `run("insertText", …)`**——框本身
   * 不碰编辑器（与 `ImageDialog` 同一条口径：往哪儿插是调用方的事）。
   * ⚠️ 取消（`null`）时**什么都不做**，连提示都不弹：用户主动改主意不是错误。
   * ⚠️ 必须 `useCallback`：它进 `useCommandTable`，而那张表的身份决定菜单栏
   * 要不要重推一遍（见 `ui/useMenus.ts`）。
   */
  const 插入Emoji = useCallback(async () => {
    const 字符 = await askEmoji();
    if (字符 !== null) run("insertText", { text: 字符 });
  }, [askEmoji, run]);

  // 剪贴板四件（`ui/useClipboard.ts`，2026-09-25）。⚠️ **在 `run` 之后**取：
  // 它内部用 `run` 把文本落到文档上。
  const 剪贴板 = useClipboard({ editorRef, run, toast });

  // ⚠️ 传的是 `editorRef` **本体**（身份稳定），不是 `editorRef.current`。
  const 查找条 = useFindBar({
    editorRef,
    toast,
    t,
  });
  // ⚠️ 条子自己要的那几样（开着/命中/回报/关/替换）全在 `ui/EditorArea.tsx`
  // 里读；这边留的 `切查找` 是菜单那条 `edit.find`（它要开/关来回切）。
  const { 切查找 } = 查找条;


  /**
   * 命令 id → 实现。**这张表就是"菜单项能不能点"的唯一真相源。**
   *
   * ⚠️ 表本身 2026-09-26 搬去了 `ui/useCommandTable.ts`（本文件当时一千行
   * 出头，`docs/09` §4 的上限），连同"今天灰着的那批都有哪些、为什么"那段
   * 一起。搬走之后顺带**修掉了一个依赖漏项**：「视图 → 显示状态栏」读的
   * `statusBarOpen` 原先不在依赖数组里，连着点两次「显示状态栏」，第二次
   * 用的是上一帧捕获的值——关掉之后再也开不回来。那个文件的文件头写着这一类
   * 漏项现在为什么不可能再发生。
   *
   * ⚠️ 喂进去的每一个值都必须是**身份稳定**的（`useCallback` 包过的函数、
   * `useState` 的 setter、基本类型）：这张表的身份是给原生菜单栏用的，输入
   * 一抖它就重建，而重建就意味着菜单栏重推一遍（那条链在 `ui/useMenus.ts` 顶上）。
   * 现写箭头函数、或者把 `剪贴板` 那种每次渲染都新的对象整个塞进去，都会踩这条。
   */
  const menuHandlers = useCommandTable({
    // ⚠️ 摊着预览时这一项为真 → 那张表整个变空（菜单全灰、快捷键全不接）。
    // 两种预览形态都算：改动预览（`活跃预览`）与插件面板摊在编辑区（`面板预览`）
    // ——用户说的「预览的时候禁止操作」不挑形态。
    预览中: 预览 !== null,
    插件处理,
    新建文档: newDoc,
    打开文件: openViaDialog,
    打开文件夹: openFolder,
    // 最近文件那一层（子菜单 + 「清除最近记录」）。⚠️ 这个数组进的是
    // `Object.values(输入)`，所以它一变这张表就重建 —— 那是**该重建**：
    // 列表内容变了，条目的处理函数本来就得跟着换。
    最近,
    打开最近,
    清空最近,
    重载文档: reloadDoc,
    重命名文档: renameDoc,
    移动文档: moveDoc,
    保存文档: saveDoc,
    关闭文档: closeDoc,
    活动文档: activeId,
    打开设置页: setSettingsOpen,
    导出,
    导出为,
    打印,
    运行: run,
    切查找,
    插入链接,
    插入图像,
    插入Emoji,
    // ⚠️ 六条各自列出来（而不是列 `剪贴板` 那个对象）：那个包装对象每次渲染
    // 都是新的，进去等于这张表每帧重建。
    剪贴板剪切: 剪贴板.剪切,
    剪贴板复制: 剪贴板.复制,
    剪贴板粘贴: 剪贴板.粘贴,
    剪贴板复制为Markdown: 剪贴板.复制为Markdown,
    剪贴板复制为纯文本: 剪贴板.复制为纯文本,
    剪贴板复制为HTML: 剪贴板.复制为HTML,
    缩放动作, // ⚠️ 整只交出去（不是三个函数各列一行）：它已经是 `useMemo` 出来的。
    设侧栏打开: setSidebarOpen,
    设侧栏页: setSidebarTab,
    设右栏打开: setDockOpen,
    设打字机: setTypewriter,
    设界面: setChrome,
    状态栏开着: statusBarOpen,
    菜单栏开着: menuBarOpen,
    严格模式: settings?.strict_markdown ?? false,
    切换专注,
    切换强制专注,
    切换全屏,
    切换置顶,
    开开发者工具,
    设模式: 文件类型.设模式,
    关于: showAbout,
  });

  /**
   * 编辑模式，**实际**那一个（`wysiwyg` / `source` / `split`）。⚠️ 来源是
   * `文件类型.模式`（上一节那个 hook）：用户设的只是偏好，还会被"大文件 /
   * 非 Markdown 降级"压成 `source`。菜单的 ✓、状态栏那颗 `</>` 与编辑区都吃
   * 这一条——**必须同源**，各存一份的症状是"菜单里的 ✓ 在 A 上、编辑区是 B"。
   */
  const viewMode = 文件类型.模式;

  /**
   * 原生菜单被点了。**去向判据在这边**（主题 / 主题目录 / 命令三条路），
   * `useMenus` 只把事件原样送过来——那边不该知道"主题"是什么东西。
   *
   * ⚠️ 必须包 `useCallback`：它是那个 hook 里订阅 effect 的依赖，
   * 身份一抖就退订重订，中间那一刻的点击是**丢的**。
   */
  const onNativePick = useCallback(
    (id: string) => {
      const p = resolvePick(id);
      if (p.kind === "theme") pickTheme(p.id);
      else if (p.kind === "themes-dir") void openThemesDir();
      else menuHandlers[p.id]?.();
    },
    [menuHandlers, pickTheme, openThemesDir],
  );

  // 菜单与快捷键的接线：灰不灰、勾没勾、键位接不接、原生菜单推什么。
  // ⚠️ 整块搬去了 `ui/useMenus.ts`（本文件 2026-09-24 顶着 1000 行上限，
  // 见 `AGENTS.md` §0.4）。那边有那三条判据的完整理由。
  const { disabledCommands, menuChecks, usingNativeMenu } = useMenus({
    // ⚠️ `菜单`（含插件那一栏 **和最近文件那一层**）**必须**传进去：灰不灰、
    // 键位归谁、原生菜单推什么，三条判据都走这一份。传成常量 `MENUS` 的话，
    // 插件那几条会**只画在自绘菜单里**，而快捷键和 macOS 系统菜单都没有；
    // 最近文件那一层同理（`ui/recentMenu.ts`）。
    menus: 菜单,
    menuHandlers,
    activeId,
    commandState,
    view: {
      sidebarOpen,
      sidebarTab,
      dockOpen,
      toolbarMode,
      statusBarOpen,
      menuBarOpen,
      viewMode,
      focusMode,
      // ⚠️ 它是**从宿主读回来的**（`专注状态`），不是本文件里某个 `useState`
      // ——和上面那两个（`focusMode` / `typewriter`）**不是一类东西**。
      forceFocus: 专注运行中,
      typewriter,
      // ⚠️ 全屏的勾**读窗口**（`fullscreen` 那个镜像），不是读我们自己的意图：
      // 用户用 WM 的快捷键进的全屏，菜单里也得是勾上的。
      fullscreen,
      // ⚠️ 置顶那条同理，而且**更必须**：它没有快捷键，用户手上唯一的开关
      // 就在窗口管理器里（"总在最前"），读窗口是唯一说得通的做法。
      alwaysOnTop: 置顶,
    },
    themes,
    // ⚠️ 勾在**你此刻看着的**那一套上（`槽.id`），不是 `settings.document_theme`：
    // 这个勾就是"现在用的是这套"，而菜单里选一套改的也正是这套（见上面 `槽`）。
    documentTheme: 槽.id,
    onNativePick,
  });

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;

  // 状态栏那一堆 props 的接线（2026-09-30 搬去 `ui/useStatusBar.ts`：本文件那天
  // 因为状态栏新加的两颗按钮顶到了 1003 行，越过 `doc-sync-check` 那条 1000 行
  // 硬线）。⚠️ **位置必须在 `activeDoc` 之后**——它要 `activeDoc`、`viewMode`、
  // `专注状态`、`updateSettings` 四样都已存在。
  const 状态栏接线 = useStatusBar({
    settings,
    updateSettings,
    viewMode,
    设模式: 文件类型.设模式,
    doc: activeDoc,
    sidebarOpen,
    setSidebarOpen,
    focus: 专注状态,
    // ⚠️ 收状态栏那颗 × 走的是**同一个 `setChrome`**（第 49 项那条口径：
    // 菜单 / 快捷键 / × 三条入口汇到同一个 setter），所以这里把 setter 交出去，
    // 不在 `useStatusBar` 里另写一份 `appearance` 的整表铺开。
    设界面: setChrome,
  });

  // 窗口标题跟着**当前文档**走（第 51 项）：任务栏里几份文档要分得出来，
  // 也要看得出哪一份有未保存的改动。⚠️ 改的是原生窗口标题
  // （`getCurrentWindow().setTitle`），不是 `document.title`——后者传不出去，
  // 理由写在 `ui/useWindowTitle.ts` 顶上那段。
  // ⚠️ 第三格 `?? true` 必须与 Rust 侧
  // `Appearance::default().show_filename_in_titlebar` 一致（同
  // `useChromeVisibility` 里 `?? true` 那条注释的理由）：设置还没读回来时
  // 按默认走，读失败也不能把标题变成光秃秃一个 `Nota`。
  useWindowTitle(
    activeDoc?.title ?? null,
    activeDoc?.dirty ?? false,
    settings?.appearance.show_filename_in_titlebar ?? true,
  );

  // 设置文件的两件事（打开所在目录 / 恢复默认）搬去了
  // `ui/useSettingsFile.ts`（2026-09-24，本文件顶着行数上限）。
  // 那边的文件头写着"为什么恢复默认必须用后端返回的那一份"。
  const { openConfigDir, resetSettings } = useSettingsFile({ setSettings, toast });

  // 右键菜单（2026-10-04）的接线。⚠️ 五样都**原样传下去**，一件也不在这里
  // 加工：分类、形状、键盘路径全在 `ui/ContextMenu.tsx` 头上。
  const 右键接线 = {
    命令表: menuHandlers,
    灰: disabledCommands,
    勾: menuChecks,
    光标: commandState,
    toast,
  };

  return (
    <ErrorBoundary>
      {/* ⚠️ `data-zen` 只在沉浸时为真（`undefined` = 这个属性不出现），判据与
          收起哪些东西在 `styles/app.css` 里那一节。 */}
      <div className="app" data-zen={沉浸 || undefined}>
        {/* ⚠️ 这层壳只为沉浸模式存在：它给顶栏一个**只有 6px 高的定位容器**，
            让顶栏能滑到窗口外面、再由鼠标碰那 6px 唤回来（见 app.css 那一节）。
            平时它是 `display: block` 的一层透明壳，布局上和没有它一样。 */}
        <div className="zen-top">
          <TopBar
            menus={菜单}
            disabled={disabledCommands}
            checks={menuChecks}
            themes={themes}
            currentTheme={槽.id}
            onCommand={(id) => menuHandlers[id]?.()}
            onTheme={pickTheme}
            onOpenThemesDir={() => void openThemesDir()}
            dockOpen={dockOpen}
            onToggleDock={() => setDockOpen((v) => !v)}
            // ⚠️ 两条理由都让菜单栏让位，**写法必须合成一个布尔**给 `TopBar`：
            // 一是 macOS 上原生菜单已经挂在屏幕顶端（`usingNativeMenu`），
            // 二是用户自己在外观设置里关掉了（`menuBarOpen`，2026-09-28）。
            // `TopBar` 不需要知道是哪一条——它只知道"顶上那一条画不画"。
            hideMenuBar={usingNativeMenu || !menuBarOpen}
          />
        </div>

        <div className="app-body">
          {/* ⚠️ 侧栏**始终挂着**，开合靠 `折叠` 把宽度动画到 0（2026-09-30）：
              条件渲染的话元素是"凭空出现、凭空消失"的，没有加动画的余地。
              折叠期间它 `inert`（见 `ui/Sidebar.tsx` 那个 prop），所以里头的
              树与按钮不会被 Tab 走进、也不会被点着。 */}
          <Sidebar
            workspace={workspace}
            tree={tree}
            docText={activeDoc?.text ?? ""}
            strict={settings?.strict_markdown ?? false}
            tab={sidebarTab}
            onTab={setSidebarTab}
            onOpenFile={openPath}
            // 点大纲里的标题跳过去（第 48 项）。⚠️ 编辑器可能还没建好
            // （换文档的那一瞬间），`EditorPane` 那边对这种情况给的是
            // "什么都不做"，不是抛错——见它 `useImperativeHandle` 里那段。
            onJumpOutline={(目标) => editorRef.current?.跳到标题(目标)}
            loadDir={loadDir}
            // 口径指纹：换排序 / 换过滤 / 拨开隐藏文件之后，侧栏靠它知道
            // "已经取回来的那几层过期了"（`ui/Sidebar.tsx::FileTree` 那个 effect）。
            口径键={树指纹}
            // 右上角那个 × 与「视图 → 显示/隐藏侧边栏」、`Ctrl+Shift+L`
            // 是**同一个开关的三个入口**，共用下面这一个 setter。
            // 收起状态（2026-09-30）：**不是卸载**，是把宽度动画到 0。
            // ⚠️ 与上面那个 `sidebarOpen` 是同一个开关，别在这里另记一份状态。
            折叠={!sidebarOpen}
            // 右缘拖动改宽度（2026-09-30）：**松手才落盘**，拖动过程是
            // `ui/SidebarResizer.tsx` 直接写 `--sidebar-width`。
            // ⚠️ 落盘时要**整份 `appearance` 交上去**（`updateSettings` 的
            // patch 只做浅合并，少一个字段就等于把它抹回默认值）。
            onResize={(宽) => {
              if (settings) {
                void updateSettings({
                  appearance: { ...settings.appearance, sidebar_width: 宽 },
                });
              }
            }}
            // 空态里那颗按钮走的是「文件 → 打开文件夹…」那条路，同一个函数。
            onOpenFolder={() => void openFolder()}
            // 预览期间锁掉（`inert`）。理由见 `预览中` 那一段。
            inert={预览中}
          />

          {/* ⚠️ `data-review` 是给 CSS 的开关（`styles/review.css`）：
              `"true"` = 面板形态，正文**只是藏起来，不卸载**（`.editor-pane`
              里那个 CodeMirror 带着撤销栈和光标，卸载一次就全没了）；
              `"inline"` = 改动预览，正文留在原地，改动画在它身上。 */}
          <EditorArea
            接线={{
              主区: mainRef,
              格式化栏: formatBarRef,
              编辑器: editorRef,
              activeDoc,
              settings,
              viewMode,
              focusMode,
              typewriter,
              格式化栏开着: formatBarOpen,
              // 右端那颗 ×（2026-10-04，第 49 项）。⚠️ 给的是**同一个 setter
              // 的同一格**（`setChrome({ toolbar: "never" })`，见
              // `ui/useChromeVisibility.ts` 里那个回调），不是第四个档位。
              收起格式化栏: 收起工具栏,
              命令状态: commandState,
              设命令状态: setCommandState,
              跑命令: run,
              插入图像,
              文档出口,
              查找条,
              预览出口,
              改动出口,
              会话出口,
              插件,
              对话框,
              refreshDocs,
              toast,
              // 底部那一条（标签栏 ＋ 状态栏）。⚠️ 2026-09-30 起它**画在
              // `.app-main` 里面**，不再是 `.app` 的直接子项——这样侧栏和右侧
              // 插件栏才通到窗口底（用户照 Typora 点的名：「注意下方变化」）。
              // 判据与"为什么是个槽位"写在 `ui/EditorArea.tsx` 那个字段上。
              底部: (
                <>
                  {/* ⚠️ 判据是 **≥2 条**（用户 2026-09-30：「下方如果只有一个标签页，
                      默认不显示标签页列表。当标签页数≥2才显示。」）——只有一个文档时
                      那一条白占 32px，而上面那个标签写的就是窗口标题里那个名字。
                      ⚠️ **代价如实记着**：单标签时**标签页右键进不去**，于是
                      「在新窗口中打开」也点不到——它是那条右键菜单里**唯一**一条。
                      要再开一个窗口就走菜单栏（文件 → 新建窗口 / 最近打开）。
                      ⚠️ 这里判的是 `docs` 的**条数**，不是"有没有文档"：0 条时
                      这一条同样不画（那时画的是 `Home`），所以门槛从 `> 0` 抬到
                      `>= 2` 顺带把 0 那条也仍然盖住了。 */}
                  {docs.length >= 2 && (
                    <TabBar
                      docs={docs}
                      activeId={activeId}
                      // ⚠️ **不是 `setActiveId`**：点标签是一次真正的"切页"，「切换文件时
                      // 自动保存」要赶在编辑器换人之前把上一份写盘（见 `切换文档`）。
                      onSelect={(id) => void 切换文档(id)}
                      onClose={closeDoc}
                      // 标签页右键那一条（2026-09-27）。⚠️ 传过去的是**路径**：新窗口是
                      // 另一个进程，它那边没有本进程的 `DocId`（判据见 `ui/TabBar.tsx`）。
                      onOpenInNewWindow={(path) => void 开新窗口(path)}
                      // 预览期间锁掉（`inert`）：不然还能切文档、关标签——而预览画的
                      // 是**这一份**文档的改动，换掉之后那幅画就没有意义了。
                      inert={预览中}
                    />
                  )}

                  {statusBarOpen && (
                    // 照 Typora 重做的下栏：左边两颗开关，右边一格统计 ＋
                    // 鼠标移进来才出现的两颗（拼写、字数统计菜单）。
                    // 判据、删掉了什么、为什么，全在 `ui/StatusBar.tsx` 文件头；
                    // **这四个开关各自读写设置里的哪一格**在 `ui/useStatusBar.ts`
                    // （2026-09-30 搬出去的那一块，本文件那天顶到了 1000 行）。
                    <StatusBar {...状态栏接线} />
                  )}
                </>
              ),
            }}
          />

          {dockOpen && (
            <PluginDock
              plugins={plugins}
              panels={panels}
              信任={信任表} onResize={(宽: number) => void updateSettings({ appearance: { ...settings!.appearance, dock_width: 宽 } })}
              // ⚠️ 这里原来还给 `PluginDock` 塞一份 `slidev={…}`（预览那一页的
              // 接线）。2026-09-25 删了：预览现在是**插件自己的一个面板**，
              // 走的是通用那条路（`nota.ui.register_panel` ＋ `kind = "frame"`），
              // 宿主这边不再有任何一条为它开的口子。
              onCall={调插件}
              askPrompt={askPrompt}
              动作={插件动作}
              // 预览期间锁掉（`inert`）。⚠️ 这一栏里是**插件的按钮**，不走
              // 菜单那张命令表——菜单全灰挡不住它们，必须单独锁。
              inert={预览中}
            />
          )}
        </div>

        <Toasts items={toasts} onDismiss={dismiss} />

        {settingsOpen && settings && (
          <SettingsDialog
            settings={settings}
            onChange={updateSettings}
            onClose={() => setSettingsOpen(false)}
            docThemes={themes}
            onOpenThemesDir={() => void openThemesDir()}
            uiStyles={uiStyles}
            onOpenStylesDir={() => void openStylesDir()}
            onOpenConfigDir={() => void openConfigDir()}
            onResetSettings={() => void resetSettings()}
            onClearRecent={() => void 清空最近()}
            menus={菜单}
            // 「拓展」那一页要的三样（⚠️ **不是** `...` 铺一份 `插件`：那一页只
            // 吃这三样，别的字段铺过去只会让人以为它也读面板 / 读菜单）。
            // 与右侧插件栏给的是**同一份**（同一个 `usePlugins`），所以两边
            // 不会出现"这一栏说装好了、那一页还没有"。
            plugins={plugins}
            插件信任={信任表}
            插件动作={插件动作}
          />
        )}

        {/* 浮层那一族（pandoc 面板 ＋ 四个对话框 ＋ 专注总结）。⚠️ 整块 2026-09-27
            搬去了 `ui/AppDialogs.tsx`——本文件当时 1024 行，顶破了 1000 行硬线。
            ⚠️ 那里收的是**一个 `对话框` 对象**（不是十来个函数），理由见那份文件头。
            ⚠️ `专注总结` 走的是**另一条路**（`useFocusTrace` 给的，不是 `askXxx`）：
            它不问任何事，是一份看完就关的报告，理由在 `ui/FocusSummaryDialog.tsx`。 */}
        <AppDialogs
          对话框={对话框}
          pandocGate={pandocGate}
          pandocGateActions={pandocGateActions}
          专注总结={专注总结}
          关掉专注总结={关掉专注总结}
        />

        {/* 右键菜单（2026-10-04）：接管 WebKit 那份英文原生菜单。和
            `AppDialogs` 同属浮层那一族（portal 到 `document.body`、不占布局），
            没开时返回 `null`。分摊的代价写在 `ui/ContextMenu.tsx` 头上。 */}
        <ContextMenu {...右键接线} />
      </div>
    </ErrorBoundary>
  );
}
