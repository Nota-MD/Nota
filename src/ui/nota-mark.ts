
































import source3 from "../../src-tauri/icons/nota.svg?raw";





export const markRecognizeView = "0 0 1254 1254";












const bottomLiner = { x: 92, y: 95, width: 1070, height: 1066, circleCorner: 255 };


const insideCore = (() => {
  const goShell = source3

    .replace(/<\?xml[\s\S]*?\?>/g, "")

    .replace(/<!--[\s\S]*?-->/g, "");
  const match2 = goShell.match(/<svg[^>]*>([\s\S]*)<\/svg>/);


  return (match2?.[1] ?? "").trim();
})();


function addPrefix(fragment: string, prefix: string): string {
  const callMethod = new Map<string, string>();

  for (const m of fragment.matchAll(/\bid="([^"]+)"/g)) {



    const name3 = m[1];
    if (name3) callMethod.set(name3, prefix + name3);
  }
  return fragment
    .replace(/\bid="([^"]+)"/g, (_All, name3: string) => `id="${callMethod.get(name3) ?? name3}"`)
    .replace(/url\(#([^)]+)\)/g, (_All, name3: string) => `url(#${callMethod.get(name3) ?? name3})`);
}










export function markRecognize(left: number, above: number, rulerInch: number, prefix: string): string {
  const inside = addPrefix(insideCore, prefix);
  return (
    `<svg x="${left}" y="${above}" width="${rulerInch}" height="${rulerInch}" viewBox="${markRecognizeView}">` +
    `<defs><clipPath id="${prefix}clip">` +
    `<rect x="${bottomLiner.x}" y="${bottomLiner.y}" width="${bottomLiner.width}" height="${bottomLiner.height}" rx="${bottomLiner.circleCorner}"/>` +
    `</clipPath></defs>` +
    `<g clip-path="url(#${prefix}clip)">${inside}</g>` +
    `</svg>`
  );
}
