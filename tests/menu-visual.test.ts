/** Typora 式菜单外壳与侧栏操作弹层。 */

import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const menucss = read("src/styles/menubar.css");
const sideBarcss = read("src/styles/sidebar.css");
const sideBarMenu = read("src/ui/SidebarContextMenu.tsx");
const sideBar = read("src/ui/Sidebar.tsx");

console.log("\n【菜单外观】");

testCase("菜单栏弹层、子菜单与右键菜单使用同一档圆角", () => {
  const popup = menucss.slice(menucss.indexOf(".menu-popup {"), menucss.indexOf(".menu-item {"));
  const sub = menucss.slice(menucss.indexOf(".menu-sub {"), menucss.indexOf(".menu-sub-left"));
  const context = sideBarcss.slice(
    sideBarcss.indexOf(".sidebar-context-menu {"),
    sideBarcss.indexOf(".sidebar-context-head"),
  );
  for (const [name, block] of [
    ["menu-popup", popup],
    ["menu-sub", sub],
    ["sidebar-context-menu", context],
  ] as const) {
    assertValue(block.includes("border-radius: var(--radius-sm)"), `${name} 圆角不一致`);
    assertValue(!block.includes("border-radius: var(--radius-lg)"), `${name} 仍用大圆角`);
  }
});

testCase("侧栏操作弹层有标题、关闭按钮、操作、视图、目录与文件动作", () => {
  for (const text of [
    't("Operations")',
    'title={t("Close")}',
    't("New File")',
    't("Open Folder…")',
    't("Refresh")',
    't("View")',
    't("Recent Directories")',
    't("Copy File Path")',
    't("Open File Location")',
  ]) {
    assertValue(sideBarMenu.includes(text), `缺少 ${text}`);
  }
});

testCase("视图按钮显示当前模式，并带工具提示", () => {
  assertValue(sideBarMenu.includes('data-on={listMode}'), "列表态");
  assertValue(sideBarMenu.includes('data-on={!listMode}'), "树形态");
  assertValue(sideBarMenu.includes('title={t("Document List")}'), "列表提示");
  assertValue(sideBarMenu.includes('title={t("Document Tree")}'), "树形提示");
  assertValue(sideBarcss.includes('[data-on="true"]'), "当前态没有样式");
});

testCase("未打开工作区时文件页仍可打开右键菜单", () => {
  const start4 = sideBar.indexOf('className="sidebar-pane"');
  const placeManage = sideBar.slice(start4, sideBar.indexOf("</section>", start4));
  assertValue(placeManage.includes("e.preventDefault()"), "文件页没有接管右键");
  assertValue(!placeManage.includes("if (!workspace) return"), "空工作区把右键菜单提前拦掉了");
  assertValue(
    (sideBarMenu.match(/disabled=\{!workspace\}/g) ?? []).length >= 3,
    "依赖工作区的菜单项没有禁用",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
