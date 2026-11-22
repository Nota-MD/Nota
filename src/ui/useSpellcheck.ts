




































import { useEffect } from "react";

import { api } from "@/bridge/ipc";
import { currentLanguageLabel, setCombineWriteFlag, setCombineWriteLanguage } from "@/editor/spell-check";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface CombineWriteWiring {

  open2: boolean | null;








  language: string[] | null;
  toast: (message: string, level?: Toast["level"]) => void;
}


function normalize(label: string): string {
  return label.toLowerCase().replace(/-/g, "_");
}

const missingDictionaryNotice = "nota.spell.missing-dictionary-alerts.v1";

function readPassNoticeRecordRecord(): Set<string> {
  try {
    const source = localStorage.getItem(missingDictionaryNotice);
    const table2: unknown = source ? JSON.parse(source) : [];
    return new Set(Array.isArray(table2) ? table2.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeNoticeRecordRecord(labels: Set<string>): void {
  try {
    localStorage.setItem(missingDictionaryNotice, JSON.stringify([...labels].sort()));
  } catch {

  }
}

export function useSpellcheck(w: CombineWriteWiring): void {


  const t = useT();
  const { open2, language, toast } = w;


  //


  useEffect(() => {



    void api.webview.scrollHard().catch(() => {});



    let computeDone = false;
    void (async () => {
      for (let i = 1; i <= 6 && !computeDone; i++) {
        try {
          const actual = await api.webview.spellcheckSet(false);
          if (actual === false) return;
        } catch {

          return;
        }
        if (i < 6) await new Promise((r) => setTimeout(r, 500));
      }
    })();

    return () => {
      computeDone = true;
    };
  }, []);


  useEffect(() => {


    if (open2 === null) return;
    setCombineWriteFlag(open2);
  }, [open2]);


  useEffect(() => {

    if (language === null) return;


    setCombineWriteLanguage(language[0] ?? "");

    let computeDone = false;
    void (async () => {
      let has: Awaited<ReturnType<typeof api.spell.dictionaries>>;
      try {
        has = await api.spell.dictionaries();
      } catch {


        return;
      }
      if (computeDone) return;
      const installActiveOf = new Set(has.map((d) => normalize(d.tag)));




      //





      const noneHasOf =
        language.length > 0
          ? language.filter((tag) => !installActiveOf.has(normalize(tag)))
          : has.length === 0
            ? [currentLanguageLabel()]
            : [];
      const noticePass = readPassNoticeRecordRecord();
      const installAboveOf = [...noticePass].filter((tag) => installActiveOf.has(tag));
      for (const tag of installAboveOf) noticePass.delete(tag);
      const returnNoneSay = noneHasOf.filter((tag) => !noticePass.has(normalize(tag)));
      if (returnNoneSay.length > 0) {
        toast(
          t(
            "This machine has no dictionary for {0}, so words in that language will not be checked. Nota ships no dictionaries of its own — install one, or import a .zip under Settings → Editor → Spell check.",
            returnNoneSay.join(", "),
          ),
          "error",
        );
        for (const tag of returnNoneSay) noticePass.add(normalize(tag));
      }
      if (returnNoneSay.length > 0 || installAboveOf.length > 0) writeNoticeRecordRecord(noticePass);
    })();

    return () => {
      computeDone = true;
    };
  }, [language, t, toast]);
}
