/**
 * 外壳上那几条"看得见 / 看不见"的开关：**状态栏**、**格式工具栏**、**菜单栏**。
 *
 * # 为什么值得单独一个文件（2026-09-25）
 *
 * 一是因为 `App.tsx` 顶着行数上限（`docs/09` §4），二是这段逻辑本身有个
 * 说清楚才不会再犯的坑，值得有个地方放。
 *
 * **坑是这样的**：这两条原来各有一份内存 `useState`，而设置里那两个开关
 * （外观页的「显示状态栏」「显示工具栏」，字段 `appearance.show_status_bar` /
 * `show_toolbar`）**一个读取者都没有**。于是同一个东西有两个同名不同命的开关：
 *
 * - 菜单「视图 → 状态栏」关掉 → 屏幕上立刻没了，**重启又回来**；
 * - 设置「外观 → 显示状态栏」关掉 → 落盘了，屏幕上**什么都不发生**。
 *
 * 两个都算"界面在撒谎"，而且用户没法判断该信哪一个。这是 2026-09-25 那轮
 * 用户体验评估抓出来的（见 `docs/07`）。
 *
 * # 现在只有一份来源
 *
 * `settings.appearance`。菜单的勾、屏幕上那条状态栏、设置面板里那两个开关，
 * 读的是它，写的也是它（一律走 `updateSettings`——它先改内存再落盘、失败会
 * 把界面回滚）。
 *
 * # ⚠️⚠️ 菜单栏这一条有个**别处都没有**的问题（2026-09-28，用户点名要的）
 *
 * 用户原话：「也要允许用户隐藏上栏，也就是"文件"、"编辑"啥的」。
 *
 * 状态栏、工具栏藏了就藏了——它们是**冗余**的（状态栏那几个数在别处也算得出来，
 * 工具栏上那几条命令菜单里都有）。**菜单栏不是**：它是命令的总入口
 * （最近打开、导出、插件管理只在这里），而且它**自己就是"哪儿能改回来"的
 * 唯一指示牌**。藏下去那一刻，界面上再没有任何一行字写着"菜单栏还能开回来"。
 *
 * 所以这里有一处别处没有的动作：**藏下去的那一刻发一条会自己走掉的提示**
 * （照 `ui/useImmersive.ts` 进沉浸时那条的先例——同一个问题、同一种做法），
 * 内容是两条路：`Alt+M`（见 `ui/commands.ts::view.menuBar`）或者
 * 「设置 → 外观 → 显示菜单栏」（`Ctrl+,` 直达设置）。**两条都写**，因为
 * 用户可能先把键位改了、或者压根记不住键位，而设置页那条路永远成立。
 *
 * ⚠️ 判据是"**从显示变成隐藏**"这一个跳变，不是"设置里是隐藏的"——后者会在
 * 每次启动时弹一遍（设置是异步读进来的，见下面那个 effect 里的 `settings`
 * 判断）。这一点与 `useImmersive` 那个 `上次沉浸` 完全相同。
 *
 * ⚠️ **这些值是派生出来的，不是 state**。再存一份 state 就又多出一个"要和
 * 设置对齐"的内存值，而"对齐"这件事永远会被某一条路径漏掉——上面那个 bug
 * 就是这么来的。设置还没读进来那一小会儿按各自字段的默认值算。
 *
 * # ⚠️ 工具栏**从"一个布尔"变成了三档**（2026-09-25，用户点名要的）
 *
 * 用户原话：「默认工具栏（黑体 斜体什么的那一栏）隐藏，可在设置中选：
 * 始终显示，鼠标悬停先生（显示），始终不显示，默认为始终不显示」。
 *
 * 中间那一档（`hover`）是**这里唯一有内存状态的东西**：`peek`——"鼠标现在
 * 在上面吗"。它不是设置、不落盘，只是一个"此刻"的量，所以它才可以是
 * `useState`；而**哪一档**永远是设置说了算。两者合起来才是
 * `formatBarOpen`（画不画那一条）。
 *
 * ## 悬停那一档的判据（`在顶上`）
 *
 * | 此刻 | 露出来的区域 |
 * |---|---|
 * | 工具栏**没**画着 | 主区顶端往下 `顶部触发带` 那一条窄带 |
 * | 工具栏**画着** | 指针在工具栏下沿**以上**都算（含菜单栏、查找条那一层） |
 *
 * ⚠️ 第二行不能省成"指针在工具栏的矩形里"。查找条开着的时候，工具栏并不
 * 紧贴主区顶端（`App.tsx` 里查找条排在它前面），中间隔着查找条——只认
 * 矩形的话，鼠标从触发带往工具栏走，**半路穿过查找条那几十像素就会被判成
 * "离开了"**，工具栏在鼠标到达之前先收起来，于是永远点不到。所以"已经露出来"
 * 之后放宽成"还在它下沿以上"：只要一路往下走就是连续的。
 *
 * ⚠️ 触发带**压在主区最顶上那 8px**（不是整个窗口顶端）：那 8px 里本来是
 * 编辑区上边距，鼠标想点正文也不会故意停在那一线；而窗口顶端的菜单栏和
 * 工具条**不该**触发——用户去点菜单时不需要顺带弹出一条工具栏。
 *
 * ⚠️ 悬停那一档**会把正文挤下去**（工具栏在文档流里，不是浮层）。这是有意的
 * 取舍：浮层要盖住正文第一行，而"看的时候挡住内容"比"内容跳一下"更糟。
 * 默认那一档是"始终不显示"，所以这个跳动只在用户主动选了中间那档之后才有。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { Settings, ToolbarMode } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

/** 触发带的高度（px）。见文件头"悬停那一档的判据"。 */
const 顶部触发带 = 8;

export interface 外壳接线 {
  /** 主区（`App.tsx` 的 `<main class="app-main">`）。⚠️ 只用来量它顶端在哪。 */
  主区: RefObject<HTMLElement | null>;
  /**
   * 格式工具栏那一条（`FormatBar` 的根元素）。
   *
   * ⚠️ 悬停那一档**必须**有它：判定"指针还在上面吗"要的是它的真实下沿，
   * 而那个位置随查找条开没开、界面风格、缩放而变——在 JS 里按常量算一份
   * 就是同一个数字存两处（同 `MenuPopup` 里量子菜单高度那段）。
   */
  工具栏: RefObject<HTMLElement | null>;
  /**
   * 发一条会自己走掉的提示。
   *
   * ⚠️ 这个 hook 只为一件事用它：**菜单栏被藏下去的那一刻**（见文件头）。
   * 状态栏和工具栏不需要——它们不会把"怎么开回来"一起藏走。
   */
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
}

export function useChromeVisibility(
  settings: Settings | null,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
  refs: 外壳接线,
) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后那一条要重画，
  // 见 `i18n/index.ts::useT`）。下面那条提示的文案是 `t(…)`。
  const t = useT();
  // ⚠️ 单拎出来当依赖：`refs` 是 `App.tsx` 里现写的对象字面量，**每帧都是新的**，
  // 拿它当依赖等于那条 effect 每帧重跑（同 `useImmersive` 里那个 `toast`）。
  const { toast } = refs;
  const statusBarOpen = settings?.appearance.show_status_bar ?? true;
  const toolbarMode: ToolbarMode = settings?.appearance.toolbar ?? "never";
  // ⚠️ `?? true` 必须与 Rust 侧 `Appearance::default().show_menu_bar` 一致
  // （那边和 `show_status_bar` 摆在一起）：不一致的话，设置还没读进来的那一小会儿
  // 菜单栏会闪一下（默认显示 → 读到"隐藏"再收掉），而那正是用户最可能看错的时刻。
  const menuBarOpen = settings?.appearance.show_menu_bar ?? true;

  // ⚠️ `peek` 只对 `hover` 那一档有意义：另外两档下它一直被按回 `false`
  //（见下面那个 effect 的第一个分支），所以"换成 never 之后工具栏还留着"
  // 这种残留状态不会发生。
  const [peek, setPeek] = useState(false);
  const peekRef = useRef(false);

  /** 改 `peek` 并让 ref 跟着走——**只有值真的变了才 setState**。
   *
   *  ⚠️ 指针移动是**每帧好几个**事件，每个都 `setPeek` 的话，React 虽然对
   *  同值更新会提前退出，但那仍是一次次调度。用 ref 挡在前面，值是
   *  `true` 的时候移动鼠标**一次渲染都不会有**。 */
  const 设Peek = useCallback((next: boolean) => {
    if (peekRef.current === next) return;
    peekRef.current = next;
    setPeek(next);
  }, []);

  useEffect(() => {
    // 不是悬停那一档：把窥视状态收干净，也不挂监听。
    if (toolbarMode !== "hover") {
      设Peek(false);
      return;
    }

    const 判 = (e: PointerEvent) => {
      const bar = refs.工具栏.current;
      if (bar) {
        // 已经露出来了：指针在它下沿以上就算还在上面（见文件头那张表）。
        设Peek(e.clientY <= bar.getBoundingClientRect().bottom);
        return;
      }
      const 主区顶 = refs.主区.current?.getBoundingClientRect().top ?? 0;
      设Peek(e.clientY >= 主区顶 && e.clientY <= 主区顶 + 顶部触发带);
    };

    const 藏 = () => 设Peek(false);

    window.addEventListener("pointermove", 判);
    // 指针移出窗口 / 窗口失去焦点：留着那条工具栏没有意义，而"看不见的
    // 鼠标"再也不会发 `pointermove` 回来把它收掉。
    window.addEventListener("blur", 藏);
    document.documentElement.addEventListener("pointerleave", 藏);
    return () => {
      window.removeEventListener("pointermove", 判);
      window.removeEventListener("blur", 藏);
      document.documentElement.removeEventListener("pointerleave", 藏);
    };
  }, [toolbarMode, refs.主区, refs.工具栏, 设Peek]);

  /** 那一条工具栏现在画不画。三档在这里合成**一个**布尔，外壳只认它。 */
  const formatBarOpen = toolbarMode === "always" || (toolbarMode === "hover" && peek);

  /** 写一条外壳开关。
   *
   *  ⚠️ `appearance` 要**整张表**一起写回：`updateSettings` 只做顶层浅合并，
   *  只给 `{ appearance: { show_status_bar } }` 会把这张表里其它字段
   *  （界面字号、缩放、阅读速度……）全抹成默认值。 */
  const setChrome = useCallback(
    (patch: Partial<Settings["appearance"]>) => {
      if (!settings) return;
      void updateSettings({ appearance: { ...settings.appearance, ...patch } });
    },
    [settings, updateSettings],
  );

  /**
   * 菜单栏**刚被藏起来**的那一次，给一条怎么开回来的提示。
   *
   * ⚠️ 判据是**跳变**（`true → false`），不是"现在是不是隐藏的"。写成后者的话，
   * 每次启动都会弹一遍——设置是异步读进来的，第一帧 `settings` 还是 `null`
   * （那一会儿 `menuBarOpen` 只是默认的 `true`），读到落盘的 `false` 就成了
   * 一次"跳变"。所以下面有两道闸：`settings` 还没到就直接返回（那一次不算数），
   * 以及第一次真正看到值时也不报（`上次 === null`，那时用户什么都没动）。
   *
   * ⚠️ 这里**不看是谁改的**：菜单项、`Alt+M`、外观页那个开关，三条路都落到
   * `appearance.show_menu_bar` 上，于是三条路都会发这条提示。这正是要的——
   * 从设置页关掉的人**同样**需要知道 `Alt+M` 这条近路。
   *
   * ⚠️ ttl 给 6 秒（默认 3.2 秒）：这句话比"已保存"那种长，而它说的是**出路**，
   * 多留两秒没有代价（同 `useImmersive` 那条）。
   */
  const 上次菜单栏 = useRef<boolean | null>(null);
  useEffect(() => {
    if (!settings) return;
    const 上次 = 上次菜单栏.current;
    上次菜单栏.current = menuBarOpen;
    if (上次 === null || 上次 === menuBarOpen || menuBarOpen) return;
    toast(
      t(
        "Menu bar hidden. Press Alt+M or open Settings ▸ Appearance ▸ Show menu bar to bring it back.",
      ),
      "info",
      6000,
    );
  }, [settings, menuBarOpen, toast, t]);

  return { statusBarOpen, formatBarOpen, menuBarOpen, toolbarMode, setChrome };
}
