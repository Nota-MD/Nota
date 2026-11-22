import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { save as saveDialog } from "@/ui/file-picker";

import { api } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { AvatarCropDialog } from "@/ui/AvatarCropDialog";
import {
  currentCardColor,
  lightGridConvert,
  SafeFileName,
  shareCardSvg,
  toBase64,
  type ShareQrMatrix,
} from "@/ui/share-card";
import {
  NOTA_PROMOTION_URL,
  readShareIdentity,
  shareInitials,
  subscribeShareIdentity,
  writeShareIdentity,
  type ShareCardIdentity,
} from "@/ui/share-card-identity";
import type { PanelShare } from "@/ui/panel-nodes";


function useCardPalette() {
  const [color, setColor] = useState(() => currentCardColor());

  useEffect(() => {
    const see2 = new MutationObserver(() => setColor(currentCardColor()));


    see2.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-mode"],
    });

    setColor(currentCardColor());
    return () => see2.disconnect();
  }, []);

  return color;
}

export interface ShareEnjoyImageOutputMouth {

  image: string;

  busy: "" | "save" | "copy";


  result2: string;
  saveAsImageSlice: () => Promise<void>;
  enterCutPasteBoard: () => Promise<void>;
}


export function useShareCard(spec: PanelShare): ShareEnjoyImageOutputMouth {
  const t = useT();
  const color = useCardPalette();
  const identity = useSyncExternalStore(
    subscribeShareIdentity,
    readShareIdentity,
    readShareIdentity,
  );
  const [qr, setQr] = useState<ShareQrMatrix | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "copy">("");
  const [result2, setResult] = useState("");

  useEffect(() => {
    if (!identity.includePromotion) {
      setQr(null);
      return;
    }
    let alive = true;
    void import("qrcode")
      .then((module) => {
        const matrix = module.create(NOTA_PROMOTION_URL, { errorCorrectionLevel: "M" }).modules;
        const rows: ShareQrMatrix = [];
        for (let row = 0; row < matrix.size; row++) {
          const cells: boolean[] = [];
          for (let column = 0; column < matrix.size; column++) {
            cells.push(matrix.get(row, column) !== 0);
          }
          rows.push(cells);
        }
        if (alive) setQr(rows);
      })
      .catch(() => {
        if (alive) setQr(null);
      });
    return () => {
      alive = false;
    };
  }, [identity.includePromotion]);


  const keyName = JSON.stringify(spec);
  const image = useMemo(
    () => shareCardSvg(spec, color, undefined, { identity, qr }),
    [keyName, color, identity, qr],
  );

  const saveAsImageSlice = async () => {
    setBusy("save");
    setResult("");
    try {
      const block = await lightGridConvert(spec, color, { identity, qr });
      const path = await saveDialog({
        title: t("Save share image"),


        defaultPath: SafeFileName(spec.file),
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return;
      const writeOutput = await api.export.writeBytes(path, await toBase64(block));
      setResult(t("Saved to {0}", writeOutput));
    } catch (e) {
      setResult(t("Could not save: {0}", String(e)));
    } finally {
      setBusy("");
    }
  };

  const enterCutPasteBoard = async () => {
    setBusy("copy");
    setResult("");
    try {


      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        throw new Error(t("This environment cannot put images on the clipboard"));
      }
      const block = await lightGridConvert(spec, color, { identity, qr });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": block })]);
      setResult(t("Copied to clipboard"));
    } catch (e) {
      setResult(t("Could not write to the clipboard ({0}). Try “Save as image” instead.", String(e)));
    } finally {
      setBusy("");
    }
  };

  return { image, busy, result2, saveAsImageSlice, enterCutPasteBoard };
}


export function ShareCardPreview({
  spec,
  image,
  className,
}: {
  spec: PanelShare;

  image: string;
  className?: string;
}) {
  const t = useT();
  return (
    <img
      className={className}
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`}

      alt={t("Share image preview: {0} {1}", spec.title || "", spec.value || "")}
    />
  );
}


export function ShareCardBlock({ spec }: { spec: PanelShare }) {
  const t = useT();
  const identity = useSyncExternalStore(
    subscribeShareIdentity,
    readShareIdentity,
    readShareIdentity,
  );
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState("");
  const [cropSource, setCropSource] = useState<{ source: string; fileName: string } | null>(null);
  const { image, busy, result2, saveAsImageSlice, enterCutPasteBoard } = useShareCard(spec);
  const update = (next: Partial<ShareCardIdentity>) =>
    writeShareIdentity({ ...identity, ...next });

  return (
    <div className="panel-share">
      <ShareCardPreview spec={spec} image={image} className="panel-share-img" />

      <div className="panel-share-profile">
        <button
          type="button"
          className="panel-share-avatar"
          title={t("Choose profile image")}
          aria-label={t("Choose profile image")}
          onClick={() => avatarInput.current?.click()}
        >
          {identity.avatar ? (
            <img src={identity.avatar} alt="" />
          ) : (
            <span>{shareInitials(identity.name || "Nota writer")}</span>
          )}
        </button>
        <input
          ref={avatarInput}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            if (!/^image\/(png|jpeg|webp)$/i.test(file.type) || file.size > 8 * 1024 * 1024) {
              setAvatarError(t("Choose a PNG, JPEG or WebP image smaller than 8 MiB."));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const avatar = typeof reader.result === "string" ? reader.result : "";
              if (!avatar) {
                setAvatarError(t("Could not read that image."));
                return;
              }
              setAvatarError("");
              setCropSource({ source: avatar, fileName: file.name });
            };
            reader.onerror = () => setAvatarError(t("Could not read that image."));
            reader.readAsDataURL(file);
          }}
        />
        <label className="panel-share-name">
          <span>{t("Creator")}</span>
          <input
            type="text"
            value={identity.name}
            maxLength={48}
            placeholder={t("Nota writer")}
            onChange={(event) => update({ name: event.target.value })}
          />
        </label>
        {identity.avatar && (
          <button type="button" className="btn panel-share-remove" onClick={() => update({ avatar: "" })}>
            {t("Remove")}
          </button>
        )}
      </div>
      {avatarError && <p className="panel-share-note">{avatarError}</p>}

      <label className="panel-share-promo">
        <input
          type="checkbox"
          checked={identity.includePromotion}
          onChange={(event) => update({ includePromotion: event.target.checked })}
        />
        <span>
          {t("Include Nota website QR code")}
          <small>{NOTA_PROMOTION_URL}</small>
        </span>
      </label>

      <div className="panel-share-actions">
        <button
          type="button"
          className="btn btn-primary panel-btn"
          disabled={busy !== ""}
          onClick={() => void saveAsImageSlice()}
        >
          {t("Save as image")}
        </button>
        <button
          type="button"
          className="btn panel-btn"
          disabled={busy !== ""}
          onClick={() => void enterCutPasteBoard()}
        >
          {t("Copy to clipboard")}
        </button>
      </div>


      {result2 && (
        <p className="panel-share-note" role="status">
          {result2}
        </p>
      )}
      {cropSource && (
        <AvatarCropDialog
          source={cropSource.source}
          fileName={cropSource.fileName}
          onCancel={() => setCropSource(null)}
          onConfirm={(avatar) => {
            update({ avatar });
            setCropSource(null);
          }}
        />
      )}
    </div>
  );
}
