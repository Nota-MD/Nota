import { mockIPC } from "@tauri-apps/api/mocks";

import { createEditor, type EditorHandle } from "@/editor/create";

import "@/styles/theme.css";
import "@/styles/app.css";
import "@/styles/editor.css";
import "@/styles/editor-inline.css";
import "@/styles/editor-blocks.css";
import "@/styles/code-block.css";
import "@/styles/marks.css";
import "@/styles/diagram.css";
import "@/styles/math.css";
import "katex/dist/katex.min.css";

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const host = document.querySelector<HTMLElement>("#editor");
const report = document.querySelector<HTMLElement>("#nota-e2e-report");
if (!host || !report) throw new Error("E2E page is missing its editor or report mount");
const editorHost = host;
const resultReport = report;

let nativeSignal = "";
const nativeWaiters = new Map<string, () => void>();
Object.assign(window, {
  __notaE2E: {
    signalNativeKey(name: string) {
      nativeSignal = name;
      nativeWaiters.get(name)?.();
    },
  },
});

let editor: EditorHandle | null = null;

mockIPC((command) => {
  if (command === "nota_spell_check") return [];
  if (command === "nota_debug_log_write") return undefined;
  if (command === "nota_spell_suggest") return [];
  return null;
});

function sleep(ms = 0): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function nextFrames(count = 2): Promise<void> {
  for (let index = 0; index < count; index++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await sleep(0);
}

async function waitFor<T extends Element>(selector: string, timeout = 5000): Promise<T> {
  const started = performance.now();
  for (;;) {
    const found = document.querySelector<T>(selector);
    if (found) return found;
    if (performance.now() - started > timeout) {
      throw new Error(`Timed out waiting for ${selector}`);
    }
    await sleep(20);
  }
}

async function mount(markdown: string): Promise<HTMLElement> {
  editor?.destroy();
  editorHost.replaceChildren();
  editor = await createEditor({
    root: editorHost,
    initialMarkdown: markdown,
    emoji: true,
    selfActionMoreCorrect: true,
  });
  const prose = await waitFor<HTMLElement>(".ProseMirror");
  editor.focusAtStart();
  await nextFrames();
  return prose;
}

function press(target: EventTarget, key: string): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
  });
  return target.dispatchEvent(event);
}

async function typeText(text: string): Promise<void> {
  for (const character of text) {
    if (!document.execCommand("insertText", false, character)) {
      throw new Error(`Browser refused to insert ${JSON.stringify(character)}`);
    }
    await sleep(12);
  }
  await nextFrames();
}

async function requestNativeKey(name: string): Promise<void> {
  document.documentElement.dataset.e2eNativeKey = name;
  if (nativeSignal === name) {
    delete document.documentElement.dataset.e2eNativeKey;
    return;
  }
  await new Promise<void>((resolveSignal) => nativeWaiters.set(name, resolveSignal));
  nativeWaiters.delete(name);
  delete document.documentElement.dataset.e2eNativeKey;
  await nextFrames();
}

async function openInlineMath(): Promise<HTMLInputElement> {
  const render = await waitFor<HTMLElement>(".nota-math-inline .nota-math-render");
  render.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: render.getBoundingClientRect().left + 4,
      clientY: render.getBoundingClientRect().top + 4,
    }),
  );
  render.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }),
  );
  render.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }),
  );
  await nextFrames();
  const input = await waitFor<HTMLInputElement>(".nota-math-panel input.nota-math-source");
  input.focus();
  await nextFrames();
  return input;
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function serialized(): string {
  return editor!.getMarkdown().replace(/\n$/, "");
}

function readableWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ");
}

const tests: Array<{ name: string; run: () => Promise<void> }> = [
  {
    name: "inline mark Left reaches the real paragraph start",
    async run() {
      const prose = await mount("**1**");
      press(prose, "ArrowRight");
      press(prose, "ArrowRight");
      press(prose, "ArrowLeft");
      press(prose, "ArrowLeft");
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(serialized(), "Z**1**", "Left did not cross both opening syntax atoms");
    },
  },
  {
    name: "Home reaches the real paragraph start inside a mark",
    async run() {
      const prose = await mount("**1**");
      press(prose, "ArrowRight");
      press(prose, "ArrowRight");
      press(prose, "Home");
      editor!.insertAtCursorPlace("H");
      await nextFrames();
      assertEqual(serialized(), "H**1**", "Home did not reach the paragraph start");
    },
  },
  {
    name: "Right at inline math source end exits before following text",
    async run() {
      await mount("$x$");
      const input = await openInlineMath();
      input.setSelectionRange(input.value.length, input.value.length);
      press(input, "ArrowRight");
      await nextFrames();
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(serialized(), "$x$Z", "following text was appended inside the formula");
    },
  },
  {
    name: "Left at inline math source start exits before the formula",
    async run() {
      await mount("$x$");
      const input = await openInlineMath();
      input.setSelectionRange(0, 0);
      press(input, "ArrowLeft");
      await nextFrames();
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(serialized(), "Z$x$", "text before the formula was appended inside the formula");
    },
  },
  {
    name: "alternate inline math delimiters share the same caret boundaries",
    async run() {
      for (const [source, expected] of [
        ["\\(x\\)", "Z\\(x\\)"],
        ["\\[x\\]", "Z\\[x\\]"],
      ] as const) {
        await mount(source);
        const input = await openInlineMath();
        input.setSelectionRange(0, 0);
        press(input, "ArrowLeft");
        await nextFrames();
        editor!.insertAtCursorPlace("Z");
        await nextFrames();
        assertEqual(serialized(), expected, `${source} did not keep its delimiter or left boundary`);
      }
    },
  },
  {
    name: "trailing backslash adds only a visual gap before closing dollar",
    async run() {
      await mount("$x$");
      const input = await openInlineMath();
      input.value = "x\\";
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "\\" }));
      await nextFrames();

      const root = await waitFor<HTMLElement>(".nota-math-inline");
      const closing = await waitFor<HTMLElement>(".nota-math-delim-close");
      const inputBox = await waitFor<HTMLElement>(".nota-math-inline .nota-math-source");
      const sourceRight = inputBox.getBoundingClientRect().right;
      const closingLeft = closing.getBoundingClientRect().left;
      assert(root.classList.contains("nota-math-trailing-backslash"), "trailing-backslash state was not applied");
      assertEqual(input.value, "x\\", "the source input gained a display-only byte");
      assertEqual(closing.textContent, "$", "the closing delimiter changed text");
      assert(closingLeft - sourceRight > 1, `no visual gap before closing dollar: ${closingLeft - sourceRight}px`);
      assertEqual(
        [...editor!.getMarkdown()].filter((character) => character === "\\").length,
        1,
        "the display gap changed the serialized source",
      );
    },
  },
  {
    name: "smart punctuation converts dashes without breaking horizontal rules",
    async run() {
      await mount("");
      await typeText("a--b");
      assertEqual(serialized(), "a–b", "typed double dash did not become an en dash");

      const ruleProse = await mount("");
      await typeText("---");
      assert(ruleProse.querySelector("hr") !== null, "three dashes did not create a horizontal rule");
      assert(!editor!.getMarkdown().includes("–"), "horizontal-rule dashes were converted to a dash");
    },
  },
  {
    name: "auto correction replaces a misspelling and one undo restores it",
    async run() {
      await mount("");
      const trace = [serialized()];
      for (const character of "x teh") {
        await typeText(character);
        trace.push(serialized());
      }
      await requestNativeKey("space");
      trace.push(serialized());
      assertEqual(
        readableWhitespace(serialized()),
        "x the ",
        `misspelling was not corrected on the trailing space; trace=${JSON.stringify(trace)}`,
      );
      editor!.runCommand("undo");
      await nextFrames();
      assertEqual(
        readableWhitespace(serialized()),
        "x teh ",
        "one undo did not restore the original misspelling",
      );
    },
  },
  {
    name: "emoji autocomplete opens and accepts with the keyboard",
    async run() {
      const prose = await mount("");
      await typeText(":sm");
      const panel = await waitFor<HTMLElement>(".nota-emoji-pop");
      const choices = panel.querySelectorAll(".nota-emoji-item");
      assert(choices.length >= 2, "emoji autocomplete did not offer enough candidates");
      const firstSelected = panel.querySelector(".nota-emoji-item.is-on")?.textContent ?? "";
      press(prose, "ArrowDown");
      await nextFrames();
      const secondSelected = panel.querySelector(".nota-emoji-item.is-on")?.textContent ?? "";
      assert(firstSelected !== secondSelected, "ArrowDown did not move the emoji selection");
      press(prose, "Enter");
      await nextFrames();
      assert(!editor!.getMarkdown().includes(":sm"), "accepted emoji left the shortcode prefix in the document");
    },
  },
  {
    name: "footnote command inserts a reference, definition, and editable body",
    async run() {
      await mount("正文");
      editor!.runCommand("footnote");
      await nextFrames();
      await typeText("注");
      const markdown = editor!.getMarkdown();
      assert(markdown.includes("[^1]"), "footnote reference was not serialized");
      assert(/\[\^1\]:\s*注/.test(markdown), `footnote definition did not receive typed text: ${markdown}`);
      assert(document.querySelector('sup[data-type="footnote_reference"]') !== null, "reference node was not rendered");
      assert(document.querySelector('dl[data-type="footnote_definition"]') !== null, "definition node was not rendered");
    },
  },
];

function encodeResult(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function writeReport(results: TestResult[]): void {
  const failed = results.filter((result) => !result.passed);
  resultReport.dataset.status = failed.length === 0 ? "passed" : "failed";
  resultReport.dataset.count = String(results.length);
  resultReport.dataset.report = encodeResult(results);
  resultReport.textContent = results
    .map((result) => `${result.passed ? "PASS" : "FAIL"} ${result.name}${result.passed ? "" : `\n  ${result.detail}`}`)
    .join("\n");
}

async function main(): Promise<void> {
  const results: TestResult[] = [];
  for (const test of tests) {
    try {
      await test.run();
      results.push({ name: test.name, passed: true, detail: "" });
    } catch (error) {
      results.push({
        name: test.name,
        passed: false,
        detail: error instanceof Error ? error.stack ?? error.message : String(error),
      });
    }
  }
  editor?.destroy();
  writeReport(results);
}

void main().catch((error: unknown) => {
  resultReport.dataset.status = "failed";
  resultReport.dataset.count = "0";
  resultReport.dataset.report = encodeResult([
    {
      name: "E2E harness",
      passed: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error),
    },
  ]);
  resultReport.textContent = `FAIL E2E harness\n${String(error)}`;
});
