import { useEffect, useState } from "react";

import type { SelectionSnapshot } from "@/editor/caret-snapshot";

/** Keep the latest editor selection for UI consumers such as the status bar. */
export function useLiveSelection(documentId: number | null) {
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);

  useEffect(() => {
    setSelection(null);
  }, [documentId]);

  return [selection, setSelection] as const;
}
