/**
 * Optional caret-boundary source reveal for links and images.
 *
 * Links keep their normal ProseMirror mark and image nodes keep their normal
 * attrs. The active link source is an editing surface: it commits back only
 * when the user leaves it. Hovering does nothing, and the document never gains
 * presentation brackets, URLs or placeholder text.
 */

import { $prose } from "@milkdown/kit/utils";
import {
  AllSelection,
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@milkdown/kit/prose/state";
import {
  Decoration,
  DecorationSet,
} from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";

import { linkRange } from "./link-edit";
import { explicitLinkSyntax, normalizeExplicitLinkDestination } from "./url-link";
import {
  fitInlineSourceWidth,
  redrawAfterMount,
  watchFontMetrics,
} from "./math-inline-measure";
import { VIM_INPUT_META } from "./plugin-vim-ops";

export const keyboardLinkMarkerClass = "nota-keyboard-link-source";
export const keyboardLinkPreviewClass = "nota-keyboard-link-preview";
export const keyboardImageSourceClass = "nota-keyboard-media-source";
export const keyboardLinkHiddenClass = "nota-keyboard-link-original";
export const keyboardLinkEditingBlockClass = "nota-keyboard-link-editing-block";
export const keyboardLinkHrefAttribute = "data-nota-link-href";

export interface keyboardLinkSource {
  from: number;
  to: number;
  label: string;
  href: string;
}

export interface keyboardImageSource {
  from: number;
  to: number;
}

/** Exact visual pieces wrapped around the still-rendered link label. */
export function keyboardLinkSourceMarkers(href: string): readonly [string, string] {
  return ["[", `](${href})`];
}

export function keyboardLinkSourceText(link: keyboardLinkSource): string {
  const [opening, closing] = keyboardLinkSourceMarkers(link.href);
  return `${opening}${link.label}${closing}`;
}

export function parseKeyboardLinkSource(
  source: string,
): { label: string; href: string } | null {
  const match = explicitLinkSyntax.exec(source);
  if (!match) return null;
  const label = match[1] ?? "";
  const href = normalizeExplicitLinkDestination(match[2] ?? "");
  return label && href !== null ? { label, href } : null;
}

/**
 * The link touched by an empty caret.
 *
 * `linkRange` already defines the useful boundaries for a text mark: the first
 * label character, every interior position, and the position immediately after
 * the final character. Keeping that judgement in one place avoids a second,
 * subtly different "inside a link" rule here.
 */
export function sourceLinkAtCaret(state: EditorState): keyboardLinkSource | null {
  if (!state.selection.empty) return null;
  return linkRange(state.doc, state.selection.from);
}

/**
 * The document position where ordinary text typed at a link's trailing edge
 * must be inserted.
 *
 * WebKitGTK can report the DOM text-input position one character before the
 * real end when the link carries our non-editable source preview decoration.
 * ProseMirror's state selection is still on `link.to`, so use that authoritative
 * boundary and let the plugin insert the character explicitly. Otherwise text
 * typed immediately after completing `[label](href)` can land inside the label.
 */
export function linkTailInputPosition(state: EditorState): number | null {
  if (!state.selection.empty) return null;
  const link = sourceLinkAtCaret(state);
  return link && state.selection.from === link.to ? link.to : null;
}

/**
 * Resolve an arrow at the visual edge of the source editor to document space.
 *
 * The first and last source characters are `[` and `)`. A collapsed caret
 * immediately inside either delimiter is already at the visual edge, so one
 * more arrow must leave the link instead of parking on an invisible input
 * boundary. Parking there makes the next typed character look as if it belongs
 * to the document while it is actually buffered inside the source input.
 */
export function sourceArrowExit(
  source: string,
  caret: number,
  key: string,
): "before" | "after" | null {
  if (key === "ArrowLeft" && caret <= 1) return "before";
  if (key === "ArrowRight" && caret >= source.length - 1) return "after";
  return null;
}

/**
 * The image selected by the caret or directly adjacent to an empty caret.
 *
 * Image is an inline atom, so ProseMirror commonly represents "the caret is at
 * an image boundary" as a NodeSelection. Empty boundary carets are supported
 * too; both forms mean the same thing to the writer.
 */
export function sourceImageAtCaret(state: EditorState): keyboardImageSource | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    return selection.node.type.name === "image"
      ? { from: selection.from, to: selection.to }
      : null;
  }
  if (!selection.empty) return null;

  const position = state.doc.resolve(selection.from);
  const before = position.nodeBefore;
  if (before?.type.name === "image") {
    return { from: selection.from - before.nodeSize, to: selection.from };
  }
  const after = position.nodeAfter;
  if (after?.type.name === "image") {
    return { from: selection.from, to: selection.from + after.nodeSize };
  }
  return null;
}

interface renderedLinkSource {
  dom: HTMLElement;
  stopEvent: (event: Event) => boolean;
  sync: (link: keyboardLinkSource) => void;
  destroy: () => void;
}

/**
 * Build all source hints for the current selection.
 *
 * The production renderer supplies a real inline input so every source
 * character has a native caret position. Tests may pass a plain DOM-shaped
 * placeholder because Decoration widgets are only mounted by a real editor
 * view.
 */
export function keyboardExperienceDecorations(
  state: EditorState,
  renderLinkSource?: (link: keyboardLinkSource) => renderedLinkSource,
  editing = false,
): DecorationSet {
  const decorations: Decoration[] = [];
  const link = sourceLinkAtCaret(state);
  if (link && editing && renderLinkSource) {
    const resolved = state.doc.resolve(link.from);
    const block = resolved.node(resolved.depth);
    const blockFrom = resolved.before(resolved.depth);
    decorations.push(
      Decoration.node(blockFrom, blockFrom + block.nodeSize, {
        class: keyboardLinkEditingBlockClass,
      }),
      Decoration.inline(link.from, link.to, {
        class: keyboardLinkHiddenClass,
      }),
      (() => {
        const rendered = renderLinkSource(link);
        return Decoration.widget(link.from, rendered.dom, {
        side: -1,
        key: `keyboard-link-source:${link.from}:${link.to}:${link.href}:${link.label}`,
          stopEvent: rendered.stopEvent,
        });
      })(),
    );
  } else if (link) {
    decorations.push(
      Decoration.inline(link.from, link.to, {
        class: keyboardLinkPreviewClass,
        [keyboardLinkHrefAttribute]: link.href,
      }),
    );
  }

  const image = sourceImageAtCaret(state);
  if (image) {
    decorations.push(
      Decoration.node(image.from, image.to, {
        class: keyboardImageSourceClass,
      }),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}

interface keyboardExperienceState {
  active: boolean;
  decorations: DecorationSet;
}

export function keyboardExperienceActive(
  previous: boolean,
  docChanged: boolean,
  selectionSet: boolean,
  state: EditorState,
  forced = false,
): boolean {
  if (forced) return true;
  if (docChanged) return false;
  if (selectionSet) return Boolean(sourceLinkAtCaret(state));
  return previous;
}

export const keyboardExperienceKey = new PluginKey<keyboardExperienceState>(
  "nota-keyboard-experience",
);

function focusSourceInput(
  view: EditorView,
  editor: { input: HTMLInputElement; link: keyboardLinkSource },
  direction: "left" | "right" | "position",
): void {
  const { input, link } = editor;
  if (!input.isConnected) return;
  const source = keyboardLinkSourceText(link);
  const position = view.state.selection.from;
  let caret = position <= link.from
    ? 0
    : position >= link.to
      ? source.length
      : Math.min(source.length, 1 + position - link.from);
  if (direction === "left" && caret > 0) caret -= 1;
  if (direction === "right" && caret < source.length) caret += 1;
  input.focus({ preventScroll: true });
  input.setSelectionRange(caret, caret);
}

function renderSourceContents(source: HTMLElement, textContent: string): void {
  const labelStart = textContent.indexOf("[");
  const labelEnd = textContent.indexOf("](", Math.max(0, labelStart + 1));
  if (labelStart < 0 || labelEnd < 0) {
    source.textContent = textContent;
    return;
  }
  const label = document.createElement("span");
  label.className = "nota-keyboard-link-label";
  label.textContent = textContent.slice(labelStart + 1, labelEnd);
  const href = document.createElement("span");
  href.className = "nota-keyboard-link-href";
  href.textContent = textContent.slice(labelEnd + 2, Math.max(labelEnd + 2, textContent.length - 1));
  source.replaceChildren(
    textContent.slice(0, labelStart + 1),
    label,
    textContent.slice(labelEnd, labelEnd + 2),
    href,
    textContent.slice(Math.max(labelEnd + 2, textContent.length - 1)),
  );
}

export function keyboardExperience(enabled = true) {
  if (!enabled) return [];
  return $prose(
    () => {
      let activeView: EditorView | null = null;
      let latest: {
        input: HTMLInputElement;
        link: keyboardLinkSource;
        done: boolean;
      } | null = null;
      let pendingFocus: number | null = null;
      let pendingDirection: "left" | "right" | "position" = "position";
      const renderedSources = new Map<string, renderedLinkSource>();

      const focusLatestWhenReady = (
        view: EditorView,
        direction: "left" | "right" | "position" = "position",
        attempt = 0,
      ) => {
        if (view.isDestroyed || attempt > 8) return;
        requestAnimationFrame(() => {
          if (
            latest &&
            !latest.done &&
            latest.input.isConnected &&
            keyboardExperienceKey.getState(view.state)?.active
          ) {
            focusSourceInput(view, latest, direction);
            return;
          }
          focusLatestWhenReady(view, direction, attempt + 1);
        });
      };

      const settleFocus = (view: EditorView) => {
        if (pendingFocus !== null) {
          cancelAnimationFrame(pendingFocus);
          pendingFocus = null;
        }
        pendingFocus = requestAnimationFrame(() => {
          pendingFocus = null;
          if (view.isDestroyed || !latest || latest.done) return;
          if (!keyboardExperienceKey.getState(view.state)?.active) return;
          const link = sourceLinkAtCaret(view.state);
          if (!link || link.from !== latest.link.from || link.to !== latest.link.to) return;
          focusLatestWhenReady(view, pendingDirection);
          pendingDirection = "position";
        });
      };

      const commit = (
        view: EditorView,
        exit?: "before" | "after",
        externalText = "",
      ): void => {
        if (!latest || latest.done) return;
        const { input, link } = latest;
        latest.done = true;
        const parsed = parseKeyboardLinkSource(input.value);
        const linkType = view.state.schema.marks.link;
        const unchanged =
          !parsed || (parsed.label === link.label && parsed.href === link.href);
        const nextEnd = parsed ? link.from + parsed.label.length : link.to;
        if (parsed && linkType) {
          const transaction = view.state.tr
            .replaceWith(
              link.from,
              link.to,
              view.state.schema.text(parsed.label, [
                linkType.create({ href: parsed.href }),
              ]),
            )
            .removeStoredMark(linkType)
            // Vim normal mode filters ordinary document transactions. Source
            // editing is an explicit editor surface, so its commit is trusted.
            .setMeta(VIM_INPUT_META, true);
          if (exit) {
            const target = exit === "before" ? link.from : nextEnd;
            transaction.setSelection(
              TextSelection.create(transaction.doc, target),
            );
            if (externalText) transaction.insertText(externalText);
          }
          if (!unchanged || exit || externalText) view.dispatch(transaction);
        } else if (exit) {
          const transaction = view.state.tr
            .setSelection(
              TextSelection.create(
                view.state.doc,
                exit === "before" ? link.from : link.to,
              ),
            )
            .setMeta(VIM_INPUT_META, true);
          if (externalText) transaction.insertText(externalText);
          view.dispatch(transaction);
        }
        if (exit) view.focus();
      };

      const sourceEdgeForInput = (
        input: HTMLInputElement,
      ): "before" | "after" | null => {
        if (input.selectionStart !== input.selectionEnd) return null;
        if (input.selectionStart === 0) return "before";
        if (input.selectionStart === input.value.length) return "after";
        return null;
      };

      const renderLinkSource = (link: keyboardLinkSource): renderedLinkSource => {
        const key = `${link.from}:${link.to}:${link.href}:${link.label}`;
        const cached = renderedSources.get(key);
        if (cached) {
          cached.sync(link);
          latest = {
            input: cached.dom.querySelector(
              `.${keyboardLinkMarkerClass}`,
            ) as HTMLInputElement,
            link,
            done: false,
          };
          return cached;
        }
        const box = document.createElement("span");
        box.className = "nota-keyboard-link-source-wrap";
        const mirror = document.createElement("span");
        mirror.className = "nota-keyboard-link-source-mirror";
        mirror.setAttribute("aria-hidden", "true");
        renderSourceContents(mirror, keyboardLinkSourceText(link));
        const input = document.createElement("input");
        input.type = "text";
        input.className = keyboardLinkMarkerClass;
        input.value = keyboardLinkSourceText(link);
        input.spellcheck = false;
        input.autocomplete = "off";
        input.setAttribute("aria-label", "Markdown link source");
        input.style.width = `${Math.max(1, Array.from(input.value).length)}ch`;
        const ruler = document.createElement("span");
        ruler.className = "nota-keyboard-link-source-ruler";
        ruler.setAttribute("aria-hidden", "true");
        box.append(mirror, input, ruler);
        latest = { input, link, done: false };
        const resize = () => {
          if (!box.isConnected) return;
          fitInlineSourceWidth(input, ruler, input.value, "");
        };
        const stopWatchingFonts = watchFontMetrics(resize);
        const containEditorEvent = (event: Event) => event.stopPropagation();
        input.addEventListener("beforeinput", containEditorEvent);
        input.addEventListener("beforeinput", (event) => {
          const before = event as InputEvent;
          if (before.inputType !== "insertText" || !before.data) return;
          const edge = sourceEdgeForInput(input);
          if (!edge || !activeView) return;
          event.preventDefault();
          commit(activeView, edge, before.data);
        });
        input.addEventListener("compositionstart", (event) => {
          containEditorEvent(event);
          input.classList.add("is-composing");
          mirror.hidden = true;
        });
        input.addEventListener("compositionend", (event) => {
          containEditorEvent(event);
          input.classList.remove("is-composing");
          mirror.hidden = false;
          renderSourceContents(mirror, input.value);
        });
        input.addEventListener("input", (event) => {
          event.stopPropagation();
          renderSourceContents(mirror, input.value);
          resize();
        });
        input.addEventListener("focus", resize);
        redrawAfterMount(() => box.isConnected, resize);

        input.addEventListener("keydown", (event) => {
          event.stopPropagation();
          const caret = input.selectionStart;
          if (caret === null) return;
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
            event.preventDefault();
            if (!activeView) return;
            if (latest) latest.done = true;
            const view = activeView;
            view.dispatch(
              view.state.tr
                .setSelection(new AllSelection(view.state.doc))
                .setMeta(VIM_INPUT_META, true),
            );
            view.focus();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (activeView) commit(activeView, "after");
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            if (latest) latest.done = true;
            const view = activeView;
            if (!view || !latest) return;
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(view.state.doc, latest.link.to),
              ),
            );
            view.focus();
            return;
          }
          const edge = sourceArrowExit(input.value, caret, event.key);
          if (edge) {
            event.preventDefault();
            if (activeView) commit(activeView, edge);
          }
        });
        input.addEventListener("blur", () => {
          if (activeView && !latest?.done) commit(activeView);
        });
        const rendered: renderedLinkSource = {
          dom: box,
          stopEvent: (event) =>
            event.target instanceof Node && box.contains(event.target),
          sync: (nextLink) => {
            if (document.activeElement === input) return;
            input.value = keyboardLinkSourceText(nextLink);
            renderSourceContents(mirror, input.value);
            input.style.width = `${Math.max(1, Array.from(input.value).length)}ch`;
            redrawAfterMount(() => box.isConnected, resize);
          },
          destroy: stopWatchingFonts,
        };
        renderedSources.set(key, rendered);
        return rendered;
      };

      return new Plugin<keyboardExperienceState>({
        key: keyboardExperienceKey,
        state: {
          init: (_config, state) => ({
            active: false,
            decorations: keyboardExperienceDecorations(state, renderLinkSource, false),
          }),
          apply: (transaction, value, _oldState, state) => {
            const forcedActive = transaction.getMeta(keyboardExperienceKey) === true;
            const active = keyboardExperienceActive(
              value.active,
              transaction.docChanged,
              transaction.selectionSet,
              state,
              forcedActive,
            );
            const changed =
              active !== value.active || transaction.docChanged || transaction.selectionSet;
            return changed
              ? {
                  active,
                  decorations: keyboardExperienceDecorations(
                    state,
                    renderLinkSource,
                    active,
                  ),
                }
              : value;
          },
        },
        props: {
          decorations: (state) => keyboardExperienceKey.getState(state)?.decorations,
          handleTextInput: (view, from, to, text) => {
            if (view.composing || text.length === 0) return false;
            if (keyboardExperienceKey.getState(view.state)?.active) return false;
            const position = linkTailInputPosition(view.state);
            if (position === null) return false;
            // WebKit may report both positions one character too far left.
            // The state's collapsed selection at link.to is the source of truth.
            if (from === position && to === position) return false;
            view.dispatch(
              view.state.tr
                .insertText(text, position, position)
                .setMeta(VIM_INPUT_META, true),
            );
            return true;
          },
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target =
                event.target instanceof Element
                  ? event.target.closest(
                      `a[href], .${keyboardLinkPreviewClass}`,
                    )
                  : null;
              if (!target) return false;
              // ProseMirror updates the selection on mousedown, then renders
              // the source widget. Focus it only after both steps have settled.
              requestAnimationFrame(() => {
                let link = sourceLinkAtCaret(view.state);
                if (!link) {
                  try {
                    const position = view.posAtDOM(target, 0);
                    link = linkRange(view.state.doc, position);
                  } catch {
                    return;
                  }
                }
                if (!link) return;
                pendingDirection = "position";
                const needsSelection =
                  view.state.selection.empty &&
                  !(
                    view.state.selection.from >= link.from &&
                    view.state.selection.from <= link.to
                  );
                if (
                  needsSelection ||
                  !keyboardExperienceKey.getState(view.state)?.active
                ) {
                  const transaction = view.state.tr.setMeta(
                    keyboardExperienceKey,
                    true,
                  );
                  if (needsSelection) {
                    transaction.setSelection(
                      TextSelection.create(transaction.doc, link.from),
                    );
                  }
                  view.dispatch(transaction);
                }
                focusLatestWhenReady(view, "position");
              });
              return false;
            },
            "nota-focus-link-source": (view) => {
              const link = sourceLinkAtCaret(view.state);
              if (!link) return false;
              pendingDirection = "position";
              if (!keyboardExperienceKey.getState(view.state)?.active) {
                view.dispatch(view.state.tr.setMeta(keyboardExperienceKey, true));
              }
              focusLatestWhenReady(view, "position");
              return false;
            },
          },
          handleKeyDown: (view, event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false;
            if (event.ctrlKey || event.metaKey || event.altKey) return false;
            const link = sourceLinkAtCaret(view.state);
            if (!link) return false;
            const direction = event.key === "ArrowLeft" ? "left" : "right";
            if (
              (direction === "left" && view.state.selection.from <= link.from) ||
              (direction === "right" && view.state.selection.from >= link.to)
            ) {
              return false;
            }
            if (!keyboardExperienceKey.getState(view.state)?.active) {
              pendingDirection = direction;
              view.dispatch(view.state.tr.setMeta(keyboardExperienceKey, true));
              return true;
            }
            if (!latest || latest.done) return false;
            if (link.from !== latest.link.from || link.to !== latest.link.to) return false;
            event.preventDefault();
            focusSourceInput(view, latest, direction);
            return true;
          },
        },
        view: (view) => {
          activeView = view;
          return {
            update: (nextView, previous) => {
              activeView = nextView;
              const previousActive = keyboardExperienceKey.getState(previous)?.active === true;
              const currentActive = keyboardExperienceKey.getState(nextView.state)?.active === true;
              if (
                currentActive &&
                (!previousActive ||
                  (previous.doc.eq(nextView.state.doc) &&
                    previous.selection.from !== nextView.state.selection.from))
              ) {
                settleFocus(nextView);
              }
            },
            destroy: () => {
              if (pendingFocus !== null) cancelAnimationFrame(pendingFocus);
              activeView = null;
              latest = null;
              for (const rendered of renderedSources.values()) rendered.destroy();
              renderedSources.clear();
            },
          };
        },
      });
    },
  );
}
