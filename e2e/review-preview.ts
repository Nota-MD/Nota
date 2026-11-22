import { createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";

import type { PluginReviewDiff } from "@/bridge/ipc";
import { createEditor } from "@/editor/create";
import type { previewMode } from "@/editor/review";
import { ReviewBar } from "@/ui/ReviewBar";

import "@/styles/theme.css";
import "@/styles/app.css";
import "@/styles/editor.css";
import "@/styles/editor-inline.css";
import "@/styles/editor-blocks.css";
import "@/styles/code-block.css";
import "@/styles/marks.css";
import "@/styles/diagram.css";
import "@/styles/math.css";
import "@/styles/review.css";

mockIPC((command) => {
  if (command === "nota_spell_check") return [];
  if (command === "nota_debug_log_write") return undefined;
  if (command === "nota_spell_suggest") return [];
  return null;
});

const requestedCase = new URLSearchParams(location.search).get("case") || "prose";
const cases = {
  prose: {
    source: [
      "# Rendered review",
      "",
      "The editor keeps documents **plain and portable**.",
      "",
      "Old *outdated words* remain visible in red.",
      "",
      "[Project site](https://github.com/Nota-MD/Nota) opens the source.",
    ].join("\n"),
    target: [
      "# Rendered review",
      "",
      "The editor keeps documents **plain, portable, and durable**.",
      "",
      "Modern *replacement words* appear in green.",
      "",
      "[Project site and docs](https://github.com/Nota-MD/Nota) opens the source.",
    ].join("\n"),
  },
  table: {
    source: [
      "# Table review",
      "",
      "| Item | Qty | Price |",
      "|---|---:|---:|",
      "| Pen | 2 | 3 |",
      "| Notebook | 1 | 8 |",
    ].join("\n"),
    target: [
      "# Table review",
      "",
      "| Item | Qty | Price | Status |",
      "|---|---:|---:|---|",
      "| Pen | 3 | 3 | Ready |",
      "| Notebook | 1 | 8 | Ready |",
      "| Marker | 2 | 4 | Ready |",
    ].join("\n"),
  },
  math: {
    source: [
      "# LaTeX review",
      "",
      "$$",
      "a^2 + b^2 = c^2",
      "$$",
    ].join("\n"),
    target: [
      "# LaTeX review",
      "",
      "$$",
      "a^2 + b^2 = c^2 + \\varepsilon",
      "$$",
    ].join("\n"),
  },
} as const;

const selected = cases[requestedCase as keyof typeof cases] ?? cases.prose;

const review: PluginReviewDiff = {
  kind: "diff",
  plugin: "nota.ai",
  title: `AI suggested ${requestedCase} edit`,
  text: selected.target,
  accept: { label: "Apply", command: "apply" },
  reject: { label: "Discard", command: "discard" },
};

const editorRoot = document.querySelector<HTMLElement>("#editor");
const reviewBarRoot = document.querySelector<HTMLElement>("#review-bar");
if (!editorRoot || !reviewBarRoot) throw new Error("Review preview mount is missing");

let viewMode: previewMode =
  new URLSearchParams(location.search).get("mode") === "result" ? "result" : "diff";
const editor = await createEditor({
  root: editorRoot,
  initialMarkdown: selected.source,
  autoLinks: true,
  autoPair: true,
  defaultIndent: 2,
  emoji: true,
  selfActionMoreCorrect: true,
  keyboardExperience: true,
  review,
});
editor.setReview(review, viewMode);

const reviewRoot = createRoot(reviewBarRoot);
const props: ComponentProps<typeof ReviewBar> = {
  review,
  viewMode,
  onViewMode: (mode: previewMode) => {
    viewMode = mode;
    editor.setReview(review, mode);
    reviewRoot.render(createElement(ReviewBar, { ...props, viewMode: mode }));
  },
  onCall: () => {},
  onClose: () => {},
  onEscape: () => {},
};
reviewRoot.render(createElement(ReviewBar, props));

document.documentElement.dataset.reviewPreviewReady = "true";
