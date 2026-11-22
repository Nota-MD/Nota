




















































































import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { Settings, ToolbarMode } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";


const bottomPartTriggerBand = 64;


export interface ExternalShellWiring {

  mainArea: RefObject<HTMLElement | null>;







  workToolBar: RefObject<HTMLElement | null>;






  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
}

export function useChromeVisibility(
  settings: Settings | null,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
  refs: ExternalShellWiring,
) {


  const t = useT();


  const { toast } = refs;
  const statusBarOpen = settings?.appearance.show_status_bar ?? true;
  const toolbarMode: ToolbarMode = settings?.appearance.toolbar ?? "never";



  const menuBarOpen = settings?.appearance.show_menu_bar ?? true;




  const [peek, setPeek] = useState(false);
  const peekRef = useRef(false);






  const updatePeek = useCallback((next: boolean) => {
    if (peekRef.current === next) return;
    peekRef.current = next;
    setPeek(next);
  }, []);

  useEffect(() => {
    const main = refs.mainArea.current;
    if (!main) return;
    let frame = 0;
    const resize = new ResizeObserver(() => schedule());
    const history = new MutationObserver(() => {
      observeBottomBars();
      schedule();
    });

    const measure = () => {
      frame = 0;
      const bars = main.querySelectorAll<HTMLElement>(":scope > .tabbar, :scope > .statusbar");
      let height = 0;
      for (const bar of bars) height += bar.getBoundingClientRect().height;
      main.style.setProperty("--nota-bottom-bar-height", `${height}px`);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };
    const observeBottomBars = () => {
      resize.disconnect();
      for (const bar of main.querySelectorAll(":scope > .tabbar, :scope > .statusbar")) {
        resize.observe(bar);
      }
    };

    observeBottomBars();
    history.observe(main, { childList: true });
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      history.disconnect();
      main.style.removeProperty("--nota-bottom-bar-height");
    };
  }, [refs.mainArea]);

  useEffect(() => {



    refs.mainArea.current?.setAttribute("data-toolbar", toolbarMode);

    if (toolbarMode !== "hover") {
      updatePeek(false);
      return;
    }

    const determine = (e: PointerEvent) => {
      const bar = refs.workToolBar.current;
      if (bar) {
        const main = refs.mainArea.current?.getBoundingClientRect();
        const barBox = bar.getBoundingClientRect();
        const menuBoxes = Array.from(bar.querySelectorAll(".format-menu")).map((menu) =>
          menu.getBoundingClientRect(),
        );
        const insideBar =
          e.clientX >= barBox.left &&
          e.clientX <= barBox.right &&
          e.clientY >= barBox.top - 8 &&
          e.clientY <= barBox.bottom + 8;
        const insideMenu = menuBoxes.some(
          (box) =>
            e.clientX >= box.left &&
            e.clientX <= box.right &&
            e.clientY >= box.top &&
            e.clientY <= box.bottom,
        );
        const nearBottomBand =
          !!main &&
          e.clientY >= main.bottom - bottomPartTriggerBand &&
          e.clientY <= main.bottom;
        updatePeek(insideBar || insideMenu || nearBottomBand);
        return;
      }
      const mainArea = refs.mainArea.current?.getBoundingClientRect();
      if (!mainArea) {
        updatePeek(false);
        return;
      }
      updatePeek(e.clientY >= mainArea.bottom - bottomPartTriggerBand && e.clientY <= mainArea.bottom);
    };

    const store = () => updatePeek(false);

    window.addEventListener("pointermove", determine);


    window.addEventListener("blur", store);
    document.documentElement.addEventListener("pointerleave", store);
    return () => {
      window.removeEventListener("pointermove", determine);
      window.removeEventListener("blur", store);
      document.documentElement.removeEventListener("pointerleave", store);
    };
  }, [toolbarMode, refs.mainArea, refs.workToolBar, updatePeek]);


  const formatBarOpen = toolbarMode === "always" || (toolbarMode === "hover" && peek);






  const setChrome = useCallback(
    (patch: Partial<Settings["appearance"]>) => {
      if (!settings) return;
      void updateSettings({ appearance: { ...settings.appearance, ...patch } });
    },
    [settings, updateSettings],
  );

















  const aboveCountMenuBar = useRef<boolean | null>(null);
  useEffect(() => {
    if (!settings) return;
    const aboveCount = aboveCountMenuBar.current;
    aboveCountMenuBar.current = menuBarOpen;
    if (aboveCount === null || aboveCount === menuBarOpen || menuBarOpen) return;
    toast(
      t(
        "Menu bar hidden. Press Alt+M or open Settings ▸ Appearance ▸ Show menu bar to bring it back.",
      ),
      "info",
      6000,
    );
  }, [settings, menuBarOpen, toast, t]);












  const hideToolbar = useCallback(() => setChrome({ toolbar: "never" }), [setChrome]);

  return { statusBarOpen, formatBarOpen, menuBarOpen, toolbarMode, setChrome, hideToolbar };
}
