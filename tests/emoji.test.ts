/**
 * `src/editor/emoji.ts`（Emoji 短代码 ＋ 补全面板）的**可运行**测试集。
 * 2026-09-27 写，与那个文件同批落地。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/emoji.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/emoji.mjs
 * node /tmp/nota-测试/emoji.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试盯的是什么
 *
 * 这一格的风险与"自动更正"那边**形状不同**：那边是一张小表、对错由表决定；
 * 这边是**一张三百多行的大表 ＋ 两条"认前缀"的路径**，而它的坏法有好几种
 * 都不报错、只在用户手上才看得见：
 *
 * - 一、**表本身的账**：短代码重名（重名时后一条永远查不到 = 死行）、
 *   带大写的短代码（永远查不到）、**只有一两个字符的短代码**（输入规则的
 *   正则要 `{2,}`，短的永远打不出来）、分类名拼歪（那一格在对话框里是空的）；
 * - 二、`查短代码` 的大小写与空值；
 * - 三、`找Emoji`：**只做前缀匹配**、上限、大小写；
 * - 四、`认前缀`：五条边界（非空选区 / 非文本块 / 没冒号 / 空格断开 / 查不到）；
 * - 五、`采用候选`：**换了哪些字符**、越界给 `null`；
 * - 六、装配条数（开＝1 条输入规则 ＋ 1 条插件，关＝0）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️⚠️ **两条主路径一次窗都没开过**：①「敲 `:smile: ` 再敲空格，屏幕上当场
 *   变成 😄」；②「打 `:smi` 弹出面板、按 ↓ 换一条、按回车插进去」。真跑要
 *   `Editor.make()` ＋ 真 DOM ＋ 真事件（本仓没有 jsdom，也不许为这件事装包）。
 * - ⚠️ **面板画出来的样子没验**（`.nota-emoji-pop` 那一族 CSS 在 `app.css` 与
 *   `editor.css` 里）：位置、越界翻转、`is-on` 的高亮，全是 DOM 与坐标的事。
 * - ⚠️ **输入法组合期间不接管键盘**（`event.isComposing` 那条早退）没验：
 *   它守的是真 `KeyboardEvent` 的分支。
 * - ⚠️ **行内代码里不该触发**没验（`inCodeMark: false` 走真 view 的分支）。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import {
  emojiTable,
  emojiCategory,
  checkShortcode,
  findEmoji,
  withEmergeNumber,
  recognizePrefix,
  adoptUseCandidate,
  inputRuleRuleCorrectRule,
  emojiInputRuleRule,
  emojiFillAll,
  type EmojiItem,
} from "../src/editor/emoji";

/* ── 一支极小的测试工装（与 `smart-punctuation.test.ts` 同一套长相）── */

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

/** 一份手搓的最小文档（只有 `doc`/`paragraph`/`text`），够 `认前缀` 用了。 */
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    text: { group: "inline" },
  },
});

/** 一段文本，光标停在**末尾**。 */
function paragraphState(text2: string): EditorState {
  const paragraph2 = schema.node("paragraph", null, text2 ? [schema.text(text2)] : []);
  const doc = schema.node("doc", null, [paragraph2]);
  const end = doc.content.size - 1;
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, end),
  });
}

/* ── 一、表的账 ─────────────────────────────────────────────────────── */

group("一、表的账（防死行）");

testCase("没有重名的短代码", () => {
  // ⚠️ 重名不报错：`按短代码` 那个 Map 只留第一条，后一条**永远查不到**，
  // 而它在对话框里照样列着、点得出字符——只有"敲短代码替换"那条路会静默失效。
  const seePass = new Set<string>();
  const heavyOf: string[] = [];
  for (const item5 of emojiTable) {
    if (seePass.has(item5.shortcode)) heavyOf.push(item5.shortcode);
    seePass.add(item5.shortcode);
  }
  if (heavyOf.length) throw new Error(`重名 ${heavyOf.length} 条：${heavyOf.join("、")}`);
});

testCase("短代码一律小写，且只由 [a-z0-9_+-] 组成", () => {
  // 含大写 = 永远查不到（查表走 `toLowerCase()`，而表里的键是原样的）；
  // 含别的符号 = 输入规则的正则 `[a-zA-Z0-9_+-]` 认不出来。
  const bad = emojiTable.filter((item5) => !/^[a-z0-9_+-]+$/.test(item5.shortcode));
  if (bad.length) {
    throw new Error(`有 ${bad.length} 条不合规：${bad.map((item5) => item5.shortcode).join("、")}`);
  }
});

testCase("每一条短代码都打得出来（拿输入规则那条正则核）", () => {
  // ⚠️ 这一条盯的是**输入规则的正则形状**：表里有 `:x:` / `:v:` 这种单字符
  // 短代码，正则一旦写成 `{2,}`，它们就在面板里选得到、**却永远敲不出来**
  // ——一种不报错的死行。所以这里**不另写一条正则**，直接用导出那条
  // （`输入规则正则`）核表里的每一条。
  const hitNotOutput = emojiTable.filter((item5) => !inputRuleRuleCorrectRule.test(`${withEmergeNumber(item5.shortcode)} `));
  if (hitNotOutput.length) {
    throw new Error(`有 ${hitNotOutput.length} 条敲不出来：${hitNotOutput.map((item5) => item5.shortcode).join("、")}`);
  }
});

testCase("输入规则的正则不吃半截短代码", () => {
  // ⚠️ 两头都要有冒号：`见 :smile 处`（少一个冒号）不该被换成 😄。
  equal(inputRuleRuleCorrectRule.test(":smile "), false, "缺结尾冒号");
  equal(inputRuleRuleCorrectRule.test("smile: "), false, "缺开头冒号");
  equal(inputRuleRuleCorrectRule.test(":smile:"), false, "后面没有空白（规则要一个触发字符）");
  // ⚠️ 时间写法在**形状上就不中**（只有一个冒号）。
  equal(inputRuleRuleCorrectRule.test("10:30 "), false, "时间写法");
  // ⚠️ 但 `:30:` 这种形状**是中的**——拦不拦得住全靠查表那一步。两处分工
  // 写在这里，免得将来有人把查表那一步"优化"掉。
  equal(inputRuleRuleCorrectRule.test(":30: "), true, "`:30:` 形状合法");
  equal(checkShortcode("30"), null, "查表挡得住");
});

testCase("每一条的字符与分类都非空", () => {
  const bad = emojiTable.filter((item5) => item5.character === "" || item5.category === "");
  if (bad.length) throw new Error(`${bad.length} 条空字段：${JSON.stringify(bad.slice(0, 5))}`);
});

testCase("每一条都查得到，而且查回来的就是它自己", () => {
  // ⚠️ 遍历整张表——重名、写歪、值写反，都在这里现形。
  const bad: string[] = [];
  for (const item5 of emojiTable) {
    const returnValue = checkShortcode(item5.shortcode);
    if (!returnValue || returnValue.character !== item5.character) bad.push(`${item5.shortcode}（查到 ${returnValue ? returnValue.character : "空"}）`);
  }
  if (bad.length) throw new Error(`有 ${bad.length} 条查不回自己：${bad.slice(0, 10).join("、")}`);
});

testCase("分类是那十一类，且每一类都有人", () => {
  // ⚠️ 分类名拼歪（比如写了「动物类」）不会报错：对话框里会多出一个空页签，
  // 或者那一类的条目被算进"别的"分类里，看着只是"少了几条"。
  equal(emojiCategory.length, 11, "分类数");
  const empty = emojiCategory.filter((oneKind) => !emojiTable.some((item5) => item5.category === oneKind));
  if (empty.length) throw new Error(`有分类是空的：${empty.join("、")}`);
});

testCase("表不是空的，规模在「几百条」这个量级", () => {
  // ⚠️ 上界是**防手滑**：这张表是手写的固定表，不是"把全世界的 emoji 搬进来"。
  if (emojiTable.length < 200) throw new Error(`只有 ${emojiTable.length} 条，是不是被误删了？`);
  if (emojiTable.length > 800) throw new Error(`有 ${emojiTable.length} 条，这张表该是"手写的一小张"`);
});

testCase("同一个字符可以有多条短代码（别名），但别名也要能查到", () => {
  // `+1` 与 `thumbsup` 指向同一个 👍——这是**故意**的（GitHub 也这么做），
  // 所以「重名」那条判的是短代码，不是字符。
  const distinguishName = new Map<string, EmojiItem[]>();
  for (const item5 of emojiTable) {
    const already = distinguishName.get(item5.character) ?? [];
    already.push(item5);
    distinguishName.set(item5.character, already);
  }
  const hasDistinguishName = [...distinguishName.values()].filter((group) => group.length > 1);
  if (hasDistinguishName.length === 0) throw new Error("一条别名都没有？表里本该有 `+1`/`thumbsup` 这种");
  for (const group of hasDistinguishName) {
    // 两条别名的**分类**必须一致：不一致的话，同一个字符在对话框里会
    // 同时出现在两个分类下，用户以为表坏了。
    const categories = new Set(group.map((item5) => item5.category));
    if (categories.size !== 1) {
      throw new Error(`${group[0]!.character} 的别名跨了分类：${[...categories].join("、")}`);
    }
  }
});

/* ── 二、查短代码 ───────────────────────────────────────────────────── */

group("二、查短代码");

testCase("大小写不敏感", () => {
  equal(checkShortcode("smile")?.character, "😄", "小写");
  equal(checkShortcode("Smile")?.character, "😄", "首字母大写");
  equal(checkShortcode("SMILE")?.character, "😄", "全大写");
});

testCase("查不到给 null（不是空对象）", () => {
  equal(checkShortcode("zzzz"), null, "不存在的");
  equal(checkShortcode(""), null, "空串");
});

testCase("别名两条都查得到，且指向同一个字符", () => {
  equal(checkShortcode("+1")?.character, checkShortcode("thumbsup")?.character, "+1 与 thumbsup");
});

/* ── 三、找Emoji ────────────────────────────────────────────────────── */

group("三、找Emoji（只做前缀匹配）");

testCase("命中的每一条都以那个前缀开头", () => {
  const output2 = findEmoji("sm");
  if (output2.length === 0) throw new Error("`sm` 一条都没有？表里该有 smile / smiley 这一族");
  const bad = output2.filter((item5) => !item5.shortcode.startsWith("sm"));
  if (bad.length) throw new Error(`不是前缀匹配：${bad.map((item5) => item5.shortcode).join("、")}`);
});

testCase("默认上限 8 条", () => {
  equal(findEmoji("a").length, 8, "`a` 是个很宽的前缀");
  equal(findEmoji("").length, 8, "空前缀");
});

testCase("上限可以调小", () => {
  equal(findEmoji("a", 3).length, 3, "3 条");
  equal(findEmoji("a", 1).length, 1, "1 条");
});

testCase("前缀大小写不敏感", () => {
  equal(findEmoji("SM").length, findEmoji("sm").length, "SM 与 sm");
});

testCase("查不到给空数组（不是 null）", () => {
  equal(findEmoji("zzzz").length, 0, "不存在的");
});

testCase("带冒号的前缀查不到（冒号不是短代码的一部分）", () => {
  // ⚠️ `认前缀` 里正则已经把 `:` 剥掉了，所以这里不必处理冒号。
  // 万一哪天有人直接把它接到别处（比如搜索框），这条会提醒他先剥冒号。
  equal(findEmoji(":sm").length, 0, ":sm");
});

testCase("子串匹配**故意不做**：`eyes` 找不到 `heart_eyes`", () => {
  // ⚠️ 这条是**把口径钉住**：子串匹配会让 `:a` 命中几百条，面板第一个候选
  // 变成"表里的顺序"说了算的随机结果。代价如实记：`heart_eyes` 只能从头打。
  const output2 = findEmoji("eyes");
  equal(output2.some((item5) => item5.shortcode === "heart_eyes"), false, "heart_eyes 不该出现");
});

/* ── 四、带冒号 ─────────────────────────────────────────────────────── */

group("四、带冒号");

testCase("两头各一个冒号", () => {
  equal(withEmergeNumber("smile"), ":smile:", "smile");
  equal(withEmergeNumber("+1"), ":+1:", "带加号的别名");
});

/* ── 五、认前缀 ─────────────────────────────────────────────────────── */

group("五、认前缀");

testCase("光标前是 `:sm` → 认出前缀与起点", () => {
  const state = paragraphState("hi :sm");
  const state3 = recognizePrefix(state);
  if (!state3) throw new Error("该认出来");
  equal(state3.prefix, "sm", "前缀");
  // 文档位置 1='h' 2='i' 3=' ' 4=':' 5='s' 6='m'，所以 `:` 在 4。
  equal(state3.start5, 4, "`:` 的文档坐标");
  if (state3.candidate.length === 0) throw new Error("候选不该是空的");
  equal(state3.selected, 0, "初始高亮第一条");
});

testCase("刚打出 `:` 就给候选（前缀为空也算一次认前缀？不——见下条）", () => {
  // ⚠️ 这里钉的是**现状**：正则要 `{1,}`，所以 `:` 后面一个字都没有时
  // **认不出**（用户刚敲下冒号那一刻面板不弹）。这是有意的保守：弹一个
  // "三百条全在"的列表比不弹更烦，用户再打一个字母就出来了。
  equal(recognizePrefix(paragraphState("hi :")), null, "只有冒号");
});

testCase("`:` 后面是空白 → 断开", () => {
  equal(recognizePrefix(paragraphState("hi :sm ile")), null, "空格之后");
});

testCase("没有冒号 → null", () => {
  equal(recognizePrefix(paragraphState("hello")), null, "普通文本");
});

testCase("短代码查不到 → null", () => {
  equal(recognizePrefix(paragraphState("hi :zzzz")), null, "zzzz 不在表里");
});

testCase("选区非空 → null（用户在选择，不是在打字）", () => {
  const paragraph2 = schema.node("paragraph", null, [schema.text("hi :sm")]);
  const doc = schema.node("doc", null, [paragraph2]);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1, 7),
  });
  equal(recognizePrefix(state), null, "有选区");
});

testCase("前缀大小写不敏感（`:SM` 也能认）", () => {
  const state3 = recognizePrefix(paragraphState("hi :SM"));
  if (!state3) throw new Error("该认出来");
  equal(state3.prefix, "SM", "前缀原样");
  if (state3.candidate.length === 0) throw new Error("候选该按小写去匹配");
});

testCase("只看当前文本块：上一段里的 `:sm` 不算", () => {
  const above = schema.node("paragraph", null, [schema.text(":sm")]);
  const below = schema.node("paragraph", null, [schema.text("正文")]);
  const doc = schema.node("doc", null, [above, below]);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, doc.content.size - 1),
  });
  equal(recognizePrefix(state), null, "跨块不算");
});

/* ── 六、采用候选 ───────────────────────────────────────────────────── */

group("六、采用候选");

testCase("只换掉从 `:` 到光标那一段，前面的字不动", () => {
  const state = paragraphState("hi :sm");
  const state3 = recognizePrefix(state);
  if (!state3) throw new Error("该认出来");
  // 候选第一条按表里的顺序，`sm` 那一族的第一条就是 `smile`。
  const tr = adoptUseCandidate(state, state3, 0);
  if (!tr) throw new Error("该给出一笔事务");
  const after = state.apply(tr);
  equal(after.doc.textContent, "hi 😄", "结果文本");
});

testCase("第几条越界 → null（不抛）", () => {
  const state = paragraphState("hi :sm");
  const state3 = recognizePrefix(state);
  if (!state3) throw new Error("该认出来");
  equal(adoptUseCandidate(state, state3, 99), null, "越界");
  equal(adoptUseCandidate(state, state3, -1), null, "负数");
});

/* ── 七、装配 ───────────────────────────────────────────────────────── */

group("七、装配");

testCase("关着的时候一条规则、一条插件都不挂", () => {
  equal(emojiInputRuleRule(false).length, 0, "输入规则");
  equal(emojiFillAll(false).length, 0, "补全插件");
});

testCase("开着的时候各挂 1 条", () => {
  equal(emojiInputRuleRule(true).length, 1, "输入规则");
  equal(emojiFillAll(true).length, 1, "补全插件");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
