/**
 * 「拼写检查」那几门语言的选择器（2026-10-10，用户那句「多语言拼写检查」）。
 *
 * # 为什么不是一格下拉了
 *
 * 一天前（同一天早些）这里是一个下拉：**一次只能选一门**。用户随后说「多语言
 * 拼写检查」——中文稿里夹英文是常态，只挂一门时**另一门整篇都是"错词"**，
 * 而 WebKitGTK 那个接口本来就收一**串**语言（`commands/webview.rs` 文件头
 * 引着那段源码），所以"多门"不是我们加的花样，是内核本来的形状。
 *
 * # 候选从哪儿来：**一张写死的表**（试过"列机器上装了什么"，不成立，见下）
 *
 * 这一版**没有**去列"这台机器装了什么词典"，这是**量过之后**的取舍：
 * 四种列法（`enchant-2 -l` / `hunspell -D` / `aspell dump dicts` / 扫 `*.dic`）
 * **全都不靠谱**，逐条实测记在 `src-tauri/src/commands/webview.rs` 文件头。
 * 其中最要命的是最后那条：宿主机器上 `/usr/share/hunspell` 里只有 `en_US.dic`，
 * 而 `en_GB` **明明能用**（enchant 走的 aspell 后端）——照它列，界面会给一个
 * 好端端的语言标上"这台机器上没有"。**宁可不标，也不撒谎。**
 *
 * 于是：候选＝这一张常见的表 ＋ 用户自己敲（表里没有的，比如 `ca_ES`）。
 * 「这台机器到底有没有这本词典」**只有引擎说了算**，而它什么时候说？
 * 设完之后——`ui/useSpellcheck.ts` 会拿引擎读回来的那串**逐门比**，少了谁就
 * 当场弹一句谁。那条提示是这一格**唯一**的"有没有词典"判据。
 *
 * # 为什么不画成"跟随系统 / 具体语言"两档
 *
 * 它们**不是并列的两档**：空表就是"跟随系统"，非空就是"用这几门"。所以
 * 「跟随系统」是列表第一个**勾选**（勾上＝清空列表），而不是上面一颗开关——
 * 做成开关就会出现"开关开着、下面还勾着两个语言"这种说不清的状态。
 *
 * ⚠️ **顺序**就是**勾选的先后**（`Vec` 是有序的，`settings/editor.rs` 写着）。
 * 后面那个"先后"两个字在界面上不显眼也**不用显眼**：几门语言之间没有优先级
 * 可言（内核是拿它们一起查的），顺序只影响落盘长什么样，所以不为此多画一行字。
 */

import { useState } from "react";

import { useT } from "@/i18n";

import { TextInput } from "../primitives";

/**
 * 常见语言。⚠️ 它**只是候选**，与"这台机器上装了什么"**无关**（那个列不出来，
 * 见文件头）——列在这里的语言不代表这台机器有它的词典，而"有没有"由引擎
 * 设完之后读回来的那串说（`ui/useSpellcheck.ts` 那条逐门比）。
 *
 * ⚠️ 写法**必须是 enchant/hunspell 那套 `语言_地区`**（`zh_CN` 而不是 `zh-CN`）——
 * WebKitGTK 拿这些字符串去 `enchant_broker_dict_exists()` 查词典，写成连字符时
 * 查不到，而症状是**一个字都不检查**（理由与出处见 `commands/webview.rs` 文件头）。
 *
 * ⚠️ 名字**用英文**（不写汉语/日语那种本地写法）：界面文案的主语言是英语，
 * 而 `tools/i18n-check.sh` 第 ④ 栏不许代码里出现中文界面文字（见 `src/i18n/index.ts`
 * 文件头）。这些是专有名词，不进 `t()`，所以它们在中文界面上也是英文——
 * 和 `en_US` 这个标签本身一样，属于"写下来的值"，不是"读出来的话"。
 */
const 常见语言: ReadonlyArray<{ value: string; label: string }> = [
  { value: "zh_CN", label: "Chinese (Simplified)" },
  { value: "zh_TW", label: "Chinese (Traditional)" },
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "ja_JP", label: "Japanese" },
  { value: "ko_KR", label: "Korean" },
  { value: "fr_FR", label: "French" },
  { value: "de_DE", label: "German" },
  { value: "es_ES", label: "Spanish" },
  { value: "pt_BR", label: "Portuguese (Brazil)" },
  { value: "ru_RU", label: "Russian" },
  { value: "it_IT", label: "Italian" },
  { value: "nl_NL", label: "Dutch" },
  { value: "pl_PL", label: "Polish" },
  { value: "tr_TR", label: "Turkish" },
  { value: "sv_SE", label: "Swedish" },
];

const 名字: Record<string, string> = Object.fromEntries(
  常见语言.map((o) => [o.value, o.label]),
);

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
  const [草稿, 设草稿] = useState("");

  // 常见语言 ＋ 用户自己敲的那些（自定义标签不在上面那张表里，他勾了就一定
  // 得看得见，否则"我明明选了怎么不见了"）。
  const 候选: string[] = 常见语言.map((o) => o.value);
  for (const v of value) if (!候选.includes(v)) 候选.push(v);

  const 勾 = (tag: string) => {
    onChange(
      value.includes(tag) ? value.filter((x) => x !== tag) : [...value, tag],
    );
  };

  const 加自定义 = () => {
    const 净 = 草稿.trim();
    if (净 === "" || value.includes(净)) {
      设草稿("");
      return;
    }
    onChange([...value, 净]);
    设草稿("");
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
        {候选.map((tag) => (
          <label className="stg-lang" key={tag}>
            <input
              type="checkbox"
              checked={value.includes(tag)}
              onChange={() => 勾(tag)}
            />
            <span className="stg-lang-tag">{tag}</span>
            {名字[tag] && <span className="stg-lang-name">{名字[tag]}</span>}
          </label>
        ))}
      </div>

      <div className="stg-lang-add">
        {/* ⚠️ `placeholder` 里那个例子就是格式本身（`en_US`）：这一格填错了
            不会报错，只会静默地什么也不检查，所以格式得当场看得见。 */}
        <TextInput
          value={草稿}
          placeholder="en_US"
          onChange={设草稿}
        />
        <button type="button" className="btn stg-action" onClick={加自定义}>
          {t("Add")}
        </button>
      </div>
    </div>
  );
}
