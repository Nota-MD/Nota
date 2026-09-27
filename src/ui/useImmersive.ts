/**
 * 沉浸模式：**专注**（`F8`）与**全屏**（`F11`）合成的那一件事（2026-09-25）。
 *
 * # 两条为什么合成一件事
 *
 * 用户原来的话：「你现在的全屏模式和专注模式也不是那么的好，所以说把它再优化
 * 一下喽，因为现在没有提到实际的让用户更专注的作用」。改之前：全屏只把窗口
 * 放大，菜单栏/侧栏/插件栏/标签栏/状态栏**一条不少**；专注只把非当前段落压暗，
 * 外壳一点没动。两条都没把"视线里多余的东西"拿掉，而写作时真正碍事的正是那些。
 *
 * 所以现在两条**共用一套外壳规则**（`styles/app.css` 的「沉浸模式」那一节，
 * 由 `.app[data-zen]` 一个属性驱动），区别只剩两点：
 *
 * | | 窗口 | 正文 |
 * |---|---|---|
 * | 全屏 | 全屏 | 不动 |
 * | 专注 | 不动 | 压暗非当前段落（`editor/writing-modes.ts`） |
 *
 * 外壳那半为什么要合：**沉浸只有一种长相**。用户在专注里学会了"鼠标顶到窗口
 * 最上面能把顶栏唤回来"，全屏里换个规矩就等于要他学两遍。
 *
 * # 三条出口，一条都不能少
 *
 * 沉浸把**菜单栏**收起来了，而那是界面上唯一写着"怎么退出去"的地方。于是：
 *
 * | 出口 | 给谁 |
 * |---|---|
 * | `F8` / `F11` | 记得住键位的人（键位在 `ui/commands.ts` 那张表里） |
 * | `Esc` | 记不住的人——**这一条是这套界面敢把菜单藏起来的前提** |
 * | 鼠标顶到窗口最上面 | 手里只有鼠标的人（顶栏滑回来，CSS 那半在 `app.css`） |
 *
 * 进沉浸时还会给一条**会自己走掉**的提示说明这三条（见下面那个 effect）。
 *
 * # ⚠️ 全屏那一格状态是**从窗口读回来的**，不是我们自己记的
 *
 * `F11` 只是进全屏的**一条**路：窗口管理器的快捷键、双击标题栏、macOS 的绿灯
 * 都会改它，而那些一条都不经过 `切换全屏`。只在自己调用成功之后翻一下内存里
 * 那个值，症状是"菜单里的勾和窗口真实状态分叉"——而用户看着一个没勾的「全屏」、
 * 窗口却占着整块屏幕，不会知道该信哪个。所以这一格只有一个来源：读窗口。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface 沉浸接线 {
  /**
   * 现在有没有浮层开着（设置、确认框、输入框、pandoc 那个面板）。
   *
   * ⚠️ `Esc` 要先让给它们——沉浸模式**不是唯一**想收 `Esc` 的东西。菜单不在
   * 这个名单里：它自己收自己，收完才轮到这一条。
   *
   * ⚠️ 接线那一侧要**逐个列出来**（`settingsOpen || confirmReq !== null || …`），
   * 不能只传一个"有没有"——那是把四个互相无关的状态在调用处先合成一个布尔，
   * 将来加第五个浮层时改的是 `App.tsx` 而不是这里。列出来的代价是那一行变长，
   * 换来的是"还有谁想收 `Esc`"在调用处一眼可见。
   */
  有浮层: boolean;
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
}

export interface 沉浸出口 {
  /** 外壳认的**那一个**布尔（`专注 ∨ 全屏`），落在 `.app[data-zen]` 上。 */
  沉浸: boolean;
  focusMode: boolean;
  切换专注: () => void;
  fullscreen: boolean;
  切换全屏: () => void;
  /** 退出去（`Esc` 之外的地方要用，比如将来的菜单项）。 */
  退出沉浸: () => void;
}

export function useImmersive(w: 沉浸接线): 沉浸出口 {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const { 有浮层, toast } = w;

  const [focusMode, setFocusMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  /** 读一次窗口，把上面那个镜像对齐。读不出来（窗口还没建好/已经没了）就维持现状。 */
  const 同步全屏 = useCallback(async () => {
    try {
      setFullscreen(await getCurrentWindow().isFullscreen());
    } catch {
      // ⚠️ 故意**不弹提示**：这不是用户发起的动作，报错也无从补救，
      // 弹出来只是多一条他关不掉的信息。
    }
  }, []);

  useEffect(() => {
    void 同步全屏();
    // 全屏切换一定伴随窗口尺寸变化，所以 `onResized` 是能接住它的那一个事件。
    let 退订: (() => void) | null = null;
    void getCurrentWindow()
      .onResized(() => void 同步全屏())
      .then((f) => {
        退订 = f;
      })
      .catch(() => {
        // 订不上就退化成"只在挂载时同步一次"，界面仍然能用。
      });
    return () => 退订?.();
  }, [同步全屏]);

  const 切换全屏 = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      await win.setFullscreen(!(await win.isFullscreen()));
    } catch (e) {
      toast(t("切换全屏失败：{0}", String(e)), "error");
    } finally {
      // ⚠️ **成败都要同步**：失败时窗口没动（同步一次是白做的），成功时窗口动了
      //（这一下才是让勾跟上）。写成"成功才同步"要多一个分支，而那个分支正好是
      // 唯一会漏更新的一条路。
      void 同步全屏();
    }
  }, [toast, 同步全屏]);

  const 切换专注 = useCallback(() => setFocusMode((v) => !v), []);

  /**
   * 退出沉浸：**专注与全屏一起退**。
   *
   * ⚠️ 不区分"现在开着哪一条"，因为对用户来说 `Esc` 的意思是"我写完了，把屏幕
   * 还给我"——让他按一次 `Esc` 之后发现侧栏回来了、菜单栏还在上面挂着，还得再按
   * 一次，那是把内部状态（两个布尔）暴露成了两步操作。
   */
  const 退出沉浸 = useCallback(() => {
    setFocusMode(false);
    // `fullscreen` 是窗口的**镜像**，可能比窗口晚一帧。所以这里读它只是为了
    // "要不要去动窗口"，真正的判据仍在 `切换全屏` 里（它问窗口）。
    if (fullscreen) void 切换全屏();
  }, [fullscreen, 切换全屏]);

  /** 外壳认的那一个布尔。⚠️ 只有这一个出口，见文件头那张表。 */
  const 沉浸 = focusMode || fullscreen;

  // `Esc` 退出沉浸。判据要写全——**沉浸不是唯一想收 `Esc` 的东西**。
  //
  // ⚠️ 不用捕获阶段（`addEventListener` 的第三个参数）：保持和 `useMenus` 里那条
  // 键位分发同一个层级。谁先注册谁先跑这件事在这个应用里没有依赖过，别在这里开这个头。
  useEffect(() => {
    if (!沉浸) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 组字期间一概不接（同 `useMenus` / `useMenuRovingFocus` 里那条判据）。
      if (e.isComposing || e.keyCode === 229) return;
      if (有浮层) return;
      e.preventDefault();
      退出沉浸();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [沉浸, 退出沉浸, 有浮层]);

  /**
   * 进沉浸时给一条**会自己走掉**的提示：怎么出去。
   *
   * ⚠️ 必须有这一条。沉浸收掉的是界面上**唯一写着出路的地方**（菜单栏），而
   * "怎么退出去"没有任何别处写着——靠用户自己按 `Esc` 试出来，等于把一次正常的
   * 交互变成一次小小的惊吓。文案只说三条路，不解释为什么（那是文档的事）。
   *
   * ⚠️ ttl 给 6 秒（默认 3.2 秒）：这句话比"已保存"那种长，读一遍要时间；而它
   * 只是在说路怎么走，多留两秒没有代价。
   */
  const 上次沉浸 = useRef(false);
  useEffect(() => {
    if (沉浸 === 上次沉浸.current) return;
    上次沉浸.current = 沉浸;
    if (!沉浸) return;
    // 三条路里都有这一句，所以单拎出来当 `{0}` 传进去——它在三种情形下是同一句话。
    const 路 = t("鼠标移到窗口最上面可唤回菜单栏");
    toast(
      focusMode && fullscreen
        ? t("专注 + 全屏：F8 / F11 / Esc 退出，{0}", 路)
        : fullscreen
          ? t("全屏：F11 或 Esc 退出，{0}", 路)
          : t("专注模式：F8 或 Esc 退出，{0}", 路),
      "info",
      6000,
    );
  }, [沉浸, focusMode, fullscreen, toast]);

  return { 沉浸, focusMode, 切换专注, fullscreen, 切换全屏, 退出沉浸 };
}
