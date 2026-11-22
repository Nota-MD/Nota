
















































































export interface SplitShareResult {











  frontMatter: string | null;

  body2: string;
}


const firstFenceLine = /^---[ \t]*(\r?\n)/;

const closeBar = /^(?:---|\.\.\.)[ \t]*$/;

const mapProjectItem = /^[^\s:][^:]*:(?:\s|$)/;








function likeMapProject(rows: string[]): boolean {
  const hasContent = rows.filter((line3) => line3.trim() !== "");


  if (hasContent.length === 0) return false;
  return hasContent.every((line3) => {
    if (/^[ \t]/.test(line3)) return true;
    if (line3.startsWith("#")) return true;
    return mapProjectItem.test(line3);
  });
}






function consumeRemoveEmptyLine(markdown: string, position2: number): number {
  while (position2 < markdown.length) {
    const replaceLinePlace = markdown.indexOf("\n", position2);
    const lineTail = replaceLinePlace === -1 ? markdown.length : replaceLinePlace + 1;
    if (!/^[ \t]*\r?\n?$/.test(markdown.slice(position2, lineTail))) return position2;
    if (replaceLinePlace === -1) return lineTail;
    position2 = lineTail;
  }
  return position2;
}







export function splitFrontMatter(markdown: string): SplitShareResult {
  const notSplit: SplitShareResult = { frontMatter: null, body2: markdown };
  const first = firstFenceLine.exec(markdown);
  if (!first) return notSplit;

  const body3: string[] = [];
  let position2 = first[0].length;
  while (position2 <= markdown.length) {
    const replaceLinePlace = markdown.indexOf("\n", position2);

    const lineTail = replaceLinePlace === -1 ? markdown.length : replaceLinePlace + 1;
    const line3 = markdown.slice(position2, lineTail).replace(/\r?\n$/, "");
    if (closeBar.test(line3)) {
      if (!likeMapProject(body3)) return notSplit;


      const head2 = consumeRemoveEmptyLine(markdown, lineTail);
      return { frontMatter: markdown.slice(0, head2), body2: markdown.slice(head2) };
    }
    if (replaceLinePlace === -1) return notSplit;
    body3.push(line3);
    position2 = lineTail;
  }
  return notSplit;
}








export function joinFrontMatter(frontMatter: string | null, body2: string): string {
  return frontMatter === null ? body2 : frontMatter + body2;
}


















function encloseBarPosition(frontMatter: string): { bodyStart: number; closingFenceLineStart: number } | null {
  const first = firstFenceLine.exec(frontMatter);
  if (!first) return null;
  let position2 = first[0].length;
  while (position2 <= frontMatter.length) {
    const replaceLinePlace = frontMatter.indexOf("\n", position2);
    const lineTail = replaceLinePlace === -1 ? frontMatter.length : replaceLinePlace + 1;
    const line3 = frontMatter.slice(position2, lineTail).replace(/\r?\n$/, "");
    if (closeBar.test(line3)) return { bodyStart: first[0].length, closingFenceLineStart: position2 };
    if (replaceLinePlace === -1) break;
    position2 = lineTail;
  }
  return null;
}








export function splitFrontMatterBody(frontMatter: string): string {
  const position3 = encloseBarPosition(frontMatter);
  if (!position3) return "";
  return frontMatter.slice(position3.bodyStart, position3.closingFenceLineStart).replace(/\r?\n$/, "");
}








export function replaceFrontMatterBody(originalBlock: string, body: string): string {
  const position3 = encloseBarPosition(originalBlock);
  if (!position3) return createFrontMatter(body);
  const head2 = originalBlock.slice(0, position3.bodyStart);
  const tail = originalBlock.slice(position3.closingFenceLineStart);
  const replaceLine = head2.includes("\r\n") ? "\r\n" : "\n";
  const rows = body.replace(/\r?\n$/, "").split(/\r?\n/);
  return head2 + rows.join(replaceLine) + replaceLine + tail;
}












export const newFrontMatterTemplate = "title: ";










export function createFrontMatter(body: string): string {
  const rows = body.replace(/\r?\n$/, "").split(/\r?\n/);
  return `---\n${rows.join("\n")}\n---\n\n`;
}









export function replaceFrontMatter(originalBlock: string | null, body: string): string | null {
  if (body.trim() === "") return null;
  return originalBlock === null ? createFrontMatter(body) : replaceFrontMatterBody(originalBlock, body);
}













export function frontMatterLineCount(markdown: string): number {
  const head2 = splitFrontMatter(markdown).frontMatter;
  if (head2 === null) return 0;








  return head2.replace(/\r?\n$/, "").split(/\r?\n/).length;
}
