























import { clearRemoveRecentItem, type MenuEntry, type MenuItemSpec, type MenuSpec } from "@/ui/commands";
import { recentItemName } from "@/ui/useSession";


const prefix = "file.recent:";


export function isRecentItem(id: string): boolean {
  return id.startsWith(prefix);
}









export function recentItemid(path: string): string {
  return `${prefix}${path}`;
}






export function recentPath(id: string): string {
  return id.slice(prefix.length);
}








export function recentItem(recent: readonly string[]): MenuEntry[] {
  const item: MenuEntry[] = recent.map((path) => ({
    id: recentItemid(path),
    label: recentItemName(path),
  }));



  //



  item.push("sep", clearRemoveRecentItem);
  return item;
}





export function noteEnterRecentTextItem(
  menus: readonly MenuSpec[],
  recent: readonly string[],
): MenuSpec[] {
  if (recent.length === 0) return menus as MenuSpec[];
  return menus.map((bar) => {
    if (bar.id !== "file") return bar;
    return {
      ...bar,
      items: bar.items.map((item5): MenuEntry => {
        if (item5 === "sep" || item5.id !== "file.recent") return item5;
        return { ...item5, submenu: recentItem(recent) } satisfies MenuItemSpec;
      }),
    };
  });
}
