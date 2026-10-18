# 变更记录

Nota 采用面向发布线的简短记录。完整证据、缺陷编号与历史过程在
[`docs/07-feature-status.md`](docs/07-feature-status.md)。

## 0.6.0-beta

- 首个公开发布的完整 Beta 版本，提供 Linux、Windows 与 macOS 全平台安装包。
- 新增中英文 README、产品官网、用户文档与开发者文档。
- 新增独立的官方主题仓库；CDE 风格样式、图标、字体与许可证完全外置。
- 所有模态窗口统一提供右上角关闭按钮。
- 界面文案改为中性、正式表达，移除可见状态 emoji 与口语化措辞。
- 保持安装包不预装拓展和第三方主题。

## 0.5.0-beta

- CDE 界面与文档主题；真实 EBDT 点阵字随包分发（WQY 派生，许可见 `THIRD-PARTY.md` §9）。
- 打印直连 CUPS Unix socket 的 IPP，不再依赖 `lpstat` / `lp`；PDF 仍经过正确的 CUPS 驱动链。CDE 改用完整 WQY EBDT 点阵宋，字体与许可同目录随包。
- Linux 默认恢复 WebKit DMA-BUF/GPU 合成；长代码块语法着色改为 80ms 合并，改善滚动与打字帧率。
- 安装包文档主题缩减为 Adwaita 浅色/深色，其余官方主题转入独立主题仓库策略。
- 主题资源可由 CSS 自由声明图标、字体和图片；新增 CDE 自绘硬边图标集。
- 改进 AI/Git/Slidev/写作统计插件；应用内打印与 HTML 代码预览。
- Windows 交叉编译与安装包尝试。
- 增加验证 CI、版本门禁、文档同步 CI 模式与发布追溯清单。
