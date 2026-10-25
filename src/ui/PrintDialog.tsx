/**
 * **应用内打印框**（2026-10-17 新建）。
 *
 * 用户拍板的那条路：「**你让它做成PDF然后再预览**，这样问题就基本解决了」。
 * 所以这个框的三段是**串起来**的，不是三个独立面板：
 *
 * ```text
 * 版面（纸张/方向/边距）
 *   └─▶ 宿主静默印一份 PDF（就是打印机将来收到的那一份）
 *         └─▶ pdftoppm 把前 N 页渲成图 ──▶ 左边那块预览
 *               └─▶ 点「打印」→ CUPS/IPP 把**同一份 PDF** 投给打印机
 * ```
 *
 * ⚠️ **预览与投递必须是同一份 PDF**：换一份重新排版就等于"预览是一回事、
 * 打出来是另一回事"，那正是这一类功能最容易骗人的地方。
 *
 * ⚠️ **改版面要重新出 PDF＋重出预览**：所以那条 effect 是**去抖 350ms** 的——
 * 拖边距滑杆时每一帧都印一次 PDF 是不可接受的（一次要一两秒）。
 * 用一个递增的令牌丢掉过期的结果：上一次还没回来就又改了，旧那份回来时**不许**
 * 覆盖新的（症状是"预览总是慢半拍、显示的是上一个纸张"）。
 *
 * ⚠️ 这个框**自己不做 toast**：成功之后就地把任务号写在框里、1.2 秒后自关。
 * 走进 `useDialogs` 那条"ask 一个 Promise"的模子反而绕——它不是一次询问，
 * 而是一段有自己状态的流程。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { save as saveDialog } from "@/ui/file-picker";

import { api, type PrintEnvironment, type PrintPreview } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { useModalTrap } from "@/ui/useModalTrap";

export interface PrintRequest {
  /** 带样式的导出 HTML（`editor/export.ts::导出HTML` 出的那一份）。 */
  html: string;
  /**
   * 文档所在目录 —— 正文里 `![](./img.png)` 是相对路径，换一个基准就全是裂图。
   * `null` = 这份文档还没存过盘。
   */
  baseDir: string | null;
  /** 只用来做打印任务的名字（CUPS 那边显示的就是它）。 */
  title: string;
}

/** 纸上那几项。⚠️ 值是给宿主认的短名（`print_job.rs::纸张尺寸`）。 */
const paperTable = ["a4", "a5", "b5", "letter", "legal"] as const;

export function PrintDialog({
  request,
  onClose,
}: {
  request: PrintRequest;
  onClose: () => void;
}) {
  const t = useT();
  const box2 = useRef<HTMLDivElement>(null);
  useModalTrap(box2, { onEscape: onClose });

  const [printEnvironment, setPrintEnvironment] = useState<PrintEnvironment | null>(null);
  const [printer, setPrinter] = useState("");
  const [paper, setPaper] = useState<string>("a4");
  const [horizontalToward, setHorizontalToward] = useState(false);
  const [edgeDistance, setEdgeDistance] = useState(12);
  const [partNumber, setPartNumber] = useState(1);
  const [scopeEnclose, setScopeEnclose] = useState("");

  const [preview, setPreview] = useState<PrintPreview | null>(null);
  const [ordinalHowManyPage, setOrdinalHowManyPage] = useState(1);
  const [busy, setBusy2] = useState(false);
  const [error2, setError] = useState<string | null>(null);
  const [taskTaskNumber, setTaskTaskNumber] = useState<string | null>(null);
  const [savedPdf, setSavedPdf] = useState<string | null>(null);
  /** ⚠️ 见文件头最后一段：过期结果不许覆盖新的。 */
  const commandCard = useRef(0);

  // ── 打印机（只拉一次）──────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    void api.print
      .printers()
      .then((ringEnvironment) => {
        if (!active) return;
        setPrintEnvironment(ringEnvironment);
        const selectedPrinter =
          ringEnvironment.printers.find((p) => p.is_default) ??
          ringEnvironment.printers[0];
        setPrinter(selectedPrinter?.name ?? "");
      })
      .catch(() => {
        if (active)
          setPrintEnvironment({
            cups_available: false,
            problem: null,
            printers: [],
          });
      });
    return () => {
      active = false;
    };
  }, []);

  // ── 出 PDF ＋ 出预览（版面一变就重来，去抖 350ms）────────────────────────
  useEffect(() => {
    const selfOf = ++commandCard.current;
    setBusy2(true);
    setError(null);
    const countTime = window.setTimeout(() => {
      void api.print
        .prepare({
          html: request.html,
          baseDir: request.baseDir,
          paper: paper,
          landscape: horizontalToward,
          marginMm: edgeDistance,
        })
        .then((result2) => {
          if (commandCard.current !== selfOf) return;
          setPreview(result2);
          setOrdinalHowManyPage(1);
        })
        .catch((e) => {
          if (commandCard.current !== selfOf) return;
          setPreview(null);
          setError(String(e));
        })
        .finally(() => {
          if (commandCard.current === selfOf) setBusy2(false);
        });
    }, 350);
    return () => window.clearTimeout(countTime);
  }, [request, paper, horizontalToward, edgeDistance]);

  const start2 = useCallback(async () => {
    if (!preview || !printer) return;
    setBusy2(true);
    setError(null);
    try {
      const number = await api.print.send({
        pdf: preview.pdf,
        printer: printer,
        copies: partNumber,
        ranges: scopeEnclose.trim() || null,
      });
      setTaskTaskNumber(number);
      // ⚠️ 停一下再关：任务号是这条路的**唯一凭证**，闪一下就走等于没给。
      window.setTimeout(onClose, 1200);
    } catch (e) {
      setError(String(e));
      setBusy2(false);
    }
  }, [preview, printer, partNumber, scopeEnclose, onClose]);

  const systemSystemStart = useCallback(async () => {
    setBusy2(true);
    setError(null);
    try {
      await api.print.system({
        html: request.html,
        baseDir: request.baseDir,
        paper: paper,
        landscape: horizontalToward,
        marginMm: edgeDistance,
      });
      setTaskTaskNumber(t("System print dialog"));
      window.setTimeout(onClose, 500);
    } catch (e) {
      setError(String(e));
      setBusy2(false);
    }
  }, [request, paper, horizontalToward, edgeDistance, onClose, t]);

  const savePdf = useCallback(async () => {
    if (!preview) return;
    const target = await saveDialog({
      title: t("Save PDF"),
      defaultPath: `${request.title || "Nota"}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!target) return;
    setBusy2(true);
    setError(null);
    try {
      const saved = await api.print.savePdf(preview.pdf, target);
      setSavedPdf(saved);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy2(false);
    }
  }, [preview, request.title, t]);

  const totalPage = preview?.page_count ?? 0;
  const currentImage = preview?.pages[ordinalHowManyPage - 1];
  const noCups = printEnvironment !== null && !printEnvironment.cups_available;
  const listError = printEnvironment?.problem != null;
  const noPrinter = printEnvironment !== null && printEnvironment.printers.length === 0;
  const walkSystemSystemDialog = noCups || listError || noPrinter;

  return (
    <div className="print-backdrop" onMouseDown={onClose}>
      <div
        ref={box2}
        className="print-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Print")}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={onClose} />
        {/* ── 左：预览 ─────────────────────────────────────────────────── */}
        <section className="print-preview" aria-live="polite">
          {/* ⚠️ 纸放在**自己的滚动区**里、页码条在外面：不分开的话，一张 A4 竖过来
              比这块区域还高，`overflow: auto` 会把页码条一起滚出屏幕——
              而那正是"第几页 / 上一页"的家（2026-10-17 第一次开窗就撞上了）。 */}
          <div className="print-canvas">
            {currentImage ? (
              <img className="print-page" src={currentImage} alt={t("Page {0} of {1}", ordinalHowManyPage, totalPage)} />
            ) : (
              <div className="print-blank">
                {busy ? t("Preparing preview…") : error2 ? t("No preview") : t("Preparing preview…")}
              </div>
            )}
          </div>
          <div className="print-pager">
            <button
              type="button"
              className="btn"
              disabled={ordinalHowManyPage <= 1}
              onClick={() => setOrdinalHowManyPage((n) => Math.max(1, n - 1))}
              title={t("Previous page")}
            >
              ↑
            </button>
            <span className="print-count">
              {preview ? t("Page {0} of {1}", ordinalHowManyPage, totalPage) : "—"}
            </span>
            <button
              type="button"
              className="btn"
              disabled={!preview || ordinalHowManyPage >= preview.pages.length}
              onClick={() => setOrdinalHowManyPage((n) => Math.min(preview?.pages.length ?? 1, n + 1))}
              title={t("Next page")}
            >
              ↓
            </button>
            {preview?.truncated && (
              <span className="print-hint">{t("Only the first {0} pages are previewed", preview.pages.length)}</span>
            )}
          </div>
        </section>

        {/* ── 右：参数 ─────────────────────────────────────────────────── */}
        <section className="print-side">
          <h2 className="print-title">{request.title || t("Print")}</h2>

          <label className="print-field">
            <span>{t("Printer")}</span>
            {printEnvironment === null ? (
              <span className="print-hint">{t("Reading the printers…")}</span>
            ) : noCups ? (
              <span className="print-hint print-warning">
                {t(
                  "CUPS was not found. You can still use “System print…” or export to PDF.",
                )}
              </span>
            ) : listError ? (
              <span className="print-hint print-warning">
                {t(
                  "CUPS is running, but the printer list request failed: {0}. “System print…” is still available.",
                  printEnvironment.problem ?? "",
                )}
              </span>
            ) : noPrinter ? (
              <span className="print-hint print-warning">
                {t(
                  "CUPS is running, but no printers are configured. You can still use “System print…” or export to PDF.",
                )}
              </span>
            ) : (
              <select value={printer} onChange={(e) => setPrinter(e.target.value)}>
                {printEnvironment.printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.is_default ? ` · ${t("default")}` : ""}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="print-field">
            <span>{t("Paper")}</span>
            <select value={paper} onChange={(e) => setPaper(e.target.value)}>
              {paperTable.map((v) => (
                <option key={v} value={v}>
                  {v.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="print-field">
            <span>{t("Orientation")}</span>
            <select
              value={horizontalToward ? "landscape" : "portrait"}
              onChange={(e) => setHorizontalToward(e.target.value === "landscape")}
            >
              <option value="portrait">{t("Portrait")}</option>
              <option value="landscape">{t("Landscape")}</option>
            </select>
          </label>

          <label className="print-field">
            <span>{t("Margins (mm)")}</span>
            <input
              type="number"
              min={0}
              max={60}
              step={1}
              value={edgeDistance}
              onChange={(e) => setEdgeDistance(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
            />
          </label>

          <label className="print-field">
            <span>{t("Copies")}</span>
            <input
              type="number"
              min={1}
              max={99}
              value={partNumber}
              onChange={(e) => setPartNumber(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            />
          </label>

          <label className="print-field">
            <span>{t("Page range (empty = all)")}</span>
            <input
              type="text"
              placeholder="1-3, 5"
              value={scopeEnclose}
              onChange={(e) => setScopeEnclose(e.target.value)}
            />
          </label>

          {error2 && <p className="print-error">{error2}</p>}
          {savedPdf && <p className="print-ok">{t("Saved PDF: {0}", savedPdf)}</p>}
          {taskTaskNumber && <p className="print-ok">{t("Sent to the printer: {0}", taskTaskNumber)}</p>}

          <div className="print-actions">
            <button type="button" className="btn" onClick={onClose}>
              {t("Cancel")}
            </button>
            <button
              type="button"
              className={walkSystemSystemDialog ? "btn btn-primary" : "btn"}
              disabled={busy || !preview}
              onClick={() => void savePdf()}
            >
              {t("Save PDF…")}
            </button>
            <button
              type="button"
              className={walkSystemSystemDialog ? "btn" : "btn btn-primary"}
              disabled={busy || taskTaskNumber !== null || (!walkSystemSystemDialog && (!preview || !printer))}
              onClick={() => void (walkSystemSystemDialog ? systemSystemStart() : start2())}
            >
              {walkSystemSystemDialog ? t("System print…") : t("Print")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
