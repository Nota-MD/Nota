# 发布流程

## 1. 版本与 tag

1. 三份版本文件必须一致：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
2. 运行 `bash tools/check-version.sh <tag>`；tag 去掉前缀 `v` 后必须等于源码版本。
3. 建议 tag 与版本同形，例如源码 `0.7.0-beta` → `v0.7.0-beta`。
4. 每个 Release 必须上传根目录的 `update/latest.json`。客户端固定读取
   `releases/latest/download/latest.json`；版本号可以带 `beta`，但 GitHub Release
   必须发布为 latest（不是 prerelease），否则该固定地址不会指向新版本。

## 2. 自动验证

push tag 后，`release.yml` 先调用 `verify.yml`。任一项失败都禁止打包：

- 版本一致
- 前端测试全集
- Rust 测试
- 国际化
- 基于 git diff 的文档同步
- 官方插件仓库自检与兼容契约
- 前端生产构建
- Windows / macOS 平台编译

## 3. 产物与追溯

- Linux 与 Windows 的打包任务全部通过后才生成校验和清单。
- `BUILD-INFO.json` 固定记录版本、tag、commit、workflow run 与 `pluginsBundled=false`。
- `SHA256SUMS.txt` 覆盖本次下载到的全部安装包。
- Release 默认是**草稿 + prerelease**，人工核对后才公开。

## 4. 发布前人工验收

- Windows 版本需明确标注“新增支持、测试范围有限”，欢迎用户通过 Issues 反馈。
- 从每个平台草稿产物实际安装一次。
- 确认安装包不含插件，应用能启动。
- 打开一份文档、编辑、保存、重启并重新打开。
- 检查本版本必测功能；涉及界面的发布必须由负责人亲自操作并留截图/录屏。
- 检查 Release 的已知限制与回滚说明。

## 5. 回滚

Release 说明必须写明上一稳定版本。发现问题时：

1. 将草稿 Release 保持未发布或撤下异常产物；
2. 把 Release 标记为 prerelease，并指向上一稳定版本；
3. 在 `docs/07A-current-status.md` 增加阻塞项与证据；
4. 修复后使用新 tag，不覆盖已发布 tag。
