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
export const iconGroup: readonly { icon: string; language: readonly string[] }[] = [
  /* ── Web 前端 ──────────────────────────────────────────────────────── */
  { icon: "js", language: ["javascript", "js"] },
  { icon: "typescript", language: ["typescript", "ts"] },
  { icon: "reactjs", language: ["jsx"] },
  { icon: "reactts", language: ["tsx"] },
  { icon: "html", language: ["html", "markup"] },
  { icon: "css", language: ["css"] },
  { icon: "scss", language: ["scss"] },
  { icon: "sass", language: ["sass"] },
  { icon: "less", language: ["less"] },
  { icon: "stylus", language: ["stylus"] },
  { icon: "ejs", language: ["ejs"] },
  { icon: "erb", language: ["erb"] },
  { icon: "handlebars", language: ["handlebars", "hbs"] },
  { icon: "mustache", language: ["mustache"] },
  { icon: "jinja", language: ["jinja2", "django"] },
  { icon: "twig", language: ["twig", "tt2"] },
  { icon: "pug", language: ["pug"] },
  { icon: "haml", language: ["haml"] },

  /* ── 数据 / 配置 ───────────────────────────────────────────────────── */
  { icon: "json", language: ["json", "json5", "jsonp", "tsconfig"] },
  { icon: "yaml", language: ["yaml", "yml"] },
  { icon: "toml", language: ["toml"] },
  { icon: "ini", language: ["ini", "editorconfig"] },
  { icon: "xml", language: ["xml"] },
  { icon: "svg", language: ["svg"] },
  { icon: "excel", language: ["xls", "xlsx", "excel-formula"] },
  { icon: "sql", language: ["sql", "plsql"] },
  { icon: "graphql", language: ["graphql"] },
  { icon: "protobuf", language: ["protobuf"] },
  { icon: "diff", language: ["diff"] },
  { icon: "http", language: ["http"] },
  { icon: "rest", language: ["rest"] },

  /* ── 系统语言 ──────────────────────────────────────────────────────── */
  { icon: "c", language: ["c"] },
  { icon: "cpp", language: ["cpp"] },
  { icon: "csharp", language: ["csharp", "cs"] },
  { icon: "java", language: ["java"] },
  { icon: "kotlin", language: ["kotlin", "kt", "kts"] },
  { icon: "scala", language: ["scala"] },
  { icon: "groovy", language: ["groovy"] },
  { icon: "gradle", language: ["gradle"] },
  { icon: "go", language: ["go", "go-mod", "go-module"] },
  { icon: "rust", language: ["rust"] },
  { icon: "swift", language: ["swift"] },
  { icon: "objectivec", language: ["objectivec", "objc"] },
  { icon: "zig", language: ["zig"] },
  { icon: "nim", language: ["nim"] },
  { icon: "crystal", language: ["crystal"] },
  { icon: "dartlang", language: ["dart"] },
  { icon: "vb", language: ["vb", "vbnet", "visual-basic"] },
  { icon: "fsharp", language: ["fsharp"] },
  { icon: "qsharp", language: ["qsharp"] },
  { icon: "wasm", language: ["wasm"] },

  /* ── 脚本语言 ──────────────────────────────────────────────────────── */
  { icon: "python", language: ["python", "py"] },
  { icon: "ruby", language: ["ruby", "rb"] },
  { icon: "php", language: ["php"] },
  { icon: "perl", language: ["perl"] },
  { icon: "lua", language: ["lua"] },
  { icon: "r", language: ["r"] },
  { icon: "julia", language: ["julia"] },
  { icon: "matlab", language: ["matlab"] },
  { icon: "awk", language: ["awk", "gawk"] },
  { icon: "tcl", language: ["tcl"] },
  { icon: "vim", language: ["vim"] },
  // ⚠️ `shell` 这一颗同时罩着 `bash`/`sh`/`shell`/`sh-session`… —— 上游只有
  //    一颗终端图，而 `refractor` 把它们拆成了好几个 id。别为它们各找一颗，
  //    找来的也是同一张。
  { icon: "shell", language: ["bash", "sh", "shell", "shellsession", "shell-session", "sh-session"] },
  { icon: "powershell", language: ["powershell"] },
  // ⚠️ 语言 id 是 `batch`，**不是** `bat`（`bat` 是上游的文件名）。写错了这一行
  //    就是"下拉里的 Windows 批处理永远没有图"，一句报错都没有——
  //    `tests/lang-icons.test.ts` 第三组拿真 `listLanguages()` 把这种错拦下来。
  { icon: "bat", language: ["batch"] },

  /* ── 函数式 / 逻辑式 ───────────────────────────────────────────────── */
  { icon: "haskell", language: ["haskell", "hs"] },
  { icon: "clojure", language: ["clojure"] },
  { icon: "lisp", language: ["lisp", "emacs", "emacs-lisp", "elisp"] },
  { icon: "ocaml", language: ["ocaml"] },
  { icon: "elm", language: ["elm"] },
  { icon: "erlang", language: ["erlang"] },
  { icon: "elixir", language: ["elixir"] },
  { icon: "racket", language: ["racket", "rkt"] },
  { icon: "prolog", language: ["prolog"] },
  { icon: "ada", language: ["ada"] },

  /* ── 老牌 / 工业界 ─────────────────────────────────────────────────── */
  { icon: "fortran", language: ["fortran"] },
  { icon: "cobol", language: ["cobol"] },
  // ⚠️ 语言 id 里**没有** `assembly` 这个名——只有具体的几套汇编（`nasm`、
  //    `armasm`、`asm6502`、`arm-asm`）。所以这一组是"一颗图罩四个 id"，
  //    别照着图名去补一个 `"assembly"` 进来（那一条永远命中不了）。
  { icon: "assembly", language: ["nasm", "armasm", "asm6502", "arm-asm"] },
  { icon: "vhdl", language: ["vhdl"] },
  { icon: "verilog", language: ["verilog"] },
  { icon: "solidity", language: ["solidity"] },
  { icon: "glsl", language: ["glsl"] },
  { icon: "hlsl", language: ["hlsl"] },

  /* ── 文档 / 图表 ───────────────────────────────────────────────────── */
  { icon: "markdown", language: ["markdown", "md"] },
  { icon: "asciidoc", language: ["asciidoc", "adoc"] },
  { icon: "tex", language: ["math", "latex", "tex"] },
  { icon: "text", language: ["plaintext", "plain", "text", "txt"] },
  { icon: "mermaid", language: ["mermaid"] },
  { icon: "plantuml", language: ["plantuml", "plant-uml"] },

  /* ── 版本控制 / 服务 ───────────────────────────────────────────────── */
  { icon: "git", language: ["git", "gitignore"] },
  { icon: "docker", language: ["docker", "dockerfile"] },
  { icon: "nginx", language: ["nginx"] },
  { icon: "cmake", language: ["cmake"] },
];

/** 摊平后的查找表。语言 id 重复出现时**后写的赢**——`tests/lang-icons.test.ts` 会把重复拦下来。 */
const languageToIcon = new Map<string, string>();
for (const { icon, language } of iconGroup) {
  for (const id of language) languageToIcon.set(id, icon);
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
export function representTableLanguage(id: string): string {
  const group = iconGroup.find((g) => g.language.includes(id));
  return group ? group.language[0]! : id;
}

/**
 * 这个语言有没有真图标？有就给图标名（`file_type_<它>.svg` 的中段），没有给 `null`。
 *
 * ⚠️ **纯查表**，不碰 `import.meta.glob`、不碰 DOM——`tests/lang-icons.test.ts`
 * 直接拿它写断言（那份测试在 `node` 里跑，没有 Vite 那套转换）。
 */
export function iconName(language: string): string | null {
  return languageToIcon.get(language) ?? null;
}

/** 供测试遍历用（避免测试自己再解析一遍那张表）。 */
export function allIconNames(): string[] {
  return [...new Set(iconGroup.map(({ icon }) => icon))];
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
let sourceBufferSave: Record<string, string> | null = null;
function allSource(): Record<string, string> {
  if (sourceBufferSave === null) {
    sourceBufferSave = import.meta.glob("../assets/lang-icons/file_type_*.svg", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
  }
  return sourceBufferSave;
}

// ⚠️ 下面这行拼出来的是 glob 的**键**（`import.meta.glob` 的键是"相对本文件的
//    路径"）。路径里那个 `../assets/` 与上面 `import.meta.glob` 那一行必须一致——
//    对不上的话每一颗图都取不到，症状是"全部回落成徽章"，且只在运行期看得出来。
let reportPassMissingTextItem = false;

/**
 * 真正的入口：这个语言要画的图，写成 CSS `background-image` 的值；
 * 没有真图标时给 `null`（调用方回落首字母徽章）。
 *
 * ⚠️ 返回值**已经是一段 `url("…")`**，直接塞进 `style.backgroundImage` 就行。
 * 别在调用方再包一层引号。
 */
export function assertValueIconURI(language: string): string | null {
  const name3 = iconName(language);
  if (name3 === null) return null;

  const source = allSource();
  let image = source[`../assets/lang-icons/file_type_${name3}.svg`];

  if (image === undefined && !reportPassMissingTextItem) {
    // ⚠️ 这一条是"名字打错了"的**运行期**防线（另一半是
    //    `tests/lang-icons.test.ts` 拿真文件列表对账）。只报一次：这个函数
    //    每次开下拉都会跑几十遍。症状本身是静默的——回落成徽章，界面看着
    //    完全正常，只是那颗图永远不出现。
    reportPassMissingTextItem = true;
    console.warn(
      `[nota] 语言图标：表里写着 \`${name3}\`（语言 id 之一：${findLanguage(name3) ?? "?"}），` +
        `但 src/assets/lang-icons/file_type_${name3}.svg 不在仓库里，这个语言会回落成首字母徽章。` +
        `表在 src/editor/lang-icons-real.ts，抓图的脚本是 tools/fetch-lang-icons.sh。`,
    );
    return null;
  }
  if (image === undefined) return null;

  // ⚠️ `encodeURIComponent` 是这里唯一安全的编码方式：它会把 `#`（在 URL 里
  //    是片段分隔符）、`<`、`>`、`"` 全部转义掉，于是外面那对双引号里不可能
  //    出现一个没转义的引号把 `url(...)` 提前收尾。
  //    不加 `;base64`：`\n` 之外它几乎不省体积，可读性却差一大截（调试时
  //    想眼看一遍某颗图的源码就没法看了）。
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}")`;
}

/** 反查：这个图标名是给哪个语言 id 用的（只为上面那条警告里能报个人话）。 */
function findLanguage(icon: string): string | null {
  for (const [id, name3] of languageToIcon) if (name3 === icon) return id;
  return null;
}
