/**
 * 文档主题的**限域**与注入。**这是"文档主题碰不到界面"的唯一保证。**
 *
 * # 为什么要有这个文件
 *
 * 文档主题是一段用户（或本仓）写的 CSS。它会写 `h1 { … }`、`body { … }`
 * 这种**裸选择器**——因为写主题的人心里想的是"一份文档"，不是"应用里的
 * 一个格子"。原样注入 `<style>` 的后果是外壳的标题、按钮、侧栏一起被改。
 *
 * 所以注入前把**每条选择器都挂到编辑区之下**：`h1` → `.editor-pane h1`。
 * 这条守卫是机械执行的，**不靠写主题时自觉**——主题文件里就算写错了，
 * 也漏不到界面上。
 *
 * # 上一版为什么被拆掉
 *
 * 上一版做的是"把外部编辑器的主题关进 `#write`"，
 * 另外还做两件事：展开 `@import`、把字体 `url()` 内联成 data: URL。
 * 用户 2026-09-23 说了两条，这个文件因此缩到现在这个大小：
 *
 * 1. **不要内置外部编辑器的主题，会侵权**；不复制第三方主题。
 *    用户自己的主题包可以带资源，宿主会把包内相对 `url()` 内联；`@import`
 *    与远程资源仍在这一层删除。
 * 2. 「这是文档风格，不是界面风格，不应该影响到UI主题」
 *    —— 上一版还会把主题的 `:root` 变量**提升到全局**，再由 `theme.css`
 *    的桥接规则喂给外壳。那正是"选个浅色文档主题、整个应用跟着变亮"的
 *    根源。现在 `:root` 被**改写**成编辑区，变量再也出不去。
 *
 * # 改写规则（顺序不能换）
 *
 * 1. 已经含 `.editor-pane` 的**原样放过**——主题自己写了前缀，再套一层会
 *    变成 `.editor-pane .editor-pane h1`，永远命不中（这是最容易犯的错）；
 * 2. `:root` / `html` / `body` 单独出现时**换成** `.editor-pane`（不是加前缀）
 *    —— 它们指的就是"正文那棵树的根"；
 * 3. 其余一律加 `.editor-pane ` 前缀；
 * 4. `@media` / `@supports` 要**下钻**（里面的选择器同样要收拢）；
 * 5. `@font-face` / `@keyframes` / `@page` **原样放过**——它们的内容不是
 *    选择器，套上前缀会当场失效；
 * 6. `@import` 与不认识的 at 规则**丢掉**：本机离线优先，`@import` 要么
 *    变成一个超时，要么引入一个本仓控制不了的第三方请求。
 *
 * # 为什么用浏览器的解析器而不是正则
 *
 * 正则切 CSS 是经典的出错场景（注释里的花括号、`content: "}"`、嵌套 `@media`）。
 * `CSSStyleSheet` 是最准的那个解析器，而且免费。解析失败时返回空串**不抛**：
 * 换主题失败不该带崩编辑器。
 */

/** 限域的锚点：整块文档区（含左右留白），不是外壳。见 `EditorPane.tsx`。 */
const ANCHOR = ".editor-pane";

/** 主题自己的 `<style>` 元素的 id。 */
const STYLE_ID = "nota-doc-theme";

/** 指代"正文那棵树的根"的选择器。 */
const ROOT_LIKE_RE = /^(:root|html|body)$/i;

/** 认一下 `html body` / `body > p` 这种连续的前导 html/body。 */
const LEADING_ROOT_RE = /^(?:html|body)\b[\s>+~]*/i;

/**
 * 把一份文档主题 CSS 改造成"只作用于编辑区"的样式。**同步**，解析是同步的。
 *
 * 出参可直接塞进 `<style>`。
 */
export function scopeDocThemeCss(css: string): string {
  // `@charset` / `@import` 在**解析之前**先删掉。构造式样式表本来就会忽略
  // `@import`，但不该依赖那个行为——路径上少一次网络请求总是好的。
  const cleaned = css.replace(AT_IMPORT_RE, "");

  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(cleaned);
  } catch {
    // 语法坏到浏览器都不认。返回空串而不是抛——换主题失败不该带崩编辑器。
    return "";
  }

  const out: string[] = [];
  walk(sheet.cssRules, out);
  return out.join("\n");
}

const AT_IMPORT_RE = /@(?:import|charset)\s+[^;]*;/gi;

/** 递归遍历规则表。 */
function walk(rules: CSSRuleList, out: string[]): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;

    switch (rule.type) {
      case CSSRule.STYLE_RULE:
        emitStyleRule(rule as CSSStyleRule, out);
        break;

      // `@media` / `@supports`：条件本身不动，里面的规则照样要收拢。
      case CSSRule.MEDIA_RULE: {
        const media = rule as CSSMediaRule;
        const inner: string[] = [];
        walk(media.cssRules, inner);
        if (inner.length) out.push(`@media ${media.conditionText} {\n${inner.join("\n")}\n}`);
        break;
      }

      case CSSRule.SUPPORTS_RULE: {
        const sup = rule as CSSSupportsRule;
        const inner: string[] = [];
        walk(sup.cssRules, inner);
        if (inner.length) out.push(`@supports ${sup.conditionText} {\n${inner.join("\n")}\n}`);
        break;
      }

      // 描述符/关键帧不是选择器，套前缀会当场失效。原样放过。
      case CSSRule.FONT_FACE_RULE:
      case CSSRule.KEYFRAMES_RULE:
      case CSSRule.PAGE_RULE:
        out.push(rule.cssText);
        break;

      // 剩下的（`@charset`、浏览器不认的东西）一律丢掉。
      default:
        break;
    }
  }
}

/** 一条普通规则 → 一条限域后的规则。 */
function emitStyleRule(rule: CSSStyleRule, out: string[]): void {
  const selectors = splitTop(rule.selectorText).map(scopeSelector).filter(Boolean);
  if (!selectors.length) return;
  out.push(`${selectors.join(", ")} {\n  ${rule.style.cssText}\n}`);
}

/**
 * 把一个选择器收拢到编辑区之下。四条规矩见文件头。
 */
function scopeSelector(sel: string): string {
  let s = sel.trim();
  if (!s) return "";
  if (s.includes(ANCHOR)) return s;
  if (ROOT_LIKE_RE.test(s)) return ANCHOR;

  // Typora 结构名 → Nota 语义结构。这里只做稳定的结构别名，不猜主题 id，
  // 也不为任何单个主题增加程序分支。
  s = s
    .replace(/ul\.task-list(?=[\s>+~,:.#\[]|$)/g, 'ul:has(> li[data-item-type="task"])')
    .replace(/li\.task-list-item\.task-list-done(?=[\s>+~,:.#\[]|$)/g, 'li[data-checked="true"]')
    .replace(/li\.task-list-item(?=[\s>+~,:.#\[]|$)/g, 'li[data-item-type="task"]')
    .replace(/\.md-math-block(?=[\s>+~,:.#\[]|$)/g, ".nota-math-block")
    .replace(/\.mathjax-block(?=[\s>+~,:.#\[]|$)/g, ".nota-math-block")
    .replace(/\.md-diagram-panel(?=[\s>+~,:.#\[]|$)/g, ".nota-diagram");

  // Typora 主题把正文根写成 `#write`。Nota 没有那个 id，但 ProseMirror 的
  // 内容根承担同一个角色。先做这一层兼容替换，其余资源与排版规则就能按
  // Typora 主题的常见写法落地；组件专用选择器仍需按 Nota DOM 改写。
  if (/(^|[\s>+~,(])#write(?![\w-])/.test(s)) {
    const replaced = s.replace(/(^|[\s>+~,(])#write(?![\w-])/g, `$1${ANCHOR} .ProseMirror`);
    return replaced.includes(ANCHOR) ? replaced : `${ANCHOR} ${replaced}`;
  }

  // 连续的前导 html/body 一并换成锚点：`html body > p` → `.editor-pane > p`。
  let rest = s;
  let replaced = false;
  for (;;) {
    const m = rest.match(LEADING_ROOT_RE);
    if (!m) break;
    replaced = true;
    rest = rest.slice(m[0].length);
    if (!rest) break;
  }
  if (replaced) return rest ? `${ANCHOR} ${rest}` : ANCHOR;

  return `${ANCHOR} ${s}`;
}

/**
 * 按**顶层**逗号切选择器。`:is(a, b) h1` 里的那个逗号不是分隔符，
 * 直接 `split(",")` 会把它切坏。
 */
function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";

  for (const ch of text) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * 注入文档主题。传 `null` 表示"无主题"，把主题样式整个撤掉。
 *
 * ⚠️ 用**一个固定的 style 元素**做替换，而不是每次 append 一个新的：
 * 后者在用户来回切主题时会原地堆出一串 `<style>`，而且旧的那份仍然生效，
 * 最后谁都说不清当前是哪套主题。
 *
 * ⚠️ 这个元素必须**追加到 `<head>` 末尾**：编辑区骨架的样式在 `editor.css`
 * 里，权重和主题规则相当（都是两条选择器），靠的就是后者覆盖前者。
 */
export function applyDocTheme(css: string | null): void {
  const existing = document.getElementById(STYLE_ID);

  if (!css) {
    existing?.remove();
    return;
  }

  const el = (existing as HTMLStyleElement | null) ?? document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = scopeDocThemeCss(css) + "\n" + SELECTION_RULE;
  if (!existing) document.head.appendChild(el);
}

/**
 * 选中文字的底色。跟着文档主题走——底色是主题挑的，选中色必须和它配套。
 *
 * ⚠️ **fallback 必须是 `highlight` / `highlighttext` 这两个系统色**，
 * 不能不给。`background: var(--x)` 在 `--x` 不存在时整条声明失效、
 * 回落到 `unset`——也就是 `transparent`，结果就是**选中了看不见**。
 * 给系统色，最差也是"浏览器默认的选中样子"。
 *
 * ⚠️ 两条分开写，各自带各自的 fallback：主题只给了一半时，
 * 另一半也要能单独回落。
 */
const SELECTION_RULE = `${ANCHOR} .ProseMirror::selection,
${ANCHOR} .ProseMirror *::selection {
  background: var(--select-text-bg-color, highlight);
  color: var(--select-text-font-color, highlighttext);
}`;
