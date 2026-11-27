import type { CommandPayload, EditorCommand } from "@/editor/create";

export interface DevBridgeInputHost {
  focus: () => void;
  insertAtCursorPlace: (text: string) => boolean;
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;
}
