/**
 * **选区快照 → 后端镜像**（`docs/07` 第 14 项，2026-10-04 加；2026-10-07 从
 * `ui/EditorPane.tsx` 拆成本文件，同一天那次拆分见 `docs/07` 第 89 项）。
 *
 * 一句话职责：编辑器每报来一份选区，**压一道 250ms 的时间窗**再推给后端。
 * 推的是 `api.doc.cursor(doc.id, 快照)`，给插件看的（`nota.document.cursor`）。
 *
 * # ⚠️ 编辑器那一侧已经去过一次重了，为什么这里还要再压一道
 *
 * 两边管的**不是同一件事**：
 *
 * - 编辑器那一侧的键是**"快照变没变"**（所见即所得在 `caret-snapshot.ts` 的
 *   插件里、源码在 `source.ts` 的 `updateListener` 里）；
 * - 这里的键是**"多久没推过了"**。
 *
 * 只挪光标、不改字的情形**不会**触发 `sync`（那条路的键是内容），所以"光标停
 * 在哪儿"完全靠这一条——没有它，插件读到的选区会一直停在上一次敲键盘之前。
 *
 * # ⚠️ 250ms 是"比 `sync` 短、比预览长"
 *
 * 它跨 IPC（所以要防抖），但它只是给插件看的一条旁路（所以拖久了没意义）。
 * 1 秒 4 次上下是个不过分的节奏；和 `SYNC_DEBOUNCE_MS`(300) /
 * `PREVIEW_DEBOUNCE_MS`(150) 都是各算各的。
 *
 * # ⚠️ 定时器为什么与 `sync` 那条**分开**
 *
 * 两条路的节奏与内容都不一样（一条推正文、一条推光标），合用一个会让"改一个
 * 字"把"刚挪了光标"那次推送吞掉（或反过来）——症状是插件读到一份根本没发生
 * 过的选区。
 *
 * # ⚠️ 推失败**只吞掉**，不弹提示条
 *
 * 不像 `sync` 那条要弹一条"同步失败"：这只是一条给插件看的旁路，推失败
 * （编辑器刚拆、文档刚关）的后果是"插件读到上一次的选区"，而那在下一笔事务
 * 时自愈。为它弹一条提示是拿噪声换噪声——真正该修的东西会被这条噪声盖住。
 *
 * # ⚠️ 为什么把"清定时器"也交出去，而不是这个 hook 自己收拾
 *
 * 挂载那个大 effect 一拆（换文档、切模式、拨了要重建的设置），**这个定时器
 * 必须当场清掉**：不清的话，那一笔会打在**已经换掉的那份文档**的 id 上——
 * 改的是另一份文档的选区快照，从界面上完全看不出来坏在哪儿。
 *
 * 而"什么时候拆"只有 `EditorPane` 那个 effect 知道，hook 自己无从得知（它没有
 * 可依赖的东西：`doc.id` 在换文档时确实会变，但**切模式**不会，而那一次也要
 * 清）。所以这里把 [`选区快照接线.清快照定时`] 交出去，由那一侧在清理函数里调。
 *
 * ⚠️ **只清定时器，不补推**：编辑器马上就没了，补推出去的是一份"拆之前的
 * 选区"，对插件没有意义（它下次收到的是新文档的第一份）。
 */

import { useRef } from "react";

import { api, type DocId } from "@/bridge/ipc";
import type { SelectionSnapshot } from "@/editor/caret-snapshot";

/**
 * 把**选区快照**推给后端的去抖（跨 IPC，所以比本地那条慢）。
 *
 * ⚠️ 与 `EditorPane` 里 `SYNC_DEBOUNCE_MS`(300) / `PREVIEW_DEBOUNCE_MS`(150)
 * 并列的第三档，见文件头。
 */
const CURSOR_DEBOUNCE_MS = 250;

/** [`use选区快照`] 交出去的两件事。 */
export interface SelectionSnapshotWiring {
  /** 编辑器报来一份选区时调它（两种模式都接在 `onSelection` 上）。 */
  recordSnapshot: (snapshot: SelectionSnapshot) => void;
  /** 拆编辑器时调它。⚠️ 为什么必须调，见文件头最后一段。 */
  clearSnapshotFixedTime: () => void;
}

/**
 * @param 文档id 这一份文档的 id。⚠️ 它是**调用那一刻**读的（`记快照` 闭包里
 *               那一份），所以定时器一定打在"报来这份快照的那份文档"上。
 */
export function useSelectionSnapshot(documentId: DocId): SelectionSnapshotWiring {
  /**
   * 选区快照那条去抖的定时器。
   *
   * ⚠️ **与 `sync` 那条分开**：理由见文件头。
   */
  const snapshotFixedTimeRef = useRef<number | null>(null);

  const clearSnapshotFixedTime = () => {
    if (snapshotFixedTimeRef.current !== null) {
      window.clearTimeout(snapshotFixedTimeRef.current);
      snapshotFixedTimeRef.current = null;
    }
  };

  const recordSnapshot = (snapshot: SelectionSnapshot) => {
    // 先把上一笔按掉：连续打字时每一下都重新起算 250ms，推出去的是"停手那一刻"
    // 的选区（而不是中间某一份）。
    if (snapshotFixedTimeRef.current !== null) window.clearTimeout(snapshotFixedTimeRef.current);
    snapshotFixedTimeRef.current = window.setTimeout(() => {
      snapshotFixedTimeRef.current = null;
      // ⚠️ `catch` 里是空的，理由见文件头（推失败只吞掉，不弹提示条）。
      void api.doc.cursor(documentId, snapshot).catch(() => {});
    }, CURSOR_DEBOUNCE_MS);
  };

  return { recordSnapshot, clearSnapshotFixedTime };
}
