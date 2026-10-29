# Nota 主题包规范

最后同步：2026-10-27

本规范参考 Typora 自定义主题的核心模型：

- 一个主题有稳定 id；
- 一个主题是一份主 CSS 和它自己的相对资源；
- 文档样式围绕正文根 `#write` 编写；
- 主题完成前必须实际安装、切换、写作和导出检查。

Nota 在此基础上拆成两条**互不越界**的主题轴。

## 1. 两条主题轴

| 轴 | 用户目录 | 作用范围 | 能否修改外壳 | 能否修改正文 |
|---|---|---|---|---|
| 文档主题 | `~/.config/nota/themes/document/` | 编辑区与导出的文档 | 否 | 是 |
| 界面主题 | `~/.config/nota/themes/ui/` | 菜单、侧栏、按钮、标签、状态栏、界面字体 | 是 | 不负责 |

切换界面主题不会改变文档主题，切换文档主题也不会改变界面。

## 2. 包目录

新主题推荐使用自包含目录：

```text
themes/document/
└── focus/
    ├── theme.css
    ├── assets/
    │   ├── background.png
    │   └── illustration.svg
    ├── fonts/
    │   └── editorial.woff2
    └── LICENSE.md
```

界面主题形状相同：

```text
themes/ui/
└── dusk/
    ├── theme.css
    ├── icons/
    └── fonts/
```

主题 id 是目录名：

- ASCII 字母、数字、`-`、`_`；
- 1–64 个字符；
- 不允许路径分隔符、点开头的隐藏目录或空 id。

主 CSS 接受两个固定名字：

1. `theme.css`，推荐；
2. `<id>.css`，兼容 Typora 那种“目录名与 CSS 名相同”的布局。

不再接受根目录里的扁平 `<id>.css`。

## 3. 文档主题

### 3.1 正文根

Nota 编辑区里的正文根等价于 Typora 的 `#write`。主题可以写：

```css
#write {
  max-width: 46em;
  font-family: var(--font-doc);
  line-height: 1.8;
}

#write h1 {
  margin: 1.6em 0 0.65em;
}
```

注入时 Nota 会机械地把 `#write` 映射到：

```css
.editor-pane .ProseMirror
```

因此：

- `body` / `html` / `:root` 会映射到编辑区根；
- 裸 `h1` / `p` / `blockquote` 会被收拢到 `.editor-pane` 之下；
- `@media` 与 `@supports` 内部也会递归收拢；
- `@font-face`、`@keyframes`、`@page` 保留；
- `@import` 和远程资源入口被删除。

文档主题不能修改 `.menubar`、`.sidebar`、`.plugin-dock`、`.statusbar`、
设置窗口或关于窗口。

### 3.2 必须考虑的内容

一份完整文档主题至少检查：

- 正文、标题 H1–H6、粗体、斜体、删除线、高亮、上下标、下划线；
- 有序列表、无序列表、任务列表、引用；
- 行内代码、代码块、代码块工具栏、语言选择器；
- 表格、分隔线、链接、脚注；
- 图片、视频、公式、Mermaid 图表；
- 查找命中、当前查找项、选区和拼写波浪线；
- 打印和自带 HTML/PDF 导出。

完整覆盖不要求每个选择器都重写。未改动的部分应自然继承 Nota 的默认变量；
只有组件结构确实不同时才写覆盖规则。

### 3.3 文档变量

推荐先定义语义变量，再消费它们：

```css
#write {
  --doc-bg: #faf7f0;
  --doc-fg: #25221e;
  --doc-muted: #6a6258;
  --doc-accent: #9a4f2c;
  --doc-border: #d4c8b8;
  --font-doc: "Noto Serif CJK SC", serif;
  --doc-font-size: 17px;
  --doc-line-height: 1.8;
}
```

主题可以定义自己的变量，但不应占用界面主题变量，例如
`--sidebar-width`、`--toolbar-height`、`--font-ui`。

### 3.4 深色文档

单文件主题可以写：

```css
@media (prefers-color-scheme: dark) {
  #write {
    --doc-bg: #1f2226;
    --doc-fg: #ece8e1;
  }
}
```

需要明确配对的主题仍可提供两个 id，例如 `paper` 与 `paper-dark`，
并在 Nota 的深色主题设置中指定后者。

## 4. 界面主题

界面主题覆盖整个应用外壳。每条组件选择器都必须带主题 id：

```css
[data-ui-style="dusk"] {
  --radius-sm: 3px;
  --radius: 4px;
  --control-height: 30px;
}

[data-ui-style="dusk"][data-ui-mode="light"] {
  --bg: #f5f2ec;
  --fg: #25221e;
  --accent: #8d5b3f;
  --accent-fg: #ffffff;
}

[data-ui-style="dusk"][data-ui-mode="dark"] {
  --bg: #24272b;
  --fg: #f0ede7;
  --accent: #d8a37b;
  --accent-fg: #22170f;
}
```

### 4.1 必备约束

- 颜色必须走语义变量；
- 浅色与深色要么都定义，要么明确说明这是单配色主题；
- 控件必须有可见键盘焦点；
- 禁用态、悬停态、按下态、持续开启态必须可区分；
- 主题不能依赖程序为它增加 `if theme = "..."` 分支；
- 主题不能要求关闭无障碍或禁用系统文本输入。

### 4.2 图标

图标逻辑名只由组件决定，主题只声明映射：

```css
[data-ui-style="dusk"] {
  --icon-folio-close-symbolic: url("./icons/close.svg");
  --icon-nota-spellcheck-symbolic: url("./icons/spellcheck.svg");
}
```

图标资源位置不要求叫 `icons/`：

```css
[data-ui-style="dusk"] {
  --icon-folio-document-save-symbolic: url("./shared/actions/save.svg");
}
```

允许在**主题包目录内部**使用 `../` 共享素材，但不能逃出主题包根目录。

### 4.3 编辑器源码标记

编辑器左侧装订线里的块级源码标记也由主题变量提供图形。当前可覆盖项：

```css
[data-ui-style="dusk"] {
  --icon-nota-heading-1-symbolic: url("./icons/heading-1.svg");
  --icon-nota-heading-2-symbolic: url("./icons/heading-2.svg");
  --icon-nota-heading-3-symbolic: url("./icons/heading-3.svg");
  --nota-source-quote-icon: url("./icons/source-quote.svg");
  --nota-source-bullet-icon: url("./icons/source-bullet.svg");
  --nota-source-code-icon: url("./icons/source-code.svg");
}
```

`--icon-nota-heading-*` 给格式工具栏的 H1–H3 按钮；`--nota-source-*` 给
引用、无序列表和代码围栏的左侧标记。图形只取形状，颜色由
`--fg-faint` 或按钮 `currentColor` 提供。程序统一把源码标记放在块正左方并
垂直居中，主题不能要求程序识别自己的 id 来调整位置。

### 4.4 下拉选择框

设置页的下拉选择框是自绘 combobox，不再使用原生 `<select>`。收起状态与
展开列表都由界面主题 CSS 控制：

```css
[data-ui-style="dusk"] {
  --select-bg: var(--bg);
  --select-bg-hover: var(--bg-hover);
  --select-fg: var(--fg);
  --select-border: var(--border);
  --select-popup-bg: var(--bg-raised);
  --select-popup-fg: var(--fg);
  --select-popup-border: var(--border);
  --select-option-hover-bg: var(--bg-hover);
  --select-option-active-bg: var(--bg-active);
  --select-option-selected-bg: var(--accent);
  --select-option-selected-fg: var(--accent-fg);
}
```

需要改变结构尺寸时，可以覆盖以下组件选择器；每条都必须带主题 id：

```css
[data-ui-style="dusk"] .stg-select-trigger {
  border-radius: 0;
}

[data-ui-style="dusk"] .stg-select-popup {
  border-radius: 0;
  padding: 2px;
}

[data-ui-style="dusk"] .stg-select-option {
  min-height: 30px;
  padding-inline: 10px;
}
```

`data-active="true"` 是鼠标或键盘当前停留项；`aria-selected="true"` 是已经
选中的值。弹层 portal 到 `body`，但仍在 `[data-ui-style]` 根节点之下，因此
主题变量和带主题 id 的选择器都能生效。

## 5. 字体

字体使用相对 CSS 的地址：

```css
@font-face {
  font-family: "Theme Serif";
  src: url("./fonts/editorial.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
}
```

要求：

- 随主题分发字体时，在同一包内提供完整许可证；
- 不使用来源不明的字体；
- 不把专有字体当作 `local()` 的必需前提；
- 首选字体缺失时必须有合理回退；
- 字体文件应优先使用 WOFF2；
- 不通过网络加载字体。

## 6. 资源与安全

宿主在注入主题前会把相对 `url()` 内联成 data URI，因为 `asset:` 对
WebKitGTK 的字体 CORS 不可靠。

当前限制：

- 单份主题 CSS 最大 2 MiB；
- 单个内联资源最大 8 MiB；
- 一份 CSS 的内联资源合计最大 24 MiB；
- 符号链接不进入主题发现，也不允许通过 canonical path 逃出主题包；
- 外部 HTTP/HTTPS URL、绝对路径和未知协议原样保留，但不会替主题下载。

主题不能包含脚本、可执行文件或 HTML 注入入口。

## 7. Typora 对照表

| Typora 写法 | Nota 处理 |
|---|---|
| `body` / `#write` | 映射到编辑区正文根 |
| `#write h1` | 映射到正文里的标题 |
| `@font-face` | 支持，资源限制在主题包内 |
| `@media print` | 支持，导出也使用文档主题 |
| `pre.md-fences` | 需要改写为 Nota 的代码块结构选择器 |
| `.md-task-list-item` | 需要改写为 Nota 任务列表结构 |
| `base.user.css` | 不提供全局旁路，主题必须自包含并显式选择 |
| Typora 原生侧栏/菜单主题 | 不属于文档主题；Nota 使用独立界面主题 |

Nota 不承诺直接加载任意 Typora 主题的全部组件规则。兼容的是：

- 主题包布局；
- CSS 和字体资源方式；
- `#write` 文档根；
- 正文排版和打印模型。

## 8. 发布检查表

文档主题：

- 实际打开一份包含全部块类型的文档；
- 检查编辑、源码、分屏三种模式；
- 检查查找高亮、选区和拼写波浪线；
- 导出 HTML 与 PDF；
- 浅色/深色切换后没有不可读文字；
- 字体与图片都能从主题包内解析。

界面主题：

- 检查菜单、子菜单、工具栏、侧栏、插件栏、状态栏、设置和关于窗口；
- 检查鼠标、键盘、禁用、按下和持续开启状态；
- 检查浅色与深色；
- 检查 100%、常见缩放和高 DPI；
- 检查加载失败时能退回内置主题，而不是白屏。

## 9. 与旧规范的关系

- 主题只接受自包含目录包；
- 文档主题仍由 `doc-theme.ts` 强制限域；
- 界面主题仍原样注入，但所有选择器必须带主题 id；
- 主题不得要求修改主程序源码；
- CDE 等完整视觉复刻同样遵守本规范，不在 Rust 二进制里加入主题分支。
