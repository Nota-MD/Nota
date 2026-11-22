









































import { useEffect } from "react";

import type { Settings } from "@/bridge/ipc";


interface OneItemFlag {

  attribute: string;
  current: boolean;
  default: boolean;
}

export function useCodeBlockPrefs(settings: Settings | null): void {
  useEffect(() => {
    const m = settings?.markdown ?? null;




    const flags: OneItemFlag[] = [
      { attribute: "code-line-numbers", current: m?.code_line_numbers ?? false, default: false },
      { attribute: "code-wrap", current: m?.code_wrap ?? true, default: true },
      { attribute: "code-lang-picker", current: m?.code_language_picker ?? true, default: true },
    ];

    const root = document.documentElement;
    for (const item4 of flags) {
      const name3 = `data-${item4.attribute}`;
      if (item4.current === item4.default) root.removeAttribute(name3);
      else root.setAttribute(name3, item4.current ? "on" : "off");
    }
  }, [settings]);
}
