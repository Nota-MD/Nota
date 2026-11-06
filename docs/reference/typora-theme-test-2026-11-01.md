# Typora 主题直接导入测试（2026-11-01）

## 结论

支持直接导入以下三种来源：

- Typora 平铺主题文件夹；
- 单个 Typora CSS 文件；
- 根目录或单层包装目录带平铺 CSS 的 ZIP。

主题 CSS、`@import`、字体和图片在安装目录中保持原字节。Nota 只增加
`.nota-themes.json` 记录每套主题的入口；`@import` 展开和资源内联只在加载时发生。

## Typora 1.14.9 自带主题

| 主题 | 导入 | 加载 | 开窗切换 | CSS 哈希 |
|---|---|---|---|---|
| github | ✅ | ✅ | ✅ | 与源文件一致 |
| newsprint | ✅ | ✅ | ✅ | 与源文件一致 |
| night | ✅ | ✅ | ✅ | 与源文件一致 |
| pixyll | ✅ | ✅ | ✅ | 与源文件一致 |
| whitey | ✅ | ✅ | ✅ | 与源文件一致 |

首轮 `night` 正文颜色被 Nota 默认正文颜色压暗。将 Typora 的 `html` / `body` /
`#write` 和无前缀选择器映射到 `.editor-pane .editor-mount .ProseMirror` 后，
正文对比度与深色代码块恢复。

## LaTeXTypora 2.1.4

| 主题 | 导入 | 加载 | 开窗切换 | CSS 哈希 |
|---|---|---|---|---|
| latex | ✅ | ✅ | ✅ | 与源文件一致 |
| latex-dark | ✅ | ✅ | ✅ | 与源文件一致 |
| latex-dev-dark | ✅ | ✅ | ✅ | 与源文件一致 |

这套主题额外覆盖了嵌套 `@import`：

```text
latex-dark.css
  -> latex.css
    -> latex_fonts/embedded-fonts.css
```

磁盘上的 import 语句未被改写。加载时优先保留 WOFF2 data URI，避免同时内联体积更大的
OTF 回退文件。

字体加载在 WebKitGTK 内单独核对：

- `New Computer Modern`：loaded
- `New Computer Modern Sans`：loaded
- `New Computer Modern Mono`：loaded
- `pixyll` 的 `Merriweather`：loaded
- `github` 的 `Open Sans`：loaded
- `newsprint` 的 `PT Serif`：loaded

正文实际 `font-family` 也分别落到这些主题声明的首选字体，不是系统兜底字体。
切换主题后前端会主动调用 `document.fonts.load()` 加载 CSS 中声明的全部
`@font-face` 家族，而不是等正文首次排版惰性触发；LaTeX 主题切换后约 13ms
即可观察到上述字体全部进入 `loaded`。

## 截图

截图位于
[typora-themes](../../artifacts/showcase-2026-11-01/typora-themes)：

- `github.png`
- `newsprint.png`
- `night.png`
- `pixyll.png`
- `whitey.png`
- `latex.png`
- `latex-dark.png`
- `latex-dev-dark.png`

## 已知边界

主题只控制正文。Typora 自身的文件树、megamenu、快速打开等外壳控件不会覆盖 Nota 外壳。
依赖 Typora 独有编辑器 DOM 的第三方控件样式也可能保留 Nota 自己的控件外观；排版、颜色、
字体、标题、引用、列表、表格、公式和代码区域的兼容路径已经接通。
