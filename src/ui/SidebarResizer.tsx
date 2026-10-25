/**
 * 侧栏右缘那条**可以拖的把手**（2026-09-30，用户照 Typora 点名：
 * 「侧边栏右侧可以自由拖动」）。
 *
 * # 它改的是哪个数
 *
 * `--sidebar-width`（`styles/theme/base.css` 里那条，出厂 240px），
 * `.sidebar` 的宽度就是它。**不是**另一个平行字段：拖完要跟设置里那个数
 * 是同一个，否则"拖了、重开又回来"和"设置里改不动"会同时出现。
 *
 * ⚠️ **拖动过程中直接写 `<html>` 上那条变量**（`documentElement.style`），
 * **松手才落盘**（`Settings.appearance.sidebar_width`）。这是 `ui/useZoom.ts`
 * 立下的先例（Ctrl+滚轮改字号那一档：`applyTheme` 负责"设置值 → CSS 变量"，
 * 拖动/滚轮期间再亲手写一遍同一个变量）。反过来的做法——每挪一像素派一次
 * `updateSettings`——会把设置文件写穿，而且中途那些值都是要作废的。
 *
 * # 为什么在**父元素**上量左边
 *
 * 宽度是 `指针.x − 这一栏的左缘`，而"这一栏的左缘"只有现场量得准：它随窗口
 * 变化、随缩放变化，写死一个数字（比如 0）在窗口有边距时就偏。所以把手
 * **渲染在 `.sidebar` 里**（它是最后一个子元素），量 `offsetParent` 的
 * `getBoundingClientRect().left`。⚠️ 因此 `.sidebar` 必须是
 * `position: relative`（`styles/sidebar.css` 里那一行就是为它加的）。
 *
 * # 三条边界
 *
 * | 事 | 怎么办 | 为什么 |
 * |---|---|---|
 * | 拖到比最小还窄 / 比最大还宽 | **夹住**（`夹侧栏宽`） | 拖成 0 宽等于把侧栏弄丢了，而丢的方式是"看不见"，用户找不回来 |
 * | 拖动期间松开鼠标 | `pointerup` / `pointercancel` 都收尾（`onCommit` 照发） | 只认 `pointerup` 的话，中途被系统抢走指针（切窗口、弹菜单）那次拖动**永远收不了尾**：变量留着、光标还钉在 `col-resize` |
 * | 拖动期间选中正文 | `setPointerCapture` ＋ `user-select: none` | 不捕获的话指针一快就滑出这 6px 的把手，拖动当场断掉；不关选中的话整屏文字会被拖蓝 |
 *
 * ⚠️ **只做这一条边**：右侧插件栏（`ui/PluginDock.tsx`）的宽度还是死的。
 * 用户点名的是侧边栏；把两栏一起做要先回答"两栏加起来超过窗口宽怎么办"，
 * 而那个问题现在还没有答案。
 */

import { useRef } from "react";

import { useT } from "@/i18n";

/** 出厂的宽度。与 `theme/base.css` 的 `--sidebar-width`、Rust 那份默认值是同一个数。 */
export const sideBarWidthDefault = 240;
/** 让它至少装得下一行文件名，再窄就只剩省略号了。 */
export const sideBarWidthMostSmall = 180;
/** 再宽正文就没地方了（1300px 的窗口减掉它只剩一半）。 */
export const sideBarWidthMostLarge = 480;

/**
 * 把量出来的宽度夹进合法区间。**纯函数，单独摆出来是为了能测**——
 * `tests/sidebar-resize.test.ts` 盖的就是它（拖动本身要开窗，见 `docs/06` §5.40）。
 */
export function clampSidebarWidth(width: number): number {
  // ⚠️ 先把不是数的挡掉：`Math.min/max` 遇到 `NaN` 会安静地返回 `NaN`，
  // 而 `NaN` 写进 CSS 变量等于那一格失效 → 侧栏退回 CSS 里那个 240，
  // 看着像"拖动没生效"，不像报错。
  if (!Number.isFinite(width)) return sideBarWidthDefault;
  return Math.min(sideBarWidthMostLarge, Math.max(sideBarWidthMostSmall, Math.round(width)));
}

/**
 * 那条把手。**渲染在 `.sidebar` 内部、作为它最后一个子元素**（理由见文件头）。
 */
export function SidebarResizer({ onCommit }: { onCommit: (width: number) => void }) {
  const t = useT();
  // 本次拖动最后落在哪个数上。**放在 ref 里不是为了省一次渲染**，是因为
  // `pointerup` 那次回调要读它，而回调闭包捕获的是**按下那一刻**的值。
  const mostAfter = useRef(sideBarWidthDefault);

  function pressBelow(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault(); // 别让它顺带选中点什么
    const takeHand = e.currentTarget;
    takeHand.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-col");
    // ⚠️ 左边**在按下这一刻量一次就够**：拖动期间这一栏的左缘不会动
    //（动的只有右缘，也就是正在拖的这条）。每次 move 都量要强制一次布局。
    const box2 = takeHand.parentElement?.getBoundingClientRect();
    const leftEdge = box2?.left ?? 0;
    mostAfter.current = clampSidebarWidth(box2?.width ?? sideBarWidthDefault);

    function move(ev: PointerEvent) {
      const width = clampSidebarWidth(ev.clientX - leftEdge);
      mostAfter.current = width;
      document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
    }

    function receive() {
      takeHand.removeEventListener("pointermove", move);
      takeHand.removeEventListener("pointerup", receive);
      takeHand.removeEventListener("pointercancel", receive);
      document.body.classList.remove("resizing-col");
      onCommit(mostAfter.current);
    }

    takeHand.addEventListener("pointermove", move);
    takeHand.addEventListener("pointerup", receive);
    takeHand.addEventListener("pointercancel", receive);
  }

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      // 读屏用户看不到宽度，也没有键盘拖动这条路——所以把"这是干什么的"
      // 说清楚，别只说"分隔条"。
      aria-label={t("Resize the sidebar")}
      onPointerDown={pressBelow}
    />
  );
}
