import { readFileSync } from "node:fs";

import { savingTextOf } from "../src/ui/document-save-text";

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

equal(savingTextOf(1, 1, "active body", "mirror"), "active body", "active tab");
equal(savingTextOf(2, 1, "active body", "second body"), "second body", "background tab");
equal(savingTextOf(1, 1, undefined, "mirror"), "mirror", "editor not ready");

const source = readFileSync("src/ui/useDocuments.ts", "utf8");
if (!source.includes("const mirrored = await api.doc.get(id)")) {
  throw new Error("saveDoc does not fetch the target document mirror");
}
if (!source.includes("savingTextOf(")) {
  throw new Error("saveDoc does not isolate editor text by document id");
}
if (!source.includes("activeIdRef.current = id")) {
  throw new Error("document activation is not reflected in the ref immediately");
}

console.log("Document save identity: 6 checks passed");
