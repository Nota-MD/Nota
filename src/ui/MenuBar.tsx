/**
 * 菜单栏。**这是"模仿 Typora 界面布局"里最主要的那一块。**
 *
 * 在这之前 Nota 只有一条工具条 + 四个按钮（新建/打开/打开文件夹/保存），
 * 而 Typora 单是「段落」一栏就有二十来项。`docs/07` 第 40 项记的就是这个缺口。
 *
 * # 灰掉的项不是省事，是**如实**
 *
 * 菜单里会出现一些灰的条目（比如「查找和替换」「源代码模式」）。它们不是占位符，
 * 也不是"以后会做"的许诺——它们是**当前确实做不到**的能力，摆在那里是为了
 * 让缺口可见。判据是"`App.tsx` 里有没有这个 id 的处理函数"（见 `commands.ts` 顶上那段），
 * 所以**灰的就一定是真没有**，不存在"忘了翻标志"。
 *
 * # 交互按桌面惯例，不是按网页惯例
 *
 * - 菜单开着时**鼠标划过另一栏就切过去**——不用先点开再点另一栏；
 * - 点空白处、按 Esc 都关；
 * - Esc 关掉之后焦点回到那一栏的按钮上（不然键盘用户会掉到页面里）。
 *
 * 这几条是原生的手感。不这么做的话，用惯桌面软件的人会觉得"这个菜单是假的"。
 */

import { useEffect, useRef, useState } from "react";

import type { ThemeInfo } from "@/bridge/ipc";
import { MENUS, type MenuEntry } from "@/ui/commands";

/** 「无主题」那一项的 id。它不是 `commands.ts` 里的命令，是这里合成出来的。 */
const NO_THEME = "__theme-none";
/** 主题项的 id 前缀，后面跟主题名。 */
const THEME_PREFIX = "__theme:";

interface Props {
  /** 当前**用不了**的命令 id。没实现、或缺活动文档，都进这个集合。 */
  disabled: Set<string>;
  /** 可勾选项的当前状态，键是命令 id。 */
  checks: Record<string, boolean>;
  /** 已经扫到的主题。用户装了什么就有什么。 */
  themes: ThemeInfo[];
  /** 当前文档主题名。空串 = 内置默认。 */
  currentTheme: string;
  onCommand: (id: string) => void;
  onTheme: (name: string) => void;
  onOpenThemesDir: () => void;
}

export function MenuBar(props: Props) {
  // 哪一栏开着。`null` = 全关。
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // 点别处关掉。⚠️ 用 `mousedown` 不是 `click`：`click` 要等鼠标抬起，
  // 期间菜单还开着，点到的东西会被菜单挡住——手感是"点了两下才关掉"。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(null);
      // 焦点还给那一栏的按钮。不还的话键盘用户在菜单关掉后
      // 就没有落点了，下一次 Tab 会从页面开头重新数。
      barRef.current?.querySelector<HTMLElement>(`[data-menu="${open}"]`)?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  /** 点一项：主题走 `onTheme`，其余走 `onCommand`。两条路都关菜单。 */
  const pick = (id: string) => {
    setOpen(null);
    if (id === NO_THEME) {
      props.onTheme("");
    } else if (id.startsWith(THEME_PREFIX)) {
      props.onTheme(id.slice(THEME_PREFIX.length));
    } else {
      props.onCommand(id);
    }
  };

  return (
    <div className="menubar" role="menubar" ref={barRef}>
      {MENUS.map((menu) => {
        const entries = menu.dynamic === "themes" ? themeEntries(props) : menu.items;
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
              onMouseEnter={() => open && setOpen(menu.id)}
            >
              {menu.label}
            </button>

            {isOpen && (
              <div className="menu-popup" role="menu" aria-label={menu.label}>
                {entries.map((entry, i) =>
                  entry === "sep" ? (
                    <div className="menu-sep" key={`sep-${i}`} role="separator" />
                  ) : (
                    <MenuRow
                      key={entry.id}
                      entry={entry}
                      disabled={props.disabled.has(entry.id)}
                      checked={props.checks[entry.id]}
                      onPick={() => pick(entry.id)}
                    />
                  ),
                )}
                {menu.dynamic === "themes" && <ThemesDirRow onPick={props.onOpenThemesDir} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 「主题」菜单的内容。**动态生成**——用户装了什么主题就有什么条目，
 * 抄不进 `commands.ts` 那张静态表里。
 *
 * 用 `MenuEntry` 这个同一形状，是为了让渲染那一段不用为主题开特例。
 */
function themeEntries(props: Props): MenuEntry[] {
  const items: MenuEntry[] = [
    {
      id: NO_THEME,
      label: "无主题（内置）",
      checkable: true,
    },
  ];

  if (props.themes.length) {
    items.push("sep");
    for (const t of props.themes) {
      // 出处标在名字后面。不标的话"我明明删了那个文件它怎么还在"
      // 会变成一个查不动的问题——三个目录都扫，得让人看出是哪一份。
      const source = t.source === "nota" ? "" : `（${t.source === "typora" ? "Typora" : "Typora flatpak"}）`;
      items.push({
        id: `${THEME_PREFIX}${t.name}`,
        label: `${t.name}${source}${t.has_assets ? "" : "　无字体"}`,
        checkable: true,
      });
    }
  }

  return items;
}

/** 「打开主题文件夹」——它不在 `commands.ts` 里，因为它只属于这一栏。 */
function ThemesDirRow({ onPick }: { onPick: () => void }) {
  return (
    <>
      <div className="menu-sep" role="separator" />
      <button type="button" role="menuitem" className="menu-item" onClick={onPick}>
        <span className="menu-check" />
        <span className="menu-label">打开主题文件夹…</span>
      </button>
    </>
  );
}

function MenuRow(props: {
  entry: Exclude<MenuEntry, "sep">;
  disabled: boolean;
  checked: boolean | undefined;
  onPick: () => void;
}) {
  const { entry, disabled, checked } = props;

  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item ${entry.danger ? "menu-item-danger" : ""}`}
      // ⚠️ 用 `disabled` 而不是"点了不做事"：灰掉的项要**看得出**灰，
      // 也要让键盘跳过去时不落在它上面。
      disabled={disabled}
      aria-checked={entry.checkable ? !!checked : undefined}
      onClick={props.onPick}
    >
      <span className="menu-check">{entry.checkable && checked ? "✓" : ""}</span>
      <span className="menu-label">{entry.label}</span>
      {entry.accel && <span className="menu-accel">{entry.accel}</span>}
    </button>
  );
}
