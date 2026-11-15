import type { DocId, Document } from "@/bridge/ipc";
import type { Dialogs } from "@/ui/useDialogs";
import { useWindowRegistry, type WindowRegistryApi } from "@/ui/useWindowRegistry";
import { useWindowTitle } from "@/ui/useWindowTitle";

interface Wiring {
  enabled: boolean;
  windowIdAccel?: string;
  activeDoc: Document | null;
  focusTarget: boolean;
  showFilenameInTitlebar: boolean;
  openPath: (path: string) => Promise<boolean>;
  newDocWithText: (text: string, titleHint: string | null) => Promise<boolean>;
  transferDocToWindow: (id: DocId, targetId: number, focusTarget: boolean) => Promise<boolean>;
  askWindowPick: Dialogs["askWindowPick"];
  toast: (message: string, level?: "info" | "warn" | "error" | "success") => void;
  t: (source: string, ...parameter: (string | number)[]) => string;
}

export function useAppWindowRegistry(w: Wiring): WindowRegistryApi {
  const registry = useWindowRegistry(w);
  useWindowTitle(
    w.enabled ? w.activeDoc?.title ?? null : null,
    w.enabled ? w.activeDoc?.dirty ?? false : false,
    w.enabled && w.showFilenameInTitlebar,
    registry.pickerLabel,
  );
  return registry;
}

