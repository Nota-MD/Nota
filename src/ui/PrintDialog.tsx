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
 *               └─▶ 点「打印」→ lp 把**同一份 PDF** 投给打印机
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

import { api, type PrinterInfo, type PrintPreview } from "@/bridge/ipc";
import { useT } from "@/i18n";
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
const 纸张表 = ["a4", "a5", "b5", "letter", "legal"] as const;

export function PrintDialog({
  request,
  onClose,
}: {
  request: PrintRequest;
  onClose: () => void;
}) {
  const t = useT();
  const 框 = useRef<HTMLDivElement>(null);
  useModalTrap(框, { onEscape: onClose });

  const [打印机们, 设打印机们] = useState<PrinterInfo[] | null>(null);
  const [打印机, 设打印机] = useState("");
  const [纸张, 设纸张] = useState<string>("a4");
  const [横向, 设横向] = useState(false);
  const [边距, 设边距] = useState(12);
  const [份数, 设份数] = useState(1);
  const [范围, 设范围] = useState("");

  const [预览, 设预览] = useState<PrintPreview | null>(null);
  const [第几页, 设第几页] = useState(1);
  const [忙, 设忙] = useState(false);
  const [错, 设错] = useState<string | null>(null);
  const [任务号, 设任务号] = useState<string | null>(null);
  /** ⚠️ 见文件头最后一段：过期结果不许覆盖新的。 */
  const 令牌 = useRef(0);

  // ── 打印机（只拉一次）──────────────────────────────────────────────────
  useEffect(() => {
    let 活 = true;
    void api.print
      .printers()
      .then((表) => {
        if (!活) return;
        设打印机们(表);
        const 默认 = 表.find((p) => p.is_default) ?? 表[0];
        设打印机(默认?.name ?? "");
      })
      .catch(() => {
        if (活) 设打印机们([]);
      });
    return () => {
      活 = false;
    };
  }, []);

  // ── 出 PDF ＋ 出预览（版面一变就重来，去抖 350ms）────────────────────────
  useEffect(() => {
    const 我的 = ++令牌.current;
    设忙(true);
    设错(null);
    const 计时 = window.setTimeout(() => {
      void api.print
        .prepare({
          html: request.html,
          baseDir: request.baseDir,
          paper: 纸张,
          landscape: 横向,
          marginMm: 边距,
        })
        .then((结果) => {
          if (令牌.current !== 我的) return;
          设预览(结果);
          设第几页(1);
        })
        .catch((e) => {
          if (令牌.current !== 我的) return;
          设预览(null);
          设错(String(e));
        })
        .finally(() => {
          if (令牌.current === 我的) 设忙(false);
        });
    }, 350);
    return () => window.clearTimeout(计时);
  }, [request, 纸张, 横向, 边距]);

  const 开打 = useCallback(async () => {
    if (!预览 || !打印机) return;
    设忙(true);
    设错(null);
    try {
      const 号 = await api.print.send({
        pdf: 预览.pdf,
        printer: 打印机,
        copies: 份数,
        ranges: 范围.trim() || null,
      });
      设任务号(号);
      // ⚠️ 停一下再关：任务号是这条路的**唯一凭证**，闪一下就走等于没给。
      window.setTimeout(onClose, 1200);
    } catch (e) {
      设错(String(e));
      设忙(false);
    }
  }, [预览, 打印机, 份数, 范围, onClose]);

  const 总页 = 预览?.page_count ?? 0;
  const 当前图 = 预览?.pages[第几页 - 1];

  return (
    <div className="print-backdrop" onMouseDown={onClose}>
      <div
        ref={框}
        className="print-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Print")}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── 左：预览 ─────────────────────────────────────────────────── */}
        <section className="print-preview" aria-live="polite">
          {/* ⚠️ 纸放在**自己的滚动区**里、页码条在外面：不分开的话，一张 A4 竖过来
              比这块区域还高，`overflow: auto` 会把页码条一起滚出屏幕——
              而那正是"第几页 / 上一页"的家（2026-10-17 第一次开窗就撞上了）。 */}
          <div className="print-canvas">
            {当前图 ? (
              <img className="print-page" src={当前图} alt={t("Page {0} of {1}", 第几页, 总页)} />
            ) : (
              <div className="print-blank">
                {忙 ? t("Preparing preview…") : 错 ? t("No preview") : t("Preparing preview…")}
              </div>
            )}
          </div>
          <div className="print-pager">
            <button
              type="button"
              className="btn"
              disabled={第几页 <= 1}
              onClick={() => 设第几页((n) => Math.max(1, n - 1))}
              title={t("Previous page")}
            >
              ↑
            </button>
            <span className="print-count">
              {预览 ? t("Page {0} of {1}", 第几页, 总页) : "—"}
            </span>
            <button
              type="button"
              className="btn"
              disabled={!预览 || 第几页 >= 预览.pages.length}
              onClick={() => 设第几页((n) => Math.min(预览?.pages.length ?? 1, n + 1))}
              title={t("Next page")}
            >
              ↓
            </button>
            {预览?.truncated && (
              <span className="print-hint">{t("Only the first {0} pages are previewed", 预览.pages.length)}</span>
            )}
          </div>
        </section>

        {/* ── 右：参数 ─────────────────────────────────────────────────── */}
        <section className="print-side">
          <h2 className="print-title">{request.title || t("Print")}</h2>

          <label className="print-field">
            <span>{t("Printer")}</span>
            {打印机们 === null ? (
              <span className="print-hint">{t("Reading the printers…")}</span>
            ) : 打印机们.length === 0 ? (
              <span className="print-hint">{t("This machine has no printer — export to PDF instead.")}</span>
            ) : (
              <select value={打印机} onChange={(e) => 设打印机(e.target.value)}>
                {打印机们.map((p) => (
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
            <select value={纸张} onChange={(e) => 设纸张(e.target.value)}>
              {纸张表.map((v) => (
                <option key={v} value={v}>
                  {v.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="print-field">
            <span>{t("Orientation")}</span>
            <select
              value={横向 ? "landscape" : "portrait"}
              onChange={(e) => 设横向(e.target.value === "landscape")}
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
              value={边距}
              onChange={(e) => 设边距(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
            />
          </label>

          <label className="print-field">
            <span>{t("Copies")}</span>
            <input
              type="number"
              min={1}
              max={99}
              value={份数}
              onChange={(e) => 设份数(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            />
          </label>

          <label className="print-field">
            <span>{t("Page range (empty = all)")}</span>
            <input
              type="text"
              placeholder="1-3, 5"
              value={范围}
              onChange={(e) => 设范围(e.target.value)}
            />
          </label>

          {错 && <p className="print-error">{错}</p>}
          {任务号 && <p className="print-ok">{t("Sent to the printer: {0}", 任务号)}</p>}

          <div className="print-actions">
            <button type="button" className="btn" onClick={onClose}>
              {t("Cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={忙 || !预览 || !打印机 || 任务号 !== null}
              onClick={() => void 开打()}
            >
              {t("Print")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
