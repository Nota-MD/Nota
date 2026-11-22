



































import { useCallback, useMemo, useState } from "react";
import { open as openDialog, save as saveDialog } from "@/ui/file-picker";

import {
  api,
  type CustomExporter,
  type DocId,
  type Document,
  type ExportSettings,
  type PandocFormatInfo,
  type PandocProbe,
} from "@/bridge/ipc";
import { exportHtml, defaultExportName } from "@/editor/export";
import { htmlToPngBase64 } from "@/ui/export-image";
import { numberLearnCodeBlockConvertCommonStyle } from "@/editor/math-code";
import { documentThemeLooksDark } from "@/styles/theme-contrast";
import type { Dialogs } from "@/ui/useDialogs";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";
import { styleStyleTextItemParameter } from "@/ui/export-templates";
import { openBrowserSystemPrint } from "@/ui/print-browser";


export interface PandocGate {

  probe: PandocProbe | null;

  format: PandocFormatInfo | null;

  exporter?: CustomExporter | null;
}

export interface exportWiring {

  activeId: DocId | null;

  docs: Document[];

  getMarkdown: () => string | undefined;

  themeId: string;

  exportSettings: ExportSettings;
  toast: (message: string, level?: Toast["level"]) => void;

  askConfirm: Dialogs["askConfirm"];

  openImported: (markdown: string, titleHint: string | null) => Promise<boolean>;
}

export interface exportApi {

  export: (styled: boolean) => Promise<void>;

  exportImage: () => Promise<void>;

  print: () => Promise<void>;

  exportAs: (format: string) => Promise<void>;

  exportCustom: (id: string) => Promise<void>;

  guideEnterAs: (format: string) => Promise<void>;

  pandocGate: PandocGate | null;




  pandocGateActions: {

    onExport: () => void;
    onRecheck: () => void;
    onClose: () => void;
  };
}








export function placeAtItemRecord(path: string): string | null {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut <= 0 ? null : path.slice(0, cut);
}













export function combinePath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export function useExport(w: exportWiring): exportApi {


  const t = useT();
  const {
    activeId,
    docs,
    getMarkdown,
    themeId,
    exportSettings,
    toast,
    askConfirm,
    openImported,
  } = w;
  const [pandocGate, setPandocGate] = useState<PandocGate | null>(null);


  const readThemeCss = useCallback(async (): Promise<string | undefined> => {
    if (!themeId) return undefined;
    try {
      return await api.theme.css(themeId);
    } catch (e) {
      console.warn("[nota] Could not load the document theme for export; exporting without it:", e);
      return undefined;
    }
  }, [themeId]);







  const getPrintThemeCSS = useCallback(async (): Promise<string | undefined | null> => {
    const css = await readThemeCss();
    if (!documentThemeLooksDark(css ?? "")) return css;
    await askConfirm({
      title: t("Light theme required"),
      message: t(
        "Printing and PDF output only support light themes. Please select a light theme before printing.",
      ),
      confirmLabel: t("OK"),
      hideCancel: true,
    });
    return null;
  }, [askConfirm, t, readThemeCss]);







  const canAbleWantFixedPosition = useCallback(
    async (path: string, override?: boolean) => {
      if (!(override ?? exportSettings.open_after_export)) return;
      try {
        await api.export.reveal(path);
      } catch (e) {
        toast(t("The file was exported, but could not be revealed in the file manager: {0}", String(e)), "warn");
      }
    },
    [exportSettings.open_after_export, toast],
  );


















  const defaultDrop = useCallback(
    (name: string, docPath: string | null): string => {
      const dir = exportSettings.default_folder || (docPath ? placeAtItemRecord(docPath) : null);
      return dir ? combinePath(dir, name) : name;
    },
    [exportSettings.default_folder],
  );





  const exportHtmlAction = useCallback(
    async (styled: boolean) => {
      const doc = docs.find((d) => d.id === activeId);
      const text = getMarkdown();
      if (!doc || text === undefined) return;

      try {
        const picked = await saveDialog({
          title: styled ? t("Export HTML (With Styles)") : t("Export HTML (No Styles)"),

          defaultPath: defaultDrop(defaultExportName(doc.title, "html"), doc.path),
          filters: [{ name: "HTML", extensions: ["html", "htm"] }],
        });
        if (!picked) return;

        const html = await exportHtml(text, {
          styled,
          themeCss: styled ? await readThemeCss() : undefined,
          includeHtmlPreviews: true,
          title: doc.title,
        });
        const written = await api.export.write(picked, html);

        toast(t("Exported to {0}", written), "success");
        await canAbleWantFixedPosition(written);
      } catch (e) {
        toast(t("Could not export: {0}", String(e)), "error");
      }
    },
    [activeId, docs, getMarkdown, readThemeCss, toast, defaultDrop, canAbleWantFixedPosition],
  );

  const exportImage = useCallback(async () => {
    const doc = docs.find((d) => d.id === activeId);
    const text = getMarkdown();
    if (!doc || text === undefined) return;
    try {
      const html = await exportHtml(text, {
        styled: true,
        themeCss: await readThemeCss(),
        includeHtmlPreviews: false,
        title: doc.title,
      });
      const base64 = await htmlToPngBase64(html);
      const picked = await saveDialog({
        title: t("Export Image"),
        defaultPath: defaultDrop(defaultExportName(doc.title, "png"), doc.path),
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!picked) return;
      const written = await api.export.writeBytes(picked, base64);
      toast(t("Exported to {0}", written), "success");
      await canAbleWantFixedPosition(written);
    } catch (e) {
      toast(t("Could not export: {0}", String(e)), "error");
    }
  }, [activeId, docs, getMarkdown, readThemeCss, toast, defaultDrop, canAbleWantFixedPosition, t]);

  const print = useCallback(async () => {
    const doc = docs.find((d) => d.id === activeId);
    const text = getMarkdown();
    if (!doc || text === undefined) return;

    try {
      const themeCss = await getPrintThemeCSS();
      if (themeCss === null) return;
      const html = await exportHtml(text, {
        styled: true,
        themeCss,
        lightOutput: true,
        title: doc.title,
      });


      if (await api.print.supported()) {


        const backend = await api.print.backend();
        if (backend === "pdf") {
          await api.print.system({
            html,
            baseDir: doc.path ? placeAtItemRecord(doc.path) : null,
            paper: "a4",
            landscape: false,
            marginMm: 12,
          });
        } else {
          await openBrowserSystemPrint(html);
        }
      } else {
        const path = await api.export.print(doc.path, doc.title, html);
        toast(
          t("Opened in the system default app — press Ctrl+P there to print (the file is at {0})", path),
          "info",
        );
      }
    } catch (e) {
      toast(t("Could not print: {0}", String(e)), "error");
    }
  }, [activeId, docs, getMarkdown, getPrintThemeCSS, toast]);






  const realExport = useCallback(
    async (
      doc: Document,
      format: PandocFormatInfo,
      exporter: CustomExporter | null = null,
    ) => {
      const text = getMarkdown();
      if (text === undefined) return;
      try {
        const pdf = format.id === "pdf";
        const printThemeCss = pdf ? await getPrintThemeCSS() : undefined;
        if (printThemeCss === null) return;
        const picked = await saveDialog({
          title: t("Export {0}", format.name),
          defaultPath: defaultDrop(defaultExportName(doc.title, format.extension), doc.path),
          filters: [{ name: format.name, extensions: [format.extension] }],
        });
        if (!picked) return;




        const html =
          pdf
            ? await exportHtml(text, {
                styled: true,
                themeCss: printThemeCss,
                lightOutput: true,
                title: doc.title,
              })
            : null;

        const styleStyleParameter = exporter
          ? styleStyleTextItemParameter(exporter.format, exporter.style_file)
          : "";
        const exportArguments = exporter
          ? [exportSettings.pandoc_args, exporter.base_args, exporter.args, styleStyleParameter]
          : [exportSettings.pandoc_args];
        const result2 = await api.pandoc.export({
          format: format.id,
          markdown: numberLearnCodeBlockConvertCommonStyle(text),
          target: picked,
          docPath: doc.path,
          html,






          themeCss: pdf ? "" : ((await readThemeCss()) ?? ""),

          pandocArgs: exportArguments.filter(Boolean).join(" "),
        });


        toast(t("Exported to {0}. {1}", result2.path, result2.note), "success");
        await canAbleWantFixedPosition(result2.path, exporter?.open_after_export);
      } catch (e) {
        toast(t("Could not export: {0}", String(e)), "error");
      }
    },
    [
      getMarkdown,
      getPrintThemeCSS,
      readThemeCss,
      exportSettings.pandoc_args,
      toast,
      defaultDrop,
      canAbleWantFixedPosition,
    ],
  );








  const exportAs = useCallback(
    async (format: string) => {
      const doc = docs.find((d) => d.id === activeId);
      if (!doc || getMarkdown() === undefined) return;

      let probe: PandocProbe;
      try {
        probe = await api.pandoc.probe();
      } catch (e) {
        toast(t("Could not probe for pandoc: {0}", String(e)), "error");
        return;
      }

      const info = probe.formats.find((f) => f.id === format) ?? null;
      if (info === null) {
        toast(t("Unrecognised export format: {0}", format), "error");
        return;
      }

      if (probe.state === "ready") {
        await realExport(doc, info);
        return;
      }
      setPandocGate({ probe, format: info });
    },
    [activeId, docs, getMarkdown, realExport, toast],
  );

  const exportCustom = useCallback(
    async (id: string) => {
      const exporter =
        exportSettings.custom_exporters.find((item) => item.id === id) ?? null;
      if (!exporter) {
        toast(t("Unrecognised export format: {0}", id), "error");
        return;
      }
      const doc = docs.find((d) => d.id === activeId);
      if (!doc || getMarkdown() === undefined) return;

      let probe: PandocProbe;
      try {
        probe = await api.pandoc.probe();
      } catch (e) {
        toast(t("Could not probe for pandoc: {0}", String(e)), "error");
        return;
      }
      const info = probe.formats.find((item) => item.id === exporter.format) ?? null;
      if (!info) {
        toast(t("Unrecognised export format: {0}", exporter.format), "error");
        return;
      }
      if (probe.state === "ready") {
        await realExport(doc, info, exporter);
        return;
      }
      setPandocGate({ probe, format: info, exporter });
    },
    [activeId, docs, exportSettings.custom_exporters, getMarkdown, realExport, t, toast],
  );





  const guideEnterAs = useCallback(
    async (format: string) => {
      let probe: PandocProbe;
      try {
        probe = await api.pandoc.probe();
      } catch (e) {
        toast(t("Could not probe for pandoc: {0}", String(e)), "error");
        return;
      }
      const info = probe.import_formats.find((item) => item.id === format);
      if (!info) {
        toast(t("Unrecognised import format: {0}", format), "error");
        return;
      }
      if (probe.state !== "ready") {
        toast(
          t("Importing {0} requires Pandoc. Install it, then try again.", info.name),
          "error",
        );
        return;
      }

      const picked = await openDialog({
        title: t("Import {0}", info.name),
        multiple: false,
        filters: [{ name: info.name, extensions: info.extensions }],
      });
      if (typeof picked !== "string") return;

      try {
        const result = await api.pandoc.importFile(format, picked);
        const name = picked.split(/[\\/]/).pop() ?? picked;
        const titleHint = name.replace(/\.[^.]+$/, "");
        await openImported(result.markdown, titleHint);
        const note = result.warnings
          ? ` ${t("Some resources may not have been imported: {0}", result.warnings)}`
          : "";
        toast(t("Imported {0}", name) + note, result.warnings ? "info" : "success");
      } catch (e) {
        toast(t("Could not import: {0}", String(e)), "error");
      }
    },
    [openImported, t, toast],
  );


  const pandocGateActions = useMemo(
    () => ({
      onExport: () => {
        const gate = pandocGate;
        if (gate === null || gate.format === null) return;
        const doc = docs.find((d) => d.id === activeId);
        setPandocGate(null);
        if (doc === undefined) return;

        void realExport(doc, gate.format, gate.exporter ?? null);
      },
      onRecheck: () => {
        setPandocGate((g) => (g === null ? g : { ...g, probe: null }));
        void (async () => {
          try {
            const probe = await api.pandoc.probe();
            setPandocGate((g) => (g === null ? g : { ...g, probe }));
          } catch (e) {
            toast(t("Could not probe for pandoc: {0}", String(e)), "error");
            setPandocGate(null);
          }
        })();
      },
      onClose: () => setPandocGate(null),
    }),
    [pandocGate, docs, activeId, realExport, toast],
  );

  return {
    export: exportHtmlAction,
    exportImage,
    print,
    exportAs,
    exportCustom,
    guideEnterAs,
    pandocGate,
    pandocGateActions,
  };
}
