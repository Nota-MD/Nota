# 07A · 当前状态与执行队列

> 最后同步：2026-10-18

这里只回答“现在是什么状态、下一步做什么”。永久编号、缺陷复盘和日期历史在
[`07-feature-status.md`](07-feature-status.md)，后者是审计档案。

## 当前发布事实

| 项 | 当前值 |
|---|---|
| 源码版本 | `0.8.0-beta`（三份版本文件一致） |
| 插件策略 | **安装包不随附插件**；四个官方插件从独立仓库发布 |
| 文档主题策略 | **安装包只随附 Adwaita 浅色/深色**；其他官方主题预留独立主题仓库 |
| 界面风格策略 | **主程序内置 `auto` ＋ 七档通用风格**；CDE、Motif 等完整皮肤以自包含外置主题包维护，不进入二进制 |
| 对话框规范 | 所有 `role="dialog"` / `role="alertdialog"` 都显示统一的右上角关闭按钮 |
| Markdown 兼容 | GitHub Flavored Markdown、脚注、GitHub Alerts、徽章图片、公式与 Mermaid；HTTP/HTTPS 远程图片可直接加载 |
| CI | push / PR 先验证；tag 打包依赖验证通过，Release 为草稿 |
| 发布追溯 | `BUILD-INFO.json` 记录 tag / commit / run，`SHA256SUMS.txt` 覆盖产物 |
| 应用更新 | 🧪 实验功能；`latest.json` 随每个 Release 发布；按安装类型分流 deb / rpm / AppImage / 便携 EXE / 安装器 EXE；开发构建只提示重建命令 |
| 插件更新 | ✅ 插件 `[update] manifest` → 多插件 `latest.json` → SHA-256 → 原包验签 → 原子替换并重载 |
| 下载替换 | ✅ 调试模式 → 高级设置；`原前缀 => 新前缀`，应用更新与插件更新共用 |
| 设置结构 | ✅ 拓展管理、插件设置独立分页；调试模式由版本号五连点开启，开启后才显示高级设置 |
| 文档同步 | CI 用 git diff；mtime 只在本地模式用于提醒 |

最近一次本地验证（2026-10-18）：前端 **72 份 / 1620 条**、Rust **660 / 0**、
插件仓库 **0 FAIL / 2 行数 WARN**、Windows 目标 cargo check **0 警告**、
TypeScript、生产构建、deb/rpm/AppImage 与 Windows NSIS/便携 ZIP 打包通过。
GitHub 官方验证的近期失败日志均为 runner 收到 shutdown signal，发生在 Rust 测试阶段，
不是编译或断言失败；本地同一提交完整通过。
依赖审计：`source-map-js` 的高危 DoS 已用 override 固定到 **1.2.2**；余下
**6 条 low** 来自 KaTeX/Mermaid/remark-math，当前上游没有无破坏升级路径，继续跟踪。

## 执行队列

| ID | 类别 | 状态 | 优先级 | 目标版本 | 依赖 | 验收 |
|---|---|---|---|---|---|---|
| BUG-31 | 稳定性 | 未定位 | P1 | 0.5.x | 复现无头实例整套窗口消失 | 长时间压力运行无 `malloc` 崩溃 |
| BUG-56 | 编辑行为 | 未修/待确认 | P1 | 0.5.x | 确认用户当时所指现象 | 真窗口复现、修复、开窗回归 |
| BUG-68 | 代码块外观 | 未关闭 | P2 | 0.5.x | BUG-70/71 后的事实已澄清 | 用户复验“框”是否仍存在 |
| BUG-72 | 稳定性 | 未复现 | P2 | 0.5.x | 切主题后立即切源码 | 连续切换无错误边界 |
| 110 | Windows | 部分完成 | P1 | 0.5.x | Windows 真机验收 | 安装、单实例、MCP、插件安装逐项通过 |
| 118 | 侧栏视觉 | 部分完成 | P3 | 0.6 | 用户目检 | 树/大纲与 CDE 主题一致 |
| 122 | Windows 清单 | 部分完成 | P1 | 0.5.x | 文件编码与剩余清单 | 每条有通过/不做结论 |
| 123 | 插件自更新 | 已实现 | P1 | 0.7 | 插件仓库 `latest.json` | 下载→SHA-256→验签→签名者连续性→原子替换→重载 |
| 124 | 应用更新 | 实验实现 | P1 | 0.7 | GitHub Release 资产与安装类型检测 | 0.7 → 0.8 各包类型实测覆盖安装 |

## 发布前硬条件

1. `tools/check-version.sh <tag>` 通过。
2. 验证工作流的前端全集、Rust、国际化、文档同步、插件仓库检查和生产构建全绿。
3. 安装包不含插件；策略若变化，同批改 README、`docs/11` 和插件仓库说明。
4. tag 只创建草稿 Release；人工核对产物、构建来源和校验和后再公开。

## 单一事实源

- 功能矩阵计数：`docs/10-feature-matrix.md` §1。
- 永久 BUG/backlog 编号：`docs/07-feature-status.md`。
- 版本：三份版本文件 + `tools/check-version.sh`。
- 插件兼容：插件清单 `api = 2` + 宿主清单校验。
- 发布来源：CI 的 `BUILD-INFO.json`。
