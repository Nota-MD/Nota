






























import type { Node as PMNode } from "@milkdown/kit/prose/model";


const hTMLLanguage = new Set(["html", "htm", "xhtml"]);








export function isHtml(language: string): boolean {
  return hTMLLanguage.has(language.trim().toLowerCase());
}


const accumulateBatchMilliSeconds = 300;

export interface HTMLPreview {

  readonly element: HTMLElement;

  sameStep: (node: PMNode, standaloneMoment?: boolean) => void;


  cancelDestroy: () => void;
}





export function createHTMLPreview(): HTMLPreview {
  const element = document.createElement("div");
  element.className = "nota-code-preview";


  element.contentEditable = "false";
  element.hidden = true;

  const box2 = document.createElement("iframe");
  box2.className = "nota-code-preview-frame";

  box2.setAttribute("sandbox", "allow-scripts");

  box2.setAttribute("title", "HTML preview");
  element.append(box2);

  let pendingWrite: number | null = null;

  const undoRemovePendingWrite = () => {
    if (pendingWrite !== null) {
      clearTimeout(pendingWrite);
      pendingWrite = null;
    }
  };

  return {
    element,
    sameStep: (node, standaloneMoment = false) => {
      const isValue = isHtml(language(node));
      element.hidden = !isValue;
      if (!isValue) {



        undoRemovePendingWrite();
        return;
      }
      const body2 = node.textContent;
      undoRemovePendingWrite();
      if (standaloneMoment) {
        box2.srcdoc = body2;
        return;
      }
      pendingWrite = window.setTimeout(() => {
        pendingWrite = null;
        box2.srcdoc = body2;
      }, accumulateBatchMilliSeconds);
    },
    cancelDestroy: undoRemovePendingWrite,
  };
}


function language(node: PMNode): string {
  const raw = node.attrs.language;
  return typeof raw === "string" ? raw : "";
}
