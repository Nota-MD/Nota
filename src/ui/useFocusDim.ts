































import { useEffect } from "react";

import type { Settings } from "@/bridge/ipc";


const defaultLevel = "standard";

export function useFocusDim(settings: Settings | null): void {
  useEffect(() => {




    const level = settings?.appearance.focus_mode_dim ?? defaultLevel;
    const root = document.documentElement;
    if (level === defaultLevel) root.removeAttribute("data-focus-dim");
    else root.setAttribute("data-focus-dim", level);
  }, [settings]);
}
