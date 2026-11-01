/** Tags allowed in rendered block HTML. Scripts and interactive form controls
 * are intentionally absent. */
export const allowedHtmlTags = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "center",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "s",
  "samp",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "var",
] as const;

/** Attributes kept after sanitising. `style`, `class` and `id` may interfere
 * with the editor shell and are deliberately excluded. */
export const allowedHtmlAttributes = [
  "align",
  "alt",
  "aria-hidden",
  "aria-label",
  "border",
  "cellpadding",
  "cellspacing",
  "colspan",
  "height",
  "href",
  "loading",
  "name",
  "referrerpolicy",
  "rel",
  "role",
  "rowspan",
  "scope",
  "src",
  "target",
  "title",
  "valign",
  "width",
] as const;

export const hTMLCleanConvertConfigurePlace = {
  ALLOWED_TAGS: [...allowedHtmlTags],
  ALLOWED_ATTR: [...allowedHtmlAttributes],
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
  FORBID_TAGS: [
    "audio",
    "base",
    "button",
    "embed",
    "form",
    "iframe",
    "input",
    "link",
    "math",
    "meta",
    "object",
    "option",
    "script",
    "select",
    "style",
    "svg",
    "template",
    "textarea",
    "video",
  ],
  FORBID_ATTR: ["class", "id", "srcdoc", "style"],
};

export function isSafeHtmlUrl(address: string, attribute: "href" | "src" = "src"): boolean {
  const clean = address.replace(/[\s\u0000-\u001f\u007f]/g, "");
  if (!clean) return true;

  const smallWrite = clean.toLowerCase();
  if (attribute === "src" && (/^[a-z]:[\\/]/i.test(clean) || clean.startsWith("\\\\"))) {
    return true;
  }
  if (/^https?:/i.test(clean)) return true;
  if (attribute === "href" && /^(?:mailto:|tel:)/i.test(clean)) return true;
  if (attribute === "src" && /^(?:asset:|file:)/i.test(clean)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(smallWrite)) return false;
  return true;
}

export function clearManageHTMLAddress(root: ParentNode): void {
  for (const element of Array.from(root.querySelectorAll("[href], [src]"))) {
    for (const attribute of ["href", "src"] as const) {
      const value = element.getAttribute(attribute);
      if (value !== null && !isSafeHtmlUrl(value, attribute)) element.removeAttribute(attribute);
    }
  }
}
