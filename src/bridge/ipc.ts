
















import { invoke } from "@tauri-apps/api/core";

import type {
  AppLang, Diagnostics, DiffLine, DocId, DocThemeInfo, Document, DraftInfo, FocusState, ImagePlaced,
  ImageSourceArg, ImageUploadSettings, ImageUploadSnapshot, ImageUploaded,
  NativeMenuNode, PandocExport, PandocImport, PandocProbe, PluginInfo, PluginMenuItem,
  PluginPanel, PluginReview, Settings, ThemeImportReport, TreeNode, TreeOptions, UiStyleInfo, WorkspaceExcerpt,
  trustRecord, exportReport,
  PickerEntry, PickerPlace, PluginUpdateInfo, PluginUpdateResult, UpdateInstallResult, UpdateStatus,
  MeetingSpeech, PathKindClass, CombineWriteWordDictionary, PrintBackend, PrintEnvironment, PrintPreview,
  WindowRegistrySnapshot, WindowTransferRequest,
  DistributionOnboarding,
  DistributionLegal,
  DistributionBranding,
} from "./types";
import type {
  SettingsImportReport,
  SettingsImportRequest,
  SettingsExportInventory,
  SettingsExportReport,
  SettingsExportRequest,
  SettingsPackageInventory,
} from "./types-settings-export";





import type { SelectionSnapshot } from "@/editor/caret-snapshot";

export * from "./types";
export { events, on } from "./ipc-events";


export const api = {
  picker: {
    places: () => invoke<PickerPlace[]>("nota_picker_places"),
    list: (path: string, showHidden: boolean) =>
      invoke<PickerEntry[]>("nota_picker_list", { path, showHidden }),
    createDir: (parent: string, name: string) =>
      invoke<string>("nota_picker_create_dir", { parent, name }),

    native: (request: {
      mode: "open" | "save" | "directory";
      title?: string;
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
      multiple?: boolean;
    }) => invoke<string[] | null>("nota_dialog_native", { request }),
    textFile: (request: {
      title?: string;
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }) =>
      invoke<{ name: string; text: string } | null>("nota_dialog_text_file", {
        request: { ...request, mode: "open", multiple: false },
      }),
  },







  diagnostics: {

    collect: () => invoke<Diagnostics>("nota_diagnostics"),
  },


  debugLog: {
    read: (offset: number) =>
      invoke<{ text: string; offset: number; reset: boolean }>("nota_debug_log_read", {
        offset,
      }),
    write: (scope: string, message: string) =>
      invoke<void>("nota_debug_log_write", { scope, message }),
  },





  update: {
    check: () => invoke<UpdateStatus>("nota_update_check"),
    install: () => invoke<UpdateInstallResult>("nota_update_install"),
    cancel: () => invoke<void>("nota_update_cancel"),
  },

  doc: {
    create: () => invoke<DocId>("nota_doc_new"),

    createWithText: (text: string, titleHint: string | null = null) =>
      invoke<DocId>("nota_doc_new_with_text", { text, titleHint }),
    open: (path: string) => invoke<DocId>("nota_doc_open", { path }),

    sync: (id: DocId, text: string) => invoke<number>("nota_doc_sync", { id, text }),




    settle: (id: DocId, text: string) => invoke<number>("nota_doc_settle", { id, text }),










    cursor: (id: DocId, snapshot: SelectionSnapshot) =>
      invoke<void>("nota_doc_cursor", { id, text: snapshot.text, empty: snapshot.empty }),
    save: (id: DocId, path?: string) =>
      invoke<string>("nota_doc_save", { id, path: path ?? null }),












    rename: (id: DocId, name: string) =>
      invoke<string>("nota_doc_rename", { id, name }),
    move: (id: DocId, dir: string) => invoke<string>("nota_doc_move", { id, dir }),
    close: (id: DocId) => invoke<void>("nota_doc_close", { id }),

    delete: (id: DocId) => invoke<void>("nota_doc_delete", { id }),
    setActive: (id: DocId) => invoke<void>("nota_doc_set_active", { id }),
    get: (id: DocId) => invoke<Document>("nota_doc_get", { id }),
    list: () => invoke<Document[]>("nota_doc_list"),
    reload: (id: DocId) => invoke<Document>("nota_doc_reload", { id }),






    diskText: (id: DocId) => invoke<string>("nota_doc_disk_text", { id }),
    hasUnsaved: () => invoke<boolean>("nota_doc_has_unsaved"),
  },

  /** Recovery copies written outside the source document. */
  draft: {
    save: (id: DocId, text: string) => invoke<boolean>("nota_draft_save", { id, text }),
    list: () => invoke<DraftInfo[]>("nota_draft_list"),
    restore: (id: string) => invoke<DocId>("nota_draft_restore", { id }),
    discard: (id: string) => invoke<void>("nota_draft_discard", { id }),
    discardDocument: (id: DocId) =>
      invoke<void>("nota_draft_discard_document", { id }),
  },











  webview: {

    spellcheckGet: () =>
      invoke<{ on: boolean; languages: string[] }>("nota_webview_spellcheck_get"),

    spellcheckSet: (on: boolean) => invoke<boolean>("nota_webview_spellcheck_set", { on }),







    spellcheckLanguagesSet: (languages: string[]) =>
      invoke<string[]>("nota_webview_spellcheck_languages_set", { languages }),






    scrollHard: () => invoke<void>("nota_webview_scroll_hard"),
    /**
     * Point WebKitGTK's input context at Nota's real viewport caret. Without
     * this, fcitx candidates can stay at a stale document coordinate after
     * the editor scrolls.
     */
    imeCursor: (rect: { x: number; y: number; width: number; height: number }) =>
      invoke<void>("nota_webview_notify_ime_cursor", rect),
  },












  spell: {

    check: (lang: string, words: string[]) =>
      invoke<number[]>("nota_spell_check", { lang, words }),

    suggest: (lang: string, word: string) =>
      invoke<string[]>("nota_spell_suggest", { lang, word }),







    dictionaries: () => invoke<CombineWriteWordDictionary[]>("nota_spell_dictionaries"),

    dictDir: () => invoke<string>("nota_spell_dict_dir"),







    dictReveal: () => invoke<string>("nota_spell_dict_reveal"),







    dictImport: (path: string) => invoke<string>("nota_spell_dict_import", { path }),

    wordAdd: (word: string) => invoke<string>("nota_spell_word_add", { word }),






    wordIgnore: (word: string) => invoke<string>("nota_spell_word_ignore", { word }),
  },
  pathKind: (paths: string[]) =>
    invoke<PathKindClass[]>("nota_paths_kind", { paths }),
  workspace: {
    open: (path: string) => invoke<string>("nota_workspace_open", { path }),
    close: () => invoke<void>("nota_workspace_close"),
    get: () => invoke<string | null>("nota_workspace_get"),
    deletePath: (path: string) => invoke<void>("nota_workspace_delete_path", { path }),







    tree: (subPath?: string, depth?: number, opts?: TreeOptions) =>
      invoke<TreeNode[]>("nota_workspace_tree", {
        subPath: subPath ?? null,
        depth: depth ?? 1,
        opts: opts ?? null,
      }),

    excerpts: (paths: string[]) =>
      invoke<WorkspaceExcerpt[]>("nota_workspace_excerpts", { paths }),
  },








  appLang: () => invoke<AppLang>("nota_app_lang"),

  distribution: {
    onboarding: () => invoke<DistributionOnboarding>("nota_distribution_onboarding"),
    legal: () => invoke<DistributionLegal>("nota_distribution_legal"),
    branding: () => invoke<DistributionBranding>("nota_distribution_branding"),
  },

  settings: {
    get: () => invoke<Settings>("nota_settings_get"),
    set: (settings: Settings) => invoke<void>("nota_settings_set", { settings }),
    exportInventory: () =>
      invoke<SettingsExportInventory>("nota_settings_export_inventory"),
    exportPackage: (request: SettingsExportRequest) =>
      invoke<SettingsExportReport>("nota_settings_export", { request }),
    importInspect: (packagePath: string) =>
      invoke<SettingsPackageInventory>("nota_settings_import_inspect", {
        package: packagePath,
      }),
    importPackage: (request: SettingsImportRequest) =>
      invoke<SettingsImportReport>("nota_settings_import", { request }),










    openDir: () => invoke<string>("nota_settings_open_dir"),








    problem: () => invoke<string | null>("nota_settings_problem"),






    reset: () => invoke<Settings>("nota_settings_reset"),
  },

  devBridge: {
    status: () => invoke<import("./types").DevBridgeStatus>("nota_dev_bridge_status"),
    enable: (
      password: string | null,
      port: number,
      whitelist: string[],
    ) =>
      invoke<import("./types").DevBridgeStatus>("nota_dev_bridge_enable", {
        password,
        port,
        whitelist,
        enabled: true,
      }),
    disable: () =>
      invoke<import("./types").DevBridgeStatus>("nota_dev_bridge_disable"),
    revoke: () =>
      invoke<import("./types").DevBridgeStatus>("nota_dev_bridge_revoke"),
    execute: (command: string, args: Record<string, unknown>) =>
      invoke<unknown>(command, args),
    respond: (
      requestId: string,
      result: unknown = null,
      error: string | null = null,
    ) =>
      invoke<boolean>("nota_dev_bridge_respond", {
        requestId,
        result,
        error,
      }),
  },







  nativeMenu: {
    apply: (nodes: NativeMenuNode[]) => invoke<boolean>("nota_native_menu_apply", { nodes }),
  },









  export: {

    write: (path: string, content: string) =>
      invoke<string>("nota_export_write", { path, content }),








    writeBytes: (path: string, base64: string) =>
      invoke<string>("nota_export_write_bytes", { path, base64 }),

    print: (docPath: string | null, title: string, content: string) =>
      invoke<string>("nota_export_print", { docPath, title, content }),






    reveal: (path: string) => invoke<string>("nota_export_reveal", { path }),
  },


  print: {

    supported: () => invoke<boolean>("nota_print_supported"),

    backend: () => invoke<PrintBackend>("nota_print_backend"),

    printers: () => invoke<PrintEnvironment>("nota_print_printers"),

    prepare: (req: {
      html: string;
      baseDir: string | null;
      paper: string;
      landscape: boolean;
      marginMm: number;
    }) =>
      invoke<PrintPreview>("nota_print_prepare", req),

    system: (req: {
      html: string;
      baseDir: string | null;
      paper: string;
      landscape: boolean;
      marginMm: number;
    }) => invoke<void>("nota_print_system", req),

    send: (req: {
      pdf: string;
      printer: string;
      copies: number;
      ranges: string | null;
    }) => invoke<string>("nota_print_send", req),

    savePdf: (pdf: string, target: string) =>
      invoke<string>("nota_print_save_pdf", { pdf, target }),
  },














  image: {
    place: (docId: DocId | null, source: ImageSourceArg) =>
      invoke<ImagePlaced>("nota_image_place", { docId, source }),

    dataUrl: (path: string) => invoke<string>("nota_image_data_url", { path }),
    copyFile: (source: string, target: string) =>
      invoke<string>("nota_image_file_copy", { source, target }),
    moveFile: (source: string, target: string) =>
      invoke<string>("nota_image_file_move", { source, target }),
    deleteFile: (source: string) =>
      invoke<void>("nota_image_file_delete", { source }),












    uploadGet: (docId: DocId | null) =>
      invoke<ImageUploadSnapshot>("nota_image_upload_get", { docId }),
    uploadSet: (settings: ImageUploadSettings) =>
      invoke<void>("nota_image_upload_set", { settings }),
    uploadOne: (docId: DocId | null, source: ImageSourceArg) =>
      invoke<ImageUploaded>("nota_image_upload_one", { docId, source }),
  },








  pandoc: {



    probe: () => invoke<PandocProbe>("nota_pandoc_probe"),
















    export: (args: {
      format: string;
      markdown: string;
      target: string;
      docPath: string | null;
      html: string | null;
      themeCss: string;
      pandocArgs: string;
    }) =>
      invoke<PandocExport>("nota_pandoc_export", {
        format: args.format,
        markdown: args.markdown,
        target: args.target,
        docPath: args.docPath,
        html: args.html,
        themeCss: args.themeCss,
        pandocArgs: args.pandocArgs,
      }),






    importFile: (format: string, source: string) =>
      invoke<PandocImport>("nota_pandoc_import", { format, source }),
  },












  diff: {








    texts: (before: string, after: string, context?: number) =>
      invoke<DiffLine[]>("nota_diff_texts", { before, after, context: context ?? null }),
  },











  session: {

    get: () => invoke<MeetingSpeech>("nota_session_get"),






    setOpen: (open: string[], active: string | null) =>
      invoke<void>("nota_session_set_open", { open, active }),

    setScroll: (path: string, ratio: number) =>
      invoke<void>("nota_session_set_scroll", { path, ratio }),

    forgetRecent: (path: string) => invoke<void>("nota_session_forget_recent", { path }),

    clear: () => invoke<void>("nota_session_clear"),

    file: () => invoke<string | null>("nota_session_file"),
  },









  watch: {
    sync: (docs: Array<{ id: DocId; path: string }>) =>
      invoke<void>("nota_watch_sync", { docs }),
  },




  theme: {

    list: () => invoke<DocThemeInfo[]>("nota_doc_themes"),







    css: (id: string) => invoke<string>("nota_doc_theme_css", { id }),






    openDir: () => invoke<string>("nota_doc_themes_open_dir"),
    /** Import a ZIP, Typora theme directory, or Typora CSS file. */
    importPath: (path: string) =>
      invoke<ThemeImportReport>("nota_theme_import", { path }),
    /** Backward-compatible alias for callers that only offer ZIP import. */
    importZip: (path: string) =>
      invoke<ThemeImportReport>("nota_theme_import", { path }),
  },








  uiStyle: {




    list: () => invoke<UiStyleInfo[]>("nota_ui_styles"),







    css: (id: string) => invoke<string>("nota_ui_style_css", { id }),

    openDir: () => invoke<string>("nota_ui_styles_open_dir"),
  },

  plugin: {
    list: () => invoke<PluginInfo[]>("nota_plugins_list"),










    setEnabled: (id: string, enabled: boolean) =>
      invoke<void>("nota_plugin_set_enabled", { id, enabled }),












    install: (path: string) => invoke<string>("nota_plugin_install", { path }),









    uninstall: (id: string) => invoke<void>("nota_plugin_uninstall", { id }),












    export: (id: string, path: string) =>
      invoke<exportReport>("nota_plugin_export", { id, path }),








    exportName: (id: string) => invoke<string>("nota_plugin_export_name", { id }),





    openDir: () => invoke<string>("nota_plugins_open_dir"),


    trust: (id: string) => invoke<void>("nota_plugin_trust", { id }),





















    setSetting: (plugin: string, key: string, value: string | number | boolean) =>
      invoke<void>("nota_plugin_setting_set", { plugin, key, value }),


    trustList: () => invoke<trustRecord[]>("nota_plugin_trust_list"),






    updates: () => invoke<PluginUpdateInfo[]>("nota_plugin_updates"),





    update: (id: string) => invoke<PluginUpdateResult>("nota_plugin_update", { id }),





    call: (plugin: string, command: string, args?: unknown) =>
      invoke<unknown>("nota_plugin_call", { plugin, command, args: args ?? null }),
    findCommand: (command: string) =>
      invoke<string | null>("nota_plugin_find_command", { command }),














    panels: () => invoke<PluginPanel[]>("nota_plugin_panels"),














    panelContent: (plugin: string, id: string) =>
      invoke<unknown[]>("nota_plugin_panel_content", { plugin, id }),









    review: () => invoke<PluginReview | null>("nota_plugin_review"),

    /** Open one registered extension panel in the editor-wide review area. */
    reviewOpen: (plugin: string, id: string) =>
      invoke<void>("nota_plugin_review_open", { plugin, id }),











    reviewClose: (plugin: string) => invoke<void>("nota_plugin_review_close", { plugin }),


    menus: () => invoke<PluginMenuItem[]>("nota_plugin_menus"),
  },

  frontendReady: () => invoke<void>("nota_frontend_ready"),












  startupFile: () => invoke<string | null>("nota_startup_file"),









  focus: {

    get: () => invoke<FocusState>("nota_focus_get"),

    start: () => invoke<FocusState>("nota_focus_start"),

    stop: () => invoke<FocusState>("nota_focus_stop"),






    ack: () => invoke<FocusState>("nota_focus_ack"),






    beep: () => invoke<void>("nota_focus_beep"),

    closeAlarm: () => invoke<void>("nota_focus_close_alarm"),
  },










  window: {

    showMain: () => invoke<void>("nota_window_show_main"),

    openDevtools: () => invoke<void>("nota_window_open_devtools"),

    openDebugLog: () => invoke<void>("nota_window_open_debug_log"),











    openNew: (path?: string) => invoke<void>("nota_window_open_new", { path: path ?? null }),
    registrySnapshot: () => invoke<WindowRegistrySnapshot>("nota_window_registry_snapshot"),
    pickerMode: (enabled: boolean) => invoke<void>("nota_window_picker_mode", { enabled }),
    takeTransfer: () => invoke<WindowTransferRequest | null>("nota_window_take_transfer"),
    transfer: (request: {
      targetId: number;
      path?: string | null;
      text?: string | null;
      titleHint?: string | null;
      focusTarget: boolean;
    }) =>
      invoke<void>("nota_window_transfer", {
        targetId: request.targetId,
        path: request.path ?? null,
        text: request.text ?? null,
        titleHint: request.titleHint ?? null,
        focusTarget: request.focusTarget,
      }),
    ackTransfer: (requestId: string, ok: boolean, error: string | null, focus: boolean) =>
      invoke<void>("nota_window_ack_transfer", { requestId, ok, error, focus }),
    /** Open Preferences in a dedicated native WebView window. */
    openSettings: () => invoke<void>("nota_window_open_settings"),
    prepareSettings: () => invoke<void>("nota_window_prepare_settings"),
    hideSettings: () => invoke<void>("nota_window_hide_settings"),
    openAbout: () => invoke<void>("nota_window_open_about"),
    prepareAbout: () => invoke<void>("nota_window_prepare_about"),
    hideAbout: () => invoke<void>("nota_window_hide_about"),









    quit: () => invoke<void>("nota_quit"),
  },
};
