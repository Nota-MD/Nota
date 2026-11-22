






















import { useCallback, useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { api, events, on } from "@/bridge/ipc";
import type { FocusState } from "@/bridge/types";

export interface StrongMakeDedicatedNoteOutputMouth {







  state: FocusState | null;

  start: () => Promise<void>;

  stop: () => Promise<void>;

  ack: () => Promise<void>;
}

export function useForceFocus(): StrongMakeDedicatedNoteOutputMouth {
  const [state, setState] = useState<FocusState | null>(null);

  useEffect(() => {
    let alreadyUninstall = false;
    let unsubscribe: UnlistenFn | null = null;



    api.focus
      .get()
      .then((s) => {

        if (!alreadyUninstall) setState((oldValue) => oldValue ?? s);
      })
      .catch(() => {


        if (!alreadyUninstall) setState((oldValue) => oldValue ?? { ...emptyState });
      });

    on<FocusState>(events.focusState, setState).then((f) => {

      if (alreadyUninstall) f();
      else unsubscribe = f;
    });

    return () => {
      alreadyUninstall = true;
      unsubscribe?.();
    };
  }, []);




  const start = useCallback(async () => {
    await api.focus.start();
  }, []);
  const stop = useCallback(async () => {
    await api.focus.stop();
  }, []);
  const ack = useCallback(async () => {
    await api.focus.ack();
  }, []);

  return { state, start, stop, ack };
}


const emptyState: FocusState = {
  running: false,
  balance_ms: 0,
  cap_ms: 0,
  phase: "focusing",
  away_ms: 0,
  grace_ms: 0,
  elapsed_ms: 0,
  focused_ms: 0,
  away_total_ms: 0,
  alarms: 0,
};










export function sayTimeLength(milliSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliSeconds / 1000));
  const time = Math.floor(totalSeconds / 3600);
  const share = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const fill = (n: number) => String(n).padStart(2, "0");
  return time > 0 ? `${time}:${fill(share)}:${fill(seconds)}` : `${share}:${fill(seconds)}`;
}
