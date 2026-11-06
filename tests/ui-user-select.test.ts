/**
 * Application chrome must not expose selectable UI labels.
 *
 * The old implementation disabled selection on a handful of buttons and bars.
 * Menus, status cells, settings labels and dialogs were always one new element
 * away from becoming draggable blue text. The shell now denies selection by
 * default and opts only user-owned/editable surfaces back in.
 */

import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertion(condition: unknown, description: string): asserts condition {
  if (!condition) throw new Error(description);
}

console.log("\n【界面文字选择策略】");

const css = readFileSync(`${process.cwd()}/src/styles/app.css`, "utf8");

testCase("外壳默认禁用文字选择", () => {
  assertion(
    /body\s*\{[^}]*user-select:\s*none/s.test(css),
    "body 没有统一禁用界面文字选择",
  );
  assertion(
    /body\s*\{[^}]*webkit-user-select:\s*none/s.test(css),
    "WebKit 专用选择属性没有同步禁用",
  );
});

testCase("正文、编辑器和输入控件明确恢复文字选择", () => {
  const restored = css.match(/([^{}]+)\{[^}]*user-select:\s*text/s)?.[1] ?? "";
  for (const selector of [
    "input",
    "textarea",
    "[contenteditable=\"true\"]",
    ".editor-pane",
    ".ProseMirror",
    ".cm-editor",
  ]) {
    assertion(restored.includes(selector), `可编辑区域缺少选择例外：${selector}`);
  }
});

testCase("恢复选择时同时写出 WebKit 属性", () => {
  assertion(
    /input,[\s\S]*?\.cm-editor\s*\{[^}]*webkit-user-select:\s*text/s.test(css),
    "可编辑区域没有同步恢复 WebKit 文字选择",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
