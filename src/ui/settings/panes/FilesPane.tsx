











import type { DropAction, FileFilter, ImportAction, StartupAction, TreeSort } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { ActionButton, Select, SettingRow, SettingsGroup, TextInput, Toggle } from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function FilesPane({ settings, onChange, onClearRecent, onRestoreDrafts }: PaneProps) {


  const t = useT();







  const AUTOSAVE: Array<{ value: string; label: string }> = [
    { value: "0", label: t("Close") },
    { value: "30", label: t("30 seconds") },
    { value: "60", label: t("1 minute") },
    { value: "300", label: t("5 minutes") },
  ];







  const STARTUP: Array<{ value: StartupAction; label: string }> = [
    { value: "new-file", label: t("Open a blank document") },
    { value: "last-file", label: t("Restore the last open files") },
    { value: "last-session", label: t("Restore the last files and folder") },
  ];

  const DROP: Array<{ value: DropAction; label: string }> = [
    { value: "open-in-app", label: t("Open in this window") },
    { value: "open-in-file-manager", label: t("Open in the file manager") },
    { value: "ignore", label: t("Do nothing") },
  ];





  const IMPORT: Array<{ value: ImportAction; label: string }> = [
    { value: "import-file", label: t("Open as a text file") },
    { value: "open-in-file-manager", label: t("Open in the file manager") },
    { value: "ignore", label: t("Do nothing") },
  ];

  const FILTER: Array<{ value: FileFilter; label: string }> = [
    { value: "supported", label: t("Show only Markdown and plain text") },
    { value: "all", label: t("Show all") },
  ];





  const SORT: Array<{ value: TreeSort; label: string }> = [
    { value: "name", label: t("Name (A to Z)") },
    { value: "modified", label: t("Recently modified first") },
    { value: "created", label: t("Recently created first") },
  ];

  const write = paneWriter(settings, onChange, "files");
  const f = settings.files;

  return (
    <>
      <SettingsGroup title={t("Startup")}>
        <SettingRow>
          <Select value={f.startup} options={STARTUP} onChange={(startup) => write({ startup })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Outline")}>
        <SettingRow label={t("Allow collapsing and expanding")}>
          <Toggle
            checked={f.outline_collapsible}
            onChange={(outline_collapsible) => write({ outline_collapsible })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Saving & Recovery")}>
        <SettingRow label={t("Auto Save")}>
          <Select
            value={String(settings.autosave_seconds)}
            options={AUTOSAVE}
            onChange={(v) => onChange({ autosave_seconds: Number(v) })}
          />
        </SettingRow>

        <SettingRow label={t("Auto Save when switching files")}>
          <Toggle
            checked={f.autosave_on_switch}
            onChange={(autosave_on_switch) => write({ autosave_on_switch })}
          />
        </SettingRow>

        <SettingRow label={t("Restore unsaved drafts")}>
          <ActionButton
            onClick={onRestoreDrafts}
            title={t("Open recovery copies kept by Nota. Source files are not changed until you save.")}
          >
            {t("Restore drafts")}
          </ActionButton>
        </SettingRow>

        <SettingRow label={t("Clear recent files history")}>
          {

                                                           }
          <ActionButton onClick={onClearRecent}>{t("Clear records")}</ActionButton>
        </SettingRow>

        {






                                    }
      </SettingsGroup>

      <SettingsGroup title={t("File tree / library")}>
        <SettingRow label={t("Show hidden files")}>
          <Toggle checked={f.show_hidden} onChange={(show_hidden) => write({ show_hidden })} />
        </SettingRow>

        <SettingRow label={t("Which files to show")}>
          <Select value={f.tree_filter} options={FILTER} onChange={(tree_filter) => write({ tree_filter })} />
        </SettingRow>

        {


                                   }
        <SettingRow label={t("Sort order")}>
          <Select value={f.tree_sort} options={SORT} onChange={(tree_sort) => write({ tree_sort })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Drag and Drop")}>
        <SettingRow label={t("When a folder is dropped")}>
          <Select
            value={f.drop_folder}
            options={DROP}
            onChange={(drop_folder) => write({ drop_folder })}
          />
        </SettingRow>

        <SettingRow label={t("When a Markdown file is dropped")}>
          <Select
            value={f.drop_markdown}
            options={DROP}
            onChange={(drop_markdown) => write({ drop_markdown })}
          />
        </SettingRow>

        <SettingRow label={t("When an importable file is dropped")}>
          <Select
            value={f.drop_importable}
            options={IMPORT}
            onChange={(drop_importable) => write({ drop_importable })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Default extension")}>
        <SettingRow>
          <TextInput
            value={f.default_extension}
            width="sm"
            placeholder="md"
            onChange={(default_extension) => write({ default_extension })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Remember recent files and folders")}>
        <SettingRow>
          <Toggle
            checked={f.remember_recent}
            onChange={(remember_recent) => write({ remember_recent })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Ask me before closing")}>
        <SettingRow>
          <Toggle
            checked={settings.confirm_unsaved}
            onChange={(confirm_unsaved) => onChange({ confirm_unsaved })}
          />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
