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
  Emoji表,
  Emoji分类,
  查短代码,
  找Emoji,
  带冒号,
  认前缀,
  采用候选,
  输入规则正则,
  emoji输入规则,
  emoji补全,
  type Emoji项,
} from "../src/editor/emoji";

/* ── 一支极小的测试工装（与 `smart-punctuation.test.ts` 同一套长相）── */

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    败的.push(名称);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 组(名: string): void {
  console.log(`\n【${名}】`);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
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
function 段落状态(文本: string): EditorState {
  const 段 = schema.node("paragraph", null, 文本 ? [schema.text(文本)] : []);
  const doc = schema.node("doc", null, [段]);
  const 末 = doc.content.size - 1;
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 末),
  });
}

/* ── 一、表的账 ─────────────────────────────────────────────────────── */

组("一、表的账（防死行）");

测("没有重名的短代码", () => {
  // ⚠️ 重名不报错：`按短代码` 那个 Map 只留第一条，后一条**永远查不到**，
  // 而它在对话框里照样列着、点得出字符——只有"敲短代码替换"那条路会静默失效。
  const 见过 = new Set<string>();
  const 重的: string[] = [];
  for (const 项 of Emoji表) {
    if (见过.has(项.短代码)) 重的.push(项.短代码);
    见过.add(项.短代码);
  }
  if (重的.length) throw new Error(`重名 ${重的.length} 条：${重的.join("、")}`);
});

测("短代码一律小写，且只由 [a-z0-9_+-] 组成", () => {
  // 含大写 = 永远查不到（查表走 `toLowerCase()`，而表里的键是原样的）；
  // 含别的符号 = 输入规则的正则 `[a-zA-Z0-9_+-]` 认不出来。
  const 坏的 = Emoji表.filter((项) => !/^[a-z0-9_+-]+$/.test(项.短代码));
  if (坏的.length) {
    throw new Error(`有 ${坏的.length} 条不合规：${坏的.map((项) => 项.短代码).join("、")}`);
  }
});

测("每一条短代码都打得出来（拿输入规则那条正则核）", () => {
  // ⚠️ 这一条盯的是**输入规则的正则形状**：表里有 `:x:` / `:v:` 这种单字符
  // 短代码，正则一旦写成 `{2,}`，它们就在面板里选得到、**却永远敲不出来**
  // ——一种不报错的死行。所以这里**不另写一条正则**，直接用导出那条
  // （`输入规则正则`）核表里的每一条。
  const 打不出 = Emoji表.filter((项) => !输入规则正则.test(`${带冒号(项.短代码)} `));
  if (打不出.length) {
    throw new Error(`有 ${打不出.length} 条敲不出来：${打不出.map((项) => 项.短代码).join("、")}`);
  }
});

测("输入规则的正则不吃半截短代码", () => {
  // ⚠️ 两头都要有冒号：`见 :smile 处`（少一个冒号）不该被换成 😄。
  等(输入规则正则.test(":smile "), false, "缺结尾冒号");
  等(输入规则正则.test("smile: "), false, "缺开头冒号");
  等(输入规则正则.test(":smile:"), false, "后面没有空白（规则要一个触发字符）");
  // ⚠️ 时间写法在**形状上就不中**（只有一个冒号）。
  等(输入规则正则.test("10:30 "), false, "时间写法");
  // ⚠️ 但 `:30:` 这种形状**是中的**——拦不拦得住全靠查表那一步。两处分工
  // 写在这里，免得将来有人把查表那一步"优化"掉。
  等(输入规则正则.test(":30: "), true, "`:30:` 形状合法");
  等(查短代码("30"), null, "查表挡得住");
});

测("每一条的字符与分类都非空", () => {
  const 坏的 = Emoji表.filter((项) => 项.字符 === "" || 项.分类 === "");
  if (坏的.length) throw new Error(`${坏的.length} 条空字段：${JSON.stringify(坏的.slice(0, 5))}`);
});

测("每一条都查得到，而且查回来的就是它自己", () => {
  // ⚠️ 遍历整张表——重名、写歪、值写反，都在这里现形。
  const 坏的: string[] = [];
  for (const 项 of Emoji表) {
    const 回 = 查短代码(项.短代码);
    if (!回 || 回.字符 !== 项.字符) 坏的.push(`${项.短代码}（查到 ${回 ? 回.字符 : "空"}）`);
  }
  if (坏的.length) throw new Error(`有 ${坏的.length} 条查不回自己：${坏的.slice(0, 10).join("、")}`);
});

测("分类是那十一类，且每一类都有人", () => {
  // ⚠️ 分类名拼歪（比如写了「动物类」）不会报错：对话框里会多出一个空页签，
  // 或者那一类的条目被算进"别的"分类里，看着只是"少了几条"。
  等(Emoji分类.length, 11, "分类数");
  const 空的 = Emoji分类.filter((一类) => !Emoji表.some((项) => 项.分类 === 一类));
  if (空的.length) throw new Error(`有分类是空的：${空的.join("、")}`);
});

测("表不是空的，规模在「几百条」这个量级", () => {
  // ⚠️ 上界是**防手滑**：这张表是手写的固定表，不是"把全世界的 emoji 搬进来"。
  if (Emoji表.length < 200) throw new Error(`只有 ${Emoji表.length} 条，是不是被误删了？`);
  if (Emoji表.length > 800) throw new Error(`有 ${Emoji表.length} 条，这张表该是"手写的一小张"`);
});

测("同一个字符可以有多条短代码（别名），但别名也要能查到", () => {
  // `+1` 与 `thumbsup` 指向同一个 👍——这是**故意**的（GitHub 也这么做），
  // 所以「重名」那条判的是短代码，不是字符。
  const 别名 = new Map<string, Emoji项[]>();
  for (const 项 of Emoji表) {
    const 已 = 别名.get(项.字符) ?? [];
    已.push(项);
    别名.set(项.字符, 已);
  }
  const 有别名 = [...别名.values()].filter((组) => 组.length > 1);
  if (有别名.length === 0) throw new Error("一条别名都没有？表里本该有 `+1`/`thumbsup` 这种");
  for (const 组 of 有别名) {
    // 两条别名的**分类**必须一致：不一致的话，同一个字符在对话框里会
    // 同时出现在两个分类下，用户以为表坏了。
    const 类 = new Set(组.map((项) => 项.分类));
    if (类.size !== 1) throw new Error(`${组[0]!.字符} 的别名跨了分类：${[...类].join("、")}`);
  }
});

/* ── 二、查短代码 ───────────────────────────────────────────────────── */

组("二、查短代码");

测("大小写不敏感", () => {
  等(查短代码("smile")?.字符, "😄", "小写");
  等(查短代码("Smile")?.字符, "😄", "首字母大写");
  等(查短代码("SMILE")?.字符, "😄", "全大写");
});

测("查不到给 null（不是空对象）", () => {
  等(查短代码("zzzz"), null, "不存在的");
  等(查短代码(""), null, "空串");
});

测("别名两条都查得到，且指向同一个字符", () => {
  等(查短代码("+1")?.字符, 查短代码("thumbsup")?.字符, "+1 与 thumbsup");
});

/* ── 三、找Emoji ────────────────────────────────────────────────────── */

组("三、找Emoji（只做前缀匹配）");

测("命中的每一条都以那个前缀开头", () => {
  const 出 = 找Emoji("sm");
  if (出.length === 0) throw new Error("`sm` 一条都没有？表里该有 smile / smiley 这一族");
  const 坏的 = 出.filter((项) => !项.短代码.startsWith("sm"));
  if (坏的.length) throw new Error(`不是前缀匹配：${坏的.map((项) => 项.短代码).join("、")}`);
});

测("默认上限 8 条", () => {
  等(找Emoji("a").length, 8, "`a` 是个很宽的前缀");
  等(找Emoji("").length, 8, "空前缀");
});

测("上限可以调小", () => {
  等(找Emoji("a", 3).length, 3, "3 条");
  等(找Emoji("a", 1).length, 1, "1 条");
});

测("前缀大小写不敏感", () => {
  等(找Emoji("SM").length, 找Emoji("sm").length, "SM 与 sm");
});

测("查不到给空数组（不是 null）", () => {
  等(找Emoji("zzzz").length, 0, "不存在的");
});

测("带冒号的前缀查不到（冒号不是短代码的一部分）", () => {
  // ⚠️ `认前缀` 里正则已经把 `:` 剥掉了，所以这里不必处理冒号。
  // 万一哪天有人直接把它接到别处（比如搜索框），这条会提醒他先剥冒号。
  等(找Emoji(":sm").length, 0, ":sm");
});

测("子串匹配**故意不做**：`eyes` 找不到 `heart_eyes`", () => {
  // ⚠️ 这条是**把口径钉住**：子串匹配会让 `:a` 命中几百条，面板第一个候选
  // 变成"表里的顺序"说了算的随机结果。代价如实记：`heart_eyes` 只能从头打。
  const 出 = 找Emoji("eyes");
  等(出.some((项) => 项.短代码 === "heart_eyes"), false, "heart_eyes 不该出现");
});

/* ── 四、带冒号 ─────────────────────────────────────────────────────── */

组("四、带冒号");

测("两头各一个冒号", () => {
  等(带冒号("smile"), ":smile:", "smile");
  等(带冒号("+1"), ":+1:", "带加号的别名");
});

/* ── 五、认前缀 ─────────────────────────────────────────────────────── */

组("五、认前缀");

测("光标前是 `:sm` → 认出前缀与起点", () => {
  const state = 段落状态("hi :sm");
  const 状 = 认前缀(state);
  if (!状) throw new Error("该认出来");
  等(状.前缀, "sm", "前缀");
  // 文档位置 1='h' 2='i' 3=' ' 4=':' 5='s' 6='m'，所以 `:` 在 4。
  等(状.起, 4, "`:` 的文档坐标");
  if (状.候选.length === 0) throw new Error("候选不该是空的");
  等(状.选中, 0, "初始高亮第一条");
});

测("刚打出 `:` 就给候选（前缀为空也算一次认前缀？不——见下条）", () => {
  // ⚠️ 这里钉的是**现状**：正则要 `{1,}`，所以 `:` 后面一个字都没有时
  // **认不出**（用户刚敲下冒号那一刻面板不弹）。这是有意的保守：弹一个
  // "三百条全在"的列表比不弹更烦，用户再打一个字母就出来了。
  等(认前缀(段落状态("hi :")), null, "只有冒号");
});

测("`:` 后面是空白 → 断开", () => {
  等(认前缀(段落状态("hi :sm ile")), null, "空格之后");
});

测("没有冒号 → null", () => {
  等(认前缀(段落状态("hello")), null, "普通文本");
});

测("短代码查不到 → null", () => {
  等(认前缀(段落状态("hi :zzzz")), null, "zzzz 不在表里");
});

测("选区非空 → null（用户在选择，不是在打字）", () => {
  const 段 = schema.node("paragraph", null, [schema.text("hi :sm")]);
  const doc = schema.node("doc", null, [段]);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1, 7),
  });
  等(认前缀(state), null, "有选区");
});

测("前缀大小写不敏感（`:SM` 也能认）", () => {
  const 状 = 认前缀(段落状态("hi :SM"));
  if (!状) throw new Error("该认出来");
  等(状.前缀, "SM", "前缀原样");
  if (状.候选.length === 0) throw new Error("候选该按小写去匹配");
});

测("只看当前文本块：上一段里的 `:sm` 不算", () => {
  const 上 = schema.node("paragraph", null, [schema.text(":sm")]);
  const 下 = schema.node("paragraph", null, [schema.text("正文")]);
  const doc = schema.node("doc", null, [上, 下]);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, doc.content.size - 1),
  });
  等(认前缀(state), null, "跨块不算");
});

/* ── 六、采用候选 ───────────────────────────────────────────────────── */

组("六、采用候选");

测("只换掉从 `:` 到光标那一段，前面的字不动", () => {
  const state = 段落状态("hi :sm");
  const 状 = 认前缀(state);
  if (!状) throw new Error("该认出来");
  // 候选第一条按表里的顺序，`sm` 那一族的第一条就是 `smile`。
  const tr = 采用候选(state, 状, 0);
  if (!tr) throw new Error("该给出一笔事务");
  const 后 = state.apply(tr);
  等(后.doc.textContent, "hi 😄", "结果文本");
});

测("第几条越界 → null（不抛）", () => {
  const state = 段落状态("hi :sm");
  const 状 = 认前缀(state);
  if (!状) throw new Error("该认出来");
  等(采用候选(state, 状, 99), null, "越界");
  等(采用候选(state, 状, -1), null, "负数");
});

/* ── 七、装配 ───────────────────────────────────────────────────────── */

组("七、装配");

测("关着的时候一条规则、一条插件都不挂", () => {
  等(emoji输入规则(false).length, 0, "输入规则");
  等(emoji补全(false).length, 0, "补全插件");
});

测("开着的时候各挂 1 条", () => {
  等(emoji输入规则(true).length, 1, "输入规则");
  等(emoji补全(true).length, 1, "补全插件");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
