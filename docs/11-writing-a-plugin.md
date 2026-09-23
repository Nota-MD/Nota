# 11 · 怎么写一个插件

> 最后同步：2026-09-22
>
> 读完这份你会知道：插件放哪、清单每一栏是什么意思、**能力表**长什么样、
> ABI 版本什么时候动、生命周期怎么走、加载失败了去哪看。
>
> 能用的 `nota.*` 每个函数的签名与失败行为在 **`docs/13-lua-api.md`**（那份是参考手册，
> 这份是操作手册）。运行时的设计取舍（为什么是 Lua、沙箱画在哪）在 **`docs/12`**。
>
> ⚠️ **最快的上手方式是直接读 [`../plugins/git/`](../plugins/git/)** ——
> 能跑的活样例，比文档准。`plugins/ai/` 是第二个，它多演示了一件事：
> **宿主那半还没实现时插件该怎么写**。

---

## 1. 插件放哪

### 1.1 两个落点

| 落点 | 路径 | 谁往这儿放 |
|---|---|---|
| **用户插件目录** | `$XDG_DATA_HOME/nota/plugins`（一般是 `~/.local/share/nota/plugins`） | 用户自己装的。算这个路径的函数是 `paths::user_plugins_dir()`（`src-tauri/src/paths.rs:35-37`） |
| **内置插件目录** | 开发态与打包态**不一样**，见下 | 随 Nota 一起走 |

内置目录由 `paths::builtin_plugins_dirs()` 算（`src-tauri/src/paths.rs:44-63`），
它返回的是一个**列表**：

| 什么时候 | 返回什么 |
|---|---|
| **打包后** | `resource_dir/plugins` |
| **debug 构建**（`cfg!(debug_assertions)`） | **额外**加上仓库根的 `plugins/` |

⚠️ **debug 构建为什么会扫仓库里的 `plugins/`**：`CARGO_MANIFEST_DIR` 是
`src-tauri/`，往上一级就是仓库根（`paths.rs:53-60`）。这样做的目的是
**改完 Lua 存盘不用重编 Rust**——插件是脚本，读一次就换了。

⚠️ 但**不用重编 ≠ 不用重启**。插件只在 `setup()` 里加载一次
（`lib.rs:59` 的 `PluginHost::discover`），所以改完 Lua 要**重启应用**才生效。
`docs/06` §3.5 记了同一件事。

### 1.2 扫描顺序与去重

两个落点**都存在就都扫**（`paths.rs:41-43`），规则是：

```
用户目录 先扫  →  内置目录 后扫
```

去重的键是**清单里的 `id`**，不是目录名——**先到者胜**，
所以"用户装的同名插件覆盖内置的"是这条循环顺序自然的结果，不用额外判
（`plugin/mod.rs:65-67`、`plugin/mod.rs:84-86`）。

⚠️ **为什么按 `id` 而不是按目录名**：目录名是文件系统的事，用户可以随便改；
`id` 是清单里声明的、插件之间互相引用的名字。用目录名去重会出现
"改个文件夹名就多出一份插件"这种事（`plugin/mod.rs:7-11`）。

### 1.3 目录形状：正好一层

`find_manifests()` 认**两种形状**（`plugin/manifest.rs:266-286`）：

```
plugins/<目录>/
├── plugin.toml        # ✔ 形状一：<dir>/plugin.toml
└── main.lua
```

或者：

```
plugins/<外层>/
└── <插件目录>/
    ├── plugin.toml    # ✔ 形状二：<dir>/<id>/plugin.toml
    └── main.lua
```

两种都认，是**为了开发时少写一层**。⚠️ 注意形状一的判断是**短路**的：
如果 `<dir>/plugin.toml` 存在，就**只看它**，不再往里扫子目录
（`manifest.rs:269-272`）。所以别在同一个目录里既放 `plugin.toml` 又放插件子目录
——后者会被静默忽略。

### 1.4 ⚠️ 两个插件不能占同一个事件通道

清单里的 `id` 允许 `.`（`nota.git`、`nota.ai` 就是这么写的，反域名风格），
而事件通道名里的 `.` 会被归一成 `-`（`manifest::channel_id()`，`manifest.rs:251-261`）。
于是 `nota.git` 与 `nota-git` 这两个**都合法**的 id 会占同一个通道
`plugin:nota-git:…`。

撞了事件就分不清是谁发的，而且是"多发一条事件"这种最难查的症状，
所以 `discover()` 会**把后到的那个直接判为加载失败**，把话说在当面
（`plugin/mod.rs:88-102`）。你会在插件列表里看到一行标红，理由写着
「事件通道 `plugin:<归一化的 x>:…` 已被 `<另一个 id>` 占用」。
**换一个 id 即可。**

### 1.5 打包那半 ✅ 已接好（2026-09-23）

**开发态不用做任何事**（debug 构建会自动扫仓库根的 `plugins/`）。
打包态靠 `tauri.conf.json` 的 `bundle.resources` 里那条 `{"../plugins": "plugins"}`，
bundler 会把整棵目录拷进资源目录——内置插件在装出来的包里也在。
⚠️ **这条键的写法有讲究（目录 vs glob），而且必须真拆包验**，
完整说明见 `docs/08` §6 第 3 步。**它不影响你写插件**，别被它挡住。

---

## 2. `plugin.toml` 逐栏说明

清单整个是**一段** `[plugin]`（解析结构是 `ManifestFile { plugin: PluginMeta }`，
`manifest.rs:129-131`）。缺了这一段，得到的是 TOML/serde 的一句
`missing field \`plugin\``。

### 2.1 逐栏表

| 栏 | 必填？ | 默认值 | 类型 | 校验规则 | 写错了会怎样 |
|---|---|---|---|---|---|
| `id` | **必填** | — | string | 非空；只允许**小写字母、数字、`.`、`-`、`_`** | 空 → 「id 不能为空」；有别的字符 → 「id `X` 只能用小写字母、数字、`.`、`-`、`_`」 |
| `name` | **必填** | — | string | 无 | 缺 → serde 的 `missing field \`name\``（TOML 解析错） |
| `api` | **必填** | — | 整数 | **必须恰好等于 `1`** | 不等 → 「插件 `{id}` 需要 API 版本 {要的}，宿主是 {1}」，**拒载**。见 §4 |
| `version` | 可选 | `"0.0.0"` | string | 无 | — |
| `entry` | 可选 | `"main.lua"` | string | **插件目录内的相对路径**：不许含 `..`，不许绝对路径 | 违规 → 「entry `X` 必须是插件目录内的相对路径」 |
| `description` | 可选 | `""` | string | 无 | — |
| `authors` | 可选 | `[]` | string 数组 | 无 | — |
| `license` | 可选 | `""` | string | 无 | — |
| `capabilities` | 可选 | `[]`（**空 = 纯声明式插件**） | string 数组 | 每一项必须是 §3 表里的字面量 | 不认识的值 → 「不认识的能力 `X`（见 docs/11 的能力表）」，**拒载**（见下） |

校验的实现在 `Manifest::from_meta()`（`manifest.rs:172-226`）与
`Capability::parse()`（`manifest.rs:79-97`）。

### 2.2 ⚠️ 三个容易踩的坑

**① 未知能力是"拒载"，不是"忽略"。**
`Capability::parse()` 对认不出的字符串**返回 `Err`**，并在清单校验时被折成
`NotaError::Manifest`。理由写在函数注释里（`manifest.rs:77-78`）：
**悄悄忽略会变成"插件作者以为申请到了、实际没有"的静默降级**——
那类 bug 要等插件跑起来、在某个具体功能上表现异常才发现。

**② 字段名拼错是"静默忽略"，不报错。**
`PluginMeta` 上**没有** `#[serde(deny_unknown_fields)]`，所以
`capabilites = [...]`（少一个 `i`）这种拼写错误**会被 serde 直接丢掉**，
插件变成一个**没有任何能力**的插件。症状是运行期 `nota.fs` 是 `nil`
（`attempt to index a nil value`），而不是加载失败。
⚠️ 这是本节最容易浪费半天的一条：**加载成功不等于清单读对了**。

**③ 能力重复会被去重，不报错。**
`from_meta()` 里 `if !capabilities.contains(&cap)` 才 push（`manifest.rs:216-218`），
所以写两遍同一个能力不会出问题，也不会告诉你。

### 2.3 两份活样例的清单

看真实写法直接读文件，这里只指出两处**刻意的设计**：

| 插件 | 清单里值得看的地方 |
|---|---|
| `plugins/git/plugin.toml` | **顶部那段注释就是"能力只申请用得到的"这条纪律的正文**。它专门解释了"为什么没有 `fs.write`"：这个插件只让 git 自己去改工作区，不直接写文件——哪天要做"从 git 恢复某个版本"，那时再加，**加的时候要说明用在哪** |
| `plugins/ai/plugin.toml` | 申请了 `network.http` 与 `settings.own`，并在注释里**明说宿主那半还没实现**。这是"先让接线全通、等零件齐了再装"的做法 |

---

## 3. ⭐ 能力表

> **本节是代码注释里引用的那张"`docs/11` 能力表"。**
> `Capability::parse()` 报错时会说「不认识的能力 `X`（见 docs/11 的能力表）」
> （`manifest.rs:93`）——指的就是这里。

### 3.1 先看清楚：能力只管一件事

⚠️ **能力申请的粒度是"装不装某张子表 / 某个函数"，不是"能不能调用"。**
没申请的能力，那个子表**根本不存在**——不是"存在但调用时报错"。
设计口径写在 `lua/api/mod.rs:3-10`：不装空壳，因为空壳既让插件作者在开发期
发现不了问题（写完才炸），也让"权限"变成一句运行时的客气话而不是一道结构上的墙。

### 3.2 每个能力值开放了什么

> 📌 **口径**：这一列说的是**宿主 API 的可见性**——"申请了它，你能调到哪些 `nota.*` 格子"。
> 它**不**等于"插件没有能力做别的"；那件事由 Lua 那边收得多紧决定。
> 2026-09-22 起标准库已收紧到只剩 `coroutine`/`table`/`string`/`utf8`/`math`
> （`io`/`os`/`package`/`require`/`loadfile`/`dofile`/`debug` 全为 `nil`，
> 见 `docs/12` §5 与 `docs/07` BUG-10），**所以现在这两句话可以一起读：
> 申请不到的能力，插件确实没有别的路去做。**


| `capabilities` 里的字面量 | 开放 `nota.*` 的哪些格子 | **授予它 = 信任插件做这些** |
|---|---|---|
| `document.read` | `nota.document.get_text()` / `.get_path()` / `.get_title()` / `.get_revision()` / `.is_dirty()`（`lua/api/document.rs:28-76`） | **读**当前活动文档的全文、磁盘路径、标题、版本号、脏标记。⚠️ **"当前活动文档"是后端的活动文档**，可能与用户眼睛看的那份不一致（`docs/07` BUG-6） |
| `document.write` | `nota.document.set_text(text)` / `.append_text(tail)`（`lua/api/document.rs:79-115`） | **整篇替换**活动文档的文本（写完发事件让前端换掉编辑器内容）。⚠️ 没有选区/位置粒度（那要 backlog 第 14 项），"在光标处插一段"只能拿全文自己拼 |
| `fs.read` | `nota.fs.read(path)` / `.exists(path)` / `.list(path)`（`lua/api/fs.rs:30-72`） | 读**工作区围栏内**的文件与目录名。⚠️ 围栏的裁决在 `resolve_in()`：只收相对路径、`..` 在碰文件系统之前就算掉、符号链接逃逸会拒、**没开工作区时一律拒绝**——详见 `docs/13` |
| `fs.write` | `nota.fs.write(path, text)` / `.remove(path)`（`lua/api/fs.rs:74-98`） | **在工作区内新建/覆盖/删除文件**（写会自动建父目录）。⚠️ 这是**破坏性**的：`remove` 删的是真文件，没有回收站 |
| `process.git` | `nota.git.run(argv)` / `.status()` / `.diff(staged)` / `.repo_root()`（`lua/api/git.rs:55-137`） | **起 `git` 这一个子进程**，工作目录锁死在围栏内，并拒绝 `-C` / `--git-dir` / `--work-tree` / `--namespace`。⚠️ **已知边界（不是漏洞，是记录）**：`git config --global` 这类会写用户全局配置的子命令挡不住——参数层面分不清它跟合法的 `git config --get`。所以这个能力等于"**能对你的机器做 git 能做的事**"，装插件时该按这个尺度信任（`git.rs:25-27`）。⚠️ 它不是通用 subprocess，**加别的进程之前先读这段** |
| `network.http` | ⚠️ **只有一张「尚未实现」的表**（见 §3.5） | 声明了它，将来等于信任插件**把文档内容发到任意地址**。这是整张表里最重的一条，落地时要一起定"密钥存哪"（backlog 第 12 项） |
| `ui.notify` | `nota.ui.notify(msg, level)`（`lua/api/ui.rs:35-53`） | 在界面上弹一条提示条。⚠️ 它能**冒充宿主的口径**对用户说话（提示里看不出是插件发的），所以别用它做误导性文案。⚠️ 这是三条里**唯一推事件**的（`nota:notify`），所以**在 `on_load` 里调它，前端还没起来，那条提示会静默丢掉**（Tauri 的 `emit` 对没有监听者的频道是静默成功的） |
| `ui.panel` | `nota.ui.register_panel(spec)`（`lua/api/ui.rs:75-112`） | 在**右侧栏**声明**多一页**。⚠️ **它推的不是事件，是状态**：写进 `nota_panels` registry，前端挂载后拉一次（BUG-13，见 §5.7）。⚠️ **只声明"有这么个面板"，面板里长什么样没有表达力**——内容要等声明式 DSL（backlog 第 15 项），界面上如实写着「面板内容尚未接入。」 |
| `ui.menu` | `nota.ui.register_menu(spec)`（`lua/api/ui.rs:115-149`） | 往菜单里**加条目**，点了回调插件自己注册过的命令。同上，**走 registry 拉**。⚠️ **菜单栏本身还没做**（backlog 第 40 项），所以现在注册了也暂时看不见。⚠️ 它和另外两条 `ui.*` 是**任选其一**就能拿到 `nota.ui` 这张表——但"表在"不等于"三个函数都在"，见 §3.4 |
| `settings.own` | ⚠️ **只有一张「尚未实现」的表**（见 §3.5） | 声明了它，将来等于信任插件**读写自己那一段设置**（不碰别人的） |

### 3.3 不申请任何能力也有的东西

这些**永远可用**（`lua/api/mod.rs:36-64`），因为它们不碰文档也不碰磁盘，
是插件跟自己、跟宿主说话用的：

| 名字 | 是什么 |
|---|---|
| `nota.version` | 宿主版本字符串（`env!("CARGO_PKG_VERSION")`，当前 `"0.1.0"`） |
| `nota.api_version` | ABI 号，当前 `1`（`NOTA_PLUGIN_API_VERSION`） |
| `nota.plugin_id` | 这个插件在清单里声明的 id（**原样**，如 `nota.git`——没归一化） |
| `nota.log.info/warn/error(msg)` | 往宿主 stderr 打一行，前缀 `[nota:<插件 id>]` + 级别 |
| `nota.command.register(name, fn)` | 注册一个命令给宿主/前端调 |
| `nota.event.emit(name, payload)` | 往前端发一个事件 |

### 3.4 ⚠️ 装载条件：表的存在 vs 表里成员的存在

这是两层判断，**别搞混**：

**第一层——子表装不装**（`lua/api/mod.rs:67-104`）：

| 子表 | 装上它的条件 |
|---|---|
| `nota.document` | `document.read` **或** `document.write` |
| `nota.fs` | `fs.read` **或** `fs.write` |
| `nota.git` | `process.git` |
| `nota.ui` | `ui.notify` **或** `ui.panel` **或** `ui.menu`（三条 `ui.*` **都要列**——见下） |
| `nota.http` | `network.http`（装出来是「尚未实现」的表） |
| `nota.settings` | `settings.own`（同上） |

**第二层——表里装哪些成员**：`document.rs` / `fs.rs` / `ui.rs` 各自**再判一次**，
只装申请到的那几个函数（`ui.rs:35` 判 `UiNotify`、`ui.rs:56` 判 `UiPanel`、
`ui.rs:61` 判 `UiMenu`）。

⚠️ **两层是相乘的**，任一层漏一项、那条能力就是**死的**：

| 场景 | 第一层（表在吗） | 第二层（成员在吗） | 结果 |
|---|---|---|---|
| 只申请 `ui.panel` | ✅ 在 | `register_panel` ✅ / `register_menu` ✗ | 表有，但 `register_menu` 是 `nil` |
| 只申请 `ui.menu` | ✅ 在 | `register_menu` ✅ / `register_panel` ✗ | 表有，但 `register_panel` 是 `nil` |
| 一个 `ui.*` 都没申请 | ❌ 表是 `nil` | — | `nota.ui` 整张不存在 |

**第二层那半是 `docs/13` §8 的表格在管的；第一层这半归这一节。**

#### 📌 这条踩过坑：第一层曾经漏了 `ui.menu`（BUG-8，已修）

`api/mod.rs` 那个条件**曾经**只写 `ui.notify || ui.panel`，于是
**只**申请 `ui.menu` 的插件连 `nota.ui` 都拿不到，`register_menu` 自然无从谈起，
**`ui.menu` 这条能力形同虚设**。两个内置插件都申请了 `ui.panel`
（`plugins/git/plugin.toml`、`plugins/ai/plugin.toml`），所以一直没暴露。

**✅ 已在 2026-09-22 修掉**，而且修法不是"随手补一个 `||`"，
而是**让两层同源**：第一层的判据由一张能力清单产生，
那张清单的项数还必须与 `ui.rs` 里判据的个数对得上。

```rust
const UI能力: [Capability; 3] = [Capability::UiNotify, Capability::UiPanel, Capability::UiMenu];  // api/mod.rs:259-263
fn 装_ui吗(manifest: &Manifest) -> bool { UI能力.iter().any(|c| manifest.has(*c)) }                // api/mod.rs:266-268
```

`api/mod.rs:82-89` 现在留了一段注释专门记这件事，末尾一句是这一节最该记住的：
**"里面有判据、外面也得有——两处是相乘的关系，不是一个能代替另一个。"**

**所以：只申请 `ui.menu` 就能拿到 `nota.ui` 和 `register_menu`，不用再"顺手多申请一个"。**
`docs/07` 的 BUG-8 就是它（修好之后状态列会改成已修，编号永久保留）。

同批还加了 4 条回归用例（`lua::api::tests`，`cargo test` 从 32 条变 36 条，
计数只在 `docs/06` 记）：**每一条 `ui.*` 能力都能单独装出 `nota.ui`**、
**没申请任何 `ui.*` 就不装**（按能力装表、不装空壳）、
**`UI能力` 与 `ui.rs` 里的判据个数对得上**（`include_str!("ui.rs")` 数
`manifest.has(Capability::Ui` 的出现次数——⚠️ Rust 没有反射，这条推不出来，
所以退一步钉"数量"，注释与断言消息里都写明了"这是提醒不是证明"）、
以及 `#[serde(rename)]` 的名字与 `Capability::parse()` 同口径。

### 3.5 ⚠️ 两张「尚未实现」的表

`nota.http` 与 `nota.settings` 是**故意装出来的假表**（`lua/api/mod.rs:94-104`）：
用 `__index` 元表兜住任意方法名，**任何一次调用都抛**一句带文档条目号的错误

| 表 | 调用任何方法得到 |
|---|---|
| `nota.http.*` | `网络请求尚未实现（见 docs/07 第 12 项）` |
| `nota.settings.*` | `插件设置尚未实现（见 docs/07 第 13 项）` |

**为什么给假表而不是不给**（`lua/api/mod.rs:87-89`）：给的是**线索不是哑弹**。
插件作者写 `nota.http.get(...)` 会立刻拿到一句"尚未实现"，
而不是 `attempt to index a nil value`——后者会让人以为是**自己的能力没申请对**，
白查半天。

`plugins/ai/main.lua` 就是照这个写的：它用 `pcall` 包住调用，把宿主那句错误
当成"联网那半没接通"的**正常状态**来报告（`plugins/ai/main.lua:57-71`、
`plugins/ai/main.lua:122-131`）。**这是"宿主功能还没落地时插件该怎么写"的范例。**

---

## 4. ABI 版本

### 4.1 常量与精确匹配

```rust
pub const NOTA_PLUGIN_API_VERSION: u32 = 1;    // manifest.rs:37
```

清单里的 `api` 栏**必须恰好等于**它：

```rust
if meta.api != NOTA_PLUGIN_API_VERSION {
    return Err(NotaError::PluginApiMismatch { id, wanted: meta.api, have: NOTA_PLUGIN_API_VERSION });
}                                              // manifest.rs:192-198
```

不匹配得到的是**一句人话**：「插件 `nota.git` 需要 API 版本 2，宿主是 1」。
这个错误发生在 `Manifest::load()` 里，所以 ⚠️ **不匹配的插件根本不会出现在插件列表里**
——只在启动日志里有一行（见 §6.1）。

### 4.2 为什么是精确匹配而不是 `>=`

理由与 Folio 的 `FO_PLUGIN_API_VERSION` 同一条
（写在 `manifest.rs:18-23` 的模块注释里）：**宿主与内置插件永远同批构建**，
`>=` 只会让"插件作者以为存在一个他没见过的新版本"这种事发生。
号一变，内置插件同批改号，**没有迁移动作**。

⚠️ 这条依赖 `AGENTS.md` §0.5 那条"首次提交 GitHub 之前不必兼容老插件"的口径。
**它是有触发条件的，会到期**：一旦对外发布，老插件就得能加载，那时"精确匹配"
要么改成 `>=`，要么给出迁移路径。

### 4.3 什么时候该动号

三条判据（`manifest.rs:33-36`，原文照抄）：

| 改动 | 动不动号 | 为什么 |
|---|---|---|
| 给 Lua 侧的 `nota.*` 表**增加**成员 | **不动** | 老插件照样跑——它不知道的新格子，对它就是不存在 |
| **改名**某个 `nota.*` 成员 | **动** | 老插件会**静默拿到别的东西**（或者拿到 `nil`） |
| **改变**某个成员的**语义** | **动** | 同上：名字还在，行为变了 |
| 增删 `capabilities` 里的取值，**并让它影响放行** | **动** | 老插件的清单可能申请了不再存在的值（那会被拒载），或者漏申请新拆出来的值（那是静默降级） |

一句话：**加东西不动号，改东西/删东西动号。**

### 4.4 三个"版本"别搞混

| 名字 | 在哪 | 是什么 |
|---|---|---|
| `api` 栏 / `nota.api_version` | 清单里 / Lua 侧 | **ABI 号**，当前 `1`。宿主与插件之间的契约版本 |
| `nota.version` | Lua 侧 | **宿主应用的版本**（`0.1.0`，来自 `Cargo.toml` 的 `package.version`） |
| `version` 栏 / `PluginInfo.version` | 清单里 / 前端 | **插件自己的版本**。`plugin.toml:12` 的注释明确说了：**不代表 ABI** |

⚠️ 所以一个插件写 `version = "9.9.9"` 而 `api = 1` 是**完全合法**的。

---

## 5. 生命周期

### 5.1 入口脚本的形状

入口脚本（清单里的 `entry`，默认 `main.lua`）**按模块写，最后 `return` 一张表**：

```lua
local M = {}

function M.on_load(nota)
  nota.command.register("git.status", function() ... end)
end

function M.on_unload()
  -- 可选；不写就是没活要干
end

return M
```

（这段形状照抄 `lua/mod.rs:26-42` 的模块注释。）

### 5.2 两个回调

| 回调 | 必填？ | 签名 | 什么时候被调 | 抛错会怎样 |
|---|---|---|---|---|
| `on_load` | **可选** | `on_load(nota)` | 加载时，**一次**。模块表里第 `on_load` 是函数才调 | ⚠️ **整个插件判为加载失败**（`state = failed`），界面上标红。见 §5.4 |
| `on_unload` | **可选** | `on_unload()`（无参） | 窗口 `Destroyed` 时，一次（`lib.rs:95-104` 的 `on_window_event` → `unload_all()`） | ⚠️ **只记不抛**：往 stderr 打 `[nota] 插件 {id} 的 on_unload 出错：{e}`，卸载流程不被一个插件的残骸卡住（`lua/mod.rs:222-225`） |

`on_load` 收到 `nota` 表**当参数**（`lua/mod.rs:197-206`），
所以你可以写 `function M.on_load(nota)` 完全不依赖全局——**推荐这么写**。

### 5.3 宿主怎么存你的模块表

模块表被塞进 Lua 的**命名注册表值** `nota_module`（`lua/mod.rs:191-195`），
命令表塞进 `nota_commands`（`lua/api/mod.rs:107`）。

⚠️ **为什么用 registry 而不是 globals**：插件**可以合法地把全局 `nota` 覆盖掉**
（`lua/mod.rs:189-190`）。用全局存宿主自己的东西，就等于把名字借给了插件。

### 5.4 ⚠️ `on_load` 抛错 = 整个插件加载失败

这是插件作者最容易吃亏的一条。**`on_load` 里做的任何事抛了错，用户看到的是
"这个插件坏了"**——哪怕真实原因只是"用户还没打开文件夹"。

真事（`docs/07` BUG-2）：Git 插件在 `on_load` 结尾刷一次状态，而
`nota.git.status()` 当时对"没有工作目录"直接抛错——于是**"用户还没打开文件夹"
被显示成"这个插件加载失败"**，侧栏里赫然一行标红，而插件本身一个字都没写错。

修法分两头，**两头你都要知道**：

1. **宿主侧**已经把"环境不具备"折成一张 `code != 0` 的结果表
   （`lua/api/git.rs:29-41` 的"两种失败要分开"），插件正常处理即可；
2. **插件侧**再包一层 `pcall`（`plugins/git/main.lua:184-192`）——
   注释里写明了这是**刻意的**，不是防御性编程的迷信：
   "将来宿主新加的任何一种环境失败"都不会再变成一次误判。

```lua
-- plugins/git/main.lua:189-192
local ok, err = pcall(refresh, nota, true)
if not ok then
  nota.log.warn("首次刷新改动失败：" .. tostring(err))
end
```

### 5.5 加载失败不会带走宿主

`LuaPlugin::load()` **不返回 `Err`**，而是返回一个 `state = Failed(原因)` 的实例
（`lua/mod.rs:100-132`）。理由很实在（`plugin/mod.rs:12-16`）：插件是用户自己装的
第三方代码，让一个写错的 Lua 脚本变成"应用打不开"，用户**连去禁用它的界面都进不去**。

同样的道理：`Load`/`on_load` 整个过程都在插件**自己的** Lua 状态里跑，
一个插件炸了影响不到别的插件，也影响不到宿主。

### 5.6 ⚠️ 两个小的不一致（知道就好，不用绕）

| 现象 | 事实 |
|---|---|
| `PluginState::Disabled` 从来没被构造过 | 禁用走的是 `PluginHost` 里的一个 `HashSet<String>`（`plugin/mod.rs:50-51`），枚举里那个变体只在两处 `match` 里出现（`plugin/mod.rs:134`、`plugin/mod.rs:196`）——是**死变体** |
| **禁用不等于卸载** | `set_enabled(false)` 只是不再派发命令过去，**Lua 状态留着**（`plugin/mod.rs:50-52`）。所以重新启用时**不会**重跑 `on_load`——如果你的 `on_load` 有副作用，这一点要记住 |

### 5.7 ⭐ 声明是状态 → 拉；发生是事件 → 推

**这是写 `nota.ui.*` 之前必须知道的一条**，也是插件作者最容易踩的一个坑。

你在 `on_load` 里调 `register_panel` / `register_menu`，那一刻是**插件加载时**
（`setup()` 阶段）——而 WebView 连 `listen()` 都还没注册。如果宿主拿事件把它推给
前端，**它会静默丢掉**：Tauri 的 `emit` 对没有监听者的频道是**成功返回**的，
日志里一点痕迹都没有。现象就是"面板时有时无"，取决于加载快慢和启动的赛跑。

| 分类 | 例子 | 走哪条 | 为什么 |
|---|---|---|---|
| **声明（状态）** | `register_panel` / `register_menu` / `command.register` | **registry，宿主拉** | 状态是"现在有哪些"，问一次就得到全量；推的话还要解决"前端起来之前的那些怎么办" |
| **发生（事件）** | `notify` / 插件自己的 `plugin:<id>:<name>` | **推**（`emit`） | 事件是"此刻发生了一件事"，攒着没意义、重放还会重复 |

**判据一句话**：**需要靠"幂等"或"重放"来兜底的设计，通常意味着状态被存了两份。**
（这条不是空话——本仓真按"记账 + 重放"写过一版设计，写进了两处文档，落地时被推翻，
见 `docs/07` BUG-13。）

对你的实际影响：

- ✅ 面板/菜单**注册一次就够**，不用管前端什么时候起来，也不用在 `on_load` 里
  自己 `emit` 一遍；
- ⚠️ 但**同一个插件里别重复注册同一个 `id`**——`register_panel` 会**当场报错**
  （不是静默覆盖）。多半是复制粘贴改漏了，静默覆盖会让人对着"怎么点下去
  跑的是另一个函数"查到天亮；
- ⚠️ `notify` 是**推**的。**在 `on_load` 里调它，那条提示会丢**——
  想报"插件已加载"这类话，用 `nota.log.info`，别用 `notify`。

---

## 6. 怎么调试一个插件

### 6.1 ⚠️ 加载失败有**两个完全不同的显示面**

**这是本节最要紧的一条。** 同样是"插件没起来"，看的地方不一样：

| 失败发生在哪 | 界面上 | 终端里 | 插件在列表里吗 |
|---|---|---|---|
| **清单读不了**（TOML 语法错、缺 `name`、`id` 非法、`api` 不匹配、未知能力、`entry` 逃逸） | **什么都不显示** | `[nota] 插件清单读不了：{清单路径}：{原因}`（`plugin/mod.rs:112-114`） | ❌ **不在**——连 `id` 都可能没解析出来 |
| **清单 OK，但加载失败**（入口脚本不存在、Lua 语法错、`on_load` 抛错、事件通道撞名） | 侧栏「插件」页**一行，标红**，下面一段错误原文 | 可能没有任何输出（除插件自己 `nota.log.*` 打的） | ✅ 在，`state = "failed"` |

**所以：插件列表里没有它 → 去看终端那行日志；列表里有它但标红 → 看那一段错误原文。**

### 6.2 界面上在哪看

**右侧插件栏**（`src/ui/PluginDock.tsx` 的 `PluginDock`）；
⚠️ 2026-09-22 之前它在左侧栏的第三页，现在整栏搬到了右边，
`Sidebar.tsx` 里已经没有 `PluginList` 了。每一行渲染的是 `api.plugin.list()` 返回的
`PluginInfo`（`plugin/mod.rs:31-45`）：

| 字段 | 显示成什么 |
|---|---|
| `name` / `version` | 插件名与版本 |
| `id` | 小字一行——**出错时报这个号最有用** |
| `description` | 描述 |
| **`error`** | 只有 `state == "failed"` 时有值，渲染成 `.plugin-error` 那一段 |
| `state` | `"loaded"` / `"failed"` / `"disabled"`，同时决定 `<li>` 的 class（`plugin-loaded` / `plugin-failed` / `plugin-disabled`） |
| `capabilities` | 清单里申请到的**原始字符串**（不是解析后的枚举） |

⚠️ 这一栏**只列插件清单**。你 `register_panel` 声明出来的面板在**同一栏的上方**，
是三个分组：`location == "right"` 的面板、**没有落脚处**的面板（`location` 写了
别的值——2026-09-22 之前默认是 `"sidebar"`，所以老插件会掉进这组，
见 `docs/07` BUG-14）、以及上面那张表的插件清单。
**「没有落脚处」这一组是有意留的**：宁可把"你声明的面板没人要"摆出来，
也不要静默丢掉——BUG-14 就是这么被新代码当场报出来的。
### 6.3 日志：`nota.log.*`

```lua
nota.log.info("开始刷新")
nota.log.warn("首次刷新改动失败：" .. tostring(err))
nota.log.error("...")
```

打到宿主 **stderr**，前缀是 `[nota:<你的插件 id>]`（`lua/api/mod.rs:43-53`）。
多插件同时刷输出时靠这个前缀分清是谁。

⚠️ **参数只有一个**（任意 Lua 值，宿主会渲染成文本）。
`nota.log.info("a", "b")` 的第二个参数不会被打出来。

### 6.4 ⚠️ 最值钱的一条经验：`pcall` 兜底日志

`docs/07` §2 在 BUG-3 下面单独记了一段，**和写插件直接相关**：

> BUG-3（带点的插件 id 让每次 `emit` 都抛错）是"**加载成功、静默失效**"那一类——
> 插件列表里一切正常，错误只在**第一次发事件**时出现。
> 抓到它的过程：BUG-2 修完之后加了 `pcall` + `nota.log.warn` 兜底，
> **是那条兜底日志把错误打出来的**——没有它，BUG-3 会继续潜伏。

**照做**：`on_load` 里任何"可能因为环境而失败"的调用，都包一层 `pcall` +
`nota.log.warn`。这不是防御性编程，是**让自己看得见**。

### 6.5 命令调不通时的三个可能

| 症状 | 先查这个 |
|---|---|
| `插件 X 没有注册命令 \`Y\`` | 命令名拼错了，或者 `nota.command.register` 那一行没跑到（比如 `on_load` 在它之前就抛了） |
| `插件 X 重复注册命令 \`Y\`` | **同名覆盖是刻意报错的**（`lua/api/mod.rs:117-124`）：多半是复制粘贴改漏了。静默覆盖会让人对着"怎么点下去跑的是另一个函数"查到天亮 |
| `插件 X 已被禁用` / `插件 X 加载失败，无法执行命令：…` | 后端状态不对，去侧栏「插件」页看那一行 |

### 6.6 不开窗能测到哪一层

见 `docs/08` §6 第 4 步那张四档表（清单单测 / Lua 解释器跑入口 / Xvfb 看侧栏 /
`xdotool` 点菜单）。**最省事的一档是看启动日志里那个数字**：
`[nota] 载入 N 个插件`（`lib.rs:60`）——N 没涨就是没扫到。

---

## 7. 插件之间怎么协作（现状）

**目前没有正式的协作机制。** 能用的只有两条路，而且都只通了一半：

| 路 | 现状 |
|---|---|
| **调别人的命令** | 宿主有 `find_command_owner()`（`plugin/mod.rs:255-266`，先做"第一个匹配"）。⚠️ 但前端调命令时**必须显式给 `plugin` 参数**（注册者的 id），别凭命令名猜是哪个插件的——两个插件重名时猜错就是**静默跑到别人家里**（`commands/plugin.rs:36-38`） |
| **订阅别人的事件** | ⚠️ **没有人在听插件频道**。前端的事件表只有两个宿主事件（`src/bridge/ipc.ts:199-202`），插件发的 `plugin:<id>:<名字>` 全部**发出去就被丢掉**。`plugins/ai/main.lua:26-32` 想通过事件问 git 插件要 diff 的那条路，注释里写着"本轮先直接返回 nil" |

所以 `plugins/ai/main.lua` 里那个 `scope = "diff"` 目前**必然回退到全文**。
补上这条路属于 backlog **第 17 项**（Git 插件的前端面板）。

⚠️ **注意第 17 项和第 16/38 项不是同一个根**（这一点曾经记错过）：
第 16 项讲的是"**声明类**走错了通道"——已按「声明是状态 → 拉」修掉（BUG-13），
第 38 项是它的下游，已结清。第 17 项讲的是"**数据类**事件没人消费"——
结论不一样：`plugin:<id>:<name>` 这条通道对**发生类**数据**是正解**，
缺的只是前端那边的订阅端。**别把结论推广成"事件机制别用"。**
