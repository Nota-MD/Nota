












import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  type DocId,
  type Document,
  type Settings,
  type TreeNode,
} from "@/bridge/ipc";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import { useFileKind } from "@/ui/useFileKindMode";



import type { EditorPaneHandle } from "@/ui/EditorPane";
import { findMenuAccel, resolvePick } from "@/ui/commands";
import { localizedDocumentTitle, useT } from "@/i18n";
import { DeferredFilePickerDialog, DeferredPluginDock, DeferredSettingsDialog } from "@/ui/DeferredUi";
import { Sidebar, type SidebarTab } from "@/ui/Sidebar";
import { optionKey, readMouthPath } from "@/ui/tree-options";
import { StatusBar } from "@/ui/StatusBar";
import { useStatusBar } from "@/ui/useStatusBar";
import { Toasts } from "@/ui/Toasts";
import { useToasts } from "@/ui/useToasts";
import { TabBar } from "@/ui/TabBar";
import { reorderTabs } from "@/ui/tab-order";
import { TopBar } from "@/ui/TopBar";
import { useDialogs } from "@/ui/useDialogs";
import { useDocumentCheck } from "@/ui/useDocumentCheck";
import { useEditorCommands } from "@/ui/useEditorCommands";
import { AppDialogs } from "@/ui/AppDialogs";
import { useFileDrop } from "@/ui/useFileDrop";
import { useSpellcheck } from "@/ui/useSpellcheck";
import { useImageInsert } from "@/ui/useImageInsert";
import { useDocuments } from "@/ui/useDocuments";
import { useExternalChanges } from "@/ui/useExternalChanges";
import { useClipboard } from "@/ui/useClipboard";
import { useFindBar } from "@/ui/useFindBar";
import { useFocusSession } from "@/ui/useFocusSession";
import { effectiveMenuRenderer, useMenus } from "@/ui/useMenus";
import type { CommandState } from "@/editor/command-state";
import { useDocTheme, useDocThemeSlot } from "@/ui/useDocTheme";
import { useUiStyles } from "@/ui/useUiStyles";
import { useSettingsFile } from "@/ui/useSettingsFile";
import { useLiveSelection } from "@/ui/useLiveSelection";
import { useChromeVisibility } from "@/ui/useChromeVisibility";
import { useImmersive } from "@/ui/useImmersive";
import { useWindowControls } from "@/ui/useWindowControls";
import { EditorArea } from "@/ui/EditorArea";
import { useAppWindowRegistry } from "@/ui/useAppWindowRegistry";
import { WindowIdOverlay } from "@/ui/WindowIdOverlay";
import { useExportFeature } from "@/ui/useExportFeature";
import { useCommandTable } from "@/ui/useCommandTable";
import { usePlugins } from "@/ui/usePlugins";
import { useAppearance } from "@/ui/useAppearance";
import { useCodeBlockPrefs } from "@/ui/useCodeBlockPrefs";
import { useFocusDim } from "@/ui/useFocusDim";
import { useStartup } from "@/ui/useStartup";
import { useDocThemeInventory } from "@/ui/useDocThemeInventory";
import { useAppEvents, useDevBridgePreview } from "@/ui/useAppEvents";
import { useSession } from "@/ui/useSession";
import { useReviewView } from "@/ui/useReviewView";
import { useSelectableUiText } from "@/ui/useSelectableUiText";
import { useImeCursorBridge } from "@/ui/useImeCursorBridge";
import { ElementInspector } from "@/ui/element-inspector";
import { useMenuTable } from "@/ui/useMenuTable";
import { ContextMenu } from "@/ui/ContextMenu";
import { StandaloneAboutWindow, aboutOnly, settingsOnly, useUtilityWindows } from "@/ui/useUtilityWindows";
import { useSettingsWindow } from "@/ui/useSettingsWindow";
import { useMenuFeatures } from "@/ui/useMenuFeatures";
import { defaultExporter } from "@/ui/export-templates";
export default function App() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [activeId, setActiveId] = useState<DocId | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const extensionsEnabled = settings?.general.extensions_enabled ?? true;
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);









  const [dockOpen, setDockOpen] = useState(false);






  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("tree");











  const [typewriter, setTypewriter] = useState(false);







  const [commandState, setCommandState] = useState<CommandState | null>(null);
  const [selectionSnapshot, setSelectionSnapshot] = useLiveSelection(activeId);




  const { themes, setThemes, refresh: refreshThemes } = useDocThemeInventory();


  const activeIdRef = useRef<DocId | null>(null);
  const editorRef = useRef<EditorPaneHandle>(null);





  const { toasts, toast, dismiss } = useToasts();
  useSelectableUiText(settings);
  useImeCursorBridge();
  const settingsWindow = useSettingsWindow({ settings, toast });




  const t = useT();




  //




  const TextItemType = useFileKind({ docs, activeId, toast, t });

  const refreshDocs = useCallback(async () => {
    const list = await api.doc.list();
    const localized = list.map((doc) => ({ ...doc, title: localizedDocumentTitle(doc.title) }));
    setDocs(localized);
    return localized;
  }, []);


  //



  //



  const getEditorMarkdown = useCallback(() => editorRef.current?.getMarkdown(), []);




  //



  const dialog = useDialogs();


  const { confirmReq, promptReq, windowPickReq, imageReq, linkReq, emojiOpen } = dialog;
  const { askConfirm, askPrompt, askLink, askImage, askEmoji, askWindowPick } = dialog;




  //



  const plugin = usePlugins({ toast, askPrompt, askConfirm, setDockOpen, extensionsEnabled });



  const {
    plugins, panels, panelFocus, openPanelFull, messageTask: trustTable, pluginUpdate,
    review: preview, receivePreview, menus: allMenus, handlers: pluginHandler,
    configure: invokePlugin, action: pluginAction,
  } = plugin;

  //



  const previewOutputMouth = useReviewView({
    preview,
    invokePlugin,
    receivePreview,
  });






  const treePointTexture = optionKey(readMouthPath(settings));
  const refreshTree = useCallback(async () => {
    if (!workspace) {
      setTree([]);
      return;
    }
    try {
      setTree(await api.workspace.tree(undefined, 1, readMouthPath(settings)));
    } catch (e) {
      toast(String(e), "error");
    }


  }, [workspace, toast, treePointTexture]);




  //



  const documentApi = useDocuments({
    docs,
    setActiveId,
    activeIdRef,
    workspace,
    refreshDocs,
    setWorkspace,
    setTree,
    editorRef,
    settings,

    modePreference: TextItemType.preference,
    toast,
    askConfirm,
    askPrompt,
  });
  const {
    openPath,
    newDoc,
    newDocWithText,
    newFolder,
    connectAboveCurrentHas,
    openViaDialog,
    openFolder,
    loadDir, deletePath,
    saveDoc,
    switchDocument,
    closeDoc,
    reloadDoc,
    renameDoc,
    moveDoc,
    transferDocToWindow,
  } = documentApi;


  //



  const changeActionOutputMouth = useExternalChanges({ docs, activeIdRef, editorRef, reloadDoc, toast });




  const { correctAccording: ExternalPartCorrectAccording } = changeActionOutputMouth;
















  const previewMiddle = preview !== null || ExternalPartCorrectAccording !== null;








  const MeetingSpeechOutputMouth = useSession({
    docs,
    activeId,
    openPath,


    newDocument: newDoc,
    connectAboveCurrentHas,



    setWorkspace,
    toast,
  });





  const { recent, connectAboveMeetingSpeech, openRecent, clearEmptyRecent } = MeetingSpeechOutputMouth;
  const customExporter = settings?.export.custom_exporters ?? defaultExporter;




  const menu = useMenuTable({
    allMenus,
    recent,
    coverCover: settings?.keys?.overrides,
    exporter: customExporter,
  });





  //




  useStartup({ setSettings, setWorkspace, setThemes, openPath, connectAboveMeetingSpeech, toast, showFirstRun: dialog.openFirstRun });
  useAppEvents({
    toast,
    refreshDocs,
    openPath,
    activeId,
    activeIdRef,
    editorRef,
    setSettings,
  });






  useEffect(() => {
    void refreshTree();

  }, [refreshTree]);



  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return;
      const previous = settings;
      const next = { ...settings, ...patch };
      setSettings(next);
      try {
        await api.settings.set(next);



        void refreshDocs();
      } catch (e) {
        setSettings(previous);
        toast(t("Could not save the settings: {0}", String(e)), "error");
      }
    },
    [settings, toast, refreshDocs],
  );


  //





  //

  const slot = useDocThemeSlot(settings, updateSettings);




  const ShrinkReleaseAction = useAppearance(settings, updateSettings);





  useCodeBlockPrefs(settings);





  useFocusDim(settings);


  const { export: exportAction, exportImage, print, exportAs, exportCustom, guideEnterAs,
    pandocGate, pandocGateActions } = useExportFeature({
    activeId,
    docs,
    getMarkdown: getEditorMarkdown,
    themeId: slot.id,
    exportSettings: settings?.export,
    toast,
    askConfirm,
    openImported: newDocWithText,
  });






  //



  const mainRef = useRef<HTMLElement | null>(null);
  const formatBarRef = useRef<HTMLDivElement | null>(null);
  const { statusBarOpen, formatBarOpen, menuBarOpen, toolbarMode, setChrome } =
    useChromeVisibility(settings, updateSettings, { mainArea: mainRef, workToolBar: formatBarRef, toast });


  //




  const { dedicatedNoteState, dedicatedNoteMoveLineMiddle, splitReplaceStrongMakeDedicatedNote, dedicatedNoteTotalJoin, closeDedicatedNoteTotalJoin } =
    useFocusSession({ askConfirm, settings, updateSettings });



  //



  const { immersive, focusMode, splitReplaceDedicatedNote, fullscreen, maximized, toggleFullscreen } = useImmersive({
    hasFloatingLayer:
      settingsWindow.open ||
      confirmReq !== null ||
      promptReq !== null ||
      windowPickReq !== null ||
      imageReq !== null ||
      linkReq !== null ||
      emojiOpen ||
      dialog.commandPaletteOpen ||
      dialog.aboutOpen ||
      pandocGate !== null || dedicatedNoteTotalJoin !== null,
    toast,
  });



  const { alwaysOnTop, toggleAlwaysOnTop, openDevTools, openNewWindow } = useWindowControls({ toast });
  const activeDoc = docs.find((d) => d.id === activeId) ?? null;
  const windowRegistry = useAppWindowRegistry({ enabled: !settingsOnly && !aboutOnly, windowIdAccel: findMenuAccel(menu, "view.windowId"), activeDoc, focusTarget: settings?.appearance.focus_after_window_transfer ?? true, showFilenameInTitlebar: settings?.appearance.show_filename_in_titlebar ?? true, openPath, newDocWithText, transferDocToWindow, askWindowPick, toast, t });
  const menuFeatures = useMenuFeatures({ docs, activeDoc, activeId, workspace, setActiveId, setSidebarOpen, setSidebarTab, refreshDocs, saveDoc, openFolder, openViaDialog, openNewWindow, windowRegistry, askConfirm, toast });
  useDevBridgePreview({ markdown: getEditorMarkdown, themeId: slot.id, title: activeDoc?.title ?? "Nota" });




  //



  const { pickTheme, openThemesDir } = useDocTheme({
    themeId: slot.id,
    writeTheme: slot.write,
    themes,


    heavyScan: () => void api.theme.list().then(setThemes),
    toast,
    askConfirm: dialog.askConfirm,
  });




  const { styles: uiStyles, openStylesDir, refreshStyles, importTheme, importTyporaTheme } = useUiStyles(settings, toast, refreshThemes, !settingsOnly);



  const showAbout = dialog.openAbout;




  //


  const { run, insertLink } = useEditorCommands({ editorRef, askLink, toast });




  const { insertImageLike, dropOneImage, pasteClipboardImage } = useImageInsert({
    run,
    docId: activeId,


    docSaved: (docs.find((d) => d.id === activeId)?.path ?? null) !== null,
    askImage,
    toast,
  });




  useSpellcheck({

    open2: settings?.editor.spellcheck ?? null,



    language: settings === null ? null : settings.editor.spellcheck_langs,
    toast,
  });




  useFileDrop({
    openPath,
    openFolder,
    dropOneImage,
    files: settings?.files ?? null,
    hasDoc: activeId !== null,
    toast,
  });










  const insertEmoji = useCallback(async () => {
    const character = await askEmoji();
    if (character !== null) run("insertText", { text: character });
  }, [askEmoji, run]);


  const cutPasteBoard = useClipboard({ editorRef, run, toast, pasteImage: pasteClipboardImage });


  const findBar = useFindBar({
    editorRef,
    toast,
    t,
  });


  const { splitCheckFind } = findBar; const checkDocument = useDocumentCheck(editorRef, activeDoc, askConfirm);















  const menuHandlers = useCommandTable({



    previewMiddle: preview !== null,
    pluginHandler,
    newDocument: newDoc,
    openFile: openViaDialog,
    openCommandPalette: dialog.openCommandPalette,
    openFolder: openFolder,



    recent,
    openRecent,
    clearEmptyRecent,
    reloadDocument: reloadDoc,
    renameDocument: renameDoc,
    moveDocument: moveDoc,
    saveDocument: saveDoc,
    closeDocument: closeDoc,
    activityDocument: activeId,
    openSettingsPage: settingsWindow.setOpenFromMenu,
    export: exportAction,
    exportImage,
    exportAs,
    exportCustom,
    customExporter,
    guideEnterAs,
    print,
    moveLine: run,
    splitCheckFind,
    checkDocument,
    insertLink,
    insertImageLike,
    insertEmoji,


    cutPasteBoardCutSplit: cutPasteBoard.cutSplit,
    cutPasteBoardCopy: cutPasteBoard.copy,
    cutPasteBoardPastePaste: cutPasteBoard.pastePaste,
    cutPasteBoardCopyAsMarkdown: cutPasteBoard.copyAsMarkdown,
    cutPasteBoardCopyAsPlainText: cutPasteBoard.copyAsPlainText,
    cutPasteBoardCopyAsHTML: cutPasteBoard.copyAsHTML,
    cutPasteBoardCopyImageSlice: cutPasteBoard.copyImageSlice,
    ShrinkReleaseAction,
    setSideBarOpen: setSidebarOpen,
    setSideBarPage: setSidebarTab,
    setRightBarOpen: setDockOpen,
    setHitCharacterMachine: setTypewriter,
    setUi: setChrome,
    stateBarOpen: statusBarOpen,
    menuBarOpen: menuBarOpen,
    strictCellMode: settings?.strict_markdown ?? false,
    splitReplaceDedicatedNote,
    splitReplaceStrongMakeDedicatedNote,
    toggleFullscreen,
    showWindowId: windowRegistry.showWindowId,
    toggleAlwaysOnTop,
    openDevTools,
    setMode: TextItemType.setMode,
    about: showAbout,
    menuFeatures,
  });







  const viewMode = TextItemType.mode2;








  const onNativePick = useCallback(
    (id: string) => {
      const p = resolvePick(id);
      if (p.kind === "theme") pickTheme(p.id);
      else if (p.kind === "themes-dir") void openThemesDir();
      else menuHandlers[p.id]?.();
    },
    [menuHandlers, pickTheme, openThemesDir],
  );




  const { disabledCommands, menuChecks, usingNativeMenu } = useMenus({




    menus: menu,
    menuHandlers,
    activeId,
    commandState,
    view: {
      sidebarOpen,
      sidebarTab,
      dockOpen,
      toolbarMode,
      statusBarOpen,
      menuBarOpen,
      viewMode,
      focusMode,


      forceFocus: dedicatedNoteMoveLineMiddle,
      typewriter,
      readOnly: menuFeatures.readOnly,


      fullscreen,


      alwaysOnTop: alwaysOnTop,
    },
    themes,


    documentTheme: slot.id,
    menuRenderer: effectiveMenuRenderer(settings?.appearance.menu_renderer ?? "nota", settings?.appearance.force_nota_menu_when_expanded ?? true, maximized || fullscreen),
    onNativePick,
    developerMode: settings?.general.debug_mode ?? false,
    webviewDefaultShortcuts: settings?.general.webview_default_shortcuts ?? false,
  });





  const stateBarWiring = useStatusBar({
    settings,
    updateSettings,
    viewMode,
    setMode: TextItemType.setMode,
    doc: activeDoc,
    sidebarOpen,
    setSidebarOpen,
    focus: dedicatedNoteState,



    setUi: setChrome,
    cursor: commandState,
    selection: selectionSnapshot,

    pluginDock:
      extensionsEnabled && (usingNativeMenu || !menuBarOpen)
        ? { open2: dockOpen, splitReplace: () => setDockOpen((v) => !v) }
        : null,
  });

  const { openConfigDir, resetSettings } = useSettingsFile({ setSettings, toast });
  useUtilityWindows({ settingsOnly, aboutOpen: dialog.aboutOpen, closeAbout: dialog.closeAbout, style: settings?.appearance.settings_window_style, toast });

  // Right-click classification and keyboard behavior live in ContextMenu.
  const contextMenuWiring = {
    commandTable: menuHandlers,
    disabled2: disabledCommands,
    check: menuChecks,
    cursor: commandState,
    toast,
    copyImage: cutPasteBoard.copyImageSlice,
    developerMode: settings?.general.debug_mode ?? false,
    tableActions: plugin.tableActions,
    onTableAction: (pluginId: string, command: string, actionId: string) =>
      void plugin.configure(pluginId, command, { actionId }),
  };
  return (
    <ErrorBoundary>
      {
                                           }
      <div className="app" data-zen={immersive || undefined} data-settings-only={settingsOnly || aboutOnly || undefined}>
        {

                                                      }
        <div className="zen-top">
          <TopBar
            menus={menu}
            disabled={disabledCommands}
            checks={menuChecks}
            themes={themes}
            currentTheme={slot.id}
            onCommand={(id) => menuHandlers[id]?.()}
            onTheme={pickTheme}
            onOpenThemesDir={() => void openThemesDir()}
            onRefreshThemes={refreshThemes}
            dockOpen={dockOpen}
            onToggleDock={() => setDockOpen((v) => !v)}
            showDock={extensionsEnabled}




            hideMenuBar={usingNativeMenu || !menuBarOpen}
          />
        </div>

        <div className="app-body">
          {


                                       }
          <Sidebar
            workspace={workspace}
            tree={tree}
            docText={activeDoc?.text ?? ""}
            activePath={activeDoc?.path ?? null}
            strict={settings?.strict_markdown ?? false}
            tab={sidebarTab}
            onTab={setSidebarTab}
            onOpenFile={openPath}



            onJumpOutline={(target) => editorRef.current?.jumpToMarkTitle(target)}
            loadDir={loadDir}


            optionKey={treePointTexture}


            collapse2={!sidebarOpen}



            onResize={(width) => {
              if (settings) {
                void updateSettings({
                  appearance: { ...settings.appearance, sidebar_width: width },
                });
              }
            }}
            onCollapseFromResize={() => setSidebarOpen(false)}

            onOpenFolder={() => void openFolder()}
            onNewFile={(name, directory) => void newDoc(name, directory)}
            onNewFolder={(directory) => void newFolder(directory)}
            onRefresh={() => void refreshTree()} onDeletePath={(path) => void deletePath(path)}
            searchRequest={menuFeatures.searchRequest}

            inert={previewMiddle}
          />

          {


                                                  }
          <EditorArea
            wiring={{
              mainArea: mainRef,
              cellStyleConvertBar: formatBarRef,
              editor: editorRef,
              activeDoc,
              settings,
              viewMode,
              focusMode,
              typewriter,
              onlyReadMode: menuFeatures.readOnly,
              cellStyleConvertBarOpen: formatBarOpen,
              commandState: commandState,
              setCommandState: setCommandState,
              runCommand: run,
              runMenuCommand: (id) => menuHandlers[id]?.(),
              disabledCommands,
              menuChecks,
              insertImageLike,
              onSelectionSnapshot: setSelectionSnapshot,
              documentApi,
              findBar,
              previewOutputMouth,
              changeActionOutputMouth,
              MeetingSpeechOutputMouth,
              plugin,
              dialog,
              refreshDocs,
              toast,




              bottomPart: (
                <>
                  {







                                               }
                  {docs.length >= 2 && (
                    <TabBar
                      docs={docs}
                      activeId={activeId}


                      onSelect={(id) => void switchDocument(id)}
                      onClose={closeDoc}


                      onOpenInNewWindow={(path) => void openNewWindow(path)}
                      onMoveToWindow={(id) => void windowRegistry.moveTabToWindow(id)}
                      onReorder={(source, target, place) => setDocs((items) => reorderTabs(items, source, target, place))}


                      inert={previewMiddle}
                    />
                  )}

                  {statusBarOpen && (





                    <StatusBar {...stateBarWiring} />
                  )}
                </>
              ),
            }}
          />

          {extensionsEnabled && (
            <DeferredPluginDock
              open={dockOpen}
              plugins={plugins} panels={panels} focusRequest={panelFocus} onOpenFull={openPanelFull}
              messageTask={trustTable} onResize={(width: number) => void updateSettings({ appearance: { ...settings!.appearance, dock_width: width } })} onCollapse={() => setDockOpen(false)}




              onCall={invokePlugin}
              askPrompt={askPrompt}
              action={pluginAction}


              inert={previewMiddle}
            />
          )}
        </div>
        <Toasts items={toasts} onDismiss={dismiss} position={settings?.updates.notification_position ?? "bottom-right"} tabbarVisible={docs.length >= 2} statusbarVisible={statusBarOpen} />{windowRegistry.peek && windowRegistry.id !== null && <WindowIdOverlay id={String(windowRegistry.id).padStart(String(Math.max(1, ...windowRegistry.ids)).length, "0")} />}
        <DeferredFilePickerDialog />
        {(settingsWindow.open || settingsOnly) && !aboutOnly && settings && (
          <DeferredSettingsDialog
            standalone={settingsOnly} settings={settings} onChange={updateSettings}
            onClose={settingsOnly ? () => void api.window.hideSettings() : settingsWindow.close}
            docThemes={themes} onOpenThemesDir={() => void openThemesDir()} onRefreshThemes={() => void refreshThemes()}
            uiStyles={uiStyles} onOpenStylesDir={() => void openStylesDir()}
            onRefreshUiStyles={() => void refreshStyles()} onImportTheme={() => void importTheme()}
            onImportTyporaTheme={() => void importTyporaTheme()} onOpenConfigDir={() => void openConfigDir()}
            onResetSettings={() => void resetSettings()} onClearRecent={() => void clearEmptyRecent()}
            onRestoreDrafts={() => void documentApi.restoreDrafts()} menus={menu} plugins={plugins}
            pluginTrust={trustTable} pluginUpdate={pluginUpdate} pluginAction={pluginAction}
            debugMode={settings.general.debug_mode} initialSection={settingsWindow.initialSection}
          />
        )}
        {aboutOnly && <StandaloneAboutWindow debugMode={settings?.general.debug_mode ?? false} onSetDebugMode={(enabled) => settings && void updateSettings({ general: { ...settings.general, debug_mode: enabled } })} />}
        <ElementInspector enabled={(settings?.general.debug_mode ?? false) && (settings?.general.element_inspector ?? false)} />

        {

                                                               }
        <AppDialogs
          dialog={dialog}
          pandocGate={pandocGate}
          pandocGateActions={pandocGateActions}
          dedicatedNoteTotalJoin={dedicatedNoteTotalJoin}
          closeDedicatedNoteTotalJoin={closeDedicatedNoteTotalJoin}
          debugMode={settings?.general.debug_mode ?? false}
          windowPresentation={settings?.appearance.settings_window_style ?? "embedded"}
          onSetDebugMode={(enabled) => settings && void updateSettings({ general: { ...settings.general, debug_mode: enabled } })}
          firstRunSeen={settings?.general.onboarding_seen ?? true} onFirstRunDone={() => settings && void updateSettings({ general: { ...settings.general, onboarding_seen: true } })}
          commandPalette={dialog.commandPaletteOpen ? { menus: menu, disabled: disabledCommands, checks: menuChecks, themes, currentTheme: slot.id, onPick: onNativePick, onClose: dialog.closeCommandPalette } : null}
        />
        {/* Native context menu replacement: portals to `document.body`, follows `AppDialogs` overlays, and renders `null` when closed. */}
        <ContextMenu {...contextMenuWiring} />
      </div>
    </ErrorBoundary>
  );
}
