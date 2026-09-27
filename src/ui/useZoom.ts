/**
 * 界面缩放与界面字号：把 `appearance.zoom` 落到 webview 上、把 `ui_font_size`
 * 落到 `<html>` 的内联变量上，并管住 Ctrl+滚轮那一档。
 *
 * # 为什么走 Tauri 的 webview 缩放，而不是 CSS
 *
 * 「缩放」那一组自己的 help 写着**它缩的是整个界面（外壳 ＋ 编辑区）**，
 * 而「字体大小」只缩外壳的文字，两者**叠乘**。要的就是这个意思，所以：
 *
 * | 做法 | 结果 |
 * |---|---|
 * | `webview.setZoom()` | 整个页面按比例放大，**视口单位跟着换算**，`100vh` 的外壳仍然正好一屏（本项采用） |
 * | CSS `zoom` 写在 `<html>` 上 | 这条应用是 `100vh` 撑满的，放大之后内容比窗口高 → 滚动条 ＋ 底边被切 |
 * | CSS 里放大 `--ui-font-size` | 那就成了第二个"字体大小"，与上面那条口径直接冲突 |
 *
 * ⚠️ **`appearance.zoom` 这一项 2026-09-25 之前存了值没人读**：设置里从 100 改到
 * 300，界面一个像素不动（实测 AE = 50.25，同批已接线的控件做标尺是 8124~11864）。
 *
 * # Ctrl+滚轮为什么要自己写
 *
 * 实测过：本仓库这套 WebKitGTK（**不带修饰键**的普通滚轮能正常滚面板，
 * AE = 13436）**不会**因为 Ctrl+滚轮缩放页面（同一位置 Ctrl+滚轮，AE = 0）。
 * 所以这里自己接一份，不存在"系统缩一次、我再缩一次"的重叠。
 *
 * ⚠️ 滚轮是**热路径**：一格一次 `updateSettings` 会把设置文件写穿（每一格一次
 * IPC ＋ 一次磁盘写）。所以**立刻改、攒 400ms 再落盘**——观感是"滚到哪停到哪"，
 * 而落盘只有最后一次。
 *
 * # Ctrl+滚轮改什么：两档，**默认字号**（2026-09-26）
 *
 * 用户原话：「可选'字体大小'或'界面实际缩放'，**默认字体大小**」。所以
 * `ctrl_wheel_zoom`（老开关）只管"生不生效"，**改什么**由 `ctrl_wheel_target`
 * 说了算：
 *
 * | `ctrl_wheel_target` | 滚一格动的是 | 立刻见效靠 | 落盘写的是 |
 * |---|---|---|---|
 * | `"font_size"`（默认） | 界面字号 `ui_font_size`（12~20px，一格 1px） | 直接写 `<html>` 上那个 `--ui-font-size`（与 `applyTheme` 同一格变量） | 顶层 `ui_font_size`，**并且顺手把 `custom_font_size` 打开** |
 * | `"zoom"` | 整个界面 `zoom`（50~300%，一格 10%） | `webview.setZoom()` | `appearance.zoom` |
 *
 * ⚠️ **改字号必须顺手打开 `custom_font_size`**：那一格是"这个数算不算数"的开关
 * （`applyTheme.ts` 里那一支写着）。不打开的话滚轮**看起来一点用都没有**——
 * `ui_font_size` 从 15 滚到 18，界面一个像素不动，而设置里那个数确实变了。
 * 这不是"替用户多做一步"，这就是"滚轮改字号"这件事本身的意思。
 *
 * ⚠️ **两个上下界与步长必须与设置界面里那两个控件一致**（`AppearancePane.tsx`：
 * 字号 `Range` 是 `min=12 max=20`、步长默认 1；缩放 `NumberInput` 是
 * `min=50 max=300 step=10`）。不一致的症状是"滚轮能滚到设置里填不出来的值"。
 *
 * # 键盘那三档（2026-09-27）
 *
 * 「视图」菜单里多了**放大 / 缩小 / 实际大小**（`Ctrl+=` / `Ctrl+-` / `Ctrl+0`，
 * `docs/10` §5「缩放（应用级）」那一格）。它们**跟滚轮走同一条路**：同样的
 * 夹紧、同样的"先见效再攒 400ms 落盘"、同样写 `appearance.zoom`。
 * 只有两处不一样：
 *
 * - **不看 `ctrl_wheel_zoom`**。那个开关管的是"滚轮要不要改缩放"，而菜单项
 *   是用户**指名要改**——用一个管滚轮的开关把菜单项也一起关掉，症状是
 *   "点了没反应"（同 `emoji_autocomplete` 那一类账：开关的语义不能自己长大）。
 * - **改的永远是 `zoom`**，不跟 `ctrl_wheel_target` 走。那格管的是"滚轮改的是
 *   字号还是缩放"，菜单上那三条写的就是缩放，跟着它飘是名不副实。
 *
 * ⚠️ **`Ctrl+=` 要小心 WebKitGTK 自带的那条整页缩放**：本仓这套 webview
 * **不响应** Ctrl+滚轮（实测，见上），但键盘那条未必不响应——真撞上就是
 * "一次按键缩两档"。挡住它的地方在 `ui/useMenus.ts` 的 keydown：**接了的键位
 * 一律 `preventDefault`**（那条注释写着为什么"只在真要执行时才挡"）。所以
 * 这三档必须走菜单表（`commands.ts` 的 `accel`），**不能**自己再挂一个监听
 * ——自己挂的那份不会 `preventDefault`，就等于把两个缩放叠在一起。
 * ⚠️ 这条**没在真窗口里量过**（无头窗口里没有 WebKit 的按键默认行为这一层
 * 可信的观测点），开窗目检时把它算一件事：连按三次 Ctrl+=，看是不是**正好
 * 三档**（100 → 130）而不是六档。
 *
 * ⚠️ **`Ctrl+Shift+=` 不生效**（很多键盘上那才是打出 `+` 的按法）。这是
 * `ui/accel.ts` 的规矩决定的：`accelSig` 把 Shift 当独立一维，`Ctrl+=` 与
 * `Ctrl+Shift+=` 是两个签名。**没有**为它开后门（在共享的归一化里给某个键
 * 特判"Shift 不算数"，等于让那张表对所有命令都不可信）。菜单上写着
 * `Ctrl+=`，按它就有用——不是"写了做不到的事"，只是没多认一种写法。
 *
 * ⚠️ **「实际大小」的键位是 `Ctrl+Shift+0`，不是 `Ctrl+0`**：`Ctrl+0` 在
 * 本仓是「正文」（`para.text`），`accelSig` 认出来是撞车、先到的那条生效。
 * 这件事是 `tools/menu-harness` 的 `#accel` 场报出来的（原话钉在
 * `ui/commands.ts` 那三条的注释里）。换的是**复位**这一条，不是「正文」——
 * 理由同样在那一处。
 *
 * ⚠️ **字号"立刻见效"那一步是另写一处**（内联 CSS 变量，`applyTheme` 也写它）。
 * 这里不调 `updateSettings` 是**故意的**（见上一条）。代价是小概率的：如果那
 * 400ms 里别处又改了一次设置，`applyTheme` 会拿**设置里还没更新的**字号重刷
 * 一遍，界面**弹回旧值一下**，等落盘到了再跳到新值。要正好撞上才会发生，
 * 真发生时表现是"滚完闪一下"——记在这里，不是没想到。
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import type { Settings } from "@/bridge/ipc";

/** 缩放百分比的上下限与一格滚轮的步长。⚠️ 与 `AppearancePane` 里 `NumberInput` 的 min/max/step **必须一致**。 */
const 缩放最小 = 50;
const 缩放最大 = 300;
const 缩放步长 = 10;

/** 界面字号的上下限与一格滚轮的步长。⚠️ 与 `AppearancePane` 里那个 `Range` **必须一致**。 */
const 字号最小 = 12;
const 字号最大 = 20;
const 字号步长 = 1;
/** 字号算不出来时的兜底。⚠️ 与后端 `Settings::default()` 的 `ui_font_size` 对齐（15）。 */
const 默认字号 = 15;

/** 攒多久再落盘。太短等于没攒，太长会让"滚完马上关窗"丢掉最后一次。 */
const 落盘延迟 = 400;

function 夹(值: number, 最小: number, 最大: number, 兜底: number): number {
  if (!Number.isFinite(值)) return 兜底;
  return Math.min(最大, Math.max(最小, Math.round(值)));
}

let 抱怨过 = false;

/**
 * 把缩放交给 webview。
 *
 * ⚠️ **不在 Tauri 里跑时（纯 `vite` 开着看页面）这个调用一定会抛**，而那不是
 * 错误——只说明这一层不存在。所以安静跳过，但**留一句 warn**（同一个问题只说
 * 一次，免得刷屏），否则将来"缩放坏了"会连一点线索都没有。
 */
async function 设缩放(百分比: number) {
  try {
    await getCurrentWebview().setZoom(夹(百分比, 缩放最小, 缩放最大, 100) / 100);
  } catch (e) {
    if (!抱怨过) {
      抱怨过 = true;
      console.warn("[nota] 设置界面缩放失败（不在 Tauri 里跑时会这样，属正常）：", e);
    }
  }
}

/**
 * 把界面字号写进 `<html>`，**与 `applyTheme` 写的是同一格变量**。
 *
 * ⚠️ 这里**不判** `custom_font_size`：调用它的人是滚轮那一支，而滚轮改字号
 * 的意思就是把那一格打开（见文件头）。设置那边的那一支仍然由 `applyTheme`
 * 说了算——两处写同一个变量，谁后写谁生效，这正是"立刻见效"要的。
 */
function 设字号(px: number) {
  document.documentElement.style.setProperty(
    "--ui-font-size",
    `${夹(px, 字号最小, 字号最大, 默认字号)}px`,
  );
}

/** 一个"攒一会儿再落盘"的闸。⚠️ 字号与缩放**各要一个**：攒到的那点是要写的补丁不一样。 */
function 用攒盘(): { 排: (落: () => void) => void; 取消: () => void } {
  const 定时器 = useRef<number | null>(null);
  const 排 = useCallback((落: () => void) => {
    if (定时器.current !== null) window.clearTimeout(定时器.current);
    定时器.current = window.setTimeout(() => {
      定时器.current = null;
      落();
    }, 落盘延迟);
  }, []);
  const 取消 = useCallback(() => {
    if (定时器.current !== null) window.clearTimeout(定时器.current);
  }, []);
  // ⚠️ 这里**必须 `useMemo`**：直接返回字面量的话，每次渲染都是一个新对象，
  // 拿它当依赖的 `排落盘缩放/字号`（以及挂滚轮监听那条 effect）就每次渲染都重建、
  // 每渲染一次摘一次监听再挂一次。功能上看不出坏，但滚轮是热路径，
  // 而且那种"每次都重挂"的写法以后加 `{ once: true }` 之类会突然出怪事。
  return useMemo(() => ({ 排, 取消 }), [排, 取消]);
}

/**
 * 键盘那三档的出口（`ui/commands.ts` 的 `view.zoomIn/zoomOut/zoomReset`）。
 *
 * ⚠️ 三个函数的**身份必须稳定**（`useCallback`）：它们要进
 * `ui/useCommandTable.ts` 那张表的依赖数组（那里用 `Object.values(输入)`），
 * 身份每帧换一次就等于那张表每帧重建，而它的身份是给原生菜单栏用的。
 */
export interface 缩放动作 {
  放大: () => void;
  缩小: () => void;
  /** 回到 100%。⚠️ 是 **100 这个数**，不是"设置里原先那个值"——菜单上写的是「实际大小」。 */
  复位: () => void;
}

export function useZoom(
  settings: Settings | null,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
): 缩放动作 {
  const a = settings?.appearance ?? null;
  const 想缩放 = a?.zoom ?? 100;
  // ⚠️ 字号在**顶层**（`settings.ui_font_size`），不在 `appearance` 里——这是
  // 「外观」那一页的老结构，理由写在 `settings/appearance.rs` 的文件头。
  // 兜底那个 15 与后端 `Settings::default()` 对齐。
  const 想字号 = settings?.ui_font_size ?? 15;
  const 允许滚轮 = a?.ctrl_wheel_zoom ?? false;
  const 目标 = a?.ctrl_wheel_target ?? "font_size";
  // 设置到手了没有。**只用来挡住"还没读到设置就往 webview 上写"**：启动那一两百
  // 毫秒里 `想缩放` 是兜底的 100，照着它设一次会让写着 150 的用户先闪一下 100%。
  // 这个事实是单调的（`null` → 有值，不会退回去），所以它与 `想缩放` 分开依赖。
  const 设置已到 = a !== null;

  // 已经生效的那个值。滚轮的加减要按**它**算：落盘是去抖的，中间那几格设置里
  // 还没有，按设置算的话连滚五格会被算成同一个数。⚠️ 两条轴各记一个。
  const 已应用缩放 = useRef(夹(想缩放, 缩放最小, 缩放最大, 100));
  const 已应用字号 = useRef(夹(想字号, 字号最小, 字号最大, 默认字号));
  // 去抖窗口里设置可能被别处改掉（换个界面风格、改个字号），所以补丁要带上
  // **最新**的那份外观，不能用手抽那一帧闭包里的那份——否则会把别人刚改的值写回去。
  const 最新外观 = useRef(a);
  最新外观.current = a;

  useEffect(() => {
    if (!设置已到) return;
    已应用缩放.current = 夹(想缩放, 缩放最小, 缩放最大, 100);
    // ⚠️ 字号**只对基准、不写 DOM**：那一格变量归 `applyTheme` 管（它要处理
    // "自动"那一档——`custom_font_size` 为假时是把内联值**摘掉**）。这里要是
    // 也写一遍，用户选着「自动」而 `ui_font_size` 是 18，内联值会把自动档的
    // 效果整个盖掉，而设置里那两档看起来还是对的。
    已应用字号.current = 夹(想字号, 字号最小, 字号最大, 默认字号);
    void 设缩放(想缩放);
  }, [设置已到, 想缩放, 想字号]);

  const 缩放闸 = 用攒盘();
  const 字号闸 = 用攒盘();

  const 排落盘缩放 = useCallback(
    (zoom: number) => {
      缩放闸.排(() => {
        // ⚠️ 设置还没到（启动那一两百毫秒）就什么都别写：凭空拼一份 `appearance`
        // 会把其余那些字段**恢复成默认值**，用户的字体大小、主题分配一起没了。
        const 现在 = 最新外观.current;
        if (!现在) return;
        void updateSettings({ appearance: { ...现在, zoom } });
      });
    },
    [updateSettings, 缩放闸],
  );

  const 排落盘字号 = useCallback(
    (ui_font_size: number) => {
      字号闸.排(() => {
        const 现在 = 最新外观.current;
        if (!现在) return;
        // ⚠️ 两处一起写：`ui_font_size` 在**顶层**、`custom_font_size` 在
        // `appearance` 里，而 `updateSettings` 只做**顶层浅合并**——`appearance`
        // 一旦出现就必须是**整张表**（少写一格就是把它恢复成默认值）。
        最新外观.current = { ...现在, custom_font_size: true };
        void updateSettings({
          ui_font_size,
          appearance: { ...现在, custom_font_size: true },
        });
      });
    },
    [updateSettings, 字号闸],
  );

  /**
   * **改缩放这个动作本身**（夹紧 → 立刻见效 → 攒着落盘）。
   *
   * ⚠️ 抽出来是给**滚轮与键盘两处共用**的：`docs/10` §5「缩放（应用级）」那一格
   * 的判据就是"接到同一处"，两处各写一份的话，夹紧点与去抖窗口迟早漂开
   * （同 `editor/footnote.ts` 里那条"编号分配只有一处实现"）。
   */
  const 应用缩放 = useCallback(
    (值: number) => {
      const 下一格 = 夹(值, 缩放最小, 缩放最大, 100);
      // 已经顶到 50% 或 300% 了（或者根本没变）：别再改，也别再排一次落盘。
      if (下一格 === 已应用缩放.current) return;
      已应用缩放.current = 下一格;
      void 设缩放(下一格); // 先见效
      排落盘缩放(下一格); // 再落盘（去抖）
    },
    [排落盘缩放],
  );

  useEffect(() => {
    if (!允许滚轮) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      // ⚠️ 不 `preventDefault` 的话这次滚轮会接着去滚编辑区 / 插件面板。
      // 要挡住它就**必须**是 non-passive 的监听（见下面的 `passive: false`）。
      e.preventDefault();

      if (目标 === "font_size") {
        const 下一格 = 夹(
          已应用字号.current + (e.deltaY < 0 ? 字号步长 : -字号步长),
          字号最小,
          字号最大,
          默认字号,
        );
        // 已经顶到 12px 或 20px 了：别再改，也别再排一次落盘。
        if (下一格 === 已应用字号.current) return;
        已应用字号.current = 下一格;
        设字号(下一格); // 先见效
        排落盘字号(下一格); // 再落盘（去抖）
        return;
      }

      // ⚠️ 加的是**已应用**那个值、不是设置里那个：落盘是去抖的，中间那几格
      // 设置里还没有，按设置算的话连滚五格会被算成同一个数（见上面 `已应用缩放`）。
      // 滚过头（比如已经 300 还往上滚）由 `应用缩放` 里的夹紧吞掉，什么都不发生。
      应用缩放(已应用缩放.current + (e.deltaY < 0 ? 缩放步长 : -缩放步长));
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
    // ⚠️ `目标` 在依赖里：换档之后要**重新挂**一次监听，否则闭包里那个 `目标`
    // 还是挂载时的那一档——症状是"设置里改成缩放，滚轮却还在改字号"。
  }, [允许滚轮, 目标, 应用缩放, 排落盘字号]);

  // 卸载时把还没落盘的那几次取消掉——应用退出时窗口已经在拆了，写盘没有意义，
  // 而且会跟"关窗时保存设置"那一路撞上。
  useEffect(
    () => () => {
      缩放闸.取消();
      字号闸.取消();
    },
    [缩放闸, 字号闸],
  );

  // ── 键盘那三档（`ui/commands.ts` 的 `view.zoomIn/zoomOut/zoomReset`）──
  //
  // ⚠️ **不看 `允许滚轮`、也不看 `目标`**：理由在文件头那一节（那是滚轮的开关，
  // 不是缩放的开关）。⚠️ 三档也**不要求有活动文档**——缩放是应用级的，
  // 一篇文档都没打开时按 `Ctrl+=` 也该有用（`commands.ts` 那三条没有 `needsDoc`）。
  //
  // ⚠️ **设置还没到手里时（启动那一两百毫秒）按下去什么都不做**：`已应用缩放`
  // 那一刻是兜底的 100，照它加一档会让写着 150 的用户先被拽到 110，然后设置
  // 到达又被拉回 150。`应用缩放` 不判这一条（滚轮那边由 `允许滚轮` 挡着，
  // 而那个值本身来自设置），所以判据放这里。
  return useMemo<缩放动作>(
    () => ({
      放大: () => {
        if (!设置已到) return;
        应用缩放(已应用缩放.current + 缩放步长);
      },
      缩小: () => {
        if (!设置已到) return;
        应用缩放(已应用缩放.current - 缩放步长);
      },
      复位: () => {
        if (!设置已到) return;
        应用缩放(100);
      },
    }),
    [设置已到, 应用缩放],
  );
}
