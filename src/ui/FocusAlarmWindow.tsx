




























import { useEffect, useState } from "react";

import { useT } from "@/i18n";
import { useForceFocus } from "@/ui/useForceFocus";

export function FocusAlarmWindow() {
  const t = useT();
  const { state, ack } = useForceFocus();


  const [pressPassDone, setPressPassDone] = useState(false);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPressPassDone(true);
        void ack();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ack]);




  const ordinalHowManyCount = state?.alarms ?? 0;

  return (
    <div className="alarm-root">
      <div className="alarm-card">
        {

                                                             }
        <h1 className="alarm-title">{t("Back to Writing")}</h1>

        <p className="alarm-sub">
          {ordinalHowManyCount > 1
            ? t("This is alarm {0} of this session.", ordinalHowManyCount)
            : t("The account balance has been charged to zero.")}
        </p>

        {

                                             }
        <p className="alarm-hint">
          {t("Press the button below to go back to writing; the balance starts again from zero.")}
        </p>

        <button
          type="button"
          className="btn alarm-btn"
          disabled={pressPassDone}
          onClick={() => {
            setPressPassDone(true);
            void ack();
          }}
        >
          {pressPassDone ? t("Returning…") : t("I'm Back")}
        </button>
      </div>
    </div>
  );
}
