# 06 · 依赖、构建、运行、调试与测试

> 最后同步：2026-09-22
>
> 本文是 `AGENTS.md` §3 的**展开**。§3 给的是"三条命令"，这里讲**为什么是这三条**、
> 每一步踩过的坑、不接显示器怎么看界面、以及 `cargo test` 里那 84 条到底钉住了什么。
>
> ⚠️ **测试数只在本文记数（当前 89）**，别处一律写"见 `docs/06`"。
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
| `ureq` | `3`（默认 feature：`rustls` + `webpki-roots` + `flate2`） | **只给 `nota.http` 用，也就是只给插件用**（2026-09-24）。选它是因为它是**同步**的——插件那一侧本来就是一条阻塞的 Lua 调用，宿主放进 `spawn_blocking` 就完事；换 `reqwest` 得把 async 引到 Lua 桥的每一层。⚠️ 默认 feature 就**不依赖系统 OpenSSL**（容器里不用装 `libssl-dev`），**别顺手开 `native-tls`**，那会把系统库拖回来。见 `docs/13` §9 |
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

# ① 只编译后端 + 跑单元测试（§6 那 89 条）
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

#### 图标：**矢量母版在 `icons/nota.svg`**（2026-09-23 换过两次，第二次是最终稿）

`src-tauri/icons/nota.svg` 是**唯一的手写源**，其余全部由它派生：

```sh
# ① 矢量母版 → 1024 PNG（Chrome 无头光栅化，宿主就能跑，不需要容器）
google-chrome --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1024,1024 --screenshot=/tmp/master.png \
  "file://$PWD/src-tauri/icons/nota.svg"

# ② 1024 PNG → 全套（icns / ico / png / Square*Logo）
podman exec -u 1000 -w "$PWD" tauri-dev npx tauri icon /tmp/master.png
rm -rf src-tauri/icons/android src-tauri/icons/ios   # 这两个我们不要
```

⚠️ `nota.svg` 里写的是 `width="100%" height="100%"` + `viewBox="0 0 1254 1254"`，
**故意不给固定像素**——这样 Chrome 会按窗口尺寸整幅缩放（给 1024 就出 1024），
而不是**按原尺寸画完再裁**。少了这一条，出图会是被裁掉一角的。

⚠️ `tauri icon` 会把 `android/` 和 `ios/` 也一并生成，而 Nota 不做移动端，
留着只会让人以为我们有手机版。

**设计稿的来历**：用户自己画的（蓝色 `N` + 光标竖条 + 折角纸 + 三行文字），
本仓库里那份 SVG 是**照图逆向**出来的，不是设计稿的原生文件。

⚠️ **2026-09-23 换过两版**：第一版是照第一张图逆向的；用户随后把重画的稿子
放进下载文件夹，第二版（也就是现在这份）是照着它落的。两版的**设计意图没变**，
差别都在几何与用色上——底衬由"采样出来的超椭圆路径"换成**普通圆角矩形 `rx=250`**、
纸的圆角 `A52 → A70`、`N` 改成"fill + 同色 stroke + `stroke-linejoin: round`"、
光标条由渐变改成**平色 `#4f82fb`**。**具体逐条差异记在 `icons/nota.svg` 的文件头里**，
改图标之前先读那一段。

⚠️ 母版里那层浅灰底占画布约 **74%**，所以在 32px 这种小尺寸下会比较"小一圈"
（四周留白多）——这是**忠实于原图**的做法，真嫌小就整体把底衬那个 `<rect>` 放大。

⚠️ `tools/gen-squircle.py` 是给**第一版**那条采样路径（逼近超椭圆 `n=4.4`，
每象限 6 段贝塞尔）用的，第二版底衬换成了普通圆角矩形，**这个脚本暂时没有调用点了**。
留着没删：原图那个底衬确实是超椭圆的形状，若哪天要更贴原图，还得靠它重新采样。
⚠️ 那条路径是**采出来的数据**不是可读参数，手改不动；脚本默认参数跑出来的那条
与第一版里现存的那条**逐字符一致**（用脚本对着 SVG 反查过）。

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
| `src/App.tsx:217` | `[nota] frontendReady 失败：` —— 握手失败不影响使用，只记一笔 |
| `src/ui/ErrorBoundary.tsx:30` | `[nota] 渲染出错：` + `componentStack` |
| `src/ui/ErrorBoundary.tsx:64` | `[nota] 未处理的 Promise 拒绝：` |
| `src/ui/ErrorBoundary.tsx:67` | `[nota] 全局错误：` |

`installErrorHooks()` 在 `src/main.tsx` 里**在渲染之前**调——理由写在那个文件的注释里：
**打包后的应用没有 devtools，那时未捕获的 Promise 拒绝就是彻底静默的。**

⚠️ **`src/main.tsx` 里那串 CSS import 的次序是有讲究的，别按字母排**：
`theme.css` 打头，`app.css` 跟上，然后 `sidebar.css` / `slidev.css` / `settings.css` /
`editor.css` / `bars.css` **一律在 `app.css` 之后**。它们的选择器都有和 `app.css`
重叠的部分（`.confirm-dialog` 的宽度、`.ProseMirror` 那棵树、`.app-main` 的 `flex`、
折叠三角与缩进那几条），**同权重靠顺序取胜**。其中 `editor.css` 那条最要命：
顺序反了，正文区的字号、行高、代码块底色会被外壳那几条整片盖掉，而**没有任何报错**。
`icons.css`（2026-09-24 加的，那套图标的遮罩画法）与上面几份**没有重叠的选择器**，
接在 `bars.css` 后面只是照这条规矩来；它**没有** `.sr-only`（可读名字走 `aria-label`），
别看着少了点什么就补回去。全文件**最后一行**是 `katex/dist/katex.min.css`，
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
| `NOTA_SLIDEV_CMD` | **换掉 Slidev 的启动命令**（空格分词） | 默认 `npx @slidev/cli`（⚠️ 2026-09-24 去掉了 `--yes`：它的意思是「别问，直接下几百 MB」，正是"点了菜单半天没反应"的病根）。⚠️ **全仓唯一一个自定义调试变量**（2026-09-23 加），两个用途：**不下载真 Slidev 也能验那条链**（指向 `tools/stub-slidev.py`，见 §5.7）、以及**把「装没装」面板的四种状态都画出来**（见 §5.8）。⚠️ 「装没装」的探测跑的也是**这一条命令**再追加 `--version`，所以这个变量同时决定探测问的是什么 |

⚠️ **Nota 的自定义调试变量只有一个**（`NOTA_SLIDEV_CMD`，2026-09-23 加）——
Folio 那边那种 `FOLIO_*` 十几个的阵仗**这边没有**（也不需要：这边的疑难杂症
多半能在前端改一行代码验掉，那边得进 C）。所以排查主要靠 §3.1 那五处 `eprintln!`
与 §5 的抓图。

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
见 `app.css:661`），拿它当探针等于没测。

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

⚠️⚠️ **2026-09-23 起反过来又多了一条坑：宿主的 `fcitx5` 会来抢合成按键，
连 ASCII 都打不进去了。** 用户把 IME 修好之后，`fcitx5` 就常驻在宿主上；
容器与宿主**共用 PID 命名空间**（本文件 §3.7 那条），所以：
`podman exec -u 1000 tauri-dev pgrep -a fcitx5` **看得到它**，
而跑在 `:99` 上的 Nota **也被它接管了**（⚠️ 中间那条路——XIM 还是会话 DBus——
**没往下追**，但现象只可能是它）——于是 `xdotool type "ctrl+shift"`
打出来的搜索框里是**「传统人力+」**（被当拼音组了词），
而且**一旦那次组合还开着，后面所有按键都不进输入框**（`BackSpace` 删不掉、
`Escape` 也不管用）。⚠️ **症状极具迷惑性**：不报错、不退出、窗口好好的，
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
⚠️ **别去动宿主的 `fcitx5`**（那是用户在用的东西），只在**我们自己起的进程**上设。
⚠️ 也**不要**把它当成"IME 验不了"的借口——它只说明**这条路验不了 IME**，
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
比开窗省事得多——Xvfb 里 `xdotool` 送不进按键（§5.4 记过），
而试验台是个普通网页，系统 Chrome 无头就能跑脚本 + 截图。

它把 `src/ui/` 里的**真组件**挂进一个网页（`@` 别名照抄根配置，**不是复制品**），
用 `location.hash` 选场景，把结果打进页面上一块 `<pre>`——**断言就是读那几行**。

```sh
podman exec -u 1000 -w "$PWD" tauri-dev npx vite build --config tools/menu-harness/vite.config.ts
python3 -m http.server 8777 --directory tools/menu-harness/dist
google-chrome --headless --disable-gpu --screenshot=/tmp/x.png \
  --window-size=1280,900 --virtual-time-budget=3000 'http://127.0.0.1:8777/#accel'
```

⚠️ **URL 里不带 `dist/`**——服务的根已经是它了（这条踩过）。
⚠️ **容器与宿主共用网络命名空间**，宿主上的 Chrome 直接连 `127.0.0.1:8777` 就行。
⚠️ 场景表、断言条数、以及**它抓到过什么**都记在 `tools/menu-harness/README.md`，
不在这儿重复。⚠️ 它是工装，**不参与根 `vite.config.ts` 的构建**，也不进任何 npm script。

⚠️ **它证明不了"在真 Tauri 窗口里按下去真响"**——只证明"表推得对、DOM 长对"。
两条都要，见 §6.2 最后一行。

**这一批（2026-09-24）**：键位表 **32 条全对**、构建无警告。原先 **30 条**，
新加的正是 `F8`（专注模式）与 `F9`（打字机模式）——理由是**容器里按不出这两个键**
（原因见 §5.11 陷阱一），既然开窗验不了，就得让表自己说话。
⚠️ 这两条此前**一条断言都没有**：容器里按不出来 + 表里也没人问 = 一个没人看的角落。

---

### 5.7 验 Slidev 预览那条链（`tools/stub-slidev.py`）

预览那条链（起进程 → 探活 → 开窗口 → 同步 → 收摊）跟**幻灯片怎么渲染**没关系。
真 Slidev 第一次要下几百 MB，所以验链子时用一个**替身**：
`tools/stub-slidev.py` 收下同样的参数、绑同样的地址（⚠️ **`[::1]`**），
把入口文件**现读现端**出去——于是「同步写进去了没有」用一句 `curl` 就看得见。

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota

# ① 按 §5.1 起 Xvfb + vite，然后带替身起应用
podman exec -d -u 1000 -w "$PWD/src-tauri" \
    -e DISPLAY=:99 -e GDK_BACKEND=x11 -e WEBKIT_DISABLE_COMPOSITING_MODE=1 \
    -e NOTA_SLIDEV_CMD="python3 $PWD/tools/stub-slidev.py" \
    tauri-dev ./target/debug/nota

# ② 点「新建文档」→「视图」→「Slidev 预览」（坐标见 §5.4：先裁块核一遍再点）
D="podman exec -u 1000 -e DISPLAY=:99 tauri-dev"
$D xdotool mousemove 594 400 click 1     # 新建文档
$D xdotool mousemove 459 187 click 1     # 「视图」
$D xdotool mousemove 515 401 click 1     # 「Slidev 预览」
#   ⚠️ 2026-09-24 起这里**先弹出「装没装」的面板**，不是直接起进程（见 §5.8）。
#   ⚠️ 用替身时探测会**超时 20 秒**（替身不认 `--version`，它直接开始听端口），
#   所以下面要等够 20 秒，再点「仍然打开预览」——那之后才和以前一样。
sleep 22
$D xdotool mousemove <面板左下那颗「仍然打开预览」的坐标> click 1   # 坐标按 §5.4 现量
sleep 2

# ③ 入口文件写出来了没有（未存盘的文档落数据目录）
podman exec -u 1000 tauri-dev sh -c 'ls -a ~/.local/share/nota/slidev/; cat ~/.local/share/nota/slidev/.nota-slidev-1.md'

# ④ 预览窗真的开着吗——⚠️ 按 **pid** 找，别按名字找（见下面第二条坑）
APP=$(podman exec -u 1000 tauri-dev pgrep -f 'target/debug/nota$' | head -1)
$D xdotool search --pid "$APP" | while read w; do
      echo "[$w] '$($D xdotool getwindowname $w)' $($D xdotool getwindowgeometry --shell $w | tr '\n' ' ')"
    done
#   期望看到：'Nota — Slidev 预览' 960x720，X = 主窗口右边缘 + 8

# ⑤ 同步：不动键盘也能制造一次改动——点「段落 → 水平分割线」，它会往文档里插东西
#   ⚠️ **任何一条会改文档的菜单项都行**（2026-09-23 复验时用的是「段落 → 一级标题」，
#   入口文件里立刻出现一个 `#`）。下面这两行坐标是窗口在 (150,70) 时量的，
#   ⚠️ **窗口位置一变它就平移**（这次在 (250,170)，两条都得 +100）——先按 §5.4 裁块核一遍再点
$D xdotool mousemove 365 187 click 1     # 「段落」
$D xdotool mousemove 430 657 click 1     # 「水平分割线」
sleep 3
podman exec -u 1000 tauri-dev sh -c 'cat ~/.local/share/nota/slidev/.nota-slidev-1.md'   # 期望看到 ***
curl -s 'http://[::1]:<端口>/'           # 替身端出去的也是它 → 链子通了

# ⑥ 收摊：再点一次「视图 → Slidev 预览」
$D xdotool mousemove 459 187 click 1; $D xdotool mousemove 515 401 click 1; sleep 3
podman exec -u 1000 tauri-dev sh -c 'pgrep -af stub-slidev.py | grep -v pgrep; ls -a ~/.local/share/nota/slidev/'
#   期望：进程没了、入口文件删了、截图右侧那片白也没了
```

⚠️ **为什么要这一步：`xdotool type` 打不进那个编辑器**（2026-09-23 实测）。
`windowfocus` 成功、`Ctrl+Shift+L` 这种应用级快捷键**也能生效**，但往正文里打字就是不进——
新建的空文档尤其明显（点编辑区那一下多半落在「正文以下的留白」上，正是 BUG-15 那条）。
**所以别在这条路上耗**：用**菜单**制造文档改动（「水平分割线」最省事），一样能验同步。

⚠️ **两个坑（都实测过）**：

1. **`xdotool search --name` 找预览窗常常找不到，用 `--pid`**。
   预览窗的标题是「Nota — Slidev 预览」，但它由 WebKit 加载页面之后才定下来，
   刚开出来那几百毫秒里**还没有名字**——按名字搜会得到空，看起来像"窗口没开"。
   按 `--pid <应用的 pid>` 搜就稳。
2. **在这个无头环境里，用 `xdotool windowclose` 叉掉任何一个窗口都会让应用直接死掉**，日志尾巴是：
   ```
   Gdk-WARNING: The program 'nota' received an X Window System error.
   The error was 'BadDrawable (invalid Pixmap or Window parameter)'.
     (Details: ... request_code 14 (core protocol) ...)
   ```
   ⚠️ **这不是预览窗的问题**：**叉主窗口也一样死**（A/B 验过，2026-09-23 又复验了一次）。裸 Xvfb + 没有窗口管理器
   的环境里 GDK 撞上 X 错误就 `abort`，Drop 不跑、子进程留在原地。
   后果：**「用户亲手叉掉预览窗 → 服务器跟着收」这条链在容器里验不了**——
   进程死在 `Destroyed` 回调能干活之前（留一个孤儿替身 + 一份没删的入口文件）。
   它靠 `slidev.rs` 的单测（`收摊之后进程真没了`）与真机行为兜着，**别在容器里断言这条**。
   ⚠️ **但 ⑥ 那一步没事**（2026-09-23 复验）：从**菜单**里再点一下走的是命令层
   （先 `slidev::stop`、再 `close_window`），**应用活得好好的**，窗口、子进程、入口文件三样都收干净了。
   所以**「收摊」这件事本身能验，验不了的只是「用户亲手叉窗口」那一种触发方式**——两者别混。
   （顺带：留下的那个替身进程按 pid 手动 `kill` 掉，别用 `pkill -f`——见 §3.7。）

---

### 5.8 验「装没装」那个面板（§2.6c 的四格画面）

面板的四格状态**取决于 `NOTA_SLIDEV_CMD` 指向什么**，所以四格都能在本机画出来——
⚠️ 但**画出来 ≠ 真装了一份 Slidev**，"真装"那一格只有真装才算（见 §6.2 最后一条）。

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota
D="podman exec -u 1000 -e DISPLAY=:99 tauri-dev"
# 通用：起应用（Xvfb + vite 见 §5.1），区别只在 NOTA_SLIDEV_CMD
podman exec -d -u 1000 -w "$PWD/src-tauri" -e DISPLAY=:99 -e GDK_BACKEND=x11 \
    -e WEBKIT_DISABLE_COMPOSITING_MODE=1 -e NOTA_SLIDEV_CMD="<下面三选一>" \
    tauri-dev ./target/debug/nota
```

| 想要哪一格 | `NOTA_SLIDEV_CMD` 给什么 | 期望看见 |
|---|---|---|
| **检测中**（`is-busy`） | 上面三选一都行，**点开菜单后立刻截图** | 转圈 ＋「正在检查本机有没有 Slidev…」＋一颗**按不动**的「检测中…」 |
| **`missing`**（`is-warn`） | `nota-根本没有这个命令` | 立刻（<1 秒）出橘色 `!`，主按钮**「去官网看安装指南」**，旁边还有「仍然打开预览」 |
| **`unknown`**（`is-ask`） | `python3 $PWD/tools/stub-slidev.py` | **等满 20 秒**才出灰色 `?`，主按钮**「仍然打开预览」**（⚠️ 它不是"没装"，是"没问出结果"） |
| **`ready`**（`is-ok`，⚠️ **画的，不是真的**） | `printf 1.2.3` ＋ 文档**存在**一个带 `node_modules/@slidev/theme-default/` 的目录里 | 绿 `✓` ＋「1.2.3」＋命令/目录两行，主按钮「打开预览」 |

⚠️ 最后那行的"骗法"只用来**看面板画得对不对**（`printf` 认 `--version` 这个位置参数、会忽略它，
于是探测拿到版本号；但拿它当服务器会立刻退出）。**别拿它当"装了的分支验过了"**——
那正是本仓最老的一条欠账（真 Slidev 一次都没跑通过，见 `docs/07` 第 44 项）。

⚠️ 点「仍然打开预览」（或 `ready` 格的「打开预览」）之后，走的就是 §5.7 那条链，
逐条对照那五步即可（入口文件、窗口几何、同步、收摊）。

⚠️ **探测起过的进程不会留下孤儿**：超时那条路走 `kill_group`，杀的是**整个进程组**。
验完可以核一遍——`pgrep -af stub-slidev.py | grep -v pgrep` 应该是空的
（⚠️ **别用 `pkill -f` 清场**，见 §3.7）。

### 5.9 改前端时的四条目检经验（2026-09-24）

**① 「改了没生效」先看 vite 的 HMR 日志，不要去猜缓存、更不要怀疑 Rust。**

```sh
podman exec -u 1000 tauri-dev tail -30 /tmp/nota-vite.log
```

⚠️ 实测过的现场：`lax-heading.ts` 中间层多了一个 `}`，vite 报
`Transform failed … Unexpected "}"`，HMR 推不过去、**界面就停在上一版上**——
症状是"我的改动一点反应都没有"，看着像逻辑错。这条日志是当时唯一说真话的地方。

⚠️ **顺带钉掉一个错误猜测**：debug 二进制**确实**连 `devUrl`（§2.3 那条是对的），
不是吃 `dist/`——vite 日志里能看到它对 `/src/…` 的请求与 HMR 推送。
所以「改了源码」和「界面变了」之间**不需要 `npx vite build`**；
真没生效时看日志，别急着重新构建。

**② 打开文件用「点」的，不要用打的。** `xdotool type` 打不了中文（§5.4），
所以验中文内容时**别去打字**——把测试文件先放进 `/tmp/nota-home`
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
⚠️ 别拿"我看了看，没变"当证据——这条不变量（`docs/03` §5.5）就是靠这个命令守的。

**④ 合成键鼠事件只往自己起的窗口里发。** ⚠️ 用户正在用的窗口**一个都不许碰**——
`xdotool` 有没有"发给哪个窗口"的判据，得自己在脚本里保证（本节的流程默认
`DISPLAY=:99` 是自己起的 Xvfb，就没这个问题）。

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

⚠️ **`windowfocus` 那一步不能省**，也不能用 `tail -1` 随手挑窗口——按**几何**挑，
桩窗口的坑见 §5.3。（对话框也一样：`search --name '导出 HTML'` 可能多命中，
挑不到就先把全部窗口的几何打出来看。）

⚠️ `--delay` 要给够（30ms 起）：`type` 打得太快，GTK 的输入框会**丢字符**。

**① 生成那一段（也能验）。** `导出HTML()` 是纯函数式的：给一段 Markdown 要回一份
HTML 字符串。它**不弹框、不落盘**，所以在开发者工具（§3.3）里直接 await 就能看结果：

```js
const m = await import("/src/editor/export.ts");
(await m.导出HTML("# 标题\n\n正文", { strict: false, styled: true, title: "试" }))
```

⚠️ 重点核两处：**宽松模式下 `#标签` 在导出里也该像标题**（那是 `Decoration.node`，
走 `DOMSerializer` 的那条路会丢——见 `docs/05` §4.5），以及**含样式那份里
没有 `nota-` 开头的 class**。

**② 落盘那一段（能验）。** 打印的落点是**确定**的：文档同目录下的
`.nota-print.html`。所以点一次菜单 → 系统默认程序打开之后：

```sh
podman exec -u 1000 tauri-dev ls -l -a /tmp/nota-home/<文档目录>/.nota-print.html
```

⚠️ 它是个**点开头的隐藏文件**，`ls` 不加 `-a` 看不见——找不到时先想到这一点。
⚠️ "系统默认程序"是否真的被拉起来了，看进程（`xdg-open` 或它拉起的浏览器），
**别拿"没弹窗"当失败**：容器里可能就没有配默认程序。

**这一批点出来的实测值**（细节与判据记在 `docs/07` §1 与 §3 第 1 项）：

| 项 | 值 |
|---|---|
| 导出对话框标题 / 预填名 / 筛选器 | 「导出 HTML（含样式）」/ `nota-export-test.html` / HTML |
| 导出落盘 | 22990 字节，`<style>` 段 = `editor.css` 的字节，正文是 `<body class="editor-pane">…<div class="ProseMirror"><p>aa</p><p>bb</p>` |
| 打印落盘 | 同尺寸 `22990` 字节的 `.nota-print.html`，**写在文档自己的目录里** |

### 5.11 三个"看着像代码坏了、其实是环境"的陷阱（2026-09-24）

**陷阱三（2026-09-24 验插件时踩的）：容器里跑着 `fcitx5`，`xdotool type` 送进去的
字符串会被输入法吃掉。** 症状是"应用的输入框把 ASCII 变成了中文"——
看起来像 `PromptDialog` 的输入处理坏了。

```
podman exec -u 1000 tauri-dev pgrep -af fcitx     # → /usr/bin/fcitx5
```

实测：`xdotool type "qwen2.5:7b"` 落进输入框的是 **`全文。5:7b`**——`qwen` 被
按拼音转成了「全文」，半角的 `.` 被转成了全角 `。`。⚠️ **应用这边没错**
（同一串字符走别的路径、以及 `sk-abc-12345` 这种纯字母数字，都是原样进去的）。

⚠️ **判别办法**：落进去的文本里出现**全角标点或汉字**，就是输入法，不是代码。
要送纯 ASCII 且不经过输入法，用 `xdotool key --clearmodifiers` 逐键送，
或者干脆**别用键盘验证**——值可以从落盘文件里读（本节验 `nota.settings` 就是这么做的：
`cat ~/.config/nota/plugin-settings/nota.ai.toml` 拿到的是**逐字节正确**的
`api_key = "sk-abc-12345"`）。

⚠️ **顺带一条真结论**：`nota.settings` 落盘的内容**不经过输入法那层**，
所以"键盘送歪了"和"存歪了"是两件事，**别用界面上的字去判存盘对不对**——
判据是那份 TOML。

**陷阱一：`xdotool` 送 `F8` 时自己带了一个 `Alt`。** 现象是"按 `F8` 状态死活不变"。
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

**陷阱二：本容器的字体栈里没有一个字有 `✓`（U+2713）。** 现象是「视图」菜单里
`状态栏`（明明开着）后面**一个勾都没有**，看着像 `checks` 那条线断了。
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
**别拿"没弹窗"当失败**：容器里可能就没有配默认程序。

### 5.12 验插件那四件（2026-09-24，**已开窗点过**）

**① 面板里的坐标会随窗口/字号漂。点之前先裁一块核一遍。** 这一批踩到的实例：
`插件`菜单的**行距是 30px**（不是我按 20px 估的），于是"点总结"点在了下一项「续写」上——
预览里写着「预览：续写」。⚠️ **症状不是报错，是"功能对了但名字不对"**，
很容易被当成"菜单项与命令对不上"这种真 bug 去查。核坐标的做法见 §5.4。

**② 出网那一格要花真钱、也依赖真密钥。** AI 面板点一次预设就是一次真实请求
（本批用的是用户自己填在 `plugin-settings/nota.ai.toml` 里的密钥）。
⚠️ 所以**别连着点**，也别拿它当"看看界面画得对不对"的手段——**界面那一半可以用别的方式看**
（`render` 是现跑的，改一行 Lua 再刷新面板就能验）。
⚠️ 反过来，这一格的价值恰恰在于它**不是桩**：桩能证明"我们发出去了"，
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
| `nota.http` | 续写真的回来了（「预览：续写」+ 一整段中文）；`追加到文末` 与 `放弃` 点过，`替换全文` 没点 |
| Git 提交 | 一次性仓库里 `3781221 第二份笔记`，状态栏与面板同步 |

---

## 6. 测试清单

```sh
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test
```

⚠️ **`-u 1000` 不能省**（也建议显式带 `-e HOME=/home/lqy`）。`podman exec` 默认是
**root、`HOME=/root`**，而以 root 跑一次这两条测试会**永久毒掉**下一次以 1000 跑的同一批用例：

```
lua::api::settings::tests::写下去的值读得回来
  called `Result::unwrap()` on an `Err` value:
  Write { path: "/tmp/nota-settings-test-roundtrip/t.toml",
          source: Os { code: 13, kind: PermissionDenied } }
```

根因不在代码：这几条用例的临时目录名是**写死的**（`/tmp/nota-settings-test-<名>`、
`/tmp/nota-api-test-<名>`），开头那步 `remove_dir_all` + `create_dir_all` 是为了
"上一次跑剩的"而写的——**但删不掉 root 建的目录**，于是 `create_dir_all` 撞在
一个还在的 root 目录上。⚠️ **症状和"代码坏了"一模一样**（`PermissionDenied`、
两条用例、报在 `.unwrap()`），别去改代码。修法是清掉那几个目录：

```sh
podman exec -u 0 tauri-dev sh -c \
  'rm -rf /tmp/nota-settings-test-* /tmp/nota-api-test-*'
```

📌 **一眼分辨**：报错路径里出现 `/tmp/nota-(settings|api)-test-`，就是这条；
真出错不会长这样。

**当前 121 条，全过**（2026-09-24 实测；最近一批是**插件落地**带来的 31 条：
`lua::api::ui::tests` 6 → 18（面板/菜单项的 `prompt` 与面板内容往返）、
新增 `lua::api::http::tests` 9 条、新增 `lua::api::settings::tests` 7 条、
`lua::tests` 4 → 5（`内置插件都能被_lua_编译`）、
新增 `paths::tests` 2 条。再往前是 **physics 默认值** 1 条、
`slidev_probe` 10 条、**导出/打印 5 条**、**严格模式** 3 条）。
另有**两个 test target 是 0 条**：
`src/main.rs`（只是个壳）与 Doc-tests（`nota_lib` 没有文档测试）。
`tests/` 目录下**只有一个空的 `tests/fixtures/`**，还没有 Rust 集成测试——
所以下面这 121 条**全部是单元测试**。

> ⚠️ 记数只在本文记（121）。别处提到测试数一律写"见 `docs/06`"。
> 核实：`podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test --lib`。

### 6.1 逐条

**`settings::tests`（5）—— 四条外观轴怎么落盘，加 physics 的默认值**

| 测试 | 钉住什么 |
|---|---|
| `默认设置能往返序列化` | `Settings` 存了再读要一模一样。顺带钉住 `content_width` 的默认值是 **760** |
| `文件不存在时回默认而不是报错` | 首次启动没有 `settings.toml` 是正常状态。⚠️ 与"文件存在但解析不了要报错"是**两回事**——后者静默回默认会让人以为设置被吞了 |
| `枚举落盘用_kebab_风格` | **存法即接口**：存的是 `ui_style = "macos"`，不是 `"Macos"`。改 `serde` 属性会打破所有已存的设置文件 |
| `编辑模式也走_kebab_而且默认是所见即所得` | ⚠️ 这条盯着两处**改了不会编译错、只会静默变行为**的地方：落盘名是 `view_mode = "split"` 这种形状；以及 `ViewMode` 的默认值**如实是 `wysiwyg`**——默认值错了的症状是「老用户升级后打开文件发现进了源码模式」，而他的设置文件里根本没有这一项 |
| `physics_默认是关的且能往返` | ⚠️ 钉的是**默认关**这一个事实（它会重定义 `\div` `\Re` `\Im`，见 `docs/10` §12.1）。默认值写错两边的症状都是静默的：开着的默认会让"没开过这个开关的用户"遇到公式变形，而**宏表本身在前端**，后端一条断言都拦不住它 |

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

**`lua::tests`（5）—— 沙箱里到底有什么（BUG-10 的回归锁）+ 内置插件编不编得过**

⚠️ 前四条是**为一处真缺陷**加的，而且是本轮**最严重**的一条：第一道闸曾经是假的。
所以这里既有"结果"的用例，也有"输入"的用例，还有一条**专门记录 mlua 事实**的用例。
第五条是插件落地那一轮补的，钉的是**我们自己的产物**，见下。

| 测试 | 钉住什么 |
|---|---|
| `沙箱里不该有的全局一个都不能有` | **BUG-10 的回归锁**：遍历 `必须为空的全局`（`io`/`os`/`package`/`require`/`dofile`/`loadfile`/`debug`），每个都必须是 `nil`。**谁把 `硬化的_lua()` 换回 `Lua::new()`，这条立刻红** |
| `mlua_的_default_safe_其实含_io_和_os` | ⚠️ **这条是"事实记录"，不是"要求"**：断言的是 `Lua::new()` 里 `io`/`os`/`package`/`require` **确实存在**、只有 `debug` 不在。哪天 mlua 收紧了默认值它会红——**红了别急着删**，那说明本文件顶上那段的前提没了，要重新判一次 `硬化的_lua()` 该怎么写 |
| `白名单里不许有_io_os_package_debug` | 钉**输入**：`插件标准库()` 不含那四个，但含 `coroutine`/`table`/`string`/`math`（后者是防止哪天"顺手删干净"）。结果错可能是白名单开宽了，也可能是 base 库捎带进来的——**两处都可能出错，所以两边都钉** |
| `插件跑不了_os_execute` | **端到端那一下**：在硬化过的 `Lua` 里跑 `os.execute("touch …")` 必须报"`os` 是 `nil`"，且**事后确认文件没被建出来**。光看 `is_nil()` 是够的，但这条更贴插件作者的真实动作，失败时的报错也更好懂 |
| `内置插件都能被_lua_编译` | ⚠️ **钉的是"我们自己的产物"**：`plugins/` 里的 Lua **只有应用启动那一刻才会被编译**，单元测试从来没碰过它们。所以那里写错一个字母，代价是"用户一开应用发现插件没了"，而提交前看不到任何红。⚠️ 顺带把一条 Lua 的语言事实变成断言：**标识符不能写中文**（`local 键 = 1` 是**语法错**，不是"能跑但取不到"；注释和字符串里的中文不受影响）。这条就是替 Lua 把这句话说清楚——它自己报的是 `'<name>' expected near '<\233>'`，看到那句很难想到"是我用了中文变量名" |

> 📌 **为什么值得为一条 bug 加四条用例**（前四条是 BUG-10 的，第五条是插件那一轮另加的）：
> 这个洞的形态是"**信任了一个库的安全标签**"，
> 而这类错误**不会被编译器、也不会被别的用例抓到**——`Lua::new()` 编得过、跑得通、
> 插件行为看起来正常。唯一的防线就是有人明确写下"`io` 必须不存在"并让它可执行。
> `mlua_的_default_safe_其实含_io_和_os` 那条尤其别扭（它在断言一个**坏的**事实），
> 但它的价值正在于此：**把"库的 safe 不等于安全"这件事变成一条会红的断言。**
>
> 📌 **`内置插件都能被_lua_编译` 是同一种"没人会替你抓"**：`plugins/` 是两个
> 真的 Lua 文件，而它们的生命周期里**没有编译期**——检查只发生在应用启动那一刻。
> 所以这条用例是给它们补一个"编译期"。

**`lua::api::fs::tests`（5）—— 工作区围栏（本仓最早的那道安全边界）**

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

**`lua::api::ui::tests`（18）—— 面板/菜单项的往返 + 面板内容的往返（BUG-13 的回归锁）**

前六条是**为一处真缺陷**加的：病灶是**写的一侧和读的一侧各写各的**
（`register_panel` 往 registry 里写，`plugin::读面板` 读出来），
所以这几条**故意让两头都参与**——只测一头永远测不出来。

后十二条是**面板内容**（`render`）那一半的同一回事：`register_panel` 把
`render` 存进 registry，`面板内容()` 现调它、剥成 JSON 再交给前端。
⚠️ 这几条也**故意让两头都参与**：只测一头测不出"存进去时把 `render` 弄丢了"。

| 测试 | 钉住什么 |
|---|---|
| `通知层级归一化` | `warn`/`warning` → `warn`，`error`/`success` 原样，**认不出的一律 `info`**。⚠️ 别把插件的笔误变成一次报错——那会让人为一个无关紧要的通知层级去读栈 |
| `注册的面板读得回来` | **BUG-13 的回归锁**：注册一个面板要能原样读回，且 `location` 不写时**默认到右侧插件栏**（`sidebar` 是左栏还兼职装插件时的事） |
| `面板不写_title_就拿_id_顶上` | `title` 是可选的，但读回来不能是空串——拿 `id` 顶上 |
| `面板重名要报错` | 同一个 id 注册两次要报「重复注册面板」，⚠️ 而且**不能留下半条**（报错之后读回来还是一个） |
| `没声明过就读回空表` | 没申请能力的插件，registry 里压根没这个键——**读回空表，不是报错**。报错会让"装了但不带面板的插件"看起来像坏了 |
| `注册的菜单项读得回来` | 同一条路走菜单项：`menu` 不写默认挂在 `plugins` 下；顺带钉住 `accelerator` 和 `prompt` **不写就是没有**（不是空壳） |
| `菜单项的_prompt_读得回来` | 「提交…」要的就是这个：点了先弹框问提交信息，答完才跑命令。⚠️ 走真的 Lua 源码（`lua.load(...)`）而**不是**手搭 `mlua::Table`——插件作者写的是源码，两条路之间差着 Lua 自己的表构造。顺带钉住 `secret` 默认 `false`、`hint` 不写给空串（不是 panic） |
| `没有_arg_的_prompt_当没写` | 没有 `arg` 的 `prompt`（用户填的值没地方放）**当没写**：问了也送不出去，那就别问。⚠️ 与"用户按了取消"是两回事，前端那边见 `docs/04` §2.6d |
| `面板渲染出来的内容读得回来` | **内容那一半的回归锁**：`heading`/`list`/`buttons` 三种节点原样读回，`badge`、`command` 这些字段一个不少 |
| `每次读都重新跑一遍_render` | ⚠️ **这条钉的是"内容每次都是现跑的"**：连读三次要拿到「第 1 次」「第 2 次」「第 3 次」。面板内容不是快照——git 的改动列表每次都得现问 git。做成"注册时跑一次存起来"的话，界面上会一直显示应用刚启动那一刻的改动，而且**看着像是对的** |
| `渲染抛错时报的是插件自己的错` | `render` 里 `error("磁盘满了")` → **一句人话**，不是一个裸的 Lua 栈：错误里要同时有插件自己那句话和「渲染失败」这个定位 |
| `没有_render_的面板如实说没有` | 注册了面板但没写 `render` → 报「没有提供 `render`」，不是给一张空内容 |
| `没有的面板要报出来而不是给空` | id 压根没声明过 → 报「没有声明面板」。⚠️ 与上一条是**两种病**，报的话也不能一样，否则插件作者分不清是"忘了写 render"还是"面板名写错了" |
| `render_不是函数当场就报` | `render` 写成了表 → **注册时就报**，不拖到用户打开面板。拖到那时候，报错的地方（前端一个渲染失败）离病因（插件里把 `render` 写成了表）已经很远了 |
| `超长文本截断且不劈开汉字` | 按**字符**截到 `面板文本上限`，且一个汉字不该被劈成半个；截断处留一个 `…` 当记号 |
| `过不了_json_的值变成_null` | 函数、userdata 这些过不了 JSON 的值**替换成 `null` 而不是变成假字符串**（`"[function]"` 那种）；同一个表里别的字段不受影响。⚠️ 键名只能是 ASCII——Lua 的标识符不含汉字，`回调 = …` 是**语法错**不是"能跑但取不到" |
| `自引用的表不会打穿栈` | 自引用的表走到 `面板层数上限` 就停，最后是 `null`——不是栈溢出。⚠️ 这不是防坏人，是防手滑 |
| `一层的项数有上限` | 一个数组超过 `面板节点上限` 就截。**不是为了防坏人，是为了防手滑**：一个插件把整个目录树铺进面板，前端会卡死 |

**`lua::api::http::tests`（9）—— 只有插件能发请求，那围栏就得在这里**

⚠️ 这九条里**前四条是安全用例**，不是格式用例。`nota.http` 是本仓第二个
真正的安全边界（第一个是 `lua::api::fs`），而它的形状特别容易写反：
"看着像回环其实是外网"。

| 测试 | 钉住什么 |
|---|---|
| `只放行_https_和回环的_http` | ⚠️ **这条是这一整个模块里最该在的一条**：明文 http 会把插件的 API key 和文档内容一起发在裸链路上，唯一的例外是本机回环（给 Ollama / LM Studio 这类跑在自己机器上的服务留的口子，流量根本不出这台机器）。放行 `https://…`、`http://127.0.0.1`、`http://localhost`、`http://[::1]`；挡掉外网 `http://`、局域网 `192.168.x`、`0.0.0.0`、`ftp://`、`file://`、以及**没写协议头的** |
| `取主机要能拆出端口和_userinfo` | `example.com:8443` → `example.com`，`user:pw@example.com` → `example.com`，`[::1]:8080` → `::1`，主机名小写化。⚠️ 其中一条是安全用例：`127.0.0.1@evil.com` 的主机是 **`evil.com`**，不是 `127.0.0.1`——判反了就是一个"看着像回环其实是外网"的口子 |
| `主机名骗不过回环判定` | `127.0.0.1.evil.com`、`localhost.evil.com`、`notlocalhost` 都不是本机。⚠️ 判据是**整个主机名等于**，不是"包含" |
| `方法只有那六个` | `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD` 在里面，`CONNECT`/`TRACE` 不在 |
| `超时截到上限` | 不写 → 默认 30 s；写 5 s → 5 s；写 600 s → **截到 `最长超时`（180 s）而不是报错**（插件写个大数，意思是"可能很慢"）；写 0 → 报错（0 是没意义的超时） |
| `两种写法都归一化` | `get("url")` 与 `get{url=…}` 归一到同一张表；方法是**就地写进那张表**的（所以插件手里那份也变了）；⚠️ 插件自己写的 `method` **不被覆盖**；认不出的类型（给了个整数）要报错，别静默当 `GET` 发出去 |
| `认得插件自己写的_content_type` | 插件自己写了 `content-type` 就得认出来——不然表体那一下会补出**第二个** content-type 头（`Request::builder().header()` 是**追加**不是替换），而这正是本模块实测踩到的那个 bug。大小写不同也算同一个头（HTTP 头名不区分大小写） |
| `响应是_json就拆好放进去` | 响应体是 JSON 就顺手拆好放 `json` 键里——AI 插件读 `choices[1].message.content` 靠它。⚠️ 这条顺带钉住**下标从 1 起**：写成 0 起的话数组第一个元素会静默丢掉，而插件那边看到的是"模型没给出回答" |
| `不是_json就没有_json这个键` | HTML 错误页、空体这种 → **没有 `json` 这个键**，`code` 和 `text` 照旧。这是"别把解析失败当错误"那条注释的落点——4xx/5xx 的响应体要能到插件手里 |

**`lua::api::settings::tests`（7）—— 插件自己的那份设置怎么落盘**

⚠️ 这些用例走的是**真的文件**，不 mock。这一格的全部价值就是"关掉应用再打开还在"，
而内存里的表当然会通过所有内存里的用例。

| 测试 | 钉住什么 |
|---|---|
| `写下去的值读得回来` | 基本来回：字符串、整数写下去要从盘上原样读回 |
| `文件头那段注释不影响读` | 文件头是我们自己塞的一段注释——**它不能影响读回来**。这句话看着理所当然，但它就是"我们往 TOML 里塞了一段自己写的东西"的那条边界 |
| `设置文件是_0600` | ⚠️ 文件里会有明文密钥，权限必须是 `0600`，**覆盖写之后还是 `0600`**。⚠️ `#[cfg(unix)]`，Windows 上不跑 |
| `坏文件当空的用而不是报错` | 手改坏的设置该表现为「回到默认值」，**不该让插件加载失败**。⚠️ 与"文件不存在"是同一档处理，但和 `settings.rs` 里"文件存在却解析不了要报错"是**两回事**——见本文 §6.1 第一条 |
| `键里不许有点和怪字符` | 键只收 ASCII 词、不含点。⚠️ 因为 TOML 里 `a.b = 1` **等价于** `a = { b = 1 }`——键里带点会写进去读不回来。空键、非 ASCII 键（`模型`）都要报错 |
| `只收三种标量` | `nil` = 删掉这个键；`bool`/`integer`/`number`/`string` 收；表要报错且错误里带上「只支持」。⚠️ 复合值收下的话，插件那边的设置文件会长成它自己都不认识的样子 |
| `手改出来的复合值读回来是文本不是_nil` | 用户手改出来的数组/表：**读回来不能变成 `nil`**。变成 `nil` 的后果是插件以为"这个键没设过"，于是写回默认值把用户写的东西盖掉——**一次静默的数据丢失，而且看起来像是插件自己抽风** |

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

**`commands::export::tests`（5）—— 导出的落盘口径**

⚠️ 这一组**不碰 HTML**（HTML 由前端生成，见 `docs/05` §4.5）——它管的是
**落点**和**透明**这两件事。

| 测试 | 钉住什么 |
|---|---|
| `打印落点跟着文档目录走` | 有文档路径 → 落**文档自己那个目录**下的 `.nota-print.html`。⚠️ 这不是图省事：正文里 `![](./img.png)` 是相对路径，换个目录图片就全丢 |
| `没有文档路径就落到系统临时目录` | 未保存的新文档没有"自己的目录"，只能落临时目录（文件名前缀 `nota-print-`） |
| `标题里的分隔符会被换掉而不是拼出子目录` | `/` `\` `:` 等全换成 `-`：不换的话 `title = "a/b"` 会在用户目录里**凭空造出子目录** |
| `标题洗成空串或只剩横杠时不留下无信息也不留下隐藏文件` | ⚠️ 这条修出过一个真 bug：`清文件名("/")` 得到的是 `-` 而不是空串，于是造出一个**名字带点、又没有任何信息**的文件。判据是"空串**或者**全是横杠"都算没信息 → 用「未命名」 |
| `写出去的字节与给进来的一模一样` | `nota_export_write` 是**只透明**的接口：不补 `\n`、不改编码、不加 BOM。⚠️ 与严格模式那条口径同源（用户 2026-09-23：「如果关闭，存盘不要自动修复」） |

**`native_menu::tests`（6）—— 原生菜单兜底那份键位表**

⚠️ 这一组盯的是**全仓唯一一处"抄表"**：`to_native_accel` 把 `commands.ts` 里的
`Ctrl+…` 写法翻成 muda 认的 `CmdOrCtrl+…`。翻错了**不报错**，只是那一条按下去没反应——
而"按下去没反应"正是这个仓库最怕的那种失效，所以这里测得很细。

| 测试 | 钉住什么 |
|---|---|
| `全部键位都转得出来` | 逐条核对那张**手抄**的 50 条表。⚠️ 箭头那两条要特别当心：`commands.ts` 写的是字形 `↑`/`↓`，**muda 不认字形**，得翻成 `Up`/`Down` |
| `手抄的表和_commands_ts_一样多` | 只挡"键位涨了、表没跟"这一种漂移。⚠️ **它挡不住"两处一起忘"**——2026-09-23 加三种编辑模式时条数 48→50，而测试当时还是绿的（表里那 48 条自洽、断言也只是常量比常量）。真要同步，回去 `grep -c "accel:" src/ui/commands.ts` |
| `ctrl_转成_cmdorctrl_而不是真的_control` | ⚠️ 直接照抄 `"Ctrl+S"` 给 macOS，菜单上画 ⌘S 而实际绑到**真的 Control 键**。断言必须**整个相等**——曾经写的 `!contains("Ctrl+")` 对一个**正确**的实现也报错（`CmdOrCtrl+S` 里本来就含这个子串），只会误导人 |
| `拿不准的一律不放行` | 认不出来就给 `None`（这条没有快捷键），**不是**瞎猜的字符串；多字节键名（`Ctrl+€`）不许 panic |
| `灰掉的项不带快捷键` | ⚠️ **功能性的**，不是洁癖：macOS 上禁用的菜单项照样吃自己的键位，灰着的 ⌘C 会把复制粘贴弄坏 |
| `分隔线不看别的字段` | `sep: true` 的项不吃 `label`；且 `enabled` 的**默认值必须是 `true`**——否则整份菜单全是灰的 |

**`themes::tests`（6）—— 文档主题的发现、围栏与"不许碰外壳"**

⚠️ 这一组 2026-09-23 换过一次（上一版是给"兼容 Typora 主题"写的，那版作废）。
**最重要的一条是 `内置主题不碰界面变量`**，它不是普通的用例，是**一条设计约束的机器判据**。

| 测试 | 钉住什么 |
|---|---|
| `内置主题的_id_与文件名一一对应` | `BUILTIN` 表里的 `id` 真能在 `src/styles/themes/` 下找到同名文件（⚠️ 名字写错、或者 CSS 文件被改名，这条先红） |
| ⚠️⚠️ `内置主题不碰界面变量` | 逐份扫内置 CSS，**不许出现** `--ui-font-size` / `--font-ui` / `--sidebar-width` / `--dock-width` / `--toolbar-height` / `--statusbar-height` / `--shadow` / `--nota-bridge`。**它就是「文档主题碰不到外壳」这条线的机器判据**——没有它，哪天有人图省事在主题里加一条界面变量，谁都不会发现 |
| `内置主题都带自己的一套代码高亮` | 每份都要有 `--code-*`。⚠️ 代码块底色是主题挑的，缺了会"深底配深字" |
| `拒绝形状不对的_id` | `check_id()` 挡住 `../x`、`a/b`、空串、超长、中文——**这是文档主题唯一的围栏**，路径是拿它拼的 |
| `取一份不存在的主题要报错而不是给空串` | ⚠️ 静默降级成"没样式的裸 HTML"是这里最坏的结果，用户根本不知道是自己把文件删了 |
| `目录不存在时清单只剩内置的` | ⚠️ **"用户目录空的"不是错**——没装过任何主题的机器就是这种情况，返回的还是那六条 |

**`slidev::tests`（10）—— 预览服务器的生命周期**

⚠️ 这一组**不碰真 Slidev**（第一次要下几百 MB），也**不起 GUI**：
测的都是"在本地就能做完的那几件"——挑端口、写入口、杀进程组。
端到端那条链（起进程 → 探活 → 开窗口 → 同步 → 收摊）见 §5.7 用替身验。

| 测试 | 钉住什么 |
|---|---|
| `挑出来的端口两套栈都能绑` | `pick_port()` 拿到的口子 v4/v6 上都得是空的。⚠️ Slidev 只绑 `[::1]`，而别的工具可能只占 v4——只试一套就会挑中一个用不了的口。<br>⚠️ **它带重试（连试 10 个端口），别当成写冗余**：这条会和机器上**别的东西**赛跑。2026-09-24 实测——`--test-threads=1` 连跑 6 次全绿，4 线程时约 **3/4 会红**（红的总是 v4 那句 `AddrInUse`），清掉当时还在跑的 `nota` + `vite` + `Xvfb` 之后，6 次全量并行跑又全绿。**机制没查清**：当时 `ss -ltnp` 只报出**测试自己刚绑上的那个 `[::1]`**，而同一容器里用 Python 验过 `[::1]:P` 与 `127.0.0.1:P` 互不影响（两种绑定顺序都成功），所以"看得见的那个占用者把它挡住了"讲不通——剩下的解释是**看不见的 TIME_WAIT**（`ss -ltnp` 只列监听者，一个还占着本地端口的 TIME_WAIT 连接照样能让 `bind` 报 `EADDRINUSE`），但没验到。<br>⚠️ **所以这条测试能钉的只有"某一次两套栈都能绑上"**：真要红，得连试 10 个端口都失败，那时 panic 里会带上每一个端口的 v6/v4 错误 |
| `入口写在文档同目录且点开头` | 入口落在**文档自己的目录**（Slidev 拿入口的父目录当项目根，`![](./img.png)` 才解析得对），名字是 `.nota-slidev-<id>.md`——点开头，文件管理器默认不显示，也不容易和用户的 `slides.md` 撞名 |
| `文档目录写不进去时退回数据目录` | 未存盘 / 只读目录 → 退到 `~/.local/share/nota/slidev/`。⚠️ 这是"新建的空文档也能预览"的全部依据 |
| `入口文件名跟着文档走_不会互相覆盖` | 名字里带文档 id：两份文档先后开预览不会互相盖掉 |
| `同步是整份替换而不是追加` | 写入口是**整份覆盖**。⚠️ 追加会让 Slidev 每改一次正文就多出一份幻灯片 |
| `没在跑时同步不报错` | ⚠️ 空操作返回 `Ok(())`、**不是错误**——前端不必先查状态再写 |
| `日志环只留最后几行` | 启动失败的报错要能整段端给人看，但**不能无限涨**：环里只留最后 30 行 |
| `杀的是进程组而不是那个壳` | ⚠️ 进程链是三层（`sh` → `npm exec` → `node`），只杀 child 会留下 node 继续占着端口 |
| `收摊之后进程真没了` | 杀完要来真的确认：进程没了 + 入口文件删了。⚠️ 「用户叉掉预览窗 → 服务器跟着收」那条链在容器里验不了（见 §5.7 第二个坑、§6.2），**兜底的就是这条** |
| `命令不存在时报的是人话` | `NOTA_SLIDEV_CMD` 指错了命令 → 报错要带上**那句命令**和它的输出尾巴，而不是一个 `Os { code: 2 }` |

**`slidev_probe::tests`（10）—— 「装没装」的判据**

⚠️ 这一组**真起进程**（`printf` 当假 CLI、`sleep` 当挂住的自定义命令），没有 mock：
探测的全部风险就在"真程序在真系统上怎么反应"，mock 掉就白测了。
⚠️ 它们是 2026-09-24 从 `slidev.rs` 拆去 `slidev_probe.rs` 的（那边当时 1023 行，见 `docs/09` §4）。

| 测试 | 钉住什么 |
|---|---|
| `默认命令不再自动装包` | ⚠️ **盯着 `DEFAULT_CMD` 里不许出现 `--yes`**：它一旦回来，"没装"就变成一次几百 MB 的下载 + 一段漫长等待，而用户以为已经装好了 |
| `拆命令按空白分词` | `npx @slidev/cli` → (`npx`, [`@slidev/cli`])；空命令是 `None`（没命令可跑，不是"跑一个空程序"） |
| `主题装没装看的是项目里的_node_modules` | 有 `node_modules/@slidev/theme-default` 才算；空目录不算。⚠️ **`@slidev/cli` 不自带主题**——这是"包拿得到但起不来"那条实测结论的机器判据 |
| `主题在上一层父目录里也一样算` | 文档放在项目的**子目录**里（最常见的放法）不该被误判。⚠️ Node 解析 `node_modules` 就是一层层往上找的 |
| `没装_node_时探测点名_node` | 命令根本不存在 → 文案要提 **Node**（该装的是它），而不是丢一个 `Os { code: 2 }` |
| `命令能报版本但文档没存盘时仍然拦住` | 版本拿到了、但没有项目目录 → 仍判 `missing`，并且要说清**是缺目录** |
| `命令和主题都在才说可以打开` | 两条都成立 → `Ready`，且**把版本号报出来**、`project_dir` 填上 |
| `光有命令没有主题也拦住并且说清缺什么` | 2026-09-24 实测到的那条：CLI 从 npm 缓存拿得到，空目录里起照样立刻退出。文案要落到"**还不是一个 Slidev 项目**" |
| `自定义命令挂住时超时而不是一直等` | 20 秒上限真的生效（⚠️ 用例里把超时调到 300ms 跑，不然太慢） |
| `报错时留的是末尾几行而不是整篇` | `tail_of` 只留最后 8 行、每行截 200 列；空输出不留一堆空行（面板上那块会白占地方） |

### 6.2 这些测试**没**覆盖什么

⚠️ 别把"全过"读成"哪都没问题"。**八条**已知的空白：

| 空白 | 为什么 |
|---|---|
| **`HostContext` 相关的一切** | 它要一个**真的 `AppHandle`**，构造不出来。所以 `nota.document.*` / `nota.ui.*` 发事件那几条路**没有单元测试**——这正是 `AGENTS.md` §4 那条"**别把安全边界写在 `HostContext` 里面**"的由来：写了就没法测 |
| **`HostContext` 之外的插件加载流程** | `PluginHost::discover` / `LuaPlugin::load` 都要 `HostContext`。所以"插件真能被加载"只能在 §5 开窗（或至少起 Xvfb）验 |
| **前端** | 没有任何前端测试（`package.json` 里没有测试框架）。前端靠 `tsc --noEmit` + §5 抓图 **+ §5.6 那个试验台**。⚠️ 试验台那几场里，**`#math`（physics 宏表逐条真渲染）与 `#sidebar` / `#sidebar-empty`（折叠、那颗 ×、空态那颗按钮）是唯一能"问"出结论的地方**——它们证明的是"表推得对、DOM 长对"，**证明不了**在真 Tauri 窗口里按下去真响 |
| **文档主题的限域逻辑** | `styles/doc-theme.ts::scopeDocThemeCss()`（把选择器收到 `.editor-pane` 之下、`:root`/`html`/`body` 改写成锚点、`@media` 下钻）**一条测试都没有**，而它是「文档主题碰不到外壳」这条线的全部实现。原因是前端没有测试运行器。**今天的判据是间接的**：Rust 那侧 `内置主题不碰界面变量` 只保证**内置那六套的 CSS 里没写界面变量**；"限域算法本身对不对"仍然只能靠人看版式（换主题后看外壳有没有变、编辑区有没有生效） |
| **「用户叉掉预览窗 → 服务器跟着收」这条链** | ⚠️ **在容器里验不了**：裸 Xvfb + 没有窗口管理器的环境里，关**任何**窗口都会让应用撞上 `BadDrawable` 直接 `abort`（**关主窗口也一样**，A/B 验过），`Destroyed` 回调根本没机会跑。详见 §5.7 第二个坑。兜底的是 `slidev::tests` 的 `收摊之后进程真没了` 与真机行为 |
| **`挑出来的端口两套栈都能绑` 里那条重试** | ⚠️ 它是 2026-09-24 为了**止住并行跑时的偶发红**加的：那次现象是 v4 绑不上、`ss` 又只看得见测试自己的 v6，**真机制没查清**（猜测是看不见的 TIME_WAIT）。重试让这条测试不再对"机器上别的东西"负责，代价是**它也可能盖住 `pick_port` 真坏掉的那一次**——兜底只剩 panic 里"连试 10 个端口全失败"这句。真要看它，得在**没别的应用在跑**的机器上单线程跑（`--test-threads=1`） |
| **「真装了一份 Slidev」那一格** | ⚠️ **本仓最老的欠账**（`docs/07` 第 44 项）：不管探测还是预览，所有证据要么来自 `tools/stub-slidev.py`、要么来自"没装"那一档。`ready` 那一格**从没在真装过的机器上点过**——本机没有真 Slidev，而装它要几百 MB（`npx @slidev/cli` 一次 53.0.0 的下载）。所以"装了之后能不能开预览窗"这件事，仍然只有替身作证 |
| **"在真窗口里按下去真响"** | §5.6 那个试验台把快捷键的**表**验到条条不差，但它验不了 Tauri 窗口里 `keydown` 真被送达、也验不了 macOS 原生菜单真挂上去了。这两件事**目前一件都没验过**（原生菜单那份代码在 Linux 上连执行都没执行过） |

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
