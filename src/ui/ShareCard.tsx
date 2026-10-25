/**
 * 「分享图」这一块的**唯一实现**：预览 ＋ 存成 PNG ＋ 进剪贴板。
 *
 * 画那张卡本身是 `ui/share-card.ts` 的事（1080×1350 的 SVG，字段来自
 * [`PanelShare`]）；这里管的是**把它交给用户**——显示出来、光栅化、写到
 * 用户选的路径、放进剪贴板、以及每一步失败时如实说一句。
 *
 * # 为什么从 `PanelBody.tsx` 里搬出来（2026-09-27）
 *
 * 用户点名要「强制专注结束后的总结」，而那个总结也要**像心电图那样能导出**
 * ——也就是同一张分享卡。它落在 `ui/FocusSummaryDialog.tsx` 里，而那个框不是
 * 面板，够不着 `PanelBody` 的私有组件。
 *
 * ⚠️ 于是这里就是**第二处调用点**逼出来的抽取：复制一份"存/复制"的实现是
 * 最容易走的那条路，也是错得最贵的那条——两条路会各自演化（一边修了
 * "用户取消不算错误"、另一边没修），而用户看到的是"同一个按钮时好时坏"。
 *
 * # 拆成 hook ＋ 预览 ＋ 整块，是因为两个调用点的**外壳不一样**
 *
 * - 面板里是「图 ＋ 两颗并排按钮 ＋ 一行结果」（[`ShareCardBlock`]）；
 * - 总结框里那两颗按钮要和「知道了」排在同一行（`.confirm-actions` 那套），
 *   所以它自己画按钮，只借 [`useShareCard`] 的逻辑和 [`ShareCardPreview`] 那张图。
 *
 * ⚠️ 两处**共用**的必须是逻辑（怎么存、失败说什么），不是 DOM 结构——
 * 结构不同是真实的需求差异，硬统一只会多出一堆开关参数。
 */

import { useEffect, useMemo, useState } from "react";
import { save as saveDialog } from "@/ui/file-picker";

import { api } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { shareCardSvg, currentCardColor, SafeFileName, toBase64, lightGridConvert } from "@/ui/share-card";
import type { PanelShare } from "@/ui/panel-nodes";

/**
 * 卡片该用亮色还是暗色画。
 *
 * 卡片的配色只跟**最终定下来是亮还是暗**有关，而那件事的唯一权威就是
 * `applyTheme` 写在 `<html data-ui-mode>` 上的那个值（`auto` 也已经在那里落成
 * 了 `light` / `dark`）。调用链上（面板 → 插件栏 → App，或者 App → 总结框）
 * **没有**设置：硬把 `ui_mode` 从顶上穿下来，等于给每一层加一个只为这一处用的
 * 参数，而且 `auto` 那条路还得在这里再判一次——就是 `ui/share-card.ts` 文件头
 * 里说的"第二份口径"。
 *
 * 所以这里只做一件事：盯着那个属性变（`MutationObserver`），变了就重画。
 * ⚠️ 用 `当前卡色()` 而不是自己读一遍：判据在 `share-card.ts` 里，这里不重写。
 */
function useCardPalette() {
  const [color, setColor] = useState(() => currentCardColor());

  useEffect(() => {
    const see2 = new MutationObserver(() => setColor(currentCardColor()));
    // ⚠️ 只订阅这一条属性：`style` 也在同一层（用户改主题色时会变），
    // 而卡片的强调色是**画死**的，跟着它重画纯属白跑。
    see2.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-mode"],
    });
    // 挂上之后再问一次：这中间（首次渲染到 effect 之间）主题可能已经换过了。
    setColor(currentCardColor());
    return () => see2.disconnect();
  }, []);

  return color;
}

export interface ShareEnjoyImageOutputMouth {
  /** 那张 SVG 的源码（预览用，也可以直接喂给别的渲染路径）。 */
  image: string;
  /** 正在存 / 正在复制时是 `"save"` / `"copy"`，闲着是 `""`。按钮拿它置灰。 */
  busy: "" | "save" | "copy";
  /**
   * 上一次动作的结果，**一句话，直接显示给用户**（空串 = 还没动过）。
   *
   * ⚠️ 它是**结果不是错误**：里面既有"已保存到 /tmp/x.png"也有"没能写进剪贴板
   * （…）"。调用方别拿它当 `error` 处理（那会漏掉成功那一半）。
   */
  result2: string;
  saveAsImageSlice: () => Promise<void>;
  enterCutPasteBoard: () => Promise<void>;
}

/**
 * 分享图的读与写。
 *
 * # 为什么结果是**调用点旁边的一行小字**，不是 `toast`
 *
 * 两条理由。① 这条路要用户先选路径（"另存为"对话框）——对话框关掉之后视线就
 * 落回原处，一句飘走的提示反而容易错过；② 那块内容是要**被反复看**的
 * （存完还想再存一次、颜色不对想换个模式再来），把"上一次的结果"留在原地比
 * 留在几百毫秒的浮层里更有用。宿主别处那些 toast 是给"东西没了、你看不见了"
 * 的动作用的（导出 HTML 之类）。
 *
 * # ⚠️ 剪贴板那条路是**尽力而为**，失败要如实说
 *
 * `navigator.clipboard.write` 写图片在 WebKitGTK 上可能被拒（没有用户手势的
 * 上下文、或平台不支持 `ClipboardItem`）。**不假装成功、也不静默**：把原因写
 * 出来并指向"保存为图片"那条一定能走通的路。宁可多说一句，也不要让用户对着
 * 一张空的剪贴板反复按。
 */
export function useShareCard(spec: PanelShare): ShareEnjoyImageOutputMouth {
  const t = useT();
  const color = useCardPalette();
  const [busy, setBusy] = useState<"" | "save" | "copy">("");
  const [result2, setResult] = useState("");

  // ⚠️ 依赖用**内容签名**而不是 `spec` 这个对象：活面板每秒重画一次，插件每次
  // 递上来的都是一份全新的对象，`spec` 这个身份每秒都变。不这么写的话这串 SVG
  // 每秒重建、`encodeURIComponent` 每秒扫一遍、`<img>` 每秒重新解码——图根本
  // 没变，白转 CPU，而且会闪。
  const keyName = JSON.stringify(spec);
  const image = useMemo(() => shareCardSvg(spec, color), [keyName, color]);

  const saveAsImageSlice = async () => {
    setBusy("save");
    setResult("");
    try {
      const block = await lightGridConvert(spec, color);
      const path = await saveDialog({
        title: t("Save share image"),
        // ⚠️ 默认名用调用方给的那个（`nota-stats-day-2026-09-27.png`）——它认识
        // 这是哪一天、哪一轮。但**不能信**：那是插件（或总结）来的字符串，
        // `../` 或 `:` 在"另存为"里是真能写到别处去的（`share-card.ts::安全文件名`）。
        defaultPath: SafeFileName(spec.file),
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return; // 用户取消了，不是错误
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
      // ⚠️ 能力先问后做：`ClipboardItem` 不存在时 `new` 会抛一个不认识的
      // `ReferenceError`，那句话给用户看没有意义。这里换成一句能懂的话。
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        throw new Error(t("This environment cannot put images on the clipboard"));
      }
      const block = await lightGridConvert(spec, color);
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

/**
 * 那张卡的预览。
 *
 * ⚠️ 走 data URL 而不是 Blob URL：Blob 要配一次 `URL.revokeObjectURL`
 * 的清理（漏了就是一份看不见的内存泄漏），而这张图只有几十 KB。
 */
export function ShareCardPreview({
  spec,
  image,
  className,
}: {
  spec: PanelShare;
  /** [`useShareCard`] 给的那一串；调用方已经有一份时别在这里再生成一遍。 */
  image: string;
  className?: string;
}) {
  const t = useT();
  return (
    <img
      className={className}
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`}
      // 读屏软件读这句：卡片上那些数字对它是没有形状的（同 `PanelChartBlock`）。
      alt={t("Share image preview: {0} {1}", spec.title || "", spec.value || "")}
    />
  );
}

/**
 * 面板里那一整块：预览 ＋ 两颗按钮 ＋ 一行结果。
 *
 * ⚠️ 类名还是 `.panel-share*`（`src/styles/share.css`）——它是**面板里**的长相，
 * 搬了家但没换皮。总结框里那一块用另一套（`.focus-summary-*`，`focus.css`），
 * 因为那边的容器、按钮排布、宽度都不一样。
 */
export function ShareCardBlock({ spec }: { spec: PanelShare }) {
  const t = useT();
  const { image, busy, result2, saveAsImageSlice, enterCutPasteBoard } = useShareCard(spec);

  return (
    <div className="panel-share">
      <ShareCardPreview spec={spec} image={image} className="panel-share-img" />

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

      {/* `role="status"`：这一行是**后来才出现的结果**，读屏软件要主动念出来
          （`aria-live` 的 polite 档，不打断用户正在读的东西）。 */}
      {result2 && (
        <p className="panel-share-note" role="status">
          {result2}
        </p>
      )}
    </div>
  );
}
