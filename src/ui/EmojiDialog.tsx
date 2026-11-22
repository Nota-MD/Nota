






















import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { useT } from "@/i18n";
import { emojiTable, emojiCategory, withEmergeNumber, type EmojiItem } from "@/editor/emoji";
import { DialogClose } from "@/ui/DialogClose";
import { useTablistKeys } from "@/ui/useTablistKeys";

export function EmojiDialog({
  onAnswer,
}: {

  onAnswer: (character: string | null) => void;
}) {

  const t = useT();
  const [searchSearch, setSearchSearch] = useState("");

  const [category, setCategory] = useState<string | null>(null);
  const inputBox = useRef<HTMLInputElement>(null);

  const pageKeyBar = useRef<HTMLDivElement>(null);
  useTablistKeys(pageKeyBar);

  useEffect(() => {
    inputBox.current?.focus();
  }, []);







  const result2 = useMemo<EmojiItem[]>(() => {
    const pool = category === null ? emojiTable : emojiTable.filter((item5) => item5.category === category);
    const stringValue = searchSearch.trim().replace(/^:/, "").replace(/:$/, "").toLowerCase();
    if (stringValue === "") return pool;
    return pool.filter((item5) => item5.shortcode.includes(stringValue));
  }, [searchSearch, category]);















  const categoryCopy = (oneKind: string) => {
    switch (oneKind) {
      case "Smileys & emotion":
        return t("Smileys");
      case "People & gestures":
        return t("Gestures");
      case "People":
        return t("People");
      case "Animals & nature":
        return t("Animals");
      case "Food & drink":
        return t("Food");
      case "Activities":
        return t("Activities");
      case "Travel & places":
        return t("Travel");
      case "Nature":
        return t("Nature");
      case "Objects":
        return t("Objects");
      case "Symbols":
        return t("Symbols");
      case "Flags":
        return t("Flags");
      default:
        return oneKind;
    }
  };








  const returnCarOrBackOutput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const ordinalOneItem = result2[0];
      if (ordinalOneItem) onAnswer(ordinalOneItem.character);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onAnswer(null);
    }
  };

  return (
    <div className="confirm-backdrop" onMouseDown={() => onAnswer(null)}>
      <div
        className="confirm-dialog emoji-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Insert Emoji")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={() => onAnswer(null)} />
        <h2 className="confirm-title">{t("Insert Emoji")}</h2>

        <input
          id="nota-emoji-search"
          ref={inputBox}
          className="prompt-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={searchSearch}
          placeholder={t("Search shortcodes, e.g. smi or check")}
          onChange={(e) => setSearchSearch(e.target.value)}
          onKeyDown={returnCarOrBackOutput}
        />

        {
                                      }
        <div ref={pageKeyBar} className="emoji-cats" role="tablist" aria-label={t("Emoji category")}>
          <button
            type="button"
            role="tab"
            aria-selected={category === null}
            className={`btn emoji-cat ${category === null ? "btn-primary" : ""}`}
            onClick={() => setCategory(null)}
          >
            {t("All")}
          </button>
          {emojiCategory.map((oneKind) => (
            <button
              key={oneKind}
              type="button"
              role="tab"
              aria-selected={category === oneKind}
              className={`btn emoji-cat ${category === oneKind ? "btn-primary" : ""}`}
              onClick={() => setCategory(oneKind)}
            >
              {categoryCopy(oneKind)}
            </button>
          ))}
        </div>

        {result2.length === 0 ? (
          <p className="prompt-hint">{t("No matching emoji.")}</p>
        ) : (
          <div className="emoji-grid">
            {result2.map((item5) => (


              <button
                key={item5.shortcode}
                type="button"
                className="emoji-cell"
                title={withEmergeNumber(item5.shortcode)}
                onClick={() => onAnswer(item5.character)}
              >
                <span className="emoji-glyph">{item5.character}</span>
                <span className="emoji-name">{withEmergeNumber(item5.shortcode)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="confirm-actions">
          <button type="button" className="btn" onClick={() => onAnswer(null)}>
            {t("Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
