/**
 * 运行时资源注入的 `<style>` 必须继承页面 CSP nonce。
 *
 * Tauri 打包后会为 HTML 里的内联样式生成 nonce，并把 CSP 收窄到
 * `style-src 'self' 'nonce-…'`。此时只创建一个普通 `<style>`、写入 CSS，
 * 元素虽然会出现在 `<head>`，但 `style.sheet` 是 `null`，所有规则都不生效；
 * 文档主题和用户界面主题都会因此静默退回内置/界面默认配色。
 *
 * 开发态通常没有 nonce，函数保持普通行为；打包态从已有的内联 style/script
 * 复制 nonce。已有元素如果缺 nonce，先移除再创建，避免 WebKit 不重新解析
 * 已经挂进 DOM 的无效样式表。
 */

function pageNonce(doc: Document): string {
  const source = doc.querySelector<HTMLStyleElement | HTMLScriptElement>(
    "style[nonce], script[nonce]",
  );
  return source?.nonce || source?.getAttribute("nonce") || "";
}

/** 用固定 id 替换一段运行时 CSS；`css` 为空时移除该样式。 */
export function replaceInlineStyle(id: string, css: string | null, doc: Document = document): void {
  const nonce = pageNonce(doc);
  let existing = doc.getElementById(id) as HTMLStyleElement | null;

  if (!css) {
    existing?.remove();
    return;
  }

  // 旧版本在同一次会话里创建的 style 没有 nonce；只补属性通常不会让 WebKit
  // 重新解析那张已经失效的表，所以这种元素必须重建。
  if (existing && nonce && existing.nonce !== nonce) {
    existing.remove();
    existing = null;
  }

  const el = existing ?? doc.createElement("style");
  el.id = id;
  if (nonce) el.nonce = nonce;
  el.textContent = css;
  if (!existing) doc.head.appendChild(el);
}
