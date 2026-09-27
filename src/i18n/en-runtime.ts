/**
 * 英文表的**第三部分**：钩子（`ui/use*.ts`）与运行时报错、状态栏那些消息。
 *
 * ⚠️ 拆分的理由与全部规矩都在 `en.ts` 的文件头。别在这里写 `export const 英文表`。
 */

export const 运行表: Record<string, string> = {

  // ── 钩子（`ui/use*.ts`）与它们弹出来的消息、报错、状态栏提示 ─────────────
  //
  // 2026-09-26 一次补齐（十个 `use*.ts` 里的 85 条）。这一批**大半是消息与
  // 报错**，所以按「消息 / 报错 / 空态加句号」办；以 `{0}` 这类占位符收尾的
  // 那几条不加（句号会被拼进 `{0}` 的**值**后面，接什么尾巴都不确定）。
  //
  // ⚠️ `丢弃并重新加载` / `保存并关闭` / `丢弃并关闭` 是**同一张确认框上的三颗
  // 按钮**，体例必须齐——都是 Title Case。
// ── src/ui/usePlugins.ts ──────────────────────────────────────────────
  "读取拓展状态失败：{0}": "Could not read extension status: {0}",
  "读取编辑区预览状态失败：{0}": "Could not read the in-editor preview status: {0}",
  "收起预览失败：{0}": "Could not close the preview: {0}",
  "拓展 {0} 的「{1}」没跑成：{2}": "Could not run “{1}” from extension {0}: {2}",
  "信任这个签名者？": "Trust This Signer?",
  "指纹：{0}": "Fingerprint: {0}",
  "（未知）": "(unknown)",
  "信任之后，凡是这把钥匙签的包都会当成「已验证」。": "Once trusted, any package signed with this key counts as verified.",

// ── src/ui/useWindowControls.ts（2026-09-27：窗口置顶 ＋ 开发者工具）─────
  // ⚠️ 「窗口置顶」这个**菜单项**的原文在 `en-ui.ts`（那一栏是 `ui/commands.ts`
  // 的表）；这里两条是动作**失败**时的报错，所以是"冒号 + `{0}`"、不加句号。
  "切换窗口置顶失败：{0}": "Could not toggle Always on Top: {0}",
  "打开开发者工具失败：{0}": "Could not open the developer tools: {0}",
  // ⚠️ 与上面两条同一个口径，但**不是同一个动作**：这一条是"再起一份进程"，
  // 它能失败的地方是"可执行文件不见了 / 起不来"（见 `commands/window.rs`）。
  "开不了新窗口：{0}": "Could not open a new window: {0}",

// ── src/ui/useSpellcheck.ts（2026-09-27：把设置接到 WebKitGTK 上）────────
  "拼写检查没有改成你要的样子，引擎那边还停在原处":
    "Spell checking did not end up the way you asked; the engine stayed as it was",
  "拼写检查没能改成功：{0}": "Could not change spell checking: {0}",

// ── src/ui/useFileDrop.ts（2026-09-27：拖进来的东西该干什么）────────────
  "拖进来的东西读不出来：{0}": "Could not tell what was dropped in: {0}",
  "拖进来的「{0}」已经不在了（被移走或删掉了？）":
    "The dropped “{0}” is gone (moved or deleted?)",
  "拖进来的 {0} 个东西已经不在了（第一个是「{1}」）":
    "{0} of the dropped items are gone (starting with “{1}”)",
  "先打开一份文档，图片才知道该插到哪里去":
    "Open a document first so the picture has somewhere to go",
  "把光标点进正文再拖图片进来，图才知道该插在哪里":
    "Click into the text first, then drop the picture — otherwise there is no place to put it",
  "一次只能开一个工作区，只开了「{0}」":
    "Only one workspace can be open at a time; opened “{0}”",
  "一次最多打开 {0} 个文件，这一次还剩 {1} 个没开":
    "At most {0} files are opened at once; {1} were left unopened this time",
  "「{0}」不是文本文件，Nota 不做格式转换，打不开它":
    "“{0}” is not a text file, and Nota does not convert formats, so it cannot open it",
  "在文件管理器里打开「{0}」失败：{1}":
    "Could not open “{0}” in the file manager: {1}",
  "信任是按指纹记的——请对着作者公布的那一份核对，别只看名字。": "Trust is recorded by fingerprint — check it against the one the author publishes, not just the name.",
  "信任了 {0}": "Trusted {0}",
  "拓展包": "Extension Package",
  "装好了：{0}（{1}）": "Installed: {0} ({1})",
  "卸载这个拓展？": "Uninstall This Extension?",
  "「{0}」的拓展目录会被删掉，它带来的面板、菜单项、命令都会消失。": "The extension folder for “{0}” is deleted, along with the panels, menu items and commands it brings.",
  "它自己的设置文件（比如 AI 拓展的 API key）会留着，重装同一个 id 时还在。": "Its own settings file (the AI extension's API key, for example) is kept, and stays if you reinstall the same id.",
  "卸载了 {0}": "Uninstalled {0}",
  "启用了 {0}": "Enabled {0}",
  "停用了 {0}": "Disabled {0}",
  "来路没记过": "origin not recorded",

// ── src/ui/useDocuments.ts（2026-09-27：重命名 / 移动）───────────────────
  //
  // ⚠️ 第一句与宿主 `commands/document.rs::老路径` 那条错误是**同一句话**：
  // 两条路（前端先拦一道、后端再拦一道）得说同一件事，不然用户会以为遇到了
  // 两个不同的毛病。宿主那条**不经过这张表**（它已经是原文），所以这里是
  // "同一句话登记了一次"，不是重复。
  "这份文档还没存过盘，先用「保存为」给它一个位置":
    "This document has not been saved yet — use Save As to give it a location first",
  "已重命名为「{0}」": "Renamed to “{0}”",
  "已移动到「{0}」": "Moved to “{0}”",

// ── src/ui/useAbout.ts ────────────────────────────────────────────────
  "桌面外壳与窗口": "Desktop shell and windows",
  "界面": "Interface",
  "编辑器内核": "Editor core",
  "公式排版": "Math typesetting",
  "流程图": "Diagrams",
  "拓展运行时": "Extension runtime",
  "代码框的语言图标": "Language icons for code blocks",
  "导出（外部的，可选）": "Export (external, optional)",
  "未知": "Unknown",
  "一款所见即所得的 Markdown 编辑器，带 Lua 拓展系统。": "A WYSIWYG Markdown editor with a Luan extension system.",
  "许可证：{0}（随源码分发的 LICENSE）": "License: {0} (the LICENSE file shipped with the source).",
  "致谢：{0}。": "Credits: {0}.",
  "完整清单（含各自许可证）见随源码分发的 THIRD-PARTY.md。": "The complete list, with each license, is in THIRD-PARTY.md, shipped with the source.",
  "好": "OK",

// ── src/ui/useExport.ts ───────────────────────────────────────────────
  "文件已导出，但没能在文件管理器里定位它：{0}": "The file was exported, but could not be revealed in the file manager: {0}",
  "导出 HTML（含样式）": "Export HTML (With Styles)",
  "导出 HTML（不含样式）": "Export HTML (No Styles)",
  "已导出到 {0}": "Exported to {0}",
  "导出失败：{0}": "Could not export: {0}",
  "已用系统默认程序打开，在那边按 Ctrl+P 打印（文件在 {0}）": "Opened in the system default app — press Ctrl+P there to print (the file is at {0})",
  "打印失败：{0}": "Could not print: {0}",
  "已导出到 {0}。{1}": "Exported to {0}. {1}",
  "探测 pandoc 失败：{0}": "Could not probe for pandoc: {0}",
  "不认识的导出格式：{0}": "Unrecognised export format: {0}",
  "打不开浏览器：{0}": "Could not open the browser: {0}",

// ── src/ui/useImageInsert.ts ──────────────────────────────────────────
  "图片已上传到 {0}": "Image uploaded to {0}",
  "上传失败，改成照常插入：{0}": "Upload failed — inserting as usual: {0}",
  "图片已复制到 {0}": "Image copied to {0}",
  "图片已从网络下载到 {0}": "Image downloaded from the web to {0}",
  "图片已存到 {0}": "Image written to {0}",
  "{0} 已经有这张图了，直接引用它（没有重复保存）": "{0} already has this image, so it is referenced directly (nothing was saved twice).",
  "剪贴板里的图片必须先存到磁盘，已按「复制到 ./assets」处理": "An image from the clipboard has to be written to disk first — handled as “Copy to ./assets”.",
  "图片已上传到 {0}，本地那份留在 {1}": "Image uploaded to {0}; the local copy stays at {1}",
  "自动上传失败：{0}（图没有丢，正文里写的是本地地址）": "Automatic upload failed: {0} (the image is not lost — the document holds the local path).",
  "插入图片失败：{0}": "Could not insert the image: {0}",
  "先打开一份文档再粘贴图片": "Open a document before pasting an image.",
  "读剪贴板里的图片失败：{0}": "Could not read the image from the clipboard: {0}",

// ── src/ui/useDocuments.ts ────────────────────────────────────────────
  "保存为": "Save As",
  "已保存到 {0}": "Saved to {0}",
  "打开": "Open",
  "「{0}」还没存盘，关掉这份改动就没了。": "“{0}” has unsaved changes — closing it discards them.",
  "保存并关闭": "Save and Close",
  "丢弃并关闭": "Discard and Close",
  "从磁盘重新加载会丢掉当前的改动。": "Reloading from disk discards the current changes.",
  "丢弃并重新加载": "Discard and Reload",

// ── src/ui/useClipboard.ts ────────────────────────────────────────────
  "先选中一段文字": "Select some text first.",
  "已复制到剪贴板": "Copied to the clipboard.",
  "复制失败：系统没让这次操作写剪贴板": "Could not copy: the system refused to write to the clipboard.",
  "系统不允许从菜单读剪贴板，请按 Ctrl+V 粘贴": "The system does not allow reading the clipboard from the menu — press Ctrl+V to paste.",
  "剪贴板里没有文本": "There is no text in the clipboard.",
  "已复制 Markdown 源码": "Copied the Markdown source.",
  "复制失败：{0}": "Could not copy: {0}",

// ── src/ui/useImmersive.ts ────────────────────────────────────────────
  "切换全屏失败：{0}": "Could not toggle full screen: {0}",
  "鼠标移到窗口最上面可唤回菜单栏": "Move the mouse to the very top of the window to bring the menu bar back",
  "专注 + 全屏：F8 / F11 / Esc 退出，{0}": "Focus + full screen: press F8 / F11 / Esc to exit, {0}",
  "全屏：F11 或 Esc 退出，{0}": "Full screen: press F11 or Esc to exit, {0}",
  "专注模式：F8 或 Esc 退出，{0}": "Focus mode: press F8 or Esc to exit, {0}",

// ── src/ui/useSettingsFile.ts ─────────────────────────────────────────
  "打开设置文件夹失败：{0}": "Could not open the settings folder: {0}",
  "设置已恢复默认": "Settings reset to defaults.",
  "恢复默认失败：{0}": "Could not reset to defaults: {0}",

// ── src/ui/useDocTheme.ts ─────────────────────────────────────────────
  "文档主题已换成「{0}」": "Document theme switched to “{0}”",
  "文档主题已关闭": "Document theme turned off.",
  "打开主题文件夹失败：{0}": "Could not open the themes folder: {0}",

// ── src/ui/useEditorCommands.ts ───────────────────────────────────────
  "当前编辑模式下还没有这个操作": "This action is not available in the current editing mode.",
  "链接地址": "Link URL",
  "https://example.com，或 #本页锚点": "https://example.com, or #anchor-on-this-page",

// ── src/ui/useAppEvents.ts ────────────────────────────────────────────
  // ⚠️ 这一句只在**第二次启动**带来一个非 UTF-8 路径时出现（单实例那条路）。
  // 用 `{0}` 而不是把原因拼进句子：原因本身来自宿主，是完整的一句话。
  "第二次启动 Nota 时带来的路径用不了：{0}": "The path from the second Nota launch is unusable: {0}",
};
