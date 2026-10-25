/**
 * 「关于 → 鸣谢」那一页的名单。
 *
 * # 2026-10-10 为什么从 `AboutDialog.tsx` 搬出来、又为什么长了一截
 *
 * 用户原话：「**另外，将 Codemirror 等引入的 BSD/MIT 库写入"鸣谢"**」。
 * 从前那一页只有八条，挑的是"用户看得见的那些"（Tauri / React / Milkdown /
 * KaTeX / Mermaid / mlua / 语言图标 / Pandoc），底下那句"完整清单在
 * `THIRD-PARTY.md`"2026-10-04 又按用户的口径删掉了（他嫌那种说明文字啰嗦）。
 * 于是**鸣谢页和 `THIRD-PARTY.md` 之间本来就没有桥**，用户点进去看到的是
 * 一份不完整的名单——CodeMirror 这种"整块功能是它做的"（代码块编辑器，
 * 2026-10-06 起）居然不在里面，这正是他这一句的由来。
 *
 * 现在这一份是**直接依赖里那些宽松许可的**（MIT / BSD / ISC / Apache-2.0 /
 * CDLA）：前端那份清单照 `package.json`，Rust 那份照 `src-tauri/Cargo.toml`，
 * 逐条对着 `THIRD-PARTY.md` §1 / §2 抄的——**两份必须同批改**，改了这边不改
 * 那边（或者反过来）就是"两份真相"，而这类东西漂开的症状是**没有人会发现**。
 *
 * ⚠️ **仍然不是"完整的传递依赖闭包"**（那是几百个包，`THIRD-PARTY.md` 的文件头
 * 写着怎么用工具跑）。这一页的判据是"**我们直接引的、宽松许可的**"，
 * 三个反例记在这里，别照着抄：
 *
 * - `ring` 虽然**不是**直接依赖（是 `ureq` 默认 feature 拖进来的），但它的
 *   许可证是 **AND 不是 OR**（Apache-2.0 ＋ ISC），整份清单里只有它这么写，
 *   所以单列（`THIRD-PARTY.md` §1 那张小表也是这么做的）；
 * - `webpki-roots` 同理，而且它是 **CDLA-Permissive-2.0**——看着像个 MIT 的小包，
 *   其实不是，也得单列；
 * - Pandoc 是 **GPL-2.0-or-later**，与 Nota 的 BSD-2 并存**只因为不分发它**
 *   （用户机器上装着才调一次命令行）。这一条必须留在名单里，而且要写明。
 *
 * # ⚠️ 写法：**函数，不是模块级常量**
 *
 * `t()` 要等语言定下来才有正确译文，而模块级求值时语言还没定、之后**没有任何
 * 东西会通知它重算**（同 `ui/pluginText.ts` 文件头那条）。所以这里收一个 `t`
 * 进来现调——而且每条 `用处` 都写成**字面量** `t("…")`：`tools/i18n-check.sh`
 * 只认这种写法（它靠 `t("…")` 的字面量扫键），换成变量拼进去的键会被算成
 * "中文表里有一条没人用的废键"，那条是**要 FAIL 的**。
 *
 * ⚠️ 名字照各项目自己的写法（`Tauri` 不是 `tauri`、`KaTeX` 不是 `katex`、
 * `CodeMirror` 没有空格）。许可那一列**不翻**：它是许可证的正式名称。
 */

/** 一条鸣谢。界面上画成"名字（外链）／用处／许可"三行。 */
export interface SendThanksItem {
  name3: string;
  purpose: string;
  link: string;
  license: string;
}

/**
 * 这一页要画的名单，顺序就是界面上的顺序。
 *
 * 分四段（骨架 → 编辑器 → 拓展与网络 → 数据与系统 → 外部程序），
 * 段与段之间**不留小标题**：GNOME 那个关于窗就没有，而多一行小标题会让人
 * 以为每一段可以单独折叠。
 */
export function sendThanksNameSingle(t: (key: string) => string): SendThanksItem[] {
  return [
    // ── 骨架：没有它们就没有这个程序 ────────────────────────────────
    {
      name3: "Tauri",
      purpose: t("Desktop shell and windows"),
      link: "https://github.com/tauri-apps/tauri",
      license: "Apache-2.0 OR MIT",
    },
    {
      name3: "React",
      purpose: t("Interface"),
      link: "https://github.com/facebook/react",
      license: "MIT",
    },
    // ── 编辑器：正文（所见即所得）与代码块（CodeMirror）────────────────
    {
      name3: "Milkdown / ProseMirror",
      purpose: t("Editor core"),
      link: "https://github.com/Milkdown/milkdown",
      license: "MIT",
    },
    {
      // 2026-10-06 起**代码块**由它编辑（`src/editor/code-block-cm.ts`）：
      // 缩进、括号配对、行内高亮都是它那几套。用户点名要补的就是这一条。
      name3: "CodeMirror",
      purpose: t("Code block editor"),
      link: "https://github.com/codemirror/dev",
      license: "MIT",
    },
    {
      // CodeMirror 的语法树那一层（`@lezer/highlight` 是我们直接引的）。
      name3: "Lezer",
      purpose: t("Syntax trees behind the code editor"),
      link: "https://github.com/lezer-parser/lezer",
      license: "MIT",
    },
    {
      // 所见即所得里代码块的高亮走 `@milkdown/plugin-prism`，它底下是 refractor
      // （Prism 那套语法表的移植）。
      name3: "Prism (refractor)",
      purpose: t("Syntax highlighting in the editor"),
      link: "https://github.com/wooorm/refractor",
      license: "MIT",
    },
    {
      name3: "mdast-util-math",
      purpose: t("Serialising math delimiters"),
      link: "https://github.com/syntax-tree/mdast-util-math",
      license: "MIT",
    },
    {
      name3: "KaTeX",
      purpose: t("Math typesetting"),
      link: "https://github.com/KaTeX/KaTeX",
      license: "MIT",
    },
    {
      // 「Nota」那三个字的字标（2026-10-16 用户点名：「文字徽标用"Nota"，
      // 字体是 Monoton……鸣谢里写一下徽标字体用的是这个」）。
      // ⚠️ **2026-10-17 起不再随包带字体**（用户：「最好不要搞任何随包字体……把这
      // 几个字换成 svg 就可以了」）：字形已经转成 `src/assets/nota-wordmark.svg` 的
      // **矢量轮廓**，仓库里没有 `.ttf` 了。这一行保留是 OFL 的出处要求。
      name3: "Monoton",
      purpose: t("The “Nota” wordmark (vector outlines — no font file is shipped)"),
      link: "https://fonts.google.com/specimen/Monoton",
      license: "OFL-1.1",
    },
    {
      // 2026-10-11 起**拼写检查的引擎**就是它（`src-tauri/src/spell/native.rs`）：
      // 纯 Rust 的 hunspell 实现，编进程序里。⚠️ 许可那一栏写 **Apache-2.0** 是
      // 照它仓库里那份 `LICENSE` 抄的——**不是**选型时拿到的第二手材料说的 MIT
      // （`THIRD-PARTY.md` §7.2 记着这笔更正）。
      name3: "zspell",
      purpose: t("Spell checking engine"),
      link: "https://github.com/pluots/zspell",
      license: "Apache-2.0",
    },
    {
      name3: "Mermaid",
      purpose: t("Diagrams"),
      link: "https://github.com/mermaid-js/mermaid",
      license: "MIT",
    },
    {
      // ⚠️ 这一条与别条不同：图标是**直接搬进仓库**的（`src/assets/lang-icons/`），
      // 不是"引了个依赖"——所以 MIT 要的那份版权声明必须随源码走，
      // 正文在 `THIRD-PARTY.md` §6。
      name3: "vscode-icons",
      purpose: t("Language icons for code blocks"),
      link: "https://github.com/vscode-icons/vscode-icons",
      license: "MIT",
    },

    // ── 拓展运行时，以及它要的那条网络与验签的路 ───────────────────────
    {
      name3: "mlua / Lua",
      purpose: t("Extension runtime"),
      link: "https://github.com/mlua-rs/mlua",
      license: "MIT",
    },
    {
      name3: "ureq",
      purpose: t("HTTP requests for extensions"),
      link: "https://github.com/algesten/ureq",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "rustls",
      purpose: t("TLS"),
      link: "https://github.com/rustls/rustls",
      license: "Apache-2.0 OR ISC OR MIT",
    },
    {
      name3: "ring",
      purpose: t("Cryptographic primitives"),
      link: "https://github.com/briansmith/ring",
      // ⚠️ **AND**，不是 OR：两份都得满足（`THIRD-PARTY.md` §1 那张小表）。
      license: "Apache-2.0 AND ISC",
    },
    {
      name3: "webpki-roots",
      purpose: t("Trusted root certificates"),
      link: "https://github.com/rustls/webpki-roots",
      // ⚠️ 这一条**不是** MIT/Apache：一个"数据许可"，要求保留出处。
      license: "CDLA-Permissive-2.0",
    },
    {
      name3: "ed25519-dalek",
      purpose: t("Verifying extension signatures"),
      link: "https://github.com/dalek-cryptography/curve25519-dalek/tree/main/ed25519-dalek",
      license: "BSD-3-Clause",
    },

    // ── 数据与系统：一串"干脏活的" ─────────────────────────────────────
    {
      name3: "serde / serde_json",
      purpose: t("Reading and writing data"),
      link: "https://github.com/serde-rs/serde",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "toml",
      purpose: t("Settings and extension manifests"),
      link: "https://github.com/toml-rs/toml",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "sha2",
      purpose: t("Hashes"),
      link: "https://github.com/RustCrypto/hashes",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "base64",
      purpose: t("Encoding"),
      link: "https://github.com/marshallpierce/rust-base64",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "chrono",
      purpose: t("Dates and times"),
      link: "https://github.com/chronotope/chrono",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "zip",
      purpose: t("Extension packages"),
      link: "https://github.com/zip-rs/zip2",
      license: "MIT",
    },
    {
      // 2026-10-11 起 `ui/useClipboard.ts` 走它读剪贴板（菜单里的「粘贴」那条路）。
      // ⚠️ 它是 2026-10-11 那一批加进来的，`THIRD-PARTY.md` §1 **当时漏登记了**，
      // 同一批补上——两张表必须同批改，理由见文件头。
      name3: "tauri-plugin-clipboard-manager",
      purpose: t("Reading the clipboard"),
      link: "https://github.com/tauri-apps/plugins-workspace",
      license: "Apache-2.0 OR MIT",
    },
    {
      name3: "dirs",
      purpose: t("Finding the system folders"),
      link: "https://github.com/soc/dirs-rs",
      license: "MIT OR Apache-2.0",
    },
    {
      name3: "thiserror",
      purpose: t("Error plumbing"),
      link: "https://github.com/dtolnay/thiserror",
      license: "MIT OR Apache-2.0",
    },

    // ── 外部程序与数据：**Nota 不分发它们** ─────────────────────────────
    {
      name3: "Pandoc",
      purpose: t("Export (external, optional)"),
      link: "https://github.com/jgm/pandoc",
      // ⚠️ Pandoc 是 **GPL-2.0-or-later**，而 Nota 是 BSD-2——两者能并存，是因为
      //    **Nota 不分发它**：只在用户机器上装着的时候调一次它的命令行。这一行
      //    把"外部、可选、不分发"说清楚，别让人以为 GPL 传染进来了。
      license: t("GPL-2.0-or-later (external program — Nota does not bundle it)"),
    },
    {
      // ⚠️ 这一条是**拼写检查的词典**那一半（2026-09-28 加，用户点名：
      // 「拼写检查找一个 BSD 开源的属个名」）。⚠️ **Nota 一个字典字节都不带**：
      // 整条链子是「WebKitGTK → libenchant → hunspell → 系统装的字典」，所以这一行
      // 的义务落点在**打包**那一侧（谁把字典打进安装包，谁得随包附上那段声明）。
      // BSD 的那一件是 SCOWL（Kevin Atkinson），正文在 `THIRD-PARTY.md` §7。
      name3: "SCOWL",
      purpose: t("Spell checking word lists"),
      link: "http://wordlist.aspell.net/",
      license: "MIT-like (see THIRD-PARTY.md §7)",
    },
  ];
}
