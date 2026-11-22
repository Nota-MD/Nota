import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";

import {
  api,
  type Document,
  type DocumentSettings,
  type MarkdownSettings,
  type PluginReviewDiff,
  type ViewMode,
} from "@/bridge/ipc";
import { DocumentTypographyVars } from "@/styles/doc-typography";
import { useT } from "@/i18n";
import { finishEditorBootstrap } from "@/ui/useBootReveal";
import { largeTextItemThresholdValue } from "@/editor/file-kind";
import type { previewMode } from "@/editor/review";
import {
  type CommandPayload,
  type EditorCommand,
  type EditorHandle,
  type SelectionContent,
} from "@/editor/create";


import { FrontMatterBanner, type FrontMatterBannerHandle } from "@/ui/FrontMatterBanner";
import type { CommandState } from "@/editor/command-state";
import type { SelectionSnapshot } from "@/editor/caret-snapshot";


import { useEditorSettings } from "@/ui/useEditorSettings";

import { useEditorSentenceHandle } from "@/ui/useEditorHandle";

import { useSelectionSnapshot } from "@/ui/useCursorSnapshot";
import type { WritingMode } from "@/editor/writing-modes";
import { emptyFindState, type FindOptions, type FindStatus } from "@/editor/find";
import { restoreRestoreRollActionCompareExample, readElementRollActionCompareExample, readRollActionCompareExample } from "@/editor/scroll-into-view";
import { createDeferredSnapshot } from "@/editor/deferred-snapshot";
import { debugError, debugEvent } from "@/ui/debug-log";
import type { SourceHandle } from "@/editor/source";


import { createSourceEditingDevice, createWysiwygEditor, createPreviewEditor } from "@/ui/pane-editors";
import {
  initialVimStatus,
  type VimInputConfig,
  type VimInputStatus,
} from "@/editor/plugin-vim-types";
import { VimStatusOverlay } from "@/ui/VimStatusOverlay";
import { recallEditorSelection, rememberEditorSelection } from "@/ui/editor-selection-memory";

export interface EditorPaneHandle {
  getMarkdown: () => string | undefined;
  setMarkdown: (markdown: string) => void;


  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;


  setFind: (query: string, options: FindOptions) => void;
  findStep: (direction: 1 | -1) => void;
  clearFind: () => void;
  replaceCurrent: (text: string) => boolean;
  replaceAll: (text: string) => number;


  jumpToMarkTitle: (target: { line: number; index: number }) => void;


  selection: () => SelectionContent | null;


  insertAtCursorPlace: (text: string) => boolean;


  focus: () => void;
}

interface Props {
  doc: Document;

  mode: ViewMode;


  strict: boolean;


  physics: boolean;


  plainText?: boolean;


  emoji: boolean;

  autoPair: boolean;

  keyboardExperience: boolean;

  defaultIndent: number;


  markdown?: MarkdownSettings;


  focusMode: boolean;
  typewriter: boolean;
                                  onlyReadMode: boolean;

  vimInput?: VimInputConfig | null;

  onVimCommand?: (command: "save" | "close") => void;


  initialStartRollAction?: number;


  onScroll?: (compareExample: number) => void;


  contentWidth: number;


  combineWriteLanguage?: string;


  limitTextWidth: boolean;


  documentTypography?: DocumentSettings;


  onCommandState: (state: CommandState | null) => void;

  onSelectionSnapshot?: (snapshot: SelectionSnapshot | null) => void;

  onFindStatus: (status: FindStatus) => void;
  onToast: (message: string, level?: "info" | "warn" | "error" | "success") => void;
  onDocsChanged: () => Promise<unknown>;


  onActivity: () => void;


  review?: PluginReviewDiff | null;


  previewMode: previewMode;

  onReviewEscape?: () => void;
  ref?: Ref<EditorPaneHandle>;
}


const SYNC_DEBOUNCE_MS = 300;

const LARGE_SYNC_DEBOUNCE_MS = 1000;

const LARGE_DOCS_REFRESH_MS = 1500;

const PREVIEW_DEBOUNCE_MS = 150;


export function EditorPane({
  doc,
  mode,
  strict,
  physics,
  plainText = false,
  emoji,
  autoPair,
  keyboardExperience,
  defaultIndent,
  markdown,
  focusMode,
  typewriter,
  onlyReadMode,
  vimInput = null,
  onVimCommand,
  initialStartRollAction,
  onScroll,
  contentWidth,
  limitTextWidth,
  combineWriteLanguage,
  documentTypography,
  onCommandState,
  onSelectionSnapshot,
  onFindStatus,
  onToast,
  onDocsChanged,
  onActivity,
  review,
  previewMode,
  onReviewEscape,
  ref,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const previewMountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<EditorHandle | SourceHandle | null>(null);
  const previewHandleRef = useRef<EditorHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewTimerRef = useRef<number | null>(null);

  const latestRef = useRef(doc.text);


  const largeTextItemRef = useRef(doc.text.length > largeTextItemThresholdValue);

  const aboveCountRefreshNewTextLevelRef = useRef(0);
  const [ready, setReady] = useState(false);


  const horizontalWidthRef = useRef<FrontMatterBannerHandle>(null);
  const t = useT();


  const commandStateRef = useRef(onCommandState);
  commandStateRef.current = onCommandState;
  const selectionSnapshotRef = useRef(onSelectionSnapshot);
  selectionSnapshotRef.current = onSelectionSnapshot;

  const findStatusRef = useRef(onFindStatus);
  findStatusRef.current = onFindStatus;


  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;
  const vimInputRef = useRef(vimInput);
  vimInputRef.current = vimInput;
  const onVimCommandRef = useRef(onVimCommand);
  onVimCommandRef.current = onVimCommand;
  const [vimStatus, setVimStatus] = useState<VimInputStatus | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const displayedVimStatus: VimInputStatus | null =
    vimStatus?.enabled === true
      ? vimStatus
      : initialVimStatus(vimInput);


  const { recordSnapshot, clearSnapshotFixedTime } = useSelectionSnapshot(doc.id);
  const reportSelection = (snapshot: SelectionSnapshot) => {
    selectionSnapshotRef.current?.(snapshot);
    recordSnapshot(snapshot);
  };


  const initialStartRollActionRef = useRef(initialStartRollAction);
  initialStartRollActionRef.current = initialStartRollAction;


  const splitReplaceRollActionRef = useRef<number | null>(null);
  const rollActionReturnConfigureRef = useRef(onScroll);
  rollActionReturnConfigureRef.current = onScroll;

  const {
    inlineExtensions,
    autoLinks,
    autoPair: enabledAutoPair,
    defaultIndent: enabledDefaultIndent,
    punctuation,
    selfActionMoreCorrect,
  } = useEditorSettings(markdown, autoPair, defaultIndent);


  const writingModeRef = useRef<WritingMode>({ focus: focusMode, typewriter });
  writingModeRef.current = { focus: focusMode, typewriter };


  useEffect(() => {
    handleRef.current?.setWritingModes({ focus: focusMode, typewriter });
  }, [focusMode, typewriter]);


  useEffect(() => {
    const focusAfterReveal = () => {
      requestAnimationFrame(() => {
        handleRef.current?.focus();
      });
    };
    window.addEventListener("nota-window-shown", focusAfterReveal);
    return () => window.removeEventListener("nota-window-shown", focusAfterReveal);
  }, []);


  const reviewDataRef = useRef<PluginReviewDiff | null>(review ?? null);
  reviewDataRef.current = review ?? null;
  const backOutputRef = useRef(onReviewEscape);
  backOutputRef.current = onReviewEscape;


  useEffect(() => {
    handleRef.current?.setReview(review ?? null, previewMode);
  }, [review, previewMode]);


  useEffect(() => {
    previewHandleRef.current?.setMarkdown(review ? review.text : latestRef.current);
  }, [review]);


  useEditorSentenceHandle({
    ref,
    mainSentenceHandleRef: handleRef,
    previewSentenceHandleRef: previewHandleRef,
    mostNewTextLocalRef: latestRef,
  });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let handle: EditorHandle | SourceHandle | null = null;
    let preview: EditorHandle | null = null;


    const pushPreview = (markdown: string) => {
      if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = window.setTimeout(() => {
        previewTimerRef.current = null;
        previewHandleRef.current?.setMarkdown(markdown);
      }, PREVIEW_DEBOUNCE_MS);
    };


    const pushGiveAfterEnd = async (markdown: string) => {
      try {
        await api.doc.sync(doc.id, markdown);
        const now = Date.now();
        if (
          !largeTextItemRef.current ||
          now - aboveCountRefreshNewTextLevelRef.current >= LARGE_DOCS_REFRESH_MS
        ) {
          await onDocsChanged();
          aboveCountRefreshNewTextLevelRef.current = now;
        }
      } catch (e) {
        onToast(t("Could not sync to the backend: {0}", String(e)), "error");
      }
    };

    const safeArrangeAfterEndSameStep = (getFullText: () => string | null) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const markdown = getFullText();
        if (markdown === null) return;
        void pushGiveAfterEnd(markdown);
      }, largeTextItemRef.current ? LARGE_SYNC_DEBOUNCE_MS : SYNC_DEBOUNCE_MS);
    };

    const sourceSnapshot = createDeferredSnapshot({
      delayMs: largeTextItemRef.current ? LARGE_SYNC_DEBOUNCE_MS : SYNC_DEBOUNCE_MS,
      read: () => handle?.getMarkdown() ?? null,
      deliver: (markdown) => {
        latestRef.current = markdown;
        horizontalWidthRef.current?.sameStep(markdown);
        if (mode === "split") pushPreview(markdown);
        void pushGiveAfterEnd(markdown);
      },
    });


    const recognizeWysiwygChangeAction = (markdown: string) => {
      latestRef.current = markdown;
      activityRef.current();
      horizontalWidthRef.current?.sameStep(markdown);
      if (mode === "split") pushPreview(markdown);
      safeArrangeAfterEndSameStep(() => markdown);
    };


    const recognizeSourceActivity = () => {
      activityRef.current();
      sourceSnapshot.touch();
    };

    (async () => {
      try {


        const initial = latestRef.current;


        horizontalWidthRef.current?.sameStep(initial, false);

        if (mode === "wysiwyg") {
          handle = await createWysiwygEditor({
            root: mount,
            initial,
            documentPath: doc.path,
            strict,
            physics,
            inlineExtensions,
            autoLinks,
            autoPair: enabledAutoPair,
            keyboardExperience,
            defaultIndent: enabledDefaultIndent,
            punctuation,
            selfActionMoreCorrect,
            emoji,
            vimInput:
              vimInputRef.current?.enabled === true
                ? {
                    config: vimInputRef.current,
                    hooks: {
                      onStatus: setVimStatus,
                      onCommand: (command) => onVimCommandRef.current?.(command),
                    },
                  }
                : undefined,
            WritingMode: writingModeRef.current,
            preview: reviewDataRef.current,
            onReviewEscape: () => backOutputRef.current?.(),
            onCommandState: (s) => commandStateRef.current(s),
            onFindStatus: (s) => findStatusRef.current(s),
            onSelection: reportSelection,
            onChange: recognizeWysiwygChangeAction,
            readOnly: onlyReadMode,
          });
        } else {


          commandStateRef.current(null);
          handle = await createSourceEditingDevice({
            root: mount,
            initial,
            documentPath: doc.path,
            strict,
            plainText,
            WritingMode: writingModeRef.current,
            preview: reviewDataRef.current,
            onReviewEscape: () => backOutputRef.current?.(),
            onFindStatus: (s) => findStatusRef.current(s),
            onSelection: reportSelection,
            onDocumentActivity: recognizeSourceActivity,
            readOnly: onlyReadMode,
          });
        }


        if (disposed) {
          handle.destroy();
          return;
        }

        handleRef.current = handle;


        if (mode === "split" && previewMountRef.current) {
          preview = await createPreviewEditor({
            root: previewMountRef.current,
            initial,
            documentPath: doc.path,
            strict,
            physics,
            inlineExtensions,
            punctuation,
          });
          if (disposed) {
            preview.destroy();
            previewHandleRef.current = null;
            return;
          }
          previewHandleRef.current = preview;
        }

        setReady(true);


        finishEditorBootstrap(mount, handle, recallEditorSelection(doc.id, mode), !onlyReadMode);


        const wantReturnTo = splitReplaceRollActionRef.current ?? initialStartRollActionRef.current;
        splitReplaceRollActionRef.current = null;
        debugEvent("editor", "editor ready", {
          mode,
          read_only: onlyReadMode,
          path: doc.path ?? "",
          chars: latestRef.current.length,
          scroll_ratio: wantReturnTo ?? 0,
        });
        if (wantReturnTo !== undefined) {
          requestAnimationFrame(() => {
            if (disposed) return;
            restoreRestoreRollActionCompareExample(mount, wantReturnTo);
          });
        }


        const settled = handle.getMarkdown();
        latestRef.current = settled;
        if (mode === "wysiwyg" && settled !== doc.text) {
          try {
            await api.doc.settle(doc.id, settled);
            await onDocsChanged();
            aboveCountRefreshNewTextLevelRef.current = Date.now();
          } catch (e) {

            console.warn("[nota] Could not claim text after load:", e);
          }
        }
      } catch (e) {
        debugError("editor", "editor startup failed", e, {
          mode,
          path: doc.path ?? "",
        });
        onToast(t("The editor failed to start: {0}", String(e)), "error");
      }
    })();

    return () => {
      disposed = true;
      const splitReplaceBeforePosition = readRollActionCompareExample(mount);
      if (splitReplaceBeforePosition !== null) splitReplaceRollActionRef.current = splitReplaceBeforePosition;
      debugEvent("editor", "editor disposed", {
        mode,
        path: doc.path ?? "",
        chars: latestRef.current.length,
        scroll_ratio: splitReplaceBeforePosition ?? 0,
      });
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      sourceSnapshot.cancel();
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }


      clearSnapshotFixedTime();


      const last = handleRef.current?.getMarkdown(); if (last !== undefined) latestRef.current = last;
      rememberEditorSelection(doc.id, mode, handleRef.current?.selectionRange() ?? null);

      handleRef.current = null;
      previewHandleRef.current = null;
      handle?.destroy();
      preview?.destroy();
      setReady(false);


      commandStateRef.current(null);


      findStatusRef.current(emptyFindState);
    };


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, mode, strict, physics, plainText, inlineExtensions, autoLinks, enabledAutoPair, keyboardExperience, enabledDefaultIndent, punctuation, selfActionMoreCorrect, emoji, onlyReadMode, vimInput?.enabled]);

  useEffect(() => {
    if (handleRef.current && "setVimInput" in handleRef.current) {
      handleRef.current.setVimInput(vimInput);
    }
    if (!vimInput?.enabled) setVimStatus(null);
  }, [vimInput]);


  const readMostNewTextLocal = () => latestRef.current;
  const writeFrontMatter = (body: string | null) =>
    handleRef.current?.runCommand("frontMatter", { frontMatter: body });


  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let frame = 0;
    let currentContainer: HTMLElement | null = null;
    const report = (event: Event) => {
      const container = event.target;
      if (!(container instanceof HTMLElement)) return;
      currentContainer = container;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!currentContainer?.isConnected) return;
        rollActionReturnConfigureRef.current?.(readElementRollActionCompareExample(currentContainer));
      });
    };
    mount.addEventListener("scroll", report, { capture: true, passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      mount.removeEventListener("scroll", report, { capture: true });
    };
  }, []);


  const lastDocIdRef = useRef(doc.id);
  if (lastDocIdRef.current !== doc.id) {
    lastDocIdRef.current = doc.id;
    latestRef.current = doc.text;
  }

  return (


    <div
      ref={paneRef}
      className={`editor-pane editor-pane-${mode}`}
      data-doc-font-size={documentTypography?.custom_font_size ? "custom" : undefined}
      style={DocumentTypographyVars(documentTypography) as CSSProperties}
    >
      {!ready && <div className="editor-loading">{t("Preparing the editor…")}</div>}





      <FrontMatterBanner
        ref={horizontalWidthRef}
        show={mode === "wysiwyg"}
        readText={readMostNewTextLocal}
        writeFrontMatter={writeFrontMatter}
      />

      <div
        ref={mountRef}
        className="editor-mount"


        lang={combineWriteLanguage ? combineWriteLanguage.replace(/_/g, "-") : undefined}
        style={limitTextWidth ? { ["--content-width" as string]: `${contentWidth}px`, ["--doc-page-width" as string]: `${contentWidth}px` } : undefined}
      />
      <VimStatusOverlay status={displayedVimStatus} anchor={paneRef} />
      {mode === "split" && (


        <div ref={previewMountRef} className="editor-mount editor-preview" aria-readonly="true" />
      )}
    </div>
  );
}
