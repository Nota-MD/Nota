


































import type { DocThemeInfo, NativeMenuNode } from "@/bridge/ipc";
import { t } from "@/i18n";
import {
  isMenuItem,
  themeChecks,
  themeEntries,
  type MenuEntry,
  type MenuSpec,
} from "@/ui/commands";












export function buildNativeTree(
  menus: readonly MenuSpec[],
  disabled: ReadonlySet<string>,
  checks: Readonly<Record<string, boolean>>,
  themes: readonly DocThemeInfo[],
  currentTheme: string,
): NativeMenuNode[] {
  return menus.map((menu) => {
    const isThemes = menu.dynamic === "themes";



    const items = isThemes ? themeEntries(themes) : menu.items;
    const merged = isThemes ? { ...checks, ...themeChecks(themes, currentTheme) } : checks;

    return {
      id: menu.id,
      label: t(menu.label),
      submenu: items.map((entry) => toNode(entry, disabled, merged)),
    };
  });
}

/**
 * Stable fingerprint for a native menu payload.
 *
 * macOS dismisses an open system menu whenever `AppHandle::set_menu` replaces
 * the whole tree. Callers must skip `nativeMenu.apply` when this key is
 * unchanged — otherwise cursor/`commandState` churn rebuilds an identical menu
 * and the bar flickers (File opens then vanishes).
 */
export function nativeMenuPayloadKey(nodes: readonly NativeMenuNode[]): string {
  return JSON.stringify(nodes);
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






    accel: entry.accel,
    enabled: !disabled.has(entry.id),



    checked: entry.checkable ? !!checks[entry.id] : undefined,
  };
}
