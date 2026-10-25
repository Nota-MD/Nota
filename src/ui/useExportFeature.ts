import type { ExportSettings } from "@/bridge/ipc";
import { defaultExportSettings } from "@/ui/export-templates";
import { useExport, type exportWiring, type exportApi } from "@/ui/useExport";

interface input extends Omit<exportWiring, "exportSettings"> {
  /** 设置还没到岸时使用稳定的出厂对象，避免菜单和回调每帧换身份。 */
  exportSettings?: ExportSettings;
}

export interface exportFeatureApi extends exportApi {
  exportSettings: ExportSettings;
}

export function useExportFeature(input: input): exportFeatureApi {
  const { exportSettings: giveFixed, ...wiring } = input;
  const exportSettings = giveFixed ?? defaultExportSettings;
  return {
    ...useExport({ ...wiring, exportSettings }),
    exportSettings,
  };
}
