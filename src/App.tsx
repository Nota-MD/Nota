/**
 * 应用外壳：状态编排 + 布局。
 *
 * 这一层只做三件事——**取数据、派事件、拼布局**。编辑器的活全在
 * `ui/EditorPane.tsx`，文件树的活在 `ui/Sidebar.tsx`，别往这里堆。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

import {
  api,
  on,
  events,
  type DocId,
  type Document,
  type PluginInfo,
  type PluginPanel,
  type Settings,
  type TreeNode,
  type NotifyPayload,
  type DocumentChangedPayload,
} from "@/bridge/ipc";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { EditorPane, type EditorPaneHandle } from "@/ui/EditorPane";
import { Home } from "@/ui/Home";
import { PluginDock } from "@/ui/PluginDock";
import { Sidebar } from "@/ui/Sidebar";
import { StatusBar } from "@/ui/StatusBar";
import { Toasts, type Toast } from "@/ui/Toasts";
import { applyTheme } from "@/styles/applyTheme";

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

  const editorRef = useRef<EditorPaneHandle>(null);

  // 自己画的确认框。**不再用 `window.confirm`**——它会阻塞 WebView，把中文
  // 输入法的组合态打断（见 `ui/ConfirmDialog.tsx` 文件头）。
  // 这里存的是"谁在等答案"：`askConfirm` 返回的 Promise 由按钮的点击来兑现。
  const [confirmReq, setConfirmReq] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
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
    (req: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => {
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
        const [s, ws, ps, panels] = await Promise.all([
          api.settings.get(),
          api.workspace.get(),
          api.plugin.list(),
          api.plugin.panels(),
        ]);
        if (!alive) return;
        setSettings(s);
        setWorkspace(ws);
        setPlugins(ps);
        setPanels(panels);
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

  // ── 快捷键 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, saveDoc, newDoc, openViaDialog, closeDoc]);

  const activeDoc = docs.find((d) => d.id === activeId) ?? null;

  return (
    <ErrorBoundary>
      <div className="app">
        <Toolbar
          onNew={newDoc}
          onOpen={openViaDialog}
          onOpenFolder={openFolder}
          onSave={() => activeId !== null && void saveDoc(activeId)}
          hasActive={activeId !== null}
          dockOpen={dockOpen}
          onToggleDock={() => setDockOpen((v) => !v)}
        />

        <div className="app-body">
          <Sidebar
            workspace={workspace}
            tree={tree}
            docText={activeDoc?.text ?? ""}
            onOpenFile={openPath}
          />

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

        <StatusBar doc={activeDoc} />

        <Toasts items={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

        {confirmReq && (
          <ConfirmDialog
            title={confirmReq.title}
            message={confirmReq.message}
            confirmLabel={confirmReq.confirmLabel}
            danger={confirmReq.danger}
            onAnswer={answerConfirm}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

// ── 顶部工具条 ────────────────────────────────────────────────────────────

function Toolbar(props: {
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  hasActive: boolean;
  dockOpen: boolean;
  onToggleDock: () => void;
}) {
  return (
    <header className="toolbar">
      <span className="toolbar-brand">Nota</span>
      <div className="toolbar-actions">
        <button type="button" className="btn" onClick={props.onNew}>
          新建
        </button>
        <button type="button" className="btn" onClick={props.onOpen}>
          打开
        </button>
        <button type="button" className="btn" onClick={props.onOpenFolder}>
          打开文件夹
        </button>
        <button
          type="button"
          className="btn"
          onClick={props.onSave}
          disabled={!props.hasActive}
        >
          保存
        </button>
      </div>

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
