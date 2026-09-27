/**
 * 英文表的**第一部分**：界面骨架（菜单栏、插件栏、编辑区预览、编辑器那一层、
 * 界面上那些小件）。
 *
 * ⚠️ 这张表拆成几份**只是因为 1000 行的硬上限**（`tools/doc-sync-check.sh`；
 * 2026-09-26 拆的，拆之前 `en.ts` 已经 985 行）。**规矩全在 `en.ts` 的文件头**：
 * 键是中文原文、语体照 vmark、一个键只能有一个译文、省略号跟着原文走——
 * 加条目之前先读那一段。
 *
 * ⚠️ 这个文件**不导出 `英文表`**：`en.ts` 把几份拼起来再导出那一个名字
 * （`i18n/index.ts` 只认它）。别在这里写 `export const 英文表`——
 * `tools/i18n-check.sh` 按这个标记切表体，多一个就会把键数错。
 */

export const 界面表: Record<string, string> = {
  // ── 菜单栏：整条菜单栏的名字（`ui/commands.ts` 的 `MENUS`）──────────────
  文件: "File",
  编辑: "Edit",
  段落: "Paragraph",
  格式: "Format",
  视图: "View",
  主题: "Theme",
  帮助: "Help",

  // ── 「文件」栏 ────────────────────────────────────────────────────────
  新建: "New",
  新建窗口: "New Window",
  "打开…": "Open…",
  "打开文件夹…": "Open Folder…",
  "快速打开…": "Quick Open…",
  打开最近文件: "Open Recent File",
  // ⚠️ 这一条**不在 `t("…")` 调用里**（它写在 `ui/recentMenu.ts` 合成的菜单项上，
  // 由渲染方 `t(menu.label)` 翻），所以 `tools/i18n-check.sh` 数不到它——
  // 但它照旧得登记，不然英文界面里这一条会是中文。同一类还有上面那几条
  // 菜单文案（它们都在 `ui/commands.ts` 里，同样是"表存键、渲染时翻"）。
  清除最近记录: "Clear Recent Files",
  从磁盘重新加载: "Reload from Disk",
  保存: "Save",
  "另存为…": "Save As…",
  "保存全部打开的文件…": "Save All Open Files…",
  // 2026-09-27 加的这两条**真的会动磁盘上的文件**（不是改内容，是改名和搬位置），
  // 所以名字里那个「…」是承重的——它表示"点下去还要问一句"。
  "重命名…": "Rename…",
  "移动…": "Move to…",
  // ⚠️ 这一条**不是上面那条的重复**：上面是菜单项（`ui/commands.ts` 里写死的
  // 标签），这一条是**目录选择框的标题**（`ui/useDocuments.ts::moveDoc`）。
  // 两句原文差一个「到」字，是两把键——改其中一句时另一句不会跟着变。
  "移动到…": "Move to…",
  "打开文件位置…": "Open File Location…",
  在侧边栏中显示: "Reveal in Sidebar",
  "删除…": "Delete…",
  导入: "Import",
  导出: "Export",
  "打印…": "Print…",
  "偏好设置…": "Settings…",
  关闭: "Close",

  // 导入 / 导出那一层子菜单。⚠️ 格式名是**专有名词**，两种语言里都照写原文：
  // `.docx` 那份两边都是 `Word (.docx)…`（本表里就不重复登记了，缺键时用的
  // 就是原文，而原文本来就是英文）。这里只列**要改**的那几个。
  "Epub…": "EPUB…",
  "OpenOffice (.odt)…": "OpenDocument (.odt)…",
  "HTML（不含样式）…": "HTML (No Styles)…",
  "HTML（含样式）…": "HTML (With Styles)…",
  "图片…": "Image…",
  "其他格式…": "Other Formats…",

  // ── 「编辑」栏 ────────────────────────────────────────────────────────
  撤销: "Undo",
  重做: "Redo",
  剪切: "Cut",
  复制: "Copy",
  拷贝图片: "Copy Image",
  粘贴: "Paste",
  复制为: "Copy As",
  纯文本: "Plain Text",
  "HTML 代码": "HTML Source",
  // ⚠️ 原文只有「选择」两个字（没有"全部"），所以这边也只写 `Select`——
  // 这句话本身在中文里也是含糊的，译文不该替它把话说清楚。
  选择: "Select",
  上移该行: "Move Line Up",
  下移该行: "Move Line Down",
  "查找和替换…": "Find and Replace…",

  // ── 「段落」栏 ────────────────────────────────────────────────────────
  一级标题: "Heading 1",
  二级标题: "Heading 2",
  三级标题: "Heading 3",
  四级标题: "Heading 4",
  五级标题: "Heading 5",
  六级标题: "Heading 6",
  // ⚠️ 与菜单栏那一栏同名（`段落`）是**故意**的：vmark 那栏正文段落也叫
  // `Paragraph`，两边读起来一样不碍事，改一个别的词反而像两种东西。
  正文段落: "Paragraph",
  表格: "Table",
  "插入表格（3 × 3）": "Insert Table (3 × 3)",
  上方插入行: "Add Row Above",
  下方插入行: "Add Row Below",
  左侧插入列: "Add Column Before",
  右侧插入列: "Add Column After",
  删除行: "Delete Row",
  删除列: "Delete Column",
  删除表格: "Delete Table",
  左对齐: "Align Left",
  居中对齐: "Align Center",
  右对齐: "Align Right",
  公式块: "Math Block",
  代码块: "Code Block",
  引用: "Blockquote",
  有序列表: "Ordered List",
  // vmark 那栏就叫这个（不是 `Unordered List`）。
  无序列表: "Bullet List",
  任务列表: "Task List",
  水平分割线: "Horizontal Line",
  内容目录: "Table of Contents",
  脚注: "Footnote",
  // ⚠️ 下面四条是**斜杠菜单**（`editor/slash.ts` 的 `斜杠表`）带进来的，
  // 2026-09-27。前三级别处都叫「一级标题 / 二级标题 / 三级标题」
  // （`ui/commands.ts` 的 `para.h1` 那几条），这里是**短一格**的写法：
  // 那张表窄（`min-width: 132px`），`Heading 1` 比 `一级标题` 长得多而
  // 斜杠菜单是一列竖排的短词。⚠️ 两个键各存一份是**有意**的，别合并——
  // 合并了菜单栏那三行会跟着变短，那是另一处的文案。
  "标题 1": "Heading 1",
  "标题 2": "Heading 2",
  "标题 3": "Heading 3",
  // ⚠️ 菜单里叫「水平分割线」，斜杠表里叫「分割线」——同一条命令
  // （`para.hr`），两个键。短的那个是给斜杠菜单那列窄词用的。
  分割线: "Divider",

  // ── 「格式」栏（也用在工具条 `ui/FormatBar.tsx` 上）────────────────────
  // ⚠️ 这一族里 `粗体` / `斜体` / `删除线` / `代码` **同时是源码模式插入
  // 占位文字时的词**（`editor/source.ts::wrapSelection` 最后一参），
  // 所以取的是"两边都读得通"的词——见文件头「共用的键」那一段。
  粗体: "Bold",
  加粗: "Bold",
  斜体: "Italic",
  // `下划线` / `高亮` / `上标` / `下标` **也是源码模式插入时的占位文字**
  //（`editor/source.ts::wrapSelection` 最后一参），与上面那四句同一条口径。
  下划线: "Underline",
  代码: "Code",
  删除线: "Strikethrough",
  高亮: "Highlight",
  上标: "Superscript",
  下标: "Subscript",
  注释: "Comment",
  超链接: "Link",
  链接文字: "Link Text",
  图像: "Image",
  清除样式: "Clear Formatting",

  // ── 「视图」栏 ────────────────────────────────────────────────────────
  "显示/隐藏侧边栏": "Toggle Sidebar",
  大纲: "Outline",
  文件树: "File Tree",
  文档列表: "Document List",
  搜索: "Search",
  插件栏: "Plugin Dock",
  格式化工具栏: "Formatting Toolbar",
  始终显示: "Always Show",
  鼠标悬停时显示: "Show on Hover",
  始终不显示: "Never Show",
  // 三种编辑模式的名字。**这是唯一的真相源**（`ui/view-modes.ts`），
  // 状态栏与偏好设置都取它。
  所见即所得: "WYSIWYG",
  源码: "Source",
  源码模式: "Source Mode",
  分屏: "Split",
  分屏预览: "Split Preview",
  只读模式: "Read-Only Mode",
  专注模式: "Focus Mode",
  打字机模式: "Typewriter Mode",
  状态栏: "Status Bar",
  // ── 缩放那三档（`ui/commands.ts`，2026-09-27）──
  // 「实际大小」不写 "Actual Size" 而取 `Reset Zoom`：这一条是**动作**
  // （回到 100%），不是一个尺寸的名字，而 `Actual Size` 在英文里两可。
  放大: "Zoom In",
  缩小: "Zoom Out",
  实际大小: "Reset Zoom",
  全屏: "Full Screen",
  // 「视图 → 窗口置顶」那一格（`ui/useWindowControls.ts` 的开关，菜单里带勾）。
  窗口置顶: "Always on Top",
  开发者工具: "Developer Tools",

  // ── 「主题」栏（`ui/commands.ts::themeEntries`）────────────────────────
  "无主题（内置）": "No Theme (Built-in)",
  "打开主题文件夹…": "Open Themes Folder…",
  // ⚠️ 这一条带参数：用户放的同名主题会盖掉内置那套，后面缀一句话标出来。
  // 后缀**在 `themeEntries` 里就翻**（拼成整串再交给渲染方就翻不动了）。
  "{0}（已自定义）": "{0} (customized)",

  // ── 「帮助」栏 ────────────────────────────────────────────────────────
  "关于 Nota": "About Nota",

  // ── 插件栏：页签与标题 ────────────────────────────────────────────────
  插件: "Plugins",
  插件面板: "Plugin panels",
  "已装插件清单（出问题时看这里）": "Installed plugins (look here when something is wrong)",
  收起插件栏: "Hide the plugin dock",
  "由插件 {0} 提供": "Provided by plugin {0}",
  已装插件: "Installed plugins",

  // ── 插件栏：安装 / 启停那一排动作 ──────────────────────────────────────
  "从一个插件包（.nota-plugin）安装": "Install from a plugin package (.nota-plugin)",
  "正在安装…": "Installing…",
  "从文件安装…": "Install from file…",
  启用: "Enable",
  停用: "Disable",
  卸载: "Uninstall",
  信任: "Trust",
  "信任 {0}": "Trust {0}",
  这个签名者: "this signer",
  "没有装插件。用上面的「从文件安装…」装一个。":
    "No plugins installed. Use “Install from file…” above.",

  // ── 插件栏：来路与验签 ────────────────────────────────────────────────
  自装: "user",
  内置: "builtin",
  已验证: "verified",
  未知签名者: "unknown signer",
  未签名: "unsigned",

  // ── 插件栏：编辑区面板 / 没落脚处那两段清单 ────────────────────────────
  编辑区面板: "In-editor panels",
  "这些面板摊在正文那一块，由插件在需要时打开（比如 AI 提了改动之后的「在编辑区看」）。":
    "These panels are laid over the editing area; the plugin opens one when it needs to " +
    "(e.g. “View in editor” after the AI proposes a change).",
  编辑区: "editing area",
  没有落脚处: "Nowhere to land",
  "这些面板声明的位置目前还没有对应的地方，所以哪儿都没显示。":
    "These panels declare a location that does not exist yet, so they are not shown anywhere.",

  // ── 插件栏：信任表。⚠️ 那句话在 JSX 里被 `<code>` 断成三段，键也就跟着是三段 ──
  已信任的签名者: "Trusted signers",
  "这些指纹签的包都当成「已验证」。核对不上的要去改":
    "Packages signed by these fingerprints count as verified. Edit ",
  "。": " to fix a mismatch.",

  // ── 插件栏：把后端/插件的**原始标识符**说成人话 ────────────────────────
  //
  // ⚠️ 这一组的键**全在 `ui/PluginDock.tsx` 的组件体里**（`能力名` / `位置名` /
  // `语言标签名` 三张表），不是散在 JSX 里的。那三张表为什么必须写在组件里、
  // 为什么值必须是字面量，那边的注释写着——**别把它们提到模块级**，
  // `tools/i18n-check.sh` 会当场判成"废键"。
  读当前文档: "Read the document",
  改当前文档: "Edit the document",
  读工作区文件: "Read workspace files",
  写工作区文件: "Write workspace files",
  "调 git": "Run git",
  起开发服务器: "Start a dev server",
  发网络请求: "Make network requests",
  弹通知: "Show notifications",
  打开浏览器: "Open the browser",
  加侧栏面板: "Add sidebar panels",
  加菜单条目: "Add menu entries",
  读写自己的设置: "Read and write its own settings",
  右栏: "right dock",
  英语: "English",
  "中文（简体）": "Chinese (Simplified)",

  // ── 面板的三种状态 ────────────────────────────────────────────────────
  "正在读取…": "Loading…",
  "插件没有给出内容。": "The plugin has nothing to show.",

  // ── 插件那一句提示（用户 2026-09-25 定的原话）──────────────────────────
  此插件不支持您的语言: "This plugin does not support your language",

  // ── 编辑区里的预览（`ui/ReviewPane.tsx`）───────────────────────────────
  回到正文: "Back to the document",
  "收起预览，回到正文（改动不会因此被应用）":
    "Close the preview and go back to the document (this does not apply the changes)",

  // ── 就地预览顶上那条细条（`ui/ReviewBar.tsx`）──────────────────────────
  // ⚠️ 「改动对比」/「改后效果」是**一对**：同一个东西的两种画法（正文一个字
  // 都没换）。英文里也挑了同样成对的两种说法，别把其中一条译成名词短语。
  改动对比: "Diff",
  改后效果: "Result",
  "Esc 收起": "Esc to close",
  收起预览: "Close preview",
  "收起预览，改动不会因此被应用":
    "Close the preview (this does not apply the changes)",

  // ── 面板内容块（`ui/panel-nodes.ts` 的默认值与认不出的 kind）───────────
  "不认识这种内容块（kind={0}）": "Unrecognised content block (kind={0})",
  "这一块的插件版本可能比 Nota 新，或者 `kind` 拼错了。":
    "This plugin may target a newer Nota, or `kind` is misspelled.",
  "（没写 kind）": "(no kind)",
  请输入: "Enter a value",
  提交: "Submit",

  // ── 面板内容块：按钮与输入框少写一根线时说的话（`ui/PanelBody.tsx`）────
  "这个按钮没有写 `command`，点了也没事发生":
    "This button has no `command`, so clicking it does nothing",
  "这个输入框没有写 `submit` / `arg`，点了也没事发生":
    "This input box has no `submit` / `arg`, so clicking it does nothing",
  // 曲线的无障碍名字（`ui/PanelBody.tsx` 那块 `kind = "chart"`）。里面那些点
  // 对读屏软件是没有形状的，这句话是它唯一的说法。
  "曲线，共 {0} 个点": "A curve with {0} points",
  // ⚠️ 这条与上一条**成对**：纵轴刻度是 2026-09-27 加的，加了之后这句话里就多了
  // 两个数（极值）。两条都留着——上一条走"插件没给纵刻度"那条路（`PanelChart`
  // 有 `yTicks` 字段，插件给了就用它的）。
  "曲线，共 {0} 个点，纵轴 {1} 到 {2}": "A curve with {0} points, vertical axis {1} to {2}",

  // ── 分享卡（`ui/share-card.ts` ＋ `ui/PanelBody.tsx` 那块 `kind = "share"`）──
  //
  // ⚠️ 卡片**自己身上**那些字（标题、大数字、页脚）不在这里：它们是**插件给的**
  // 普通字符串，走 IPC 原样画（`ui/share-card.ts`）。这里只有宿主自己说的那几句
  // ——预览的无障碍名字、两颗按钮、以及出结果/出岔子时的两句话。
  "分享图预览：{0} {1}": "Share image preview: {0} {1}",
  保存分享图: "Save share image",
  保存为图片: "Save as image",
  复制到剪贴板: "Copy to clipboard",
  "已保存到 {0}": "Saved to {0}",
  "已复制到剪贴板": "Copied to clipboard",
  "保存失败：{0}": "Could not save: {0}",
  "这个环境不支持把图片放进剪贴板":
    "This environment cannot put images on the clipboard",
  "没能写进剪贴板（{0}）。可以改按「保存为图片」。":
    "Could not write to the clipboard ({0}). Try “Save as image” instead.",
  插件预览: "Plugin preview",
  "预览的地址不对，嵌不进来。": "The preview URL is not acceptable, so it cannot be embedded.",
  "预览没有在跑。「停止」之后再点一次「预览」试试。":
    "The preview is not running. Press “Stop”, then “Preview” again.",

  // ── 编辑区：front matter 那条说明（`ui/EditorPane.tsx`）────────────────
  //
  // ⚠️ 这一条**不属于"插件那一面"**（上面那段"覆盖到哪儿了"说的是插件面），
  // 它是编辑器自己的说明——本来按老规矩该留中文，但它是**用户会长期看着的
  // 一句话**，顺手一起翻了。别以为这就表示"应用其余部分也开始翻了"。
  "这篇文档开头有一段 front matter（`---` 包住的那几行）。所见即所得里不显示、也改不了，存盘时会原样保留——要改请切到源码模式。":
    "This document starts with a block of front matter (the lines wrapped in `---`). " +
    "It is neither shown nor editable here, and it is kept as-is when you save — " +
    "switch to Source mode to change it.",

  // ══ 编辑器那一层（`src/editor/`）═════════════════════════════════════════
  //
  // ⚠️ 这一层用的全是**模块级** `t`（NodeView / 纯函数，拿不到 context），
  // 所以这些词是"画出来的那一刻"取的——那是它们唯一的时机，也是唯一正确的时机。
  //
  // ── 代码块上那两个浮层按钮（`editor/code-block.ts`）────────────────────
  复制代码: "Copy Code",
  复制失败: "Copy Failed",
  已复制: "Copied",
  展开: "Expand",
  折叠: "Collapse",
  展开这一段代码: "Expand this code block",
  折叠这一段代码: "Collapse this code block",

  // ── 图表（`editor/diagram-view.ts`）。⚠️ 例子里的 `[开始]` 也翻了：
  // 那是**给用户照抄的示范**，英文界面上留着中文的节点名等于没示范。
  "图表源码（Mermaid）": "Diagram Source (Mermaid)",
  编辑源码: "Edit Source",
  预览: "Preview",
  "正在渲染图表…": "Rendering the diagram…",
  "Mermaid 正在解析这份源码。": "Mermaid is parsing this source.",
  "改这个图的 Mermaid 源码": "Edit this diagram's Mermaid source",
  "收起源码，看画出来的图": "Hide the source and show the rendered diagram",
  "图里有语法错误，现在画不出来（文档里是你的源码，没有被改过）":
    "The diagram has a syntax error and cannot be drawn " +
    "(your source is untouched in the document).",
  "这里还没有图表源码": "There is no diagram source here yet",
  "点右上角「编辑源码」写下 Mermaid，例如：\ngraph TD; A[开始] --> B[结束]":
    "Click “Edit Source” at the top right to write Mermaid, for example:\n" +
    "graph TD; A[Start] --> B[End]",

  // ── 公式（`editor/math-view.ts`）────────────────────────────────────────
  "公式源码（LaTeX）": "Math Source (LaTeX)",
  空的行内公式: "Empty inline math",
  "空的公式块：点一下就能写 LaTeX": "Empty math block — click to write LaTeX",
  "例如 E=mc^2": "e.g. E=mc^2",
  "例如 \\frac{a}{b}": "e.g. \\frac{a}{b}",

  // ── 另外两处零碎的（语言选择器、源码模式的空文档提示）──────────────────
  代码语言: "Code Language",
  // 语言下拉顶上那个输入框的占位（用户 2026-09-26 要的那个）。
  // ⚠️ 翻 "Search or type a language" 而不是 "Type language"：它**先**是筛列表的，
  // 输入自己的语言是第二条用途——只写后半句，用户想不到能拿它筛。
  搜索或输入语言: "Search or type a language",
  // 输入框里那串字不在已知语言里时，列表最后多出来的那一行右边的小字。
  // ⚠️ 不是 "Custom"：那一行左边写的就是用户输的词，「自定义」要说明的是
  // **这一行不是列表里原来有的**，不是"这是个自定义语言"。
  自定义: "New",
  "在这里写 Markdown 原文…": "Write your Markdown here…",
  未命名: "Untitled",

  // ══ 界面上那些小件 ═══════════════════════════════════════════════════════
  //
  // ── 两个通用对话框（`ui/ConfirmDialog.tsx` / `ui/PromptDialog.tsx`）────
  取消: "Cancel",
  确定: "OK",

  // ── 崩溃兜底（`ui/ErrorBoundary.tsx`）───────────────────────────────────
  界面出了点问题: "Something went wrong in the interface",
  试着继续: "Try to Continue",
  "组件栈：{0}": "Component stack: {0}",
  "你正在编辑的内容还在后端存着，没有丢。可以先把下面这段信息记下来， 然后重启 Nota。":
    "What you were editing is still stored in the backend, so nothing is lost. " +
    "Note down the information below, then restart Nota.",

  // ── 查找替换（`ui/FindBar.tsx`）─────────────────────────────────────────
  查找: "Find",
  替换: "Replace",
  替换为: "Replace with",
  查找内容: "Search text",
  替换内容: "Replacement text",
  上一个: "Previous",
  下一个: "Next",
  全部替换: "Replace All",
  区分大小写: "Match Case",
  全词: "Word",
  "全字匹配：命中的两侧不能是词里的字符":
    "Match Whole Word: a match cannot be part of a longer word",
  "正则表达式（写坏了不算错，只是这一次查不到）":
    "Regular Expression (a broken pattern is not an error — it just finds nothing this time)",
  无结果: "No results",
  查找和替换: "Find and Replace",
  关闭查找: "Close Find",
  "关闭（Esc）": "Close (Esc)",

  // ── 起始页（`ui/Home.tsx`）──────────────────────────────────────────────
  "所见即所得的 Markdown 编辑器": "A WYSIWYG Markdown editor",
  新建文档: "New Document",
  打开文件: "Open File",
  打开文件夹: "Open Folder",
  把一整个目录当工作区: "Use a whole folder as a workspace",
  // 最近打开的文件（2026-09-27）。⚠️ 列表里的**文件名不进这张表**——它是
  // 路径的一部分，不是文案（缺键时用的就是原文，而原文本来就该照原样显示）。
  最近打开: "Recently Opened",
  已加载: "Loaded",
  已禁用: "Disabled",
  失败: "Failed",
  "没有发现插件。": "No plugins found.",
  "有 {0} 个插件没能加载，详情见右侧「插件」栏。":
    "{0} plugins failed to load. See the “Plugins” dock on the right for details.",

  // ── Emoji 选择框（`ui/EmojiDialog.tsx`，2026-09-27）─────────────────────
  // ⚠️ 界面上出现的 emoji 字符本身**不进表**（它们不是文案，是全人类通用
  // 的符号）；这十一条分类名才是文案——它们来自 `editor/emoji.ts` 的表，
  // 键就是那边的中文原文。
  "插入 Emoji…": "Insert Emoji…",
  "插入 Emoji": "Insert Emoji",
  "搜索短代码，比如 smi 或 check": "Search shortcodes, e.g. smi or check",
  "Emoji 分类": "Emoji category",
  全部: "All",
  "没有匹配的 Emoji。": "No matching emoji.",
  表情: "Smileys",
  手势: "Gestures",
  人物: "People",
  动物: "Animals",
  食物: "Food",
  活动: "Activities",
  旅行: "Travel",
  自然: "Nature",
  物件: "Objects",
  符号: "Symbols",
  旗帜: "Flags",

  // ── 插图对话框（`ui/ImageDialog.tsx`）───────────────────────────────────
  插入图像: "Insert Image",
  插入: "Insert",
  图片: "Image",
  图片来自哪里: "Where the image comes from",
  本地文件: "Local file",
  网络地址: "Web address",
  图片文件: "Image file",
  "浏览…": "Browse…",
  图片网址: "Image URL",
  "替代文字（可留空）": "Alt text (optional)",
  "图片加载不出来时会显示这段文字": "Shown when the image cannot be loaded",
  "文件的完整路径，或相对本文档目录的写法":
    "Full path to the file, or a path relative to this document's folder",
  "https://example.com/图.png": "https://example.com/image.png",
  "插入后怎么落地，看「设置 → 图像 → 插入图片时」那一项。":
    "Where it lands after inserting depends on Settings → Image → When inserting an image.",
  "插入后上传到上传服务器（正文里写传回来的网址）":
    "Upload after inserting (the document gets the returned URL)",
  "⚠️ 传失败时会照常插入，地址还是本地那条——图不会丢，失败原因另说一句。":
    "⚠️ If the upload fails, the image is inserted as usual with its local path — " +
    "nothing is lost, and the failure is reported separately.",
  "⚠️ 这份文档还没存过盘——「复制到…」那几个动作需要文档所在的目录， 先保存一次（Ctrl+S）再用它们。":
    "⚠️ This document has not been saved yet — the “Copy to…” actions need the " +
    "document's folder. Save once (Ctrl+S) and try again.",
  "⚠️ 这份文档的 YAML 里写着": "⚠️ This document's YAML sets",
  "，而且设置里允许自动上传——插入后这张图会直接传上去，正文里写的是传回来的那条网址（去掉这个行为就把 YAML 里那一行删掉）。":
    ", and settings allow automatic upload — the image is uploaded right after " +
    "inserting and the document gets the returned URL " +
    "(delete that line from the YAML to turn this off).",

  // ── Pandoc 面板（`ui/PandocPanel.tsx`）──────────────────────────────────
  排版引擎: "Typesetting engine",
  "用 Nota 自己排版导出": "Typeset and export with Nota itself",
  这份文件: "This file",
  命令: "Command",
  版本: "Version",
  重新检测: "Check Again",
  "检测中…": "Checking…",
  "正在检查本机有没有 pandoc…": "Looking for pandoc on this machine…",
  "没在 PATH 里找到": "Not found in PATH",
  "去官网看安装指南": "Install guide on the official site",
  仍然试一次: "Try Anyway",
  "导出 {0}": "Export {0}",
  "开始导出 {0}": "Exporting {0}",

  // ── 就地预览那条细条上的一句（`ui/ReviewBar.tsx`）──────────────────────
  "Esc 放弃": "Esc to discard",

  // ── 侧栏（`ui/Sidebar.tsx`）─────────────────────────────────────────────
  收起侧边栏: "Hide the sidebar",
  展开这一节: "Expand this section",
  折叠这一节: "Collapse this section",
  "读不了这个文件夹：{0}": "Cannot read this folder: {0}",
  "还没打开文件夹。打开一个文件夹后，这里会列出其中的 Markdown。":
    "No folder is open yet. Open a folder and its Markdown files will be listed here.",
  "这个文件夹里没有 Markdown 文件。": "This folder has no Markdown files.",
  "这份文档还没有标题。": "This document has no headings yet.",
  // 「文档列表」那一页（最近打开的文件，2026-09-27）。
  从列表里去掉: "Remove from list",
  "还没有最近打开的文件。打开过的文件会列在这里。":
    "No recent files yet. Files you open will be listed here.",

  // ── 状态栏（`ui/StatusBar.tsx`）─────────────────────────────────────────
  就绪: "Ready",
  未保存: "Unsaved",
  尚未保存: "Not saved yet",
  "● 已修改": "● Modified",
  "{0} 行": "{0} lines",
  "{0} 词": "{0} words",
  "{0} 字符": "{0} characters",
  行数: "Lines",
  "词数（中文按字计）": "Words (CJK counted per character)",
  "字符数（按码点计）": "Characters (by code point)",
  "约 {0} 分钟": "about {0} min",
  "按每分钟 {0} 词粗略估算（在「偏好设置 → 外观」里改）":
    "Rough estimate at {0} words per minute (change it in Settings → Appearance)",
  严格: "Strict",
  "严格模式开着：井号后面必须有空格才算标题，「#标题」不算。":
    "Strict mode is on: a heading needs a space after the hashes, so “#title” does not count.",
  "编辑模式：{0}——在「视图」菜单里换":
    "Editing mode: {0} — switch it in the View menu",

  // ── 重命名 / 移动那两个框（`ui/useDocuments.ts`）─────────────────────────
  //
  // ⚠️ 「重命名」这一个键**同时是标题和确认按钮上的字**：`useDocuments` 里
  // 两处传的是同一句原文，所以这里是**一条**登记、不是两条。改的时候两边一起看。
  重命名: "Rename",
  新名字: "New name",

  // ── 标签条（`ui/TabBar.tsx`）与提示条（`ui/Toasts.tsx`）────────────────
  关闭这个标签页: "Close this tab",
  有未保存的改动: "Has unsaved changes",
  关掉: "Dismiss",
  关掉这条提示: "Dismiss this notification",
  展开插件栏: "Show the plugin dock",

  // ── `ui/commands.ts` 里**原文本来就是英文**的那几条 ─────────────────────
  //
  // ⚠️ 这一组是**有意登记的**（键与值一样），目的只有一个：让"还没翻译"那张
  // 欠账表**清零**。不登记的话它们会一直挂在欠账里，而下一次真漏翻一条就淹在
  // 这些噪音里看不出来了（`tools/i18n-check.sh` 只认"表里有没有这个键"）。
  // 别把它们删掉换"省几行"。
  Markdown: "Markdown",
  "YAML Front Matter": "YAML Front Matter",
  "LaTeX…": "LaTeX…",
  "RTF…": "RTF…",
  "PDF…": "PDF…",
  "OPML…": "OPML…",
  "Word (.docx)…": "Word (.docx)…",

  // ── 插件菜单项挂错了栏时补的那句（`ui/pluginMenus.ts`）──────────────────
  //
  // ⚠️ 这一句**必须在 `pluginMenus.ts` 里翻**：它是拼在插件给的标签**后面**的，
  // 而下游 `MenuPopup` 的 `t(entry.label)` 查的是**整条拼好的标签**，查不到。
  "（想挂到「{0}」栏，暂不支持）": " (wants the “{0}” menu — not supported yet)",


  // ── 工具条的可读名字与两个补登记（2026-09-26 补）─────────────────────────
  //
  // ⚠️ `FormatBar.tsx` 里那张 `TITLES` 是**键表**（15 个名字，值里 14 个与
  // 「格式」/「段落」菜单项共用——那是**故意**的：同一条命令在两个入口不能
  // 叫两个名字）。下面只登记菜单里没有的那一个。
  行内代码: "Inline Code",
  // 工具条那个 `role="toolbar"` 的可读名字（读屏念的那一句）。
  格式化: "Format",
  // 编辑区右上角那句"正在准备"。⚠️ 它是**硬编码中文**，2026-09-26 才包上
  // `t(...)`——之前它连闸门都够不着（没有 `t(` 就不是键）。
  "正在准备编辑器…": "Preparing the editor…",

  // ── 外部改动（2026-09-26）────────────────────────────────────────────────
  //
  // 别人（别的程序）改了磁盘上那份文件时那条提示条 ＋ 编辑区里那份对照。
  // 文案在 `ui/ExternalChangeBar.tsx` / `ui/ExternalDiffPane.tsx`。
  //
  // ⚠️ 中文那边「忽略」这个词是**承重的**：它不是"取消"，是"不管它、
  // 我继续编、存盘覆盖"。英文挑 `Ignore` 而不是 `Dismiss`（`Dismiss` 读起来
  // 像"关掉这条提示"，而它确实会关掉提示——但用户要知道的是"会发生什么"）。
  // 三颗按钮的 `title` 各写清了后果，那是这条提示**唯一**的安全网。
  "「{0}」在磁盘上被别的程序改了。": "“{0}” was changed on disk by another program.",
  "查看修改": "View changes",
  "收起对照": "Hide comparison",
  "重新载入": "Reload from disk",
  "忽略": "Ignore",
  "在编辑区里看磁盘上那份和编辑器里这份的差别": "Show what differs between the file on disk and what is in the editor",
  "收起对照，回到正文（磁盘上那份不会被改动）": "Hide the comparison and go back to the document (the file on disk is left alone)",
  "用磁盘上那份替换编辑器里的（没存的改动会丢，会先问你一次）": "Replace the editor contents with the file on disk (unsaved changes are lost — you are asked first)",
  "不管它：继续编辑，存盘时覆盖磁盘上那份": "Leave it alone: keep editing, and overwrite the file on disk when you save",
  "磁盘上的改动": "Changes on disk",
  "磁盘上那份和编辑器里这份没有差别。": "The file on disk and the editor match.",
  // ── 强制专注：警报窗 / 状态栏 / 首次说明 / 关于页（2026-09-26 加）──────────
  //
  // ⚠️ 这一组是**核心功能**（不是插件），用户点名要的。三个文件：
  // `ui/FocusAlarmWindow.tsx`（那块红屏）、`ui/FocusMeter.tsx`（状态栏那格）、
  // `ui/useFocusIntro.ts`（第一次开时的说明）、`ui/useAbout.ts`（权限清单）。
  //
  // ⚠️ 英文里「专注」一律 `Focus`，「强制专注」一律 `Force Focus`：本仓已经有一条
  // 叫「专注模式」（F8、收起外壳）的菜单项，两个都叫 `Focus Mode` 就分不清了。
  //
  // ⚠️ 下面那一大段「权限」是**照着代码抄的声明**（`useAbout.ts` 那张表），
  // 改动它之前先改代码、再回来改这里——反了就是撒谎。
  "立刻回来写作": "Back to Writing",
  "这一轮第 {0} 次响警报了。": "This is alarm {0} of this session.",
  "账户余额扣到零了。": "The account balance has been charged to zero.",
  "点下面那颗按钮回去写字，余额重新从零开始攒。":
    "Press the button below to go back to writing; the balance starts again from zero.",
  "我回来了": "I'm Back",
  "这就回去…": "Going back…",
  // ── 强制专注：**结束后的总结**（2026-09-27 加，用户点名要的）──────────────
  //
  // 三个文件：`ui/FocusSummaryDialog.tsx`（那个框）、`ui/useFocusTrace.ts`
  //（攒这一轮的轨迹）、`ui/focus-summary.ts`（造卡片字段）。
  //
  // ⚠️ `t("{0}年{1}月{2}日 {3}", 年, 月, 日, "22:07")` 是一条**格式串**：占位符
  // 的**个数与顺序**必须和中文那句一致，只是排布随语言变。英文这边照
  // `plugins/stats/lang/en.toml` 那条口径写 ISO（`2026-09-27 22:07`）——
  // 「{0}年{1}月{2}日」的语序在英文里没有对应写法。
  // ⚠️ 年月日**不补零**（那是调用方 `focus-summary.ts::说时刻` 决定的，中文那边
  // 补了零就成了「2026年09月27日」）。所以英文这一边也是 `2026-9-27 22:07`。
  "这一轮专注结束了": "This Session Has Ended",
  "本轮时长": "Session Length",
  "离开": "Away",
  "专注占比": "Focus Share",
  "复制分享图": "Copy Share Image",
  "知道了": "Got It",
  "警报次数": "Alarms",
  "—": "—",
  "{0}%": "{0}%",
  "{0}年{1}月{2}日 {3}": "{0}-{1}-{2} {3}",
  "这一轮专注了": "You Focused For",
  "这一轮，你离开了 {0}。": "This session you were away for {0}.",
  "专注": "Focus",
  "强制专注：余额扣到零，警报已经响了。":
    "Force Focus: the balance hit zero and the alarm has sounded.",
  "强制专注：你切走了，还在 {0} 秒的宽限里——这几秒不扣钱。":
    "Force Focus: you switched away, still inside the {0}-second grace period — these " +
    "seconds are free.",
  "强制专注：正在扣余额。回到 Nota 就停止扣。":
    "Force Focus: the balance is being charged. Come back to Nota and the charge stops.",
  "强制专注：你在写，余额在涨（上限 {0}）。起停走「视图 → 强制专注」。":
    "Force Focus: you are writing, the balance is rising (cap {0}). Start and stop it under " +
    "View → Force Focus.",
  "强制专注：先说清楚": "Force Focus: Let Us Be Clear First",
  "这是一笔注意力的账。你坐在编辑器前，余额就往上走；切到别处去，余额就往下掉。余额见底，它会用一整块红屏和一声尖响把你叫回来。":
    "This is an account of attention. While you sit at the editor the balance goes up; when " +
    "you switch elsewhere it goes down. When the balance runs out, it calls you back with a " +
    "full red screen and a sharp sound.",
  "它要用到三样东西：": "It needs three things:",
  "① 知道 Nota 自己的窗口是不是当前窗口；":
    "① Whether Nota's own window is the active window;",
  "② 弹出一个置顶的、全屏的窗口——就是那块红屏；":
    "② putting up an always-on-top, full-screen window — the red screen;",
  "③ 出声。": "③ making a sound.",
  "就这三样，只在它运行期间发生。它不读键盘、不截屏、不看你在别的程序里干什么，也不把你的任何东西发到任何地方。":
    "Those three, only while it is running. It does not read the keyboard, take screenshots, " +
    "watch what you do in other programs, or send anything of yours anywhere.",
  "最后一件必须说清楚：这个模式你随时能停，也能拿系统工具绕开它——它不是锁，拦不住真想跑的人。可你要是绕了，当初设它也就没有意义了。所以，请好好对待自己给自己的这句话：决定了，就执行到底。":
    "One last thing that has to be said plainly: you can stop this mode at any time, and you " +
    "can bypass it with system tools — it is not a lock, and it will not hold anyone who " +
    "really wants out. But if you bypass it, setting it up in the first place means nothing. " +
    "So please take this promise you made to yourself seriously: once you decide, follow through.",
  "我明白了，开始": "I Understand — Start",
  "── Nota 向系统申请的权限，一条不漏 ──": "── Every system permission Nota asks for ──",
  "（每条后面是它的出处；想自己去核对，就打开那个文件）":
    "(Each one is followed by its source; open that file if you want to check for yourself)",
  "管自己的窗口": "Managing its own window",
  "拖动窗口、改标题栏文字、全屏开关、页面缩放、打开开发者工具（capabilities/default.json 里的 core:window:* 与 core:webview:*）。这几条只作用于 Nota 自己这个窗口，碰不到别的应用。":
    "Dragging the window, changing the title-bar text, the full-screen toggle, page zoom, and " +
    "opening the developer tools (core:window:* and core:webview:* in " +
    "capabilities/default.json). These apply only to Nota's own window; they cannot touch " +
    "other applications.",
  "系统文件对话框": "System file dialogs",
  "打开文件、另存为、提示框、询问框（dialog:allow-open/save/message/ask）。走的是系统自己的对话框，选哪个文件由你决定。":
    "Open files, Save As, message boxes, question boxes (dialog:allow-open/save/message/ask). " +
    "These use the system's own dialogs, and you choose which file.",
  "用默认程序打开链接": "Open links with the default application",
  "正文里点到外部链接时交给系统（opener:allow-open-url），不在 Nota 内部打开任何网页。":
    "Handing external links in the document to the system (opener:allow-open-url); no web " +
    "page is ever opened inside Nota.",
  "读你主目录下的图片（只读）": "Reading images under your home folder (read-only)",
  "你的主目录、文档、桌面、下载这四个范围里的图片文件可以被读出来显示进正文（assetProtocol.scope）。⚠️ 注意：这个范围比「你打开的那个文件夹」大——因为图片可以是任意绝对路径，界面要能把它们显示出来。只当图片读，不写、不改、不传走。":
    "Image files in your home, Documents, Desktop, and Downloads folders can be read and " +
    "shown inside the document (assetProtocol.scope). ⚠️ Note: this range is wider than " +
    "“the folder you opened” — an image can be any absolute path, and the interface has to " +
    "be able to show it. They are read as images only: never written, never changed, never " +
    "sent anywhere.",
  "界面层不能自己联网": "The interface layer cannot go online on its own",
  "内容安全策略里 connect-src 只放行自身和内部 IPC（tauri.conf.json 的 csp），所以就算界面代码被人塞了东西，它也发不出请求。":
    "The content security policy allows connect-src only for itself and internal IPC " +
    "(tauri.conf.json's csp), so even if someone slipped code into the interface, it could " +
    "not send a request.",
  "读写你打开的文件和文件夹": "Reading and writing the files and folders you open",
  "打开、编辑、保存、另存为；工作区文件夹里还会监听文件变化（inotify），用来提示「这个文件在别处被改过了」。⚠️ 只监听你打开的那个文件夹。":
    "Open, edit, save, Save As; inside a workspace folder it also watches for file changes " +
    "(inotify), to tell you “this file was changed elsewhere”. ⚠️ It watches only the folder " +
    "you opened.",
  "剪贴板": "Clipboard",
  "复制、剪切、粘贴。": "Copy, cut, and paste.",
  "起外部进程": "Starting external processes",
  "导出的那几种格式会调 pandoc（外部程序，可选装）；git 插件会调 git；强制专注响警报时会调系统提示音程序（canberra-gtk-play 或 aplay）。⚠️ 都是短命进程，用完就退，不常驻。":
    "The export formats call pandoc (an external program, optional); the Git plugin calls " +
    "git; Force Focus calls the system bell program when the alarm sounds " +
    "(canberra-gtk-play or aplay). ⚠️ All short-lived processes that exit when done; nothing " +
    "stays resident.",
  "联网（只在你明确配置过的时候）": "Networking (only when you have configured it)",
  "只有你启用的插件显式申请了 nota.http 能力、并且目标地址过了它自己的白名单，才会发出网络请求。核心功能自己不发任何请求。":
    "Only a plugin you have enabled that explicitly asks for the nota.http capability, and " +
    "only to an address that passes its own allowlist, will make a network request. The core " +
    "features themselves send nothing.",
  "强制专注用到的那三样": "The three things Force Focus uses",
  "①知道 Nota 自己这个窗口是不是当前窗口；②弹一个置顶的全屏窗口；③出声。⚠️ 就这三样，且只在你自己按下「视图 → 强制专注」之后才发生。它不读键盘、不截屏、不看别的应用。":
    "① Knowing whether Nota's own window is the active window; ② putting up a full-screen " +
    "always-on-top window; ③ making a sound. ⚠️ Those three, and only after you press " +
    "View → Force Focus. It does not read the keyboard, take screenshots, or look at other " +
    "applications.",
  "── 明确没有申请的 ──": "── What it does not ask for ──",
  "看键盘输入：没有全局快捷键、没有键盘钩子——所有快捷键都只在 Nota 自己的窗口有焦点时才收得到":
    "Reading keyboard input: no global shortcuts, no keyboard hooks — every shortcut is " +
    "received only while Nota's own window has focus",
  "截屏、录屏、读摄像头或麦克风": "Taking screenshots or recordings, or reading the camera or microphone",
  "读别的应用的窗口标题、进程列表、正在用的应用（强制专注也不看）":
    "Reading other applications' window titles, process lists, or which app is in use " +
    "(Force Focus does not look either)",
  "开机自启、装系统服务、退出后还留在后台":
    "Starting at login, installing system services, or staying in the background after you quit",
  "借 Tauri 的文件插件直接读写任意路径：`tauri-plugin-fs` 虽然装了，但 `fs:*` 一条能力都没开，界面层调不动它——读写全走我们自己的命令":
    "Reading and writing arbitrary paths through Tauri's file plugin: `tauri-plugin-fs` is " +
    "installed, but no `fs:*` permission is granted, so the interface cannot call it — all " +
    "reads and writes go through our own commands",
  "在没打开任何文件的时候去读你的盘（除了上面第 4 条那个只读的图片范围）":
    "Reading your disk while no file is open (apart from the read-only image range in item 4 " +
    "above)",
  "未经你配置就连网": "Going online without you having configured it",
};
