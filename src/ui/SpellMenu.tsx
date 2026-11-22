








































import { useEffect, useRef, useState } from "react";

import { api, type CombineWriteWordDictionary } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { MenuPopup } from "@/ui/MenuPopup";
import type { MenuEntry } from "@/ui/commands";
import { languageName, languageCode } from "@/ui/spell-langs";


function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/-/g, "_");
}

export function SpellMenu({
  spellcheck,
  language,
  onChangeSpell,
  onDismiss,
}: {

  spellcheck: boolean | null;

  language: string[] | null;




  onChangeSpell: (fill: { open2?: boolean; language?: string[] }) => void;
  onDismiss: () => void;
}) {
  const t = useT();

  const [wordDictionaryPlural, setWordDictionaryPlural] = useState<CombineWriteWordDictionary[] | null>(null);





  const [query, setQuery] = useState("");

  const searchSearchBox = useRef<HTMLInputElement>(null);

  const letPosition = useRef(false);

  useEffect(() => {





    const steal = () => {
      if (!letPosition.current) searchSearchBox.current?.focus();
    };
    steal();






    const belowValueFrame = window.setTimeout(steal, 0);
    return () => window.clearTimeout(belowValueFrame);
  }, []);

  useEffect(() => {


    void api.spell.dictionaries().then(setWordDictionaryPlural).catch(() => setWordDictionaryPlural([]));
  }, []);

  const selectedOf = (language ?? []).map(normalize);
  const alreadyInstall = wordDictionaryPlural ?? [];


  const candidate: string[] = alreadyInstall.map((d) => d.tag);
  for (const tag of language ?? []) {
    if (!candidate.some((c) => normalize(c) === normalize(tag))) candidate.push(tag);
  }
  candidate.sort((a, b) => languageName(a).localeCompare(languageName(b)));









  const cleanCheck = normalize(query.trim());
  const matchOf = cleanCheck === ""
    ? candidate
    : candidate.filter(
        (tag) =>
          normalize(tag).includes(cleanCheck) ||
          normalize(languageName(tag)).includes(cleanCheck) ||
          normalize(languageCode(tag)).includes(cleanCheck),
      );


  const item4 = (id: string, label: string, right?: string): MenuEntry => ({
    id,
    label,
    checkable: true,
    ...(right ? { right } : {}),
  });


  const item: MenuEntry[] = [
    item4("spell.auto", t("Auto-detect language")),
    item4("spell.off", t("Do not check spelling")),
    "sep",
  ];

  if (wordDictionaryPlural !== null && candidate.length === 0) {

    item.push({
      id: "spell.none",
      label: t("No dictionaries on this machine"),
      checkable: false,
    });
  } else if (wordDictionaryPlural !== null && matchOf.length === 0) {


    item.push({ id: "spell.nomatch", label: t("No matching languages"), checkable: false });
  } else {
    for (const tag of matchOf) {


      item.push(item4(`spell.lang:${tag}`, languageName(tag), languageCode(tag)));
    }
  }

  const check: Record<string, boolean> = {


    "spell.auto": spellcheck === true && (language ?? []).length === 0,
    "spell.off": spellcheck === false,
  };
  for (const tag of candidate) check[`spell.lang:${tag}`] = selectedOf.includes(normalize(tag));

  const disabled2 = new Set<string>(
    spellcheck === null || language === null ? ["spell.auto", "spell.off"] : [],
  );

  return (
    <MenuPopup
      label={t("Select spell check language")}




      top={
        <input






          ref={(n) => {
            searchSearchBox.current = n;
            if (n && !letPosition.current) n.focus();
          }}
          type="search"
          className="menu-search"
          value={query}
          placeholder={t("Select spell check language")}
          aria-label={t("Select spell check language")}
          onChange={(e) => setQuery(e.target.value)}


          onBlur={(e) => {
            const goWhich = e.relatedTarget as Node | null;
            const layer = e.currentTarget.closest(".menu-popup");
            if (goWhich && layer?.contains(goWhich)) letPosition.current = true;
          }}


          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "Enter") {
              e.preventDefault();
              letPosition.current = true;



              const layer = e.currentTarget.closest(".menu-popup");
              layer?.querySelector<HTMLButtonElement>("button.menu-item:not(:disabled)")?.focus();
            }
          }}
        />
      }
      entries={item}
      disabled={disabled2}
      checks={check}
      onPick={(id) => {
        if (id === "spell.auto") {

          onChangeSpell({ language: [], open2: true });
          return;
        }
        if (id === "spell.off") {

          onChangeSpell({ open2: false });
          return;
        }
        if (!id.startsWith("spell.lang:")) return;
        const tag = id.slice("spell.lang:".length);
        const match = (language ?? []).find((x) => normalize(x) === normalize(tag));
        const newValue = match ? (language ?? []).filter((x) => x !== match) : [...(language ?? []), tag];




        onChangeSpell({ language: newValue, open2: true });
      }}
      onDismiss={onDismiss}



      onArrowOut={() => {}}
    />
  );
}
