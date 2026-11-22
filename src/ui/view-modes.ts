



















import type { ViewMode } from "@/bridge/ipc";
















export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  wysiwyg: "WYSIWYG",
  source: "Source Mode",
  split: "Split Preview",
};


export const VIEW_MODE_ORDER: ViewMode[] = ["wysiwyg", "source", "split"];
