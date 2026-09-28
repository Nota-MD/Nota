/**
 * 「命令 id → 实现」那张表（`App.tsx` 的 `menuHandlers`），2026-09-26 分到这里。
 *
 * # 这张表是干嘛的，以及它为什么单独一个文件
 *
 * **它是"菜单项能不能点"的唯一真相源**：表里没有的 id，菜单里就是灰的
 * （见 `ui/commands.ts` 顶上那段与 `MenuBar` 的 `disabled`）。所以**不为**了让
 * 某个条目"看着能用"而在这里塞一个只弹提示的空实现——那等于让界面撒谎。
 *
 * 从 `App.tsx` 分出来只有一个理由：那个文件当时一千行出头（`docs/09` §4 的
 * 上限）。判据与之前那几次一样——**这一块与文件里其余部分之间没有共用状态**：
 * 它只需要一批"外面的动作"，不需要任何 JSX，也不产出 `App` 要用的值。
 *
 * # 输入为什么是一个对象，而不是三十个位置参数
 *
 * 三十个参数的调用点没人读得下去；而这个接口同时也是一份**清单**：
 * 想知道"这张表能碰哪些东西"，看 [`命令表输入`] 就够了。
 *
 * # ⚠️ 依赖数组用 `Object.values(输入)`，那是**有意的**
 *
 * 原来那张显式列出来的依赖数组**漏了 `statusBarOpen`**（「视图 → 显示状态栏」
 * 那一行的判据就是它）：连着点两次「显示状态栏」，第二次用的是上一帧捕获的值
 * ——于是关掉之后**再也开不回来**。这种漏项不报错、不崩，只是某一颗菜单项
 * 忽然不听话，最难查。
 *
 * `Object.values` 把"加了一条命令、忘了把它的输入列进依赖"这件事从**可能发生**
 * 变成**不可能发生**。代价是一条纪律，写在下面第二条：
 *
 * 1. 每条命令只能读**映射进来**的东西（`输入` 上有的），别再闭包捕获本文件外的变量；
 * 2. 映射进来的每个值都必须是**身份稳定**的（`useCallback` 包过的函数、`useState`
 *    的 setter、基本类型），**不能是现写的箭头函数或对象字面量**——那会让这张表
 *    每次渲染都重建，而它的身份是给原生菜单栏用的（每次重建就重推一遍，见
 *    `ui/useMenus.ts` 顶上那条链）。
 */

import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { DocId, Settings } from "@/bridge/ipc";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import { 清除最近项 } from "@/ui/commands";
import { 最近条目id } from "@/ui/recentMenu";
import type { SidebarTab } from "@/ui/Sidebar";
import type { 缩放动作 } from "@/ui/useZoom";

export interface 命令表输入 {
  /**
   * 此刻摊着一份改动预览吗。`true` 时**整张表返回空**——用户 2026-09-26
   * 要的「预览的时候禁止操作」就靠这一个开关（见下面 `useMemo` 里那一段）。
   */
  预览中: boolean;
  /**
   * 插件声明的那些条目（`ui/pluginMenus.ts` 合成的栏）。**并进同一张表**，
   * 于是"灰不灰"的判据对插件项和普通项是同一条——没有为插件单开的分支。
   */
  插件处理: Record<string, () => void>;

  // ── 文档 ──────────────────────────────────────────────────────────────
  新建文档: () => Promise<void>;
  打开文件: () => Promise<void>;
  /**
   * 最近打开过的文件（新的在前）。**它在这里的用处只有一个**：给
   * 「打开最近文件」那层子菜单里的每一条现生成一个处理函数。
   *
   * ⚠️ 必填、不是可选的：少传的话那层子菜单里的条目**一条都不进表**，
   * 于是整层是灰的——而它明明列着文件名。那种"看得见、点不动"正是这张表
   * 要防的失效（见文件头）。
   */
  最近: readonly string[];
  /** 打开一条最近记录（`ui/useSession.ts`）。**打不开时它自己会摘掉那一条。** */
  打开最近: (路径: string) => Promise<void>;
  /** 清空整份会话（`file.clearRecent`）。**不删任何文件。** */
  清空最近: () => Promise<void>;
  打开文件夹: () => Promise<void>;
  重载文档: (id: DocId) => Promise<void>;
  /**
   * **重命名**：同一个目录下换个名字（`ui/useDocuments.ts::renameDoc`）。
   *
   * ⚠️ 与下面那条一起，是「文件」栏里**会真的动磁盘上文件**的两条——
   * 别处那几条（重载 / 保存）动的是内容，这两条动的是**文件名和位置**。
   * 它们失败时**盘上什么都没发生**（判据在 `file_move.rs`），所以这里
   * 不需要任何回滚，也不能在失败后重试一次。
   */
  重命名文档: (id: DocId) => Promise<void>;
  /** **移动**：挪到另一个目录里（文件名不变），走目录选择框。 */
  移动文档: (id: DocId) => Promise<void>;
  /** 第三个参数是"静默存"（不动标签、不弹提示），自动保存走它。 */
  保存文档: (id: DocId, 另存为?: boolean, 静默?: boolean) => Promise<boolean>;
  关闭文档: (id: DocId) => Promise<void>;
  /** 此刻活动的那一份。`null` = 没有打开的文档（那几条一律不做事）。 */
  活动文档: DocId | null;
  /** 打开偏好设置那一页（`App` 的 `setSettingsOpen`）。 */
  打开设置页: Dispatch<SetStateAction<boolean>>;

  // ── 导出 / 打印 ───────────────────────────────────────────────────────
  /** `true` = 带样式那一档。两档的差别在 `ui/useExport.ts`。 */
  导出: (带样式: boolean) => Promise<void>;
  导出为: (格式: string) => Promise<void>;
  打印: () => Promise<void>;

  // ── 编辑 ──────────────────────────────────────────────────────────────
  /** 转交一条编辑命令给编辑器（`ui/useEditorCommands.ts`）。 */
  运行: (c: EditorCommand, payload?: CommandPayload) => void;
  切查找: () => void;
  插入链接: () => Promise<void>;
  插入图像: () => Promise<void>;
  /** 打开 Emoji 选择器，选中的字符插到光标处（`ui/EmojiDialog.tsx`）。 */
  插入Emoji: () => Promise<void>;
  /**
   * 剪贴板四件。⚠️ **四个函数分开传**，不是一个 `剪贴板` 对象：那个对象每次
   * 渲染都是新的（`useClipboard` 的返回值），当依赖就等于这张表每帧重建。
   */
  剪贴板剪切: () => Promise<void>;
  剪贴板复制: () => Promise<boolean>;
  剪贴板粘贴: () => Promise<void>;
  剪贴板复制为Markdown: () => Promise<void>;

  // ── 视图 ──────────────────────────────────────────────────────────────
  /**
   * 缩放那三档（`view.zoomIn` / `view.zoomOut` / `view.zoomReset`）。
   *
   * ⚠️ **与 `剪贴板剪切` 那四件写法不一样**（那四个是拆开的、不是一个对象），
   * 差别在**身份稳不稳**：那个对象每次渲染都是新的，这只对象是 `useZoom` 里
   * `useMemo` 出来的。判据不是"看起来像不像"，是这一行。
   */
  缩放动作: 缩放动作;
  设侧栏打开: Dispatch<SetStateAction<boolean>>;
  设侧栏页: Dispatch<SetStateAction<SidebarTab>>;
  设右栏打开: Dispatch<SetStateAction<boolean>>;
  设打字机: Dispatch<SetStateAction<boolean>>;
  /** 界面那几档（状态栏 / 工具栏 / 缩放的写入口，`ui/useChromeVisibility.ts`）。 */
  设界面: (patch: Partial<Settings["appearance"]>) => void;
  /** 状态栏此刻显示着吗。⚠️ 它是 [`命令表输入`] 存在的理由之一，见文件头。 */
  状态栏开着: boolean;
  /**
   * 菜单栏此刻显示着吗。**同上面那一条**——`view.menuBar` 那条命令是"取反再
   * 写回"，读的必须是**这一帧**的值，不能靠闭包捕获（理由见文件头那段：
   * 捕获上一帧的值会让"连着点两次"的第二次按同一个方向再来一次，于是关掉
   * 之后再也开不回来）。
   */
  菜单栏开着: boolean;
  /**
   * 严格模式（`Settings.strict_markdown`）。只有「内容目录」用得上。
   *
   * ⚠️ 它进这张表而不是进编辑器实例：编辑器**不知道**这个设置（`create.ts`
   * 的选项里没有它），而目录要拿它决定"`#标签` 算不算标题"——侧栏「大纲」
   * 那一页拿的是同一份真值，两处必须同源（理由见
   * `create-types.ts::CommandPayload.strict`）。
   */
  严格模式: boolean;
  切换专注: () => void;
  /**
   * 「视图 → 强制专注」。⚠️ 与上面那个 `切换专注` **是两件事**：
   * 那个收拾界面，这个记账（`commands.ts` 里那两条的注释）。
   */
  切换强制专注: () => void;
  切换全屏: () => void;
  /**
   * 窗口那两件（`ui/useWindowControls.ts` 的出口）。
   *
   * ⚠️ 传的是**那两个函数本身**、不是 `() => void 切换置顶()` 这种现场包一层：
   * 包的箭头每帧换身份，而这张表的依赖是 `Object.values(输入)`——表就会每帧重建。
   * 下面表里那个 `() => void 切换置顶()` 是**建表时**写进去的，不在此列。
   */
  切换置顶: () => Promise<void>;
  开开发者工具: () => Promise<void>;
  /** 写设置（先改内存再落盘，失败回滚，见 `App.tsx` 那一段）。 */
  改设置: (patch: Partial<Settings>) => Promise<void>;

  // ── 帮助 ──────────────────────────────────────────────────────────────
  关于: () => void;
}

/**
 * 那张表。返回值的身份**只随输入变**——原生菜单栏按它判"要不要重推一遍"。
 */
export function useCommandTable(输入: 命令表输入): Record<string, () => void> {
  // ⚠️ 名字在这一层对齐回原来的短名（`输入.新建文档` → `newDoc`），为的是
  // 下面那张表**一字节不改地搬过来**：那份 diff 里除了"从哪儿取"以外没有别的
  // 改动，读的人不必逐行核对有没有抄错。
  const {
    预览中,
    插件处理,
    新建文档: newDoc,
    打开文件: openViaDialog,
    打开文件夹: openFolder,
    最近,
    打开最近,
    清空最近,
    重载文档: reloadDoc,
    重命名文档: renameDoc,
    移动文档: moveDoc,
    保存文档: saveDoc,
    关闭文档: closeDoc,
    活动文档: activeId,
    打开设置页: setSettingsOpen,
    导出,
    导出为,
    打印,
    运行: run,
    切查找,
    插入链接,
    插入图像,
    插入Emoji,
    剪贴板剪切,
    剪贴板复制,
    剪贴板粘贴,
    剪贴板复制为Markdown,
    缩放动作,
    设侧栏打开: setSidebarOpen,
    设侧栏页: setSidebarTab,
    设右栏打开: setDockOpen,
    设打字机: setTypewriter,
    设界面: setChrome,
    状态栏开着: statusBarOpen,
    菜单栏开着: menuBarOpen,
    严格模式: strictMarkdown,
    切换专注,
    切换强制专注,
    切换全屏,
    切换置顶,
    开开发者工具,
    改设置: updateSettings,
    关于: showAbout,
  } = 输入;
  /** 剪贴板四件的**局部包装**：只为让下面那张表里的写法与搬来之前一致。 */
  const 剪贴板 = { 剪切: 剪贴板剪切, 复制: 剪贴板复制, 粘贴: 剪贴板粘贴, 复制为Markdown: 剪贴板复制为Markdown };

  return useMemo<Record<string, () => void>>(() => {
    // ⚠️ 预览期间**什么都不许动**（用户 2026-09-26：「最好当预览的时候禁止操作」）。
    //
    // 这里是那个要求的**唯一开关**，因为这张表同时是两条路的判据：
    // 「灰不灰」（`ui/useMenus.ts` 的 `disabledCommands` = 表里没有的 id）与
    // 「快捷键接不接」（同一个 hook 里那个 keydown，第一句就是查这张表）。
    // 换一张空表，菜单与快捷键**一起**断掉，不需要在别处再补一份判据——
    // 那种补法迟早会漏掉一条路（漏掉的那条不报错，只是"预览开着还能存盘"）。
    //
    // ⚠️ 返回空表，**不是**"每个值换成一个空函数"：空表让菜单上如实出现**灰**，
    // 而空函数会让条目亮着、点了没反应——那就是界面撒谎（见文件头那条）。
    //
    // ⚠️ 这条只管菜单与快捷键。右侧栏、左栏、页签那三块另算（`inert`，
    // 见 `App.tsx`），它们不走这张表。
    if (预览中) return {};

    return {
      // 插件那些条目（`ui/pluginMenus.ts` 合成的栏）。**并进同一张表**，
      // 于是"灰不灰"的判据对插件项和普通项是同一条——没有为插件单开的分支。
      ...插件处理,

      "file.new": () => void newDoc(),
      "file.open": () => void openViaDialog(),
      "file.openFolder": () => void openFolder(),
      // 最近文件那层子菜单（`ui/recentMenu.ts` 在运行时合成的那几条）。
      // ⚠️ **id 是路径拼出来的**，所以只能现生成——那层的条数与内容随
      // `最近` 变，静态写不进这张表。生成用的前缀在那份文件里，这里不重拼。
      ...Object.fromEntries(最近.map((路径) => [最近条目id(路径), () => void 打开最近(路径)])),
      // ⚠️ 键取自那条菜单项**自己**（`commands.ts::清除最近项`），不在这儿
      // 重打一遍字面量：两处各写一次的话，改了一边就是"条目亮着、点了没反应"。
      [清除最近项.id]: () => void 清空最近(),
      "file.reload": () => activeId !== null && void reloadDoc(activeId),
      // ⚠️ 改的是**盘上那个文件名**，不是文档里的内容。两条都先问再动
      // （一个新名字 / 一个目录），取消时**一个字节都不写**。
      "file.rename": () => activeId !== null && void renameDoc(activeId),
      "file.move": () => activeId !== null && void moveDoc(activeId),
      "file.save": () => activeId !== null && void saveDoc(activeId),
      "file.saveAs": () => activeId !== null && void saveDoc(activeId, true),
      "file.close": () => activeId !== null && void closeDoc(activeId),
      "file.preferences": () => setSettingsOpen(true),

      // 导出：HTML 两档、打印，以及**借系统里那个 pandoc** 转的七种。
      // ⚠️ 那七种点下去**先探测**：没装就出面板说清楚，装好了直接进保存对话框
      // （判据在 `useExport.ts`，面板是 `ui/PandocPanel.tsx`）。子菜单里**仍然
      // 灰着**的只有「图片…」（要光栅渲染器）和「其他格式…」（入口未定）。
      "file.exportHtmlPlain": () => void 导出(false),
      "file.exportHtmlStyled": () => void 导出(true),
      "file.exportPdf": () => void 导出为("pdf"),
      "file.exportDocx": () => void 导出为("docx"),
      "file.exportOdt": () => void 导出为("odt"),
      "file.exportRtf": () => void 导出为("rtf"),
      "file.exportLatex": () => void 导出为("latex"),
      "file.exportEpub": () => void 导出为("epub"),
      "file.exportOpml": () => void 导出为("opml"),
      "file.print": () => void 打印(),

      "edit.undo": () => run("undo"),
      "edit.redo": () => run("redo"),
      // ⚠️ 这三件**不是** `run(...)` 转交的编辑命令，是 `ui/useClipboard.ts`
      // 里自己干的活（读选区 / 读写系统剪贴板）。接之前它们是灰的，而快捷键
      // 一直是好的——菜单上于是同时写着"按不了"和 `Ctrl+C`。接上之后
      // "看不出灰 = 按得动"这条规矩才在**整栏**成立。见那个文件的文件头。
      "edit.cut": () => void 剪贴板.剪切(),
      "edit.copy": () => void 剪贴板.复制(),
      "edit.paste": () => void 剪贴板.粘贴(),
      // ⚠️ 这一条不读选区，拿的是**整篇源码**——所以它和上面三件放在同一个
      // 文件里（同一个 hook 的出口），但不共用那条"先选中再说"的判据。
      "edit.copyAsMarkdown": () => void 剪贴板.复制为Markdown(),
      "edit.findReplace": () => 切查找(),

      "para.h1": () => run("h1"),
      "para.h2": () => run("h2"),
      "para.h3": () => run("h3"),
      "para.h4": () => run("h4"),
      "para.h5": () => run("h5"),
      "para.h6": () => run("h6"),
      "para.text": () => run("text"),
      "para.table": () => run("table"),
      "para.tableRowAbove": () => run("tableRowAbove"),
      "para.tableRowBelow": () => run("tableRowBelow"),
      "para.tableColLeft": () => run("tableColLeft"),
      "para.tableColRight": () => run("tableColRight"),
      "para.tableDelRow": () => run("tableDelRow"),
      "para.tableDelCol": () => run("tableDelCol"),
      "para.tableDel": () => run("tableDel"),
      "para.tableAlignLeft": () => run("tableAlignLeft"),
      "para.tableAlignCenter": () => run("tableAlignCenter"),
      "para.tableAlignRight": () => run("tableAlignRight"),
      "para.mathBlock": () => run("mathBlock"),
      "para.codeBlock": () => run("codeBlock"),
      "para.quote": () => run("quote"),
      "para.ol": () => run("ol"),
      "para.ul": () => run("ul"),
      "para.task": () => run("task"),
      "para.hr": () => run("hr"),
      // ⚠️ 带上 `strict`：扫标题的判据要与侧栏「大纲」同源（见 `命令表输入` 里
      // 那一段）。菜单项本身在"一个标题都没有"时是灰的（`ui/useMenus.ts` 的
      // `光标条件`），所以这里不必再判一次。
      "para.toc": () => run("toc", { strict: strictMarkdown }),
      "para.footnote": () => run("footnote"),

      "fmt.bold": () => run("bold"),
      "fmt.italic": () => run("italic"),
      "fmt.code": () => run("inlineCode"),
      "fmt.strike": () => run("strike"),
      // ⚠️ `fmt.underline` 一直列在菜单里（`accel: "Ctrl+U"`）但**这张表里
      // 没有它**，所以那一项是灰的、而 `Ctrl+U` 一直是好的——菜单上同时写着
      // "按不了"和 `Ctrl+U`。现在补上（与 `edit.cut/copy/paste` 同一类）。
      "fmt.underline": () => run("underline"),
      "fmt.highlight": () => run("highlight"),
      "fmt.superscript": () => run("superscript"),
      "fmt.subscript": () => run("subscript"),
      "fmt.link": () => void 插入链接(),
      "fmt.image": () => void 插入图像(),
      "fmt.emoji": () => void 插入Emoji(),
      "fmt.clear": () => run("clearFormat"),

      "view.toggleSidebar": () => setSidebarOpen((v) => !v),
      "view.outline": () => {
        setSidebarOpen(true);
        setSidebarTab("outline");
      },
      "view.fileTree": () => {
        setSidebarOpen(true);
        setSidebarTab("tree");
      },
      // ⚠️ 这里原来还有一条 `view.docList`（侧栏第三页「文档列表」＋
      // `Ctrl+Shift+2`）。2026-09-28 用户点名删掉那一页，这条随之删除
      // ——侧栏只有两页了（`ui/Sidebar.tsx` 文件头）。
      "view.toggleDock": () => setDockOpen((v) => !v),
      // 格式化工具栏那三档。⚠️ **不是切换，是三条各设各的**：菜单里那是一个
      // 子菜单的三条（见 `commands.ts`），点哪条就是哪档，没有"再点一下回去"
      // 这回事——三档里没有哪两档是"一对"。
      "view.toolbarAlways": () => setChrome({ toolbar: "always" }),
      "view.toolbarHover": () => setChrome({ toolbar: "hover" }),
      "view.toolbarNever": () => setChrome({ toolbar: "never" }),
      "view.statusBar": () => setChrome({ show_status_bar: !statusBarOpen }),
      // 菜单栏（2026-09-28，用户点名：「也要允许用户隐藏上栏，也就是"文件"、
      // "编辑"啥的」）。形式与上面那条一模一样——**取反再写回**。
      //
      // ⚠️ 藏下去时那条"怎么开回来"的提示**不在这里发**：它挂在
      // `ui/useChromeVisibility.ts` 里盯着 `show_menu_bar` 的跳变。挂这儿的话，
      // 从外观设置关掉（那里也有一个同名开关）就不会有提示了，而那条路
      // 恰恰更需要知道 `Alt+M`。
      "view.menuBar": () => setChrome({ show_menu_bar: !menuBarOpen }),
      // 沉浸那两条。⚠️ 直接引 `ui/useImmersive.ts` 的出口函数，不现写箭头
      // ——现写每帧换身份，这张表就每帧重建。
      "view.focusMode": 切换专注,
      // ⚠️ 和上面那条**长得像，做的事毫无关系**（一个是收界面、一个是记账）。
      // 判断逻辑在 `ui/useForceFocus.ts` 那边，这里只是转发——包括"第一次要
      // 先说清楚"那一步（`ui/useFocusIntro.ts`），它包在 `切换强制专注` 里面。
      "view.forceFocus": 切换强制专注,
      "view.typewriter": () => setTypewriter((v) => !v),
      "view.fullscreen": 切换全屏,
      // 窗口那两件（2026-09-27）。⚠️ 同上面那两条：直接引出口函数，不现写箭头。
      // ⚠️ 置顶那一条的**勾**不在这张表里算（表只管"能不能点"），判据在
      // `ui/useMenus.ts` 的 `menuChecks`，值从窗口读回来。
      "view.alwaysOnTop": () => void 切换置顶(),
      "view.devtools": () => void 开开发者工具(),
      // 缩放三档（2026-09-27）。⚠️ 三条**都不带 `needsDoc`**：缩放是应用级的，
      // 一篇文档都没打开时按 `Ctrl+=` 也该有用。
      "view.zoomIn": 缩放动作.放大,
      "view.zoomOut": 缩放动作.缩小,
      "view.zoomReset": 缩放动作.复位,

      // 三种编辑模式。⚠️ 它们和上面那些 `setXxx` 不一样：**要落盘**。
      // 模式是"下次打开还是这样"的偏好，不是本次会话的临时开关——用户切到源码
      // 模式之后关掉再开，原地回到所见即所得会让他以为设置没生效。
      // 落盘一律走 `updateSettings`（它自己先改内存再写后端，失败会回滚）。
      "view.modeWysiwyg": () => void updateSettings({ view_mode: "wysiwyg" }),
      "view.modeSource": () => void updateSettings({ view_mode: "source" }),
      "view.modeSplit": () => void updateSettings({ view_mode: "split" }),

      "help.about": () => void showAbout(),
    };
    // ⚠️ 依赖不给数组字面量，给 `Object.values(输入)`：理由在文件头那一节。
  }, Object.values(输入));
}
