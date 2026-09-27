# 06 · 依赖、构建、运行、调试与测试

> 最后同步：2026-09-27
>
> 本文是 `AGENTS.md` §3 的**展开**。§3 给的是"三条命令"，这里讲**为什么是这三条**、
> 每一步的已知陷阱、不接显示器怎么看界面、以及 `cargo test` 里那 505 条各钉住了什么。
>
> ⚠️ **测试数只在本文记数（Rust 当前 505 ／ 前端当前 566）**，别处一律写"见 `docs/06`"。
> ⚠️ **这个数别照抄——以现跑为准**（`grep -r '#\[test\]' src-tauri/src --include=*.rs | wc -l`
> 与 `cargo test --lib` 报的 `N passed` 两半互证）。同一目录可能有别的会话在改，
> 本文这段 2026-09-27 当天就落后过两次（见 §6.2 那段"当前 N 条"）。
> 理由见 `docs/07` §4 第二条漂移登记：这个总数已经漂过一次了。

---

## 1. 依赖

### 1.1 系统包（容器里那份）

**只在构建/运行时要，不随 Nota 分发。** 许可证与分发口径见 `THIRD-PARTY.md` §3。

```sh
# 一次性。容器里跑，`-u 0` 免密（宿主的 sudo 要密码）
podman exec -u 0 tauri-dev dnf install -y gcc gcc-c++ make pkgconf-pkg-config \
    webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel \
    nodejs npm git
```

| 包 | 干什么 | 少了它会怎样 |
|---|---|---|
| `gcc` / `gcc-c++` / `make` / `pkgconf-pkg-config` | 编译 Rust 与 `mlua` 的 vendored Lua 源码 | `cargo test` 第一句就失败 |
| `webkit2gtk4.1-devel` | Tauri 在 Linux 上的 WebView | ⚠️ **Tauri 2 用的是 webkit2gtk **4.1**，与 Folio 的 `webkitgtk-6.0` 不是同一个 ABI**，装错那个照样编不过 |
| `openssl-devel` | TLS | 构建期报 `openssl-sys` 找不到 |
| `libappindicator-gtk3-devel` | 托盘图标（Tauri 的可选件） | 构建期链接失败 |
| `librsvg2-devel` | 图标渲染 | 同上 |
| `nodejs` / `npm` | 前端工具链（容器里是 Node **v22.23.1**） | `npx vite build` 无从谈起 |
| `git` | 内置 Git 插件的**运行时**依赖 —— `nota.git` 是起 `git` 子进程，不是 libgit2（为什么见 `docs/13` §`nota.git` 文件头） | 插件加载**成功**，但每次调用返回一张 `code != 0` 的结果表、`stderr` 写「找不到 `git` 命令，请先安装 git」 |

容器里另有 `Xvfb` / `xdotool` / `ImageMagick(import)`，**无头目检要用**（见 §5）。
它们不在上面那条安装命令里——是 toolbox 镜像自带的，`podman exec tauri-dev command -v Xvfb xdotool import` 可确认。

### 1.2 Rust crates（`src-tauri/Cargo.toml`）

**许可证不在这里记**——那份清单在 `THIRD-PARTY.md` §1，两处不要各写一份。

| crate | 声明 | 在这里做什么 |
|---|---|---|
| `tauri` | `2`, features `["protocol-asset", "devtools"]` | 宿主框架：窗口、IPC、WebView。`protocol-asset` 给 `asset:` 协议（CSP 里那个 `asset:` 源）；`devtools` 让 **debug 构建**能开 WebView 检查器（配合 `capabilities/default.json` 的 `core:webview:allow-internal-toggle-devtools`） |
| `tauri-plugin-dialog` | `2` | 原生打开/保存/消息框。`capabilities/default.json` 里开了 `dialog:allow-open` / `-save` / `-message` / `-ask` |
| `tauri-plugin-fs` | `2` | 前端直接读写文件的通道。⚠️ **注册了但没给权限**——`capabilities/default.json` 里**没有**它的任何 permission。原则写在那个文件的 `description` 里：能用 Nota 自己的 `#[tauri::command]` 走通的，就不开插件权限 |
| `tauri-plugin-opener` | `2` | 用系统默认程序打开 URL。开了 `opener:allow-open-url` |
| `serde` / `serde_json` | `1` / `1` | 序列化。插件命令的入参出参走 JSON（`commands/plugin.rs` 文件头解释了为什么不定自定义类型） |
| `toml` | `0.9` | 读两个 TOML：插件清单 `plugin.toml` 与用户设置 `settings.toml` |
| `mlua` | `0.12`, features `["lua54", "vendored", "serialize", "send"]` | Lua 5.4 插件运行时。四个 feature 各有用处，逐条见 §1.4 之后那段 |
| `thiserror` | `2` | `NotaError` 的样板代码 |
| `dirs` | `6` | 探 XDG 目录。**只在 `paths.rs` 里用**——散落的 `dirs::config_dir()` 是将来换存法时最先烂掉的地方 |
| `ureq` | `3`（默认 feature：`rustls` + `webpki-roots` + `flate2`） | **只给 `nota.http` 用，也就是只给插件用**（2026-09-24）。选它是因为它是**同步**的——插件那一侧本来就是一条阻塞的 Lua 调用，宿主放进 `spawn_blocking` 即可；换 `reqwest` 得把 async 引到 Lua 桥的每一层。⚠️ 默认 feature 就**不依赖系统 OpenSSL**（容器里不用装 `libssl-dev`），而**开 `native-tls` 会把系统库拖回来**。见 `docs/13` §9 |
| `notify` | `8` | ⚠️ **零引用**，见 §1.4 |
| `similar` | `3` | ⚠️ **零引用**，见 §1.4 |
| `shlex` | `1` | ⚠️ **零引用**，见 §1.4 |
| `tauri-build` | `2`（`[build-dependencies]`） | 构建期代码生成，`build.rs` 里就一句 `tauri_build::build()` |

#### `mlua` 的四个 feature，每一个都是必需的

| feature | 不加会怎样 |
|---|---|
| `lua54` | 默认是 Lua 5.5/最新；`Lua 5.4` 是 Nota 对外承诺的版本（`AGENTS.md` §1） |
| `vendored` | 把 Lua 5.4 源码编进二进制，不依赖系统 `liblua`——**容器里根本没有 `liblua`** |
| `send` | ⚠️ **`Lua` 要放进 Tauri 的托管状态（跨线程），不加这个 feature 整个结构编不过**。而报错信息**不会提到** `send` 这个 feature。这条也写在 `AGENTS.md` §4b |
| `serialize` | `commands/plugin.rs` 用 `mlua::LuaSerdeExt`（`to_value` / `from_value`）在 JSON 与 Lua 值之间转 |

### 1.3 npm 依赖（`package.json`）

| 包 | 干什么 |
|---|---|
| `@milkdown/kit` | 编辑器内核总包：ProseMirror + remark 的封装。`preset/commonmark`、`preset/gfm`、若干 `plugin/*` 都从它进 |
| `@milkdown/plugin-prism` | 代码块语法高亮。⚠️ **必须显式写进 `package.json`** ——它不在 `@milkdown/kit` 的 `exports` 转发表里，而且**不是** kit 的传递依赖，漏了就是一句 `Cannot find module`（`AGENTS.md` §4b） |
| `refractor` | `plugin-prism` 底下的高亮引擎（Prism 的 hast 封装）。⚠️ **2026-09-22 起成了"直接被使用"的包**：`src/editor/create.ts` 里有一句 `import "refractor/all"`，用来把语言表从 36 种补到 400 个名字。判据同 `plugin-prism`：`src/` 里有一句 `import "x"`，`x` 就得在 `package.json` 里 |
| `@milkdown/plugin-math` | 数学公式（内部带 `remark-math` 与 `katex`）。⚠️ **依赖装了、没有插入入口**，与图表同属 backlog 第 3 项 |
| `@milkdown/plugin-diagram` | Mermaid 图表的**节点与输入规则**：`` ```mermaid `` 围栏 → `diagram` 节点（`atom`，源码存在 `attrs.value` 里）。⚠️ **它自己不画图**——`toDOM` 只有一句 `dom.textContent = code`，全包没有一处 `mermaid.render`。画的那一半是本仓的 `src/editor/diagram-view.ts`（2026-09-26）。**它也是那堆超大 chunk 的来源**（见 §4） |
| `mermaid` | 真正画图的那个（10.9.8）。⚠️ **显式列在 `package.json` 里**，不是蹭 `plugin-diagram` 的嵌套依赖——理由写在 `src/editor/diagram-view.ts` 文件头：那个包的 `exports` 只声明了 `"."`，任何子路径 import 会被 `tsc` 与 `vite` 双双拒掉 |
| `katex` | 公式渲染。⚠️ **本行已过期过一次**：原文写的是"`src/` 里没有任何一处直接 import 它"。2026-09-22 起 `src/main.tsx` **确实 import 了它的样式**（`katex/dist/katex.min.css`）——那行之前是漏的，后果见 `docs/05` §2.2。列在 `package.json` 里的另一个作用是把版本钉在 `^0.16.11` |
| `@codemirror/state` · `view` · `commands` | **源码模式**（`src/editor/source.ts`）的状态容器 / 视图 / 键位表与撤销栈。⚠️ 与 Milkdown **并列**的一套，不是它的插件——见 `docs/05` §2.5 |
| `@codemirror/lang-markdown` · `@lezer/highlight` | Markdown 的语法切分与高亮标签。`language` 那半边（`syntaxHighlighting` / `HighlightStyle`）也从 `@codemirror/language` 进 |
| `@codemirror/language` | 把 token 映射成样式的机制（`notaHighlight`） |
| `react` / `react-dom` | 界面框架（React 19，`main.tsx` 用 `createRoot`） |
| `@tauri-apps/api` | `invoke` / `listen`。**只在 `src/bridge/ipc.ts` 里用** |
| `@tauri-apps/plugin-dialog` | 前端调 dialog 插件（打开/保存对话框） |
| `@tauri-apps/plugin-fs` | ⚠️ 装了但**没给权限**，与上面对应的 Rust 侧同理 |
| `@tauri-apps/plugin-opener` | 用系统程序打开链接 |
| `@tauri-apps/cli`(dev) | `tauri dev` / `tauri build`，`package.json` 的 `app` / `app:build` 脚本调它 |
| `@vitejs/plugin-react`(dev) | Vite 的 React 支持（快刷新） |
| `vite`(dev) | 构建器。⚠️ 固定端口 `5273`、`strictPort: true`，理由见 §2.3 |
| `typescript`(dev) | `tsc --noEmit`。开了 `noUnusedLocals` / `noUnusedParameters` / `noUncheckedIndexedAccess` |
| `@types/node` / `@types/react` / `@types/react-dom`(dev) | 类型 |

### 1.4 ⚠️ 三个声明了但没用上的 crate

`notify` / `similar` / `shlex` 在 `src-tauri/src/` 下**零处引用**（口径与处置建议见
`THIRD-PARTY.md` §4，那里有"当初为什么加、现状、留着还是删掉"的完整表）。

**这一节与 `docs/06` 的依赖清单是同一件事的两面**，别只改一处：
`docs/09-doc-sync-policy.md` §2.3 钉着"`Cargo.toml` 变了要同批改 `06` 与 `THIRD-PARTY.md`"。

---

## 2. 构建与运行

### 2.1 为什么必须 `-u 1000`

**宿主（这台 Fedora）没有构建工具链**：`gcc` / `cargo` / `rustc` 全无。所以一切构建都在
toolbox 容器 `tauri-dev` 里跑。容器里有两个用户身份可选，**日常一律用 uid 1000**：

| | `-u 0`（root） | `-u 1000`（日常用户） |
|---|---|---|
| 用途 | **只用来装包**（`dnf install`，免密） | **一切构建与运行** |
| 产物归属 | 归 root | 归 uid 1000 |

用 root 构建的后果是 `src-tauri/target/` 与 `dist/` 里出现 root 拥有的文件，
**之后以 uid 1000 跑 `cargo build` 会因权限失败**——而报错长得像"编译错误"，
不像权限问题。修起来要整目录 `chown`。所以：**装包用 `-u 0`，其余一律 `-u 1000`。**

⚠️ **2026-09-26 亲历一次，把症状和修法记全。** 当时 `dist/` 已经被 root 写过，于是**在宿主上**跑的 `npx vite build` 以这一行收场：

```
[vite:prepare-out-dir] EACCES, Permission denied: /home/lqy/项目/…/Nota/dist/assets
```

注意它是**在 `2438 modules transformed` 之后**才炸的，而且出现在 `error during build:` 下面、带着一串 rollup 的调用栈——**看着像插件／打包错误，其实是权限问题**，很容易往错的方向查。死在的那一步是「清空输出目录」。当场修：

```sh
podman exec -u 0 -w "$PWD" tauri-dev chown -R 1000:1000 dist
```

⚠️ 顺带记一个可用的事实：**这台宿主机上是有 Node 的** —— `npx tsc --noEmit` 与 `npx vite build` 在宿主上跑得通（`cargo` / `tauri` 跑不通，那两个才非容器不可）。所以前端两条命令不一定要进容器；但**只要 `dist/` 曾被容器 root 写过，宿主这条就必炸**，先 `chown` 再跑。

### 2.2 四条日常命令

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota

# ① 只编译后端 + 跑单元测试（§6 那 505 条）
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test

# ② 前端类型检查
podman exec -u 1000 -w "$PWD" tauri-dev npx tsc --noEmit

# ③ 前端构建
podman exec -u 1000 -w "$PWD" tauri-dev npx vite build

# ④ 跑起来（自己带 vite dev server）
podman exec -u 1000 -w "$PWD" tauri-dev npm run app      # = tauri dev
```

`$PWD` 就是仓库根——`podman exec -w` 收的是**容器内**路径，而仓库在容器里
就是同一个绝对路径（toolbox 容器把 `$HOME` 挂进去了）。

四条命令与 `docs/09` §6 的"提交前四条"一致。`package.json` 里的脚本对照：

| 脚本 | 实际命令 | 说明 |
|---|---|---|
| `dev` | `vite` | 只起前端 |
| `build` | `tsc --noEmit && vite build` | ②③ 的合并版 |
| `typecheck` | `tsc --noEmit` | ② |
| `app` | `tauri dev` | ④，tauri 会自己按 `beforeDevCommand` 起 vite |
| `app:build` | `tauri build` | 出安装包，见 §2.4 |

⚠️ **在容器外直接 `cargo build` 会失败**（没有 GTK/WebKit 开发头）。

### 2.3 ⚠️ 两个必踩的运行坑

**① debug 二进制钉死在 `devUrl` 上。**
`src-tauri/tauri.conf.json` 的 `build.devUrl` 是 `http://localhost:5273`，
而 `cargo build` 出来的 debug 二进制是**按 dev 模式**编的——它启动后去连这个地址。
没有 vite 在跑时：

```sh
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev ./target/debug/nota    # ✗ 别这么跑
```

现象是**窗口开了、内容区一片空白**（WebKit 自己那页会显示
`Could not connect to localhost: Connection refused`），
而 ⚠️ **终端 stderr 里一句提示都没有**——所以这个问题不能靠日志发现，只能事先知道。
要跑单文件二进制就**先**起 vite：

```sh
podman exec -u 1000 -w "$PWD" tauri-dev npx vite      # 让它先起来
# 另一个终端：
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev ./target/debug/nota
```

或者直接用 `npm run app`，让 tauri 自己起。

**② 端口必须是 5273，被占了就直接失败。**
`vite.config.ts` 里 `strictPort: true`：端口被占时 vite **直接退出**而不是悄悄换一个。
这是刻意的——换端口会让 `devUrl` 指向空处，症状会变成上面那个"白屏 + 零日志"，
比一句端口冲突难查得多。

### 2.4 打包

```sh
podman exec -u 1000 -w "$PWD" tauri-dev npm run app:build            # = tauri build
podman exec -u 1000 -w "$PWD" tauri-dev npx tauri build --bundles deb # 只打 deb，验证配置用
```

#### 六种安装包，以及**为什么只能在各自的系统上打**

目标是：Windows x86_64 / arm64 的 `setup.exe`、macOS Intel / Apple Silicon 的 `.dmg`、
Linux x86_64 / arm64 的 `.deb` + `.rpm` + `.AppImage`。**六格，两类。**

**两类里的第一类：跨不过去的。** Windows 的 `setup.exe` 由 **NSIS** 生成、
macOS 的 `.dmg` 由 **`hdiutil`** 生成，两个都是原生工具，Linux 上没有；
Linux 三种反过来要 `dpkg-deb` / `rpmbuild` / linuxdeploy。
这不是配置问题，是工具链的硬约束。
⚠️ 但**"编译"和"打包"要分开看**：Windows 的**可执行文件**在 Linux 上是编得出来的
（`x86_64-pc-windows-gnu`，见下面 §2.4 末尾），跨不过去的是**安装程序**那一步。

**第二类是能省的：架构。** Windows 那一格一条 runner 就能出 x64 和 arm64
（只是换了 `--target`，SDK 是同一套）；而 macOS 那两格**必须分开**，
因为 `macos-13` 是 Intel 机器、`macos-latest` 是 Apple Silicon，
dmg 只能在对应的机器上打——**交叉那一步 Tauri 不做**。

所以落点是 `.github/workflows/release.yml`，六格矩阵。
⚠️ Linux 两格固定在 **`ubuntu-22.04`** 而不是 `ubuntu-latest`：
glibc 是**向前兼容、不向后兼容**的，在新系统上编的二进制在旧系统上会因为
找不到新符号而启动失败，22.04 是 Tauri 文档推荐的下限。

⚠️ 工作流里 **`--bundles` 一定要给**。配置里写的是 `"targets": "all"`，
在 Windows 上 `all` 会连 **MSI** 一起打，而目标是 exe 安装程序（NSIS）。
收包路径也**用的是产物目录**（`src-tauri/target/<三元组>/release/bundle/**`）
而不是 `target/release/bundle`——带 `--target` 时 Tauri 换目录，
写死路径在 CI 上会一个文件都收不到。

#### `bundle` 段里每一项为什么是那样

| 键 | 值 | 为什么 |
|---|---|---|
| `targets` | `"all"` | 本地想打哪种就打哪种（配合 `--bundles`），CI 上用 `--bundles` 收窄 |
| `category` | `"Productivity"` | ⚠️ **必须是 Tauri 2 那张枚举里的值**。可选项是 `Business` / `DeveloperTool` / `Education` / `GraphicsAndDesign` / `Music` / `Photography` / `Productivity` / `Utility` / … **没有 `Office`**。写错不会在 `cargo build` 时报——⚠️ **编到最后一刻**才 `failed to build bundler settings: invalid category`，等于多等一轮（见 §2.4 末尾那条实测） |
| `resources` | `{ "../plugins": "plugins" }` | **这就是 BUG-11 的修法**。⚠️ **键必须是目录、不能带 glob**——写成 `"../plugins/**/*"` 会打出**平的一片文件**，见下 |
| `icon` | 6 个（见 `icons/`） | Tauri 各平台各取所需：Windows 要 `.ico`、macOS 要 `.icns`、Linux 要 `.png` |
| `windows.nsis` | `languages: [SimpChinese, English]` + 语言选择器 | 中文用户双击安装看到中文。⚠️ 界面文案一律中文，但**安装器的是语言选择器**，两种都列出来让用户选 |
| `windows.nsis.installMode` | `currentUser` | 免 UAC 提权。装到用户目录，卸载干净 |
| `macOS.minimumSystemVersion` | `10.15` | 与 `tauri` 2.x 的 WebView 要求对齐 |
| `linux.deb.depends` | `libwebkit2gtk-4.1-0` / `libgtk-3-0` | Tauri 会自动填大部分，Nota 补的是**运行期真正要的那两个 soname** |
| `linux.rpm.depends` | `webkit2gtk4.1` / `gtk3` | 同上，rpm 的包名和 deb 不一样 |

#### 插件在打包后从哪儿扫（BUG-11，**已修**）

打包后内置插件的落点变了：从**资源目录**的 `plugins/` 里扫，不再是仓库根的
`plugins/`——这条分支在 `paths::builtin_plugins_dirs()`（`src-tauri/src/paths.rs:44`），
展开见 `docs/11` §插件放哪。

⚠️ **2026-09-23 之前这里是坏的**：`bundle` 段**没有 `resources` 键**，
那份 `plugins/` 根本不会被塞进包里，`resource_dir.join("plugins")` **永不命中**，
release 下也不走 `debug_assertions` 分支。**开发期看不出来**（走的是仓库目录），
只有真装一次包才会发现"一个内置插件都没有"。

⚠️⚠️ **修法改了三版，前两版都"看起来成了"**。这一节保留这条弯路，是因为**它的失败方式很隐蔽**：

| 版本 | 写法 | 实际打出来什么 |
|---|---|---|
| ① 数组 | `["../plugins/**/*"]` | 目标路径由 `resource_relpath()` 算，它把 `..` **映射成 `_up_`** → `_up_/plugins/...`，`resource_dir.join("plugins")` 命不中 |
| ② 映射 + glob | `{"../plugins/**/*": "plugins/"}` | **目录名对了、里面是错的**：`plugins/main.lua` + `plugins/plugin.toml` ——**只取文件名**，两个插件的 `main.lua` 互相盖掉一个。根因在 `tauri-utils` 的 `resources.rs`：glob 且 dest 非空时目标就是 `dest.join(path.file_name())`，树被**拍平**（源码注释自己写着 "preserving the file name as it is"） |
| ③ **现行** | `{"../plugins": "plugins"}` | ✅ 走的是 `Walk` 分支：`dest.join(path.strip_prefix(pattern))`，**保留结构**。实测包里是 `usr/lib/Nota/plugins/ai/{plugin.toml,main.lua}` + `git/` 各自一份 |

**判据：`**键要写成目录，不要写 glob**`。要吃"某几个文件"而不是"整棵目录"时，
这条不成立——那时得逐条列出来（`{"../plugins/git/main.lua": "plugins/git/main.lua"}`），
因为 glob 那一支没有保留结构的能力。

**验证方法**（三条缺一不可，只做第一条会漏掉上面的版本②）：

```sh
cd /tmp && ar x <包>.deb && tar tf data.tar.gz | grep plugins   # ⚠️ 别停在这一步，见下
# ✅ 要看到 ai/ 与 git/ 各自的子目录：
#    usr/lib/Nota/plugins/ai/plugin.toml
#    usr/lib/Nota/plugins/ai/main.lua
#    usr/lib/Nota/plugins/git/plugin.toml
#    usr/lib/Nota/plugins/git/main.lua
```

⚠️ **`grep plugins` 这一步本身不够**：上面那个"版本②"**也能** grep 到
`usr/lib/Nota/plugins/…`。**要看全量清单**
（`tar tf data.tar.gz`，不加管道）——平的布局在完整清单里一眼就能看出来。
⚠️ **宿主是 Fedora，没有 `dpkg-deb`**（`command not found`），容器里也没有——
用 `ar` + `tar` 拆，`ar` 和 `tar` 都是标准工具。
⚠️ 这三版都发生在 **deb** 上；rpm / AppImage 走的是同一份 `bundle.resources`
与同一段 bundler 代码，**但没有逐平台验过**。

#### 图标：**矢量母版在 `icons/nota.svg`**（2026-09-23 换过两次，第二次是最终稿）

`src-tauri/icons/nota.svg` 是**唯一的手写源**，其余全部由它派生：

```sh
# ① 矢量母版 → 1024 PNG（Chrome 无头光栅化，宿主就能跑，不需要容器）
google-chrome --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1024,1024 --screenshot=/tmp/master.png \
  "file://$PWD/src-tauri/icons/nota.svg"

# ② 1024 PNG → 全套（icns / ico / png / Square*Logo）
podman exec -u 1000 -w "$PWD" tauri-dev npx tauri icon /tmp/master.png
rm -rf src-tauri/icons/android src-tauri/icons/ios   # 这两个不要
```

⚠️ `nota.svg` 里写的是 `width="100%" height="100%"` + `viewBox="0 0 1254 1254"`，
**故意不给固定像素**——这样 Chrome 会按窗口尺寸整幅缩放（给 1024 就出 1024），
而不是**按原尺寸画完再裁**。少了这一条，出图会是被裁掉一角的。

⚠️ `tauri icon` 会把 `android/` 和 `ios/` 也一并生成，而 Nota 不做移动端，
留着会让人以为 Nota 有手机版。

**设计稿的来历**：用户自己画的（蓝色 `N` + 光标竖条 + 折角纸 + 三行文字），
本仓库里那份 SVG 是**照图逆向**出来的，不是设计稿的原生文件。

⚠️ **2026-09-23 换过两版**：第一版是照第一张图逆向的；用户随后把重画的稿子
放进下载文件夹，第二版（也就是现在这份）是照着它落的。两版的**设计意图没变**，
差别都在几何与用色上——底衬由"采样出来的超椭圆路径"换成**普通圆角矩形 `rx=250`**、
纸的圆角 `A52 → A70`、`N` 改成"fill + 同色 stroke + `stroke-linejoin: round`"、
光标条由渐变改成**平色 `#4f82fb`**。**具体逐条差异记在 `icons/nota.svg` 的文件头里**，
改图标之前先读那一段。

⚠️ 母版里那层浅灰底占画布约 **74%**，所以在 32px 这种小尺寸下会比较"小一圈"
（四周留白多）——这是**忠实于原图**的做法；需要图形更满时，把底衬那个 `<rect>` 整体放大即可。

⚠️ `tools/gen-squircle.py` 是给**第一版**那条采样路径（逼近超椭圆 `n=4.4`，
每象限 6 段贝塞尔）用的，第二版底衬换成了普通圆角矩形，**这个脚本暂时没有调用点了**。
留着没删：原图那个底衬确实是超椭圆的形状，若哪天要更贴原图，还得靠它重新采样。
⚠️ 那条路径是**采出来的数据**不是可读参数，手改不动；脚本默认参数跑出来的那条
与第一版里现存的那条**逐字符一致**（用脚本对着 SVG 反查过）。

#### Windows 交叉编译：**能编过，但出不了安装程序**

本机（Fedora）没有 Windows 工具链。实测的结论分三层，**第一层最容易误判**。

**① 目标必须是 `x86_64-pc-windows-gnu`，`msvc` 在这台机器上走不通。**
⚠️ Tauri 文档和网上都主推 `cargo-xwin` + `msvc`，那条路在这里**失败得极像"代码写坏了"**：

```text
error[E0514]: found crate `core` compiled by an incompatible version of rustc
error[E0514]: found crate `compiler_builtins` compiled by an incompatible version of rustc
error: cannot find macro `include_str` in this scope
error[E0405]: cannot find trait `Clone` in this scope
error: requires `sized` lang_item
…（`serde_core` 一个包就 5883 个报错）
```

⚠️ **根因跟代码一行关系都没有**：本机 rustc 是 Fedora 打过补丁的 RPM
（sysroot 在 `/usr`，**没有 rustup**），编译器哈希与 `static.rust-lang.org`
发的 `rust-std` 对不上。`E0514` 于是把 `core` 判成"别的编译器编的"，
**凡是从 `core` 来的东西全部找不到**——`Ok` / `Err` / `Clone` / `Sized` /
`include_str!` / `derive` / `assert!` 一起消失，每个包都塌成一堆 E0425/E0405。
出现 `cannot find macro panic` 时，先确认有没有 E0514——原因不在代码里。

⚠️ 而且 **msvc 在 Fedora 上无解**：`dnf list rust-std-static*` 里只有
`*-windows-gnu` / `wasm32*` / `none` / `uefi`，**没有任何 msvc**。
手动解进去的那份 std 现在挪到了容器的 `/root/msvc-std-rejected`（留作证据，不要装回去）。

**② `windows-gnu` 是 Fedora 自带的，版本戳天然对得上，编得出来。**

```bash
podman exec -u 0 tauri-dev dnf install -y \
  rust-std-static-x86_64-pc-windows-gnu mingw64-gcc mingw64-winpthreads
```

`rust-std-static-x86_64-pc-windows-gnu` 是 Fedora 自己编的（`rpm -qf` 查得到，
不像解进去的那份"不属于任何包"），所以没有 E0514；`mingw64-gcc` 提供链接器。
实测（`cargo-xwin` 那套完全不用装）：

```bash
cd src-tauri && cargo build --release --target x86_64-pc-windows-gnu   # 约 4 分半
```

得到 `src-tauri/target/x86_64-pc-windows-gnu/release/nota.exe`，
`file` 认它是 **PE32+ executable for MS Windows 5.02 (GUI), x86-64**，26 MB。

⚠️ **这不是 CI 出的那个包**：这里是 mingw（gnu），CI 用 msvc。
**mingw 编过 ≠ msvc 编过**，所以它不能当替身。它唯一的价值是
**在本地提前发现"这段代码在 Windows 上根本编不过"**（比如误用了 unix 专有的 API）。

**③ 出不了 `setup.exe`，arm64 也不行。**

- NSIS 那一步要 `makensis`，而非 Windows 宿主上 Tauri 是**下载 NSIS 再用 `wine` 跑**的。
  容器里 `wine`、`makensis` 都没有，**装 NSIS 自带的 makensis 也没用**——
  tauri-bundler 只认自己下载的那份，不读 `PATH`。所以安装程序仍然只能在 CI 上出
- `aarch64-pc-windows-*` 的 std 在 Fedora 仓库里**根本没有**（gnu 的也没有），
  Windows arm64 同样交给 CI

口径不变：**CI 是 Windows 包的唯一出处**，本地交叉编译只是提前报警
（CI 的六格矩阵见上面 §2.4 开头，Windows arm64 走 `windows-latest` 原生 runner）。

---

## 3. 调试旋钮

### 3.1 后端打出来的那几行

后端**没有日志框架**，全部是 `eprintln!` 到 stderr。⚠️ 但从 **2026-09-25** 起，
**默认一行都不打**（用户要求）：宿主是给人用的桌面程序，双击图标进来的人
看不到 stderr，从终端跑的人也会被「载入 2 个插件」这类行刷得以为哪里不对。

**想看就先开调试闸门**：

```sh
NOTA_DEBUG=1 npm run tauri dev
```

闸门只有一处实现：`src-tauri/src/log.rs`（一个 `OnceLock` 缓存的环境变量 ＋
`日志!` 宏）。下面这些调用点**全走它**。⚠️ **新加 stderr 输出也走 `日志!`**，
不要再写裸 `eprintln!`——那会把"默认静默"这条规矩一点点漏掉。

⚠️ **同一份二进制上实测过三遍**（2026-09-25，无头 `:96`，日志各存在
`/tmp/nota-ol-{A,B,C}.log`）。⚠️ 三遍里**都**有那两行 `MESA-EGL: warning: DRI3 …`——
那是 Xvfb 上 Mesa 自己打的，**不是应用打的**，别把它当成"闸门漏了"：

| 环境变量 | stderr 里应用自己的行 |
|---|---|
| 不设（默认） | **0 行**（140 字节，全是 Mesa 那两行） |
| `NOTA_DEBUG=0` | **0 行** —— "关"是字面意义上的关，不是"只认 1" |
| `NOTA_DEBUG=1` | `[nota] 调试模式（NOTA_DEBUG）…` ＋ `[nota] 已关闭 WebKitGTK 的 DMABUF 渲染器…` ＋ `[nota] 载入 2 个插件` |

| 位置 | 打出什么 | 什么时候看它 |
|---|---|---|
| `log.rs`（`run()` 开头） | `[nota] 调试模式（NOTA_DEBUG）；下面这些行默认不输出…` | **闸门开着的第一句**。没看到它，就说明变量没传进来（设在了另一个终端、或者写成了 `NOTA_DEBUG=0`） |
| `lib.rs` `run()` | `[nota] 载入 N 个插件` | **启动第一句该看的**。N 比预期少，就是有插件没被扫到（清单读不了会另打一行） |
| `plugin/mod.rs` `discover()` | `[nota] 插件清单读不了：{e}` | ⚠️ **清单解析失败的插件不会出现在插件列表里**，只在这里有一行。现象是"装了插件但列表里没有它" |
| `lua/mod.rs`（卸载） | `[nota] 插件 {id} 的 on_unload 出错：{e}` | 退出时。卸载报错只记不抛，不卡卸载流程 |
| `lua/api/mod.rs`（`nota.log` 那一族） | `[nota:{插件 id}] INFO/WARN/ERROR {消息}` | 插件的 `nota.log.*`。多插件同时刷输出时靠前缀分清是谁。⚠️ **插件别拿它当用户提示**——默认不输出；要对用户说话走 `nota.ui.notify` |
| `lib.rs` `setup()` | `[nota] 读设置失败，本次用默认值：{e}` | 一份坏掉的 `settings.toml` **不会**让应用打不开。⚠️ 但**用户看到的是启动 toast**（BUG-23 的修法），这一行只给开发者（`state.rs::settings_problem`） |
| `lib.rs` `兜住_webkit_的_dmabuf_渲染器()` | `[nota] 已关闭 WebKitGTK 的 DMABUF 渲染器…` | Linux 上每次启动都有（自己设过 `WEBKIT_DISABLE_DMABUF_RENDERER` 就没有），所以它从前是最吵的一行 |
| ~~`lib.rs` `nota_startup_file()`~~ | ⚠️ **这一处 2026-09-25 撤了** | 命令行那个文件名不是合法 UTF-8 时，现在改成**报错给前端**（`NotaError::NonUtf8Path`）→ 启动那段弹一条提示条。原来那句 stderr 静默的后果是"双击了没反应"，记在 `docs/07` §2 |
| `lua/api/settings.rs` | `[nota] 插件设置文件读不了（本次当空的用）：{路径}：{e}` | 插件的 `settings.toml` 坏了，插件拿到一张空表 |
| `native_menu.rs` `leaf_accel()` | `[nota] 原生菜单：菜单项 {} 的快捷键 "…" 转不成原生写法，这一项不带快捷键` | 菜单项**照样能点**，只是没有快捷键——界面上看不出异常 |

⚠️ **"默认静默"不等于"用户什么都看不到"**：真正该让用户知道的失败**都有界面出口**
（启动 toast、提示条、侧栏插件页那行红字）。判据是一句话——
**用户看了也不知道该做什么的，才收进闸门。**

### 3.2 前端打出来的那几行

| 位置 | 打出什么 |
|---|---|
| `src/App.tsx` 启动那一段的握手 `catch` | `[nota] frontendReady 失败：` —— 握手失败不影响使用，只记一笔 |
| `src/ui/ErrorBoundary.tsx:30` | `[nota] 渲染出错：` + `componentStack` |
| `src/ui/ErrorBoundary.tsx:64` | `[nota] 未处理的 Promise 拒绝：` |
| `src/ui/ErrorBoundary.tsx:67` | `[nota] 全局错误：` |

⚠️ **这几行没有进 §3.1 那道调试闸门**（2026-09-25 定）：它们压根不出现在终端里
（Tauri **不转发** WebView 的控制台），而"要看它得先按 Ctrl+Shift+I 开 devtools"
这个动作**本身就等于调试模式**——所以前端不必再加一个开关。

`installErrorHooks()` 在 `src/main.tsx` 里**在渲染之前**调——理由写在那个文件的注释里：
**打包后的应用没有 devtools，那时未捕获的 Promise 拒绝就是彻底静默的。**

⚠️ **`src/main.tsx` 里那串 CSS import 的次序是有讲究的，不能按字母排**：
`theme.css` 打头，`app.css` 跟上，然后 `sidebar.css` / `dock.css` / `gate.css` /
`settings.css` / `editor.css` / `diagram.css` / `diff.css` / `review.css` / `bars.css` / `icons.css`
**一律在 `app.css` 之后**（⚠️ 这里原来写的是 `slidev.css`——那份 2026-09-25 改名成了
`gate.css` 并**挪到了 `dock.css` 之后**，见 `docs/04` §2.6e；`diff.css` / `review.css`
是 2026-09-25 新加的；`diagram.css`（图表那块的错误卡 / 空态 / 预览壳）是
**2026-09-26** 加的，插在 `editor.css` 之后——它要盖的是 `editor.css` 里
`.ProseMirror` 那一族给块级节点定的默认样式）。它们的选择器都有和 `app.css`
重叠的部分（`.confirm-dialog` 的宽度、`.ProseMirror` 那棵树、`.app-main` 的 `flex`、
折叠三角与缩进那几条），**同权重靠顺序取胜**。其中 `editor.css` 那条最要命：
顺序反了，正文区的字号、行高、代码块底色会被外壳那几条整片盖掉，而**没有任何报错**。
`icons.css`（2026-09-24 加的，那套图标的遮罩画法）与上面几份**没有重叠的选择器**，
接在 `bars.css` 后面只是照这条规矩来；它**没有** `.sr-only`（可读名字走 `aria-label`），
不能因为看着少了点什么就补回去。全文件**最后一行**是 `katex/dist/katex.min.css`，
理由见 `docs/05` §2.2（少了它公式只有 HTML 没有排版）。

这些都在 WebView 的控制台里，要看它得先开 devtools（见 §3.3）。

### 3.3 WebView 检查器

`tauri.conf.json` 依赖里 `tauri` 开了 **`devtools`** feature，
`capabilities/default.json` 里开了 `core:webview:allow-internal-toggle-devtools`。
所以 **debug 构建**里可以开 WebView 检查器（默认快捷键 **Ctrl+Shift+I**），
看控制台、看 DOM、看 `data-ui-*` 三个属性有没有落上（`applyTheme` 的效果）。

⚠️ 检查器只在 debug 构建里有。release 包里前端出错就只剩 §3.2 那三行
——而它们在 release 里也没有地方显示，所以**发布前一定要在 debug 里过一遍**。

### 3.4 环境变量

| 变量 | 作用 | 值 |
|---|---|---|
| `RUST_BACKTRACE` | Rust panic 的栈 | `1`（或 `full`）。⚠️ 宿主的 panic 多半在 `setup()`，这时**只有**这一条能给出位置 |
| `GDK_BACKEND` | 强制 GTK 走哪个后端 | `x11`。无头目检时要（§5） |
| `WEBKIT_DISABLE_COMPOSITING_MODE` | 关掉 WebKit 的合成层 | `1`。⚠️ **Xvfb 下不开它常常抓到一片黑**：没有 GPU 合成器时 WebKit 的加速路径会渲染不出来 |
| `TAURI_DEV_HOST` | 让 vite 监听一个可达的 host，并把 HMR 挂到 5274 | 由 `vite.config.ts` 读（`process.env.TAURI_DEV_HOST`）。只在容器/远程开发时才需要 |
| `TAURI_ENV_DEBUG` | 由 tauri 在 dev 时自己设 | `vite.config.ts` 用它决定**不压缩 + 出 sourcemap**。所以 dev 构建的 JS 是可读的 |
| **`NOTA_DEBUG`** | **打开后端调试输出**（2026-09-25 加，见 §3.1） | `1` / `true` / `yes` / `on`（不分大小写）。⚠️ **默认关着，关着时后端一个字都不打**。它只管 stderr——前端的 `console.*` 不走它（那要看 devtools，§3.3） |
| `NOTA_SLIDEV_CMD` | **换掉 Slidev 的启动命令**（空格分词） | 默认 `npx @slidev/cli`（⚠️ 2026-09-24 去掉了 `--yes`：它的意思是「别问，直接下几百 MB」，正是"点了菜单半天没反应"的成因）。⚠️ **2026-09-25 起这个变量名由插件自己报**：`plugins/slidev/plugin.toml` 的
`[devserver] cmd_env = "NOTA_SLIDEV_CMD"`，读到它的仍然是 `proc::command_or_default` 那一处
（`manifest.rs:253` 的 `DevServerSpec::command`），探测与启动跑的是**同一条命令**。用途照旧：不下载真 Slidev 也能验那条链（指向 `tools/stub-slidev.py`，见 §5.7） |
| `NOTA_PANDOC_CMD` | 换掉探测/调用 pandoc 的命令 | 同形状（`proc.rs::command_or_default` 读它）。⚠️ **探测和导出共用同一条命令**，所以改它两边一起变 |

⚠️ **应用自己读的自定义变量就三个**（2026-09-25 更正；这句话以前写的是
"只有 `NOTA_SLIDEV_CMD` 一个"，`NOTA_PANDOC_CMD` 加进来之后就成了过期信息）：
`NOTA_DEBUG` / `NOTA_SLIDEV_CMD` / `NOTA_PANDOC_CMD`——全部**只在一处读**
（`log.rs::开着()`、`proc.rs::command_or_default`）。Folio 那边有十几个
`FOLIO_*` 变量，这边的口径是**每加一个都要有"不改代码就能验一条链"的理由**，
而不是留一堆旋钮。排查主要靠 §3.1（开 `NOTA_DEBUG`）与 §5 的抓图。

> `tools/open-window.sh` 自己还认四个（`NOTA_CONTAINER` / `NOTA_DISPLAY` /
> `NOTA_PORT` / `NOTA_WINDOW_LOG`）——那些是**脚本的参数**，应用不知道它们存在，
> 用法写在那个脚本的文件头。

### 3.5 前端热重载（HMR）

`npm run app` 时 vite 带 HMR：改 `src/**` 存盘即刷新，**不用重启 tauri**。

⚠️ **改 `plugins/**` 不在其列。** `vite.config.ts` 的 `server.watch.ignored` 明确忽略
`**/src-tauri/**`；而 `plugins/` 不在监听范围内。debug 构建确实会扫仓库根的 `plugins/`
（`paths.rs:54`，`cfg!(debug_assertions)` 那条分支），所以**改完 Lua 不用重编 Rust**
——但**要重启应用**，因为插件只在 `setup()` 里加载一次
（`lib.rs` 的 `PluginHost::discover`）。

### 3.6 顺手的两条

```sh
# 后端只跑某一条测试（中文测试名可以直接当过滤串）
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test 通道名

# 看真实落盘的设置（三条外观轴的存法）
cat ~/.config/nota/settings.toml
```

### 3.7 ⚠️ 三条测试用例自己造的坑（踩过，2026-09-22）

**现象**：`cargo test` 突然有两条失败，报的是这个：

```
panicked at src/lua/api/mod.rs:298:10:
called `Result::unwrap()` on an `Err` value: Os { code: 13, kind: PermissionDenied, ... }
```

失败点在 `造清单()` 里 `std::fs::write(dir.join("plugin.toml"), ...)` 那一句，
而**跟能力、跟清单格式、跟这次改动一点关系都没有**。

**根因**：那几条用例往 `std::env::temp_dir()` 下写 `nota-api-test-<名字>/`，
而**曾经有一次 `cargo test` 是用 `-u 0`（root）跑的**——那几个目录就成了 `root:root`。
之后用 `-u 1000` 跑，`remove_dir_all` 失败（**被 `let _ =` 吞掉了，连一行输出都没有**），
紧接着 `create_dir_all` 撞上 root 的目录，`PermissionDenied`。

**修法**（先确认，再动手）：

```sh
podman exec -u 1000 tauri-dev ls -ld /tmp/nota-api-test-*     # 看 owner 是不是 root
podman exec -u 0    tauri-dev rm -rf /tmp/nota-api-test-*     # 只有清掉才要 root
```

**两条规矩**：

- ⚠️ **跑 `cargo test` 一律 `-u 1000`。** `-u 0` 只给 `dnf install` 用（`docs/06` §2）。
  用 root 跑一次测试，就会给后面每一次留下一样 root 的目录。
- ⚠️ **报错位置离根因很远时，先怀疑环境而不是先读代码。** 这条的失败点在
  "写一个临时文件"，而真相是"那个目录属于 root"——**中间隔着一次被 `let _ =`
  吃掉的失败**。`let _ =` 在这里是对的（"目录不存在"是正常情况），
  但它会让失败现场静默，所以**看到 PermissionDenied 就先 `ls -ld` 看一眼 owner**。

### 3.8 ⚠️⚠️ 容器与宿主**共用 PID 命名空间**：容器里的 `pkill` 会打死宿主 shell

**现象**：在容器里跑带 `pkill` 的脚本，`podman exec` 报 **退出码 144**，
而且**发起命令的那条宿主命令行里，排在后面的命令静默不执行**——
`echo`、`cat`、`ls` 一个都没输出，看起来像工具坏了。

```sh
# 这样写就会中招：heredoc 里的模式串出现在**宿主**自己的 cmdline 里
podman exec -u 1000 tauri-dev bash -c 'pkill -f "tauri dev"; …'
echo "这行会不会执行 —— 看运气"
```

**根因**（2026-09-22 查清）：`tauri-dev` 这个容器**和宿主共享 PID 命名空间**
（工具链容器为了能用宿主 D-Bus/X11 往往会带上 `--pid=host` 一类设置）。
于是容器里的 `pkill -f 'tauri dev'` 能看见**宿主进程**——而"发起命令的那个宿主 shell"
的命令行里恰好含有这串模式（脚本用 heredoc 写在同一条命令里），
于是它**匹配了自己、把自己打死了**。

⚠️ **此前把这个现象误记成"podman 报了假的退出码，忽略即可"——那是错的。**
它是真的把父进程杀了，只是**在脚本跑完之前还是之后有随机性**：

| 那次 `pkill` 的结果 | 脚本本身 | 观察到的现象 |
|---|---|---|
| 脚本先跑完 | 完整跑完，日志齐全 | 只有退出码 144，看着像"podman 的问题" |
| 先打到父进程 | **连带被杀**，日志文件根本没生成 | 退出码 144 **且**截图/日志全无 |

`verify8` 是前者、`verify9` 是后者——**同一个写法，两次结果不同**，
所以"忽略退出码"这个经验一直没被证伪。

**规矩（两条，都要照做）**：

1. ⚠️ **验证脚本一律用 Write 工具直接落盘**，不要用 heredoc 从宿主命令行写。
   这样模式串**只出现在脚本文件里**，不会出现在任何一条宿主命令行里。
   跑法就是干净的一句：`podman exec -u 1000 tauri-dev bash /tmp/xxx.sh`。
2. ⚠️ **成败看日志文件，不看退出码。** 脚本里把每一步都 `echo` 出来重定向到
   `/tmp/vN.log`，跑完读那个文件。退出码 0 与 144 都说明不了什么。

⚠️ 还有一条相关的自匹配：`pgrep -af '<模式>'` / `pkill -f '<模式>'` 会匹配
**发起它的那个 shell 自己**。`[t]arget/debug/nota` 这种方括号写法能绕开
**同一个命令行里的自匹配**，但**绕不开上面这条**（模式串出现在别处，比如 heredoc
正文里）。所以方括号是补丁，**Write 落盘才是治法**。

---

### 3.9 ⚠️ 并行跑测试随机报 `Text file busy (os error 26)`（已修，2026-09-25）

**现象**：`cargo test --lib` 并行跑，十几回里有**一两回**坏一两条，报的是：

```
---- pandoc::tests::相对路径的图片按文档目录找 stdout ----
panicked at src/pandoc.rs:776:10: 应该成功:
  Other("起 `/tmp/nota-pandoc-test-cwd-bin-531328/假pandoc` 失败：Text file busy (os error 26)")
```

⚠️ **`--test-threads=1` 连跑三回全绿**，而失败的那几条**与被改动的代码毫无关系**——
这就是最早的分辨依据：**并行坏、串行绿的，先怀疑机制，别改测试**。

**根因**（2026-09-25 查出来的，**不是测试写错了**）：

> `fork` 会把整个 fd 表复制一份给孩子，而 close-on-exec 要等**那个孩子自己 `exec`
> 的那一刻**才生效——在那之前，它手里攥着我们早先写脚本时那个可写 fd 的副本。
> 于是"写脚本 → `close` → `chmod` → `spawn`"这条路上，只要**另一条线程**在我们
> `write` 的那一刻恰好 `fork` 了一次，那个孩子就能让我们的 `execve` 吃 `ETXTBSY`
> （`execve` 的 `deny_write_access` 判的是"这个 inode 有没有人开着写"），
> 而那个孩子的 `exec` 排在前面还是后面**全看调度器**。

复现是拿 Python 做的（四条线程各跑 150 轮 `write`+`chmod`+`fork`+`exec`）：不重试时
600 轮里错 **13~34** 轮；而**先写成 `s.tmp` 再 `rename` 进去没用**——`rename` 换的是
名字、不是 inode，攥着旧 fd 的孩子照样拦。📌 这一条也顺手排除了"把夹具写得更小/更快"
这类改法：窗口不在我们的线程里，改夹具一点用都没有。

**修法**：`proc.rs::spawn_retrying`——碰 `ETXTBSY` 等一小下再试（5 + 20 + 60 毫秒）。
两个 `spawn` 的地方都走它（`run_capture` 与 `devserver` 起进程那一处；⚠️ 后者原来写作
`slidev::spawn_with`，那个文件 2026-09-25 并进了 `devserver.rs`）。⚠️ 这**不是**在掩错误：
`ETXTBSY` 本来就是暂时状态（另一头可能是编辑器正在存那个包装脚本、包管理器正在装它），
真错误（权限不对、格式不对、目录不存在）报的是别的 errno，**一次都不会重试**。

**判据**：`proc::tests::文件正被别人写着时等一下再起` 把那个随机状态**做成确定的**
（自己拿着可写 fd 不放、另一条线程 40ms 后放掉）。把它短路掉，它就如实报
`Failed("… Text file busy (os error 26)")`；修好之后 `cargo test --lib` 并行连跑
**16 回全绿**（199 条；⚠️ 那时还没算上插件装卸那一批，到 2026-09-25 末是 226，**2026-09-26 是 247、当晚 278、第二批收工 308**——见 §6）。

---

## 4. 已知的构建噪音

**下面这些都不是问题，不要为它们改代码：**

| 输出 | 说明 |
|---|---|
| `Gtk-Message: Failed to load module "canberra-gtk-module"` | 容器里没装 `libcanberra-gtk3`（事件音效）。**纯装饰**，与应用功能无关 |
| `(!) Some chunks are larger than 500 kB after minification.` | 见下 |
| `warning: unused ...`（若出现） | 目前 `cargo test` 是**零警告**；一旦有警告，先当真的处理 |

**超大 chunk 警告**是**已知且已登记**的欠账，不是配置错误：

| chunk | 体积 |
|---|---|
| `flowchart-elk-definition` | 1,451 kB |
| `index`（主包） | 1,373 kB |
| `mindmap-definition` | 543 kB |
| 外加 `flowDiagram` / `sequenceDiagram` / `ganttDiagram` / `c4Diagram` 等十几个 20–85 kB 的 |

⚠️ 那十几个 chunk **全部来自 mermaid**（`mermaid` 是显式依赖，见 §1.3；
`@milkdown/plugin-diagram` 只是把 `mermaid` 当依赖带着）。
⚠️ **2026-09-26 更正**：这一段原来写着「来自 `@milkdown/plugin-diagram` 自带的 mermaid」，
并建议"如果一直不做图表插入，可以考虑先把 `plugin-diagram` 摘掉"——**图表那天做了**
（`` ```mermaid `` 围栏 → 渲染，落点 `src/editor/diagram-view.ts`），所以那条建议
**已经作废，不要再照它摘包**：摘掉等于把图表功能删掉。
处置意见改为 `docs/07` backlog **第 27 项**（前端代码拆分）那一条：
按需加载（`import()` 动态引入 `mermaid`），让这几个大 chunk 不压在首屏上。
调 `build.chunkSizeWarningLimit` 去消警告不可取，那只是把警告藏起来，体积并没有变。

---

## 5. 无头目检（容器里没有显示器时）

`docs/07` §1 那张"真的能用"表，验法一栏写的就是 `docs/06` §5 ——**就是这一节**。
这一节整节是**在容器里实测过的**（2026-09-22），不是设想的流程。

### 5.1 四步

⚠️⚠️ **第 ② 步（起 vite）和第 ③ 步是二选一的，不是都要做**（2026-09-27 标注）：
本节写的是**连着 vite 跑**的路子（改前端热更新、不用重建），而 **§5.30 那条
"改了前端就必须 `npm run build`"说的是另一条路**——**直接跑 `./target/debug/nota`
吃的是 `dist/`**。两条本身不矛盾，但**照着本节四步一步一步抄下来会以为"起了 vite
就够了"**：如果 `dist/` 是旧的、你又没起 vite，看到的就是旧界面（那种"改了没生效"
最容易被当成没改对）。**判据很简单**：起了 vite 走开发服务器；没起就必须先
`npm run build`。⚠️ 本节早先那句"⚠️ 必须先起"只在**这条路子**里成立。

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota

# ① 起一个虚拟显示器（放后台）
podman exec -d -u 1000 tauri-dev Xvfb :99 -screen 0 1400x900x24

# ② 起 vite（⚠️ 只有"连着开发服务器跑"这条路需要它；不跑它就得先 npm run build，见 §5.30）
podman exec -d -u 1000 -w "$PWD" tauri-dev npx vite

# ③ 起应用，把显示指到 :99
podman exec -d -u 1000 -w "$PWD/src-tauri" \
    -e DISPLAY=:99 -e GDK_BACKEND=x11 -e WEBKIT_DISABLE_COMPOSITING_MODE=1 \
    tauri-dev ./target/debug/nota

# ④ 抓图
podman exec -u 1000 -e DISPLAY=:99 tauri-dev import -window root /tmp/shot.png
podman cp tauri-dev:/tmp/shot.png /tmp/shot.png     # ⚠️ 图片在容器里，要拷出来才看得到
```

**读到的画面**：窗口**居中**，尺寸 1100×760（`tauri.conf.json` 里写的
`width`/`height`），左侧「文件 / 大纲」两页，中间主页，右侧插件栏，底部状态栏。
第一轮抓到的图里，插件栏里两个内置插件都是**「已加载」**。
⚠️ 2026-09-22 起插件栏在**右**边（原先在左侧第三页），左侧只剩两页；
窗口大小没变，所以「中间那栏」的像素宽度比原来窄了 260px。

⚠️ **窗口位置跟屏幕大小走，不能照抄某个数**：`1400x900` 的屏上量到 `(150,70)`，
`1500x1050` 的屏上量到 `(200,145)`。**每次先 `xdotool getwindowgeometry` 量一遍**
（它给的是**客户区左上角**；无 WM 时没有边框，所以那个数就是内容原点）。
尺寸 1100×760 是 `tauri.conf.json` 定死的，这个值可以照用。

⚠️ **等窗口不能只等 180 秒。** 起应用那一步若是 `cargo run`，而上一轮又跑过
`cargo test`，**两边交替会让构建产物互相作废，于是每次都在从零重编**——
实测 463/529 → 529/529 用了将近 4 分钟。等 180 秒的脚本会在这时候放弃并打印
「没等到窗口」，**但编译照常在后台跑完、窗口随后就起来了**。所以：
要么等够（`for i in $(seq 1 120)`），要么脚本超时后别急着重启，
先 `pgrep -af 'target/debug/nota'` + `xdotool search --name Nota` 看一眼——
**很可能 app 已经在跑了**，那就接上去接着驱动，不必再花四分钟。

⚠️ `-screen 0` **必须比窗口大**（1100×760）。用 `900x700` 试过：窗口被裁，
抓到的是一片白，看不出是加载失败还是被裁——会因此在错误的怀疑方向上花掉大量时间。

### 5.2 ⚠️ 两个坑

**① 不能走 GNOME 的截图 D-Bus。**
`org.gnome.Shell.Screenshot.ScreenshotWindow` 对**非 shell 调用者**返回 `AccessDenied`
——它只认 GNOME Shell 自己。所以抓真桌面这条路是堵的，**走 Xvfb + `import`**。
（`import` 是 ImageMagick 的；容器里有 `import` / `convert` / `magick` 三个入口。）

**② 没有窗口管理器，`xdotool windowactivate` 一定失败。**
Xvfb 起的是**裸 X 服务器，没有 WM**，所以：

```sh
xdotool windowactivate <id>
# Your windowmanager claims not to support _NET_ACTIVE_WINDOW, so the attempt to
# activate the window was aborted.
# xdo_activate_window on window:<id> reported an error
```

**用 `windowfocus` 代替**——它走 `X_SetInputFocus`，不需要 WM。
`getactivewindow` 同样会因缺 `_NET_ACTIVE_WINDOW` 而失败，
**要看当前焦点用 `xdotool getwindowfocus`**。

### 5.3 ⚠️ 第三个坑：`search --name Nota` 会返回一堆窗口

实测 `xdotool search --name Nota` 从来不只回一行。**主窗口混在一堆 GTK 内部窗口里**，
而且 ⚠️ **2026-09-25 起主窗口的名字不再恒为 `Nota`**（第 51 项：标题跟着当前文档走，
见 §5.19），所以"按名字认窗口"这条路**从根上就不该走**。

在这一台（`:96`，`nota /tmp/nota-fixture/words.md`）实测到的一组：

| 窗口 | 名字 | 几何 | 是什么 |
|---|---|---|---|
| `8388609` | `nota` | **10×10，不可见** | GTK 的内部窗口 |
| `8388658` | `nota` | **10×10，不可见**（在 -100,-100） | GTK 的内部窗口 |
| `8401590` | `nota` | 931×52，在 (312,101) | 又一个内部窗口（浮层一类） |
| `8388611` | `字数样张 — Nota` | **1100×760，在 (151,92)** | **这才是主窗口** |

⚠️ **四个的 `WM_CLASS` 与 `_NET_WM_PID` 完全一样**（都是 `"nota", "Nota"`、同一个 PID），
所以 `--class` / `--pid` **也筛不出来**，只能按几何挑。
⚠️ 而 `--name '^Nota$'` 之所以还能**顺带**命中主窗口，是因为 xdotool 的 `--name`
连 `WM_CLASS` 一起匹配（`res_class` 正是 `Nota`）——**这是巧合，不是判据**。

⚠️ **对那个 10×10 的窗口调 `windowfocus` 会报 `BadMatch`**：

```
X Error of failed request:  BadMatch (invalid parameter attributes)
  Major opcode of failed request:  42 (X_SetInputFocus)
```

它不是因为 `windowfocus` 不能用，而是因为那个窗口**不可见**（`X_SetInputFocus`
要求目标 viewable）。所以选窗口**按几何挑，不要按名字挑**。

⚠️ **门槛别用 `-gt 100`**：上表那个 931×52 的内部窗口比 100 宽得多，
按这个条件它会**排在主窗口前面被选中**（`break` 取第一个命中的），
而它就是那个 `windowfocus` 会报 `BadMatch` 的东西。
判据用 `tauri.conf.json` 里写死的那两个下限（`minWidth: 560` / `minHeight: 400`）
——**比最小尺寸还小的窗口，不可能是主窗口**，这句话是配置说了算的：

```sh
# 挑那个不小于窗口最小尺寸的
W=$(xdotool search --name 'Nota' | while read w; do
      eval "$(xdotool getwindowgeometry --shell "$w")"
      [ "$WIDTH" -ge 560 ] && [ "$HEIGHT" -ge 400 ] && echo "$w" && break
    done)
xdotool windowfocus "$W"        # ✔ 成功
```

⚠️ **读标题验事的时候不用挑窗口**：`xdotool getwindowname <id>` 直接读 `WM_NAME`，
**不需要 WM、不需要窗口可见**，比截图那一路稳（截图还得有个 WM 把标题栏画出来
才看得见——`:96` 上跑着 Openbox，别的显示号上未必有）。见 §5.19。

### 5.4 驱动界面

```sh
# 点「新建文档」（坐标按 1400x900 的 root 量；窗口在 (150,70)）
xdotool mousemove 668 290 click 1
sleep 3                                   # ⚠️ 给 ProseMirror 挂载留时间
xdotool type --delay 30 "# Hello Nota"    # ASCII 可以
```

⚠️ **坐标要"量"，不要"估"**（2026-09-22 因此走过一次弯路，前后试了五个脚本）。

`import -window root` 出的文件是 1500×1050，但**按截图目测读出的坐标
和真实像素对不上**：标签栏真在 `y≈862`，按看图估的 820 去点——那一行还是
**编辑区**，于是"点了没反应"。接着一路怀疑到 `onClick` 没接上，而
`src/App.tsx:500` 那个 `onClick={() => props.onSelect(d.id)}` 一直是好的。
**这一段自始至终没有 BUG，错的是测量用的坐标。**

要按坐标点之前，先裁一小块放大核一遍：

```sh
# ⚠️ ImageMagick 7 里 convert 会打一条 deprecated 警告，用 magick
podman exec tauri-dev magick /tmp/shot.png -crop 500x65+200+840 +repage -scale 300% /tmp/crop.png
```

裁块里"目标在第几行第几列"是能直接数出来的，除回去就是真实坐标。

📌 判据：**点击"没反应"时，先证明坐标对得上，再怀疑代码。** 同一个脚本里
顶栏那个 `插件` 按钮一点就动（侧栏整块消失），这说明合成点击本身有效，
问题只可能在落点上。

📌 另一条：**"悬停没反馈"不一定是没收到指针事件**——要看那个元素
**有没有 `:hover` 规则**。`.tab-label` 就没有（只有 `.tab-close:hover` 有，
见 `app.css:661`），拿它当探针等于没测。

📌 **"这个装饰到底落到 DOM 上了没有"——别猜，加一条临时 CSS 问它。**
2026-09-26 实测：宽松标题那条装饰（`lax-heading.ts`，`Decoration.node` + `nodeName`）
在开窗里看着"怎么都不生效"，一路怀疑到 `$prose` 的装配方式、缓存键、主题里
`h1` 与内层 `p` 的字号继承——**真正分清楚只用了三步**：往 `src/styles/editor.css`
末尾**临时**加一条 `h1.nota-lax-heading { outline: 4px solid red !important; }`，
重新起一次应用（或等 HMR），把光标挪出那一段，截图看**有没有红框**。
有红框 = 装饰在、问题在样式；没红框 = 装饰根本没算上，往插件那边查。
⚠️ **问完就删**：`src/styles/editor.css` 的 mtime 会因此变新，
`tools/doc-sync-check.sh` 的 ② 会照旧报一条 WARN（脚本只比 mtime，不看内容）。

📌 **先确认编辑器在哪个模式，再看画面对不对。** 同一轮里"装饰、面板怎么都没反应"
的真正原因是**窗口在源码模式**（隔离配置里 `view_mode = "source"`）——源码模式下
根本没有 WYSIWYG 那一层，屏幕上是一篇纯文本，**整轮结论作废**。
判据在**状态栏右下角**（「源码」／「所见即所得」／「分屏」），
**别靠"正文长什么样"猜**：源码模式里 `#abc` 也会被语法高亮着色，看着挺像渲染过的。

⚠️ **`xdotool type` 打不了中文。** 实测报：

```
Invalid multi-byte sequence encountered
xdo_enter_text_window reported an error
```

裸 Xvfb 没有输入法、也没有配 CJK 的键盘映射，`xdotool` 给多字节字符找不到 keysym。
所以**中文场景（`# 中文标题`、IME）没法用这条路验**——
硬件键盘或另一种输入注入方式才能覆盖。能验的是：点击、菜单、ASCII 打字、
渲染结果、字数统计变化、脏标记亮起。
⚠️ **指望这条流程去结 `docs/07` 的 IME 类缺陷是错的方向**：BUG-5 最后是
**用户在真机上打了一段中文**才结掉的（2026-09-23），无头流程至今也验不了它。

✅ **2026-09-25 更正一半：中文是能打进去的，缺的是 `LANG` / `LC_ALL`。**
上面那个 `Invalid multi-byte sequence` **不是 Xvfb 没有 CJK 键盘映射**，
是 `podman exec` 进去的 shell 没带 UTF-8 的 locale（本仓默认 `LANG=C`）。
补上就能打，实测把一整篇含中文的 Markdown 逐行打进了源码模式的 CodeMirror
（`第二块：Typora 的 js-sequence-diagrams 语法。` 一字不差）：

```sh
podman exec -u 1000 -e LANG=C.UTF-8 -e LC_ALL=C.UTF-8 -e DISPLAY=:99 tauri-dev \
    xdotool type --delay 25 -- "一段中文"
```

⚠️ **但 IME 那条结论不变**：这走的是"直接注入字符"，**不经过输入法**，
所以"打拼音选字""候选框"这类缺陷**照旧验不了**——上面那段话从"中文全都打不了"
缩小成"只有 IME 打不了"。📌 老规矩：**"这条路易不通"也要拿最小反例核一遍**，
否则一句当年"对得很合理"的话会一直挡着后面的人。

⚠️ **同批另一条纯手滑的坑：`xdotool type --file <文件>` 不会把换行翻译成 Return。**
整篇内容会被打成**一行**（实测：一篇 35 行的 `.md` 打进去变成 2 行、所有围栏和空行
都粘进了正文）。要按行来：

```sh
while IFS= read -r line; do
  [ -n "$line" ] && xdotool type --delay 25 -- "$line"
  xdotool key --clearmodifiers Return; sleep 0.15
done < 文件.md
```

⚠️ **在**所见即所得**里逐行打 Markdown 是靠不住的**：打到 ```` ``` ```` 会当场触发
代码块输入规则，后面几行会被吃掉（实测只进了标题和第一段）。要灌 Markdown，
**先 `Ctrl+/` 进源码模式再打**（那边是 CodeMirror 纯文本，围栏和空行都原样收下），
打完切回来即可。这也解释了 `docs/06` §5.6 那条"用试验台省事"的建议：
**灌长文本本来就该走源码模式或文件，不该指望在富文本里模拟逐字输入。**

⚠️⚠️ **2026-09-23 起反过来又多了一种情况：宿主的 `fcitx5` 会来抢合成按键，
连 ASCII 都打不进去了。** 用户把 IME 修好之后，`fcitx5` 就常驻在宿主上；
容器与宿主**共用 PID 命名空间**（本文件 §3.7 那条），所以：
`podman exec -u 1000 tauri-dev pgrep -a fcitx5` **看得到它**，
而跑在 `:99` 上的 Nota **也被它接管了**（⚠️ 中间那条路——XIM 还是会话 DBus——
**没往下追**，但现象只可能是它）——于是 `xdotool type "ctrl+shift"`
打出来的搜索框里是**「传统人力+」**（被当拼音组了词），
而且**一旦那次组合还开着，后面所有按键都不进输入框**（`BackSpace` 删不掉、
`Escape` 也不管用）。⚠️ **症状极具迷惑性**：不报错、不退出、窗口状态正常，
只是"打字没反应"——很容易误判成"焦点没给对"或者"这个输入框坏了"。
**判据**（照这个顺序查）：① `pgrep -a fcitx5`；② 看输入框里出现的是不是
**一串看着有道理的汉字**——是，就基本可以确定是它。

**绕法**：起应用时把 GTK 的输入法上下文钉死成"没有输入法"那个：

```sh
podman exec -d -u 1000 -w "$PWD/src-tauri" \
    -e DISPLAY=:99 -e GDK_BACKEND=x11 -e WEBKIT_DISABLE_COMPOSITING_MODE=1 \
    -e GTK_IM_MODULE=gtk-im-context-simple -e XMODIFIERS=@im=none \
    tauri-dev ./target/debug/nota
```

实测这样 `xdotool type` 恢复正常（本轮开窗复验过）。
⚠️ **宿主的 `fcitx5` 不能动**（那是用户正在用的东西），只能在 **Nota 自己起的进程**上设。
⚠️ 这一条也**不构成**"IME 验不了"的理由——它只说明**这条路验不了 IME**，
而 BUG-5 是**在真机上验的**，两回事。

清理：

```sh
# ⚠️⚠️ 按**显式 PID** 收场，不要 pkill -f：容器与宿主共用 PID 命名空间，
# 宽匹配会打死宿主的 shell（§3.8 记过两次）
podman exec -u 1000 tauri-dev pgrep -af 'target/debug/nota'   # 先看 PID
podman exec -u 1000 tauri-dev kill <pid>                      # 逐个 kill
```

⚠️ 别 `pkill -f ".*"` 这种宽匹配——容器里可能还有**别的会话**在跑构建。

### 5.5 不看画面还能拿到的信息

`import` 之外，另两条不需要眼睛的路：

```sh
# 启动那五行日志（§3.1）——插件数量、清单读不了的原因都在这儿
podman exec -u 1000 -w "$PWD/src-tauri" -e DISPLAY=:99 -e GDK_BACKEND=x11 \
    tauri-dev ./target/debug/nota 2>&1 | head -20

# 前端有没有起来：让 vite 打请求日志（vite 默认会打）
# 或看 ⑤ 里那张图是不是白屏
```

### 5.6 菜单试验台（`tools/menu-harness/`）

**要问"菜单/快捷键在某个状态下长什么样、键按下走哪一项"时用它**，
比开窗省事得多——⚠️ **不是"送不进按键"**（`xdotool key` 一直好使，§5.4 整节都在讲怎么送），
而是**开窗那条路又慢又脆**：要等 WebKit 起来、坐标每次得量、界面状态得自己造，
而试验台是个普通网页，系统 Chrome 无头就能跑脚本 + 截图，改一次跑一次几秒钟。
📌 2026-09-25 更正：这里原先写的是"Xvfb 里 `xdotool` 送不进按键"——**是句过头话**，
照它办会让人以为开窗根本驱动不了（于是**该开窗验的事也拿试验台糊过去**）。
真实约束只有两条：**IME 打不了**（§5.4 末）、**长文本要逐行打且最好在源码模式里打**。

它把 `src/ui/` 里的**真组件**挂进一个网页（`@` 别名照抄根配置，**不是复制品**），
用 `location.hash` 选场景，把结果打进页面上一块 `<pre>`——**断言就是读那几行**。

```sh
podman exec -u 1000 -w "$PWD" tauri-dev npx vite build --config tools/menu-harness/vite.config.ts
python3 -m http.server 8777 --directory tools/menu-harness/dist
google-chrome --headless --disable-gpu --screenshot=/tmp/x.png \
  --window-size=1280,900 --virtual-time-budget=3000 'http://127.0.0.1:8777/#accel'
```

⚠️ **URL 里不带 `dist/`**——服务的根已经是它了（这一步出错过）。
⚠️ **容器与宿主共用网络命名空间**，宿主上的 Chrome 直接连 `127.0.0.1:8777` 就行。
⚠️ 场景表、断言条数、以及**它抓到过什么**都记在 `tools/menu-harness/README.md`，
不在这儿重复。⚠️ 它是工装，**不参与根 `vite.config.ts` 的构建**，也不进任何 npm script。

⚠️ **它证明不了"在真 Tauri 窗口里按下去真响"**——只证明"表推得对、DOM 长对"。
两条都要，见 §6.2 最后一行。

**读结果用 `--dump-dom` ＋ 正则，别截图读字**（2026-09-26 起改的读法）：断言全打进
`<pre id="harness-report">`，所以

```sh
google-chrome --headless --disable-gpu --virtual-time-budget=15000 --dump-dom \
  'http://127.0.0.1:8777/#frontmatter' \
  | python3 -c 'import sys,re,html; print(html.unescape(re.search(r"<pre id=\"harness-report\"[^>]*>(.*?)</pre>",
                sys.stdin.read(), re.S).group(1)))'
```

比 `--screenshot` 省事：截图里那些字得靠眼睛认，`--dump-dom` 里的 `FAIL` 是**精确字符串**，
可以逐条 grep。⚠️ 两条实测的坑：① **正则要认属性**（那块 `<pre>` 带 `style=`，
写成 `<pre id="harness-report">` 一条都抓不到，样子跟"场景没跑"一样）；
② **要起真编辑器的场景（`#frontmatter`）得给足 `--virtual-time-budget`**——8 秒不够、15 秒够，
纯函数场景 3 秒就行。⚠️ 页面**整页空白 + 控制台一条 `TypeError`** 是"试验台腐坏"的典型现场，
`--dump-dom` 一眼就能看出来（`#root` 是空的）——见下面那条。

⚠️⚠️ **它是工装，不在类型检查范围内——这是个会静默腐坏的坑（2026-09-26 撞实了）**：
根 `tsconfig.json` 的 `include` 只有 `["src", "vite.config.ts"]`，**不含 `tools/`**；
而 `vite build` **只转译不检查**。于是产品组件改一个必填 prop，试验台**编译得过、运行时白屏**：
`MenuBar` 自 2026-09-24 起要求 `menus`，这里一直没传，`props.menus.map` 当场抛，
**整页空白了两天没人发现**（那一批"改产品代码时这个试验台会跟着一起新"的话，当时是假的）。
**规矩**：**改了 `src/ui/` 里任何组件的 props，就顺手跑一次**

```sh
podman exec -u 1000 -w "$PWD" tauri-dev npx tsc --noEmit -p tools/menu-harness
```

那份配置（`tools/menu-harness/tsconfig.json`）就一件事：把 `tools/` 拉进类型检查，
`extends` 根那份、`@/*` 别名照旧。⚠️ 它**故意不进** `npm run typecheck`——那条命令是
"产品代码干不干净"的闸门，工装坏了不该把闸门染红。2026-09-26 一开就再抓出两条静默失效：
`byLabel` 返回 `HTMLElement` 让 `exportBtn.disabled` 恒 `undefined`（**一条永远为真的假断言**）、
`Sidebar` 缺 `onJumpOutline`。⚠️ 同一条道理对**我自己写的断言**也成立：样本写错一条，
断言就永远为真（那天就写错了一条，改对了才报红）。

**这一批（2026-09-24）**：键位表 **32 条全对**、构建无警告。原先 **30 条**，
新加的正是 `F8`（专注模式）与 `F9`（打字机模式）——理由是**容器里按不出这两个键**
（原因见 §5.11 陷阱一），既然开窗验不了，就得让表自己说话。
⚠️ 这两条此前**一条断言都没有**：容器里按不出来，表里也没人问，于是两边都没覆盖到。

**这一批（2026-09-26）**：新增 **`#frontmatter` 场景**（BUG-39 的判据，见 §5.23）——
① 纯函数 15 条边界断言（CRLF、`...` 收尾、无闭栏、空块 `---\n---`、非首行、列表型、
"一份全是 `键: 值` 的散文会被误认"那条已知边界）；② **真 `createEditor` 进→出逐字节相同**
（⚠️ 这条是纯函数断言替不了的：正文过一遍 mdast 会不会被规范化，只有真实例答得上来）；
③ 只读实例（分屏预览／导出那条路）出来的文本**不含 `theme`**。**20/20 通过**。
既有场景（`#accel` / `#native` / `#sidebar` / `#sidebar-empty` / `#submenu` / 默认）**全绿**，
`#sidebar` 同批补了一条「点第 2 行大纲 → 回调 1 次，给的是 `{"line":1,"index":1}`」。

---

### 5.7 验 Slidev 预览那条链（`tools/stub-slidev.py`）—— ⚠️ **本节已过期，见下面的"搬迁"**

⚠️⚠️ **2026-09-25：预览整条链搬进了插件**，本节原来一步一步点的那些地方**大半不存在了**。
不删掉是因为**下面那两条实测教训照旧有效**（`xdotool type` 打不进编辑器、无头环境里
叉窗口会让应用直接死），而且**要验的东西没变，只是"在哪一层验"变了**：

| 原来在哪 | 现在在哪 |
|---|---|
| 菜单「视图 → Slidev 预览」 | 插件声明的菜单项，落在菜单栏的**「插件」那一栏**（`register_menu`，见 `plugins/slidev/main.lua`） |
| 「装没装」是宿主的一块浮层（`ui/SlidevPanel.tsx`） | 插件**自己的面板**（`nota.ui.register_panel`，`location = "right"`、`wide = true`），那几句话由插件写 |
| 预览开在插件栏里一页（内置页 `@slidev`） | 面板里的一个 `kind = "frame"` 块，地址由宿主填 |
| 「另开窗口」→ 960×720 的 `nota_slidev_open_window` | 「用浏览器打开」→ `nota.devserver.open_in_browser()`（全屏演示与演讲者视图只有真浏览器有） |
| 收摊走 `slidev::stop` ＋ `close_window` | 面板上那颗「停止预览」→ `nota.devserver.stop()`；进程退出时宿主 `stop_all()` 兜底 |

⚠️ **宿主那半仍然可验、而且有单测**：`devserver.rs` 的十二个用例（§6 那张表）盖住了
挑端口 / 写入口 / 写不进去时退回数据目录 / 整份覆盖 / 日志环 / 向上找 `node_modules` /
命令不存在时报人话 / 收摊之后进程真没了。**要跑那一条链，用替身起应用照样可行**：

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota

# ① 按 §5.1 起 Xvfb + vite，然后带替身起应用
podman exec -d -u 1000 -w "$PWD/src-tauri" \
    -e DISPLAY=:99 -e GDK_BACKEND=x11 -e WEBKIT_DISABLE_COMPOSITING_MODE=1 \
    -e NOTA_SLIDEV_CMD="python3 $PWD/tools/stub-slidev.py" \
    tauri-dev ./target/debug/nota

# ② 点「新建文档」，再点菜单栏的**「插件」**那一栏 → 「开始 Slidev 预览」
#   （坐标按 §5.4 现量：菜单栏坐标随窗口位置平移，别抄旧数）
D="podman exec -u 1000 -e DISPLAY=:99 tauri-dev"
$D xdotool mousemove 594 400 click 1     # 新建文档
$D xdotool mousemove <「插件」的 x> 187 click 1
$D xdotool mousemove <「开始 Slidev 预览」那一项的坐标> click 1
#   ⚠️ 用替身时探测会**超时 20 秒**（替身不认 `--version`，它直接开始听端口），
#   所以面板上先是一句"没问出结果"，再点那张面板上的「仍然试一次」。
sleep 22
$D xdotool mousemove <面板上那颗「仍然试一次」的坐标> click 1   # 坐标按 §5.4 现量
sleep 2
```

⚠️ **2026-09-25 那批搬迁之后，这条链没有在无头 X 里重跑过一遍**——上面这一版是
按新形状**改写**的操作步骤，不是"跑过一遍记下来的"。谁去跑，请把结果写回这里；
⚠️ **别把"没跑过"写成"验过了"**。已经**确有**的是：`devserver.rs` 那十二个单测、
面板 DSL 与 `frame` 那一条 CSP/白名单在 `docs/13` 有据、以及下文那两条**踩过的坑**。

⚠️ **为什么要用菜单而不是打字制造改动：`xdotool type` 打不进那个编辑器**（2026-09-23 实测）。
`windowfocus` 成功、`Ctrl+Shift+L` 这种应用级快捷键**也能生效**，但往正文里打字就是不进——
新建的空文档尤其明显（点编辑区那一下多半落在「正文以下的留白」上，正是 BUG-15 那条）。
**所以这条路不必再试**：用**菜单**制造文档改动（「段落 → 水平分割线」最省事），一样能验同步——
入口文件是**整份覆盖**的，所以"改完正文之后入口文件里出现那个 `***`"就是同步通了。
入口文件在哪：有文档目录就写在文档旁边、否则退到 `~/.local/share/nota/slidev/`
（名字是 `.nota-slidev-<doc_id>.md`，**点开头**，文件管理器默认不显示）。

⚠️ **以下两条都实测过**：

1. **`xdotool search --name` 找一个刚开出来的窗口常常找不到，用 `--pid`**。
   新窗口的标题由 WebKit 加载页面之后才定下来，刚开出来那几百毫秒里**还没有名字**——
   按名字搜会得到空，看起来像"窗口没开"。按 `--pid <应用的 pid>` 搜就稳。
   ⚠️ 2026-09-25 起预览**不再开第二个窗口**了，所以这条现在只对"将来又有哪个窗口"有用。
2. **在这个无头环境里，用 `xdotool windowclose` 叉掉任何一个窗口都会让应用直接死掉**，日志尾巴是：
   ```
   Gdk-WARNING: The program 'nota' received an X Window System error.
   The error was 'BadDrawable (invalid Pixmap or Window parameter)'.
     (Details: ... request_code 14 (core protocol) ...)
   ```
   ⚠️ **这不是预览窗的问题**：**叉主窗口也一样死**（A/B 验过，2026-09-23 又复验了一次）。裸 Xvfb + 没有窗口管理器
   的环境里 GDK 撞上 X 错误就 `abort`，Drop 不跑、子进程留在原地。
   ⚠️ **这条今天仍然要记住，但"叉预览窗"那个案例已经不存在了**（2026-09-25 起没有预览窗）。
   真机上要验的**反向**那件事（"浏览器那一页关掉，Nota 这边照旧"）也不在容器里办得到。
   （留下的替身进程按 pid 手动 `kill` 掉，不要用 `pkill -f`——见 §3.7。）

---

### 5.8 验「装没装」那个面板的四格画面（⚠️ 现在指的是 **pandoc** 那一块）

⚠️ **本节原先是 Slidev 的**（`docs/04` §2.6c）。2026-09-25 起那块面板搬进了插件，
**宿主这一侧只剩 pandoc 那一块用同一个形状**（`docs/04` §2.6e）——所以下面这张表
**逐格照旧，但考的是 `NOTA_PANDOC_CMD`**。

它的四格状态**取决于 `NOTA_PANDOC_CMD` 指向什么**，所以四格都能在本机画出来——
⚠️ 但**画出来 ≠ 真装了一份 pandoc**，"真装"那一格只有真装才算（见 §6.2 最后一条）。

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota
D="podman exec -u 1000 -e DISPLAY=:99 tauri-dev"
# 通用：起应用（Xvfb + vite 见 §5.1），区别只在 NOTA_PANDOC_CMD
podman exec -d -u 1000 -w "$PWD/src-tauri" -e DISPLAY=:99 -e GDK_BACKEND=x11 \
    -e WEBKIT_DISABLE_COMPOSITING_MODE=1 -e NOTA_PANDOC_CMD="<下面三选一>" \
    tauri-dev ./target/debug/nota
# 然后：文件 → 导出 → Word…（**别点 PDF**：PDF 有第二条路，主按钮会变成
# 「用 Nota 自己排版导出」，那考的是另一格）
```

| 想要哪一格 | `NOTA_PANDOC_CMD` 给什么 | 期望看见 |
|---|---|---|
| **检测中**（`gate-spin`） | 三选一都行，**点下去立刻截图** | 转圈 ＋ 那句"正在检测"＋一颗**按不动**的「检测中…」 |
| **`missing` ＋ 有自带 PDF**（`.is-warn`） | `nota-根本没有这个命令`，且点是 **PDF** | 橘色 `!`，主按钮**「用 Nota 自己排版导出」** |
| `missing`，其余格式 | 同上，点是 Word / RTF / ePub… | 橘色 `!`，主按钮**「去官网看安装指南」** |
| **`unknown`**（`.is-ask`） | 一个挂住不动的命令 | **等满 20 秒**才出灰色 `?`，主按钮**「仍然试一次」**（⚠️ 它不是"没装"，是"没问出结果"） |
| **`ready`**（`.is-ok`） | 系统里那个真 pandoc | ⚠️ **到不了这儿**——探通了**不出面板**，直接进保存对话框。这一格由 §5.15 那条"两条路都点通"盖住 |

⚠️ **`printf` 那一招在这儿不适用**：pandoc 的探测问的是 `--version`，
拿 `printf 1.2.3` 去顶替能让它"报出版本"，但那是**画出来的 `ready`**，
而 `ready` 这一格在今天的产品里根本不会画（不开面板）——所以这张表**没有"画的 ready"那一行**。

⚠️ 点下去之后走的就是 §5.15 那条导出链，逐条对照那几步即可。

⚠️ **探测起过的进程不会留下孤儿**：超时那条路走 `kill_group`，杀的是**整个进程组**。
验完可以核一遍——`pgrep -af stub- | grep -v pgrep` 应该是空的
（⚠️ **别用 `pkill -f` 清场**，见 §3.7）。

### 5.9 改前端时的四条目检经验（2026-09-24）

**① 「改了没生效」先看 vite 的 HMR 日志，不必猜缓存，也不必怀疑 Rust。**

```sh
podman exec -u 1000 tauri-dev tail -30 /tmp/nota-vite.log
```

⚠️ 实测过的现场：`lax-heading.ts` 中间层多了一个 `}`，vite 报
`Transform failed … Unexpected "}"`，HMR 推不过去、**界面就停在上一版上**——
症状是"改了源码界面一点反应都没有"，看着像逻辑错。这条日志是当时唯一能说明问题的信息。

⚠️ **同时排除一个错误猜测**：debug 二进制**确实**连 `devUrl`（§2.3 那条是对的），
不是吃 `dist/`——vite 日志里能看到它对 `/src/…` 的请求与 HMR 推送。
所以「改了源码」和「界面变了」之间**不需要 `npx vite build`**；
真没生效时看日志，别急着重新构建。

**② 打开文件要用「点」的方式，不能靠打字。** `xdotool type` 打不了中文（§5.4），
所以验中文内容时**不走打字这条路**——把测试文件先放进 `/tmp/nota-home`
（`HOME` 指向它，见 §5.1 那条启动命令），然后 Ctrl+O → 点列表里那一行 → `Return`。
⚠️ 点之前按 §5.4 裁块核一遍坐标；⚠️ 文件**必须**在 `/tmp/nota-home` 底下，
否则对话框里列不出来（它列的是 `HOME` 那一带）。

**③ 「存盘没改字」这类断言只能比字节。** 屏幕上显示对**证明不了**这条——
第一版宽松模式就是这样漏过去的：显示一切正常，序列化时序列化器给行首井号加了个 `\#`。
做法：打开文件 → Ctrl+S → 比 md5，**存前存后要一样**：

```sh
podman exec -u 1000 tauri-dev md5sum /tmp/nota-home/<那个文件>.md
```

⚠️ **两种模式各存一次**都要一样：宽松（默认）与严格。
严格那一次把 `/tmp/nota-home/.config/nota/settings.toml` 里的
`strict_markdown` 改成 `true`（界面上拨那个开关也行，改完编辑器会**当场重建**）。
⚠️ "看了看，没变"不能当证据——这条不变量（`docs/03` §5.5）就是靠这个命令守的。

⚠️ **2026-09-26 补两条，都是"白按了几轮"换来的：**

**(a) 这个"存前存后 md5 一样"必须是端到端的，不能拿裸 `remark-parse` →
`remark-stringify` 的探针代替。** 同一天拿**同一个表格样本**跑两条路，结论**相反**——
裸探针给 `| 1 |   |` / `| - | - |`（看着"只多一个空格"），真窗口给
`| 1 | <br /> |` / `| ------ | ------ |`。`<br />` 是**过 ProseMirror 那一层才产生的**
（`preset-commonmark` 给空段落写的那条序列化，推导见 `docs/05` §4.7），裸探针根本
走不到那里。**裸探针只够快速排掉纯 stringify 选项那一类**（`bullet` / `rule`）。
⚠️ 反过来也成立：真窗口这条路**幂等**（连按三次 `Ctrl+S`，md5 不变），
所以"字节变了"与"越存越多"是两件事，别混。

**(b) 按键要真的进 WebView，得先给窗口输入焦点。** 做法是
`xdotool windowfocus <id>`（无窗口管理器时 `windowactivate` 会直接报
`_NET_ACTIVE_WINDOW` 不支持），然后用**不带** `--window` 的 `xdotool key`；
⚠️ 用 `--window` 发的合成事件只对 **GTK 那一层**有效——`Ctrl+S` 这种**菜单加速器**
照样触发（所以"保存成功"证明不了按键进了 WebView），而 **WebView 里的 `End` /
`Return` / 打字会被丢掉**。2026-09-26 就是栽在这里：`Ctrl+S` 明明生效，`Return`
却像没按，症状是"文件没变"，看着像功能坏了。
⚠️ 判据是**屏幕上真出现了那个改动**（裁块看图），不是"文件时间戳变了"。

**④ 合成键鼠事件只往自己起的窗口里发。** ⚠️ 用户正在用的窗口**一个都不能碰**——
`xdotool` 没有"发给哪个窗口"的判据，只能靠脚本自行保证（本节的流程默认
`DISPLAY=:99` 是自己起的 Xvfb，就没有这个问题）。

### 5.10 验导出与打印（2026-09-24，**已开窗点过**）

⚠️ **先纠一句自己写错的话**：这一节原先写着「原生对话框 `xdotool` 看不见它的控件、
也点不准」——**机制写反了**。实测（2026-09-24）：那个 `@tauri-apps/plugin-dialog`
起的「保存为」**看得见、按钮按得中**（鼠标事件按坐标派发，**不需要焦点**）。真正拦人的
是**键盘**：裸 Xvfb 没有窗口管理器，输入焦点一直留在应用窗口上，`xdotool type`
打进的是**编辑器**——实测把一条路径打进了正文，状态栏字数当场跟着变。

**能跑通的跑法（这一批导出与打印就是靠它验完的）：**

```sh
# 1) 菜单里点「导出 HTML（含样式）」/「打印」，等原生对话框起来
# 2) 指名把焦点给对话框本体，再打字、再回车：
DLG=$(DISPLAY=:99 xdotool search --name '导出 HTML' | tail -1)
DISPLAY=:99 xdotool windowfocus "$DLG"
DISPLAY=:99 xdotool type --delay 30 '/tmp/nota-export-test.html'
DISPLAY=:99 xdotool key Return
podman exec -u 1000 tauri-dev ls -l /tmp/nota-export-test.html
```

⚠️ **`windowfocus` 那一步不能省**，也不能用 `tail -1` 任取一个窗口——按**几何**挑，
桩窗口的情况见 §5.3。（对话框也一样：`search --name '导出 HTML'` 可能多命中，
挑不到就先把全部窗口的几何打出来看。）

⚠️ `--delay` 要给够（30ms 起）：`type` 打得太快，GTK 的输入框会**丢字符**。

**① 生成那一段（也能验）。** `导出HTML()` 是纯函数式的：给一段 Markdown 要回一份
HTML 字符串。它**不弹框、不落盘**，所以在开发者工具（§3.3）里直接 await 就能看结果：

```js
const m = await import("/src/editor/export.ts");
(await m.导出HTML("# 标题\n\n正文", { styled: true, title: "试" }))
```

⚠️ 那个 `strict: false` **2026-09-26 已经删掉了**（`导出选项` 上不再有这一格），
传了会被 TS 挡下来。原来那两档现在指的同一件事，见 `docs/02` 的 `导出HTML` 一节。

⚠️ 重点核三处：**含样式那份里没有 `nota-` 开头的 class**；**行号、语言选择器、
图表的按钮条与源码框都不在里面**（容器型零件，不是靠前缀规则洗掉的，见下面 ③）；
**`<style>` 段有三份**（`theme/base.css` ＋ `editor.css` ＋ `katex.min.css`）再叠主题。

**② 落盘那一段（能验）。** 打印的落点是**确定**的：文档同目录下的
`.nota-print.html`。所以点一次菜单 → 系统默认程序打开之后：

```sh
podman exec -u 1000 tauri-dev ls -l -a /tmp/nota-home/<文档目录>/.nota-print.html
```

⚠️ 它是个**点开头的隐藏文件**，`ls` 不加 `-a` 看不见——找不到时先想到这一点。
⚠️ "系统默认程序"是否真的被拉起来了，看进程（`xdg-open` 或它拉起的浏览器），
**"没弹窗"不等于失败**：容器里可能就没有配默认程序。

**这一批点出来的实测值**（细节与判据记在 `docs/07` §1 与 §3 第 1 项）：

| 项 | 值 |
|---|---|
| 导出对话框标题 / 预填名 / 筛选器 | 「导出 HTML（含样式）」/ `nota-export-test.html` / HTML |
| 导出落盘 | 22990 字节，`<style>` 段 = `editor.css` 的字节，正文是 `<body class="editor-pane">…<div class="ProseMirror"><p>aa</p><p>bb</p>` |
| 打印落盘 | 同尺寸 `22990` 字节的 `.nota-print.html`，**写在文档自己的目录里** |

**③ 真 PDF 目检（2026-09-27 加，查「导出的东西正不正常」最快的一条路）。**
`导出HTML()` 返回的是字符串，**看一眼字符串判断不了排版**——代码块有没有底色、
公式画了几遍、图表画出来没有，都得到纸上才看得见。所以：**让应用自己写一份
`.nota-print.html`，再拿浏览器把它印成 PDF，最后转成 PNG 用眼睛看。**

```sh
# 1) 起应用（隔离的 XDG，别碰用户真实配置）并让它聚焦，然后按打印快捷键
podman exec -e DISPLAY=:95 -e GDK_BACKEND=x11 -e WAYLAND_DISPLAY=wayland-0 \
  -e GTK_IM_MODULE=gtk-im-context-simple -e XMODIFIERS=@im=none \
  -u 1000 tauri-dev ./src-tauri/target/debug/nota /path/文档.md &
DISPLAY=:95 xdotool search --name 'Nota' | tail -1        # 取窗口 id
DISPLAY=:95 xdotool windowfocus --sync <id>              # ⚠️ 必须 windowfocus
DISPLAY=:95 xdotool key alt+shift+p                      # → 文档旁 .nota-print.html

# 2) 印成 PDF，再转成 PNG
google-chrome --headless --disable-gpu --no-sandbox \
  --print-to-pdf=/tmp/导出诊断.pdf file:///path/.nota-print.html
pdftoppm -png -r 80 /tmp/导出诊断.pdf /tmp/导出诊断
# 3) 用 Read 工具打开 /tmp/导出诊断-1.png 看图
```

⚠️ **`windowfocus` 不能用 `windowactivate` 替**：`windowactivate` 要 WM 支持
`_NET_ACTIVE_WINDOW`，而裸 Xvfb **没有窗口管理器**，会直接报错。XTEST 按键送的是
**焦点窗口**，所以必须先 `windowfocus`；`xdotool key --window <id>` 走的是
`XSendEvent`，GTK 常常直接忽略。

⚠️ **前端改了要 `npx vite build`**：调试二进制加载的是 `dist/`（`tauri.conf.json`
的 `frontendDist: "../dist"`），不是别人那个 5273 端口上的 vite dev server。

⚠️ **这一趟要核的清单**（用户 2026-09-27 报的就是头两条）：
**行号 / 语言选择器 / 图表按钮条 / 公式源码面板这些编辑零件不在纸上**、
**公式只画一遍**、代码块有浅底与 token 配色、任务项的方框在、表格有边框、
图表是**浅色**的（白纸上一张深色图 = 离屏子树没钉 `data-ui-mode="light"`）。

### 5.11 三个"看着像代码坏了、实际是环境"的陷阱（2026-09-24）

**陷阱三（2026-09-24 验插件时遇到的）：容器里跑着 `fcitx5`，`xdotool type` 送进去的
字符串会被输入法吃掉。** 症状是"应用的输入框把 ASCII 变成了中文"——
看起来像 `PromptDialog` 的输入处理坏了。

```
podman exec -u 1000 tauri-dev pgrep -af fcitx     # → /usr/bin/fcitx5
```

实测：`xdotool type "qwen2.5:7b"` 落进输入框的是 **`全文。5:7b`**——`qwen` 被
按拼音转成了「全文」，半角的 `.` 被转成了全角 `。`。⚠️ **应用这边没错**
（同一串字符走别的路径、以及 `sk-abc-12345` 这种纯字母数字，都是原样进去的）。

⚠️ **判别办法**：落进去的文本里出现**全角标点或汉字**，就是输入法，不是代码。

⚠️⚠️ **2026-09-26 更正：「逐键送」不管用**。这一节原先写的是"用
`xdotool key --clearmodifiers` 逐键送就能绕开"——**实测不行**。逐键送
`z h a n g` 进 `PromptDialog` 的输入框，一个字符都不落（`hang` 那一次倒是
被转成了「行」，说明键是到了、被 IME 收走了）。输入法抢的是 **XIM 这一层**，
而 `--clearmodifiers` 只管修饰键，管不到 XIM。

**真正的绕法是把输入法上下文钉死成"没有输入法"**（`tauri-dev` 那条内存里
早就记着，本节 §5.1 和末尾也有同一份），**只加在 Nota 自己起的进程上**：

```sh
-e GTK_IM_MODULE=gtk-im-context-simple -e XMODIFIERS=@im=none -e QT_IM_MODULE=none
```

实测（2026-09-26）：加上这三个之后，`xdotool key --clearmodifiers --delay 100
Z h a n g space S a n` 落进输入框的是**一字不差的 `Zhang San`**，
`@` 用 `shift+2` 送也正常（`@` 直接写会报 `No such key name '@'`）。

⚠️ **但要记住另一条真结论**：`nota.settings` 落盘的内容**不经过输入法那层**，
所以"键盘送歪了"和"存歪了"是两件事，**界面上的字不能用来判存盘对不对**——
判据是那份 TOML。哪天只是想验落盘，就**别跟输入法较劲**，直接读文件
（本节验 `nota.settings` 就是这么做的：`cat ~/.config/nota/plugin-settings/nota.ai.toml`
拿到的是**逐字节正确**的 `api_key = "sk-abc-12345"`）。

⚠️ **同类的还有 `Esc`**：`fcitx5` 也抓它，所以无头目检里"按 Esc 关不掉对话框"
**不等于**对话框的 Esc 处理坏了。换成点「取消」那颗按钮验。

⚠️ **点不中的时候别猜坐标，验一下**。"点上去没反应"在无头目检里是最费时间的一种
错觉——2026-09-26 我为此在提交树上白试了四轮，最后发现是 y 差 8 个像素。
**可靠办法**：点之前先截图，点完再截一张，拿 `compare -metric AE` 数变化像素：

```sh
import -window root /tmp/pre.png; xdotool mousemove X Y click 1; sleep 2
import -window root /tmp/post.png
compare -metric AE /tmp/pre.png /tmp/post.png null:   # 0 = 这一下根本没进去
```

⚠️ **变化 0 就是没打中**（本节的 `提交树` 按钮就是这么定位到的：扫到
`x=1134 y=366` 才出现 4538 的跳变）。⚠️ **但工具栏的悬停提示会让数字非零**——
所以判据是"**跳变够大**"（一整块新内容通常是几千），不是"非零"。
⚠️ 而**内容变了之后所有行的 y 都会跟着挪**（比如选中一颗提交会多插一行
「已选：…」），**每点一次都要重新量**。

**陷阱一：`xdotool` 送 `F8` 时自己带了一个 `Alt`。** 现象是"按 `F8` 状态不变"。
把**真实到达的按键**打出来看：

```js
window.addEventListener("keydown", e => console.log(e.key, e.code,
  e.ctrlKey, e.shiftKey, e.altKey), true);
```

得到 `key=F8 code=F8 ctrl=false shift=false alt=true` —— 应用算出的键位是
`--a:f8`，而菜单里写的是 `F8`（`--:f8`）——**对不上是对的**。同一时刻 `Ctrl+H`
到达的是 `ctrl=true … alt=false`（所以它一直好用）。

⚠️ **判据**：界面"没反应"时，**先把到达的 key/code/修饰键打出来**，再谈机制；
不要从"没反应"直接推"绑定坏了"。`src/ui/accel.ts` 用 `e.code` 优先于 `e.key`
正是为了少受这类污染。

⚠️ **这一族问题的后果，2026-09-25 记一笔**：沉浸模式那两条（`F8` 专注 / `F11` 全屏）
在本容器里**按不出效果**，所以那一批目检**走的是菜单**（点的是同一批处理函数），
而 `Esc` 是**真按键**（`docs/07` §4 那条漂移登记里记着这次的口径）。
⚠️ **要复验就点菜单，别在 `xdotool key F8` 上耗时间。**

**陷阱二：本容器的字体栈里没有一个字有 `✓`（U+2713）。** 现象是「视图」菜单里
`状态栏`（状态上是开着）后面**一个勾都没有**，看着像 `checks` 那条线断了。
判据是**临时把 `✓` 换成 ASCII**（一行改动、HMR 立刻生效）：

```tsx
<span className="menu-check">{entry.checkable && checks[entry.id] ? "Y" : "-"}</span>
```

换完勾**全出来了、状态也全对**（`状态栏 Y` / `打字机模式 -` / `专注模式 Y`）——
于是问题只剩字形。核实：`fc-list ':charset=2713'` 在本容器里只列出 **Outfit**，
而界面字体栈（`system-ui` / `Noto Sans CJK SC`…）没有一个覆盖 U+2713；
`.menu-check` 的 `flex:none; width:12px` 又让它**占着位置但不画**，所以看起来是"空白"。

⚠️ **两条可迁移**：① 查"界面少了个东西"时，**先把"状态对不对"和"字形画不画得出来"
分开**，否则很容易去改一个本来正确的组件；② 容器里的字体集是**运行时环境**，
`✓`/`⚠` 这类符号在真机上不一定同样表现——截图里看不见一个符号，**先怀疑字体**。

⚠️ 换 ASCII 的那次是**临时改动，已逐字节还原**（`diff` 过）；运行中的窗口里可能
还留着调试浮层 / 调试标签，**刷新窗口就没了**。
⚠️ "系统默认程序"是否真的被拉起来了，看进程（`xdg-open` 或它拉起的浏览器），
**"没弹窗"不等于失败**：容器里可能就没有配默认程序。

### 5.12 验插件那四件（2026-09-24，**已开窗点过**）

**① 面板里的坐标会随窗口/字号漂，点之前要先裁一块核一遍。** 这一批碰到的实例：
`插件`菜单的**行距是 30px**（不是按 20px 估出来的那个值），于是"点总结"点在了下一项「续写」上——
预览里写着「预览：续写」。⚠️ **症状不是报错，是"功能对了但名字不对"**，
很容易被当成"菜单项与命令对不上"这种真 bug 去查。核坐标的做法见 §5.4。

**② 出网那一格要花真钱、也依赖真密钥。** AI 面板点一次预设就是一次真实请求
（本批用的是用户自己填在 `plugin-settings/nota.ai.toml` 里的密钥）。
⚠️ 所以**不能连着点**，也不适合作"看看界面画得对不对"的手段——**界面那一半可以用别的方式看**
（`render` 是现跑的，改一行 Lua 再刷新面板就能验）。
⚠️ 反过来，这一格的价值就在它**不是桩**：桩能证明"请求发出去了"，
真接口才能证明"整条链通"（TLS、超时、JSON 解析、错误路径）。

**③ 设置落盘那一格，判据只能是那份 TOML，不能看界面。** 界面上显示 `deepseek-chat`
只能说明**状态回来了**；"存下去的是什么"要 `cat` 出来看（为什么不能用界面上的字当判据，
见 §5.11 陷阱三）：

```sh
podman exec -u 1000 tauri-dev cat ~/.config/nota/plugin-settings/nota.ai.toml
podman exec -u 1000 tauri-dev stat -c '%a %n' ~/.config/nota/plugin-settings/nota.ai.toml
```

⚠️ **验完把值改回去**：这一格改的是**用户的**密钥/地址/模型（放在他的 `$HOME` 下），
不是测试夹具。本批把模型改成 `deepseek-chat` 验完又改回了原值。

**④ Git 那一格可以在容器里造真仓库验，不必碰用户的仓库。**

```sh
mkdir -p /tmp/nota-gitdemo && cd /tmp/nota-gitdemo && git init -q && echo 一号 > 笔记.md
git add -A && git -c user.email=t@t -c user.name=t commit -qm init
```

⚠️ 提交动作**要往仓库里写东西**（`git add -A` + `commit`），所以**只能拿这种一次性仓库验**。
判据是两处：`git log --oneline` 里有没有那条提交信息、面板是不是**当场**变成了
「没有未提交的改动。」（后者验的是"面板每次现拉"，不是快照）。

**这一批点出来的实测值**（细节与判据记在 `docs/07` §1）：

| 项 | 值 |
|---|---|
| 插件栏里两个插件 | `nota.ai`（AI 助手 0.1.0）/ `nota.git`（Git 版本控制 0.1.0），能力标签与 `plugin.toml` 逐项对得上 |
| 「插件」菜单 | 五条 AI 预设 + 一条分隔线 + Git 两条（`提交…` / `刷新改动`） |
| `nota.settings` 落盘 | `model = "deepseek-chat"`（换成 `deepseek-flash` 又改回），文件 0600 / 目录 0700，注释头保留；Esc 与「取消」都不写 |
| `nota.http` | 续写真的回来了。⚠️ 2026-09-24 晚那一版把面板改成了**多对话＋末尾附改动块**，所以这一格现在的判据是「普通文本＋一块 diff」而不是「预览」——新的走法见 §5.13（用桩离线跑，不必花真钱） |
| Git 提交 | 一次性仓库里 `3781221 第二份笔记`，状态栏与面板同步 |

### 5.13 验 AI 那条链（`tools/stub-openai.py`，2026-09-24，**离线，不要密钥**）

§5.12 ② 说过：AI 那一格用真接口是要**花真钱**的，不适合作"看看界面画得对不对"的手段。
2026-09-24 晚补了这条路：**起一个假的 OpenAI 兼容接口**，整条链（拼请求 → HTTP →
解 JSON → 拆改动块 → 画面板 → 应用进文档）除了"模型本身"以外**全都真跑一遍**。

```sh
# ① 起桩。STUB_MODE 决定它回什么（见下表）。默认 127.0.0.1:8731
podman exec -u 1000 -d tauri-dev sh -c 'cd <仓库> && STUB_MODE=replace \
  python3 tools/stub-openai.py > /tmp/stub-openai.log 2>&1'
curl -s http://127.0.0.1:8731/v1/models      # 自检：桩活着吗

# ② 把插件的「地址」临时指到桩上（面板上点「改地址…」，或直接改那份 TOML）
#    然后按 §5.1 起应用、开一份文档、点一个预设
```

```sh
# ③ ⚠️⚠️ 验完把地址改回去：那三行是**用户的**真设置（含明文密钥），不是测试夹具
podman exec -u 1000 tauri-dev cat ~/.config/nota/plugin-settings/nota.ai.toml
```

⚠️ **这一条是本节最容易忘的**（§5.12 ③ 同样的提醒）。2026-09-24 那一批就是靠
`nota.ai.toml.bak-<时间戳>` 备份还原的——**改之前先 `cp` 一份**。

**桩的几种模式**（`STUB_MODE`，每一种对应一条要验的路径）：

| 模式 | 桩回什么 | 验的是 |
|---|---|---|
| `replace`（默认） | 一段普通文本 ＋ 末尾一块 `-`/`+` | 主路径：一红一绿，点「应用改动」文档真变 |
| `insert` | 只有 `+` 行 | 追加到文末（续写那类预设） |
| `twohunks` | 两块改动 | 多处改动按顺序各改各的 |
| `bad` | 改动块里混一行既不 `-` 也不 `+` | 面板如实写"有 N 行…忽略掉了" |
| `dirty` | `-` 引一行文档里**没有**的 | ⚠️ **失败路径**：点应用要报错、**文档一个字都不能动** |
| `nofence` | 只有普通文本，没有围栏 | 不该画出「应用改动」那颗按钮 |

⚠️ 桩**从请求里那份文档现取**改动块的内容（请求体里 `──── 当前文档全文开始/结束 ────`
之间），所以"逐字一致"必然成立——它不会因为文档改了而失配。
每次请求的**原文**写在 `STUB_LOG`（默认 `/tmp/stub-openai-last.json`），
"请求里到底发出去了什么"要看这个文件，不能靠猜。

⚠️⚠️ **`cargo build` 会把 `plugins/` 拷进 `src-tauri/target/debug/plugins/`**，
而 `paths::builtin_plugins_dirs()`（`src-tauri/src/paths.rs`）**先扫资源目录、再扫仓库**，
去重是"先到先得"——所以**改完插件不重新 build，跑起来的还是 target 里那份旧的**。
症状是"改了没生效"，很容易误判成"代码写错了"。⚠️ 这一批就被它误导过一次
（改了 `title_from` 却没生效）。三条出路任选：重新 `cargo build`、
跑之前清掉 `target/debug/plugins/`、或者认准"改 Lua 之后必须重编"。

### 5.14 验前端弹层的四条工装（2026-09-25，验代码块语言下拉那一批）

**① `xdotool` 只装在 `tauri-dev` 容器里，宿主上没有**（宿主上只有 ImageMagick 的
`import`）。所以送键送鼠标一律走 `podman exec`。⚠️ **危险的写法是宿主上那串
`xdotool … 2>/dev/null`**：它把「命令不存在」（退出码 127）**连错误一起吞了**，
命令看起来"跑过了"，按键其实**一次都没送出去**——症状正好是"点了没反应"，
于是很容易反过来去查代码。上一批在这上面白查过一轮。

```sh
command -v xdotool                                        # 宿主上：没有
podman exec -u 1000 tauri-dev command -v xdotool          # 容器里：有
```

⚠️ **一条"没报错"的 `xdotool` 不等于它送到了**：先核在哪一侧。⚠️ 用 `;` 串起来的
链要**显式 `export DISPLAY`**，否则只有第一条带环境——实测
`xdotool mousedown 1; sleep 0.3; xdotool mouseup 1` 里 `mouseup` 是丢 DISPLAY 的
（表现是"按下去没抬起来"）。

**② 界面下方那块黑方块是原生 GTK tooltip，不是网页里的弹层。** 上一批把它当成
"弹层没画出来"，连查了六个假设（固定/绝对定位、400 个子元素、内联
`background:red` + `z-index:99999`、借用主题变量……全部正常）。判据只有一条：
**截 `root`，不是截应用窗口**。

```sh
podman exec -u 1000 -e DISPLAY=:96 tauri-dev import -window root /tmp/shots/root.png
```

⚠️ `import -window <应用窗口 id>` 截的是**屏幕那一块区域**，override-redirect 的
窗口（原生 tooltip 就是这一类）**不在里面**，所以应用窗口截图里它就是一块黑；
`root` 把整屏合起来截，才看得到里面的字——那次是「代码语言」，即按钮的 `title`。
⚠️ **可迁移的那半条**：本容器里 `title` 会弹出**真窗口**，所以凡是"按钮下面莫名
多一块方东西"，先想 tooltip，别先想 CSS。

**③ "弹层开没开"用采点比色断言，别靠眼睛。** 弹层底色与纸面底色不同，取固定一点比色：

```sh
podman exec -u 1000 -e DISPLAY=:96 tauri-dev sh -c \
  'import -window root /tmp/p.png; \
   convert /tmp/p.png -format "%[pixel:p{500,620}]" info:'
# 开 → rgb(238,231,216)（--bg-raised）   关 → rgb(251,247,239)（纸面）
```

比眼力可靠，也能塞进"点完等 0.3s 再抓"的反复流程里。
⚠️ **别只截一张末态就下结论**——"开了又秒关"和"从来没开"在单张截图里长得一样。
区分办法是**探针分两次读**：同步读一次（当场）、延迟 0.8s 再读一次。那次实测
同步读到的矩形有效、延迟读到的已经 `连接=false 父=无 [0,0 0x0]`，才把"没画出来"
改判成"建了又被销毁"（真因见 `docs/07` §4 那批那条——是 `scrollIntoView` 触发的
滚动被"滚动就关"的窗口级监听吃掉了）。

**④ 清场要在容器里按 `DISPLAY` 筛，宿主上读不到容器进程的 `/proc/<pid>/environ`。**
宿主上那个文件对容器进程是 root-only，所以"在宿主上遍历 PID、筛 `DISPLAY=:96`"
这条路**会静默匹配不到任何东西**——上一批因此没杀干净，两个实例叠在同一块屏上，
被我当成了渲染错位。放进容器里做：

```sh
podman exec -u 1000 tauri-dev sh -c 'for p in $(pgrep -x nota); do \
  grep -qa "DISPLAY=:96" /proc/$p/environ && echo $p; done'
```

⚠️ 容器与宿主**共用 PID 命名空间**（本文件 §3.8 那条），所以**永远不要
`pkill -f <宽泛模式>`**，只按上面筛出来的具体 PID 杀。

⚠️ **另外一条这一批碰到的**：CSS 改动 vite 会**当场热替换**，但**改了 NodeView
那个 TS 模块（`editor/code-block.ts`）本批是要重启应用才生效的**。别把它当成
"代码写错了"——先按 §5.9 ① 看 `/tmp/nota-vite.log` 有没有 `Transform failed`，
没有就重开应用再验。

### 5.15 验 pandoc 那七种导出与两条 PDF 路（2026-09-25，**已开窗点过**）

这一批验的是「文件 → 导出 → PDF / Word / RTF / EPUB / LaTeX / OpenDocument / OPML」
七条，以及 PDF 那条**兜底**（pandoc 走不通时改用 Nota 自带的 WebKit 打印）。
起法照 §5.1 四步，另外三处和以前不同：

```sh
podman exec -d -u 1000 -w /tmp/nota-pandoc-test \
    -e DISPLAY=:94 -e GDK_BACKEND=x11 -e WEBKIT_DISABLE_COMPOSITING_MODE=1 \
    -e XDG_CONFIG_HOME=/tmp/nota-xdg/config -e XDG_DATA_HOME=/tmp/nota-xdg/data \
    -e GTK_IM_MODULE=gtk-im-context-simple \
    tauri-dev /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota/src-tauri/target/debug/nota \
    /tmp/nota-pandoc-test/测试.md
```

⚠️ **`XDG_CONFIG_HOME` / `XDG_DATA_HOME` 指到 `/tmp` 下的隔离目录**：`/home/lqy` 是
**bind mount 进容器**的（见「本机是 Fedora」那条记忆），不隔离就等于在动用户**真的**
那份 `~/.config/nota`（里面有明文密钥）。这一批全部在这套隔离目录里跑。

⚠️ **`GTK_IM_MODULE=gtk-im-context-simple`**：容器里跑着 `fcitx5`（§5.11 陷阱三），
`xdotool type` 送进去的 ASCII 会被当拼音吃掉。这一批**又踩到了**，而且症状比上次更
阴：要打的 `/tmp/nota-pandoc-test/out.docx` 变成
**`/特没谱/你哦他盘动词托尔斯泰/呸毗。docx`**——`nota` 被拆成 `n-o-t-a` 拼成了汉字。
两条绕法：① 起应用时把这个变量设上（本次用的）；② **不用键盘**——把应用的 `cwd`
设在目标目录里，对话框起来就在那儿，直接点 `Save`（本次后半程用的就是这条）。

⚠️ **`xwininfo` / `wmctrl` / `xxd` 容器里都没有**。窗口树改用
`xdotool search --onlyvisible --name ''` 再逐个 `getwindowgeometry --shell`；
看文件头用 `head -c 4 | od -An -tx1` 或 `od -An -c`。

**这一批点出来的实测值**（容器里 `pandoc 3.7.0.2`，PATH 里**没有**任何 LaTeX 引擎）：

| 情形 | 点/看到什么 | 落盘 |
|---|---|---|
| pandoc 装好、探测 `ready` | 点「Word (.docx)…」→ **直接进保存对话框**（**没有**面板）：标题「导出 Word 文档」、预填 `导出测试.docx`、筛选器「Word 文档」 | 11453 字节，头 `50 4b 03 04`（zip）；`word/document.xml` 里的文字 = 正文原文；`word/media/rId9.png` = 那张图 |
| 同上，点「PDF…」 | 同样直接进对话框，预填 `导出测试.pdf` / 筛选器「PDF」 | 69476 字节，`%PDF-1.4`，`/Producer (Skia/PDF m145)` = **WebKit 那条路**，1 页、1 张图 |
| `NOTA_PANDOC_CMD=/nonexistent-pandoc-xyz`（`missing` 那一档） | 点「PDF…」→ **出面板**：标题「导出 PDF」、符号 `!`、正文「没找到 `/nonexistent-pandoc-xyz`。七种文档格式（PDF / Word / RTF / EPUB / LaTeX / OpenDocument / OPML）都由它来转…」、详细框里四条装法、事实两行（命令｜排版引擎「没在 PATH 里找到」）、按钮「重新检测」「取消」**「用 Nota 自己排版导出」** | 点主按钮 → 保存对话框 → `Replace` → 69476 字节，同样的 Skia PDF |
| 正文里写了 `![](./根本没有这张.png)` | 导 docx **照样成功**（退出码 0、文件也在） | 出文件，但提示条多一句警告（见下） |

**提示条原文照登两段（这就是"如实说走哪条路"那条设计的成品）：**

```text
已导出到 /tmp/nota-pandoc-test/导出测试.pdf。这份 PDF 是 Nota 自己排的版：pandoc 那条路
没走通（pdflatex not found. Please select a different --pdf-engine or install pdflatex）。
排版是浏览器那套——要目录、要更讲究的分页，装好 pandoc 和一个排版引擎（xelatex /
tectonic 之类）再导一次。
```

```text
已导出到 /tmp/nota-pandoc-test/缺图测试.docx。Word 文档 是系统里那个 pandoc 转的。
另外它报了几条警告，这份文件里可能有没进去的东西：[WARNING] Could not fetch resource
./根本没有这张.png: replacing image with description
```

⚠️ **`missing` 那一档的面板上，主按钮是「用 Nota 自己排版导出」不是「去官网看安装指南」**
——这是对的，不是写错了：这台机器上 pdf 兜底在（Linux），所以"没装 pandoc"对 PDF 来说
不是死路。非 PDF 的六种在主按钮的位置才会是「去官网」。

#### 这一批才踩出来的三条

**① 语言环境不是 UTF-8 时，pandoc 会静默丢掉中文名的资源（已修）。** 第一次导出来的
docx 只有 10900 字节、`word/media/` 是**空的**。隔离出来的过程：

```sh
# 容器默认（LANG 未设 → POSIX），同一份文档：
pandoc -t docx --resource-path=/tmp/nota-pandoc-test -o /tmp/probe.docx 测试.md
#   [WARNING] Could not fetch resource ./点.png: replacing image with description
#   退出码 0
# 换成 UTF-8 语言环境：三张图（含中文名那张）全进去了
LANG=C.UTF-8 LC_ALL=C.UTF-8 pandoc ...   # → word/media 三个
```

⚠️ 三条合起来才要命：**退出码是 0**、**只是一句 WARNING**（在 `stderr` 里）、**图被换成
替换文字**。修在 `pandoc.rs::补语言环境`：只在"当前语言环境不是 UTF-8"时给子进程补
`LC_ALL=C.UTF-8`（用户的 `zh_CN.UTF-8` 不动）。**修完在同一台机器上复验**：还是没设
`LANG` 的那个容器，docx 变成 11453 字节、`word/media/rId9.png` 在里面。

**② 退出码 0 ≠ 全都做成了。** 上面那条的第 4 行——图没找到时 pandoc **成功返回**，
所以"看退出码"这一条判据漏得掉一整类失败。现在成功那一路也扫一遍 `stderr` 里带
`WARNING` 的行，塞进提示条（就是上面第二段提示条）。⚠️ 只挑 `warning` 那几行、
最多三条：成功时的 `stderr` 里多数是无关杂音。

**③ 提示语里那半句空的，一眼就该当 bug。** 修语言环境之前，兜底那条提示条读到的是
**「pandoc 那条路没走通（pandoc 没能生成 PDF：）」**——括号里**一个字的病因都没有**。
成因是 `一句话()` 取的是"第一行非空"，而本仓的报错是「结论行 + 换行 + 病因」那个形状，
第一行以冒号结尾。⚠️ **可迁移的一条**：所有"摘要一行报错"的代码都有这个坑；
判据很简单——**提示条上出现"冒号后面是空的"，就是它**（修在
`commands/pandoc.rs::一句话`，跳过以 `:` / `：` 结尾的标题行）。

#### 一件只记在代码里、这里只留指针的事

⚠️ `pdf_print.rs` 那条路上，**先按名字猜着写的 `gtk_print_settings_set_output_uri(…)`
编译期全过、链接期才炸**（`undefined reference`）——libgtk-3 根本没有导出那个符号
（`nm -D --defined-only /usr/lib64/libgtk-3.so | grep gtk_print_settings_set_output`
只有 `..._set_output_bin`）。结论与修法写在 `pdf_print.rs` 里 `KEY_URI` 那格注释上，
**可迁移的一句是**：判"某个 C 函数在不在"，**不能只看绑定的 `.rs` 里有没有声明**，
要 `nm -D` 去 `.so` 里查；而且**这类错 `cargo test --lib` 是照过不误的**（库目标不链接
那个二进制），只有 `cargo build` 才炸。

### 5.16 验装卸 / 信任 / 硬拒那一整条链（2026-09-25，**已开窗点过**）

这一节是 `docs/10` 里「插件装卸与签名」那一格 ✅ 的实证。**它的第一要务是别碰用户的
配置目录**：装 / 卸 / 信任三件事都会写 `$XDG_CONFIG_HOME/nota/`，而开发机上那就是
用户**真的**那份（里面还可能有 `plugin-settings/nota.ai.toml` 那种存着明文密钥的文件）。

#### ① 隔离三个 XDG，然后在那上面起应用

```sh
X=/tmp/nota-xdg
rm -rf $X && mkdir -p $X/config/nota $X/data/nota/plugins $X/cache
podman exec -u 1000 -e DISPLAY=:95 -e GDK_BACKEND=x11 \
  -e XDG_CONFIG_HOME=$X/config -e XDG_DATA_HOME=$X/data -e XDG_CACHE_HOME=$X/cache \
  -w "$PWD" tauri-dev ./src-tauri/target/debug/nota
```

⚠️ **`-e GDK_BACKEND=x11` 不能省**（§5.1 那条配方里**一直有**，本节的命令块是手拼的，
手拼就漏了它）。省掉它**不会报错**，后果是「看起来什么都没发生」：这个容器把
`/run/user/1000` 整个挂了进来，那里有一个**活的** `wayland-0`——宿主跑的是
**GNOME Wayland**（`/run/user/1000/.mutter-Xwaylandauth.*` 就是它的 XWayland 凭据）。
于是 GDK **默认选了 Wayland 后端**，把窗口开到**宿主真实的那个桌面**上去，
而 `:95` 这个无头 X 上从头到尾**一个 toplevel 都不会有**：进程活着、`WebKitWebProcess`
在跑（还吃着 CPU）、跟 vite 的 `ESTAB` 也在、GTK 主循环老老实实停在
`poll_schedule_timeout`、`import -window root` 截出来**纯黑**、`xdotool search`
在每个 `:9x` 上都只找得到几个 1x1 的辅助窗——**日志里一行错都没有**。
📌 **判据**：`ss -xp` 里能对上这个进程某个 fd 的对端是 `/run/user/1000/wayland-0`，
就等于它**根本没连 X**（真连上 X 的话对端长这样：`/tmp/.X11-unix/X95`）。
⚠️ **一次失败别急着怀疑代码**：这个坑的症状和「前端崩了」「窗口被藏起来了」一模一样，
2026-09-25 为此绕了大半个小时，而真凶只是一条环境变量。

⚠️ **三个都要给**。只给 `XDG_CONFIG_HOME` 的话，插件本体（`data/nota/plugins`）照样
落到**用户的** `~/.local/share/nota/plugins` 里——那正是最不该动的地方。
起之前先确认没有别的 `nota` 进程在这个 display 上（`pgrep -x nota` 看 PID 再对
`/proc/<pid>/environ` 里的 `XDG_CONFIG_HOME`），本机 `DISPLAY=:0` 上那个是用户的，
**不要碰**。

#### ② 造夹具：一条真签名、一条改过的、一条没签名的

```sh
tools/pack-plugin.py 目录 --new-key /tmp/nota-fixture/k.pem      # 一次性造把假钥匙
tools/pack-plugin.py 目录 --key /tmp/nota-fixture/k.pem -o signed.nota-plugin
tools/pack-plugin.py 目录            -o unsigned.nota-plugin     # 不签名
# 改过的：解出签名包、改一个成员、原样打回去（签名块不动 → 摘要必然对不上）
python3 - <<'PY'
import zipfile
z = zipfile.ZipFile("signed.nota-plugin")
items = [(i, z.read(i.filename)) for i in z.infolist()]
out = zipfile.ZipFile("tampered.nota-plugin", "w", zipfile.ZIP_DEFLATED)
for i, d in items:
    out.writestr(i, d.replace(b"--", b"-- TAMPERED", 1) if i.filename == "main.lua" else d)
out.close()
PY
python3 tools/pack-plugin.py --verify tampered.nota-plugin       # 期望「✗ 签名对不上」，退出码 1
```

⚠️ **夹具在容器里造、也在容器里用**——但理由是"图省事"，**不是"两边不共享"**。
本节原来写着「`/tmp` 在宿主和容器之间**不共享**」，**这句是错的**（2026-09-25 实测更正）：
`tauri-dev` 与宿主用的是**同一个 tmpfs**——`stat -c '%d %i' /tmp` 在两边都回 `50 1`，
容器里 `touch /tmp/标记-$$`，宿主 `ls /tmp/标记-*` 立刻看得见。
所以夹具在哪边造都行，文件框里要填的也是**同一个路径**。
📌 **教训**：容器共享什么、不共享什么，**一律以 `podman inspect` 的挂载表 ＋ `stat` 的
`dev/ino` 为准**，别凭印象——这条笔记当初就是凭印象写的，还顺手引去了 §5.2（那里也没说这事）。

⚠️ **`plugin.toml` 必须带 `[plugin]` 段**，顶层直接写 `id = "…"` 会被清单解析拒掉。
这条不是猜的，是这一次撞上的：界面上弹的是
「插件清单有误（`…/.装到一半-<pid>/plugin.toml`）：TOML parse error … missing field `plugin`」
——**装不进去，但应用不崩，而且临时目录名把病灶说清楚了**（`.装到一半-<pid>`）。

#### ③ 四步，每步都有硬判据

| 装什么 | 界面上的样子 | 磁盘上要验的 |
|---|---|---|
| `signed.nota-plugin` | 行上标「自装 · **未知签名者**」；随后自动弹出「信任这个签名者？**指纹：<16 位十六进制>**」 | `config/nota/plugins.toml` 里 `signature = "unknown"` ＋ `key_id` ＋ `public_key`；`data/nota/plugins/nota.demo/` 里**只有 `main.lua` 和 `plugin.toml`**（签名块**不落进来**） |
| 点「信任」 | 行上标变「**已验证**」，「信任」那颗按钮消失；toast「信任了 <指纹>」；面板下方「已信任的签名者」列出「指纹 ＋ 名字」 | 多出 `config/nota/trusted-keys.toml`：`[keys.<指纹>]` 三栏；账本里 `signature = "verified"` |
| `tampered.nota-plugin` | **红 toast「签名对不上——这个包在签完之后被改过，或者签名块是坏的。不装（这是唯一一条硬拒的路径）」** | 数据目录**一点没动**，也没留下 `.装到一半-*` |
| `unsigned.nota-plugin` | 标「**未签名**」，**没有**「信任」按钮，也没有确认框 | 账本里 `signature = "unsigned"`，且 `key_id` / `public_key` **两栏直接不出现**（没签名的包三样都是空的） |

**指纹那一栏是这套东西的要害**，所以它被验了两遍：界面弹出来的
`d3aff3dd9ce4a1f3` 与 `tools/pack-plugin.py --verify` 报的**逐字符相同**。
⚠️ **这条比它看起来重要**：Python 侧（作者打包用）和 Rust 侧（宿主验签用）是**两套
独立的实现**（`tools/pack-plugin.py` 与 `plugin/package.rs`），摘要规则写错一个字节，
两边都会"自洽"地算出各自的指纹。**只有拿同一份包在两边各算一次，才能证明它们一致。**

📌 **整条链在重编过的二进制上又原样跑了一遍**（2026-09-25 18:40 之后——重编本来就是
为了验 ⑤① 那个落盘）。四步的样子与上表逐条一致，另外把两处**磁盘原文**抄下来钉死
（这两个文件里都只有**公开**数据：公钥和指纹本来就是给人核对的东西）：

```text
# config/nota/plugins.toml —— 点过「信任」之后
[plugins."nota.demo"]
enabled = true
signature = "verified"
key_id = "d3aff3dd9ce4a1f3"
public_key = "WIc5jspSDcrnEdLo+AVxCUP/mGuwm6/xB/LPAvGTtQU="

# config/nota/trusted-keys.toml —— 同一时刻
[keys.d3aff3dd9ce4a1f3]
name = "演示插件"
public_key = "WIc5jspSDcrnEdLo+AVxCUP/mGuwm6/xB/LPAvGTtQU="
added_at = "2026-09-25"
```

⚠️ **两处 `public_key` 逐字符相同**这件事本身就是判据：账本记的是"这个包**当时**是谁签的"，
信任表记的是"**这把钥匙**我信了"——**信任挂在钥匙上，不挂在包上**（所以 ④ 那一步用
没签名的包盖掉之后，信任表一个字都不用动）。
⚠️ 段里出现的那把假钥匙的**私钥**（`/tmp/nota-fixture/k.pem`）从头到尾只活在 `/tmp`，
永远不入库、不进文档——这段抄进来的只有公钥。

#### ④ 用没签名的包盖掉已签名的那份，能看清"标注跟着谁走"

同一 id 再装一次是**原地升级**。用 `unsigned.nota-plugin` 覆盖之后：
行标注从「已验证」变「未签名」、账本里 `signature` 也跟着变，而
**`trusted-keys.toml` 一个字都没动**。这是对的——**信任是钥匙的性质，不是包的性质**；
真去改信任表反而是错的。

#### ⑤ 同一批修出来的三条

**① 弹性：`plugins.toml` 里那笔账的 `added_at` 一直是空的（已修）。**
`信任的钥匙::记下` 里写的是 `String::new()`，于是 TOFU 表里那栏永远是 `""`——
一张"我什么时候信的这把钥匙"都答不上来的信任表。现在填 `package.rs::今天()`：
**只用 `std`**（`SystemTime` ＋ 一段 `civil_from_days` 换算），不引 `chrono`、
不碰 `unsafe`。⚠️ 代价是**它算的是 UTC 的今天**：UTC+8 的用户在本地凌晨 0 点到 8 点
之间信任一把钥匙会记成前一天。这一栏界面不显示、验签不读，所以值当。
📌 用例只能验"填了、形状对"，**落盘那一半留给实机**——`记下` 会 `save()`，
而 `save()` 写的是**用户真的**那份信任表；所以用例走的是新拆出来的
`记下不落盘`（同一文件里的私有函数）。
✅ **落盘那一半 2026-09-25 已实机点过**：就是上面那段磁盘原文里的
`added_at = "2026-09-25"`（在隔离的 `XDG_CONFIG_HOME` 上，用户那份一个字没动）。

**② 真 bug：装完自动问的那一句，指纹永远显示「（未知）」。**
`usePlugins.ts::信任它` 里用 `plugins.find(...)` 现查指纹，而 `plugins` 是**这一次
渲染的快照**——「装」调它的那一刻，新插件**还不在快照里**，于是
`p?.key_id ?? "（未知）"` 走了兜底分支。**而指纹是那张对话框上唯一要给人看的东西**
（信任按指纹判，名字不算数），所以这个 bug 的观感是"它问了，但问了个寂寞"。
修法：指纹**由调用者传进来**（`装它` 手里有刚拉回来的清单，列表里那颗「信任」
正在渲染这一行，两处都拿得到）。⚠️ 可迁移的一条：**`useCallback` 闭包里的 state
是那一帧的**，"刚操作完的那个东西还不在里面"是这一类 bug 最常见的形状。

**③ 环境陷阱：`xdotool type` 打进文件框的中文路径会被输入法吃掉。**
本机跑着 fcitx5，`xdotool type "/tmp/nota-fixture/x.nota-plugin"` 到了输入框里变成
**`/特没谱/你哦他发/x.nota-plugin`**（拼音把 `tmp`、`nota-fixture` 都转成了汉字）。
LANG/LC_ALL 那条老办法（§5.4）**治不了这个**——它不是编码问题。
**解法是绕开逐键输入**：

```sh
printf '%s' "/tmp/nota-fixture/signed.nota-plugin" | xclip -selection clipboard
xdotool key --window $DLG ctrl+l; xdotool key --window $DLG ctrl+a
xdotool key --window $DLG ctrl+v; xdotool key --window $DLG Return
```

⚠️ **判据**：文件框的地址栏里出现**汉字**，就是这个坑（路径里本来不该有汉字）。
同理，**凡是往界面里"打字"的验证，能用剪贴板就别用 `xdotool type`**。

---


---

### 5.17 验自动保存（2026-09-25，**已开窗点过**）

自动保存是这一批唯一"没有画面证据、只有盘上证据"的功能：**成不成看 mtime 和字节**，
不看界面。三条判据都在无头 `:96` ＋ 隔离 `XDG_*` 上真点过。

#### ① 造一次"真改动"：点菜单，不要打字

⚠️ **`xdotool type` 在这个应用上不可靠**（§5.11 那条已经记过一次）。实测两种不灵：
打完字屏幕上**一个字都没多**、光标也没动；以及关闭设置框之后**头一次点击只把窗口
焦点拿回来、光标并不进编辑器**——那之后的 `xdotool type` 全落空。

可靠的做法是**点菜单**：`段落 → 水平分割线`（菜单栏 `(280,111)`，弹层里那一项
`(326,576)`）会真的插一条 `---` 进去，`onChange` 照常触发。判据是**标签栏和状态栏上
那个「● 已修改」**（分别在 `(161,728)` 和状态栏左端）——它出现就说明改动进了文档。
⚠️ 想用打字的话：**先点两下**再用放大截图确认光标真在编辑器里，然后才 `xdotool type`。

#### ② 到点真的写盘 / 关着真的不写

```sh
stat -c '%y %s' /tmp/nota-fixture/words.md    # 记下 mtime 与大小
# 造一次改动 → 等 >N 秒 → 再看一次；对照实验：把「自动保存」拨回「关闭」再走一遍
```

⚠️ 缩短一次实验的等待：`settings.toml` 里 `autosave_seconds` 最短那档是 **30 秒**，
所以一轮正负对照要 ~90 秒。⚠️ 夹具**先备份**（`cp x.md /tmp/x-before.md`）。

#### ③ "成功那一下不弹提示条"＝连拍求帧间差

"某个东西没有出现"没法用一张截图证明，用连拍：

```sh
mkdir -p /tmp/burst && rm -f /tmp/burst/*.png
for i in $(seq -w 0 30); do
  podman exec -u 1000 -e DISPLAY=:96 tauri-dev import -window root /tmp/burst/$i.png
  sleep 1.5
done
```

然后把每帧和"最早的"和"最晚的"各比一次（`magick compare -metric AE a.png b.png null:`）。
**判读**：如果全程只有**两个**取值（本例是 **0** 与 **20.302**，那是光标闪烁），
说明画面只有两个状态；存盘那一刻那个状态切换（脏点消失）差 **613.9 px**。
**提示条一旦出现会是上万像素且多出一个状态**——没有第三个状态，就是没弹过。

#### ④ 查"某个 effect 是不是在空转"：读 `/proc/<pid>/stat` 的 jiffies

这条抓的是**没有画面的性能 BUG**（本例：一个 effect 每次列表刷新都重跑，把 CLI 那份
文件反复重新打开）。`ps` 的 `%cpu` 是**开机到现在的均值**，看不出来；要读瞬时增量：

```sh
PID=$(podman exec -u 1000 tauri-dev pgrep -x nota | head -1)
podman exec -u 1000 tauri-dev sh -c \
  'A=$(awk "{print \$14+\$15}" /proc/'$PID'/stat); sleep 6; \
   B=$(awk "{print \$14+\$15}" /proc/'$PID'/stat); echo $((B-A))"'
```

`100` 个 tick = 1 CPU 秒。实测同一个进程：**修好后 3**（≈0.5 %）／**把那一行依赖加回去
447**（≈74 % 单核）／**去掉 1**。⚠️ **改一行依赖就能做 A/B**——Vite 的 HMR 会当场
把改动推上去，不需要重启进程，所以"改前/改后"量的是**同一个进程**，排除了启动开销。

#### ⑤ 崩溃在现场留下的唯一东西是日志最后一行

无头实例整套窗口消失时，`import -window root` 拿到的是**纯黑**。这时先看进程还在不在
（`pgrep -x nota`），再看启动时那份重定向日志的**最后一行**——本例是 glibc 的
`malloc(): unaligned tcache chunk detected`（原生堆损坏，**不是 panic、不是 JS 异常**，
前端那些兜底一条都不会响）。⚠️ 别把它当成"窗口关掉了"：日志里没有 Rust panic
也没有 `Failed to` 之类的交代，那就不是应用层主动退的。

### 5.18 验菜单交互与「打开文件夹」（2026-09-25，BUG-17 / BUG-27）

#### ① 菜单项坐标怎么量（**别靠肉眼读数**）

菜单是浮层、位置跟着窗口走，而 `-crop` 之后**眼睛读出来的 y 值经常差二十几像素**——
本批第一轮就是照着肉眼值点的，点在了旁边那一行上，白白怀疑了一轮"划过去也开不了"。
两条能用的办法：

```sh
# 甲：给裁剪图叠一把尺子（每 20px 一条线并标上绝对 y），人眼对着读。
# ⚠️ MVG 要写进文件再 `-draw @文件`：拼在命令行里会被引号坑掉
#    （`non-conforming drawing primitive definition 'line'`）。
python3 - <<'PYGEN'
lines=["stroke red","stroke-width 1","fill none"]; texts=[]
for y in range(10,600,20):
    a=y+130
    lines.append(f"line 0,{y} 300,{y}"); texts.append(f"text 250,{y-2} '{a}'")
open("/tmp/ruler.mvg","w").write("\n".join(lines+["stroke none","fill red","font-size 11"]+texts))
PYGEN
magick 截图.png -crop 300x600+150+130 +repage -draw @/tmp/ruler.mvg /tmp/ruler.png

# 乙（更稳）：把鼠标停到候选 y 上，只看那一行的裁剪——高亮会告诉你停对没有
xdotool mousemove 250 573; sleep 0.8; import -window root /tmp/h.png
magick /tmp/h.png -crop 300x90+150+530 +repage /tmp/h-crop.png
```

⚠️ **`import -window root` 出来的坐标就是屏幕坐标**（窗口左上角在哪，菜单就在哪个绝对
坐标上），不需要再换算。

#### ② BUG-17 的判据：**划过一帧、单击一帧，量两帧差**

```sh
xdotool mousemove 180 111 click 1          # 开「文件」菜单
sleep 1
xdotool mousemove 250 573                  # 划过带子菜单的那一项（导出）
sleep 0.6; import -window root /tmp/a.png  # 甲帧：划过
xdotool click 1
sleep 1.0; import -window root /tmp/b.png  # 乙帧：单击之后
magick compare -metric AE /tmp/a.png /tmp/b.png null:
```

实测：修前 **43068.9 px**（子菜单整块消失）；修后 **87.3 px**（只剩光标闪烁那一档，
见 §5.17 ④ 那张表）；再点第二下才关（**43319.2 px**）。
⚠️ **必须"划过之后停半秒再拍甲帧"**：`xdotool mousemove` 之后浏览器还没派发
`mouseenter` 时拍到的甲帧是"还没开"，那两帧差就变成别的东西了。

菜单栏那一份（划过另一栏再点它）用同一个套路，但判据换成**与「全关」基准帧的差**：
菜单开着时差 **61363 px**，第二下点击后回到基准（**365.9 px**）。

#### ③ 「这一步真的跑到了吗」——临时探针提示条

`打开主题文件夹` / `打开文件夹` 这类命令**成功时没有任何界面反应**（只有失败才弹
提示条），所以"点了一下、没有错误条"证明不了命令跑到了。本批用的办法是**把返回值
临时吐成一条提示条**：

```ts
// 改完记得改回来（本批两处都改回来了）
toast(`【临时探针】${await api.theme.openDir()}`, "success");
```

截图上就能读到 `【临时探针】/tmp/nota-xdg/config/nota/themes`——**既证明命令跑了，
也证明它算出来的目录是对的**（隔离 `XDG_*` 下正是那两条路径）。⚠️ Vite 的 HMR 当场
生效，不用重启进程；**探针必须在同一批里撤掉**，否则它会留在仓库里假装是个功能。

#### ④ 「打开文件夹」在容器里的结论只有一半

容器里有 `xdg-open`（`/usr/bin/xdg-open`）但**没有文件管理器**，所以"弹出了文件管理器
窗口"这一步在这里**验不了**。能验的是：ACL 不再拦（修前必弹 `opener.open_path not
allowed`）、命令返回的路径正确、应用不报错。⚠️ 真机上应当再点一次确认。

---

### 5.19 验窗口标题跟着文档走（2026-09-25，**已开窗点过**）

第 51 项的验法。**这一步不需要截图、也不需要挑窗口**——标题就在 `WM_NAME` 里：

```sh
# 把这一份容器里的 shell 当模板用（DISPLAY 换成本轮的显示号）
xdotool search --name 'Nota' | while read w; do
  n=$(xdotool getwindowname "$w" 2>/dev/null)
  [ -n "$n" ] && echo "$w  [$n]"
done
```

⚠️ 这会列出**所有**带 `Nota` 字样的窗口（一堆名字是 `nota` 的内部窗口），
主窗口那行**是哪个**看名字就知道（它的名字是完整标题）。别用
`xdotool search --name '^Nota$'` 去**定位**主窗口——理由与更强的几何判据在 §5.3。

四个状态都要看，缺一个就不算验过：

| 状态 | 怎么造 | 标题应当是 |
|---|---|---|
| 开着文档、没改动 | `nota /tmp/nota-fixture/words.md` | `字数样张 — Nota` |
| 开着文档、有改动 | 点进正文敲一个字（**别存**） | `字数样张 • — Nota` |
| 没开文档 | 在干净文档上按 `Ctrl+W` | `Nota` |
| 再打开 | `Ctrl+O` → `Ctrl+L` → 粘路径 → `Return` | 回到第一行 |

⚠️ "敲一个字"那一步**记得 `Ctrl+Z` 撤销**，并核对夹具没被动过
（`md5sum /tmp/nota-fixture/words.md`，基线 `82cab6dea322f837f53b2145b10cdf67`）。
本批四个状态的字面读数依次是 `字数样张 • — Nota` / `字数样张 — Nota` / `Nota` /
`字数样张 — Nota`，`Ctrl+Z` 之后 `•` 当场消失。

⚠️ **`Ctrl+O` 那个对话框要按 `Ctrl+L` 走"位置"输入行**再打路径——直接打字符会被
文件列表吃掉（第一次打的一串路径就是这么丢的）。这条对任何 GTK 文件对话框都成立。

⚠️ **主窗口的标题变了，别处依赖"标题恒为 Nota"的工装要跟着改**：本节的 §5.3 就是
一处（那一节按名挑窗口的写法本批改掉了）。

### 5.20 验大纲跳转 / 查找滚动 / 打字机，以及查找条的 key 泄漏（2026-09-25）

这里三件事共用一套动作，所以写在一节里：**滚没滚**（第 48 项 ＋ 查找）、
**打字机模式滚到正中**、以及 **BUG-33 那个"关掉的查找条不消失"**。
三者的判据都是**两帧像素**（`magick compare -metric AE`），因为它们的症状
全都是"屏幕上少了/多了点什么"，而这类毛病**看日志一个字都看不到**。

**夹具**：`/tmp/nota-fixture/ol.md`（`md5 53b8b0931c564baf799dadd262e09b9e`）。
形状是 `# 第一节` ＋ 12 段填充、`## 第一小节`、`## 第二小节`、`## 第二节`、
`## 第三节`（里面有 `丙1`…`丙8`，查找用得上）。跑完记得核对 md5 没变。

**开窗**：按 §5.1 那四步（隔离 `XDG_*` ＋ Xvfb `:96`）。本节的读数都在
1100×760、窗口左上角 `(151,92)` 的几何下量的：

| 要点的东西 | 绝对坐标 | 备注 |
|---|---|---|
| 菜单栏 | y ≈ **111** | 文件≈171 / 编辑≈244 / 段落≈308 / 格式≈354 / **视图≈401** / 主题≈451 / 插件≈503 / 帮助≈555 |
| 「视图」弹出层 | x ≈ **400** | 项 y：侧边栏≈149、大纲≈177、文件树≈203、文档列表≈232、搜索≈259、插件栏≈296、**格式化工具栏≈324**、`view.slidev` 的下一项起≈353…（⚠️ **这串数录于 2026-09-25 之前**，那天删掉了中间的「Slidev 预览」一项，所以**"所见即所得"往下每一条都要再往上挪约 27px**——逐项点之前**先裁块核一遍**，别抄旧数） |
| 「插件」弹出层 | x ≈ **503** | 插件自己声明的菜单项（`__plugin:<插件>:<命令>`）。⚠️ 栏目本身在**没有任何插件菜单时不存在**（不画一栏空的）。`plugins/slidev/` 装好时是「开始 Slidev 预览」/「停止 Slidev 预览」两项。⚠️ 这一栏的坐标**没有录过**——要用就现量 |
| 大纲里的行 | x ≈ **198** | 第一节≈189、第一小节≈214、第二小节≈242、第二节≈270、第三节≈296 |
| 查找条的查询框 | x 687–995、y ≈ **141** | 条子横跨窗口正文区 |

⚠️ **「格式化工具栏」不是一条开关，是一个子菜单**（始终显示 / 鼠标悬停时显示 /
始终不显示）——点它只会展开下一层，**别拿它当"点一下就切换"用**（本批在这上面
白点过一轮）。

**① 大纲跳转（所见即所得）**：点一节，看正文有没有滚、滚到哪儿。

| 动作 | AE（`magick compare -metric AE 前 后 null:`） | 说明 |
|---|---|---|
| 点「第三节」（在最下面） | **46704.7** | 滚过去了 |
| 点「第一小节」 | **48348.1** | 同上 |
| 点「第一节」（已经在视野里） | 顶到顶部就算对 | ⚠️ **"没动"也是正确结果**，别拿它当失败 |

⚠️ **落点是"标题贴在视野顶部"**（和 VSCode / Typora 一致），不是"能看见就行"。
⚠️ **必须点两次才算验过**：这个 bug 原来的症状就是**第一下不滚、第二下才滚**
（根因见 `docs/04` §2.2a），所以只点一次会得到一个假的 ✅。
源码模式（「视图 → 源码模式」，y≈407）走一遍同样的动作，判据一样。

**② 查找的命中要滚进视野**：文档拉到最上面 → `Ctrl+H` → **点一下查询框**（见下面的
坑）→ 打 `丙7`。命中应当出现在**底边**附近并可见，AE ≈ **46015.5**。
⚠️ 记这个数的时候正文在文档顶部、命中在屏幕外，所以这一条真的在验"滚进来了"。

**③ 打字机模式滚到正中**（「视图 → 打字机模式」，y≈532）：同一个光标位置，
关着 vs 开着，AE ≈ **45538.3**。⚠️ 别指望它和"顶部对齐"那两档一样——它把光标
那一行摆到**容器正中**，是另一档手感。

**④ BUG-33：关掉的查找条会不会消失。** 这是本节最值得照着做的一条，因为
**它一次就能看出"泄漏"和"没泄漏"的区别**：

```sh
# 点进正文 → 然后 CTRL+H / ESC 各三次，每步拍一帧
for i in 1 2 3; do
  xdotool key ctrl+h; sleep 1; import -window root /tmp/shot/开$i.png
  xdotool key Escape; sleep 1; import -window root /tmp/shot/关$i.png
done
```

| 比哪两帧 | 修前 | 修后 |
|---|---|---|
| 第 1 次开 vs 最后一次开 | **137147**（摞了三条） | **0.009**（量化噪声，等于同一张画面） |
| 两次「关」之间 | — | **0**（干净） |
| 开 vs 关（**对照组**） | — | **91941.7** |

⚠️ **对照组不能省**：没有它，"两次开几乎一样"也可能是"这个判据根本看不见那条子"。
⚠️ 泄漏的**视觉特征**是：条子还在，但**没有焦点框**（焦点已经被 `关查找` 还给编辑区了）。
📌 本批修法：查找条的 key 加前缀（`find-<id>`），机理与"为什么当初没能复现"记在
`docs/04` §2.2a 末尾、BUG 本身在 `docs/07` §2 BUG-33。

⚠️ **本节撞到的四个环境坑，记下来省得下一个人再撞**：

1. **`F8` / `F9` 送不进应用**（专注模式 / 打字机模式）。`xdotool key F8` 在这个
   WebKitGTK ＋ Xvfb 组合下没有反应，而**菜单点得动**——所以这两项要验就用
   「视图」菜单里那两行（y≈503 / 532）。同理别用 `xdotool key` 去碰其它功能键，
   先拿菜单试一次。
2. **`Ctrl+H` 之后必须点一下查询框再打字**。焦点这会儿还在正文里，直接打就把
   字**打进文档了**（本批真弄脏过一次，`Ctrl+Z` 救回来的，之后核了夹具 md5）。
3. **`xdotool type` 打不了中文**（`Invalid multi-byte sequence encountered`）：
   要走 `xdotool key U4E19 7`（`丙7`）这种写法，或者用纯 ASCII 的查询词。
4. **别把 `kill` 和别的命令写在同一个 `bash -c` 里**：匹配 `debug/nota` 的
   `ps | grep` 会**命中调用者自己那条命令行**，结果是把自己的 shell 干掉
   （`exit 144`，本批踩了两次）。要杀实例就单发一条，并且用
   `ps -eo pid,cmd | grep "[t]arget/debug/not[a]"` 这种带方括号的写法。

📌 本批把上面那串动作收成了一个 `/tmp/nota-gui.sh`（`start` / `stop` / `click` /
`key` / `shot` 五个子命令，**放在 `/tmp`，不进仓库**）——它只是把本节这些命令
包了一层，别把它当成项目的一部分。

### 5.21 验编辑手感那五件（2026-09-26，**已开窗点过**）

标题回车成块 / 表格输入 / Mermaid 图表 / 三套新主题 / 分割线全行。
五件的判据都是**截图里看得见的东西**（标题变大了没、表格出没出、图是不是
自然尺寸、三套主题长得一不一样、横线有多长），所以这一节记的是**动作与读数**。

**开窗**：按 §5.1 那四步。本节读数在 **1100×760、窗口左上角 `(150,70)`** 的几何下量：

| 要点的东西 | 绝对坐标 |
|---|---|
| 菜单栏（y ≈ **91**） | 文件≈182 / 编辑≈238 / 段落≈294 / 格式≈350 / **视图≈370** / **主题≈423** / 插件≈475 / 帮助≈522 |
| 「主题」弹出层里的项 | 无主题≈130 / **极简≈164** / **Adwaita≈192** / **LaTeX≈220** / 打开主题文件夹…≈248 |
| 正文第一行 | x ≈ 250 起 |

⚠️ **上面这串数与 §5.20 那张表对不上**（那边记的是「视图≈401 / 主题≈451」），
**这不是笔误**：两次的窗口位置、字号档都可能不同，而这几个栏目**没有固定的
屏幕坐标**。**用之前先裁一条 `1080x30+0+80` 看一眼栏目落在哪儿**，别抄。
⭐ **点「主题」的正确姿势是两步**：先点 (423,91) 把菜单**开出来**，再点条目——
一次性直接点条目会落进正文（本节在这上面白点过一轮，因为上一条脚本的点击
已经把菜单关掉了）。

**① 标题回车成块**（`editor/heading-on-enter.ts`）——四帧：

| 步骤 | 屏幕上应当看到 |
|---|---|
| 打 `# Hello` | **还是普通段落**，`#` 与一个空格画在左侧装订线里、正文**加粗** |
| 再按回车 | 变成 **h1**（大字），装订线里那个灰 `#` 还在 |
| 同一刻 | 下面**多出一个空段落**，光标在那儿 |
| 在 h1 行首按退格 | 退回**普通段落**（⚠️ 这一条是上游给的，见 `docs/07` §1 那一行） |

**② 表格输入**（`table-input.ts`）：`| name | qty |` ＋ 回车，再 `| --- | --- |` ＋ 回车
→ 真表格（表头 `name`/`qty`、下面一空行、光标在第一格）。

**③ 分割线**（`---` ＋ 回车）：横线**从正文左沿拉到右沿**。判据是**长度**——
用 `magick 图.png -crop 1x1+198+<y> -format "%[fx:mean]" info:` 这类采样，
或者直接量那一条的起止像素（本节量到 **198 → 1195**，改之前只有左边一小截）。

**④ Mermaid**：打 ` ```mermaid ` ＋ 回车，然后**逐行**打
`graph TD` / `A[Start] --> B[End]`。
⚠️ **别用 `xdotool type --file`**：它在 textarea 里**把换行吞掉**，
`graph TD\nA[Start] --> B[End]` 会变成一行，mermaid 报
`Expecting 'NEWLINE', got 'NODE_STRING'`——**这条报错本身反而把错误卡验了**
（错误卡上有人话 ＋ mermaid 原文）。正确姿势是
`xdotool type 'graph TD'` ＋ `xdotool key Return` ＋ `xdotool type 'A[Start] --> B[End]'`，
每行一条命令。
⚠️ 另外 `A --> B` 里有 `>`，**写进 `bash -c` 会被当成重定向**（报
`bash: line N: B: No such file or directory`）——**把脚本写到宿主的 `/tmp` 再
`podman exec … bash /tmp/xxx.sh` 跑**，别跟引号较劲。§5.11 已经有一条同源的坑。

**⑤ 三套主题**：菜单里是 **无主题 / 极简 / Adwaita / LaTeX / 打开主题文件夹…**。
逐套点，每套选中后应当弹一条「文档主题已换成「X」」，而且三套**肉眼可辨**：
极简＝白纸＋衬线＋方角、Adwaita＝无衬线＋蓝色引用竖条＋圆角、LaTeX＝标题居中。

⚠️ **本节四个新踩的环境坑**：

1. **改完前端代码不要指望 HMR。** 本节改了 `editor/diagram-view.ts` 之后，
   重新 `import` 拿到的仍是**旧行为**，`Ctrl+R` 也刷不动 WebView。
   **唯一可靠的做法是杀掉实例、按原命令重启二进制**
   （重启后落在欢迎页 → `Ctrl+N` 新建文档 → 再走一遍流程）。
2. **`import -window root` 抓不到光标本身。** 想验"光标是不是在闪"时，
   连拍若干帧再比邻近两帧的像素（本节探到第 4→5 帧的 `mean` 从 `0.954232`
   变到 `0.961281`，约 12 个全黑像素的差，与"画了一条光标"相符）。
   ⚠️ **这是启发式、不是证明**——无 WM 的 Xvfb 里没有光标绘制这回事，
   别把这类读数写成"验过了"。
3. **窗口要按几何挑，别按名字。** `xdotool search --name` 会返回一堆窗口
   （§5.3），挑 **宽高 ≥ 560×400** 的那个；本节那次的 id 是 `2097156`。
4. **`convert` 会打弃用告警**（`use "magick"`）。功能正常，只是噪音，
   别把它当成出错。

📌 **本节用到的脚本也放在 `/tmp`，不进仓库**（与 §5.20 末尾那条同一条规矩）。

### 5.22 验"行内原子后面那颗空格"存成了什么（2026-09-26，**开窗读过字节**）

**要验的是什么**：行内公式（`$x$`）后面紧跟一个空格，**存盘写出去的必须是普通空格
（`0x20`）**，不是 WebKit 塞进去的 **U+00A0**。做法与边界见 `docs/05` §4.11 ②。

**为什么单列一节**：这一条**没法靠单元测试判**——它要真 WebKit ＋ 真打字。
`tests/atom-space.test.ts` 那 19 条测的是判据本身，**它全绿的时候这个功能可能一次都没生效**
（第二版挂 `$remark` 插件就是这样：测试全绿、`tsc` 干净、开窗不报错，**转换器根本没被调用**）。
唯一判据是**读落盘的那几个字节**。

**开窗**：按 §5.1 那四步，⚠️ **那两行环境变量一个都不能省**（`:98`、隔离三个 XDG）：

```sh
DISPLAY=:98 GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 XDG_CONFIG_HOME=/tmp/nota-ax/config XDG_DATA_HOME=/tmp/nota-ax/data GTK_IM_MODULE=gtk-im-context-simple   nohup ./target/debug/nota /tmp/nota-ax/t4.md > /tmp/nota-ax/log.txt 2>&1 &
```

⚠️ **省掉 `GDK_BACKEND=x11` / `WEBKIT_DISABLE_COMPOSITING_MODE=1` 的后果是"没有窗口"**：
进程活着、`WebKitWebProcess` 也在、日志一句错都不报，**就是没有 X 窗口**（`xdotool search` 只找到 root）。
本次在这上面白等了 1 分多钟才回头照抄 §5.1——**这一节的命令直接抄，别自己简化**。

**动作**（`xdotool`，挑 ≥560×400 的那个窗口）：

```text
点进正文 → Ctrl+A → Delete
打 `A` → 打 `$bb$` → 敲**空格** → 打 `BCD`（⚠️ 紧跟着再敲字，是"空格会不会丢"的那一步）
Esc → Ctrl+S
```

**判据（`od -c` / `hexdump -C` 读宿主上那份文件）**：

```text
A   $   b   b   $       B   C   D  \n     ← 对：`$` 与 `B` 之间是 0x20
A   $   b   b   $ 302 240   B   C   D  \n  ← 错：`302 240` 就是 U+00A0（C2 A0）
```

⚠️⚠️ **必须同时做一次"摘掉那个包装"的对照**，否则分不清"是包装生效了"还是
"这次 WebKit 没插 NBSP"。摘法：把 `create.ts` 里 `原子后的空格(...)` 那一层去掉
（`text: 不转义行首井号(prev.handlers?.text)`），重启实例，**跑同一条动作**。
2026-09-26 这一对读数是：

```text
装着包装：  A$bb$ BCD        （0x20）
摘掉包装：  A$bb$\302\240BCD  （C2 A0）
```

**顺带读到的一条**：硬换行（`Shift+回车`）后面**WebKit 不插 NBSP**——打
`X$cc$` ＋ `Shift+回车` ＋ `Y`，落盘是 `X$cc$\` ＋ 换行 ＋ `Y`，一个 `302 240` 都没有。
所以"行内原子"那张表里的 `break` 那一条**至今没有实测触发过**（它按上游 `toMarkdown`
的名字写对了，属于防守；真要验它，得先造出一份"硬换行后面真有一颗 NBSP"的文件）。

📌 本节脚本放在 `/tmp`（`nota-ax-setup.sh` / `nota-ax-drive.sh`），不进仓库（与 §5.20 / §5.21 同一条规矩）。

### 5.23 验 front matter 存盘（2026-09-26，**开窗读过落盘字节**）

**验的是哪一件**：BUG-39 的修法到底成没成——**打开一份带 YAML front matter 的文件、什么都不改、直接
存盘，开头那一段是否逐字节还在**。这条只能开窗读字节，因为缺陷本身就是"存盘那一刻才发生"的。

**夹具**（放在宿主上，容器与宿主共享 `/home/lqy`）：

```text
/home/lqy/nota-slidev-探/with-theme.md      ← `---\ntheme: seriph\n---\n\n# 写了主题的一份\n\n正文一页\n`
存盘前 md5：09ca065a66f754dc264f6159c355e518
```

⚠️ 夹具**故意带三样东西**：① `theme:`（Slidev 插件要读的那一行）；② 围栏后面**一个空行**
（正文开头那个空行会不会被规范化掉，是第 56 项同族的老账）；③ 中文标题（确认正文照旧渲染）。

**怎么起**（无头 `:98`，**隔离 `XDG_CONFIG_HOME` / `XDG_DATA_HOME`**，不碰用户真实配置）：

```bash
cd src-tauri && DISPLAY=:98 GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  XDG_CONFIG_HOME=/tmp/nota-ax/config XDG_DATA_HOME=/tmp/nota-ax/data \
  GTK_IM_MODULE=gtk-im-context-simple \
  nohup ./target/debug/nota /home/lqy/nota-slidev-探/with-theme.md > /tmp/nota-sl-s2.log 2>&1 &
```

⚠️ **驱动与截图一律走容器**（宿主上没有 `xdotool` / `import`）：

```bash
podman exec -u 1000 -e DISPLAY=:98 tauri-dev bash -lc 'xdotool key --clearmodifiers ctrl+s; import -window <id> /tmp/x.png'
```

**动作与判据**（`md5sum` 读宿主上那份文件；⚠️ 每次 `Ctrl+S` 之后都读一次）：

```text
打开夹具        → 正文顶上画出那条 front matter 说明条，`# 写了主题的一份` 渲染成一级标题
Ctrl+S          → md5 09ca065a66f754dc264f6159c355e518   ← 与存盘前**一字不差**
Ctrl+/ 源码模式 → Ctrl+S → md5 同上
Alt+1 回所见即所得 → Ctrl+S → md5 同上                    ← 三次全同，**连围栏后那个空行都在**
Alt+2 分屏      → 左侧源码看得见 front matter，右侧只读预览**不显示**它
```

⚠️ **改之前**同样是这条动作，结果是 `---` ＋ 空行 ＋ **`## theme: seriph`**（收尾围栏被吃、那一行落成
setext 标题）——`od -c` 一读就看见。**"改之前"这一栏没有单独重跑**：它是追根因时撞出来的读数，
BUG-39 那一行记着。

**顺带做的第二件事（用户的原始报障）**：插件栏 → `Slidev` 页签。判据是那面板上的一行字：

```text
改之前： 这份文档没写主题，Slidev 要的默认主题 `@slidev/theme-default` 没装。
改之后： 已检测到 Slidev 53.0.0，可以打开预览。
        命令  npx @slidev/cli     版本 53.0.0     项目根 /home/lqy/nota-slidev-探
        主题包  找到了 `@slidev/theme-seriph`
```

⚠️ **这一行顺带推翻了一句旧话**：`docs/07` §1 那张表里原来写着「`ready` 那一格仍然没在界面上见过」
——`ready` 的**画面**这次见到了（面板给的是「开始预览」＋ 一张事实表，**没有** `missing` 那两颗按钮）。
⚠️ **但它只说明"探测"通过**：点「开始预览」才真去起 `npx @slidev/cli`（第一次要下几百 MB），
**那一步没做**——"真 Slidev 一次都没跑通过"这条欠账原封不动。

**顺带读到的一笔小账**（**决定不改**）：状态栏的字数把 front matter 也算进去（显示 `15 词 39 字符 8 行`）。
口径在 `ui/outline.ts`（见 `docs/05` §8.2），几行元数据多算几个字，不动。

📌 本节脚本放在 `/tmp`（`nota-sl-launch.sh` / `nota-sl-drive.sh`），**不进仓库**（与 §5.20 / §5.21 / §5.22 同一条规矩）。
⚠️ 那两份脚本是在**宿主**上跑 `.target/debug/nota` 的（宿主能跑容器里编出来的二进制、X socket 共享），
但**里面调 `xdotool` / `import` 的那几行必须走 `podman exec`**——宿主没这两个命令，直接跑会看到
`xdotool: 未找到命令`，而**应用本身照样起来了**（这是个会让人误判"没验成"的坑）。

### 5.24 验 git 那一批的九格画面（2026-09-26，**已开窗点过**）

验的是用户点名的三件事——**界面能 `git init`、界面能设 Git 身份、提交树**——加上
它们带出来的整条链。**九格全部亲眼过了一遍**，而且每一格都用**落盘的东西**判对错，
不看界面上写了什么。

**夹具**（两份，各管一半）：

| 路径 | 是什么 | 用来验 |
|---|---|---|
| `/tmp/nota-git-裸/新文档.md` | **不是** git 仓库的空目录 | 非仓库那一屏、`git init`、`填身份…`、第一次提交 |
| `/home/lqy/nota-git-树/a.md` | 6 颗提交含**一次 `--no-ff` 合并**、工作区有一处未提交改动、**没配身份** | 提交树的合并连接线、点图线看 diff、选两颗比区间 |

**跑法**（整行照抄，别手拼——`GDK_BACKEND` 漏了会静默开到用户真实桌面上，见 §5.1）：

```sh
podman exec -u 1000 -d -w "$PWD/src-tauri" \
  -e DISPLAY=:98 -e GDK_BACKEND=x11 -e WEBKIT_DISABLE_COMPOSITING_MODE=1 -e LANG=zh_CN.UTF-8 \
  -e GTK_IM_MODULE=gtk-im-context-simple -e XMODIFIERS=@im=none -e QT_IM_MODULE=none \
  -e XDG_CONFIG_HOME=/tmp/nota-目检-配置 -e XDG_DATA_HOME=/tmp/nota-目检-数据 \
  tauri-dev bash -lc './target/debug/nota "/tmp/nota-git-裸/新文档.md" > /tmp/nota-gui.log 2>&1'
```

⚠️⚠️ **`XDG_CONFIG_HOME` / `XDG_DATA_HOME` 那一行是必需的，不是讲究**。
漏掉它，应用读的就是 `/home/lqy/.config/nota/settings.toml`——**那是用户的真配置**
（`~/.config/nota/plugin-settings/nota.ai.toml` 里还有明文 API 密钥）。
2026-09-26 我漏过一次：**这次没造成写入**（那份文件的 mtime 停在 14:31，我启动在 17:00 之后；
`~/.local/share/nota` 下所有时间戳也都 ≤ 13:49），但那是**运气**——判据是
`stat -c %y` 对上没对上，**不是"看着没事"**。顺手把 stdout 落进文件
（`> /tmp/nota-gui.log 2>&1`），不然 JS / 宿主的报错全丢。

**九格**（每一格的判据都是"落盘的字节"，不是画面）：

| # | 动作 | 判据 |
|---|---|---|
| 1 | 打开非仓库目录里的文档 | 面板给「这里不是 git 仓库」＋「初始化仓库」「再试一次」两颗 |
| 2 | 点「初始化仓库」 | `ls -a` 里有 `.git`、`rev-parse --is-inside-work-tree` 是 `true`、分支 `master` |
| 3 | 点「填身份…」 | 弹出的是**两个字段**的框：`Git 身份`／占位符 `名字，比如：张三`，`邮箱`／占位符 `you@example.com`，提示行 `git 拿它给每次提交署名` |
| 4 | 填 `Zhang San` / `zhang@example.com` 后点「确定」 | `.git/config` 里长出 `[user] name = Zhang San` / `email = zhang@example.com`；⚠️ `git config --global user.name` **是空的**（只写仓库本地，没碰 `~/.gitconfig`）；面板上那条身份警告消失＋底部 toast「Git 身份已记在这个仓库里」 |
| 5 | 点「提交…」填 `First note` 后点「确定」 | `git log --format='%h\|%an\|%ae\|%s'` → `561c341\|Zhang San\|zhang@example.com\|First note`（**署名用的就是第 4 格刚写进去的那份**） |
| 6 | 点「提交树」 | 树上 6 颗提交 ＋ 2 条纯连接线行（`\`、`/`）；**与宿主那条命令的输出逐字一致**（下一段） |
| 7 | 点某一行的**图线**那颗键 | 摊出「第一次提交 561c341（全部内容都算新加的）」＋整份 `git show` 的 diff ＋「清空选择」 |
| 8 | 点两行**右边的字** | 两行都高亮、多出一行「已选：1583864、32b98f1」、多出「32b98f1 → 1583864 之间」一段；⚠️ 我故意**先点新的后点旧的**，它自己摆正成了"旧 → 新"（`set_compared` 里那次 `merge-base --is-ancestor`） |
| 9 | 点「在编辑区看」＋「清空选择」 | 编辑区那一份摊的**与右栏逐字相同**（两处共用 `compared_blocks`）；点「清空选择」之后回到工作区那一份差异 |

⚠️ **第 6 格差点被我判成"图线配错了"**：我手跑的是
`git log --oneline --graph --all`，那与宿主**不是同一条命令**——宿主跑的是
`log --graph --date-order --no-color -n <n> <格式串>`（`src-tauri/src/lua/api/git.rs`）。
`--date-order` 会**换掉行的顺序**（我这次 d9d8ce9 和支线那两颗的先后就反了）。
比对的正确做法是**照抄宿主那一行**：

```sh
git -C /home/lqy/nota-git-树 log --graph --date-order --no-color -n 60 \
    --format="%x1f%h%x1f%p%x1f%d%x1f%s"
```

逐字对上之后：**图的形状、`* |` / `| *` 与提交的配对、连接线行，全都正确**。
⚠️ **教训**：验"渲染对不对"时，**参照物必须与代码里那条命令同一个**，
否则你会花半天在一个不存在的 bug 上（我为此在提交树上白试了四轮坐标）。

📌 **本节脚本不进仓库**（与 §5.20–5.23 同一条规矩）。夹具也不进仓库，
但它们**比脚本值钱**：`/home/lqy/nota-git-树` 是"带合并的提交树"唯一的现成样本，
下次要验树别再自己现搭。

**这一轮读到的两处漏字**（**没改**，记在 `docs/07` 的欠账里）：

1. 还没第一次提交时，分支标题显示的是 git 自己那句 **`No commits yet on master`**
   ——中文界面里的一句英文。根因：`解析状态`（`lua/api/git.rs`）把
   `git status --porcelain=v1 -b` 那行 `##` 后面的东西**整段原样**当分支名用了。
   ⚠️ 这句**不是**本地化问题（实测 `LANG=zh_CN.UTF-8` 下 git 也照印英文），
   而是"**把一句给人看的话当数据**"——它随 git 版本会变。
   结构化的判据是现成的：`git symbolic-ref --short HEAD`（还没提交也答得出 `master`）
   与 `git rev-parse --verify -q HEAD`（退出码 1 = 还没有提交）。
2. 树上那一行里带 git 原始装饰 `HEAD -> master`（同一个根因：`%d` 的原文）。

两处都是"英文漏进中文界面"，**与 BUG-38 同一族，但 i18n 那一步收不了它们**：
2026-09-26 英文表铺满整个界面之后这两句仍在，因为它俩压根不是"缺一条译文"，
而是**把 git 的输出当数据**——把 `No commits yet on master` 抄进英文表也没用，
git 一升级那句就变。⚠️ 处置登记在 `docs/07` §3 末尾，属于插件那条线的活。

### 5.25 验标题徽标与「从磁盘重新加载」（2026-09-26，**已开窗点过、量过像素、读过落盘字节**）

验的是两件：① 用户要的**标题装订线里那颗 `H1`…`H6` 徽标**（原话「标题输入后，前面的半透明 “#”
改成 H 几的这样的小图标吧」）；② BUG-40（重载之后凭空「已修改」）的修法成没成。

**起实例：`/tmp/nota-97-启动.sh`**（**不进仓库**，与 §5.20~5.24 同一条规矩）。它是一条
`podman exec … tauri-dev bash -lc 'cd <仓库> && ./src-tauri/target/debug/nota <文档>'`，
隔离 `XDG_CONFIG_HOME` / `XDG_DATA_HOME` / `XDG_CACHE_HOME` 三个变量全传（§5.24 那条规矩的下一档）。

⚠️⚠️ **这一节要记的头等大事是"窗口根本不出现"那个坑**，本轮为它花了最久：

```text
症状   进程活着、WebKit 子进程在、`xdotool search --name "."` 只回一个根窗口
       ——没有任何 nota 窗口。日志（/tmp/nota-97.log）里一行错都没有。
判据   容器里 `XDG_RUNTIME_DIR=/run/user/1000` 是**宿主的**，里面**有** `wayland-0`。
       于是 GTK 走 Wayland、把窗口开到**用户真实的桌面会话**上去了。
修法   起实例时必须同时给 `GDK_BACKEND=x11` 与 `WAYLAND_DISPLAY=<一个不存在的名字>`
       （脚本里用的是 `nota-disable`）。只给 `DISPLAY` 不够。
```

⚠️ **这条不只是"看不到窗口"**：不挡的话窗口会出现在用户自己的屏幕上——本仓有多个会话在写、
用户也可能正在用机器，那是**往别人的桌面丢窗口**。起无头实例一律照上面的三件套给全。

📌 **另一条环境坑（本脚本第一版起不来）**：脚本里**别用中文变量名**。容器里跑它的那个 shell
把 `文档=/tmp/…` 这一行当成**要执行的命令**，报「没有那个文件或目录」——现象看着像路径写错，
其实是变量名不合法。本仓的注释与标识符用中文没问题，**shell 脚本里老老实实用 ASCII**。

**① 标题徽标**（夹具 `/tmp/nota-目检-夹具/en.md`：`# H-one` / `## H-two` / `### H-three` 三级
阶梯 ＋ 一张两列表）——点进正文，光标停在哪一级就画哪一级：

```text
点第一行（H-one）   → 装订线里一颗 `H1`   （截图 01b-H1放大.png）
Down ×1（H-two）    → 一颗 `H2`，`H1` 那颗当场消失（截图 02-Down一次.png）
Down ×1（H-three）  → 一颗 `H3`          （截图 03-H3.png）
```

⚠️ **判据是像素，不是"看着像"**。三帧各裁同一块装订线（`46×40+155+<y>`）之后
`magick -fuzz 3% -trim -format "%wx%h"`：

```text
shot0（H1）→ 19x15+27+9
shot1（H2）→ 19x15+27+7
shot2（H3）→ 19x15+27+4
```

**三档外接盒一模一样 `19×15`**——这正是"标记不跟着块字号跳"那条硬要求（`marks.css` 里
`font-size: calc(var(--ui-font-size) * 0.85)` 那一大段注释）的判据；只裁文字那 12×10 三帧也全同。
⚠️ **反证不能省**（§BUG-21 那条教训）：`shot1` 里光标在 `H-two` 上，**同一块位置**（H-one 那一行）
`-fuzz 3% -trim` 只剩 **1×1**、颜色标准差 **0**——证明"光标一走标记就没了"这件事**真的**发生了，
而不是那块位置压根没被拍到。

**② 重载（BUG-40）**——夹具 `/tmp/nota-目检-夹具/tbl.md`：

```text
夹具正文        | a | b |  /  |---|---|  /  | 1 | 2 |         md5 a5361180a6b1c278ae4150855b2851fb
点进正文 → File → Reload from Disk
重载之后        状态栏干净：`WYSIWYG 6 words 31 characters 5 lines`，**没有 Modified**
                （截图 12-重载后状态栏.png；对照组是重载之前的 10-重载前状态栏.png，同样干净）
                此刻磁盘**仍是一字不差**的 a5361180… —— 重载不写盘
再按 Ctrl+S    → md5 8ebf20a61b5fcb94dd23ea118c3635eb
                `od -c`：`|---|---|` 变成 `| - | - |`，**末尾多一个换行**
```

⚠️ **最后那一步是故意做的，别读成"重载把文件改了"**：它证明的是两件事——① **规范化真的存在**
（所以 `settle` 那条分支确实被走到了，不是"碰巧没差别"这条假绿）；② **"打开再存、字节变了"
是存量行为**（第 56 项那一族，表格列宽按内容重算 ＋ 尾空行），**与重载无关**。

⚠️ **本轮没验到的一格**（BUG-40 修法②）：那个"去抖窗口里判脏读到旧值"是**按代码推的**，
手工复现不出来——从聚焦正文到把 `File` 菜单点开，墙钟早过了 300 ms 去抖。要真验它得在一帧之内
完成"打字 ＋ 触发重载"，那是**改工装**的活，不是改应用的。

📌 **两条与上文验法不同的地方，记一笔免得后人按老脚本找**：本节全部动作都在**容器里**跑
（`/tmp/nota-97-启动.sh` 起实例、另一条 `podman exec` 送 `xdotool` 与 `import`，
截图再 `podman cp` 出来），不是 §5.23 那种"宿主直接跑二进制"的写法——两种都行，别混着抄。
⚠️ 宿主上**没有** `xdotool` / `import`（`xdotool: 未找到命令`），所以驱动那半必须走 `podman exec`。
⚠️ **这一轮还踩到一次旧坑**：新起的实例一度读了用户**真实**的 `~/.config/nota/settings.toml`
（症状是界面变英文 ＋ 分屏模式），因为前一次启动漏了隔离变量。**起 GUI 一律带隔离 `XDG_*`。**
⚠️ 同轮另记一条纪律事故：一次清理用了宽泛的 `pkill -f`，**把自己的 shell 杀了**（exit 144）——
容器与宿主共享 PID 命名空间，**只按明确 PID 杀**。

### 5.26 给每一档界面风格出一张截图（2026-09-26，**已开窗抓过 16 张**）

用户要求「每一个主题给我一个截图」。做法是**每档风格起一次实例、抓一张**——
不是为了好看，是"**风格是拿 CSS 变量乘出来的**"这件事只有把八档并排看才发现得了几处不对。

**驱动脚本：`/tmp/nota-主题截图.sh`**（同样**不进仓库**）。要点：

```sh
# ① 虚拟屏要起在**容器里**——宿主上根本没有 Xvfb（`Xvfb: 未找到命令`）
podman exec -d -u 1000 tauri-dev Xvfb :96 -screen 0 1400x900x24 -nolisten tcp

# ② 每档：先写隔离配置里的 settings.toml，再起实例
sed -e "s/STYLEID/$ID/" -e "s/MODEID/$MODE/" /tmp/nota-目检基线.toml > "$CFG/nota/settings.toml"
podman exec -d -u 1000 -w "$ROOT/src-tauri" -e "DISPLAY=$DISP" -e GDK_BACKEND=x11 \
    -e WEBKIT_DISABLE_COMPOSITING_MODE=1 -e "XDG_CONFIG_HOME=$CFG" -e "XDG_DATA_HOME=$DAT" \
    tauri-dev sh -c "echo \$\$ > $PIDF; exec ./target/debug/nota '$DOC'"
# ③ 抓图 + 裁到窗口（1100×760，无 WM 时窗口原点 = 据屏尺寸算出来的一个固定值）
podman exec -u 1000 -e "DISPLAY=$DISP" tauri-dev import -window root /tmp/shot.png
podman exec -u 1000 tauri-dev convert /tmp/shot.png -crop 1100x760+150+70 +repage /tmp/crop.png
podman cp tauri-dev:/tmp/crop.png ~/nota-主题-$ID-$MODE.png
```

四条硬要求，每一条都对应一次真实教训：

| 要求 | 为什么 |
|---|---|
| **`XDG_CONFIG_HOME` / `XDG_DATA_HOME` 必须隔离** | 容器把 `/home/lqy` 直接挂进去，不隔离就是在**改用户真实的 `settings.toml`**（§5.25 尾段那次事故同一个坑） |
| **只按 pidfile 里的号杀** | 共用 PID 命名空间；`pkill -x nota` 会把**别的会话**开的实例一起杀掉。让 `sh -c 'echo $$ > pidfile; exec nota'` 记下号，下一轮照号收 |
| **`toolbar = "always"`** | 默认是 `never`（工具栏平时不显示），不出图就看不出按钮那一族（`--btn-*`）长什么样 |
| **全程不放声音、不发任何按键** | 只开窗与抓图；用户家里有人在睡觉 |

⚠️ **窗口位置不能照抄**：`1400x900` 的屏上量到 `(150,70)`，屏更大时窗口跟着居中挪（§5.1）。
换屏尺寸就先用 `xdotool getwindowgeometry` 量一次再裁。

⚠️ **`import` 抓的是整张 root**：所以**一个屏只跑一个实例**（本轮用 `:96`，把 `:97`/`:98`/`:99` 留给别的会话）。

⚠️⚠️ **这一节真正的价值是"它抓出了一个 CSS 语法错"**：第一次抓图时画面里是
vite 的报错叠层（`theme.css:31:9: Unknown word`）——`theme.css` 拆四份时在文件头的
注释中间夹了一个 `*/`，第 31 行之后的注释没有起始符，**整份入口文件不生效**。
`doc-sync-check.sh` 全绿（它数行数、查登记，**不解析 CSS**），所以**"CSS 拆完要真的开一次窗"**
是本轮买来的规矩。事后补了一道机器判据：把 `src/styles/**/*.css` 全过一遍 postcss 解析。

### 5.27 验「主题色」（2026-09-26，**已开窗、量过像素、读过合成的颜色**）

「主题色」那条轴（`appearance.accent`，见 `docs/03` §5.2b）**代码里能测的部分很少**：
`tests/accent.test.ts` 盖的是纯逻辑（认不认得出、前景色给哪个），它**测不了**
`applyTheme` 有没有真把变量写上去、也测不了设置页有没有接上。**那两件事只有开窗看。**
判据不是"看着像"，是**量像素**。

**驱动脚本：`/tmp/nota-主题色截图.sh`**（不进仓库；同 §5.26 的四条硬要求——隔离 XDG、
只按 pidfile 杀、不放声音、一个屏一个实例）。配置基线是**跟着风格那一版**改的：
把 `accent = "…"` 插到 `[appearance]` 表里（下面那条坑就是踩出来的）。

#### 三个判据点，逐个说清看什么

| # | 看哪儿 | 怎么算"对" |
|---|---|---|
| ① | **菜单栏底下的工具栏**里那个按下去的按钮（`.format-btn[data-on="true"]`） | 它的 `background` / `border` 是 `var(--accent)`、`color` 是 `var(--accent-fg)`（`bars.css:63-64`）——**一个控件同时验两个变量**，是这个特性最省事的判据点 |
| ② | 状态栏左边那颗「严格」标记（`.status-strict`，`color: var(--accent)`） | 只有 `strict_markdown = true` 时才画。它验的是"强调色真的流到了别处"，不是孤例 |
| ③ | 设置对话框「外观」页那一格 | 取色框里是不是那个色；「跟随风格」按钮在 `accent === ""` 时是不是**灰的**；认不出的值时旁边有没有**红字** |

#### 像素怎么量（这一步是决定性的，别省）

```sh
# ① 同一个文档、同一档风格，只改 accent 两个值，抓两张
compare -metric AE 跟随风格.png 蓝.png null: 2>&1   # → 0
```

**`accent = ""` 与 `accent = "#3584e4"` 抓出来的两张图，像素差是 `0`。** 这就是
"跟随风格"的定义：把内联值摘掉之后，露出来的**正好**是该风格自带的那个出厂色，
不是"另一个碰巧接近的颜色"。换个方式说——**这一条同时验了 `removeProperty`
那半条路**（只写不摘的话这里必然不为 0）。

再换一个**差得远**的颜色（黄 `#ffd400`）抓一张，然后数色：

```sh
convert 黄.png -format %c histogram:info: | grep -i 'ffd400'   # → 601 像素
convert 黄.png -format %c histogram:info: | grep -i '3584e4'   # → 0
convert 跟随风格.png -format %c histogram:info: | grep -i '3584e4'  # → 581 像素
```

**`#3584e4` 一个不剩、`#ffd400` 出现 601 处**——强调色是**覆盖**不是**叠加**。

#### 前景色（`--accent-fg`）怎么验——量图标的描边

按钮上那颗图标是**描边图形**，颜色是 `currentColor`，所以它的采样值就是
`--accent-fg` 和底下填充色**混过**的结果。读出来对比：

| 强调色 | 图标描边采样值 | 说明 |
|---|---|---|
| 蓝 `#3584e4` / 跟随风格 | `srgb(229,240,252)` | 白字底，往 `#ffffff` 混 |
| 黄 `#ffd400` | `srgb(46,43,22)` | 近黑底（`#10131a`），往黑混 |

**一个亮一个暗，说明白/近黑那条翻档真的发生了**，不是所有颜色都配同一种字色。

#### 三条踩出来的坑

| 坑 | 症状 | 处置 |
|---|---|---|
| ⚠️⚠️ **改了 Rust 设置结构体却只跑了 `cargo test`、没跑 `cargo build`** | **整个窗口一片空白**（一张纯色 `#FAFAFB`），控制台**一个字都不报**。根因：前端是新的（读 `settings.appearance.accent`）、二进制是旧的（不发这个键）→ `parseAccent(undefined)` → `undefined.trim()` TypeError → **React 根本没挂上**。`cargo test` 不会重建 app 二进制 | **加字段之后先 `cargo build`**（28 秒）。这条差点让我去怀疑刚写的 CSS、怀疑另一个会话的改动、怀疑 PostCSS，全查了一圈才想到。**判据要前置**：抓完图先数颜色数（正常一千多种，空白图只有一两种），别等着看图 |
| ⚠️ **`accent = "…"` 追加到 `settings.toml` 末尾** | 值落在 `[general]` 表里（TOML 里"末尾"属于**最后一个**表头），等于没设；第二次改成"贴着末尾再加一行"又造出**重复键**，整个文件解析失败 | 用 `awk` **先删掉任何已有的 `accent` 行、再插在 `dark_document_theme` 后面**（那行在 `[appearance]` 里）。⚠️ 判据是"起得来 + 取色框里是这个色"，不是"文件里有这行字" |
| ⚠️ **把警告写在 `SettingRow` 的 `help=` 里** | 目检时那句「（认不出「red」，按跟随风格处理）」**一个字都看不见**——`help` 渲染成 hover 提示，不悬停就没有 | 改成行内的 `<span className="stg-warn">`（`settings.css`）。**用户看得见的警告必须内联**，这条与 §5.9 那批经验同源 |

#### ★ 顺带验掉的：内联强调色**打不打得过"用户导入的风格"**

这一条是**同批真跑过**的（`docs/08` §A 那条"导入的样式只管形状、颜色交给轴"的契约
不能只写在文档里）：造一份导入档 `~/.config/nota/ui-styles/zz-check.css`
（品红 `--accent: #c2185b` ＋ 大圆角 `--radius: 16px`），把 `ui_style` 指到 `zz-check`，
再分两次跑：

| `accent` 的值 | 画面里 `#C2185B` | `#FFD400` | `#FFF5FB`（导入档的 `--bg`） | 结论 |
|---|---|---|---|---|
| `"red"`（**认不出**） | **397 px** | 0 | 3629 px | 认不出 ⇒ 当"跟随风格" ⇒ 露出**导入档自带**的那个强调色；内置 adwaita 的 `#3584E4` **一处都没有**（0 px），说明整档风格确实换掉了 |
| `"#ffd400"` | **0** | **421 px** | 3629 px | 内联**打得过导入档**；而底色那 3629 px 一个没动 ⇒ **覆盖的只有强调色** |

⚠️ 两行合起来才是完整的判据：**第一行证"导入档生效了"**（否则 `#C2185B` 与 `#FFF5FB`
一个都不该出现），**第二行证"内联赢"**（否则 `#FFD400` 不该出现）。⚠️ 只做第二行会
分不清"覆盖成功了"和"导入档压根没加载"。留存的两张图在 `~/nota-导入档-跟随风格.png`
与 `~/nota-导入档-覆盖.png`。

⚠️ **驱动脚本也是"只按 pidfile 杀"的那一套**（同 §5.26 四条硬要求）；
⚠️ 那个 `zz-check.css` 夹具是**临时的**，验完连同隔离配置一起删掉即可——
**别把它写进任何文档当路径**（写成路径的话，下一次照做的人会找不到）。

### 5.28 验「强制专注」与它结束后的总结（2026-09-26 **四个判定点全过**；2026-09-27 **补总结框五条**）

强制专注（第 66 项，见 `docs/07` §1）是**核心功能**不是插件（用户原话：「注意啊，这不是插件。这是核心功能」），
而它的全部内容都在**插件碰不到的地方**：抢焦点、置顶窗、出声。所以 `focus/` 那 23 条用例
（`docs/07` §2 的 BUG-41 就是这一批）盖住的只是**账本算法**——
"`always_on_top` 真兑现了吗""红屏真的压在别的程序上面吗""点了按钮窗真的没了"，**只有开窗知道**。

#### 配置基线：把三个时长压到几秒就能看见

拿**隔离配置**（`XDG_CONFIG_HOME=/tmp/nota-目检-配置`，同 §5.27 那四条硬要求）改 `[focus]`：

```toml
[focus]
total_minutes = 3
alarm_minutes = 1        # 起始余额 1 分钟
gain_per_minute = 1.0
drain_per_minute = 60.0  # ⚠️ 这个数就是判据：走神 1 秒 ≈ 扣 1 秒额度，几秒就能看见归零
grace_seconds = 2
sound = false            # ⚠️ 见下面"没验成的两条"，测试期间一律不出声
introduced = true        # 跳过首次说明弹窗（第一次验它时要设 false）
```

⚠️ `drain_per_minute` 是**唯一**能让这件事在半分钟内跑完的旋钮：出厂值 `1.0` 意味着
走神要**整整一分钟**才扣掉一分钟额度，而"走神 60 秒"在目检里既慢又不好确认。
⚠️ 这是**改配置**不是改代码，所以这条目检路径**不受默认值影响**。

#### 四个判定点，逐个说清看什么

| # | 看哪儿 | 怎么算"对" |
|---|---|---|
| ① | **首次说明弹窗**（`introduced = false` 时） | 菜单「视图 → 强制专注」之后弹出来，讲清要哪三样系统能力（抢焦点 / 置顶窗 / 出声）以及**不读键盘、不截屏、不外传**；两个按钮是 `Cancel` 与 `I Understand — Start`。⚠️ 这一屏是**代价告知**，不是装饰——用户要的功能就是"抢走你此刻的焦点" |
| ② | **状态栏那一格余额表**（`FocusMeter`） | 专注中在**涨**：`Focus ▓ 1:06` 这种读数，与 `gain_per_minute = 1.0` 对得上。⚠️ 它**只在 `running` 时渲染**，没在跑就该**整格不在**，不是显一个 `0:00` |
| ③ | **警报窗** | 切走 2 秒（宽限）之后再等，一个**整块红屏 ＋ 大白字 ＋ `I'm Back`** 的窗出现在最上面，标题是 `Back to writing`。⚠️ `xprop -id <win>` 里要有 **`_NET_WM_STATE_FULLSCREEN`**——这是"抢焦点"那条路真的走了系统接口的证据 |
| ④ | **点 `I'm Back`** | 红屏**一拍（≤1 秒）之内消失**，主窗回来，余额**从 0 重新攒**（`0:02`）。⚠️ **这一条是修完 BUG-41 才过的**：修之前按钮变成「这就回去…」就永远停在那儿 |

#### 抢焦点怎么造：另起一个 GTK 窗（2026-09-27 换的）

真桌面上用户自己切窗口就完了；无头屏上**没有别的程序可切**，得自己造一个。
⚠️ **原来这一节写的是"再起一个 Nota 实例"，2026-09-27 换成了一个 20 行的 GTK 窗**：

```python
# /tmp/nota-警报窗-配置/抢焦点窗2.py
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk
w = Gtk.Window(title="StealFocus")
w.set_default_size(420, 200)
w.add(Gtk.Label(label="another program"))
w.show_all()
w.connect("destroy", Gtk.main_quit)
Gtk.main()
```

```sh
podman exec -u 1000 -e DISPLAY=:96 -e GDK_BACKEND=x11 \
  -e WAYLAND_DISPLAY=nonexistent-wayland -e GTK_IM_MODULE=gtk-im-context-simple \
  tauri-dev python3 /tmp/nota-警报窗-配置/抢焦点窗2.py &
xdotool search --name 'StealFocus'          # 拿窗 id
xdotool windowfocus <那个 id>                # 焦点从 Nota 上被抢走
```

⚠️ **为什么不再"再起一个 Nota"**：那会撞上**单实例机制**
（`src-tauri/src/single_instance.rs`，socket 落在 `data_dir()`）——第二份进程会
`std::process::exit(0)`，前台跑时表现为**"秒退、退出码 0"**，看着像崩溃；就算用
隔离 XDG 绕开，它也会把整套插件、文档、语言协商再拉一遍。**为了抢个焦点，代价大得
离谱**，一个 20 行的 GTK 窗干净得多。
⚠️ **`GDK_BACKEND=x11` 不能省**：这台机器上装了 Wayland，GTK 默认会去连
`WAYLAND_DISPLAY`，而我们跑在裸 Xvfb 上——不显式指 x11 的话窗**静默不出现**
（进程活着、`xdotool search` 找不到、日志里一个字都没有）。

#### ⚠️ 菜单很长，别按坐标点 —— 用键盘定位

⚠️ **本批实测踩到的**：「视图」菜单会长到**超出屏幕**（「强制专注」是**最后一项**，
打开菜单时它落在视口外、要滚动才看得见），于是"照着上一张截图的坐标点"会
**点在别的条目上**——而且**不会有任何报错**：菜单关掉、界面什么都没变。本批照坐标
点了**两次**才反应过来（第一次点空）。

```sh
xdotool mousemove <菜单栏那一项>; xdotool click 1   # 打开菜单
xdotool key End                                     # 跳到最后一项（= 强制专注）
xdotool key Return                                  # 触发
```

⚠️ 判据是**菜单里那一项左侧有没有 ✓**（它是 `checkable: true`）——它比"看屏幕上
多了什么"可靠得多，本批那两次点空全靠它才认出来。

#### ⚠️ 裸 Xvfb 上量不出来的那条（**如实记，留待真桌面**）

| 现象 | 为什么 | 谁去核 |
|---|---|---|
| `xprop` 里**只有 `_NET_WM_STATE_FULLSCREEN`，没有 `_NET_WM_STATE_ABOVE`** | ⑨ 置顶是**窗口管理器**的活儿，而裸 Xvfb **没有 WM**，`_NET_WM_STATE` 这些就没人替它兑现 | **用户在自己桌面上核**（代码里 `.always_on_top(true)` 是照 Tauri 的正常写法传的） |
| 窗出来是 **800×600 在 `0,0`**，不是全屏 | 同上：全屏也要 WM 配合（`1400x900` 的屏上它没铺满） | 同上。⚠️ 但**红屏确实盖在了主窗上面**，所以"看得见"这件事是验过的 |
| `xdotool getactivewindow` 直接失败：`windowmanager claims not to support _NET_ACTIVE_WINDOW` | 同上（没有 WM 就没有那套协议） | 不需要核——这是**目检工具**的限制，不是产品行为 |

#### 没验成的两条（别把它们写成"验过了"）

- ⚠️ **警报声音：零证据。** 测试期间用户要求不出声（家里有人睡），配置里 `sound = false`；
  且容器里**连 `aplay` / `canberra-gtk-play` 都没有**，兜底那条 `系统提示音()` 本来就是空的
  （日志里是 `GStreamer element autoaudiosink not found`）。所以"响不响、像不像警报"
  **这一段完全没验**——验过的只是"这几行代码在设置开着的时候会被调到"。
  ⚠️ **主路径是前端合成**（`nota:focus-beep` → `ui/useFocusAlarmSound.ts`），宿主那条只是兜底。
- ⚠️ **置顶（`always_on_top`）**：见上表，裸 Xvfb 无 WM 无法兑现。

#### 总结框怎么验（2026-09-27 加，**用户点名**）

强制专注**结束后**那份报告（`ui/FocusSummaryDialog.tsx`，用户原话「做一下专注模式
结束后的总结功能就是将这一次专注模式的情况显示出来，并且像心电图那样也支持导出」）。
流程：① 起一轮 → ② **等 ≥ 5 秒**（`最短总结秒`，比它短**故意不弹**——判据在
`ui/focus-summary.ts` 文件头） → ③ 再点一次「视图 → 强制专注」（✓ 消失） → ④ 框自己弹出来。

| # | 看哪儿 | 怎么算"对" |
|---|---|---|
| ① | 框本身 | 标题「这一轮专注结束了」；左边**五格**（本轮时长 / 专注 / 离开 / 警报 / 专注占比）；右边一张分享卡预览；底下三颗按钮（保存分享图 / 复制分享图 / 知道了） |
| ② | 五个读数 | 与配置对得上。⚠️ **本批实测那一轮是 55 秒**（`total_minutes = 3`、`gain_per_minute = 1.0`、窗口全程有焦点）⇒ 专注 `0:55`、离开 `0:00`、警报 `0`、专注占比 `100%` |
| ③ | 卡片预览 | 大字是**专注时长**（不是总时长）；三格是 `本轮时长` / `专注占比` / `警报次数`；右上时刻是**这一轮结束**那一刻（不是"现在"——所以框开着放十分钟，卡上的时间不会跟着走） |
| ④ | 「复制分享图」 | 框里出现**「已复制到剪贴板」**。⚠️ **这一条是"导出那一半通了"的判据**：它证明 canvas 光栅化真的跑完并拿到了位图，不只是画了个预览 |
| ⑤ | 「保存分享图」 | 弹出 **GTK 另存为**窗，默认文件名 `nota-focus-YYYYMMDD-HHMM.png`。⚠️ **默认目录是进程的 cwd**——本批跑在仓库根，所以它默认落在**仓库里**；验收时**别手滑回车**，会往仓库里写图 |

⚠️ **本批没验到的一格（如实记）**：那个另存为对话框**没走完**——`xdotool type` 在这台
机器上打出来的是乱码（键盘映射被输入法那一套装上了，实测输入
`/tmp/nota-focus-check.png` 出来的是十几个不相干的中文），所以**"真存下去那张 PNG
长什么样"没有留档**。有证据的是另外两半：**卡片渲染**（`/tmp/nota-总结预览.ts` 用
`rsvg-convert` 出了中／英、浅／深三张，与框里 `<img>` 走的是同一个 `分享图SVG`）
与**光栅化 ＋ 剪贴板**（上面第 ④ 条）。要补齐就照本节重跑一遍、用鼠标点着改名。
⚠️ **修后复验的那一格**：BUG-45（主页不画余额）修完之后要重看一眼——**没打开文档时
开着专注，状态栏右边该有 `Focus ▓`**。这一格在改动前是空的，是本批目检时撞出来的。

#### 收尾

⚠️ **只按 pidfile 杀**（同 §5.26/§5.27 三条硬要求）：这个容器**共用宿主 PID 命名空间**，
`pkill -f nota` 会顺手打死别的会话的实例（`:97` / `:98` / `:99` 上常常还有别人的）；
**永远不要** `pkill -x nota`，也不要碰 `fcitx5`。
⚠️ 隔离配置目录 `/tmp/nota-目检-配置` 是**共用约定名**（本文 §5.27 与别处都用它），
别的会话可能也在用，删之前先看一眼谁在上面跑。
⚠️ **本次那几张图是临时的**（抓在 `/tmp/目检-图/` 里、看完即删，**没留进 `~`**）——
留存的两张只有写作统计的 `~/nota-心电图-目检-1.png` / `-2.png`（§5.29）。
所以上面这些读数是**当时眼看的**，不是可复算的像素差；**要复算请照着本节重跑一遍**。

### 5.29 验「写作统计」（2026-09-26，**已开窗、两帧对过数**）

写作统计（第 65 项，见 `docs/07` §1）**是个插件**——用户特意点过名：
「注意心电图，那是个插件哦」。所以它有一半在**宿主**、一半在**插件**：

| 哪一半 | 落在哪 | 干什么 |
|---|---|---|
| 插件那半 | `plugins/stats/` | 攒每分钟字数、画 s-t 曲线、排版 |
| 宿主那半 | `src-tauri/src/heartbeat.rs` | ⚠️ **面板声明了 `live` 就每秒重拉一次内容**——这一条是"实时"的全部机制 |

⚠️ **验它的难点不在画面，在"有没有数"**：空白文档进去，大红字是 `0`，曲线是平的——
**看着像坏的，其实是没打字**。所以要先造字，而且要造得**前后不一样**，否则两帧一样也说明不了什么。

#### 跑法：一个屏、一个实例、隔一段时间抓两帧

同 §5.28 的四条硬要求（隔离 XDG / 显式 `DISPLAY=:97` ＋ `GDK_BACKEND=x11` /
`WAYLAND_DISPLAY=nota-disable` / 只按 pidfile 杀）。然后：

```sh
# ① 起实例（打开一份非空文档），把右栏切到「写作统计」页签
# ② 隔 15 秒抓第一帧
DISPLAY=:97 import -window root /tmp/帧1.png
# ③ 用 xdotool 往编辑器里打一段字（十几秒，字数要跟前面那一段明显不同）
# ④ 再抓一帧
DISPLAY=:97 import -window root /tmp/帧2.png
```

#### 判据：**四个数一起动**才算"实时"

两张留存的图在 **`~/nota-心电图-目检-1.png`** 与 **`~/nota-心电图-目检-2.png`**：

| 读数 | 帧 1 | 帧 2 | 说明 |
|---|---|---|---|
| 大红字（字/分钟） | **275** | **342** | 它算的是**滑动窗口**里的速率，所以打了字就该抬起来——⚠️ 光看一帧**证明不了它在动** |
| 曲线峰数 | **8** | **11** | s-t 图真的在**接着画**，不是一张画好就不动的静态图 |
| `Watched for` | 21s | 37s | 面板自己的计时在走 ⇒ **宿主每秒重拉那一句真的在跑** |
| `Whole document` | **116** | **231** | ⚠️ 这一条最要紧：它跟**状态栏那个字数**同一个口径（`docs/04` 状态栏那一行）——数不一致就说明插件自己另算了一套，那种错**不会报错，只会悄悄多一个字或少一个字** |

⚠️ **四个数里只要有一个不动，就说明"实时"那半截断了**，而不是"打字不够"——先去看
`heartbeat.rs` 那一秒一次的重拉有没有被真的调到（面板 `plugin.toml` 里有没有 `live`）。
⚠️ **别只看第一帧就下结论**：一帧只能证明"面板画出来了"，**证明不了它是活的**。

## 6. 测试清单

```sh
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test
```

⚠️ **`-u 1000` 不能省**（也建议显式带 `-e HOME=/home/lqy`）。`podman exec` 默认是
**root、`HOME=/root`**，而以 root 跑一次测试会让下一次以 1000 跑的同一批用例**永久失败**：

```
lua::api::settings::tests::写下去的值读得回来
lua::api::settings::tests::坏文件当空的用而不是报错
lua::api::settings::tests::文件头那段注释不影响读
lua::api::settings::tests::设置文件是_0600
lua::api::tests::每一条_ui_能力都能单独装出_nota_ui
lua::api::tests::没申请_ui_能力就不装_nota_ui
  called `Result::unwrap()` on an `Err` value:
  Write { path: "/tmp/nota-settings-test-roundtrip/t.toml",
          source: Os { code: 13, kind: PermissionDenied } }
test result: FAILED. 220 passed; 6 failed
```
⚠️ **是 6 条，不是两条。** 这条笔记最早只记了当时看见的那两条；2026-09-25 又踩一次才发现凡是拿**写死的目录名**当临时目录的用例**全都会红**——`lua/api/settings.rs` 四条、`lua/api/mod.rs` 两条。判据仍是路径，不是数量。

根因不在代码：这几条用例的临时目录名是**写死的**（`/tmp/nota-settings-test-<名>`、
`/tmp/nota-api-test-<名>`），开头那步 `remove_dir_all` + `create_dir_all` 是为了
"上一次跑剩的"而写的——**但删不掉 root 建的目录**，于是 `create_dir_all` 撞在
一个还在的 root 目录上。⚠️ **症状和"代码坏了"一模一样**（`PermissionDenied`、
两条用例、报在 `.unwrap()`），但代码本身没有问题。修法是清掉那几个目录：

```sh
podman exec -u 0 tauri-dev sh -c \
  'rm -rf /tmp/nota-settings-test-* /tmp/nota-api-test-* /tmp/nota-proc-test-*'
```

📌 **一眼分辨**：报错路径里出现 `/tmp/nota-(settings|api|proc)-test-`，就是这条；
真的代码缺陷不会有这种路径。⚠️ 顺带一句：**跑测试用 `-u 1000` 不只是「别弄脏 /tmp」**，
它还是「同一批用例明天还能跑」的前提。

**当前 505 条，全过**（2026-09-27 现跑，`cargo test --lib` 报 `505 passed; 0 failed`，
`grep -r '#\[test\]' src-tauri/src --include=*.rs | wc -l` 也是 505 —— **两半互证**）。⚠️ 这个数是
**只算 Rust 那一半**——前端另有 **566** 条（二十二份）、跑法完全不同，见 §6.3。⚠️ **它一天里涨了
五次**：317 → 397（09-26 晚，80 条里只有 4 条是「主题色」那批的）→ 428（09-27
白天，其中 6 条是「英文按词统计」那批）→ **490**（文件移动那批 19 条 ＋ 同时段别的会话 ~43 条）
→ **492**（同时段别的会话，不是那批加的）→ **501** → **505**。
⚠️ **501 里那 9 条是两批**：**5 条是「快捷键」那批的**（`settings/keys.rs` 那五条：
只存差量的形状、空串与"不在表里"是两件事、`[keys.overrides]` 写的是一层套一层、
老设置文件没有这一节也能读、改过的键位能存能读）；**另外 4 条是「启动三档」那批的**
（`settings/files.rs` 的 `老取值_folder_还能读成第三档` ＋ `session.rs` 的三条工作区用例。
⚠️ 启动三档**不是只加 Rust 用例**——它的主战场是前端的 `useStartup.ts` 与设置页，见 §5.34）。
⚠️ **最后那 4 条（501 → 505）是同一天晚些时候的「标签页右键 → 在新窗口中打开」那批**，
**全在 `cli.rs`（12 → 16）**：新窗口选项认得出来（位置不拘）／程序自己的路径不算选项
（**零号参数不算**）／普通启动不是新窗口（`--new-windowish` 不算，要**整串**相等）／
新窗口选项不妨碍挑出要打开的文件。⚠️ **带用例的文件数没变**（还是 59 个），
因为加的是已有文件里的用例。
⚠️ 同一个仓库同一目录可能有多个会话在改，这条数一律以现跑为准，别照抄任何一处文档上的数。

📌 **逐文件明细在 `docs/02-modules.md` 的「测试现状」表里**（那张表的数比这里慢——
它是另一个会话在**别的时刻**排的，**以现跑为准**）。
本文只记**总数 + 增量来源**；两份对不上时，**以现跑的两个数为准**。

**最近一笔增量是 +29（上传图片那批，2026-09-26 第二批）**：

| 来源 | 条 |
|---|---|
| `upload/tests.rs`（新文件：算式 / 请求头 / 多部件体 / 从响应取地址 / 前件 / 0600 权限 / 不预设服务商） | +28 |
| `image/tests.rs` 25 → 26 | +1 |

⚠️ **同一批的另外 1 条不在这儿**：同一天早些时候拆「两个兜底」那批让 `lang.rs` 7 → 8
（新用例 `两个兜底不是同一个值`，⚠️ **2026-09-26 下午改名成 `两个兜底是两个概念_今天恰好同值`**），
**当时漏记在这份增量表里**，现在补上——所以 278 → 308 是这两批合起来的结果（+29 ＋ 1）。
⚠️ **改名那次顺带要说清的一件事：那条用例不能顺手删掉。** 它原来是
`assert_ne!(应用兜底, 插件兜底)`，加上去就是为了钉住"两个兜底**没被合并成一个常量**"；
同一天下午 `应用兜底` 按它自己注释里写下的条件翻回 `en`（与 `插件兜底` 同值），
`assert_ne!` 当场变红。**红的原因是值变了，不是那个概念不用管了**，所以改成
`assert_eq!` 两个值各钉一条：`插件兜底` 钉死 `en`（用户点名要的，不能改），
`应用兜底` 钉住"今天是 `en`"并写明**它凭什么可以再改**（跟着前端那张英文表的覆盖面走）。

⚠️ **这一批的用例与 `image` 那批同一个道理，但多了一条**：`upload` 那一块算错了同样
"不会崩、只会写出用户没要的字节"，而且它**会真的把字节发出去**（不可逆）。所以除了
纯函数那些，还有一条 `不预设任何服务商` 钉着"这一支里不许出现 smms / picgo / imgur
那种名字"，和一条 `设置文件是_0600` 钉权限。⚠️ 真发请求的那几条**没有引任何 HTTP
测试依赖**：它们用 `std::net::TcpListener` 手写一个假图床（读请求、抄一行回来）。
⚠️ `net.rs` 里的错误文案有一条硬规矩——**只带地址与服务端的回话，绝不拼请求头**
（拼了就会把用户的令牌印在提示条、日志、以及他贴给别人看的截图里）。

**再往前一笔增量是 +31（插图那批，2026-09-26）**：

| 来源 | 条 |
|---|---|
| `image/tests.rs`（新文件，`image.rs` 拆出来的那半边） | +25 |
| `commands/image.rs`（新文件，命令层：三种来源形状、剪贴板必落盘、字段名写死英文） | +4 |
| `settings/image.rs` 2 → 4（五档插入动作的写法、老设置的 `none` / `copy-to-assets` 仍然认得） | +2 |

⚠️ **这一批的用例密度是有意的**：`image.rs` 那一块全是**算得出来、但算错了不会报错**的东西
（一条地址写成 `assets/x.png` 还是 `./assets/x.png`、名字撞了加 `-1`、同内容的文件复不复用、
`%20` 会不会被转成 `%2520`）。**它们不会让应用崩，只会写出用户没要的字节**——
那种错在界面上看不出，只能靠用例钉。⚠️ 也正因为这样，**这些用例全是纯函数的**：
网络那一支是**注进去的**（`落地(&计划, …, &取网络)`），所以整个 `image` 模块
**没有一条用例会真的联网**。

**再往前一笔增量是 +3**（同日稍后，`plugin/package.rs` 11 → 14）：

| 来源 | 条 |
|---|---|
| 日期那一栏：`天数换成公历日期`（纪元零点 / 负数 / 世纪闰 / 普通年四个点）、`今天长得像个日期`（只钉形状——钉具体哪一天的话明天就红）、`记下的钥匙带日期` | +3 |

⚠️ 这三条是从「验装卸那一条链」里长出来的（见 §5.16 ⑤①）。**日期换算那条值得自己写用例**：`div_euclid` / `rem_euclid` 在负数上的行为是这段算术最容易栽的地方，而它只在 1970 年以前才露馅——那种日期我们永远不会真去算，所以只能靠用例钉。

**再往前的增量是 +24（插件装卸/签名那一批）**：

| 来源 | 条 |
|---|---|
| `plugin/package.rs`：解包 / 摘要 / 验签 / 上限 / 信任库。**这些用例此前从未编译过**（见下） | +11 |
| `plugin/installed.rs`：账本读写、两档默认值、指纹 | +8 |
| `plugin/install.rs`：`把包写进` / `搬进落点`（含回滚） | +4 |
| `plugin/manifest.rs`：5 → 6 | +1 |

⚠️ **"grep 数与 cargo 数相等"这条判据今天恢复了，但它 2026-09-25 白天假过一次**：
`plugin/package.rs` 与 `plugin/installed.rs` 当时写好了却**没有在 `plugin/mod.rs`
里声明 `mod`**，于是
`grep -r '#\[test\]' src-tauri/src --include=*.rs | wc -l` 数得到而
`cargo test` 跑不到，两个数差 18。那一批补上 `mod package; mod installed; mod install;`
之后差额归零（那天两个数都是 226）。⚠️ **2026-09-26 复跑：两个数都是 308**——
⚠️ 下面这一段记的是那天**前一批**（i18n ＋ Slidev 拆插件）对两个数做的事，
**插图那批的 +31 记在上面**；两批合起来才是 247 → 278。那一批做的是：
**减** `slidev.rs` 9 ＋ `slidev_probe.rs` 10（那两个文件整个删了）、
**加** `devserver.rs` 12 ＋ `lua/api/unified_diff.rs` 10 ＋ `lang.rs` 7 ＋
`lua/api/i18n.rs` 6 ＋ `lua/api/devserver.rs` 3，另加 `paths.rs` 与
`settings/general.rs` 各一条（逐文件表在 `docs/02` 的「测试现状」）。
📌 **以后再出现差额，先去看 `plugin/mod.rs` 的 `mod` 声明齐不齐**——那正是当初的病灶。
📌 一句话：**"写了但不跑"的用例比没有用例更坏**，它会让人以为那一块是被测过的。

**再往前的增量**（留着是为了记住"同一个数要抄几处"这个病）：

- **168 → 199**：`pandoc::tests` 18 ＋ `commands::pandoc::tests` 4 ＋ `pandoc_format::tests` 1
  ＋ `proc::tests` 9（从 `slidev.rs` 拆出来时带走的，那边 10 → 9）
  —— ⚠️ 这段差额的账当时**没有算平**（记的 199 与逐项相加差 8 条），
  **别拿它当依据**：以逐文件表为准。
- **157 → 168**：把每个文件的 `#[test]` 数与 `cargo test --lib -- --list` 逐个对过，
  五处对不上——`settings/appearance.rs` 3 → **5**、`settings/mod.rs` 8 → **10**、
  `commands/workspace.rs` 3 → **4**，外加 `cli.rs`（**4**）与 `error.rs`（**2**）**整行没登记**。
- 更早：**设置模块按界面上的页拆成八个文件**后那一族从 5 条长到 **32** 条；
  **AI 改动块**带来 `lua::api::diff::tests` 13 条（见 §5.13）；
  **插件落地**带来 31 条（`lua::api::ui::tests` 6 → 18、新增 `lua::api::http::tests` 9、
  新增 `lua::api::settings::tests` 7、`lua::tests` 4 → 5、新增 `paths::tests` 2）；
  再往前是 **physics 默认值** 1 条、`slidev_probe` 10 条、导出/打印 5 条、严格模式 3 条。

另有**两个 test target 是 0 条**：
`src/main.rs`（只是个壳）与 Doc-tests（`nota_lib` 没有文档测试）。
`tests/` 目录下**没有一个 Rust 集成测试**（`tests/fixtures/` 仍然是空的），
所以下面这 505 条**全部是单元测试**。
⚠️ **2026-09-26 起前端有可运行的测试了**：`tests/` 下 **二十二份、共 566 条**
（2026-09-27 数，逐份跑出来过，清单与跑法见 **§6.3**）＋ `tests/fake-dom.ts`
（只够跑逻辑的假 DOM）。它**不在这 505 条里**（那是 `cargo test` 的数），也不是
"前端有测试框架了"——`package.json` 里**仍然没有**测试框架、也没有测试脚本，
跑法是 `npx esbuild` ＋ `node` 两条命令（**§6.3**）。

> ⚠️ 记数只在本文记（Rust 505 ／ 前端 566）。别处提到测试数一律写"见 `docs/06`"。
> 核实：`podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test --lib`。

### 6.1 逐条

**`settings::tests`（10）—— 四条外观轴怎么落盘，加 physics 的默认值，加"七页不许漏"，加坏文件的备份**

| 测试 | 钉住什么 |
|---|---|
| `默认设置能往返序列化` | `Settings` 存了再读要一模一样。同时钉住 `content_width` 的默认值是 **760** |
| `文件不存在时回默认而不是报错` | 首次启动没有 `settings.toml` 是正常状态。⚠️ 与"文件存在但解析不了要报错"是**两回事**——后者静默回默认会让人以为设置被吞了 |
| `设置文件不存在时给默认值且不留备份` | 上面那条的**下半句**：文件不存在时**不许**留下 `settings.toml.bak`——什么都没读到，没什么可备份 |
| `读不懂的设置会先留一份备份` | ⚠️ **BUG-23 的回归锁**：解析失败时原文件要先拷成 `settings.toml.bak`（**逐字节一致**），并且错误文案里要说清副本在哪。不留的话，用户第一次动设置就把它整份覆盖掉——"我的设置自己变回默认了，还回不去" |
| `枚举落盘用_kebab_风格` | **存法即接口**：存的是 `ui_style = "macos"`，不是 `"Macos"`。改 `serde` 属性会打破所有已存的设置文件 |
| `编辑模式也走_kebab_而且默认是所见即所得` | ⚠️ 这条盯着两处**改了不会编译错、只会静默变行为**的地方：落盘名是 `view_mode = "split"` 这种形状；以及 `ViewMode` 的默认值**如实是 `wysiwyg`**——默认值错了的症状是「老用户升级后打开文件发现进了源码模式」，而他的设置文件里根本没有这一项 |
| `physics_默认是关的且能往返` | ⚠️ 钉的是**默认关**这一个事实（它会重定义 `\div` `\Re` `\Im`，见 `docs/10` §11.1）。默认值写错两边的症状都是静默的：开着的默认会让"没开过这个开关的用户"遇到公式变形，而**宏表本身在前端**，后端一条断言都拦不住它 |
| `七页设置能整份往返` | **每一项**都改成非默认的值再往返。⚠️ 只改一个字段的测试会漏掉"某张表压根没被序列化"这种错——七张表里漏掉一张，症状是那一页的设置每次重启都回默认 |
| `标量写在表前面否则_toml_会拒收` | ⚠️⚠️ **结构体字段顺序的守门员**。TOML 要求"标量在前、表在后"；七张表哪天被挪到 `ui_style` 前面，`save()` 会在**写盘那一刻**报 `values must be emitted before tables`，而 `load()` 照样能读——那是一个只在保存路径上炸的缺陷。让它在这里炸 |
| `老设置文件里没有那七张表时全是默认值` | ⚠️⚠️ **整个拆分里最重要的一条**：用户在 `~/.config/nota/settings.toml` 里存的是 2026-09-24 之前的形状（只有那十个顶层键），新版本读它时那十条必须**原样认出来**、七张新表取默认——而不是"解析失败 → 回默认 → 用户的偏好没了" |

**`settings/` 那七个页文件（22）—— 拆开之后各页自己的落盘规矩**

⚠️ 这张表**只给用例名，逐条解说尚未补**。用例名本身写得足够具体，要动某一块时按名字读源码即可。

| 文件 | 条 | 用例 |
|---|---|---|
| `settings/appearance.rs` | **9** | `缩放默认一百而不是零` · `字号只有一份而这个布尔只是算不算数` · `工具栏默认不显示是故意的`（⚠️ 默认是 `ToolbarMode::Never`，与直觉相反——理由写在那个枚举上） · `工具栏三档在设置文件里是这三个词`（`always` / `hover` / `never`） · `老设置文件里的那个布尔被忽略而不是报错`（老的 `show_toolbar = true` 不报错、也不猜） · **`主题色默认跟随风格`** · **`主题色原样存取不改写`** · **`主题色写着一个认不出来的值也不许把设置读死`** · **`老设置文件里没有主题色那一格也能读`**（2026-09-26 「主题色」那一批加的 4 条。⚠️ 四条钉的都是「读得回来 / 读不死」，它们**测不了**这个颜色有没有被画到界面上——那件事只有开窗，见 §5.27） |
| `settings/editor.rs` | 3 | `两个缩进不是同一个东西` · `默认换行符是_lf_且落盘是_kebab` · `缺项的_editor_表能补出默认` |
| `settings/export.rs` | 2 | `空串就是自动` · `没有_pandoc_这一项` |
| `settings/files.rs` | 3 | `枚举落盘是_kebab_而且符号类取值不用裸符号` · `默认值符合预期` · `老设置文件里没有_files_表时能补出默认` |
| `settings/general.rs` | 3 | `通用里没有遥测也没有服务器` · `调试模式默认关` · `语言默认跟系统走` |
| `settings/image.rs` | 4 | `插图默认不动磁盘` · `五个插入动作的写法是老设置也认得的那一套` · `老设置文件里没有的项补默认` · `图片设置里不许出现上传与密钥` |
| `settings/markdown.rs` | 5 | `符号类取值落盘用名字而不是裸符号` · `智能标点默认是输入时转换并且能三档往返` · `两个缩进值得分开且默认不同` · `默认值逐项符合预期` · `缺项的_markdown_表能补出默认` |

⚠️ 其中三条是**边界表的代码锚点**（`没有_pandoc_这一项` · `图片设置里不许出现上传与密钥` ·
`通用里没有遥测也没有服务器`）：它们盯的是"这件事 Nota 不做"那句话。⚠️ **删掉用例等于把那条
边界交回给注释**——§11.2 那张表里每一条不做的事，都该有这样一个地方钉着。

⚠️ **但那三句话各自的含义要跟着口径走**（2026-09-25 改过一条）：`没有_pandoc_这一项` 现在
盯的是**不存路径**（存下来的会过期，每次现探），**不是**"不许提 Pandoc 这个词"——七种格式
2026-09-25 起真的借系统里那个 pandoc 转，`docs/10` §11.2 那条「不做 Pandoc」是**窄的**
（内嵌 / 下载 / 替用户装不做）。用例自己的注释里写着这条。

**`plugin::manifest::tests`（5）—— 清单的校验规则**

| 测试 | 钉住什么 |
|---|---|
| `好清单能解析出能力` | 正常路径；同时钉住 `entry` 的**默认值**是 `main.lua` |
| `通道名里的点要换成连字符` | `channel_id("nota.git") == "nota-git"`，`"a_b-c"` 原样不动（**别把 `_` 也换掉**），且归一结果一定只含 `[A-Za-z0-9_-]`。这是 BUG-3 的回归锁 |
| `api_版本不符要拒载` | `api = 99` 必须给出 `PluginApiMismatch { wanted: 99, have: 1 }`。⚠️ **精确匹配不是 `>=`**，理由见 `docs/11` |
| `entry_不许逃出插件目录` | `entry = "../../evil.lua"` 要拒。清单是插件自带的，这是**门口**那道 |
| `不认识的能力要报错而不是静默忽略` | `capabilities = ["fs.everything"]` 要报错且错误里**带上那个名字**。静默忽略会变成"作者以为申请到了、实际没有" |

**`lua::api::tests`（4）—— `nota.ui` 这张表装不装（BUG-8 的回归锁）**

⚠️ 这四条是**为一处真缺陷**加的。`build()` 要真的 `AppHandle`，构造不出来，
所以按 `AGENTS.md` §4 的口径把判据剥成了纯函数 `装_ui吗()`，再钉住它。

| 测试 | 钉住什么 |
|---|---|
| `每一条_ui_能力都能单独装出_nota_ui` | **BUG-8 的回归锁**：遍历 `UI能力`，每条单独申请都要能装出 `nota.ui`。曾经判据漏了 `ui.menu`，只申请它的插件拿到 `nil`，`register_menu` 直接 `attempt to index a nil value` |
| `没申请_ui_能力就不装_nota_ui` | 反向：没申请任何 `ui.*` 就是 `nil`——"按能力装表、不装空壳"这条不能松 |
| `ui_能力清单要和_ui_rs_对得上` | ⚠️ **两处判据是相乘的**：`ui.rs` 里每个函数判一次"表里有没有它"，`api/mod.rs` 里判一次"表本身在不在"。这条用 `include_str!("ui.rs")` 数 `ui.rs` 里 `manifest.has(Capability::Ui…)` 的处数，与 `UI能力` 数组的长度比对——**谁加第四个 `ui.*` 判据就会红**，红的信息会指出该往哪儿补 |
| `能力的_serde_名字与_parse_说同一套话` | `#[serde(rename)]` 与 `Capability::parse()` 是**各写各的**两套名字，任一处改了另一处没改，插件清单就会"写得进、读不出"。这条把三条 `ui.*` 能力逐个往返一遍 |

**`lua::tests`（5）—— 沙箱里到底有什么（BUG-10 的回归锁）+ 内置插件编不编得过**

⚠️ 前四条是**为一处真缺陷**加的，而且是本轮**最严重**的一条：第一道闸曾经是假的。
所以这里既有"结果"的用例，也有"输入"的用例，还有一条**专门记录 mlua 事实**的用例。
第五条是插件落地那一轮补的，钉的是**Nota 自己的产物**，见下。

| 测试 | 钉住什么 |
|---|---|
| `沙箱里不该有的全局一个都不能有` | **BUG-10 的回归锁**：遍历 `必须为空的全局`（`io`/`os`/`package`/`require`/`dofile`/`loadfile`/`debug`），每个都必须是 `nil`。**谁把 `硬化的_lua()` 换回 `Lua::new()`，这条立刻红** |
| `mlua_的_default_safe_含_io_和_os` | ⚠️ **这条是"事实记录"，不是"要求"**：断言的是 `Lua::new()` 里 `io`/`os`/`package`/`require` **确实存在**、只有 `debug` 不在。哪天 mlua 收紧了默认值它会红——**红了别急着删**，那说明本文件顶上那段的前提没了，要重新判一次 `硬化的_lua()` 该怎么写 |
| `白名单里不许有_io_os_package_debug` | 钉**输入**：`插件标准库()` 不含那四个，但含 `coroutine`/`table`/`string`/`math`（后者是防止哪天被一并删掉）。结果错可能是白名单开宽了，也可能是 base 库连带进来的——**两处都可能出错，所以两边都钉** |
| `插件跑不了_os_execute` | **端到端那一下**：在硬化过的 `Lua` 里跑 `os.execute("touch …")` 必须报"`os` 是 `nil`"，且**事后确认文件没被建出来**。只断言 `is_nil()` 也够，但这条更接近插件作者的真实动作，失败时的报错也更好懂 |
| `内置插件都能被_lua_编译` | ⚠️ **钉的是"Nota 自己的产物"**：`plugins/` 里的 Lua **只有应用启动那一刻才会被编译**，单元测试从来没碰过它们。所以那里写错一个字母，代价是"用户一开应用发现插件没了"，而提交前看不到任何红。⚠️ 同时把一条 Lua 的语言事实变成断言：**标识符不能写中文**（`local 键 = 1` 是**语法错**，不是"能跑但取不到"；注释和字符串里的中文不受影响）。这条就是替 Lua 把这句话说清楚——它自己报的是 `'<name>' expected near '<\233>'`，看到那句很难想到"这里用了中文变量名" |

> 📌 **为什么值得为一条 bug 加四条用例**（前四条是 BUG-10 的，第五条是插件那一轮另加的）：
> 这个洞的形态是"**信任了一个库的安全标签**"，
> 而这类错误**不会被编译器、也不会被别的用例抓到**——`Lua::new()` 编得过、跑得通、
> 插件行为看起来正常。唯一的防线就是有人明确写下"`io` 必须不存在"并让它可执行。
> `mlua_的_default_safe_含_io_和_os` 那条看起来尤其反常（它在断言一个**坏的**事实），
> 但它的价值正在于此：**把"库的 safe 不等于安全"这件事变成一条会红的断言。**
>
> 📌 **`内置插件都能被_lua_编译` 属于同一类**：`plugins/` 是两个
> 真的 Lua 文件，而它们的生命周期里**没有编译期**——检查只发生在应用启动那一刻。
> 所以这条用例是给它们补一个"编译期"。

**`lua::api::fs::tests`（5）—— 工作区围栏（本仓最早的那道安全边界）**

| 测试 | 钉住什么 |
|---|---|
| `普通相对路径能过` | 基本路径解析 |
| `点开头的清除掉但不越界` | `./子目录/./a.md` 规范化成 `子目录/a.md` |
| `绝对路径直接拒` | `/etc/passwd` 一律拒——允许了就等于允许写 `/etc` |
| `用点点爬出去要拒` | ⚠️ **围栏的正题**：拒的是"写一个**还不存在**的文件"，那条路走不了 `canonicalize`。同时钉住"在里面绕一圈是合法的"（`子目录/../里面.md` 要过）——**围栏误伤的代价是插件在合法路径上失败** |
| `符号链接指向外面要拒` | 建一个指向工作区外的软链再试。造不出软链（平台不支持）就跳过 |

**`lua::api::git::tests`（6）—— 两条围栏 + 工作目录裁决**

| 测试 | 钉住什么 |
|---|---|
| `重定向目标目录的参数要拒` | `-C` 要拒。只锁 cwd 不够，`git -C /elsewhere` 一句话就绕过去了 |
| `等号写法的重定向同样要拒` | `--git-dir=/x` / `--work-tree=/x` 也要拒（`split_once('=')` 那半） |
| `普通参数不该被围栏误伤` | `git status --porcelain=v1` 不能被拦。⚠️ 这里 `git` 自己失败没关系，**这条只确认围栏没拦** |
| `开了工作区就用工作区` | 工作区优先于文档所在目录 |
| `没工作区就退到文档所在目录` | 退路 |
| `两个都没有是环境不具备不是插件坏` | ⚠️ **BUG-2 的现场**。这条以前是抛错的，而 git 插件的 `on_load()` 结尾要刷一次状态——于是"用户还没打开文件夹"被显示成"这个插件加载失败"。它必须是**函数值**（`Err` 的字符串），由调用方折成一张 `code != 0` 的结果表 |

**`lua::api::ui::tests`（18）—— 面板/菜单项的往返 + 面板内容的往返（BUG-13 的回归锁）**

前六条是**为一处真缺陷**加的：病灶是**写的一侧和读的一侧各写各的**
（`register_panel` 往 registry 里写，`plugin::读面板` 读出来），
所以这几条**故意让两头都参与**——只测一头永远测不出来。

后十二条是**面板内容**（`render`）那一半的同一回事：`register_panel` 把
`render` 存进 registry，`面板内容()` 现调它、剥成 JSON 再交给前端。
⚠️ 这几条也**故意让两头都参与**：只测一头测不出"存进去时把 `render` 弄丢了"。

| 测试 | 钉住什么 |
|---|---|
| `通知层级归一化` | `warn`/`warning` → `warn`，`error`/`success` 原样，**认不出的一律 `info`**。⚠️ 插件的笔误不该变成一次报错——那会让人为一个无关紧要的通知层级去读栈 |
| `注册的面板读得回来` | **BUG-13 的回归锁**：注册一个面板要能原样读回，且 `location` 不写时**默认到右侧插件栏**（`sidebar` 这个值来自插件栏还挂在左栏的时期） |
| `面板不写_title_就拿_id_顶上` | `title` 是可选的，但读回来不能是空串——拿 `id` 顶上 |
| `面板重名要报错` | 同一个 id 注册两次要报「重复注册面板」，⚠️ 而且**不能留下不完整的注册**（报错之后读回来还是一个） |
| `没声明过就读回空表` | 没申请能力的插件，registry 里压根没这个键——**读回空表，不是报错**。报错会让"装了但不带面板的插件"看起来像坏了 |
| `注册的菜单项读得回来` | 同一条路走菜单项：`menu` 不写默认挂在 `plugins` 下；同时钉住 `accelerator` 和 `prompt` **不写就是没有**（不是空壳） |
| `菜单项的_prompt_读得回来` | 「提交…」要的就是这个：点了先弹框问提交信息，答完才跑命令。⚠️ 走真的 Lua 源码（`lua.load(...)`）而**不是**手搭 `mlua::Table`——插件作者写的是源码，两条路之间差着 Lua 自己的表构造。同时钉住 `secret` 默认 `false`、`hint` 不写给空串（不是 panic） |
| `没有_arg_的_prompt_当没写` | 没有 `arg` 的 `prompt`（用户填的值没地方放）**当没写**：值送不出去，弹框也没有意义。⚠️ 与"用户按了取消"是两回事，前端那边见 `docs/04` §2.6d |
| `面板渲染出来的内容读得回来` | **内容那一半的回归锁**：`heading`/`list`/`buttons` 三种节点原样读回，`badge`、`command` 这些字段一个不少 |
| `每次读都重新跑一遍_render` | ⚠️ **这条钉的是"内容每次都是现跑的"**：连读三次要拿到「第 1 次」「第 2 次」「第 3 次」。面板内容不是快照——git 的改动列表每次都得现问 git。做成"注册时跑一次存起来"的话，界面上会一直显示应用刚启动那一刻的改动，而且**看着像是对的** |
| `渲染抛错时报的是插件自己的错` | `render` 里 `error("磁盘满了")` → **一句人话**，不是一个裸的 Lua 栈：错误里要同时有插件自己那句话和「渲染失败」这个定位 |
| `没有_render_的面板如实说没有` | 注册了面板但没写 `render` → 报「没有提供 `render`」，不是给一张空内容 |
| `没有的面板要报出来而不是给空` | id 压根没声明过 → 报「没有声明面板」。⚠️ 与上一条是**两种病**，报的话也不能一样，否则插件作者分不清是"忘了写 render"还是"面板名写错了" |
| `render_不是函数当场就报` | `render` 写成了表 → **注册时就报**，不拖到用户打开面板。拖到那时候，报错的地方（前端一个渲染失败）离病因（插件里把 `render` 写成了表）已经很远了 |
| `超长文本截断且不劈开汉字` | 按**字符**截到 `面板文本上限`，且一个汉字不该被劈成半个；截断处留一个 `…` 当记号 |
| `过不了_json_的值变成_null` | 函数、userdata 这些过不了 JSON 的值**替换成 `null` 而不是变成假字符串**（`"[function]"` 那种）；同一个表里别的字段不受影响。⚠️ 键名只能是 ASCII——Lua 的标识符不含汉字，`回调 = …` 是**语法错**不是"能跑但取不到" |
| `自引用的表不会打穿栈` | 自引用的表走到 `面板层数上限` 就停，最后是 `null`——不是栈溢出。⚠️ 这不是防恶意输入，是防调用方的疏忽 |
| `一层的项数有上限` | 一个数组超过 `面板节点上限` 就截。**这同样不是防恶意输入，是防调用方的疏忽**：一个插件把整个目录树铺进面板，前端会卡死 |

**`lua::api::http::tests`（9）—— 只有插件能发请求，那围栏就得在这里**

⚠️ 这九条里**前四条是安全用例**，不是格式用例。`nota.http` 是本仓第二个
真正的安全边界（第一个是 `lua::api::fs`），而它的形状特别容易写反：
"看着像回环、实为外网"。

| 测试 | 钉住什么 |
|---|---|
| `只放行_https_和回环的_http` | ⚠️ **这条是这一整个模块里最该在的一条**：明文 http 会把插件的 API key 和文档内容一起发在裸链路上，唯一的例外是本机回环（给 Ollama / LM Studio 这类跑在自己机器上的服务留的口子，流量根本不出这台机器）。放行 `https://…`、`http://127.0.0.1`、`http://localhost`、`http://[::1]`；挡掉外网 `http://`、局域网 `192.168.x`、`0.0.0.0`、`ftp://`、`file://`、以及**没写协议头的** |
| `取主机要能拆出端口和_userinfo` | `example.com:8443` → `example.com`，`user:pw@example.com` → `example.com`，`[::1]:8080` → `::1`，主机名小写化。⚠️ 其中一条是安全用例：`127.0.0.1@evil.com` 的主机是 **`evil.com`**，不是 `127.0.0.1`——判反了就是一个"看着像回环、实为外网"的口子 |
| `主机名骗不过回环判定` | `127.0.0.1.evil.com`、`localhost.evil.com`、`notlocalhost` 都不是本机。⚠️ 判据是**整个主机名等于**，不是"包含" |
| `方法只有那六个` | `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD` 在里面，`CONNECT`/`TRACE` 不在 |
| `超时截到上限` | 不写 → 默认 30 s；写 5 s → 5 s；写 600 s → **截到 `最长超时`（180 s）而不是报错**（插件写个大数，意思是"可能很慢"）；写 0 → 报错（0 是没意义的超时） |
| `两种写法都归一化` | `get("url")` 与 `get{url=…}` 归一到同一张表；方法是**就地写进那张表**的（所以插件手里那份也变了）；⚠️ 插件自己写的 `method` **不被覆盖**；认不出的类型（给了个整数）要报错，不能静默按 `GET` 发出去 |
| `认得插件自己写的_content_type` | 插件自己写了 `content-type` 就得认出来——不然表体那一下会补出**第二个** content-type 头（`Request::builder().header()` 是**追加**不是替换），而这正是本模块实测踩到的那个 bug。大小写不同也算同一个头（HTTP 头名不区分大小写） |
| `响应是_json就拆好放进去` | 响应体是 JSON 就一并拆好放 `json` 键里——AI 插件读 `choices[1].message.content` 靠它。⚠️ 这条同时钉住**下标从 1 起**：写成 0 起的话数组第一个元素会静默丢掉，而插件那边看到的是"模型没给出回答" |
| `不是_json就没有_json这个键` | HTML 错误页、空体这种 → **没有 `json` 这个键**，`code` 和 `text` 照旧。这是"别把解析失败当错误"那条注释的落点——4xx/5xx 的响应体要能到插件手里 |

**`lua::api::settings::tests`（7）—— 插件自己的那份设置怎么落盘**

⚠️ 这些用例走的是**真的文件**，不 mock。这一格的全部价值就是"关掉应用再打开还在"，
而内存里的表当然会通过所有内存里的用例。

| 测试 | 钉住什么 |
|---|---|
| `写下去的值读得回来` | 基本来回：字符串、整数写下去要从盘上原样读回 |
| `文件头那段注释不影响读` | 文件头是 Nota 自己塞的一段注释——**它不能影响读回来**。这句话看着理所当然，但它就是"往 TOML 里塞了一段自己写的东西"的那条边界 |
| `设置文件是_0600` | ⚠️ 文件里会有明文密钥，权限必须是 `0600`，**覆盖写之后还是 `0600`**。⚠️ `#[cfg(unix)]`，Windows 上不跑 |
| `坏文件当空的用而不是报错` | 手改坏的设置该表现为「回到默认值」，**不该让插件加载失败**。⚠️ 与"文件不存在"是同一档处理，但和 `settings/mod.rs` 里"文件存在却解析不了要报错"是**两回事**——见本文 §6.1 第一条 |
| `键里不许有点和怪字符` | 键只收 ASCII 词、不含点。⚠️ 因为 TOML 里 `a.b = 1` **等价于** `a = { b = 1 }`——键里带点会写进去读不回来。空键、非 ASCII 键（`模型`）都要报错 |
| `只收三种标量` | `nil` = 删掉这个键；`bool`/`integer`/`number`/`string` 收；表要报错且错误里带上「只支持」。⚠️ 复合值收下的话，插件那边的设置文件会长成它自己都不认识的样子 |
| `手改出来的复合值读回来是文本不是_nil` | 用户手改出来的数组/表：**读回来不能变成 `nil`**。变成 `nil` 的后果是插件以为"这个键没设过"，于是写回默认值把用户写的东西盖掉——**一次静默的数据丢失，而且看起来像是插件自身出了问题** |

**`lua::api::diff::tests`（13）—— AI 改动块：这是唯一会改坏用户文档的地方**

⚠️ **为什么这些值得用 Rust 单测钉**（而不是写在插件里）：改动块的解析与应用会
**直接重写用户的文档**，而它是"逐字找到那几行"才动手的——错一步就是"文档被改坏、
用户按了 Ctrl+Z 才发现"。写成 Lua 的话得先造一个宿主环境才能测；写成 Rust 纯函数，
一条 `#[test]` 就够。搬家的理由见 `docs/13` §12.2。

| 测试 | 钉住什么 |
|---|---|
| `一段普通文本加末尾一块改动` | 基本形状：正文与改动块拆开，`-`/`+` 各归各位 |
| `对不上就整体放弃并说清原因` | ⚠️ **最要紧的一条**：`-` 行在文档里找不到时**返回 `Err` 而不是改一半**。这条是"失败＝什么都没做"那条约定的回归锁 |
| `不连续的行不算数` | 要删的那几行必须在文档里**连续**。不连续就当没找到——**不许"跳着找"**，那会把不相干的两段拼在一起 |
| `只有加号就追加到文末` | 纯追加（续写那类预设靠它）。⚠️ 只有 `+` 行时**没有定位依据**，所以行为只能定成"缀到末尾" |
| `两块改动按顺序各改各的` | 多个围栏＝多处改动，逐个应用 |
| `顺序写反了也还能用` | 模型把两块改动的顺序写反时**照旧能应用**（按位置找，不按顺序依赖） |
| `坏行只数出来不当改动` | 既不是 `-` 也不是 `+` 的行：**数出来给用户看**，但**不当成改动**（面板上那句"有 N 行…忽略掉了"就是它） |
| `没有围栏就是普通文本` | 回答里没有改动块时 `hunks` 是**空表不是 `nil`**——调用方不用分情况 |
| `少写收尾围栏也认` | 模型忘写收尾围栏是常事，认下来 |
| `空改动块当没写` | 空的围栏块不算一处改动（否则会出现一块"什么都没改"的待应用改动，用户点它没有任何效果） |
| `crlf_文档也能改且不改风格` | ⚠️ CRLF 的文档改完**还是 CRLF**。不改风格是因为：换个行尾符会让整篇文件的 diff 全红，用户下一眼看到的是"整个文件都改了" |
| `纯删除和删末尾行` | `-` 行没有对应 `+` 行＝删除；删到文件末尾这种边界 |
| `删空行` | 空行也是"一整行"，照样要能逐字匹配上 |

**`paths::tests`（2）—— 插件 id 怎么变成文件名（安全用例）**

⚠️ 这两条是**安全用例，不是格式用例**：`plugin_settings_file` 的入参来自插件清单，
而清单是**插件自己带的文件**。它一旦不设防，`nota.settings.set` 就是一个任意路径写入。

| 测试 | 钉住什么 |
|---|---|
| `插件id里的路径分隔符出不了文件名` | 九个恶意 id（`nota/../../etc/passwd`、`../../x`、`a\b`、`\0`、`..`、`...`、空串…）归一之后**不含分隔符**、**不是空名**、**不是纯点的名字**。⚠️ 判据只能钉这三条**结果**，钉不了"里面含不含 `..`"——因为 `nota/../../etc/passwd` 会被归一成 `nota_.._.._etc_passwd`，它**含** `..` 但那两个点已经只是普通字符了。会出事的形状只有"含分隔符"和"整名都是点"这两种 |
| `正常的插件id原样保留` | `nota.ai`、`nota_git-2` 一个字符都不该变——变了会让老用户的设置文件找不到 |

**`document::tests`（15）—— 标题推导 + 文档表的三条口径**

| 测试 | 钉住什么 |
|---|---|
| `标题优先取_front_matter` | front matter 里的 `title` 压过正文一级标题 |
| `没有_front_matter_时取第一个标题` | 任意级别（`##` 也算）的第一个标题；**结尾的 `##` 要剥掉** |
| `代码块里的井号不算标题` | 围栏代码块里的 `# 注释` 不能被当成标题 |
| `井号后没空格严格模式不算标题` | ⚠️ 严格模式（`strict = true`）下 `#标签` **不是**标题。它是 2026-09-24 改的那条（原名 `井号后没空格不是标题`，那时只有一种口径）：**同一段文本在两种模式下的结论必须不同**，这条钉住严格那一半（回退到「未命名 7」） |
| `井号后有空格两种模式都算标题` | ⚠️ **两种口径的交点**：`# 标签` 在宽松和严格下**都是**标题。谁把宽松的正则放宽到「井号后面可有可无空白都算标题」、或者把严格的判据挪进宽松，这条就红 |
| `切换严格模式会重算标题` | **BUG 类的锁**：`set_strict_markdown()` 之后文档表里那份推导标题要**跟着变**（标签页标题是后端按当前口径算的）。⚠️ 它盯着「漏了重算」这种错——界面上的症状是「设置里改了、标签页还是旧标题」，不报错 |
| `建仓时就把标题口径定下来` | ⚠️ **2026-09-24 那个真缺陷的回归锁**：`DocumentStore::new(STRICT)` 建出来的仓里 `#标签` 不算标题，`new(LAX)` 建出来的算。它钉的是**构造函数那个参数真的落到 `derive_title` 上**——之前开机时设置到不了文档仓（会传它的构造函数没人调用），正是从这里漏过去的 |
| `取不到就回退到文件名或未命名` | 文件名（不含 `.md`）→ 都没有就 `未命名 {id}` 两档 |
| `同步相同内容不动_revision` | ⚠️ **内容没变就不涨 `revision`**。前端是去抖 300ms 推的，每次都涨会让"有没有变"这件事失去意义 |
| `同一路径只打开一份` | 重复 `open` 同一路径要返回**同一个 id**，不许开两个标签 |
| `存盘后_dirty_归零且另外存能改路径` | 存盘三件事一起钉：`dirty` 归零、内容真的落盘、"另存"要改掉 `path` |
| `没路径又没另存要报错` | 新建的未命名文档直接 `save(None)` 必须报错，不能自行猜一个路径 |
| `未命名序号不会被打字抹掉` | **BUG-9 的回归锁**：新建两份未命名文档，序号是 0 和 1；在第一份里打字（触到 `sync` 的重算标题那条路）之后，**序号仍然是 0**。⚠️ 它钉的是"序号在建文档那一刻就定死了"——如果谁改成"每次重算标题时问一下计数器"，第一份的名字会在用户打出第一个字之后自己变掉，这条就红 |
| `装载时的规范化不算用户改动` | **BUG-12 的回归锁**：`settle` 之后 `dirty` 必须是 `false`、`revision` 不涨。⚠️ 这条第一版**红过**：第一版的 `settle` 在 `text == doc.text` 时早退，而真实流程里编辑器那次规范化**已经先走 `sync` 把文本推上来了**，于是走到 `settle` 时两者已经相等、早退、脏标记没清掉。**早退那行不能加回去** |
| `未命名文档空的不脏` | 新建的文档一个字都没有时 `dirty` 就是 `false`。⚠️ 与上面那条合起来才是完整的口径：**`dirty` 是"和上次认领的干净文本比出来的"，不是"发生过 sync"** |

**`commands::workspace::tests`（4）—— 文件树的形状**

| 测试 | 钉住什么 |
|---|---|
| `认领的_markdown_后缀` | `.md` / `.MD`（**大小写要认**）/ `.markdown` 算，`.rs` / `.pd` 不算。⚠️ 这份后缀表要与 `docs/03` 一致；**`App.tsx` 打开对话框的过滤器曾经少一个 `.mdx`**（backlog 第 28 项，2026-09-22 已修——两处都补上了） |
| `文件树只列_markdown_并且目录在前` | 排序口径：目录在前、按名字（**不区分大小写**）、跳过点开头（`.git`）与非 md（`b.png`） |
| `depth_为_1_时不给子节点` | `depth=1` 时 `children` 是 `None`（**不是空数组**）；`depth=2` 才递归一层 |
| `目录读不动时报错而不是给空数组` | ⚠️ **BUG-24 的回归锁**：读不动的目录必须返回 `Err`，而且错误是那句能给人看的文案（`读文件失败`）。**吞成空数组就是 BUG-24**——界面上看起来是"这个文件夹是空的"。用例挑的是**不存在的目录**而不是改权限：权限位拦不住 root，那样这条会时灵时不灵 |

**`commands::export::tests`（5）—— 导出的落盘口径**

⚠️ 这一组**不碰 HTML**（HTML 由前端生成，见 `docs/05` §4.5）——它管的是
**落点**和**透明**这两件事。

| 测试 | 钉住什么 |
|---|---|
| `打印落点跟着文档目录走` | 有文档路径 → 落**文档自己那个目录**下的 `.nota-print.html`。⚠️ 这样定是有原因的：正文里 `![](./img.png)` 是相对路径，换个目录图片就全丢 |
| `没有文档路径就落到系统临时目录` | 未保存的新文档没有"自己的目录"，只能落临时目录（文件名前缀 `nota-print-`） |
| `标题里的分隔符会被换掉而不是拼出子目录` | `/` `\` `:` 等全换成 `-`：不换的话 `title = "a/b"` 会在用户目录里**凭空造出子目录** |
| `标题洗成空串或只剩横杠时不留下无信息也不留下隐藏文件` | ⚠️ 这条修出过一个真 bug：`清文件名("/")` 得到的是 `-` 而不是空串，于是造出一个**名字带点、又没有任何信息**的文件。判据是"空串**或者**全是横杠"都算没信息 → 用「未命名」 |
| `写出去的字节与给进来的一模一样` | `nota_export_write` 是**只透明**的接口：不补 `\n`、不改编码、不加 BOM。⚠️ 与严格模式那条口径同源（用户 2026-09-23：「如果关闭，存盘不要自动修复」） |

**`cli::tests`（4）—— `nota 笔记.md` 里那个路径怎么挑出来**

⚠️ 这一组是**纯函数**的判据（`首个要打开的文件`）：**不判存在性、也不读文件**——
挑出来的能不能读，是打开文档那条路的事。⚠️ 只认**第一个**非选项参数。

| 测试 | 钉住什么 |
|---|---|
| `只有程序自己时没有要打开的文件` | 只有 `argv[0]`、或者压根没有参数 → `None`（双击图标启动就是这种） |
| `第一个非选项参数就是要打开的文件` | 第一个不带头（`-` / `--`）的参数就是它 |
| `选项被跳过而它后面那个路径仍然算数` | ⚠️ **见到选项不能放弃**：`nota --verbose -x a.md` 里的 `a.md` 照样算数；而只给选项（`nota --verbose`）仍然是 `None` |
| `不判存在性也不读文件` | ⚠️ 路径**不存在也照样挑出来**（`/绝对不存在/的/文件.md` → `Some`）——存在性不在这一层判；空串不算路径 |

**`error::tests`（2）—— `NotaError` 落到用户眼前的那句话**

| 测试 | 钉住什么 |
|---|---|
| `io_错误翻成中文` | 四个 `ErrorKind` 各翻成一句中文（`路径不存在` / `没有权限` / `内容不是合法的 UTF-8 文本` / `那是一个文件夹，不是文件`）。⚠️ 钉的不是"翻译得漂亮"，是**用户看到的那句话是中文**——**BUG-25** 的症状正是"(中文路径) 失败：stream did not contain valid UTF-8" |
| `没见过的_io_错误保留原文` | 没见过的 `kind` **原样留着**：那句英文是排查线索，一律换成"读文件失败"就等于把它丢了。反过来这一条也钉住：翻过之后**不许再露出英文原文**，而路径必须在文案里 |

**`native_menu::tests`（6）—— 原生菜单兜底那份键位表**

⚠️ 这一组盯的是**全仓唯一一处"抄表"**：`to_native_accel` 把 `commands.ts` 里的
`Ctrl+…` 写法翻成 muda 认的 `CmdOrCtrl+…`。翻错了**不报错**，只是那一条按下去没反应——
而"按下去没反应"正是这个仓库最难发现的一种失效，所以这里测得很细。

| 测试 | 钉住什么 |
|---|---|
| `全部键位都转得出来` | 逐条核对那张**手抄**的 50 条表。⚠️ 箭头那两条是例外：`commands.ts` 写的是字形 `↑`/`↓`，**muda 不认字形**，得翻成 `Up`/`Down` |
| `手抄的表和_commands_ts_一样多` | 只挡"键位涨了、表没跟"这一种漂移。⚠️ **它挡不住"两处一起忘"**——2026-09-23 加三种编辑模式时条数 48→50，而测试当时还是绿的（表里那 48 条自洽、断言也只是常量比常量）。真要同步，回去 `grep -c "accel:" src/ui/commands.ts` |
| `ctrl_转成_cmdorctrl_而不是真的_control` | ⚠️ 直接照抄 `"Ctrl+S"` 给 macOS，菜单上画 ⌘S 而实际绑到**真的 Control 键**。断言必须**整个相等**——曾经写的 `!contains("Ctrl+")` 对一个**正确**的实现也报错（`CmdOrCtrl+S` 里本来就含这个子串），只会误导人 |
| `拿不准的一律不放行` | 认不出来就给 `None`（这条没有快捷键），**不是**猜出来的字符串；多字节键名（`Ctrl+€`）不许 panic |
| `灰掉的项不带快捷键` | ⚠️ **这是功能性的，不是风格偏好**：macOS 上禁用的菜单项照样吃自己的键位，灰着的 ⌘C 会把复制粘贴弄坏 |
| `分隔线不看别的字段` | `sep: true` 的项不吃 `label`；且 `enabled` 的**默认值必须是 `true`**——否则整份菜单全是灰的 |

**`themes::tests`（6）—— 文档主题的发现、围栏与"不许碰外壳"**

⚠️ 这一组 2026-09-23 换过一次（上一版是为外部编辑器主题兼容写的，那版作废）。
**最重要的一条是 `内置主题不碰界面变量`**，它不是普通的用例，是**一条设计约束的机器判据**。

| 测试 | 钉住什么 |
|---|---|
| `内置主题的_id_与文件名一一对应` | `BUILTIN` 表里的 `id` 真能在 `src/styles/themes/` 下找到同名文件（⚠️ 名字写错、或者 CSS 文件被改名，这条先红） |
| ⚠️⚠️ `内置主题不碰界面变量` | 逐份扫内置 CSS，**不许出现** `--ui-font-size` / `--font-ui` / `--sidebar-width` / `--dock-width` / `--toolbar-height` / `--statusbar-height` / `--zen-peek` / `--shadow` / `--nota-bridge`。**它就是「文档主题碰不到外壳」这条线的机器判据**——没有它，哪天有人在主题里加一条界面变量，谁都不会发现 |
| `内置主题都带自己的一套代码高亮` | 每份都要有 `--code-*`。⚠️ 代码块底色是主题挑的，缺了会"深底配深字" |
| `拒绝形状不对的_id` | `check_id()` 挡住 `../x`、`a/b`、空串、超长、中文——**这是文档主题唯一的围栏**，路径是拿它拼的 |
| `取一份不存在的主题要报错而不是给空串` | ⚠️ 静默降级成"没样式的裸 HTML"是这里最坏的结果，用户根本不知道是自己把文件删了 |
| `目录不存在时清单只剩内置的` | ⚠️ **"用户目录空的"不是错**——没装过任何主题的机器就是这种情况，返回的还是那六条 |

**`proc::tests`（9）—— 起外部进程那三件小事**

⚠️ 这一组是 2026-09-25 从 `slidev.rs` 的用例表里**分出来**的（连同 `proc.rs` 这个文件）：
原来那张表里的 `杀的是进程组而不是那个壳` 现在住在这里，名字也改成了 `给的是整个进程组`。
除最后一条外全是**真起进程**（`printf` / `sleep` 当夹具），没有 mock——这一层的全部风险
就在"真程序在真系统上怎么反应"。

| 测试 | 钉住什么 |
|---|---|
| `拆命令按空白分词` | ⚠️ **只按空白分词、不认引号**，而且**探测与真正起进程共用这一个拆法**——两边不同，面板就会替一条根本跑不起来的命令打包票。空命令返回 `None`（不是"跑一个空程序"） |
| `给的是整个进程组` | ⚠️ 进程链是三层（`sh` → `npm exec` → `node`），只杀 child 会留下 node 继续占着端口。`kill -TERM -<pid>` 那个**负号**是关键 |
| `环境变量优先于默认值` | 调试旋钮（`NOTA_*_CMD`）优先，其次默认值。⚠️ 只验"没设时给默认值"那半——环境变量是进程级的，另一半由各调用方自己覆盖 |
| `跑到程序自己的输出` | `Done { ok, stdout, stderr }` 那一档的基本形状 |
| `找不到程序是单独一档` | 「PATH 里没有它」必须与「跑了但失败」分开：前者该引用户去装，后者该把程序自己的输出端出来 |
| `退出码非零时把输出留下来` | 失败时**用户要看的是那个程序自己说的话**，不是一句"失败了" |
| `挂住的命令会超时而不是一直等` | 超时后**杀整个进程组**（不然界面上那个面板一直转）。⚠️ `Child::wait` 没有时限，所以 `RunOpts` 里超时是必填 |
| `标准输入喂得进去` | 正文从标准输入走（pandoc 那条路靠它），且喂完要**显式关掉**——"读完 stdin 才开工"的程序要看到 EOF |
| `文件正被别人写着时等一下再起` | ⚠️ **本批新加的那条**：自己拿着可写 fd 不放、另一条线程过一会儿放掉，把"`ETXTBSY` 是暂时的"做成确定状态。短路掉重试那行，它就如实报 `Text file busy (os error 26)`（见 §3.9） |

**`devserver::tests`（12）—— 开发服务器的机制（挑端口 / 写入口 / 探活 / 收摊）**

⚠️ 这一组**不碰真 Slidev**（第一次要下几百 MB），也**不起 GUI**：
测的都是"在本地就能做完的那几件"。端到端那条链（起进程 → 探活 → **交给插件面板里的
`frame`** → 同步 → 收摊）见 §5.7 用替身验。
📌 2026-09-25：`slidev.rs`（10 条）与 `slidev_probe.rs`（10 条）**合成这一个文件**，
「拆命令行 / 杀进程组 / 带超时跑一次」那一族搬去了 `proc::tests`（上一张表，9 条），
所以这一组是 **12 条**——⚠️ **不是把旧的两张表（10 ＋ 10）拼起来**：
合并时按"宿主这边现在还剩哪几件事"重数过，其中探测那一族的判据大半已经搬进插件了。
⚠️ 探测那一族（有/没有 `node_modules/@slidev/theme-*`、`--version` 认没认出来）
现在只留了最核心的一条 `标记目录要往上找`——**判据本身搬进了插件**
（`plugins/slidev/main.lua` 的 `describe_probe`），宿主返回的 `Probe`
**一句人话都没有**，所以"哪句话该说点什么"不在这里测了。

| 测试 | 钉住什么 |
|---|---|
| `挑出来的端口两套栈都能绑` | `pick_port()` 拿到的口子 v4/v6 上都得是空的。⚠️ Slidev 只绑 `[::1]`，而别的工具可能只占 v4——只试一套就会挑中一个用不了的口。<br>⚠️ **它带重试（连试 10 个端口），不是冗余**：这条会和机器上**别的东西**抢端口。2026-09-24 实测——`--test-threads=1` 连跑 6 次全绿，4 线程时约 **3/4 会红**（红的总是 v4 那句 `AddrInUse`），清掉当时还在跑的 `nota` + `vite` + `Xvfb` 之后，6 次全量并行跑又全绿。**机制没查清**：当时 `ss -ltnp` 只报出**测试自己刚绑上的那个 `[::1]`**，而同一容器里用 Python 验过 `[::1]:P` 与 `127.0.0.1:P` 互不影响（两种绑定顺序都成功），所以"看得见的那个占用者把它挡住了"讲不通——剩下的解释是**看不见的 TIME_WAIT**（`ss -ltnp` 只列监听者，一个还占着本地端口的 TIME_WAIT 连接照样能让 `bind` 报 `EADDRINUSE`），但没验到。<br>⚠️ **所以这条测试能钉的只有"某一次两套栈都能绑上"**：真要红，得连试 10 个端口都失败，那时 panic 里会带上每一个端口的 v6/v4 错误 |
| `入口写在项目根里` | 入口落在**文档自己的目录**（外部工具拿入口的父目录当项目根，`![](./img.png)` 才解析得对），名字按清单里的模板（`.nota-slidev-7.md`），内容**逐字**是刚写进去的那份 |
| `项目根写不进去时退回数据目录` | 未存盘 / 只读目录 → 退到数据目录（`paths::data_dir()`）。⚠️ **不报错**，这是"新建的空文档也能预览"的全部依据 |
| `没声明入口文件时不写文件` | 清单里没有 `entry`（`spec(None)`）→ **一个文件都不许写**，返回 `None`。⚠️ 这条不是凑数：`entry` 是**可选项**，没有它就不该凭空造文件 |
| `入口名字跟着文档走_不会互相覆盖` | 名字里带文档 id：两份文档先后开预览不会互相盖掉；且**点开头**（文件管理器默认不显示） |
| `启动命令的环境变量旋钮优先` | 那个变量在本测试进程里不存在 → 退回清单里那条（`npx @slidev/cli`）。⚠️ 变量名由**插件报**（`cmd_env`），不是宿主写死的 |
| `日志环只留最后几行` | 报错要能整段端给人看，但**不能无限涨**：环里只留最后 `LOG_TAIL`（30）行，且**留的是末尾那一段**（不是开头那一段） |
| `标记目录要往上找` | ⚠️ 这一条是从旧 `slidev_probe` 那边留下来的**唯一**判据：文档放在项目的**子目录**里（最常见的放法）也要认得出 `node_modules/@slidev/theme-*`。⚠️ Node 解析 `node_modules` 就是一层层往上找的。⚠️ 前缀要**逐字**匹配：`xx-theme-` 不算 |
| `没在跑的时候问什么都是空的` | 空状态四件事都不报错：`status` 给 `None`、`log_tail` 给空串、`stop` 是空操作 |
| `文档变了只刷盯着它的那一场` | 正文变了要**整份重写**入口（⚠️ 追加会让外部工具每改一次正文就多出一份幻灯片），而且**只重写盯着这份文档的那一场**——别的文档变了，一个字都不许动。⚠️ 收摊时入口文件要删掉 |
| `命令不存在时报的是人话` | 命令不存在 → `Missing`，而且 `detail` 里**要点名那句命令**，不是丢一个 `Os { code: 2 }`。⚠️ **"要点名"这条是宿主的**：具体怎么说成人话归插件 |
| `收摊之后进程真没了` | 杀的是**整个进程组**（`kill_tree`）：验完要确实核对进程没了 |

**`lang::tests`（8）—— 「这台机器现在该用哪种语言」**

⚠️ 这一族是**纯函数**，一个进程都不起。⚠️ `lang.rs` 是**唯一权威**
（`支持的语言` / `语言名` / `插件兜底` / `应用兜底` / `自动 = "auto"` 都在这儿）：
前端 `src/i18n/index.ts` 与 Lua 那两份都从它取口径——**改这里要同批看那两处**。
⚠️ **两个兜底是两个概念**（2026-09-26 拆开）：`插件兜底` 是对插件作者的要求、
`应用兜底` 是应用自己的落点。两个值今天都是 `en`，**但那是巧合、不是同一个常量**——
下面那两行表把这件事钉住。

| 测试 | 钉住什么 |
|---|---|
| `归一化` | `zh_CN.UTF-8` → **`zh-CN`**。⚠️ 环境变量里全是下划线和编码后缀，**直接拿字符串比永远匹配不上**——所以这条必须钉住 |
| `语言名和语言表一一对应` | `支持的语言`（顺序 = 选择器的顺序）与 `语言名`（**自称**，endonym）**不许有一方多出来**。⚠️ 漏一个的症状是那一项在下拉里没有名字 |
| `两个兜底都必须在支持的语言里` | **两个**兜底常量都必须真的在表里（原名 `兜底语言必须在支持的语言里`；拆成两个常量之后，名字里也写明了"两个"）。⚠️ 兜底指向一个不存在的语言 = 用户看到一片空 |
| `两个兜底是两个概念_今天恰好同值` | ⚠️ **这条的名字 2026-09-26 下午改过（原名 `两个兜底不是同一个值`），而且不能整条删掉。** 它钉的是"两个兜底**没被合并成一个常量**"：`插件兜底` 钉死 `en`（对插件作者的要求，用户点名要的，不能改），`应用兜底` 钉住"今天是 `en`"并写明**它凭什么可以再改**——跟着前端那张英文表的覆盖面走（那张表 2026-09-26 铺满了整个界面，所以它当天从 `zh-CN` 翻回 `en`）。⚠️ 原来靠 `assert_ne!` 钉，两者同值之后 `assert_ne!` 当场变红；**红的是值，不是那个概念**——看到它红别去删用例，先读 `lang.rs` 里那两段文档注释 |
| `匹配_精确在前_前缀兜底` | 先精确（`zh-CN`）；不中才**只往粗了走**（`zh-CN` 能匹配 `zh`，**反过来不行**）。⚠️ 方向写反了会把 `zh` 的插件文案给 `zh-TW` 的用户 |
| `有效语言_自动跟系统但不认识的落到应用兜底` | 设定是 `auto` 时看系统；系统那个不认识 → 落 `应用兜底`（**不是**落第一项）。⚠️ 名字里那个"应用"指的是 `应用兜底` 那个常量，**不是"应用语言"** |
| `有效语言_手动选的认不出就落到应用兜底` | 手选的 tag 不在表里也照样落 `应用兜底`——不报错、不给空 |
| `读语言文件_只收平的字符串` | `lang/<tag>.toml` 里**只收平铺的字符串键值**：嵌套表 / 数组 / 数字要拒。⚠️ 语言包是"一张平表"，不是通用 TOML |

⚠️ **"清单里的 `langs` 必须含 `en`"这条不在这一族**——它在
`plugin/manifest.rs::from_meta` 里（拒载时给的理由写着「英语是必须有的兜底」），
⚠️ **而且目前没有一条用例钉着它**（`manifest.rs` 的**六**条里没有这一条——2026-09-26 现数）。要动那段逻辑，
先补一条。

**`lua::api::i18n::tests`（6）—— `nota.i18n` 那四条口径**

| 测试 | 钉住什么 |
|---|---|
| `不声明langs就不协商也不提示` | 清单里没写 `langs` → 这一家**不参与协商**，面板上也不出那句「此插件不支持您的语言」 |
| `命中的语言用那一份_没命中就用英语并说一句` | 应用语言在 `langs` 里 → 用 `lang/<tag>.toml`；不在 → 用英语，并让 `ok = false`（那句提示的**唯一**依据） |
| `缺文件只退回原文_不把话说过头` | ⚠️ **`ok` 只看清单里有没有这门语言**：声明了 `zh-CN` 而 `lang/zh-CN.toml` 不在，**不算不支持**——那一份退化成"全是原文"，`ok` 照样是 `true` |
| `表里没有那条键时text给nil` | ⚠️ **缺键给 `nil`**，不是给键名、也不是给空串：插件的写法是 `nota.i18n.text(s) or s`，所以"表里少一条"只是那一条退回原文，不会整块不显示 |
| `没声明langs时lang是nil而app_lang还在` | `nota.i18n.lang` 是 `nil`（这一家不参与），而 `app_lang` **永远有值**——两个字段问的不是同一件事 |
| `文件名按规范写法找` | 找的是**规范化之后**的 tag（`zh-CN`），不是系统原样给的那个（`zh_CN.UTF-8`）。⚠️ 与 `lang::归一化` 是同一条口径的两端 |

**`lua::api::unified_diff::tests`（10）—— 「把一段 unified diff 读成两种行」**

⚠️ 订正一处想当然：这一族**不是**"从两份文本算 diff"，而是**解析**一段已经存在的
unified diff（git 的输出）。所以它的用例大半是在对付**格式本身的怪癖**，
不是算法。行怎么画（红底删除线 / 绿底下划线）在 `styles/diff.css`，两处共用
（见 `docs/04` §2.3b）。

| 测试 | 钉住什么 |
|---|---|
| `两个文件各归各的` | 一段里有多块 `diff --git` 时要分开，别把两份文件的改动混成一坨 |
| `被删掉的一行长得像文件头也不能认成文件头` | ⚠️ 最要命的一条：正文里一行**恰好长得像** `--- a/x` / `+++ b/x` 时不许当成分隔。判据是"在 hunk 里就还是正文" |
| `删掉的文件用旧路径` | 整个文件被删时 `+++ /dev/null`，路径要退回**旧**的那个，否则界面上显示 `/dev/null` |
| `纯改名用新名字` | 只改名、没有内容改动 |
| `路径后面那个制表符要掐掉` | git 在路径后面会补一个制表符，掐不干净就会带进界面 |
| `末尾没换行那行不算改动` | `\ No newline at end of file` 那个标记不是一行内容 |
| `二进制和只有模式变化都算认出来了只是没行可画` | ⚠️ **认出来了 ≠ 有行可画**：二进制补丁与"只有权限位变了"都该被识别成"这里有一处改动"，只是行列表是空的——**不能当成"没改动"** |
| `git_的二进制补丁体不当正文` | `GIT binary patch` 后面那一大段 base64 不许当正文画出来 |
| `不是_diff_的文本给空表` | 一段普通文本 → 空表（**不是报错**） |
| `没有名字的那块不画` | 拿不到路径的块不硬画一个空标题 |

**`image::tests`（25）＋ `commands::image::tests`（4）—— 插图那条链：地址怎么写、文件往哪放**

⚠️ 这两块合起来是**全仓第三大的用例族**（25 ＋ 4），值得说清它们**为什么这么多**：
`image.rs` 管的全是「算得出来、算错了也**不报错**」的东西——一条地址写成
`assets/x.png` 还是 `./assets/x.png`、名字撞了加不加 `-1`、同内容的文件复不复用、
`%20` 会不会被转成 `%2520`。这些错**不会让应用崩，只会写出用户没要的字节**，
在界面上看不出，只能靠用例钉。

📌 **整个模块没有一条用例会真的联网**：网络那一支是**注进去的**
（`落地(&计划, …, &取网络)` 那个参数），所以 `image/plan.rs` 里"下载"那一支也能离线测。

| 测试 | 钉住什么 |
|---|---|
| `网络地址只认_http_和_https` | 只看前缀（大小写不敏感）；`data:` / `file:` / `C:\…` / 相对路径**一律算本地** |
| `转义不碰中文但会收拾空格` | 空格转成 `%20`，中文**不转**（转了地址就没法看了） |
| `已经编码过的地址不会再被转一遍` | ⚠️ 这条最值钱：`%20` 再转一次就成了 `%2520`（地址从此打不开） |
| `网络地址里的问号井号是定界符不能转` | `?` `#` 在**网络**地址里是查询串与锚点、在**本地**路径里是普通字符——同一个字符两种待遇 |
| `相对路径会往上退` | 从文档目录出发算到目标的那条 `../` 路径 |
| `相对路径算不了就给空` | ⚠️ 算不出来（不同盘符等）时**给空**，不硬编一条错的 |
| `点点斜杠只加在没点开头的前面` | `assets/x.png` → `./assets/x.png`；`../x.png` **不加** |
| `五个动作各自的落点` | `.` / `assets/` / `<文档名>.assets/` / 用户那条，逐个对路径 |
| `没存盘的文档做不了复制动作` | ⚠️ **报错，不猜目录**：猜出来的目录（当前工作目录 / 主目录）会在用户下次存盘时变成一个谁也想不到的地方多出一堆图片 |
| `指定路径空着就报错不猜` | 同上，空串不悄悄退回别的目录 |
| `指定路径相对时按文档目录算` | ⚠️ 不按**进程的工作目录**算——那是应用的目录，跟用户看着的那个文件夹没关系 |
| `同内容不重复写` | ⚠️ 同内容 = 就是它，复用已有的那份，**别在用户的文件夹里堆一堆一模一样的图** |
| `名字里的路径与怪字符会被剔掉` | URL 末段里混进 `../`、控制字符、`:` `*` `?` 这类时**剔除而不报错**（"报错让用户改个 URL"毫无意义） |
| `从地址猜名字取末段或摘要` | 末段当名字；认不出后缀的（`/img/12345`）用内容摘要补一个 `.png` |
| `默认设置下什么都不动` | 动作是「无特殊操作」＋ 规则不适用时**一个字节都不写盘** |
| `优先相对路径只朝一个方向动` | ⚠️ 只有用户给的是**绝对**路径才换算；本来就是相对的**原样保留**——反过来会把用户手打的 `./img/x.png` 改成绝对路径 |
| `复制到_assets_的计划` | 计划本身就长对了（`算计划` 是纯函数，能直接断言） |
| `开关关掉就不动手` | `apply_to_local` / `apply_to_remote` 关掉时那条规则不生效 |
| `剪贴板必须落盘` | ⚠️ 剪贴板**没有"原处"**，所以动作是「无特殊操作」时退回「复制到 ./assets」——**全仓唯一一处"设置说的和做的不一样"**，界面上要专门说一句 |
| `剪贴板的后缀认不出就退回_png` | 认不出的后缀一律当 `png`（那是个封闭集合） |
| `复制之后写的是相对路径` | ⚠️ **自己弄到磁盘上的那份总是相对路径**，不看 `prefer_relative`——写成绝对等于白复制 |
| `加点点斜杠与转义在复制那一支也生效` | 三个语法偏好对"复制出来的那一份"同样管用 |
| `下载走的是注进来的那个取网络` | ⚠️ 下载那一支是**注进去的**，所以整个模块**没有一条用例会真的联网** |
| `剪贴板落的盘与同内容复用` | 同一张图粘两次：一条地址、一份文件 |
| `不落盘时一个字节都不写` | 端到端那一路的"不动"档 |
| `commands/image.rs`：`地址要真的是网络地址` | ⚠️ 命令层**再挡一次**：`kind: "url"` 但里面不是 http(s) 的，当错误处理 |
| `commands/image.rs`：`空路径不是路径` | 空串路径报错，不落到"相对文档目录的空串"上 |
| `commands/image.rs`：`剪贴板的字节要解得开且不是空的` | base64 解不开 / 解出来是空 → 报错（**不是**写一个 0 字节的文件） |
| `commands/image.rs`：`动作名字与设置里写出去的那一套一致` | ⚠️ 回前端的 `action` 字符串必须与 `settings/image.rs` 落盘用的那套 kebab-case 一模一样——不然界面按 `action` 认的那一句就永远不会出现 |
| `settings/image.rs`：`插图默认不动磁盘` | ⚠️ 默认必须是 `none`：默认值错了的症状是"用户没选过复制，文件夹里却多出一个 assets 目录" |
| `settings/image.rs`：`五个插入动作的写法是老设置也认得的那一套` | ⚠️ 2026-09-26 之前的设置文件里只可能出现 `none` / `copy-to-assets`，**加选项不该让它们读不出来**（读不出来 = 整份设置退回默认 + 启动一条提示条） |
| `settings/image.rs`：`图片设置里不许出现上传与密钥` | ⚠️ **2026-09-26 第二批改名并改了口径**：原来叫 `没有上传服务这一项`（那时上传确实没做），现在是**上传做了、但设置故意放在另一个文件里**（`~/.config/nota/image-upload.toml`，0600，装着令牌）——所以它挡的是「**把带令牌的那一组搬进 0644 的 `settings.toml`**」。⚠️ 与 `docs/10` §11.2 第二类那行是同一件事的两面，改一处要连另一处一起改 |

### 6.2 这些测试**没**覆盖什么

⚠️ "全过"不等于"哪都没问题"。**十条**已知的空白：

| 空白 | 为什么 |
|---|---|
| **`HostContext` 相关的一切** | 它要一个**真的 `AppHandle`**，构造不出来。所以 `nota.document.*` / `nota.ui.*` 发事件那几条路**没有单元测试**——这正是 `AGENTS.md` §4 那条"**别把安全边界写在 `HostContext` 里面**"的由来：写了就没法测 |
| **`HostContext` 之外的插件加载流程** | `PluginHost::discover` / `LuaPlugin::load` 都要 `HostContext`。所以"插件真能被加载"只能在 §5 开窗（或至少起 Xvfb）验 |
| **前端** | ⚠️ **2026-09-26 起这一格收窄了，但没有消失**：`tests/math-view.test.ts` 那 38 条盖住的是**纯逻辑**（源码在哪、写回哪、NodeView 收到事件后做什么），**React 组件、编辑器生命周期、CSS 一条都没盖住**——那三样仍然只靠 `tsc --noEmit` + §5 抓图 **+ §5.6 那个试验台**。⚠️ 试验台那几场里，**`#math`（physics 宏表逐条真渲染）与 `#sidebar` / `#sidebar-empty`（折叠、那颗 ×、空态那颗按钮）是唯一能"问"出结论的地方**——它们证明的是"表推得对、DOM 长对"，**证明不了**在真 Tauri 窗口里按下去真响 |
| **文档主题的限域逻辑** | `styles/doc-theme.ts::scopeDocThemeCss()`（把选择器收到 `.editor-pane` 之下、`:root`/`html`/`body` 改写成锚点、`@media` 下钻）**一条测试都没有**，而它是「文档主题碰不到外壳」这条线的全部实现。原因是前端没有测试运行器。**今天的判据是间接的**：Rust 那侧 `内置主题不碰界面变量` 只保证**内置那三套的 CSS 里没写界面变量**；"限域算法本身对不对"仍然只能靠人看版式（换主题后看外壳有没有变、编辑区有没有生效） |
| **"关掉一个真窗口"这个动作** | ⚠️ **在容器里验不了**：裸 Xvfb + 没有窗口管理器的环境里，关**任何**窗口都会让应用撞上 `BadDrawable` 直接 `abort`（**关主窗口也一样**，A/B 验过），`Destroyed` 回调根本没机会跑。详见 §5.7 第二个坑。⚠️ 2026-09-25 起"预览窗"那个案例**整个没有了**（预览不再开第二窗口），所以这一条今天泛指"将来任何真窗口的关闭路径" |
| **插件面板那整条链（含 `frame`）** | ⚠️ `HostContext` 那条空白的**推论**：`register_panel` / `nota.ui.review` / `nota.devserver.*` 全都要 `AppHandle`，所以「面板能不能真摊到编辑区」「`frame` 那块 iframe 真加载了没有」「语言对不上那一句画在哪儿」**一条单测都没有**。`PanelBody` / `panel-nodes.ts` / `ReviewPane.tsx` 是前端，而前端没有测试运行器（见上）。今天能证明的只有"宿主返回的 JSON 是合法的、有上限的"这一半 |
| **`挑出来的端口两套栈都能绑` 里那条重试** | ⚠️ 它是 2026-09-24 为了**止住并行跑时的偶发红**加的：那次现象是 v4 绑不上、`ss` 又只看得见测试自己的 v6，**真机制没查清**（猜测是看不见的 TIME_WAIT）。重试让这条测试不再对"机器上别的东西"负责，代价是**它也可能盖住 `pick_port` 真坏掉的那一次**——兜底只剩 panic 里"连试 10 个端口全失败"这句。真要看它，得在**没别的应用在跑**的机器上单线程跑（`--test-threads=1`） |
| **「真装了一份 Slidev」那一格** | ⚠️ **本仓最老的欠账**（`docs/07` 第 44 项）：不管探测还是预览，所有证据要么来自 `tools/stub-slidev.py`、要么来自"没装"那一档。`ready` 那一格**从没在真装过的机器上点过**——本机没有真 Slidev，而装它要几百 MB（`npx @slidev/cli` 一次 53.0.0 的下载）。所以"装了之后能不能开预览"这件事，仍然只有替身作证 |
| **"在真窗口里按下去真响"** | §5.6 那个试验台把快捷键的**表**验到条条不差，但它验不了 Tauri 窗口里 `keydown` 真被送达、也验不了 macOS 原生菜单真挂上去了。这两件事**目前一件都没验过**（原生菜单那份代码在 Linux 上连执行都没执行过） |
| **插图那三条入口里的「粘贴」与「拖入」** | ⚠️ 2026-09-26 新加的一格。`ui/useImageInsert.ts` 那两条路**在无头环境里根本喂不进去**：合成输入造不出真的剪贴板图片（`clipboardData.items` 里得有 `image/*` 的 file），Xvfb 上也发不出 XDND 拖放。所以"它们到底能不能用"今天**一个字都没有证据**——`image.rs` 那 26 条钉的是**算式**（给定什么输入、该写出哪条地址、该不该落盘），不是"粘贴事件收得到"。⚠️ 对话框那一条路（`ImageDialog`）**理论上能点**（它就是个普通框），但**那批也没开窗点过**——如实记在 `docs/07` 第 62 项 |

---

### 6.3 前端的测试怎么跑（2026-09-26 起，**不装任何包**）

⚠️ **本仓没有 vitest / jsdom，也不为这件事装包**——所以前端的测试是"用现成的
`esbuild` ＋ `node` 手工跑"的几份普通 TS 文件：

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota
mkdir -p /tmp/nota-测试
for n in math-view mark-hint math-input lang-icons atom-space accent chart-ticks instant-render math-delim inline-marks html-block smart-punctuation auto-correct emoji footnote toc slash doc-typography; do
  npx esbuild tests/$n.test.ts --bundle --platform=node --format=esm \
    --outfile=/tmp/nota-测试/$n.mjs && node /tmp/nota-测试/$n.mjs
done       # 全过退出码 0；有不过的列出名字并退 1
```

⚠️ **循环里那个名字列表是穷举的**（少了谁就悄没声地不跑谁）：2026-09-27 补进了
`chart-ticks` 与 `instant-render`——这两份此前**建好了却没人跑、也没进任何文档**
（见本节末那条 📌）。**同一天又补进了 `doc-typography`**：它也是这个毛病
（`tests/` 下有、`for` 里没有、本节那张条数表里也没有，见下面那条 📌）。
加 `tests/*.test.ts` 时**顺手把它加进这个 `for`**。

⚠️ **不在上面那个循环里的有四份**，各有各的原因：

- **`share-card`**：要**多两个开关**（`ui/nota-mark.ts` 走 Vite 的 `?raw` 去读
  `src-tauri/icons/nota.svg`，还 import 了 `@/…` 别名）：
- **`heatmap`**：要 `--alias:@=./src`（它 import 的模块里有 `@/…`），但**不需要**
  `--loader:.svg=text`（不碰那枚 SVG）。
- **`focus-summary`**：同 `heatmap`，也只要 `--alias:@=./src`（2026-09-27 加；它
  import 了 `ui/useForceFocus.ts` 的 `说时长`，那个模块里带 `@/…`）。
- **`keymap`**：同 `heatmap`，也只要 `--alias:@=./src`（2026-09-27 加，与设置里
  「快捷键」那一页同批；它 import 的是 `ui/accel.ts` 与 `ui/commands.ts`，
  两个都从 `@/…` 进）。

```sh
npx esbuild tests/share-card.test.ts --bundle --platform=node --format=esm \
  --loader:.svg=text --alias:@=./src \
  --outfile=/tmp/nota-share-card/share-card.test.mjs && node /tmp/nota-share-card/share-card.test.mjs

npx esbuild tests/heatmap.test.ts --bundle --platform=node --format=esm \
  --alias:@=./src \
  --outfile=/tmp/nota-heatmap/heatmap.test.mjs && node /tmp/nota-heatmap/heatmap.test.mjs

npx esbuild tests/focus-summary.test.ts --bundle --platform=node --format=esm \
  --alias:@=./src \
  --outfile=/tmp/nota-focus-summary/focus-summary.test.mjs && node /tmp/nota-focus-summary/focus-summary.test.mjs

npx esbuild tests/keymap.test.ts --bundle --platform=node --format=esm \
  --alias:@=./src \
  --outfile=/tmp/nota-测试/keymap.mjs && node /tmp/nota-测试/keymap.mjs
```

⚠️ 少任何一个开关的报错都**不像**"开关没给"：漏 `--loader:.svg=text` 是
`Unexpected "<"`（esbuild 拿默认的 js loader 去解析 SVG）；漏 `--alias:@=./src`
是 `Could not resolve "…"`。⚠️ **只有 `share-card` 那一份两样都要**（它是唯一
一份 import 了带 `?raw` 的模块的）：另外三份**只要 `--alias:@=./src`**。
⚠️ 本节早先写过"**全仓只有这一份测试需要它们**"——那句话**2026-09-27 起过期了**，
现在是**四份**（`heatmap` / `focus-summary` / `keymap` 各要其中一样）。这句话留着
是因为它当初对应的判断（"`?raw` 只有一处"）本身没错，**错的只是"只有一份测试
会碰到别名"**。

**二十二份、共 566 条**（2026-09-27 数）：`keymap` **54** · `slash` **49** ·
`share-card` **46** · `math-view` **41** · `focus-summary` **34** ·
`smart-punctuation` **32** · `emoji` **32** · `footnote` **30** · `math-delim` **23** ·
`toc` **22** · `inline-marks` **21** · `heatmap` **20** · `auto-correct` **20** ·
`math-input` **19** · `atom-space` **19** · `mark-hint` **18** · `accent` **18** ·
`instant-render` **17** · `lang-icons` **14** · `html-block` **14** ·
`chart-ticks` **12** · `doc-typography` **11**。
⚠️ 这二十二份的条数**是当场一份一份跑出来的**（全 `0 失败`），不是照抄上一版的数：
2026-09-27 这一遍 `share-card` 35→46、`accent` 14→18、`chart-ticks` 11→12、
`math-input` 16→19（`$$` 那三组新用例），另加新的两份 `math-delim` 23、
`inline-marks` 21（高亮/上标/下标/下划线）与 `html-block` 14（块级裸 HTML ＋ 注释），
`heatmap` 20 是那一批建好之后**头一次**进这份清单；2026-09-27 的下一批又加了
`smart-punctuation` 32（智能标点）与 `auto-correct` 20（自动更正）；再下一批加了
`emoji` 32（短代码表 ＋ 补全面板）；再下一批加了 `footnote` 30（脚注的编号分配 ＋ 插入事务 ＋ 往返）；
再下一批加了 `toc` 22（目录的锚点算法 ＋ 生成 ＋ 事务）；再下一批加了 `slash` 49
（斜杠菜单：表的账 ＋ 筛项 ＋ 认查询 ＋ 采用 ＋ 插件那四条键）；**这一批加了
`focus-summary` 34**（强制专注结束后的总结：记一笔 ／ 抽稀 ／ 总结与专注率 ／
两个时刻 ／ 横刻度 ／ 造分享卡——⚠️ 它**不在上面那个 `for` 里**，跑法见本节前面对
那四份的单列），那 **34** 是当场跑出来的。

📌 **2026-09-27（设置里的「快捷键」那一批，新建 `keymap.test.ts` 54 条，512→566）**：
这一批加**两样**东西——一份新测试 `keymap`（可写回的键位文本 ＋ 覆盖表怎么叠到
菜单上），以及把 **`doc-typography` 那一份补进名册**。补的理由与 `chart-ticks` /
`instant-render` 一模一样：`tests/` 目录下有它、`for` 里没有、本节那张条数表里
也没有——**它从来就没被跑过、也没被数过**，而 ⑤ 那个闸**不扫根目录的 `tests/`**，
所以一点提示都没有。补进来之后上一版的"二十份 501 条"对不上差 **11** 条，
正是它。⚠️ 所以现在这个数（22 份 566 条）与上一版之间那 **+65** 里，
**11 条不是新写的**，是补数。

⚠️ **加了新的一份要跟着改四处**：本节这个数、`AGENTS.md` §2 的 `tests/` 那一行、
`docs/09` §2 的 `tests/*` 登记行、`docs/02`（⑤ 那个闸**不扫根目录的 `tests/`**，
所以漏了不会有任何提示）。⚠️ **还有第五处，闸门管不着**：上面那个 `for` 里的名字。
⚠️ 那份"没被跑过也没被数过"的名单**今天已经出现三次**（`chart-ticks` /
`instant-render` / `doc-typography`），三次都是**加文件的人忘了这第五处**。
加完一份测试，最省事的自查是 `ls tests/*.test.ts` 与 `for` 里那串名字**对着数一遍**。

⚠️ **宿主上就能跑**（`npx` 与 `node` 都有），不需要容器、不需要开窗。
⚠️ **它跑得很快、也不写任何文件**（除了那个 `/tmp` 下的产物）。

**为什么这么写**（设计在 `tests/math-view.test.ts` 的文件头，别改：那几条是从依赖里查出来的
约定）：不建 Editor、不碰真 DOM——用一颗真 `Ctx` 把**真插件自己那份节点规格**取出来，
再用它建一颗**真的 ProseMirror `Schema`**。于是"源码在内容里还是在属性里""存盘时
`toMarkdown` 读哪一个"这两条**全是真代码在答**（真 `toMarkdown.runner`），而不是我在测试里
另写一份假设。NodeView 那一层喂 `tests/fake-dom.ts`，那个假 DOM **不实现布局与 CSS**。

⚠️ **别把它当成"以后前端都能这么测"**：能被这么测的只有**不碰 DOM 布局的纯逻辑**。
React 组件、编辑器生命周期、以及"半透明看起来对不对"这一类，仍然只能开窗看（§5）。
⚠️ **加前端测试时要跟着改的三处**：这份文件（§6 的这个数）、`AGENTS.md` §2 的
`tests/` 那一行、`docs/09` §2（`tests/*` 的登记行，⑤ 不扫根目录的 `tests/`，
所以漏了不报错——**要人记着**）。
📌 **2026-09-26 照这三处走过一遍**（第六组「插公式块」4 条进来那次）：
本文这两处、`AGENTS.md` §2、`docs/09` §2 两行（`math-view.ts` 与 `tests/math-view.test.ts`），
外加 `docs/02` 两处。**三处一处都不许漏**——漏了不会有任何提示。
📌 **同一天第二次（第七组「宽松标题」5 条，28→32→38）**：同一条路又走了一遍，
⚠️ 顺手记下这次多出来的一处——`docs/05` §2.1c 附近写着 `宽松标题显示` 的挂法，
**插件从 `$prose` 结果变成了带参工厂**（`宽松标题显示(!!readOnly)`），那儿也要跟。
📌 **同一天第三次（`#你好` 不变大 ＋ 行内 `$$…$$` ＋ 行内标记提示 ＋ 真图标 ＋ 原子后那颗空格，38→41 并多出四份）**：
`math-view` 涨到 **41**，另外四份是新建的（`mark-hint` 18 / `math-input` 16 / `lang-icons` 14 /
`atom-space` 12）。⚠️ 这一批里两份测试各钉住一条**曾经悄悄错掉的**事：`mark-hint` 那份对的是
"斜体 mark 的 id 是 `emphasis` 不是 `em`"（错了的症状是"提示不出现、不报错"），
`atom-space` 那份对的是"全仓 U+00A0 只许来自 `\u00a0` 这个转义"（别的写法会让一个不可见字符
悄悄混进源码）。⚠️ **同批 `math-view.test.ts` 的第七组换了内容**：原来钉的是 `宽松标题显示`
（把 `#你好` 按 `h1` 排版的那个装饰），那个插件 2026-09-26 被删掉了，于是那一格
换成**同一个文件里剩下那一半**——`不转义行首井号`（它此前一条用例都没有）。
⚠️ 那一组递进去的是**假的**原文处理器，所以钉的是**本函数的判据**，不是"上游行为没变"。
📌 **同一天第四次（原子后那颗空格：测试从 12 条改到 19 条，101→108）**：
这一个改动**代码先后换了三版**，前两版都被开窗实测否掉（拦在编辑器里 ⇒ 那颗空格会在
紧跟着的下一次编辑里丢掉；挂 `$remark` 插件 ⇒ **转换器一次都没被调用**，静默空操作），
第三版包的是 `handlers.text`。⚠️ **测试跟着换了两次形状**：第一版测的是 `handleTextInput`／
`handleKeyDown` 两个 ProseMirror 钩子（12 条），现在是纯函数判据 ＋ 包装那层找前一个兄弟（19 条）。
⚠️ **这三版的教训**：第二版那个 `$remark` 插件**测试全绿、`tsc` 干净、开窗不报错**，
唯独**没有被调用**——所以这一条的判据只能是**开窗打字 ＋ 读落盘字节**，跑法见 §5.22。
⚠️ 顺手把本节顶上那句 `§6 那 308 条` 改成 **317**（同一批的 Rust 计数已经涨到 317 了）。
📌 **同一天第五次（「主题色」那一批新建 `accent.test.ts`，14 条，108→122）**：
走的是同一条路（本节两处 ＋ `AGENTS.md` §2 ＋ `docs/09` §2 ＋ `docs/02` 两处）。
⚠️ **这一份有个别处没有的形状**：它 `readFileSync` 去读 `src/styles/theme/color.css`，
把**出厂那 15 对强调色的前景色**断言成 `accentFg()` 算出来的那个——也就是
**测试和一份 CSS 数据文件绑着**。这不是洁癖，是那次真逮住了东西：第一版 `accentFg`
用的是"挑对比度大的那个"（看着最合理），跑起来跟出厂配色表 **15 对里 7 对** 打架。
⚠️ 于是它的失效方式是**"改了风格批次就红"**，不是"改了这个模块才红"——见到它红
先去看 `color.css` 那 15 对，别急着改测试。⚠️ 它的**盲区**写在文件头：
**测不了 `applyTheme` 有没有真把变量写上去、也测不了设置页有没有接上**，
那两件事只有开窗看（§5.27）。⚠️ **顺带记一条环境坑**：这次 `cargo test --lib` 报
**4 failed**，全是 `/tmp/nota-settings-test-*` 的 `PermissionDenied`——上一次有人
**用 `-u 0` 跑测试**，在 `/tmp` 里留下四个属主 524288、权限 0700 的目录，
之后 `-u 1000` 的跑法全写不进去。清掉即好。**这类失败看起来完全像回归。**
📌 **2026-09-27（写作统计分享图那一批，新建 `share-card.test.ts` 34 条，122→156）**：
同一条路（本节两处 ＋ `AGENTS.md` §2 的 `tests/` 行 ＋ `docs/09` §2 ＋ `docs/02`）。
⚠️ **这一份的形状又与别的不一样**：它是**唯一**一份需要
`--loader:.svg=text` ＋ `--alias:@=./src` 的（上面单列了跑法），因为它 import 的
`ui/share-card.ts` 会一路 import 到 `ui/nota-mark.ts`，而那里有一句
`import 源 from "../../src-tauri/icons/nota.svg?raw"`。⚠️ 两条踩过的坑记在这儿：
**① `--alias:@=./src` 的值是相对路径，必须从仓库根跑**（从别处跑会报
`Could not resolve`）；**② `--loader:.svg=text` 不能省**，省了的报错是
`Unexpected "<"`——看着像文件写坏了，其实只是 esbuild 拿 js loader 去解析了 SVG。
⚠️ 这一份里几条"刻意钉住的怪口径"记在 `docs/09` §2 那行（0 个点 / 恰好 1 个点 /
四处 `text-anchor="end"` / `" Q "` 只数 `fill="none"` 那一条），改 `share-card.ts`
之前先看那一行，别把钉住的当噪声删掉。
⚠️ 它**盖不住"真存下去那张 PNG 长什么样"**——那只能开窗看（§5.32）。
📌 **同一天第二批（`chart-ticks.test.ts` 11 条 ＋ `instant-render.test.ts` 17 条，156→185）**：
⚠️ 那两个数都是**当时那一刻**的（`chart-ticks` 后来涨到 **12 条**、合集到当天收尾是 **247 条**，
以本条下面第三批那一行为准；现数见 `docs/02` §测试那张逐文件表）：
⚠️ 这两份是**建成之后一直没人登记、也没人跑**的（`chart-ticks` 是我这一批新建的，
`instant-render` 是 2026-09-26 另一批留下的）。症状很轻——**不跑也不会有人发现**：
`docs/06` 那个 `for` 里没有它们、`AGENTS.md` §2 的 `tests/` 行没有它们、
`docs/09` §2 没有登记行、`tools/doc-sync-check.sh` 的 PAIRS 里也没有它们，
于是三道闸**全是绿的**。✅ 这一批补齐了这四处，并把那个 `for` 改成穷举的那 8 份。
⚠️ **`chart-ticks` 那两份新用例钉的是一条真错过的**：`格式化数(109.5)` 曾经写成
`"11"`（去尾零的正则把**整数末尾的零**也吃了），后果是**刻度上的数差十倍**而图看着
一点没变——发现它靠的不是测试，是开窗看纵轴刻度时盯着那个数不对（§5.32）。
📌 **同一天第三批（`math-delim.test.ts` 新建 23 条，并把 `heatmap` 补进登记，185→247）**：
测的是**行内公式"用几个 `$`"**（用户 2026-09-27 拍了「保留」，机制在
`editor/math-delim.ts`，那条 ⚠️⚠️ 在 `docs/05` §4.6c）。⚠️ **这一批最值钱的不是那 23 条
本身，而是它逮住了两处"测试自己在骗自己"**：
**①** `math-input.test.ts` 里那个假 `addNode` 只收前三个参数，把第四个（`{data:{dollars}}`）
**扔掉了**——测试看着"跑了真 `runner`"，其实那一步的信息根本没出来，于是"`$$` 保留"
那条**一直失败**、看着像产品没改；补上第四个参数才对。
**②** 那个文件原来拿的是**上游**那份 `math_inline` 规格建 schema（`createAndFill` 对
陌生的属性名是**静默忽略**的），所以就算不补第 ① 条也**不会报错**——两处叠起来，
"新属性根本没被搬"这件事在测试里是完全看不出来的。
⚠️ 于是这一批把那份 schema 换成了**本仓那份**（`ctx.get(行内公式规格.key)(ctx)`），
并新加了一类的判据：**把那两个插件真的跑起来**（顶层 `await`），再拿 `nodesCtx` 里的
名单逐项对比——因为"就地替换还是挪到末尾"这件事（`extendSchema` 的两份实现不一样）
**不跑起来是看不见的**，而那正是 `math-delim.ts` 里那段注释的全部理由。
📌 **同一天第四批（`focus-summary.test.ts` 新建 34 条，247→281；全仓二十份 501 条）**：
测的是**强制专注结束后的总结**（用户 2026-09-27 点名「做一下专注模式结束后的总结
功能就是将这一次专注模式的情况显示出来，并且像心电图那样也支持导出」，机制在
`ui/focus-summary.ts`）。⚠️ **这一份的形状又是新的**：它**不在上面那个 `for` 里**，
但**也不与 `share-card` 同组**——它只要 `--alias:@=./src` 一样，**不需要**
`--loader:.svg=text`（它 import 的 `ui/useForceFocus.ts` 不碰那枚 SVG 的 `?raw`）。
于是这一批把本节顶上那句"不在循环里的有两份"改成**三份**，并把那句
"全仓只有这一份测试需要它们"标注为**过期**（见本节那一段）。
⚠️ **它钉的三件事都是"写错了也不报错"的**：① **同一秒就地更新而不是追加**
（每秒那一路上有两个来源——计时线程的广播 ＋ 命令的即时回执——撞在同一秒是常态，
追加会让曲线的横轴比真实时间密，而"多密"正是这条曲线要传达的东西）；② **抽稀取
余额大的那个**（平均一下就把"扣空／攒满"两个尖角磨圆了）；③ **专注率的分母是
「专注 ＋ 离开」**（把警报冻住那段算进分母，等于因为"警报响了"而拉低专注率，
而警报恰恰是他**回来过**的证据）。⚠️ 另有两组钉的是**文案口径**而不是算数：
卡片第三格是「**警报次数**」不是「警报」（`small` 是个裸字符串、**表达不了单复数**，
英文那边会印出 `Alarm 1 times`——真印出来过，见 §5.28 那一批），以及三格的抬头
**都是四字**（并列的三格，长短不一看着像没对齐）。

---

## 7. 提交前

`docs/09` §6 那张表就是本节，**四条都过才算做完**：

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota
bash tools/doc-sync-check.sh                                          # 文档同步 + 行数上限
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test          # §6
podman exec -u 1000 -w "$PWD" tauri-dev npx tsc --noEmit
podman exec -u 1000 -w "$PWD" tauri-dev npx vite build
```

⚠️ **前三条过了不代表性对。** `doc-sync-check.sh` 是启发式的，只抓结构性漂移
（行数、mtime、引用是否存在），**抓不到"文档里的语义写错了"**。它筛不出来的那几类
列在 `docs/09` §5。

### 5.30 ⚠️⚠️ 前端走的是**开发服务器那条 URL**，不是 `dist/`（2026-09-27 晚更正）

⚠️ **本节 2026-09-26 写错过一次**——原来那句是「直接跑二进制吃的是 `dist/`，改了前端就必须
`npm run build`」，**结论是反的**。当时那件事本身没记错（改完 `src/` 里的东西、重启实例，
行为一点没变），错的是**归因**。下面按 2026-09-27 晚在真窗口上量到的三条判据更正，
**错的那句留在本节末尾，免得下次又照着它推**。

**症状**：改完 `src/` 里的东西，重启实例，**行为一点没变**。看着像"代码写错了"，
于是去改代码——改得更错。当时连着布了三个探针（一个 `getMarkdown` 早退、两个
序列化分支），**一个都没出现在产物里**，才回头去查这件事。

**根因：真正的开关是一个 Cargo 特性，不是构建档位**——`custom-protocol`：

- `tauri-2.11.6/build.rs`：`let dev = !has_feature("custom-protocol"); println!("cargo:dev={dev}")`；
- `tauri-build-2.6.3::is_dev()` 读的就是这个 `DEP_TAURI_DEV`；
- `tauri::is_dev() = !cfg!(feature = "custom-protocol")`；
- `manager/mod.rs::get_app_url`：`#[cfg(dev)]` 走 `devUrl`，否则才轮到 `frontendDist`、再兜底 `tauri://localhost`。

⚠️ **本仓 `src-tauri/Cargo.toml` 里根本没有 `[features]` 段**（`strings` 也能佐证：编出来的
二进制里带着 `http://localhost:5273`）⇒ `custom-protocol` 永远不亮 ⇒ `cfg(dev)` **恒真**
⇒ **调试版和 `--release` 版都去连 `devUrl`**，**跟 `dist/` 没有一点关系**。

**当场可复现的三条判据**（都只读）：

```sh
ss -tnp | grep 5273                             # 实例的 WebKitNetworkPr 与 [::1]:5273 是 ESTABLISHED
curl -s http://localhost:5273/ | head -5        # 回来的是 dev HTML：里面看得见 /@react-refresh、/@vite/client
grep -o 'assets/index-[^"]*' dist/index.html    # dist/ 那份引用 /assets/index-<hash>.js，与上面不是同一个文件
```

⇒ **裸二进制要能起来，vite 必须在 5273 上听着**（`vite.config.ts` 的 `strictPort: true`
钉死这个端口，`package.json` 的 `"dev": "vite"`）。**不是**"必须 `npm run build`"。

⚠️ **那 2026-09-26 那次是怎么坑的？** 当时布的三个探针在 `dist/assets/*.js` 里一个都没有——
**那只证明"构建从没跑过"**，证明不了"屏幕上那个旧行为是旧包造成的"。当时那件事的成因到
今天也没再复现，所以**别再拿"吃 `dist/`"去解释任何一次"改了没生效"**（下面那条
`tsc` 拦构建倒是真的，先查它）。

**仍然成立的那一半（`tsc` 能把整条构建拦下）**：`npm run build` 的脚本是 **`tsc --noEmit && vite build`**。
`tsc` 失败 ⇒ **`vite build` 根本不跑** ⇒ 退出码非 0、`dist/` 时间戳一动不动。
当时摘掉一行 `.use(...)` 却忘了摘对应的 `import`，`tsc` 报 TS6133（声明未使用），
**整条构建被拦下**，而屏幕上只看到"构建失败了"几个字，
`dist/` 还是上一版——于是"A/B 实验"的两侧跑的其实是同一份代码。

**自检（养成习惯）**：

```sh
curl -s http://localhost:5273/ | grep -c '@vite/client'   # 1 = dev 那份在听着，屏幕上就是它
npm run build                                             # 类型闸门 ＋ 打包产物（发布/打包才需要）
```

⚠️ 想确认"屏幕上那一版是不是我刚改的"，**看 5273 那个 URL，别去翻 `dist/`**。
反过来，想确认"打包产物里有没有我这一版"，才看 `dist/` 与 `npm run build` 的退出码。

⚠️ **本节原来那句错的**（留着当反例）："**直接跑二进制 = 认准 `dist/`**，想省掉构建就
只能用 `npm run tauri dev`"。真相是反的：**裸二进制连的就是 dev URL**，所以
"vite 没在 5273 上听着"才是它起不来/白屏的原因，而不是"没跑 `npm run build`"。

### 5.31 验「空段落不写 `<br />`」与「标题行首退格」（2026-09-26 第二轮）

这两条都要**在编辑器里真的敲**，不能拿现成的文件去开——理由如下。

**① 空段落**

⚠️ **反例陷阱**：拿一个内容是 `甲\n\n<br />\n\n乙` 的**文件**去打开再存盘，
是**测不出来**的——解析侧的 `remarkPreserveEmptyLinePlugin` 在装载时就把那行
`<br />` 摘掉了，文档里根本没有空段落。**必须在编辑器里敲出来**：

```sh
xdotool type "甲"; xdotool key Return; xdotool key Return; xdotool type "乙"
xdotool key ctrl+s
od -c <文件>          # 期望 甲\n\n乙\n —— 出现 <br /> 就是没生效
```

**② 空文档这一侧同样要验**，而且**要看分屏右栏**：

```sh
: > 空.md             # 真正的 0 字节（新建文档就长这样）
# 打开它，看右栏
```

- 右栏显示「Write your Markdown here…」= 正常；
- 右栏**停在「正在准备编辑器…」**（可能只剩残影）= **序列化崩了**。
  ⚠️ 这个故障**不弹错误框**、左栏还是好的，只在右栏露馅——只看左栏会漏掉。
  它对应的堆栈是 `mdast-util-to-markdown` root handler 的
  `undefined is not an object (evaluating 'node.children.some')`。
- 再敲一个字、删掉、`Ctrl+S`：文件应当是 **0 字节**（不是 `<br />`）。

**③ A/B 的正确做法**（这一批踩过两次坑）：

摘 `.use(X)` 时**必须同时摘掉 `X` 的 `import`**，否则 `tsc --noEmit` 报 TS6133
把整条构建拦下，`dist/` 不动，A/B 两侧变成同一份代码（详见 §5.30）。
**每次改完先看 `dist/assets/index-*.js` 的时间戳变了没有**，再启动。

### 5.29b 验「写作统计」的「一轮」（2026-09-26 第二轮，**无头 ＋ 开窗各一遍**）

用户第二轮的原话：「心电图参考运动手表的运动记录。有一个开始、暂停、终止。」
这一批把插件从"面板开着就一直跑"改成**显式的四个状态**（`idle` / `running` /
`paused` / `done`），面板上多出「开始记录 / 暂停 / 继续 / 终止 / 再来一轮」五颗按钮。

**① 无头那一遍（主力）——`tools/stats-state-test.lua`**

```sh
podman exec -u 1000 -w "$PWD" tauri-dev lua tools/stats-state-test.lua
# → ALL PASS（22 组、170 条断言，几毫秒；
#   数法：grep -c '^-- (' ＝ 组数、grep -c '^  ok' ＝ 断言数——
#   脚本自己不报总数，所以这两个数是数出来的）
```

⚠️ **必须从仓库根跑**（脚本按自己的位置算路径），而 2026-09-27 插件拆出
`plugins/stats/ticks.lua` 之后，脚本开头多了一行 `package.path`：宿主那个 `require`
是**沙箱里**的（只在插件自己目录里找），而这里跑的是**真的 Lua `require`**，不自己
加搜索路径就会报 `module 'ticks' not found`。同一处还清掉了 `package.loaded.ticks`
——沙箱里每加载一份插件就是一份新的 Lua（`lua/mod.rs` 一次 `硬化的_lua()`），
缓存本来就不跨实例，不清的话第二份实例会拿到第一份那个已经绑好译文的模块。

⚠️ **为什么主力是它而不是开窗**：这一批的行为全在"**时间怎么走**"上，而
`GAP_MS`（15 秒断档）与 `MIN_SPAN_MS`（10 秒不出数）两条分支**靠手点摆不出来**
——那得掐着秒表点。桩掉 `nota` 之后时钟由测试自己推，每条分支都能精确摆到。
它覆盖：四个状态的按钮、本轮字数/时长的累加、**换文档自动暂停**、
**暂停期间打字不算**、**断档只累加不落点不算峰值**、终止结算、
`done` 不再累加、再来一轮清零、以及**暂停时大数字冻住**。

⚠️ 桩里 `i18n.text` 一律返回 `nil`（插件那条 `T()` 拿不到译文就退回原文），
所以断言里写的是 `main.lua` 里的中文原文——**改文案要同批改这个测试**。

⚠️⚠️ **它当场抓到一个开窗看不出来的 bug**：大数字在暂停时本该冻住，第一版写成
"算得出就用算的"，而暂停期间样本一个都没删、滑动窗口又按 `now` 算，于是那个数
在用户眼皮底下自己往下掉（开窗实测 69 → 53，还在降）。开窗那一帧看着"正常"
——**这种 bug 只有把两条时间线摆开才看得见**。测试第 (10) 段就是它的回归测试。

**② 开窗那一遍（管"画得对不对"）**

跑法同 §5.29（隔离 `XDG_*` ＋ Xvfb :95 ＋ `import -window root`）。这一遍要看的是
无头测试管不到的东西：**布局、文案、按钮的样子**。四个屏各截一张：

| 屏 | 该看到什么 |
|---|---|
| `idle` | 一句「还没开始。按「开始记录」，这一轮写了多少字、用了多久、什么速度，就都算起来了。」＋ 整份文档的字数 ＋ 一颗蓝色的「开始记录」，**没有曲线** |
| `running` | 大红字（最近一分钟）＋ 曲线 ＋ 四格 ＋「暂停」「终止」 |
| `paused` | 同上，但大字**定住不动**，多一行「已暂停。这期间打的字不算进这一轮——按「继续」接着算。」，按钮变「继续」「终止」 |
| `done` | 标签变「本轮平均速度」，大字是**整轮**平均，多一行「这一轮，你写下了 N 个字。」，按钮只剩「再来一轮」 |

⚠️ **点按钮只要坐标对，不需要焦点**（鼠标事件按坐标派发，§5.10）；但**打字要焦点**，
而且**输入法那三个变量一个都不能少**（§5.11 陷阱三），否则 `xdotool type` 打进去的
中文会被 `fcitx5` 吃掉。

⚠️ 窗口位置每次起都可能不同（这一次是 `150,70`）。**页签/按钮的中心先量再用**：
把截图裁一条放大（`magick 截图.png -crop 300x34+X+Y +repage -scale 400% 出.png`），
照着眼点。这一批第一次点页签就是**点在两颗页签之间的空白上**，看着像"点了没反应"。

⚠️ **曲线在"一个采样点都没有 / 跨度是 0"时是一条压在中线上的横线 ＋ 底下一块
面积填充**（`PanelBody.tsx` 的 `跨度 > 0 ? … : 0.5` —— 那是刻意的："一直平着"
不能画成"掉到零了"）。初看像"涂了一整块粉色"，**去改之前先读那一段注释**。

---

### 5.32 验「心电图分享图（两档范围）」与「横纵刻度」（2026-09-27，**已开窗、读过错盘的 PNG 字节**）

用户这一天的两句：「**分享支持全日状态，也应该支持某一次的记录的状态**」与
「**另外横纵坐标的刻度要标，现在是没有的**」。代码那一半当天写完，
**这一节是那批欠下的界面判据**（`docs/07` 第 65 项第三轮写着「⚠️ 开窗目检还没有做，
本批的界面判据是空的，如实记在这里」——就是这一节补的）。

跑法与 §5.29 同源：**Xvfb 在容器里**（`Xvfb :95`，`xdotool` 也只有容器里有）、
**截图在宿主上取**（两边 `/tmp/.X11-unix` 是同一个，`DISPLAY=:95 magick import -window root`），
隔离的 `XDG_CONFIG_HOME=/tmp/nota-vis/config`、`XDG_DATA_HOME=/tmp/nota-vis/data`。

⚠️ **两件容易忘的事**：①`GDK_BACKEND=x11` ＋ `WAYLAND_DISPLAY=none`（不然连不上 Xvfb）；
②**输入法那三个变量**（`GTK_IM_MODULE=gtk-im-context-simple` / `XMODIFIERS=@im=none`），
少了它们 `xdotool type` 打进去的中文会被宿主的 `fcitx5` 吃掉。⚠️ 这一批**不需要打字**
（`days.txt` 里已经有当天那一行），所以只用到点击。

**① 两档范围：两颗按钮都在，而且都带 `needs`**

面板上「开始记录」旁边是「制作今日分享图」，点下去出现的是**今日**那张卡
（三格是「今日写了 34 字 / 今日时长 1:42 / 今日峰值 2038 字/分」，标题下那行是
「今天，你写下了 34 个字」）。本轮那颗按钮只在 `done` 那一屏出现（§5.29b 那四屏）。

⚠️ **验到的一处"该没有就没有"**：这一遍的实例在**当天还没有账目**时，「制作今日分享图」
**根本不出现**（不是灰的）。两颗按钮的 `needs` 都真实生效。

**② 存盘：真文件、真尺寸、真字节**

| 作用域 | 界面上按的 | 落盘 | 尺寸 | 字节 |
|---|---|---|---|---|
| 本轮 | 「制作分享图」→「保存为图片」 | `nota-stats-round-<时间戳>.png` | 1080×1350 | **128,634** |
| 今日 | 「制作今日分享图」→「保存为图片」 | `nota-stats-day-2026-09-27.png` | 1080×1350 | **113,050** |
| 今日 | 同上 →「复制到剪贴板」 | 剪贴板里的 `image/png` | — | **113,050**（与上一条**逐字节相同**） |

⚠️ 存盘对话框里**默认文件名**就是插件建议的那个（`nota-stats-day-2026-09-27.png`），
所以"建议名 → 消毒 → 落到文件名"这条链整条在真窗口里走通了。
⚠️ **剪贴板那一条是这次最值的一格**：它证明了「预览 / 存盘 / 剪贴板**是同一个函数**」
——不是"我看预览画得对"这种间接判断，是**两份字节完全相等**。
⚠️ 取剪贴板用容器里的 `xclip -selection clipboard -t image/png -o`（`TARGETS` 里
真列着 `image/png`）。⚠️ **只读了字节数，没有解码**（诚实记一笔）。
⚠️ `nota.data` 的落点也顺手核过：`<XDG_DATA_HOME>/nota/plugin-data/nota.stats/days.txt`，
当天那两行是 `d 2026-09-27 34 102385 2038 1` / `m 2026-09-27 695 34`（与面板上的数同口径）。

**③ 两套配色：一次 A/B，用像素说话**

`当前卡色()` 读的是 `<html data-ui-mode>`，所以换个明暗就能把另一半走一遍：

| 界面明暗 | 存的哪张 | 大数字与曲线的颜色（**从 PNG 里数的**） |
|---|---|---|
| 深（`ui_mode` 默认 `auto`，这台机器落到深） | `round.png` / `day.png` | `#4F82FB`（11,808 个像素） |
| 浅（把隔离配置里写成 `ui_mode = "light"`、重启） | `light-day.png`（91,798 字节） | `#2F63D8`（11,913 个像素） |

⚠️ 数法：`magick 卡.png -crop 500x200+120+250 +repage -colors 16 -format %c histogram:info:-`
——那一块正好罩着大数字，量化到 16 色之后**头两名就是底色和强调色**，取的就是它。
⚠️ 这一步**必须换明暗重启**才有意义：写成"浅色那套常量看着也对"不算数，要的是
**同一个 `<html data-ui-mode>` 真的换了、卡片跟着换**。⚠️ 顺带钉住的两条：
副标题在真图里是 **`WRITING STATS`**（设计稿的 `text-transform:uppercase` 由渲染层补的，
SVG 不认那个属性），浅色那张的三格指标、页脚、`Nota` 标识都在位。

**④ 横纵刻度：一个真错、一个真错位**

- **错一（数错十倍）**：开窗看纵轴刻度时发现中线那档写的是 `11`，而它该是 `110`。
  根因是 `格式化数` 去尾零的正则把**整数末尾的零**也吃了（`(109.5).toFixed(0)` → `"110"`
  → `"11"`）。⚠️ **图看着一点没变**——这是"标着 11 的线其实在 110"那种坏，
  只能靠**盯着那个数**发现。回归用例已进 `tests/chart-ticks.test.ts`（那 4 条是**它头四条**，
  该文件现在共 **12 条**）。
- **错二（横轴标签整排偏左）**：`.panel-chart-xticks` 的每一档是 `position:absolute`，
  而绝对定位元素的包含块是父元素的**内边距盒**——那条"让开纵轴边栏 34px"的
  `padding-left` **对它完全无效**。这一条是**量出来的**，不是看出来的：

  | 档 | 修之前（相对曲线起点的列偏移） | 修之后 |
  |---|---|---|
  | 第一档（`at:0`，`start` 锚） | **+34px**（整整一条边栏） | 0 |
  | 中间那档（`at:0.5`，`middle` 锚） | **+17px**（错一半——锚在中间，只偏半个边栏） | 0 |
  | 最后一档（`at:1`，`end` 锚） | 0（`right` 那侧本来就不受左边距影响） | 0 |

  ⚠️ **中间那档错一半**这件事本身就是判据：如果三档错的量一样，那更可能是"整排平移"；
  错量随锚点而变，指的就是**左边距没让开**。改法是 `padding-left` → `margin-left`
  （`src/styles/dock.css` 那条 `.panel-chart-xticks`，注释就地写着）。

**⑤ 这一遍顺手牵出来的两处设计稿保真度问题**（都不在用户那两句话里，是照着设计稿对出来的）

1. **深色卡的强调色原来是浅色那个值**——设计稿两个 `.html` 里的 `--accent` 本来就
   不是同一个值（深 `#4f82fb` / 浅 `#2f63d8`），代码里两套都写成了 `#2f63d8`，
   于是深色卡的大数字与曲线比设计稿**暗一档**。照设计稿改回，并加了一组用例
   （「两套强调色不许是同一个值」）。
2. **副标题少了 `uppercase`**——设计稿靠 CSS，SVG 的 `<text>` 不认，照原样送就少一档。
   改由渲染层转（插件继续送人能读的 `Writing Stats`）。

**⑥ 这一遍的诚实缺口**（不要读成"都验过了"）

- **面板上那一排刻度的字没有被逐字读过**：验证靠的是**列偏移的数值对账**（上表）
  与缩放截图目视，没有把每一档的文案抄下来核对。
- **剪贴板只读了 `TARGETS` 与字节数**，没有把 PNG 解出来看。
- **浅色那张是在"重启后的干净实例"上验的**（要改 `ui_mode` 只能重启），
  所以它验的是"这一整套色对不对"，**没有**验"开着面板切明暗会不会实时跟着换"
  （那条靠 `PanelBody` 里那个 `MutationObserver`，只有代码可读，没有界面判据）。
- **本轮那张卡的两套配色只验了深色那一半**（浅色那一遍只做了今日那张）。
- ⚠️ **`magick` 能直接渲染 SVG**（这台机器上挂着 librsvg）：想在真开窗之前先看
  "这张 SVG 长什么样"，`magick in.svg out.png` 比开窗快得多。⚠️ 但那条路**量不了
  真界面的字宽**——卡片的量宽有两种（真 canvas / `估宽` 兜底），
  用 `magick -density 72 pango:'…'` 量出来的 advance 与卡片自己量的能差几个像素，
  所以**位置这件事仍然以开窗截图为准**。

---

### 5.33 验「文件重命名 / 移动」（2026-09-27，**没开窗，只有无头那一半**）

`docs/07` 第 77 项、`docs/10` §2 那格。**如实说：这一批的界面判据是空的**——
下面「① 无头」那一半真跑了，**「② 开窗」那一半一次都没跑过**（所以那格填的是 🟡）。

**① 无头（已跑，任何一次改这一带都要跑）**

```sh
podman exec -u 1000 -w "$PWD" tauri-dev cargo test --lib --manifest-path src-tauri/Cargo.toml
```

⚠️ **`-u 1000` 不能省**（`-u 0` 会在 `/tmp` 里留下 root 文件，之后所有 `-u 1000` 的跑法
报 `PermissionDenied`，看着像回归）。本批收尾值是 **490 passed / 0 failed**，其中这一项
**19 条**：`file_move.rs` 12 · `document/mod.rs` 3 · `session.rs` 2 · `table_width.rs` 2。

⚠️ **其中一条是"真跨设备"的，它会真的往 `/dev/shm` 里写东西**（`/tmp` 与 `/dev/shm`
在这台机器上是两个设备：dev 50 与 dev 27）。它验的是"`rename` 报 `EXDEV` 时那条回退路
走得通"，**换一台机器（比如 `/tmp` 与 `$HOME` 同一个设备）它会静默变成一次普通的 `rename`**
——用例里写明了这一点，所以别把"跑绿了"当成"回退路验过了"。

```sh
stat -c '%d %n' /tmp /dev/shm   # 两个数不同 = 这条用例真的在验回退
```

**② 开窗（⚠️ 没做，留在这里给下一次）**

跑法与 §5.32 同源（Xvfb 在容器里、截图在宿主上取、`GDK_BACKEND=x11` ＋ 那三个输入法变量）。
要找的四件事，**判据全是盘上的字节与文件名**（不是界面提示条）：

1. **改名**：菜单「文件 → 重命名…」，框里**预填着当前文件名并且是全选的**，
   改成 `b.md` 回车 → 那个目录里 `a.md` 没了、`b.md` 在，**内容逐字节不变**
   （`sha256sum` 对一下）；标签上的标题跟着变成 `b`。
2. **移动**：菜单「文件 → 移动…」，挑一个别的目录 → 文件真的过去了，**文件名没变**。
3. **重名被拒**：目标目录里先放一个 `b.md`，再改名 → **提示条报错，而 `a.md` 一个字节都没动**
   （这条最容易验错：要**回头看源文件还在不在**，只看"报错了"不够）。
4. **带着未保存改动改名**：打几个字（不存）→ 改名 → 标签上的「•」**还在**
   （`dirty` 不许被清掉），再 `Ctrl+S` → 写进的是**新名字那个文件**。

⚠️ **顺手值得看一眼的两处**：改完名之后「最近文件」那一页（侧栏第三页）里那条
**跟没跟着改名**；以及改名前滚动到文档中间、改名后**滚动位置还在不在**。
两处的实现都是"失败只记日志、不拦改名"，所以它们在界面上的表现是**这次改名成功了、
但那两笔账没跟上**——那种失败**不报错**，只能靠看。

---

### 5.34 验「改键位 ＋ 启动三档 ＋ 标签页右键开新窗口」（2026-09-27，**没开窗，只有无头那一半**）

用户 2026-09-27 点名要的三件（原话「**那你就不用做了，只搞一个标签页就好。标签页支持
右键之后选择在新窗口中打开。不用考虑拖回来的情况了。btw，有一个内容就是允许用户选择
新启动的时候，"打开上次打开过的文件和目录"。总共有三个选项……**」），外加此前拍板的
「快捷键自定义」。`docs/07` 第 80 项 ＋ 第 45 项 ③、`docs/10` §2/§5 那两格 ＋ §11.2。

⚠️ **如实说：这三件一次窗都没开过**——所以 `docs/07` §1 那三行与 `docs/10` 那两格
填的都是 🟡，不是 ✅。下面「① 无头」那一半真跑了（三件都跑），
**「② 开窗」那一半一次都没跑**。

**① 无头（已跑，任何一次改这一带都要跑）**

```sh
# Rust 那一半（§6 的 505 条，本批占 16 条）
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test --lib

# 前端那一半：本批新建的 keymap 那一份（要别名，且只要别名）
npx esbuild tests/keymap.test.ts --bundle --platform=node --format=esm \
  --alias:@=./src --outfile=/tmp/nota-测试/keymap.mjs && node /tmp/nota-测试/keymap.mjs
```

⚠️ **`-u 1000` 不能省**（同 §5.33：`-u 0` 会在 `/tmp` 里留下 root 文件，
之后所有 `-u 1000` 的跑法报 `PermissionDenied`，看着像回归）。

本批这 **16 条 Rust 用例**分在三处，各自钉的东西不一样：

| 文件 | 条 | 钉住什么 |
|---|---|---|
| `cli.rs` | 12 → **16** | `--new-window` **认得出来**：位置不拘、**整串**相等（`--new-windowish` 不算）、零号参数（程序自己的路径）不算选项、它**不妨碍**同一行里挑出要打开的文件 |
| `settings/keys.rs` | **5** | 键位覆盖**怎么存**：只存差量、空串与"不在表里"是两件事（`[keys.overrides]` 是**一层套一层**的表）、老设置文件没有这一节也读得出来、改过的键位能存能读 |
| `settings/files.rs` 4 ＋ `session.rs` 3 | **7** | 启动三档**读得对**：`startup` 三个取值、`Default` 是第一档、**老取值 `folder` 还能读成第三档**（`alias`，见下）；以及工作区那三条"接上哪个目录／空目录／失败不掀翻启动" |

⚠️ **为什么老取值那条要单独留一条用例**：第三档 2026-09-27 从 `folder` 改名成
`last-session`（老名字说的是"打开文件夹"，而它真正干的是"连文件带文件夹一起接上"
——按老名字实现的话，第三档会比第二档**少**恢复标签）。但用户盘上那份 `settings.toml`
里可能**已经存着** `startup = "folder"`（设置页那三档一直是可点的，只是点了没用）。
`#[serde(alias = "folder")]` 就是为这个留的：删掉它，那一份设置**整份读不出来**，
宿主会走"留一份备份 + 退回默认"，用户看到的是"我的偏好全没了"。

前端那一半 `tests/keymap.test.ts` **54 条**，三组判据（逐条写在文件头）：
`accelToText` 写出来的文本**能被 `parseAccel` 读回来**（读不回来 ＝ 用户改完重启静默失效）／
三种"不该绑"（光按修饰键、写不回去的键名、不带修饰的单字符）／覆盖表怎么叠到菜单上
（没改过、换成别的、**空串＝摘掉**、认不出的 id）。

⚠️ **这两半各自证明不了什么，别把"绿了"当"能用"**：
`keymap` 那份测的是"从一条 `Accel` 到文本"，**"真按一下键会怎么样"它一条都没碰**
（录制那段是 `ShortcutsPane` 里的一个 `window.addEventListener("keydown", …)`，
要真 DOM ＋ 真键盘事件）；撞车提示、录制态样式、按钮该不该出现，也都在它之外。
Rust 那 16 条钉的是**解析与存盘**，不碰界面。启动三档的主战场其实是前端的
`ui/useStartup.ts`（它现在读这一档、当入参递给 `接上会话`）——**那一段没有单元测试**，
理由同 §6.2 那条"前端"空白（没有测试运行器，`useStartup` 要真 `invoke`）。

**② 开窗（✅ 2026-09-27 晚跑完；下面 A/B/C 三张单子已逐条走过一遍）**

跑法与 §5.26 那套同源（Xvfb `:93` 起在容器里、隔离 `XDG_CONFIG_HOME`/`XDG_DATA_HOME`/
`XDG_CACHE_HOME` 到 `/tmp/nota-534/…`、只按 pidfile 里的号杀）。⚠️ **隔离不能省**：容器把
`/home/lqy` 直接挂进去，不隔离就是在**改用户真实的那份 `settings.toml`**——而这三件
**恰好全是改设置文件的**。

⚠️ **与那套跑法有一处出入，如实记**：这一轮**往自己的 Xvfb `:93` 发过合成按键**
（`xdotool type` / `xdotool key`）。§5.26 那句"不发合成按键"是**对用户那台 `:0`** 说的，
那条禁令**一个字没变**（永远不碰 `:0`、不碰别的会话的 `:94`/`:95`）。声音照旧：
**一次都没放**（`[focus] sound` 这一轮压根没碰）。⚠️ 工装另外三条坑：`xdotool type`
打不出多字节（文件名只能用 ASCII）、**没有窗口管理器**（`xdotool windowfocus` 报
BadMatch；按键要落在 webview 上得让指针停在它上面）、GTK 窗格约 **560px 最小宽度**。

**这一轮的三条硬结果**（逐条证据在第 ③ 段）：

- **A（改键位）**：八条**全部**在窗口里走过——那一页把没键位的命令也列出来、按下「录制」
  进听键态、敲一个**已被占用的键当场被拒**并说出这个键位现在归谁、改完**按新键位命令真跑**、
  **重启还在**、单条重置、清空成「未设置」、全部恢复默认；收工盘上 `[keys.overrides]`
  **只留差量**。
- **B（启动三档）**：三档**各重启一次**全部符合——第一档白纸一张且「打开最近文件」
  一条不少、第二档标签连顺序与前台都照旧且侧栏没有那棵树、第三档连工作区一起回来；
  老值 `startup = "folder"` 也真读成第三档。⚠️ **第一步换成了手写侧车**：工装里 GTK 那个
  选文件夹的框驱动不动（`Ctrl+O` ＋ `Ctrl+L` 手打路径弹「无法显示文件夹内容」），
  所以工作区是**手写进隔离侧车 `session.toml` 的 `workspace`**，不是从界面开出来的——
  被判的那一半（`ui/useStartup.ts` 怎么用这一档）不受影响。
- **C（标签右键）**：`ps` 里真多出 `--new-window /tmp/nota-534/doc/丙.md` 的进程、
  两窗各开着那一份、没路径的标签那一条是灰的、没有 WebKit 自带菜单抢戏、
  点外面 / Esc / 改窗口大小都关得掉。⚠️ **C-7（贴右边缘往回收）没量到**，理由见那一条。

**A. 改键位（设置 → 「快捷键」那一页）**

1. **列的是全部可绑定的命令**，不只是已经有键位的：没键位的显示「未设置」，
   一样按菜单分组，全局搜索框也搜得到。⚠️ 子菜单父项（「导出」本身那种）与合成条目
   （主题、最近文件）**不该出现**。
2. **条目和键位是读出来的**：先把某条改了、再回这一页看，显示的是**改过之后**的键位
   （不是出厂那个）。macOS 上该显示 `⌘⇧C` 而不是 `Ctrl+Shift+C`。
3. **录制**：点「改键位」→ 按一组新键 → 当场显示新的键位文本；**光按一个修饰键、
   按一个写不回去的键名、按一个不带修饰的单字符**——这三样都该被拒（不静默存下来）。
4. **撞车当场拒绝**：按一个**已经归别人**的键位 → 弹的那句话要**说出这个键位现在归谁**，
   并且**没有**改成功。⚠️ 这条是本页最要紧的一条：静默归了别人的话，用户会以为
   "改成功了"，按下去却跑了另一个命令——**界面在骗他**。
   ⚠️ 有意的取舍：**两条命令不能交换键位**（想换得先清掉一条），别把这条当缺陷。
5. **真按下去命令真跑**：改完把窗口关掉、重新起一个（不是重启应用也行，见下），
   **按新键位**那条命令真执行（挑一条看得见效果的，比如「粗体」）。
6. **重启还在**：退出 → 再起 → 新键位仍然生效；盘上 `settings.toml` 里
   `[keys.overrides]` 那一节**只有你动过的那几条**（是差量，不是整张表）。
7. **空串 ＝ 摘掉**：把某条的键位清掉 → 显示「未设置」，而且**老键位按下去不再触发**。
8. **「全部恢复默认」**：那一节被清空、表回到出厂键位。

**B. 启动三档（设置 → 「文件」→「启动选项」）**

先造状态，再逐档验：开 `a.md` 与 `b.md` 两个标签、把前台切到 `b.md`、
打开一个文件夹当工作区 → 退出。然后**只改 `startup` 这一项**，逐档重启：

| 档（界面上的字） | 起来之后该看到什么 |
|---|---|
| **打开空白文档**（默认） | 一个空白文档（不是"什么都没有"），侧栏**没有**那棵树 |
| **恢复上次打开的文件** | `a.md` 与 `b.md` **都在**、**顺序与前台**都照旧，侧栏**没有**那棵树 |
| **恢复上次的文件和文件夹** | 上面那两样 **＋** 侧栏那棵树 |

⚠️ **两处最容易漏的**：**① 第一档底下「打开最近文件」不该是空的**（"不恢复上次的"
说的是自动恢复，不是把记录清了）；**② 第三档改名这件事**——手改 `settings.toml`
写成老值 `startup = "folder"`，起来之后该是**第三档**（`alias` 那条用例管的）。
⚠️ **顺带要说清一个行为变更**：2026-09-27 之前这三档是**摆设**（没有一处读它，而前端
无条件恢复标签与工作区 ＝ 永远按第三档办）。所以"从没动过这一项"的人，升级后启动
从"什么都有"变成"一张白纸"——**那是第一档，也是 `StartupAction::default()` 一直以来的值**，
是用户点名要的。这一条值得在窗口里**亲眼确认一次**，因为它改的是每个人每天第一次看到的东西。

**C. 标签页右键 →「在新窗口中打开」**

1. 右键一个**有路径的**标签 → 弹出一条菜单，只有「在新窗口中打开」这一条。
2. 点它 → 进程表里多一个**带 `--new-window`** 的进程：
   `ps -eo pid,args | grep nota | grep -v grep`（⚠️ **别用 `pgrep -f`**，容器与宿主
   共用 PID 命名空间，宽泛匹配会伤到**别的会话**和用户自己的实例）。
3. 新窗口里**开着那一份**（文件名与内容一致），而**原窗口里那一份照旧开着、一个字节没动**
   ——这条菜单**不是"把标签搬过去"**：新窗口是**另一个进程**，两边文档表各自独立。
4. ⚠️ **新窗口那一份不持有单实例 socket**：再**普通**启动一次，转交给的仍然是**第一份**
   （不是这个新窗口）。例外**只开在 `lib.rs`**（`cli::要开新窗口(…)` 为真就跳过抢占），
   `single_instance.rs` 一行没动。代价写在 `docs/09` / `docs/10` 里：新窗口收不到
   `nota:second-instance`。
5. 右键一个**没有路径的**标签（新建的、从没存过盘的）→ 那一条**是灰的**。
   判据在 `TabBar.tsx` 的 `开菜单` 里，宿主那边（`commands/window.rs`）**也判一次**——
   命令是对外开着的一条路，别指望调用方都守规矩。
6. ⚠️ 右键时**没有 WebKitGTK 自带菜单抢戏**（`onContextMenu` 里 `preventDefault()`），
   **也没有菜单栏的菜单跟着弹出来**。
7. ⚠️ **贴右边缘右键 → 菜单往回收**：**这一条在工装里没量到**（是"没量到"，不是"没有"）。
   没有窗口管理器时 GTK 给窗格定了大约 **560px 的最小宽度**——`xdotool windowsize … 250`
   被静默改成 560（`xdotool getwindowgeometry` 看得出来），而一两个标签的右键点永远够不到
   `window.innerWidth - 232`。代码（`TabBar.tsx::开菜单` 里那条 `Math.min`）与判据都在，
   等下次在**有窗口管理器**的机器上补量。
8. 点别处 / 按 Esc / 滚一下 / 改窗口大小 → 菜单关掉（`mousedown` 而不是 `click`、
   `resize` 与 `scroll` 各一个监听）。

⚠️ **锚点那个 CSS 是这一批最容易被"优化"坏的一处**：`.menu-popup` 自己带
`position: absolute; top: calc(100% + 5px)`，也就是"挂在菜单栏那一栏下面"；右键菜单
要落在**鼠标那一点**上，所以外面套了一个**零高度**的定点容器（`.tab-menu-anchor`）。
⚠️ **别给 `.app` 或任何祖先加 `transform` / `filter` / `contain`**——`position: fixed`
的祖先一旦有那三样，`fixed` 就不再相对视口，菜单会跑到别处去（今天 `.app` 只有
`position: relative`，是安全的）。

**③ 这一轮在窗口里撞出来的东西**（单子上没有、只有真起窗才看得见的）

**起窗第一件事：编辑器整块起不来**——界面上是「正在准备编辑器…」永远不停 ＋ 一条
「编辑器启动失败」的提示条。这就是 **BUG-46**：`$markSchema` / `$nodeSchema` 返回的是
**元组** `[schemaCtx, plugin]`，而前半截那个 ctx 元素**自己也是插件**，不把它 `.use()`
进去，名字就进不了 ctx 容器，`editor.create()` 抛 `Context "highlight" not found` 直接
终止。⚠️ **它藏得深有三条理由**：类型检查过得去；`tests/inline-marks.test.ts` 是直接
`一.ctx(ctx)` 调的，**绕过了 `.use()`**，所以测试全绿；失败提示**明明在屏幕上**，
只是没人去看。两处规格（`editor/inline-marks.ts` 的 mark 规格、`editor/html-block.ts`
的块级规格）都改了，⚠️ 那两处 `as unknown as` **不能删**。

**第二个：四个行内标记按钮全是死的**（**BUG-47**）——按下「高亮 / 上标 / 下标 / 下划线」
一个字都不变。根因是 `$command(key, cmd)` 返回**单插件**，`plugin.key = cmdKey` 与
`create(cmdKey, command)` 都写在**它自己的 body 里**，只有 `.use()` 过才会跑；没 `.use()`
就 `.key === undefined`，点下去在 `container.get(undefined)` 上 TypeError，而这声响
落在 `editor.action` 里、没有 try/catch，于是**界面上什么都没有**。修法是补一句
`.use(行内标记命令)`，**它不受设置里那个行内扩展开关管**（那颗开关管的是解析，
这四条是命令）。

**修完的复验（字节判据）**：拿一份内容正是 `abc`（4 字节）的文档，全选之后按一下键、
存盘、数字节——落盘 **8 / 11 / 6 / 6**，对应的正是 `==abc==` / `<u>abc</u>` / `^abc^`
/ `~abc~`（`Ctrl+Shift+H` / `Ctrl+U` / `Ctrl+.` / `Ctrl+Shift+.`），界面上黄底、
`<u>`、上标、下标也都画对了。

**同批量出来的两条边界**：

| 键 | 结果 |
|---|---|
| `Ctrl+Shift+H` / `Ctrl+U` / `Ctrl+.` / `Ctrl+Shift+.` | ✅ 都活（上面那四个字节增量） |
| `Ctrl+Z` | ✅ 撤销有效 |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+Shift+0` | ✅ 缩放 **100 → 110 → 120 → 100**，界面跟着变，WebKit 那条自带的整页缩放**没有**叠上来 |
| `Ctrl+B` / `Ctrl+I` | ❌ **WebKitGTK 在派发到 DOM 之前就吃掉了**（**BUG-49**）——`ui/useMenus.ts` 那条 `window.addEventListener("keydown", …)` 永远收不到；wry 不暴露 WebView 组件，GTK 那一层也拦不到。⚠️ **没有数据损坏**：存盘前后 `hello` 还是 `hello`（PM 的 DOM 观察者不吃 `<b>`） |

**顺带又看见一条老现象**（不是新缺陷）：**空白文档存盘落的是字面 `<br />` ＋ 换行**
（7 字节）——所以状态栏读「1 words 7 characters 2 lines」。这正是 §5.31 与 `docs/07`
里挂着的那条**待拍板项**（§5.31 那条判据写的是"应当是 0 字节"），证据这次补在这里。

⚠️ **单子上没被这一段点到的条目，当成"还没量"**——例如 C-6 的后半（右键时**菜单栏那份
菜单**会不会也跟着弹）、A-2 里 macOS 的 `⌘⇧C` 显示（这台机器没有 macOS）。
⚠️ 另：这一轮也顺手把 §5.30 那条**写错的**「直接跑二进制吃的是 `dist/`」更正了，
判据（`ss` / `curl` / `strings`）就在那一节里。
