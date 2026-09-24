/**
 * 标签栏。2026-09-23 从 `App.tsx` 拆出来，理由见 `TopBar.tsx` 文件头。
 *
 * ⚠️ 只画，不管"关之前要不要存盘"——那是 `App.tsx` 的事（`confirmReq` 在它手上）。
 * 也**不持有**任何状态：`docs` / `activeId` 都是 props。
 */

import type { DocId, Document } from "@/bridge/ipc";
import { Icon } from "@/ui/Icon";

// ── 标签栏 ────────────────────────────────────────────────────────────────

export function TabBar(props: {
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
            aria-label="关闭这个标签页"
            onClick={() => props.onClose(d.id)}
          >
            <Icon name="folio-close-symbolic" />
          </button>
        </div>
      ))}
    </div>
  );
}
