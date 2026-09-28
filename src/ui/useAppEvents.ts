/**
 * 应用级的两条 effect：**宿主推来的事件** ＋ **活动文档变了要告诉后端**。
 *
 * 从 `App.tsx` 搬出来的（2026-09-26，本文件当时 1049 行、硬上限 1000）。
 * 判据是老规矩（见 `App.tsx` 文件头）：这块东西自己有一份完整的理由可写。
 * 搬的时候一行逻辑没改。
 *
 * # 为什么不并进 `ui/usePlugins.ts`
 *
 * 那一个管的是**插件自己的三样**（已装清单 / 面板 / 菜单项）与"跑一条插件命令"，
 * 全部是**拉**（`api.plugin.*`）。这里两条是**推**：一条订宿主发来的事件、
 * 一条把当前文档告诉宿主。方向不一样，混在一起之后"谁在什么时候跑"就说不清了。
 *
 * # 两条 effect 各自的坑
 *
 * 1. **订阅只订一次**。依赖里那两个回调都是空依赖的 `useCallback`（约定，
 *    不是观察——见 `useStartup.ts` 文件头最后一段）。⚠️ `activeIdRef` 那个 ref
 *    也在这条理由上：把"当前是哪份"写进依赖数组，每次切标签都会**退订再订
 *    一遍**，中间那一刻的事件是丢的。
 * 2. **活动文档那条不是可选的**。后端只记得"最后一次新建/打开的那份"，
 *    不同步的话，用户点了标签 A 在看 A，插件调 `nota.document.get_text()`
 *    拿到的却是 B——AI 助手插件按这个路径写回就会**改错文档**（BUG-6）。
 *    放在 effect 里而不是只补在 `onSelect` 上，是为了把 `open` / `new` /
 *    `close` 那几条路径也一起兜住（多喊一次无害）。
 */

import { useEffect, type RefObject } from "react";

import {
  api,
  on,
  events,
  type DocId,
  type DocumentChangedPayload,
  type NotifyPayload,
  type SecondInstancePayload,
} from "@/bridge/ipc";
// ⚠️ 用**模块级**的 `t` 而不是 `useT()`：这一条订阅只订一次（文件头第 1 条），
// 用一个"会随语言变而换身份"的 `t` 会逼着把语言写进依赖数组。模块级的 `t`
// 每次调用现读当前语言，正合适。
import { t } from "@/i18n";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Toast } from "@/ui/Toasts";

export interface 事件接线 {
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
  refreshDocs: () => Promise<unknown>;
  /**
   * 打开一份文档。⚠️ **只喂给第三条 effect**（"用户又启动了一次 Nota"）——
   * 那一条要把第二次启动带过来的路径交给它（与命令行文件走的是同一条路）。
   */
  openPath: (path: string) => Promise<unknown>;
  /** 当前活动文档。⚠️ 只喂给下面第二条 effect。 */
  activeId: DocId | null;
  /** 同一个值的 ref。⚠️ 给第一条用——它**不能被重建**，理由见文件头第 1 条。 */
  activeIdRef: RefObject<DocId | null>;
  /** 编辑器的句柄。插件改了当前这份文档时要整篇换掉。 */
  editorRef: RefObject<EditorPaneHandle | null>;
}

export function useAppEvents(w: 事件接线): void {
  const { toast, refreshDocs, openPath, activeId, activeIdRef, editorRef } = w;

  // ── 宿主推来的事件 ────────────────────────────────────────────────────
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let alive = true;

    (async () => {
      const subs = await Promise.all([
        on<NotifyPayload>(events.notify, (p) => toast(p.message, p.level)),

        // 插件**或 MCP 客户端**改了文档 → 让编辑器整篇换掉。
        // ⚠️ 这里**不去比 revision**，直接覆盖：能走到这条分支就说明
        // 改动不是本编辑器发起的（自己发起的不会绕一圈回来）。
        //
        // ⚠️ `"mcp"` 是 2026-09-27 加的（MCP 那一格）：AI 客户端通过
        // `nota_write` 改文档，走的是与插件**同一个**事件、同一段载荷，
        // 差别只有 `origin` 这个字。所以这里放行两种来源，而不是另开一条事件——
        // 另开一条就要在这一段旁边再抄一遍"改的不是当前这份该怎么办"。
        on<DocumentChangedPayload>(events.documentChanged, (p) => {
          if (p.origin !== "plugin" && p.origin !== "mcp") return;

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

        // **用户又启动了一次 Nota**（2026-09-27 加，单实例那一格）。
        //
        // ⚠️ 窗口**已经被宿主抬起来了**（`single_instance.rs::起` 里先
        // `unminimize` 再 `set_focus` 才 emit 的），所以这一条只回答一件事：
        // "那一次启动带了个文件吗"。⚠️ **没带就什么都不做**，连提示条都不弹——
        // 那是最常见的一帧（用户只是又点了一次图标，要的就是把窗口找回来）。
        //
        // ⚠️ 用 `catch` 兜住、并**在提示条里说明是"第二次启动"**：`openPath`
        // 失败时自己会弹一条（"打不开 xxx"），但那句话没有上下文——用户刚点完
        // 图标，看到"打不开"会以为是这一次点击坏了。多一句来源，他能对上号。
        on<SecondInstancePayload>(events.secondInstance, (p) => {
          if (p.error) {
            toast(t("The path from the second Nota launch is unusable: {0}", p.error), "error");
            return;
          }
          if (!p.path) return; // 只是把窗口抬起来
          void openPath(p.path);
        }),

        // ⚠️ 这里原来还订阅着 `nota:slidev-stopped`（后端报"预览窗被叉了"）。
        // 2026-09-25 去掉了两回：先是预览搬进右侧插件栏（那个窗口只是一个视图，
        // 叉掉它不再结束会话），再是 Slidev 整个变成插件——现在插件和前端之间
        // 走的是**通用**的那两条（`plugin:*` 事件 + `nota_plugin_call`）。
        // 订阅一条永远不会来的消息，是"看不出来坏了"的那种坏——直接删掉。
      ]);

      if (alive) unlisteners.push(...subs);
      else subs.forEach((u) => u());
    })();

    return () => {
      alive = false;
      unlisteners.forEach((u) => u());
    };
    // `refreshDocs` / `toast` / `openPath` 都是空依赖的 useCallback，这个 effect
    // 只跑一次（同一条约定的完整说明在 `ui/useStartup.ts` 文件头最后一段）。
  }, [toast, refreshDocs, openPath, activeIdRef, editorRef]);

  // ── 活动文档变了就告诉后端 ────────────────────────────────────────────
  useEffect(() => {
    activeIdRef.current = activeId;
    if (activeId === null) return;
    void api.doc.setActive(activeId).catch((e) => {
      toast(t("Could not switch the active document: {0}", String(e)), "error");
    });
  }, [activeId, toast, activeIdRef]);
}
