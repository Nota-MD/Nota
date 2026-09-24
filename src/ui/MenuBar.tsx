/**
 * 菜单栏。**这是"模仿 Typora 界面布局"里最主要的那一块。**
 *
 * 在这之前 Nota 只有一条工具条 + 四个按钮（新建/打开/打开文件夹/保存），
 * 而 Typora 单是「段落」一栏就有二十来项。`docs/07` 第 40 项记的就是这个缺口。
 *
 * # 灰掉的项不是省事，是**如实**
 *
 * 菜单里会出现一些灰的条目（比如「查找和替换」「导出 PDF」）。它们不是占位符，
 * 也不是"以后会做"的许诺——它们是**当前确实做不到**的能力，摆在那里是为了
 * 让缺口可见。判据是"`App.tsx` 里有没有这个 id 的处理函数"（见 `commands.ts` 顶上那段），
 * 所以**灰的就一定是真没有**，不存在"忘了翻标志"。
 *
 * # 这一层只管"哪一栏开着"
 *
 * 开着的那一栏里有什么、方向键怎么走、子菜单怎么飞出，全在 `MenuPopup.tsx`。
 * 分家的理由是两边的状态完全不同：这边只有**一个** `open`（菜单栏是单选的），
 * 那边每个弹层各有一份漫游焦点和一个子菜单开关。
 * 混在一起写的话，切换菜单时"上一栏的子菜单还开着"这类 bug 会反复出现。
 *
 * # 交互按桌面惯例，不是按网页惯例
 *
 * - 菜单开着时**鼠标划过另一栏就切过去**——不用先点开再点另一栏；
 * - 点空白处、按 Esc 都关；
 * - `←` `→` 在栏间移动（走到头就停住，不绕回——这是 macOS 的惯例，
 *   绕回在栏多的时候会让人分不清"我绕了一圈"还是"没动"）；
 * - Esc 关掉之后焦点回到那一栏的按钮上（不然键盘用户会掉到页面里）。
 *
 * 这几条是原生的手感。不这么做的话，用惯桌面软件的人会觉得"这个菜单是假的"。
 */

import { useEffect, useRef, useState } from "react";

import type { DocThemeInfo } from "@/bridge/ipc";
import { resolvePick, themeChecks, themeEntries, type MenuSpec } from "@/ui/commands";
import { MenuPopup } from "@/ui/MenuPopup";

interface Props {
  /**
   * 摆哪几栏、每栏里有什么。**不是常量了**（2026-09-24 起）——插件的菜单项
   * 是运行时才知道的（`api.plugin.menus()`），那一栏由 `ui/pluginMenus.ts`
   * 合成，`App.tsx` 拼在「主题」和「帮助」之间。
   *
   * ⚠️ 别的几栏仍然是 `ui/commands.ts` 里那张静态表，一个字没动。
   * 这里收成参数是**为了不改判据**：`←` `→` 走的是这张列表的**顺序**，
   * 而顺序的决定权在拼列表的地方（`App.tsx`），不在这儿。
   */
  menus: readonly MenuSpec[];
  /** 当前**用不了**的命令 id。没实现、或缺活动文档，都进这个集合。 */
  disabled: Set<string>;
  /** 可勾选项的当前状态，键是命令 id。 */
  checks: Record<string, boolean>;
  /** 可用的**文档主题**。内置的 ＋ 用户放进主题目录的。 */
  themes: DocThemeInfo[];
  /** 当前文档主题 id。空串 = 无主题（编辑区用中性样式）。 */
  currentTheme: string;
  onCommand: (id: string) => void;
  /** 换文档主题。传空串表示"无主题"。 */
  onTheme: (id: string) => void;
  onOpenThemesDir: () => void;
}

export function MenuBar(props: Props) {
  // 哪一栏开着。`null` = 全关。
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  /** 把焦点还给某一栏的按钮。 */
  const focusTitle = (menuId: string) => {
    barRef.current?.querySelector<HTMLElement>(`[data-menu="${menuId}"]`)?.focus();
  };

  // 点别处关掉。⚠️ 用 `mousedown` 不是 `click`：`click` 要等鼠标抬起，
  // 期间菜单还开着，点到的东西会被菜单挡住——手感是"点了两下才关掉"。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (barRef.current?.contains(t as Node)) return;
      // ⚠️ 子菜单是 **portal 到 `<body>`** 的（见 `MenuPopup.tsx` 顶上那段），
      // 不在 `barRef` 里面。不特判的话，在子菜单上按下鼠标会**先把整个菜单关掉**，
      // 于是 mouseup / click 落在一个已经被卸载的按钮上——
      // **子菜单里的项永远点不动**，而键盘走得通，看着像"鼠标坏了"。
      if (t?.closest?.(".menu-sub")) return;
      setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Esc 的**兜底**。弹层里那条（`useMenuRovingFocus`）管的是"焦点在菜单项上"，
  // 这条管的是"焦点还停在菜单栏的按钮上"——只按了一下按钮、还没往下走就按 Esc。
  // 两条都在，去掉任何一条都会留下一个关不掉的死角。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(null);
      // 焦点还给那一栏的按钮。不还的话键盘用户在菜单关掉后
      // 就没有落点了，下一次 Tab 会从页面开头重新数。
      focusTitle(open);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  /** `←` `→` 在栏间移动。走到了头就**停住**，不绕回。 */
  const arrowAcross = (dir: 1 | -1) => {
    const i = props.menus.findIndex((m) => m.id === open);
    if (i < 0) return;
    const next = props.menus[i + dir];
    // 不绕回的第二个理由：绕回要在这里写取模，而"到底该不该绕"
    // 每个平台不一样，写死了以后改起来要动逻辑，不如留个空。
    if (!next) return;
    // 新弹层自己会播种焦点（`useMenuRovingFocus` 的 `useLayoutEffect`），
    // 所以这里**不**去 focus 按钮——那样反而把焦点从弹层里拽出来，
    // 方向键就断在切栏这一步了。
    setOpen(next.id);
  };

  /** 点一项：主题那几条走 `onTheme`，其余走 `onCommand`。两条路都关菜单。 */
  const pick = (id: string) => {
    setOpen(null);
    // ⚠️ "这个 id 是命令还是主题那三条"只有 `resolvePick` 一处判据，
    // 原生菜单那条路也走它。见 `commands.ts` 里那段。
    const p = resolvePick(id);
    if (p.kind === "theme") props.onTheme(p.id);
    else if (p.kind === "themes-dir") props.onOpenThemesDir();
    else props.onCommand(p.id);
  };

  return (
    <div className="menubar" role="menubar" ref={barRef}>
      {props.menus.map((menu) => {
        const isThemes = menu.dynamic === "themes";
        const entries = isThemes ? themeEntries(props.themes) : menu.items;
        // ⚠️ 主题那几项的 id 是**合成出来的**，不在 `App.tsx` 的 `menuChecks` 里，
        // 所以勾要在这里补上。少了这一步，菜单**从来不显示当前用的是哪套主题**
        // ——`currentTheme` 这个 prop 传进来了却没人用，正是上一版的毛病。
        const checks = isThemes
          ? { ...props.checks, ...themeChecks(props.themes, props.currentTheme) }
          : props.checks;
        const isOpen = open === menu.id;

        return (
          <div className="menu-root" key={menu.id}>
            <button
              type="button"
              data-menu={menu.id}
              className={`menu-title ${isOpen ? "menu-title-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              // 点这一栏：关着就开，开着就关（再点一次收起是桌面惯例）。
              onClick={() => setOpen(isOpen ? null : menu.id)}
              // 已经有菜单开着时，划过就切过去——不用先点开再点另一栏。
              onMouseEnter={() => open && open !== menu.id && setOpen(menu.id)}
            >
              {menu.label}
            </button>

            {isOpen && (
              // ⚠️ `key` 是必需的：切栏时若不换 key，React 会**复用**同一个
              // `MenuPopup` 实例，漫游焦点和子菜单开关都留在上一栏的状态里，
              // 新一栏打开时焦点会落在错误的位置（或干脆没有焦点）。
              <MenuPopup
                key={menu.id}
                label={menu.label}
                entries={entries}
                disabled={props.disabled}
                checks={checks}
                onPick={pick}
                onDismiss={() => {
                  setOpen(null);
                  focusTitle(menu.id);
                }}
                onArrowOut={arrowAcross}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
