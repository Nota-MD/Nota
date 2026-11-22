





























import { useT } from "@/i18n";
import type { ExternalPartChangeAction } from "@/ui/useExternalChanges";

interface Props {
  changeAction: ExternalPartChangeAction[];
  ignoreOmit: (id: number) => void;
  heavyNewValueLoadEnter: (id: number) => void;
  checkSeeFixChange: (id: number) => void;

  correctAtSee: number | null;

  closeCorrectAccording: () => void;
}

export function ExternalChangeBar({
  changeAction,
  ignoreOmit,
  heavyNewValueLoadEnter,
  checkSeeFixChange,
  correctAtSee,
  closeCorrectAccording,
}: Props) {

  const t = useT();


  if (changeAction.length === 0) return null;

  return (
    <div className="external-change-bar" role="status">
      {changeAction.map((value) => (
        <div className="external-change-row" key={value.id}>
          {
                                                   }
          <span className="external-change-text" title={value.path}>
            {t("“{0}” was changed on disk by another program.", value.title)}
          </span>
          <span className="external-change-spacer" />
          <button
            type="button"
            className="btn external-change-btn"
            onClick={() =>
              correctAtSee === value.id ? closeCorrectAccording() : checkSeeFixChange(value.id)
            }
            title={t("Show what differs between the file on disk and what is in the editor")}
          >
            {correctAtSee === value.id ? t("Hide comparison") : t("View changes")}
          </button>
          <button
            type="button"
            className="btn external-change-btn"
            onClick={() => void heavyNewValueLoadEnter(value.id)}
            title={t("Replace the editor contents with the file on disk (unsaved changes are lost — you are asked first)")}
          >
            {t("Reload from disk")}
          </button>
          <button
            type="button"
            className="btn external-change-btn"
            onClick={() => ignoreOmit(value.id)}
            title={t("Leave it alone: keep editing, and overwrite the file on disk when you save")}
          >
            {t("Ignore")}
          </button>
        </div>
      ))}
    </div>
  );
}
