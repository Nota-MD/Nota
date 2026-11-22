































import { useCallback, useMemo } from "react";

import type { Settings } from "@/bridge/types";
import type { TotalJoin } from "@/ui/focus-summary";
import type { ConfirmAnswer, ConfirmRequest } from "@/ui/useDialogs";
import { useFocusAlarmSound, preHotSoundFrequency } from "@/ui/useFocusAlarmSound";
import { useForceFocus, type StrongMakeDedicatedNoteOutputMouth } from "@/ui/useForceFocus";
import { useFocusIntro } from "@/ui/useFocusIntro";
import { useFocusTrace } from "@/ui/useFocusTrace";








export interface DedicatedNoteTotalJoinValue {
  total: TotalJoin;
  now: Date;
}

export interface DedicatedNoteMeetingSpeechOutputMouth {

  dedicatedNoteState: StrongMakeDedicatedNoteOutputMouth["state"];

  dedicatedNoteMoveLineMiddle: boolean;

  splitReplaceStrongMakeDedicatedNote: () => void;

  dedicatedNoteTotalJoin: DedicatedNoteTotalJoinValue | null;

  closeDedicatedNoteTotalJoin: () => void;
}

export function useFocusSession({
  askConfirm,
  settings,
  updateSettings,
}: {
  askConfirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>;
  settings: Settings | null;
  updateSettings: (patch: Partial<Settings>) => void;
}): DedicatedNoteMeetingSpeechOutputMouth {
  const { state: dedicatedNoteState, start: startFocus, stop: stopEndDedicatedNote } = useForceFocus();
  useFocusAlarmSound();
  const firstDescriptionAgainDedicatedNote = useFocusIntro(askConfirm, settings, updateSettings);




  const { joinCompute: dedicatedNoteJoinCompute, joinComputeAt: dedicatedNoteJoinComputeAt, collapse: collapseFocusSummary } =
    useFocusTrace(dedicatedNoteState);

  const dedicatedNoteTotalJoin = useMemo(
    () => (dedicatedNoteJoinCompute && dedicatedNoteJoinComputeAt ? { total: dedicatedNoteJoinCompute, now: dedicatedNoteJoinComputeAt } : null),
    [dedicatedNoteJoinCompute, dedicatedNoteJoinComputeAt],
  );












  const dedicatedNoteMoveLineMiddle = dedicatedNoteState?.running ?? false;
  const splitReplaceStrongMakeDedicatedNote = useCallback(() => {
    if (dedicatedNoteMoveLineMiddle) {
      void stopEndDedicatedNote();
      return;
    }



    //




    preHotSoundFrequency();
    void firstDescriptionAgainDedicatedNote(async () => {
      await startFocus();
    });
  }, [dedicatedNoteMoveLineMiddle, stopEndDedicatedNote, startFocus, firstDescriptionAgainDedicatedNote]);

  return {
    dedicatedNoteState,
    dedicatedNoteMoveLineMiddle,
    splitReplaceStrongMakeDedicatedNote,
    dedicatedNoteTotalJoin,
    closeDedicatedNoteTotalJoin: collapseFocusSummary,
  };
}
