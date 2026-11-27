import { fileIconName } from "../src/ui/file-icon";

let pass = 0;
let fail = 0;

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function testCase(name: string, run: () => void): void {
  try {
    run();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("\n[Sidebar file icons]");
testCase("Markdown uses its dedicated icon", () => {
  for (const name of ["a.md", "B.MARKDOWN", "page.mdx"]) {
    equal(fileIconName(name), "nota-markdown-symbolic", name);
  }
});
testCase("Code, images, and documents are separated", () => {
  equal(fileIconName("main.rs"), "nota-source-code-symbolic", "rust");
  equal(fileIconName("cover.webp"), "nota-insert-image-symbolic", "image");
  equal(fileIconName("notes.txt"), "nota-document-open-symbolic", "text");
});
testCase("Unknown types and dotfiles have a fallback", () => {
  equal(fileIconName(".env"), "nota-edit-symbolic", "dotfile");
  equal(fileIconName("README"), "nota-edit-symbolic", "no extension");
  equal(fileIconName("archive.bin"), "nota-edit-symbolic", "unknown");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
