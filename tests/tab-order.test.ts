import { readFileSync } from "node:fs";

import { nearestTabDropTarget, reorderTabs } from "../src/ui/tab-order";

const items = ["a", "b", "c", "d"].map((id) => ({ id }));

function assert(actual: string[], expected: string[], message: string): void {
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`${message}: expected ${expected.join(",")}, got ${actual.join(",")}`);
  }
}

assert(reorderTabs(items, "a", "c", "before").map((x) => x.id), ["b", "a", "c", "d"], "before");
assert(reorderTabs(items, "a", "c", "after").map((x) => x.id), ["b", "c", "a", "d"], "after");
assert(reorderTabs(items, "d", "b", "before").map((x) => x.id), ["a", "d", "b", "c"], "move left");
assert(reorderTabs(items, "a", "a", "after").map((x) => x.id), ["a", "b", "c", "d"], "same tab");
assert(reorderTabs(items, "x", "b", "after").map((x) => x.id), ["a", "b", "c", "d"], "missing tab");

const rects = [
  { id: "a", left: 0, right: 100, top: 0, bottom: 30 },
  { id: "b", left: 101, right: 200, top: 0, bottom: 30 },
  { id: "c", left: 0, right: 100, top: 31, bottom: 60 },
  { id: "d", left: 101, right: 200, top: 31, bottom: 60 },
];
const target = nearestTabDropTarget(rects, "a", 190, 10);
if (!target || target.id !== "b" || target.place !== "after") {
  throw new Error(`nearest target: ${JSON.stringify(target)}`);
}
const wrapped = nearestTabDropTarget(rects, "a", 50, 55);
if (!wrapped || wrapped.id !== "c" || wrapped.place !== "after") {
  throw new Error(`wrapped target: ${JSON.stringify(wrapped)}`);
}

for (const file of ["src/ui/TabBar.tsx", "src/ui/PluginDock.tsx"]) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("usePointerTabReorder") || !source.includes("data-tab-id")) {
    throw new Error(`${file} is not wired to pointer tab ordering`);
  }
  if (source.includes("onDragStart")) {
    throw new Error(`${file} still depends on HTML5 drag events`);
  }
}

console.log("Tab ordering: 7 checks passed");
