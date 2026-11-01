/** Developer-mode element hover inspector contracts. */

import { readFileSync } from "node:fs";

import {
  compactInspectorValue,
  inspectorPlacement,
  inspectorRows,
  inspectorSelector,
} from "@/ui/element-inspector";

let pass = 0;
let fail = 0;

function check(label: string, condition: unknown): void {
  if (condition) {
    pass++;
    console.log(`  ✔ ${label}`);
  } else {
    fail++;
    console.log(`  ✘ ${label}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string): void {
  check(label, JSON.stringify(actual) === JSON.stringify(expected));
}

console.log("\n【元素悬停检查】");

equal(compactInspectorValue("  sans-serif\n  system-ui  "), "sans-serif system-ui", "空白压成一行");
check(
  compactInspectorValue("甲".repeat(80), 10) === `${"甲".repeat(9)}…`,
  "过长值截断并保留省略号",
);

const fakeElement = {
  tagName: "BUTTON",
  id: "save",
  classList: ["btn", "btn-primary", "ignored"],
} as unknown as Element;
equal(
  inspectorSelector(fakeElement),
  "button#save.btn.btn-primary",
  "选择器显示标签、id 和前两个类名",
);

const rows = inspectorRows(
  {
    fontFamily: "Adwaita Sans, sans-serif",
    fontSize: "15px",
    fontWeight: "600",
    lineHeight: "22px",
    color: "rgb(31, 35, 40)",
    backgroundColor: "rgb(246, 248, 250)",
    padding: "4px 10px",
    borderRadius: "6px",
    display: "inline-flex",
  },
  118.4,
  32.2,
);
equal(rows, [
  { label: "font", value: "15px / 22px · 600" },
  { label: "font-family", value: "Adwaita Sans, sans-serif" },
  { label: "color", value: "rgb(31, 35, 40)" },
  { label: "background", value: "rgb(246, 248, 250)" },
  { label: "box", value: "118 × 32 · inline-flex" },
  { label: "padding", value: "4px 10px" },
  { label: "radius", value: "6px" },
], "字体、颜色、盒尺寸和内边距都进入提示");

const below = inspectorPlacement(
  { left: 120, top: 100, right: 240, bottom: 140, width: 120 },
  1000,
  800,
);
equal(below.side, "below", "下方有空间时显示在元素下方");
equal(below.style.top, 148, "下方间距为 8px");
equal(below.style.width, 380, "宽屏保持紧凑面板宽度");

const above = inspectorPlacement(
  { left: 900, top: 700, right: 980, bottom: 730, width: 80 },
  1000,
  800,
);
equal(above.side, "above", "下方不足时翻到元素上方");
equal(above.style.left, 612, "右侧元素的面板夹回视口内");

const app = readFileSync("src/App.tsx", "utf8");
check(
  app.includes(
    "<ElementInspector enabled={(settings?.general.debug_mode ?? false) && (settings?.general.element_inspector ?? false)} />",
  ),
  "元素检查只在开发者模式与独立开关同时开启时挂载",
);

const pane = readFileSync("src/ui/settings/panes/DebugPane.tsx", "utf8");
check(pane.includes('t("Element hover inspector")'), "开发者设置页有元素悬停检查开关");
check(pane.includes("element_inspector"), "开关写入通用设置");

const css = readFileSync("src/styles/element-inspector.css", "utf8");
check(css.includes("pointer-events: none"), "检查浮层不抢指针命中");
check(css.includes("position: fixed"), "检查浮层固定在视口坐标");

const host = readFileSync("src-tauri/src/settings/general.rs", "utf8");
check(host.includes("pub element_inspector: bool"), "Rust 设置字段存在");
check(host.includes("element_inspector: false"), "元素检查默认关闭");

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exit(1);
