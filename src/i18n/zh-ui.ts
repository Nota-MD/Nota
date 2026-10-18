/**
 * 中文（简体）文案表的**第一部分**：界面骨架（菜单栏、插件栏、编辑区预览、编辑器那一层、界面上那些小件）。
 *
 * ⚠️ **键是英文原文**（2026-09-28 起）。规矩、语体、拆分理由全在
 * `src/i18n/index.ts` 的文件头——加条目之前先读那一段。这里只说三件事：
 *
 * 1. **查不到就用原文**，所以这份表里只放**中文与英文写法不一样**的那些；
 *    `Markdown` / `PDF…` / `0%` 这种两边一样的键**不要**往这里抄一遍；
 * 2. **改了代码里那句英文原文 = 改了一个键**，这里的对应条目会静默失效
 *    （表现是那句退回英文，不报错）。`bash tools/i18n-check.sh` 会把废键揪出来；
 * 3. ⚠️ 这个文件**不导出 `中文表`**：`zh.ts` 把三份拼起来再导出那一个名字
 *    （`i18n/index.ts` 只认它）。别在这里写 `export const 中文表`——
 *    `tools/i18n-check.sh` 按这个标记切表体，多一个就会把条数错。
 */

export const 界面表: Record<string, string> = {
  "File": "文件",
  "Edit": "编辑",
  "Paragraph": "段落",
  "Format": "格式",
  "View": "视图",
  "Theme": "主题",
  "Help": "帮助",
  "New": "新建",
  "New Window": "新建窗口",
  "Open…": "打开…",
  "Open Folder…": "打开文件夹…",
  "Quick Open…": "快速打开…",
  "Open Recent File": "打开最近文件",
  "Clear Recent Files": "清除最近记录",
  "Reload from Disk": "从磁盘重新加载",
  "Save": "保存",
  "Save As…": "另存为…",
  "Save All Open Files…": "保存全部打开的文件…",
  "Rename…": "重命名…",
  "Move to…": "移动…",
  "Move to Folder…": "移动到…",
  "Open File Location…": "打开文件位置…",
  "Reveal in Sidebar": "在侧边栏中显示",
  "Delete…": "删除…",
  "Import": "导入",
  "Export": "导出",
  "Print…": "打印…",
  "Settings…": "偏好设置…",
  "Close": "关闭",
  "EPUB…": "Epub…",
  "OpenDocument (.odt)…": "OpenOffice (.odt)…",
  "HTML (No Styles)…": "HTML（不含样式）…",
  "HTML (With Styles)…": "HTML（含样式）…",
  "Image…": "图片…",
  "Other Formats…": "其他格式…",
  "Undo": "撤销",
  "Redo": "重做",
  "Cut": "剪切",
  "Copy": "复制",
  "Copy Image": "拷贝图片",
  "Paste": "粘贴",
  "Copy As": "复制为",
  "Plain Text": "纯文本",
  "HTML Source": "HTML 代码",
  "Paste as Plain Text": "粘贴为纯文本",
  "Select": "选择",
  // ⚠️ 这四条**故意不自称"行/词/句"那种短词**：翻译表是**按英文原文当键**的
  // （同名就是同一格），而 `"Word"` 已经被查找条占了（那是「全词」，第 327 行
  // 那个），撞上去两边一起变味。所以这里用「当前」把话说全（`Select Line` →
  // 选择当前行），顺便也把"选的是光标所在那一个"写进标签里——短词（`Line`）
  // 在菜单里也说不清是"选这一行"还是"跳到这一行"。
  "Select Line": "选择当前行",
  "Select Word": "选择当前词",
  "Select Sentence": "选择当前句",
  "Delete Word": "删除当前词",
  "Move Line Up": "上移该行",
  "Move Line Down": "下移该行",
  "Find and Replace…": "查找和替换…",
  "Heading 1": "一级标题",
  "Heading 2": "二级标题",
  "Heading 3": "三级标题",
  "Heading 4": "四级标题",
  "Heading 5": "五级标题",
  "Heading 6": "六级标题",
  "Body text": "正文段落",
  "Table": "表格",
  "Insert Table (3 × 3)": "插入表格（3 × 3）",
  "Add Row Above": "上方插入行",
  "Add Row Below": "下方插入行",
  "Add Column Before": "左侧插入列",
  "Add Column After": "右侧插入列",
  "Delete Row": "删除行",
  "Delete Column": "删除列",
  "Delete Table": "删除表格",
  "Align Left": "左对齐",
  "Align Center": "居中对齐",
  "Align Right": "右对齐",
  "Math Block": "公式块",
  "Code Block": "代码块",
  "Blockquote": "引用",
  "Ordered List": "有序列表",
  "Bullet List": "无序列表",
  "Task List": "任务列表",
  "Horizontal Line": "水平分割线",
  "Table of Contents": "内容目录",
  "Footnote": "脚注",
  "Divider": "分割线",
  "Bold": "加粗",
  "Italic": "斜体",
  "Underline": "下划线",
  "Code": "代码",
  "Strikethrough": "删除线",
  "Comment": "注释",
  "Link": "超链接",
  "Link Text": "链接文字",
  // 「链接」那个框（第 96 ＋ 102 项）：两个字段的名字，以及那颗第三条路。
  // ⚠️ 地址那一格的标签复用 `zh-runtime.ts` 的 `"Link URL"`（「链接地址」），
  // 不在这里再写一条同义的新键——同一个东西两个键，将来只改一处就漂了。
  "Link display name": "链接显示名称",
  "Shown in the document": "显示在正文里的文字",
  "Remove Link": "去掉链接",
  "Image": "图像",
  "Clear Formatting": "清除样式",
  "Toggle Sidebar": "显示/隐藏侧边栏",
  "Switch between source mode and WYSIWYG": "切换代码/所见即所得模式",
  "Outline": "大纲",
  "File Tree": "文件树",
  // ⚠️ 这里原来还有 `"Document List": "文档列表"`：2026-09-28 侧栏第三页
  //（文档列表）与菜单里那一条一起删了，键随之删除（留着就是废键，
  // `tools/i18n-check.sh` ③ 会 FAIL）。
  "Search": "搜索",
  "Extension Dock": "拓展栏",
  "Formatting Toolbar": "格式化工具栏",
  "Always Show": "始终显示",
  "Show on Hover": "鼠标悬停时显示",
  "Never Show": "始终不显示",
  "WYSIWYG": "所见即所得",
  // ⚠️ 这里原来还有 `"Source": "源码"` 与 `"Split": "分屏"` 两行——那是
  // `view-modes.ts` 里**短名那一列**的中文。2026-09-30 状态栏改成一颗 `</>`
  // 图标之后短名没有读者了，那一列随之删掉，这两条中文也就成了废键
  //（`tools/i18n-check.sh` ③ 会 FAIL）。下面这两条是**长名**，2026-10-07 之前
  // 设置里那个下拉用的就是它们——那个下拉删了之后，读者只剩「视图」菜单
  //（`ui/commands.ts` 那三条的字面量）。
  "Source Mode": "源码模式",
  "Split Preview": "分屏预览",
  "Read-Only Mode": "只读模式",
  "Focus Mode": "专注模式",
  "Typewriter Mode": "打字机模式",
  "Status Bar": "状态栏",
  "Menu Bar": "菜单栏",
  // 右键菜单那一层的可读名字（`ui/ContextMenu.tsx` 的 `aria-label`，2026-10-04）。
  // ⚠️ 读屏念的是"右键菜单"，不是"上下文菜单"——界面上的说法以用户点的那一下
  // 为准（同一个词，两个译法，用户得先翻译一遍才知道说的是哪儿）。
  "Context Menu": "右键菜单",
  "Show menu bar": "显示菜单栏",
  // ⚠️ 2026-10-04：「显示菜单栏」那条 `description` 的中文（"顶上那一条…总入口…"）
  // 跟着那一批「全删」一起删了——代码里那条 `description` 去掉了，这条中文就
  // 成了废键。⚠️ 底下这条**不是**废弃的：它是**藏起菜单栏之后弹的那句提示**，
  // 属于运行期消息，留着。
  "Menu bar hidden. Press Alt+M or open Settings ▸ Appearance ▸ Show menu bar to bring it back.":
    "菜单栏已隐藏。按 Alt+M，或到「设置 → 外观 → 显示菜单栏」开回来。",
  "Zoom In": "放大",
  "Zoom Out": "缩小",
  "Reset Zoom": "实际大小",
  "Full Screen": "全屏",
  "Always on Top": "窗口置顶",
  "Developer Tools": "开发者工具",
  "No Theme (Built-in)": "无主题（内置）",
  "Open Themes Folder…": "打开主题文件夹…",
  "{0} (customized)": "{0}（已自定义）",
  "About Nota": "关于 Nota",
  "Website": "网站",
  "Report an Issue": "报告问题",
  "Troubleshooting": "故障排除",
  "Permissions": "权限列表",
  "Credits": "鸣谢",
  "Legal": "法律信息",
  "Back": "返回",
  // ⚠️ 这两条（`Nota contributors` 与那句版权）2026-10-10 **删掉了**：作者名成了
  // **`Leo Lee`**（用户点名），而人名不是文案——`AboutDialog.tsx` 里现在直接写字面量。
  // 留着它们会被 `tools/i18n-check.sh` ③ 报成废键。
  // ── 「故障排除」那两张表（2026-10-04）────────────────────────────────────
  // ⚠️ 左列里 `rustc` / `cargo` / `node` / `npm` / `tauri` / `webkit2gtk` /
  // `gtk` / `mlua` 八个**故意不翻**（程序名与包名，翻了找不到），所以这里没有它们。
  "Build information": "编译信息",
  "This machine": "本机信息",
  "Package version": "包版本",
  "Build time": "编译时间",
  "Build host": "编译主机",
  "Build platform": "编译平台",
  "Target triple": "目标三元组",
  "Build profile": "构建档案",
  "Operating system": "操作系统",
  "Kernel": "内核",
  "Architecture": "架构",
  "GTK version": "GTK 版本",
  "WebKitGTK version": "WebKitGTK 版本",
  "Loading…": "正在读取…",
  "Could not read the information.": "没读到这些信息。",
  // ── 「权限列表」那张表的两列 ─────────────────────────────────────────────
  "Permission": "权限说明",
  "Notes": "备注",
  // ── 「法律信息」──────────────────────────────────────────────────────────
  "{0} License": "{0} 许可证",
  "Extensions": "拓展",
  "Extension panels": "拓展面板",
  "Installed extensions": "已装拓展",
  "Installed extensions (look here when something is wrong)": "已装拓展清单（出问题时看这里）",
  "Hide the extension dock": "收起拓展栏",
  "Provided by extension {0}": "由拓展 {0} 提供",
  "Install from an extension package (.nota-plugin)": "从一个拓展包（.nota-plugin）安装",
  "Installing…": "正在安装…",
  "Install from file…": "从文件安装…",
  "Enable": "启用",
  "Disable": "停用",
  "Uninstall": "卸载",
  "Trust": "信任",
  "Trust {0}": "信任 {0}",
  "this signer": "这个签名者",
  "No extensions installed. Use “Install from file…” above.": "尚未安装拓展。请使用上方的“从文件安装…”选项。",
  "No extensions are installed. Use “Install from file…” to install one. An extension package includes plugin.toml and its entry file, and is available immediately after installation.": "尚未安装拓展。请使用“从文件安装…”安装。拓展包包含 plugin.toml 和入口文件，安装后即可使用。",
  "user": "自装",
  "builtin": "内置",
  "verified": "已验证",
  "unknown signer": "未知签名者",
  "unsigned": "未签名",
  "In-editor panels": "编辑区面板",
  "These panels are laid over the editing area; the extension opens one when it needs to (e.g. “View in editor” after the AI proposes a change).": "这些面板摊在正文那一块，由拓展在需要时打开（比如 AI 提了改动之后的「在编辑区看」）。",
  "editing area": "编辑区",
  "Nowhere to land": "没有落脚处",
  "These panels declare a location that does not exist yet, so they are not shown anywhere.": "这些面板声明的位置目前还没有对应的地方，所以哪儿都没显示。",
  "Trusted signers": "已信任的签名者",
  "Packages signed by these fingerprints count as verified. Edit ": "这些指纹签的包都当成「已验证」。核对不上的要去改",
  " to fix a mismatch.": "。",
  "Read the document": "读当前文档",
  "Edit the document": "改当前文档",
  "Read workspace files": "读工作区文件",
  "Write workspace files": "写工作区文件",
  "Run git": "调 git",
  "Start a dev server": "起开发服务器",
  "Make network requests": "发网络请求",
  "Show notifications": "弹通知",
  "Open the browser": "打开浏览器",
  "Add sidebar panels": "加侧栏面板",
  "Add menu entries": "加菜单条目",
  "Read and write its own settings": "读写自己的设置",
  "right dock": "右栏",
  "English": "英语",
  "Chinese (Simplified)": "中文（简体）",
  "The extension has nothing to show.": "拓展没有给出内容。",
  "This extension does not support your language": "此拓展不支持您的语言",
  "Back to the document": "回到正文",
  "Close the preview and go back to the document (this does not apply the changes)": "收起预览，回到正文（改动不会因此被应用）",
  "Diff": "改动对比",
  "Result": "改后效果",
  "Esc to close": "Esc 收起",
  "Close preview": "收起预览",
  "Close the preview (this does not apply the changes)": "收起预览，改动不会因此被应用",
  "Unrecognised content block (kind={0})": "不认识这种内容块（kind={0}）",
  "This extension may target a newer Nota, or `kind` is misspelled.": "这一块的拓展版本可能比 Nota 新，或者 `kind` 拼错了。",
  "(no kind)": "（没写 kind）",
  "Enter a value": "请输入",
  "Submit": "提交",
  "This button has no `command`, so clicking it does nothing": "这个按钮没有写 `command`，点了也没事发生",
  "This input box has no `submit` / `arg`, so clicking it does nothing": "这个输入框没有写 `submit` / `arg`，点了也没事发生",
  "A curve with {0} points": "曲线，共 {0} 个点",
  "A curve with {0} points, vertical axis {1} to {2}": "曲线，共 {0} 个点，纵轴 {1} 到 {2}",
  "Share image preview: {0} {1}": "分享图预览：{0} {1}",
  "Save share image": "保存分享图",
  "Save as image": "保存为图片",
  "Copy to clipboard": "复制到剪贴板",
  "Could not save: {0}": "保存失败：{0}",
  "Could not save a setting for extension {0}: {1}": "没能存下拓展 {0} 的设置：{1}",
  // 两条"为什么它是源码模式"的提示（`ui/useFileKindMode.ts`，2026-09-28）。
  // ⚠️ 文案里那两个是**弯引号**（`“ ”`），与代码里的键一个字都不能差——
  // 差一个字符这条中文就废了（闸门第 ② 条会报出来）。
  "“{0}” is not a Markdown file, so it opened in Source mode.": "「{0}」不是 Markdown 文件，已按源码模式打开。",
  "“{0}” is very large ({1} characters), so it opened in Source mode to keep typing responsive.": "「{0}」太大了（{1} 个字符），已按源码模式打开，免得打字卡顿。",
  "This environment cannot put images on the clipboard": "这个环境不支持把图片放进剪贴板",
  "Could not write to the clipboard ({0}). Try “Save as image” instead.": "没能写进剪贴板（{0}）。可以改按「保存为图片」。",
  "Extension preview": "拓展预览",
  "The preview URL is not acceptable, so it cannot be embedded.": "预览的地址不对，嵌不进来。",
  "The preview is not running. Press “Stop”, then “Preview” again.": "预览没有在跑。「停止」之后再点一次「预览」试试。",
  // front matter 那条横幅（`ui/EditorPane.tsx`，`docs/07` 第 64 项，2026-10-04）。
  // 老的那一条（"…switch to Source mode to change it."）随横幅改版作废了：
  // 现在就地能改，再说"改不了"就是句谎。
  // ⚠️ 「编辑」「完成」这两条**上面已经有了**（菜单名那一批），这里不再写一遍：
  // 同一个对象字面量里重复的键是编译错。
  "Front matter": "front matter",
  "Delete": "删除",
  "Confirm delete": "确认删除",
  "YAML Front Matter": "YAML front matter",
  "The line itself goes away too — this one takes two clicks.": "那几行也会一起删掉——所以这一颗要按两下。",
  "Kept as-is at the very top of the file, outside the text you edit below — clearing this box will not delete it.": "它原样留在文件最开头，不在下面那段正文里——把这个框清空不会删掉它。",
  "The lines wrapped in `---` at the top of the file. They are not part of the text below, and they are kept as-is when you save.": "文件最开头 `---` 包住的那几行。它不属于下面的正文，存盘时原样保留。",
  "Copy Code": "复制代码",
  "Copy Failed": "复制失败",
  "Copied": "已复制",
  "Expand": "展开",
  "Collapse": "折叠",
  "Expand this code block": "展开这一段代码",
  "Collapse this code block": "折叠这一段代码",
  "Diagram Source (Mermaid)": "图表源码（Mermaid）",
  "Edit Source": "编辑源码",
  "Preview": "预览",
  "Rendering the diagram…": "正在渲染图表…",
  "Mermaid is parsing this source.": "Mermaid 正在解析这份源码。",
  "Edit this diagram's Mermaid source": "改这个图的 Mermaid 源码",
  "Hide the source and show the rendered diagram": "收起源码，看画出来的图",
  "The diagram has a syntax error and cannot be drawn (your source is untouched in the document).": "图表存在语法错误，当前无法渲染。文档中的源码未修改。",
  "There is no diagram source here yet": "这里还没有图表源码",
  "Click “Edit Source” at the top right to write Mermaid, for example:\ngraph TD; A[Start] --> B[End]": "点右上角「编辑源码」写下 Mermaid，例如：\ngraph TD; A[开始] --> B[结束]",
  "Math Source (LaTeX)": "公式源码（LaTeX）",
  "Empty inline math": "空的行内公式",
  "Empty math block — click to write LaTeX": "空的公式块：点一下就能写 LaTeX",
  "e.g. E=mc^2": "例如 E=mc^2",
  "e.g. \\frac{a}{b}": "例如 \\frac{a}{b}",
  "LaTeX commands": "LaTeX 命令",
  "physics": "物理",
  "Code Language": "代码语言",
  "Search or type a language": "搜索或输入语言",
  "Write your Markdown here…": "在这里写 Markdown 原文…",
  "Untitled": "未命名",
  "Cancel": "取消",
  "OK": "确定",
  "Something went wrong in the interface": "界面出了点问题",
  "Try to Continue": "试着继续",
  "Component stack: {0}": "组件栈：{0}",
  "What you were editing is still stored in the backend, so nothing is lost. Note down the information below, then restart Nota.": "你正在编辑的内容还在后端存着，没有丢。可以先把下面这段信息记下来， 然后重启 Nota。",
  "Find": "查找",
  "Replace": "替换",
  "Replace with": "替换为",
  "Search text": "查找内容",
  "Replacement text": "替换内容",
  "Previous": "上一个",
  "Next": "下一个",
  "Replace All": "全部替换",
  "Match Case": "区分大小写",
  "Word": "全词",
  "Match Whole Word: a match cannot be part of a longer word": "全字匹配：命中的两侧不能是词里的字符",
  "Regular Expression (a broken pattern is flagged right away)": "正则表达式（写坏了会当场标出来）",
  "No results": "无结果",
  "Invalid regex": "正则不合法",
  "Find and Replace": "查找和替换",
  "Close Find": "关闭查找",
  "Close (Esc)": "关闭（Esc）",
  "A WYSIWYG Markdown editor": "所见即所得的 Markdown 编辑器",
  "New Document": "新建文档",
  "Open File": "打开文件",
  "Open Folder": "打开文件夹",
  "Use a whole folder as a workspace": "把一整个目录当工作区",
  "Recently Opened": "最近打开",
  "Loaded": "已加载",
  "Disabled": "已禁用",
  "Failed": "失败",
  "No extensions found.": "没有发现拓展。",
  "{0} extensions failed to load. See the “Extensions” dock on the right for details.": "有 {0} 个拓展没能加载，详情见右侧「拓展」栏。",
  "Insert Emoji…": "插入 Emoji…",
  "Insert Emoji": "插入 Emoji",
  "Search shortcodes, e.g. smi or check": "搜索短代码，比如 smi 或 check",
  "Emoji category": "Emoji 分类",
  "All": "全部",
  "No matching emoji.": "没有匹配的 Emoji。",
  "Smileys": "表情",
  "Gestures": "手势",
  "People": "人物",
  "Animals": "动物",
  "Food": "食物",
  "Activities": "活动",
  "Travel": "旅行",
  "Nature": "自然",
  "Objects": "物件",
  "Symbols": "符号",
  "Flags": "旗帜",
  "Insert Image": "插入图像",
  "Insert": "插入",
  "Images": "图片",
  "Where the image comes from": "图片来自哪里",
  "Local file": "本地文件",
  "Web address": "网络地址",
  "Image file": "图片文件",
  "Browse…": "浏览…",
  "Image URL": "图片网址",
  "Alt text (optional)": "替代文字（可留空）",
  "Shown when the image cannot be loaded": "图片加载不出来时会显示这段文字",
  "Full path to the file, or a path relative to this document's folder": "文件的完整路径，或相对本文档目录的写法",
  "https://example.com/image.png": "https://example.com/图.png",
  "Where it lands after inserting depends on Settings → Image → When inserting an image.": "插入后怎么落地，看「设置 → 图像 → 插入图片时」那一项。",
  "Upload after inserting (the document gets the returned URL)": "插入后上传到上传服务器（正文里写传回来的网址）",
  "If upload fails, the document uses the local file path instead. The failure is reported separately.": "图片上传失败时，文档将使用本地文件路径，失败原因会单独提示。",
  "This document has no saved location. The “Copy to…” actions require the document folder. Save the document (Ctrl+S), then try again.": "此文档尚无保存位置。“复制到…”操作需要文档所在目录。请先保存文档（Ctrl+S），然后重试。",
  "The document YAML specifies": "文档 YAML 指定了",
  ", and settings allow automatic upload — the image is uploaded right after inserting and the document gets the returned URL (delete that line from the YAML to turn this off).": "，而且设置里允许自动上传——插入后这张图会直接传上去，正文里写的是传回来的那条网址（去掉这个行为就把 YAML 里那一行删掉）。",
  "Typesetting engine": "排版引擎",
  "Typeset and export with Nota itself": "用 Nota 自己排版导出",
  "This file": "这份文件",
  "Command": "命令",
  "Version": "版本",
  "Check Again": "重新检测",
  "Checking…": "检测中…",
  "Checking for pandoc on this system…": "正在检查系统中的 pandoc…",
  "Not found in PATH": "没在 PATH 里找到",
  "Install guide on the official site": "去官网看安装指南",
  "Try Anyway": "仍然试一次",
  "Export {0}": "导出 {0}",
  "Exporting {0}": "开始导出 {0}",
  "Esc to discard": "Esc 放弃",
  // 栏上那两颗就地 ×（2026-10-04，第 49 项：每个可关的面板都有一颗）。
  // ⚠️ 两条**必须同句式**（"收起…"）：它们是同一族按钮，其中一条写成"隐藏"、
  // 一条写成"关闭"，读起来像两个人加的。
  // ⚠️⚠️ **原来这里是三条**，2026-10-11 那条 `"Hide the sidebar"` 被
  // `tools/i18n-check.sh` 报成**废键**（"代码里找不到这句原文"）——它是
  // 2026-10-11「侧栏上面那条 × 去掉、页签改成平铺铺满」那一次**留下的孤儿**：
  // 按钮删了，中文译文没跟着删。留着的坏处正是这道闸要防的那种——同一句原文
  // 哪天被别处再用一次时，这里会**悄悄**生效，而没人知道它已经不对应任何按钮了。
  "Hide the status bar": "收起状态栏",
  "Hide the formatting toolbar": "收起格式工具栏",
  // 侧栏右缘那条拖动把手（2026-09-30）。读屏用户看不到宽度、也没有键盘拖动
  // 这条路，所以这句话要说清"拖它能干什么"，不是只念一声"分隔条"。
  "Resize the sidebar": "拖动可以调整侧边栏宽度",
  "Expand this section": "展开这一节",
  "Collapse this section": "折叠这一节",
  "Cannot read this folder: {0}": "读不了这个文件夹：{0}",
  "No folder is open yet. Open a folder and its Markdown files will be listed here.": "还没打开文件夹。打开一个文件夹后，这里会列出其中的 Markdown。",
  "This folder has no Markdown files.": "这个文件夹里没有 Markdown 文件。",
  "This document has no headings yet.": "这份文档还没有标题。",
  // ⚠️ 这里原来还有 `"Remove from list"` 与 `"No recent files yet.…"` 两条：
  // 它们只服务侧栏那一页，2026-09-28 随那一页一起删（同上）。
  // ⚠️ 这一段（2026-09-30 下栏重做之前是十三行）现在只剩两行。用户那天给了
  // 三张 Typora 的图，答「其余全删」——文件路径、`● 已修改`、模式名、`严格`、
  // 字符数、行数、「约几分钟」这些**显示**全走了。随之删掉的键：
  // `Ready` / `Unsaved` / `Not saved yet` / `● Modified` / `Strict` /
  // `Strict mode is on: …` / `Editing mode: {0} — …` / `Lines` /
  // `{0} lines` / `{0} characters` / `about {0} min` /
  // `Words (CJK counted per character)` / `Characters (by code point)` /
  // `Rough estimate at {0} words per minute (…)`——**留着就是废键**，
  // `tools/i18n-check.sh` 那一条会 FAIL（同上面侧栏那两段）。
  //
  // ⚠️ 它们说的那些数**一个都没少**，只是改成悬停才看：新的合成键是下面
  // 那一条 `{0} words · {1} characters · …`。`{0} words` 仍然留着——
  // 它是那一格上写着的那句话，悬停提示才是详细版。
  //
  // ⚠️ **2026-09-30 第二轮又把其中三个请回来了**（用户照 Typora 给的五张图）：
  // 状态栏右下角那颗上下箭头点开一个「字数统计」小菜单，四项**各自带着自己
  // 此刻的数值**排在里面（`≤1 分钟` / `1 行` / `0 词` / `0 字符`），选中的那项
  // 平时显示在栏上。所以 `{0} lines` / `{0} characters` / `{0} minutes` 三条
  // 从"废键"变回"正在用的键"——**删它们的理由没了**（那时没有任何地方显示
  // 这三个数）。上面那一串里剩下的仍是废键，别一起搬回来。
  "{0} words": "{0} 词",
  "{0} words · {1} characters · {2} lines · about {3} min": "{0} 词 · {1} 字符 · {2} 行 · 约 {3} 分钟",
  "{0} characters": "{0} 字符",
  "{0} lines": "{0} 行",
  "{0} minutes": "{0} 分钟",
  // 那两颗粒子、以及弹出来的那个小菜单。
  // ⚠️ 拼写那颗按钮的提示用**已有的** `"Spell check"`（在 `zh-settings.ts`
  // 里，是设置页那一项）——**同一个东西两处两把键**的话，哪天改了原文就只改
  // 一处，另一处静默退回英文（`index.ts` 文件头那条规矩）。这里不再抄一份：
  // 三张表是 `...` 铺开的，重复的键是设置表赢，抄一份等于埋一个假的真相。
  "Word Count": "字数统计",
  "Which count the status bar shows": "状态栏显示哪一个统计量",
  "Auto-detect language": "自动检测语言",
  "Do not check spelling": "不使用拼写检查",
  // ⚠️ 上面两句 2026-10-11 起住在一个**新组件**里（`ui/SpellMenu.tsx`，用户贴
  // Typora 的截图点名要的那份菜单），键没变——**只有一个调用点**，不存在两处
  // 各写一份的问题。同一天删掉的是 `"Languages: {0}"`：那一项从前靠"改写第一
  // 项的措辞"来交代勾了哪几门，现在**那一列语言自己就在菜单里**（还带着勾），
  // 再把它们拼进一句话里是同一个事实说两遍。
  // 底下这两句是那份菜单独有的（顶上那行小标题与底下那条出口）。
  // ⚠️ `"Select spell check language"` 既是 `aria-label` 也是那行小标题
  //（`MenuPopup` 的 `heading` 收的是**键**、由它翻）——同一个东西两处两个名字的话，
  // 改一处另一处静默退回英文。
  "Select spell check language": "选择拼写检查语言",
  "No dictionaries on this machine": "这台机器上还没有词典",
  // 搜索框里打了字、一门都没搜到（2026-10-11）。
  "No matching languages": "没有匹配的语言",
  "Rename": "重命名",
  "New name": "新名字",
  "Close this tab": "关闭这个标签页",
  "Open in New Window": "在新窗口中打开",
  "Tab": "标签页",
  "Has unsaved changes": "有未保存的改动",
  "Dismiss": "关掉",
  "Dismiss this notification": "关掉这条提示",
  "Show the extension dock": "展开拓展栏",
  " (wants the “{0}” menu — not supported yet)": "（想挂到「{0}」栏，暂不支持）",
  "Inline Code": "行内代码",
  "Formatting": "格式化",
  "Preparing the editor…": "正在准备编辑器…",
  "“{0}” was changed on disk by another program.": "「{0}」在磁盘上被别的程序改了。",
  "View changes": "查看修改",
  "Hide comparison": "收起对照",
  "Reload from disk": "重新载入",
  "Ignore": "忽略",
  // 错词上右键弹出的那一层（2026-10-11，`ui/SpellMenu.tsx`）。
  // ⚠️ `"Ignore"` 那把键**上面已经有了**（「磁盘上的改动」那条横幅在用）——
  // 同一个动作两处两把键的话，改一处另一处静默退回英文，所以这里只补另外两个。
  // 鸣谢里那一条字体（2026-10-16）：Monoton 是「Nota」这三个字用的字标字体。
  "The “Nota” wordmark (vector outlines — no font file is shipped)": "「Nota」这三个字的字标（矢量轮廓，不随包带字体）",
  "Add to dictionary": "加入词典",
  "Show what differs between the file on disk and what is in the editor": "在编辑区里看磁盘上那份和编辑器里这份的差别",
  "Hide the comparison and go back to the document (the file on disk is left alone)": "收起对照，回到正文（磁盘上那份不会被改动）",
  "Replace the editor contents with the file on disk (unsaved changes are lost — you are asked first)": "用磁盘上那份替换编辑器里的（没存的改动会丢，会先问你一次）",
  "Leave it alone: keep editing, and overwrite the file on disk when you save": "不管它：继续编辑，存盘时覆盖磁盘上那份",
  "Changes on disk": "磁盘上的改动",
  "The file on disk and the editor match.": "磁盘上那份和编辑器里这份没有差别。",
  "Back to Writing": "立刻回来写作",
  "This is alarm {0} of this session.": "这一轮第 {0} 次响警报了。",
  "The account balance has been charged to zero.": "账户余额扣到零了。",
  "Press the button below to go back to writing; the balance starts again from zero.": "点下面那颗按钮回去写字，余额重新从零开始攒。",
  "I'm Back": "我回来了",
  "Returning…": "正在返回…",
  "This Session Has Ended": "这一轮专注结束了",
  "Session Length": "本轮时长",
  "Away": "离开",
  "Focus Share": "专注占比",
  "Copy Share Image": "复制分享图",
  "Got It": "知道了",
  "Alarms": "警报次数",
  "{0}-{1}-{2} {3}": "{0}年{1}月{2}日 {3}",
  "You Focused For": "这一轮专注了",
  "This session you were away for {0}.": "本轮离开时长为 {0}。",
  "Focus": "专注",
  "Force Focus: the balance hit zero and the alarm has sounded.": "强制专注：余额已归零，警报已触发。",
  "Force Focus: you switched away, still inside the {0}-second grace period — these seconds are free.": "强制专注：当前仍在 {0} 秒宽限期内，此段时间不计入离开时长。",
  "Force Focus: the balance is being charged. Come back to Nota and the charge stops.": "强制专注：余额正在下降。返回 Nota 后将停止下降。",
  "Force Focus: you are writing, the balance is rising (cap {0}). Start and stop it under View → Force Focus.": "强制专注：正在编辑，余额增加中（上限 {0}）。可通过“视图 → 强制专注”启动或停止。",
  "Force Focus: Before You Begin": "强制专注：使用前说明",
  "Force Focus maintains an attention balance. The balance increases while you work in the editor and decreases while you are away. If it reaches zero, Nota displays a full-screen alert and plays a sound.": "强制专注通过注意力余额控制提醒：在编辑器中工作时余额增加，离开时余额减少；余额降至零时，Nota 会显示全屏警报并播放提示音。",
  "Force Focus uses three system capabilities:": "强制专注使用以下三项系统能力：",
  "① Detecting whether the Nota window is active;": "① 检测 Nota 窗口是否为活动窗口；",
  "② displaying a full-screen, always-on-top alert window;": "② 显示全屏置顶警报窗口；",
  "③ playing an alert sound.": "③ 播放提示音。",
  "These capabilities are used only while Force Focus is running. Nota does not read the keyboard, capture screenshots, monitor activity in other applications, or transmit data.": "这些能力仅在强制专注运行期间使用。Nota 不会读取键盘、截取屏幕、监控其他应用中的活动或传输数据。",
  "Force Focus can be stopped at any time and can be bypassed with system tools. It is not a lock. Bypassing it defeats the purpose of the feature. If you choose to use it, follow through with the commitment you have set.": "强制专注可随时停止，也可通过系统工具绕过。它不是锁定机制；绕过它将使该功能失去意义。如选择使用，请履行已设定的承诺。",
  "Start Force Focus": "开始强制专注",
  "Managing its own window": "管理自身窗口",
  "Dragging the window, changing the title-bar text, the full-screen toggle, page zoom, and opening the developer tools (core:window:* and core:webview:* in capabilities/default.json). These apply only to Nota's own window; they cannot touch other applications.": "拖动窗口、改标题栏文字、全屏开关、页面缩放、打开开发者工具（capabilities/default.json 里的 core:window:* 与 core:webview:*）。这几条只作用于 Nota 自己这个窗口，碰不到别的应用。",
  "System file dialogs": "系统文件对话框",
  "Open files, Save As, message boxes, question boxes (dialog:allow-open/save/message/ask). These use the system's own dialogs, and you choose which file.": "打开文件、另存为、提示框、询问框（dialog:allow-open/save/message/ask）。走的是系统自己的对话框，选哪个文件由你决定。",
  "Open links with the default application": "用默认程序打开链接",
  "Handing external links in the document to the system (opener:allow-open-url ＋ opener:allow-default-urls, which only lets http, https, mailto and tel through); no web page is ever opened inside Nota.": "正文里点到外部链接时交给系统（opener:allow-open-url），不在 Nota 内部打开任何网页。",
  "Reading images under your home folder (read-only)": "读你主目录下的图片（只读）",
  "Image files in the home, Documents, Desktop, and Downloads folders can be read and displayed in a document (assetProtocol.scope). Note: this range is wider than the opened folder because images may use any absolute path. Files are read as images only and are never written, modified, or transmitted.": "主目录、文档、桌面和下载目录中的图片可在文档中读取并显示（assetProtocol.scope）。此范围大于已打开的文件夹，因为图片可以使用任意绝对路径。文件仅作为图片读取，不会被写入、修改或传输。",
  "The interface layer cannot go online on its own": "界面层不能自己联网",
  "The content security policy allows connect-src only for itself and internal IPC (tauri.conf.json's csp), so even if someone slipped code into the interface, it could not send a request.": "内容安全策略里 connect-src 只放行自身和内部 IPC（tauri.conf.json 的 csp），所以就算界面代码被人塞了东西，它也发不出请求。",
  "Reading and writing the files and folders you open": "读写你打开的文件和文件夹",
  "Open, edit, save, and Save As. Within a workspace folder, file changes are also monitored (inotify) so changes made by another program can be reported. Only the opened folder is monitored.": "用于打开、编辑、保存和另存为。在工作区文件夹中还会通过 inotify 监听文件变化，并在其他程序修改文件时提示。仅监听已打开的文件夹。",
  "Clipboard": "剪贴板",
  "Copy, cut, and paste.": "复制、剪切、粘贴。",
  "Starting external processes": "启动外部进程",
  "Export formats use pandoc when installed; the Git extension uses git; Force Focus uses a system notification sound when an alarm is triggered (canberra-gtk-play or aplay). These processes are short-lived and do not remain resident.": "导出格式会在已安装时调用 pandoc；Git 拓展会调用 git；强制专注触发警报时会调用系统提示音程序（canberra-gtk-play 或 aplay）。这些进程均为短时进程，不会常驻。",
  "Networking (only when you have configured it)": "联网（只在你明确配置过的时候）",
  "Only an extension you have enabled that explicitly asks for the nota.http capability, and only to an address that passes its own allowlist, will make a network request. The core features themselves send nothing.": "只有你启用的拓展显式申请了 nota.http 能力、并且目标地址过了它自己的白名单，才会发出网络请求。核心功能自己不发任何请求。",
  "The three things Force Focus uses": "强制专注使用的系统能力",
  "① Detecting whether Nota's own window is active; ② displaying a full-screen, always-on-top window; ③ playing a sound. These capabilities are used only after selecting View → Force Focus. Force Focus does not read the keyboard, capture screenshots, or inspect other applications.": "①检测 Nota 自身窗口是否为活动窗口；②显示全屏置顶窗口；③播放提示音。仅在用户选择“视图 → 强制专注”后使用这些能力。强制专注不会读取键盘、截取屏幕或检查其他应用。",
  "Extension folder": "拓展文件夹",
  "Choose an extension package…": "选择拓展包…",
  "Export…": "导出…",
  "Working…": "处理中…",
  "Save as a .nota-plugin package — to hand to someone else to install, or as a backup.": "保存为 .nota-plugin 包，可用于分发安装或备份。",
  "Delete this extension from disk. Its settings file is kept.": "把这个拓展从磁盘上删掉。它的设置文件会留着。",
  "It asks for no capabilities.": "它没有申请任何能力。",
  "Read/write its own data": "读写自己的数据",
  "Opened the extension folder in your file manager": "已在文件管理器里打开拓展文件夹",
  "Exported {0}": "导出了 {0}",
  "{0} files, {1}": "{0} 个文件，{1}",
  "The signature was carried over — this package still counts as verified for whoever receives it (as long as they trust that key).": "签名已保留，接收方在信任对应密钥时仍会将此包视为已验证。",
  "This extension was modified, so its signature no longer matches. The package does not contain a signature. It can still be installed, but it will be shown as unsigned.": "此拓展已被修改，现有签名不再匹配，压缩包中也不包含签名。此包仍可安装，但会显示为“未签名”。",
  "This extension was never signed.": "这个拓展本来就没有签名。",

  // ⑦ 首选字体缺失那一条（`ui/useDocTheme.ts`，2026-10-17）
  "Missing font": "缺少字体",
  "The “{0}” theme prefers “{1}”, which is not installed on this machine. The editor is using a fallback font.":
    "「{0}」这套主题首选「{1}」，但这台机器上没有装它；编辑器已经退回系统字体。",

  // ⑥ 应用内打印框（`ui/PrintDialog.tsx`，2026-10-17）
  "Print": "打印",
  "Printer": "打印机",
  "default": "默认",
  "Reading the printers…": "正在读取打印机…",
  "CUPS was not found. You can still use “System print…” or export to PDF.":
    "没有检测到 CUPS。仍可点「系统打印…」或导出为 PDF。",
  "CUPS is running, but the printer list request failed: {0}. “System print…” is still available.":
    "CUPS 正在运行，但打印机列表请求失败：{0}。「系统打印…」仍可使用。",
  "CUPS is running, but no printers are configured. You can still use “System print…” or export to PDF.":
    "CUPS 正在运行，但没有配置打印机。仍可点「系统打印…」或导出 PDF。",
  "System print…": "系统打印…",
  "System print dialog": "系统打印对话框",
  "Paper": "纸张",
  "Orientation": "方向",
  "Portrait": "纵向",
  "Landscape": "横向",
  "Margins (mm)": "边距（毫米）",
  "Copies": "份数",
  "Page range (empty = all)": "页码范围（留空 = 全部）",
  "Preparing preview…": "正在生成预览…",
  "No preview": "没有预览",
  "Previous page": "上一页",
  "Next page": "下一页",
  "Page {0} of {1}": "第 {0} / {1} 页",
  "Only the first {0} pages are previewed": "只预览了前 {0} 页",
  "Sent to the printer: {0}": "已送到打印机：{0}",

  // ⑤ 退出前那一问（`ui/useQuitGuard.ts`，2026-10-16 新建，朋友清单第 7／16 条）。
  // ⚠️ 与「关掉一份文档」那一组（`"Save and Close"` / `"Discard and Close"`）
  // **措辞必须不一样**：那组问的是"这一份"，这组问的是"全部"。
  "Still unsaved: {0}. Save before quitting?": "还没保存：{0}。退出前要存吗？",
  "Save All and Quit": "全部保存并退出",
  "Discard and Quit": "不保存，直接退出",
  "Could not save “{0}”, so Nota is staying open": "「{0}」没存上，所以 Nota 先不退出了",
  "{0} and {1} more": "{0} 等 {1} 份",

  // 2026-10-16 补账：`tools/i18n-check.sh` 那天报的 29 条欠账里，**中文与英文
  // 写法不一样**的都收在这里（`Markdown` / `PDF…` / `{0}%` 这种两边一模一样的
  // 照本文件头的规矩不抄）。三条一组，按来源分块写。
  //
  // ① 查找条（`ui/FindBar.tsx`）——通配符那颗按钮与替换开关那两句话。
  "Wildcards: * for any run of characters, ? for exactly one": "通配符：* 代表任意多个字符，? 代表恰好一个字符",
  "Show Replace": "显示替换",
  "Show Replace (Ctrl+H)": "显示替换（Ctrl+H）",
  "Hide Replace": "收起替换",
  "Not used while Regular Expression is on — \\b does the same job": "正则表达式开启时不生效——\\b 起同样作用",
  "Find…": "查找…",

  // ② 功能提示（`ui/hints.ts`）——「新手友好」那一套里还没翻的八条。
  "Hold Ctrl and click to open the link.": "按住 Ctrl 单击可打开链接。",
  "To leave a code block, press Enter twice or click somewhere else.": "按两次 Enter 或点击代码块外部可退出代码块。",
  "Tab moves to the next cell — on the last row it adds a new one.": "Tab 移到下一个单元格——最后一行会新增一行。",
  "Shift+Tab goes back to the previous cell.": "Shift+Tab 回到上一个单元格。",
  "Type / at the start of an empty line to insert tables, math, emoji and more.": "在空行行首输入 / 可插入表格、公式、表情等。",
  "Press Enter to turn this into a heading.": "按 Enter 把它变成标题。",
  "The file was saved automatically when you switched documents. Auto Save can be disabled in Settings.": "切换文档时已自动保存。可在设置中关闭自动保存。",
  "Ctrl+F finds text, Ctrl+H also replaces it.": "Ctrl+F 查找，Ctrl+H 还能替换。",
  "PDF export uses the system installation of Pandoc. Nota does not include Pandoc.": "PDF 导出使用系统中安装的 Pandoc。Nota 不附带 Pandoc。",

  // ③ 状态栏与拓展栏（`ui/StatusBar.tsx` / `ui/DockResizer.tsx`）。
  "Overtype: typing replaces the character to the right": "覆写模式：输入会覆盖右边的字符",
  "Resize the extension dock": "拖动调整拓展栏宽度",

  // ④ 鸣谢里那两条（`ui/credits.ts`）。
  "Spell checking engine": "拼写检查引擎",
  "Reading the clipboard": "正在读取剪切板",
  "Could not open the link: {0}": "无法打开链接：{0}",
  "GPL-2.0-or-later (external program — Nota does not bundle it)": "GPL-2.0-or-later（外部程序——Nota 不随包分发）",

  // 2026-09-28 补：**插入表格的模板**（源码模式下「插入表格」插出来的那四行）。
  // ⚠️ 它落在**文档里**，不是界面上的字——但一样该跟着语言走：英语用户插出来的
  // 表，表头该是英语。`$0` 是光标占位符（`editor/source.ts` 的 `insertBlock`）。
  "\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| $0 |  |  |\n|  |  |  |\n":
    "\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| $0 |  |  |\n|  |  |  |\n",
};
