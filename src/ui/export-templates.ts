import type { CustomExporter, Settings } from "@/bridge/ipc";

export interface ExportTemplate {
  format: string;
  name: string;
  extension: string;
}

export const exportTemplate: readonly ExportTemplate[] = [
  { format: "docx", name: "Word (.docx)", extension: "docx" },
  { format: "odt", name: "OpenDocument", extension: "odt" },
  { format: "rtf", name: "RTF", extension: "rtf" },
  { format: "epub", name: "Epub", extension: "epub" },
  { format: "latex", name: "LaTeX", extension: "tex" },
  { format: "mediawiki", name: "MediaWiki", extension: "wiki" },
  { format: "rst", name: "reStructuredText", extension: "rst" },
  { format: "textile", name: "Textile", extension: "textile" },
  { format: "opml", name: "OPML", extension: "opml" },
];

/** 「从模板添加」里额外允许新建 PDF；默认自定义列表仍从 Word 开始。 */
export const addableTemplates: readonly ExportTemplate[] = [
  { format: "pdf", name: "PDF", extension: "pdf" },
  ...exportTemplate,
];

export function defaultCustomExporter(): CustomExporter[] {
  return exportTemplate.map((item) => ({
    id: `template-${item.format}`,
    name: item.name,
    format: item.format,
    args: "",
    style_file: "",
    open_after_export: false,
  }));
}

export const defaultExporter: CustomExporter[] = defaultCustomExporter();

export const defaultExportSettings: Settings["export"] = {
  default_folder: "",
  open_after_export: false,
  pandoc_args: "",
  custom_exporters: defaultExporter,
};

export function exportTemplateInfo(format: string): ExportTemplate | undefined {
  return addableTemplates.find((item) => item.format === format);
}

export function customExportCommand(id: string): string {
  return `file.exportCustom:${id}`;
}

/** 把一个样式文件转成 pandoc 参数。路径先统一成 `/`，再按 shlex 规则加引号。 */
export function styleStyleTextItemParameter(format: string, path: string): string {
  const clearManage = path.trim();
  if (!clearManage) return "";
  const parameter = (() => {
    if (format === "docx" || format === "odt") return "--reference-doc=";
    if (format === "epub") return "--css=";
    if (format === "latex") return "--include-in-header=";
    return "";
  })();
  if (!parameter) return "";
  const value2 = clearManage.replaceAll("\\", "/").replaceAll('"', '\\"');
  return `${parameter}"${value2}"`;
}
