# 变更记录

Nota 采用面向发布线的简短记录。完整证据、缺陷编号与历史过程在
[`docs/07-feature-status.md`](docs/07-feature-status.md)。

## 0.5.0-beta

- CDE 界面与文档主题；真实 EBDT 点阵字随包分发（WQY 派生，许可见 `THIRD-PARTY.md` §9）。
- 打印直连 CUPS Unix socket 的 IPP，不再依赖 `lpstat` / `lp`；首选 PDF 的打印机自动走 raw PDF，避开坏 PPD 过滤链。CDE 改用完整 WQY 点阵宋，字体与许可同目录随包。
- 主题资源可由 CSS 自由声明图标、字体和图片；新增 CDE 自绘硬边图标集。
- 改进 AI/Git/Slidev/写作统计插件；应用内打印与 HTML 代码预览。
- Windows 交叉编译与安装包尝试。
- 增加验证 CI、版本门禁、文档同步 CI 模式与发布追溯清单。
