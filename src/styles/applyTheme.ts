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
 * **两者相乘**（8 × 2 = 16 格，见 `theme.css`）。第三条轴**不进选择器**——
 * 内联优先级高于那 16 格，所以十六格 CSS 一行都不用改（`accent.ts` 顶上写着）。
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
 * 属性 / 内联变量**的那几样：两条轴 ＋ 界面字号 ＋ 主题色。
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

/**
 * 探"自动"风格该落到哪个具体风格上。
 *
 * Linux 下靠 `XDG_CURRENT_DESKTOP` 猜桌面环境。**这只是初值**——
 * 用户可以在设置里显式指定（比如在 GNOME 上偏要用 macOS 风格），
 * 指定了就一律听用户的，不再自动探。
 *
 * ⚠️ 这张表要跟着 `UiStyle` 一起长。**探不出来时兜底是 Adwaita**：
 * 它是 GNOME 的原生语言，也是 WebKitGTK 下最不出错的一档。
 *
 * ⚠️ **`windows10` 故意不在这里**：`windows` 这个线索只指向 Win11 那一档。
 * Windows 10 与 Windows 11 在 UA / `XDG_CURRENT_DESKTOP` 上区分不了
 * （`navigator.userAgent` 里只有 "Windows NT 10.0"，而 Win10 和 Win11 报的是
 * **同一个字符串**），所以 `windows10` 是**只能手选**的一档——
 * `ui_style = auto` 永远不会落到它上面。这一条如实写在 `docs/07` 里。
 */
function detectStyle(): Exclude<UiStyle, "auto"> {
  const desktop = (navigator.userAgent + " " + guessDesktop()).toLowerCase();
  if (desktop.includes("kde") || desktop.includes("plasma")) return "plasma";
  if (desktop.includes("ubuntu") || desktop.includes("yaru")) return "yaru";
  if (desktop.includes("windows")) return "windows";
  if (desktop.includes("mac") || desktop.includes("darwin")) return "macos";
  return "adwaita";
}

/** WebKitGTK 不会把桌面环境告诉 JS，只能从别处找线索。 */
function guessDesktop(): string {
  // 没有可靠的同步 API，所以 `XDG_CURRENT_DESKTOP` 目前传不进来——
  // 除非用 `navigator.userAgent` 里那点线索（WebKitGTK 会带上 "Linux"，
  // 但不带桌面名）。**这是"自动"这个选项今天并不真的自动**的原因，
  // 如实记在 `docs/07` 里；想接上得走 XDG desktop portal。
  return "";
}

export function resolveMode(mode: UiMode): "light" | "dark" {
  if (mode === "auto") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

export function resolveStyle(style: UiStyle): string {
  return style === "auto" ? detectStyle() : style;
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
    // ⚠️ 内联在 `<html>` 上的自定义属性**优先级高于**那 16 格
    // `[data-ui-style][data-ui-mode]` 选择器，所以 `theme/color.css` 一行都不用改。
    //
    // ⚠️ **只写 `--accent` / `--accent-fg` 两个**，不碰其余颜色：配色协调由明暗那条
    // 轴保证。前景色是 `accentFg()` 按对比度当场算的——**不存**，理由见
    // `settings/appearance.rs` 的 `accent` 那段。
    const 强调 = accentVars(settings.appearance.accent);
    if (强调) {
      for (const [变量, 值] of Object.entries(强调)) root.style.setProperty(变量, 值);
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-fg");
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
      const 宽 = Math.min(8, Math.max(1, Math.round(settings.editor.paragraph_indent_chars)));
      root.style.setProperty("--para-indent", `${宽}em`);
    } else {
      root.style.removeProperty("--para-indent");
    }
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
