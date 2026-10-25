/** 更新设置页与可交互通知的契约。 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    pass += 1;
    console.log(`  ✔ ${name3}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name3}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

function read(...paragraph2: string[]): string {
  return readFileSync(join(...paragraph2), "utf8");
}

console.log("\n【更新设置与通知】");

testCase("更新设置是独立持久化页面", () => {
  const rust = read("src-tauri", "src", "settings", "updates.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  assertValue(rust.includes("check_on_startup"), "Rust 缺少启动检查字段");
  assertValue(rust.includes("notify_when_available"), "Rust 缺少更新通知字段");
  assertValue(rust.includes("notification_position"), "Rust 缺少通知位置字段");
  assertValue(types.includes("export interface UpdateSettings"), "前端缺少更新设置类型");
  assertValue(dialog.includes('| "updates"'), "设置左栏缺少更新页");
  assertValue(dialog.includes("<UpdatePane"), "更新页没有接线");
});

testCase("通知开关依赖启动检查，且许可证不再重复在通用页", () => {
  const pane = read("src", "ui", "settings", "panes", "UpdatePane.tsx");
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  assertValue(pane.includes("disabled={!u.check_on_startup}"), "通知开关没有依赖启动检查");
  assertValue(!general.includes('title={t("License")}'), "通用页仍重复许可证组");
});

testCase("通知支持位置和操作按钮", () => {
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  const update = read("src", "ui", "settings", "panes", "UpdatePane.tsx");
  const toasts = read("src", "ui", "Toasts.tsx");
  const css = read("src", "styles", "toast.css");
  assertValue(general.includes('label={t("Notification position")}'), "通知位置没有落在通用页");
  assertValue(!update.includes('label={t("Notification position")}'), "更新页仍重复通知位置");
  assertValue(toasts.includes("data-position"), "通知容器没有位置属性");
  assertValue(toasts.includes("ToastAction"), "通知没有操作类型");
  assertValue(toasts.includes("toast-action"), "通知没有操作按钮");
  assertValue(css.includes('[data-position="top-center"]'), "缺少顶部通知样式");
});

testCase("启动检查只在首份设置到岸后执行一次", () => {
  const hook = read("src", "ui", "useUpdateNotifications.ts");
  assertValue(hook.includes("started.current"), "没有防重复检查");
  assertValue(hook.includes("check_on_startup"), "没有读取启动检查开关");
  assertValue(hook.includes("notify_when_available"), "没有读取通知开关");
});

testCase("菜单栏默认 Nota 自绘，外观设置可切系统原生", () => {
  const rust = read("src-tauri", "src", "settings", "appearance.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const pane = read("src", "ui", "settings", "panes", "AppearancePane.tsx");
  const hooks = read("src", "ui", "useMenus.ts");
  assertValue(rust.includes("MenuBarRenderer"), "Rust 缺少菜单栏渲染枚举");
  assertValue(rust.includes("menu_renderer: MenuBarRenderer::Nota"), "默认不是 Nota 自绘");
  assertValue(types.includes('export type MenuBarRenderer = "nota" | "system"'), "前端类型不对");
  assertValue(pane.includes('label={t("Menu bar rendering")}'), "外观页没有菜单样式选项");
  assertValue(pane.includes("<Select") && pane.includes('{ value: "system", label: t("System native") }'), "菜单样式必须使用下拉框");
  assertValue(pane.includes('label: t("Nota (self-drawn)")'), "默认选项没有说明为 Nota 自绘");
  assertValue(hooks.includes('menuRenderer !== "system"'), "菜单钩子没有尊重渲染设置");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
