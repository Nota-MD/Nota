# 04 — 界面地图：控件树、逐控件回调与外观

> 最后同步：2026-09-24

本文按 `src/App.tsx` 的 JSX 结构逐层展开界面，再把每个可交互控件对上它的回调、
最终走到的 `api.*`（或哪个快捷键），以及**当前是真的能用还是空壳**。

⚠️ **不要假设某个按钮能用**：本文的"状态"列与 `docs/07-feature-status.md` 是同一份
判断的两个视角；两者不一致时以 `docs/07` 为准（它带排期），但**以代码为最终事实**。

界面层没有原生控件树（这是与 Folio 最大的差别）：整个界面是 WebView 里的 HTML/CSS，
样式在 `src/styles/app.css`（**左侧栏那两棵树在 `src/styles/sidebar.css`**，
**右侧插件栏与面板内容块在 `src/styles/dock.css`**），
全部颜色与尺寸走 `src/styles/theme.css` 的变量。

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

缩进表示 DOM 嵌套。带 `() 组件`的是独立文件里的 React 组件。
⚠️ 2026-09-23 起 `App.tsx` **不再内联任何组件**（`TopBar` / `TabBar` 拆去了同名文件，见 `02`），
所以这张树里不会再出现「内联」两个字。

```text
ErrorBoundary                       (ui/ErrorBoundary.tsx)  兜住渲染期崩溃
└─ div.app
   ├─ TopBar                        (TopBar.tsx)    <header class="toolbar">
   │  ├─ span.toolbar-brand          文案「Nota」
   │  ├─ MenuBar                    (ui/MenuBar.tsx)  <div class="menubar" role="menubar">
   │  │  ├─ div.menu-root           每栏一个
   │  │  │  ├─ button.menu-title     「文件」「编辑」「段落」「格式」「视图」「主题」「插件」「帮助」
   │  │  │  │                        ⚠️「插件」那一栏**是插件的**（2026-09-24）：一条插件菜单都没有
   │  │  │  │                        时它整栏不存在，插在「帮助」之前，见 §2.1b
   │  │  │  │                        ⚠️ 展开时加 `.menu-title-open`；同时只开一栏
   │  │  │  └─ div.menu-popup        该栏展开时的弹层（`role="menu"`）
   │  │  │     ├─ button.menu-item   label + 可选 `span.menu-accel`（快捷键提示）
   │  │  │     │                     ⚠️ 灰不灰由 `disabled` 推（来自 App 的 `menuHandlers`），
   │  │  │     │                     勾没勾由 `checked` 推（`menuChecks` / `themeChecks`），
   │  │  │     │                     **没有第三个标志位**；危险项加 `.menu-item-danger` 画红
   │  │  │     ├─ span.menu-check    可勾项的勾形；不可勾项留一个等宽空位（防文字跳动）
   │  │  │     ├─ span.menu-arrow   右侧的 ▸；**没有子菜单的项也占这个宽度**（对齐用）
   │  │  │     └─ div.menu-sep       role="separator"
   │  │  │        ↳ 有子菜单的项外面套一层 div.menu-item-root，展开时加 `.menu-item-open`，
   │  │  │          并在该项右边 portal 出一个 div.menu-sub
   │  │  │          ⚠️ **只支持一层子菜单**（`SubMenu` 自己不认 `submenu`）。
   │  │  │          VMark/Typora 最深也是一层；要加第二层先读 `MenuPopup.tsx` 的文件头
   │  └─ button.btn.toolbar-dock-toggle  「插件」     aria-pressed = dockOpen
   │                                   ⚠️ 靠 `margin-left: auto` 推到最右，没加 spacer 元素
   │
   ├─ div.app-body
   │  ├─ Sidebar                    (ui/Sidebar.tsx)  <aside class="sidebar">
   │  │  ├─ div.sidebar-head
   │  │  │  ├─ nav.sidebar-tabs      role="tablist"
   │  │  │  │  ├─ TabButton          「文件」
   │  │  │  │  └─ TabButton          「大纲」
   │  │  │  └─ button.sidebar-close  「×」 title="收起侧边栏"（2026-09-24 补）
   │  │  │                           ⚠️ 在 tablist **外面**——塞进去读屏会把它念成一个页签
   │  │  └─ div.sidebar-body
   │  │     ├─ [tab=tree] FileTree
   │  │     │  ├─ div.sidebar-empty  「还没打开文件夹。…」＋ button.btn「打开文件夹…」
   │  │     │  ├─ p.sidebar-empty    「这个文件夹里没有 Markdown 文件。」
   │  │     │  └─ ul.tree → TreeRow
   │  │     │     ├─ li.tree-dir  > button.tree-dir-btn   目录名（**可点：展开/收起**，
   │  │     │     │                                       前面 span.tree-twisty 转 90°）
   │  │     │     └─ li.tree-file > button.tree-file-btn  文件名（可点，title 是绝对路径）
   │  │     └─ [tab=outline] ul.outline → li.outline-row
   │  │        ├─ button.outline-twisty  「▸」折叠三角（只有带子标题的行才有，其余留同宽占位）
   │  │        ├─ span.outline-item     标题文本（**纯文本，不可点**）
   │  │        └─ span.outline-folded-count  折起来的条数
   │  │        └─ p.sidebar-empty    「这份文档还没有标题。」
   │  │
   │  ├─ main.app-main
   │     ├─ FindBar                 (ui/FindBar.tsx)  仅 `findOpen` 时渲染
   │     │  │                       ⚠️ 带 `key={activeDoc.id}`：换文档 = 换条子（查询跟着清）
   │     │  └─ div.find-bar[role=search]  > div.find-row × 2
   │     │     ├─ input.find-input    「查找」/「替换为」
   │     │     ├─ span.find-count     「N / M」或「无结果」（空查询时不画）
   │     │     ├─ button.find-toggle  「Aa」「全词」「.*」，data-on 表示按下
   │     │     ├─ button.find-btn     「↑」「↓」「✕」
   │     │     └─ button.find-btn-wide 「替换」「全部替换」
   │     │
   │     ├─ FormatBar                (ui/FormatBar.tsx)  仅 `formatBarOpen` 时渲染
   │     │  └─ div.format-bar → button.fmt-btn  × N
   │     │     ⚠️ 高亮（data-on）只在所见即所得下有意义；源码模式下整条不画高亮
   │     │
   │     ├─ EditorPane              (ui/EditorPane.tsx)   有活动文档时
   │     │  │                       ⚠️ 外壳是 div.editor-pane-<mode>，三种模式摆的格子不同
   │     │  ├─ div.editor-loading    「正在准备编辑器…」（ready=false 时才有）
   │     │  ├─ div.editor-mount      **React 永不往里渲染**，Milkdown 或 CodeMirror 独占
   │     │  │                        （内联 --content-width = 设置的正文宽度）
   │     │  │                        wysiwyg → Milkdown ／ source、split → CodeMirror
   │     │  └─ div.editor-mount.editor-preview   **只有 split 才有**，只读的 Milkdown
   │     │                            ⚠️ 不给 --content-width（那一半本来就窄）；aria-readonly
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
   │  │  ├─ span.dock-title           活动页的标题（面板的 `title`，或「插件」）
   │  │  └─ button.dock-close         「×」，title「收起插件栏」
   │  ├─ nav.dock-tabs                (role=tablist) ⚠️ **2026-09-24 新增**：一页签一个插件
   │  │  ├─ button.dock-tab[role=tab]      每个 `location === "right"` 的面板一个，
   │  │  │                                  `data-active` / `aria-selected` 标当前页，
   │  │  │                                  title「由插件 <id> 提供」
   │  │  └─ button.dock-tab.dock-tab-plugins  「插件」（页签排在最右，斜体）→ 插件清单页
   │  └─ div.dock-body                ⚠️ **一次只画一页**（用户要求"两个拓展不能同时占用"）
   │     ├─ section.dock-panels        (当前页是某个插件面板时)
   │     │  └─ article.panel           ⚠️ `key` = `<插件>/<面板 id>`：换页时整棵子树换掉，
   │     │     │                          `input` 块里的草稿不会跟着跑到另一页去
   │     │     └─ div.panel-body       ⚠️ 四态：p.panel-pending「正在读取…」（仅第一次）／
   │     │        │                    p.panel-error（插件的 `render` 抛错，红字，role=alert）／
   │     │        │                    p.panel-empty「插件没有给出内容。」／
   │     │        └─ PanelBody        (ui/PanelBody.tsx) **十种**内容块（2026-09-24）：
   │     │           ├─ h4.panel-heading          heading
   │     │           ├─ p.panel-text.tone-*       text
   │     │           ├─ dl.panel-fields → div.panel-field > dt / dd.tone-*
   │     │           ├─ ul.panel-list → li.panel-item.tone-*
   │     │           │   └─ div.panel-item-main > span.panel-item-title / span.panel-item-badge
   │     │           │      + div.panel-item-sub
   │     │           ├─ div.panel-buttons → button.btn.panel-btn（+ btn-primary / btn-danger）
   │     │           │   ⚠️ 没写 `command` 的按钮画成灰的（title 里写明为什么），**不消失**
   │     │           ├─ div.panel-msg.panel-msg-{user|ai}      message（谁说的决定靠左/靠右）
   │     │           │   └─ div.panel-msg-who + div.panel-msg-text（pre-wrap，保留换行）
   │     │           ├─ pre.panel-diff → span.panel-diff-line.panel-diff-{del|add}   diff
   │     │           │   ⚠️ `<pre>`：**行首空格保留**；`.panel-diff-line` 用悬挂缩进
   │     │           │      （`text-indent: -12px`）让折行的第二行对齐到内容、不顶到 `-` 号
   │     │           ├─ div.panel-input → textarea/input.panel-input-box + div.panel-input-foot
   │     │           │   └─ button.btn.btn-primary.panel-input-send ＋ span.panel-input-hint  input
   │     │           │   ⚠️ 多行框：回车换行、**Ctrl/Cmd+Enter 发送**；单行框：回车发送
   │     │           ├─ p.panel-empty / hr.panel-sep
   │     │           └─ p.panel-unknown          认不出的 kind：**如实画一句「不认识」**
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
   ├─ TabBar                        (TabBar.tsx)    仅 docs.length > 0 时渲染
   │  └─ div.tabbar[role=tablist] → div.tab[role=tab]
   │     ├─ button.tab-label         （.tab-dot 小圆点 + 文档标题）
   │     └─ button.tab-close         「×」
   │
   ├─ (SlidevPanel)                 (ui/SlidevPanel.tsx)  仅 `slidev.gate` 非空时渲染
   │  └─ div.confirm-backdrop > div.confirm-dialog.slidev-panel
   │     ├─ h2.confirm-title          「Slidev 预览」
   │     ├─ div.slidev-status → span.slidev-mark（✓/!/?/转圈）+ p.slidev-message
   │     ├─ pre.slidev-detail         后端给的原文（npm 的 ENOTCACHED 之类），空则不画
   │     ├─ dl.slidev-facts           命令 / 目录（`probe.command === ""` 时整块不画）
   │     └─ div.confirm-actions
   │        ├─ div.slidev-side         「重新检测」＋（仅 missing）「仍然打开预览」
   │        ├─ button.btn              「取消」
   │        └─ button.btn.btn-primary  主按钮（四态不同，见 §2.6c）
   │
   ├─ (SettingsDialog)              (ui/settings/SettingsDialog.tsx)  仅 `settingsOpen`
   ├─ (ConfirmDialog)               (ui/ConfirmDialog.tsx)  仅 `confirmReq` 非空
   │  └─ div.confirm-backdrop > div.confirm-dialog
   │     ├─ h2.confirm-title / p.confirm-message
   │     └─ div.confirm-actions → button.btn「取消」+ button.btn.btn-primary
   │
   ├─ (PromptDialog)                (ui/PromptDialog.tsx)  仅 `promptReq` 非空（2026-09-24）
   │  └─ div.confirm-backdrop > div.confirm-dialog.prompt-dialog
   │     ├─ h2.confirm-title / label.prompt-label × 1~2（第二个只在给了 secondLabel 时）
   │     ├─ input.prompt-input × 1~2   ⚠️ **挂载即聚焦**；Enter = 确定，Esc = 取消
   │     │                             ⚠️ `secret` 时主输入框是 `type="password"`（**只遮屏幕**）
   │     │                             ⚠️ 插件面板/菜单项的 `prompt` 走的也是这个框
   │     ├─ p.prompt-hint              （有 hint 才画）
   │     └─ div.confirm-actions → button.btn「取消」+ button.btn.btn-primary
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

### 2.1 顶栏（`TopBar`）与菜单栏

⚠️ **2026-09-23 起顶栏只剩三样东西**：品牌字、菜单栏、最右那个「插件」开关。
原来的四个按钮（新建/打开/打开文件夹/保存）**全删了**——它们现在都在「文件」菜单里，
一个入口只有一个地方，不给两处各留一份（两份必然有一份先腐坏）。

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 品牌 | `Nota` | 无 | 纯文本 |
| 菜单栏 | 七栏 | 见 §2.1b | ✅ 画出来了、能开关 |
| 按钮（最右） | 插件 | `setDockOpen(v => !v)`——**纯前端，不走后端** | ✅ 实测过：开→关，正文区宽度跟着补上。⚠️ 状态**不持久化**，重启回到默认（**关**，见 §2.5 那两条 `boolean` 的默认值）。`title` 跟着状态换「收起插件栏」/「展开插件栏」 |

### 2.1b 菜单栏（`ui/MenuBar.tsx` + `ui/commands.ts`）

**骨架是静态的、状态是推出来的。** 逐栏逐项列在 `src/ui/commands.ts` 的 `MENUS`
（抄自 `docs/10` §11.1），**但那里一个 `disabled` 标志位都没有**。判据是：

```
App.tsx 的 menuHandlers 里有没有这个 id ──有──> 能点
                                        ──没有─> 灰
```

这条规矩的理由写在 `commands.ts` 文件头：**手写的标志位一定会腐坏**
（加实现忘了翻标志、翻了标志实现早删了，两种都不报错，只让界面撒谎）。
用"有没有处理函数"当判据则**不可能不一致**：界面永远不会声称一个它做不到的能力。

**内置能点的就是 `menuHandlers` 那 60 条，一条不多**（数出来的，不是看菜单拍的）。
📌 **2026-09-24 起还要加上插件声明的那几条**（`ui/pluginMenus.ts` 合成的
`__plugin:<插件>:<命令>`，见下面那一栏）：

| 栏 | 能点的 id |
|---|---|
| 文件 | `file.new` · `file.open` · `file.openFolder` · `file.reload` · `file.save` · `file.saveAs` · `file.close` · `file.preferences` · **`file.exportHtmlPlain` · `file.exportHtmlStyled` · `file.print`**（2026-09-24） |
| 编辑 | `edit.undo` · `edit.redo` · `edit.copyAsMarkdown` · **`edit.findReplace`**（2026-09-24） |
| 段落 | `para.h1`…`para.h6` · `para.text` · `para.table` · `para.codeBlock` · `para.quote` · `para.ol` · `para.ul` · `para.task` · `para.hr` · **表格十条**（`para.tableRowAbove`…`para.tableAlignRight`，2026-09-24） |
| 格式 | `fmt.bold` · `fmt.italic` · `fmt.code` · `fmt.strike` · **`fmt.link` · `fmt.image` · `fmt.clear`**（2026-09-24） |
| 视图 | `view.toggleSidebar` · `view.outline` · `view.fileTree` · `view.toggleDock` · **`view.formatBar`** · `view.statusBar` · **`view.focusMode` · `view.typewriter`** · `view.slidev` · `view.fullscreen` · `view.modeWysiwyg` · `view.modeSource` · `view.modeSplit` |
| 主题 | **动态**，不经 `menuHandlers`：**文档主题**（内置六套 + 用户目录里的）+ 「无主题（内置）」+ 「打开主题文件夹…」 |
| **插件** | **动态**（2026-09-24）：插件声明的菜单项，id 是合成的 `__plugin:<插件>:<命令>`。⚠️ **一条插件菜单都没有时这一栏根本不存在**（不出现一栏空的「插件」） |
| 帮助 | `help.about` |

#### 「插件」那一栏（2026-09-24，`docs/07` 第 42 项）

位置**固定在「帮助」前面**：最后一栏是"关于这个应用"，按惯例待在末尾。
（找不到「帮助」时接在最后——**不静默丢掉**，一栏菜单凭空消失比位置不对难查得多。）

⚠️ **为什么不往已有的几栏里插**：`register_menu` 收一个 `menu` 字段，
但**目前只有 `plugins` 是认的**。往「文件」里插两条第三方条目这件事一旦做出来，
用户就分不清哪些项是 Nota 自己的、哪些是插件塞进来的——出问题时连"该去找谁"都不知道。
⚠️ 写别的 `menu` 值的条目**不静默丢掉**：照样出现在这一栏里，标签后面写明
「（想挂到「X」栏，暂不支持）」，而且是**灰的**。

⚠️ **快捷键的撞车判据是先到先得**（`accel.ts::buildAccelIndex`），
而插件这一栏拼在**所有内置栏之后**，所以**内置的快捷键永远赢**。
撞车时 `console.warn` 一声，不报错、不崩——`docs/13` §8.3。

⚠️ **插件的菜单项和内置项走的是同一条链**（`resolvePick` → `menuHandlers[id]`），
**没有为插件单开一条分支**。所以"灰不灰"的判据对两边是同一条：
`menuHandlers` 里有没有这个 id。

⚠️ **插件菜单项的「点之前先问一句」与面板按钮共用一份实现**
（`ui/plugin-prompt.ts::问参数`）：用户取消 ⇒ **命令根本不调**，
不是"调一个空参数"（那会让 git 收到一条空提交信息）。见 §2.6d。

⚠️ **「剪切/复制/粘贴/全选」不在这张表里**：它们交给 WebView 原生处理，
自己接一遍只会把系统剪贴板的行为做坏。

⚠️ **同栏里 PDF / Word / ODT / LaTeX / Epub / 图片六项还是灰的**，`menuHandlers`
里没有键——**不是漏了，是这一批没做**（生成 PDF 要一套排版引擎，其余几项要 Pandoc）。
⚠️ 打印那条**不是"在应用里打印"**：它是"导出含样式的那份 + 交给系统默认程序打开"，
提示里把两步都说清楚了。见 §6 与 `docs/10` §3。

⚠️ **`fmt.link` / `fmt.clear` 与表格那十条在源码模式下给的是"没反应"**
（`runCommand` 返回 `false`）：CodeMirror 那边没有文档树，这些做不出来，
`App.tsx` 会 toast 一句「当前编辑模式下还没有这个操作」而不是静默什么都不做。
**"灰"和"点了没用"是两回事**：前者是"这个功能没做"，后者是
"这个功能在另一条通路上做不出来"——菜单项在两种模式下都是亮的，
因为它在**至少一条**通路上能用。
⚠️ `disabledCommands` 还多一条判据：条目标了 `needsDoc` 而当前没有活动文档时**也灰**。
⚠️ 还有**第三条判据**（2026-09-24 加，在 `ui/useMenus.ts` 的 `光标条件` 表里）：
"这一刻光标在不在合适的位置"——表格那十条要求 `commandState.inTable`，
`fmt.clear` 要求 `hasSelection`。⚠️ 它**只在 `commandState !== null` 时生效**
（源码模式读不出光标状态，拿一个猜的值去灰菜单比不灰更糟）。

✅ **快捷键表就是这张表的 `accel` 那一列**（2026-09-23 起）：`ui/accel.ts` 的
`buildAccelIndex(MENUS)` 把它遍历成一张 `键位签名 → 命令 id` 的表，`App.tsx`
的 `keydown` 只负责查表。**没有第二张表了**——这就是 §4 整段重写的原因。

⚠️ **「主题」是唯一动态的一栏**（`MenuSpec.dynamic === "themes"`）：条目来自
`nota_doc_themes()`，用户往主题目录里丢了什么就有什么，抄不进静态表。
**这一栏装的全是文档主题，没有一条能改外壳**——用户 2026-09-23 划的线，
详见 §3.3。用户覆盖过的内置主题，名字后面标「（已自定义）」。

⚠️ **关弹层用 `mousedown` 不是 `click`**：`click` 要等鼠标抬起，中间那段时间
弹层还开着，看起来像"点了一下没关掉"。这条与 `ConfirmDialog` 同源。

✅ **`accel` 既是提示也是真绑定**（2026-09-23 起）。上面这句曾经是真的，
现在反过来了：`accel` 是唯一真源，`App.tsx` 照着它派发。写错 `accel` 的
症状因此变成——**菜单上显示的那个键不灵，而另一个键开始干这件事**。
这就是要它在构建时告警的原因（重复键位、muda 认不出的写法都 `console.warn`）。

### 2.1c 原生菜单（macOS 兜底）—— 2026-09-23 起

**两套菜单是用户 2026-09-23 拍的板**：「自绘为主，加原生菜单兜底」。
上面的 `MenuBar` 是自绘的那套；`src-tauri/src/native_menu.rs` 是原生那套。

```text
MENUS (唯一真源，和上面同一份)
  └─ buildNativeTree(MENUS, disabled, checks, themes, currentTheme)   ui/nativeMenu.ts
       └─ api.nativeMenu.apply(nodes) → nota_native_menu_apply        bridge/ipc.ts
            └─ native_menu.rs::apply() → AppHandle::set_menu
                 └─ 点了 → on_menu_event → emit("nota:native-menu", id)
                      → App.tsx 订阅 → resolvePick(id) → menuHandlers[id]
```

⚠️ **`apply()` 在不支持的平台上返回 `Ok(false)`，不是报错**。前端拿这个返回值
决定要不要隐藏自绘菜单栏（`TopBar` 的 `hideMenuBar`）——**只有后端说真挂上了
才隐藏**。所以 macOS 上万一挂失败，退化到自绘菜单，而不是"一个菜单都没有"。

⚠️ **代码用 `cfg!` 不用 `#[cfg]`**，所以这份代码在 Linux 上也照样过类型检查。
不这么写的话，macOS 专属的代码在开发机上**从来没被编译过**——
等到打包那天一次性爆一堆错。

⚠️ **灰掉的菜单项一律不带快捷键**（`leaf_accel()` 对禁用项返回 `None`）。
这不是省事：**AppKit 连禁用的项也参与快捷键匹配**，一个灰着的 `⌘C` 会
把系统复制吃掉，灰着的 `⌥↑/⌥↓` 会把段落导航吃掉。这条踩过。

⚠️ **原生菜单的 id 与自绘菜单是同一套字符串**（`file.save` 这种），
所以 `resolvePick(id)` 两边通用——**别给原生那套另起一套 id**。

### 2.2 侧栏（`Sidebar`）

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 收起 | 「×」`title="收起侧边栏"` | `onClose()` → `App.tsx` 的 `setSidebarOpen(false)` | ✅ 2026-09-24 补。⚠️ **只收不切**；与「视图 → 显示/隐藏侧边栏」、`Ctrl+Shift+L` 共用 `sidebarOpen` 一份状态 |
| 标签页 | 文件 | `setTab("tree")`（**只改本地 state**，不走后端） | ✅ 默认页 |
| 标签页 | 大纲 | `setTab("outline")` | ✅ 能用（内容只读） |
| 文件树·文件 | 文件名 | `onOpenFile(`${workspace}/${node.path}`)` → `openPath()` → `api.doc.open()` | ✅ **能点开**（`Sidebar.tsx` 的 `TreeNodeRow` 有 `onClick`）；`title` 显示拼出来的绝对路径。⚠️ `docs/07` 第 25 项与 `docs/10` §2 的"文件树"一行都写着"点了不开/只读展示"，**与代码不符**，见 §7 |
| 文件树·目录 | 目录名 | `onToggleDir(path)`，第一次展开时 `loadDir()` → `api.workspace.tree(dir, 1)` | ✅ **可展开**（2026-09-24 起：按需取那一层，取回来的子节点缓存在 `FileTree` 的本地 state 里，不回写 App 那棵树）。⚠️ 读不了就在那一行下面写红字（`.tree-error`），**不静默成"空目录"** |
| 文件树·空态 | 「还没打开文件夹。…」＋「打开文件夹…」 | 按钮 → `onOpenFolder()` → 与「文件 → 打开文件夹…」同一个 `openFolder()` | ✅ 2026-09-24 补。**在那之前这一段只有一句话、没有任何可点的东西**——界面让人去打开文件夹，路却只在菜单里 |
| 文件树·空态 | 「这个文件夹里没有 Markdown 文件。」 | 无 | ✅ |
| 大纲·条目 | 「▸」折叠三角 | `toggle(item.line)`（**只改本地 state**） | ✅ 2026-09-24。折的是"比它深的标题"，`aria-expanded` 跟着走；折着时右边显示里面有几条 |
| 大纲·条目 | 标题文本 | 无 | ⚠️ **未接线**：`OutlineItem.line`（正文里的 0 起行号）**已经算好了**，就是为了将来"点了跳过去"用；点击跳转还没做（`docs/07` 第 48 项）。所以 `.outline-item` 的 CSS 有 `:hover` 背景，鼠标移上去像能点，实际不响应 |
| 大纲·空态 | 「这份文档还没有标题。」 | 无 | ✅ |

⚠️ **「插件」那一页 2026-09-22 从这一栏搬到了右边**（`PluginDock`，见 §2.2b）。
理由不是"顺手挪个位置"：**左侧是文档导航、右侧是工具面**，两者的**使用节奏不同**——
导航是写东西时一直要看的，工具面板是偶尔开一下的。用户同日拍的板，见 `docs/10` §5。

### 2.2b 右侧插件栏（`PluginDock`）

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标题 | 活动页的名字（面板的 `title`，或「插件」） | 无 | ✅ |
| 关闭 | 「×」 | `setDockOpen(false)`，**整个 `<aside>` 不再渲染** | ✅ 实测过 |
| **页签** | 每个右侧面板一个 ＋「插件」 | 点了 → 切页（**只画那一页**） | ✅ **2026-09-24 起（用户要求：一个拓展独占一页，两个不能同时开）** |
| 面板·内容 | 由插件的 `render` 决定（见下） | 按钮点下去 → `问参数` → `plugin.call` | ✅ **2026-09-24 起是真的内容**（`docs/07` 第 15 项结清）。📌 之前这里写的是「面板内容尚未接入。」一行字 |
| 面板·没有落脚处 | 面板名 + 它声明的 `location` | 无 | ⚠️ 只在有面板声明了 `right` 以外的位置时才出现，而且列在**「插件」那一页里**。**存在的意义是"声明了的东西不静默消失"** |
| 已装插件·每一项 | 名称 / 版本 / id / 描述 / 错误 / 能力 chip | 无 | ⚠️ **只读**：没有启用/禁用开关（`api.plugin.setEnabled` 前端从未调用），也没有"手动跑一下这个命令"的入口 |
| 已装插件·空态 | 「没有发现插件。」 | 无 | ✅ |

⚠️ **开关一旦做出来，禁用/启用之后要重拉 `plugin.panels()`**——
`PluginHost::生效的()` 按"加载成功且没被禁用"筛，禁用之后那家的面板该从清单里消失。

#### ⚠️ 一页一签：为什么不是"叠起来"（2026-09-24）

用户原话：「每一个拓展应该独占一个窗口……右侧每一个拓展专站一个面板，两个拓展面板
不能同时打开。」

改之前是**叠着画**（一栏里从上到下：Git 那一块、AI 那一块，共用一个滚动条）。
**那不是"样式没调好"，是两样东西共用一个滚动条这件事本身错**：面板会自己长高
（AI 那页一轮问答就是好几屏），叠起来的结果是两条内容互相把对方挤没，
用户想看的那个常常在屏幕外。

现在的规矩：

- **左上一排页签**（`.dock-tabs`），每个 `location === "right"` 的面板一个，
  外加一个「插件」页（已装插件清单＝诊断用）。**一次只渲染一页**；
- 页签**永远都在**，哪怕只有一个面板——它是"这里还有别的东西"的唯一线索，
  藏起来的话用户会以为这一栏就叫这个名字；
- ⚠️ **看不到的那几页不刷新**（只拉当前页）。切过去的一瞬间会现拉一次，
  慢接口下会闪一下「正在读取…」。这是**刻意的取舍**：后台一直拉所有页意味着
  用户不开的面板也在花时间（AI 那页的拉取相当于重跑一遍 `render`）。
  完整理由与代价写在 `PluginDock.tsx` 文件头。
- 页签**没有做持久化**（重开应用回到第一页）。

#### 面板内容：**十种内容块**

插件在 `register_panel` 里给一个 `render` 函数，宿主**现调现取**（每次打开都拉一次），
前端按白名单画。认得出的十种：

| `kind` | 画成什么 |
|---|---|
| `heading` | 一个小标题 |
| `text` | 一段话，`tone` 上色 |
| `fields` | 一行一个「标签 → 值」（`<dl>`） |
| `list` | 带标题 / 副标题 / 角标的一列 |
| `buttons` | 一排按钮。`style` 只认 `primary` / `danger` |
| `empty` | 一句「没内容」 |
| `separator` | 一条分隔线 |
| `message` | 一问一答里的一条（`from = user` 靠左 / `ai` 靠右，保留换行）——2026-09-24 |
| `diff` | 增删对照：`del` 红底带 `-`、`add` 绿底带 `+`——2026-09-24 |
| `input` | 输入框 ＋ 发送键（多行时回车换行、Ctrl+Enter 发送）——2026-09-24 |

⚠️ **认不出的 `kind` 如实画一句「不认识这种内容块（kind = …）」**，
不静默丢掉——那是**给插件作者看的线索**。同理，**没写 `command` 的按钮画成灰的**
而不是消失（"我这里少写了一根线"）。

⚠️ **`input` 是"面板里唯一的输入控件"，而它不是表单**：一次带一个值，
发出去＝调 `submit` 命令、参数 `{ [arg] = 输入 }`，**跟按钮零区别**（只是值来自输入框）。
要一个参数就用按钮上的 `prompt`（`docs/13` §8.3 / §8.5）；要用户在对话里说话，
用 `input` ＋ `message`（AI 面板就是这么搭的）。

⚠️ **`diff` 只画，不认识格式**：`nota-diff` 那份契约在宿主（`docs/13` §11），
前端这一块只管把 `op = "del"/"add"` 画成红绿两色。所以"点的按钮会把什么写进文档"
**是插件的事**，前端不参与。

⚠️ **面板里的字符串永远到不了 HTML**：每一块都是具名 JSX，插件给的字符串只出现在
子节点位置，属性只有我们自己写的字面量。**这里没有（也永远不该有）
`dangerouslySetInnerHTML`**，所以"插件往面板里塞 `<script>`"在结构上做不到。

⚠️ **面板内容各处的失败都要看得见**：`render` 抛错 → 面板里红字写着插件的错；
`render` 返回空 → 「插件没有给出内容。」（**空的不是错误**：没开文件夹、没有改动
就是没内容）；声明了却没有 `render` → 一句解释。**别把任何一种画成一片空白。**

#### 面板内容的**刷新**

插件在自己知道内容变了时喊 `nota.ui.refresh(id)` → 宿主发 `nota:plugin-panel`
→ `PluginDock` **重拉**。⚠️ 那条事件里**一个字节的内容都没有**，它只是个提示，
**丢了也不影响正确性**（面板还没打开时这一枪本来就没人收，而打开时一定会拉一次）。
**别把内容塞进事件**——那就回到了 BUG-13 的形状：两份真相源，漏一枪就静默分叉。

⚠️ 2026-09-24 起**只有当前那一页会重拉**：事件到了先看"是不是活动面板那一家的"，
不是就直接丢。别的插件那一页不拉——它没显示，拉了也没人看（切过去时本来就会拉）。

⚠️ 重拉时**保留旧内容**（不闪白）；连续两次刷新时**先发的后回来不会盖掉新的**
（`PluginDock` 里那个请求序号 ref 就是为这件事）。

✅ **插件自己声明的面板 2026-09-22 起进得来了。** 原先是后端把面板当事件发出去
（`nota:plugin-panel`）而前端一个订阅者都没有（BUG-13）；现在改成
**注册进插件的 Lua registry（`nota_panels`）+ 宿主按需拉**（`nota_plugin_panels`），
与 `nota_commands` 同一范式。开窗实测 Git 面板出现在栏顶。
⚠️ **别把它改回事件**：注册发生在**插件加载时**、前端订阅在**挂载之后**，直连必漏且漏得安静。

⚠️ **这一栏没有自己的快捷键**，三个入口都是"点"：顶栏那个开关、栏里的 ×、
菜单栏「视图 → 插件栏」（可勾项，勾选状态跟着 `dockOpen` 走）。

⚠️ **侧栏没有「文档列表」页**（Typora 的 Ctrl+Shift+1/2/3 里的第二页是最近打开的文档）。
`Sidebar.tsx` 的文件头注释里写明了：文档列表排在后面。
在 `docs/07` §3 的 backlog 里这是两项：**第 8 项**（列表 UI）依赖 **第 9 项**（最近文件的存取，
后端那半）——`Home.tsx` 引的也是第 9 项。**顺序不能反**：没有存取，列表就是个空壳。

✅ **侧栏两页 2026-09-23 起有快捷键了**：`Ctrl+Shift+1` 切大纲、
`Ctrl+Shift+3` 切文件树（都会顺手把侧栏打开）。**只剩中间那一页没有**——
`Ctrl+Shift+2`（文档列表）的键位在 `commands.ts` 里写着，但那一页本身还没做，
所以按不动，见 §4.2。右栏那个「插件」开关仍然只能点。

### 2.3 编辑区

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 加载提示 | 「正在准备编辑器…」 | 无（`ready === false` 时显示） | ✅ |
| 编辑器本体 | — | Milkdown 拥有那棵 DOM；文本变化走**去抖 300ms → `api.doc.sync()`** | ✅ 能用，链路见 `docs/05` |
| 任务项复选框 | 无文案（方框画在列表项的**左外侧装订线**里） | 点方框 → `editor/task-list.ts` 按几何命中 → `setNodeMarkup` 翻 `checked` | ✅ 能勾（2026-09-22 开窗实测）；装订线宽度走 `--task-check-gutter` |
| 代码块右下角那一条 | 「折叠」「复制」+ 语言下拉（首项「纯文本」） | 同一处的 NodeView（`editor/code-block.ts`）：复制走 `navigator.clipboard` 兜底 `execCommand`，**界面文案会在 1200ms 内变成「已复制」/「复制失败」**；折叠**只活在这个视图里、不写进文档** | ✅（2026-09-22 开窗实测）。⚠️ 那一条是 `opacity: 0` 的，**鼠标进代码块才亮**（Typora 也这么收着） |
| 装载后的认领 | 无文案 | `EditorPane` 在 `focus()` 之后调一次 `api.doc.settle(id, text)` | ✅ 修 BUG-12 的那一步，见 `docs/03` §4.2 |
| 查找高亮 | 无文案（命中底色 `--find-hit` / 当前命中 `--find-current`） | `editor/find.ts`（所见即所得）与 `source.ts`（源码）的**装饰**，两种模式都有；命令来自上方的 `FindBar` | ✅（2026-09-24），见 `docs/05` §4.3 |
| 压暗兄弟块 | 无文案（`opacity: .32`） | 专注模式，`editor/writing-modes.ts` 的**装饰**；不改文档、不进撤销栈 | ✅（2026-09-24），见 `docs/05` §4.4 |
| 当前行标记 | 无文案（源码模式下其余行压暗） | 打字机模式的 `Decoration.line`（源码那边只有**一颗**装饰） | ✅（2026-09-24） |
| 空态（`Home`） | 「新建文档」+「Ctrl+N」 | `onNew` → `newDoc()` | ✅ |
| 空态（`Home`） | 「打开文件」+「Ctrl+O」 | `onOpen` → `openViaDialog()` | ✅ |
| 空态（`Home`） | 「打开文件夹」+「把一整个目录当工作区」 | `onOpenFolder` → `openFolder()` | ✅ |
| 空态（`Home`） | 插件状态列表 + 失败计数 | 无 | ✅ 只读；失败**要显眼**是刻意的——静默失败会让人以为自己装错了 |

⚠️ `EditorPane` 由 `App.tsx` 用 `key={activeDoc.id}` 挂载：**换文档 = 整个组件重挂**。
这是刻意的（省得去写"把 A 文档的撤销栈换成 B 的"），见 `docs/05`。

### 2.4 标签栏（`TabBar`）

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标签题 | 文档标题（脏时前面有小圆点，`title="有未保存的改动"`） | `onSelect` → `setActiveId(id)`；⚠️ 后端那一侧的同步**不在这里**——`App.tsx` 有一个盯 `activeId` 的 effect 去调 `api.doc.setActive`（BUG-6 的修法就是那一段，见下） | ✅ 能用 |
| 关闭 | `×`（`title="关闭"`） | `closeDoc(id)`：`doc.dirty && settings.confirm_unsaved` → `askConfirm({title:"有未保存的改动", confirmLabel:"丢弃并关闭", danger:true})` → `api.doc.close()` → `refreshDocs()` → 活动切到列表最后一份 | ✅ 能用 |

⚠️ **「活动文档」是两处状态、靠一个 effect 对齐**：前端的 `activeId`
（决定画哪一份）与后端的 `active`（插件 `nota.document.*` 读的那份）。
点标签只改前者，所以 `App.tsx` 里有一段 `useEffect` 盯 `activeId` 去喊
`api.doc.setActive`——**放在 effect 而不是补在 `onSelect` 上**，是为了把
`open` / `new` / `close` 那几条路也一起兜住（多喊一次无害）。
这就是 BUG-6（切标签后插件读写错文档）的修法。

### 2.5 状态栏（`StatusBar`）

| 控件 | 文案 | 数据来源 | 当前状态 |
|---|---|---|---|
| 左 | 文档路径（`title` 是路径；无路径时显示「未保存」，`title="尚未保存"`） | `doc.path` | ✅ |
| 左 | 「● 已修改」 | `doc.dirty` | ✅ |
| 右·第一格 | 模式名（「所见即所得」/「源码」/「分屏」） | `settings.view_mode` | ✅ 2026-09-24 补。⚠️ **恒显**、**只读**；名字取自 `ui/view-modes.ts` 的 `short` 一列（同一张表的 `full` 列给偏好设置那个下拉）。⚠️ 没文档时不画这一格 |
| 右·第二格 | 「严格」（带强调色边框） | `settings.strict_markdown` | ✅ 2026-09-24 补。⚠️ **只在开着时出现**：它是少数派口径（默认关），常驻一个"没开"等于把状态栏开成开关清单 |
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
⚠️ **2026-09-24 起这两个 ref 和这对 `useState` 一起搬去了 `ui/useDialogs.ts`**
（`askConfirm` / `answerConfirm` / `askPrompt` / `answerPrompt` + 两个 `*Req`）——
搬走的理由只有一个：`App.tsx` 顶着 1000 行上限，而这一块"谁在问、问什么"它一概不知道。
**`ConfirmDialog` 这个组件本身没变**，还是受控的，`onAnswer` 还是接那两条回调。

### 2.6d 单行输入框（`ui/PromptDialog.tsx`）—— 2026-09-24 起

`fmt.link` / `fmt.image` 要问一句「地址是什么」时用它。壳同确认框
（`.confirm-backdrop` + `.confirm-dialog`）。

📌 **2026-09-24 起它有两个调用方**：格式那两条命令，以及**插件**（面板按钮与菜单项
声明的 `prompt`，统一从 `ui/plugin-prompt.ts::问参数` 走）。

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标题 / 标签 | 调用方给（如「超链接」/「链接地址」；图片那条是「图片」/「图片地址」，外加「替代文字」；插件那条是 `prompt.label`，按钮上则用按钮的字当标题） | 无 | ✅ |
| 输入框 | `placeholder` 调用方给 | `Enter` → 确定，`Esc` → 取消 | ✅ **挂载即聚焦** |
| 第二个字段 | 只在给了 `secondLabel` 时画（图片的「替代文字」；**插件的 `prompt` 只有一格**） | 同上 | ✅ |
| `secret` | 主输入框画成密码框（圆点） | 无 | ✅ 2026-09-24 加，给插件要 API key 用 |
| 「取消」/ 确定键 | 同确认框 | `onAnswer(null)` / `onAnswer(value, second)` | ✅ |

⚠️ **`secret` 遮的只是屏幕**：值本身照旧原样交出去、**原样明文存进插件的设置文件**
（`docs/12` §4.5）。它不是为了加密，是为了别让人从肩膀上把 key 看走。
⚠️ 带 `secret` 时 `autoComplete="off"` **是必须的**：WebView 的密码管理器会跳出来问
"要不要记住"，而这里填的是 **API key** 不是登录密码——那个弹窗一出现，
用户就得先弄明白"这算不算我的账号密码"。
⚠️ **别在界面上说这个框"安全"**——它只挡住旁边的人。

⚠️ **主字段为空 = 当作取消**（`value.trim() === "" → null`），**不是**发一个空串。
插件那条路靠的正是这一条：它同时挡住了"git 收到一条空提交信息"和
"AI 拿空串当提问发到网上"。⚠️ **取消 ⇒ 命令根本不调**，不是"调一个空参数"。

⚠️ `Enter` / `Esc` 收在**输入框自己**身上、**不绑 `window`**（与确认框不同）：
输入框里按 `Esc` 应该是"把输入法候选框收掉"，绑到 `window` 上抢 `keydown`
会把那一下吃掉——中文用户按 Esc 想取消选字，结果整个框没了。

⚠️ **为什么不直接用 `window.prompt`**：它在 **WebKitGTK 上默认被关掉**，
调用**静默返回 `null`**——「格式 → 超链接」点下去什么都不发生，看起来就是那个菜单项坏了。
这是本节存在的全部理由，和上面那条 `window.confirm` 是**两个症状、同一种错**：
拿浏览器的模态框做桌面应用该自己画的东西。
⚠️ 它和确认框一样是**受控**的，状态都在 `ui/useDialogs.ts` 里（见 §2.6b 末）。

**为什么要自己画**：`window.confirm` **阻塞整个 WebView**，而"关一份没存盘的文档"
随时会发生、且多半发生在用户刚打完字的时候——它会打断中文输入法的组合态。
与 `Toasts` 避开 `alert` 是同一条理由，只是那边先做到、这边漏了（`docs/07` 第 29 项）。

### 2.6c Slidev「装没装」面板（`ui/SlidevPanel.tsx`）—— 2026-09-24 起

点「视图 → **Slidev 预览**」之后**先看见它**，不是先起进程（用户 2026-09-23 报的「slidev 没工作」，
2026-09-24 按他给的行为做：先出面板 → 没装就指官网 → 装了才开预览窗）。
壳借用确认框那套（`.confirm-backdrop` + `.confirm-dialog`），样式在 `styles/slidev.css`。

| 状态 | 符号 | 主按钮 | 左边那组 | 当前状态 |
|---|---|---|---|---|
| 检测中（`probe === null`） | `.is-busy` 转圈 | 「检测中…」**禁用** | 「重新检测」禁用 | ✅ 验过 |
| `ready`（本机能跑） | `.is-ok` 绿 ✓ | 「打开预览」 | 「重新检测」 | ⚠️ **没在界面上点过**（本机没装真 Slidev） |
| `missing`（差东西） | `.is-warn` 橘 ! | 「去官网看安装指南」 | 「重新检测」＋**「仍然打开预览」** | ✅ 验过（真 `npx`） |
| `unknown`（探测没问出结果） | `.is-ask` 灰 ? | 「仍然打开预览」 | 「重新检测」 | ✅ 验过（替身命令 → 20 秒超时） |

另有两块可选内容：

| 控件 | 内容 | 什么时候画 |
|---|---|---|
| `pre.slidev-detail` | 命令自己的输出末尾 8 行（**不改写**——比我们编的准） | `detail !== ""` |
| `dl.slidev-facts` | **命令**（`NOTA_SLIDEV_CMD` 或默认值）与**目录**（拿哪个目录当 Slidev 项目根） | `probe.command !== ""`（探测自己崩掉时是空的） |

键盘：`Esc` → 关掉；`Enter` → 走主按钮；点遮罩 → 关掉。⚠️ 结论出来后**焦点给主按钮**，
而且依赖里带 `primary.label`——`missing` 和 `ready` 的主按钮是两颗不同的按钮，换过去时焦点得跟着换。

⚠️ **它不是一个"你必须先去装"的墙**：`missing` 时主按钮虽然是「去官网」，旁边仍留着
「仍然打开预览」。探测是**有根据的猜测**（主题可能装在更上面的某层），不是证明——
判定错了的时候用户得能自己走下去。这条是复查截图时发现的：第一版面板只有"去官网"一条路。

⚠️ **判定的话全在后端写的 `message` 里**（中文）：离线拿不到包 / 目录里还是个非 Slidev 项目 /
文档没存过盘，三件事的措辞与依据都在 `src-tauri/src/slidev_probe.rs`，前端一个字都不重写。
⚠️ `unknown` **不等于没装**，所以它的话是「这不代表没装，要不要直接试」而不是断言。

⚠️ **那 20 秒**：探测最长 20 秒（自定义命令挂住的上限；正常一两秒）。
这期间面板一直开着、主按钮是禁用的「检测中…」——这是**唯一**一处刻意用禁用按钮代替忙碌态的地方，
理由是用户此刻没有别的选择，而面板本身就是"正在做事"的说明。

### 2.8 Slidev 预览窗（第二个窗口）—— 2026-09-23 起

**这不是应用里的一块面板，是另一个 OS 窗口**：里面装的是 Slidev 自己的 Vite 开发服务器
页面（`http://localhost:<port>/`），由 `ui/useSlidev.ts` 起、由 `src-tauri/src/commands/slidev.rs` 开。

| 方面 | 事实 |
|---|---|
| 入口 | 菜单栏「视图 → **Slidev 预览**」（可勾项）。⚠️ 2026-09-24 起**先出 §2.6c 那个面板**，装了才开窗；开着的时候再点一次是直接收摊（面板不再出）。⚠️ **没有快捷键**——Typora 没有这一项，没有先例可抄，不自己发明一个键 |
| 勾选 | 跟着「这场会话开着」走，**不落盘**。`starting`（进程起了、端口还没通）**也算开着**，否则用户会再点一下、起出第二个服务器 |
| 位置 | 主窗口**右边**挨着，留 8 像素缝；尺寸 960×720。⚠️ 贴边用的是**逻辑像素**（`position()` 吃逻辑值，主窗口几何给的是物理值，中间过一遍 `scale_factor`） |
| 标题 | 「Nota — Slidev 预览」 |
| 关掉它 | 服务器跟着收（杀进程组 + 删入口文件），菜单的勾自动去掉。⚠️ 这条链是 `lib.rs` 的 `Destroyed` 分支（**按 window label 分派**）→ `slidev::stop` → `emit("nota:slidev-stopped")` → 前端。⚠️ **两种触发方式不一样**：从**菜单**再点一下（命令层先 `slidev::stop` 再 `close_window`）在容器里验通了；**用户亲手叉窗口**那条在容器里验不了（应用会撞 GDK 的 `BadDrawable` 直接死，见 `docs/06` §5.7） |
| 开不出来 | 退回**系统浏览器**（`openUrl`），并提示一句。⚠️ 这只是开窗失败，不算整场失败 |
| 起不来 | 把 **Slidev 自己的输出**（最后 30 行）端给用户。缺主题、端口被占这类病因只有它说得准 |

⚠️ **两种状态下的界面反馈**：等端口那 180 秒里界面上**没有转圈**——只有一个勾着的菜单项。
真正的反馈在超时之后（一句带日志的报错）。这是**刻意留的**：这段时间应用不忙，
用户看得见文档一切正常，加个遮罩反而像卡住了。（真要补，位置在 `useSlidev` 的轮询循环里。）

⚠️ 预览是**给某一份文档**开的：切到别的标签**不动它**，也不会把别的文档的正文灌进去。
判据在 `useSlidev` 那个同步 effect 里（`docId` 对不上就不写）。

### 2.9 图标（`ui/Icon.tsx` + `styles/icons.css`）—— 2026-09-24 起

界面上的图形来自 **Folio 的 `actions/` 那 96 枚**，逐字节复制进
`src/assets/icons/`（来源/许可/为什么能搬，见 `THIRD-PARTY.md` §5）。
代码只有两个文件：`ui/Icon.tsx`（约 130 行，名字表 + 查表 + 缺图兜底）
与 `styles/icons.css`（`.icon` 的遮罩画法）。

| 方面 | 事实 |
|---|---|
| 用法 | `<Icon name="folio-format-text-bold-symbolic" />`，`size` 默认 16 |
| 名字 | `图标名` 类型 = `Icon.tsx` 里手写的一张 `as const` 元组。**用错名字过不了 `tsc`**（`import.meta.glob` 的键是 `string`，不手写这张表就没有类型保护） |
| 缺图 | 启动时逐个查一遍，缺了 `console.error` 一次并画 `.icon-missing`（虚线框）——**看得见**，不是静默空白 |
| 上色 | SVG 里 355 处写死的 `fill="#2e3436"`（GTK 深灰）**不参与渲染**：`.icon` 用 `background-color: currentColor` + `mask-image` 抠出来，所以图标**跟着 `color` 走**（hover / `data-on` / 明暗全都白送） |
| 为什么要两套前缀 | `-webkit-mask-*` 与 `mask-*` 都写。真窗口是 WebKitGTK（只认带前缀的），验证用的浏览器是 Chrome（认不带前缀的）——**少一套就在其中一边整片不显示**。⚠️ 这类"一边显示一边不显示"的问题在截图里看不出来，只有换一边跑才现形 |
| 无障碍 | 图标一律 `aria-hidden="true"`，名字写在按钮的 `aria-label` 上。⚠️ **故意没有 `.sr-only`**：加了它就得再管一层"文本节点被读两遍"，这里按钮数量少，`aria-label` 更省事 |

**哪些控件用了图标、哪些还是字**：

| 用了图标 | 还是文字 |
|---|---|
| 工具栏：粗体 / 斜体 / 删除线 / 无序列表 / 有序列表 / 代码块 / 清除格式 / 链接 / 图片 | 工具栏的 `H1` `H2` `H3` `引` `任` |
| 侧栏收起的 ×、侧栏空态那颗「打开文件夹…」、插件栏的 ×、标签页的 ×、提示条的 ×、查找条的 × | 状态栏、菜单栏（菜单项本来就是文字） |

⚠️ **为什么 H1/引/任 是文字**：Folio 那套里**没有**对应的动作图标
（它自己的标题是下拉菜单里的文字项、引用/任务项走的是 `format-text-*` 之外的另一组）。
**不自己画**——本文档 §1 的口径是"图形从 Folio 来"，现造几个就破坏了这个前提，
混着用反而能一眼看出"哪些是搬来的、哪些不是"。⚠️ 所以工具栏**本来就是混的**，
不是"图标没搬全"。

⚠️ **只搬动作图标，不搬应用图标**：`folio-*.svg` 是 Folio 自己的脸，
Nota 的脸是用户逆向出来的 `src-tauri/icons/nota.svg`。

#### ⚠️ 例外：设置对话框左栏那 5 枚**不在这一套里**（2026-09-24 核对）

`ui/settings/primitives.tsx` 里**自己有一份 `Icon`**（连 `IconName` 类型一起），
5 枚**手写的细线图标**：外观 / 文档主题 / 编辑器 / Markdown / 快捷键。⚠️ 两个模块
**各有一个叫 `Icon` 的组件**，只在这一个对话框里用——**别把两者混起来 import**。

**为什么不并进 Folio 那 96 枚**（两条都成立，缺一条都不足以挡住）：

1. **那边没有键盘图标**。「快捷键」这一节找不到对应的一枚，
   硬换的话这一栏会变成"四枚从 Folio 来、一枚现画"——**半套比不换更难看**。
2. **画法不同**：这 5 枚是 24 格、**描边不填充**（Lucide 那种画法）；
   Folio 那套是 16 格、**填充**。设置对话框的左栏是细线小图 + 常规字重标签，
   塞进 16 格的实心图标会和整栏的字重打架。

⚠️ 所以本节的"界面图标"指的是**工具栏与那五处 ×** 那一批；设置对话框那一栏是
**另一套**，别以为漏搬了。真要把它们并过去，得先在 Folio 那套里找到/画出一枚键盘图标
——那是"给 Folio 添图标"，不是 Nota 这边能顺手办的事。

⚠️ 真窗口里验过（`docs/06` §5.1 那套 Xvfb 流程）：`-webkit-mask-*` 在 WebKitGTK 里生效，
工具栏那 9 枚、以及侧栏/插件栏/标签页的 × 都是**图形**，不是方框。

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

⚠️ 这一节的标题被代码注释引用。**别按印象数**——下面这条是可复现的判据：

```sh
grep -rn "docs/04" src/ src-tauri/src/ \
  --include=*.ts --include=*.tsx --include=*.css --include=*.rs | grep -i "外观\|04-ui-map"
```

2026-09-23 的输出是**四处**：`src/bridge/ipc.ts`（`UiStyle` 的类型注释）、
`src/styles/theme.css`（文件头）、`src-tauri/src/settings.rs`（文件头 + `UiStyle`
的文档注释各一处）。改标题或搬迁本节时要一起改。

📌 **本行曾把 `applyTheme.ts` 也算成引用方，那是错的**——`src/styles/applyTheme.ts`
的文件头通篇没提 `docs/04`。当时的错误是"按印象凑数"：看见外观相关有三个文件，
就假定三个都引了本节。**跟 `docs/07` §4 里那四条是同一个毛病。**

⚠️ 另外别把 `theme.css` 里那句"四处缺一不可"跟这里的"四处"混起来——**那是另一件事**：
往某条轴上加**新取值**时要动的地方，数的是 `theme.css` + `settings.rs` 的枚举 +
`applyTheme.ts` 的探测表 + 本节。

### 3.1 三条轴各是什么

| 轴 | 设置字段 | DOM 属性 | 写在哪个元素上 | 管什么 |
|---|---|---|---|---|
| **界面风格** | `ui_style` | `data-ui-style` | `<html>` | **一整套设计语言**：控件形状、圆角、间距、控件高度、阴影、字体栈。⚠️ 它**不是**"主题"的同义词 |
| **明暗** | `ui_mode` | `data-ui-mode` | `<html>` | 亮/暗。`auto` 时跟随系统（`prefers-color-scheme`）。**任何风格下都成立** |
| **文档主题** | `document_theme` | （**没有 DOM 属性**） | 一份注进 `<head>` 的 `<style>` | **只管正文**。见 §3.3——它**不是**第三条 CSS 变量轴，落法与前两条完全不同 |

取值：

| 轴 | 取值 | 落点 |
|---|---|---|
| `data-ui-style` | `auto` / `adwaita` / **`ghub`** / `macos` / **`plasma`** / `windows` / `yaru` / `yaru-blue` | `auto` 由 `detectStyle()` 解析：含 `kde`/`plasma` → `plasma`，含 `ubuntu`/`yaru` → `yaru`，含 `windows` → `windows`，含 `mac`/`darwin` → `macos`，**探不出来就 `adwaita`** |
| `data-ui-mode` | `auto` / `light` / `dark` | `auto` 由 `matchMedia("(prefers-color-scheme: dark)")` 解析 |
| `document_theme`（设置项） | 内置六套的 id（`paper` / `blueprint` / `mist` / `print` / `ink` / `pine`）＋ 用户目录里的文件名 | **空串 = 无主题**，此时那份 `<style>` 被整个摘掉，编辑区回 `editor.css` 里的中性样式。⚠️ **它不写任何 DOM 属性** |

前两条轴的写入动作在 `applyTheme(settings)`（`src/styles/applyTheme.ts`），由 `App.tsx` 的
`useEffect(() => { if (settings) applyTheme(settings); }, [settings])` 触发。
它同时还把 `--ui-font-size` 设到 `document.documentElement` 的内联样式上。
**文档主题走的是另一个 effect**（要异步取 CSS），见 §3.3。

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
| 颜色 | `[data-ui-mode]`（含 `:root` 的 light 兜底） | `--bg` `--bg-subtle` `--bg-raised` `--bg-hover` `--bg-active` `--fg` `--fg-muted` `--fg-faint` `--border` `--border-strong` `--accent` `--accent-fg` `--danger` `--warn` `--success` `--shadow` `--doc-bg` `--doc-fg` `--code-comment` `--code-keyword` `--code-string` `--code-number` `--code-function` `--code-attr` `--code-tag` `--find-hit` `--find-current` |
| 形状 | `[data-ui-style]` | `--radius-sm` `--radius` `--radius-lg` `--control-height` `--spacing` `--toolbar-shadow` `--btn-font-weight`（macos / ghub / plasma / windows 另外换 `--font-ui` 字体栈） |
| 颜色**（例外）** | `[data-ui-style="x"][data-ui-mode="y"]`（**两属性**，放在文件最后） | 确有识别色的风格：ghub 的冷灰蓝边框与 `#0d1117` 画布、plasma 的 Breeze 蓝、yaru 的橙、yaru-blue 的 Yaru 蓝、adwaita/macos/windows 的系统蓝。⚠️ **明暗各写一份**，七套风格 × 两种模式 = 14 格，**一格都不许缺**。⚠️ `yaru` 与 `yaru-blue` **共用形状那一段**（并列两个选择器）——加同语言的强调色变体时照这个写法，别复制一遍圆角 |

⚠️ **不许把颜色写进 `[data-ui-style]` 那一段**。颜色一旦在风格里写死，这个风格就
没法配暗色了——而"我要 macOS 风格 + 暗色"是必然会出现的需求。反过来也一样：
`[data-ui-mode]` 那一段只管颜色，**不许改圆角和行为性尺寸**。

**例外怎么办**：确有识别色的风格写成**两属性选择器**（`[data-ui-style][data-ui-mode]`），
放在文件最后。它比单属性选择器更具体，稳定压过上面两段，同时**仍然是相乘的**——
14 格里每一格都有定义，不存在"那个风格配暗色没法看"的组合。

⚠️ **强调色要连 `--accent-fg`（它上面的字）一起给。** 浅色强调色配白字会读不出来，
这是 14 格里最容易踩的一脚。今天最低的一格是 **Yaru 浅色**（白字配 `#e95420`，
对比度 3.1:1）——**故意留的**，因为 Ubuntu 自己的默认按钮就这么画，改了就不是 Yaru 了。

⚠️ **`yaru-blue`（2026-09-24 加）不是我们配的色**：Ubuntu 的 `index.theme` 里就写着
`X-Yaru-Accent-Name=blue` / `X-Yaru-Accent-Color=#0073E5`，暗色那份用它的
对比度优化档 `#2a95ff`。用户点着名要过这一档（「比如yaru,yaru blue,macOS,windows,plasma等」）。
⚠️ 上一版这里写着"唯一预告过的例外还没写进 CSS"（指 yaru 的橙）。**现在写进去了**，
而且不止一档。`theme.css` 里 yaru 那段注释也是同一件事，已一并更新。

`src/styles/app.css`（以及从它拆出去的 `sidebar.css` / `bars.css` / `editor.css` /
`settings.css` / `slidev.css` / `dock.css`）
的铁律（写在各自文件头）：**颜色与尺寸一律走变量**，
那里不该出现写死的色值或圆角——写死一个就少支持一种风格组合。

加一条新轴上的新值，**三处缺一不可**：`theme.css`、`src-tauri/src/settings.rs`
的枚举、本节。

### 3.2b 默认那一格长什么样（2026-09-24 按「轻快」调过）

用户当天两句话：「**默认风格可以改的轻快一点。**」「**绝对不要用衬线字体做UI字体。**」
两条都落在**默认那一格**上，也就是 `ui_style = auto` + `ui_mode = auto`——
⚠️ 而 `auto` 在这台机器上落到的是 **Adwaita + 跟随系统**
（`guessDesktop()` 恒返回空串，见 §3.1；`adwaita` 同时也是探不出来时的兜底）。

**调的方向是"看着沉的那几处"，不是重画一套配色**。三档各动了什么：

| 档 | 动了 | 从 → 到 | 为什么 |
|---|---|---|---|
| 浅色（`:root`） | `--bg-subtle` | `#f6f7f9` → `#f7f9fc` | 工具栏/状态栏那几条横条的底色比正文还灰，整条像凹进去 |
| | `--border` | `rgba(0,0,0,.11)` → `rgba(0,0,0,.08)` | 满屏 1px 的线是"沉"的主要来源；淡一档分层还在 |
| | `--accent` | `#2a5e9e` → `#2f6fd0` | 原值是深海军蓝，做控件色太重。⚠️ 配白字 4.9:1（AA 门槛 4.5） |
| 暗色 | `--bg` / `--bg-subtle` / `--bg-raised` | `#1b1d21` 一档 → `#1e2126` / `#262a31` / `#2d323a` | 原来的底色接近纯黑，面板之间只能靠亮线分层，线一多就花 |
| | `--border` | `rgba(255,255,255,.12)` → `.10` | 底色挪亮之后线可以退回去 |
| | `--doc-bg` | `#1b1d21` → `#1e2126` | 跟着 `--bg` 走；不跟的话编辑区在深色下会显出一个色块边界 |
| Adwaita 形状 | `--radius-sm/--radius/--radius-lg` | `4/6/10` → `5/8/12` | 比 GNOME 自己那一版松一档 |
| | `--control-height` / `--spacing` | `30` / `8` → `32` / `10` | 同上 |

⚠️ **为什么改的是 Adwaita 这一档、而不是新加一个"轻快"风格**：
`auto` 就落在这里，也就是"默认长相"就是它。**加一个新风格的话，
已经存着 `auto` 的人一点变化都看不到**，等于没改。代价是
`[data-ui-style="adwaita"]` 与 GNOME 的真实取值**不再逐值相同**——
原值记在 `theme.css` 那一段的注释里（`4/6/10/30/8`），
想改回去之前先读那句"默认那一档是给没选过风格的人看的，不是给 GNOME 用户对照用的"。

⚠️ **两条不敢再往前一步的边界**（都写在代码注释里）：
`--border` 浅色那份**别再往 `.06` 以下压**——100% 缩放的普通屏上就看不见了，
"看不清边界"比"有点沉"更难用；暗色 `--bg` **别挪到 `#2a2e34` 以上**——
再上去就和 `--bg-raised` 撞了，"浮起来"那层看不出来。

#### 「默认那一格」还包括**面板的初始开关**（2026-09-24 用户要求）

用户第三句话：「**默认打开应用不要展开两个菜单。**」

指的是左侧栏与右侧插件栏**开工时都是关着的**（`sidebarOpen` / `dockOpen`
的两个 `useState` 初值从 `true` 改成 `false`，`App.tsx`）。

⚠️ **被推翻的是默认值，不是"插件该在右边"那条**：插件栏照旧在右侧、
照旧有三个入口（顶栏那颗「插件」/ 栏里的 × / 菜单「视图 → 插件栏」），
关掉的只是**开机那一刻**的状态——打开应用先看到的应该是一篇干净的正文，
而不是左右各占一条。收起后那一格宽度全还给正文。

⚠️ **别顺手把它做成"记住上次的样子"**：它和左侧栏选的是哪一页同类，
是**看的时候的状态**，不是文档的属性（§2.5 那两条写得比这里细）。
真要持久化就跟 `content_width` 那一批一起走，别单开一个。

#### ⛔ 界面字体不许用衬线（机器在查）

这是一条**硬规矩**，不是风格偏好。它进过代码一次、被清了一次：

- 出现的地方是 `bars.css` 的 `.format-glyph-italic`——给工具栏那个 `I` 字形
  设了 `font-family: var(--font-doc)`，而 `--font-doc` 是**文档**的正文字体栈，
  里面第一个非空项就是衬线（Songti / 宋体那一类）。**界面里用它画字形本身就是错的**，
  哪怕只为了一个字母。
- 现在那颗 `I` **是图标**（`folio-format-text-italic-symbolic`），规则整条删了，
  原地留了一条 ⛔ 注释说明它为什么不能回来。

`tools/doc-sync-check.sh` 的**第 ⑥ 项**就是查这个，两条路都堵：

1. **直接写** `serif`：扫 `src/styles/*.css` 与 `index.html` 里所有
   "含 `serif` 但不是 `sans-serif`"的行（注释行与 `--font-doc` 那行本身豁免——
   `--font-doc` **可以是**衬线，它是给正文用的）。
2. **绕道** `var(--font-doc)`：查 `src/styles` 下除了 `theme.css` / `editor.css`
   之外**谁引了 `--font-doc`**。⚠️ 第二条才是真咬过人的那条——
   第一次加第 ⑥ 项时只写了第一条，`.format-glyph-italic` 那类写法照样能过。

### 3.3 轴三（文档主题）怎么落的 —— **它不是第三条变量轴**

⚠️⚠️ **2026-09-23 重写过一次，前一版的结论整个作废。** 上一版这一节讲的是
"装 Typora 主题"：扫三个目录（我们自己的 + Typora + Typora flatpak）、展开
`@import`、把字体 `url()` 内联成 `data:` URL、再把主题的 `:root` 变量
**提升到全局**由 `theme.css` 末尾的 `--nota-bridge-*` 桥给外壳。

**用户 2026-09-23 把这条路整个否掉了**，两条原话：

1. 「请不要内置typora主题。会侵权。」「typora主题先不用兼容。」
   —— 版权问题，那一整条兼容链（三个目录、import 展开、字体内联、`base64` 依赖）
   **全删了**。
2. 「这是文档风格，不是界面风格，不应该影响到UI主题」
   —— 那条"提升到全局 + 桥接"正是**下半张脸跟着变**的根源：选一个浅色文档主题，
   侧栏、菜单、插件栏一起变亮，整个应用一半亮一半暗。桥也拆了。

所以轴三**不是**"第三条 CSS 变量轴"，它跟轴一/轴二不是一类东西：

| | 轴一 / 轴二（界面主题） | 轴三（文档主题） |
|---|---|---|
| 取值从哪来 | 枚举，编译期就定死 | 内置六套 + **用户往目录里丢的文件**（运行时） |
| 落点 | `<html>` 上的 `data-ui-*` 属性 | 一份注进 `<head>` 的 `<style id="nota-doc-theme">` |
| 作用范围 | 整个外壳 | **只有 `.editor-pane` 之下** |
| 和另一条的关系 | 两者**相乘** | **与轴一/轴二完全无关**，一个变量都不共用 |

**管线**（`src/styles/doc-theme.ts` + `src-tauri/src/themes.rs`）：

```
启动时 nota_doc_themes() → DocThemeInfo[]（id / name / builtin）
选了某条 → updateSettings({document_theme: **id**}) → settings 落盘 + setSettings
          → `ui/useDocTheme.ts` 的 effect 拿 id 去 api.theme.css(id) 取回**文本**
          → scopeDocThemeCss()：new CSSStyleSheet().replaceSync() 让浏览器解析
            （**不用正则切 CSS**），然后逐条改写选择器
          → 注进 <style id="nota-doc-theme">（追加到 <head> 末尾）
```

**限域规则**（这一步是安全边界，不是美化）：

1. 已经含 `.editor-pane` 的**原样放过**——再套一层会变成 `.editor-pane .editor-pane h1`，
   永远命不中；
2. `:root` / `html` / `body` 单独出现时**改写成** `.editor-pane`（**不是加前缀**）
   ——它们指的就是"正文那棵树的根"；
3. 其余一律加 `.editor-pane ` 前缀；
4. `@media` / `@supports` **下钻**（里面的选择器同样要收拢）；
5. `@font-face` / `@keyframes` / `@page` 原样放过（内容不是选择器）；
6. `@import` / `@charset` 与不认识的 at 规则**丢掉**。

📌 **规则 2 是这次修 bug 的关键。** 上一版把 `:root` 的变量**提升到全局**去供外壳消费，
这一版把它**改写到编辑区**，变量再也出不去。**别为了让某个主题"能改外壳"把它改回去。**

📌 这条限域是**机械执行**的，不靠写主题时自觉——主题文件里写错了也漏不到界面上。
`themes.rs` 里还有一条对应的回归测试（`内置主题不碰界面变量`），盯着内置那六套
不许出现 `--ui-font-size` / `--font-ui` / `--sidebar-width` / `--nota-bridge` 这些名字。

**内置的六套**在 `src/styles/themes/*.css`，`include_str!` 编进二进制——所以
**新装的机器上主题菜单不是空的**，而且一份第三方 CSS 都不带（版权）。

⚠️ 这六个文件按**普通文档 CSS** 写、**不带任何作用域前缀**（`h1 { … }` 就是 `h1`），
靠上面那条规则统一挂。一套主题由两部分组成：

- 在 `:root` 里**改 token**：`--doc-bg` / `--doc-fg` / `--border` / `--bg-subtle` /
  `--radius` / `--code-*` / `--select-text-*` / `--font-doc` / `--doc-font-size` /
  `--doc-line-height`。⚠️ 编辑区骨架的样式在 `editor.css` 里是**用 token 写的**，
  所以改 token 就能连代码块底、边框、圆角一起换，**不用去跟 editor.css 抢选择器权重**
  （抢不过：那边是 `.editor-mount .ProseMirror`，两条选择器）；
- 写 `editor.css` **没有覆盖过**的那部分排版：标题、链接、引用、表格、分隔线、列表。

⚠️ **`--code-*` 每个主题必须自带一套。** 代码块底色是主题挑的，沿用界面那套会出现
"深底配深字"。这条也有测试盯着。

⚠️ **`--select-text-*` 的 fallback 必须是 `highlight` / `highlighttext` 这两个系统色**，
不能不给：`background: var(--x)` 在 `--x` 不存在时整条声明失效、回落到 `unset`
（也就是 `transparent`），症状是**选中了看不见**。

**源码模式与分屏也在这条线上**（2026-09-23）：

- `editor/source.ts` 的高亮与主题（`notaHighlight` / `notaTheme`）**一个色值都不写死**，
  全走上面这些 token——所以换文档主题、换界面明暗，源码模式跟着变。
  ⚠️ **别往那里加颜色常量**，加了就等于又开一条会漂移的口径；
- 分屏的骨架（`.editor-pane-split`，在 `editor.css`）只有三件事：
  两格等宽（`flex: 1 1 50%` + **`min-width: 0`**）、**各自滚动**
  （`overflow: auto` 给每一格，外层改 `hidden`）、中间一条
  `border-left: 1px solid var(--border)`。⚠️ `min-width: 0` 不能省：
  flex 子项默认 `min-width: auto` 会被内容撑开（预览里一张宽表格就能把左边挤没），
  而 `overflow: auto` 修不了这个——撑开发生在滚动之前。
- **编辑区的高度链是"三层都写 `height: 100%`"，这是 BUG-15 的修法**（2026-09-24）：
  `.editor-mount` → `.milkdown` → `.ProseMirror` 逐层 `height: 100%`，`.milkdown`
  设 `display: flex; flex-direction: column`，`.ProseMirror` 拿 `flex: 1`，
  左右留白**归 `.milkdown`**（`padding: 0 56px`，那条装订线），
  上下留白归 `.ProseMirror`（`padding: 48px 0 120px`）。⚠️ **必须 `height` 不能
  `min-height`**：`min-height` 下盒子会被正文撑高，文档短时下半屏就是**死的**
  （点了没反应、也点不到、光标也去不了）——旧版症状正是这样，
  点 y=500 / y=700 全无反应。⚠️ 源码模式（`.editor-pane-source`）**不在**这条链里，
  它有自己的 `height: 100%; overflow: auto`，别顺手一起改。

**用户主题**放 `~/.config/nota/themes/<id>.css`，**同名覆盖内置**（想改哪套就复制出去改，
升级不会冲掉）。⚠️ `themes.rs::check_id` 是这里的安全边界：**id 只放行 ASCII 字母数字
与 `-` `_`**，因为路径是拿它拼的（`<主题目录>/<id>.css`）。白名单而不是黑名单——
比"过滤掉 `..`"更难绕过。代价是**中文文件名用不了**，这是有意的取舍：
显示名在文件里写着（菜单显示中文），文件名只是个键。

⚠️ 命令的入参是 **id 不是路径**（`nota_doc_theme_css(id)`），所以前端**根本没有**
"让后端读任意文件"的能力。上一版是传路径 + 一道目录前缀检查——那一版没有漏洞，
但"传 id"是**结构上不可能出错**。

⚠️ **`applyDocTheme(null)` 就是"无主题"**：不是注入一段空 CSS，是**把那个 `<style>`
元素删掉**。所以「无主题（内置）」回到的是我们自己的样式，不是"没有样式的裸 HTML"。
⚠️ id 取不到 CSS 时（用户把那份文件删了）**安静地走 null 那条路**，不弹错——
换机器、清理磁盘都会造成这种情况，不是该打断用户的错误。

### 3.4 切换界面：三条轴都接通了

| 轴 | 切换界面 | 怎么改它 |
|---|---|---|
| 轴一（界面风格） | ✅ **有**：偏好设置 → 外观 → 界面风格（下拉） | `updateSettings({ui_style})`。8 个选项（自动 + 7 风格，含 Yaru 蓝），选中的那套下面带一句中文说明 |
| 轴二（明暗） | ✅ **有**：偏好设置 → 外观 → 明暗（两张**缩略图**）+ 跟随系统偏好（开关） | `updateSettings({ui_mode})`。同时放在那一节的还有界面字号（滑杆） |
| 轴三（文档主题） | ✅ **有**：菜单栏「主题」栏 | `updateSettings({document_theme: id})` |

⚠️ **两者分开摆是有意的**，不是随手放的：用户 2026-09-23 明确要求界面主题和文档主题
分开。上一版把两者都塞在「主题」菜单里，看起来就像"主题菜单管的是整个应用"。

⚠️ **偏好设置里没有「确定」也没有「取消」**（见 `ui/settings/panes.tsx` 文件头）：
外观必须边看边调，每次改动直接落进 `updateSettings`（先改内存再写盘）。
既然即时生效，一个「取消」要么撒谎（撤销不了已经写盘的东西），要么就得再做一套
"暂存-回滚"——为一行没有价值的按钮不值得。

### 3.5 偏好设置那个框的版式（2026-09-23 晚改成 VMark 那套）

> ⚠️⚠️ **这一节记的是"现在长什么样"，不是"最终要长什么样"。**
> 用户当天晚上看了 **VMark 真正的「设置」窗口**（独立窗口、11 节、快捷键可改）
> 之后说「**人家是这样的。今天先记下，明天办。**」——
> 也就是**这一节记的这版很可能要被推倒重来**，要求写在 `docs/07` §3 **第 45 项**。
> 动手改这里的任何东西之前，**先去读那一格**：它列了三处差别和三个必须先回答的问题。

```text
┌──────────────┬────────────────────────────────────┐
│ [搜索设置…]  │  主题                              │
│ ▸ 外观       │  界面风格            [下拉 ▾]      │
│   文档主题   │  明暗               [浅][深]       │
│   编辑器     │  跟随系统偏好          ( ●—)       │
│   Markdown   │                                    │
│   快捷键     │  界面              ──●────  15px    │
│ [ 完成 ]     │                                    │
└──────────────┴────────────────────────────────────┘
```

| 位置 | 是什么 |
|---|---|
| 左栏 | 搜索框 + 五节（外观 / 文档主题 / 编辑器 / **Markdown** / **快捷键**）+ 底部「完成」 |
| 右栏 | 当前那一节。一**行** = 左边标签（可带一行小字）+ 右边控件；若干行归一**组** |
| Markdown 那一节 | **新加的**（2026-09-24）：正文语法的口径，**两组**——「标题」（严格模式开关）与「数学公式」（physics 宏包开关，`panes.tsx::MarkdownPane`）。⚠️ 它**不是外观轴**，所以没放进「编辑器」那一节（那边管的是摆几个窗格、多宽、多久存一次盘）。对照的是 Typora「偏好设置 → Markdown」那一页；那一页上的其余几组（语法扩展开关、代码块、空格与换行）与「列表里的缩进对齐」我们**没做**，逐条列在 `docs/10` §12 |
| 数学公式那一组 | physics 那个开关**只写进 `Settings`**，渲染那一侧在 `editor/math-macros.ts`（宏表）+ `editor/create.ts`（`.config` 里 set `katexOptionsCtx`）。⚠️ 它**不是"装了哪个扩展"**：KaTeX 官方没有 physics，这套命令是我们自己写的宏。改这个开关会把编辑器**重建**（`EditorPane` 的 effect 依赖里有它）——KaTeX 的宏是渲染那一刻查表的，已经画出来的公式不会自己回头重画 |
| 快捷键那一节 | **新加的**（2026-09-23）：只读一览，条目从 `MENUS` 读出来（`walkMenuItems` 深度优先 + `formatAccel`），所以子菜单里的 `Ctrl+Shift+C` 也在，macOS 上显示成 `⌘⇧C` |
| 编辑器那一节·「自动保存」 | ⚠️ **这一项目前是"记着但不生效"**（2026-09-24 起的如实标注）：`settings.autosave_seconds` 有字段、有下拉、能落盘，但**全仓没有消费者**——停笔之后不会真的写盘（`docs/07` 第 20 项）。所以那一组下面挂了一句 `.stg-note` 明说这件事，`docs/03` 的设置表同一行也标了。**接线之后要同时删掉这两处标注** |
| 编辑器那一节·「编辑模式」 | 下拉里的三个名字从 `ui/view-modes.ts` 取 `full` 那一列（状态栏取同一张表的 `short`）——**两处共用一份**，别各写一份 |

⚠️ **明暗那两张缩略图用的是真 token，不是画上去的颜色**：每张自带
`data-ui-style` / `data-ui-mode`，而 `theme.css` 里那两段是**裸属性选择器**，
于是缩略图取到的是那一格真正的变量（连该风格的识别色都对）。判据来自
`applyTheme.ts` 新导出的 `resolveAppearance()`——**和真实外观同一套**。
⚠️ 所以"往缩略图里写死两个色值"是错的：它是唯一会不跟着风格变的地方，
而那正是用户拿来做判断的东西。

⚠️ **搜索是就地过滤，不是跳转**：查询非空时五节**叠着**渲染，每行自己拿标签
和说明去比，比不中的返回 `null` 不进 DOM；一组里一行都没留下时
`.stg-group:not(:has(.stg-row))` 把整组收掉。⚠️ 搜索态下左栏**不高亮**任何一节。
⚠️ 每行能"被比"的字有**三种**，见 `primitives.tsx::SettingRow`：
`label` + `description`（都画出来）+ `searchText`（**只参与过滤、不画**）。
最后一档是给"每行挂一遍会变成噪音、可用户真会搜"的字用的——
快捷键那一节的**菜单名**（组标题已经写着「文件」）和**原始 accel**都在这一档里。
⚠️ 搜的是 `Ctrl+S` 那种**原始写法**，不是屏幕上那串：macOS 显示成 `⌘S`，
真让用户照着屏幕抄，反而搜不到。

⚠️ 搜索框右边那颗「×」**是我们自己画的**，别改回 `<input type="search">`
自带的那颗：**WebKitGTK 里那颗点了不派发 `input`**，于是 React 的 `value`
一动不动、下次渲染又把字写回去（实测：蓝框消失、字还在）。所以 CSS 里
`::-webkit-search-cancel-button { display: none }`，`SearchField` 里自己挂
`onClick={() => onChange("")}`。⚠️ 这也是一类"**看起来能用**"的假货——
按钮画得出来、点得下去、就是不生效。

⚠️ **`htmlFor` 只给可标注的控件**（`ui/settings/primitives.tsx` 的 `LABELABLE_TAGS`）：
指向 `<button>` 是两重错——`htmlFor` 悬空，而且点标签文字会**真的触发那个动作**。

⚠️ 主题那一栏**不重扫目录**：`api.theme.list()` 在启动时拉一次就定住了。
往主题目录里丢一个新 `.css`，**要重启才出现在菜单里**（`docs/07` 第 41 项）。

### 3.6 参考过的界面截图（2026-09-24）

用户发来几张**别的编辑器的界面截图**（偏好设置的几页、主窗口、右键小工具条、文件菜单），
原话是「**你可以参考一下他的界面设计。**」下面是**看这几张图得出的结论**，
分成"跟着做了"和"看清了但**故意不跟**"两半——⚠️ 后者才是这一节真正有用的地方，
因为"为什么不做"过一阵就没人记得了。

**跟着做了的**：

| 看到的 | 我们做的 |
|---|---|
| 小工具条里"链接 / 图片 / 列表 / 代码"是**图形**，不是字 | 工具栏那 9 枚换成图标（§2.9 那张表） |
| 面板收起的叉是一枚**图标**，不是字符 `×` | 侧栏 / 插件栏 / 标签页 / 提示条 / 查找条五处的 × 全换成 `folio-close-symbolic` |
| 设置窗口左栏的节名**前面有一枚小图标** | **我们本来就有**（`ui/settings/primitives.tsx` 里手写的那 5 枚，见 §2.9 的例外那一段）——不是照着这几张截图加的，看截图时才发现两边**碰巧**都有 |

**看清了但不跟的**：

| 看到的 | 为什么不跟 |
|---|---|
| 粗体/斜体用的是**字母** `B` `I` 本身，不是图标 | 我们替成了图标。理由有两条：① 那 96 枚里 `format-text-bold/italic` 本来就有，不用白不用；② 字母得挑一个**字体**来画，而 `bars.css` 里那条 `.format-glyph-italic` 正是这么引到衬线上去的（§3.2b 的 ⛔ 那一段）——字母写法在我们这儿**已经出过一次事** |
| 右键弹出的**浮动小工具条** | **没做**。它是"选中文字才出现"的第二套工具栏，等于把工具栏的状态机再写一遍（定位、翻转、失焦收起、和滚动打架）。当前工具栏就在顶上钉着，够用。⚠️ 真要做，位置是 `ui/FormatBar.tsx`，但**先读这一段** |
| 状态栏左下角有两个很小的开关（源码模式之类） | **没做**。我们的状态栏那两项走的是顶栏/菜单，状态栏只放只读信息（§2.5）。加开关会让"状态栏 = 只读"这条不再成立 |
| 偏好设置里"语法扩展 / 代码块 / 空格与换行"等几组 | 逐条列在 `docs/10` §12，**没做**（§3.5 那行也指了同一处） |

⚠️ **两条不许越过的线**（都写过好几次了，这里再钉一遍）：

1. **界面文案里不许出现"跟某某编辑器一样"这类说法**。参考的是**做法**，
   写进界面的是 Nota 自己的话。
2. **截图只当参考，不抄它的图形资产、也不内置它的主题**
   （「请不要内置typora主题。会侵权。」）。我们的图标来自 Folio（`THIRD-PARTY.md` §5），
   与这几张截图无关。

---

## 4. 快捷键表

**这张表是算出来的，不是手写的**（2026-09-23 重做）。真源是 `ui/commands.ts` 里
每条菜单项的那个 `accel` 字段，`ui/accel.ts` 把它遍历成一张
`键位签名 → 命令 id` 的索引：

```text
MENUS (commands.ts，唯一真源)
  └─ buildAccelIndex(MENUS)          ui/accel.ts，useMemo 里跑一次
       └─ Map<"ctrl+shift+s", "file.saveAs">
            └─ App.tsx 的 keydown：查表 → 命中就 preventDefault → 调 menuHandlers[id]
```

`keydown` 的整条判定链（顺序即优先级）：

1. `e.isComposing || e.keyCode === 229` → 放行（**输入法组字中，一个键都不抢**）
2. 用 `eventAccel(e)` 算出签名，去索引里查；查不到 → 放行（**不 preventDefault**）
3. `isOutsideEditor(e.target)` → 放行（在设置面板的输入框里按 `Ctrl+N` 不该新建文档）
4. `disabledCommands.has(id)` → 放行（**灰掉的项快捷键也失效**，见下）
5. 有 handler 就 `preventDefault()` 再调它

⚠️ **第 2 步「查不到就放行」是刻意留的口子**：`Ctrl+X` / `Ctrl+C` / `Ctrl+V`
（剪切/复制/粘贴）**故意没有处理函数**，所以查不到、放行给系统剪贴板。
**别改成"凡是有修饰键就吞掉"**——那会把系统剪贴板做坏。

⚠️ **但 `Ctrl+B` / `Ctrl+I` / `Ctrl+Z` 是"查得到"的**（`fmt.bold` / `fmt.italic` /
`edit.undo` 都有处理函数），所以它们**不再**放行给编辑器，走的是我们自己的
`runCommand`。⚠️ 早先这里写的是「`Ctrl+B/I/Z` 归 ProseMirror」，那是菜单栏还没有
处理函数时候的事，**已经不对了**——这类"当年对、现在错"的句子最难发现，
因为它读起来仍然通顺。

⚠️ **第 4 步意味着"灰 = 快捷键也没了"**。看着像缺陷，其实是唯一说得通的口径：
一个菜单项灰着（比如没有活动文档时的「保存」），它的快捷键却能生效，用户会
以为灰是画错了。**要改这条，先想清楚灰的定义**。

### 4.1 现在真的能按的

判据只有一条：**`accel` 有值，且 `menuHandlers` 里有这个 id**。
下面的数是**算出来的**（2026-09-23 核对），别手抄：

```sh
# 带 accel 的条目 ∩ App.tsx 里有处理函数的 id —— 「能用」那一半
node -e 'const fs=require("fs");const re=/id:\s*"([^"]+)"((?:(?!id:)[\s\S])*?)accel:\s*"([^"]+)"/g;const c=fs.readFileSync("src/ui/commands.ts","utf8");const a=fs.readFileSync("src/App.tsx","utf8");const hs=new Set([...a.matchAll(/^\s*"((?:file|edit|para|fmt|view|help)\.[A-Za-z0-9]+)":/gm)].map(x=>x[1]));let m,o=[],b=[];while((m=re.exec(c)))(hs.has(m[1])?o:b).push(m[1]+"="+m[3]);console.log("能用 "+o.length+": "+o.join(" | "));console.log("按不动 "+b.length+": "+b.join(" | "))'
```

⚠️ 上面这个数**一变长就说明有人加了实现**——把它连同本文的数是"算出来的"一起
理解：**别把结果当规格**，规格是"有没有处理函数"。

| 快捷键 | 命令 id | 动作 |
|---|---|---|
| `F11` | `view.fullscreen` | 切全屏 |
| `Ctrl+N` | `file.new` | 新建文档 |
| `Ctrl+O` | `file.open` | 打开（走文件对话框） |
| `Ctrl+S` | `file.save` | 保存；没有路径时弹「保存为」 |
| `Ctrl+Shift+S` | `file.saveAs` | **强制**弹「保存为」 |
| `Ctrl+W` | `file.close` | 关闭（走未保存确认） |
| `Ctrl+,` | `file.preferences` | 打开偏好设置 |
| `Alt+Shift+P` | `file.print` | **打印**（2026-09-24 加）。⚠️ 它是"导出含样式的那份 HTML + 交给系统默认程序"，提示里会同时说清两步 |
| `Ctrl+Z` / `Ctrl+Y` | `edit.undo` / `edit.redo` | 撤销 / 重做。⚠️ 两种模式各走各的历史（§4.2 末条） |
| `Ctrl+Shift+C` | `edit.copyAsMarkdown` | 复制为 Markdown。⚠️ 快捷键在**子菜单**里：`edit.copy` 那一项飞出来的子菜单 |
| `Ctrl+H` | `edit.findReplace` | **查找与替换**（2026-09-24 加）。⚠️ 只**开**条子，不切"开/关"——光标的焦点在条子里时这条键**接不到**（`isOutsideEditor` 那条判据），此时用 Esc 关 |
| `Ctrl+Shift+L` | `view.toggleSidebar` | 显示/隐藏侧栏（可勾项） |
| `Ctrl+Shift+1` | `view.outline` | 开侧栏并切到**大纲**（可勾项） |
| `Ctrl+Shift+3` | `view.fileTree` | 开侧栏并切到**文件树**（可勾项） |
| `Alt+1` / `Ctrl+/` / `Alt+2` | `view.modeWysiwyg` / `view.modeSource` / `view.modeSplit` | **三种编辑模式**（可勾项，三选一）。⚠️ 键族刻意不统一，见 `commands.ts` 那段注释：`Ctrl+/` 是为 Typora 对标的"源码模式"留的，`Alt+1/2` 那两个 Typora 没有 |
| `Ctrl+1`…`Ctrl+6` | `para.h1`…`para.h6` | 标题一到六级 |
| `Ctrl+0` | `para.text` | 正文段落 |
| `Ctrl+Shift+K` / `Ctrl+Shift+Q` / `Ctrl+Shift+[` / `Ctrl+Shift+]` | `para.codeBlock` / `para.quote` / `para.ol` / `para.ul` | 代码块 / 引用 / 有序列表 / 无序列表 |
| `Ctrl+Shift+X` | `para.task` | 任务列表（2026-09-24 起 `para.task` 也有处理函数了） |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+\`` / `Alt+Shift+5` | `fmt.bold` / `fmt.italic` / `fmt.code` / `fmt.strike` | 加粗 / 斜体 / 行内代码 / 删除线 |
| `Ctrl+K` | `fmt.link` | 插入超链接（弹单行输入框问地址）。⚠️ 光标已经在链接上时它是**去掉**链接（切换语义），不是改地址——这是已知的粗糙处，见 `docs/07` |
| `Ctrl+\` | `fmt.clear` | 清除行内样式。⚠️ 只在**有选区**时亮（`光标条件` 那条判据） |
| `F8` / `F9` | `view.focusMode` / `view.typewriter` | **专注模式 / 打字机模式**（可勾项，2026-09-24 加），见 `docs/05` §4.4 |

**共 38 条**（算出来的，2026-09-24 重算；对应 **12** 条按不动）。⚠️ 这张表里**段落与格式那 16 条是 2026-09-23 才亮的**——
它们的处理函数早在菜单栏那一批就写好了（`run("bold")` 之类），但 §4.1 当时只列了
12 条，把这一批漏在外面。**漏的原因是当时是手抄的，不是算的**——所以现在把
算法写在上面。

⚠️ **两种编辑模式下这些命令的实现不是同一份**：所见即所得走 ProseMirror 的
`callCommand`，源码模式走 `source.ts::applyCommand` 的**文本操作**。
`Ctrl+Z` 尤其要注意：**两边的撤销栈不通**，切模式等于清空历史（`docs/05` §3.1）。

### 4.2 写着但按不动的

**12 条**（同样是算出来的，2026-09-24 重算）：`file.newWindow` `Ctrl+Shift+N`、
`file.quickOpen` `Ctrl+P`、`edit.cut/copy/paste` `Ctrl+X/C/V`、
`edit.moveLineUp/Down` `Alt+↑/↓`、`para.mathBlock` `Ctrl+Shift+M`、
`fmt.underline` `Ctrl+U`、`view.docList` `Ctrl+Shift+2`、`view.search` `Ctrl+Shift+F`、
`view.devtools` `Shift+F12`。

⚠️⚠️ **这一组有一个自己的毛病：它们是灰的，键位却照显示。**
`MenuPopup` 把 `accel` 画出来而不管这一项亮不亮，所以「公式块」那一行明明白白
写着 `Ctrl+Shift+M`——**按下去什么都不发生**。这正是 `ui/accel.ts` 文件头点名
要消灭的那类静默（"显示的键位是假的"）。⚠️ **判据本身（有没有处理函数）没问题**，
错的是"灰了还把键位挂在旁边"。见 `docs/07` 第 52 项。

⚠️ **这份名单曾经写着 19 条，多出来的 7 条是陈旧**：`file.print`、`edit.findReplace`、
`para.task`、`fmt.link`、`fmt.clear`、`view.focusMode`、`view.typewriter` ——
它们**当时确实是灰的，现在都亮了**（各自的表在 §4.1）。
**名单是靠上面那条 `node -e` 算的，别手抄**：手抄的症状就是这个——功能做了、
灰名单还留着它们的名字，读的人会以为没做。

**它们只是照 Typora 抄的键位**，对应的命令**后端/前端还没有实现**，所以
`menuHandlers` 里没有它，菜单里是灰的，第 4 步会把按键放行。

⚠️ **`Ctrl+X/C/V` 那三条是另一类**：它们**不该有**处理函数（交给系统剪贴板），
所以"永远按不动"是**对的**，别哪天手滑给它们补上。判据不是"这人有 handler 吗"，
而是"这件事该归谁"。

⚠️ **这跟过去是两回事**。过去 `accel` 只是显示、真绑定另有一张手写表，
两边能各错各的；现在**同一张表**，所以"菜单上写着 `Ctrl+P` 却按不动"
和"菜单里那一项是灰的"必然是同一件事。**看到这个组合出现，不要当 bug 修**——
它就是在说"这个功能还没做"。真做出来了，加 `menuHandlers` 那一行，两者一起活。

### 4.3 焦点与边界

⚠️ `isOutsideEditor` 判的是 `input` / `textarea` / `select` /
`[contenteditable='true']`，**且不在 `.editor-pane` 里**。编辑器自己那棵
ProseMirror 的 DOM 也是 `contenteditable`，所以那个"不在编辑区里"的例外
不能省——省了编辑器里一个快捷键都用不了。

⚠️ 监听器挂在 `window` 上、**只装一次**（`useMemo` 出来的 `accelIndex`
是稳定的），但 `menuHandlers` / `disabledCommands` 变了会让 effect 重装——
新的闭包要看到新的 `docs`。功能上是对的，只是别当成"整个生命周期只跑一次"。

### 4.4 键位写法的坑

⚠️⚠️ **判的是 `e.code` 不是 `e.key`**（`ui/accel.ts` 的 `CODE_TO_KEY`）。
按着 Shift 敲数字排，`e.key` 拿到的是**上档字符**（Shift+1 是 `"!"`），
所以 `Ctrl+Shift+1` 在 `e.key` 上**永远查不到**。这曾经是两条按了没反应的
死代码，而静态读代码完全看不出来。

⚠️ **`CODE_TO_KEY` 里数字那一行漏过一次，而且是静默的**：少了
`Digit1`…`Digit9` 之后代码退回 `e.key`，而**不带 Shift 时 `e.key` 恰好
就是 `"1"`**——`Ctrl+1` 照样能用，窟窿被盖住了，只有 `Ctrl+Shift+1` 会露馅。
补上之后由试验台的 `#accel` 场景（30 条键位 + 9 条显示）盯着。

⚠️ **箭头键只认 `UP`/`DOWN`，绝不认 `↑`/`↓` 这两个字形**——muda 的
`parse_code` 收 `ARROWUP` 之类的 Code 名，唯独对箭头不收字形。
`Alt+↑`（上移该行）写的就是 `Alt+↑`，转换那步在 `src-tauri/src/native_menu.rs`。

⚠️ **macOS 上 `Ctrl` 要写成 `CmdOrCtrl`**。muda 的 `CTRL` 在 macOS 上是
**真的 Control 键**，而用户按的是 ⌘——所以 `native_menu.rs` 把 `Ctrl+`
一律翻成 `CmdOrCtrl+`。前端显示也要跟着换（`formatAccel` 出 `⇧⌘S`），
**否则菜单显示的和实际按的对不上**。

⚠️ **插件也能声明 `accelerator`，撞车时先到先得**（2026-09-24）。
`buildAccelIndex` 遍历的是**拼过的菜单表**，而插件那一栏拼在**所有内置栏之后**
（`docs/13` §8.3），所以**内置的键位永远赢**，撞了 `console.warn` 一声、
不报错也不崩。⚠️ **别把插件那一栏挪到前面**——那会让某个插件的 `Ctrl+S`
抢掉保存，而且只在装了那个插件时才出现。
⚠️ 插件声明的键位**不出现在「快捷键」那一页**（`ShortcutsPane` 读的是常量
`MENUS`），理由见 `docs/02` 的 `ui/commands.ts` 那一节。


---

## 5. 状态存在哪（改界面之前先看这张表）

`App.tsx` 是**唯一**的状态编排处，界面里所有 `useState` 都在这一个组件
（`Sidebar` 那个"当前是哪一页"的 `tab` **是受控的**——它住在这里，见下）。

⚠️ **2026-09-24 起有六块例外，都不在 `App.tsx` 里**：两个自绘对话框的"谁在等答案"
（`ui/useDialogs.ts`，§2.6b）、菜单的三条判据（`ui/useMenus.ts`）、
**导出与打印**（`ui/useExport.ts`）、**文档主题的应用/切换/打开目录**（`ui/useDocTheme.ts`）、
**插件的三份清单 ＋ 跑一条插件命令**（`ui/usePlugins.ts`），
外加一个不持有状态的 `ui/useEditorCommands.ts`（"把一条菜单命令送进编辑器"）。
搬走是因为 `App.tsx` 顶着 1000 行上限（`AGENTS.md` §0.4），
而它们**和外壳骨架无关**——一个只管"问一句等回答"，一个只管"灰不灰、勾没勾"，
一个只管"生成一份 HTML 再落盘"，一个只管"把主题 CSS 取回来、限域、注入"，
一个只管"插件那三样从哪儿来、菜单项怎么变成能点的东西"。

⚠️📌 **`usePlugins.ts` 与前面几块不同：它搬走的是状态，不只是动作。**
`plugins` / `panels` 两个 `useState` 连同插件菜单项一起搬过去了，
所以下面那份表**从 20 个降到了 18 个**（2026-09-24 重数）。**改这张表前先 `grep` 一遍。**

**18 个 `useState`**（`grep` 数出来的，2026-09-24 重数）：

| 状态 | 类型 | 谁改它 |
|---|---|---|
| `docs` | `Document[]` | `refreshDocs()`（`api.doc.list()`）：启动、新建、打开、保存、关闭、**以及编辑器去抖同步之后** |
| `activeId` | `DocId \| null` | 新建/打开/关闭，以及点标签（`setActiveId` 直接传给了 `TabBar`）。⚠️ 它一变就有一个 effect 去喊 `api.doc.setActive`（BUG-6） |
| `settings` | `Settings \| null` | 启动读一次 + **`updateSettings()` 改它**（今天唯一的调用点是主题切换）。⚠️ 不是"读一次就不动了"了 |
| `workspace` | `string \| null` | 启动读一次 + 打开文件夹 |
| `tree` | `TreeNode[]` | `refreshTree()`，随 `workspace` 变 |
| `plugins` / `panels` / 插件菜单项（在 `ui/usePlugins.ts` 里，**不在这里**） | — | 📌 **2026-09-24 搬走了**。三样在同一个 `Promise.all` 里拉（`list()` / `panels()` / `menus()`）——它们回答的是同一个问题（"现在装了什么"），分开三次只会多出几种中间态。⚠️ **都靠拉、不靠事件**（BUG-13），见 §2.2b |
| `面板内容`（在 `PluginDock.tsx` 里，**不在这里**） | `Record<string, 面板状态>` | 每个面板一份，四态。⚠️ 住在 `PluginDock` 自己家里、**不往上抬**：内容是"这一刻从插件拉回来的东西"，没有第二个人要用 |
| `toasts` | `Toast[]` | `toast()` 加、定时器或用户点 × 减 |
| `sidebarOpen` | `boolean`（**默认 `false`**） | 菜单栏「视图」栏、`Ctrl+Shift+L` |
| `sidebarTab` | `"tree" \| "outline"` | **受控**：`Sidebar` 自己不再持有它，点标签页、菜单栏「大纲/文件树」、`Ctrl+Shift+1/3` 都改这里 |
| `statusBarOpen` | `boolean`（默认 `true`） | 菜单栏「视图 → 状态栏」 |
| `dockOpen` | `boolean`（**默认 `false`**） | 顶栏的「插件」开关、右栏的 ×、菜单栏「视图 → 插件栏」。⚠️ **只在内存里，没进 `settings`**——它和左栏选哪一页一样是「看的时候的状态」，不是文档属性。刷新即复位 |
| `themes` | `DocThemeInfo[]` | **只在启动时读一次** `api.theme.list()`。⚠️ 所以往主题目录丢新 `.css` 得重启才看得见（`docs/07` 第 41 项） |
| `session`（在 `ui/useSlidev.ts` 里，**不在这里**） | `SlidevSession \| null` | 这一场 Slidev 预览。⚠️ 和 `dockOpen` 同类：**看的时候的状态**，不进 `settings`。`null` = 没开，菜单「视图 → Slidev 预览」的勾跟着它走 |
| `settingsOpen` | `boolean`（默认 `false`） | 菜单「文件 → 偏好设置」、`Ctrl+,`；关由 `SettingsDialog` 的「关闭」 |
| `formatBarOpen` | `boolean`（默认 `true`） | 菜单「视图 → 格式工具栏」（可勾项）。⚠️ 同 `dockOpen`：**只在内存里**，刷新即复位 |
| `findOpen` | `boolean`（默认 `false`） | 菜单「编辑 → 查找与替换」、`Ctrl+H` 开；`Esc` / 条子上的 ✕ 关（`App.tsx::关查找`，顺手清高亮并把焦点还给编辑区） |
| `findStatus` | `FindStatus` | **编辑器报上来的**（`EditorPane` 的 `onFindStatus`），`App.tsx` 不自己算。⚠️ 换文档/切模式时编辑器会报一次 `空查找状态`——不留着上一次那份 |
| `focusMode` / `typewriter` | `boolean`（默认都 `false`） | 菜单「视图 → 专注模式 / 打字机模式」、`F8` / `F9`。⚠️ **明确不进 `settings`**：它们和 `dockOpen` 同类，是"看的时候的状态"，不是文档属性 |
| `commandState` | `CommandState \| null` | **所见即所得那边报上来的光标状态**（`EditorPane` 的 `onCommandState`）。⚠️ 源码模式与没有文档时报 `null`——**不是空状态**，两者含义不同（见 `docs/05`） |
| （`confirmReq` / `promptReq`） | — | ⚠️ **2026-09-24 起不在这里**，搬去了 `ui/useDialogs.ts`（见上） |

**2 个 `useRef`**（`App.tsx`；`MenuBar` 自己内部还有一个 `barRef`，`useSlidev` 里两个，见下表末两行）：

| ref | 类型 | 干什么 |
|---|---|---|
| `editorRef` | `EditorPaneHandle` | 命令式通道：`getMarkdown()`（存盘前强制同步）、`setMarkdown()`（插件改了文档）、`focus()`、`runCommand()`（**三条入口都从这儿进**：自绘菜单点选、快捷键命中、原生菜单发来的 `nota:native-menu`） |
| `activeIdRef` | `DocId \| null` | **给事件订阅用的**。订阅那个 effect 不该因为 `activeId` 变了就重装，所以回调里读 ref 而不是闭包里的值 |
| （`confirmResolve` / `promptResolve`） | — | ⚠️ **2026-09-24 起不在这里**，搬去了 `ui/useDialogs.ts`。那里两个 ref **各一个、都不是队列**，理由见 §2.6b |
| `run`（在 `ui/useSlidev.ts` 里，**不在这里**） | `number` | 每次开关预览 +1。⚠️ **在途的轮询靠它判断「我这一轮还算数吗」**——少了它，「等端口时又点了一次菜单」会在停掉之后凭空开出一个没人关得掉的窗口 |
| `gate`（在 `ui/useSlidev.ts` 里，**不在这里**） | `SlidevGate \| null` | 「装没装」那个面板：`{ docId, probe }`。`null` = 面板没开；`probe === null` = 还在检测。⚠️ **和 `session` 是两件事**：这一刻还没有进程，用户看完关掉就什么都不该发生 |
| `gateRun`（同上） | `number` | 每次开面板/重新检测 +1，道理同 `run`：**晚到的报告不许把面板重新打开**（用户可能在检测没回来时就把面板关了，或又点了一次菜单——那是另一次检测） |

⚠️ `MenuBar.tsx` 里还有个 `barRef`（挂在 `.menubar` 上），用途是判"这次 `mousedown`
点到的是不是菜单以外"→ 是就关弹层。

⚠️ **`settings` 改完必须 `setSettings(...)` 把新的那份放回 state**（`updateSettings`
就是这么做的），否则 `applyTheme` 与 `ui/useDocTheme.ts` 那个 effect 都不会重跑——
症状是"设置存进去了，界面没变"。

---

## 6. 与 `api.*` 的对账（哪些命令前端还没用上）

`src/bridge/ipc.ts` 导出的 **38 个方法**里（2026-09-24 重数：doc 11 / workspace 4 / settings 2 /
nativeMenu 1 / theme 3 / plugin **7** / slidev 8 / **export 2**），**从未被调用过的有 5 个**。
它们不是死代码——是后端已经做好、前端还没接线的口子：

| 命令 | 谁会用到它 |
|---|---|
| `api.doc.get` | 单取一份文档的最新状态（而不是拉整张表） |
| `api.doc.hasUnsaved` | 退出前决定要不要拦一下 |
| `api.workspace.close` | 关掉工作区（只清围栏，**不关文档**）——⚠️ **今天打开文件夹之后没法关** |
| `api.plugin.setEnabled` | 插件页的启用/禁用开关（`docs/07` 第 18 项） |
| `api.plugin.findCommand` | 对账"这个命令是哪个插件的"。⚠️ 没有界面入口，是个诊断口子 |

📌 **2026-09-24 起 `api.plugin.call` 从这张表上下来了**（`ui/usePlugins.ts::调`，
面板按钮与插件菜单项两条路都走它），`api.plugin.panelContent` 是同一批新接上的。
**第 42 项（插件菜单接进菜单栏）同日结清**——那份"还要等第 42 项"的注记可以划掉了。

⚠️ **已经接上的**（这份对账表以前把它们列成"没用上"，逐条澄清一下，免得再被抄回来）：
`api.doc.setActive`（BUG-6 的 effect）、`api.doc.reload`（菜单「从磁盘重新加载」）、
`api.settings.set`（主题切换）、`api.plugin.panels` / `api.plugin.menus`
（启动时拉一次，BUG-13 的修法）、`api.theme.*` 三条、`api.frontendReady`、
**`api.slidev.*` 八条全部**（都在 `ui/useSlidev.ts` 里；`probeInstall` 是 2026-09-24 新加的，接在 `check()` 上）、
**`api.export.write` / `api.export.print`**（都在 `ui/useExport.ts` 里）。

⚠️ **插件声明的面板与菜单不走事件，走上面这两条命令拉**（BUG-13，2026-09-22）。
曾经它们是 `events.pluginPanel` / `events.pluginMenu` 两条事件，而 `App.tsx` 里
**没有监听者**——关键不是"忘了写订阅"，而是**订阅了也没用**：注册在插件加载时、
订阅在挂载之后，时序上必漏，且 Tauri 对没有监听者的频道 `emit` 是**静默成功**的。
⚠️ **第 16 项已作废**（那个"记账 + 重放"的设计是错的，不是没做完）。
**第 17 项仍然开着**，但它不是同一个根：那讲的是**数据类**事件没人消费
（`plugin:<id>:<name>` 这条通道对发生类数据是正解，缺的只是订阅端）。

`docs/07` §3 里与上表直接相关的还有：**第 2 项**（工具栏的格式化按钮——⚠️
菜单栏「段落」「格式」两栏已经能兑现其中大半，缺的是**一条常驻工具栏**）、
**第 3 项**（插入菜单——`para.table` / `para.codeBlock` / `para.hr` 已经在菜单里能点，
图片/链接/公式/图表还没有）、**第 10 项**（设置对话框）、
**第 18 项**（插件启用/禁用开关，依赖第 10 项）、
**第 20 项**（自动保存接上 `autosave_seconds`）、
**第 26 项**（「放弃修改并重载」入口——⚠️ **菜单「从磁盘重新加载」已经调 `api.doc.reload` 了**，
第 26 项要的是"放弃修改"那个语义，两回事）、
**第 41 项**（主题清单不重扫）。
⚠️ **第 42 项（插件菜单接进菜单栏）2026-09-24 已结清**——上面那段还提到它，别照抄。

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
| 3 | `docs/10` §7："文档主题（只管正文）⬜ —— 一份文档主题的 CSS 都没有" | ⚠️⚠️ **这一格当时我给出的"代码是什么"是编的。** 写的是「`app.css:690/700` 已有 `github` 与 `newsprint`」——**`grep -rn 'github\|newsprint' src/styles/*.css` 返回 0 行**，那两行是 `.home-*` 的规则。原始文档说"一份都没有"**其实是对的** | 2026-09-23 按事实重写：文档主题系统是**那一批新做的**（装 Typora 主题 + 菜单栏切换），状态 **✅**、§1 计数已重算。⚠️ 这一格的教训写在 `docs/07` §4：**"实际 X 已经有 Y"这种更正，必须附上能复现的搜索命令与输出**——我当时手上没有任何搜索结果，行号是编出来的 |
| 4 | `docs/07` BUG-3 与 `plugin/mod.rs` 的注释/错误信息："`.` **与 `_`** 在事件名里都写作 `-`" | `channel_id()` 第 258 行：**`_` 原样保留**（它本来就在 Tauri 事件名的允许集合里），只有 `.` 等不合法字符换 `-`。有用例钉着：`channel_id("a_b-c") == "a_b-c"` | **三处**都改成只提 `.`：`plugin/mod.rs` 的注释与错误信息、`manifest.rs` 的 `channel_id()` 文档注释（第 245–255 行）、`docs/07` BUG-3。同时补上"`nota_git` 与 `nota-git` **不撞**" |

另有一处小疵也已改：`docs/10` §2 的"打开最近的文件"那格原本写"见 §3 第 9 项"，
指的是**本文档自己的** §3（那是"编辑与格式化"），实际要引的是 **`docs/07` §3 第 9 项**。

> ⚠️ **这四处的共同成因值得记住**：它们**全部是"按先入判断填的"**，没有一处是"忘了更新"。
> 两处把"其实能做"写成"没做"，一处把允许字符集记宽了，
> **还有一处（第 3 格）是"为了纠正前一处，我编了一条没查过的更正"**——四种错里最坏的一种。
> 所以 `docs/10` §10 第 3 条那条规矩要**双向**执行：
> 填 ✅ 之前先点一下；**填 ⬜/🟡 之前先 `grep` 一下**。
> 而核对的手段必须看**上下文几行**，不能只看 `grep` 命中的那一行——
> 这一轮已经有人（我）在这上面栽过一次，详见 `docs/07` §4 的第一条漂移记录。
