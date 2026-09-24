/**
 * 把设置里的**界面外观两条轴**落到 DOM 上。
 *
 * ```text
 * <html data-ui-style="macos" data-ui-mode="dark">
 * ```
 *
 * | 轴 | 属性 | 管什么 |
 * |---|---|---|
 * | 界面风格 | `data-ui-style` | 一整套设计语言：控件形状、圆角、间距、动效、字体栈 |
 * | 明暗 | `data-ui-mode` | 亮/暗。**任何风格下都成立** |
 *
 * CSS 的组织方式是 `[data-ui-style="x"]` 定形状、`[data-ui-mode="y"]` 定颜色，
 * **两者相乘**（7 × 2 = 14 格，见 `theme.css`）。
 *
 * ⚠️ **文档主题不在这里**。它既不进 `data-doc-theme`、也不经这里写任何变量，
 * 而是由 `doc-theme.ts` 把一份限域的 CSS 注进 `<style>`，只作用于 `.editor-pane`。
 * 用户 2026-09-23 划的线：「这是文档风格，不是界面风格，不应该影响到UI主题」。
 * 以前这里写过 `data-doc-theme` 并让 `theme.css` 桥接它的变量——那条路
 * 已经被证明会让整个外壳跟着变，拆了。
 */

import type { Settings, UiMode, UiStyle } from "@/bridge/ipc";

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

function resolveMode(mode: UiMode): "light" | "dark" {
  if (mode === "auto") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function resolveStyle(style: UiStyle): string {
  return style === "auto" ? detectStyle() : style;
}

/**
 * 把两条轴解析成具体的那一格（`{ style: "macos", mode: "dark" }`）。
 *
 * ⚠️ 导出来是给**偏好设置里的明暗预览**用的：那两张缩略图要长成"选它之后
 * 应用真的会变成的样子"，判据必须和上面这同一套。自己再写一遍
 * `matchMedia` 的话，「跟随系统」那一格会和真实外观不一致——而那时候用户
 * 已经按着预览做了选择。
 */
export function resolveAppearance(settings: Pick<Settings, "ui_style" | "ui_mode">): {
  style: string;
  mode: "light" | "dark";
} {
  return { style: resolveStyle(settings.ui_style), mode: resolveMode(settings.ui_mode) };
}

/** 把解析后的两条轴写进 `<html>`。返回一个退订函数。 */
export function applyTheme(settings: Settings): () => void {
  const root = document.documentElement;

  const paint = () => {
    root.dataset.uiStyle = resolveStyle(settings.ui_style);
    root.dataset.uiMode = resolveMode(settings.ui_mode);
    root.style.setProperty("--ui-font-size", `${settings.ui_font_size}px`);
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
