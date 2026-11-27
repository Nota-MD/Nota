import { useEffect, useRef, useState, type KeyboardEvent as keyDiskEvent } from "react";

import { correctRuleWriteBrokenDone, defaultFindOptions, type FindOptions, type FindStatus } from "@/editor/find";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";

interface Props {

  status: FindStatus;

  onQuery: (query: string, options: FindOptions) => void;

  onStep: (direction: 1 | -1) => void;

  onReplace: (text: string) => void;

  onReplaceAll: (text: string) => void;

  onClose: () => void;


  showReplaceReplace: boolean;
}

export function FindBar({
  status,
  onQuery,
  onStep,
  onReplace,
  onReplaceAll,
  onClose,
  showReplaceReplace,
}: Props) {


  const t = useT();


  const flagGroup: { key: keyof FindOptions; label: string; title: string }[] = [
    { key: "caseSensitive", label: "Aa", title: t("Match Case") },
    { key: "wholeWord", label: t("Word"), title: t("Match Whole Word: a match cannot be part of a longer word") },


    { key: "regex", label: ".*", title: t("Regular Expression (a broken pattern is flagged right away)") },


    { key: "wildcard", label: "\u2731", title: t("Wildcards: * for any run of characters, ? for exactly one") },
  ];
  const [query, setQuery] = useState("");
  const [replaceReplaceBecome, setReplaceReplaceBecome] = useState("");
  const [options, setOptions] = useState<FindOptions>(defaultFindOptions);


  const [manualExpand, setManualExpand] = useState(false);
  const queryBox = useRef<HTMLInputElement>(null);


  const aboveReport = useRef(onQuery);
  aboveReport.current = onQuery;


  useEffect(() => {
    queryBox.current?.focus();
  }, []);


  useEffect(() => {


    aboveReport.current(query, {
      ...options,
      wholeWord: options.regex ? false : options.wholeWord,


      wildcard: options.regex ? false : options.wildcard,
      regex: options.wildcard ? false : options.regex,
    });
  }, [query, options]);


  const writeBrokenDone = correctRuleWriteBrokenDone(query, options);


  const countNumber =
    writeBrokenDone
      ? t("Invalid regex")
      : status.query === ""
        ? ""
        : status.total === 0
          ? t("No results")
          : `${status.current} / ${status.total}`;


  const groupCharacterMiddle = (e: keyDiskEvent) =>
    e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;

  return (
    <div
      className="find-bar"
      role="search"
      aria-label={t("Find and Replace")}


      onKeyDown={(e) => {
        if (groupCharacterMiddle(e)) return;
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >


      <div className="find-row">
        <input
          ref={queryBox}
          className="find-input"
          type="text"
          value={query}
          placeholder={t("Find")}
          spellCheck={false}
          aria-label={t("Search text")}


          data-bad={writeBrokenDone || undefined}

          aria-invalid={writeBrokenDone || undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (groupCharacterMiddle(e)) return;
            if (e.key === "Enter") {
              e.preventDefault();

              onStep(e.shiftKey ? -1 : 1);
            }
          }}
        />


        <span className="find-count" data-bad={writeBrokenDone || undefined} aria-live="polite">
          {countNumber}
        </span>
        {flagGroup.map((s) => (


          (() => {


            const loseResponsive =
              (s.key === "wholeWord" && options.regex) ||
              (s.key === "wildcard" && options.regex) ||
              (s.key === "regex" && options.wildcard);
            return (
          <button
            key={s.key}
            type="button"
            className="find-toggle"
            data-on={!loseResponsive && options[s.key]}
            data-off={loseResponsive || undefined}
            aria-pressed={!loseResponsive && options[s.key]}
            disabled={loseResponsive}
            title={loseResponsive ? t("Not used while Regular Expression is on — \\b does the same job") : s.title}


            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOptions((p) => ({ ...p, [s.key]: !p[s.key] }))}
          >
            {s.label}
          </button>
            );
          })()
        ))}
        <button
          type="button"
          className="find-btn"
          title={t("Previous")}
          aria-label={t("Previous")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onStep(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="find-btn"
          title={t("Next")}
          aria-label={t("Next")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onStep(1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="find-toggle"
          data-on={showReplaceReplace || manualExpand}
          aria-expanded={showReplaceReplace || manualExpand}
          title={(showReplaceReplace || manualExpand) ? t("Hide Replace") : t("Show Replace (Ctrl+H)")}
          aria-label={(showReplaceReplace || manualExpand) ? t("Hide Replace") : t("Show Replace")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setManualExpand((v) => !v)}
        >

          {(showReplaceReplace || manualExpand) ? "⌃" : "⌄"}
        </button>
        <button
          type="button"
          className="find-btn"
          title={t("Close (Esc)")}
          aria-label={t("Close Find")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
        >
          <Icon name="nota-close-symbolic" />
        </button>
      </div>
      {(showReplaceReplace || manualExpand) && (

      <div className="find-row">
        <input
          className="find-input"
          type="text"
          value={replaceReplaceBecome}
          placeholder={t("Replace with")}
          spellCheck={false}
          aria-label={t("Replacement text")}
          onChange={(e) => setReplaceReplaceBecome(e.target.value)}
        />
        <button
          type="button"
          className="find-btn find-btn-wide"


          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onReplace(replaceReplaceBecome)}
        >
          {t("Replace")}
        </button>
        <button
          type="button"
          className="find-btn find-btn-wide"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onReplaceAll(replaceReplaceBecome)}
        >
          {t("Replace All")}
        </button>
      </div>
      )}
    </div>
  );
}
