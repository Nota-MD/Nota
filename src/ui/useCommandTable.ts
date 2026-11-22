


































import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { CustomExporter, DocId, Settings, ViewMode } from "@/bridge/ipc";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import { clearRemoveRecentItem } from "@/ui/commands";
import { recentItemid } from "@/ui/recentMenu";
import type { SidebarTab } from "@/ui/Sidebar";
import type { ShrinkReleaseAction } from "@/ui/useZoom";
import type { menuFeatureApi } from "@/ui/useMenuFeatures";
import { customExportCommand } from "@/ui/export-templates";

export interface CommandTableInput {




  previewMiddle: boolean;




  pluginHandler: Record<string, () => void>;


  newDocument: () => Promise<void>;
  openFile: () => Promise<void>;








  recent: readonly string[];

  openRecent: (path: string) => Promise<void>;

  clearEmptyRecent: () => Promise<void>;
  openFolder: () => Promise<void>;
  reloadDocument: (id: DocId) => Promise<void>;








  renameDocument: (id: DocId) => Promise<void>;

  moveDocument: (id: DocId) => Promise<void>;

  saveDocument: (id: DocId, otherSaveAs?: boolean, staticSilent?: boolean) => Promise<boolean>;
  closeDocument: (id: DocId) => Promise<void>;

  activityDocument: DocId | null;

  openSettingsPage: Dispatch<SetStateAction<boolean>>;



  export: (withStyleStyle: boolean) => Promise<void>;
  exportImage: () => Promise<void>;
  exportAs: (cellStyle: string) => Promise<void>;
  exportCustom: (id: string) => Promise<void>;
  customExporter: readonly CustomExporter[];
  guideEnterAs: (cellStyle: string) => Promise<void>;
  print: () => Promise<void>;



  moveLine: (c: EditorCommand, payload?: CommandPayload) => void;

  splitCheckFind: (withReplaceReplace?: boolean) => void;
  checkDocument: () => Promise<void>;
  insertLink: () => Promise<void>;
  insertImageLike: () => Promise<void>;

  insertEmoji: () => Promise<void>;




  cutPasteBoardCutSplit: () => Promise<void>;
  cutPasteBoardCopy: () => Promise<boolean>;
  cutPasteBoardPastePaste: () => Promise<void>;
  cutPasteBoardCopyAsMarkdown: () => Promise<void>;

  cutPasteBoardCopyAsPlainText: () => Promise<void>;
  cutPasteBoardCopyAsHTML: () => Promise<void>;
  cutPasteBoardCopyImageSlice: () => Promise<void>;









  ShrinkReleaseAction: ShrinkReleaseAction;
  setSideBarOpen: Dispatch<SetStateAction<boolean>>;
  setSideBarPage: Dispatch<SetStateAction<SidebarTab>>;
  setRightBarOpen: Dispatch<SetStateAction<boolean>>;
  setHitCharacterMachine: Dispatch<SetStateAction<boolean>>;

  setUi: (patch: Partial<Settings["appearance"]>) => void;

  stateBarOpen: boolean;






  menuBarOpen: boolean;








  strictCellMode: boolean;
  splitReplaceDedicatedNote: () => void;




  splitReplaceStrongMakeDedicatedNote: () => void;
  toggleFullscreen: () => void;
  showWindowId: () => void;







  toggleAlwaysOnTop: () => Promise<void>;
  openDevTools: () => Promise<void>;









  setMode: (m: ViewMode) => void;


  about: () => void;

  menuFeatures: menuFeatureApi;
}




export function useCommandTable(input: CommandTableInput): Record<string, () => void> {



  const {
    previewMiddle,
    pluginHandler,
    newDocument: newDoc,
    openFile: openViaDialog,
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
    openSettingsPage: setSettingsOpen,
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
    cutPasteBoardCutSplit,
    cutPasteBoardCopy,
    cutPasteBoardPastePaste,
    cutPasteBoardCopyAsMarkdown,
   cutPasteBoardCopyAsPlainText,
   cutPasteBoardCopyAsHTML,
    cutPasteBoardCopyImageSlice,
    ShrinkReleaseAction,
    setSideBarOpen: setSidebarOpen,
    setSideBarPage: setSidebarTab,
    setRightBarOpen: setDockOpen,
    setHitCharacterMachine: setTypewriter,
    setUi: setChrome,
    stateBarOpen: statusBarOpen,
    menuBarOpen: menuBarOpen,
    strictCellMode: strictMarkdown,
    splitReplaceDedicatedNote,
    splitReplaceStrongMakeDedicatedNote,
    toggleFullscreen,
    showWindowId,
    toggleAlwaysOnTop,
    openDevTools,
    setMode,
    about: showAbout,
    menuFeatures,
  } = input;

  const cutPasteBoard = {
    cutSplit: cutPasteBoardCutSplit,
    copy: cutPasteBoardCopy,
    pastePaste: cutPasteBoardPastePaste,
    copyAsMarkdown: cutPasteBoardCopyAsMarkdown,
    copyAsPlainText: cutPasteBoardCopyAsPlainText,
    copyAsHTML: cutPasteBoardCopyAsHTML,
  };

  return useMemo<Record<string, () => void>>(() => {













    if (previewMiddle) return {};

    return {


      ...pluginHandler,

      "file.new": () => void newDoc(),
      "file.newWindow": () => menuFeatures.newWindow(),
      "tab.openInNewWindow": () => menuFeatures.openActiveInNewWindow(),
      "tab.moveToWindow": () => menuFeatures.moveActiveToWindow(),
      "file.open": () => void openViaDialog(),
      "file.openFolder": () => void openFolder(),
      "file.quickOpen": () => menuFeatures.quickOpen(),



      ...Object.fromEntries(recent.map((path) => [recentItemid(path), () => void openRecent(path)])),


      [clearRemoveRecentItem.id]: () => void clearEmptyRecent(),
      "file.reload": () => activeId !== null && void reloadDoc(activeId),


      "file.rename": () => activeId !== null && void renameDoc(activeId),
      "file.move": () => activeId !== null && void moveDoc(activeId),
      "file.save": () => activeId !== null && void saveDoc(activeId),
      "file.saveAs": () => activeId !== null && void saveDoc(activeId, true),
      "file.saveAll": () => menuFeatures.saveAll(),
      "file.revealInFolder": () => menuFeatures.revealActive(),
      "file.showInSidebar": () => menuFeatures.showActiveInSidebar(),
      "file.delete": () => menuFeatures.deleteActive(),
      "file.close": () => activeId !== null && void closeDoc(activeId),
      "file.preferences": () => setSettingsOpen(true),





      "file.exportHtmlPlain": () => void exportAction(false),
      "file.exportHtmlStyled": () => void exportAction(true),
      "file.exportImage": () => void exportImage(),
      "file.exportPdf": () => void exportAs("pdf"),
      "file.exportDocx": () => void exportAs("docx"),
      "file.exportOdt": () => void exportAs("odt"),
      "file.exportRtf": () => void exportAs("rtf"),
      "file.exportLatex": () => void exportAs("latex"),
      "file.exportEpub": () => void exportAs("epub"),
      "file.exportOpml": () => void exportAs("opml"),
      ...Object.fromEntries(
        customExporter.map((exporter) => [
          customExportCommand(exporter.id),
          () => void exportCustom(exporter.id),
        ]),
      ),
      "file.importDocx": () => void guideEnterAs("docx"),
      "file.importRtf": () => void guideEnterAs("rtf"),
      "file.importLatex": () => void guideEnterAs("latex"),
      "file.importEpub": () => void guideEnterAs("epub"),
      "file.importOdt": () => void guideEnterAs("odt"),
      "file.print": () => void print(),

      "edit.undo": () => run("undo"),
      "edit.redo": () => run("redo"),




      "edit.cut": () => void cutPasteBoard.cutSplit(),
      "edit.copy": () => void cutPasteBoard.copy(),
      "edit.paste": () => void cutPasteBoard.pastePaste(),






      "edit.pastePlain": () => void cutPasteBoard.pastePaste(),






      "edit.delete": () => run("insertText", { text: "" }),


      "edit.copyAsMarkdown": () => void cutPasteBoard.copyAsMarkdown(),



      "edit.copyAsPlain": () => void cutPasteBoard.copyAsPlainText(),
      "edit.copyAsHtml": () => void cutPasteBoard.copyAsHTML(),
      "edit.copyImage": () => void cutPasteBoardCopyImageSlice(),





      "edit.selectLine": () => run("selectLine"),
      "edit.selectWord": () => run("selectWord"),
      "edit.selectSentence": () => run("selectSentence"),
      "edit.deleteWord": () => run("deleteWord"),



      "edit.moveLineUp": () => run("moveLineUp"),
      "edit.moveLineDown": () => run("moveLineDown"),


      "edit.find": () => splitCheckFind(false),
      "edit.findReplace": () => splitCheckFind(true),
      "edit.checkDocument": () => void checkDocument(),

      "para.h1": () => run("h1"),
      "para.h2": () => run("h2"),
      "para.h3": () => run("h3"),
      "para.h4": () => run("h4"),
      "para.h5": () => run("h5"),
      "para.h6": () => run("h6"),
      "para.text": () => run("text"),
      "para.table": () => run("table"),
      "para.tableRowAbove": () => run("tableRowAbove"),
      "para.tableRowBelow": () => run("tableRowBelow"),
      "para.tableColLeft": () => run("tableColLeft"),
      "para.tableColRight": () => run("tableColRight"),
      "para.tableMoveRowUp": () => run("tableMoveRowUp"),
      "para.tableMoveRowDown": () => run("tableMoveRowDown"),
      "para.tableMoveColLeft": () => run("tableMoveColLeft"),
      "para.tableMoveColRight": () => run("tableMoveColRight"),
      "para.tableDelRow": () => run("tableDelRow"),
      "para.tableDelCol": () => run("tableDelCol"),
      "para.tableDel": () => run("tableDel"),
      "para.tableCopy": () => run("tableCopy"),
      "para.tableFormat": () => run("tableFormat"),
      "para.tableRowHeaders": () => run("tableRowHeaders"),
      "para.tableAlignLeft": () => run("tableAlignLeft"),
      "para.tableAlignCenter": () => run("tableAlignCenter"),
      "para.tableAlignRight": () => run("tableAlignRight"),
      "para.mathBlock": () => run("mathBlock"),
      "para.codeBlock": () => run("codeBlock"),
      "para.quote": () => run("quote"),
      "para.ol": () => run("ol"),
      "para.ul": () => run("ul"),
      "para.task": () => run("task"),
      "para.hr": () => run("hr"),



      "para.toc": () => run("toc", { strict: strictMarkdown }),
      "para.footnote": () => run("footnote"),
      "para.alertNote": () => run("alertNote"),
      "para.alertTip": () => run("alertTip"),
      "para.alertImportant": () => run("alertImportant"),
      "para.alertWarning": () => run("alertWarning"),
      "para.alertCaution": () => run("alertCaution"),






      "para.frontMatter": () => run("frontMatter"),

      "fmt.bold": () => run("bold"),
      "fmt.italic": () => run("italic"),
      "fmt.code": () => run("inlineCode"),
      "fmt.strike": () => run("strike"),



      "fmt.underline": () => run("underline"),
      "fmt.kbd": () => run("kbd"),
      "fmt.highlight": () => run("highlight"),
      "fmt.superscript": () => run("superscript"),
      "fmt.subscript": () => run("subscript"),
      "fmt.comment": () => run("comment"),
      "fmt.link": () => void insertLink(),
      "fmt.image": () => void insertImageLike(),
      "fmt.emoji": () => void insertEmoji(),
      "fmt.clear": () => run("clearFormat"),

      "view.toggleSidebar": () => setSidebarOpen((v) => !v),
      "view.search": () => menuFeatures.search(),
      "view.readOnly": () => menuFeatures.toggleReadOnly(),
      "view.outline": () => {
        setSidebarOpen(true);
        setSidebarTab("outline");
      },
      "view.fileTree": () => {
        setSidebarOpen(true);
        setSidebarTab("tree");
      },



      "view.toggleDock": () => setDockOpen((v) => !v),



      "view.toolbarAlways": () => setChrome({ toolbar: "always" }),
      "view.toolbarHover": () => setChrome({ toolbar: "hover" }),
      "view.toolbarNever": () => setChrome({ toolbar: "never" }),
      "view.statusBar": () => setChrome({ show_status_bar: !statusBarOpen }),







      "view.menuBar": () => setChrome({ show_menu_bar: !menuBarOpen }),


      "view.focusMode": splitReplaceDedicatedNote,



      "view.forceFocus": splitReplaceStrongMakeDedicatedNote,
      "view.typewriter": () => setTypewriter((v) => !v),
      "view.fullscreen": toggleFullscreen,
      "view.windowId": showWindowId,



      "view.alwaysOnTop": () => void toggleAlwaysOnTop(),
      "view.devtools": () => void openDevTools(),


      "view.zoomIn": ShrinkReleaseAction.releaseLarge,
      "view.zoomOut": ShrinkReleaseAction.shrinkSmall,
      "view.zoomReset": ShrinkReleaseAction.restorePosition,





      "view.modeWysiwyg": () => setMode("wysiwyg"),
      "view.modeSource": () => setMode("source"),
      "view.modeSplit": () => setMode("split"),

      "about.about": () => void showAbout(),
    };

  }, Object.values(input));
}
