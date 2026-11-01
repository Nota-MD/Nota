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

let activePrintFrame: HTMLIFrameElement | null = null;

/**
 * Open the WebView2/Chromium native print UI for the exported document.
 *
 * The iframe is rendered off-screen but kept alive until `afterprint` (or a
 * conservative timeout). Chromium can return from `print()` before the native
 * dialog closes; removing the frame at that moment may cancel the job.
 */
export async function openBrowserSystemPrint(html: string): Promise<void> {
  activePrintFrame?.remove();
  activePrintFrame = null;

  const frame = document.createElement("iframe");
  frame.title = "Nota print document";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:fixed;left:-100000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";

  const loaded = new Promise<void>((resolve) => {
    frame.addEventListener("load", () => resolve(), { once: true });
  });

  frame.srcdoc = browserPrintHtml(html, "a4", false, 12);
  document.body.appendChild(frame);
  activePrintFrame = frame;
  await loaded;

  const popup = frame.contentWindow;
  if (!popup) {
    frame.remove();
    activePrintFrame = null;
    throw new Error("The native print preview could not be opened.");
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    frame.remove();
    if (activePrintFrame === frame) activePrintFrame = null;
  };
  popup.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 5 * 60 * 1000);

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      popup.focus();
      popup.print();
      resolve();
    });
  });
}
