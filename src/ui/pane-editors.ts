


































import type { PluginReviewDiff } from "@/bridge/ipc";
import type { SelectionSnapshot } from "@/editor/caret-snapshot";
import type { CommandState } from "@/editor/command-state";
import { createEditor, type EditorHandle } from "@/editor/create";
import type { FindStatus } from "@/editor/find";
import type { InlineExtensionFlags } from "@/editor/inline-marks";
import type { SourceHandle } from "@/editor/source";
import type { punctuationSettings } from "@/editor/smart-punctuation";
import type { WritingMode } from "@/editor/writing-modes";
import type { VimInputConfig, VimInputHooks } from "@/editor/plugin-vim-types";


export interface MainWindowCellCommonCommon {

  root: HTMLElement;

  initial: string;

  documentPath: string | null;

  strict: boolean;

  WritingMode: WritingMode;

  preview: PluginReviewDiff | null;
  onReviewEscape: () => void;
  onFindStatus: (s: FindStatus) => void;

  onSelection: (snapshot: SelectionSnapshot) => void;
  onChange: (markdown: string) => void;

  readOnly?: boolean;
}

export interface WysiwygParameter extends MainWindowCellCommonCommon {

  onCommandState: (s: CommandState | null) => void;
  physics: boolean;
  inlineExtensions: InlineExtensionFlags;
  autoLinks: boolean;
  autoPair: boolean;
  keyboardExperience: boolean;
  defaultIndent: number;
  punctuation: punctuationSettings;
  selfActionMoreCorrect: boolean;
  emoji: boolean;
  vimInput?: {
    config: VimInputConfig | null;
    hooks?: VimInputHooks;
  };
}

export interface sourceOptions extends Omit<MainWindowCellCommonCommon, "onChange"> {

  plainText: boolean;




  onDocumentActivity: () => void;
}







export async function createWysiwygEditor(parameter: WysiwygParameter): Promise<EditorHandle> {
  const {
    root,
    initial,
    documentPath,
    strict,
    physics,
    inlineExtensions,
    autoLinks,
    autoPair,
    keyboardExperience,
    defaultIndent,
    punctuation,
    selfActionMoreCorrect,
    emoji,
    vimInput,
    WritingMode,
    preview,
    onReviewEscape,
    onCommandState,
    onFindStatus,
    onSelection,
    onChange,
    readOnly,
  } = parameter;
  return createEditor({
    root,
    initialMarkdown: initial,
    documentPath,




    //





    //



    strict,
    physics,


    inlineMarks: inlineExtensions,
    autoLinks,
    autoPair,
    keyboardExperience,
    defaultIndent,



    punctuation,
    selfActionMoreCorrect,



    emoji,
    vimInput,
    writingModes: WritingMode,

    review: preview,
    onReviewEscape,

    onCommandState,
    onFindStatus,
    onSelection,
    onChange,
    readOnly,
  });
}









export async function createSourceEditingDevice(parameter: sourceOptions): Promise<SourceHandle> {
  const {
    root,
    initial,
    strict,
    plainText,
    WritingMode,
    preview,
    onReviewEscape,
    onFindStatus,
    onSelection,
    onDocumentActivity,
  } = parameter;
  const { createSourceEditor } = await import("@/editor/source");
  return createSourceEditor({
    root,
    initialMarkdown: initial,
    strict,
    plainText,



    writingModes: WritingMode,

    review: preview,
    onReviewEscape,
    onFindStatus,
    onSelection,
    onDocumentActivity,
    readOnly: parameter.readOnly ?? false,
  });
}








export async function createPreviewEditor(parameter: {
  root: HTMLElement;
  initial: string;
  documentPath: string | null;
  strict: boolean;
  physics: boolean;
  inlineExtensions: InlineExtensionFlags;
  punctuation: punctuationSettings;
}): Promise<EditorHandle> {
  return createEditor({
    root: parameter.root,
    initialMarkdown: parameter.initial,
    documentPath: parameter.documentPath,





    strict: parameter.strict,
    physics: parameter.physics,



    inlineMarks: parameter.inlineExtensions,





    punctuation: parameter.punctuation,
    readOnly: true,
  });
}
