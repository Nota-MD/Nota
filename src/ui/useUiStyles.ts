




























import { useCallback, useEffect, useState } from "react";

import { api, type Settings, type UiStyleInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { applyUiStyleCss } from "@/styles/ui-style";
import type { Toast } from "@/ui/Toasts";
import { useBootReveal } from "@/ui/useBootReveal";
import { chooseDirectory, open } from "@/ui/file-picker";

export interface WindCellOutputMouth {

  styles: UiStyleInfo[];




  ready: boolean;

  openStylesDir: () => Promise<void>;

  refreshStyles: () => Promise<void>;
  /** Pick and import a theme ZIP or one Typora CSS file. */
  importTheme: () => Promise<void>;
  /** Pick and import a flat Typora theme directory. */
  importTyporaTheme: () => Promise<void>;
}

export function useUiStyles(
  settings: Settings | null,
  toast: (message: string, level?: Toast["level"]) => void,
  refreshDocumentThemes: () => void,
  revealMain = true,
): WindCellOutputMouth {

  const t = useT();
  const [styles, setStyles] = useState<UiStyleInfo[]>([]);
  const [ready, setReady] = useState(false);
  const [scan, setScan] = useState(0);
  const id = settings?.ui_style ?? "";
  const hasSettings = settings !== null;
  useBootReveal(revealMain && settings !== null && ready);



  useEffect(() => {
    if (!hasSettings) {
      setReady(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const list = await api.uiStyle.list();
        if (!alive) return;
        setStyles(list);
        const hasTextItem = list.some((style) => style.id === id && !style.builtin);
        const css = hasTextItem ? await api.uiStyle.css(id) : null;
        if (!alive) return;
        applyUiStyleCss(css);
      } catch (e) {



        console.warn("[nota] Could not read the UI style list:", e);
        if (alive) applyUiStyleCss(null);
      } finally {
        if (alive) setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [hasSettings, id, scan]);

  const openStylesDir = useCallback(async () => {
    try {


      await api.uiStyle.openDir();
    } catch (e) {
      toast(t("Could not open the styles folder: {0}", String(e)), "error");
    }
  }, [toast, t]);

  const refreshStyles = useCallback(async () => {
    setScan((value) => value + 1);
  }, []);

  const importThemePath = useCallback(async (path: string) => {
    try {
      const report = await api.theme.importPath(path);
      refreshDocumentThemes();
      setScan((value) => value + 1);
      const imported = [
        ...report.ui.map((id) => `UI: ${id}`),
        ...report.document.map((id) => `Document: ${id}`),
      ];
      toast(t("Imported theme package: {0}", imported.join(", ")), "success");
    } catch (error) {
      toast(t("Could not import the theme package: {0}", String(error)), "error");
    }
  }, [refreshDocumentThemes, t, toast]);

  const importTheme = useCallback(async () => {
    const path = await open({
      title: t("Import theme package or Typora CSS"),
      multiple: false,
      filters: [
        { name: t("Theme package or CSS"), extensions: ["zip", "css"] },
      ],
    }).catch(() => null);
    if (path) await importThemePath(path);
  }, [importThemePath, t]);

  const importTyporaTheme = useCallback(async () => {
    const path = await chooseDirectory({
      title: t("Import Typora theme folder"),
    }).catch(() => null);
    if (path) await importThemePath(path);
  }, [importThemePath, t]);

  return {
    styles,
    ready,
    openStylesDir,
    refreshStyles,
    importTheme,
    importTyporaTheme,
  };
}
