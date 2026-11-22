

































import type { ComponentProps, Dispatch, SetStateAction } from "react";

import type { Document, Settings, ViewMode } from "@/bridge/ipc";
import type { CommandState } from "@/editor/command-state";
import type { FocusState } from "@/bridge/types";
import type { StatusMetric } from "@/bridge/types-settings";
import type { SelectionSnapshot } from "@/editor/caret-snapshot";
import { StatusBar } from "@/ui/StatusBar";


type BarOfprops = ComponentProps<typeof StatusBar>;

export function useStatusBar(wiring: {

  settings: Settings | null;

  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  viewMode: ViewMode;

  setMode: (m: ViewMode) => void;

  doc: Document | null;

  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;

  focus: FocusState | null;









  setUi: (patch: Partial<Settings["appearance"]>) => void;





  cursor: CommandState | null;
  selection: SelectionSnapshot | null;






  pluginDock: { open2: boolean; splitReplace: () => void } | null;
}): BarOfprops {
  const {
    settings,
    updateSettings,
    viewMode,
    setMode,
    doc,
    sidebarOpen,
    setSidebarOpen,
    focus,
    setUi,
    cursor,
    selection,
    pluginDock,
  } = wiring;

  return {
    doc,
    cursor,
    selection,
    pluginDock,
    mode: viewMode,
    sidebarOpen,

    focus,


    readingSpeed: settings?.appearance.reading_speed ?? 382,




    metric: settings?.appearance.status_metric ?? "words",




    spellcheck: settings?.editor.spellcheck ?? null,






    combineWriteLanguage: settings?.editor.spellcheck_langs ?? null,






    onPickMetric: (m: StatusMetric) => {
      if (!settings) return;
      void updateSettings({ appearance: { ...settings.appearance, status_metric: m } });
    },















    onChangeSpell: (fill: { open2?: boolean; language?: string[] }) => {
      if (!settings) return;
      void updateSettings({
        editor: {
          ...settings.editor,
          ...(fill.open2 === undefined ? {} : { spellcheck: fill.open2 }),
          ...(fill.language === undefined ? {} : { spellcheck_langs: fill.language }),
        },
      });
    },


    onToggleSidebar: () => setSidebarOpen((v) => !v),







    onToggleSource: () => {
      setMode(viewMode === "source" ? "wysiwyg" : "source");
    },




    onHide: () => setUi({ show_status_bar: false }),
  };
}
