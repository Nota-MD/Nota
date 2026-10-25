/**
 * **"这一发 `scroll` 是弹层自己在滚"**（2026-10-11 加，用户报的缺陷的修法）。
 *
 * # 它修的是什么
 *
 * 用户原话：「选择拼写检查语言的列表**无法下滑**，一下滑就直接消失，焦点返回工作区」。
 *
 * 根因不是那个列表不能滚（它能，`.menu-popup` 自己就是滚动容器：
 * `overflow-y: auto`），而是**三处"弹层开着时滚一下就关掉"的监听听不出"谁在滚"**：
 *
 * ```ts
 * window.addEventListener("scroll", 关菜单, true);   // ← 捕获相，什么都收
 * ```
 *
 * 那条规矩本身是对的（`fixed` 定位的弹层与它指着的那个东西脱节之后就会**指错人**，
 * 见 `ui/TabBar.tsx` 那段），但它**没把自己也算出去**：用户在菜单里往下拨滚轮 →
 * 滚的是菜单内部 → 同一个 `scroll` 事件照样冒到 `window` 的捕获相 → 菜单当场关掉、
 * 焦点掉回正文。⚠️ 从前看不出来，是因为那些菜单里**没有一个能滚**；2026-10-11 加上
 * 那一长列语言之后才露出来。
 *
 * # 判据
 *
 * 看 `event.target`（`scroll` 事件的目标就是**那个正在滚的元素**）是不是弹层这一族
 * 里面的。三族的类名/标记各不相同，都是既有的、各有来历的：
 *
 * | 选择器 | 是谁 |
 * |---|---|
 * | `.menu-popup` | 菜单栏那一层、状态栏那两个小菜单 |
 * | `.menu-sub` | `MenuPopup` 飞出来的子菜单（portal 到 `body`） |
 * | `[data-context-menu]` | 右键菜单那一套浮层的统一标记（本体与 portal 出去的子菜单各挂一个） |
 *
 * ⚠️ **不按"是不是 `window`"来判**：文档级滚动的事件目标是 `document`，
 * 而它是**没有** `closest` 的——那种情况要照旧关掉菜单（正文滚了，右键菜单确实
 * 指错了地方）。所以这里是"**能在某个弹层里找到祖先**才算放行"。
 */

/** 弹层这一族的三个标记。⚠️ 加新的一族时**必须**也加到这里，否则新弹层里的滚动又会把菜单关掉。 */
const popupSelectChooseDevice = ".menu-popup, .menu-sub, [data-context-menu]";

/**
 * 这一发 `scroll` 是不是出自弹层内部？
 *
 * ⚠️ 参数收 `EventTarget | null` 而不是 `Element`：`scroll` 的目标可能是
 * `document`（没有 `closest`），调用方不必自己判两次。
 */
export function popupSelfSelfAtRoll(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.closest(popupSelectChooseDevice) !== null;
}
