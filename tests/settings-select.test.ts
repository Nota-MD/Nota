/** 设置页下拉已从原生 select 换成主题可完整控制的自绘 combobox。 */

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

const primitives = readFileSync("src/ui/settings/primitives.tsx", "utf8");
const controls = readFileSync("src/styles/settings-controls.css", "utf8");
const theme = readFileSync("src/styles/theme/base.css", "utf8");
const modalTrap = readFileSync("src/ui/useModalTrap.ts", "utf8");

console.log("\n【自绘下拉】");

testCase("Select 不再渲染原生 select", () => {
  const selectStart = primitives.indexOf("export function Select");
  const toggleStart = primitives.indexOf("export function Toggle", selectStart);
  const component = primitives.slice(selectStart, toggleStart);
  assertValue(selectStart >= 0 && toggleStart > selectStart, "找不到 Select 组件边界");
  assertValue(!component.includes("<select"), "Select 仍渲染原生 select");
  assertValue(!component.includes("<option"), "Select 仍渲染原生 option");
  assertValue(component.includes('role="combobox"'), "触发器没有 combobox 语义");
  assertValue(component.includes('role="listbox"'), "弹层没有 listbox 语义");
  assertValue(component.includes('role="option"'), "选项没有 option 语义");
});

testCase("自绘下拉保留 portal、受控值、禁用态和键盘操作", () => {
  const selectStart = primitives.indexOf("export function Select");
  const toggleStart = primitives.indexOf("export function Toggle", selectStart);
  const component = primitives.slice(selectStart, toggleStart);
  assertValue(component.includes("createPortal("), "列表没有 portal，滚动容器会裁切");
  assertValue(component.includes("onChange(option.value)"), "选项没有更新受控值");
  assertValue(component.includes('"ArrowDown"'), "缺少向下键");
  assertValue(component.includes('"ArrowUp"'), "缺少向上键");
  assertValue(component.includes('"Home"'), "缺少 Home 键");
  assertValue(component.includes('"End"'), "缺少 End 键");
  assertValue(component.includes('"Escape"'), "缺少 Escape 键");
  assertValue(component.includes("typeaheadRef"), "缺少原生下拉常见的首字母跳转");
  assertValue(
    component.includes("popup.scrollTop") && component.includes("getBoundingClientRect()"),
    "键盘高亮越界时没有滚动弹层自身",
  );
  assertValue(
    primitives.includes("OWN_CONTROLS") && primitives.includes("  Select,"),
    "SettingRow 不再把 Select 当成可标注控件",
  );
  assertValue(
    modalTrap.includes('[role="combobox"][aria-haspopup="listbox"][aria-expanded="true"]'),
    "Escape 会越过展开中的下拉，直接关闭整个设置框",
  );
});

testCase("trigger、popup、active 与 selected 全由主题 CSS 控制", () => {
  for (const selector of [
    ".stg-select-trigger",
    ".stg-select-popup",
    ".stg-select-option",
    '.stg-select-option[data-active="true"]',
    '.stg-select-option[aria-selected="true"]',
  ]) {
    assertValue(controls.includes(selector), `CSS 缺少 ${selector}`);
  }
  for (const variable of [
    "--select-bg",
    "--select-fg",
    "--select-popup-bg",
    "--select-popup-fg",
    "--select-option-hover-bg",
    "--select-option-selected-bg",
    "--select-option-selected-fg",
  ]) {
    assertValue(theme.includes(variable), `主题变量缺少 ${variable}`);
  }
  assertValue(!controls.includes(".stg-select-native"), "旧原生 select 样式仍有残留");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
