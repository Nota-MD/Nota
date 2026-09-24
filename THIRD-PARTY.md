# 第三方组件

> 最后核对：2026-09-22
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
| `@milkdown/plugin-diagram` | 7.7.0 | MIT | Mermaid 图表。⚠️ 依赖装了、**没有插入入口** |
| `@milkdown/plugin-math` | 7.5.9 | MIT | 数学公式。⚠️ 同上 |
| `@milkdown/plugin-prism` | 7.22.1 | MIT | 代码块语法高亮 |
| `katex` | 0.16.47 | MIT | 公式渲染 |
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

⚠️ 搬进来的文件**不许改**——包括里面那 355 处写死的 `fill="#2e3436"`
（GTK 的深灰）。颜色是**用 CSS 遮罩在外面刷**的（`styles/icons.css` 里
`.icon` 的 `background-color: currentColor` + `mask-image`），
所以那些 `fill` 根本不参与渲染。改一个字节，"搬来的东西一个字节没动"
这句话就失效了，而这正是这套图标能被一眼核对的前提。
