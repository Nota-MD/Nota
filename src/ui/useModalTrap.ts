/**
 * 弹层的键盘封闭：**焦点陷阱**（Tab 跑不出去）＋ `focusin` 兜底 ＋ Esc。
 * `docs/07` backlog 第 50 项。
 *
 * # 为什么焦点陷阱不是可选项
 *
 * 这几个弹层都标着 `aria-modal="true"`，此前却只有 window 上的 Esc：
 * 一路按 Tab 焦点会落到遮罩背后。对设置面板那是最危险的——落到背后那个
 * 可编辑的正文上之后，打的每个字都写进文档，而屏幕上盖着面板，**用户看不见
 * 自己正在改文件**。2026-09-25 实测过这个形状：面板里按 208 次 Tab 再 Esc，
 * 文档净增 271 个字符，状态栏变成"已修改"。
 *
 * 两道闸，缺一不可（这套做法 2026-09-25 先在 `SettingsDialog` 落地、
 * 2026-10-04 抽到这里给三个弹层共用）：
 *
 * ① Tab / Shift+Tab 在面板内**首尾相接**，焦点从不离开；
 * ② `focusin` 兜住非键盘的出路（鼠标点、程序 focus），一旦落在面板外就拉回。
 *
 * 只留 ② 的话，焦点先跑出去再被拽回，Tab 的落点每次都重置到面板容器上、
 * 键盘用户等于没法在面板里走动；只留 ① 的话，鼠标那条路还敞着。
 *
 * ⚠️ **面板里没有 portal 的前提**（设置那套原语不弹 `MenuPopup`）：所以
 * "在面板外"就是"该拉回来"，不给谁留口子。
 * **2026-10-04 这个前提被打破了**（见下），口子已经开了。
 *
 * # 浮层例外（2026-10-04，右键菜单）
 *
 * `ui/ContextMenu.tsx` 是**从 `App` 挂上去、portal 到 `document.body`** 的，
 * 和面板没有 DOM 亲缘关系，但它会**把 DOM 焦点抢到自己身上**
 * （`useMenuRovingFocus` 那条播种的 effect）。于是上面两道闸都会和它打架：
 *
 * - `focusin` 那道看到"焦点在面板外"，立刻把焦点**从菜单里拽回面板**——
 *   菜单还画在屏幕上，键盘却已经不在里面了；
 * - `Esc` 那道在 window 捕获阶段就 `stopPropagation` 掉了，菜单自己的
 *   `onDismiss`（React `onKeyDown`，在冒泡阶段）**永远收不到这个键**。
 *
 * 症状是 2026-10-04 开窗口检量到的：设置框里右键一个输入框，菜单弹出来、
 * 按 `Esc` 菜单不关（也不该由它关对话框）。所以两道闸都加一条
 * **"目标/焦点在浮层里就让路"**：焦点归菜单，`Esc`/`Tab` 归菜单自己处理。
 *
 * ⚠️ 判据是 `[data-context-menu]` 这个属性，**不是**谁的 `ref`：子菜单
 * （`MenuPopup.tsx::SubMenu`）portal 到 `body`、和菜单本体也不是一家人，
 * 只有这个属性是两层都挂着的（同 `ContextMenu.tsx` 里"点别处就关"那条）。
 *
 * ⚠️ 只让 `Esc`/`Tab` 这两种键（本钩子也只认这两种），没让别的。
 *
 * # 纯函数单独拎出来
 *
 * `陷阱落点` 是这套行为里唯一有分支的部分（和 `useMenuRovingFocus.ts` 把
 * `findNextEnabled` 拎出来是同一个理由），不碰 DOM、不碰 React，
 * `tests/modal-trap.test.ts` 钉它。`在浮层里` 也拎出来了（同一份测试里钉
 * 它认哪个属性），但它是 DOM 查询，**只有真 DOM 能真验**。
 */

import { useEffect, type RefObject } from "react";

/**
 * 面板里此刻**真的能聚焦**的格子。
 *
 * ⚠️ 藏起来的不算：设置面板搜索态下每一页都渲染、靠 CSS 藏行，不滤掉的话
 * Tab 会掉进看不见的格子里（`offsetParent` 为 `null` 就是 `display: none`）。
 */
export function 可聚焦(panel: HTMLElement): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
        ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
}

/** 右键菜单挂在自己两层上的标记（`ui/ContextMenu.tsx`：本体与子菜单各一个）。 */
const 浮层标记 = "[data-context-menu]";

/**
 * 这个节点是不是落在**浮层**（右键菜单，含它飞出来的子菜单）里面。
 *
 * ⚠️ 传进来的节点可能是 `document.activeElement`（`Element`）也可能是
 * `focusin` 的 `e.target`（理论上可以是文本节点），所以 `closest` 要
 * 可选调用一次——和 `ContextMenu.tsx` 里那条"点别处就关"同一个写法。
 */
export function 在浮层里(node: Node | null): boolean {
  return !!(node as Element | null)?.closest?.(浮层标记);
}

/** `陷阱落点` 的判定结果。三种动作之外没有别的可能。 */
export type 陷阱判定 =
  /** 不拦：焦点在格子中间，Tab 让浏览器自己挪。 */
  | { 动作: "自然移动" }
  /** 拦下但没处去（面板里一个能聚焦的格子都没有）：按了等于没按。 */
  | { 动作: "原地不动" }
  /** 拦下并把焦点送到这个格子。 */
  | { 动作: "送到"; 目标: HTMLElement };

/**
 * Tab 该把焦点送到哪儿。`当前` 传 `document.activeElement`（可为 `null`）。
 *
 * 判定顺序有讲究，别随手重排：
 *
 * - **焦点已经在外面**（或还在面板容器自己身上）→ 一律拉回第一格／最后一格。
 *   这是"焦点先跑出去再被拽回"那条路的入口——不接住它，键盘用户每次 Tab
 *   的落点都被重置到容器上，等于没法走动。
 * - **首尾互跳是两个方向都夹住**：Shift+Tab 从第一格绕到最后一格，
 *   Tab 从最后一格绕回第一格。只拦一个方向，另一个方向照样漏。
 * - **格子中间** → 自然移动（不拦）。拦了反而要自己实现一遍整条漫游。
 */
export function 陷阱落点(格子: HTMLElement[], 当前: Element | null, 反向: boolean): 陷阱判定 {
  if (格子.length === 0) return { 动作: "原地不动" };

  const first = 格子[0];
  const last = 格子[格子.length - 1];
  // 上面判过 `length === 0`，这两个只是给 `noUncheckedIndexedAccess` 看的。
  if (!first || !last) return { 动作: "原地不动" };

  // 焦点不在面板里（或在面板容器自己身上）＝从外面进来。
  // ⚠️ 判据是"当前焦点是不是其中一格"：容器自己（`tabIndex={-1}`）与面板外
  // 的任何东西都不在格子里，走"从外面进来"那一条。
  const 在面板里 = !!当前 && 格子.includes(当前 as HTMLElement);
  if (!在面板里) return { 动作: "送到", 目标: 反向 ? last : first };

  if (反向 && 当前 === first) return { 动作: "送到", 目标: last };
  if (!反向 && 当前 === last) return { 动作: "送到", 目标: first };
  return { 动作: "自然移动" };
}

export interface 弹层封闭选项 {
  /** Esc 的去处。不给的话 Esc 不拦（弹层自己有别管 Esc 的人时用）。 */
  onEscape?: () => void;
}

/**
 * 挂上三道监听（window keydown 捕获、document focusin 捕获），弹层卸载时全撤。
 *
 * ⚠️ 绑 **window/capture** 而不是面板自己：焦点可能还没落进面板（用户在弹层
 * 出现前手就在键盘上），绑面板会漏掉第一下；捕获阶段还能抢在别的
 * `keydown` 处理器前面，避免同一个 Tab 既被陷阱处理又漏到编辑器那边。
 */
export function useModalTrap(
  panelRef: RefObject<HTMLElement | null>,
  { onEscape, enabled = true }: 弹层封闭选项 & { enabled?: boolean } = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // ⚠️ 输入法组字期间一概不接（同 `useMenuRovingFocus.ts` 的 `isImeKey`）：
      // 组字中的 Esc 是"收候选框"、方向键是"选字"，这些键该归输入法；
      // 抢了它们，中文用户按 Esc 会把整个框关掉。`keyCode === 229` 是老
      // WebView 唯一能给的信号，`isComposing` 是标准信号，两个都要看。
      if (e.isComposing || e.keyCode === 229) return;
      // 设置页里再开的模态框（例如设置包选择）优先级更高。外层设置框
      // `contains` 不到 portal 到 body 的子模态，于是让子模态自己的陷阱处理
      // Esc/Tab；子模态自己的 panelRef 就是标记节点，不会把自己让掉。
      const 最内层 = document.querySelector<HTMLElement>('[data-modal-layer="true"]');
      if (最内层 && 最内层 !== panelRef.current && !panelRef.current?.contains(最内层)) {
        return;
      }
      // ⚠️ **焦点在浮层里就整个让路**（`Esc` 与 `Tab` 都让）：右键菜单开着时
      // 它自己那套漫游在管焦点，`Esc` 该关的是菜单、`Tab` 该关掉菜单放行。
      // 这里不 return 的话，`Esc` 会被下面那条 `stopPropagation` 掐死在捕获
      // 阶段，菜单的 `onDismiss` 一辈子收不到（2026-10-04 目检量到的）。
      if (在浮层里(document.activeElement)) return;
      if (e.key === "Escape") {
        if (!onEscape) return;
        e.preventDefault();
        // ⚠️ **`stopPropagation` 是 2026-10-04 目检抓出来补的，不是可选项。**
        // 这一条绑在 window 的**捕获**阶段；同一个 `Esc` 还会走完冒泡，落到
        // window 上另一个"关掉底下一层"的处理器上（`AboutDialog` 那条）。
        // 本钩子既然认领了这个键，就不能让它再漏下去——不然许可证框盖在
        // 关于框上时，**一次 `Esc` 把两层一起关掉**。
        // ⚠️ 必须用 `stopPropagation` 而**不是** `stopImmediatePropagation`：
        // 后者会顺手掐掉同一个节点上同阶段的别人（比如 `ReviewBar` 那条
        // `defaultPrevented` 兜底），那是另一件事。
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const 判定 = 陷阱落点(可聚焦(panel), document.activeElement, e.shiftKey);
      if (判定.动作 !== "自然移动") e.preventDefault();
      if (判定.动作 === "送到") 判定.目标.focus();
    };

    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      const target = e.target as Node | null;
      if (!panel || !target || panel.contains(target)) return;
      // ⚠️ 浮层里的焦点**不拽回来**：菜单一开就把焦点播种到自己第一项上，
      // 拽回来的话菜单画着、键盘却不在里面（`Esc`/方向键全失灵）。
      if (在浮层里(target)) return;
      panel.focus();
    };

    window.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [enabled, onEscape, panelRef]);
}
