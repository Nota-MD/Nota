


















































export interface PreviewAction {

  label: string;

  command: string;
}









export interface changePreview {

  title: string;

  text: string;

  accept: PreviewAction | null;

  reject: PreviewAction | null;
}


export type previewMode = "diff" | "result";




export const previewRootClass = "nota-review";

export const correctCompareViewModeClass = "nota-review-diff";

export const resultViewModeClass = "nota-review-result";


export const removeClass = "nota-review-del";

export const increaseClass = "nota-review-add";

export const increaseLineClass = "nota-review-add-line";










export type DifferenceExceptionSingleDollar =
  | { class: "same"; text2: string; position3: number }
  | { class: "delete"; text2: string; position3: number }
  | { class: "add"; line3: string[] };



















export function differenceException(oldValue: string[], newValue: string[]): DifferenceExceptionSingleDollar[] {
  const output2: DifferenceExceptionSingleDollar[] = [];


  let head2 = 0;
  while (head2 < oldValue.length && head2 < newValue.length && oldValue[head2] === newValue[head2]) head2++;

  let tail = 0;
  while (
    tail < oldValue.length - head2 &&
    tail < newValue.length - head2 &&
    oldValue[oldValue.length - 1 - tail] === newValue[newValue.length - 1 - tail]
  ) {
    tail++;
  }

  const middleOldValue = oldValue.slice(head2, oldValue.length - tail);
  const middleNewValue = newValue.slice(head2, newValue.length - tail);

  for (let i = 0; i < head2; i++) output2.push({ class: "same", text2: oldValue[i]!, position3: i });


  let pendingIncrease: string[] = [];
  const receiveIncrease = () => {
    if (pendingIncrease.length) {
      output2.push({ class: "add", line3: pendingIncrease });
      pendingIncrease = [];
    }
  };

  if (middleOldValue.length * middleNewValue.length > singleDollarCellLimit) {
    for (let i = 0; i < middleOldValue.length; i++) {
      output2.push({ class: "delete", text2: middleOldValue[i]!, position3: head2 + i });
    }
    pendingIncrease = middleNewValue.slice();
    receiveIncrease();
  } else {
    const n = middleOldValue.length;
    const m = middleNewValue.length;
    const width = m + 1;


    //



    const table2 = new Int32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const above = table2[(i + 1) * width + j]!;
        const right = table2[i * width + (j + 1)]!;
        table2[i * width + j] = middleOldValue[i] === middleNewValue[j] ? above + 1 : Math.max(above, right);
      }
    }

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (middleOldValue[i] === middleNewValue[j]) {
        receiveIncrease();
        output2.push({ class: "same", text2: middleOldValue[i]!, position3: head2 + i });
        i++;
        j++;
      } else if (table2[(i + 1) * width + j]! >= table2[i * width + (j + 1)]!) {
        receiveIncrease();
        output2.push({ class: "delete", text2: middleOldValue[i]!, position3: head2 + i });
        i++;
      } else {
        pendingIncrease.push(middleNewValue[j]!);
        j++;
      }
    }
    while (i < n) {
      receiveIncrease();
      output2.push({ class: "delete", text2: middleOldValue[i]!, position3: head2 + i });
      i++;
    }
    while (j < m) {
      pendingIncrease.push(middleNewValue[j]!);
      j++;
    }
    receiveIncrease();
  }

  for (let i = tail; i > 0; i--) {
    const position3 = oldValue.length - i;
    output2.push({ class: "same", text2: oldValue[position3]!, position3 });
  }
  return output2;
}








export const singleDollarCellLimit = 4_000_000;







export function pressLineDifferenceException(oldValue: string, newValue: string): DifferenceExceptionSingleDollar[] {
  return differenceException(oldValue.split("\n"), newValue.split("\n"));
}











export function createIncreaseBox(line3: (string | HTMLElement)[]): HTMLElement {
  const box2 = document.createElement("div");
  box2.className = increaseClass;


  box2.setAttribute("data-nota-review", "add");
  for (const item5 of line3) {
    const item4 = document.createElement("div");
    item4.className = increaseLineClass;
    if (typeof item5 === "string") item4.textContent = item5;
    else item4.append(item5);
    box2.append(item4);
  }
  return box2;
}







export function setViewMode2(root: HTMLElement, viewMode: previewMode): void {
  root.classList.add(previewRootClass);
  root.classList.toggle(correctCompareViewModeClass, viewMode === "diff");
  root.classList.toggle(resultViewModeClass, viewMode === "result");
}


export function removeViewMode(root: HTMLElement): void {
  root.classList.remove(previewRootClass, correctCompareViewModeClass, resultViewModeClass);
}
