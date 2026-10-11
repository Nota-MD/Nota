/**
 * **语言目录**：一个标签（`de_DE`）→ 本地语名字（`Deutsch`）＋ 短码（`DE`）。
 *
 * # 为什么单独一份、还两份名字都要
 *
 * 用户 2026-10-11 贴了一张 Typora 的「选择拼写检查语言」菜单，说「学学人家的菜单，
 * 你也这么做」。那张菜单里每一行是**左边本地语名字、右边短码**（`Deutsch` / `DE`），
 * 而且名字是**用那门语言自己写的**（`Čeština` 不是 `Czech`、`Ελληνικά` 不是
 * `Greek`）。两边都要有的理由很实在：
 *
 * · **名字**是给人找的——他认得那门语言长什么样；
 * · **短码**是给"我设置里写的是哪个串"对照的——设置页与他手上那本词典的
 *   文件名都长这样（`de_DE.dic`）。
 *
 * # ⚠️ 名字**不走 `t()`**（与界面上别的东西不一样，这是有意的）
 *
 * 一份"本地语名字表"的用处正是**不受界面语言影响**：中文界面下也该写 `Deutsch`。
 * 翻成"德语"之后，一个只会德语的人反而认不出来——而这一格要服务的就是他。
 * 所以这张表与 `tools/i18n-check.sh` 第 ④ 栏（"代码里不许有中文界面文字"）无关：
 * 它不是界面文案，是**语言自己的名字**（和 `en_US` 这个标签同一类）。
 *
 * # 覆盖范围
 *
 * 只收**hunspell 词典真有**的那些语言（约 40 门）。⚠️ 收得不全不会出错：表里没有
 * 的标签**原样显示**（`xx_XX`），那时用户看到的就是设置里那个串本身——不撒谎。
 */

/**
 * 语言主标签（`en` / `de` / `zh`）→ 本地语名字。
 *
 * ⚠️ 名字**互不相同**，哪怕两种写法在中文里都叫"中文"（`中文（简体）` /
 * `中文（繁體）`）——它们在本地语里本来就是两句话。
 */
const 主名: Record<string, string> = {
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
  ja: "日本語",
  ka: "ქართული",
  ko: "한국어",
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
  zh: "中文",
};

/**
 * 具体地区**另有专门写法**的那几个（`en_US` 不是 "English（US）" 而是
 * "English (US)"，`de_CH` 是 "Schweizerdeutsch" 不是 "Deutsch (CH)"）。
 *
 * ⚠️ 这张表**优先于 [`主名`]**，判据是"这一门语言自己有没有专门的名字"：
 * `de_CH` 在德语里就叫 Schweizerdeutsch（不是"瑞士的德语"），
 * `pt_BR` 叫 Português (Brasil)。⚠️ 别照着这张表推——推不出来，它是语言事实。
 */
const 地区名: Record<string, string> = {
  "en_us": "English (US)",
  "en_gb": "English (UK)",
  "en_ca": "English (CA)",
  "en_au": "English (AU)",
  "en_nz": "English (NZ)",
  "de_ch": "Schweizerdeutsch",
  "de_at": "Deutsch (AT)",
  "pt_br": "Português (Brasil)",
  "pt_pt": "Português (Portugal)",
  "zh_cn": "中文（简体）",
  "zh_tw": "中文（繁體）",
  "zh_hk": "中文（香港）",
  "es_mx": "Español (México)",
  "es_ar": "Español (Argentina)",
  "fr_ca": "Français (Canada)",
  "fr_ch": "Français (Suisse)",
  "nb_no": "Bokmål (Norge)",
  "sr_latn": "Srpski (latinica)",
  "ar_sa": "العربية (السعودية)",
};

/** 归一化：`en-US` 与 `en_US` 是同一门（与 `src-tauri/src/spell/store.rs::归一` 一致）。 */
function 归一(标签: string): string {
  return 标签.trim().toLowerCase().replace(/-/g, "_");
}

/**
 * 这一门语言的**本地语名字**。
 *
 * ⚠️ 表里没有的标签**原样返回**（`xx_XX`）：那时候"这个名字是什么"没人知道，
 * 而拿一个编出来的名字糊上去比显示原串坏——用户至少要能照着它去搜。
 */
export function 语言名(标签: string): string {
  const 净 = 归一(标签);
  const 地区 = 地区名[净];
  if (地区) return 地区;
  const [主 = 净, 后缀] = 净.split("_");
  const 本名 = 主名[主];
  if (!本名) return 标签;
  // ⚠️ 带地区/书写系统的那些**必须**把后缀缀上（`en_AG` → `English (AG)`）：
  // 容器里那 25 份词典里有十几份是 `en_*`，不缀的话左边一列会是一整排一模一样的
  // "English"——**左边那一列就废了**（右列还有短码能分辨，但用户是靠名字扫的）。
  if (!后缀) return 本名;
  const 显示 = 后缀.length === 2 ? 后缀.toUpperCase() : 后缀[0]!.toUpperCase() + 后缀.slice(1);
  return `${本名} (${显示})`;
}

/**
 * 右端那个**短码**：`en_US` → `EN-US`（大写、连字符，照 Typora 那一栏）。
 *
 * ⚠️ 换连字符是**给人看的写法**（`EN-US` 是大家认得的样子），而设置里存、
 * 文件名上写的仍是**下划线**那一套（`en_US`）——两个不是一个东西，别互相抄。
 */
export function 语言短码(标签: string): string {
  return 归一(标签).toUpperCase().replace(/_/g, "-");
}
