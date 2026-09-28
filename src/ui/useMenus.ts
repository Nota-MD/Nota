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
   * ⚠️ 编辑模式那三条**三选一**，来源是 `settings.view_mode` 而不是某个
   * `useState`：它就是编辑区的 `mode` 属性，两处**必须同源**——各存一份的
   * 症状是"菜单里的 ✓ 在 A 上、编辑区却是 B"。默认值也**必须**和
   * Rust 侧 `ViewMode::default()` 一致（`wysiwyg`），见
   * `settings/mod.rs` 那条测试。
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

      const id = accelIndex.get(accelSig(eventAccel(e)));
      if (!id) return;

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
      // 否则会连 ProseMirror 自己的 Ctrl+B/I/Z 和系统的复制粘贴一起抢掉——
      // 那些键位不在 `menuHandlers` 里，走不到这一行。
      e.preventDefault();
      handler();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accelIndex, menuHandlers, disabledCommands]);

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
