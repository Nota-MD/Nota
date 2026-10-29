/** 顶层菜单最后一栏：只有“关于”，不再保留帮助页。 */

import { existsSync, readFileSync } from "node:fs";

import { MENUS, walkMenuItems } from "../src/ui/commands";

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

function contains(text: string, part: string, message: string): void {
  assertValue(text.includes(part), `${message}：缺少 ${JSON.stringify(part)}`);
}

const read = (path: string) => readFileSync(path, "utf8");
const allItems: string[] = [];
walkMenuItems(MENUS, (item) => allItems.push(item.id));

console.log("\n【关于菜单】");

testCase("最后一栏叫“关于”，只保留关于 Nota", () => {
  const last = MENUS.at(-1);
  assertValue(last?.id === "about", "最后一栏不是 about");
  assertValue(last.label === "About", "最后一栏标签没有改成 About");
  assertValue(last.dynamic === undefined, "关于栏不应是动态菜单");
  assertValue(last.items.length === 1, "关于栏应只有一个菜单项");
  const item = last.items[0];
  assertValue(item !== "sep" && item && !Array.isArray(item), "关于栏第一项不是普通菜单项");
  assertValue(item.id === "about.about", "关于项 id 不是 about.about");
});

testCase("帮助菜单项与 F1 入口已经移除", () => {
  assertValue(!allItems.includes("help.help"), "仍存在 help.help");
  assertValue(!allItems.includes("help.about"), "仍存在旧 help.about");
  assertValue(!read("src/ui/useCommandTable.ts").includes('"help.help"'), "命令表仍能打开帮助");
  assertValue(!read("src/ui/commands.ts").includes('accel: "F1"'), "F1 仍绑定已删除的帮助页");
});

testCase("插件栏插入在“关于”之前", () => {
  const source = read("src/ui/pluginMenus.ts");
  contains(source, 'm.id === "about"', "插件栏锚点不是关于");
  assertValue(!source.includes('m.id === "help"'), "插件栏仍以帮助为锚点");
});

testCase("帮助窗口、路由、IPC 与 Rust 命令全部删除", () => {
  for (const path of ["help.html", "src/help.tsx", "src/ui/HelpWindow.tsx", "src/styles/help-window.css"]) {
    assertValue(!existsSync(path), `帮助文件仍存在：${path}`);
  }
  assertValue(!read("vite.config.ts").includes("help: fileURLToPath"), "Vite 仍构建帮助页");
  assertValue(!read("src/main.tsx").includes("HelpWindow"), "main.tsx 仍引用帮助窗口");
  assertValue(!read("src/bridge/ipc.ts").includes("openHelp"), "IPC 仍暴露帮助命令");
  assertValue(!read("src-tauri/src/lib.rs").includes("nota_window_open_help"), "Rust 仍注册帮助命令");
  assertValue(!read("src-tauri/src/commands/window.rs").includes("nota_window_open_help"), "Rust 仍实现帮助命令");
  assertValue(!read("src-tauri/capabilities/default.json").includes('"help"'), "帮助窗口仍有 capability");
});

testCase("Pandoc 缺失面板不再依赖帮助页", () => {
  const panel = read("src/ui/PandocPanel.tsx");
  const exportSource = read("src/ui/useExport.ts");
  assertValue(!panel.includes("onHelp"), "Pandoc 面板仍有帮助回调");
  assertValue(!panel.includes("Open installation help"), "Pandoc 面板仍有安装帮助按钮");
  assertValue(!exportSource.includes("openHelp"), "导出流程仍调用帮助页");
  contains(panel, '{ label: t("Try Anyway"), run: onExport }', "Pandoc 缺失时没有可继续的路");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
