/** Fit a diagram inside its framed preview without changing its aspect ratio. */

export interface DiagramSize {
  width: number;
  height: number;
  scale: number;
}

export function fitDiagramSize(
  naturalWidth: number,
  naturalHeight: number,
  availableWidth: number,
  availableHeight: number,
): DiagramSize {
  const width = Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : 1;
  const height = Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : 1;
  const frameWidth = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : width;
  const frameHeight = Number.isFinite(availableHeight) && availableHeight > 0 ? availableHeight : height;
  const scale = Math.min(1, frameWidth / width, frameHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale * 100) / 100),
    height: Math.max(1, Math.round(height * scale * 100) / 100),
    scale,
  };
}
