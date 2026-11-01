export type VimMode = "normal" | "insert" | "visual" | "vline";

export interface VimProfile {
  id: string;
  label: string;
  description?: string;
  features?: Record<string, unknown>;
  mappings?: Record<string, unknown>;
}

export interface VimInputConfig {
  kind: "vim";
  enabled: boolean;
  plugin: string;
  profile: VimProfile | null;
  mappingsText?: string;
}

export interface VimInputStatus {
  enabled: boolean;
  mode: VimMode;
  label: string;
}

export interface VimInputHooks {
  onStatus?: (status: VimInputStatus) => void;
  onCommand?: (command: "save" | "close") => void;
}

/**
 * Initial indicator while a freshly spawned window is still wiring the plugin
 * callback. The Vim engine always starts in Normal mode after configuration.
 */
export function initialVimStatus(
  config: VimInputConfig | null,
): VimInputStatus | null {
  return config?.enabled
    ? { enabled: true, mode: "normal", label: "-- NORMAL --" }
    : null;
}
