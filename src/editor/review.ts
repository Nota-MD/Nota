


















































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

export const inlineIncreaseClass = "nota-review-inline-add";










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

export type InlineDifferenceSegment =
  | { kind: "same"; from: number; to: number }
  | { kind: "delete"; from: number; to: number }
  | { kind: "insert"; at: number; from: number; to: number; text: string };

interface InlineToken {
  text: string;
  from: number;
  to: number;
}

function inlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  for (const match of text.matchAll(/\s+|[A-Za-z0-9_]+|./gu)) {
    const value = match[0];
    const from = match.index ?? 0;
    tokens.push({ text: value, from, to: from + value.length });
  }
  return tokens;
}

function coalesceInlineDifference(parts: InlineDifferenceSegment[]): InlineDifferenceSegment[] {
  const output: InlineDifferenceSegment[] = [];
  for (const part of parts) {
    const previous = output.at(-1);
    if (
      previous?.kind === part.kind &&
      (part.kind === "insert"
        ? previous.kind === "insert" &&
          previous.at === part.at &&
          previous.to === part.from
        : previous.kind !== "insert" && previous.to === part.from)
    ) {
      if (part.kind === "insert" && previous.kind === "insert") {
        previous.text += part.text;
      } else if (part.kind !== "insert" && previous.kind !== "insert") {
        previous.to = part.to;
      }
      continue;
    }
    output.push({ ...part });
  }
  return output;
}

export function inlineDifference(
  oldText: string,
  newText: string,
): InlineDifferenceSegment[] | null {
  if (oldText === newText) return [];
  const oldTokens = inlineTokens(oldText);
  const newTokens = inlineTokens(newText);
  let head = 0;
  while (
    head < oldTokens.length &&
    head < newTokens.length &&
    oldTokens[head]?.text === newTokens[head]?.text
  ) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < oldTokens.length - head &&
    tail < newTokens.length - head &&
    oldTokens[oldTokens.length - 1 - tail]?.text === newTokens[newTokens.length - 1 - tail]?.text
  ) {
    tail += 1;
  }

  const middleOld = oldTokens.slice(head, oldTokens.length - tail);
  const middleNew = newTokens.slice(head, newTokens.length - tail);
  if (middleOld.length * middleNew.length > singleDollarCellLimit) return null;

  const operations: Array<
    | { kind: "same"; oldIndex: number }
    | { kind: "delete"; oldIndex: number }
    | { kind: "insert"; text: string; newFrom: number; newTo: number }
  > = [];
  for (let index = 0; index < head; index += 1) {
    operations.push({ kind: "same", oldIndex: index });
  }

  let pendingInsert = "";
  let pendingInsertFrom = 0;
  let pendingInsertTo = 0;
  const flushInsert = () => {
    if (pendingInsert) {
      operations.push({
        kind: "insert",
        text: pendingInsert,
        newFrom: pendingInsertFrom,
        newTo: pendingInsertTo,
      });
      pendingInsert = "";
    }
  };

  const width = middleNew.length + 1;
  const table = new Int32Array((middleOld.length + 1) * width);
  for (let row = middleOld.length - 1; row >= 0; row -= 1) {
    for (let column = middleNew.length - 1; column >= 0; column -= 1) {
      const below = table[(row + 1) * width + column]!;
      const right = table[row * width + (column + 1)]!;
      table[row * width + column] =
        middleOld[row]?.text === middleNew[column]?.text
          ? below + 1
          : Math.max(below, right);
    }
  }

  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < middleOld.length && newIndex < middleNew.length) {
    if (middleOld[oldIndex]?.text === middleNew[newIndex]?.text) {
      flushInsert();
      operations.push({ kind: "same", oldIndex: head + oldIndex });
      oldIndex += 1;
      newIndex += 1;
    } else if (
      table[(oldIndex + 1) * width + newIndex]! >=
      table[oldIndex * width + (newIndex + 1)]!
    ) {
      flushInsert();
      operations.push({ kind: "delete", oldIndex: head + oldIndex });
      oldIndex += 1;
    } else {
      const token = middleNew[newIndex];
      if (!pendingInsert && token) pendingInsertFrom = token.from;
      if (token) pendingInsertTo = token.to;
      pendingInsert += token?.text ?? "";
      newIndex += 1;
    }
  }
  while (oldIndex < middleOld.length) {
    flushInsert();
    operations.push({ kind: "delete", oldIndex: head + oldIndex });
    oldIndex += 1;
  }
  while (newIndex < middleNew.length) {
    const token = middleNew[newIndex];
    if (!pendingInsert && token) pendingInsertFrom = token.from;
    if (token) pendingInsertTo = token.to;
    pendingInsert += token?.text ?? "";
    newIndex += 1;
  }
  flushInsert();
  for (let index = tail; index > 0; index -= 1) {
    operations.push({ kind: "same", oldIndex: oldTokens.length - index });
  }

  const offsetAt = (index: number): number =>
    index < oldTokens.length ? (oldTokens[index]?.from ?? oldText.length) : oldText.length;
  const parts: InlineDifferenceSegment[] = [];
  for (const operation of operations) {
    if (operation.kind === "insert") {
      parts.push({
        kind: "insert",
        at: offsetAt(oldIndex),
        from: operation.newFrom,
        to: operation.newTo,
        text: operation.text,
      });
      continue;
    }
    const token = oldTokens[operation.oldIndex];
    if (!token) continue;
    parts.push({ kind: operation.kind, from: token.from, to: token.to });
    if (operation.kind === "same" || operation.kind === "delete") oldIndex = operation.oldIndex + 1;
  }
  return coalesceInlineDifference(parts);
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
