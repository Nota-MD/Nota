/**
 * 英文表的**第二部分**：偏好设置那几页（`ui/settings/panes/`）。
 *
 * ⚠️ 拆分的理由、以及**全部规矩**（键是原文、语体、共用的键、省略号跟着原文走）
 * 都在 `en.ts` 的文件头，动手前先读那一段。也别在这里写 `export const 英文表`。
 */

export const 设置表: Record<string, string> = {
  // ══ 偏好设置（`ui/settings/`）═════════════════════════════════════════════
  //
  // ⚠️ 这一大片**九成是"说明句"**（`help=` 那一栏、`Note` 那一段），按 vmark 的
  // 口径是 **sentence case、末尾不加句号**；带 `⚠` 的是提醒，语气照旧但不加句号。
  // 反过来，凡是**提示条 / 报错 / 空态**（"XX 失败：…"）一律是完整句子、**加句号**。

  // ── 设置对话框本身（`settings/SettingsDialog.tsx`）──────────────────────
  偏好设置: "Settings",
  设置分页: "Settings sections",
  完成: "Done",
  通用: "General",
  外观: "Appearance",
  编辑器: "Editor",
  快捷键: "Shortcuts",
  文档主题: "Document Themes",

  // ── 「外观」页（`panes/AppearancePane.tsx`）─────────────────────────────
  界面风格: "Interface style",
  界面字号: "Interface font size",
  明暗: "Light/Dark",
  浅色: "Light",
  深色: "Dark",
  缩放: "Zoom",
  "自动（推荐）": "Automatic (Recommended)",
  "按当前桌面环境自动选一套": "Pick one automatically for the current desktop environment",
  自定义: "Custom",
  字体大小: "Font size",
  "只作用于外壳（菜单、侧栏、对话框、状态栏）。正文的字号由文档主题控制。⚠️ 它也能用 Ctrl+滚轮拨——拨的是字号还是缩放，在下面「缩放」那一组里选。":
    "Affects the shell only (menus, sidebar, dialogs, status bar). " +
    "The document's text size is controlled by the document theme. " +
    "⚠️ It can also be changed with Ctrl+scroll — which of the two the wheel turns is " +
    "chosen under Zoom below.",
  "本项缩放整个界面（外壳与编辑区），而「字体大小」只缩放外壳的文字。两者相乘叠加，这是有意设计。":
    "This scales the whole interface (shell and editing area), while Font size scales " +
    "only the shell's text. The two multiply — that is intentional.",
  "按住 Ctrl 时用滚轮": "Use the scroll wheel while holding Ctrl",
  "上面那两个数都能用滚轮拨，下面选滚轮拨哪一个。":
    "Both numbers above can be turned with the wheel; pick which one below.",
  滚轮改什么: "What the wheel changes",
  "改字号时，滚轮会顺手把上面「字体大小」那一组切到「自定义」——不然那个数不算数。":
    "When it changes the font size, the wheel also switches the Font size group above " +
    "to Custom — otherwise that number would have no effect.",
  界面缩放: "Interface zoom",
  显示状态栏: "Show status bar",
  "底部显示字数 / 行列 / 时间的横条。":
    "The bar at the bottom showing word count, lines/columns and the time.",
  字数统计: "Word count",
  "每分钟阅读的字数，只用于把总字数换算成状态栏里的「约几分钟读完」，不影响其它功能。382 是中文的常见取值。":
    "Words read per minute. Used only to turn the total word count into the reading " +
    "time in the status bar; nothing else is affected. 382 is a common value for Chinese.",
  阅读速度: "Reading speed",
  深色模式: "Dark mode",
  深色下用哪套: "Which set to use in dark mode",
  跟随系统: "Follow the system",
  跟随系统偏好: "Follow the system preference",
  跟随浅色主题: "Follow the light theme",
  "用一套独立的文档主题": "Use a separate set of document themes",
  "勾选后，上面两张缩略图跟随系统的明暗设置；取消勾选则停在当前这套。":
    "When checked, the two previews above follow the system's Light/Dark setting; " +
    "when unchecked they stay on the current one.",
  "为深色模式单独指定一套文档主题。⚠ 本项只作用于文档主题这一条轴，与上面「明暗」（整个外壳的明暗）无关。":
    "Use a separate set of document themes for dark mode. ⚠ This applies to the " +
    "document-theme axis only, and has nothing to do with Light/Dark above " +
    "(that one is the whole shell).",
  主题文件夹: "Themes folder",
  "主题文件夹…": "Themes folder…",
  "打开主题文件夹。把 .css 文件放入其中即可选用。":
    "Open the themes folder. Put a .css file in it and it becomes selectable.",
  "点选一张缩略图即可切换，改动立刻生效。":
    "Click a preview to switch; the change applies immediately.",
  "当前 {0}：{1}。界面各处外观随之变化。":
    "Current {0}: {1}. The appearance of the whole interface follows.",

  // ── 「主题色」（2026-09-26）─────────────────────────────────────────────
  //
  // ⚠️ 键名 `主题色` 本身就是**显示名**（那一组的标题），所以它只有一条词条。
  // 用户 2026-09-26 的设想是"风格只管形状、颜色归用户"，这一组就是那第三条轴。
  主题色: "Accent color",
  跟随风格: "Follow the style",
  "留空即跟随当前风格——每档风格自带一个强调色（Yaru 是橙的、Adwaita 是蓝的）。选一个就覆盖它，强调色上的字用黑还是白由对比度自动决定。":
    "Leave it unset to follow the current style — each style ships its own accent " +
    "(Yaru is orange, Adwaita is blue). Pick one to override it; whether the text on " +
    "the accent is black or white is decided automatically by contrast.",
  "本项只改强调色一处，其余配色仍由上面的「明暗」决定。":
    "This changes only the accent color; the rest of the palette still comes from " +
    "Light/Dark above.",
  "（认不出「{0}」，按跟随风格处理）":
    "(Unrecognized: {0} — falling back to following the style)",
  "回到当前风格自带的强调色。": "Go back to the accent that the current style ships with.",

  // 界面风格那八套的**说明**（`hint`）。风格名（Adwaita / GitHub / Breeze /
  // macOS / Windows 11 / Windows 10 / Yaru…）本身不翻——它们是专有名词，
  // 原文就是它们。
  "GNOME 原生，扁平、层级靠阴影": "GNOME native — flat, depth from shadows",
  "紧凑、冷灰蓝边框": "Tight, cool grey-blue borders",
  "KDE Plasma 的原生语言，方正偏圆":
    "KDE Plasma's native look — square-ish with soft corners",
  "亚克力、大圆角，菜单高亮整条是蓝的":
    "Acrylic, large corner radius, a menu highlight that is a solid band of blue",
  "小圆角、Mica": "Subtle corner radius, Mica",
  "直角、亚克力，比 Windows 11 更方":
    "Square corners, Acrylic — squarer than Windows 11",
  "Ubuntu，橙色强调": "Ubuntu, orange accent",
  "Yaru 蓝": "Yaru Blue",
  "Ubuntu 的蓝色强调色档，其余同 Yaru": "Ubuntu's blue accent variant, otherwise the same as Yaru",
  // ── 用户**导入**的界面风格（2026-09-26）────────────────────────────────
  //
  // ⚠️ 加一档风格的办法是"往 `~/.config/nota/ui-styles/` 里丢一个 `<名字>.css`"，
  // 所以这一组文案是**那条路的入口说明**，不是设置项的说明。原文里的
  // `<名字>.css` 是字面写法，别翻成 `<name>.css`（文件名由用户自己起）。
  "当前用的是你导入的「{0}」，整个界面外壳随它变化。":
    "Currently using “{0}”, the style you imported. The whole interface follows it.",
  "往这个文件夹里放一个 <名字>.css，重启应用后它就出现在上面的下拉里；放一个与内置同名的文件会覆盖内置那一档。":
    "Drop a <name>.css in this folder and it shows up in the list above after a restart. " +
    "A file with the same name as a built-in style overrides that style.",
  "打开风格文件夹。放一个 <名字>.css 进去即可多出一档。":
    "Open the styles folder. Drop a <name>.css in it to add a style.",
  "风格文件夹…": "Styles folder…",
  "已覆盖": "overridden",
  "（找不到「{0}」）": "(“{0}” not found)",
  "打开风格文件夹失败：{0}": "Could not open the styles folder: {0}",
  "编辑区上方那一栏按钮（加粗、斜体、标题……）。⚠ 默认「始终不显示」：同一批命令在菜单栏里按同一套分组摆着，那一栏平时只是占地方。⚠ 选「鼠标悬停时显示」之后，鼠标移到编辑区顶端它才露出来、移开就收回去，而且**它露面时正文会往下让一条**——工具栏在文档流里，不是浮层。⚠ 三档在菜单「视图 → 格式化工具栏」里也能选，改的是同一个值。":
    "The row of buttons above the editing area (bold, italic, headings…). " +
    "⚠ Default is Never Show: the same commands sit in the menu bar under the same " +
    "grouping, so that row is usually just in the way. " +
    "⚠ With Show on Hover the row only appears when the mouse reaches the top of the " +
    "editing area, and **it pushes the document down when it appears** — the toolbar " +
    "is in the flow, not an overlay. " +
    "⚠ All three settings are also under View → Formatting Toolbar; both change the same value.",

  // ── 「文档主题」页（`panes/DocThemePane.tsx`）───────────────────────────
  当前主题: "Current theme",
  "只作用在编辑区，不影响外壳的样子。":
    "Affects the editing area only; the shell's appearance is unchanged.",
  "放入一份自定义 .css 即可使用；与内置主题重名时会覆盖内置的那一份。":
    "Drop in a custom .css to use it; a name matching a built-in theme replaces " +
    "the built-in one.",
  换主题在: "Switch themes in",
  "「主题」菜单": "the Theme menu",
  "中，那是唯一的入口，本页不提供主题选择器。要自己写一套：打开上面的文件夹，放入一个":
    " — that is the only place to switch; this page has no theme picker. " +
    "To write your own: open the folder above and drop in a",
  "，重启后就会出现在菜单里。": ", and it will appear in the menu after a restart.",
  // ── 「文档主题」页 → 正文排版那四项（`panes/DocThemePane.tsx`，2026-09-27）──
  // ⚠️ 这四项的译文口径：`follow the document theme`（跟随文档主题）、
  // `display only`（只改显示）。别翻成 `override`，用户看到的是"这一项听谁的"。
  行距: "Line height",
  "正文一行与下一行之间的距离。默认跟随文档主题。":
    "Distance from one line of body text to the next. Follows the document theme by default.",
  行距倍数: "Line-height multiple",
  "175 就是 1.75 倍行距（Word 里那个「多倍行距 1.75」）。区间 100–300。":
    "175 means 1.75× line spacing (Word's “Multiple 1.75”). Range 100–300.",
  段间距: "Paragraph spacing",
  "段落与段落之间的距离（上一块的底到下一块的顶）。默认跟随文档主题。":
    "Distance between paragraphs, from the bottom of one block to the top of the next. " +
    "Follows the document theme by default.",
  段间距大小: "Spacing size",
  "85 就是 0.85 个字号高。0 = 段落之间不留空。区间 0–300。⚠ 只管正文里的段落、引用、列表、表格；标题和代码块有自己的间距，不跟着这一项变。":
    "85 means 0.85 of one character height. 0 leaves no gap between paragraphs. " +
    "Range 0–300. ⚠ It covers only paragraphs, blockquotes, lists and tables in the " +
    "body — headings and code blocks have spacing of their own and do not follow this.",
  正文字体: "Body font",
  // ⚠️ 这个键**必须带引号**：句号 `。` 不是合法的标识符字符（同族的
  // 「换主题在」那种纯汉字的键才能裸写）。`TS1127` 就是它。
  "默认跟随文档主题。": "Follows the document theme by default.",
  字体档位: "Font family",
  "只给三档，不给填字体名：字体名拼错时浏览器不报错、只是安静地换一个——那比没有这个设置更糟。⚠ Nota 不捆绑字体，这几档点的是这台机器上装了的那些。":
    "Three choices only, no free-text font name: a misspelled name raises no error in " +
    "the browser, it just quietly substitutes another font — worse than not having the " +
    "setting at all. ⚠ Nota bundles no fonts; these choices name fonts installed on " +
    "this machine.",
  无衬线: "Sans-serif",
  衬线: "Serif",
  等宽: "Monospace",
  正文字号: "Body font size",
  "相对界面字号的大小。默认跟随文档主题。":
    "Size relative to the interface font size. Follows the document theme by default.",
  字号倍数: "Size multiple",
  "102 就是界面字号的 1.02 倍。区间 80–200。⚠ 它是相对值：在「外观」页调大界面字号，正文跟着变大——那是原本就有的行为，这一项只是另给一个覆盖值。":
    "102 means 1.02× the interface font size. Range 80–200. ⚠ It is relative: raising " +
    "the interface font size on the Appearance page already scales body text — that is " +
    "pre-existing behaviour, and this item only provides a separate override.",
  上面四项的作用范围: "Scope of the four items above",
  作用范围: "Scope",
  "它们只改编辑区里正文的样子，⚠ 一个字节都不会写进文件：源码模式、别的编辑器、导出拿到的都还是原来那些字。四项全关着时（默认）一切听文档主题的。":
    "They change how body text looks in the editing area only. ⚠ Not one byte is written " +
    "into the file: source mode, other editors and exports all still see the original " +
    "text. With all four off (the default) everything follows the document theme.",
  // ⚠️ 带全角逗号，同上面那条：得加引号。
  "只改编辑区，不动文件": "Display only — the file is untouched",
  "⚠ 深色下用的是另一套": "⚠ Dark mode uses a different set",
  浅色下用的是: "Light mode uses",
  "深色这套生效时，切回浅色看到的是这一套——两套互不影响。":
    "While the dark set is in effect, switching back to light shows this one — " +
    "the two are independent.",
  上面显示的是: "What is shown above is",
  深色专用的那一套: "the dark-mode set",
  "：现在正好是深色模式，而「外观」那一页里开着「深色模式下单独用一套主题」。切回浅色，或者去「外观」把那条关掉，这一格就会变回浅色用的那一套。":
    ": dark mode is on right now, and Appearance has “Use a separate set of document " +
    "themes for dark mode” turned on. Switch back to light, or turn that off in " +
    "Appearance, and this cell goes back to the light-mode set.",
  "菜单里换主题，换的永远是": "Switching themes from the menu always changes",
  你此刻看着的: "the set you are looking at",
  "这一套——所以现在选一套，改的是深色下用的那份，浅色的不受影响。":
    " — so picking one now changes the dark-mode set; the light set is unaffected.",
  "{0}（找不到这一套，现在按「无主题」显示）":
    "{0} (theme not found — showing No Theme instead)",

  // ── 「编辑器」页（`panes/EditorPane.tsx`）───────────────────────────────
  编辑模式: "Editing mode",
  换行符: "Line endings",
  "⚠ 只作用于新建的空文档。已经存在的文件按其原有的换行符写回——此处选 CRLF 不会使一个 LF 的旧文件整体改变（那会产生全文件级的 diff 噪音，并且改动了文件字节）。":
    "⚠ Only affects new, empty documents. Existing files are written back with their " +
    "own line endings — choosing CRLF here will not rewrite an LF file from end to " +
    "end (that would produce whole-file diff noise and change the file's bytes).",
  正文宽度: "Text width",
  "编辑区正文栏的最大宽度。过宽时阅读容易串行，一行读完难以回到行首。":
    "Maximum width of the text column in the editing area. Too wide and lines are easy " +
    "to lose track of — you cannot find the start of the next line.",
  对齐缩进: "Aligned indent",
  "子项的文字与父项首行对齐，而不是按固定宽度缩进。折行的长条目上差别很明显。":
    "Child items align with the first line of their parent instead of indenting by a " +
    "fixed width. The difference is obvious on long entries that wrap.",
  默认缩进: "Default indent",
  "⚠ 本项控制列表 / 引用 / 缩进块自动生成的缩进，不是代码块内的缩进——代码块缩进在「Markdown」页，默认 4。两者是相互独立的偏好，不合并。":
    "⚠ This controls the indent generated for lists, blockquotes and indented blocks — " +
    "not indentation inside code blocks. Code-block indentation lives on the Markdown " +
    "page and defaults to 4. The two are independent preferences and are not merged.",
  "让光标始终停在屏幕中间": "Keep the cursor in the middle of the screen",
  段首缩进: "First-line indent",
  "正文段落的第一行空出几个字符，中文排版里说的「段首空两格」。⚠ 它只是**看着**缩进，一个空格都不会写进文件——源码模式、别的编辑器、导出拿到的都还是原来那些字。":
    "Indents the first line of a body paragraph by a few characters — “leave two " +
    "spaces at the start of a paragraph” in Chinese typography. ⚠ It is display only: " +
    "not one space is written into the file, so source mode, other editors and exports " +
    "all still see the original text.",
  // ⚠️ 「缩进宽度」这四个字**不是新键**：`docs/…`「Markdown」页的代码块缩进那一格
  // 用的就是它（`Indent width`）。两处含义不同（那边是几个空格、这边是几个字符
  // 宽的段落缩进），但**标签是同一句话**，所以共用一条译文——重写一份会变成
  // 两个同名的键，那是 `TS1117`。
  "以字符为单位（一个汉字宽算一个）。只作用于正文段落：引用、列表项、表格格子、代码块里的段落都不缩——那些块自己本来就有左边距。":
    "Measured in characters (one full-width ideograph counts as one). Applies to body " +
    "paragraphs only: paragraphs inside blockquotes, list items, table cells and code " +
    "blocks are not indented — those blocks already have their own left margin.",
  拼写检查: "Spell check",
  "拼写检查由 WebKitGTK 提供，检查所用语言跟随系统，Nota 不提供「选择语言」这一项，只有一个开关。":
    "Spell check is provided by WebKitGTK and its language follows the system. " +
    "Nota offers no language picker for it — only this switch.",
  "匹配括号和引号": "Match brackets and quotes",
  "匹配 Markdown 字符": "Match Markdown characters",
  "显示当前块的 Markdown 源码": "Show the Markdown source of the current block",
  "没有选中文字时整行复制 / 剪切": "Copy/cut the whole line when nothing is selected",
  "复制纯文本时复制 Markdown 源码": "Copy Markdown source when copying as plain text",
  "输入 `**` 时自动补出后面的两个星号。⚠ 默认关闭：需要输入粗体的人要先删掉多出来的两个星号，比手动补齐多一步。":
    "Typing `**` automatically adds the closing two asterisks. ⚠ Off by default: " +
    "anyone who needs a literal `**` has to delete the extra pair first — one step " +
    "more than typing it by hand.",
  "Emoji 自动补全": "Emoji autocomplete",
  "和「视图」菜单里那三条是同一个开关，改哪边都一样。":
    "The same switch as the three items in the View menu — changing either one is the same.",

  // ── 「导出」页（`panes/ExportPane.tsx`）─────────────────────────────────
  //
  // ⚠️ 那一段 `Note` 被 `<strong>` 断成六截（`不` / `不会` 各自被加粗），
  // 拼起来是一句话。逐截翻的时候**每一截都得能接上**——下面的译文按顺序读是：
  // "Nota can currently export **HTML** … PDF … is **not** part of this export
  //  branch. There are no Word / EPUB / LaTeX formats here either, and it
  //  does **not** ship a built-in Pandoc — …"
  默认导出文件夹: "Default export folder",
  "自动（跟当前文档所在的目录）": "Automatic (the current document's folder)",
  "留空表示自动，使用当前文档所在的目录。填入路径后，每次导出都写入该目录。":
    "Empty means automatic — the folder of the current document. Once a path is set, " +
    "every export writes there.",
  "选择…": "Choose…",
  "尚未实现：目录选择器未接通，暂时需在左侧手动填写路径。":
    "Not implemented yet: the folder picker is not wired up, so type the path in by hand for now.",
  导出之后: "After exporting",
  打开导出文件所在的目录: "Open the folder the exported file goes into",
  "导出完成后，用系统文件管理器打开该目录。":
    "When the export finishes, open that folder in the system file manager.",
  "Nota 目前能导出": "Nota can currently export",
  "（带样式和不带样式两种），上面这两条对它俩都生效。PDF 走「文件 → 打印」另存，":
    "(with and without styles), and both settings above apply to both. PDF goes through " +
    "File → Print and Save As, which is",
  不: "not",
  "在导出这一支里。这里没有 Word / Epub / LaTeX 那些格式，也":
    "part of this export branch. There are no Word / EPUB / LaTeX formats here either, and it",
  不会: "does not",
  "内置 Pandoc——一个背后没有 Pandoc 的「Pandoc 路径」输入框，只会让人以为该功能可用，而实际不起作用。":
    "ship a built-in Pandoc — a “Pandoc path” box with no Pandoc behind it only makes " +
    "people think the feature is available, while it does nothing.",

  // ── 「文件」页（`panes/FilesPane.tsx`）──────────────────────────────────
  启动选项: "Startup",
  "启动 Nota 时先做什么。": "What to do first when Nota starts.",
  打开空白文档: "Open a blank document",
  打开上次的文件夹: "Open the last folder",
  恢复上次打开的文件: "Restore the last open files",
  自动保存: "Auto Save",
  "保存 & 恢复": "Saving & Recovery",
  切换文件时自动保存: "Auto Save when switching files",
  "切到另一个标签页之前，先把这个文件的改动写盘。⚠️ 点标签、开文件、新建文档都算「切页」；关文档不算——那一条自己有「保存并关闭」，而且用户选的若是「丢弃并关闭」，这里再去存一次就是把他的选择反着做。":
    "Write this file's changes to disk before switching to another tab. ⚠️ Clicking a " +
    "tab, opening a file and creating a document all count as switching; closing a " +
    "document does not — that one has its own “Save and Close”, and if the user chose " +
    "“Discard and Close”, saving here would undo their choice.",
  "关闭前先问我": "Ask me before closing",
  "30 秒": "30 seconds",
  "1 分钟": "1 minute",
  "5 分钟": "5 minutes",
  "停止输入这么久之后，把改动写回原文件。⚠️ 落盘走的是和 Ctrl+S 同一条路（含「存盘前先强制同步一次编辑器」那一步），所以自动存出来的字节和手动存完全一样；写盘失败会照常弹提示条，只是成功那一下不弹（不然每半分钟打断一次）。":
    "Write changes back to the file after this much idle typing. ⚠️ It goes to disk " +
    "through the same path as Ctrl+S (including the “sync the editor first” step), so " +
    "the bytes are identical to a manual save; a failed write still shows a toast — " +
    "only the success case stays silent (otherwise it would interrupt every half minute).",
  "上面两档自动保存": "The two Auto Save settings above",
  "是能用的": "do work",
  "：到点真的写盘（`Ctrl+S` 那条路）， 写不进去会报出来。":
    ": it really writes to disk when the time comes (the Ctrl+S path), and a failed " +
    "write is reported.",
  "还欠着的只剩这一条：": "Only one item is still missing:",
  "「恢复未保存的草稿」": "“Restore unsaved drafts”",
  "恢复未保存的草稿": "Restore unsaved drafts",
  "恢复草稿": "Restore drafts",
  "把上一次异常退出时留下的、还没写盘的内容找回来。":
    "Bring back the content left over from a crash that never made it to disk.",
  // ⚠️ 这段在 2026-09-27 改过一次：原来写的是"下面这两条"（草稿 + 清除记录），
  // 那天接上了最近文件那一族，「清除历史文件记录」不再是欠账，所以这句话和
  // 它下面两句一起改了。**旧的那三句在这个文件里已经删掉**——留着的话它们会
  // 被这道闸算成"废键"（代码里再也找不到那句原文），而那种 FAIL 是**对的**：
  // 它正是在说"这条译文已经没有对应的界面文字了"。
  "「最近打开」那份列表也已经建起来了（侧栏「文档列表」页、文件菜单那一层、主页那一块都读它），所以「清除历史文件记录」现在真的清得掉。":
    "The “recent files” list is in place too (the “Document List” page in the sidebar, " +
    "the menu under File, and the block on the home screen all read it), so “Clear recent " +
    "files history” really does clear it now.",
  "要先有一份\"写盘之前留的底\" ——现在的自动保存是直接往原文件写，写成了就没有草稿可恢复。":
    "needs a “copy kept before writing to disk” first — Auto Save currently writes " +
    "straight to the original file, so once it is written there is no draft to restore.",
  "清除历史文件记录": "Clear recent files history",
  "清除记录": "Clear records",
  "清掉「最近打开」那一份列表。只清记录，不碰文件本身。":
    "Clear the “recent files” list. Only the records — the files themselves are untouched.",
  "尚未实现：这一项要在写盘之前**另外留一份底**，而现在的自动保存是直接往原文件写——写成了就没有草稿可言了。现状见本组末尾的说明。":
    "Not implemented yet: this needs a **separate copy** made before writing to disk, " +
    "while Auto Save currently writes straight to the original file — once written " +
    "there is no draft left. See the note at the end of this group.",
  "记录历史文件和文件夹": "Remember recent files and folders",
  显示哪些文件: "Which files to show",
  "只显示 Markdown 和纯文本": "Show only Markdown and plain text",
  全部显示: "Show all",
  显示隐藏文件: "Show hidden files",
  "选「全部显示」时，一个 node_modules 目录即可让树中充满无关条目，因此默认只显示 Markdown 和纯文本。":
    "With Show all, a single node_modules folder can fill the tree with irrelevant " +
    "entries, so the default is Markdown and plain text only.",
  "只管侧栏那棵树显示什么，不改磁盘上的任何东西。":
    "Only affects what the sidebar tree shows; nothing on disk is changed.",
  "文件树 / 文件库": "File tree / library",
  允许折叠和展开: "Allow collapsing and expanding",
  "侧栏大纲树中的标题能否折叠、展开。关闭后大纲树始终完全展开，条目较多时需连续滚动才能找到目标。":
    "Whether headings in the sidebar outline can be collapsed and expanded. When off, " +
    "the outline is always fully expanded and you have to scroll to find anything in " +
    "a long list.",
  拖放: "Drag and Drop",
  "把一个文件或文件夹拖到 Nota 窗口上时怎么办。⚠️ 图片不受这三档影响：拖一张图进来永远是插到正文的光标处。":
    "What happens when you drag a file or folder onto the Nota window. ⚠️ Images are not " +
    "affected by these three settings: dropping a picture always inserts it at the cursor.",
  "当拖入文件夹时": "When a folder is dropped",
  "在窗口里打开": "Open in this window",
  "在文件管理器里打开": "Open in the file manager",
  "当拖入 Markdown 文件时": "When a Markdown file is dropped",
  "当文本文件打开": "Open as a text file",
  "当拖入可导入的文件时": "When an importable file is dropped",
  "什么也不做": "Do nothing",
  "既不是 Markdown、也不是文本的文件（.docx / .epub / .pdf 这类）。⚠️ Nota 不做格式转换——这一档只决定文本文件要不要打开、别的文件要不要说一句。":
    "Files that are neither Markdown nor plain text (.docx / .epub / .pdf and similar). " +
    "⚠️ Nota does not convert formats — this setting only decides whether text files get " +
    "opened and whether the others get a word of explanation.",
  默认扩展名: "Default extension",
  "新建文档存盘时使用的扩展名。⚠ 只影响新建的文档——已有文件名的文件保持其原有扩展名。":
    "Extension used when saving a new document. ⚠ Only affects new documents — " +
    "files that already have a name keep their own extension.",

  // ── 「通用」页（`panes/GeneralPane.tsx`）───────────────────────────────
  界面语言: "Interface language",
  语言: "Language",
  "⚠️ 重启后生效。理由：插件在启动时按这个语言读好了自己的文案表（lang/<tag>.toml），运行中换语言就得把所有插件重新装一遍（跑 on_unload / on_load，里面有 git、有 HTTP）。改完这里，重启一次。":
    "⚠️ Takes effect after a restart. Because plugins read their own text tables " +
    "(lang/<tag>.toml) at startup, switching language while running would mean " +
    "reinstalling every plugin (running on_unload / on_load, some of which do git " +
    "and HTTP). Change this, then restart once.",
  "「自动」= 跟系统走（看 LC_ALL / LC_MESSAGES / LANG）。⚠ 系统语言不在支持列表里时落到英语。":
    "“Automatic” follows the system (LC_ALL / LC_MESSAGES / LANG). ⚠ A system " +
    "language that is not in the list falls back to English.",
  "自动（跟系统走）": "Automatic (follow the system)",
  "现在实际在用：{0}（这一格存的是设定，可能是「自动」）":
    "In use right now: {0} (this cell stores the setting, which may be “Automatic”)",
  "正在读可选语言…": "Reading available languages…",
  // ⚠️ 2026-09-26：这一段原文**跟着英文表的覆盖范围一起改了**（原来写的是
  // "只覆盖插件那一面"），键也就跟着变了——旧的两条键在 `en.ts` 里已经删掉。
  英文翻译: "The English translation",
  现在覆盖整个界面: "now covers the whole interface",
  "：菜单栏、设置、状态栏、侧边栏、对话框、插件栏都在里面。两半是**同一套规矩、同一批切换**的，所以宁可两边一起换。":
    ": the menu bar, settings, status bar, sidebar, dialogs and the plugin dock are " +
    "all included. Both halves follow the same rules and switch together, so they " +
    "are always changed as a pair.",
  调试模式: "Debug mode",
  "把内部的诊断信息也输出到控制台（开发者工具的 Console）。⚠ 它只增加日志、不改变行为——任何「开着调试模式就换一套代码路径」的设计，都会让「我这里没问题」这类反馈失去可信度。默认关闭：绝大多数用户看不到控制台，只会觉得程序变卡。":
    "Also print internal diagnostics to the console (Developer Tools → Console). " +
    "⚠ It only adds logging and changes no behaviour — any design where turning " +
    "debug mode on switches to a different code path makes “works for me” reports " +
    "worthless. Off by default: most users never open the console and would only " +
    "notice the app feeling slower.",
  "高级设置": "Advanced",
  设置文件: "Settings file",
  "Nota 的设置就是一份纯文本的 TOML，没有第二套界面。要改界面上没有的项，直接编辑那个文件；改坏之后用下面那颗按钮恢复出厂状态。":
    "Nota's settings are a plain-text TOML file — there is no second interface. To " +
    "change an option the UI does not expose, edit that file; if you break it, use " +
    "the button below to restore the defaults.",
  恢复出厂设置: "Reset to Defaults",
  恢复默认: "Reset",
  "把所有设置项一次性恢复为默认值。⚠ 只修改设置，不改动文档——正文、文件、主题 CSS 都不受影响。":
    "Reset every setting to its default at once. ⚠ Settings only — documents are " +
    "untouched, including their content, files and theme CSS.",
  "改完存盘、重启 Nota 生效。⚠ 手动编辑时要注意：标量要写在所有 [表] 之前，写在表后面会被**悄悄忽略**（那一项照旧用默认值，不报错）。":
    "Save the file and restart Nota for changes to take effect. ⚠ When editing by " +
    "hand: scalars must come before all [tables]. A scalar placed after a table is " +
    "**silently ignored** (the default is used instead, with no error).",
  许可证: "License",
  "完整的第三方组件清单、各自的版本与许可证在仓库根目录的":
    "The complete list of third-party components, with versions and licenses, is in",
  "里。Nota": "at the root of the repository. Nota",
  不发任何网络请求: "makes no network requests",
  "，没有遥测，也没有激活。": ", has no telemetry, and needs no activation.",
  界面图标: "Interface icons",
  "BSD-2-Clause（Folio，同一作者）": "BSD-2-Clause (Folio, same author)",
  对话框: "Dialogs",
  "这里没有「重置全部警告提示对话框」：那需要有「点过不再提示」的记录，而 Nota 目前还没有一个可静音的对话框。等真的出现可静音对话框之后再补，现在放一颗按了没反应的按钮，比没有更糟。":
    "There is no “Reset all warning dialogs” here: that would need a record of " +
    "“don't show again” choices, and Nota has no mutable dialog yet. It will be added " +
    "once one exists — a button that does nothing is worse than no button.",
  "键位一览在左边的": "The list of key bindings is on the",
  "那一页——它是从菜单里读出来的，所以不会和菜单上写的对不上。":
    " page on the left — it is read from the menu, so it cannot disagree with the menu.",
  这一页: "This page",
  有意: "deliberately",
  "少了三项：许可证信息（见上面「许可证」那一组）、匿名使用数据（不做遥测）、在线服务器设置（Nota 不发任何网络请求）——理由逐条写在":
    "leaves out three items: license information (see the License group above), " +
    "anonymous usage data (there is no telemetry), and online server settings " +
    "(Nota makes no network requests) — each reason is written up in",
  和: "and",
  "顶上。": " at the top.",

  // ── 「图像」页（`panes/ImagePane.tsx`）─────────────────────────────────
  //
  // ⚠️ 开头那段 `Note` 也是**被 `<code>` / `<strong>` 断成六截**的同一句话，
  // 按顺序读出来是：「**This page's two halves live in two files.** The settings
  // above … are in `settings.toml`, and “General → Reset to Defaults” resets them;
  // the upload group below is in `image-upload.toml` (mode 0600 …), and is
  // **not reset** — …」
  "这一页的两半存在两个文件里。": "This page's two halves live in two files.",
  "上面那些（插入动作、适用范围、语法偏好）在":
    "The settings above (insert action, scope, syntax preferences) are in",
  "里，「通用 → 恢复出厂默认」会把它们重置；下面那一组上传设置在":
    ", and “General → Reset to Defaults” resets them; the upload group below is in",
  "里（权限 0600，因为它装着令牌），": " (mode 0600, because it holds your token), and is",
  不会被重置: "not reset",
  "——把令牌一起清掉是那种点了一下才发现的损失。":
    " — wiping the token along with everything else is the kind of loss you only " +
    "notice after clicking.",
  插入图片时: "When inserting an image",
  "⚠ 除「无特殊操作」外都会向磁盘额外写入一个文件（原图仍留在原处），因此必须显式选中，默认为「无特殊操作」。":
    "⚠ Every option except Nothing special writes an extra file to disk (the original " +
    "stays where it is), so this must be chosen explicitly — the default is Nothing special.",
  无特殊操作: "Nothing special",
  复制到当前目录: "Copy to the current folder",
  "复制到 ./assets": "Copy to ./assets",
  "复制到 ./$(filename).assets": "Copy to ./$(filename).assets",
  复制到指定路径: "Copy to a custom path",
  指定路径: "Custom path",
  "例如 /home/我/图片，或 ./img": "e.g. /home/me/Pictures, or ./img",
  "绝对路径照用；相对路径按**文档所在的目录**算（不是应用的工作目录）。⚠ 目录不存在会建出来。":
    "An absolute path is used as-is; a relative path is resolved against **the folder " +
    "the document is in** (not the app's working directory). ⚠ A missing folder is created.",
  "上面那条规则对哪些图片生效": "Which images the rule above applies to",
  "本地位置的图片": "Images from local paths",
  "网络位置的图片": "Images from web URLs",
  "默认不勾选：网络图片通常是有意引用原始地址（换一台机器打开也应当可见）。⚠ 勾上之后，插入网络图片时 Nota 会**联网把它下载下来**再放到上面那个目录——这是本应用替你去取一个你已经写在文档里的地址，但它是联网动作，所以默认关着。":
    "Off by default: a remote image usually means the original URL on purpose (so it is " +
    "still there on another machine). ⚠ When on, inserting a remote image makes Nota " +
    "**download it over the network** into the folder above — the app fetching an address " +
    "you already wrote in the document. It is a network action, so the default is off.",
  图片语法偏好: "Image syntax preferences",
  优先写相对路径: "Prefer relative paths",
  "⚠ 只朝一个方向动：你给的是一条**绝对**路径时，换算成相对文档目录的写法。本来就是相对的地址原样保留；Nota 自己复制/下载出来的那一份**总是**相对路径，不看这一项。":
    "⚠ It only goes one way: an **absolute** path you give is rewritten relative to the " +
    "document's folder. Addresses that are already relative are kept as they are; the " +
    "copy Nota makes or downloads itself is **always** relative and ignores this setting.",
  "为相对路径添加 ./": "Add ./ to relative paths",
  "⚠ 只在最终写出来的是相对路径时才有意义（已经是 ./ 或 ../ 开头的不再加）。":
    "⚠ Only meaningful when the result is a relative path (one already starting with " +
    "./ or ../ gets nothing added).",
  "插入时自动转义 URL": "Escape URLs when inserting",
  "空格变成 %20、`?` 变成 %3F 这类。⚠ 中文等非 ASCII 字符不转（转了地址就没法看了）；网络地址里的 ? # % 也不转（它们是查询串和锚点，而且你贴进来的多半已经编码好了——再转一遍会把 %20 变成 %2520）。只在插入那一刻处理，不会回头去改文档里已经写着的地址。":
    "Spaces become %20, `?` becomes %3F and so on. ⚠ Non-ASCII characters are left " +
    "alone (an escaped URL is unreadable), and so are ? # % in web addresses (they mark " +
    "query strings and anchors, and what you paste is usually already encoded — escaping " +
    "again would turn %20 into %2520). Only applied at the moment of inserting; addresses " +
    "already written in the document are never rewritten.",

  // ── 「图像」页里那一组上传设置（`panes/ImageUploadGroup.tsx`）───────────
  //
  // ⚠️ 这一组**不在 `settings.toml` 里**，存在 `~/.config/nota/image-upload.toml`
  // （0600）——所以下面那句"恢复出厂默认不会动它"是实话，别在译文里说反。
  上传服务器: "Upload server",
  "上传设置读不出来：": "Could not read the upload settings: ",
  "把图片发到一台你自己的服务器上，正文里写传回来的那条网址。⚠ 默认关着；关着的时候插入图片一个字节都不会往外发。这一组存在 ~/.config/nota/image-upload.toml（权限 0600，因为它装着你的令牌），不在 settings.toml 里——所以「恢复出厂默认」不会动它。":
    "Send images to a server of your own and put the returned URL in the document. " +
    "⚠ Off by default; while it is off, inserting an image sends nothing out. This group " +
    "lives in ~/.config/nota/image-upload.toml (mode 0600, because it holds your token), " +
    "not in settings.toml — so “Reset to Defaults” leaves it alone.",
  启用上传: "Enable upload",
  "关着的时候：插图框里不出现上传勾选框，文档的 YAML 里写什么都不传。":
    "While off: no upload checkbox appears in the image dialog, and whatever the " +
    "document's YAML says is ignored.",
  服务器地址: "Server URL",
  "https://图床.example.com/upload": "https://images.example.com/upload",
  "只认 http / https。⚠ 图片的字节会原样发到这条地址上，填之前先确认它是你自己的服务器。":
    "Only http / https. ⚠ The image's bytes are sent to this address as-is — make sure " +
    "it is your own server before filling it in.",
  上传方式: "Upload method",
  "POST（multipart/form-data）": "POST (multipart/form-data)",
  "PUT（裸字节）": "PUT (raw bytes)",
  "POST 把图当表单文件发（大多数图床这样）；PUT 直接把字节当请求体发。⚠ 网络图片只能用 POST（表单里才有地方放那条原地址），所以选了 PUT 时网络图片不会被上传。":
    "POST sends the image as a form file (what most image hosts expect); PUT sends the " +
    "raw bytes as the request body. ⚠ Remote images can only use POST (only a form has " +
    "a place for the original URL), so with PUT selected they are not uploaded.",
  文件字段名: "File field name",
  "图挂在表单的哪个字段上。各家叫法不同（file / smfile / image …），照服务方的文档填。":
    "Which form field the image goes into. Hosts differ (file / smfile / image …) — " +
    "check your provider's docs.",
  请求头: "Request headers",
  一行一条: "One per line",
  "。令牌写这儿，例如": ". Put the token here, for example",
  "。空行和": ". Blank lines and lines starting with",
  "开头的行忽略。": " are ignored.",
  "Authorization: Bearer 你的令牌": "Authorization: Bearer your-token",
  "⚠ 值只允许 ASCII：出现中文会被 HTTP 客户端整条拒掉，而它报的是一句英文。⚠ Content-Type / Content-Length / User-Agent 这三个 Nota 自己会写，别在这儿重复填——填了会以你的为准，而长度拿不准的那种请求很多服务器不收。":
    "⚠ Values must be ASCII: a non-ASCII character makes the HTTP client reject the whole " +
    "request, and the error it reports is in English. ⚠ Nota writes Content-Type / " +
    "Content-Length / User-Agent itself — do not repeat them here. Anything you put in " +
    "wins, and many servers reject requests whose length is uncertain.",
  从回话里取地址: "Read the URL from the response",
  "服务方回的那段 JSON 里，网址在哪条路径上。留空 = 整段回话本身就是网址（纯文本接口）。":
    "Where the URL sits in the JSON the server returns. Empty = the whole response is " +
    "the URL (a plain-text endpoint).",
  "点路径，例：data.url / data.links.url / result.0.url（数组下标也认）。默认 data.url 是多数图床的形状。":
    "Dot path, e.g. data.url / data.links.url / result.0.url (array indices work too). " +
    "The default data.url matches most image hosts.",
  网络图片的字段名: "Field name for remote images",
  "插入一条网络图片时，把那条原地址当普通表单字段发过去，让服务器自己去取。留空 = 网络图片不上传（插入照旧，只是不传）。":
    "When a remote image is inserted, send its original URL as an ordinary form field " +
    "and let the server fetch it. Empty = remote images are not uploaded (they are " +
    "still inserted, just not sent).",
  "允许根据 YAML 自动上传": "Allow automatic upload via YAML",
  "文档自己的 front matter 里写着": "the document's own front matter contains",
  "时，插入的本地图片直接传上去，正文里写传回来的网址。":
    ", local images are uploaded as soon as they are inserted and the document gets " +
    "the returned URL.",
  "⚠ 这是第二道闸，不是总开关：上面「启用上传」关着时它没有作用。⚠ 网络图片永远不自动上传（那等于替你去访问一个第三方），这一条没有开关。⚠ 每次自动上传都会弹一条提示，成功了也说——因为那是把字节送出去的动作。":
    "⚠ This is a second gate, not the master switch: it does nothing while Enable upload " +
    "above is off. ⚠ Remote images are never uploaded automatically (that would mean " +
    "visiting a third party on your behalf) — there is no switch for it. ⚠ Every " +
    "automatic upload shows a toast, successful ones included — it is the action that " +
    "sends bytes out.",
  "⚠ 默认空着，而且建议先空着：填了之后，勾一下「插入后上传」就等于替你去访问那个第三方，而你此刻的动作只是「往文档里写一条地址」。":
    "⚠ Empty by default, and better left empty at first: once it is filled in, ticking " +
    "“Upload after inserting” means visiting that third party on your behalf, when all " +
    "you did was write an address into a document.",
  "这一组存在": "This group lives in",
  "（权限 0600，因为它装着你的令牌），也可以直接拿编辑器改那个文件——Nota 每次上传前都会重新读一遍，改完立刻生效。":
    " (mode 0600, because it holds your token). You can also edit that file in any " +
    "editor — Nota re-reads it before every upload, so changes take effect immediately.",
  "刚才那次没存成：": "That last save did not work: ",
  "打开设置文件所在的目录": "Open the folder holding the settings file",
  "上传默认是关着的。打开它之前先确认你要把图片发到哪台服务器上：从那一刻起，插入图片就可能把字节送出这台机器。":
    "Upload is off by default. Before turning it on, be sure which server you are " +
    "sending images to: from that moment on, inserting an image can send bytes off " +
    "this machine.",


  // ── 设置控件与快捷键页（2026-09-26 补）──────────────────────────────────
  // `primitives.tsx` 里那四个都是**可读名字**（`aria-label` / placeholder），
  // 读屏和搜索框会念出来，所以照样要翻。
  说明: "Description",
  "搜索设置": "Search settings",
  "搜索设置…": "Search settings…",
  "清空搜索": "Clear the search",

  // ⚠️ 快捷键页那条 `Note` 在 JSX 里被 `<strong>` / `<code>` 切成了**四段**，
  // 按顺序拼起来读是：「This table is **read from the menu**, so it always
  // matches what the menu says. Key bindings cannot be changed in the UI for
  // now — to change one, edit the `src/ui/commands.ts` file.」
  // ⚠️ 空格是**值的一部分**：第二段值里有个前导空格（接在 "is" 后面），
  // 第三段值**末尾**那个空格留给它后面的 `<code>`，第四段的前导空格留给
  // 它前面的 `<code>`。模板里没有 `{" "}` 可用，只能写进值里。
  "这张表是": "This table is",
  "从菜单里读出来的": " read from the menu",
  "，所以它一定和菜单上写的一致。键位暂时不能在界面上修改——要改就动 ":
    ", so it always matches what the menu says. Key bindings cannot be changed " +
    "in the UI for now — to change one, edit the ",
  " 这个文件。": " file.",


  // ── 「Markdown」页（`panes/MarkdownPane.tsx`）─────────────────────────────
  //
  // ⚠️ 这一页的下拉选项**写在组件里现建**（`HEADING` / `BULLET` / `SMART` …），
  // 不是模块级常量——理由见那边注释。所以这里的键都是源码里字面写着的。
  //
  // ⚠️ `直引号 " '` 那个键里**真的有引号**，源码写的是 `t("直引号 \" '")`；
  // 这边照同样写法转义，别"顺手"把引号去掉（去掉就是一个废键）。
  "Markdown 语法偏好": "Markdown syntax preferences",
  "只决定 Nota 生成 Markdown 时采用哪种写法，不改变已有文件中的写法。":
    "Only decides the form Nota writes when generating Markdown; files that already " +
    "exist are never rewritten",
  严格模式: "Strict mode",
  "开启后，标题的井号之后必须有空格，`# 标题` 才识别为标题。默认关闭。关闭时 `#标题` 也识别为标题：正文按标题排版，大纲与标签页同样认可，但不修改字符本身——文件中原为 `#标题`，保存后仍是 `#标题`。修改后立即重新解析当前文档，无需重启。":
    "When on, a heading's hashes must be followed by a space for `# Heading` to count. " +
    "Off by default. While off, `#Heading` counts too: the text is laid out as a heading " +
    "and the outline and tabs agree, but the characters are untouched — a file that said " +
    "`#Heading` still says `#Heading` after saving. The current document is re-parsed " +
    "immediately; no restart needed",
  标题样式: "Heading style",
  "⚠ 下划线式（Setext）仅有一级和二级，三级及以上没有对应写法，仍生成 `### 标题`。":
    "⚠ Setext covers only levels 1 and 2; from level 3 up there is no such form, so " +
    "`### Heading` is still generated",
  "ATX（## 标题）": "ATX (## Heading)",
  "下划线式（标题 + ===/---）": "Setext (heading + ===/---)",
  无序列表标记: "Bullet list marker",
  "* 星号": "* Asterisk",
  "- 连字符": "- Hyphen",
  "+ 加号": "+ Plus",
  有序列表标记: "Ordered list marker",
  "Markdown 扩展语法": "Markdown extensions",
  "关闭某一项后，对应的写法按普通文字显示；文件内容不发生变化，只是不再识别该语法。":
    "Turning one off shows that syntax as ordinary text; the file is unchanged, the " +
    "syntax is simply no longer recognized",
  自动识别链接: "Autodetect links",
  "`https://…` 这种裸地址直接变成可点的链接。":
    "A bare address like `https://…` becomes a clickable link",
  内联公式: "Inline math",
  "`$LaTeX$`。⚠ 与下方「公式」组中的同一项共用开关。":
    "`$LaTeX$`. ⚠ Shares one switch with the same item in the Math group below",
  下标: "Subscript",
  "`H~2~O`。": "`H~2~O`",
  上标: "Superscript",
  "`X^2^`。": "`X^2^`",
  高亮: "Highlight",
  "`==重点==`。": "`==highlighted==`",
  "GitHub 警报框": "GitHub alerts",
  "`> [!NOTE]` / `> [!WARNING]` 这一套写法，渲染为带底色的提示框。⚠ 不属于 CommonMark：用其它 Markdown 编辑器打开时显示为普通引用块。":
    "The `> [!NOTE]` / `> [!WARNING]` family, rendered as a tinted callout box. " +
    "⚠ Not part of CommonMark: other Markdown editors show it as an ordinary quote block",
  图表: "Diagrams",
  "序列图、流程图、Mermaid。⚠ 图形需即时渲染，正文很长时初次滚动会有轻微卡顿。":
    "Sequence diagrams, flowcharts, Mermaid. ⚠ Diagrams render as you go, so the first " +
    "scroll through a long document can stutter slightly",
  "三个档位都不修改文档中已有的字符，区别只在何时转换：「仅显示时转换」不写入任何字节，保存后仍是 `--`；「输入时转换」只作用于正在输入的字符，效果等同于输入法的自动更正。打开旧文件并在保存时改写其中全部 `--` 的行为不在实现范围内。":
    "None of the three changes characters already in the document; they differ only in " +
    "when the conversion happens: Convert for display only writes no bytes at all, so " +
    "`--` is still `--` after saving; Convert as you type applies only to what you are " +
    "typing, like an input method's autocorrect. Rewriting every `--` in an old file on " +
    "save is out of scope",
  模式: "Mode",
  "仅显示时转换（存盘内容不动）": "Convert for display only (file unchanged)",
  输入时转换: "Convert as you type",
  智能引号: "Smart quotes",
  双引号的字形: "Double-quote glyph",
  "⚠ 仅提供两档。其它语区（英文 / 法文 / 德文）的引号字形尚未实现，记在 `docs/10-feature-matrix.md` 的待办表中。":
    "⚠ Only two forms are offered. Quote glyphs for other locales (English / French / " +
    "German) are not implemented yet and are listed in the to-do table in " +
    "`docs/10-feature-matrix.md`",
  "弯引号 “ ” ‘ ’": "Curly “ ” ‘ ’",
  "直引号 \" '": "Straight \" '",
  单引号的字形: "Single-quote glyph",
  智能破折号: "Smart dashes",
  破折号的字形: "Dash glyph",
  "-- → –，--- → —": "-- → –, --- → —",
  "-- 和 --- 都 → —": "-- and --- both → —",
  "允许转换 Unicode 标点": "Allow converting Unicode punctuation",
  "解析 Markdown 时，Unicode 的引号 / 破折号也识别为 Markdown 标记。⚠ 「模式」选「关闭」时本项不生效，因此呈灰色。":
    "When parsing Markdown, Unicode quotes and dashes count as Markdown markup too. " +
    "⚠ Does nothing while Mode is Off, which is why it is greyed out",
  自动更正: "Auto-correct",
  "只认一张固定的英文错拼表（四十来条，如 `teh` → `the`），在敲下词尾空格那一下改正刚打完的那个词。⚠ 不做语法检查、不做句首自动大写、不碰中文；改正之后按一次 `Ctrl+Z` 就能退回原文。⚠ 已经写进文档的旧文字永远不改。":
    "Works from a single fixed table of about forty common English misspellings " +
    "(`teh` → `the` and the like), fixing the word you just finished the moment you " +
    "type the space after it. ⚠ It is not a grammar checker, it does not capitalise " +
    "the start of sentences, and it never touches Chinese. One `Ctrl+Z` puts the " +
    "original back. ⚠ Text already written into a document is never rewritten",
  自动更正英文错拼: "Auto-correct misspelled English words",
  "`teh` → `the`、`recieve` → `receive`、`dont` → `don't` 这一类。⚠ 触发字符只有空格与制表符，所以 `teh,` 要等你敲空格才更正。":
    "Things like `teh` → `the`, `recieve` → `receive`, `dont` → `don't`. ⚠ Only a " +
    "space or a tab triggers it, so `teh,` waits until you type a space",
  显示行号: "Show line numbers",
  "在代码块左边加一条行号装订线。⚠ 默认关闭：它会让代码文字整体右移约 40px，三五行的小代码块上不太划算。":
    "Adds a line-number gutter to the left of a code block. ⚠ Off by default: it " +
    "pushes the code text about 40px to the right, which is a poor trade on blocks " +
    "only three or five lines long.",
  自动换行: "Word wrap",
  "长行折到下一行显示。⚠ 关闭后长行不折、直接溢出到代码块外，得拖编辑区的横向滚动条才看得见后半截——Nota 把语言选择框画在代码块外面，块内横向滚动会把那个框裁掉，所以这里没有块内滚动。":
    "Long lines fold onto the next line. ⚠ With this off, long lines do not fold — " +
    "they spill out of the code block, and you have to drag the editing area's " +
    "horizontal scrollbar to see the second half. Nota draws the language picker " +
    "outside the code block, and an in-block horizontal scroll would clip it, so " +
    "there is no in-block scrolling.",
  "这几条只管所见即所得里代码块的样子，不影响存进文件的内容，也不影响导出。":
    "These affect only how code blocks look in the WYSIWYG view. They do not change " +
    "what is written to the file, and they do not affect export.",
  显示工具栏: "Show toolbar",
  "代码块下面那条「折叠 / 复制」。": "The “Collapse / Copy” strip below a code block.",
  显示语言选择框: "Show language picker",
  "代码块下面那颗语言选择框。⚠ 关掉之后仍可在源码模式里改围栏上的语言。":
    "The language picker below a code block. ⚠ You can still change the language by " +
    "editing the fence in Source mode.",
  "用 Shift+Tab 调整所选代码的缩进": "Use Shift+Tab to indent selected code",
  "选中若干行代码后按 Shift+Tab，将整块减少一级缩进。⚠ 默认关闭：该键原本用于反向切换焦点，开启后会覆盖这一行为。":
    "With a few lines of code selected, Shift+Tab removes one level of indentation from " +
    "the whole block. ⚠ Off by default: that key normally moves focus backwards, and " +
    "turning this on overrides it",
  缩进宽度: "Indent width",
  "⚠ 与「编辑器」页的「默认缩进」是两项独立设置：后者控制列表 / 引用自动生成的缩进（默认 2），本项控制代码块缩进（默认 4）。":
    "⚠ Separate from Default indent on the Editor page: that one controls the indent " +
    "generated for lists and quotes (2 by default), this one controls code block " +
    "indentation (4 by default)",
  默认语言: "Default language",
  "新建代码块预填的语言，写入 ``` 之后。留空则不写，渲染时不带语法高亮。":
    "The language pre-filled in a new code block, written after ```. Empty writes " +
    "nothing, and the block renders without syntax highlighting",
  "留空 = 不写": "Empty = write nothing",
  什么时候自动加语言: "When to add a language",
  "写 ```语言 插入代码块时": "When a ```language code block is inserted",
  从不: "Never",
  公式: "Math",
  行内公式: "Inline math",
  "`$LaTeX$`。⚠ 与上方「扩展语法」组中的同一项共用开关。":
    "`$LaTeX$`. ⚠ Shares one switch with the same item in the Extensions group above",
  "认 \\\\( \\\\) 和 \\\\[ \\\\] 定界符": "Recognize the \\\\( \\\\) and \\\\[ \\\\] delimiters",
  "除 `$…$` 之外，`\\\\( … \\\\)`（行内）与 `\\\\[ … \\\\]`（独立成行）也识别为公式。旧文档中这种写法常见。":
    "Besides `$…$`, `\\\\( … \\\\)` (inline) and `\\\\[ … \\\\]` (on its own line) also count as " +
    "math. That form is common in older documents",
  "```math 代码块当公式": "Treat ```math blocks as math",
  "physics 宏包": "physics package",
  "开启后可使用 `\\\\qty`、`\\\\dv`、`\\\\braket`、`\\\\comm` 等 physics 宏包的写法。⚠ 它会重定义 `\\\\div` / `\\\\Re` / `\\\\Im` 三个既有命令，这是 physics 宏包本身的行为，因此默认关闭。这些命令由 Nota 自行定义：数学渲染使用 KaTeX，其官方不含 physics。修改后立即重排当前文档。":
    "Turns on `\\\\qty`, `\\\\dv`, `\\\\braket`, `\\\\comm` and the rest of the physics package. " +
    "⚠ It redefines the three existing commands `\\\\div` / `\\\\Re` / `\\\\Im` — behavior of " +
    "the physics package itself, which is why it is off by default. These commands are " +
    "defined by Nota: math rendering uses KaTeX, which does not ship physics. The current " +
    "document is re-typeset immediately",
  用旧版的行内公式解析: "Use the legacy inline math parser",
  "兼容模式。⚠ 默认关闭：旧解析在 `$` 与数字相邻时容易误判，`$5 和 $6` 会被当成一个公式。仅在需要打开旧文档时开启。":
    "Compatibility mode. ⚠ Off by default: the old parser easily misreads a `$` next to " +
    "a digit, so `$5 and $6` becomes one formula. Turn it on only to open old documents",
  公式自动编号: "Number equations",
  "⚠ 默认不启用：大多数文档不使用公式编号，默认开启会在每个公式右侧多出一个 (1)。":
    "⚠ Off by default: most documents do not number equations, and turning it on adds a " +
    "(1) to the right of every one of them",
  不启用: "Off",
  "AMS 风格（只给 equation 环境编号）": "AMS style (equation environments only)",
  "复制 / 导出时给什么": "What to give when copying or exporting",
  "复制为无格式 HTML 或导出时，公式采用哪种格式。SVG 不依赖接收方的字体，在任何环境下外观一致；MathML 是文本，可被读屏器与公式编辑器识别。":
    "Which format math takes when copying as plain HTML or exporting. SVG does not " +
    "depend on the reader's fonts, so it looks the same everywhere; MathML is text and " +
    "can be read by screen readers and formula editors",
  空格与换行: "Spaces and line breaks",
  "「编辑时」与「导出与打印」是两项独立设置：这两种场合的需求常常相反，编辑时需看见已输入的空格，导出时需将其合并。":
    "While editing and When exporting or printing are two separate settings: the two " +
    "situations usually want opposite things — while editing you need to see the spaces " +
    "you typed, while exporting they need collapsing",
  首行缩进: "First-line indent",
  "中文排版习惯：每段第一行空两格。⚠ 仅为显示效果，不向正文写入空格，文件内容不发生变化。":
    "The Chinese typographic convention: the first line of every paragraph starts two " +
    "characters in. ⚠ Display only — no spaces are written into the text and the file is " +
    "unchanged",
  "编辑时显示 <br/>": "Show <br/> while editing",
  编辑时: "While editing",
  导出与打印时: "When exporting or printing",
  保留连续空格和单个换行: "Preserve consecutive spaces and single line breaks",
  保留所有空格和换行: "Preserve all spaces and line breaks",
  "按 HTML 处理（折成单个空格）": "Treat as HTML (collapse to a single space)",


  // ⚠️ 键里带引号，全角「」——它是 `GeneralPane` 里被 `<strong>` 切出来的一段。
  "「快捷键」": "Shortcuts",

  "名字: 值": "name: value",
  智能标点: "Smart punctuation",
  "「自动保存」只对存过盘的文档生效；没存过的新文档没有可写回去的地方，不在此列。":
    "“Autosave” applies only to documents that have been saved once; a new document " +
    "has nowhere to write back to, so it is not covered",
  "光标没停在命中上，先按「下一个」":
    "The cursor is not on a match — press “Next” first.",

  // ── 「编辑器」页里那两个换行符名字（2026-09-26 补）────────────────────────
  // ⚠️ 键里的 `\n` 是**字面的反斜杠加 n**（不是真换行）：源码写的是
  // `t("LF（\\n）")`，英文这边照同样写法转义。
  "LF（\\n）": "LF (\\n)",
  "CRLF（\\r\\n）": "CRLF (\\r\\n)",
  // ── 「强制专注」页（`panes/FocusPane.tsx`）────────────────────────────────
  //
  // ⚠️ 这一页是 2026-09-26 加的（用户点名要的核心功能）。它和上面那条
  // 「专注模式」（F8、收起外壳）**不是一回事**，见 `ui/commands.ts` 的注释——
  // 英文里「专注」一律 `Focus`，「强制专注」一律 `Force Focus`，别省 `Force`。
  //
  // ⚠️ 这一页的说明句偏长（它得把"这功能会干什么、不会干什么"说清楚，
  // 用户点名要的），照 `en.ts` 的口径：sentence case、末尾不加句号。
  强制专注: "Force Focus",
  账户: "Account",
  "把它想成一个账户：注意力在编辑器上时往里存，切到别处时从里扣。余额扣到零，警报就响。":
    "Think of it as an account: while your attention is on the editor you pay in, and " +
    "when you switch away it is charged out. When the balance reaches zero, the alarm sounds.",
  专注总时长: "Total focus time",
  "账户余额的上限（分钟）。存满就封顶，不能先攒两小时额度再摸两小时鱼。":
    "The cap on the account balance, in minutes. It stops there once full — you cannot " +
    "bank two hours of credit and then slack off for two hours.",
  警报时长: "Alarm time",
  "开局给多少余额（分钟）。默认权重下，这就是「一直不写，多久会响」。调到比专注总时长还大，开局就是满的。":
    "How much balance you start with, in minutes. At the default weights this is “how long " +
    "you can stop writing before it goes off”. Set it above the total focus time and you " +
    "start out full.",
  权重: "Weights",
  "一分钟专注值多少、一分钟走神赔多少。两边都是「分钟」，所以默认的 1 和 1 是等价的；把下面那条调大就是惩罚重于奖励。":
    "What a minute of focus is worth, and what a minute away costs. Both are in minutes, so " +
    "the default 1 and 1 are equivalent; raising the second one below makes the penalty " +
    "outweigh the reward.",
  "专注 1 分钟加多少": "Focus credit per minute",
  分钟: "min",
  秒: "sec",
  宽限: "Grace period",
  "刚切走多少秒不扣": "Grace before charging",
  "默认 10 秒。切出去查个词、复制一行引用都要挨一刀的话，罚得太密就等于没罚。宽限期内不欠账：过了这 10 秒才从第 11 秒开始扣。填 0 就是一失焦就扣。":
    "Default 10 seconds. If stepping out to look up a word or copy a line of quotation gets " +
    "you nicked every time, a penalty that dense is no penalty at all. Nothing is owed " +
    "during the grace period: the charge starts at second 11. Set it to 0 and the charge " +
    "starts the instant you lose focus.",
  这些应用里不算摸鱼: "These apps do not count as slacking",
  "这一条要读别的应用的名字（活动窗口的 WM_CLASS），而且只在 X11 上做得成。权衡之后没有做：这个功能的核心是「你离开没有」，不是「你去了哪儿」。":
    "This one would have to read other applications' names (the active window's WM_CLASS), " +
    "and it only works on X11. Weighed it and decided against: the point of this feature is " +
    "“did you leave”, not “where did you go”.",
  "决定不做：它要读别的应用的活动窗口，为了这个功能不值得越过应用的边界。":
    "Decided against: it would have to read other applications' active window, and this " +
    "feature is not worth crossing the application boundary for.",
  未启用: "Not enabled",
  警报: "Alarm",
  响警报: "Play the alarm",
  "在警报窗弹出的同时放一段尖锐的警报声。关掉它就是「只弹不响」——图书馆里有用。":
    "Plays a sharp alarm sound as the alarm window appears. Turning it off gives you " +
    "“popup only, no sound” — useful in a library.",
  它会用到什么: "What it uses",
  "① 知不知道 Nota 的窗口是不是当前窗口（不然没法判断你有没有走神）；② 弹出一个置顶的红色窗口（不然你已经切走了，看不见）；③ 出声。":
    "① Whether Nota's window is the active window, or it cannot tell that you have wandered " +
    "off; ② putting up a red always-on-top window, or you will not see it after switching " +
    "away; ③ making a sound.",
  "这三条只在强制专注运行期间发生，只针对 Nota 自己的窗口。Nota 不读键盘、不截屏、不碰别的程序，也不把你的任何数据发到任何地方。":
    "Those three happen only while Force Focus is running, and only concern Nota's own " +
    "window. Nota does not read the keyboard, take screenshots, touch other programs, or " +
    "send any of your data anywhere.",
  "你能随时停掉它，也能用系统工具绕开它——但那样一来，你设这个模式也就没有意义了。":
    "You can stop it at any time, and you can bypass it with system tools — but then setting " +
    "up this mode in the first place means nothing.",
  "离开 1 分钟扣多少": "Charge per minute away",
  "默认 1。调成 2 就是「写两分钟才够摸一分钟鱼」——要更狠该拧这一条，不是把警报时长调到很小。":
    "Default 1. Set it to 2 and “two minutes of writing only cover one minute of slacking” — " +
    "this is the knob to turn if you want it harsher, not a tiny alarm time.",
  "默认 1，即写 1 分钟换 1 分钟额度。":
    "Default 1, meaning one minute of writing buys one minute of credit.",
};
