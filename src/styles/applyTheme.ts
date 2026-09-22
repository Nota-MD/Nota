/**
 * 把设置里的**三条外观轴**落到 DOM 上。
 *
 * ```text
 * <html data-ui-style="macos" data-ui-mode="dark" data-doc-theme="github">
 * ```
 *
 * 三条轴各自独立（用户 2026-09-22 明确要求）：
 *
 * | 轴 | 属性 | 管什么 |
 * |---|---|---|
 * | 界面风格 | `data-ui-style` | 一整套设计语言：控件形状、圆角、间距、动效、字体栈 |
 * | 明暗 | `data-ui-mode` | 亮/暗。**任何风格下都成立** |
 * | 文档主题 | `data-doc-theme` | 只管正文。不动外壳一分 |
 *
 * 所以 CSS 的组织方式是 `[data-ui-style="x"]` 定形状、`[data-ui-mode="y"]` 定颜色，
 * **两者相乘**。写新风格时不要在图省事把颜色也塞进 style 里——那样它就没法配暗色了。
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
 */
function detectStyle(): Exclude<UiStyle, "auto"> {
  const desktop = (navigator.userAgent + " " + guessDesktop()).toLowerCase();
  if (desktop.includes("kde") || desktop.includes("plasma")) return "adwaita";
  if (desktop.includes("ubuntu")) return "yaru";
  // 探不出来就 Adwaita：它是 GNOME 的原生语言，也是 WebKitGTK 下最不出错的一档。
  return "adwaita";
}

/** WebKitGTK 不会把桌面环境告诉 JS，只能从别处找线索。 */
function guessDesktop(): string {
  // 没有可靠的同步 API。这里退回空串，detectStyle 会给 Adwaita。
  // 等接上 XDG portal 的 `color-scheme` 之后，这里换成读 portal 的值。
  return "";
}

function resolveMode(mode: UiMode): "light" | "dark" {
  if (mode === "auto") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function resolveStyle(style: UiStyle): string {
  return style === "auto" ? detectStyle() : style;
}

/** 把解析后的三条轴写进 `<html>`。返回一个退订函数。 */
export function applyTheme(settings: Settings): () => void {
  const root = document.documentElement;

  const paint = () => {
    root.dataset.uiStyle = resolveStyle(settings.ui_style);
    root.dataset.uiMode = resolveMode(settings.ui_mode);
    // 空串代表"用内置默认主题"，那时把属性去掉、让默认样式接手。
    if (settings.document_theme) {
      root.dataset.docTheme = settings.document_theme;
    } else {
      delete root.dataset.docTheme;
    }
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
