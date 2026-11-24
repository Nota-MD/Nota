import { useCallback, useEffect, useState } from "react";

import { api, type DocThemeInfo } from "@/bridge/ipc";
import { BUILTIN_DOC_THEMES } from "@/ui/useStartup";


export function useDocThemeInventory() {
  const [themes, setThemes] = useState<DocThemeInfo[]>(BUILTIN_DOC_THEMES);
  const refresh = useCallback(() => {
    void api.theme
      .list()
      .then((list) => setThemes(list.length > 0 ? list : BUILTIN_DOC_THEMES))
      .catch(() => setThemes(BUILTIN_DOC_THEMES));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { themes, setThemes, refresh };
}
