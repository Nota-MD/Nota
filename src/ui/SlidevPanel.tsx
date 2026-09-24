/**
 * 「视图 → Slidev 预览」点下去先看见的那个面板。
 *
 * # 为什么不是直接开预览
 *
 * 用户 2026-09-24 定的：**先告诉人家装没装**。没装的话，直接起进程会变成
 * 一次几百 MB 的下载（老的 `npx --yes` 就是这么干的），等半天还不一定成；
 * 装好了但文档目录不是个 Slidev 项目，也照样起不来。这两种情况都得在
 * **动手之前**说清楚，并且给一条能走下去的路（官网的安装指南）。
 *
 * # 它认识的东西很少
 *
 * 只认一份 `SlidevProbe`（后端给的报告）和四个回调。**判定的话全在 `message`
 * 里，中文，后端写的**——那边才知道为什么（离线拿不到包 / 目录里没主题 /
 * 文档没存过盘）。这里只按 `state` 决定按钮怎么摆，一个字都不重写。
 *
 * ⚠️ 它**不是一堵墙**：`missing` 的时候主按钮是"去官网"，但旁边还留着
 * 「仍然打开预览」。用户可能比我们清楚（主题装在别处、想自己看报错），
 * 面板不该替他做决定。
 *
 * ⚠️ 和 `ConfirmDialog` 一样**不用 `window.confirm`/`alert`**：它们会阻塞
 * WebView，把中文输入法的组合态打断（见 `ConfirmDialog.tsx` 文件头）。
 */

import { useEffect, useRef } from "react";

import type { SlidevProbe } from "@/bridge/ipc";

interface Props {
  /** `null` = 还在检测。 */
  probe: SlidevProbe | null;
  /** 用户要开预览（`ready` 的主按钮，或"仍然打开预览"）。 */
  onOpen: () => void;
  /**
   * 用户要去官网看安装指南。落到哪一页由 `useSlidev.ts` 的 `GUIDE_URL` 定
   * （那儿记着这个链接是怎么核出来的）。
   */
  onGuide: () => void;
  onRecheck: () => void;
  onClose: () => void;
}

export function SlidevPanel({ probe, onOpen, onGuide, onRecheck, onClose }: Props) {
  const busy = probe === null;
  const okRef = useRef<HTMLButtonElement>(null);

  // 结论出来后把焦点交给主按钮——用户按回车就是"开"，不用先摸鼠标。
  // ⚠️ 依赖里带上 label：`missing` 和 `ready` 的主按钮是两颗不同的按钮，
  // 换过去的时候焦点得跟着换。
  const primary =
    probe?.state === "ready"
      ? { label: "打开预览", run: onOpen }
      : probe?.state === "missing"
        ? { label: "去官网看安装指南", run: onGuide }
        : probe?.state === "unknown"
          ? { label: "仍然打开预览", run: onOpen }
          : null;

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

  return (
    // 点遮罩 = 关掉，和 `ConfirmDialog` 同一条约定。
    <div className="confirm-backdrop" onMouseDown={onClose}>
      <div
        className="confirm-dialog slidev-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Slidev 预览"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-title">Slidev 预览</h2>

        <div className="slidev-status">
          <span className={`slidev-mark ${mark.className}`} aria-hidden="true">
            {mark.glyph}
          </span>
          <p className="slidev-message">
            {busy ? "正在检查本机有没有 Slidev…" : probe.message}
          </p>
        </div>

        {/* 病因的原文（npm 的 ENOTCACHED 之类）。**不改写**：它比我们编的准。 */}
        {probe !== null && probe.detail !== "" && (
          <pre className="slidev-detail">{probe.detail}</pre>
        )}

        {/* 命令和目录：用户拿着它俩能自己判断（比如"查的是另一个目录"）。
            探测自己崩掉时 `command` 是空的，那这块就不画——空行比没有更难看。 */}
        {probe !== null && probe.command !== "" && (
          <dl className="slidev-facts">
            <dt>命令</dt>
            <dd>{probe.command}</dd>
            {probe.project_dir !== null && (
              <>
                <dt>目录</dt>
                <dd>{probe.project_dir}</dd>
              </>
            )}
          </dl>
        )}

        <div className="confirm-actions">
          {/* 左边这组是"工具"：都不改变结论，只是重来一次或不信这个结论。 */}
          <div className="slidev-side">
            <button type="button" className="btn" onClick={onRecheck} disabled={busy}>
              重新检测
            </button>
            {/* ⚠️ 探测是**有根据的猜测**，不是证明：主题可能装在更上面的某层
                （Node 就是一层层往上找的，`theme_installed` 也照着找，但总有
                我们没料到的放法）。所以**必须留一条硬闯的路**——判定错了的时候，
                用户得能自己走下去。 */}
            {probe?.state === "missing" && (
              <button type="button" className="btn" onClick={onOpen}>
                仍然打开预览
              </button>
            )}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            取消
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
              检测中…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
