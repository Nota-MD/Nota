/** 设置包不是安装包：选择粒度、ZIP 清单、安全边界与 IPC 接线。 */

import { readFileSync } from "node:fs";

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

function 含(文: string, 片: string, 说明: string): void {
  真(文.includes(片), `${说明}：缺少 ${JSON.stringify(片)}`);
}

const rust = readFileSync("src-tauri/src/settings_export.rs", "utf8");
const dialog = readFileSync("src/ui/settings/SettingsExportDialog.tsx", "utf8");
const ipc = readFileSync("src/bridge/ipc.ts", "utf8");
const lib = readFileSync("src-tauri/src/lib.rs", "utf8");

console.log("\n【设置与数据包】");

测("包是标准 ZIP，并带格式清单", () => {
  含(rust, "ZipWriter", "ZIP 写入器");
  含(rust, 'FORMAT: &str = "nota-settings-package"', "包格式标识");
  含(rust, '"manifest.json"', "清单文件");
  含(rust, 'CompressionMethod::Deflated', "压缩写入");
});

测("程序设置与插件设置/数据分别可选", () => {
  含(rust, '"settings"', "程序设置");
  含(rust, '"session"', "会话");
  含(rust, '"themes"', "主题资源");
  含(rust, '"dictionaries"', "词典");
  含(rust, "pub settings: bool", "插件设置开关");
  含(rust, "pub data: bool", "插件数据开关");
  含(dialog, 'part: "settings" | "data"', "前端分开切换");
});

测("敏感项默认不勾选，但仍可手动选择", () => {
  含(dialog, "item.available && !item.sensitive", "敏感项默认排除");
  含(dialog, "Contains credentials", "界面明确提示凭据");
  含(rust, '"image-upload" => (源种类::文件, "program/image-upload.toml", true)', "后端标记敏感");
});

测("目录导出跳过符号链接与依赖缓存", () => {
  含(rust, "ft.is_symlink()", "统计时跳过链接");
  含(rust, "meta.file_type().is_symlink()", "收集时跳过链接");
  含(rust, 'name == ".git" || name == "node_modules"', "跳过依赖缓存");
  含(rust, "skipped_symlinks", "清单记录跳过数量");
});

测("设置包命令已注册，默认后缀不是安装包", () => {
  含(lib, "nota_settings_export_inventory", "库存命令");
  含(lib, "nota_settings_export,", "导出命令");
  含(ipc, 'invoke<SettingsExportInventory>("nota_settings_export_inventory")', "桥接库存");
  含(dialog, ".nota-backup", "设置包后缀");
  真(!dialog.toLowerCase().includes("installer.exe"), "前端仍在生成安装器名");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
