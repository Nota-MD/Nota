import {
  normalizeDevBridgeActions,
} from "../src/ui/devBridgeInput";

let passed = 0;
let failed = 0;

function ok(value: boolean, label: string): void {
  if (value) passed += 1;
  else {
    failed += 1;
    console.log(`  FAIL ${label}`);
  }
}

function throws(run: () => unknown, label: string): void {
  try {
    run();
    ok(false, label);
  } catch {
    ok(true, label);
  }
}

{
  const actions = normalizeDevBridgeActions({
    interval: 75,
    actions: [
      { type: "focus" },
      { type: "text", text: "# Nota" },
      { type: "key", key: "Enter" },
      { type: "shortcut", keys: "Ctrl+B" },
      { type: "wait", ms: 250 },
      { type: "click", selector: ".menu" },
      { type: "command", name: "h1" },
    ],
  });
  ok(actions.length === 7, "all supported action types are accepted");
  ok(
    actions[1]?.type === "text" && actions[1].interval === 75,
    "the default interval applies to text actions",
  );
  ok(
    actions[3]?.type === "shortcut" &&
      actions[3].modifiers.includes("ctrlKey") &&
      actions[3].key === "B",
    "shortcut names become keyboard modifiers",
  );
}

{
  throws(() => normalizeDevBridgeActions({ actions: [] }), "empty action lists are rejected");
  throws(
    () => normalizeDevBridgeActions({ actions: [{ type: "unknown" }] }),
    "unknown action types are rejected",
  );
  throws(
    () => normalizeDevBridgeActions({ actions: [{ type: "wait", ms: -1 }] }),
    "negative waits are rejected",
  );
  throws(
    () => normalizeDevBridgeActions({ actions: [{ type: "shortcut", keys: "Ctrl" }] }),
    "shortcuts without a key are rejected",
  );
}

console.log(`DevKit input: ${passed} checks passed, ${failed} failed`);
if (failed > 0) process.exit(1);
