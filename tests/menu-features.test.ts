/** 菜单里原先永久灰着的功能已经接到真实处理器。 */

import { readFileSync } from "node:fs";

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
  assertValue(text.includes(part), `${message}：缺少 ${part}`);
}

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const commandTable = read("src/ui/useCommandTable.ts");

console.log("\n【菜单灰项接线】");

testCase("除按状态出现的最近文件外，不再有永久灰项", () => {
  const implemented = new Set(
    [...commandTable.matchAll(/"((?:file|edit|para|fmt|view|help)\.[^"]+)":/g)].map((m) => m[1]),
  );
  const items = [];
  walkMenuItems(MENUS, (item) => items.push(item));
  const missing = items
    .filter((item) => !item.submenu && !implemented.has(item.id))
    .map((item) => item.id);
  if (missing.join(",") !== "file.recent") {
    throw new Error(`剩余永久灰项：${missing.join(", ") || "无"}`);
  }
});

testCase("窗口、快速打开、保存全部、定位和删除均已接线", () => {
  for (const id of [
    "file.newWindow",
    "file.quickOpen",
    "file.saveAll",
    "file.revealInFolder",
    "file.showInSidebar",
    "file.delete",
    "file.exportImage",
    "edit.copyImage",
    "fmt.comment",
    "view.search",
    "view.readOnly",
  ]) {
    contains(commandTable, `"${id}":`, id);
  }
  const functionAble = read("src/ui/useMenuFeatures.ts");
  contains(functionAble, "api.doc.delete", "删除动作");
  contains(read("src/bridge/ipc.ts"), "nota_doc_delete", "删除 IPC");
  contains(read("src-tauri/src/commands/document.rs"), "nota_doc_delete", "删除命令");
});

testCase("快速打开与搜索共用侧栏搜索信号", () => {
  const functionAble = read("src/ui/useMenuFeatures.ts");
  const app = read("src/App.tsx");
  contains(functionAble, "setSearchRequest((n) => n + 1)", "搜索信号自增");
  contains(app, "searchRequest={menuFeatures.searchRequest}", "Sidebar 搜索请求");
  contains(read("src/ui/Sidebar.tsx"), "setSearching(true)", "侧栏打开搜索框");
});

testCase("只读模式接到 Milkdown 与源码编辑器，并有菜单勾", () => {
  const pane = read("src/ui/EditorPane.tsx");
  const editors = read("src/ui/pane-editors.ts");
  const menus = read("src/ui/useMenus.ts");
  contains(pane, "readOnly: onlyReadMode", "主窗格只读参数");
  contains(editors, "readOnly", "编辑器构造参数");
  contains(menus, '"view.readOnly": readOnly', "菜单勾状态");
 contains(menus, "readOnly: boolean", "菜单接线字段");
});

testCase("注释、复制图片和图片导出使用真实编辑器/导出链", () => {
  const types = read("src/editor/create-types.ts");
  const table = read("src/editor/command-table.ts");
  const source = read("src/editor/source-commands.ts");
  const clipboard = read("src/ui/useClipboard.ts");
  const exportImage = read("src/ui/export-image.ts");
  contains(types, '| "comment"', "注释命令类型");
  contains(table, "comment: (e)", "所见即所得注释实现");
  contains(source, 'case "comment"', "源码注释实现");
  contains(clipboard, "ClipboardItem", "复制图片");
  contains(exportImage, "htmlToPngBase64", "HTML 转 PNG");
  contains(read("src/ui/useExport.ts"), "exportImage", "图片导出接线");
});

testCase("图片右键复制直接使用命中的图片，并有原生剪贴板兜底", () => {
  const menu = read("src/ui/ContextMenu.tsx");
  const clipboard = read("src/ui/useClipboard.ts");
  const app = read("src/App.tsx");
  const capability = read("src-tauri/capabilities/default.json");
  contains(menu, 'const contextImage = el.closest("img")', "右键图片没有保存命中元素");
  contains(menu, "copyImage(thisOneDocument.image)", "复制命令仍从 DOM 选区重新猜图片");
  contains(app, "copyImage: cutPasteBoard.copyImageSlice", "右键菜单没有拿到复制图片实现");
  contains(clipboard, "writeImageNative", "没有 Tauri 原生图片剪贴板兜底");
  contains(clipboard, "writeImage(imageResource)", "没有调用原生图片剪贴板写入");
  contains(capability, "clipboard-manager:allow-write-image", "没有开放原生图片剪贴板权限");
});

testCase("无定义的其他格式占位已移除，不再伪装成功能", () => {
  const commands = read("src/ui/commands.ts");
  assertValue(!commands.includes("file.exportOther"), "仍保留 Other Formats 占位");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
