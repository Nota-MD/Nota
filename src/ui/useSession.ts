/**
 * **会话侧车的前端那一半**：最近打开过哪些文件、上次开着哪几个标签、
 * 每份文档滚到了哪儿。
 *
 * # 它管五件事，但**只有一份文件**
 *
 * 「打开最近的文件」「恢复上次会话」「最近文件列表」「打开时恢复滚动位置」
 * 这四格（`docs/10` §2 / §5）在界面上的落点各不相同（文件菜单里的子菜单、
 * 左侧栏那一页、主页那一屏、编辑器滚到哪），但**存的是同一份东西**：
 * 谁最近被打开过、上次开着谁。四者的生命周期完全一致（都是"用户上次退出时
 * 的样子"），写入时刻也一致（都在切换 / 打开 / 滚动的那一刻）。拆成四个文件
 * 就要四次落盘、四份互相错位的真相。合成一份的账在宿主那边写着
 * （`src-tauri/src/session.rs` 文件头）。
 *
 * ⚠️ **第五件是 2026-09-27 进来的**：**上次那个文件夹**（工作区根），
 * 为的是设置里「启动时」的第三档。它落的还是这份侧车、读的还是
 * [`接上会话`]——判据和上面四条一样："用户上次退出时的样子"。
 * 它比另外四条多一层：**写盘那一头不在这个文件里**，在宿主的
 * `nota_workspace_open` / `nota_workspace_close` 上（工作区变的那一刻只有它们
 * 知道）。这里只负责**读回来并接上**。
 *
 * # ⚠️ 三条会写坏东西的围栏
 *
 * 1. **首帧不许写**（`就绪`）。启动那一枪里，前端会先带着**空文档列表**渲染
 *    一帧——那时要是把 `open = []` 写下去，宿主侧车里"上次开着哪几个标签"
 *    就被抹了，紧接着的恢复读到的是一份空白。所以 `就绪` 是 `false` 的时候
 *    一个字节都不落盘，它由 [`接上会话`] 在**读完（并恢复完）之后**翻开。
 * 2. **去抖**（`落盘延迟`）。落盘是**整体重写**那份 TOML：切标签、开文件、
 *    关文件各写一次是没必要的，而滚动更是每帧都在变（见 `滚动落盘延迟`）。
 * 3. **打开失败要从列表里摘掉**（见 [`打开最近`]）。宿主读的时候已经滤过一遍
 *    不存在的路径，但"滤过"和"点得动"之间还隔着一段时间——那段时间里文件
 *    被删/改名的，点一次只会得到同一条错，然后它会**永远赖在列表里**。
 *
 * # ⚠️ 一句话：这份侧车不是文档
 *
 * 删掉 `~/.local/share/nota/session.toml` 的后果只是"下次启动不恢复标签、
 * 最近列表空掉、滚动回顶上"。**正文一个字节都不受影响**——这句是给用户的
 * 承诺，也是这个 hook 的**失败口径**：上面每一处写盘都只记一行 `console.warn`，
 * 绝不弹错、绝不挡路。记不住"上次看到哪儿"是件小事。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { api, type DocId, type Document, type StartupAction } from "@/bridge/ipc";
import type { Toast } from "@/ui/Toasts";

/**
 * "现在开着哪几份、前台是哪一份"的去抖时间。
 *
 * ⚠️ 与 `doc.sync` 那条 300ms 去抖**不是同一件事**（那条保的是正文不丢），
 * 所以值也不必相同：这里保的只是"下次启动回到哪儿"，多写几次的代价是白写盘。
 */
const dropDiskDelayDelay = 400;

/**
 * 滚动位置的去抖时间。
 *
 * ⚠️ 比上面那条**更长**，因为来源完全不同：切标签是"用户点了一下"（几秒一次），
 * 而滚动是**每帧都在发生**的（一次滚轮能出几十条事件）。它同时管着两件事——
 * 写盘，以及**本组件的一次 `setState`**（下面 `记滚动` 里那段）。
 */
const rollActionDropDiskDelayDelay = 500;

export interface MeetingSpeechWiring {
  /** 打开的文档列表。**只读它这一段快照**，用来算"现在开着哪几份"。 */
  docs: readonly Document[];
  /** 活动文档 id。`null` = 一份都没有。 */
  activeId: DocId | null;
  /**
   * 打开一份文档。**返回值是"开上了没有"**（`ui/useDocuments.ts` 的 `openPath`
   * 从 2026-09-27 起给布尔值），失败时它自己已经弹过提示条了。
   */
  openPath: (path: string) => Promise<boolean>;
  /**
   * 新建一份空白文档（`ui/useDocuments.ts::newDoc`）。只被 [`接上会话`]
   * 的**第一档**用一次，见那边——`new-file` 那一档要的是"落到一张白纸上"，
   * 而不是主页那一屏。
   *
   * ⚠️ **必须是 `useCallback` 包稳的那个**：它是 [`接上会话`] 的依赖，
   * 身份一抖，`ui/useStartup.ts` 里那条只该跑一次的 effect 就会重跑
   *（那份文件头最后一段讲的就是这条约定）。
   */
  newDocument: () => Promise<void>;
  /** 宿主里已有文档时接回它们；热重载和重复启动路径用它避免追加空白标签。 */
  connectAboveCurrentHas: () => Promise<boolean>;
  /**
   * 设工作区（左侧栏那棵树）。只被 [`接上会话`] 的第三档用一次，见那边。
   *
   * ⚠️ 宿主那两条真正的入口是 `nota_workspace_open` / `close`，走的是
   * `ui/useDocuments.ts::openFolder`（用户点"打开文件夹"、拖一个目录进来）。
   * 这里这个 `setWorkspace` 只是**把宿主已经设好的那个值搬进界面**——
   * 它不碰宿主、也不碰会话侧车（侧车那一笔是 `nota_workspace_open` 顺手记的）。
   */
  setWorkspace: (w: string | null) => void;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface MeetingSpeechOutputMouth {
  /**
   * 最近打开过的文件（**新的在前**）。菜单子菜单、主页、侧栏那三处都用它。
   *
   * ⚠️ 是 `readonly string[]` 而不是可变数组：它进 `useCommandTable` 的输入，
   * 那张表的身份决定原生菜单要不要重推一遍（见那个文件的文件头第二条）。
   */
  recent: readonly string[];
  /**
   * 启动时接上会话：读侧车，按设置里的启动档把上次的样子接回来。
   *
   * ⚠️ 默认 `new-file` 会先建一张白纸，再读“最近文件 / 滚动位置”侧车；
   * 编辑器首帧不等侧车。
   *
   * 两个入参：
   * - `启动文件`：命令行带来的那个文件。非空时**一个标签都不开**（理由见
   *   `ui/useStartup.ts` 里那个入参的注释），但「最近」那三格照样读；
   * - `启动档`：设置里 `files.startup` 那一档，决定恢复多少。**它是入参、
   *   不是闭包捕获的值**——这个回调的身份一抖，`useStartup` 那条只该跑一次
   *   的 effect 就会重跑（见那边文件头最后一段）。
   */
  connectAboveMeetingSpeech: (startActionTextItem: string | null, startActionLevel: StartupAction) => Promise<void>;
  /** 某份文档此刻该回到哪个比例。`undefined` = 没记过（那就不动它）。 */
  rollActionPosition: (path: string | null | undefined) => number | undefined;
  /** 报一次"这份文档滚到这儿了"。**调用方不用去抖**，本 hook 自己收。 */
  recordRollAction: (path: string, compareExample: number) => void;
  /** 打开一条最近记录。⚠️ 打不开时**顺手把它忘掉**（见文件头第 3 条）。 */
  openRecent: (path: string) => Promise<void>;
  /** 忘掉一条最近记录（列表里那一颗 ×）。 */
  forgetRemoveRecent: (path: string) => Promise<void>;
  /** 清空整份会话（设置页「清除记录」）。**不删任何文件。** */
  clearEmptyRecent: () => Promise<void>;
}

export function useSession(w: MeetingSpeechWiring): MeetingSpeechOutputMouth {
  // ⚠️ 这里**不订阅语言**（没有 `useT()`）：本 hook 一个字的文案都不产出
  // ——"打不开"那条提示是 `openPath` 弹的，路径名不进翻译表（它不是键）。
  // 订阅了反而会让整份会话在切语言时重建一遍。
  const { docs, activeId, openPath, newDocument, connectAboveCurrentHas, setWorkspace, toast } = w;

  const [recent, setRecent] = useState<readonly string[]>([]);
  /**
   * 每份文档的滚动位置（**比例**，不是像素——判据在 `editor/scroll-into-view.ts`）。
   *
   * ⚠️ 它是 `useState` 而不是 `useRef`，理由只有一个：`App.tsx` 要把它当作
   * `EditorPane` 的 `初始滚动` 传下去，而那是一个**渲染期读的值**（编辑器实例
   * 建出来那一刻读一次）。放 ref 里就得在渲染期读 ref——那是 React 明说别做的
   * 事（并发渲染下读到的可能是别的树的值）。代价是每次刷新都会重画一次 `App`；
   * 而写入被去抖到 500ms 一次，这个代价是可接受的。
   */
  const [rollAction, setRollAction] = useState<Record<string, number>>({});

  /**
   * 可以落盘了吗。见文件头第 1 条——**它是这个 hook 里最要紧的一个变量**。
   */
  const thenThread = useRef(false);
  /** 攒着还没写的滚动位置（路径 → 比例）。 */
  const pendingWrite = useRef(new Map<string, number>());
  const rollActionCountTime = useRef<number | null>(null);

  /** 现在开着哪几份（按标签顺序），以及前台是哪一份。 */
  const isOpen = useCallback((): [string[], string | null] => {
    const path = docs.map((d) => d.path).filter((p): p is string => !!p);
    const beforePlatform = docs.find((d) => d.id === activeId)?.path ?? null;
    return [path, beforePlatform];
  }, [docs, activeId]);

  const connectAboveMeetingSpeech = useCallback(
    async (startActionTextItem: string | null, startActionLevel: StartupAction) => {
      let alreadyAccuratePrepareDocument = false;
      try {
        // 默认启动档先落一张白纸，再读“最近文件 / 滚动位置”那本侧车。
        // 侧车只影响菜单和恢复信息，不该挡住编辑器首帧；`newDoc()` 自己会刷新
        // 文档列表并激活新标签，因此不需要启动链先整表回拉一次。
        if (!startActionTextItem && startActionLevel === "new-file") {
          alreadyAccuratePrepareDocument = await connectAboveCurrentHas();
          if (!alreadyAccuratePrepareDocument) {
            await newDocument();
            alreadyAccuratePrepareDocument = true;
          }
        }

        const MeetingSpeech = await api.session.get();
        setRecent(MeetingSpeech.recent);
        setRollAction(MeetingSpeech.scroll);

        // ── 工作区（只有第三档）────────────────────────────────────────────
        //
        // ⚠️ **走 `nota_workspace_open` 而不是直接 `setWorkspace`**：宿主那一侧
        // 才是围栏的真相（`nota.fs` / `nota.git` 能用哪些路径由它决定）。
        // 只设界面这一半的话，左侧栏树长得出来、插件却读写不了——那种"看着能用
        // 其实不能用"的错最难查。它顺带会把路径再规范化一遍，返回值才是该显示的。
        //
        // ⚠️ **不跟着 `启动文件` 一起跳过**：命令行给了一个文件，说明用户是指名
        // 要开那一份，所以标签一个都不开；但文件夹是**另一件事**——开文件夹
        // 不会碰任何文档（`nota_workspace_close` 的注释：只清围栏，不关文档）。
        // 第三档要的就是"连那棵树也接上"。
        //
        // ⚠️ **失败只记一笔**（口径见文件头"失败口径"）：那个文件夹可能已经被
        // 删了/挪了。用户什么都没点，不该在启动时先挨一条错提示。
        if (startActionLevel === "last-session" && MeetingSpeech.workspace) {
          // 工作区只影响侧栏与插件围栏，不参与编辑器首帧。放到后台接上，
          // 避免空会话时“先开目录、再建白纸”把可输入时间拖到两秒以上。
          void api.workspace
            .open(MeetingSpeech.workspace)
            .then(setWorkspace)
            .catch((e) => {
              console.warn("[nota] 上次那个文件夹打不开了，这次不恢复它：", e);
            });
        }

        // ── 标签（第二、三档）──────────────────────────────────────────────
        //
        // ⚠️ `new-file` 那一档**从这里就返回**，但它**不是**"什么都不干"：
        // 上面那两行 `set最近` / `set滚动` 照做——「最近打开」是**另一个设置项**
        // （`files.remember_recent`）管的功能，不该被"启动时开哪一档"连坐。
        // 少了它的话，选第一档的用户会发现菜单里那个「最近文件」永远是空的。
        if (!startActionTextItem && startActionLevel !== "new-file") {
          // ⚠️ **前台那一份留到最后开**：`openPath` 会把活动标签切到刚打开的
          // 那一份（`nota_doc_open` 就是这么定的），所以"最后开的那个"自然
          // 成了前台——不必再写一条"切到某个路径"的路。
          const itsRemaining = MeetingSpeech.open.filter((p) => p !== MeetingSpeech.active);
          for (const p of itsRemaining) {
            if (await openPath(p)) alreadyAccuratePrepareDocument = true;
          }
          if (MeetingSpeech.active && (await openPath(MeetingSpeech.active))) alreadyAccuratePrepareDocument = true;
          // ⚠️ 再读一次：上面每开一份，宿主的 `nota_doc_open` 都会把它推到
          // 「最近」的最前面（`commands/document.rs` 里那条钩子），所以列表
          // **顺序已经变了**。不重读的话，菜单里那份顺序要等到下一次打开
          // 文件才对得上。
          if (MeetingSpeech.open.length) setRecent((await api.session.get()).recent);
        }

        // ── 没有可恢复文档时，仍落到一张白纸上 ────────────────────────────
        //
        // ⚠️ **「不恢复」不等于「什么都不开」**。用户点名的三档原话是
        // 「第一个打开后自动新建」——要的是**一份能直接打字的空白文档**，
        // 不是主页那一屏。⚠️ 这一条 2026-09-27 补：在那之前第一档真的
        // 什么都不开，界面上是主页（用户得再点一下「新建」），
        // 而 `settings/files.rs` 与同目录的 `useStartup.ts` 两处文件头
        // **都写着"开一份空白文档"**——代码与它自己的说明对不上。
        //
        // ⚠️ 主页**不能因此删掉**：它仍然是"一份文档都没有"时的画法
        //（用户把标签一个个关掉之后就是那样），只是启动不再落在它上面。
        //
        // ⚠️ **恢复档里 `open = []` 也要建白纸**：否则没有 `EditorPane`，
        // 主窗口只能等 `useBootReveal` 的五秒故障兜底才出现——这正是 6 秒
        // 冷启动的来源。恢复文件失败时同样落到这张白纸上。
        if (!startActionTextItem && !alreadyAccuratePrepareDocument && !(await connectAboveCurrentHas())) await newDocument();
      } catch (e) {
        // ⚠️ 读不出来就照"第一次启动"办，**绝不弹错**：这份侧车坏了只该让
        // 标签不恢复，不该在启动时先给用户一条看不懂的错。
        console.warn("[nota] 读会话失败：", e);
        if (!startActionTextItem && !alreadyAccuratePrepareDocument) {
          const connectAboveDone = await connectAboveCurrentHas().catch(() => false);
          if (!connectAboveDone) await newDocument();
        }
      } finally {
        // ⚠️ **无论成功失败都要翻开**，否则记录那条路就永远断着
        //（`finally` 而不是 try 末尾，就是为了"读失败"这一支）。
        thenThread.current = true;
      }
    },
    [openPath, newDocument, setWorkspace, connectAboveCurrentHas],
  );

  // ── 记「现在开着哪几份」 ───────────────────────────────────────────────
  //
  // ⚠️ **依赖是两个字符串，不是 `docs` 本身**：`refreshDocs()` 每次都给一个
  // 新数组，拿它当依赖会让这条 effect 每次刷新都重跑一遍（而且去抖计时器
  // 也跟着重置，永远等不到落盘那一刻）。`路径键` / `前台` 都是**值**，
  // 文档列表刷新但内容没变时它们不变——这才是"真的变了才写"。
  const pathKey = docs
    .map((d) => d.path)
    .filter((p): p is string => !!p)
    .join("\n");
  const beforePlatform = docs.find((d) => d.id === activeId)?.path ?? null;

  useEffect(() => {
    if (!thenThread.current) return;
    const countTime = window.setTimeout(() => {
      // ⚠️ 用 `路径键` 现拆，不闭包捕获 `docs`：这样上面那句"依赖是值"才
      // 名副其实——effect 体内引用了 `docs` 的话，依赖数组看着完整、
      // 实际读的却是**建这一版 effect 时**的那份快照。
      const columnTable = pathKey ? pathKey.split("\n") : [];
      void api.session.setOpen(columnTable, beforePlatform).catch((e) => {
        console.warn("[nota] 会话没记上：", e);
      });
    }, dropDiskDelayDelay);
    return () => window.clearTimeout(countTime);
  }, [pathKey, beforePlatform]);

  // ── 滚动位置 ──────────────────────────────────────────────────────────

  const recordRollAction = useCallback((path: string, compareExample: number) => {
    if (!thenThread.current) return;
    pendingWrite.current.set(path, compareExample);
    // ⚠️ 计时器**只挂一个**：连续滚动时它一直在跑，到点一次把所有攒下的
    // 路径一起写掉。每个路径各挂一个的话，滚一份长文档能同时欠下几十个
    // 待触发的定时器。
    if (rollActionCountTime.current !== null) return;
    rollActionCountTime.current = window.setTimeout(() => {
      rollActionCountTime.current = null;
      const batch2 = new Map(pendingWrite.current);
      pendingWrite.current.clear();
      if (batch2.size === 0) return;
      // ⚠️ 内存那一份**先更新**（`初始滚动` 读的是它，切回这个标签时要用），
      // 写盘那一条**失败也无所谓**——见文件头那句"失败口径"。
      setRollAction((table2) => ({ ...table2, ...Object.fromEntries(batch2) }));
      for (const [p, r] of batch2) {
        void api.session.setScroll(p, r).catch((e) => {
          console.warn("[nota] 滚动位置没记上：", e);
        });
      }
    }, rollActionDropDiskDelayDelay);
  }, []);

  const rollActionPosition = useCallback(
    // ⚠️ 给的是 `undefined` 而不是 `0`：`EditorPane` 拿 `undefined` 表示
    // "别动它"，而 `0` 是"滚到顶上"这个**有意义的值**（短文档的比例就是 0）。
    // 混在一起的症状是"每次重新打开一份短文档都会被拽到顶上"——本来就在顶上，
    // 所以看不出来；换成一份刚滚到中间的长文档就会露馅。
    (path: string | null | undefined) => (path ? rollAction[path] : undefined),
    [rollAction],
  );

  // ── 列表这一侧 ────────────────────────────────────────────────────────

  const forgetRemoveRecent = useCallback(async (path: string) => {
    setRecent((columnTable) => columnTable.filter((p) => p !== path));
    try {
      await api.session.forgetRecent(path);
    } catch (e) {
      console.warn("[nota] 忘掉最近失败：", e);
    }
  }, []);

  const openRecent = useCallback(
    async (path: string) => {
      // ⚠️ 打不开就**顺手摘掉**（文件头第 3 条）：宿主读列表时滤过一遍，
      // 但那之后文件还可能被删/改名，而"点不动"这一条会一直留着。
      // 报错那条提示已经由 `openPath` 弹过了，这里不再弹第二条。
      if (await openPath(path)) return;
      await forgetRemoveRecent(path);
    },
    [openPath, forgetRemoveRecent],
  );

  const clearEmptyRecent = useCallback(async () => {
    // ⚠️ 内存先清，**不等宿主**：清空是用户明确点的一下，界面当场就该空。
    setRecent([]);
    setRollAction({});
    try {
      await api.session.clear();
      // ⚠️ 宿主那个 `clear` 清的是**整份**侧车，连"上次开着哪几个标签"一起
      // 抹了。用户点的是「清除记录」，不是"下次启动别恢复标签"——所以这里
      // 立刻把当前这一份标签补写回去（那才是他眼前的样子）。不补的话症状是
      // "清了记录，退出再开，标签没了"。
      const [columnTable, beforePlatform] = isOpen();
      if (columnTable.length) await api.session.setOpen(columnTable, beforePlatform);
    } catch (e) {
      toast(String(e), "error");
    }
  }, [isOpen, toast]);

  return { recent, connectAboveMeetingSpeech, rollActionPosition, recordRollAction, openRecent, forgetRemoveRecent, clearEmptyRecent };
}

/** 路径的最后一段（菜单里显示用的短名字）。 */
export function textItemName(path: string): string {
  const paragraph2 = path.split(/[/\\]/).filter(Boolean);
  return paragraph2[paragraph2.length - 1] ?? path;
}

/**
 * 路径中间那一段父目录名（菜单里跟在文件名后面，用来区分同名的文件）。
 *
 * ⚠️ 只取**一层**：整条路径在菜单里会挤成一条、还会被中间省略掉，反而看不出
 * 是哪一个——用户要的是"哪一份 `笔记.md`"，不是它的完整地址。
 */
export function parentItemRecordName(path: string): string {
  const paragraph2 = path.split(/[/\\]/).filter(Boolean);
  return paragraph2.length >= 2 ? paragraph2[paragraph2.length - 2]! : "";
}

/**
 * 这一条在界面上叫什么。**UI 与文档两处都用它**（菜单子菜单、主页、侧栏），
 * 各写一份的话，某天改了拼法而漏改一处，同一份文件在菜单里和侧栏里就是
 * 两个名字。
 */
export function recentItemName(path: string): string {
  const parent = parentItemRecordName(path);
  return parent ? `${textItemName(path)} — ${parent}` : textItemName(path);
}
