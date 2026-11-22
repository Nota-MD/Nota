



































































export type TextChangeAction = { from: number; to: number; insert: string };


export type SelectionScopeEnclose = { anchor: number; head: number };








export type RemoveFixedBoundary =
  | { result2: "strip"; changeAction: TextChangeAction[]; selection: SelectionScopeEnclose }
  | { result2: "stationary" };














export function tryRemoveFixedBoundarySymbol(
  text4: string,
  from: number,
  to: number,
  before: string,
  after: string,
): RemoveFixedBoundary | null {
  const select = text4.slice(from, to);

  if (select === "") return null;
  const beforeLength = before.length;
  const afterLength = after.length;




  const leftEdge = before.slice(-1);
  const rightEdge = after.slice(0, 1);


  const externalLeft = text4.slice(Math.max(0, from - beforeLength), from);
  const externalRight = text4.slice(to, to + afterLength);
  if (externalLeft === before && externalRight === after) {




    const moreLeft = text4.slice(Math.max(0, from - beforeLength - 1), Math.max(0, from - beforeLength));
    const moreRight = text4.slice(to + afterLength, to + afterLength + 1);
    if (moreLeft === leftEdge || moreRight === rightEdge) return { result2: "stationary" };
    return {
      result2: "strip",
      changeAction: [
        { from: from - beforeLength, to: from, insert: "" },
        { from: to, to: to + afterLength, insert: "" },
      ],


      selection: { anchor: from - beforeLength, head: to - beforeLength },
    };
  }


  if (select.startsWith(before) && select.endsWith(after) && select.length > beforeLength + afterLength) {
    const inside = select.slice(beforeLength, select.length - afterLength);




    if (inside.startsWith(leftEdge) || inside.endsWith(rightEdge)) return { result2: "stationary" };
    const beforeExternal = text4.slice(Math.max(0, from - 1), from);
    const afterExternal = text4.slice(to, to + 1);
    if (beforeExternal === leftEdge || afterExternal === rightEdge) return { result2: "stationary" };
    return {
      result2: "strip",
      changeAction: [{ from, to, insert: inside }],

      selection: { anchor: from, head: from + inside.length },
    };
  }

  return null;
}
