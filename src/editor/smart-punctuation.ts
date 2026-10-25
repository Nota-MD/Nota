/**
 * **智能标点**：把敲进去的 ASCII 标点换成排印上正确的那个字符
 *（`"` → `“ ”`、`--` → `–`、`---` → `—`、`...` → `…`）。
 *
 * # 它为什么拖到 2026-09-27 才做
 *
 * ⚠️ **设置字段 2026-09-24 就有了，界面上也有整整一组控件**
 *（`src-tauri/src/settings/markdown.rs` 的 `smart_punctuation` / `smart_quotes` /
 * `smart_quotes_double` / `smart_quotes_single` / `smart_dashes` / `dash_style`，
 * 界面在 `MarkdownPane.tsx` 的「智能标点」那一组）——**全仓没有一个消费者**。
 * 也就是说：那个下拉拨到「输入时转换」、开关打开，**一个字符都不会变**。
 * 这跟 2026-09-25 修掉的那六个外观字段是**同一类账**（`docs/10` §11.2）：
 * 一个设置项"存在"不等于"生效"，账要按**消费者**记。本文件就是来当消费者的。
 *
 * # 三条口径（都不是我定的，是那个文件早就写死的）
 *
 * 1. **绝不改已有字节**。转换只发生在 `inputRules` 里，也就是**用户刚敲进那一个
 *    字符**的那一下。打开一份老文档、里面全是 `--`，存盘**一个字节都不动**。
 *    这是 Nota 那条铁律（"存盘不要自动修复"）的落点，也是 `Render` 这一档
 *    存在的理由。
 * 2. **`Off` / `Render` / `Input` 三档**（`SmartPunctuation` 枚举）：
 *    `Off` 什么都不做；`Render` **只在编辑区显示成转换后的样子**，文件、导出、
 *    打印一律不动；`Input` 敲下去当场变（**默认**）。
 * 3. **关掉的那一项一个字符都不碰**。`smart_quotes = false` 时 `"` 就是 `"`，
 *    哪怕模式是 `Input`。
 *
 * # `Render` 是怎么"只显示不改字"的
 *
 * 装饰（`Decoration`）＋ **隐藏原文**：命中处挂一条 `Decoration.inline`
 * （把原来那两个字符的 `font-size` 压成 0），紧挨着前面放一颗
 * `Decoration.widget` 画转换后的字符。⚠️ **两半缺一不可**——只挂 inline 的话
 * 原文还在（`font-size: 0` 只是让它没有宽度，字还是那些字，选中复制出去还是
 * `--`），只挂 widget 的话屏幕上会变成 `--–`。
 *
 * ⚠️ **它和「光标所在的标记淡化」（`instant-render.ts`）是两份装饰**，
 * 别合并：那一条画的是**标记本身**、跟着光标走，这一条画的是**正文的替身**、
 * 与光标无关。两条都往 `DecorationSet` 上挂，各自算各自的。
 *
 * # 已知边界（如实记着）
 *
 * - ⚠️ **`Render` 模式碰不到导出与打印**。那两处走 `editor/export.ts`
 *   自己另建的那个只读实例，而它**拿到的是 `pm.innerHTML`**——所以
 *   `create-types.ts` 的 `标点` 那一格明写"**导出那一条路不许传它**"：
 *   传了就等于把 `–` 和那颗被压成 0 宽的 `--` 一起写进导出文件，
 *   而这一档的全部承诺就是"一个字节都不写"。要让导出也跟着变，得在导出
 *   那条路上**另外**走一遍标点转换，那是另一件事（而且会掉进"代码块里的
 *   `--` 被换掉"那个坑，得先有一份"哪儿是代码"的判据）。
 * - ⚠️ **分屏右侧那个只读预览要传**（`EditorPane` 传了）：它显示的是编辑区
 *   那一份的样子，与 `inlineMarks` 同一条口径——两边不一样的话，`--` 在左边
 *   是 `–`、在右边是 `--`，用户会以为分屏坏了。⚠️ 代价如实记：那一格 DOM
 *   长什么样，与导出文件**不是**一回事（导出走的是另一个实例）。
 * - ⚠️ **`unicode_punctuation` 这一格仍然没有消费者**（它的说明是"解析
 *   Markdown 时允许并转化 Unicode 标点"，那是**解析**侧的事，与本文件的
 *   **输入**侧不是一回事）。这条缺口记在 `docs/10` §11.2。
 * - ⚠️ **输入规则看得见的最多只有光标前 500 个字符**
 *   （`prosemirror-inputrules` 的 `MAX_MATCH`），所以"引号朝哪边弯"靠的是
 *   紧挨着的那一个字符，不是整行的语法分析。`“` 与 `”` 在**行首**、
 *   **左括号后**、**空白后**当开引号，其余当闭引号——这是英文排版的惯例，
 *   中文那是另一套（本仓不区分语区，同 `QuoteStyle` 那条注释）。
 */

import { $inputRule, $prose } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";

/* ── 设置（`Settings.markdown` 那六格的投影）──────────────────────────── */

/** 什么时候转换。与 Rust 那边 `SmartPunctuation` 的三个变体一一对应。 */
export type PunctuationTimeMachine = "off" | "render" | "input";

/** 引号字形。与 `QuoteStyle` 一一对应。 */
export type ReferenceNumberCharacterShape = "curly" | "straight";

/** `--` 变成什么。与 `DashStyle` 一一对应。 */
export type DashWindCell = "en-em" | "em";

/**
 * 这一层要的全部设置。**字段名与 Rust 那边逐条对应**（`markdown.rs`），
 * 名字取自 `src/bridge/types.ts` 的驼峰写法，`EditorPane` 负责投影。
 */
export interface punctuationSettings {
  mode2: PunctuationTimeMachine;
  referenceNumber: boolean;
  /** 双引号（`"`）的字形。 */
  doubleReferenceNumber: ReferenceNumberCharacterShape;
  /** 单引号（`'`）的字形。 */
  singleReferenceNumber: ReferenceNumberCharacterShape;
  dash: boolean;
  windCell: DashWindCell;
  /**
   * `...` → `…`。
   *
   * ⚠️ **设置页里没有这一格**（Rust 那边也没有这个字段），它跟着
   * `模式` 走：只要模式不是 `off`、且**破折号那一格开着**就生效。
   * 挂靠理由：省略号与破折号是同一类东西（"三个字符挤成一个字形"），
   * 而为一个字符再开一格设置、再改一次 `settings.toml` 的结构，
   * 代价与它不匹配。这条是**有意**的，不是忘了。
   */
  saveOmitNumber: boolean;
}

/** 出厂默认。⚠️ 与 Rust 那边的 `Default` **必须一致**（六项逐条对过）。 */
export const DefaultPunctuationSettings: punctuationSettings = {
  mode2: "input",
  referenceNumber: true,
  doubleReferenceNumber: "curly",
  singleReferenceNumber: "curly",
  dash: true,
  windCell: "en-em",
  saveOmitNumber: true,
};

/* ── 第一格：纯函数（判据都在这儿）────────────────────────────────────── */

/**
 * 这一颗引号该朝哪边弯。
 *
 * @param 前一个 紧挨在引号**前面**的那一个字符（行首给空串）。
 *
 * ⚠️ **判据只有"前面那一个字符"**，不是整行的语法分析——输入规则手里也只有
 * 这一截（见文件头最后那条）。开引号的三种前文：行首、空白、
 * 左括号那一族（`([{<` 与全角的 `（【「『`）。
 */
export function curveReferenceNumber(previous: string, isDoubleReferenceNumber: boolean, characterShape: ReferenceNumberCharacterShape): string {
  const open2 = previous === "" || /[\s([{<（【「『“‘]/.test(previous);
  if (characterShape === "straight") return isDoubleReferenceNumber ? '"' : "'";
  return isDoubleReferenceNumber ? (open2 ? "“" : "”") : open2 ? "‘" : "’";
}

/** 一对引号的开头与结尾。直引号两边相同，弯引号分开。 */
export interface ReferenceNumberConfigureMethod {
  open2: string;
  close3: string;
}

/** 当前字形下的一对引号。 */
export function getReferenceNumberConfigureMethod(isDoubleReferenceNumber: boolean, characterShape: ReferenceNumberCharacterShape): ReferenceNumberConfigureMethod {
  return {
    open2: curveReferenceNumber("", isDoubleReferenceNumber, characterShape),
    close3: curveReferenceNumber("甲", isDoubleReferenceNumber, characterShape),
  };
}

/**
 * 这个位置按引号键时，是“开始一段引文”还是“结束/撒号”。
 *
 * 与输入规则共用同一份前文判据，避免自动补对和智能标点把同一颗按键理解成
 * 两个方向。
 */
export function isOpenReferenceNumberPosition(previous: string): boolean {
  return previous === "" || /[\s([{<（【「『“‘]/.test(previous);
}

/**
 * 前文里是否还有一个没有闭合的开引号。
 *
 * 直引号的开闭是同一颗，只能按奇偶判断；弯引号分别计数。反斜杠后的引号不计数。
 */
export function hasNotCloseCombineReferenceNumber(prefixText: string, open2: string, close3: string): boolean {
  let layer = 0;
  let convertMeaning = false;
  for (const character2 of prefixText) {
    if (convertMeaning) {
      convertMeaning = false;
      continue;
    }
    if (character2 === "\\") {
      convertMeaning = true;
      continue;
    }
    if (open2 === close3 && character2 === open2) {
      // 直引号没有方向，只能按奇偶成对。
      layer = layer === 0 ? 1 : 0;
    } else if (character2 === open2) {
      layer += 1;
    } else if (character2 === close3 && layer > 0) {
      layer -= 1;
    }
  }
  return layer > 0;
}

/**
 * 一串连字符该变成哪个破折号。
 *
 * ⚠️ `en-em`（默认）与 `em` 两档的差别**只在两个连字符那一档上**：
 * 三个及以上在两种风格下都是 `—`（em dash）——这是 `DashStyle` 那个枚举
 * 的注释里写死的语义，不是这里自己定的。
 *
 * @param 个数 打进文档的连字符个数（`2` 或 `3+`）。
 */
export function dash(windCell: DashWindCell, itemNumber: number): string {
  if (itemNumber >= 3) return "—";
  return windCell === "en-em" ? "–" : "—";
}

/** 撒号（`don't` 里那颗）该不该用 `’` 而不是 `‘`。 */
function isApostropheNumber(prefixText: string): boolean {
  return /[\p{L}\p{N}]$/u.test(prefixText);
}

/* ── 第二格：扫描（`Render` 模式用它，测试也用它）────────────────────── */

/** 一处该被换掉的地方。`始` / `终` 是**文本节点内**的偏移。 */
export interface PunctuationMatch {
  start6: number;
  end3: number;
  /** 替换成的那串字符。 */
  replace: string;
}

/**
 * 扫一段文本，列出所有该换掉的地方。
 *
 * ⚠️ **纯函数**：不碰文档树、不碰 DOM，`Render` 那条装饰插件与测试用的是
 * **同一份**判据（`tests/smart-punctuation.test.ts`）。这正是 `find.ts` /
 * `find.ts` 那条规矩——"匹配逻辑只有一份"。
 *
 * 返回的顺序是**从前往后、互不重叠**（边扫边跳过已命中的那一段），
 * 所以调用方可以直接拿着偏移去挂装饰。
 */
export function scanPunctuation(text4: string, settings: punctuationSettings): PunctuationMatch[] {
  if (settings.mode2 === "off") return [];
  const output2: PunctuationMatch[] = [];
  let i = 0;
  while (i < text4.length) {
    const character2 = text4[i]!;
    // ── 破折号：`--` / `---`（**先吃掉整串**，别一次只吃两个）
    if (settings.dash && character2 === "-" && text4[i + 1] === "-") {
      let n = 0;
      while (text4[i + n] === "-") n++;
      // ⚠️ 四个及以上的连字符**不碰**：那是分割线（`----`）或者用户手打的
      // 一串横线，换成 `——` 会让那一行从"分割线"变成"正文里的一个破折号"。
      if (n <= 3) {
        output2.push({ start6: i, end3: i + n, replace: dash(settings.windCell, n) });
        i += n;
        continue;
      }
      i += n;
      continue;
    }
    // ── 省略号：`...`（**只吃三个**，`....` 里的前三个照换）
    if (settings.dash && settings.saveOmitNumber && character2 === "." && text4[i + 1] === "." && text4[i + 2] === ".") {
      output2.push({ start6: i, end3: i + 3, replace: "…" });
      i += 3;
      continue;
    }
    // ── 引号：逐颗判断朝哪边
    if (settings.referenceNumber && (character2 === '"' || character2 === "'")) {
      const isDouble = character2 === '"';
      const characterShape = isDouble ? settings.doubleReferenceNumber : settings.singleReferenceNumber;
      const prefixText = text4.slice(0, i);
      const replace =
        characterShape === "straight"
          ? character2
          : !isDouble && isApostropheNumber(prefixText)
            ? "’"
            : curveReferenceNumber(prefixText.slice(-1), isDouble, characterShape);
      if (replace !== character2) output2.push({ start6: i, end3: i + 1, replace });
      i++;
      continue;
    }
    i++;
  }
  return output2;
}

/* ── 第三格：输入规则（`Input` 模式）────────────────────────────────── */

/**
 * 每一条规则都要带的那份选项。
 *
 * ⚠️⚠️ **`inCodeMark: false` 是必须写的，不能省。** `prosemirror-inputrules`
 * 的默认值是 **`true`**（`this.inCodeMark = options.inCodeMark !== false`），
 * 而那一句守卫长这样：
 *
 * ```js
 * if (!rule.inCodeMark && $from.marks().some(m => m.type.spec.code)) continue;
 * ```
 *
 * 也就是说：默认值 `true` 会让 `!rule.inCodeMark` 恒为假、**这句守卫整个不生效**
 * ——行内代码（`` `--` ``）里的字符**照转不误**。分割线那种"整块只有三个减号"的
 * 上游规则靠"必须占满整块"躲开了这个坑，本文件这几条**只认光标前那几个字符**，
 * 躲不开，只能自己声明。
 *
 * ⚠️ 围栏代码块（` ``` `）那一侧**不用管**：`run()` 里有另一句
 * `if ($from.parent.type.spec.code) { if (!rule.inCode) continue }`，
 * 而 `inCode` 默认就是 `false`。
 */
const ruleRuleOption = { inCodeMark: false } as const;

/**
 * 「光标前这一截」**除了表格骨架（空白、横线、竖线、冒号）以外没有别的字符**吗。
 *
 * ⚠️⚠️ **这是本文件最要紧的一条守卫**：两种**别的功能**都靠它活着，一种都别漏。
 *
 * ① **分割线**：用户敲 `---` 走的是三次 `handleTextInput`，而**第二次**那一下
 * 前文正好是 `--`——本文件的 `-{2}$` 会当场把它换成 `–`，等第三颗 `-` 落下来
 * 时那一行已经是 `–-`，上游的分割线规则（`/^(?:---|___\s|\*\*\*\s)$/`，
 * `preset-commonmark/lib/index.js:1132`）**再也认不出来**。症状是
 * 「敲 `---` 出不来分割线了」，而它是一条**一直好用**的老功能。
 * ⚠️ 三减号那条也一起挡：行首敲到第四颗时前文是 `----`，上游不认（要求正好
 * 三个），本文件认了会变成 `—-`——同样不是用户要的。
 *
 * ② **表格输入**（2026-09-27 修，BUG-51）：敲 `| --- | --- |` 建表时，前两格
 * 里的 `--` 会被换成 `–`，那一行落进文档的是 `| –- | –- |`——而
 * `table-input.ts` 的判据是**照 GFM 写死的**（`-\+` 不认 `–`），于是
 * **表格永远建不出来**，用户看到的就是"没反应"（他的原话：「现在直接输入
 * 还是没反应」）。⚠️ 光把 `-` 豁免还不够：分隔行允许对齐冒号
 * （`| :--- | ---: |`），`:` 也得在内，不然 `| :--` 照样被换掉。
 * ⚠️ **实测证据**：修之前敲完那两行、Ctrl+S，盘上是
 * `\| a | b |` ＋空行＋ `\| –- | –- |`（`–` 是 U+2013）。
 *
 * ⚠️ **代价如实记**（会让某一小类输入不转换）：整行只有"骨架"字符时一律不换。
 * 列表项里手打的 `- --`、表格外的 `| --` 都归这一类。拿这个换"分割线不出毛病
 * ＋表格能打出来"，值。
 *
 * ⚠️ 判据只看**光标前那一截**（输入规则手里也只有这一截），不是整行语法分析；
 * 所以"行里已经有字"时照转不误——那是对的：`| a | --` 这种数据格里的 `--`
 * 本来就该变成 `–`。
 */
export function onlyHasHorizontalLineBoneFrame(prefixText: string): boolean {
  return /^[\s|:-]*$/.test(prefixText);
}

/** 上面那条判据的取数：从段落开头到光标。 */
function isHorizontalLineBoneFrameLine(state: EditorState, start6: number): boolean {
  const start = state.doc.resolve(start6);
  return onlyHasHorizontalLineBoneFrame(start.parent.textBetween(0, start.parentOffset, "", ""));
}

/** 连字符那一串：**两条规则**（`---` 在前，长的先试）。 */
function dashRuleRule(settings: punctuationSettings) {
  const oneItem = (itemNumber: 2 | 3) =>
    $inputRule(() =>
      new InputRule(
        new RegExp(`-{${itemNumber}}$`),
        // ⚠️ 这里**不再判 `设置.破折号`**：关掉那一格时这一条压根不注册
        // （见 `标点输入`）。判据只留一处，读的人不必两头对。
        (state, _m, start6, end3) =>
          isHorizontalLineBoneFrameLine(state, start6) ? null : replaceRemove(state, start6, end3, dash(settings.windCell, itemNumber)),
        ruleRuleOption,
      ),
    );
  return [oneItem(3), oneItem(2)];
}

function saveOmitNumberRuleRule() {
  return $inputRule(() =>
    new InputRule(/\.{3}$/, (state, _m, start6, end3) => replaceRemove(state, start6, end3, "…"), ruleRuleOption),
  );
}

/** 把 `[始, 终)` 换成 `替`。⚠️ 只换文本，不动任何 mark 与节点结构。 */
function replaceRemove(state: EditorState, start6: number, end3: number, replace: string) {
  return state.tr.insertText(replace, start6, end3);
}

/**
 * 挂进 `.use()` 的输入规则（**`Input` 模式专用**），最多三条：
 * `---` / `--` / `...`。
 *
 * 引号不走输入规则：它们要同时完成“开引号补另一边、闭引号跳过去、选中文字
 * 时包起来”，这些都需要 `handleTextInput` 拿到选区。`引号配对` 接管全部
 * 引号字形转换，本函数不再注册 `"` / `'`。
 *
 * ⚠️ **该关的一律不注册**，不是在处理器里返回 `null`——两处判据只留一处：
 *
 * | 情况 | 注册几条 |
 * |---|---|
 * | 模式不是 `input` | **0**（一条都不挂） |
 * | `破折号 = false` | 少掉 `---` / `--` / `...` 三条（省略号挂靠在破折号上） |
 * | `省略号 = false` | 少掉 `...` 一条 |
 * | `引号 = false` | 输入规则条数不变；`引号配对` 不安装 |
 *
 * 理由有两条：① 输入规则**每敲一个字符都要跑一遍全部正则**，关掉的不该还在跑；
 * ② 条数本身是个可测的判据（`tests/smart-punctuation.test.ts` 第四组拿它钉
 * "`EditorPane` 为什么必须把六个字段全放进重建依赖里"）。
 *
 * ⚠️ **排在其他输入规则后面**（`create.ts` 里的位置在 `gfm` 之后）：
 * 它认的是**已经落进文档的字符**，而 `--` / `...` 这些在显式语法里都有
 * 别的可能（`---` 是分割线、`| --- |` 是表格的分隔行！）。⚠️ **这两条是真会
 * 打架的**，靠 `是横线骨架行` 那道守卫让开，理由写在那个函数上——那是本文件
 * 最容易、也已经真的被改坏过的一处（BUG-51）。
 */
export function punctuationInput(settings: punctuationSettings) {
  if (settings.mode2 !== "input") return [];
  const output2 = [];
  // ⚠️ 省略号**挂靠在破折号那一格上**（`标点设置.省略号` 那条注释讲了为什么）。
  if (settings.dash) {
    output2.push(...dashRuleRule(settings));
    if (settings.saveOmitNumber) output2.push(saveOmitNumberRuleRule());
  }
  return output2;
}

/* ── 第三½格：引号自动配成对（`Input` 模式）──────────────────────────── */

export const referenceNumberConfigureCorrectKey = new PluginKey("nota-smart-quote-pair");

function atCodeInside(state: EditorState, position2: number): boolean {
  const position = state.doc.resolve(position2);
  for (let layer = position.depth; layer > 0; layer -= 1) {
    if (position.node(layer).type.spec.code) return true;
  }
  return position.marks().some((mark) => mark.type.spec.code);
}

/**
 * 处理敲下的一颗直引号。
 *
 * 返回 `null` 表示不接管，让智能标点输入规则按旧路处理。这里负责的是浏览器
 * 本身不会提供、而且输入规则也很难补上的三种手感：
 * - 在空位置敲开引号：一次得到 `“|”`；
 * - 光标停在自动补出的闭引号前：再敲引号只跨过去；
 * - 选中一段再敲引号：用一对引号包住选区，并保留选区。
 */
export function referenceNumberInputTransaction(
  state: EditorState,
  from: number,
  to2: number,
  character2: string,
  settings: punctuationSettings,
): Transaction | null {
  if (settings.mode2 !== "input" || !settings.referenceNumber || (character2 !== '"' && character2 !== "'")) return null;
  const isDouble = character2 === '"';
  const characterShape = isDouble ? settings.doubleReferenceNumber : settings.singleReferenceNumber;
  const { open2, close3 } = getReferenceNumberConfigureMethod(isDouble, characterShape);
  const fromValue = state.doc.resolve(from);
  if (!fromValue.parent.inlineContent || atCodeInside(state, from)) return null;

  if (from !== to2) {
    const to = state.doc.resolve(to2);
    if (!fromValue.sameParent(to) || atCodeInside(state, to2)) return null;
    const tr = state.tr;
    tr.insertText(close3, to2, to2);
    tr.insertText(open2, from, from);
    tr.setSelection(TextSelection.create(tr.doc, from + open2.length, to2 + open2.length));
    return tr.scrollIntoView();
  }

  const parent = fromValue.parent;
  const offset = fromValue.parentOffset;
  const before2 = offset > 0 ? parent.textBetween(offset - 1, offset, "") : "";
  const after = offset < parent.content.size ? parent.textBetween(offset, offset + 1, "") : "";
  const prefixText = parent.textBetween(0, offset, "");

  // `don't` 里的单引号是撒号，要落成 `’`，但不要再补一对。
  if (!isDouble && /[\p{L}\p{N}]$/u.test(before2) && !isOpenReferenceNumberPosition(before2)) {
    return state.tr.insertText(close3, from);
  }
  if (before2 === "\\") return null;

  // 先判“越过我们补出来的闭引号”，再判“这里算不算开引号位置”：
  // 光标夹在 `“|”` 中间时，前一颗本身就是开引号，后判会再补一对。
  if (after === close3 && hasNotCloseCombineReferenceNumber(prefixText, open2, close3)) {
    return state.tr
      .setSelection(TextSelection.create(state.doc, from + 1))
      .setMeta("addToHistory", false);
  }

  if (isOpenReferenceNumberPosition(before2)) {
    const tr = state.tr.insertText(open2 + close3, from);
    tr.setSelection(TextSelection.create(tr.doc, from + open2.length));
    return tr;
  }

  return state.tr.insertText(close3, from);
}

/** 引号配对的 ProseMirror 插件。导出是为了让测试直接驱动 `handleTextInput`。 */
export function createReferenceNumberConfigureCorrectPlugin(settings: punctuationSettings): Plugin {
  return new Plugin({
    key: referenceNumberConfigureCorrectKey,
    props: {
      handleTextInput: (view: EditorView, from, to2, text4) => {
        if (view.composing || text4.length !== 1) return false;
        const tr = referenceNumberInputTransaction(view.state, from, to2, text4, settings);
        if (!tr) return false;
        view.dispatch(tr);
        return true;
      },
    },
  });
}

/**
 * 挂进 `.use()` 的引号配对插件。
 *
 * 必须在 `标点输入` **前面**：两者都听 `handleTextInput`，本插件先接管时才能
 * 一次放进成对引号；排到输入规则后面就只能看到已经被替换过的单颗字符。
 */
export function referenceNumberConfigureCorrect(settings: punctuationSettings) {
  if (settings.mode2 !== "input" || !settings.referenceNumber) return [];
  return $prose(() => createReferenceNumberConfigureCorrectPlugin(settings));
}

/* ── 第四格：显示装饰（`Render` 模式）──────────────────────────────── */

export const punctuationDecorationKey = new PluginKey("notaSmartPunct");

/** 一处装饰：文档位置上的 `[从, 到)` 换成 `替`。 */
export interface DecorationItem {
  from: number;
  to2: number;
  replace: string;
}

/**
 * 一份文档该挂哪些装饰 —— **纯函数，`state` 与 DOM 都不需要**。
 *
 * ⚠️ 抽出来单放的理由是**位置换算最容易错**：`扫标点` 给的偏移是
 * **文本节点内**的，而装饰要的是**文档位置**，中间差着节点自己的起点。
 * 拆成纯函数之后 `tests/smart-punctuation.test.ts` 能直接拿一份手搓文档
 * 把每个 `从`/`到` 逐条钉住（`find.ts` 那条"匹配逻辑只有一份、
 * 而且必须能单独测"是同一条规矩）。
 *
 * ⚠️ 只扫文档，**不碰选择**：它与光标在哪无关（这一点和 `instant-render`
 * 正相反——那一条的判据就是光标）。
 */
export function decorationClearSingle(document: PMNode, settings: punctuationSettings): DecorationItem[] {
  const output2: DecorationItem[] = [];
  document.descendants((node, position2) => {
    if (!node.isText || !node.text) return;
    for (const match of scanPunctuation(node.text, settings)) {
      output2.push({ from: position2 + match.start6, to2: position2 + match.end3, replace: match.replace });
    }
  });
  return output2;
}

/** 把 {@link 装饰清单} 算出来的东西变成 ProseMirror 的装饰集。 */
function computeDecorations(state: EditorState, settings: punctuationSettings): DecorationSet {
  const install: Decoration[] = [];
  for (const item5 of decorationClearSingle(state.doc, settings)) {
    // 原文压成 0 宽（CSS 在 `editor.css` 的 `.nota-smart-hide`）；
    // 转换后的字符交给紧挨着的 widget 画。
    install.push(Decoration.inline(item5.from, item5.to2, { class: "nota-smart-hide" }));
    install.push(
      Decoration.widget(
        item5.from,
        () => {
          const box = document.createElement("span");
          box.className = "nota-smart-show";
          box.textContent = item5.replace;
          // ⚠️ 这一颗**不是可编辑内容**：不让 PM 把光标停进去，
          // 也不参与选中（选中的仍然是文档里那两个字符）。
          box.setAttribute("aria-hidden", "true");
          return box;
        },
        { side: -1 },
      ),
    );
  }
  return DecorationSet.create(state.doc, install);
}

/**
 * `Render` 模式那条插件。**模式不是 `render` 时返回空数组。**
 *
 * ⚠️ 装饰**不进文档、不进撤销栈**（和查找高亮、块标记淡化同一条口径）：
 * 拖一下窗口、敲一个字，它重算一遍，但 `getMarkdown()` 出来的仍是用户写的
 * 那两个减号。
 */
export function punctuationDecoration(settings: punctuationSettings) {
  if (settings.mode2 !== "render") return [];
  return [
    $prose(
      () =>
        new Plugin({
          key: punctuationDecorationKey,
          state: {
            init: (_c, state) => computeDecorations(state, settings),
            apply: (tr, _OldValue, _Old, newValue) => (tr.docChanged ? computeDecorations(newValue, settings) : _OldValue),
          },
          props: { decorations: (state) => punctuationDecorationKey.getState(state) },
        }),
    ),
  ];
}

/**
 * ⚠️ **`EditorPane` 那边一律"六项任一变化就重建"**，这里不再提供
 * `要重建(前, 后)` 那样的判据。曾经写过一版（让字形与破折号风格热更新），
 * 并进过测试——然后发现那条路有个洞：**只换字形时不重建，活着的实例闭包里
 * 还是旧字形，而屏幕上什么都不会变**，正是本仓最忌的"设置像没生效"。
 * 现在重建那一侧只在 `EditorPane` 的一个 `useMemo` 依赖里，口径一条：
 * 六个字段里任何一个变了就重挂。
 */
