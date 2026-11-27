import type { CommandPayload, EditorCommand } from "@/editor/create";
import type { DevBridgeInputHost } from "@/ui/devBridgeInputTypes";
import type { EditorPaneHandle } from "@/ui/EditorPane";

const MAX_ACTIONS = 10_000;
const MAX_TEXT = 1_000_000;
const MAX_WAIT_MS = 15 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 45;

type Modifier = "altKey" | "ctrlKey" | "metaKey" | "shiftKey";

type NormalizedAction =
  | { type: "text"; text: string; interval: number; instant: boolean }
  | {
      type: "key";
      key: string;
      count: number;
      modifiers: Modifier[];
    }
  | {
      type: "shortcut";
      key: string;
      modifiers: Modifier[];
      count: number;
    }
  | { type: "wait"; ms: number }
  | { type: "focus" }
  | { type: "click"; selector: string }
  | { type: "command"; name: EditorCommand; payload?: CommandPayload };

function invalid(message: string): never {
  throw new Error(`Invalid input script: ${message}`);
}

function integer(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    invalid(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return Number(value);
}

function optionalInteger(
  value: unknown,
  fallback: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  return value === undefined ? fallback : integer(value, label, minimum, maximum);
}

function textValue(value: unknown, label: string): string {
  if (typeof value !== "string") invalid(`${label} must be a string`);
  return value;
}

function modifiers(value: unknown): Modifier[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalid("modifiers must be an array");
  const allowed = new Set<Modifier>(["altKey", "ctrlKey", "metaKey", "shiftKey"]);
  return value.map((item) => {
    if (typeof item !== "string" || !allowed.has(item as Modifier)) {
      invalid("modifiers may contain altKey, ctrlKey, metaKey and shiftKey");
    }
    return item as Modifier;
  });
}

function normalizeAction(value: unknown, defaultInterval: number): NormalizedAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("each action must be an object");
  }
  const action = value as Record<string, unknown>;
  switch (action.type) {
    case "text": {
      const text = textValue(action.text, "text.text");
      if (text.length > MAX_TEXT) invalid(`text.text exceeds ${MAX_TEXT} characters`);
      return {
        type: "text",
        text,
        interval: optionalInteger(
          action.interval,
          defaultInterval,
          "text.interval",
          0,
          2_000,
        ),
        instant: action.instant === true,
      };
    }
    case "key":
      return {
        type: "key",
        key: textValue(action.key, "key.key"),
        count: optionalInteger(action.count, 1, "key.count", 1, 500),
        modifiers: modifiers(action.modifiers),
      };
    case "shortcut": {
      const shortcut = textValue(action.keys, "shortcut.keys");
      const parts = shortcut.split("+").map((part) => part.trim()).filter(Boolean);
      if (parts.length < 2) invalid("shortcut.keys needs at least one modifier and one key");
      const key = parts.pop() ?? "";
      const names = parts.map((part) => {
        const normalized = part.toLowerCase();
        if (normalized === "ctrl" || normalized === "control") return "ctrlKey";
        if (normalized === "shift") return "shiftKey";
        if (normalized === "alt" || normalized === "option") return "altKey";
        if (normalized === "meta" || normalized === "cmd" || normalized === "command") {
          return "metaKey";
        }
        if (normalized === "mod") {
          return navigator.platform.toLowerCase().includes("mac") ? "metaKey" : "ctrlKey";
        }
        invalid(`unknown shortcut modifier: ${part}`);
      });
      return {
        type: "shortcut",
        key,
        modifiers: [...new Set(names)] as Modifier[],
        count: optionalInteger(action.count, 1, "shortcut.count", 1, 100),
      };
    }
    case "wait":
      return {
        type: "wait",
        ms: integer(action.ms, "wait.ms", 0, MAX_WAIT_MS),
      };
    case "focus":
      return { type: "focus" };
    case "click":
      return {
        type: "click",
        selector: textValue(action.selector, "click.selector"),
      };
    case "command":
      return {
        type: "command",
        name: textValue(action.name, "command.name") as EditorCommand,
        payload:
          action.payload && typeof action.payload === "object"
            ? action.payload as CommandPayload
            : undefined,
      };
    default:
      return invalid(`unknown action type: ${String(action.type)}`);
  }
}

export function normalizeDevBridgeActions(
  args: Record<string, unknown>,
): NormalizedAction[] {
  if (!Array.isArray(args.actions) || args.actions.length === 0) {
    invalid("actions must be a non-empty array");
  }
  if (args.actions.length > MAX_ACTIONS) invalid(`actions exceeds ${MAX_ACTIONS} items`);
  const interval = optionalInteger(
    args.interval,
    DEFAULT_INTERVAL_MS,
    "interval",
    0,
    2_000,
  );
  return args.actions.map((action) => normalizeAction(action, interval));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    if (signal.aborted) return Promise.reject(new DOMException("Playback cancelled", "AbortError"));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Playback cancelled", "AbortError"));
      },
      { once: true },
    );
  });
}

function nextFrame(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const handle = window.requestAnimationFrame(() => resolve());
    signal.addEventListener(
      "abort",
      () => {
        window.cancelAnimationFrame(handle);
        reject(new DOMException("Playback cancelled", "AbortError"));
      },
      { once: true },
    );
  });
}

function editableAtFocus(): HTMLElement | null {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLElement && active.isContentEditable
  ) {
    return active;
  }
  return (
    document.querySelector<HTMLElement>(
      ".editor-pane .ProseMirror[contenteditable='true'], " +
      ".editor-pane .cm-content[contenteditable='true'], " +
      ".editor-pane textarea, .editor-pane input",
    ) ?? null
  );
}

function focusEditor(host: DevBridgeInputHost): HTMLElement | null {
  host.focus();
  const target = editableAtFocus();
  target?.focus();
  return target;
}

function insertNativeText(
  host: DevBridgeInputHost,
  text: string,
): void {
  const target = focusEditor(host);
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: text,
      }),
    );
    return;
  }
  const inserted = target?.isContentEditable
    ? document.execCommand("insertText", false, text)
    : false;
  if (!inserted && !host.insertAtCursorPlace(text)) {
    throw new Error("No writable editor input is available");
  }
}

function keyEventInit(key: string, activeModifiers: Modifier[]): KeyboardEventInit {
  const eventKey = key === "Space" ? " " : key;
  return {
    key: eventKey,
    code: /^[a-z]$/i.test(eventKey) ? `Key${eventKey.toUpperCase()}` : eventKey,
    bubbles: true,
    cancelable: true,
    composed: true,
    ctrlKey: activeModifiers.includes("ctrlKey"),
    metaKey: activeModifiers.includes("metaKey"),
    shiftKey: activeModifiers.includes("shiftKey"),
    altKey: activeModifiers.includes("altKey"),
  };
}

function fallbackEditingKey(key: string): void {
  if (key === "Enter") {
    document.execCommand("insertParagraph");
  } else if (key === "Backspace") {
    document.execCommand("delete");
  } else if (key === "Delete") {
    document.execCommand("forwardDelete");
  } else if (key === "Tab") {
    document.execCommand("insertText", false, "\t");
  }
}

function shortcutCommand(
  key: string,
  activeModifiers: Modifier[],
): EditorCommand | null {
  if (!activeModifiers.includes("ctrlKey") && !activeModifiers.includes("metaKey")) {
    return null;
  }
  if (activeModifiers.includes("altKey")) return null;
  const normalized = key.toLowerCase();
  if (normalized === "b") return "bold";
  if (normalized === "i") return "italic";
  if (normalized === "u") return "underline";
  if (normalized === "z") {
    return activeModifiers.includes("shiftKey") ? "redo" : "undo";
  }
  if (normalized === "y") return "redo";
  return null;
}

function pressKey(host: DevBridgeInputHost, key: string, activeModifiers: Modifier[]): void {
  const target = focusEditor(host);
  if (!target) throw new Error("No focusable editor input is available");
  const event = new KeyboardEvent("keydown", keyEventInit(key, activeModifiers));
  const handled = !target.dispatchEvent(event);
  if (!handled && activeModifiers.length === 0) fallbackEditingKey(key);
}

function pressShortcut(
  host: DevBridgeInputHost,
  key: string,
  activeModifiers: Modifier[],
): EditorCommand | null {
  const command = shortcutCommand(key, activeModifiers);
  if (command) {
    if (!host.runCommand(command)) {
      throw new Error(`Editor shortcut failed: ${command}`);
    }
    return command;
  }
  pressKey(host, key, activeModifiers);
  return null;
}

function textSegments(text: string): string[] {
  if (typeof Intl.Segmenter !== "function") return Array.from(text);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

export async function playDevBridgeActions(
  args: Record<string, unknown>,
  host: DevBridgeInputHost,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const actions = normalizeDevBridgeActions(args);
  const started = performance.now();
  let written = 0;
  let shortcuts = 0;
  for (const action of actions) {
    if (signal.aborted) throw new DOMException("Playback cancelled", "AbortError");
    switch (action.type) {
      case "text": {
        if (action.instant) {
          insertNativeText(host, action.text);
          written += action.text.length;
          break;
        }
        for (const part of textSegments(action.text)) {
          if (signal.aborted) throw new DOMException("Playback cancelled", "AbortError");
          if (part === "\n") {
            pressKey(host, "Enter", []);
          } else {
            insertNativeText(host, part);
          }
          written += part.length;
          if (action.interval > 0) await sleep(action.interval, signal);
        }
        break;
      }
      case "key":
        for (let index = 0; index < action.count; index += 1) {
          const command = pressShortcut(host, action.key, action.modifiers);
          if (command) {
            shortcuts += 1;
          }
          await nextFrame(signal);
        }
        break;
      case "shortcut":
        for (let index = 0; index < action.count; index += 1) {
          const command = pressShortcut(host, action.key, action.modifiers);
          if (command) {
            shortcuts += 1;
          }
          await nextFrame(signal);
        }
        break;
      case "wait":
        await sleep(action.ms, signal);
        break;
      case "focus":
        focusEditor(host);
        await nextFrame(signal);
        break;
      case "click": {
        const target = document.querySelector<HTMLElement>(action.selector);
        if (!target) throw new Error(`Click target not found: ${action.selector}`);
        target.click();
        await nextFrame(signal);
        break;
      }
      case "command":
        if (!host.runCommand(action.name, action.payload)) {
          throw new Error(`Editor command failed: ${action.name}`);
        }
        await nextFrame(signal);
        break;
    }
  }
  return {
    played: actions.length,
    characters: written,
    shortcuts,
    durationMs: Math.round(performance.now() - started),
  };
}

export function createDevBridgeInputHost(
  editorRef: { current: EditorPaneHandle | null },
): DevBridgeInputHost {
  return {
    focus: () => editorRef.current?.focus(),
    insertAtCursorPlace: (text) => editorRef.current?.insertAtCursorPlace(text) ?? false,
    runCommand: (name, payload) => editorRef.current?.runCommand(name, payload) ?? false,
  };
}
