# AGENTS.md — Nota 开发入口（AI 智能体与人类必读）

> 本文件是**唯一入口**。任何 AI 智能体或人类在修改本仓库前，必须先读本文件，
> 再按需阅读 `docs/` 下的对应文档。目标是：**不读源码也能开始开发**。

---

## 0. 硬性规则（不可跳过）

1. **先读文档，再改代码。** 至少阅读：
   - `docs/01-architecture.md`（整体架构）
   - `docs/02-modules.md`（要改的模块）
   - `docs/07-feature-status.md`（当前哪些能用、哪些是空壳、有哪些已知缺陷）
   - 需要新增 UI/功能时，读 `docs/08-development-guide.md`。
2. **改完代码必须同步文档。** 这不是建议，是完成定义（Definition of Done）的一部分。
   映射关系见 `docs/09-doc-sync-policy.md`。提交前运行 `tools/doc-sync-check.sh` 自检。
3. **不要假设某个按钮能用。** 先查 `docs/07-feature-status.md` 与 `docs/04-ui-map.md`。
4. **不要凭猜测写接口。** 公开函数签名以 `docs/02-modules.md` 为准；
   若文档与代码不一致，**以代码为准并立即修正文档**。
5. **提交 GitHub 之前，不必兼容老文件 / 老插件 / 老接口**（沿用 Folio 同一条口径）。
   改清单格式、改 Lua API、改设置项的键——**直接改**，同一批把插件、前端、用例、
   文档一起改到新形状即可。
   **触发条件（这条会到期）**：只在**首次提交到 GitHub 之前**成立。一旦对外发布
   它就作废，从那以后老文档要能开、老插件要能加载。
   ⚠️ **它不豁免"同一批必须全改干净"**：留着半新半旧两套形状比"不兼容"更糟。
6. **任何 `.rs` / `.ts` / `.tsx` / `.lua` 文件不得超过 1000 行**，超了就地拆分
   （口径见 `docs/08-development-guide.md` §1.1）。`tools/doc-sync-check.sh` 会检查。

---

## 1. 项目是什么

**Nota** 是一个 **Tauri 2** 桌面 Markdown 编辑器，**功能对标 Typora**
（逐项对照矩阵在 `docs/10-typora-parity.md`），带 **Lua 插件系统**、**AI 助手插件**
与 **Git 版本控制插件**。

- 后端：Rust（`src-tauri/`），Tauri 2
- 前端：React 19 + TypeScript + Vite，编辑器内核是 **Milkdown 7**（ProseMirror + remark）
- 插件：**Lua 5.4**（mlua，`vendored`），每个插件一个**独立的 Lua 状态**
- 应用 ID：`io.github.nota.Nota`
- 版本：`0.1.0`（`src-tauri/Cargo.toml` 与 `package.json` 两处）
- 代码注释与文档使用中文；界面字符串目前直接写中文（**尚未接 i18n**，见 `docs/07`）

**名字**：Nota 是意大利语「笔记」，与工作区里的 Folio（对开本）/ Fascia（幻灯片）/
Forma（表格）同一家族。项目结构参照 Folio。

### 与 Folio 的关键差别（别照搬那边的结论）

| 维度 | Folio | Nota |
|---|---|---|
| 界面层 | GTK4 + libadwaita（原生控件） | **WebView 里的 HTML/CSS**（`src/ui/*.tsx`） |
| 编辑区 | WebKitGTK 6 里的 `contenteditable` | **WebKitGTK 4.1 里的 ProseMirror 文档树** |
| 插件 | 进程内 C ABI（`.so`），**无沙箱** | **Lua 状态隔离 + 能力白名单**（宿主 API 按能力装配） |
| 文档模型 | HTML（`.htd` / `.htdp`），格式表由插件认领 | **Markdown 纯文本**，无格式表 |
| 构建 | Meson + Ninja | Cargo + npm/Vite |

⚠️ **最要紧的一条**：Folio 的 `FoWindow` **不是 GObject**、`use-markup` 默认 TRUE 这类
坑在 Nota 里**都不存在**（没有 GTK 控件树）。反过来 Nota 有自己的坑，见 §4b。

---

## 2. 代码地图（一句话）

### 后端 `src-tauri/src/`

| 文件 | 职责 |
|---|---|
| `main.rs` | 进程入口，只是 `nota_lib::run()` 的一层壳 |
| `lib.rs` | `run()`：建 Tauri、装 dialog/fs/opener 插件、`setup()` 里**按顺序**做三件事（载设置 → 建共享状态 → 发现并加载插件）→ `manage(AppState)`；全部 `nota_*` 命令的注册表；`on_window_event` 在窗口销毁时 `unload_all()` |
| `error.rs` | `NotaError` 枚举，**中文 Display 消息**，自定义 `Serialize` 以便过 Tauri IPC |
| `paths.rs` | XDG 目录（`~/.config/nota`、`~/.local/share/nota`）、`settings_file()`、`user_plugins_dir()`、`builtin_plugins_dirs()`（debug 构建额外返回仓库的 `plugins/`）、`theme_dirs()`（三个主题来源，**按优先级排序**：我们自己的 → Typora → Typora flatpak，靠前的盖掉同名的） |
| `state.rs` | `AppState`：四个共享句柄。**锁顺序不变量写在文件头**（`plugins → documents → settings`） |
| `settings.rs` | `Settings` 与三条**互相独立**的外观轴（`ui_style` / `ui_mode` / `document_theme`），kebab-case 落盘 |
| `document/mod.rs` | `DocId` / `Document` / `DocumentStore`；`derive_title()`（front matter → 一级标题 → 文件名）；**「前端是文本的唯一真相、后端持有 300ms 镜像」这条口径写在文件头**。⚠️ `untitled_index`（未命名序号，建时定死）与 `clean_text`（比脏标记的那一份）不许省 |
| `commands/mod.rs` | 命令模块的表；只有 `pub mod` 声明，没有逻辑 |
| `commands/document.rs` | `nota_doc_*` 十一个命令。⚠️ `settle` 是唯一一个**不当作编辑**的写入口（装载后的规范化认领），它有测试盯着，别合并进 `sync`） |
| `commands/workspace.rs` | `nota_workspace_*` 四个命令 + `TreeNode`（**相对路径、`/` 分隔**） |
| `commands/settings.rs` | `nota_settings_get/set`（整份替换；保存失败则回滚内存） |
| `commands/plugin.rs` | `nota_plugins_list` / `nota_plugin_set_enabled` / `nota_plugin_call` / `nota_plugin_find_command` |
| `themes.rs` | 主题的**发现与读取**。扫三个目录（我们自己的 + Typora + Typora flatpak），**不随包发布任何第三方主题**（版权）。⚠️ **资源读成 `data:` URL 而不是返回路径**——asset 协议在 WebKitGTK 上取不回字体，判据在文件头 |
| `commands/theme.rs` | `nota_themes_list` / `nota_theme_read` / `nota_theme_asset` / `nota_themes_dir` 四条 |
| `plugin/mod.rs` | `PluginHost`：**发现 → 加载 → 派发 → 卸载**；`PluginInfo` 是给前端的只读快照 |
| `plugin/manifest.rs` | `Capability` 枚举、`PluginMeta`、`Manifest`、`NOTA_PLUGIN_API_VERSION`、**`channel_id()`**（事件通道名归一化） |
| `lua/mod.rs` | `HostContext` / `LuaPlugin` / `PluginState`；一个插件一个 `Lua` |
| `lua/api/mod.rs` | `nota` 表的构造：**按清单声明的能力决定装哪些子表**；辅助函数 `lua_err` / `lua_to_json` / `not_implemented` |
| `lua/api/document.rs` | `nota.document`：读（`get_text` 等）/ 写（`set_text` / `append_text`，写完发事件通知前端） |
| `lua/api/fs.rs` | `nota.fs`：读写文件，**限死在当前工作区内**；裁决逻辑是纯函数 `resolve_in()` |
| `lua/api/git.rs` | `nota.git`：**子进程**跑 `git`，不是 libgit2；拒绝会重定向目标目录的参数 |
| `lua/api/ui.rs` | `nota.ui`：`notify` / `register_panel` / `register_menu`。⚠️ 2026-09-22 起**不再是三个都发事件**：`notify` 推事件（发生），后两个写 registry 供宿主**拉**（声明）。判据见 `docs/07` BUG-13 |

### 前端 `src/`

| 文件 | 职责 |
|---|---|
| `main.tsx` | React 入口 |
| `App.tsx` | 外壳与全部状态：文档表、活动文档、设置、工作区、插件、toast、侧栏/插件栏/状态栏开关、主题表；快捷键一整张表在 `useEffect` 里；⚠️ **`menuHandlers` 是"菜单项能不能点"的唯一真相**——灰不灰由它推出来，不另设标志位 |
| `bridge/ipc.ts` | **调用后端的唯一出口**。`api.doc.*` / `api.workspace.*` / `api.settings.*` / `api.plugin.*` / `api.theme.*`、`on<T>()`、`events` 名字表 |
| `editor/create.ts` | Milkdown 封装，对外只有 `EditorHandle` **五个**方法（最后一个是 `runCommand`，菜单栏与快捷键从这儿进）。⚠️ 插件清单里**没有什么**和有什么一样重要，理由在函数注释里 |
| `editor/instant-render.ts` | 光标所在块的 Markdown 标记（`##`、`>`、`-`）浅灰画在块左边。⚠️ 用 **`Decoration.node` 不是 widget**，理由在文件头 |
| `editor/task-list.ts` | 任务项复选框：画方框 + 点它勾上。⚠️ **不改 schema**——`data-checked` 是 `preset-gfm` 本来就给的 |
| `editor/code-block.ts` | 代码块 NodeView：语言选择器 / 复制 / 折叠。**全仓唯一一处 `$view`** |
| `ui/EditorPane.tsx` | 编辑器挂载点。**那个 div 从不被 React 重新渲染**（Milkdown 拥有那棵 DOM）。对外句柄多一个 `runCommand`，菜单栏的命令从这儿进 |
| `ui/MenuBar.tsx` | 顶部菜单栏（文件/编辑/段落/格式/视图/主题/帮助）。⚠️ 关闭用 **`mousedown` 不是 `click`**，主题那一栏是**动态**的（`entries` 由 App 现算） |
| `ui/commands.ts` | 菜单的**静态骨架**：一栏一项抄自 `docs/10` §11.1。⚠️ 这里**没有** `disabled` 标志位——灰不灰由 App 的 `menuHandlers` 推 |
| `ui/Sidebar.tsx` | 侧栏两页：文件（工作区树）/ 大纲。⚠️ `tab` 是**受控**属性（菜单栏也要能切它） |
| `ui/PluginDock.tsx` | 右侧插件栏：插件声明的面板 + 清单。**为什么在右边**写在文件头 |
| `ui/ConfirmDialog.tsx` | 自绘确认框，替掉 `window.confirm`（**它阻塞 WebView、会打断输入法组合态**） |
| `ui/Home.tsx` | 没有文档时那一屏 |
| `ui/StatusBar.tsx` | 未保存状态、字数**四项**（词/字符/行/分钟） |
| `ui/Toasts.tsx` | 提示条 |
| `ui/ErrorBoundary.tsx` | 兜住前端渲染错误 |
| `ui/outline.ts` | 大纲与字数的**纯函数**（启发式正则，跳过 front matter 与围栏代码块） |
| `styles/theme.css` | 三条外观轴的 CSS 变量。**二维相乘**：`[data-ui-mode]` 只给颜色、`[data-ui-style]` 只给形状。末尾那段把 Typora 主题的变量**桥**到外壳上 |
| `styles/applyTheme.ts` | 把三条轴写到 `<html>` 的属性上 |
| `styles/typora-theme.ts` | **Typora 主题的加载与改造**（"兼容 Typora 主题"整件事的核心）。四步：展开 `@import` → `url()` 换成 `data:` → 用 `CSSStyleSheet` 解析 → 把裸元素选择器收拢进 `#write`，同时把 `:root` 变量**提升到全局**供外壳桥接 |
| `styles/app.css` | **外壳**：窗口骨架 → 主页，加菜单栏与确认框 |
| `styles/editor.css` | **正文编辑区**：编辑区外壳、块标记、代码块、任务列表。⚠️ 2026-09-22 因撞 1000 行上限从 `app.css` 按职责拆出；加载顺序必须是 `theme → app → editor` |

### 插件与工具

| 路径 | 职责 |
|---|---|
| `plugins/git/` | **内置 Git 插件**（`plugin.toml` + `main.lua`）：状态解析、diff、提交。是"一个插件到底怎么写"的活样例 |
| `plugins/ai/` | **内置 AI 助手插件**：提示词模板 + 写回文档。⚠️ **网络那半在宿主侧尚未实现**（`nota.http` 是一张「尚未实现」的表） |
| `tools/gen-icons.py` | 纯标准库的 PNG 图标生成器（不依赖 PIL） |
| `tools/doc-sync-check.sh` | 文档同步与行数上限的启发式检查（见 `docs/09`） |
| `.github/workflows/release.yml` | 六个平台的打包矩阵（Windows x64/arm64 的 exe、macOS 双架构 dmg、Linux 双架构 deb/rpm/AppImage）。**每个平台只能在自己的系统上打**，理由在文件头 |
| `THIRD-PARTY.md` | **第三方组件与许可证清单**。加/删依赖要同批改它（`docs/09` §2.3） |

---

## 3. 快速开始（构建与运行）

**开发机是 Fedora，宿主没有工具链**（`gcc` / `cargo` / `node` 全无），构建走
toolbox 容器 `tauri-dev`。宿主的 `sudo` 要密码，但 `podman exec -u 0` 免密。

```sh
# 一次性：装工具链（容器里跑，-u 0 免密，别用 sudo）
podman exec -u 0 tauri-dev dnf install -y gcc gcc-c++ make pkgconf-pkg-config \
    webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel \
    nodejs npm git
```

日常三条命令（**一律以 uid 1000 跑，别用 root**，否则产物归 root）：

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota

# ① 只编译后端
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test

# ② 类型检查 + 前端构建
podman exec -u 1000 -w "$PWD" tauri-dev npx tsc --noEmit
podman exec -u 1000 -w "$PWD" tauri-dev npx vite build

# ③ 跑起来
podman exec -u 1000 -w "$PWD" tauri-dev npm run app      # = tauri dev（自己带 vite）
```

⚠️ **在容器外直接 `cargo build` 会失败**（没有 GTK/WebKit 开发头）。⚠️
**`cargo build` 出来的 debug 二进制定死在 `devUrl`（`localhost:5273`）**——
不带 vite dev server 直接跑它会看到 "Could not connect to localhost: Connection refused"。
想跑单文件二进制就先 `npx vite`，或 `npm run app` 让 tauri 自己起。

**无头目检（容器里没有真显示器时）**：见 `docs/06-build-run-test.md` §5，
Xvfb + ImageMagick 那一条是验证过可用的。

细节、调试旋钮与测试清单见 `docs/06-build-run-test.md`。

---

## 4. 编码约定

### Rust

- 每个 `.rs` 顶部有一段中文模块说明，讲**为什么**这样设计，而不是复述代码。
- 错误统一走 `NotaError`，消息是**中文**且**要说人话**——面向的是用户，不是开发者。
- **锁顺序**：`plugins → documents → settings`，**绝不能反向**（见 `docs/03` §锁序）。
  拿多把锁之前先想清楚自己站在哪一层。
- **不要跨 `.await` 持锁**。
- 需要单元测试时，**把纯逻辑从依赖 Tauri 的壳里剥出来**——
  `fs.rs` 的 `resolve_in()`、`git.rs` 的 `挑工作目录()` 都是这么做的。
  `HostContext` 要真的 `AppHandle`，构造不出来，所以**别把安全边界写在它里面**。

### TypeScript / React

- `@/` 别名指向 `src/`。**`vite.config.ts` 的 `resolve.alias` 与 `tsconfig.json` 的
  `paths` 两处必须一致**，改一处就得改另一处（不一致的表现是"tsc 过了、vite 挂了"）。
- 调后端**只走 `src/bridge/ipc.ts`**，别在组件里直接 `invoke()`。
- `tsconfig` 开了 `noUnusedLocals` / `noUnusedParameters` / `noUncheckedIndexedAccess`——
  下标访问要处理 `undefined`。

### Lua 插件

- **能力申请只写真的用到的**（见 `plugins/git/plugin.toml` 顶部的说明）。
- 插件里的**环境问题**（没开工作区、目录不是仓库）要能在**不抛错**的前提下表现——
  宿主侧已经把这类失败折成 `code ~= 0` 的结果表（见 `docs/13` §错误处理）。

---

## 4b. 平台事实与踩过的坑

- **Tauri 的事件名只允许字母数字与 `-` `/` `:` `_`**，**点号不合法**。
  而插件清单的 id 允许点（`nota.git`），所以**拼事件通道名必须过
  `plugin::manifest::channel_id()`**。漏了的表现是：插件加载"成功"，
  但第一次 `emit` 抛 `only alphanumeric, '-', '/', ':', '_' permitted`——
  静态看代码完全看不出来（BUG-3）。
- **`Lua` 要放进 Tauri 托管状态，mlua 必须开 `send` feature**。没有它这整个
  结构根本编不过，而报错信息不会提"你需要 `send`"。
- ⚠️⚠️ **插件的 `Lua` 只能从 `lua::硬化的_lua()` 拿，不许写 `Lua::new()`**。
  mlua 的 `Lua::new()` 号称"安全子集"，**它的 "safe" 只等于"不能加载 C 模块"**——
  `io` / `os` / `package` / `require` **全都在**（源码：`ALL_SAFE = (1 << 30) - 1`，
  只排除 bit31 的 `debug`）。用它的后果是**能力围栏变成装饰**：一个只申请
  `ui.notify` 的插件能 `os.execute("rm -rf ~")`、`io.open("/etc/shadow")`。
  这就是 **BUG-10**。⚠️ 另外**光列 `StdLib` 白名单也不够**：`loadfile` / `dofile`
  属于**无条件加载的 base 库**，掩码关不掉，必须显式置 `nil`——
  否则插件仍能读并执行磁盘上任意 `.lua`（实测过）。
  **别把库的 `safe` 字面当安全承诺**，那是它自己定义的口径，只能读源码。
- **前端是文本的唯一真相**，后端是 300ms 去抖的镜像。任何"后端改文本"的路径
  都必须**发事件通知前端**，否则编辑器里看到的和存盘的不是一份东西。
- **`replaceAll` 一个语法坏掉的 markdown 不会报错**，remark 会按它的理解尽力解析，
  结果是"一段看起来对但不完全对的内容"。所以进编辑器的文本要先过解析
  （`parseMarkdown()`，见 `docs/05`）。
- **`@milkdown/kit` 的 `exports` 里没有 `plugin/prism`、`plugin/math`、`plugin/diagram`**，
  这三个要从各自的包进，而且**三个都得显式写进 `package.json`**——它们是**直接依赖**，
  不是 kit 的间接依赖。kit 的 `dependencies` 里只有 block/clipboard/cursor/diff/history/
  indent/listener/slash/streaming/tooltip/trailing/upload 这 12 个 `plugin-*`，
  prism/math/diagram 都不在其中。
- **不要同时写 `index.html` 的 CSP meta 与 `tauri.conf.json` 的 `csp`**——
  两个策略会**同时生效并互相冲突**。CSP 只放在 `tauri.conf.json`。
- ⚠️⚠️ **`asset://` 在 WebKitGTK 上传不了字体，主题资源必须内联成 `data:` URL**。
  wry 给自定义协议注册了 `register_uri_scheme_as_secure`，**但没注册
  `register_uri_scheme_as_cors_enabled`**；而 `@font-face` 的装载**永远走 CORS 模式**，
  于是字体请求直接被判 NetworkError——**图片却能正常显示**（`<img>` 不走 CORS），
  所以只看图片会以为协议是通的。这就是 `themes.rs` 把资源读成 `data:` URL 的理由
  （⚠️ 这条**不是** BUG-11，BUG-11 是打包丢插件那条；经过见 `docs/07` §4）。
  ⚠️ 连带一条：**CSP 的 `font-src` 里不要加 `asset:`**，加了也没用。
- **菜单栏里的 Shift+数字快捷键判据是 `e.code === "Digit1"`，不是 `e.key`**。
  Shift 按住时 `e.key` 是 `"!"` 这类符号（Shift+1 给的是 `"!"`，不是 `"1"`），
  拿 `e.key` 比 `"1"` 的快捷键**永远不触发**，而且静态看代码完全看不出来。
- **Tauri 2 的 `bundle.category` 枚举里没有 `Office`**（那是 Tauri 1 的值）。
  写错不会在 `cargo build` 时报——⚠️ **编到最后一个打包步骤**才
  `failed to build bundler settings: invalid category`，前面几分钟全白等。用 `Productivity`。
- ⚠️⚠️ **`bundle.resources` 的键要写目录，不要写 glob**：`{"../plugins": "plugins"}`。
  三种写法里**只有这一种是对的**，另两种都会"看起来成了"——
  数组 `["../plugins/**/*"]` 会把 `..` 映射成 `_up_`；
  映射 + glob `{"../plugins/**/*": "plugins/"}` **能打对目录名但会把树拍平**
  （`tauri-utils` 里 glob+dest 那支只取 `file_name()`），两个内置插件互相盖掉一个。
  ⚠️ **开发期走的是仓库目录，所以这条只有真拆开一个包才看得见**——
  "跑起来没问题"完全证明不了它（BUG-11）。验法见 `docs/06` §2.4。
- ⚠️⚠️ **Rust 报一堆 `cannot find macro panic` / `cannot find trait Clone`，
  先去看有没有 `error[E0514]`——那是工具链在说话，不是代码。**
  本机 rustc 是 Fedora 打过补丁的 RPM（sysroot 在 `/usr`，**没有 rustup**），
  与 `static.rust-lang.org` 发的 `rust-std` 哈希对不上；`E0514` 把 `core` 判成
  "别的编译器编的"，于是**凡是从 `core` 来的东西全部找不到**，
  一个包能塌出几千个 E0425/E0405，**看着像整个仓库都写坏了**。
  判断 std 是不是本机编的：`rpm -qf <libstd 路径>`——**查不到包名的就是外来的**。
  ⚠️ Windows 交叉编译**要走 `x86_64-pc-windows-gnu`**（`rust-std-static-x86_64-pc-windows-gnu`
  是 Fedora 自带的），**`msvc` 在 Fedora 上没有 std 可装**。见 `docs/06` §2.4。

---

## 5. 当前状态速查（详见 `docs/07-feature-status.md`）

**已经真的能用**（2026-09-22 开窗实测过，不是"看着像"）：

- 应用能启动，窗口能开，插件能被发现并加载（两个内置插件都显示「已加载」）。
- 新建文档 → 打字 → `#` 标题渲染成一级标题、`**粗体**` 真的加粗 →
  标签页标题从一级标题推导出来 → 状态栏字数跟着动 → 脏标记亮起。
- 打开/保存/另存为、工作区（文件夹）与文件树、大纲、字数统计。

**仍然是空壳或没接线**（动手前先看 `docs/07` §3）：

- **插件面板里还没有内容**：`register_panel` 声明出来的面板**能出现在右栏**了
  （BUG-13 已修，走 `nota_plugin_panels` 拉），但面板里长什么样没有表达力，
  界面上如实写着「面板内容尚未接入。」。要等声明式 DSL，见 `07` 第 15 项。
  ⚠️ **第 16 项已作废**——原先打算的"记账 + 重放"是**错的修法**，不是没做完。
- **插件数据类事件没有订阅端**：前端只订了 `nota:notify` 与
  `nota:document-changed`，插件自定义通道（`plugin:<id>:<name>`）**没有任何订阅者**。
  ⚠️ 这条通道对**发生类**数据是正解，缺的只是订阅端——别把结论推广成"事件机制别用"。
  见 `07` 第 17 项。
- **菜单栏上的插件菜单没接线**（`07` 第 42 项）：`register_menu` 的写侧与拉侧都通了，
  菜单栏本体也在，缺的只是把插件声明的那几条挂进对应的栏里。
- **AI 插件的网络那一半**（`nota.http` 是一张「尚未实现」的表）、
  **`nota.settings`**（同样是尚未实现）。
- **外观轴还差两条没有切换界面**（`07` 第 11 项）：**文档主题**已经有了
  （菜单栏「主题」，见 §4b 那条 asset 协议的坑）；`ui_mode`（明暗）与
  `ui_style`（macOS/Yaru/Adwaita/Windows）**仍然只有 CSS 与设置项**。
- **`docs/10` 那张 Typora 对照矩阵里标 ⬜ 的一切**——斜杠菜单、富文本工具栏、
  导出、拼写检查……逐项状态以矩阵为准。

**缺陷**（`docs/07` §2，**编号是永久的**）：**已修 14 条（BUG-1…BUG-14）**，
**未修 1 条（BUG-15，点正文下方的空白不聚焦）+ 待查 1 条（BUG-5，中文 IME）**。
⚠️ **未修的 BUG 优先于 backlog 的新功能**。
动手前请读 `docs/07` §2 拿最新状态，别只看这一段——这段只记条数，
**哪条是什么得看那张表**。

---

## 6. 文档索引

| 文档 | 内容 |
|---|---|
| `docs/README.md` | 文档索引与推荐阅读顺序 |
| `docs/01-architecture.md` | 运行时架构、启动顺序、两进程边界、事件流、锁顺序 |
| `docs/02-modules.md` | 逐文件接口参考（每个公开函数的签名与行为） |
| `docs/03-data-structures.md` | `AppState` / `Document` / `Settings` / `Manifest` 字段、常量、**锁序**、两条真相口径 |
| `docs/04-ui-map.md` | 控件树 + 每个按钮的回调/当前状态/目标行为，**含三条外观轴** |
| `docs/05-editor-bridge.md` | Milkdown 装配、前端↔后端两条通道、去抖与整篇替换语义 |
| `docs/06-build-run-test.md` | 依赖、构建、运行、调试旋钮、**无头目检**、测试清单 |
| `docs/07-feature-status.md` | **功能矩阵 + 缺陷清单 + backlog（编号）** |
| `docs/08-development-guide.md` | 如何新增按钮/命令/事件/插件/设置项 |
| `docs/09-doc-sync-policy.md` | **文档同步政策与代码→文档映射表（强制）** |
| `docs/10-typora-parity.md` | **对标 Typora 的逐项对照矩阵**（"100% 对标"这件事的唯一权威） |
| `docs/11-writing-a-plugin.md` | 怎么写一个插件：目录形状、清单逐栏、**能力表**、生命周期、构建接线 |
| `docs/12-plugin-runtime.md` | 插件**运行时**：为什么是 Lua + 独立状态、沙箱边界画在哪 |
| `docs/13-lua-api.md` | **Lua API 参考**：`nota.*` 每个表每个函数 |
