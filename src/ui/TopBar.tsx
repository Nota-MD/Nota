/**
 * 顶栏：菜单栏 + 插件栏开关。2026-09-23 从 `App.tsx` 拆出来——那支文件当时
 * 已经 921 行、贴着 1000 行上限，而这块是**纯展示**的（props 全是显式的），
 * 拆走零风险。下一步（Slidev 右侧面板）还要往 `App.tsx` 加状态，先腾地方。
 */

import type { DocThemeInfo } from "@/bridge/ipc";
import type { MenuSpec } from "@/ui/commands";
import { MenuBar } from "@/ui/MenuBar";

// ── 顶栏：品牌 + 菜单栏 + 插件栏开关 ──────────────────────────────────────

/**
 * ⚠️ **四个工具条按钮（新建/打开/打开文件夹/保存）2026-09-23 撤掉了**——
 * 它们各是「文件」菜单里的一项，留着就是同一件事的两个入口，
 * 而 Typora 顶栏上并没有这一排按钮。对标的是它的布局，不是"多留几个快捷方式"。
 *
 * 快捷键一个没少（Ctrl+N/O/S…），「文件」菜单里也都还在，所以撤掉的是
 * 那个**重复的**入口，不是能力。
 */
export function TopBar(props: {
  /**
   * 菜单栏摆哪几栏。⚠️ **透传**给 `MenuBar`，这一层不碰内容——
   * 里面有一栏是插件的（`ui/pluginMenus.ts` 合成），而"插件那栏排在哪"
   * 的决定权在 `App.tsx`。顶栏只是个壳。
   */
  menus: readonly MenuSpec[];
  disabled: Set<string>;
  checks: Record<string, boolean>;
  themes: DocThemeInfo[];
  currentTheme: string;
  onCommand: (id: string) => void;
  onTheme: (id: string) => void;
  onOpenThemesDir: () => void;
  dockOpen: boolean;
  onToggleDock: () => void;
  /**
   * 原生菜单已经挂上了，**这一条让位**。
   *
   * macOS 的菜单栏在屏幕顶端、属于应用而不是窗口，窗口里再画一条是错的
   * （Typora 在那边用的也是系统菜单栏）。Windows / Linux 上恒为 `false`。
   * 判据是后端的返回值，不是平台——见 `App.tsx` 里 `usingNativeMenu` 那段。
   */
  hideMenuBar: boolean;
}) {
  return (
    <header className="toolbar">
      {!props.hideMenuBar && (
        <MenuBar
          menus={props.menus}
          disabled={props.disabled}
          checks={props.checks}
          themes={props.themes}
          currentTheme={props.currentTheme}
          onCommand={props.onCommand}
          onTheme={props.onTheme}
          onOpenThemesDir={props.onOpenThemesDir}
        />
      )}

      {/* 插件栏的开关推到最右。`margin-left: auto` 让它在 flex 里吃满剩余空间——
          这是**唯一**的定位手段，别加什么 spacer 元素。 */}
      <button
        type="button"
        className={`btn toolbar-dock-toggle ${props.dockOpen ? "btn-on" : ""}`}
        onClick={props.onToggleDock}
        title={props.dockOpen ? "收起插件栏" : "展开插件栏"}
        aria-pressed={props.dockOpen}
      >
        插件
      </button>
    </header>
  );
}
