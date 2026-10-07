/**
 * **菜单与快捷键的接线**：从"有没有实现"推出"灰不灰、勾没勾"，再把结果
 * 同时喂给自绘菜单、原生菜单和键盘。
 *
 * 从 `App.tsx` 搬出来的（2026-09-24）。那边本来是一个外壳文件，塞进了四件
 * 本可以分开的事：取数据、派事件、拼布局，外加这一整套菜单判据。搬出来之后
 * 每条判据都和它的**判据来源**待在同一个文件里——`commands.ts` 定义菜单
 * 长什么样，这里定义"它此刻是什么状态"，`App.tsx` 只负责把两边接上。
 *
 * # 三条判据，一个出口
 *
 * | 判据 | 回答的问题 | 来源 |
 * |---|---|---|
 * | 有没有处理函数 | 这个功能做了没有 | `App.tsx` 的 `menuHandlers` |
 * | `needsDoc` | 现在有没有一份文档可作用 | `activeId` |
 * | `光标条件` | 光标这一刻在不在合适的位置 | `commandState` |
 *
 * ⚠️ **"能不能点"的真相源只有一处**（上面那张表），而它派生出三个消费者：
 * 自绘菜单的 `disabled`、原生菜单的 `enabled`、键盘的"这条键位接不接"。
 * 各写一份的话，症状是"菜单灰着、快捷键却照跑"——这种不一致不报错、不崩，
 * 只会让用户觉得这个应用一会儿一个脾气。
 *
 * # ⚠️ 为什么 `checks` 的入参是**一串布尔**而不是一个对象
 *
 * 对象字面量每次渲染都是新身份。拿它当 `useMemo` 的依赖，`menuChecks` 就会
 * 每渲染一次换一次身份，进而让下面那两个原生菜单的 effect **每渲染一次都
 * 重新推一遍菜单**（一次 IPC + 一次重建原生菜单）。收成一串布尔当依赖，
 * 值不变就什么都不发生。
 */

import { useEffect, useMemo, useState } from "react";

import type { UnlistenFn } from "@tauri-apps/api/event";

import {
  api,
  on,
  events,
  type DocId,
  type DocThemeInfo,
  type ToolbarMode,
  type ViewMode,
} from "@/bridge/ipc";
import type { CommandState } from "@/editor/command-state";
import { use语言 } from "@/i18n";
import { accelSig, buildAccelIndex, eventAccel, isOutsideEditor } from "@/ui/accel";
import { walkMenuItems, type MenuItemSpec, type MenuSpec } from "@/ui/commands";
import { buildNativeTree } from "@/ui/nativeMenu";

/**
 * 宿主截下来的那两颗键 → 命令 id。
 *
 * ⚠️ 这一层映射放在**这里**，不在 Rust 里：宿主那一层知道的是"用户按了加粗键"
 * （那是物理事实，是 GTK 唯一能告诉我们的事），而"加粗键对应哪条命令"是命令表
 * 的事。在 `format_keys.rs` 里直接写 `fmt.bold` 就等于把菜单项的 id 抄了第二份。
 *
 * ⚠️ 键名必须和 `src-tauri/src/format_keys.rs::认键` 交出来的那几个字符串一致。
 * 对不上时这里是 `undefined`，`on` 那个回调会安静地 return——**不报错**，
 * 症状就是"按了没反应"，正好和这个 bug 本身撞脸。
 */
const 宿主格式键: Readonly<Record<string, string>> = {
  bold: "fmt.bold",
  italic: "fmt.italic",
};

/**
 * 剪贴板那几键 —— 焦点在**代码块里那颗 CodeMirror** 时，它们归里层那个编辑器，
 * 这条全局 accel 一律放行（理由与实测症状写在下面 `onKey` 那一段）。
 *
 * ⚠️ 四条都要在：少一条的症状是"在代码块里按它没反应，或者动的是外面那篇"。
 */
const 剪贴板键 = new Set(["edit.copy", "edit.cut", "edit.paste", "edit.pastePlain"]);

export interface MenuWiring {
  /**
   * 菜单栏**此刻**摆着的那几栏。2026-09-24 起不再是常量 `MENUS`——
   * 插件的菜单项是运行时才知道的（`api.plugin.menus()`），那一栏由
   * `ui/pluginMenus.ts` 合成、`App.tsx` 拼进来，见那里的注释。
   *
   * ⚠️ 三条判据（灰不灰、键位归谁、原生菜单推什么）**都必须走这一份**。
   * 任何一处漏用它去读常量 `MENUS`，插件那一栏就会**只画在这一个消费者看得见
   * 的地方**——比如菜单上亮着而 `Ctrl+…` 按不动，或者自绘菜单有、原生菜单没有。
   * 这类不一致不报错，只是让界面撒谎。
   */
  menus: readonly MenuSpec[];
  /**
   * 命令 id → 实现。**这张表就是"菜单项能不能点"的第一条判据**——
   * 表里没有的 id，菜单里就是灰的。**不要**为了方便塞空实现进去，
   * 那等于让界面撒谎（见 `ui/commands.ts` 顶上那段）。
   */
  menuHandlers: Record<string, () => void>;
  activeId: DocId | null;
  /** 光标状态。`null` = 这条通路读不出来（源码模式 / 没有文档）。 */
  commandState: CommandState | null;
  /** 那些**看的时候的状态**（侧栏、工具栏、编辑模式…），用来算勾。 */
  view: {
    sidebarOpen: boolean;
    sidebarTab: string;
    dockOpen: boolean;
    /** 格式工具栏那三档的当前取值（见 `ui/useChromeVisibility.ts`）。 */
    toolbarMode: ToolbarMode;
    statusBarOpen: boolean;
    /** 菜单栏画不画（2026-09-28，见 `ui/useChromeVisibility.ts`）。 */
    menuBarOpen: boolean;
    viewMode: ViewMode;
    /** 沉浸（收起外壳）。⚠️ 与下面那个 `forceFocus` **不是一回事**，见 `commands.ts`。 */
    focusMode: boolean;
    /**
     * 强制专注开着吗（`焦点` 那一套会话）。
     *
     * ⚠️ **不能和 `focusMode` 合并**：那个是"界面收起来了没有"（一个
     * `useState`，随时可翻），这个是"账本上这一轮在不在跑"（真相源在宿主，
     * 前端只是读它）。合成一个的话，用户在警报弹出来之后按一下 F8，
     * 菜单里的勾会跟着变——而账本一动没动。
     */
    forceFocus: boolean;
    typewriter: boolean;
    /**
     * 窗口现在是不是全屏。⚠️ 这是**从窗口读回来的镜像**，不是"我们想不想全屏"
     * ——所以它的勾跟着窗口的快捷键、WM 的平铺规则一起变（见 `App.tsx`）。
     */
    fullscreen: boolean;
    /**
     * 窗口现在是不是**置顶**（2026-09-27）。⚠️ 同上面那条：**从窗口读回来**
     * （`isAlwaysOnTop()`，`ui/useWindowControls.ts`）——用户可能在窗口管理器里
     * 给它勾了"总在最前"，那时内存里记一个 `false` 就会让菜单和窗口分叉。
     */
    alwaysOnTop: boolean;
  };
  themes: DocThemeInfo[];
  documentTheme: string;
  /**
   * 原生菜单被点了（macOS）。⚠️ **去向判据不在这里**：主题、主题目录、
   * 命令三条路怎么分是 `App.tsx` 的事（`resolvePick`），这里只管收事件。
   * 收到什么原样交出去。
   */
  onNativePick: (id: string) => void;
}

export interface MenuState {
  /** 灰掉的命令。自绘菜单与键盘都读它。 */
  disabledCommands: Set<string>;
  /** 可勾选项现在勾没勾。 */
  menuChecks: Record<string, boolean>;
  /** 原生菜单**挂上了没有**。挂了就把自绘那条让开。 */
  usingNativeMenu: boolean;
}

/**
 * **第二条判据**：这几条命令还要求"光标现在处在某个状态"。
 *
 * ⚠️ 「有没有处理函数」回答的是"这个功能做了没有"，**回答不了"现在这一刻
 * 能不能用"**。表格那十条就是最明显的例子：「删除行」在光标不在表格里时
 * 按下去什么都不会发生（`prosemirror-tables` 的裸函数找不到格子就返回），
 * 而菜单上它是亮的——那就是让用户白点。
 *
 * ⚠️ **表里没有的 id 一律不受状态约束**（默认可用）。写成"默认不可用"
 * 的话，每加一条命令都得记得来这儿登记一次，漏了就是一个永远灰着的菜单项
 * ——那种"功能做了但点不动"的毛病比多亮一条难查得多。
 *
 * ⚠️ `commandState === null`（源码模式 / 还没打开文档）时**整张表不生效**：
 * 源码模式没有文档树，读不出"在不在表格里"，拿一个猜的值去灰菜单比不灰更糟。
 * 那一侧真有做不到的命令，由 `run` 的返回值如实提示。
 */
const 光标条件: Record<string, (s: CommandState) => boolean> = {
  "para.tableRowAbove": (s) => s.inTable,
  "para.tableRowBelow": (s) => s.inTable,
  "para.tableColLeft": (s) => s.inTable,
  "para.tableColRight": (s) => s.inTable,
  "para.tableDelRow": (s) => s.inTable,
  "para.tableDelCol": (s) => s.inTable,
  "para.tableDel": (s) => s.inTable,
  "para.tableAlignLeft": (s) => s.inTable,
  "para.tableAlignCenter": (s) => s.inTable,
  "para.tableAlignRight": (s) => s.inTable,
  // 「清除样式」清的是**选区里的**行内标记，没有选区就没有可清的。
  "fmt.clear": (s) => s.hasSelection,
  // 「内容目录」要拿标题当原料：一篇一个标题都没有的文档，插一份空目录没有
  // 意义（`editor/toc.ts::算目录块` 那时给 `null`，命令本身什么都不做）。
  // ⚠️ 判据在 `editor/command-state.ts`，**不在**命令里——命令里再判一次的话，
  // 菜单会亮着而点下去没反应，正是这张表要根治的那种撒谎。
  "para.toc": (s) => s.hasHeadings,
};

export function useMenus(w: MenuWiring): MenuState {
  const { menus, menuHandlers, activeId, commandState, themes, documentTheme, onNativePick } = w;
  const {
    sidebarOpen,
    sidebarTab,
    dockOpen,
    toolbarMode,
    statusBarOpen,
    menuBarOpen,
    viewMode,
    focusMode,
    forceFocus,
    typewriter,
    fullscreen,
    alwaysOnTop,
  } = w.view;

  /** 灰掉的命令。没实现、缺活动文档、光标不在合适的位置，都进这里。 */
  const disabledCommands = useMemo(() => {
    const out = new Set<string>();

    /** 这一项点不点得动。**递归**——带子菜单的项按"里面有没有一条能用的"算。 */
    const isOff = (item: MenuItemSpec): boolean => {
      if (item.submenu) {
        // ⚠️ 带子菜单的项**自己不执行命令**，所以不能拿它自己的 id 去查
        // `menuHandlers`（查不到，会永远灰着，子菜单也就永远打不开）。
        // 判据是子菜单里**所有**条目都不能用——全灰才灰，
        // 否则点开一层全是灰的，等于让用户做一次无效操作。
        return item.submenu.every((child) => child === "sep" || isOff(child));
      }
      if (!menuHandlers[item.id]) return true;
      if (item.needsDoc && activeId === null) return true;
      // 第二条判据（见上面 `光标条件`）。只在读得出光标状态时生效。
      const 看光标 = 光标条件[item.id];
      if (看光标 && commandState) return !看光标(commandState);
      return false;
    };

    // ⚠️ 必须用 `walkMenuItems`（含子菜单），**不能只扫顶层**。
    // 之前这里是个只走一层的 `for`，子菜单一加就会静默漏掉里面的条目：
    // 效果是子菜单里的项**永远不灰**——没实现也亮着，点了没反应。
    // 这种 bug 不报错、不崩，只是让界面撒谎，所以遍历收在 `commands.ts` 一处。
    walkMenuItems(menus, (item) => {
      if (isOff(item)) out.add(item.id);
    });
    return out;
  }, [menus, menuHandlers, activeId, commandState]);

  /**
   * 可勾选项的当前状态。
   *
   * ⚠️ 编辑模式那三条**三选一**，来源是 `App.tsx` 递下来的 `viewMode`——
   * 它是**实际**模式（过完大文件降级那一道），也是编辑区的 `mode` 属性，
   * 两处**必须同源**：各存一份的症状是"菜单里的 ✓ 在 A 上、编辑区却是 B"。
   * 默认值（`wysiwyg`）现在只有一处：`ui/useFileKindMode.ts` 里那条
   * `useState<ViewMode>("wysiwyg")` 的初值——2026-10-07 起模式是会话内状态、
   * 不落盘，`settings/mod.rs` 那边已经没有第二份了。
   */
  const menuChecks = useMemo<Record<string, boolean>>(
    () => ({
      "view.toggleSidebar": sidebarOpen,
      "view.outline": sidebarOpen && sidebarTab === "outline",
      "view.fileTree": sidebarOpen && sidebarTab === "tree",
      // ⚠️ 这里原来还有一条 `view.docList`（侧栏第三页「文档列表」）：
      // 2026-09-28 那一页删了，菜单项与这条勾一起删（`ui/Sidebar.tsx` 文件头）。
      "view.toggleDock": dockOpen,
      // ⚠️ 三档**各自一条**（`commands.ts` 里是一个子菜单的三条）。
      // 写成 `Record` 而不是三元表达式是照抄「编辑模式」那三条的形状：
      // 一眼能看出"这三个 id 是互斥的一组"。
      "view.toolbarAlways": toolbarMode === "always",
      "view.toolbarHover": toolbarMode === "hover",
      "view.toolbarNever": toolbarMode === "never",
      "view.statusBar": statusBarOpen,
      "view.menuBar": menuBarOpen,
      "view.modeWysiwyg": viewMode === "wysiwyg",
      "view.modeSource": viewMode === "source",
      "view.modeSplit": viewMode === "split",
      "view.focusMode": focusMode,
      "view.forceFocus": forceFocus,
      "view.typewriter": typewriter,
      "view.fullscreen": fullscreen,
      "view.alwaysOnTop": alwaysOnTop,
    }),
    [
      sidebarOpen,
      sidebarTab,
      dockOpen,
      toolbarMode,
      statusBarOpen,
      menuBarOpen,
      viewMode,
      focusMode,
      forceFocus,
      typewriter,
      fullscreen,
      alwaysOnTop,
    ],
  );

  // ── 快捷键 ──────────────────────────────────────────────────────────────
  /**
   * 键位表：**从 `commands.ts` 的 `accel` 文本派生**（`ui/accel.ts`）。
   *
   * ⚠️ 2026-09-23 之前这里是一条手写的 if-else 长链（`key === "s"` / `key === "n"` …），
   * 和菜单上显示的键位是**两套真相源**，并且已经不一致了：「偏好设置」写着
   * `Ctrl+,`（实现了的，菜单里亮着）按下去没反应，而 `Ctrl+Shift+N` 会被
   * `key === "n"` 抢去当「新建」。详见 `ui/accel.ts` 顶上那段。
   *
   * ⚠️ 2026-09-24 起入参是 `menus`（含插件那一栏），**不再是常量 `MENUS`**：
   * 插件可以在 `register_menu` 里写 `accelerator`，那条键位必须真的接得上，
   * 否则菜单上写着 `Ctrl+Alt+G` 而按下去没反应——正是这个文件要消灭的那种
   * 名不副实。`buildAccelIndex` 对"认不出来"和"撞车"都会当场 `console.warn`。
   *
   * ⚠️ 依赖**必须**是 `menus`：`App.tsx` 那份是 `useMemo` 出来的，
   * 插件菜单拉到之前和之后是**两个身份**，插件的那几条键位要等它换了才进得来。
   * 若在 `App.tsx` 里内联拼这个数组（每次渲染新身份），后果是这张表每次渲染
   * 重建——**功能上没错，但下面那个 keydown effect 会跟着每帧重挂**。
   */
  const accelIndex = useMemo(() => buildAccelIndex(menus), [menus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 输入法组字期间一概不接：中文/日文选字用的就是方向键和数字排，
      // 抢过来会让选字跳到别处去（同 `useMenuRovingFocus` 里那条判据）。
      if (e.isComposing || e.keyCode === 229) return;

      // ⚠️ **编辑器自己已经处理过的键位不再接**（2026-09-29 加，BUG-49 的正主）。
      //
      // 判据用的是 DOM 的 `defaultPrevented`：ProseMirror 只要有一条
      // `handleKeyDown` 返回 `true`，就会 `preventDefault()`
      //（`prosemirror-view` 的 `editHandlers.keydown` 末尾那一句），而它的监听器
      // 挂在**正文节点**上、比这里（`window`）早，所以事件冒到这一层时标记已经在了。
      //
      // ⚠️ 少这一条的症状**不是"多执行一遍"，是那颗键彻底失灵**：
      // `@milkdown/preset-commonmark` 自己绑了 `Mod-b` / `Mod-i`
      //（`strongKeymap` / `emphasisKeymap`），本仓菜单表也绑了同样两颗
      //（`fmt.bold` / `fmt.italic`）——**两个主人，两条命令都是 toggle，
      // 跑两遍正好抵消**，看起来就是"按了没反应"。用户 2026-09-28 报的
      // 「Ctrl B 没反应」就是这个（`docs/07` 的 BUG-49）。
      //
      // ⚠️ 指纹是**同一个快捷键在两种模式下不同命**：源码模式那边 CodeMirror
      // 没绑 `Mod-b`（见 `source.ts` 的 `撞车键位`），只跑一遍，所以一直好使；
      // 所见即所得这边被 PM 抢了先，两遍抵消。查"快捷键不灵"时先看这一条。
      //
      // ⚠️ 只放行**不**执行命令，不 `preventDefault`：那颗键已经由编辑器自己
      // 办完了，这里既不该再办一遍，也不该把它的结果撤掉。
      if (e.defaultPrevented) return;

      const id = accelIndex.get(accelSig(eventAccel(e)));
      if (!id) return;

      // ⚠️ **代码块里那颗 CodeMirror 是另一个编辑器**：剪贴板那几键归它自己
      // （2026-10-07 开窗量出来的，`docs/06` §5.55）。
      //
      // 里层那颗的 `copy` / `cut` 由 `code-block-cm.ts` 自己接（空选区按一下
      // 拿走整行——VS Code 那个手感），`paste` 由 CodeMirror 自己接（它认得
      // 光标在哪一格里）。不放过的话，下面那句 `preventDefault()` 会把
      // **浏览器的默认动作**一起按死：`copy` / `cut` / `paste` 这三个事件
      // 根本发不出来，里层挂的 handler 一次都跑不到。
      //
      // 症状（实测）：在代码块里按 `Ctrl+C`，拿到的还是**上一次在外面复制的那
      // 一篇**（外层 PM 的选区），界面上一点异常都看不出来。⚠️ 这与 BUG-49 /
      // BUG-58 / `Alt+↑` 是同族的第四例：**编辑器抢先 + 全局这条 `preventDefault`**。
      //
      // ⚠️ 判据按 **id**（不是按按键）：`Ctrl+Shift+V`（`edit.pastePlain`）也要
      // 一起放行——在代码块里它更该走 CodeMirror 那条。
      // ⚠️ 类名 `nota-code-cm` 只有代码块那颗挂（`code-block-cm.ts` 里那个
      // `editorAttributes`）：源码模式也是 `.cm-editor`，按那个认会把源码模式
      // 一起放进来，而源码模式的这几颗键一直好用（CM 自己那份默认行为）。
      if (剪贴板键.has(id)) {
        const 目标 = e.target as HTMLElement | null;
        if (typeof 目标?.closest === "function" && 目标.closest(".nota-code-cm")) return;
      }

      // 焦点在**编辑器之外的输入框**里（设置对话框那个文本框、查找条）时不接。
      // 不拦的话，在文本框里按 Ctrl+Z 撤的是**文档**，不是刚打的字。
      if (isOutsideEditor(e.target)) return;

      // ⚠️ 灰掉的命令不接。`disabledCommands` 已经把"没实现"和"没有活动文档"
      // （`needsDoc`）两种情况都算进去了，所以没有文档时 Ctrl+W 不会误关、
      // Ctrl+S 不会误存、Ctrl+1 不会误切标题——这三条以前是靠链上逐个
      // `activeId !== null` 兜的，漏一个就是一个静默的缺陷。
      if (disabledCommands.has(id)) return;

      const handler = menuHandlers[id];
      // 上面判过 `disabled` 就一定在（`disabled` 的定义就是"这张表里没有"），
      // 这里只是让 TS 收窄。
      if (!handler) return;

      // ⚠️ **只在真要执行时才 `preventDefault`**。没接的键位一律放行，
      // 否则会把系统的复制粘贴之类也一起抢掉。
      //
      // ⚠️ 这里**不是**"编辑器抢不走的那一道"——上面那条 `defaultPrevented`
      // 才是。这一段以前写着"否则会连 ProseMirror 自己的 Ctrl+B/I/Z 一起抢掉，
      // 那些键位不在 `menuHandlers` 里"，而 `Ctrl+B` / `Ctrl+I` **恰恰在表里**
      //（`fmt.bold` / `fmt.italic`），于是它被抢了两次、抵消成"没反应"。
      // 那句话是真的把人带沟里去了，2026-09-29 改掉。
      e.preventDefault();
      handler();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accelIndex, menuHandlers, disabledCommands]);

  /**
   * **宿主在 GTK 捕获阶段截下来的那两颗键**（`Ctrl+B` / `Ctrl+I`）。
   *
   * ⚠️⚠️ **2026-09-29 实测：这条路在真程序里一次都没响过**（宿主那一层装得上、
   * 但拦不到键），留在这里是**备用**——上面的 `keydown` 那道闸今天才是正主，
   * 理由见它那一段的 `defaultPrevented` 注释。`src-tauri/src/format_keys.rs`
   * 的文件头把实测过程与"删还是留"写着；`docs/07` BUG-49 那一项挂着待拍板。
   *
   * ⚠️ 这一段原来的理由（"WebKitGTK 在派发给 DOM **之前**就把这两颗键吃掉了，
   * `window` 上一次都收不到"）**是错的**：`Ctrl+B` 进得了 DOM，用户 2026-09-28
   * 报的「Ctrl B 没反应」是**两颗键被绑了两次、互相抵消**（BUG-49）。
   *
   * ⚠️ **判据必须和上面那条一模一样**（外面/灰掉/没实现都不接）——两条路喂的是
   * 同一张 `menuHandlers`，判据漏一条就会出现"菜单灰着、快捷键却照跑"，
   * 正是这个文件头点名要消灭的那种不一致。
   */
  useEffect(() => {
    let 已卸载 = false;
    let 退订: UnlistenFn | null = null;

    on<string>(events.formatKey, (名字) => {
      const id = 宿主格式键[名字];
      if (!id) return;
      // ⚠️ 只能看 `document.activeElement`，看不了 `e.target`——这条路上**没有
      // DOM 事件**，宿主那一层只知道"按了哪颗键"，不知道焦点在谁身上。
      // 判据本身复用同一个 `isOutsideEditor`，所以"在设置文本框里按 Ctrl+B"
      // 两边行为一致（都不接）。
      if (isOutsideEditor(document.activeElement)) return;
      if (disabledCommands.has(id)) return;
      menuHandlers[id]?.();
    }).then((f) => {
      // 订阅是异步的，而组件可能在这中间就卸载了——那时退订函数没人接，
      // 监听者永远留着（同 `ui/useFocusAlarmSound.ts` 里的写法）。
      if (已卸载) f();
      else 退订 = f;
    });

    return () => {
      已卸载 = true;
      退订?.();
    };
    // ⚠️ 依赖同上面那条 keydown：`menuHandlers` / `disabledCommands` 换了身份，
    // 这个闭包读到的就还是旧的那一份。
  }, [menuHandlers, disabledCommands]);

  // ── 原生菜单（macOS 兜底）──────────────────────────────────────────────
  /**
   * 原生菜单**挂上了没有**。挂了就把自绘那条让开。
   *
   * ⚠️ 这个值**只认后端如实回答**，不要改成 `isMac()` 之类的平台判断。
   * 按平台判断的写法在"macOS 上建菜单失败"时会两道菜单都没有——自绘的藏了、
   * 原生那个又没建出来，用户面前就是**一条菜单都没有**。
   */
  const [usingNativeMenu, setUsingNativeMenu] = useState(false);

  /**
   * 当前语言。**只用来当依赖**（不是画字），所以拿 `use语言` 而不是 `useT`。
   *
   * ⚠️ 这条依赖是**欠账，今天补上的**：`nativeMenu.ts` 用的是模块级的 `t`
   * （它不是组件，是一串纯函数），文件头那条注释写着"**语言换了它不会自己
   * 重推**——所以 `ui/useMenus.ts` 那个 effect 的依赖里得有语言"。今天语言
   * 还要重启才生效，所以这条依赖**此刻**推不出差别；它挡的是**以后**：哪天
   * 热切语言做了，漏掉它的症状是**原生菜单栏还停在旧语言**（窗口里已经换了）
   * ——那种地方没人会想到去查依赖数组。
   */
  const 语 = use语言();

  // 把菜单推给原生那一侧。菜单内容有变化（灰的变了、勾变了、主题清单变了）就重推。
  useEffect(() => {
    let alive = true;
    void api.nativeMenu
      .apply(buildNativeTree(menus, disabledCommands, menuChecks, themes, documentTheme))
      .then((ok) => {
        if (alive) setUsingNativeMenu(ok);
      })
      .catch((e) => {
        // 建不出来/挂不上都退回自绘菜单。**不是**让菜单没了。
        console.error("[nota] 原生菜单没挂上，继续用自绘菜单栏", e);
        if (alive) setUsingNativeMenu(false);
      });
    return () => {
      alive = false;
    };
    // ⚠️ `menus` 在内：插件菜单是**启动之后**才拉到的，那一栏晚一刻出现，
    // 原生菜单得跟着重推一次，否则 macOS 的菜单栏里永远没有「插件」。
    // ⚠️ `语` 在内：树里的 `label` 是在 `nativeMenu.ts` 里翻好的（那边用的是
    // 模块级 `t`），不重推就还是旧语言——理由见上面 `语` 那段。
  }, [menus, disabledCommands, menuChecks, themes, documentTheme, 语]);

  // 原生菜单被点了 → 交回 `App.tsx`（那边走 `resolvePick` 判去向），
  // 于是"点菜单"这件事只有一条实现。
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;

    void on<string>(events.nativeMenu, (id) => onNativePick(id)).then((u) => {
      if (alive) unlisten = u;
      else u();
    });

    return () => {
      alive = false;
      unlisten?.();
    };
  }, [onNativePick]);

  return { disabledCommands, menuChecks, usingNativeMenu };
}
