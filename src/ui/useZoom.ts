

























































































import { useCallback, useEffect, useMemo, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import type { Settings } from "@/bridge/ipc";
import { showZoomHud } from "@/ui/zoom-hud-state";


const shrinkReleaseMostSmall = 50;
const shrinkReleaseMostLarge = 300;
const shrinkReleaseStepLength = 10;


const characterNumberMostSmall = 12;
const characterNumberMostLarge = 32;
const characterNumberStepLength = 1;

export const recommendedEditorFontSize = 15;


const dropDiskDelayDelay = 400;

function clamp(value2: number, mostSmall: number, mostLarge: number, fallback: number): number {
  if (!Number.isFinite(value2)) return fallback;
  return Math.min(mostLarge, Math.max(mostSmall, Math.round(value2)));
}

let holdComplainPass = false;








async function setShrinkRelease(hundredShareCompare: number) {
  try {
    await getCurrentWebview().setZoom(clamp(hundredShareCompare, shrinkReleaseMostSmall, shrinkReleaseMostLarge, 100) / 100);
  } catch (e) {
    if (!holdComplainPass) {
      holdComplainPass = true;
      console.warn("[nota] Could not set interface zoom (expected outside Tauri):", e);
    }
  }
}








function setCharacterNumber(px: number) {
  const root = document.documentElement;
  root.dataset.editorFontSize = "custom";
  root.style.setProperty(
    "--editor-font-size",
    `${clamp(px, characterNumberMostSmall, characterNumberMostLarge, recommendedEditorFontSize)}px`,
  );
}


function useAccumulateDisk(): { arrange: (drop: () => void) => void; getClear: () => void } {
  const fixedTimeDevice = useRef<number | null>(null);
  const arrange = useCallback((drop: () => void) => {
    if (fixedTimeDevice.current !== null) window.clearTimeout(fixedTimeDevice.current);
    fixedTimeDevice.current = window.setTimeout(() => {
      fixedTimeDevice.current = null;
      drop();
    }, dropDiskDelayDelay);
  }, []);
  const getClear = useCallback(() => {
    if (fixedTimeDevice.current !== null) window.clearTimeout(fixedTimeDevice.current);
  }, []);




  return useMemo(() => ({ arrange, getClear }), [arrange, getClear]);
}








export interface ShrinkReleaseAction {
  releaseLarge: () => void;
  shrinkSmall: () => void;

  restorePosition: () => void;
}

export function useZoom(
  settings: Settings | null,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
): ShrinkReleaseAction {
  const a = settings?.appearance ?? null;
  const thinkShrinkRelease = a?.zoom ?? 100;



  const thinkCharacterNumber = settings?.ui_font_size ?? recommendedEditorFontSize;
  const allowAllowRollWheel = a?.ctrl_wheel_zoom ?? false;
  const target = a?.ctrl_wheel_target ?? "font_size";



  const settingsReady = a !== null;



  const alreadyShouldUseShrinkRelease = useRef(clamp(thinkShrinkRelease, shrinkReleaseMostSmall, shrinkReleaseMostLarge, 100));
  const alreadyShouldUseCharacterNumber = useRef(clamp(thinkCharacterNumber, characterNumberMostSmall, characterNumberMostLarge, recommendedEditorFontSize));
  const publishedHud = useRef({
    zoom: alreadyShouldUseShrinkRelease.current,
    font: alreadyShouldUseCharacterNumber.current,
  });
  const shouldUseShrinkReleaseRef = useRef<(value: number) => void>(() => {});
  const shouldUseCharacterNumberRef = useRef<(value: number) => void>(() => {});


  const mostNewValueAppearance = useRef(a);
  mostNewValueAppearance.current = a;

  useEffect(() => {
    if (!settingsReady) return;
    alreadyShouldUseShrinkRelease.current = clamp(thinkShrinkRelease, shrinkReleaseMostSmall, shrinkReleaseMostLarge, 100);




    alreadyShouldUseCharacterNumber.current = clamp(thinkCharacterNumber, characterNumberMostSmall, characterNumberMostLarge, recommendedEditorFontSize);
    void setShrinkRelease(thinkShrinkRelease);
  }, [settingsReady, thinkShrinkRelease, thinkCharacterNumber]);

  const shrinkReleaseGate = useAccumulateDisk();
  const characterNumberGate = useAccumulateDisk();

  const arrangeDropDiskShrinkRelease = useCallback(
    (zoom: number) => {
      shrinkReleaseGate.arrange(() => {


        const now = mostNewValueAppearance.current;
        if (!now) return;
        void updateSettings({ appearance: { ...now, zoom } });
      });
    },
    [updateSettings, shrinkReleaseGate],
  );

  const arrangeDropDiskCharacterNumber = useCallback(
    (ui_font_size: number) => {
      characterNumberGate.arrange(() => {
        const now = mostNewValueAppearance.current;
        if (!now) return;



        mostNewValueAppearance.current = { ...now, custom_font_size: true };
        void updateSettings({
          ui_font_size,
          appearance: { ...now, custom_font_size: true },
        });
      });
    },
    [updateSettings, characterNumberGate],
  );








  const shouldUseShrinkRelease = useCallback(
    (value2: number) => {
      const belowValueCell = clamp(value2, shrinkReleaseMostSmall, shrinkReleaseMostLarge, 100);

      if (belowValueCell === alreadyShouldUseShrinkRelease.current) return;
      alreadyShouldUseShrinkRelease.current = belowValueCell;
      void setShrinkRelease(belowValueCell);
      arrangeDropDiskShrinkRelease(belowValueCell);
      publishedHud.current.zoom = belowValueCell;
      showZoomHud(
        `${belowValueCell}%`,
        () => shouldUseShrinkReleaseRef.current(belowValueCell + shrinkReleaseStepLength),
        () => shouldUseShrinkReleaseRef.current(belowValueCell - shrinkReleaseStepLength),
        () => shouldUseShrinkReleaseRef.current(100),
      );
    },
    [arrangeDropDiskShrinkRelease],
  );
  shouldUseShrinkReleaseRef.current = shouldUseShrinkRelease;

  const shouldUseCharacterNumber = useCallback(
    (value2: number) => {
      const belowValueCell = clamp(
        value2,
        characterNumberMostSmall,
        characterNumberMostLarge,
        recommendedEditorFontSize,
      );
      if (belowValueCell === alreadyShouldUseCharacterNumber.current) return;
      alreadyShouldUseCharacterNumber.current = belowValueCell;
      setCharacterNumber(belowValueCell);
      arrangeDropDiskCharacterNumber(belowValueCell);
      publishedHud.current.font = belowValueCell;
      showZoomHud(
        `${Math.round((belowValueCell / recommendedEditorFontSize) * 100)}%`,
        () => shouldUseCharacterNumberRef.current(belowValueCell + characterNumberStepLength),
        () => shouldUseCharacterNumberRef.current(belowValueCell - characterNumberStepLength),
        () => shouldUseCharacterNumberRef.current(recommendedEditorFontSize),
      );
    },
    [arrangeDropDiskCharacterNumber],
  );
  shouldUseCharacterNumberRef.current = shouldUseCharacterNumber;

  useEffect(() => {
    if (!settingsReady) return;
    const nextZoom = clamp(
      thinkShrinkRelease,
      shrinkReleaseMostSmall,
      shrinkReleaseMostLarge,
      100,
    );
    const nextFont = clamp(
      thinkCharacterNumber,
      characterNumberMostSmall,
      characterNumberMostLarge,
      recommendedEditorFontSize,
    );
    if (nextZoom !== publishedHud.current.zoom) {
      publishedHud.current.zoom = nextZoom;
      showZoomHud(
        `${nextZoom}%`,
        () => shouldUseShrinkReleaseRef.current(nextZoom + shrinkReleaseStepLength),
        () => shouldUseShrinkReleaseRef.current(nextZoom - shrinkReleaseStepLength),
        () => shouldUseShrinkReleaseRef.current(100),
      );
    }
    if (nextFont !== publishedHud.current.font) {
      publishedHud.current.font = nextFont;
      showZoomHud(
        `${Math.round((nextFont / recommendedEditorFontSize) * 100)}%`,
        () => shouldUseCharacterNumberRef.current(nextFont + characterNumberStepLength),
        () => shouldUseCharacterNumberRef.current(nextFont - characterNumberStepLength),
        () => shouldUseCharacterNumberRef.current(recommendedEditorFontSize),
      );
    }
  }, [settingsReady, thinkCharacterNumber, thinkShrinkRelease]);

  useEffect(() => {
    if (!allowAllowRollWheel) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;


      e.preventDefault();

      if (target === "font_size") {
        shouldUseCharacterNumber(
          alreadyShouldUseCharacterNumber.current +
            (e.deltaY < 0 ? characterNumberStepLength : -characterNumberStepLength),
        );
        return;
      }




      shouldUseShrinkRelease(alreadyShouldUseShrinkRelease.current + (e.deltaY < 0 ? shrinkReleaseStepLength : -shrinkReleaseStepLength));
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });


  }, [allowAllowRollWheel, target, shouldUseCharacterNumber, shouldUseShrinkRelease]);



  useEffect(
    () => () => {
      shrinkReleaseGate.getClear();
      characterNumberGate.getClear();
    },
    [shrinkReleaseGate, characterNumberGate],
  );


  //



  //




  return useMemo<ShrinkReleaseAction>(
    () => ({
      releaseLarge: () => {
        if (!settingsReady) return;
        shouldUseShrinkRelease(alreadyShouldUseShrinkRelease.current + shrinkReleaseStepLength);
      },
      shrinkSmall: () => {
        if (!settingsReady) return;
        shouldUseShrinkRelease(alreadyShouldUseShrinkRelease.current - shrinkReleaseStepLength);
      },
      restorePosition: () => {
        if (!settingsReady) return;
        shouldUseShrinkRelease(100);
      },
    }),
    [settingsReady, shouldUseShrinkRelease],
  );
}
