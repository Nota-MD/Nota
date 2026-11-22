












function pageNonce(doc: Document): string {
  const source = doc.querySelector<HTMLStyleElement | HTMLScriptElement>(
    "style[nonce], script[nonce]",
  );
  return source?.nonce || source?.getAttribute("nonce") || "";
}


export function replaceInlineStyle(id: string, css: string | null, doc: Document = document): void {
  const nonce = pageNonce(doc);
  let existing = doc.getElementById(id) as HTMLStyleElement | null;

  if (!css) {
    existing?.remove();
    return;
  }



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
