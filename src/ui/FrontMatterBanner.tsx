





































import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import { useT } from "@/i18n";




import { splitFrontMatter, splitFrontMatterBody, replaceFrontMatter, newFrontMatterTemplate } from "@/editor/front-matter";












const removeRemoveConfirmRecognizeMilliSeconds = 4000;


export interface FrontMatterBannerProps {




  show: boolean;

  readText: () => string;

  writeFrontMatter: (body: string | null) => void;
}


export interface FrontMatterBannerHandle {









  sameStep: (markdown: string, allowAllowExpand?: boolean) => void;
}

export function FrontMatterBanner({
  show,
  readText,
  writeFrontMatter,
  ref,
}: FrontMatterBannerProps & { ref?: Ref<FrontMatterBannerHandle> }) {
  const t = useT();








  const [hasFrontMatter, setHasFrontMatter] = useState(false);







  const [frontMatterBody, setFrontMatterBody] = useState("");
  const [frontMatterExpanded, setFrontMatterExpanded] = useState(false);

  const [removeFrontMatterPendingConfirmRecognize, setRemoveFrontMatterPendingConfirmRecognize] = useState(false);
  const frontMatterBoxRef = useRef<HTMLTextAreaElement>(null);

  const pendingConfirmRecognizeFixedTimeRef = useRef<number | null>(null);







  const frontMatterBaselineRef = useRef<string | null>(null);






  const aboveOnceBodyRef = useRef<string | null>(null);











  const sameStep = (markdown: string, allowAllowExpand = true) => {
    const block = splitFrontMatter(markdown).frontMatter;
    const body = block === null ? null : splitFrontMatterBody(block);


    const justEmergeResult = body !== null && aboveOnceBodyRef.current === null;
    aboveOnceBodyRef.current = body;
    setHasFrontMatter(body !== null);
    if (body === null) setFrontMatterExpanded(false);
    if (body === frontMatterBaselineRef.current && !justEmergeResult) return;
    frontMatterBaselineRef.current = body;
    setFrontMatterBody(body ?? "");




    if (allowAllowExpand && justEmergeResult && body === newFrontMatterTemplate) setFrontMatterExpanded(true);
  };


  useImperativeHandle(ref, () => ({ sameStep }), []);


  const currentGetBody = (): string | null => {
    const block = splitFrontMatter(readText()).frontMatter;
    return block === null ? null : splitFrontMatterBody(block);
  };







  const openBox = () => {
    const body = currentGetBody() ?? "";


    frontMatterBaselineRef.current = body;
    setFrontMatterBody(body);
    setRemoveFrontMatterPendingConfirmRecognize(false);
    setFrontMatterExpanded(true);
  };


  const closeBox = () => {
    if (pendingConfirmRecognizeFixedTimeRef.current !== null) {
      window.clearTimeout(pendingConfirmRecognizeFixedTimeRef.current);
      pendingConfirmRecognizeFixedTimeRef.current = null;
    }
    setRemoveFrontMatterPendingConfirmRecognize(false);
    setFrontMatterExpanded(false);
  };









  const raiseHandoff = (body: string) => {


    if (body.trim() === "") return;
    const originalBlock = splitFrontMatter(readText()).frontMatter;
    const newValueBlock = replaceFrontMatter(originalBlock, body);
    if (newValueBlock === null || newValueBlock === originalBlock) return;


    frontMatterBaselineRef.current = splitFrontMatterBody(newValueBlock);
    writeFrontMatter(body);
  };








  const removeRemove = () => {
    if (!removeFrontMatterPendingConfirmRecognize) {
      if (pendingConfirmRecognizeFixedTimeRef.current !== null) window.clearTimeout(pendingConfirmRecognizeFixedTimeRef.current);
      setRemoveFrontMatterPendingConfirmRecognize(true);
      pendingConfirmRecognizeFixedTimeRef.current = window.setTimeout(() => {
        pendingConfirmRecognizeFixedTimeRef.current = null;
        setRemoveFrontMatterPendingConfirmRecognize(false);
      }, removeRemoveConfirmRecognizeMilliSeconds);
      return;
    }
    closeBox();


    frontMatterBaselineRef.current = null;
    writeFrontMatter(null);
  };




  useEffect(() => {
    if (!frontMatterExpanded) return;
    const box2 = frontMatterBoxRef.current;
    if (!box2) return;
    box2.focus();
    box2.setSelectionRange(box2.value.length, box2.value.length);
  }, [frontMatterExpanded]);



  useEffect(
    () => () => {
      if (pendingConfirmRecognizeFixedTimeRef.current !== null) window.clearTimeout(pendingConfirmRecognizeFixedTimeRef.current);
    },
    [],
  );







  if (!show || !hasFrontMatter) return null;

  return (
    <div className="editor-frontmatter" role="region" aria-label={t("Front matter")}>
      <div className="editor-frontmatter-head">
        <span className="editor-frontmatter-title">{t("Front matter")}</span>
        {frontMatterExpanded ? (
          <button type="button" className="editor-frontmatter-btn" onClick={closeBox}>
            {t("Done")}
          </button>
        ) : (
          <button type="button" className="editor-frontmatter-btn" onClick={openBox}>
            {t("Edit")}
          </button>
        )}
        {
                                       }
        <button
          type="button"
          className="editor-frontmatter-btn editor-frontmatter-del"
          data-arming={removeFrontMatterPendingConfirmRecognize ? "true" : undefined}
          title={t("The line itself goes away too — this one takes two clicks.")}
          onClick={removeRemove}
        >
          {removeFrontMatterPendingConfirmRecognize ? t("Confirm delete") : t("Delete")}
        </button>
      </div>
      {frontMatterExpanded && (





        <textarea
          ref={frontMatterBoxRef}
          className="editor-frontmatter-text"
          value={frontMatterBody}
          spellCheck={false}
          rows={Math.min(12, Math.max(2, frontMatterBody.split("\n").length + 1))}
          onChange={(e) => {
            setFrontMatterBody(e.target.value);
            raiseHandoff(e.target.value);
          }}
          onKeyDown={(e) => {


            if (e.key === "Escape") {
              e.preventDefault();
              closeBox();
            }
          }}
        />
      )}
      <div className="editor-frontmatter-hint">
        {frontMatterExpanded
          ? t(
              "Kept as-is at the very top of the file, outside the text you edit below — clearing this box will not delete it.",
            )
          : t(
              "The lines wrapped in `---` at the top of the file. They are not part of the text below, and they are kept as-is when you save.",
            )}
      </div>
    </div>
  );
}
