import { useCallback, useEffect, useRef, useState } from "react";

import { api, type DocId, type WindowTransferRequest } from "@/bridge/ipc";
import { accelSig, eventAccel, parseAccel } from "@/ui/accel";
import type { Dialogs } from "@/ui/useDialogs";
import { formatWindowId } from "@/ui/window-picker";

interface Wiring {
  enabled: boolean;
  windowIdAccel?: string;
  focusTarget: boolean;
  openPath: (path: string) => Promise<boolean>;
  newDocWithText: (text: string, titleHint: string | null) => Promise<boolean>;
  transferDocToWindow: (id: DocId, targetId: number, focusTarget: boolean) => Promise<boolean>;
  askWindowPick: Dialogs["askWindowPick"];
  toast: (message: string, level?: "info" | "warn" | "error" | "success") => void;
  t: (source: string, ...parameter: (string | number)[]) => string;
}

export interface WindowRegistryApi {
  id: number | null;
  ids: number[];
  pickerActive: boolean;
  pickerLabel: string | null;
  peek: boolean;
  showWindowId: () => void;
  moveTabToWindow: (id: DocId) => Promise<boolean>;
}

export function useWindowRegistry(w: Wiring): WindowRegistryApi {
  const { enabled, focusTarget, openPath, newDocWithText, transferDocToWindow, askWindowPick, toast, t } = w;
  const [id, setId] = useState<number | null>(null);
  const [ids, setIds] = useState<number[]>([]);
  const [pickerActive, setPickerActive] = useState(false);
  const [peek, setPeek] = useState(false);
  const polling = useRef(false);
  const peekHeld = useRef(false);
  const peekTimer = useRef<number | null>(null);

  const clearPeekTimer = useCallback(() => {
    if (peekTimer.current !== null) {
      window.clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
  }, []);

  const showWindowId = useCallback(() => {
    peekHeld.current = false;
    clearPeekTimer();
    setPeek(true);
    peekTimer.current = window.setTimeout(() => {
      peekTimer.current = null;
      setPeek(false);
    }, 1200);
  }, [clearPeekTimer]);

  const acceptTransfer = useCallback(
    async (request: WindowTransferRequest) => {
      let ok = false;
      let error: string | null = null;
      try {
        if (request.path) {
          ok = await openPath(request.path);
          if (!ok) error = t("The target window could not open the document.");
        } else if (request.text !== null) {
          ok = await newDocWithText(request.text, request.titleHint);
          if (!ok) error = t("The target window could not create the document.");
        } else {
          error = t("The transfer contained no document.");
        }
      } catch (cause) {
        error = String(cause);
      }
      try {
        await api.window.ackTransfer(request.requestId, ok, error, request.focusTarget);
      } catch (cause) {
        toast(String(cause), "error");
      }
    },
    [newDocWithText, openPath, t, toast],
  );

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const poll = async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const snapshot = await api.window.registrySnapshot();
        if (!alive) return;
        setId(snapshot.id);
        setIds(snapshot.ids);
        setPickerActive(snapshot.pickerActive);
        const request = await api.window.takeTransfer();
        if (alive && request) await acceptTransfer(request);
      } catch {
        // Runtime files can disappear while another window exits.
      } finally {
        polling.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 300);
    return () => {
      alive = false;
      window.clearInterval(timer);
      void api.window.pickerMode(false).catch(() => undefined);
    };
  }, [acceptTransfer, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const target = w.windowIdAccel ? parseAccel(w.windowIdAccel) : null;
    if (!target) return;
    const targetSignature = accelSig(target);
    const show = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.repeat ||
        accelSig(eventAccel(event)) !== targetSignature
      ) {
        return;
      }
      event.preventDefault();
      clearPeekTimer();
      peekHeld.current = true;
      setPeek(true);
    };
    const hide = (event?: KeyboardEvent) => {
      if (!peekHeld.current) return;
      if (
        event &&
        ["Control", "Meta", "Alt", "Shift"].includes(event.key)
      ) {
        return;
      }
      peekHeld.current = false;
      setPeek(false);
    };
    const clear = () => hide();
    window.addEventListener("keydown", show, true);
    window.addEventListener("keyup", hide, true);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", show, true);
      window.removeEventListener("keyup", hide, true);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      clearPeekTimer();
    };
  }, [clearPeekTimer, enabled, w.windowIdAccel]);

  const moveTabToWindow = useCallback(
    async (docId: DocId) => {
      if (id === null || ids.length < 2) {
        toast(t("Open another Nota window before moving this tab."), "info");
        return false;
      }
      setPickerActive(true);
      try {
        await api.window.pickerMode(true);
        const target = await askWindowPick({ currentId: id, ids });
        if (target === null) return false;
        return await transferDocToWindow(docId, target, focusTarget);
      } catch (cause) {
        toast(String(cause), "error");
        return false;
      } finally {
        setPickerActive(false);
        await api.window.pickerMode(false).catch(() => undefined);
      }
    },
    [askWindowPick, focusTarget, id, ids, t, toast, transferDocToWindow],
  );

  return {
    id,
    ids,
    pickerActive,
    pickerLabel: pickerActive && id !== null ? formatWindowId(id, ids) : null,
    peek,
    showWindowId,
    moveTabToWindow,
  };
}

