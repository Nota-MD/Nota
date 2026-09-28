/**
 * **猜这段代码是什么语言**。两个入口：
 *
 * | 入口 | 用户原话 | 什么时候用 |
 * |---|---|---|
 * | {@link 按扩展名推语言} | 「按文件名推高亮语言」 | 出处是**一个路径**时（粘贴的代码第一行写着文件名、拖进来的文件） |
 * | {@link 按内容猜语言} | 「粘贴代码 → 认语言包成代码块」 | 只有正文，没有文件名 |
 *
 * # 三条口径
 *
 * 1. **判据全是纯函数**，不碰文档、不碰 DOM。落地那一步在 `editor/paste.ts`，
 *    测试（`tests/lang-guess.test.ts`）只用这一层。
 * 2. **猜错方向的代价不对称**，所以阈值往"不猜"那一边压：
 *    猜不出来 ⇒ 建一个**没有语言**的代码块（Prism 不着色，但那仍然是代码块，
 *    用户点一下选择器就能自己挑）；猜错了 ⇒ 一段文字被染成八种颜色，
 *    用户得先搞明白"这颜色是哪来的"。**所以宁可猜不出。**
 * 3. **表里只放 `refractor` 真的认识的语言 id**。写错一个的后果**不报错**——
 *    Prism 找不到语言就原样输出，看起来像"这个功能没生效"，而不是像 bug。
 *    所以每一条都对着 `refractor/lib/all.js` 那份 400 个的清单核过
 *    （核法见 `docs/06`，改表之后要重跑 `tests/lang-guess.test.ts` 第九组）。
 *
 * # 已知边界（如实记着）
 *
 * - ⚠️ **`zsh` / `fish` / `vue` / `svelte` 在 refractor 里没有独立的 id**
 *   （400 个里没有），分别归到 `bash` 与 `markup`。这是**降级**不是等价，
 *   如实写在这里。
 * - ⚠️ **`按内容猜语言` 只看前 40 行**：一份几万行的代码，特征（`#!/`、
 *   `package main`、`def `）几乎总在开头；扫全文的代价（粘贴那一刻要卡一下）
 *   换不来更多准确率。
 * - ⚠️ **它不判"这是不是代码"**——那是 `editor/paste.ts` 的 {@link 像代码}
 *   那一步的事，而且**先判它**：不是代码就压根不走这里（否则一段散文会被
 *   猜成 `log` 或者 `text`）。
 */

/**
 * **扩展名 → 语言 id**。
 *
 * 键一律**小写、不带点**。⚠️ 一个扩展名只能有一条——表里有重复键时后面那条
 * 会静默盖掉前面那条（TS 的 `Record<string, string>` 字面量里重复键**是报错的**，
 * 所以这一点靠编译器兜着，不必自己盯）。
 */
export const 扩展名表: Readonly<Record<string, string>> = {
  /* 脚本语言 */
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  py: "python",
  pyw: "python",
  pyi: "python",
  rb: "ruby",
  rake: "ruby",
  gemfile: "ruby",
  php: "php",
  pl: "perl",
  pm: "perl",
  lua: "lua",
  r: "r",
  jl: "julia",
  tcl: "tcl",
  awk: "awk",
  groovy: "groovy",
  gradle: "gradle",
  dart: "dart",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sc: "scala",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hrl: "erlang",
  hs: "haskell",
  elm: "elm",
  ml: "ocaml",
  mli: "ocaml",
  fs: "fsharp",
  fsx: "fsharp",
  nim: "nim",
  zig: "zig",
  odin: "odin",
  cr: "crystal",
  sol: "solidity",
  cypher: "cypher",
  gd: "gdscript",

  /* 编译型 */
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  cxxm: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  ipp: "cpp",
  ino: "arduino",
  cs: "csharp",
  java: "java",
  go: "go",
  rs: "rust",
  m: "objectivec",
  mm: "objectivec",
  pas: "pascal",
  pp: "pascal",
  f: "fortran",
  f90: "fortran",
  f95: "fortran",
  cob: "cobol",
  bas: "basic",
  vb: "vbnet",
  vba: "vbnet",
  asm: "nasm",
  s: "nasm",

  /* 硬件描述 */
  vhd: "vhdl",
  vhdl: "vhdl",
  v: "verilog",
  sv: "verilog",
  svh: "verilog",
  glsl: "glsl",
  frag: "glsl",
  vert: "glsl",
  hlsl: "hlsl",
  wgsl: "wgsl",

  /* 网页 / 模板 */
  html: "html",
  htm: "html",
  xhtml: "html",
  vue: "markup",
  svelte: "markup",
  xml: "xml",
  xsl: "xml",
  xslt: "xml",
  rss: "xml",
  atom: "xml",
  plist: "xml",
  svg: "svg",
  mathml: "mathml",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  styl: "stylus",
  cshtml: "cshtml",
  razor: "cshtml",
  ejs: "ejs",
  erb: "erb",
  hbs: "handlebars",
  handlebars: "handlebars",
  mustache: "mustache",
  twig: "twig",
  jinja: "jinja2",
  jinja2: "jinja2",
  j2: "jinja2",
  liquid: "liquid",
  pug: "pug",
  jade: "pug",
  haml: "haml",
  njk: "jinja2",

  /* 数据与配置 */
  json: "json",
  jsonc: "json",
  json5: "json5",
  webmanifest: "webmanifest",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "properties",
  env: "bash",
  csv: "csv",
  tsv: "csv",
  hcl: "hcl",
  tf: "hcl",
  tfvars: "hcl",
  nix: "nix",

  /* 查询 */
  sql: "sql",
  pgsql: "sql",
  mysql: "sql",
  plsql: "plsql",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  promql: "promql",

  /* 文档 / 标记 */
  md: "markdown",
  markdown: "markdown",
  mdown: "markdown",
  mkd: "markdown",
  rst: "rest",
  adoc: "asciidoc",
  asciidoc: "asciidoc",
  tex: "latex",
  latex: "latex",
  sty: "latex",
  cls: "latex",
  bib: "latex",
  wiki: "wiki",
  org: "markdown",

  /* 构建 / 运维 / 工具 */
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ksh: "bash",
  fish: "bash",
  bashrc: "bash",
  zshrc: "bash",
  ps1: "powershell",
  psm1: "powershell",
  bat: "batch",
  cmd: "batch",
  mk: "makefile",
  makefile: "makefile",
  cmake: "cmake",
  dockerfile: "dockerfile",
  dockerignore: "ignore",
  gitignore: "gitignore",
  npmignore: "ignore",
  editorconfig: "editorconfig",
  vim: "vim",
  vimrc: "vim",
  nginx: "nginx",
  service: "systemd",
  timer: "systemd",
  diff: "diff",
  patch: "diff",
  regex: "regex",
  mermaid: "mermaid",
  mmd: "mermaid",
  puml: "plantuml",
  plantuml: "plantuml",
  sln: "solution-file",
  ipynb: "json",
  log: "log",
};

/**
 * **路径 → 语言 id**；认不出来给 `null`。
 *
 * 三种输入都吃：`a/b/c.py`、`c.py`、`py`（光一个扩展名）。
 *
 * ⚠️ 取的是**最后一段**（`path.py.txt` 按 `.txt` 算）：真实世界里
 * `foo.js.txt` 是"一个叫 foo.js 的纯文本"，它该按 `txt` 走。
 * ⚠️ **没有扩展名的文件按整名查一次**（`Makefile` / `Dockerfile` / `.gitignore`
 * 都没有点），这是这张表里 `makefile` / `dockerfile` / `gitignore` 那几行
 * 唯一的入口。
 * ⚠️ 名字里**带点的整名**（`.gitignore`）也走前面那条：`按扩展名查` 会先试
 * 整名、再试最后一段，顺序不能反——反了 `.gitignore` 会落到一个"扩展名
 * `gitignore`"的怪路上（那条恰好也存在，所以看不出来，但 `Makefile` 就露馅）。
 */
export function 按扩展名推语言(路径: string): string | null {
  // 路径分隔符两种都认（用户在别的系统上拷过来的路径照样能认）。
  const 名 = 路径.trim().split(/[/\\]/).pop() ?? "";
  if (名 === "") return null;
  const 小写名 = 名.toLowerCase();
  // ① 整名（`makefile` / `dockerfile` / `.gitignore` / `dockerfile.dev` 不算）
  const 整 = 扩展名表[小写名];
  if (整) return 整;
  // ② 最后一段（`.gitignore` 那类"点开头、没别的点"的名字这里会切出
  //    `gitignore`，与 ① 的结果一样，所以两条都留着不冲突）
  const 点 = 小写名.lastIndexOf(".");
  if (点 < 0) return null;
  return 扩展名表[小写名.slice(点 + 1)] ?? null;
}

/* ── 按内容猜 ─────────────────────────────────────────────────────────── */

/**
 * 「这段文字看着像代码吗」。
 *
 * ⚠️⚠️ **这是本文件最容易伤到人的一条判据**，因为它决定了"用户粘进来的
 * 一段东西会不会变成一个代码块"。所以它是**打分制 + 一条否决**，
 * 而不是"命中一条就算"：
 *
 * - **否决**：CJK 字符占到非空白字符的两成以上，或者带中文句读（`。，！？；：`）
 *   ⇒ 一律**不是代码**。中文散文里出现几个英文单词、几个括号太常见了。
 * - **打分**：下面那张 {@link 代码信号} 表里每命中一条加分，
 *   {@link 代码阈值} 分以上才算。⚠️ **往下调阈值之前先想清楚**：调低会让
 *   "一段夹着 `()` 的中文"变成代码块，而那个毛病用户根本猜不到原因。
 * - **少于两行**（去掉空行之后）**一律不算**：一行东西既可能是
 *   `pip install x`，也可能是 `git commit -m "x"`，而它出现在正文里的概率
 *   远高于"用户想把它变成一个代码块"。⚠️ 这条比"打分不够"更硬——**再高的分
 *   也救不回一行**。VMark 的 `codePaste` 也是这一条（它的判据里写着
 *   `行数 < 2 → 放弃`），本仓独立选到同一条路上。
 */
export function 像代码(文: string): boolean {
  const 行 = 文.split(/\r\n?|\n/).filter((l) => l.trim() !== "");
  if (行.length < 2) return false;
  // ── 否决：中文正文
  const 非空白 = 文.replace(/\s/g, "");
  if (非空白.length === 0) return false;
  const 汉字 = (非空白.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  if (汉字 / 非空白.length >= 0.2) return false;
  if (/[。，！？；：、「」『』（）]/.test(文)) return false;

  return 计分(文) >= 代码阈值;
}

/**
 * 按 {@link 代码信号} 那张表打分。
 *
 * ⚠️ **带 `g` 的判据按"命中几次"算**（最多 {@link 重复计分上限} 次），
 * 其余的命中就算一次。⚠️ 不能用 `判据.test()` 去数带 `g` 的那种：`test` 会
 * 改 `lastIndex`，同一个正则第二次调用从上次的位置接着找——那种"跑第一次
 * 对、跑第二次错"的毛病是最难查的一类。所以带 `g` 的一律走 `match`。
 */
function 计分(文: string): number {
  let 分 = 0;
  for (const [判据, 加] of 代码信号) {
    if (!判据.global) {
      if (判据.test(文)) 分 += 加;
      continue;
    }
    const 次 = 文.match(判据)?.length ?? 0;
    分 += 加 * Math.min(次, 重复计分上限);
  }
  return 分;
}

/**
 * 打分表。⚠️ **分值是有讲究的**：一条"只可能出现在代码里"的特征
 * （shebang、`<?php`、`#include`）值 80 分，**一条就能过阈值**；
 * 一条"散文里也偶尔有"的特征（缩进、括号）只值 25–30 分，要几条凑一起。
 */
const 代码信号: readonly (readonly [RegExp, number])[] = [
  [/^#![^\n]*\/(?:ba|z|k)?sh/, 90], // shebang
  [/^#![^\n]*python/, 90],
  [/<\?php/, 90],
  [/^#\s*include\s*[<"]/m, 80], // C 的头文件
  [/^using\s+namespace\s+\w+;/m, 70],
  [/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+TABLE)\b[\s\S]*\bFROM\b/im, 70],
  [/<!DOCTYPE\s+html/i, 70],
  [/<\/[a-z][\w-]*>\s*$/m, 45], // 成对的 HTML 闭合标签
  [/^(?:package|module)\s+[\w.]+$/m, 45], // Go / Ruby
  [/^pub\s+(?:fn|struct|enum)\s/m, 60], // Rust
  [/^fn\s+\w+\s*\(/m, 55],
  [/^(?:def|class)\s+\w+[^\n]*:\s*$/m, 55], // Python
  [/^\s*(?:function|const|let|var|import|export)\s/m, 40], // JS/TS
  [/^\s*(?:public|private|protected)\s+(?:static\s+)?[\w<>\[\]]+\s+\w+\s*\(/m, 55], // Java/C#
  [/^\s*(?:if|for|while|switch|return|try|catch)\b[^\n]*[{(:]/m, 30],
  [/^\s{2,}\S/m, 30], // 有缩进的行
  [/\t\S/, 20], // 制表符缩进（Word / 网页里几乎不会有）
  [/=>|->|::|\?\?|&&|\|\||!==|===/, 25],
  [/[{}];?\s*$/m, 30],
  [/(?:console\.log|fmt\.|System\.out\.|println!|printf|echo)\s*\(/m, 40],
  [/^\s*(?:import|from|require|use)\s+[\w{*]/m, 35],
  [/^\s*[\w-]+\s*:\s*[^\s]/m, 15], // `key: value`（YAML/JSON 也长这样）
  [/\$\w+|\w+\s*=\s*[^=]/, 20], // 赋值
  // 命令行。⚠️ 这两条带 `g`，**按命中行数算分**（见下面的 `计分`）——
  // 不带 `g` 的话"二十行命令"与"一行命令"同分，而 20 分一条永远到不了 60，
  // 于是"粘一段命令行"这件事**压根认不出来**。⚠️ 词表刻意收窄：`go` / `make` /
  // `node` 都是常见的英文句子开头（`go to the store` / `make sure`），
  // 收进来就会让"三行英文散文"拿到 60 分。
  [/^\s*(?:npm|npx|yarn|pnpm|cargo|pip|pip3|docker|kubectl|systemctl|git|brew|apt-get|apt|curl|wget|cmake|gradle|mvn)\s+\S+/gm, 20],
  [/^\s*\$\s+\S/m, 25], // 终端提示符
];

/**
 * 带 `g` 的信号**最多按几次**算分。
 *
 * ⚠️ 定 3 是"够用就停"：命令行那条值 20 分，三次刚好过 60 的线；再多也不加分，
 * 免得"一大段命令行"把分数堆到把旁边那条判据的权重差异淹掉。
 */
const 重复计分上限 = 3;

/**
 * 及格线。⚠️ 定在 60 是照下面这两个真实样本量的：
 *
 * ```
 * function hello() {          ← function(40) + `{`行尾(30) + 缩进(30) + log(40) = 140 ✓
 *   console.log("hi");
 * }
 * ```
 *
 * ```
 * 今天我们去公园。             ← 否决（中文句读）
 * ```
 *
 * ⚠️ **改动这个数之前先跑 `tests/lang-guess.test.ts` 第三组**——那一组里
 * 正反两面的样本（散文、命令行、真的代码）就是照这个数配的。
 */
const 代码阈值 = 60;

/**
 * **按内容猜语言**；猜不出给 `null`（调用方据此建一个"没有语言"的代码块）。
 *
 * ⚠️ **只看前 {@link 取样行数} 行**（理由在文件头最后一条）。
 * ⚠️ **顺序有讲究**：先判那些"长相独一无二"的（shebang / `<?php` / DOCTYPE），
 * 再判语族。反过来的话，一段 Python 里出现的 `<` 会被当成 HTML。
 */
export function 按内容猜语言(文: string): string | null {
  const 样本 = 文.split(/\r\n?|\n/).slice(0, 取样行数).join("\n");
  for (const [判据, 语言] of 内容判据) if (判据.test(样本)) return 语言;
  return null;
}

/** 只看前这么多行（见 {@link 按内容猜语言} 的说明）。 */
const 取样行数 = 40;

/**
 * 内容判据表。**顺序即优先级**（先中者赢）。
 *
 * ⚠️ 每一条的正则都要"独占一行"或"带足够上下文"，否则会互相抢——
 * 比如 `/def /` 用不加锚点的写法会把 `define` 也吃掉。
 */
const 内容判据: readonly (readonly [RegExp, string])[] = [
  [/^#![^\n]*\b(?:python[23]?)\b/m, "python"],
  [/^#![^\n]*\b(?:ba|z|k)?sh\b/m, "bash"],
  [/^#![^\n]*\bnode\b/m, "javascript"],
  [/^#![^\n]*\bruby\b/m, "ruby"],
  [/^#![^\n]*\bperl\b/m, "perl"],
  [/^#![^\n]*\b(?:deno|bun)\b/m, "typescript"],
  [/<\?php/, "php"],
  [/<!DOCTYPE\s+html/i, "html"],
  [/^#\s*include\s*[<"]/m, "c"],
  [/^\s*(?:template\s*<|std::|using\s+namespace)/m, "cpp"],
  [/^\s*(?:public\s+)?(?:static\s+)?class\s+\w+[\s\S]*?\{/m, "java"],
  [/^\s*(?:using\s+System;|namespace\s+[\w.]+)/m, "csharp"],
  [/^\s*fn\s+\w+|^\s*(?:pub\s+)?(?:fn|struct|enum|impl)\s/m, "rust"],
  [/^\s*package\s+main\b|^\s*func\s+\w+\s*\(/m, "go"],
  [/^\s*(?:def|class)\s+\w+[\s\S]*?:\s*$/m, "python"],
  [/^\s*from\s+[\w.]+\s+import\s|^\s*import\s+(?:os|sys|re|json)\b/m, "python"],
  [/^\s*(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE)\b/im, "sql"],
  [/^\s*\[(?:server|database|mysqld|nginx)\]/m, "ini"],
  [/^\s*\{\s*"(?:name|version|dependencies|scripts)"\s*:/m, "json"],
  [/^\s*(?:apiVersion|kind):\s/m, "yaml"],
  [/^\s*---\s*$[\s\S]*?^\s*[\w-]+:\s/m, "yaml"],
  [/^\s*package\s+[\w.]+\s*;?\s*$/m, "java"],
  [/^\s*(?:<html|<div|<span|<table|<p\b)/i, "html"],
  [/^\s*[:.#][\w-]+\s*\{[^}]*\}/m, "css"],
  [/^\s*(?:export|import)\s+[\s\S]*?\bfrom\s+['"]/m, "javascript"],
  [/^\s*(?:const|let|var)\s+\w+\s*=\s*(?:require|function|\(|async|\[|\{)/m, "javascript"],
  [/^\s*interface\s+\w+\s*\{|^\s*type\s+\w+\s*=/m, "typescript"],
  [/^\s*(?:#include|module)\b/m, "ruby"],
  [/\bputs\s+['"]|^\s*end\s*$/m, "ruby"],
  [/^\s*\$[a-zA-Z_]\w*\s*=/m, "php"],
  [/^\s*use\s+strict;|^\s*my\s+[$@%]\w+/m, "perl"],
  [/^\s*local\s+\w+\s*=|^\s*function\s+\w+\s*\(\s*\)\s*$/m, "lua"],
  [/^\s*\(defun\s|^\s*\(ns\s/m, "lisp"],
  [/^\s*\(ns\s|^\s*\(defn\s/m, "clojure"],
  [/^\s*\(define\s|^\s*\(lambda\s/m, "scheme"],
  [/^(?:module\s+\w+\s+where|import\s+Data\.)/m, "haskell"],
  [/^\s*Imports\s+\w+|^\s*Sub\s+\w+/m, "vbnet"],
  [/^\\documentclass|^\\begin\{document\}/m, "latex"],
  [/^\.PHONY:|^\t\$\(|\t@echo\s/m, "makefile"],
  [/^FROM\s+\S+|^RUN\s+/m, "dockerfile"],
  [/^\s*graph\s+(?:TD|LR|TB)\b|^\s*sequenceDiagram\b/m, "mermaid"],
  [/^\s*@startuml\b|^\s*class\s+\w+\s*\{/m, "plantuml"],
  [/\bdiff --git\b|^@@\s[-\d,]+ \+[-\d,]+ @@/m, "diff"],
];

/* ── 从文本里认文件名（比内容启发式准得多）──────────────────────────── */

/**
 * 从粘贴进来的代码**开头的注释**里认出文件名，再按扩展名定语言。
 *
 * 为什么值得单做一条：`// utils.ts` 这一行是**确定**的信息，而内容启发式
 * 只是概率。真实场景里"从编辑器里复制一段代码"常常把文件名注释一起带过来。
 *
 * 只扫**前 {@link 线索行数} 行**，且只认注释开头那几种写法
 * （`//` / `#` / `--` / `;` / `/*` / `<!--`）——不这么收紧的话，正文里随便
 * 一个 `a.b` 形状的词都会被抓成文件名。
 */
export function 按文件名线索(文: string): string | null {
  for (const 行 of 文.split(/\r\n?|\n/).slice(0, 线索行数)) {
    const 找 = /^\s*(?:\/\/+|#+|--+|;+|\/\*+|<!--+)\s*([A-Za-z0-9_][\w./-]*\.[A-Za-z0-9]{1,8})\b/.exec(行);
    if (!找) continue;
    const 语言 = 按扩展名推语言(找[1]!);
    if (语言) return 语言;
  }
  return null;
}

/** 找文件名线索只看开头这么多行。 */
const 线索行数 = 5;

/**
 * **三个入口合起来的那一个**：粘贴一段代码时用它。
 *
 * 顺序是"准的先用"：文件名线索 → 内容判据 → 空串（= 纯文本，不着色）。
 *
 * ⚠️ **它不管"这到底是不是代码"**（那是 {@link 像代码} 的事，在调用方）。
 * 分开的理由：`像代码` 是个**否决制**的判断（宁可说不是），而这里是
 * **排序制**的（给个最好的猜测），两者的口径正相反，混在一起两边都会写歪。
 */
export function 猜代码语言(文: string): string {
  return 按文件名线索(文) ?? 按内容猜语言(文) ?? "";
}
