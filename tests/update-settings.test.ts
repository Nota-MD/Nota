/** 更新设置页与可交互通知的契约。 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let 过 = 0;
let 败 = 0;

function 测(名: string, 体: () => void): void {
  try {
    体();
    过 += 1;
    console.log(`  ✔ ${名}`);
  } catch (error) {
    败 += 1;
    console.log(`  ✘ ${名}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function 真(值: unknown, 说明: string): asserts 值 {
  if (!值) throw new Error(说明);
}

function 读(...段: string[]): string {
  return readFileSync(join(...段), "utf8");
}

console.log("\n【更新设置与通知】");

测("更新设置是独立持久化页面", () => {
  const rust = 读("src-tauri", "src", "settings", "updates.rs");
  const types = 读("src", "bridge", "types-settings.ts");
  const dialog = 读("src", "ui", "settings", "SettingsDialog.tsx");
  真(rust.includes("check_on_startup"), "Rust 缺少启动检查字段");
  真(rust.includes("notify_when_available"), "Rust 缺少更新通知字段");
  真(rust.includes("notification_position"), "Rust 缺少通知位置字段");
  真(types.includes("export interface UpdateSettings"), "前端缺少更新设置类型");
  真(dialog.includes('| "updates"'), "设置左栏缺少更新页");
  真(dialog.includes("<UpdatePane"), "更新页没有接线");
});

测("通知开关依赖启动检查，且许可证不再重复在通用页", () => {
  const pane = 读("src", "ui", "settings", "panes", "UpdatePane.tsx");
  const general = 读("src", "ui", "settings", "panes", "GeneralPane.tsx");
  真(pane.includes("disabled={!u.check_on_startup}"), "通知开关没有依赖启动检查");
  真(!general.includes('title={t("License")}'), "通用页仍重复许可证组");
});

测("通知支持位置和操作按钮", () => {
  const toasts = 读("src", "ui", "Toasts.tsx");
  const css = 读("src", "styles", "toast.css");
  真(toasts.includes("data-position"), "通知容器没有位置属性");
  真(toasts.includes("ToastAction"), "通知没有操作类型");
  真(toasts.includes("toast-action"), "通知没有操作按钮");
  真(css.includes('[data-position="top-center"]'), "缺少顶部通知样式");
});

测("启动检查只在首份设置到岸后执行一次", () => {
  const hook = 读("src", "ui", "useUpdateNotifications.ts");
  真(hook.includes("started.current"), "没有防重复检查");
  真(hook.includes("check_on_startup"), "没有读取启动检查开关");
  真(hook.includes("notify_when_available"), "没有读取通知开关");
});

if (败 > 0) {
  console.error(`\n${败} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${过} passed, 0 failed`);
}
