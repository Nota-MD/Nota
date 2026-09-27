/**
 * 标签栏。2026-09-23 从 `App.tsx` 拆出来，理由见 `TopBar.tsx` 文件头。
 *
 * ⚠️ 只画，不管"关之前要不要存盘"——那是 `App.tsx` 的事（`confirmReq` 在它手上）。
 * 也**不持有**任何状态：`docs` / `activeId` 都是 props。
 */

import type { DocId, Document } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";

// ── 标签栏 ────────────────────────────────────────────────────────────────

export function TabBar(props: {
  docs: Document[];
  activeId: DocId | null;
  onSelect: (id: DocId) => void;
  onClose: (id: DocId) => void;
  /**
   * 摊着改动预览时把整条锁掉（`inert`：点不动、也聚焦不了）。
   *
   * ⚠️ 锁**由 `App` 决定**（它才知道有没有预览），这里只是把那个属性落到自己
   * 的根节点上。别在这一层判断"该不该锁"——判据散开就会出现"三处里漏一处"，
   * 而那处的症状是"预览开着还能把文档关掉"，看着像别处坏了。
   */
  inert?: boolean;
}) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  return (
    <div className="tabbar" role="tablist" inert={props.inert || undefined}>
      {props.docs.map((d) => (
        <div
          key={d.id}
          role="tab"
          aria-selected={d.id === props.activeId}
          className={`tab ${d.id === props.activeId ? "tab-active" : ""}`}
        >
          <button type="button" className="tab-label" onClick={() => props.onSelect(d.id)}>
            {d.dirty && <span className="tab-dot" title={t("有未保存的改动")} />}
            {d.title}
          </button>
          <button
            type="button"
            className="tab-close"
            title={t("关闭")}
            aria-label={t("关闭这个标签页")}
            onClick={() => props.onClose(d.id)}
          >
            <Icon name="folio-close-symbolic" />
          </button>
        </div>
      ))}
    </div>
  );
}
