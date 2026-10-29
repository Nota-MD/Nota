/** Windows 主题目录、内置兜底与两个“打开主题文件夹”入口。 */

import { readFileSync } from "node:fs";

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

console.log("\n【主题目录】");

testCase("启动时自动创建 themes/document 与 themes/ui", () => {
  const paths = read("src-tauri/src/paths.rs");
  contains(paths, 'config_dir()?.join("themes").join("document")', "文档主题目录不是 themes/document");
  contains(paths, 'config_dir()?.join("themes").join("ui")', "界面主题目录不是 themes/ui");
  contains(paths, "pub fn ensure_theme_directories()", "缺少启动建目录函数");
  contains(read("src-tauri/src/lib.rs"), "ensure_theme_directories()", "启动流程没有调用建目录");
});

testCase("两个入口分别打开文档主题与界面主题目录", () => {
  const commands = read("src/ui/commands.ts");
  const appearance = read("src/ui/settings/panes/AppearancePane.tsx");
  const docPane = read("src/ui/settings/panes/DocThemePane.tsx");
  contains(commands, "Open Document Themes Folder…", "菜单文档主题入口不明确");
  contains(appearance, "Interface themes folder…", "界面主题入口不明确");
  contains(appearance, "Document themes folder…", "外观页的文档主题入口不明确");
  contains(docPane, "Document themes folder…", "文档主题页入口不明确");
});

testCase("内置 Adwaita 先显示，目录打开时重扫，界面主题可手动刷新", () => {
  const startup = read("src/ui/useStartup.ts");
  contains(startup, "BUILTIN_DOC_THEMES", "没有内置主题首帧兜底");
  contains(startup, "themeList.length > 0 ? themeList : BUILTIN_DOC_THEMES", "空清单没有兜底");
  const menuBar = read("src/ui/MenuBar.tsx");
  contains(menuBar, 'menu.dynamic === "themes"', "主题菜单打开时没有重扫");
  contains(menuBar, "onRefreshThemes", "主题重扫回调未接线");
  const styles = read("src/ui/useUiStyles.ts");
  contains(styles, "refreshStyles", "界面主题没有重扫入口");
  contains(styles, "setScan((value) => value + 1)", "界面主题重扫没有触发 effect");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
