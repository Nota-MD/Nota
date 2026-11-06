# Typora 主题兼容实测：LaTeXTypora 2.1.4

最后同步：2026-11-04

测试主题：

- 项目：`shamsghi/LatexTypora`
- 版本：`v2.1.4`
- 主题入口：`latex.css`
- 字体入口：`latex_fonts/embedded-fonts.css`
- 主题许可证：Apache-2.0

第三方主题只用于本机兼容测试，不进入 Nota 仓库或安装包。

## 测试包

Nota 安装后的主题集合目录：

```text
themes/typora-latextypora-214/
├── latex.css
├── latex-dark.css
├── latex_fonts/
├── .nota-themes.json
└── LICENSE
```

源 CSS 和资源保持原字节，不做合并。`@import` 只在加载主题时展开，字体和图片在
同一阶段内联；`.nota-themes.json` 只登记根 CSS 入口。

## 已映射

| Typora | Nota |
|---|---|
| `#write` | `.editor-pane .ProseMirror` |
| `#write h1` | 正文标题规则 |
| `html` / `body` / `:root` | 编辑区根 |
| `pre.md-fences` | 代码块 `pre` 上的兼容 class |
| `pre.md-fences .CodeMirror-*` | 代码块内 CodeMirror |
| `ul.task-list` | 含任务项的列表 |
| `li.task-list-item` | `li[data-item-type="task"]` |
| `li.task-list-item.task-list-done` | `li[data-checked="true"]` |
| `.md-math-block` / `.mathjax-block` | `.nota-math-block` |
| `.md-inline-math` | `.nota-math-inline` |
| `.md-diagram-panel` | `.nota-diagram` |
| `thead` / `thead > tr` | `tr[data-is-header]` |
| `.md-table-wrap` | ProseMirror `.tableWrapper` |
| `li.md-task-list-item` | `li[data-item-type="task"]` |
| `.md-alert` 及其后缀 | `.nota-github-alert` 及对应后缀 |
| `.md-htmlblock` | `.nota-html-block` |
| `.md-rawblock-container` | `.nota-html-render` |
| `#write.first-line-indent` | `#write` 的行为别名；结构仍落到 Nota 正文根 |
| `figure:has(> table)` / `figure > table` | ProseMirror `.tableWrapper` |
| Typora `--bg-color` / `--text-color` | Nota `--doc-bg` / `--doc-fg` / `--fg` |
| Typora `--code-bg-color` / `--syntax-*-color` | Nota `--bg-subtle` / `--code-*` |
| Typora `--font-family` / `--monospace` | Nota `--font-doc` / `--font-mono` |
| Typora CodeMirror `.cm-*` | Nota Prism `.token.*` |
| `@font-face` | 支持；相对字体和图片在加载时内联，WOFF2 优先 |
| `@import` | 支持本地相对 import，运行时递归展开；缺失的可选 import 按浏览器语义忽略 |
| `*.user.css` | 作为 Typora 的用户旁路覆盖保留，不列为独立主题 |
| `@media print` | 支持，导出也沿用文档主题 |

## 2026-11-01 排印与字体对照

用同一份包含标题、粗体、斜体、代码块、引用、列表、表格、行内公式与块公式的
文档，分别加载 Typora 当前安装的 `latex.css` 和 Nota 内置
`src/styles/themes/latex.css`。Nota 侧吸收的是可验证的排印尺度，不是复制
Typora 的应用外壳或整份 CSS：

- 正文版心从铺满编辑区改为 `32em` 居中；
- h1 从 1.7em/700 改为 1.55em/400，h2–h6 保留粗体；
- 段落使用 1.55em 首行缩进与两端对齐；
- quote 去掉灰色背景和左边线，只保留左右 2.5em 缩进；
- 表格改为自然宽度居中，只保留 booktabs 的顶部、表头、底部横线；
- 代码块使用暖白底、2px 小圆角和 CM Unicode 原版 `cmuntt.ttf`
  （`CMU Typewriter Text`），行内代码同步改暖白底；
- 链接改用 `hyperref` 风格的群青蓝。

开窗检查时，标题层级、正文宽度、引用、列表、代码块、表格、行内公式和块公式
均正常；Nota 外壳未受影响。直接导入 LaTeXTypora 时，主题携带的 New Computer
Modern 正文字体会被加载，正文使用衬线体而不是系统无衬线回退。

## 实测结果

在隔离配置、Nota `0.8.1-beta` 开发构建中打开一份包含标题、段落、粗体、斜体、
行内代码、链接、引用、列表、围栏代码、表格与块公式的文档：

- 主题成功发现并被选中；
- 正文纸张、标题层级、引用缩进、列表和表格规则生效；
- 主题字体面被识别，正文显示为 LaTeX 风格衬线；
- 代码块规则在结构 class 映射后生效；
- 公式保持可编辑，并继承主题正文排版；
- 外壳、菜单和侧栏没有被文档主题污染。

## 2026-11-02 颜色与字号修复

上一版只映射了选择器，没有映射 Typora 的变量名。深色界面下，主题自己的白色
`--bg-color` 无法成为 Mermaid 判断纸面明暗的 `--doc-bg`，代码块语法色也会继承
Nota 界面主题的深色配色；导入主题的 `html { font-size: 11pt }` 还会压过
「外观 → 自定义字号」。

现在运行期在文档作用域内增加一层变量桥：

- 纸面与文字：`--bg-color` / `--text-color` → `--doc-bg` / `--doc-fg`；
- 代码表面：`--code-bg-color` → `--bg-subtle`；
- 语法色：`--syntax-*-color` → `--code-*`；
- 字体：`--font-family` / `--monospace` → `--font-doc` / `--font-mono`；
- `.cm-*` token 选择器映射到 Nota 的 `.token.*`；
- 自定义编辑区字号显式接管 `.editor-pane` 的基准字号，自动档仍让主题决定。

桥接规则只在源 CSS 确实声明 Typora 变量时生成，并仍限定在 `.editor-pane` 内，
不会影响应用外壳或 Nota 内置主题。

## 已知差异

- Typora 的源码模式、侧栏、megamenu、quick-open 属于 Typora 应用外壳；Nota
  文档主题不会接收这些规则，对应外观由界面主题负责。
- Typora 的 `#write.first-line-indent` 是应用写入的辅助 class；Nota 没有该状态，
  与首行缩进相关的条件规则不会自动触发。
- Typora 内部 NodeView 的 `.md-htmlblock`、`.md-rawblock-*`、`.typora-export`
  等私有结构没有完全同名实现。对应规则会被限域保留，但不保证命中。
- Typora 主题的 Mermaid 专用 DOM 与 Nota 的 Mermaid 容器不同；图表颜色应按
  映射后的 `.nota-diagram` 结构补充规则。
- Typora 独有的编辑器 DOM 和外壳控件仍只能命中已映射的语义结构。

## 结论

这个主题可以直接作为 Nota 文档主题包运行，主要排版与随包字体效果可用。兼容目标是
**Typora 的文档根、正文语义和资源模型**，不是 Typora 整个应用私有 DOM。

## 2026-11-04 结构兼容补强

参考 Textus 的低改写策略，新增的兼容规则仍只做稳定结构名映射，不按主题名写分支：

- GFM 表头行在 `<tbody>` 内，使用 `data-is-header`；导入主题中的 `thead` 在限域前
  改写为该属性，修复 booktabs 等表头规则不命中的问题；
- `.md-inline-math`、`.md-table-wrap`、`.md-task-list-item`、`.md-alert*`、
  `.md-htmlblock` 与 `.md-rawblock-container` 映射到 Nota 现有的公式、表格包装、
  任务列表、GitHub Alert 和 HTML 块结构；
- Typora HTML 导出中的 `#write.first-line-indent`、`figure` 表格包装与
  `md-fences-with-lineno` / `md-fences-adv-panel` 结构也已纳入兼容；
- Typora 主题中的正文块对齐会追加 `text-align: start` 兜底：一级等主题指定的
  标题继续居中，段落、列表项、引用和表格单元格不会被误居中；
- `.ProseMirror` 作为 flex 子项显式 `width: 100%`。否则 Typora 主题常见的
  `#write { margin: 0 auto; max-width: … }` 会让正文根按内容收缩，空文档的
  光标落到窗口中央；现在主题仍可居中内容列，但段落从列左边开始；
- Typora 的 `.md-diagram-panel` 常把整块内容设成居中。Nota 保留渲染预览的
  居中，但代码、LaTeX、Mermaid、HTML 的 `.nota-source-surface` 源码面统一
  强制左对齐；
- 这些映射先执行，再由 `doc-theme.ts` 统一收进 `.editor-pane`，因此不会把 Typora
  的应用外壳规则泄漏到 Nota UI。
