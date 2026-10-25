/**
 * 内嵌 Markdown 帮助的接线、翻译和上下文入口。
 *
 * 帮助正文不维护独立文档包：英文原文在 `HelpWindow.tsx`，中文译文与其他
 * 界面共用 `zh-ui.ts`。Pandoc 缺失面板必须直接打开 Pandoc 章节。
 */

import { existsSync, readFileSync } from "node:fs";

import { HELP_SECTIONS, buildHelpMarkdown, helpSectionFromHash } from "../src/ui/HelpWindow";
import { MENUS, walkMenuItems } from "../src/ui/commands";

let pass = 0;
let fail = 0;

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

function contains(text4: string, slice: string, description: string): void {
  assertValue(text4.includes(slice), `${description}：缺少 ${JSON.stringify(slice)}`);
}

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const helpHelp = read("src/ui/HelpWindow.tsx");
const middleText = read("src/i18n/zh-ui.ts");

console.log("\n【内嵌 Markdown 帮助】");

testCase("帮助菜单提供 F1 入口，并由命令表实现", () => {
  const menuItem = [];
  walkMenuItems(MENUS, (item5) => menuItem.push(item5));
  const enterMouth = menuItem.find((item5) => item5.id === "help.help");
  assertValue(enterMouth, "菜单里没有 help.help");
  assertValue(enterMouth.accel === "F1", "帮助入口应使用 F1");
  const commandTable = read("src/ui/useCommandTable.ts");
  contains(commandTable, '"help.help": () => openHelp()', "help.help 处理函数");
});

testCase("菜单、IPC、Rust 命令和独立窗口入口已经连通", () => {
  const main = read("src/main.tsx");
  const ipc = read("src/bridge/ipc.ts");
  const rustWindow = read("src-tauri/src/commands/window.rs");
  const rustNoteBook = read("src-tauri/src/lib.rs");
  contains(main, "isHelpWindow", "main.tsx 的帮助窗口分支");
  contains(main, "<HelpWindow />", "HelpWindow 挂载");
  contains(ipc, 'invoke<void>("nota_window_open_help"', "前端 IPC");
  contains(rustWindow, "pub fn nota_window_open_help", "Rust 命令");
  contains(rustWindow, 'WebviewUrl::App(format!("index.html{hash}").into())', "内部窗口地址");
  contains(rustNoteBook, "commands::window::nota_window_open_help", "命令注册");
});

testCase("帮助正文直接编入应用，并复用正文 Markdown 渲染器", () => {
  assertValue(!existsSync(`${root}/public/help`), "仍存在独立的 public/help 文档目录");
  contains(helpHelp, "createEditor({", "复用 Milkdown 创建页面");
  contains(helpHelp, "readOnly: true", "帮助实例应为只读");
  contains(helpHelp, "applyDocTheme(css)", "应用当前文档主题");
  contains(helpHelp, "DocumentTypographyVars(settings?.document)", "应用文档排版变量");
  contains(helpHelp, "Interface themes change the application.", "界面主题与文档主题的区别");
  for (const key of [
    "Use File to create, open, and save documents.",
    "Pandoc is not bundled with Nota.",
    "On Linux, Nota connects directly to CUPS",
  ]) {
    contains(helpHelp, key, "帮助正文");
  }
});

testCase("内置 Markdown 是四个必要章节，地址只能落到白名单", () => {
  assertValue(HELP_SECTIONS.length === 4, `帮助章节应为 4 个，实际 ${HELP_SECTIONS.length}`);
  const markdown = buildHelpMarkdown((text) => text);
  contains(markdown, "## Getting started", "开始使用章节");
  contains(markdown, "## Pandoc and TeX", "Pandoc 章节");
  contains(markdown, "## Printing", "打印章节");
  contains(markdown, "## Keyboard shortcuts", "快捷键章节");
  contains(markdown, "| Action | Shortcut |", "Markdown 表格");
  contains(markdown, "```text", "Markdown 代码块");
  for (const id of HELP_SECTIONS) {
    assertValue(helpSectionFromHash(`#help/${id}`) === id, `#help/${id} 解析失败`);
  }
  assertValue(helpSectionFromHash("#help/../../../etc") === "start", "未知章节应回落到首页");
});

testCase("中文译文与界面国际化共用同一张表", () => {
  for (const key of [
    "Nota Help",
    "Essential guidance for writing, export, printing, and common problems.",
    "Getting started",
    "Pandoc and TeX",
    "Printing",
    "Keyboard shortcuts",
    "Action",
    "Shortcut",
    "Open installation help",
  ]) {
    contains(middleText, `"${key}"`, "中文翻译键");
  }
});

testCase("Pandoc 缺失面板直接打开对应帮助章节", () => {
  const exportSource = read("src/ui/useExport.ts");
  const panel = read("src/ui/PandocPanel.tsx");
  contains(exportSource, 'api.window.openHelp("pandoc")', "Pandoc 上下文帮助");
  contains(panel, 't("Open installation help")', "安装帮助按钮");
  assertValue(!exportSource.includes("PANDOC_GUIDE"), "旧的官网指南外链仍在");
  assertValue(!/Slidev/i.test(helpHelp), "核心帮助不应包含 Slidev 专用说明");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
