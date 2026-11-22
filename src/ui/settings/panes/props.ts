

























import type { DocThemeInfo, Settings, UiStyleInfo } from "@/bridge/ipc";
import type { MenuSpec } from "@/ui/commands";

export interface PaneProps {
  settings: Settings;

  onChange: (patch: Partial<Settings>) => void;

  docThemes: DocThemeInfo[];





  uiStyles: UiStyleInfo[];

  onOpenThemesDir: () => void;
  /** Rescan document themes after files are copied into the theme directory. */
  onRefreshThemes: () => void;

  onOpenStylesDir: () => void;

  onRefreshUiStyles: () => void;
  /** Pick and import one ZIP containing interface and/or document themes. */
  onImportTheme: () => void;
  /** Import a flat Typora theme directory. */
  onImportTyporaTheme: () => void;

  onOpenConfigDir: () => void;

  onResetSettings: () => void;







  onClearRecent: () => void;
  /** Restore editor bodies kept outside their source files. */
  onRestoreDrafts: () => void;











  menus: readonly MenuSpec[];
  /** Setting paths currently owned by an active extension. */
  settingLocks: ReadonlySet<string>;
}
















export type PageKey =
  | "files"
  | "editor"
  | "image"
  | "markdown"
  | "export"
  | "appearance"
  | "general"
  | "download"
  | "updates"
  | "focus"


  | "document";

















export function paneWriter<K extends PageKey>(
  settings: Settings,
  onChange: (patch: Partial<Settings>) => void,
  page: K,
): (partial: Partial<Settings[K]>) => void {
  return (partial) =>



    onChange({ [page]: { ...settings[page], ...partial } } as Partial<Settings>);
}
