/**
 * **这一份文件该用哪种模式打开**：按文件名认类型（schema-aware）＋ 大文件自动
 * 降级源码模式。2026-09-28 落地，用户原话：「**按文件名认类型（schema-aware）**，
 * 按文件名推高亮语言，…，**大文件自动降级源码模式**…都是简单的小功能」。
 *
 * # 判据不在这里
 *
 * 两条规则（名字、大小）全在 `editor/file-kind.ts` 里——那是**纯函数**，有
 * 自己的测试集（`tests/file-kind.test.ts`），一个 React 都不碰。这个文件只干
 * 那两件在纯函数里干不了的事：
 *
 * 1. **每份文档只判一次**（{@link 判过}）；
 * 2. **提示条**要说清是哪一条缘由（{@link 提示过}）。
 *
 * # ⚠️ 为什么"只判一次"，而不是每次打开都重判
 *
 * 判据里有一条是**文档有多长**（`是大文件`）。长度是**会变的**——用户在正文里
 * 敲字，一篇 99 万字符的稿子几分钟后就过线了。要是跟着变，症状是
 * **写着写着编辑器自己换成源码模式**：光标跳到另一个组件里、撤销栈换了一份、
 * 刚才那半句话还在不在都两说。用户对这件事的解释不会是"我的文件太大了"，
 * 而是"Nota 又出毛病了"。
 *
 * 所以**判的是"打开这一份的那一刻"**：那一刻它多大，就按那一刻算。之后长得再
 * 大也照旧——用户真想换，菜单里「视图 → 源码」一按就行（而且按了之后这个 hook
 * **不再管这一份**，见下）。
 *
 * ⚠️ 同理，**关掉再打开会重判一次**：那不是"同一个时刻"，而且用户已经用
 * "关掉再打开"这个动作表达过一次"重来一遍"了。
 *
 * # ⚠️ 用户手动切模式 = 解除降级
 *
 * 降级**压过**用户的设置（`实际模式` 那条规则），所以必须有条出口，否则
 * 用户会遇到：菜单里「所见即所得」上带着 ✓、我点「所见即所得」，**它纹丝不动**。
 * 那是把用户锁在外面——比"打开时选错了模式"糟得多。
 *
 * 出口就是 {@link 出口.设模式}：用户自己切模式的那几条入口（菜单「视图」
 * 那三条 ＋ 状态栏那颗 `</>`）都汇到它，它把这一份的降级**删掉**。删掉之后
 * {@link 判过} 里还记着它，所以**不会再被判回来**——这正是"用户说了算"的形状。
 *
 * ⚠️ 解除是**按份**的，不是全局关掉这条功能：用户手动切过 A 那份之后，
 * 再拖一份 `.py` 进来照样降级。
 *
 * # ⚠️ 2026-10-07：用户选的那一档（`模式偏好`）也搬进了这里
 *
 * 它原本是 `App.tsx` 的一条 `useState`（再往前是设置文件里的 `view_mode`）。
 * 那天两件事撞在一起：① 用户要「**请设置默认启动为 WYSIWYG**」，模式改成
 * **会话内状态、不落盘**；② 那条 `useState` ＋ `设模式` 回调把 `App.tsx`
 * 顶过了 1000 行硬线（那种账在 `src/App.tsx` 顶上一直记着）。搬到这里不是
 * 权宜：**"哪一档"和"这一份该怎么打开"本来就是同一个问题的两半**，而
 * "用户自己切模式"的全部效果（改偏好 ＋ 解除降级）也就地合成了一条
 * {@link 出口.设模式}。
 *
 * ⚠️ 默认值 `wysiwyg` 从此**只有一处**：下面那条 `useState` 的初值。
 * `settings/mod.rs` 那份已经删掉，老设置文件里残留的 `view_mode` 由 serde
 * 忽略——**别再往设置里加回去**，那正是用户这次要拿掉的东西。
 *
 * ⚠️ **"这一份是不是 Markdown"不从这里出去**：那是文件的属性（`认文件类型`），
 * 由用它的地方（`ui/EditorArea.tsx`）按路径现算。从这里出去的话，"用户手动
 * 解除降级之后它还算不算 Markdown"就成了第二个答案——源码模式下一份 `.py`
 * 该不该染 Markdown 色，跟"这次打开时降没降级"根本不是一回事。
 *
 * # ⚠️ 提示条的时机
 *
 * 只在**它成为前台那一份**的时候提示一次。理由：一次拖进来五个文件时只有
 * 前台那一份看得见，为另外四份各弹一条等于刷屏；而用户切过去的时候正好是
 * 他需要知道"这为什么是源码模式"的时候。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { DocId, Document, ViewMode } from "@/bridge/ipc";
import { actualMode, LowerLevelReason, type LowerLevelReason as reason } from "@/editor/file-kind";
import type { Toast } from "@/ui/Toasts";

/** 这个 hook 要的输入。全是现成的状态，没有一样是它自己造的。 */
export interface input {
  /** 当前开着的文档（`App.tsx` 那份列表）。 */
  docs: Document[];
  /** 前台是哪一份。`null` = 一份都没开。 */
  activeId: DocId | null;
  /** 提示条出口（`ui/useToasts.ts`）。 */
  toast: (message: string, level?: Toast["level"]) => void;
  /** 翻译（`useT()`）。⚠️ 传进来而不是在这里 `useT()`：调用方本来就有。 */
  t: (source: string, ...parameter: (string | number)[]) => string;
}

export interface OutputMouth {
  /** **实际该用的模式**。降级了就是 `source`，没降级就是用户设的那一档。 */
  mode2: ViewMode;
  /**
   * 用户**自己**选的那一档（还没过降级的原始值）。
   *
   * ⚠️ `ui/useDocuments.ts` 要的是**这一个**而不是上面的 `模式`：它问的是
   * "用户想要所见即所得吗"（决定自动配对之类的行为），与"这一份眼下被降级
   * 了没有"无关。
   */
  preference: ViewMode;
  /**
   * 用户自己选了模式（菜单「视图」那三条 ＋ 状态栏那颗 `</>` 都汇到这里）。
   *
   * ⚠️ 两件事一起做：改偏好，再**解除当前这一份的降级**——降级压过用户的
   * 选择，不解除的症状是"我点「所见即所得」，它纹丝不动"（见文件头）。
   * 「当前这一份」用 ref 读、不进依赖：这个回调要**身份稳定**，它是
   * `App.tsx` 整张菜单表的依赖之一，抖一次整张表重建一次。
   */
  setMode: (m: ViewMode) => void;
}

export function useFileKind(input: input): OutputMouth {
  const { docs, activeId, toast, t } = input;

  /**
   * 用户**自己**选的那一档（**会话内状态**，不落盘，2026-10-07 起住这里）。
   * 每次启动一律从这个初值开始——用户原话「请设置默认启动为 WYSIWYG」。
   */
  const [modePreference, setModePreference] = useState<ViewMode>("wysiwyg");

  /**
   * `设模式` 要读"当前是哪一份"、又不许把它写进依赖（那个回调的身份要稳），
   * 所以用 ref 转一手。⚠️ 同步那一下放在 effect 里，写法照抄
   * `ui/useAppEvents.ts` 第 162 行那份 `activeIdRef`：切换永远发生在一次渲染
   * 之后，读到的不会旧。
   */
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  /**
   * 已经被降级的那些：id → 缘由。
   *
   * ⚠️ **只装降级了的**，没降级的不占格子：绝大多数文档都是"什么都不用管"，
   * 给每一份都存一条 `null` 只是让这张表变长。
   */
  const [lowerLevelTable, setLowerLevelTable] = useState<ReadonlyMap<DocId, reason>>(() => new Map());

  /** 判过了的。⚠️ 与 `降级表` **不是一回事**：判过之后结论是"不用管"的那些只在这里。 */
  const determinePass = useRef(new Set<DocId>());
  /** 提示过条的。理由见文件头「提示条的时机」。 */
  const noticePass = useRef(new Set<DocId>());

  // ── ① 判（每份只判一次）＋ 收尸 ──────────────────────────────────────
  //
  // ⚠️ 判与收尸**写在同一个 effect 里**是有意的：两件事读的是同一份"现在还开着
  // 哪些"（就是 `docs`），拆成两个 effect 会让"关掉一份"这件事被处理两次，
  // 而它们谁先跑是不保证的。
  useEffect(() => {
    const atWorld = new Set(docs.map((d) => d.id));

    // 收尸：这一份关掉了，把它从两个本子里划掉。
    // ⚠️ 不清的话：`DocId` 是宿主那边递增发的，短时间重开一份新文档不会撞号；
    // 但**不清就是一份只会变长的账**，而且哪儿天宿主改成复用 id，症状会是
    // "新开的一份 .py 静静地按源码模式打开、一条提示都没有"——那是判过它了，
    // 用的是上一份的结论。收尸在 `docs` 每次变化时做一遍，代价是一次 Set 遍历。
    let hasDummy = false;
    for (const id of determinePass.current) {
      if (!atWorld.has(id)) {
        determinePass.current.delete(id);
        noticePass.current.delete(id);
        hasDummy = true;
      }
    }

    // 判：只看还没判过的。
    const newValueLowerLevel: Array<[DocId, reason]> = [];
    for (const d of docs) {
      if (determinePass.current.has(d.id)) continue;
      determinePass.current.add(d.id);
      // ⚠️ `d.path === null` 是"还没存盘的新文档"，`降级缘由` 认这个取值
      //（见那边的参数类型）：名字这一条判不了，大小那一条照判。
      const reason = LowerLevelReason(d.path, d.text.length);
      if (reason) newValueLowerLevel.push([d.id, reason]);
    }

    if (!hasDummy && newValueLowerLevel.length === 0) return;

    setLowerLevelTable((oldValue) => {
      const newValue = new Map<DocId, reason>();
      for (const [id, reason] of oldValue) if (atWorld.has(id)) newValue.set(id, reason);
      for (const [id, reason] of newValueLowerLevel) newValue.set(id, reason);
      return newValue;
    });
  }, [docs]);

  // ── ② 提示（只在它成为前台那一份时，一次）──────────────────────────
  useEffect(() => {
    if (activeId === null) return;
    const reason = lowerLevelTable.get(activeId);
    if (!reason || noticePass.current.has(activeId)) return;
    const d = docs.find((x) => x.id === activeId);
    if (!d) return;
    noticePass.current.add(activeId);
    if (reason === "text") {
      toast(
        t(
          "“{0}” is not a Markdown file, so it opened in Source mode.",
          d.title,
        ),
      );
    } else {
      toast(
        t(
          "“{0}” is very large ({1} characters), so it opened in Source mode to keep typing responsive.",
          d.title,
          d.text.length,
        ),
      );
    }
  }, [activeId, lowerLevelTable, docs, toast, t]);

  // ── ③ 合出实际模式 ──────────────────────────────────────────────────
  const thisOneDocumentOfReason: reason | null =
    activeId === null ? null : (lowerLevelTable.get(activeId) ?? null);

  // ⚠️ 2026-10-07 起**不再有兜底值**：`模式偏好` 就是上面那条
  // `useState("wysiwyg")` 的当前值，不存在"设置还没读回来"的那几百毫秒
  // （那条窗口正是当初要三处兜底对齐的原因——现在那份默认值只有一处）。
  const mode2 = actualMode(modePreference, thisOneDocumentOfReason);

  // ── ④ 切模式：改偏好 ＋ 解除这一份的降级 ─────────────────────────────
  const setMode = useCallback((m: ViewMode) => {
    setModePreference(m);
    const id = activeIdRef.current;
    if (id === null) return;
    setLowerLevelTable((oldValue) => {
      if (!oldValue.has(id)) return oldValue; // 没降级过就原样返回，别白重画一次
      const newValue = new Map(oldValue);
      newValue.delete(id);
      return newValue;
    });
  }, []);

  return { mode2, preference: modePreference, setMode };
}
