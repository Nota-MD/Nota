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
import { 口径键, 读口径, 缺省口径 } from "@/ui/tree-options";

/* ── 一支极小的测试工装（与 `auto-correct.test.ts` 同一套长相）── */

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

/** 造一份只带 `files` 那一格的设置（这个模块只读那一格）。 */
function 假设置(files: {
  tree_sort: string;
  tree_filter: string;
  show_hidden: boolean;
}): Settings {
  return { files } as unknown as Settings;
}

/* ── 一、读口径 ─────────────────────────────────────────────────────── */

组("一、读口径");

测("设置还没到时给缺省口径（不是抛、也不是 undefined）", () => {
  等(读口径(null).sort, 缺省口径.sort, "排序");
  等(读口径(null).filter, 缺省口径.filter, "过滤");
  等(读口径(null).showHidden, 缺省口径.showHidden, "隐藏文件");
});

测("设置到了就逐格照抄，一个都不漏", () => {
  const 口径 = 读口径(
    假设置({ tree_sort: "modified", tree_filter: "all", show_hidden: true }),
  );
  等(口径.sort, "modified", "排序");
  等(口径.filter, "all", "过滤");
  等(口径.showHidden, true, "隐藏文件");
});

测("⚠️ 三格是**照抄**不是拼装：`show_hidden: false` 不能被 `??` 之类的兜底吃掉", () => {
  // ⚠️ 写成 `settings?.files.show_hidden ?? true` 这类兜底的话，
  // **用户主动关掉**的那一格会被当成"没填"——症状是"隐藏文件关不掉"。
  const 口径 = 读口径(
    假设置({ tree_sort: "name", tree_filter: "supported", show_hidden: false }),
  );
  等(口径.showHidden, false, "显式的 false 要留住");
});

/* ── 二、口径键 ─────────────────────────────────────────────────────── */

组("二、口径键（给 `useEffect` 的依赖数组用）");

测("三格任一不同，键就不同", () => {
  const 基 = { sort: "name", filter: "supported", showHidden: false } as const;
  const 键 = 口径键(基);
  for (const 变 of [
    { ...基, sort: "modified" },
    { ...基, filter: "all" },
    { ...基, showHidden: true },
  ] as Array<typeof 基>) {
    if (口径键(变) === 键) throw new Error(`这一格变了但键没变：${JSON.stringify(变)}`);
  }
});

测("⚠️ 内容一样的两个对象给**同一个键**（这才是它存在的理由）", () => {
  // ⚠️ `读口径` 每次返回一个新对象，所以它的**身份**每次渲染都变——直接拿它
  // 当依赖等于"每次渲染都重取一遍已经展开的目录"。键是值比较，这才是那一行
  // 依赖数组能用的原因。
  const 甲 = 读口径(假设置({ tree_sort: "name", tree_filter: "all", show_hidden: true }));
  const 乙 = 读口径(假设置({ tree_sort: "name", tree_filter: "all", show_hidden: true }));
  if (甲 === 乙) throw new Error("前提不成立：这两个该是两个对象");
  等(口径键(甲), 口径键(乙), "同样的内容该给同一个键");
});

/* ── 三、⚠️ 与宿主那三档对名字（改枚举就得重跑这一组）────────────── */

组("三、⚠️ 档位名字与宿主逐个对齐");

const RUST源 = readFileSync(join("src-tauri", "src", "settings", "files.rs"), "utf8");

/** 把 `TreeSort` 那样的 CamelCase 变体名转成线上的 kebab-case 取值。 */
function 转kebab(变体: string): string {
  return 变体.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * 从 Rust 源码里抠出一个枚举的三样：有没有 `rename_all`、变体名、默认变体。
 *
 * ⚠️ 只看**一行一个变体**的写法（本仓那三个枚举都是这样，每个变体上都挂着
 * 一段文档注释）。哪天有人把变体写成一行多个，这里会**读少**——所以下面每条
 * 断言都是"读出来的集合必须**正好等于**期望的那几个"，读少了会当场 FAIL，
 * 不会静默放过。
 */
function 读枚举(名: string): { kebab: boolean; 变体: string[]; 缺省: string | null } {
  // ⚠️ `((?:#[^\n]*\n)*)` 要**把几条属性行全收进来**：`derive` 一条、`serde`
  // 一条，第 2 条才是 `rename_all`。只抓第一行的话这条断言会**永远说"没写
  // kebab-case"**——这正是它第一版踩的那一脚（测试自己错了，比不写还糟：
  // 它会逼着下一个人去"修"一段本来正确的代码）。
  const 枚举 = new RegExp(`((?:#[^\\n]*\\n)*)pub enum ${名} \\{([\\s\\S]*?)\\n\\}`).exec(RUST源);
  if (!枚举) throw new Error(`源码里找不到 pub enum ${名}`);
  const 变体: string[] = [];
  for (const 行 of 枚举[2]!.split("\n")) {
    const 去 = 行.trim();
    if (去 === "" || 去.startsWith("///") || 去.startsWith("#[")) continue;
    const 名去逗号 = 去.replace(/,$/, "");
    if (/^[A-Za-z][A-Za-z0-9]*$/.test(名去逗号)) 变体.push(名去逗号);
  }
  // ⚠️ 本仓两种写法都有（`Self::Name` 与 `TreeSort::Name`），两个都认——
  // 只认一种的话，哪天有人换个写法，这条断言会**静默落空**（`缺省` 变成
  // `null`），而下面那条"默认档一致"的断言只会说"实际是空串"，看不出所以然。
  const 缺省 = new RegExp(
    `impl Default for ${名} \\{[\\s\\S]*?(?:Self|${名})::([A-Za-z0-9]+)`,
  ).exec(RUST源);
  return {
    kebab: /rename_all\s*=\s*"kebab-case"/.test(枚举[1]!),
    变体,
    缺省: 缺省 ? 缺省[1]! : null,
  };
}

测("⚠️ 两个枚举都写着 `kebab-case`（没有它，线上取值会变成 `TreeSort.Name`）", () => {
  // ⚠️ Tauri 命令的参数是 JSON 过去的，serde 默认用的是**变体名原样**
  // （`"Modified"`）。少了 `rename_all`，这边发 `"modified"` 会反序列化失败，
  // 而失败的那一格是 `Option<TreeSort>`——整条 `tree` 命令报错，症状是
  // **整个文件树打不开**，却和"排序"这个动作看不出关系。
  for (const 名 of ["TreeSort", "FileFilter"]) {
    if (!读枚举(名).kebab) throw new Error(`${名} 上没有 rename_all = "kebab-case"`);
  }
});

测("`TreeSort` 的三档与 `src/ui/tree-options.ts` 一字不差", () => {
  const { 变体 } = 读枚举("TreeSort");
  const 线上 = 变体.map(转kebab).sort();
  等(线上.join(","), "created,modified,name", "三档的名字");
});

测("`FileFilter` 的两档也一字不差", () => {
  const { 变体 } = 读枚举("FileFilter");
  等(变体.map(转kebab).sort().join(","), "all,supported", "两档的名字");
});

测("⚠️ 缺省口径必须与宿主的默认值**逐格**一致", () => {
  // ⚠️ 不一致的症状是启动那几百毫秒里树按一种规则排、设置一到又按另一种重排。
  等(转kebab(读枚举("TreeSort").缺省 ?? ""), 缺省口径.sort, "排序的默认档");
  等(转kebab(读枚举("FileFilter").缺省 ?? ""), 缺省口径.filter, "过滤的默认档");
  // `show_hidden` 是个布尔，没有枚举可读——直接盯宿主 `Files` 的默认实现。
  const 缺省段 = /impl Default for Files \{[\s\S]*?\n    \}/.exec(RUST源);
  if (!缺省段) throw new Error("源码里找不到 impl Default for Files");
  if (!/show_hidden:\s*false/.test(缺省段[0]))
    throw new Error(`宿主那边 show_hidden 的默认值变了：\n${缺省段[0]}`);
  等(缺省口径.showHidden, false, "隐藏文件的默认档");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
