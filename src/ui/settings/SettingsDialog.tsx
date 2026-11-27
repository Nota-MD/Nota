
























































import { useEffect, useRef, useState } from "react";

import type {
  DocThemeInfo,
  PluginInfo,
  PluginUpdateInfo,
  Settings,
  UiStyleInfo,
  trustRecord,
} from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { MenuSpec } from "@/ui/commands";
import { DialogClose } from "@/ui/DialogClose";
import { Icon, type iconName } from "@/ui/Icon";
import { useModalTrap } from "@/ui/useModalTrap";
import type { pluginAction } from "@/ui/usePlugins";
import { QueryProvider, SearchField } from "./primitives";
import { AppearancePane } from "./panes/AppearancePane";
import { DebugPane } from "./panes/DebugPane";
import { DocThemePane } from "./panes/DocThemePane";
import { EditorPane } from "./panes/EditorPane";
import { ExportPane } from "./panes/ExportPane";
import { ExtensionsPane } from "./panes/ExtensionsPane";
import { FilesPane } from "./panes/FilesPane";
import { FocusPane } from "./panes/FocusPane";
import { GeneralPane } from "./panes/GeneralPane";
import { ImagePane } from "./panes/ImagePane";
import { MarkdownPane } from "./panes/MarkdownPane";
import { PluginSettingsPane } from "./panes/PluginSettingsPane";
import { ShortcutsPane } from "./panes/ShortcutsPane";
import type { PaneProps } from "./panes/props";

export type SectionId =
  | "files"
  | "editor"
  | "image"
  | "markdown"
  | "export"
  | "appearance"
  | "docTheme"
  | "shortcuts"
  | "focus"
  | "pluginSettings"
  | "extensions"
  | "general"
  | "debug";
















const SECTIONS: Record<SectionId, iconName> = {




  files: "nota-document-open-symbolic",
  editor: "nota-edit-symbolic",
  image: "nota-insert-image-symbolic",


  markdown: "nota-markdown-symbolic",
  export: "nota-document-export-symbolic",

  appearance: "nota-window-symbolic",




  extensions: "nota-plugin-symbolic",


  docTheme: "nota-doc-theme-symbolic",
  shortcuts: "nota-keys-symbolic",


  focus: "nota-force-focus-symbolic",
  pluginSettings: "nota-configure-symbolic",
  general: "nota-configure-symbolic",
  debug: "nota-advanced-symbolic",
};








const ORDER: SectionId[] = [
  "files",
  "editor",
  "image",
  "markdown",
  "export",
  "appearance",
  "docTheme",
  "shortcuts",
  "focus",
  "pluginSettings",
  "extensions",
  "general",
];

interface Props {
  settings: Settings;

  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;

  docThemes: DocThemeInfo[];
  onOpenThemesDir: () => void;
  /** Rescan document themes after files are copied into the theme directory. */
  onRefreshThemes: () => void;

  uiStyles: UiStyleInfo[];

  onOpenStylesDir: () => void;

  onRefreshUiStyles: () => void;
  onImportTheme: () => void;
  onImportTyporaTheme: () => void;

  onOpenConfigDir: () => void;

  onResetSettings: () => void;







  onClearRecent: () => void;
  /** Restore recovery copies from the application data directory. */
  onRestoreDrafts: () => void;




  menus: readonly MenuSpec[];









  plugins: PluginInfo[];

  pluginTrust: trustRecord[];

  pluginUpdate: PluginUpdateInfo[];

  pluginAction: pluginAction;

  debugMode: boolean;

  initialSection?: SectionId | null;
  /** Render as the complete surface of a dedicated native Preferences window. */
  standalone?: boolean;
}

export function SettingsDialog({
  settings,
  onChange,
  onClose,
  docThemes,
  onOpenThemesDir,
  onRefreshThemes,
  uiStyles,
  onOpenStylesDir,
  onRefreshUiStyles,
  onImportTheme,
  onImportTyporaTheme,
  onOpenConfigDir,
  onResetSettings,
  onClearRecent,
  onRestoreDrafts,
  menus,
  plugins,
  pluginTrust,
  pluginUpdate,
  pluginAction,
  debugMode,
  initialSection,
  standalone = false,
}: Props) {


  const t = useT();










  const pageName: Record<SectionId, string> = {
    files: t("File"),
    editor: t("Editor"),
    image: t("Image"),

    markdown: "Markdown",
    export: t("Export"),
    appearance: t("Appearance"),
    docTheme: t("Document Themes"),
    shortcuts: t("Shortcuts"),



    focus: t("Force Focus"),
    pluginSettings: t("Extension Settings"),



    extensions: t("Extension Management"),
    general: t("General"),
    debug: t("Developer Mode"),
  };
  const extensionsEnabled = settings.general.extensions_enabled;
  const allOrder: SectionId[] = debugMode ? [...ORDER, "debug"] : ORDER;
  const visibleOrder = allOrder.filter(
    (id) => extensionsEnabled || (id !== "pluginSettings" && id !== "extensions"),
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const [openingWindowStyle] = useState(
    () => settings.appearance.settings_window_style,
  );













  const [section, setSection] = useState<SectionId>(initialSection ?? "appearance");
  useEffect(() => {
    if (initialSection) setSection(initialSection);
  }, [initialSection]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!debugMode && section === "debug") setSection("general");
  }, [debugMode, section]);
  useEffect(() => {
    if (!extensionsEnabled && (section === "pluginSettings" || section === "extensions")) {
      setSection("general");
    }
  }, [extensionsEnabled, section]);
  const currentSection = visibleOrder.includes(section) ? section : "general";



  const normalized = query.trim().toLowerCase();
  const searching = normalized.length > 0;

  useEffect(() => {
    panelRef.current?.focus();
  }, []);


  //





  useModalTrap(panelRef, { onEscape: onClose });


  const paneFor = (id: SectionId) => {
    const props: PaneProps = {
      settings,
      settingsPresentation:
        standalone ? "full" : openingWindowStyle === "full" ? "full" : "embedded",
      onChange,
      docThemes,
      onOpenThemesDir,
      onRefreshThemes,
      uiStyles,
      onOpenStylesDir,
      onRefreshUiStyles,
      onImportTheme,
      onImportTyporaTheme,
      onOpenConfigDir,
      onResetSettings,
      onClearRecent,
      onRestoreDrafts,
      menus,
    };
    switch (id) {
      case "files":
        return <FilesPane {...props} />;
      case "editor":
        return <EditorPane {...props} />;
      case "image":
        return <ImagePane {...props} />;
      case "markdown":
        return <MarkdownPane {...props} />;
      case "export":
        return <ExportPane {...props} />;
      case "docTheme":
        return <DocThemePane {...props} />;




      case "shortcuts":
        return <ShortcutsPane menus={menus} settings={settings} onChange={onChange} />;
      case "focus":
        return <FocusPane {...props} />;
      case "pluginSettings":
        return <PluginSettingsPane plugins={plugins} action={pluginAction} />;


      case "extensions":
        return (
          <ExtensionsPane
            plugins={plugins}
            messageTask={pluginTrust}
            updates={pluginUpdate}
            action={pluginAction}
          />
        );
      case "general":
        return <GeneralPane {...props} />;
      case "debug":
        return <DebugPane {...props} />;
      default:
        return <AppearancePane {...props} />;
    }
  };

  return (

    <div
      className={standalone ? "settings-standalone-root" : "confirm-backdrop"}
      data-settings-window-style={standalone ? "full" : openingWindowStyle}
      onMouseDown={standalone ? undefined : onClose}
    >
      <div
        ref={panelRef}
        className="settings-shell"
        data-settings-window-style={standalone ? "full" : openingWindowStyle}
        data-settings-standalone={standalone || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t("Settings")}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!standalone && <DialogClose onClose={onClose} />}
        <aside className="settings-nav">
          <div className="settings-nav-search">
            <SearchField value={query} onChange={setQuery} />
          </div>

          <nav className="settings-nav-list" aria-label={t("Settings sections")}>
            {visibleOrder.map((id) => (
              <button
                key={id}
                type="button"
                className="stg-nav-item"


                data-active={!searching && currentSection === id}
                onClick={() => {


                  setQuery("");
                  setSection(id);
                }}
              >
                {


                                                       }
                <Icon name={SECTIONS[id]} size={20} />
                {pageName[id]}
              </button>
            ))}
          </nav>

          <div className="settings-nav-foot">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t("Done")}
            </button>
          </div>
        </aside>

        <div className="settings-content">
          <QueryProvider value={normalized}>
            {searching
              ? visibleOrder.map((id) => <div key={id}>{paneFor(id)}</div>)
              : paneFor(currentSection)}
          </QueryProvider>
        </div>
      </div>
    </div>
  );
}
