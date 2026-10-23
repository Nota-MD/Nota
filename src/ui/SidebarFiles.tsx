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

interface FlatFile {
  name: string;
  /** 去掉最后一段后缀的显示名。扩展名单独淡色显示，与 Typora 的文件列表一致。 */
  base: string;
  /** 含点的末段后缀；没有后缀时为空串。 */
  extension: string;
  path: string;
  parent: string | null;
}

function 取顶层文件(nodes: TreeNode[]): FlatFile[] {
  return nodes
    .filter((node) => !node.is_dir)
    .map((node) => {
      const 斜杠 = node.path.lastIndexOf("/");
      const 点 = node.name.lastIndexOf(".");
      return {
        name: node.name,
        base: 点 > 0 ? node.name.slice(0, 点) : node.name,
        extension: 点 > 0 ? node.name.slice(点) : "",
        path: node.path,
        parent: 斜杠 >= 0 ? node.path.slice(0, 斜杠) : null,
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
  onCancelCreate: () => void;
  onCreateFile: (name: string) => void;
}) {
  const t = useT();
  const [files, setFiles] = useState<FlatFile[]>(() => 取顶层文件(props.nodes));
  const [excerpts, setExcerpts] = useState<Record<string, WorkspaceExcerpt>>({});
  const [loading, setLoading] = useState(false);
  const [partial, setPartial] = useState(false);
  const loadDir = useRef(props.loadDir);
  loadDir.current = props.loadDir;
  const 请求过摘要 = useRef(new Set<string>());

  useEffect(() => {
    setExcerpts({});
    请求过摘要.current.clear();
  }, [props.workspace]);

  useEffect(() => {
    const 待读 = files
      .map((file) => file.path)
      .filter((path) => !请求过摘要.current.has(path));
    if (!待读.length) return;
    let 取消 = false;

    const 读摘要 = async () => {
      for (let i = 0; i < 待读.length; i += 24) {
        const 一批 = 待读.slice(i, i + 24);
        for (const path of 一批) 请求过摘要.current.add(path);
        try {
          const 结果 = await api.workspace.excerpts(一批);
          if (取消) return;
          setExcerpts((prev) => {
            const next = { ...prev };
            for (const item of 结果) next[item.path] = item;
            return next;
          });
        } catch {
          // 摘要只是增强信息；读不到就保留文件名与目录，不打断列表。
        }
      }
    };
    void 读摘要();
    return () => {
      取消 = true;
    };
  }, [files]);

  useEffect(() => {
    let 取消 = false;
    const 首次 = 取顶层文件(props.nodes);
    setFiles(首次);
    setPartial(false);
    if (!props.active) {
      setLoading(false);
      return;
    }

    const 队列 = props.nodes.filter((node) => node.is_dir).map((node) => node.path);
    setLoading(队列.length > 0);
    if (!队列.length) return;

    const 已访问 = new Set<string>();
    const 最多目录 = 512;
    const walk = async () => {
      while (队列.length && 已访问.size < 最多目录) {
        const 一批 = 队列.splice(0, 8).filter((path) => !已访问.has(path));
        for (const dir of 一批) 已访问.add(dir);
        const 结果 = await Promise.all(
          一批.map(async (dir) => {
            try {
              return { children: await loadDir.current(dir), ok: true as const };
            } catch {
              return { children: [] as TreeNode[], ok: false as const };
            }
          }),
        );
        if (取消) return;

        for (const { children, ok } of 结果) {
          if (!ok) setPartial(true);
          const 新文件 = 取顶层文件(children);
          if (新文件.length) {
            setFiles((prev) => {
              const 已有 = new Set(prev.map((file) => file.path));
              return [...prev, ...新文件.filter((file) => !已有.has(file.path))];
            });
          }
          for (const child of children) {
            if (child.is_dir && !已访问.has(child.path)) 队列.push(child.path);
          }
        }
      }
      if (!取消) {
        if (队列.length) setPartial(true);
        setLoading(false);
      }
    };
    void walk();

    return () => {
      取消 = true;
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

  return (
    <>
      <ul className="file-list" aria-busy={loading}>
        {props.creating && (
          <NewFileRow
            context={workspaceName}
            onCancel={props.onCancelCreate}
            onSubmit={props.onCreateFile}
          />
        )}
        {files.map((file) => {
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
        <p className="sidebar-empty">{t("This folder has no Markdown files.")}</p>
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
