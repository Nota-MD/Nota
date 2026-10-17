# 第三方组件

> 最后核对：**2026-10-17**
>
> ⚠️ **2026-10-06 那一次：每一项都补上了仓库/主页链接**（用户：「**鸣谢里加上各个项目的仓库**」，并贴了 Typora 的鸣谢页当参照）。
> 链接**不是凭印象写的**：Rust 那半从 `cargo metadata` 里读每个 crate 的 `repository` 字段，前端那半读 `node_modules/<包>/package.json` 的 `repository`。
> ⚠️ **同一次还补齐了两张表漏登记的直接依赖**（§1 的 `base64` / `chrono` / `ed25519-dalek` / `sha2` / `zip` / `gtk` / `webkit2gtk`，§2 的 `@codemirror/*` 五个 / `@lezer/highlight` / `refractor`）——它们早就在 `Cargo.toml` / `package.json` 里，只是这份文档没跟上。
>
> Nota 自身以 **BSD-2-Clause** 发布（见 `LICENSE`）。本文列出它分发时携带的第三方组件。
>
> ⚠️ **本文只登记直接依赖。** 完整的传递依赖闭包解出来有 **504 个 crate**，
> 逐个列没有意义也没有人读。要做合规审查时用工具跑，不要读本文：
>
> ```sh
> cd src-tauri && cargo metadata --format-version 1   # Rust 侧
> npx license-checker --production                    # 前端侧
> ```
>
> 下面的许可证字段是**从上列命令与已安装的 `node_modules` 里读出来的**，不是凭印象写的。

---

## 1. Rust 直接依赖（`src-tauri/Cargo.toml`）

| crate | 版本 | 许可证 | 用来做什么 |
|---|---|---|---|
| [`base64`](https://github.com/marshallpierce/rust-base64) | 0.22.1 | MIT OR Apache-2.0 | base64 编解码（图片的 data URL、导出、插件账本里那几处） |
| [`chrono`](https://github.com/chronotope/chrono) | 0.4.45 | MIT OR Apache-2.0 | 日期与时间（`nota.time`、信任记录的时间戳） |
| [`dirs`](https://github.com/soc/dirs-rs) | 6.0.0 | MIT OR Apache-2.0 | XDG 目录 |
| [`ed25519-dalek`](https://github.com/dalek-cryptography/curve25519-dalek/tree/main/ed25519-dalek) | 2.2.0 | BSD-3-Clause | **插件签名验证**（`plugin/package.rs`：验签与公钥指纹） |
| [`gtk`](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | **Linux 那一侧的 GTK 绑定**。⚠️ 版本必须与 tauri 拖进来的同一大版本（0.18）；开 `v3_24` 是为了 `EventControllerKey`（捕获阶段拦 `Ctrl+B`/`Ctrl+I`，见 `format_keys.rs` 文件头） |
| [`mlua`](https://github.com/mlua-rs/mlua) | 0.12.1 | MIT | Lua 插件运行时 |
| [`notify`](https://github.com/notify-rs/notify) | 8.2.0 | CC0-1.0 | ⚠️ **目前没用到**，见 §4 |
| [`serde`](https://github.com/serde-rs/serde) | 1.0.229 | MIT OR Apache-2.0 | 序列化 |
| [`serde_json`](https://github.com/serde-rs/json) | 1.0.151 | MIT OR Apache-2.0 | JSON |
| [`sha2`](https://github.com/RustCrypto/hashes) | 0.10.9 | MIT OR Apache-2.0 | 哈希（插件包摘要 / 公钥指纹 / 文件监视那一路） |
| [`shlex`](https://github.com/comex/rust-shlex) | 1.3.0 | MIT OR Apache-2.0 | **导出的额外参数怎么分词**（2026-10-10 起真的用上了，`pandoc.rs::分词`：用户在「设置 → 导出」写的那串 `--reference-doc=…` 要认引号——按空白切会把 `title="我的 书"` 切成两半，**不报错**，只是值变成半个） |
| [`similar`](https://github.com/mitsuhiko/similar) | 3.2.0 | Apache-2.0 | ⚠️ **目前没用到**，见 §4 |
| [`tauri`](https://github.com/tauri-apps/tauri) | 2.11.6 | Apache-2.0 OR MIT | 宿主框架（窗口、IPC、WebView） |
| [`tauri-build`](https://github.com/tauri-apps/tauri) | 2.6.3 | Apache-2.0 OR MIT | 构建期代码生成 |
| [`tauri-plugin-clipboard-manager`](https://github.com/tauri-apps/plugins-workspace) | 2.4.2 | Apache-2.0 OR MIT | **读剪贴板**（`ui/useClipboard.ts` 的粘贴；⚠️ 只开 `allow-read-text` 一条权限，见 `capabilities/default.json`）。⚠️ 2026-10-11 补登记：它是 2026-10-11 那一批加进来的（「菜单里的粘贴真能粘」那一条），**当时漏了这儿** |
| [`tauri-plugin-dialog`](https://github.com/tauri-apps/plugins-workspace) | 2.7.3 | Apache-2.0 OR MIT | 打开/保存文件对话框 |
| [`tauri-plugin-fs`](https://github.com/tauri-apps/plugins-workspace) | 2.5.2 | Apache-2.0 OR MIT | 前端读写文件 |
| [`tauri-plugin-opener`](https://github.com/tauri-apps/plugins-workspace) | 2.5.5 | Apache-2.0 OR MIT | 用系统默认程序打开链接 |
| [`thiserror`](https://github.com/dtolnay/thiserror) | 2.0.20 | MIT OR Apache-2.0 | `NotaError` 的样板 |
| [`toml`](https://github.com/toml-rs/toml) | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 | 读插件清单与设置文件 |
| [`ureq`](https://github.com/algesten/ureq) | 3.4.0 | MIT OR Apache-2.0 | **`nota.http`，也就是只给插件发请求用**（2026-09-24）。默认 feature 就带下面那套 TLS，**不依赖系统 OpenSSL** |
| [`webkit2gtk`](https://github.com/tauri-apps/webkit2gtk-rs) | 2.0.2 | MIT | Tauri 在 Linux 上的 WebView 绑定（与 `gtk` 同属"tauri 已经拖进来、我们直接引用"那一类） |
| [`zip`](https://github.com/zip-rs/zip2) | 8.6.0 | MIT | 读 zip 包（`.nota-plugin`、主题包之类的打包件、**用户导入的词典 `.zip`**） |
| [`zspell`](https://github.com/pluots/zspell) | 0.5.5 | **Apache-2.0** | **拼写检查的引擎**（2026-10-11 加）：纯 Rust 的 hunspell 实现，读 `.aff`/`.dic`，**编进程序**——换掉的是"借浏览器内核"与"借系统程序"那两代。⚠️ 依赖链里还有 `stringmetrics` / `xxhash-rust` / `itertools` / `hashbrown` / `unicode-segmentation` 等（都无 C 依赖，交叉编译 Windows 直接过）。⚠️ **许可正文是 Apache-2.0**（仓库 `LICENSE` 里那几行，`Cargo.toml` 用的是 `license-file` 而不是 SPDX 字段）——⚠️ 2026-10-11 选型时拿到的第二手材料说它是 MIT，**那是错的**，以仓库正文为准；Apache-2.0 与 BSD-2 兼容，义务见 §7 |

### 随 `ureq` 一起编进来的 TLS 栈

这几条**不是**直接依赖，是 `ureq` 默认 feature 拉进来的。之所以单列，
是因为 `ring` 的许可证是**两个都要满足**（`AND` 不是 `OR`），而且它里面
有一份 BoringSSL 的血统——这是本项目里唯一一个这么写的依赖，别让它被忽略。

| crate | 版本 | 许可证 | 说明 |
|---|---|---|---|
| `rustls` | 0.23.43 | Apache-2.0 OR ISC OR MIT | TLS 实现（纯 Rust） |
| `ring` | 0.17.14 | **Apache-2.0 AND ISC** | 密码学原语。⚠️ 源码里另有 `LICENSE-BoringSSL` 与 `LICENSE-other-bits` 两份文件，都已随源码保留 |
| `rustls-webpki` | 0.103.14 | ISC | 证书链校验 |
| `rustls-pki-types` | 1.15.1 | MIT OR Apache-2.0 | |
| `webpki-roots` | 1.0.9 | **CDLA-Permissive-2.0** | 打包好的根证书。⚠️ **不是** MIT/Apache——一个"数据许可"，要求保留出处 |
| `flate2` | 1.1.10 | MIT OR Apache-2.0 | 解 gzip 响应体 |

⚠️ **为什么不开 `native-tls`**：那会把系统 OpenSSL 拖回来（容器里就得多装
`libssl-dev`），而 `rustls` 这半边**一个系统库都不需要**。见 `docs/06` §「依赖」表。
⚠️ 这几条的版本号取自 `Cargo.lock`，**改依赖后要重新核一遍**——
`webpki-roots` 那条尤其容易记错（它看着像个 MIT 的小包，其实是 CDLA）。

### 随二进制一起编进去的 Lua

`mlua` 开了 **`vendored`** feature，所以 **Lua 5.4 的源码是编进二进制里的**，
不依赖系统 `liblua`（容器里也没有）。

- **Lua 5.4** — Copyright © 1994–2024 Lua.org, PUC-Rio — **MIT**
  <https://www.lua.org/license.html>

这意味着 Nota 的二进制里包含 Lua 的解释器源码。MIT 只要求保留版权声明，
`vendored` 编进来的那份源码自带其版权头，无需额外动作。

## 2. 前端直接依赖（`package.json`）

### 运行时要用的

| 包 | 版本 | 许可证 | 用来做什么 |
|---|---|---|---|
| [`@codemirror/autocomplete`](https://code.haverbeke.berlin/codemirror/autocomplete) | 6.20.3 | MIT | 代码块编辑器的**括号配对**（`closeBrackets` / `closeBracketsKeymap`）——2026-10-06 起代码块由 CodeMirror 编辑（`src/editor/code-block-cm.ts`） |
| [`@codemirror/commands`](https://code.haverbeke.berlin/codemirror/commands) | 6.11.1 | MIT | — |
| [`@codemirror/lang-markdown`](https://code.haverbeke.berlin/codemirror/lang-markdown) | 6.5.2 | MIT | — |
| [`@codemirror/language`](https://code.haverbeke.berlin/codemirror/language) | 6.12.4 | MIT | — |
| [`@codemirror/state`](https://code.haverbeke.berlin/codemirror/state) | 6.7.6 | MIT | — |
| [`@codemirror/view`](https://code.haverbeke.berlin/codemirror/view) | 6.43.13 | MIT | — |
| [`@lezer/highlight`](https://github.com/lezer-parser/highlight) | 1.2.3 | MIT | — |
| [`@milkdown/kit`](https://github.com/Milkdown/milkdown) | 7.22.1 | MIT | 编辑器内核（ProseMirror + remark 的封装） |
| [`@milkdown/plugin-math`](https://github.com/Milkdown/milkdown) | 7.5.9 | MIT | 数学公式。⚠️ 同上（渲染那一半在 `src/editor/…` 与 `katexOptionsCtx`） |
| [`@milkdown/plugin-prism`](https://github.com/Milkdown/milkdown) | 7.22.1 | MIT | 代码块语法高亮 |
| [`@tauri-apps/api`](https://github.com/tauri-apps/tauri) | 2.11.1 | Apache-2.0 OR MIT | 前端调后端 |
| [`@tauri-apps/plugin-dialog`](https://github.com/tauri-apps/plugins-workspace) | 2.7.3 | MIT OR Apache-2.0 | — |
| [`@tauri-apps/plugin-fs`](https://github.com/tauri-apps/plugins-workspace) | 2.5.2 | MIT OR Apache-2.0 | — |
| [`@tauri-apps/plugin-opener`](https://github.com/tauri-apps/plugins-workspace) | 2.5.5 | MIT OR Apache-2.0 | — |
| [`katex`](https://github.com/KaTeX/KaTeX) | 0.16.47 | MIT | 公式渲染 |
| [`mdast-util-math`](https://github.com/syntax-tree/mdast-util-math) | 3.0.0 | MIT | 行内公式**用几个 `$`** 的序列化（2026-09-27 起显式列出）。⚠️ 它本来是 `remark-math` 的传递依赖，之所以写进 `package.json`，是因为 `src/editor/math-delim.ts` **直接 import 了它**（用 `mathToMarkdown({singleDollarTextMath:false})` 那条上游现成的处理器）。另一条路是自己抄一份 handler，那样会漏掉上游那两段边界处理——理由在那个文件头 |
| [`mermaid`](https://github.com/mermaid-js/mermaid) | 10.9.8 | MIT | 图表渲染。⚠️ **显式列在 `package.json` 里**（`src/editor/diagram-view.ts` 里动态 `import()`，只在真的出图时加载）。⚠️ 2026-10-04 起 `@milkdown/plugin-diagram`（7.7.0，MIT）**退役**：它只做"围栏→节点"那四件不含 mermaid 的小活，却把 mermaid 静态打进首屏——那四件如今是本仓自己的 `src/editor/diagram-node.ts`（判据逐条照抄，第 27 项） |
| [`react`](https://github.com/react/react) | 19.3.0 | MIT | 界面框架 |
| [`react-dom`](https://github.com/react/react) | 19.3.0 | MIT | — |
| [`refractor`](https://github.com/wooorm/refractor) | 5.0.0 | MIT | — |

### 只在开发/构建时用的

| 包 | 版本 | 许可证 |
|---|---|---|
| [`@tauri-apps/cli`](https://github.com/tauri-apps/tauri) | 2.11.5 | Apache-2.0 OR MIT | — |
| [`@types/node`](https://github.com/DefinitelyTyped/DefinitelyTyped) | 26.6.2 | MIT | — |
| [`@types/react`](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.3.0 | MIT | — |
| [`@types/react-dom`](https://github.com/DefinitelyTyped/DefinitelyTyped) | 19.3.0 | MIT | — |
| [`@vitejs/plugin-react`](https://github.com/vitejs/vite-plugin-react) | 5.2.0 | MIT | — |
| [`typescript`](https://github.com/microsoft/TypeScript) | 5.9.3 | Apache-2.0 | — |
| [`vite`](https://github.com/vitejs/vite) | 7.3.6 | MIT | — |

## 3. 系统依赖（Linux）

**不随 Nota 分发**，是运行/构建时向系统要的。Fedora 上的包名：

| 包 | 用途 |
|---|---|
| `webkit2gtk4.1-devel` | WebView（**Tauri 2 用的是 4.1**，与 Folio 的 `webkitgtk-6.0` 不是同一个 ABI） |
| `libappindicator-gtk3-devel` | 托盘图标（Tauri 的可选件） |
| `librsvg2-devel` | 图标 |
| `openssl-devel` | TLS |
| `gcc` / `gcc-c++` / `make` / `pkgconf-pkg-config` | 构建工具链 |

⚠️ WebKitGTK 本身是 **LGPL-2.1+ / BSD** 的双授权。因为它**是动态链接的系统库**，
不随 Nota 分发，所以不改变 Nota 的许可证——**但打包成 AppImage / 自带 WebKit 分发时要重新审**。

## 4. 两个声明了但没用上的依赖（欠账）

`Cargo.toml` 里还有两个 crate **在 `src-tauri/src/` 下零处引用**（2026-09-22 起核对，2026-10-10 把 `shlex` 划掉了）：

| crate | 当初为什么加 | 现状 |
|---|---|---|
| `notify` | "文件树 / 外部改动监视"——编辑器外改了文件，树要跟着刷新 | **没接**。`tree` 命令是现算的，没有 watcher |
| `similar` | "AI 插件的 diff、Git 插件的变更预览" | **没接**。两个插件的 diff 走的是 `git diff` 的子进程输出 |

**留着还是删掉？**
`shlex` **2026-10-10 起不是欠账了**（导出那串额外参数的分词，见 §1 那一行）。
剩下这两个（`notify` / `similar`）等到真做对应功能时再说——现在留着它们只是让每次 `cargo build` 多编两个 crate。

⚠️ 删的时候要同时改 `Cargo.toml` **和 `docs/06` 的依赖清单**（`docs/09` §2 的映射表钉着这一条）。
**本条是待办，不是已完成**——记在这里是因为它正是一份"第三方组件清单"该说的事：
*我们拉了哪些东西、哪些其实白拉了。*

## 5. 界面图标：从 Folio 搬来的那一套（`src/assets/icons/`）

界面上的图标（工具栏、侧栏/插件栏/标签页的 ×、侧栏空态那颗按钮）
用的是 **Folio 的 `actions/` 图标**，96 个文件**逐字节复制**进来
（`src/assets/icons/`，2026-09-24，`diff -r` 校过）。

| 项 | 说明 |
|---|---|
| 来源 | Folio 仓库 `data/icons/hicolor/scalable/actions/*.svg`（**不是** `apps/` 那几枚应用图标） |
| 作者 | Folio contributors（**与 Nota 同一个作者**） |
| 许可 | **BSD-2-Clause** —— 与 Nota 的 `LICENSE` 同一份，不引入新义务 |
| 搬运方式 | `cp`（一个字节没改），核对手段见 `docs/04` 的"图标"一节 |

**为什么可以搬**：Folio 自己的 `THIRD-PARTY.md` §2.2 记着，这套图标的早期版本
**71/72 与上游 WebkitWord（GPL-3.0）逐字节相同**，而 Folio 在 2026-09-12
**把整套重绘了一遍**——图标属于受版权保护的"图形表达"，重绘之后它们就是
Folio 自绘的作品，按 BSD-2-Clause 分发。⚠️ **要搬的是重绘后那一份**；
如果有人"顺手"从上游 WebkitWord 或旧 `icons-old/` 里拿，那就是把 GPL 的东西
搬进 BSD-2 的仓库，性质完全不同。

⚠️ **只搬"动作"图标，不搬应用图标**：`folio-*.svg` 那一套是 Folio 自己的脸，
Nota 的图标是用户设计、逆向成 `src-tauri/icons/nota.svg` 的那一份。

⚠️ **`nota-` 前缀的那几枚不在这一节里**：它们是 Nota 自己画的（`nota-quote` /
`nota-task` / `nota-keys`，2026-09-25 换上去的 `nota-markdown` /
`nota-doc-theme`，以及后来陆续加的 `nota-force-focus` /
`nota-sidebar-toggle` / `nota-sidebar-collapse`（2026-09-30 照 Typora 画的）/
`nota-spellcheck` / `nota-unfold-more`（同日晚上，状态栏悬停才出现的那两颗）），
原文件只存在于本仓，**没有"上游那一份"可对照**。
所以它们**不受下面的"一个字节都不许改"约束**——要调就调，
调完不会动摇任何"搬来的"结论。⚠️ 但**不许把 Folio 的文件改名成 `nota-`**
来躲开这条约束：那等于把搬来的东西记账成自研。

⚠️ 搬进来的文件**不许改**——包括里面那 355 处写死的 `fill="#2e3436"`
（GTK 的深灰）。颜色是**用 CSS 遮罩在外面刷**的（`styles/icons.css` 里
`.icon` 的 `background-color: currentColor` + `mask-image`），
所以那些 `fill` 根本不参与渲染。改一个字节，"搬来的东西一个字节没动"
这句话就失效了，而这正是这套图标能被一眼核对的前提。

---

## 6. 语言图标：vscode-icons（`src/assets/lang-icons/`）

代码框语言切换那两颗地方（按钮上一颗小的、下拉里每行一颗）的**彩色语言
logo**，93 个文件**逐字节**从 vscode-icons 搬来（2026-09-26）。

| 项 | 说明 |
|---|---|
| 来源 | [vscode-icons/vscode-icons](https://github.com/vscode-icons/vscode-icons) 的 `icons/file_type_*.svg` |
| 版本 | **tag `v12.19.0`**（`e6daaed43175c6c3f62b84f3ca30a4745df58b3e`） |
| 作者 | Copyright (c) 2016 Roberto Huertas 及 vscode-icons contributors |
| 许可 | **MIT** —— ⚠️ 与 Nota 自己的 BSD-2-Clause **不是同一份**，正文见下 |
| 搬运方式 | `bash tools/fetch-lang-icons.sh`（固定 tag 抓取，写完 `SHA256SUMS`） |
| 核对手段 | `bash tools/fetch-lang-icons.sh --verify`（拿 `SHA256SUMS` 逐个对 sha256） |
| 用在哪 | `src/editor/lang-icons-real.ts` → `src/editor/lang-icon.ts` → `lang-picker.ts` |
| 覆盖范围 | 93 颗图，罩住 `refractor` 400 个语言 id 里**热门的那些**；查不到的一律回落到本仓自绘的首字母徽章（那部分不涉及第三方） |

⚠️ **搬进来的文件不许改**（和 §5 同一条规矩）——`--verify` 就是这条规矩的判据。
要换图标就在 `lang-icons-real.ts` 那张表里换名字（换完那个语言会回落成徽章），
或者先把新的图标补进 `tools/fetch-lang-icons.sh` 的 `NAMES` 里再抓一遍。

⚠️ **只搬了"语言"图标，没搬 VS Code 自己的界面图标**（`default_*`、
`file_type_vscode*` 那些）。这一节的范围就是"代码框旁边那颗小图"。

⚠️ 这批图是**彩色**的，接进来时走 `background-image` 的 data URI，
**没有**套 `mask-image`（§5 那套界面图标才走 mask）。所以它们**不跟主题变**——
这是有意的，理由写在 `lang-icons-real.ts` 文件头。

### MIT 许可正文（vscode-icons）

```text
The MIT License (MIT)

Copyright (c) 2016 Roberto Huertas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 7. 拼写检查：**一个字典字节都不带**（引擎编在里面），BSD 那一件是 SCOWL

**2026-09-28 加**。用户点名：「拼写检查找一个 BSD 开源的属个名」。
⚠️ **2026-10-11 这一节整块改写过**——那一天的结论是「安装包**默认随包不分发任何
字典**」（用户原话，照 Typora 那条 `❌ 词典数据不内置`），而"引擎"那一半换了人：
它从**浏览器内核**（WebKitGTK）换成**系统程序**（`enchant-2` / `hunspell` 的命令行），
当天再换成**我们自己编进去的那个**（`zspell`，§1 最后一行）。

### 7.1 这条链子长什么样（2026-10-11 版）

```text
设置里的开关（`editor.spellcheck`）
  → `ui/useSpellcheck.ts` → 编辑器里那条插件（`src/editor/spell-check.ts` 自己画波浪线）
      → 宿主 `nota_spell_check` → `src-tauri/src/spell/`
          ├─ native.rs：**zspell**（Apache-2.0，编进程序，§1）读 `.aff`/`.dic`
          │     └─ 词典从两个方向找：**用户目录** ＋ **系统目录**（`store.rs`）
          └─ 手里没这门语言的词典时，退到 `enchant-2` / `hunspell` 的命令行
```

⚠️ **引擎现在是我们的依赖**（Apache-2.0，§1 记着正文出处与义务），而**词典仍然
一个字节都不带**——用户 2026-10-11 拍板：「默认随包不分发任何字典」。词典要么是
用户自己**导入的 `.zip` / 拷进 `dictionaries/` 的两份文件**，要么是**系统包**装的
（`hunspell-en-US` 那一类）——后者与 §3 那批系统依赖同一性质，义务落点在**打包那
一侧**：谁把字典打进 AppImage 或安装包**随包分发**，谁就得把下面的声明随包带上。

⚠️ 也正因为这样，**没装字典的机器上拼写检查是"开着也不划红线"**——但今天这件事
**说得出来**了：界面上会弹一句"这台机器上没有 `xx_XX` 的词典"，并给出三条出路
（装系统包 / 导入 `.zip` / 拷进目录）。⚠️ 2026-10-11 之前那句话说不出来
（WebKitGTK 的接口只回一个布尔），那是这一格当时填 🟡 的理由之一。

### 7.1b ⚠️ 我们**不联网下载**词典（与 Typora 的一处不同）

Typora 的 Windows/Linux 版首次开某个语言的拼写检查时，会从 `dict.typora.io`
**下载**词典包到 `%APPDATA%\Typora\dictionaries\` / `~/.config/Typora/dictionaries/`。
**Nota 不这么做**：本仓对拼写这一格钉死了两条纪律（`src-tauri/src/spell/mod.rs`
顶上那段）——**不联网、不下载**；**失败给"不知道"，不给"拼错了"**。
学的是 Typora 的**目录模型**（一个用户目录、手动丢进去就能用、还去系统目录里找），
不是它的下载那一条。

### 7.2 Apache-2.0 的那一件：zspell（引擎）

`zspell`（Trevor Gross）是本仓 2026-10-11 起**唯一新增的运行时依赖**，许可正文是
**Apache-2.0**（仓库里那份 `LICENSE`，13 行；`Cargo.toml` 用的是 `license-file`
而不是 SPDX 的 `license` 字段，所以 `cargo metadata` 里读不到 SPDX 名）。

⚠️ **义务**：Apache-2.0 要求**保留版权与许可声明**（本文件就是那一份），
并且**改动了它的源码要写明白**——本仓**没有改**它一个字（`Cargo.toml` 只开了一个
`unstable-suggestions` feature，那是它自己的开关）。
⚠️ **没有 `NOTICE` 文件**（上游仓库里没有），所以不必另附第三方 NOTICE。
⚠️ **与 BSD-2-Clause 兼容**：Apache-2.0 不是著佐权，链进 BSD 产品没有任何额外负担。
⚠️ 选型时拿到的第二手材料说它是 **MIT**，**那是错的**——以仓库正文为准，
本文件与「关于 → 鸣谢」都按 Apache-2.0 写。

### 7.3 BSD 的那一件：SCOWL（词表）

`hunspell-en-US` 这类英文字典的**词表**由 **SCOWL**（Spell Checker Oriented
Word Lists，Kevin Atkinson）构建；RPM 上标的是
`LGPL-2.1-or-later AND LGPL-2.1-only AND BSD-3-Clause-Modification`，
本机核对过（2026-09-28）：

```sh
rpm -q --qf '%{NAME} %{LICENSE}\n' hunspell-en-US
# hunspell-en-US LGPL-2.1-or-later AND LGPL-2.1-only AND BSD-3-Clause-Modification
```

⚠️ **`BSD-3-Clause-Modification` 那个 SPDX 名就是 SCOWL 的许可**（它长得像
三条款 BSD，但**没有**"不得用名字背书"那一条，所以不能直接写成 `BSD-3-Clause`）。
⚠️ 那串 `LGPL-*` 指的是**别的部分**（字典文件里混着 Ispell 的 affix 文件），
不是 SCOWL 词表本身。

⚠️ 同一份声明在 Fedora 上是 `/usr/share/doc/hunspell-en-US/README_en_US.txt`，
下面的正文逐字抄自它（**不是从网上抄的**——这台机器没有网）。

### SCOWL 许可正文（SCOWL word lists，Kevin Atkinson）

```text
Copyright 2000-2026 by Kevin Atkinson

Permission to use, copy, modify, distribute, and sell any part of SCOWLv2, or
word lists created from it, is hereby granted without fee, provided that the
above copyright notice appears in all copies and that both the above
copyright notice and this notice appear in supporting documentation.  Kevin
Atkinson makes no representations about the suitability of this database for
any purpose.  It is provided "as is" without express or implied warranty.
```

### affix 文件许可正文（Geoff Kuenning 的 Ispell，BSD）

⚠️ 字典的 `.aff` 那一半**不是 SCOWL 的**，是 Geoff Kuenning 那份 Ispell 的
`english.aff` 改出来的。它按 BSD 要求**保留版权声明**，所以这里也抄一份。

```text
Copyright 1993, Geoff Kuenning, Granada Hills, CA
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. All modifications to the source code must be clearly marked as
   such.  Binary redistributions based on modified source code
   must be clearly marked as modified versions in the documentation
   and/or other materials provided with the distribution.
(clause 4 removed with permission from Geoff Kuenning)
5. The name of Geoff Kuenning may not be used to endorse or promote
   products derived from this software without specific prior
   written permission.

THIS SOFTWARE IS PROVIDED BY GEOFF KUENNING AND CONTRIBUTORS ``AS IS'' AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED.  IN NO EVENT SHALL GEOFF KUENNING OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS
OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
SUCH DAMAGE.
```

### 7.4 「关于」框里那一行

`src/ui/useAbout.ts` 的 `致谢` 表加了一行 **`SCOWL`（拼写检查词表）**——
与 §5 / §6 那两批同一条规矩：**真的用了、而且是用户看得见的那种**才进那张表。
完整的传递依赖闭包在**本文件**，那句话里指过来。

---

## 8. 字标：Monoton（OFL-1.1，**只以矢量轮廓出现，不随包分发字体文件**）

**2026-10-16 加，2026-10-17 改**。用户原话（先）：「**文字徽标用"Nota"，字体是
Monoton**（下载目录也有）**鸣谢里写一下徽标字体用的是这个**」；（后）：
「**最好不要搞任何随包字体。我的建议是你把那个 monoton 的随包字体给换掉。
把这几个字换成 svg 就可以了**」。

于是：`src/assets/fonts/Monoton-Regular.ttf` 与它的 `OFL.txt` **已经从仓库里删掉**，
换成 `src/assets/nota-wordmark.svg`——从 Monoton 里把 **N / o / t / a** 四个字形转成
**矢量路径**（`<path>`，不是 `<text>`，所以任何机器上都渲染得出来，不依赖字体文件）。

| 文件 | 是什么 |
|---|---|
| `src/assets/nota-wordmark.svg` | 字标轮廓（约 6 KB，路径由 `opentype.js` 从 Monoton 导出） |

⚠️ **OFL-1.1 的两条义务**：① **许可正文随字体分发**——我们**不再分发字体文件**，
只是把字形转成轮廓用在标识上（OFL 允许把字形用于 artwork/logo，不要求把字体文件
一起发）；② **保留字体名**——我们**没有**发布任何叫 "Monoton" 的字体文件，所以
那一条不适用。⚠️ 出处仍然写在这里与「关于 → 鸣谢」（OFL 要求署名）。

⚠️ **它不是"界面字体"**：只有拉丁字母，只给「Nota」字标用；界面其余部分走
`--font-ui`（`docs/09` §3 ⑥ 那条"界面不许出现衬线"的闸照旧）。

⚠️ **上游**：<https://fonts.google.com/specimen/Monoton>（作者主页
<https://www.newtypography.co.uk/>）。「关于 → 鸣谢」里那一行在 `ui/credits.ts`。

---

## 9. CDE 点阵字体：WenQuanYi Bitmap Song（GPL-2.0 with font embedding exception，**随包分发**）

**2026-10-17 用户批准随安装包分发**。CDE 界面主题与 CDE 文档主题使用的
`Nota GB16ST Bitmap` 来自 **WenQuanYi Bitmap Song 1.0 RC1** 的 16px
单色字模；Nota 将其重新封装为带 **EBDT/EBLC 1-bit strike** 的 OpenType
字体，使 WebKit/FreeType 不经过抗锯齿直接绘制原生像素。

| 项 | 说明 |
|---|---|
| 上游 | [WenQuanYi Bitmap Song](https://sourceforge.net/projects/wqy/files/wqy-bitmapfont/) |
| 版权 | Copyright (C) 2004–2010, WenQuanYi Project Board of Trustees and Qianqian Fang |
| 许可 | **GPL-2.0 with font embedding exception** |
| 修改 | 提取 16×16 字模；重封装为 EBDT/EBLC TTF；提供 Regular / Bold 两档 |
| 源码形式 | `src/assets/fonts/*.ttf` 本身即字体的首选可编辑形式；上游及 changelog 见上表链接 |
| 完整许可 | 版权与例外：[`WQY-Bitmap-Song-COPYRIGHT.txt`](src/assets/fonts/WQY-Bitmap-Song-COPYRIGHT.txt)；GPL-2.0 全文：[`GPL-2.0.txt`](src/assets/fonts/GPL-2.0.txt) |
| 修改说明 | [`Nota-GB16ST-NOTICE.txt`](src/assets/fonts/Nota-GB16ST-NOTICE.txt) |
| 打包位置 | `@font-face` 打进前端资源；版权与修改说明还通过 `tauri.conf.json` 的 `resources` 复制到安装包 `licenses/` |

⚠️ **根 `LICENSE` 仍然只有 BSD-2-Clause**。字体是独立数据组件，按它自己的
GPL-2.0＋字体嵌入例外分发，不改变 Nota 源码许可证；两份许可正文不得合并。
⚠️ 「关于 → 鸣谢」同步登记 `WenQuanYi Bitmap Song`，用户不需要读源码就能看到出处。
