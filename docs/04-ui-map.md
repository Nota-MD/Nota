# 04 — 界面地图：控件树、逐控件回调与外观

> 最后同步：2026-10-07

本文按 `src/App.tsx` 的 JSX 结构逐层展开界面，再把每个可交互控件对上它的回调、
最终走到的 `api.*`（或哪个快捷键），以及**当前是真的能用还是空壳**。

⚠️ **不要假设某个按钮能用**：本文的"状态"列与 `docs/07-feature-status.md` 是同一份
判断的两个视角；两者不一致时以 `docs/07` 为准（它带排期），但**以代码为最终事实**。

界面层没有原生控件树（这是与 Folio 最大的差别）：整个界面是 WebView 里的 HTML/CSS，
样式在 `src/styles/app.css`（**左侧栏那两棵树在 `src/styles/sidebar.css`**，
**右侧插件栏在 `src/styles/dock.css`**（它的骨架；面板内容块、面板里的数据块、插件清单 2026-09-29 按功能拆去了 `panel.css` / `panel-data.css` / `plugin-list.css`），
**四个对话框与 Emoji 补全面板那一族在 `src/styles/overlay.css`**——2026-09-27 按 1000 行
规矩从 `app.css` 拆出），全部颜色与尺寸走 `src/styles/theme.css` 的变量。

### ⚠️ 全局口径：**界面文案一律中文，不中英混杂**

用户 2026-09-22 定的，原话：「注意不要像他一样中英混杂。」被举作反例的那份界面里，
「帮助」菜单除最后三行外全是英文，其余五个菜单却几乎全中文，
看着像"这几条是后加的、没来得及翻"。反例与逐项对照见 `docs/02` 的菜单小节。

落地要点：

- **专有名词照写原文**：`Markdown`、`LaTeX`、`Pandoc`、`Git` 是**名字**不是词，不算混杂。
- **品牌名照写**：`Nota`。
- **菜单项、按钮、提示语、空态文案一律中文**——本文下面每张表的「文案」列就是这些。
- ⚠️ **新加串时对着这条过一眼**。这条规矩此前只存在于习惯里、没写下来过；
  现状是干净的（`src/` + `src-tauri/src/` 全查过），**保持住靠的是一直查，不是查过一次**。
- ⚠️ **「一律中文」早就只管文档了**（2026-09-26 起界面就跟着语言走，2026-09-28 起
  **原文翻成了英语**）：代码里那句原文**写英语**，包一层 `t(...)` 去查
  `src/i18n/zh*.ts` 那张中文表；表里没有的键**原样用英文**（所以英语界面永远完整）。
  ⚠️ 于是今天代码里**不该再有中文的界面文字**——出现了就是漏网，
  `tools/i18n-check.sh` 第 ④ 栏拦这一条（`.tsx` 里没包 `t(...)` 的中文字面量算 FAIL）。
  覆盖账**现跑现看**（那个数随代码自己动）。
  ⚠️ 新加一句界面文字时，除了照上面几条挑词，还要**包上 `t(...)` 并同批往表里加一条**：
  没包的句子在英文界面下会露出中文，而它**不会**出现在"还没翻译"那张账里（那条账要求
  先有 `t("…")`）——所以 `tools/i18n-check.sh` 的 ④「硬编码中文泄漏」2026-09-26 起
  **计入 FAIL**（当天清掉最后两条真漏网：`FormatBar` 的 `aria-label`、`EditorPane` 的
  `正在准备编辑器…`）。

> ⚠️ **2026-09-27 补一条同族的口径**：插件在界面上**一律叫「拓展」**（用户原话：「我说过，这个功能统一为拓展」）——`plugin` 只留在代码里（英文才是主语言、中文是翻译包），所以「已装拓展」「拓展文件夹」这类词里**不再夹英文**；两个界面（右侧插件栏 / 设置里的「拓展」页）共用 `ui/pluginText.ts` 那一份文案。

### ⚠️ 全局口径二：**界面文案里的符号别带 `U+FE0F`（VS16）**

2026-09-25 实测。同一个"警告"符号有两种写法，差别只是末尾多不多一个
**变体选择符**（`U+FE0F`，VS16，意思是"按 emoji 画"）：

| 写法 | 码点 | WebKitGTK 里量出来的结果 |
|---|---|---|
| `⚠️` | `U+26A0 U+FE0F` | **占位但不画**：留出约 17px 空白缩进，**一个墨迹都没有** |
| `⚠` | `U+26A0` | 由 `Noto Sans CJK` 出**单色**字形，用文字颜色画——跟着主题走 |

判据是逐像素的：在深色壳的设置框上把那一块裁下来做直方图，**除了底色什么都没有**
（隔壁同宽的"有字"对照区最大亮度 235，它最大 235 的那个像素来自紧邻的汉字边缘）；
把那一块拉满对比度（`-level 10%,40%`）再看，仍然是纯底色。
⚠️ **顺带否掉了一个省事的解释**：本容器**不缺**能画这个码点的字体
（`fc-match ':charset=26a0'` 回 `Noto Sans CJK`，同一个容器里 `pango-view`
也能把它画出来）——所以**不是"没字体"，是 WebKit 取 emoji 呈现那条路**。
换成不带 VS16 的写法，同一处立刻画出三角形（截图核过）。

落地要点：

- **界面文案（`help=` / `Note` / 按钮 / 菜单）里一律写不带 VS16 的那个。**
  2026-09-25 已把九页设置里的 **28 处**（`src/ui/settings/panes/*.tsx` 六个文件）改掉。
- ⚠️ 这不只是"能不能看见"：**彩色 emoji 是一块不跟主题走的颜色**，
  而这个仓库的规矩是"一个写死的色值都不许有"（`theme.css` 文件头）。
  单色字形取 `currentColor`，深浅两套壳里都对。
- **源码注释里的 `⚠️` 不用动**（不画出来）。但新写文案时别顺手把注释里的写法
  复制进字符串——**这两个写法在编辑器里长得几乎一样**，肉眼分不出，只能靠工具查。
- `✓`（`U+2713`）这类单色符号本来就没这个问题，照用。
  ⚠️ 但它也露过一次同类脸：2026-09-24 菜单里的勾"不见了"，根因是**容器里没有字体覆盖
  `U+2713`**（那条记在 `docs/07` §4）——**同一个形状的两种成因**：一个缺字体，一个走错路。

---

## 1. 控件树

缩进表示 DOM 嵌套。带 `() 组件`的是独立文件里的 React 组件。
⚠️ 2026-09-23 起 `App.tsx` **不再内联任何组件**（`TopBar` / `TabBar` 拆去了同名文件，见 `02`），
所以这张树里不会再出现「内联」两个字。

⚠️ **树之外还有一层：原生窗口标题**（2026-09-25 起，`docs/07` §3 第 51 项）。
它不在 DOM 里、也不是哪个组件画的，是窗口管理器画的那条标题栏：
`{当前文档的 title}{有未保存改动时一个 ` •`} — Nota`，没开文档时就是 `Nota`。
落点是 `src/ui/useWindowTitle.ts`（`getCurrentWindow().setTitle()`）。
⚠️ 两处容易走错：①**改 `document.title` 没有任何用**——原生标题是建窗时的一份拷贝，
传不出去；②它取的是后端的 `title`（**和标签栏 §2.4 是同一个字符串**，
都来自 `derive_title()` 那四条回退），不是从 `path` 现取文件名——
否则同一份文档会在标签栏和任务栏上叫两个名字。
⚠️ 它一变会**牵动工装**：按「标题恒为 Nota」写的找窗口脚本失灵（`docs/06` §5.3 / §5.19）。

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
   │  │  │          VMark 那边最深也是一层；要加第二层先读 `MenuPopup.tsx` 的文件头
   │  └─ button.btn.toolbar-dock-toggle  「插件」     aria-pressed = dockOpen
   │                                   ⚠️ 靠 `margin-left: auto` 推到最右，没加 spacer 元素
   │
   ├─ div.app-body
   │  ├─ Sidebar                    (ui/Sidebar.tsx)  <aside class="sidebar">  ⚠️ 2026-09-30 起**一直在树上**：收起时是 `class="sidebar sidebar-collapsed"`（宽度 240→0 走 160ms，见 §2.2）
   │  │  ├─ div.sidebar-head
   │  │  │  ├─ nav.sidebar-tabs      role="tablist"   ⚠️ ←→/Home/End 挪焦点（不切换，`ui/useTablistKeys.ts`）
   │  │  │  │  ├─ TabButton          「文件」
   │  │  │  │  └─ TabButton          「大纲」
   │  │  │  （⛔ 2026-09-24 到 2026-10-11 之间这里有一颗 `button.sidebar-close`，
   │  │  │   用户 2026-10-11 让删掉：「**侧栏上面的 × 可以删掉**」——
   │  │  │   收起侧栏的入口仍然有两个：状态栏左端那颗圆圈、菜单「视图 → 侧边栏」）
   │  │  ├─ div.sidebar-body
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
   │  │  └─ SidebarResizer          (ui/SidebarResizer.tsx)  ⚠️ **必须是 `.sidebar` 的最后一个子元素**
   │  │     └─ div.sidebar-resizer   贴右缘的一条 6px 把手，`cursor: col-resize`
   │  │                              ⚠️ 它靠 `parentElement` 量这一栏的左缘（见 §2.2）
   │  │
   │  ├─ main.app-main
   │     ├─ FindBar                 (ui/FindBar.tsx)  仅 `findOpen` 时渲染
   │     │  │                       ⚠️ 带 `key={`find-${activeDoc.id}`}`：换文档 = 换条子（查询跟着清）
   │     │  │                       ⚠️ **前缀不能省**——同层里 EditorPane 那个 key 也是 doc.id，
   │     │  │                       撞键会让关掉的条子留在 DOM 里不消失（BUG-33，见 §2.2a 末）
   │     │  └─ div.find-bar[role=search]  > div.find-row × 2
   │     │     ├─ input.find-input    「查找」/「替换为」
   │     │     ├─ span.find-count     「N / M」或「无结果」（空查询时不画）。⚠️ **2026-10-07（第 95 项）**：正则写坏了的时候
   │     │     │                      这一格改成 **`Invalid regex`**（`.find-count[data-bad]`），输入框同时带 `data-bad`/`aria-invalid`
   │     │     │                      ——**当场认出来**，不再等 `new RegExp` 抛（那个异常此前被 `try` 吞掉、屏幕上什么都不说）
   │     │     ├─ button.find-toggle  「Aa」「全词」「.*」**「✻」**，data-on 表示按下
   │     │     │                      ⚠️ 「✻」是**通配符**（2026-10-16 加，朋友清单第 9 条）：`*`
   │     │     │                      配任意多、`?` 配恰好一个；它与「.*」（正则）**互斥**
   │     │     ├─ button.find-btn     「↑」「↓」「✕」
   │     │     └─ button.find-btn-wide 「替换」「全部替换」
   │     │
   │     ├─ FormatBar                (ui/FormatBar.tsx)  仅 `formatBarOpen` 时渲染
   │     │  └─ div.format-bar → button.fmt-btn  × N ＋ **button.format-bar-close**（末尾那颗「×」）
   │     │     ⚠️ 高亮（data-on）只在所见即所得下有意义；源码模式下整条不画高亮
   │     │     ⚠️ 每颗按钮的 `title` 与 `aria-label` 是**同一句**「名字（快捷键）」，**渲染时**才翻
   │     │        （`TITLES` 那张表在**组件体里**逐条 `t(...)`，括号由 `提示()` 拼——中文全角、英文半角；那是排版，不入表）
   │     │     ⚠️ 那颗「×」**在 `.format-bar` 里面**（不是外面另起一条），靠 `position: sticky; right: 0`
   │     │        钉在右端——这一条是 `overflow-x: auto` 的，跟着内容滚出去的话，"按钮太多"的时候反而找不着它（§2.3）
   │     │
   │     ├─ EditorPane              (ui/EditorPane.tsx)   有活动文档时
   │     │  │                       ⚠️ 外壳是 div.editor-pane-<mode>，三种模式摆的格子不同
   │     │  ├─ div.editor-loading    「正在准备编辑器…」（ready=false 时才有）
   │     │  ├─ div.editor-mount      **React 永不往里渲染**，Milkdown 或 CodeMirror 独占
   │     │  │                        （⚠️ **只在开了「限制正文宽度」时**才有内联 --content-width；
   │     │  │                         默认不写 ⇒ 正文列铺满编辑区，2026-10-09）
   │     │  │                        wysiwyg → Milkdown ／ source、split → CodeMirror
   │     │  └─ div.editor-mount.editor-preview   **只有 split 才有**，只读的 Milkdown
   │     │                            ⚠️ 不给 --content-width（那一半本来就窄）；aria-readonly
   │     ├─ Home                    (ui/Home.tsx)         没有活动文档时
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
   │     │
   │     ├─ TabBar                  (TabBar.tsx)    仅 docs.length > 0 时渲染
   │     │  └─ div.tabbar[role=tablist] → div.tab[role=tab]   ⚠️ ←→/Home/End 挪焦点不切换（第 50 项；切一次要重挂编辑器）
   │     │     ├─ button.tab-label         （.tab-dot 小圆点 + 文档标题）
   │     │     └─ button.tab-close         「×」
   │     │
   │     └─ StatusBar               (ui/StatusBar.tsx)  <footer class="statusbar">
   │        ├─ span.status-left       两枚按钮：侧栏开关（○ / ‹）＋ 源码↔所见即所得（`</>`）
   │        └─ span.status-right      FocusMeter（只在强制专注跑着时画）＋ 一个字数列
   │           │                      ⚠️ 字数那一格的详情走 `title`（悬停才看）
   │           └─ button.status-btn.statusbar-close  「×」（**最右端**，2026-10-04 补，§2.5）
   │                                  ⚠️ **它是 `.status-right` 的最后一个孩子**，不是 `footer` 的第三个孩子
   │                                  ——这一栏是 `justify-content: space-between`，加第三个孩子会把字数那一格
   │                                  从右端挤到中间去
   │                                  ⚠️ 它**不跟** `.status-aux` 那一族（不是悬停才出现的）：关掉这一栏是这一栏的正事
   │
   ├─ PluginDock                    (ui/PluginDock.tsx)  <aside class="plugin-dock">
   │  │                              ⚠️ `dockOpen` 为 false 时**整个不渲染**
   │  ├─ nav.dock-head
   │  │  ├─ span.dock-title           活动页的标题（面板的 `title`，或「插件」）
   │  │  │  （⛔ 这里原有 `button.dock-close` 那颗「×」，用户 2026-10-11
   │  │  │   让删掉：「**拓展的哪个叉也可以关掉**」——收起插件栏的入口仍然是
   │  │  │   菜单「视图 → 插件栏」与右上角那颗 `Extensions`）
   │  ├─ nav.dock-tabs                (role=tablist) ⚠️ ←→/Home/End 挪焦点（第 50 项）；**2026-09-24 新增**：一页签一个插件
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
   │     ├─ h4.dock-subtitle.dock-subtitle-row  「已装插件」＋ button.plugin-install「从文件安装…」
   │     ├─ p.sidebar-empty            「没有装插件。用上面的「从文件安装…」装一个。」
   │     ├─ ul.plugins → li.plugin.plugin-{state}
   │     │  ├─ div.plugin-head > span.plugin-name / span.plugin-version
   │     │  ├─ div.plugin-id → span.plugin-origin（「自装/内置 · 已验证/未知签名者/未签名」）
   │     │  ├─ p.plugin-desc          （有 description 才渲染）
   │     │  ├─ p.plugin-error         （有 error 才渲染，标红）
   │     │  ├─ div.plugin-caps > span.cap  × N
   │     │  └─ div.plugin-actions     （.plugin-action；「卸载」那颗带 .plugin-action-danger）
   │     └─ section.dock-trust         （信任表非空才渲染，2026-09-25）
   │        ├─ h4.dock-subtitle       「已信任的签名者」
   │        ├─ p.dock-hint            「这些指纹签的包都当成「已验证」…」
   │        └─ p.trust-row → span.trust-key（指纹，等宽）/ span.trust-name
   │
   ├─ (PandocPanel)                 (ui/PandocPanel.tsx)  仅 `pandocGate` 非空时渲染
   │  └─ div.confirm-backdrop > div.confirm-dialog.gate-panel
   │     ├─ h2.confirm-title          「导出 ⟨格式名⟩」
   │     ├─ div.gate-status → span.gate-mark（✓/!/?/转圈）+ p.gate-message
   │     ├─ pre.gate-detail           后端给的原文（`command not found` 之类），空则不画
   │     ├─ dl.gate-facts             命令 / 版本 / 排版引擎（后两行按条件画）
   │     └─ div.confirm-actions
   │        ├─ div.gate-side          「重新检测」＋（主按钮不是「仍然试一次」时）「仍然试一次」
   │        ├─ button.btn              「取消」
   │        └─ button.btn.btn-primary  主按钮（按状态换，见 §2.6e）
   │
   ├─ (SettingsDialog)              (ui/settings/SettingsDialog.tsx)  仅 `settingsOpen`
   ├─ (ImageDialog)                 (ui/ImageDialog.tsx)  仅 `imageReq` 非空（2026-09-26）
   │  └─ div.confirm-backdrop > div.confirm-dialog.prompt-dialog（⚠️ **复用提示框那套类**）
   │     ├─ div.image-src-tabs[role=tablist] → button × 2   「本地文件」/「网络地址」
   │     │     ⚠️ 是**两个页签**（选中的那颗带 `.btn-primary`），不是下拉
   │     ├─ label.prompt-label + div.image-src-row
   │     │     ├─ input.prompt-input   本地那页是路径、网络那页是网址（**同一个 state**，
   │     │     │                       placeholder 与标签跟着换；空着提交 = 取消）
   │     │     └─ button.btn「浏览…」  ⚠️ **只在「本地文件」那页画**，走插件对话框选文件
   │     │                             （过滤器 8 种后缀，见 `docs/03` §9.1）；选完顺手用
   │     │                             文件名去掉后缀补进替代文字（**只是默认值**）
   │     ├─ label + input              替代文字（可留空，两页共用）
   │     ├─ p.prompt-hint              「插入后怎么落地看『设置 → 图像 → 插入图片时』」
   │     │                             ＋**文档没存过盘时多一句**（那四个"复制到…"要文档目录，
   │     │                             宿主会报错，先说出来比让用户撞一次好）
   │     └─ div.confirm-actions → button.btn「取消」+ button.btn.btn-primary「插入」
   │        ⚠️ 「插入」**不置灰**：地址空着点它 = 取消（同 `PromptDialog` 那条口径）
   │        ⚠️ `Esc` / 点遮罩 = 取消；`Enter` = 提交（都只挂在输入框自己身上）
   │
   ├─ (LinkDialog)                  (ui/LinkDialog.tsx)  仅 `linkReq` 非空（2026-10-07，第 96 ＋ 102 项）
   │  └─ div.confirm-backdrop > div.confirm-dialog.prompt-dialog（⚠️ **复用提示框那套类**）
   │     ├─ h2.confirm-title「超链接」
   │     ├─ label.prompt-label「链接显示名称」+ input#nota-link-label.prompt-input
   │     │     ⚠️ **挂载即聚焦并全选**（里面填的是**已有的那一条**，用户多半只改一个词）
   │     ├─ label.prompt-label「链接地址」+ input#nota-link-href.prompt-input
   │     │     ⚠️ **主字段是这一个**：地址空着点确定 = **取消**（一个点不动的空链接
   │     │        在正文里看不出坏）；「显示名称」空着是**正常**的（会用地址顶上）
   │     └─ div.confirm-actions → button.btn「去掉链接」（**只在编辑已有链接时画**）
   │                                + button.btn「取消」+ button.btn.btn-primary
   │                                  （新建时写「插入」、编辑时写「确定」）
   │        ⚠️ 「去掉链接」是**第三条路**：文字留着、只摘掉链接标记
   │        ⚠️ `Esc` / 点遮罩 = 取消；`Enter` = 提交（都只挂在输入框自己身上）
   │        ⚠️ **它自己不碰编辑器**：怎么写全在 `editor/link-edit.ts`
   │
   ├─ (EmojiDialog)                 (ui/EmojiDialog.tsx)  仅 `emojiOpen`（2026-09-27）
   │    （脚注没有框：`para.footnote` 是一条**不弹窗**的命令，见 `editor/footnote.ts`）
   │  └─ div.confirm-backdrop > div.confirm-dialog.emoji-dialog
   │     ├─ h2.confirm-title「插入 Emoji」
   │     ├─ input#nota-emoji-search.prompt-input  搜索框（`onChange` 即筛，挂载即聚焦）
   │     ├─ div.emoji-cats[role=tablist] → button.btn.emoji-cat × 12
   │     │     ⚠️ 「全部」＋ 11 个分类；当前那一颗带 `.btn-primary`。
   │     │     不摆「全部」的话，进了某个分类就出不来（只能关掉框重开）
   │     ├─ 二选一：div.emoji-grid → button.emoji-cell × N
   │     │           （`span.emoji-glyph` 字符 ＋ `span.emoji-name` `:短代码:`）
   │     │         ／ p.prompt-hint「没有匹配的 Emoji。」（筛空时）
   │     └─ div.confirm-actions → button.btn「取消」
   │        ⚠️ **回车 = 选第一条**（⚠️ **没有**"上下键高亮"这一层，理由在文件头）；
   │           点某一格 = 选那一条；`Esc` / 点遮罩 = 取消
   │        ⚠️ 它**只回一个字符**，插到哪儿由 `App.tsx` 的 `插入Emoji` 交给
   │           `run("insertText", …)` —— 框里不碰文档
   │        ⚠️ 这里的**搜索是子串 `includes`**，与编辑区那块补全面板的"只做前缀"
   │           **故意不一致**（理由写在 `ui/EmojiDialog.tsx` 文件头）；搜索串两头
   │           各去掉一个冒号（用户很自然会带着 `:` 打）
   │
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
   └─ Toasts                        (ui/Toasts.tsx)  仅 items 非空时渲染
      └─ div.toasts[role=status] → div.toast.toast-{level}
         ├─ span.toast-message
         └─ button.toast-close      「×」
```

⚠️⚠️ **2026-09-30：标签栏与状态栏从"应用最底下两条横条"挪进了 `main.app-main`**
（用户拿着 Typora 的截图说「注意下方变化」）。原来它们在 `div.app-body` **之后**、横跨整个窗口宽度；
现在它们只横跨**正文那一列**，左边让给侧栏、右边让给插件栏——**所以侧栏和插件栏现在一直
垂到窗口底边**，而标签栏/状态栏停在它们中间那一段。三件事跟着变：

- `.app` 仍是竖向 flex（zen-top → app-body → …），**但底下那两条不再是它的孩子**，
  而是 `.app-main` 的**最后两个**孩子（`App.tsx` 里作为「底部」那个槽传给 `EditorArea`，
  见 §2.4）。⚠️ 节点是在 `App.tsx` 里造的、画在 `EditorArea` 的 `<main>` 里——因为
  `<main>`（带 `data-review` 和悬停取词那个 ref）是 `EditorArea` 画的，谁画 `<main>`
  谁才有权往里塞孩子。
- **专注模式那两条 CSS 仍然有效**：`.app[data-zen="true"] .tabbar/.statusbar { display: none }`
  是**后代**选择器，孩子搬了位置还是后代。⚠️ 但 `.app-main[data-review="true"] > …` 那一组
  （`styles/review.css`）是**直接子元素**排除法——最后两个孩子没在排除名单里，
  **所以预览态下它们照画**，这是有意的（预览的是正文，不是把下栏也藏了）。
- ⚠️ **`.tabbar` 的 `border-top` 方向没变**，它上面现在是正文；边框那一行不用动。
  ⚠️ 但 `.sidebar` / `.plugin-dock` 的**高度现在由 `app-body` 决定到窗口底**，
  它们自己那条右边框也跟着长到底——这是"看起来像 Typora"的一部分，不是漏改。

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
，**但它一个 `disabled` 标志位都没有**。判据是：

```
App.tsx 的 menuHandlers 里有没有这个 id ──有──> 能点
                                        ──没有─> 灰
```

这条规矩的理由写在 `commands.ts` 文件头：**手写的标志位一定会腐坏**
（加实现忘了翻标志、翻了标志实现早删了，两种都不报错，只让界面撒谎）。
用"有没有处理函数"当判据则**不可能不一致**：界面永远不会声称一个它做不到的能力。

**内置能点的就是 `menuHandlers` 那 87 条，一条不多**（**2026-09-27 晚现数**——数法是
把 `useCommandTable.ts` 里那个 `return {…}` 的键抠出来去重，**先去注释**：`87 = `
`para 26 ＋ view 21 ＋ file 20 ＋ fmt 12 ＋ edit 7 ＋ help 1`；上一次 2026-09-27 早些时候
数的 78、2026-09-25 的 65、2026-09-24 的 60 都是当时的值——**每一次都是加过东西才涨的**，
所以这个数**要写就现数，别照抄**）。⚠️ 那 87 条**不含**两类：插件合成的那批
（`__plugin:…`）与运行时现生成的「最近文件」条目（`ui/recentMenu.ts`）——
它们不在这个字面量里。
📌 **2026-09-24 起还要加上插件声明的那几条**（`ui/pluginMenus.ts` 合成的
`__plugin:<插件>:<命令>`，见下面那一栏）：

| 栏 | 能点的 id |
|---|---|
| 文件 | `file.new` · `file.open` · `file.openFolder` · `file.reload` · **`file.rename` · `file.move`**（2026-09-27，`docs/10` §1「文件重命名 / 移动」——⚠️ **这一栏里唯一两条真的会动磁盘上文件名的**，其余动的都是内容）· `file.save` · `file.saveAs` · `file.close` · `file.preferences` · **`file.exportHtmlPlain` · `file.exportHtmlStyled` · `file.print`**（2026-09-24） |
| 编辑 | `edit.undo` · `edit.redo` · `edit.copyAsMarkdown` · **`edit.findReplace`**（2026-09-24） |
| 段落 | `para.h1`…`para.h6` · `para.text` · `para.table` · `para.codeBlock` · `para.quote` · `para.ol` · `para.ul` · `para.task` · `para.hr` · **表格十条**（`para.tableRowAbove`…`para.tableAlignRight`，2026-09-24）· **`para.footnote`**（2026-09-27，**无加速键**——它一次动两处并把光标带到文末，是「写完一段回头补注」的动作，不在打字流的手指上）· **`para.toc`**（2026-09-27，「内容目录（TOC）」；**无加速键**。⚠️ **亮不亮看整篇有没有标题**——判据是 `command-state.ts` 的 `hasHeadings`（本表唯一一处看整篇文档的判据，只扫顶层），不是命令自己判：判在命令里的话菜单会亮着、点下去没反应。⚠️ 再点一次 = **原地更新**，不是插第二份） |
| 格式 | `fmt.bold` · `fmt.italic` · `fmt.code` · `fmt.strike` · **`fmt.link` · `fmt.image` · `fmt.clear`**（2026-09-24）· `fmt.superscript` / `fmt.subscript` / `fmt.highlight` / `fmt.underline`（2026-09-27）· **`fmt.emoji`**（2026-09-27，**无加速键**——挑一个字符不值得占一个全局键位） |
| 视图 | `view.toggleSidebar` · `view.outline` · `view.fileTree` · `view.toggleDock` · **`view.toolbarAlways` · `view.toolbarHover` · `view.toolbarNever`**（2026-09-25 起把原来那条 `view.formatBar` 换成三档子菜单）· `view.statusBar` · **`view.menuBar`**（2026-09-28 加，`Alt+M`——⚠️ **它是本栏里唯一"藏起来之后自己也点不到"的那一条**，所以键位不是可选的；理由见 §3 外观页那一行与 `ui/useChromeVisibility.ts` 文件头） · **`view.zoomIn` · `view.zoomOut` · `view.zoomReset`**（2026-09-27 加） · **`view.focusMode` · `view.typewriter`** · `view.fullscreen` · `view.modeWysiwyg` · `view.modeSource` · `view.modeSplit` |
| ⚠️ 视图这一栏的**分段**（2026-09-27 用户点名要的那条线，2026-10-04 挪过两条） | 线上面管**「外壳上画出什么」**（侧栏那一族 ｜ 插件栏 · 格式化工具栏 · **状态栏 · 菜单栏**），线下面管**「正文那一块怎么呈现」**（三种编辑模式 / 只读 / 专注 / 打字机）。⚠️ **`view.statusBar` 与 `view.menuBar` 原来夹在「打字机模式」与「全屏」中间**（即下面那一段里），2026-10-04 第 49 项挪上来了——理由与那张测试（`tests/bar-close.test.ts` 组三）写在 `ui/commands.ts` 那段注释里。⚠️ **往这一栏加东西之前先想清楚它属于哪一组**：插错边那条线就变成一条没有意义的横杠 |
| 主题 | **动态**，不经 `menuHandlers`：**文档主题**（内置三套 + 用户目录里的）+ 「无主题（内置）」+ 「打开主题文件夹…」 |
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

⚠️ **2026-09-28 起「粘贴」那一侧多了一层自己的拦截**（`src/editor/paste.ts`，见
`docs/05` §4.19）——**它不是命令、不进这张表**，而是在 ProseMirror 的
`handlePaste` 上抢在 `@milkdown/plugin-clipboard` **前面**问一句：剪贴板里
是不是一条网址 / 一段 HTML / 一段代码？⚠️ **顺序是这件事的全部**（PM 按插件顺序问
`handlePaste`，第一个返回 `true` 的赢，而上游那条**总会**返回 `true`）——
「粘贴 Markdown 源码 → 富文本」这条上游行为**原样留着没动**。

⚠️ **同栏里 2026-09-25 起只剩「图片…」和「其他格式…」两项是灰的**，`menuHandlers`
里没有键——**不是漏了**：图片要一个光栅渲染器（pandoc 给不了），「其他格式…」那个入口
还没定。PDF / Word / ODT / RTF / LaTeX / Epub / OPML **那七项已经接上了**——借系统里
那个 pandoc（点下去先探测，见 §2.6e 与 `ui/useExport.ts`），Nota 不相它内嵌也不下载它。
⚠️ 打印那条**不是"在应用里打印"**：它是"导出含样式的那份 + 交给系统默认程序打开"，
提示里把两步都说清楚了。见 §6 与 `docs/10` §3。

⚠️ **`fmt.clear` 与表格那十条在源码模式下给的是"没反应"**
（`runCommand` 返回 `false`）：CodeMirror 那边没有文档树，这些做不出来，
`App.tsx` 会 toast 一句「当前编辑模式下还没有这个操作」而不是静默什么都不做。
⚠️ **`fmt.link` 原来也在这张名单里，2026-10-07 起不在**：源码模式那侧补了
`linkSet` / `linkRemove` 两个 `case`（写 `[名称](地址)` / 摘掉那一对括号），
调的是与所见即所得**同一组纯函数**（`editor/link-edit.ts`）。
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

⚠️ **「点开的」与「划过切过来的」不是一回事（BUG-17，2026-09-25 修）**：
菜单开着时划过另一栏就切过去，**所以"点某一栏"那一刻它常常已经开着了**。
早先按"开着就收起"处理，于是从别的栏点过来的人**第一下把菜单整个关掉**、
得点两下；带子菜单的父项（`文件 → 导出` / `导入`）是同一个毛病。
现在**只有"点开的"才被点击收起**，划过／方向键切过来的那一击算**确认**。
⚠️ 判据是两帧像素差，配方见 `docs/06` §5.18。

✅ **`accel` 既是提示也是真绑定**（2026-09-23 起）。上面这句曾经是真的，
现在反过来了：`accel` 是唯一真源，`App.tsx` 照着它派发。写错 `accel` 的
症状因此变成——**菜单上显示的那个键不灵，而另一个键开始干这件事**。
这就是要它在构建时告警的原因（重复键位、muda 认不出的写法都 `console.warn`）。

⚠️ **`isOutsideEditor` 的边界：它只认"正文之外"**（2026-09-26，BUG-37 那次目检的副产物）。
判据是 `el.closest(".editor-pane") ? false : …`——**编辑器里那颗 `Ctrl+A` 不归它管**，菜单表里也**根本没有 `Ctrl+A`**（只有 undo/redo/cut/copy/paste 那一族）。
⚠️ 别顺手把它改成"编辑器里的 `input`/`textarea` 也算外面"：**那会连源码框里的 `Ctrl+S` 一起废掉**（在公式源码框里改完按保存——状态栏停在"已修改"、磁盘一字未动，实测过、当天撤销）。⚠️ 那是 2026-09-24 的现场记录：**判据一个字没变，但"已修改"那个点 2026-09-30 起画在标签页上**（`.tab-dot`），不在状态栏了（§2.5）

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
把系统复制吃掉，灰着的 `⌥↑/⌥↓` 会把段落导航吃掉。这一条是实际发生过的。

⚠️ **原生菜单的 id 与自绘菜单是同一套字符串**（`file.save` 这种），
所以 `resolvePick(id)` 两边通用——**原生那套不另起一套 id**。

⚠️ **原生菜单的文案是"推的那一刻"翻的**（2026-09-26 补记）。`ui/nativeMenu.ts` 是一串
**纯函数、不是组件**，所以它用**模块级**那个 `t`：菜单树在 `ui/useMenus.ts` 那个 effect 里
建一次、`api.nativeMenu.apply()` 推过去，**建完就定住了**——语言换了它不会自己重推。
那笔欠账结在**依赖**上：推菜单那条 effect 的依赖里加了 `use语言()`（`i18n/index.ts` 里
那个"**把语言当依赖**"的 hook；它与 `useT()` 是两件事——前者不画字、只让 effect 重跑，
后者是"要画字"用的，顺手把订阅做了）。今天语言还要**重启**才生效，所以这条依赖**此刻**
推不出差别；它挡的是**以后热切语言**：漏掉它的症状是"窗口里已经换语言、原生菜单栏还停在
旧语言"，而那种地方没人会想到去查依赖数组。

### 2.1d 右键菜单（`ui/ContextMenu.tsx`）—— 2026-10-04 起**整个接管**

**要改的那份菜单不是我们画的。** 右键任何地方弹出来的那份
`Cut / Copy / Paste / Paste As Plain Text / Delete / Select All / Insert Emoji /
Font ▸ / Insert Unicode Control Character ▸ / Inspect Element` 是 **WebKitGTK 自己的**：
文案来自 WebKit 的 gettext 目录、由**进程 locale** 决定，和 Nota 自己的语言设置
（`src/i18n/`）**一点关系都没有**。⚠️ **把界面语言设成中文，原生菜单不会变中文**——
这一条写在这里是免得下次有人往那个方向查。想让它变中文只有一条路：**整个拦掉、自己画**。

仓库里**拦得住**这件事早有先例（`ui/TabBar.tsx` 的 `onContextMenu`，注释原话是
「不拦的话 WebKitGTK 会弹出它自己那份默认菜单」），本批只是把这个做法推广到全应用。

**分流：一个监听、四档**（判据在 `ui/context-menu.ts::判落点`，**纯函数、不 import React**）

| 档 | 判据 | 表现 |
|---|---|---|
| **不弹** | 落在**已经有人认领**的地方（目前只有标签栏，`TabBar` 自己在冒泡阶段处理右键） | ⚠️ **既不 `preventDefault` 也不画菜单**——监听挂在**捕获相位**、TabBar 在**冒泡相位**，捕获先跑，拦了就把它饿死，用户看到的是"右键标签什么都不出" |
| **输入框** | 目标是 `input` / `textarea` | 短菜单：撤销 / 重做 / ─ / 剪切 / 复制 / 粘贴 / ─ / 全选（**纯文本行，不画图标**） |
| **编辑器** | 目标在 `.editor-pane` 里（含 `.ProseMirror` / `.cm-editor`） | 全量菜单（见下） |
| **外壳** | 其余（侧栏、插件栏、面板空白…） | **只拦不弹** |

⚠️ **`输入框` 必须排在 `编辑器` 前面**，不是随手排的：**公式源码框 / 图表源码框 /
代码块语言框都是 `.editor-pane` 里的 `input` / `textarea`**——顺序反了它们会掉进编辑器那一档，
拿到一份跟正文有关的菜单（`docs/02` 的 `ui/accel.ts` 那条也是同一个坑，2026-09-26 踩过）。

⚠️ **`不弹` 与「外壳」的区别是"谁负责拦"**：外壳是我们拦下、只是不画；`不弹` 是我们
**连拦都不拦**，交给原来那个处理者。两者都要有，不能合并。

**编辑器那一档长什么样**（照 Typora 那份参考，但只放 Nota **真有**的动作）

```text
┌──────────────────────────────────┐
│  ✂  ⧉  📋  🗑      ← 剪切 复制 粘贴 删除
│  复制为                          ▸ │  → Markdown / 纯文本 / HTML
├──────────────────────────────────┤
│  B  I  </>  🔗     ← 加粗 斜体 行内代码 链接
│  ❝  •≡  1≡   ☑     ← 引用 无序 有序 任务
├──────────────────────────────────┤
│  段落                            ▸ │  → H1..H6 / 正文 / 引用 / 三种列表 / 代码块
│  插入                            ▸ │  → 表格 图片 链接 公式块 代码块 分割线 脚注 目录 Emoji
└──────────────────────────────────┘
```

- **图标行不是另画一套**：读的是 `ui/FormatBar.tsx` 那张**模块私有**的 `按钮` 表
  （所以图标、字形、**亮不亮**和工具栏一字不差——光标在加粗里时那个 B 是亮的）。
  ⚠️ **只读它的 `icon` / `按钮亮着` / `字形类` / `提示`**，**绝不读 `cmd`**：`cmd` 是
  `onCommand` → `EditorCommand` 那条路，和这里用的 `menuHandlers` 是**两条不同的路**，
  混了就是"点了没反应"。
- **灰不灰由外面给**（`disabledCommands`，同菜单栏那一份）——菜单自己**不判第二遍**：
  判两遍必然有一天对不上。
- **「段落」/「插入」两份子菜单的 id 全部是 `MENUS` 里已有的**，没有新命令。
  ⚠️ 仓库里**没有"插入"这个顶层菜单**，那一份是**右键菜单独有的组合**，和菜单栏不对齐是有意的。
- **开发模式多一条「开发者工具」**（`import.meta.env.DEV` 为真时）——原生菜单里那条
  `Inspect Element` 被我们拦掉了，得给开发时留个门。**正式构建里没有这一条。**

**输入框那一档**（`ui/ContextMenu.tsx::落到输入框`）：撤销/重做/全选用输入框自己的
`document.execCommand("undo"/"redo"/"selectAll")`（它们在输入框上是标准行为，没有替代品）；
复制/剪切走 `src/editor/code-block.ts` 的 `写剪贴板()`——⚠️ **全仓唯一一条写剪贴板的路，
不许另写第三条**（它自己那条头注写着"两条路各写一份就是同一个动作两个结果"）；
⚠️ **剪切是先写进剪贴板、成功了再删**，顺序永不颠倒——反过来的话剪贴板那条路一失败，
**用户的内容就没了**。粘贴读不到剪贴板时**退成提示「请按 Ctrl+V」**（沿用 `useClipboard`
那句话，不造第二句）。

⚠️ **输入框那一档拿的灰名单和别的档不一样**（`ui/context-menu.ts::这一档的灰`，2026-10-04
开窗口检抓出来的缺陷）：菜单栏那份 `disabledCommands`（`ui/useMenus.ts`）的判据是"命令表里
有没有这一条"，而输入框那六条**根本不过命令表**——它们住在 `ContextMenu.tsx::落到输入框`。
两把尺子量两件事，叠上去的后果是 **`edit.select`（全选）被画成灰的**，而它明明有实现、点得动
（它**按设计**没接进命令表：编辑区里的全选走 ProseMirror 原生那套）。⚠️ 键盘也受影响——
`findEdgeEnabled` 会跳过灰项，`End` 于是落在倒数第二项 `Paste` 上。
**所以输入框那一档一个都不灰，其余三档原样透传那份名单。**
📌 **2026-10-07：`edit.select` 在编辑菜单里长成了子菜单父项**（选择当前行/词/句 ＋ 删除当前词那四条），
而输入框这一档要的仍是**全选那一条**。所以 `ui/context-menu.ts::条目行` 多了第三个参数
**`摊平`**——把子菜单的壳摘掉、只留父项自己那一条（`条目行(输入框条目, "输入框", true)`）。
⚠️ 不摊平的后果**不是报错**：输入框上右键会飞出一层「选当前词」这种**编辑区命令**，
点了什么也不会发生（那四条的处理函数只认编辑区）。⚠️ 摊平的是**结构不是名字**：
标签与 id 仍然从 `MENUS` 里取。
⚠️ 同一个道理还有第二种情形，只是还没撞上：`edit.undo` / `edit.copy` 那一族带 `needsDoc`，
**没打开文档时整族都是灰的**——可那时候设置面板里的输入框照样打得开、照样该能撤销。

⚠️ **输入框那一档的三条 `execCommand` 有一条会毁文档，所以加了守卫**（同日开窗量到）：
在代码块的语言搜索框里让「全选」落地，**整篇正文被选蓝**——再打一个字就是全篇替换。
根因是那一刻焦点没还成（见下一条：语言选择器把输入框卸载了），`execCommand` 就作用在
别处。修法是 `ui/ContextMenu.tsx::还焦` **返回布尔**，`undo` / `redo` / `select` / 剪切 /
粘贴**先问这一句，没还成就什么都不做**。⚠️ 这是一道**守卫**、不是新退路：正常情形一个字没变。

**键盘路径**：↑↓ 在行与行之间走（`ui/useMenuRovingFocus.ts`，线性漫游）；
**一整排图标算一个落点**，行内 ←→ 走格子（`行内下一格`，**不绕回**）、Home/End 到两端；
Enter 执行、Esc 关、← 退回上一层子菜单。⚠️ 之所以要这么绕：那个 hook 是**线性**的，
塞不下"一行四颗、←→ 在行内走"。子菜单只有**一层**，和 `MenuPopup` 一致。

⚠️ **菜单开着时，代码块的语言选择器要让路**（`editor/lang-picker.ts::全局按键` 顶部那一句
`document.querySelector("[data-context-menu]")`，2026-10-04 开窗量到）：那个选择器的按键监听
挂在 **`document` 的捕获阶段**，比菜单这一层（React，监听在根容器、**冒泡**阶段）**先**收到键，
量到过两个后果——`Enter` 被它先收下（顺便把输入框卸载，接上上一条那个"会毁文档"的后果）、
`Esc` **把选择器和菜单一起关掉**（用户以为只关了上面那层）。
⚠️ `[data-context-menu]` 是"这一下属于右键菜单这套浮层"的统一标记（`ui/useModalTrap.ts`
认的也是它）：本体与 portal 出去的子菜单各挂一个。

⚠️ **「外壳只拦不弹」是用户 2026-10-04 明确选的**（另两条选项是"弹一份大半置灰的最小菜单"
与"顺带做文件树的重命名/删除"）。**代价如实说：右键侧栏会"什么都不发生"。**
这不是漏做——那些位置**现在没有任何右键动作**可给，文件树那一族是另一个功能
（`docs/07` 第 77 项）。

⛔ **本批明确不做**：**「粘贴为纯文本」**（Typora 那栏里有，Nota 没有这个能力——
`ui/useClipboard.ts` 只能读写文本/HTML）。放一条永远灰着的，不如不放。
📌 **2026-10-07 补**：这一条**做了**（`edit.pastePlain`，`Ctrl+Shift+V`，编辑菜单里那一行）。
⚠️ 实现上它走 `edit.paste` **同一条路**（`剪贴板.粘贴()`）——因为本应用的粘贴本来就只进纯文本
（Milkdown 的剪贴板插件没有 `clipboardParser`），当年"没有这个能力"指的是**不能区分**两种粘贴。
留这一条是因为那颗键是肌肉记忆。⚠️ 在 WebKitGTK 上它会弹「系统不允许从菜单读剪贴板，
请按 Ctrl+V 粘贴」——那是环境把 `navigator.clipboard.readText()` 关了权限，
**不是这一条没做**（写剪贴板那条路是通的；实测见 `docs/06` §5.55）。

📌 **三档各配一份反证目检（右键输入框 / 右键侧栏 / 右键标签）2026-10-04 当天就拍过了**，
实拍账（含开窗抓出并修掉的六条缺陷、四条 `execCommand` 的逐条结果、以及**仍然没量到的**
那一节）在 `docs/06` §5.54。⚠️ **没量到的不许当成已验**。

### 2.1e 错词上右键多出来的**最前面那一段**（2026-10-11）

```
┌──────────────────────────────────┐
│  hello                           │  ← 建议（`nota_spell_suggest` 现拉的，0~N 条）
│  ──────────────────────────────  │
│  Add to dictionary               │  ← 落盘：`dictionaries/user-words.txt`
│  Ignore                          │  ← 只在本次运行里有效
│  ──────────────────────────────  │
│  ✂  ⧉  📋  ⊗                     │  ← 下面是原来那一份，一个字没动
│  Copy As                        ▸│
│  …                               │
└──────────────────────────────────┘
```

**判据是 DOM 上的类名，不是编辑器那边的回调**：波浪线是
`Decoration.inline(…, { class: "nota-spell-error" })`（`editor/spell-check.ts`），
ProseMirror 把它渲染成一个真的 `<span>`，所以 `ContextMenu.tsx` 那句
`el.closest(".nota-spell-error")` 就认出来了。⚠️ 走回调那条路在这里**行不通**：
这个监听挂在 **window 捕获阶段**，比编辑器 DOM 上任何监听都先跑——菜单已经开完了，
编辑器那边才醒。⚠️ 还有个更根本的理由：菜单上那几条命令的 id 是**现场造出来的**
（`spell.replace:2` 说的是"这一刻那一列建议里的第 2 条"），它**没法进 `MENUS`**
（那张表的形状是 `id → () => void`，说不出来"哪一个词"）。

⚠️ **三个动作里有一对必须分开**：「加入词典」写盘、以后一直算对；「忽略」只在本次运行里
有效（重开软件照旧标）。并成一个的话用户点哪一次都是**猜**，而两个方向都很难自查——
"我明明忽略过，怎么又标上了" / "我说的是这个词是对的，怎么换个文档又标上了"。

⚠️ **两个动作名是调用方翻好递进来的**（`t("Add to dictionary")` 写在 `ContextMenu.tsx`
里），而**建议那几条原样用、不过 `t()`**：那是从词典里查出来的真词不是文案——哪天某个
建议恰好等于一条界面原文（`Ignore` 这种真词完全可能存在），过一遍翻译就会把它翻成别的。

⚠️ **建议是异步来的**（过一次 IPC ＋ 一次词典查询）：菜单先按"没有建议"那一版画出来
（两个动作**当场**就能点），拿到之后再补上最前面那一段。⚠️ 用户可能在这中间把它关掉，
所以那次 `setState` 要判"现场还在不在"。

⚠️ 拼错的那个词本身**不画出来**（菜单就弹在它上面），**一条建议都没有时不画空格**
（底下空空如也看着像坏了）。这两条判据在 `tests/context-menu.test.ts` 的「拼写」那一组里。

### 2.2 侧栏（`Sidebar`）

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 收起 | 「×」`title="收起侧边栏"` | `onClose()` → `App.tsx` 的 `setSidebarOpen(false)` | ✅ 2026-09-24 补。⚠️ **只收不切**；与「视图 → 显示/隐藏侧边栏」、`Ctrl+Shift+L` 共用 `sidebarOpen` 一份状态 |
| **开合那 160ms**（2026-09-30） | 没有新控件——是收起/展开这个动作本身 | `sidebarOpen` 一变 → `App.tsx` 传的 `折叠={!sidebarOpen}` → `<aside>` 挂上 `.sidebar-collapsed`，宽度 240 ↔ 0 走 `transition: width 160ms ease`（边框宽度一起收，否则栏收成 0 宽还留着一条 1px 竖线） | ✅ **2026-09-30 深夜加**。用户原话：「展开侧边栏，加一个小动画。**不用很长，不要对使用产生影响。**」⚠️ **这一栏从此一直在树上**——卸载了就没有中间帧（`docs/02` 的 `ui/Sidebar.tsx`）；折叠时上 `inert`，Tab 与读屏进不去。⚠️ **拖动那条把手不带这个动画**（`body.resizing-col` 里 `transition: none`，逐像素跟手）；⚠️ `prefers-reduced-motion` 下不播。帧序列与三档拖动落点见 `docs/06` §5.44 |
| 标签页 | 文件 | `setTab("tree")`（**只改本地 state**，不走后端） | ✅ 默认页 |
| 标签页 | 大纲 | `setTab("outline")` | ✅ 能用（内容只读） |
| 文件树·文件 | 文件名 | `onOpenFile(`${workspace}/${node.path}`)` → `openPath()` → `api.doc.open()` | ✅ **能点开**（`Sidebar.tsx` 的 `TreeNodeRow` 有 `onClick`）；`title` 显示拼出来的绝对路径。⚠️ `docs/07` 第 25 项与 `docs/10` §2 的"文件树"一行都写着"点了不开/只读展示"，**与代码不符**，见 §7 |
| 文件树·目录 | 目录名 | `onToggleDir(path)`，第一次展开时 `loadDir()` → `api.workspace.tree(dir, 1, 口径)` | ✅ **可展开**（2026-09-24 起：按需取那一层，取回来的子节点缓存在 `FileTree` 的本地 state 里，不回写 App 那棵树）。⚠️ 读不了就在那一行下面写红字（`.tree-error`），**不静默成"空目录"**。⚠️ **2026-09-28 起带着当前口径**（排序 / 过滤 / 隐藏文件，`ui/tree-options.ts`）；口径一变，`FileTree` 靠 `口径键` 那个 effect **清掉 `kids` 缓存并对还开着的路径逐条重取**（保留展开状态）——不清的话会出现"顶层按新规则排了、展开的目录还是旧顺序" |
| 文件树·空态 | 「还没打开文件夹。…」＋「打开文件夹…」 | 按钮 → `onOpenFolder()` → 与「文件 → 打开文件夹…」同一个 `openFolder()` | ✅ 2026-09-24 补。**在那之前这一段只有一句话、没有任何可点的东西**——界面让人去打开文件夹，路却只在菜单里 |
| 文件树·空态 | 「这个文件夹里没有 Markdown 文件。」 | 无 | ✅ |
| 大纲·条目 | 「▸」折叠三角 | `toggle(item.line)`（**只改本地 state**） | ✅ 2026-09-24。折的是"比它深的标题"，`aria-expanded` 跟着走；折着时右边显示里面有几条 |
| 大纲·条目 | 标题文本 | `onJump(item)` → `EditorPane` 的 `跳到标题({ line, index })` → `create.ts` / `source.ts` | ✅ **2026-09-25 接线并修好**（`docs/07` 第 48 项）。⚠️ 那一格原先写着"未接线"，**是错的**——按钮早就是 `<button>`、点击也早就在派事务，真正坏的是**滚动**：见下一段。落点是正文里那个标题，所见即所得下**标题落在视野顶部**（和 VSCode / Typora 一致） |
| 大纲·空态 | 「这份文档还没有标题。」 | 无 | ✅ |
| **右缘那条把手** | 没有文案、没有图标——**就是那条边** | `pointerdown` → `setPointerCapture`；`pointermove` 里夹一次宽度写 `<html>` 的 `--sidebar-width`；`pointerup`/`pointercancel` → `onCommit(宽)` → `updateSettings({ appearance: { …appearance, sidebar_width: 宽 } })` | ✅ **2026-09-30 加**（用户原话「侧边栏右侧可以自由拖动」，对着 Typora 的截图）。⚠️ 组件是 `ui/SidebarResizer.tsx`，**必须是 `.sidebar` 的最后一个子元素**：它靠 `parentElement.getBoundingClientRect()` 量这一栏的左缘，排在有滚动条的 `sidebar-body` 后面才量得准。⚠️ 宽度夹在 **180~480**，夹逼写在前端两处（把手自己 ＋ `applyTheme.ts` 读设置时），**Rust 那一头不验数**（手改设置文件能填出 9999，见 `docs/03` §5.6b）。⚠️ 那两处**连"不是数就退回 240"这道兜底也得齐**（2026-09-30 补上 `applyTheme` 那半边，理由与后果见下文 `--sidebar-width` 那一段）。⚠️ **拖动期间不落盘**，松手才写一次设置——理由与 `ui/useZoom.ts` 那条"热路径别把设置文件写穿"同源。⚠️ **热区只有 6px 宽**，悬停/拖动时那 2px 的强调色线才现出来（`body.resizing-col` 负责把手型变成 `col-resize` 并禁掉选中）。⚠️ **"拖得动"这件事在无头窗口里验不了**（没有 jsdom、指针捕获没法造），所以 §5.40 里那三帧是**唯一**的证据；纯函数那半边（夹宽度、三个 240 同值）在 `tests/sidebar-resize.test.ts` 里 |

⚠️ **标签页 2026-09-27~28 之间有过第三个**：「**文档列表**」（＝最近打开过的文件，
`Ctrl+Shift+2`，`docs/07` 第 76 项）。**2026-09-28 用户点名删掉**（「**<文档列表>这一栏
可以删了**」），所以这张表里没有它。同批删掉的还有：菜单里的「视图 → 文档列表」、
那个键位（`Ctrl+Shift+2`，从此空着）、只服务那一页的三个 i18n 键与一组样式
（`.sidebar-list` / `.sidebar-item*`）。⚠️ **那份列表仍在**（「文件」菜单的子菜单 ＋ 主页），
所以删的是入口不是数据——详见 §2.2 上面那一段与 `ui/Sidebar.tsx` 文件头。

⚠️ **点大纲不滚那个坑（2026-09-25 修，`docs/07` 第 48 项）值得单独记一笔**，
因为它的症状长得像"没做这个功能"：

- **症状**：点大纲里的一节，视图一动不动；**紧接着再点一次同一节，才滚过去**。
- **根因**：ProseMirror 的 `EditorView.scrollToSelection()` 不是拿事务里的位置去算
  坐标，而是先读**浏览器当前选区**（`domSelectionRange().focusNode`），那个节点不在
  编辑器里就整段跳过。而点侧栏按钮那一刻浏览器焦点已经跑到按钮上，
  `selectionToDOM()` 开头的 `editorOwnsSelection()` 为假、直接早退——DOM 选区根本
  没被写进编辑器，该滚的一个都没滚。**连点第二次之所以灵**，是因为上一次的
  `view.focus()` 已经替它把 DOM 选区放回了正文里。
- **修法**：不看选区，直接按 DOM 位置自己滚（`src/editor/scroll-into-view.ts`）。
- ⚠️ **同一个根因还压着查找**：点查找那一刻焦点在查找条的**输入框**里，
  命中一直是"选了但不滚"，长文档上等于看不见结果。同批一并修了。
- ⚠️ **源码模式那一侧没坏过**（CodeMirror 自己按行高滚，不读浏览器选区）。
- 验法与坐标见 `docs/06` §5.20。

⚠️ **查找条那个 `key` 前缀（2026-09-25 修 BUG-33）是同一批里另一条"看着像没做功能"的**，
机理值得记全，因为**坏了不报错、不打日志、也不崩**：

- **症状**：`Esc` 关查找条，条子**还画在屏幕上**（只是没了焦点框）；再按 `Ctrl+H`
  又摞一条新的——开关几次就是几条。⚠️ 上一版把它记成「`Esc` 关不掉查找条」，
  被这一层骗了：**"关了没擦掉"和"没关"在屏幕上是同一个样子**。
- **根因**：`main.app-main` 那一层有三个格位（查找条 / 格式化工具栏 / 编辑区），
  查找条与编辑区**都写 `key={activeDoc.id}`**——同一个值。中间那格默认是 `false`，
  于是 React 按**位置**对不上，只能退到**按键值查**那条路；而那张 `{键值 → fiber}`
  是一张 **Map，撞键就覆盖**：被覆盖掉的旧 fiber 既没被复用、也**没被删**，
  它的 DOM 节点就永远留在 `.app-main` 里。**每开关一次泄漏一个节点。**
  ⚠️ 反差最大的一点：状态、焦点、`clearFind()` **全都是对的**——只有 DOM 没擦掉。
- **修法**：给查找条的 key 加前缀（`find-<id>`），换文档照旧归零，但不再和编辑区撞。
  ⚠️ **同层兄弟的键值必须互不相同**，这是 React 的硬要求不是风格；违反了**只在
  开发版控制台**有一句警告，而打包后的应用没有 devtools——所以这条规则在本仓
  只能靠 code review 和这一页守着。`App.tsx` 那一行上面也写了"别把前缀省掉"。
- **为什么当初"没能复现"**：照着第一次那串动作（`Ctrl+H` → 打 `丙7` → `Esc` →
  切「源码模式」）复走两遍都正常。**真正的复现条件只是"开关两次以上"**——
  一次开关泄漏一个节点，只开一次当然看不出来；而上一次那份记录里正好只开了一次。
- **判据**：`Ctrl+H` → `Esc` 连做 3 轮，每步各拍一帧。修前「第 1 次开」与「第 5 次开」
  差 **137147** 像素；修后「第 1 次开」与「第 3 次开」只差 **0.009**，两次「关」
  之间是干净的 **0**。⚠️ 对照组：「开」与「关」两帧差 **91941.7** 像素。
- 跑法与坐标见 `docs/06` §5.20。

⚠️ **「插件」那一页 2026-09-22 从这一栏搬到了右边**（`PluginDock`，见 §2.2b）。
这不是随手换一个位置：**左侧是文档导航、右侧是工具面**，两者的**使用节奏不同**——
导航是写东西时一直要看的，工具面板是偶尔开一下的。用户同日拍的板，见 `docs/10` §5。

### 2.2b 右侧插件栏（`PluginDock`）

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标题 | 活动页的名字（面板的 `title`，或「插件」） | 无 | ✅ |
| 关闭 | 「×」 | `setDockOpen(false)`，**整个 `<aside>` 不再渲染** | ✅ 实测过 |
| **页签** | 每个右侧面板一个 ＋「插件」 | 点了 → 切页（**只画那一页**） | ✅ **2026-09-24 起（用户要求：一个拓展独占一页，两个不能同时开）**。⚠️ **2026-09-25 起这一栏里不再有内置页**：Slidev 从那天起是普通插件、走 `register_panel`（§2.8），`PluginDock` 里手写的那一页 `@slidev` 删了。**验收标准**：把 `plugins/slidev/` 删掉，这一栏里有关它的东西应当一条不剩 |
| 面板·内容 | 由插件的 `render` 决定（见下） | 按钮点下去 → `问参数` → `plugin.call` | ✅ **2026-09-24 起是真的内容**（`docs/07` 第 15 项结清）。📌 之前这里写的是「面板内容尚未接入。」一行字 |
| **面板·正在生成的字**（`实时表`） | 插件推过来的那段字（画成一条 `message`） | 无（**不是按钮，是内容**） | ✅ **2026-10-04 加**（`docs/07` 第 58 项，「边生成边显示」）。⚠️ 见下面单独一段 |
| 面板·没有落脚处 | 面板名 + 它声明的 `location` | 无 | ⚠️ 只在有面板声明了 `right` 以外的位置时才出现，而且列在**「插件」那一页里**。**存在的意义是"声明了的东西不静默消失"** |
| 已装插件·每一项 | 名称 / 版本 / id / **来路 ＋ 验签结论** / 描述 / 错误 / 能力 chip | 无 | ✅ 2026-09-25 起 `id` 那行右边多了「自装/内置 · 已验证/未知签名者/未签名」（`来源说明()`） |
| 已装插件·行上按钮 | 「停用」/「启用」、「卸载」、「信任」 | `动作.启停` / `动作.卸` / `动作.信任`（实现全在 `ui/usePlugins.ts`） | ✅ **2026-09-25 起不再是只读**。⚠️ 「卸载」只在 `removable`（＝用户自己装的）时才画；「信任」只在 `signature === "unknown"` 时才画 |
| 标题行上的「从文件安装…」 | 装了才变成「正在安装…」 | `动作.装`：弹文件框（`@tauri-apps/plugin-dialog`）→ `plugin.install` → **重拉一次清单**（不是读 state，见下）→ 签名者不认识就**当场**问一句要不要信任 | ✅ 2026-09-25。⚠️ 那张确认框上的**指纹由调用者传进去**（`动作.信任(id, 指纹?)`）：`plugins` 是这一次渲染那一帧的快照，刚装完的插件**还不在里面**——早先在这里现查，于是永远显示「（未知）」（BUG-28，`docs/07`）。⚠️ 弹出来的那串指纹是**宿主拿包里的公钥重算的**，与作者侧 `tools/pack-plugin.py --verify` 报的逐字符相同（`docs/06` §5.16） |
| 已装插件·空态 | 「没有装插件。用上面的「从文件安装…」装一个。」 | 无 | ✅ |
| **已信任的签名者** | 指纹（等宽字体）＋ 记下它时那个插件的名字 | 无（**只列不删**） | ✅ 2026-09-25。⚠️ 指纹是给人**核对**的，藏起来等于没记；撤销信任是改 `trusted-keys.toml` 的事，这里不给按钮，免得被当成"卸载这个插件" |

⚠️ **启停 / 装卸之后必须重拉 `plugin.panels()` 和 `menus()`**——
2026-09-25 起**停用是真卸载**（没有 Lua 状态），那家的面板与菜单项会一起从清单里
消失；`ui/usePlugins.ts::跑` 把"干完 → 重拉"收成了一条路，四个动作都走它。

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

⚠️ **正在生成的字（`实时表`）故意不按"当前页"过滤**——这一条与上面那条
"看不到的那几页不刷新"**看着矛盾，其实不是同一件事**：`nota:plugin-panel`（失效信号）
只喂给**当前那一页**，丢了下次切过去会现拉一次；而 `nota:plugin-stream` 送的是
**内容本身**，丢了就再也拿不回来了（它不是状态，没有"下次现拉"这回事）。
所以它按**插件 id** 存进一张表里，谁来都收下、只画在那一页。
⚠️ 那张表在**成功拉到真内容时会被清掉那一格**（`set实时表`）——那段临时的字
到此为止，面板上剩下的就是 `render` 拉回来的真东西。

#### 面板内容：**十六种内容块**

插件在 `register_panel` 里给一个 `render` 函数，宿主**现调现取**（每次打开都拉一次），
前端按白名单画。认得出的十六种（另加一个 `unknown` 兜底）：

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
| `heatmap` | 一格一天的**热力图**——2026-09-27，写作统计的长期那本账。一列一周、从周一起，最后一列画到 `to` 那天为止（把未来还没到的几天画成「0 字」是编数据）。⚠️ 格子的位置在 `ui/heatmap.ts` 算、这里只画 |
| `frame` | 一个 `iframe`（`.panel-frame`）——**全仓唯一一处"把外部内容嵌进 DOM"**——2026-09-25。⚠️ **地址由宿主填，插件交不出来**（`lua/api/devserver.rs::填_frame`）：只认 `http://localhost:*` / `127.0.0.1`，`frame-src` 那条 CSP 钉着，高度夹在 120–2000。`alive = false` 时画的是"这场开发服务器已经不在了"而不是一个空白框 |
| `graph` | 一棵提交树——2026-09-26。**唯一一种"一行的两头各是一颗可点的东西"**：左边 `art` 那截图线点了看"这一次提交改了什么"、右边 `text` 点了选中它（选两个 → 比两者之间）。⚠️ 那是**一块画，不是画布**：内容仍然全是插件给的字符串、由 React 转义；`bond`/`pick` 缺一个时那一头画成**纯文字**（不是灰按钮——树上"这一头没有动作"是正常状态）。完整字段表在 `docs/13` §8.5 |

| `chart` | 大号数字 ＋ 一条曲线——2026-09-26。**面板里唯一会动的东西**，跟随心跳每秒重画。⚠️ 刻度是**画上去的 HTML 覆盖层**，不是 SVG 文字：面板那块 SVG 写着 `preserveAspectRatio="none"`（要跟着栏宽拉扁），里面的 `<text>` 会一起被拉变形。⚠️ 纵刻度前端按点的极值推（`ui/chart-ticks.ts`），横刻度由插件给（`xTicks`，不写就没有）——两者都是"标在非线性的位置上、但每条标的是真值"。⚠️⚠️ **那一排刻度让开纵轴边栏靠的是 `--chart-gutter`（34px），而"让开"这件事在两条轴上用的是两种属性**：图本身与纵刻度那条边栏用 `padding-left`（那条边栏是 `static` 的 `svg` 子元素），**横刻度那一排必须用 `margin-left`**——它的每一档是 `position:absolute` 的，而绝对定位元素的包含块是父元素的**内边距盒**，`left:0` 落在**内边距的外沿**，`padding-left` 对它一点用都没有。2026-09-27 开窗撞见的原样：图让开了 34px、横轴标签没让，于是第一个标签（`-4 秒`）比曲线起点**偏左整整一条边栏 34px**、中间那档（`at:50%`）偏左 17px、最后一个正好（它是 `right` 锚）。修完全对齐（数值对账在 `docs/06` §5.32）。**加新的刻度层时照这条规矩挑属性。** |
| `cards` | 一串**记录卡**——2026-10-04。版式出自用户给的两张运动手表「运动记录」截图：**一条记录一个圆角框**（左边一颗圆图标 ＋ 一个大数 ＋ 一行小字），框底下那行是**汇总**。⚠️ 与 `fields` 的分工是主次（一个大数配一行小字走这里，几行平级的读数走那里）；与 `share` 的分工是去处（这个画在面板里，那个是能发出去的图）。⚠️ `points` 与 `chart` 同一个形状，折成一张 36px 高的**窄曲线**、**没有刻度**（那个高度摆不下）；少于两个点不画。⚠️ `total` 不是各条之和（三条记录的区间互相包着），`title` 空着时**不画那行小标题**但汇总照画。完整字段表在 `docs/13` §8.5 |
| `share` | 一张分享卡——2026-09-27。卡片本体是**一张 1080×1350 的 SVG 图**（`<img src="data:image/svg+xml,…">`），下面两颗按钮（「保存为图片」/「复制到剪贴板」）与一行结果。⚠️ 画卡的是 `ui/share-card.ts`，**与光栅化是同一个函数**——预览里看到的那张就是存下去的那张。⚠️ 结果**不走 toast 走行内一行**（用户会盯着图看，toast 会自己消失）；⚠️ 卡片的配色：**底色跟随界面的明暗**（由 `当前卡色()` 读 `<html data-ui-mode>` 决定用深浅哪一套），**强调色 2026-09-27 起跟随用户自己的主题色**（用户：「分享卡颜色强调是跟随自己的主题」＋「可以稍微调整一下，视觉上美观就可以」）——SVG 塞在 `<img>` 里、继承不到 CSS 变量，所以是 `当前卡色()` **主动去读 `--accent` 的计算值**再传进画卡函数。⚠️ 两套常量（`#4f82fb` / `#2f63d8`）仍在 `ui/share-card.ts` 里，但它们的角色变成了**没设主题色时的落点**；`styles/accent.ts::卡片主色` 只挪亮度、色相与饱和度一律不动（把一个橙调暗是必要的，把它调成另一个色相就是"没跟随"了）。⚠️ 两档范围的两颗按钮都带 `needs`（没东西可分享时**不出现**）。⚠️ 三格指标的 `v` **要短**：版式不缩字、不换行，超过 `格宽 − 30px` 会压到隔壁格。⚠️ **2026-09-27 那三句刻度要求**（「像仪表标尺」＋「全天一小时一档」＋「到小时用稍微大一点的字体」）落成 `x_ticks[i].大单位`（字号 24 → 30）与 `x_minor`（主刻度之间再切几小格，只画线不写字，0~10，整张卡最多 13 档主刻度）——分工是「插件说语义、宿主定版式」，判据在 `docs/02` 那张刻度表 |

⚠️ **认不出的 `kind` 如实画一句「不认识这种内容块（kind = …）」**，
不静默丢掉——那是**给插件作者看的线索**。同理，**没写 `command` 的按钮画成灰的**
而不是消失（"这里少写了一根线"）。

⚠️ **`input` 是"面板里唯一的输入控件"，而它不是表单**：一次带一个值，
发出去＝调 `submit` 命令、参数 `{ [arg] = 输入 }`，**跟按钮零区别**（只是值来自输入框）。
要一个参数就用按钮上的 `prompt`（`docs/13` §8.3 / §8.5）；要用户在对话里说话，
用 `input` ＋ `message`（AI 面板就是这么搭的）。

📌 **2026-10-10：AI 面板改成现代对话框那一批，DSL 多了三样**（用户：「要让它更现代，
类似这种」＋「对话用标签页管理，在上方」）：
**① `tabs`**（上方的标签页：点字面切、点右边那颗小叉关、末尾那颗「＋」新建）；
**② `hero`**（空态那行大字 ＋ 小字，现代对话框开始那一屏就是这么画的）；
**③ `input.chips`**（输入卡片里那排小按钮——预设的快捷入口）＋ 发送键改成**一枚圆形箭头**
（`submit_label` 成了它的 `title` / `aria-label`）。⚠️ 同时 `message` 多了一个 `copy`：
**复制那件事是宿主做的**（前端 `navigator.clipboard`），插件那套 API 里没有剪贴板。
⚠️ 消息的左右也**对调**了：用户靠右一条淡底气泡、AI 靠左不加气泡（从前是"两边都写名字、
都靠左"——那一条被用户那句"更现代"推翻了）。

⚠️ **`diff` 只画，不认识格式**：`nota-diff` 那份契约在宿主（`docs/13` §11），
前端这一块只管把 `op = "del"/"add"` 画成红绿两色。所以"点的按钮会把什么写进文档"
**是插件的事**，前端不参与。

⚠️ **面板里的字符串永远到不了 HTML**：每一块都是具名 JSX，插件给的字符串只出现在
子节点位置，属性只有 Nota 自己写的字面量。**这里没有（也永远不该有）
`dangerouslySetInnerHTML`**，所以"插件往面板里塞 `<script>`"在结构上做不到。

#### ⭐ Git 那一页的三条"出路"（2026-09-26）—— 照着抄的样板

用户在 2026-09-26 提的要求是「界面要允许 git init。**要确保全 gui 也可操作**」。
这句话落地的方式值得别的插件照抄：**面板上每一个"卡住"的状态，都要带一条能往下走的按钮**，
而不是一片空白或者一句"请去终端跑…"（那等于把功能砍一半）。

| 面板此刻是什么状态 | 画什么 | 那颗按钮干什么 |
|---|---|---|
| 这个目录**不是 git 仓库** | 「这里不是 git 仓库」＋ 一句"建一个仓库就能在这里看改动、比差异、提交了" | **「初始化仓库」**（主按钮）→ `git init`；另有一颗「再试一次」（仓库也可能是在别处建好的，得能重新发现） |
| 是仓库，但**没设 Git 身份** | 一句警告"这个仓库还没设 Git 身份（名字和邮箱），git 会拒绝提交" | **「填身份…」**（主按钮）→ 弹**两个字段**的框（名字 ＋ 邮箱），写进这个仓库的 `.git/config` |
| 是仓库、身份也齐 | 分支名 ＋ 改动清单 ＋ 「刷新」/「提交…」 | 「提交…」弹一个字段的框问提交信息 |

⚠️ **那两块屏右栏和编辑区共用一份**（`not_repo_blocks()`）：各写一遍的话，
加一颗按钮就得记得加两处。⚠️ **警告要在提交之前说**，不能等提交失败才说——
那时用户已经在想"这功能是不是坏的"了。⚠️ **身份写进仓库本地、不碰 `~/.gitconfig`**：
全局配置是用户机器上的公共资源，一个编辑器插件替他改不合适；代价是每个新仓库要再填一次
（`docs/11` 的能力表把"能改全局配置"记成挡不住的已知边界——这里是**主动不越界**）。
⚠️ 这台机器上**没有全局 git 身份**，所以第二块屏不是假设出来的一种状态。

⚠️ **提交树默认收着**，靠面板上那颗「提交树」按钮摊开（`MAX_GRAPH = 60` 行）。
⚠️ 差那一块 2026-09-26 起**不折行**（横向滚动）：差异是**横着读**的东西，
折成一团之后"这一行改了哪儿"反而看不出来。

⚠️ **面板内容各处的失败都要看得见**：`render` 抛错 → 面板里红字写着插件的错；
`render` 返回空 → 「插件没有给出内容。」（**空的不是错误**：没开文件夹、没有改动
就是没内容）；声明了却没有 `render` → 一句解释。**这四种情况都不能是一片空白。**

#### 面板内容的**刷新**

插件在自己知道内容变了时喊 `nota.ui.refresh(id)` → 宿主发 `nota:plugin-panel`
→ `PluginDock` **重拉**。⚠️ 那条事件里**一个字节的内容都没有**，它只是个提示，
**丢了也不影响正确性**（面板还没打开时这一枪本来就没人收，而打开时一定会拉一次）。
**事件里不放内容**——那会回到 BUG-13 的形状：两份真相源，漏一枪就静默分叉。

⚠️ 2026-09-24 起**只有当前那一页会重拉**：事件到了先看"是不是活动面板那一家的"，
不是就直接丢。别的插件那一页不拉——它没显示，拉了也没人看（切过去时本来就会拉）。

⚠️ 重拉时**保留旧内容**（不闪白）；连续两次刷新时**先发的后回来不会盖掉新的**
（`PluginDock` 里那个请求序号 ref 就是为这件事）。

✅ **插件自己声明的面板 2026-09-22 起进得来了。** 原先是后端把面板当事件发出去
（`nota:plugin-panel`）而前端一个订阅者都没有（BUG-13）；现在改成
**注册进插件的 Lua registry（`nota_panels`）+ 宿主按需拉**（`nota_plugin_panels`），
与 `nota_commands` 同一范式。开窗实测 Git 面板出现在栏顶。
⚠️ **改回事件就必漏**：注册发生在**插件加载时**、前端订阅在**挂载之后**，直连必漏且漏得安静。

⚠️ **这一栏没有自己的快捷键**，三个入口都是"点"：顶栏那个开关、栏里的 ×、
菜单栏「视图 → 插件栏」（可勾项，勾选状态跟着 `dockOpen` 走）。

⚠️ **2026-09-27~28 之间这里有过第三页「文档列表」**（最近打开过的文件）。
补它的那两项是 `docs/07` §3 的**第 8 项**（列表 UI）与**第 9 项**（最近文件的存取，
后端那半）；**顺序不能反**：没有存取，列表就是个空壳。两页都做完了（`docs/07` 第 76 项），
**第二天用户看图点名删掉了这一页**（「**<文档列表>这一栏可以删了**」）——连同菜单里的
「视图 → 文档列表」、键位 `Ctrl+Shift+2`、以及那一组样式一起。
⚠️ 那份列表**没消失**：仍在「文件」菜单的子菜单与主页上（`ui/recentMenu.ts`、`ui/Home.tsx`），
数据仍由 `ui/useSession.ts` 读宿主侧车——那一页本来就是同一份数据的第三个入口。

✅ **侧栏两页都有快捷键**：`Ctrl+Shift+1` 切大纲、`Ctrl+Shift+3` 切文件树
（两个键都会同时打开侧栏）。2026-09-28 之前中间还夹着一页「文档列表」（`Ctrl+Shift+2`），
删页之后**那个键位空着**——菜单里已经没有任何一项占它，见 §4.2。右栏那个「插件」开关仍然只能点。

### 2.3 编辑区

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 加载提示 | 「正在准备编辑器…」 | 无（`ready === false` 时显示） | ✅ |
| front matter 说明条 | 「这篇文档开头有一段 front matter（`---` 包住的那几行）。所见即所得里不显示、也改不了，存盘时会原样保留——要改请切到源码模式。」 | 无（纯展示，`role="note"`，类名 `.editor-frontmatter-note`）。⚠️ **判据是"这份文档真带前置块"**：`EditorPane` 调一次 `editor/front-matter.ts::拆前置块`（`拆前置块(initial).前置块 !== null`），**只在所见即所得 ＋ 有前置块 ＋ 非源码模式**时才画。条子 `position: sticky; top: 0`（分屏那一栏才是 flex 容器） | ✅（2026-09-26，BUG-39；见 `docs/05` §4.12）<br>⚠️ **它是"front matter 不显示"这件事的唯一提示**——去掉它，用户就不知道文件开头那几行去哪了。⚠️ **源码模式不画**（那边本来就看得见、改得动）。⚠️ 用户原文那句话是**给人看的**，所以进了 `en.ts`（`tools/i18n-check.sh` 界面 732/732）|
| 编辑器本体 | — | Milkdown 拥有那棵 DOM；文本变化走**去抖 300ms → `api.doc.sync()`** | ✅ 能用，链路见 `docs/05` |
| 标题**输入期**（`#` 还没回车） | 无文案——`#` 就是普通字符，位置、字号都不变（只有井号后面那段按**正文粗体**显示，前缀 `#` 画在装订线里不进文档流）。⚠️ **宽松那条**（`#你好`，井号后没空格）**2026-09-30 起和 `# 你好` 完全一样**：输入期同样只加粗、不放大，**按下回车才成块放大**（不再是"光标一走开就排"——那条长相当天被用户推翻） | `editor/heading-on-enter.ts`。⚠️ 上游「打一个空格就成块」那条 `wrapInHeadingInputRule` 在 `create.ts` 里被 **`.filter()` 摘掉**了——那条正是用户抱怨的「输入 `#` 后按空格，`#` 就变位置、还变大」。**回车才成块**：按回车才换成真标题、同时把下一段开出来 | ✅（2026-09-26），见 `docs/05` §4.9 与 §4.9c |
| 标题**行首退格** | 无文案 | 还是 `editor/heading-on-enter.ts`，`标题行首退格`：光标在标题文字**最前面**时按 `Backspace`（或 `Delete`），**一次退回段落**。⚠️ 上游 `downgradeHeadingCommand` 是**逐级降级**（`###`→`##`→`#`→段落），用户点名否掉：「在任何标题前按退格统一直接删除所有标题，而非从 ### 变到 ## 再 #」。所以本文件用 `$shortcut` 以 `priority: 60` 盖掉上游那条。⚠️ **与严格模式无关**（用户没开严格模式，这条照样生效）。⚠️ 它与上面那行是**一对相反方向的动作**，改一个先看另一个。⚠️ **它不改文件里的字节**：段落 `# 你好` 与标题 `# 你好` 序列化出去是同一串 | ✅（2026-09-26），见 `docs/05` §4.9b |
| 任务项复选框 | 无文案（方框画在列表项的**左外侧装订线**里） | 点方框 → `editor/task-list.ts` 按几何命中 → `setNodeMarkup` 翻 `checked` | ✅ 能勾（2026-09-22 开窗实测）；装订线宽度走 `--task-check-gutter` |
| 代码块右下角那一条 | 块**内部**右下角：「折叠」「复制」；语言下拉（没指定语言时显示「纯文本」，指定了就显示语言名）**不在这条上**，它单飞，见右栏 | 同一处的 NodeView（`editor/code-block.ts`）：复制走 `navigator.clipboard` 兜底 `execCommand`，**界面文案会在 1200ms 内变成「已复制」/「复制失败」**；折叠**只活在这个视图里、不写进文档** | ✅（2026-09-22 开窗实测，2026-09-25 又验了一次写回）。⚠️ 那一条是 `opacity: 0` 的，**鼠标进代码块才亮**。⚠️ **代码块上下间距各 30px**（2026-09-26 照 Typora，原来是 `0 0 30px`）——与相邻段落的 `margin` **取大的那个**（不是相加），`editor.css` 那条注释里写着算式。<br>⚠️ **语言下拉的外观是"自己画的"**（2026-09-25）：`appearance: none` 去掉原生外观（**连同原生那颗箭头**）＋ `.nota-code-lang-wrap::after` 补一颗。少写 `appearance: none` 的后果是**深色下整个框画成纯白**（原生 `menulist` 外观盖在 CSS 之上）。📌 那颗控件当天又从 `<select>` 换成了 `<button>`（理由见右栏），但**这一条留着**——`<button>` 一样有原生外观；另一处在设置页（`settings.css` 的 `.stg-select`），**两处各画各的箭头**（一个跟界面主题、一个跟文档主题），改一处要想到另一处。<br>📌 **2026-10-06（第 101 项收尾）**：折叠那条 CSS 的靶子**从 `> code` 改成 `> .cm-editor`**——第 101 项之后 `> code` 是**零尺寸、藏起来的** ProseMirror contentDOM，收它等于没反应（按钮会翻字、画面不动，BUG-69）；真正该收的是 `.cm-editor`（用户看着的那一层）。⚠️ 原规则里那句 `display: block`（为行内元素 `<code>` 补的）**没有跟着搬**——`.cm-editor` 是块级、CodeMirror 自己还写了 `display: flex` |
| 代码块**下面**那颗语言下拉 | 语言下拉（与上一行同一个控件，**位置不同**）：**图标 ＋ 语言名**，点开是一张 400 项的列表，**每一行也是"图标 ＋ 名字"** | 住在 `pre` 的**下边框之外**：`.nota-code-lang-wrap` 是 `position: absolute; top: 100%; right: 6px`，定位祖先是 `pre`（它自带 `position: relative`，`overflow` 又是为围栏标记留的 `visible`，所以画得到框外）。**不占文档流**，悬停时压在下一段第一行上——有意如此，常驻占位等于每个代码块下面空一截。展开的列表是**自绘的**（`editor/lang-picker.ts`），挂在 `document.body` 上、`position: fixed`，装不下时**向上翻** | ✅（2026-09-25 开窗实测，用户点名：「调整一下语言选择框的位置。是代码块右下方，下面」）。⚠️ 搬出来时有两处**必须连带改**，漏一个就是坏：①`langWrap.contentEditable = "false"` 要自己写（以前是跟着 `.nota-code-bar` 继承的）；②`code-block.ts` 里那条 `inChrome` 判据要**同时包含 bar 和 langWrap**，只判 bar 的话点下拉会被 ProseMirror 当成"点了编辑区"。⚠️ 折叠/复制**没有跟着搬**——用户明确选的是"只挪语言选择框"。<br>⚠️ **为什么非自己画不可**：原生 `<select>` 的 `<option>` 内容模型是**纯文字**，图片/图标塞进去不渲染，而用户要求「连弹层里也要图标」——硬约束。代价是原生白送的都得补（打字跳转 / 上下键 / 开场滚到当前项 / Escape / 点外面关），**都补了**。<br>⚠️ **图标 2026-09-26 起是真图**：热门语言走 `editor/lang-icons-real.ts` 的 93 颗 **vscode-icons** SVG（MIT，用户当天点名「只支持热门语言即可。但是要画真图标」），问不到才回落成 `editor/lang-icon.ts` 的**字母徽章**（底色＝语言约定色）。⚠️ 走了 `background-image` 的 data URI 而**不是**把 `<svg>` 插进 DOM——那批图里好几份都定义 `id="a"`，内联进同一份文档会**互相串色**。<br>⚠️ 弹层开着时**闭合框要一直亮着**（`:has(.nota-lang-open)`）：鼠标从按钮往弹层里走会离开代码块，不给这一条就是"框淡出、弹层还在" |
| 代码块里的**文字本身**（2026-10-06 第 101 项新增的一行） | 不是控件，是**两层并排的 DOM**：`<code class="nota-code-text">`（隐藏，ProseMirror 的 contentDOM）＋ `.cm-editor`（可见，CodeMirror）。**用户看到、点到的都是 CM 那一层** | `code-block.ts` 建出来的 NodeView 里；CSS 在 `styles/code-block.css` 的 `.nota-code-text`（零尺寸、`pointer-events: none`）＋ `code-block-cm.ts` 的 `EditorView.theme`（内边距归零、光标/选区用 `--accent` / `--bg-active`） | 🟡 **代码在、判据（`tests/code-block-editing.test.ts` 21 条）在，但手感那半（配对、回车续行、`Tab`、`Ctrl+Z`）**没开窗点过**——见 `docs/10` 那一格与 `docs/07` 第 101 项。⚠️ 两层文本的存在**不是冗余**：存盘/撤销/查找读的是隐藏那层，见 `docs/05` §4.24 |
| 图表块（` ```mermaid `）的挂件 | 右上角一颗「预览 / 编辑源码」开关；空块是一张「这里还没有图表源码」＋同一颗按钮；出错是一张说明卡（中文说清是语法错、附 mermaid 原文报错）＋同一颗按钮 | `editor/diagram-view.ts` 的 NodeView：平时**看图**、点一下才在图上边展开源码框（改完 **250ms** 防抖写回 `attrs.value`，失焦/`Esc` 立即落）——`diagram` 是 `atom`、没有 contentDOM，所以只能自己摆控件。⚠️ **渲染失败绝不回写文档**（出错只画卡）。⚠️ **点图本身不算点挂件**：那一下该让 ProseMirror 把整块选中（才能删/复制）——`是我的挂件` 的判据不含预览区（`docs/07` BUG-37 的对照写的就是这条） | ✅（2026-09-26 开窗拍过：图、错误卡、空块三种画面；小图撑满整栏的那条当天修掉）。⚠️ **2026-10-04（第 27 项）**：节点与转化是本仓 `editor/diagram-node.ts`（上游包退役）、mermaid 改**动态加载**——那之后**没再开过窗**（构建产物为证） |
| 装载后的认领 | 无文案 | `EditorPane` 在 `focus()` 之后调一次 `api.doc.settle(id, text)` | ✅ 修 BUG-12 的那一步，见 `docs/03` §4.2 |
| 查找高亮 | 无文案（命中底色 `--find-hit` / 当前命中 `--find-current`） | `editor/find.ts`（所见即所得）与 `source.ts`（源码）的**装饰**，两种模式都有；命令来自上方的 `FindBar` | ✅（2026-09-24），见 `docs/05` §4.3。⚠️ **底色画在哪一颗字上**现有判据（2026-10-06，`tests/find.test.ts` **53 条**：`doc.textBetween(命中)` 必须等于查询串——BUG-67 那个"向后位移一位"就是这条抓的）；**屏幕上真有没有颜色**仍是开窗目检 |
| 压暗兄弟块 | 无文案（`opacity: var(--focus-dim)`，标准档 `0.32`） | 专注模式，`editor/writing-modes.ts` 的**装饰**；不改文档、不进撤销栈。⚠️ 这只是专注模式的**一半**——另一半是把外壳收起来，见 §2.10。📌 **2026-10-04（第 45 项）那个数改成可配的三档**（`appearance.focus_mode_dim`，`ui/useFocusDim.ts` 写 `<html data-focus-dim>`，两条压暗选择器——所见即所得的 `.nota-dim` 与源码模式的 `.cm-editor.nota-focus …`——**共读同一个变量**，各写一个数的症状是"拨了开关只有一半跟着变"） | ✅（2026-09-24），见 `docs/05` §4.4 |
| 当前行标记 | 无文案（源码模式下其余行压暗） | 打字机模式的 `Decoration.line`（源码那边只有**一颗**装饰） | ✅（2026-09-24） |
| 空态（`Home`） | 「新建文档」+「Ctrl+N」 | `onNew` → `newDoc()` | ✅ |
| 空态（`Home`） | 「打开文件」+「Ctrl+O」 | `onOpen` → `openViaDialog()` | ✅ |
| 空态（`Home`） | 「打开文件夹」+「把一整个目录当工作区」 | `onOpenFolder` → `openFolder()` | ✅ |
| 空态（`Home`） | 插件状态列表 + 失败计数 | 无 | ✅ 只读；失败**要显眼**是刻意的——静默失败会让人以为自己装错了 |

⚠️ `EditorPane` 由 `App.tsx` 用 `key={activeDoc.id}` 挂载：**换文档 = 整个组件重挂**。
⚠️ **2026-10-07 拆过（第 89 项，1171 → 800 行）**：这一节讲的仍是「编辑区长什么样」，
但其中六块搬去了自己的文件——`ui/FrontMatterBanner.tsx`（上面那条 front matter 横幅）·
`ui/pane-editors.ts`（三个实例各传哪些选项）· `ui/useEditorSettings.ts`（设置 → 编辑器形状）·
`ui/useEditorHandle.ts`（**外面那 13 条命令的转发**，即 `EditorPaneHandle` 本身）·
`ui/useCursorSnapshot.ts`（选区快照推后端，第 14 项）· `ui/table-widths.ts`（列宽侧车）。
⚠️ 逐项的职责与坑以 `docs/02` 那几行为准，这一节不重抄一份。
这是刻意的（省得去写"把 A 文档的撤销栈换成 B 的"），见 `docs/05`。

### 2.3b 编辑区里的插件预览（`ui/ReviewPane.tsx`）—— 2026-09-25 起

**用户原话**：「要求允许直接在Markdown编辑区域进行预览。删除用红色背景色+删除线；
加入用绿色背景色+下划线。」

在那之前改动只能摊在右侧那 260px 栏里，而 diff 是**左右对照着看**的东西——一行的原文与
改后文挤在 260px 里会折成一团，而"这一改对不对"恰恰要靠看见整段上下文。所以它占**正文那一块**。

| 方面 | 事实 |
|---|---|
| 怎么摊开 | 插件喊 `nota.ui.review(id)`（它那块面板必须已经 `register_panel` 过，否则报「摊不到编辑区」）。**宿主**（`plugin::ReviewState`）记下"现在摊这一格"，然后发 `nota:plugin-review`。⚠️ **同时只摊一块**：`ReviewState::set` 先把整张表清掉 |
| 谁来收起 | 顶上那颗「回到正文」→ `api.plugin.reviewClose(plugin)`，**不经过插件**。理由是插件正卡在一次慢调用里时（宿主还抱着 `plugins` 锁），用户也得退得出来。⚠️ 收起来**不代表改动被应用**——那颗按钮的 `title` 就写着这句 |
| 里面画什么 | **还是 `PanelBody`**，和右栏同一种内容块、同样的 `kind`、同样的 `panel-*` 类。所以插件**一行新 API 都不用**，按钮 / `diff` / `input` 在两边是同一份实现，不会漂 |
| 标题 | `插件名 · 面板标题`，两个名字都**查表得来**（`plugins` / `panels` 两份清单）。查不到就退到 **id**——**不要**因为查不到就整块不画，那看起来像界面坏了。合成放在 `ReviewPane.tsx` 自己的 `预览标题()` 里（`App.tsx` 贴着 1000 行上限） |
| 状态归谁 | **宿主**，不是这个组件。它**纯展示**：拿到 `plugin` / `panel` 两个 id，去拉内容、画出来。⚠️ 组件内 `useState` 一个"我开着"的话，一刷新界面就没了，而"AI 提了改动、我正在看"这件事不该被一次热重载抹掉（与 BUG-13 同一条教训） |
| 语言对不上 | 插件声明了 `langs` 却没匹配上时，正文顶上多一行 `.panel-lang`「此插件不支持您的语言」。⚠️ 判据与插件栏那一份**同一条**（`langs` 非空 ＋ `lang_ok` 为假），**不在前端按 `lang` 再猜一遍** |
| 里面的红绿 | 见下 |
| 摊的是哪一份 | **插件说了算，不是"永远摊工作区那份"**。Git 那一页就是例子：面板上点了树上的键（或选了两次提交）之后，编辑区摊的是**那一对提交之间的差异**，点「清空选择」才回到工作区那份。理由见 `plugins/git/main.lua::review_blocks`：用户要的"在编辑区直接预览"指的是**此刻在看的东西** |
| 不是仓库时 | 摊的是**和右栏同一块屏**（「这里不是 git 仓库」＋「初始化仓库」），不是空白。⚠️ 空白看着像坏了 |

⚠️ **`diff` 那一块不折行**（2026-09-26 起，`styles/diff.css` 里 `white-space: pre`
＋ 横向滚动）：差异是**横着读**的东西，"哪一列改了"折成一团之后看不出来。
代价是要横向滚；两个地方（右栏与编辑区）**同一条规矩**，理由同上——一处折一处不折，
用户会以为那是两份不同的内容。

⚠️ **红底删除线 / 绿底下划线这两条的实现在 `styles/diff.css`，而且只有那一份**：
同一次改动会在**两个地方**画出来（右栏那块 `kind = "diff"` 与这里），两处的
尺寸、底色、装饰必须一模一样——一处红底删除线、另一处灰字，用户会以为那是两种东西。
装饰**故意是两种**（删除＝删除线、加入＝下划线）：只靠底色的话红绿色觉障碍的用户分不出哪边是哪边。

⚠️ 底色是**实色变量**（`--diff-del-bg` / `--diff-add-bg`，`theme.css` 明暗两套），
**不是在这里 `color-mix` 兑出来的**——兑出来的那版在深色壳里浅到看不见，那正是 2026-09-25 之前的样子。

⚠️ **这一块为什么不和 `PluginDock` 共用那套"拉"**：那边是按面板键**存一张表**的
（要在页签之间来回切而不闪白），这里**只摊一块**、关了就没。取舍写在那儿：
**第三个调用者出现时再抽**，两个不抽。

### 2.4 标签栏（`TabBar`）

⚠️ **2026-09-30 起它只横跨正文那一列**（原来横跨整个窗口宽度）：DOM 上它是
`main.app-main` 的**倒数第二个**孩子，排在编辑区 / 主页之后、状态栏（§2.5）之前。
`App.tsx` 里这两个节点是作为「底部」那个槽传给 `EditorArea` 的——**因为谁画 `<main>`
谁才有权往里塞孩子**，而 `<main>`（带 `data-review`、带悬停取词那个 ref）是 `EditorArea` 画的。
`docs/02` 的 JSX 草图里标着这一层。

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标签题 | 文档标题（脏时前面有小圆点，`title="有未保存的改动"`） | `onSelect` → `setActiveId(id)`；⚠️ 后端那一侧的同步**不在这里**——`App.tsx` 有一个盯 `activeId` 的 effect 去调 `api.doc.setActive`（BUG-6 的修法就是那一段，见下） | ✅ 能用 |
| 关闭 | `×`（`title="关闭"`） | `closeDoc(id)`：`doc.dirty && settings.confirm_unsaved` → `askConfirm({title:"有未保存的改动", confirmLabel:"丢弃并关闭", danger:true})` → `api.doc.close()` → `refreshDocs()` → 活动切到列表最后一份 | ✅ 能用 |
| 右键标签 | 「在新窗口中打开」（**唯一一条**） | `onOpenInNewWindow(path)` → `App.tsx` 的 `开新窗口`（`ui/useWindowControls.ts`）→ `api.window.openNew(path)` → **再起一份进程**（`--new-window <path>`） | 🟡 2026-09-27 加，**没开窗点过**（`docs/07` §1 第 80 项那行；开窗时的逐条判据在 `docs/06` §5.34 的 C 段） |

⚠️ **右键菜单（2026-09-27）四条口径**（细节在 `TabBar.tsx` 文件头）：

- **弹层复用 `MenuPopup`，但锚点是自搭的**：`.menu-popup` 自己带
  `position: absolute; top: calc(100% + 5px)`（那是"挂在菜单栏那一栏下面"），
  所以右键菜单外面套了一个**零高度**的定点容器（`.tab-menu-anchor`，
  `styles/app.css`）。复用而不是另写一个，是为了白拿键盘漫游 / `Esc` / 点外面关掉
  那一套行为。⚠️ **别给 `.app` 或任何祖先加 `transform` / `filter` / `contain`**
  ——`fixed` 的祖先一旦有那三样，锚点就不再相对视口。
- **不是"把标签搬过去"**：新窗口是**另一个进程**，两边文档表各自独立，
  旧窗口里这一份**照旧开着**。所以这条菜单不需要知道原标签之后怎么了。
- **没有路径的标签那一条是灰的**（新建的、从没存过盘的）：新进程只能按路径读盘，
  拿不到内存里那一份正文。判据在 `开菜单` 里，宿主那边（`commands/window.rs`）
  **也判一次**——命令是对外开着的一条路。
- **关闭靠 `mousedown` 而不是 `click`**，另外 `resize` / `scroll` 各挂一个监听
  （菜单跟着鼠标那一点定位，窗口一动它就不对了）。

⚠️ **「活动文档」是两处状态、靠一个 effect 对齐**：前端的 `activeId`
（决定画哪一份）与后端的 `active`（插件 `nota.document.*` 读的那份）。
点标签只改前者，所以 `App.tsx` 里有一段 `useEffect` 盯 `activeId` 去喊
`api.doc.setActive`——**放在 effect 而不是补在 `onSelect` 上**，是为了把
`open` / `new` / `close` 那几条路也一起兜住（多喊一次无害）。
这就是 BUG-6（切标签后插件读写错文档）的修法。

### 2.5 状态栏（`StatusBar`）—— 2026-09-30 按 Typora 重做（同日晚补的悬停那半）

⚠️⚠️ **这一格的规格 2026-09-30 整个换过**。用户拿了三张 Typora 的截图 ＋ 一句话：
「修改下栏逻辑。其中左边圆圈是显示/隐藏侧边栏；第二个是切换代码/所见即所得模式。
右边一个极简的统计 token 的显示区」。**左边两枚开关、右边一个数**，中间全空——
在那之前它是一条**只读信息带**，八格（路径 / ● 已修改 / 模式名 / 严格 / 词 / 字符 / 行 / 分钟）。
删掉的那几格各自去了哪儿，见下面第二张表——**删的是"下栏再写一遍"，不是删功能**。

📌 **2026-09-30 晚，同一格的第二批**（用户又给五张图）：「**平时如图1，
当鼠标移到区域内时，如图2,3,4,5（可以在"字数统计"小菜单修改是显示哪一个统计量）**」。
图上那五步是：

| 图 | 什么状态 | 这一版怎么落 |
|---|---|---|
| 1 | 平时 | 那一格只有一个数（默认「N 词」） |
| 2 | 鼠标停在这一栏里 | 那**两颗补出来**：拼写检查（`A✓`）与上下箭头（字数统计菜单）。⚠️ 平时是 `opacity: 0` 藏着的，判据在 `styles/tabs-status.css` |
| 3 | 点拼写那颗 | 一层菜单（**2026-10-11 照 Typora 重做过**，见下面 §2.5b）：小标题「选择拼写检查语言」 ＋「自动检测语言」 ＋「不使用拼写检查」 ＋一整列语言（**左本地语名字、右短码**，能滚）。⚠️ **底下那条「全局设置…」2026-10-16 删了**（用户：「我认为这里不应该有"全局设置"的按钮」） |
| 4 | 点箭头那颗 | 一层「字数统计」菜单，**四项各带此刻的数值**排着 |
| 5 | 鼠标停在菜单里某一项 | 正常悬停高亮（`.menu-item:hover`，本来就有） |

### 2.5b 拼写菜单（状态栏那颗 `A✓`）—— 2026-10-11 照 Typora 重做

用户贴了一张 Typora 的「选择拼写检查语言」截图，说「**学学人家的菜单，你也这么做**」。
那份截图的形状：顶上一行小标题 → `✓ 自动检测语言` → `不使用拼写检查` → 分隔线 →
**一整列语言（左边本地语名字、右边短码，能滚）** → 分隔线 → 最底下一条「全局设置…」。<br>⚠️ **2026-10-16 用户看截图点名把最后那条删了**：那菜单里**每一格都是拼写这一件事的选项**，而“打开设置窗”是**另一件事的入口**；同批把为它铺的链一起收了（`MenuPopup::stickyLast`、`ui/settings/open-request.ts` 那个一次性信箱）。

**顶上那个圆角框是搜索框，不是标题**（用户 2026-10-11 收尾时又点了一句：「**上面还应该有个搜索框**」）：
打字就筛语言列表，**三样都比**（本地语名字 `Deutsch` / 短码 `DE-CH` / 原始标签 `de_CH`；大小写与连字符一律归一）——
三种找法都真实存在，少比一样就有一类人搜不到自己那门；搜不到时当场说一句「没有匹配的语言」。

⚠️️ **为什么它是 `MenuPopup` 的 `top`，而不是一个 `heading`**：它必须能接收键盘，而搜索框在这个菜单里碰上了一个绕不开的矛盾。
一条条试过来（完整的实测记在 `docs/06` §5.63）：

| 尝试 | 结果 |
|---|---|
| 开菜单后把焦点 `focus()` 到搜索框 | ❌ 被漫游钩子在 layout 阶段铺的焦点盖掉 |
| 下一帧再 `focus()` 一次（兑上词典列表异步到手那一次渲染） | ❌ 还是盖掉 |
| 回调 ref 里（提交阶段）`focus()` | ❌ 还是盖掉 |
| **从源头上不播种**：有 `top` 时给漫游钩子 `enabled: false` | ✅ |

⚠️ 三次失败的症状是同一个：**菜单开着、搜索框里一个字符都没有、正文也没变**
——字全进了那条被焦点选中的条目（按钮对文字不做任何事）。⚠️ 另一条经验：列表里那一圈蓝边
**不等于 DOM 焦点在它身上**（`.menu-item-open` 是照钩子的 `focusedIndex` 画的），所以“看着像条目拿着焦点”
不能当成证据。

**三件事各自怎么落到我们这套上**（完整判据写在 `ui/SpellMenu.tsx` 文件头）：`自动检测语言` = `spellcheck = true` ＋ `spellcheck_langs = []`（跟随系统）；`不使用拼写检查` = `spellcheck = false`（**语言那一格不动**）；勾一门语言 = 往 `spellcheck_langs` 里加/减（能勾多门）并把它打开。⚠️ **没有第五样了**（原来第④样是「全局设置…」＝开设置窗并落在「编辑器」页，2026-10-16 用户点名删掉）。

⚠️ **语言列表是现问的**（`nota_spell_dictionaries`，2026-10-11 那一批才变可能）：只列这台机器上真有的那些＋已经勾过的那些。
一本都没有时也画（就一行说明）——空着一片比说一句“这台机器上还没有词典”更让人以为菜单坏了。⚠️ 原话里还跟着“＋ 那条出口”，出口删掉之后只剩说明这一半。

⚠️ **本地语名字不走 `t()`**（`ui/spell-langs.ts`）：一份「本地语名字表」的用处正是**不受界面语言影响**
——中文界面下也该写 `Deutsch`；翻成“德语”之后，一个只会德语的人反而认不出来。

⚠️️ **三件开窗实测才量出来的**（都记在 `docs/06` §5.63）：
**(a)** 「钉在底部」**不能用 `position: sticky`**——WebKit 上不生效（滚到底也见不到那一行），改成把弹层做成 `flex` 列、只让中间那块滚（`MenuPopup` 的 `stickyLast`）。⚠️ **这一条 2026-10-16 随那条按钮一起删了**，但**结论留着**：`position: sticky` 在 WebKit 上钉不住这件事本人验过，下次谁再想做钉住的东西可以直接引这一条，不必重踩；

**(c) ⚠️️ 菜单里一下滚就消失、焦点掉回正文**（用户 2026-10-11 收尾后报的缺陷：
「选择拼写检查语言的列表**无法下滑**，一下滑就直接消失，焦点返回工作区」）。
根因不在那个列表（它本来就能滚），在那条**“弹层开着时滚一下就关掉”**的监听上（`window` 捕获相）：
它没把自己也算出去，于是**菜单自己滚也算“底下动了”**。⚠️ 从前看不出来，是因为那些菜单里**没有一个能滚**。
修法：新文件 `ui/popup-scroll.ts`（看 `event.target`，`scroll` 的目标就是**正在滚的那个元素**），
三处同样的监听一起接上：这一处（`StatusBar`）、右键菜单（`ContextMenu`，它那两栏子菜单自己就能滚）、
标签栏那个菜单（`TabBar`，今天只有一条、滚不动，但同一个坑不该留着）。测试在 `tests/context-menu.test.ts` 的第十一组。
**(b)** 勾一门语言当时**写不进磁盘**——两个回调各拿一份旧快照拼 patch，后一次把前一次抹回去了，现在只走一条 `onChangeSpell`（一次 `updateSettings`）。

⚠️ 与它同一条轴的那件事**2026-10-11 做了**：用户 2026-09-30 问过"能不能找个 BSD 兼容的
引擎程序内实现"——落点是 `src-tauri/src/spell/native.rs`（纯 Rust 的 zspell，**编进程序**），
而"列哪些语言"那一格跟着它一起翻了案（上一条）。

| 控件 | 文案 | 数据来源 → 动作 | 当前状态 |
|---|---|---|---|
| 左·第一枚 | 无字，一枚图标：侧栏**开着**时是 `‹`（`nota-sidebar-collapse-symbolic`）／**关着**时是空心圆（`nota-sidebar-toggle-symbolic`） | `sidebarOpen`；点它 → `setSidebarOpen(v => !v)` | ✅ **2026-09-30 加**。⚠️ 与菜单「视图 → 显示/隐藏侧边栏」、「`Ctrl+Shift+L`」、侧栏自己那个 `×` **共用同一份状态**，四个入口一个结果。⚠️ `aria-pressed` 跟着 `sidebarOpen` 走（读屏要靠它，图标里没有字） |
| 左·第二枚 | 无字，一枚 `</>`（`folio-insert-code-symbolic`） | 点它 → `设模式(viewMode === "source" ? "wysiwyg" : "source")`（`ui/useFileKindMode.ts` 的出口） | ✅ **2026-09-30 加**。⚠️ **它是"切到另一档"，不是"切到源码"**：在源码模式下点它就回所见即所得。⚠️ 亮着（`data-on` → 强调色）表示**此刻是源码模式**。⚠️ **分屏那一档按源码处理**（点一下回所见即所得，不会卡在分屏里出不来）。⚠️ 与菜单「视图 → 源码模式 / 所见即所得」改的是**同一份会话内状态**（2026-10-07 起不落盘，那条 `设模式` 顺手还会解除这一份的大文件降级） |
| 右 | **一个数**：默认 `N 词`（中文按字计）。**显示哪一个由设置说了算** | `countText(doc.text, appearance.reading_speed)` 的 `words` / `characters` / `lines` / `readingMinutes`，取哪个看 `appearance.status_metric` | ✅ **2026-09-30 改成"极简"**：原先四个数并排（词 / 字符 / 行 / 分钟），现在条上只留一个。⚠️ 悬停 `title` 仍是**完整一句详情**：`{0} words · {1} characters · {2} lines · about {3} min`——**中英通用**（中文按字、英文按词，两种数都在同一句里）。用户原话「随意，要求中英文通用。鼠标悬停显示详细信息」。⚠️ 阅读速度那个除数仍然生效（在 `title` 里与菜单的分钟那一项上），`appearance.reading_speed` 写 0 时按默认 382 算，理由没变。⚠️ **晚批新增**：那一格显示的是哪一项由 `appearance.status_metric` 决定（`words` / `characters` / `lines` / `minutes`，默认 `words`），改它只有**一个入口**——右边那颗箭头弹出的小菜单（没有设置页控件，判据同 `sidebar_width`） |
| 右·最右（**悬停才出现**） | 无字，一枚上下双箭头（`nota-unfold-more-symbolic`） | 点它 → 弹出「字数统计」菜单：`≤1 分钟` / `1 行` / `0 词` / `0 字符`（**四项各带此刻的数值**，选中的那项打勾）→ 挑一项 → `updateSettings({ appearance: { status_metric } })` | ✅ **2026-09-30 晚加**（图4、图5）。⚠️ 排在那一个数**右边**，与拼写那颗分列两侧。⚠️ 菜单是**往上弹**的（这一栏贴着窗口底边），锚是零高度的 `.status-menu-anchor`——与标签栏右键那个锚同一套做法，只有"往上"这一处不同，理由在 `styles/tabs-status.css` |
| 右·最左（**悬停才出现**） | 无字，一枚 `A✓`（`nota-spellcheck-symbolic`） | 点它 → 弹出拼写菜单（`自动检测语言`（配了语言时改写成 `Languages: …`）/ `不使用拼写检查`，两项互斥）→ `updateSettings({ editor: { spellcheck } })` | ✅ **2026-09-30 晚加**（图2、图3）。⚠️ 它是**设置页那个开关的第二个入口**，两处读写的是同一格 `editor.spellcheck`，值一变 `ui/useSpellcheck.ts` 那条 effect 就把它拨到 WebKitGTK 上。⚠️ **设置没读回来时两项都灰**（不拿一个假设值去拨引擎）。⚠️ **这个小菜单里不放语言列表**（十几项塞不进这条小菜单），语言在设置页——但第一项的**措辞**会说出当下挂着的那几门。 |
| 右·第一格 | 「强制专注」＋ 余额进度条，悬停提示三档 | `FocusState`（`nota:focus-state`，每秒一发） | ✅ 2026-09-26 加，**2026-09-30 之后它是条上唯一"不是统计"的东西**——用户点名「其余全删。**除了强制专注余额在需要时显示**」。⚠️ 仍然**没在跑就整个不画、不占位**；⚠️ **它排在统计那一格左边**（下栏从右往左是"数 / 专注"——"需要时才出现"的东西不该把恒显的那个数挤来挤去）。条宽按比例算并夹到 `[0,1]`，见 §2.11 |
| `OVR` 小标（**覆写模式开着时才出现**） | 三个字母 `OVR`（`.status-ovr`），无按钮、不可点 | `commandState.overtype`（`ui/useStatusBar.ts` 把 `光标` 那一格透传进来） | ✅ **2026-10-16 加**（朋友清单第 12 条「INSERT 键无法使用」）：按 `Insert` 切覆写，开着时敲一个字会**顶掉右边那一个**（`editor/overtype.ts`）。⚠️ 状态栏这一格是"现在是不是覆写"的**唯一**可见处（那颗键没有菜单项）。⚠️ 开关住在插件 state 里、**不改文档**，所以它靠 `command-state.ts::签名` 被发现——`docs/09` §2.2 记着那一格漏掉的症状（开着但永不出示） |
| 「拓展」那颗开关（**只在顶栏整条不画时才出现**） | 一枚 `folio-columns-symbolic` ＋ 悬停提示「显示 / 隐藏拓展栏」 | `插件栏`（`useStatusBar` 接第二入口）：`开: dockOpen` / `切换: setDockOpen(v => !v)` | ✅ **2026-10-16 加**：它原来只长在**顶栏最右**，而顶栏在 `hideMenuBar` 时**整条 `return null`**（§2.1）——不搬过来就等于"菜单栏一藏、拓展栏再也没法开"。⚠️ **三个入口同一个状态**（「视图 → 拓展栏」＋ 顶栏那颗 ＋ 这一颗）。⚠️ 判据是 `usingNativeMenu || !menuBarOpen`，与 `TopBar` 里那个布尔**逐字同一个**（见 `src/App.tsx` 那两行注释） |
| **右·最右端那颗「×」**（2026-10-04，第 49 项） | 无字，一枚 `folio-close-symbolic`。`title` / `aria-label` 都是「收起状态栏」 | 点它 → `useStatusBar` 的 `onHide` → `设界面({ show_status_bar: false })`，而 `设界面` 就是 `App.tsx` 那个 `setChrome` ——**与菜单「视图 → 状态栏」写的是同一格** | ✅ **2026-10-04 加**（`docs/07` 第 49 项的口径：「每个可关的面板都有一颗就地的 ×，三条入口汇到同一个 setter」）。⚠️ **只关不开**（菜单那条才是切换）：那颗 × 不在屏幕上时若写 `!`，点它会**把栏打开**。⚠️ 它**不跟**悬停才出现的那两颗（`.status-aux`）：关掉这一栏是这一栏的正事。⚠️ **排在 `.status-right` 里面**（不是 `footer` 的第三个孩子），否则 `space-between` 会把字数那一格挤到中间。⚠️ **再打开只有菜单那条路**（这一栏没有"回来"的入口——不像菜单栏另配了 `Alt+M`，状态栏藏了不影响任何别的入口） |
| 无文档时 | **照画那两枚开关 ＋ 右端那颗 ×**，右边只留专注那一格 | — | ⚠️ **不能再写「就绪」两个字**：那句话连同"左半格显示路径 / 未保存"整片删了（见下）。⚠️ **BUG-45 的教训仍然有效**：没文档时 **两枚开关 ＋ 专注余额都要画**，只把统计那一格省掉。⚠️ **2026-09-30 晚新增的三样（那一个数 ＋ 悬停才出现的两颗）一起省掉**——它们说的都是"**这份文档**有多少内容"，没有正文时没有一个可拨的对象。⚠️ 别顺手把拼写那颗留下：`editor.spellcheck` 本身是全局的，但在没文档的地方拨它没有任何可观察的结果，留在那儿只会让人以为它坏了。⚠️ **那颗 × 不省**：它说的是"这一栏画不画"，与有没有文档无关（同那两枚开关） |

⚠️ **删掉的那几格，和它们各自的新落点**：

| 原来在下栏 | 现在去哪 |
|---|---|
| 文档路径 ／ 「未保存」 | **没有替代**——标签页上就是文件名，窗口标题也是（`ui/useWindowTitle.ts`），下栏再写一遍是第三份 |
| 「● 已修改」 | 同上，那个小圆点在**标签页**上（`.tab-dot`，`TabBar.tsx`）。⚠️ 存盘后它消失——**这是 `dirty` 唯一的可见出口**，别把它当成装饰删掉 |
| 模式名（「所见即所得」/「源码」/「分屏」） | 改成 **`</>` 那枚开关的亮 / 灭**：从"告诉你是哪一档"变成"按一下换一档"。⚠️ 名字本身**只在「视图」菜单那三条上**了（2026-10-07 起——更早那份设在**偏好设置 → 编辑器 → 编辑模式**下拉，那个下拉随"模式不再存盘"一起删了） |
| 「严格」 | 设置页「Markdown → 严格模式」那一格就够；它默认关、是个少数派口径，常驻一个"没开"等于把状态栏开成开关清单 |
| 「N 字符」「N 行」「约 N 分钟」 | **并进右边那一个数的 `title`**（悬停才展开）。⚠️ 计数逻辑一个字没动，动的只是"画在条上是几个" |

⚠️ **`ui/view-modes.ts` 的"短名"那一列同批删了**：它当初就是为状态栏第一格写的，
下栏既然不再显示模式名，这一列就**没有任何读取者**（留着就是一行注释说"给状态栏用"、
而状态栏已经不用的死列）。同一张表现在只有 `VIEW_MODE_LABELS` 一列
——**别再往回加第二列**。
⚠️ **2026-10-07 起连那一列也没有读者了**：它的读本来就是"偏好设置 → 编辑器 → 编辑模式"
那个下拉（随模式不再存盘一起删）。那个文件**没有删掉**，留着的理由是下表那张
`Record<ViewMode, string>` 是**加第四种模式时唯一会当场编译不过的地方**——理由写在
那个文件头上，别因为"没人 import"清掉它。

⚠️ **别再写"六项"/"四项"**：`AGENTS.md` §2 与 `docs/10` §4 曾经都写成"六项"（其中
`docs/10` 自己列的清单还只有四项），2026-09-24 那轮改成"四项"——**那是上一次的账**。
现在条上的数是**一个**，详情在悬停里。见 §7。

⚠️ 计数与大纲吃的都是 **`doc.text`——后端镜像**（`api.doc.list()` 的结果），
不是编辑器的实时文本，所以打字时它们会**慢一个去抖周期（300ms）**才动。
口径与误差见 `docs/05` §大纲与字数。

### 2.5b 降级提示（按文件名认类型 / 大文件）—— 2026-09-28 起

**不在这一节里画任何新控件**，记的是"为什么有时候打开一份文件，模式与设置里
写的那一档不一样"。判据在 `editor/file-kind.ts`，受理在 `ui/useFileKindMode.ts`。

| 情形 | 提示（英文原文，中文见 `i18n/zh-ui.ts`） | 之后 |
|---|---|---|
| 后缀**不属于** Markdown 那一族（六种之外，`.py` / `.json` …） | `“{0}” is not a Markdown file, so it opened in Source mode.` | 一律切到**源码模式**，且**不挂** Markdown 文法与配色（`editor/source.ts` 的 `纯文本`） |
| 是 Markdown 但**超过 100 万字符** | `“{0}” is very large ({1} characters), so it opened in Source mode to keep typing responsive.` | 切到**源码模式**（Markdown 文法照挂——它确实是 Markdown） |

⚠️ 三条与别处不同的口径：

1. **提示只在它成为前台那一份时弹一次**（`ui/useFileKindMode.ts` 的 `提示过`）——
   一次拖五个文件进来，为另外四份各弹一条等于刷屏；而用户切过去时正好是他需要
   知道"这为什么是源码模式"的时候。
2. **每份只判一次**（判的是**打开那一刻**多大）。判据里有"文档有多长"，而长度会变——
   跟着变的话症状是**写着写着编辑器自己换成源码模式**。
3. **降级压过设置，但用户手动切一档就解除这一份**（`App.tsx` 的 `updateSettings`
   里那一行）。⚠️ 下栏那枚 `</>` 开关亮 / 灭报的是**实际**模式（见 §2.5）——那不是"设置没生效"。
   ⚠️ **2026-09-30 之前**这句话写的是"状态栏右·第一格显示的是实际模式"，那一格（模式名）
   同批删了，判据没变、只是出口从"写一个名字"变成"一盏灯"。

### 2.6 提示条（`Toasts`）

| 控件 | 文案 | 回调 | 当前状态 |
|---|---|---|---|
| 消息 | 任意 | 无 | ✅ |
| 关闭 | `×`（`title="关掉"`） | `onDismiss(id)` → 从列表里删掉 | ✅ |

行为：`toast(message, level, ttlMs?)` 生成本地 id 后追加（⚠️ **2026-09-25 起这摊在
`ui/useToasts.ts`**，`App.tsx` 只解构出 `toasts` / `toast` / `dismiss` 三个名字）；
`error` 存活 8000ms，其余 3200ms；
⚠️ **`ttlMs === 0` = 不自动消失**，只等用户点那个 ×。目前**唯一**用它的地方是
开机读设置失败（见 §下面"启动"那一段）：它描述的是**状态**，不是"刚做的某件事"，
8 秒后自己走掉的话，用户回头看到的依旧是一份"自己变回默认"的设置，等于没说。
`role="status" aria-live="polite"`。⚠️ **自己画而不用 `window.alert`**：
alert 会**阻塞整个 WebView**，在编辑器里打字打到一半弹一个 alert，输入法组合态会被打断。
⚠️ **同一口径现在覆盖全仓**：原来唯一的例外是 `closeDoc` 里的
`window.confirm`，2026-09-22 起换成自画的 `ui/ConfirmDialog.tsx`（见下）。

**长什么样（2026-09-25 才补的一节 CSS）**：在这之前 `.toasts` / `.toast` **一条样式都没有**，
屏幕上看到的是浏览器默认样式（一条通栏白底、一个 UA 画的 ×），既不跟着主题走、
也不像"一条会自己走掉的通知"。现在在 `styles/toast.css`（2026-09-29 从 `app.css` 拆出来的那一节），规则是：

| 项 | 值 | 为什么 |
|---|---|---|
| 位置 | 固定右下角，离边 16px，`z-index: 80` | 右下角不与正文抢地方；`80` 在对话框之下、面板之上 |
| 容器 | `pointer-events: none`（卡片自己恢复） | 空的一栏不该吃掉底下编辑区的点击——不然右下角那块地方永远点不动 |
| 卡片 | 最大宽 360px，左边一条 3px 色带 | 色带是**唯一**的级别信号，底色跟着 `--bg-raised` 走，不自己造一套颜色 |
| 色带 | 默认 `--fg-faint`，另有 `.toast-warn` / `.toast-error` / `.toast-success` | 四种 `level` 在 `ui/Toasts.tsx` 里 |
| 动画 | `toast-in` 入场；`prefers-reduced-motion` 下**不播** | 同上，尊重系统设置 |
| 消息 | `overflow-wrap: anywhere` | 报错里常有一条长路径，不折行会把自己撑出屏幕 |

### 2.6b 确认框（`ConfirmDialog`）—— 2026-09-22 起

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标题 | 调用方给（如「有未保存的改动」） | 无 | ✅ |
| 正文 | 调用方给（如「「未命名 1」还没存盘，关掉这份改动就没了。」） | 无 | ✅ |
| 「取消」 | 「取消」 | `onAnswer(false)` | ✅ 默认焦点**不**在它身上 |
| 确认键 | 调用方给（缺省「确定」）；危险动作用 `.btn-danger` 画红 | `onAnswer(true)` | ✅ **自动聚焦** |

键盘：`Esc` → 取消、`Enter` → 确定；点背景（`mousedown` 落在 backdrop 上）→ 取消。
⚠️ **2026-10-04 起焦点被夹在框里**（第 50 项）：Tab / Shift+Tab 在框内**首尾互跳**、
`focusin` 兜底把跑出去的焦点拉回框容器（`.confirm-dialog` 带 `tabIndex={-1}`），
实现在共用的 `ui/useModalTrap.ts`（`SettingsDialog` 2026-09-25 先有的那套抽出来的）。
⚠️ **那个钩子认领 `Esc` 时会 `stopPropagation`**（2026-10-04 同批补的，理由在钩子里）：
它绑在 window 的**捕获**阶段，不拦的话同一个 `Esc` 走完冒泡还会落到别的
`window` 监听器上——盖着两层框时**一次 `Esc` 把两层一起关掉**（`docs/06` §5.49 抓到的）。
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

📌 **2026-09-24 起它有一个调用方 ＋ 插件**：格式那条「插入图像」（2026-09-26 起换成
`ui/ImageDialog.tsx` 了，见下），以及**插件**（面板按钮与菜单项声明的 `prompt`，
统一从 `ui/plugin-prompt.ts::问参数` 走）。

⚠️ **2026-09-26 起「插入图像」不在这个框里问了**：它换成 `ui/ImageDialog.tsx`
（见 §2.6e），因为插图有两条来路、而且"插进去之后会发生什么"取决于设置——一个
一行输入框装不下。所以下表里「图片那条是『图片』/『图片地址』外加『替代文字』」
那一栏**只剩历史意义**。⚠️ **2026-10-07 起「超链接」也不在这个框里问了**：它换成
`ui/LinkDialog.tsx`（两个字段 ＋ 一颗「去掉链接」，见 §2.6i），理由是那条命令的主字段
（地址）与这个框的主字段（**第一个**）正好是反的。⇒ **今天走这个框的只剩插件那一头**：
面板按钮与菜单项声明的 `prompt`（`ui/plugin-prompt.ts::问参数`）。菜单里那几条
「插入…」**一条都不用它**（超链接 → §2.6i，图像 → §2.6f）。

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标题 / 标签 | 调用方给（如「超链接」/「链接地址」；图片那条是「图片」/「图片地址」，外加「替代文字」；插件那条是 `prompt.label`，按钮上则用按钮的字当标题） | 无 | ✅ |
| 输入框 | `placeholder` 调用方给 | `Enter` → 确定，`Esc` → 取消 | ✅ **挂载即聚焦** |
| 第二个字段 | 只在给了 `secondLabel` 时画（图片的「替代文字」；**插件的 `prompt` 只有一格**） | 同上 | ✅ |
| `secret` | 主输入框画成密码框（圆点） | 无 | ✅ 2026-09-24 加，给插件要 API key 用 |
| 「取消」/ 确定键 | 同确认框 | `onAnswer(null)` / `onAnswer(value, second)` | ✅ |

⚠️ **`secret` 遮的只是屏幕**：值本身照旧原样交出去、**原样明文存进插件的设置文件**
（`docs/12` §4.5）。它不是为了加密，是为了让旁边的人看不到这个值。
⚠️ 带 `secret` 时 `autoComplete="off"` **是必须的**：WebView 的密码管理器会跳出来问
"要不要记住"，而这里填的是 **API key** 不是登录密码——那个弹窗一出现，
用户就得先弄明白"这算不算我的账号密码"。
⚠️ **界面上不说这个框"安全"**——它只挡住旁边的人。

⚠️ **主字段为空 = 当作取消**（`value.trim() === "" → null`），**不是**发一个空串。
插件那条路靠的正是这一条：它同时挡住了"git 收到一条空提交信息"和
"AI 拿空串当提问发到网上"。⚠️ **取消 ⇒ 命令根本不调**，不是"调一个空参数"。

⚠️ `Enter` / `Esc` 收在**输入框自己**身上、**不绑 `window`**（与确认框不同）：
输入框里按 `Esc` 应该是"把输入法候选框收掉"，绑到 `window` 上抢 `keydown`
会把那一下吃掉——中文用户按 Esc 想取消选字，结果整个框没了。
⚠️ **2026-10-04 起这里多了一层**（第 50 项）：焦点陷阱由 `ui/useModalTrap.ts` 挂上
（连同一条 Esc——**组字期间不接，`isComposing`/229 都判**，所以上面那条理由原样成立；
它补的是"焦点在按钮上时按 Esc"那个洞）。两处 Esc 都通到 `onAnswer(null)`，重复调用幂等。

⚠️ **为什么不直接用 `window.prompt`**：它在 **WebKitGTK 上默认被关掉**，
调用**静默返回 `null`**——「格式 → 超链接」点下去什么都不发生，看起来就是那个菜单项坏了。
这是本节存在的全部理由，和上面那条 `window.confirm` 是**两个症状、同一种错**：
拿浏览器的模态框做桌面应用该自己画的东西。
⚠️ 它和确认框一样是**受控**的，状态都在 `ui/useDialogs.ts` 里（见 §2.6b 末）。

**为什么要自己画**：`window.confirm` **阻塞整个 WebView**，而"关一份没存盘的文档"
随时会发生、且多半发生在用户刚打完字的时候——它会打断中文输入法的组合态。
与 `Toasts` 避开 `alert` 是同一条理由，只是那边先做到、这边漏了（`docs/07` 第 29 项）。

### 2.6c Slidev「装没装」—— ⛔ 2026-09-25 起**宿主不再有这块面板**

⚠️ **本节讲的那个 `ui/SlidevPanel.tsx` 已经删了**。Slidev 从 2026-09-25 起是一个**拓展**
（`plugins/slidev/`），"装没装"那套判断与话术整个搬进了插件自己的面板
（`nota.ui.register_panel` ＋ `nota.ui.review`，见 §2.2b 与 `docs/13` §8）。
宿主这边只剩**机制**（`devserver.rs`：探、起、探活、收摊），而且 `devserver::probe`
返回的 `Probe` **一句人话都没有**——句子是插件自己写的。

所以：**要改"装没装"的界面，改的是 `plugins/slidev/main.lua`，不是这儿。**
把 `plugins/slidev/` 整个删掉，这一功能就该彻底不存在（这正是"拆拓展"的验收标准，
`ui/PluginDock.tsx` 文件头写着同一句）。宿主里那块确认框形状**留了下来**——
pandoc 那条路还在用（§2.6e），只是 CSS 类从那时的 `slidev-*` 改名成了 `gate-*`
（`styles/gate.css`：形状不专属于 Slidev）。

### 2.6e pandoc「装没装」面板（`ui/PandocPanel.tsx`）—— 2026-09-25 起

「文件 → 导出 → PDF… / Word… / 其余那几项」点下去，**pandoc 没探通**时先看见它。
壳借用确认框那套（`.confirm-backdrop` + `.confirm-dialog.gate-panel`），样式在 `styles/gate.css`
（⚠️ 不是 `styles/slidev.css`——那名字随 §2.6c 那个面板一起没了；这套形状 pandoc 也在用，
名字就不该绑在 Slidev 上）。理由：那几个格式 Nota 自己不会转，是借系统里那个 pandoc 转的，
所以点下去第一件事是**探测**——别让用户白等一次失败。装了**不出这个面板**，直接进保存对话框。

| 状态 | 符号 | 主按钮 | 当前状态 |
|---|---|---|---|
| 检测中（`probe === null`，只在「重新检测」时） | `.is-busy` 转圈 | 「检测中…」**禁用** | ✅ 验过 |
| `ready`（本机有 pandoc） | `.is-ok` 绿 ✓ | 「开始导出 ⟨格式名⟩」 | ⚠️ 到不了这儿（探通了不开面板）；真到了也得有条路 |
| `missing` ＋ **有自带 PDF**（点是 PDF 且 `fallback_pdf`） | `.is-warn` 橘 ! | **「用 Nota 自己排版导出」** | ✅ 验过（`NOTA_PANDOC_CMD` 指到不存在的命令） |
| 其余 `missing` | `.is-warn` 橘 ! | 「去官网看安装指南」 | ✅ 同上那一档，换非 PDF 格式 |
| `unknown` | `.is-ask` 灰 ? | 「仍然试一次」 | 同 Slidev：探测没问出结果 |

⚠️ **它必须说清 PDF 有第二条路**：PDF 是七种里唯一有兜底的，用户手上有能出 PDF 的工具，
面板不该把它藏起来——所以 pandoc 没装、而 `fallback_pdf` 为真时**主按钮是自己那套**，
不是「去官网」。⚠️ 反过来，**「仍然试一次」永远留着**（除主按钮已经是它的时候）：
探测是**有根据的猜测**，不是证明（pandoc 可能装在 PATH 之外，`NOTA_PANDOC_CMD` 也能指过去）。

| 控件 | 内容 | 什么时候画 |
|---|---|---|
| `pre.gate-detail` | 命令自己的输出（`command not found` 之类，**不改写**） | `detail !== ""` |
| `dl.gate-facts` | **命令** · **版本**（拿到了才画） · **排版引擎**（只在点是 PDF 时画） | `probe.command !== ""` |

⚠️ 排版引擎那一行的措辞是「**没在 PATH 里找到**」，不是「没有」——引擎可能在 PATH 之外，
那不构成"出不了 PDF"的宣判（`pandoc.rs` 的 `pdf_engine` 注释写着同一条）。

键盘：`Esc` → 关掉；`Enter` → 走主按钮；点遮罩 → 关掉。⚠️ 监听绑在 `window` 的**捕获阶段**
（焦点可能还没落进来），焦点 effect 的依赖里带 `primary.label`——换结论时主按钮是另一颗按钮。

⚠️ **判定的话全在后端写的 `message` 里**（中文），前端一个字都不重写——话从
`pandoc.rs` 来，不是从 §2.6c 那个已经删掉的面板来。

⚠️ **"检测中"那一段是这套形状里唯一一处用禁用按钮代替忙碌态的地方**：探测最长 20 秒
（自定义命令挂住的上限；正常一两秒），这期间面板一直开着、主按钮是「检测中…」且禁用。
理由是用户此刻没有别的选择，而面板本身就是"正在做事"的说明。

### 2.6f 插入图片（`ui/ImageDialog.tsx`）—— 2026-09-26 起

「格式 → 图像」或工具栏那颗图标点下去看见的框（三条入口里只有这一条是"问参数"，
另外两条是**粘贴**和**拖入**，它们不问，见 §2.6f 末）。

壳仍借确认框那套（`.confirm-backdrop` + `.confirm-dialog.prompt-dialog`——⚠️ **故意复用
提示框的类**，所以它长得像那个框，键盘行为也只有一套）。三个字段：

| 字段 | 内容 | 说明 |
|---|---|---|
| 来源 | 「本地文件」/「网络地址」两个**页签**（`div.image-src-tabs[role=tablist]`，选中的那颗带 `.btn-primary`） | ⚠️ 不是下拉：两条路的后续完全不同（本地那条能用「浏览…」选文件，网络那条要下载） |
| 地址 | `input.prompt-input`（标签与 `placeholder` 跟着页签换） | ⚠️ **两页共用同一个 state**：切页签**不清空**已填的字（用户填错页签时不用重打）。空着提交 = **取消**，与 `PromptDialog` 同一条口径 |
| 替代文字 | `input.prompt-input`，可留空 | 「浏览…」选完文件后，**只在它还是空的时候**用文件名去掉后缀补上（只是默认值） |

| 控件 | 什么时候画 | 说明 |
|---|---|---|
| `button.btn`「浏览…」 | **只在「本地文件」那页** | 走 `@tauri-apps/plugin-dialog`，过滤器 8 种后缀（与 `image.rs::认得的后缀` 同一套，`docs/03` §9.1 有那张对照表）。⚠️ 取消返回的不是字符串，那不算错误 |
| `p.prompt-hint` | 总在 | 只说**设置现在是什么**，不预告最后会写成哪条地址——预告就得在这儿把宿主那套算式复算一遍（文件头第 12–21 行） |
| hint 里第二句 | **仅当这份文档没存过盘** | 那四个"复制到…"的动作都需要文档目录，宿主会**报错**；先说出来比让用户撞一次好。判据是前端传进来的 `request.文档存过盘` |

⚠️ **这个框一个字都不算路径**：`./assets` 写成 `assets/x.png` 还是 `./assets/x.png`、
名字撞了怎么办、网络图片要不要下载——**全在宿主**（`src-tauri/src/image.rs`，
那边三十来条用例）。在这儿再算一遍就是两份实现，而它们迟早不一样。
⚠️ 所以它回给宿主的是**"图从哪来"**三选一（`{kind:"path"}` / `{kind:"url"}` /
`{kind:"base64"}`），不是一条地址。

⚠️ **另外两条入口不过这个框**（`ui/useImageInsert.ts`）：**粘贴**（`Ctrl+V` 一张图）
与**拖入**（从文件管理器拖一个文件进来）。它们没有"问参数"这一步，直接落一张。
⚠️ 这两条路在无头 X 里**喂不进去**（合成输入造不出真的剪贴板图片、也造不出 XDND），
所以本节的实机验收状态是**没验过**——如实记在 `docs/07` §4 那一格。

### 2.6g 「关于 Nota」（`ui/AboutDialog.tsx`）—— 2026-09-28 按 GNOME 的关于窗重做

用户 2026-09-28 给了一张 GNOME「终端」关于窗的截图，原话是「关于界面这么做。版本用0.3，网站先不填写。」
于是它从一个 `ConfirmDialog`（正文二十来行、`hideCancel: true`）变成一张**真的对话框**：
**首页 ＋ 子页 ＋ 两行外链**，`src/ui/AboutDialog.tsx`。
⚠️ 那个 `ConfirmDialog` 当年是**算过账**的（老文件 `ui/useAbout.ts` 的文件头写着「真到要分节跳转 / 可折叠 /
带图标的那天再拆」）——**那天到了**，`ui/useAbout.ts` **整份删掉**，状态并进 `ui/useDialogs.ts`
（`ui/AppDialogs.tsx` 早就拿着那个对象，所以 `App.tsx` 一行都没多）。

⚠️ **2026-10-04 这一页按用户三句话又改了一次**：
> 「"故障排除"记录编译信息（比如编译时间戳，机器，各编译工具依赖）」
> 「法律信息用超链接显示"bsd-2条款许可证"，点击打开窗口独立展示」
> 「故障排除用于存放编译信息和本机信息。专门新开一栏叫做权限列表。用表格的形式展示权限说明和备注。」

三句话落到三处：**故障排除换成一页机器信息**、**权限单开一页并改成表格**、
**许可证名成了开另一张框的超链接**。总口径是同时期那句「删掉各种菜单下面大段大段的无用ai味描述」
（用户对删的尺度选了**「全删」**），所以这一页和设置页里那片解释性文案是**同一批**清掉的。

| 位置 | 内容 | 当前状态 |
|---|---|---|
| 首页 | 标识（128×128，走 `ui/nota-mark.ts` 那一套嵌法）＋ `Nota` ＋ **`Leo Lee`**（2026-10-10 之前是 `Nota contributors`）＋ **版本药丸** | ✅ ⚠️ **版本号取不到照样要弹**——那一格先画「Unknown」，取到了再换。「关于」正是用户来查版本的地方，在这里因为查不到而什么都不显示是最坏的一种失败 📌 **2026-10-10：作者那一行与那句版权成了 `Leo Lee`**（用户原话「还有，软件作者叫Leo Lee。」）——**四处同源**：这一页显示的那行 / 同页「法律信息」里那句 `Copyright (c) 2026, Leo Lee` / `LICENSE` / `Cargo.toml` 的 `authors`（外加四个内置插件清单里的 `authors`）。⚠️ 人名**不走 `t()`**（`zh-ui.ts` 里那两条键同批删了，留着会被 i18n 闸报废键） |
| 首页那两**行** | 「网站 `(W)`」「报告问题 `(R)`」，行尾 `↗`，点了交给系统浏览器（`openUrl`） | 🟡 **今天两个网址常量是空串，所以两行根本不画**（口径 ②：画一颗点了什么都不发生的按钮比少一行更像是坏了）。填上 `src/ui/AboutDialog.tsx` 顶上那两个常量就出现；⚠️ 打不开时**不弹提示**（这一条不改变文档、也不影响用户正在做的事） |
| 首页那四**行** | 「故障排除 `(T)`」「权限列表 `(P)`」「鸣谢 `(C)`」「法律信息 `(L)`」，行尾 `›`，翻进子页 | ✅ 子页里顶上一行是「‹ 返回」，右上角那颗 × 一直在 |
| 子页 · 故障排除 | **两张表**：**编译信息**（包版本 / 编译时间 / 编译主机 / 编译平台 / 目标三元组 / 构建档案 ＋ `rustc` `cargo` `node` `npm` `tauri` `webkit2gtk` `gtk` `mlua` 八行版本）与**本机信息**（操作系统 / 内核 / 架构 / GTK 版本 / WebKitGTK 版本） | ✅ 2026-10-04 换成这个（用户：「记录编译信息（比如编译时间戳，机器，各编译工具依赖）」＋「用于存放编译信息和本机信息」）。⚠️ 数据来自 `api.diagnostics.collect()`（`src-tauri/src/diagnostics.rs`），**翻到这一页时才拉**（进框就拉是白拉），拉过一次就不重拉。⚠️ **空串画成「—」**——这一页的存在理由是"出事时一次问清楚"，绝不能因为缺一条整页空白。⚠️ 左列那八个**程序名与包名故意不翻**。⚠️ 它以前装的是权限清单，**整块搬去「权限列表」了** |
| 子页 · 权限列表 | **一张两列表**（**权限说明** ｜ **备注**），十条，口径与出处在表下面 | ✅ 2026-10-04 新开的一页（用户：「专门新开一栏叫做权限列表。用表格的形式展示权限说明和备注」）。⚠️ 以前它是"名字 ＋ 一段话"的清单，在故障排除里。⚠️⚠️ **这张表必须 `table-layout: fixed` ＋ 给左列 `width`**（`.about-table-2col`，`overlay.css`）：光靠默认的 auto 布局，那条共用的 `overflow-wrap: anywhere` 会把每格的 min-content 宽压到一个字，两列**挤成一坨、右列紧贴着左列**（2026-10-04 目检抓到的，现场记在 `docs/06` §5.49） |
| 子页 · 鸣谢 | 一张**表**（Tauri / React / Milkdown·ProseMirror / KaTeX / Mermaid / mlua·Lua / vscode-icons / Pandoc / **SCOWL**） | ✅ ⚠️ 加一个在**那张表**里添一行，别去改拼装。⚠️ 只写**真的用了、而且是用户看得见的那种**，传递依赖闭包有几百个（清单在根目录 `THIRD-PARTY.md`）。⚠️ **2026-09-28 加了 SCOWL**（拼写检查的词表，用户点名「拼写检查找一个 BSD 开源的属个名」）——**Nota 一个字典字节都不带**，链子是 WebKitGTK → libenchant → hunspell → 系统字典，所以这一行的义务落点在打包那一侧；正文在 `THIRD-PARTY.md` §7。⚠️ **底下那句「完整清单见 THIRD-PARTY.md」2026-10-04 删了**（全删那批），要恢复就加回这里。📌 **2026-10-06：每一行都多了「项目主页」与「许可证」两样**（用户：「这个里的链接和许可证公示」）——名字成了外链（点开走系统浏览器），下面多一行许可（`.about-item-license`）。⚠️ 链接不是手写的：与根目录 `THIRD-PARTY.md` 那批同一次、同来源（`cargo metadata` / `package.json` 的 `repository`）。⚠️ 打开失败**要在这一页说一句**（`.about-err` 那行红字）——第一版只 `console.warn`，用户只能说"点了没反应"。 ⚠️ **2026-10-11 那一批又补了两行**（同一条判据：真的用了、而且是用户看得见的）：**`zspell`**（拼写检查的引擎，**Apache-2.0**——⚠️ 选型时拿到的第二手材料说它是 MIT，以仓库正文为准；它和 §7.2 那条更正是一笔账）与 **`tauri-plugin-clipboard-manager`**（读剪贴板，2026-10-11 那一批加进来、`THIRD-PARTY.md` §1 **当时漏登记**、同一批补上）。 ⚠️ **2026-10-16 又多一行 `Monoton`**（「Nota」那三个字的字标字体，随包分发：`src/assets/fonts/Monoton-Regular.ttf` ＋ 同目录 `OFL.txt`；正文在 `THIRD-PARTY.md` §8）。 |
| 子页 · 法律信息 | **一个超链接**：「BSD-2-Clause 许可证」，点它开 `ui/LicenseDialog.tsx`（**另一个框**，全文从仓库根 `LICENSE` 读）＋ 版权行 | ✅ 用户 2026-09-26 要求「版本号显示；许可证显示(BSD2)；致谢列表（预留）」；2026-10-04 改成超链接（用户：「用超链接显示"bsd2条款许可证"，点击打开窗口独立展示」，并明确选**「应用里的另一个框」**） |

⚠️⚠️ **「权限列表」那张表是「声明」，实现是另一处代码——两处对不上就是撒谎。**
出处分三类：前三条 = `src-tauri/capabilities/default.json` 的 `permissions`（逐条对着抄的）；
第 4 条 = `src-tauri/tauri.conf.json` 的 `assetProtocol.scope` 与同一个文件里的 `csp`；
其余 = 我们自己的 `#[tauri::command]` 实际干的事。**改了上面任何一处，这张表要在同一批里跟着改**。
⚠️ 表里那一条「强制专注用到的那三样」（①知道自己是不是当前窗口；②弹一个置顶的全屏窗；③出声）
与首次进入强制专注时的说明弹窗（§2.11 末段）**说的是同一件事，两处措辞要一致、改一处要改两处**。

⚠️ **2026-10-04 删掉了这一页的两块**，都别再照旧文档往回找：
① **「明确没有申请的」那七条**（老文档里写着「这七条才是用户真正想知道的」）——
用户这一轮选了**全删**，那七条属于"解释性文案"，连同它的三条出处说明一起没了；
② **鸣谢页底下那句「完整清单（含各自许可证）见 THIRD-PARTY.md」**。
⚠️ 真要说回来，说回 `src/ui/AboutDialog.tsx` 里现在那一处，别的地方已经没影子了。

⚠️ **两条实现口径**（都在 `AboutDialog.tsx` 的文件头）：
① **表在渲染里现建，不是模块级常量**——`t("…")` 要等语言定下来才有正确译文，
模块级求值时语言还没定、之后**没有任何东西会通知它重算**（同 `ui/PluginDock.tsx::能力名` 那条）；
② **行尾两个记号是文本字形不是图标**（`›` / `↗`，还有返回那颗 `‹`）——本仓那 96 枚 Folio 图标里
没有 chevron / 外链箭头（`ui/Icon.tsx` 的名字表里没有这两样），为一个字符加一枚资源不划算。

⚠️ **许可证那张框**（`ui/LicenseDialog.tsx`，2026-10-04 新增）：全文走 Vite 的 `?raw`
从**仓库根目录那份 `LICENSE`** 读进来，**不抄第二份**。⚠️ 它开在**进程内**——
交系统浏览器要走 `opener:allow-open-url`、真开一个 OS 窗口要新加 `core:window:allow-create`
一类能力，这条路两样都不碰（那条判断记在 `docs/10` 的权限表里）。
⚠️ 它和关于框**两层 z-index 都是 200**，靠 DOM 顺序分前后（它画在关于框**之后**），
所以 `Esc` **要有归属**，不然一次 `Esc` 把两层一起关掉。⚠️ 这里**两道都得有**，
而且**缺一道就漏**（2026-10-04 目检真踩过，见 `docs/06` §5.49）：
① `ui/useModalTrap.ts` 认领 `Esc` 时**要 `stopPropagation`**——它绑在 window 的
**捕获**阶段，不拦的话同一个 `Esc` 还会走完冒泡、落到 `AboutDialog` 那条上；
② `AboutDialog` 那条 `Esc` 的 effect 里那句「许可证开着就 return」是**第二道**，
管的是"焦点/事件路径绕过 `useModalTrap` 那一下"。⚠️ 只写 ② 时表现就是
"一次 `Esc` 两层一起没"——那一批目检抓到的正是这个。

⚠️ **助记键那对括号走了 HTML `accesskey`**（`Alt+W` / `Alt+R` / `Alt+T` / `Alt+P` / `Alt+C` / `Alt+L`）。
本仓菜单栏占用的 `Alt` 组合是 `M` / `P` / `↑` / `↓` / `1`–`5`（`ui/commands.ts`），这些字母都空着、不撞。
⚠️ **`accesskey` 在 WebKitGTK 上到底认不认没开窗验过**——记在 `docs/07` 的账里。

⚠️ 壳（`.confirm-backdrop` / `.confirm-dialog`）与别的框**共用**：长得一样、行为也一样
（`Esc` 关、点遮罩关、`Esc` 在子页里也是**关掉整个框**而不是退回首页），
样式不该有两套（`src/styles/overlay.css` 文件头那段「五段用的是同一层壳」）。本文件只加 `.about-*` 那几条。

⚠️ **滚动与换行那两条 CSS 是从 `.confirm-message` 那里搬过来的，不是重新拍的**（2026-09-28）：
「故障排除」那一页二十来条，所以**正文区自己滚**（`.about-page-body` 的 `max-height: 55vh`
＋ `overscroll-behavior: contain`），**标题行与返回键不跟着滚**——滚到一半还得能按返回，
这一条是那一页能不能用的关键。⚠️ 那两个值当年就是为**这个框**加在 `.confirm-message` 上的
（它当时是一条消息）；这一页搬走之后那一条**照旧留着**——`ui/useFocusIntro.ts` 那段首次说明
与 `ui/usePlugins.ts` 那段信任签名也不短，而且 `askConfirm` 是公开的一层，
**别把它读成「只有关于框在用」**（`src/styles/overlay.css` 那两条注释 2026-09-28 同批改准了）。
⚠️ **滚动区要留 `padding-right`**（`.about-page-body` 与 `.lic-text` 各 12px，2026-10-04）：
WebKitGTK 在这台机器上用的是**浮层滚动条**（没有轨道、直接压在内容上），不留白的话
最长那一行的**最后一个字被那根条压住**。`scrollbar-gutter` 管不了浮层滚动条。
⚠️ **换页时焦点要重给一次**（给「当前页最上面那颗按钮」：首页是 ×、子页是返回）——
不然翻进子页之后焦点还留在上一页被卸载掉的那颗按钮上，`Tab` 会从文档开头重新数。

### 2.8 Slidev 预览 —— ⛔ 2026-09-25 起**不再是宿主的一页**

⚠️ **本节讲的那一整条链已经搬走了**：`ui/SlidevPreview.tsx`、那一页 `@slidev`
（`PluginDock` 里手写的内置页）、「另开窗口」（`nota_slidev_open_window`）全删了。
现在预览就是**插件声明的普通面板**——`plugins/slidev/main.lua` 用
`nota.ui.register_panel` 声明一块、面板里放一个 `kind = "frame"` 的内容块，
地址由宿主填（`lua/api/devserver.rs::填_frame`）。用户原话是
「几个不是所有人能用到的功能放到拓展里面，然后如果删了拓展的话，那这项功能将完全全不复存在」。

所以本节现在只记**剩下的那点宿主形状**：

| 方面 | 事实 |
|---|---|
| 入口 | 插件自己的菜单项（`nota.ui.register_menu`，落在「插件」那个菜单里）＋插件栏里那块面板。⚠️ **`ui/commands.ts` 里那条 `view.slidev` 也删了**（那里留了一段注释说明去向）——「视图」菜单里已经没有它 |
| 那个 `frame` 块 | **全仓唯一一处"把外部内容嵌进 DOM"**（见 `panel-nodes.ts` 与 `styles/dock.css::.panel-frame`）：只有 `http://localhost:*` / `127.0.0.1` 放行、CSP 的 `frame-src` 钉着、高度 120–2000 之间夹 |
| 看大图 | 走**用户自己的浏览器**：`nota.devserver.open_in_browser()`，⚠️ **不收参数**，地址是宿主自己在 `status` 里拼的那个——插件连"我要打开 X"都没有机会表达。⚠️ 与 `nota.ui.open_url` 是**两条不同的门，别合并**：后者的边界是**协议**（只放行 `https://`，`http://` 在那边被故意挡住），前者的边界是**归属**（只能是自己这场会话）。理由见插件面板那段注释：全屏演示与演讲者视图（双屏）**只有真浏览器有**，嵌在面板里的 iframe 给不了。⚠️ **2026-09-26 起这个插件也申请了 `ui.open_url`**——但**不是**为了这条"看大图"：它只用于「这台机器没装 Slidev」那两档上的「去官网看安装指南」（`https://sli.dev/guide/`，`docs/07` BUG-35）。**两条门各走各的，别顺手合并** |
| 面板里有什么 | **三态**（2026-09-26 起，第三态是补回来的）。**开着**：一行「正在预览」（《标题》· 端口 N）＋ `frame`（高 520）＋ 两颗按钮「停止预览」「用浏览器打开」＋ 一句"改文档会自动重新渲染"。**没开**：探测结论那句话（可能带 `detail`）＋ 日志最后 12 行＋ 按钮「开始预览」/「仍然试一次」「重新检测」，⚠️ **探测说"跑不起来"那两档还多一颗「去官网看安装指南」**。**还没探完**：一句「正在检查这台机器上有没有 Slidev…（最多 20 秒）」＋「查完这一页会自己更新。等不及就点下面那颗「立刻检测」。」＋ 一颗「立刻检测」——⚠️ **这一态不画事实表**（还没看过的东西不许摆上去），而且**是点开页签的第一帧**（`docs/07` BUG-36 修之前这一帧是空白）。全在 `plugins/slidev/main.lua`，**改界面去那儿改** |
| 起不来 | 把 **Slidev 自己的输出**（最后 30 行，`devserver.rs::LOG_TAIL`）端给用户。缺主题、端口被占这类病因只有它说得准 |

⚠️ **等端口那 180 秒**（`devserver.rs::START_TIMEOUT`）由**插件的 `start` 调用**挡着：
`nota.devserver.start` 是**阻塞**的，插件在自己的面板上得有忙态。宿主这一侧**没有转圈**，
因为那时宿主只是在等一个 `spawn_blocking` 线程。

⚠️ 预览是**给某一份文档**开的：切到别的标签**不动它**，也不会把别的文档的正文灌进去。
判据在插件里（它比对 `nota.document.get_title()` 与存下来的那个），宿主不替它判断。

⚠️ **它看的是一份 Nota 现写现喂的入口文件**：`devserver.rs` 的 `写入口`——有文档目录就
写在文档旁边、否则退回数据目录，文件名带 `doc_id`（`DevServerSpec::entry_name`）。
正文一改就整份重写它（`nota_doc_sync` / `nota_doc_settle` 里那个 `推给预览`），
热更新归 Slidev 自己的 Vite。**用户自己的 `slides.md` 和保存设置一个字节都不动**
（这正是"预览要能实时、又不能改用户的文件"这两条的折中）。

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
| 上色 | SVG 里 355 处写死的 `fill="#2e3436"`（GTK 深灰）**不参与渲染**：`.icon` 用 `background-color: currentColor` + `mask-image` 抠出来，所以图标**跟着 `color` 走**（hover / `data-on` / 明暗都跟着走） |
| 为什么要两套前缀 | `-webkit-mask-*` 与 `mask-*` 都写。真窗口是 WebKitGTK（只认带前缀的），验证用的浏览器是 Chrome（认不带前缀的）——**少一套就在其中一边整片不显示**。⚠️ 这类"一边显示一边不显示"的问题在截图里看不出来，只有换一边跑才现形 |
| 无障碍 | 图标一律 `aria-hidden="true"`，名字写在按钮的 `aria-label` 上。⚠️ **故意没有 `.sr-only`**：加了它就得再管一层"文本节点被读两遍"，这里按钮数量少，`aria-label` 更省事 |

**哪些控件用了图标、哪些还是字**：

| 用了图标 | 还是文字 |
|---|---|
| 工具栏：粗体 / 斜体 / 删除线 / 无序列表 / 有序列表 / 代码块 / 清除格式 / 链接 / 图片 / **引用 / 任务列表** | 工具栏的 `H1` `H2` `H3` |
| 侧栏收起的 ×、侧栏空态那颗「打开文件夹…」、插件栏的 ×、**格式化工具栏右端的 ×、状态栏右端的 ×**（2026-10-04，第 49 项）、标签页的 ×、提示条的 ×、查找条的 × | 菜单栏（菜单项本来就是文字） |
| **下栏那几枚**（2026-09-30）：`nota-sidebar-toggle-symbolic`（空心圆）/ `nota-sidebar-collapse-symbolic`（`‹`）/ `folio-insert-code-symbolic`（`</>`）／**悬停才出现的两枚**：`nota-spellcheck-symbolic`（`A✓`）/ `nota-unfold-more-symbolic`（上下双箭头） | ⚠️ **状态栏 2026-09-30 起从这一列搬到了左边那一列**——它现在**整条都是图形**（四枚按钮 ＋ 一个字数列）；三枚 `nota-*` 是**照 Typora 自己画的**（见下） |

⚠️ **为什么 H1/H2/H3 还是文字**：Folio 那套里**没有**对应的动作图标
（它自己的标题是下拉菜单里的文字项、引用/任务项走的是 `format-text-*` 之外的另一组），
而以拉丁字母当字形是站得住的（`H1` 本身就是通用写法）。
**汉字不能走这条路**——「引」「任」原先就是汉字字形，16px 下笔画糊成一团，
2026-09-24 换成了自己画的两枚（`nota-quote` / `nota-task`，见下）。
⚠️ 所以工具栏**本来就是混的**：图形 + 拉丁字母字形，不是"图标没搬全"。
**哪些是搬来的、哪些是自画的，看前缀**（`folio-` / `nota-`）。

⚠️ **只搬动作图标，不搬应用图标**：`folio-*.svg` 是 Folio 自己的脸，
Nota 的脸是用户逆向出来的 `src-tauri/icons/nota.svg`。

#### 设置对话框左栏那九枚（2026-09-24 并入，2026-09-25 换掉两枚）

**2026-09-24 之前**这里是另一套：`ui/settings/primitives.tsx` 里自己有一份 `Icon`
（连 `IconName` 类型一起），5 枚 24 格、描边不填充的手写细线图标。
它已经**不存在了**——十页现在走应用这同一套（`SettingsDialog.tsx` 的 `SECTIONS`
给名字，`Icon.tsx` 的名字表收口），所以全应用一副面孔。
⚠️ 本节上一版还在讲"两套并存、两个同名 `Icon`、键盘图标那两条理由"，
那是**并入之前**的状态；键盘图标后来自己画了一枚（`nota-keys-symbolic`），
画法那一层则由"九枚统一到 16 格填充"解决。

**2026-09-25 换掉两枚**（用户看完成品提的）：

| 页 | 原来 | 现在 | 为什么换 |
|---|---|---|---|
| Markdown | `folio-format-show-marks-symbolic`（段落符 `¶`） | `nota-markdown-symbolic`（框里的 **MD**） | `¶` 说的是"显示编辑标记"——那是**另一个设置项**，不是 Markdown 这一页在讲的事 |
| 文档主题 | `folio-page-guides-symbolic`（页面 + 分页参考线） | `nota-doc-theme-symbolic`（框里的 **Aa**） | 分页参考线说的是"打印/页码"，与"正文的字体和配色"无关 |

用户原话：「markdown 左侧的图标你可以画一个 MD，用一个框框框起来」「文档主题
你也不要用这个啊」。教训是**图标画得再好看，指错了东西也没用**：挑法要能被
那一页的正文印证（Markdown 页在讲语法，文档主题页在讲字体与配色）。

⚠️ 这两枚也因此**要按 20px 画、按 20px 用**：框里塞两个字母，16 格下是两个黑团
（实测），所以左栏那颗 `<Icon>` 显式给了 `size={20}`——九枚里另外七枚
在 16 与 20 下都清楚。⛔ 框里**不放汉字**（用户 2026-09-24 退过「引」「任」当图标）。
⚠️ 它们**不属于** Folio 那 96 枚，不受"一个字节都不许改"的约束——见
`THIRD-PARTY.md` §5 里新加的那一段。

#### 下栏那四枚（2026-09-30，照 Typora 画的）

**用户说「照 Typora 画两枚 Nota 图标」**，指的是 Typora 下栏左边那两颗：**一个空心圆圈**
（切侧栏）和一个**左向的尖括号**。落成 `nota-sidebar-toggle-symbolic`（空心圆，
侧栏**关着**时画）与 `nota-sidebar-collapse-symbolic`（`‹`，侧栏**开着**时画）。

⚠️ **同一天晚上又添了两枚**（用户「再修改一下底栏的逻辑」那一批）：右边统计量
那两侧**悬停才出现**的 `nota-spellcheck-symbolic`（`A✓`，拼写检查开关）与
`nota-unfold-more-symbolic`（上下双箭头，展开「字数统计」小菜单）。形状见
上面 §2.5 那张图2。这两枚与前两枚同一个来路，下面四条决定**逐条适用**。

| 决定 | 为什么 |
|---|---|
| ⛔ **没有搬 Folio 的 `sidebar-*-symbolic`** | 挑了 Typora 的形状就得自己画：Folio 那两枚是"侧栏 + 箭头"，与"空心圆 / 单尖括号"是两个样子。⚠️ 而且 Folio 那两枚是**应用图标**那一类里的（`sidebar-show` / `sidebar-hide`），按 §2.9 上面那条"只搬动作图标"的精神也该自己画 |
| 画法走 `.icon` 那套（`mask-image` + `currentColor`） | 与其余 96+ 枚一致：**只有 alpha 参与渲染**，颜色跟着 CSS 的 `color` 走——所以悬停、`data-on` 的强调色、明暗主题**一个都不用单独写** |
| 空心圆**只有描边**，没有填充 | Typora 那枚就是空心的；⚠️ 填实了在 16px 下与"一个圆点"分不清，而下栏那两枚的判据就是**形状**（下栏没有文字） |
| `‹` 用**描边**而不是字体里的 `‹` 字符 | 字体字的粗细 / 基线 / 左右留白都由字体决定，16px 下会与空心圆**对不齐**（同一排两枚图标，一个胖一个瘦最显眼）。画成路径就都归 16 格管 |

⚠️ 这四枚和上面 `nota-markdown-symbolic` 那两枚一样，**不属于 Folio 那 96 枚**
（来源与许可见 `THIRD-PARTY.md` §5）。⚠️ **`docs/02` 的图标账里它们各占一行**，
`tools/doc-sync-check.sh` 的 `PAIRS` 里也各占一行——加图标时这三处（外加 `Icon.tsx`
的名字表）**四处同改**，漏一处检查器会 FAIL。

⚠️ 悬停那两枚**另有一条**判据（与形状无关）：它们由 `.status-aux` 的 `opacity`
控制，而**形状照样得对**——`opacity: 0` 不是 `display: none`，画错了在
`FOLIO_SNAPSHOT` 那种整页截图里也看得见（那类图是不带指针的，两枚一律透明的
状态反而**看不着**，所以真验它们要**悬停着**截，见 `docs/06` §5.1）。

⚠️ 真窗口里验过（`docs/06` §5.1 那套 Xvfb 流程）：`-webkit-mask-*` 在 WebKitGTK 里生效，
工具栏那 9 枚、以及侧栏/插件栏/标签页的 × 都是**图形**，不是方框。

### 2.6h 插入 Emoji（`ui/EmojiDialog.tsx`）—— 2026-09-27 起

菜单「格式 → 插入 Emoji…」点下去看见的框（⚠️ **没有加速键**，理由写在
`ui/commands.ts` 那一行：它是个"挑一个字符"的动作，占一个全局键位不划算）。
壳借确认框那套（`.confirm-backdrop` + `.confirm-dialog.emoji-dialog`），三个部分：

| 部件 | 内容 | 说明 |
|---|---|---|
| 搜索框 | `input#nota-emoji-search.prompt-input` | `onChange` 即筛，**挂载即聚焦**；搜索串两头各去掉一个冒号（用户很自然会带着 `:` 打），并转小写 |
| 分类 | `div.emoji-cats[role=tablist]` 里 12 颗 `button.btn.emoji-cat` | 「全部」＋ 11 个分类，当前那颗带 `.btn-primary`。⚠️ **必须有「全部」**：不摆它，用户进了某个分类就出不来（只能关掉框重开） |
| 网格 | `div.emoji-grid` 里的 `button.emoji-cell` × N | 每格是 `span.emoji-glyph`（字符）＋ `span.emoji-name`（`:短代码:`）。筛空时这一块换成 `p.prompt-hint`「没有匹配的 Emoji。」 |

⚠️⚠️ **它的搜索口径与编辑区那块补全面板故意不一样**：这里做**子串** `includes`，
面板**只做前缀**。理由是两种场景——用户在这儿是**在找**（"我要找一个 emoji，但不知道
该打哪个短代码"），多给几条候选比少给好；面板是**边打边筛**，`:` 后面一个 `a` 做子串
会命中几百条、反而挡着人。⚠️ 所以它没有复用 `找Emoji`，直接走 `Emoji表` 上的 `includes`。

⚠️ **它没有"上下键高亮、回车选当前那条"这一层**（回车＝**选第一条**）：那一层要维护
一个选中下标，而它的收益（少点一次鼠标）在"我在找东西"的框里不成立。⚠️ 面板那边
**必须**有上下键——那是打字流里，手不在鼠标上。

⚠️ **这个框一个字都不碰文档**：它只回**一个字符**，插到哪儿由 `App.tsx` 的
`插入Emoji` 交给 `run("insertText", …)`——与「插入图像」同一条口径（框不持有编辑器）。
⚠️ 三条行为与另外三个框一致：`Esc` 取消、点遮罩取消、点「取消」取消（给 `null`）。

⚠️ **11 个分类名逐个写成字面量 `t("表情")`**（`分类文案` 那个 `switch`）：
`tools/i18n-check.sh` 只认源码里的字面量，写成 `t(变量)` 会让那 11 条英文被算成
"废键"（FAIL）；⚠️ 也**不能**把 `editor/emoji.ts` 加进检查器的"表存键"名单——
那里的中文是**数据**（分类名），进去会把 503 条表项全算成键。

### 2.6i 「链接」那个框（`ui/LinkDialog.tsx`）—— 2026-10-07 起

用户 2026-10-07 的原话：「超链接的逻辑更新一下：插入链接出现一个窗口："链接显示名称"
和"链接内容"。如果单击链接则也显示这个窗口。」（`docs/07` 第 96 ＋ 102 项并成一件做。）

壳仍借确认框那套（`.confirm-backdrop` + `.confirm-dialog.prompt-dialog`——⚠️ **故意复用
提示框的类**），所以它长得像那个框，键盘行为也只有一套。两个字段：

| 字段 | 内容 | 说明 |
|---|---|---|
| 链接显示名称 | `input#nota-link-label.prompt-input` | **挂载即聚焦并全选**（里面填的常常是"已有的那一条"）。可以留空——落文档时**用地址顶上**（空名字的链接在屏幕上点不着也看不见） |
| 链接地址 | `input#nota-link-href.prompt-input` | ⚠️ **主字段是这一个**：空着点确定 = **取消**（与 `PromptDialog` / `ImageDialog` 同一条口径），因为落一条空 `href` 的链接点下去什么都不发生，比纯文字更让人困惑 |

| 控件 | 什么时候画 | 说明 |
|---|---|---|
| `button.btn.btn-primary`「插入」/「确定」 | 总在 | 新建时写「插入」、编辑已有链接时写「确定」——同一颗按钮，两句话 |
| `button.btn`「去掉链接」 | **只在"本来就在一条链接上"时**（判据是请求里那个 `editing`） | **第三条路**：既不写新的、也不取消，而是**把标记摘掉、文字留着**。⚠️ 排在**最左**（不挨着用户按确定的那根手指），也**不设 `btn-danger`**——它不会丢字 |
| `button.btn`「取消」 | 总在 | 取消是**一个字都不动** |

⚠️ **它自己不碰编辑器**：只把"名称 ＋ 地址"或"去掉"交回去（`ui/useDialogs.ts` 那套
Promise 式问答，第五个框）；怎么写全在 `editor/link-edit.ts`（与「插入图像」同一条口径）。

**两条入口都到这个框**：

1. **插入**——菜单 `fmt.link`（`Ctrl+K`）与格式化工具栏那颗 🔗（`ui/useEditorCommands.ts`
   的 `插入链接`）。⚠️ 工具栏那颗走的是 `按钮.cmd` 那条路（原来的 `link` 命令），所以
   `run("link")` 在那一层**改道**到这个框——不改道的话，它照旧调上游那条 toggle，
   给选中的文字挂上一条**空 `href`** 的链接。预填规则：光标处已经是一条链接 → 填它的
   现值（`editing` 也为真）；否则拿**当前选中的文字**当显示名称。
2. **单击正文里那条链接**（`ui/useLinkClick.ts`）——框里填的是**这条链接的现值**，
   `editing` 为真（所以多那颗「去掉链接」）。⚠️ **`Ctrl`（或 `⌘`）＋单击**走另一条路：
   交给系统浏览器（`openUrl`），**不弹框**；⚠️ 打不开时**弹一条红提示**
   （「打不开浏览器：…」，与「去官网」那颗同口径——这一下是用户刚做的动作，
   不能一声不吭，见 `docs/06` §5.59 那条环境账）。
   ⚠️ **只读那一侧不接线**：分屏右侧预览、导出用的离屏实例（判据取 `contenteditable`）。

⚠️ **`Esc` / 点遮罩 = 取消；`Enter` = 提交**，两条都只挂在输入框自己身上（不绑
`window`——输入框里按 `Esc` 首先是"把输入法候选框收掉"，绑 window 抢会把那一下吃掉）。
⚠️ 这个框一开，`Esc` 就归它（`App.tsx` 的 `有浮层` 数着 `linkReq`），不会顺手把沉浸
模式一起退掉。

### 2.7 崩溃屏（`ErrorBoundary`）

| 控件 | 文案 | 回调 | 当前状态 |
|---|---|---|---|
| 标题 | 「界面出了点问题」 | 无 | ✅ |
| 说明 | 「你正在编辑的内容还在后端存着，没有丢。…」 | 无 | ✅ 与 §真相在哪 的口径一致：崩溃丢的是前端那份（真相），后端的镜像还在。⚠️ 但镜像最多滞后一个去抖周期，所以**最后约 300ms 的击键可能没进镜像**（`docs/03` §1.1） |
| 详情 | `error.message` + 组件栈 | 无 | ✅ |
| 按钮 | 「试着继续」 | `setState({error:null, info:null})` | ✅ |

另外 `installErrorHooks()`（在 `main.tsx` 里调一次）把 `unhandledrejection` 与
`window.error` 打到控制台——打包后没有 devtools，那时这类错误走 journal。

### 2.10 沉浸模式（专注 / 全屏共用的那套外壳规则）—— 2026-09-25 起

用户原话：「你现在的全屏模式和专注模式也不是那么的好，所以说把它再优化一下喽，
因为现在没有提到实际的让用户更专注的作用。」

改之前是两件事各干各的：**全屏只把窗口放大**（菜单栏 / 侧栏 / 插件栏 / 标签栏 /
状态栏一条不少），**专注只把非当前段落压暗**（外壳一点没动）。而写作时真正碍事的
恰恰是那些横条竖栏——于是两条都改了，并且**合成一件事**。

| | 窗口 | 正文 |
|---|---|---|
| 全屏（`F11`） | 真全屏 | 不动 |
| 专注（`F8`） | 不动 | 压暗非当前段落（`editor/writing-modes.ts`，见 §2.3） |

**收起来的东西**（两条一样）：菜单栏 / 侧栏 / 插件栏 / 标签栏 / **状态栏**。
⚠️ 收的是**画不画**（`display: none`）而不是"卸载"——侧栏停在哪一页、插件栏开着哪个面板、
开了哪几个标签，退出来必须原样回来；卸载再重挂会把它们全忘掉（开窗实测过这一条）。

⚠️⚠️ **2026-09-30 标签栏/状态栏搬进 `main.app-main` 之后，这条规则照旧成立**
（规则是 `.app[data-zen="true"] .tabbar/.statusbar`，**后代选择器**，孩子换了爸爸还是后代）。
⚠️ 搬完特意看过一眼这一条，因为**它的失效方式很安静**：CSS 不报错，只是专注模式下
底下两条横条还在——而"专注模式里还剩两条横条"很容易被当成"本来就这样"。
⚠️ 往下还有一条**相反**的：`.app-main[data-review="true"] > …`（`styles/review.css`）
用的是**直接子元素**排除法，最后那两个孩子没在排除名单里，**所以插件预览态下它们照画**
——这是有意的（预览的是正文，不是把下栏也藏了）。

判据是 `.app` 上**一个**属性：`data-zen`（`专注 ∨ 全屏`，`undefined` = 这个属性不出现）。
CSS 在 `styles/app.css` 的「沉浸模式」一节，状态与三条出口在 `ui/useImmersive.ts`。
⚠️ **只有这一个属性**：两条模式各挂一个 class 的话，CSS 里每一条规则都要写两遍，
而"只写了其中一条"这种错没人看得出来。

#### 顶栏怎么唤回来

菜单栏是沉浸收掉的东西里**唯一写着"怎么退出去"的地方**，所以不能真的没有：

- 窗口顶端留一条 **`--zen-peek`（6px）** 高的窄带（`.zen-top`），顶栏平时**滑到窗口外面**
  （`translateY(-100%)`），鼠标碰到那条窄带就滑回来；
- ⚠️ 悬停判据挂在**那条窄带的容器**上，不是挂在顶栏自己身上——顶栏滑回来以后盖住了
  那条窄带，挂在顶栏上的话指针一动就"离开窄带 → 缩回去 → 又碰到窄带"，来回抖；
  挂在祖先上，指针落在它的任何后代里都算"还在"；
- ⚠️ 那条窄带必须**明显比顶栏矮**（6px vs `--toolbar-height` 38px）：抬高一点点用户
  想点正文最上面那行时就会把菜单栏拉下来。

#### 三条出口

| 出口 | 给谁 |
|---|---|
| `F8` / `F11` | 记得住键位的人（键位在 `ui/commands.ts`） |
| `Esc` | 记不住的人——**这一条是这套界面敢把菜单藏起来的前提** |
| 鼠标顶到窗口最上面 | 手里只有鼠标的人。⚠️ **严格说这一条是"把出路露出来"而不是"一步退出"**：指针碰到那条 6px 窄带，菜单栏滑回来，再点「视图 → 专注模式 / 全屏」才真的出去。进沉浸时那条提示的原文就是「鼠标移到窗口最上面可唤回菜单栏」——**它承诺的是唤回菜单栏，不是退出**，文档别把它写成第三种一键出口 |

⚠️ `Esc` **先让给浮层**：设置 / 确认框 / 输入框 / pandoc「装没装」面板开着时，
那一下是它们的（`ui/useImmersive.ts` 的 `有浮层` 入参，`App.tsx:460-464` 里逐个列出来
——**四个**：`settingsOpen` / `confirmReq` / `promptReq` / `pandocGate`——**加浮层就来这儿加一行**）。
⚠️ 2026-09-25 起名单里**少了一个**：Slidev「装没装」不再是宿主的一块浮层（§2.6c）。
菜单不在名单里——它自己收自己。
⚠️ 进沉浸时弹一条 **6 秒**的提示条写明这三条路（默认 3.2 秒太短，这句话要读一遍）。

⚠️ **「鼠标顶到窗口最上面 → 菜单栏滑回来」这条出口和用户自己关掉菜单栏是两件事**
（2026-09-28）：前者是沉浸时的一条 CSS 规则（`.app[data-zen]`，顶栏滑出窗外、再由那 6px
唤回），后者是设置 `appearance.show_menu_bar`（`Alt+M` 那一格）。两者在 `App.tsx` 里
**合成同一个布尔**交给 `TopBar`（`hideMenuBar={usingNativeMenu || !menuBarOpen}`），
`TopBar` 只知道"顶上那一条画不画"。⚠️ 于是**用户自己关掉菜单栏之后再进沉浸**，
那条唤回的窄带**唤不回任何东西**——不是坏了，是那一栏本来就被关掉了；出沉浸那三条路里
还有 `F8`/`F11`/`Esc` 两条不靠它。

⚠️ **全屏那一格的勾是从窗口读回来的**（`isFullscreen()` ＋ 订阅 `onResized`），
不是内存里自己记的：`F11`、窗口管理器的快捷键、macOS 的绿灯、双击标题栏都能进全屏，
而只有第一条经过我们的代码。只翻内存那个值，症状就是"菜单里的勾和窗口真实状态分叉"。
⚠️ 这条链上"失败"是**静默**的（读不到就维持现状）——它不是用户发起的动作，
报错也无从补救。

### 2.11 强制专注（`ui/FocusMeter.tsx` ＋ `ui/FocusAlarmWindow.tsx`）—— 2026-09-26 起

⚠️⚠️ **这是核心功能，不是插件**（用户 2026-09-26：「注意啊，这不是插件。这是核心功能」）：
它要窗口焦点、要一个置顶窗、要出声，三样都在插件沙箱之外（`docs/12` §4.7a）。
账户模型的账在 `docs/03` §5.6，设置页在 §3.5，那一次开窗实测在 `docs/06` §5.28。

**入口只有一处**：菜单「视图 → 强制专注」（`view.forceFocus`，`checkable: true`）。
⚠️ **它故意没有快捷键**：这个键会**开一个抢焦点的全屏窗**，误触的代价比别的菜单项高一档；
而且 `F8` 已经被上面那条「专注模式」占着了（`ui/commands.ts` 里那两条相邻的注释把这件事写死了）。
⚠️ **归在「视图」栏是妥协**：这个功能不属于视图，但为它单开一栏（「专注」）只会让菜单栏
多出一栏只放一条的；这一栏里别的条目（状态栏 / 全屏）也都是"应用怎么摆"，勉强算同类。

**状态栏那一格（`FocusMeter`）**

⚠️ **2026-09-30 起，它是下栏右半边唯一"不是统计"的东西**（用户点名：「其余全删。
**除了强制专注余额在需要时显示**」）——下栏改版那件事见 §2.5。

| 控件 | 文案 | 数据来源 | 当前状态 |
|---|---|---|---|
| 右下栏·排在统计那一格的**左边** | 「强制专注」＋ 一条**余额进度条** | `FocusState`（`nota:focus-state`，每秒一发） | ✅ 2026-09-26。⚠️ **没在跑时这一格整个不画**（`state === null` 或 `running: false`），不占位。⚠️ **BUG-45**（2026-09-27 修）：**没打开文档时也得画**——判据是「这一格说的是**应用在替你记什么账**，不是这份文档有多少字」，所以它跟着 `focus.running` 出现，**不跟着 `doc` 消失**。⚠️ 改版之后这条判据**更要紧了**：没文档时"词数"那一格也不画，此时右半边能有的活物**只有它**。⚠️ 顺序是「专注 → 统计」（从左往右），**故意的**：需要才出现的东西不该把恒显的那个数推来推去 |
| 同一格·悬停提示 | 三档：「你在写，余额在涨（上限 N 分钟）。起停走「视图 → 强制专注」。」／「正在扣余额。回到 Nota 就停止扣。」／「余额扣到零，警报已经响了。」 | 同一份状态 | ✅ |

⚠️ **进度条宽度按比例算，并且夹到 `[0, 1]`**：宿主那边余额已经不会越界，但这一格是**画**的——
万一哪天宿主漏了夹取，界面上的症状会是一条**溢出状态栏**的红条，而那不是"一眼看得出问题"的那种错。
夹一下的成本是零。

⚠️ **设置页一个字都不显示会话状态**（此刻余额多少、响过几次），理由见 §3.5 那一行。

**警报窗（`ui/FocusAlarmWindow.tsx`，`index.html#focus-alarm`）**

⚠️ 它是**第二个窗口**，不在 §1 那棵树里——`main.tsx` 按 URL 上的 `#focus-alarm` 分叉，
**只构建一个入口**（多入口要连 `vite` 配置和 `tauri.conf.json` 的 `frontendDist` 一起改，
而这条路上的收益只是"少判一个 if"）。

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 整块红屏 · 大字 | 「立刻回来写作」（⚠️ 代码里那句原文就是 `Back to Writing`——用户要的是英文原句，翻译只是"允许"；2026-09-28 语言翻转**之前**是先写中文、把它放进英文表，现在中文在 `zh-ui.ts` 里） | 无 | ✅ |
| 副题 | 「账户余额扣到零了。」／第 N 次时「这一轮第 N 次响警报了。」 | 无 | ✅ |
| 提示行 | 「点下面那颗按钮回去写字，余额重新从零开始攒。」 | 无 | ✅ |
| 按钮 | 「我回来了」→ 点过之后变「这就回去…」并锁住 | `nota_focus_ack` → 宿主 `focus::确认`：**阶段回到专注、余额留在 0、带着冷却** | ✅ |

⚠️ **标的是「我回来了」而不是「知道了」**：它不是"关掉一个提示"，是**宣称自己回到了编辑器**。
⚠️ **点了不补余额**，而且这件事**写在窗口上**（提示行就是干这个的）——不写清楚的话，
用户点一下发现余额还是 0，会以为这软件算错了。余额留在 0 ＋ 冷却的组合下，
"摸到响、点一下、白拿 5 分钟、继续摸"这条捷径自己就没了。
⚠️ **窗口没有标题栏**（`.decorations(false)`），**没有关闭键、没有最小化**：留一个"稍后再说"
就等于留一个后门。⚠️ **但 Alt+F4 是留着的，而且是必须留着**——一个抢焦点、置顶、全屏、
又关不掉的窗口是恶意软件的行为，不是自律工具。用户真按了**也算数**（见下）。
⚠️ `Esc` 等价于点那颗按钮——**它不是后门**，走的是同一条 `ack`。

⚠️⚠️ **窗自己不去 `close()`**（那个文件头写着「尤其**不要**自己 `close()`」）：关窗由宿主
**每一拍按阶段对账**（`alarm::对账`）。⚠️ **Alt+F4 / 窗口管理器直接关掉也算数**——`lib.rs` 的
`Destroyed` 分派里有这一条，少了它就会出现最难受的那种故障：**窗被关掉了、阶段还停在警报，
下一拍又开一个**，用户按几次 Alt+F4 就冒出几个窗，而且他会以为这软件坏掉了（他猜得没错）。
⚠️ 这条正是 **BUG-41 的一半**：宿主以为前端会关窗、前端以为宿主会关窗，**两边都在等对方**，
症状是「点『我回来了』红屏关不掉，按钮停在『这就回去…』」。**2026-09-26 开窗实测才发现**，
见 `docs/07` §2。

⚠️ **首次说明弹窗**（`ui/useFocusIntro.ts`）：第一次进入强制专注时弹一次，讲清这是个什么、
会用到什么系统权限、不碰用户任何数据；`[focus] introduced` 落盘钉住"只弹一次"（理由见 `docs/03` §5.6）。
⚠️ **事后还能查，但 2026-10-04 起只剩一处了**：从前有**三处**在说同一件事——设置页
「强制专注」页底那段 `Note`（§3.5）、「关于 Nota → 故障排除」页里的那一条（§2.6g）、
以及这个弹窗自己。用户那一轮选了**全删**（"删掉各种菜单下面大段大段的无用ai味描述"），
前两处**都删了**（权限那条同时搬去了「权限列表」页 §2.6g），**现在只有这个弹窗**。
⚠️ 那个弹窗是**同意书**，不是描述——用户要在这里点头，所以它**不在那一批的删除范围里**。
要恢复那两处的话，`git` 里找得到（`ui/settings/panes/FocusPane.tsx` 的 `Note`、
`src/i18n/zh-ui.ts` 里那七条）。

⚠️ **声音那条链在 `ui/useFocusAlarmSound.ts`，故意不在这里**：它订阅的是**事件**
（`nota:focus-beep`，响的那一下），而这个 hook 订阅的是**状态**（每秒一发）——
两条频道的分工写在 `bridge/ipc.ts`。⚠️ **警报窗里不许再挂一次这个 hook**：宿主那一枪 `emit`
是发给**所有窗口**的，两边都订阅就是同一段警报响两遍。

**结束后那份总结（`ui/FocusSummaryDialog.tsx`）—— 2026-09-27 加**

⚠️ 用户点名要的：「做一下专注模式结束后的总结功能就是将这一次专注模式的情况显示出来，
并且像心电图那样也支持导出。」

| 控件 | 文案 | 回调 → 最终动作 | 当前状态 |
|---|---|---|---|
| 标题 | 「这一轮专注结束了」 | 无 | ✅ 2026-09-27 |
| 左·五格 | 本轮时长 / 专注 / 离开 / 警报 / **专注占比** | 无 | ✅。⚠️ 专注占比那一格在**两个数都是 0** 时画「—」而**不是 0%**——画 0% 是在说他一次都没专注过，那是假话（`ui/focus-summary.ts::专注率`） |
| 右 | 那张 1080×1350 分享卡的**预览** | 无 | ✅。与写作统计**同一份** `ui/ShareCard.tsx`（那也是它从 `PanelBody.tsx` 里被抽出来的原因） |
| 按钮 ×3 | 「保存分享图」／「复制分享图」／「知道了」（**默认焦点**） | 前两颗 → `useShareCard`（另存为 / 进剪贴板）；第三颗 → 关掉 | ✅。⚠️ 结果**留在框里**（按钮下面一行），不是 toast |

⚠️ **它不是 `useDialogs` 那一族**：那四个框（确认 / 输入 / 图像 / Emoji）都是"问一句、
等一个答案"（`askXxx` 返回 Promise、`answerXxx` 兑现），而这个框**不问任何事**——它是
一份看完点掉的报告，硬塞进那个 Promise 形状就得凭空造一个谁也不读的返回值。所以它由
`App.tsx` 直接持有（`ui/useFocusTrace.ts` 给的 `结算`），**不走 `askXxx`**。
⚠️ **外壳借 `.confirm-*`，但 `role` 是 `dialog` 而不是 `alertdialog`**：后者是
"打断你、必须回答"（关掉没存盘的文档那种），而这一份是用户自己按了"停止专注"之后的回执。
⚠️ **只接 `Esc`、不接 `Enter`**（Enter 交给按钮自己：焦点在「知道了」上是关掉、在
「保存分享图」上是存图）；⚠️ **`App.tsx` 里它必须排在 `useImmersive` 之前**——那个
`有浮层` 要数进 `专注总结`，否则框开着按 `Esc` 会连沉浸模式一起退掉。
⚠️ **这一框的数据不是它自己攒的**：曲线由 `ui/useFocusTrace.ts` 一路留到最后一份快照
（宿主 `停下` 会把账本清成空快照），账与判据在 `docs/06` §5.28。

---

> 📌 **2026-10-10：导出的代码块要「重建」成 `<pre><code>`**（`editor/export.ts::摘正文`）
> ——代码块换成 CodeMirror 之后，`pre` 里同时装着真正的 `<code>` **和** CM 那一整层 DOM，
> 摘零件摘不掉后者（它是**内容**，不是零件）⇒ 导出文件里代码出现两遍，而且 `<pre>` 里
> 装着 `<div>`（用户报的「Pandoc不识别」）。现在 `pre` 只留 `<code>`，语言写成标准
> `class="language-xxx"`。判据见 `docs/07` §4 那一行的第 ⑨ 笔。

## 3. 外观：四条互相独立的轴

⚠️ 这一节的标题被代码注释引用。**判据是可复现的，不靠印象**：

```sh
grep -rn "docs/04" src/ src-tauri/src/ \
  --include=*.ts --include=*.tsx --include=*.css --include=*.rs | grep -i "外观\|04-ui-map"
```

2026-09-23 的输出是**四处**：`src/bridge/ipc.ts`（`UiStyle` 的类型注释）、
`src/styles/theme.css`（文件头）、`src-tauri/src/settings/mod.rs`（文件头 + `UiStyle`
的文档注释各一处；2026-09-23 那次，这个模块还是单文件 `settings.rs`）。
改标题或搬迁本节时要一起改。

📌 **本行曾把 `applyTheme.ts` 也算成引用方，那是错的**——`src/styles/applyTheme.ts`
的文件头通篇没提 `docs/04`。当时的错误是"按印象凑数"：看见外观相关有三个文件，
就假定三个都引了本节。**跟 `docs/07` §4 里那四条是同一个毛病。**

⚠️ `theme.css` 里那句"四处缺一不可"与这里的"四处"**是两件事**：
往某条轴上加**新取值**时要动的地方，数的是 `theme.css` + `settings/mod.rs` 的枚举 +
`applyTheme.ts` 的探测表 + 本节。

### 3.1 四条轴各是什么

⚠️ **本节的编号从 1 数到 4**；代码注释与 `AGENTS.md` 里说的「**三条外观轴**」
指的是 **①②③**（**不含**文档主题，因为用户 2026-09-23 明确划过线：
「这是文档风格，不是界面风格」）。两套数法都对，只是范围不同——`docs/03` §5.2 有同一张对照表。


| 轴 | 设置字段 | DOM 属性 | 写在哪个元素上 | 管什么 |
|---|---|---|---|---|
| **界面风格** | `ui_style` | `data-ui-style` | `<html>` | **一整套设计语言**：控件形状、圆角、间距、控件高度、阴影、字体栈。⚠️ 它**不是**"主题"的同义词 |
| **明暗** | `ui_mode` | `data-ui-mode` | `<html>` | 亮/暗。`auto` 时跟随系统（`prefers-color-scheme`）。**任何风格下都成立** |
| **主题色** | `appearance.accent` | （**没有 DOM 属性**） | `<html>` 的**内联** `--accent` / `--accent-fg` / `--switch-on` | **强调色一处**（2026-09-26 加）。空串 = 跟随当前风格自带的出厂色。⚠️ 它与前两条**不同源也不同落点**：不写 `data-*`，改的是内联 CSS 变量，所以**一行覆盖 14 格**。⚠️ **第三个变量 `--switch-on` 是 2026-09-30 加的**：用户报「右侧开关还是橙色的」——色块跟了、开关没跟（各风格在 `color.css` 里各写各的字面值，不引用 `--accent`），来龙去脉在 `styles/accent.ts::accentVars` 那段 |
| **文档主题** | `document_theme` | （**没有 DOM 属性**） | 一份注进 `<head>` 的 `<style>` | **只管正文**。见 §3.3——它**不是**第三条 CSS 变量轴，落法与前两条完全不同 |

取值：

| 轴 | 取值 | 落点 |
|---|---|---|
| `data-ui-style` | `auto` / `adwaita` / **`ghub`** / `macos` / **`plasma`** / `windows` / **`windows10`** / `yaru` | `auto` 由 `detectStyle()` 解析：含 `kde`/`plasma` → `plasma`，含 `ubuntu`/`yaru` → `yaru`，含 `windows` → `windows`，含 `mac`/`darwin` → `macos`，**探不出来就 `adwaita`**。<br>⚠️ **`windows10` 探不到**：Win10 与 Win11 在 UA 和 `XDG_CURRENT_DESKTOP` 上都是同一串（`Windows NT 10.0`），`windows` 这个线索只有一个去处，所以 `windows10` **只能手选**。⚠️ `ghub` 同理只能手选（不是"探不到"，是**根本没有对应的桌面**）。⚠️ 枚举里的名字和标签不一样：`plasma` 在界面上写 **Breeze**、`ghub` 写 **GitHub**、`windows` 写 **Windows 11**——**落盘的值不改**（改了就认不出老设置文件，用户会被静默打回默认档） |
| `data-ui-mode` | `auto` / `light` / `dark` | `auto` 由 `matchMedia("(prefers-color-scheme: dark)")` 解析 |
| `--accent`（内联） | 空串 / `#rgb` / `#rrggbb`（大小写随便，`#` 可省） | 空串 = **跟随风格**：`applyTheme` 用 `removeProperty` 把内联值**摘掉**，让 14 格选择器里那个出厂色生效。认清不出来的一律当空串处理（`styles/accent.ts` 的 `parseAccent`），**不报错、落盘时也不清洗**——和 `ui_style` 同一个口径：一个手抖的字不该让整份设置读不出来。⚠️ `--accent-fg`（压在强调色上的白/近黑）**不存**，由 `accentFg()` 按相对亮度当场算，分界线 0.25（推导与代价见 `docs/03` §5.2b） |
| `document_theme`（设置项） | 内置**六套**的 id（浅色 `minimal` / `adwaita` / `latex` ＋ 深色 `minimal-dark` / `adwaita-dark` / `latex-dark`）＋ 用户目录里的文件名 | **空串 = 无主题**，此时那份 `<style>` 被整个摘掉，编辑区回 `editor.css` 里的中性样式。⚠️ **它不写任何 DOM 属性**。⚠️ **2026-09-26 内置那批换过**（原六套 `paper`/`blueprint`/`mist`/`print`/`ink`/`pine` 全删）：老机器上字段里可能是个**已经不存在的 id**，那时 `useDocTheme.ts` 安静退回无主题、不弹错，而设置页那一格会把 id 原样显示并注明"找不到这一套"。⚠️ **2026-10-16 加回三档深色**（朋友清单第 11 条「编辑器暗色/浅色跟随主题」）：`useDocTheme.ts` 多一张 `深色配对` 表——**界面是深色且用户没单独指定 `dark_document_theme` 时**，`minimal`/`adwaita`/`latex` 自动换成自己的深色档（只对这三套内置生效，用户主题不动）。⚠️ 深色那三份是**颜色补丁**（`themes.rs` 把同名浅色 `concat!` 在前面），排版只有一份 |

前两条轴的写入动作在 `applyTheme(settings)`（`src/styles/applyTheme.ts`），由
`ui/useAppearance.ts` 里那条 `useEffect(() => { if (settings) applyTheme(settings); }, [settings])`
触发（⚠️ **2026-09-25 从 `App.tsx` 搬进来的**，调用方仍是 `App.tsx`；退订函数必须交出去，
BUG-7）。它同时还把 `--ui-font-size` 设到 `document.documentElement` 的内联样式上——
⚠️ **只有「字体大小」那一组拨到"自定义"时才设**（`appearance.custom_font_size`）：拨到
"自动"要把内联值**摘掉**，让 `theme.css` 的 `:root` 默认接手。2026-09-25 之前这里是无条件
写死的，于是那个单选**拨到哪一档效果都一样**。
**文档主题走的是另一个 effect**（要异步取 CSS），见 §3.3。

⚠️ **同一页还有两条不属于本节**：**缩放**（`appearance.zoom` ＋ `ctrl_wheel_zoom`
＋ **`ctrl_wheel_target`**）与
**视图模式**（⚠️ 2026-10-07 起它**已经不在设置里**了，`view_mode` 那段见本节末）。
先说缩放——它
**不写 DOM 属性、也不写 CSS 变量**，而是调 `webview.setZoom()`——所以上面那张"四条轴"的
表里没有它，它走向完全不同的那条路（`ui/useZoom.ts`）。为什么不走 CSS：这条应用
是 `100vh` 撑满的，CSS 放大之后内容比窗口高，底边会被切掉。

⚠️ **Ctrl+滚轮那一对是两格、不是一格**（**2026-09-26 加第二格**）：`ctrl_wheel_zoom`
只管「生不生效」，**改什么**由 `ctrl_wheel_target` 说了算——`"font_size"`（**默认**，
拨界面字号 12~20px、一格 1px）或 `"zoom"`（拨整页缩放 50~300%、一格 10%）。
⚠️ **默认是字号**，与开关的名字（`..._zoom`）直觉相反，所以设置页把它们摆成
**开关在上、下拉在下**（「按住 Ctrl 时用滚轮」→「滚轮改什么」），让这一格看得见。
拨字号那一档会**顺手打开顶层 `custom_font_size`**——不打开的话那个数不算数，
滚轮滚起来像一个坏掉的功能。完整口径在 `docs/03` §5.6b。

⚠️ **2026-09-27 起缩放还有第三条入口：键盘**（「视图 → 放大 / 缩小 / 实际大小」，
`Ctrl+=` / `Ctrl+-` / `Ctrl+Shift+0`，`docs/07` 第 75 项）。它**不另写一套**——
`ui/useZoom.ts` 里抽出 `应用缩放(值)`（夹紧 → `webview.setZoom` → 攒 400ms 落盘），
滚轮与菜单那三条**调的是同一个函数**。两条与滚轮不同的口径写在那个文件头上：
**不看 `ctrl_wheel_zoom`**（那格只管滚轮生不生效）、**不跟 `ctrl_wheel_target` 走**
（那格只管滚轮改的是字号还是缩放）。⚠️ 键位走 `commands.ts` 的 `accel`、
由 `useMenus` 那个 keydown 分发（**接了的键位一律 `preventDefault`**；⚠️ **2026-09-29 反方向也接了**——编辑器自己已经处理过的不再接手，判据是那条监听的第一句 `if (e.defaultPrevented) return;`，起因见 BUG-53）——
这一点不是形式：WebKitGTK 自带一条整页缩放，自己另挂监听的话不会挡它，就会一次缩两档。

**视图模式**（`wysiwyg` / `source` / `split`）连"外观"都不是：它决定编辑区
摆几个窗格、谁的话算数，所以不进这张表（`docs/03` §5.2 里同样标着"不是外观轴"）。
⚠️ **2026-10-07 起它连设置项都不是了**：`view_mode` 从 `Settings` 里退休（模式改成
**会话内状态、不落盘**，每次启动一律 `wysiwyg`，用户原话「请设置默认启动为
WYSIWYG」）——「编辑器」页那个下拉同批删掉，现在只剩「视图」菜单那三条与状态栏
那颗 `</>`。见 `docs/03` §5.2 末段。

⚠️ `guessDesktop()` 目前**恒返回空串**（WebKitGTK 不把桌面环境告诉 JS），
所以 `auto` 实际上总是落到 Adwaita。代码注释里写明：等接上 XDG portal 的
`color-scheme` 之后换成读 portal 的值。

### 3.1b ⚠️ 不属于四条轴的那些尺寸常量

`theme.css` 里除了四条轴的变量，还有一组**布局常量**。它们**不跟任何风格变**，
写死在 `:root` 里：

| 变量 | 值 | 谁用 |
|---|---|---|
| `--sidebar-width` | `240px`（⚠️ **2026-09-30 起是可变的**，见下） | 左侧栏 |
| `--dock-width` | `260px` | **右侧插件栏**（2026-09-22 新增） |
| `--toolbar-height` | `38px`（⚠️ **这一格是例外，见下**） | 工具条 |
| `--statusbar-height` | `26px` | 状态栏 |
| `--zen-peek` | `6px` | 沉浸模式下**唤回顶栏**的那条窄带（§2.10，2026-09-25 新增）。⚠️ 它和 `--toolbar-height` 是一对：那条带子必须明显比顶栏矮 |

⚠️⚠️ **`--sidebar-width` 是这一组里唯一有设置项的一个**（2026-09-30，
`appearance.sidebar_width`）：拖侧栏右缘那条把手时它被逐像素改写，松手落盘，
下次启动由 `styles/applyTheme.ts` 写回来。⚠️ `:root` 里这个 `240px` 现在是个
**兜底值**——它仍然必须与 `SidebarResizer.tsx` 的 `侧栏宽默认`、`appearance.rs` 的
`Default` 三个 240 同值（`tests/sidebar-resize.test.ts` 第一组盯着这件事），
但**它不再是"界面上实际是 240"的判据**。三条轴那一节里别的常量照旧。

⚠️ **这一格的写入口多一道"不是数就退回出厂值"**（2026-09-30 补）：`applyTheme.ts`
读 `appearance.sidebar_width` 时先过 `Number.isFinite`，不是数（后端没给出这一格）
就写 `240`。⚠️ **少了这道兜底，受害的不只是这一格**：算出来的 `NaN` 会被
`setProperty("--sidebar-width", "NaNpx")` **真写进去**——它把上面那个 `240px`
（也就是这一格自己的兜底值）顶掉、而自己又不合法，于是 `width` 整条声明失效、
退回 `auto`，侧栏宽度改由内容撑开（实测能撑到 **486px**）。看着**既不像 240
也不像报错**。⚠️ 同一个缺口在 `SidebarResizer.夹侧栏宽` 里从一开始就有兜底，
2026-09-30 把 `applyTheme` 那一处补齐后，两处的判据才算齐（数字与区间那"三个
240、180~480"见 §2.2 那一行）。⚠️ 撞上它的那次是**跑了旧二进制**（后端不认识
这一格），但兜底管的是"值没拿到"这一类，不只那一种来路。

⚠️ **为什么 `--dock-width` 比 `--sidebar-width` 宽 20px，不是同一个值**：
插件卡片里有名称 + 版本 + 能力标签，密度比"一行一个文件名"的文件树高。
**两个值分开是刻意的，省一个变量不值得。**⚠️ 这句话说的是**出厂值**：拖过侧栏之后
它可以比插件栏宽，也可以比它窄——两个数已经不再有固定的相对大小。

⚠️⚠️ **`--toolbar-height` 2026-09-26 起不再是纯常量**：那六份系统外观稿子里，
Adwaita 的 headerbar 是 44px、Yaru 的是 40px。它现在**默认值仍在 `base.css` 的 `:root`（38px）**，
但 `theme/shape.css` 里 adwaita 与 yaru 两块**各自覆盖了它**。判据是**只能往上调**：
稿子的 44 / 40 比我们的 38 大，照用；**Breeze 的 32、Win11 的 32、Win10 的 30 一律不用**——
那三个比我们的 38 小，而我们的顶栏里要放 26–36px 的控件，照抄会把它们切掉。
⚠️ 它**不是**操作系统的标题栏高度：本应用的窗口是 `decorations: true`（系统画的边框），
`--toolbar-height` 是我们自己那条内容行。所以"稿子里的标题栏 / 窗口圆角 / 窗口按钮 /
窗口外阴影"这四类**根本落不下来**——那是窗口管理器画的，不是 CSS 画的，详见 §3.2c。

⚠️ **改这些值的时候，有两个地方会跟着错，且都不报错**：
① `marks.css` 里 `pre.nota-srcmark::before` 的 `right: calc(100% + 15px)` 把
`pre` 的内边距（14px）与边框（1px）**写成了字面量**——改 `pre` 的内边距时要跟着改
（⚠️ 这条规则 2026-09-26 从 `app.css`／`editor.css` 搬去了 `marks.css`，
`editor.css` 的代码块那一段仍记着这一对的关系）；
② 右键插件栏的宽度变化会让正文区宽度变，`.milkdown` 的列宽
（`--content-width`）依赖的就是这个——宽度改了、列宽没改，正文列照旧那么宽
（2026-09-25 起靠左；在那之前是居中；**2026-10-09 起这个变量默认不写 = 铺满**，
所以只有把「限制正文宽度」开着的人才会遇到这条）。⚠️ 无论哪一档都**不是居中**。
这两条都是"错了也看不出来"的那类，改之前先扫一眼 `grep -rn "calc(100% + 15px)" src/styles/`。

### 3.2 二维相乘：`theme.css` 的组织约定

```text
[data-ui-mode="…"]    只设**颜色**变量
[data-ui-style="…"]   只设**形状**变量
两者相乘（同时挂在 <html> 上，各自命中）
```

| 类别的变量 | 谁设 | 具体是什么 |
|---|---|---|
| 颜色 | `[data-ui-mode]`（含 `:root` 的 light 兜底） | `--bg` `--bg-subtle` `--bg-raised` `--bg-hover` `--bg-active` `--fg` `--fg-muted` `--fg-faint` `--border` `--border-strong` `--accent` `--accent-fg` **`--link`** `--danger` `--warn` `--success` `--shadow` `--doc-bg` `--doc-fg` `--code-comment` `--code-keyword` `--code-string` `--code-number` `--code-function` `--code-attr` `--code-tag` `--find-hit` `--find-current` | ⚠️ **`--link` 是 2026-10-06 加的**（BUG-66）：正文里链接的颜色，默认 `var(--accent)`。加它是因为**"无文档主题"那一档原来一条 `a` 规则都没有**，链接落回浏览器默认那个蓝（`#0000EE`）、深色下看不清；而三套文档主题各自写的是**裸 `a`**，所以默认那条规则在 `editor.css` 里用 `:where(…)` **压平了权重**，靠运行时注入的顺序让主题赢。⚠️ **下划线默认就有**（用户 2026-10-06 拍板）；照 VMark 抄的是"键盘 `:focus-visible` 时的描边圈"这一条。
| 形状 | `[data-ui-style]` | `--radius-sm` `--radius` `--radius-lg` `--control-height` `--spacing` `--toolbar-height` `--toolbar-shadow` `--btn-font-weight` `--switch-w` `--switch-h` `--switch-knob` `--switch-travel` `--material-blur` `--material-saturate` `--press-scale`（`--press-scale` 只有 macos 给了值；`--material-*` 四个材质风格各给一份；macos / ghub / plasma / windows / windows10 另外换 `--font-ui` 字体栈——⚠️ **只写"Segoe UI"一类的通用名，不写 `Segoe UI Variable` 那种 Win11 专有字体名**，专有字体不随包分发，见 §3.2c） |
| 颜色**（例外）** | `[data-ui-style="x"][data-ui-mode="y"]`（**两属性**，放在文件最后） | 确有识别色的风格：ghub 的冷灰蓝边框与 `#0d1117` 画布、plasma 的 Breeze 蓝、yaru 的橙、yaru-blue 的 Yaru 蓝、adwaita/macos/windows/windows10 的系统蓝。⚠️ 那 14 格还给出**按钮与开关**这两族（`--btn-bg` 三态 + `--btn-border`、`--switch-on` / `--switch-off` / `--switch-knob-bg`）——⚠️ 它们**不是**通用量，另有用途见 §3.2c。⚠️ macos 那两格还多给三样**只有选择器用得上**的：`--menu-fill` 与 `--menu-fill-fg`（菜单高亮与其上的字）、以及只有它给的 `--press-scale` 搭配值。⚠️ **明暗各写一份**，**七套风格 × 两种模式 = 14 格**，**一格都不许缺**（⚠️ 2026-10-07 之前是八套 16 格：那天用户说「只需要 Yaru，不需要 Yaru Blue 了」，`yaru-blue` 整档删了）。⚠️ **附**：形状段可以**并列两个选择器共用**（`yaru-blue` 当年就是这么写的）——加同语言的强调色变体时照这个写法，不复制一遍圆角 |

⚠️ **不许把颜色写进 `[data-ui-style]` 那一段**。颜色一旦在风格里写死，这个风格就
没法配暗色了——而"我要 macOS 风格 + 暗色"是必然会出现的需求。反过来也一样：
`[data-ui-mode]` 那一段只管颜色，**不许改圆角和行为性尺寸**。

**例外怎么办**：确有识别色的风格写成**两属性选择器**（`[data-ui-style][data-ui-mode]`），
放在文件最后。它比单属性选择器更具体，稳定压过上面两段，同时**仍然是相乘的**——
14 格里每一格都有定义，不存在"那个风格配暗色没法看"的组合。

⚠️ **强调色要连 `--accent-fg`（它上面的字）一起给。** 浅色强调色配白字会读不出来，
这是 14 格里最容易出错的一格。今天最低的一格是 **Yaru 浅色**（白字配 `#e95420`，
对比度 3.1:1）——**故意留的**，因为 Ubuntu 自己的默认按钮就这么画，改了就不是 Yaru 了。

⚠️ **那一档原来叫 Yaru 蓝（`yaru-blue`，2026-09-24 加／2026-10-07 删**，用户原话「只需要 Yaru，不需要 Yaru Blue 了」）——它**不是 Nota 配的色**：Ubuntu 的 `index.theme` 里就写着
`X-Yaru-Accent-Name=blue` / `X-Yaru-Accent-Color=#0073E5`，暗色那份用它的
对比度优化档 `#2a95ff`。用户点着名要过这一档（「比如yaru,yaru blue,macOS,windows,plasma等」）。
⚠️ 上一版这里写着"唯一预告过的例外还没写进 CSS"（指 yaru 的橙）。**现在写进去了**，
而且不止一档。`theme.css` 里 yaru 那段注释也是同一件事，已一并更新。

⚠️ **2026-09-25 起，`theme.css` 末尾多了一段只给 macos 的组件选择器**（全文唯一一段）。
变量表表达不了三件事，只能落到选择器上：**材料**（`background` + `backdrop-filter`，
还要一层 `@supports` 兜底）、**「改了底色得连底上的字一起改」**（菜单高亮是整条系统蓝，
压在上面的勾选列、快捷键、箭头三样自带颜色，不一起改就是蓝底压蓝字）、
**只在某个条件下才生效的动效**（`prefers-reduced-motion` / `prefers-reduced-transparency`）。
三条硬规矩：

- **每一行都带 `[data-ui-style="macos"]` 前缀**——另外 13 格一个字节都不动。
- **能用变量表达的写回上面那两段**，不许往这里散。判据很简单：这个值换一个风格
  也说得通吗？说得通就是变量。
- **不进这一段，等于那个行为只有 macos 有**，这是**故意的**：整条系统蓝的菜单高亮、
  按下那一下缩放、菜单「在原地长出来」而不是「从上面滑下来」，都是平台特征，
  泄到别的风格上就成了四不像。所以 `theme.css` 里出现一段风格专属的选择器
  本身不是坏味道；坏味道是**每段风格都各来一段**。

⚠️ **`@supports (backdrop-filter)` 不等于「真的会糊」。** 本仓跑在 WebKitGTK 上，
实测：`@supports` 报支持、实际一个像素都不糊——把玻璃的 alpha 探到 0.55，
菜单底下的正文仍**原样清晰可读**。所以那层玻璃的 alpha 是「字压字」的唯一防线，
定成 0.97（量出来的数，不是随手挑的「看着挺透」），⚠️ **别再往下调**。
⚠️ 无头目检（`docs/06` §5）**验不了模糊**：Xvfb 上实测糊不出来。
能验的只有「模糊没了还读不读得清」——而那恰好是更要紧的那一半。

`src/styles/app.css`（以及从它拆出去的 `menubar.css` / `tabs-status.css` / `home.css` / `toast.css` / `sidebar.css` / `bars.css` / `editor.css` /
`settings.css`（＋它拆出的 `settings-controls.css` / `settings-widgets.css`）/
`editor.css`（＋它拆出的 `editor-inline.css` / `editor-blocks.css`）/
`gate.css` / `diff.css` / `review.css` / `dock.css`（＋它拆出的
`panel.css` / `panel-data.css` / `plugin-list.css`）/ `marks.css` /
`math.css` / `diagram.css` / **`overlay.css`** / `share.css` / `heatmap.css`）
的铁律（写在各自文件头）：**颜色与尺寸一律走变量**，
那里不该出现写死的色值或圆角——写死一个就少支持一种风格组合。

⚠️ **`marks.css` 是"光标所在的标记"那两类提示的皮**（2026-09-26 拆出）：
`.nota-srcmark`（块级/公式的 `#` `>` ` ``` ` `$`，**绝对定位浮标**、画在装订线里不吃宽度）
＋ `.nota-markhint`（**行内**加粗/斜体的 `**` `*`，`::before`/`::after` ＋
`content: attr(data-markhint)`，⚠️ **占宽度**是有意的取舍，理由见 `docs/05` §4.11）。
⚠️ **2026-10-05 起右符号不再用 `::after`、改走 `Decoration.widget(…, {side:-1})`**（`docs/07` BUG-65）——
`::after` 会把光标挡在右符号**左边**；理由与 Typora 那两张图在 `docs/05` §4.11。
⚠️ 两条**共用同一张配方**（`--fg-faint` ＋ 0.16s 淡入 ＋ 不可选中 ＋ 不吃鼠标事件），
⚠️ **都不许再乘 `opacity`**（2026-09-25 从 `.nota-srcmark` 上删过，理由在那一条的注释里）；
⚠️ 符号**走属性不进 CSS**，加第三种提示别把字面量写进 `content`。

⚠️ **`editor.css` 里 2026-09-27 多了一族"行内标记的长相"**（高亮 / 上标 / 下标 /
下划线 ＋ 裸 HTML / 注释 ＋ 脚注），机制见 `docs/05` §4.13，这里只记**落点在哪**：
`mark`（高亮，`--mark-bg` / `--mark-fg`）、`sup` / `sub`（`.75em` ＋ `vertical-align`，
**别自己写字号**——那套排版是标签自带的，见 `docs/05` §4.13 那条"`标签` 与 `html标签`
是两个东西"）、`u`（下划线色走 `--fg-faint`）、
`div[data-type="html-block"]`（裸 HTML 块，等宽 ＋ `--bg-subtle` 底 ＋ 左边一条
`--border-strong` 竖线；`[data-comment="true"]` 是它的注释变体，换成斜体 ＋ `--fg-faint`）、
`span[data-type="html"]`（行内 HTML）、
`sup[data-type="footnote_reference"]` / `dl[data-type="footnote_definition"]`（脚注）。
✅ **2026-09-27 晚开窗确认过这一族真画出来了**（高亮黄底、下划线、上标升高、下标降低、
块级裸 HTML 灰底等宽、注释斜体更淡；截图 `B1-乙.md.png` / `E4` / `G3`）。
⚠️ **这一族必须写在 `editor.css` 而不是 `marks.css`**：导出那条路（`editor/export.ts`）
只嵌三份 CSS——`theme/base.css` ＋ `editor.css` ＋ `katex.min.css`——**`marks.css` /
`code-block.css` / `math.css` / `diagram.css` 整个不在里面**。把长相写在
`marks.css` 里的后果是**导出的 HTML 里那四种标记一点样式都没有**。

⚠️ **同一批还有一对更"看不见"的长相**：智能标点「仅显示时转换」那一档的
`.nota-smart-hide`（原文压成 **0 宽**）与 `.nota-smart-show`（widget 画替身），
也在 `editor.css`。⚠️ 两条都在 `editor.css` 里各是一行，但**它们不是纯装饰**：
装饰那两半（`Decoration.inline` ＋ `Decoration.widget`）要配合 CSS 才能既
"看不见原文"又"看得见替身"，缺一半的症状分别是「原文还在」与「`--–`」。
⚠️ 用 `font-size: 0` 而不是 `display: none` 的理由（光标坐标换算）写在
`editor.css` 那一段。⚠️ 与上面那一族不同的一点：`Render` 档**根本走不到导出**
（`editor/export.ts` 另建实例、直接取 `pm.innerHTML`，而 `create-types.ts` 的
`标点` 那一格明写着导出不许传它），所以它的落点选 `editor.css` 只是"跟着这一族
放"，不是被导出那条约束逼的。

加一条新轴上的新值，**三处缺一不可**：`theme.css`、`src-tauri/src/settings/mod.rs`
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
`--border` 浅色那份**下界是 `.06`**——再往下，100% 缩放的普通屏上就看不见了，
"看不清边界"比"有点沉"更难用；暗色 `--bg` **上界是 `#2a2e34`**——
再上去就和 `--bg-raised` 撞了，"浮起来"那层看不出来。

#### 「默认那一格」还包括**面板的初始开关**（2026-09-24 用户要求）

用户第三句话：「**默认打开应用不要展开两个菜单。**」

指的是左侧栏与右侧插件栏**开工时都是关着的**（`sidebarOpen` / `dockOpen`
的两个 `useState` 初值从 `true` 改成 `false`，`App.tsx`）。

⚠️ **被推翻的是默认值，不是"插件该在右边"那条**：插件栏照旧在右侧、
照旧有三个入口（顶栏那颗「插件」/ 栏里的 × / 菜单「视图 → 插件栏」），
关掉的只是**开机那一刻**的状态——打开应用先看到的应该是一篇干净的正文，
而不是左右各占一条。收起后那一格宽度全还给正文。

⚠️ **把它做成"记住上次的样子"是另一件事**：它和左侧栏选的是哪一页同类，
是**看的时候的状态**，不是文档的属性（§2.5 那两条写得比这里细）。
真要持久化就跟 `content_width` 那一批一起走，不单开一项。

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
   之外**谁引了 `--font-doc`**。⚠️ 第二条才是真正出过问题的那条——
   第一次加第 ⑥ 项时只写了第一条，`.format-glyph-italic` 那类写法照样能过。

### 3.2c 2026-09-26：六份系统外观稿落成主题（含**落不下去的四件事**）

用户当天连着给了六份「某某系统的原生外观」参数稿（macOS 亚克力 / KDE Breeze /
Windows 11 Mica / **Windows 10 Acrylic** / Ubuntu Yaru（橙、蓝两档）/ Adwaita），
每一份都给了具体 px 与 hex。这一节记**哪一条照收了、哪一条换了值、哪一条根本做不到**——
因为"照稿子改了"和"改成了能看的样子"是两件事，不写下来下次有人会再抄一遍稿子。

#### ✅ 照收的

形状与颜色（**14 格**——那天之后删了 Yaru 蓝一档，见下）按稿子重取，逐档的值就在 `theme/shape.css` 与 `theme/color.css`
各自的注释里（那一行上面写着"稿子：…"）。三处**新增的槽位**：

- **`windows10` 一整档**——具体风格由**六档变成七档**（连同"跟随系统"的 `auto`，
  清单里共九项；⚠️ 十六格数的是这**八**档，不含 `auto`）。⚠️ 它是**并存的一代**，
  不是替换 `windows`：稿子专门写明"不是 Mica"，直角 + 亚克力，与 Win11 的小圆角 +
  Mica 确实不一样。⚠️ 2026-09-26 当天 `ui_style` 从枚举改成了 `String`（用户导入档
  那条路），所以"九项"如今记在 `ui_styles.rs::BUILTIN_IDS` 里，不在枚举上。
- **`--btn-*` 一族**（`--btn-bg` / `--btn-bg-hover` / `--btn-bg-active` / `--btn-border`）：
  稿子给的是"按钮自己的底色与描边"，而通用量（`--bg-hover` 那一批）**同时被文件树、
  菜单、输入框用着**，直接改会捎带改掉一片。⚠️ **Adwaita 给的是 `transparent`**——
  它那套里普通按钮是**扁平无底**的，只在 hover / 按下时浮出一层。
- **`--switch-*` 一族**：开关的尺寸与配色各档不同（48×24 / 44×22 / 42×22 / 40×20），
  原先 `settings.css` 里是写死的 36×14 + `left: 18px`。⚠️ 默认值**逐像素等于**改之前
  （见 `base.css` 里 `--switch-travel` 上面那条公式）。⚠️ **2026-09-30 补**：这族里的
  `--switch-on` 是**各档各写一个**的（macOS 绿 `#34c759`、Yaru 橙 `#e95420`…），
  **不引用 `--accent`**——这正是当天用户报「右侧开关还是橙色的」的根因。处置办法是
  用户**显式设了主题色时**由 `accent.ts::accentVars` 内联把它一起盖掉（那 14 格
  一行都没改，出厂长相各归各的）；`base.css` 的 `:root` 里那句
  `--switch-on: var(--accent)` **优先级输给这 14 格**，只有没写这一格的风格
  （ghub 那种只写差异的）才轮到它。
- **`--material-bg` / `--material-blur` / `--material-saturate`**：玻璃底色与模糊半径。

#### ⚠️ 换掉的值（**不是笔误，是算过的**）

**① 稿子里的次要灰在浅色下普遍过不了 AA（4.5:1）。** 本仓有条硬规矩：
`--fg-faint` 与 `--fg-muted` 要在**最不利的那层底色**上达标（浅色时就是 `--bg`）。
稿子给的那几个灰（`#86868b`、`#666666`…）大多在 4.0 上下。处置办法是**统一的一条**：
稿子的灰**够就用、不够就取"刚好过 4.5 的最接近值"**，然后 `--fg-muted` 从它**再往外挪一档**
（浅色更深、深色更亮），保证两层**排序不乱**、且都达标。落值（括号里是最不利那层的实测对比度）：

| 档 | 浅色 `--fg-faint` / `--fg-muted` | 深色 `--fg-faint` / `--fg-muted` |
|---|---|---|
| macOS | `#5e5e62`(5.62) / `#6c6c71`(4.55) | `#b1b1b4`(5.64) / `#9e9ea2`(4.52) |
| Breeze | `#586263`(5.61) / `#657171`(4.52) | `#aeb4ba`(5.66) / `#9fa6ad`(4.81·稿子原值) |
| Windows 11 | `#606060`(5.67) / `#6e6e6e`(4.60·稿子原值) | `#a4a4a4`(5.60) / `#949494`(4.60·稿子原值) |
| Windows 10 | `#606060`(5.62) / `#666666`(5.13·稿子原值) | `#a4a4a4`(5.60) / `#999999`(4.90·稿子原值) |
| Yaru（⚠️ 原来还并列着「Yaru 蓝」，2026-10-07 随那一档删了） | `#5e6272`(5.66) / `#6b7183`(4.54) | `#b7bbc3`(5.64) / `#a4a9b4`(≈4.5) |
| Adwaita | `#606061`(5.67) / `#6f6f70`(4.53) | `#b1b1b5`(5.63) / `#9e9ea3`(4.51) |

⚠️ **`--btn-bg` 不参与这条检查**：WCAG 1.4.3 把"不可用的控件"排除在外，
而按钮底色本来就不是承载正文的那一层。别拿它去凑这张表。

**② 强调色挡在字前面的那几处（明知故犯，逐条列明）。** 稿子的强调色配它自己在字，
有几档算下来过不了 4.5:1。处置**逐档不同**，没有统一方案：

| 档 | 怎么处置 | 为什么 |
|---|---|---|
| Adwaita 浅色 `#3584e4` + 白字 = **3.77:1** | **照收，不换** | 它是 GNOME 自己的强调色，而且是**`auto` 的默认落点**；换掉等于让没选过风格的人看到一套不是 GNOME 的 GNOME |
| Yaru 橙 `#e95420` + 白字 = **3.1:1** | **照收，不换**（早就是这样，已登记） | Ubuntu 自己的默认按钮就是这么画的，改了就不是 Yaru 了 |
| Breeze 浅色：稿子 `#3daee9` + 白 = 2.49:1 | **不用稿子那个**，留原来那档更深的 `#1d7fb8` | 2.49 太低了，不是"风格如此"能解释的 |
| Win11 深色：稿子 `#4cc2ff` + 深字 | **换成稿子的另一个值 `#0078d4` + 白字**（4.53:1） | 同一份稿子里有能过的那一档 |
| ~~Yaru 蓝浅色：稿子 `#208fe9` + 白 = 3.40:1~~（2026-10-07 删档） | **用稿子自己的 hover 档 `#1979c7`** | 同一份稿子里的另一档，仍然是 Yaru 蓝 |
| ~~Yaru 蓝深色：稿子 `#208fe9`~~（2026-10-07 删档） | **照收**，但 `--accent-fg` 用深色 `#06203a`（4.84:1） | 深色底上配深字才对；这一档是本仓少见的"深底 + 深字"组合，改 `--accent-fg` 前先算 |

> ⚠️⚠️ **`--accent` 的 hover / 按下态没有token 化。** 稿子里有五档明确给了
> hover / 按下的强调色，但本仓的 `.btn-primary:hover` / `:active` 用的是**一条与风格无关**的
> `filter: brightness(0.94)` / `brightness(0.88)`。在**深色 + 深字**的那两档上，
> 往更暗处压会**把字的对比度压垮**（算过：删掉的那档 Yaru 蓝，深色 hover 到 `#1463a4` 只剩 2.63:1）。
> 所以那五组 hover/按下色**故意没有落地**——这是**欠账**，不是"已经做了"。
> 要接的话得先把 hover/按下也变成 token（14 格 × 3 态），那是另一件事。

**③ `--material-bg` 的透明度全部抬到 0.97。** 稿子给的是 0.90–0.98，但**本机的
WebKitGTK 静默忽略 `backdrop-filter`**——实测：透明度 0.55 时后面的字"原样清晰可读"，
0.88 还能读出来，**0.97 是安全的底**。所以宁可看起来偏实，也不做"看着能透、其实没糊"的假玻璃。
稿子里的模糊半径**照抄进 `--material-blur` 存着**（3/4/6/18px），等哪天真糊了直接生效。

**④ `--font-ui` 只写通用名，不写专有字体名。** 用户自己交代过："上面的一些你可以不用参考，
比如说字体，字体是专有字体，直接用的话会侵权"。所以稿子里的
`Segoe UI Variable` / `Segoe MDL2 Assets` / `SF Pro` / `Breeze Sans` / `Ubuntu Sans`
**一个都没进来**，用的是原来那套通用栈（`Segoe UI` 是 Windows 上的通名，且**不随包分发**）。
**没有往仓库里加任何字体文件。**

#### ⛔ 落不下去的四件事（**不假装做了**）

六份稿子的头几条都是"窗口圆角 / 标题栏高度 / 窗口按钮 / 窗口外阴影"，
以及"窗口整体的亚克力/Mica 模糊"。这四类**本应用做不到**，原因是同一个：

**窗口是 `decorations: true`**（`src-tauri/tauri.conf.json`）——边框、圆角、外阴影、
标题栏与那三颗窗口按钮**全是窗口管理器画的**，不在我们的 DOM 里。CSS 碰不到它们，
`--toolbar-height` 也不是标题栏（见 §3.1b）。我们**唯一**能做材质的地方是自己画的
**浮层**（`.menu-popup` / `.menu-sub`），所以那一段 `@supports` 只挂在菜单上。

⚠️ **所以稿子里那些"窗口级"的参数，本仓一律不写"已实现"**：写进文档、写进注释，
标注"WM 拥有、本应用改不了"，而不是拿一个近似的圆角糊上去充数。

⚠️ 另外两条**结构性差异**，一并记在这里免得反复讨论：

- **`--toolbar-height` 只能往上调不能往下调**（稿子 44 / 40 收，32 / 32 / 30 不收），理由见 §3.1b；
- **Yaru 故意不在材质名单里**：它那份稿子写明"不透明、不做模糊"，
  所以 `theme/extras.css` 的两张名单（`@supports` 与 `prefers-reduced-transparency`）
  只列 macos / plasma / windows / windows10 四个。

### 3.3 轴四（文档主题）怎么落的 —— **它不是第三条 CSS 变量轴**

⚠️⚠️ **2026-09-23 重写过一次，前一版的结论整个作废。** 上一版这一节讲的是
"装外部编辑器带的那套主题"：扫三个目录（Nota 自己那份 + 外部编辑器自带的 + 它的 flatpak 那份）、展开
`@import`、把字体 `url()` 内联成 `data:` URL、再把主题的 `:root` 变量
**提升到全局**由 `theme.css` 末尾的 `--nota-bridge-*` 桥给外壳。

**用户 2026-09-23 把这条路整个否掉了**，两条理由（引文按原意转述）：

1. 用户定下「不要内置外部编辑器的主题，会侵权」「外部主题先不用兼容」。
   —— 版权问题，那一整条兼容链（三个目录、import 展开、字体内联、`base64` 依赖）
   **全删了**。
2. 「这是文档风格，不是界面风格，不应该影响到UI主题」
   —— 那条"提升到全局 + 桥接"正是**下半张脸跟着变**的根源：选一个浅色文档主题，
   侧栏、菜单、插件栏一起变亮，整个应用一半亮一半暗。桥也拆了。

所以轴四**不是**"第三条 CSS 变量轴"，它跟轴一/轴二/轴三不是一类东西：

| | 轴一 / 轴二 / 轴三（界面外观） | 轴四（文档主题） |
|---|---|---|
| 取值从哪来 | 枚举，编译期就定死 | 内置三套 + **用户往目录里丢的文件**（运行时） |
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
这一版把它**改写到编辑区**，变量再也出不去。**"让某个主题能改外壳"正是这一版要堵掉的东西。**

📌 这条限域是**机械执行**的，不靠写主题时自觉——主题文件里写错了也漏不到界面上。
`themes.rs` 里还有一条对应的回归测试（`内置主题不碰界面变量`），盯着内置那三套
不许出现 `--ui-font-size` / `--font-ui` / `--sidebar-width` / `--nota-bridge` 这些名字。

📌 **限域管的是"主题能改到哪儿"，另有一处是反方向的：`editor.css` 里有一条规则故意**压过**主题。**
文档最上面那一个块是标题时不吃它自己的上边距（**BUG-42**，2026-09-26，用户报的缺陷）：
`.editor-mount .ProseMirror > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0 }`——
3 条类／元素对主题那 2 条，所以**主题改不掉它**。理由是那条 `margin-top` 的语义是「离上一段多远」，
而文档第一块**没有上一段**；主题在这里没有话可说。
⚠️ 这是**唯一**一处这类例外，加第二处之前先想清楚代价：这条例外意味着
**「文档主题要能改编辑区里的一切」（原话在 `docs/05`）这句话是有边界的**——
边界一多，就成了主题作者查不出来的坑。数量与判据在 `docs/07` §2 的 BUG-42 行。

**内置的三套**在 `src/styles/themes/*.css`，`include_str!` 编进二进制——所以
**新装的机器上主题菜单不是空的**，而且一份第三方 CSS 都不带（版权）。

⚠️ 这六个文件按**普通文档 CSS** 写、**不带任何作用域前缀**（`h1 { … }` 就是 `h1`），
靠上面那条规则统一挂。一套主题由两部分组成：

- 在 `:root` 里**改 token**：`--doc-bg` / `--doc-fg` / `--border` / `--bg-subtle` /
  `--radius` / `--code-*` / `--select-text-*` / `--font-doc` / `--doc-font-size` /
  `--doc-line-height`。⚠️ 编辑区骨架的样式在 `editor.css` 里是**用 token 写的**，
  所以改 token 就能连代码块底、边框、圆角一起换，**不用去跟 editor.css 抢选择器权重**
  （抢不过：那边是 `.editor-mount .ProseMirror`，两条选择器）；
- 写 `editor.css` **没有覆盖过**的那部分排版：标题、链接、引用、表格、分隔线、列表。

⚠️ **2026-09-28 三份主题里的 `img` 那条多了个 `video`**（写成 `img, video { … }`）：
编辑区里那颗播放器的样式在 `src/styles/video.css`，而**导出**那条路会把
`nota-` 开头的类名**全摘掉**（`editor/export.ts`）——那边的视频只认得**元素选择器**，
所以尺寸这条必须在**文档主题**里也写一遍。三份都要有，`tests/video-view.test.ts`
第三组盯着（漏一份的症状是"某几套主题导出之后视频顶宽"，截图分享时才发现）。
⚠️ 语义上它和 `img` 是同一条规矩（别溢出正文列、圆角跟着主题走），所以写在同一个
选择器列表里，没有另起一条。

⚠️ **`--code-*` 每个主题必须自带一套。** 代码块底色是主题挑的，沿用界面那套会出现
"深底配深字"。这条也有测试盯着。

⚠️ **`--select-text-*` 的 fallback 必须是 `highlight` / `highlighttext` 这两个系统色**，
不能不给：`background: var(--x)` 在 `--x` 不存在时整条声明失效、回落到 `unset`
（也就是 `transparent`），症状是**选中了看不见**。

**源码模式与分屏也在这条线上**（2026-09-23）：

- `editor/source.ts` 的高亮与主题（`notaHighlight` / `notaTheme`）**一个色值都不写死**，
  全走上面这些 token——所以换文档主题、换界面明暗，源码模式跟着变。
  ⚠️ **那里不加颜色常量**，加了就等于又开一条会漂移的口径；
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
  它有自己的 `height: 100%; overflow: auto`，改的时候与上面那条链分开看。

**用户主题**放 `~/.config/nota/themes/<id>.css`，**同名覆盖内置**（想改哪套就复制出去改，
升级不会冲掉）。⚠️ `themes.rs::check_id` 是这里的安全边界：**id 只放行 ASCII 字母数字
与 `-` `_`**，因为路径是拿它拼的（`<主题目录>/<id>.css`）。白名单而不是黑名单——
比"过滤掉 `..`"更难绕过。代价是**中文文件名用不了**，这是有意的取舍：
显示名在文件里写着（菜单显示中文），文件名只是个键。

⚠️ 命令的入参是 **id 不是路径**（`nota_doc_theme_css(id)`），所以前端**根本没有**
"让后端读任意文件"的能力。上一版是传路径 + 一道目录前缀检查——那一版没有漏洞，
但"传 id"是**结构上不可能出错**。

⚠️ **`applyDocTheme(null)` 就是"无主题"**：不是注入一段空 CSS，是**把那个 `<style>`
元素删掉**。所以「无主题（内置）」回到的是 Nota 自己的样式，不是"没有样式的裸 HTML"。
⚠️ id 取不到 CSS 时（用户把那份文件删了）**安静地走 null 那条路**，不弹错——
换机器、清理磁盘都会造成这种情况，不是该打断用户的错误。

### 3.4 切换界面：四条轴都接通了

| 轴 | 切换界面 | 怎么改它 |
|---|---|---|
| 轴一（界面风格） | ✅ **有**：偏好设置 → 外观 → 界面风格（下拉）＋ 右侧「风格文件夹…」按钮 | `updateSettings({ui_style})`。**8 个选项打底**（自动 + 七档具体风格），**再加上用户导入的几档**；选中的那套下面带一句中文说明。⚠️ 2026-09-26 起用户能自己加档——往 `~/.config/nota/ui-styles/` 丢 `<id>.css`，重启后进下拉，同名则覆盖内置（那一档的选项后面带「已覆盖」）。⚠️ `settings.ui_style` 里是一个**清单里没有的 id** 时（文件被删、手改配置拼错），下拉里补一条 `（找不到「…」）`，**不静默换档**——理由见 `settings/mod.rs::DEFAULT_UI_STYLE` |
| 轴二（明暗） | ✅ **有**：偏好设置 → 外观 → 明暗（两张**缩略图**）+ 跟随系统偏好（开关） | `updateSettings({ui_mode})`。同时放在那一节的还有界面字号（滑杆） |
| 轴三（主题色） | ✅ **有**：偏好设置 → 外观 → 主题色（一个 `<input type="color">` ＋「跟随风格」按钮） | `updateSettings({accent})`。⚠️ 「跟随风格」把值写回**空串**（不是写当前那个颜色）——写了颜色就"钉死"了，换风格时不会跟着变。⚠️ 认不出来的值**不静默吃**：输入框旁边直接一行红字「（认不出「…」，按跟随风格处理）」。⚠️ 这个颜色**只管强调色**（按钮/选中态/焦点圈），明暗那两条轴管的底色一点不动 |
| 轴四（文档主题） | ✅ **有**：菜单栏「主题」栏 | `updateSettings({document_theme: id})`，⚠️ **2026-09-25 起是"写进当前生效的那个槽"**——深色下开着 `dark_theme_separate` 时写的是 `appearance.dark_document_theme`。菜单上的勾与设置页显示的都是**生效的那一套**，判据在 `ui/useDocTheme.ts` |

⚠️ **界面主题与文档主题分开摆是有意的**，不是随手放的：用户 2026-09-23 明确要求界面主题和文档主题
分开。上一版把两者都塞在「主题」菜单里，看起来就像"主题菜单管的是整个应用"。

⚠️ **「外观」那一页 2026-09-25 之前有一半是死的**：`zoom`（缩放整个界面）、
`ctrl_wheel_zoom`、`custom_font_size`、`reading_speed`、`dark_theme_separate`、
`dark_document_theme` 六项**存了值、没有任何读取者**（实测 `zoom` 100→300 界面
一个像素不动）。现在逐项接上了，落点见 `docs/10` §11.2 那一行。

⚠️ **偏好设置里没有「确定」也没有「取消」**（见 `ui/settings/SettingsDialog.tsx` 文件头）：
外观必须边看边调，每次改动直接落进 `updateSettings`（先改内存再写盘）。
既然即时生效，一个「取消」要么撒谎（撤销不了已经写盘的东西），要么就得再做一套
"暂存-回滚"——为一行没有价值的按钮不值得。

### 3.5 偏好设置那个框的版式（2026-09-24 重建为九页，**2026-09-26 加第十页**，**2026-09-27 加第十一页「拓展」**）

> ⚠️ 版式的出处：用户 2026-09-23 要求「你将那个偏好列表搞得和 VMark 一样的布局」，
> 参考源码在仓库外 `../vmark-ref`（**ISC**，出处与许可边界见 `docs/10` §11.3）。
> ⚠️ **2026-09-27 之后还差两处**（`docs/07` §3 **第 45 项**）：VMark 那版是**独立窗口**
> （自己的标题栏）、左栏 **11 节**、快捷键**可改**；Nota 这版是主窗口上的**遮罩层**、**11 页**。
> ⚠️ **「快捷键只读」那一条差额当天已经补掉**（用户点名要的「做，设置里加一块「快捷键」」，
> 见下面「快捷键那一页」那一行）——**别再照旧记忆说"三处都还没做"**，那会让接手的人
> 去实现一个已经存在的东西。动手改这一节之前先读那一格。

```text
┌──────────────┬────────────────────────────────────┐
│ [搜索设置…]  │  外观                              │
│ ▸ 文件       │  界面风格            [下拉 ▾]      │
│   编辑器     │  明暗               [浅][深]       │
│   图像       │  跟随系统偏好          ( ●—)       │
│   Markdown   │  主题色            [█] 跟随风格   │
│   导出       │  界面              ──●────  15px    │
│   外观       │                                    │
│   文档主题   │                                    │
│   快捷键     │                                    │
│   强制专注   │                                    │
│   拓展       │                                    │
│   通用       │                                    │
│ [ 完成 ]     │                                    │
└──────────────┴────────────────────────────────────┘
```

| 位置 | 是什么 |
|---|---|
| 左栏 | 搜索框 + **十一页**（文件 / 编辑器 / 图像 / Markdown / 导出 / 外观 / 文档主题 / 快捷键 / **强制专注** / **拓展** / 通用）+ 底部「完成」。⚠️ **「强制专注」那一页 2026-09-26 加**，**「拓展」那一页 2026-09-27 加**，在 `ORDER` 里排在「强制专注」与「通用」之间。顺序与图标表在 `SettingsDialog.tsx` 的 `ORDER` / `SECTIONS`（两处同文件；加一页漏改一处的症状是"这一页点不到"且不报错） |
| 右栏 | 当前那一页。一**行** = 左边标签（可带一行小字）+ 右边控件；若干行归一**组** |
| 键盘 | `Esc` 关掉；**`Tab` / `Shift+Tab` 在面板内循环**（焦点陷阱，2026-09-25 加）。⚠️ 这个面板标着 `aria-modal="true"`，而在那之前它**只有 Escape 一个键盘处理**——按 Tab 能把焦点送到面板**背后那个可编辑的正文**上，之后打的字直接写进文档，用户隔着面板看不见（`docs/07` BUG-21）。⚠️ 面板里**没有 portal**（设置原语不弹 `MenuPopup`），所以"焦点在面板外"就等于"该拉回来"；哪一页将来改成弹浮层，这道闸要给它开口子 |
| 「文件」页 | 启动选项 / 大纲 / 保存 & 恢复 / 文件树 / 拖放 / 默认扩展名 / 记录历史 / 关闭前先问我。⚠️ 自 2026-09-24 起这一页收「自动保存」与「关闭前先问我」两项——它们**存在顶层字段**（不在 `[files]` 表里），搬进表会让旧设置文件里的值静默回默认；界面不体现这一区别。<br>📌 **2026-10-16：`confirm_unsaved` 终于有第二个读者了。** 从 2026-09-22 起它只管"关掉一份标签"，**关整个窗口从来不问**（朋友清单第 7／16 条报的就是这个）。现在它同时管关窗口：宿主在 `CloseRequested` 里读它（`src-tauri/src/lib.rs::关窗前要问`），开着且镜像里有未保存就挡下这一枪、交给前端问「全部保存并退出 / 不保存直接退出 / 取消」（`ui/useQuitGuard.ts`）。⚠️ **两条是同一个开关、不是两个**——关掉它，"关标签问、关窗口不问"会一起消失，这正是这条设置本来该有的语义 |
| 「文件」页·「启动时」 | **三档递进**，2026-09-27 起**真的生效**（在那之前 `files.startup` 是个**摆设**：没有任何一处读它，而启动那一段无条件恢复一切 ＝ 永远按第三档办）。① **打开后自动新建**（`new-file`，**默认**）——一张白纸；② **打开后自动打开上次的文件**（`last-file`）——恢复上次那几个标签；③ **打开后自动打开上次的文件和文件夹**（`last-session`）——标签 **＋** 左侧栏那棵文件树。⚠️ 那一组的 help 特意写明**"文件夹"指的是左侧栏那棵文件树**——说成"目录"会有人以为指"上次用过的保存位置"。⚠️ **默认行为 2026-09-27 变了**：从没动过这一项的人，启动时从"什么都有"变成"一张白纸"（那正是第一档的词义，也是 `StartupAction` 一直以来的 `Default`）。⚠️ 第一档**不是"什么都不干"**：「最近打开」列表与滚动位置照读（那是另一个设置项管的功能，不该被启动档连坐）；⚠️ 第三档要恢复的那个文件夹是**从会话侧车读回来的**（`session.rs::会话.workspace`，五样里的第五样），宿主那边工作区只是个 `Mutex<Option<PathBuf>>`，冷启动必为空——记的那一笔在 `nota_workspace_open` / `close` 里落盘 |
| 「外观」页 | 界面风格 / 明暗 / 跟随系统偏好 / **主题色** / **字体大小** / **缩放**（＋ **Ctrl+滚轮**两格：生不生效 ＋ 动哪一个数） / 显示状态栏 / **显示菜单栏** / 字数统计 / 格式化工具栏 / **深色模式**。⚠️ **「Ctrl+滚轮」那两格 2026-09-26 起是两颗控件**（开关「按住 Ctrl 时用滚轮」＋ 下拉「滚轮改什么」，**默认改字号**、拨字号时会顺手切到「自定义」），在「缩放」那一组里、紧跟在缩放那颗输入框下面；口径见 `docs/03` §5.6b。⚠️ **「主题色」那一组 2026-09-26 加**（`appearance.accent`，在「跟随系统偏好」与「字体大小」之间）：一个原生取色框 ＋「跟随风格」按钮，**跟随风格 = 把值写回空串**、认不出的值在旁边出红字（`styles/accent.ts` 的 `parseAccent`；口径与推导见 `docs/03` §5.2b）。⚠️ 注意它与「界面风格」不是一回事：**风格给的是默认值，这一项是覆盖值**，而且它覆盖 `--accent` / `--accent-fg` / `--switch-on` **三个变量**（第三个 2026-09-30 加：用户报「右侧开关还是橙色的」——色块跟了、开关没跟，见 `styles/accent.ts` 文件头）。⚠️ 前三组写的是**顶层字段**（`ui_style` / `ui_mode` / `ui_font_size`；`accent` **在 `[appearance]` 表里**，别照前三组的样子往顶层搬），其余在 `[appearance]` 表——搬进表会让旧设置文件里的值静默回默认（文件头有整段）。⚠️ **2026-09-25 之前这一页有六项是死的**：`zoom` / `ctrl_wheel_zoom` / `custom_font_size` / `reading_speed` / `dark_theme_separate` / `dark_document_theme` 存了值没人读（实测 `zoom` 100→300 界面一个像素不动）。现在落点分别是 `ui/useZoom.ts` / `styles/applyTheme.ts` / `ui/outline.ts`＋`StatusBar` / `ui/useDocTheme.ts`，逐项见 `docs/10` §11.2。「深色模式」那一组两件事：单独用一套（开关）＋ 那一套是谁（下拉，**空串 = 跟随浅色主题**）。⚠️ **「显示菜单栏」那一组 2026-09-28 加**（`appearance.show_menu_bar`，摆在与「显示状态栏」相邻处，一并归在「界面缩放」与「字数统计」之间）：一个开关，**默认开**——⚠️ **它与「格式化工具栏」的默认值相反是有意的**（工具栏上那几条命令菜单里都找得到，菜单栏是命令的**总入口**：最近打开、导出、拓展管理只在它里面，默认藏了等于给新用户一个空界面）。⚠️ 这一格**从设置页关掉也会触发那条"怎么开回来"的提示**（提示挂在 `ui/useChromeVisibility.ts` 盯字段跳变的那条 effect 上，不在菜单项的处理函数里），这一点是有意的：从设置页关的人**同样**需要知道 `Alt+M`。⚠️ **2026-09-30 这一页多了一格"不画在界面上"的字段**：`appearance.sidebar_width`——**设置页里没有它的控件**，唯一的入口是拖侧栏右缘那条把手（§2.2 那一行）。**这是故意的**：那条边本身就是控件，再加一个数字框等于同一个数有两个入口，而两个入口必然有一个先腐坏。⚠️ 所以以后要核"侧栏宽度到底存没存下来"，**别看设置页**（它不显示），去看 `~/.config/nota/settings.toml` 里 `[appearance]` 的 `sidebar_width`。⚠️ **2026-10-04（第 45 项，照 VMark 截图补的两组）**：① **「窗口」一组**——`appearance.show_filename_in_titlebar`（一个开关，**默认开**）：「标题栏里写上文件名」；关掉之后窗口标题恒为 `Nota`，⚠️ **那个 `•` 脏标志也跟着看不见了**（它拼在标题里，落点 `ui/useWindowTitle.ts`；未保存的另一处落点是标签页那颗点 `ui/TabBar.tsx`，已记在字段上）。② **「专注模式」一组**——`appearance.focus_mode_dim`（三档单选 `标准` / `强` / `更强`，**默认标准**）：「`F8` 专注模式下，非聚焦内容压多暗」，写法与另外三条外观轴一样是**写 `<html>` 的 `data-*`**（`ui/useFocusDim.ts`；**默认那一档不落属性**），值在 `styles/editor.css` 的 `--focus-dim`，`tests/focus-dim.test.ts` 把五个名字钉在一起。⚠️ 它**不在 `[focus]` 表里**——那是强制专注那本账（`settings/focus.rs`），这一格是 `[appearance]` 的字段；两件同名不同物的事别混 |
| 「文档主题」页 | **只读**：现在生效的是哪一套 + 「打开主题文件夹…」。⚠️ 显示的是**生效的那一套**（深色下开着「深色模式 → 单独用一套」时是 `appearance.dark_document_theme`，不是 `document_theme`），判据是两个纯函数（`ui/useDocTheme.ts`）；那种情况下**多出一组**「深色下用的是另一套」，里面一行「浅色下用的是」把**另一套**也报出来（2026-09-25 加。⚠️ 那一行不是装饰——**删掉它整组就画不出来**，理由见本节末那条 `:has()`）。⚠️ **这一页故意没有选择器**：换主题的唯一入口是「主题」菜单，两个真相源会互相不报错地分叉。⚠️ **2026-10-04 两件**（第 41 / 43 项）：①「打开主题文件夹…」**成功回来之后会重扫一遍清单**（`useDocTheme` 的 `重扫` 那格 → `api.theme.list()`）——丢进去一份新 `.css` 不必再重启；**不做轮询**。②「深色模式」那一组（「外观」页）多了一段灰字注记：内置三套**只读**、想改哪套就在主题文件夹里放一份**同名**的 `.css`——**只说明、不代办**（不做"点一下就写文件"） |
| 右侧拓展栏（左缘） | **左缘那条 6px 的把手可以拖**（2026-10-11，用户：「拓展菜单左侧也可以拖动」）：拖动期间直接写 `<html>` 的 `--dock-width`、松手才落盘到 `appearance.dock_width`（200~560，出厂 260）。⚠️ 与侧栏右缘那条是**镜像**的一对（那条量左缘、这条量右缘）。⚠️ 标题右边那颗 × **2026-10-11 去掉了**（收起有两条路：顶部那颗 `Extensions` 开关 / 视图菜单） |
| 「编辑器」/「图像」/「导出」页 | 字段与分组见三个文件头：`settings/editor.rs` / `image.rs` / `export.rs`（每份都有一张"界面上有什么"的表）。⚠️ **2026-10-10「导出」页多了一组「Pandoc 额外参数」**（用户：「我的文档主题没有影响到 Pandoc 的导出。你可以参考 Markra」）：一个文本框（`[export] pandoc_args`，空＝不给），说明里写着"多个参数用空格分开、带空格的用引号"与"文档主题自己会带上的是 EPUB，要 Word 也跟着变就用 `--reference-doc` 指向你自己的 .docx 模板"。⚠️ **那一组是那一页唯一的"给人写命令"的地方**——它是 Markra 那一格（`pandocArgs`）的同款；判据与边界见 `docs/07` 第 112 项 |
| 　·「编辑器」页 →「拼写检查」组 | 开关 ＋ **语言那一块**（2026-10-10 建、2026-10-11 大改）：一个**能勾多门**的列表（第一项「跟随系统」勾上＝清空列表）＋ 一格「添加自定义标签」＋ 底下**「词典从哪儿来」**那一段（「导入词典包（.zip）…」/「在文件夹里显示词典目录」两颗按钮 ＋ 目录路径 ＋ 一句"三条出路"的提示 ＋ 上一次导入的结果）。⚠️ 列表**分两档**画：**这台机器上有的**（来自 `nota_spell_dictionaries`）与**常见但没装的**（勾得上、旁边写"未安装"——做成点不动的用户会以为"这软件不支持德语"）。⚠️ **关掉开关时整块都不画**——同「正文宽度」那条滑杆的口径（画出来就得解释"为什么选了没反应"）。⚠️ 标签写成 `zh_CN`（下划线），理由与"空数组＝跟随系统"的含义见 `docs/03` §5.6e / §5.6f |
| 「图像」页·三组六项 | **2026-09-26 起逐项都真的在用**（在那之前这六个字段**一个消费者都没有**——存得下、不生效，`docs/07` 第 62 项）。三组：**①「插入图片时」**一个下拉五档（`无特殊操作` / `复制到当前目录` / `复制到 ./assets` / `复制到 ./$(filename).assets` / `复制到指定路径`）＋**只在选到第五档时才画**的一行「指定路径」输入框；**②「上面那条规则对哪些图片生效」**两个勾选框（本地 / 网络）；**③「图片语法偏好」**三个勾选框。⚠️ `$(filename)` 指的是**文档名**（`笔记.md` → `笔记.assets/`），**不是图片名**——那会变成一张图一个目录。⚠️ 「网络位置的图片」**默认不勾**，因为它勾上意味着"插入时可能联网下载"。⚠️ 那一行「指定路径」是**条件渲染**（`insert_action === "copy-to-custom"`），不是灰着——空着不填就插入会**报错让你去填**，不会悄悄退回别的目录 |
| 「图像」页·下半的「上传服务器」组 | **2026-09-26 第二批加**（`ui/settings/panes/ImageUploadGroup.tsx`）：总开关 / 地址 / 方法（`post` 多部件 · `put` 裸字节）/ 字段名 / 请求头（一行一条）/ 从响应里取哪一格（点路径）/ 内容类型 / 网络图片的字段名，外加一个**算出来的**「这台机器上现在会不会自动传」。⚠️ **它不在 `settings.toml` 里**，在 `~/.config/nota/image-upload.toml`（**0600**，因为请求头那栏装的是用户的令牌）——所以这一组**不走 `paneWriter`**，自己读、自己写、自己存一份 state，是全仓唯一一组这样做的。⚠️ 于是「通用 → 恢复出厂默认」**故意不碰这一组**：把用户的令牌一起清掉是那种「点了一下才发现」的损失。⚠️ **一个服务商都不预置**（没有 smms / PicGo / imgur 那种名字），地址、方法、字段名、请求头、取哪一格全要用户自己填——理由与边界见 `docs/10` §11.2 第二类那一行 |
| 「图像」页·页底那段 `Note` | ⚠️ **这段 2026-09-26 第二批已经改写过，旧的那句「这里没有『上传服务设定』，将来也不会有」不再存在，别照着旧记忆找它**。现在它说的是**授权口径**：默认关、不预置任何服务商、用户显式配好之后才可用；同时把"这份文件是 0600、它装的是令牌、不会进 `settings.toml`"写在页面上（用户有权知道自己的凭据落在哪）。⚠️ 与它同批改掉的还有 `ImagePane.tsx` 文件头那段反话，以及 `settings/image.rs` 里那条用例——它原来的名字叫 `没有上传服务这一项`，现在叫 `图片设置里不许出现上传与密钥`：**盯的对象换了**（不再是"不许有上传设置"，而是"上传设置与密钥不许搬进 0644 的 `settings.toml`"），改的时候别只改名字、把它测的东西也一起改回去 |
| Markdown 那一页 | **十页中组数最多**（**七组**，2026-09-27 起）：语法偏好 / 扩展语法 / 智能标点 / **自动更正** / 代码块 / 公式 / 空格与换行。⚠️ 它**不是外观轴**，所以没放进「编辑器」那一页（那边管的是摆几个窗格、多宽、多久存一次盘）。⚠️ **2026-09-27 之前这一页的多数条目只存值、尚未接线**——那天接了智能标点那六格（新消费者 `src/editor/smart-punctuation.ts`）并**新加了「自动更正」那一组**（`auto_correct`）。⚠️ **还剩一格没消费者**：`unicode_punctuation`（它管的是**解析**侧），逐条登记在 `docs/10` §11.2 |
| 数学公式那一组 | physics 那个开关**只写进 `Settings`**，渲染那一侧在 `editor/math-macros.ts`（宏表）+ `editor/create.ts`（`.config` 里 set `katexOptionsCtx`）。⚠️ **这一页只管宏表那件事**：公式块"点一下就地改 ＋ 半透明 `$` / `$$`"（2026-09-26）**不在设置里、也没有开关**，它是编辑区里的行为，落点 `editor/math-view.ts` ＋ `styles/math.css`（`docs/05` §4.6b）。⚠️ **2026-10-04 起公式源码框里还多一列「命令候选弹窗」**（敲 `\` 弹出来，`editor/math-commands.ts` 出表 ＋ `editor/math-suggest.ts` 画 ＋ `styles/math.css` 里 `.nota-math-suggest*` 那几格）——**同样不在设置里、没有开关**，理由同上（`docs/05` §4.6d）。⚠️ 那一格的**高矮由内容说了算**（2026-10-04 目检：原来按估算配过一条像素 `max-height`，真窗口里量出只装得下九条，已删，见 `docs/07` BUG-63）——所以**别照截图量它的高度**，那个数跟着候选条数与字号走。⚠️ 它**不是"装了哪个扩展"**：KaTeX 官方没有 physics，这套命令是 Nota 自己写的宏。改这个开关会把编辑器**重建**（`EditorPane` 的 effect 依赖里有它）——KaTeX 的宏是渲染那一刻查表的，已经画出来的公式不会自己变 |
| 快捷键那一页 | **2026-09-27 起可在这一页改**（此前是只读一览，`docs/07` 第 45 项 (c) 当天结清）。条目从 `menus` 读出来（`App.tsx` 那份、**已经叠过用户的键位覆盖**；`walkMenuItems` 深度优先 + `formatAccel`），所以子菜单里的 `Ctrl+Shift+C` 也在，macOS 上显示成 `⌘⇧C`。⚠️ 一行 = 一条**可绑定**的命令：右边是一个**录制按钮**（点一下进入录制、按下一组键即收下，`Esc` 取消）＋ 一格「恢复默认」，没有键位的显示**「未设置」**——那正是"给一条本来没键位的命令加键位"这条路（全部可绑定的命令都在表里，不只列已有键位的）。⚠️ **撞车当场拒绝**并说清那个键位现在归谁（不做"先到先得"：静默归了别人用户会以为改成功了，**界面在骗他**）；代价是**两条命令不能交换键位**，想换得先把一条清成「未设置」。⚠️ 落盘的是**差量**：只有用户动过的那几条进 `settings.toml` 的 `[keys.overrides]`，整张表的真相源仍是 `ui/commands.ts`——所以加新命令、改默认键位都不需要用户的快照跟着升级（理由与"值写成空串 = 这条命令不要快捷键"那一档见 `settings/keys.rs` 文件头） |
| 「拓展」页 | **2026-09-27 加**（`ui/settings/panes/ExtensionsPane.tsx`，322 行；`docs/07` 第 81 项）。装 / 导出 / 卸载三件事一条行：来源（内置 / 自装）、签名（已验证 / 未签名）、状态、按钮。⚠️ 与右侧「插件」栏的分工是**诊断 vs 管理**——那一栏（栏宽 260px）是出问题时第一眼看的地方，这一页把三件事摆开、能对着读完再决定；两边用的是 `usePlugins` 的**同一份数据与同一批动作**。⚠️ 三件事里**只有「导出」是新的**（把插件打回成 `.nota-plugin` 包，`plugin/export.rs`），装与卸 2026-09-25 就在；⚠️ **内置插件卸不掉**（按钮灰着并把理由写在 `title` 里），导出就是把它拷出来改的唯一一条路。⚠️ 文案与右栏**共用** `ui/pluginText.ts` 一份。<br>⚠️ **2026-10-04 起这一页还画"插件点名要宿主画的设置"**（写作统计那根 Δt 滑杆是第一个）：每个插件的行**底下再挂一行**，里面是按它清单里 `[[settings]]` 声明现画的控件（现在只有滑杆一种）。⚠️ 这一页**不认插件 id**——它只认声明（`kind` / `min` / `max` / `default` / `unit`），所以"给某个插件加一格"不需要动这一页（`docs/11` §2.5 那张"加一种控件要动哪几处"的表里**没有它**）。⚠️ 拖完**当场落盘**（`usePlugins` 的 `setSetting` → 宿主命令 `nota_plugin_setting_set`），**本地那份也跟着改**——不跟的话下一次重拉会把用户刚拖的值弹回去。⚠️ 值写的是插件自己那份设置文件（`plugin-settings`，§3 那张表），**不是** `settings.toml`：这一页是那格设置的**界面**，不是它的**仓库**。⚠️ 这一行开过窗看过（2026-10-04 夜，写作统计那根滑杆）：滑杆右侧的读数跟着手走、拖完**立刻**写进 `~/.config/nota/plugin-settings/nota.stats.toml`、关掉设置页再打开还停在原处（是从文件读回来的）；逐条证据在 `docs/06` §5.29c ②（同一遍也验了手改那份文件写 `999` 会被夹成 60、删掉那一行重开退回默认 5） 📌 **2026-10-10：控件从一种加到三种**（`range` / `text` / `toggle`）——AI 插件那五格设置（接口地址 / 模型名 / API 密钥 / 可读上限 / 边生成边显示）搬进来了，密钥那一档画成**密码框**（`.stg-input` ＋ 原语上的 `secret`）。⚠️ 判据：无头窗口里对着「设置 → 拓展」拍过那一屏（五格都在、密钥显示成 `••••••`），点一下那个开关，盘上 `nota.ai.toml` 当场从 `stream = true` 变成 `false`（`docs/07` §4 那一行） |
| 「强制专注」页 | **2026-09-26 加**（`ui/settings/panes/FocusPane.tsx`，180 行）。四组：**账户**（专注总时长 / 警报时长）／**权重**（专注 1 分钟加多少 / 离开 1 分钟扣多少）／**宽限**（刚切走多少秒不扣 ＋ 一格灰着的）／**警报**（响警报）。⚠️ 这一页**每一条的 `description` 都不是装饰**：用户定的模型里，「专注总时长」**不是**「这一轮要坐多久」而是**账户的上限**、「警报时长」**不是**「每隔多久响一次」而是**开局给多少**——把它们说成「计时器」就等于把这个功能的设计讲反了。⚠️ **会话状态一个字都不在这页上**（此刻余额多少、响过几次只在内存里、每秒都在变，出口是状态栏那一格 §2.11）：设置页显示一个每秒跳动的数会让整页都在重画，而用户来这一页是为了**改参数**。⚠️ 页底那段 `Note` 是**用户点名要的**（「明确的告诉用户这可能会用到什么系统权限，并且保证不会窃取你的任何数据」），它和「关于」里那两条、以及首次进入时的说明弹窗**说的是同一件事，三处要同改**（§2.6g / §2.11） |
| 「强制专注」页·「这些应用里不算摸鱼」 | ⚠️⚠️ **灰着的，而且这一格不是「还没做完」——是「决定不做」**。用户 2026-09-26 砍掉了它（「宽限名单不用开了。把这个功能删掉吧，干脆」），字段已经从 `settings/focus.rs` 里删干净了。留着而不是藏起来，是**告诉用户「你找不到这条路不是因为你没找到」**。⚠️ **它的 `title` 说的是「决定不做」**，而 `ExportPane::选择…` / `FilesPane::恢复草稿` 那几格说的是「尚未实现」——**故意不跟**：那几格是会做的，这一格是不做的，写成一样用户会一直等它。为什么不做见 `docs/03` §5.6 |
| 「通用」页 | **界面语言**（2026-09-25 加）/ 调试模式 / 高级设置 / 许可证 / 对话框 / 快捷键入口。⚠️ 原来那张"外部编辑器有什么、Nota 有没有"的两列表已按版权要求撤掉，只留结论 |
| 「通用」页·「界面语言」 | 一个下拉：`自动（跟系统走）` ＋ **宿主给的那张表**（`api.appLang().available`，前端不列第二份）。⚠️ 那一行的 `description` 报的是**现在实际在用的那个**（`effective`），不是这一格存的值——**两者会不一样**（存的是 `auto` 时）。⚠️ **重启后生效**，这句写在那一组自己的 help 里，理由也写着：插件在启动时按语言读好了自己的 `lang/<tag>.toml`，运行中换语言等于把所有插件重装一遍（`on_unload` / `on_load` 里有 git、有 HTTP）。⚠️ **2026-09-26 下午起，英文翻译铺到了整个界面**（菜单栏、设置十页、状态栏、侧边栏、对话框、工具条、插件栏），覆盖账 **732/732、0 欠账 0 废键**（`bash tools/i18n-check.sh`）——所以**换语言之后整个界面是英语**，不再有"插件英文、别处中文"的中间态。⚠️ **页面上那段 `Note` 仍然在，别把它删掉**：它原先说的是"英文目前只覆盖插件那一面"，那句话当天已按事实改成「英文翻译现在覆盖整个界面：菜单栏、设置、状态栏、侧边栏、对话框、插件栏都在里面」——**改动的是那段话的内容，不是它的存在**（"界面上哪几处是英文"这件事仍然要在页面上说清）。✅ **2026-09-26 在无头窗口里点过**：选中后**当场不刷新**、落盘的是 `[general] language`，**重启才生效**（与上面那条 help 一致）；重启后**插件那一面**（面板文案、「插件」菜单里三个插件注册的十项、右上角那枚 `Plugins`）全变英语。⚠️ **那次点的时候应用其余部分仍是中文**——当时英文表只覆盖插件那一面；**铺满之后的英文界面还没有人在窗口里点过**，那笔账在 `docs/07` §4。用户规格里「应用语言不在插件清单内 → 显示『此插件不支持您的语言』并用英语」那条分支也验过（临时探针插件，`langs = ["en"]`，应用语言 zh-CN）。⚠️ **认不出来的语言落到 `en`**（`lang.rs::应用兜底`，前端 `i18n/index.ts::兜底` 同值，2026-09-26 下午翻的）：它是**未命中的落点**、不是"默认语言"——`LANG=C`、没设 locale、手写了个没做的语言时才用上；中文语区照旧拿中文（`zh-CN` 在 `支持的语言` 里） |
| 「文件」页·「文件树 / 文件库」那一组 | 三格：**显示隐藏文件**（开关）／**显示哪些文件**（`只显示 Markdown 和纯文本` / `全部显示`）／**排序方式**（`按名字（A→Z）` / `最近修改的在前` / `最近创建的在前`，**2026-09-28 加**）。⚠️ **这一组 2026-09-28 之前有两格是死的**：`show_hidden` 与 `tree_filter` 从 2026-09-24 就在界面上，而宿主那边那两个判断是**写死**的（点开头的永远跳过、只读 markdown）——拨了等于没拨。同一批接上了线，这是**还债**不是新功能。⚠️ 排序那三格的措辞把"新的在前"写进了标签里：只写"按修改时间"的话，用户排出来是倒的会以为排序坏了（宿主那边的取舍写在 `settings/files.rs::TreeSort` 上：**只有名字档是升序**，两个时间档都是新的在前；**目录永远排在文件前面**）。⚠️ 拨开隐藏文件**不会**放出 `.git` 与 `node_modules`——它们永远跳过（用户拨这个开关是冲着 `.github` / `.env` 去的，`.git/objects` 露出来等于这个开关废了），设置页那句 help 里的 `node_modules` 说的正是这件事。⚠️ **口径是随每一次取树的请求递给宿主的**（`ui/tree-options.ts` 顶上一整段讲了为什么不让宿主自己读设置：设置那一路"先改内存再写盘"，后端可能还拿着旧值） |
| 「文件」页·「自动保存」 | **2026-09-25 接线**，两档各在一个地方：`autosave_seconds`（停笔 N 秒）走 `ui/useAutosave.ts`，`[files].autosave_on_switch`（切页前先存）在 `ui/useDocuments.ts` 的 `切换文档` 里。⚠️ 两档**都走 `saveDoc`**，和 `Ctrl+S` 同一条路——所以"自动存"和"手动存"写出来的字节完全一样；自动存成功那一下**不弹提示条**（`quiet`），**失败那条照弹**。⚠️ 那一组下面的 `.stg-note` 2026-09-25 已按承诺**缩窄**（原文说三档全没接）：现在只如实标着**「恢复未保存的草稿」**与**「清除历史文件记录」**两条还没接，**别整段删掉**——一个拨了不生效的开关比没有这个开关更糟 |
| 编辑器那一节·「切换文件时自动保存」 | ⚠️ **"切页"的三条路**：点标签、开文件、新建文档都算；**关文档不算**——那条路自己有「保存并关闭」，用户若选「丢弃并关闭」，这里再去存一次就是把他的选择反着做（理由写在 `closeDoc` 那一行旁边） |
| 编辑器那一节·~~「编辑模式」~~ | ⚠️ **2026-10-07 起这一格没有了**：模式改成**会话内状态、不落盘**（用户原话「请设置默认启动为 WYSIWYG」），`view_mode` 从 `Settings` 退休，那个下拉连同它那一组一起从 `panes/EditorPane.tsx` 删掉——`ui/view-modes.ts` 的 `VIEW_MODE_LABELS` 从此没有读者（那张表**没删**，留着当"加第四种模式"的编译期保险，理由在它文件头）。⚠️ 删之前它的来历：三个名字取那张表；**2026-09-30 起那张表只有这一列**（原先还有一列短名给状态栏那一格用，下栏改成 Typora 的样子之后那一格没了，短名**没有任何读取者**，同批删掉） |
| 编辑器那一节·「默认缩进」那一组 | ⚠️⚠️ **两格都是死的，没有任何消费者**（2026-10-04 量第 47 项列表缩进时撞出来的，**已登记为 `docs/07` 第 92 项**）：`settings/editor.rs` 的 `default_indent`（`NumberInput`，默认 **2**）与 `align_indent`（`Toggle`，默认 **关**，help 写的是"子项与父项首行对齐、而不是按固定宽度缩进"）——**字段有、默认值有、界面有、`bridge/types-settings.ts` 里类型也有，而 `src/` 与 `src-tauri/` 里没有一处读它们去改编辑器的行为**（`grep -rn align_indent` 只有那三个文件）。⚠️ `default_indent` 的字段注释写着它**该**管"列表 / 引用 / 缩进块自动生成的缩进宽度"，但**行内缩进的宽度不是一个能配的量**——它是 `mdast-util-to-markdown` 在序列化那一刻按"标记宽度 ＋ 1"算出来的（`1.` / `10.` / `100.` ⇒ 3 / 4 / 5 格，`tests/list-indent.test.ts` 钉着）。⚠️ **`align_indent` 说的正是第 47 项要的那条行为**，而那一项量下来的结论是"那条行为本来就无条件成立"，所以**这一格要"不生效"的那一侧（固定宽度缩进）与往返冲突**（`10.` 那一档缩 2 格、重新解析就不是子列表了，文件会变形）。⚠️ **动手前先定口径**：改这一格的说明与语义、或者摘掉它，别照着现象硬凑——理由与两条出路见 `docs/07` 第 92 项。⚠️ 同族的先例：`show_hidden` / `tree_filter` 摆了四天被接线（第 85 项）、`match_brackets` / `match_markdown` 被「智能符号补全」取代（2026-09-28，见下两行） |
| 编辑器那一节·「段首缩进」 | **2026-09-27 加**（`settings/editor.rs` 的 `paragraph_indent` ＋ `paragraph_indent_chars`）。在「默认缩进」那一组**下面自成一组**，两格：开关 ＋ 宽度 `NumberInput`，**关着时宽度那格是灰的**。⚠️⚠️ 与上面那组「默认缩进」**不是一件事**：那条管"自动往文件里插几个空格"（列表 / 引用 / 缩进块，写在 `default_indent` 那一行旁边），这条只管**看起来**缩几格、**一个空格都不写进文件**——落点是 `<html>` 上的 `--para-indent`（`styles/applyTheme.ts` 写/摘，同一套"只写不摘会让关掉的开关还生效"的招）＋ `styles/editor.css` 一条 `.editor-mount .ProseMirror > p { text-indent: var(--para-indent, 0) }`。⚠️ 用户原话把第一段也划进来了（「第一段没有那个是现状。**要求改**」），所以**没有"标题后第一段不缩"这条例外**（那是英文排版的规矩）。⚠️ 只有**顶层** `p` 缩：引用 / 列表项 / 表格格子 / 代码块里的段落都不缩（那些块本来就有左边距）。⚠️ 1~8 这个区间**夹两道**（设置页 `NumberInput` 的 min/max ＋ `applyTheme` 里的 `Math.min/max`）：手改 `settings.toml` 写成 `999` 不该把一行推到屏幕外面。⚠️ **导出 / 打印 / 分屏预览里没有它**——那三处拿的是文件本身，而缩进是"看着"的属性；这条边界**待用户拍板**，见 `docs/07` 第 68 项与 `docs/03` §5.6c |

| 编辑器那一节·「智能符号补全」 | **2026-09-28 加**（`settings/editor.rs` 的 `smart_symbols`，**默认开**，用户原话：「自动补全 `*`、`[` 这种在设置中搞一个选项，**智能符号补全**。**默认为开**」）。**一格开关，带一段 help**。⚠️⚠️ 它**取代了原来那两组**——「匹配括号和引号」（`match_brackets`）与「匹配 Markdown 字符」（`match_markdown`），**两条都删了**：那两颗开关**存了值、从来没有任何代码读过**，拨了什么都不发生，而那比没有它们更坏（用户会以为自己关掉了一件事）。它们本来就是一件事的两半，用户要的是**一个**选项。⚠️ 关掉它 = `配对处理()` 返回 `[]` = **整条插件不装**（补一对 / 跳过 / 空对退格 / `Tab` 跳出右半边四件事一起走，它们互相咬着）。⚠️ 改完要**重开文档**（建实例时取一次）。⚠️ 老 `settings.toml` 里那两行留着不报错，下次保存自然消失。⚠️ **2026-09-29（BUG-54）：`*` 的「收尾」那一下改成**落成真标记**（`auto-pair.ts` 的 `收尾事务`）——补出来的那对星号原来是**字面文字**、落盘被正确地转义成 `\*甲\*`；**反斜杠本身不是 bug**，修法在编辑器这一侧（九道判据 ＋ 落完 `setStoredMarks([])`；没打完的一对仍是字面文字，故意留的边界）。⚠️⚠️ **2026-09-30 用户第二次报同一件事**（「还是会自动插入斜杠。渲染仍未成功。」）：首修只盖了「用户自己敲下收尾星」那一条路，而 `*` 是自配对的、闭星号是我方插进去的字符，**最常见的"补完直接打正文"那条路没被盖到**。现在同一个事务挂在**三个触发时机**上 ＋ `appendTransaction` 兜底（拼音输入法上屏不走 `handleTextInput`）；已落成标记的尾巴上再敲 `*` 则**吞掉那颗键**（插进去盘上就是 `*甲*\*`，正是用户抱怨的那颗反斜杠）。详见 `docs/05` §4.20c 与 §4.20d、`docs/03` §5.6d |

⚠️ **明暗那两张缩略图用的是真 token，不是画上去的颜色**：每张自带
`data-ui-style` / `data-ui-mode`，而 `theme.css` 里那两段是**裸属性选择器**，
于是缩略图取到的是那一格真正的变量（连该风格的识别色都对）。
⚠️ **但「主题色」那一条轴它自己取不到**：`[data-ui-mode]` 那一段**重新声明了
`--accent`**，重新声明就切断了继承，所以自定义的强调色下不去。办法是**把内联变量
在缩略图上再写一遍**（`ModeSwatch` 收了 `accent` 这个 prop，正是为此）——
⚠️ 少了这一句的症状是"缩略图永远显示风格自带的颜色、和实际界面不一样"，
**不报错**（`AppearancePane.tsx`）。判据来自
`ui/useUiMode.ts`（明暗，**订阅过系统偏好**）＋ `applyTheme.ts` 的 `resolveStyle()`
（风格）——**和真实外观同一套**。⚠️ 2026-09-25 之前这一页自己写了一份 `matchMedia`
订阅（`useResolvedAppearance`），而 `useDocTheme` 那边为了同一件事又写了一份；
现在两边都走 `useUiMode`。那一次顺带删掉了 `resolveAppearance()`——它把两条轴一起
算好返回，是给这一页用的，改用 `useUiMode` 之后**没有读者了**。
⚠️ 所以"往缩略图里写死两个色值"是错的：它是唯一会不跟着风格变的地方，
而那正是用户拿来做判断的东西。

⚠️ **搜索是就地过滤，不是跳转**：查询非空时十页**叠着**渲染，每行自己拿标签
和说明去比，比不中的返回 `null` 不进 DOM；一组里一行都没留下时
`.stg-group:not(:has(.stg-row))` 把整组收掉。⚠️ 搜索态下左栏**不高亮**任何一节。

⚠️⚠️ **那条 `:has()` 非搜索态下也生效，成了一口沉默的井**（2026-09-25 实测踩中）：
`settings.css` 里它旁边原先写着"非搜索态下恒不命中——每一组至少有一行"，
**那句话是错的**。`DocThemePane` 里那个「深色下用的是另一套」组当时**只有一个 `<Note>`**，
于是整组**无声无息地不画**——界面上什么都没有、**控制台一个字都不报**、
React 那边组件照样渲染（拿临时 `<pre>` 试过，兄弟节点在、组不在）。
📌 处置：给那一组挂一行真 `SettingRow`（就是上面说的「浅色下用的是」），
并把那段注释改成**如实的话**——"每组至少有一行"是**前提，不是保证**。
⚠️ **可迁移**：`display: none` 这种收法**没有任何反馈通道**——不像报错、不像崩溃，
连"少了个东西"都得先知道那儿本该有东西才发现。**给容器写隐藏规则时，
要么把它限定在真正的条件下（这里本该是 `.settings-shell[data-searching] &`），
要么在文档里点名"新加只放说明的组会重演这一幕"。**
⚠️ 每行能"被比"的字有**三种**，见 `primitives.tsx::SettingRow`：
`label` + `description`（都画出来）+ `searchText`（**只参与过滤、不画**）。
最后一档是给"每行挂一遍会变成噪音、可用户真会搜"的字用的——
快捷键那一节的**菜单名**（组标题已经写着「文件」）和**原始 accel**都在这一档里。
⚠️ 搜的是 `Ctrl+S` 那种**原始写法**，不是屏幕上那串：macOS 显示成 `⌘S`，
真让用户照着屏幕抄，反而搜不到。

⚠️ 搜索框右边那颗「×」**是 Nota 自己画的**，取代了 `<input type="search">`
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

| 看到的 | Nota 做的 |
|---|---|
| 小工具条里"链接 / 图片 / 列表 / 代码"是**图形**，不是字 | 工具栏那 9 枚换成图标（§2.9 那张表） |
| 面板收起的叉是一枚**图标**，不是字符 `×` | 侧栏 / 插件栏 / 标签页 / 提示条 / 查找条五处的 × 全换成 `folio-close-symbolic` |
| 设置窗口左栏的节名**前面有一枚小图标** | **Nota 本来就有**（原先在 `ui/settings/primitives.tsx` 里手写；2026-09-24 并入应用那同一套，见 §2.9）——不是照着这几张截图加的，看截图时才发现两边都有 |

**看清了但不跟的**：

| 看到的 | 为什么不跟 |
|---|---|
| 粗体/斜体用的是**字母** `B` `I` 本身，不是图标 | Nota 替成了图标。理由有两条：① 那 96 枚里 `format-text-bold/italic` 本来就有；② 字母得挑一个**字体**来画，而 `bars.css` 里那条 `.format-glyph-italic` 正是这么引到衬线上去的（§3.2b 的 ⛔ 那一段）——字母写法在 Nota 这儿**已经出过一次事** |
| 右键弹出的**浮动小工具条** | **没做**。它是"选中文字才出现"的第二套工具栏，等于把工具栏的状态机再写一遍（定位、翻转、失焦收起、与滚动位置互相干扰）。当前工具栏常驻顶栏，这条需求已经有了落点。⚠️ 真要做，位置是 `ui/FormatBar.tsx`，但**先读这一段** |
| 状态栏左下角有两个很小的开关（源码模式之类） | ⚠️ **这一条当时记的是「没做」，2026-09-30 翻案做了**（用户拿了三张 Typora 的截图点名要，见 §2.5）。当时不做的理由是"状态栏只放只读信息"——那条口径**从 2026-09-30 起作废**：下栏现在是**左手两枚开关 ＋ 右手一个数**。⚠️ 但当时那半句判断仍然值得留着：**开关这东西一开就收不住**——所以那个数只剩一个、详情挪进悬停，正是为了不让下栏变成一排开关加一排数字 |
| 偏好设置里"语法扩展 / 代码块 / 空格与换行"等几组 | 逐条列在 `docs/10` §11.2，**没做**（§3.5 那行也指了同一处） |

⚠️ **两条不许越过的线**（前面几节也提过）：

1. **界面文案里不许出现"跟某某编辑器一样"这类说法**。参考的是**做法**，
   写进界面的是 Nota 自己的话。
2. **截图只当参考，不抄它的图形资产、也不内置它的主题**
   （用户 2026-09-23 定的「不要内置外部编辑器的主题，会侵权」）。图标来自 Folio（`THIRD-PARTY.md` §5），
   与这几张截图无关。

---

## 4. 快捷键表

**这张表是算出来的，不是手写的**（2026-09-23 重做）。真源是 `ui/commands.ts` 里
每条菜单项的那个 `accel` 字段，`ui/accel.ts` 把它遍历成一张
`键位签名 → 命令 id` 的索引：

⚠️ **2026-09-27 起，"唯一真源"这句话要加一个限定**：用户在「快捷键」那一页动过的
那几条存在 `settings.toml` 的 `[keys.overrides]` 里（**差量**，只放动过的），
**有效键位 ＝ `commands.ts` 那份表叠上这份差量**——叠的动作只发生在 `App.tsx`
（那份 `菜单` 的 `useMemo`），**别在别处再叠一遍**（两处各叠一次的症状是
"设置页显示的是新键位、按下去跑的还是旧的"）。所以下面这张图里的 `MENUS`
在**改过键位之后**指的是"叠过之后的菜单表"：

```text
commands.ts 的 MENUS ＋ settings.keys.overrides（只放动过的）
  └─ 叠加（App.tsx 的 `菜单`）
       └─ buildAccelIndex(菜单)          ui/accel.ts，useMemo 里跑一次
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
**改成"凡是有修饰键就吞掉"会把系统剪贴板做坏**。

⚠️ **但 `Ctrl+B` / `Ctrl+I` / `Ctrl+Z` 是"查得到"的**（`fmt.bold` / `fmt.italic` /
`edit.undo` 都有处理函数），所以它们**不再**放行给编辑器，走的是 Nota 自己的
`runCommand`。⚠️ 早先这里写的是「`Ctrl+B/I/Z` 归 ProseMirror」，那是菜单栏还没有
处理函数时候的事，**已经不对了**——这类"当年对、现在错"的句子最难发现，
因为它读起来仍然通顺。

⚠️ **它们都是"开关"，而两种模式各自实现**（2026-09-30，BUG-57）：所见即所得那边
按的是**文档树**（`toggleMark`），源码/分栏那边按的是**字符**——`source.ts` 的
`切换行内标记` 问 `source-mark.ts`「选中的文字是不是已经带着这一对定界符」，
是**摘掉**、不是再包一层（不认得的嵌套一律不动）。所以**同一条命令在两种模式下
从界面看都是"再按一下取消"**，那条一致性是靠两处各自的判据凑出来的，不是共用
一份实现。

⚠️ **第 4 步意味着"灰 = 快捷键也没了"**。看着像缺陷，但这是唯一说得通的口径：
一个菜单项灰着（比如没有活动文档时的「保存」），它的快捷键却能生效，用户会
以为灰是画错了。**改这条之前，灰的定义要先说清楚**。

### 4.1 现在真的能按的

判据只有一条：**`accel` 有值，且 `menuHandlers` 里有这个 id**。
下面的数是**算出来的**（2026-09-23 核对），不是手抄的：

```sh
# 带 accel 的条目 ∩ 命令表里有处理函数的 id —— 「能用」那一半
node -e 'const fs=require("fs");const re=/id:\s*"([^"]+)"((?:(?!id:)[\s\S])*?)accel:\s*"([^"]+)"/g;const c=fs.readFileSync("src/ui/commands.ts","utf8");const a=fs.readFileSync("src/ui/useCommandTable.ts","utf8");const hs=new Set([...a.matchAll(/^\s*"((?:file|edit|para|fmt|view|help)\.[A-Za-z0-9]+)":/gm)].map(x=>x[1]));let m,o=[],b=[];while((m=re.exec(c)))(hs.has(m[1])?o:b).push(m[1]+"="+m[3]);console.log("能用 "+o.length+": "+o.join(" | "));console.log("按不动 "+b.length+": "+b.join(" | "))'
```

⚠️ **脚本里那个文件名 2026-09-27 改过一次**：处理函数表 2026-09-26 从 `src/App.tsx`
搬到了 `src/ui/useCommandTable.ts`，脚本没跟，结果**整表都算成了"按不动"**（`App.tsx`
那边只剩一个 `const menuHandlers = useCommandTable({…})` 的调用点，一个 `"xxx":` 键都没有）。
**判据是"有没有处理函数"，不是"哪个文件里"**——所以这个路径要跟着表走。

⚠️ 上面这个数**一变长就说明有人加了实现**——把它连同本文的数是"算出来的"一起
理解：**结果是结果，规格是"有没有处理函数"**。

| 快捷键 | 命令 id | 动作 |
|---|---|---|
| `F11` | `view.fullscreen` | 切全屏 |
| `Ctrl+N` | `file.new` | 新建文档 |
| `Ctrl+O` | `file.open` | 打开（走文件对话框） |
| `Ctrl+S` | `file.save` | 保存；没有路径时弹「保存为」 |
| `Ctrl+Shift+S` | `file.saveAs` | **强制**弹「保存为」 |
| `Ctrl+W` | `file.close` | 关闭（走未保存确认） |
| `Ctrl+,` | `file.preferences` | 打开偏好设置 |
| `Ctrl+P` | `file.print` | **打印**（2026-09-24 加；**2026-10-16 起默认键位是 `Ctrl+P`**，用户点名「打印默认快捷键是 Ctrl+P」）。⚠️ 它是"导出含样式的那份 HTML + 交给系统默认程序"，提示里会同时说清两步。⚠️ **它原来是 `Alt+Shift+P`**：`Ctrl+P` 早被「快速打开」占着，而打印这条**更通用**（`Ctrl+P` 是通用约定），所以 2026-10-16 让打印拿 `Ctrl+P`、「快速打开」挪去 `Ctrl+Shift+P`（见下面那一行）。⚠️ Windows 上这一条现在会把**系统自己的打印对话框**叫出来（`ShellExecuteW(…, "print", …)`），Linux/macOS 仍走默认程序，见 `docs/09` §2.1 那格 |
| `Ctrl+Z` / `Ctrl+Y` | `edit.undo` / `edit.redo` | 撤销 / 重做。⚠️ 两种模式各走各的历史（§4.2 末条） |
| `Ctrl+Shift+C` | `edit.copyAsMarkdown` | 复制为 Markdown。⚠️ 快捷键在**子菜单**里：`edit.copy` 那一项飞出来的子菜单 |
| `Ctrl+Shift+V` | `edit.pastePlain` | **粘贴为纯文本**（2026-10-07 加）。⚠️ 与 `edit.paste` 走**同一条路**（本应用的粘贴本来就只进纯文本，Milkdown 没有 `clipboardParser`），留这一条是因为那颗键是肌肉记忆。⚠️ WebKitGTK 上 `navigator.clipboard.readText()` 被权限拦着 → 弹「请按 Ctrl+V」（**环境如此，不是这一条没做**） |
| `Ctrl+L` / `Ctrl+D` / `Ctrl+E` / `Ctrl+Shift+D` | `edit.selectLine` / `edit.selectWord` / `edit.selectSentence` / `edit.deleteWord` | **选当前行 / 选当前词 / 选当前句 / 删除当前词**（2026-10-07 加，照 Typora 的习惯；菜单在「编辑 → 选择 ▸」子菜单里）。⚠️ 「行」在两种模式下**不是一个东西**：源码模式用 CodeMirror 自己的 `selectLine`（**含末尾换行**），所见即所得是**一段**（不含）。⚠️ 光标贴着**词尾/句尾**时选的是**刚过去**那一个（最常撞上的位置）。⚠️ **代码块里这四条走的是另一条路**：`Ctrl+L` / `Ctrl+D` / `Ctrl+Shift+D` 由块里那颗 CodeMirror **自己接**（`code-block-cm.ts`，与 `select.ts` 共用判据），`Ctrl+E`（选句）**两头都不做**（代码里没有"句子"这个概念）；⚠️ **菜单里点那四条在代码块里不动**（菜单走 PM 那条路，那一格的主人不是它），记在 `docs/07` |
| `Ctrl+F` | `edit.find` | **只查找**（2026-10-06 加，第 95 项）。⚠️ **在此之前这颗键根本没绑**——用户当天点名「记得搞一下 ctrl f 搜索。要支持正则表达式」，而**引擎与开关早就齐了**（`editor/find.ts` 的 `FindOptions.regex` ＋ 查找条上那颗 `.*`），缺的只是这颗键 |
| `Ctrl+H` | `edit.findReplace` | **查找与替换**（2026-09-24 加）。⚠️ **2026-10-06 起两条键共用一个条子、差别只在"要不要画替换那一行"**：`Ctrl+F` 不画（`useFindBar` 的 `替换行`），`Ctrl+H` 画 |⚠️ 只**开**条子，不切"开/关"——光标的焦点在条子里时这条键**接不到**（`isOutsideEditor` 那条判据），此时用 Esc 关 | ⚠️ **2026-10-06（第 95／105 项）**：① `Ctrl+F` **新绑**（`edit.find`，只开 Find 那一行）、`Ctrl+H` 才带替换行（`useFindBar` 的 `替换行` ＋ `FindBar` 的 `显示替换`）；② 正则开着时**「全词」灰掉且值不参与**（`\b` 做的是同一件事）；③ 查找条的样子按用户那句「不美观」调过：**开关加了静止态**（原来是纯文字、看不出能点也看不出哪颗开着）、**聚焦圈从纯强调色改成淡版**（用 `box-shadow` 不用 border——border 一粗旁边那排开关会跟着挪）、两行间距 3→6px。📌 **卡片化当天也做了**：`.find-bar` 现在是 `width: fit-content` ＋ 靠右 ＋ 圆角/描边/`--shadow` 的一张卡片，不再铺满整行。⚠️ **窄窗口那一档还没量**。
| `Ctrl+Shift+L` | `view.toggleSidebar` | 显示/隐藏侧栏（可勾项） |
| `Ctrl+Shift+1` | `view.outline` | 开侧栏并切到**大纲**（可勾项） |
| `Ctrl+Shift+3` | `view.fileTree` | 开侧栏并切到**文件树**（可勾项） |
| `Alt+1` / `Ctrl+/` / `Alt+2` | `view.modeWysiwyg` / `view.modeSource` / `view.modeSplit` | **三种编辑模式**（可勾项，三选一）。⚠️ 键族刻意不统一，见 `commands.ts` 那段注释：`Ctrl+/` 沿用"源码模式"的通行键位（改掉会让熟悉它的人手感失效），`Alt+1/2` 那两个没有先例可循，是 Nota 自己排的。<br>⚠️ **`Ctrl+/` 曾经和 CodeMirror 的 `toggleComment` 撞车**（2026-09-25 修，BUG-26）：在源码模式里按它，光标那行**会被套上一对 `<!-- -->`**（CM 的默认键位表里有一条 `Mod-/`，两边都会执行）。同族的还有 `Ctrl+I` / `Ctrl+Shift+K` / `Ctrl+Z` / `Ctrl+Y`，一共四条，现在由 `editor/source.ts` 的 `撞车键位` 摘掉——**再往这张表里加 accel 时要回去对一遍**，见 `docs/02` §`src/editor/source.ts` |
| `Ctrl+1`…`Ctrl+6` | `para.h1`…`para.h6` | 标题一到六级 |
| `Ctrl+0` | `para.text` | 正文段落 |
| `Ctrl+Shift+M` | `para.mathBlock` | **公式块**（2026-09-26 起真的能按了，`docs/07` 第 52 项）。⚠️ 插的是一个**空的** `$$` 块、并把整块选中（源码框当场打开）——`@milkdown/plugin-math` **没有插入命令**，这条是 `editor/insert.ts` 里自写的 |
| `Ctrl+Shift+K` / `Ctrl+Shift+Q` / `Ctrl+Shift+[` / `Ctrl+Shift+]` | `para.codeBlock` / `para.quote` / `para.ol` / `para.ul` | 代码块 / 引用 / 有序列表 / 无序列表 |
| `Ctrl+Shift+X` | `para.task` | 任务列表（2026-09-24 起 `para.task` 也有处理函数了） |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+\`` / `Alt+Shift+5` | `fmt.bold` / `fmt.italic` / `fmt.code` / `fmt.strike` | 加粗 / 斜体 / 行内代码 / 删除线 |
| `Ctrl+U` | `fmt.underline` | 下划线（`<u>`，见 §4.13 那一族）。⚠️ **2026-10-04 补的这一行**：这一条**列在菜单里很久了**，此前源码模式／分栏下**按不动**——被 CodeMirror 的 `undoSelection`（`Mod-u`）抢了整整四个月（BUG-58，根因与量法见 `docs/07` BUG-58 与 `docs/06` §5.47 ②）。⚠️ 所见即所得那边**一直是好的**（那里没有 CodeMirror） |
| `Ctrl+K` | `fmt.link` | 插入超链接——**弹两个字段的框**（「链接显示名称」＋「链接内容」，见 §2.6i）。⚠️ 光标已经在链接上时，框里填的是**这条链接的现值**、还多一颗「去掉链接」（**不再是**"再点一次＝去掉"那种切换语义，2026-10-07 改的，见 `docs/07` 第 96 ＋ 102 项） |
| `Ctrl+\` | `fmt.clear` | 清除行内样式。⚠️ 只在**有选区**时亮（`光标条件` 那条判据） |
| `F8` / `F9` | `view.focusMode` / `view.typewriter` | **专注模式 / 打字机模式**（可勾项，2026-09-24 加），见 `docs/05` §4.4 |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+Shift+0` | `view.zoomIn` / `view.zoomOut` / `view.zoomReset` | **放大 / 缩小 / 实际大小**（2026-09-27 加，`docs/07` 第 75 项）。⚠️ 走的是**滚轮同一条路**（`ui/useZoom.ts` 的 `应用缩放`），但**不看** `ctrl_wheel_zoom` / `ctrl_wheel_target`——那两格管的是滚轮。⚠️ 复位**不是** `Ctrl+0`：`Ctrl+0` 在本仓是「正文」（上面那条），试验台 `#accel` 抓到撞车，换的是复位 |
| `Alt+↑` / `Alt+↓` | `edit.moveLineUp` / `edit.moveLineDown` | **上移 / 下移该行**（2026-10-07 接上，此前一直在 §4.2 那份"按不动"的名单里，`docs/07` 记着的那笔账）。⚠️ 搬的是**光标所在的那一块**：在列表项里就搬那一个列表项，别处搬顶层块；⚠️ **表格里不做**（没做行/列挪动，"整张表上移"才是最坏的），⚠️ **到边就是不动**（不绕回去）。⚠️⚠️ 这两颗键在所见即所得里**必须自己接**——`baseKeymap` 把它们绑给了 `joinUp`/`joinDown`（合并相邻两段）并 `preventDefault`，不接的话用户看到的是"两段被并成一段"（`editor/move-block.ts`，实测见 `docs/06` §5.55）。⚠️ 源码模式走 CodeMirror 自己的 `moveLineUp/Down` |
| `Alt+M` | `view.menuBar` | **隐藏 / 显示菜单栏**（2026-09-28 加，`docs/07` 第 78 项）。⚠️ **这一条不能没有键位**：菜单栏藏起来之后，它自己就是界面上唯一写着"菜单栏还能开回来"的地方（它一藏，这句话也没了）。⚠️ `Alt+M` 是**空位**（`Alt+1`/`Alt+2` 是编辑模式、`Alt+↑/↓` 是移动行，没有别的 `Alt+字母`）。⚠️ 藏下去的那一刻会弹一条提示，文案里写的两条路就是**这一条键位**与「设置 → 外观 → 显示菜单栏」 |

**共 59 条**（算出来的，**2026-10-07 重跑**；**2026-10-04 是 52**；
**2026-10-07 那 7 条**＝`edit.pastePlain` ＋「选择」那四条 ＋ `edit.moveLineUp/Down`
——最后两条是**从下面那份"按不动"名单里搬过来的**；对应 **3** 条按不动）。
⚠️ **50 → 51 是 2026-09-28 当天晚些**：加了 `view.menuBar`（`Alt+M`，隐藏/显示菜单栏，
用户点名，见下面那张表与 §3 的外观页）。⚠️ 它是这张表里**唯一一条"按不动就没别的路
回来"的命令**（它自己就在被隐藏的那一条上），键位是为这个才给的；同一件事的另一半
（藏下去时那条提示）在 `ui/useChromeVisibility.ts` 的文件头。
⚠️ **51 → 50 是 2026-09-28 早些时候**：`view.docList`（`Ctrl+Shift+2`）随侧栏那一页
一起从菜单里删了（用户点名，见 §2.2）——**不是**它变得按不动，是它不存在了。
⚠️ **2026-09-27 那天从 42 / 8 变成 51 / 5**：多出来的 9 条是那天几批接上的（`fmt.superscript` 那一族、脚注、缩放……），少掉的 3 条按不动是 `fmt.underline` / `view.docList` / `view.devtools`——**它们早就有处理函数了**，此前一直被算成"按不动"是因为那段脚本还在读 `src/App.tsx`（见上面那条 ⚠️）。⚠️ **这两个数要拿上面那段脚本重跑，不要手抄。**⚠️ 这张表里**段落与格式那 16 条是 2026-09-23 才亮的**——
它们的处理函数早在菜单栏那一批就写好了（`run("bold")` 之类），但 §4.1 当时只列了
12 条，把这一批漏在外面。**漏的原因是当时是手抄的，不是算的**——所以现在把
算法写在上面。

⚠️ **两种编辑模式下这些命令的实现不是同一份**：所见即所得走 ProseMirror 的
`callCommand`，源码模式走 `source.ts::applyCommand` 的**文本操作**。
`Ctrl+Z` 尤其明显：**两边的撤销栈不通**，切模式等于清空历史（`docs/05` §3.1）。

### 4.2 写着但按不动的

**3 条**（同样是算出来的，**2026-10-07 重跑**）：`file.newWindow` `Ctrl+Shift+N`、
`file.quickOpen` `Ctrl+Shift+P`、`view.search` `Ctrl+Shift+F`。
⚠️ 那一行的键位 **2026-10-16 从 `Ctrl+P` 改成 `Ctrl+Shift+P`**（让给打印），
这一组"写着但按不动"的结论没变——让位之后它照旧没有处理函数。
📌 **2026-10-07：5 → 3**——`edit.moveLineUp/Down`（`Alt+↑/↓`）**接上了**，搬去了 §4.1
（`editor/move-block.ts`；它们此前在这份名单里待了很久，是"菜单里写着键位、按下去没反应"
那一族里最典型的两条）。
⚠️ **从 12 条掉到 8 条、再掉到 5 条、现在是 3 条**：`edit.cut/copy/paste` 那三条早就有了处理函数
（`ui/useClipboard.ts`，文档没跟）、`para.mathBlock` 是 **2026-09-26** 接上的
（`docs/07` 第 52 项）；`fmt.underline` / `view.docList` / `view.devtools` 那三条
**2026-09-27 重新算才发现它们一直有处理函数**——不是那天接上的，是旧脚本读错了文件
（见 §4.1 那条 ⚠️）。⚠️ 其中 **`view.docList` 2026-09-28 已经从菜单里删掉了**
（侧栏那一页没了，见 §2.2）：它既不在"能按"那一半、也不在这份名单里。
⭐ **剩下这 3 条就是真的没实现**：多窗口那两条属"大方向"
（`docs/07`），快速打开与全文搜索是各一整块功能。

⚠️⚠️ ~~**这一组另有一个问题：它们是灰的，键位却照显示。**~~ ✅ **2026-09-25 已修**：
`MenuPopup` 两处（第 260 / 373 行）的判据现在是 `entry.accel && !disabled.has(entry.id)`
——**灰项不印键位**。上面那段原文举的例子（「公式块」写着 `Ctrl+Shift+M` 却按不动）
其实是**两个毛病叠在一起**：键位照显示（2026-09-25 修）＋ 那条命令根本没实现
（**2026-09-26** 接上，见 `docs/07` 第 52 项）。⚠️ **判据本身（有没有处理函数）从来没问题**，
错的是"灰了还把键位挂在旁边"。

⚠️ **这份名单曾经写着 19 条，多出来的 7 条是陈旧**：`file.print`、`edit.findReplace`、
`para.task`、`fmt.link`、`fmt.clear`、`view.focusMode`、`view.typewriter` ——
它们**当时确实是灰的，现在都亮了**（各自的表在 §4.1）。
**名单是算出来的，不是手抄的**：手抄的症状就是这个——功能做了、
灰名单还留着它们的名字，读的人会以为没做。

**这 3 条键位是照通行习惯定的**，对应的命令**后端/前端还没有实现**，所以
`menuHandlers` 里没有它，菜单里是灰的，第 4 步会把按键放行。
（⚠️ 原文写"12 条"——那是个**陈旧数**，名单从 12 → 8 → 5 → 3 一路减下来，这里没跟着改。）

⚠️ ~~**`Ctrl+X/C/V` 那三条是另一类**：它们**不该有**处理函数（交给系统剪贴板），
所以"永远按不动"是**对的**~~ —— ⚠️ **这一句 2026-09-26 复核时发现已经过期**：那三条
**现在有处理函数**（`App.tsx` 的 `"edit.cut/copy/paste"` → `ui/useClipboard.ts` 的
`剪切` / `复制` / `粘贴`），所以它们不在"按不动"那一组里（见上一节）。
**当年那句话的道理仍然成立**（这三件事归谁是有讲究的），只是"它们永远按不动"
已经不是事实。判据不是"这个 id 有没有 handler"，而是"这件事该归谁"——
这三件归 `useClipboard`。

⚠️ **这跟过去是两回事**。过去 `accel` 只是显示、真绑定另有一张手写表，
两边能各错各的；现在**同一张表**，所以"菜单上写着 `Ctrl+P` 却按不动"
和"菜单里那一项是灰的"必然是同一件事。**这个组合不是 bug**——
它就是在说"这个功能还没做"。真做出来了，加 `menuHandlers` 那一行，两者一起活。

### 4.3 焦点与边界

⚠️ `isOutsideEditor` 判的是 `input` / `textarea` / `select` /
`[contenteditable='true']`，**且不在 `.editor-pane` 里**。编辑器自己那棵
ProseMirror 的 DOM 也是 `contenteditable`，所以那个"不在编辑区里"的例外
不能省——省了编辑器里一个快捷键都用不了。

⚠️ 监听器挂在 `window` 上、**只装一次**（`useMemo` 出来的 `accelIndex`
是稳定的），但 `menuHandlers` / `disabledCommands` 变了会让 effect 重装——
新的闭包要看到新的 `docs`。功能上是对的，只是不能当成"整个生命周期只跑一次"。

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
不报错也不崩。⚠️ **插件那一栏挪到前面会出问题**——那会让某个插件的 `Ctrl+S`
抢掉保存，而且只在装了那个插件时才出现。
⚠️ 插件声明的键位**不出现在「快捷键」那一页**（`ShortcutsPane` 读的是 `App.tsx`
那份**菜单表**，而插件那几项是**另一份合成出来的**、只喂给菜单栏与分发；⚠️ 2026-09-27
之后那一页读的**不再是常量 `MENUS`**，而是叠过用户覆盖的那份 `menus`——所以"那一页
为什么不列插件键位"的理由**只剩"插件项不在那份表里"**，别再用"它读常量"去解释）。
理由见 `docs/02` 的 `ui/commands.ts` 那一节。


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

⚠️ **2026-09-26 再加两块**：**强制专注**（`ui/useForceFocus.ts`——`state` 一个 `useState`，
**主窗与警报窗共用同一份**，因为它订阅的是宿主那份 `FocusState`：四条命令 `start` / `stop` /
`ack` ＋ 一个状态）与**警报声**（`ui/useFocusAlarmSound.ts`，订阅 `nota:focus-beep` 那个**事件**）。
⚠️ 这两块有一个特别之处：**它们持有的是后端状态的一份镜像**，真相源在宿主的计时线程里
（`focus/mod.rs`）——所以前端**一个判断都不做**。它再判一次（比如「余额小于零我自己也弹一个」）
就会出现两边不一致，而那种故障用户完全没法排查。
⚠️ 也正因如此，**它不进 `settings`**：余额、阶段、这一轮坐了多久都是**会话状态**，
每秒都在变、重开就从头开始（`[focus]` 表里只有那六个旋钮，见 `docs/03` §5.6）。
⚠️ 那一格界面在**状态栏**（§2.11），**不在设置页**——设置页显示一个每秒跳动的数会让整页重画。

**18 个 `useState`**（`grep` 数出来的，2026-09-24 重数）：

| 状态 | 类型 | 谁改它 |
|---|---|---|
| `docs` | `Document[]` | `refreshDocs()`（`api.doc.list()`）：启动、新建、打开、保存、关闭、**以及编辑器去抖同步之后** |
| `activeId` | `DocId \| null` | 新建/打开/关闭，以及点标签（`setActiveId` 直接传给了 `TabBar`）。⚠️ 它一变就有一个 effect 去喊 `api.doc.setActive`（BUG-6） |
| `settings` | `Settings \| null` | 启动读一次 + **`updateSettings()` 改它**。⚠️ 不是"读一次就不动了"了：调用点有「主题」菜单（文档主题）、偏好设置里**每一页的每一行**（写盘走 `SettingsDialog` 的 `paneWriter`）、以及外观页那几个即时开关。⚠️ **它是整份替换**（`nota_settings_set` 收完整对象），所以改一项也要把整份传回去 |
| `workspace` | `string \| null` | 启动读一次 + 打开文件夹 |
| `tree` | `TreeNode[]` | `refreshTree()`，随 `workspace` 变 |
| `plugins` / `panels` / 插件菜单项（在 `ui/usePlugins.ts` 里，**不在这里**） | — | 📌 **2026-09-24 搬走了**。三样在同一个 `Promise.all` 里拉（`list()` / `panels()` / `menus()`）——它们回答的是同一个问题（"现在装了什么"），分开三次只会多出几种中间态。⚠️ **都靠拉、不靠事件**（BUG-13），见 §2.2b |
| `面板内容`（在 `PluginDock.tsx` 里，**不在这里**） | `Record<string, 面板状态>` | 每个面板一份，四态。⚠️ 住在 `PluginDock` 自己家里、**不往上抬**：内容是"这一刻从插件拉回来的东西"，没有第二个人要用 |
| `toasts`（在 `ui/useToasts.ts` 里，**2026-09-25 搬走**） | `Toast[]` | `toast()` 加、定时器或用户点 × 减 |
| `sidebarOpen` | `boolean`（**默认 `false`**） | 菜单栏「视图」栏、`Ctrl+Shift+L` |
| `sidebarTab` | `"tree" \| "outline"` | **受控**：`Sidebar` 自己不再持有它，点标签页、菜单栏「大纲/文件树」、`Ctrl+Shift+1/3` 都改这里 |
| `statusBarOpen` | `boolean`（默认 `true`） | 菜单栏「视图 → 状态栏」＋ **状态栏右端那颗 ×**（2026-10-04 加，第 49 项——两颗走同一个 `setChrome`，只是那颗 × 只写 `false`、不取反）。⚠️ **2026-09-25 起不再是这里的 state**：值是 `settings.appearance.show_status_bar` 的派生值（`ui/useChromeVisibility.ts`），改它走 `updateSettings`——在那之前菜单与设置页各有一套同名开关、互不联动（见 `docs/07` §2） |
| `dockOpen` | `boolean`（**默认 `false`**） | 顶栏的「插件」开关、右栏的 ×、菜单栏「视图 → 插件栏」。⚠️ **只在内存里，没进 `settings`**——它和左栏选哪一页一样是「看的时候的状态」，不是文档属性。刷新即复位 |
| `themes` | `DocThemeInfo[]` | **只在启动时读一次** `api.theme.list()`。⚠️ 所以往主题目录丢新 `.css` 得重启才看得见（`docs/07` 第 41 项） |
| `settingsOpen` | `boolean`（默认 `false`） | 菜单「文件 → 偏好设置」、`Ctrl+,`；关由 `SettingsDialog` 的「关闭」 |
| `formatBarOpen` | `boolean`（**默认 `false`**） | 由 `settings.appearance.toolbar` 派生（`ui/useChromeVisibility.ts`）＋ **工具栏右端那颗 ×**（2026-10-04 加，第 49 项：它与菜单里 `view.toolbarNever` 写的是**同一句** `setChrome({ toolbar: "never" })`，见 `ui/useChromeVisibility.ts` 的 `收起工具栏`）。⚠️ **2026-09-25 起它不是布尔量了**：设置文件里那一格是**三档** `ToolbarMode`（`always` / `hover` / `never`），**默认 `never`**（用户要求），这里是它的"这一档现在画不画"的化简。⚠️ 菜单里对应的是**三条子项**（`view.toolbarAlways` / `view.toolbarHover` / `view.toolbarNever`，见 §2.1b），不是一条可勾项；「悬停」那一档靠一条 **8px** 的触发带实现（`顶部触发带`，压在**主区**最顶上那 8px，不是窗口顶端——去点菜单时不该顺带弹出一条工具栏）。⚠️ **别把它和 §2.10 那条 6px 的 `--zen-peek` 混起来**：一条在主区顶端唤工具栏（JS 里的常量），一条在窗口顶端唤菜单栏（CSS 变量），两个数故意不同。⚠️ 悬停那一档**会把正文挤下去**（工具栏在文档流里，不是浮层）——"看的时候挡住内容"比"内容跳一下"更糟。理由都在 `useChromeVisibility.ts` 文件头 |
| `findOpen` | `boolean`（默认 `false`） | 菜单「编辑 → 查找与替换」、`Ctrl+H` 开；`Esc` / 条子上的 ✕ 关（`App.tsx::关查找`，一并清高亮并把焦点还给编辑区） |
| `findStatus` | `FindStatus` | **编辑器报上来的**（`EditorPane` 的 `onFindStatus`），`App.tsx` 不自己算。⚠️ 换文档/切模式时编辑器会报一次 `空查找状态`——不留着上一次那份 |
| `focusMode` / `fullscreen`（**2026-09-25 起在 `ui/useImmersive.ts` 里**） | `boolean`（默认都 `false`） | 菜单「视图 → 专注模式 / 全屏」、`F8` / `F11`。⚠️ **明确不进 `settings`**：和 `dockOpen` 同类，是"看的时候的状态"。⚠️ **`fullscreen` 的真相不在内存里**：每次都从窗口读回来（`isFullscreen()` ＋ `onResized` 镜像），本地记一个布尔的症状是"用户按 `F11` 或窗口管理器自己全屏了，菜单里的勾还是错的"。两个模式合成同一条 `data-zen`，见 §2.10 |
| `typewriter` | `boolean`（默认 `false`） | 菜单「视图 → 打字机模式」、`F9`。同上不进 `settings`。⚠️ **它没有跟着专注模式一起搬**——打字机模式只有编辑区那一半（`editor/writing-modes.ts`），不碰外壳，所以留在 `App.tsx` 反而更短 |
| `commandState` | `CommandState \| null` | **所见即所得那边报上来的光标状态**（`EditorPane` 的 `onCommandState`）。⚠️ 源码模式与没有文档时报 `null`——**不是空状态**，两者含义不同（见 `docs/05`） |
| （`confirmReq` / `promptReq` / `imageReq`） | — | ⚠️ **2026-09-24 起不在这里**，搬去了 `ui/useDialogs.ts`（见上）；`imageReq` 是 2026-09-26 加的那第三个自绘对话框（插图），形状与另外两个一样：一个 `useState` ＋ 一个 resolve ref |

**4 个 `useRef`**（`App.tsx`；`MenuBar` 自己内部还有一个 `barRef`，见下表末段）：

| ref | 类型 | 干什么 |
|---|---|---|
| `editorRef` | `EditorPaneHandle` | 命令式通道：`getMarkdown()`（存盘前强制同步）、`setMarkdown()`（插件改了文档）、`focus()`、`runCommand()`（**三条入口都从这儿进**：自绘菜单点选、快捷键命中、原生菜单发来的 `nota:native-menu`） |
| `activeIdRef` | `DocId \| null` | **给事件订阅用的**。订阅那个 effect 不该因为 `activeId` 变了就重装，所以回调里读 ref 而不是闭包里的值 |
| `mainRef` | `HTMLElement \| null` | **2026-09-25 加的**，指向 `<main class="app-main">`。只用于量它顶端在哪——格式工具栏「悬停显示」那一档的触发带按它算 |
| `formatBarRef` | `HTMLDivElement \| null` | 指向 `FormatBar` 的根元素。判定"指针还在工具栏上吗"要它的**真实下沿**（那个位置随查找条开没开、界面风格、缩放而变），按常量算一份就是同一个数字存两处 |
| （`confirmResolve` / `promptResolve`） | — | ⚠️ **2026-09-24 起不在这里**，搬去了 `ui/useDialogs.ts`。那里两个 ref **各一个、都不是队列**，理由见 §2.6b |
| （`run` / `gateRun`） | — | ⚠️ **2026-09-25 起不存在了**：那两个"这次还算不算数"的序号住在 `ui/useSlidev.ts` 里，那个文件随 Slidev 搬进插件一起删了。预览在途时点两次菜单那类竞态，现在归**插件自己**管（`plugins/slidev/main.lua`） |

⚠️ `MenuBar.tsx` 里还有个 `barRef`（挂在 `.menubar` 上），用途是判"这次 `mousedown`
点到的是不是菜单以外"→ 是就关弹层。

⚠️ **`settings` 改完必须 `setSettings(...)` 把新的那份放回 state**（`updateSettings`
就是这么做的），否则 `applyTheme` 与 `ui/useDocTheme.ts` 那个 effect 都不会重跑——
症状是"设置存进去了，界面没变"。

---

## 6. 与 `api.*` 的对账（哪些命令前端还没用上）

`src/bridge/ipc.ts` 导出的 **49 个方法**里（2026-09-26 重数：doc 11 / workspace 4 /
appLang 1 / settings 5 / nativeMenu 1 / export 3 / **image 4** / pandoc 2 / theme 3 /
plugin 13 / frontendReady 1 / startupFile 1），**从未被调用过的有 4 个**。
它们不是死代码——是后端已经做好、前端还没接线的口子：

| 命令 | 谁会用到它 |
|---|---|
| `api.doc.get` | 单取一份文档的最新状态（而不是拉整张表） |
| `api.doc.hasUnsaved` | ⚠️ **它今天只当镜子用**（"还有没有没存的"这句话在宿主那边是**镜像**口径）：真正拦关窗那一枪读的是**宿主自己**那份 `DocumentStore::has_unsaved()`（`src-tauri/src/lib.rs::关窗前要问`），前端那一层判的是**编辑器树上那份**（`ui/useQuitGuard.ts` 用 `docs.filter(d => d.dirty)`）。两处都判不是重复，见 `docs/07` 第 122 项那一批 |
| `api.workspace.close` | 关掉工作区（只清围栏，**不关文档**）——⚠️ **今天打开文件夹之后没法关** |
| `api.plugin.findCommand` | 对账"这个命令是哪个插件的"。⚠️ 没有界面入口，是个诊断口子 |

📌 **2026-09-24 起 `api.plugin.call` 从这张表上下来了**（`ui/usePlugins.ts::调`，
面板按钮与插件菜单项两条路都走它），`api.plugin.panelContent` 是同一批新接上的。
**第 42 项（插件菜单接进菜单栏）同日结清**——那份"还要等第 42 项"的注记可以划掉了。

📌 **2026-09-25 起 `api.plugin.setEnabled` 也下来了**（插件行上那个启用/停用开关），
同批新接上的是 `plugin.review` / `plugin.reviewClose`（编辑区里那块预览）、
`export.reveal`（导出后定位文件）、`pandoc.probe` / `pandoc.export`、
`settings.openDir` / `settings.reset`、`appLang`。

📌 **2026-09-26 上传那批让 `image` 从 1 变 4**：`api.image.uploadGet` / `uploadSet` /
`uploadOne` 三条同批接上（分别在 `ui/useImageInsert.ts`——问宿主"这份文档能不能传、
是不是自动传"；`ui/settings/panes/ImageUploadGroup.tsx`——那一组八个字段读写；
`ui/ImageDialog.tsx`——对话框上那个勾选框的"先传、失败才落盘"那条路）。
⚠️ 数字从 46 变 49，但**"从未被调用过的 4 个"一个都没变**——新加的三条全都在
同批就接上了（这是这一批与"后端先做好、前端慢慢接"那种批次的区别）：
`api.doc.get` / `api.doc.hasUnsaved` / `api.workspace.close` / `api.plugin.findCommand`
四条 2026-09-26 现 `grep` 过，调用点仍然是 0。

📌 **2026-09-26 起 `api.image.place` 也下来了**（`ui/useImageInsert.ts`，三条入口
——对话框 / 粘贴 / 拖入——都走它）。⚠️ 它**不是**"发一个地址给后端"：前端交的是
**"图从哪来"**，宿主管落点、管拷贝、管下载，回一条能直接写进 Markdown 的地址
（见 §2.6f）。⚠️ 它和上面那三条上传命令是**宿主命令里自己会出网的**（`place` 的
网络图片那条路、`uploadOne` 那次真发的请求，两处都最长 30 秒），所以它们必须
异步——`docs/06` §3.1 那条。⚠️ 插件那条路（`api.plugin.call` → `nota.http`）不算
在内：那时候出网是**插件自己**发起的。
⚠️ **2026-09-26 之前这句话写的是"唯一"**——上传那批落地之后它就不成立了（写"唯一"
的时候上传还没做）。已经改掉，免得下次有人照它去推断"只有 `place` 一条会出网"。

⚠️ **已经接上的**（这份对账表以前把它们列成"没用上"，逐条澄清，以免再被抄回来）：
`api.doc.setActive`（BUG-6 的 effect）、`api.doc.reload`（菜单「从磁盘重新加载」）、
`api.settings.set`（主题切换）、**`api.settings.problem`**
（启动那一段拉的第四条，2026-09-25 接上：拿到非空值就弹一条**不自动消失**的提示，
同时后端的 `nota_settings_problem` 是开机读设置失败唯一的界面出口）、
**`api.startupFile`**（启动那一段的第五条，2026-09-25 接上：`nota 笔记.md` /
文件管理器"用 Nota 打开"带进来的那个路径，拿到就交给 `openPath`——**打开动作不在这里
另写一份**）、`api.plugin.panels` / `api.plugin.menus`
（启动时拉一次，BUG-13 的修法）、`api.theme.*` 三条、`api.frontendReady`、
**`api.nativeMenu.apply`**（`ui/useMenus.ts`，返回值决定藏不藏自绘菜单栏）、
**`api.export.write` / `api.export.print`**（都在 `ui/useExport.ts` 里）。

⚠️ **`api.slidev.*` 那八条已经不在了**（2026-09-25）：Slidev 搬进插件，`ui/useSlidev.ts`
删掉，那八条命令后端也整组删了。现在宿主给预览提供的机制在 `devserver.rs`，它
**一条命令都不注册**——插件走的是 `nota.devserver.*`（Lua 那一侧）。

⚠️ **"启动文件打不开"有两种，提示不是同一条**（2026-09-25，BUG-34）：

| 坏在哪 | 谁先发现 | 用户看到 |
|---|---|---|
| **文件名**不是合法 UTF-8 | **宿主**，`nota_startup_file` 直接 reject（`NotaError::NonUtf8Path`） | 「命令行给的文件打不开：路径不是合法的 UTF-8：…」——**就地弹，不进 `openPath`** |
| 文件名没问题、**内容**不是合法 UTF-8 | 前端 `openPath` 把它读进来时 | 「读文件失败 …：内容不是合法的 UTF-8 文本」 |

⚠️ **上面那张表里 `startupFile` 那一枪自带 `catch`，不是可选的**：它蹲在启动那个
`Promise.all` 里，一 reject 就会把 `setSettings` / `setThemes` / `refreshDocs` **整个跳过**
——一个打不开的文件不该把启动拖垮。改这段代码前先看 `App.tsx` 那一枪旁边的注释。

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
**第 20 项**（自动保存接上 `autosave_seconds`——⚠️ **2026-09-25 已结清**，
两档都接了，见上面「文件」页那一行）、
**第 26 项**（「放弃修改并重载」入口——⚠️ **2026-09-25 已结清**：
这里原先写"菜单只是调了 `api.doc.reload`，与'放弃修改'是两回事"，**那句是错的**。
`useDocuments.ts` 的 `reloadDoc` 在有未保存改动时**先弹「丢弃并重新加载」**，
确认才走 `api.doc.reload`——"丢弃"这个语义就在里面。菜单就是那个入口）、
**第 41 项**（主题清单不重扫）。
⚠️ **第 42 项（插件菜单接进菜单栏）2026-09-24 已结清**——上面那段还提到它，那一句已作废。

---

## 7. ✅ 与 `07` / `10` 的四处不一致（**已全部结清，2026-09-22**）

`docs/09` §1 第 1 条：**文档与代码不一致时以代码为准**，同一批改文档，并记入 `docs/07` §4
的漂移登记表。本文写作时**代码与那两份文档对不上**的四处，已由 `docs/07`/`docs/10`/
`AGENTS.md` 的持有者当批改掉。**下表保留原样，只把"该改哪"换成"实际怎么改的"**——
它记录了"这四处的共同成因"，比记录"改完了"有用。

| # | 当时文档怎么说 | 代码是什么 | 实际怎么改的 |
|---|---|---|---|
| 1 | `docs/07` 第 25 项："文件树点击打开文件……现在树只读，点了不开"；`docs/10` §2 同行："树能列出来，但**点文件不会打开**" | `Sidebar.tsx::TreeNodeRow`（第 130 行）的文件分支有 `onClick={() => onOpenFile(…)}`，一路接到 `App.tsx::openPath()` → `api.doc.open()`，**点了就开** | `docs/07` 第 25 项**保留编号**、结清并写明"本条原是我按印象写错的"；`docs/10` §2 那格改成 ⚠️ **仍是 🟡 而不是 ✅**——按 `10` 自己的规矩，✅ 要求"有人在界面上点过"，而本轮只核了接线、没人实测点过 |
| 2 | `AGENTS.md` §2 与 `docs/10` §4："字数统计……**六项**（字符 / 词 / 行 / 阅读分钟）" | `StatusBar.tsx` 只渲染**四项**：`{words} 词`、`{characters} 字符`、`{lines} 行`、`约 N 分钟` | 两处都改成**四项**（`docs/10` 那格连自己列的清单都只有四项——**清单是对的，数字是错的**，典型的没数就写）。⚠️ **2026-09-30 起这个数又变了**：下栏只剩**一个**数（`N 词`），四个数的详情进悬停 `title`（§2.5）。**"几项"这件事已经问错了**——以后写这一格请写"条上一个数、悬停四项"，别再造一个新的阿拉伯数字 |
| 3 | `docs/10` §7："文档主题（只管正文）⬜ —— 一份文档主题的 CSS 都没有" | ⚠️⚠️ **这一格里的"代码是什么"是编的。** 写的是「`app.css:690/700` 已有 `github` 与 `newsprint`」——**`grep -rn 'github\|newsprint' src/styles/*.css` 返回 0 行**，那两行是 `.home-*` 的规则。原始文档说"一份都没有"**是对的** | 2026-09-23 按事实重写：文档主题系统是**那一批新做的**（装用户主题 + 菜单栏切换），状态 **✅**、§1 计数已重算。⚠️ 这一格的教训写在 `docs/07` §4：**"实际 X 已经有 Y"这种更正，必须附上能复现的搜索命令与输出**——当时手上没有任何搜索结果，行号是编出来的 |
| 4 | `docs/07` BUG-3 与 `plugin/mod.rs` 的注释/错误信息："`.` **与 `_`** 在事件名里都写作 `-`" | `channel_id()` 第 258 行：**`_` 原样保留**（它本来就在 Tauri 事件名的允许集合里），只有 `.` 等不合法字符换 `-`。有用例钉着：`channel_id("a_b-c") == "a_b-c"` | **三处**都改成只提 `.`：`plugin/mod.rs` 的注释与错误信息、`manifest.rs` 的 `channel_id()` 文档注释（第 245–255 行）、`docs/07` BUG-3。同时补上"`nota_git` 与 `nota-git` **不撞**" |

另有一处小疵也已改：`docs/10` §2 的"打开最近的文件"那格原本写"见 §3 第 9 项"，
指的是**本文档自己的** §3（那是"编辑与格式化"），实际要引的是 **`docs/07` §3 第 9 项**。

> ⚠️ **这四处的共同成因是同一条**：它们**全部是"按先入判断填的"**，没有一处是"忘了更新"。
> 两处把"能做"写成"没做"，一处把允许字符集记宽了，
> **还有一处（第 3 格）是"为了纠正前一处，编了一条没查过的更正"**——四种错里最坏的一种。
> 所以 `docs/10` §10 第 3 条那条规矩要**双向**执行：
> 填 ✅ 之前先点一下；**填 ⬜/🟡 之前先 `grep` 一下**。
> 而核对的手段必须看**上下文几行**，不能只看 `grep` 命中的那一行——
> 这一轮已经在这上面出过一次错，详见 `docs/07` §4 的第一条漂移记录。
