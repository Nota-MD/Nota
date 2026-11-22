


























import type { FileFilter, Settings, TreeSort } from "@/bridge/ipc";


export interface TreeMouthPath {
  sort: TreeSort;
  filter: FileFilter;
  showHidden: boolean;
}









export const fallbackOptions: TreeMouthPath = {
  sort: "name",
  filter: "supported",
  showHidden: false,
};








export function readMouthPath(settings: Settings | null): TreeMouthPath {
  if (!settings) return fallbackOptions;
  return {
    sort: settings.files.tree_sort,
    filter: settings.files.tree_filter,
    showHidden: settings.files.show_hidden,
  };
}








export function optionKey(mouthPath: TreeMouthPath): string {
  return `${mouthPath.sort}|${mouthPath.filter}|${mouthPath.showHidden}`;
}
