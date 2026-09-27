/**
 * 菜单的方向键导航（"漫游焦点"，roving tabindex）。
 *
 * 2026-09-23 重做菜单时加的。此前只有 Esc 能关、方向键一概不响应——
 * 用键盘的人打开菜单之后**只能靠 Tab 一项一项摸**，而 Tab 在菜单里
 * 本该是"关掉菜单、继续走页面"，不是"走下一项"。这两件事混在一起，
 * 键盘用户既走不动也关不掉。
 *
 * 做法走标准的 roving tabindex：
 *
 * - 焦点在项之间**漫游**：当前项 `tabIndex=0`，其余 `-1`。整个菜单在
 *   Tab 顺序里只算**一个**落点，这既是 WAI-ARIA 对 `menu` 的要求，
 *   也是"Tab 不该在菜单内部打转"那条惯例的实现。
 * - 灰掉的项**一律跳过**（上下、Home/End 都跳）。停在灰项上按回车没反应，
 *   对键盘用户来说和卡住没区别。
 * - Esc / Tab 都交给调用方关菜单——**这一层不自己关**，因为"关掉之后焦点
 *   还给谁"只有调用方知道（这里是还给菜单栏那一栏的按钮）。
 *
 * # 为什么纯函数单独拎出来
 *
 * `findNextEnabled` / `findEdgeEnabled` 是这套行为里**唯一有分支的**部分，
 * 也是最容易写错的地方（"全都灰掉时按一下上键"到底该去哪儿）。它们不碰
 * DOM、不碰 React，单独放着是为了让读的人一眼看到边界情形怎么处理。
 */

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

/** 漫游需要的**最小**形状。只有"灰没灰"参与判断。 */
export interface RovingItem {
  disabled?: boolean;
}

/**
 * 从 `current` 出发，朝 `direction` 找下一个**能用**的项，绕回。
 *
 * ⚠️ **一个能用的都没有时返回 `current` 本身**（不是 -1）。原因：
 * 上下键的语义是"移动"，不是"定位"。菜单里所有项都灰着的时候按一下下键，
 * 焦点该**留在原地**——跑到 -1 会让菜单变成没有落点的状态，再按什么键
 * 都救不回来。空列表才返回 -1。
 */
export function findNextEnabled(
  items: readonly RovingItem[],
  current: number,
  direction: 1 | -1,
): number {
  const total = items.length;
  if (total === 0) return -1;
  let index = current;
  for (let step = 0; step < total; step++) {
    index = (index + direction + total) % total;
    if (!items[index]?.disabled) return index;
  }
  // 绕了一圈没找到别人：要么全灰，要么只有 current 这一个能用的。
  return current;
}

/**
 * 第一个（`direction` 为 1）或最后一个（为 -1）能用的项，没有则 -1。
 *
 * ⚠️ 这里和 `findNextEnabled` 的差别是**有意的**：那条返回 `current` 是
 * 为了"按了方向键但没处去"时守住原地；这条走的是**播种和首尾**那条路，
 * 它必须如实回答"这里根本没有能落的地方"（-1），不能报一个灰项的下标——
 * 报了下标调用方就会去 focus 一个 `disabled` 的按钮，焦点掉到 `<body>`，
 * 这个菜单的 Esc 就再也关不掉了。
 */
export function findEdgeEnabled(items: readonly RovingItem[], direction: 1 | -1): number {
  const index =
    direction === 1 ? findNextEnabled(items, items.length - 1, 1) : findNextEnabled(items, 0, -1);
  return index >= 0 && !items[index]?.disabled ? index : -1;
}

/**
 * 输入法正在组字时**不要**处理按键。
 *
 * 中文/日文输入法在组字期间会把方向键吃掉去选字，此时若还让菜单跟着动，
 * 用户选字的上下键会同时把菜单焦点挪走。`keyCode === 229` 是老浏览器
 * 唯一能给的信号，`isComposing` 是标准信号，两个都要看。
 */
function isImeKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

export interface UseMenuRovingFocusOptions<T extends RovingItem> {
  /** 当前菜单项，**按渲染顺序**，且**不含分隔线**（分隔线不是落点）。 */
  items: readonly T[];
  /** 回车/空格激活。调用方负责判断该项有没有子菜单（有则展开而不是执行）。 */
  onActivate: (item: T, index: number) => void;
  /** Esc / Tab：关掉菜单。焦点还给谁由调用方决定。 */
  onDismiss: () => void;
  /**
   * 向右。调用方自己决定做什么：有子菜单就展开，没有就切到右边那一栏。
   * ⚠️ **没有返回值**——按键一定会被这一层吃掉（见下面 `handled()`），
   * 所以"返回 false 让事件冒上去"那条路已经不存在了。
   */
  onRight?: (item: T, index: number) => void;
  /** 向左。子菜单里是"收起自己"，顶层是"切到左边那一栏"。同样没有返回值。 */
  onLeft?: () => void;
  /** 为 true 时播种焦点；false 时清空。 */
  enabled?: boolean;
  /** 菜单**开着但内容换了**（比如主题清单重扫）时重新播种。
      不传的话焦点会掉到 `<body>`，这个菜单就关不掉了。 */
  resetKey?: unknown;
}

export interface UseMenuRovingFocusResult {
  focusedIndex: number;
  /**
   * 手动把焦点挪到某一项。
   *
   * ⚠️ 存在的唯一理由是**子菜单关掉之后焦点要还回来**：子菜单一卸载，
   * 里面那个正在聚焦的按钮就从 DOM 里没了，焦点会掉到 `<body>`——
   * 于是父菜单的 Esc 再也关不掉自己（它的 keydown 挂在弹层上，焦点已经不在里面了）。
   * 所以 `←` 关闭子菜单时必须显式把父项重新聚焦。
   */
  setFocusedIndex: (index: number) => void;
  /**
   * 把焦点**立刻**挪到某一项上（改状态 **并且** 直接 focus 那个 DOM 节点）。
   *
   * ⚠️ 和 `setFocusedIndex` 的区别就在"目标正好是当前那一项"的时候：
   * 那时 state 没变、React 不重渲染、跟着 `focusedIndex` 走的那条 effect
   * **根本不会跑**，于是什么都不会发生。子菜单收起、焦点要还回父项时
   * 恰好就是这种情况（按 `→` 展开子菜单之前，焦点本来就停在那个父项上），
   * 结果焦点掉到 `<body>`，父菜单的 Esc 跟着失灵。**这个问题实际发生过一次。**
   * 所以这条路径必须自己去 focus，不能指望 effect。
   */
  focusItem: (index: number) => void;
  /** 挂到菜单容器的 `onKeyDown` 上。 */
  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  /** 每一项的 ref 回调：`ref={(n) => registerItem(i, n)}`。 */
  registerItem: (index: number, node: HTMLElement | null) => void;
  /** 每一项的漫游属性。 */
  itemProps: (index: number) => {
    tabIndex: number;
    onFocus: () => void;
    onMouseEnter: () => void;
  };
}

export function useMenuRovingFocus<T extends RovingItem>({
  items,
  onActivate,
  onDismiss,
  onRight,
  onLeft,
  enabled = true,
  resetKey,
}: UseMenuRovingFocusOptions<T>): UseMenuRovingFocusResult {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  // 打开时（以及内容换形状时）播种到第一个能用的项。
  // ⚠️ 用 `useLayoutEffect` 不是 `useEffect`：要在**画出来之前**定好落点，
  // 否则菜单会先闪一帧"没有任何项被选中"的样子。
  // ⚠️ 依赖里**故意没有 `items`**：标签每次渲染都是新数组，放进去会让焦点
  // 每渲染一次就重置一次，方向键立刻失效。只有当开/关或 `resetKey` 变了才该重播种。
  useLayoutEffect(() => {
    const next = enabled ? findEdgeEnabled(items, 1) : -1;
    setFocusedIndex(next);
    if (next >= 0) itemRefs.current[next]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, resetKey]);

  // 方向键移动之后把 DOM 焦点跟过去（同样要在画之前）。
  useLayoutEffect(() => {
    if (focusedIndex < 0) return;
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (isImeKey(event.nativeEvent)) return;

      // ⚠️⚠️ **吃掉的键必须 `stopPropagation`**，这一条是踩出来的。
      //
      // 子菜单是**套在**父弹层里的 DOM 子树，两层各挂了一个 `onKeyDown`。
      // 如果子菜单只 `preventDefault` 不 `stopPropagation`，事件会继续冒到
      // 父弹层上，**父弹层会把同一个按键再处理一遍**——症状非常难认：
      //   - 在子菜单里按 `↓`，焦点被父层抢走，跳到父菜单的下一项去；
      //   - 在子菜单里按 `←`，子菜单自己的 `onLeft` **和**父层的
      //     `onArrowOut(-1)` 都跑了，于是子菜单关不掉、菜单栏还跟着切了一栏。
      // 两层的表现看着是两个不相干的 bug，根因是同一行。
      //
      // 为什么早先没写：一开始指望"没子菜单的项让 `→` 冒到菜单栏去切栏"，
      // 那需要放行冒泡。现在切栏改成了**显式回调** `onArrowOut`
      // （见 `MenuPopup.tsx` 顶上那张表），就不再需要冒泡了，一律吃掉。
      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      switch (event.key) {
        case "ArrowDown":
          handled();
          setFocusedIndex((i) => findNextEnabled(items, i, 1));
          return;
        case "ArrowUp":
          handled();
          setFocusedIndex((i) => findNextEnabled(items, i, -1));
          return;
        case "Home":
          handled();
          setFocusedIndex(findEdgeEnabled(items, 1));
          return;
        case "End":
          handled();
          setFocusedIndex(findEdgeEnabled(items, -1));
          return;
        case "Escape":
          handled();
          onDismiss();
          return;
        case "Tab":
          // ⚠️ **不** preventDefault 之后什么也不做，而是关掉菜单让 Tab 照常走。
          // 菜单内部的 Tab 是走不通的（项在 Tab 顺序里只算一个落点）。
          handled();
          onDismiss();
          return;
        case "ArrowRight": {
          // 有子菜单就展开；没有就交给调用方决定（顶层弹层会切到右边那一栏）。
          handled();
          const item = items[focusedIndex];
          if (item) onRight?.(item, focusedIndex);
          return;
        }
        case "ArrowLeft":
          handled();
          onLeft?.();
          return;
        case "Enter":
        case " ": {
          handled();
          const item = items[focusedIndex];
          if (item && !item.disabled) onActivate(item, focusedIndex);
          return;
        }
        default:
          return;
      }
    },
    [items, focusedIndex, onActivate, onDismiss, onRight, onLeft],
  );

  const registerItem = useCallback((index: number, node: HTMLElement | null) => {
    itemRefs.current[index] = node;
  }, []);

  const itemProps = useCallback(
    (index: number) => ({
      tabIndex: focusedIndex === index ? 0 : -1,
      onFocus: () => setFocusedIndex(index),
      // ⚠️ 鼠标划过**灰项**时不改焦点（`disabled` 的按钮本来也 focus 不了，
      // 但 `setFocusedIndex` 会先跑，焦点就丢在了一个永远落不上的下标上）。
      onMouseEnter: () => {
        if (!items[index]?.disabled) setFocusedIndex(index);
      },
    }),
    [items, focusedIndex],
  );

  // 见 `focusItem` 的文档：state 没变时那条 effect 不会跑，必须自己 focus。
  const focusItem = useCallback((index: number) => {
    setFocusedIndex(index);
    itemRefs.current[index]?.focus();
  }, []);

  return { focusedIndex, setFocusedIndex, focusItem, handleKeyDown, registerItem, itemProps };
}
