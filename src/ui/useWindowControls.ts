































import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { api } from "@/bridge/ipc";
import { useT } from "@/i18n";

export interface windowControlWiring {

  toast: (text: string, kind?: "info" | "error") => void;
}

export interface windowControlApi {

  alwaysOnTop: boolean;

  toggleAlwaysOnTop: () => Promise<void>;

  openDevTools: () => Promise<void>;







  openNewWindow: (path?: string) => Promise<void>;
}

export function useWindowControls(w: windowControlWiring): windowControlApi {
  const { toast } = w;


  const t = useT();

  const [alwaysOnTop, setAlwaysOnTop] = useState(false);







  const syncAlwaysOnTop = useCallback(async () => {
    try {
      setAlwaysOnTop(await getCurrentWindow().isAlwaysOnTop());
    } catch {

    }
  }, []);

  useEffect(() => {
    void syncAlwaysOnTop();
    let unsubscribe: (() => void) | null = null;
    void getCurrentWindow()
      .onFocusChanged(() => void syncAlwaysOnTop())
      .then((f) => {
        unsubscribe = f;
      })
      .catch(() => {

      });
    return () => unsubscribe?.();
  }, [syncAlwaysOnTop]);

  const toggleAlwaysOnTop = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      await win.setAlwaysOnTop(!(await win.isAlwaysOnTop()));
    } catch (e) {
      toast(t("Could not toggle Always on Top: {0}", String(e)), "error");
    } finally {



      void syncAlwaysOnTop();
    }
  }, [toast, t, syncAlwaysOnTop]);

  const openDevTools = useCallback(async () => {
    try {
      await api.window.openDevtools();
    } catch (e) {
      toast(t("Could not open the developer tools: {0}", String(e)), "error");
    }
  }, [toast, t]);

  const openNewWindow = useCallback(
    async (path?: string) => {
      try {
        await api.window.openNew(path);
      } catch (e) {



        toast(t("Could not open a new window: {0}", String(e)), "error");
      }
    },
    [toast, t],
  );

  return { alwaysOnTop, toggleAlwaysOnTop, openDevTools, openNewWindow };
}
