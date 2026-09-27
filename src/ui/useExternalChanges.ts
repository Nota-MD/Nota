/**
 * **外部改动**：别的程序动了我们打开着的那份文件。
 *
 * 用户 2026-09-26 点的那一条：「加入对本地其他程序修改后提示支持。有：**忽略**
 *（这里修改完保存依然直接存）、**重新载入**（载入磁盘修改文件）、**查看修改**
 *（用 diff）。**此乃非插件**。」
 *
 * # 一分为二
 *
 * | 哪一半 | 在哪儿 | 干什么 |
 * |---|---|---|
 * | **发现** | 宿主（`src-tauri/src/watch.rs`） | 盯目录、比对、发 `nota:file-changed` |
 * | **三个动作** | 本文件 | 忽略 / 重新载入 / 查看修改 |
 *
 * 后两个都要动编辑器，而编辑器在前端（`docs/03` 那条"真相在前端"），所以
 * 动作这一半只能在这儿。宿主那边**一个字节都不碰文件**。
 *
 * # ⚠️ 「忽略」为什么在这里是**零动作**
 *
 * 它的完整实现在宿主：`watch.rs` 在**发事件之前**就把手里那个"上次知道的磁盘
 * 内容"挪成了新摘要。用户点忽略 = 前端把这条提示从列表里划掉，此后宿主也不会
 * 为同一次改动再报（摘要已经一样了）。下次保存直接覆盖磁盘上那份——那正是
 * 用户说的"这里修改完保存依然直接存"。
 *
 * ⚠️ **前端因此不必记"这个 hash 我忽略过了"**。真要记一份，就是两个账本，
 * 而它们一旦不同步，症状是"外部改动的提示再也不出现"——安安静静地不工作，
 * 没有人会把它报成 bug。
 *
 * # 清单是**整份推**给宿主的
 *
 * 见 `api.watch.sync` 那条注释。触发点只有一个：文档列表（或它们的路径）变了。
 *
 * # 为什么不是一排 toast
 *
 * 提示条是**状态**（"这份文件在磁盘上被改了，你还没处理"），不是"一次操作的
 * 结果"。toast 会自己消失（`ui/useToasts.ts`），而这条一旦消失，用户就再也不能
 * 处理它了——下一个能处理它的时刻是"他自己想起来去按 Ctrl+S"，而那时磁盘上
 * 那份已经被覆盖掉了。所以它是一块**常驻**的条，处理完才走。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  api,
  events,
  on,
  type DiffLine,
  type DocId,
  type Document,
  type FileChangedPayload,
} from "@/bridge/ipc";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Toast } from "@/ui/Toasts";


/** 一份待处理的改动。 */
export interface 外部改动 {
  id: DocId;
  /** 磁盘上那份的路径（事件发出来那一刻的）。 */
  path: string;
  /** 磁盘上那份此刻的摘要。 */
  hash: string;
  /** 标签页上那个名字。提示条上要写它。 */
  title: string;
}

/** 「查看修改」摊在编辑区里的那一份对照。 */
export interface 外部对照 {
  id: DocId;
  title: string;
  /** 统一格式的逐行差异（`api.diff.texts`）。空数组 = 两边其实一样。 */
  行: DiffLine[];
}

interface 接线 {
  /** 打开的文档列表（`App.tsx` 的 `docs`）。 */
  docs: readonly Document[];
  /** 活动文档 id 的 ref 快照（判"这份正显示在编辑器里吗"）。 */
  activeIdRef: { current: DocId | null };
  editorRef: { current: EditorPaneHandle | null };
  /** 从磁盘重新载入（`useDocuments` 那个，带未保存确认）。 */
  reloadDoc: (id: DocId) => Promise<void>;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface 外部改动出口 {
  /** 有待处理外部改动的文档。**可能不止一份**（几份文件都被改了）。 */
  改动: 外部改动[];
  /** 用户点了「忽略」。**零动作**，只把这条从列表里划掉（见文件头）。 */
  忽略: (id: DocId) => void;
  /** 用户点了「重新载入」。走既有的 `reloadDoc`（它自己会问未保存那句）。 */
  重新载入: (id: DocId) => Promise<void>;
  /** 用户点了「查看修改」。失败会弹提示条，返回 `null`。 */
  查看修改: (id: DocId) => Promise<外部对照 | null>;
  /** 此刻摊着的对照（`null` = 没摊）。 */
  对照: 外部对照 | null;
  /** 收起对照，回到正文。 */
  关对照: () => void;
}

export function useExternalChanges(w: 接线): 外部改动出口 {
  // ⚠️ 本文件**不翻文案**（这里一句界面文字都没有）：提示条那块自己 `useT`
  // （它是组件），三个动作的名字也在那儿。这里只报事实。
  const { docs, activeIdRef, editorRef, reloadDoc, toast } = w;

  const [改动, set改动] = useState<外部改动[]>([]);
  const [对照, set对照] = useState<外部对照 | null>(null);

  /**
   * 文档列表的 ref 快照。**事件回调里要读它，但不能进订阅的依赖**——
   * 进了的话每次刷新文档列表都要退订再订一次，中间那一刻的事件是丢的
   *（`App.tsx` 里 `activeIdRef` 是同一条理由、同一个写法）。
   */
  const docsRef = useRef(docs);
  docsRef.current = docs;

  // ── 清单同步 ─────────────────────────────────────────────────────────────
  //
  // ⚠️ 依赖是一个**拼出来的字符串**（id + 路径），不是 `docs` 数组本身：
  // `refreshDocs()` 每次都给一个新数组，直接依赖它会让这里每刷新一次就调一遍
  // `nota_watch_sync`（宿主那边是整份重来，虽然不贵，但没必要）。
  // 拼串之后只有**真的变了**（开了/关了/另存为）才会重来。
  const 路径键 = useMemo(
    () => docs.map((d) => `${d.id}:${d.path ?? ""}`).join("|"),
    [docs],
  );

  useEffect(() => {
    const 表 = docs
      .filter((d): d is Document & { path: string } => !!d.path)
      .map((d) => ({ id: d.id, path: d.path }));
    // ⚠️ 失败只记一笔、不弹提示条：盯不上就是"外部改动不报"，用户此刻并没有
    // 在做一件"失败了要重试"的事（他只是打开了几个文件）。宿主那边对
    // "哪个目录盯不上"有一行调试日志（`NOTA_DEBUG=1` 可见）。
    void api.watch.sync(表).catch((e) => {
      console.warn("[nota] 同步外部改动监视清单失败：", e);
    });
  }, [路径键]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 收到事件 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let 退订: (() => void) | null = null;
    let 还活着 = true;

    void on<FileChangedPayload>(events.fileChanged, ({ id, path, hash }) => {
      // ⚠️ 同一份文档连着报两次（用户点了忽略之后别人又改了一次）是**两件事**，
      // 但列表里只需要一条：按 id 换掉旧的，不要堆成两条一模一样的提示。
      set改动((旧) => {
        const 那一条 = 旧.find((c) => c.id === id);
        // 摘要一样 = 还是同一次改动（重复事件），原地不动，免得白白重画。
        if (那一条?.hash === hash) return 旧;
        const 文档 = docsRef.current.find((d) => d.id === id);
        const 新条: 外部改动 = {
          id,
          path,
          hash,
          // ⚠️ 文档已经关了（事件和我们删列表之间有窗口）也要画出来：
          // 退到路径最后那一段，而不是整条不显示——"有个文件被改了"
          // 是用户此刻唯一能拿到的信息，藏掉它比名字难看严重得多。
          title: 文档?.title ?? path.split("/").pop() ?? path,
        };
        return 那一条 ? 旧.map((c) => (c.id === id ? 新条 : c)) : [...旧, 新条];
      });
    }).then((u) => {
      if (还活着) 退订 = u;
      else u(); // 订阅回来时组件已经没了——当场退掉，别留监听者
    });

    return () => {
      还活着 = false;
      退订?.();
    };
  }, []);

  // ── 三个动作 ─────────────────────────────────────────────────────────────

  const 忽略 = useCallback((id: DocId) => {
    set改动((旧) => 旧.filter((c) => c.id !== id));
  }, []);

  const 重新载入 = useCallback(
    async (id: DocId) => {
      // ⚠️ **重载成功之后才把这条划掉**。`reloadDoc` 里那道围栏——"有未保存的
      // 改动"的确认框——用户可能在那儿选「取消」；划早了的话，取消之后提示条
      // 已经没了，而磁盘上那份**确实还改着**，用户就再没有处理它的入口了。
      await reloadDoc(id);
      set改动((旧) => 旧.filter((c) => c.id !== id));
      // ⚠️ 正看着的那份被重载了 → 对照里的"编辑器那一侧"已经变了，
      // 那份 diff 成了过期的东西。收掉它，别让用户对着一份不算数的对照看。
      set对照((旧) => (旧?.id === id ? null : 旧));
    },
    [reloadDoc],
  );

  const 查看修改 = useCallback(
    async (id: DocId): Promise<外部对照 | null> => {
      try {
        // 左边（old）= **我们手里这份**，右边（new）= 磁盘上那份。
        // 于是"绿的那些行"就是**别人加进来的**——那正是用户要看的东西。
        //
        // ⚠️ 编辑器里那份要从**活着的实例**读（`getMarkdown()`），不是从
        // `doc.text`：后者被 300ms 去抖拖着，用户刚敲的字不在里面。而不在
        // 编辑器里的那几份（改的不是当前标签）只有镜像可读——那时也没有
        // "还没推上去的击键"这回事，两者等价。
        const 手头 =
          id === activeIdRef.current
            ? editorRef.current?.getMarkdown()
            : undefined;
        const 我们的 = 手头 ?? docsRef.current.find((d) => d.id === id)?.text ?? "";
        const 磁盘 = await api.doc.diskText(id);
        const 行 = await api.diff.texts(我们的, 磁盘);
        const 标题 = docsRef.current.find((d) => d.id === id)?.title ?? "";
        const 一份: 外部对照 = { id, title: 标题, 行 };
        set对照(一份);
        return 一份;
      } catch (e) {
        toast(String(e), "error");
        return null;
      }
    },
    [activeIdRef, editorRef, toast],
  );

  const 关对照 = useCallback(() => set对照(null), []);

  return { 改动, 忽略, 重新载入, 查看修改, 对照, 关对照 };
}
