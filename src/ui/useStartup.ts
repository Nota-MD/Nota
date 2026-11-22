






















































import { useEffect } from "react";

import { api, type DocThemeInfo, type Settings, type StartupAction } from "@/bridge/ipc";
import { setLanguage, t } from "@/i18n";
import type { Toast } from "@/ui/Toasts";
import { markStartupReady } from "@/ui/useBootReveal";
import { debugError, debugEvent } from "@/ui/debug-log";





export const BUILTIN_DOC_THEMES: DocThemeInfo[] = [
  { id: "adwaita", name: "Adwaita", builtin: true },
  { id: "adwaita-dark", name: "Adwaita Dark", builtin: true },
];

export interface StartActionWiring {
  setSettings: (s: Settings) => void;
  setWorkspace: (w: string | null) => void;
  setThemes: (t: DocThemeInfo[]) => void;

  openPath: (path: string) => Promise<unknown>;












  connectAboveMeetingSpeech: (startActionTextItem: string | null, startActionLevel: StartupAction) => Promise<void>;
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
  /** Show the compact first-run guide after the native window is visible. */
  showFirstRun: () => void;
}

export function useStartup(w: StartActionWiring): void {
  const { setSettings, setWorkspace, setThemes, openPath, connectAboveMeetingSpeech, toast, showFirstRun } = w;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {



        //





        //



        const workWorkAreaTaskTask = api.workspace.get();


        const themeTask = api.theme.list();

        //




        const startActionTextItemTaskTask = api.startupFile().catch((e) => {
          debugError("startup", "command-line file lookup failed", e);
          toast(t("Could not open the file from the command line: {0}", String(e)), "error");
          return null;
        });
        const [s, settingsIssue, uiLanguage] = await Promise.all([
          api.settings.get(),


          api.settings.problem(),

          api.appLang().catch(() => null),
        ]);
        if (!alive) return;

        if (uiLanguage) setLanguage(uiLanguage.effective);
        setSettings(s);
        if (!s.general.onboarding_seen) {
          const show = () => showFirstRun();
          if (document.documentElement.dataset.windowShown === "true") window.setTimeout(show, 0);
          else window.addEventListener("nota-window-shown", show, { once: true });
        }
        debugEvent("startup", "settings ready", {
          language: uiLanguage?.effective ?? "unknown",
          ui_style: s.ui_style,
          ui_mode: s.ui_mode,
          document_theme: s.document_theme,
          startup: s.files?.startup ?? "new-file",
        });
        void workWorkAreaTaskTask
          .then((ws) => {
            if (alive) {
              setWorkspace(ws);
              debugEvent("startup", "workspace restored", { path: ws ?? "" });
            }
          })
          .catch((e) => {
            if (alive) debugError("startup", "workspace lookup failed", e);
          });
        void themeTask
          .then((themeList) => {
            if (alive) {
              setThemes(themeList.length > 0 ? themeList : BUILTIN_DOC_THEMES);
              debugEvent("startup", "document theme inventory ready", {
                count: themeList.length || BUILTIN_DOC_THEMES.length,
              });
            }
          })
          .catch((e) => {
            if (alive) {
              setThemes(BUILTIN_DOC_THEMES);
              debugError("startup", "document theme inventory failed", e);
            }
          });

        const startActionTextItem = await startActionTextItemTaskTask;
        if (!alive) return;
        debugEvent("startup", "command-line file resolved", {
          present: Boolean(startActionTextItem),
        });

        if (settingsIssue) toast(t("The settings could not be read; starting with defaults this time. {0}", String(settingsIssue)), "error", 0);


        const startActionLevel: StartupAction = s.files?.startup ?? "new-file";


        const alreadyEnableActionTextItem = startActionTextItem ? await openPath(startActionTextItem) : false;
        if (startActionTextItem) {
          debugEvent("startup", "command-line file open finished", {
            opened: Boolean(alreadyEnableActionTextItem),
          });
        }




        //


        //





        await connectAboveMeetingSpeech(alreadyEnableActionTextItem ? startActionTextItem : null, startActionLevel);
        debugEvent("startup", "session restore finished");
        markStartupReady();
      } catch (e) {
        debugError("startup", "startup state failed", e);
        toast(t("Could not read the state at startup: {0}", String(e)), "error");
      }


      try {
        await api.frontendReady();
        debugEvent("startup", "frontend ready handshake sent");
      } catch (e) {
        debugError("startup", "frontend ready handshake failed", e);
      }
    })();

    return () => {
      alive = false;
    };



  }, [toast, openPath, connectAboveMeetingSpeech, setSettings, setWorkspace, setThemes, showFirstRun]);
}
