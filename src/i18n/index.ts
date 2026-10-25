/**
 * 界面国际化的**前端那一半**。
 *
 * # 规矩只有一条：**键就是英文原文，缺键就用原文**
 *
 * ```ts
 * t("File")   // 中文表里有 → "文件"；没有 → "File"（原样）
 * ```
 *
 * 所以：
 *
 * - **英语没有表**。英语是原文，一张空表而已——不必维护一份"英语翻译英语"的
 *   文件（那种文件的下场是没人更新它）；
 * - 只有要翻译的那些才进 `zh-CN` 表（`zh.ts`）；
 * - 加一句界面文字**不用先登记 key**，直接 `t("…")` 就完了。
 *
 * ⚠️ 代价：**改了英文原文＝改了一个键**，那条中文会悄悄失效（退回英文，不报错）。
 * 这与插件那边（`src-tauri/src/lua/api/i18n.rs`）是**同一条规矩**——两处同一套，
 * 用户/作者只需要记一次。
 *
 * # ⚠️ 2026-09-28：主语言从中文翻成了英语
 *
 * 在这天之前是反过来的：键是**中文原文**，译文进 `src/i18n/en.ts` 那几张表。
 * 翻转的理由是用户那天定的方向——**英语才是主语言，中文是翻译包**
 * （插件清单 2026-09-27 就已经这么办了，这一下把应用自己也拉齐）：
 *
 * 1. 界面的"原文"该是发布出去那一份。英语原文意味着**英语用户看到的永远是
 *    完整界面**——任何一句还没翻的都还是英语，不会露出半句中文；
 * 2. 而中文是翻译包，缺哪条补哪条，缺了退回英语照样读得懂。
 *    反过来的话（原文中文、英语要翻），英语界面上一条没翻的漏网就冒出一句
 *    中文——那种"半英文"比整片中文更难懂（这正是翻转前 `tools/i18n-check.sh`
 *    第 ④ 栏要拦的那种事故）。
 *
 * ⚠️ 翻转是**机械替换＋逐条裁决**做的：974 条中文键换成对应英文原文，
 * 13 组"两个中文原文共用一条英文译文"的冲突逐条判过（该合并的合并、
 * 含义不同的拆成两把键，清单见 `docs/07` 那次提交那一段）。原来那份中文原文
 * 没有丢——它就是 `zh-*.ts` 里的**译文**。
 *
 * ⚠️ 于是**代码里不该再有中文的界面文字**：出现了就是漏网（原文该是英语），
 * `tools/i18n-check.sh` 第 ④ 栏拦这一条。中文只该出现在两处：注释、以及
 * `zh-*.ts` 的译文里。
 *
 * # 语言从哪儿来
 *
 * 宿主（`commands/settings.rs::nota_app_lang`）。⚠️ 拿的是**启动时算好的那个
 * 有效语言**，不是"设置里那一格的现值"：用户改了设置要**重启**才生效
 * （插件在启动时按那个语言读好了自己的文案表），前端跟着一起换才不会出现
 * "界面英文、插件中文"的中间态。理由写在 `settings/general.rs::language`。
 *
 * # 为什么是个订阅式的小 store，而不是 React context
 *
 * 因为**非组件的地方也要用**：`PluginDock.tsx::来源说明`、`ReviewPane.tsx::预览标题`
 * 都是纯函数，它们拿不到 context。一个模块级的"当前语言" + `useSyncExternalStore`
 * 订阅，两头都能用（组件里用 [`useT`]，别处用 [`t`]）。
 *
 * # 覆盖范围
 *
 * 2026-09-26 起铺到整个界面（菜单栏、设置十一页、状态栏、侧边栏、对话框、工具条）。
 * `tools/i18n-check.sh` 拿代码里 `t("…")` 的调用与中文表逐条对，欠账条数就是
 * 进度；翻转那天收尾时是 999 / 999、0 欠账，**这个数会随着 `t("…")` 的增删
 * 自己动**——引用它的时候现跑一遍 `tools/i18n-check.sh`，别照抄。
 *
 * ⚠️ **这就是 [`兜底`] 必须是 `en` 的原因**。宿主的兜底
 * （`src-tauri/src/lang.rs::应用兜底`）**必须同值**，不然"界面自洽"这条不成立。
 */

import { useSyncExternalStore } from "react";

import { middleTextTable } from "@/i18n/zh";

/**
 * 兜底语言。⚠️ 与宿主那边（`src-tauri/src/lang.rs::应用兜底`）是同一个值。
 *
 * 它是"未命中"的落点：系统语区不在支持列表里时落到这个值。基准是英语，
 * 那么落点也该是英语——落到中文等于**替用户假定他读中文**，而系统语区
 * 恰好说明不了这件事。
 *
 * ⚠️ 它**不是**"默认语言"：中文语区的用户照旧拿到中文界面（宿主按系统语区
 * 算，`zh-CN` 在支持列表里）。这里是兜底，只在**认不出来**时才用上。
 */
const fallback = "en";

/** 语言 → 表。⚠️ 英语**不在**这张表里：它的表是空的（缺键用原文）。 */
const table2: Record<string, Record<string, string>> = {
  "zh-CN": middleTextTable,
};

let current = fallback;
const listenMany = new Set<() => void>();

/** 宿主报了语言之后调这一下。**只该由 `App.tsx` 启动那一段调**。 */
export function setLanguage(language: string): void {
  if (language === current) return;
  current = language;
  listenMany.forEach((f) => f());
}

/** 此刻在说哪种语言（`zh-CN` / `en`）。 */
export function language(): string {
  return current;
}

/**
 * 取一句文案。`{0}` / `{1}` 是参数占位符。
 *
 * ⚠️ **同一个键在两个地方要有两种译法时，别指望这张表**：它按原文去查，
 * 查到的只有一条。真遇到那种情况就把原文改成两句不同的话（键不同，译法自然不同）
 * ——2026-09-28 翻转时按这条裁过 13 组冲突，其中含义不同的那几组就是这么拆开的。
 */
export function t(source: string, ...parameter: (string | number)[]): string {
  const sentence = table2[current]?.[source] ?? source;
  if (parameter.length === 0) return sentence;
  return sentence.replace(/\{(\d+)\}/g, (whole, i: string) => {
    const v = parameter[Number(i)];
    return v === undefined ? whole : String(v);
  });
}

function subscribeRead(f: () => void): () => void {
  listenMany.add(f);
  return () => listenMany.delete(f);
}

/**
 * 组件里用这个：它**订阅**了语言变化，宿主报来语言之后这一块会重画。
 *
 * ⚠️ 组件里请 `const t = useT();`（局部名盖住模块那个 `t`），别直接调模块级的
 * `t(...)` 就算完——那样首帧画的是兜底语言，而**没有任何东西会通知它重画**。
 * 首帧与宿主答话之间只差几毫秒，但那几毫秒里画出来的字是错的。
 */
export function useT(): typeof t {
  useSyncExternalStore(subscribeRead, language, language);
  return t;
}

/**
 * 组件/hook 里要"语言变了就重做一遍某件事"时用这个（订阅的就是当前语言本身）。
 *
 * ⚠️ 与 [`useT`] 的分工：**要画字**就用 `useT`（它顺手把订阅做了）；**不是画字、
 * 而是把语言当依赖**（推原生菜单、重建什么东西）才用它。用 `useT()` 去干这件事
 * 会多一个没人看的 `t` 变量，而被 `noUnusedLocals` 拦下。
 *
 * ⚠️ 值今天是"重启才变"的（见 `settings/general.rs::language`），但这不构成
 * "那就别订阅了"的理由：写死一个不动的依赖，等哪天热切语言真做了，症状是
 * **原生菜单栏还是旧语言**——而那种地方没人会想到去查依赖数组。
 */
export function useLanguage(): string {
  return useSyncExternalStore(subscribeRead, language, language);
}
