import { useCallback, useState } from "react";

import { api, type DocThemeInfo } from "@/bridge/ipc";
import { BUILTIN_DOC_THEMES } from "@/ui/useStartup";

/** 文档主题清单：内置 Adwaita 首帧就有，打开主题菜单时重扫用户目录。 */
export function useDocThemeInventory() {
  const [themes, setThemes] = useState<DocThemeInfo[]>(BUILTIN_DOC_THEMES);
  const refresh = useCallback(() => {
    void api.theme
      .list()
      .then((list) => setThemes(list.length > 0 ? list : BUILTIN_DOC_THEMES))
      .catch(() => setThemes(BUILTIN_DOC_THEMES));
  }, []);
  return { themes, setThemes, refresh };
}
