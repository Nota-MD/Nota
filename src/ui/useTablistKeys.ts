/**
 * 页签（`role="tablist"`）的方向键导航。`docs/07` backlog 第 50 项（2026-10-04）。
 *
 * # 口径：**手动激活**
 *
 * 方向键只在页签之间**挪焦点**，不切换；Enter / 空格由页签里那颗 `<button>`
 * 自己的 click 语义去点。这是 WAI-ARIA 对「面板切换代价大」的页签的推荐——
 * 这里的两个（侧栏页签、文档标签页）都符合：文档标签页每切一次要**重挂
 * 编辑器**，让方向键连着切三四个文档，中间那几个的挂载全是白干的。
 * （侧栏那两个页签切换很轻，但同一个应用里两套行为更糟，统一按手动。）
 *
 * 键位照菜单那套（`useMenuRovingFocus.ts`）的口味：←→ 走、Home/End 跳头尾、
 * **绕圈**、灰掉的跳过（这两处页签没有灰这一说，但纯函数按能用的算）。
 * 组字期间（IME）不接，理由在那边文件头写过一遍，不抄。
 *
 * ⚠️ 只在**焦点已经在页签上**时才拦：焦点在页签栏外（正文、别的面板）时，
 * ←→ 有它自己的语义（光标移动），这层不该碰。页签是 `<button>`（焦点真的
 * 落在它身上）或包着 `<button>` 的 `role="tab"` 容器（焦点落在里面的按钮上，
 * `TabBar` 那种），两种都认。
 *
 * `页签下一个` 是唯一有分支的部分，纯函数，`tests/tablist-keys.test.ts` 钉它。
 */

import { useEffect, type RefObject } from "react";

/**
 * 方向键该把焦点挪到第几个页签。
 *
 * 返回**下标**；`-1` 表示没有能去的页签（总数为 0）。
 * `key` 只认四个：ArrowRight / ArrowLeft / Home / End，别的让调用方早退。
 */
export function 页签下一个(总数: number, 当前: number, key: string): number {
  if (总数 <= 0) return -1;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return 总数 - 1;
    case "ArrowRight":
      return (当前 + 1) % 总数;
    case "ArrowLeft":
      return (当前 - 1 + 总数) % 总数;
    default:
      return -1;
  }
}

/** 页签里**真的能接焦点**的那颗元素：页签自己是按钮就用它，否则找里面的第一颗。 */
function 落点(tab: HTMLElement): HTMLElement {
  if (tab.matches("button, a[href], [tabindex]:not([tabindex='-1'])")) return tab;
  return (
    tab.querySelector<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])") ?? tab
  );
}

/**
 * 给页签栏接上方向键。监听绑在**容器**上（冒泡阶段）：焦点本来就得先落到
 * 页签里这条逻辑才生效，容器级监听正好只看见"页签栏里按的键"。
 */
export function useTablistKeys(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End")
        return;

      const 容器 = ref.current;
      if (!容器) return;
      const 页签 = Array.from(容器.querySelectorAll<HTMLElement>('[role="tab"]'));
      const active = document.activeElement;
      const 当前 = active ? 页签.findIndex((tab) => tab === active || tab.contains(active)) : -1;
      // 焦点不在任何页签上：不拦，方向键归页面里别处管。
      if (当前 < 0) return;

      const 下标 = 页签下一个(页签.length, 当前, e.key);
      const 目标 = 下标 >= 0 ? 页签[下标] : undefined;
      if (!目标 || 下标 === 当前) return;
      e.preventDefault();
      落点(目标).focus();
    };

    const 容器 = ref.current;
    if (!容器) return;
    容器.addEventListener("keydown", onKey);
    return () => 容器.removeEventListener("keydown", onKey);
    // 依赖里只有 ref 本身（`useRef` 的身份终身不变）：监听装一次就够，
    // 页签的增删走的是 DOM 查询，每次按键现查，不需要重挂。
  }, [ref]);
}
