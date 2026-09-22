# 04 — 界面地图：控件树、逐控件回调与外观

> 最后同步：2026-09-22

本文按 `src/App.tsx` 的 JSX 结构逐层展开界面，再把每个可交互控件对上它的回调、
最终走到的 `api.*`（或哪个快捷键），以及**当前是真的能用还是空壳**。

⚠️ **不要假设某个按钮能用**：本文的"状态"列与 `docs/07-feature-status.md` 是同一份
判断的两个视角；两者不一致时以 `docs/07` 为准（它带排期），但**以代码为最终事实**。

界面层没有原生控件树（这是与 Folio 最大的差别）：整个界面是 WebView 里的 HTML/CSS，
样式在 `src/styles/app.css`，全部颜色与尺寸走 `src/styles/theme.css` 的变量。

### ⚠️ 全局口径：**界面文案一律中文，不中英混杂**

用户 2026-09-22 定的，原话：「注意不要像他一样中英混杂。」——「他」指 Typora，
**它自己就是反面教材**：整个「帮助」菜单除最后三行外全是英文，其余五个菜单却几乎全中文，
看着像"这几条是后加的、没来得及翻"。逐项对照见 `docs/10` §11.2。

落地要点：

- **专有名词照写原文**：`Markdown`、`LaTeX`、`Pandoc`、`Git` 是**名字**不是词，不算混杂。
- **品牌名照写**：`Nota`。
- **菜单项、按钮、提示语、空态文案一律中文**——本文下面每张表的「文案」列就是这些。
- ⚠️ **新加串时对着这条过一眼**。这条规矩此前只存在于习惯里、没写下来过；
  现状是干净的（`src/` + `src-tauri/src/` 全查过），**别让它从这一批开始烂**。

---

## 1. 控件树

缩进表示 DOM 嵌套。带 `() 组件`的是独立文件里的 React 组件，其余是 `App.tsx` 内联。

```text
ErrorBoundary                       (ui/ErrorBoundary.tsx)  兜住渲染期崩溃
└─ div.app
   ├─ Toolbar                       (App.tsx 内联)  <header class="toolbar">
   │  ├─ span.toolbar-brand          文案「Nota」
   │  ├─ div.toolbar-actions
   │  │  ├─ button.btn               「新建」
   │  │  ├─ button.btn               「打开」
   │  │  ├─ button.btn               「打开文件夹」
   │  │  └─ button.btn               「保存」        disabled = 没有活动文档
   │  └─ button.btn.toolbar-dock-toggle  「插件」     aria-pressed = dockOpen
   │                                   ⚠️ 靠 `margin-left: auto` 推到最右，没加 spacer 元素
   │
   ├─ div.app-body
   │  ├─ Sidebar                    (ui/Sidebar.tsx)  <aside class="sidebar">
   │  │  ├─ nav.sidebar-tabs         role="tablist"
   │  │  │  ├─ TabButton             「文件」（默认选中）
   │  │  │  └─ TabButton             「大纲」
   │  │  └─ div.sidebar-body
   │  │     ├─ [tab=tree] FileTree
   │  │     │  ├─ p.sidebar-empty    「还没打开文件夹。／打开一个文件夹后这里会列出其中的 Markdown。」
   │  │     │  ├─ p.sidebar-empty    「这个文件夹里没有 Markdown 文件。」
   │  │     │  └─ ul.tree → TreeNodeRow
   │  │     │     ├─ li.tree-dir  > span.tree-dir-name    目录名（**纯文本，不可点**）
   │  │     │     └─ li.tree-file > button.tree-file-btn  文件名（可点，title 是绝对路径）
   │  │     └─ [tab=outline] ul.outline → li.outline-item  标题文本（**纯文本，不可点**）
   │  │        └─ p.sidebar-empty    「这份文档还没有标题。」
   │  │
   │  ├─ main.app-main
   │     ├─ EditorPane              (ui/EditorPane.tsx)   有活动文档时
   │     │  ├─ div.editor-loading    「正在准备编辑器…」（ready=false 时才有）
   │     │  └─ div.editor-mount      **React 永不往里渲染**，Milkdown 独占
   │     │                           （内联 --content-width = 设置的正文宽度）
   │     └─ Home                    (ui/Home.tsx)         没有活动文档时
   │        ├─ div.home-main
   │        │  ├─ h1.home-title      「Nota」
   │        │  ├─ p.home-lead        「所见即所得的 Markdown 编辑器」
   │        │  └─ div.home-actions
   │        │     ├─ button.home-action  「新建文档」 + 「Ctrl+N」
   │        │     ├─ button.home-action  「打开文件」 + 「Ctrl+O」
   │        │     └─ button.home-action  「打开文件夹」 + 「把一整个目录当工作区」
   │        └─ aside.home-side
   │           ├─ h2.home-side-title 「插件」
   │           ├─ p.home-hint        「没有发现插件。」（plugins 为空时）
   │           ├─ ul.home-plugins → li.home-plugin
   │           │   ├─ span.home-plugin-name
   │           │   └─ span.home-plugin-state  「已加载」/「已禁用」/「失败」
   │           └─ p.home-warn        「有 N 个插件没能加载，详情见右侧「插件」栏。」
   │
   ├─ PluginDock                    (ui/PluginDock.tsx)  <aside class="plugin-dock">
   │  │                              ⚠️ `dockOpen` 为 false 时**整个不渲染**
   │  ├─ nav.dock-head
   │  │  ├─ span.dock-title           「插件」
   │  │  └─ button.dock-close         「×」，title「收起插件栏」
   │  └─ div.dock-body
   │     ├─ section.dock-panels        (仅 location === "right" 的面板存在时)
   │     │  └─ article.panel → header.panel-head > span.panel-title
   │     │     └─ div.panel-body > p.panel-pending  「面板内容尚未接入。」
   │     ├─ section.dock-orphans       (仅"位置没有落脚处"的面板存在时)
   │     │  ├─ h4.dock-subtitle        「没有落脚处」
   │     │  ├─ p.dock-hint             「这些面板声明的位置目前还没有对应的地方…」
   │     │  └─ p.dock-orphan → span.dock-orphan-where  （声明的位置原文）
   │     ├─ h4.dock-subtitle           「已装插件」
   │     ├─ p.sidebar-empty            「没有发现插件。」
   │     └─ ul.plugins → li.plugin.plugin-{state}
   │        ├─ div.plugin-head > span.plugin-name / span.plugin-version
   │        ├─ div.plugin-id
   │        ├─ p.plugin-desc          （有 description 才渲染）
   │        ├─ p.plugin-error         （有 error 才渲染，标红）
   │        └─ div.plugin-caps > span.cap  × N
   │
   ├─ TabBar                        (App.tsx 内联)  仅 docs.length > 0 时渲染
   │  └─ div.tabbar[role=tablist] → div.tab[role=tab]
   │     ├─ button.tab-label         （.tab-dot 小圆点 + 文档标题）
   │     └─ button.tab-close         「×」
   │
   ├─ StatusBar                     (ui/StatusBar.tsx)  <footer class="statusbar">
   │  ├─ span.status-left            路径 或「未保存」；dirty 时追加 span.status-dirty「● 已修改」
   │  └─ span.status-right           「N 词」「N 字符」「N 行」「约 N 分钟」
   │
   └─ Toasts                        (ui/Toasts.tsx)  仅 items 非空时渲染
      └─ div.toasts[role=status] → div.toast.toast-{level}
         ├─ span.toast-message
         └─ button.toast-close      「×」
```

⚠️ **标签栏在编辑区下方**（`div.tabbar` 的 DOM 位置在 `div.app-body` 之后，
CSS 给的是 `border-top`）。这与"标签在顶部"的常见布局相反，改顺序前先想清楚是否
要一起改 `.tabbar` 的边框那一行。

---

## 2. 逐控件表

### 2.1 工具条（`Toolbar`）

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 品牌 | `Nota` | 无 | 纯文本 |
| 按钮 | 新建 | `newDoc()` → `api.doc.create()` → `refreshDocs()` → `setActiveId(id)` | ✅ 能用 |
| 按钮 | 打开 | `openViaDialog()` → `plugin-dialog` 的 `open({title:"打开", filters:[md, markdown, mdown, mkd, txt]})` → `openPath()` → `api.doc.open(path)` | ✅ 能用 |
| 按钮 | 打开文件夹 | `openFolder()` → `open({title:"打开文件夹", directory:true})` → `api.workspace.open(picked)` → `api.workspace.tree(undefined, 1)` | ✅ 能用（⚠️ 开了之后**没法关**，见 §2.2） |
| 按钮 | 保存 | `saveDoc(activeId)` → 需要时弹 `save({title:"保存为"})` → `editorRef.getMarkdown()` → `api.doc.sync()` → `api.doc.save()` → toast「已保存到 …」 | ✅ 能用；`hasActive === false` 时 `disabled` |
| 按钮（最右） | 插件 | `setDockOpen(v => !v)`——**纯前端，不走后端** | ✅ 实测过：开→关，正文区宽度跟着补上。⚠️ 状态**不持久化**，重启回到默认（开）。`title` 跟着状态换「收起插件栏」/「展开插件栏」 |

### 2.2 侧栏（`Sidebar`）

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标签页 | 文件 | `setTab("tree")`（**只改本地 state**，不走后端） | ✅ 默认页 |
| 标签页 | 大纲 | `setTab("outline")` | ✅ 能用（内容只读） |
| 文件树·文件 | 文件名 | `onOpenFile(`${workspace}/${node.path}`)` → `openPath()` → `api.doc.open()` | ✅ **能点开**（`Sidebar.tsx` 的 `TreeNodeRow` 有 `onClick`）；`title` 显示拼出来的绝对路径。⚠️ `docs/07` 第 25 项与 `docs/10` §2 的"文件树"一行都写着"点了不开/只读展示"，**与代码不符**，见 §7 |
| 文件树·目录 | 目录名 | 无 | ⚠️ **空壳**：本轮只列一层（`depth = 1`，`children` 恒为 `null`），目录不可展开、不可点。`nota_workspace_tree` 的 `sub_path` + `depth` 已经支持按支取树，接线排在后面 |
| 文件树·空态 | 「还没打开文件夹。／打开一个文件夹后这里会列出其中的 Markdown。」 | 无 | ✅ |
| 文件树·空态 | 「这个文件夹里没有 Markdown 文件。」 | 无 | ✅ |
| 大纲·条目 | 标题文本 | 无 | ⚠️ **未接线**：`OutlineItem.line`（正文里的 0 起行号）**已经算好了**，就是为了将来"点了跳过去"用；点击跳转还没做。所以 `.outline-item` 的 CSS 有 `:hover` 背景，鼠标移上去像能点，实际不响应 |
| 大纲·空态 | 「这份文档还没有标题。」 | 无 | ✅ |

⚠️ **「插件」那一页 2026-09-22 从这一栏搬到了右边**（`PluginDock`，见 §2.2b）。
理由不是"顺手挪个位置"：**左侧是文档导航、右侧是工具面**，两者的**使用节奏不同**——
导航是写东西时一直要看的，工具面板是偶尔开一下的。用户同日拍的板，见 `docs/10` §5。

### 2.2b 右侧插件栏（`PluginDock`）

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标题 | 「插件」 | 无 | ✅ |
| 关闭 | 「×」 | `setDockOpen(false)`，**整个 `<aside>` 不再渲染** | ✅ 实测过 |
| 面板·标题栏 | 插件声明的 `title`（缺省用 `id`） | 无 | ✅ **2026-09-22 起真的会出现**：Git 与 AI 两个内置插件各一张，见下 |
| 面板·内容 | 「面板内容尚未接入。」 | 无 | ⚠️ **机制还没有**：面板内容要等纯 Lua 的声明式面板 DSL（`docs/07` 第 15 项）。**这里如实写出来，不做假界面** |
| 面板·没有落脚处 | 面板名 + 它声明的 `location` | 无 | ⚠️ 只在有面板声明了 `right` 以外的位置时才出现。**存在的意义是"声明了的东西不静默消失"** |
| 已装插件·每一项 | 名称 / 版本 / id / 描述 / 错误 / 能力 chip | 无 | ⚠️ **只读**：没有启用/禁用开关（`api.plugin.setEnabled` 前端从未调用），也没有"手动跑一下这个命令"的入口 |
| 已装插件·空态 | 「没有发现插件。」 | 无 | ✅ |

⚠️ **开关一旦做出来，禁用/启用之后要重拉 `plugin.panels()`**——
`PluginHost::生效的()` 按"加载成功且没被禁用"筛，禁用之后那家的面板该从清单里消失。

✅ **插件自己声明的面板 2026-09-22 起进得来了。** 原先是后端把面板当事件发出去
（`nota:plugin-panel`）而前端一个订阅者都没有（BUG-13）；现在改成
**注册进插件的 Lua registry（`nota_panels`）+ 宿主按需拉**（`nota_plugin_panels`），
与 `nota_commands` 同一范式。开窗实测 Git 面板出现在栏顶。
⚠️ **别把它改回事件**：注册发生在**插件加载时**、前端订阅在**挂载之后**，直连必漏且漏得安静。

⚠️ **这一栏没有快捷键**，只能点工具条那个开关或栏里的 ×。

⚠️ **侧栏没有「文档列表」页**（Typora 的 Ctrl+Shift+1/2/3 里的第二页是最近打开的文档）。
`Sidebar.tsx` 的文件头注释里写明了：文档列表排在后面。
在 `docs/07` §3 的 backlog 里这是两项：**第 8 项**（列表 UI）依赖 **第 9 项**（最近文件的存取，
后端那半）——`Home.tsx` 引的也是第 9 项。**顺序不能反**：没有存取，列表就是个空壳。

⚠️ **侧栏没有快捷键**。Typora 用 Ctrl+Shift+1/2/3 切三页，Nota 目前只能用鼠标点
（左栏两页 + 右栏一个开关，全都没有快捷键）。

### 2.3 编辑区

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 加载提示 | 「正在准备编辑器…」 | 无（`ready === false` 时显示） | ✅ |
| 编辑器本体 | — | Milkdown 拥有那棵 DOM；文本变化走**去抖 300ms → `api.doc.sync()`** | ✅ 能用，链路见 `docs/05` |
| 任务项复选框 | 无文案（方框画在列表项的**左外侧装订线**里） | 点方框 → `editor/task-list.ts` 按几何命中 → `setNodeMarkup` 翻 `checked` | ✅ 能勾（2026-09-22 开窗实测）；装订线宽度走 `--task-check-gutter` |
| 代码块右下角那一条 | 「折叠」「复制」+ 语言下拉（首项「纯文本」） | 同一处的 NodeView（`editor/code-block.ts`）：复制走 `navigator.clipboard` 兜底 `execCommand`，**界面文案会在 1200ms 内变成「已复制」/「复制失败」**；折叠**只活在这个视图里、不写进文档** | ✅（2026-09-22 开窗实测）。⚠️ 那一条是 `opacity: 0` 的，**鼠标进代码块才亮**（Typora 也这么收着） |
| 装载后的认领 | 无文案 | `EditorPane` 在 `focus()` 之后调一次 `api.doc.settle(id, text)` | ✅ 修 BUG-12 的那一步，见 `docs/03` §4.2 |
| 空态（`Home`） | 「新建文档」+「Ctrl+N」 | `onNew` → `newDoc()` | ✅ |
| 空态（`Home`） | 「打开文件」+「Ctrl+O」 | `onOpen` → `openViaDialog()` | ✅ |
| 空态（`Home`） | 「打开文件夹」+「把一整个目录当工作区」 | `onOpenFolder` → `openFolder()` | ✅ |
| 空态（`Home`） | 插件状态列表 + 失败计数 | 无 | ✅ 只读；失败**要显眼**是刻意的——静默失败会让人以为自己装错了 |

⚠️ `EditorPane` 由 `App.tsx` 用 `key={activeDoc.id}` 挂载：**换文档 = 整个组件重挂**。
这是刻意的（省得去写"把 A 文档的撤销栈换成 B 的"），见 `docs/05`。

### 2.4 标签栏（`TabBar`）

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标签题 | 文档标题（脏时前面有小圆点，`title="有未保存的改动"`） | `onSelect` → `setActiveId(id)` | ⚠️ **只改前端 state，不调 `api.doc.setActive`**：后端的 `active` 仍停在最后一次新建/打开/关闭的那份。插件 `nota.document.*` 读的是**后端 active**，所以用户点了别的标签后插件可能读错文档（见 `docs/03` §11 第 1 条） |
| 关闭 | `×`（`title="关闭"`） | `closeDoc(id)`：`doc.dirty && settings.confirm_unsaved` → `window.confirm("「标题」有未保存的改动，仍然关闭吗？")` → `api.doc.close()` → `refreshDocs()` → 活动切到列表最后一份 | ✅ 能用 |

### 2.5 状态栏（`StatusBar`）

| 控件 | 文案 | 数据来源 | 当前状态 |
|---|---|---|---|
| 左 | 文档路径（`title` 是路径；无路径时显示「未保存」，`title="尚未保存"`） | `doc.path` | ✅ |
| 左 | 「● 已修改」 | `doc.dirty` | ✅ |
| 右 | 「N 词」，`title="词数（中文按字计）"` | `countText(doc.text)` | ✅ |
| 右 | 「N 字符」，`title="字符数（按码点计）"` | 同上 | ✅ |
| 右 | 「N 行」，`title="行数"` | 同上 | ✅ |
| 右 | 「约 N 分钟」，`title="按每分钟 250 词粗略估算"` | 同上 | ✅ |
| 无文档时 | 「就绪」 | — | ✅ |

⚠️ 状态栏是**四项**（词 / 字符 / 行 / 分钟）。`AGENTS.md` §2 与 `docs/10` §4 都写成"**六项**"
（`docs/10` 那行自己列的也是四项）——**以代码为准**：`StatusBar.tsx` 只渲染四个 `span`。
见 §7。

⚠️ 计数与大纲吃的都是 **`doc.text`——后端镜像**（`api.doc.list()` 的结果），
不是编辑器的实时文本，所以打字时它们会**慢一个去抖周期（300ms）**才动。
口径与误差见 `docs/05` §大纲与字数。

### 2.6 提示条（`Toasts`）

| 控件 | 文案 | 回调 | 当前状态 |
|---|---|---|---|
| 消息 | 任意 | 无 | ✅ |
| 关闭 | `×`（`title="关掉"`） | `onDismiss(id)` → 从列表里删掉 | ✅ |

行为：`toast(message, level)` 生成本地 id 后追加；`error` 存活 8000ms，其余 3200ms；
`role="status" aria-live="polite"`。⚠️ **自己画而不用 `window.alert`**：
alert 会**阻塞整个 WebView**，在编辑器里打字打到一半弹一个 alert，输入法组合态会被打断。
⚠️ **同一口径现在覆盖全仓**：原来唯一的例外是 `closeDoc` 里的
`window.confirm`，2026-09-22 起换成自画的 `ui/ConfirmDialog.tsx`（见下）。

### 2.6b 确认框（`ConfirmDialog`）—— 2026-09-22 起

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标题 | 调用方给（如「有未保存的改动」） | 无 | ✅ |
| 正文 | 调用方给（如「「未命名 1」还没存盘，关掉这份改动就没了。」） | 无 | ✅ |
| 「取消」 | 「取消」 | `onAnswer(false)` | ✅ 默认焦点**不**在它身上 |
| 确认键 | 调用方给（缺省「确定」）；危险动作用 `.btn-danger` 画红 | `onAnswer(true)` | ✅ **自动聚焦** |

键盘：`Esc` → 取消、`Enter` → 确定；点背景（`mousedown` 落在 backdrop 上）→ 取消。
⚠️ **它是受控组件**：自己不持有"开不开"，也不持有答案——`App.tsx` 里
`askConfirm()` 返回一个 `Promise<boolean>`，由按钮的点击来兑现（`answerConfirm`）。
⚠️ `confirmResolve` 是**单个 ref、不是队列**：今天所有调用点都是用户动作直接触发的
（关文档），不存在并发；真要并发弹两个，后来者会把前一个的 Promise 永远挂着。

**为什么要自己画**：`window.confirm` **阻塞整个 WebView**，而"关一份没存盘的文档"
随时会发生、且多半发生在用户刚打完字的时候——它会打断中文输入法的组合态。
与 `Toasts` 避开 `alert` 是同一条理由，只是那边先做到、这边漏了（`docs/07` 第 29 项）。

### 2.7 崩溃屏（`ErrorBoundary`）

| 控件 | 文案 | 回调 | 当前状态 |
|---|---|---|---|
| 标题 | 「界面出了点问题」 | 无 | ✅ |
| 说明 | 「你正在编辑的内容还在后端存着，没有丢。…」 | 无 | ✅ 与 §真相在哪 的口径一致：崩溃丢的是前端那份（真相），后端的镜像还在。⚠️ 但镜像最多滞后一个去抖周期，所以**最后约 300ms 的击键可能没进镜像**（`docs/03` §1.1） |
| 详情 | `error.message` + 组件栈 | 无 | ✅ |
| 按钮 | 「试着继续」 | `setState({error:null, info:null})` | ✅ |

另外 `installErrorHooks()`（在 `main.tsx` 里调一次）把 `unhandledrejection` 与
`window.error` 打到控制台——打包后没有 devtools，那时这类错误走 journal。

---

## 3. 外观：三条互相独立的轴

⚠️ 这一节的标题被代码注释引用——**一共两处**，改标题要同时改：
`src-tauri/src/settings.rs`（文件头第 13 行，以及第 23 行 `风格表` 那条文档注释）、
`src/styles/theme.css`（文件头第 15 行）。两处写的都是"`docs/04-ui-map.md` 的外观一节"。

📌 **本行曾把 `applyTheme.ts` 也算成第三处，那是错的。** `src/styles/applyTheme.ts`
的文件头通篇没提 `docs/04`——它讲的是三条轴怎么落到 DOM 上。当时的错误是
"按印象凑数"：看见外观相关有三个文件，就假定三个都引了本节。
**跟 `docs/07` §4 里那四条是同一个毛病。**

⚠️ 另外别把 `theme.css` 里那句"三处缺一不可"跟这里的"两处"混起来——**那是另一件事**：
往某条轴上加**新取值**时要动的地方。它数的是 `theme.css` + `settings.rs` 的枚举 + 本节，
**还漏了** `src/bridge/ipc.ts` 第 38–39 行的 `UiStyle` / `UiMode` 联合类型。
真加一个风格时是**四处**，`theme.css` 那句该补上 `ipc.ts`。

### 3.1 三条轴各是什么

| 轴 | 设置字段 | DOM 属性 | 写在哪个元素上 | 管什么 |
|---|---|---|---|---|
| **界面风格** | `ui_style` | `data-ui-style` | `<html>` | **一整套设计语言**：控件形状、圆角、间距、控件高度、阴影、字体栈。⚠️ 它**不是**"主题"的同义词 |
| **明暗** | `ui_mode` | `data-ui-mode` | `<html>` | 亮/暗。`auto` 时跟随系统（`prefers-color-scheme`）。**任何风格下都成立** |
| **文档主题** | `document_theme` | `data-doc-theme` | `<html>` | **只管正文**（`.editor-mount` 里面那一块），不动应用外壳一分 |

取值：

| 轴 | 取值 | 落点 |
|---|---|---|
| `data-ui-style` | `auto` / `adwaita` / `macos` / `yaru` / `windows` | `auto` 由 `detectStyle()` 解析：含 `kde`/`plasma` → `adwaita`，含 `ubuntu` → `yaru`，**探不出来就 `adwaita`**（GNOME 的原生语言，也是 WebKitGTK 下最不出错的一档） |
| `data-ui-mode` | `auto` / `light` / `dark` | `auto` 由 `matchMedia("(prefers-color-scheme: dark)")` 解析 |
| `data-doc-theme` | 任意主题名（当前 CSS 里有 `github`、`newsprint`） | **空串 = 用内置默认**，此时属性被 `delete` 掉，让 `.ProseMirror` 上那一层默认样式接手 |

写入动作在 `applyTheme(settings)`（`src/styles/applyTheme.ts`），由 `App.tsx` 的
`useEffect(() => { if (settings) applyTheme(settings); }, [settings])` 触发。
它同时还把 `--ui-font-size` 设到 `document.documentElement` 的内联样式上。

⚠️ `guessDesktop()` 目前**恒返回空串**（WebKitGTK 不把桌面环境告诉 JS），
所以 `auto` 实际上总是落到 Adwaita。代码注释里写明：等接上 XDG portal 的
`color-scheme` 之后换成读 portal 的值。

### 3.1b ⚠️ 不属于三条轴的那些尺寸常量

`theme.css` 里除了三条轴的变量，还有一组**布局常量**。它们**不跟任何设置项走**、
**不随风格变**，写死在 `:root` 里：

| 变量 | 值 | 谁用 |
|---|---|---|
| `--sidebar-width` | `240px` | 左侧栏 |
| `--dock-width` | `260px` | **右侧插件栏**（2026-09-22 新增） |
| `--toolbar-height` | `38px` | 工具条 |
| `--statusbar-height` | `26px` | 状态栏 |

⚠️ **为什么 `--dock-width` 比 `--sidebar-width` 宽 20px，不是同一个值**：
插件卡片里有名称 + 版本 + 能力标签，密度比"一行一个文件名"的文件树高。
**别为了省一个变量把它并过去。**

⚠️ **改这些值的时候，有两个地方会跟着错，且都不报错**：
① `app.css` 里 `pre.nota-srcmark::before` 的 `right: calc(100% + 15px)` 把
`pre` 的内边距（14px）与边框（1px）**写成了字面量**——改 `pre` 的内边距时要跟着改；
② 右键插件栏的宽度变化会让正文区宽度变，`.milkdown` 的 `margin: 0 auto` 居中
依赖的就是这个——宽度改了、`--content-width` 没改，内容仍会居中，所以**不会看出问题**。
这两条都是"错了也看不出来"的那类，改之前先扫一眼 `grep -n "calc(100% + 15px)" src/styles/app.css`。

### 3.2 二维相乘：`theme.css` 的组织约定

```text
[data-ui-mode="…"]    只设**颜色**变量
[data-ui-style="…"]   只设**形状**变量
两者相乘（同时挂在 <html> 上，各自命中）
```

| 类别的变量 | 谁设 | 具体是什么 |
|---|---|---|
| 颜色 | `[data-ui-mode]`（含 `:root` 的 light 兜底） | `--bg` `--bg-subtle` `--bg-raised` `--bg-hover` `--bg-active` `--fg` `--fg-muted` `--fg-faint` `--border` `--border-strong` `--accent` `--accent-fg` `--danger` `--warn` `--success` `--shadow` `--doc-bg` `--doc-fg` `--code-comment` `--code-keyword` `--code-string` `--code-number` `--code-function` `--code-attr` `--code-tag` |
| 形状 | `[data-ui-style]` | `--radius-sm` `--radius` `--radius-lg` `--control-height` `--spacing` `--toolbar-shadow` `--btn-font-weight`（macos 另外换 `--font-ui` 字体栈） |

⚠️ **不许把颜色写进 `[data-ui-style]` 那一段**。颜色一旦在风格里写死，这个风格就
没法配暗色了——而"我要 macOS 风格 + 暗色"是必然会出现的需求。反过来也一样：
`[data-ui-mode]` 那一段只管颜色，**不许改圆角和行为性尺寸**。

⚠️ **唯一预告过的例外还没写进 CSS**：`theme.css` 里 yaru 那段的注释说
"强调色偏橙……这是允许的例外"，但 `[data-ui-style="yaru"]` 块里目前**只有形状量，
没有 `--accent`**。补它的时候要按注释的口径来（只换明度不换色相）。

`src/styles/app.css` 的铁律（写在它的文件头）：**颜色与尺寸一律走变量**，
那里不该出现写死的色值或圆角——写死一个就少支持一种风格组合。

加一条新轴上的新值，**三处缺一不可**：`theme.css`、`src-tauri/src/settings.rs`
的枚举、本节。

### 3.3 轴三（文档主题）怎么落的

⚠️ 轴三的那几段 CSS **在 `src/styles/app.css` 末尾**（`/* ── 轴三：文档主题 ── */`，约 685 行起），
**不在 `theme.css`**——`theme.css` 只管前两条轴的变量，轴三要能选中 `.editor-mount` 里面。

```css
/* src/styles/app.css */
[data-doc-theme="github"] .editor-mount .ProseMirror { --doc-fg: …; --accent: …; }
[data-ui-mode="dark"][data-doc-theme="github"] .editor-mount .ProseMirror { … }
[data-doc-theme="newsprint"] .editor-mount .ProseMirror { --doc-fg: …; --font-doc: …; line-height: 1.9; }
```

三个观察点：

- 选择器**必须带 `.editor-mount` 前缀**——这是"只管正文"的实现方式；
- 明暗是**叠乘**进来的（`[data-ui-mode="dark"][data-doc-theme="github"]`），
  又一次印证 §3.2 那条"两条轴相乘"；
- 加一个主题 = 在 `app.css` 末尾加一段 + 往主题目录放一个 CSS
  （`settings.rs` 里说用户可以放 `.user.css` 覆盖，那部分还没实现）。
- 目前真实存在的具名主题只有两个：**`github`**（含暗色那一段）与 **`newsprint`**。

### 3.4 ⚠️ 三条轴目前只有设置项与 CSS，没有切换界面

- 设置**能存能读**：`settings.toml` 里的 `ui_style` / `ui_mode` / `document_theme`、
  命令 `nota_settings_get` / `nota_settings_set` 都是通的；
- 但**前端从未调过 `api.settings.set`**（全仓只有 `api.settings.get` 一处调用），
  界面上也**没有任何设置面板**、没有菜单、没有快捷键；
- 所以想换外观只能手改 `~/.config/nota/settings.toml` 再重启。

实现排在后面的轮次：`docs/07` **第 11 项**（三条外观轴的切换界面 + 文档主题目录），
它依赖 **第 10 项**（设置对话框）——两者做完之前，本节描述的一切都只能靠改 TOML 生效。

⚠️ `docs/10` §7 把"文档主题"那格填成"一份文档主题的 CSS 都没有"，与 §3.3 **不符**：
`app.css` 末尾已经有 `github`（含暗色）与 `newsprint` 两段。见 §7。

---

## 4. 快捷键表

**全部快捷键都绑在同一个 effect 里**：`src/App.tsx` 的
`useEffect(() => { … window.addEventListener("keydown", onKey) … }, [activeId, saveDoc, newDoc, openViaDialog, closeDoc])`。

`onKey` 的前两行决定了整张表的形状：`const mod = e.ctrlKey || e.metaKey; if (!mod) return;`
——**只认 Ctrl（或 macOS 的 Cmd）**，没有单独的 F 键、Alt 组合，也不处理没有修饰键的键。
命中后一律 `e.preventDefault()`。

| 快捷键 | 分支条件 | 动作 | 当前状态 |
|---|---|---|---|
| `Ctrl+S` | `key === "s" && activeId !== null` | `saveDoc(activeId, e.shiftKey)` → 有路径就存，没有就弹「保存为」 | ✅ |
| `Ctrl+Shift+S` | 同上（`e.shiftKey` 为真） | `saveDoc(activeId, true)` → **强制**弹「保存为」 | ✅ |
| `Ctrl+N` | `key === "n"` | `newDoc()` | ✅ |
| `Ctrl+O` | `key === "o"` | `openViaDialog()` | ✅ |
| `Ctrl+W` | `key === "w" && activeId !== null` | `closeDoc(activeId)`（走未保存确认） | ✅ |

⚠️ 这几条**与焦点无关**：`Ctrl+N` / `Ctrl+O` 没有 `activeId` 条件，所以在输入框里
（将来有设置面板时）也会被吞掉。

⚠️ **没有绑的**（对标 Typora 时有用的那批）：

| 键 | Typora 里是 | Nota 现状 |
|---|---|---|
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | 撤销 / 重做 | 没有显式绑定——**撤销走 ProseMirror 的 `history` 插件自己的键盘处理**，不经过 `App.tsx` |
| `Ctrl+Shift+1/2/3` | 切侧栏的文件树 / 文档列表 / 大纲 | 没绑（且没有"文档列表"页） |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | 粗体 / 斜体 / 链接 | 没绑；**富文本工具栏也还没有**（`docs/10` 矩阵里是 ⬜） |
| `Ctrl+/` | 斜杠菜单 | 没绑，编辑器也**刻意没装 slash 插件**（见 `docs/05`） |
| `Ctrl+P` | 快速打开 | 没绑 |
| `Ctrl+,` | 设置 | 没绑（没有设置界面） |

⚠️ 这个 effect 的依赖数组里列了 `saveDoc` / `newDoc` / `openViaDialog` / `closeDoc`
四个回调，而它们各自又依赖 `docs` / `settings` / `activeId`——所以**文档列表一变，
监听器就重装一次**。功能上是对的（新闭包看到新的 `docs`），只是别把它当成"只装一次"。

---

## 5. 状态存在哪（改界面之前先看这张表）

`App.tsx` 是**唯一**的状态编排处，界面里所有 `useState` 都在这一个组件（除了
`Sidebar` 自己那个"当前是哪一页"的 `tab`）：

| 状态 | 类型 | 谁改它 |
|---|---|---|
| `docs` | `Document[]` | `refreshDocs()`（`api.doc.list()`）：启动、新建、打开、保存、关闭、**以及编辑器去抖同步之后** |
| `activeId` | `DocId \| null` | 新建/打开/关闭，以及点标签（`setActiveId` 直接传给了 `TabBar`） |
| `settings` | `Settings \| null` | 只在启动时读一次 `api.settings.get()`——**之后再没刷新过** |
| `workspace` | `string \| null` | 启动读一次 + 打开文件夹 |
| `tree` | `TreeNode[]` | `refreshTree()`，随 `workspace` 变 |
| `plugins` | `PluginInfo[]` | 只在启动时读一次 `api.plugin.list()`。**插件清单**（名称/版本/能力/报错） |
| `panels` | `PluginPanel[]` | 只在启动时读一次 `api.plugin.panels()`。**插件声明的面板**，与 `plugins` 是两个来源，但同一个 `Promise.all` 里一起拉 |
| `toasts` | `Toast[]` | `toast()` 加、定时器或用户点 × 减 |
| `dockOpen` | `boolean`（默认 `true`） | 工具条的「插件」开关、右栏的 ×。⚠️ **只在内存里，没进 `settings`**——它和左栏选哪一页一样是「看的时候的状态」，不是文档属性。刷新即复位 |
| `editorRef` | `useRef<EditorPaneHandle>` | 命令式通道：`getMarkdown()`（存盘前强制同步）、`setMarkdown()`（插件改了文档） |

⚠️ `settings` 与 `plugins` 都**只在启动时取一次**：将来做设置面板时，改完必须
`setSettings(...)` 把新的那份放回 state（否则 `applyTheme` 不会重跑）。

---

## 6. 与 `api.*` 的对账（哪些命令前端还没用上）

`src/bridge/ipc.ts` 导出的全部命令里，**从未被调用过的**有下面这些。
它们不是死代码——是后端已经做好、前端还没接线的口子：

| 命令 | 谁会用到它 |
|---|---|
| `api.doc.setActive` | 点标签时应当调（见 §2.4 的 ⚠️） |
| `api.doc.get` | 单取一份文档的最新状态（而不是拉整张表） |
| `api.doc.reload` | "磁盘上的文件被外部改了，重读" / "放弃修改" |
| `api.doc.hasUnsaved` | 退出前决定要不要拦一下 |
| `api.workspace.close` | 关掉工作区（只清围栏，**不关文档**） |
| `api.settings.set` | 设置面板（§3.4） |
| `api.plugin.setEnabled` | 插件页的启用/禁用开关（§2.2） |
| `api.plugin.call` | 点了插件菜单项之后真正跑那条命令 |
| `api.plugin.findCommand` | 同上，用来对账"这个命令是哪个插件的" |

这几条命令里，`api.plugin.call` **今天仍然没有调用者**——它要等菜单栏
（`docs/07` 第 40 项）；`api.plugin.panels()` 已经接上了（`App.tsx` 启动时拉一次）。

⚠️ **插件声明的面板与菜单不走事件，走上面这两条命令拉**（BUG-13，2026-09-22）。
曾经它们是 `events.pluginPanel` / `events.pluginMenu` 两条事件，而 `App.tsx` 里
**没有监听者**——关键不是"忘了写订阅"，而是**订阅了也没用**：注册在插件加载时、
订阅在挂载之后，时序上必漏，且 Tauri 对没有监听者的频道 `emit` 是**静默成功**的。
⚠️ **第 16 项已作废**（那个"记账 + 重放"的设计是错的，不是没做完）。
**第 17 项仍然开着**，但它不是同一个根：那讲的是**数据类**事件没人消费
（`plugin:<id>:<name>` 这条通道对发生类数据是正解，缺的只是订阅端）。

`docs/07` §3 里与上表直接相关的还有：**第 2 项**（工具栏的格式化按钮）、
**第 3 项**（插入菜单）、**第 10 项**（设置对话框——`api.settings.set` 与
`api.plugin.setEnabled` 都等它）、**第 18 项**（插件启用/禁用开关，依赖第 10 项）、
**第 20 项**（自动保存接上 `autosave_seconds`）、**第 26 项**（「放弃修改并重载」入口，
对应 `api.doc.reload`，后端 `nota_doc_reload` 已经就绪）。

---

## 7. ✅ 与 `07` / `10` 的四处不一致（**已全部结清，2026-09-22**）

`docs/09` §1 第 1 条：**文档与代码打架时以代码为准**，同一批改文档，并记入 `docs/07` §4
的漂移登记表。本文写作时**代码与那两份文档对不上**的四处，已由 `docs/07`/`docs/10`/
`AGENTS.md` 的持有者当批改掉。**下表保留原样，只把"该改哪"换成"实际怎么改的"**——
它记录了"这四处的共同成因"，比记录"改完了"有用。

| # | 当时文档怎么说 | 代码是什么 | 实际怎么改的 |
|---|---|---|---|
| 1 | `docs/07` 第 25 项："文件树点击打开文件……现在树只读，点了不开"；`docs/10` §2 同行："树能列出来，但**点文件不会打开**" | `Sidebar.tsx::TreeNodeRow`（第 130 行）的文件分支有 `onClick={() => onOpenFile(…)}`，一路接到 `App.tsx::openPath()` → `api.doc.open()`，**点了就开** | `docs/07` 第 25 项**保留编号**、结清并写明"本条原是我按印象写错的"；`docs/10` §2 那格改成 ⚠️ **仍是 🟡 而不是 ✅**——按 `10` 自己的规矩，✅ 要求"有人在界面上点过"，而本轮只核了接线、没人实测点过 |
| 2 | `AGENTS.md` §2 与 `docs/10` §4："字数统计……**六项**（字符 / 词 / 行 / 阅读分钟）" | `StatusBar.tsx` 只渲染**四项**：`{words} 词`、`{characters} 字符`、`{lines} 行`、`约 N 分钟` | 两处都改成**四项**（`docs/10` 那格连自己列的清单都只有四项——**清单是对的，数字是错的**，典型的没数就写） |
| 3 | `docs/10` §7："文档主题（只管正文）⬜ —— 一份文档主题的 CSS 都没有" | `src/styles/app.css` 第 690/700 行已有 `github`（含 `data-ui-mode="dark"` 那个变体）与 `newsprint` 两个主题 | `docs/10` §7 那格改 **🟡**（有两个主题，但没有主题目录、没有切换界面、没人看过渲染效果），§1 计数已重算 |
| 4 | `docs/07` BUG-3 与 `plugin/mod.rs` 的注释/错误信息："`.` **与 `_`** 在事件名里都写作 `-`" | `channel_id()` 第 258 行：**`_` 原样保留**（它本来就在 Tauri 事件名的允许集合里），只有 `.` 等不合法字符换 `-`。有用例钉着：`channel_id("a_b-c") == "a_b-c"` | **三处**都改成只提 `.`：`plugin/mod.rs` 的注释与错误信息、`manifest.rs` 的 `channel_id()` 文档注释（第 245–255 行）、`docs/07` BUG-3。同时补上"`nota_git` 与 `nota-git` **不撞**" |

另有一处小疵也已改：`docs/10` §2 的"打开最近的文件"那格原本写"见 §3 第 9 项"，
指的是**本文档自己的** §3（那是"编辑与格式化"），实际要引的是 **`docs/07` §3 第 9 项**。

> ⚠️ **这四处的共同成因值得记住**：它们**全部是"按先入判断填的"**，没有一处是"忘了更新"。
> 三处把"其实能做"写成"没做"，一处把允许字符集记宽了。
> 所以 `docs/10` §10 第 3 条那条规矩要**双向**执行：
> 填 ✅ 之前先点一下；**填 ⬜/🟡 之前先 `grep` 一下**。
> 而核对的手段必须看**上下文几行**，不能只看 `grep` 命中的那一行——
> 这一轮已经有人（我）在这上面栽过一次，详见 `docs/07` §4 的第一条漂移记录。
