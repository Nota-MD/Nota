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

export interface MenuItemSpec {
  /** 命令 id。与 `App.tsx` 里 `menuHandlers` 的键一一对应。 */
  id: string;
  label: string;
  /**
   * 显示用的快捷键。**这里只是显示**——真正的按键绑定在 `App.tsx` 的
   * `keydown` 里，两处不一致时以那边为准（这边写错了用户按下去没反应，
   * 不会报错，所以改了那边记得回来对一眼）。
   */
  accel?: string;
  /** 需要有一份活动文档才可用。没文档时自动灰掉。 */
  needsDoc?: boolean;
  /** 可勾选项。当前勾没勾由 `App.tsx` 的 `checks` 给出。 */
  checkable?: boolean;
  /** 危险动作（丢改动、删东西），画红。 */
  danger?: boolean;
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
      { id: "file.import", label: "导入…" },
      { id: "file.export", label: "导出" },
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
      { id: "edit.copyAsMarkdown", label: "复制为 Markdown", accel: "Ctrl+Shift+C", needsDoc: true },
      { id: "edit.copyAsPlain", label: "复制为纯文本", needsDoc: true },
      { id: "edit.copyAsHtml", label: "复制为 HTML 代码", needsDoc: true },
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
      { id: "para.table", label: "表格", needsDoc: true },
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
      { id: "view.sourceMode", label: "源代码模式", accel: "Ctrl+/" },
      { id: "view.readOnly", label: "只读模式", checkable: true },
      "sep",
      { id: "view.focusMode", label: "专注模式", accel: "F8" },
      { id: "view.typewriter", label: "打字机模式", accel: "F9" },
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
