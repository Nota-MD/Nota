/**
 * 应用外壳：状态编排 + 布局。
 *
 * 这一层只做三件事——**取数据、派事件、拼布局**。编辑器的活全在
 * `ui/EditorPane.tsx`，文件树的活在 `ui/Sidebar.tsx`，别往这里堆。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
// ⚠️ 改个名再导入。本文件里已经有一个 `openPath`（打开一份**文档**），
// 而这个是"交给系统去打开**这个路径**"（文件管理器/默认程序）。
// 同名会让下面那句 `openPath(await api.theme.dir())` 静默地去开一份文档。
import { openPath as openWithSystem } from "@tauri-apps/plugin-opener";

import {
  api,
  on,
  events,
  type DocId,
  type Document,
  type PluginInfo,
  type PluginPanel,
  type Settings,
  type ThemeInfo,
  type TreeNode,
  type NotifyPayload,
  type DocumentChangedPayload,
} from "@/bridge/ipc";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { EditorPane, type EditorPaneHandle } from "@/ui/EditorPane";
import { Home } from "@/ui/Home";
import { MenuBar } from "@/ui/MenuBar";
import { MENUS } from "@/ui/commands";
import { PluginDock } from "@/ui/PluginDock";
import { Sidebar, type SidebarTab } from "@/ui/Sidebar";
import { StatusBar } from "@/ui/StatusBar";
import { Toasts, type Toast } from "@/ui/Toasts";
import { applyTheme } from "@/styles/applyTheme";
import { applyDocTheme } from "@/styles/typora-theme";
import type { EditorCommand } from "@/editor/create";

export default function App() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [activeId, setActiveId] = useState<DocId | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  // 插件**声明**的面板（不是插件清单本身）。启动时拉一次，见下面那段注释。
  const [panels, setPanels] = useState<PluginPanel[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // 右侧插件栏开着没有。**默认开**——用户点名要的就是"插件在右侧边栏"，
  // 默认藏起来等于没做。收起后这一格宽度全还给正文。
  // ⚠️ 只在内存里，没进 settings：它跟左侧栏选的是哪一页一样是**看的时候的状态**，
  // 不是文档的属性。真要持久化时跟 `content_width` 那批一起走。
  const [dockOpen, setDockOpen] = useState(true);

  // 左侧栏开着没有、以及它现在是哪一页。**放在 App 上**是为了让
  // 「视图 → 显示/隐藏侧边栏 / 大纲 / 文件树」那几条菜单项能驱动它
  //（见 `ui/Sidebar.tsx` 里那段"为什么改成受控"）。
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("tree");
  const [statusBarOpen, setStatusBarOpen] = useState(true);

  // 扫到的主题。启动时拉一次——它是**状态不是事件**，同 `panels` 的道理（BUG-13）：
  // 用户在应用运行期间往主题目录里丢文件不会通知我们，想让新主题出现就重开应用。
  const [themes, setThemes] = useState<ThemeInfo[]>([]);

  const editorRef = useRef<EditorPaneHandle>(null);

  // 自己画的确认框。**不再用 `window.confirm`**——它会阻塞 WebView，把中文
  // 输入法的组合态打断（见 `ui/ConfirmDialog.tsx` 文件头）。
  // 这里存的是"谁在等答案"：`askConfirm` 返回的 Promise 由按钮的点击来兑现。
  const [confirmReq, setConfirmReq] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    /** 只报信、不问事（「关于 Nota」）时把「取消」藏掉。 */
    hideCancel?: boolean;
  } | null>(null);
  const confirmResolve = useRef<((ok: boolean) => void) | null>(null);
  // 事件订阅里要读"当前是哪份"，但**不能把它写进依赖数组**——那会让每次切标签都
  // 退订再订一遍，中间那一刻的事件是丢的。用 ref 读最新值，订阅只发生一次。
  const activeIdRef = useRef<DocId | null>(null);

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

  /**
   * 弹一个确认框，等用户点。返回他点的是不是"确定"。
   *
   * ⚠️ 一次只可能有一个：`confirmResolve` 是**单个** ref，不是队列。
   * 今天所有调用点都是用户动作直接触发的（关文档、退出），不存在并发；
   * 真要并发弹两个，后来者会把前一个的 Promise 永远挂着——那时再改成队列。
   */
  const askConfirm = useCallback(
    (req: {
      title: string;
      message: string;
      confirmLabel?: string;
      danger?: boolean;
      hideCancel?: boolean;
    }) => {
      return new Promise<boolean>((resolve) => {
        confirmResolve.current = resolve;
        setConfirmReq(req);
      });
    },
    [],
  );

  const answerConfirm = useCallback((ok: boolean) => {
    setConfirmReq(null);
    const resolve = confirmResolve.current;
    confirmResolve.current = null;
    resolve?.(ok);
  }, []);

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
        // 面板清单与插件清单一起拉。**在这里拉、不在事件里等**，
        // 因为 `register_panel` 跑在插件加载时（比这个挂载早）——
        // 等事件是等不到的，且等不到也不报错。见 BUG-13。
        const [s, ws, ps, panels, themeList] = await Promise.all([
          api.settings.get(),
          api.workspace.get(),
          api.plugin.list(),
          api.plugin.panels(),
          // 主题扫目录。目录不存在、一个主题都没有都是**正常结果**（返回空表），
          // 不是错误——不装 Typora 的机器就是这种情况。
          api.theme.list(),
        ]);
        if (!alive) return;
        setSettings(s);
        setWorkspace(ws);
        setPlugins(ps);
        setPanels(panels);
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

  // ── 主题 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    // ⚠️ 必须把 `applyTheme` 返回的退订函数交出去。`ui_mode = "auto"` 时它挂了一个
    // `matchMedia` 监听，不接返回值就等于每次 settings 变化都再挂一个、旧的从不移除
    //（BUG-7）。`paint()` 幂等所以症状不明显，只是监听器越积越多。
    if (settings) return applyTheme(settings);
  }, [settings]);

  // 文档主题（Typora 那套）单独的通道：它的 CSS 要**读文件 + 改造**才能注入，
  // 是异步的，跟 `applyTheme` 那种纯写属性的事不是一个节奏，所以不塞在一起。
  //
  // ⚠️ 找不到对应的主题文件时**安静地退回内置默认**，不弹错。settings 里记着
  // 一个名字、而用户的主题文件被删了，这是很平常的事（换机器、清理磁盘），
  // 不是需要打断用户的错误。`applyTheme` 那边也照常写 `data-doc-theme` 属性，
  // 桥接变量取不到值就回落到我们自己的明暗两套（见 `theme.css` 末尾）。
  useEffect(() => {
    const name = settings?.document_theme ?? "";
    const info = name ? themes.find((t) => t.name === name) : undefined;
    let alive = true;

    (async () => {
      try {
        await applyDocTheme(info ? { css: info.css } : null);
      } catch (e) {
        if (alive) console.warn("[nota] 应用文档主题失败：", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [settings?.document_theme, themes]);

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
      } catch (e) {
        setSettings(previous);
        toast(`保存设置失败：${e}`, "error");
      }
    },
    [settings, toast],
  );

  const pickTheme = useCallback(
    (name: string) => {
      void updateSettings({ document_theme: name });
      toast(name ? `已切换到主题「${name}」` : "已切回内置默认样式", "success");
    },
    [updateSettings, toast],
  );

  const openThemesDir = useCallback(async () => {
    try {
      // 后端会把目录**建出来**再返回——首次使用时它多半还不存在，
      // 直接打开一个不存在的路径会被文件管理器拒掉。
      await openWithSystem(await api.theme.dir());
    } catch (e) {
      toast(`打开主题文件夹失败：${e}`, "error");
    }
  }, [toast]);

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
      message: `Nota ${version}\n一款对标 Typora 的所见即所得 Markdown 编辑器。`,
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

  /**
   * 命令 id → 实现。**这张表就是"菜单项能不能点"的唯一真相源。**
   *
   * ⚠️ 表里没有的 id，菜单里就是灰的（见 `disabled` 与 `ui/commands.ts` 顶上那段）。
   * 所以**不要**为了让某个条目"看着能用"而在这里塞一个只弹提示的空实现——
   * 那等于让界面撒谎。做不到的就让它灰着，那是如实。
   *
   * 今天灰着的那批，都有确切的理由：
   * - 「查找和替换」「源代码模式」「专注/打字机模式」：功能没做（`docs/07`）；
   * - 「开发者工具」：Tauri 2 的 JS API **没有**打开 devtools 的方法
   *   （`@tauri-apps/api` 只暴露创建时的 `devtools` 布尔选项）；
   * - 「导出/打印」：没做，且多半要靠 Pandoc（`docs/10` §6 那个待拍板问题）；
   * - 「新建窗口」：要动 Tauri 的窗口配置，不是菜单层的事。
   */
  const menuHandlers = useMemo<Record<string, () => void>>(() => {
    const run = (c: EditorCommand) => editorRef.current?.runCommand(c);
    return {
      "file.new": () => void newDoc(),
      "file.open": () => void openViaDialog(),
      "file.openFolder": () => void openFolder(),
      "file.reload": () => activeId !== null && void reloadDoc(activeId),
      "file.save": () => activeId !== null && void saveDoc(activeId),
      "file.saveAs": () => activeId !== null && void saveDoc(activeId, true),
      "file.close": () => activeId !== null && void closeDoc(activeId),

      "edit.undo": () => run("undo"),
      "edit.redo": () => run("redo"),
      "edit.copyAsMarkdown": () => void copyAsMarkdown(),

      "para.h1": () => run("h1"),
      "para.h2": () => run("h2"),
      "para.h3": () => run("h3"),
      "para.h4": () => run("h4"),
      "para.h5": () => run("h5"),
      "para.h6": () => run("h6"),
      "para.text": () => run("text"),
      "para.table": () => run("table"),
      "para.codeBlock": () => run("codeBlock"),
      "para.quote": () => run("quote"),
      "para.ol": () => run("ol"),
      "para.ul": () => run("ul"),
      "para.hr": () => run("hr"),

      "fmt.bold": () => run("bold"),
      "fmt.italic": () => run("italic"),
      "fmt.code": () => run("inlineCode"),
      "fmt.strike": () => run("strike"),

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
      "view.statusBar": () => setStatusBarOpen((v) => !v),
      "view.fullscreen": () => void toggleFullscreen(),

      "help.about": () => void showAbout(),
    };
  }, [
    newDoc,
    openViaDialog,
    openFolder,
    reloadDoc,
    saveDoc,
    closeDoc,
    copyAsMarkdown,
    toggleFullscreen,
    showAbout,
    activeId,
  ]);

  /** 灰掉的命令。没实现、或缺活动文档，都进这里。 */
  const disabledCommands = useMemo(() => {
    const out = new Set<string>();
    for (const menu of MENUS) {
      for (const entry of menu.items) {
        if (entry === "sep") continue;
        if (!menuHandlers[entry.id] || (entry.needsDoc && activeId === null)) {
          out.add(entry.id);
        }
      }
    }
    return out;
  }, [menuHandlers, activeId]);

  /** 可勾选项的当前状态。 */
  const menuChecks = useMemo<Record<string, boolean>>(
    () => ({
      "view.toggleSidebar": sidebarOpen,
      "view.outline": sidebarOpen && sidebarTab === "outline",
      "view.fileTree": sidebarOpen && sidebarTab === "tree",
      "view.toggleDock": dockOpen,
      "view.statusBar": statusBarOpen,
    }),
    [sidebarOpen, sidebarTab, dockOpen, statusBarOpen],
  );

  // ── 快捷键 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 不带 Ctrl 的那两条先判：F11 全屏、Shift+F12 之外不接别的。
      if (e.key === "F11") {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      if (key === "s" && activeId !== null) {
        e.preventDefault();
        void saveDoc(activeId, e.shiftKey); // Ctrl+Shift+S = 另存为
      } else if (key === "n") {
        e.preventDefault();
        void newDoc();
      } else if (key === "o") {
        e.preventDefault();
        void openViaDialog();
      } else if (key === "w" && activeId !== null) {
        e.preventDefault();
        void closeDoc(activeId);
      } else if (key === "c" && e.shiftKey) {
        // ⚠️ 只在**有 Shift** 时接：不带 Shift 的 Ctrl+C 是系统的复制，
        // 抢过来会让编辑器里选不中的东西复制不了。
        e.preventDefault();
        void copyAsMarkdown();
      } else if (key === "l" && e.shiftKey) {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (e.shiftKey && e.code === "Digit1") {
        // ⚠️ 判的是 `e.code` 而不是 `e.key`。按着 Shift 敲数字排，`e.key`
        // 拿到的是**上档字符**——Shift+1 是 `"!"`、Shift+3 是 `"#"`，
        // 所以 `key === "1"` 永远不成立，这两条曾是**按了没反应**的死代码。
        // `e.code` 是物理键位，不随 Shift 变。
        e.preventDefault();
        setSidebarOpen(true);
        setSidebarTab("outline");
      } else if (e.shiftKey && e.code === "Digit3") {
        e.preventDefault();
        setSidebarOpen(true);
        setSidebarTab("tree");
      } else if (!e.shiftKey && key >= "1" && key <= "6") {
        // Ctrl+1..6 切标题级别。⚠️ **不带 Shift**：Ctrl+Shift+1/3 已经被上面
        // 那两条占走了（侧栏页），两者不能混。
        // ProseMirror 自己的标题快捷键是 Ctrl+Alt+1..6，所以这里不冲突。
        e.preventDefault();
        editorRef.current?.runCommand(`h${key}` as EditorCommand);
      } else if (!e.shiftKey && key === "0") {
        e.preventDefault();
        editorRef.current?.runCommand("text");
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, saveDoc, newDoc, openViaDialog, closeDoc, copyAsMarkdown, toggleFullscreen]);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;

  return (
    <ErrorBoundary>
      <div className="app">
        <TopBar
          disabled={disabledCommands}
          checks={menuChecks}
          themes={themes}
          currentTheme={settings?.document_theme ?? ""}
          onCommand={(id) => menuHandlers[id]?.()}
          onTheme={pickTheme}
          onOpenThemesDir={() => void openThemesDir()}
          dockOpen={dockOpen}
          onToggleDock={() => setDockOpen((v) => !v)}
        />

        <div className="app-body">
          {sidebarOpen && (
            <Sidebar
              workspace={workspace}
              tree={tree}
              docText={activeDoc?.text ?? ""}
              tab={sidebarTab}
              onTab={setSidebarTab}
              onOpenFile={openPath}
            />
          )}

          <main className="app-main">
            {activeDoc ? (
              <EditorPane
                ref={editorRef}
                key={activeDoc.id}
                doc={activeDoc}
                contentWidth={settings?.content_width ?? 760}
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

        {statusBarOpen && <StatusBar doc={activeDoc} />}

        <Toasts items={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

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
      </div>
    </ErrorBoundary>
  );
}

// ── 顶栏：品牌 + 菜单栏 + 插件栏开关 ──────────────────────────────────────

/**
 * ⚠️ **四个工具条按钮（新建/打开/打开文件夹/保存）2026-09-23 撤掉了**——
 * 它们各是「文件」菜单里的一项，留着就是同一件事的两个入口，
 * 而 Typora 顶栏上并没有这一排按钮。对标的是它的布局，不是"多留几个快捷方式"。
 *
 * 快捷键一个没少（Ctrl+N/O/S…），「文件」菜单里也都还在，所以撤掉的是
 * 那个**重复的**入口，不是能力。
 */
function TopBar(props: {
  disabled: Set<string>;
  checks: Record<string, boolean>;
  themes: ThemeInfo[];
  currentTheme: string;
  onCommand: (id: string) => void;
  onTheme: (name: string) => void;
  onOpenThemesDir: () => void;
  dockOpen: boolean;
  onToggleDock: () => void;
}) {
  return (
    <header className="toolbar">
      <span className="toolbar-brand">Nota</span>

      <MenuBar
        disabled={props.disabled}
        checks={props.checks}
        themes={props.themes}
        currentTheme={props.currentTheme}
        onCommand={props.onCommand}
        onTheme={props.onTheme}
        onOpenThemesDir={props.onOpenThemesDir}
      />

      {/* 插件栏的开关推到最右。`margin-left: auto` 让它在 flex 里吃满剩余空间——
          这是**唯一**的定位手段，别加什么 spacer 元素。 */}
      <button
        type="button"
        className={`btn toolbar-dock-toggle ${props.dockOpen ? "btn-on" : ""}`}
        onClick={props.onToggleDock}
        title={props.dockOpen ? "收起插件栏" : "展开插件栏"}
        aria-pressed={props.dockOpen}
      >
        插件
      </button>
    </header>
  );
}

// ── 标签栏 ────────────────────────────────────────────────────────────────

function TabBar(props: {
  docs: Document[];
  activeId: DocId | null;
  onSelect: (id: DocId) => void;
  onClose: (id: DocId) => void;
}) {
  return (
    <div className="tabbar" role="tablist">
      {props.docs.map((d) => (
        <div
          key={d.id}
          role="tab"
          aria-selected={d.id === props.activeId}
          className={`tab ${d.id === props.activeId ? "tab-active" : ""}`}
        >
          <button type="button" className="tab-label" onClick={() => props.onSelect(d.id)}>
            {d.dirty && <span className="tab-dot" title="有未保存的改动" />}
            {d.title}
          </button>
          <button
            type="button"
            className="tab-close"
            title="关闭"
            onClick={() => props.onClose(d.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
