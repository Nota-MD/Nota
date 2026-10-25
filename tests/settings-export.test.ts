/** 设置包不是安装包：选择粒度、ZIP 清单、安全边界与 IPC 接线。 */

import { readFileSync } from "node:fs";

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

function contains(text4: string, slice: string, description: string): void {
  assertValue(text4.includes(slice), `${description}：缺少 ${JSON.stringify(slice)}`);
}

const rust = readFileSync("src-tauri/src/settings_export.rs", "utf8");
const dialog = readFileSync("src/ui/settings/SettingsExportDialog.tsx", "utf8");
const ipc = readFileSync("src/bridge/ipc.ts", "utf8");
const lib = readFileSync("src-tauri/src/lib.rs", "utf8");

console.log("\n【设置与数据包】");

testCase("包是标准 ZIP，并带格式清单", () => {
  contains(rust, "ZipWriter", "ZIP 写入器");
  contains(rust, 'FORMAT: &str = "nota-settings-package"', "包格式标识");
  contains(rust, '"manifest.json"', "清单文件");
  contains(rust, 'CompressionMethod::Deflated', "压缩写入");
});

testCase("程序设置与插件设置/数据分别可选", () => {
  contains(rust, '"settings"', "程序设置");
  contains(rust, '"session"', "会话");
  contains(rust, '"themes"', "主题资源");
  contains(rust, '"dictionaries"', "词典");
  contains(rust, "pub settings: bool", "插件设置开关");
  contains(rust, "pub data: bool", "插件数据开关");
  contains(dialog, 'part: "settings" | "data"', "前端分开切换");
});

testCase("敏感项默认不勾选，但仍可手动选择", () => {
  contains(dialog, "item.available && !item.sensitive", "敏感项默认排除");
  contains(dialog, "Contains credentials", "界面明确提示凭据");
  contains(rust, '"image-upload" => (源种类::文件, "program/image-upload.toml", true)', "后端标记敏感");
});

testCase("目录导出跳过符号链接与依赖缓存", () => {
  contains(rust, "ft.is_symlink()", "统计时跳过链接");
  contains(rust, "meta.file_type().is_symlink()", "收集时跳过链接");
  contains(rust, 'name == ".git" || name == "node_modules"', "跳过依赖缓存");
  contains(rust, "skipped_symlinks", "清单记录跳过数量");
});

testCase("设置包命令已注册，默认后缀不是安装包", () => {
  contains(lib, "nota_settings_export_inventory", "库存命令");
  contains(lib, "nota_settings_export,", "导出命令");
  contains(ipc, 'invoke<SettingsExportInventory>("nota_settings_export_inventory")', "桥接库存");
  contains(dialog, ".nota-backup", "设置包后缀");
  assertValue(!dialog.toLowerCase().includes("installer.exe"), "前端仍在生成安装器名");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
