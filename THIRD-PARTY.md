# 第三方组件

> 最后核对：2026-09-27
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
| `tauri` | 2.11.6 | Apache-2.0 OR MIT | 宿主框架（窗口、IPC、WebView） |
| `tauri-build` | 2.6.3 | Apache-2.0 OR MIT | 构建期代码生成 |
| `tauri-plugin-dialog` | 2.7.3 | Apache-2.0 OR MIT | 打开/保存文件对话框 |
| `tauri-plugin-fs` | 2.5.2 | Apache-2.0 OR MIT | 前端读写文件 |
| `tauri-plugin-opener` | 2.5.5 | Apache-2.0 OR MIT | 用系统默认程序打开链接 |
| `serde` | 1.0.229 | MIT OR Apache-2.0 | 序列化 |
| `serde_json` | 1.0.151 | MIT OR Apache-2.0 | JSON |
| `toml` | 1.1.6 | MIT OR Apache-2.0 | 读插件清单与设置文件 |
| `mlua` | 0.12.1 | MIT | Lua 插件运行时 |
| `thiserror` | 2.0.20 | MIT OR Apache-2.0 | `NotaError` 的样板 |
| `dirs` | 6.0.0 | MIT OR Apache-2.0 | XDG 目录 |
| `notify` | 8.2.0 | **CC0-1.0** | ⚠️ **目前没用到**，见 §4 |
| `similar` | 3.2.0 | **Apache-2.0** | ⚠️ **目前没用到**，见 §4 |
| `shlex` | 2.0.1 | MIT OR Apache-2.0 | ⚠️ **目前没用到**，见 §4 |
| `ureq` | 3.4.0 | MIT OR Apache-2.0 | **`nota.http`，也就是只给插件发请求用**（2026-09-24）。默认 feature 就带下面那套 TLS，**不依赖系统 OpenSSL** |

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
| `@milkdown/kit` | 7.22.1 | MIT | 编辑器内核（ProseMirror + remark 的封装） |
| `@milkdown/plugin-diagram` | 7.7.0 | MIT | Mermaid 图表（` ```mermaid ` 围栏 → `diagram` 节点）。⚠️ 它**自己从不画图**（`toDOM` 只有一句 `dom.textContent = code`），画的那一半在 `src/editor/diagram-view.ts` |
| `mermaid` | 10.9.8 | MIT | 图表渲染。⚠️ **显式列在 `package.json` 里**（不是蹭 `plugin-diagram` 的嵌套依赖）——理由写在 `src/editor/diagram-view.ts` 文件头：那个包的 `exports` 只声明了 `"."`，任何子路径 import 都会被 `tsc` 与 `vite` 双双拒掉 |
| `@milkdown/plugin-math` | 7.5.9 | MIT | 数学公式。⚠️ 同上（渲染那一半在 `src/editor/…` 与 `katexOptionsCtx`） |
| `@milkdown/plugin-prism` | 7.22.1 | MIT | 代码块语法高亮 |
| `katex` | 0.16.47 | MIT | 公式渲染 |
| `mdast-util-math` | 3.0.0 | MIT | 行内公式**用几个 `$`** 的序列化（2026-09-27 起显式列出）。⚠️ 它本来是 `remark-math` 的传递依赖，之所以写进 `package.json`，是因为 `src/editor/math-delim.ts` **直接 import 了它**（用 `mathToMarkdown({singleDollarTextMath:false})` 那条上游现成的处理器）。另一条路是自己抄一份 handler，那样会漏掉上游那两段边界处理——理由在那个文件头 |
| `react` | 19.3.0 | MIT | 界面框架 |
| `react-dom` | 19.3.0 | MIT | |
| `@tauri-apps/api` | 2.11.1 | Apache-2.0 OR MIT | 前端调后端 |
| `@tauri-apps/plugin-dialog` | 2.7.3 | MIT OR Apache-2.0 | |
| `@tauri-apps/plugin-fs` | 2.5.2 | MIT OR Apache-2.0 | |
| `@tauri-apps/plugin-opener` | 2.5.5 | MIT OR Apache-2.0 | |

### 只在开发/构建时用的

| 包 | 版本 | 许可证 |
|---|---|---|
| `@tauri-apps/cli` | 2.11.5 | Apache-2.0 OR MIT |
| `@vitejs/plugin-react` | 5.2.0 | MIT |
| `vite` | 7.3.6 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `@types/node` | 26.6.2 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |

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

## 4. 三个声明了但没用上的依赖（欠账）

`Cargo.toml` 里有三个 crate **在 `src-tauri/src/` 下零处引用**（2026-09-22 核对）：

| crate | 当初为什么加 | 现状 |
|---|---|---|
| `notify` | "文件树 / 外部改动监视"——编辑器外改了文件，树要跟着刷新 | **没接**。`tree` 命令是现算的，没有 watcher |
| `similar` | "AI 插件的 diff、Git 插件的变更预览" | **没接**。两个插件的 diff 走的是 `git diff` 的子进程输出 |
| `shlex` | "Git 插件拼命令行时的转义" | **没接**。`git.rs` 用 `Command` 逐个传参数，**不过 shell，本来就不需要转义** |

**留着还是删掉？**
建议**删掉 `shlex`**（它的理由本来就是错的，`Command::arg` 不经 shell），
`notify` 与 `similar` 等到真做对应功能时再加回来——
现在留着它们只是让每次 `cargo build` 多编三个 crate。

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
`nota-task` / `nota-keys`，以及 2026-09-25 换上去的 `nota-markdown` /
`nota-doc-theme`），原文件只存在于本仓，**没有"上游那一份"可对照**。
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

## 7. 拼写检查：**一个字典字节都不带**，BSD 那一件是 SCOWL

**2026-09-28 加**。用户点名：「拼写检查找一个 BSD 开源的属个名」。

### 7.1 这条链子长什么样

```text
设置里的开关（`editor.spellcheck`）
  → `ui/useSpellcheck.ts` → `commands/webview.rs::nota_webview_spellcheck_set`
    → WebKitGTK 的内置拼写检查（`webkit_settings_set_enable_spell_checking`）
      → libenchant-2 → hunspell → **系统装的字典**
```

⚠️ **Nota 自己不带字典、也不带引擎**：整条链子从 WebKitGTK 往下全是**系统库**，
和 §3 那批系统依赖同一性质。所以本节的义务落点是**打包**那一侧——谁把这些
打进 AppImage 或安装包**随包分发**，谁就得把下面的声明随包带上。

⚠️ 也正因为这样，**不装字典的机器上这个开关是"开着也不划红线"**——
`useSpellcheck.ts` 拿不到"引擎其实没有字典"这件事，WebKitGTK 的接口只回一个
布尔。这是这一格至今填 🟡 的理由之一（`docs/10` §8）。

### 7.2 BSD 的那一件：SCOWL

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

### 7.3 「关于」框里那一行

`src/ui/useAbout.ts` 的 `致谢` 表加了一行 **`SCOWL`（拼写检查词表）**——
与 §5 / §6 那两批同一条规矩：**真的用了、而且是用户看得见的那种**才进那张表。
完整的传递依赖闭包在**本文件**，那句话里指过来。
