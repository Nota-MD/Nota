/**
 * 「导出」设置。
 *
 * 左侧按 Typora 的结构分成两段：通用、PDF、HTML、无样式 HTML、图片是固定项；
 * 分隔线以下是可增删、排序和改名的导出器。固定项只改 Nota 自己内置的导出路径，
 * 自定义项都借系统里的 pandoc。
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { CustomExporter } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { chooseDirectory, pickFile } from "@/ui/file-picker";
import { addableTemplates, exportTemplateInfo } from "@/ui/export-templates";
import { Icon } from "@/ui/Icon";
import { useModalTrap } from "@/ui/useModalTrap";
import { ActionButton, Note, SettingRow, SettingsGroup, TextInput, Toggle } from "../primitives";
import { paneWriter, type PaneProps } from "./props";

const FixedFixedPage = ["general", "pdf", "html", "html-plain", "image"] as const;
type FixedFixedPage = (typeof FixedFixedPage)[number];

function ToolbarGlyph(props: { kind: "add" | "remove" | "up" | "down" | "edit" }) {
  const path = {
    add: "M8 3v10M3 8h10",
    remove: "M3 8h10",
    up: "M8 13V3M4.5 6.5 8 3l3.5 3.5",
    down: "M8 3v10M4.5 9.5 8 13l3.5-3.5",
    edit: "M3 13l.8-3 6.8-6.8 2.2 2.2L6 12.2 3 13z",
  }[props.kind];
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function styleStyleTextItemFilterSelect(format: string): { name: string; extensions: string[] } {
  if (format === "docx") return { name: "Word", extensions: ["docx"] };
  if (format === "odt") return { name: "OpenDocument", extensions: ["odt"] };
  if (format === "epub") return { name: "CSS", extensions: ["css"] };
  if (format === "latex") return { name: "LaTeX", extensions: ["tex", "sty", "cls"] };
  return { name: "All files", extensions: ["*"] };
}

export function ExportPane({ settings, onChange }: PaneProps) {
  const t = useT();
  const write = paneWriter(settings, onChange, "export");
  const e = settings.export;
  const exporters = Array.isArray(e.custom_exporters) ? e.custom_exporters : [];
  const [selected, setSelected] = useState<string>("general");
  const [addAddOpen, setAddAddOpen] = useState(false);
  const [modelBoard, setModelBoard] = useState(addableTemplates[0]?.format ?? "pdf");
  const nameBoxid = "export-exporter-name";
  const addAddBox = useRef<HTMLDivElement>(null);
  const modelBoardBox = useRef<HTMLSelectElement>(null);

  const currentCustom = useMemo(
    () => exporters.find((item) => item.id === selected) ?? null,
    [exporters, selected],
  );

  useEffect(() => {
    if (selected === "general" || FixedFixedPage.includes(selected as FixedFixedPage)) return;
    if (!exporters.some((item) => item.id === selected)) setSelected("general");
  }, [exporters, selected]);

  useModalTrap(addAddBox, {
    enabled: addAddOpen,
    onEscape: () => setAddAddOpen(false),
  });

  useEffect(() => {
    if (!addAddOpen) return;
    const frame = requestAnimationFrame(() => modelBoardBox.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [addAddOpen]);

  const changeCustom = (id: string, patch: Partial<CustomExporter>) => {
    write({
      custom_exporters: exporters.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  };

  const addAdd = () => {
    const info = exportTemplateInfo(modelBoard);
    if (!info) return;
    const sameCellStyleNumber = exporters.filter((item) => item.format === info.format).length;
    const name2 = sameCellStyleNumber ? `${info.name} ${sameCellStyleNumber + 1}` : info.name;
    const id = `custom-${Date.now()}-${exporters.length}`;
    const newValueItem2: CustomExporter = {
      id,
      name: name2,
      format: info.format,
      args: "",
      style_file: "",
      open_after_export: false,
    };
    setAddAddOpen(false);
    setSelected(id);
    write({ custom_exporters: [...exporters, newValueItem2] });
  };

  const removeRemove = () => {
    if (!currentCustom) return;
    const index = exporters.findIndex((item) => item.id === currentCustom.id);
    write({ custom_exporters: exporters.filter((item) => item.id !== currentCustom.id) });
    const neighbor = exporters[index + 1] ?? exporters[index - 1];
    setSelected(neighbor?.id ?? "general");
  };

  const moveAction = (direction: -1 | 1) => {
    if (!currentCustom) return;
    const index = exporters.findIndex((item) => item.id === currentCustom.id);
    const to2 = index + direction;
    if (index < 0 || to2 < 0 || to2 >= exporters.length) return;
    const belowOneDocument = exporters.slice();
    const [item5] = belowOneDocument.splice(index, 1);
    if (!item5) return;
    belowOneDocument.splice(to2, 0, item5);
    write({ custom_exporters: belowOneDocument });
  };

  const fixedFixedGuideNavigation: ReadonlyArray<{ id: FixedFixedPage; label: string }> = [
    { id: "general", label: t("General") },
    { id: "pdf", label: "PDF" },
    { id: "html", label: "HTML" },
    { id: "html-plain", label: t("HTML (without Styles)") },
    { id: "image", label: t("Image") },
  ];

  return (
    <div className="export-settings">
      <div className="export-settings-head">
        <h2>{t("Export")}</h2>
      </div>

      <div className="export-settings-layout">
        <aside className="export-nav" aria-label={t("Export settings")}>
          <div className="export-nav-fixed" role="tablist">
            {fixedFixedGuideNavigation.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected === item.id}
                className={selected === item.id ? "is-current" : ""}
                onClick={() => setSelected(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="export-nav-sep" role="separator" />
          <div className="export-nav-custom" role="tablist">
            {exporters.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected === item.id}
                className={selected === item.id ? "is-current" : ""}
                onClick={() => setSelected(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="export-nav-tools" role="toolbar" aria-label={t("Custom exporters")}>
            <button type="button" title={t("Add")} aria-label={t("Add")} onClick={() => setAddAddOpen(true)}>
              <ToolbarGlyph kind="add" />
            </button>
            <button
              type="button"
              title={t("Delete")}
              aria-label={t("Delete")}
              disabled={!currentCustom}
              onClick={removeRemove}
            >
              <ToolbarGlyph kind="remove" />
            </button>
            <span />
            <button
              type="button"
              title={t("Move Up")}
              aria-label={t("Move Up")}
              disabled={!currentCustom || exporters[0]?.id === currentCustom.id}
              onClick={() => moveAction(-1)}
            >
              <ToolbarGlyph kind="up" />
            </button>
            <button
              type="button"
              title={t("Move Down")}
              aria-label={t("Move Down")}
              disabled={
                !currentCustom ||
                exporters[exporters.length - 1]?.id === currentCustom.id
              }
              onClick={() => moveAction(1)}
            >
              <ToolbarGlyph kind="down" />
            </button>
            <button
              type="button"
              title={t("Rename")}
              aria-label={t("Rename")}
              disabled={!currentCustom}
              onClick={() => {
                const nameBox = document.getElementById(nameBoxid);
                nameBox?.focus();
                if (nameBox instanceof HTMLInputElement) nameBox.select();
              }}
            >
              <ToolbarGlyph kind="edit" />
            </button>
          </div>
        </aside>

        <section className="export-settings-body" role="tabpanel">
          {selected === "general" && (
            <>
              <SettingsGroup title={t("Default export folder")}>
                <SettingRow>
                  <div className="stg-inline">
                    <TextInput
                      value={e.default_folder}
                      width="lg"
                      placeholder={t("Automatic (the current document's folder)")}
                      onChange={(default_folder) => write({ default_folder })}
                    />
                    <ActionButton
                      onClick={() => {
                        void chooseDirectory({
                          title: t("Default export folder"),
                          defaultPath: e.default_folder || undefined,
                        }).then((path) => {
                          if (path) write({ default_folder: path });
                        });
                      }}
                    >
                      {t("Choose…")}
                    </ActionButton>
                  </div>
                </SettingRow>
              </SettingsGroup>

              <SettingsGroup title={t("After exporting")}>
                <SettingRow label={t("Open the folder the exported file goes into")}>
                  <Toggle
                    checked={e.open_after_export}
                    onChange={(open_after_export) => write({ open_after_export })}
                  />
                </SettingRow>
              </SettingsGroup>

              <SettingsGroup title={t("Pandoc")}>
                <SettingRow
                  label={t("Pandoc executable")}
                  help={t("Detected each time an export starts; no executable path is stored.")}
                >
                  <TextInput value={t("Automatic")} width="lg" disabled onChange={() => {}} />
                </SettingRow>
                <SettingRow
                  label={t("Pandoc extra arguments")}
                  help={t(
                    "Shared by built-in Pandoc exports. Arguments entered in a custom exporter are appended after these.",
                  )}
                >
                  <TextInput
                    value={e.pandoc_args}
                    width="lg"
                    placeholder="--reference-doc=reference.docx"
                    onChange={(pandoc_args) => write({ pandoc_args })}
                  />
                </SettingRow>
              </SettingsGroup>
            </>
          )}

          {selected === "pdf" && (
            <>
              <SettingsGroup title="PDF">
                <SettingRow
                  label={t("Pandoc extra arguments")}
                  help={t(
                    "Used only when PDF is rendered through Pandoc. The built-in PDF fallback uses the print dialog.",
                  )}
                >
                  <TextInput
                    value={e.pandoc_args}
                    width="lg"
                    onChange={(pandoc_args) => write({ pandoc_args })}
                  />
                </SettingRow>
                <SettingRow label={t("Open the folder the exported file goes into")}>
                  <Toggle
                    checked={e.open_after_export}
                    onChange={(open_after_export) => write({ open_after_export })}
                  />
                </SettingRow>
              </SettingsGroup>
              <Note>{t("Printing and PDF export require a light document theme.")}</Note>
            </>
          )}

          {(selected === "html" || selected === "html-plain") && (
            <SettingsGroup title={selected === "html" ? t("HTML (with Styles)") : t("HTML (without Styles)")}>
              <SettingRow label={t("Open the folder the exported file goes into")}>
                <Toggle
                  checked={e.open_after_export}
                  onChange={(open_after_export) => write({ open_after_export })}
                />
              </SettingRow>
              <SettingRow
                label={t("Document theme")}
                help={
                  selected === "html"
                    ? t("The active document theme is embedded in styled HTML.")
                    : t("This format intentionally omits document and application styles.")
                }
              >
                <span />
              </SettingRow>
            </SettingsGroup>
          )}

          {selected === "image" && (
            <SettingsGroup title={t("Image")}>
              <SettingRow label={t("Open the folder the exported file goes into")}>
                <Toggle
                  checked={e.open_after_export}
                  onChange={(open_after_export) => write({ open_after_export })}
                />
              </SettingRow>
              <Note>{t("The image exporter uses the same styled document pipeline as HTML.")}</Note>
            </SettingsGroup>
          )}

          {currentCustom && (
            <SettingsGroup title={t("Exporter")}>
              <SettingRow label={t("Name")}>
                <TextInput
                  id={nameBoxid}
                  value={currentCustom.name}
                  width="lg"
                  onChange={(name) => changeCustom(currentCustom.id, { name })}
                />
              </SettingRow>
              <SettingRow
                label={t("Parameters")}
                help={t("The built-in command for this template. It is shown for reference.")}
              >
                <TextInput
                  value={`--from=markdown --to=${currentCustom.format} --standalone`}
                  width="lg"
                  disabled
                  onChange={() => {}}
                />
              </SettingRow>
              <SettingRow
                label={t("Custom arguments")}
                help={t("Separate arguments with spaces and quote values that contain spaces.")}
              >
                <TextInput
                  value={currentCustom.args}
                  width="lg"
                  onChange={(args) => changeCustom(currentCustom.id, { args })}
                />
              </SettingRow>
              {["docx", "odt", "epub", "latex"].includes(currentCustom.format) && (
                <SettingRow label={t("Style file")}>
                  <div className="stg-inline">
                    <TextInput
                      value={currentCustom.style_file}
                      width="lg"
                      onChange={(style_file) => changeCustom(currentCustom.id, { style_file })}
                    />
                    <ActionButton
                      onClick={() => {
                        void pickFile({
                          title: t("Choose a style file"),
                          mode: "open",
                          defaultPath: currentCustom.style_file || undefined,
                          filters: [styleStyleTextItemFilterSelect(currentCustom.format)],
                        }).then((path) => {
                          if (path) changeCustom(currentCustom.id, { style_file: path });
                        });
                      }}
                    >
                      {t("Choose…")}
                    </ActionButton>
                  </div>
                </SettingRow>
              )}
              <SettingRow label={t("Open the folder the exported file goes into")}>
                <Toggle
                  checked={currentCustom.open_after_export}
                  onChange={(open_after_export) =>
                    changeCustom(currentCustom.id, { open_after_export })
                  }
                />
              </SettingRow>
            </SettingsGroup>
          )}
        </section>
      </div>

      {addAddOpen && (
        <div className="export-template-backdrop" role="presentation">
          <div
            ref={addAddBox}
            className="export-template-dialog"
            role="dialog"
            aria-modal="true"
            data-modal-layer="true"
            aria-labelledby="export-template-title"
          >
            <div className="export-template-head">
              <h3 id="export-template-title">{t("Add from Template")}</h3>
              <button
                type="button"
                className="export-template-close"
                title={t("Close")}
                aria-label={t("Close")}
                onClick={() => setAddAddOpen(false)}
              >
                <Icon name="folio-close-symbolic" size={14} />
              </button>
            </div>
            <select
              ref={modelBoardBox}
              value={modelBoard}
              aria-label={t("Template")}
              onChange={(event) => setModelBoard(event.target.value)}
            >
              {addableTemplates.map((item) => (
                <option key={item.format} value={item.format}>
                  {item.name}
                </option>
              ))}
            </select>
            <div className="export-template-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={addAdd}
              >
                {t("Add")}
              </button>
              <button type="button" className="btn" onClick={() => setAddAddOpen(false)}>
                {t("Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
