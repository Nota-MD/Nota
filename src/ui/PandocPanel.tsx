/**
 * 「文件 → 导出 → PDF / Word / …」点下去，**pandoc 没探通**时先看见的那个面板。
 *
 * # 它是**通用的「差东西」面板**，只是今天只有它一个用户
 *
 * 形状是：一个符号 + 一句后端写的话 + 一段命令原文 + 一张事实表 + 几颗按钮。
 * 2026-09-25 之前这套壳叫 `slidev-panel`（当时 Slidev 探测面板是第一个用户），
 * 现在那些类改名叫 `gate-*`（`src/styles/gate.css`）——因为**这套形状不专属于
 * 任何一次探测**，而"为什么这个类叫 slidev"这种问题，不该由下一个探测器来问。
 *
 * 那些格式 Nota 自己不会转，是借系统里那个 pandoc 转的。所以点下去第一件事是
 * **探测**：没装就先说清楚，别让用户白等一次失败，并且给一条能走下去的路
 * （pandoc 官网的安装页）。装好了**不出这个面板**（那种情形面板上只有一个
 * "开始导出"按钮），只有 `missing` / `unknown` 才轮到它——见 `useExport.ts`。
 *
 * # ⚠️ 它必须说清 PDF 有第二条路
 *
 * PDF 是七种里唯一有兜底的：pandoc 那条路不通时，Nota 自己那套（WebKit 打印）
 * 还能出一份。所以 pandoc 没装、而 `fallback_pdf` 为真时，**主按钮是"用 Nota
 * 自己排版导出"**，不是"去官网"——用户手上有能出 PDF 的工具，面板不该把它藏起来。
 * 反过来，非 PDF 的格式，或者这台机器上没有兜底，主按钮才是"去官网"。
 *
 * # 它认识的东西很少
 *
 * 只认一份 `PandocProbe`（后端给的报告）、一种格式、四个回调。**判定的话全在
 * `message` 里，中文，后端写的**——那边才知道为什么。这里只按 `state` 决定
 * 按钮怎么摆，一个字都不重写。
 *
 * ⚠️ 和 `ConfirmDialog` 一样**不用 `window.confirm`/`alert`**：它们会阻塞
 * WebView，把中文输入法的组合态打断（见 `ConfirmDialog.tsx` 文件头）。
 */

import { useEffect, useRef } from "react";

import type { PandocFormatInfo, PandocProbe } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";

interface Props {
  /** `null` = 还在检测。 */
  probe: PandocProbe | null;
  /** 用户点的是哪一种格式。探测中可能还不知道（跟着 `probe` 一起到位）。 */
  format: PandocFormatInfo | null;
  /** 照导（`unknown` 的"仍然试一次"，或走了自带 PDF 那条路）。 */
  onExport: () => void;
  /**
   * 去 pandoc 官网看安装指南。落到哪一页由 `useExport.ts` 的 `PANDOC_GUIDE` 定
   * （那儿记着这个链接该怎么核）。
   */
  onGuide: () => void;
  onRecheck: () => void;
  onClose: () => void;
}

export function PandocPanel({
  probe,
  format,
  onExport,
  onGuide,
  onRecheck,
  onClose,
}: Props) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const busy = probe === null;
  const okRef = useRef<HTMLButtonElement>(null);

  const 格式名 = format?.name ?? t("This file");
  // 这条路存不存在：PDF **且**这台机器上有自带那套（只有 Linux 有）。
  const 有自带PDF = probe?.fallback_pdf === true && format?.id === "pdf";

  /**
   * 主按钮。⚠️ 三档的落点不同，理由见文件头：
   * - `ready`：理论上到不了这儿（前端不会开面板），但真到了也得有条路。
   * - `missing` + 有自带 PDF：**主按钮是自己那套**——手上有能出 PDF 的工具。
   * - 其余 `missing` / `unknown`：照试。探测是**有根据的猜测**，不是证明
   *   （pandoc 可能装在 PATH 之外的地方，`NOTA_PANDOC_CMD` 也能指过去）。
   */
  const primary =
    probe?.state === "ready"
      ? { label: t("Exporting {0}", 格式名), run: onExport }
      : probe?.state === "missing"
        ? 有自带PDF
          ? { label: t("Typeset and export with Nota itself"), run: onExport }
          : { label: t("Install guide on the official site"), run: onGuide }
        : probe?.state === "unknown"
          ? { label: t("Try Anyway"), run: onExport }
          : null;

  // 结论出来后把焦点交给主按钮——用户按回车就是"导"，不用先摸鼠标。
  // ⚠️ 依赖里带上 label：换结论时主按钮可能是另一颗按钮，焦点得跟着换。
  useEffect(() => {
    if (!busy) okRef.current?.focus();
  }, [busy, primary?.label]);

  // 键盘：Esc 关掉、回车走主按钮。绑在 window 上而不是框里——焦点可能还没落进来。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && primary !== null) {
        e.preventDefault();
        primary.run();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, primary]);

  const mark = busy
    ? { className: "is-busy", glyph: "" }
    : probe.state === "ready"
      ? { className: "is-ok", glyph: "✓" }
      : probe.state === "missing"
        ? { className: "is-warn", glyph: "!" }
        : { className: "is-ask", glyph: "?" };

  // 「仍然试一次」只在主按钮**不是**它的时候出现——否则同一件事两颗按钮。
  const 留一条路 = probe !== null && primary?.run !== onExport;

  return (
    // 点遮罩 = 关掉，和 `ConfirmDialog` 同一条约定。
    <div className="confirm-backdrop" onMouseDown={onClose}>
      <div
        className="confirm-dialog gate-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("Export {0}", 格式名)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={onClose} />
        <h2 className="confirm-title">{t("Export {0}", 格式名)}</h2>

        <div className="gate-status">
          <span className={`gate-mark ${mark.className}`} aria-hidden="true">
            {mark.glyph}
          </span>
          <p className="gate-message">
            {busy ? t("Checking for pandoc on this system…") : probe.message}
          </p>
        </div>

        {/* 病因的原文（`command not found` 之类）。**不改写**：它比任何转述都准。 */}
        {probe !== null && probe.detail !== "" && (
          <pre className="gate-detail">{probe.detail}</pre>
        )}

        {/* 命令、版本、排版引擎：用户拿着它们能自己判断（比如"查的是另一个目录"、
            "装是装了但没有 xelatex"）。探测自己崩掉时 `command` 是空的，
            那这块就不画——空行比没有更难看。 */}
        {probe !== null && probe.command !== "" && (
          <dl className="gate-facts">
            <dt>{t("Command")}</dt>
            <dd>{probe.command}</dd>
            {probe.version !== null && (
              <>
                <dt>{t("Version")}</dt>
                <dd>{probe.version}</dd>
              </>
            )}
            {format?.id === "pdf" && (
              <>
                <dt>{t("Typesetting engine")}</dt>
                {/* ⚠️ 没找到**不等于**不能出 PDF（引擎可能在 PATH 之外），
                    所以这里的措辞是"没在 PATH 里找到"，不是"没有"。 */}
                <dd>{probe.pdf_engine ?? t("Not found in PATH")}</dd>
              </>
            )}
          </dl>
        )}

        <div className="confirm-actions">
          {/* 左边这组是"工具"：都不改变结论，只是重来一次或不信这个结论。 */}
          <div className="gate-side">
            <button type="button" className="btn" onClick={onRecheck} disabled={busy}>
              {t("Check Again")}
            </button>
            {/* ⚠️ 探测是**有根据的猜测**，不是证明。判定错了的时候用户得能自己
                走下去——所以除了主按钮那条路，**永远再留一条**。 */}
            {留一条路 && (
              <button type="button" className="btn" onClick={onExport}>
                {t("Try Anyway")}
              </button>
            )}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          {primary !== null ? (
            <button
              ref={okRef}
              type="button"
              className="btn btn-primary"
              onClick={primary.run}
            >
              {primary.label}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled>
              {t("Checking…")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
