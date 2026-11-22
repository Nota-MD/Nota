





































































import type { textHandler } from "./text-handlers";







const isConvertMeaningOfAlreadyKnownLanguageMethod =
  /(^|\n)\\(\[TOC\]|\[!(?:note|abstract|summary|tldr|info|todo|tip|hint|important|success|check|done|question|help|faq|warning|caution|attention|failure|fail|missing|danger|error|bug|example|quote|cite)\])/gi;







export function notConvertMeaningAlreadyKnownLanguageMethod(source?: textHandler): textHandler {
  return (node, parent, state, info) => {
    if (!source) return node.value ?? "";
    return source(node, parent, state, info).replace(isConvertMeaningOfAlreadyKnownLanguageMethod, "$1$2");
  };
}
