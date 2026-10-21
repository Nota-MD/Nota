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
  MARKDOWN后缀,
  后缀,
  是大文件,
  实际模式,
  大文件阈值,
  是Markdown后缀,
  认文件类型,
  降级缘由,
} from "@/editor/file-kind";

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

/* ── 一、⚠️ 与宿主那张单子逐个对齐 ─────────────────────────────────── */

组("一、⚠️ 后缀表与宿主 `is_markdown` 逐个对齐");

const RUST源 = readFileSync(
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
function 读宿主后缀表(): string[] {
  const fn = /fn is_markdown\([\s\S]*?\n\}/.exec(RUST源);
  if (!fn) throw new Error("源码里找不到 fn is_markdown");
  const 数组 = /\[([\s\S]*?)\]/.exec(fn[0]);
  if (!数组) throw new Error("is_markdown 里找不到那张数组");
  const 出: string[] = [];
  for (const m of 数组[1]!.matchAll(/"\.([A-Za-z0-9]+)"/g)) 出.push(m[1]!);
  return 出;
}

测("⚠️ `MARKDOWN后缀` 必须与 `commands/workspace.rs::is_markdown` 一字不差", () => {
  // ⚠️ 对不上的症状：文件树里**不列**这一类文件（宿主那头说它不是 markdown），
  // 而拖进来、写进「打开」对话框里又能开——同一份文件两处口径不一样。
  等(
    [...MARKDOWN后缀].sort().join(","),
    读宿主后缀表().sort().join(","),
    "两边的 Markdown 后缀单子",
  );
});

测("宿主那张单子读全了（不是空数组冒充成功）", () => {
  // ⚠️ 正则写坏时最可能的结果是**读出空数组**，而空数组与空数组也是"相等"的
  // ——上一条会静静地过。所以这条先钉住条数。
  const 宿主 = 读宿主后缀表();
  if (宿主.length < 4) throw new Error(`只读出 ${宿主.length} 条：${宿主.join(",")}`);
  等(宿主.includes("md"), true, "起码要认 md");
});

测("`ui/useFileDrop.ts` 与 `ui/useDocuments.ts` 都得**引**这张表，不许再抄一遍", () => {
  // ⚠️ 收了这张表就是为了这件事：四个地方各写一遍时它们**已经不一致了**
  //（`.txt` 在拖放那一侧不算 Markdown）。这条断言不查语义，只查"有没有引过来"
  // ——又抄一遍的话，两处口径迟早再分一次叉。
  //
  // ⚠️ 判据是**引了那个模块里的名字**，不是"源文件里不出现 md/markdown 这几个
  // 字"：`useFileDrop.ts` 里还有一张更宽的 `文本后缀`（`.json` `.toml` …），
  // 它回答的是**另一个问题**（能不能当文本文档打开），那一条**本来就该在**。
  for (const [文件, 名字] of [
    ["useFileDrop.ts", "是Markdown后缀"],
    ["useDocuments.ts", "MARKDOWN后缀"],
  ] as const) {
    const 源 = readFileSync(join("src", "ui", 文件), "utf8");
    if (!源.includes(`from "@/editor/file-kind"`) || !源.includes(名字)) {
      throw new Error(`${文件} 没有引 \`${名字}\`——后缀单子只能有一份`);
    }
  }
});

/* ── 二、取后缀 ─────────────────────────────────────────────────────── */

组("二、后缀怎么取");

测("普通路径", () => {
  等(后缀("a.md"), "md", "最简单的");
  等(后缀("/tmp/x/稿子.MARKDOWN"), "markdown", "大小写要归一");
  等(后缀("C:\\Users\\a\\笔记.txt"), "txt", "反斜杠也算分隔符");
});

测("⚠️ 点开头的隐藏文件**没有后缀**（别把它取成 `bashrc`）", () => {
  // ⚠️ 按"最后一个点"取后缀的话，`.bashrc` 会取成 `bashrc`、`.gitignore` 取成
  // `gitignore`。这不会报错，只会让"这份文件是什么类型"多出一堆不存在的类型。
  等(后缀(".bashrc"), "", "点开头的");
  等(后缀("/home/x/.gitignore"), "", "带路径的");
  等(后缀(".."), "", "两个点");
});

测("没有后缀、或者点在目录里，都给空串", () => {
  等(后缀("Makefile"), "", "没有点");
  等(后缀("/a.b/c"), "", "点只出现在目录那一段");
  等(后缀(""), "", "空串");
});

测("`是Markdown后缀` 认那六种，别的一律不认", () => {
  for (const 尾 of MARKDOWN后缀) {
    等(是Markdown后缀(`x.${尾}`), true, `.${尾}`);
    等(是Markdown后缀(`x.${尾.toUpperCase()}`), true, `.${尾} 大写`);
  }
  for (const 尾 of ["py", "rs", "json", "text", "mdx.bak"]) {
    等(是Markdown后缀(`x.${尾}`), false, `.${尾}`);
  }
});

/* ── 三、降级两条缘由 ───────────────────────────────────────────────── */

组("三、降级缘由（先看名字，再看大小）");

测("Markdown 且不大 → 不降级", () => {
  等(降级缘由("/a/稿子.md", 1000), null, "正常的 Markdown");
});

测("不是 Markdown → `text`（跟大小无关）", () => {
  // ⚠️ 小文件也要降级：一个 200 字节的 `.py` 拿 CommonMark 去读照样是错的。
  等(降级缘由("/a/foo.py", 200), "text", "小 .py");
  等(降级缘由("/a/foo.py", 大文件阈值 + 1), "text", "大 .py 也报 text 而不是 large");
});

测("⚠️ 两条缘由的**优先级**：不是 Markdown 就报 `text`，不报 `large`", () => {
  // ⚠️ 顺序反过来的症状：拖一篇巨大的 `.py` 进来，提示条说"文件太大"——
  // 而真正的原因是**它根本不是 Markdown**，用户会去想办法把它改小。
  等(降级缘由("/a/big.py", 999_999_999), "text", "巨大但不是 Markdown");
});

测("⚠️ 还没存盘的新文档（`path` 是 `null`）按 Markdown 算，但大小照判", () => {
  // ⚠️ `Document.path` 就是 `string | null`，新建那份是 `null`。写成
  // `认文件类型(路径)` 的话这里会**崩**（`null.split` 报错），而崩的位置是
  // `App.tsx` 的渲染里——整块界面白屏，跟"文件名"这件事看不出关系。
  等(降级缘由(null, 1000), null, "新建的空白文档");
  等(
    降级缘由(null, 大文件阈值 + 1),
    "large",
    "粘进来的一篇超大文档，没名字也降级",
  );
});

测("Markdown 但太大 → `large`", () => {
  等(降级缘由("/a/大稿.md", 大文件阈值 + 1), "large", "超过阈值");
});

测("⚠️ 阈值那一刻：**正好等于不算超**", () => {
  // ⚠️ 写成 `>=` 的症状：正好到阈值的那一份会掉进源码模式，而
  // 往下数一个字又回到富文本——用户会遇到"删一个字就好了"这种怪事。
  等(是大文件(大文件阈值), false, "正好等于");
  等(是大文件(大文件阈值 + 1), true, "多一个字");
  等(是大文件(0), false, "空文档");
});

测("`实际模式`：没缘由就照用户设的，有缘由一律 `source`", () => {
  等(实际模式("wysiwyg", null), "wysiwyg", "不降级");
  等(实际模式("split", null), "split", "不降级（另一档）");
  for (const 缘由 of ["text", "large"] as const) {
    for (const 偏好 of ["wysiwyg", "split", "source"] as const) {
      等(实际模式(偏好, 缘由), "source", `${偏好} + ${缘由}`);
    }
  }
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
