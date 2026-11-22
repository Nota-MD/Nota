import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type TreeNode } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";


import { extractOutline, type OutlineItem } from "@/editor/headings";

import { SidebarResizer } from "@/ui/SidebarResizer";
import { FileList } from "@/ui/SidebarFiles";
import { SidebarContextMenu } from "@/ui/SidebarContextMenu";
import { useTablistKeys } from "@/ui/useTablistKeys";

export type SidebarTab = "tree" | "outline";

interface Props {
  workspace: string | null;
  tree: TreeNode[];

  docText: string;

  activePath?: string | null;


  strict: boolean;


  tab: SidebarTab;
  onTab: (t: SidebarTab) => void;
  onOpenFile: (path: string) => void;


  onJumpOutline: (target: { line: number; index: number }) => void;

  loadDir: (path: string) => Promise<TreeNode[]>;


  optionKey: string;


  onOpenFolder: () => void;

  onNewFile: (workspaceFileName?: string, directory?: string) => void;

  onNewFolder: (directory?: string) => void;

  onRefresh: () => void;
  onDeletePath: (path: string) => void;

  searchRequest?: number;


  inert?: boolean;


  onResize: (width: number) => void;
  onCollapseFromResize?: () => void;


  collapse2?: boolean;
}

export function Sidebar({
  workspace,
  tree,
  docText,
  activePath,
  strict,
  tab,
  onTab,
  onOpenFile,
  onJumpOutline,
  loadDir,
  optionKey,
  onOpenFolder,
  onNewFile,
  onNewFolder,
  onRefresh,
  onDeletePath,
  searchRequest = 0,
  inert,
  onResize,
  onCollapseFromResize,
  collapse2,
}: Props) {

  const t = useT();
  const outline = useMemo(() => extractOutline(docText, strict), [docText, strict]);
  const [fileView, setFileView] = useState<"list" | "tree">("list");
  const [creatingFile, setCreatingFile] = useState(false);
  const [searching, setSearching] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string | null;
    deletePath: string | null;
    directory: string | null;
  } | null>(null);
  const [footerMenu, setFooterMenu] = useState(false);
  const footer = useRef<HTMLDivElement>(null);
  const workspaceName = useMemo(() => {
    if (!workspace) return "Nota";
    const parts = workspace.replaceAll("\\", "/").replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] || workspace;
  }, [workspace]);

  const pageKeyBar = useRef<HTMLElement>(null);
  useTablistKeys(pageKeyBar);

  const startNewFile = useCallback((directory?: string) => {
    const targetDirectory =
      typeof directory === "string" && directory.trim() ? directory : undefined;
    if (!workspace) {
      onNewFile();
      return;
    }
    if (fileView === "tree" || targetDirectory) {
      onNewFile(undefined, targetDirectory ?? workspace);
      return;
    }
    setCreatingFile(true);
  }, [fileView, onNewFile, workspace]);

  useEffect(() => {
    if (!searchRequest) return;
    setFileView("list");
    setSearching(true);
  }, [searchRequest]);

  useEffect(() => {
    if (!footerMenu) return;
    const pointDistinguishPlace = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Node && footer.current?.contains(target)) return;
      setFooterMenu(false);
    };
    const keypress = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFooterMenu(false);
    };
    document.addEventListener("pointerdown", pointDistinguishPlace);
    document.addEventListener("keydown", keypress);
    return () => {
      document.removeEventListener("pointerdown", pointDistinguishPlace);
      document.removeEventListener("keydown", keypress);
    };
  }, [footerMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const keypress = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keypress);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keypress);
    };
  }, [contextMenu]);

  return (
    <aside

      className={collapse2 ? "sidebar sidebar-collapsed" : "sidebar"}
      inert={inert || collapse2 || undefined}
      data-controls-open={footerMenu || contextMenu ? "true" : undefined}
    >
      {

                                                           }
      <div className="sidebar-head">
        {
                                                           }
        <nav ref={pageKeyBar} className="sidebar-tabs" role="tablist">
          <TabButton id="tree" current={tab} onSelect={onTab} label={t("File")} />
          {

                           }
          <TabButton id="outline" current={tab} onSelect={onTab} label={t("Outline")} />
        </nav>
        {


                                   }
      </div>

      <div className="sidebar-body">
        <section
          className="sidebar-pane"
          role="tabpanel"
          hidden={tab !== "tree"}
          onContextMenu={(e) => {
            e.preventDefault();
            const target = e.target as Element;
            const line3 = target.closest<HTMLElement>("[data-absolute-path]");
            const itemDirectory = line3?.dataset.directoryPath ?? null;
            const width = 272;
            const height = 472;
            setContextMenu({
              x: Math.max(8, Math.min(e.clientX, window.innerWidth - width - 8)),
              y: Math.max(8, Math.min(e.clientY, window.innerHeight - height - 8)),
              path: line3?.dataset.absolutePath ?? activePath ?? null,
              deletePath: line3?.dataset.absolutePath ?? null,
              directory: itemDirectory ?? workspace,
            });
          }}
        >
          {workspace ? (
            fileView === "list" ? (
              <FileList
                nodes={tree}
                workspace={workspace}
                activePath={activePath ?? null}
                onOpenFile={onOpenFile}
                loadDir={loadDir}
                active={!collapse2 && tab === "tree"}
                creating={creatingFile}
                searching={searching}
                onCloseSearch={() => setSearching(false)}
                onCancelCreate={() => setCreatingFile(false)}
                onCreateFile={(name) => {
                  setCreatingFile(false);
                  onNewFile(name);
                }}
              />
            ) : (
              <FileTree
                nodes={tree}
                workspace={workspace}
                activePath={activePath ?? null}
                onOpenFile={onOpenFile}
                loadDir={loadDir}
                optionKey={optionKey}
              />
            )
          ) : (
            <div className="sidebar-empty-state">
              <p>{t("File list is empty")}</p>
            </div>
          )}
        </section>
        <section className="sidebar-pane" role="tabpanel" hidden={tab !== "outline"}>
          <Outline items={outline} onJump={onJumpOutline} />
        </section>
      </div>

      {tab === "tree" && (
        <div
          ref={footer}
          className={`sidebar-footer${workspace ? "" : " sidebar-footer-empty"}`}
        >
          {footerMenu && (
            <div className="sidebar-footer-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFooterMenu(false);
                  startNewFile();
                }}
              >
                {t("New Document")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFooterMenu(false);
                  onOpenFolder();
                }}
              >
                {t("Open Folder…")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setFooterMenu(false);
                  onRefresh();
                }}
              >
                {t("Refresh")}
              </button>
            </div>
          )}
          {workspace ? (
            <>
              <button
                type="button"
                className="sidebar-footer-btn"
                title={t("New Document")}
                aria-label={t("New Document")}
                onClick={() => startNewFile()}
              >
                <Icon name="folio-add-symbolic" />
              </button>
              <span className="sidebar-workspace" title={workspace}>
                {workspaceName}
              </span>
            </>
          ) : (
            <button
              type="button"
              className="sidebar-footer-open"
              onClick={onOpenFolder}
            >
              {t("Open Folder…")}
            </button>
          )}
          <button
            type="button"
            className="sidebar-footer-btn sidebar-more"
            title={t("More actions")}
            aria-label={t("More actions")}
            aria-expanded={footerMenu}
            onClick={() => setFooterMenu((open) => !open)}
          >
            ⋮
          </button>
          <button
            type="button"
            className="sidebar-footer-btn sidebar-view-toggle"
            title={t("Switch List/Tree View")}
            aria-label={t("Switch List/Tree View")}
            onClick={() => {
              setCreatingFile(false);
              setSearching(false);
              setFileView((view) => (view === "list" ? "tree" : "list"));
            }}
          >
            <span
              className={`sidebar-view-glyph ${fileView === "list" ? "is-list" : "is-tree"}`}
              aria-hidden="true"
            >
              <i /><i /><i />
            </span>
          </button>
        </div>
      )}

      {contextMenu && (
        <SidebarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          path={contextMenu.path}
          deletePath={contextMenu.deletePath}
          targetDirectory={contextMenu.directory}
          workspace={workspace}
          listMode={fileView === "list"}
          onClose={() => setContextMenu(null)}
          onNewFile={(directory) => startNewFile(directory)}
          onNewFolder={(directory) => onNewFolder(directory)}
          onSearch={() => {
            setFileView("list");
            setSearching(true);
          }}
          onOpenFolder={onOpenFolder}
          onRefresh={onRefresh}
          onList={() => {
            setSearching(false);
            setFileView("list");
          }}
          onTree={() => {
            setSearching(false);
            setFileView("tree");
          }}
          onCopyPath={(path) => {
            void navigator.clipboard.writeText(path);
          }}
          onReveal={(path) => {
            void api.export.reveal(path).catch((e) => {
              console.warn("[nota] Could not reveal the file:", e);
            });
          }}
          onDelete={onDeletePath}
        />
      )}







      <SidebarResizer onCommit={onResize} onCollapse={onCollapseFromResize} />
    </aside>
  );
}

function TabButton(props: {
  id: SidebarTab;
  current: SidebarTab;
  onSelect: (t: SidebarTab) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.current === props.id}
      className={`sidebar-tab ${props.current === props.id ? "sidebar-tab-active" : ""}`}
      onClick={() => props.onSelect(props.id)}
    >
      {props.label}
    </button>
  );
}


interface OutlineRow {
  item: OutlineItem;
  hasKids: boolean;
  hidden: boolean;
}


function Outline({
  items,
  onJump,
}: {
  items: OutlineItem[];

  onJump: (target: { line: number; index: number }) => void;
}) {


  const t = useT();
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => new Set());
  const [activeLine, setActiveLine] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      const editor = element?.closest(".ProseMirror");
      if (!editor || !anchor) return;
      const headings = Array.from(editor.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      let index = -1;
      for (let i = 0; i < headings.length; i += 1) {
        const heading = headings[i]!;
        if (heading === anchor || heading.contains(anchor)) {
          index = i;
          break;
        }
        if (heading.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) {
          index = i;
        }
      }
      setActiveLine(index >= 0 ? items[index]?.line ?? null : null);
    };
    read();
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, [items]);

  const rows = useMemo<OutlineRow[]>(() => {
    const hasKids = items.map(
      (h, i) => i + 1 < items.length && items[i + 1]!.level > h.level,
    );

    return items.map((h, i) => {


      let hidden = false;
      let level = h.level;
      for (let j = i - 1; j >= 0 && level > 1; j--) {
        const prev = items[j]!;
        if (prev.level < level) {
          if (folded.has(prev.line)) {
            hidden = true;
            break;
          }
          level = prev.level;
        }
      }
      return { item: h, hasKids: hasKids[i]!, hidden };
    });
  }, [items, folded]);

  if (!items.length) {
    return (
      <div className="sidebar-empty-state">
        <p>{t("Outline is empty")}</p>
      </div>
    );
  }

  const toggle = (line: number) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  return (
    <ul className="outline">
      {rows.map(({ item, hasKids, hidden }, i) => {
        if (hidden) return null;
        let childCount = 0;
        for (let j = i + 1; j < items.length && items[j]!.level > item.level; j++) childCount++;
        return (
          <li
            key={`${item.line}-${i}`}
            className="outline-row"
            style={{ paddingLeft: `${(item.level - 1) * 16 + 4}px` }}
          >
            {hasKids ? (
              <button
                type="button"
                className="outline-twisty"
                data-folded={folded.has(item.line)}
                aria-expanded={!folded.has(item.line)}
                title={folded.has(item.line) ? t("Expand this section") : t("Collapse this section")}
                onClick={() => toggle(item.line)}
              >
                ▸
              </button>
            ) : (


              <span className="outline-twisty outline-twisty-leaf" aria-hidden="true" />
            )}





            <button
              type="button"
              className={`outline-item${activeLine === item.line ? " outline-item-active" : ""}`}
              title={item.text}
              onClick={() => onJump({ line: item.line, index: i })}
            >
              {item.text}
            </button>
            {folded.has(item.line) && <span className="outline-folded-count">{childCount}</span>}
          </li>
        );
      })}
    </ul>
  );
}


function FileTree(props: {
  nodes: TreeNode[];
  workspace: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  loadDir: (path: string) => Promise<TreeNode[]>;
  optionKey: string;
}) {

  const t = useT();


  const [kids, setKids] = useState<Record<string, TreeNode[]>>({});
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const kidsRef = useRef(kids);
  kidsRef.current = kids;


  const loadDirRef = useRef(props.loadDir);
  loadDirRef.current = props.loadDir;


  const getValueLayer = useCallback((path: string) => {
    void loadDirRef
      .current(path)
      .then((nodes) => setKids((prev) => ({ ...prev, [path]: nodes })))
      .catch((e: unknown) => {


        setErrors((prev) => ({ ...prev, [path]: String(e) }));
      });
  }, []);


  const aboveCountMouthPath = useRef(props.optionKey);
  useEffect(() => {
    if (aboveCountMouthPath.current === props.optionKey) return;
    aboveCountMouthPath.current = props.optionKey;
    const returnOpen = [...open];
    setKids({});
    setErrors({});
    for (const path of returnOpen) getValueLayer(path);
  }, [props.optionKey, open, getValueLayer]);

  const aboveCountNodes = useRef(props.nodes);
  useEffect(() => {
    if (aboveCountNodes.current === props.nodes) return;
    aboveCountNodes.current = props.nodes;
    const returnOpen = [...open];
    setKids({});
    setErrors({});
    for (const path of returnOpen) getValueLayer(path);
  }, [props.nodes, open, getValueLayer]);

  const toggle = (path: string) => {
    if (open.has(path)) {
      setOpen((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      return;
    }


    setOpen((prev) => new Set(prev).add(path));
    if (kids[path]) return;

    getValueLayer(path);
  };

  useEffect(() => {
    if (!props.activePath) return;
    const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");
    const workspace = normalize(props.workspace);
    const active = normalize(props.activePath);
    if (!active.startsWith(`${workspace}/`)) return;
    const parts = active.slice(workspace.length + 1).split("/");
    const parents: string[] = [];
    for (let i = 1; i < parts.length; i += 1) parents.push(parts.slice(0, i).join("/"));
    if (!parents.length) return;
    setOpen((prev) => {
      const next = new Set(prev);
      for (const path of parents) next.add(path);
      return next;
    });
    for (const path of parents) {
      if (!kidsRef.current[path]) getValueLayer(path);
    }
  }, [props.activePath, props.workspace, getValueLayer]);

  if (!props.nodes.length) {
    return (
      <div className="sidebar-empty-state">
        <p>{t("File list is empty")}</p>
      </div>
    );
  }


  const openFile = (rel: string) => props.onOpenFile(`${props.workspace}/${rel}`);

  return (
    <ul className="tree">
      {props.nodes.map((n) => (
        <TreeRow
          key={n.path}
          node={n}
          workspace={props.workspace}
          depth={0}
          open={open}
          kids={kids}
          errors={errors}
          activePath={props.activePath}
          onToggleDir={toggle}
          onOpenFile={openFile}
        />
      ))}
    </ul>
  );
}

function TreeRow(props: {
  node: TreeNode;
  workspace: string;
  depth: number;
  open: ReadonlySet<string>;
  kids: Record<string, TreeNode[]>;
  errors: Record<string, string>;
  activePath: string | null;
  onToggleDir: (path: string) => void;
  onOpenFile: (rel: string) => void;
}) {
  const { node, workspace, depth, open, kids, errors, activePath, onToggleDir, onOpenFile } = props;

  const t = useT();
  const pad = { paddingLeft: `${depth * 18 + 6}px` };
  const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");
  const absolute = `${workspace}/${node.path}`;
  const parentDirectory = node.path.includes("/")
    ? `${workspace}/${node.path.slice(0, node.path.lastIndexOf("/"))}`
    : workspace;
  const isActive =
    activePath !== null && normalize(activePath) === normalize(absolute);

  if (node.is_dir) {
    const expanded = open.has(node.path);
    const children = kids[node.path];
    return (
      <li className="tree-dir">
        <button
          type="button"
          className="tree-dir-btn"
          style={pad}
          data-open={expanded}
          aria-expanded={expanded}
          title={node.path}
          data-absolute-path={`${workspace}/${node.path}`}
          data-directory-path={absolute}
          onClick={() => onToggleDir(node.path)}
        >
          <span className="tree-twisty" data-open={expanded}>
            ▸
          </span>
          <Icon
            name={expanded ? "nota-tree-folder-open-symbolic" : "nota-tree-folder-symbolic"}
            size={16}
          />
          <span className="tree-row-label">{node.name}</span>
        </button>

        {expanded && children && (
          <ul className="tree">
            {children.map((c) => (
              <TreeRow
                key={c.path}
                node={c}
                workspace={workspace}
                depth={depth + 1}
                open={open}
                kids={kids}
                errors={errors}
                activePath={activePath}
                onToggleDir={onToggleDir}
                onOpenFile={onOpenFile}
              />
            ))}
          </ul>
        )}

        {expanded && errors[node.path] && (
          <p className="tree-error" style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}>
            {t("Cannot read this folder: {0}", errors[node.path] ?? "")}
          </p>
        )}
      </li>
    );
  }

  return (
    <li className="tree-file">
      <button
        type="button"
        className="tree-file-btn"
        style={pad}
        aria-current={isActive ? "page" : undefined}
        title={`${workspace}/${node.path}`}
        data-absolute-path={`${workspace}/${node.path}`}
        data-directory-path={parentDirectory}
        onClick={() => onOpenFile(node.path)}
      >
        <Icon name="nota-tree-file-symbolic" size={16} />
        <span className="tree-row-label">{node.name}</span>
      </button>
    </li>
  );
}
