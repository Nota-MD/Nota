/**
 * 查找条的**状态与四个动作**（2026-09-27 从 `App.tsx` 搬来，那边顶着 1000 行硬线）。
 *
 * # 它管什么、不管什么
 *
 * 管：**条子开着没有**（`查找开着`）、**编辑器报上来的命中情况**（`命中情况`）、
 * 以及四个动作（关、开/关、替换当前、全部替换）。
 *
 * 不管：查找**条子长什么样**（在 `ui/FindBar.tsx`），也不管**怎么找**
 * （在 `editor/find.ts` 与 `editor/source.ts` 两条通路里，逐节点问／整篇字符串
 * 各问各的）。
 *
 * # ⚠️ 命中数**不在这里算**
 *
 * `命中情况` 是编辑器**报上来**的（`EditorPane` 通过 `报命中` 交过来），本地
 * 再算一份的话，源码模式下的正则、跨节点口径这些迟早会算出和编辑器不一样的
 * 数——那种差异没人查得动（见 `editor/find.ts` 文件头）。
 *
 * 也**只在内存里**，和「格式化工具栏」同理：它是**看的时候的状态**，不是设置，
 * 不落盘、不进 `settings.toml`。
 *
 * # ⚠️ 关掉时必须把焦点还给编辑区
 *
 * 不还的话，用户关掉条子接着打字，字会打在**已经不显示**的输入框里（浏览器
 * 的焦点还停在那个被卸载的元素上时是 `body`，于是字全丢了）。这不是可有可无
 * 的细节，是"关了之后还能不能接着写"。
 */

import { useCallback, useState } from "react";
import type { RefObject } from "react";

import type { useT } from "@/i18n";
import { 空查找状态, type FindStatus } from "@/editor/find";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Toast } from "@/ui/Toasts";

export interface 查找条出入 {
  /** 编辑区句柄。⚠️ 传 `ref` **本体**（身份稳定），不是 `ref.current`。 */
  editorRef: RefObject<EditorPaneHandle | null>;
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
  /** ⚠️ 用 `i18n` 那个 `t` **本身**的类型（`useT()` 的返回值），别手写一个
   *  更窄的——`{0}` 带参数那几条就调不动了（2026-09-28 撞上过）。 */
  t: ReturnType<typeof useT>;
}

export interface 查找条 {
  /** 条子开着没有。 */
  查找开着: boolean;
  /** 编辑器报上来的命中情况（几个、现在第几个）。 */
  命中情况: FindStatus;
  /** 编辑器**报**命中情况用的。给 `EditorPane` 的 `onFindStatus`。 */
  报命中: (s: FindStatus) => void;
  /** 关掉：清高亮、清命中数，并把焦点还给编辑区。 */
  关查找: () => void;
  /** 「查找和替换…」——开、再点一次关。 */
  切查找: () => void;
  /** 「替换」：换掉**当前那个**命中。 */
  替换当前: (text: string) => void;
  /** 「全部替换」：报个数。 */
  全部替换: (text: string) => void;
}

export function useFindBar({ editorRef, toast, t }: 查找条出入): 查找条 {
  const [查找开着, set查找开着] = useState(false);
  const [命中情况, 报命中] = useState<FindStatus>(空查找状态);

  const 关查找 = useCallback(() => {
    set查找开着(false);
    报命中(空查找状态);
    editorRef.current?.clearFind();
    editorRef.current?.focus();
  }, [editorRef]);

  const 切查找 = useCallback(() => {
    if (查找开着) 关查找();
    else set查找开着(true);
  }, [查找开着, 关查找]);

  /**
   * 「替换」：换掉**当前那个**命中。⚠️ 没有当前命中时如实说一句——
   * 不提示的话用户看到的是"点了没反应"，而原因（还没按过「下一个」）
   * 是看不出来的。
   */
  const 替换当前 = useCallback(
    (text: string) => {
      if (!editorRef.current?.replaceCurrent(text)) {
        toast(t("The cursor is not on a match — press “Next” first."), "info");
      }
    },
    [editorRef, toast, t],
  );

  /** 「全部替换」：报个数——换了多少是用户唯一能核对的凭据。 */
  const 全部替换 = useCallback(
    (text: string) => {
      const n = editorRef.current?.replaceAll(text) ?? 0;
      toast(
        n === 0 ? t("Nothing to replace") : t("Replaced {0} occurrences", n),
        n === 0 ? "info" : "success",
      );
    },
    [editorRef, toast, t],
  );

  return { 查找开着, 命中情况, 报命中, 关查找, 切查找, 替换当前, 全部替换 };
}
