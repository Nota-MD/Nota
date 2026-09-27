/**
 * 自动保存的**定时那一半**（`autosave_seconds`）。
 *
 * # 口径来自界面上写着的那句话
 *
 * 「自动保存」那一行下面写的是「**停止输入后**不会真的写盘」（2026-09-24 的
 * 如实标注），所以到点判据是**停笔 N 秒**，不是"每 N 秒存一次"。这两者在
 * 用户眼里差别很大：后者会在你连着打十分钟的时候往盘上写二十次，
 * 每一次都可能把磁盘唤醒、把云盘同步吵起来。
 *
 * # 它只管"该不该存"，不管"怎么存"
 *
 * 真正写盘走 `useDocuments` 的 `saveDoc`——和 `Ctrl+S` 是**同一条路**
 *（含"存盘前先强制同步一次编辑器"那一步）。这里另写一份写盘逻辑的话，
 * 两条路迟早分叉，而分叉的那条不会有任何东西报错。
 *
 * # 三条不存的规矩（都是有意留的口子，不是漏掉的）
 *
 * 1. **没存过盘的文档不存**：那种文档要写盘得先弹「保存为」，半夜弹一个
 *    文件对话框比不保存更糟。界面那句组说明（`FilesPane` 的「保存 & 恢复」
 *    组标题旁）写的就是这条。
 * 2. **不脏不存**：不然每次到点都摸一遍文件，mtime 白白往前走。
 *    ⚠️ 代价如实记：`dirty` 是**后端**给的、每 300ms 同步一次才刷新，
 *    所以"打完最后一个字立刻切走"那种情况下它可能还停在 `false`——
 *    那一刻不会自动存。此时改动仍在编辑器里、切页时也会同步给后端，
 *    只是**盘上那份还是旧的**。
 * 3. **失败之后不重试到疯**：存盘失败会给提示条（那条**不静音**），
 *    而重试的节奏跟着活动时间戳走——失败也算"刚活动过"，
 *    所以下一次尝试至少在 N 秒之后，不会变成每秒一次的撞墙。
 *
 * # 为什么活动信号是编辑器给的，不是这儿自己轮询
 *
 * `EditorPane` 每次内容变化都报一次 `onActivity`（它就是 `onChange` 那一路，
 * 不额外加监听）。**不许**改成每隔一秒去 `editorRef.getMarkdown()` 比一下——
 * 那是把整篇文档（可能几 MB）每秒复制一遍来找"变没变"。
 */

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { DocId, Document } from "@/bridge/ipc";

export interface 自动保存接线 {
  /** `settings.autosave_seconds`，**0 = 关**（关着时一个定时器都不挂）。 */
  seconds: number;
  /** 打开的文档列表。用来查"当前这份脏不脏、有没有落点"。 */
  docs: readonly Document[];
  /**
   * 活动文档 id，**给 ref 不是给快照**：定时器的回调不随每次渲染重建，
   * 拿快照的话它会一直看着"挂定时器那一刻"的那份文档。
   */
  activeIdRef: RefObject<DocId | null>;
  /** 存盘（`useDocuments` 的 `saveDoc`）。⚠️ 只走这一条路。 */
  saveDoc: (id: DocId) => Promise<unknown>;
}

/** 看表的间隔。1 秒足够（最短的那档是 30 秒），而且这个回调非常便宜。 */
const 看表毫秒 = 1000;

/**
 * 挂上自动保存。返回值是**"记一次活动"**——调用方要把它接到编辑器的内容变化
 * 那一路上去（`EditorPane` 的 `onActivity`）。
 */
export function useAutosave(w: 自动保存接线): () => void {
  /** 最后一次"用户在打字"的时刻。**0 = 这一轮还没动过**（别拿 Date.now() 当初始值）。 */
  const 活动 = useRef(0);
  // ⚠️ 接线走 ref 读，理由同 `EditorPane` 里那几条回调：它是每次渲染新建的对象，
  // 进依赖就等于"每次渲染重建定时器"。
  const 资料 = useRef(w);
  资料.current = w;

  const 记活动 = useCallback(() => {
    活动.current = Date.now();
  }, []);

  useEffect(() => {
    if (!(w.seconds > 0)) return;
    const 停笔毫秒 = w.seconds * 1000;
    const 表 = window.setInterval(() => {
      const 距今 = Date.now() - 活动.current;
      // 还没动过键盘（刚开机、或者刚拨开这一档）——不存。
      if (活动.current === 0 || 距今 < 停笔毫秒) return;

      const id = 资料.current.activeIdRef.current;
      const doc = 资料.current.docs.find((d) => d.id === id);
      if (!doc?.dirty || !doc.path) return;

      // ⚠️ **先记时间再存**：存盘要几十毫秒，不先记的话下一次看表会拿"刚才那次
      // 停笔"再判一遍；存失败时这一句同时也是退避（见文件头第 3 条）。
      活动.current = Date.now();
      void 资料.current.saveDoc(doc.id).catch(() => {
        // 提示条由 `saveDoc` 自己弹（那一条不该静音），这里只吞掉 Promise，
        // 免得变成未处理的拒绝。
      });
    }, 看表毫秒);
    return () => window.clearInterval(表);
  }, [w.seconds]);

  return 记活动;
}
