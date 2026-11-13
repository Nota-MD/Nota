import { mockIPC } from "@tauri-apps/api/mocks";
import { EditorView } from "@codemirror/view";

import { createEditor, type EditorHandle } from "@/editor/create";
import { applyDocTheme } from "@/styles/doc-theme";

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
  options: {
    autoLinks?: boolean;
    autoPair?: boolean;
    defaultIndent?: number;
    keyboardExperience?: boolean;
    vim?: boolean;
  } = {},
): Promise<HTMLElement> {
  editor?.destroy();
  editorHost.replaceChildren();
  editor = await createEditor({
    root: editorHost,
    initialMarkdown: markdown,
    autoLinks: options.autoLinks ?? true,
    autoPair: options.autoPair ?? false,
    defaultIndent: options.defaultIndent ?? 2,
    emoji: true,
    selfActionMoreCorrect: true,
    keyboardExperience: options.keyboardExperience ?? false,
    vimInput: options.vim
      ? {
          config: {
            kind: "vim",
            enabled: true,
            plugin: "nota.vim",
            profile: null,
          },
        }
      : undefined,
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

async function composeText(text: string): Promise<void> {
  const target = document.querySelector<HTMLElement>(".ProseMirror");
  if (!target) throw new Error("The editor has no ProseMirror target");
  target.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
  await typeText(text);
  target.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
  await sleep(140);
  await nextFrames();
}

async function requestNativeKey(name: string): Promise<void> {
  document.documentElement.dataset.e2eNativeKey = name;
  if (nativeSignal === name) {
    delete document.documentElement.dataset.e2eNativeKey;
    nativeSignal = "";
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
    name: "Left from bold content start traverses both opening stars to paragraph start",
    async run() {
      const prose = await mount("**1**");
      press(prose, "ArrowLeft");
      press(prose, "ArrowLeft");
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(
        serialized(),
        "Z**1**",
        "Left did not traverse the opening marker in source character order",
      );
    },
  },
  {
    name: "the nearest strong delimiter closes the run before later stars",
    async run() {
      const prose = await mount(
        "**Tauri 2*. Approach **Typora** spiritually.",
      );
      const strong = prose.querySelector<HTMLElement>("p > strong");
      assert(strong, "the nearest strong delimiter did not create strong text");
      assertEqual(
        strong.textContent,
        "Tauri 2*. Approach ",
        "the strong run ended at the wrong delimiter",
      );
      assert(
        prose.textContent?.endsWith("Typora** spiritually."),
        `the remaining stars were not preserved literally: ${
          JSON.stringify(prose.textContent)
        }`,
      );
    },
  },
  {
    name: "Typora theme colours bridge into document paper and code tokens",
    async run() {
      applyDocTheme(`
        :root {
          --bg-color: #ffffff;
          --text-color: #111111;
          --code-bg-color: #fbfaf7;
          --syntax-keyword-color: #2f3c61;
        }
        pre.md-fences .cm-keyword { color: var(--syntax-keyword-color); }
      `);
      document.documentElement.dataset.editorFontSize = "custom";
      document.documentElement.style.setProperty("--editor-font-size", "26px");
      try {
        await mount("```js\nconst answer = 42;\n```\n\n```mermaid\ngraph TD; A[Start] --> B[End];\n```");
        const keyword = await waitFor<HTMLElement>(
          ".nota-code-cm .token.keyword",
          10_000,
        );
        const preview = await waitFor<HTMLElement>(".nota-diagram-preview");
        const paper = getComputedStyle(
          document.querySelector<HTMLElement>(".editor-pane")!,
        ).getPropertyValue("--doc-bg").trim();
        const code = getComputedStyle(keyword.closest("pre")!)
          .getPropertyValue("--code-bg-color")
          .trim();
        const token = getComputedStyle(keyword).color;
        const diagramPaper = getComputedStyle(preview).backgroundColor;
        const bodySize = getComputedStyle(
          document.querySelector<HTMLElement>(".ProseMirror")!,
        ).fontSize;
        assertEqual(paper, "#ffffff", "Typora document paper was not bridged");
        assertEqual(code, "#fbfaf7", "Typora code background was not bridged");
        assertEqual(token, "rgb(47, 60, 97)", "Typora syntax colour was not applied");
        assertEqual(diagramPaper, "rgb(255, 255, 255)", "diagram inherited the UI paper");
        assertEqual(bodySize, "26px", "custom editor size lost to the Typora root");
      } finally {
        delete document.documentElement.dataset.editorFontSize;
        document.documentElement.style.removeProperty("--editor-font-size");
        applyDocTheme(null);
      }
    },
  },
  {
    name: "bold closing markers render after the caret at the inner boundary",
    async run() {
      await mount("**1**");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 3, head: 3 }),
        "caret did not start at the bold content boundary",
      );
      await requestNativeKey("arrow-right-inner");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 4, head: 4 }),
        "Right did not stop between the two closing stars",
      );
      await requestNativeKey("arrow-right-outer");
      await nextFrames();
      editor!.insertAtCursorPlace("X");
      await nextFrames();
      assertEqual(serialized(), "**1**X", "Right did not exit the closing marker boundary");
    },
  },
  {
    name: "Backspace before a bold closing marker deletes text, not the marker group",
    async run() {
      await mount("**abc**");
      await nextFrames();
      for (let index = 0; index < 3; index++) {
        await requestNativeKey(`arrow-right-${index}`);
        await nextFrames();
      }
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 6, head: 6 }),
        "caret did not reach the bold content end",
      );
      await requestNativeKey("backspace");
      await nextFrames();
      assertEqual(serialized(), "**ab**", "Backspace removed the whole bold marker group");
      assertEqual(
        document.querySelector(".ProseMirror strong")?.textContent,
        "ab",
        "bold formatting was lost with the deleted character",
      );
    },
  },
  {
    name: "Delete at a bold inner boundary does not flash the closing stars",
    async run() {
      await mount("**abc**");
      await nextFrames();
      for (let index = 0; index < 3; index++) {
        await requestNativeKey(`arrow-right-delete-${index}`);
        await nextFrames();
      }
      await requestNativeKey("delete");
      await nextFrames();
      await requestNativeKey("delete");
      await nextFrames();
      assertEqual(serialized(), "**abc*", "Delete did not remove exactly one closing star");
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 6, head: 6 }),
        "Delete moved the caret away from the content boundary",
      );
    },
  },
  {
    name: "Delete at a bold opening marker removes one source character",
    async run() {
      const prose = await mount("**the**");
      press(prose, "Home");
      await nextFrames();
      await requestNativeKey("delete");
      await nextFrames();
      assertEqual(
        serialized(),
        "*the**",
        "Delete did not remove exactly one opening star",
      );
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 2, head: 2 }),
        "Delete did not leave the caret after the remaining literal star",
      );
    },
  },
  {
    name: "Backspace at a bold opening marker removes one source character",
    async run() {
      await mount("**the**");
      await nextFrames();
      await requestNativeKey("backspace-opening-bold");
      await nextFrames();
      assertEqual(
        serialized(),
        "*the**",
        "Backspace did not remove exactly one opening star",
      );
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 2, head: 2 }),
        "Backspace did not leave the caret after the remaining literal star",
      );
    },
  },
  {
    name: "Backspace after a closing marker removes exactly one star and keeps the caret after it",
    async run() {
      const prose = await mount("**men**");
      press(prose, "End");
      await nextFrames();
      await requestNativeKey("backspace-after-bold");
      await nextFrames();
      assertEqual(serialized(), "**men*", "Backspace did not leave one literal closing star");
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 7, head: 7 }),
        "caret jumped back into the bold content after deleting one closing star",
      );
    },
  },
  {
    name: "Left from outside a bold mark, then through its closing group",
    async run() {
      const prose = await mount("**the**");
      press(prose, "End");
      await nextFrames();
      await requestNativeKey("arrow-left-from-bold-end");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 7, head: 7 }),
        "first Left did not stop between the two closing stars",
      );
      assertEqual(
        document.querySelectorAll('.nota-syntax-marker[data-side="right"]').length,
        2,
        "closing marker pair disappeared on entering its inner side",
      );
      await requestNativeKey("arrow-left-into-bold");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 6, head: 6 }),
        "second Left did not stop before the whole closing group",
      );
      await requestNativeKey("arrow-left-into-text");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 5, head: 5 }),
        "third Left did not enter the bold text by one character",
      );
    },
  },
  {
    name: "Left from following text reveals the closing group before entering it",
    async run() {
      const prose = await mount("**the**a");
      press(prose, "End");
      await nextFrames();
      assert(
        prose.querySelectorAll(
          '.nota-syntax-marker[data-side="right"]:not(.nota-syntax-active)',
        ).length > 0,
        "closing delimiter nodes disappeared when the caret left the mark",
      );
      await requestNativeKey("arrow-left-following-bold");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 8, head: 8 }),
        "first Left did not stop outside the revealed closing group",
      );
      assertEqual(
        prose.querySelectorAll(
          '.nota-syntax-marker[data-side="right"]:not(.nota-syntax-active)',
        ).length,
        0,
        "revealed closing group remained visually hidden",
      );
      await requestNativeKey("arrow-left-inside-bold-close");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 7, head: 7 }),
        "second Left did not stop between the closing stars",
      );
      await requestNativeKey("arrow-left-before-bold-close");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 6, head: 6 }),
        "third Left did not stop before the closing group",
      );
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(
        serialized(),
        "**theZ**a",
        "Left did not traverse the closing group in Typedown source order",
      );
    },
  },
  {
    name: "typing after bold preserves its hidden closing group boundaries",
    async run() {
      const prose = await mount("**the**a");
      press(prose, "End");
      await typeText("b");
      await nextFrames();
      assert(
        prose.querySelectorAll(
          '.nota-syntax-marker[data-side="right"]:not(.nota-syntax-active)',
        ).length > 0,
        "editing following text removed the hidden closing delimiter nodes",
      );
      await requestNativeKey("arrow-left-after-following-edit-1");
      await nextFrames();
      await requestNativeKey("arrow-left-after-following-edit-2");
      await nextFrames();
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(
        serialized(),
        "**the**Zab",
        "typing after bold collapsed the caret boundary outside its closing group",
      );
    },
  },
  {
    name: "HTML source editor keeps its code beside the line-number gutter",
    async run() {
      const previousLineNumbers =
        document.documentElement.dataset.codeLineNumbers;
      document.documentElement.dataset.codeLineNumbers = "on";
      try {
      const html = `<p align="center">
  <a href="https://github.com/Nota-MD/Nota/releases">
    <img alt="Release" src="https://img.shields.io/badge/release-v0.13.0--beta-e95420?style=flat-square">
  </a>
  <a href="LICENSE">
    <img alt="License" src="https://img.shields.io/badge/license-BSD--2--Clause-2e3440?style=flat-square">
  </a>
  <a href="https://github.com/Nota-MD/Nota/releases">
    <img alt="Platforms" src="https://img.shields.io/badge/platforms-Linux%20%7C%20Windows-5e6272?style=flat-square">
  </a>
  <a href="https://github.com/Nota-MD/Nota-plugins">
    <img alt="Extensions" src="https://img.shields.io/badge/extensions-Nota--plugins-6f42c1?style=flat-square">
  </a>
  <a href="https://github.com/Nota-MD/Nota-themes">
    <img alt="Themes" src="https://img.shields.io/badge/themes-Nota--themes-eda870?style=flat-square">
  </a>
</p>`;
      await mount(html);
      const toggle = await waitFor<HTMLButtonElement>(".nota-html-source-toggle");
      toggle.click();
      await waitFor(".nota-html-source .cm-editor");
      await nextFrames();
      const source = document.querySelector<HTMLElement>(".nota-html-source");
      const scroller = document.querySelector<HTMLElement>(
        ".nota-html-source .cm-scroller",
      );
      const content = document.querySelector<HTMLElement>(
        ".nota-html-source .cm-content",
      );
      const gutter = document.querySelector<HTMLElement>(
        ".nota-html-source .cm-gutters",
      );
      assert(source && scroller && content && gutter, "HTML source editor is incomplete");
      const sourceRect = source.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const gutterRect = gutter.getBoundingClientRect();
      assertEqual(scroller.scrollTop, 0, "HTML source editor opened scrolled away from line 1");
      assert(
        contentRect.top - sourceRect.top < 40,
        `HTML code starts ${Math.round(contentRect.top - sourceRect.top)}px below its source surface`,
      );
      assert(
        Math.abs(contentRect.top - gutterRect.top) < 40,
        `HTML code and line numbers disagree: content=${Math.round(contentRect.top)}, gutter=${Math.round(gutterRect.top)}`,
      );
      } finally {
        if (previousLineNumbers === undefined) {
          delete document.documentElement.dataset.codeLineNumbers;
        } else {
          document.documentElement.dataset.codeLineNumbers = previousLineNumbers;
        }
      }
    },
  },
  {
    name: "failed HTML badge images fall back to their visible labels",
    async run() {
      await mount(`<p align="center">
  <a href="https://example.com/releases"><img alt="Release" src="http://127.0.0.1:1/release.svg"></a>
  <a href="https://example.com/platforms"><img alt="Platforms" src="http://127.0.0.1:1/platforms.svg"></a>
</p>`);
      await waitFor('.nota-html-render[data-state="ready"]');
      const deadline = performance.now() + 3000;
      while (
        document.querySelectorAll(".nota-html-image-fallback").length < 2 &&
        performance.now() < deadline
      ) {
        await sleep(25);
      }
      const fallbacks = Array.from(
        document.querySelectorAll<HTMLElement>(".nota-html-image-fallback"),
      ).map((element) => element.textContent);
      assertEqual(
        JSON.stringify(fallbacks),
        JSON.stringify(["Release", "Platforms"]),
        "failed HTML badge images did not expose their alt labels",
      );
      assertEqual(
        document.querySelectorAll(".nota-html-render img:not([hidden])").length,
        0,
        "broken HTML image glyphs remained visible behind the labels",
      );
    },
  },
  {
    name: "bold delimiters stay paired while typing inside a level-one heading",
    async run() {
      const prose = await mount("# ");
      await typeText("**first**");
      const strong = prose.querySelector<HTMLElement>("h1 strong");
      assert(
        strong,
        `heading did not promote complete bold delimiters: ` +
          `markdown=${JSON.stringify(serialized())} html=${JSON.stringify(prose.innerHTML)}`,
      );
      assertEqual(
        strong.textContent,
        "first",
        `heading wrapped the wrong text as bold: markdown=${JSON.stringify(serialized())}`,
      );
      assertEqual(serialized(), "# **first**", "heading bold delimiters were split or duplicated");
      assert(prose.querySelector("h1 strong") !== null, "heading no longer renders a strong span");
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 10, head: 10 }),
        "caret did not settle after the complete closing marker",
      );
    },
  },
  {
    name: "optional Markdown pairing inserts, skips and removes its closing marker",
    async run() {
      const prose = await mount("", { autoPair: true });
      await typeText("*word");
      await nextFrames();
      assertEqual(serialized(), "*word*", "typed emphasis did not auto-pair");
      const emphasis = prose.querySelector<HTMLElement>("em");
      assert(emphasis, "auto-paired emphasis did not render");
      assertEqual(emphasis.textContent, "word", "auto-pair wrapped the wrong text");

      const empty = await mount("", { autoPair: true });
      await typeText("*");
      assertEqual(
        empty.textContent,
        "**",
        "empty Markdown pair was not inserted",
      );
      press(empty, "Backspace");
      await nextFrames();
      assertEqual(serialized(), "", "Backspace left half of the empty Markdown pair");

      const backtick = await mount("", { autoPair: true });
      await typeText("`");
      assertEqual(
        backtick.textContent,
        "`",
        "a single backtick in ordinary Markdown was auto-completed",
      );
      await typeText("word`");
      assertEqual(
        serialized(),
        "`word`",
        "literal backticks did not form a code span after the closing keystroke",
      );
    },
  },
  {
    name: "Left repeatedly reaches the start of a bold word inside a level-one heading",
    async run() {
      const prose = await mount("# **first**");
      press(prose, "End");
      await nextFrames();
      for (let index = 0; index < 9; index++) {
        await requestNativeKey(`arrow-left-${index}`);
        await nextFrames();
      }
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(serialized(), "# Z**first**", "heading caret got trapped inside the opening stars");
    },
  },
  {
    name: "heading and body expose the same strong delimiter boundaries",
    async run() {
      const snapshot = (root: HTMLElement) => ({
        strong: root.querySelector<HTMLElement>("strong")?.textContent ?? null,
        left: root.querySelectorAll(
          '.nota-syntax-marker[data-side="left"]',
        ).length,
        right: root.querySelectorAll(
          '.nota-syntax-marker[data-side="right"]',
        ).length,
        activeLeft: root.querySelectorAll(
          '.nota-syntax-marker[data-side="left"].nota-syntax-active',
        ).length,
        activeRight: root.querySelectorAll(
          '.nota-syntax-marker[data-side="right"].nota-syntax-active',
        ).length,
      });

      const body = await mount("alpha **Markdown** omega");
      press(body, "End");
      await nextFrames();
      for (let index = 0; index < 8; index++) {
        await requestNativeKey(`arrow-left-heading-parity-body-${index}`);
        await nextFrames();
      }
      const bodyState = snapshot(body);

      const heading = await mount("# alpha **Markdown** omega");
      press(heading, "End");
      await nextFrames();
      for (let index = 0; index < 8; index++) {
        await requestNativeKey(`arrow-left-heading-parity-h1-${index}`);
        await nextFrames();
      }
      const headingState = snapshot(heading);

      assertEqual(headingState.strong, "Markdown", "heading strong text changed");
      assertEqual(
        JSON.stringify(headingState),
        JSON.stringify(bodyState),
        "heading used a different strong rendering or delimiter boundary state",
      );
      assertEqual(
        headingState.activeRight,
        2,
        "heading did not expose both closing delimiter characters",
      );
    },
  },
  {
    name: "highlight Left traverses opening delimiters in source order",
    async run() {
      await mount("==1==");
      await nextFrames();
      await requestNativeKey("arrow-left-highlight-inner");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 2, head: 2 }),
        "first Left did not stop between the opening highlight markers",
      );
      await requestNativeKey("arrow-left-highlight-outer");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 1, head: 1 }),
        "second Left did not leave the opening highlight marker",
      );
      editor!.insertAtCursorPlace("Z");
      await nextFrames();
      assertEqual(
        serialized(),
        "Z==1==",
        "Left did not traverse the highlight opening delimiter in source order",
      );
    },
  },
  {
    name: "typing a star after an emphasis closing run keeps the new star",
    async run() {
      const prose = await mount("*1*");
      press(prose, "End");
      await nextFrames();
      await typeText("*");
      assert(
        serialized().endsWith("*"),
        `typing a second closing star swallowed it: ${JSON.stringify(serialized())}`,
      );
    },
  },
  {
    name: "typing and deleting a backslash between closing stars keeps bold source",
    async run() {
      await mount("**Typora**");
      editor!.restoreSelection({ anchor: 11, head: 11 });
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 11, head: 11 }),
        "End did not collapse at the paragraph end",
      );
      await requestNativeKey("arrow-left-before-backslash");
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 10, head: 10 }),
        "Left did not stop between the closing bold stars",
      );
      await requestNativeKey("text-\\");
      await sleep(60);
      await nextFrames();
      assertEqual(
        serialized(),
        "**Typora*\\*",
        "typing a backslash did not remain between the closing stars",
      );
      const typedSelection = editor!.selectionRange();
      assert(
        typedSelection.anchor === typedSelection.head,
        `typing a backslash left a non-collapsed selection: ${JSON.stringify(typedSelection)}`,
      );
      await requestNativeKey("backspace-after-backslash");
      await sleep(60);
      await nextFrames();
      assertEqual(
        serialized(),
        "**Typora**",
        "Backspace did not restore the original bold source",
      );
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 10, head: 10 }),
        "Backspace did not leave the caret between the restored closing stars",
      );
    },
  },
  {
    name: "Ctrl+B reveals both bold delimiter groups around the selected text",
    async run() {
      const prose = await mount("spiritually.");
      editor!.restoreSelection({ anchor: 1, head: 13 });
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 1, head: 13 }),
        "keyboard did not select the paragraph text before Ctrl+B",
      );
      await requestNativeKey("ctrl-b");
      await sleep(60);
      await nextFrames();
      assertEqual(
        serialized(),
        "**spiritually.**",
        "Ctrl+B did not apply bold to the selected text",
      );
      const visibleMarkers = prose.querySelectorAll(
        ".nota-syntax-marker.nota-syntax-active",
      );
      assertEqual(
        visibleMarkers.length,
        4,
        "Ctrl+B left one or both bold delimiter groups hidden",
      );
    },
  },
  {
    name: "Ctrl+B over several paragraphs keeps the paragraph count",
    async run() {
      const lines = [
        "Version 0.0",
        "Nota 是完全的自由软件，使用 BSD 2 Clause 作为发行使用的许可证。",
        "这是Nota软件的用户须知，您",
      ];
      const markdown = lines.join("\n\n");
      const prose = await mount(markdown);
      editor!.restoreSelection({
        anchor: 1,
        head:
          1 +
          lines.reduce((length, line) => length + Array.from(line).length, 0) +
          2 * (lines.length - 1),
      });
      await nextFrames();
      await requestNativeKey("ctrl-b");
      await sleep(60);
      await nextFrames();

      assertEqual(
        serialized(),
        `**${[
          "Version 0.0",
          "Nota 是完全的自由软件，使用 BSD 2 Clause 作为发行使用的许可证。",
          "这是Nota软件的用户须知，您",
        ].join("**\n\n**")}**`,
        "Ctrl+B changed the source or introduced a separator blank line",
      );
      assertEqual(
        prose.querySelectorAll("p").length,
        3,
        "Ctrl+B changed the paragraph count",
      );
      const paragraphBoxes = Array.from(
        prose.querySelectorAll<HTMLElement>("p"),
      ).map((paragraph) => paragraph.getBoundingClientRect());
      for (let index = 1; index < paragraphBoxes.length; index++) {
        const gap = paragraphBoxes[index]!.top - paragraphBoxes[index - 1]!.bottom;
        assert(
          gap < 48,
          `Ctrl+B introduced an oversized paragraph gap: ${JSON.stringify(
            paragraphBoxes.map((box) => box.toJSON()),
          )}`,
        );
      }
    },
  },
  {
    name: "Ctrl+B on the final paragraph does not append a blank block",
    async run() {
      const heading = "Nota 软件使用须知";
      const version = "版本： Version 0.0（2026/11/12）";
      const body =
        "Nota 是完全的自由软件，采用 BSD 2 Clause 许可证发行。其原版本如下，相比之下，本文不具有法律效力，仅供参考：";
      const prose = await mount(`# ${heading}\n\n${version}\n\n${body}`);
      const bodyStart = heading.length + version.length + 5;
      editor!.restoreSelection({
        anchor: bodyStart,
        head: bodyStart + body.length,
      });
      await nextFrames();
      await requestNativeKey("ctrl-b");
      await sleep(80);
      await nextFrames();

      assertEqual(
        serialized(),
        `# ${heading}\n\n${version}\n\n**${body}**`,
        "Ctrl+B changed the final paragraph source",
      );
      assertEqual(
        prose.children.length,
        3,
        `Ctrl+B appended a block: ${Array.from(prose.children)
          .map((child) => child.tagName)
          .join(",")}`,
      );
    },
  },
  {
    name: "Ctrl+B through a trailing empty paragraph keeps one separator",
    async run() {
      const heading = "Nota 软件使用须知";
      const version = "版本： Version 0.0（2026/11/12）";
      const body =
        "Nota 是完全的自由软件，采用 BSD 2 Clause 许可证发行。其原版本如下，相比之下，本文不具有法律效力，仅供参考：";
      const prose = await mount(`# ${heading}\n\n${version}\n\n${body}\n\n`);
      const bodyStart = heading.length + version.length + 5;
      editor!.restoreSelection({
        anchor: bodyStart,
        head: Number.MAX_SAFE_INTEGER,
      });
      await nextFrames();
      await requestNativeKey("ctrl-b");
      await sleep(80);
      await nextFrames();

      assertEqual(
        serialized(),
        `# ${heading}\n\n${version}\n\n**${body}**`,
        "Ctrl+B turned the trailing empty paragraph into visible content",
      );
      assertEqual(
        prose.children.length,
        3,
        `the trailing empty block survived Ctrl+B: ${Array.from(prose.children)
          .map((child) => child.tagName)
          .join(",")}`,
      );
    },
  },
  {
    name: "Ctrl+B does not expand an existing empty paragraph",
    async run() {
      const heading = "Nota 软件使用须知";
      const version = "版本： Version 0.0（2026/11/12）";
      const body =
        "Nota 是完全的自由软件，采用 BSD 2 Clause 许可证发行。其原版本如下，相比之下，本文不具有法律效力，仅供参考：";
      const prose = await mount(`# ${heading}\n\n${version}\n\n${body}`);
      const versionStart = heading.length + 3;
      editor!.restoreSelection({ anchor: versionStart, head: versionStart });
      press(prose, "Enter");
      await nextFrames();
      const empty = prose.querySelectorAll<HTMLElement>("p")[0];
      assert(empty && empty.textContent === "", "test setup did not create an empty paragraph");
      const emptyBefore = empty.getBoundingClientRect();
      const blocksBefore = prose.children.length;

      const bodyStart = versionStart + version.length + 5;
      editor!.restoreSelection({
        anchor: bodyStart,
        head: bodyStart + body.length,
      });
      await nextFrames();
      await requestNativeKey("ctrl-b");
      await sleep(80);
      await nextFrames();

      const emptyAfter = empty.getBoundingClientRect();
      assertEqual(
        prose.children.length,
        blocksBefore,
        "Ctrl+B added a block around the existing empty paragraph",
      );
      assert(
        Math.abs(emptyAfter.height - emptyBefore.height) < 1,
        `Ctrl+B expanded the existing empty paragraph: ` +
          `before=${JSON.stringify(emptyBefore.toJSON())}, ` +
          `after=${JSON.stringify(emptyAfter.toJSON())}`,
      );
    },
  },
  {
    name: "Ctrl+B from a paragraph boundary does not create a blank paragraph",
    async run() {
      const heading = "Nota 软件使用须知";
      const version = "版本： Version 0.0（2026/11/12）";
      const body =
        "Nota 是完全的自由软件，采用 BSD 2 Clause 许可证发行。其原版本如下，相比之下，本文不具有法律效力，仅供参考：";
      const prose = await mount(`# ${heading}\n\n${version}\n\n${body}`);
      const bodyStart = heading.length + version.length + 5;
      editor!.restoreSelection({
        anchor: bodyStart - 1,
        head: bodyStart + body.length,
      });
      await nextFrames();
      await requestNativeKey("ctrl-b");
      await sleep(80);
      await nextFrames();

      assertEqual(
        serialized(),
        `# ${heading}\n\n${version}\n\n**${body}**`,
        "a boundary-anchored selection changed the block separators",
      );
      assertEqual(
        prose.children.length,
        3,
        "a boundary-anchored Ctrl+B inserted a blank paragraph",
      );
    },
  },
  {
    name: "Ctrl+B above an existing empty paragraph keeps the gap stable",
    async run() {
      const heading = "Nota 软件使用须知";
      const version = "版本： Version 0.0（2026/11/12）";
      const body =
        "Nota 是完全的自由软件，采用 BSD 2 Clause 许可证发行。其原版本如下，相比之下，本文不具有法律效力，仅供参考：";
      const prose = await mount(`# ${heading}\n\n${version}\n\n${body}`);
      const bodyStart = heading.length + version.length + 5;
      editor!.restoreSelection({
        anchor: bodyStart + body.length,
        head: bodyStart + body.length,
      });
      press(prose, "Enter");
      await nextFrames();

      const blocksBefore = prose.children.length;
      const bodyElement = prose.querySelectorAll<HTMLElement>("p")[1];
      const emptyElement = prose.querySelectorAll<HTMLElement>("p")[2];
      assert(bodyElement && bodyElement.textContent === body, "body paragraph is missing");
      assert(emptyElement && emptyElement.textContent === "", "Enter did not add an empty paragraph");
      const bodyBefore = bodyElement.getBoundingClientRect();
      const emptyBefore = emptyElement.getBoundingClientRect();

      editor!.restoreSelection({
        anchor: bodyStart,
        head: bodyStart + body.length,
      });
      await nextFrames();
      await requestNativeKey("ctrl-b");
      await sleep(80);
      await nextFrames();

      const bodyAfter = bodyElement.getBoundingClientRect();
      const emptyAfter = emptyElement.getBoundingClientRect();
      assertEqual(
        prose.children.length,
        blocksBefore,
        "Ctrl+B inserted another paragraph above the existing empty one",
      );
      assert(
        Math.abs(emptyAfter.height - emptyBefore.height) < 1 &&
          Math.abs(
            (emptyAfter.top - bodyAfter.bottom) -
              (emptyBefore.top - bodyBefore.bottom),
          ) < 1,
        `Ctrl+B changed the existing paragraph gap: ` +
          `bodyBefore=${JSON.stringify(bodyBefore.toJSON())}, ` +
          `emptyBefore=${JSON.stringify(emptyBefore.toJSON())}, ` +
          `bodyAfter=${JSON.stringify(bodyAfter.toJSON())}, ` +
          `emptyAfter=${JSON.stringify(emptyAfter.toJSON())}`,
      );
    },
  },
  {
    name: "Ctrl+B hides ProseMirror trailing helpers before the next paragraph",
    async run() {
      const heading = "Nota 软件使用须知";
      const version = "版本： Version 0.0（2026/11/12）";
      const body =
        "Nota 是完全的自由软件，采用 BSD 2 Clause 许可证发行。其原版本如下，相比之下，本文不具有法律效力，仅供参考：";
      const prose = await mount(
        `# ${heading}\n\n${version}\n\n${body}\n\n下一段`,
      );
      const bodyStart = heading.length + version.length + 5;
      editor!.restoreSelection({
        anchor: bodyStart,
        head: bodyStart + body.length,
      });
      await nextFrames();
      await requestNativeKey("ctrl-b");
      await sleep(80);
      await nextFrames();

      const bodyParagraph = prose.querySelectorAll<HTMLElement>("p")[1];
      const nextParagraph = prose.querySelectorAll<HTMLElement>("p")[2];
      assert(bodyParagraph && nextParagraph, "the paragraph fixture is incomplete");
      const separator = bodyParagraph.querySelector<HTMLElement>(
        "img.ProseMirror-separator",
      );
      const trailingBreak = bodyParagraph.querySelector<HTMLElement>(
        "br.ProseMirror-trailingBreak",
      );
      assert(separator && trailingBreak, "ProseMirror did not create its trailing helpers");
      assertEqual(
        getComputedStyle(separator).display,
        "none",
        "the separator can still occupy a line under WebKit",
      );
      assertEqual(
        getComputedStyle(trailingBreak).display,
        "none",
        "the trailing break can still occupy a line under WebKit",
      );
      const bodyRect = bodyParagraph.getBoundingClientRect();
      const nextRect = nextParagraph.getBoundingClientRect();
      assert(
        nextRect.top - bodyRect.bottom < 20,
        `the next paragraph gained a blank layout line: ` +
          `body=${JSON.stringify(bodyRect.toJSON())}, ` +
          `next=${JSON.stringify(nextRect.toJSON())}`,
      );
    },
  },
  {
    name: "Ctrl+B and the Bold command create visible boundaries at a collapsed caret",
    async run() {
      await mount("ab");
      editor!.restoreSelection({ anchor: 2, head: 2 });
      await requestNativeKey("ctrl-b");
      await nextFrames();
      assertEqual(
        serialized(),
        "a****b",
        "Ctrl+B did not create a visible empty bold pair",
      );
      await typeText("x");
      await nextFrames();
      assertEqual(serialized(), "a**x**b", "bold did not wrap text typed inside the empty pair");
      assert(editor!.runCommand("bold"), "Bold command did not toggle the active run");
      await nextFrames();
      assertEqual(
        serialized(),
        "axb",
        `Bold command from inside bold did not unwrap the whole run ` +
          `(selection=${JSON.stringify(editor!.selectionRange())}, ` +
          `strong=${document.querySelectorAll(".ProseMirror strong").length})`,
      );

      await mount("ab");
      editor!.restoreSelection({ anchor: 2, head: 2 });
      assert(editor!.runCommand("bold"), "Bold command rejected a collapsed caret");
      await nextFrames();
      assertEqual(
        serialized(),
        "a****b",
        "toolbar Bold command did not create a visible empty pair without a selection",
      );
    },
  },
  {
    name: "editing list items keeps native circle and number geometry",
    async run() {
      for (const fixture of [
        { markdown: "- ABC\n- DEF" },
        { markdown: "1. ABC\n2. DEF" },
      ]) {
        const prose = await mount(fixture.markdown);
        const item = await waitFor<HTMLElement>("li");
        const markerBefore = getComputedStyle(item, "::before");
        const before = {
          listStyleType: getComputedStyle(item).listStyleType,
          content: markerBefore.content,
          height: markerBefore.height,
          top: markerBefore.top,
          width: markerBefore.width,
        };
        editor!.restoreSelection({ anchor: 3, head: 3 });
        await nextFrames();
        const markerAfter = getComputedStyle(item, "::before");
        const after = {
          listStyleType: getComputedStyle(item).listStyleType,
          content: markerAfter.content,
          height: markerAfter.height,
          top: markerAfter.top,
          width: markerAfter.width,
        };
        assert(
          !item.classList.contains("nota-srcmark"),
          "entering a list item still swaps in a pseudo source marker",
        );
        assertEqual(
          JSON.stringify(after),
          JSON.stringify(before),
          "the list marker style changed when editing began",
        );
        assert(
          Math.abs(item.getBoundingClientRect().left - prose.getBoundingClientRect().left) < 80,
          "entering the list item moved its content box",
        );
      }
    },
  },
  {
    name: "nested italic and bold keep all three delimiters on each side",
    async run() {
      const prose = await mount("***local***");
      editor!.restoreSelection({ anchor: 9, head: 9 });
      await nextFrames();
      assertEqual(
        serialized(),
        "***local***",
        "nested bold and italic source changed before navigation",
      );
      assertEqual(
        prose.querySelectorAll(
          '.nota-syntax-marker[data-side="left"].nota-syntax-active',
        ).length,
        3,
        "the opening bold/italic delimiter run lost a character",
      );
      assertEqual(
        prose.querySelectorAll(
          '.nota-syntax-marker[data-side="right"].nota-syntax-active',
        ).length,
        3,
        "the closing bold/italic delimiter run lost a character",
      );
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
    name: "holding Left through a link source exits without bouncing back inside",
    async run() {
      const prose = await mount("[github](https://github.com)你好", {
        keyboardExperience: true,
      });
      editor!.restoreSelection({ anchor: 7, head: 7 });
      await nextFrames();
      for (let index = 0; index < 40; index++) {
        await requestNativeKey(`arrow-left-link-${index}`);
        await nextFrames();
      }
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 1, head: 1 }),
        "continuous Left did not settle at the paragraph start",
      );
      assertEqual(
        serialized(),
        "[github](https://github.com)你好",
        "continuous Left changed the link source",
      );
      assert(
        document.querySelector(".nota-keyboard-link-source") === null,
        "continuous Left left focus trapped in the link source input",
      );
      assert(prose.isConnected, "continuous Left destroyed the editor");
    },
  },
  {
    name: "first Left at a link tail stays after the revealed source",
    async run() {
      await mount("[github](https://github.com)你", {
        keyboardExperience: true,
      });
      await waitFor<HTMLElement>(".nota-link-source");
      editor!.restoreSelection({ anchor: Number.MAX_SAFE_INTEGER, head: Number.MAX_SAFE_INTEGER });
      await nextFrames();
      assertEqual(
        document.querySelector(".nota-link-source"),
        null,
        "moving outside the link did not restore its rendered form",
      );
      await requestNativeKey("arrow-left-to-link-tail");
      await nextFrames();
      await typeText("X");
      await nextFrames();
      assertEqual(
        serialized(),
        "[github](https://github.com)X你",
        "first Left entered the link source instead of stopping after it",
      );
      const trace: Array<Record<string, unknown>> = [
        {
          step: "after X",
          selection: editor!.selectionRange(),
          source: document.querySelector(".nota-link-source") !== null,
        },
      ];
      await requestNativeKey("backspace-after-link-tail");
      trace.push({
        step: "after Backspace",
        selection: editor!.selectionRange(),
        source: document.querySelector(".nota-link-source") !== null,
      });
      await requestNativeKey("arrow-left-into-destination-end");
      trace.push({
        step: "after Left",
        selection: editor!.selectionRange(),
        source: document.querySelector(".nota-link-source") !== null,
      });
      await typeText("Y");
      await nextFrames();
      assertEqual(
        serialized(),
        "[github](https://github.comY)你",
        `second Left entered the link label instead of the destination end: ${JSON.stringify(trace)}`,
      );
    },
  },
  {
    name: "link source is edited in place before the destination closes",
    async run() {
      await mount("[github](https://github.com)你好", {
        keyboardExperience: true,
      });
      editor!.restoreSelection({ anchor: 4, head: 4 });
      await nextFrames();
      const source = await waitFor<HTMLElement>(".nota-link-source");
      assertEqual(
        source.textContent,
        "[github](https://github.com)",
        "the linked run was not replaced by editable Markdown source",
      );
      await nextFrames();
      assert(
        document.querySelector(".nota-blink-caret-on") !== null,
        "link source editing hid the body caret",
      );
      editor!.restoreSelection({
        anchor: 2 + (source.textContent?.length ?? 0) - 1,
        head: 2 + (source.textContent?.length ?? 0) - 1,
      });
      await nextFrames();
      await typeText("x");
      await nextFrames();
      assertEqual(
        source.textContent,
        "[github](https://github.comx)",
        "typing before the closing parenthesis did not edit the destination",
      );
      editor!.restoreSelection({ anchor: 1, head: 1 });
      await nextFrames();
      assertEqual(
        serialized(),
        "[github](https://github.comx)你好",
        "leaving the source did not parse the edited destination back into a link",
      );
    },
  },
  {
    name: "Ctrl+A in a link source selects the whole document before delete",
    async run() {
      await mount("[github](https://github.com)你好", {
        keyboardExperience: true,
      });
      editor!.restoreSelection({ anchor: 4, head: 4 });
      await nextFrames();
      await waitFor(".nota-link-source");
      await requestNativeKey("ctrl-a");
      await nextFrames();
      await requestNativeKey("delete");
      await nextFrames();
      assertEqual(
        serialized(),
        "",
        "Ctrl+A inside link source selected only the link and left trailing text",
      );
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
    name: "typing explicit Markdown link syntax recognizes a bare domain",
    async run() {
      await mount("", { autoLinks: false });
      await typeText("[GFM](github.com)");
      await nextFrames();
      const link = await waitFor<HTMLAnchorElement>('a[href="https://github.com"]');
      assertEqual(link.textContent, "GFM", "link label changed");
      assertEqual(
        serialized(),
        "[GFM](https://github.com)",
        "typed bare-domain destination was not normalized",
      );
      assert(
        document.activeElement !== link && !link.contains(document.activeElement),
        "caret remained inside the completed link",
      );
      await typeText("f");
      await nextFrames();
      assertEqual(link.textContent, "GFM", "text typed after the link inherited the link mark");
      assertEqual(
        serialized(),
        "[GFM](https://github.com)f",
        "text typed after the completed link was absorbed into its label",
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
    name: "Tab uses the configured indentation width",
    async run() {
      await mount("", { defaultIndent: 4 });
      await typeText("x");
      await requestNativeKey("tab-indent");
      assertEqual(
        readableWhitespace(serialized()),
        "x    ",
        "Tab did not insert four configured spaces",
      );
    },
  },
  {
    name: "Tab on an empty paragraph keeps the line and inserts indentation",
    async run() {
      const prose = await mount("", { defaultIndent: 2, autoPair: false });
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 1, head: 1 }),
        "empty document caret is not inside the first paragraph",
      );
      press(prose, "Tab");
      assertEqual(readableWhitespace(serialized()), "  ", "empty Tab transaction was followed by another edit");
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 3, head: 3 }),
        "Tab placed the caret before its indentation",
      );
      await nextFrames();
      assertEqual(
        JSON.stringify(editor!.selectionRange()),
        JSON.stringify({ anchor: 3, head: 3 }),
        "a deferred editor transaction moved the caret back before typing",
      );
      const caretSelection = window.getSelection();
      assertEqual(
        caretSelection?.anchorOffset,
        2,
        `DOM caret stayed before Tab indentation: node=${caretSelection?.anchorNode?.nodeName} ` +
          `parent=${(caretSelection?.anchorNode?.parentNode as HTMLElement | null)?.innerHTML}`,
      );
      await requestNativeKey("text-x");
      assertEqual(
        readableWhitespace(prose.textContent ?? ""),
        "  x",
        "Tab on an empty line removed or replaced the paragraph",
      );
    },
  },
  {
    name: "Vim insert mode accepts text in an empty document",
    async run() {
      const prose = await mount("", { vim: true });
      press(prose, "i");
      await waitFor('.ProseMirror[data-vim-mode="insert"]');
      await typeText("x");
      assertEqual(serialized(), "x", "Vim insert mode rejected the first character");
    },
  },
  {
    name: "bracket pairing inserts, skips and wraps using one setting",
    async run() {
      await mount("", { autoPair: true });
      await typeText("(");
      assertEqual(serialized(), "()", "opening parenthesis did not insert its pair");
      await typeText("x)");
      assertEqual(serialized(), "(x)", "typed closing parenthesis duplicated the pair");

      await mount("word", { autoPair: true });
      editor!.runCommand("selectLine");
      await nextFrames();
      await typeText("(");
      assertEqual(serialized(), "(word)", "bracket did not wrap the selected text");

      await mount("", { autoPair: true });
      await typeText("【");
      await typeText("中");
      assertEqual(serialized(), "【中】", "full-width bracket pairing failed");
    },
  },
  {
    name: "Backspace removes an empty auto-pair in one step",
    async run() {
      const prose = await mount("", { autoPair: true });
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
      const prose = await mount("", { autoPair: true });
      await typeText("(");
      await typeText("x");
      press(prose, "Tab");
      await typeText("Y");
      assertEqual(serialized(), "(x)Y", "Tab did not cross the closing bracket");

      const reversed = await mount("", { autoPair: true });
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
    name: "input-method brackets pair after composition ends",
    async run() {
      await mount("", { autoPair: true });
      await composeText("（");
      assertEqual(serialized(), "（）", "committed opener did not get a partner");
      await composeText("你好");
      await composeText("）");
      assertEqual(serialized(), "（你好）", "committed closer did not step over the partner");
    },
  },
  {
    name: "input methods own the caret for the full preedit",
    async run() {
      const prose = await mount("");
      const cursor = document.querySelector<HTMLElement>(".nota-blink-caret");
      assert(cursor, "the editor did not create its caret overlay");

      prose.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
      );
      await typeText("N");
      await nextFrames();
      assert(
        prose.classList.contains("nota-ime-composing"),
        "the editor did not hand the caret to the IME",
      );
      assert(
        !cursor.classList.contains("nota-blink-caret-on"),
        "the detached caret remained visible during IME composition",
      );

      prose.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: "N" }),
      );
      await nextFrames();
      assert(
        !prose.classList.contains("nota-ime-composing"),
        "the editor kept the IME caret after composition ended",
      );
      assertEqual(serialized(), "N", "the committed preedit was not kept exactly once");
    },
  },
  {
    name: "smart quote pairing keeps apostrophes and original closers intact",
    async run() {
      await mount("", { autoPair: true });
      await typeText('"hello"');
      assertEqual(serialized(), "“hello”", "straight quote keys did not form one curly pair");

      await mount("", { autoPair: true });
      await typeText("don't");
      assertEqual(serialized(), "don’t", "single quote after a word became a pair instead of an apostrophe");

      await mount("", { autoPair: true });
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
    name: "backslash in empty inline math stays before the closing dollar",
    async run() {
      await mount("$ $");
      const input = await openInlineMath();
      input.value = "";
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "deleteContentBackward",
        }),
      );
      await nextFrames();
      input.focus();
      input.setSelectionRange(0, 0);
      await requestNativeKey("text-\\");
      await nextFrames();

      assertEqual(input.value, "\\", "the source input gained or lost a backslash");
      assertEqual(input.selectionStart, 1, "the source caret did not stay after the backslash");
      assertEqual(document.activeElement, input, "typing a backslash moved focus out of the formula");
      assertEqual(serialized(), "$\\$", "the closing dollar moved into the formula source");

      const closing = document.querySelector<HTMLElement>(".nota-math-delim-close");
      assert(closing, "the closing dollar is missing");
      assert(
        input.getBoundingClientRect().right <= closing.getBoundingClientRect().left + 1,
        "the source input extends past the closing dollar",
      );
    },
  },
  {
    name: "inline math commits IME text once after composition ends",
    async run() {
      await mount("$ $");
      const input = await openInlineMath();
      input.value = "";
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      await nextFrames();
      const before = serialized();

      input.focus();
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      input.value = "\\LaTeX";
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: "\\LaTeX",
          inputType: "insertCompositionText",
          isComposing: true,
        }),
      );
      const composingEnter = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      });
      input.dispatchEvent(composingEnter);
      await nextFrames();
      assertEqual(serialized(), before, "formula source was committed during IME composition");
      assertEqual(composingEnter.defaultPrevented, false, "Enter was stolen from the IME");
      assertEqual(document.activeElement, input, "IME composition lost the source input");

      input.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: "\\LaTeX" }),
      );
      await nextFrames();
      assertEqual(serialized(), "$\\LaTeX$", "committed IME text was not written exactly once");
      assertEqual(input.selectionStart, input.value.length, "caret did not remain after committed text");
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
      for (const zoom of [1, 1.25, 1.5]) {
        document.documentElement.style.zoom = String(zoom);
        await mount("```js\nABCD\n```");
        editor!.restoreSelection({ anchor: 2, head: 2 });
        const content = await waitFor<HTMLElement>(".nota-code-cm .cm-content");
        const line = await waitFor<HTMLElement>(".nota-code-cm .cm-line");
        const before = getComputedStyle(line);
        const beforeSize = before.fontSize;
        const beforeFamily = before.fontFamily;
        await nextFrames();
        content.focus();
        await nextFrames();
        const after = getComputedStyle(line);
        const ownCaret = await waitFor<HTMLElement>(
          ".nota-code-caret-before, .nota-code-caret-after, .nota-code-empty-caret",
        );
        const caretStyle = getComputedStyle(ownCaret);
        const caretPseudo = ownCaret.classList.contains("nota-code-caret-after")
          ? "::after"
          : "::before";
        const paintedCaretStyle = getComputedStyle(ownCaret, caretPseudo);
        const nativeCaret = getComputedStyle(content).caretColor;
        assertEqual(
          content.dataset.notaCaretBuild,
          "inline-mark-v8",
          `code block is missing the WebView2 inline caret guard at zoom=${zoom}`,
        );
        assertEqual(
          after.fontSize,
          beforeSize,
          `code font size changed when the block gained focus at zoom=${zoom}`,
        );
        assertEqual(
          after.fontFamily,
          beforeFamily,
          `code font family changed when the block gained focus at zoom=${zoom}`,
        );
        assert(
          !ownCaret.hidden &&
            caretStyle.display !== "none" &&
            paintedCaretStyle.display !== "none",
          `focused code block has no visible caret at zoom=${zoom} ` +
            `(hidden=${ownCaret.hidden}, height=${ownCaret.style.height || "auto"}, ` +
            `active=${document.activeElement?.className || document.activeElement?.tagName}, ` +
            `selection=${JSON.stringify(editor!.selectionRange())}, ` +
            `error=${ownCaret.dataset.error || "none"})`,
        );
        assert(
          paintedCaretStyle.animationName === "nota-code-own-caret-blink",
          `embedded code block caret is not blinking at zoom=${zoom}`,
        );
        assert(
          nativeCaret === "transparent" ||
            /^rgba\([^)]*,\s*0\)$/.test(nativeCaret),
          `native code block caret is still visible at zoom=${zoom}: ${nativeCaret}`,
        );
        const caretHeight = Number.parseFloat(paintedCaretStyle.height);
        const glyphLimit = Number.parseFloat(after.fontSize) * 1.2 + 0.5;
        assert(
          Number.isFinite(caretHeight) && caretHeight <= glyphLimit,
          `embedded code block caret is taller than its glyph box at zoom=${zoom}: ` +
            `caret=${paintedCaretStyle.height}, font=${after.fontSize}, limit=${glyphLimit}`,
        );
        const lineBox = line.getBoundingClientRect();
        const caretBox = ownCaret.getBoundingClientRect();
        assert(
          caretBox.top >= lineBox.top - 1 &&
            caretBox.bottom <= lineBox.bottom + 1 &&
            caretBox.left >= lineBox.left - 1 &&
            caretBox.left <= lineBox.right + 1,
          `embedded code block caret escaped its source line at zoom=${zoom}: ` +
            `line=${JSON.stringify(lineBox.toJSON())}, ` +
            `caret=${JSON.stringify(caretBox.toJSON())}`,
        );
      }
      document.documentElement.style.zoom = "";
    },
  },
  {
    name: "code block line numbers align with every source line",
    async run() {
      const source = Array.from(
        { length: 20 },
        (_, index) => `const value${index + 1} = ${index + 1};`,
      ).join("\n");
      document.documentElement.dataset.codeLineNumbers = "on";
      await mount(`\`\`\`js\n${source}\n\`\`\``);
      const content = await waitFor<HTMLElement>(".nota-code-cm .cm-content");
      content.focus();
      await waitFor<HTMLElement>(".nota-code-cm .cm-line");
      await nextFrames(4);
      const scroller = await waitFor<HTMLElement>(".nota-code-cm .cm-scroller");
      const gutter = await waitFor<HTMLElement>(".nota-code-cm .cm-gutters");
      assertEqual(
        getComputedStyle(scroller).display,
        "flex",
        "the CodeMirror scroller is not laid out as a row",
      );
      assertEqual(
        getComputedStyle(scroller).flexDirection,
        "row",
        "the gutter and code content are stacked vertically",
      );
      assertEqual(
        getComputedStyle(scroller).flexWrap,
        "nowrap",
        "the gutter can wrap onto a separate row",
      );
      assert(
        Math.abs(
          gutter.getBoundingClientRect().top -
            content.getBoundingClientRect().top,
        ) < 2,
        "the gutter starts above or below the code content",
      );
      const lines = Array.from(
        document.querySelectorAll<HTMLElement>(".nota-code-cm .cm-line"),
      );
      const numbers = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".nota-code-cm .cm-lineNumbers .cm-gutterElement",
        ),
      ).filter((element) => element.textContent?.trim());
      assert(lines.length >= 20, "the source fixture lost code lines");
      assert(numbers.length >= lines.length, "the gutter lost line numbers");
      const failures = lines.flatMap((line, index) => {
        const number = numbers.find(
          (element) => element.textContent?.trim() === String(index + 1),
        );
        if (!number) return [`${index + 1}:missing`];
        const delta =
          number.getBoundingClientRect().top - line.getBoundingClientRect().top;
        return Math.abs(delta) <= 1
          ? []
          : [
              `${index + 1}:${delta}` +
                `(line=${getComputedStyle(line).lineHeight},` +
                `gutter=${getComputedStyle(number).lineHeight},` +
                `height=${number.getBoundingClientRect().height})`,
            ];
      });
      assertEqual(
        failures.join(","),
        "",
        "line numbers do not share source-line tops",
      );
      delete document.documentElement.dataset.codeLineNumbers;
    },
  },
  {
    name: "an empty code block starts its first caret at the text origin",
    async run() {
      document.documentElement.style.zoom = "1.25";
      await mount("```js\n\n```");
      editor!.restoreSelection({ anchor: 1, head: 1 });
      const content = await waitFor<HTMLElement>(".nota-code-cm .cm-content");
      const line = await waitFor<HTMLElement>(".nota-code-cm .cm-line");
      content.focus();
      await nextFrames();
      const ownCaret = await waitFor<HTMLElement>(".nota-code-empty-caret");
      const deadline = performance.now() + 2000;
      while (ownCaret.hidden && performance.now() < deadline) {
        await nextFrames();
      }
      assert(
        !ownCaret.hidden,
        `empty code block never displayed its first caret ` +
          `(active=${document.activeElement?.className || document.activeElement?.tagName}, ` +
          `selection=${JSON.stringify(editor!.selectionRange())}, ` +
          `error=${ownCaret.dataset.error || "none"})`,
      );
      const nativeCaret = getComputedStyle(content).caretColor;
      assertEqual(
        content.dataset.notaCaretBuild,
        "inline-mark-v8",
        "empty code block is missing the WebView2 inline caret guard",
      );
      assert(
        nativeCaret === "transparent" ||
          /^rgba\([^)]*,\s*0\)$/.test(nativeCaret),
        `native caret is still visible in an empty code block: ${nativeCaret}`,
      );
      await nextFrames();
      const lineBox = line.getBoundingClientRect();
      const caretBox = ownCaret.getBoundingClientRect();
      assert(
        caretBox.top >= lineBox.top - 1 &&
          caretBox.bottom <= lineBox.bottom + 1 &&
          caretBox.left >= lineBox.left - 1 &&
          caretBox.left <= lineBox.right + 1,
        `empty code block caret started outside its text line: ` +
          `line=${JSON.stringify(lineBox.toJSON())}, ` +
          `caret=${JSON.stringify(caretBox.toJSON())}`,
      );
      document.documentElement.style.zoom = "";
    },
  },
  {
    name: "code block surfaces stay inside the editor width",
    async run() {
      await mount("```js\nconst value = 42;\n```");
      const pane = await waitFor<HTMLElement>(".editor-mount");
      const codeBlock = await waitFor<HTMLElement>(".ProseMirror pre");
      const editor = await waitFor<HTMLElement>(".nota-code-cm");
      await nextFrames();
      const paneRect = pane.getBoundingClientRect();
      const blockRect = codeBlock.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      assert(
        pane.scrollWidth <= pane.clientWidth + 1,
        `hidden code content expanded the editor width: ${pane.scrollWidth} > ${pane.clientWidth}`,
      );
      assert(
        blockRect.left >= paneRect.left - 1 &&
          blockRect.right <= paneRect.right + 1,
        `code block escaped the editor bounds: block=${JSON.stringify(blockRect.toJSON())} pane=${JSON.stringify(paneRect.toJSON())}`,
      );
      assert(
        editorRect.width > 0 && editorRect.width <= blockRect.width,
        `CodeMirror surface has an invalid width: ${editorRect.width} vs ${blockRect.width}`,
      );
    },
  },
  {
    name: "code blocks pair brackets but keep a single backtick literal",
    async run() {
      await mount("```js\n\n```");
      let content = await waitFor<HTMLElement>(".nota-code-cm .cm-content", 10000);
      content.focus();
      await nextFrames();
      await typeText("`");
      let line = await waitFor<HTMLElement>(".nota-code-cm .cm-line");
      assertEqual(line.textContent, "`", "a single backtick was auto-completed");

      await mount("```js\n\n```");
      content = await waitFor<HTMLElement>(".nota-code-cm .cm-content", 10000);
      content.focus();
      await nextFrames();
      await typeText("(");
      line = await waitFor<HTMLElement>(".nota-code-cm .cm-line");
      assertEqual(line.textContent, "()", "ordinary bracket pairing stopped working");
    },
  },
  {
    name: "empty math fences show only the source surface",
    async run() {
      await mount("```math\n\n```");
      const pre = await waitFor<HTMLElement>(".nota-code-wrap.nota-code-math > pre");
      pre.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
      await waitFor<HTMLElement>(".nota-code-wrap.nota-code-math .cm-content", 10000);
      const preview = await waitFor<HTMLElement>(".nota-code-math-preview");
      await nextFrames();
      assert(
        preview.hidden,
        "empty math fence still rendered a second preview surface",
      );
    },
  },
  {
    name: "single-line code sources have no phantom trailing line",
    async run() {
      for (const source of [
        "```js\nconst value = 42;\n```",
        "```math\n\\\\LaTeX\n```",
        "```js\r\nconst value = 42;\r\n```",
        "```math\r\n\\\\LaTeX\r\n```",
      ]) {
        await mount(source);
        const pre = await waitFor<HTMLElement>(".ProseMirror pre");
        pre.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
        await waitFor<HTMLElement>(".nota-code-cm .cm-line", 10000);
        await nextFrames();
        const lines = Array.from(
          document.querySelectorAll<HTMLElement>(".nota-code-cm .cm-line"),
        );
        assertEqual(
          lines.length,
          1,
          `single-line source rendered ${lines.length} CodeMirror lines: ${JSON.stringify(lines.map((line) => line.textContent))}`,
        );
      }
    },
  },
  {
    name: "math and latex fenced code blocks render KaTeX previews",
    async run() {
      for (const language of ["math", "latex", "tex"]) {
        await mount(`\`\`\`${language}\n\\\\LaTeX\n\`\`\``);
        const pre = await waitFor<HTMLElement>(".nota-code-wrap.nota-code-math > pre");
        pre.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
        await waitFor<HTMLElement>(".nota-code-wrap.nota-code-math .cm-content", 10000);
        const preview = await waitFor<HTMLElement>(
          ".nota-code-wrap.nota-code-math .nota-code-math-preview",
          5000,
        );
        await sleep(3000);
        assertEqual(
          preview.dataset.state,
          "ready",
          `${language} fence preview state; text=${JSON.stringify(preview.textContent)}; hidden=${preview.hidden}`,
        );
        const katex = preview.querySelector<HTMLElement>(".katex");
        assert(katex, `${language} fence reached ready without a KaTeX tree`);
        assert(
          (preview.textContent ?? "").includes("LaTeX"),
          `${language} fence preview lost the rendered LaTeX text`,
        );
      }
    },
  },
  {
    name: "Left and Up at the code block start move back to the document",
    async run() {
      for (const language of ["js", "latex", "tex", "mermaid"]) {
        const body =
          language === "js"
            ? "const x = 1;"
            : language === "mermaid"
              ? "graph TD; A[Start] --> B[End];"
              : "\\LaTeX";
        await mount(`before\n\n\`\`\`${language}\n${body}\n\`\`\``);
        const editorSelector =
          language === "mermaid" ? ".nota-diagram-cm .cm-content" : ".nota-code-cm .cm-content";
        if (language === "mermaid") {
          const preview = await waitFor<HTMLElement>(
            ".nota-diagram-preview",
            5000,
          );
          preview.dispatchEvent(
            new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: true,
              button: 0,
            }),
          );
        } else if (language !== "js") {
          const pre = await waitFor<HTMLElement>(".nota-code-wrap.nota-code-math > pre");
          pre.dispatchEvent(
            new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: true,
              button: 0,
            }),
          );
        }
        const content = await waitFor<HTMLElement>(editorSelector, 10000);
        const codeView = EditorView.findFromDOM(content);
        assert(codeView, `could not find the ${language} CodeMirror view`);
        const enterSourceEditor = async () => {
          if (language === "mermaid") {
            const preview = await waitFor<HTMLElement>(".nota-diagram-preview");
            preview.dispatchEvent(
              new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
                button: 0,
              }),
            );
          } else if (language !== "js") {
            const pre = await waitFor<HTMLElement>(".nota-code-wrap.nota-code-math > pre");
            pre.dispatchEvent(
              new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
                button: 0,
              }),
            );
          }
          await nextFrames();
          codeView.focus();
        };
        const focusAt = (position: number) => {
          codeView.dispatch({ selection: { anchor: position } });
          codeView.focus();
        };
        const middle = Math.min(1, Math.max(0, codeView.state.doc.length - 1));
        await enterSourceEditor();
        focusAt(middle);
        await requestNativeKey(`arrow-left-${language}-code-block-middle`);
        await nextFrames();
        assert(
          content.contains(document.activeElement),
          `Left inside the ${language} code block escaped before the source head; ` +
            `cursor=${codeView.state.selection.main.head}, active=${document.activeElement?.className}`,
        );

        focusAt(0);
        const before = serialized();

        await requestNativeKey(`arrow-left-${language}-code-block-start`);
        await nextFrames();
        assert(
          document.activeElement !== content && !content.contains(document.activeElement),
          `Left at the ${language} code block start did not leave CodeMirror`,
        );
        assertEqual(serialized(), before, `Left at the ${language} code block start changed the document`);

        await enterSourceEditor();
        focusAt(middle);
        await requestNativeKey(`arrow-up-${language}-code-block-middle`);
        await nextFrames();
        assert(
          content.contains(document.activeElement),
          `Up inside the ${language} code block escaped before the source head; ` +
            `cursor=${codeView.state.selection.main.head}, active=${document.activeElement?.className}`,
        );

        focusAt(0);
        await requestNativeKey(`arrow-up-${language}-code-block-start`);
        await nextFrames();
        assert(
          document.activeElement !== content && !content.contains(document.activeElement),
          `Up at the ${language} code block start did not leave CodeMirror`,
        );
        assertEqual(serialized(), before, `Up at the ${language} code block start changed the document`);
      }
    },
  },
  {
    name: "Right and Down at any code block end move forward to the document",
    async run() {
      for (const language of ["js", "latex", "tex", "mermaid"]) {
        const body =
          language === "js"
            ? "const x = 1;"
            : language === "mermaid"
              ? "graph TD; A[Start] --> B[End];"
              : "\\LaTeX";
        await mount(`\`\`\`${language}\n${body}\n\`\`\`\n\nafter`);
        const editorSelector =
          language === "mermaid" ? ".nota-diagram-cm .cm-content" : ".nota-code-cm .cm-content";
        if (language === "mermaid") {
          const preview = await waitFor<HTMLElement>(
            ".nota-diagram-preview",
            5000,
          );
          preview.dispatchEvent(
            new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: true,
              button: 0,
            }),
          );
        } else if (language !== "js") {
          const pre = await waitFor<HTMLElement>(".nota-code-wrap.nota-code-math > pre");
          pre.dispatchEvent(
            new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: true,
              button: 0,
            }),
          );
        }
        const content = await waitFor<HTMLElement>(editorSelector, 10000);
        const codeView = EditorView.findFromDOM(content);
        assert(codeView, `${language} CodeMirror view is missing`);
        const enterSourceEditor = async () => {
          if (language === "mermaid") {
            const preview = await waitFor<HTMLElement>(".nota-diagram-preview");
            preview.dispatchEvent(
              new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
                button: 0,
              }),
            );
          } else if (language !== "js") {
            const pre = await waitFor<HTMLElement>(".nota-code-wrap.nota-code-math > pre");
            pre.dispatchEvent(
              new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
                button: 0,
              }),
            );
          }
          await nextFrames();
          codeView.focus();
        };
        const focusAt = (position: number) => {
          codeView.dispatch({ selection: { anchor: position } });
          codeView.focus();
        };
        const sourceEnd = codeView.state.doc.length;
        const lastInside = Math.max(0, sourceEnd - 1);

        await enterSourceEditor();
        focusAt(lastInside);
        await requestNativeKey(`arrow-right-${language}-code-block-inside`);
        await nextFrames();
        assert(
          content.contains(document.activeElement),
          `Right inside the ${language} code block escaped before the source tail; ` +
            `cursor=${codeView.state.selection.main.head}, active=${document.activeElement?.className}`,
        );

        focusAt(sourceEnd);
        const before = serialized();
        await requestNativeKey(`arrow-right-${language}-code-block-end`);
        await nextFrames();
        assert(
          document.activeElement !== content && !content.contains(document.activeElement),
          `Right at the ${language} code block end did not leave CodeMirror`,
        );
        assertEqual(serialized(), before, `Right at the ${language} code block end changed the document`);

        await enterSourceEditor();
        focusAt(lastInside);
        await requestNativeKey(`arrow-down-${language}-code-block-inside`);
        await nextFrames();
        assert(
          content.contains(document.activeElement),
          `Down inside the ${language} code block escaped before the source tail; ` +
            `cursor=${codeView.state.selection.main.head}, active=${document.activeElement?.className}`,
        );

        focusAt(sourceEnd);
        await requestNativeKey(`arrow-down-${language}-code-block-end`);
        await nextFrames();
        assert(
          document.activeElement !== content && !content.contains(document.activeElement),
          `Down at the ${language} code block end did not leave CodeMirror`,
        );
        assertEqual(serialized(), before, `Down at the ${language} code block end changed the document`);
      }
    },
  },
  {
    name: "double-dollar formula blocks use the same four-direction exits",
    async run() {
      const prose = await mount("before\n\n$$\nE=mc^2\n$$\n\nafter");
      const selectFormula = async () => {
        editor!.focusAtStart();
        press(prose, "End");
        await nextFrames();
        await requestNativeKey(`arrow-down-into-double-dollar-${Math.random()}`);
      };

      await selectFormula();
      const content = await waitFor<HTMLElement>(".nota-math-source-shell .cm-content", 10000);
      const codeView = EditorView.findFromDOM(content);
      assert(codeView, "double-dollar formula CodeMirror view is missing");
      const before = serialized();
      const focusAt = (position: number) => {
        codeView.dispatch({ selection: { anchor: position } });
        codeView.focus();
      };
      const sourceEnd = codeView.state.doc.length;

      focusAt(0);
      await requestNativeKey("arrow-left-double-dollar-start");
      await nextFrames();
      assert(
        document.activeElement !== content && !content.contains(document.activeElement),
        "Left at the double-dollar formula start did not leave its source editor",
      );

      await selectFormula();
      await waitFor<HTMLElement>(".nota-math-source-shell .cm-content", 10000);
      focusAt(0);
      await requestNativeKey("arrow-up-double-dollar-start");
      await nextFrames();
      assert(
        document.activeElement !== content && !content.contains(document.activeElement),
        "Up at the double-dollar formula start did not leave its source editor",
      );

      await selectFormula();
      await waitFor<HTMLElement>(".nota-math-source-shell .cm-content", 10000);
      focusAt(sourceEnd);
      await requestNativeKey("arrow-right-double-dollar-end");
      await nextFrames();
      assert(
        document.activeElement !== content && !content.contains(document.activeElement),
        "Right at the double-dollar formula end did not leave its source editor",
      );

      await selectFormula();
      await waitFor<HTMLElement>(".nota-math-source-shell .cm-content", 10000);
      focusAt(sourceEnd);
      await requestNativeKey("arrow-down-double-dollar-end");
      await nextFrames();
      assert(
        document.activeElement !== content && !content.contains(document.activeElement),
        "Down at the double-dollar formula end did not leave its source editor",
      );
      assertEqual(serialized(), before, "double-dollar navigation changed the document");
    },
  },
  {
    name: "Mermaid labels use the document font without clipping theme colors",
    async run() {
      document.documentElement.style.setProperty(
        "--font-doc",
        '"Noto Serif", "Times New Roman", serif',
      );
      await mount(
        [
          "```mermaid",
          "flowchart TD",
          "  A[Choose Your Markdown Editor] --> B{Which}",
          "  B -->|Nota| C[$0.00]",
          "  B -->|Typora| D[$14.99]",
          "```",
        ].join("\n"),
      );
      const svg = await waitFor<SVGSVGElement>(
        '.nota-diagram-preview[data-state="ok"] svg',
        15000,
      );
      for (const label of ["Nota", "Typora", "$0.00", "$14.99"]) {
        assert(
          (svg.textContent ?? "").includes(label),
          `Mermaid SVG lost label text ${JSON.stringify(label)}`,
        );
      }
      const visibleLabel = Array.from(
        svg.querySelectorAll<HTMLElement>("foreignObject div, .nodeLabel, .edgeLabel"),
      ).find((element) => element.textContent?.includes("Choose Your Markdown Editor"));
      assert(visibleLabel, "Mermaid did not render the themed html label");
      assert(
        getComputedStyle(visibleLabel).fontFamily.includes("Noto Serif"),
        `Mermaid ignored the document font: ${getComputedStyle(visibleLabel).fontFamily}`,
      );
      document.documentElement.style.removeProperty("--font-doc");
    },
  },
  {
    name: "Mermaid long-arrow edge labels retain Yes and No text",
    async run() {
      await mount(
        [
          "```mermaid",
          "flowchart TD",
          "  A[Start] --> B{Condition?}",
          "  B -- Yes --> C[Action 1]",
          "  B -- No --> D[Action 2]",
          "  C --> E[End]",
          "  D --> E",
          "```",
        ].join("\n"),
      );
      const svg = await waitFor<SVGSVGElement>(
        '.nota-diagram-preview[data-state="ok"] svg',
        15000,
      );
      for (const label of ["Start", "Condition?", "Yes", "No", "Action 1", "Action 2", "End"]) {
        assert(
          (svg.textContent ?? "").includes(label),
          `Mermaid long-arrow SVG lost label ${JSON.stringify(label)}: ${svg.innerHTML}`,
        );
      }
      const edgeLabels = Array.from(svg.querySelectorAll<SVGGElement>("g.edgeLabel"));
      assertEqual(
        edgeLabels.filter((label) => /Yes|No/.test(label.textContent ?? "")).length,
        2,
        "Mermaid did not render two edge label groups",
      );
      for (const label of edgeLabels) {
        const text = label.querySelector<HTMLElement>("span, div, text");
        assert(text, "Mermaid edge label has no text element");
        const style = getComputedStyle(text);
        assert(style.visibility !== "hidden", "Mermaid edge label is hidden");
        assert(style.opacity !== "0", "Mermaid edge label is transparent");
        assert(style.color !== "rgba(0, 0, 0, 0)", "Mermaid edge label text is transparent");
        const rect = label.getBoundingClientRect();
        assert(
          rect.width > 0 && rect.height > 0,
          `Mermaid edge label collapsed to ${rect.width}x${rect.height}`,
        );
        const svgRect = svg.getBoundingClientRect();
        assert(
          rect.right > svgRect.left &&
            rect.left < svgRect.right &&
            rect.bottom > svgRect.top &&
            rect.top < svgRect.bottom,
          `Mermaid edge label lies outside the visible SVG: label=${JSON.stringify({
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          })} svg=${JSON.stringify({
            left: svgRect.left,
            top: svgRect.top,
            right: svgRect.right,
            bottom: svgRect.bottom,
          })}`,
        );
      }
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
    name: "trailing backslash stays compact before the closing dollar",
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
      assert(
        closingLeft - sourceRight < 1.5,
        `visual gap remains before closing dollar: ${closingLeft - sourceRight}px`,
      );
      assertEqual(
        [...editor!.getMarkdown()].filter((character) => character === "\\").length,
        1,
        "the display gap changed the serialized source",
      );
    },
  },
  {
    name: "LaTeX typography keeps inline dollar-source-dollar tightly packed",
    async run() {
      applyDocTheme(`
        html { font-size: 11pt; }
        body { line-height: 1.38; }
        #write {
          text-align: justify;
          line-break: auto;
          overflow-wrap: break-word;
          hyphens: auto;
        }
        p { margin: 0; text-indent: 1.55em; }
        #write :is(p):lang(zh) { line-height: 1.68; line-break: strict; }
      `);
      try {
        await mount("$\\LaTeX$");
        await openInlineMath();
        await nextFrames();
        const panel = await waitFor<HTMLElement>(".nota-math-inline .nota-math-panel");
        const delimiters = [...panel.querySelectorAll<HTMLElement>(".nota-math-delim")];
        const input = await waitFor<HTMLInputElement>(".nota-math-inline .nota-math-source");
        assertEqual(delimiters.length, 2, "inline formula did not expose two delimiters");
        const left = delimiters[0]!.getBoundingClientRect();
        const right = delimiters[1]!.getBoundingClientRect();
        const source = input.getBoundingClientRect();
        const leftGap = source.left - left.right;
        const rightGap = right.left - source.right;
        assert(
          leftGap < 1.5 && rightGap < 1.5,
          `inline formula has a layout gap: left=${leftGap.toFixed(2)}px right=${rightGap.toFixed(2)}px ` +
            `source=${source.width.toFixed(2)}px`,
        );
        assert(source.width < 100, `source input kept a character-column width: ${source.width.toFixed(2)}px`);

        input.value = "";
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        await nextFrames();
        const emptySource = input.getBoundingClientRect();
        const emptyRight = delimiters[1]!.getBoundingClientRect();
        const emptyRightGap = emptyRight.left - emptySource.right;
        assert(emptySource.width <= 2, `empty source retained a blank slot: ${emptySource.width.toFixed(2)}px`);
        assert(
          emptyRightGap < 1.5,
          `empty formula retained a gap before closing dollar: ${emptyRightGap.toFixed(2)}px`,
        );
      } finally {
        applyDocTheme(null);
      }
    },
  },
  {
    name: "Typora theme keeps headings centred and body text start-aligned",
    async run() {
      applyDocTheme(`
        :root { --text-color: #222222; }
        #write {
          max-width: 420px;
          margin: 0 auto;
          text-align: center;
        }
        p { text-align: center; }
        h1 { text-align: center; }
      `);
      try {
        await mount("# Centred title\n\nLeft body");
        await nextFrames();
        const heading = await waitFor<HTMLElement>(".ProseMirror h1");
        const paragraph = await waitFor<HTMLElement>(".ProseMirror p");
        assertEqual(getComputedStyle(heading).textAlign, "center", "theme heading alignment was lost");
        assertEqual(
          getComputedStyle(paragraph).textAlign,
          "start",
          "Typora body paragraph inherited the theme's centre alignment",
        );
        assert(
          document.querySelector<HTMLElement>(".ProseMirror")!.getBoundingClientRect().width > 0,
          "themed ProseMirror root collapsed to zero-width content",
        );
      } finally {
        applyDocTheme(null);
      }
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
  {
    name: "code block language uses one input for both label and search",
    async run() {
      await mount("```c\n\n```");
      const field = await waitFor<HTMLInputElement>(".nota-code-lang-input");
      assertEqual(field.value, "c", "the collapsed language label was not in the input");
      assertEqual(
        document.querySelector(".nota-code-lang"),
        null,
        "the separate dropdown trigger still exists",
      );

      field.focus();
      await nextFrames();
      const popup = await waitFor<HTMLElement>(".nota-lang-popup");
      const fieldRect = field.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();
      assert(
        Math.abs(fieldRect.left - popupRect.left) <= 1 &&
          Math.abs(fieldRect.width - popupRect.width) <= 1,
        `the language list is not the same box as its input: ` +
          `field=${JSON.stringify(fieldRect.toJSON())}, ` +
          `popup=${JSON.stringify(popupRect.toJSON())}`,
      );
      assertEqual(
        getComputedStyle(field).textAlign,
        "center",
        "the focused language field is not centered",
      );
      assertEqual(
        popup.querySelector(".nota-lang-search, .nota-lang-input"),
        null,
        "the popup repeats the search input",
      );

      field.value = "py";
      field.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: "py",
        }),
      );
      await nextFrames();
      const python = popup.querySelector<HTMLElement>('[data-lang="python"]');
      assert(python, `language search did not expose python: ${popup.textContent}`);
      python.click();
      await nextFrames();
      assertEqual(field.value, "python", "the selected language did not stay in the input");
      assert(
        editor!.getMarkdown().startsWith("```python"),
        `selected language was not written to the fence: ${editor!.getMarkdown()}`,
      );
      assertEqual(
        document.querySelector(".nota-lang-popup"),
        null,
        "the result list stayed open after selection",
      );
    },
  },
  {
    name: "code block language picker is flush with the painted bottom edge across browser zooms",
    async run() {
      for (const zoom of [1, 1.25, 1.5]) {
        document.documentElement.style.zoom = String(zoom);
        await mount("```c\n#include <stdio.h>\nint main()\n```\n");
        const pre = await waitFor<HTMLElement>(".ProseMirror pre");
        const language = await waitFor<HTMLElement>(".nota-code-lang-wrap");
        await nextFrames(4);
        await sleep(250);
        const preBox = pre.getBoundingClientRect();
        const languageBox = language.getBoundingClientRect();
        const gap = languageBox.top - preBox.bottom;
        assert(
          Math.abs(gap) <= 1.5,
          `language picker detached at zoom=${zoom}: gap=${gap}, ` +
            `pre=${JSON.stringify({ top: preBox.top, bottom: preBox.bottom })}, ` +
            `language=${JSON.stringify({ top: languageBox.top, bottom: languageBox.bottom })}`,
        );
        const rightInset = preBox.right - languageBox.right;
        assert(
          Math.abs(rightInset - 8 * zoom) <= 2,
          `language picker misaligned at zoom=${zoom}: ` +
            `inset=${rightInset}, expected=${8 * zoom}`,
        );
      }
      document.documentElement.style.zoom = "";
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
  const only = new URLSearchParams(window.location.search).get("only")?.trim() ?? "";
  const selected = only ? tests.filter((test) => test.name.includes(only)) : tests;
  if (!selected.length) throw new Error(`No E2E scenario matched ${JSON.stringify(only)}`);
  for (const test of selected) {
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
