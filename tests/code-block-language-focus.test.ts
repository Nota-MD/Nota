/** Focus and empty-block behavior after code-block language selection. */

import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const picker = readFileSync("src/editor/lang-picker.ts", "utf8");
const block = readFileSync("src/editor/code-block.ts", "utf8");
const cm = readFileSync("src/editor/code-block-cm.ts", "utf8");
const blocksCss = readFileSync("src/styles/editor-blocks.css", "utf8");
const editorCss = readFileSync("src/styles/editor.css", "utf8");
const chromeCss = readFileSync("src/styles/code-block.css", "utf8");
const diagramCss = readFileSync("src/styles/diagram.css", "utf8");
const diagrams = readFileSync("src/editor/diagram-view.ts", "utf8");
const diagramRender = readFileSync("src/editor/diagram-render.ts", "utf8");

console.log("\n[Code-block language behavior]");

testCase("mouse selection and Enter both restore focus to the code editor", () => {
  assertValue(picker.includes("restoreFocus?: () => void"), "the language picker has no focus-restore hook");
  assertValue(
    (picker.match(/queueMicrotask\(\(\) => \{/g) ?? []).length >= 2,
    "submitting by pointer or Enter does not restore focus after the popup unmounts",
  );
  assertValue(
    block.includes("restoreFocus: () => codeEditor?.clusterFocus()"),
    "the code block does not return focus to CodeMirror",
  );
});

testCase("changing a language updates node attributes without replacing code or caret", () => {
  const start = block.indexOf("const applyLanguage");
  const end = block.indexOf('const langWrap = document.createElement("span")', start);
  const implementation = block.slice(start, end);
  assertValue(implementation.includes("setNodeMarkup"), "language changes are not written to node attributes");
  assertValue(!implementation.includes("replaceWith"), "language changes still replace the block");
  assertValue(!implementation.includes("insertText"), "language changes still insert text");
});

testCase("empty code blocks keep one real line and the picker is separate from code input", () => {
  assertValue(block.includes('code.className = "nota-code-text"'), "the ProseMirror code content layer is missing");
  assertValue(block.includes('langWrap.className = "nota-code-lang-wrap"'), "the language picker is not in a separate widget layer");
  assertValue(block.includes("bootstrap, langWrap"), "the language picker is still mixed into the code content layer");
});

testCase("code editing and token descendants always use the theme monospace font", () => {
  assertValue(cm.includes('fontFamily: "var(--font-mono)"'), "the CodeMirror root does not bind the theme monospace font");
  assertValue(
    /\.nota-source-surface \.cm-editor \*\s*\{[^}]*font-family:\s*var\(--font-mono\)/s.test(blocksCss),
    "CodeMirror descendants have no complete monospace fallback",
  );
  assertValue(
    blocksCss.includes(".nota-source-surface .cm-editor *"),
    "the monospace fallback is not attached to the shared source surface",
  );
  assertValue(
    /\.cm-content:focus-visible\s*\{[^}]*outline:\s*none !important/s.test(blocksCss),
    "the CodeMirror contenteditable focus outline still appears",
  );
});

testCase("source surfaces force left alignment against diagram-theme centering", () => {
  const css = readFileSync(`${process.cwd()}/src/styles/editor-blocks.css`, "utf8");
  assertValue(
    /\.nota-source-surface[\s\S]*?\.cm-line\s*\{[^}]*text-align:\s*left\s*!important/s.test(css),
    "source surfaces do not override inherited diagram-panel centering",
  );
});

testCase("the hidden ProseMirror text layer does not participate in selection or hit testing", () => {
  const rule = chromeCss.match(
    /\.editor-mount \.ProseMirror pre \.nota-code-text\s*\{([\s\S]*?)\n\}/,
  )?.[1];
  assertValue(rule, "the hidden code-content rule was not found");
  assertValue(/left:\s*-100000px !important;/.test(rule), "the hidden code layer still overlaps the viewport");
  assertValue(/display:\s*block !important;/.test(rule), "document themes can make the hidden layer inline");
  assertValue(/visibility:\s*hidden !important;/.test(rule), "the hidden code layer can still be painted");
  assertValue(/pointer-events:\s*none !important;/.test(rule), "the hidden code layer still receives pointer events");
  assertValue(/user-select:\s*none !important;/.test(rule), "native selection can still paint the hidden code layer");
  assertValue(/-webkit-user-select:\s*none !important;/.test(rule), "WebKit can still select the hidden code layer");
  assertValue(
    block.includes('code.style.setProperty(property, value, "important")'),
    "critical hidden-layer styles are not inline-important against third-party themes",
  );
  assertValue(
    block.includes('code.setAttribute("aria-hidden", "true")'),
    "the hidden code layer is still exposed to the accessibility tree",
  );
});

testCase("code padding stays compact and line-number gutters stay aligned", () => {
  assertValue(
    /\.editor-mount \.ProseMirror pre,[\s\S]*?\.nota-source-surface\s*\{[\s\S]*?padding:\s*8px 14px;/s.test(
      blocksCss,
    ),
    "code blocks still use excessive vertical padding",
  );
  assertValue(
    block.includes("nativeLineNumbers: true"),
    "regular code blocks do not share CodeMirror line numbers with Mermaid and LaTeX",
  );
  assertValue(
    !block.includes('gutter.className = "nota-code-gutter"'),
    "the legacy separate gutter is still created",
  );
});

testCase("external document themes cannot clip the language picker below code blocks", () => {
  assertValue(
    /\.editor-mount \.ProseMirror pre\s*\{[^}]*overflow:\s*visible !important;/s.test(
      blocksCss,
    ),
    "external themes can still force code-block overflow to auto",
  );
  assertValue(
    /\.nota-code-wrap\s*\{[^}]*overflow:\s*visible;/s.test(chromeCss),
    "the code-block wrapper can still clip the language picker",
  );
});

testCase("code frames are lighter and fold/copy buttons are removed", () => {
  assertValue(
    blocksCss.includes("background: color-mix(in srgb, var(--bg-subtle) 76%, var(--doc-bg));"),
    "code blocks still use a heavy background",
  );
  assertValue(
    /\.editor-mount \.ProseMirror pre,[\s\S]*?\.nota-source-surface\s*\{[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?border-color:\s*color-mix\(in srgb, var\(--border\) 62%, transparent\)/s.test(
      blocksCss,
    ),
    "the shared source-surface border lacks a fallback or remains too heavy",
  );
  assertValue(!block.includes("foldBtn"), "a fold button is still created");
  assertValue(!block.includes("copyBtn"), "a copy button is still created");
  assertValue(!block.includes("nota-code-bar"), "a code toolbar container is still created");
  assertValue(!chromeCss.includes(".nota-code-bar"), "legacy code-toolbar styles remain");
});

testCase("code frames retain border and background without color-mix support", () => {
  assertValue(
    /\.editor-mount \.ProseMirror pre,[\s\S]*?\.nota-source-surface\s*\{[\s\S]*?border:\s*1px solid var\(--border\);[\s\S]*?background:\s*var\(--bg-subtle\);[\s\S]*?background:\s*color-mix\(/s.test(
      blocksCss,
    ),
    "code blocks do not provide solid border and background fallbacks before color-mix",
  );
});

testCase("language selection has one editable input and one result list", () => {
  assertValue(chromeCss.includes("width: clamp(148px, 28%, 280px);"), "the language input is still too narrow");
  assertValue(
    /\.nota-code-lang-wrap\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*-24px;[\s\S]*?height:\s*24px;/s.test(
      chromeCss,
    ),
    "the language picker is not anchored to the code-block bottom and leaves a WebView2 gap",
  );
  assertValue(
    /\.nota-lang-popup\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?min-width:\s*0;/s.test(
      chromeCss,
    ),
    "the language popup still has a separate minimum width",
  );
  assertValue(
    picker.includes('pop.style.width = `${r.width}px`') &&
      picker.includes('pop.style.minWidth = "0"'),
    "the language popup does not reuse the input width",
  );
  assertValue(
    picker.includes('optionName.className = "nota-lang-option-name"'),
    "long language names have no ellipsis layer",
  );
  assertValue(
    /\.nota-code-lang-input\s*\{[\s\S]*?height:\s*24px/s.test(chromeCss),
    "the single language input does not replace the old disclosure control",
  );
  assertValue(
    /\.nota-code-lang-input:focus\s*\{[^}]*text-align:\s*center/s.test(chromeCss),
    "the language input does not remain centered when focused",
  );
  assertValue(
    picker.includes('field.className = "nota-code-lang-input"'),
    "the language picker does not use the single input",
  );
  assertValue(
    !picker.includes("nota-lang-search") &&
      !picker.includes('document.createElement("button")'),
    "the language picker still has a separate trigger and duplicate search input",
  );
  assertValue(picker.includes("const popupMostLargeHeight = 360;"), "the language list height is still too short");
});

testCase("language picker follows theme tokens and gfm gets Markdown colors", () => {
  assertValue(picker.includes('"--bg-hover"'), "picker does not inherit hover color");
  assertValue(picker.includes('"--border"'), "picker does not inherit document border");
  assertValue(picker.includes('"--fg-faint"'), "picker does not inherit faint text");
  assertValue(picker.includes('"--radius-lg"'), "picker does not inherit theme radius");
  assertValue(picker.includes('"--popup-shadow"'), "picker does not inherit popup shadow");
  assertValue(
    /\.nota-lang-popup\s*\{[\s\S]*?border-radius:\s*var\(--radius-lg,\s*var\(--radius,\s*9px\)\)/s.test(
      chromeCss,
    ),
    "popup still hard-codes a rounded corner",
  );
  assertValue(
    /\.nota-lang-opt-on,[\s\S]*?\{[^}]*box-shadow:\s*inset 2px 0 0 var\(--accent\)/s.test(
      chromeCss,
    ),
    "selected language does not use the theme accent",
  );
  assertValue(
    cm.includes('gfm: "markdown"') && cm.includes("languageAlias[language.toLowerCase()]"),
    "gfm is not highlighted as Markdown",
  );
  assertValue(
    /\.nota-code-lang-input\s*\{[\s\S]*?box-shadow:\s*none;/s.test(chromeCss),
    "native language input shadow remains",
  );
});

testCase("mindmaps pass explicit mode and complete node colors to Mermaid", () => {
  assertValue(diagramRender.includes("darkMode: dark"), "mindmaps do not pass explicit light/dark mode");
  assertValue(diagramRender.includes("mainBkg: surface"), "the main-node background is missing");
  assertValue(diagramRender.includes("nodeBorder: border"), "the node border color is missing");
  assertValue(diagramRender.includes("edgeLabelBackground: paper"), "the edge-label background is missing");
  assertValue(diagramRender.includes("cScaleLabel${i}`] = text3"), "branch labels do not follow the light/dark palette");
  assertValue(
    /\.mindmap-edges path,\s*\.mindmap-edges \.edge\s*\{[^}]*stroke:\s*\$\{theme\.mode/s.test(diagramRender),
    "mindmap edges have no high-contrast style independent of node fill",
  );
  assertValue(
    diagramRender.includes("text-anchor: middle !important"),
    "mindmap node text is not centered by default",
  );
  assertValue(
    diagramRender.includes("justify-content: center !important"),
    "mindmap HTML labels are not centered by default",
  );
  assertValue(
    /\.nota-diagram-preview\s*\{[^}]*background:\s*var\(--doc-bg,\s*var\(--bg\)\)/s.test(diagramCss),
    "diagram previews still use the shell background instead of the document background",
  );
  assertValue(
    /\.nota-diagram\s*\{[^}]*max-width:\s*none\s*!important/s.test(diagramCss),
    "Mermaid is still constrained by prose width",
  );
  assertValue(
    /\.nota-diagram-preview svg\s*\{[^}]*width:\s*auto;/s.test(diagramCss) &&
      !/\.nota-diagram-preview svg\s*\{[^}]*width:\s*auto\s*!important/s.test(diagramCss),
    "Mermaid SVG CSS still overrides runtime width",
  );
  assertValue(
    /\.nota-diagram-preview\s*\{[\s\S]*?max-height:\s*min\(72vh,\s*760px\);[\s\S]*?overflow:\s*auto/s.test(diagramCss),
    "large diagrams are not bounded by the editor viewport",
  );
  assertValue(
    diagrams.includes("image.viewBox.baseVal.width") &&
      diagrams.includes("fitDiagramToPreview") &&
      diagrams.includes('image.style.setProperty("max-width", "100%", "important")') &&
      diagrams.includes("new ResizeObserver(fitDiagramToPreview)") &&
      diagrams.includes("availableHeight") &&
      diagrams.includes("fitDiagramSize"),
    "Mermaid does not fit both preview dimensions and recompute on resize",
  );
});

testCase("Mermaid source appears only while the active diagram has focus", () => {
  assertValue(
    /\.nota-diagram-source-shell\s*\{[^}]*display:\s*none/s.test(diagramCss),
    "the diagram source box is permanently visible",
  );
  assertValue(
    /\.nota-diagram-editing\s+\.nota-diagram-source-shell\s*\{[^}]*display:\s*block/s.test(diagramCss),
    "the source box does not expand when the diagram enters editing",
  );
  assertValue(
    diagrams.includes('dom.classList.add("nota-diagram-editing")'),
    "the diagram view has no editing-state class",
  );
  assertValue(
    diagrams.includes('preview.addEventListener("mousedown"'),
    "clicking the rendered diagram cannot enter source editing",
  );
  assertValue(
    diagrams.includes("nativeLineNumbers: true"),
    "Mermaid CodeMirror does not use global line-number settings",
  );
});

testCase("embedded CodeMirror follows the global line-number switch in real time", () => {
  const source = readFileSync("src/editor/code-block-cm.ts", "utf8");
  assertValue(
    source.includes('attributeFilter: ["data-code-wrap", "data-code-line-numbers"]'),
    "CodeMirror does not observe line-number setting changes",
  );
  assertValue(
    source.includes("lineNumberCabin.reconfigure(wantLineNumbers() ? lineNumbers() : [])"),
    "CodeMirror cannot reconfigure line numbers immediately",
  );
});

testCase("code blocks pair brackets and quotes while backticks stay literal", () => {
  assertValue(cm.includes('from "@codemirror/autocomplete"'), "the CodeMirror bracket-pairing extension is not loaded");
  assertValue(cm.includes("...closeBracketsKeymap"), "bracket-pair keybindings are not wired");
  assertValue(cm.includes("closeBrackets()"), "bracket pairing is not enabled");
  assertValue(
    cm.includes('brackets: ["(", "[", "{", "\'", \'"\']'),
    "the pairing list is missing common brackets or quotes",
  );
  assertValue(
    !cm.includes('brackets: ["(", "[", "{", "\'", \'"\', "`"]'),
    "backticks are still auto-paired",
  );
});

testCase("embedded code blocks bind the caret to real characters or empty lines", () => {
  assertValue(!cm.includes("drawSelection()"), "code blocks still enable the CodeMirror caret layer");
  assertValue(cm.includes("class CodeBlockCaret"), "code blocks have no custom caret overlay");
  assertValue(
    cm.includes("Decoration.mark({ class: caretAfterClass })") &&
      cm.includes("Decoration.mark({ class: caretBeforeClass })") &&
      cm.includes("Decoration.line({ class: emptyCaretClass })"),
    "the code caret is not bound to a character or empty line",
  );
  assertValue(
    !cm.includes("Decoration.widget") && !cm.includes("WidgetType"),
    "code blocks still use a WebKit-wrappable widget at line ends",
  );
  assertValue(
    blocksCss.includes(".nota-code-caret-before") &&
      blocksCss.includes(".nota-code-caret-after") &&
      blocksCss.includes(".nota-code-empty-caret"),
    "the code caret overlay has no styles",
  );
  assertValue(
    /\.nota-code-caret-after::after\s*\{[^}]*left:\s*calc\(100% - 1px\)/s.test(
      blocksCss,
    ),
    "the line-end caret is not bound to the previous character's right edge",
  );
  assertValue(
    /:is\(\.nota-code-caret-before,\s*\.nota-code-empty-caret\)::before\s*\{[^}]*left:\s*-1px/s.test(
      blocksCss,
    ),
    "line-start and empty-line carets are not bound to the character's left edge",
  );
  assertValue(
    /\.editor-mount \.ProseMirror \.nota-code-cm \.cm-content,[\s\S]*?\.editor-mount \.ProseMirror \.nota-code-cm \.cm-line\s*\{[^}]*caret-color:\s*transparent\s*!important/s.test(
      editorCss,
    ),
    "generic native caret rules still override the code block's transparent caret",
  );
  assertValue(
    cm.includes("inline-mark-v8") &&
      cm.includes("forced-color-adjust") &&
      cm.includes("rgba(0, 0, 0, 0)"),
    "code blocks lack an inline transparent-caret fallback that WebView2 can override",
  );
});

testCase("code blocks hand control back to the native caret during IME composition", () => {
  assertValue(
    cm.includes("const imeNativeCaret = EditorView.domEventHandlers"),
    "code blocks do not observe IME composition events",
  );
  assertValue(
    cm.includes('compositionstart(_event, view)') &&
      cm.includes('caret-color", "var(--accent)"'),
    "code blocks do not show a native caret during preedit",
  );
  assertValue(
    cm.includes('contentDOM.classList.add(imeComposingClass)') &&
      cm.includes('contentDOM.classList.remove(imeComposingClass)'),
    "code blocks do not switch caret ownership at composition boundaries",
  );
  assertValue(
    /\.cm-content\.nota-ime-composing[\s\S]*?\.nota-code-caret-after::after\s*\{[\s\S]*?display:\s*none\s*!important/s.test(
      editorCss,
    ),
    "code blocks can still show both carets during composition",
  );
});

testCase("the language picker follows real layout coordinates at the code-block bottom", () => {
  assertValue(block.includes("placeLanguagePicker"), "the language picker has no runtime positioning");
  assertValue(
    block.includes("langWrap.offsetParent") &&
      block.includes("pre.offsetHeight - pre.clientTop"),
    "language-picker positioning does not use browser-zoom-safe layout dimensions",
  );
  assertValue(
    block.includes('document.addEventListener("scroll"') &&
      block.includes("languageLayoutObserver"),
    "the language picker is not realigned after scroll and resize",
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
