




























import { useT } from "@/i18n";
import { PanelBody } from "@/ui/PanelBody";
import type { PanelNode } from "@/ui/panel-nodes";
import type { ExternalPartCorrectAccording } from "@/ui/useExternalChanges";

interface Props {
  correctAccording: ExternalPartCorrectAccording;

  onClose: () => void;
}


const onlyHasDifferenceExceptionBlock = (
  line3: ExternalPartCorrectAccording["line3"],
): PanelNode[] => [{ kind: "diff", items: line3 }];

export function ExternalDiffPane({ correctAccording, onClose }: Props) {

  const t = useT();

  return (
    <div className="review-pane external-diff-pane">
      <div className="review-bar">
        <span className="review-title" title={correctAccording.title}>
          {t("Changes on disk")} / {correctAccording.title}
        </span>
        <span className="review-spacer" />
        <button
          type="button"
          className="btn review-back"
          onClick={onClose}
          title={t("Hide the comparison and go back to the document (the file on disk is left alone)")}
        >
          {t("Back to the document")}
        </button>
      </div>

      <div className="review-body">
        {correctAccording.line3.length === 0 ? (



          <p className="panel-empty">
            {t("The file on disk and the editor match.")}
          </p>
        ) : (
          <PanelBody




            //



            plugin=""
            nodes={onlyHasDifferenceExceptionBlock(correctAccording.line3)}
            onCall={async () => {}}
            askPrompt={async () => null}
            busy={null}
          />
        )}
      </div>
    </div>
  );
}
