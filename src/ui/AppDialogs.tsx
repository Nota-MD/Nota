/**
 * 界面上的**浮层那一族**：导出缺依赖时那张 pandoc 面板，以及五个对话框
 * （确认 / 输入 / 插入图像 / 链接 / Emoji 选择）。
 *
 * # 为什么从 `App.tsx` 里搬出来（2026-09-27）
 *
 * ⚠️ 只为 1000 行那条硬线：`App.tsx` 加了 Emoji 那一条之后 1024 行、超了
 * （`tools/doc-sync-check.sh` ①）。搬出来的这一段是**按职责切的**——它们全是
 * "浮在正文之上、跟哪份文档无关的一层"，而 `App.tsx` 的主干是文档、菜单、
 * 侧栏、编辑区那几样。
 *
 * ⚠️ **五个浮层共用 `useDialogs` 那一套 promise 式的问与答**（`askXxx` 返回
 * 一个 Promise，`answerXxx` 把它兑现），所以这里只收**一个 `对话框` 对象**，
 * 不把那十来个函数摊成 props——摊开的下场是漏一个就有一个框**永远关不掉**
 * （它的 `answer` 没人接），而且那种漏不报错。
 *
 * ⚠️ **顺序在这里就是层叠顺序**（后画的盖住先画的），所以 Emoji 选择框排在
 * 最后：它是唯一一个"用户主动叫出来、可能盖在别的框上面"的挑选器。
 * 实际上它们不会同时出现（`App.tsx` 那个 `有浮层` 判据把它们串起来用），
 * 这一条只是别让人随手改动顺序时踩空。
 */

import { lazy, Suspense } from "react";

import type { TotalJoin } from "@/ui/focus-summary";
import type { Dialogs } from "@/ui/useDialogs";
import type { exportApi, PandocGate } from "@/ui/useExport";

const AboutDialog = lazy(() =>
  import("@/ui/AboutDialog").then((m) => ({ default: m.AboutDialog })),
);
const ConfirmDialog = lazy(() =>
  import("@/ui/ConfirmDialog").then((m) => ({ default: m.ConfirmDialog })),
);
const PrintDialog = lazy(() =>
  import("@/ui/PrintDialog").then((m) => ({ default: m.PrintDialog })),
);
const PromptDialog = lazy(() =>
  import("@/ui/PromptDialog").then((m) => ({ default: m.PromptDialog })),
);
const ImageDialog = lazy(() =>
  import("@/ui/ImageDialog").then((m) => ({ default: m.ImageDialog })),
);
const LinkDialog = lazy(() =>
  import("@/ui/LinkDialog").then((m) => ({ default: m.LinkDialog })),
);
const EmojiDialog = lazy(() =>
  import("@/ui/EmojiDialog").then((m) => ({ default: m.EmojiDialog })),
);
const FocusSummaryDialog = lazy(() =>
  import("@/ui/FocusSummaryDialog").then((m) => ({ default: m.FocusSummaryDialog })),
);
const PandocPanel = lazy(() =>
  import("@/ui/PandocPanel").then((m) => ({ default: m.PandocPanel })),
);

export function AppDialogs({
  dialog,
  pandocGate,
  pandocGateActions,
  dedicatedNoteTotalJoin,
  closeDedicatedNoteTotalJoin,
  debugMode,
  onSetDebugMode,
}: {
  dialog: Dialogs;
  /** 缺外部工具那张面板；`null` = 不显示（探通了就直接进保存对话框）。 */
  pandocGate: PandocGate | null;
  /** 摊给那张面板的几条动作（`{...pandocGateActions}`，来自 `useExport`）。 */
  pandocGateActions: exportApi["pandocGateActions"];
  /**
   * 强制专注这一轮的总结；`null` = 不显示。
   *
   * ⚠️ 它**不在 `对话框` 那个对象里**，虽然同住这个文件：那四个框是
   * "问一句、等一个答案"的 Promise，而这个是一份**报告**，没有答案要交回去
   * （理由写在 `ui/FocusSummaryDialog.tsx` 的文件头）。硬塞进去就得凭空造一个
   * 谁也不读的返回值。
   */
  dedicatedNoteTotalJoin: { total: TotalJoin; now: Date } | null;
  /** 用户把总结关掉了。 */
  closeDedicatedNoteTotalJoin: () => void;
  debugMode: boolean;
  onSetDebugMode: (enabled: boolean) => void;
}) {
  const { confirmReq, answerConfirm, promptReq, answerPrompt } = dialog;
  const { imageReq, answerImage, linkReq, answerLink, emojiOpen, answerEmoji } = dialog;
  const { aboutOpen, closeAbout } = dialog;
  const { printReq, closePrint } = dialog;

  return (
    <Suspense fallback={null}>
      {/* 借 pandoc 那七种：**没探通才有它**（探通了直接进保存对话框）。 */}
      {pandocGate && (
        <PandocPanel probe={pandocGate.probe} format={pandocGate.format} {...pandocGateActions} />
      )}

      {/**
        * 应用内打印框（2026-10-17）。⚠️ 它**排在最前面**：打印途中用户还能看到
        * 别的框是不合理的（那会盖在预览上），所以它是这一族里层级最高的一张。
        */}
      {printReq && <PrintDialog request={printReq} onClose={closePrint} />}

      {confirmReq && (
        <ConfirmDialog
          title={confirmReq.title}
          message={confirmReq.message}
          confirmLabel={confirmReq.confirmLabel}
          danger={confirmReq.danger}
          hideCancel={confirmReq.hideCancel}
          /**
           * ⚠️ **这一行是 2026-10-16 补的，补之前第三条路从来没画出来过**（BUG-74）。
           *
           * `ConfirmRequest` 里一直有 `extraLabel`，`ConfirmDialog` 也一直支持它，
           * 漏的是**中间这一层**：这里逐个字段铺过去，而 `extraLabel` 不在名单上——
           * 于是"关掉一份没存盘的文档"那个框实际只有「取消 / 丢弃并关闭」两颗，
           * 「保存并关闭」**一次都没出现过**。⚠️ 它是**静默**的：类型不报错
           *（铺字段本来就不要求铺全）、界面上也看不出少了一颗——
           * 直到 2026-10-16 做「退出前那一问」时才被同一类现象撞出来
           *（那一批的三选框同样只画出了两颗）。判据见 `docs/06` §5.66。
           *
           * ⚠️ 教训：**这一层是"逐个字段铺"的写法，加字段必须回来补一行**。
           * 更稳的写法是 `{...confirmReq}`（`ConfirmDialog` 与 `ConfirmRequest`
           * 只差一个 `onAnswer`），但那是另一笔改动——先把这一颗补上。
           */
          extraLabel={confirmReq.extraLabel}
          onAnswer={answerConfirm}
        />
      )}

      {promptReq && <PromptDialog {...promptReq} onAnswer={answerPrompt} />}

      {imageReq && <ImageDialog request={imageReq} onAnswer={answerImage} />}

      {/* 「链接」框（第 96 ＋ 102 项）。⚠️ 排在插图框后面、「关于」前面：
          它也是"问一句、等一个答案"那一族，与上面三个同一层。 */}
      {linkReq && <LinkDialog request={linkReq} onAnswer={answerLink} />}

      {/* Emoji 选择器。⚠️ 它没有 `request` 可传（那个框不要任何前置信息），
          所以判的是 `emojiOpen` 那个布尔，不是某个请求对象。 */}
      {emojiOpen && <EmojiDialog onAnswer={answerEmoji} />}

      {aboutOpen && (
        <AboutDialog onClose={closeAbout} debugMode={debugMode} onSetDebugMode={onSetDebugMode} />
      )}

      {/* 强制专注这一轮的总结。⚠️ 排在最后＝**盖在最上面**：它是一份"你看完
          就关"的报告，不该被别的浮层压在下面（实际上它们不会同时出现，
          这一条只是别让人随手改动顺序时踩空——同文件头那段）。 */}
      {dedicatedNoteTotalJoin && (
        <FocusSummaryDialog
          total={dedicatedNoteTotalJoin.total}
          now={dedicatedNoteTotalJoin.now}
          onClose={closeDedicatedNoteTotalJoin}
        />
      )}
    </Suspense>
  );
}
