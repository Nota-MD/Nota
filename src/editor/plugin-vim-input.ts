import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import {
  configureVim,
  handleVimKey,
  recordVimInsertKey,
  recordVimInsertText,
  vimInsertCaptureKeys,
} from "./plugin-vim-engine";
import {
  VIM_ALLOW_STRUCTURE_META,
  VIM_INPUT_META,
  VimEditorOps,
  type EditorOp,
} from "./plugin-vim-ops";
import type {
  VimInputConfig,
  VimInputHooks,
  VimInputStatus,
  VimMode,
} from "./plugin-vim-types";
import { atReferenceUseMostOpenHead } from "./block-keys";
import { debugEvent } from "@/ui/debug-log";

interface VimInputState {
  config: VimInputConfig | null;
  mode: VimMode;
  cursor: "bar" | "block";
}

interface VimInputMeta {
  config?: VimInputConfig | null;
  mode?: VimMode;
  cursor?: "bar" | "block";
}

export const vimInputKey = new PluginKey<VimInputState>("nota-vim-input");

function isImeKeydown(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229 || event.key === "Process";
}

function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

export function pluginKeyName(event: KeyboardEvent): string {
  const mods: string[] = [];
  if (event.ctrlKey) mods.push("ctrl");
  if (event.altKey) mods.push("alt");
  if (event.metaKey) mods.push("meta");
  if (event.shiftKey && event.key.length !== 1) mods.push("shift");
  return [...mods, event.key].join("+");
}

function captures(event: KeyboardEvent, state: VimInputState): string | null {
  if (!state.config?.enabled || isImeKeydown(event)) return null;
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) {
    return null;
  }
  const name = pluginKeyName(event);
  if (state.mode === "insert") {
    return vimInsertCaptureKeys().includes(name) ? name : null;
  }
  const mod = isMac() ? event.metaKey : event.ctrlKey || event.metaKey;
  if (mod) {
    const owned = ["ctrl+r", "ctrl+d", "ctrl+u", "ctrl+f", "ctrl+b", "ctrl+["];
    if (!owned.includes(name)) return null;
  }
  return name;
}

function cursorDecoration(state: EditorState, cursor: VimInputState["cursor"]) {
  if (cursor !== "block" || !state.selection.empty) return null;
  const at = state.selection.head;
  const next =
    at < state.doc.content.size
      ? state.doc.textBetween(at, Math.min(at + 1, state.doc.content.size), "\n", "\n")
      : "";
  if (next && next !== "\n") {
    return Decoration.inline(at, at + 1, { class: "nota-vim-block-cursor" });
  }
  return Decoration.widget(
    at,
    () => {
      const span = document.createElement("span");
      span.className = "nota-vim-block-cursor nota-vim-block-cursor-empty";
      span.textContent = " ";
      return span;
    },
    { side: 1, key: "nota-vim-cursor" },
  );
}

export function vimInputPlugin(
  initialConfig: VimInputConfig | null,
  hooks: VimInputHooks = {},
) {
  return $prose(
    () =>
      new Plugin<VimInputState>({
        key: vimInputKey,
        state: {
          init: () => ({
            config: initialConfig,
            mode: initialConfig?.enabled ? "normal" : "normal",
            cursor: initialConfig?.enabled ? "block" : "bar",
          }),
          apply(tr, previous) {
            const meta = tr.getMeta(vimInputKey) as VimInputMeta | undefined;
            if (!meta) return previous;
            const config =
              meta.config === undefined ? previous.config : meta.config;
            const mode =
              meta.mode ?? (meta.config !== undefined && config?.enabled ? "normal" : previous.mode);
            const cursor =
              meta.cursor ?? (config?.enabled && mode !== "insert" ? "block" : "bar");
            return { config, mode, cursor };
          },
        },
        filterTransaction(tr, state) {
          const input = vimInputKey.getState(state);
          if (!input?.config?.enabled || input.mode === "insert") return true;
          if (
            !tr.docChanged ||
            tr.getMeta(VIM_INPUT_META) ||
            tr.getMeta(VIM_ALLOW_STRUCTURE_META)
          ) {
            return true;
          }
          return false;
        },
        props: {
          handleKeyDown(view, event) {
            const state = vimInputKey.getState(view.state);
            if (!state) return false;
            if (event.key === "Backspace") {
              debugEvent("editor", "vim backspace probe", {
                at_head: atReferenceUseMostOpenHead(view.state),
                mode: state.mode,
                depth: view.state.selection.$from.depth,
                offset: view.state.selection.$from.parentOffset,
                parent: view.state.selection.$from.parent.type.name,
              });
            }
            // 引用框开头的空格/退格属于块结构退出，不属于光标移动或删字。
            // 交给 `blockContainerKeypress`，否则 Vim normal 的 Backspace
            // 只做左移，引用标记永远消不掉。
            if (
              atReferenceUseMostOpenHead(view.state) &&
              (event.key === "Backspace" || (event.key === " " && !event.shiftKey))
            ) {
              return false;
            }
            const key = captures(event, state);
            if (!key) {
              if (
                state.config?.enabled &&
                state.mode === "insert" &&
                ["Enter", "Backspace", "Delete", "Tab"].includes(pluginKeyName(event))
              ) {
                recordVimInsertKey(pluginKeyName(event));
              }
              return false;
            }
            return handleVimKey(key);
          },
          handleTextInput(view, _from, _to, text) {
            const state = vimInputKey.getState(view.state);
            if (!state?.config?.enabled) return false;
            if (state.mode === "insert") {
              recordVimInsertText(text);
              return false;
            }
            return true;
          },
          handleDOMEvents: {
            beforeinput(view) {
              const state = vimInputKey.getState(view.state);
              return !!state?.config?.enabled && state.mode !== "insert";
            },
          },
          attributes(state) {
            const input = vimInputKey.getState(state);
            if (!input?.config?.enabled) {
              return { class: "", "data-vim-mode": "" };
            }
            return {
              class: `nota-vim-active nota-vim-${input.mode}`,
              "data-vim-mode": input.mode,
            };
          },
          decorations(state) {
            const input = vimInputKey.getState(state);
            const deco = input ? cursorDecoration(state, input.cursor) : null;
            return deco ? DecorationSet.create(state.doc, [deco]) : null;
          },
        },
        view(view) {
          const ops = new VimEditorOps(view, (style) => {
            const input = vimInputKey.getState(view.state);
            if (!input || input.cursor === style) return;
            view.dispatch(view.state.tr.setMeta(vimInputKey, { cursor: style }));
          });

          const report = (status: VimInputStatus) => {
            const input = vimInputKey.getState(view.state);
            const cursor = status.mode === "insert" ? "bar" : "block";
            if (input && (input.mode !== status.mode || input.cursor !== cursor)) {
              view.dispatch(
                view.state.tr.setMeta(vimInputKey, {
                  mode: status.mode,
                  cursor,
                }),
              );
            }
            hooks.onStatus?.(status);
          };

          configureVim(
            {
              exec: (op: EditorOp) => ops.run(op),
              capture: () => {},
              status: report,
              command: (command: "save" | "close") => hooks.onCommand?.(command),
              mappings: () => initialConfig?.mappingsText ?? "",
            },
            initialConfig,
          );

          return {
            update(nextView, previousState) {
              const previous = vimInputKey.getState(previousState);
              const current = vimInputKey.getState(nextView.state);
              if (previous?.config === current?.config) return;
              configureVim(
                {
                  exec: (op: EditorOp) => ops.run(op),
                  capture: () => {},
                  status: report,
                  command: (command: "save" | "close") =>
                    hooks.onCommand?.(command),
                  mappings: () => current?.config?.mappingsText ?? "",
                },
                current?.config ?? null,
              );
            },
            destroy() {
              configureVim(null, null);
              hooks.onStatus?.({ enabled: false, mode: "normal", label: "" });
            },
          };
        },
      }),
  );
}

export function setVimInputConfig(
  view: EditorView,
  config: VimInputConfig | null,
): void {
  view.dispatch(view.state.tr.setMeta(vimInputKey, { config }));
}
