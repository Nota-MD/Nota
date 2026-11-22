
































import { useCallback, useEffect, useState } from "react";
import { open as selectTextItem } from "@/ui/file-picker";

import { api, type CombineWriteWordDictionary } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { languageName } from "@/ui/spell-langs";

import { TextInput } from "../primitives";














const commonLanguages: readonly string[] = [
  "zh_CN",
  "zh_TW",
  "en_GB",
  "ja_JP",
  "ko_KR",
  "fr_FR",
  "de_DE",
  "es_ES",
  "pt_BR",
  "ru_RU",
  "it_IT",
  "nl_NL",
  "pl_PL",
  "tr_TR",
  "sv_SE",
];


function normalize(label: string): string {
  return label.toLowerCase().replace(/-/g, "_");
}

export function SpellLangPicker({
  value,
  onChange,
}: {

  value: string[];
  onChange: (languages: string[]) => void;
}) {

  const t = useT();

  const [draftDraft, setDraftDraft2] = useState("");

  const [installActive, setInstallActive] = useState<CombineWriteWordDictionary[] | null>(null);

  const [itemRecord, setItemRecord] = useState("");

  const [guideEnterResult, setGuideEnterResult] = useState<{ good: boolean; speech: string } | null>(null);

  const refreshNewValue = useCallback(() => {
    void api.spell
      .dictionaries()
      .then(setInstallActive)
      .catch(() => setInstallActive([]));
  }, []);

  useEffect(() => {
    refreshNewValue();
    void api.spell.dictDir().then(setItemRecord).catch(() => {});
  }, [refreshNewValue]);

  const alreadyInstall = new Set((installActive ?? []).map((d) => normalize(d.tag)));



  const candidate: string[] = (installActive ?? []).map((d) => d.tag);
  for (const tag of commonLanguages) if (!alreadyInstall.has(normalize(tag))) candidate.push(tag);


  for (const v of value) if (!candidate.some((c) => normalize(c) === normalize(v))) candidate.push(v);

  const check = (tag: string) => {
    const match = value.find((x) => normalize(x) === normalize(tag));
    onChange(match ? value.filter((x) => x !== match) : [...value, tag]);
  };

  const addCustom = () => {
    const clean = draftDraft.trim();
    if (clean === "" || value.some((x) => normalize(x) === normalize(clean))) {
      setDraftDraft2("");
      return;
    }
    onChange([...value, clean]);
    setDraftDraft2("");
  };


  const guideEnter = async () => {
    const path = await selectTextItem({
      multiple: false,
      filters: [{ name: "Dictionary", extensions: ["zip"] }],
    });
    if (typeof path !== "string") return;
    try {
      const label = await api.spell.dictImport(path);
      refreshNewValue();



      if (!value.some((x) => normalize(x) === normalize(label))) onChange([...value, label]);
      setGuideEnterResult({ good: true, speech: t("Imported {0}", label) });
    } catch (e) {
      setGuideEnterResult({ good: false, speech: String(e) });
    }
  };

  return (
    <div className="stg-langs">
      <label className="stg-lang">
        <input
          type="checkbox"
          checked={value.length === 0}

          onChange={() => onChange([])}
        />
        <span className="stg-lang-tag">{t("Follow the system")}</span>
      </label>

      <div className="stg-lang-list">
        {candidate.map((tag) => {
          const has = alreadyInstall.has(normalize(tag));
          const selected = value.some((x) => normalize(x) === normalize(tag));
          return (
            <label className="stg-lang" key={tag}>
              <input type="checkbox" checked={selected} onChange={() => check(tag)} />
              <span className="stg-lang-tag">{tag}</span>
              <span className="stg-lang-name">{languageName(tag)}</span>
              {!has && <span className="stg-lang-missing">{t("not installed")}</span>}
            </label>
          );
        })}
      </div>

      <div className="stg-lang-add">
        {
                                           }
        <TextInput value={draftDraft} placeholder="en_US" onChange={setDraftDraft2} />
        <button type="button" className="btn stg-action" onClick={addCustom}>
          {t("Add")}
        </button>
      </div>

      {

                             }
      <div className="stg-lang-source">
        <div className="stg-lang-actions">
          <button type="button" className="btn stg-action" onClick={() => void guideEnter()}>
            {t("Import dictionary (.zip)…")}
          </button>
          <button
            type="button"
            className="btn stg-action"
            onClick={() => void api.spell.dictReveal().catch(() => {})}
          >
            {t("Show dictionary folder")}
          </button>
        </div>
        {                                              }
        {itemRecord !== "" && <div className="stg-lang-dir">{itemRecord}</div>}
        <div className="stg-lang-hint">
          {t(
            "Nota does not include dictionaries. Install a system dictionary (for example, {0}), import a ZIP archive containing an .aff and a .dic file, or place both files in the folder above.",
            "hunspell-en-US",
          )}
        </div>
        {guideEnterResult && (
          <div className={guideEnterResult.good ? "stg-lang-ok" : "stg-lang-err"}>{guideEnterResult.speech}</div>
        )}
      </div>
    </div>
  );
}
