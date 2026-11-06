# Typora 社区主题批量兼容测试（2026-11-01）

## 范围

本轮从 GitHub 下载了 9 个公开主题仓库或正式发布包，共 32 个可导入主题：

| 来源 | 版本/分支 | 主题数 | 随包字体 |
|---|---:|---:|---:|
| Keldos-Li/typora-latex-theme | v0.3.3 release | 2 | 0 |
| liangjingkanji/DrakeTyporaTheme | master | 12 | 4 |
| blinkfox/typora-vue-theme | master | 2 | 28 |
| h16nning/typora-gitbook-theme | main | 3 | 11 |
| adrian-fuertes/typora-notion-theme | main | 6 | 0 |
| guangzhengli/typora-ladder-theme | main | 2 | 2 |
| obscurefreeman/typora_theme_blackout | main | 1 | 0 |
| jinghu-moon/typora-see-yue-theme | main | 3 | 15 |
| SprInec/typora-spring-theme | main | 1 | 0 |

另有此前已测的 Typora 1.14.9 五套内置主题和 LaTeXTypora 三套，不重复计入。

## 导入与运行期加载

32 套主题全部通过原生导入器：

- 源 CSS 和资源原字节复制；
- 根 CSS 识别为独立主题；
- 本地嵌套 `@import` 展开；
- 字体、图片和图标转成 data URI；
- 无残留活动 `@import`（报告中的 `imports=6` 是 SeeYue 注释里的示例文本）；
- 每个主题都能从安装目录重新读出并生成运行期 CSS。

实际运行期 CSS 中：

- Drake：4 个 `@font-face`、6 个内联资源地址；
- Vue：28 个 `@font-face`、28 个内联资源地址；
- GitBook：11 个 `@font-face`、11 个内联资源地址；
- Ladder：2 个约 16 MB 的随包 TTF，均成功内联；
- SeeYue：15 个 `@font-face`、约 750 个内联资源地址。

## 本轮发现并修复

### Ladder 的可选 user override

`ladder.css` 会导入 `ladder.user.css` 和当时尚未创建的
`ladder-light.user.css`。Typora 的浏览器语义会忽略缺失的可选文件，而旧实现会让
整套主题加载失败。现在：

- 文件夹内缺失的本地 `@import` 被忽略；
- 已存在的 `*.user.css` 仍参与覆盖；
- `*.user.css` 不再出现在主题选择列表；
- 普通主题入口和错误路径仍受根目录边界约束。

### 大字体

Ladder 单个 TTF 约 15.9 MB，旧单资源上限为 8 MiB，导致文件被复制但未被 CSS
引用。单资源上限现为 32 MiB，单份 CSS 的内联合计上限为 48 MiB；两枚字体均进入
运行期 CSS。

### 缺失的界面变量

部分 Typora 主题没有 `--bg-color` 或 `--text-color`，而是把颜色直接写在
`body` / `a` 规则里。运行时仍能通过规则回退取得背景、正文和强调色；不影响文档
主题导入。

### 带包装目录 ZIP 的相对路径

GitHub 的仓库 ZIP 通常多一层 `Repository-main/`。转换器把
`Repository-main/./drake/font.css` 当成了不存在的路径，导致颜色变量和字体的
本地 import 丢失。现在会折叠中间所有 `.` 路径段；Drake ZIP 已从 0 个字体恢复为
4 个字体，并由真实浏览器文件输入测试确认。

## 转换器集成

官网主题转换器新增 Typora → Nota UI 管线。它读取：

- `--bg-color`、`--text-color`；
- sidebar、hover、active-file、border；
- `--primary-color`、selection、todo 和主题强调色；
- `--font-ui`、`--font-sans-serif`、`--font-family`；
- 本地 `@import` 与 `@font-face`；
- 基础 CSS 和对应的 `-dark` 伴生文件。

用上述样本生成 10 个 Nota UI ZIP 后，已逐个通过 Nota 后台的 UI 主题包读取、
命名、限域和字体文件解包测试。转换器自身 15 条单元测试通过；真实 Chrome 文件
输入测试成功导入 Drake ZIP，得到 4 个字体、8 个语义色令牌和可切换的深色预览。

## 已知边界

- Typora 专有的 megamenu、侧栏内部 DOM 和编辑器私有结构不会覆盖 Nota 外壳。
- 远程 CDN 字体或图片不下载；运行时只内联主题包里的本地资源。
- 约 62 MB 运行时 CSS 的 SeeYue 可加载，但首次切换会比普通主题慢，内存占用也更高。
