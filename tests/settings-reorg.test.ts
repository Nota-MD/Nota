/**
 * 设置重组契约：插件管理/设置分栏、开发者模式两页、版本号五连点、下载替换规则。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

function read(...paragraph2: string[]): string {
  return readFileSync(join(...paragraph2), "utf8");
}

console.log("\n【0.8 设置重组】");

testCase("拓展管理与插件设置是两个独立页签", () => {
  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  assertValue(dialog.includes('| "pluginSettings"'), "缺少 pluginSettings 页");
  assertValue(dialog.includes('pluginSettings: t("Extension Settings")'), "插件设置没有独立标签");
  assertValue(dialog.includes('extensions: t("Extension Management")'), "拓展管理没有独立标签");
  assertValue(dialog.includes("<PluginSettingsPane"), "插件设置页没有接线");
  assertValue(dialog.includes("<ExtensionsPane"), "拓展管理页没有接线");
});

testCase("开发者模式页只在开启后出现，旧的空高级页已移除", () => {
  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  assertValue(
    dialog.includes('debugMode ? [...ORDER, "debug"] : ORDER'),
    "开发者模式页没有按开发者模式收放",
  );
  assertValue(!dialog.includes("AdvancedPane"), "旧的高级设置页仍在接线");
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  assertValue(!general.includes("debug_mode"), "通用页仍然暴露调试开关");
  assertValue(general.includes("onResetSettings"), "通用页缺少恢复出厂设置");
});

testCase("版本号五连点负责开关调试模式", () => {
  const about = read("src", "ui", "AboutDialog.tsx");
  assertValue(about.includes("versionClicks"), "没有版本号点击计数");
  assertValue(about.includes("length < 5"), "没有五连点阈值");
  assertValue(about.includes("onSetDebugMode"), "没有调试模式回调");
});

testCase("下载替换规则属于通用页", () => {
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  assertValue(general.includes("settings.download.replacements"), "通用页没有下载替换规则输入");
});

testCase("开发者模式页负责诊断、设置文件与关闭模式", () => {
  const debug = read("src", "ui", "settings", "panes", "DebugPane.tsx");
  assertValue(debug.includes("debug_mode: false"), "没有关闭开发者模式入口");
  assertValue(debug.includes("openDebugLog"), "开发者模式页没有调试日志入口");
  assertValue(debug.includes("onOpenConfigDir"), "开发者模式页没有设置文件入口");
});

testCase("应用更新与插件更新都使用替换规则", () => {
  const remote = read("src-tauri", "src", "remote.rs");
  const appUpdate = read("src-tauri", "src", "update.rs");
  const pluginUpdate = read("src-tauri", "src", "plugin", "updater.rs");
  assertValue(remote.includes("settings::download::改写地址"), "下载层没有应用替换规则");
  assertValue(appUpdate.includes("替换规则"), "应用更新没有传替换规则");
  assertValue(pluginUpdate.includes("替换规则"), "插件更新没有传替换规则");
});

testCase("调试设置会动态打开后端日志闸门", () => {
  const settings = read("src-tauri", "src", "commands", "settings.rs");
  const logs = read("src-tauri", "src", "log.rs");
  assertValue(settings.includes("log::设置调试模式"), "保存设置时没有同步日志闸门");
  assertValue(logs.includes("pub fn 设置调试模式"), "日志模块没有运行期开关");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
