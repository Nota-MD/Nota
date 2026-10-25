import type { CustomExporter } from "@/bridge/ipc";
import type { MenuSpec } from "@/ui/commands";
import { customExportCommand } from "@/ui/export-templates";

/**
 * 把「文件 → 导出」里那一段换成设置页现在真正持有的格式：
 * PDF / HTML 两档 / 图片固定在上，分隔线以下按用户顺序列自定义导出器。
 */
export function injectExporter(
  menus: readonly MenuSpec[],
  exporters: readonly CustomExporter[],
): MenuSpec[] {
  return menus.map((menu) => {
    if (menu.id !== "file") return menu as MenuSpec;
    return {
      ...menu,
      items: menu.items.map((item) => {
        if (item === "sep" || item.id !== "file.export") return item;
        return {
          ...item,
          submenu: [
            { id: "file.exportPdf", label: "PDF…", needsDoc: true },
            { id: "file.exportHtmlStyled", label: "HTML (With Styles)…", needsDoc: true },
            { id: "file.exportHtmlPlain", label: "HTML (No Styles)…", needsDoc: true },
            { id: "file.exportImage", label: "Image…", needsDoc: true },
            ...(exporters.length ? (["sep"] as const) : []),
            ...exporters.map((exporter) => ({
              id: customExportCommand(exporter.id),
              label: exporter.name,
              needsDoc: true,
            })),
          ],
        };
      }),
    };
  });
}
