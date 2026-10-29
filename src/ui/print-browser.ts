const paperSizeMm: Record<string, [number, number]> = {
  a4: [210, 297],
  a5: [148, 210],
  b5: [176, 250],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
};

/**
 * Windows 的浏览器打印后端：把同一份导出 HTML 连同 `@page` 版面注入 iframe。
 * Nota 的自绘框负责预览与版面，WebView2 只在最后弹出系统确认框。
 */
export function browserPrintHtml(
  html: string,
  paper: string,
  landscape: boolean,
  marginMm: number,
): string {
  const base = paperSizeMm[paper] ?? paperSizeMm.a4!;
  const [width, height] = landscape ? [base[1], base[0]] : base;
  const margin = Math.max(0, Math.min(60, Number.isFinite(marginMm) ? marginMm : 12));
  const style = `<style data-nota-browser-print>
@page { size: ${width}mm ${height}mm; margin: ${margin}mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #fff; }
</style>`;
  const at = html.toLowerCase().lastIndexOf("</head>");
  return at < 0 ? style + html : `${html.slice(0, at)}${style}${html.slice(at)}`;
}
