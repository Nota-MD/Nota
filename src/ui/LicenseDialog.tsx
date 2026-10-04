/**
 * 许可证全文那张框（2026-10-04，「关于 → 法律信息」里点超链接打开）。
 *
 * # 为什么是**另一个框**，不是跳到浏览器
 *
 * 用户原话：「法律信息用超链接显示"bsd-2条款许可证"，点击打开窗口独立展示」，
 * 并选了「应用里的另一个框」。这条路的好处是**不碰任何权限**：交给系统浏览器
 * 要走 `opener:allow-open-url`（`AboutDialog` 那两行外链就是这么做的），而
 * 许可证这条路完全在进程内——没有新能力、没有新窗口、也没有"浏览器被调起来
 * 抢了焦点"这件事。（真开一个 OS 窗口则要新加 `core:window:allow-create` 一类
 * 的能力，见 `docs/10` 那张权限表。）
 *
 * # 全文从哪来
 *
 * ⚠️ **不许再抄一份。** 抄一份的下场是两份许可证慢慢分家，而"关于"里那份
 * 是给用户看的那份。这里用 Vite 的 `?raw` 把**仓库根目录那份 `LICENSE`**
 * 当字符串读进来（`ui/nota-mark.ts` 读 `nota.svg` 是同一个手法）——
 * 于是全文只有一处真相，改了 `LICENSE`，这个框跟着变，一行代码都不用动。
 *
 * # 壳
 *
 * ⚠️ 与别的框**共用** `.confirm-backdrop` / `.confirm-dialog`（Esc 关、点遮罩关），
 * 只加 `.lic-*` 几条。理由同 `AboutDialog`：长得一样的东西不该有两套样式。
 *
 * ⚠️ 它**盖在关于框上面**：`AboutDialog` 把它当兄弟节点画在关于框**之后**
 * （两层的 `z-index` 都是 200，靠 DOM 顺序分前后），所以 `Esc` 的归属要在
 * 那边拦一道——否则一次 `Esc` 把两层一起关掉。
 */

import { useEffect, useRef } from "react";

// ⚠️ 仓库根目录那份 `LICENSE`（**不是** `src/` 里的副本，因为没有副本）。
import 许可证全文 from "../../LICENSE?raw";

import { useT } from "@/i18n";
import { useModalTrap } from "@/ui/useModalTrap";

/**
 * 许可证的短名。⚠️ 与根目录 `LICENSE` 的第一行、`package.json`、
 * `Cargo.toml` 三处一致（`AboutDialog` 里那个 `许可证` 常量是同一个词，
 * 但那边管的是"关于"页上的显示，这里管的是标题——两处都要改）。
 */
const 短名 = "BSD-2-Clause";

export function LicenseDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  // ⚠️ `useModalTrap` 的 `focusin` 兜底会把跑出框的焦点拉到这个容器上，
  // 它必须自己能接焦点（`tabIndex={-1}`），同 `ConfirmDialog` 那一处。
  const 框 = useRef<HTMLDivElement>(null);
  const 关闭键 = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    关闭键.current?.focus();
  }, []);

  // Esc 关 ＋ 焦点陷阱，走共用钩子（第 50 项那两道闸）。
  useModalTrap(框, { onEscape: onClose });

  return (
    <div
      className="confirm-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="confirm-dialog lic-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("{0} License", 短名)}
        ref={框}
        tabIndex={-1}
      >
        <h2 className="confirm-title">{t("{0} License", 短名)}</h2>
        {/* ⚠️ `<pre>` 是**故意的**：许可证正文的换行与缩进是它的一部分，
            塞进 `<p>` 会被 CSS 折成一坨。`wrap` 那条见 `overlay.css`。 */}
        <pre className="lic-text">{许可证全文}</pre>
        <div className="confirm-actions">
          <button type="button" className="btn" ref={关闭键} onClick={onClose}>
            {t("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
