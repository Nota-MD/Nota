import { mockIPC } from "@tauri-apps/api/mocks";

import { createEditor, type EditorHandle } from "@/editor/create";
import type { EditorView } from "@milkdown/kit/prose/view";

import "@/styles/theme.css";
import "@/styles/app.css";
import "@/styles/editor.css";
import "@/styles/editor-inline.css";
import "@/styles/editor-blocks.css";
import "@/styles/code-block.css";
import "@/styles/marks.css";
import "@/styles/diagram.css";
import "@/styles/math.css";
import "@/styles/github-alert.css";
import "katex/dist/katex.min.css";

interface PerfReport {
  profile: string;
  targetCharacters: number;
  actualCharacters: number;
  focusMode: boolean;
  openMs: number;
  settleMs: number;
  typingStartMs: number[];
  typingStartFrameMs: number[];
  typingMs: number[];
  typingFrameMs: number[];
  scrollFrameMs: number[];
  scrollSweepFrameMs: number[];
  nodes: number;
  formulas: number;
  virtualFormulas: number;
  renderedFormulas: number;
  renderedBodyFormulas: number;
  diagrams: number;
  renderedDiagrams: number;
  codeBlocks: number;
  codeEditors: number;
  htmlBlocks: number;
  renderedHtmlBlocks: number;
  loadedImages: number;
  pendingImages: number;
  mathFences: number;
  mermaidFences: number;
  longTasks: Array<{ start: number; duration: number }>;
  heapMb: number | null;
  pluginMs: Array<{ name: string; totalMs: number; calls: number }>;
  nodeBreakdown?: Array<{ name: string; count: number }>;
  diagnostics?: PerfDiagnostics;
}

interface PerfDiagnostics {
  mutationCallbacks: number;
  mutationRecords: number;
  mutationTargets: Array<{ target: string; records: number }>;
  intersectionCallbacks: number;
  intersectionEntries: number;
  intersectingEntries: number;
  firstMutationMs: number | null;
  lastMutationMs: number | null;
  firstIntersectionMs: number | null;
  lastIntersectionMs: number | null;
}

const result = document.querySelector<HTMLElement>("#nota-perf-result");
const root = document.querySelector<HTMLElement>("#editor");
if (!result || !root) throw new Error("performance page mount is missing");

const params = new URLSearchParams(location.search);
const targetCharacters = Math.max(10_000, Number(params.get("size")) || 200_000);
const focusMode = params.get("focus") !== "0";
const profile = params.get("profile") === "rich" ? "rich" : "mixed";
const useExternalFixture = params.get("fixture") === "1";
const openOnly = params.get("openOnly") === "1";
const diagnosticsEnabled = params.get("diag") === "1";
const viewportObserversEnabled = params.get("observers") !== "0";
const skippedObservers = new Set(
  (params.get("skip") ?? "").split(",").filter(Boolean),
);

function shouldSkipObserver(target: Element): boolean {
  return (
    (skippedObservers.has("math") && target.matches(".nota-math")) ||
    (skippedObservers.has("media") && target.matches(".nota-image, .nota-video")) ||
    (skippedObservers.has("html") && target.matches(".nota-html-block")) ||
    (skippedObservers.has("code") && target.matches(".nota-code-wrap")) ||
    (skippedObservers.has("diagram") && target.matches(".nota-diagram"))
  );
}

const diagnostics: PerfDiagnostics | null = diagnosticsEnabled
  ? {
      mutationCallbacks: 0,
      mutationRecords: 0,
      mutationTargets: [],
      intersectionCallbacks: 0,
      intersectionEntries: 0,
      intersectingEntries: 0,
      firstMutationMs: null,
      lastMutationMs: null,
      firstIntersectionMs: null,
      lastIntersectionMs: null,
    }
  : null;

if (diagnostics) {
  const targetCounts = new Map<string, number>();
  const NativeMutationObserver = window.MutationObserver;
  const NativeIntersectionObserver = window.IntersectionObserver;
  const startedAt = performance.now();

  class CountingMutationObserver implements MutationObserver {
    private readonly inner: MutationObserver;

    constructor(callback: MutationCallback) {
      this.inner = new NativeMutationObserver((records) => {
        const now = performance.now() - startedAt;
        diagnostics.mutationCallbacks += 1;
        diagnostics.mutationRecords += records.length;
        diagnostics.firstMutationMs ??= now;
        diagnostics.lastMutationMs = now;
        for (const record of records) {
          const target = record.target instanceof Element
            ? `${record.target.tagName.toLowerCase()}.${[...record.target.classList].join(".")}`
            : record.target.nodeName.toLowerCase();
          targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1);
        }
        callback(records, this);
      });
    }

    disconnect(): void {
      this.inner.disconnect();
    }

    observe(target: Node, options?: MutationObserverInit): void {
      this.inner.observe(target, options);
    }

    takeRecords(): MutationRecord[] {
      return this.inner.takeRecords();
    }
  }

  class CountingIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null;
    readonly rootMargin: string;
    readonly thresholds: readonly number[];
    private readonly inner: IntersectionObserver;
    private readonly skipped = new Set<Element>();

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.inner = new NativeIntersectionObserver((entries) => {
        const now = performance.now() - startedAt;
        diagnostics.intersectionCallbacks += 1;
        diagnostics.intersectionEntries += entries.length;
        diagnostics.intersectingEntries += entries.filter((entry) => entry.isIntersecting).length;
        diagnostics.firstIntersectionMs ??= now;
        diagnostics.lastIntersectionMs = now;
        callback(entries, this);
      }, options);
      this.root = this.inner.root;
      this.rootMargin = this.inner.rootMargin;
      this.thresholds = this.inner.thresholds;
    }

    disconnect(): void {
      this.inner.disconnect();
    }

    observe(target: Element): void {
      if (shouldSkipObserver(target)) {
        this.skipped.add(target);
        return;
      }
      this.inner.observe(target);
    }

    takeRecords(): IntersectionObserverEntry[] {
      return this.inner.takeRecords();
    }

    unobserve(target: Element): void {
      if (this.skipped.delete(target)) return;
      this.inner.unobserve(target);
    }
  }

  window.MutationObserver = CountingMutationObserver;
  if (viewportObserversEnabled) {
    window.IntersectionObserver = CountingIntersectionObserver;
  } else {
    class DisabledIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
      disconnect(): void {}
      observe(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      unobserve(): void {}
    }
    window.IntersectionObserver = DisabledIntersectionObserver;
  }
  Object.defineProperty(diagnostics, "mutationTargets", {
    get() {
      return [...targetCounts]
        .map(([target, records]) => ({ target, records }))
        .sort((a, b) => b.records - a.records)
        .slice(0, 20);
    },
  });
}

mockIPC((command) => {
  if (command === "nota_spell_check") return [];
  if (command === "nota_spell_suggest") return [];
  if (command === "nota_debug_log_write") return undefined;
  return null;
});

function paragraph(index: number): string {
  return `Paragraph ${index} keeps enough words on the line to exercise real text layout, line wrapping and selection geometry in a long document.`;
}

function buildDocument(target: number): string {
  const blocks: string[] = ["# Large document benchmark"];
  let characters = blocks[0].length;
  let index = 0;
  while (characters < target) {
    let block = paragraph(index);
    if (profile === "rich") {
      if (index % 100 === 0) block = `## Section ${index / 100 + 1}`;
      else if (index % 17 === 0) {
        block = `$$\n\\int_0^{${index}}\\frac{x^2+\\sqrt{x}}{1+x^4}\\,dx = \\sum_{k=1}^{${index}}\\frac{1}{k^2}\n$$`;
      } else if (index % 23 === 0) {
        block = `Inline values $a_${index}^2+b_${index}^2=c_${index}^2$ and $\\frac{x+${index}}{x-${index}}$ stay editable.`;
      } else if (index % 37 === 0) {
        block = `\`\`\`mermaid\ngraph TD\nA${index}[Start] --> B${index}[Middle]\nB${index} --> C${index}[End]\nC${index} --> D${index}[Result]\n\`\`\``;
      } else if (index % 29 === 0) {
        block =
          "```typescript\nexport function total(values: number[]): number {\n  return values.reduce((sum, value) => sum + value, 0);\n}\n```";
      } else if (index % 41 === 0) {
        block = `| A | B | C |\n| --- | --- | --- |\n| ${index} | $x^2$ | **value** |`;
      }
    } else if (index % 120 === 0) block = `## Section ${index / 120 + 1}`;
    else if (index % 80 === 0) {
      block = `$$\n\\sum_{k=0}^{${index}} k^2 = \\frac{n(n+1)(2n+1)}{6}\n$$`;
    } else if (index % 200 === 0) {
      block = "```mermaid\ngraph TD\nA[Start] --> B[Middle]\nB --> C[End]\n```";
    } else if (index % 50 === 0) {
      block =
        "```typescript\nexport function total(values: number[]): number {\n  return values.reduce((sum, value) => sum + value, 0);\n}\n```";
    }
    blocks.push(block);
    characters += block.length + 2;
    index += 1;
  }
  return blocks.join("\n\n");
}

function frames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const next = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  });
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

async function run(): Promise<void> {
  const longTasks: Array<{ start: number; duration: number }> = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // Non-Chromium engines do not expose long-task entries.
  }

  const markdown = useExternalFixture
    ? await fetch("/__perf-markdown").then((response) => {
        if (!response.ok) throw new Error(`Fixture request failed: ${response.status}`);
        return response.text();
      })
    : buildDocument(targetCharacters);
  let view: EditorView | null = null;
  const openStarted = performance.now();
  const editor: EditorHandle = await createEditor({
    root,
    initialMarkdown: markdown,
    autoLinks: false,
    autoPair: false,
    defaultIndent: 2,
    emoji: false,
    keyboardExperience: false,
    writingModes: { focus: focusMode, typewriter: false },
    onCommandState: () => undefined,
    onViewReady: (ready) => {
      view = ready;
    },
  });
  await frames(3);
  const openMs = performance.now() - openStarted;

  const settleStarted = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 600));
  await frames(2);
  const settleMs = performance.now() - settleStarted;

  const pluginStats = new Map<string, { totalMs: number; calls: number }>();
  const timed = <Args extends unknown[]>(
    name: string,
    fn: (...args: Args) => unknown,
  ) =>
    (...args: Args) => {
      const started = performance.now();
      try {
        return fn(...args);
      } finally {
        const stat = pluginStats.get(name) ?? { totalMs: 0, calls: 0 };
        stat.totalMs += performance.now() - started;
        stat.calls += 1;
        pluginStats.set(name, stat);
      }
    };
  if (!openOnly && view) {
    for (const plugin of view.state.plugins) {
      const decorations = plugin.props.decorations;
      if (typeof decorations === "function") {
        plugin.props.decorations = timed(
          `${String(plugin.key)} decorations`,
          decorations,
        ) as typeof plugin.props.decorations;
      }
    }
  }
  const typingStartMs: number[] = [];
  const typingStartFrameMs: number[] = [];
  if (!openOnly) {
    editor.focusAtStart();
    await frames();
    for (let index = 0; index < 12; index += 1) {
      const started = performance.now();
      editor.runCommand("insertText", { text: "s" });
      typingStartMs.push(performance.now() - started);
      await frames(1);
      typingStartFrameMs.push(performance.now() - started);
    }

    const middle = Math.max(1, Math.floor(markdown.length / 2));
    editor.restoreSelection({ anchor: middle, head: middle });
    await frames();
  }
  const typingMs: number[] = [];
  const typingFrameMs: number[] = [];
  for (let index = 0; index < (openOnly ? 0 : 24); index += 1) {
    const started = performance.now();
    editor.runCommand("insertText", { text: "x" });
    typingMs.push(performance.now() - started);
    await frames(1);
    typingFrameMs.push(performance.now() - started);
  }

  const scroller = document.querySelector<HTMLElement>(".editor-pane");
  const scrollFrameMs: number[] = [];
  const scrollSweepFrameMs: number[] = [];
  if (scroller && !openOnly) {
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    for (let index = 1; index <= 20; index += 1) {
      const started = performance.now();
      scroller.scrollTop = maximum * (index / 20);
      await frames(1);
      scrollFrameMs.push(performance.now() - started);
    }
    scroller.scrollTop = 0;
    await frames(2);
    const sweepStep = Math.max(200, scroller.clientHeight * 0.4);
    for (let index = 0; index < 120; index += 1) {
      const before = scroller.scrollTop;
      const started = performance.now();
      scroller.scrollTop += sweepStep;
      await frames(1);
      scrollSweepFrameMs.push(performance.now() - started);
      if (scroller.scrollTop === before) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    await frames(2);
  }

  const heap = (performance as Performance & {
    memory?: { usedJSHeapSize: number };
  }).memory?.usedJSHeapSize;
  const nodeCounts = new Map<string, number>();
  if (diagnosticsEnabled) {
    for (const element of root.querySelectorAll("*")) {
      const name = element.classList.length
        ? `${element.tagName.toLowerCase()}.${[...element.classList].join(".")}`
        : element.tagName.toLowerCase();
      nodeCounts.set(name, (nodeCounts.get(name) ?? 0) + 1);
    }
  }
  const report: PerfReport = {
    profile: useExternalFixture ? "external-fixture" : profile,
    targetCharacters,
    actualCharacters: markdown.length,
    focusMode,
    openMs,
    settleMs,
    typingStartMs,
    typingStartFrameMs,
    typingMs,
    typingFrameMs,
    scrollFrameMs,
    scrollSweepFrameMs,
    nodes: root.querySelectorAll("*").length,
    formulas: root.querySelectorAll(".nota-math").length,
    virtualFormulas: root.querySelectorAll(".nota-math-virtual").length,
    renderedFormulas: root.querySelectorAll(".katex").length,
    renderedBodyFormulas: root.querySelectorAll(".nota-math-render .katex").length,
    diagrams: root.querySelectorAll(".nota-diagram").length,
    renderedDiagrams: root.querySelectorAll(".nota-diagram-preview svg").length,
    codeBlocks: root.querySelectorAll(".nota-code-cm").length,
    codeEditors: root.querySelectorAll(".cm-editor").length,
    htmlBlocks: root.querySelectorAll(".nota-html-block").length,
    renderedHtmlBlocks: root.querySelectorAll('.nota-html-render[data-state="ready"]').length,
    loadedImages: root.querySelectorAll("img[src]").length,
    pendingImages: root.querySelectorAll(".nota-image img:not([src])").length,
    mathFences: (markdown.match(/^\$\$/gm) ?? []).length,
    mermaidFences: (markdown.match(/^```mermaid$/gm) ?? []).length,
    longTasks,
    heapMb: heap ? heap / 1048576 : null,
    pluginMs: [...pluginStats]
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 12),
    ...(diagnosticsEnabled
      ? {
          nodeBreakdown: [...nodeCounts]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30),
        }
      : {}),
    ...(diagnostics ? { diagnostics } : {}),
  };

  editor.destroy();
  result.dataset.status = "passed";
  result.dataset.report = JSON.stringify(report);
  result.textContent = [
    `open ${openMs.toFixed(1)}ms`,
    `settle ${settleMs.toFixed(1)}ms`,
    `typing start p50 ${percentile(typingStartMs, 0.5).toFixed(2)}ms`,
    `typing p50 ${percentile(typingMs, 0.5).toFixed(2)}ms`,
    `typing p95 ${percentile(typingMs, 0.95).toFixed(2)}ms`,
    `typing frame p95 ${percentile(typingFrameMs, 0.95).toFixed(2)}ms`,
    `scroll frame p95 ${percentile(scrollFrameMs, 0.95).toFixed(1)}ms`,
    `scroll sweep median ${percentile(scrollSweepFrameMs, 0.5).toFixed(1)}ms`,
    `nodes ${report.nodes}`,
    `math ${report.formulas}, rendered body ${report.renderedBodyFormulas}, virtual ${report.virtualFormulas}`,
    `mermaid fences ${report.mermaidFences}, rendered SVG ${report.renderedDiagrams}`,
  ].join("\n");
}

void run().catch((error: unknown) => {
  result.dataset.status = "failed";
  result.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
});
