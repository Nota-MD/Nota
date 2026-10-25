/**
 * `src/ui/tree-options.ts`（文件树的口径）的**可运行**测试集。
 * 2026-09-28 写，与那个文件同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/tree-options.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-tests/tree-options.mjs
 * node /tmp/nota-tests/tree-options.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * 那个文件本身只有三个小程序，**真正会出事的是它和宿主之间那条缝**：
 *
 * - **档位的名字是两处各写一遍的**（这边是 TS 的联合类型，那边是 Rust 的枚举
 *   ＋ `kebab-case`）。写错一个字母（`"lastModifed"`、`"creatd"`）**两边的
 *   编译器都不吭声**：TS 这边只要字面量在联合里就放过，Rust 那边收到一个不认得
 *   的取值就是**反序列化失败**——而 `TreeOptions` 那三格是 `Option`，失败会
 *   整条命令报错。所以第二组去读 Rust 源码，把三档的名字与默认值**逐个对一遍**。
 * - **默认值必须两边一致**：不一致的表现是"树先按一种规则排、眨一下眼又按
 *   另一种重排"（启动那几百毫秒设置还没到，走的是这一份）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️ **「拨一下设置，树真的重排了」没验**：那要真 React ＋ 真宿主
 *   （本仓没有 jsdom）。口径随请求递过去那一段在 `bridge/ipc.ts::tree`，
 *   端到端只能靠开窗目检（`docs/07` 第 85 项）。
 * - ⚠️ **第二组是"读源码对名字"，不是"跑 Rust"**：它挡的是打字打错、
 *   以及"哪天有人给枚举加了第四档却忘了这边"。宿主那边真正读 TOML 的那条路
 *   由 `src-tauri/src/settings/files.rs` 自己的测试盯着。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Settings } from "@/bridge/ipc";
import { optionKey, readMouthPath, fallbackOptions } from "@/ui/tree-options";

/* ── 一支极小的测试工装（与 `auto-correct.test.ts` 同一套长相）── */

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

/** 造一份只带 `files` 那一格的设置（这个模块只读那一格）。 */
function fakeSettings(files: {
  tree_sort: string;
  tree_filter: string;
  show_hidden: boolean;
}): Settings {
  return { files } as unknown as Settings;
}

/* ── 一、读口径 ─────────────────────────────────────────────────────── */

group("一、读口径");

testCase("设置还没到时给缺省口径（不是抛、也不是 undefined）", () => {
  equal(readMouthPath(null).sort, fallbackOptions.sort, "排序");
  equal(readMouthPath(null).filter, fallbackOptions.filter, "过滤");
  equal(readMouthPath(null).showHidden, fallbackOptions.showHidden, "隐藏文件");
});

testCase("设置到了就逐格照抄，一个都不漏", () => {
  const mouthPath = readMouthPath(
    fakeSettings({ tree_sort: "modified", tree_filter: "all", show_hidden: true }),
  );
  equal(mouthPath.sort, "modified", "排序");
  equal(mouthPath.filter, "all", "过滤");
  equal(mouthPath.showHidden, true, "隐藏文件");
});

testCase("⚠️ 三格是**照抄**不是拼装：`show_hidden: false` 不能被 `??` 之类的兜底吃掉", () => {
  // ⚠️ 写成 `settings?.files.show_hidden ?? true` 这类兜底的话，
  // **用户主动关掉**的那一格会被当成"没填"——症状是"隐藏文件关不掉"。
  const mouthPath = readMouthPath(
    fakeSettings({ tree_sort: "name", tree_filter: "supported", show_hidden: false }),
  );
  equal(mouthPath.showHidden, false, "显式的 false 要留住");
});

/* ── 二、口径键 ─────────────────────────────────────────────────────── */

group("二、口径键（给 `useEffect` 的依赖数组用）");

testCase("三格任一不同，键就不同", () => {
  const base = { sort: "name", filter: "supported", showHidden: false } as const;
  const key = optionKey(base);
  for (const change of [
    { ...base, sort: "modified" },
    { ...base, filter: "all" },
    { ...base, showHidden: true },
  ] as Array<typeof base>) {
    if (optionKey(change) === key) throw new Error(`这一格变了但键没变：${JSON.stringify(change)}`);
  }
});

testCase("⚠️ 内容一样的两个对象给**同一个键**（这才是它存在的理由）", () => {
  // ⚠️ `读口径` 每次返回一个新对象，所以它的**身份**每次渲染都变——直接拿它
  // 当依赖等于"每次渲染都重取一遍已经展开的目录"。键是值比较，这才是那一行
  // 依赖数组能用的原因。
  const alpha = readMouthPath(fakeSettings({ tree_sort: "name", tree_filter: "all", show_hidden: true }));
  const beta = readMouthPath(fakeSettings({ tree_sort: "name", tree_filter: "all", show_hidden: true }));
  if (alpha === beta) throw new Error("前提不成立：这两个该是两个对象");
  equal(optionKey(alpha), optionKey(beta), "同样的内容该给同一个键");
});

/* ── 三、⚠️ 与宿主那三档对名字（改枚举就得重跑这一组）────────────── */

group("三、⚠️ 档位名字与宿主逐个对齐");

const rUSTSource = readFileSync(join("src-tauri", "src", "settings", "files.rs"), "utf8");

/** 把 `TreeSort` 那样的 CamelCase 变体名转成线上的 kebab-case 取值。 */
function convertkebab(changeBody: string): string {
  return changeBody.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * 从 Rust 源码里抠出一个枚举的三样：有没有 `rename_all`、变体名、默认变体。
 *
 * ⚠️ 只看**一行一个变体**的写法（本仓那三个枚举都是这样，每个变体上都挂着
 * 一段文档注释）。哪天有人把变体写成一行多个，这里会**读少**——所以下面每条
 * 断言都是"读出来的集合必须**正好等于**期望的那几个"，读少了会当场 FAIL，
 * 不会静默放过。
 */
function readTokenEnumerate(name3: string): { kebab: boolean; changeBody: string[]; fallback2: string | null } {
  // ⚠️ `((?:#[^\n]*\n)*)` 要**把几条属性行全收进来**：`derive` 一条、`serde`
  // 一条，第 2 条才是 `rename_all`。只抓第一行的话这条断言会**永远说"没写
  // kebab-case"**——这正是它第一版踩的那一脚（测试自己错了，比不写还糟：
  // 它会逼着下一个人去"修"一段本来正确的代码）。
  const tokenEnumerate = new RegExp(`((?:#[^\\n]*\\n)*)pub enum ${name3} \\{([\\s\\S]*?)\\n\\}`).exec(rUSTSource);
  if (!tokenEnumerate) throw new Error(`源码里找不到 pub enum ${name3}`);
  const changeBody: string[] = [];
  for (const line3 of tokenEnumerate[2]!.split("\n")) {
    const go = line3.trim();
    if (go === "" || go.startsWith("///") || go.startsWith("#[")) continue;
    const nameGoCommaNumber = go.replace(/,$/, "");
    if (/^[A-Za-z][A-Za-z0-9]*$/.test(nameGoCommaNumber)) changeBody.push(nameGoCommaNumber);
  }
  // ⚠️ 本仓两种写法都有（`Self::Name` 与 `TreeSort::Name`），两个都认——
  // 只认一种的话，哪天有人换个写法，这条断言会**静默落空**（`缺省` 变成
  // `null`），而下面那条"默认档一致"的断言只会说"实际是空串"，看不出所以然。
  const fallback2 = new RegExp(
    `impl Default for ${name3} \\{[\\s\\S]*?(?:Self|${name3})::([A-Za-z0-9]+)`,
  ).exec(rUSTSource);
  return {
    kebab: /rename_all\s*=\s*"kebab-case"/.test(tokenEnumerate[1]!),
    changeBody,
    fallback2: fallback2 ? fallback2[1]! : null,
  };
}

testCase("⚠️ 两个枚举都写着 `kebab-case`（没有它，线上取值会变成 `TreeSort.Name`）", () => {
  // ⚠️ Tauri 命令的参数是 JSON 过去的，serde 默认用的是**变体名原样**
  // （`"Modified"`）。少了 `rename_all`，这边发 `"modified"` 会反序列化失败，
  // 而失败的那一格是 `Option<TreeSort>`——整条 `tree` 命令报错，症状是
  // **整个文件树打不开**，却和"排序"这个动作看不出关系。
  for (const name3 of ["TreeSort", "FileFilter"]) {
    if (!readTokenEnumerate(name3).kebab) throw new Error(`${name3} 上没有 rename_all = "kebab-case"`);
  }
});

testCase("`TreeSort` 的三档与 `src/ui/tree-options.ts` 一字不差", () => {
  const { changeBody } = readTokenEnumerate("TreeSort");
  const lineAbove = changeBody.map(convertkebab).sort();
  equal(lineAbove.join(","), "created,modified,name", "三档的名字");
});

testCase("`FileFilter` 的两档也一字不差", () => {
  const { changeBody } = readTokenEnumerate("FileFilter");
  equal(changeBody.map(convertkebab).sort().join(","), "all,supported", "两档的名字");
});

testCase("⚠️ 缺省口径必须与宿主的默认值**逐格**一致", () => {
  // ⚠️ 不一致的症状是启动那几百毫秒里树按一种规则排、设置一到又按另一种重排。
  equal(convertkebab(readTokenEnumerate("TreeSort").fallback2 ?? ""), fallbackOptions.sort, "排序的默认档");
  equal(convertkebab(readTokenEnumerate("FileFilter").fallback2 ?? ""), fallbackOptions.filter, "过滤的默认档");
  // `show_hidden` 是个布尔，没有枚举可读——直接盯宿主 `Files` 的默认实现。
  const fallbackParagraph = /impl Default for Files \{[\s\S]*?\n    \}/.exec(rUSTSource);
  if (!fallbackParagraph) throw new Error("源码里找不到 impl Default for Files");
  if (!/show_hidden:\s*false/.test(fallbackParagraph[0]))
    throw new Error(`宿主那边 show_hidden 的默认值变了：\n${fallbackParagraph[0]}`);
  equal(fallbackOptions.showHidden, false, "隐藏文件的默认档");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
