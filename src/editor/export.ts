

















































import { createEditor } from "@/editor/create";
import { inlineCssAssets } from "@/editor/export-assets";
import { isMathCodeLanguage } from "@/editor/math-code";
import { isItemRecordMark, anchor } from "@/editor/toc";
import { applyGithubDocsToExport } from "@/editor/github-docs";
import { t } from "@/i18n";
import { scopeDocThemeCss } from "@/styles/doc-theme";

export interface exportOptions {













  styled: boolean;

  themeCss?: string;





  includeHtmlPreviews?: boolean;






  lightOutput?: boolean;








  title: string;
}





const externalShellOpenHead = '<div class="editor-mount"><div class="milkdown"><div class="ProseMirror">';
const externalShellJoinTail = "</div></div></div>";












const notaClassPrefix = /^nota-/;
















const removeRemoveOfAttribute = [
  "data-srcmark",
  "contenteditable",
  "spellcheck",
  "translate",










  "data-state",
  "data-type",
  "data-value",
];



















const wholeBlockRemoveRemove = [



  ".nota-html-source",
  ".nota-html-source-toggle",
  ".nota-image-source",
  ".nota-media-delete",
  ".nota-media-error",


  ".nota-code-gutter",

  ".nota-code-lang-wrap",









  ".nota-code-preview",





  ".nota-math-panel",

  ".nota-math-preview",


  ".nota-diagram-bar",


  ".nota-diagram-source",
  ".nota-diagram-source-shell",


  ".nota-diagram-note-btn",
];





















async function equalExceptionStepRender(pm: Element): Promise<void> {
  const limitMilliSeconds = 5000;
  const start4 = performance.now();
  while (performance.now() - start4 < limitMilliSeconds) {
    if (
      !pm.querySelector('.nota-diagram-preview[data-state="loading"]') &&
      !pm.querySelector('.nota-math-render[data-state="loading"]') &&
      !pm.querySelector('.nota-math-preview[data-state="loading"]') &&
      !pm.querySelector('.nota-code-math-preview[data-state="loading"]')
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
}









async function removeBody(markdown: string, includeHtmlPreviews = false): Promise<string> {
  const root = document.createElement("div");
  root.setAttribute(
    "style",
    "position:fixed;left:-99999px;top:0;width:800px;visibility:hidden;pointer-events:none",
  );









  root.setAttribute("data-ui-mode", "light");
  document.body.appendChild(root);

  let fragment = "";
  try {
    const handle = await createEditor({
      root,
      initialMarkdown: markdown,
      readOnly: true,
    });
    const pm = root.querySelector(".ProseMirror");
    if (pm) {


      await equalExceptionStepRender(pm);
      applyGithubDocsToExport(pm);




      for (const sel of wholeBlockRemoveRemove) {
        if (sel === ".nota-code-preview" && includeHtmlPreviews) continue;
        pm.querySelectorAll(sel).forEach((n) => n.remove());
      }

      if (includeHtmlPreviews) {
        for (const preview of pm.querySelectorAll<HTMLElement>(".nota-code-preview")) {
          const frame = preview.querySelector("iframe");
          if (preview.hidden || !frame?.getAttribute("srcdoc")) {
            preview.remove();
            continue;
          }
          preview.setAttribute(
            "style",
            "height:240px;margin-top:8px;border:1px solid #d6d6d6;border-radius:5px;overflow:hidden;background:#fff",
          );
          frame.setAttribute(
            "style",
            "display:block;width:100%;height:100%;border:0;background:#fff",
          );
        }
      }

























      for (const pre of pm.querySelectorAll("pre")) {
        const code = pre.querySelector("code");
        if (!code) continue;
        const language = pre.getAttribute("data-language") ?? "";
        if (isMathCodeLanguage(language)) {
          const wrap = pre.closest(".nota-code-wrap");
          const rendered = wrap?.querySelector(".nota-code-math-render");
          const math = document.createElement("div");
          math.className = "md-math-code";
          if (rendered) math.append(...Array.from(rendered.cloneNode(true).childNodes));
          else math.textContent = code.textContent ?? "";
          if (wrap) wrap.replaceWith(math);
          else pre.replaceWith(math);
          continue;
        }
        if (language) code.setAttribute("class", `language-${language}`);
        pre.removeAttribute("data-language");
        code.removeAttribute("style");
        code.removeAttribute("aria-hidden");


        pre.replaceChildren(code);
      }











      for (const wrap of pm.querySelectorAll(".nota-code-wrap")) {
        wrap.replaceWith(...Array.from(wrap.childNodes));
      }









      for (const n of pm.querySelectorAll('[data-type="html-block"]')) {
        if (isItemRecordMark(n.getAttribute("data-value") ?? "")) n.remove();
      }













      for (const br of pm.querySelectorAll("br.ProseMirror-trailingBreak")) br.remove();

      const exportRetainedClass = new Set([
        "nota-diagram",
        "nota-diagram-preview",
        "nota-diagram-note",
        "nota-diagram-note-title",
    "nota-diagram-note-detail",
    "nota-github-alert",
    "nota-github-alert-note",
    "nota-github-alert-abstract",
    "nota-github-alert-info",
    "nota-github-alert-todo",
    "nota-github-alert-tip",
    "nota-github-alert-important",
    "nota-github-alert-success",
    "nota-github-alert-question",
    "nota-github-alert-warning",
    "nota-github-alert-caution",
    "nota-github-alert-failure",
    "nota-github-alert-danger",
    "nota-github-alert-bug",
    "nota-github-alert-example",
    "nota-github-alert-quote",
    "nota-github-alert-marker",
    "nota-github-alert-marker-note",
    "nota-github-alert-marker-abstract",
    "nota-github-alert-marker-info",
    "nota-github-alert-marker-todo",
    "nota-github-alert-marker-tip",
    "nota-github-alert-marker-important",
    "nota-github-alert-marker-success",
    "nota-github-alert-marker-question",
    "nota-github-alert-marker-warning",
    "nota-github-alert-marker-caution",
    "nota-github-alert-marker-failure",
    "nota-github-alert-marker-danger",
    "nota-github-alert-marker-bug",
    "nota-github-alert-marker-example",
    "nota-github-alert-marker-quote",
        ...(includeHtmlPreviews ? ["nota-code-preview", "nota-code-preview-frame"] : []),
      ]);
      for (const n of [pm, ...pm.querySelectorAll("*")]) {
        const keepActive = [...n.classList].filter(
          (c) => !notaClassPrefix.test(c) || exportRetainedClass.has(c),
        );
        if (keepActive.length) n.setAttribute("class", keepActive.join(" "));
        else n.removeAttribute("class");
        for (const a of removeRemoveOfAttribute) n.removeAttribute(a);
      }









      const alreadyUseAnchor = new Set<string>();
      for (const h of pm.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
        h.setAttribute("id", anchor(h.textContent ?? "", alreadyUseAnchor));
      }

      fragment = pm.innerHTML;
    }
    handle.destroy();
  } finally {


    root.remove();
  }
  return fragment;
}


const exportBaseStyles = [
  "html, body { margin: 0; }",
  'body { background: var(--doc-bg, #fff); color: var(--doc-fg, #1a1a1a); }',


  ".editor-pane { overflow: visible; }",


  "@media print { body { background: #fff; color: #000; } }",
  ".md-math-code { margin: 30px 0; padding: 22px 18px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-subtle); overflow-x: auto; text-align: center; }",
  ".md-math-code .katex-display { margin: 0; }",
  ".nota-diagram-preview { text-align: center; }",
  ".nota-diagram-preview svg { display: block; margin: 0 auto; }",
].join("\n");


const lightOutputStyleStyle = [
  ":root, html, body { color-scheme: only light; }",
  "html, body { background: #fff !important; color: #1a1a1a !important; }",
].join("\n");


function convertMeaningText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


export async function exportHtml(markdown: string, opts: exportOptions): Promise<string> {
  const body2 = await removeBody(markdown, opts.includeHtmlPreviews === true);

  const styleStyleBlock: string[] = [];
  if (opts.styled) {


























    const [themeBase, editorArea, inlineLayer, blockLevelLayer, alertLayer, imageTable, commonStyle] = await Promise.all([
      import("@/styles/theme/base.css?inline"),
      import("@/styles/editor.css?inline"),
      import("@/styles/editor-inline.css?inline"),
      import("@/styles/editor-blocks.css?inline"),
      import("@/styles/github-alert.css?inline"),
      import("@/styles/diagram.css?inline"),
      import("katex/dist/katex.min.css?inline"),
    ]);
    styleStyleBlock.push(
      themeBase.default,
      editorArea.default,
      inlineLayer.default,
      blockLevelLayer.default,
      alertLayer.default,
      imageTable.default,
      await inlineCssAssets(commonStyle.default),
    );
    if (opts.themeCss) {


      const limitFieldAfter = scopeDocThemeCss(opts.themeCss);





      if (limitFieldAfter) styleStyleBlock.push(limitFieldAfter);
    }
  }


  styleStyleBlock.push(exportBaseStyles);
  if (opts.lightOutput) styleStyleBlock.push(lightOutputStyleStyle);




  const body = opts.styled ? externalShellOpenHead + body2 + externalShellJoinTail : body2;
  const headStyle = opts.styled ? `<style>\n${styleStyleBlock.join("\n")}\n</style>\n` : "";

  return [
    "<!DOCTYPE html>",
    `<html lang="zh-CN"${opts.lightOutput ? ' data-nota-output="print"' : ""}>`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${convertMeaningText(opts.title)}</title>`,
    headStyle + "</head>",
    opts.styled ? `<body class="editor-pane">${body}</body>` : `<body>${body}</body>`,
    "</html>",
    "",
  ].join("\n");
}


export function defaultExportName(title: string, ext: string): string {
  const bottom = title.replace(/\.(md|markdown|mdx|mdown|mkd|txt)$/i, "");
  return `${bottom || t("Untitled")}.${ext}`;
}
