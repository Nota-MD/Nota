
















import type { SelectionSnapshot } from "./caret-snapshot";
import type { CommandState } from "./command-state";
import type { FindOptions, FindStatus } from "./find";
import type { InlineExtensionFlags } from "./inline-marks";
import type { punctuationSettings } from "./smart-punctuation";
import type { changePreview, previewMode } from "./review";
import type { WritingMode } from "./writing-modes";
import type { VimInputConfig, VimInputHooks } from "./plugin-vim-types";
import type { EditorSelectionRange } from "./selection-range";
import type { MarkdownSyntaxStyle } from "./markdown-syntax-style";












export type EditorCommand =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "inlineCode"
  | "strike"
  | "highlight"
  | "superscript"
  | "subscript"
  | "underline"
  | "kbd"
  | "comment"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "text"
  | "quote"
  | "ul"
  | "ol"
  | "task"
  | "codeBlock"
  | "hr"
  | "mathBlock"
  | "toc"
  | "footnote"
  | "alertNote"
  | "alertTip"
  | "alertImportant"
  | "alertWarning"
  | "alertCaution"
  | "table"
  | "link"
  | "image"
  | "imageSourceSet"
  | "imageRemoveSource"
  | "imageSyntaxSet"
  | "imageZoomSet"
  | "clearFormat"
  | "tableRowAbove"
  | "tableRowBelow"
  | "tableColLeft"
  | "tableColRight"
  | "tableDelRow"
  | "tableDelCol"
  | "tableDel"
  | "tableAlignLeft"
  | "tableAlignCenter"
  | "tableAlignRight"
  | "tableResize"
  | "tableMoveRowUp"
  | "tableMoveRowDown"
  | "tableMoveColLeft"
  | "tableMoveColRight"
  | "tableCopy"
  | "tableFormat"
  | "tableRowHeaders"
  | "insertText"









  | "linkSet"
  | "linkRemove"









  | "selectLine"
  | "selectWord"
  | "selectSentence"
  | "deleteWord"







  | "moveLineUp"
  | "moveLineDown"










  | "frontMatter";













export interface CommandPayload {

  columns?: number;

  rows?: number;

  href?: string;







  label?: string;

  src?: string;

  oldSrc?: string;

  syntax?: "markdown" | "html";

  zoom?: number;

  alt?: string;





  text?: string;













  strict?: boolean;













  frontMatter?: string | null;
  /** Multiple cells changed in one undoable transaction. */
}







export interface SelectionContent {
  text: string;

  html: string;
}


export interface EditorHandle {

  getMarkdown: () => string;

  setMarkdown: (markdown: string) => void;

  focus: () => void;





















  focusAtStart: () => void;

  setWritingModes: (mode2: WritingMode) => void;
  /** Replace the active input adapter without rebuilding the editor. */
  setVimInput: (config: VimInputConfig | null) => void;











  setReview: (preview: changePreview | null, viewMode: previewMode) => void;











  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;














  insertAtCursorPlace: (text: string) => boolean;










  setFind: (query: string, options: FindOptions) => void;

  findStep: (direction: 1 | -1) => void;

  clearFind: () => void;

  replaceCurrent: (text: string) => boolean;

  replaceAll: (text: string) => number;




















  jumpToMarkTitle: (target: { line: number; index: number }) => void;












  selection: () => SelectionContent | null;

  /** Current anchor/head positions in ProseMirror document coordinates. */
  selectionRange: () => EditorSelectionRange;
  /** Restore a remembered caret or selection and focus the editor. */
  restoreSelection: (selection: EditorSelectionRange) => void;


  destroy: () => void;
}

export interface CreateOptions {

  root: HTMLElement;

  initialMarkdown: string;






  documentPath?: string | null;




  onChange?: (markdown: string) => void;






  readOnly?: boolean;


















  strict?: boolean;











  physics?: boolean;
  /** Syntax preferences used when the source document does not establish one. */
  markdownSyntaxStyle?: MarkdownSyntaxStyle;
  /**
   * Recognize bare HTTP(S), www, email and explicit mailto addresses while
   * typing or when Enter starts the next block.
   *
   * This follows `Settings.markdown.autolink`; omitted values default to enabled.
   */
  autoLinks?: boolean;
  /**
   * Pair opening and closing brackets while typing ordinary text.
   *
   * Omitted values default to enabled. Code blocks and inline code are excluded.
   */
  autoPair?: boolean;
  /**
   * Reveal Markdown source around a link or image when the caret reaches it.
   *
   * This is an optional editor interaction setting. It only adds ProseMirror
   * decorations and never inserts source text into the document.
   */
  keyboardExperience?: boolean;
  /** Number of spaces inserted by Tab in ordinary text. Defaults to 2. */
  defaultIndent?: number;
















  inlineMarks?: InlineExtensionFlags;














  punctuation?: punctuationSettings;







  selfActionMoreCorrect?: boolean;














  emoji?: boolean;
  /** Optional editor-wide input adapter contributed by an extension. */
  vimInput?: {
    config: VimInputConfig | null;
    hooks?: VimInputHooks;
  };






  onCommandState?: (state: CommandState) => void;



  onFindStatus?: (status: FindStatus) => void;










  onSelection?: (snapshot: SelectionSnapshot) => void;







  writingModes?: WritingMode;







  review?: changePreview | null;






  onReviewEscape?: () => void;
}
