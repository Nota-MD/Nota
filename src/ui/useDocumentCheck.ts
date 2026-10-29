import { useCallback } from "react";

import type { Document } from "@/bridge/ipc";
import { auditMarkdown, type DocumentAuditCode } from "@/editor/document-audit";
import type { Dialogs } from "@/ui/useDialogs";
import { useT } from "@/i18n";
import type { RefObject } from "react";

interface MarkdownSource {
  getMarkdown(): string | undefined;
}

export function useDocumentCheck(
  editorRef: RefObject<MarkdownSource | null>,
  activeDoc: Document | null,
  askConfirm: Dialogs["askConfirm"],
) {
  const t = useT();
  return useCallback(async () => {
    const markdown = editorRef.current?.getMarkdown() ?? activeDoc?.text ?? "";
    const issues = auditMarkdown(markdown);
    const labels: Record<DocumentAuditCode, string> = {
      "image-alt-missing": t("Image is missing alternative text"),
      "link-label-empty": t("Link has no descriptive label"),
      "heading-level-skip": t("Heading level is skipped"),
      "heading-duplicate": t("Duplicate heading at the same level"),
      "footnote-missing-definition": t("Footnote reference has no definition"),
      "footnote-missing-reference": t("Footnote definition has no reference"),
      "dangerous-link": t("Link uses a dangerous protocol"),
      "rowheaders-unbalanced": t("Row-header boundary is not balanced"),
    };
    const message =
      issues.length === 0
        ? t("No issues found.")
        : issues
            .map(
              (issue) =>
                `${issue.line}: ${labels[issue.code]}${issue.detail ? ` — ${issue.detail}` : ""}`,
            )
            .join("\n");
    await askConfirm({
      title: t("Document check"),
      message,
      confirmLabel: t("Close"),
      hideCancel: true,
    });
  }, [activeDoc?.text, askConfirm, editorRef, t]);
}
