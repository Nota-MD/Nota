


























import type { PluginMenuItem } from "@/bridge/ipc";
import { t } from "@/i18n";
import { isMenuItem, type MenuEntry, type MenuSpec } from "@/ui/commands";


export const recognizeRecognizeOfMenu = "plugins";


export const pluginItemPrefix = "__plugin:";


const withoutPlaceSafeReleasePrefix = "__plugin-unplaced:";


export function pluginItemId(plugin: string, command: string): string {
  return `${pluginItemPrefix}${plugin}:${command}`;
}








export function pluginMenuBar(items: PluginMenuItem[]): MenuSpec | null {
  if (items.length === 0) return null;

  const recognizeObtain: MenuEntry[] = [];
  const withoutPlace: MenuEntry[] = [];

  for (const it of items) {
    if (it.menu === recognizeRecognizeOfMenu) {
      recognizeObtain.push({
        id: pluginItemId(it.plugin, it.command),
        label: it.label,
        ...(it.accelerator ? { accel: it.accelerator } : {}),
      });
    } else {
      withoutPlace.push({




        id: `${withoutPlaceSafeReleasePrefix}${it.plugin}:${it.menu}:${it.command}`,



        label: `${it.label}${t(" (wants the “{0}” menu — not supported yet)", it.menu)}`,
      });
    }
  }

  return {
    id: "plugins",


    label: t("Extensions"),

    items: recognizeObtain.length && withoutPlace.length ? [...recognizeObtain, "sep", ...withoutPlace] : [...recognizeObtain, ...withoutPlace],
  };
}












export function withPluginDock(
  menus: readonly MenuSpec[],
  items: PluginMenuItem[],
  extensionsEnabled = true,
): MenuSpec[] {
  if (!extensionsEnabled) {
    return menus.map((menu) => {
      const entries = menu.items.filter(
        (entry) => !isMenuItem(entry) || entry.id !== "view.toggleDock",
      );
      return entries.length === menu.items.length ? menu : { ...menu, items: entries };
    });
  }
  const bar = pluginMenuBar(items);
  if (!bar) return [...menus];

  const out = [...menus];
  const aboutIndex = out.findIndex((m) => m.id === "about");
  out.splice(aboutIndex < 0 ? out.length : aboutIndex, 0, bar);
  return out;
}
