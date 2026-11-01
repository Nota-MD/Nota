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

async function mount(
  markdown: string,
  options: { autoLinks?: boolean; autoPair?: boolean } = {},
): Promise<HTMLElement> {
  editor?.destroy();
  editorHost.replaceChildren();
  editor = await createEditor({
    root: editorHost,
    initialMarkdown: markdown,
    autoLinks: options.autoLinks ?? true,
    autoPair: options.autoPair ?? true,
    emoji: true,
    selfActionMoreCorrect: true,
  });
  const prose = await waitFor<HTMLElement>(".ProseMirror");
  editor.focusAtStart();
  await nextFrames();
  return prose;
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
    ...init,
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

async function pasteText(text: string): Promise<void> {
  const data = new DataTransfer();
  data.setData("text/plain", text);
  const event = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: data,
  });
  const target = document.querySelector<HTMLElement>(".ProseMirror");
  if (!target) throw new Error("The editor has no ProseMirror target");
  target.dispatchEvent(event);
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
  await sleep(150);
}

async function openInlineMath(index = 0): Promise<HTMLInputElement> {
  const deadline = performance.now() + 5000;
  let render: HTMLElement | undefined;
  for (;;) {
    render = document.querySelectorAll<HTMLElement>(
      ".nota-math-inline .nota-math-render",
    )[index];
    if (render || performance.now() > deadline) break;
    await sleep(20);
  }
  assert(
    render,
    `inline math ${index} did not render; markdown=${JSON.stringify(editor?.getMarkdown())}; ` +
      `html=${JSON.stringify(document.querySelector(".ProseMirror")?.innerHTML)}`,
  );
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
    name: "Enter recognizes a bare URL before creating the next paragraph",
    async run() {
      const prose = await mount("");
      await typeText("https://example.com");
      press(prose, "Enter");
      await nextFrames();
      const link = await waitFor<HTMLAnchorElement>('a[href="https://example.com"]');
      assertEqual(link.textContent, "https://example.com", "URL text changed during auto-linking");
      await typeText("next");
      await nextFrames();
      assertEqual(link.textContent, "https://example.com", "following text joined the link");
      assert(
        serialized().includes("next"),
        `following text was not inserted into the next paragraph: ${serialized()}`,
      );
    },
  },
  {
    name: "Enter recognizes an email as a mailto link",
    async run() {
      const prose = await mount("");
      await typeText("hi@nota.app");
      press(prose, "Enter");
      await nextFrames();
      const link = await waitFor<HTMLAnchorElement>('a[href="mailto:hi@nota.app"]');
      assertEqual(link.textContent, "hi@nota.app", "email display text changed");
    },
  },
  {
    name: "Space and paste use the same automatic-link rules",
    async run() {
      await mount("");
      await typeText("www.example.com");
      await requestNativeKey("space-auto-link");
      const spaced = await waitFor<HTMLAnchorElement>(".ProseMirror a");
      assertEqual(spaced.getAttribute("href"), "https://www.example.com", "www link href");
      await mount("");
      await pasteText("hi@nota.app");
      const pasted = await waitFor<HTMLAnchorElement>('a[href="mailto:hi@nota.app"]');
      assertEqual(pasted.textContent, "hi@nota.app", "pasted email display text changed");
    },
  },
  {
    name: "Enter keeps Chinese trailing punctuation outside an auto-link",
    async run() {
      const prose = await mount("");
      await typeText("https://example.com，");
      press(prose, "Enter");
      await nextFrames();
      const link = await waitFor<HTMLAnchorElement>('a[href="https://example.com"]');
      assertEqual(link.textContent, "https://example.com", "Chinese comma joined the link");
      assert(
        serialized().includes("<https://example.com>，"),
        `Chinese comma was lost from Markdown: ${serialized()}`,
      );
    },
  },
  {
    name: "disabling automatic links leaves URL and email text unchanged",
    async run() {
      const prose = await mount("", { autoLinks: false });
      await typeText("https://example.com hi@nota.app");
      await pasteText("https://paste.example.com");
      press(prose, "Enter");
      await nextFrames();
      assertEqual(document.querySelectorAll(".ProseMirror a").length, 0, "links were created while disabled");
    },
  },
  {
    name: "bracket pairing inserts, skips and wraps using one setting",
    async run() {
      await mount("");
      await typeText("(");
      assertEqual(serialized(), "()", "opening parenthesis did not insert its pair");
      await typeText("x)");
      assertEqual(serialized(), "(x)", "typed closing parenthesis duplicated the pair");

      await mount("word");
      editor!.runCommand("selectLine");
      await nextFrames();
      await typeText("(");
      assertEqual(serialized(), "(word)", "bracket did not wrap the selected text");

      await mount("");
      await typeText("【");
      await typeText("中");
      assertEqual(serialized(), "【中】", "full-width bracket pairing failed");
    },
  },
  {
    name: "Backspace removes an empty auto-pair in one step",
    async run() {
      const prose = await mount("");
      await typeText("(");
      assertEqual(serialized(), "()", "test setup did not create an empty pair");
      press(prose, "Backspace");
      await nextFrames();
      assertEqual(serialized(), "", "Backspace left half of the empty bracket pair");
    },
  },
  {
    name: "Tab and Shift+Tab cross an adjacent bracket without editing",
    async run() {
      const prose = await mount("");
      await typeText("(");
      await typeText("x");
      press(prose, "Tab");
      await typeText("Y");
      assertEqual(serialized(), "(x)Y", "Tab did not cross the closing bracket");

      const reversed = await mount("");
      await typeText("(");
      press(reversed, "Tab", { shiftKey: true });
      await typeText("Z");
      assertEqual(serialized(), "Z()", "Shift+Tab did not cross the opening bracket");
    },
  },
  {
    name: "disabling bracket pairing leaves typed brackets alone",
    async run() {
      await mount("", { autoPair: false });
      await typeText("(");
      await typeText("x");
      assertEqual(serialized(), "(x", "brackets were paired while the setting was disabled");
    },
  },
  {
    name: "smart quote pairing keeps apostrophes and original closers intact",
    async run() {
      await mount("");
      await typeText('"hello"');
      assertEqual(serialized(), "“hello”", "straight quote keys did not form one curly pair");

      await mount("");
      await typeText("don't");
      assertEqual(serialized(), "don’t", "single quote after a word became a pair instead of an apostrophe");

      await mount("");
      await typeText("https://example.com/a(b");
      assertEqual(
        document.querySelector(".ProseMirror")?.textContent,
        "https://example.com/a(b",
        "bracket pairing changed a URL",
      );
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
    name: "Escape exits inline math before the next input",
    async run() {
      await mount("$x$");
      const input = await openInlineMath();
      press(input, "Escape");
      await nextFrames();
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(serialized(), "$x$Z", "Escape did not move the caret outside the formula");
    },
  },
  {
    name: "inline math inside a bold span keeps following text in that span",
    async run() {
      await mount("**a$x$b**");
      const input = await openInlineMath();
      press(input, "ArrowRight");
      await nextFrames();
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(
        serialized(),
        "**a$x$Zb**",
        "text typed after the formula escaped its enclosing bold span; " +
          `formula-parent=${JSON.stringify(document.querySelector(".nota-math-inline")?.parentElement?.outerHTML)}`,
      );
    },
  },
  {
    name: "bold spans keep embedded inline code and links intact",
    async run() {
      await mount("**a `code` b**");
      assert(
        document.querySelector("strong code") !== null,
        "inline code moved outside the bold span",
      );
      assertEqual(serialized(), "**a `code` b**", "bold span with inline code changed");

      await mount("**a [链接](https://example.com) b**");
      assert(
        document.querySelector("strong a[href]") !== null,
        "link moved outside the bold span",
      );
      assertEqual(
        serialized(),
        "**a [链接](https://example.com) b**",
        "bold span with link changed",
      );
    },
  },
  {
    name: "code blocks keep a visible caret and a stable mono font",
    async run() {
      await mount("```js\nconst x = 1;\n```");
      const content = await waitFor<HTMLElement>(".nota-code-cm .cm-content");
      const line = await waitFor<HTMLElement>(".nota-code-cm .cm-line");
      const before = getComputedStyle(line);
      const beforeSize = before.fontSize;
      const beforeFamily = before.fontFamily;
      content.focus();
      content.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: line.getBoundingClientRect().left + 4,
          clientY: line.getBoundingClientRect().top + 4,
        }),
      );
      await nextFrames();
      const cursor = await waitFor<HTMLElement>(".nota-code-cm .cm-cursor");
      content.focus();
      await nextFrames();
      const after = getComputedStyle(line);
      const cursorStyle = getComputedStyle(cursor);
      assertEqual(after.fontSize, beforeSize, "code font size changed when the block gained focus");
      assertEqual(after.fontFamily, beforeFamily, "code font family changed when the block gained focus");
      assert(cursorStyle.display !== "none", "focused code block did not draw a caret");
      assert(cursorStyle.visibility !== "hidden", "focused code block caret is hidden");
      assert(
        parseFloat(cursorStyle.borderLeftWidth) >= 1,
        "focused code block caret has no visible stroke",
      );
    },
  },
  {
    name: "failed images show an inline warning",
    async run() {
      await mount("![bad-image](data:image/png;base64,not-an-image)");
      const warning = await waitFor<HTMLElement>(".nota-media-error:not([hidden])");
      assert(
        warning.textContent?.includes("data:image/png"),
        `image failure warning did not identify the source: ${warning.textContent}`,
      );
      assertEqual(serialized(), "![bad-image](data:image/png;base64,not-an-image)", "warning changed Markdown");
    },
  },
  {
    name: "selected image has a direct delete control",
    async run() {
      await mount(
        "![pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8WQAAAAASUVORK5CYII=)",
      );
      const image = await waitFor<HTMLImageElement>(".nota-image img");
      image.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
      );
      await nextFrames();
      const remove = await waitFor<HTMLButtonElement>(".nota-image.is-selected .nota-media-delete");
      remove.click();
      await nextFrames();
      assertEqual(serialized(), "", "delete button did not remove the image node");
    },
  },
  {
    name: "leaving inline math inside link text keeps following text linked",
    async run() {
      await mount("[$x$](https://example.com)");
      const input = await openInlineMath();
      press(input, "ArrowRight");
      await nextFrames();
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(
        serialized(),
        "[$x$Z](https://example.com)",
        "text after the formula escaped its enclosing link",
      );
    },
  },
  {
    name: "right at the end of adjacent inline math stops between formulas",
    async run() {
      await mount("$a$\\(b\\)");
      const input = await openInlineMath();
      press(input, "ArrowRight");
      await nextFrames();
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(
        serialized(),
        "$a$Z\\(b\\)",
        "leaving the first formula skipped or entered the adjacent formula",
      );
    },
  },
  {
    name: "Home exits an inline formula and reaches the paragraph content start",
    async run() {
      const prose = await mount("**$x$**");
      const input = await openInlineMath();
      press(input, "ArrowRight");
      await nextFrames();
      press(prose, "Home");
      await nextFrames();
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(
        serialized(),
        "**Z$x$**",
        "Home stopped at the formula instead of the paragraph content start",
      );
    },
  },
  {
    name: "Backspace at a heading content start returns it to a paragraph",
    async run() {
      const prose = await mount("### 标题");
      press(prose, "Backspace");
      await nextFrames();
      await typeText("Z");
      assertEqual(serialized(), "Z标题", "the heading marker was not removed in one step");
    },
  },
  {
    name: "Space at a quote open head removes every quote layer",
    async run() {
      const prose = await mount("> > 引用");
      press(prose, " ");
      await nextFrames();
      await typeText("Z");
      assertEqual(serialized(), "Z引用", "quote layers remained, or the space leaked into text");
    },
  },
  {
    name: "Enter commits a pending heading prefix and starts the next paragraph",
    async run() {
      const prose = await mount("");
      await typeText("# 标题");
      press(prose, "Enter");
      await nextFrames();
      await typeText("next");
      assertEqual(
        serialized(),
        "# 标题\n\nnext",
        "pending heading did not commit on Enter or swallowed the following paragraph",
      );
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
