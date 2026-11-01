/**
 * Circular avatar crop dialog used by share-card identity.
 *
 * The square stage is the persisted bitmap; the circular mask is how every
 * share card displays it. Users can drag the image and zoom from 100% to 300%.
 */

import { useEffect, useRef, useState } from "react";

import { useT } from "@/i18n";
import {
  avatarCropSource,
  clampAvatarCropOffset,
  type AvatarCropOffset,
} from "@/ui/avatar-crop";
import { Icon } from "@/ui/Icon";
import { useModalTrap } from "@/ui/useModalTrap";

const stageSize = 320;
const outputSize = 512;

interface Props {
  source: string;
  fileName: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

export function AvatarCropDialog({ source, fileName, onCancel, onConfirm }: Props) {
  const t = useT();
  const box2 = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; offset: AvatarCropOffset } | null>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<AvatarCropOffset>({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useModalTrap(box2, { onEscape: onCancel });

  useEffect(() => {
    box2.current?.focus();
  }, []);

  useEffect(() => {
    const next = new Image();
    next.onload = () => {
      setNatural({ width: next.naturalWidth, height: next.naturalHeight });
      image.current = next;
    };
    next.onerror = () => setError(t("Could not read that image."));
    next.src = source;
    return () => {
      next.onload = null;
      next.onerror = null;
    };
  }, [source, t]);

  const geometry = clampAvatarCropOffset(natural.width, natural.height, zoom, offset, stageSize);

  const move = (x: number, y: number) => {
    setOffset(clampAvatarCropOffset(natural.width, natural.height, zoom, { x, y }, stageSize).offset);
  };
  const changeZoom = (nextZoom: number) => {
    const bounded = Math.max(1, Math.min(3, nextZoom));
    setZoom(bounded);
    setOffset((current) =>
      clampAvatarCropOffset(natural.width, natural.height, bounded, current, stageSize).offset,
    );
  };

  const save = () => {
    const sourceImage = image.current;
    if (!sourceImage || !natural.width || !natural.height || busy) return;
    setBusy(true);
    try {
      const cropped = avatarCropSource(natural.width, natural.height, zoom, offset, stageSize);
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(t("Could not prepare the cropped image."));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outputSize, outputSize);
      ctx.drawImage(
        sourceImage,
        cropped.x,
        cropped.y,
        cropped.size,
        cropped.size,
        0,
        0,
        outputSize,
        outputSize,
      );
      onConfirm(canvas.toDataURL("image/jpeg", 0.9));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="confirm-backdrop avatar-crop-backdrop" onMouseDown={onCancel}>
      <div
        ref={box2}
        className="confirm-dialog avatar-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Crop profile image")}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="dialog-close" title={t("Close")} aria-label={t("Close")} onClick={onCancel}>
          <Icon name="folio-close-symbolic" />
        </button>
        <h2>{t("Crop profile image")}</h2>
        <p className="avatar-crop-hint">{t("Drag to position the portrait. The circle is what will remain.")}</p>
        <div
          className="avatar-crop-stage"
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, offset };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current) return;
            move(current.offset.x + event.clientX - current.x, current.offset.y + event.clientY - current.y);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onWheel={(event) => {
            event.preventDefault();
            changeZoom(zoom + (event.deltaY < 0 ? 0.05 : -0.05));
          }}
        >
          <img
            src={source}
            alt=""
            draggable={false}
            style={{ width: geometry.width, height: geometry.height, left: geometry.left, top: geometry.top }}
          />
          <span className="avatar-crop-mask" aria-hidden="true" />
        </div>
        <label className="avatar-crop-zoom">
          <span>{t("Zoom")}</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => changeZoom(Number(event.target.value))}
          />
          <output>{Math.round(zoom * 100)}%</output>
        </label>
        <div className="avatar-crop-facts">
          <span>{t("Round crop · 512 × 512")}</span>
          <span>{t("Visible: {0}% of the source", geometry.visiblePercent)}</span>
        </div>
        {fileName && <p className="avatar-crop-file" title={fileName}>{fileName}</p>}
        {error && <p className="panel-control-error">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" disabled={!natural.width || busy} onClick={save}>
            {t("Use this crop")}
          </button>
        </div>
      </div>
    </div>
  );
}
