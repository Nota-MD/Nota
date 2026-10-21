# Typora 主题兼容实测：LaTeXTypora 2.1.4

最后同步：2026-10-21

测试主题：

- 项目：`shamsghi/LatexTypora`
- 版本：`v2.1.4`
- 主题入口：`latex.css`
- 字体入口：`latex_fonts/embedded-fonts.css`
- 主题许可证：Apache-2.0

第三方主题只用于本机兼容测试，不进入 Nota 仓库或安装包。

## 测试包

Nota 主题目录：

```text
themes/latextypora/
├── theme.css
├── latex_fonts/
└── LICENSE
```

`theme.css` 是以下两份内容合并后的测试副本：

```text
latex_fonts/embedded-fonts.css
latex.css（去掉 @import）
```

宿主仍不支持展开 `@import`；需要多文件源主题时，应由主题构建脚本先合并。

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
| `.md-diagram-panel` | `.nota-diagram` |
| `@font-face` | 支持，资源必须留在主题包内 |
| `@media print` | 支持，导出也沿用文档主题 |

## 实测结果

在隔离配置、Nota `0.8.1-beta` 开发构建中打开一份包含标题、段落、粗体、斜体、
行内代码、链接、引用、列表、围栏代码、表格与块公式的文档：

- 主题成功发现并被选中；
- 正文纸张、标题层级、引用缩进、列表和表格规则生效；
- 主题字体面被识别，正文显示为 LaTeX 风格衬线；
- 代码块规则在结构 class 映射后生效；
- 公式保持可编辑，并继承主题正文排版；
- 外壳、菜单和侧栏没有被文档主题污染。

## 已知差异

- Typora 的源码模式、侧栏、megamenu、quick-open 属于 Typora 应用外壳；Nota
  文档主题不会接收这些规则，对应外观由界面主题负责。
- Typora 的 `#write.first-line-indent` 是应用写入的辅助 class；Nota 没有该状态，
  与首行缩进相关的条件规则不会自动触发。
- Typora 内部 NodeView 的 `.md-htmlblock`、`.md-rawblock-*`、`.typora-export`
  等私有结构没有完全同名实现。对应规则会被限域保留，但不保证命中。
- Typora 主题的 Mermaid 专用 DOM 与 Nota 的 Mermaid 容器不同；图表颜色应按
  映射后的 `.nota-diagram` 结构补充规则。
- `@import` 不展开。主题包应直接提供合并后的 `theme.css`。

## 结论

这个主题可以作为 Nota 文档主题包运行，主要排版与字体效果可用。兼容目标是
**Typora 的文档根、正文语义和资源模型**，不是 Typora 整个应用私有 DOM。
