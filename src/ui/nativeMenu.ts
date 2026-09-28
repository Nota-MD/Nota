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
 *
 * # ⚠️ 这里的 `label` 要**翻一次**
 *
 * `commands.ts` 那张表里存的是**键**（**英文原文**——2026-09-28 翻转，此前是中文），原生菜单是**另一条渲染路**
 *（自绘那条在 `MenuBar.tsx` / `MenuPopup.tsx`），它也得自己翻——不翻的话
 * macOS 上整条菜单栏是中文、窗口里是英文（那是用户报过的 BUG-38 的翻版）。
 *
 * ⚠️ 用的是**模块级**那个 `t`（不是 `useT()`）：这个文件不是组件，是一串纯函数，
 * 只在推送那一刻跑一次。它的代价说在明处：**语言换了它不会自己重推**。
 *
 * ⚠️ 那笔欠账**2026-09-26 已经结清**：`ui/useMenus.ts` 那个推菜单的 effect
 * 依赖里加了 `use语言()`。今天语言还要重启才生效，所以那条依赖**此刻**推不出
 * 差别——它挡的是"以后热切语言"（届时不加就是"窗口里换了、原生菜单栏还停在
 * 旧语言"）。**删它之前先想清楚这一条。**
 */

import type { DocThemeInfo, NativeMenuNode } from "@/bridge/ipc";
import { t } from "@/i18n";
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
      label: t(menu.label),
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
      label: t(entry.label),
      submenu: entry.submenu.map((child) => toNode(child, disabled, checks)),
    };
  }

  return {
    id: entry.id,
    label: t(entry.label),
    // ⚠️ 灰掉的项**照样把 accel 推过去**，这边的树是"菜单长什么样"的完整描述。
    // "灰掉的不带快捷键"那条规矩由 **Rust 侧**执行（`native_menu.rs` 的
    // `leaf_accel()`），不在这里再做一遍：那是 macOS 的硬约束（AppKit 连禁用项
    // 的键位一起匹配，灰着的 ⌘C 会把复制粘贴吃掉），必须在**真正建菜单的那一层**
    // 守住。这边再判一次就等于同一句话两个地方各写一份，迟早漂。
    // 自绘菜单那一侧没有这个约束，所以由 `MenuPopup.tsx` 自己判（2026-09-25）。
    accel: entry.accel,
    enabled: !disabled.has(entry.id),
    // ⚠️ `false` 和 `undefined` **不是一回事**：前者是"可勾选项，此刻没勾"
    // （菜单上画一个空位），后者是"普通项"（什么都不画）。判错了的效果是
    // 一整栏条目左边齐刷刷多出（或少掉）一列缩进。
    checked: entry.checkable ? !!checks[entry.id] : undefined,
  };
}
