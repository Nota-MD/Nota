

































import { useCallback } from "react";

import type { Settings } from "@/bridge/ipc";
import { t } from "@/i18n";
import { paneWriter } from "@/ui/settings/panes/props";
import type { ConfirmAnswer, ConfirmRequest } from "@/ui/useDialogs";








export function useFocusIntro(
  askConfirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>,
  settings: Settings | null,
  onChange: (patch: Partial<Settings>) => void,
) {








  return useCallback(
    async (start3: () => Promise<void>) => {
      if (!settings) return;
      if (!settings.focus.introduced) {
        const answer = await askConfirm({
          title: t("Force Focus: Before You Begin"),
          message: [
            t(
              "Force Focus maintains an attention balance. The balance increases while you work in the editor and decreases while you are away. If it reaches zero, Nota displays a full-screen alert and plays a sound.",
            ),
            "",
            t("Force Focus uses three system capabilities:"),
            t("① Detecting whether the Nota window is active;"),
            t("② displaying a full-screen, always-on-top alert window;"),
            t("③ playing an alert sound."),
            "",
            t(
              "These capabilities are used only while Force Focus is running. Nota does not read the keyboard, capture screenshots, monitor activity in other applications, or transmit data.",
            ),
            "",
            t(
              "Force Focus can be stopped at any time and can be bypassed with system tools. It is not a lock. Bypassing it defeats the purpose of the feature. If you choose to use it, follow through with the commitment you have set.",
            ),
          ].join("\n"),
          confirmLabel: t("Start Force Focus"),



        });

        if (answer !== "confirm") return;





        //


        //



        paneWriter(settings, onChange, "focus")({ introduced: true });
      }
      await start3();
    },
    [askConfirm, settings, onChange],
  );
}
