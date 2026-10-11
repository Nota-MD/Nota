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
 * | 边界**夹住**（`夹右栏宽`） | 拖成 0 宽等于把这一栏弄丢了，而丢的方式是"看不见"，用户找不回来 |
 * | `setPointerCapture` ＋ `pointercancel` 也收尾 | 不捕获，指针一快就滑出这 6px；不认 `pointercancel`，中途被系统抢走指针那次拖动**永远收不了尾** |
 *
 * ⚠️ **右边那条边从哪里量**：把手是这个 `<aside>` 的最后一个子元素，所以它的
 * `parentElement.getBoundingClientRect().right` 就是这一栏的右缘（随窗口、随界面
 * 缩放变，写死不得）。按下那一刻**量一次**就够——拖动期间动的是左缘。
 */

import { useRef } from "react";

import { useT } from "@/i18n";

/** 出厂的宽度。与 `theme/base.css` 的 `--dock-width`、Rust 那份默认值是同一个数。 */
export const 右栏宽默认 = 260;
/** 再窄就装不下一行插件文案了（那里面还有 12px 的内边距）。 */
export const 右栏宽最小 = 200;
/** 再宽正文就得让位（1300px 的窗口减掉侧栏之后只剩一半）。 */
export const 右栏宽最大 = 560;

/**
 * 把量出来的宽度夹进合法区间。**纯函数，单独摆出来是为了能测**——
 * `tests/dock-resize.test.ts` 盖的就是它（拖动本身要开窗）。
 */
export function 夹右栏宽(宽: number): number {
  // ⚠️ 先把不是数的挡掉：`Math.min/max` 遇到 `NaN` 会安静地返回 `NaN`，
  // 而 `NaN` 写进 CSS 变量等于那一格失效 → 退回 CSS 里那个 260，
  // 看着像"拖动没生效"，不像报错（同 `SidebarResizer.夹侧栏宽`）。
  if (!Number.isFinite(宽)) return 右栏宽默认;
  return Math.min(右栏宽最大, Math.max(右栏宽最小, Math.round(宽)));
}

/** 那条把手。**渲染在 `.plugin-dock` 内部、作为它最后一个子元素**（理由见文件头）。 */
export function DockResizer({ onCommit }: { onCommit: (宽: number) => void }) {
  const t = useT();
  const 最后 = useRef(右栏宽默认);

  function 按下(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const 把手 = e.currentTarget;
    把手.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-col");
    const 框 = 把手.parentElement?.getBoundingClientRect();
    const 右缘 = 框?.right ?? window.innerWidth;
    最后.current = 夹右栏宽(框?.width ?? 右栏宽默认);

    function 挪(ev: PointerEvent) {
      const 宽 = 夹右栏宽(右缘 - ev.clientX);
      最后.current = 宽;
      document.documentElement.style.setProperty("--dock-width", `${宽}px`);
    }

    function 收() {
      把手.removeEventListener("pointermove", 挪);
      把手.removeEventListener("pointerup", 收);
      把手.removeEventListener("pointercancel", 收);
      document.body.classList.remove("resizing-col");
      onCommit(最后.current);
    }

    把手.addEventListener("pointermove", 挪);
    把手.addEventListener("pointerup", 收);
    把手.addEventListener("pointercancel", 收);
  }

  return (
    <div
      className="dock-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("Resize the extension dock")}
      onPointerDown={按下}
    />
  );
}
