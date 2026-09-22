/**
 * 左侧栏：**文件树** / **大纲** 两页。
 *
 * 对标 Typora 的侧栏（它的快捷键是 Ctrl+Shift+1/2/3 切文件树/文档列表/大纲）。
 * "文档列表"（最近打开的文档）排在后面（见 `docs/07`）。
 *
 * ⚠️ **「插件」那一页 2026-09-22 搬到了右边**，见 `ui/PluginDock.tsx`——
 * 这一栏只管**文档导航**，工具面板不跟它挤。
 */

import { useMemo, useState } from "react";

import type { TreeNode } from "@/bridge/ipc";
import { extractOutline } from "@/ui/outline";

type Tab = "tree" | "outline";

interface Props {
  workspace: string | null;
  tree: TreeNode[];
  /** 当前文档正文，用来抽大纲。 */
  docText: string;
  onOpenFile: (path: string) => void;
}

export function Sidebar({ workspace, tree, docText, onOpenFile }: Props) {
  const [tab, setTab] = useState<Tab>("tree");
  const outline = useMemo(() => extractOutline(docText), [docText]);

  return (
    <aside className="sidebar">
      <nav className="sidebar-tabs" role="tablist">
        <TabButton id="tree" current={tab} onSelect={setTab} label="文件" />
        <TabButton id="outline" current={tab} onSelect={setTab} label="大纲" />
      </nav>

      <div className="sidebar-body">
        {tab === "tree" &&
          (workspace ? (
            <FileTree nodes={tree} workspace={workspace} onOpenFile={onOpenFile} />
          ) : (
            <p className="sidebar-empty">
              还没打开文件夹。
              <br />
              打开一个文件夹后这里会列出其中的 Markdown。
            </p>
          ))}

        {tab === "outline" &&
          (outline.length ? (
            <ul className="outline">
              {outline.map((h, i) => (
                <li
                  key={`${h.line}-${i}`}
                  className="outline-item"
                  style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                >
                  {h.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sidebar-empty">这份文档还没有标题。</p>
          ))}
      </div>
    </aside>
  );
}

function TabButton(props: {
  id: Tab;
  current: Tab;
  onSelect: (t: Tab) => void;
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

function FileTree(props: {
  nodes: TreeNode[];
  workspace: string;
  onOpenFile: (path: string) => void;
}) {
  if (!props.nodes.length) {
    return <p className="sidebar-empty">这个文件夹里没有 Markdown 文件。</p>;
  }

  return (
    <ul className="tree">
      {props.nodes.map((n) => (
        <TreeNodeRow key={n.path} node={n} workspace={props.workspace} onOpenFile={props.onOpenFile} />
      ))}
    </ul>
  );
}

function TreeNodeRow(props: {
  node: TreeNode;
  workspace: string;
  onOpenFile: (path: string) => void;
}) {
  const { node, workspace, onOpenFile } = props;

  if (node.is_dir) {
    return (
      <li className="tree-dir">
        <span className="tree-dir-name">{node.name}</span>
        {/* 本轮只列一层；展开时按需再取（见 workspace.rs 的 depth 说明）。 */}
      </li>
    );
  }

  return (
    <li className="tree-file">
      <button
        type="button"
        className="tree-file-btn"
        title={`${workspace}/${node.path}`}
        onClick={() => onOpenFile(`${workspace}/${node.path}`)}
      >
        {node.name}
      </button>
    </li>
  );
}

