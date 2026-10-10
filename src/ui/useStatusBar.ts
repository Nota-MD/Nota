/**
 * **状态栏那一堆 props 的接线**。2026-09-30 晚从 `App.tsx` 搬出来的。
 *
 * # 为什么搬
 *
 * 不是"看着不顺眼"：那天加完状态栏的两颗按钮（拼写、字数统计菜单）之后
 * `App.tsx` **1003 行**，越过了 `tools/doc-sync-check.sh` 那条 1000 行硬线。
 * 那条线的判据是"就地按职责拆"（`docs/09` §4），而这一块**正好是一个完整
 * 的职责**：它回答的全是同一个问题——**"界面上这几个开关，各自读写设置里的
 * 哪一格"**。
 *
 * ⚠️ 这不是"把 JSX 挪个地方"：下面那四条回调里各有一处**只有这里知道**的
 * 判据（哪一格、要不要先把那张表铺开、设置没读回来时算什么），原先它们
 * 散在 `App.tsx` 那 40 行 JSX 的注释里。
 *
 * # ⚠️ 它一个状态都不存
 *
 * 这个 hook 里**没有 `useState`**，返回的每一项都是从上头的 `settings` /
 * `viewMode` / `sidebarOpen` 现算的。这正是 `ui/StatusBar.tsx` 文件头那条
 * "**不要第三个真相**"在这一层的落法——四格值的家分别在上面那几个参数指的
 * 地方，这里只负责把"从哪儿读、往哪儿写"配好。
 *
 * ⚠️ 哪天有人在这里加一个 `useState` 来"记住上次选的是哪个"，那条规矩就破了：
 * 症状是"菜单里选了，勾也动了，重开又变回去"（或者反过来，界面上是新的、
 * 设置文件里是旧的）。
 *
 * # 返回值的类型是**从 `StatusBar` 身上取的**
 *
 * `ComponentProps<typeof StatusBar>`——不是手抄一份 props 类型。手抄的那份
 * 迟早会与组件分家，而分家的症状是 `tsc` 在这边**不报错**（多一个少一个
 * 它都看不出来，因为两边各自自洽），只在运行时表现为某个开关点了没反应。
 * 写成"从组件取"之后，给 `StatusBar` 加一个必填 prop，**这里当场就红**。
 */

import type { ComponentProps, Dispatch, SetStateAction } from "react";

import type { Document, Settings, ViewMode } from "@/bridge/ipc";
import type { FocusState } from "@/bridge/types";
import type { StatusMetric } from "@/bridge/types-settings";
import { StatusBar } from "@/ui/StatusBar";

/** `StatusBar` 要的全部 props。**别手抄**，见文件头最后那段。 */
type 栏的props = ComponentProps<typeof StatusBar>;

export function useStatusBar(接线: {
  /** 读回来的设置。`null` = 还没读回来（那几格各自走自己的兜底）。 */
  settings: Settings | null;
  /** 改设置并落盘（`App.tsx` 那个 `updateSettings`，**顶层浅合并**）。 */
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** 当前**实际**编辑模式（`App.tsx` 的 `viewMode`：偏见过降级之后的那一个）。 */
  viewMode: ViewMode;
  /** 切编辑模式（`App.tsx` 的 `设模式`）。⚠️ 会话内状态，不落盘。 */
  设模式: (m: ViewMode) => void;
  /** 当前文档。没打开文档时是 `null`。 */
  doc: Document | null;
  /** 侧栏开合（`App.tsx` 的 `sidebarOpen`）。 */
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  /** 强制专注此刻的状态（`ui/useForceFocus.ts`）。 */
  focus: FocusState | null;
  /**
   * **写一条外壳开关**（`ui/useChromeVisibility.ts` 的 `setChrome`，2026-10-04 加）。
   *
   * ⚠️ 收这一栏的那颗 ×（`docs/07` 第 49 项）走它，而**不是**在下面再写一份
   * `updateSettings({ appearance: { … } })`：那会变成同一个写的第三份抄本
   * （前两份是 `onPickMetric` / `onSetSpellcheck`），而"`appearance` 要整张表
   * 一起写回"这条规矩每多一份抄本就多一次漏抄的机会。第 49 项的口径正是
   * **四条入口（菜单 / 快捷键 / × / 设置页）汇到同一个 setter**。
   */
  设界面: (patch: Partial<Settings["appearance"]>) => void;
}): 栏的props {
  const { settings, updateSettings, viewMode, 设模式, doc, sidebarOpen, setSidebarOpen, focus, 设界面 } =
    接线;

  return {
    doc,
    mode: viewMode,
    sidebarOpen,
    // 强制专注的余额。**没在跑时那一格不画**（见 `ui/FocusMeter.tsx`）。
    focus,
    // 「约几分钟读完」那一格用哪个除数，由设置里那一项说了算。
    // ⚠️ 兜底那个 382 与 Rust 的 `Appearance::default().reading_speed` 同值。
    readingSpeed: settings?.appearance.reading_speed ?? 382,
    // 那一格**平时**显示哪一个统计量（其余三个在那个小菜单里各自带着数值摆着）。
    // ⚠️ 兜底那个 `"words"` 与 Rust 的 `StatusMetric::Words`（`#[default]`）同值
    // ——不一致的症状是"启动那一瞬间先显示另一个数、随后自己跳一下"。
    // `tests/status-metric.test.ts` 第二组把这两处钉在一起。
    metric: settings?.appearance.status_metric ?? "words",
    // 拼写检查那个开关的**第二个入口**（第一个是设置页）。⚠️ 两处共用同一格
    // `editor.spellcheck`、同一个 `updateSettings`——值一变，
    // `ui/useSpellcheck.ts` 那条 effect 就把它拨到引擎上（真正干活的是那边）。
    // `null` = 设置还没读回来，菜单里两项都灰（别拿一个假设值去拨引擎）。
    spellcheck: settings?.editor.spellcheck ?? null,
    // 那一格的语言（2026-10-10）。这里**只用来把菜单第一项的措辞说准**——
    // 配了具体语言时它还写"自动检测语言"就是在骗人（`ui/StatusBar.tsx` 里那段）。
    // ⚠️ 这一格必须**原样**递过去：空串是"跟随系统"那一档，`?? null` 会把空串
    // 留成空串（`??` 只吃 `null` / `undefined`，正合用）。
    拼写语言: settings?.editor.spellcheck_lang ?? null,

    // ⚠️ 下面两条 patch 都**先把那张表铺开**：`updateSettings` 只做**顶层**
    // 浅合并，`{ appearance: { status_metric } }` 会把 appearance 里另外
    // 十几格一起抹掉（同一个坑在 `useChromeVisibility.ts` 里也标着）。
    // 这两条里各判一次空而不是用 `!` 断言：设置没读回来的那一瞬间点一下，
    // 断言的症状是当场炸。
    onPickMetric: (m: StatusMetric) => {
      if (!settings) return;
      void updateSettings({ appearance: { ...settings.appearance, status_metric: m } });
    },
    onSetSpellcheck: (on: boolean) => {
      if (!settings) return;
      void updateSettings({ editor: { ...settings.editor, spellcheck: on } });
    },

    // 与「视图 → 显示/隐藏侧边栏」、`Ctrl+Shift+L`、侧栏那颗 ×
    // 是**同一个开关的第五个入口**，共用 `App.tsx` 那个 setter。
    onToggleSidebar: () => setSidebarOpen((v) => !v),

    // 「切换代码/所见即所得」。⚠️ **改的是 `ui/useFileKindMode.ts` 那份 `模式偏好` 本身**
    // （不是另开一份"状态栏眼里的模式"）：`ViewMode` 那三选一的口径在
    // `bridge/types.ts`，各存一份的症状见 `App.tsx` 里 `viewMode` 那一段。
    // ⚠️ 2026-10-07 起它**不落盘**（会话内状态，默认启动所见即所得），所以
    // 这里走 `设模式` 而不是 `updateSettings`。
    // 分屏点它 → 进源码模式（那一颗的语义是"是不是源码"）。
    onToggleSource: () => {
      设模式(viewMode === "source" ? "wysiwyg" : "source");
    },

    // **最右端那颗 ×**（2026-10-04，第 49 项）。⚠️ **只收不切换**：菜单里那条
    // （`useCommandTable.ts` 的 `view.statusBar`）才是开关，而两条走的是
    // **同一个 `setChrome`**（就是上面那个 `设界面`）。
    onHide: () => 设界面({ show_status_bar: false }),
  };
}
