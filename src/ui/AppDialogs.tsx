





















import { lazy, Suspense } from "react";

import { api } from "@/bridge/ipc";
import type { TotalJoin } from "@/ui/focus-summary";
import type { CommandPaletteWiring } from "@/ui/CommandPalette";
import type { Dialogs } from "@/ui/useDialogs";
import type { exportApi, PandocGate } from "@/ui/useExport";

const AboutDialog = lazy(() =>
  import("@/ui/AboutDialog").then((m) => ({ default: m.AboutDialog })),
);
const CommandPalette = lazy(() =>
  import("@/ui/CommandPalette").then((m) => ({ default: m.CommandPalette })),
);
const FirstRunGuide = lazy(() =>
  import("@/ui/FirstRunGuide").then((m) => ({ default: m.FirstRunGuide })),
);
const ConfirmDialog = lazy(() =>
  import("@/ui/ConfirmDialog").then((m) => ({ default: m.ConfirmDialog })),
);
const PromptDialog = lazy(() =>
  import("@/ui/PromptDialog").then((m) => ({ default: m.PromptDialog })),
);
const WindowPickerDialog = lazy(() =>
  import("@/ui/WindowPickerDialog").then((m) => ({ default: m.WindowPickerDialog })),
);
const ImageDialog = lazy(() =>
  import("@/ui/ImageDialog").then((m) => ({ default: m.ImageDialog })),
);
const LinkDialog = lazy(() =>
  import("@/ui/LinkDialog").then((m) => ({ default: m.LinkDialog })),
);
const EmojiDialog = lazy(() =>
  import("@/ui/EmojiDialog").then((m) => ({ default: m.EmojiDialog })),
);
const FocusSummaryDialog = lazy(() =>
  import("@/ui/FocusSummaryDialog").then((m) => ({ default: m.FocusSummaryDialog })),
);
const PandocPanel = lazy(() =>
  import("@/ui/PandocPanel").then((m) => ({ default: m.PandocPanel })),
);

export function AppDialogs({
  dialog,
  pandocGate,
  pandocGateActions,
  dedicatedNoteTotalJoin,
  closeDedicatedNoteTotalJoin,
  debugMode,
  onSetDebugMode,
  windowPresentation,
  firstRunSeen,
  commandPalette,
}: {
  dialog: Dialogs;

  pandocGate: PandocGate | null;

  pandocGateActions: exportApi["pandocGateActions"];








  dedicatedNoteTotalJoin: { total: TotalJoin; now: Date } | null;

  closeDedicatedNoteTotalJoin: () => void;
  debugMode: boolean;
  onSetDebugMode: (enabled: boolean) => void;
  windowPresentation: "full" | "embedded" | "external";
  firstRunSeen: boolean;
  commandPalette: CommandPaletteWiring | null;
}) {
  const { confirmReq, answerConfirm, promptReq, answerPrompt, windowPickReq, answerWindowPick } = dialog;
  const { imageReq, answerImage, linkReq, answerLink, emojiOpen, answerEmoji } = dialog;
  const { aboutOpen, closeAbout, firstRunOpen, openFirstRun, closeFirstRun } = dialog;

  return (
    <Suspense fallback={null}>
      {commandPalette && <CommandPalette {...commandPalette} />}
      {                                           }
      {pandocGate && (
        <PandocPanel probe={pandocGate.probe} format={pandocGate.format} {...pandocGateActions} />
      )}

      {confirmReq && (
        <ConfirmDialog
          title={confirmReq.title}
          message={confirmReq.message}
          confirmLabel={confirmReq.confirmLabel}
          danger={confirmReq.danger}
          hideCancel={confirmReq.hideCancel}















          extraLabel={confirmReq.extraLabel}
          onAnswer={answerConfirm}
        />
      )}

      {promptReq && <PromptDialog {...promptReq} onAnswer={answerPrompt} />}

      {windowPickReq && (
        <WindowPickerDialog request={windowPickReq} onAnswer={answerWindowPick} />
      )}

      {imageReq && <ImageDialog request={imageReq} onAnswer={answerImage} />}

      {
                                        }
      {linkReq && <LinkDialog request={linkReq} onAnswer={answerLink} />}

      {
                                             }
      {emojiOpen && <EmojiDialog onAnswer={answerEmoji} />}

      {aboutOpen && windowPresentation !== "external" && (
        <AboutDialog
          onClose={closeAbout}
          debugMode={debugMode}
          onSetDebugMode={onSetDebugMode}
          onOpenGuide={() => {
            closeAbout();
            openFirstRun();
          }}
          presentation={windowPresentation === "full" ? "full" : "embedded"}
        />
      )}

      {firstRunOpen && (
        <FirstRunGuide
          presentation={windowPresentation === "full" ? "full" : "embedded"}
          onDone={() => {
            if (firstRunSeen) {
              closeFirstRun();
              return;
            }
            void api.settings
              .completeOnboarding()
              .then(closeFirstRun)
              .catch((error) => {
                console.error("[nota] Could not complete onboarding:", error);
              });
          }}
        />
      )}

      {

                                        }
      {dedicatedNoteTotalJoin && (
        <FocusSummaryDialog
          total={dedicatedNoteTotalJoin.total}
          now={dedicatedNoteTotalJoin.now}
          onClose={closeDedicatedNoteTotalJoin}
        />
      )}
    </Suspense>
  );
}
