





























import { useEffect, useMemo, useRef, useState } from "react";

import type { UnlistenFn } from "@tauri-apps/api/event";

import {
  api,
  on,
  events,
  type DocId,
  type DocThemeInfo,
  type MenuBarRenderer,
  type ToolbarMode,
  type ViewMode,
} from "@/bridge/ipc";
import type { CommandState } from "@/editor/command-state";
import { useLanguage } from "@/i18n";
import { accelSig, buildAccelIndex, eventAccel, isOutsideEditor } from "@/ui/accel";
import {
  isDeveloperToolsShortcut,
  shouldBlockBrowserShortcut,
} from "@/ui/browser-shortcuts";
import { walkMenuItems, type MenuItemSpec, type MenuSpec } from "@/ui/commands";
import { buildNativeTree, nativeMenuPayloadKey } from "@/ui/nativeMenu";












const hostFormatKey: Readonly<Record<string, string>> = {
  bold: "fmt.bold",
  italic: "fmt.italic",
};







const cutPasteBoardKey = new Set(["edit.copy", "edit.cut", "edit.paste", "edit.pastePlain"]);

export interface MenuWiring {










  menus: readonly MenuSpec[];





  menuHandlers: Record<string, () => void>;
  activeId: DocId | null;

  commandState: CommandState | null;

  view: {
    sidebarOpen: boolean;
    sidebarTab: string;
    dockOpen: boolean;

    toolbarMode: ToolbarMode;
    statusBarOpen: boolean;

    menuBarOpen: boolean;
    viewMode: ViewMode;

    focusMode: boolean;








    forceFocus: boolean;
    typewriter: boolean;

    readOnly: boolean;




    fullscreen: boolean;





    alwaysOnTop: boolean;
  };
  themes: DocThemeInfo[];
  documentTheme: string;

  menuRenderer: MenuBarRenderer;





  onNativePick: (id: string) => void;
  /** Developer mode permits the explicit DevTools command and developer chords. */
  developerMode: boolean;
  /** Allow WebView-native browser shortcuts in developer mode. */
  webviewDefaultShortcuts: boolean;
}

export interface MenuState {

  disabledCommands: Set<string>;

  menuChecks: Record<string, boolean>;

  usingNativeMenu: boolean;
}

export function effectiveMenuRenderer(
  configured: MenuBarRenderer,
  forceWhenExpanded: boolean,
  expanded: boolean,
): MenuBarRenderer {
  return forceWhenExpanded && expanded ? "nota" : configured;
}

















const cursorCondition: Record<string, (s: CommandState) => boolean> = {
  "para.tableRowAbove": (s) => s.inTable,
  "para.tableRowBelow": (s) => s.inTable,
  "para.tableColLeft": (s) => s.inTable,
  "para.tableColRight": (s) => s.inTable,
  "para.tableMoveRowUp": (s) => s.inTable,
  "para.tableMoveRowDown": (s) => s.inTable,
  "para.tableMoveColLeft": (s) => s.inTable,
  "para.tableMoveColRight": (s) => s.inTable,
  "para.tableDelRow": (s) => s.inTable,
  "para.tableDelCol": (s) => s.inTable,
  "para.tableDel": (s) => s.inTable,
  "para.tableCopy": (s) => s.inTable,
  "para.tableFormat": (s) => s.inTable,
  "para.tableAlignLeft": (s) => s.inTable,
  "para.tableAlignCenter": (s) => s.inTable,
  "para.tableAlignRight": (s) => s.inTable,

  "fmt.clear": (s) => s.hasSelection,




  "para.toc": (s) => s.hasHeadings,
};

export function useMenus(w: MenuWiring): MenuState {
  const {
    menus,
    menuHandlers,
    activeId,
    commandState,
    themes,
    documentTheme,
    menuRenderer,
    onNativePick,
    developerMode,
    webviewDefaultShortcuts,
  } = w;
  const {
    sidebarOpen,
    sidebarTab,
    dockOpen,
    toolbarMode,
    statusBarOpen,
    menuBarOpen,
    viewMode,
    focusMode,
    forceFocus,
    typewriter,
    readOnly,
    fullscreen,
    alwaysOnTop,
  } = w.view;


  const disabledCommands = useMemo(() => {
    const out = new Set<string>();


    const isOff = (item: MenuItemSpec): boolean => {
      if (item.submenu) {




        return item.submenu.every((child) => child === "sep" || isOff(child));
      }
      if (!menuHandlers[item.id]) return true;
      if (item.id === "view.devtools" && !developerMode) return true;
      if (item.needsDoc && activeId === null) return true;

      const seeCursor = cursorCondition[item.id];
      if (seeCursor && commandState) return !seeCursor(commandState);
      return false;
    };





    walkMenuItems(menus, (item) => {
      if (isOff(item)) out.add(item.id);
    });
    return out;
  }, [menus, menuHandlers, activeId, commandState, developerMode]);











  const menuChecks = useMemo<Record<string, boolean>>(
    () => ({
      "view.toggleSidebar": sidebarOpen,
      "view.outline": sidebarOpen && sidebarTab === "outline",
      "view.fileTree": sidebarOpen && sidebarTab === "tree",


      "view.toggleDock": dockOpen,



      "view.toolbarAlways": toolbarMode === "always",
      "view.toolbarHover": toolbarMode === "hover",
      "view.toolbarNever": toolbarMode === "never",
      "view.statusBar": statusBarOpen,
      "view.menuBar": menuBarOpen,
      "view.modeWysiwyg": viewMode === "wysiwyg",
      "view.modeSource": viewMode === "source",
      "view.modeSplit": viewMode === "split",
      "view.focusMode": focusMode,
      "view.forceFocus": forceFocus,
      "view.typewriter": typewriter,
      "view.readOnly": readOnly,
      "view.fullscreen": fullscreen,
      "view.alwaysOnTop": alwaysOnTop,
    }),
    [
      sidebarOpen,
      sidebarTab,
      dockOpen,
      toolbarMode,
      statusBarOpen,
      menuBarOpen,
      viewMode,
      focusMode,
      forceFocus,
      typewriter,
      readOnly,
      fullscreen,
      alwaysOnTop,
    ],
  );




















  const accelIndex = useMemo(() => buildAccelIndex(menus), [menus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {


      if (e.isComposing || e.keyCode === 229) return;
      if (
        developerMode &&
        webviewDefaultShortcuts &&
        isDeveloperToolsShortcut(e)
      ) {
        e.preventDefault();
        e.stopPropagation();
        menuHandlers["view.devtools"]?.();
        return;
      }
      if (shouldBlockBrowserShortcut(e, developerMode && webviewDefaultShortcuts)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }


      //




      //






      //



      //


      if (e.defaultPrevented) return;

      const id = accelIndex.get(accelSig(eventAccel(e)));
      if (!id) return;


      //





      if (cutPasteBoardKey.has(id)) return;



      if (isOutsideEditor(e.target)) return;





      if (disabledCommands.has(id)) return;

      const handler = menuHandlers[id];


      if (!handler) return;



      //





      e.preventDefault();
      handler();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    accelIndex,
    menuHandlers,
    disabledCommands,
    developerMode,
    webviewDefaultShortcuts,
  ]);

















  useEffect(() => {
    let alreadyUninstall = false;
    let unsubscribe: UnlistenFn | null = null;

    on<string>(events.formatKey, (name2) => {
      const id = hostFormatKey[name2];
      if (!id) return;




      if (isOutsideEditor(document.activeElement)) return;
      if (disabledCommands.has(id)) return;
      menuHandlers[id]?.();
    }).then((f) => {


      if (alreadyUninstall) f();
      else unsubscribe = f;
    });

    return () => {
      alreadyUninstall = true;
      unsubscribe?.();
    };


  }, [menuHandlers, disabledCommands]);









  const [usingNativeMenu, setUsingNativeMenu] = useState(false);

  /** Last successfully installed native-menu fingerprint (`nativeMenuPayloadKey`). */
  const lastNativeMenuKey = useRef<string | null>(null);
  /** Trailing debounce so rapid identical-intent updates coalesce before set_menu. */
  const nativeMenuApplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const language2 = useLanguage();

  useEffect(() => {
    return () => {
      if (nativeMenuApplyTimer.current !== null) {
        clearTimeout(nativeMenuApplyTimer.current);
        nativeMenuApplyTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (menuRenderer !== "system" || !menuBarOpen) {
      if (nativeMenuApplyTimer.current !== null) {
        clearTimeout(nativeMenuApplyTimer.current);
        nativeMenuApplyTimer.current = null;
      }
      lastNativeMenuKey.current = null;
      void api.nativeMenu
        .apply([])
        .then(() => {
          if (alive) setUsingNativeMenu(false);
        })
        .catch((e) => {
          console.warn("[nota] Could not clear the native menu", e);
          if (alive) setUsingNativeMenu(false);
        });
      return () => {
        alive = false;
      };
    }

    const tree = buildNativeTree(menus, disabledCommands, menuChecks, themes, documentTheme);
    const key = nativeMenuPayloadKey(tree);
    // macOS closes any open system menu on every AppHandle::set_menu. Cursor
    // updates rebuild `disabledCommands` with a new Set identity even when the
    // enabled/checked payload is unchanged — skipping identical keys stops the
    // File-menu flicker recorded on macOS.
    if (key === lastNativeMenuKey.current) {
      if (nativeMenuApplyTimer.current !== null) {
        clearTimeout(nativeMenuApplyTimer.current);
        nativeMenuApplyTimer.current = null;
      }
      return;
    }

    if (nativeMenuApplyTimer.current !== null) {
      clearTimeout(nativeMenuApplyTimer.current);
    }
    nativeMenuApplyTimer.current = setTimeout(() => {
      nativeMenuApplyTimer.current = null;
      if (key === lastNativeMenuKey.current) return;
      void api.nativeMenu
        .apply(tree)
        .then((ok) => {
          if (!alive) return;
          if (ok) lastNativeMenuKey.current = key;
          setUsingNativeMenu(ok);
        })
        .catch((e) => {
          console.error("[nota] Native menu unavailable; using the HTML menu bar", e);
          if (alive) setUsingNativeMenu(false);
        });
    }, 100);

    return () => {
      alive = false;
    };
  }, [menus, disabledCommands, menuChecks, themes, documentTheme, menuRenderer, menuBarOpen, language2]);



  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;

    void on<string>(events.nativeMenu, (id) => onNativePick(id)).then((u) => {
      if (alive) unlisten = u;
      else u();
    });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, [onNativePick]);

  return { disabledCommands, menuChecks, usingNativeMenu };
}
