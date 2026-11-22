








































import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface immersiveWiring {











  hasFloatingLayer: boolean;
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
}

export interface immersiveApi {

  immersive: boolean;
  focusMode: boolean;
  splitReplaceDedicatedNote: () => void;
  fullscreen: boolean;
  /** Window is maximized, but not necessarily in native full screen. */
  maximized: boolean;
  toggleFullscreen: () => void;

  exitImmersive: () => void;
}

export function useImmersive(w: immersiveWiring): immersiveApi {


  const t = useT();
  const { hasFloatingLayer, toast } = w;

  const [focusMode, setFocusMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [maximized, setMaximized] = useState(false);


  const syncWindowState = useCallback(async () => {
    try {
      const window = getCurrentWindow();
      const [nextFullscreen, nextMaximized] = await Promise.all([
        window.isFullscreen(),
        window.isMaximized(),
      ]);
      setFullscreen(nextFullscreen);
      setMaximized(nextMaximized);
    } catch {


    }
  }, []);

  useEffect(() => {
    void syncWindowState();

    let unsubscribe: (() => void) | null = null;
    void getCurrentWindow()
      .onResized(() => void syncWindowState())
      .then((f) => {
        unsubscribe = f;
      })
      .catch(() => {

      });
    return () => unsubscribe?.();
  }, [syncWindowState]);

  const toggleFullscreen = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      await win.setFullscreen(!(await win.isFullscreen()));
    } catch (e) {
      toast(t("Could not toggle full screen: {0}", String(e)), "error");
    } finally {



      void syncWindowState();
    }
  }, [toast, syncWindowState]);

  const splitReplaceDedicatedNote = useCallback(() => setFocusMode((v) => !v), []);








  const exitImmersive = useCallback(() => {
    setFocusMode(false);


    if (fullscreen) void toggleFullscreen();
  }, [fullscreen, toggleFullscreen]);


  const immersive = focusMode || fullscreen;


  //


  useEffect(() => {
    if (!immersive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (e.isComposing || e.keyCode === 229) return;
      if (hasFloatingLayer) return;
      e.preventDefault();
      exitImmersive();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive, exitImmersive, hasFloatingLayer]);











  const lastImmersive = useRef(false);
  useEffect(() => {
    if (immersive === lastImmersive.current) return;
    lastImmersive.current = immersive;
    if (!immersive) return;

    const path2 = t("Move the mouse to the very top of the window to bring the menu bar back");
    toast(
      focusMode && fullscreen
        ? t("Focus + full screen: press F8 / F11 / Esc to exit, {0}", path2)
        : fullscreen
          ? t("Full screen: press F11 or Esc to exit, {0}", path2)
          : t("Focus mode: press F8 or Esc to exit, {0}", path2),
      "info",
      6000,
    );
  }, [immersive, focusMode, fullscreen, toast]);

  return {
    immersive,
    focusMode,
    splitReplaceDedicatedNote,
    fullscreen,
    maximized,
    toggleFullscreen,
    exitImmersive,
  };
}
