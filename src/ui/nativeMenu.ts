/**
 * 把菜单树推给 Rust，好让 macOS 挂出**原生菜单**。
 *
 * # 为什么树是从这边推过去的
 *
 * 菜单怎么排、每一项叫什么、有没有快捷键，唯一的地方是 `commands.ts`。
 * 在 Rust 里再抄一份的话就有两个真相源了，而 `lib.rs` 里 `nota_frontend_ready`
 * 那段注释记的正是同一类错误的代价。所以方向是**前端推、Rust 建**
 * （见 `src-tauri/src/native_menu.rs` 文件头）。
 *
 * # 这里只做形状转换，不做判断
 *
 * "哪一项该灰"已经由 `App.tsx` 的 `disabledCommands` 算好了，这里**不重算**——
 * 重算就是又一份判据，会漂。这里只把 `disabled` / `checks` 两张表**翻译成**
 * Rust 认的字段名（`enabled` / `checked`）。
 *
 * ⚠️ 带子菜单的项**不推 `enabled` / `accel`**：它自己不执行命令（见 `commands.ts`），
 * 推过去只会让 Rust 那边多一处要判断的东西。Rust 侧遇到 `submenu` 非空的节点
 * 也是直接建成一层飞出，不看这两个字段。
 */

import type { DocThemeInfo, NativeMenuNode } from "@/bridge/ipc";
import {
  isMenuItem,
  themeChecks,
  themeEntries,
  type MenuEntry,
  type MenuSpec,
} from "@/ui/commands";

/**
 * 建一棵原生菜单树。
 *
 * @param menus 菜单定义。生产里是 `App.tsx` 拼出来的那份（`MENUS` ＋ 插件那一栏），
 *   **不是**常量 `MENUS`——见 `ui/useMenus.ts` 里 `MenuWiring.menus` 那段：
 *   插件的菜单项也得出现在 macOS 的系统菜单栏里，否则同一个功能在两边不一样。
 * @param disabled 用不了的命令 id（`App.tsx` 的 `disabledCommands`）。
 * @param checks 可勾选项的当前状态（`App.tsx` 的 `menuChecks`）。
 * @param themes 可用的**文档主题**。只有「主题」那一栏用得上。
 * @param currentTheme 当前文档主题 id（空串 = 无主题）。
 */
export function buildNativeTree(
  menus: readonly MenuSpec[],
  disabled: ReadonlySet<string>,
  checks: Readonly<Record<string, boolean>>,
  themes: readonly DocThemeInfo[],
  currentTheme: string,
): NativeMenuNode[] {
  return menus.map((menu) => {
    const isThemes = menu.dynamic === "themes";
    // ⚠️ 「主题」那栏的内容与勾都是**合成**的，理由同 `MenuBar.tsx`：
    // 它的 id 不在 `menuChecks` 里，不补的话原生菜单同样**不显示当前主题**。
    // 两边都用 `commands.ts` 里那两个函数，不各写一份。
    const items = isThemes ? themeEntries(themes) : menu.items;
    const merged = isThemes ? { ...checks, ...themeChecks(themes, currentTheme) } : checks;

    return {
      id: menu.id,
      label: menu.label,
      submenu: items.map((entry) => toNode(entry, disabled, merged)),
    };
  });
}

function toNode(
  entry: MenuEntry,
  disabled: ReadonlySet<string>,
  checks: Readonly<Record<string, boolean>>,
): NativeMenuNode {
  if (!isMenuItem(entry)) return { sep: true };

  if (entry.submenu) {
    return {
      id: entry.id,
      label: entry.label,
      submenu: entry.submenu.map((child) => toNode(child, disabled, checks)),
    };
  }

  return {
    id: entry.id,
    label: entry.label,
    accel: entry.accel,
    enabled: !disabled.has(entry.id),
    // ⚠️ `false` 和 `undefined` **不是一回事**：前者是"可勾选项，此刻没勾"
    // （菜单上画一个空位），后者是"普通项"（什么都不画）。判错了的效果是
    // 一整栏条目左边齐刷刷多出（或少掉）一列缩进。
    checked: entry.checkable ? !!checks[entry.id] : undefined,
  };
}
