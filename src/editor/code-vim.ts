import { Compartment } from "@codemirror/state";
import { drawSelection, EditorView } from "@codemirror/view";
import { getCM, Vim, vim } from "@replit/codemirror-vim";

import type {
  VimInputConfig,
  VimInputHooks,
  VimInputStatus,
  VimMode,
} from "./plugin-vim-types";

const hooksByEditor = new WeakMap<object, VimInputHooks>();
const attached = new WeakSet<object>();
let appliedMappings = "";
let exCommandsInstalled = false;

interface VimCodeMirrorState {
  vim?: {
    mode?: string;
    status?: string;
  };
}

function installExCommands(): void {
  if (exCommandsInstalled) return;
  exCommandsInstalled = true;
  Vim.defineEx("write", "w", (cm: object) => {
    hooksByEditor.get(cm)?.onCommand?.("save");
  });
  Vim.defineEx("quit", "q", (cm: object) => {
    hooksByEditor.get(cm)?.onCommand?.("close");
  });
  Vim.defineEx("wq", "wq", (cm: object) => {
    const hooks = hooksByEditor.get(cm);
    hooks?.onCommand?.("save");
    hooks?.onCommand?.("close");
  });
}

function applyMappings(text: string | undefined): void {
  const value = text ?? "";
  if (value === appliedMappings) return;
  appliedMappings = value;
  Vim.mapclear();
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('"')) continue;
    const [command, left, right] = line.split(/\s+/);
    if (!command || !left || !right) continue;
    const context =
      command === "inoremap"
        ? "insert"
        : command === "vnoremap"
          ? "visual"
          : "normal";
    if (command.endsWith("noremap")) Vim.noremap(left, right, context);
    else if (command === "map" || command === "noremap") Vim.map(left, right, context);
  }
}

function modeName(value: string | undefined): VimMode {
  if (value === "insert") return "insert";
  if (value === "visual") return "visual";
  if (value === "visual-line") return "vline";
  return "normal";
}

function statusFor(cm: ReturnType<typeof getCM>): VimInputStatus {
  const state = cm?.state as VimCodeMirrorState | undefined;
  const mode = modeName(state?.vim?.mode);
  const labels: Record<VimMode, string> = {
    normal: "NORMAL",
    insert: "INSERT",
    visual: "VISUAL",
    vline: "V-LINE",
  };
  const pending = state?.vim?.status ?? "";
  return {
    enabled: true,
    mode,
    label: `-- ${labels[mode]} --${pending ? ` ${pending}` : ""}`,
  };
}

function attachStatus(view: EditorView, hooks: VimInputHooks): void {
  const cm = getCM(view);
  if (!cm || attached.has(cm)) {
    if (view.hasFocus && cm) hooks.onStatus?.(statusFor(cm));
    return;
  }
  attached.add(cm);
  hooksByEditor.set(cm, hooks);
  cm.on("vim-mode-change", () => {
    if (view.hasFocus) hooks.onStatus?.(statusFor(cm));
  });
}

function vimExtensions(
  config: VimInputConfig | null,
  hooks: VimInputHooks,
) {
  if (!config?.enabled) return [];
  installExCommands();
  applyMappings(config.mappingsText);
  return [
    vim(),
    drawSelection(),
    EditorView.domEventHandlers({
      focus(_event, view) {
        attachStatus(view, hooks);
        const cm = getCM(view);
        if (cm) hooks.onStatus?.(statusFor(cm));
        return false;
      },
      blur(_event, view) {
        if (view.hasFocus) return false;
        hooks.onStatus?.({ enabled: true, mode: "normal", label: "-- NORMAL --" });
        return false;
      },
    }),
  ];
}

export class CodeMirrorVimController {
  readonly compartment = new Compartment();
  private config: VimInputConfig | null;

  constructor(
    initial: VimInputConfig | null,
    private readonly hooks: VimInputHooks,
  ) {
    this.config = initial;
    installExCommands();
  }

  extension() {
    return this.compartment.of(vimExtensions(this.config, this.hooks));
  }

  setConfig(view: EditorView, config: VimInputConfig | null): void {
    this.config = config;
    view.dispatch({
      effects: this.compartment.reconfigure(vimExtensions(config, this.hooks)),
    });
  }
}
