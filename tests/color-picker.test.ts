/** Self-drawn accent color picker contracts. */

import { readFileSync } from "node:fs";

import { accentPalette } from "@/ui/settings/ColorPicker";

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

console.log("\n【自绘主题色选择器】");

testCase("色板是 9×5 的合法且不重复颜色", () => {
  assertValue(accentPalette.length === 45, "色板不是 9×5");
  assertValue(
    accentPalette.every((color) => /^#[0-9a-f]{6}$/.test(color)),
    "色板里有无颜色不合法",
  );
  assertValue(new Set(accentPalette).size === accentPalette.length, "色板有重复颜色");
});

testCase("不再调用原生颜色输入框", () => {
  const picker = readFileSync("src/ui/settings/ColorPicker.tsx", "utf8");
  const appearance = readFileSync(
    "src/ui/settings/panes/AppearancePane.tsx",
    "utf8",
  );
  assertValue(!picker.includes('type="color"'), "ColorPicker 仍调用原生取色器");
  assertValue(!appearance.includes('type="color"'), "外观页仍保留原生颜色输入框");
  assertValue(picker.includes("createPortal("), "自绘色板没有使用视口浮层");
});

testCase("自绘色板保留选择、键盘与自定义颜色", () => {
  const picker = readFileSync("src/ui/settings/ColorPicker.tsx", "utf8");
  for (const key of ['"ArrowLeft"', '"ArrowRight"', '"ArrowUp"', '"ArrowDown"', '"Escape"']) {
    assertValue(picker.includes(key), `色板缺少 ${key}`);
  }
  assertValue(picker.includes("parseAccent(draft)"), "自定义颜色没有复用统一解析");
  assertValue(picker.includes("onChange(color)"), "点击色块没有写回主题色");
  assertValue(picker.includes('role="gridcell"'), "色块缺少 gridcell 语义");
  assertValue(picker.includes("aria-activedescendant"), "键盘高亮没有报给读屏器");
});

testCase("色板样式和入口已接入", () => {
  const css = readFileSync("src/styles/color-picker.css", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const appearance = readFileSync(
    "src/ui/settings/panes/AppearancePane.tsx",
    "utf8",
  );
  assertValue(css.includes("grid-template-columns: repeat(9, 1fr)"), "色板不是九列");
  assertValue(css.includes("position: fixed"), "色板没有脱离设置滚动容器");
  assertValue(main.includes('import "./styles/color-picker.css";'), "色板样式没有加载");
  assertValue(appearance.includes("<ColorPicker"), "外观页没有使用自绘色板");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
