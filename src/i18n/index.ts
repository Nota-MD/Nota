/**
 * Frontend localization store.
 *
 * English source text is the translation key. Missing entries fall back to the
 * source string:
 *
 * ```ts
 * t("File") // Uses the zh-CN entry, or returns "File" when absent.
 * ```
 *
 * Only translated entries belong in the zh-CN table. A new UI string can call
 * `t("...")` without a registration step. Changing the English source changes
 * the key, so the old translation becomes inactive.
 *
 * The host reports the effective startup language. Changing the language setting
 * requires a restart because plugins load their localization tables at startup.
 *
 * This is a module-level store rather than a React context because pure helper
 * modules also translate text. Components should use `useT` so they subscribe
 * to language changes. Non-component code uses `t`.
 *
 * The frontend fallback must remain `en`, matching the host fallback in
 * `src-tauri/src/lang.rs`.
 */

import { useSyncExternalStore } from "react";

import { middleTextTable } from "@/i18n/zh";

/** Matches the host fallback. Used only when the system language is unknown. */
const fallback = "en";

/** Translation tables. English is absent because source text is the fallback. */
const table2: Record<string, Record<string, string>> = {
  "zh-CN": middleTextTable,
};

let current = fallback;
const listenMany = new Set<() => void>();

/** Apply the language reported by the host during startup. */
export function setLanguage(language: string): void {
  if (language === current) return;
  current = language;
  listenMany.forEach((f) => f());
}

/** Current interface language. */
export function language(): string {
  return current;
}

/**
 * Translate a source string. `{0}`, `{1}` and later values are placeholders.
 * Use distinct source strings when one source needs different translations.
 */
export function t(source: string, ...parameter: (string | number)[]): string {
  const sentence = table2[current]?.[source] ?? source;
  if (parameter.length === 0) return sentence;
  return sentence.replace(/\{(\d+)\}/g, (whole, i: string) => {
    const v = parameter[Number(i)];
    return v === undefined ? whole : String(v);
  });
}

/**
 * Localize language-neutral untitled document names. The Unicode escape keeps
 * legacy host titles compatible while source remains ASCII.
 */
export function localizedDocumentTitle(title: string): string {
  const untitled = /^(?:Untitled|\u672a\u547d\u540d) (\d+)$/.exec(title);
  return untitled ? t("Untitled {0}", untitled[1] ?? "") : title;
}

function subscribeRead(f: () => void): () => void {
  listenMany.add(f);
  return () => listenMany.delete(f);
}

/** Component hook that subscribes to language changes and returns `t`. */
export function useT(): typeof t {
  useSyncExternalStore(subscribeRead, language, language);
  return t;
}

/**
 * Subscribe to the current language value for effects that rebuild language-
 * dependent state but do not render translated text.
 */
export function useLanguage(): string {
  return useSyncExternalStore(subscribeRead, language, language);
}
