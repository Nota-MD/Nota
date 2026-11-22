


























import { useEffect } from "react";

import type { Settings } from "@/bridge/ipc";
import { applyTheme } from "@/styles/applyTheme";
import { useZoom, type ShrinkReleaseAction } from "@/ui/useZoom";

export function useAppearance(
  settings: Settings | null,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
): ShrinkReleaseAction {
  useEffect(() => {



    if (settings) return applyTheme(settings);
  }, [settings]);




  //


  //





  return useZoom(settings, updateSettings);
}
