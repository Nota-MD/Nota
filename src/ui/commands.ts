/**
 * 菜单栏的**骨架**：菜单怎么排、每一项叫什么、有没有快捷键。
 *
 * # 素材来源
 *
 * 逐条整理自用户 2026-09-22 提供的 6 张界面截图（清单本身按版权要求不收入仓库）。
 * 每一栏的文案、键位与顺序以本文件为唯一真相源，实际灰不灰由 `App.tsx` 的 `menuHandlers` 推。
 * **故意把尚未实现的条目也列上**——菜单栏不只是入口，
 * 它还是一张"实现进度表"，缺什么一眼看得见。
 *
 * # ⚠️ 「能不能兑现」不是这里说了算
 *
 * 本文件**不写** `implemented: true/false` 这样的标志位。判据是
 * **`App.tsx` 里有没有这个 id 的处理函数**：有就亮，没有就灰。
 *
 * 这是有意的。手写的标志位一定会腐坏——加了实现忘了翻标志、或者翻了标志
 * 实现早被删了，两种都不会报错，只会让界面撒谎。用"有没有处理函数"当判据，
 * 它就不可能不一致：**界面永远不会声称一个它做不到的能力**。
 * 派生的判据在 `App.tsx` 的 `menuHandlers` 那张表上，见那里的注释。
 *
 * # ⚠️ 这里的 `label` 是**键**，不是最终文案（2026-09-26 起）
 *
 * 这张表是**模块级常量**，import 的时候就求值了——那时语言还没定，而且求值完
 * **没有任何东西会通知它重画**（理由与 `i18n/index.ts::useT` 顶上那段同一条）。
 * 所以规矩是 **"表存键、渲染时翻"**：`label` 里写的是**英文原文**（2026-09-28 起
 * 原文是英语，此前是中文），它同时就是 `i18n/zh-*.ts` 那张中文表的键；真正显示时由渲染方各自翻一次——
 * 自绘菜单在 `ui/MenuBar.tsx` / `ui/MenuPopup.tsx`，原生菜单在 `ui/nativeMenu.ts`，
 * 快捷键一览在 `ui/settings/panes/ShortcutsPane.tsx`（都是 `t(menu.label)`）。
 *
 * ⚠️ **别在这里就地 `t("File")`**：那样写出来的是一份"import 那一刻就定死、
 * 之后再也不会变"的文案，切语言不会生效，而且不报错。
 * `tools/i18n-check.sh` 认这一点：它把这个文件里**含中文的字面量都算成键**
 *（"文案表文件"那条规则），所以上面那几处的 `t(` 变量 `)` 它数得到。
 *
 * # 为什么原文一律中文
 *
 * 菜单最初照一款外部编辑器的清单抄，那份清单**中英混杂**（"Help"整栏除
 * 最后三行外全是英文）。用户 2026-09-22 明确说过「注意不要像他一样中英混杂」。
 * 规矩：**同一门语言里不许混**——中文界面全中文、英文界面全英文。
 * 中文字面量当键只是这套写法的**入场费**（见 `i18n/en.ts` 顶上那段），
 * 不代表界面只有中文；`Markdown` / `LaTeX` / `Pandoc` 这类**专有名词**
 * 两种语言里都照写原文（它们是名字，不是词）。
 */

import type { DocThemeInfo } from "@/bridge/ipc";
import { t } from "@/i18n";

export interface MenuItemSpec {
  /** 命令 id。与 `App.tsx` 里 `menuHandlers` 的键一一对应。 */
  id: string;
  label: string;
  /**
   * 快捷键。**这是唯一的真相源**：`App.tsx` 的 `keydown` 反过来查这张表
   * （`ui/accel.ts` 的 `buildAccelIndex`），不再另写一份手链。
   *
   * ⚠️ 2026-09-23 改的。在那之前这里"只是显示"，真正的绑定在 `App.tsx` 的
   * 一条 if-else 长链里——两套真相源，且已经不一致了：「偏好设置」写着
   * `Ctrl+,` 按下去没反应，`Ctrl+Shift+N` 被 `key === "n"` 抢去当「新建」。
   *
   * 写法：`Ctrl` / `Shift` / `Alt` 三段加号连接，末段是键名。`Ctrl` 在
   * macOS 上表示 ⌘（显示时会换成 `⌘` 符号，见 `formatAccel`）。
   * 箭头键写字形 `↑` `↓`。认不出来的写法会在控制台警告、那个键位不生效。
   */
  accel?: string;
  /**
   * **右端那个字**（等宽、次要色），与快捷键占同一个位置（同 `.menu-accel`）。
   *
   * ⚠️ 2026-10-11 加，用它的目前只有状态栏那个「选择拼写检查语言」菜单：那一栏
   * 左边是语言的**本地语名字**（`Deutsch` / `Čeština`），右边是它的**短码**
   * （`DE` / `CS`）——两边都要有，因为用户可能按名字找（他认得那个词）也可能
   * 按代码找（他记得设置里写的是 `de_DE`）。形状照 Typora 那份菜单（用户点名的）。
   * ⚠️ **与 `accel` 不能同时给**：两个都占右端，同时给的话 `accel` 赢（真到了那
   * 一天得先想清楚"这一行到底要说什么"）。
   */
  right?: string;
  /** 需要有一份活动文档才可用。没文档时自动灰掉。 */
  needsDoc?: boolean;
  /** 可勾选项。当前勾没勾由 `App.tsx` 的 `checks` 给出。 */
  checkable?: boolean;
  /** 危险动作（丢改动、删东西），画红。 */
  danger?: boolean;
  /**
   * 子菜单。有它就不是"点一下执行"，而是"往右飞出一层"。
   *
   * ⚠️ 2026-09-23 重做菜单时加的。判据是**这一组条目是不是同一件事的不同
   * 参数**：导出成什么格式、复制成什么格式、表格怎么改。这些铺在一个平面
   * 菜单里会让整栏长得没法看——二十来项一路排下来，找"删掉这一列"得从头扫。
   *
   * ⚠️ **带子菜单的项自己不执行任何命令**：`id` 只是个键，不要求
   * `App.tsx` 里有对应处理函数，也不会因为这个 id 没实现而变灰
   * （灰的是子菜单**里面**那些没实现的）。判据见 `App.tsx` 的 `disabledCommands`。
   */
  submenu?: MenuEntry[];
}

export type MenuEntry = MenuItemSpec | "sep";

export interface MenuSpec {
  id: string;
  label: string;
  items: MenuEntry[];
  /**
   * 内容由运行时决定的菜单。目前只有「主题」——它的条目来自
   * `api.theme.list()`，用户装了什么就有什么，抄不进这张静态表里。
   */
  dynamic?: "themes";
}

/** 是不是一项真条目（`"sep"` 是分隔线，不是）。 */
export function isMenuItem(entry: MenuEntry): entry is MenuItemSpec {
  return entry !== "sep";
}

/**
 * 遍历所有菜单项，**含子菜单里的**，按深度优先。
 *
 * ⚠️ 存在的理由是"别漏"。`App.tsx` 要拿这张表算两件事：哪些命令该灰、
 * 哪些勾是亮的。这两件事在加子菜单之前都是**只扫一层**的 `for` 循环——
 * 一旦条目挪进子菜单，那些循环就再也看不到它们了：效果是**子菜单里的项
 * 永远不灰**（没实现也亮着，点了没反应），而勾选状态永远不正确。
 * 这类"静默漏掉一层"的 bug 不会报错，只会让界面撒谎，所以遍历收在这里一处。
 */
export function walkMenuItems(
  menus: readonly MenuSpec[],
  visit: (item: MenuItemSpec, menu: MenuSpec) => void,
): void {
  const walk = (entries: readonly MenuEntry[], menu: MenuSpec) => {
    for (const entry of entries) {
      if (!isMenuItem(entry)) continue;
      visit(entry, menu);
      if (entry.submenu) walk(entry.submenu, menu);
    }
  };
  for (const menu of menus) walk(menu.items, menu);
}

/**
 * 把用户改过的键位**叠到菜单表上**，返回一份新的表。纯函数。
 *
 * 整张键位表的真相源仍然是 `MENUS`（这份代码）；用户改过的只记**差量**
 * （设置里的 `keys.overrides`，那一节的三种取值见 `src-tauri/src/settings/keys.rs`
 * 头上那张表，这里只说叠法）：
 *
 * | 覆盖表里 | 叠法 |
 * |---|---|
 * | **没有这个 id** | 原样留着默认键位 |
 * | 有，非空 | 换成它 |
 * | 有，**空串** | **把 `accel` 整个摘掉**（这条命令不要快捷键） |
 *
 * ⚠️ **认不出的 id 静默丢弃**（覆盖表里可能留着一条已经被删掉的命令）。
 * 不报错是有意的：用户升级之后那条命令本来就不在了，为它留一条警告，
 * 他也没有任何可处理的动作。
 *
 * ⚠️ **没改过时原样返回入参**（保住引用）：`App.tsx` 那份菜单表是靠 `useMemo`
 * 的身份去喂原生菜单栏和按键索引的，每次 render 换一个新数组会让它们白重算。
 * 判据是"这一层 `if` 拿掉之后，`menus` 的引用还稳不稳"。
 *
 * ⚠️ 只按 `id` 查，**不区分顶层还是子菜单**——`walkMenuItems` 那种逐层下钻的
 * 写法在这里不需要，因为查表本身就是按 id 的，子菜单里的项和顶层的项没有区别。
 */
export function ApplyKeyOverrides(
  menus: readonly MenuSpec[],
  overrides: Readonly<Record<string, string>>,
): readonly MenuSpec[] {
  if (!Object.keys(overrides).length) return menus;

  const stackValueItem = (item: MenuItemSpec): MenuItemSpec => {
    if (!(item.id in overrides)) return item;
    const value2 = overrides[item.id];
    if (value2 === "") {
      const copy = { ...item };
      delete copy.accel;
      return copy;
    }
    return { ...item, accel: value2 };
  };

  const walkValueLayer = (entries: readonly MenuEntry[]): MenuEntry[] =>
    entries.map((e) =>
      e === "sep" ? e : { ...stackValueItem(e), ...(e.submenu ? { submenu: walkValueLayer(e.submenu) } : {}) },
    );

  return menus.map((m) => ({ ...m, items: walkValueLayer(m.items) }));
}

/** 「无主题（内置）」那一项的 id。**不是命令**，是合成出来的。 */
export const NO_THEME = "__theme-none";
/** 主题项的 id 前缀，后面跟主题 **id**（不是显示名）。 */
export const THEME_PREFIX = "__theme:";
/** 「打开主题文件夹…」那一项。同样不是命令。 */
export const THEMES_DIR = "__theme-dir";

/**
 * 「主题」菜单的内容。**动态生成**——内置的那几套和后端清单是一致的，
 * 但用户还可能往主题目录里放自己的文件，抄不进上面那张静态表里。
 *
 * ⚠️ 这里装的全是**文档主题**，一个界面主题都没有。界面风格与明暗在
 * 「偏好设置 → 外观」里（见 `ui/settings/SettingsDialog.tsx`）——用户 2026-09-23 明确
 * 要求两者分开，混在同一个菜单里正是上一版让人以为"换文档主题=换界面"的原因。
 *
 * ⚠️ 收在这里（而不是留在 `MenuBar.tsx` 里）是因为**自绘菜单和原生菜单
 * 都要用它**。留成一份私有函数的话，原生那份就得自己再造一遍 id 规则，
 * 而 id 一旦不一致，点了主题**什么都不发生**、还不报错。
 */
export function themeEntries(themes: readonly DocThemeInfo[]): MenuEntry[] {
  const items: MenuEntry[] = [{ id: NO_THEME, label: "No Theme (Built-in)", checkable: true }];

  if (themes.length) {
    items.push("sep");
    for (const th of themes) {
      // 用户放的同名文件会**盖掉**内置那套。不标出来的话，"改过的文件怎么
      // 没生效"和"删掉的文件怎么还在"都会变成查不动的问题。
      //
      // ⚠️ 后缀**在这里就翻**（`t("{0} (customized)", th.name)`），不能拼成一个
      // 中文字符串丢给渲染方——那边拿到的是 `"我的主题（已自定义）"`，整串
      // 不是表里的键，`（已自定义）` 这半句会原样留着。
      // ⚠️ 循环变量叫 `th` 不叫 `t`：那个名字被 i18n 的 `t` 占了。
      items.push({
        id: `${THEME_PREFIX}${th.id}`,
        label: th.builtin ? th.name : t("{0} (customized)", th.name),
        checkable: true,
      });
    }
  }

  // ⚠️ 这一条**编进 entries** 而不是单独渲染：那样它不参与漫游焦点，
  // 键盘用户按 End 到不了它、↑↓ 会从它头上跳过去。踩过。
  items.push("sep", { id: THEMES_DIR, label: "Open Themes Folder…" });
  return items;
}

/**
 * 「主题」菜单里哪几项该打勾。
 *
 * ⚠️ 这些 id 不在 `MENUS` 里（它们是上面合成的），所以 `App.tsx` 那张
 * `menuChecks` 覆盖不到——它只列了 `view.*`。少了这一份，
 * 菜单就**从来不显示当前用的是哪套主题**（`currentTheme` 传进来了却没处用）。
 * 判据只有这一处，自绘和原生两边都取它。
 */
export function themeChecks(
  themes: readonly DocThemeInfo[],
  current: string,
): Record<string, boolean> {
  const out: Record<string, boolean> = { [NO_THEME]: current === "" };
  for (const t of themes) out[`${THEME_PREFIX}${t.id}`] = t.id === current;
  return out;
}

/** 点中一条菜单项之后**该往哪儿走**。由 `resolvePick` 算出来，各处照办。 */
export type MenuPick =
  | { kind: "command"; id: string }
  | { kind: "theme"; id: string }
  | { kind: "themes-dir" };

/**
 * 一个 id 是命令，还是主题那三条合成项之一。
 *
 * ⚠️ 收在这里的理由同 `themeEntries`：自绘菜单和原生菜单都得做同一个判断。
 * 各写一份的话，某天改了前缀而漏改一边，症状是"点主题没反应"——
 * 而这个仓库里"点了没反应"式的失效已经记过好几条了（`docs/07`）。
 */
export function resolvePick(id: string): MenuPick {
  if (id === NO_THEME) return { kind: "theme", id: "" };
  if (id === THEMES_DIR) return { kind: "themes-dir" };
  if (id.startsWith(THEME_PREFIX)) return { kind: "theme", id: id.slice(THEME_PREFIX.length) };
  return { kind: "command", id };
}

/**
 * 「最近文件」那一层子菜单**末尾那一条**（`ui/recentMenu.ts` 把它拼进去）。
 *
 * ⚠️ 它**住在这里，而不是住在合成它的那个文件里**，理由是 `tools/i18n-check.sh`：
 * 那个脚本按**整个文件**认"这一份里含中文的字面量都是给人看的字"（它维护着
 * 一张 `文案表文件` 名单，本文件在名单里）。把这条标签写在 `ui/recentMenu.ts`
 * 里的话，它**数不到**，于是 `zh-ui.ts` 里那条中文会被判成"废键"——一条明明
 * 生效的翻译被当成垃圾，正是那条规则要防的失效。
 *
 * ⚠️ 它的 `id` 是**真命令**（`ui/useCommandTable.ts` 里有实现），与上面
 * 「打开最近文件」那个占位项不同——那个是"表存键"的位置标记，没有实现。
 */
export const clearRemoveRecentItem: MenuItemSpec = { id: "file.clearRecent", label: "Clear Recent Files" };

export const MENUS: MenuSpec[] = [
  {
    id: "file",
    label: "File",
    items: [
      { id: "file.new", label: "New", accel: "Ctrl+N" },
      { id: "file.newWindow", label: "New Window", accel: "Ctrl+Shift+N" },
      "sep",
      { id: "file.open", label: "Open…", accel: "Ctrl+O" },
      { id: "file.openFolder", label: "Open Folder…" },
      // ⚠️ **快速打开让出了 `Ctrl+P`**（2026-10-16）：用户点名「打印默认快捷键是
      // Ctrl+P」，而 `Ctrl+P` 早被这一条占着。打印是**文档级**的动作、通用约定
      // 就是 `Ctrl+P`；快速打开挪到 `Ctrl+Shift+P`（另一套常见约定）。
      { id: "file.quickOpen", label: "Quick Open…", accel: "Ctrl+Shift+P" },
      { id: "file.recent", label: "Open Recent File" },
      { id: "file.reload", label: "Reload from Disk", needsDoc: true },
      "sep",
      { id: "file.save", label: "Save", accel: "Ctrl+S", needsDoc: true },
      { id: "file.saveAs", label: "Save As…", accel: "Ctrl+Shift+S", needsDoc: true },
      { id: "file.saveAll", label: "Save All Open Files…" },
      "sep",
      { id: "file.rename", label: "Rename…", needsDoc: true },
      { id: "file.move", label: "Move to…", needsDoc: true },
      { id: "file.revealInFolder", label: "Open File Location…", needsDoc: true },
      { id: "file.showInSidebar", label: "Reveal in Sidebar", needsDoc: true },
      { id: "file.delete", label: "Delete…", needsDoc: true, danger: true },
      "sep",
      {
        // ⚠️ 这一项**自己不执行任何命令**，`file.import` 只是个键。
        // 导入格式有一整排（Word (.docx) / RTF / LaTeX / Epub…），
        // 铺在「文件」里会把这一栏撑成一条长龙——收进飞出层。
        id: "file.import",
        label: "Import",
        submenu: [
          { id: "file.importDocx", label: "Word (.docx)…" },
          { id: "file.importRtf", label: "RTF…" },
          { id: "file.importLatex", label: "LaTeX…" },
          { id: "file.importEpub", label: "EPUB…" },
          { id: "file.importOdt", label: "OpenDocument (.odt)…" },
        ],
      },
      {
        id: "file.export",
        label: "Export",
        submenu: [
          { id: "file.exportPdf", label: "PDF…", needsDoc: true },
          { id: "file.exportHtmlPlain", label: "HTML (No Styles)…", needsDoc: true },
          { id: "file.exportHtmlStyled", label: "HTML (With Styles)…", needsDoc: true },
          "sep",
          { id: "file.exportDocx", label: "Word (.docx)…", needsDoc: true },
          { id: "file.exportOdt", label: "OpenDocument (.odt)…", needsDoc: true },
          { id: "file.exportRtf", label: "RTF…", needsDoc: true },
          { id: "file.exportLatex", label: "LaTeX…", needsDoc: true },
          { id: "file.exportEpub", label: "EPUB…", needsDoc: true },
          { id: "file.exportOpml", label: "OPML…", needsDoc: true },
          "sep",
          { id: "file.exportImage", label: "Image…", needsDoc: true },
        ],
      },
      { id: "file.print", label: "Print…", accel: "Ctrl+P", needsDoc: true },
      "sep",
      { id: "file.preferences", label: "Settings…", accel: "Ctrl+," },
      "sep",
      { id: "file.close", label: "Close", accel: "Ctrl+W", needsDoc: true },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    items: [
      { id: "edit.undo", label: "Undo", accel: "Ctrl+Z", needsDoc: true },
      { id: "edit.redo", label: "Redo", accel: "Ctrl+Y", needsDoc: true },
      "sep",
      { id: "edit.cut", label: "Cut", accel: "Ctrl+X", needsDoc: true },
      { id: "edit.copy", label: "Copy", accel: "Ctrl+C", needsDoc: true },
      { id: "edit.copyImage", label: "Copy Image", needsDoc: true },
      { id: "edit.paste", label: "Paste", accel: "Ctrl+V", needsDoc: true },
      // 「粘贴为纯文本」（`Ctrl+Shift+V`，2026-10-07）。⚠️ **本仓的粘贴本来就是
      // 纯文本**：剪贴板那条路读的是 `readText()`，插进来的是
      // `insertText` → PM 的 `pasteText`（`ui/useClipboard.ts`）；之所以
      // "按 `Ctrl+V` 粘进来的是纯文本"，是因为 Milkdown 的剪贴板插件**没有**
      // 定义 `clipboardParser`（只定义了 `handlePaste` 与序列化那一半）。
      // 所以这一条与上面那条**走的是同一段代码**——不是偷懒，是如实：
      // 真给 `Ctrl+Shift+V` 另写一条"剥格式"的路，剥的就是一个本来就不存在
      // 的东西。⚠️ 留着它是因为**这颗键是肌肉记忆**（Word/VSCode/浏览器都
      // 有），而用户按了没反应会当成"不支持粘贴纯文本"。
      { id: "edit.pastePlain", label: "Paste as Plain Text", accel: "Ctrl+Shift+V", needsDoc: true },
      // 2026-10-04 补（右键菜单那一排图标里的 🗑）。它**不是**为右键菜单
      // 单开的暗路：编辑菜单里也看得见——Typora 的编辑菜单里同样有 Delete。
      //
      // ⚠️ **故意不给 `accel`**。`Delete` / `Backspace` 这两个键 ProseMirror
      // 自己已经处理得很好（选中一段按 Delete 就是删掉它），再在 `MENUS` 里
      // 绑一遍等于**同一条路两个实现**：命令表那条会先跑，于是"按 Delete 删
      // 一个字"这种最基础的手感要由我们负责，而 ProseMirror 那套（合并相邻
      // 段落、列表项降级、表格里删单元格…）才是真正对的那个。菜单里点得动
      // 就够了，键位上让编辑器自己说了算。
      { id: "edit.delete", label: "Delete", needsDoc: true },
      "sep",
      {
        // ⚠️ 「复制为 Markdown」那条 **id 没变**，只是从平面挪进了这里。
        // 挪动时最容易出的错是把 id 一起改了——`App.tsx` 那张表是按 id 认的，
        // 改了 id 就等于把已实现的功能重新变成灰的，而且不会报错。
        id: "edit.copyAs",
        label: "Copy As",
        submenu: [
          { id: "edit.copyAsMarkdown", label: "Markdown", accel: "Ctrl+Shift+C", needsDoc: true },
          { id: "edit.copyAsPlain", label: "Plain Text", needsDoc: true },
          { id: "edit.copyAsHtml", label: "HTML Source", needsDoc: true },
        ],
      },
      "sep",
      {
        // 「选择」这一族（2026-10-07）。⚠️ **这里原来是一条名字就叫 `Select` 的
        // 灰条**（它从来没能点动过：`useCommandTable.ts` 那张表里没有它）。
        // 现在它成了**子菜单的父项**——于是那四条各自有名字、各自有键位。
        //
        // ⚠️ 父项**不进 `useCommandTable.ts` 那张表**（它是子菜单的壳，不是命令），
        // 那条测试（`tests/context-menu.test.ts`）钉着这一点。子菜单父项的亮/灰
        // 由"有没有一条能点的孩子"决定（`ui/useMenus.ts`）。
        //
        // ⚠️ 四条 id 的名字**故意写全**（`edit.selectLine` 而不是 `edit.line`）：
        // 右键菜单那档"输入框条目"会把这几条摊平来用（见 `ui/context-menu.ts`），
        // 而那里 `edit.select` 这一条要的正是**全选**——名字含糊的那种
        //（比如只写 `Line`）在别处还有用家，会撞。
        id: "edit.select",
        label: "Select",
        submenu: [
          { id: "edit.selectLine", label: "Select Line", accel: "Ctrl+L", needsDoc: true },
          { id: "edit.selectWord", label: "Select Word", accel: "Ctrl+D", needsDoc: true },
          { id: "edit.selectSentence", label: "Select Sentence", accel: "Ctrl+E", needsDoc: true },
          { id: "edit.deleteWord", label: "Delete Word", accel: "Ctrl+Shift+D", needsDoc: true },
        ],
      },
      { id: "edit.moveLineUp", label: "Move Line Up", accel: "Alt+↑", needsDoc: true },
      { id: "edit.moveLineDown", label: "Move Line Down", accel: "Alt+↓", needsDoc: true },
      "sep",
      // ⚠️ **两条命令、一个条子**（2026-10-06，第 95 项）：`Ctrl+F` 是"找"、
      // `Ctrl+H` 是"找并替换"。⚠️ 在此之前 **`Ctrl+F` 根本没有绑定**——用户
      // 2026-10-06 的原话：「记得搞一下 ctrl f 搜索。要支持正则表达式」，
      // 而正则那半**引擎里早就有**（`editor/find.ts` 的 `FindOptions.regex` ＋
      // `编译()`，连带零宽保护与整词判据；查找条上那颗 `.*` 开关也一直在）。
      // 缺的**只是这颗键**。
      { id: "edit.find", label: "Find…", accel: "Ctrl+F", needsDoc: true },
      { id: "edit.findReplace", label: "Find and Replace…", accel: "Ctrl+H", needsDoc: true },
    ],
  },
  {
    id: "paragraph",
    label: "Paragraph",
    items: [
      { id: "para.h1", label: "Heading 1", accel: "Ctrl+1", needsDoc: true },
      { id: "para.h2", label: "Heading 2", accel: "Ctrl+2", needsDoc: true },
      { id: "para.h3", label: "Heading 3", accel: "Ctrl+3", needsDoc: true },
      { id: "para.h4", label: "Heading 4", accel: "Ctrl+4", needsDoc: true },
      { id: "para.h5", label: "Heading 5", accel: "Ctrl+5", needsDoc: true },
      { id: "para.h6", label: "Heading 6", accel: "Ctrl+6", needsDoc: true },
      { id: "para.text", label: "Body text", accel: "Ctrl+0", needsDoc: true },
      "sep",
      {
        // ⚠️ 父项**换了新 id**（`para.table` → `para.tableMenu`），而原来那个
        // `para.table` 下沉成子菜单的第一条。**不能直接拿 `para.table` 当父项**——
        // 它已经有实现（`App.tsx` 里 `run("table")`），当父项就点不动了，
        // 等于把做好的功能弄丢，而且不报错。
        id: "para.tableMenu",
        label: "Table",
        submenu: [
          // ⚠️ 标签写死了 **3 × 3**，因为**不弹框问行列数**。
          // 菜单上写「插入表格…」而点下去直接出来一张表，那个省略号就在撒谎：
          // 它承诺后面还有一个"询问参数"的步骤，而实际上没有。
          // 行列数写在标签里，用户点之前就知道会得到什么。见 `create.ts` 里
          // `table` 那一条的注释。
          { id: "para.table", label: "Insert Table (3 × 3)", needsDoc: true },
          "sep",
          { id: "para.tableRowAbove", label: "Add Row Above", needsDoc: true },
          { id: "para.tableRowBelow", label: "Add Row Below", needsDoc: true },
          { id: "para.tableColLeft", label: "Add Column Before", needsDoc: true },
          { id: "para.tableColRight", label: "Add Column After", needsDoc: true },
          "sep",
          { id: "para.tableDelRow", label: "Delete Row", needsDoc: true },
          { id: "para.tableDelCol", label: "Delete Column", needsDoc: true },
          { id: "para.tableDel", label: "Delete Table", needsDoc: true, danger: true },
          "sep",
          { id: "para.tableAlignLeft", label: "Align Left", needsDoc: true },
          { id: "para.tableAlignCenter", label: "Align Center", needsDoc: true },
          { id: "para.tableAlignRight", label: "Align Right", needsDoc: true },
        ],
      },
      { id: "para.mathBlock", label: "Math Block", accel: "Ctrl+Shift+M", needsDoc: true },
      { id: "para.codeBlock", label: "Code Block", accel: "Ctrl+Shift+K", needsDoc: true },
      "sep",
      { id: "para.quote", label: "Blockquote", accel: "Ctrl+Shift+Q", needsDoc: true },
      "sep",
      { id: "para.ol", label: "Ordered List", accel: "Ctrl+Shift+[", needsDoc: true },
      { id: "para.ul", label: "Bullet List", accel: "Ctrl+Shift+]", needsDoc: true },
      { id: "para.task", label: "Task List", accel: "Ctrl+Shift+X", needsDoc: true },
      "sep",
      { id: "para.hr", label: "Horizontal Line", needsDoc: true },
      { id: "para.toc", label: "Table of Contents", needsDoc: true },
      // 脚注（`editor/footnote.ts`）。⚠️ **没有加速键**：它一次动两处（引用 ＋
      // 文末的定义）并把光标带到文末，是"写完一段回头补注"这种动作，不在打字
      // 流的手指上；随手编一个键位就会在别的应用里按出别的东西来（与
      // `view.toolbar` 那三条同一条理由）。
      { id: "para.footnote", label: "Footnote", needsDoc: true },
      { id: "para.frontMatter", label: "YAML Front Matter", needsDoc: true },
    ],
  },
  {
    id: "format",
    label: "Format",
    items: [
      { id: "fmt.bold", label: "Bold", accel: "Ctrl+B", needsDoc: true },
      { id: "fmt.italic", label: "Italic", accel: "Ctrl+I", needsDoc: true },
      { id: "fmt.underline", label: "Underline", accel: "Ctrl+U", needsDoc: true },
      { id: "fmt.code", label: "Code", accel: "Ctrl+Shift+`", needsDoc: true },
      "sep",
      { id: "fmt.strike", label: "Strikethrough", accel: "Alt+Shift+5", needsDoc: true },
      // 三种扩展语法（`editor/inline-marks.ts`）。⚠️ **它们照旧列在这儿，
      // 与设置里那三个开关无关**：关掉的是"解析与输入"，不是这条能力，
      // 所以这里没有 `checkable`、点了也不该灰。
      //
      // ⚠️ 键位是**新定的**（Typora 那边只有高亮有键位，上标/下标没有）：
      //   高亮 `Ctrl+Shift+H`（H 就是 Highlight）；
      //   上标 `Ctrl+.` / 下标 `Ctrl+Shift+.`——这一对取自 Google Docs
      //   （那边是 `Ctrl+.` 与 `Ctrl+,`），本仓的 `Ctrl+,` 早被偏好设置占了，
      //   所以下标让给 `Ctrl+Shift+.`。上下排在一起，记起来是一条。
      { id: "fmt.highlight", label: "Highlight", accel: "Ctrl+Shift+H", needsDoc: true },
      { id: "fmt.superscript", label: "Superscript", accel: "Ctrl+.", needsDoc: true },
      { id: "fmt.subscript", label: "Subscript", accel: "Ctrl+Shift+.", needsDoc: true },
      { id: "fmt.comment", label: "Comment", needsDoc: true },
      "sep",
      { id: "fmt.link", label: "Link", accel: "Ctrl+K", needsDoc: true },
      { id: "fmt.image", label: "Image", needsDoc: true },
      // ⚠️ **没有加速键**：这一项开的是一个整屏的挑选框，打字流里用不上
      // （打字时的入口是补全面板——打出 `:smi` 就弹，见 `editor/emoji.ts`）。
      // 菜单里这一条是给"我知道要插个表情，但不知道该打哪个短代码"的人。
      { id: "fmt.emoji", label: "Insert Emoji…", needsDoc: true },
      "sep",
      { id: "fmt.clear", label: "Clear Formatting", accel: "Ctrl+\\", needsDoc: true },
    ],
  },
  {
    id: "view",
    label: "View",
    items: [
      { id: "view.toggleSidebar", label: "Toggle Sidebar", accel: "Ctrl+Shift+L", checkable: true },
      { id: "view.outline", label: "Outline", accel: "Ctrl+Shift+1", checkable: true },
      { id: "view.fileTree", label: "File Tree", accel: "Ctrl+Shift+3", checkable: true },
      // ⚠️ 这里原来还有一条 `view.docList`（「文档列表」，`Ctrl+Shift+2`）：
      // 2026-09-28 用户点名把侧栏那一页删了，这一项与它那个键位一起删
      // ——侧栏只剩两页（`ui/Sidebar.tsx` 文件头）。`Ctrl+Shift+2` 从此空着。
      { id: "view.search", label: "Search", accel: "Ctrl+Shift+F" },
      "sep",
      { id: "view.toggleDock", label: "Extension Dock", checkable: true },
      // ── 格式化工具栏：**三档，一个子菜单**（2026-09-25）──
      //
      // 用户 2026-09-25 点名要的三档（「始终显示 / 鼠标悬停时显示 / 始终不显示」，
      // 默认最后一档）。⚠️ **不能缩成一个可勾项**：中间那一档的两种状态
      //（"平时藏着"和"鼠标到顶上时露出来"）属于同一个设置值，一个勾表达不了；
      // 而做成"点一下循环到下一档"更糟——用户得按两下才知道自己在哪一档，
      // 而且每一档的手感都不一样（有一档会让正文往下跳），试错的代价不齐。
      //
      // ⚠️ 收进子菜单而不是像「编辑模式」那样摊成三条：那三条是**三个功能**
      //（摆几个窗格），这三条是**同一个设置的三个取值**——摊平会在「视图」栏里
      // 一次占掉三行，而其中永远只有一行是勾着的。
      //
      // ⚠️ **没有快捷键**：没有一个"该配哪个键"的依据，随手编一个就是让别人的手
      // 在别的应用里按出别的东西来。
      {
        id: "view.toolbar",
        label: "Formatting Toolbar",
        submenu: [
          { id: "view.toolbarAlways", label: "Always Show", checkable: true },
          { id: "view.toolbarHover", label: "Show on Hover", checkable: true },
          { id: "view.toolbarNever", label: "Never Show", checkable: true },
        ],
      },
      // ── ⚠️ 下面这两条**从下面那一段挪上来了**（2026-10-04，第 49 项）──
      //
      // 它们原先挨着 `view.typewriter`（"状态栏"夹在「打字机模式」和「菜单栏」
      // 之间），而下面那条分隔线的判据是**分类**：**这一边**管的是「外壳上
      // 画出什么」（侧栏那一族、插件栏、格式化工具栏），**那一边**管的是
      // 「正文那一块怎么呈现」（三种编辑模式、只读、专注、打字机）。
      // 「状态栏画不画」「菜单栏画不画」与前者是同一类东西，夹在两种写作模式
      // 中间读起来像是同一族的第三种模式——用户评审时点的就是这一句。
      //
      // ⚠️ 这一族现在**四样齐了**（侧栏 / 插件栏 / 格式化工具栏 / 状态栏，
      // 外加菜单栏）：每一样都能在菜单里关，**也**都在自己那一条上有颗就地
      // 的 ×（`docs/07` 第 49 项那条口径）。挪的时候**别把 × 那一半落下**。
      { id: "view.statusBar", label: "Status Bar", checkable: true },
      // ⚠️ 菜单栏（2026-09-28，用户点名要的）。**键位 `Alt+M` 是这一条的生路**：
      // 菜单栏藏起来之后，界面上再没有任何一行字写着怎么开回来，所以必须有一个
      // **不依赖菜单**的键位。`Alt+M` 在整张表里核过是空的（`Alt+1`/`Alt+2` 是
      // 编辑模式，`Alt+↑/↓` 是移动行，没有别的 `Alt+字母`）。
      //
      // ⚠️ 与「状态栏」那条不同，这一条**有键位**正是上面那个原因：
      // 状态栏藏了不影响任何别的入口，菜单栏藏了会带走"唯一写着自己怎么回来
      // 的地方"。同一件事在 `ui/useChromeVisibility.ts` 里还有另一半——
      // 藏下去的那一刻发一条会自己走掉的提示（那才是用户真正先看到的东西）。
      //
      // ⚠️ 藏起来之后**菜单里的这一条也就点不到了**（它自己就在那一条上），
      // 这是这一条唯一"要用快捷键才回得来"的菜单项。别为此把菜单栏改成浮层：
      // 用户要的就是"屏幕上少一行"，浮层还是那一行。
      { id: "view.menuBar", label: "Menu Bar", accel: "Alt+M", checkable: true },
      // ⚠️ 这里原来有一项「Slidev 预览」（2026-09-23 加），**2026-09-25 删了**：
      // Slidev 从那天起是一个**拓展**，它的菜单项由插件自己 `register_menu`
      // 声明、落在「插件」那个菜单里（见 `plugins/slidev/main.lua`）。
      // 「删掉拓展，这项功能就完全不复存在」——菜单项也是这项功能的一部分，
      // 所以它跟着插件走，不留在宿主的视图菜单里。
      //
      // ── ⚠️ 这条分隔线是**用户点名要的**（2026-09-27）──
      //
      // 原话：「在菜单中格式化工具栏和所见即所得模式中间加一栏分割线，这样把不同
      // 的功能分类分开」。所以这一条**不是**"这一栏太长了断一下"那种随手加的线，
      // 它的判据是**分类**：它上面那一段（**插件栏 ＋ 格式化工具栏**，再往上的
      // 「侧边栏」那一族和它们之间**已经有一条既有的线**）管的是「**外壳上画出
      // 什么**」，下面那一段（三种编辑模式、只读模式）管的是「**正文那一块怎么
      // 呈现**」——两组互不相干，之前贴在一起读起来像同一族。
      //
      // ⚠️ "上面那一段"具体从哪算起是**开窗量出来的**，不是照着代码想出来的：
      // 第一版注释里把「侧边栏那一族」也算了进来，实际菜单上那一段自己有线
      //（在「搜索」之后），这条新线只管「插件栏 ＋ 格式化工具栏 ｜ 编辑模式」
      // 这一刀。**改这段注释之前先去 `docs/06` §5.4 那套坐标量的办法看一眼。**
      //
      // ⚠️ 往后在这个菜单里加东西时，**先想清楚它属于哪一组再决定插在哪一边**：
      // 插错边会让这条线变成一条没有意义的横杠，而"线在这里是因为它上面和下面
      // 是两类东西"这个意思，光看图是看不出来的。
      "sep",
      // ── 三种**编辑模式**（互斥，可勾项画 ✓，同时只有一个勾）──
      //
      // ⚠️ 键位不是一族，**这是刻意的**：
      // - 「源码模式」用 `Ctrl+/`：这是既有的键位口径，
      //   为了"三连号好看"把它改掉，等于明知故犯地让既有用户的使用习惯失效。
      // - 另外两种是新增的，键位由本仓自己排：`Alt+1` / `Alt+2`
      //   只给"新增的那两个"。于是菜单上读起来是「Alt+1 / Ctrl+/ / Alt+2」——
      //   看着不齐，但每一个都有来路。
      //
      // ⚠️ 三个 id 都写在这里、由 `App.tsx` 的 `menuHandlers` 推 `disabled`——
      // 实现之前它们是灰的，不会假装能点。
      { id: "view.modeWysiwyg", label: "WYSIWYG", accel: "Alt+1", checkable: true },
      { id: "view.modeSource", label: "Source Mode", accel: "Ctrl+/", checkable: true },
      { id: "view.modeSplit", label: "Split Preview", accel: "Alt+2", checkable: true },
      "sep",
      { id: "view.readOnly", label: "Read-Only Mode", checkable: true },
      "sep",
      { id: "view.focusMode", label: "Focus Mode", accel: "F8", checkable: true },
      { id: "view.typewriter", label: "Typewriter Mode", accel: "F9", checkable: true },
      // ⚠️ 原来这里还有「状态栏」与「菜单栏」两条，**2026-10-04 挪到上面
      // 「外壳上画出什么」那一段去了**（`docs/07` 第 49 项）：它们与插件栏、
      // 格式化工具栏是同一类东西（"这一栏画不画"），夹在两种写作模式中间
      // 会读成同一族的第三种模式。
      "sep",
      // ── 缩放那三档（2026-09-27）──
      //
      // ⚠️ **键位是照浏览器 / 大多数编辑器的惯例排的**（`Ctrl+=` / `Ctrl+-` /
      // `Ctrl+0`），不是本仓自己编的——这一族键位在用户手上是有肌肉记忆的，
      // 换一个就是让他按错。三条**都是动作不是状态**，所以没有 `checkable`：
      // 缩放值本身在设置里看得见，菜单上再挂个勾只是同一件事的第二处显示。
      //
      // ⚠️ 三条都**不带 `needsDoc`**：缩放是应用级的，一篇文档都没打开时
      // 按 `Ctrl+=` 也该有用。
      //
      // ⚠️ **`Ctrl+=` 与 WebKitGTK 自带那条整页缩放撞不撞，见 `ui/useZoom.ts`
      // 头上那一段**——结论是必须走这张表（接了的键位一律 `preventDefault`），
      // 别自己再挂一个监听。⚠️ 也因此**别改这里的写法**去认 `Ctrl+Shift+=`：
      // `accelSig` 把 Shift 当独立一维，多写一条只会撞车（`buildAccelIndex`
      // 会 warn 并让先到的那条生效）。
      //
      // ⚠️⚠️ **「实际大小」的键位不是 `Ctrl+0`**，尽管浏览器里那才是复位缩放的
      // 惯例键——本仓的 `Ctrl+0` **早就是「正文」**（段落那一族最后一条，
      // `Ctrl+1`~`Ctrl+6` 是标题，Typora 的老排法）。这不是推理出来的，
      // 是 `tools/menu-harness` 的 `#accel` 场第一次跑就报的：
      //
      //     构建时警告 1 条：[nota] 快捷键 "Ctrl+0" 同时给了 para.text 和
      //     view.zoomReset，para.text 生效
      //
      // 两个选择：把「正文」挪开（动了用户手上的老键位），或者复位换一个键。
      // 选了后者——「正文」用得比"复位缩放"多得多。离 `Ctrl+0` 最近、
      // 而这一族里没被占的是 `Ctrl+Shift+0`。
      { id: "view.zoomIn", label: "Zoom In", accel: "Ctrl+=" },
      { id: "view.zoomOut", label: "Zoom Out", accel: "Ctrl+-" },
      { id: "view.zoomReset", label: "Reset Zoom", accel: "Ctrl+Shift+0" },
      "sep",
      // ⚠️ 2026-09-25 起它会**收起外壳**（和专注模式同一套，见 `styles/app.css`
      // 那一节），所以标签从「切换全屏」改成「全屏」并加了勾：勾的是"窗口现在
      // 全屏着"，而"Full Screen"这两个字现在描述的是**一种状态**，不是一次动作。
      { id: "view.fullscreen", label: "Full Screen", accel: "F11", checkable: true },
      // ⚠️ **有勾**，而且那个勾**是从窗口读回来的**（`isAlwaysOnTop()`，见
      // `ui/useWindowControls.ts` 文件头）：用户完全可能在窗口管理器里给这个
      // 窗勾上"总在最前"，那时内存里记一个 `false` 就会让菜单和窗口分叉——
      // 症状是"窗口明明浮着、菜单里却没有勾"。与上面「全屏」同一条口径。
      //
      // ⚠️ **没有快捷键**：这一条归在"窗口怎么摆"里，而同族里已经有两族键位
      //（缩放 `Ctrl+=` 那三条、沉浸 `F8`/`F9`/`F11`），再塞一个只会撞车。
      // 这条的用法本来就是"打开之后一直开着"，不是高频动作。
      { id: "view.alwaysOnTop", label: "Always on Top", checkable: true },
      // ⚠️ **没有勾**，理由是这一条**没有可读的状态**：「开发者工具开着没有」
      // WebKitGTK 不给接口（见 `ui/useWindowControls.ts` 文件头）。硬记一个内存
      // 状态一定会分叉，而分叉的症状是"菜单说开着、屏幕上没有"。所以它是动作。
      { id: "view.devtools", label: "Developer Tools", accel: "Shift+F12" },
      "sep",
      // ⚠️⚠️ **这一条和上面那条「专注模式」是两件事，名字必须分得清。**
      // 上面那条（`view.focusMode`，F8）是**收拾界面**的：把外壳收起来、眼睛
      // 少看几个东西。这一条是**记你的账**的：切走就扣钱，扣光就弹红屏。
      // 「专注」两个字一样，所以本条的标签里**不许省掉「强制」**——
      // 省了之后菜单上并排两条「专注模式」和「专注」，谁也猜不出哪个是哪个。
      //
      // ⚠️ **没有快捷键**，这是刻意的：这个键会**开一个抢焦点的全屏窗**，
      // 误触的代价比别的菜单项高一档。而且 `F8` 已经是上面那条的了，
      // 随手挑一个（`F10`/`F12` 那一片）就是让用户的手在别处按出别的东西来
      // （同 `view.toolbar` 那一族不给键位的理由）。
      //
      // ⚠️ 它归在「视图」栏里是妥协：这个功能不属于视图。但为它单开一栏
      //（「专注」）会在菜单栏上多出一栏只放一条的，而这一栏里其他条目
      //（状态栏、全屏）也都是"应用怎么摆"——勉强算同类。真要挪窝，
      // 先看 `docs/07` 里这一项是怎么归的。
      { id: "view.forceFocus", label: "Force Focus", checkable: true },
    ],
  },
  {
    id: "theme",
    label: "Theme",
    items: [],
    dynamic: "themes",
  },
  {
    id: "help",
    label: "Help",
    items: [
      // 帮助正文是编在应用里的 Markdown，由只读正文渲染器和当前文档主题显示。
      // 它离线可用，也不会带进当前文档或插件状态。
      { id: "help.help", label: "Nota Help…", accel: "F1" },
      "sep",
      { id: "help.about", label: "About Nota" },
    ],
  },
];

/**
 * 全表 id → 条目，**模块级建一次**。
 *
 * ⚠️ 放在 `MENUS` **后面**：它扫的就是上面那张表，提前了会拿到一个空表。
 * ⚠️ 用 `walkMenuItems` 而不是自己写两层 `for`——那正是那个函数存在的原因
 * （子菜单里那一层最容易漏，见它的文档）。
 */
const itemIndex = (() => {
  const m = new Map<string, MenuItemSpec>();
  walkMenuItems(MENUS, (item) => {
    if (!m.has(item.id)) m.set(item.id, item);
  });
  return m;
})();

/** 按 id 取条目。取不到返回 `undefined`——**不抛**（调用方拿它建表，见 `摊条目`）。 */
export function getItem(id: string): MenuItemSpec | undefined {
  return itemIndex.get(id);
}

/**
 * 一串 id → 一份 `MenuEntry[]`。`"sep"` 是分隔线，原样留着。
 *
 * ⚠️ 取不到的 id **被跳过**，不报错——所以它必须配一道闸门：
 * `tests/context-menu.test.ts` 会对账"这张表里写的 id 是不是都在 `MENUS` 里"。
 * 少了那道测试，写错一个字符的症状是**那条永远灰着**，肉眼扫菜单很难发现。
 *
 * ⚠️ 返回的是**和 `MENUS` 里同一个对象**（不是拷贝）。这是有意的：
 * 一份数据两处引用，改 `MENUS` 那边这里跟着变。⚠️ 所以调用方**不许改**它们。
 */
export function flattenItem(ids: readonly string[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const id of ids) {
    if (id === "sep") {
      out.push("sep");
      continue;
    }
    const hit = itemIndex.get(id);
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * 右键菜单独有的两栏（`ui/ContextMenu.tsx`）。
 *
 * ⚠️ **它们不在 `MENUS` 里**，因为菜单栏上**没有**「插入」这一栏——那份组合是
 * 右键菜单特有的（用户 2026-10-04 拿 Typora 那份当参照定的形状）。所以它们
 * 也不会出现在菜单栏上，`useMenus` 那张灰名单照样管得着它们**里面**的条目
 * （子项和 `MENUS` 共用同一个对象，灰不灰按 id 算）。
 *
 * ⚠️ **`label` 必须住在这个文件里**：`tools/i18n-check.sh` 只在这几份文件里
 * 认 `label:` 这种写法，搬去 `ui/context-menu.ts` 的话 `"Insert"` 会以
 * "废键"的样子报 FAIL（表里有、代码里"没调用"）——`FormatBar.tsx::TITLES`
 * 那段注释记着同一条坑。
 */
export const contextParagraphItems: MenuItemSpec = {
  id: "ctx.paragraph",
  label: "Paragraph",
  submenu: flattenItem([
    "para.h1",
    "para.h2",
    "para.h3",
    "para.h4",
    "para.h5",
    "para.h6",
    "para.text",
    "sep",
    "para.quote",
    "para.ul",
    "para.ol",
    "para.task",
    "sep",
    "para.codeBlock",
  ]),
};

/**
 * 表格内的右键子菜单。前四条与工具栏共用已有命令；移动、复制、格式化与删除
 * 是这一层专用的入口，但仍是 `EditorCommand` 白名单里的正式命令。
 */
export const contextTableItems: MenuItemSpec = {
  id: "ctx.table",
  label: "Table",
  submenu: [
    ...flattenItem([
      "para.tableRowAbove",
      "para.tableRowBelow",
      "para.tableColLeft",
      "para.tableColRight",
    ]),
    "sep",
    { id: "para.tableMoveRowUp", label: "Move Row Up", needsDoc: true },
    { id: "para.tableMoveRowDown", label: "Move Row Down", needsDoc: true },
    { id: "para.tableMoveColLeft", label: "Move Column Left", needsDoc: true },
    { id: "para.tableMoveColRight", label: "Move Column Right", needsDoc: true },
    "sep",
    ...flattenItem(["para.tableDelRow", "para.tableDelCol"]),
    "sep",
    { id: "para.tableCopy", label: "Copy Table", needsDoc: true },
    { id: "para.tableFormat", label: "Format Table Source", needsDoc: true },
    "sep",
    ...flattenItem(["para.tableDel"]),
  ],
};

/** 见 {@link 右键段落项}。 */
export const contextInsertItems: MenuItemSpec = {
  id: "ctx.insert",
  label: "Insert",
  submenu: flattenItem([
    "para.table",
    "fmt.image",
    "fmt.link",
    "sep",
    "para.mathBlock",
    "para.codeBlock",
    "sep",
    "para.hr",
    "para.toc",
    "para.footnote",
    "fmt.emoji",
  ]),
};
