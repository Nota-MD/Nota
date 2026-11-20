import { useState } from "react";

import { api } from "@/bridge/ipc";
import type { PanelNode } from "@/ui/panel-nodes";
import { Select, Toggle } from "@/ui/settings/primitives";

export type PanelControl = Extract<
  PanelNode,
  { kind: "toggle" } | { kind: "select" } | { kind: "file" }
>;

export function PanelControlBlock({
  node,
  busy,
  onCall,
}: {
  node: PanelControl;
  busy: boolean;
  onCall: (command: string, arg: string, args: unknown, value: unknown) => void;
}) {
  const call = (command: string, arg: string, args: unknown, value: unknown) => {
    if (busy || !command || !arg) return;
    const base =
      typeof args === "object" && args !== null && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {};
    onCall(command, arg, base, value);
  };

  switch (node.kind) {
    case "toggle":
      return (
        <div className="panel-control">
          <span>{node.label}</span>
          <Toggle
            checked={node.value}
            disabled={busy || !node.command || !node.arg}
            onChange={(checked) => call(node.command, node.arg, node.args, checked)}
          />
        </div>
      );
    case "select":
      return (
        <label className="panel-control panel-control-select">
          <span>{node.label}</span>
          <Select
            value={node.value}
            options={node.options}
            disabled={busy || !node.command || !node.arg}
            onChange={(value) => call(node.command, node.arg, node.args, value)}
          />
        </label>
      );
    case "file":
      return (
        <FileImportControl
          node={node}
          disabled={busy}
          onFile={(file) => call(node.command, node.arg, node.args, file)}
        />
      );
  }
}

/**
 * A regular panel file control. The browser's file input only exposes the file
 * the user explicitly picked, so this does not widen the plugin filesystem
 * capability. The plugin receives the basename and text, never an unchecked
 * arbitrary-path read primitive.
 */
function FileImportControl({
  node,
  disabled,
  onFile,
}: {
  node: Extract<PanelNode, { kind: "file" }>;
  disabled: boolean;
  onFile: (file: { name: string; text: string }) => void;
}) {
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);

  const pick = async () => {
    if (disabled || picking) return;
    setPicking(true);
    setError("");
    try {
      const filters = node.accept
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.startsWith("."))
        .map((item) => item.slice(1));
      const selected = await api.picker.textFile({
        title: node.label,
        filters: filters.length > 0 ? [{ name: node.label, extensions: filters }] : undefined,
      });
      if (selected) onFile(selected);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="panel-control panel-control-file">
      <span>{node.label}</span>
      <button
        type="button"
        className="panel-btn"
        disabled={disabled || picking}
        onClick={() => void pick()}
      >
        {node.buttonLabel}
      </button>
      {error && <span className="panel-control-error">{error}</span>}
    </div>
  );
}
