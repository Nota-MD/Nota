import {
  useEffect,
  useMemo,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";

import type { CommandState } from "@/editor/command-state";
import type { SelectionSnapshot } from "@/editor/caret-snapshot";
import type { Document, PluginReviewDiff, ViewMode } from "@/bridge/ipc";
import type { Settings } from "@/bridge/types";
import type { Toast } from "@/ui/Toasts";
import { recognizeTextItemType } from "@/editor/file-kind";
import { EditorPane, type EditorPaneHandle } from "@/ui/EditorPane";
import { ExternalChangeBar } from "@/ui/ExternalChangeBar";
import { FindBar } from "@/ui/FindBar";
import { FormatBar } from "@/ui/FormatBar";
import { ReviewBar } from "@/ui/ReviewBar";
import { ReviewPane } from "@/ui/ReviewPane";
import { TableToolbar } from "@/ui/TableToolbar";
import type { Dialogs } from "@/ui/useDialogs";
import type { documentApi } from "@/ui/useDocuments";
import type { commandApi } from "@/ui/useEditorCommands";
import type { ExternalPartChangeActionOutputMouth } from "@/ui/useExternalChanges";
import type { findBar } from "@/ui/useFindBar";
import type { PluginsState } from "@/ui/usePlugins";
import type { PreviewModeOutputMouth } from "@/ui/useReviewView";
import type { MeetingSpeechOutputMouth } from "@/ui/useSession";
import { usePointLink } from "@/ui/useLinkClick";
import { useTableBridge } from "@/ui/useTableBridge";
import { useT } from "@/i18n";


export interface editorAreaWiring {

  mainArea: RefObject<HTMLElement | null>;

  cellStyleConvertBar: RefObject<HTMLDivElement | null>;

  editor: RefObject<EditorPaneHandle | null>;

  activeDoc: Document | null;
  settings: Settings | null;

  viewMode: ViewMode;
  focusMode: boolean;
  typewriter: boolean;
                       onlyReadMode: boolean;

  cellStyleConvertBarOpen: boolean;

  commandState: CommandState | null;
  setCommandState: Dispatch<SetStateAction<CommandState | null>>;

  runCommand: commandApi["run"];

  runMenuCommand: (id: string) => void;
  disabledCommands: ReadonlySet<string>;
  menuChecks: Record<string, boolean>;


  insertImageLike: () => Promise<void>;

  onSelectionSnapshot: (snapshot: SelectionSnapshot | null) => void;

  documentApi: documentApi;
  findBar: findBar;
  previewOutputMouth: PreviewModeOutputMouth;
  changeActionOutputMouth: ExternalPartChangeActionOutputMouth;
  MeetingSpeechOutputMouth: MeetingSpeechOutputMouth;
  plugin: PluginsState;

  dialog: Dialogs;


  refreshDocs: () => Promise<unknown>;
  toast: (message: string, level?: Toast["level"]) => void;


  bottomPart: ReactNode;
}


export function EditorArea({ wiring }: { wiring: editorAreaWiring }) {
  const t = useT();
  const { mainArea, cellStyleConvertBar, editor, activeDoc, settings, viewMode, focusMode, typewriter, onlyReadMode } = wiring;
  const { cellStyleConvertBarOpen, commandState, setCommandState, runCommand, runMenuCommand, disabledCommands, menuChecks, insertImageLike, onSelectionSnapshot, refreshDocs, toast } =
    wiring;
  const { documentApi, findBar, previewOutputMouth, changeActionOutputMouth, MeetingSpeechOutputMouth, plugin, dialog } = wiring;

  useTableBridge({
    enabled:
      (settings?.editor.spreadsheet_tables ?? false) &&
      viewMode === "wysiwyg" &&
      Boolean(activeDoc),
    documentId: activeDoc?.id ?? null,
    root: mainArea,
    editor,
    toast,
  });


  usePointLink({
    mainArea,
    askLink: dialog.askLink,
    runCommand,
    toast,
    openDocument: documentApi.openPath,
    documentPath: activeDoc?.path ?? null,
    keyboardExperience: settings?.editor?.keyboard_experience ?? false,
  });

  const { recordActivity, saveDoc, closeDoc } = documentApi;
  const { findOpen, replaceReplaceLine, matchSituationSituation, reportMatch, closeFind, replaceReplaceCurrent, replaceAll } = findBar;
  const {
    activeJumpPreview,
    panelPreview,
    viewMode: reviewViewMode,
    setViewMode,
    backOutputPreview,
  } = previewOutputMouth;
  const { changeAction: ExternalPartChangeAction, ignoreOmit: ignoreOmitExternalPartChangeAction, heavyNewValueLoadEnter: heavyNewValueLoadEnterExternalPart, checkSeeFixChange, correctAccording: ExternalPartCorrectAccording, closeCorrectAccording } = changeActionOutputMouth;
  const { rollActionPosition, recordRollAction } = MeetingSpeechOutputMouth;
  const externalReview = useMemo<PluginReviewDiff | null>(
    () =>
      ExternalPartCorrectAccording
        ? {
            kind: "diff",
            plugin: "",
            title: `${t("Changes on disk")} / ${ExternalPartCorrectAccording.title}`,
            text: ExternalPartCorrectAccording.diskText,
            accept: null,
            reject: null,
          }
        : null,
    [ExternalPartCorrectAccording, t],
  );
  const inlineReview = activeJumpPreview ?? externalReview;

  useEffect(() => {
    if (externalReview && !activeJumpPreview) setViewMode("result");
  }, [activeJumpPreview, externalReview, setViewMode]);

  return (


    <main
      className="app-main"
      ref={mainArea}
      data-review={
        inlineReview
          ? "inline"
          : panelPreview
            ? "true"
            : undefined
      }
    >





      <ExternalChangeBar
        changeAction={ExternalPartChangeAction}
        ignoreOmit={ignoreOmitExternalPartChangeAction}
        heavyNewValueLoadEnter={heavyNewValueLoadEnterExternalPart}
        checkSeeFixChange={(id) => void checkSeeFixChange(id)}
        correctAtSee={ExternalPartCorrectAccording?.id ?? null}
        closeCorrectAccording={closeCorrectAccording}
      />
      {activeDoc && findOpen && (


        <FindBar
          key={`find-${activeDoc.id}`}
          status={matchSituationSituation}
          onQuery={(q, o) => editor.current?.setFind(q, o)}
          onStep={(d) => editor.current?.findStep(d)}
          onReplace={replaceReplaceCurrent}
          onReplaceAll={replaceAll}
          onClose={closeFind}
          showReplaceReplace={replaceReplaceLine}
        />
      )}
      {activeDoc && cellStyleConvertBarOpen && (


        <FormatBar
          ref={cellStyleConvertBar}
          state={commandState}


          onCommand={(id) => (id === "image" ? void insertImageLike() : runCommand(id))}
          onMenuCommand={runMenuCommand}
          disabled={disabledCommands}
          checks={menuChecks}
          focusEditor={() => editor.current?.focus()}
        />
      )}
      <TableToolbar
        visible={viewMode === "wysiwyg" && Boolean(commandState?.inTable)}
        documentKey={activeDoc?.id ?? ""}
        run={runCommand}
        spreadsheet={settings?.editor.spreadsheet_tables ?? false}
        spreadsheetPersistent={
          viewMode === "wysiwyg" &&
          Boolean(activeDoc) &&
          (settings?.editor.spreadsheet_tables ?? false)
        }
      />
      {inlineReview && (


        <ReviewBar
          review={inlineReview}
          viewMode={reviewViewMode}
          onViewMode={setViewMode}


          onCall={(command) => {
            if (activeJumpPreview) {
              void plugin.configure(activeJumpPreview.plugin, command);
            }
          }}
          onClose={() => {
            if (activeJumpPreview) void plugin.receivePreview();
            else closeCorrectAccording();
          }}


          onEscape={() => {
            if (activeJumpPreview) backOutputPreview();
            else closeCorrectAccording();
          }}
        />
      )}
      {activeDoc && (
        <EditorPane
          ref={editor}
          key={activeDoc.id}
          doc={activeDoc}
          mode={viewMode}


          plainText={activeDoc.path !== null && recognizeTextItemType(activeDoc.path) === "text"}
          strict={settings?.strict_markdown ?? false}
          physics={settings?.enable_physics ?? false}


          emoji={settings?.editor?.emoji_autocomplete ?? false}
          autoPair={settings?.editor?.auto_pair ?? false}
          keyboardExperience={settings?.editor?.keyboard_experience ?? false}
          defaultIndent={settings?.editor?.default_indent ?? 2}
          vimInput={plugin.editorInput}
          onVimCommand={(command) => {
            if (command === "save") void saveDoc(activeDoc.id);
            else void closeDoc(activeDoc.id);
          }}


          markdown={settings?.markdown}
          focusMode={focusMode}
          typewriter={typewriter}
          onlyReadMode={onlyReadMode}


          contentWidth={settings?.content_width ?? 760}
          limitTextWidth={
            (settings?.limit_text_width ?? false) &&
            !(settings?.editor.spreadsheet_tables ?? false)
          }


          combineWriteLanguage={settings?.editor?.spellcheck_langs[0]}


          documentTypography={settings?.document}


          initialStartRollAction={rollActionPosition(activeDoc.path)}
          onScroll={(compareExample) => {
            if (activeDoc.path) recordRollAction(activeDoc.path, compareExample);
          }}
          onCommandState={setCommandState}
          onSelectionSnapshot={onSelectionSnapshot}
          onFindStatus={reportMatch}
          onToast={toast}
          onDocsChanged={refreshDocs}
          onActivity={recordActivity}


          review={inlineReview}
          previewMode={reviewViewMode}
          onReviewEscape={() => {
            if (activeJumpPreview) backOutputPreview();
            else closeCorrectAccording();
          }}
        />
      )}

      {panelPreview && (


        <ReviewPane
          plugin={panelPreview.plugin}
          panel={panelPreview.panel}


          plugins={plugin.plugins}
          panels={plugin.panels}
          onClose={() => void plugin.receivePreview()}
          onOpenSidebar={() => plugin.focusPanel(panelPreview.plugin, panelPreview.panel)}
          onCall={plugin.configure}
          askPrompt={dialog.askPrompt}
        />
      )}







      {wiring.bottomPart}
    </main>
  );
}
