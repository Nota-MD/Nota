/**
 * **状态栏那个「选择拼写检查语言」菜单**（2026-10-11 照 Typora 重做）。
 *
 * 用户贴了一张 Typora 的截图说「学学人家的菜单，你也这么做」，那份菜单的形状是：
 * 顶上一个小标题、然后「自动检测语言」「不使用拼写检查」两项、一条分隔线、
 * 一大列语言（**左边本地语名字、右边短码**，那一列**能滚**）。
 *
 * ⚠️ **2026-10-16 把最底下那条「全局设置…」删了**（用户看截图直接点名：
 * 「我认为这里不应该有"全局设置"的按钮」）。删的理由不只是"他不要"：
 * 那个菜单里**每一格都是拼写这一件事的选项**，而"打开设置窗"不是选项、
 * 是**另一件事的入口**——把两种东西混进同一列，用户按 ↑↓ 选语言时会多停一格
 * 停在一个不属于这一层的东西上。设置窗自己有三个入口（菜单「文件 → 设置…」、
 * `Ctrl+,`、插件那页），不缺这一条。⚠️ 同批把为它铺的那条链一起收了：
 * `MenuPopup::stickyLast`（那一层只服务它）、`ui/settings/open-request.ts`
 * 那个一次性信箱（没有第二个投递方）——留着就是"没人写、有人读"的死账。
 *
 * # 三件事各自怎么落到我们这套上
 *
 * | 那一格 | 落点 |
 * |---|---|
 * | 自动检测语言 | `spellcheck = true` ＋ `spellcheck_langs = []`（**跟随系统**，见 `docs/03` §5.6e） |
 * | 不使用拼写检查 | `spellcheck = false`（语言那一格**不动**——关掉不等于忘掉他选过什么） |
 * | 勾一门语言 | 往 `spellcheck_langs` 里加/减（**能勾多门**：中文稿夹英文是常态，设置页那一格也是多选），并把它**打开** |
 *
 * ⚠️ **前两项互斥、语言那一列不参与互斥**：「自动检测」就是"没点名任何语言"，
 * 所以勾了语言之后那一勾自然消失（它俩本来就是同一件事的两种说法）。
 *
 * # 列表从哪儿来：**现问**（`nota_spell_dictionaries`）
 *
 * 这是 2026-10-11 那一批把它变可能的（引擎换成我们自己的之后，"扫得到"与
 * "用得了"成了同一件事，见 `docs/03` §5.6f）。⚠️ **一本词典都没有时也画**：
 * 那时摆一行说明——空着一片比说一句"这台机器上还没有词典"更让人以为菜单坏了。
 *
 * # 为什么单独一个组件
 *
 * 这一层要**自己去问一次词典**（一次 IPC ＋ 一个 `useState`），而 `ui/StatusBar.tsx`
 * 与 `ui/useStatusBar.ts` 是"**一个 `useState` 都没有**"的纯展示／纯接线（那条
 * 规矩写在 `StatusBar.tsx` 文件头）。把这份状态塞进它们任何一处都会破坏那条规矩，
 * 所以它自成一格——父组件只递三个回调进来。
 */

import { useEffect, useRef, useState } from "react";

import { api, type CombineWriteWordDictionary } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { MenuPopup } from "@/ui/MenuPopup";
import type { MenuEntry } from "@/ui/commands";
import { languageName, languageCode } from "@/ui/spell-langs";

/** 归一：`en-US` 与 `en_US` 是同一门（与 `spell-langs.ts` 那条一致）。 */
function normalize(label: string): string {
  return label.trim().toLowerCase().replace(/-/g, "_");
}

export function SpellMenu({
  spellcheck,
  language,
  onChangeSpell,
  onDismiss,
}: {
  /** `settings.editor.spellcheck`。`null` = 设置还没读回来（那两行就灰着）。 */
  spellcheck: boolean | null;
  /** `settings.editor.spellcheck_langs`。**空数组 = 跟随系统**。`null` = 还没读回来。 */
  language: string[] | null;
  /**
   * 改点什么。**一次写入**——⚠️ "勾一门语言"这一下要同时改两样（开 ＋ 语言列表），
   * 拆成两次写的话后一次会拿旧快照把前一次抹掉（见 `ui/useStatusBar.ts::onChangeSpell`）。
   */
  onChangeSpell: (fill: { open2?: boolean; language?: string[] }) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  /** 这台机器上的词典（`null` = 还在问）。 */
  const [wordDictionaryPlural, setWordDictionaryPlural] = useState<CombineWriteWordDictionary[] | null>(null);
  /**
   * 顶上那个搜索框里打的东西（2026-10-11 收尾时用户点名加的：
   * 「上面还应该有个搜索框」——他贴的那张 Typora 截图里最上面那个圆角框**不是
   * 标题、是搜索框**）。
   */
  const [query, setQuery] = useState("");
  /** 顶上那个搜索框。**菜单一开就要把焦点放进去**（理由见下面那条 effect）。 */
  const searchSearchBox = useRef<HTMLInputElement>(null);
  /** 用户已经把焦点走进下面那一列了（那之后**不许**再抢回来）。 */
  const letPosition = useRef(false);

  useEffect(() => {
    // ⚠️⚠️ **必须自己把焦点抢过来**：`MenuPopup` 的漫游钩子开菜单时会把焦点
    // 播到**第一条条目**上（"自动检测语言"），于是用户一进来打字——字全进了
    // **正文**（2026-10-11 实测：菜单开着，正文里多出一串 `deu`，而搜索框里
    // 一个字符都没有）。父组件的 effect 在子组件之后跑，所以这一句抢得过它。
    // ⚠️ 键盘走这条路进来的人想要的也是"先打字找语言"，不是"从第一项往下按"。
    const steal = () => {
      if (!letPosition.current) searchSearchBox.current?.focus();
    };
    steal();
    // ⚠️ **下一帧还要再抢一次**：词典那一列是**异步**拉回来的，到手时 `SpellMenu`
    // 会再渲染一遍，而 `MenuPopup` 那边（漫游钩子）会在 layout 阶段把焦点按到
    // 第一条条目上——2026-10-11 实测就是这样：effect 里 `focus()` 过了，可 1.8 秒
    // 后打字**还是打在条目上**（搜索框空的、正文也没变）。
    // ⚠️ `让位` 那面旗子是**必须**的：用户一旦按 ↓ / 点进列表，就再也不能被抢回来
    //（否则方向键走一步、焦点跳回搜索框，等于键盘走不通）。
    const belowValueFrame = window.setTimeout(steal, 0);
    return () => window.clearTimeout(belowValueFrame);
  }, []);

  useEffect(() => {
    // ⚠️ 拿不到就当**空**：菜单照画（说明 ＋ 出口），不因此不弹菜单——
    // "弹不出来"与"弹出来是空的"里，前者更像坏了。
    void api.spell.dictionaries().then(setWordDictionaryPlural).catch(() => setWordDictionaryPlural([]));
  }, []);

  const selectedOf = (language ?? []).map(normalize);
  const alreadyInstall = wordDictionaryPlural ?? [];
  // 候选＝装着的那些 ＋ **已经勾了但没装的**那些（不然他勾过的那一门会从菜单里
  // 消失，而设置页那一格还写着它——两处对不上）。
  const candidate: string[] = alreadyInstall.map((d) => d.tag);
  for (const tag of language ?? []) {
    if (!candidate.some((c) => normalize(c) === normalize(tag))) candidate.push(tag);
  }
  candidate.sort((a, b) => languageName(a).localeCompare(languageName(b)));

  /**
   * 搜索框挑出来的那几门。
   *
   * ⚠️ **三样都比**（本地语名字 / 短码 / 原始标签）：用户可能照着名字找
   *（`Deutsch`）、照着短码找（`DE-CH`）、也可能照着设置里那个串找（`de_CH`）
   * ——三种都真实存在，少比一样就有一类人搜不到自己那门。
   * ⚠️ 大小写与连字符/下划线**一律归一**（`de-ch` 也要能搜到 `de_DE` 那一族）。
   */
  const cleanCheck = normalize(query.trim());
  const matchOf = cleanCheck === ""
    ? candidate
    : candidate.filter(
        (tag) =>
          normalize(tag).includes(cleanCheck) ||
          normalize(languageName(tag)).includes(cleanCheck) ||
          normalize(languageCode(tag)).includes(cleanCheck),
      );

  /** 一条可勾的条目。`right` 是右端那个短码（见 `commands.ts::MenuItemSpec.right`）。 */
  const item4 = (id: string, label: string, right?: string): MenuEntry => ({
    id,
    label,
    checkable: true,
    ...(right ? { right } : {}),
  });

  // 顶上两项：与 Typora 那份一一对应，而且**互斥**（见文件头那张表）。
  const item: MenuEntry[] = [
    item4("spell.auto", t("Auto-detect language")),
    item4("spell.off", t("Do not check spelling")),
    "sep",
  ];

  if (wordDictionaryPlural !== null && candidate.length === 0) {
    // ⚠️ 一本都没有时**也要说一句**（下面那条出口就是给它的）。
    item.push({
      id: "spell.none",
      label: t("No dictionaries on this machine"),
      checkable: false,
    });
  } else if (wordDictionaryPlural !== null && matchOf.length === 0) {
    // ⚠️ 搜了但一个都没中：**说出来**。一句话不说是最坏的那种界面——
    // 下面那两行"模式"条目还在，用户会以为"这台机器一门语言都没有"。
    item.push({ id: "spell.nomatch", label: t("No matching languages"), checkable: false });
  } else {
    for (const tag of matchOf) {
      // ⚠️ id 带上标签（`spell.lang:de_DE`）：这一列是**现算的**，而漫游焦点与
      // `checks` 都按 id 认路。
      item.push(item4(`spell.lang:${tag}`, languageName(tag), languageCode(tag)));
    }
  }

  const check: Record<string, boolean> = {
    // ⚠️ 「自动检测」与「不使用」是**同一个布尔的两种说法**（后端只有"跟随系统"
    // 这一种语言状态）：一个勾着另一个必不勾，而且语言非空时"自动检测"不勾。
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
      // ⚠️ **顶上是一个搜索框，不是标题**（用户 2026-10-11 收尾时点名：
      // 「上面还应该有个搜索框」）。所以这里给的是 `top` 而不是 `heading`。
      // ⚠️ `aria-label` 仍然写着那句话（读屏要有个名字），而可见的那一行小标题
      // 去掉了：Typora 那份菜单最上面就是这一格。
      top={
        <input
          // ⚠️ **挂上去那一刻就 focus**（回调 ref），不是等 effect：`focus()` 写在
          // effect 里时，`MenuPopup` 那边（漫游钩子）**在之后**还会把焦点按回第一条
          // 条目上——2026-10-11 实测了两轮（`useEffect` 里 focus、下一帧再 focus 一次）
          // 都没抢过它，症状是"菜单开着、打字打在条目上，搜索框一个字符都没有"。
          // 回调 ref 在**提交阶段**跑（比两个 effect 都早），加上下面那条下一帧的
          // 兜底，才把这颗焦点坐稳。
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
          // ⚠️ 焦点**走进了这一层**（点条目、按 ↓ 都算）就把搜索框让掉；
          // 只是窗口失焦（`relatedTarget` 是 null）不算——那种时候还得抢回来。
          onBlur={(e) => {
            const goWhich = e.relatedTarget as Node | null;
            const layer = e.currentTarget.closest(".menu-popup");
            if (goWhich && layer?.contains(goWhich)) letPosition.current = true;
          }}
          // ⚠️ ↑↓ 从输入框走进下面那一列：不给这条路的话，键盘用户**永远**只能在
          // 输入框里打字、选不了任何一门（这一层不是"点得动就行"的那种菜单）。
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "Enter") {
              e.preventDefault();
              letPosition.current = true;
              // ⚠️ 拿 DOM 找第一颗按钮（不引 ref 穿透 `MenuPopup`）：那一层的
              // 漫游钩子挂在每颗按钮的 `onFocus` 上，所以直接 `focus()` 就等于
              // 把漫游焦点放到它身上——两条路汇到同一处。
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
          // 跟随系统：**清空语言那一格**（它俩是同一条口径的两半）。
          onChangeSpell({ language: [], open2: true });
          return;
        }
        if (id === "spell.off") {
          // ⚠️ 关的时候**不动语言那一格**（关掉不等于忘掉他选过什么）。
          onChangeSpell({ open2: false });
          return;
        }
        if (!id.startsWith("spell.lang:")) return;
        const tag = id.slice("spell.lang:".length);
        const match = (language ?? []).find((x) => normalize(x) === normalize(tag));
        const newValue = match ? (language ?? []).filter((x) => x !== match) : [...(language ?? []), tag];
        // ⚠️ **一次写入**：勾了语言就把拼写检查也**打开**——他点这一下是要用这门
        // 语言查词，不是"选着玩"。⚠️ 这两样必须走同一次 `updateSettings`，否则后
        // 一次会拿旧快照把前一次抹回去（这一条踩过，见 `useStatusBar` 那段）。
        // ⚠️ 勾掉最后一门时落回 `[]` ＝ 跟随系统，那也是有含义的一档，不是"关掉"。
        onChangeSpell({ language: newValue, open2: true });
      }}
      onDismiss={onDismiss}
      // ⚠️ `←` `→` 在这一层什么都不做（同 `StatusBar.tsx` 那个计数菜单）：
      // 这是独立的一层、没有"邻栏"可切。传空函数而不是省略——省略的话那一层会
      // 拿到 `undefined` 并在按键时炸。
      onArrowOut={() => {}}
    />
  );
}
