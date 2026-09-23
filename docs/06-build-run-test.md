# 06 · 依赖、构建、运行、调试与测试

> 最后同步：2026-09-22
>
> 本文是 `AGENTS.md` §3 的**展开**。§3 给的是"三条命令"，这里讲**为什么是这三条**、
> 每一步踩过的坑、不接显示器怎么看界面、以及 `cargo test` 里那 55 条到底钉住了什么。
>
> ⚠️ **测试数只在本文记数（当前 55）**，别处一律写"见 `docs/06`"。
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
| `tauri-plugin-fs` | `2` | 前端直接读写文件的通道。⚠️ **注册了但没给权限**——`capabilities/default.json` 里**没有**它的任何 permission。原则写在那个文件的 `description` 里：能用我们自己的 `#[tauri::command]` 走通的，就不开插件权限 |
| `tauri-plugin-opener` | `2` | 用系统默认程序打开 URL。开了 `opener:allow-open-url` |
| `serde` / `serde_json` | `1` / `1` | 序列化。插件命令的入参出参走 JSON（`commands/plugin.rs` 文件头解释了为什么不定自定义类型） |
| `toml` | `0.9` | 读两个 TOML：插件清单 `plugin.toml` 与用户设置 `settings.toml` |
| `mlua` | `0.12`, features `["lua54", "vendored", "serialize", "send"]` | Lua 5.4 插件运行时。四个 feature 各有用处，逐条见 §1.4 之后那段 |
| `thiserror` | `2` | `NotaError` 的样板代码 |
| `dirs` | `6` | 探 XDG 目录。**只在 `paths.rs` 里用**——散落的 `dirs::config_dir()` 是将来换存法时最先烂掉的地方 |
| `notify` | `8` | ⚠️ **零引用**，见 §1.4 |
| `similar` | `3` | ⚠️ **零引用**，见 §1.4 |
| `shlex` | `1` | ⚠️ **零引用**，见 §1.4 |
| `tauri-build` | `2`（`[build-dependencies]`） | 构建期代码生成，`build.rs` 里就一句 `tauri_build::build()` |

#### `mlua` 的四个 feature，每一个都是必需的

| feature | 不加会怎样 |
|---|---|
| `lua54` | 默认是 Lua 5.5/最新；`Lua 5.4` 是我们对外承诺的版本（`AGENTS.md` §1） |
| `vendored` | 把 Lua 5.4 源码编进二进制，不依赖系统 `liblua`——**容器里根本没有 `liblua`** |
| `send` | ⚠️ **`Lua` 要放进 Tauri 的托管状态（跨线程），不加这个 feature 整个结构编不过**。而报错信息**不会提**"你需要 `send`"。这条也写在 `AGENTS.md` §4b |
| `serialize` | `commands/plugin.rs` 用 `mlua::LuaSerdeExt`（`to_value` / `from_value`）在 JSON 与 Lua 值之间转 |

### 1.3 npm 依赖（`package.json`）

| 包 | 干什么 |
|---|---|
| `@milkdown/kit` | 编辑器内核总包：ProseMirror + remark 的封装。`preset/commonmark`、`preset/gfm`、若干 `plugin/*` 都从它进 |
| `@milkdown/plugin-prism` | 代码块语法高亮。⚠️ **必须显式写进 `package.json`** ——它不在 `@milkdown/kit` 的 `exports` 转发表里，而且**不是** kit 的传递依赖，漏了就是一句 `Cannot find module`（`AGENTS.md` §4b） |
| `refractor` | `plugin-prism` 底下的高亮引擎（Prism 的 hast 封装）。⚠️ **2026-09-22 起成了"直接被使用"的包**：`src/editor/create.ts` 里有一句 `import "refractor/all"`，用来把语言表从 36 种补到 400 个名字。判据同 `plugin-prism`：`src/` 里有一句 `import "x"`，`x` 就得在 `package.json` 里 |
| `@milkdown/plugin-math` | 数学公式（内部带 `remark-math` 与 `katex`）。⚠️ **依赖装了、没有插入入口**，与图表同属 backlog 第 3 项 |
| `@milkdown/plugin-diagram` | Mermaid 图表。⚠️ 同上。**它也是那堆超大 chunk 的来源**（见 §4） |
| `katex` | 公式渲染。⚠️ **本行已过期过一次**：原文写的是"`src/` 里没有任何一处直接 import 它"。2026-09-22 起 `src/main.tsx` **确实 import 了它的样式**（`katex/dist/katex.min.css`）——那行之前是漏的，后果见 `docs/05` §2.2。列在 `package.json` 里的另一个作用是把版本钉在 `^0.16.11` |
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

| | `-u 0`（root） | `-u 1000`（你的用户） |
|---|---|---|
| 用途 | **只用来装包**（`dnf install`，免密） | **一切构建与运行** |
| 产物归属 | 归 root | 归你 |

用 root 构建的后果是 `src-tauri/target/` 与 `dist/` 里出现 root 拥有的文件，
**之后以 uid 1000 跑 `cargo build` 会因权限失败**——而报错长得像"编译错误"，
不像权限问题。修起来要整目录 `chown`。所以：**装包用 `-u 0`，其余一律 `-u 1000`。**

### 2.2 四条日常命令

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota

# ① 只编译后端 + 跑单元测试（§6 那 55 条）
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
而 ⚠️ **终端 stderr 里一句提示都没有**——所以这个坑不能靠日志发现，只能靠记性。
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
（`--target` 换了而已，SDK 是同一套）；而 macOS 那两格**必须分开**，
因为 `macos-13` 是 Intel 机器、`macos-latest` 是 Apple Silicon，
dmg 只能在对应的机器上打——**交叉那一步 Tauri 不做**。

所以落点是 `.github/workflows/release.yml`，六格矩阵。
⚠️ Linux 两格固定在 **`ubuntu-22.04`** 而不是 `ubuntu-latest`：
glibc 是**向前兼容、不向后兼容**的，在新系统上编的二进制在旧系统上会因为
找不到新符号而启动失败，22.04 是 Tauri 文档推荐的下限。

⚠️ 工作流里 **`--bundles` 一定要给**。配置里写的是 `"targets": "all"`，
在 Windows 上 `all` 会连 **MSI** 一起打，而我们要的是 exe 安装程序（NSIS）。
收包路径也**用的是产物目录**（`src-tauri/target/<三元组>/release/bundle/**`）
而不是 `target/release/bundle`——带 `--target` 时 Tauri 换目录，
写死路径在 CI 上会一个文件都收不到。

#### `bundle` 段里每一项为什么是那样

| 键 | 值 | 为什么 |
|---|---|---|
| `targets` | `"all"` | 本地想打哪种就打哪种（配合 `--bundles`），CI 上用 `--bundles` 收窄 |
| `category` | `"Productivity"` | ⚠️ **必须是 Tauri 2 那张枚举里的值**。可选项是 `Business` / `DeveloperTool` / `Education` / `GraphicsAndDesign` / `Music` / `Photography` / `Productivity` / `Utility` / … **没有 `Office`**。写错不会在 `cargo build` 时报——⚠️ **编到最后一刻**才 `failed to build bundler settings: invalid category`，等于白等一轮（见 §2.4 末尾那条实测） |
| `resources` | `{ "../plugins": "plugins" }` | **这就是 BUG-11 的修法**。⚠️ **键必须是目录、不能带 glob**——写成 `"../plugins/**/*"` 会打出**平的一片文件**，见下 |
| `icon` | 6 个（见 `icons/`） | Tauri 各平台各取所需：Windows 要 `.ico`、macOS 要 `.icns`、Linux 要 `.png` |
| `windows.nsis` | `languages: [SimpChinese, English]` + 语言选择器 | 中文用户双击安装看到中文。⚠️ 界面文案一律中文，但**安装器的是语言选择器**，两种都列出来让用户选 |
| `windows.nsis.installMode` | `currentUser` | 免 UAC 提权。装到用户目录，卸载干净 |
| `macOS.minimumSystemVersion` | `10.15` | 与 `tauri` 2.x 的 WebView 要求对齐 |
| `linux.deb.depends` | `libwebkit2gtk-4.1-0` / `libgtk-3-0` | Tauri 会自动填大部分，我们补的是**运行期真正要的那两个 soname** |
| `linux.rpm.depends` | `webkit2gtk4.1` / `gtk3` | 同上，rpm 的包名和 deb 不一样 |

#### 插件在打包后从哪儿扫（BUG-11，**已修**）

打包后内置插件的落点变了：从**资源目录**的 `plugins/` 里扫，不再是仓库根的
`plugins/`——这条分支在 `paths::builtin_plugins_dirs()`（`src-tauri/src/paths.rs:44`），
展开见 `docs/11` §插件放哪。

⚠️ **2026-09-23 之前这里是坏的**：`bundle` 段**没有 `resources` 键**，
那份 `plugins/` 根本不会被塞进包里，`resource_dir.join("plugins")` **永不命中**，
release 下也不走 `debug_assertions` 分支。**开发期看不出来**（走的是仓库目录），
只有真装一次包才会发现"一个内置插件都没有"。

⚠️⚠️ **修法改了三版，前两版都"看起来成了"**。这一节留着这条弯路，是因为**它的坑很隐蔽**：

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
`usr/lib/Nota/plugins/…`，它就是靠这一条骗过我的。**要看全量清单**
（`tar tf data.tar.gz`，不加管道）——平的布局在完整清单里一眼就露馅。
⚠️ **宿主是 Fedora，没有 `dpkg-deb`**（`command not found`），容器里也没有——
用 `ar` + `tar` 拆，`ar` 和 `tar` 都是标准工具。
⚠️ 这三版都发生在 **deb** 上；rpm / AppImage 走的是同一份 `bundle.resources`
与同一段 bundler 代码，**但没有逐平台验过**。

#### 图标：现在这四个是**占位的**

`icons/` 下那套由 `tools/gen-icons.py` 画出来（**纯标准库 zlib + struct，
不依赖 PIL**），画的是"带折角的便笺"。`.ico` / `.icns` 和 Windows Store 那几张
`Square*Logo.png` 是 `npx tauri icon` 从 PNG 派生的。

⚠️ **正式设计稿还没出**，所以现在这些都是占位符。拿到设计稿之后：

```sh
npx tauri icon <设计稿.png>      # 一次生成全套，含 icns / ico
rm -rf src-tauri/icons/android src-tauri/icons/ios   # 这两个我们不要
```

`tauri icon` 会把 `android/` 和 `ios/` 也一并生成，而 Nota 不做移动端，
留着只会让人以为我们有手机版。

#### Windows 交叉编译：**能编过，但出不了安装程序**

本机（Fedora）没有 Windows 工具链。实测的结论分三层，**第一层是最大的坑**。

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
看到 `cannot find macro panic` 别去翻代码，先看有没有 E0514。

⚠️ 而且 **msvc 在 Fedora 上无解**：`dnf list rust-std-static*` 里只有
`*-windows-gnu` / `wasm32*` / `none` / `uefi`，**没有任何 msvc**。
手动解进去的那份 std 现在挪到了容器的 `/root/msvc-std-rejected`（留个证据，别再装回去）。

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

后端**没有日志框架**，全部是 `eprintln!` 到 stderr，而且**只有五处**（全仓 grep 可得）。
它们就是排查插件问题时能拿到的全部信息，所以每一处都值得记住：

| 位置 | 打出什么 | 什么时候看它 |
|---|---|---|
| `src-tauri/src/lib.rs:60` | `[nota] 载入 N 个插件` | **启动第一句该看的**。N 比预期少，就是有插件没被扫到（清单读不了会另打一行） |
| `src-tauri/src/plugin/mod.rs:118` | `[nota] 插件清单读不了：{路径}：{原因}` | ⚠️ **清单解析失败的插件不会出现在插件列表里**，只在这里有一行。现象是"我装了插件但列表里没有它" |
| `src-tauri/src/lua/mod.rs:224` | `[nota] 插件 {id} 的 on_unload 出错：{e}` | 退出时。卸载报错只记不抛，不卡卸载流程 |
| `src-tauri/src/lua/api/mod.rs:49` | `[nota:{插件 id}] INFO/WARN/ERROR {消息}` | 插件的 `nota.log.*`。多插件同时刷输出时靠前缀分清是谁 |
| `src-tauri/src/lib.rs:41` | `[nota] 读设置失败，本次用默认值：{e}` | 一份坏掉的 `settings.toml` **不会**让应用打不开，只打这一行并退回默认值 |

### 3.2 前端打出来的那几行

| 位置 | 打出什么 |
|---|---|
| `src/App.tsx:95` | `[nota] frontendReady 失败：` —— 握手失败不影响使用，只记一笔 |
| `src/ui/ErrorBoundary.tsx:30` | `[nota] 渲染出错：` + `componentStack` |
| `src/ui/ErrorBoundary.tsx:64` | `[nota] 未处理的 Promise 拒绝：` |
| `src/ui/ErrorBoundary.tsx:67` | `[nota] 全局错误：` |

`installErrorHooks()` 在 `src/main.tsx` 里**在渲染之前**调——理由写在那个文件的注释里：
**打包后的应用没有 devtools，那时未捕获的 Promise 拒绝就是彻底静默的。**

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

⚠️ **Nota 没有 `FOLIO_*` 那一套自定义调试变量**（那边有十几个）。这里能拧的只有上表——
所以排查主要靠 §3.1 那五处 `eprintln!` 与 §5 的抓图。

### 3.5 前端热重载（HMR）

`npm run app` 时 vite 带 HMR：改 `src/**` 存盘即刷新，**不用重启 tauri**。

⚠️ **改 `plugins/**` 不在其列。** `vite.config.ts` 的 `server.watch.ignored` 明确忽略
`**/src-tauri/**`；而 `plugins/` 谁也盯不着。debug 构建确实会扫仓库根的 `plugins/`
（`paths.rs:54`，`cfg!(debug_assertions)` 那条分支），所以**改完 Lua 不用重编 Rust**
——但**要重启应用**，因为插件只在 `setup()` 里加载一次
（`lib.rs:59` 的 `PluginHost::discover`）。

### 3.6 顺手的两条

```sh
# 后端只跑某一条测试（中文测试名可以直接当过滤串）
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test 通道名

# 看真实落盘的设置（三条外观轴的存法）
cat ~/.config/nota/settings.toml
```

### 3.7 ⚠️ 三条测试用例自己造的坑（踩过，2026-09-22）

**现象**：`cargo test` 突然挂两条，报的是这个：

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
  "写一个临时文件"，而真相是"那个目录不是你的"——**中间隔着一次被 `let _ =`
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
的命令行里恰好含有这串模式（我把脚本用 heredoc 写在同一条命令里），
于是它**匹配了自己、把自己打死了**。

⚠️ **此前把这个现象误记成"podman 报了假的退出码，忽略即可"——那是错的。**
它是真的把父进程杀了，只是**抢在脚本跑完之前还是之后有随机性**：

| 那一枪的结果 | 脚本本身 | 我的观察 |
|---|---|---|
| 抢输了（脚本先跑完） | 完整跑完，日志齐全 | 只有退出码 144，看着像"podman 的怪癖" |
| 抢赢了 | **连带被杀**，日志文件根本没生成 | 退出码 144 **且**截图/日志全无 |

`verify8` 是前者、`verify9` 是后者——**同一个写法，两次结果不同**，
所以"忽略退出码"这个经验一直没被证伪。

**规矩（两条，都要照做）**：

1. ⚠️ **验证脚本一律用 Write 工具直接落盘**，不要用 heredoc 从宿主命令行写。
   这样模式串**只出现在脚本文件里**，不会出现在任何一条宿主命令行里。
   跑法就是干净的一句：`podman exec -u 1000 tauri-dev bash /tmp/xxx.sh`。
2. ⚠️ **成败看日志文件，不看退出码。** 脚本里把每一步都 `echo` 出来重定向到
   `/tmp/vN.log`，跑完读那个文件。退出码 0 与 144 都说明不了什么。

⚠️ 顺带一条相关的自匹配：`pgrep -af '<模式>'` / `pkill -f '<模式>'` 会匹配
**发起它的那个 shell 自己**。`[t]arget/debug/nota` 这种方括号写法能绕开
**同一个命令行里的自匹配**，但**绕不开上面这条**（模式串出现在别处，比如 heredoc
正文里）。所以方括号是补丁，**Write 落盘才是治法**。

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

⚠️ 那十几个 chunk **全部来自 `@milkdown/plugin-diagram` 自带的 mermaid**。
处置意见在 `docs/07` backlog **第 27 项**（前端代码拆分）与**第 3 项**（插入菜单）：
**如果一直不做图表插入，可以考虑先把 `plugin-diagram` 摘掉**——摘掉能一次性
把这堆 chunk 全去掉。别为了消掉警告去调 `build.chunkSizeWarningLimit`，
那只是把尺子藏起来。

---

## 5. 无头目检（容器里没有显示器时）

`docs/07` §1 那张"真的能用"表，验法一栏写的就是 `docs/06` §5 ——**就是这一节**。
这一节整节是**在容器里实测过的**（2026-09-22），不是设想的流程。

### 5.1 四步

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota

# ① 起一个虚拟显示器（放后台）
podman exec -d -u 1000 tauri-dev Xvfb :99 -screen 0 1400x900x24

# ② 起 vite（⚠️ 必须先起！见 §2.3 —— debug 二进制定死在 devUrl 上）
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

⚠️ **窗口位置跟屏幕大小走，别照抄某个数**：`1400x900` 的屏上量到 `(150,70)`，
`1500x1050` 的屏上量到 `(200,145)`。**每次先 `xdotool getwindowgeometry` 量一遍**
（它给的是**客户区左上角**；无 WM 时没有边框，所以那个数就是内容原点）。
尺寸 1100×760 是 `tauri.conf.json` 定死的，这个可以记。

⚠️ **等窗口别只等 180 秒。** 起应用那一步若是 `cargo run`，而上一轮又跑过
`cargo test`，**两边交替会让构建产物互相作废，于是每次都在从零重编**——
实测 463/529 → 529/529 用了将近 4 分钟。等 180 秒的脚本会在这时候放弃并打印
「没等到窗口」，**但编译照常在后台跑完、窗口随后就起来了**。所以：
要么等够（`for i in $(seq 1 120)`），要么脚本超时后别急着重启，
先 `pgrep -af 'target/debug/nota'` + `xdotool search --name Nota` 看一眼——
**很可能 app 已经在跑了**，那就接上去接着驱动，不必再花四分钟。

⚠️ `-screen 0` **必须比窗口大**（1100×760）。用 `900x700` 试过：窗口被裁，
抓到的是一片白，看不出是加载失败还是被裁——会白白怀疑半天。

### 5.2 ⚠️ 两个坑

**① 别走 GNOME 的截图 D-Bus。**
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
顺带一句：`getactivewindow` 同样会因缺 `_NET_ACTIVE_WINDOW` 而失败，
**要看当前焦点用 `xdotool getwindowfocus`**。

### 5.3 ⚠️ 第三个坑：`search --name Nota` 会返回两个窗口

实测 `xdotool search --name Nota` 出来两行：

| 窗口 | 名字 | 几何 |
|---|---|---|
| `2097153` | `nota` | **10×10，不可见**（GTK 的内部窗口） |
| `2097156` | `Nota` | 1100×760，在 (150,70) —— **这才是那个窗口** |

⚠️ **对那个 10×10 的窗口调 `windowfocus` 会报 `BadMatch`**：

```
X Error of failed request:  BadMatch (invalid parameter attributes)
  Major opcode of failed request:  42 (X_SetInputFocus)
```

它不是因为 `windowfocus` 不能用，而是因为那个窗口**不可见**（`X_SetInputFocus`
要求目标 viewable）。所以选窗口**按几何挑，不要按名字挑**：

```sh
# 挑那个有真实尺寸的
W=$(xdotool search --name '^Nota$' | while read w; do
      eval "$(xdotool getwindowgeometry --shell "$w")"
      [ "$WIDTH" -gt 100 ] && echo "$w" && break
    done)
xdotool windowfocus "$W"        # ✔ 成功
```

### 5.4 驱动界面

```sh
# 点「新建文档」（坐标按 1400x900 的 root 量；窗口在 (150,70)）
xdotool mousemove 668 290 click 1
sleep 3                                   # ⚠️ 给 ProseMirror 挂载留时间
xdotool type --delay 30 "# Hello Nota"    # ASCII 可以
```

⚠️ **坐标要"量"，不要"估"**（2026-09-22 栽过一次，绕了五个脚本）。

`import -window root` 出的文件是 1500×1050，但**我"看"这张图时读出来的坐标
和真实像素对不上**：标签栏真在 `y≈862`，按看图估的 820 去点——那一行还是
**编辑区**，于是"点了没反应"。接着一路怀疑到 `onClick` 没接上，而
`src/App.tsx:500` 那个 `onClick={() => props.onSelect(d.id)}` 一直是好的。
**从头到尾就没有 BUG，错的是我手里那把尺子。**

要按坐标点之前，先裁一小块放大核一遍：

```sh
# ⚠️ ImageMagick 7 里 convert 会打一条 deprecated 警告，用 magick
podman exec tauri-dev magick /tmp/shot.png -crop 500x65+200+840 +repage -scale 300% /tmp/crop.png
```

裁块里"目标在第几行第几列"是能直接数出来的，除回去就是真实坐标。

📌 判据：**点击"没反应"时，先证明坐标对得上，再怀疑代码。** 同一个脚本里
顶栏那个 `插件` 按钮一点就动（侧栏整块消失），这说明合成点击本身有效，
问题只可能在落点上。

📌 顺带一条：**"悬停没反馈"不一定是没收到指针事件**——要看那个元素
**有没有 `:hover` 规则**。`.tab-label` 就没有（只有 `.tab-close:hover` 有，
见 `app.css:476`），拿它当探针等于没测。

⚠️ **`xdotool type` 打不了中文。** 实测报：

```
Invalid multi-byte sequence encountered
xdo_enter_text_window reported an error
```

裸 Xvfb 没有输入法、也没有配 CJK 的键盘映射，`xdotool` 给多字节字符找不到 keysym。
所以**中文场景（`# 中文标题`、IME、`BUG-5` 那条）没法用这条路验**——
硬件键盘或另一种输入注入方式才能覆盖。能验的是：点击、菜单、ASCII 打字、
渲染结果、字数统计变化、脏标记亮起。

清理：

```sh
podman exec -u 1000 tauri-dev sh -c 'pkill -f "target/debug/nota"; pkill Xvfb; pkill -f vite'
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

---

## 6. 测试清单

```sh
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test
```

**当前 55 条，全过。** 另有**两个 test target 是 0 条**：`src/main.rs`（只是个壳）与
Doc-tests（`nota_lib` 没有文档测试）。`tests/` 目录下**只有一个空的 `tests/fixtures/`**，
还没有 Rust 集成测试——所以下面这 55 条**全部是单元测试**。

> ⚠️ 记数只在本文记（55）。别处提到测试数一律写"见 `docs/06`"。

### 6.1 逐条

**`settings::tests`（3）—— 三条外观轴怎么落盘**

| 测试 | 钉住什么 |
|---|---|
| `默认设置能往返序列化` | `Settings` 存了再读要一模一样。顺带钉住 `content_width` 的默认值是 **760** |
| `文件不存在时回默认而不是报错` | 首次启动没有 `settings.toml` 是正常状态。⚠️ 与"文件存在但解析不了要报错"是**两回事**——后者静默回默认会让人以为设置被吞了 |
| `枚举落盘用_kebab_风格` | **存法即接口**：存的是 `ui_style = "macos"`，不是 `"Macos"`。改 `serde` 属性会打破所有已存的设置文件 |

**`plugin::manifest::tests`（5）—— 清单的校验规则**

| 测试 | 钉住什么 |
|---|---|
| `好清单能解析出能力` | 正常路径；顺带钉住 `entry` 的**默认值**是 `main.lua` |
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
| `ui_能力清单要和_ui_rs_对得上` | ⚠️ **两处判据是相乘的**：`ui.rs` 里每个函数判一次"表里有没有它"，`api/mod.rs` 里判一次"表本身在不在"。这条用 `include_str!("ui.rs")` 数 `ui.rs` 里 `manifest.has(Capability::Ui…)` 的处数，与 `UI能力` 数组的长度比对——**谁加第四个 `ui.*` 判据就会红**，红的信息告诉你该往哪儿补 |
| `能力的_serde_名字与_parse_说同一套话` | `#[serde(rename)]` 与 `Capability::parse()` 是**各写各的**两套名字，任一处改了另一处没改，插件清单就会"写得进、读不出"。这条把三条 `ui.*` 能力逐个往返一遍 |

**`lua::tests`（4）—— 沙箱里到底有什么（BUG-10 的回归锁）**

⚠️ 这四条是**为一处真缺陷**加的，而且是本轮**最严重**的一条：第一道闸曾经是假的。
所以这里既有"结果"的用例，也有"输入"的用例，还有一条**专门记录 mlua 事实**的用例。

| 测试 | 钉住什么 |
|---|---|
| `沙箱里不该有的全局一个都不能有` | **BUG-10 的回归锁**：遍历 `必须为空的全局`（`io`/`os`/`package`/`require`/`dofile`/`loadfile`/`debug`），每个都必须是 `nil`。**谁把 `硬化的_lua()` 换回 `Lua::new()`，这条立刻红** |
| `mlua_的_default_safe_其实含_io_和_os` | ⚠️ **这条是"事实记录"，不是"要求"**：断言的是 `Lua::new()` 里 `io`/`os`/`package`/`require` **确实存在**、只有 `debug` 不在。哪天 mlua 收紧了默认值它会红——**红了别急着删**，那说明本文件顶上那段的前提没了，要重新判一次 `硬化的_lua()` 该怎么写 |
| `白名单里不许有_io_os_package_debug` | 钉**输入**：`插件标准库()` 不含那四个，但含 `coroutine`/`table`/`string`/`math`（后者是防止哪天"顺手删干净"）。结果错可能是白名单开宽了，也可能是 base 库捎带进来的——**两处都可能出错，所以两边都钉** |
| `插件跑不了_os_execute` | **端到端那一下**：在硬化过的 `Lua` 里跑 `os.execute("touch …")` 必须报"`os` 是 `nil`"，且**事后确认文件没被建出来**。光看 `is_nil()` 是够的，但这条更贴插件作者的真实动作，失败时的报错也更好懂 |

> 📌 **为什么值得为一条 bug 加四条用例**：这个洞的形态是"**信任了一个库的安全标签**"，
> 而这类错误**不会被编译器、也不会被别的用例抓到**——`Lua::new()` 编得过、跑得通、
> 插件行为看起来正常。唯一的防线就是有人明确写下"`io` 必须不存在"并让它可执行。
> `mlua_的_default_safe_其实含_io_和_os` 那条尤其别扭（它在断言一个**坏的**事实），
> 但它的价值正在于此：**把"库的 safe 不等于安全"这件事变成一条会红的断言。**

**`lua::api::fs::tests`（5）—— 工作区围栏（本仓唯一的安全边界）**

| 测试 | 钉住什么 |
|---|---|
| `普通相对路径能过` | 基本路径解析 |
| `点开头的清除掉但不越界` | `./子目录/./a.md` 规范化成 `子目录/a.md` |
| `绝对路径直接拒` | `/etc/passwd` 一律拒——允许了就等于允许写 `/etc` |
| `用点点爬出去要拒` | ⚠️ **围栏的正题**：拒的是"写一个**还不存在**的文件"，那条路走不了 `canonicalize`。同时钉住"在里面绕一圈是合法的"（`子目录/../里面.md` 要过）——**围栏误伤的代价是插件莫名其妙用不了** |
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

**`lua::api::ui::tests`（1）**

| 测试 | 钉住什么 |
|---|---|
| `通知层级归一化` | `warn`/`warning` → `warn`，`error`/`success` 原样，**认不出的一律 `info`**。⚠️ 别把插件的笔误变成一次报错——那会让人为一个无关紧要的通知层级去读栈 |

**`document::tests`（12）—— 标题推导 + 文档表的三条口径**

| 测试 | 钉住什么 |
|---|---|
| `标题优先取_front_matter` | front matter 里的 `title` 压过正文一级标题 |
| `没有_front_matter_时取第一个标题` | 任意级别（`##` 也算）的第一个标题；**结尾的 `##` 要剥掉** |
| `代码块里的井号不算标题` | 围栏代码块里的 `# 注释` 不能被当成标题 |
| `井号后没空格不是标题` | `#标签` 不是标题，回退到「未命名 7」 |
| `取不到就回退到文件名或未命名` | 文件名（不含 `.md`）→ 都没有就 `未命名 {id}` 两档 |
| `同步相同内容不动_revision` | ⚠️ **内容没变就不涨 `revision`**。前端是去抖 300ms 推的，每次都涨会让"有没有变"这件事失去意义 |
| `同一路径只打开一份` | 重复 `open` 同一路径要返回**同一个 id**，不许开两个标签 |
| `存盘后_dirty_归零且另外存能改路径` | 存盘三件事一起钉：`dirty` 归零、内容真的落盘、"另存"要改掉 `path` |
| `没路径又没另存要报错` | 新建的未命名文档直接 `save(None)` 必须报错，不许瞎猜路径 |
| `未命名序号不会被打字抹掉` | **BUG-9 的回归锁**：新建两份未命名文档，序号是 0 和 1；在第一份里打字（触到 `sync` 的重算标题那条路）之后，**序号仍然是 0**。⚠️ 它钉的是"序号在建文档那一刻就定死了"——如果谁改成"每次重算标题时问一下计数器"，第一份的名字会在用户打出第一个字之后自己变掉，这条就红 |
| `装载时的规范化不算用户改动` | **BUG-12 的回归锁**：`settle` 之后 `dirty` 必须是 `false`、`revision` 不涨。⚠️ 这条第一版**红过**：我写的 `settle` 在 `text == doc.text` 时早退，而真实流程里编辑器那次规范化**已经先走 `sync` 把文本推上来了**，于是走到 `settle` 时两者已经相等、早退、脏标记没清掉。**早退那行不能加回去** |
| `未命名文档空的不脏` | 新建的文档一个字都没有时 `dirty` 就是 `false`。⚠️ 与上面那条合起来才是完整的口径：**`dirty` 是"和上次认领的干净文本比出来的"，不是"发生过 sync"** |

**`commands::workspace::tests`（3）—— 文件树的形状**

| 测试 | 钉住什么 |
|---|---|
| `认领的_markdown_后缀` | `.md` / `.MD`（**大小写要认**）/ `.markdown` 算，`.rs` / `.pd` 不算。⚠️ 这份后缀表要与 `docs/03` 一致；**`App.tsx` 打开对话框的过滤器曾经少一个 `.mdx`**（backlog 第 28 项，2026-09-22 已修——两处都补上了） |
| `文件树只列_markdown_并且目录在前` | 排序口径：目录在前、按名字（**不区分大小写**）、跳过点开头（`.git`）与非 md（`b.png`） |
| `depth_为_1_时不给子节点` | `depth=1` 时 `children` 是 `None`（**不是空数组**）；`depth=2` 才递归一层 |

**`themes::tests`（7）—— 主题的发现、围栏与 MIME**

⚠️ 这一组是 2026-09-23 做"兼容 Typora 主题"时加的。**围栏那三条是重点**：
`nota_theme_read` / `nota_theme_asset` 都能读任意文件，全靠 `check_scope()` 挡住。

| 测试 | 钉住什么 |
|---|---|
| `扫出_css_并认出同名资源目录` | 只认 `.css`（同目录下的 `.txt` / 无扩展名的都不算）；有同名目录时 `has_assets = true`，没有是 `false` |
| `靠前的目录覆盖同名的` | `paths::theme_dirs()` 的**优先级真的生效**——用户自己那份要能盖掉 Typora 的 |
| `目录不存在时返回空表而不是报错` | ⚠️ **"扫不到"不是错**——不装 Typora 的机器就是这种情况，`nota_themes_list` 返回的是 `Vec` 不是 `Result` |
| `拒绝读主题目录之外的文件` | `check_scope()` 挡住 `/etc/…` 这类路径 |
| `拒绝读主题目录之外的资源` | 同上，走 `read_asset()` 那条路 |
| `前缀像主题目录的兄弟目录不算数` | ⚠️ 钉的是"按**路径分量**比，不是按字符串前缀比"——`.../themes-evil/` 这种必须拒 |
| `资源读成_data_url_而不是路径` | `mime_of()` 的映射（含**大写扩展名** `.PNG` → `image/png`、认不出的 → `application/octet-stream`）+ base64 的字母表口径（`STANDARD.encode([0,1,2,253]) == "AAEC/Q=="`——⚠️ **这条钉的是"`+` `/` 用得上"**，换成 URL-safe 字母表会得到另一个答案） |

### 6.2 这些测试**没**覆盖什么

⚠️ 别把"55 条全过"读成"哪都没问题"。**六条**已知的空白：

| 空白 | 为什么 |
|---|---|
| **`HostContext` 相关的一切** | 它要一个**真的 `AppHandle`**，构造不出来。所以 `nota.document.*` / `nota.ui.*` 发事件那几条路**没有单元测试**——这正是 `AGENTS.md` §4 那条"**别把安全边界写在 `HostContext` 里面**"的由来：写了就没法测 |
| **`HostContext` 之外的插件加载流程** | `PluginHost::discover` / `LuaPlugin::load` 都要 `HostContext`。所以"插件真能被加载"只能在 §5 开窗（或至少起 Xvfb）验 |
| **前端** | 没有任何前端测试（`package.json` 里没有测试框架）。前端靠 `tsc --noEmit` + §5 抓图 |
| **主题 CSS 的改造** | `styles/typora-theme.ts` 那整套（展开 `@import`、内联 url、收拢到 `#write`）**一条测试都没有**，而它是主题兼容的核心。原因是前端没有测试运行器。**今天的验证方式是取像素**（换主题后采外壳与正文两处的颜色，见 `docs/07` §1）——⚠️ 这只覆盖了"变量提升 + 桥接"，**选择器收拢到底对不对没有机器判据**，只能靠人看版式 |
| **主题资源真的能加载** | Rust 侧那 7 条只钉到"读成 data: URL"。**"这个 data: URL 真的被浏览器用上了"**是另一回事——而且实测踩过坑：拿 `github` 验**测不出来**，因为它的第一条 `@font-face` 是 `local('Open Sans Regular')`、容器里装着 Open Sans，字体压根不会被请求。要验得用去掉 `local()` 的探针主题 |
| **`.mdx` 的后缀不一致** | 不是"没测"，是**两处表真的不一样**（`workspace.rs` 的 `is_markdown()` 认 `.mdx`，`App.tsx` 的过滤器不认）。见 backlog 第 28 项 |

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
