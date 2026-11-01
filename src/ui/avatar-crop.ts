/** Pure geometry for the circular avatar crop dialog. */

export interface AvatarCropOffset {
  x: number;
  y: number;
}

export interface AvatarCropGeometry {
  scale: number;
  width: number;
  height: number;
  maxX: number;
  maxY: number;
  offset: AvatarCropOffset;
  left: number;
  top: number;
  visiblePercent: number;
}

export function clampAvatarCropOffset(
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
  offset: AvatarCropOffset,
  stageSize = 320,
): AvatarCropGeometry {
  const width = Math.max(1, naturalWidth);
  const height = Math.max(1, naturalHeight);
  const fit = Math.max(stageSize / width, stageSize / height);
  const scale = fit * Math.max(1, Math.min(3, zoom));
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const maxX = Math.max(0, (renderedWidth - stageSize) / 2);
  const maxY = Math.max(0, (renderedHeight - stageSize) / 2);
  const safeX = Math.max(-maxX, Math.min(maxX, offset.x));
  const safeY = Math.max(-maxY, Math.min(maxY, offset.y));
  const croppedSide = stageSize / scale;
  const visiblePercent = Math.round(
    (Math.PI * (croppedSide / 2) ** 2 * 100) / (width * height),
  );
  return {
    scale,
    width: renderedWidth,
    height: renderedHeight,
    maxX,
    maxY,
    offset: { x: safeX, y: safeY },
    left: (stageSize - renderedWidth) / 2 + safeX,
    top: (stageSize - renderedHeight) / 2 + safeY,
    visiblePercent,
  };
}

export interface AvatarCropSource {
  x: number;
  y: number;
  size: number;
}

/** Source rectangle handed to `drawImage` for the square backing bitmap. */
export function avatarCropSource(
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
  offset: AvatarCropOffset,
  stageSize = 320,
): AvatarCropSource {
  const geometry = clampAvatarCropOffset(
    naturalWidth,
    naturalHeight,
    zoom,
    offset,
    stageSize,
  );
  const size = stageSize / geometry.scale;
  const x = Math.max(
    0,
    Math.min(
      naturalWidth - size,
      (naturalWidth - size) / 2 - geometry.offset.x / geometry.scale,
    ),
  );
  const y = Math.max(
    0,
    Math.min(
      naturalHeight - size,
      (naturalHeight - size) / 2 - geometry.offset.y / geometry.scale,
    ),
  );
  return { x, y, size };
}
