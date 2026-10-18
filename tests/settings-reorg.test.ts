/**
 * 0.8 设置重组契约：插件管理/设置分栏、隐藏高级页、版本号五连点、下载替换规则。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let 过 = 0;
let 败 = 0;

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 真(值: unknown, 说明: string): asserts 值 {
  if (!值) throw new Error(说明);
}

function 读(...段: string[]): string {
  return readFileSync(join(...段), "utf8");
}

console.log("\n【0.8 设置重组】");

测("拓展管理与插件设置是两个独立页签", () => {
  const dialog = 读("src", "ui", "settings", "SettingsDialog.tsx");
  真(dialog.includes('| "pluginSettings"'), "缺少 pluginSettings 页");
  真(dialog.includes('pluginSettings: t("Extension Settings")'), "插件设置没有独立标签");
  真(dialog.includes('extensions: t("Extension Management")'), "拓展管理没有独立标签");
  真(dialog.includes("<PluginSettingsPane"), "插件设置页没有接线");
  真(dialog.includes("<ExtensionsPane"), "拓展管理页没有接线");
});

测("高级设置只在调试模式出现", () => {
  const dialog = 读("src", "ui", "settings", "SettingsDialog.tsx");
  真(
    dialog.includes('debugMode ? [...ORDER, "advanced"] : ORDER'),
    "高级页没有按调试模式收放",
  );
  const general = 读("src", "ui", "settings", "panes", "GeneralPane.tsx");
  真(!general.includes("debug_mode"), "通用页仍然暴露调试开关");
  真(!general.includes("onResetSettings"), "通用页仍然暴露高级操作");
});

测("版本号五连点负责开关调试模式", () => {
  const about = 读("src", "ui", "AboutDialog.tsx");
  真(about.includes("versionClicks"), "没有版本号点击计数");
  真(about.includes("length < 5"), "没有五连点阈值");
  真(about.includes("onSetDebugMode"), "没有调试模式回调");
});

测("高级页包含下载替换规则和运行信息", () => {
  const advanced = 读("src", "ui", "settings", "panes", "AdvancedPane.tsx");
  真(advanced.includes("settings.download.replacements"), "没有下载替换规则输入");
  真(advanced.includes("Runtime information"), "没有运行信息");
  真(advanced.includes("Disable Debug Mode"), "没有关闭调试模式入口");
});

测("应用更新与插件更新都使用替换规则", () => {
  const remote = 读("src-tauri", "src", "remote.rs");
  const appUpdate = 读("src-tauri", "src", "update.rs");
  const pluginUpdate = 读("src-tauri", "src", "plugin", "updater.rs");
  真(remote.includes("settings::download::改写地址"), "下载层没有应用替换规则");
  真(appUpdate.includes("替换规则"), "应用更新没有传替换规则");
  真(pluginUpdate.includes("替换规则"), "插件更新没有传替换规则");
});

测("调试设置会动态打开后端日志闸门", () => {
  const settings = 读("src-tauri", "src", "commands", "settings.rs");
  const logs = 读("src-tauri", "src", "log.rs");
  真(settings.includes("log::设置调试模式"), "保存设置时没有同步日志闸门");
  真(logs.includes("pub fn 设置调试模式"), "日志模块没有运行期开关");
});

if (败 > 0) {
  console.error(`\n${败} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${过} passed, 0 failed`);
}
