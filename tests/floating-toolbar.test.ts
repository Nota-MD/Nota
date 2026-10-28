/** 格式化工具栏的居底悬浮胶囊布局与分组菜单。 */

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

const bar = readFileSync("src/ui/FormatBar.tsx", "utf8");
const css = readFileSync("src/styles/bars.css", "utf8");
const chrome = readFileSync("src/ui/useChromeVisibility.ts", "utf8");

console.log("\n【悬浮工具栏】");

testCase("工具栏分成段落、常用行内、链接图像、列表和更多菜单", () => {
  for (const marker of [
    "format-selector",
    "openMenu === \"paragraph\"",
    "openMenu === \"list\"",
    "openMenu === \"more\"",
    "primaryInline.map(draw)",
    'draw(byCommand("link"))',
    'draw(byCommand("image"))',
    'draw(byCommand("quote"))',
  ]) {
    assertValue(bar.includes(marker), `工具栏缺少 ${marker}`);
  }
  for (const command of [
    '"text"',
    '"h1"',
    '"h6"',
    '"ul"',
    '"ol"',
    '"task"',
    '"highlight"',
    '"codeBlock"',
    '"clearFormat"',
  ]) {
    assertValue(bar.includes(command), `分组菜单丢了命令 ${command}`);
  }
  for (const menuId of [
    '"para.table"',
    '"para.codeBlock"',
    '"para.mathBlock"',
    '"para.hr"',
    '"view.modeSource"',
    '"edit.copy"',
    '"edit.paste"',
    '"edit.copyAs"',
    '"edit.delete"',
  ]) {
    assertValue(bar.includes(menuId), `参考菜单丢了命令 ${menuId}`);
  }
  assertValue(bar.includes("<MenuPopup"), "没有复用带快捷键和勾选的菜单组件");
  assertValue(bar.includes("focusEditor"), "菜单关闭后没有把焦点还给正文");
});

testCase("工具栏不占正文流，停靠在底部并向上展开菜单", () => {
  assertValue(
    /\.app-main > \.format-bar[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*calc\(var\(--nota-bottom-bar-height, 0px\) \+ 14px\);/.test(
      css,
    ),
    "工具栏没有按真实底部栏高度加间距定位",
  );
  assertValue(css.includes("translateX(-50%)"), "工具栏没有水平居中");
  assertValue(
    /\.format-menu\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*calc\(100% \+ 7px\)/.test(css),
    "分组菜单没有向工具栏上方展开",
  );
  assertValue(chrome.includes('"--nota-bottom-bar-height"'), "没有测量并写入底部栏实际高度");
  assertValue(chrome.includes("ResizeObserver"), "底部栏高度变化时没有重新测量");
  assertValue(chrome.includes("MutationObserver"), "状态栏或标签栏出现/消失时没有重新测量");
});

testCase("悬停显示从底部感应，且菜单打开时不会误收起", () => {
  assertValue(chrome.includes("bottomPartTriggerBand"), "悬停触发仍按顶部计算");
  assertValue(chrome.includes("mainArea.bottom - bottomPartTriggerBand"), "底部触发带没有接到主区下沿");
  assertValue(chrome.includes('querySelectorAll(".format-menu")'), "指针进入菜单时工具栏会消失");
});

testCase("更多菜单保留收起入口，不依赖最右侧叉号", () => {
  assertValue(bar.includes('id: "view.toolbarNever"'), "更多菜单没有收起命令");
  assertValue(bar.includes('label: "Hide the formatting toolbar"'), "收起入口没有明确文案");
  assertValue(!bar.includes('className="format-bar-close"\n        title'), "工具栏仍保留右侧独立叉号");
});

testCase("段落菜单不重复绘制 Paragraph 字形，避免与中文标签重叠", () => {
  assertValue(
    bar.includes('b.cmd === "text" ? null') ||
      /cmd:\s*"text"[\s\S]*?icon:/.test(bar),
    "段落项仍同时绘制英文字形与本地化标签",
  );
});

testCase("普通文本是 Ctrl+0，并跟随当前块显示勾选", () => {
  assertValue(bar.includes('"para.text": state.block === "text"'), "普通文本没有当前项勾选");
  const translation = readFileSync("src/i18n/zh-ui.ts", "utf8");
  assertValue(translation.includes('"Body text": "普通文本"'), "正文项没有统一命名为普通文本");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
