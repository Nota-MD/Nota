/**
 * 「文档主题」那一页那四个可调项 → **四个 CSS 变量**（2026-09-27）。
 *
 * | 设置项 | 变量 | 谁读它 |
 * |---|---|---|
 * | `line_height` | `--doc-line-height` | `editor.css` 的 `.editor-mount .ProseMirror` |
 * | `paragraph_gap` | `--doc-para-gap` | `editor.css` 的 `.editor-mount .ProseMirror > * + *` |
 * | `font` | `--font-doc` | 同上（`font-family`） |
 * | `font_size` | `--doc-font-size` | 同上（`font-size`） |
 *
 * ⚠️ **前三个变量文档主题自己也会定义**（`src/styles/themes/*.css` 的 `:root`），
 * 也就是"主题给一套默认，用户在这里逐项盖掉"。所以本函数的输出**必须落在
 * `.editor-pane` 那一层的内联 style 上**，理由见 `settings/document.rs` 文件头
 * 最后一段（一句话：主题的声明就在 `.editor-pane` 上，写在 `<html>` 上靠继承
 * 是**盖不过**它的）。⚠️ 这也是本文件与 `accent.ts` 的差别：那个的结果由
 * `applyTheme.ts` 写进 `<html>`，这个不能。
 *
 * # 纯函数，不碰 DOM
 *
 * 同 `accent.ts`：能被 `tests/doc-typography.test.ts` 直接跑。这一页**唯一
 * 一处"看着差不多、其实会错"的判断**是那三个数与 `editor.css` 里兜底值的
 * 对应关系（改了一处忘了另一处，症状是"用户一打开开关、排版就跳一下"），
 * 而那是可以不靠眼睛就钉住的。
 *
 * # ⚠️ 返回的对象里**只有打开的项**
 *
 * 关着的那一项**一个字都不写**，让主题（或 `editor.css` 的兜底值）说话。
 * 写成 `--doc-line-height: 1.75` 那种"等价于默认"的值是不行的：主题换一套
 * （「极简」是 1.9），用户明明选了"跟随主题"，却被 1.75 顶掉——那就是一格子
 * 拨了不生效的开关，本仓反复栽过（见 `applyTheme.ts` 里「只写不摘」那几段）。
 */

import type { DocFont, DocumentSettings } from "@/bridge/types";

/**
 * 三档正文字体栈。
 *
 * ⚠️ **每一档都带通用族兜底**（`sans-serif` / `serif` / `monospace`）：
 * 前面那些具名字体在这台机器上多半不存在，没有兜底就会落到浏览器的
 * 默认字体上——而那**不报错**，只是看着不对。
 *
 * ⚠️ 不捆绑任何字体文件（`docs/10` §11.2 那条边界）：这里只是**点名系统里
 * 现有的字体**，中文字体优先点 Noto / 思源那两个常见族（与内置主题同一套
 * 写法，见 `src/styles/themes/adwaita/theme.css`）。
 */
const characterBodyStack: Record<DocFont, string> = {
  sans: 'system-ui, "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Noto Serif CJK SC", "Source Han Serif SC", "Times New Roman", serif',
  // ⚠️ 等宽这一档**交给外壳的代码字体**（`theme/base.css` 里的 `--font-mono`）：
  // 选等宽正文的人想要的正是在正文与代码块里看到同一个字体，抄一份字体栈
  // 过来则会两边各走各的（哪天代码字体换了，正文不跟）。
  mono: "var(--font-mono)",
};

/** 行距的生效区间（百分比）。⚠️ 与 `DocThemePane` 那个数字框的 min/max 同一对数。 */
export const lineDistanceScopeEnclose = { min: 100, max: 300 } as const;
/** 段距的生效区间（百分之一 em）。⚠️ `0` 是正当取值：段落之间不留空。 */
export const paragraphDistanceScopeEnclose = { min: 0, max: 300 } as const;
/** 字号的生效区间（相对界面字号的百分比）。 */
export const characterNumberScopeEnclose = { min: 80, max: 200 } as const;

/** 夹一道 + 取整。手改 `settings.toml` 写成 `9999` 的人，不该把一行推到屏幕外。 */
function clamp(value2: number, scopeEnclose: { min: number; max: number }): number {
  const whole = Math.round(value2);
  if (!Number.isFinite(whole)) return scopeEnclose.max;
  return Math.min(scopeEnclose.max, Math.max(scopeEnclose.min, whole));
}

/**
 * 把这一页的设置算成要写进 `.editor-pane` 内联 style 的自定义属性。
 *
 * ⚠️ `文档` 给 `undefined`（设置还没读回来）时返回**空对象**——那是"什么都不知道"，
 * 不能按默认值写一遍：启动那一小会儿写下去的东西，会在真设置到达之前闪一下
 * 用户没选过的排版。
 */
export function DocumentTypographyVars(document: DocumentSettings | undefined): Record<string, string> {
  if (!document) return {};
  const output2: Record<string, string> = {};
  if (document.custom_line_height) {
    // 175 → `1.75`。⚠️ 除以 100 之后的浮点尾巴走 `数()` 抹掉（本文件末尾）。
    output2["--doc-line-height"] = number2(clamp(document.line_height, lineDistanceScopeEnclose) / 100);
  }
  if (document.custom_paragraph_gap) {
    output2["--doc-para-gap"] = `${number2(clamp(document.paragraph_gap, paragraphDistanceScopeEnclose) / 100)}em`;
  }
  if (document.custom_font) {
    output2["--font-doc"] = characterBodyStack[document.font] ?? characterBodyStack.sans;
  }
  if (document.custom_font_size) {
    output2["--doc-font-size"] = `${number2(clamp(document.font_size, characterNumberScopeEnclose) / 100)}em`;
  }
  return output2;
}

/** `1.75` 而不是 `1.7500000000000002`：除以 100 会带出浮点尾巴。 */
function number2(x: number): string {
  return String(Math.round(x * 100) / 100);
}
