





import type { DocThemeInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { MenuSpec } from "@/ui/commands";
import { MenuBar } from "@/ui/MenuBar";











export function TopBar(props: {





  menus: readonly MenuSpec[];
  disabled: Set<string>;
  checks: Record<string, boolean>;
  themes: DocThemeInfo[];
  currentTheme: string;
  onCommand: (id: string) => void;
  onTheme: (id: string) => void;
  onOpenThemesDir: () => void;
  onRefreshThemes: () => void;
  dockOpen: boolean;
  onToggleDock: () => void;

  showDock: boolean;







  hideMenuBar: boolean;
}) {


  const t = useT();














  if (props.hideMenuBar) return null;
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
          onRefreshThemes={props.onRefreshThemes}
        />
      )}

      {
                                          }
      {props.showDock && (
        <button
          type="button"
          className={`btn toolbar-dock-toggle ${props.dockOpen ? "btn-on" : ""}`}
          onClick={props.onToggleDock}
          title={props.dockOpen ? t("Hide the extension dock") : t("Show the extension dock")}
          aria-pressed={props.dockOpen}
        >
          {t("Extensions")}
        </button>
      )}
    </header>
  );
}
