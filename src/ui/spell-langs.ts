
































const mainName: Record<string, string> = {
  af: "Afrikaans",
  ar: "العربية",
  be: "Беларуская",
  bg: "Български",
  bn: "বাংলা",
  bs: "Bosanski",
  ca: "Català",
  cs: "Čeština",
  cy: "Cymraeg",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  en: "English",
  eo: "Esperanto",
  es: "Español",
  et: "Eesti",
  eu: "Euskara",
  fa: "فارسی",
  fi: "Suomi",
  fr: "Français",
  ga: "Gaeilge",
  gl: "Galego",
  he: "עברית",
  hi: "हिन्दी",
  hr: "Hrvatski",
  hu: "Magyar",
  hy: "Հայերեն",
  id: "Bahasa Indonesia",
  is: "Íslenska",
  it: "Italiano",
  ja: "Japanese",
  ka: "ქართული",
  ko: "\u{d55c}\u{ad6d}\u{c5b4}",
  lt: "Lietuvių",
  lv: "Latviešu",
  mk: "Македонски",
  nb: "Bokmål",
  nl: "Nederlands",
  nn: "Nynorsk",
  pl: "Polski",
  pt: "Português",
  ro: "Română",
  ru: "Русский",
  sk: "Slovenčina",
  sl: "Slovenščina",
  sq: "Shqip",
  sr: "Српски",
  sv: "Svenska",
  ta: "தமிழ்",
  th: "ไทย",
  tr: "Türkçe",
  uk: "Українська",
  vi: "Tiếng Việt",
  zh: "Chinese",
};









const localAreaName: Record<string, string> = {
  "en_us": "English (US)",
  "en_gb": "English (UK)",
  "en_ca": "English (CA)",
  "en_au": "English (AU)",
  "en_nz": "English (NZ)",
  "de_ch": "Schweizerdeutsch",
  "de_at": "Deutsch (AT)",
  "pt_br": "Português (Brasil)",
  "pt_pt": "Português (Portugal)",
  "zh_cn": "Chinese (Simplified)",
  "zh_tw": "Chinese (Traditional)",
  "zh_hk": "Chinese (Hong Kong)",
  "es_mx": "Español (México)",
  "es_ar": "Español (Argentina)",
  "fr_ca": "Français (Canada)",
  "fr_ch": "Français (Suisse)",
  "nb_no": "Bokmål (Norge)",
  "sr_latn": "Srpski (latinica)",
  "ar_sa": "العربية (السعودية)",
};


function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/-/g, "_");
}







export function languageName(label: string): string {
  const clean = normalize(label);
  const localArea = localAreaName[clean];
  if (localArea) return localArea;
  const [main = clean, extension] = clean.split("_");
  const localName = mainName[main];
  if (!localName) return label;



  if (!extension) return localName;
  const show = extension.length === 2 ? extension.toUpperCase() : extension[0]!.toUpperCase() + extension.slice(1);
  return `${localName} (${show})`;
}







export function languageCode(label: string): string {
  return normalize(label).toUpperCase().replace(/_/g, "-");
}
