




























import type { FocusState } from "@/bridge/types";
import { t } from "@/i18n";
import type { tick } from "@/ui/chart-ticks";
import type { PanelShare, PanelShareStat } from "@/ui/panel-nodes";
import { sayTimeLength } from "@/ui/useForceFocus";


export interface AdoptStylePoint {

  seconds: number;

  balance: number;
}








export const adoptStyleLimit = 900;









export const mostShortTotalJoinSeconds = 5;












export function recordValueStroke(oldValue: AdoptStylePoint[], state: FocusState): AdoptStylePoint[] {
  if (!state.running) {
    return oldValue.length === 0 ? oldValue : [];
  }
  const point: AdoptStylePoint = {
    seconds: Math.round(state.elapsed_ms / 1000),
    balance: Math.round(state.balance_ms / 1000),
  };
  const end = oldValue[oldValue.length - 1];
  if (end && end.seconds >= point.seconds) {
    return [...oldValue.slice(0, -1), point];
  }
  const newValue = [...oldValue, point];
  return newValue.length <= adoptStyleLimit ? newValue : extractSparse(newValue);
}












export function extractSparse(point: AdoptStylePoint[]): AdoptStylePoint[] {
  const output2: AdoptStylePoint[] = [];
  for (let i = 0; i < point.length; i += 2) {
    const before2 = point[i]!;
    const after = point[i + 1];
    if (!after) {
      output2.push(before2);
      break;
    }
    output2.push(after.balance >= before2.balance ? after : before2);
  }
  return output2;
}


export interface TotalJoin {

  timeLengthSeconds: number;

  dedicatedNoteSeconds: number;

  leaveOpenSeconds: number;

  warnReport: number;

  adoptStyle: AdoptStylePoint[];
}







export function createTotalJoin(state: FocusState, adoptStyle: AdoptStylePoint[]): TotalJoin {
  return {
    timeLengthSeconds: Math.max(1, Math.round(state.elapsed_ms / 1000)),
    dedicatedNoteSeconds: Math.max(0, Math.round(state.focused_ms / 1000)),
    leaveOpenSeconds: Math.max(0, Math.round(state.away_total_ms / 1000)),
    warnReport: state.alarms,
    adoptStyle,
  };
}


export function valueObtainTotalJoin(total: TotalJoin): boolean {
  return total.timeLengthSeconds >= mostShortTotalJoinSeconds;
}










export function dedicatedNoteRate(total: TotalJoin): number | null {
  const shareMother = total.dedicatedNoteSeconds + total.leaveOpenSeconds;
  if (shareMother <= 0) return null;
  return Math.round((total.dedicatedNoteSeconds / shareMother) * 100);
}










export function sayTimeMoment(now: Date): string {
  const fill = (n: number) => String(n).padStart(2, "0");
  return t(
    "{0}-{1}-{2} {3}",
    String(now.getFullYear()),
    String(now.getMonth() + 1),
    String(now.getDate()),
    `${fill(now.getHours())}:${fill(now.getMinutes())}`,
  );
}


export function textItemTimeMoment(now: Date): string {
  const fill = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${fill(now.getMonth() + 1)}${fill(now.getDate())}` +
    `-${fill(now.getHours())}${fill(now.getMinutes())}`
  );
}











export function horizontalTick(adoptStyle: AdoptStylePoint[]): tick[] {
  if (adoptStyle.length < 2) return [];
  const totalSeconds = adoptStyle[adoptStyle.length - 1]!.seconds;
  return [
    { at: 0, label: sayTimeLength(0) },
    { at: 0.5, label: sayTimeLength((totalSeconds / 2) * 1000) },
    { at: 1, label: sayTimeLength(totalSeconds * 1000) },
  ];
}











export function createShareEnjoyCard(total: TotalJoin, now: Date): PanelShare {


  const balanceSeconds = total.adoptStyle.map((p) => p.balance);
  const point = balanceSeconds.length >= 2 ? balanceSeconds : [balanceSeconds[0] ?? 0, balanceSeconds[0] ?? 0];

  const rate = dedicatedNoteRate(total);
  const threeCells: PanelShareStat[] = [
    { k: t("Session Length"), v: sayTimeLength(total.timeLengthSeconds * 1000), small: "" },
    { k: t("Focus Share"), v: rate === null ? "" : String(rate), small: rate === null ? "" : "%" },






    { k: t("Alarms"), v: String(total.warnReport), small: "" },
  ];

  return {
    title: t("Force Focus"),



    subtitle: "Focus Session",
    date: sayTimeMoment(now),
    label: t("You Focused For"),
    value: sayTimeLength(total.dedicatedNoteSeconds * 1000),
    unit: "",
    points: point,
    xTicks: horizontalTick(total.adoptStyle),
    xMinor: 0,
    shape: "curve",
    heat: null,
    less: "",
    more: "",
    stats: threeCells,
    foot: t("This session you were away for {0}.", sayTimeLength(total.leaveOpenSeconds * 1000)),
    file: `nota-focus-${textItemTimeMoment(now)}.png`,
  };
}
