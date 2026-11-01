/** ZIP theme-package import contracts. */

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

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const read = (path: string) => readFileSync(path, "utf8");

console.log("\n【主题 ZIP 导入】");

testCase("前端入口使用同一个 ZIP 选择与导入命令", () => {
  const hook = read("src/ui/useUiStyles.ts");
  const ipc = read("src/bridge/ipc.ts");
  assertValue(hook.includes('extensions: ["zip"]'), "主题选择器不认 ZIP");
  assertValue(hook.includes("api.theme.importZip(path)"), "没有调用后台主题导入命令");
  assertValue(
    hook.includes("refreshDocumentThemes()") && hook.includes("setScan((value) => value + 1)"),
    "导入后没有同时刷新界面主题与文档主题",
  );
  assertValue(ipc.includes('"nota_theme_import"'), "IPC 桥没有登记主题导入");
});

testCase("外观页和文档主题页都有导入入口", () => {
  const appearance = read("src/ui/settings/panes/AppearancePane.tsx");
  const document = read("src/ui/settings/panes/DocThemePane.tsx");
  assertValue(appearance.includes("onImportTheme"), "外观页缺少导入入口");
  assertValue(document.includes("onImportTheme"), "文档主题页缺少导入入口");
});

testCase("后台支持官方 ui / document / themes 布局并登记命令", () => {
  const backend = read("src-tauri/src/theme_import.rs");
  const lib = read("src-tauri/src/lib.rs");
  for (const layout of ['"ui" | "ui-styles"', '"document"', '"themes"']) {
    assertValue(backend.includes(layout), `后台不认布局 ${layout}`);
  }
  assertValue(backend.includes("data-ui-style"), "界面主题没有做作用域校验");
  assertValue(backend.includes("--doc-bg"), "文档主题没有做内容校验");
  assertValue(backend.includes("不能包含符号链接"), "ZIP 符号链接没有被拒绝");
  assertValue(backend.includes("MAX_TOTAL_BYTES"), "ZIP 解压没有总大小上限");
  assertValue(lib.includes("commands::theme::nota_theme_import"), "主题导入命令没有注册");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
