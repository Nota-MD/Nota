/**
 * `src/editor/file-kind.ts`（按文件名认类型）的**可运行**测试集。
 * 2026-09-28 写，与那个文件同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/file-kind.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-tests/file-kind.mjs
 * node /tmp/nota-tests/file-kind.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * - **第一组是承重的**：后缀表在 TS 与 Rust 两边各有一份，写错一个字母
 *   **两边的编译器都不吭声**。症状不是报错，是"同一份 `.txt` 从菜单打开是一回事、
 *   拖进来是另一回事"，或者"文件树里不列它，但拖得进来"。所以这一组去**读
 *   Rust 源码**，把两张单子逐个对。
 * - 第二、三组是纯函数：后缀怎么取、大文件怎么判。⚠️ 边缘那两个
 *   （`.bashrc`、没有后缀）是这一格最容易写错的地方——按"最后一个点"取后缀
 *   会把 `.bashrc` 取成 `bashrc`。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️ **「拖一个 .py 进来真的走了源码模式」没验**：那要真 React ＋ 真宿主
 *   ＋ 一次真拖放（本仓没有 jsdom，拖放也没法在无头里造）。口径怎么算在这里，
 *   接在哪儿、有没有真的生效只能靠开窗目检（`docs/07` 第 86 项）。
 * - ⚠️ **大文件阈值没有实测支撑**：那是个判断（理由写在源码常量上），
 *   不是一个量出来的转折点。这里只验"边界那一刻算不算超"。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  mARKDOWNExtension,
  extension,
  isLargeTextItem,
  actualMode,
  largeTextItemThresholdValue,
  isMarkdownExtension,
  recognizeTextItemType,
  LowerLevelReason,
} from "@/editor/file-kind";

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

/* ── 一、⚠️ 与宿主那张单子逐个对齐 ─────────────────────────────────── */

group("一、⚠️ 后缀表与宿主 `is_markdown` 逐个对齐");

const rUSTSource = readFileSync(
  join("src-tauri", "src", "commands", "workspace.rs"),
  "utf8",
);

/**
 * 从 `fn is_markdown` 里抠出那张单子。
 *
 * ⚠️ 只看**一个数组字面量**的写法（本仓就是那样）。哪天有人把它换成
 * `matches!` 或者拆成两段，这里会**读少**——所以下面那条断言是
 * "读出来的必须**正好等于**期望的那几个"，读少了当场 FAIL，不会静默放过。
 */
function readHostExtensionTable(): string[] {
  const fn = /fn is_markdown\([\s\S]*?\n\}/.exec(rUSTSource);
  if (!fn) throw new Error("源码里找不到 fn is_markdown");
  const numberGroup = /\[([\s\S]*?)\]/.exec(fn[0]);
  if (!numberGroup) throw new Error("is_markdown 里找不到那张数组");
  const output2: string[] = [];
  for (const m of numberGroup[1]!.matchAll(/"\.([A-Za-z0-9]+)"/g)) output2.push(m[1]!);
  return output2;
}

testCase("⚠️ `MARKDOWN后缀` 必须与 `commands/workspace.rs::is_markdown` 一字不差", () => {
  // ⚠️ 对不上的症状：文件树里**不列**这一类文件（宿主那头说它不是 markdown），
  // 而拖进来、写进「打开」对话框里又能开——同一份文件两处口径不一样。
  equal(
    [...mARKDOWNExtension].sort().join(","),
    readHostExtensionTable().sort().join(","),
    "两边的 Markdown 后缀单子",
  );
});

testCase("宿主那张单子读全了（不是空数组冒充成功）", () => {
  // ⚠️ 正则写坏时最可能的结果是**读出空数组**，而空数组与空数组也是"相等"的
  // ——上一条会静静地过。所以这条先钉住条数。
  const host = readHostExtensionTable();
  if (host.length < 4) throw new Error(`只读出 ${host.length} 条：${host.join(",")}`);
  equal(host.includes("md"), true, "起码要认 md");
});

testCase("`ui/useFileDrop.ts` 与 `ui/useDocuments.ts` 都得**引**这张表，不许再抄一遍", () => {
  // ⚠️ 收了这张表就是为了这件事：四个地方各写一遍时它们**已经不一致了**
  //（`.txt` 在拖放那一侧不算 Markdown）。这条断言不查语义，只查"有没有引过来"
  // ——又抄一遍的话，两处口径迟早再分一次叉。
  //
  // ⚠️ 判据是**引了那个模块里的名字**，不是"源文件里不出现 md/markdown 这几个
  // 字"：`useFileDrop.ts` 里还有一张更宽的 `文本后缀`（`.json` `.toml` …），
  // 它回答的是**另一个问题**（能不能当文本文档打开），那一条**本来就该在**。
  for (const [textItem, name2] of [
    ["useFileDrop.ts", "是Markdown后缀"],
    ["useDocuments.ts", "MARKDOWN后缀"],
  ] as const) {
    const source3 = readFileSync(join("src", "ui", textItem), "utf8");
    if (!source3.includes(`from "@/editor/file-kind"`) || !source3.includes(name2)) {
      throw new Error(`${textItem} 没有引 \`${name2}\`——后缀单子只能有一份`);
    }
  }
});

/* ── 二、取后缀 ─────────────────────────────────────────────────────── */

group("二、后缀怎么取");

testCase("普通路径", () => {
  equal(extension("a.md"), "md", "最简单的");
  equal(extension("/tmp/x/稿子.MARKDOWN"), "markdown", "大小写要归一");
  equal(extension("C:\\Users\\a\\笔记.txt"), "txt", "反斜杠也算分隔符");
});

testCase("⚠️ 点开头的隐藏文件**没有后缀**（别把它取成 `bashrc`）", () => {
  // ⚠️ 按"最后一个点"取后缀的话，`.bashrc` 会取成 `bashrc`、`.gitignore` 取成
  // `gitignore`。这不会报错，只会让"这份文件是什么类型"多出一堆不存在的类型。
  equal(extension(".bashrc"), "", "点开头的");
  equal(extension("/home/x/.gitignore"), "", "带路径的");
  equal(extension(".."), "", "两个点");
});

testCase("没有后缀、或者点在目录里，都给空串", () => {
  equal(extension("Makefile"), "", "没有点");
  equal(extension("/a.b/c"), "", "点只出现在目录那一段");
  equal(extension(""), "", "空串");
});

testCase("`是Markdown后缀` 认那六种，别的一律不认", () => {
  for (const tail of mARKDOWNExtension) {
    equal(isMarkdownExtension(`x.${tail}`), true, `.${tail}`);
    equal(isMarkdownExtension(`x.${tail.toUpperCase()}`), true, `.${tail} 大写`);
  }
  for (const tail of ["py", "rs", "json", "text", "mdx.bak"]) {
    equal(isMarkdownExtension(`x.${tail}`), false, `.${tail}`);
  }
});

/* ── 三、降级两条缘由 ───────────────────────────────────────────────── */

group("三、降级缘由（先看名字，再看大小）");

testCase("Markdown 且不大 → 不降级", () => {
  equal(LowerLevelReason("/a/稿子.md", 1000), null, "正常的 Markdown");
});

testCase("不是 Markdown → `text`（跟大小无关）", () => {
  // ⚠️ 小文件也要降级：一个 200 字节的 `.py` 拿 CommonMark 去读照样是错的。
  equal(LowerLevelReason("/a/foo.py", 200), "text", "小 .py");
  equal(LowerLevelReason("/a/foo.py", largeTextItemThresholdValue + 1), "text", "大 .py 也报 text 而不是 large");
});

testCase("⚠️ 两条缘由的**优先级**：不是 Markdown 就报 `text`，不报 `large`", () => {
  // ⚠️ 顺序反过来的症状：拖一篇巨大的 `.py` 进来，提示条说"文件太大"——
  // 而真正的原因是**它根本不是 Markdown**，用户会去想办法把它改小。
  equal(LowerLevelReason("/a/big.py", 999_999_999), "text", "巨大但不是 Markdown");
});

testCase("⚠️ 还没存盘的新文档（`path` 是 `null`）按 Markdown 算，但大小照判", () => {
  // ⚠️ `Document.path` 就是 `string | null`，新建那份是 `null`。写成
  // `认文件类型(路径)` 的话这里会**崩**（`null.split` 报错），而崩的位置是
  // `App.tsx` 的渲染里——整块界面白屏，跟"文件名"这件事看不出关系。
  equal(LowerLevelReason(null, 1000), null, "新建的空白文档");
  equal(
    LowerLevelReason(null, largeTextItemThresholdValue + 1),
    "large",
    "粘进来的一篇超大文档，没名字也降级",
  );
});

testCase("Markdown 但太大 → `large`", () => {
  equal(LowerLevelReason("/a/大稿.md", largeTextItemThresholdValue + 1), "large", "超过阈值");
});

testCase("⚠️ 阈值那一刻：**正好等于不算超**", () => {
  // ⚠️ 写成 `>=` 的症状：正好到阈值的那一份会掉进源码模式，而
  // 往下数一个字又回到富文本——用户会遇到"删一个字就好了"这种怪事。
  equal(isLargeTextItem(largeTextItemThresholdValue), false, "正好等于");
  equal(isLargeTextItem(largeTextItemThresholdValue + 1), true, "多一个字");
  equal(isLargeTextItem(0), false, "空文档");
});

testCase("`实际模式`：没缘由就照用户设的，有缘由一律 `source`", () => {
  equal(actualMode("wysiwyg", null), "wysiwyg", "不降级");
  equal(actualMode("split", null), "split", "不降级（另一档）");
  for (const reason of ["text", "large"] as const) {
    for (const preference of ["wysiwyg", "split", "source"] as const) {
      equal(actualMode(preference, reason), "source", `${preference} + ${reason}`);
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
