import DOMPurify from "dompurify";

import {
  clearManageHTMLAddress,
  hTMLCleanConvertConfigurePlace,
} from "@/editor/html-sanitize-policy";

/** Sanitize block HTML and apply the host's second URL allow-list. */
export function safeHtmlFragment(source: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = DOMPurify.sanitize(source, hTMLCleanConvertConfigurePlace);
  clearManageHTMLAddress(template.content);
  return template.content;
}
