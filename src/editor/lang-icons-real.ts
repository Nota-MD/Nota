/**
 * 语言图标里**真图**的那一半：把 `refractor` 的语言 id 翻成一张真的彩色图标。
 *
 * 用户 2026-09-26 的原话：「代码框语言图标只支持热门语言即可。但是要画真图标。
 * 可以从这里弄：https://github.com/vscode-icons/vscode-icons。」
 *
 * # 和 `lang-icon.ts` 的分工
 *
 * `lang-icon.ts` 是**兜底**：一个圆角小方块 + 语言的字母缩写 + 代表色，
 * 400 个语言 id 人人都有。本文件是**真图**：93 颗从 vscode-icons 搬来的
 * SVG，只覆盖"真有人写"的那些语言。`lang-icon.ts` 先问本文件，问不到才回落。
 *
 * 所以**本文件里少一个语言不是错**——400 个语言 id 里绝大多数一辈子不会有人
 * 在 Markdown 里贴一段，为它们各画一颗图不值得。判据写在下面 `图标组` 那里。
 *
 * # 图标文件本身在 `src/assets/lang-icons/`
 *
 * 93 个 `.svg`，**逐字节**从 vscode-icons 的 tag `v12.19.0` 搬来，由
 * `tools/fetch-lang-icons.sh` 抓取与核对（`--verify` 拿 `SHA256SUMS` 对账）。
 * 许可是 **MIT**，版权与许可正文见根目录 `THIRD-PARTY.md` §6。
 *
 * ⚠️ **那批文件不许改**（连"顺手调一下颜色"也不行）：它们能被一眼核对的前提
 * 就是"和上游那个 tag 一个字节不差"。要改长相就在**这一层**改（比如换一颗别的
 * 图标），或者换成 `lang-icon.ts` 那套自绘的徽章。
 *
 * ⚠️ 名字里的 `file_type_` 前缀是**上游的文件名**，照原样保留：这样"这个文件
 * 对应上游哪一个"不用查表，也让抓取脚本能原样重跑。
 *
 * # ⚠️ 为什么走 `background-image` 的 data URI，不是把 `<svg>` 插进 DOM
 *
 * 两条理由，任何一条都够：
 *
 * 1. **`id` 会撞。** 这批图里有好几份都定义了 `id="a"`（渐变的引用，
 *    `file_type_assembly.svg` / `file_type_bat.svg` / `file_type_cmake.svg` …都是）。
 *    一旦把 `<svg>` 直接内联进同一个文档，`url(#a)` 就可能解析到**另一个文件**
 *    定义的那个渐变上——症状是"某个语言的图标颜色莫名其妙像别的图标"，
 *    而且只在特定几个图标同时出现在屏幕上时才发作。
 *    **data URI 是一份独立的文档**，各文件的 `id` 互不相干，这个问题不存在。
 * 2. 语言下拉里一次要摆几十颗图。走 `createElementNS` 建 SVG 元素树，或者
 *    拼 `innerHTML`，都要为几十个受信任但仍是**外来的**字符串开一次口子；
 *    换成一颗 `<span>` 的 `background-image`，DOM 里一个字节的外来标记都没有。
 *
 * # 尺寸、颜色由 CSS 管
 *
 * 本文件只给"用哪张图"，怎么显示在 `src/styles/editor.css` 的
 * `.nota-lang-icon--logo` 那一条里（`background-size: contain`）。
 * ⚠️ 图标是**彩色**的，所以**不跟主题变**——和 `lang-icon.ts` 里那条
 * "徽章底色不跟主题变"是同一个道理；也**不要**拿 `mask-image` 去刷它的颜色，
 * 那会把 93 颗彩色 logo 全变成一片纯色（`src/assets/icons/` 那套界面图标
 * 才是走 mask 的，两者别混）。
 */

/**
 * 语言 id → 图标名（上游文件名的中段，即 `file_type_<这个名字>.svg`）。
 *
 * ⚠️ 一个图标一组、**不是**一个语言一行：上游只有一颗终端图（`shell`），
 * 而 `refractor` 把 `bash`/`sh`/`sh-session`… 拆成了六个 id；反过来的写法
 * 就要把同一颗图名抄六遍，抄错一个字母的症状是"那个语言悄悄回落成徽章"。
 *
 * 📌 导出只给 `tests/lang-icons.test.ts` 用（它拿真文件列表和真 prism id 对账）。
 */
export const 图标组: readonly { 图标: string; 语言: readonly string[] }[] = [
  /* ── Web 前端 ──────────────────────────────────────────────────────── */
  { 图标: "js", 语言: ["javascript", "js"] },
  { 图标: "typescript", 语言: ["typescript", "ts"] },
  { 图标: "reactjs", 语言: ["jsx"] },
  { 图标: "reactts", 语言: ["tsx"] },
  { 图标: "html", 语言: ["html", "markup"] },
  { 图标: "css", 语言: ["css"] },
  { 图标: "scss", 语言: ["scss"] },
  { 图标: "sass", 语言: ["sass"] },
  { 图标: "less", 语言: ["less"] },
  { 图标: "stylus", 语言: ["stylus"] },
  { 图标: "ejs", 语言: ["ejs"] },
  { 图标: "erb", 语言: ["erb"] },
  { 图标: "handlebars", 语言: ["handlebars", "hbs"] },
  { 图标: "mustache", 语言: ["mustache"] },
  { 图标: "jinja", 语言: ["jinja2", "django"] },
  { 图标: "twig", 语言: ["twig", "tt2"] },
  { 图标: "pug", 语言: ["pug"] },
  { 图标: "haml", 语言: ["haml"] },

  /* ── 数据 / 配置 ───────────────────────────────────────────────────── */
  { 图标: "json", 语言: ["json", "json5", "jsonp", "tsconfig"] },
  { 图标: "yaml", 语言: ["yaml", "yml"] },
  { 图标: "toml", 语言: ["toml"] },
  { 图标: "ini", 语言: ["ini", "editorconfig"] },
  { 图标: "xml", 语言: ["xml"] },
  { 图标: "svg", 语言: ["svg"] },
  { 图标: "excel", 语言: ["xls", "xlsx", "excel-formula"] },
  { 图标: "sql", 语言: ["sql", "plsql"] },
  { 图标: "graphql", 语言: ["graphql"] },
  { 图标: "protobuf", 语言: ["protobuf"] },
  { 图标: "diff", 语言: ["diff"] },
  { 图标: "http", 语言: ["http"] },
  { 图标: "rest", 语言: ["rest"] },

  /* ── 系统语言 ──────────────────────────────────────────────────────── */
  { 图标: "c", 语言: ["c"] },
  { 图标: "cpp", 语言: ["cpp"] },
  { 图标: "csharp", 语言: ["csharp", "cs"] },
  { 图标: "java", 语言: ["java"] },
  { 图标: "kotlin", 语言: ["kotlin", "kt", "kts"] },
  { 图标: "scala", 语言: ["scala"] },
  { 图标: "groovy", 语言: ["groovy"] },
  { 图标: "gradle", 语言: ["gradle"] },
  { 图标: "go", 语言: ["go", "go-mod", "go-module"] },
  { 图标: "rust", 语言: ["rust"] },
  { 图标: "swift", 语言: ["swift"] },
  { 图标: "objectivec", 语言: ["objectivec", "objc"] },
  { 图标: "zig", 语言: ["zig"] },
  { 图标: "nim", 语言: ["nim"] },
  { 图标: "crystal", 语言: ["crystal"] },
  { 图标: "dartlang", 语言: ["dart"] },
  { 图标: "vb", 语言: ["vb", "vbnet", "visual-basic"] },
  { 图标: "fsharp", 语言: ["fsharp"] },
  { 图标: "qsharp", 语言: ["qsharp"] },
  { 图标: "wasm", 语言: ["wasm"] },

  /* ── 脚本语言 ──────────────────────────────────────────────────────── */
  { 图标: "python", 语言: ["python", "py"] },
  { 图标: "ruby", 语言: ["ruby", "rb"] },
  { 图标: "php", 语言: ["php"] },
  { 图标: "perl", 语言: ["perl"] },
  { 图标: "lua", 语言: ["lua"] },
  { 图标: "r", 语言: ["r"] },
  { 图标: "julia", 语言: ["julia"] },
  { 图标: "matlab", 语言: ["matlab"] },
  { 图标: "awk", 语言: ["awk", "gawk"] },
  { 图标: "tcl", 语言: ["tcl"] },
  { 图标: "vim", 语言: ["vim"] },
  // ⚠️ `shell` 这一颗同时罩着 `bash`/`sh`/`shell`/`sh-session`… —— 上游只有
  //    一颗终端图，而 `refractor` 把它们拆成了好几个 id。别为它们各找一颗，
  //    找来的也是同一张。
  { 图标: "shell", 语言: ["bash", "sh", "shell", "shellsession", "shell-session", "sh-session"] },
  { 图标: "powershell", 语言: ["powershell"] },
  // ⚠️ 语言 id 是 `batch`，**不是** `bat`（`bat` 是上游的文件名）。写错了这一行
  //    就是"下拉里的 Windows 批处理永远没有图"，一句报错都没有——
  //    `tests/lang-icons.test.ts` 第三组拿真 `listLanguages()` 把这种错拦下来。
  { 图标: "bat", 语言: ["batch"] },

  /* ── 函数式 / 逻辑式 ───────────────────────────────────────────────── */
  { 图标: "haskell", 语言: ["haskell", "hs"] },
  { 图标: "clojure", 语言: ["clojure"] },
  { 图标: "lisp", 语言: ["lisp", "emacs", "emacs-lisp", "elisp"] },
  { 图标: "ocaml", 语言: ["ocaml"] },
  { 图标: "elm", 语言: ["elm"] },
  { 图标: "erlang", 语言: ["erlang"] },
  { 图标: "elixir", 语言: ["elixir"] },
  { 图标: "racket", 语言: ["racket", "rkt"] },
  { 图标: "prolog", 语言: ["prolog"] },
  { 图标: "ada", 语言: ["ada"] },

  /* ── 老牌 / 工业界 ─────────────────────────────────────────────────── */
  { 图标: "fortran", 语言: ["fortran"] },
  { 图标: "cobol", 语言: ["cobol"] },
  // ⚠️ 语言 id 里**没有** `assembly` 这个名——只有具体的几套汇编（`nasm`、
  //    `armasm`、`asm6502`、`arm-asm`）。所以这一组是"一颗图罩四个 id"，
  //    别照着图名去补一个 `"assembly"` 进来（那一条永远命中不了）。
  { 图标: "assembly", 语言: ["nasm", "armasm", "asm6502", "arm-asm"] },
  { 图标: "vhdl", 语言: ["vhdl"] },
  { 图标: "verilog", 语言: ["verilog"] },
  { 图标: "solidity", 语言: ["solidity"] },
  { 图标: "glsl", 语言: ["glsl"] },
  { 图标: "hlsl", 语言: ["hlsl"] },

  /* ── 文档 / 图表 ───────────────────────────────────────────────────── */
  { 图标: "markdown", 语言: ["markdown", "md"] },
  { 图标: "asciidoc", 语言: ["asciidoc", "adoc"] },
  { 图标: "tex", 语言: ["math", "latex", "tex"] },
  { 图标: "text", 语言: ["plaintext", "plain", "text", "txt"] },
  { 图标: "mermaid", 语言: ["mermaid"] },
  { 图标: "plantuml", 语言: ["plantuml", "plant-uml"] },

  /* ── 版本控制 / 服务 ───────────────────────────────────────────────── */
  { 图标: "git", 语言: ["git", "gitignore"] },
  { 图标: "docker", 语言: ["docker", "dockerfile"] },
  { 图标: "nginx", 语言: ["nginx"] },
  { 图标: "cmake", 语言: ["cmake"] },
];

/** 摊平后的查找表。语言 id 重复出现时**后写的赢**——`tests/lang-icons.test.ts` 会把重复拦下来。 */
const 语言到图标 = new Map<string, string>();
for (const { 图标, 语言 } of 图标组) {
  for (const id of 语言) 语言到图标.set(id, 图标);
}

/**
 * 这一门语言的**代表名**：同一个图标组里，取表里排第一的那个 id。
 *
 * ⚠️⚠️ 2026-10-16 加，修的是用户朋友报的那条「**代码块语言类型重复**」：
 * 那张下拉里 `arm-asm` 与 `armasm` 各占一行、`plaintext` / `plain` / `text` /
 * `txt` 四行、`markdown` / `md` 两行……而它们的图标**本来就是同一颗**
 * （这张表的每一组就是"同一门语言的不同写法"）。
 *
 * ⚠️ **组里的第一个就是代表**——这是这张表自己的约定（不是另写一张"谁是正名"
 * 的名单：那样两张表迟早对不上，而"对不上"的症状是下拉里又悄悄多出一行）。
 * 所以**往一个组里加 id 时，想清楚哪个该排第一**。
 *
 * ⚠️ 表里没有的 id 原样返回（它会落到"没有真图标"那一支，下拉里本来就不列）。
 */
export function 代表语言(id: string): string {
  const 组 = 图标组.find((g) => g.语言.includes(id));
  return 组 ? 组.语言[0]! : id;
}

/**
 * 这个语言有没有真图标？有就给图标名（`file_type_<它>.svg` 的中段），没有给 `null`。
 *
 * ⚠️ **纯查表**，不碰 `import.meta.glob`、不碰 DOM——`tests/lang-icons.test.ts`
 * 直接拿它写断言（那份测试在 `node` 里跑，没有 Vite 那套转换）。
 */
export function 图标名(语言: string): string | null {
  return 语言到图标.get(语言) ?? null;
}

/** 供测试遍历用（避免测试自己再解析一遍那张表）。 */
export function 全部图标名(): string[] {
  return [...new Set(图标组.map(({ 图标 }) => 图标))];
}

/**
 * 上游搬来的 SVG 原文，按**图标名**索引。
 *
 * ⚠️ `import.meta.glob` 是 **Vite 的编译期转换**，不是运行期的函数——所以：
 *
 * 1. 路径必须是**字面量**（拼出来的字符串它认不出来），这里写死成一条。
 * 2. 它被放进函数里**惰性求值**，而不是写在模块顶层。这不是为了省时间，
 *    是为了**让这个模块能在 `node` 里被 import**：`tests/lang-icons.test.ts`
 *    只碰上面那两张表，一旦顶层就调 `import.meta.glob`，`node` 会因为
 *    `import.meta.glob is not a function` 整份文件都加载不了——而那份测试
 *    要挡的正是"表里写了个没有对应文件的图标名"这种**静默回落**的坏法。
 * 3. `eager: true` 是**故意的**：93 颗图一起进 bundle（原图共约 193 KB），
 *    换来的是 `真图标URI()` 是同步的——下拉是同步建的，改成异步就要为
 *    "图标晚一拍才出现"再写一套重绘逻辑，为这点体积不值得。
 */
let 原文缓存: Record<string, string> | null = null;
function 全部原文(): Record<string, string> {
  if (原文缓存 === null) {
    原文缓存 = import.meta.glob("../assets/lang-icons/file_type_*.svg", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
  }
  return 原文缓存;
}

// ⚠️ 下面这行拼出来的是 glob 的**键**（`import.meta.glob` 的键是"相对本文件的
//    路径"）。路径里那个 `../assets/` 与上面 `import.meta.glob` 那一行必须一致——
//    对不上的话每一颗图都取不到，症状是"全部回落成徽章"，且只在运行期看得出来。
let 报过缺文件 = false;

/**
 * 真正的入口：这个语言要画的图，写成 CSS `background-image` 的值；
 * 没有真图标时给 `null`（调用方回落首字母徽章）。
 *
 * ⚠️ 返回值**已经是一段 `url("…")`**，直接塞进 `style.backgroundImage` 就行。
 * 别在调用方再包一层引号。
 */
export function 真图标URI(语言: string): string | null {
  const 名 = 图标名(语言);
  if (名 === null) return null;

  const 原文 = 全部原文();
  let 图 = 原文[`../assets/lang-icons/file_type_${名}.svg`];

  if (图 === undefined && !报过缺文件) {
    // ⚠️ 这一条是"名字打错了"的**运行期**防线（另一半是
    //    `tests/lang-icons.test.ts` 拿真文件列表对账）。只报一次：这个函数
    //    每次开下拉都会跑几十遍。症状本身是静默的——回落成徽章，界面看着
    //    完全正常，只是那颗图永远不出现。
    报过缺文件 = true;
    console.warn(
      `[nota] 语言图标：表里写着 \`${名}\`（语言 id 之一：${找语言(名) ?? "?"}），` +
        `但 src/assets/lang-icons/file_type_${名}.svg 不在仓库里，这个语言会回落成首字母徽章。` +
        `表在 src/editor/lang-icons-real.ts，抓图的脚本是 tools/fetch-lang-icons.sh。`,
    );
    return null;
  }
  if (图 === undefined) return null;

  // ⚠️ `encodeURIComponent` 是这里唯一安全的编码方式：它会把 `#`（在 URL 里
  //    是片段分隔符）、`<`、`>`、`"` 全部转义掉，于是外面那对双引号里不可能
  //    出现一个没转义的引号把 `url(...)` 提前收尾。
  //    不加 `;base64`：`\n` 之外它几乎不省体积，可读性却差一大截（调试时
  //    想眼看一遍某颗图的源码就没法看了）。
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(图)}")`;
}

/** 反查：这个图标名是给哪个语言 id 用的（只为上面那条警告里能报个人话）。 */
function 找语言(图标: string): string | null {
  for (const [id, 名] of 语言到图标) if (名 === 图标) return id;
  return null;
}
