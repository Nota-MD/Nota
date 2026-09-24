/**
 * 一层菜单弹层，以及它飞出来的子菜单。
 *
 * 从 `MenuBar.tsx` 拆出来的：菜单栏负责"哪一栏开着"，这里负责"开着的那一栏
 * 里有什么、怎么走"。两者共用的只有 `disabled` / `checks` 两张表。
 *
 * # 只支持**一层**子菜单
 *
 * 这不是省事。VMark 那边最深也就是一层（`insert_submenus` / `format_submenus`
 * 都是往平面菜单里塞一层飞出），Typora 也一样。两层以上在桌面软件里几乎见不到，
 * 因为鼠标要走的对角线越来越长、越容易半路误触别的项。
 * 真要加第二层时，这里的 `submenu` 分支要改成递归——**但先想清楚是不是
 * 该把那一组条目拆成两个平面菜单**。
 *
 * # 子菜单为什么走 portal ＋ `position: fixed`
 *
 * 因为父弹层要能滚（菜单太长时 `overflow-y: auto`），而 **CSS 里一个轴设成
 * `auto`，另一个轴的 `visible` 会被算成 `auto`**——子菜单一飞出弹层右边缘
 * 就被裁掉，症状是只剩一条几像素的竖条。`fixed` 到视口上才不受滚动容器裁剪，
 * 但那样坐标就得**自己量**（`subAnchor` 那段），CSS 再也说不出"在父项右边"。
 * portal 到 `body` 是为了顺带躲开弹层那条 `transform` 动画——动画期间它会
 * 变成 `fixed` 后代的包含块，又把人拽回裁剪里。**两个坑都踩过。**
 *
 * # 方向键的归属
 *
 * `←` `→` 的去向是这一层和外面**约定好**的，不靠事件冒泡：
 *
 * | 在哪 | `→` | `←` |
 * |---|---|---|
 * | 主弹层，该项**有**子菜单 | 展开子菜单 | 切到左边那一栏 |
 * | 主弹层，该项**没有**子菜单 | 切到右边那一栏 | 切到左边那一栏 |
 * | 子菜单里 | 什么都不做（吞掉） | 收起子菜单，焦点还回父项 |
 *
 * ⚠️ 为什么不靠冒泡：子菜单是套在父弹层里的（改 portal 之前），两层的
 * `onKeyDown` 都会收到同一个按键。子菜单里按 `←` 要是让它冒上去，父层会
 * **再处理一遍**、顺手把整个菜单切到左边那一栏。所以每一层都把键**吃完**
 * （`stopPropagation`，见 `useMenuRovingFocus` 里 `handled()` 那段），
 * 主弹层该切栏时直接**回调** `onArrowOut`，链路是显式的。
 */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatAccel } from "@/ui/accel";
import { isMenuItem, type MenuEntry, type MenuItemSpec } from "@/ui/commands";
import { useMenuRovingFocus } from "@/ui/useMenuRovingFocus";

/**
 * 一栏菜单**摊平**成渲染行：分隔线一行，真条目一行。
 *
 * ⚠️ 为什么要先摊平，而不是"渲染时再看下标"：漫游焦点只认**真条目**
 * （分隔线不是落点），所以渲染用的下标和漫游用的下标**不是一回事**。
 * 早先的写法是渲染时按条目下标去查一张对照表，那张表在
 * `noUncheckedIndexedAccess` 下每一项都是 `number | undefined`，
 * 于是每一处都得再判一次空——判空写多了总会漏一处。
 * 摊平之后每条渲染行**自带**自己的漫游下标（`row`），查表这一步根本不存在。
 */
type Line =
  | { kind: "sep"; key: string }
  | { kind: "item"; entry: MenuItemSpec; row: number };

interface Layout {
  /** 按渲染顺序，含分隔线。 */
  lines: Line[];
  /** 真条目。**漫游焦点用的就是这一份**，下标与 `Line.row` 对齐。 */
  items: MenuItemSpec[];
}

function layout(entries: readonly MenuEntry[]): Layout {
  const lines: Line[] = [];
  const items: MenuItemSpec[] = [];
  entries.forEach((entry, i) => {
    if (!isMenuItem(entry)) {
      // ⚠️ 分隔线的 key 用下标：它没有 id，而它在同一栏里位置是稳定的。
      lines.push({ kind: "sep", key: `sep-${i}` });
      return;
    }
    lines.push({ kind: "item", entry, row: items.length });
    items.push(entry);
  });
  return { lines, items };
}

interface PopupProps {
  /** 这一栏的条目（**含**分隔线 `"sep"`）。 */
  entries: MenuEntry[];
  /** 当前用不了的命令 id。 */
  disabled: Set<string>;
  /** 可勾选项的状态，键是命令 id。 */
  checks: Record<string, boolean>;
  /** 选中一条真命令。子菜单父项**不会**走到这里（它只负责展开）。 */
  onPick: (id: string) => void;
  /** 关掉**整个**菜单链（Esc / Tab）。焦点还给谁由 `MenuBar` 决定。 */
  onDismiss: () => void;
  /** `←` `→` 走出了这一层：交给菜单栏切上/下一栏。1 向右，-1 向左。 */
  onArrowOut: (dir: 1 | -1) => void;
  /** `aria-label`。 */
  label: string;
}

export function MenuPopup(props: PopupProps) {
  const { entries, disabled, checks, onPick, onDismiss, onArrowOut, label } = props;

  const { lines, items } = useMemo(() => layout(entries), [entries]);

  // 哪一项的子菜单开着（漫游下标）。`null` = 没开。
  const [subOpen, setSubOpen] = useState<number | null>(null);
  // 那一层飞出的位置（视口坐标）。和 `subOpen` 同生共死。
  const [subAnchor, setSubAnchor] = useState<{ top: number; left: number } | null>(null);

  // 父项的 DOM 节点。漫游钩子内部也存了一份，但那份不外借——
  // 展开子菜单时要拿它量坐标，所以这里自己再记一份。
  const rowRefs = useRef<Array<HTMLElement | null>>([]);

  const roving = useMenuRovingFocus<{ disabled?: boolean }>({
    items: items.map((it) => ({ disabled: disabled.has(it.id) })),
    onActivate: (_item, index) => {
      const entry = items[index];
      if (!entry) return;
      if (entry.submenu) {
        // 有子菜单的项：回车是"展开"，不是"执行"。而且**开着就收起**——
        // 桌面软件里回车在这一项上是切换，不是只能打开。
        if (subOpen === index) closeSub(index);
        else openSub(index);
        return;
      }
      if (!disabled.has(entry.id)) onPick(entry.id);
    },
    onDismiss,
    onRight: (_item, index) => {
      const entry = items[index];
      if (entry?.submenu) {
        openSub(index);
        return;
      }
      // 这一项没有下一层，那就"往右走出这一栏"。
      onArrowOut(1);
    },
    onLeft: () => onArrowOut(-1),
  });

  const { itemProps, registerItem } = roving;

  /** 登记父项按钮。**必须转一手**，不能把 `registerItem` 直接挂上去。 */
  const registerRow = (row: number, node: HTMLElement | null) => {
    rowRefs.current[row] = node;
    registerItem(row, node);
  };

  /** 展开第 `row` 项的子菜单，并记下它**右边沿**的坐标。 */
  function openSub(row: number) {
    const el = rowRefs.current[row];
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 左边缘**减去 4px 叠到父项上**，中间不留缝——留缝的话鼠标从父项移到
    // 子菜单的路上会经过一条"谁都不属于"的带子，鼠标一进那条带子
    // 父项就不是 hover 了，菜单自己关掉。
    setSubAnchor({ top: r.top, left: r.right - 4 });
    setSubOpen(row);
  }

  /** 收起子菜单，**并把焦点还给父项**。 */
  function closeSub(row: number) {
    setSubOpen(null);
    setSubAnchor(null);
    // ⚠️ 用 `focusItem` 不是 `setFocusedIndex`——按 `→` 展开子菜单之前，
    // 焦点本来就停在这个父项上，`setFocusedIndex(row)` 是个空操作
    // （值没变 → 不重渲染 → 重聚焦的 effect 不跑），于是"还回来"这一步
    // 什么都没做，焦点掉到 `<body>`，父菜单的 Esc 跟着失灵。踩过。
    roving.focusItem(row);
  }

  return (
    <div className="menu-popup" role="menu" aria-label={label} onKeyDown={roving.handleKeyDown}>
      {lines.map((line) => {
        if (line.kind === "sep") {
          return <div className="menu-sep" key={line.key} role="separator" />;
        }

        const { entry, row } = line;
        const isSubOpen = subOpen === row;
        const p = itemProps(row);

        return (
          <div className="menu-item-root" key={entry.id}>
            <button
              type="button"
              role="menuitem"
              className={`menu-item ${entry.danger ? "menu-item-danger" : ""} ${
                isSubOpen ? "menu-item-open" : ""
              }`}
              // ⚠️ 用 `disabled` 而不是"点了不做事"：灰掉的项要**看得出**灰，
              // 也要让键盘跳过去时不落在它上面。
              disabled={disabled.has(entry.id)}
              aria-checked={entry.checkable ? !!checks[entry.id] : undefined}
              aria-haspopup={entry.submenu ? "menu" : undefined}
              aria-expanded={entry.submenu ? isSubOpen : undefined}
              tabIndex={p.tabIndex}
              ref={(n) => registerRow(row, n)}
              onFocus={p.onFocus}
              onMouseEnter={() => {
                // 鼠标划过：焦点跟过去，并按有没有子菜单决定开还是收。
                p.onMouseEnter();
                if (entry.submenu) openSub(row);
                else setSubOpen(null);
              }}
              onClick={() => {
                if (entry.submenu) {
                  if (isSubOpen) closeSub(row);
                  else openSub(row);
                  return;
                }
                onPick(entry.id);
              }}
            >
              <span className="menu-check">{entry.checkable && checks[entry.id] ? "✓" : ""}</span>
              <span className="menu-label">{entry.label}</span>
              {/* ⚠️ 走 `formatAccel`：macOS 上要显示成 `⇧⌘S` 而不是 `Ctrl+Shift+S`，
                  那边按 Control 是不会响应的。见 `ui/accel.ts`。 */}
              {entry.accel && <span className="menu-accel">{formatAccel(entry.accel)}</span>}
              {/* 没子菜单的项也占这个宽度——不然同一列里有箭头和没箭头的
                  文字右边缘会参差不齐。 */}
              <span className="menu-arrow">{entry.submenu ? "▸" : ""}</span>
            </button>

            {entry.submenu &&
              isSubOpen &&
              subAnchor &&
              createPortal(
                <SubMenu
                  entries={entry.submenu}
                  disabled={disabled}
                  checks={checks}
                  onPick={onPick}
                  onDismiss={onDismiss}
                  onClose={() => closeSub(row)}
                  anchor={subAnchor}
                />,
                document.body,
              )}
          </div>
        );
      })}
    </div>
  );
}

interface SubMenuProps {
  entries: MenuEntry[];
  disabled: Set<string>;
  checks: Record<string, boolean>;
  onPick: (id: string) => void;
  onDismiss: () => void;
  onClose: () => void;
  /** 父项右边沿的位置（视口坐标），来自 `MenuPopup`。 */
  anchor: { top: number; left: number };
}

/** 子菜单。**不支持再往下开一层**（见文件头）。 */
function SubMenu(props: SubMenuProps) {
  const { entries, disabled, checks, onPick, onDismiss, onClose, anchor } = props;

  const { lines, items } = useMemo(() => layout(entries), [entries]);

  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(anchor);

  // 量一下自己多高多宽，再把位置**夹**回视口里：底下放不下就往上提，
  // 右边放不下就往左挪。
  // ⚠️ 必须**量**，不能在 TS 里按"行数 × 行高"算：行高是 CSS 说了算的
  // （跟着界面风格的 `--control-height` 走），算一份等于把同一个数字存两处，
  // 换个风格就错位，而且错得很隐蔽——只有靠边的菜单才看得出来。
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const top = Math.max(8, Math.min(anchor.top, window.innerHeight - el.offsetHeight - 8));
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - el.offsetWidth - 8));
    setPos({ top, left });
  }, [anchor]);

  const roving = useMenuRovingFocus<{ disabled?: boolean }>({
    items: items.map((it) => ({ disabled: disabled.has(it.id) })),
    onActivate: (_item, index) => {
      const entry = items[index];
      if (entry && !disabled.has(entry.id)) onPick(entry.id);
    },
    // Esc / Tab 关掉的是**整条链**，不是只收这一层——这是桌面软件的惯例，
    // 也是"按了 Esc 就一定能回到正文"的保证。
    onDismiss,
    // 一层到顶了：`→` **什么都不做**（空函数就是"吞掉"），`←` 收起自己。
    onRight: () => {},
    onLeft: onClose,
  });

  const { itemProps, registerItem } = roving;

  return (
    <div
      ref={boxRef}
      className="menu-sub"
      role="menu"
      style={{ top: pos.top, left: pos.left }}
      onKeyDown={roving.handleKeyDown}
    >
      {lines.map((line) => {
        if (line.kind === "sep") {
          return <div className="menu-sep" key={line.key} role="separator" />;
        }
        const { entry, row } = line;
        const p = itemProps(row);

        return (
          <button
            type="button"
            role="menuitem"
            className={`menu-item ${entry.danger ? "menu-item-danger" : ""}`}
            key={entry.id}
            disabled={disabled.has(entry.id)}
            aria-checked={entry.checkable ? !!checks[entry.id] : undefined}
            tabIndex={p.tabIndex}
            ref={(n) => registerItem(row, n)}
            onFocus={p.onFocus}
            onMouseEnter={p.onMouseEnter}
            onClick={() => {
              if (!disabled.has(entry.id)) onPick(entry.id);
            }}
          >
            <span className="menu-check">{entry.checkable && checks[entry.id] ? "✓" : ""}</span>
            <span className="menu-label">{entry.label}</span>
            {entry.accel && <span className="menu-accel">{formatAccel(entry.accel)}</span>}
          </button>
        );
      })}
    </div>
  );
}
