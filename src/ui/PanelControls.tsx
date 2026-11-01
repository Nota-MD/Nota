import { useRef, useState } from "react";

import type { PanelNode } from "@/ui/panel-nodes";
import { Select, Toggle } from "@/ui/settings/primitives";

const FILE_IMPORT_LIMIT = 1024 * 1024;

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
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  return (
    <div className="panel-control panel-control-file">
      <span>{node.label}</span>
      <button
        type="button"
        className="panel-btn"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {node.buttonLabel}
      </button>
      <input
        ref={input}
        hidden
        type="file"
        accept={node.accept}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          if (file.size > FILE_IMPORT_LIMIT) {
            setError("File is larger than 1 MiB.");
            return;
          }
          void file
            .text()
            .then((text) => {
              setError("");
              onFile({ name: file.name, text });
            })
            .catch((reason) => setError(String(reason)));
        }}
      />
      {error && <span className="panel-control-error">{error}</span>}
    </div>
  );
}
