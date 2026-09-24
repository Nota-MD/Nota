/**
 * 应用外壳：状态编排 + 布局。
 *
 * 这一层只做三件事——**取数据、派事件、拼布局**。编辑器的活全在
 * `ui/EditorPane.tsx`，文件树的活在 `ui/Sidebar.tsx`，别往这里堆。
 *
 * 2026-09-23：`TopBar` 与 `TabBar` 两支**纯展示**组件搬去了同名文件（当时本文件
 * 921 行、贴着 1000 行上限）。再有"只画不决策"的一块，照这个办法搬走。
 *
 * 2026-09-24：又搬走**六块**，都是**判据/状态**而不是布局——
 * `ui/useMenus.ts`（菜单灰不灰、勾没勾、键位接不接、原生菜单推什么）、
 * `ui/useDialogs.ts`（两个自绘对话框"谁在等答案"）、
 * `ui/useExport.ts`（导出与打印）、`ui/useDocTheme.ts`（文档主题的应用/切换）、
 * `ui/useEditorCommands.ts`（把一条菜单命令送进编辑器）、
 * `ui/usePlugins.ts`（插件清单/面板/菜单项三样 ＋ 跑一条插件命令）。
 * 搬的判据都是**和外壳骨架无关**的那一类：它们各自有一份完整的理由可写，
 * 留在本文件里只会把"取数据、派事件、拼布局"这三件事淹掉。
 * 再有同样的一块，照这个办法搬走。
 *
 * ⚠️ **"搬了"和"变小了"不是同一件事**：头两次搬完它反而还在 916 行——
 * 同一批里又往里加了格式工具栏与查找条的接线，搬走的和加进来的正好抵掉。
 * 看行数要重数，不能推。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

import {
  api,
  on,
  events,
  type DocId,
  type Document,
  type Settings,
  type DocThemeInfo,
  type TreeNode,
  type NotifyPayload,
  type DocumentChangedPayload,
} from "@/bridge/ipc";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { EditorPane, type EditorPaneHandle } from "@/ui/EditorPane";
import { FindBar } from "@/ui/FindBar";
import { FormatBar } from "@/ui/FormatBar";
import { Home } from "@/ui/Home";
import { PromptDialog } from "@/ui/PromptDialog";
import { resolvePick } from "@/ui/commands";
import { PluginDock } from "@/ui/PluginDock";
import { Sidebar, type SidebarTab } from "@/ui/Sidebar";
import { SettingsDialog } from "@/ui/settings/SettingsDialog";
import { SlidevPanel } from "@/ui/SlidevPanel";
import { StatusBar } from "@/ui/StatusBar";
import { Toasts, type Toast } from "@/ui/Toasts";
import { TabBar } from "@/ui/TabBar";
import { TopBar } from "@/ui/TopBar";
import { useDialogs } from "@/ui/useDialogs";
import { useEditorCommands } from "@/ui/useEditorCommands";
import { useMenus } from "@/ui/useMenus";
import { useSlidev } from "@/ui/useSlidev";
import { applyTheme } from "@/styles/applyTheme";
import type { CommandState } from "@/editor/command-state";
import { 空查找状态, type FindStatus } from "@/editor/find";
import { useDocTheme } from "@/ui/useDocTheme";
import { useExport } from "@/ui/useExport";
import { usePlugins } from "@/ui/usePlugins";


export default function App() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [activeId, setActiveId] = useState<DocId | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
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
  const [statusBarOpen, setStatusBarOpen] = useState(true);

  // 偏好设置开着没有。**只在内存里**：它是一次交互，不是设置项本身。
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 格式化工具栏开着没有。**默认开**——用户要的就是"看得见的按钮"，
  // 默认藏在菜单里等于没做（backlog 第 2 项原话：「现在只有 Markdown 语法，
  // 没有按钮」）。同「插件栏」的道理，只在内存里，不进设置。
  const [formatBarOpen, setFormatBarOpen] = useState(true);

  // 查找条开着没有，以及编辑器报上来的**命中情况**（几个、现在第几个）。
  //
  // ⚠️ 命中数**不在这里算**：它由编辑器报上来（`find.ts` / `source.ts` 两条
  // 通路各报各的）。本地再算一份的话，源码模式下的正则、跨节点口径这些
  // 迟早会算出和编辑器不一样的数——那种差异没人查得动（见 `find.ts` 文件头）。
  //
  // ⚠️ 只在内存里，和「格式化工具栏」同理：它是**看的时候的状态**，不是设置。
  const [findOpen, setFindOpen] = useState(false);
  const [findStatus, setFindStatus] = useState<FindStatus>(空查找状态);

  // 专注模式 / 打字机模式。两个都**只在内存里**，同「格式化工具栏」：
  // 它们是"写这一篇时想不想这样"的临时状态，不是"以后都这样"的偏好。
  // 真实现（压暗哪些块、往哪儿滚）在 `editor/writing-modes.ts`。
  const [focusMode, setFocusMode] = useState(false);
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
  // 用户在应用运行期间往主题目录里丢文件不会通知我们，想让新主题出现就重开应用。
  // ⚠️ 这里**没有**界面主题——那两条轴在 `settings` 里，由 `applyTheme` 落进
  // `<html>` 的属性，不经过这份清单。
  const [themes, setThemes] = useState<DocThemeInfo[]>([]);


  // 事件订阅里要读"当前是哪份"，但**不能把它写进依赖数组**——那会让每次切标签都
  // 退订再订一遍，中间那一刻的事件是丢的。用 ref 读最新值，订阅只发生一次。
  const activeIdRef = useRef<DocId | null>(null);

  const editorRef = useRef<EditorPaneHandle>(null);


  // ── 提示 ────────────────────────────────────────────────────────────────
  const toast = useCallback((message: string, level: Toast["level"] = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, level }]);
    // 自动消失。错误留久一点——用户多半要读完再决定怎么办。
    const ttl = level === "error" ? 8000 : 3200;
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ttl);
  }, []);

  const refreshDocs = useCallback(async () => {
    const list = await api.doc.list();
    setDocs(list);
    return list;
  }, []);

  // Slidev 预览。整块编排在 `ui/useSlidev.ts` 里——这里只接线：把**文档列表**和
  // "编辑器里现在的正文"两份数据给它，换回一个会话状态和两个动作。
  // ⚠️ `getMarkdown` 包一层 `useCallback`：内联箭头每次渲染都是新函数，会把
  // `useSlidev` 里那几条回调的依赖搅得每帧都变，进而让下面的菜单表整张重建。
  const getEditorMarkdown = useCallback(() => editorRef.current?.getMarkdown(), []);
  const slidev = useSlidev({ docs, toast, getMarkdown: getEditorMarkdown });

  // 两个自绘对话框——确认框与输入框。整块在 `ui/useDialogs.ts`：
  // 「谁在等答案」的 Promise 拼接和外壳骨架不是一回事，搬走之后本文件
  // 只剩"往哪儿接"。
  const {
    confirmReq,
    askConfirm,
    answerConfirm,
    promptReq,
    askPrompt,
    answerPrompt,
  } = useDialogs();

  // 插件那一整块：已装清单、声明的面板、声明的菜单项、以及"跑一条插件命令"。
  // 整块在 `ui/usePlugins.ts`——取数据、合成菜单栏、建处理函数三件事都在那边，
  // 这边只把结果接到 `Home` / 菜单栏 / `PluginDock` 上。
  //
  // ⚠️ 位置**必须在 `useDialogs` 之后**：菜单项上声明的"先问一句"要借
  // `askPrompt`，而那个函数是上面那个 hook 产出的。
  const {
    plugins,
    panels,
    menus: 全部菜单,
    handlers: 插件处理,
    调: 调插件,
  } = usePlugins({ toast, askPrompt });

  const refreshTree = useCallback(async () => {
    if (!workspace) {
      setTree([]);
      return;
    }
    try {
      setTree(await api.workspace.tree(undefined, 1));
    } catch (e) {
      toast(String(e), "error");
    }
  }, [workspace, toast]);

  // ── 启动 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // ⚠️ 插件那三样（清单 / 面板 / 菜单项）**不在这里拉**了，
        // 搬去了 `ui/usePlugins.ts`（2026-09-24）——它们在那边有自己的一整套
        // 拉取与派生（合成菜单栏、建处理函数）。**别搬回来**：
        // 拉的地方和用它的地方分开，就又要靠 props 一层层传。
        const [s, ws, themeList] = await Promise.all([
          api.settings.get(),
          api.workspace.get(),
          // 主题扫目录。目录不存在、一个主题都没有都是**正常结果**（返回空表），
          // 不是错误——不装 Typora 的机器就是这种情况。
          api.theme.list(),
        ]);
        if (!alive) return;
        setSettings(s);
        setWorkspace(ws);
        setThemes(themeList);
        await refreshDocs();
      } catch (e) {
        toast(`启动时读取状态失败：${e}`, "error");
      }

      // 握手（见 lib.rs 里那段"为什么需要"）。失败不影响使用，只记一笔。
      try {
        await api.frontendReady();
      } catch (e) {
        console.warn("[nota] frontendReady 失败：", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [refreshDocs, toast]);

  // ── 事件订阅 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let alive = true;

    (async () => {
      const subs = await Promise.all([
        on<NotifyPayload>(events.notify, (p) => toast(p.message, p.level)),

        // 插件改了文档 → 让编辑器整篇换掉。
        // ⚠️ 这里**不去比 revision**，直接覆盖：能走到这条分支就说明
        // 改动不是本编辑器发起的（自己发起的不会绕一圈回来）。
        on<DocumentChangedPayload>(events.documentChanged, (p) => {
          if (p.origin !== "plugin") return;

          if (p.id === activeIdRef.current) {
            editorRef.current?.setMarkdown(p.text);
            return;
          }

          // ⚠️ 改的不是当前这份：`setMarkdown` 无处可放（编辑器就挂着一个），
          // 但**必须让 state 跟上**——否则那份文档在 React 里还是旧文本，
          // 用户切回去时 `EditorPane` 用旧的 `doc.text` 重建，下一次去抖 sync
          // 就把插件的改动**覆盖掉了**（backlog 第 33 项）。
          void refreshDocs();
        }),

        // 预览停了（用户点菜单、或把预览窗叉了）→ 把菜单上的勾去掉。
        // ⚠️ 这件事**只报"发生了"**（`docs/06` §3.2 那条：事件不带状态），
        // 说明状态由 `useSlidev` 自己维护。
        on<null>(events.slidevStopped, () => slidev.onStopped()),
      ]);

      if (alive) unlisteners.push(...subs);
      else subs.forEach((u) => u());
    })();

    return () => {
      alive = false;
      unlisteners.forEach((u) => u());
    };
    // `refreshDocs` 与 `toast` 都是空依赖的 useCallback，这个 effect 只跑一次。
  }, [toast, refreshDocs]);

  // 活动文档变了就告诉后端。
  //
  // ⚠️ 后端只记得"最后一次新建/打开的那份"。不在这里统一同步的话，用户点了标签 A
  // 在看 A，插件调 `nota.document.get_text()` 拿到的却是 B——AI 助手插件按这个
  // 路径写回就会**改错文档**（BUG-6）。放在 effect 里而不是只补在 `onSelect` 上，
  // 是为了把 `open` / `new` / `close` 那几条路径也一起兜住（多喊一次无害）。
  useEffect(() => {
    activeIdRef.current = activeId;
    if (activeId === null) return;
    void api.doc.setActive(activeId).catch((e) => {
      toast(`切换活动文档失败：${e}`, "error");
    });
  }, [activeId, toast]);

  // ── 主题 ────────────────────────────────────────────────────────
  useEffect(() => {
    // ⚠️ 必须把 `applyTheme` 返回的退订函数交出去。`ui_mode = "auto"` 时它挂了一个
    // `matchMedia` 监听，不接返回值就等于每次 settings 变化都再挂一个、旧的从不移除
    //（BUG-7）。`paint()` 幂等所以症状不明显，只是监听器越积越多。
    if (settings) return applyTheme(settings);
  }, [settings]);

  // ── 打开 / 新建 / 保存 ──────────────────────────────────────────────────
  const openPath = useCallback(
    async (path: string) => {
      try {
        const id = await api.doc.open(path);
        await refreshDocs();
        setActiveId(id);
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [refreshDocs, toast],
  );

  /**
   * 侧栏展开某个子目录时**按需**取它那一层（`depth = 1`）。
   *
   * ⚠️ 传的是**相对工作区**的路径——后端 `sub_path` 就是这个口径，而且它
   * 会再过一遍 `resolve_in` 的围栏（那个参数从前端来，不假定干净）。
   * ⚠️ 不要把 `depth` 调大去"一次多取几层"：几万个文件的仓库那样会在
   * 打开工作区时卡住界面，`commands/workspace.rs` 顶上写着这条取舍。
   */
  const loadDir = useCallback((subPath: string) => api.workspace.tree(subPath, 1), []);

  const newDoc = useCallback(async () => {
    try {
      const id = await api.doc.create();
      await refreshDocs();
      setActiveId(id);
    } catch (e) {
      toast(String(e), "error");
    }
  }, [refreshDocs, toast]);

  const saveDoc = useCallback(
    async (id: DocId, forceDialog = false) => {
      const doc = docs.find((d) => d.id === id);
      if (!doc) return;

      let target: string | undefined;
      if (forceDialog || !doc.path) {
        const picked = await saveDialog({
          title: "保存为",
          defaultPath: doc.path ?? `${doc.title}.md`,
          filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdx"] }],
        });
        if (!picked) return; // 用户取消了，不是错误
        target = picked;
      }

      try {
        // 存盘前**强制同步一次**——镜像可能还差最后几次击键
        //（见 document/mod.rs 顶上那段"代价与对策"）。
        const text = editorRef.current?.getMarkdown();
        if (text !== undefined) await api.doc.sync(id, text);

        const written = await api.doc.save(id, target);
        await refreshDocs();
        toast(`已保存到 ${written}`, "success");
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [docs, refreshDocs, toast],
  );

  const openViaDialog = useCallback(async () => {
    const picked = await openDialog({
      title: "打开",
      multiple: false,
      // ⚠️ 这张表要和后端 `is_markdown()` 对齐。它认 `.mdx`，这里漏掉的话
      // 文件其实**打得开**（拖进来、从文件树点），只是在对话框里筛不出来，
      // 用户会以为打不开（backlog 第 28 项）。
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdx", "mdown", "mkd", "txt"] },
      ],
    });
    if (typeof picked === "string") await openPath(picked);
  }, [openPath]);

  const openFolder = useCallback(async () => {
    const picked = await openDialog({ title: "打开文件夹", directory: true });
    if (typeof picked !== "string") return;
    try {
      const canonical = await api.workspace.open(picked);
      setWorkspace(canonical);
      setTree(await api.workspace.tree(undefined, 1));
    } catch (e) {
      toast(String(e), "error");
    }
  }, [toast]);

  // 工作区一变就重取文件树。
  useEffect(() => {
    void refreshTree();
    // refreshTree 已经依赖 workspace，这里不必再列一遍。
  }, [refreshTree]);

  const closeDoc = useCallback(
    async (id: DocId) => {
      const doc = docs.find((d) => d.id === id);
      if (doc?.dirty && settings?.confirm_unsaved) {
        const ok = await askConfirm({
          title: "有未保存的改动",
          message: `「${doc.title}」还没存盘，关掉这份改动就没了。`,
          confirmLabel: "丢弃并关闭",
          danger: true,
        });
        if (!ok) return;
      }
      try {
        await api.doc.close(id);
        const list = await refreshDocs();
        setActiveId(list.length ? list[list.length - 1]!.id : null);
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [docs, settings, refreshDocs, toast, askConfirm],
  );

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
        toast(`保存设置失败：${e}`, "error");
      }
    },
    [settings, toast, refreshDocs],
  );

  // 文档主题那三件事（应用 / 切换 / 打开主题文件夹）搬去了
  // `ui/useDocTheme.ts`（2026-09-24，本文件顶着行数上限）。那边的文件头写着
  // "为什么和 `applyTheme` 分家"、以及"只作用于编辑区"那道限域保证的来历。
  //
  // ⚠️ 位置**必须在 `updateSettings` 之后**：它拿那个函数当入参。
  const { pickTheme, openThemesDir } = useDocTheme({
    themeId: settings?.document_theme ?? "",
    themes,
    updateSettings,
    toast,
  });

  const copyAsMarkdown = useCallback(async () => {
    const text = editorRef.current?.getMarkdown();
    if (text === undefined) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制 Markdown 源码", "success");
    } catch (e) {
      toast(`复制失败：${e}`, "error");
    }
  }, [toast]);

  /**
   * 导出与打印。⚠️ 正文走 `getEditorMarkdown`——那是**身份稳定**的一个
   * `useCallback`，不是这里现写的箭头函数。现写的话每渲染一个新身份，
   * `导出`/`打印` 跟着换，`menuHandlers` 跟着换，`disabledCommands` 重算，
   * 于是**原生菜单每渲染重推一遍**（一次 IPC + 一次重建）。这条链在
   * `ui/useMenus.ts` 顶上写着，别在中间任何一环上破坏它。
   */
  const { 导出, 打印 } = useExport({
    activeId,
    docs,
    getMarkdown: getEditorMarkdown,
    themeId: settings?.document_theme ?? "",
    strict: settings?.strict_markdown ?? false,
    toast,
  });

  const toggleFullscreen = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      await win.setFullscreen(!(await win.isFullscreen()));
    } catch (e) {
      toast(`切换全屏失败：${e}`, "error");
    }
  }, [toast]);

  const showAbout = useCallback(async () => {
    let version = "未知";
    try {
      version = await getVersion();
    } catch {
      // 版本号取不到不该让「关于」打不开——那正是用户来查版本的地方。
    }
    await askConfirm({
      title: "关于 Nota",
      message: `Nota ${version}\n一款所见即所得的 Markdown 编辑器，带 Lua 插件系统。`,
      confirmLabel: "好",
      hideCancel: true,
    });
  }, [askConfirm]);

  const reloadDoc = useCallback(
    async (id: DocId) => {
      if (docs.find((d) => d.id === id)?.dirty) {
        const ok = await askConfirm({
          title: "有未保存的改动",
          message: "从磁盘重新加载会丢掉当前的改动。",
          confirmLabel: "丢弃并重新加载",
          danger: true,
        });
        if (!ok) return;
      }
      try {
        const fresh = await api.doc.reload(id);
        // 只有它正显示着才需要动编辑器——编辑器一次只挂一份（见 App 的 key）。
        if (id === activeIdRef.current) editorRef.current?.setMarkdown(fresh.text);
        await refreshDocs();
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [docs, askConfirm, refreshDocs, toast],
  );

  // 「跑一条编辑命令」与两个"先问参数、再插进去"的命令搬去了
  // `ui/useEditorCommands.ts`（2026-09-24，本文件顶着行数上限）。那边一并讲了
  // "菜单项和编辑器之间到底有几根线"。
  //
  // ⚠️ 传的是 `editorRef` **本体**（身份稳定），不是 `editorRef.current`——
  // 后者每次渲染都可能是个新值，会让 `run` 每帧换身份。
  const { run, 插入链接, 插入图像 } = useEditorCommands({ editorRef, askPrompt, toast });

  /** 关掉查找条：清高亮、清命中数，并把焦点还给编辑区。 */
  const 关查找 = useCallback(() => {
    setFindOpen(false);
    setFindStatus(空查找状态);
    editorRef.current?.clearFind();
    // ⚠️ 焦点还给编辑区：不还的话用户关掉条子接着打字，字会打在**已经
    // 不显示**的输入框里（浏览器的焦点还在那个被卸载的元素上时是 body，
    // 于是字全丢了）。这不是锦上添花，是"关了之后还能不能接着写"。
    editorRef.current?.focus();
  }, []);

  /** 「查找和替换…」——开、再点一次关。 */
  const 切查找 = useCallback(() => {
    if (findOpen) 关查找();
    else setFindOpen(true);
  }, [findOpen, 关查找]);

  /**
   * 「替换」：换掉**当前那个**命中。⚠️ 没有当前命中时如实说一句——
   * 不提示的话用户看到的是"点了没反应"，而原因（还没按过「下一个」）
   * 是看不出来的。
   */
  const 替换当前 = useCallback(
    (text: string) => {
      if (!editorRef.current?.replaceCurrent(text)) {
        toast("光标没停在命中上，先按「下一个」", "info");
      }
    },
    [toast],
  );

  /** 「全部替换」：报个数——换了多少是用户唯一能核对的凭据。 */
  const 全部替换 = useCallback(
    (text: string) => {
      const n = editorRef.current?.replaceAll(text) ?? 0;
      toast(n === 0 ? "没有可替换的内容" : `替换了 ${n} 处`, n === 0 ? "info" : "success");
    },
    [toast],
  );

  /**
   * 命令 id → 实现。**这张表就是"菜单项能不能点"的唯一真相源。**
   *
   * ⚠️ 表里没有的 id，菜单里就是灰的（见 `disabled` 与 `ui/commands.ts` 顶上那段）。
   * 所以**不要**为了让某个条目"看着能用"而在这里塞一个只弹提示的空实现——
   * 那等于让界面撒谎。做不到的就让它灰着，那是如实。
   *
   * 今天灰着的那批，都有确切的理由：
   * - 「开发者工具」：Tauri 2 的 JS API **没有**打开 devtools 的方法
   *   （`@tauri-apps/api` 只暴露创建时的 `devtools` 布尔选项）；
   * - 「导出/打印」：没做，且多半要靠 Pandoc（`docs/10` §6 那个待拍板问题）；
   * - 「新建窗口」：要动 Tauri 的窗口配置，不是菜单层的事。
   */
  const menuHandlers = useMemo<Record<string, () => void>>(() => {
    return {
      // 插件那些条目（`ui/pluginMenus.ts` 合成的栏）。**并进同一张表**，
      // 于是"灰不灰"的判据对插件项和普通项是同一条——没有为插件单开的分支。
      ...插件处理,

      "file.new": () => void newDoc(),
      "file.open": () => void openViaDialog(),
      "file.openFolder": () => void openFolder(),
      "file.reload": () => activeId !== null && void reloadDoc(activeId),
      "file.save": () => activeId !== null && void saveDoc(activeId),
      "file.saveAs": () => activeId !== null && void saveDoc(activeId, true),
      "file.close": () => activeId !== null && void closeDoc(activeId),
      "file.preferences": () => setSettingsOpen(true),

      // 导出两档 + 打印。⚠️ 子菜单里其余那些（PDF / Word / ODT / LaTeX /
      // Epub / 图片 / 其他格式）**故意不接**：它们要么得自带 Pandoc、
      // 要么得再拉一个渲染器，是 `docs/10` §6 那个"打包体积"待拍板问题。
      // 不接就是灰的——那是如实，比接一个只弹提示的空实现强。
      "file.exportHtmlPlain": () => void 导出(false),
      "file.exportHtmlStyled": () => void 导出(true),
      "file.print": () => void 打印(),

      "edit.undo": () => run("undo"),
      "edit.redo": () => run("redo"),
      "edit.copyAsMarkdown": () => void copyAsMarkdown(),
      "edit.findReplace": () => 切查找(),

      "para.h1": () => run("h1"),
      "para.h2": () => run("h2"),
      "para.h3": () => run("h3"),
      "para.h4": () => run("h4"),
      "para.h5": () => run("h5"),
      "para.h6": () => run("h6"),
      "para.text": () => run("text"),
      "para.table": () => run("table"),
      "para.tableRowAbove": () => run("tableRowAbove"),
      "para.tableRowBelow": () => run("tableRowBelow"),
      "para.tableColLeft": () => run("tableColLeft"),
      "para.tableColRight": () => run("tableColRight"),
      "para.tableDelRow": () => run("tableDelRow"),
      "para.tableDelCol": () => run("tableDelCol"),
      "para.tableDel": () => run("tableDel"),
      "para.tableAlignLeft": () => run("tableAlignLeft"),
      "para.tableAlignCenter": () => run("tableAlignCenter"),
      "para.tableAlignRight": () => run("tableAlignRight"),
      "para.codeBlock": () => run("codeBlock"),
      "para.quote": () => run("quote"),
      "para.ol": () => run("ol"),
      "para.ul": () => run("ul"),
      "para.task": () => run("task"),
      "para.hr": () => run("hr"),

      "fmt.bold": () => run("bold"),
      "fmt.italic": () => run("italic"),
      "fmt.code": () => run("inlineCode"),
      "fmt.strike": () => run("strike"),
      "fmt.link": () => void 插入链接(),
      "fmt.image": () => void 插入图像(),
      "fmt.clear": () => run("clearFormat"),

      "view.toggleSidebar": () => setSidebarOpen((v) => !v),
      "view.outline": () => {
        setSidebarOpen(true);
        setSidebarTab("outline");
      },
      "view.fileTree": () => {
        setSidebarOpen(true);
        setSidebarTab("tree");
      },
      "view.toggleDock": () => setDockOpen((v) => !v),
      "view.formatBar": () => setFormatBarOpen((v) => !v),
      "view.statusBar": () => setStatusBarOpen((v) => !v),
      "view.focusMode": () => setFocusMode((v) => !v),
      "view.typewriter": () => setTypewriter((v) => !v),

      // Slidev 预览：点一下开、再点一下关。⚠️ **勾的是"这场会话开着"**，
      // 不是"设置里开着"——所以它不进 `updateSettings`，和下面那三种模式正相反。
      "view.slidev": () => slidev.toggle(activeId),

      // 三种编辑模式。⚠️ 它们和上面那些 `setXxx` 不一样：**要落盘**。
      // 模式是"下次打开还是这样"的偏好，不是本次会话的临时开关——用户切到源码
      // 模式之后关掉再开，原地回到所见即所得会让他以为设置没生效。
      // 落盘一律走 `updateSettings`（它自己先改内存再写后端，失败会回滚）。
      "view.modeWysiwyg": () => void updateSettings({ view_mode: "wysiwyg" }),
      "view.modeSource": () => void updateSettings({ view_mode: "source" }),
      "view.modeSplit": () => void updateSettings({ view_mode: "split" }),

      "view.fullscreen": () => void toggleFullscreen(),

      "help.about": () => void showAbout(),
    };
  }, [
    // ⚠️ 插件那几条也要在内：`插件处理` 换了身份（插件菜单晚一刻拉到、
    // 或某个插件的 `prompt` 变了），这张表就得跟着换，否则菜单上的条目
    // 会停在"拉之前"的灰/亮状态上。
    插件处理,
    newDoc,
    openViaDialog,
    openFolder,
    reloadDoc,
    saveDoc,
    closeDoc,
    copyAsMarkdown,
    切查找,
    updateSettings,
    toggleFullscreen,
    showAbout,
    run,
    插入链接,
    插入图像,
    导出,
    打印,
    activeId,
    slidev,
  ]);

  /**
   * 编辑模式。⚠️ 三条**三选一**，来源是 `settings.view_mode` 而不是某个
   * `useState`——它就是编辑区的 `mode` 属性，两处**必须同源**（各存一份的
   * 症状是"菜单里的 ✓ 在 A 上、编辑区却是 B"）。默认值**必须**与 Rust 侧
   * `ViewMode::default()` 一致（`wysiwyg`），见 `settings.rs` 那条测试。
   */
  const viewMode = settings?.view_mode ?? "wysiwyg";

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
    // ⚠️ `全部菜单`（含插件那一栏）**必须**传进去：灰不灰、键位归谁、
    // 原生菜单推什么，三条判据都走这一份。传成常量 `MENUS` 的话，
    // 插件那几条会**只画在自绘菜单里**，而快捷键和 macOS 系统菜单都没有。
    menus: 全部菜单,
    menuHandlers,
    activeId,
    commandState,
    view: {
      sidebarOpen,
      sidebarTab,
      dockOpen,
      formatBarOpen,
      statusBarOpen,
      viewMode,
      slidevOpen: slidev.session !== null,
      focusMode,
      typewriter,
    },
    themes,
    documentTheme: settings?.document_theme ?? "",
    onNativePick,
  });

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;

  return (
    <ErrorBoundary>
      <div className="app">
        <TopBar
          menus={全部菜单}
          disabled={disabledCommands}
          checks={menuChecks}
          themes={themes}
          currentTheme={settings?.document_theme ?? ""}
          onCommand={(id) => menuHandlers[id]?.()}
          onTheme={pickTheme}
          onOpenThemesDir={() => void openThemesDir()}
          dockOpen={dockOpen}
          onToggleDock={() => setDockOpen((v) => !v)}
          hideMenuBar={usingNativeMenu}
        />

        <div className="app-body">
          {sidebarOpen && (
            <Sidebar
              workspace={workspace}
              tree={tree}
              docText={activeDoc?.text ?? ""}
              strict={settings?.strict_markdown ?? false}
              tab={sidebarTab}
              onTab={setSidebarTab}
              onOpenFile={openPath}
              loadDir={loadDir}
              // 右上角那个 × 与「视图 → 显示/隐藏侧边栏」、`Ctrl+Shift+L`
              // 是**同一个开关的三个入口**，共用下面这一个 setter。
              onClose={() => setSidebarOpen(false)}
              // 空态里那颗按钮走的是「文件 → 打开文件夹…」那条路，同一个函数。
              onOpenFolder={() => void openFolder()}
            />
          )}

          <main className="app-main">
            {activeDoc && findOpen && (
              // ⚠️ `key={activeDoc.id}`：查找条里的查询是**组件自己的状态**，
              // 换文档时它得跟着归零。不归零的话，B 文档那个编辑器手里没有
              // 任何查找状态（新实例），而条子里还写着 A 文档的查询——
              // 条子上的"3 / 12"和正文里一个高亮都没有，两边对不上。
              //
              // ⚠️ 两条查找回调**不包 `useCallback`**：`FindBar` 把它们存进
              // ref 读（见那边的注释），身份抖不抖它不受影响；而这里包一层
              // 反而多两行噪声。
              <FindBar
                key={activeDoc.id}
                status={findStatus}
                onQuery={(q, o) => editorRef.current?.setFind(q, o)}
                onStep={(d) => editorRef.current?.findStep(d)}
                onReplace={替换当前}
                onReplaceAll={全部替换}
                onClose={关查找}
              />
            )}
            {activeDoc && formatBarOpen && (
              // ⚠️ **只在有文档时画**。没文档时它是一排按不动的按钮
              //（命令全都没有活动文档可作用），那比不画更让人困惑。
              //
              // ⚠️ `onCommand` 传的是 `run` **本身**，不包一层箭头：
              // 包了的话每次 `App` 重渲染都是一个新函数身份，`FormatBar`
              // 那十几颗按钮就整排重画一遍。
              <FormatBar state={commandState} onCommand={run} />
            )}
            {activeDoc ? (
              <EditorPane
                ref={editorRef}
                key={activeDoc.id}
                doc={activeDoc}
                mode={viewMode}
                strict={settings?.strict_markdown ?? false}
                physics={settings?.enable_physics ?? false}
                focusMode={focusMode}
                typewriter={typewriter}
                contentWidth={settings?.content_width ?? 760}
                onCommandState={setCommandState}
                onFindStatus={setFindStatus}
                onToast={toast}
                onDocsChanged={refreshDocs}
              />
            ) : (
              <Home
                plugins={plugins}
                onNew={newDoc}
                onOpen={openViaDialog}
                onOpenFolder={openFolder}
              />
            )}
          </main>

          {dockOpen && (
            <PluginDock
              plugins={plugins}
              panels={panels}
              onClose={() => setDockOpen(false)}
              onCall={调插件}
              askPrompt={askPrompt}
            />
          )}
        </div>

        {docs.length > 0 && (
          <TabBar
            docs={docs}
            activeId={activeId}
            onSelect={setActiveId}
            onClose={closeDoc}
          />
        )}

        {statusBarOpen && (
          // 模式与严格模式只是**显示**，改它们走「视图」菜单 / 偏好设置。
          <StatusBar
            doc={activeDoc}
            mode={viewMode}
            strict={settings?.strict_markdown ?? false}
          />
        )}

        <Toasts items={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

        {settingsOpen && settings && (
          <SettingsDialog
            settings={settings}
            onChange={updateSettings}
            onClose={() => setSettingsOpen(false)}
            docThemes={themes}
            onOpenThemesDir={() => void openThemesDir()}
          />
        )}

        {slidev.gate && (
          <SlidevPanel probe={slidev.gate.probe} {...slidev.gateActions} />
        )}

        {confirmReq && (
          <ConfirmDialog
            title={confirmReq.title}
            message={confirmReq.message}
            confirmLabel={confirmReq.confirmLabel}
            danger={confirmReq.danger}
            hideCancel={confirmReq.hideCancel}
            onAnswer={answerConfirm}
          />
        )}

        {promptReq && <PromptDialog {...promptReq} onAnswer={answerPrompt} />}
      </div>
    </ErrorBoundary>
  );
}
