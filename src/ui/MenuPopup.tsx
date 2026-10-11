/**
 * 一层菜单弹层，以及它飞出来的子菜单。
 *
 * 从 `MenuBar.tsx` 拆出来的：菜单栏负责"哪一栏开着"，这里负责"开着的那一栏
 * 里有什么、怎么走"。两者共用的只有 `disabled` / `checks` 两张表。
 *
 * # 只支持**一层**子菜单
 *
 * 两层以上在桌面软件里几乎见不到——鼠标要走的对角线越来越长、
 * 越容易半路误触别的项。真要加第二层时，这里的 `submenu` 分支要改成递归
 * ——**但先想清楚是不是该把那一组条目拆成两个平面菜单**。
 *
 * # 父项有两条打开路径，而它们会撞在一起（BUG-17）
 *
 * 带子菜单的父项，**划过**就展开、**点一下**也是展开。麻烦在于鼠标点下去之前
 * 一定先划过——所以"点"那一刻看到的永远是"它已经开着"。早先的写法是
 * "开着就收起"（`onActivate` 那套切换语义），于是用户的第一下点击**把刚划开的
 * 那个收掉了**：弹层闪一下、什么都没发生，得点第二下。修法是记下"这个子菜单是
 * 谁开的"（`点开的` 那个 ref），只有点开的才被点击收起；划过开的，那一击算
 * **确认**。⚠️ 教训：**"状态是开的"和"这个状态是用户点出来的"不是一回事**，
 * 凡是"划过/点"两条路都能设置同一个状态的地方，都要问一句"那点的第一下呢"。
 *
 * # 子菜单为什么走 portal ＋ `position: fixed`
 *
 * 因为父弹层要能滚（菜单太长时 `overflow-y: auto`），而 **CSS 里一个轴设成
 * `auto`，另一个轴的 `visible` 会被算成 `auto`**——子菜单一飞出弹层右边缘
 * 就被裁掉，症状是只剩一条几像素的竖条。`fixed` 到视口上才不受滚动容器裁剪，
 * 但那样坐标就得**自己量**（`subAnchor` 那段），CSS 再也说不出"在父项右边"。
 * portal 到 `body` 是为了顺带躲开弹层那条 `transform` 动画——动画期间它会
 * 变成 `fixed` 后代的包含块，又把人拽回裁剪里。**这两个裁剪问题都实际发生过。**
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
 * **再处理一遍**、一并把整个菜单切到左边那一栏。所以每一层都把键**吃完**
 * （`stopPropagation`，见 `useMenuRovingFocus` 里 `handled()` 那段），
 * 主弹层该切栏时直接**回调** `onArrowOut`，链路是显式的。
 */

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useT } from "@/i18n";
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
  /**
   * 顶上那一行小标题（**可选**，目前只有状态栏那个「字数统计」菜单用）。
   *
   * ⚠️ 它是**键**（英文原文），由这一层翻——与 `entry.label` 同一条规矩
   * （菜单栏那一套的键在 `ui/commands.ts`，理由见 `MenuBar.tsx::useT`）。
   *
   * ⚠️ 它**不是条目**：不占漫游下标、点不动、也不参与 `disabled` / `checks`。
   * 别把它做成"能点的第一条"——那会让下面每个 `row` 都错开一位。
   */
  heading?: string;
  /**
   * 弹层最顶上要画的那一块（**可选**，2026-10-11 加）。
   *
   * ⚠️ 目前只有状态栏那个「选择拼写检查语言」菜单用它——用户贴的 Typora 截图里，
   * 最上面那个圆角框**不是标题、是搜索框**（他在收尾时又点名：「上面还应该有个
   * 搜索框」）。所以这一格收的是**一颗现成的 React 元素**：`MenuPopup` 不认识
   * "搜索"这件事，它只负责"顶上留一块地方"。
   *
   * ⚠️ 它**不是条目**（不占漫游下标、上下键走不到），与 `heading` 同一类。
   * ⚠️ 所以那一块里**不能只放一个输入框就完事**：键盘用户得有路走进下面的列表
   * （那一层由调用方负责，见 `ui/SpellMenu.tsx` 里输入框上那条 `onKeyDown`）。
   */
  top?: ReactNode;
  /**
   * **最后一条真条目钉在这一层底部**（`position: sticky`）。
   *
   * ⚠️ 2026-10-11 加，用它的目前只有状态栏那个「选择拼写检查语言」菜单：
   * 用户贴的 Typora 截图里，语言那一长列**滚动**而底下那条「全局设置…」
   * **一直看得见**——菜单开在窗口右下角，长列表里最下面那一条不给钉住就等于
   * 藏着。
   *
   * ⚠️ **它仍然是一条正常条目**（占漫游下标、能点、能勾）：钉住的只是**画法**。
   * 早先想过把"出口"做成 `heading` 那样的非条目——那样键盘用户就走不到它了
   * （漫游只认条目），而"菜单里有一条键盘到不了的出口"比"它跟着列表滚"
   * 坏得多。
   */
  stickyLast?: boolean;
}

export function MenuPopup(props: PopupProps) {
  const { entries, disabled, checks, onPick, onDismiss, onArrowOut, label, heading, top, stickyLast } =
    props;

  // ⚠️ 条目文字**在这里才翻**：`ui/commands.ts` 那张表里存的是**键**（英文原文）。
  // 规矩与理由写在 `ui/MenuBar.tsx::useT` 那一段，`SubMenu` 那边同样要一份。
  const t = useT();

  const { lines, items } = useMemo(() => layout(entries), [entries]);

  // 哪一项的子菜单开着（漫游下标）。`null` = 没开。
  const [subOpen, setSubOpen] = useState<number | null>(null);
  // 那一层飞出的位置（视口坐标）。和 `subOpen` 同生共死。
  const [subAnchor, setSubAnchor] = useState<{ top: number; left: number } | null>(null);

  /**
   * 现在开着的子菜单是**点父项开的**（记下标），还是**鼠标划过父项开的**（`null`）。
   *
   * ⚠️ 这一格是 BUG-17 的修法，**不是可有可无的状态**。父项有两条打开路径
   * （`onMouseEnter` 和 `onClick`），而鼠标点下去之前**一定先划过**——于是
   * "点一下"看到的是"它已经开着"，如果这一下按的是无脑切换，就会把刚刚划开的
   * 那个**收掉**：用户看到弹层闪一下、以为没反应，得再点一次才开。
   * 实测（2026-09-25，无头 X）：停在同一行上，划过时子菜单在、单击一次后
   * 整块消失（两帧差 **43068.9 px**）。
   *
   * 判据因此是**"是谁开的"**：划过开的，点一下是**确认**（保持开着，并记成
   * 点开的）；点开的，再点一下才收起。桌面软件就是这个手感——鼠标划开子菜单
   * 之后，点父项不会把它关掉。
   */
  const 点开的 = useRef<number | null>(null);

  // 父项的 DOM 节点。漫游钩子内部也存了一份，但那份不外借——
  // 展开子菜单时要拿它量坐标，所以这里自己再记一份。
  const rowRefs = useRef<Array<HTMLElement | null>>([]);

  const roving = useMenuRovingFocus<{ disabled?: boolean }>({
    items: items.map((it) => ({ disabled: disabled.has(it.id) })),
    // ⚠️⚠️ **顶上有 `top` 那一块时不播种焦点**（2026-10-11）：`top` 装的是搜索框，
    // 而"开菜单就把焦点按到第一条条目上"这条规矩会把用户刚打的第一个字送进条目
    // （2026-10-11 实测两轮：effect 里 `focus()`、下一帧再 `focus()` 一次，**都抢不过
    // 那个 layout 阶段播种的焦点**，症状是"搜索框里一个字符都没有、字也没进正文"）。
    // 所以从**源头**上不播种：`enabled: false` 时那个钩子只把落点清成 -1、不碰 DOM。
    // ⚠️ 键盘不会因此走不通：`top` 那一块的调用方（`ui/SpellMenu.tsx`）自己在输入框上
    // 接了 ↑↓ → 把焦点交给第一颗按钮，而那之后整个漫游照旧。
    enabled: !top,
    onActivate: (_item, index) => {
      const entry = items[index];
      if (!entry) return;
      if (entry.submenu) {
        // 有子菜单的项：回车是"展开"，不是"执行"。而且**开着就收起**——
        // 桌面软件里回车在这一项上是切换，不是只能打开。
        // ⚠️ 键盘这条路**不做**"谁开的"那个区分（鼠标才需要）：Enter 是明确的
        // 一次操作，不存在"划过"这个前因，所以记成"键"——点开的只认鼠标那一下。
        if (subOpen === index) closeSub(index);
        else openSub(index, "键");
        return;
      }
      if (!disabled.has(entry.id)) onPick(entry.id);
    },
    onDismiss,
    onRight: (_item, index) => {
      const entry = items[index];
      if (entry?.submenu) {
        openSub(index, "键");
        return;
      }
      // 这一项没有下一层，那就"往右走出这一栏"。
      onArrowOut(1);
    },
    onLeft: () => onArrowOut(-1),
  });

  const { itemProps, registerItem } = roving;

  /**
   * `stickyLast` 时把**最后一行**从滚动区里摘出来（`menu-popup-foot` 那一套）。
   *
   * ⚠️ 摘的是"最后一行"而不是"最后一条真条目"：这一层的调用方（状态栏那个拼写
   * 菜单）把那条出口放在**末尾**、分隔线在它前面，所以两者是同一行。⚠️ 真要是
   * 哪天末尾跟了一条分隔线，那条分隔线会被钉在底部——**看得出来**，不是静默错。
   *
   * ⚠️ 早先试过 `position: sticky; bottom: 0` 让最后一条自己钉住，**WebKit 上不
   * 生效**（2026-10-11 开窗实测：滚到底也见不到那一行）。所以改成把弹层做成
   * `flex` 列、只让中间那块滚。
   */
  const 分段 = useMemo(() => {
    if (!stickyLast || lines.length < 2) return null;
    return { 身: lines.slice(0, -1), 尾: lines[lines.length - 1]! };
  }, [lines, stickyLast]);

  /** 登记父项按钮。**必须转一手**，不能把 `registerItem` 直接挂上去。 */
  const registerRow = (row: number, node: HTMLElement | null) => {
    rowRefs.current[row] = node;
    registerItem(row, node);
  };

  /** 展开第 `row` 项的子菜单，并记下它**右边沿**的坐标。`来源` 见上面 `点开的`。 */
  function openSub(row: number, 来源: "点" | "划" | "键") {
    const el = rowRefs.current[row];
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 左边缘**减去 4px 叠到父项上**，中间不留缝——留缝的话鼠标从父项移到
    // 子菜单的路上会经过一条"谁都不属于"的带子，鼠标一进那条带子
    // 父项就不是 hover 了，菜单自己关掉。
    setSubAnchor({ top: r.top, left: r.right - 4 });
    点开的.current = 来源 === "点" ? row : null;
    setSubOpen(row);
  }

  /** 收起子菜单，**并把焦点还给父项**。 */
  function closeSub(row: number) {
    点开的.current = null;
    setSubOpen(null);
    setSubAnchor(null);
    // ⚠️ 用 `focusItem` 不是 `setFocusedIndex`——按 `→` 展开子菜单之前，
    // 焦点本来就停在这个父项上，`setFocusedIndex(row)` 是个空操作
    // （值没变 → 不重渲染 → 重聚焦的 effect 不跑），于是"还回来"这一步
    // 什么都没做，焦点掉到 `<body>`，父菜单的 Esc 跟着失灵。踩过。
    roving.focusItem(row);
  }

  /**
   * 画一行。⚠️ 提成函数而不是留在 JSX 里，是因为 `stickyLast` 要把**最后一条**
   * 摘到滚动区外面（见下面 `分段`）——同一段 JSX 要按两处切片渲染，
   * 复制一份 `.map` 回调就等于埋一份将来会漂的抄本。
   */
  const 画行 = (line: Line) => {
      if (line.kind === "sep") {
        return <div className="menu-sep" key={line.key} role="separator" />;
      }

      const { entry, row } = line;
      const isSubOpen = subOpen === row;
      // ⚠️ **键盘走到的那一项必须画出来**（2026-10-04 开窗口检补的，见
      // `styles/menubar.css` 里 `.menu-item-open` 那条注释）：这里原先只认
      // "子菜单开着"，于是 ↑↓ 是一套看不见的漫游——`Esc` 能关掉（说明键真到了）
      // 但屏幕上一格高亮都没有。
      const 是焦点 = roving.focusedIndex === row;
      const p = itemProps(row);

      return (
        <div
          // ⚠️ `row === items.length - 1` 是"最后一条**真条目**"（分隔线不在
          // `items` 里，见上面 `layout` 那段），所以这一条给的是那条出口，
          // 而不是列表末尾那条分隔线。
          className={`menu-item-root ${
            stickyLast && row === items.length - 1 ? "menu-item-sticky" : ""
          }`}
          key={entry.id}
        >
          <button
            type="button"
            role="menuitem"
            className={`menu-item ${entry.danger ? "menu-item-danger" : ""} ${
              isSubOpen || 是焦点 ? "menu-item-open" : ""
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
              if (entry.submenu) openSub(row, "划");
              else {
                点开的.current = null;
                setSubOpen(null);
              }
            }}
            onClick={() => {
              if (entry.submenu) {
                // ⚠️ **"原来就开着"不等于"用户点开的"**（BUG-17）：鼠标点下来
                // 之前一定先划过这一行，而划过那一下已经把子菜单打开了。
                // 那时候按"开着就收起"处理，用户的第一下点击是**把它关掉**，
                // 于是弹层闪一下、什么都没发生，得点第二下才开。
                // 所以只有"点开的那个"才被这一下收起。
                if (isSubOpen && 点开的.current === row) closeSub(row);
                else openSub(row, "点");
                return;
              }
              onPick(entry.id);
            }}
          >
            <span className="menu-check">{entry.checkable && checks[entry.id] ? "✓" : ""}</span>
            <span className="menu-label">{t(entry.label)}</span>
            {/* ⚠️ 走 `formatAccel`：macOS 上要显示成 `⇧⌘S` 而不是 `Ctrl+Shift+S`，
                那边按 Control 是不会响应的。见 `ui/accel.ts`。 */}
            {/* ⚠️ **灰掉的项不印快捷键**（2026-09-25）。以前印：结果是菜单上
                明明白白写着 `Ctrl+Shift+C`、那一项却是灰的——而"灰"在用户
                心里就是"按了也没用"。两句话互相拆台，用户只能猜哪个才算数。
                改成不印之后，这一栏的规矩是一句话：**看得见快捷键 = 按得动**。 */}
            {entry.accel && !disabled.has(entry.id) && (
              <span className="menu-accel">{formatAccel(entry.accel)}</span>
            )}
            {/* ⚠️ `right` 与 `accel` **占同一个位置**（`.menu-accel` 那一格），
                所以 `accel` 优先——两个都写的时候只有快捷键印得出来。理由与
                "为什么要有 `right`"写在 `commands.ts::MenuItemSpec.right`。
                ⚠️ 它**不像快捷键那样在灰掉时隐藏**：语言的短码是"这一行是哪个
                语言"的标识，不是"按得动"的承诺（那条规矩只管 `accel`）。 */}
            {!entry.accel && entry.right && (
              <span className="menu-accel">{entry.right}</span>
            )}
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
  };

  return (
    <div
      className={`menu-popup ${分段 ? "menu-popup-foot" : ""}`}
      role="menu"
      aria-label={label}
      onKeyDown={(e) => {
        // ⚠️ 顶上那块（`top`）里如果是一个输入框，它里面的按键**归它自己**：
        // 不放行的话 ↑↓ 会被漫游吃掉（输入框里的光标动不了）、
        // Home/End 也会变成"跳到菜单两端"。Esc 照旧留给这一层。
        const 目标 = e.target as HTMLElement | null;
        if (e.key !== "Escape" && 目标 && 目标.tagName === "INPUT") return;
        roving.handleKeyDown(e);
      }}
    >
      {/* ⚠️ 两块都在 `lines` **之外**：它们不是条目，不占漫游下标（见 `heading` / `top` 那两段）。 */}
      {top}
      {heading && <div className="menu-heading">{t(heading)}</div>}
      {分段 ? <div className="menu-body">{分段.身.map(画行)}</div> : null}
      {分段 ? 画行(分段.尾) : lines.map(画行)}
    </div>
  );
}

export interface SubMenuProps {
  entries: MenuEntry[];
  disabled: Set<string>;
  checks: Record<string, boolean>;
  onPick: (id: string) => void;
  onDismiss: () => void;
  onClose: () => void;
  /** 父项右边沿的位置（视口坐标），来自 `MenuPopup`。 */
  anchor: { top: number; left: number };
  /**
   * 多挂一个类名。**只有一个用处**：右键菜单那份要抬层级。
   *
   * ⚠️ 子菜单 portal 到 `document.body`，和调用方**没有 DOM 亲缘关系**，
   * 继承不到父层那个 `z-index`——所以只能由调用方自己说一声。菜单栏那一份
   * **不传**（它和菜单栏同层就够了），右键菜单传 `"context-sub"`。
   * 判据见 `styles/menubar.css` 里 `.context-sub` 那条、以及
   * `--z-context-menu` 的定义处。
   */
  className?: string;
}

/**
 * 子菜单。**不支持再往下开一层**（见文件头）。
 *
 * ⚠️ **2026-10-04 起也导出给右键菜单用**（`ui/ContextMenu.tsx`）。那边三栏
 * （「复制为」/「段落」/「插入」）和这里是**一模一样的东西**：一层条目、
 * 从父项右边飞出来、自己量高度夹回视口里、`←` 收起还给父项焦点。
 * 重写一份的话，BUG-17 那条"划过开的 vs 点开的"、坐标系那两条裁剪坑、
 * `focusItem` 那个"state 没变所以 effect 不跑"的坑——**全都要再踩一遍**。
 *
 * ⚠️ 它自己**不认位置**：`anchor` 由调用方量好传进来（菜单栏那边量的是父项，
 * 右键菜单那边量的是——顶层的每一行）。所以这里加进来一个新调用方**不需要
 * 改它**，只要按同一个口径量 `anchor`。
 */
export function SubMenu(props: SubMenuProps) {
  const { entries, disabled, checks, onPick, onDismiss, onClose, anchor, className } = props;

  // ⚠️ 子菜单是**另一个组件**，所以自己取一份 `t`（不是从 `MenuPopup` 传下来的）。
  // 理由同 `MenuPopup` 那一处。
  const t = useT();

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
      className={className ? `menu-sub ${className}` : "menu-sub"}
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
        // ⚠️ 同上：子菜单里也**只有**焦点那一行要亮。这里原先连 `menu-item-open`
        // 都没有，键盘一路 `→` 飞进来之后整栏一个字都不亮（2026-10-04 目检）。
        const 是焦点 = roving.focusedIndex === row;

        return (
          <button
            type="button"
            role="menuitem"
            className={`menu-item ${entry.danger ? "menu-item-danger" : ""} ${是焦点 ? "menu-item-open" : ""}`}
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
            <span className="menu-label">{t(entry.label)}</span>
            {/* 灰掉的不印快捷键。理由同上面那一处（子菜单里也得守同一条规矩）。 */}
            {entry.accel && !disabled.has(entry.id) && (
              <span className="menu-accel">{formatAccel(entry.accel)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
