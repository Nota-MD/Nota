import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const read = (path: string) => readFileSync(path, "utf8");
const adapter = read("src/editor/code-vim.ts");
const block = read("src/editor/code-block-cm.ts");
const fenced = read("src/editor/code-block.ts");
const diagram = read("src/editor/diagram-view.ts");
const math = read("src/editor/math-view.ts");
const prose = read("src/editor/plugin-vim-input.ts");

console.log("\n[Vim inside embedded editors]");

testCase("embedded CodeMirror gets a dedicated Vim extension", () => {
  assert(adapter.includes('from "@replit/codemirror-vim"'), "CodeMirror Vim package is not used");
  assert(adapter.includes("export class CodeMirrorVimController"), "no per-editor controller exists");
  assert(block.includes("new CodeMirrorVimController"), "CodeMirror editor has no controller instance");
  assert(block.includes("vimController.extension()"), "CodeMirror editor does not install Vim");
  assert(block.includes("setVimInput:"), "embedded Vim cannot be reconfigured");
});

testCase("all fenced source editors forward the active extension profile", () => {
  for (const [name, source] of [
    ["code blocks", fenced],
    ["diagrams", diagram],
    ["math blocks", math],
  ] as const) {
    assert(source.includes("vimInput: vimInputConfig(view.state)"), `${name} do not receive Vim config`);
    assert(source.includes("vimHooks: vimInputHooks(view)"), `${name} do not report Vim status`);
    assert(source.includes("setVimInput(vimInputConfig(view.state))"), `${name} do not react to profile changes`);
  }
});

testCase("Vim mode status and save/close commands stay shared", () => {
  assert(adapter.includes('cm.on("vim-mode-change"'), "mode changes are not reported");
  assert(adapter.includes('Vim.defineEx("write"'), "embedded :w is not wired");
  assert(adapter.includes('Vim.defineEx("quit"'), "embedded :q is not wired");
  assert(adapter.includes("mappingsText"), "plugin mappings are ignored");
  assert(prose.includes("vimHooksByView.set(view, hooks)"), "parent Vim hooks are not exposed");
});

testCase("embedded Vim can be disabled without recreating the editor", () => {
  assert(adapter.includes("new Compartment()"), "Vim extension has no dynamic compartment");
  assert(adapter.includes("compartment.reconfigure"), "Vim cannot be reconfigured in place");
  assert(adapter.includes("if (!config?.enabled) return []"), "disabled Vim still installs");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
