/** Developer-only “selectable interface text” setting and CSS bridge. */

import { readFileSync } from "node:fs";

import { isSelectableUiTextEnabled } from "../src/ui/useSelectableUiText";

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

console.log("\n【开发者：界面文字可选中】");

testCase("只有开发者模式和开关同时开启才生效", () => {
  assertion(!isSelectableUiTextEnabled(false, false), "两个都关闭时不应生效");
  assertion(!isSelectableUiTextEnabled(false, true), "非开发者模式不应生效");
  assertion(!isSelectableUiTextEnabled(true, false), "开关默认关闭时不应生效");
  assertion(isSelectableUiTextEnabled(true, true), "两个都开启时应生效");
});

testCase("开发者页有开关并写回持久化设置", () => {
  const pane = readFileSync(`${process.cwd()}/src/ui/settings/panes/DebugPane.tsx`, "utf8");
  assertion(pane.includes('t("Selectable interface text")'), "开发者页缺少开关文案");
  assertion(pane.includes("settings.general.select_ui_text"), "开关没有读取设置");
  assertion(pane.includes("general: { ...settings.general, select_ui_text }"), "开关没有写回设置");
});

testCase("Rust 设置默认关闭且旧配置自动补 false", () => {
  const settings = readFileSync(`${process.cwd()}/src-tauri/src/settings/general.rs`, "utf8");
  assertion(settings.includes("pub select_ui_text: bool"), "Rust 设置缺少字段");
  assertion(settings.includes("select_ui_text: false"), "默认值不是关闭");
  assertion(settings.includes("!old.select_ui_text"), "旧配置补值没有测试");
});

testCase("根数据属性开启时覆盖外壳禁选规则", () => {
  const css = readFileSync(`${process.cwd()}/src/styles/app.css`, "utf8");
  assertion(
    /html\[data-ui-text-selectable="true"\] body,[\s\S]*?html\[data-ui-text-selectable="true"\] body \*\s*\{[^}]*user-select:\s*text\s*!important/s.test(css),
    "开启后没有覆盖整个界面的 user-select",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
