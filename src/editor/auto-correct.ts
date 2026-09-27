/**
 * **自动更正**：把刚打完的英文错拼当场换成对的（`teh` → `the`、`recieve` →
 * `receive`）。2026-09-27 落地，`docs/10` §8 那一格 ⬜。
 *
 * # 口径是那天定的，不是抄谁的
 *
 * ⚠️ 这一格在 `docs/10` 里**只有一行光秃秃的 ⬜**，全仓没有任何一处给过它定义
 * （"智能标点"至少还有一整组字段和界面控件摆着）。所以三条口径是 2026-09-27
 * 现定的，一并记在 `settings/markdown.rs` 的 `auto_correct` 上：
 *
 * 1. **只认一张固定的表**（下面那张 `错拼表`，四十来条）。**不做语法检查、
 *    不做句首自动大写、不碰中文**——前两样要带一整套词法（词性、句读、专名），
 *    猜错的代价远大于收益；第三样没有可用的免费词表，而"悄悄改一个汉字"
 *    比改一个英文词严重得多。
 * 2. **只在敲下词尾那一下动手**，也就是只改**刚打完的那一个词**。既不回头改
 *    已有文本，也不改还没定型的词（`teh` 打到 `te` 时不能动手——用户可能想打的
 *    是 `tell`）。触发字符**只有空格与制表符**：逗号句号那一族要让"替换"与
 *    "保留标点"两件事同时正确，而它们的收益比空格低得多（见下面"已知边界"）。
 * 3. **必须能撤销**：走 `inputRules`，`Ctrl+Z` 一步退回原文
 *   （`prosemirror-inputrules` 会把被替换掉的原文本记在插件状态里，
 *   连"改完立刻按退格"都能退回去，见 `undoInputRule`）。**这是"猜错了"的
 *   代价上限：一次撤销，不是一次数据损毁。**
 *
 * # 入表判据（唯一的一条，可检验）
 *
 * > **小写形式在英文里不是一个词。**
 *
 * 所以 `cant` / `wont` / `wether` / `lets` / `its` / `were` 这些**一个都不收**
 * ——它们的"错"只是"用户可能想打另一个词"，而它们本身就是合法的英文词
 * （`wont` 是"习惯"，`wether` 是"阉羊"）。收进去的症状是**把对的改成错的**，
 * 而那是这份表唯一不能犯的错。⚠️ 反过来，`dont` / `wich` / `teh` 这一族
 * 在任何语境下都不是词，改了只会变对。
 *
 * ⚠️ 表里**只有"一个词 → 一个词"**，没有 `alot` → `a lot` 那种一变二的。
 * 理由：一变二会让"替换了几个字符"和"插入了几个字符"分开算，而本文件的
 * 处理器刻意写得极短（只换词、不动后面那个空格）——为了几十条里的一条
 * 把这段复杂度翻倍，不划算。`alot` 因此**故意不在表里**。
 *
 * # 已知边界（如实记着）
 *
 * - ⚠️ **触发字符只有空格与制表符**。所以 `teh,` 后面直接跟逗号**不更正**，
 *   得等用户敲空格。代价是漏几处；收益是"标点原样留在原地"这件事不需要
 *   任何额外代码，也不会出现"逗号被吃掉"这类难查的毛病。
 * - ⚠️ **中文语境里不会触发**：正则只认 `[A-Za-z]`，中文词一个都不碰。
 * - ⚠️ **行内代码与围栏代码块里不触发**（`规则选项` 那条注释讲了机制）。
 * - ⚠️ **不做"用户自己加词"**：表是编进二进制的。真要能加，那张表得进
 *   `settings.toml` 或者一个侧车文件，而"用户词表"是个独立功能
 *   （`docs/10` §11.2 的边界表也管着它），不该塞在这一格里。
 */

import { $inputRule } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";

/**
 * 错拼表。**键一律小写、值一律小写**，大小写由 {@link 改词} 按原词推。
 *
 * ⚠️ 加词之前先过一遍入表判据（文件头那条）：**小写形式在英文里不是一个词**。
 */
export const 错拼表: Readonly<Record<string, string>> = {
  /* 高频打错（字母顺序颠倒 / 少打多打一颗） */
  teh: "the",
  adn: "and",
  taht: "that",
  thier: "their",
  wich: "which",
  freind: "friend",
  freinds: "friends",
  gaurd: "guard",
  writting: "writing",
  rythm: "rhythm",

  /* `ie` / `ei` 那一组 */
  recieve: "receive",
  recieved: "received",
  beleive: "believe",
  belive: "believe",
  acheive: "achieve",
  foriegn: "foreign",
  freindly: "friendly",

  /* 双写辅音 */
  occured: "occurred",
  occuring: "occurring",
  occassion: "occasion",
  posession: "possession",
  untill: "until",
  immediatly: "immediately",
  refered: "referred",

  /* 少写一颗字母 */
  seperate: "separate",
  seperated: "separated",
  definately: "definitely",
  enviroment: "environment",
  goverment: "government",
  knowlege: "knowledge",
  langauge: "language",
  happend: "happened",
  experiance: "experience",
  diffrent: "different",
  calender: "calendar",
  truely: "truly",
  usefull: "useful",

  /* 多写一颗字母 */
  accomodate: "accommodate",
  neccessary: "necessary",
  necesary: "necessary",
  succesful: "successful",
  sucessful: "successful",
  tommorow: "tomorrow",
  tommorrow: "tomorrow",
  whereever: "wherever",
  publically: "publicly",
  maintainance: "maintenance",
  persistant: "persistent",
  priviledge: "privilege",
  recommand: "recommend",
  relevent: "relevant",
  strenght: "strength",
  threshhold: "threshold",

  /* 打错的常用词 */
  becuase: "because",
  becasue: "because",
  realy: "really",

  /* 漏掉撒号的缩写。⚠️ 只收"少一颗撇号就不是词"的那些，
     `cant` / `wont` / `lets` / `its` 一个都不收（入表判据那条讲了为什么）。 */
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  isnt: "isn't",
  wasnt: "wasn't",
  werent: "weren't",
  arent: "aren't",
  havent: "haven't",
  hasnt: "hasn't",
  hadnt: "hadn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  youre: "you're",
  theyre: "they're",
  weve: "we've",
  thats: "that's",
  whats: "what's",
  theres: "there's",
  heres: "here's",
  wheres: "where's",
};

/**
 * 这一个词该不该换、换成什么；不该换给 `null`。
 *
 * **大小写跟着原词走**，三档：
 *
 * | 原词 | 结果 | 判据 |
 * |---|---|---|
 * | `teh` | `the` | 全小写 ⇒ 照搬表里的值 |
 * | `Teh` | `The` | 只有首字母大写 ⇒ 值的首字母也大写 |
 * | `TEH` | `THE` | 全大写（缩写 / 标题风格）⇒ 值整个大写 |
 *
 * ⚠️ **大小写混着写的（`tEh`）不猜**，原样放过。理由：那种写法是用户**故意**的
 * （写驼峰标识符、玩梗），替他把 `tEh` 改成 `The` 是这份表最不该做的事。
 *
 * ⚠️ **纯函数**，不碰文档、不碰 DOM——测试（`tests/auto-correct.test.ts`）
 * 与输入规则用的是**同一个**它。表里那几十条的大小写三档也就都能单测。
 */
export function 改词(词: string): string | null {
  const 正 = 错拼表[词.toLowerCase()];
  if (!正) return null;
  if (词 === 词.toLowerCase()) return 正;
  if (词 === 词.toUpperCase()) return 正.toUpperCase();
  const 首 = 词[0]!;
  const 尾 = 词.slice(1);
  if (首 === 首.toUpperCase() && 尾 === 尾.toLowerCase()) return 首 + 正.slice(1);
  return null;
}

/**
 * 每一条规则都要带的那份选项。⚠️ 理由与 `smart-punctuation.ts` 里那个同名常量
 * **完全一样**（`inCodeMark` 的默认值是 `true`，不写这一句行内代码里也会生效），
 * 那段长注释在那边，这里不重复。
 */
const 规则选项 = { inCodeMark: false } as const;

/**
 * 词尾那一下的触发字符。**只有空格与制表符**，理由在文件头"已知边界"里。
 *
 * ⚠️ 正则前面**不加 `\b`**：`([A-Za-z][A-Za-z']*)` 是贪婪的，`xthe ` 匹配到的
 * 是 `xthe` 而不是 `the`，查表落空、什么都不做——**这正是想要的**，
 * 加 `\b` 反而会让 `xthe` 里的 `the` 被挑出来（而 `\b` 在 `x` 与 `t` 之间是成立的，
 * 它管的是"词字符与非词字符的边界"）。
 *
 * ⚠️ **导出是给测试用的**：文件头那几条"触发字符只有空格、中文不碰、`teh,` 不更正"
 * 都只能在这一层钉住（输入规则本身要真 `Editor.make()` 才跑得起来）。
 */
export const 词尾正则 = /([A-Za-z][A-Za-z']*)[ \t]$/;

/**
 * 挂进 `.use()` 的那一条输入规则。**关着的时候返回空数组**（不是"挂上去再
 * 返回 null"）——理由与 `smart-punctuation.ts` 的 `标点输入` 逐字相同：
 * 输入规则每敲一个字符都要跑一遍正则，关掉就不该还在跑。
 *
 * ⚠️ **位置其实无关紧要，但仍然排在 `gfm` 与智能标点之后**：上游那些输入规则
 * 要的分隔符是 `#` / `>` / `-` / 数字 / 反引号 / `$`，**没有一条以字母加空格结尾**，
 * 所以抢不起来。排在后面是零代价的保险——万一将来上游多一条认字母的规则，
 * 让上游先中总是对的。
 */
export function 自动更正输入(开: boolean) {
  if (!开) return [];
  return [
    $inputRule(() =>
      new InputRule(词尾正则, (state, 匹配, 始, 终) => {
        const 替 = 改词(匹配[1]!);
        if (!替) return null;
        // ⚠️ **只换那个词，不碰后面那颗空格**：`终` 是光标（在空格之后），
        // 而 `匹配[0]` 是"词 ＋ 一颗空白"，所以词尾落在 `终 - 1`。
        // 连空白一起换掉的话，用户敲的那颗空格会被这一步吃掉，
        // 表现为"打完词按空格，空格没了"——那是最容易被当成"编辑器坏了"的症状。
        return state.tr.insertText(替, 始, 终 - 1);
      }, 规则选项),
    ),
  ];
}
