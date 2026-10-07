/**
 * **正文里那一下「点链接」**（`docs/07` 第 96 项，2026-10-07）。
 *
 * | 那一下 | 发生什么 |
 * |---|---|
 * | 单击 | 弹同一个「链接」框，两个框里都是**这条链接的现值**（改完写回是一笔真编辑） |
 * | `Ctrl`（或 `⌘`）＋单击 | 交给系统浏览器（现成的 `opener:allow-open-url`，不新开能力） |
 * | 只读那一侧（分屏右侧预览） | **什么都不做**——那儿改不了，也不该弹框 |
 *
 * # ⚠️ 为什么是"从 DOM 的锚点上读"，而不是"问 PM 状态"
 *
 * 指针点在哪条 `<a>` 上，**浏览器已经算好了**（`closest("a[href]")`）；而写回去
 * 交给 `linkSet`——它作用在**光标处**那条链接上，而 PM 在 `mousedown` 时**已经把
 * 光标放进那条链接里**了。两边各自都是现成的，中间一条句柄都不用加
 * （给句柄加方法的代价见 `docs/09` §4 那条"编辑器句柄每加一条，两种模式都要实现"）。
 *
 * # ⚠️ 只读那一侧靠 `contenteditable` 认，不靠"哪个窗格"
 *
 * 分屏右侧那份预览是**同一套 Milkdown**建的、也会画出真的 `<a href>`——那儿的
 * 链接点下去不该弹编辑框（改不了）。判据取的是 PM 自己那一个属性（只读实例上
 * 是 `contenteditable="false"`），于是"改动预览"那种**临时**锁只读也一并躲开了
 * （`source.ts` 的只读舱走的是同一个属性）。按窗格的类名判的话，这两档都要各写一遍，
 * 而漏掉任何一档的症状都是"在一个改不动的地方弹出了一个改得动的框"。
 *
 * ⚠️ **`preventDefault` 那句不能省**：那是一个真的 `<a href>`，WebView 自己的
 * 默认动作就是**导航**——不放行它，用户点一次链接整扇窗就换成了那个网页。
 */

import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { RefObject } from "react";

import { 危险协议 } from "@/editor/url-link";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import type { Dialogs } from "@/ui/useDialogs";
import type { Toast } from "@/ui/Toasts";
import { useT } from "@/i18n";

/** 一条 DOM 锚点上的链接：它显示的那几个字 ＋ 它的地址。 */
export interface 链接目标 {
  label: string;
  href: string;
}

/**
 * `节点` 往上找，它所在的那条**可编辑**链接。不在链接里、或者落在只读那一侧，
 * 给 `null`。
 *
 * ⚠️ 取的是 `getAttribute("href")` 而**不是** `锚.href`：后者是**解析过**的
 * 绝对地址（相对路径会被补成 `file:///…`），写回文档时那就成了另一条地址。
 */
export function 找链接(节点: Node | null): 链接目标 | null {
  if (!节点) return null;
  const 元素 = 节点.nodeType === Node.ELEMENT_NODE ? (节点 as Element) : 节点.parentElement;
  const 锚 = 元素?.closest("a[href]") ?? null;
  if (!锚) return null;
  // ⚠️ 只认**可编辑**那一侧的那一份（见文件头）。
  if (!锚.closest('[contenteditable="true"]')) return null;
  return { label: 锚.textContent ?? "", href: 锚.getAttribute("href") ?? "" };
}

/** 光标（DOM 选区）此刻落在哪条链接上。「插入链接」那颗按下去时用它预填。 */
export function 光标处那条链接(): 链接目标 | null {
  return 找链接(typeof window === "undefined" ? null : (window.getSelection()?.anchorNode ?? null));
}

/** 这一格要的东西。⚠️ `主区` 传 **ref 本体**（身份稳定），不是 `.current`。 */
export interface 点链接接线 {
  /** `<main class="app-main">` 那个挂载点（`ui/EditorArea.tsx`）。 */
  主区: RefObject<HTMLElement | null>;
  /** ⚠️ 类型**从 `useDialogs` 借**：另写一份迟早少一个字段。 */
  askLink: Dialogs["askLink"];
  /** 转交一条编辑命令（`ui/useEditorCommands.ts` 的 `run`）。 */
  跑命令: (c: EditorCommand, payload?: CommandPayload) => void;
  /** 「打不开浏览器」要说一句（见下面那条口径）。 */
  toast: (message: string, level?: Toast["level"]) => void;
}

export function use点链接({ 主区, askLink, 跑命令, toast }: 点链接接线): void {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`。
  const t = useT();
  // ⚠️ 依赖里放 `主区` 那个 **ref 对象**（建一次就不换）；监听挂在 DOM 元素上，
  // 所以每次动作前现读 `主区.current`。两个回调也进依赖——它们换了身份就重挂一次
  // （挂一个 `click` 是最便宜的那种活），换来的是一条硬保证：**监听里跑的永远是
  // 这一刻那份闭包**，不是首帧那一份。
  useEffect(() => {
    const 宿主 = 主区.current;
    if (!宿主) return;

    const 点击 = (e: MouseEvent) => {
      const 链 = 找链接(e.target as Node | null);
      if (!链) return;
      // ⚠️ 那是一个真的 `<a href>`：不拦，WebView 自己就导航走了（见文件头）。
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // ⚠️ 危险协议一个都不许送到系统浏览器去（`url-link.ts` 那道闸，与本文档里
        // 那条"不写成链接"是同一个答案）。⚠️ 这里**一声不吭**：它是防御性的拒答，
        // 不是用户做错了什么——弹一条提示只会让人以为是自己按错了。
        if (危险协议(链.href)) return;
        // ⚠️ **打不开要吭声**，与 `ui/useExport.ts` 那颗「去官网」同一条口径
        //（"点下去没反应会让人以为按钮坏了"）。⛔ 别照 `AboutDialog` 那条"打不开
        // 就算了"办——那是页脚里一行可有可无的外链，这里是用户刚刚做的一个动作。
        // ⚠️ 这一条有实测背景：本机的开发容器里 `xdg-open` 曾经是坏的（静默退 127），
        // 那时这一下**什么都不显示**，用户只会以为"Ctrl＋单击没做"。
        void openUrl(链.href).catch((err: unknown) =>
          toast(t("Could not open the browser: {0}", String(err)), "error"),
        );
        return;
      }

      void (async () => {
        const 答 = await askLink({ label: 链.label, href: 链.href, editing: true });
        if (!答) return; // 取消：一个字都不动
        if (答.kind === "remove") 跑命令("linkRemove");
        else 跑命令("linkSet", { href: 答.href, label: 答.label });
      })();
    };

    宿主.addEventListener("click", 点击);
    return () => 宿主.removeEventListener("click", 点击);
  }, [主区, askLink, 跑命令, toast, t]);
}
