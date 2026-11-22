











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

      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, level, action }]);


      //




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
