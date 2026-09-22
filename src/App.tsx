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
          if (p.origin === "plugin" && p.id === activeId) {
            editorRef.current?.setMarkdown(p.text);
          }
        }),
      ]);

      if (alive) unlisteners.push(...subs);
      else subs.forEach((u) => u());
    })();

    return () => {
      alive = false;
      unlisteners.forEach((u) => u());
    };
  }, [toast, activeId]);

  // ── 主题 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (settings) applyTheme(settings);
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
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
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
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] },
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
        // 本轮先用原生确认框。自己画一个对话框排在界面那一轮（docs/07）。
        const ok = window.confirm(`「${doc.title}」有未保存的改动，仍然关闭吗？`);
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
    [docs, settings, refreshDocs, toast],
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
