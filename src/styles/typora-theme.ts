/**
 * Typora 主题的加载与改造。**这是"兼容 Typora 主题"整件事的核心文件。**
 *
 * # 为什么不能直接把主题 CSS 塞进 `<style>`
 *
 * 因为 Typora 主题是**给整个应用**写的，不是给"一段正文"写的。
 * 实测真实主题（github / night / newsprint / pixyll / whitey）里，
 * **每套有 21–59 条裸元素规则**——`h1 { font-size: 2.25em }`、
 * `body { color: … }`、`a { color: … }`，**全都没有前缀**。
 * 原样注入的后果是应用外壳的标题、链接、按钮一起被改，侧栏和工具条当场散架。
 *
 * 所以要先**把它们关进 `#write` 里**。`#write` 是 Typora 给正文区的 id，
 * 我们把它挂到 ProseMirror 那一层上（见 `src/editor/create.ts`），
 * 于是主题规则只作用于正文，外壳一根头发都不动。
 *
 * # 改造分四步
 *
 * 1. **展开 `@import`**（`loadThemeCss`，**异步**，所以排在解析之前）。
 *    真实主题会跨文件引：`night.css` 里 import 了 `night/mermaid.dark.css`。
 * 2. **`url()` 换成可用的绝对地址**（`absolutize`）。主题用相对路径引用自己旁边的
 *    字体（`url('./github/xxx.woff2')`）；注入文档之后相对基准会变成**应用的 URL**，
 *    字体全丢。所以每个文件在合并前，先按**它自己所在目录**改写。
 *    ⚠️ 换成的**不是** asset 协议地址而是 **data: URL**——asset 那条路在
 *    WebKitGTK 上取不回字体（CORS 模式的请求 + wry 没登记 cors-enabled），
 *    实测判据记在 `src-tauri/src/themes.rs` 顶上。
 * 3. **解析**：用浏览器的 `CSSStyleSheet` 解析，**不用正则**。
 *    正则切 CSS 是经典翻车现场（注释里的花括号、`content: "}"`、嵌套 `@media`）。
 *    浏览器自己的解析器是最准的那个，而且免费。
 * 4. **选择器收拢**（`scopeSelector`）**＋ 变量提升**（`splitDecls`）。
 *
 * # 边界：哪些东西兼容不了
 *
 * Typora 主题里有大量按**它自己的 DOM** 写的选择器，我们没有那些元素，
 * 这些规则会变成**永远不会命中**的死规则——不报错，也不起作用：
 *
 * - `#typora-sidebar` / `.megamenu` / `#top-titlebar` / `#typora-source`（它自己的外壳）；
 * - `.md-toc` / `.md-math` / `.md-image`（它自己的节点类名）。
 *
 * 这不是 bug 是**边界**：我们没有和它一样的 DOM 契约，就不该假装有。
 * 能拿到的部分是"**正文版式 + 配色**"，而那正是主题的主要价值。
 * 主题的 `:root` 变量我们**提升到全局**，外壳再用桥接规则消费它们
 * （见 `theme.css` 末尾那一段），所以换主题时侧栏、强调色这些也跟着变。
 */

import { convertFileSrc } from "@tauri-apps/api/core";

import { api } from "@/bridge/ipc";

/** 正文区的 id，和 Typora 对齐。见 `src/editor/create.ts` 里挂它的地方。 */
const WRITE = "#write";

/** `@import` 递归的最大层数。防环，也防有人写出一条无限链。 */
const MAX_IMPORT_DEPTH = 8;

/** 主题里的自定义属性会被提升到这一层，供外壳桥接。 */
const ROOT = ":root";

// ── 第一步：加载（异步）──────────────────────────────────────────────────

/**
 * 读一份主题，把它的 `@import` 就地展开、`url()` 就地绝对化，返回**合并后的文本**。
 *
 * 合并顺序就是源码顺序：`@import` 出现在哪一行，被引入的内容就落在哪一行。
 * CSS 的层叠是按出现顺序决定的，顺序错了配色会不对。
 */
export async function loadThemeCss(entryPath: string): Promise<string> {
  return await inline(entryPath, 0, new Set<string>());
}

async function inline(
  path: string,
  depth: number,
  seen: Set<string>,
): Promise<string> {
  if (depth > MAX_IMPORT_DEPTH || seen.has(path)) {
    // 循环 import 静默跳过——CSS 规范自己也是这么规定的（只算第一次）。
    return "";
  }
  seen.add(path);

  const raw = await api.theme.read(path);
  const base = dirname(path);

  let out = "";
  let last = 0;
  IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = IMPORT_RE.exec(raw))) {
    out += await absolutize(raw.slice(last, m.index), base);
    last = m.index + m[0].length;

    const target = m[2] ?? "";
    if (isExternal(target)) {
      // 远程 import 不跟随：本机常年离线，跟随只会变成一个超时，
      // 而且会引入一个我们控制不了的第三方请求。
      continue;
    }
    out += "\n" + (await inline(resolvePath(base, target), depth + 1, seen)) + "\n";
  }

  return out + (await absolutize(raw.slice(last), base));
}

/** `@import "x.css";` 与 `@import url("x.css");` 两种写法都要认。 */
const IMPORT_RE = /@import\s+(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?\s*;/gi;

// ── 第二步：url() 换成可用的绝对地址 ─────────────────────────────────────

/**
 * 把一段 CSS 里所有**相对** url() 换成能用的绝对地址。
 *
 * ⚠️ **换成什么，2026-09-23 改过一次**。原来是 `convertFileSrc`（asset 协议），
 * 实测在 WebKitGTK 上**取不回字体**——`@font-face` 发的是 CORS 模式的请求，
 * 而 wry 注册 `asset:` 时只登记了 secure、没登记 cors-enabled，结果是
 * `document.fonts.load()` 抛 `NetworkError`、字体静默退回系统字体。
 * 判据（探针主题 + `document.fonts.load` 的返回值）记在 `src-tauri/src/themes.rs` 顶上。
 *
 * 现在**一律内联成 data: URL**。主题目录里的东西本来就小（几个 woff2 + 几张图），
 * 内联掉之后这条路不再依赖 asset 协议，Windows / macOS / Linux 三个平台走同一条。
 *
 * 已经是绝对的（`http:` / `data:` / `#` / `/` 打头）一律不动——那些要么本来就对，
 * 要么是我们故意不放行的（远程字体，见 CSP）。
 *
 * 单个资源读不动（超限、文件没了）时**退回 asset 协议**，让浏览器自己去试。
 * 不抛：一个坏字体不该把整套主题带崩。
 *
 * ⚠️ 已知限制：url 值里若含**未转义的 `)`**，这个正则会在那个括号上截断。
 * 实践中没见主题这么写（URL 里该转义的都会写成 `%29`），真撞上时症状是
 * 那一条 `@font-face` 失效，而不是整份 CSS 崩掉。
 */
async function absolutize(css: string, base: string): Promise<string> {
  const parts: string[] = [];
  let last = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = URL_RE.exec(css))) {
    parts.push(css.slice(last, m.index));
    last = m.index + m[0].length;

    const t = (m[2] ?? "").trim();
    if (!t || isExternal(t) || t.startsWith("/") || t.startsWith("#")) {
      parts.push(m[0]);
      continue;
    }

    const abs = resolvePath(base, t);
    let url: string;
    try {
      url = await api.theme.asset(abs);
    } catch {
      url = convertFileSrc(abs);
    }
    // ⚠️ 用双引号包起来。data: URL 里是 base64 字母表（含 `+` `/` `=`），
    // 不加引号时 CSS 的 url() 记号里 `+` 合法但 `(`/`)` 不合法；
    // 而且主题自己写的引号风格不一，统一成一种省得拼错。
    parts.push(`url("${url}")`);
  }

  parts.push(css.slice(last));
  return parts.join("");
}

const URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

/** 有 scheme（`http:` / `data:` / `asset:`…）、协议相对（`//cdn`）或锚点。 */
function isExternal(u: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u.trim());
}

/** 取目录部分。用于把相对 url 锚到"这个文件自己所在的目录"。 */
function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i > 0 ? p.slice(0, i) : p;
}

/**
 * 拼路径并消掉 `.` / `..`。
 *
 * 不用 `new URL()`：那个要求 base 是个合法 URL，而这里手上是**文件系统路径**
 * （Linux 上长得像 URL 纯属巧合，Windows 上是 `C:\…`，会当场抛错）。
 */
function resolvePath(base: string, rel: string): string {
  const sep = base.includes("\\") ? "\\" : "/";
  const out: string[] = [];
  for (const part of `${base}/${rel}`.split(/[\\/]/)) {
    if (part === "" || part === ".") {
      // 开头的空段是根（`/home`），要留住；中间的连续斜杠直接吃掉。
      if (out.length === 0 && part === "") out.push("");
      continue;
    }
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join(sep);
}

// ── 第三步与第四步：解析 + 收拢 ──────────────────────────────────────────

/**
 * 把一份主题 CSS 改造成"只作用于正文"的样式。**同步**，因为解析是同步的。
 *
 * 出参是可直接注入 `<style>` 的文本。
 */
export function scopeThemeCss(css: string): string {
  // Typora 专有的 at 规则，浏览器不认识。它在语义上是"导出时才带上这条 url"，
  // 跟屏幕渲染无关——留着只会让解析器当成未知规则，显式去掉更干净。
  const cleaned = css.replace(INCLUDE_WHEN_EXPORT_RE, "");

  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(cleaned);
  } catch {
    // 主题语法坏到浏览器都不认。返回空串而不是抛——换主题失败不该带崩编辑器。
    return "";
  }

  const out: string[] = [];
  walk(sheet.cssRules, out);
  return out.join("\n");
}

const INCLUDE_WHEN_EXPORT_RE = /@include-when-export\s+[^;]*;/gi;

/** 递归遍历规则表。`@media` 要下钻，其余 at 规则原样保留。 */
function walk(rules: CSSRuleList, out: string[]): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;

    switch (rule.type) {
      case CSSRule.STYLE_RULE:
        emitStyleRule(rule as CSSStyleRule, out);
        break;

      case CSSRule.MEDIA_RULE: {
        const media = rule as CSSMediaRule;
        const inner: string[] = [];
        walk(media.cssRules, inner);
        if (inner.length) out.push(`@media ${media.conditionText} {\n${inner.join("\n")}\n}`);
        break;
      }

      // `@font-face` 和 `@keyframes` **不能**加前缀——它们的关键帧/描述符
      // 不是选择器，套上 `#write` 会当场失效。原样放过。
      case CSSRule.FONT_FACE_RULE:
      case CSSRule.KEYFRAMES_RULE:
      case CSSRule.SUPPORTS_RULE:
      case CSSRule.PAGE_RULE:
        out.push(rule.cssText);
        break;

      // `@import` 在第一步就已经展开掉了；`@include-when-export` 也在上面删了。
      // 剩下的未知规则（`@charset`、浏览器不认的东西）一律丢掉。
      default:
        break;
    }
  }
}

/** 一条普通规则 → 最多两条：提升到 `:root` 的变量 + 收拢到 `#write` 的普通声明。 */
function emitStyleRule(rule: CSSStyleRule, out: string[]): void {
  const custom: string[] = [];
  const normal: string[] = [];
  for (let i = 0; i < rule.style.length; i++) {
    const prop = rule.style.item(i);
    const decl = `${prop}: ${rule.style.getPropertyValue(prop)}${
      rule.style.getPropertyPriority(prop) ? " !important" : ""
    };`;
    (prop.startsWith("--") ? custom : normal).push(decl);
  }

  const selectors = splitTop(rule.selectorText);
  // 只有选择器里出现 `:root` / `html` / `body` 时，变量才提升到全局。
  // 别的选择器上的自定义属性（`#foo { --x: 1 }`）是**局部**变量，跟着它自己走。
  const hoistable = selectors.some((s) => ROOT_LIKE_RE.test(s.trim()));

  if (custom.length && hoistable) {
    out.push(`${ROOT} { ${custom.join(" ")} }`);
  }

  const scoped = selectors.map(scopeSelector).filter(Boolean);
  const own = hoistable ? normal : [...custom, ...normal];
  if (own.length && scoped.length) {
    out.push(`${scoped.join(", ")} { ${own.join(" ")} }`);
  }
}

const ROOT_LIKE_RE = /^(:root|html|body)$/i;

/**
 * 把一个选择器收拢到 `#write` 之下。
 *
 * 三条规矩，顺序不能换：
 * 1. 已经含 `#write` 的**原样放过**——主题自己写了 `#write p`，再套一层会变成
 *    `#write #write p`，永远命不中（这是最容易犯的错）。
 * 2. `:root` / `html` / `body` 单独出现时**换成** `#write`（不是加前缀）——
 *    它们指的就是"正文那棵树的根"。
 * 3. 其余一律加 `#write ` 前缀，**包括我们根本没有的那些选择器**
 *    （`#typora-sidebar` 之类）。给它们加前缀等于让它们安全地失效，
 *    正是我们要的：不报错、不起作用、也不污染外壳。
 */
function scopeSelector(sel: string): string {
  const s = sel.trim();
  if (!s) return "";
  if (s.includes(WRITE)) return s;
  if (ROOT_LIKE_RE.test(s)) return WRITE;

  // 连续的前导 html/body（`html body`、`body > p`）一并换成 #write。
  let rest = s;
  let replaced = false;
  for (;;) {
    const m = rest.match(/^(?:html|body)\b[\s>+~]*/i);
    if (!m) break;
    replaced = true;
    rest = rest.slice(m[0].length);
    if (!rest) break;
  }
  if (replaced) return rest ? `${WRITE} ${rest}` : WRITE;

  return `${WRITE} ${s}`;
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

// ── 注入 ─────────────────────────────────────────────────────────────────

/** 那个承载主题的 `<style>` 元素的 id。 */
const STYLE_ID = "nota-doc-theme";

/**
 * 换主题。传 `null` / 空串表示"用内置默认"，会把主题样式整个撤掉。
 *
 * ⚠️ 用**一个固定的 style 元素**做替换，而不是每次 append 一个新的：
 * 后者在用户来回切主题时会原地堆出一串 `<style>`，而且旧的那份仍然生效，
 * 最后谁都说不清当前是哪套主题。
 */
export async function applyDocTheme(theme: { css: string } | null): Promise<void> {
  const existing = document.getElementById(STYLE_ID);

  if (!theme) {
    existing?.remove();
    return;
  }

  const text = await loadThemeCss(theme.css);
  const scoped = scopeThemeCss(text);

  const el = (existing as HTMLStyleElement | null) ?? document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = scoped;
  if (!existing) document.head.appendChild(el);
}
