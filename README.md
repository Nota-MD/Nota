# Nota

> 意大利语「笔记」。一款**对标 Typora** 的所见即所得 Markdown 编辑器，
> 带 **Lua 插件系统**、**AI 助手插件**与 **Git 版本控制插件**。

**[Tauri 2](https://tauri.app/) + [Milkdown 7](https://milkdown.dev/)（ProseMirror）× Lua 5.4**

---

## 它是什么

Nota 把 Markdown 当成**一棵文档树**而不是一坨文本。所以：

- **打字即渲染**：`# ` 打出来就变成一级标题，`**粗体**` 打出来就真的加粗，没有"预览窗格"这回事。
- **写的是 Markdown**：存到磁盘上是干净的 `.md`，不是 JSON、不是 HTML、没有私有格式。
  拿别的编辑器打开、拿 `git log` 看 diff，都是正常文本。
- **插件用 Lua 写**：每个插件一个**独立的 Lua 状态**，能拿到什么能力由清单声明决定——
  没申请 `process.git` 的插件，`nota.git` 那张表**根本不存在**。

## 现在能做什么

⚠️ **诚实先行**：Nota 还在早期，离"对标 Typora"有实打实的距离。
逐项状态以 **[`docs/10-typora-parity.md`](docs/10-typora-parity.md)**（97 项对照矩阵）为准，
**不要以本文为准**。

当前**真的能用**（有人在界面上点过，不是"代码写了"）：

- 新建 / 打开 / 保存 / 另存为 / 关闭，标签页多文档、脏标记、未保存提示
- 所见即所得编辑：标题、粗体、斜体、列表、引用、代码块、撤销重做
- 打开文件夹当工作区，文件树 + 大纲侧栏
- 字数统计（字符 / 词 / 行 / 阅读时长）
- Lua 插件加载与命令派发；内置 **Git** 与 **AI 助手**两个插件

**还没做**的大块：导出与打印（整类）、工具栏格式化按钮、查找替换、源码模式、
专注/打字机模式、主题切换界面。

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

# 后端测试
cd src-tauri && cargo test
```

## 项目结构

```
AGENTS.md              ← 开发入口。改代码前先读这份
docs/                  ← 编号文档 01…13，见 docs/README.md
src-tauri/src/         ← Rust 后端
  commands/            　 nota_* 命令（Tauri IPC 的落点）
  document/            　 文档模型与 DocumentStore
  plugin/              　 插件宿主：发现 → 加载 → 派发 → 卸载
  lua/                  　 Lua 运行时；lua/api/ 是 nota.* 各张表
  settings.rs           　 设置与三条外观轴
src/                   ← React 前端
  bridge/ipc.ts        　 调后端的唯一出口
  editor/create.ts    　  Milkdown 装配
  ui/                  　 侧栏 / 编辑区 / 状态栏 / 主页
  styles/              　 三条外观轴的 CSS 变量
plugins/git/           ← 内置 Git 插件（plugin.toml + main.lua）
plugins/ai/            ← 内置 AI 助手插件
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

**能力必须声明**——`plugin.toml` 里不写 `ui`，上面那行 `nota.ui` 就是 `nil`。
清单逐栏说明与完整能力表见 [`docs/11-writing-a-plugin.md`](docs/11-writing-a-plugin.md)，
API 参考见 [`docs/13-lua-api.md`](docs/13-lua-api.md)。

## 开发约定（摘要）

完整六条见 [`AGENTS.md`](AGENTS.md) §0。最容易踩的三条：

1. **改代码必须同批改文档**——映射表在 [`docs/09`](docs/09-doc-sync-policy.md)，
   提交前跑 `bash tools/doc-sync-check.sh`。
2. **任何源文件不超过 1000 行**，超了就地拆。
3. **别把"代码写了"当"能用了"**——`docs/10` 的判定标准是**有人在界面上点过**。

## 许可证

**[BSD-2-Clause](LICENSE)**。第三方组件（含以 vendored 方式编进二进制的 Lua 5.4）
见 [`THIRD-PARTY.md`](THIRD-PARTY.md)。
