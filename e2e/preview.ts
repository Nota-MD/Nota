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

const BUILD_MARKER = "2026-11-09-native-caret-important";
const root = document.querySelector<HTMLElement>("#editor");
const diagnostics = document.querySelector<HTMLElement>("#diagnostics");
if (!root || !diagnostics) throw new Error("Preview mount is missing");

let editor: EditorHandle | null = null;

mockIPC((command) => {
  if (command === "nota_spell_check") return [];
  if (command === "nota_debug_log_write") return undefined;
  if (command === "nota_spell_suggest") return [];
  return null;
});

async function waitFor<T extends Element>(
  selector: string,
  timeout = 5000,
): Promise<T> {
  const started = performance.now();
  for (;;) {
    const found = document.querySelector<T>(selector);
    if (found) return found;
    if (performance.now() - started > timeout) {
      throw new Error(`Timed out waiting for ${selector}`);
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function mount(markdown: string, focusCode = true): Promise<void> {
  editor?.destroy();
  root.replaceChildren();
  editor = await createEditor({
    root,
    initialMarkdown: markdown,
    autoLinks: true,
    autoPair: false,
    defaultIndent: 2,
    emoji: true,
    selfActionMoreCorrect: true,
    keyboardExperience: false,
  });
  editor.focusAtStart();
  if (focusCode) {
    const content = await waitFor<HTMLElement>(".nota-code-cm .cm-content");
    content.focus();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }
}

function rectOf(element: Element | null): Record<string, number> | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function drawDiagnostics(): void {
  const content = document.querySelector<HTMLElement>(".nota-code-cm .cm-content");
  const line = document.querySelector<HTMLElement>(".nota-code-cm .cm-line");
  const caret = document.querySelector<HTMLElement>(
    ".nota-code-caret-before, .nota-code-caret-after, .nota-code-empty-caret",
  );
  const nativeCaret = content ? getComputedStyle(content).caretColor : "no content";
  const caretPseudo = caret?.classList.contains("nota-code-caret-after")
    ? "::after"
    : "::before";
  const ownCaret = caret ? getComputedStyle(caret, caretPseudo) : null;
  diagnostics.textContent = [
    `BUILD=${BUILD_MARKER}`,
    `href=${location.href}`,
    `devicePixelRatio=${devicePixelRatio}`,
    `visualViewport.scale=${visualViewport?.scale ?? 1}`,
    `native caret-color=${nativeCaret}`,
    `inline caret guard=${content?.dataset.notaCaretBuild || "missing"}`,
    `own caret hidden=${caret?.hidden ?? "missing"}`,
    `own caret style height=${ownCaret?.height || "auto"}`,
    `own caret opacity=${ownCaret?.opacity ?? "none"}`,
    `own caret rect=${JSON.stringify(rectOf(caret))}`,
    `line rect=${JSON.stringify(rectOf(line))}`,
    `content rect=${JSON.stringify(rectOf(content))}`,
    `active=${document.activeElement?.className || document.activeElement?.tagName || "none"}`,
  ].join("\n");
}

document.querySelector("#normal")?.addEventListener("click", () => {
  void mount("```c\n#include <stdio.h>\nint main()\n```");
});

document.querySelector("#empty")?.addEventListener("click", () => {
  void mount("```c\n\n```");
});

document.querySelector("#reload")?.addEventListener("click", () => {
  location.reload();
});

window.addEventListener("resize", drawDiagnostics);
document.addEventListener("selectionchange", drawDiagnostics);
setInterval(drawDiagnostics, 200);

await mount("```c\nABCD\n```");
drawDiagnostics();
