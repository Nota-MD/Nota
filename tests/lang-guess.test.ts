/**
 * `src/editor/lang-guess.ts`（猜代码语言）的**可运行**测试集。
 * 2026-09-28 写，与那个文件同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/lang-guess.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/lang-guess.mjs
 * node /tmp/nota-测试/lang-guess.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * - **第九组**（⚠️ 改那张扩展名表之后**必须**重跑的那一组）：表里每一个语言 id
 *   都要在 `refractor` 那张 400 个的清单里真的存在。⚠️ 写错一个的后果是
 *   **不报错**——Prism 找不到语言就原样输出，看起来像"这个功能没生效"。
 * - **一～四**：`像代码` 的三档（中文正文 / 少于两行 / 打分不够）。
 *   ⚠️ 这一组是**这份文件最容易伤到人的地方**：它错了的症状是"用户粘一段
 *   散文进来，变成了代码块"。
 * - **五～八**：按扩展名推语言、按内容猜语言、按文件名线索、`猜代码语言`
 *   那条优先级链。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️ **「粘一段代码，文档里真出现一个带语言的代码块」没验**：那是
 *   `editor/paste.ts` 的 `handlePaste`，要真 view。
 * - ⚠️ **"猜得准不准"没有客观答案**：下面那些用例是**口径**（哪种输入该给
 *   哪个答案），不是准确率。真实的粘贴样本只能靠开窗目检（`docs/07` 那一项）。
 */

import { refractor } from "refractor/all";

import {
  扩展名表,
  按扩展名推语言,
  像代码,
  按内容猜语言,
  按文件名线索,
  猜代码语言,
} from "../src/editor/lang-guess";

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

/* ── 一、中文正文一律不算代码 ───────────────────────────────────────── */

组("一、否决一：中文正文");

测("整段中文散文不是代码", () => {
  等(
    像代码("今天下午我去了一趟图书馆，借了三本书回来。其中一本讲的是编译器。"),
    false,
    "纯中文散文",
  );
});

测("中英夹着写、带括号的也不算", () => {
  // ⚠️ 这一条是"往下调阈值之前先想清楚"那个警告的落点：这种文本里
  // `()` 一抓一大把，光靠符号判据一定会误伤。
  等(像代码("这个方法（handler）的返回值是 void，调用方不用管。"), false, "中文夹括号");
});

测("中文句读一出现就否决", () => {
  等(像代码("foo bar(); 这句里有个分号；还有中文分号。"), false, "中文分号");
  等(像代码("列表：\nconst a = 1;\nconst b = 2;"), false, "中文冒号");
});

测("⚠️ 代码注释是中文、但代码本身是英文：照样算代码", () => {
  // ⚠️ **这条是"两成"那个阈值的用处**：注释里的中文占比低，不该把一段真代码否掉。
  const 文 = ["// 计算总和", "function sum(a, b) {", "  return a + b;", "}"].join("\n");
  等(像代码(文), true, "中文注释 + 英文代码");
});

/* ── 二、否决二：少于两行 ───────────────────────────────────────────── */

组("二、否决二：少于两行");

测("⚠️ 一行东西一律不算——再高的分也救不回", () => {
  // VMark 的 `codePaste` 也是这条（它的判据里写着 `行数 < 2 → 放弃`）。
  等(像代码("pip install notion-client"), false, "一行命令");
  等(像代码("SELECT * FROM users WHERE id = 1;"), false, "一行 SQL");
  等(像代码("#!/usr/bin/env python3"), false, "光一个 shebang");
  等(像代码("git commit -m \"fix\""), false, "一行 git");
});

测("空行不算行（去掉空行之后数）", () => {
  等(像代码("pip install x\n\n\n   \n"), false, "一行 + 一堆空行");
});

测("空串 / 全是空白不算", () => {
  等(像代码(""), false, "空串");
  等(像代码("   \n\t\n"), false, "全空白");
});

/* ── 三、打分：真代码要认得出来 ─────────────────────────────────────── */

组("三、打分");

测("几行英文命令算代码", () => {
  等(像代码("git add .\ngit commit -m \"x\"\ngit push"), true, "三行命令");
});

测("一段 C 算代码", () => {
  等(
    像代码('#include <stdio.h>\n\nint main(void) {\n  printf("hi\\n");\n  return 0;\n}'),
    true,
    "C",
  );
});

测("一段 Python 算代码", () => {
  等(像代码("def add(a, b):\n    return a + b"), true, "Python");
});

测("一份 JSON 算代码", () => {
  等(像代码('{\n  "name": "nota",\n  "version": "1.0.0"\n}'), true, "JSON");
});

测("⚠️ 两行普通英文正文不算代码", () => {
  // ⚠️ 这条最容易失守：行数够了，但一条信号都不该命中。
  等(像代码("The quick brown fox jumps over the lazy dog.\nIt was a dark night."), false, "英文正文");
});

测("⚠️ 以 `go` / `make` 开头的英文句子不算代码", () => {
  // ⚠️ 命令行那条判据**按行计分**（三次就够 60 分），所以词表必须收窄：
  // `go` / `make` / `node` 都是常见的英文句子开头，收进去这三行就成代码块了。
  等(
    像代码("go to the store and buy some milk\nmake sure you lock the door\nnpm"),
    false,
    "英文散文撞上命令行判据",
  );
});

测("三行以上命令行算代码（按行计分，不是「一行数不到就放弃」）", () => {
  等(像代码("git add .\ngit commit -m x\ngit push origin main") , true, "三行 git");
  等(像代码("npm install\nnpm run build\nnpm test\nnpm run lint"), true, "四行 npm");
});

/* ── 四、按扩展名推语言 ─────────────────────────────────────────────── */

组("四、按扩展名推语言");

测("常见的几种", () => {
  等(按扩展名推语言("a/b/c.py"), "python", ".py");
  等(按扩展名推语言("c.ts"), "typescript", ".ts");
  等(按扩展名推语言("d.rs"), "rust", ".rs");
  等(按扩展名推语言("e.md"), "markdown", ".md");
});

测("大小写不影响", () => {
  等(按扩展名推语言("A.PY"), "python", "大写扩展名");
});

测("Windows 那种反斜杠路径也认", () => {
  等(按扩展名推语言("C:\\src\\main.go"), "go", "反斜杠");
});

测("⚠️ 取的是**最后一段**（`foo.js.txt` 是文本）", () => {
  等(按扩展名推语言("foo.js.txt"), "txt" in 扩展名表 ? "txt" : null, "双扩展名");
  等(按扩展名推语言("数据.csv"), "csv", "中文名 + csv");
});

测("没有扩展名的按整名查（Makefile / Dockerfile / .gitignore）", () => {
  等(按扩展名推语言("Makefile"), "makefile", "Makefile");
  等(按扩展名推语言("dir/Dockerfile"), "dockerfile", "Dockerfile");
  等(按扩展名推语言(".gitignore"), "gitignore", ".gitignore");
});

测("认不出来的给 null（不瞎猜）", () => {
  等(按扩展名推语言("a.zzzz"), null, "未知扩展名");
  等(按扩展名推语言("没有扩展名"), null, "中文文件名");
  等(按扩展名推语言(""), null, "空串");
});

测("⚠️ `.v` 归 Verilog 不归 V 语言（表里刻意只留一条）", () => {
  等(按扩展名推语言("counter.v"), "verilog", ".v");
});

/* ── 五、按内容猜语言 ───────────────────────────────────────────────── */

组("五、按内容猜语言");

测("看头几行的特征", () => {
  等(按内容猜语言('<?php\necho "hi";'), "php", "PHP");
  等(按内容猜语言("<!DOCTYPE html>\n<html></html>"), "html", "HTML");
  等(按内容猜语言("#!/bin/bash\necho hi"), "bash", "shebang bash");
  等(按内容猜语言("#!/usr/bin/env python3\nprint(1)"), "python", "shebang python");
  等(按内容猜语言("package main\n\nfunc main() {}"), "go", "Go");
  等(按内容猜语言("fn main() {\n    println!(\"hi\");\n}"), "rust", "Rust");
  等(按内容猜语言("SELECT id FROM users;"), "sql", "SQL");
});

测("认不出来给 null", () => {
  等(按内容猜语言("The quick brown fox.\nNothing to see here."), null, "英文正文");
});

/* ── 六、按文件名线索 ───────────────────────────────────────────────── */

组("六、按文件名线索");

测("开头注释里写着文件名，就按那个扩展名推", () => {
  等(按文件名线索("// utils/helper.ts\nconsole.log(1);"), "typescript", "`//` 注释");
  等(按文件名线索("# scripts/build.py\nprint(1)"), "python", "`#` 注释");
  等(按文件名线索("<!-- index.html -->\n<div></div>"), "html", "HTML 注释");
});

测("没有线索给 null", () => {
  等(按文件名线索("console.log(1);\nconsole.log(2);"), null, "没有文件名");
});

测("⚠️ 只认**前几行**（线索行数之外不算）", () => {
  const 文 = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n") + "\n// 最后一行才写 a.ts";
  等(按文件名线索(文), null, "线索在第十二行");
});

/* ── 七、两个入口合起来（优先级链）────────────────────────────────── */

组("七、猜代码语言（两个入口的优先级）");

测("文件名线索优先于内容判据", () => {
  // ⚠️ 顺序反了的症状：一份开头写着 `// a.py` 的 TypeScript 被染成 Python 色。
  等(猜代码语言("// a.py\nconst x: number = 1;"), "python", "文件名线索赢");
});

测("没有文件名线索时按内容猜", () => {
  等(猜代码语言("def f():\n    return 1"), "python", "内容");
});

测("⚠️ 两个都认不出来时给**空串**（不是 null）", () => {
  // ⚠️ `code_block` 的 `language` 默认就是 `""`，所以"猜不出"的落点必须是空串。
  等(猜代码语言("hello world\nsecond line"), "", "认不出");
});

/* ── 八、装配：表里的 id 在 refractor 里真的存在 ───────────────────── */

组("八、⚠️ 表里的语言 id 必须真的存在（改表之后重跑这一组）");

测("`扩展名表` 里每一个值都是 refractor 认得的语言 id", () => {
  // ⚠️ 这一条**只能这么写**：`refractor` 找不到语言时**不报错**，
  // 它原样输出——所以"表里写了个拼错的语言名"在屏幕上的表现是
  // **"这个功能没生效"**，而那是所有 bug 里最难查的一类。
  const 认得的 = new Set(refractor.listLanguages());
  const 坏的: string[] = [];
  for (const [扩展名, 语言] of Object.entries(扩展名表)) {
    if (!认得的.has(语言)) 坏的.push(`.${扩展名} → ${语言}`);
  }
  if (坏的.length) {
    throw new Error(`有 ${坏的.length} 条指向 refractor 不认识的语言：\n      ${坏的.join("\n      ")}`);
  }
});

测("内容判据给出来的每一个答案也在 refractor 里", () => {
  const 认得的 = new Set(refractor.listLanguages());
  const 样本 = [
    '<?php echo 1;',
    "<!DOCTYPE html><html></html>",
    "#!/bin/bash\necho hi",
    "package main\nfunc main() {}",
    "fn main() {}",
    "SELECT a FROM b;",
    "def f():\n  pass",
    "public class A {}",
    "using System;\nclass A {}",
    "#include <stdio.h>",
    "import std;\nint main() {}",
    '{"a": 1}',
    "key: value\nother: 2",
    "body { color: red; }",
    "const a = 1;\nfunction b() {}",
    "x = 1\ny = 2\nputs x + y",
    "sub f { my $x = 1; }",
    "local x = 1\nprint(x)",
    "(defun f (x) x)",
    "module Main where\nimport Data.List",
    "-----BEGIN PGP\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b",
    "@startuml\nA -> B\n@enduml",
    "graph TD;\nA-->B;",
  ];
  const 坏的: string[] = [];
  for (const 文 of 样本) {
    const 语言 = 按内容猜语言(文);
    if (语言 !== null && !认得的.has(语言)) 坏的.push(`${JSON.stringify(文.slice(0, 20))} → ${语言}`);
  }
  if (坏的.length) throw new Error(`有 ${坏的.length} 条指向不认识的语言：\n      ${坏的.join("\n      ")}`);
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
