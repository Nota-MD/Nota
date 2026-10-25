/** 把导出的完整 HTML 文档光栅化成一张纵向 PNG。 */

const drawDistributeLimit = 32_000;

export async function htmlToPngBase64(html: string): Promise<string> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.style.cssText =
    "position:fixed;left:-100000px;top:0;width:1200px;height:900px;visibility:hidden;pointer-events:none;border:0";
  frame.srcdoc = html;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      frame.addEventListener("load", () => resolve(), { once: true });
      frame.addEventListener("error", () => reject(new Error("HTML 预览加载失败")), { once: true });
    });
    const doc = frame.contentDocument;
    if (!doc?.documentElement || !doc.body) throw new Error("HTML 预览没有文档树");
    await doc.fonts?.ready.catch(() => {});
    await Promise.all(
      [...doc.images].map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const width = Math.max(800, Math.ceil(doc.documentElement.scrollWidth));
    const height = Math.max(1, Math.ceil(doc.documentElement.scrollHeight));
    if (height > drawDistributeLimit * 4) throw new Error("文档太长，无法安全生成单张图片");
    const scale = Math.min(2, drawDistributeLimit / width, drawDistributeLimit / height);
    const styles = [...doc.head.querySelectorAll("style, link[rel='stylesheet']")]
      .map((node) => node.outerHTML)
      .join("\n");
    const bodyClass = doc.body.className ? ` class="${doc.body.className}"` : "";
    const bodyStyle = doc.body.getAttribute("style") ?? "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml">
${styles}
<div${bodyClass} style="width:${width}px;min-height:${height}px;${bodyStyle}">${doc.body.innerHTML}</div>
</div>
</foreignObject>
</svg>`;
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片画布");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  } finally {
    frame.remove();
  }
}
