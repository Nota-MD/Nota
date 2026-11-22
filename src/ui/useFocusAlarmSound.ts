


































import { useEffect } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { api, events, on } from "@/bridge/ipc";


const timeLength = 2.4;

const jumpIntervalSeparate = 0.22;

const alpha = 880;
const beta = 1245;

const soundMeasure = 0.28;


let soundFrequency: AudioContext | null = null;

function getSoundFrequency(): AudioContext | null {
  if (soundFrequency) return soundFrequency;
  try {


    soundFrequency = new AudioContext();
    return soundFrequency;
  } catch {
    return null;
  }
}










export function preHotSoundFrequency(): void {
  const ctx = getSoundFrequency();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
}







export async function soundWarnReport(): Promise<boolean> {
  const ctx = getSoundFrequency();
  if (!ctx) return false;




  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  if (ctx.state !== "running") return false;

  try {
    const start5 = ctx.currentTime;
    const vibrateSwing = ctx.createOscillator();
    const increaseBenefit = ctx.createGain();
    vibrateSwing.type = "square";
    vibrateSwing.connect(increaseBenefit);
    increaseBenefit.connect(ctx.destination);


    for (let i = 0; i * jumpIntervalSeparate < timeLength; i++) {
      vibrateSwing.frequency.setValueAtTime(i % 2 === 0 ? alpha : beta, start5 + i * jumpIntervalSeparate);
    }




    increaseBenefit.gain.setValueAtTime(0, start5);
    increaseBenefit.gain.linearRampToValueAtTime(soundMeasure, start5 + 0.03);
    increaseBenefit.gain.setValueAtTime(soundMeasure, start5 + timeLength - 0.2);
    increaseBenefit.gain.linearRampToValueAtTime(0, start5 + timeLength);

    vibrateSwing.start(start5);
    vibrateSwing.stop(start5 + timeLength + 0.02);
    return true;
  } catch {
    return false;
  }
}











export function useFocusAlarmSound(): void {
  useEffect(() => {
    let alreadyUninstall = false;
    let unsubscribe: UnlistenFn | null = null;

    on(events.focusBeep, () => {
      void soundWarnReport().then((success) => {


        if (!success) void api.focus.beep().catch(() => {});
      });
    }).then((f) => {
      if (alreadyUninstall) f();
      else unsubscribe = f;
    });

    return () => {
      alreadyUninstall = true;
      unsubscribe?.();
    };
  }, []);
}
