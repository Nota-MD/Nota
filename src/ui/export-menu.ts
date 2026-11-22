import type { CustomExporter } from "@/bridge/ipc";
import type { MenuSpec } from "@/ui/commands";
import { customExportCommand } from "@/ui/export-templates";





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
