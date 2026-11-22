





















import { useEffect, useState } from "react";

import type { UiMode } from "@/bridge/ipc";
import { resolveMode } from "@/styles/applyTheme";

export function useUiMode(mode: UiMode): "light" | "dark" {
  const [current, setCurrent] = useState(() => resolveMode(mode));

  useEffect(() => {
    const paint = () => setCurrent(resolveMode(mode));
    paint();

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");

    if (!mq || mode !== "auto") return;
    mq.addEventListener("change", paint);
    return () => mq.removeEventListener("change", paint);
  }, [mode]);

  return current;
}
