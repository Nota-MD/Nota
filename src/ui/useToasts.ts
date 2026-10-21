/**
 * 右下角临时提示的宿主。
 *
 * `App.tsx` 里原本就是这三行 `useState` + 一个 `toast` 回调 + 一个 `dismiss`
 * （内联在渲染里）。2026-09-25 搬到这儿，理由和这个仓库里其他几次搬迁一样：
 * **那支文件顶着行数上限**（当时 958 行，软上限 900）——而那三行和
 * `App.tsx` 编排的文档 / 插件 / 工作区三件事一点关系都没有。
 *
 * ⚠️ 提示的**文案**仍然由调用方给。这里只管"什么时候消失"，
 * 因为那条规则有两条反直觉的分支（见 `toast` 的注释）。
 */

import { useCallback, useState } from "react";

import type { Toast, ToastAction } from "@/ui/Toasts";

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(
    (
      message: string,
      level: Toast["level"] = "info",
      ttlMs?: number,
      action?: ToastAction,
    ) => {
      // id 只要在这一次会话里不撞就行，不必是 UUID。
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, level, action }]);

      // 自动消失。错误留久一点——用户多半要读完再决定怎么办。
      //
      // ⚠️ `ttlMs === 0` 是**不自动消失**，只等用户点那条上的叉：它是给
      // "描述**状态**、不是描述**刚做的某个动作**"的提示用的。开机读设置
      // 失败就是这种——8 秒后自己走掉的话，用户回头看到的依旧是一份
      // "自己变回默认"的设置，等于没说。提示条上有叉，它不会赖着不走。
      const ttl = ttlMs ?? (level === "error" ? 8000 : 3200);
      if (ttl > 0) {
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, ttl);
      }
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, toast, dismiss };
}
