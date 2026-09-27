/**
 * 用户导入的**界面风格**：注入。**这个文件故意什么都不改写。**
 *
 * # 为什么没有 `scopeDocThemeCss` 那样一道限域
 *
 * 因为界面风格**要改的就是整个外壳**。`doc-theme.ts` 里那道限域是为了守住
 * 用户 2026-09-23 划的那条线——文档主题只许动编辑区。界面风格正好反过来：
 * 它就是"外壳的设计语言"，用户写 `[data-ui-style="my-style"] { --bg: … }`
 * 命中的是 `<html>` 底下的所有东西。给它套一层 `.editor-pane` 前缀，
 * 等于把这份文件整个废掉（一条规则都命不中），而且**不报错**。
 *
 * ⚠️ 所以这里的"约定"靠的是**用户按 id 起头写选择器**，不是靠机械改写：
 * `<html>` 上的 `data-ui-style` 就是这份文件被选中时写进去的那个 id
 * （`applyTheme` 干的），用户在文件里照抄那个 id 即可。因此**不需要**
 * 解析 CSS，也不需要 `CSSStyleSheet`——没有改写就没有解析。
 *
 * ⚠️ 反过来说：**没有解析也就没有校验**。用户文件里语法错了一条，
 * WebKit 会自己丢掉那一条（CSS 的容错），我们不做二次报错——
 * 一份风格里有几条不生效，是作者自己的调试过程，不是需要弹窗的事。
 *
 * # 顺序：必须排在内置之后
 *
 * 内置那八档的 CSS 由 Vite 打包进 `<head>`（开发时是注入的 `<style>`、
 * 打包后是一个 `<link>`）。这个函数把用户的 `<style>` **追加到 `<head>` 末尾**，
 * 于是同权重时后者胜出——**这就是"同名覆盖内置"那条规则的全部实现**：
 * 用户放一个 `adwaita.css`，`data-ui-style` 还是 `adwaita`，
 * 上面那份把下面的盖掉，一条冲突检测代码都不用写。
 */

/** 用户风格自己的 `<style>` 元素的 id。 */
const STYLE_ID = "nota-user-ui-style";

/**
 * 注入用户导入的界面风格。传 `null` 表示"当前选的不是导入档"，
 * 把这份样式整个撤掉（内置档或 `auto` 时就是这种情况）。
 *
 * ⚠️ 用**一个固定的 style 元素**做替换，而不是每次 append 一个新的：
 * 后者在用户来回切风格时会原地堆出一串 `<style>`，旧的那份仍然生效，
 * 而且**越早的那份越靠前、越容易被后来的盖住**——结果是"我改了文件、
 * 重启之后没生效"，查不动。（`applyDocTheme` 是同一条理由。）
 */
export function applyUiStyleCss(css: string | null): void {
  const existing = document.getElementById(STYLE_ID);

  if (!css) {
    existing?.remove();
    return;
  }

  const el = (existing as HTMLStyleElement | null) ?? document.createElement("style");
  el.id = STYLE_ID;
  // ⚠️ `textContent` 而不是解析后重建：原样注入是这份文件的设计（见上），
  // 中间插一道解析/序列化只会在出问题时让人分不清是谁改的。
  el.textContent = css;
  if (!existing) document.head.appendChild(el);
}
