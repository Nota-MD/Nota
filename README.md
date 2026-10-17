# Nota

[![验证](https://github.com/Nota-MD/Nota/actions/workflows/verify.yml/badge.svg)](https://github.com/Nota-MD/Nota/actions/workflows/verify.yml)

> 意大利语「笔记」。一款**所见即所得**的 Markdown 编辑器，带 **Lua 插件系统**。
> 四个官方插件（AI 助手、Git 版本控制、Slidev 演示、写作统计）独立发布；
> **安装包不随附插件**。

Nota **明确欢迎 AI 辅助贡献**；提交者必须在 PR 中声明 AI 使用范围，并**亲自完成**
所贡献功能的端到端测试。规则见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

**[Tauri 2](https://tauri.app/) + [Milkdown 7](https://milkdown.dev/)（ProseMirror）× Lua 5.4**

---

## 它是什么

Nota 把 Markdown 当成**一棵文档树**而不是一段纯文本。所以：

- **打字即渲染**：输入 `# ` 即变成一级标题，输入 `**粗体**` 即真的加粗，没有独立的预览窗格。
- **写的是 Markdown**：存到磁盘上是干净的 `.md`，不是 JSON、不是 HTML、没有私有格式。
  拿别的编辑器打开、拿 `git log` 看 diff，都是正常文本。
- **插件用 Lua 写**：每个插件一个**独立的 Lua 状态**，能拿到什么能力由清单声明决定——
  没申请 `process.git` 的插件，`nota.git` 那张表**根本不存在**。

## 现在能做什么

⚠️ **先说清楚现状**：Nota 还在早期，功能缺口是实打实的。
逐项状态以 **[`docs/10-feature-matrix.md`](docs/10-feature-matrix.md)**（138 项对照矩阵）为准，
**不要以本文为准**。

当前**真的能用**（有人在界面上点过，不是"代码写了"）：

- 新建 / 打开 / 保存 / 另存为 / 关闭，标签页多文档、脏标记、未保存提示
- 所见即所得编辑：标题、粗体、斜体、列表、引用、代码块、撤销重做
- 三种编辑模式：所见即所得 / 源码 / 分屏预览（`Alt+1` `/` `Ctrl+/` `/` `Alt+2`），查找替换
- 打开文件夹当工作区，文件树 + 大纲侧栏，右侧插件栏
- 专注 / 打字机 / 全屏三种沉浸模式（快捷键 `F8` `/` `F9` `/` `F11`，`Esc` 退出）
- **强制专注模式**（视图 → 强制专注…）：账户制——专注给余额加分、窗口失焦扣分，余额见底就一块
  置顶红屏 ＋ 一声尖锐的响，按「我回来了」回去（时长、权重、宽限都在设置第十页里）
  ⚠️ 为什么只算**半条**：红屏、那颗按钮、Alt+F4、每秒对账都在无头窗口里点过，
  但**警报声**与**置顶**这两条在无头 X 上验不了（那里没有声卡、也没有窗口管理器）——
  见 [`docs/04`](docs/04-ui-map.md) §2.11
- 格式化工具栏（默认不显示，可在菜单或设置里选三档）、文档主题切换
- 导出 HTML、打印
- 字数统计（字符 / 词 / 行 / 阅读时长）
- Lua 插件加载、安装与命令派发；开发态会在同级 `Nota-plugins` 仓库发现四个官方插件——**AI 助手**、**Git**、**Slidev 演示**、**写作统计**。**发布安装包不含插件**，需要用户在「设置 → 拓展」里安装 `.nota-plugin`

**代码在了、还没有人在界面上点过**（所以不算在上面那一条里）：

- 插入图片：对话框 / **粘贴** / **拖入**三条路，五个插入动作（无特殊操作 / 复制到当前目录 / `./assets` / `./$(filename).assets` / 指定路径）
- 上传图片到**你自己填的**服务器（`post` 多部件 或 `put` 裸字节 ＋ 自填字段名 / 请求头 / 从响应取哪一格），
  手动勾选与「据 YAML 自动上传」两条路；**默认关、一个服务商都不预置**（理由见 [`docs/10`](docs/10-feature-matrix.md) §11.2）
  ⚠️ 为什么没点过：粘贴与拖入在无头环境里喂不进去，上传**要真发一次才算数**——而那要把你的字节发给外部服务器
- 公式**点一下就地改**（`$x$` / `$$…$$`）：编辑时两根 `$` / `$$` 半透明标出输入位置，
  空源码按退格删掉整块。⚠️ 这条修的是一个**看不见的**毛病：在那之前敲进公式的字会
  **存盘时静默丢掉**（屏幕上有、文件里空），见 [`docs/07`](docs/07-feature-status.md) 第 53 项
  ⚠️ 为什么没点过：逻辑层有 28 条用例（`tests/math-view.test.ts`），但**一次窗都没开过**——
  「半透明看着对不对」「点一下焦点会不会被抢回去」都要真窗口才算数

**还没做**的大块：多窗口（把标签搬进新窗口）、最近文件列表、
AI 插件的可读范围与对话落盘（`docs/07` 第 57 / 61 项），
以及一批"字段存了值、还没有读取者"的设置项（清单见 `docs/10` §11.2）。

**导出**：HTML 与打印是自带的；**PDF / Word / RTF / ePub / LaTeX / OpenOffice / OPML 七种
借系统里那支 [Pandoc](https://pandoc.org/)**——Nota **不内嵌、不下载、不替你装**它，
系统里没有时界面上会如实说明（理由见 [`docs/10`](docs/10-feature-matrix.md) §11.2）。

**界面语言**：宿主 ＋ 前端 ＋ 插件都有一套（应用语言在插件清单里就用那一份，
不在就用英语并说明「此插件不支持您的语言」）。⚠️ **但今天覆盖得很少**：
换语言之后界面大部分仍是中文原文，改语言要重启生效——现状与测量见
[`docs/07`](docs/07-feature-status.md) §4。

> 完整的分档清单、缺陷编号（BUG-1…）与编号 backlog 见
> **[`docs/07-feature-status.md`](docs/07-feature-status.md)**。

## 跑起来

**依赖**：Rust ≥ 1.85、Node、WebKitGTK **4.1**（注意不是 6.0）+ 几个 GTK 开发包。
Fedora 上的装法与容器方案见 [`docs/06-build-run-test.md`](docs/06-build-run-test.md)。

```sh
npm install

# 开发（tauri 会自己起 vite）
npm run app

# 只跑前端
npm run dev

# 类型检查 + 构建
npm run build

# 前端测试全集（自动扫描 tests/*.test.ts）
npm test

# 后端测试
cd src-tauri && cargo test
```

## 项目结构

```
AGENTS.md              ← 开发入口（改代码前先读）
docs/                  ← 编号文档 01…13，见 docs/README.md
src-tauri/src/         ← Rust 后端
  commands/            　 nota_* 命令（Tauri IPC 的落点）
  document/            　 文档模型与 DocumentStore
  plugin/              　 插件宿主：发现 → 加载 → 派发 → 卸载
  lua/                  　 Lua 运行时；lua/api/ 是 nota.* 各张表
  settings/            　 设置（模块目录：mod.rs 与七个域文件，一页一个）
src/                   ← React 前端
  bridge/ipc.ts        　 调后端的唯一出口
  editor/create.ts    　  Milkdown 装配
  ui/                  　 侧栏 / 编辑区 / 状态栏 / 主页
  styles/              　 三条外观轴的 CSS 变量
../Nota-plugins/       ← 官方插件独立仓库（开发态相邻检出；不随安装包分发）
  plugins/git/         ← Git 插件
  plugins/ai/          ← AI 助手插件
  plugins/slidev/      ← Slidev 演示插件
  plugins/stats/       ← 写作统计插件
tools/doc-sync-check.sh ← 文档同步与行数自检
```

架构、逐文件接口、数据结构、UI 地图、插件怎么写——都在 **[`docs/`](docs/README.md)**。
**AI 智能体请从 [`AGENTS.md`](AGENTS.md) 开始。**

## 写一个插件

一个插件就是一个目录，两份文件：

```
plugins/hello/
  plugin.toml     ← 清单：id、版本、能力声明
  main.lua        ← 入口脚本，返回一个模块表
```

```lua
local M = {}

function M.on_load(nota)
  nota.command.register("hello.greet", function()
    nota.ui.notify("你好，来自插件")
  end)
end

return M
```

**能力必须声明**——`plugin.toml` 的能力表里不写 `ui.notify`，上面那行 `nota.ui.notify` 就是 `nil`。
清单逐栏说明与完整能力表见 [`docs/11-writing-a-plugin.md`](docs/11-writing-a-plugin.md)，
API 参考见 [`docs/13-lua-api.md`](docs/13-lua-api.md)。

## 开发约定（摘要）

完整六条见 [`AGENTS.md`](AGENTS.md) §0。最容易出问题的三条：

1. **改代码必须同批改文档**——映射表在 [`docs/09`](docs/09-doc-sync-policy.md)，
   提交前跑 `bash tools/doc-sync-check.sh`。
2. **任何源文件不超过 1000 行**，超了就地拆。
3. **"代码写了"不等于"能用了"**——`docs/10` 的判定标准是**有人在界面上点过**。

## 许可证

**[BSD-2-Clause](LICENSE)**。第三方组件（含以 vendored 方式编进二进制的 Lua 5.4）
见 [`THIRD-PARTY.md`](THIRD-PARTY.md)。
