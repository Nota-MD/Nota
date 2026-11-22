























import type { FocusState } from "@/bridge/types";
import { useT } from "@/i18n";
import { sayTimeLength } from "@/ui/useForceFocus";

export function FocusMeter({ state }: { state: FocusState | null }) {


  const t = useT();
  if (!state?.running) return null;

  const limit = Math.max(1, state.cap_ms);


  const compareExample = Math.min(1, Math.max(0, state.balance_ms / limit));

  const warnReportMiddle = state.phase === "alarm";
  const walkSpiritMiddle = state.phase === "away";







  const className2 = warnReportMiddle
    ? "status-focus status-focus-alarm"
    : walkSpiritMiddle
      ? "status-focus status-focus-away"
      : "status-focus";

  const description = warnReportMiddle
    ? t("Force Focus: the balance hit zero and the alarm has sounded.")
    : walkSpiritMiddle
      ? state.away_ms < state.grace_ms
        ? t("Force Focus: you switched away, still inside the {0}-second grace period — these seconds are free.", sayTimeLength(state.grace_ms - state.away_ms))
        : t("Force Focus: the balance is being charged. Come back to Nota and the charge stops.")
      : t("Force Focus: you are writing, the balance is rising (cap {0}). Start and stop it under View → Force Focus.", sayTimeLength(state.cap_ms));

  return (
    <span className={className2} title={description}>
      {

                           }
      <span className="status-focus-name">{t("Focus")}</span>
      <span className="status-focus-bar" aria-hidden="true">
        <span className="status-focus-fill" style={{ width: `${compareExample * 100}%` }} />
      </span>
      <span className="status-focus-num">{sayTimeLength(state.balance_ms)}</span>
    </span>
  );
}
