
































import { useCallback, useEffect, useRef, useState } from "react";

import type { FocusState } from "@/bridge/types";
import {
  createTotalJoin,
  valueObtainTotalJoin,
  recordValueStroke,
  type AdoptStylePoint,
  type TotalJoin,
} from "@/ui/focus-summary";

export interface DedicatedNoteTrackTrace {






  joinCompute: TotalJoin | null;

  joinComputeAt: Date | null;

  collapse: () => void;
}

export function useFocusTrace(state: FocusState | null): DedicatedNoteTrackTrace {
  const orderColumn = useRef<AdoptStylePoint[]>([]);
  const endState = useRef<FocusState | null>(null);
  const atRun = useRef(false);

  const [joinCompute, setJoinCompute] = useState<TotalJoin | null>(null);
  const [joinComputeAt, setJoinComputeAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!state) return;

    if (!state.running) {




      if (!atRun.current) return;
      atRun.current = false;

      const snapshot = endState.current;
      endState.current = null;
      const point = orderColumn.current;
      orderColumn.current = [];

      if (!snapshot) return;
      const total = createTotalJoin(snapshot, point);


      if (!valueObtainTotalJoin(total)) return;
      setJoinCompute(total);
      setJoinComputeAt(new Date());
      return;
    }

    orderColumn.current = recordValueStroke(orderColumn.current, state);
    endState.current = state;
    atRun.current = true;
  }, [state]);

  const collapse = useCallback(() => {
    setJoinCompute(null);
    setJoinComputeAt(null);
  }, []);

  return { joinCompute, joinComputeAt, collapse };
}
