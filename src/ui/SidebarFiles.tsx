/**
 * 侧栏「文件」页的扁平列表。
 *
 * 从 `Sidebar.tsx` 拆出的理由是职责完整：工作区递归扫描、列表/树切换由外层
 * 负责，这里只做扁平列表、文件摘要与新文件输入行。摘要按可见文件分批读取，
 * 完整正文不进入启动路径。
 */

import { useEffect, useRef, useState } from "react";

import { api, type TreeNode, type WorkspaceExcerpt } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";

interface FlatFile {
  name: string;
  /** 去掉最后一段后缀的显示名。扩展名单独淡色显示，与 Typora 的文件列表一致。 */
  base: string;
  /** 含点的末段后缀；没有后缀时为空串。 */
  extension: string;
  path: string;
  parent: string | null;
}

function getTopLayerTextItem(nodes: TreeNode[]): FlatFile[] {
  return nodes
    .filter((node) => !node.is_dir)
    .map((node) => {
      const slantBar = node.path.lastIndexOf("/");
      const point = node.name.lastIndexOf(".");
      return {
        name: node.name,
        base: point > 0 ? node.name.slice(0, point) : node.name,
        extension: point > 0 ? node.name.slice(point) : "",
        path: node.path,
        parent: slantBar >= 0 ? node.path.slice(0, slantBar) : null,
      };
    });
}

export function FileList(props: {
  nodes: TreeNode[];
  workspace: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  loadDir: (path: string) => Promise<TreeNode[]>;
  /** 页面现在真的可见吗。折叠侧栏或切到大纲时，不要在后台递归扫描工作区。 */
  active: boolean;
  creating: boolean;
  searching: boolean;
  onCloseSearch: () => void;
  onCancelCreate: () => void;
  onCreateFile: (name: string) => void;
}) {
  const t = useT();
  const [files, setFiles] = useState<FlatFile[]>(() => getTopLayerTextItem(props.nodes));
  const [excerpts, setExcerpts] = useState<Record<string, WorkspaceExcerpt>>({});
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);
  const [query, setQuery] = useState("");
  const loadDir = useRef(props.loadDir);
  loadDir.current = props.loadDir;
  const pleaseRequestPassRemoveWant = useRef(new Set<string>());
  const searchSearchBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.searching) {
      searchSearchBox.current?.focus();
      searchSearchBox.current?.select();
    } else {
      setQuery("");
    }
  }, [props.searching]);

  useEffect(() => {
    setExcerpts({});
    pleaseRequestPassRemoveWant.current.clear();
  }, [props.workspace]);

  useEffect(() => {
    const pendingRead = files
      .map((file) => file.path)
      .filter((path) => !pleaseRequestPassRemoveWant.current.has(path));
    if (!pendingRead.length) return;
    let getClear = false;

    const readRemoveWant = async () => {
      for (let i = 0; i < pendingRead.length; i += 24) {
        const batch = pendingRead.slice(i, i + 24);
        for (const path of batch) pleaseRequestPassRemoveWant.current.add(path);
        try {
          const result2 = await api.workspace.excerpts(batch);
          if (getClear) return;
          setExcerpts((prev) => {
            const next = { ...prev };
            for (const item of result2) next[item.path] = item;
            return next;
          });
        } catch {
          // 摘要只是增强信息；读不到就保留文件名与目录，不打断列表。
        }
      }
    };
    void readRemoveWant();
    return () => {
      getClear = true;
    };
  }, [files]);

  useEffect(() => {
    let getClear = false;
    const firstCount = getTopLayerTextItem(props.nodes);
    setFiles(firstCount);
    setPartial(false);
    if (!props.active) {
      setLoading(false);
      return;
    }

    const queueColumn = props.nodes.filter((node) => node.is_dir).map((node) => node.path);
    setLoading(queueColumn.length > 0);
    if (!queueColumn.length) return;

    const alreadyVisitAsk = new Set<string>();
    const mostManyItemRecord = 512;
    const walk = async () => {
      while (queueColumn.length && alreadyVisitAsk.size < mostManyItemRecord) {
        const batch = queueColumn.splice(0, 8).filter((path) => !alreadyVisitAsk.has(path));
        for (const dir of batch) alreadyVisitAsk.add(dir);
        const result2 = await Promise.all(
          batch.map(async (dir) => {
            try {
              return { children: await loadDir.current(dir), ok: true as const };
            } catch {
              return { children: [] as TreeNode[], ok: false as const };
            }
          }),
        );
        if (getClear) return;

        for (const { children, ok } of result2) {
          if (!ok) setPartial(true);
          const newTextItem = getTopLayerTextItem(children);
          if (newTextItem.length) {
            setFiles((prev) => {
              const alreadyHas = new Set(prev.map((file) => file.path));
              return [...prev, ...newTextItem.filter((file) => !alreadyHas.has(file.path))];
            });
          }
          for (const child of children) {
            if (child.is_dir && !alreadyVisitAsk.has(child.path)) queueColumn.push(child.path);
          }
        }
      }
      if (!getClear) {
        if (queueColumn.length) setPartial(true);
        setLoading(false);
      }
    };
    void walk();

    return () => {
      getClear = true;
    };
  }, [props.nodes, props.active]);

  const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");
  const active = props.activePath ? normalize(props.activePath) : null;

  if (!files.length && loading && !props.creating) {
    return <p className="sidebar-empty">{t("Loading…")}</p>;
  }

  const workspaceName =
    props.workspace.replaceAll("\\", "/").replace(/\/+$/, "").split("/").pop() ||
    props.workspace;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleFiles = normalizedQuery
    ? files.filter((file) => {
        const excerpt = excerpts[file.path];
        return [file.path, excerpt?.title, excerpt?.detail]
          .filter(Boolean)
          .some((text) => String(text).toLocaleLowerCase().includes(normalizedQuery));
      })
    : files;

  return (
    <>
      {props.searching && (
        <div className="file-list-search">
          <Icon name="folio-edit-find-symbolic" size={15} />
          <input
            ref={searchSearchBox}
            value={query}
            placeholder={t("Search files…")}
            aria-label={t("Search files")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") props.onCloseSearch();
            }}
          />
          <button
            type="button"
            title={t("Close")}
            aria-label={t("Close")}
            onClick={props.onCloseSearch}
          >
            <Icon name="folio-close-symbolic" size={14} />
          </button>
        </div>
      )}
      <ul className="file-list" aria-busy={loading}>
        {props.creating && (
          <NewFileRow
            context={workspaceName}
            onCancel={props.onCancelCreate}
            onSubmit={props.onCreateFile}
          />
        )}
        {visibleFiles.map((file) => {
          const absolute = `${props.workspace}/${file.path}`;
          const isActive = active !== null && active === normalize(absolute);
          const excerpt = excerpts[file.path];
          return (
            <li className="file-list-row" key={file.path}>
              <button
                type="button"
                className="file-list-btn"
                aria-current={isActive ? "page" : undefined}
                title={absolute}
                data-absolute-path={absolute}
                onClick={() => props.onOpenFile(absolute)}
              >
                <span className="file-list-title">
                  <span className="file-list-name">{file.base}</span>
                  {file.extension && <span className="file-list-ext">{file.extension}</span>}
                </span>
                {excerpt?.title && <span className="file-list-heading">{excerpt.title}</span>}
                <span className="file-list-parent">
                  {excerpt?.detail ?? file.parent ?? workspaceName}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!files.length && !loading && !props.creating && (
        <div className="sidebar-empty-state">
          <p>{t("File list is empty")}</p>
        </div>
      )}
      {files.length > 0 && !visibleFiles.length && (
        <p className="sidebar-empty">{t("No matching files.")}</p>
      )}
      {partial && <p className="sidebar-list-warning">{t("Some folders could not be read.")}</p>}
    </>
  );
}

function NewFileRow(props: {
  context: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("Untitled.md");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <li className="file-list-row file-list-row-new">
      <form
        className="file-list-new"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          props.onSubmit(trimmed);
        }}
      >
        <input
          ref={input}
          className="file-list-new-input"
          value={name}
          aria-label={t("File name")}
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              props.onCancel();
            }
          }}
        />
        <span className="file-list-parent">{props.context}</span>
      </form>
    </li>
  );
}
