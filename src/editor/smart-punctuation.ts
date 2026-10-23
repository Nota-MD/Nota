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
export type 标点时机 = "off" | "render" | "input";

/** 引号字形。与 `QuoteStyle` 一一对应。 */
export type 引号字形 = "curly" | "straight";

/** `--` 变成什么。与 `DashStyle` 一一对应。 */
export type 破折号风格 = "en-em" | "em";

/**
 * 这一层要的全部设置。**字段名与 Rust 那边逐条对应**（`markdown.rs`），
 * 名字取自 `src/bridge/types.ts` 的驼峰写法，`EditorPane` 负责投影。
 */
export interface 标点设置 {
  模式: 标点时机;
  引号: boolean;
  /** 双引号（`"`）的字形。 */
  双引号: 引号字形;
  /** 单引号（`'`）的字形。 */
  单引号: 引号字形;
  破折号: boolean;
  风格: 破折号风格;
  /**
   * `...` → `…`。
   *
   * ⚠️ **设置页里没有这一格**（Rust 那边也没有这个字段），它跟着
   * `模式` 走：只要模式不是 `off`、且**破折号那一格开着**就生效。
   * 挂靠理由：省略号与破折号是同一类东西（"三个字符挤成一个字形"），
   * 而为一个字符再开一格设置、再改一次 `settings.toml` 的结构，
   * 代价与它不匹配。这条是**有意**的，不是忘了。
   */
  省略号: boolean;
}

/** 出厂默认。⚠️ 与 Rust 那边的 `Default` **必须一致**（六项逐条对过）。 */
export const 默认标点设置: 标点设置 = {
  模式: "input",
  引号: true,
  双引号: "curly",
  单引号: "curly",
  破折号: true,
  风格: "en-em",
  省略号: true,
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
export function 弯引号(前一个: string, 是双引号: boolean, 字形: 引号字形): string {
  const 开 = 前一个 === "" || /[\s([{<（【「『“‘]/.test(前一个);
  if (字形 === "straight") return 是双引号 ? '"' : "'";
  return 是双引号 ? (开 ? "“" : "”") : 开 ? "‘" : "’";
}

/** 一对引号的开头与结尾。直引号两边相同，弯引号分开。 */
export interface 引号配法 {
  开: string;
  闭: string;
}

/** 当前字形下的一对引号。 */
export function 取引号配法(是双引号: boolean, 字形: 引号字形): 引号配法 {
  return {
    开: 弯引号("", 是双引号, 字形),
    闭: 弯引号("甲", 是双引号, 字形),
  };
}

/**
 * 这个位置按引号键时，是“开始一段引文”还是“结束/撒号”。
 *
 * 与输入规则共用同一份前文判据，避免自动补对和智能标点把同一颗按键理解成
 * 两个方向。
 */
export function 是开引号位置(前一个: string): boolean {
  return 前一个 === "" || /[\s([{<（【「『“‘]/.test(前一个);
}

/**
 * 前文里是否还有一个没有闭合的开引号。
 *
 * 直引号的开闭是同一颗，只能按奇偶判断；弯引号分别计数。反斜杠后的引号不计数。
 */
export function 有未闭合引号(前文: string, 开: string, 闭: string): boolean {
  let 层 = 0;
  let 转义 = false;
  for (const 字 of 前文) {
    if (转义) {
      转义 = false;
      continue;
    }
    if (字 === "\\") {
      转义 = true;
      continue;
    }
    if (开 === 闭 && 字 === 开) {
      // 直引号没有方向，只能按奇偶成对。
      层 = 层 === 0 ? 1 : 0;
    } else if (字 === 开) {
      层 += 1;
    } else if (字 === 闭 && 层 > 0) {
      层 -= 1;
    }
  }
  return 层 > 0;
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
export function 破折号(风格: 破折号风格, 个数: number): string {
  if (个数 >= 3) return "—";
  return 风格 === "en-em" ? "–" : "—";
}

/** 撒号（`don't` 里那颗）该不该用 `’` 而不是 `‘`。 */
function 是撒号(前文: string): boolean {
  return /[\p{L}\p{N}]$/u.test(前文);
}

/* ── 第二格：扫描（`Render` 模式用它，测试也用它）────────────────────── */

/** 一处该被换掉的地方。`始` / `终` 是**文本节点内**的偏移。 */
export interface 标点命中 {
  始: number;
  终: number;
  /** 替换成的那串字符。 */
  替: string;
}

/**
 * 扫一段文本，列出所有该换掉的地方。
 *
 * ⚠️ **纯函数**：不碰文档树、不碰 DOM，`Render` 那条装饰插件与测试用的是
 * **同一份**判据（`tests/smart-punctuation.test.ts`）。这正是 `find.ts` /
 * `table-width.ts` 那条规矩——"匹配逻辑只有一份"。
 *
 * 返回的顺序是**从前往后、互不重叠**（边扫边跳过已命中的那一段），
 * 所以调用方可以直接拿着偏移去挂装饰。
 */
export function 扫标点(文: string, 设置: 标点设置): 标点命中[] {
  if (设置.模式 === "off") return [];
  const 出: 标点命中[] = [];
  let i = 0;
  while (i < 文.length) {
    const 字 = 文[i]!;
    // ── 破折号：`--` / `---`（**先吃掉整串**，别一次只吃两个）
    if (设置.破折号 && 字 === "-" && 文[i + 1] === "-") {
      let n = 0;
      while (文[i + n] === "-") n++;
      // ⚠️ 四个及以上的连字符**不碰**：那是分割线（`----`）或者用户手打的
      // 一串横线，换成 `——` 会让那一行从"分割线"变成"正文里的一个破折号"。
      if (n <= 3) {
        出.push({ 始: i, 终: i + n, 替: 破折号(设置.风格, n) });
        i += n;
        continue;
      }
      i += n;
      continue;
    }
    // ── 省略号：`...`（**只吃三个**，`....` 里的前三个照换）
    if (设置.破折号 && 设置.省略号 && 字 === "." && 文[i + 1] === "." && 文[i + 2] === ".") {
      出.push({ 始: i, 终: i + 3, 替: "…" });
      i += 3;
      continue;
    }
    // ── 引号：逐颗判断朝哪边
    if (设置.引号 && (字 === '"' || 字 === "'")) {
      const 是双 = 字 === '"';
      const 字形 = 是双 ? 设置.双引号 : 设置.单引号;
      const 前文 = 文.slice(0, i);
      const 替 =
        字形 === "straight"
          ? 字
          : !是双 && 是撒号(前文)
            ? "’"
            : 弯引号(前文.slice(-1), 是双, 字形);
      if (替 !== 字) 出.push({ 始: i, 终: i + 1, 替 });
      i++;
      continue;
    }
    i++;
  }
  return 出;
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
const 规则选项 = { inCodeMark: false } as const;

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
export function 只有横线骨架(前文: string): boolean {
  return /^[\s|:-]*$/.test(前文);
}

/** 上面那条判据的取数：从段落开头到光标。 */
function 是横线骨架行(state: EditorState, 始: number): boolean {
  const $始 = state.doc.resolve(始);
  return 只有横线骨架($始.parent.textBetween(0, $始.parentOffset, "", ""));
}

/** 连字符那一串：**两条规则**（`---` 在前，长的先试）。 */
function 破折号规则(设置: 标点设置) {
  const 一条 = (个数: 2 | 3) =>
    $inputRule(() =>
      new InputRule(
        new RegExp(`-{${个数}}$`),
        // ⚠️ 这里**不再判 `设置.破折号`**：关掉那一格时这一条压根不注册
        // （见 `标点输入`）。判据只留一处，读的人不必两头对。
        (state, _m, 始, 终) =>
          是横线骨架行(state, 始) ? null : 换掉(state, 始, 终, 破折号(设置.风格, 个数)),
        规则选项,
      ),
    );
  return [一条(3), 一条(2)];
}

function 省略号规则() {
  return $inputRule(() =>
    new InputRule(/\.{3}$/, (state, _m, 始, 终) => 换掉(state, 始, 终, "…"), 规则选项),
  );
}

/** 把 `[始, 终)` 换成 `替`。⚠️ 只换文本，不动任何 mark 与节点结构。 */
function 换掉(state: EditorState, 始: number, 终: number, 替: string) {
  return state.tr.insertText(替, 始, 终);
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
export function 标点输入(设置: 标点设置) {
  if (设置.模式 !== "input") return [];
  const 出 = [];
  // ⚠️ 省略号**挂靠在破折号那一格上**（`标点设置.省略号` 那条注释讲了为什么）。
  if (设置.破折号) {
    出.push(...破折号规则(设置));
    if (设置.省略号) 出.push(省略号规则());
  }
  return 出;
}

/* ── 第三½格：引号自动配成对（`Input` 模式）──────────────────────────── */

export const 引号配对键 = new PluginKey("nota-smart-quote-pair");

function 在代码里(state: EditorState, 位置: number): boolean {
  const $位 = state.doc.resolve(位置);
  for (let 层 = $位.depth; 层 > 0; 层 -= 1) {
    if ($位.node(层).type.spec.code) return true;
  }
  return $位.marks().some((标记) => 标记.type.spec.code);
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
export function 引号输入事务(
  state: EditorState,
  从: number,
  到: number,
  字: string,
  设置: 标点设置,
): Transaction | null {
  if (设置.模式 !== "input" || !设置.引号 || (字 !== '"' && 字 !== "'")) return null;
  const 是双 = 字 === '"';
  const 字形 = 是双 ? 设置.双引号 : 设置.单引号;
  const { 开, 闭 } = 取引号配法(是双, 字形);
  const $从 = state.doc.resolve(从);
  if (!$从.parent.inlineContent || 在代码里(state, 从)) return null;

  if (从 !== 到) {
    const $到 = state.doc.resolve(到);
    if (!$从.sameParent($到) || 在代码里(state, 到)) return null;
    const tr = state.tr;
    tr.insertText(闭, 到, 到);
    tr.insertText(开, 从, 从);
    tr.setSelection(TextSelection.create(tr.doc, 从 + 开.length, 到 + 开.length));
    return tr.scrollIntoView();
  }

  const 父 = $从.parent;
  const 偏移 = $从.parentOffset;
  const 前 = 偏移 > 0 ? 父.textBetween(偏移 - 1, 偏移, "") : "";
  const 后 = 偏移 < 父.content.size ? 父.textBetween(偏移, 偏移 + 1, "") : "";
  const 前文 = 父.textBetween(0, 偏移, "");

  // `don't` 里的单引号是撒号，要落成 `’`，但不要再补一对。
  if (!是双 && /[\p{L}\p{N}]$/u.test(前) && !是开引号位置(前)) {
    return state.tr.insertText(闭, 从);
  }
  if (前 === "\\") return null;

  // 先判“越过我们补出来的闭引号”，再判“这里算不算开引号位置”：
  // 光标夹在 `“|”` 中间时，前一颗本身就是开引号，后判会再补一对。
  if (后 === 闭 && 有未闭合引号(前文, 开, 闭)) {
    return state.tr
      .setSelection(TextSelection.create(state.doc, 从 + 1))
      .setMeta("addToHistory", false);
  }

  if (是开引号位置(前)) {
    const tr = state.tr.insertText(开 + 闭, 从);
    tr.setSelection(TextSelection.create(tr.doc, 从 + 开.length));
    return tr;
  }

  return state.tr.insertText(闭, 从);
}

/** 引号配对的 ProseMirror 插件。导出是为了让测试直接驱动 `handleTextInput`。 */
export function 建引号配对插件(设置: 标点设置): Plugin {
  return new Plugin({
    key: 引号配对键,
    props: {
      handleTextInput: (view: EditorView, 从, 到, 文) => {
        if (view.composing || 文.length !== 1) return false;
        const tr = 引号输入事务(view.state, 从, 到, 文, 设置);
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
export function 引号配对(设置: 标点设置) {
  if (设置.模式 !== "input" || !设置.引号) return [];
  return $prose(() => 建引号配对插件(设置));
}

/* ── 第四格：显示装饰（`Render` 模式）──────────────────────────────── */

export const 标点装饰键 = new PluginKey("notaSmartPunct");

/** 一处装饰：文档位置上的 `[从, 到)` 换成 `替`。 */
export interface 装饰项 {
  从: number;
  到: number;
  替: string;
}

/**
 * 一份文档该挂哪些装饰 —— **纯函数，`state` 与 DOM 都不需要**。
 *
 * ⚠️ 抽出来单放的理由是**位置换算最容易错**：`扫标点` 给的偏移是
 * **文本节点内**的，而装饰要的是**文档位置**，中间差着节点自己的起点。
 * 拆成纯函数之后 `tests/smart-punctuation.test.ts` 能直接拿一份手搓文档
 * 把每个 `从`/`到` 逐条钉住（`table-width.ts` 那条"匹配逻辑只有一份、
 * 而且必须能单独测"是同一条规矩）。
 *
 * ⚠️ 只扫文档，**不碰选择**：它与光标在哪无关（这一点和 `instant-render`
 * 正相反——那一条的判据就是光标）。
 */
export function 装饰清单(文档: PMNode, 设置: 标点设置): 装饰项[] {
  const 出: 装饰项[] = [];
  文档.descendants((节点, 位置) => {
    if (!节点.isText || !节点.text) return;
    for (const 命中 of 扫标点(节点.text, 设置)) {
      出.push({ 从: 位置 + 命中.始, 到: 位置 + 命中.终, 替: 命中.替 });
    }
  });
  return 出;
}

/** 把 {@link 装饰清单} 算出来的东西变成 ProseMirror 的装饰集。 */
function 算装饰(state: EditorState, 设置: 标点设置): DecorationSet {
  const 装: Decoration[] = [];
  for (const 项 of 装饰清单(state.doc, 设置)) {
    // 原文压成 0 宽（CSS 在 `editor.css` 的 `.nota-smart-hide`）；
    // 转换后的字符交给紧挨着的 widget 画。
    装.push(Decoration.inline(项.从, 项.到, { class: "nota-smart-hide" }));
    装.push(
      Decoration.widget(
        项.从,
        () => {
          const 盒 = document.createElement("span");
          盒.className = "nota-smart-show";
          盒.textContent = 项.替;
          // ⚠️ 这一颗**不是可编辑内容**：不让 PM 把光标停进去，
          // 也不参与选中（选中的仍然是文档里那两个字符）。
          盒.setAttribute("aria-hidden", "true");
          return 盒;
        },
        { side: -1 },
      ),
    );
  }
  return DecorationSet.create(state.doc, 装);
}

/**
 * `Render` 模式那条插件。**模式不是 `render` 时返回空数组。**
 *
 * ⚠️ 装饰**不进文档、不进撤销栈**（和查找高亮、块标记淡化同一条口径）：
 * 拖一下窗口、敲一个字，它重算一遍，但 `getMarkdown()` 出来的仍是用户写的
 * 那两个减号。
 */
export function 标点装饰(设置: 标点设置) {
  if (设置.模式 !== "render") return [];
  return [
    $prose(
      () =>
        new Plugin({
          key: 标点装饰键,
          state: {
            init: (_c, state) => 算装饰(state, 设置),
            apply: (tr, _旧, _老, 新) => (tr.docChanged ? 算装饰(新, 设置) : _旧),
          },
          props: { decorations: (state) => 标点装饰键.getState(state) },
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
