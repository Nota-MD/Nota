/**
 * `src/editor/smart-punctuation.ts`（智能标点）的**可运行**测试集。
 * 2026-09-27 写，与那个文件同批落地。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/smart-punctuation.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/smart-punctuation.mjs
 * node /tmp/nota-测试/smart-punctuation.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试盯的是什么
 *
 * 智能标点这一格**坏起来是静默的**：一个字符不变、或者变错了，屏幕上都不报错。
 * 所以要钉的不是"看起来对不对"，而是四组**能单测的判据**：
 *
 * - 一、三个纯函数（`弯引号` / `破折号` / 默认值）。⚠️ 默认值那一组是**对账**：
 *   它必须与 `src-tauri/src/settings/markdown.rs` 的 `Default` 逐条一致，
 *   两边任何一边改了另一边不改，症状是"设置页上写着一个样、实际另一个样"。
 * - 二、`扫标点`——**扫描逻辑只有一份**（`Render` 那条装饰与测试用的是同一个
 *   函数），边界（`----` 不碰、`....` 只吃三个）、成对引号、撒号、
 *   以及**两个开关关掉之后一个字符都不碰**。
 * - 三、`装饰清单`——**位置换算**：`扫标点` 给的是**文本节点内**的偏移，
 *   装饰要的是**文档位置**，中间差着节点自己的起点。这一处最容易错，
 *   所以拿一份手搓的真文档逐条钉。
 * - 四、装配——`标点输入` / `标点装饰` 在**不该挂的模式下必须返回空数组**
 *   （不是"挂上去再返回 null"）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️⚠️ **「敲 `--` 当场变成 `–`」这条主路径没验**，只能验到
 *   「`标点输入()` 确实挂了 5 条规则」。真跑一次要 `Editor.make()` ＋ 真
 *   DOM（本仓没有 jsdom，也不许为这件事装包）。**这是这份文件最大的空白。**
 * - ⚠️ **「敲 `---` 出不来分割线」那道守卫只验了一半**（`只有横线骨架`）：
 *   **字符串那一半**在第五组里钉死了（含 BUG-51 那条"敲分隔行的每个瞬间都
 *   豁免得住"），**取数那一半**（`是横线骨架行` 从真 `EditorState` 里取
 *   "段落开头到光标"）还要真输入规则 ＋ 真事务，同上。它仍是本文件里
 *   **唯一一处会弄坏别的功能**的地方——`docs/07` 那一项里它列在**开窗目检的
 *   第一件事**（敲一次 `---`，再敲一次 `a--b`，还要敲一次 `| --- | --- |`
 *   看表格出不出来）。
 * - **`Render` 那条装饰的真长相没验**：`.nota-smart-hide` 压成 0 宽、
 *   widget 顶上去，是 CSS ＋ DOM 的事（`src/styles/editor.css`）。
 *   这里只验到"该挂哪儿"，验不到"看着对不对"。
 * - **行内代码里的行为没验**：`inCodeMark: false` 那一句守的是
 *   `run()` 里的分支，要真 view 才走得到（见那个常量上的长注释）。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import {
  curveReferenceNumber,
  dash,
  getReferenceNumberConfigureMethod,
  isOpenReferenceNumberPosition,
  hasNotCloseCombineReferenceNumber,
  referenceNumberInputTransaction,
  referenceNumberConfigureCorrect,
  scanPunctuation,
  decorationClearSingle,
  punctuationInput,
  punctuationDecoration,
  onlyHasHorizontalLineBoneFrame,
  DefaultPunctuationSettings,
  type punctuationSettings,
} from "../src/editor/smart-punctuation";

/* ── 一支极小的测试工装（与 `inline-marks.test.ts` 同一套长相）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function group(name3: string): void {
  console.log(`\n【${name3}】`);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function same(actual: unknown, expected: unknown, description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}：\n      期望 ${b}\n      实际 ${a}`);
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

/** 在默认设置上改几格。 */
function set(change2: Partial<punctuationSettings>): punctuationSettings {
  return { ...DefaultPunctuationSettings, ...change2 };
}

/** 只取命中的替身字符，省得每条都写一长串对象。 */
function replacePlural(text4: string, settings: punctuationSettings = DefaultPunctuationSettings): string[] {
  return scanPunctuation(text4, settings).map((h) => h.replace);
}

/** 一份手搓的最小文档（只有 `doc`/`paragraph`/`text`），用来钉位置换算。 */
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    text: { group: "inline" },
  },
});

function document(...paragraph: string[]): PMNode {
  return schema.node(
    "doc",
    null,
    paragraph.map((t) => schema.node("paragraph", null, t ? [schema.text(t)] : [])),
  );
}

function referenceNumberState(text4: string, from = text4.length, to2 = from): EditorState {
  const doc = document(text4);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1 + from, 1 + to2),
  });
}

/* ── 一、三个纯函数 ──────────────────────────────────────────────────── */

group("一、纯函数");

testCase("弯引号：行首当开引号", () => {
  equal(curveReferenceNumber("", true, "curly"), "“", "行首");
});

testCase("弯引号：空白之后当开引号", () => {
  equal(curveReferenceNumber(" ", true, "curly"), "“", "空格后");
});

testCase("弯引号：左括号之后当开引号（含全角）", () => {
  equal(curveReferenceNumber("(", true, "curly"), "“", "半角括弧");
  equal(curveReferenceNumber("（", true, "curly"), "“", "全角括弧");
  equal(curveReferenceNumber("「", false, "curly"), "‘", "全角引号后");
});

testCase("弯引号：字母之后当闭引号", () => {
  equal(curveReferenceNumber("a", true, "curly"), "”", "字母后");
  equal(curveReferenceNumber("好", false, "curly"), "’", "汉字后");
});

testCase("弯引号：straight 字形原样还回去", () => {
  equal(curveReferenceNumber("", true, "straight"), '"', "双引号");
  equal(curveReferenceNumber("a", false, "straight"), "'", "单引号");
});

testCase("破折号：en-em 风格下两个是短横、三个是长横", () => {
  equal(dash("en-em", 2), "–", "两个");
  equal(dash("en-em", 3), "—", "三个");
});

testCase("破折号：em 风格下两个也是长横", () => {
  equal(dash("em", 2), "—", "两个");
  equal(dash("em", 3), "—", "三个");
});

testCase("引号对与开引号位置共用智能标点的方向判据", () => {
  same(getReferenceNumberConfigureMethod(true, "curly"), { open2: "“", close3: "”" }, "弯双引号");
  same(getReferenceNumberConfigureMethod(false, "curly"), { open2: "‘", close3: "’" }, "弯单引号");
  same(getReferenceNumberConfigureMethod(true, "straight"), { open2: '"', close3: '"' }, "直双引号");
  equal(isOpenReferenceNumberPosition(""), true, "行首");
  equal(isOpenReferenceNumberPosition("甲"), false, "文字后");
  equal(hasNotCloseCombineReferenceNumber("“甲", "“", "”"), true, "弯引号未闭");
  equal(hasNotCloseCombineReferenceNumber('"甲"', '"', '"'), false, "直引号已配平");
});

testCase("默认设置与 Rust 那边的 Default 逐条一致", () => {
  // ⚠️ 对账用的。左边是 `markdown.rs` 的 `Default for Markdown`（冒号后那一段），
  // 右边是本文件的 `默认标点设置`。**任何一边改了另一边不改就是 bug**，
  // 症状是"设置页上写着一个样、实际另一个样"。
  equal(DefaultPunctuationSettings.mode2, "input", "SmartPunctuation::Input"); // :440 断言钉着
  equal(DefaultPunctuationSettings.referenceNumber, true, "smart_quotes: true"); // :375
  equal(DefaultPunctuationSettings.doubleReferenceNumber, "curly", "QuoteStyle::Curly"); // :152
  equal(DefaultPunctuationSettings.singleReferenceNumber, "curly", "QuoteStyle::Curly");
  equal(DefaultPunctuationSettings.dash, true, "smart_dashes: true"); // :378
  equal(DefaultPunctuationSettings.windCell, "en-em", "DashStyle::EnEm"); // :168
});

/* ── 二、扫标点 ──────────────────────────────────────────────────────── */

group("二、扫标点（`Render` 与测试共用的那一份判据）");

testCase("模式是 off 时什么都不扫", () => {
  same(scanPunctuation('a--b "x" ...', set({ mode2: "off" })), [], "off");
});

testCase("两个连字符变成短横", () => {
  same(replacePlural("a--b"), ["–"], "en-em");
});

testCase("三个连字符变成长横", () => {
  same(replacePlural("a---b"), ["—"], "en-em");
});

testCase("四个连字符一根都不动（分割线那一类）", () => {
  same(replacePlural("-----"), [], "五个");
  same(replacePlural("----"), [], "四个");
});

testCase("三个点变成省略号", () => {
  same(replacePlural("等等..."), ["…"], "省略号");
});

testCase("四个点只吃前三个", () => {
  const output2 = scanPunctuation("....", DefaultPunctuationSettings);
  same(output2, [{ start6: 0, end3: 3, replace: "…" }], "只一条、只吃三个");
});

testCase("双引号成对：前一个是空白就当开引号", () => {
  same(replacePlural('他说 "你好"。'), ["“", "”"], "成对");
});

testCase("单引号成对", () => {
  same(replacePlural("'x'"), ["‘", "’"], "成对");
});

testCase("字母后面的单引号是撒号", () => {
  same(replacePlural("don't"), ["’"], "撒号");
  same(replacePlural("it's a--b"), ["’", "–"], "撒号与破折号各归各");
});

testCase("引号字形是 straight 时引号不动、破折号照动", () => {
  const s = set({ doubleReferenceNumber: "straight" });
  same(replacePlural('"a" -- b', s), ["–"], "只有破折号");
});

testCase("关掉引号那一格：引号一个都不碰", () => {
  same(replacePlural('"a" -- b', set({ referenceNumber: false })), ["–"], "只剩破折号");
});

testCase("关掉破折号那一格：短横与省略号都不碰", () => {
  // ⚠️ 省略号**挂靠在破折号那一格上**（`标点设置.省略号` 那条注释讲了为什么），
  // 所以关掉破折号会让它一起停——这一条就是钉这个挂靠关系的。
  same(replacePlural("a--b ...", set({ dash: false })), [], "两样都不动");
});

testCase("单独关掉省略号：短横照动、省略号不动", () => {
  same(replacePlural("a--b ...", set({ saveOmitNumber: false })), ["–"], "只有短横");
});

testCase("命中的偏移是文本内的，且互不重叠", () => {
  const output2 = scanPunctuation("--x---y", DefaultPunctuationSettings);
  same(
    output2,
    [
      { start6: 0, end3: 2, replace: "–" },
      { start6: 3, end3: 6, replace: "—" },
    ],
    "两处、从前往后",
  );
});

testCase("替身与原文一样时不产生命中", () => {
  // straight 之下 `'` 还是 `'`——**不产生一条"换成自己"的空命中**，
  // 否则装饰那一侧会给每个撇号都挂一对没用的装饰。
  same(scanPunctuation("a'b", set({ singleReferenceNumber: "straight" })), [], "无命中");
});

/* ── 三½、引号配对事务 ─────────────────────────────────────────────── */

group("三½、引号配对事务");

testCase("行首开双引号：一次放进一对，光标在中间", () => {
  const state = referenceNumberState("");
  const tr = referenceNumberInputTransaction(state, 1, 1, '"', DefaultPunctuationSettings);
  assertValue(tr, "应当接管开引号");
  const after = state.apply(tr);
  equal(after.doc.textContent, "“”", "成对");
  equal(after.selection.from, 2, "光标在中间");
  const againPress = referenceNumberInputTransaction(after, after.selection.from, after.selection.from, '"', DefaultPunctuationSettings);
  assertValue(againPress, "闭引号应当被接住");
  const againPressAfter = after.apply(againPress);
  equal(againPressAfter.doc.textContent, "“”", "连按两次也不叠成两组");
  equal(againPressAfter.selection.from, 3, "跨到闭引号之后");
});

testCase("自动补出的闭引号前再敲引号：只跨过去", () => {
  const state = referenceNumberState("“甲”", 2);
  const tr = referenceNumberInputTransaction(state, 3, 3, '"', DefaultPunctuationSettings);
  assertValue(tr, "闭引号应当被接住");
  const after = state.apply(tr);
  equal(after.doc.textContent, "“甲”", "不改字");
  equal(after.selection.from, 4, "跨过闭引号");
});

testCase("选中文字再敲引号：包住并保留选区", () => {
  const state = referenceNumberState("甲乙", 0, 2);
  const tr = referenceNumberInputTransaction(state, 1, 3, '"', DefaultPunctuationSettings);
  assertValue(tr, "应当包住选区");
  const after = state.apply(tr);
  equal(after.doc.textContent, "“甲乙”", "两侧各一颗");
  equal(after.selection.from, 2, "选区起点仍在原文");
  equal(after.selection.to, 4, "选区终点仍在原文");
});

testCase("字母后的单引号是撒号，不补另一边", () => {
  const state = referenceNumberState("don");
  const tr = referenceNumberInputTransaction(state, 4, 4, "'", DefaultPunctuationSettings);
  assertValue(tr, "应当落撒号");
  const after = state.apply(tr);
  equal(after.doc.textContent, "don’", "弯撒号");
});

testCase("直引号字形也遵守同一套配对与跳过", () => {
  const settings = set({ doubleReferenceNumber: "straight" });
  const state = referenceNumberState("");
  const opened = state.apply(referenceNumberInputTransaction(state, 1, 1, '"', settings)!);
  equal(opened.doc.textContent, '""', "直引号成对");
  const closed = referenceNumberInputTransaction(opened, 2, 2, '"', settings);
  assertValue(closed, "直闭引号应被接住");
  equal(opened.apply(closed).doc.textContent, '""', "不再多插一颗");
});

/* ── 三、装饰清单：位置换算 ─────────────────────────────────────────── */

group("三、装饰清单（文本内偏移 → 文档位置）");

testCase("一段里的一处命中，位置要加上段落的起点", () => {
  // doc > paragraph(0) > text(1)。`a--b` 里的 `--` 是文本内 1..3 ⇒ 文档 2..4。
  same(decorationClearSingle(document("a--b"), DefaultPunctuationSettings), [{ from: 2, to2: 4, replace: "–" }], "换算");
});

testCase("第二段的偏移要算上第一段的长度", () => {
  // 第一段 `ab`：doc 里占 1(段首) + 2(文字) + 1(段尾) = 4 个位置，
  // 第二段的文字从 5 开始。`a--b` 的 `--` ⇒ 5+1=6 到 8。
  same(decorationClearSingle(document("ab", "a--b"), DefaultPunctuationSettings), [{ from: 6, to2: 8, replace: "–" }], "第二段");
});

testCase("同一段里的多处命中，从前往后", () => {
  // `"a" -- b` 这 8 个字符在文本内的偏移：`"`0 `a`1 `"`2 ` `3 `-`4 `-`5 ` `6 `b`7。
  // 段落文字从文档位置 1 起，所以三处分别是 1..2 / 3..4 / 5..7。
  same(
    decorationClearSingle(document('"a" -- b'), DefaultPunctuationSettings),
    [
      { from: 1, to2: 2, replace: "“" },
      { from: 3, to2: 4, replace: "”" },
      { from: 5, to2: 7, replace: "–" },
    ],
    "三处",
  );
});

testCase("没有命中时是空数组（空段落也一样）", () => {
  same(decorationClearSingle(document("", "甲"), DefaultPunctuationSettings), [], "空");
  same(decorationClearSingle(document("a--b"), set({ mode2: "off" })), [], "off 模式");
});

/* ── 四、装配：不该挂的模式必须返回空数组 ───────────────────────────── */

group("四、装配");

testCase("off / render 模式一条输入规则都不挂", () => {
  equal(punctuationInput(set({ mode2: "off" })).length, 0, "off");
  equal(punctuationInput(set({ mode2: "render" })).length, 0, "render");
});

testCase("input 模式的输入规则只负责横线与省略号", () => {
  // 2（`---` / `--`）＋ 1（`...`）；引号由 `引号配对` 接管。
  equal(punctuationInput(set({ mode2: "input" })).length, 3, "条数");
  equal(punctuationInput(set({ mode2: "input", saveOmitNumber: false })).length, 2, "关省略号：少一条");
});

testCase("off / input 模式不挂装饰插件", () => {
  equal(punctuationDecoration(set({ mode2: "off" })).length, 0, "off");
  equal(punctuationDecoration(set({ mode2: "input" })).length, 0, "input");
});

testCase("render 模式挂 1 条装饰插件", () => {
  equal(punctuationDecoration(set({ mode2: "render" })).length, 1, "条数");
});

testCase("模式变了之后挂的规则条数跟着变", () => {
  // ⚠️ 这一条钉的是"**六项任一变化都要重建编辑器**"这条口径的**后果**：
  // 挂在 `.use()` 链上的东西随模式而变，所以 `EditorPane` 必须把六个字段
  // 全放进那个 `useMemo` 的依赖里（只放"模式"那三项的话，改了字形——
  // 它也是被闭包捕获的——活着的实例里还是旧的，屏幕上什么都不变）。
  equal(punctuationInput(set({ mode2: "input", referenceNumber: false })).length, 3, "关引号：输入规则条数不变");
  equal(punctuationInput(set({ mode2: "input", dash: false })).length, 0, "关破折号：横线规则全部不挂");
  equal(punctuationInput(set({ mode2: "input", referenceNumber: false, dash: false })).length, 0, "两项都关：0");
});

testCase("引号配对只在 Input 且引号开启时安装", () => {
  equal((referenceNumberConfigureCorrect(set({ mode2: "off" })) as unknown[]).length, 0, "off");
  equal((referenceNumberConfigureCorrect(set({ mode2: "render" })) as unknown[]).length, 0, "render");
  equal((referenceNumberConfigureCorrect(set({ referenceNumber: false })) as unknown[]).length, 0, "关闭引号");
  equal(Array.isArray(referenceNumberConfigureCorrect(DefaultPunctuationSettings)), false, "input 开引号时是插件");
});

/* ── 五、横线骨架那道守卫（BUG-51）────────────────────────────────────── */

group("五、横线骨架那道守卫（`只有横线骨架`）");

testCase("整行只有骨架字符时不转换：分割线那一类", () => {
  for (const text4 of ["", "  ", "---", "----", "  --  "]) {
    equal(onlyHasHorizontalLineBoneFrame(text4), true, `「${text4}」该被豁免`);
  }
});

testCase("表格行也豁免：竖线与对齐冒号都算骨架", () => {
  for (const text4 of ["|", "| --", "| ---", "| --- | ---", "| :--- | ---:", "-- | --", " : --"]) {
    equal(onlyHasHorizontalLineBoneFrame(text4), true, `「${text4}」该被豁免`);
  }
});

testCase("行里已经有字就照转（数据格里的 `--` 本来就该变 `–`）", () => {
  for (const text4 of ["a--b", "他说 --", "| a | --", "- a --", "| a | b | --"]) {
    equal(onlyHasHorizontalLineBoneFrame(text4), false, `「${text4}」不该被豁免`);
  }
});

testCase("⚠️ 敲分隔行的**每一个瞬间**都豁免得住（BUG-51 的正身）", () => {
  // 这一条是这份测试里唯一直接盯 BUG-51 的：破折号规则在**第二颗减号**那一下
  // 就会命中（`-{2}$`），所以"每个以 `--` / `---` 收尾的前缀"都必须是骨架——
  // 漏一个，那一行就会变成 `| –- |`，表格再也建不出来（盘上真写出过
  // `\| –- | –- |`）。⚠️ 两个变体都在：普通分隔行、带对齐冒号的。
  for (const line3 of ["| --- | --- |", "| :--- | ---:", "-- | ---"]) {
    for (let i = 1; i <= line3.length; i++) {
      const prefixText = line3.slice(0, i);
      if (!/-{2,3}$/.test(prefixText)) continue; // 只有"规则会命中的那几刀"才算
      equal(onlyHasHorizontalLineBoneFrame(prefixText), true, `敲到「${prefixText}」时被豁免`);
    }
  }
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
