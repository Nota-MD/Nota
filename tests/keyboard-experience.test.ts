/**
 * Keyboard-experience source reveal for links and images.
 *
 * The feature is intentionally a decoration-only layer. These tests use real
 * ProseMirror schemas and EditorStates so position arithmetic is exercised
 * without requiring a browser or opening the application.
 */

import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { readFileSync } from "node:fs";

import {
  keyboardExperience,
  keyboardExperienceActive,
  keyboardExperienceDecorations,
  keyboardImageSourceClass,
  keyboardLinkEditingBlockClass,
  keyboardLinkHrefAttribute,
  keyboardLinkHiddenClass,
  keyboardLinkMarkerClass,
  keyboardLinkPreviewClass,
  keyboardLinkSourceMarkers,
  keyboardLinkSourceText,
  linkTailInputPosition,
  parseKeyboardLinkSource,
  sourceImageAtCaret,
  sourceLinkAtCaret,
} from "../src/editor/keyboard-experience";

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

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    image: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { src: { default: "" } },
    },
  },
  marks: {
    link: {
      attrs: { href: {} },
      inclusive: false,
    },
  },
});

const linkType = schema.marks.link!;
const imageType = schema.nodes.image!;

function linkState(position: number): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("GFM", [linkType.create({ href: "https://github.com" })]),
      schema.text(" tail"),
    ]),
  ]);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, position),
  });
}

console.log("Keyboard experience");

testCase("link source appears at the start, inside, and immediately after the link", () => {
  for (const position of [1, 3, 4]) {
    equal(sourceLinkAtCaret(linkState(position))?.href, "https://github.com", `position ${position}`);
  }
});

testCase("normal text outside the link does not reveal source", () => {
  equal(sourceLinkAtCaret(linkState(5)), null, "first trailing character");
  equal(sourceLinkAtCaret(linkState(9)), null, "paragraph end beyond trailing text");
});

testCase("only the visual link tail forces following text outside the label", () => {
  equal(linkTailInputPosition(linkState(1)), null, "link start");
  equal(linkTailInputPosition(linkState(2)), null, "inside label");
  equal(linkTailInputPosition(linkState(4)), 4, "immediately after label");
  equal(linkTailInputPosition(linkState(5)), null, "already in trailing text");
});

testCase("a nonempty selection stays in its normal rendered form", () => {
  const base = linkState(1);
  const selection = TextSelection.create(base.doc, 1, 2);
  equal(sourceLinkAtCaret(EditorState.create({ schema, doc: base.doc, selection })), null, "selected label");
});

testCase("image selection reveals its source target", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("A"), imageType.create(), schema.text("B")]),
  ]);
  const state = EditorState.create({
    schema,
    doc,
    selection: NodeSelection.create(doc, 2),
  });
  equal(sourceImageAtCaret(state)?.from, 2, "selection start");
  equal(sourceImageAtCaret(state)?.to, 3, "selection end");
});

testCase("empty carets on either side of an image reveal the same source target", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("A"), imageType.create(), schema.text("B")]),
  ]);
  for (const position of [2, 3]) {
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, position),
    });
    equal(sourceImageAtCaret(state)?.from, 2, `position ${position} start`);
    equal(sourceImageAtCaret(state)?.to, 3, `position ${position} end`);
  }
});

testCase("active link hides its rendered mark and inserts a source editor widget", () => {
  const state = linkState(2);
  const before = state.doc.textContent;
  let renders = 0;
  const decorations = keyboardExperienceDecorations(state, () => {
    renders++;
    return {
      dom: {} as HTMLElement,
      stopEvent: () => true,
      sync: () => {},
      destroy: () => {},
    };
  }, true).find();
  equal(decorations.length, 3, "block class, hidden mark, source widget");
  const block = decorations.find(
    (item) =>
      (item.type as { attrs?: { class?: string } }).attrs?.class ===
      keyboardLinkEditingBlockClass,
  );
  equal(block !== undefined, true, "active block marker");
  const hidden = decorations.find(
    (item) =>
      (item.type as { attrs?: { class?: string } }).attrs?.class ===
      keyboardLinkHiddenClass,
  );
  const widget = decorations.find((item) => item.from === item.to);
  equal((hidden?.type as { attrs?: { class?: string } }).attrs?.class, keyboardLinkHiddenClass, "hidden class");
  equal(widget !== undefined, true, "source widget");
  equal(renders, 1, "one source editor");
  equal(state.doc.textContent, before, "document text");
});

testCase("inactive boundary keeps the real link and shows a non-editable source preview", () => {
  const state = linkState(4);
  const decorations = keyboardExperienceDecorations(state).find();
  equal(decorations.length, 1, "one preview decoration");
  const decorationType = decorations[0]?.type as {
    attrs?: Record<string, string>;
  } | undefined;
  equal(decorationType?.attrs?.class, keyboardLinkPreviewClass, "preview class");
  equal(
    decorationType?.attrs?.[keyboardLinkHrefAttribute],
    "https://github.com",
    "preview href",
  );
});

testCase("newly completed link stays in preview mode; explicit navigation activates the editor", () => {
  const state = linkState(4);
  equal(keyboardExperienceActive(true, true, true, state), false, "typing `)` stays safe for the next character");
  equal(keyboardExperienceActive(false, false, true, state), true, "click or arrow activates source editing");
  equal(keyboardExperienceActive(false, false, false, state, true), true, "explicit activation");
});

testCase("image decoration carries the class consumed by the source textarea CSS", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [imageType.create()]),
  ]);
  const state = EditorState.create({
    schema,
    doc,
    selection: NodeSelection.create(doc, 1),
  });
  const decorations = keyboardExperienceDecorations(state).find();
  equal(decorations.length, 1, "one node decoration");
  const decorationType = decorations[0]?.type as { attrs?: { class?: string } } | undefined;
  equal(decorationType?.attrs?.class, keyboardImageSourceClass, "class");
});

testCase("link marker class is shared by both visual boundaries", () => {
  equal(keyboardLinkMarkerClass, "nota-keyboard-link-source", "class");
});

testCase("visual markers preserve GFM's [label](destination) order", () => {
  const [opening, closing] = keyboardLinkSourceMarkers("https://github.com");
  equal(`${opening}GFM${closing}`, "[GFM](https://github.com)", "source order");
});

testCase("source text can be edited and parsed back into the same link", () => {
  const source = keyboardLinkSourceText({
    from: 1,
    to: 4,
    label: "gfm",
    href: "https://github.com",
  });
  equal(source, "[gfm](https://github.com)", "source");
  const parsed = parseKeyboardLinkSource(source);
  equal(parsed?.label, "gfm", "label");
  equal(parsed?.href, "https://github.com", "href");
});

testCase("the optional plugin is not installed when disabled", () => {
  equal(keyboardExperience(false).length, 0, "disabled plugin list");
});

testCase("the editor, settings and click path are wired to the same switch", () => {
  const assemble = readFileSync("src/editor/assemble.ts", "utf8");
  const area = readFileSync("src/ui/EditorArea.tsx", "utf8");
  const pane = readFileSync("src/ui/EditorPane.tsx", "utf8");
  const clicks = readFileSync("src/ui/useLinkClick.ts", "utf8");
  const settingsPane = readFileSync("src/ui/settings/panes/EditorPane.tsx", "utf8");
  const rustSettings = readFileSync("src-tauri/src/settings/editor.rs", "utf8");

  equal(
    assemble.includes("linkSourceReveal") &&
      assemble.includes("linkSourceNodePlugins"),
    true,
    "Textus-style link source plugin",
  );
  equal(area.includes("keyboard_experience"), true, "settings passed to editor");
  equal(pane.includes("keyboardExperience"), true, "editor option");
  equal(clicks.includes("if (keyboardExperience)"), true, "click keeps editing");
  equal(
    clicks.includes('new CustomEvent("nota-focus-link-source"'),
    true,
    "click requests source focus",
  );
  equal(settingsPane.includes("keyboard_experience"), true, "settings switch");
  equal(rustSettings.includes("pub keyboard_experience: bool"), true, "persisted setting");
});

testCase("styles reveal both media kinds without touching document text", () => {
  const marks = readFileSync("src/styles/marks.css", "utf8");
  const source3 = readFileSync("src/editor/keyboard-experience.ts", "utf8");
  const video = readFileSync("src/styles/video.css", "utf8");
  equal(marks.includes(".nota-keyboard-link-source"), true, "link source style");
  equal(
    marks.includes("caret-color: var(--accent) !important"),
    true,
    "source caret escapes the transparent editor caret rule",
  );
  equal(marks.includes("color: var(--link)"), true, "source label uses link emphasis");
  equal(marks.includes(".nota-keyboard-link-source-ruler"), true, "pixel-width ruler");
  equal(marks.includes(".nota-keyboard-link-source-mirror"), true, "styled source mirror");
  equal(
    marks.includes("-webkit-text-fill-color: transparent"),
    true,
    "input text sits over the mirror",
  );
  equal(source3.includes("fitInlineSourceWidth"), true, "source uses measured text width");
  equal(source3.includes("input.size ="), false, "source no longer uses character columns");
  equal(source3.includes("if (!box.isConnected) return;"), true, "detached widget is not measured");
  equal(source3.includes('input.addEventListener("focus", resize)'), true, "refocus remeasures");
  equal(source3.includes("redrawAfterMount"), true, "reattach remeasures");
  equal(source3.includes("event.stopPropagation()"), true, "source events do not reach Vim");
  equal(source3.includes("handleDOMEvents"), true, "click can focus the source surface");
  equal(source3.includes("keyboardLinkPreviewClass"), true, "whole preview is a click target");
  equal(
    source3.includes("linkTailInputPosition(view.state)"),
    true,
    "WebKit DOM drift is corrected at the link tail",
  );
  equal(source3.includes('pendingDirection = "position"'), true, "click uses the link selection");
  equal(source3.includes("focusLatestWhenReady"), true, "focus waits across layout frames");
  equal(source3.includes('"nota-focus-link-source"'), true, "direct source focus event");
  equal(
    source3.includes(".setMeta(VIM_INPUT_META, true)"),
    true,
    "source commits survive Vim transaction filtering",
  );
  equal(marks.includes(".nota-keyboard-link-label"), true, "label uses link emphasis");
  equal(marks.includes(".nota-keyboard-link-href"), true, "href keeps body color with underline");
  equal(
    marks.includes(".nota-keyboard-link-editing-block"),
    true,
    "source mode suppresses Vim block cursor",
  );
  equal(marks.includes(".nota-keyboard-link-original"), true, "rendered link hidden while editing source");
  equal(video.includes(".nota-keyboard-media-source"), true, "image source style");
  equal(video.includes("display: block;"), true, "image source becomes visible");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
