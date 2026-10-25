/**
 * 「拼写检查」那几门语言的选择器 ＋ **词典从哪儿来**（2026-10-10 建，2026-10-11 大改）。
 *
 * # 候选从哪儿来：**问真话**
 *
 * 2026-10-10 那一版是一张**写死的表**：那时候列不出"这台机器装了哪些词典"
 * （enchant 那片地里的四种列法全不靠谱，逐条实测记在 `commands/webview.rs`
 * 文件头），所以候选写成"常见的十六门 ＋ 用户自己敲"，而"有没有"只能靠
 * 设完之后读内核那一串来判断。
 *
 * ⚠️ **2026-10-11 起这条推翻了**：引擎换成我们自己的之后（`spell/native.rs`
 * 的 zspell），"哪些词典能用"变成**我们能直接回答**的一件事——它只认
 * `.aff`/`.dic`，所以"扫得到"与"用得了"是同一件事（`spell/store.rs::列出`）。
 * 于是这一格按**两档**画：
 *
 * | 档 | 长相 | 意思 |
 * |---|---|---|
 * | **这台机器上有** | 勾选框 ＋ 标签 ＋ 名字 ＋ 来源小字 | 勾上就真能用 |
 * | **常见、但这台机器上没有** | 勾选框 ＋ 标签 ＋ 名字 ＋ 灰掉的「未安装」 | 勾得上（用户可以先勾着，装上之后不用回来改），但**当场就看得见现在用不了** |
 *
 * ⚠️ 第二档**不做成点不动的**：真点不动的话用户会以为"这个软件不支持德语"。
 *
 * # 安装包里一本词典都不带（用户 2026-10-11：「默认随包不分发任何字典」）
 *
 * 照 Typora 那条 `❌ 词典数据不内置`。所以这一格底下必须写清楚**三条出路**：
 * 装系统包（安装命令就在提示里）／导入一个 `.zip`／把 `.aff`+`.dic` 拷进那个
 * 目录（那颗"在文件夹里显示"就是给它用的）。⚠️ **我们不联网下载**词典
 * （本仓对拼写这一格钉死了"不联网、不下载"，见 `spell/mod.rs` 顶上那两条纪律）。
 *
 * ⚠️ **中文没有词典**这件事与 Typora 一致，而且是格式本身的性质（hunspell
 * 按空格切词查词表，中文没有词间空格）——中文用户只有"导入自己的词表"这条路。
 */

import { useCallback, useEffect, useState } from "react";
import { open as selectTextItem } from "@/ui/file-picker";

import { api, type CombineWriteWordDictionary } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { languageName } from "@/ui/spell-langs";

import { TextInput } from "../primitives";

/**
 * 常见语言。⚠️ 它**只是"没装的那些也列出来"那份名单**——装着的那些来自
 * `nota_spell_dictionaries`，那才是唯一的真相。
 *
 * ⚠️ 写法**必须是 `语言_地区`**（`zh_CN` 而不是 `zh-CN`）——那是文件名与
 * hunspell 词典包的惯例（`en_US.dic`），而查找那一侧会把连字符与下划线归一
 * （两边都认，但**列出来/写进设置里的是下划线**那一套，省得用户以为自己写错了）。
 *
 * ⚠️ 名字走 `ui/spell-langs.ts` 那张**本地语名字表**（`Deutsch` / `Čeština`），
 * **不是英文、也不进 `t()`**——2026-10-11 改的：那一天状态栏那个菜单照 Typora
 * 重做，两份界面（这一格与那份菜单）改成同一个口径。理由写在 `spell-langs.ts`
 * 文件头：那一格要服务的是"只认得自己那门语言怎么写的人"。
 */
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

/** `en-US` 与 `en_US` 是同一门（与 `spell/store.rs::归一` 一致）。 */
function normalize(label: string): string {
  return label.toLowerCase().replace(/-/g, "_");
}

export function SpellLangPicker({
  value,
  onChange,
}: {
  /** 设置里那一串（`settings.editor.spellcheck_langs`）。**空数组 = 跟随系统**。 */
  value: string[];
  onChange: (languages: string[]) => void;
}) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画）。
  const t = useT();
  /** 自定义标签那一格里的草稿（还没点「添加」）。 */
  const [draftDraft, setDraftDraft2] = useState("");
  /** 这台机器上真有的词典（`null` = 还没问回来）。 */
  const [installActive, setInstallActive] = useState<CombineWriteWordDictionary[] | null>(null);
  /** 用户词典目录（那一行小字用的，取回来之前是空串）。 */
  const [itemRecord, setItemRecord] = useState("");
  /** 上一次导入的结果（成功说标签、失败说原因）。 */
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

  // 第一档：这台机器上有的。第二档：常见表里**没装**的那些。
  // ⚠️ 顺序是"有的在前"——用户打开这一格最想知道的是"我现在能用什么"。
  const candidate: string[] = (installActive ?? []).map((d) => d.tag);
  for (const tag of commonLanguages) if (!alreadyInstall.has(normalize(tag))) candidate.push(tag);
  // 用户自己敲过的、以及设置里正勾着的，一个都不许从表里消失
  //（"我明明选了怎么不见了"是这一格最容易犯的错）。
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

  /** 导入一个 `.zip`（一个包里带 `xx_YY.aff` ＋ `xx_YY.dic`）。 */
  const guideEnter = async () => {
    const path = await selectTextItem({
      multiple: false,
      filters: [{ name: "Dictionary", extensions: ["zip"] }],
    });
    if (typeof path !== "string") return; // 用户点了取消：什么都不说
    try {
      const label = await api.spell.dictImport(path);
      refreshNewValue();
      // ⚠️ 导入之后**当场勾上**：用户刚装了一门语言，多半就是要用它。
      // 不勾的话他得自己在下面那张长表里再找一遍——而刚装上的那一门在他
      // 找的时候还排在后面。
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
          // ⚠️ 点它就是**清空**（空表＝跟随系统，见文件头）。
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
        {/* ⚠️ `placeholder` 里那个例子就是格式本身（`en_US`）：这一格填错了
            不会报错，只会静默地什么也不检查，所以格式得当场看得见。 */}
        <TextInput value={draftDraft} placeholder="en_US" onChange={setDraftDraft2} />
        <button type="button" className="btn stg-action" onClick={addCustom}>
          {t("Add")}
        </button>
      </div>

      {/* ── 词典从哪儿来（2026-10-11）────────────────────────────────────
          ⚠️ 这一块**不是可选的花边**：安装包一本词典都不带，所以"去哪儿弄"
          和"选哪一门"是同一件事的两半。 */}
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
        {/* 目录写在明面上：用户要"自己拷一对 .aff/.dic 进去"时得知道往哪儿拷。 */}
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
