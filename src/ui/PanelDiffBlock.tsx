import { useState } from "react";

import { useT } from "@/i18n";
import type { PanelDiffLine, PanelDiffOp } from "@/ui/panel-nodes";

export const diffMarker: Record<PanelDiffOp, string> = {
  add: "+",
  del: "-",
  ctx: " ",
  hunk: "",
  meta: "",
};

const visibleContextBefore = 2;
const visibleContextAfter = 2;
const collapseThreshold = 6;

export interface ContextRun {
  start: number;
  lines: PanelDiffLine[];
}

export function contextRuns(items: PanelDiffLine[]): ContextRun[] {
  const runs: ContextRun[] = [];
  let start = -1;
  for (let index = 0; index <= items.length; index += 1) {
    const line = items[index];
    if (line?.op === "ctx") {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0) {
      runs.push({ start, lines: items.slice(start, index) });
      start = -1;
    }
  }
  return runs;
}

function DiffRow({ line }: { line: PanelDiffLine }) {
  return (
    <div className={`diff-line diff-${line.op}`} data-diff-op={line.op}>
      <span className="diff-marker" aria-hidden="true">
        {diffMarker[line.op]}
      </span>
      <span className="diff-text">{line.text}</span>
    </div>
  );
}

export function PanelDiffBlock({ items }: { items: PanelDiffLine[] }) {
  const t = useT();
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(() => new Set());
  const runs = contextRuns(items);
  const collapsed = new Map<number, ContextRun>();

  for (const run of runs) {
    if (run.lines.length > collapseThreshold && !expandedRuns.has(run.start)) {
      collapsed.set(run.start, run);
    }
  }

  const toggleRun = (start: number) => {
    setExpandedRuns((current) => {
      const next = new Set(current);
      if (next.has(start)) next.delete(start);
      else next.add(start);
      return next;
    });
  };

  const rows = [];
  for (let index = 0; index < items.length; index += 1) {
    const line = items[index]!;
    const run = collapsed.get(index);
    if (run) {
      const hidden = run.lines.length - visibleContextBefore - visibleContextAfter;
      run.lines.slice(0, visibleContextBefore).forEach((before, offset) => {
        rows.push(<DiffRow key={`${index}-before-${offset}`} line={before} />);
      });
      rows.push(
        <button
          key={`${index}-toggle`}
          type="button"
          className="diff-context-toggle"
          onClick={() => toggleRun(index)}
          title={t("Show {0} unchanged lines", hidden)}
        >
          {t("Show {0} unchanged lines", hidden)}
        </button>,
      );
      run.lines.slice(-visibleContextAfter).forEach((after, offset) => {
        rows.push(<DiffRow key={`${index}-after-${offset}`} line={after} />);
      });
      index += run.lines.length - 1;
      continue;
    }

    const expanded = runs.find((candidate) => candidate.start === index);
    if (expanded && expandedRuns.has(index)) {
      rows.push(
        <button
          key={`${index}-collapse`}
          type="button"
          className="diff-context-toggle"
          onClick={() => toggleRun(index)}
          title={t("Collapse unchanged lines")}
        >
          {t("Collapse unchanged lines")}
        </button>,
      );
    }
    rows.push(<DiffRow key={index} line={line} />);
  }

  return (
    <div className="panel-diff" role="group" aria-label={t("Diff")} tabIndex={0}>
      {rows}
    </div>
  );
}
