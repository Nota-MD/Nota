/**
 * 把设置里的**界面外观三条轴**落到 DOM 上。
 *
 * ```text
 * <html data-ui-style="macos" data-ui-mode="dark" style="--accent:#e95420">
 * ```
 *
 * | 轴 | 落在哪 | 管什么 |
 * |---|---|---|
 * | 界面风格 | `data-ui-style` 属性 | 一整套设计语言：控件形状、圆角、间距、动效、字体栈 |
 * | 明暗 | `data-ui-mode` 属性 | 亮/暗。**任何风格下都成立** |
 * | 主题色 | `style="--accent…"` **内联** | 就那两个变量，其余颜色仍由明暗那条轴保证 |
 *
 * CSS 的组织方式是 `[data-ui-style="x"]` 定形状、`[data-ui-mode="y"]` 定颜色，
 * **两者相乘**（内置 7 × 2 = 14 格，见 `theme.css`）。第三条轴**不进选择器**——
 * 内联优先级高于那 14 格，所以颜色矩阵 CSS 一行都不用改（`accent.ts` 顶上写着）。
 *
 * ⚠️ **为什么前两条走 `data-*` 而主题色走内联**：`data-*` 是"选哪一格"，
 * 是**离散的**、CSS 里必须预先写好所有可能值；内联是"一个连续的量"，
 * 用户能挑的颜色有 1677 万种，写成选择器格是不可能的。这不是两套机制，
 * 是同一件事在两种取值空间里的写法。
 *
 * ⚠️ **文档主题不在这里**。它既不进 `data-doc-theme`、也不经这里写任何变量，
 * 而是由 `doc-theme.ts` 把一份限域的 CSS 注进 `<style>`，只作用于 `.editor-pane`。
 * 用户 2026-09-23 划的线：「这是文档风格，不是界面风格，不应该影响到UI主题」。
 * 以前这里写过 `data-doc-theme` 并让 `theme.css` 桥接它的变量——那条路
 * 已经被证明会让整个外壳跟着变，拆了。
 *
 * ⚠️ **界面缩放（`appearance.zoom`）也不在这里**，它要调 Tauri 的 webview 缩放，
 * 是异步的，走 `ui/useZoom.ts`（那边也管 Ctrl+滚轮那一档）。这里只落**同步写
 * 属性 / 内联变量**的那几样：两条轴 ＋ 界面字号 ＋ 主题色 ＋ 段首缩进 ＋
 * 侧栏宽度（2026-09-30 加的最后一条，拖动那条路见 `ui/SidebarResizer.tsx`）。
 *
 * ⚠️ **`resolveStyle` / `resolveMode` 是导出的**：`ui/useUiMode.ts` 要在同一个
 * 口径上订阅系统明暗，偏好设置里那两张缩略图也要（判据必须和应用真长成什么样
 * 一致，自己再写一遍 `matchMedia` 就会分叉）。
 *
 * ⚠️ **2026-09-25 删掉了一个 `resolveAppearance()`**：它把两条轴一起解析好返回
 * （原本只给设置页那两张缩略图用）。设置页改用 `useUiMode`（要**订阅**，不能只算
 * 一次）＋ `resolveStyle` 之后它就没有读者了——**留着一个没人调、名字又很像在用的
 * 导出函数正是本仓反复吃亏的那种"看起来能用"**。要一起解析两条轴时，自己写
 * `{ style: resolveStyle(...), mode: useUiMode(...) }`。
 */

import type { Settings, UiMode, UiStyle } from "@/bridge/ipc";
import { accentVars } from "./accent";

/** 系统当前的明暗偏好。 */
function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function resolveMode(mode: UiMode): "light" | "dark" {
  if (mode === "auto") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function resolveStyle(style: UiStyle): string {
  // 自动匹配桌面主题的功能已移除；旧设置中的 `auto` 仅作兼容迁移。
  return style === "auto" ? "adwaita" : style;
}

/** 把解析后的两条轴写进 `<html>`。返回一个退订函数。 */
export function applyTheme(settings: Settings): () => void {
  const root = document.documentElement;

  const paint = () => {
    root.dataset.uiStyle = resolveStyle(settings.ui_style);
    root.dataset.uiMode = resolveMode(settings.ui_mode);

    // ⚠️ 「字体大小」那一组是**自动 / 自定义**两档，`ui_font_size` 这个数只有
    // 选「自定义」时才算数（`appearance.custom_font_size` 就是那个"算不算数"）。
    //
    // 自动 → 把内联值**摘掉**，让 `theme.css` 里 `:root` 那条默认值生效
    //（今后某套风格想有自己的一套默认字号，改那一处就行）。
    //
    // ⚠️ 2026-09-25 之前这里是无条件写死 `ui_font_size` 的，于是**那个单选
    // 拨到"自动"和"自定义"效果完全一样**——一个拨了不生效的开关。
    if (settings.appearance.custom_font_size) {
      root.style.setProperty("--ui-font-size", `${settings.ui_font_size}px`);
    } else {
      root.style.removeProperty("--ui-font-size");
    }

    // ⚠️ 「主题色」是**第三条轴**（前两条：`ui_style` 形状、`ui_mode` 明暗），
    // 由用户自己定，见 `styles/accent.ts`。这里照抄上面「字体大小」那一段的
    // 写法，包括**摘掉**那一支——两者都是"内联覆盖 CSS 里那格默认值"，
    // 而"只写不摘"会让"改回跟随风格"这个动作在界面上不生效。
    //
    // ⚠️ 内联在 `<html>` 上的自定义属性**优先级高于**那 14 格
    // `[data-ui-style][data-ui-mode]` 选择器，所以 `theme/color.css` 一行都不用改。
    //
    // ⚠️ **只写 `--accent` / `--accent-fg` / `--switch-on` 三个**（第三个是
    // 2026-09-30 加的，用户那天报「右侧开关还是橙色的」，来龙去脉写在
    // `accent.ts::accentVars` 那段），不碰其余颜色：配色协调由明暗那条轴保证。
    // 前景色是 `accentFg()` 按对比度当场算的——**不存**，理由见
    // `settings/appearance.rs` 的 `accent` 那段。
    const strongConfigure = accentVars(settings.appearance.accent);
    if (strongConfigure) {
      for (const [changeMeasure, value2] of Object.entries(strongConfigure)) root.style.setProperty(changeMeasure, value2);
    } else {
      // ⚠️ **这三个必须一起摘**。`--switch-on` 摘漏了的症状很隐蔽：用户点
      // 「跟随风格」之后 `--accent` 回去了、开关**留在上一个主题色上**——
      // 界面看着"确实变了"，但变的是一个本不该还在那儿的残留值。
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-fg");
      root.style.removeProperty("--switch-on");
    }

    // ⚠️ 「段首缩进」（2026-09-27）走的还是上面那一套"写 / 摘"：关掉时**把变量
    // 摘掉**（而不是写 `0`），让 `editor.css` 里那条 `var(--para-indent, 0)`
    // 的默认值生效——"只写不摘"的话，用户关掉开关会发现缩进还在（同上面两段）。
    //
    // ⚠️ 单位是 **`em`** 不是 `px`：用户填的是"几个字符宽"，汉字宽 = 1em。
    // 正文换成别的字号/字体，缩进跟着变，正是这一项该有的行为。
    //
    // ⚠️ 1~8 这个区间在这里**夹一道**（设置页那个 `NumberInput` 也写着同样的
    // min/max）：手改 `settings.toml` 写成 `999` 的人，不该把一行推到屏幕外面。
    if (settings.editor.paragraph_indent) {
      const width = Math.min(8, Math.max(1, Math.round(settings.editor.paragraph_indent_chars)));
      root.style.setProperty("--para-indent", `${width}em`);
    } else {
      root.style.removeProperty("--para-indent");
    }

    // 侧栏宽度（2026-09-30）。用户拖右缘改的是它（`ui/SidebarResizer.tsx`），
    // 这里负责"设置值 → CSS 变量"那一半。
    //
    // ⚠️ **拖动期间这一条不参与**：拖动是直接写同一个变量（`useZoom` 立下的
    // 先例，见那边文件头），松手才落盘、才绕回这里。所以这里**每个值都写**、
    // 不写"没变就跳过"那种优化——省不下什么，反倒多一条会分叉的判据。
    //
    // ⚠️ **夹一道**（与 `SidebarResizer.tsx` 里那份同一个区间）：手改
    // `settings.toml` 写成 `9999` 的人，不该把正文挤没。⚠️ 两处的数和
    // `theme/base.css` 里的出厂值**必须同值**，改一处要三处一起看。
    //
    // ⚠️ **不是数就退回出厂值**，与 `SidebarResizer.夹侧栏宽` 里那道
    // `Number.isFinite` 同一条理由（那边注释详述了后果）。**少了它这一格
    // 会连累 `theme/base.css`**：后端没给出这一格时这里算出的是 `NaN`，
    // 而 `setProperty("--sidebar-width", "NaNpx")` 是**写进去了的**——
    // 它把那格出厂值 240 顶掉、自己又不合法，于是 `width` 整条声明失效、
    // 退回 `auto`，侧栏宽度改由内容（那句 "No folder is open yet…"）撑开。
    // 看着既不像 240 也不像报错，只像"侧栏宽度不听使唤"。
    const originalWidth = settings.appearance.sidebar_width;
    const sideBarWidth = Number.isFinite(originalWidth)
      ? Math.min(480, Math.max(180, Math.round(originalWidth)))
      : 240;
    root.style.setProperty("--sidebar-width", `${sideBarWidth}px`);

    // ⚠️ 右侧插件栏那一条同理（2026-10-11）：出厂 260 与 `theme/base.css`、
    // `DockResizer.右栏宽默认` 三处同值；不是数就退回出厂值（理由同上那一段）。
    const originalRight = settings.appearance.dock_width;
    const rightBarWidth = Number.isFinite(originalRight)
      ? Math.min(560, Math.max(200, Math.round(originalRight)))
      : 260;
    root.style.setProperty("--dock-width", `${rightBarWidth}px`);
  };

  paint();

  // `ui_mode = auto` 时要跟着系统变（用户在傍晚切了系统主题，应用得跟上）。
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (settings.ui_mode === "auto" && mq) {
    mq.addEventListener("change", paint);
    return () => mq.removeEventListener("change", paint);
  }

  return () => {};
}
