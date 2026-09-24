# 13 · Lua API 参考

> 最后同步：2026-09-24
>
> **这份是参考手册**：逐表逐函数——签名、参数、返回值、**失败时到底发生什么**。
>
> - 「怎么写一个插件 / 能力表 / 清单字段」= **`docs/11-writing-a-plugin.md`**
> - 「为什么这么设计 / 沙箱边界画在哪」= **`docs/12-plugin-runtime.md`**
> - 实现 = **`src-tauri/src/lua/api/`**（`mod.rs` 是 `nota` 表本体，
>   `document.rs` / `fs.rs` / `git.rs` / `ui.rs` / `http.rs` / `settings.rs` 是六张子表）
>
> 凡签名、常量值、错误原文，都是**从代码逐字抄的**，并给了 `file:line`。
> 两份活样例见 §11（`plugins/git/main.lua` 与 `plugins/ai/main.lua`）。
>
> ⚠️ **2026-09-24 之前只有四张子表是真的**：`nota.http` 与 `nota.settings`
> 各是一张「调用必抛"尚未实现"」的空壳。现在六张都是真的（§9 §10），
> 空壳那套 `not_implemented()` 与它的元表已经删掉了。

---

## 0. 读之前：六条通则

### 0.1 调用约定

| 形态 | 例子 |
|---|---|
| 位置参数 | `nota.log.info("开始")`、`nota.event.emit("git:status", t)` |
| 一张表当参数 | `nota.git.run({ "add", "-A" })`、`nota.ui.register_panel({ id = "git" })` |
| 一个表当参数（可选） | `nota.git.diff(true)`；`nota.command.register("x", function(args) … end)` 里的 `args` |

⚠️ **没有命名参数、没有重载、没有 `nil` 占位跳参**。想省一个参数就得写成
`function(args)` 收一张表——`plugins/ai/main.lua:80-82` 就是这么收 `args.scope` 的。

### 0.2 ⚠️ 失败有**两条完全不同的通道**（写插件的第二课）

| 通道 | 什么时候 | 插件怎么处理 |
|---|---|---|
| **抛 Lua 错误** | **插件自己写错了**：传了禁止的参数、参数类型不对、命令名重复、能力没申请 | 别 `pcall` 掉。这是开发期的 bug，让它炸在脸上（`docs/11` §6.4 只要求给**环境类**调用兜底） |
| **返回一张 `code ~= 0` 的结果表** | **环境不具备**：没开工作区、目录不是 git 仓库、没装 git | **正常处理**，把 `stderr` 里的原因说给用户听 |

这条分界线是 `src-tauri/src/lua/api/git.rs:29-41` 那段注释的正文，它**踩过一次才写下来**
（伪装的后果见 §7.3）。除 `nota.git` 外，`nota.fs` 的**读取失败**也走第一条通道
（抛 `读文件失败 …`）。

### 0.3 错误信息一律是中文人话

所有 `NotaError` 的 `Display` 都写成人话（`src-tauri/src/error.rs:1-5` 的口径），
经 `lua_err()`（`api/mod.rs:28-30`）折成 `mlua::Error::RuntimeError`。
所以插件里 `pcall` 抓到的字符串是可以**直接给用户看**的，不用再包一层解释。

⚠️ 反过来说：**你在 Lua 里抛的错也有机会回到用户面前**。
命令回调抛错时，宿主会把它裹成 `Lua 出错（插件 {id}）：{message}`
（`error.rs:44-48`）——所以 `error("没有找到配置文件")` 这种写法比 `error("nil")` 强得多。

### 0.4 哪张表在不在，取决于清单

⚠️ **不是"每张表都在、调用时报没权限"**。没申请对应能力的子表**根本不存在**（`nil`）。
逐条判据见 `docs/11` §3.4；`nota.ui` 那两层的相乘关系见 §8.4。

### 0.5 Lua 值怎么变成前端看得见的东西

`nota.event.emit` 的 payload 与命令的返回值都要过一遍 `lua_to_json()`
（`api/mod.rs:217-248`）。规则：

| Lua 值 | 变成 |
|---|---|
| `nil` | `null` |
| `true` / `false` | 布尔 |
| 整数 / 浮点 | 数字（`NaN` / `inf` → `null`，因为 JSON 没有它们） |
| 字符串 | 字符串 |
| **表**：`raw_len() > 0`（有连续整数键 `1..n`） | **数组** |
| **表**：否则 | **对象**（⚠️ **只收字符串键**，非字符串键**被静默丢掉**） |
| 其它（函数 / userdata / 线程） | `format!("{other:?}")` 的**调试字符串** |

⚠️ 两条实战推论：
1. **别把 `function` 塞进 payload**——它不会报错，会变成一个像
   `Function(0x7f…)` 的字符串发到前端，等到前端渲染时才出怪事。
2. **一张同时有数组部分和字典部分的表**走数组那条路，**字典那半会丢**。
   `{ is_repo = true, entries = {...} }` 这种表 `raw_len()` 是 0（没有 `[1]`），
   所以走对象分支——`plugins/git/main.lua:110` 与 `:119`（`is_repo` 那两处）
   正是这个形状，没问题。

⚠️ 还有一条不在这个转换里、但同样要记住的：**没有异步、没有 `require`、没有协程 API**。
一次 `nota.*` 调用是同步阻塞的；想拆多文件也做不到（`docs/12` §5.7 记了这条取舍）。

### 0.6 ⚠️⚠️ 变量名一律 ASCII，中文只许出现在注释和字符串里

**这不是风格建议，是"插件能不能加载"的分界线。**

Lua 的标识符只认 `[A-Za-z_][A-Za-z0-9_]*`：词法分析里那个 `lislalpha` 用的是 C 的
`isalpha`，而 `键` 的 UTF-8 字节（`0xE9 …`）在**任何 locale 下都不算字母**。
所以 `local 键_密钥 = "api_key"` 是**语法错误**：

```lua
local 键 = 1     -- ✗ 语法错误，整份插件加载失败
local key = 1    -- ✓
local 说明 = "密钥"  -- ✓ 字符串里的中文随便写
-- 注释里的中文也随便写 ✓
```

**代价是不对称的**：Lua 报的是 `<name> expected near '<\233>'`，
看到这句话很难想到"是我用了中文变量名"，而症状是**面板和菜单一起消失**
（`on_load` 根本没跑到）。我们自己在 2026-09-24 撞过这一次——
两份内置插件的**每一行**都没执行过，代码却是"写完"的样子。

**怎么不靠记性**：`src-tauri/src/lua/mod.rs` 里有一条用例
（`内置插件都能被_lua_编译`）会把 `plugins/*/main.lua` 逐个编译一遍。
自己写的插件在仓库外，就用 `luac -p your-plugin/main.lua` 过一下——
`lua -e "assert(loadfile('main.lua'))"` 也一样，一条命令的事。

⚠️ 这条**只**管名字。中文的注释、字符串、字段名（`{ label = "提交信息" }`，
键是 `label` 那个 ASCII 词）全都不受影响——Lua 的字段名是字符串，不是标识符。
⚠️ 用 `t.中文键` 这种写法同样不行：那是语法糖，`t.名字` 里的 `名字` 也是标识符。

---

## 1. 身份（永远可用）

这三格不申请任何能力就有（`api/mod.rs:36-39`）。

| 字段 | 类型 | 值 | 来源 |
|---|---|---|---|
| `nota.version` | string | **宿主应用**的版本，当前 `"0.1.0"` | `env!("CARGO_PKG_VERSION")`，编译期定死 |
| `nota.api_version` | integer | **ABI 号**，当前 `1` | `NOTA_PLUGIN_API_VERSION`（`manifest.rs:37`） |
| `nota.plugin_id` | string | 你在清单里声明的 id **原样**（`"nota.git"`，**没有归一化**） | 清单 |

⚠️ 三个"版本"别混：清单里的 `api` 栏和 `nota.api_version` 是**同一件事**（ABI），
`nota.version` 是**应用**的版本，清单里的 `version` 是**插件自己**的版本。
逐条见 `docs/11` §4.4。

⚠️ `nota.plugin_id` 与事件通道里那段 id **不是一个字符串**：
`nota.git` 在通道里是 `nota-git`（§4.1）。

---

## 2. `nota.log`（永远可用）

```lua
nota.log.info(msg)
nota.log.warn(msg)
nota.log.error(msg)
```

| 参数 | 类型 | 说明 |
|---|---|---|
| `msg` | **任意 Lua 值**（`mlua::Value`） | 只有一个参数 |

**返回值**：无。
**失败**：不会失败——`eprintln!` 的返回值被丢掉（`api/mod.rs:47-52`）。
**去哪了**：宿主 **stderr**，前缀 `[nota:<插件 id>]` + 级别（`api/mod.rs:43`）：

```
[nota:nota.git] INFO 开始刷新
[nota:nota.git] WARN 首次刷新改动失败：...
```

`msg` 的渲染规则（`value_to_text()`，`api/mod.rs:205-214`）：
`nil` → `"nil"`、布尔 → `true/false`、整数/浮点 → 十进制、字符串 → 原样、
**其它类型 → `format!("{other:?}")` 的调试字符串**。

⚠️ **`nota.log.*` 的输出前端看不到**：它只走 stderr，不进任何事件、不进通知条。
调试时**得盯着跑应用的那个终端**（`docs/06` §3.1 列了启动会打的那几行）。
要往界面上说话，用 `nota.ui.notify`（§8.1）——但那需要 `ui.notify` 能力。

⚠️ **第二个参数不会被打出来**：`nota.log.info("a", "b")` 只输出 `a`。
要拼字符串自己用 `..`（记得 `tostring()` 一下可能为 `nil` 的东西）。

---

## 3. `nota.command.register(name, fn)`（永远可用）

```lua
nota.command.register("refresh", function(args) … return { ok = true } end)
```

| 参数 | 类型 | 说明 |
|---|---|---|
| `name` | string | 命令名。**空字符串会被拒** |
| `fn` | function | 回调。**收一个参数 `args`**（前端传来的 JSON 转成 Lua 值） |

**返回值**：无。
**失败**：两种都**抛 Lua 错误**（`api/mod.rs:119-135`）。

| 情况 | 错误原文 |
|---|---|
| `name == ""` | `命令名不能为空` |
| 同名已经注册过 | `插件 {id} 重复注册命令 \`{name}\`` |

⚠️ **同名覆盖是刻意报错的**（`api/mod.rs:125-126`）：多半是复制粘贴改漏了，
静默覆盖会让人对着"怎么点下去跑的是另一个函数"查到天亮。
两个插件之间**不冲突**——命令表是每个插件一份（`api/mod.rs:114-116` 存进
registry 的 `nota_commands`）。

**回调被调用时**：`f.call::<Value>(args)`（`lua/mod.rs:250-253`）——
**就一个参数**，且**返回值会被序列化回前端**（§0.5 的规则）。
回调里抛错 → 宿主裹成 `Lua 出错（插件 {id}）：{message}`。

⚠️ **注册时机**：任何时刻都行（包括 chunk 顶层），但只在 `on_load` 里注册最稳——
`on_load` 一抛错整个插件就判失败，那时注册过的命令也调不到（`docs/11` §5.4）。

⚠️ **前端调命令时必须给 `plugin` 参数**（注册者的 id）：命令名只在**插件内部**唯一。
凭命令名猜是哪个插件的，两个插件重名时就会**静默跑到别人家里**（`docs/11` §7）。

---

## 4. `nota.event.emit(name, payload)`（永远可用）

```lua
nota.event.emit("git:status", { is_repo = true, branch = "main", entries = {} })
```

| 参数 | 类型 | 说明 |
|---|---|---|
| `name` | string | 事件名，**这半段是你的** |
| `payload` | 任意 Lua 值 | 走 `lua_to_json`（§0.5） |

**返回值**：无。
**失败**：抛错，原文 `发事件 {channel} 失败：{e}`（`api/mod.rs:160-161`）。

### 4.1 ⚠️ 通道名 = `plugin:<归一化 id>:<name>`

```rust
let channel = format!("plugin:{plugin_id}:{name}");   // api/mod.rs:158
```

其中 `plugin_id` 不是清单里的原样字符串，而是过了 `channel_id()`
（`manifest.rs:251-261`）的版本：**非字母数字字符（`-` 与 `_` 除外）映射成 `-`**。
所以：

| 清单里的 id | 事件名的前缀 |
|---|---|
| `nota.git` | `plugin:nota-git:` |
| `my_plugin` | `plugin:my-plugin:` |
| `git` | `plugin:git:` |

⚠️ **为什么必须归一化**：Tauri 的事件名**不认点号**（只允许字母数字和
`-` / `/` / `:` / `_`），原样发出去会得到一句
`only alphanumeric, '-', '/', ':', '_' permitted for event names`。
这就是 **BUG-3** 的现场——它属于"**加载成功、静默失效**"那一类：
插件列表里一切正常，错误只在第一次发事件时出现（`docs/07` §2 的教训）。

⚠️ **归一化会带来撞名**：`nota.git` 与 `nota-git` 两个都合法的 id 占同一个通道，
所以 `discover()` 会把后到的那个**直接判为加载失败**（`docs/11` §1.4）。

### 4.2 ⚠️⚠️ 前端**目前没有在听**插件频道

宿主自己的事件只有两个，都在前端的事件表里（`src/bridge/ipc.ts:199-202`）：

| 键 | 事件名 |
|---|---|
| `notify` | `nota:notify` |
| `documentChanged` | `nota:document-changed` |

⚠️ **曾经是四个**，另外两个是 `nota:plugin-panel` / `nota:plugin-menu`——
那两条**是错的，已经删掉**（BUG-13）：面板与菜单是**声明（状态）**，
注册发生在插件加载时、订阅发生在挂载之后，**推必漏**。它们现在走 registry 被**拉**
（§8.2 / §8.3）。**判据：声明是状态 → 拉；发生是事件 → 推。**

**插件发的 `plugin:<id>:<名字>` 一条都不在里面。** 也就是说：
`nota.event.emit` 今天**发得出去、没人收**——不报错，什么都没发生。

⚠️ 这不是"用错了"，是**接线的另一头还没做**（backlog 第 17 项）。
⚠️ **注意第 17 项的结论和第 16/38 项不一样**：那两项讲的是"**声明类**走错了通道"
（已修），本条讲的是"**数据类**事件没人消费"——`plugin:<id>:<name>` 这条通道
对**发生类**数据**是正解**，缺的只是前端那边的订阅端。
**别把结论推广成"事件机制别用"。**

`plugins/ai/main.lua:26-32` 就是照这个现状写的：它想靠事件问 git 插件要 diff，
注释里写着"本轮先直接返回 nil，让调用方回退到全文"。
**所以写插件时别把逻辑押在"对面收到我的事件了"上。**

### 4.3 方向只有一个

`nota.event` 只有 **`emit`** 这一个函数：**插件 → 前端**。
**前端 → 插件**那条路走**命令**（§3），两条路各管一头，别混（`api/mod.rs:143-144`）。

---

## 5. `nota.document`（需 `document.read` 或 `document.write`）

⚠️ 两层判断：**表**要 `read | write`（`api/mod.rs:67`）；
**表里的成员**各自再判（`document.rs:28` 判读、`document.rs:79` 判写）。
所以只申请 `document.read` 的插件拿到的 `nota.document` 上**没有** `set_text` 这一格。

### 5.1 读（`document.read`）

| 函数 | 返回 | 没有活动文档时 |
|---|---|---|
| `nota.document.get_text()` | string | **`""`**（`document.rs:32-37`） |
| `nota.document.get_path()` | string \| **nil** | **`nil`**（`document.rs:42-47`） |
| `nota.document.get_title()` | string | **`""`**（`document.rs:51-56`） |
| `nota.document.get_revision()` | integer | **`0`**（`document.rs:60-65`） |
| `nota.document.is_dirty()` | boolean | **`false`**（`document.rs:69-74`） |

⚠️ **读一律不抛错**：没有活动文档时给"空"而不是报错。这是刻意的——
"问一个现在没法回答的问题"和"越权"是两回事，前者不该让插件炸掉，
否则 `on_load` 里随便查一下状态就会变成"插件加载失败"（与 §7.3 同一个教训）。

⚠️ **`revision` 是干什么的**：一个单调递增的整数，`sync()` 里**只有文本真的变了**才
`+1`（`document/mod.rs:220-230`）。插件靠它判断"我上次看到的还是不是现在这份"。
⚠️ 它**不是**文档的全局版本号，是这份文档自己的。

⚠️ **BUG-6：`get_text()` 给的"活动文档"可能与用户正在看的那份不是同一个**。
切标签时前端只 `setActiveId(id)`，从不调 `api.doc.setActive`，于是后端的活动文档
只被 `new` / `open` / `close` 改过。**后果对插件是实的**：用户点着标签 A 在看 A，
`nota.document.get_text()` 返回的是**最后一次新建/打开的那份**——
AI 助手按这个路径写回就会**改错文档**。写会改文档的插件时先读 `docs/07` BUG-6。

### 5.2 写（`document.write`）

| 函数 | 参数 | 返回 | 失败 |
|---|---|---|---|
| `nota.document.set_text(text)` | string | 无 | 没有活动文档 → **抛** `没有活动文档` |
| `nota.document.append_text(tail)` | string | 无 | 同上 |

**副作用（两个都有）**：改完后端镜像 → 发一条 `nota:document-changed`
（`document.rs:124-134`）：

```json
{ "id": <文档 id>, "text": "<改完之后的全文>", "origin": "plugin" }
```

⚠️ 事件名与宿主自己发的**完全一致**（`origin` 字段用来区分是谁改的）。
**前端不必区分**——反正都是"后端这份跟你的不一致了，来拿"（`document.rs:120-123`）。

⚠️ **`set_text` 是整篇替换语义**。想"在光标处插一段"只能拿全文自己拼——
精细的选区/位置 API 排在后面的轮次（backlog 第 14 项）。
`plugins/ai/main.lua:108-116` 就是自己拼的：追加模式先看末字符是不是 `\n`，
再决定补几个空行。

⚠️ **`sync()` 里有一步值得知道**：它会把标题重新从正文里推一遍
（`document/mod.rs:228` 调 `derive_title`），并且把 `dirty` 置 `true`。
所以插件写一次文档，**标签页标题可能跟着变**（正文里第一个 `# ` 标题变了的场合）。

⚠️ **`append_text` 的实现是"读全文 + `push_str` + `sync`"**（`document.rs:100-113`），
不是真正的追加。文档大时它每次都是 O(全文)。

---

## 6. `nota.fs`（需 `fs.read` 或 `fs.write`）

⚠️ 表要 `fs.read | fs.write`（`api/mod.rs:74`）；`read` / `exists` / `list` 归
`fs.read`，`write` / `remove` 归 `fs.write`（`fs.rs:27-28` 起的两个 `if`）。

### 6.1 ⭐ 围栏：这是宿主**唯一**的安全边界

`fs.rs:1-14` 的文件头写得很直接："**这是本仓唯一一处安全边界，不能只靠'看着对'**"。
裁决全在 `resolve_in(root, given)`（`fs.rs:117-167`）——**纯函数、不依赖 Tauri**，
所以它有 5 个单元测试（`fs.rs:169-233`）。

**三步，缺一不可**：

| 步 | 做什么 | 拒掉的错误原文 |
|---|---|---|
| ① | **必须是相对路径**。绝对路径一律拒 | `nota.fs 只接受工作区内的相对路径，收到绝对路径 \`{given}\`` |
| ② | **`..` 在交给文件系统之前**按段算掉（只用 `canonicalize` 挡不住"写新文件"那条路）；`..` 弹出栈底还多就说明跑了出去 | `路径 \`{given}\` 跑到工作区外面去了` |
| ③ | **再比一次规范化结果**，防符号链接。文件还不存在（新建）就退而比**父目录** | `路径 \`{given}\` 经符号链接指向了工作区外面` |

（②③ 的分工：② 管"还没存在"的路径，③ 管"已经存在、但中间某段是软链"的路径。
`fs.rs:6-8` 解释了为什么必须有 ②：不加的话 `fs.write("../../.bashrc", …)`
正好从"文件不存在"这个缝里溜出去。）

**没有打开工作区时**：

```lua
nota.fs.read("a.md")
-- 抛：没有打开工作区，nota.fs 不可用
```

（`fs.rs:104-108`。⚠️ 注意是**一律拒绝**、不是"那就放开"——放开会让
"没开文件夹"变成一条**绕过围栏的路**，见 `fs.rs:10-11`。）

5 个用例钉住的就是这四条：`普通相对路径能过`、`点开头的清除掉但不越界`、
`绝对路径直接拒`、`用点点爬出去要拒`（含"里面绕一圈是合法的"）、
`符号链接指向外面要拒`。

### 6.2 函数

| 函数 | 能力 | 返回 | 失败 |
|---|---|---|---|
| `nota.fs.read(path)` | `fs.read` | string（文件全文） | 路径裁决不过 → 抛（§6.1 的三句之一）；读不到 / 不是合法 UTF-8 → 抛 `读文件失败 {path}：{source}` |
| `nota.fs.exists(path)` | `fs.read` | boolean | ⚠️ **路径裁决先跑**：越界照样抛错，不会返回 `false` |
| `nota.fs.list(path)` | `fs.read` | **已排序**的 string 数组 | 不是目录 / 读不到 → 抛 `读文件失败 {path}：{source}` |
| `nota.fs.write(path, text)` | `fs.write` | 无 | **会自动建父目录**（`fs.rs:79-82` 调 `ensure_dir`）；写不了 → 抛 `写文件失败 {path}：{source}` |
| `nota.fs.remove(path)` | `fs.write` | 无 | 删不了 → 抛 `写文件失败 {path}：{source}` |

⚠️ **`list` 的排序是 Rust 的字节序**（`fs.rs:67` 的 `out.sort()`），
对中文名就是 UTF-8 字节序（≈ 码位序），不是拼音。**不要假定"目录在前"**——
它把文件和目录**混在一起**排，也不告诉你哪个是目录。

⚠️ **`remove` 只删文件**（`std::fs::remove_file`，`fs.rs:93`）：给一个目录会失败，
而且**没有递归删除**。⚠️ 删掉就是删掉了，**没有回收站**——
这是 `fs.write` 那条"授予它 = 信任插件做破坏性操作"的实处（`docs/11` §3.2）。

⚠️ **没有的**：`mkdir`（`write` 会顺手建父目录，这是唯一建目录的路）、
`rename`、`copy`、读目录树。要这些得走 `nota.git`（如果确实是仓库里的操作）
或者等后续轮次。

### 6.3 ⚠️⚠️ 这道围栏只管走 `nota.fs` 的调用——但**别的刀已经在 2026-09-22 收走了**

**先说现在（2026-09-22 起）**：插件的 Lua 状态里**没有** `io` / `os` / `package` /
`require` / `loadfile` / `dofile` / `debug`，所以"用 `io.open` 绕过围栏"这条路
**已经不通了**。§6.1 这套裁决**现在是插件真正的文件系统权限边界**。

**再说这条为什么曾经是假的**（留着当教训）：mlua 的 `Lua::new()` 号称"安全子集"，
实际只等于"不能加载 C 模块"——`io` / `os` / `package` **全都在**。所以在那之前，
一个只申请了 `ui.notify` 的插件照样能 `io.open("/etc/passwd")`、`os.execute("rm -rf ~")`，
§6.1 那套裁决只是"**宿主递给插件的那把刀上的护手**，不是"插件没有别的刀""。

⚠️ 这条的完整实测证据与机制见 `docs/12` §5，缺陷编号是 `docs/07` BUG-10。
**写插件的人只需要记住结论**：要碰文件就申请 `fs.read` / `fs.write`，
**没有旁路**；想"偷偷读一下"是做不到的。

---

## 7. `nota.git`（需 `process.git`）

单层判据：`manifest.has(Capability::ProcessGit)` → `nota.git` 整张表（`api/mod.rs:78`）。

### 7.1 围栏三条

| # | 内容 | 在哪 |
|---|---|---|
| 1 | **只能起 `git` 这一个进程**，不是通用 subprocess | `git.rs:18`、`git.rs:166-167` |
| 2 | **工作目录锁死**：优先工作区根，没开工作区就退到**活动文档所在目录** | `挑工作目录()`（`git.rs:230-237`）+ `working_dir()`（`git.rs:212-223`） |
| 3 | **拒绝会重定向目标目录的参数**：`-C` / `--git-dir` / `--work-tree` / `--namespace`，**等号写法也拒** | `禁止的参数`（`git.rs:53`）、`run_git()` 开头（`git.rs:171-186`） |

第 3 条的必要性写在 `git.rs:22-23`：**只锁 cwd 是不够的**——
`git -C /elsewhere` 一句话就把 cwd 绕过去了。

⚠️ **已知边界（不是漏洞，是记录，`git.rs:25-27`）**：`git config --global`
这类会写用户**全局配置**的子命令**挡不住**，因为参数层面分不清它跟合法的
`git config --get`。所以 `process.git` 的实际含义是
**"能对你的机器做 git 能做的事"**，装插件时该按这个尺度信任。

**每次运行都设的环境变量**（`git.rs:192-194`），为的是不让交互式提示把界面卡死：

| 变量 | 值 |
|---|---|
| `GIT_TERMINAL_PROMPT` | `0` |
| `GIT_PAGER` | `cat` |
| `GIT_EDITOR` | `true` |

### 7.2 ⭐ 两种失败必须分开

**这是本节最要紧的一张表。** 同一个 `nota.git`，失败分两类，
**一类抛错、一类返回结果表**（`git.rs:29-41`）：

| 哪一类 | 什么时候 | 行为 |
|---|---|---|
| **调用错误**（插件写错了） | 传了 `-C` / `--git-dir` / `--work-tree` / `--namespace`（含 `--git-dir=/x` 写法）；参数不是字符串 | **抛 Lua 错误**，原文见下 |
| **环境未满足**（环境不具备） | 没开工作区**且**没有活动文档的目录；没装 `git` | **正常返回结果表**：原因在 `stderr`，`code` 非零 |

调用错误的原文（`git.rs:174-184`、`git.rs:247-251`）：

| 情况 | 原文 |
|---|---|
| 传了禁止的参数 | `nota.git 不接受 \`{arg}\`：它会把操作目标改到工作区之外` |
| `--git-dir=/x` 写法 | `nota.git 不接受 \`{head}=…\`：它会把操作目标改到工作区之外` |
| 参数不是字符串 | `nota.git.run 的参数只能是字符串，收到 {type_name}` |

⚠️ **为什么必须分开**（`git.rs:33-37`）：
调用错误是**插件作者**的问题，必须让他看见，**不能让它伪装成一次正常的 git 运行**；
而"这个目录不是 git 仓库"与"`git status` 在不存在的仓库里失败"是**同一类事**，
插件的处理方式也该是同一种。

### 7.3 ⚠️ 不分开会出真事（BUG-2 的现场）

`working_dir()` **曾经**对"没有工作目录"直接 `Err`。而 git 插件的 `on_load` 结尾
要刷一次状态——于是**"用户还没打开文件夹"被显示成"这个插件加载失败"**：
侧栏里赫然一行「失败」，而插件本身一个字都没写错。

修法是两头：

| 头 | 做了什么 |
|---|---|
| **宿主** | `挑工作目录()` 返回 `Err(String)` 而不是抛错，由调用方折成一张结果表（`git.rs:225-237`）。那条用例就叫 `两个都没有是环境不具备不是插件坏`（`git.rs:301-308`） |
| **插件** | `plugins/git/main.lua:189-192` 再包一层 `pcall` + `nota.log.warn`——注释里写明这是**刻意的**：为了"将来宿主新加的任何一种环境失败"都不会再变成一次误判 |

### 7.4 四个函数与**返回表的键名**（⚠️ 有一个坑）

| 函数 | 参数 | 返回表 |
|---|---|---|
| `nota.git.run(argv)` | **string 数组**（Lua 数组，位置参数） | `{ code, stdout, stderr, ok }` |
| `nota.git.status()` | 无 | `{ code, raw, stderr }` |
| `nota.git.diff(staged)` | `staged`：`true` 就加 `--cached`（可选，默认 `false`） | `{ code, text, stderr }` |
| `nota.git.repo_root()` | 无 | **string**（仓库根绝对路径）或 **`nil`** |

`status` 与 `diff` 实际跑的 argv：

```rust
["status", "--porcelain=v1", "-z", "-b"]        // git.rs:89
["diff", "--no-color"] (+ "--cached")           // git.rs:107-110
["rev-parse", "--show-toplevel"]                // git.rs:128
```

⚠️ `--porcelain=v1 -z` 是**给程序读的稳定格式**（不做颜色、不做分页）。
`-z` 的分隔符是 **NUL 而不是换行**（这样路径里能有空格和换行），
按 NUL 切完还要注意**重命名/复制会多跟一个路径**——`plugins/git/main.lua:14-59`
的 `parse_status()` 就是处理这个的活样例。

⚠️⚠️ **坑：`ok` 这个键不是四张表都有。** 三张结果表的构造点不一样：

| 谁 | `code` | 取文本的键 | `stderr` | **`ok`** |
|---|---|---|---|---|
| `run` 成功 | 进程退出码 | `stdout` | ✅ | ✅ `code == 0` |
| `status` 成功 | 进程退出码 | `raw` | ✅ | ❌ **没有这个键** |
| `diff` 成功 | 进程退出码 | `text` | ✅ | ❌ **没有这个键** |
| 三者「没有工作目录」 | **`-1`** | 各自那个键 = **`""`** | ✅ 原因 | ✅ `false` |

（`git.rs:69-74` / `:91-95` / `:112-116` / `没有工作目录的结果()` `:146-157`。）

**所以判断失败请一律用 `r.code ~= 0`，别用 `r.ok`。**
在 `status()` / `diff()` 成功的那条路上 `r.ok` 是 **`nil`**（假值），
写 `if r.ok then` 会把"成功"判成"失败"。

⚠️ 现状的实证：`plugins/git/main.lua` 全程用的是 `r.code`（`:83`、`:111`、`:116`、`:142`），
所以这个坑**今天没被踩**。它是那种"下一个人随手写 `if r.ok` 就中"的坑。

⚠️ **「没有工作目录」的结果表为什么要把空串给全**（`git.rs:141-145`）：
插件拿到的表要长得**跟成功时一样**，少一个键会让 Lua 那边在 `..` 拼接时炸在
`attempt to concatenate a nil value` 上——**那才是把环境问题伪装成插件 bug 的做法**。

⚠️ `repo_root()` 是唯一一个"拿不到就给 `nil`"的：不知道在哪儿跑、
或者 `rev-parse` 非零（不是仓库）都返回 `nil`，**不抛错**（`git.rs:122-134`）。
所以 `plugins/git/main.lua:159-161` 直接 `return { path = nota.git.repo_root() }`——
`path` 可能是 `nil`，前端要能接住。

⚠️ **`repo_root()` 返回的是 `stdout.trim()` 过的**（`git.rs:132`），
其余三个函数的文本**都是原样、没有 trim**。

---

## 8. `nota.ui`（需 `ui.notify` / `ui.panel` / `ui.menu` 中**任意一个**）

### 8.1 `nota.ui.notify(msg, level)` —— 需 `ui.notify`

| 参数 | 类型 | 说明 |
|---|---|---|
| `msg` | string | 必填 |
| `level` | string（可选） | 归一化，见下 |

**返回值**：无。**失败**：发事件失败 → 抛 `发通知失败：{e}`（`ui.rs:48`）。

**`level` 归一化表**（`normalise_level()`，`ui.rs:188-201`）：

| 传进去 | 得到的 |
|---|---|
| `"warn"` 或 `"warning"` | `warn` |
| `"error"` | `error` |
| `"success"` | `success` |
| **其它任何东西**（含 `nil`、拼错的词） | `info` |

⚠️ **认不出的一律当 `info`，不报错**——这是刻意的（`ui.rs:186-187`）：
"别把插件的笔误变成一次报错，那会让人为了一个无关紧要的通知层级去读栈"。

**发出去的事件**（`ui.rs:38-52`）：`nota:notify` —— **这是 `nota.ui` 三条里唯一推事件的**

```json
{ "plugin": "nota.git", "message": "已提交", "level": "success" }
```

⚠️ `plugin` 字段是**清单里的原样 id**（不归一化——归一化只用在**事件名**上）。

⚠️⚠️ **它是「推」的，所以有赛跑**：在 `on_load` 里调 `notify`，
那一刻 WebView 还没起来，**这条提示会静默丢掉**（Tauri 的 `emit`
对没有监听者的频道是成功返回的）。想报"插件已加载"这类话，用 `nota.log.info`。

### 8.2 `nota.ui.register_panel(spec)` —— 需 `ui.panel`

```lua
nota.ui.register_panel({
  id = "git", title = "Git", location = "right",
  render = function() return { { kind = "text", text = "现在是这样" } } end,
})
```

| `spec` 字段 | 必填？ | 默认 | 说明 |
|---|---|---|---|
| `id` | **必填** | — | 缺 → 抛 `register_panel 需要 \`id\` 字段` |
| `title` | 可选 | **`id`** | 侧栏上显示的名字 |
| `icon` | 可选 | `nil` | |
| `location` | 可选 | **`"right"`** | `"right"` = 右侧插件栏；**别的值不会报错**，但那块面板会落进右栏的「没有落脚处」那一组（用来把"你声明的面板没人要"摆出来） |
| `render` | 可选 | `nil` | **不写就是一块空面板**。写了就是一个**每次拉都现调**的函数，返回一串内容块（§8.5） |

⚠️ **`render` 是"现跑"，不是"加载时算一次"**——它是个函数，不是一张表，
宿主每次要面板内容都重调一遍（`ui.rs` 的 `面板内容()`，有用例钉着这条）。
所以里面必须是**此刻**的状态：该问 git 就问 git，该读设置就读设置。
把结果缓存到一个 `local` 里再返回它，症状是"面板显示的是几分钟前的东西，
而且看着像是对的"——两份内置插件都在文件头把这条写死了。

**返回值**：无。**失败**：缺 `id` → 抛（上表）；**`id` 与本插件已声明的重名 → 抛**
`插件 {id} 重复注册面板 \`{id}\``。

⚠️⚠️ **它不发事件，它写 registry（BUG-13）。** `register_panel` / `register_menu`
走的是「**声明是状态 → 拉**」：内容写进 Lua registry 的 `nota_panels`，
前端挂载后调 `nota_plugin_panels` **拉**一次。原先那两条事件
（`nota:plugin-panel` / `nota:plugin-menu`）**已经删掉了**——

**为什么必须是这样**：注册发生在**插件加载时**（`setup()` 阶段），
前端订阅发生在**挂载之后**。推的话必然漏，且**漏得安静**——
界面看着好好的，只是永远空着，日志里没有任何痕迹。
判据一句话：**需要靠"幂等"或"重放"来兜底的设计，通常意味着状态被存了两份。**
（本仓真按"记账 + 重放"写过一版，落地时被推翻，见 `docs/07` BUG-13。）

⚠️ **`id` 重复注册会当场报错，不是静默覆盖。** 理由同 `nota.command.register`：
多半是复制粘贴改漏了，静默覆盖会让人对着"怎么点下去跑的是另一个函数"查到天亮；
面板这边还多一层——重名会让前端两张卡片抢同一个 key。
（⚠️ 这条 2026-09-22 之前的行为是**反的**，那时文档写着"重复注册不报错"。）

### 8.3 `nota.ui.register_menu(spec)` —— 需 `ui.menu`

```lua
nota.ui.register_menu({ label = "提交…", command = "commit", menu = "plugins" })
```

| `spec` 字段 | 必填？ | 默认 | 说明 |
|---|---|---|---|
| `label` | **必填** | — | 缺 → 抛 `register_menu 需要 \`label\` 字段`。**也是重名的判据**（同一个 `label` 注册两次 → 抛） |
| `command` | **必填** | — | 缺 → 抛 `register_menu 需要 \`command\` 字段`。**必须是你自己注册过的命令名**——前端点下去时按这个名回调宿主，宿主再找插件要 |
| `menu` | 可选 | **`"plugins"`** | 放到哪个菜单下。⚠️ **目前只认 `"plugins"`**，见下 |
| `accelerator` | 可选 | `nil` | 快捷键，写法同内置菜单（`"Ctrl+Shift+K"`） |
| `prompt` | 可选 | `nil` | 点之前先问一句，同 §8.5 那张表（**字段完全一样**） |

**返回值**：无。**失败**：缺字段 → 抛（上表）；`label` 重复 → 抛
`插件 {id} 重复注册菜单 \`{label}\``。

**和 `register_panel` 一样写 registry —— 不发事件（BUG-13）**，
落在 `nota_menus`，由 `nota_plugin_menus` 拉。

**✅ 2026-09-24 接进菜单栏了**（`docs/07` 第 42 项）：拉回来的条目合成
**一栏「插件」**，插在「帮助」前面。合成与摆放的规则在
`src/ui/pluginMenus.ts`（含"`menu` 写别的值怎么办"），要点三条：

| 事 | 规矩 |
|---|---|
| `menu = "plugins"` | 进「插件」栏 |
| `menu` 写别的值 | **不静默丢掉**：照样摆进「插件」栏，标签后缀「（想挂到「X」栏，暂不支持）」，**而且是灰的** |
| 灰不灰的判据 | 就一条：`App.tsx` 的 `menuHandlers` 里有没有它的 id。**没有 = 灰**——不为插件单开第二条判据 |

⚠️ **键位撞车怎么办**：`accelerator` 走的是内置菜单**同一条**索引
（`ui/accel.ts::buildAccelIndex`，因为它拿到的就是同一份菜单数组），
规则因此也是同一条：**先到先得**，撞了在 `console.warn` 里点名两条命令、
**前一条生效**。「插件」栏排在「帮助」之前、也就是排在所有内置栏之后，
所以**内置键位永远赢**——插件想抢 `Ctrl+B` 是抢不走的，它只会拿到一条警告。

⚠️ `command` 那个字段**不做校验**：写一个没注册过的名字不会当场报错，
点了才得到 `插件 {id} 没有注册命令 \`{name}\``。**注册菜单前先把命令注册了。**

### 8.4 ⚠️ 表的存在性：两层判据

| 层 | 判据 |
|---|---|
| **`nota.ui` 这张表** | `ui.notify` **或** `ui.panel` **或** `ui.menu` —— `装_ui吗()`（`api/mod.rs:259-268`） |
| **表里的成员** | 各自再判一次（`ui.rs:35` / `:56` / `:61`） |

**两层是相乘的**：只申请 `ui.panel` 的插件表是有的、`register_panel` 有、
但 `register_menu` 是 `nil`（调了就是 `attempt to index a nil value`）。

⚠️ **所以第二层列了几条 `ui.*` 判据，第一层就得列几条。** 这是唯一一处**手工维护**、
也是唯一一处漏过东西的地方：

⚠️ **BUG-8：这两层曾经对不上。** `api/mod.rs` 那个条件**漏了 `ui.menu`**，
所以**只**申请 `ui.menu` 的插件连 `nota.ui` 都拿不到，`ui.menu` 这条能力形同虚设。
两个内置插件都申请了 `ui.panel`，所以一直没暴露。

**✅ 已在 2026-09-22 修掉**，而且修法不是"随手补一个 `||`"，是**让两层同源**：
第一层的判据由一张能力清单产生，那张清单的项数还要与 `ui.rs` 里的判据个数对得上。
判据同时剥成了纯函数，好让用例能钉住它（`build()` 要真的 `AppHandle`、构造不出来，
而这条判断是纯的）：

```rust
/// ⚠️ `ui.rs` 里每多一个 `manifest.has(Capability::Ui…)`，这里就要多一项。
/// 两处是**相乘**的关系：里面那个判据决定"表里有没有这个函数"，
/// 外面这个决定"表本身在不在"。漏一个就是 BUG-8。
const UI能力: [Capability; 3] = [Capability::UiNotify, Capability::UiPanel, Capability::UiMenu];  // api/mod.rs:259-263
fn 装_ui吗(manifest: &Manifest) -> bool { UI能力.iter().any(|c| manifest.has(*c)) }                // api/mod.rs:266-268
```

`api/mod.rs:82-89` 现在留了一段注释专门记这件事，末尾一句是本节最该记住的：
**"里面有判据、外面也得有——两处是相乘的关系，不是一个能代替另一个。"**

回归用例有 4 条（`lua::api::tests`，`cargo test` 因此从 32 条变 36 条，
计数只在 `docs/06` 记）：

| 用例 | 钉住什么 |
|---|---|
| `lua::api::tests::每一条_ui_能力都能单独装出_nota_ui` | **BUG-8 的回归**：遍历 `UI能力` 逐项造清单，每一条都必须能单独装出 `nota.ui` |
| `lua::api::tests::没申请_ui_能力就不装_nota_ui` | 反向：一个 `ui.*` 都没申请时**不该**有表（按能力装表、不装空壳） |
| `lua::api::tests::ui_能力清单要和_ui_rs_对得上` | `UI能力` 的项数必须等于 `ui.rs` 里 `manifest.has(Capability::Ui…)` 的出现次数——**Rust 没有反射，这条推不出来，所以退一步钉"数量"**（注释与断言消息里都写明了"这是提醒不是证明"）；将来谁往 `ui.rs` 加第四个 `ui.*` 判据，它就会红 |
| `lua::api::tests::能力的_serde_名字与_parse_说同一套话` | `#[serde(rename)]` 与 `Capability::parse()` 的两套名字同口径 |

⚠️ 于是"**加一个新的 `ui.*` 能力**"变成了一件有编译器/用例参与的事：
往 `ui.rs` 加判据 → 对不上 → 用例红 → 去 `UI能力` 补一项 → 外面那层自动带上。
`docs/08` §6 讲新增能力那类改动时也是这条路子。

### 8.5 面板 DSL：`render` 返回什么

一块内容是一个表，`kind` 字段决定它是哪一种。**只有下面七种**
（`src/ui/panel-nodes.ts::normalise` 是真相源）：

| `kind` | 字段 | 画成 |
|---|---|---|
| `heading` | `text` | 一小行加粗的标题 |
| `text` | `text`，`tone` | 一段正文，按 `tone` 上色 |
| `fields` | `items = { { label, value, tone } … }` | 左标签右值的几行（设置、状态） |
| `list` | `items = { { title, subtitle, badge, tone } … }` | 一列条目，`subtitle` / `badge` 可省 |
| `buttons` | `items = { { label, command, args, prompt, style, disabled } … }` | 一排按钮，点了调 `command` |
| `empty` | `text` | 居中的一句"这里没有东西" |
| `separator` | — | 一条分隔线 |

`tone` 取 `normal` / `muted` / `success` / `warn` / `danger`（`info` `error`
`warning` 是别名，见下）。`style` 取 `normal` / `primary` / `danger`。

⚠️ **认不出的 `kind` 会如实画成"不认识这种内容块"**，不静默丢掉，
也不猜它是哪一种——所以别写没在上表里的名字（别指望它长得像谁）。
字段类型不对则**退回默认值**（`text` 是数字 → 空串），不会让整块消失。

**三条硬规矩**（`panel-nodes.ts` 文件头有完整理由）：

1. **没有任何一条路能把字符串变成 HTML 或属性。** 全文没有
   `dangerouslySetInnerHTML`，插件塞的额外键**一概不往 DOM 上带**。
   面板里的富文本不是"以后再说"，是**不做**——要表达力就给新 `kind`。
2. **`args` 原样带着，宿主不解析**：它的形状是你和自己的命令之间的约定。
3. **上限是两侧各自把关**：宿主截大小（文本 4000 字符、每块 200 项、嵌套 6 层），
   前端再截一刀（防手改过的数据）。超了是**截断不是报错**。

**`prompt`：点之前先问一句**（面板按钮和菜单项**共用**这一套字段）：

| 字段 | 必填？ | 说明 |
|---|---|---|
| `arg` | **必填** | 答案放进 `args[arg]`。**缺了 `arg` 整个 `prompt` 当没写**——问了也送不出去，不如不弹 |
| `label` | 可选 | 输入框上面那行字，默认 `"请输入"` |
| `placeholder` / `hint` | 可选 | 占位符 / 底下那句解释 |
| `secret` | 可选 | `true` → 输入框遮屏（`type=password`）。**遮的是旁人的眼睛，不是存盘**——`nota.settings` 是明文的 |

⚠️ **用户取消时你的命令根本不会被调用**，不是"收到一个空值"。
所以命令里不用处理"他没填"这种情况——**除非**这个命令还能被别处调。
（这一条只有一个实现：`src/ui/plugin-prompt.ts::问参数`，面板和菜单都走它，
免得同一个"取消"在两处有两种解释。）

⚠️ **面板按钮的 `prompt` 在前端归一化，菜单项的 `prompt` 在宿主归一化**
（菜单那条路不经过前端白名单）。**两边的字段名必须一样**，因为它们最后
都进同一个 `问参数`——改一处忘了另一处，症状是"菜单里问得出、面板里问不出"。

---

## 9. `nota.http` —— 需 `network.http`

```lua
local r = nota.http.post({
  url = "https://api.example.com/v1/chat/completions",
  headers = { authorization = "Bearer " .. key },
  body = { model = "gpt-4o-mini", messages = { { role = "user", content = "你好" } } },
  timeout_ms = 120000,
})
```

| 规格字段 | 默认 | 说明 |
|---|---|---|
| `url` | **必填** | 缺 → 抛。见下面的地址围栏 |
| `method` | 看调用名 | `get` / `post` 会自动填上；`request` 不填就是 `GET` |
| `headers` | 空 | 值只收**文本/数字/布尔**，收到表 → 抛（早报早清楚） |
| `body` | 空 | 字符串 = 原样发；**表 = 当 JSON 发**，并自动补 `content-type: application/json` |
| `timeout_ms` | 30 000 | **上限 180 000**，超了**截到上限**不报错（写一个很大的数意图是"可能很慢"）；`0` → 抛 |

三个调用名：`nota.http.request(spec)`、`nota.http.get(url或spec)`、`nota.http.post(url或spec)`。
**返回一张表**：

| 键 | 说明 |
|---|---|
| `code` | HTTP 状态码（integer） |
| `text` | **原样**的响应体字符串 |
| `json` | ⚠️ **响应体能解析成 JSON 时才有这个键**：拆好的表，数组下标**从 1 起** |

⚠️ **4xx/5xx 不是错误。** 宿主关掉了 ureq 的 `http_status_as_error`，
所以配额用完、密钥不对这类话会**原样**回到 `code` + `text` / `json` 里，
由你去读、去显示。只有"连不上 / 超时 / 地址不合法"才抛。

⚠️ **`json` 解析不了就不给这个键，也不当错误**——4xx 常常回一整页 HTML，
那时你该看的是 `text` 里那段话，而不是一个把病因指错地方的"JSON 解析失败"。
**有了它才不用在 Lua 里抠 JSON**：Lua 没有 JSON 库，用模式匹配去取
`\n` 这类转义一定会错（AI 插件读 `r.json.choices[1].message.content` 靠的就是它）。

**两道围栏**：

| 围栏 | 规矩 |
|---|---|
| 地址 | `https://` 随便；`http://` **只放行回环**（`127.0.0.1` / `localhost` / `::1`，给本机大模型服务用），别的明文地址**直接拒绝**。⚠️ 判定按**主机名**做，`127.0.0.1.evil.com` 不算本机 |
| 大小 | 请求体 1 MiB、响应体 2 MiB（**超了算失败**，不是截断）；重定向最多 5 跳 |

⚠️ **它是阻塞的**：调用发生在 `spawn_blocking` 的线程里（`mlua` 的 `send` 特性），
所以界面不会冻住——但一次调用要等到对方回话为止，**没有流式**。
长文生成建议把 `timeout_ms` 提到十几万（`plugins/ai/main.lua` 用的是 120 000）。

⚠️ **`nota.http` 拿不到 `ctx`**（不碰文档、不碰设置）。一个能发 HTTP 的插件
顺手能读全文，等于给这条口子加了个没必要的放大器（`http.rs::build` 的注释）。

---

## 10. `nota.settings` —— 需 `settings.own`

```lua
local key = nota.settings.get("api_key")      -- 没设过 → nil
nota.settings.set("api_key", "sk-…")          -- 立刻落盘
nota.settings.set("api_key", nil)             -- 删掉这一项（不报错）
local 全部 = nota.settings.all()              -- 一张普通表
```

**一个插件一个文件**：`~/.config/nota/plugin-settings/<安全化后的 id>.toml`
（`nota.ai` → `nota.ai.toml`），**文件 0600、目录 0700**。

| 规矩 | 说明 |
|---|---|
| 键名 | **只认 ASCII 字母数字和下划线**，且**不含点**。`a.b` 在 TOML 里是嵌套表，读回来形状就变了 → 抛 |
| 值的类型 | 文本 / 数字 / 布尔。**表不行**（要存结构就自己序列化成文本） |
| 落盘时机 | **每次 `set` 立刻写**。没有"退出时统一保存"，也就没有"崩了丢设置" |
| 越界 | 只能碰**自己那个文件**——`build()` 拿的是本插件的 id，别的插件的设置你够不着 |

⚠️ **明文，没有加密。** 这不是偷懒：密钥要和插件的运行环境放在一起，
而这个环境能读的东西我们也都能读——加密只能把钥匙藏在同一台机器上，
挡不住真能读你文件的人。**它挡的是"这台机器上的其他用户"**（靠 0600），
以及"设置被不小心贴进 issue"（靠 UI 遮屏）。完整理由见 `docs/12` §插件设置。

⚠️ **`set(k, nil)` 是"删掉"，不是"存一个 nil"**——TOML 里没有 `nil` 这种东西。
删掉之后 `get` 回到 `nil`，插件那边通常该回落到自己的默认值。

---

## 11. 两个活样例（按行号）

> ⚠️ 行号会随文件改动漂移。对不上时**按函数名找**。

### 11.1 `plugins/git/main.lua`（327 行）—— "一个插件到底怎么写"

| 行 | 内容 | 值得学的地方 |
|---|---|---|
| `39-80` | `parse_status(raw)` | 按 NUL（`%z`）切分；⚠️ 重命名/复制（`X`/`Y` 是 `R`/`C`）**多跟一个路径**，不处理会整个列表错位 |
| `82-93` | `describe(entry)` | 把 `XY` 两个状态字符变成一句人话 |
| `101-131` | `refresh(nota, silent)` | **`silent` 参数**：`on_load` 时用户还没开文件夹，"不是 git 仓库"是理所当然的，**不该弹警告** |
| `104, 151-157` | 用 `r.code ~= 0` 判失败 | 全程没用 `r.ok`——§7.4 那个坑没被踩 |
| `106` | `nota.ui.notify("这里不是 git 仓库：" .. r.stderr, "warn")` | 把 git 的原始报错**接着自己的话**给出去 |
| `124` | `nota.event.emit("git:status", parsed)` | ⚠️ 通道真名是 `plugin:nota-git:git:status`；⚠️ 今天**后端没人听**（§4.2） |
| `130` | `nota.ui.refresh("git")` | 推给**界面**的那一句。与上一行是两件事：`event` 给插件、`refresh` 给界面 |
| `140-149` | `tone_of(e)` | 未跟踪→灰、已暂存→绿、剩下→黄。**"没暂存"是最容易被提交漏掉的**，所以要显眼 |
| `151-213` | `panel_content(nota)` | 每次读都现跑；不是仓库时**给一条能往下走的路**（去 `git init`），不是一片空白 |
| `215-239` | `M.commit(nota, message)` | 先 `add -A` 再 `commit -m`；⚠️ `"nothing to commit"` 单独识别成"没有改动需要提交"，**不是错误** |
| `243-321` | 注册四个命令 `refresh` / `diff` / `commit` / `repo_root` | **返回表**的写法：`{ ok = ..., text = ..., error = ... }` |
| `250-253` | `diff` 命令 | `args.staged` → `nota.git.diff(staged)` → 把 `r.code == 0` 折成 `ok` |
| `278-288` | `register_panel` | 一个插件一个面板，`id = "git"`，`render = function() … end`。⚠️ `location = "right"` 写的是**默认值**，写出来只为可读——它原先写 `"sidebar"`，那一页搬走后就成了 BUG-14（面板哪儿都不出现） |
| `290-311` | 两次 `register_menu` | ⚠️ 两个菜单项分别指向**已经注册过的**命令 `commit` / `refresh`；「提交…」带 `prompt`，**和面板上那颗按钮是同一份** |
| **`317-320`** | **`pcall(refresh, nota, true)` + `nota.log.warn`** | **全文件最该抄的一段**：`on_load` 末尾的调用一定要兜底，否则"环境不具备"会变成"插件加载失败"（§7.3）。⚠️ 也正因为 `refresh` 会走到 `notify`，而 `on_load` 时前端还没起来——见 §8.1 那条推/拉的提醒 |
| `323-325` | 空的 `on_unload` | 没有要落盘的状态——**空着是对的**，不用硬写点什么 |

### 11.2 `plugins/ai/main.lua`（418 行）—— "联网插件怎么写"

| 行 | 内容 | 值得学的地方 |
|---|---|---|
| `1-26` | 文件头 | 三条：走任何 OpenAI 兼容接口、**密钥是明文存的**、**变量名不许用中文**（§0.6） |
| `12-15` | 一条设计原则 | **AI 的输出不许直接落进文档**，一律先"预览并确认"。理由：模型会犯错，而"文档被悄悄改掉、用户按了 Ctrl+Z 才发现"是最坏的一种错 |
| `37-39` | `PRESET_ORDER` + `PRESETS` | ⚠️ 顺序**另写一张数组**而不是 `pairs` 遍历：`pairs` 顺序不保证，界面上那排按钮会每次重开都换位置，而且不报错 |
| `79-87` | `read_setting(nota, key, fallback)` | 把"没填 / 填错类型"折成同一个兜底值 |
| `108-121` | `gather(nota, scope)` | `scope = "diff"` 那条**如实说够不着**（§4.2 的现状），**不偷偷回退成全文**——那会让用户拿到"用整篇文档写出来的提交信息" |
| `130-199` | `send_request(nota, body_text)` | **`pcall` 包住 `nota.http.post`**；`r.code ~= 200` 时先取 `r.json.error.message`，取不到就把 `r.text` 前 300 字端出来（§9 的两条） |
| `163-168` | 4xx 的处理 | 配额、密钥这类病因**写在响应体里**，宿主不替我们判——所以这里必须自己读 |
| `177-186` | 200 但没有 `choices[1].message.content` | 形状对不上时**说清是哪儿对不上**，别只说"生成失败" |
| `201-223` | `run_preset` | 生成完**只存进 `preview`**，然后 `nota.ui.refresh("ai")` 让面板重拉 |
| `228-310` | `panel_content(nota)` | 三种按钮（设置）＋ 预览或五个预设。⚠️ `secret = true` 那一条遮的是**旁人的眼睛**，不是存盘（§10） |
| `335` | `local captured = id` | **经典闭包陷阱的解法**：不 `local` 一份的话，五个命令会全部指向最后一个预设——不报错，只是"点润色出来的是翻译" |
| `341-350` | `set_key` / `set_base` / `set_model` | 三件套共用 `save_setting`；**空串 = 清掉回到默认值** |
| `357-383` | `apply` 命令 | 真正写文档的那一处。⚠️ 注释明确要求**只能由界面上的确认按钮调用**；内容取自 `preview` 而不是 `args.text` |
| `368-370` | 追加模式 | 自己拼分隔空行：`current` 末字符不是 `\n` 就补两个（§5.2 的"整篇替换语义"） |
| `396-403` | `register_panel` | `render = function() return panel_content(nota) end`（§8.2 那条"现跑"） |
| `407-409` | 五个菜单 | 循环注册。⚠️ **菜单和面板上的按钮要对得上**——只在面板里放两个、菜单里放三个，用户就得记住"哪个功能在哪儿" |
| `412-417` | `on_unload` | ⚠️ **密钥故意不删**：卸载插件不该把用户填的东西一起扔了 |

---

## 12. 速查：能力 → 函数

| 能力（清单里的字面量） | 解锁 |
|---|---|
| *(不需要)* | `nota.version` / `nota.api_version` / `nota.plugin_id` / `nota.log.{info,warn,error}` / `nota.command.register` / `nota.event.emit` |
| `document.read` | `nota.document.get_text` / `get_path` / `get_title` / `get_revision` / `is_dirty` |
| `document.write` | `nota.document.set_text` / `append_text` |
| `fs.read` | `nota.fs.read` / `exists` / `list` |
| `fs.write` | `nota.fs.write` / `remove` |
| `process.git` | `nota.git.run` / `status` / `diff` / `repo_root` |
| `network.http` | `nota.http.request` / `get` / `post` （§9） |
| `ui.notify` | `nota.ui.notify` |
| `ui.panel` | `nota.ui.register_panel` （+ `render` 面板 DSL，§8.5） |
| `ui.menu` | `nota.ui.register_menu` （+ `prompt`） |
| `settings.own` | `nota.settings.get` / `set` / `all` （§10） |

⚠️ 表的**存在性**与表里**成员的存在性**是两层，见 `docs/11` §3.4 与本文 §8.4。
⚠️ 这张表描述的是**宿主 API 的可见性**，不是"插件能做的事的上限"——
`io` / `os` 那些旁路见 `docs/12` §5。
