


































import type { KatexOptions } from "katex";

import { t } from "@/i18n";
import { renderCommonStyle } from "./katex-runtime";
import {
  findCurrent,
  setUse,
  pickCandidate,
  candidateLimit,
  type candidate,
  type ReceiveBelow,
} from "./math-commands";


const boxClass = "nota-math-suggest";


const itemClass = "nota-math-suggest-item";


const nameClass = "nota-math-suggest-name";


const styleClass = "nota-math-suggest-sample";


const descriptionClass = "nota-math-suggest-desc";


const cornerClass = "nota-math-suggest-tag";


const selectedClass = "nota-math-suggest-on";


const limit = candidateLimit;


const idPrefix = "nota-math-suggest-item-";

export type CreateProposalOption = {

  table2: readonly candidate[];





  drawPreview?: (sample: string, target: HTMLElement) => void;

  receiveBelowAfter?: (result2: ReceiveBelow) => void;








  reportActivity?: (id: string | null) => void;








  inline?: boolean;
  /** Position an inline popup after its contents and visibility are current. */
  position?: (element: HTMLElement) => void;
};


export type CreateProposalBox = {

  element: HTMLElement;

  feed: (source3: string, cursor: number) => void;

  close4: () => void;

  isOpen: () => boolean;

  selectionOrder: () => number;










  keypress: (key: string) => KeypressResult;
};











export type KeypressResult = {

  consume: boolean;
};






export function createCreateProposalBox(option: CreateProposalOption): CreateProposalBox {
  const drawPreview = option.drawPreview ?? defaultDrawPreview;

  const label = option.inline ? "span" : "div";

  const root = document.createElement(label);
  root.className = boxClass;


  root.contentEditable = "false";
  root.setAttribute("role", "listbox");
  root.setAttribute("aria-label", t("LaTeX commands"));


  let current: candidate[] = [];

  let selected = 0;

  let source3 = "";
  let cursor = 0;

  const renderedOf = new Map<string, HTMLElement>();


  function getPreview(item4: candidate): HTMLElement {
    const has = renderedOf.get(item4.command);



    if (has) return has;

    const cell2 = document.createElement("span");
    cell2.className = styleClass;
    try {
      drawPreview(item4.sample, cell2);
    } catch {



      cell2.textContent = "";
    }
    renderedOf.set(item4.command, cell2);
    return cell2;
  }


  function heavyDrawColumnTable(): void {
    root.replaceChildren();
    if (current.length === 0) return;

    current.forEach((item4, ordinal) => {
      const line3 = document.createElement(label);
      line3.className = itemClass;
      if (ordinal === selected) line3.classList.add(selectedClass);
      line3.setAttribute("role", "option");
      line3.setAttribute("aria-selected", ordinal === selected ? "true" : "false");



      line3.setAttribute("id", `${idPrefix}${ordinal}`);

      const name3 = document.createElement("span");
      name3.className = nameClass;
      name3.textContent = item4.command;

      const description = document.createElement("span");
      description.className = descriptionClass;
      description.textContent = item4.description;

      line3.append(name3, getPreview(item4));
      if (item4.family === "physics") {
        const corner = document.createElement("span");
        corner.className = cornerClass;
        corner.textContent = t("physics");
        line3.append(corner);
      }
      line3.append(description);



      line3.addEventListener("mousedown", (e) => {
        (e as unknown as { preventDefault: () => void }).preventDefault?.();
        selected = ordinal;
        receiveBelowCurrent();
      });

      root.append(line3);
    });
  }


  function reportActivityNow(): void {
    const isOpen = !root.hidden && current.length > 0;
    option.reportActivity?.(isOpen ? `${idPrefix}${selected}` : null);
  }








  function receiveBelowCurrent(): void {
    const item4 = current[selected];
    if (!item4) return;
    const scene2 = findCurrent(source3, cursor);
    if (!scene2) return;
    close4();
    option.receiveBelowAfter?.(setUse(source3, cursor, scene2, item4));
  }


  function close4(): void {
    current = [];
    selected = 0;
    root.replaceChildren();

    root.hidden = true;
    reportActivityNow();
  }


  function action2(step: number): void {
    if (current.length === 0) return;
    const newValue = selected + step;
    if (newValue < 0 || newValue >= current.length) return;
    selected = newValue;
    heavyDrawColumnTable();
    reportActivityNow();
  }


  function isOpen(): boolean {
    return !root.hidden && current.length > 0;
  }



  root.hidden = true;

  return {
    element: root,

    feed(newValueSource2: string, newValueCursor: number): void {
      source3 = newValueSource2;
      cursor = newValueCursor;

      const scene2 = findCurrent(newValueSource2, newValueCursor);
      const column = scene2 ? pickCandidate(option.table2, scene2.word, limit) : [];
      if (column.length === 0) {
        close4();
        return;
      }




      const same = column.length === current.length && column.every((item4, ordinal) => item4.command === current[ordinal]?.command);
      if (!same) {
        current = column;
        selected = 0;
        heavyDrawColumnTable();
      }
      root.hidden = false;
      option.position?.(root);
      reportActivityNow();
    },

    close4,

    isOpen,

    selectionOrder: () => selected,

    keypress(key: string): KeypressResult {
      if (!isOpen()) return { consume: false };

      if (key === "Escape") {
        close4();


        return { consume: true };
      }
      if (key === "ArrowDown") {
        action2(1);
        return { consume: true };
      }
      if (key === "ArrowUp") {
        action2(-1);
        return { consume: true };
      }
      if (key === "Enter" || key === "Tab") {


        if (!current[selected] || !findCurrent(source3, cursor)) return { consume: false };
        receiveBelowCurrent();
        return { consume: true };
      }



      if (key === "ArrowLeft" || key === "ArrowRight" || key === "Home" || key === "End") {
        close4();
        return { consume: false };
      }


      return { consume: false };
    },
  };
}









function defaultDrawPreview(sample: string, target: HTMLElement, option?: KatexOptions): void {
  void renderCommonStyle(sample, target, { throwOnError: false, ...option }).catch(() => {
    target.textContent = "";
  });
}


export function useOptionDrawPreview(option: KatexOptions): (sample: string, target: HTMLElement) => void {
  return (sample, target) => defaultDrawPreview(sample, target, option);
}
