import type { EditorOp, EditorOpResult } from "./plugin-vim-ops";
import type { VimInputConfig, VimInputStatus, VimMode } from "./plugin-vim-types";

export interface VimEngineHost {
  exec: (op: EditorOp) => EditorOpResult;
  capture: (mode: VimMode, keys: string[] | null) => void;
  status: (status: VimInputStatus) => void;
  command: (command: "save" | "close") => void;
  mappings: () => string;
}

export function configureVim(host: VimEngineHost | null, config: VimInputConfig | null): void;
export function handleVimKey(key: string): boolean;
export function recordVimInsertText(text: string): void;
export function recordVimInsertKey(key: string): void;
export function vimInsertCaptureKeys(): string[];
export function vimMode(): VimMode;
export function parseMappings(text: string): unknown;
