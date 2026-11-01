import { readFileSync } from "node:fs";

import { normalise } from "../src/ui/panel-nodes";

let pass = 0;
let fail = 0;

function equal(actual: unknown, expected: unknown, name: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✘ ${name}\n      expected ${b}\n      actual   ${a}`);
  }
}

const node = normalise([
  {
    kind: "network",
    nodes: [
      {
        id: "a.md",
        label: "A",
        kind: "note",
        group: "notes",
        focus: true,
        action: { command: "open_note", args: { path: "a.md" }, title: "Open A" },
      },
      { id: "missing:b", label: "B", kind: "missing", group: "", focus: false },
    ],
    edges: [
      { source: "a.md", target: "missing:b", both: true },
      { source: "a.md", target: "unknown", both: false },
      { source: "a.md", target: "a.md", both: false },
    ],
  },
])[0] as any;

equal(node.kind, "network", "network block is recognised");
equal(node.spec.nodes.length, 2, "both note and unresolved nodes survive");
equal(node.spec.nodes[0].focus, true, "focus marker survives");
equal(node.spec.nodes[0].action.command, "open_note", "node action command survives");
equal(node.spec.edges.length, 1, "dangling and self edges are removed");
equal(node.spec.edges[0].both, true, "bidirectional marker survives");

const malformed = normalise([
  {
    kind: "network",
    nodes: [{ id: 7, label: 12 }, null],
    edges: [{ source: 1 }, { source: "node-0", target: "node-0" }],
  },
])[0] as any;

equal(malformed.spec.nodes.length, 1, "non-table nodes are dropped");
equal(malformed.spec.nodes[0].id, "7", "numeric id is normalised to text");
equal(malformed.spec.nodes[0].label, "12", "numeric label is normalised to text");
equal(malformed.spec.edges, [], "bad and self edges are dropped");

const usePlugins = readFileSync("src/ui/usePlugins.ts", "utf8");
const pluginDock = readFileSync("src/ui/PluginDock.tsx", "utf8");
const reviewPane = readFileSync("src/ui/ReviewPane.tsx", "utf8");
const uiApi = readFileSync("src-tauri/src/lua/api/ui.rs", "utf8");
const pluginCommand = readFileSync("src-tauri/src/commands/plugin.rs", "utf8");

equal(uiApi.includes("EVENT_PANEL_FOCUS"), true, "Lua show API emits the panel-focus intent");
equal(usePlugins.includes("events.pluginPanelFocus"), true, "the host subscribes to panel-focus intents");
equal(usePlugins.includes("setDockOpen(true)"), true, "a panel-focus intent opens the dock");
equal(pluginDock.includes("nota-expand-symbolic"), true, "dock panels offer a full-editor view");
equal(reviewPane.includes('t("Open in sidebar")'), true, "full panels can return to the dock");
equal(pluginCommand.includes("nota_plugin_review_open"), true, "full view uses a host-owned panel command");

console.log(`\npanel network: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
