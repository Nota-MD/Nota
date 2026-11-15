/**
 * 右侧插件栏**左缘那条可以拖的把手**（2026-10-11，用户：「拓展菜单左侧也可以拖动」）。
 *
 * ⚠️ 与 `ui/SidebarResizer.tsx` 是**一对**，不是抄一份了事：两条边的方向相反
 * （侧栏拖右缘 = 指针.x − 左缘；拓展栏拖左缘 = **右缘 − 指针.x**），但三条规矩
 * 完全一样，抄的时候**别改这三条**：
 *
 * | 规矩 | 为什么 |
 * |---|---|
 * | 拖动期间**直接写 `<html>` 的 `--dock-width`**，松手才 `onCommit` 落盘 | 每挪一像素派一次 `updateSettings` 会把设置文件写穿，而且中途那些值都要作废 |
 * | 越过最小宽度立即折叠，最大处夹住 | 用户不必先松手；折叠后仍有工具栏开关与菜单入口 |
 * | `setPointerCapture` ＋ `pointercancel` 也收尾 | 不捕获，指针一快就滑出这 6px；不认 `pointercancel`，中途被系统抢走指针那次拖动**永远收不了尾** |
 *
 * ⚠️ **右边那条边从哪里量**：把手是这个 `<aside>` 的最后一个子元素，所以它的
 * `parentElement.getBoundingClientRect().right` 就是这一栏的右缘（随窗口、随界面
 * 缩放变，写死不得）。按下那一刻**量一次**就够——拖动期间动的是左缘。
 */

import { useRef } from "react";

import { useT } from "@/i18n";

/** 出厂的宽度。与 `theme/base.css` 的 `--dock-width`、Rust 那份默认值是同一个数。 */
export const rightBarWidthDefault = 260;
/** 再窄就装不下一行插件文案了（那里面还有 12px 的内边距）。 */
export const rightBarWidthMostSmall = 200;
/** 再宽正文就得让位（1300px 的窗口减掉侧栏之后只剩一半）。 */
export const rightBarWidthMostLarge = 560;

/**
 * 把量出来的宽度夹进合法区间。**纯函数，单独摆出来是为了能测**——
 * `tests/dock-resize.test.ts` 盖的就是它（拖动本身要开窗）。
 */
export function clampRightBarWidth(width: number): number {
  // ⚠️ 先把不是数的挡掉：`Math.min/max` 遇到 `NaN` 会安静地返回 `NaN`，
  // 而 `NaN` 写进 CSS 变量等于那一格失效 → 退回 CSS 里那个 260，
  // 看着像"拖动没生效"，不像报错（同 `SidebarResizer.夹侧栏宽`）。
  if (!Number.isFinite(width)) return rightBarWidthDefault;
  return Math.min(rightBarWidthMostLarge, Math.max(rightBarWidthMostSmall, Math.round(width)));
}

/** Whether dragging has crossed the collapse threshold at the right edge. */
export function shouldCollapseRightBar(width: number, canCollapse: boolean): boolean {
  return canCollapse && Number.isFinite(width) && width < rightBarWidthMostSmall;
}

/** 那条把手。**渲染在 `.plugin-dock` 内部、作为它最后一个子元素**（理由见文件头）。 */
export function DockResizer({
  onCommit,
  onCollapse,
}: {
  onCommit: (width: number) => void;
  onCollapse?: () => void;
}) {
  const t = useT();
  const mostAfter = useRef(rightBarWidthDefault);

  function pressBelow(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const takeHand = e.currentTarget;
    takeHand.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-col");
    const box2 = takeHand.parentElement?.getBoundingClientRect();
    const rightEdge = box2?.right ?? window.innerWidth;
    const previousWidth = clampRightBarWidth(box2?.width ?? rightBarWidthDefault);
    mostAfter.current = previousWidth;
    let collapseArmed = false;

    function move(ev: PointerEvent) {
      const rawWidth = rightEdge - ev.clientX;
      collapseArmed = shouldCollapseRightBar(rawWidth, Boolean(onCollapse));
      document.body.classList.toggle("dock-collapse-armed", collapseArmed);
      const width = clampRightBarWidth(rawWidth);
      mostAfter.current = width;
      document.documentElement.style.setProperty("--dock-width", `${width}px`);
    }

    function receive(commit: boolean) {
      takeHand.removeEventListener("pointermove", move);
      takeHand.removeEventListener("pointerup", finish);
      takeHand.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("resizing-col");
      document.body.classList.remove("dock-collapse-armed");
      if (commit && collapseArmed) {
        document.documentElement.style.setProperty("--dock-width", `${previousWidth}px`);
        onCollapse?.();
      } else if (commit) {
        onCommit(mostAfter.current);
      } else {
        document.documentElement.style.setProperty("--dock-width", `${previousWidth}px`);
      }
    }
    const finish = () => receive(true);
    const cancel = () => receive(false);

    takeHand.addEventListener("pointermove", move);
    takeHand.addEventListener("pointerup", finish);
    takeHand.addEventListener("pointercancel", cancel);
  }

  return (
    <div
      className="dock-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("Resize the extension dock")}
      onPointerDown={pressBelow}
    />
  );
}
