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
export interface 致谢条目 {
  名: string;
  用处: string;
  链接: string;
  许可: string;
}

/**
 * 这一页要画的名单，顺序就是界面上的顺序。
 *
 * 分四段（骨架 → 编辑器 → 拓展与网络 → 数据与系统 → 外部程序），
 * 段与段之间**不留小标题**：GNOME 那个关于窗就没有，而多一行小标题会让人
 * 以为每一段可以单独折叠。
 */
export function 致谢名单(t: (键: string) => string): 致谢条目[] {
  return [
    // ── 骨架：没有它们就没有这个程序 ────────────────────────────────
    {
      名: "Tauri",
      用处: t("Desktop shell and windows"),
      链接: "https://github.com/tauri-apps/tauri",
      许可: "Apache-2.0 OR MIT",
    },
    {
      名: "React",
      用处: t("Interface"),
      链接: "https://github.com/facebook/react",
      许可: "MIT",
    },
    {
      // ⚠️ 这两样是 **Linux 那一侧**的（Tauri 在别的平台上换一套自己的实现），
      // 但它们在 `Cargo.toml` 里是**我们直接引的**（`gtk` 那条还开了 `v3_24`
      // 拿 `EventControllerKey`），所以照实列出来。
      名: "GTK / WebKitGTK",
      用处: t("Window, widgets and web view on Linux"),
      链接: "https://github.com/tauri-apps/webkit2gtk-rs",
      许可: "MIT",
    },

    // ── 编辑器：正文（所见即所得）与代码块（CodeMirror）────────────────
    {
      名: "Milkdown / ProseMirror",
      用处: t("Editor core"),
      链接: "https://github.com/Milkdown/milkdown",
      许可: "MIT",
    },
    {
      // 2026-10-06 起**代码块**由它编辑（`src/editor/code-block-cm.ts`）：
      // 缩进、括号配对、行内高亮都是它那几套。用户点名要补的就是这一条。
      名: "CodeMirror",
      用处: t("Code block editor"),
      链接: "https://github.com/codemirror/dev",
      许可: "MIT",
    },
    {
      // CodeMirror 的语法树那一层（`@lezer/highlight` 是我们直接引的）。
      名: "Lezer",
      用处: t("Syntax trees behind the code editor"),
      链接: "https://github.com/lezer-parser/lezer",
      许可: "MIT",
    },
    {
      // 所见即所得里代码块的高亮走 `@milkdown/plugin-prism`，它底下是 refractor
      // （Prism 那套语法表的移植）。
      名: "Prism (refractor)",
      用处: t("Syntax highlighting in the editor"),
      链接: "https://github.com/wooorm/refractor",
      许可: "MIT",
    },
    {
      名: "mdast-util-math",
      用处: t("Serialising math delimiters"),
      链接: "https://github.com/syntax-tree/mdast-util-math",
      许可: "MIT",
    },
    {
      名: "KaTeX",
      用处: t("Math typesetting"),
      链接: "https://github.com/KaTeX/KaTeX",
      许可: "MIT",
    },
    {
      // 「Nota」那三个字的字标（2026-10-16 用户点名：「文字徽标用"Nota"，
      // 字体是 Monoton……鸣谢里写一下徽标字体用的是这个」）。
      // ⚠️ **2026-10-17 起不再随包带字体**（用户：「最好不要搞任何随包字体……把这
      // 几个字换成 svg 就可以了」）：字形已经转成 `src/assets/nota-wordmark.svg` 的
      // **矢量轮廓**，仓库里没有 `.ttf` 了。这一行保留是 OFL 的出处要求。
      名: "Monoton",
      用处: t("The “Nota” wordmark (vector outlines — no font file is shipped)"),
      链接: "https://fonts.google.com/specimen/Monoton",
      许可: "OFL-1.1",
    },
    {
      // CDE 界面与文档用的 16px 硬点阵字（2026-10-17 用户批准随包分发）。
      // 使用 AmusementClub 转写的完整 WenQuanYi Bitmap Song 16px TTF；
      // 字体与完整许可同放在 `src/styles/themes/cde/`；清单见 `THIRD-PARTY.md` §9。
      名: "WenQuanYi Bitmap Song",
      用处: t("CDE interface and document bitmap font"),
      链接: "https://github.com/AmusementClub/Wenquanyi-Bitmap-Song-TTF",
      许可: "GPL-2.0-with-font-embedding-exception",
    },
    {
      // 2026-10-11 起**拼写检查的引擎**就是它（`src-tauri/src/spell/native.rs`）：
      // 纯 Rust 的 hunspell 实现，编进程序里。⚠️ 许可那一栏写 **Apache-2.0** 是
      // 照它仓库里那份 `LICENSE` 抄的——**不是**选型时拿到的第二手材料说的 MIT
      // （`THIRD-PARTY.md` §7.2 记着这笔更正）。
      名: "zspell",
      用处: t("Spell checking engine"),
      链接: "https://github.com/pluots/zspell",
      许可: "Apache-2.0",
    },
    {
      名: "Mermaid",
      用处: t("Diagrams"),
      链接: "https://github.com/mermaid-js/mermaid",
      许可: "MIT",
    },
    {
      // ⚠️ 这一条与别条不同：图标是**直接搬进仓库**的（`src/assets/lang-icons/`），
      // 不是"引了个依赖"——所以 MIT 要的那份版权声明必须随源码走，
      // 正文在 `THIRD-PARTY.md` §6。
      名: "vscode-icons",
      用处: t("Language icons for code blocks"),
      链接: "https://github.com/vscode-icons/vscode-icons",
      许可: "MIT",
    },

    // ── 拓展运行时，以及它要的那条网络与验签的路 ───────────────────────
    {
      名: "mlua / Lua",
      用处: t("Extension runtime"),
      链接: "https://github.com/mlua-rs/mlua",
      许可: "MIT",
    },
    {
      名: "ureq",
      用处: t("HTTP requests for extensions"),
      链接: "https://github.com/algesten/ureq",
      许可: "MIT OR Apache-2.0",
    },
    {
      名: "rustls",
      用处: t("TLS"),
      链接: "https://github.com/rustls/rustls",
      许可: "Apache-2.0 OR ISC OR MIT",
    },
    {
      名: "ring",
      用处: t("Cryptographic primitives"),
      链接: "https://github.com/briansmith/ring",
      // ⚠️ **AND**，不是 OR：两份都得满足（`THIRD-PARTY.md` §1 那张小表）。
      许可: "Apache-2.0 AND ISC",
    },
    {
      名: "webpki-roots",
      用处: t("Trusted root certificates"),
      链接: "https://github.com/rustls/webpki-roots",
      // ⚠️ 这一条**不是** MIT/Apache：一个"数据许可"，要求保留出处。
      许可: "CDLA-Permissive-2.0",
    },
    {
      名: "ed25519-dalek",
      用处: t("Verifying extension signatures"),
      链接: "https://github.com/dalek-cryptography/curve25519-dalek/tree/main/ed25519-dalek",
      许可: "BSD-3-Clause",
    },

    // ── 数据与系统：一串"干脏活的" ─────────────────────────────────────
    {
      名: "serde / serde_json",
      用处: t("Reading and writing data"),
      链接: "https://github.com/serde-rs/serde",
      许可: "MIT OR Apache-2.0",
    },
    {
      名: "toml",
      用处: t("Settings and extension manifests"),
      链接: "https://github.com/toml-rs/toml",
      许可: "MIT OR Apache-2.0",
    },
    {
      名: "sha2",
      用处: t("Hashes"),
      链接: "https://github.com/RustCrypto/hashes",
      许可: "MIT OR Apache-2.0",
    },
    {
      名: "base64",
      用处: t("Encoding"),
      链接: "https://github.com/marshallpierce/rust-base64",
      许可: "MIT OR Apache-2.0",
    },
    {
      名: "chrono",
      用处: t("Dates and times"),
      链接: "https://github.com/chronotope/chrono",
      许可: "MIT OR Apache-2.0",
    },
    {
      名: "zip",
      用处: t("Extension packages"),
      链接: "https://github.com/zip-rs/zip2",
      许可: "MIT",
    },
    {
      // 2026-10-11 起 `ui/useClipboard.ts` 走它读剪贴板（菜单里的「粘贴」那条路）。
      // ⚠️ 它是 2026-10-11 那一批加进来的，`THIRD-PARTY.md` §1 **当时漏登记了**，
      // 同一批补上——两张表必须同批改，理由见文件头。
      名: "tauri-plugin-clipboard-manager",
      用处: t("Reading the clipboard"),
      链接: "https://github.com/tauri-apps/plugins-workspace",
      许可: "Apache-2.0 OR MIT",
    },
    {
      名: "dirs",
      用处: t("Finding the system folders"),
      链接: "https://github.com/soc/dirs-rs",
      许可: "MIT OR Apache-2.0",
    },
    {
      名: "thiserror",
      用处: t("Error plumbing"),
      链接: "https://github.com/dtolnay/thiserror",
      许可: "MIT OR Apache-2.0",
    },

    // ── 外部程序与数据：**Nota 不分发它们** ─────────────────────────────
    {
      名: "Pandoc",
      用处: t("Export (external, optional)"),
      链接: "https://github.com/jgm/pandoc",
      // ⚠️ Pandoc 是 **GPL-2.0-or-later**，而 Nota 是 BSD-2——两者能并存，是因为
      //    **Nota 不分发它**：只在用户机器上装着的时候调一次它的命令行。这一行
      //    把"外部、可选、不分发"说清楚，别让人以为 GPL 传染进来了。
      许可: t("GPL-2.0-or-later (external program — Nota does not bundle it)"),
    },
    {
      // ⚠️ 这一条是**拼写检查的词典**那一半（2026-09-28 加，用户点名：
      // 「拼写检查找一个 BSD 开源的属个名」）。⚠️ **Nota 一个字典字节都不带**：
      // 整条链子是「WebKitGTK → libenchant → hunspell → 系统装的字典」，所以这一行
      // 的义务落点在**打包**那一侧（谁把字典打进安装包，谁得随包附上那段声明）。
      // BSD 的那一件是 SCOWL（Kevin Atkinson），正文在 `THIRD-PARTY.md` §7。
      名: "SCOWL",
      用处: t("Spell checking word lists"),
      链接: "http://wordlist.aspell.net/",
      许可: "MIT-like (see THIRD-PARTY.md §7)",
    },
  ];
}
