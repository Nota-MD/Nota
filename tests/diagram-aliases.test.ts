import { readFileSync } from "node:fs";

import {
  imageTableConvertReplace,
  isMermaidFenceLanguage,
  mermaidSourceForLanguage,
} from "../src/editor/diagram-node";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n[Mermaid diagram aliases]");

testCase("sequence and flow fence aliases are recognized", () => {
  for (const language of [
    "mermaid",
    "sequence",
    "sequence-diagram",
    "sequenceDiagram",
    "flow",
    "flow-chart",
    "flowchart",
    " FLOWCHART ",
    "stateDiagram-v2",
    "classDiagram",
    "erDiagram",
    "gantt",
    "mindmap",
    "gitGraph",
    "architecture-beta",
  ]) {
    assert(isMermaidFenceLanguage(language), `${language} was not recognized`);
  }
  assert(!isMermaidFenceLanguage("typescript"), "ordinary code language was captured");
  assert(!isMermaidFenceLanguage(""), "empty language was captured");
});

testCase("external diagram fences enter the same frame", () => {
  const tree = {
    type: "root",
    children: [
      { type: "code", lang: "plantuml", value: "@startuml\nA -> B\n@enduml" },
      { type: "code", lang: "dot", value: "digraph { A -> B }" },
    ],
  };
  imageTableConvertReplace(tree as never);
  assert(tree.children[0]?.type === "diagram", "PlantUML fence did not enter the diagram frame");
  assert(tree.children[1]?.type === "diagram", "Graphviz fence did not enter the diagram frame");
  assert(
    (tree.children[0] as { data?: { language?: string } }).data?.language === "plantuml",
    "PlantUML engine marker was lost",
  );
  assert(
    (tree.children[1] as { data?: { language?: string } }).data?.language === "graphviz",
    "Graphviz engine marker was lost",
  );
});

testCase("sequence and flow fences convert to diagram nodes", () => {
  const tree = {
    type: "root",
    children: [
      { type: "code", lang: "sequence", value: "sequenceDiagram\nA->>B: hi" },
      { type: "code", lang: "flowchart", value: "flowchart TD\nA-->B" },
      { type: "code", lang: "ts", value: "const x = 1" },
    ],
  };
  imageTableConvertReplace(tree as never);
  assert(tree.children[0]?.type === "diagram", "sequence fence was not converted");
  assert(tree.children[1]?.type === "diagram", "flowchart fence was not converted");
  assert(tree.children[2]?.type === "code", "ordinary code fence was converted");
});

testCase("typed sequence and flow fences use the same alias gate", () => {
  const source = readFileSync("src/editor/diagram-node.ts", "utf8");
  const view = readFileSync("src/editor/diagram-view.ts", "utf8");
  assert(
    source.includes("new InputRule(/^```([A-Za-z][A-Za-z0-9-]*)$/"),
    "diagram input rule is still hard-coded to mermaid",
  );
  assert(
    source.includes("const language = diagramLanguageFromFence(match[1]);") &&
      source.includes("if (!language) return null;"),
    "typed diagram aliases do not share the language gate",
  );
  assert(view.includes("drawExternal(languageName, source2)"), "external diagrams bypass the shared frame");
});

testCase("sequence and flow aliases supply the missing Mermaid header", () => {
  assert(
    mermaidSourceForLanguage("sequence", "A->>B: hello") === "sequenceDiagram\nA->>B: hello",
    "sequenceDiagram header was not supplied",
  );
  assert(
    mermaidSourceForLanguage("flowchart", "A-->B") === "flowchart TD\nA-->B",
    "flowchart header and direction were not supplied",
  );
  assert(
    mermaidSourceForLanguage("sequence", "sequenceDiagram\nA->>B: hello") ===
      "sequenceDiagram\nA->>B: hello",
    "an existing sequenceDiagram header was duplicated",
  );
  assert(
    mermaidSourceForLanguage("mermaid", "对象A->对象B：你好") ===
      "sequenceDiagram\n对象A->对象B：你好",
    "headerless mermaid sequence syntax was not inferred",
  );
  assert(
    mermaidSourceForLanguage("mermaid", "A-->B") === "flowchart TD\nA-->B",
    "headerless mermaid flow syntax was not inferred",
  );
  assert(
    mermaidSourceForLanguage("mermaid", "flowchart LR\nA-->B") === "flowchart LR\nA-->B",
    "mermaid flowchart with an explicit header was duplicated",
  );
  assert(
    mermaidSourceForLanguage("mermaid", "sequenceDiagram\nA->>B: hello") ===
      "sequenceDiagram\nA->>B: hello",
    "mermaid sequence with an explicit header was duplicated",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

