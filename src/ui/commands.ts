/**
 * 菜单栏的**骨架**：菜单怎么排、每一项叫什么、有没有快捷键。
 *
 * # 素材来源
 *
 * 逐条抄自 Typora 的菜单（用户 2026-09-22 截了 6 张图，抄录在 `docs/10` §11.1）。
 * **故意把 Typora 有、我们还没有的条目也列上**——菜单栏不只是入口，
 * 它还是一张"对标进度表"，缺什么一眼看得见。
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
 * # 为什么界面串一律中文
 *
 * Typora 自己的菜单是**中英混杂**的（"帮助"整栏除最后三行外全是英文），
 * 用户 2026-09-22 明确说过「注意不要像他一样中英混杂」。
 * 规矩：**菜单项、按钮、提示语一律中文**；`Markdown` / `LaTeX` / `Pandoc`
 * 这种**专有名词**照写原文（它们是名字不是词）。
 */

import type { DocThemeInfo } from "@/bridge/ipc";

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
  /** 需要有一份活动文档才可用。没文档时自动灰掉。 */
  needsDoc?: boolean;
  /** 可勾选项。当前勾没勾由 `App.tsx` 的 `checks` 给出。 */
  checkable?: boolean;
  /** 危险动作（丢改动、删东西），画红。 */
  danger?: boolean;
  /**
   * 子菜单。有它就不是"点一下执行"，而是"往右飞出一层"。
   *
   * ⚠️ 2026-09-23 重做菜单时按 VMark 的整理方式加的。判据是**这一组条目
   * 是不是同一件事的不同参数**：导出成什么格式、复制成什么格式、表格怎么改，
   * 这些铺在一个平面菜单里会让整栏长得没法看（Typora 的「段落」就有这个毛病，
   * 二十来项一路排下来，找"删掉这一列"得从头扫）。
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
  const items: MenuEntry[] = [{ id: NO_THEME, label: "无主题（内置）", checkable: true }];

  if (themes.length) {
    items.push("sep");
    for (const t of themes) {
      // 用户放的同名文件会**盖掉**内置那套。不标出来的话，"我改的文件怎么
      // 没生效"和"我删的文件怎么还在"都会变成查不动的问题。
      items.push({
        id: `${THEME_PREFIX}${t.id}`,
        label: t.builtin ? t.name : `${t.name}（已自定义）`,
        checkable: true,
      });
    }
  }

  // ⚠️ 这一条**编进 entries** 而不是单独渲染：那样它不参与漫游焦点，
  // 键盘用户按 End 到不了它、↑↓ 会从它头上跳过去。踩过。
  items.push("sep", { id: THEMES_DIR, label: "打开主题文件夹…" });
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

export const MENUS: MenuSpec[] = [
  {
    id: "file",
    label: "文件",
    items: [
      { id: "file.new", label: "新建", accel: "Ctrl+N" },
      { id: "file.newWindow", label: "新建窗口", accel: "Ctrl+Shift+N" },
      "sep",
      { id: "file.open", label: "打开…", accel: "Ctrl+O" },
      { id: "file.openFolder", label: "打开文件夹…" },
      { id: "file.quickOpen", label: "快速打开…", accel: "Ctrl+P" },
      { id: "file.recent", label: "打开最近文件" },
      { id: "file.reload", label: "从磁盘重新加载", needsDoc: true },
      "sep",
      { id: "file.save", label: "保存", accel: "Ctrl+S", needsDoc: true },
      { id: "file.saveAs", label: "另存为…", accel: "Ctrl+Shift+S", needsDoc: true },
      { id: "file.saveAll", label: "保存全部打开的文件…" },
      "sep",
      { id: "file.revealInFolder", label: "打开文件位置…", needsDoc: true },
      { id: "file.showInSidebar", label: "在侧边栏中显示", needsDoc: true },
      { id: "file.delete", label: "删除…", needsDoc: true, danger: true },
      "sep",
      {
        // ⚠️ 这一项**自己不执行任何命令**，`file.import` 只是个键。
        // Typora 那边是一整排「导入 Word (.docx) / RTF / LaTeX / Epub…」，
        // 铺在「文件」里会把这一栏撑成一条长龙——收进飞出层。
        id: "file.import",
        label: "导入",
        submenu: [
          { id: "file.importDocx", label: "Word (.docx)…" },
          { id: "file.importRtf", label: "RTF…" },
          { id: "file.importLatex", label: "LaTeX…" },
          { id: "file.importEpub", label: "Epub…" },
          { id: "file.importOdt", label: "OpenOffice (.odt)…" },
        ],
      },
      {
        id: "file.export",
        label: "导出",
        submenu: [
          { id: "file.exportPdf", label: "PDF…", needsDoc: true },
          { id: "file.exportHtmlPlain", label: "HTML（不含样式）…", needsDoc: true },
          { id: "file.exportHtmlStyled", label: "HTML（含样式）…", needsDoc: true },
          "sep",
          { id: "file.exportDocx", label: "Word (.docx)…", needsDoc: true },
          { id: "file.exportOdt", label: "OpenOffice (.odt)…", needsDoc: true },
          { id: "file.exportLatex", label: "LaTeX…", needsDoc: true },
          { id: "file.exportEpub", label: "Epub…", needsDoc: true },
          "sep",
          { id: "file.exportImage", label: "图片…", needsDoc: true },
          { id: "file.exportOther", label: "其他格式…", needsDoc: true },
        ],
      },
      { id: "file.print", label: "打印…", accel: "Alt+Shift+P", needsDoc: true },
      "sep",
      { id: "file.preferences", label: "偏好设置…", accel: "Ctrl+," },
      "sep",
      { id: "file.close", label: "关闭", accel: "Ctrl+W", needsDoc: true },
    ],
  },
  {
    id: "edit",
    label: "编辑",
    items: [
      { id: "edit.undo", label: "撤销", accel: "Ctrl+Z", needsDoc: true },
      { id: "edit.redo", label: "重做", accel: "Ctrl+Y", needsDoc: true },
      "sep",
      { id: "edit.cut", label: "剪切", accel: "Ctrl+X", needsDoc: true },
      { id: "edit.copy", label: "复制", accel: "Ctrl+C", needsDoc: true },
      { id: "edit.copyImage", label: "拷贝图片", needsDoc: true },
      { id: "edit.paste", label: "粘贴", accel: "Ctrl+V", needsDoc: true },
      "sep",
      {
        // ⚠️ 「复制为 Markdown」那条 **id 没变**，只是从平面挪进了这里。
        // 挪动时最容易出的错是把 id 一起改了——`App.tsx` 那张表是按 id 认的，
        // 改了 id 就等于把已实现的功能重新变成灰的，而且不会报错。
        id: "edit.copyAs",
        label: "复制为",
        submenu: [
          { id: "edit.copyAsMarkdown", label: "Markdown", accel: "Ctrl+Shift+C", needsDoc: true },
          { id: "edit.copyAsPlain", label: "纯文本", needsDoc: true },
          { id: "edit.copyAsHtml", label: "HTML 代码", needsDoc: true },
        ],
      },
      "sep",
      { id: "edit.select", label: "选择" },
      { id: "edit.moveLineUp", label: "上移该行", accel: "Alt+↑", needsDoc: true },
      { id: "edit.moveLineDown", label: "下移该行", accel: "Alt+↓", needsDoc: true },
      "sep",
      { id: "edit.findReplace", label: "查找和替换…", accel: "Ctrl+H", needsDoc: true },
    ],
  },
  {
    id: "paragraph",
    label: "段落",
    items: [
      { id: "para.h1", label: "一级标题", accel: "Ctrl+1", needsDoc: true },
      { id: "para.h2", label: "二级标题", accel: "Ctrl+2", needsDoc: true },
      { id: "para.h3", label: "三级标题", accel: "Ctrl+3", needsDoc: true },
      { id: "para.h4", label: "四级标题", accel: "Ctrl+4", needsDoc: true },
      { id: "para.h5", label: "五级标题", accel: "Ctrl+5", needsDoc: true },
      { id: "para.h6", label: "六级标题", accel: "Ctrl+6", needsDoc: true },
      { id: "para.text", label: "正文段落", accel: "Ctrl+0", needsDoc: true },
      "sep",
      {
        // ⚠️ 父项**换了新 id**（`para.table` → `para.tableMenu`），而原来那个
        // `para.table` 下沉成子菜单的第一条。**不能直接拿 `para.table` 当父项**——
        // 它已经有实现（`App.tsx` 里 `run("table")`），当父项就点不动了，
        // 等于把做好的功能弄丢，而且不报错。
        id: "para.tableMenu",
        label: "表格",
        submenu: [
          // ⚠️ 标签写死了 **3 × 3**，因为**不弹框问行列数**（Typora 会弹）。
          // 菜单上写「插入表格…」而点下去直接出来一张表，那个省略号就在撒谎：
          // 它承诺后面还有一个"问你点什么"的步骤，而实际上没有。
          // 行列数写在标签里，用户点之前就知道会得到什么。见 `create.ts` 里
          // `table` 那一条的注释。
          { id: "para.table", label: "插入表格（3 × 3）", needsDoc: true },
          "sep",
          { id: "para.tableRowAbove", label: "上方插入行", needsDoc: true },
          { id: "para.tableRowBelow", label: "下方插入行", needsDoc: true },
          { id: "para.tableColLeft", label: "左侧插入列", needsDoc: true },
          { id: "para.tableColRight", label: "右侧插入列", needsDoc: true },
          "sep",
          { id: "para.tableDelRow", label: "删除行", needsDoc: true },
          { id: "para.tableDelCol", label: "删除列", needsDoc: true },
          { id: "para.tableDel", label: "删除表格", needsDoc: true, danger: true },
          "sep",
          { id: "para.tableAlignLeft", label: "左对齐", needsDoc: true },
          { id: "para.tableAlignCenter", label: "居中对齐", needsDoc: true },
          { id: "para.tableAlignRight", label: "右对齐", needsDoc: true },
        ],
      },
      { id: "para.mathBlock", label: "公式块", accel: "Ctrl+Shift+M", needsDoc: true },
      { id: "para.codeBlock", label: "代码块", accel: "Ctrl+Shift+K", needsDoc: true },
      "sep",
      { id: "para.quote", label: "引用", accel: "Ctrl+Shift+Q", needsDoc: true },
      "sep",
      { id: "para.ol", label: "有序列表", accel: "Ctrl+Shift+[", needsDoc: true },
      { id: "para.ul", label: "无序列表", accel: "Ctrl+Shift+]", needsDoc: true },
      { id: "para.task", label: "任务列表", accel: "Ctrl+Shift+X", needsDoc: true },
      "sep",
      { id: "para.hr", label: "水平分割线", needsDoc: true },
      { id: "para.toc", label: "内容目录", needsDoc: true },
      { id: "para.frontMatter", label: "YAML Front Matter", needsDoc: true },
    ],
  },
  {
    id: "format",
    label: "格式",
    items: [
      { id: "fmt.bold", label: "加粗", accel: "Ctrl+B", needsDoc: true },
      { id: "fmt.italic", label: "斜体", accel: "Ctrl+I", needsDoc: true },
      { id: "fmt.underline", label: "下划线", accel: "Ctrl+U", needsDoc: true },
      { id: "fmt.code", label: "代码", accel: "Ctrl+Shift+`", needsDoc: true },
      "sep",
      { id: "fmt.strike", label: "删除线", accel: "Alt+Shift+5", needsDoc: true },
      { id: "fmt.comment", label: "注释", needsDoc: true },
      "sep",
      { id: "fmt.link", label: "超链接", accel: "Ctrl+K", needsDoc: true },
      { id: "fmt.image", label: "图像", needsDoc: true },
      "sep",
      { id: "fmt.clear", label: "清除样式", accel: "Ctrl+\\", needsDoc: true },
    ],
  },
  {
    id: "view",
    label: "视图",
    items: [
      { id: "view.toggleSidebar", label: "显示/隐藏侧边栏", accel: "Ctrl+Shift+L", checkable: true },
      { id: "view.outline", label: "大纲", accel: "Ctrl+Shift+1", checkable: true },
      { id: "view.fileTree", label: "文件树", accel: "Ctrl+Shift+3", checkable: true },
      { id: "view.docList", label: "文档列表", accel: "Ctrl+Shift+2" },
      { id: "view.search", label: "搜索", accel: "Ctrl+Shift+F" },
      "sep",
      { id: "view.toggleDock", label: "插件栏", checkable: true },
      // 格式化工具栏。⚠️ **没有快捷键**：Typora 也没有给它配键
      // （它连工具栏本身都是要手动打开的选项），随手编一个就是让别人的手
      // 在别的应用里按出别的东西来。同「Slidev 预览」那条的理由。
      { id: "view.formatBar", label: "格式化工具栏", checkable: true },
      // ── Slidev 预览（2026-09-23）──
      //
      // ⚠️ **刻意没有快捷键**：Typora 没有这个功能，也就没有"该配哪个键"的依据；
      // 随手编一个，就是让别人的手在别的应用里按出别的东西来。
      //
      // ⚠️ `needsDoc` 是必须的：预览的是**某一份文档的正文**，没文档时无从预览，
      // 这一项会自动灰掉（判据在 `App.tsx` 的 `disabledCommands`）。
      { id: "view.slidev", label: "Slidev 预览", checkable: true, needsDoc: true },
      // ── 三种**编辑模式**（互斥，可勾项画 ✓，同时只有一个勾）──
      //
      // ⚠️ 键位不是一族，**这是刻意的**：
      // - 「源码模式」保留 Typora 的 `Ctrl+/`。那是对标基准里就有的键，
      //   为了"三连号好看"把它改掉，等于明知故犯地让老用户的手感失效。
      // - 另外两种 Typora **没有**，所以键位是我们自己排的：`Alt+1` / `Alt+2`
      //   只给"新增的那两个"。于是菜单上读起来是「Alt+1 / Ctrl+/ / Alt+2」——
      //   看着不齐，但每一个都有来路。
      //
      // ⚠️ 三个 id 都写在这里、由 `App.tsx` 的 `menuHandlers` 推 `disabled`——
      // 实现之前它们是灰的，不会假装能点。
      { id: "view.modeWysiwyg", label: "所见即所得", accel: "Alt+1", checkable: true },
      { id: "view.modeSource", label: "源码模式", accel: "Ctrl+/", checkable: true },
      { id: "view.modeSplit", label: "分屏预览", accel: "Alt+2", checkable: true },
      "sep",
      { id: "view.readOnly", label: "只读模式", checkable: true },
      "sep",
      { id: "view.focusMode", label: "专注模式", accel: "F8", checkable: true },
      { id: "view.typewriter", label: "打字机模式", accel: "F9", checkable: true },
      { id: "view.statusBar", label: "状态栏", checkable: true },
      "sep",
      { id: "view.fullscreen", label: "切换全屏", accel: "F11" },
      { id: "view.devtools", label: "开发者工具", accel: "Shift+F12" },
    ],
  },
  {
    id: "theme",
    label: "主题",
    items: [],
    dynamic: "themes",
  },
  {
    id: "help",
    label: "帮助",
    items: [
      // Typora 那一栏「What's New / Quick Start / Markdown Reference…」全是外链，
      // 我们离线优先，外链既打不开也不该假装能打开。只留真正能兑现的那条。
      { id: "help.about", label: "关于 Nota" },
    ],
  },
];
