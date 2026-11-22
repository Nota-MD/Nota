






























import { useMemo } from "react";

import type { CustomExporter } from "@/bridge/ipc";
import { ApplyKeyOverrides, type MenuSpec } from "@/ui/commands";
import { injectExporter } from "@/ui/export-menu";
import { noteEnterRecentTextItem } from "@/ui/recentMenu";

export interface menuTableInput {

  allMenus: MenuSpec[];






  recent: readonly string[];

  coverCover: Record<string, string> | undefined;

  exporter: readonly CustomExporter[];
}

export function useMenuTable({
  allMenus,
  recent,
  coverCover,
  exporter,
}: menuTableInput): readonly MenuSpec[] {
  return useMemo(
    () =>
      ApplyKeyOverrides(
        noteEnterRecentTextItem(injectExporter(allMenus, exporter), recent),
        coverCover ?? {},
      ),
    [allMenus, recent, coverCover, exporter],
  );
}
