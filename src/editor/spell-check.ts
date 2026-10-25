/**
 * **拼写检查：把拼错的词画上波浪线**（2026-10-11）。
 *
 * # 为什么是"我们自己画"
 *
 * 用户原话：「拼写检查不应该依赖于浏览器内核，而是真正可拆分的内核模块」。
 * 内核那条路（WebKitGTK 的 `spell-checking` / Chromium 的系统拼写检查）有两个死结：
 * ① 开关和语言都捏在内核手里，换内核＝重做；② 我们这边实测**根本画不出波浪线**
 *（容器里 `hunspell-en-US` 装着也是白的，见 `docs/07` 第 108 项）。
 * 所以后端换成 `src-tauri/src/spell/` 那一层，**词对不对由 Nota 自己问**，
 * 波浪线也由 Nota 自己画成一个 `Decoration`。
 *
 * # 三条规矩
 *
 * | 规矩 | 为什么 |
 * |---|---|
 * | **去抖 600ms**（`SETTLE_MS`） | 每敲一个键都问一次后端＝每敲一个键起一次进程 |
 * | **只查"看起来像词"的那几段**（`取词`） | 代码块、行内代码、公式、链接地址里的东西**不是自然语言**，画上去就是噪音 |
 * | **一次一批**（`一次最多`，与后端那个常数同值） | 几千个词一次送过去，别一个词一次 |
 *
 * ⚠️ **不问就不画**：后端没装 / 词典没有时，这一层**一个人都不标**（不是"全标红"）
 * ——那正是 `spell/mod.rs` 里"失败给不知道、不给拼错了"那条纪律在界面上的落点。
 */

import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

import { api } from "@/bridge/ipc";

/** 敲完最后一个键之后等这么久再去问（见文件头那张表）。 */
const SETTLE_MS = 600;

/** 一次最多送多少词。⚠️ 与 `src-tauri/src/spell/mod.rs` 的 `一次最多` 同值。 */
const maxPerCall = 2000;

/** 这一刻用哪门语言。`""` = 跟随系统（这时按界面语言挑一个最接近的标签）。 */
let language = "";

/** 拼写检查开着没有（`settings.editor.spellcheck`）。关着时**一条线都不画**。 */
let isOpen = true;

/** 还活着的编辑器实例（`view()` 里加、`destroy()` 里删）。 */
const activeActiveOf = new Set<EditorView>();

/** 由 `ui/useSpellcheck.ts` 在设置变了的时候调一次。 */
export function setCombineWriteLanguage(next: string): void {
  language = next;
}

/**
 * 开关（`settings.editor.spellcheck`）。由 `ui/useSpellcheck.ts` 拨。
 *
 * ⚠️ **关了要当场把已经画上的线擦掉**（逐个实例重跑一遍），不能只让"下一次
 * 打字时不画"——用户拨这个开关的时候正文是**静止**的，不回头的症状是
 * "开关关了，红波浪线一条不少地留在那儿"，看着就是没生效。
 */
export function setCombineWriteFlag(on: boolean): void {
  if (isOpen === on) return;
  isOpen = on;
  for (const view of activeActiveOf) rechecks.get(view)?.();
}

/** 波浪线那个类名。**只此一处**——`marks.css` 与右键命中的判据都用它。 */
const className2 = "nota-spell-error";

/**
 * 从一段 DOM 找回它是**哪一个编辑器实例**（右键菜单那条路要用）。
 *
 * ⚠️ **为什么是"扫一遍活着的实例"而不是"记一个当前视图"**：一个窗口里同时开着
 * 好几个（正文 / 分屏预览），而"记最后一个"在分屏下是错的——用户在**左边**右键，
 * 那条 transaction 会打到右边去。DOM 包含关系是唯一没有歧义的判据。
 */
export function findView(node: Node): EditorView | null {
  for (const view of activeActiveOf) {
    if (view.dom.contains(node)) return view;
  }
  return null;
}

/**
 * 每个编辑器实例的"重新跑一遍"（`view()` 里注册、`destroy()` 里撤掉）。
 *
 * ⚠️ 键是**视图本身**：一个窗口里好几个实例，而"加入了词典"这件事要在
 * **用户右键的那一个**上立刻生效（别的实例下次文档变化时自己会跟上）。
 */
const rechecks = new WeakMap<EditorView, () => void>();

/** 立刻重跑一遍拼写检查（用户刚「加入词典」/「忽略」时叫它）。 */
export function heavyNewValueCheckCombineWrite(view: EditorView): void {
  rechecks.get(view)?.();
}

/** 把 `从..到` 那段换成别的字（右键菜单里点一条建议）。 */
export function replaceReplaceCombineWrite(view: EditorView, from: number, to2: number, createProposal: string): void {
  view.dispatch(view.state.tr.insertText(createProposal, from, to2).scrollIntoView());
}

/** 真正送给后端的那门语言：设置里写了就用它，没写（跟随系统）就按界面语言猜一个。 */
export function currentLanguageLabel(): string {
  if (language) return language;
  // ⚠️ 后端要的是 enchant 那套 `zh_CN`（下划线），而 `navigator.language` 给的是
  // `zh-CN`——这一步转换不是可有可无的（写成连字符时 enchant 查不到词典，
  // 症状是"一个字都不检查"，见 `commands/webview.rs` 文件头）。
  const guess = (typeof navigator !== "undefined" && navigator.language) || "";
  // ⚠️⚠️ **`navigator.language` 不一定是一门语言**：`LANG=C` / `LANG=POSIX`
  // 的环境里它报的是 `C`（2026-10-11 在容器里实测：无头那一枪发出去的是
  // `nota_spell_check(lang="C")`，而"没有 `C` 这门语言" ⇒ 一条波浪线都没有，
  // 看着像"拼写检查整个坏了"）。所以这里**只认长得像语言标签的**，
  // 认不出来就退到 `en_US`——那是最保守的一档（英语词表遍地都是），
  // 而且**总比拿一个不存在的标签去问强**。
  const likeLanguage = /^[A-Za-z]{2,3}([_-][A-Za-z0-9]+)*$/;
  const clean = guess.replace(/-/g, "_");
  return likeLanguage.test(clean) ? clean : "en_US";
}

/** 哪些文本要查。⚠️ 排除法：**代码 / 公式 / 链接**一律跳过（见文件头那张表）。 */
function shouldJumpPass(nodeName: string): boolean {
  return (
    nodeName === "code_block" ||
    nodeName === "code_inline" ||
    nodeName === "math_inline" ||
    nodeName === "math_block" ||
    nodeName === "link" ||
    nodeName === "html_block"
  );
}

/**
 * 从一个词里去掉首尾的标点（`hello,` → `hello`），并给出它在字符串里的偏移。
 *
 * # 连字符那一条（2026-10-11 量的）
 *
 * `Wi-Fi` / `e-mail` / `well-known` 这样的词**整段送去查一定是错**：实测那份
 * SCOWL `en_US` 词表里**一个带 `-` 的词条都没有**（`grep -c -- "-" en_US.dic`
 * 是 0），于是 `Wi-Fi`、`e-mail`、`well-known` 三个都是 `false`。所以这里把它们
 * **按 `-` 拆成几段分别查**，而**段里太短的（少于 3 个字母）不查**——
 * `Wi` / `Fi` / `e` 这种两个字母以内、又是组合词一部分的东西，没有任何词典
 * 能判准，标出来就是噪音（而 `well` / `known` / `mail` 照样查）。
 *
 * ⚠️ 代价如实记着：**独立出现的两字母词也不再查**（`zz` 这种打错不会标）。
 * 两字母的真错词本来就极少，而"把一个好端端的 `Wi-Fi` 标红"是**每次都会遇到**
 * 的那种假阳性——两边不对称，所以这么选。
 */
function splitWord(text2: string): Array<{ word: string; start5: number; end2: number }> {
  const output2: Array<{ word: string; start5: number; end2: number }> = [];
  // ⚠️ 只认"字母 + 撇号 + 连字符"（`don't` 是一个词，`state-of-the-art` 整段
  // 先抓进来再拆）；数字与 CJK 一律不算——没有中文词典时把汉字标成错的是
  // 最刺眼的那种假阳性。
  const wholeParagraph = /[A-Za-z][A-Za-z'’]*(?:-[A-Za-z][A-Za-z'’]*)*/g;
  const oneParagraph = /[A-Za-z][A-Za-z'’]*/g;
  for (const m of text2.matchAll(wholeParagraph)) {
    const wholeParagraphText = m[0];
    const base = m.index ?? 0;
    // 没有连字符：整段就是一个词（判据同以前——两个字母起才查）。
    if (!wholeParagraphText.includes("-")) {
      const word = wholeParagraphText.replace(/['’]+$/, "");
      if (word.length >= 2) output2.push({ word, start5: base, end2: base + word.length });
      continue;
    }
    // 有连字符：按 `-` 拆开，每一段各自定位（这样波浪线只画在坏的那一段上）。
    for (const p of wholeParagraphText.matchAll(oneParagraph)) {
      const word = p[0].replace(/['’]+$/, "");
      if (word.length < 3) continue;
      const start5 = base + (p.index ?? 0);
      output2.push({ word, start5, end2: start5 + word.length });
    }
  }
  return output2;
}

/** 这一刻文档里所有值得查的词（含它在文档里的绝对位置）。 */
function getWord(state: EditorState) {
  const output2: Array<{ word: string; from: number; to2: number }> = [];
  state.doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text) return true;
    if (parent && shouldJumpPass(parent.type.name)) return false;
    for (const { word, start5, end2 } of splitWord(node.text)) {
      output2.push({ word, from: pos + start5, to2: pos + end2 });
    }
    return true;
  });
  return output2;
}

function goHeavy(list: Array<{ word: string; from: number; to2: number }>) {
  const searchReference = new Map<string, Array<{ from: number; to2: number }>>();
  for (const { word, from, to2 } of list) {
    const plural = searchReference.get(word);
    if (plural) plural.push({ from, to2 });
    else searchReference.set(word, [{ from, to2 }]);
  }
  return searchReference;
}

/**
 * 建一个"画波浪线"的插件。
 *
 * ⚠️ **它是 `Plugin` 而不是 `$prose`**：这一层不需要改 schema，只需要往 `decorations`
 * 里放东西——用 `$prose` 会把一件纯显示的事塞进编辑器内核那条链子里。
 */
/** 插件自己的 key：DecorationSet 存在**它自己的 state** 里（ProseMirror 的正规做法）。 */
const key = new PluginKey<DecorationSet>("nota-spell");

export function combineWriteCheckCheckPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: key,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, oldValue) {
        // ⚠️ 我们自己算出来的那一份是**通过 meta 递进来的**（见下面 `问` 里那次
        // dispatch）——插件 state 只能由 transaction 推，不能从外面塞。
        const newValue = tr.getMeta(key) as DecorationSet | undefined;
        if (newValue) return newValue;
        // 其余情况：跟着文档位移映射一遍（不映射的话波浪线会留在上一句的位置）。
        return oldValue.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state) ?? DecorationSet.empty;
      },
    },
    view(view) {
      let fixedTime: number | null = null;
      let thisValueWheel = 0;

      /** 把已经画上的线全擦掉（关掉开关、或文档里一个词都没有了）。 */
      const clearEmpty = () => {
        view.dispatch(view.state.tr.setMeta(key, DecorationSet.empty).setMeta("addToHistory", false));
      };

      const ask = async () => {
        // 开关关着：**一条线都不画**，而且要把上一轮画的擦掉（见 `设拼写开关` 那段）。
        if (!isOpen) {
          clearEmpty();
          return;
        }
        const thisOnePass = ++thisValueWheel;
        const position2 = getWord(view.state);
        if (position2.length === 0) {
          clearEmpty();
          return;
        }
        const searchReference = goHeavy(position2);
        const words = [...searchReference.keys()].slice(0, maxPerCall);
        let errorOfBelowMark: number[];
        try {
          errorOfBelowMark = await api.spell.check(currentLanguageLabel(), words);
        } catch {
          // 后端没装 / 词典没有：**一个人都不标**（见文件头最后一段）。
          return;
        }
        // ⚠️ **迟到的那一趟要丢掉**：打字快的时候好几趟在飞，先发的后回来会把
        // 波浪线画到旧位置上。
        if (thisOnePass !== thisValueWheel) return;
        const errorOfWord = new Set(errorOfBelowMark.map((i) => words[i]));
        const decoration: Decoration[] = [];
        for (const [word, paragraphs] of searchReference) {
          if (!errorOfWord.has(word)) continue;
          for (const { from, to2 } of paragraphs) {
            decoration.push(Decoration.inline(from, to2, { class: className2 }));
          }
        }
        const collection = DecorationSet.create(view.state.doc, decoration);
        // ⚠️ **不比对"和上次一样就不派"**：`DecorationSet` 在这个版本里没有 `eq`，
        // 而"多派一次"的代价只是重画一遍（`addToHistory: false`，撤销栈不受影响）。
        // ⚠️ 也**不会打转**：下面那次 dispatch 不改文档，而 `update` 只在 `doc` 变了时
        // 才重新排期——所以"派一次 → 再排一次"这条回路不存在。
        view.dispatch(view.state.tr.setMeta(key, collection).setMeta("addToHistory", false));
      };

      const arrange = () => {
        if (fixedTime !== null) window.clearTimeout(fixedTime);
        fixedTime = window.setTimeout(() => void ask(), SETTLE_MS);
      };

      // ⚠️ 立刻重查那一档**不走去抖**：用户刚点完「加入词典」/「忽略」，
      // 他要的是"这一下就没了"，再等 600 毫秒看着像没反应。
      rechecks.set(view, () => {
        if (fixedTime !== null) window.clearTimeout(fixedTime);
        void ask();
      });
      activeActiveOf.add(view);

      // 头一次进来先问一遍（打开时就有一篇现成的文档，不该等到敲第一个键）。
      arrange();
      return {
        update(view, oldValueState) {
          if (!view.state.doc.eq(oldValueState.doc)) arrange();
        },
        destroy() {
          if (fixedTime !== null) window.clearTimeout(fixedTime);
          rechecks.delete(view);
          activeActiveOf.delete(view);
        },
      };
    },
  });
}
