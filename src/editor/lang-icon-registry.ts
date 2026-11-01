type RealIconModule = typeof import("./lang-icons-real");

let loaded: RealIconModule | null = null;
let loading: Promise<void> | null = null;

/** Load the 93 bundled language logos after the editor is already usable. */
export function ensureLanguageIcons(): Promise<void> {
  loading ??= import("./lang-icons-real")
    .then((module) => {
      loaded = module;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

export function hasDedicatedBelongIcon(language: string): boolean {
  return loaded !== null && loaded.iconName(language) !== null;
}

export function languageIconsReady(): boolean {
  return loaded !== null;
}

export function representTableLanguage(language: string): string {
  return loaded?.representTableLanguage(language) ?? language;
}

export function relatedIconLanguages(language: string): readonly string[] {
  if (language === "math") return ["math", "latex", "tex"];
  if (!loaded) return [language];
  const representative = loaded.representTableLanguage(language);
  return loaded.iconGroup.find((group) => group.language.includes(representative))?.language ?? [language];
}

export function realLanguageIconURI(language: string): string | null {
  return loaded?.assertValueIconURI(language) ?? null;
}
